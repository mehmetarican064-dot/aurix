-- AURIX 013 — Profesyonel admin paneli (production uyumlu)
-- Admin: profiles.role ('user'|'admin') — eski profiles.rol KULLANILMAZ.
-- Firma onay: firmalar.durum + dogrulanmis (onay_durumu uydurulmaz).
-- SQL Editor’de bir kez çalıştırın (idempotent). Otomatik çalıştırılmaz.

-- ============================================================
-- 0. Yardımcı + profiles.role
-- ============================================================
CREATE OR REPLACE FUNCTION public._aurix_col_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = p_table
          AND column_name = p_column
    );
$$;

DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'public.profiles yok. Önce profiles migrasyonunu uygulayın.';
    END IF;
END $$;

-- Production şeması: role (user|admin). Eski rol varsa veri aktarılıp kaldırılır.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE public.profiles
SET role = CASE
    WHEN lower(btrim(COALESCE(role::text, ''))) = 'admin' THEN 'admin'
    ELSE 'user'
END;

ALTER TABLE public.profiles
    ALTER COLUMN role SET DEFAULT 'user';

ALTER TABLE public.profiles
    ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
    IF public._aurix_col_exists('profiles', 'rol') THEN
        EXECUTE $q$
            UPDATE public.profiles
            SET role = CASE
                WHEN lower(btrim(rol::text)) = 'admin' THEN 'admin'
                ELSE 'user'
            END
        $q$;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_rol_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_rol_check;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_role_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        NULL;
    ELSE
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_role_check
            CHECK (role IN ('user', 'admin'));
    END IF;
END $$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS rol;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS hesap_tipi TEXT NOT NULL DEFAULT 'normal';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_hesap_tipi_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_hesap_tipi_check
            CHECK (hesap_tipi IN ('normal', 'firma'));
    END IF;
END $$;

DO $$
BEGIN
    BEGIN
        GRANT SELECT (role, hesap_tipi) ON TABLE public.profiles TO authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        REVOKE UPDATE (role) ON TABLE public.profiles FROM authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Auth trigger / ensure: role kullan (rol yok)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, ad_soyad, telefon, role, hesap_tipi)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'ad_soyad',
            NEW.raw_user_meta_data->>'full_name',
            ''
        ),
        COALESCE(NEW.raw_user_meta_data->>'telefon', NULL),
        'user',
        'normal'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_own_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    meta jsonb;
    sonuc public.profiles;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT raw_user_meta_data INTO meta
    FROM auth.users
    WHERE id = uid;

    INSERT INTO public.profiles (id, ad_soyad, telefon, role, hesap_tipi)
    VALUES (
        uid,
        COALESCE(meta->>'ad_soyad', meta->>'full_name', ''),
        COALESCE(meta->>'telefon', NULL),
        'user',
        'normal'
    )
    ON CONFLICT (id) DO UPDATE
        SET ad_soyad = CASE
                WHEN public.profiles.ad_soyad IS NULL
                  OR btrim(public.profiles.ad_soyad) = ''
                THEN EXCLUDED.ad_soyad
                ELSE public.profiles.ad_soyad
            END,
            telefon = COALESCE(public.profiles.telefon, EXCLUDED.telefon)
    RETURNING * INTO sonuc;

    RETURN sonuc;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_own_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_own_profile() TO authenticated;

-- ============================================================
-- 1. firmalar moderasyon alanları (durum korunur)
-- ============================================================
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS onaylayan_admin UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS onay_tarihi TIMESTAMPTZ;
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS red_nedeni TEXT;
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS askiya_alindi BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS askiya_alma_nedeni TEXT;

-- ============================================================
-- 2. profiles askı alanları
-- ============================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS askiya_alindi BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS askiya_alma_nedeni TEXT;

-- Kullanıcı kendi askı alanlarını değiştiremesin (grant yok)
DO $$
BEGIN
    BEGIN
        GRANT SELECT (askiya_alindi, askiya_alma_nedeni) ON TABLE public.profiles TO authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- ============================================================
-- 3. is_talepleri moderasyon
-- ============================================================
ALTER TABLE public.is_talepleri
    ADD COLUMN IF NOT EXISTS moderasyon_durumu TEXT NOT NULL DEFAULT 'aktif';
ALTER TABLE public.is_talepleri
    ADD COLUMN IF NOT EXISTS moderasyon_notu TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_moderasyon_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_moderasyon_check
            CHECK (moderasyon_durumu IN ('aktif', 'incelemede', 'kaldirildi'));
    END IF;
END $$;

-- ============================================================
-- 4. teklifler gizleme
-- ============================================================
ALTER TABLE public.teklifler
    ADD COLUMN IF NOT EXISTS gizli BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 5. admin_islem_kayitlari
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_islem_kayitlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
    islem_tipi TEXT NOT NULL,
    hedef_turu TEXT NOT NULL,
    hedef_id UUID,
    aciklama TEXT,
    eski_deger JSONB,
    yeni_deger JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_islem_kayitlari_created
    ON public.admin_islem_kayitlari (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_islem_kayitlari_hedef
    ON public.admin_islem_kayitlari (hedef_turu, hedef_id);

ALTER TABLE public.admin_islem_kayitlari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_islem_select_admin" ON public.admin_islem_kayitlari;
CREATE POLICY "admin_islem_select_admin"
    ON public.admin_islem_kayitlari
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

REVOKE ALL ON TABLE public.admin_islem_kayitlari FROM anon, authenticated;
GRANT SELECT ON TABLE public.admin_islem_kayitlari TO authenticated;
-- INSERT yalnızca SECURITY DEFINER fonksiyonlardan

CREATE OR REPLACE FUNCTION public._admin_log(
    p_islem text,
    p_hedef_turu text,
    p_hedef_id uuid,
    p_aciklama text,
    p_eski jsonb DEFAULT NULL,
    p_yeni jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.admin_islem_kayitlari (
        admin_id, islem_tipi, hedef_turu, hedef_id, aciklama, eski_deger, yeni_deger
    ) VALUES (
        auth.uid(), p_islem, p_hedef_turu, p_hedef_id, p_aciklama, p_eski, p_yeni
    );
END;
$$;

-- ============================================================
-- 6. Public firma SELECT: askıdaki firmalar görünmesin
-- ============================================================
DROP POLICY IF EXISTS "firmalar_public_select" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_select_dogrulanmis" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_public_read_approved" ON public.firmalar;

DO $$
DECLARE
    has_is_seed boolean;
    using_expr text;
BEGIN
    has_is_seed := public._aurix_col_exists('firmalar', 'is_seed');
    using_expr :=
        'dogrulanmis IS TRUE AND durum = ''onaylandi'' AND COALESCE(askiya_alindi, FALSE) IS FALSE';
    IF has_is_seed THEN
        using_expr := using_expr || ' AND COALESCE(is_seed, FALSE) IS FALSE';
    END IF;
    EXECUTE format(
        'CREATE POLICY "firmalar_public_select"
            ON public.firmalar
            FOR SELECT
            TO anon, authenticated
            USING (%s)',
        using_expr
    );
END $$;

-- ============================================================
-- 7. Admin RPC: özet
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_ozet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    r jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'toplam_kullanici', (SELECT COUNT(*)::int FROM public.profiles),
        'toplam_firma', (SELECT COUNT(*)::int FROM public.firmalar),
        'bekleyen_firma', (SELECT COUNT(*)::int FROM public.firmalar WHERE durum = 'beklemede'),
        'onayli_firma', (SELECT COUNT(*)::int FROM public.firmalar WHERE durum = 'onaylandi' AND COALESCE(askiya_alindi, FALSE) IS FALSE),
        'acik_is', (SELECT COUNT(*)::int FROM public.is_talepleri WHERE durum = 'Acik' AND COALESCE(moderasyon_durumu, 'aktif') = 'aktif'),
        'toplam_teklif', (SELECT COUNT(*)::int FROM public.teklifler),
        'kullanici_7g', (SELECT COUNT(*)::int FROM public.profiles WHERE created_at >= NOW() - INTERVAL '7 days'),
        'is_7g', (SELECT COUNT(*)::int FROM public.is_talepleri WHERE created_at >= NOW() - INTERVAL '7 days')
    ) INTO r;

    RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ozet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ozet() TO authenticated;

-- ============================================================
-- 8. Admin RPC: firma listesi
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_firma_listesi(p_filtre text DEFAULT 'hepsi')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
    filtre text := lower(btrim(COALESCE(p_filtre, 'hepsi')));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            f.id, f.firma_adi, f.sehir, f.kategori, f.aciklama,
            f.telefon, f.email, f.durum, f.dogrulanmis,
            f.logo_url, f.user_id, f.created_at,
            f.onaylayan_admin, f.onay_tarihi, f.red_nedeni,
            COALESCE(f.askiya_alindi, FALSE) AS askiya_alindi,
            f.askiya_alma_nedeni,
            p.ad_soyad AS yetkili_ad,
            p.hesap_tipi
        FROM public.firmalar f
        LEFT JOIN public.profiles p ON p.id = f.user_id
        WHERE
            CASE filtre
                WHEN 'beklemede' THEN f.durum = 'beklemede' AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                WHEN 'onaylandi' THEN f.durum = 'onaylandi' AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                WHEN 'reddedildi' THEN f.durum = 'reddedildi'
                WHEN 'aski' THEN COALESCE(f.askiya_alindi, FALSE) IS TRUE
                ELSE TRUE
            END
    ) x;

    RETURN rows;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_firma_listesi(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_listesi(text) TO authenticated;

-- ============================================================
-- 9. Firma onay / red / askı
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_firma_onayla(p_firma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO eski FROM public.firmalar WHERE id = p_firma_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        durum = 'onaylandi',
        dogrulanmis = TRUE,
        onaylayan_admin = auth.uid(),
        onay_tarihi = NOW(),
        red_nedeni = NULL,
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL
    WHERE id = p_firma_id;

    PERFORM public._admin_log(
        'firma_onayla', 'firma', p_firma_id,
        'Firma onaylandı',
        jsonb_build_object('durum', eski.durum, 'dogrulanmis', eski.dogrulanmis),
        jsonb_build_object('durum', 'onaylandi', 'dogrulanmis', true)
    );

    RETURN jsonb_build_object('ok', true, 'id', p_firma_id, 'durum', 'onaylandi');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_firma_reddet(p_firma_id uuid, p_neden text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
    neden text := btrim(COALESCE(p_neden, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(neden) < 3 THEN
        RAISE EXCEPTION 'red_nedeni_zorunlu' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO eski FROM public.firmalar WHERE id = p_firma_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        durum = 'reddedildi',
        dogrulanmis = FALSE,
        red_nedeni = neden,
        onay_tarihi = NULL
    WHERE id = p_firma_id;

    PERFORM public._admin_log(
        'firma_reddet', 'firma', p_firma_id, neden,
        jsonb_build_object('durum', eski.durum),
        jsonb_build_object('durum', 'reddedildi', 'red_nedeni', neden)
    );

    RETURN jsonb_build_object('ok', true, 'id', p_firma_id, 'durum', 'reddedildi');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_firma_askiya_al(p_firma_id uuid, p_neden text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
    neden text := btrim(COALESCE(p_neden, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(neden) < 3 THEN
        RAISE EXCEPTION 'aski_nedeni_zorunlu' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO eski FROM public.firmalar WHERE id = p_firma_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        askiya_alindi = TRUE,
        askiya_alma_nedeni = neden
    WHERE id = p_firma_id;

    PERFORM public._admin_log(
        'firma_askiya_al', 'firma', p_firma_id, neden,
        jsonb_build_object('askiya_alindi', eski.askiya_alindi),
        jsonb_build_object('askiya_alindi', true, 'neden', neden)
    );

    RETURN jsonb_build_object('ok', true, 'id', p_firma_id, 'askiya_alindi', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_firma_aski_kaldir(p_firma_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO eski FROM public.firmalar WHERE id = p_firma_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL
    WHERE id = p_firma_id;

    PERFORM public._admin_log(
        'firma_aski_kaldir', 'firma', p_firma_id, 'Askı kaldırıldı',
        jsonb_build_object('askiya_alindi', eski.askiya_alindi),
        jsonb_build_object('askiya_alindi', false)
    );

    RETURN jsonb_build_object('ok', true, 'id', p_firma_id, 'askiya_alindi', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_firma_onayla(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_reddet(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_askiya_al(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_aski_kaldir(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_onayla(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_reddet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_askiya_al(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_aski_kaldir(uuid) TO authenticated;

-- ============================================================
-- 10. Kullanıcı listesi + askı
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_kullanici_listesi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            p.id,
            p.ad_soyad,
            p.telefon,
            p.role,
            p.hesap_tipi,
            p.created_at,
            COALESCE(p.askiya_alindi, FALSE) AS askiya_alindi,
            p.askiya_alma_nedeni,
            u.email,
            u.email_confirmed_at,
            u.last_sign_in_at,
            EXISTS (
                SELECT 1 FROM public.firmalar f WHERE f.user_id = p.id
            ) AS firma_var
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
    ) x;

    RETURN rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_kullanici_askiya_al(p_user_id uuid, p_neden text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    neden text := btrim(COALESCE(p_neden, ''));
    hedef_role text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(neden) < 3 THEN
        RAISE EXCEPTION 'aski_nedeni_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'kendini_askiya_alamazsin' USING ERRCODE = '22023';
    END IF;
    SELECT role INTO hedef_role FROM public.profiles WHERE id = p_user_id;
    IF hedef_role IS NULL THEN
        RAISE EXCEPTION 'kullanici_yok' USING ERRCODE = 'P0002';
    END IF;
    IF hedef_role = 'admin' THEN
        RAISE EXCEPTION 'admin_askiya_alinamaz' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles SET
        askiya_alindi = TRUE,
        askiya_alma_nedeni = neden
    WHERE id = p_user_id;

    PERFORM public._admin_log(
        'kullanici_askiya_al', 'kullanici', p_user_id, neden,
        NULL, jsonb_build_object('askiya_alindi', true)
    );

    RETURN jsonb_build_object('ok', true, 'id', p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_kullanici_aski_kaldir(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles SET
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL
    WHERE id = p_user_id;

    PERFORM public._admin_log(
        'kullanici_aski_kaldir', 'kullanici', p_user_id, 'Askı kaldırıldı',
        NULL, jsonb_build_object('askiya_alindi', false)
    );

    RETURN jsonb_build_object('ok', true, 'id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_kullanici_listesi() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_kullanici_askiya_al(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_kullanici_aski_kaldir(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_kullanici_listesi() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kullanici_askiya_al(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kullanici_aski_kaldir(uuid) TO authenticated;

-- ============================================================
-- 11. İş talepleri moderasyon
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_is_listesi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            i.id, i.baslik, i.kategori, i.sehir, i.durum, i.created_at,
            COALESCE(i.moderasyon_durumu, 'aktif') AS moderasyon_durumu,
            i.moderasyon_notu,
            i.owner_id,
            p.ad_soyad AS olusturan_ad,
            (SELECT COUNT(*)::int FROM public.teklifler t WHERE t.is_id = i.id) AS teklif_sayisi
        FROM public.is_talepleri i
        LEFT JOIN public.profiles p ON p.id = i.owner_id
    ) x;

    RETURN rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_is_moderasyon(
    p_is_id uuid,
    p_durum text,
    p_not text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    d text := lower(btrim(COALESCE(p_durum, '')));
    eski text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF d NOT IN ('aktif', 'incelemede', 'kaldirildi') THEN
        RAISE EXCEPTION 'gecersiz_moderasyon' USING ERRCODE = '22023';
    END IF;
    IF d = 'kaldirildi' AND length(btrim(COALESCE(p_not, ''))) < 3 THEN
        RAISE EXCEPTION 'kaldirma_nedeni_zorunlu' USING ERRCODE = '22023';
    END IF;

    SELECT moderasyon_durumu INTO eski FROM public.is_talepleri WHERE id = p_is_id;
    IF eski IS NULL AND NOT EXISTS (SELECT 1 FROM public.is_talepleri WHERE id = p_is_id) THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.is_talepleri SET
        moderasyon_durumu = d,
        moderasyon_notu = CASE WHEN d = 'aktif' THEN NULL ELSE btrim(p_not) END
    WHERE id = p_is_id;

    PERFORM public._admin_log(
        'is_moderasyon', 'is_talebi', p_is_id, COALESCE(p_not, d),
        jsonb_build_object('moderasyon_durumu', eski),
        jsonb_build_object('moderasyon_durumu', d)
    );

    RETURN jsonb_build_object('ok', true, 'id', p_is_id, 'moderasyon_durumu', d);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_is_listesi() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_is_moderasyon(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_is_listesi() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_is_moderasyon(uuid, text, text) TO authenticated;

-- Açık iş listesi: kaldırılmışları gizle (public)
DROP POLICY IF EXISTS "is_talepleri_public_select" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_anon_select_acik" ON public.is_talepleri;

DO $$
DECLARE
    has_is_seed boolean;
    using_expr text;
BEGIN
    has_is_seed := public._aurix_col_exists('is_talepleri', 'is_seed');
    using_expr :=
        'durum = ''Acik'' AND COALESCE(moderasyon_durumu, ''aktif'') = ''aktif''';
    IF has_is_seed THEN
        using_expr := using_expr || ' AND COALESCE(is_seed, FALSE) IS FALSE';
    END IF;
    EXECUTE format(
        'CREATE POLICY "is_talepleri_public_select"
            ON public.is_talepleri
            FOR SELECT
            TO anon, authenticated
            USING (%s)',
        using_expr
    );
END $$;

-- ============================================================
-- 12. Teklifler admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_teklif_listesi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            t.id, t.is_id, t.firma_id, t.fiyat, t.termin_gun, t.created_at,
            COALESCE(t.gizli, FALSE) AS gizli,
            i.baslik AS is_baslik,
            f.firma_adi
        FROM public.teklifler t
        LEFT JOIN public.is_talepleri i ON i.id = t.is_id
        LEFT JOIN public.firmalar f ON f.id = t.firma_id
    ) x;

    RETURN rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_teklif_gizle(p_teklif_id uuid, p_gizli boolean, p_aciklama text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    UPDATE public.teklifler SET gizli = COALESCE(p_gizli, TRUE) WHERE id = p_teklif_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'teklif_yok' USING ERRCODE = 'P0002';
    END IF;

    PERFORM public._admin_log(
        CASE WHEN COALESCE(p_gizli, TRUE) THEN 'teklif_gizle' ELSE 'teklif_ac' END,
        'teklif', p_teklif_id, COALESCE(p_aciklama, ''),
        NULL, jsonb_build_object('gizli', COALESCE(p_gizli, TRUE))
    );

    RETURN jsonb_build_object('ok', true, 'id', p_teklif_id, 'gizli', COALESCE(p_gizli, TRUE));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_teklif_listesi() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_teklif_gizle(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_teklif_listesi() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_teklif_gizle(uuid, boolean, text) TO authenticated;

-- Teklif INSERT: askıdaki / onaylı olmayan firma teklif veremesin
DROP POLICY IF EXISTS "teklifler_auth_insert_owner" ON public.teklifler;

DO $$
DECLARE
    has_user_id boolean;
    has_owner_id boolean;
    has_is_seed_f boolean;
    has_is_seed_i boolean;
    firma_ok text;
    is_ok text;
    check_expr text;
BEGIN
    has_user_id := public._aurix_col_exists('firmalar', 'user_id');
    has_owner_id := public._aurix_col_exists('firmalar', 'owner_id');
    has_is_seed_f := public._aurix_col_exists('firmalar', 'is_seed');
    has_is_seed_i := public._aurix_col_exists('is_talepleri', 'is_seed');

    IF has_user_id AND has_owner_id THEN
        firma_ok := '(f.user_id = auth.uid() OR f.owner_id = auth.uid())';
    ELSIF has_user_id THEN
        firma_ok := 'f.user_id = auth.uid()';
    ELSE
        firma_ok := 'f.owner_id = auth.uid()';
    END IF;

    firma_ok := firma_ok ||
        ' AND f.dogrulanmis IS TRUE AND f.durum = ''onaylandi''' ||
        ' AND COALESCE(f.askiya_alindi, FALSE) IS FALSE';
    IF has_is_seed_f THEN
        firma_ok := firma_ok || ' AND COALESCE(f.is_seed, FALSE) IS FALSE';
    END IF;

    is_ok := 'i.durum = ''Acik'' AND COALESCE(i.moderasyon_durumu, ''aktif'') = ''aktif''';
    IF has_is_seed_i THEN
        is_ok := is_ok || ' AND COALESCE(i.is_seed, FALSE) IS FALSE';
    END IF;

    check_expr := format(
        'fiyat > 0 AND termin_gun > 0
         AND EXISTS (SELECT 1 FROM public.firmalar f WHERE f.id = firma_id AND %s)
         AND EXISTS (SELECT 1 FROM public.is_talepleri i WHERE i.id = is_id AND %s)',
        firma_ok, is_ok
    );

    EXECUTE format(
        'CREATE POLICY "teklifler_auth_insert_owner"
            ON public.teklifler FOR INSERT TO authenticated
            WITH CHECK (%s)',
        check_expr
    );
END $$;

-- ============================================================
-- 13. İşlem kayıtları listesi
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_islem_listesi(p_hedef_turu text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            k.id, k.admin_id, k.islem_tipi, k.hedef_turu, k.hedef_id,
            k.aciklama, k.eski_deger, k.yeni_deger, k.created_at,
            p.ad_soyad AS admin_ad
        FROM public.admin_islem_kayitlari k
        LEFT JOIN public.profiles p ON p.id = k.admin_id
        WHERE p_hedef_turu IS NULL OR btrim(p_hedef_turu) = '' OR k.hedef_turu = p_hedef_turu
        LIMIT 500
    ) x;

    RETURN rows;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_islem_listesi(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_islem_listesi(text) TO authenticated;

-- ============================================================
-- 14. Son kayıtlar (özet alt listeler)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_son_kayitlar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'kullanicilar', (
            SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
                SELECT p.id, p.ad_soyad, p.hesap_tipi, p.created_at, u.email
                FROM public.profiles p
                LEFT JOIN auth.users u ON u.id = p.id
                ORDER BY p.created_at DESC
                LIMIT 8
            ) x
        ),
        'bekleyen_firmalar', (
            SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
                SELECT f.id, f.firma_adi, f.sehir, f.kategori, f.created_at, p.ad_soyad AS yetkili_ad
                FROM public.firmalar f
                LEFT JOIN public.profiles p ON p.id = f.user_id
                WHERE f.durum = 'beklemede' AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                ORDER BY f.created_at DESC
                LIMIT 8
            ) x
        ),
        'isler', (
            SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
                SELECT i.id, i.baslik, i.kategori, i.durum, i.created_at, p.ad_soyad AS olusturan_ad
                FROM public.is_talepleri i
                LEFT JOIN public.profiles p ON p.id = i.owner_id
                ORDER BY i.created_at DESC
                LIMIT 8
            ) x
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_son_kayitlar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_son_kayitlar() TO authenticated;

-- firmalar SELECT grant (yeni sütunlar)
DO $$
DECLARE
    wanted text[] := ARRAY[
        'id', 'firma_adi', 'sehir', 'kategori', 'aciklama',
        'telefon', 'email', 'dogrulanmis', 'durum', 'created_at', 'user_id',
        'logo_url', 'kapak_url', 'calisma_gorselleri',
        'onaylayan_admin', 'onay_tarihi', 'red_nedeni',
        'askiya_alindi', 'askiya_alma_nedeni'
    ];
    cols text[];
    grant_list text := '';
    col text;
BEGIN
    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'firmalar'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname = ANY (wanted);
    IF cols IS NULL THEN RETURN; END IF;
    FOREACH col IN ARRAY cols LOOP
        IF grant_list <> '' THEN grant_list := grant_list || ', '; END IF;
        grant_list := grant_list || quote_ident(col);
    END LOOP;
    BEGIN
        EXECUTE format('GRANT SELECT (%s) ON TABLE public.firmalar TO authenticated', grant_list);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- ============================================================
-- 15. Reddedilen firmanın yeniden başvurusu (sahip)
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_yeniden_basvur()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    fid uuid;
    eski_durum text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id, durum INTO fid, eski_durum
    FROM public.firmalar
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF fid IS NULL THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;
    IF eski_durum IS DISTINCT FROM 'reddedildi' THEN
        RAISE EXCEPTION 'yeniden_basvuru_uygun_degil' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.firmalar
        WHERE id = fid AND COALESCE(askiya_alindi, FALSE) IS TRUE
    ) THEN
        RAISE EXCEPTION 'aski_yeniden_basvuru_yok' USING ERRCODE = '42501';
    END IF;

    UPDATE public.firmalar SET
        durum = 'beklemede',
        dogrulanmis = FALSE,
        red_nedeni = NULL,
        onaylayan_admin = NULL,
        onay_tarihi = NULL
    WHERE id = fid;

    RETURN jsonb_build_object('ok', true, 'id', fid, 'durum', 'beklemede');
END;
$$;

REVOKE ALL ON FUNCTION public.firma_yeniden_basvur() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_yeniden_basvur() TO authenticated;

-- profiles.role / askı alanları kullanıcı tarafından güncellenemez
DO $$
BEGIN
    BEGIN
        REVOKE UPDATE (role) ON TABLE public.profiles FROM authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        REVOKE UPDATE (askiya_alindi, askiya_alma_nedeni) ON TABLE public.profiles FROM authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

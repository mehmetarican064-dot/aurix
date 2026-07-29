-- AURIX 039 — Firma başvuru / belge / onay akışı
-- Idempotent. DROP TABLE / TRUNCATE / kontrolsüz DELETE yok.
--
-- Hedef:
-- 1) firmalar.durum: taslak | basvuru_bekliyor | inceleniyor | ek_belge_gerekli
--                    | onaylandi | reddedildi | askiya_alindi
-- 2) profiles.hesap_tipi: bireysel | firma (normal geriye uyumlu)
-- 3) Private firma-belgeler bucket (PDF/JPG/JPEG/PNG, 10 MB)
-- 4) Başvuru belgesi tablosu + signed URL RPC
-- 5) Admin: listesi filtreleri, ek belge iste, detay + belgeler
-- 6) firma_dogrulama_belge_kaydet jsonb overload düzeltmesi
--
-- Bu dosya ile supabase/maintenance/apply_039_firma_basvuru_onay_akisi.sql aynıdır.

-- ============================================================
-- 1. Kolon güvencesi
-- ============================================================
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS ek_belge_notu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS yetkili_ad TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS ilce TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS adres TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_dairesi TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_no TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS hizmet_kategorileri JSONB;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS yayin_durumu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS askiya_alindi BOOLEAN DEFAULT FALSE;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS askiya_alma_nedeni TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS red_nedeni TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.firmalar.ek_belge_notu IS
    'Admin ek belge isterken kullanıcıya gösterilen gerekçe.';

-- ============================================================
-- 2. firmalar.durum normalize + CHECK
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'firmalar_durum_check'
          AND conrelid = 'public.firmalar'::regclass
    ) THEN
        ALTER TABLE public.firmalar DROP CONSTRAINT firmalar_durum_check;
    END IF;
END $$;

-- Eski değerleri hedefe map et (yalnız bilinen eski set)
UPDATE public.firmalar
SET durum = CASE
    WHEN COALESCE(askiya_alindi, FALSE) IS TRUE THEN 'askiya_alindi'
    WHEN durum IN ('beklemede', 'Beklemede', 'Acik', 'acik') THEN 'basvuru_bekliyor'
    WHEN durum IN ('incelemede', 'inceleniyor') THEN 'inceleniyor'
    WHEN durum IN ('ek_belge', 'ek_belge_gerekli') THEN 'ek_belge_gerekli'
    WHEN durum IN ('taslak') THEN 'taslak'
    WHEN durum IN ('onaylandi', 'Onaylandi') THEN 'onaylandi'
    WHEN durum IN ('reddedildi', 'Reddedildi') THEN 'reddedildi'
    WHEN durum IN ('askiya_alindi') THEN 'askiya_alindi'
    WHEN dogrulanmis IS TRUE THEN 'onaylandi'
    ELSE 'basvuru_bekliyor'
END
WHERE durum IS NULL
   OR btrim(durum) = ''
   OR durum NOT IN (
        'taslak', 'basvuru_bekliyor', 'inceleniyor', 'ek_belge_gerekli',
        'onaylandi', 'reddedildi', 'askiya_alindi'
   );

UPDATE public.firmalar
SET dogrulanmis = TRUE
WHERE durum = 'onaylandi' AND dogrulanmis IS DISTINCT FROM TRUE;

UPDATE public.firmalar
SET dogrulanmis = FALSE
WHERE durum IN ('taslak', 'basvuru_bekliyor', 'inceleniyor', 'ek_belge_gerekli', 'reddedildi')
  AND dogrulanmis IS DISTINCT FROM FALSE;

UPDATE public.firmalar
SET askiya_alindi = TRUE
WHERE durum = 'askiya_alindi' AND COALESCE(askiya_alindi, FALSE) IS FALSE;

UPDATE public.firmalar
SET yayin_durumu = CASE
    WHEN durum = 'onaylandi' AND COALESCE(askiya_alindi, FALSE) IS FALSE THEN 'yayinda'
    WHEN durum IN ('basvuru_bekliyor', 'inceleniyor', 'ek_belge_gerekli') THEN 'incelemede'
    ELSE COALESCE(NULLIF(btrim(yayin_durumu), ''), 'taslak')
END
WHERE yayin_durumu IS NULL
   OR (durum = 'onaylandi' AND COALESCE(askiya_alindi, FALSE) IS FALSE AND yayin_durumu IS DISTINCT FROM 'yayinda')
   OR (durum IN ('basvuru_bekliyor', 'inceleniyor', 'ek_belge_gerekli') AND yayin_durumu IS DISTINCT FROM 'incelemede');

ALTER TABLE public.firmalar ALTER COLUMN durum SET DEFAULT 'basvuru_bekliyor';

DO $$
BEGIN
    ALTER TABLE public.firmalar
        ADD CONSTRAINT firmalar_durum_check
        CHECK (durum IN (
            'taslak',
            'basvuru_bekliyor',
            'inceleniyor',
            'ek_belge_gerekli',
            'onaylandi',
            'reddedildi',
            'askiya_alindi'
        ));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. Durum ↔ dogrulanmis / aski senkron trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.firmalar_durum_dogrulanmis_senkron()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NEW.durum = 'onaylandi' THEN
        NEW.dogrulanmis := TRUE;
        NEW.askiya_alindi := FALSE;
    ELSIF NEW.durum = 'askiya_alindi' THEN
        NEW.askiya_alindi := TRUE;
        /* Önceki onay rozeti korunabilir; vitrin RLS aski ile engeller */
    ELSIF NEW.durum IN (
        'taslak', 'basvuru_bekliyor', 'inceleniyor', 'ek_belge_gerekli', 'reddedildi'
    ) THEN
        NEW.dogrulanmis := FALSE;
        IF NEW.durum <> 'askiya_alindi' THEN
            NEW.askiya_alindi := COALESCE(NEW.askiya_alindi, FALSE);
        END IF;
    END IF;

    /* dogrulanmis true iken durum onay dışıysa yalnızca onaylandi'ye zorla
       (askı ayrı boolean/durum ile yönetilir) */
    IF NEW.dogrulanmis IS TRUE
       AND NEW.durum IS DISTINCT FROM 'onaylandi'
       AND NEW.durum IS DISTINCT FROM 'askiya_alindi' THEN
        NEW.durum := 'onaylandi';
        NEW.askiya_alindi := FALSE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firmalar_durum_senkron ON public.firmalar;
CREATE TRIGGER trg_firmalar_durum_senkron
    BEFORE INSERT OR UPDATE OF durum, dogrulanmis, askiya_alindi
    ON public.firmalar
    FOR EACH ROW
    EXECUTE FUNCTION public.firmalar_durum_dogrulanmis_senkron();

-- ============================================================
-- 4. profiles.hesap_tipi — bireysel + normal (uyumluluk)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_hesap_tipi_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_hesap_tipi_check;
    END IF;
END $$;

UPDATE public.profiles
SET hesap_tipi = 'bireysel'
WHERE hesap_tipi IS NULL OR btrim(hesap_tipi) = '' OR hesap_tipi = 'normal';

DO $$
BEGIN
    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_hesap_tipi_check
        CHECK (hesap_tipi IN ('bireysel', 'firma', 'normal'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles ALTER COLUMN hesap_tipi SET DEFAULT 'bireysel';

CREATE OR REPLACE FUNCTION public.sync_profil_hesap_tipi_firma()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET hesap_tipi = 'firma'
        WHERE id = NEW.user_id
          AND COALESCE(hesap_tipi, 'bireysel') <> 'firma';
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 5. Başvuru belgeleri (private bucket meta)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.firma_basvuru_belgeleri (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firma_id text NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    belge_turu text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    dosya_boyutu bigint,
    orijinal_ad text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT firma_basvuru_belgeleri_tur_check
        CHECK (belge_turu IN ('vergi_levhasi', 'oda_belgesi')),
    CONSTRAINT firma_basvuru_belgeleri_mime_check
        CHECK (
            mime_type IS NULL
            OR mime_type IN (
                'application/pdf',
                'image/jpeg',
                'image/png'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_firma_basvuru_belgeleri_firma
    ON public.firma_basvuru_belgeleri (firma_id);
CREATE INDEX IF NOT EXISTS idx_firma_basvuru_belgeleri_user
    ON public.firma_basvuru_belgeleri (user_id);

ALTER TABLE public.firma_basvuru_belgeleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fbb_select_own ON public.firma_basvuru_belgeleri;
CREATE POLICY fbb_select_own ON public.firma_basvuru_belgeleri
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS fbb_insert_own ON public.firma_basvuru_belgeleri;
CREATE POLICY fbb_insert_own ON public.firma_basvuru_belgeleri
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.firmalar f
            WHERE f.id::text = firma_id AND f.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS fbb_delete_own ON public.firma_basvuru_belgeleri;
CREATE POLICY fbb_delete_own ON public.firma_basvuru_belgeleri
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

REVOKE ALL ON TABLE public.firma_basvuru_belgeleri FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE public.firma_basvuru_belgeleri TO authenticated;

-- ============================================================
-- 6. Private bucket: firma-belgeler (PDF/JPG/PNG, 10MB)
-- ============================================================
DO $$
BEGIN
    IF to_regclass('storage.buckets') IS NULL THEN
        RAISE NOTICE '[039] storage.buckets yok; bucket atlandı.';
        RETURN;
    END IF;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'firma-belgeler',
        'firma-belgeler',
        false,
        10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
        public = false,
        file_size_limit = 10485760,
        allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[];

    RAISE NOTICE '[039] firma-belgeler bucket private / 10MB / pdf+jpeg+png.';
EXCEPTION WHEN others THEN
    RAISE NOTICE '[039] firma-belgeler bucket: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RETURN;
    END IF;

    DROP POLICY IF EXISTS "firma_belgeler_owner_insert" ON storage.objects;
    CREATE POLICY "firma_belgeler_owner_insert"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'firma-belgeler'
            AND (storage.foldername(name))[1] = auth.uid()::text
            AND lower(COALESCE(storage.extension(name), '')) IN ('pdf', 'jpg', 'jpeg', 'png')
        );

    DROP POLICY IF EXISTS "firma_belgeler_owner_select" ON storage.objects;
    CREATE POLICY "firma_belgeler_owner_select"
        ON storage.objects FOR SELECT TO authenticated
        USING (
            bucket_id = 'firma-belgeler'
            AND (
                (storage.foldername(name))[1] = auth.uid()::text
                OR public.is_admin()
            )
        );

    DROP POLICY IF EXISTS "firma_belgeler_owner_update" ON storage.objects;
    CREATE POLICY "firma_belgeler_owner_update"
        ON storage.objects FOR UPDATE TO authenticated
        USING (
            bucket_id = 'firma-belgeler'
            AND (storage.foldername(name))[1] = auth.uid()::text
        )
        WITH CHECK (
            bucket_id = 'firma-belgeler'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );

    DROP POLICY IF EXISTS "firma_belgeler_owner_delete" ON storage.objects;
    CREATE POLICY "firma_belgeler_owner_delete"
        ON storage.objects FOR DELETE TO authenticated
        USING (
            bucket_id = 'firma-belgeler'
            AND (
                (storage.foldername(name))[1] = auth.uid()::text
                OR public.is_admin()
            )
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE '[039] firma-belgeler storage policy: %', SQLERRM;
END $$;

-- ============================================================
-- 7. Başvuru belge RPC'leri
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_basvuru_belge_kaydet(
    p_firma_id text,
    p_belge_turu text,
    p_storage_path text,
    p_mime_type text DEFAULT NULL,
    p_dosya_boyutu bigint DEFAULT NULL,
    p_orijinal_ad text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, storage, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    fid text := btrim(COALESCE(p_firma_id, ''));
    tur text := btrim(COALESCE(p_belge_turu, ''));
    path text := btrim(COALESCE(p_storage_path, ''));
    mime text := lower(btrim(COALESCE(p_mime_type, '')));
    f public.firmalar%ROWTYPE;
    belge public.firma_basvuru_belgeleri%ROWTYPE;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF fid = '' OR path = '' OR tur NOT IN ('vergi_levhasi', 'oda_belgesi') THEN
        RAISE EXCEPTION 'belge_gecersiz' USING ERRCODE = 'P0001';
    END IF;
    IF mime <> '' AND mime NOT IN ('application/pdf', 'image/jpeg', 'image/png') THEN
        RAISE EXCEPTION 'belge_mime_gecersiz' USING ERRCODE = 'P0001';
    END IF;
    IF p_dosya_boyutu IS NOT NULL AND p_dosya_boyutu > 10485760 THEN
        RAISE EXCEPTION 'belge_boyut_asildi' USING ERRCODE = 'P0001';
    END IF;
    IF (storage.foldername(path))[1] IS DISTINCT FROM uid::text THEN
        RAISE EXCEPTION 'belge_yolu_hatali' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO f FROM public.firmalar WHERE id::text = fid AND user_id = uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    /* Aynı türde eski meta kaydını değiştir (dosya storage'da ayrı kalabilir) */
    DELETE FROM public.firma_basvuru_belgeleri
    WHERE firma_id = f.id::text AND user_id = uid AND belge_turu = tur;

    INSERT INTO public.firma_basvuru_belgeleri (
        firma_id, user_id, belge_turu, storage_path, mime_type, dosya_boyutu, orijinal_ad
    ) VALUES (
        f.id::text, uid, tur, path,
        NULLIF(mime, ''), p_dosya_boyutu, nullif(btrim(COALESCE(p_orijinal_ad, '')), '')
    )
    RETURNING * INTO belge;

    RETURN jsonb_build_object('ok', true, 'belge', to_jsonb(belge));
END;
$$;

REVOKE ALL ON FUNCTION public.firma_basvuru_belge_kaydet(text, text, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_basvuru_belge_kaydet(text, text, text, text, bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.firma_basvuru_belge_imzali_url(
    p_belge_id uuid,
    p_saniye integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    b public.firma_basvuru_belgeleri%ROWTYPE;
    sn integer := GREATEST(30, LEAST(COALESCE(p_saniye, 120), 600));
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO b FROM public.firma_basvuru_belgeleri WHERE id = p_belge_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'belge_yok' USING ERRCODE = 'P0002';
    END IF;

    IF b.user_id IS DISTINCT FROM uid AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'bucket', 'firma-belgeler',
        'path', b.storage_path,
        'expires_in', sn,
        'belge_turu', b.belge_turu,
        'orijinal_ad', b.orijinal_ad
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_basvuru_belge_imzali_url(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_basvuru_belge_imzali_url(uuid, integer) TO authenticated;

-- ============================================================
-- 8. KYC belge kaydet jsonb overload (mevcut client uyumu)
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_dogrulama_belge_kaydet(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, storage, pg_temp
AS $$
DECLARE
    j jsonb := COALESCE(p_payload, '{}'::jsonb);
BEGIN
    RETURN public.firma_dogrulama_belge_kaydet(
        (j->>'basvuru_id')::uuid,
        j->>'belge_turu',
        j->>'storage_path',
        NULLIF(j->>'mime_type', ''),
        NULLIF(j->>'dosya_boyutu', '')::bigint,
        NULLIF(j->>'dosya_hash', ''),
        NULLIF(j->>'orijinal_ad', ''),
        NULLIF(j->>'belge_no', ''),
        NULLIF(j->>'duzenlenme_tarihi', '')::date,
        NULLIF(j->>'gecerlilik_tarihi', '')::date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_belge_kaydet(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_belge_kaydet(jsonb) TO authenticated;

-- ============================================================
-- 9. Admin listesi (yeni durum filtreleri)
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

    /* Geriye uyum: beklemede → basvuru_bekliyor + inceleniyor */
    IF filtre = 'beklemede' THEN
        filtre := 'basvuru_bekliyor';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            f.id, f.firma_adi, f.sehir, f.ilce, f.firma_turu, f.kategori, f.aciklama,
            f.telefon, f.email, f.durum, f.dogrulanmis, f.yayin_durumu,
            f.logo_url, f.kapak_url, f.user_id, f.created_at, f.updated_at,
            f.onaylayan_admin, f.onay_tarihi, f.red_nedeni, f.ek_belge_notu,
            COALESCE(f.askiya_alindi, FALSE) AS askiya_alindi,
            f.askiya_alma_nedeni,
            COALESCE(NULLIF(btrim(f.yetkili_ad), ''), p.ad_soyad) AS yetkili_ad,
            p.hesap_tipi,
            f.kurulus_yili, f.website, f.instagram,
            f.hizmet_kategorileri, f.vergi_dairesi, f.vergi_no, f.adres,
            (
                SELECT COUNT(*)::int
                FROM public.firma_basvuru_belgeleri b
                WHERE b.firma_id = f.id::text
            ) AS belge_sayisi
        FROM public.firmalar f
        LEFT JOIN public.profiles p ON p.id = f.user_id
        WHERE
            CASE filtre
                WHEN 'taslak' THEN f.durum = 'taslak'
                WHEN 'basvuru_bekliyor' THEN f.durum IN ('basvuru_bekliyor', 'beklemede')
                    AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                WHEN 'inceleniyor' THEN f.durum = 'inceleniyor'
                    AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                WHEN 'ek_belge_gerekli' THEN f.durum = 'ek_belge_gerekli'
                WHEN 'onaylandi' THEN f.durum = 'onaylandi'
                    AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                WHEN 'reddedildi' THEN f.durum = 'reddedildi'
                WHEN 'askiya_alindi' THEN f.durum = 'askiya_alindi'
                    OR COALESCE(f.askiya_alindi, FALSE) IS TRUE
                WHEN 'aski' THEN f.durum = 'askiya_alindi'
                    OR COALESCE(f.askiya_alindi, FALSE) IS TRUE
                ELSE TRUE
            END
    ) x;

    RETURN COALESCE(rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_firma_listesi(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_listesi(text) TO authenticated;

-- ============================================================
-- 10. Admin detay (belgeler dahil)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_firma_detay(p_firma_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    fid text := btrim(COALESCE(p_firma_id, ''));
    f jsonb;
    belgeler jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF fid = '' THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT to_jsonb(x) INTO f
    FROM (
        SELECT
            fr.*,
            COALESCE(NULLIF(btrim(fr.yetkili_ad), ''), p.ad_soyad) AS yetkili_ad_gorunum,
            p.hesap_tipi, p.ad_soyad AS profil_ad_soyad
        FROM public.firmalar fr
        LEFT JOIN public.profiles p ON p.id = fr.user_id
        WHERE fr.id::text = fid
    ) x;

    IF f IS NULL THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    /* İnceleme başlat: basvuru_bekliyor → inceleniyor */
    IF (f->>'durum') = 'basvuru_bekliyor' THEN
        UPDATE public.firmalar
        SET durum = 'inceleniyor',
            yayin_durumu = 'incelemede',
            updated_at = NOW()
        WHERE id::text = fid AND durum = 'basvuru_bekliyor';
        f := f || jsonb_build_object('durum', 'inceleniyor');
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
    INTO belgeler
    FROM public.firma_basvuru_belgeleri b
    WHERE b.firma_id = fid;

    RETURN jsonb_build_object('ok', true, 'firma', f, 'belgeler', belgeler);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_firma_detay(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_detay(text) TO authenticated;

-- ============================================================
-- 11. Admin aksiyonları (onay / red / ek belge / askı)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_firma_onayla(p_firma_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
    yeni public.firmalar%ROWTYPE;
    fid text := btrim(COALESCE(p_firma_id, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF fid = '' THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO eski FROM public.firmalar WHERE id::text = fid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        durum = 'onaylandi',
        dogrulanmis = TRUE,
        yayin_durumu = 'yayinda',
        onaylayan_admin = auth.uid(),
        onay_tarihi = NOW(),
        red_nedeni = NULL,
        ek_belge_notu = NULL,
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    PERFORM public._admin_log(
        'firma_onayla', 'firma',
        public._admin_hedef_uuid(eski.id::text),
        'Firma onaylandı',
        jsonb_build_object('id', eski.id, 'durum', eski.durum),
        jsonb_build_object('id', yeni.id, 'durum', yeni.durum, 'yayin_durumu', yeni.yayin_durumu)
    );

    RETURN jsonb_build_object(
        'ok', true, 'id', yeni.id, 'durum', yeni.durum,
        'dogrulanmis', yeni.dogrulanmis, 'yayin_durumu', yeni.yayin_durumu
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_firma_reddet(p_firma_id text, p_neden text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
    yeni public.firmalar%ROWTYPE;
    fid text := btrim(COALESCE(p_firma_id, ''));
    neden text := btrim(COALESCE(p_neden, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(neden) < 3 THEN
        RAISE EXCEPTION 'red_nedeni_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF fid = '' THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO eski FROM public.firmalar WHERE id::text = fid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        durum = 'reddedildi',
        dogrulanmis = FALSE,
        yayin_durumu = 'taslak',
        red_nedeni = neden,
        ek_belge_notu = NULL,
        onay_tarihi = NULL,
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    PERFORM public._admin_log(
        'firma_reddet', 'firma',
        public._admin_hedef_uuid(eski.id::text),
        neden,
        jsonb_build_object('id', eski.id, 'durum', eski.durum),
        jsonb_build_object('id', yeni.id, 'durum', yeni.durum, 'red_nedeni', neden)
    );

    RETURN jsonb_build_object(
        'ok', true, 'id', yeni.id, 'durum', yeni.durum, 'yayin_durumu', yeni.yayin_durumu
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_firma_ek_belge_iste(p_firma_id text, p_neden text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
    yeni public.firmalar%ROWTYPE;
    fid text := btrim(COALESCE(p_firma_id, ''));
    neden text := btrim(COALESCE(p_neden, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(neden) < 3 THEN
        RAISE EXCEPTION 'ek_belge_nedeni_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF fid = '' THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO eski FROM public.firmalar WHERE id::text = fid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        durum = 'ek_belge_gerekli',
        dogrulanmis = FALSE,
        yayin_durumu = 'incelemede',
        ek_belge_notu = neden,
        askiya_alindi = FALSE,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    PERFORM public._admin_log(
        'firma_ek_belge_iste', 'firma',
        public._admin_hedef_uuid(eski.id::text),
        neden,
        jsonb_build_object('id', eski.id, 'durum', eski.durum),
        jsonb_build_object('id', yeni.id, 'durum', yeni.durum, 'ek_belge_notu', neden)
    );

    RETURN jsonb_build_object(
        'ok', true, 'id', yeni.id, 'durum', yeni.durum, 'ek_belge_notu', yeni.ek_belge_notu
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_firma_ek_belge_iste(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_ek_belge_iste(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_firma_askiya_al(p_firma_id text, p_neden text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
    yeni public.firmalar%ROWTYPE;
    fid text := btrim(COALESCE(p_firma_id, ''));
    neden text := btrim(COALESCE(p_neden, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(neden) < 3 THEN
        RAISE EXCEPTION 'aski_nedeni_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF fid = '' THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO eski FROM public.firmalar WHERE id::text = fid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        durum = 'askiya_alindi',
        askiya_alindi = TRUE,
        askiya_alma_nedeni = neden,
        yayin_durumu = 'taslak',
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    PERFORM public._admin_log(
        'firma_askiya_al', 'firma',
        public._admin_hedef_uuid(eski.id::text),
        neden,
        jsonb_build_object('id', eski.id, 'durum', eski.durum),
        jsonb_build_object('id', yeni.id, 'durum', yeni.durum, 'askiya_alindi', true)
    );

    RETURN jsonb_build_object(
        'ok', true, 'id', yeni.id, 'durum', yeni.durum, 'askiya_alindi', true
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_firma_aski_kaldir(p_firma_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    eski public.firmalar%ROWTYPE;
    yeni public.firmalar%ROWTYPE;
    fid text := btrim(COALESCE(p_firma_id, ''));
    yeni_durum text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF fid = '' THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO eski FROM public.firmalar WHERE id::text = fid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    yeni_durum := CASE
        WHEN eski.dogrulanmis IS TRUE OR eski.onay_tarihi IS NOT NULL THEN 'onaylandi'
        ELSE 'basvuru_bekliyor'
    END;

    UPDATE public.firmalar SET
        durum = yeni_durum,
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL,
        yayin_durumu = CASE
            WHEN yeni_durum = 'onaylandi' THEN 'yayinda'
            ELSE 'incelemede'
        END,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    PERFORM public._admin_log(
        'firma_aski_kaldir', 'firma',
        public._admin_hedef_uuid(eski.id::text),
        'Askı kaldırıldı',
        jsonb_build_object('id', eski.id, 'durum', eski.durum),
        jsonb_build_object('id', yeni.id, 'durum', yeni.durum)
    );

    RETURN jsonb_build_object(
        'ok', true, 'id', yeni.id, 'durum', yeni.durum,
        'askiya_alindi', false, 'yayin_durumu', yeni.yayin_durumu
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_firma_onayla(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_reddet(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_askiya_al(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_aski_kaldir(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_onayla(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_reddet(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_askiya_al(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_aski_kaldir(text) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[039] Firma başvuru/onay akışı uygulandı.';
END $$;

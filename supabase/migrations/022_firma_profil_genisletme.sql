-- AURIX 022 — Firma profil genişletme (yayın durumu, zengin alanlar, firma_profil_kaydet)
-- Idempotent. Mevcut public.firmalar tablosu yeniden oluşturulmaz.
-- Auth / Site URL / client key ayarlarına dokunulmaz.

-- ============================================================
-- 1. Yeni kolonlar
-- ============================================================
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS ilce TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS firma_turu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS yetkili_ad TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS kurulus_yili INTEGER;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS adres TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS calisan_sayisi TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS calisma_saatleri TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS kapasite TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_dairesi TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_no TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS hizmet_kategorileri JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS yayin_durumu TEXT NOT NULL DEFAULT 'taslak';
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS calisma_gorselleri JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- 2. yayin_durumu CHECK
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'firmalar_yayin_durumu_check'
          AND conrelid = 'public.firmalar'::regclass
    ) THEN
        ALTER TABLE public.firmalar DROP CONSTRAINT firmalar_yayin_durumu_check;
    END IF;

    ALTER TABLE public.firmalar
        ADD CONSTRAINT firmalar_yayin_durumu_check
        CHECK (yayin_durumu IN ('taslak', 'incelemede', 'yayinda'));
END $$;

-- ============================================================
-- 3. Backfill yayin_durumu
-- ============================================================
UPDATE public.firmalar
SET yayin_durumu = 'yayinda'
WHERE durum = 'onaylandi'
  AND COALESCE(askiya_alindi, FALSE) IS FALSE
  AND (yayin_durumu IS NULL OR yayin_durumu = 'taslak');

UPDATE public.firmalar
SET yayin_durumu = 'incelemede'
WHERE durum = 'beklemede'
  AND (yayin_durumu IS NULL OR yayin_durumu = 'taslak');

-- ============================================================
-- 4. RLS — sahip SELECT (tüm durumlar) + public yayında
-- ============================================================
ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firmalar_select_own" ON public.firmalar;

CREATE POLICY "firmalar_select_own"
    ON public.firmalar
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

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
        'dogrulanmis IS TRUE'
        || ' AND durum = ''onaylandi'''
        || ' AND COALESCE(askiya_alindi, FALSE) IS FALSE'
        || ' AND COALESCE(yayin_durumu, ''yayinda'') = ''yayinda''';
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
-- 5. Kolon GRANT’leri
-- ============================================================
DO $$
BEGIN
    BEGIN
        REVOKE SELECT (vergi_dairesi, vergi_no) ON TABLE public.firmalar FROM anon;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

DO $$
DECLARE
    public_cols text[] := ARRAY[
        'ilce', 'firma_turu', 'yetkili_ad', 'kurulus_yili', 'website',
        'calisan_sayisi', 'calisma_saatleri', 'kapasite', 'instagram',
        'hizmet_kategorileri', 'yayin_durumu', 'calisma_gorselleri'
    ];
    auth_only_cols text[] := ARRAY['vergi_dairesi', 'vergi_no', 'adres'];
    cols text[];
    grant_list text;
    col text;
BEGIN
    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (public_cols);

    IF cols IS NOT NULL AND array_length(cols, 1) IS NOT NULL THEN
        grant_list := '';
        FOREACH col IN ARRAY cols LOOP
            IF grant_list <> '' THEN grant_list := grant_list || ', '; END IF;
            grant_list := grant_list || quote_ident(col);
        END LOOP;
        EXECUTE format(
            'GRANT SELECT (%s) ON TABLE public.firmalar TO anon, authenticated',
            grant_list
        );
    END IF;

    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (auth_only_cols);

    IF cols IS NOT NULL AND array_length(cols, 1) IS NOT NULL THEN
        grant_list := '';
        FOREACH col IN ARRAY cols LOOP
            IF grant_list <> '' THEN grant_list := grant_list || ', '; END IF;
            grant_list := grant_list || quote_ident(col);
        END LOOP;
        EXECUTE format(
            'GRANT SELECT (%s) ON TABLE public.firmalar TO authenticated',
            grant_list
        );
    END IF;
END $$;

-- ============================================================
-- 6. RPC: firma_profil_kaydet
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_profil_kaydet(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    eski public.firmalar%ROWTYPE;
    kayit_modu text;
    yil_now integer := EXTRACT(YEAR FROM NOW())::integer;

    v_firma_adi text;
    v_sehir text;
    v_ilce text;
    v_firma_turu text;
    v_kategori text;
    v_hizmet jsonb;
    v_aciklama text;
    v_yetkili_ad text;
    v_kurulus_yili integer;
    v_logo_url text;
    v_kapak_url text;
    v_calisma_gorselleri jsonb;
    v_adres text;
    v_website text;
    v_calisan_sayisi text;
    v_calisma_saatleri text;
    v_kapasite text;
    v_instagram text;
    v_vergi_dairesi text;
    v_vergi_no text;
    v_telefon text;

    new_durum text;
    new_yayin text;
    new_dogrulanmis boolean;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'payload_gecersiz' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO eski
    FROM public.firmalar
    WHERE user_id = uid
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(eski.askiya_alindi, FALSE) IS TRUE THEN
        RAISE EXCEPTION 'aski_guncelleme_yok' USING ERRCODE = '42501';
    END IF;

    kayit_modu := lower(btrim(COALESCE(p_payload->>'kayit_modu', 'taslak')));
    IF kayit_modu NOT IN ('taslak', 'yayina_gonder', 'yeniden_basvur') THEN
        RAISE EXCEPTION 'kayit_modu_gecersiz' USING ERRCODE = '22023';
    END IF;

    -- Mevcut değerler + payload birleşimi
    IF p_payload ? 'firma_adi' THEN
        v_firma_adi := nullif(btrim(p_payload->>'firma_adi'), '');
    ELSE
        v_firma_adi := eski.firma_adi;
    END IF;

    IF p_payload ? 'sehir' THEN
        v_sehir := nullif(btrim(p_payload->>'sehir'), '');
    ELSE
        v_sehir := eski.sehir;
    END IF;

    IF p_payload ? 'ilce' THEN
        v_ilce := nullif(btrim(p_payload->>'ilce'), '');
    ELSE
        v_ilce := eski.ilce;
    END IF;

    IF p_payload ? 'firma_turu' THEN
        v_firma_turu := nullif(btrim(p_payload->>'firma_turu'), '');
    ELSE
        v_firma_turu := eski.firma_turu;
    END IF;

    IF p_payload ? 'kategori' THEN
        v_kategori := nullif(btrim(p_payload->>'kategori'), '');
    ELSE
        v_kategori := eski.kategori;
    END IF;

    IF p_payload ? 'hizmet_kategorileri' THEN
        IF jsonb_typeof(p_payload->'hizmet_kategorileri') = 'array' THEN
            v_hizmet := p_payload->'hizmet_kategorileri';
        ELSE
            RAISE EXCEPTION 'hizmet_kategorileri_dizi_degil' USING ERRCODE = '22023';
        END IF;
    ELSE
        v_hizmet := COALESCE(eski.hizmet_kategorileri, '[]'::jsonb);
    END IF;

    IF p_payload ? 'aciklama' THEN
        v_aciklama := nullif(btrim(p_payload->>'aciklama'), '');
    ELSE
        v_aciklama := eski.aciklama;
    END IF;

    IF p_payload ? 'yetkili_ad' THEN
        v_yetkili_ad := nullif(btrim(p_payload->>'yetkili_ad'), '');
    ELSE
        v_yetkili_ad := eski.yetkili_ad;
    END IF;

    IF p_payload ? 'kurulus_yili' THEN
        IF p_payload->>'kurulus_yili' IS NULL OR btrim(p_payload->>'kurulus_yili') = '' THEN
            v_kurulus_yili := NULL;
        ELSE
            BEGIN
                v_kurulus_yili := (p_payload->>'kurulus_yili')::integer;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'kurulus_yili_gecersiz' USING ERRCODE = '22023';
            END;
        END IF;
    ELSE
        v_kurulus_yili := eski.kurulus_yili;
    END IF;

    IF p_payload ? 'logo_url' THEN
        v_logo_url := p_payload->>'logo_url';
    ELSE
        v_logo_url := NULL;
    END IF;

    IF p_payload ? 'kapak_url' THEN
        v_kapak_url := p_payload->>'kapak_url';
    ELSE
        v_kapak_url := NULL;
    END IF;

    IF p_payload ? 'calisma_gorselleri' THEN
        IF p_payload->'calisma_gorselleri' IS NULL THEN
            v_calisma_gorselleri := NULL;
        ELSIF jsonb_typeof(p_payload->'calisma_gorselleri') = 'array' THEN
            v_calisma_gorselleri := p_payload->'calisma_gorselleri';
        ELSE
            RAISE EXCEPTION 'calisma_gorselleri_dizi_degil' USING ERRCODE = '22023';
        END IF;
    ELSE
        v_calisma_gorselleri := NULL;
    END IF;

    IF p_payload ? 'adres' THEN v_adres := nullif(btrim(p_payload->>'adres'), ''); ELSE v_adres := eski.adres; END IF;
    IF p_payload ? 'website' THEN v_website := nullif(btrim(p_payload->>'website'), ''); ELSE v_website := eski.website; END IF;
    IF p_payload ? 'calisan_sayisi' THEN v_calisan_sayisi := nullif(btrim(p_payload->>'calisan_sayisi'), ''); ELSE v_calisan_sayisi := eski.calisan_sayisi; END IF;
    IF p_payload ? 'calisma_saatleri' THEN v_calisma_saatleri := nullif(btrim(p_payload->>'calisma_saatleri'), ''); ELSE v_calisma_saatleri := eski.calisma_saatleri; END IF;
    IF p_payload ? 'kapasite' THEN v_kapasite := nullif(btrim(p_payload->>'kapasite'), ''); ELSE v_kapasite := eski.kapasite; END IF;
    IF p_payload ? 'instagram' THEN v_instagram := nullif(btrim(p_payload->>'instagram'), ''); ELSE v_instagram := eski.instagram; END IF;
    IF p_payload ? 'vergi_dairesi' THEN v_vergi_dairesi := nullif(btrim(p_payload->>'vergi_dairesi'), ''); ELSE v_vergi_dairesi := eski.vergi_dairesi; END IF;
    IF p_payload ? 'vergi_no' THEN v_vergi_no := nullif(btrim(p_payload->>'vergi_no'), ''); ELSE v_vergi_no := eski.vergi_no; END IF;
    IF p_payload ? 'telefon' THEN v_telefon := nullif(btrim(p_payload->>'telefon'), ''); ELSE v_telefon := eski.telefon; END IF;

    -- kategori geriye dönük uyum: ilk hizmet veya payload kategori
    IF jsonb_array_length(COALESCE(v_hizmet, '[]'::jsonb)) > 0 THEN
        v_kategori := btrim(v_hizmet->>0);
    END IF;

    -- Doğrulama
    IF kayit_modu = 'taslak' THEN
        IF p_payload ? 'firma_adi' AND (v_firma_adi IS NULL OR char_length(v_firma_adi) < 2) THEN
            RAISE EXCEPTION 'firma_adi_gecersiz' USING ERRCODE = '22023';
        END IF;
    ELSIF kayit_modu IN ('yayina_gonder', 'yeniden_basvur') THEN
        IF v_firma_adi IS NULL OR char_length(v_firma_adi) < 2 THEN
            RAISE EXCEPTION 'firma_adi_gecersiz' USING ERRCODE = '22023';
        END IF;
        IF v_firma_turu IS NULL THEN
            RAISE EXCEPTION 'firma_turu_zorunlu' USING ERRCODE = '22023';
        END IF;
        IF v_sehir IS NULL THEN
            RAISE EXCEPTION 'sehir_zorunlu' USING ERRCODE = '22023';
        END IF;
        IF v_ilce IS NULL THEN
            RAISE EXCEPTION 'ilce_zorunlu' USING ERRCODE = '22023';
        END IF;
        IF jsonb_array_length(COALESCE(v_hizmet, '[]'::jsonb)) = 0 AND v_kategori IS NULL THEN
            RAISE EXCEPTION 'kategori_zorunlu' USING ERRCODE = '22023';
        END IF;
        IF v_aciklama IS NULL OR char_length(v_aciklama) < 10 THEN
            RAISE EXCEPTION 'aciklama_kisa' USING ERRCODE = '22023';
        END IF;
        IF v_yetkili_ad IS NULL THEN
            RAISE EXCEPTION 'yetkili_ad_zorunlu' USING ERRCODE = '22023';
        END IF;
        IF v_kurulus_yili IS NULL OR v_kurulus_yili < 1900 OR v_kurulus_yili > yil_now THEN
            RAISE EXCEPTION 'kurulus_yili_gecersiz' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Durum / yayın
    new_durum := eski.durum;
    new_yayin := eski.yayin_durumu;
    new_dogrulanmis := eski.dogrulanmis;

    IF kayit_modu = 'taslak' THEN
        new_yayin := 'taslak';
    ELSIF kayit_modu = 'yayina_gonder' THEN
        IF eski.durum = 'onaylandi' THEN
            new_durum := 'onaylandi';
            new_yayin := 'yayinda';
            new_dogrulanmis := TRUE;
        ELSE
            new_durum := 'beklemede';
            new_yayin := 'incelemede';
            new_dogrulanmis := FALSE;
        END IF;
    ELSIF kayit_modu = 'yeniden_basvur' THEN
        new_durum := 'beklemede';
        new_yayin := 'incelemede';
        new_dogrulanmis := FALSE;
    END IF;

    UPDATE public.firmalar SET
        firma_adi = COALESCE(v_firma_adi, firma_adi),
        sehir = COALESCE(v_sehir, sehir),
        ilce = v_ilce,
        firma_turu = v_firma_turu,
        kategori = COALESCE(v_kategori, kategori),
        hizmet_kategorileri = COALESCE(v_hizmet, hizmet_kategorileri),
        aciklama = COALESCE(v_aciklama, aciklama),
        yetkili_ad = v_yetkili_ad,
        kurulus_yili = v_kurulus_yili,
        adres = v_adres,
        website = v_website,
        calisan_sayisi = v_calisan_sayisi,
        calisma_saatleri = v_calisma_saatleri,
        kapasite = v_kapasite,
        instagram = v_instagram,
        vergi_dairesi = v_vergi_dairesi,
        vergi_no = v_vergi_no,
        telefon = COALESCE(v_telefon, telefon),
        logo_url = CASE
            WHEN NOT (p_payload ? 'logo_url') THEN logo_url
            WHEN v_logo_url IS NULL THEN logo_url
            WHEN btrim(v_logo_url) = '' THEN NULL
            ELSE btrim(v_logo_url)
        END,
        kapak_url = CASE
            WHEN NOT (p_payload ? 'kapak_url') THEN kapak_url
            WHEN v_kapak_url IS NULL THEN kapak_url
            WHEN btrim(v_kapak_url) = '' THEN NULL
            ELSE btrim(v_kapak_url)
        END,
        calisma_gorselleri = CASE
            WHEN NOT (p_payload ? 'calisma_gorselleri') THEN calisma_gorselleri
            WHEN v_calisma_gorselleri IS NULL THEN calisma_gorselleri
            ELSE v_calisma_gorselleri
        END,
        durum = new_durum,
        yayin_durumu = new_yayin,
        dogrulanmis = new_dogrulanmis,
        red_nedeni = CASE
            WHEN kayit_modu IN ('yayina_gonder', 'yeniden_basvur') THEN NULL
            ELSE red_nedeni
        END,
        onaylayan_admin = CASE
            WHEN kayit_modu IN ('yayina_gonder', 'yeniden_basvur') AND eski.durum <> 'onaylandi' THEN NULL
            ELSE onaylayan_admin
        END,
        onay_tarihi = CASE
            WHEN kayit_modu IN ('yayina_gonder', 'yeniden_basvur') AND eski.durum <> 'onaylandi' THEN NULL
            ELSE onay_tarihi
        END,
        updated_at = NOW()
    WHERE id = eski.id;

    RETURN (
        SELECT jsonb_build_object(
            'ok', true,
            'id', f.id,
            'durum', f.durum,
            'yayin_durumu', f.yayin_durumu,
            'dogrulanmis', f.dogrulanmis
        )
        FROM public.firmalar f
        WHERE f.id = eski.id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_profil_kaydet(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_profil_kaydet(jsonb) TO authenticated;

-- ============================================================
-- 7. Admin RPC güncellemeleri (yayin_durumu)
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
        yayin_durumu = 'yayinda',
        onaylayan_admin = auth.uid(),
        onay_tarihi = NOW(),
        red_nedeni = NULL,
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL
    WHERE id = p_firma_id;

    PERFORM public._admin_log(
        'firma_onayla', 'firma', p_firma_id,
        'Firma onaylandı',
        jsonb_build_object('durum', eski.durum, 'dogrulanmis', eski.dogrulanmis, 'yayin_durumu', eski.yayin_durumu),
        jsonb_build_object('durum', 'onaylandi', 'dogrulanmis', true, 'yayin_durumu', 'yayinda')
    );

    RETURN jsonb_build_object('ok', true, 'id', p_firma_id, 'durum', 'onaylandi', 'yayin_durumu', 'yayinda');
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
        yayin_durumu = 'taslak',
        red_nedeni = neden,
        onay_tarihi = NULL
    WHERE id = p_firma_id;

    PERFORM public._admin_log(
        'firma_reddet', 'firma', p_firma_id, neden,
        jsonb_build_object('durum', eski.durum, 'yayin_durumu', eski.yayin_durumu),
        jsonb_build_object('durum', 'reddedildi', 'red_nedeni', neden, 'yayin_durumu', 'taslak')
    );

    RETURN jsonb_build_object('ok', true, 'id', p_firma_id, 'durum', 'reddedildi', 'yayin_durumu', 'taslak');
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

REVOKE ALL ON FUNCTION public.admin_firma_onayla(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_reddet(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_askiya_al(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_onayla(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_reddet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_askiya_al(uuid, text) TO authenticated;

-- ============================================================
-- 8. Admin firma listesi — yeni profil alanları
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
            f.id, f.firma_adi, f.sehir, f.ilce, f.firma_turu, f.kategori, f.aciklama,
            f.telefon, f.email, f.durum, f.dogrulanmis, f.yayin_durumu,
            f.logo_url, f.kapak_url, f.user_id, f.created_at,
            f.onaylayan_admin, f.onay_tarihi, f.red_nedeni,
            COALESCE(f.askiya_alindi, FALSE) AS askiya_alindi,
            f.askiya_alma_nedeni,
            f.yetkili_ad AS yetkili_ad_firma,
            COALESCE(NULLIF(btrim(f.yetkili_ad), ''), p.ad_soyad) AS yetkili_ad,
            p.hesap_tipi,
            f.kurulus_yili, f.website, f.instagram,
            f.hizmet_kategorileri, f.vergi_dairesi, f.vergi_no, f.adres
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

    RETURN COALESCE(rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_firma_listesi(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_firma_listesi(text) TO authenticated;

COMMENT ON FUNCTION public.firma_profil_kaydet(jsonb) IS
    'Firma sahibi profil kaydı (taslak / yayına gönder). Yalnız oturum sahibi.';

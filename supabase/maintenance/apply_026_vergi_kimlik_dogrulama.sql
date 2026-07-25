-- AURIX 026 — Vergi kimlik doğrulama seviyeleri + başvuru alanları
-- Idempotent. website/instagram DROP edilmez (istemci artık kullanmaz).
-- Yayın onayı (durum/dogrulanmis/yayin_durumu) ile vergi/güven rozeti ayrı kalır.
--
-- Bu dosya = supabase/maintenance/apply_026_vergi_kimlik_dogrulama.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın (025 sonrası).

-- ============================================================
-- 1. firmalar — vergi kimlik durumu (public SELECT’te yok)
-- ============================================================
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_kimlik_durumu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_kimlik_turu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS hukuki_unvan TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS isletme_turu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS sicil_no TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS basvuran_sifati TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_levha_islem_kodu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_gib_kontrol_tarihi TIMESTAMPTZ;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_gib_kontrol_admin UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_gib_eslesen JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS vergi_gib_uyusmayan JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS telefon_admin_teyit BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.firmalar
SET vergi_kimlik_durumu = 'girilmedi'
WHERE vergi_kimlik_durumu IS NULL OR btrim(vergi_kimlik_durumu) = '';

DO $$
BEGIN
    BEGIN
        ALTER TABLE public.firmalar ALTER COLUMN vergi_kimlik_durumu SET DEFAULT 'girilmedi';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.firmalar ALTER COLUMN vergi_kimlik_durumu SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'firmalar_vergi_kimlik_durumu_check'
          AND conrelid = 'public.firmalar'::regclass
    ) THEN
        ALTER TABLE public.firmalar DROP CONSTRAINT firmalar_vergi_kimlik_durumu_check;
    END IF;
    ALTER TABLE public.firmalar
        ADD CONSTRAINT firmalar_vergi_kimlik_durumu_check
        CHECK (vergi_kimlik_durumu IN (
            'girilmedi', 'format_gecerli', 'belge_yuklendi',
            'resmi_kaynaktan_kontrol_bekliyor', 'eslesti', 'uyusmazlik',
            'gecersiz', 'yeniden_belge_gerekli'
        ));
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'firmalar_vergi_kimlik_turu_check'
          AND conrelid = 'public.firmalar'::regclass
    ) THEN
        ALTER TABLE public.firmalar DROP CONSTRAINT firmalar_vergi_kimlik_turu_check;
    END IF;
    ALTER TABLE public.firmalar
        ADD CONSTRAINT firmalar_vergi_kimlik_turu_check
        CHECK (vergi_kimlik_turu IS NULL OR vergi_kimlik_turu IN ('vkn', 'tckn'));
END $$;

-- Hassas kolonları anon’dan uzak tut; authenticated yalnız kendi satırı (RLS)
DO $$
BEGIN
    BEGIN
        REVOKE SELECT (
            vergi_no, vergi_dairesi, mersis_no, hukuki_unvan, sicil_no,
            vergi_levha_islem_kodu, vergi_kimlik_durumu, vergi_gib_eslesen,
            vergi_gib_uyusmayan
        ) ON TABLE public.firmalar FROM anon;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        EXECUTE 'GRANT SELECT (vergi_kimlik_durumu) ON TABLE public.firmalar TO authenticated';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- ============================================================
-- 2. Başvuru tablosu — ek alanlar
-- ============================================================
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS hukuki_unvan TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS vergi_no TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS vergi_dairesi TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS vergi_kimlik_turu TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS isletme_turu TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS mersis_no TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS sicil_no TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS basvuran_sifati TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS vergi_levha_islem_kodu TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS vergi_format_durumu TEXT DEFAULT 'girilmedi';
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS gib_kontrol_edildi BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS gib_kontrol_tarihi TIMESTAMPTZ;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS gib_kontrol_admin UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS gib_karar TEXT;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS gib_eslesen JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS gib_uyusmayan JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS oda_sicil_eslesti BOOLEAN;
ALTER TABLE public.firma_dogrulama_basvurulari ADD COLUMN IF NOT EXISTS sahiplik_eslesti BOOLEAN;

-- ============================================================
-- 3. VKN / TCKN checksum (sunucu) — format ≠ resmi doğrulama
-- ============================================================
CREATE OR REPLACE FUNCTION public.aurix_vkn_gecerli(p_vkn text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v text := regexp_replace(COALESCE(p_vkn, ''), '\D', '', 'g');
    i integer;
    d integer;
    tmp integer;
    sum integer := 0;
    last integer;
BEGIN
    IF length(v) <> 10 THEN RETURN FALSE; END IF;
    IF v ~ '^0+$' THEN RETURN FALSE; END IF;
    last := substring(v from 10 for 1)::integer;
    FOR i IN 1..9 LOOP
        d := substring(v from i for 1)::integer;
        tmp := (d + (10 - i)) % 10;
        tmp := (tmp * (2 ^ (10 - i))) % 9;
        IF ((d + (10 - i)) % 10) <> 0 AND tmp = 0 THEN
            tmp := 9;
        END IF;
        sum := sum + tmp;
    END LOOP;
    RETURN ((10 - (sum % 10)) % 10) = last;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.aurix_tckn_gecerli(p_tckn text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    s text := regexp_replace(COALESCE(p_tckn, ''), '\D', '', 'g');
    d int[];
    i int;
    odd_sum int := 0;
    even_sum int := 0;
BEGIN
    IF length(s) <> 11 THEN RETURN FALSE; END IF;
    IF substring(s from 1 for 1) = '0' THEN RETURN FALSE; END IF;
    d := ARRAY[]::int[];
    FOR i IN 1..11 LOOP
        d := d || substring(s from i for 1)::int;
    END LOOP;
    FOR i IN 1..9 LOOP
        IF i % 2 = 1 THEN odd_sum := odd_sum + d[i];
        ELSE even_sum := even_sum + d[i];
        END IF;
    END LOOP;
    IF ((odd_sum * 7) - even_sum) % 10 <> d[10] THEN RETURN FALSE; END IF;
    IF (odd_sum + even_sum + d[10]) % 10 <> d[11] THEN RETURN FALSE; END IF;
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- ============================================================
-- 4. Başvuru kaydet (kimlik alanları) + gönder güncellemesi
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_dogrulama_kimlik_kaydet(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    bid uuid;
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    f public.firmalar%ROWTYPE;
    vno text;
    vtur text;
    format_ok boolean := false;
    vdurum text := 'girilmedi';
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    bid := NULLIF(p_payload->>'basvuru_id', '')::uuid;
    IF bid IS NULL THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO b FROM public.firma_dogrulama_basvurulari
    WHERE id = bid AND user_id = uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;
    IF b.durum NOT IN ('taslak', 'ek_belge_gerekli', 'yenileme_gerekli') THEN
        RAISE EXCEPTION 'basvuru_durum_uygunsuz' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO f FROM public.firmalar WHERE id = b.firma_id;

    vno := regexp_replace(COALESCE(p_payload->>'vergi_no', ''), '\D', '', 'g');
    vtur := lower(NULLIF(btrim(COALESCE(p_payload->>'vergi_kimlik_turu', '')), ''));
    IF vtur IS NULL THEN
        IF length(vno) = 11 THEN vtur := 'tckn';
        ELSIF length(vno) = 10 THEN vtur := 'vkn';
        END IF;
    END IF;

    IF vno = '' THEN
        vdurum := 'girilmedi';
    ELSIF vtur = 'tckn' THEN
        format_ok := public.aurix_tckn_gecerli(vno);
        vdurum := CASE WHEN format_ok THEN 'format_gecerli' ELSE 'gecersiz' END;
    ELSE
        format_ok := public.aurix_vkn_gecerli(vno);
        vdurum := CASE WHEN format_ok THEN 'format_gecerli' ELSE 'gecersiz' END;
    END IF;

    IF vdurum = 'gecersiz' THEN
        RAISE EXCEPTION 'vergi_no_gecersiz' USING ERRCODE = '22023';
    END IF;

    UPDATE public.firma_dogrulama_basvurulari SET
        hukuki_unvan = NULLIF(btrim(COALESCE(p_payload->>'hukuki_unvan', '')), ''),
        vergi_no = NULLIF(vno, ''),
        vergi_dairesi = NULLIF(btrim(COALESCE(p_payload->>'vergi_dairesi', '')), ''),
        vergi_kimlik_turu = vtur,
        isletme_turu = NULLIF(btrim(COALESCE(p_payload->>'isletme_turu', '')), ''),
        mersis_no = NULLIF(btrim(COALESCE(p_payload->>'mersis_no', '')), ''),
        sicil_no = NULLIF(btrim(COALESCE(p_payload->>'sicil_no', '')), ''),
        basvuran_sifati = NULLIF(btrim(COALESCE(p_payload->>'basvuran_sifati', '')), ''),
        vergi_levha_islem_kodu = NULLIF(btrim(COALESCE(p_payload->>'vergi_levha_islem_kodu', '')), ''),
        vergi_format_durumu = vdurum,
        updated_at = NOW()
    WHERE id = b.id;

    UPDATE public.firmalar SET
        hukuki_unvan = COALESCE(NULLIF(btrim(COALESCE(p_payload->>'hukuki_unvan', '')), ''), hukuki_unvan),
        vergi_no = COALESCE(NULLIF(vno, ''), vergi_no),
        vergi_dairesi = COALESCE(NULLIF(btrim(COALESCE(p_payload->>'vergi_dairesi', '')), ''), vergi_dairesi),
        vergi_kimlik_turu = COALESCE(vtur, vergi_kimlik_turu),
        isletme_turu = COALESCE(NULLIF(btrim(COALESCE(p_payload->>'isletme_turu', '')), ''), isletme_turu),
        mersis_no = COALESCE(NULLIF(btrim(COALESCE(p_payload->>'mersis_no', '')), ''), mersis_no),
        sicil_no = COALESCE(NULLIF(btrim(COALESCE(p_payload->>'sicil_no', '')), ''), sicil_no),
        basvuran_sifati = COALESCE(NULLIF(btrim(COALESCE(p_payload->>'basvuran_sifati', '')), ''), basvuran_sifati),
        vergi_levha_islem_kodu = COALESCE(NULLIF(btrim(COALESCE(p_payload->>'vergi_levha_islem_kodu', '')), ''), vergi_levha_islem_kodu),
        vergi_kimlik_durumu = CASE
            WHEN vergi_kimlik_durumu IN ('eslesti', 'uyusmazlik', 'resmi_kaynaktan_kontrol_bekliyor') THEN vergi_kimlik_durumu
            ELSE vdurum
        END,
        updated_at = NOW()
    WHERE id = f.id;

    RETURN jsonb_build_object(
        'ok', true,
        'vergi_format_durumu', vdurum,
        'vergi_kimlik_turu', vtur,
        'format_gecerli', vdurum = 'format_gecerli'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_kimlik_kaydet(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_kimlik_kaydet(jsonb) TO authenticated;

-- Gönder: kimlik zorunlu + belge sonrası vergi durumu belge_yuklendi / kontrol bekliyor
CREATE OR REPLACE FUNCTION public.firma_dogrulama_basvuru_gonder(
    p_basvuru_id uuid,
    p_sahip_beyani boolean,
    p_kvkk_aydinlatma boolean,
    p_acik_riza boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    f public.firmalar%ROWTYPE;
    belge_say int;
    email_ok boolean := false;
    has_vergi_belge int;
    has_oda int;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO b FROM public.firma_dogrulama_basvurulari
    WHERE id = p_basvuru_id AND user_id = uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;
    IF b.durum NOT IN ('taslak', 'ek_belge_gerekli', 'yenileme_gerekli') THEN
        RAISE EXCEPTION 'basvuru_durum_uygunsuz' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_sahip_beyani, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'sahip_beyani_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_kvkk_aydinlatma, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'kvkk_aydinlatma_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_acik_riza, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'acik_riza_zorunlu' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO f FROM public.firmalar WHERE id = b.firma_id;
    BEGIN
        SELECT (u.email_confirmed_at IS NOT NULL) INTO email_ok FROM auth.users u WHERE u.id = uid;
    EXCEPTION WHEN OTHERS THEN
        email_ok := false;
    END;
    IF email_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'email_dogrulanmadi' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(btrim(COALESCE(b.hukuki_unvan, f.hukuki_unvan, f.firma_adi, '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(b.vergi_no, f.vergi_no, '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(b.vergi_dairesi, f.vergi_dairesi, '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(b.isletme_turu, f.isletme_turu, '')), '') IS NULL
       OR NULLIF(btrim(COALESCE(b.basvuran_sifati, f.basvuran_sifati, '')), '') IS NULL THEN
        RAISE EXCEPTION 'profil_eksik' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(b.vergi_format_durumu, f.vergi_kimlik_durumu, '') IN ('gecersiz', 'girilmedi') THEN
        RAISE EXCEPTION 'vergi_no_gecersiz' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::int INTO belge_say FROM public.firma_dogrulama_belgeler WHERE basvuru_id = b.id;
    IF belge_say < 1 THEN
        RAISE EXCEPTION 'belge_zorunlu' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::int INTO has_vergi_belge FROM public.firma_dogrulama_belgeler
    WHERE basvuru_id = b.id AND belge_turu IN ('vergi_levhasi', 'e_vergi_levhasi');
    IF has_vergi_belge < 1 THEN
        RAISE EXCEPTION 'vergi_belgesi_zorunlu' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::int INTO has_oda FROM public.firma_dogrulama_belgeler
    WHERE basvuru_id = b.id AND belge_turu IN ('oda_faaliyet', 'sicil', 'esnaf_oda');
    IF has_oda < 1 THEN
        RAISE EXCEPTION 'oda_belgesi_zorunlu' USING ERRCODE = '22023';
    END IF;

    UPDATE public.firma_dogrulama_basvurulari SET
        durum = 'incelemede',
        sahip_beyani = TRUE,
        kvkk_aydinlatma_okundu = TRUE,
        acik_riza = TRUE,
        submitted_at = NOW(),
        updated_at = NOW()
    WHERE id = b.id;

    UPDATE public.firmalar SET
        guven_dogrulama_durumu = 'incelemede',
        vergi_kimlik_durumu = 'resmi_kaynaktan_kontrol_bekliyor',
        guven_kullanici_aciklama = NULL,
        updated_at = NOW()
    WHERE id = f.id;

    PERFORM public.fd_risk_tara(b.id);
    PERFORM public._fd_log(b.id, f.id::text, 'basvuru_gonder', b.durum, 'incelemede', NULL, NULL, NULL);

    RETURN jsonb_build_object('ok', true, 'durum', 'incelemede', 'vergi_kimlik_durumu', 'resmi_kaynaktan_kontrol_bekliyor');
END;
$$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_basvuru_gonder(uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_basvuru_gonder(uuid, boolean, boolean, boolean) TO authenticated;

-- ============================================================
-- 5. Admin GİB / vergi karar RPC (scrape yok)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_vergi_kontrol_karar(
    p_basvuru_id uuid,
    p_karar text,
    p_gerekce text,
    p_eslesen jsonb DEFAULT '{}'::jsonb,
    p_uyusmayan jsonb DEFAULT '{}'::jsonb,
    p_gib_kontrol_edildi boolean DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    eski text;
    yeni text;
    karar text := lower(btrim(COALESCE(p_karar, '')));
    gerekce text := btrim(COALESCE(p_gerekce, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(gerekce) < 3 THEN
        RAISE EXCEPTION 'gerekce_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF karar NOT IN (
        'eslesti', 'uyusmazlik', 'belge_okunamiyor', 'belge_guncel_degil',
        'resmi_kayitta_yok', 'ek_belge'
    ) THEN
        RAISE EXCEPTION 'karar_gecersiz' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO b FROM public.firma_dogrulama_basvurulari WHERE id = p_basvuru_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT vergi_kimlik_durumu INTO eski FROM public.firmalar WHERE id = b.firma_id;

    yeni := CASE karar
        WHEN 'eslesti' THEN 'eslesti'
        WHEN 'uyusmazlik' THEN 'uyusmazlik'
        WHEN 'belge_okunamiyor' THEN 'yeniden_belge_gerekli'
        WHEN 'belge_guncel_degil' THEN 'yeniden_belge_gerekli'
        WHEN 'resmi_kayitta_yok' THEN 'gecersiz'
        WHEN 'ek_belge' THEN 'yeniden_belge_gerekli'
    END;

    UPDATE public.firma_dogrulama_basvurulari SET
        gib_kontrol_edildi = COALESCE(p_gib_kontrol_edildi, TRUE),
        gib_kontrol_tarihi = NOW(),
        gib_kontrol_admin = auth.uid(),
        gib_karar = karar,
        gib_eslesen = COALESCE(p_eslesen, '{}'::jsonb),
        gib_uyusmayan = COALESCE(p_uyusmayan, '{}'::jsonb),
        admin_aciklama = gerekce,
        durum = CASE
            WHEN karar = 'ek_belge' THEN 'ek_belge_gerekli'
            WHEN karar IN ('uyusmazlik', 'resmi_kayitta_yok') THEN 'reddedildi'
            ELSE durum
        END,
        updated_at = NOW()
    WHERE id = b.id;

    UPDATE public.firmalar SET
        vergi_kimlik_durumu = yeni,
        vergi_gib_kontrol_tarihi = NOW(),
        vergi_gib_kontrol_admin = auth.uid(),
        vergi_gib_eslesen = COALESCE(p_eslesen, '{}'::jsonb),
        vergi_gib_uyusmayan = COALESCE(p_uyusmayan, '{}'::jsonb),
        guven_dogrulama_durumu = CASE
            WHEN karar = 'eslesti' THEN guven_dogrulama_durumu
            WHEN karar = 'ek_belge' THEN 'ek_belge_gerekli'
            WHEN karar IN ('uyusmazlik', 'resmi_kayitta_yok') THEN 'reddedildi'
            WHEN karar IN ('belge_okunamiyor', 'belge_guncel_degil') THEN 'ek_belge_gerekli'
            ELSE guven_dogrulama_durumu
        END,
        -- Rozet yalnız tam dogrula ile; vergi uyuşmazlığında kaldır
        guven_dogrulama_tarihi = CASE
            WHEN karar <> 'eslesti' AND guven_dogrulama_durumu = 'dogrulandi' THEN NULL
            ELSE guven_dogrulama_tarihi
        END,
        updated_at = NOW()
    WHERE id = b.firma_id;

    IF karar <> 'eslesti' THEN
        UPDATE public.firmalar SET
            guven_dogrulama_durumu = CASE
                WHEN guven_dogrulama_durumu = 'dogrulandi' THEN 'incelemede'
                ELSE guven_dogrulama_durumu
            END
        WHERE id = b.firma_id AND guven_dogrulama_durumu = 'dogrulandi';
    END IF;

    PERFORM public._fd_log(
        b.id, b.firma_id::text, 'vergi_kontrol_' || karar,
        eski, yeni, gerekce, karar,
        jsonb_build_object('eslesen', p_eslesen, 'uyusmayan', p_uyusmayan)
    );

    RETURN jsonb_build_object('ok', true, 'vergi_kimlik_durumu', yeni, 'karar', karar);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_vergi_kontrol_karar(uuid, text, text, jsonb, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_vergi_kontrol_karar(uuid, text, text, jsonb, jsonb, boolean) TO authenticated;

-- ============================================================
-- 6. admin_dogrulama_karar — dogrula için vergi eşleşmesi şart
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_dogrulama_karar(
    p_basvuru_id uuid,
    p_karar text,
    p_gerekce text,
    p_gerekce_kod text,
    p_ic_not text DEFAULT NULL,
    p_yenileme_ay integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    f public.firmalar%ROWTYPE;
    eski text;
    yeni text;
    karar text := lower(btrim(COALESCE(p_karar, '')));
    gerekce text := btrim(COALESCE(p_gerekce, ''));
    ay int := COALESCE(NULLIF(p_yenileme_ay, 0), 12);
    email_ok boolean := false;
    tel_ok boolean := false;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF length(gerekce) < 3 THEN
        RAISE EXCEPTION 'gerekce_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF karar NOT IN (
        'dogrula', 'ek_belge', 'reddet', 'askiya_al', 'dogrulamayi_kaldir', 'kalici_kapat'
    ) THEN
        RAISE EXCEPTION 'karar_gecersiz' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO b FROM public.firma_dogrulama_basvurulari WHERE id = p_basvuru_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO f FROM public.firmalar WHERE id = b.firma_id FOR UPDATE;
    eski := b.durum;

    IF karar = 'dogrula' THEN
        IF COALESCE(f.vergi_kimlik_durumu, '') <> 'eslesti' THEN
            RAISE EXCEPTION 'vergi_eslesmedi' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(b.oda_sicil_eslesti, FALSE) IS NOT TRUE THEN
            RAISE EXCEPTION 'oda_sicil_eslesmedi' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(b.sahiplik_eslesti, FALSE) IS NOT TRUE THEN
            RAISE EXCEPTION 'sahiplik_eslesmedi' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(f.askiya_alindi, FALSE) IS TRUE THEN
            RAISE EXCEPTION 'firma_askida' USING ERRCODE = '22023';
        END IF;
        BEGIN
            SELECT (u.email_confirmed_at IS NOT NULL) INTO email_ok FROM auth.users u WHERE u.id = b.user_id;
        EXCEPTION WHEN OTHERS THEN
            email_ok := false;
        END;
        IF email_ok IS NOT TRUE THEN
            RAISE EXCEPTION 'email_dogrulanmadi' USING ERRCODE = '22023';
        END IF;
        tel_ok := COALESCE(f.telefon_dogrulama_durumu, '') = 'dogrulandi'
            OR COALESCE(f.telefon_admin_teyit, FALSE) IS TRUE;
        IF tel_ok IS NOT TRUE THEN
            RAISE EXCEPTION 'telefon_teyit_yok' USING ERRCODE = '22023';
        END IF;
    END IF;

    yeni := CASE karar
        WHEN 'dogrula' THEN 'dogrulandi'
        WHEN 'ek_belge' THEN 'ek_belge_gerekli'
        WHEN 'reddet' THEN 'reddedildi'
        WHEN 'askiya_al' THEN 'askiya_alindi'
        WHEN 'dogrulamayi_kaldir' THEN 'reddedildi'
        WHEN 'kalici_kapat' THEN 'kalici_kapatildi'
    END;

    UPDATE public.firma_dogrulama_basvurulari SET
        durum = yeni,
        admin_aciklama = gerekce,
        admin_ic_not = NULLIF(btrim(COALESCE(p_ic_not, '')), ''),
        gerekce_kod = NULLIF(btrim(COALESCE(p_gerekce_kod, '')), ''),
        decided_at = NOW(),
        decided_by = auth.uid(),
        dogrulama_tarihi = CASE WHEN karar = 'dogrula' THEN NOW() ELSE dogrulama_tarihi END,
        sonraki_kontrol = CASE WHEN karar = 'dogrula' THEN NOW() + (ay || ' months')::interval ELSE sonraki_kontrol END,
        oda_sicil_eslesti = CASE WHEN karar = 'dogrula' THEN TRUE ELSE oda_sicil_eslesti END,
        sahiplik_eslesti = CASE WHEN karar = 'dogrula' THEN TRUE ELSE sahiplik_eslesti END,
        updated_at = NOW()
    WHERE id = b.id;

    UPDATE public.firmalar SET
        guven_dogrulama_durumu = CASE
            WHEN karar = 'dogrulamayi_kaldir' THEN 'yok'
            ELSE yeni
        END,
        guven_dogrulama_tarihi = CASE WHEN karar = 'dogrula' THEN NOW() ELSE
            CASE WHEN karar IN ('dogrulamayi_kaldir', 'reddet', 'kalici_kapat') THEN NULL ELSE guven_dogrulama_tarihi END
        END,
        guven_sonraki_kontrol = CASE WHEN karar = 'dogrula' THEN NOW() + (ay || ' months')::interval ELSE
            CASE WHEN karar IN ('dogrulamayi_kaldir', 'reddet', 'kalici_kapat') THEN NULL ELSE guven_sonraki_kontrol END
        END,
        guven_yenileme_ay = CASE WHEN karar = 'dogrula' THEN ay ELSE guven_yenileme_ay END,
        guven_kullanici_aciklama = gerekce,
        updated_at = NOW()
    WHERE id = f.id;

    PERFORM public._fd_log(b.id, f.id::text, 'karar_' || karar, eski, yeni, gerekce, p_gerekce_kod, NULL);

    RETURN jsonb_build_object('ok', true, 'durum', yeni, 'guven_dogrulama_durumu',
        CASE WHEN karar = 'dogrulamayi_kaldir' THEN 'yok' ELSE yeni END);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dogrulama_karar(uuid, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dogrulama_karar(uuid, text, text, text, text, integer) TO authenticated;

-- Admin oda/sahiplik işaretleme
CREATE OR REPLACE FUNCTION public.admin_dogrulama_eslesme_isaretle(
    p_basvuru_id uuid,
    p_oda_sicil boolean,
    p_sahiplik boolean,
    p_telefon_teyit boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    b public.firma_dogrulama_basvurulari%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO b FROM public.firma_dogrulama_basvurulari WHERE id = p_basvuru_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.firma_dogrulama_basvurulari SET
        oda_sicil_eslesti = COALESCE(p_oda_sicil, oda_sicil_eslesti),
        sahiplik_eslesti = COALESCE(p_sahiplik, sahiplik_eslesti),
        updated_at = NOW()
    WHERE id = b.id;
    IF p_telefon_teyit IS NOT NULL THEN
        UPDATE public.firmalar SET
            telefon_admin_teyit = p_telefon_teyit,
            telefon_dogrulama_durumu = CASE WHEN p_telefon_teyit THEN 'dogrulandi' ELSE telefon_dogrulama_durumu END,
            updated_at = NOW()
        WHERE id = b.firma_id;
    END IF;
    PERFORM public._fd_log(b.id, b.firma_id::text, 'eslesme_isaret', NULL, NULL, NULL, NULL,
        jsonb_build_object('oda', p_oda_sicil, 'sahiplik', p_sahiplik, 'telefon', p_telefon_teyit));
    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dogrulama_eslesme_isaretle(uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dogrulama_eslesme_isaretle(uuid, boolean, boolean, boolean) TO authenticated;

-- Özet RPC’ye vergi alanlarını ekle (firma_dogrulama_ozet yeniden)
CREATE OR REPLACE FUNCTION public.firma_dogrulama_ozet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    f public.firmalar%ROWTYPE;
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    belgeler jsonb;
    riskler jsonb;
    icerik jsonb;
    email_ok boolean := false;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO f FROM public.firmalar WHERE user_id = uid
    ORDER BY created_at DESC NULLS LAST LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'firma', NULL, 'basvuru', NULL);
    END IF;

    BEGIN
        SELECT COALESCE((u.email_confirmed_at IS NOT NULL), false) INTO email_ok
        FROM auth.users u WHERE u.id = uid;
    EXCEPTION WHEN OTHERS THEN
        email_ok := false;
    END;

    SELECT * INTO b FROM public.firma_dogrulama_basvurulari
    WHERE firma_id = f.id
    ORDER BY created_at DESC LIMIT 1;

    SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.created_at), '[]'::jsonb)
    INTO belgeler
    FROM public.firma_dogrulama_belgeler d
    WHERE b.id IS NOT NULL AND d.basvuru_id = b.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'risk_kod', r.risk_kod, 'seviye', r.seviye, 'mesaj', r.mesaj
    ) ORDER BY r.created_at), '[]'::jsonb)
    INTO riskler
    FROM public.firma_dogrulama_riskler r
    WHERE b.id IS NOT NULL AND r.basvuru_id = b.id;

    SELECT COALESCE(jsonb_object_agg(i.anahtar, jsonb_build_object('baslik', i.baslik, 'govde', i.govde)), '{}'::jsonb)
    INTO icerik FROM public.aurix_icerik i
    WHERE i.anahtar IN (
        'kvkk_aydinlatma_dogrulama', 'acik_riza_dogrulama',
        'belge_saklama_politikasi', 'rozet_aciklama'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'email_dogrulandi', email_ok,
        'telefon_dogrulama_durumu', COALESCE(f.telefon_dogrulama_durumu, 'bekliyor'),
        'telefon_admin_teyit', COALESCE(f.telefon_admin_teyit, FALSE),
        'firma', jsonb_build_object(
            'id', f.id,
            'firma_adi', f.firma_adi,
            'hukuki_unvan', f.hukuki_unvan,
            'firma_turu', f.firma_turu,
            'isletme_turu', f.isletme_turu,
            'sehir', f.sehir,
            'ilce', f.ilce,
            'yetkili_ad', f.yetkili_ad,
            'vergi_no', f.vergi_no,
            'vergi_dairesi', f.vergi_dairesi,
            'vergi_kimlik_durumu', f.vergi_kimlik_durumu,
            'vergi_kimlik_turu', f.vergi_kimlik_turu,
            'mersis_no', f.mersis_no,
            'sicil_no', f.sicil_no,
            'basvuran_sifati', f.basvuran_sifati,
            'vergi_levha_islem_kodu', f.vergi_levha_islem_kodu,
            'adres', f.adres,
            'durum', f.durum,
            'dogrulanmis', f.dogrulanmis,
            'yayin_durumu', f.yayin_durumu,
            'guven_dogrulama_durumu', f.guven_dogrulama_durumu,
            'guven_dogrulama_tarihi', f.guven_dogrulama_tarihi,
            'guven_sonraki_kontrol', f.guven_sonraki_kontrol,
            'guven_kullanici_aciklama', f.guven_kullanici_aciklama,
            'askiya_alindi', f.askiya_alindi
        ),
        'basvuru', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', b.id,
            'durum', b.durum,
            'admin_aciklama', b.admin_aciklama,
            'gerekce_kod', b.gerekce_kod,
            'risk_skoru', b.risk_skoru,
            'hukuki_unvan', b.hukuki_unvan,
            'vergi_no', b.vergi_no,
            'vergi_dairesi', b.vergi_dairesi,
            'vergi_kimlik_turu', b.vergi_kimlik_turu,
            'vergi_format_durumu', b.vergi_format_durumu,
            'isletme_turu', b.isletme_turu,
            'mersis_no', b.mersis_no,
            'sicil_no', b.sicil_no,
            'basvuran_sifati', b.basvuran_sifati,
            'vergi_levha_islem_kodu', b.vergi_levha_islem_kodu,
            'gib_kontrol_edildi', b.gib_kontrol_edildi,
            'gib_karar', b.gib_karar,
            'submitted_at', b.submitted_at,
            'dogrulama_tarihi', b.dogrulama_tarihi,
            'sonraki_kontrol', b.sonraki_kontrol,
            'created_at', b.created_at
        ) END,
        'belgeler', COALESCE(belgeler, '[]'::jsonb),
        'riskler', COALESCE(riskler, '[]'::jsonb),
        'icerik', COALESCE(icerik, '{}'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_ozet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_ozet() TO authenticated;

COMMENT ON FUNCTION public.admin_vergi_kontrol_karar(uuid, text, text, jsonb, jsonb, boolean) IS
    'Admin GİB manuel kontrol sonucu. Scrape/CAPTCHA yok. Format ≠ resmi doğrulama.';

-- ============================================================
-- 7. Public’ten website/instagram SELECT kaldır (kolon DROP yok)
-- ============================================================
DO $$
BEGIN
    BEGIN
        REVOKE SELECT (website, instagram) ON TABLE public.firmalar FROM anon;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        REVOKE SELECT (website, instagram) ON TABLE public.firmalar FROM authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- Panel RPC: outbound alanları JSON’dan çıkar (kolonlar kalır)
CREATE OR REPLACE FUNCTION public.firma_panel_getir()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    has_owner boolean := public._aurix_col_exists('firmalar', 'owner_id');
    row_json jsonb;
    sql text;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    IF has_owner THEN
        sql := $q$
            SELECT to_jsonb(f) FROM public.firmalar f
            WHERE f.user_id = $1 OR f.owner_id = $1
            ORDER BY f.created_at DESC NULLS LAST
            LIMIT 1
        $q$;
    ELSE
        sql := $q$
            SELECT to_jsonb(f) FROM public.firmalar f
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC NULLS LAST
            LIMIT 1
        $q$;
    END IF;

    EXECUTE sql INTO row_json USING uid;

    IF row_json IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'firma', NULL);
    END IF;

    /* İstemciye website/instagram dönme — keşif AURIX içinde kalsın */
    row_json := row_json - 'website' - 'instagram';

    RETURN jsonb_build_object('ok', true, 'firma', row_json);
END;
$$;

REVOKE ALL ON FUNCTION public.firma_panel_getir() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_panel_getir() TO authenticated;

-- ============================================================
-- 8. Rozet açıklaması + kritik alan tetikleyicisi
-- ============================================================
INSERT INTO public.aurix_icerik (anahtar, baslik, govde) VALUES (
    'rozet_aciklama',
    'Doğrulama Rozeti Açıklaması',
    'Firmanın kayıt ve başvuruda sunduğu belgeler AURIX tarafından kontrol edilmiştir. Bu doğrulama, firmanın tüm işlemlerinin risksiz olduğu veya AURIX tarafından garanti edildiği anlamına gelmez.'
)
ON CONFLICT (anahtar) DO UPDATE SET
    govde = EXCLUDED.govde,
    baslik = EXCLUDED.baslik,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.fd_kritik_alan_degisti()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    kritik boolean := FALSE;
    bid uuid;
    uid uuid;
BEGIN
    IF OLD.guven_dogrulama_durumu IS DISTINCT FROM 'dogrulandi'
       AND COALESCE(OLD.vergi_kimlik_durumu, '') IS DISTINCT FROM 'eslesti' THEN
        RETURN NEW;
    END IF;

    kritik := (
        OLD.firma_adi IS DISTINCT FROM NEW.firma_adi
        OR OLD.hukuki_unvan IS DISTINCT FROM NEW.hukuki_unvan
        OR OLD.vergi_no IS DISTINCT FROM NEW.vergi_no
        OR OLD.vergi_dairesi IS DISTINCT FROM NEW.vergi_dairesi
        OR OLD.mersis_no IS DISTINCT FROM NEW.mersis_no
        OR OLD.sicil_no IS DISTINCT FROM NEW.sicil_no
        OR OLD.yetkili_ad IS DISTINCT FROM NEW.yetkili_ad
        OR OLD.firma_turu IS DISTINCT FROM NEW.firma_turu
        OR OLD.isletme_turu IS DISTINCT FROM NEW.isletme_turu
        OR OLD.sehir IS DISTINCT FROM NEW.sehir
        OR OLD.adres IS DISTINCT FROM NEW.adres
    );

    IF NOT kritik THEN
        RETURN NEW;
    END IF;

    IF OLD.guven_dogrulama_durumu = 'dogrulandi' THEN
        NEW.guven_dogrulama_durumu := 'incelemede';
        NEW.guven_kullanici_aciklama := COALESCE(
            NEW.guven_kullanici_aciklama,
            'Doğrulanmış firma bilgilerinde değişiklik yapıldı; güven doğrulaması yeniden inceleniyor.'
        );
    END IF;

    IF COALESCE(OLD.vergi_kimlik_durumu, '') = 'eslesti' THEN
        NEW.vergi_kimlik_durumu := 'yeniden_belge_gerekli';
    END IF;

    uid := COALESCE(NEW.user_id, OLD.user_id);

    SELECT id INTO bid
    FROM public.firma_dogrulama_basvurulari
    WHERE firma_id = NEW.id
      AND durum IN ('taslak', 'incelemede', 'ek_belge_gerekli', 'yenileme_gerekli', 'dogrulandi')
    ORDER BY created_at DESC
    LIMIT 1;

    IF bid IS NULL AND uid IS NOT NULL THEN
        INSERT INTO public.firma_dogrulama_basvurulari (
            firma_id, user_id, durum, kullanici_aciklama, submitted_at
        ) VALUES (
            NEW.id, uid, 'yenileme_gerekli',
            'Kritik alan değişikliği — yeniden belge/inceleme gerekli.', NOW()
        )
        RETURNING id INTO bid;
    ELSIF bid IS NOT NULL THEN
        UPDATE public.firma_dogrulama_basvurulari
        SET durum = CASE WHEN durum = 'dogrulandi' THEN 'yenileme_gerekli' ELSE durum END,
            updated_at = NOW()
        WHERE id = bid;
    END IF;

    IF bid IS NOT NULL THEN
        PERFORM public._fd_log(
            bid, NEW.id::text, 'kritik_alan_degisti',
            OLD.guven_dogrulama_durumu, NEW.guven_dogrulama_durumu,
            'Kritik kimlik/adres bilgisi değişti', NULL, NULL
        );
    END IF;

    RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

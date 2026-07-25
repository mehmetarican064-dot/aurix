-- AURIX 023 — Admin firma onay/red/askı: yayin_durumu + id tipi uyumu
-- Idempotent. DROP TABLE / TRUNCATE / DELETE yok.
-- Auth / Site URL / client key ayarlarına dokunulmaz.
--
-- Kök neden (022 sonrası):
-- 1) Public SELECT: dogrulanmis + durum=onaylandi + !aski + yayin_durumu=yayinda
-- 2) Eski admin_firma_onayla yayin_durumu güncellemezse firma public’te görünmez
-- 3) firmalar.id bigint iken p_firma_id uuid → WHERE id = p_firma_id çalışma anında hata
--
-- Bu dosya ile supabase/maintenance/apply_023_admin_firma_onay_yayin_fix.sql
-- aynıdır. Yalnızca BİRİNİ çalıştırın.

-- ============================================================
-- 1. Kolon güvencesi (022 kısmen uygulandıysa)
-- ============================================================
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS yayin_durumu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS askiya_alindi BOOLEAN DEFAULT FALSE;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS askiya_alma_nedeni TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS durum TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS dogrulanmis BOOLEAN;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS onaylayan_admin UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS onay_tarihi TIMESTAMPTZ;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS red_nedeni TEXT;

UPDATE public.firmalar
SET yayin_durumu = 'taslak'
WHERE yayin_durumu IS NULL OR btrim(yayin_durumu) = '';

DO $$
BEGIN
    BEGIN
        ALTER TABLE public.firmalar
            ALTER COLUMN yayin_durumu SET DEFAULT 'taslak';
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.firmalar
            ALTER COLUMN yayin_durumu SET NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

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

UPDATE public.firmalar
SET askiya_alindi = FALSE
WHERE askiya_alindi IS NULL;

-- ============================================================
-- 2. Eski / tutarsız kayıt backfill (güvenli)
-- ============================================================
UPDATE public.firmalar
SET durum = CASE
    WHEN dogrulanmis IS TRUE THEN 'onaylandi'
    ELSE 'beklemede'
END
WHERE durum IS NULL
   OR btrim(durum) = ''
   OR durum NOT IN ('beklemede', 'onaylandi', 'reddedildi');

UPDATE public.firmalar
SET dogrulanmis = TRUE
WHERE durum = 'onaylandi' AND dogrulanmis IS DISTINCT FROM TRUE;

UPDATE public.firmalar
SET dogrulanmis = FALSE
WHERE durum IN ('beklemede', 'reddedildi') AND dogrulanmis IS DISTINCT FROM FALSE;

-- Onaylı + askıda değil → yayında (022 sonrası takılı incelemede/taslak kayıtlar)
UPDATE public.firmalar
SET yayin_durumu = 'yayinda'
WHERE durum = 'onaylandi'
  AND COALESCE(askiya_alindi, FALSE) IS FALSE
  AND yayin_durumu IS DISTINCT FROM 'yayinda';

-- Bekleyen başvurular → incelemede
UPDATE public.firmalar
SET yayin_durumu = 'incelemede'
WHERE durum = 'beklemede'
  AND COALESCE(askiya_alindi, FALSE) IS FALSE
  AND yayin_durumu IS DISTINCT FROM 'incelemede';

-- Reddedilenler → taslak
UPDATE public.firmalar
SET yayin_durumu = 'taslak'
WHERE durum = 'reddedildi'
  AND yayin_durumu IS DISTINCT FROM 'taslak';

-- ============================================================
-- 3. Yardımcı: hedef_id uuid (bigint id’lerde NULL)
-- ============================================================
CREATE OR REPLACE FUNCTION public._admin_hedef_uuid(p_id text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_id IS NOT NULL
         AND btrim(p_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN btrim(p_id)::uuid
        ELSE NULL
    END;
$$;

REVOKE ALL ON FUNCTION public._admin_hedef_uuid(text) FROM PUBLIC;

-- ============================================================
-- 4. Eski uuid imzalarını kaldır (overload çakışması olmasın)
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_firma_onayla(uuid);
DROP FUNCTION IF EXISTS public.admin_firma_reddet(uuid, text);
DROP FUNCTION IF EXISTS public.admin_firma_askiya_al(uuid, text);
DROP FUNCTION IF EXISTS public.admin_firma_aski_kaldir(uuid);

-- ============================================================
-- 5. admin_firma_onayla (text id — uuid veya bigint)
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

    SELECT * INTO eski
    FROM public.firmalar
    WHERE id::text = fid
    FOR UPDATE;

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
        askiya_alma_nedeni = NULL,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    IF NOT FOUND OR yeni.id IS NULL THEN
        RAISE EXCEPTION 'firma_onay_basarisiz' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public._admin_log(
        'firma_onayla',
        'firma',
        public._admin_hedef_uuid(eski.id::text),
        'Firma onaylandı',
        jsonb_build_object(
            'id', eski.id,
            'durum', eski.durum,
            'dogrulanmis', eski.dogrulanmis,
            'yayin_durumu', eski.yayin_durumu,
            'askiya_alindi', eski.askiya_alindi
        ),
        jsonb_build_object(
            'id', yeni.id,
            'durum', yeni.durum,
            'dogrulanmis', yeni.dogrulanmis,
            'yayin_durumu', yeni.yayin_durumu,
            'askiya_alindi', yeni.askiya_alindi
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'id', yeni.id,
        'durum', yeni.durum,
        'dogrulanmis', yeni.dogrulanmis,
        'yayin_durumu', yeni.yayin_durumu,
        'askiya_alindi', yeni.askiya_alindi
    );
END;
$$;

-- ============================================================
-- 6. admin_firma_reddet
-- ============================================================
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

    SELECT * INTO eski
    FROM public.firmalar
    WHERE id::text = fid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        durum = 'reddedildi',
        dogrulanmis = FALSE,
        yayin_durumu = 'taslak',
        red_nedeni = neden,
        onay_tarihi = NULL,
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    IF NOT FOUND OR yeni.id IS NULL THEN
        RAISE EXCEPTION 'firma_red_basarisiz' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public._admin_log(
        'firma_reddet',
        'firma',
        public._admin_hedef_uuid(eski.id::text),
        neden,
        jsonb_build_object(
            'id', eski.id,
            'durum', eski.durum,
            'yayin_durumu', eski.yayin_durumu
        ),
        jsonb_build_object(
            'id', yeni.id,
            'durum', yeni.durum,
            'red_nedeni', neden,
            'yayin_durumu', yeni.yayin_durumu,
            'dogrulanmis', yeni.dogrulanmis
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'id', yeni.id,
        'durum', yeni.durum,
        'dogrulanmis', yeni.dogrulanmis,
        'yayin_durumu', yeni.yayin_durumu
    );
END;
$$;

-- ============================================================
-- 7. admin_firma_askiya_al
-- ============================================================
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

    SELECT * INTO eski
    FROM public.firmalar
    WHERE id::text = fid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        askiya_alindi = TRUE,
        askiya_alma_nedeni = neden,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    IF NOT FOUND OR yeni.id IS NULL THEN
        RAISE EXCEPTION 'firma_aski_basarisiz' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public._admin_log(
        'firma_askiya_al',
        'firma',
        public._admin_hedef_uuid(eski.id::text),
        neden,
        jsonb_build_object(
            'id', eski.id,
            'askiya_alindi', eski.askiya_alindi,
            'yayin_durumu', eski.yayin_durumu
        ),
        jsonb_build_object(
            'id', yeni.id,
            'askiya_alindi', true,
            'neden', neden,
            'durum', yeni.durum,
            'yayin_durumu', yeni.yayin_durumu
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'id', yeni.id,
        'askiya_alindi', true,
        'durum', yeni.durum,
        'yayin_durumu', yeni.yayin_durumu
    );
END;
$$;

-- ============================================================
-- 8. admin_firma_aski_kaldir
-- ============================================================
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
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;
    IF fid = '' THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO eski
    FROM public.firmalar
    WHERE id::text = fid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.firmalar SET
        askiya_alindi = FALSE,
        askiya_alma_nedeni = NULL,
        yayin_durumu = CASE
            WHEN durum = 'onaylandi' THEN 'yayinda'
            WHEN durum = 'beklemede' THEN 'incelemede'
            ELSE COALESCE(yayin_durumu, 'taslak')
        END,
        updated_at = NOW()
    WHERE id = eski.id
    RETURNING * INTO yeni;

    IF NOT FOUND OR yeni.id IS NULL THEN
        RAISE EXCEPTION 'firma_aski_kaldir_basarisiz' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public._admin_log(
        'firma_aski_kaldir',
        'firma',
        public._admin_hedef_uuid(eski.id::text),
        'Askı kaldırıldı',
        jsonb_build_object(
            'id', eski.id,
            'askiya_alindi', eski.askiya_alindi,
            'yayin_durumu', eski.yayin_durumu
        ),
        jsonb_build_object(
            'id', yeni.id,
            'askiya_alindi', false,
            'yayin_durumu', yeni.yayin_durumu,
            'durum', yeni.durum
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'id', yeni.id,
        'askiya_alindi', false,
        'durum', yeni.durum,
        'yayin_durumu', yeni.yayin_durumu
    );
END;
$$;

-- ============================================================
-- 9. Yetkiler
-- ============================================================
REVOKE ALL ON FUNCTION public.admin_firma_onayla(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_reddet(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_askiya_al(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_firma_aski_kaldir(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_firma_onayla(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_reddet(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_askiya_al(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_firma_aski_kaldir(text) TO authenticated;

COMMENT ON FUNCTION public.admin_firma_onayla(text) IS
    'Admin firma onayı: durum=onaylandi, dogrulanmis=true, yayin_durumu=yayinda, askı temiz. id text (uuid/bigint).';
COMMENT ON FUNCTION public.admin_firma_reddet(text, text) IS
    'Admin firma reddi: durum=reddedildi, dogrulanmis=false, yayin_durumu=taslak.';
COMMENT ON FUNCTION public.admin_firma_askiya_al(text, text) IS
    'Admin firma askıya alma. Public RLS askıdaki firmayı gizler.';
COMMENT ON FUNCTION public.admin_firma_aski_kaldir(text) IS
    'Admin askı kaldırma; onaylıysa yayin_durumu=yayinda.';

-- AURIX 033 — is_talepleri moderasyon CHECK hotfix
-- Idempotent. DROP TABLE yok.
--
-- Bu dosya = supabase/maintenance/apply_033_is_talepleri_moderasyon_hotfix.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın.
--
-- 032 hata nedeni: is_talepleri_moderasyon_check hâlâ açıkken
--   UPDATE moderasyon_durumu = 'yayindan_kaldirildi' çalıştı.
-- Production CHECK (013): moderasyon_durumu IN ('aktif','incelemede','kaldirildi')
--
-- Akış: DROP CHECK → normalize → DISTINCT NOTICE → yeni CHECK → RPC hizala
-- Sonra apply_032 yeniden çalıştırılabilir.

DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'is_talepleri tablosu bulunamadı';
    END IF;
END $$;

-- ============================================================
-- 0. CHECK ifadelerini raporla (pg_get_constraintdef)
-- ============================================================
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '033: moderasyon CHECK / sütun analizi';
    FOR r IN
        SELECT c.conname, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        WHERE c.conrelid = 'public.is_talepleri'::regclass
          AND c.contype = 'c'
          AND (
              c.conname ILIKE '%moderasyon%'
              OR pg_get_constraintdef(c.oid) ILIKE '%moderasyon%'
          )
        ORDER BY c.conname
    LOOP
        RAISE NOTICE 'CHECK % => %', r.conname, r.def;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'is_talepleri'
          AND column_name = 'moderasyon_durumu'
    ) THEN
        RAISE NOTICE 'Sütun: moderasyon_durumu VAR';
    ELSE
        RAISE NOTICE 'Sütun: moderasyon_durumu YOK';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'is_talepleri'
          AND column_name = 'moderasyon'
    ) THEN
        RAISE NOTICE 'Sütun: moderasyon VAR (ayrı kolon)';
    ELSE
        RAISE NOTICE 'Sütun: moderasyon YOK (yalnızca moderasyon_durumu kullanılıyor)';
    END IF;
END $$;

-- ============================================================
-- 1. DROP tüm moderasyon CHECK’leri (önce drop, sonra normalize)
-- ============================================================
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_check;

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_durumu_check;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'public.is_talepleri'::regclass
          AND c.contype = 'c'
          AND (
              c.conname ILIKE '%moderasyon%'
              OR pg_get_constraintdef(c.oid) ILIKE '%moderasyon%'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS %I', r.conname);
        RAISE NOTICE '033: DROP CONSTRAINT %', r.conname;
    END LOOP;
END $$;

ALTER TABLE public.is_talepleri
    ADD COLUMN IF NOT EXISTS moderasyon_durumu TEXT;

-- ============================================================
-- 2. Eski production değerlerini normalize et
-- ============================================================
UPDATE public.is_talepleri
SET moderasyon_durumu = CASE
    WHEN moderasyon_durumu IS NULL THEN NULL
    WHEN lower(btrim(moderasyon_durumu)) IN ('aktif', 'onaylandi', 'acik') THEN 'aktif'
    WHEN lower(btrim(moderasyon_durumu)) IN ('incelemede', 'beklemede') THEN 'incelemede'
    WHEN lower(btrim(moderasyon_durumu)) IN (
        'yayindan_kaldirildi', 'kaldirildi', 'reddedildi'
    ) THEN 'yayindan_kaldirildi'
    ELSE lower(btrim(moderasyon_durumu))
END
WHERE moderasyon_durumu IS NOT NULL
  AND moderasyon_durumu IS DISTINCT FROM CASE
    WHEN lower(btrim(moderasyon_durumu)) IN ('aktif', 'onaylandi', 'acik') THEN 'aktif'
    WHEN lower(btrim(moderasyon_durumu)) IN ('incelemede', 'beklemede') THEN 'incelemede'
    WHEN lower(btrim(moderasyon_durumu)) IN (
        'yayindan_kaldirildi', 'kaldirildi', 'reddedildi'
    ) THEN 'yayindan_kaldirildi'
    ELSE lower(btrim(moderasyon_durumu))
END;

-- Yayınlanmış açık taleplerde NULL → aktif
UPDATE public.is_talepleri
SET moderasyon_durumu = 'aktif'
WHERE moderasyon_durumu IS NULL
  AND durum IN ('Acik', 'teklif_bekliyor');

-- ============================================================
-- 3. DISTINCT raporu (tahmin yok — canlı tablo)
-- ============================================================
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '033: DISTINCT moderasyon_durumu (normalize sonrası)';
    FOR r IN
        SELECT
            moderasyon_durumu AS deger,
            COUNT(*)::int AS adet
        FROM public.is_talepleri
        GROUP BY moderasyon_durumu
        ORDER BY adet DESC, moderasyon_durumu NULLS FIRST
    LOOP
        RAISE NOTICE '  % => % satır', COALESCE(r.deger, '<NULL>'), r.adet;
    END LOOP;
END $$;

-- ============================================================
-- 4. Yeni CHECK (standart enum)
-- ============================================================
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.is_talepleri
            ALTER COLUMN moderasyon_durumu SET DEFAULT 'aktif';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '033: default: %', SQLERRM;
    END;

    ALTER TABLE public.is_talepleri
        DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_check;
    ALTER TABLE public.is_talepleri
        DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_durumu_check;

    ALTER TABLE public.is_talepleri
        ADD CONSTRAINT is_talepleri_moderasyon_durumu_check
        CHECK (
            moderasyon_durumu IS NULL
            OR moderasyon_durumu IN (
                'aktif',
                'incelemede',
                'yayindan_kaldirildi'
            )
        );

    RAISE NOTICE '033: yeni CHECK is_talepleri_moderasyon_durumu_check = aktif|incelemede|yayindan_kaldirildi';
END $$;

-- ============================================================
-- 5. admin_is_moderasyon — eski isimleri kabul et, yeni enum yaz
-- ============================================================
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

    IF d IN ('kaldirildi', 'reddedildi', 'yayindan_kaldirildi', 'yayindan_kaldir') THEN
        d := 'yayindan_kaldirildi';
    ELSIF d IN ('beklemede', 'incelemede') THEN
        d := 'incelemede';
    ELSIF d IN ('aktif', 'onaylandi', 'acik', 'tekrar_yayin', 'yayina_ac') THEN
        d := 'aktif';
    END IF;

    IF d NOT IN ('aktif', 'incelemede', 'yayindan_kaldirildi') THEN
        RAISE EXCEPTION 'gecersiz_moderasyon' USING ERRCODE = '22023';
    END IF;
    IF d = 'yayindan_kaldirildi' AND length(btrim(COALESCE(p_not, ''))) < 3 THEN
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

    IF to_regprocedure('public._admin_log(text,text,uuid,text,jsonb,jsonb)') IS NOT NULL THEN
        PERFORM public._admin_log(
            'is_moderasyon', 'is_talebi', p_is_id, COALESCE(p_not, d),
            jsonb_build_object('moderasyon_durumu', eski),
            jsonb_build_object('moderasyon_durumu', d)
        );
    END IF;

    RETURN jsonb_build_object('ok', true, 'id', p_is_id, 'moderasyon_durumu', d);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_is_moderasyon(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_is_moderasyon(uuid, text, text) TO authenticated;

-- ============================================================
-- 6. admin_is_talebi_moderasyon — yazılan enum = CHECK
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_is_talebi_moderasyon(
    p_id text,
    p_islem text,
    p_not text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    islem text := lower(btrim(COALESCE(p_islem, '')));
    eski_durum text;
    eski_mod text;
    yeni_durum text;
    yeni_mod text;
    is_id_type text := NULL;
    pid text := btrim(COALESCE(p_id, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF islem IN ('kaldirildi', 'kaldir', 'yayindan_kaldir', 'reddedildi', 'yayindan_kaldirildi') THEN
        islem := 'yayindan_kaldir';
    ELSIF islem IN ('aktif', 'tekrar_yayin', 'yayina_ac', 'onaylandi', 'acik') THEN
        islem := 'tekrar_yayin';
    ELSIF islem IN ('beklemede', 'incelemede') THEN
        islem := 'incelemede';
    END IF;

    IF islem NOT IN ('yayindan_kaldir', 'tekrar_yayin', 'iptal', 'arsiv', 'incelemede') THEN
        RAISE EXCEPTION 'gecersiz_islem' USING ERRCODE = '22023';
    END IF;

    SELECT i.durum, i.moderasyon_durumu
    INTO eski_durum, eski_mod
    FROM public.is_talepleri i
    WHERE i.id::text = pid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    yeni_durum := eski_durum;
    yeni_mod := eski_mod;

    IF islem = 'yayindan_kaldir' THEN
        yeni_mod := 'yayindan_kaldirildi';
        IF length(btrim(COALESCE(p_not, ''))) < 3 THEN
            RAISE EXCEPTION 'kaldirma_nedeni_zorunlu' USING ERRCODE = '22023';
        END IF;
    ELSIF islem = 'tekrar_yayin' THEN
        yeni_mod := 'aktif';
        IF eski_durum IN ('taslak', 'iptal_edildi', 'arsivlendi', 'Iptal', 'Acik')
           OR eski_durum IS NULL OR eski_durum = '' THEN
            yeni_durum := 'teklif_bekliyor';
        END IF;
        UPDATE public.is_talepleri SET
            yayinlanma_tarihi = COALESCE(yayinlanma_tarihi, NOW()),
            arsiv_tarihi = NULL,
            iptal_tarihi = NULL
        WHERE id::text = pid;
    ELSIF islem = 'incelemede' THEN
        yeni_mod := 'incelemede';
    ELSIF islem = 'iptal' THEN
        yeni_durum := 'iptal_edildi';
        UPDATE public.is_talepleri SET iptal_tarihi = NOW()
        WHERE id::text = pid;
    ELSIF islem = 'arsiv' THEN
        yeni_durum := 'arsivlendi';
        UPDATE public.is_talepleri SET arsiv_tarihi = NOW()
        WHERE id::text = pid;
    END IF;

    UPDATE public.is_talepleri SET
        durum = yeni_durum,
        moderasyon_durumu = COALESCE(yeni_mod, moderasyon_durumu),
        moderasyon_notu = CASE
            WHEN islem = 'tekrar_yayin' THEN NULL
            WHEN p_not IS NOT NULL THEN btrim(p_not)
            ELSE moderasyon_notu
        END
    WHERE id::text = pid;

    BEGIN
        is_id_type := public._aurix_col_type('is_talepleri', 'id');
    EXCEPTION WHEN OTHERS THEN
        is_id_type := NULL;
    END;

    IF to_regclass('public.is_talebi_islem_loglari') IS NOT NULL AND is_id_type IS NOT NULL THEN
        BEGIN
            EXECUTE format(
                $sql$
                INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar)
                VALUES ($1::%s, $2, $3, $4)
                $sql$,
                is_id_type
            ) USING pid, auth.uid(), islem, NULLIF(btrim(COALESCE(p_not, '')), '');
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'islem_log: %', SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', pid,
        'durum', yeni_durum,
        'moderasyon_durumu', yeni_mod
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) IS
    '033: moderasyon_durumu = aktif|incelemede|yayindan_kaldirildi';

DO $$
BEGIN
    RAISE NOTICE '033 tamam: CHECK drop→normalize→DISTINCT→yeni CHECK→RPC. Sonra apply_032 yeniden çalıştırın.';
END $$;

-- AURIX 031 — İş talebi enum rebuild (güvenli)
-- Idempotent. DROP TABLE yok. Veri silinmez; bilinmeyen enum → NULL (veya güvenli varsayılan).
--
-- Bu dosya = supabase/maintenance/apply_031_is_talepleri_enum_rebuild.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın (030 sonrası / 030 başarısızsa).
--
-- Sıra (zorunlu):
--   1) Bütün enum CHECK’leri DROP
--   2) Constraint YOKKEN normalize UPDATE
--   3) DISTINCT doğrulama + NOTICE raporu
--   4) Yeni CHECK’leri ADD
--
-- Hiçbir UPDATE aktif CHECK altında çalışmaz.

DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'is_talepleri tablosu bulunamadı';
    END IF;
END $$;

-- ============================================================
-- 1. DROP — tüm ilgili enum CHECK’ler
-- ============================================================
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_malzeme_saglayici_check;
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_tas_durumu_check;
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_teslim_sekli_check;
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_butce_tipi_check;
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_butce_gorunurlugu_check;
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_gorunurluk_check;
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_dosya_gorunurlugu_check;
ALTER TABLE public.is_talepleri DROP CONSTRAINT IF EXISTS is_talepleri_aciliyet_check;

-- ============================================================
-- 2. NORMALIZE — constraint yokken
-- ============================================================
DO $$
DECLARE
    r record;
BEGIN
    -- ---------- malzeme_saglayici ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'malzeme_saglayici'
    ) THEN
        UPDATE public.is_talepleri
        SET malzeme_saglayici = CASE
            WHEN malzeme_saglayici IS NULL THEN NULL
            WHEN lower(btrim(malzeme_saglayici)) IN (
                'is_veren', 'isveren', 'is_veren_saglayacak', 'musteri'
            ) THEN 'is_veren'
            WHEN malzeme_saglayici ILIKE '%işveren%'
              OR malzeme_saglayici ILIKE '%isveren%'
              OR malzeme_saglayici ILIKE '%iş veren%'
              THEN 'is_veren'
            WHEN lower(btrim(malzeme_saglayici)) IN (
                'hizmet_veren', 'firma', 'hizmeti_veren_firma', 'hizmeti_veren'
            ) THEN 'hizmet_veren'
            WHEN malzeme_saglayici ILIKE '%hizmet%'
              OR malzeme_saglayici ILIKE '%firma%'
              THEN 'hizmet_veren'
            WHEN lower(btrim(malzeme_saglayici)) IN (
                'gorusulecek', 'goruselecek', 'karisik'
            ) THEN 'gorusulecek'
            WHEN malzeme_saglayici ILIKE '%görüş%'
              OR malzeme_saglayici ILIKE '%gorus%'
              THEN 'gorusulecek'
            ELSE NULL
        END
        WHERE malzeme_saglayici IS NOT NULL
          AND malzeme_saglayici NOT IN ('is_veren', 'hizmet_veren', 'gorusulecek');
    END IF;

    -- ---------- tas_durumu ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'tas_durumu'
    ) THEN
        UPDATE public.is_talepleri
        SET tas_durumu = CASE
            WHEN tas_durumu IS NULL THEN NULL
            WHEN lower(btrim(tas_durumu)) IN ('yok', 'tas_yok') THEN 'yok'
            WHEN tas_durumu ILIKE '%taş yok%' OR tas_durumu ILIKE '%tas yok%' THEN 'yok'
            WHEN lower(btrim(tas_durumu)) IN ('is_veren', 'isveren') THEN 'is_veren'
            WHEN tas_durumu ILIKE '%işveren%' OR tas_durumu ILIKE '%isveren%'
              OR tas_durumu ILIKE '%iş veren%' THEN 'is_veren'
            WHEN lower(btrim(tas_durumu)) IN ('hizmet_veren', 'firma') THEN 'hizmet_veren'
            WHEN tas_durumu ILIKE '%firma%' OR tas_durumu ILIKE '%hizmet%' THEN 'hizmet_veren'
            WHEN lower(btrim(tas_durumu)) IN (
                'var', 'kismen', 'belirtilmedi', 'gorusulecek', 'goruselecek'
            ) THEN 'gorusulecek'
            WHEN tas_durumu ILIKE '%görüş%' OR tas_durumu ILIKE '%gorus%' THEN 'gorusulecek'
            ELSE NULL
        END
        WHERE tas_durumu IS NOT NULL
          AND tas_durumu NOT IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek');
    END IF;

    -- ---------- teslim_sekli (030’un takıldığı alan) ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'teslim_sekli'
    ) THEN
        UPDATE public.is_talepleri
        SET teslim_sekli = CASE
            WHEN teslim_sekli IS NULL THEN NULL
            WHEN lower(btrim(teslim_sekli)) IN ('elden', 'elden_teslim') THEN 'elden'
            WHEN teslim_sekli ILIKE '%elden%' THEN 'elden'
            WHEN lower(btrim(teslim_sekli)) = 'kargo' THEN 'kargo'
            WHEN teslim_sekli ILIKE '%kargo%' THEN 'kargo'
            WHEN lower(btrim(teslim_sekli)) = 'kurye' THEN 'kurye'
            WHEN teslim_sekli ILIKE '%kurye%' THEN 'kurye'
            WHEN lower(btrim(teslim_sekli)) IN (
                'gorusulecek', 'goruselecek', 'anlasmali', 'belirtilmedi', 'anlasmali_kargo'
            ) THEN 'gorusulecek'
            WHEN teslim_sekli ILIKE '%görüş%'
              OR teslim_sekli ILIKE '%gorus%'
              OR teslim_sekli ILIKE '%anlaş%'
              OR teslim_sekli ILIKE '%anlas%'
              THEN 'gorusulecek'
            ELSE NULL
        END
        WHERE teslim_sekli IS NOT NULL
          AND teslim_sekli NOT IN ('elden', 'kargo', 'kurye', 'gorusulecek');
    END IF;

    -- ---------- butce_tipi ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'butce_tipi'
    ) THEN
        UPDATE public.is_talepleri
        SET butce_tipi = CASE
            WHEN butce_tipi IS NULL THEN NULL
            WHEN lower(btrim(butce_tipi)) IN ('teklif_bekliyorum') THEN 'teklif_bekliyorum'
            WHEN butce_tipi ILIKE '%teklif%' THEN 'teklif_bekliyorum'
            WHEN lower(btrim(butce_tipi)) IN ('tahmini', 'aralik') THEN 'tahmini'
            WHEN butce_tipi ILIKE '%tahmin%' OR butce_tipi ILIKE '%aralık%'
              OR butce_tipi ILIKE '%aralik%' THEN 'tahmini'
            WHEN lower(btrim(butce_tipi)) = 'sabit' THEN 'sabit'
            WHEN butce_tipi ILIKE '%sabit%' THEN 'sabit'
            ELSE 'teklif_bekliyorum'
        END
        WHERE butce_tipi IS NOT NULL
          AND butce_tipi NOT IN ('teklif_bekliyorum', 'tahmini', 'sabit');
    END IF;

    -- ---------- butce_gorunurlugu ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'butce_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri
        SET butce_gorunurlugu = CASE
            WHEN butce_gorunurlugu IS NULL THEN NULL
            WHEN lower(btrim(butce_gorunurlugu)) IN ('herkese', 'herkese_acik') THEN 'herkese'
            WHEN butce_gorunurlugu ILIKE '%herkese%' THEN 'herkese'
            WHEN lower(btrim(butce_gorunurlugu)) IN (
                'dogrulanmis_firmalar', 'gizli', 'teklif_sonrasi'
            ) THEN 'dogrulanmis_firmalar'
            ELSE 'dogrulanmis_firmalar'
        END
        WHERE butce_gorunurlugu IS NOT NULL
          AND butce_gorunurlugu NOT IN ('herkese', 'dogrulanmis_firmalar');
    END IF;

    -- ---------- gorunurluk ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'gorunurluk'
    ) THEN
        UPDATE public.is_talepleri
        SET gorunurluk = CASE
            WHEN gorunurluk IS NULL THEN NULL
            WHEN lower(btrim(gorunurluk)) IN (
                'tum_dogrulanmis_firmalar', 'secili_kategoriler'
            ) THEN 'tum_dogrulanmis_firmalar'
            WHEN gorunurluk ILIKE '%tüm%' OR gorunurluk ILIKE '%tum%' THEN 'tum_dogrulanmis_firmalar'
            WHEN lower(btrim(gorunurluk)) = 'secilen_sehir' THEN 'secilen_sehir'
            WHEN gorunurluk ILIKE '%şehir%' OR gorunurluk ILIKE '%sehir%' THEN 'secilen_sehir'
            WHEN lower(btrim(gorunurluk)) IN ('davet_edilen', 'ozel') THEN 'davet_edilen'
            WHEN gorunurluk ILIKE '%davet%' THEN 'davet_edilen'
            ELSE 'tum_dogrulanmis_firmalar'
        END
        WHERE gorunurluk IS NOT NULL
          AND gorunurluk NOT IN (
              'tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen'
          );
    END IF;

    -- ---------- dosya_gorunurlugu ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'dosya_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri
        SET dosya_gorunurlugu = CASE
            WHEN dosya_gorunurlugu IS NULL THEN NULL
            WHEN lower(btrim(dosya_gorunurlugu)) IN (
                'teklif_sonrasi', 'teklif_verenler'
            ) THEN 'teklif_sonrasi'
            WHEN dosya_gorunurlugu ILIKE '%teklif%' THEN 'teklif_sonrasi'
            WHEN lower(btrim(dosya_gorunurlugu)) IN (
                'talebi_gorenler', 'sadece_sahip'
            ) THEN 'talebi_gorenler'
            ELSE 'talebi_gorenler'
        END
        WHERE dosya_gorunurlugu IS NOT NULL
          AND dosya_gorunurlugu NOT IN ('talebi_gorenler', 'teklif_sonrasi');
    END IF;

    -- ---------- aciliyet ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'aciliyet'
    ) THEN
        UPDATE public.is_talepleri
        SET aciliyet = CASE
            WHEN aciliyet IS NULL THEN NULL
            WHEN lower(btrim(aciliyet)) IN ('standart', 'standard') THEN 'standart'
            WHEN lower(btrim(aciliyet)) IN ('oncelikli', 'öncelikli') THEN 'oncelikli'
            WHEN aciliyet ILIKE '%öncel%' OR aciliyet ILIKE '%oncel%' THEN 'oncelikli'
            WHEN lower(btrim(aciliyet)) = 'acil' THEN 'acil'
            WHEN aciliyet ILIKE '%acil%' THEN 'acil'
            ELSE 'standart'
        END
        WHERE aciliyet IS NOT NULL
          AND aciliyet NOT IN ('standart', 'oncelikli', 'acil');
    END IF;

    RAISE NOTICE '031 normalize UPDATE tamamlandı.';
END $$;

-- ============================================================
-- 3. DOĞRULAMA — DISTINCT rapor (NOTICE)
-- ============================================================
DO $$
DECLARE
    r record;
    bad int;
BEGIN
    RAISE NOTICE '======= 031 ENUM DOĞRULAMA (DISTINCT) =======';

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'malzeme_saglayici'
    ) THEN
        FOR r IN
            SELECT COALESCE(malzeme_saglayici, '<NULL>') AS v, COUNT(*)::int AS n
            FROM public.is_talepleri
            GROUP BY malzeme_saglayici
            ORDER BY 1
        LOOP
            RAISE NOTICE 'malzeme_saglayici | % | adet=%', r.v, r.n;
        END LOOP;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'tas_durumu'
    ) THEN
        FOR r IN
            SELECT COALESCE(tas_durumu, '<NULL>') AS v, COUNT(*)::int AS n
            FROM public.is_talepleri
            GROUP BY tas_durumu
            ORDER BY 1
        LOOP
            RAISE NOTICE 'tas_durumu | % | adet=%', r.v, r.n;
        END LOOP;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'teslim_sekli'
    ) THEN
        FOR r IN
            SELECT COALESCE(teslim_sekli, '<NULL>') AS v, COUNT(*)::int AS n
            FROM public.is_talepleri
            GROUP BY teslim_sekli
            ORDER BY 1
        LOOP
            RAISE NOTICE 'teslim_sekli | % | adet=%', r.v, r.n;
        END LOOP;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'butce_tipi'
    ) THEN
        FOR r IN
            SELECT COALESCE(butce_tipi, '<NULL>') AS v, COUNT(*)::int AS n
            FROM public.is_talepleri
            GROUP BY butce_tipi
            ORDER BY 1
        LOOP
            RAISE NOTICE 'butce_tipi | % | adet=%', r.v, r.n;
        END LOOP;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'gorunurluk'
    ) THEN
        FOR r IN
            SELECT COALESCE(gorunurluk, '<NULL>') AS v, COUNT(*)::int AS n
            FROM public.is_talepleri
            GROUP BY gorunurluk
            ORDER BY 1
        LOOP
            RAISE NOTICE 'gorunurluk | % | adet=%', r.v, r.n;
        END LOOP;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'dosya_gorunurlugu'
    ) THEN
        FOR r IN
            SELECT COALESCE(dosya_gorunurlugu, '<NULL>') AS v, COUNT(*)::int AS n
            FROM public.is_talepleri
            GROUP BY dosya_gorunurlugu
            ORDER BY 1
        LOOP
            RAISE NOTICE 'dosya_gorunurlugu | % | adet=%', r.v, r.n;
        END LOOP;
    END IF;

    -- Geçersiz kalan varsa CHECK eklemeden önce temizle + uyar
    bad := 0;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'teslim_sekli'
    ) THEN
        SELECT COUNT(*) INTO bad FROM public.is_talepleri
        WHERE teslim_sekli IS NOT NULL
          AND teslim_sekli NOT IN ('elden', 'kargo', 'kurye', 'gorusulecek');
        IF bad > 0 THEN
            RAISE NOTICE '031 temizlik: teslim_sekli geçersiz % satır → NULL', bad;
            UPDATE public.is_talepleri
            SET teslim_sekli = NULL
            WHERE teslim_sekli IS NOT NULL
              AND teslim_sekli NOT IN ('elden', 'kargo', 'kurye', 'gorusulecek');
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'malzeme_saglayici'
    ) THEN
        UPDATE public.is_talepleri
        SET malzeme_saglayici = NULL
        WHERE malzeme_saglayici IS NOT NULL
          AND malzeme_saglayici NOT IN ('is_veren', 'hizmet_veren', 'gorusulecek');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'tas_durumu'
    ) THEN
        UPDATE public.is_talepleri
        SET tas_durumu = NULL
        WHERE tas_durumu IS NOT NULL
          AND tas_durumu NOT IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'butce_tipi'
    ) THEN
        UPDATE public.is_talepleri
        SET butce_tipi = 'teklif_bekliyorum'
        WHERE butce_tipi IS NOT NULL
          AND butce_tipi NOT IN ('teklif_bekliyorum', 'tahmini', 'sabit');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'butce_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri
        SET butce_gorunurlugu = 'dogrulanmis_firmalar'
        WHERE butce_gorunurlugu IS NOT NULL
          AND butce_gorunurlugu NOT IN ('herkese', 'dogrulanmis_firmalar');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'gorunurluk'
    ) THEN
        UPDATE public.is_talepleri
        SET gorunurluk = 'tum_dogrulanmis_firmalar'
        WHERE gorunurluk IS NOT NULL
          AND gorunurluk NOT IN (
              'tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen'
          );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'dosya_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri
        SET dosya_gorunurlugu = 'talebi_gorenler'
        WHERE dosya_gorunurlugu IS NOT NULL
          AND dosya_gorunurlugu NOT IN ('talebi_gorenler', 'teklif_sonrasi');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'aciliyet'
    ) THEN
        UPDATE public.is_talepleri
        SET aciliyet = 'standart'
        WHERE aciliyet IS NOT NULL
          AND aciliyet NOT IN ('standart', 'oncelikli', 'acil');
    END IF;

    RAISE NOTICE '======= 031 DOĞRULAMA BİTTİ — CHECK eklenecek =======';
END $$;

-- ============================================================
-- 4. ADD CONSTRAINT — yalnızca normalize sonrası
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_malzeme_saglayici_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_malzeme_saglayici_check
            CHECK (
                malzeme_saglayici IS NULL
                OR malzeme_saglayici IN ('is_veren', 'hizmet_veren', 'gorusulecek')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_tas_durumu_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_tas_durumu_check
            CHECK (
                tas_durumu IS NULL
                OR tas_durumu IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_teslim_sekli_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_teslim_sekli_check
            CHECK (
                teslim_sekli IS NULL
                OR teslim_sekli IN ('elden', 'kargo', 'kurye', 'gorusulecek')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_butce_tipi_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_butce_tipi_check
            CHECK (
                butce_tipi IS NULL
                OR butce_tipi IN ('teklif_bekliyorum', 'tahmini', 'sabit')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_butce_gorunurlugu_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_butce_gorunurlugu_check
            CHECK (
                butce_gorunurlugu IS NULL
                OR butce_gorunurlugu IN ('herkese', 'dogrulanmis_firmalar')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_gorunurluk_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_gorunurluk_check
            CHECK (
                gorunurluk IS NULL
                OR gorunurluk IN (
                    'tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_dosya_gorunurlugu_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_dosya_gorunurlugu_check
            CHECK (
                dosya_gorunurlugu IS NULL
                OR dosya_gorunurlugu IN ('talebi_gorenler', 'teklif_sonrasi')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_aciliyet_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_aciliyet_check
            CHECK (
                aciliyet IS NULL
                OR aciliyet IN ('standart', 'oncelikli', 'acil')
            );
    END IF;

    RAISE NOTICE '031 CHECK constraint’leri eklendi / mevcuttu.';
END $$;

COMMENT ON CONSTRAINT is_talepleri_teslim_sekli_check ON public.is_talepleri IS
    '031 rebuild: elden | kargo | kurye | gorusulecek';

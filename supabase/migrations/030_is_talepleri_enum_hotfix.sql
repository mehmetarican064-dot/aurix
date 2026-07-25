-- AURIX 030 — İş talebi enum hotfix (DROP → UPDATE → ADD)
-- Idempotent. DROP TABLE yok.
--
-- Bu dosya = supabase/maintenance/apply_030_is_talepleri_enum_hotfix.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın (029 sonrası veya 029 başarısızsa).
--
-- Kural: Hiçbir UPDATE aktif CHECK altında çalışmaz.
-- Sıra: 1) DROP CONSTRAINT  2) UPDATE normalize  3) ADD CONSTRAINT

DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE NOTICE 'is_talepleri yok; 030 atlandı.';
        RETURN;
    END IF;
END $$;

-- ============================================================
-- 1. DROP CONSTRAINT (tüm ilgili CHECK’ler)
-- ============================================================
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_malzeme_saglayici_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_tas_durumu_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_teslim_sekli_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_butce_tipi_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_butce_gorunurlugu_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_gorunurluk_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_dosya_gorunurlugu_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_aciliyet_check;

-- ============================================================
-- 2. UPDATE — eski enum değerlerini normalize et (NULL korunur)
-- ============================================================
DO $$
DECLARE
    r record;
    n_unknown int := 0;
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RETURN;
    END IF;

    -- ---------- malzeme_saglayici ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'malzeme_saglayici'
    ) THEN
        UPDATE public.is_talepleri
        SET malzeme_saglayici = 'is_veren'
        WHERE malzeme_saglayici IS NOT NULL
          AND lower(btrim(malzeme_saglayici)) IN (
              'is_veren', 'isveren', 'is_veren_saglayacak', 'musteri'
          );

        UPDATE public.is_talepleri
        SET malzeme_saglayici = 'is_veren'
        WHERE malzeme_saglayici IS NOT NULL
          AND (
              malzeme_saglayici ILIKE '%işveren%'
              OR malzeme_saglayici ILIKE '%isveren%'
          )
          AND malzeme_saglayici IS DISTINCT FROM 'is_veren';

        UPDATE public.is_talepleri
        SET malzeme_saglayici = 'hizmet_veren'
        WHERE malzeme_saglayici IS NOT NULL
          AND lower(btrim(malzeme_saglayici)) IN (
              'hizmet_veren', 'firma', 'hizmeti_veren_firma', 'hizmeti_veren'
          );

        UPDATE public.is_talepleri
        SET malzeme_saglayici = 'gorusulecek'
        WHERE malzeme_saglayici IS NOT NULL
          AND (
              lower(btrim(malzeme_saglayici)) IN ('gorusulecek', 'goruselecek', 'karisik')
              OR malzeme_saglayici ILIKE '%görüş%'
              OR malzeme_saglayici ILIKE '%gorus%'
          );

        FOR r IN
            SELECT id, malzeme_saglayici AS v
            FROM public.is_talepleri
            WHERE malzeme_saglayici IS NOT NULL
              AND malzeme_saglayici NOT IN ('is_veren', 'hizmet_veren', 'gorusulecek')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '030 malzeme_saglayici bilinmeyen → NULL | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET malzeme_saglayici = NULL WHERE id = r.id;
        END LOOP;
    END IF;

    -- ---------- tas_durumu ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'tas_durumu'
    ) THEN
        -- Açık eşlemeler (kullanıcı talebi)
        UPDATE public.is_talepleri
        SET tas_durumu = 'gorusulecek'
        WHERE tas_durumu IS NOT NULL
          AND (
              lower(btrim(tas_durumu)) IN (
                  'var', 'kismen', 'belirtilmedi', 'gorusulecek', 'goruselecek'
              )
              OR tas_durumu ILIKE '%görüş%'
              OR tas_durumu ILIKE '%gorus%'
          );

        UPDATE public.is_talepleri
        SET tas_durumu = 'hizmet_veren'
        WHERE tas_durumu IS NOT NULL
          AND lower(btrim(tas_durumu)) IN ('firma', 'hizmet_veren');

        UPDATE public.is_talepleri
        SET tas_durumu = 'is_veren'
        WHERE tas_durumu IS NOT NULL
          AND (
              lower(btrim(tas_durumu)) IN ('is_veren', 'isveren')
              OR tas_durumu ILIKE '%işveren%'
              OR tas_durumu ILIKE '%isveren%'
          );

        UPDATE public.is_talepleri
        SET tas_durumu = 'yok'
        WHERE tas_durumu IS NOT NULL
          AND lower(btrim(tas_durumu)) IN ('yok', 'tas_yok');

        -- NULL olduğu gibi kalır; bilinmeyenler NULL
        FOR r IN
            SELECT id, tas_durumu AS v
            FROM public.is_talepleri
            WHERE tas_durumu IS NOT NULL
              AND tas_durumu NOT IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '030 tas_durumu bilinmeyen → NULL | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET tas_durumu = NULL WHERE id = r.id;
        END LOOP;
    END IF;

    -- ---------- teslim_sekli ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'teslim_sekli'
    ) THEN
        UPDATE public.is_talepleri
        SET teslim_sekli = 'elden'
        WHERE teslim_sekli IS NOT NULL
          AND lower(btrim(teslim_sekli)) = 'elden';

        UPDATE public.is_talepleri
        SET teslim_sekli = 'kargo'
        WHERE teslim_sekli IS NOT NULL
          AND lower(btrim(teslim_sekli)) = 'kargo';

        UPDATE public.is_talepleri
        SET teslim_sekli = 'kurye'
        WHERE teslim_sekli IS NOT NULL
          AND lower(btrim(teslim_sekli)) = 'kurye';

        UPDATE public.is_talepleri
        SET teslim_sekli = 'gorusulecek'
        WHERE teslim_sekli IS NOT NULL
          AND (
              lower(btrim(teslim_sekli)) IN (
                  'gorusulecek', 'goruselecek', 'anlasmali', 'belirtilmedi'
              )
              OR teslim_sekli ILIKE '%görüş%'
              OR teslim_sekli ILIKE '%gorus%'
          );

        FOR r IN
            SELECT id, teslim_sekli AS v
            FROM public.is_talepleri
            WHERE teslim_sekli IS NOT NULL
              AND teslim_sekli NOT IN ('elden', 'kargo', 'kurye', 'gorusulecek')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '030 teslim_sekli bilinmeyen → NULL | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET teslim_sekli = NULL WHERE id = r.id;
        END LOOP;
    END IF;

    -- ---------- butce_tipi ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'butce_tipi'
    ) THEN
        UPDATE public.is_talepleri
        SET butce_tipi = 'tahmini'
        WHERE butce_tipi IS NOT NULL
          AND lower(btrim(butce_tipi)) IN ('tahmini', 'aralik');

        UPDATE public.is_talepleri
        SET butce_tipi = 'sabit'
        WHERE butce_tipi IS NOT NULL
          AND lower(btrim(butce_tipi)) = 'sabit';

        UPDATE public.is_talepleri
        SET butce_tipi = 'teklif_bekliyorum'
        WHERE butce_tipi IS NOT NULL
          AND lower(btrim(butce_tipi)) = 'teklif_bekliyorum';

        FOR r IN
            SELECT id, butce_tipi AS v
            FROM public.is_talepleri
            WHERE butce_tipi IS NOT NULL
              AND butce_tipi NOT IN ('teklif_bekliyorum', 'tahmini', 'sabit')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '030 butce_tipi bilinmeyen → teklif_bekliyorum | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri
            SET butce_tipi = 'teklif_bekliyorum'
            WHERE id = r.id;
        END LOOP;
    END IF;

    -- ---------- butce_gorunurlugu ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'butce_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri
        SET butce_gorunurlugu = 'herkese'
        WHERE butce_gorunurlugu IS NOT NULL
          AND lower(btrim(butce_gorunurlugu)) IN ('herkese', 'herkese_acik');

        UPDATE public.is_talepleri
        SET butce_gorunurlugu = 'dogrulanmis_firmalar'
        WHERE butce_gorunurlugu IS NOT NULL
          AND lower(btrim(butce_gorunurlugu)) IN (
              'dogrulanmis_firmalar', 'gizli', 'teklif_sonrasi'
          );

        FOR r IN
            SELECT id, butce_gorunurlugu AS v
            FROM public.is_talepleri
            WHERE butce_gorunurlugu IS NOT NULL
              AND butce_gorunurlugu NOT IN ('herkese', 'dogrulanmis_firmalar')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '030 butce_gorunurlugu bilinmeyen → dogrulanmis_firmalar | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri
            SET butce_gorunurlugu = 'dogrulanmis_firmalar'
            WHERE id = r.id;
        END LOOP;
    END IF;

    -- ---------- gorunurluk ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'gorunurluk'
    ) THEN
        UPDATE public.is_talepleri
        SET gorunurluk = 'tum_dogrulanmis_firmalar'
        WHERE gorunurluk IS NOT NULL
          AND lower(btrim(gorunurluk)) IN (
              'tum_dogrulanmis_firmalar', 'secili_kategoriler'
          );

        UPDATE public.is_talepleri
        SET gorunurluk = 'secilen_sehir'
        WHERE gorunurluk IS NOT NULL
          AND lower(btrim(gorunurluk)) = 'secilen_sehir';

        UPDATE public.is_talepleri
        SET gorunurluk = 'davet_edilen'
        WHERE gorunurluk IS NOT NULL
          AND lower(btrim(gorunurluk)) IN ('davet_edilen', 'ozel');

        FOR r IN
            SELECT id, gorunurluk AS v
            FROM public.is_talepleri
            WHERE gorunurluk IS NOT NULL
              AND gorunurluk NOT IN (
                  'tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen'
              )
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '030 gorunurluk bilinmeyen → tum_dogrulanmis_firmalar | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri
            SET gorunurluk = 'tum_dogrulanmis_firmalar'
            WHERE id = r.id;
        END LOOP;
    END IF;

    -- ---------- dosya_gorunurlugu ----------
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri'
          AND column_name = 'dosya_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri
        SET dosya_gorunurlugu = 'teklif_sonrasi'
        WHERE dosya_gorunurlugu IS NOT NULL
          AND lower(btrim(dosya_gorunurlugu)) IN ('teklif_sonrasi', 'teklif_verenler');

        UPDATE public.is_talepleri
        SET dosya_gorunurlugu = 'talebi_gorenler'
        WHERE dosya_gorunurlugu IS NOT NULL
          AND lower(btrim(dosya_gorunurlugu)) IN ('talebi_gorenler', 'sadece_sahip');

        FOR r IN
            SELECT id, dosya_gorunurlugu AS v
            FROM public.is_talepleri
            WHERE dosya_gorunurlugu IS NOT NULL
              AND dosya_gorunurlugu NOT IN ('talebi_gorenler', 'teklif_sonrasi')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '030 dosya_gorunurlugu bilinmeyen → talebi_gorenler | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri
            SET dosya_gorunurlugu = 'talebi_gorenler'
            WHERE id = r.id;
        END LOOP;
    END IF;

    RAISE NOTICE '030 normalize tamam; bilinmeyen alan sayısı≈%', n_unknown;
END $$;

-- ============================================================
-- 3. ADD CONSTRAINT (normalize sonrası)
-- ============================================================
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_malzeme_saglayici_check
    CHECK (
        malzeme_saglayici IS NULL
        OR malzeme_saglayici IN ('is_veren', 'hizmet_veren', 'gorusulecek')
    );

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_tas_durumu_check
    CHECK (
        tas_durumu IS NULL
        OR tas_durumu IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek')
    );

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_teslim_sekli_check
    CHECK (
        teslim_sekli IS NULL
        OR teslim_sekli IN ('elden', 'kargo', 'kurye', 'gorusulecek')
    );

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_butce_tipi_check
    CHECK (
        butce_tipi IS NULL
        OR butce_tipi IN ('teklif_bekliyorum', 'tahmini', 'sabit')
    );

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_butce_gorunurlugu_check
    CHECK (
        butce_gorunurlugu IS NULL
        OR butce_gorunurlugu IN ('herkese', 'dogrulanmis_firmalar')
    );

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_gorunurluk_check
    CHECK (
        gorunurluk IS NULL
        OR gorunurluk IN ('tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen')
    );

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_dosya_gorunurlugu_check
    CHECK (
        dosya_gorunurlugu IS NULL
        OR dosya_gorunurlugu IN ('talebi_gorenler', 'teklif_sonrasi')
    );

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_aciliyet_check
    CHECK (
        aciliyet IS NULL
        OR aciliyet IN ('standart', 'oncelikli', 'acil')
    );

COMMENT ON CONSTRAINT is_talepleri_tas_durumu_check ON public.is_talepleri IS
    '030: yok | is_veren | hizmet_veren | gorusulecek (DROP→UPDATE→ADD)';

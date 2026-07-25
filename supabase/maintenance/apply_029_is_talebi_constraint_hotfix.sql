-- AURIX 029 — İş talebi CHECK enum hotfix (frontend ile tam uyum)
-- Idempotent. DROP TABLE yok.
--
-- Bu dosya = supabase/maintenance/apply_029_is_talebi_constraint_hotfix.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın (028 sonrası).
--
-- Sorun: 028 CHECK değerleri (musteri/firma/karisik vb.) frontend enum’larıyla
-- (is_veren/hizmet_veren/gorusulecek vb.) uyuşmuyordu → yayınlama 23514.

-- ============================================================
-- 1. Eski değerleri normalize et (bilinmeyen → NULL + NOTICE)
-- ============================================================
DO $$
DECLARE
    r record;
    n_unknown int := 0;
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE NOTICE 'is_talepleri yok; 029 atlandı.';
        RETURN;
    END IF;

    -- malzeme_saglayici
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri' AND column_name = 'malzeme_saglayici'
    ) THEN
        UPDATE public.is_talepleri SET malzeme_saglayici = 'is_veren'
        WHERE lower(btrim(malzeme_saglayici)) IN (
            'is_veren', 'isveren', 'is_veren_saglayacak', 'musteri'
        ) AND malzeme_saglayici IS DISTINCT FROM 'is_veren';

        UPDATE public.is_talepleri SET malzeme_saglayici = 'hizmet_veren'
        WHERE lower(btrim(malzeme_saglayici)) IN (
            'hizmet_veren', 'firma', 'hizmeti_veren_firma', 'hizmeti_veren'
        ) AND malzeme_saglayici IS DISTINCT FROM 'hizmet_veren';

        UPDATE public.is_talepleri SET malzeme_saglayici = 'gorusulecek'
        WHERE (
            lower(btrim(malzeme_saglayici)) IN ('gorusulecek', 'goruselecek', 'karisik')
            OR malzeme_saglayici ILIKE '%görüş%'
            OR malzeme_saglayici ILIKE '%gorus%'
          )
          AND malzeme_saglayici IS DISTINCT FROM 'gorusulecek';

        FOR r IN
            SELECT id, malzeme_saglayici AS v
            FROM public.is_talepleri
            WHERE malzeme_saglayici IS NOT NULL
              AND malzeme_saglayici NOT IN ('is_veren', 'hizmet_veren', 'gorusulecek')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '029 malzeme_saglayici bilinmeyen → NULL | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET malzeme_saglayici = NULL WHERE id = r.id;
        END LOOP;
    END IF;

    -- tas_durumu
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri' AND column_name = 'tas_durumu'
    ) THEN
        UPDATE public.is_talepleri SET tas_durumu = 'yok'
        WHERE lower(btrim(tas_durumu)) IN ('yok', 'tas_yok') AND tas_durumu IS DISTINCT FROM 'yok';
        UPDATE public.is_talepleri SET tas_durumu = 'is_veren'
        WHERE lower(btrim(tas_durumu)) IN ('is_veren', 'var') AND tas_durumu IS DISTINCT FROM 'is_veren';
        UPDATE public.is_talepleri SET tas_durumu = 'hizmet_veren'
        WHERE lower(btrim(tas_durumu)) IN ('hizmet_veren', 'firma') AND tas_durumu IS DISTINCT FROM 'hizmet_veren';
        UPDATE public.is_talepleri SET tas_durumu = 'gorusulecek'
        WHERE lower(btrim(tas_durumu)) IN ('gorusulecek', 'goruselecek', 'kismen', 'belirtilmedi')
          AND tas_durumu IS DISTINCT FROM 'gorusulecek';

        FOR r IN
            SELECT id, tas_durumu AS v FROM public.is_talepleri
            WHERE tas_durumu IS NOT NULL
              AND tas_durumu NOT IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '029 tas_durumu bilinmeyen → NULL | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET tas_durumu = NULL WHERE id = r.id;
        END LOOP;
    END IF;

    -- teslim_sekli
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri' AND column_name = 'teslim_sekli'
    ) THEN
        UPDATE public.is_talepleri SET teslim_sekli = 'gorusulecek'
        WHERE lower(btrim(teslim_sekli)) IN ('gorusulecek', 'goruselecek', 'anlasmali', 'belirtilmedi')
          AND teslim_sekli IS DISTINCT FROM 'gorusulecek';

        FOR r IN
            SELECT id, teslim_sekli AS v FROM public.is_talepleri
            WHERE teslim_sekli IS NOT NULL
              AND teslim_sekli NOT IN ('elden', 'kargo', 'kurye', 'gorusulecek')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '029 teslim_sekli bilinmeyen → NULL | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET teslim_sekli = NULL WHERE id = r.id;
        END LOOP;
    END IF;

    -- butce_tipi
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri' AND column_name = 'butce_tipi'
    ) THEN
        UPDATE public.is_talepleri SET butce_tipi = 'tahmini'
        WHERE lower(btrim(butce_tipi)) IN ('tahmini', 'aralik')
          AND butce_tipi IS DISTINCT FROM 'tahmini';

        FOR r IN
            SELECT id, butce_tipi AS v FROM public.is_talepleri
            WHERE butce_tipi IS NOT NULL
              AND butce_tipi NOT IN ('teklif_bekliyorum', 'tahmini', 'sabit')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '029 butce_tipi bilinmeyen → teklif_bekliyorum | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET butce_tipi = 'teklif_bekliyorum' WHERE id = r.id;
        END LOOP;
    END IF;

    -- gorunurluk
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri' AND column_name = 'gorunurluk'
    ) THEN
        UPDATE public.is_talepleri SET gorunurluk = 'tum_dogrulanmis_firmalar'
        WHERE lower(btrim(gorunurluk)) IN ('tum_dogrulanmis_firmalar', 'secili_kategoriler');
        UPDATE public.is_talepleri SET gorunurluk = 'davet_edilen'
        WHERE lower(btrim(gorunurluk)) IN ('davet_edilen', 'ozel')
          AND gorunurluk IS DISTINCT FROM 'davet_edilen';
        UPDATE public.is_talepleri SET gorunurluk = 'secilen_sehir'
        WHERE lower(btrim(gorunurluk)) = 'secilen_sehir';

        FOR r IN
            SELECT id, gorunurluk AS v FROM public.is_talepleri
            WHERE gorunurluk IS NOT NULL
              AND gorunurluk NOT IN ('tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '029 gorunurluk bilinmeyen → tum_dogrulanmis_firmalar | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET gorunurluk = 'tum_dogrulanmis_firmalar' WHERE id = r.id;
        END LOOP;
    END IF;

    -- dosya_gorunurlugu
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri' AND column_name = 'dosya_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri SET dosya_gorunurlugu = 'teklif_sonrasi'
        WHERE lower(btrim(dosya_gorunurlugu)) IN ('teklif_sonrasi', 'teklif_verenler')
          AND dosya_gorunurlugu IS DISTINCT FROM 'teklif_sonrasi';
        UPDATE public.is_talepleri SET dosya_gorunurlugu = 'talebi_gorenler'
        WHERE lower(btrim(dosya_gorunurlugu)) IN ('talebi_gorenler', 'sadece_sahip')
          AND dosya_gorunurlugu IS DISTINCT FROM 'talebi_gorenler';

        FOR r IN
            SELECT id, dosya_gorunurlugu AS v FROM public.is_talepleri
            WHERE dosya_gorunurlugu IS NOT NULL
              AND dosya_gorunurlugu NOT IN ('talebi_gorenler', 'teklif_sonrasi')
        LOOP
            n_unknown := n_unknown + 1;
            RAISE NOTICE '029 dosya_gorunurlugu bilinmeyen → talebi_gorenler | id=% değer=%', r.id, r.v;
            UPDATE public.is_talepleri SET dosya_gorunurlugu = 'talebi_gorenler' WHERE id = r.id;
        END LOOP;
    END IF;

    -- butce_gorunurlugu: herkese_acik → herkese
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'is_talepleri' AND column_name = 'butce_gorunurlugu'
    ) THEN
        UPDATE public.is_talepleri SET butce_gorunurlugu = 'herkese'
        WHERE lower(btrim(butce_gorunurlugu)) IN ('herkese', 'herkese_acik')
          AND butce_gorunurlugu IS DISTINCT FROM 'herkese';
        UPDATE public.is_talepleri SET butce_gorunurlugu = 'dogrulanmis_firmalar'
        WHERE lower(btrim(butce_gorunurlugu)) IN ('dogrulanmis_firmalar', 'gizli', 'teklif_sonrasi')
          AND butce_gorunurlugu IS DISTINCT FROM 'dogrulanmis_firmalar'
          AND lower(btrim(butce_gorunurlugu)) <> 'herkese';
    END IF;

    RAISE NOTICE '029 normalize tamam; bilinmeyen alan sayısı≈%', n_unknown;
END $$;

-- ============================================================
-- 2. CHECK constraint’leri yeniden oluştur
-- ============================================================
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_malzeme_saglayici_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_malzeme_saglayici_check
    CHECK (
        malzeme_saglayici IS NULL
        OR malzeme_saglayici IN ('is_veren', 'hizmet_veren', 'gorusulecek')
    );

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_tas_durumu_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_tas_durumu_check
    CHECK (
        tas_durumu IS NULL
        OR tas_durumu IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek')
    );

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_teslim_sekli_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_teslim_sekli_check
    CHECK (
        teslim_sekli IS NULL
        OR teslim_sekli IN ('elden', 'kargo', 'kurye', 'gorusulecek')
    );

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_butce_tipi_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_butce_tipi_check
    CHECK (
        butce_tipi IS NULL
        OR butce_tipi IN ('teklif_bekliyorum', 'tahmini', 'sabit')
    );

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_butce_gorunurlugu_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_butce_gorunurlugu_check
    CHECK (
        butce_gorunurlugu IS NULL
        OR butce_gorunurlugu IN ('herkese', 'dogrulanmis_firmalar')
    );

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_gorunurluk_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_gorunurluk_check
    CHECK (
        gorunurluk IS NULL
        OR gorunurluk IN ('tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen')
    );

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_dosya_gorunurlugu_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_dosya_gorunurlugu_check
    CHECK (
        dosya_gorunurlugu IS NULL
        OR dosya_gorunurlugu IN ('talebi_gorenler', 'teklif_sonrasi')
    );

ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_aciliyet_check;
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_aciliyet_check
    CHECK (
        aciliyet IS NULL
        OR aciliyet IN ('standart', 'oncelikli', 'acil')
    );

-- ============================================================
-- 3. RPC doğrulama: butce_tipi tahmini kabul etsin
-- ============================================================
CREATE OR REPLACE FUNCTION public._is_talebi_validate_payload(
    p_payload jsonb,
    p_yayinla boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    b text := btrim(COALESCE(p_payload->>'baslik', ''));
    a text := COALESCE(p_payload->>'aciklama', '');
    t text := p_payload->>'teknik_bilgiler';
    adet_v int;
    gram_v numeric;
    bmin numeric;
    bmax numeric;
    acil text;
    bt text;
    pb text;
    ms text;
    td text;
    ts text;
BEGIN
    IF char_length(b) < 5 OR char_length(b) > 90 THEN
        RAISE EXCEPTION 'baslik_uzunluk' USING ERRCODE = '22023';
    END IF;

    IF p_yayinla THEN
        IF char_length(a) < 40 OR char_length(a) > 2000 THEN
            RAISE EXCEPTION 'aciklama_uzunluk' USING ERRCODE = '22023';
        END IF;
    ELSIF a IS NOT NULL AND a <> '' AND char_length(a) > 2000 THEN
        RAISE EXCEPTION 'aciklama_uzunluk' USING ERRCODE = '22023';
    END IF;

    IF t IS NOT NULL AND char_length(t) > 1000 THEN
        RAISE EXCEPTION 'teknik_bilgiler_uzunluk' USING ERRCODE = '22023';
    END IF;

    IF p_payload ? 'adet' AND p_payload->>'adet' IS NOT NULL AND btrim(p_payload->>'adet') <> '' THEN
        adet_v := (p_payload->>'adet')::int;
        IF adet_v IS NULL OR adet_v <= 0 THEN
            RAISE EXCEPTION 'adet_gecersiz' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_payload ? 'tahmini_gram' AND p_payload->>'tahmini_gram' IS NOT NULL
       AND btrim(p_payload->>'tahmini_gram') <> '' THEN
        gram_v := (p_payload->>'tahmini_gram')::numeric;
        IF gram_v < 0 THEN
            RAISE EXCEPTION 'tahmini_gram_gecersiz' USING ERRCODE = '22023';
        END IF;
    END IF;

    bmin := NULLIF(btrim(COALESCE(p_payload->>'butce_min', '')), '')::numeric;
    bmax := NULLIF(btrim(COALESCE(p_payload->>'butce_max', '')), '')::numeric;
    IF bmin IS NOT NULL AND bmin < 0 THEN
        RAISE EXCEPTION 'butce_gecersiz' USING ERRCODE = '22023';
    END IF;
    IF bmax IS NOT NULL AND bmax < 0 THEN
        RAISE EXCEPTION 'butce_gecersiz' USING ERRCODE = '22023';
    END IF;
    IF bmin IS NOT NULL AND bmax IS NOT NULL AND bmax < bmin THEN
        RAISE EXCEPTION 'butce_aralik' USING ERRCODE = '22023';
    END IF;

    acil := COALESCE(NULLIF(btrim(p_payload->>'aciliyet'), ''), 'standart');
    IF acil NOT IN ('standart', 'oncelikli', 'acil') THEN
        RAISE EXCEPTION 'aciliyet_gecersiz' USING ERRCODE = '22023';
    END IF;

    bt := COALESCE(NULLIF(btrim(p_payload->>'butce_tipi'), ''), 'teklif_bekliyorum');
    IF bt NOT IN ('teklif_bekliyorum', 'tahmini', 'sabit') THEN
        RAISE EXCEPTION 'butce_tipi_gecersiz' USING ERRCODE = '22023';
    END IF;

    pb := COALESCE(NULLIF(btrim(p_payload->>'para_birimi'), ''), 'TRY');
    IF pb NOT IN ('TRY') THEN
        RAISE EXCEPTION 'para_birimi_gecersiz' USING ERRCODE = '22023';
    END IF;

    ms := NULLIF(btrim(COALESCE(p_payload->>'malzeme_saglayici', '')), '');
    IF ms IS NOT NULL AND ms NOT IN ('is_veren', 'hizmet_veren', 'gorusulecek') THEN
        RAISE EXCEPTION 'malzeme_saglayici_gecersiz' USING ERRCODE = '22023';
    END IF;

    td := NULLIF(btrim(COALESCE(p_payload->>'tas_durumu', '')), '');
    IF td IS NOT NULL AND td NOT IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek') THEN
        RAISE EXCEPTION 'tas_durumu_gecersiz' USING ERRCODE = '22023';
    END IF;

    ts := NULLIF(btrim(COALESCE(p_payload->>'teslim_sekli', '')), '');
    IF ts IS NOT NULL AND ts NOT IN ('elden', 'kargo', 'kurye', 'gorusulecek') THEN
        RAISE EXCEPTION 'teslim_sekli_gecersiz' USING ERRCODE = '22023';
    END IF;
END;
$$;

COMMENT ON CONSTRAINT is_talepleri_malzeme_saglayici_check ON public.is_talepleri IS
    '029: is_veren | hizmet_veren | gorusulecek';

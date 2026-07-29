-- AURIX 043 — İş talebi teklif kabul + durum güncelleme akışı
-- Idempotent. DROP TABLE / TRUNCATE / kontrolsüz DELETE yok.
--
-- Hedef:
-- 1) is_talepleri.durum: firma_secildi ekle; teklif_secildi → firma_secildi
-- 2) is_talepleri.secilen_firma_id
-- 3) teklifler.durum: gonderildi | kabul_edildi | reddedildi
-- 4) RPC: is_teklif_kabul_et, is_durum_guncelle, is_talebi_teklifleri, firma_gelen_isler
-- 5) firma_tekliflerim’e teklif/iş durumu alanları
--
-- Bu dosya ile supabase/maintenance/apply_043_is_teklif_kabul_durum.sql aynıdır.

-- ============================================================
-- 1. Kolonlar
-- ============================================================
DO $$
DECLARE
    firma_id_type text;
BEGIN
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO firma_id_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    IF firma_id_type IS NULL THEN
        RAISE EXCEPTION 'firmalar.id tipi bulunamadı';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'is_talepleri'
          AND column_name = 'secilen_firma_id'
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.is_talepleri ADD COLUMN secilen_firma_id %s REFERENCES public.firmalar (id) ON DELETE SET NULL',
            firma_id_type
        );
    END IF;
END $$;

ALTER TABLE public.teklifler ADD COLUMN IF NOT EXISTS durum TEXT;
UPDATE public.teklifler
SET durum = 'gonderildi'
WHERE durum IS NULL OR btrim(durum) = '';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teklifler_durum_check'
          AND conrelid = 'public.teklifler'::regclass
    ) THEN
        ALTER TABLE public.teklifler DROP CONSTRAINT teklifler_durum_check;
    END IF;
END $$;

ALTER TABLE public.teklifler
    ADD CONSTRAINT teklifler_durum_check
    CHECK (durum IN ('gonderildi', 'kabul_edildi', 'reddedildi'));

ALTER TABLE public.teklifler ALTER COLUMN durum SET DEFAULT 'gonderildi';
ALTER TABLE public.teklifler ALTER COLUMN durum SET NOT NULL;

COMMENT ON COLUMN public.is_talepleri.secilen_firma_id IS
    'Kabul edilen teklifin firması (is_teklif_kabul_et ile set edilir).';
COMMENT ON COLUMN public.teklifler.durum IS
    'gonderildi | kabul_edildi | reddedildi';

-- ============================================================
-- 2. is_talepleri.durum CHECK + normalize
-- ============================================================
-- Kullanıcı hedef seti + geriye uyum: taslak, arsivlendi, is_emri_olusturuldu
UPDATE public.is_talepleri
SET durum = 'firma_secildi'
WHERE durum IN ('teklif_secildi', 'is_emri_olusturuldu');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_durum_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri DROP CONSTRAINT is_talepleri_durum_check;
    END IF;
END $$;

ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_durum_check
    CHECK (
        durum IS NULL
        OR durum IN (
            'taslak',
            'teklif_bekliyor',
            'firma_secildi',
            'uretimde',
            'tamamlandi',
            'iptal_edildi',
            'arsivlendi',
            -- geçici geriye uyum (artık yazılmamalı)
            'teklif_secildi',
            'is_emri_olusturuldu'
        )
    );

-- ============================================================
-- 3. RPC: is_talebi_teklifleri (iş sahibi — fiyat dahil)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_teklifleri(p_is_talebi_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF p_is_talebi_id IS NULL OR btrim(p_is_talebi_id) = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_talebi_sahibi_mi(btrim(p_is_talebi_id), uid) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            t.id,
            t.is_id::text AS is_id,
            t.firma_id::text AS firma_id,
            COALESCE(NULLIF(btrim(f.firma_adi), ''), 'Firma') AS firma_adi,
            t.fiyat,
            t.termin_gun,
            t.mesaj,
            COALESCE(t.durum, 'gonderildi') AS durum,
            t.created_at
        FROM public.teklifler t
        JOIN public.firmalar f ON f.id = t.firma_id
        WHERE t.is_id::text = btrim(p_is_talebi_id)
    ) x;

    RETURN jsonb_build_object(
        'ok', true,
        'is_talebi_id', btrim(p_is_talebi_id),
        'teklifler', COALESCE(rows, '[]'::jsonb)
    );
END;
$$;

-- ============================================================
-- 4. RPC: is_teklif_kabul_et
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_teklif_kabul_et(p_teklif_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    t record;
    is_row record;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF p_teklif_id IS NULL THEN
        RAISE EXCEPTION 'teklif_zorunlu' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO t
    FROM public.teklifler
    WHERE id = p_teklif_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'teklif_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO is_row
    FROM public.is_talepleri i
    WHERE i.id = t.is_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (is_row.kullanici_id = uid OR is_row.owner_id = uid) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    IF is_row.durum NOT IN ('teklif_bekliyor', 'Acik') THEN
        RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(t.durum, 'gonderildi') NOT IN ('gonderildi') THEN
        RAISE EXCEPTION 'teklif_durum_uygun_degil' USING ERRCODE = '22023';
    END IF;

    -- Seçilen teklif kabul, diğerleri red
    UPDATE public.teklifler
    SET durum = CASE WHEN id = p_teklif_id THEN 'kabul_edildi' ELSE 'reddedildi' END
    WHERE is_id = t.is_id;

    UPDATE public.is_talepleri
    SET
        durum = 'firma_secildi',
        secilen_firma_id = t.firma_id,
        guncellenme_tarihi = NOW()
    WHERE id = t.is_id;

    BEGIN
        INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar, eski_durum, yeni_durum)
        VALUES (
            t.is_id,
            uid,
            'teklif_kabul',
            'İş sahibi teklifi kabul etti.',
            is_row.durum,
            'firma_secildi'
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'ok', true,
        'is_talebi_id', t.is_id::text,
        'teklif_id', p_teklif_id,
        'firma_id', t.firma_id::text,
        'durum', 'firma_secildi'
    );
END;
$$;

-- ============================================================
-- 5. RPC: is_durum_guncelle
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_durum_guncelle(p_is_talebi_id text, p_yeni_durum text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    is_row record;
    yeni text := lower(btrim(COALESCE(p_yeni_durum, '')));
    firma_uid uuid;
    sahip_mi boolean := false;
    secilen_firma_mi boolean := false;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF p_is_talebi_id IS NULL OR btrim(p_is_talebi_id) = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF yeni NOT IN ('uretimde', 'tamamlandi', 'iptal_edildi') THEN
        RAISE EXCEPTION 'gecersiz_durum' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO is_row
    FROM public.is_talepleri i
    WHERE i.id::text = btrim(p_is_talebi_id)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    sahip_mi := (is_row.kullanici_id = uid OR is_row.owner_id = uid);

    IF is_row.secilen_firma_id IS NOT NULL THEN
        SELECT f.user_id INTO firma_uid
        FROM public.firmalar f
        WHERE f.id = is_row.secilen_firma_id;
        secilen_firma_mi := (firma_uid IS NOT NULL AND firma_uid = uid);
        IF NOT secilen_firma_mi THEN
            -- owner_id yedek
            BEGIN
                SELECT EXISTS (
                    SELECT 1 FROM public.firmalar f
                    WHERE f.id = is_row.secilen_firma_id
                      AND (f.user_id = uid OR f.owner_id = uid)
                ) INTO secilen_firma_mi;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END;
        END IF;
    END IF;

    IF yeni = 'uretimde' THEN
        IF NOT secilen_firma_mi THEN
            RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
        END IF;
        IF is_row.durum NOT IN ('firma_secildi', 'teklif_secildi', 'is_emri_olusturuldu') THEN
            RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
        END IF;
    ELSIF yeni = 'tamamlandi' THEN
        IF NOT secilen_firma_mi THEN
            RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
        END IF;
        IF is_row.durum <> 'uretimde' THEN
            RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
        END IF;
    ELSIF yeni = 'iptal_edildi' THEN
        IF NOT sahip_mi THEN
            RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
        END IF;
        IF is_row.durum NOT IN (
            'taslak', 'teklif_bekliyor', 'firma_secildi', 'teklif_secildi',
            'is_emri_olusturuldu', 'uretimde', 'Acik'
        ) THEN
            RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
        END IF;
    END IF;

    UPDATE public.is_talepleri
    SET
        durum = yeni,
        guncellenme_tarihi = NOW(),
        iptal_tarihi = CASE WHEN yeni = 'iptal_edildi' THEN NOW() ELSE iptal_tarihi END
    WHERE id = is_row.id;

    BEGIN
        INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar, eski_durum, yeni_durum)
        VALUES (
            is_row.id,
            uid,
            'durum_guncelle',
            'Durum güncellendi: ' || yeni,
            is_row.durum,
            yeni
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'ok', true,
        'is_talebi_id', is_row.id::text,
        'eski_durum', is_row.durum,
        'durum', yeni
    );
END;
$$;

-- ============================================================
-- 6. RPC: firma_gelen_isler (seçilen firma işleri)
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_gelen_isler()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    fid text;
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT f.id::text INTO fid
    FROM public.firmalar f
    WHERE f.user_id = uid
    ORDER BY f.created_at DESC NULLS LAST
    LIMIT 1;

    IF fid IS NULL THEN
        BEGIN
            SELECT f.id::text INTO fid
            FROM public.firmalar f
            WHERE f.owner_id = uid
            ORDER BY f.created_at DESC NULLS LAST
            LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
            fid := NULL;
        END;
    END IF;

    IF fid IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'isler', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.guncellenme_tarihi DESC NULLS LAST), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            i.id::text AS id,
            COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi') AS baslik,
            i.sehir,
            i.kategori,
            i.durum,
            i.secilen_firma_id::text AS secilen_firma_id,
            i.created_at,
            i.guncellenme_tarihi,
            t.id AS teklif_id,
            t.fiyat,
            t.termin_gun,
            t.durum AS teklif_durum
        FROM public.is_talepleri i
        JOIN public.teklifler t
          ON t.is_id = i.id
         AND t.firma_id::text = fid
         AND t.durum = 'kabul_edildi'
        WHERE i.secilen_firma_id::text = fid
          AND i.durum IN ('firma_secildi', 'teklif_secildi', 'is_emri_olusturuldu', 'uretimde', 'tamamlandi')
    ) x;

    RETURN jsonb_build_object('ok', true, 'isler', COALESCE(rows, '[]'::jsonb));
END;
$$;

-- ============================================================
-- 7. firma_tekliflerim — durum alanlarını ekle
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_tekliflerim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    fid text;
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT f.id::text INTO fid
    FROM public.firmalar f
    WHERE f.user_id = uid
    ORDER BY f.created_at DESC NULLS LAST
    LIMIT 1;

    IF fid IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'teklifler', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            t.id,
            t.is_id,
            t.firma_id,
            t.fiyat,
            t.termin_gun,
            t.created_at,
            COALESCE(t.durum, 'gonderildi') AS durum,
            COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi') AS is_baslik,
            COALESCE(i.durum, '') AS is_durum,
            COALESCE(i.sehir, '') AS is_sehir,
            i.secilen_firma_id::text AS secilen_firma_id
        FROM public.teklifler t
        LEFT JOIN public.is_talepleri i ON i.id = t.is_id
        WHERE t.firma_id::text = fid
    ) x;

    RETURN jsonb_build_object('ok', true, 'teklifler', COALESCE(rows, '[]'::jsonb));
END;
$$;

-- ============================================================
-- 8. Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.is_talebi_teklifleri(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_teklif_kabul_et(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_durum_guncelle(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.firma_gelen_isler() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.firma_tekliflerim() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_talebi_teklifleri(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teklif_kabul_et(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_durum_guncelle(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.firma_gelen_isler() TO authenticated;
GRANT EXECUTE ON FUNCTION public.firma_tekliflerim() TO authenticated;

-- teklifler.durum SELECT (fiyat hâlâ kapalı)
DO $$
BEGIN
    BEGIN
        GRANT SELECT (durum) ON TABLE public.teklifler TO authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        GRANT SELECT (secilen_firma_id) ON TABLE public.is_talepleri TO authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- is_talebi_sahibi_mi 042’de yoksa yedek (mesajlaşma uygulanmamış ortam)
DO $$
BEGIN
    IF to_regprocedure('public.is_talebi_sahibi_mi(text, uuid)') IS NULL THEN
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION public.is_talebi_sahibi_mi(p_is_id text, p_uid uuid DEFAULT auth.uid())
            RETURNS boolean
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path TO public, pg_temp
            AS $body$
                SELECT EXISTS (
                    SELECT 1 FROM public.is_talepleri i
                    WHERE i.id::text = btrim(p_is_id)
                      AND (i.kullanici_id = p_uid OR i.owner_id = p_uid)
                );
            $body$;
        $fn$;
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_talebi_sahibi_mi(text, uuid) TO authenticated';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '[043] Teklif kabul / durum güncelleme akışı tamamlandı.';
END $$;

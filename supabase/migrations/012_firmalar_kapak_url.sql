-- AURIX 012 — Firma kapak görseli + sahip SELECT sütunları
-- Mevcut tabloları bozmaz. Yalnızca eksik kapak_url ekler.
-- Production’da is_seed / owner_id uydurulmaz.
-- Supabase SQL Editor’de bir kez çalıştırın (idempotent).

ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS kapak_url TEXT;

COMMENT ON COLUMN public.firmalar.kapak_url IS 'Firma kapak / vitrin görseli URL';

-- Sahip ve authenticated için gerçekten var olan sütunlara SELECT
DO $$
DECLARE
    wanted text[] := ARRAY[
        'id', 'firma_adi', 'sehir', 'kategori', 'aciklama',
        'telefon', 'email',
        'dogrulanmis', 'durum', 'created_at', 'user_id',
        'logo_url', 'kapak_url', 'calisma_gorselleri'
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
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (wanted);

    IF cols IS NULL OR array_length(cols, 1) IS NULL THEN
        RETURN;
    END IF;

    FOREACH col IN ARRAY cols LOOP
        IF grant_list <> '' THEN
            grant_list := grant_list || ', ';
        END IF;
        grant_list := grant_list || quote_ident(col);
    END LOOP;

    BEGIN
        EXECUTE format(
            'GRANT SELECT (%s) ON TABLE public.firmalar TO authenticated',
            grant_list
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'firmalar SELECT grant atlandı: %', SQLERRM;
    END;
END $$;

-- Public vitrin: telefon/email hâlâ grant edilmez (bilinçli).
-- Public SELECT politikası dogrulanmis + onaylandi ile sınırlı kalır.

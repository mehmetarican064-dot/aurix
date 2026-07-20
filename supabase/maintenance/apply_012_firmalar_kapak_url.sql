-- AURIX — 012 hızlı uygulama (Dashboard SQL Editor)
-- Kaynak: supabase/migrations/012_firmalar_kapak_url.sql

ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS kapak_url TEXT;

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
        NULL;
    END;
END $$;

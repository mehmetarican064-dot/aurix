-- AURIX 017-minimal — Yalnızca firma oluşturma (additive)
-- Mevcut policy’lere DOKUNMAZ. DROP POLICY yok. REVOKE yok.
-- Public SELECT policy’lerine dokunulmaz.
-- Eksikse: authenticated INSERT grant + INSERT RLS + own SELECT RLS.
-- Auth / Site URL / key / veri silme yok.

-- 1) INSERT için minimum kolon yetkisi (idempotent GRANT)
DO $$
DECLARE
    wanted text[] := ARRAY[
        'firma_adi', 'sehir', 'kategori', 'aciklama',
        'telefon', 'email', 'dogrulanmis', 'durum', 'user_id',
        'logo_url', 'kapak_url'
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

    EXECUTE format(
        'GRANT INSERT (%s) ON TABLE public.firmalar TO authenticated',
        grant_list
    );
END $$;

-- 2) insert().select() + user_id precheck için minimum SELECT kolonları
--    (anon’a verilmez; public SELECT grant’larına dokunulmaz)
DO $$
DECLARE
    wanted text[] := ARRAY[
        'id', 'firma_adi', 'dogrulanmis', 'durum', 'user_id'
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

    EXECUTE format(
        'GRANT SELECT (%s) ON TABLE public.firmalar TO authenticated',
        grant_list
    );
END $$;

-- 3) INSERT policy — yalnızca yoksa ekle (mevcut policy değiştirilmez)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'firmalar'
          AND policyname = 'firmalar_authenticated_insert'
    ) THEN
        CREATE POLICY "firmalar_authenticated_insert"
            ON public.firmalar
            FOR INSERT
            TO authenticated
            WITH CHECK (
                auth.uid() IS NOT NULL
                AND user_id = auth.uid()
                AND dogrulanmis IS FALSE
                AND durum = 'beklemede'
            );
    END IF;
END $$;

-- 4) Own SELECT — insert().select() için; yalnızca yoksa ekle
--    Public onaylı liste policy’lerine dokunulmaz
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'firmalar'
          AND policyname = 'firmalar_select_own'
    ) THEN
        CREATE POLICY "firmalar_select_own"
            ON public.firmalar
            FOR SELECT
            TO authenticated
            USING (
                auth.uid() IS NOT NULL
                AND user_id = auth.uid()
            );
    END IF;
END $$;

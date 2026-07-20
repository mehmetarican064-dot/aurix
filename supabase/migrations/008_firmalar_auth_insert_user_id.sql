-- AURIX 008 — Firma başvurusu: yalnızca authenticated insert + user_id RLS
-- Session yokken (e-posta doğrulama öncesi) insert yapılamaz.
-- Sahiplik sütunu: user_id (owner_id kullanılmaz).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'firmalar'
          AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.firmalar
            ADD COLUMN user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_firmalar_user_id ON public.firmalar (user_id);

ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firmalar_public_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_authenticated_insert" ON public.firmalar;

DO $$
DECLARE
    has_is_seed boolean;
    has_dogrulanmis boolean;
    has_durum boolean;
    check_expr text := 'auth.uid() = user_id';
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'is_seed'
    ) INTO has_is_seed;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'dogrulanmis'
    ) INTO has_dogrulanmis;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'durum'
    ) INTO has_durum;

    IF has_dogrulanmis THEN
        check_expr := check_expr || ' AND dogrulanmis IS FALSE';
    END IF;
    IF has_durum THEN
        check_expr := check_expr || ' AND durum = ''beklemede''';
    END IF;
    IF has_is_seed THEN
        check_expr := check_expr || ' AND COALESCE(is_seed, FALSE) IS FALSE';
    END IF;

    EXECUTE format(
        'CREATE POLICY "firmalar_authenticated_insert"
            ON public.firmalar
            FOR INSERT
            TO authenticated
            WITH CHECK (%s)',
        check_expr
    );
END $$;

DO $$
DECLARE
    cols text[];
    col text;
    allowed text[] := ARRAY[
        'id', 'firma_adi', 'sehir', 'kategori', 'aciklama',
        'dogrulanmis', 'durum', 'created_at'
    ];
    grant_list text := '';
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
      AND a.attname = ANY (allowed);

    REVOKE ALL ON TABLE public.firmalar FROM anon, authenticated;

    IF cols IS NOT NULL AND array_length(cols, 1) IS NOT NULL THEN
        FOREACH col IN ARRAY cols LOOP
            IF grant_list <> '' THEN
                grant_list := grant_list || ', ';
            END IF;
            grant_list := grant_list || quote_ident(col);
        END LOOP;
        EXECUTE format(
            'GRANT SELECT (%s) ON TABLE public.firmalar TO anon, authenticated',
            grant_list
        );
    END IF;

    GRANT INSERT ON TABLE public.firmalar TO authenticated;
END $$;

REVOKE UPDATE, DELETE ON TABLE public.firmalar FROM anon, authenticated;
REVOKE INSERT ON TABLE public.firmalar FROM anon;

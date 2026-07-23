-- AURIX 017 — Firma başvurusu: INSERT + kendi beklemede satırını SELECT
-- Production kolon kanıtı (REST, 2026-07-22):
--   VAR: id, firma_adi, sehir, kategori, aciklama, telefon, email,
--        dogrulanmis, durum, created_at, user_id, logo_url, kapak_url,
--        calisma_gorselleri, askiya_alindi
--   YOK: is_seed, owner_id
-- is_seed bu migration’da EKLENMEZ (başvuru akışı için gerekli değil).
-- Idempotent. DROP TABLE / TRUNCATE / DELETE yok. Auth / Site URL’ye dokunulmaz.

ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

-- user_id yoksa ekle (production’da var; güvenli no-op)
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

-- ---------------------------------------------------------------------------
-- Kolon GRANT’leri
-- anon: hassas kolon SELECT yok
-- authenticated: yalnızca başvuru/RETURNING için gerekli kolonlar
-- ---------------------------------------------------------------------------
REVOKE SELECT (
    user_id, telefon, email, calisma_gorselleri
) ON TABLE public.firmalar FROM anon;

DO $$
DECLARE
    insert_wanted text[] := ARRAY[
        'firma_adi', 'sehir', 'kategori', 'aciklama',
        'telefon', 'email', 'dogrulanmis', 'durum', 'user_id',
        'logo_url', 'kapak_url', 'calisma_gorselleri'
    ];
    select_wanted text[] := ARRAY[
        'id', 'firma_adi', 'sehir', 'kategori', 'aciklama',
        'dogrulanmis', 'durum', 'created_at', 'user_id',
        'telefon', 'email', 'logo_url', 'kapak_url'
    ];
    cols text[];
    grant_list text;
    col text;
BEGIN
    -- INSERT (authenticated)
    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (insert_wanted);

    IF cols IS NOT NULL AND array_length(cols, 1) IS NOT NULL THEN
        grant_list := '';
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
    END IF;

    -- SELECT (authenticated) — RLS ile yalnız kendi beklemede satırı
    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (select_wanted);

    IF cols IS NOT NULL AND array_length(cols, 1) IS NOT NULL THEN
        grant_list := '';
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
    END IF;
END $$;

REVOKE INSERT ON TABLE public.firmalar FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.firmalar FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- INSERT policy — yalnızca auth.uid() = user_id (+ beklemede başvuru)
-- Aynı isimli eski policy DROP IF EXISTS ile yenilenir (çakışma/tekrar yok)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "firmalar_public_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_authenticated_insert" ON public.firmalar;

DO $$
DECLARE
    has_dogrulanmis boolean;
    has_durum boolean;
    check_expr text;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'dogrulanmis'
    ) INTO has_dogrulanmis;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'durum'
    ) INTO has_durum;

    check_expr := 'auth.uid() IS NOT NULL AND user_id = auth.uid()';

    IF has_dogrulanmis THEN
        check_expr := check_expr || ' AND dogrulanmis IS FALSE';
    END IF;
    IF has_durum THEN
        check_expr := check_expr || ' AND durum = ''beklemede''';
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

-- ---------------------------------------------------------------------------
-- SELECT own — yalnız kendi beklemede kaydı (insert().select / precheck)
-- Public onaylı liste policy’sine dokunulmaz (firmalar_public_select vb.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "firmalar_select_own" ON public.firmalar;

DO $$
DECLARE
    has_durum boolean;
    using_expr text;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'durum'
    ) INTO has_durum;

    using_expr := 'auth.uid() IS NOT NULL AND user_id = auth.uid()';
    IF has_durum THEN
        using_expr := using_expr || ' AND durum = ''beklemede''';
    END IF;

    EXECUTE format(
        'CREATE POLICY "firmalar_select_own"
            ON public.firmalar
            FOR SELECT
            TO authenticated
            USING (%s)',
        using_expr
    );
END $$;

-- AURIX 016 — firmalar INSERT RLS: authenticated + yalnızca kendi user_id
-- Mevcut veriyi silmez. Auth tablolarına / Site URL’ye dokunmaz.
-- Eski çakışan insert policy’leri temizler; SELECT grant’lerini bozmaz.

ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

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

-- Çakışan / eski insert politikaları
DROP POLICY IF EXISTS "firmalar_public_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_authenticated_insert" ON public.firmalar;

DO $$
DECLARE
    has_is_seed boolean;
    has_dogrulanmis boolean;
    has_durum boolean;
    has_owner_id boolean;
    check_expr text;
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

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'owner_id'
    ) INTO has_owner_id;

    -- Zorunlu: oturum var + satır kendi user_id’si
    check_expr := 'auth.uid() IS NOT NULL AND user_id = auth.uid()';

    IF has_dogrulanmis THEN
        check_expr := check_expr || ' AND dogrulanmis IS FALSE';
    END IF;
    IF has_durum THEN
        check_expr := check_expr || ' AND durum = ''beklemede''';
    END IF;
    IF has_is_seed THEN
        check_expr := check_expr || ' AND COALESCE(is_seed, FALSE) IS FALSE';
    END IF;
    -- owner_id varsa: ya NULL ya da aynı uid (başka kullanıcı adına bağlanamaz)
    IF has_owner_id THEN
        check_expr := check_expr || ' AND (owner_id IS NULL OR owner_id = auth.uid())';
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

-- Sahip kendi satırını SELECT edebilsin (insert ... returning için)
DROP POLICY IF EXISTS "firmalar_select_own" ON public.firmalar;
CREATE POLICY "firmalar_select_own"
    ON public.firmalar
    FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- INSERT yetkisi (anon yok)
GRANT INSERT ON TABLE public.firmalar TO authenticated;
REVOKE INSERT ON TABLE public.firmalar FROM anon;

-- UPDATE/DELETE istemcide açılmaz
REVOKE UPDATE, DELETE ON TABLE public.firmalar FROM anon, authenticated;

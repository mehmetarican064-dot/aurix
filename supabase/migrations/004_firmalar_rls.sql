-- AURIX — public.firmalar sütun hizası + RLS
-- Supabase SQL Editor'de bir kez çalıştırın.
-- update / delete politikası YOK.

ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS firma_adi TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS sehir TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS kategori TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS aciklama TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS telefon TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS dogrulanmis BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firmalar_public_read_approved" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_public_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_select_dogrulanmis" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_insert" ON public.firmalar;

CREATE POLICY "firmalar_anon_select_dogrulanmis"
    ON public.firmalar
    FOR SELECT
    TO anon, authenticated
    USING (dogrulanmis = TRUE);

CREATE POLICY "firmalar_anon_insert"
    ON public.firmalar
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (dogrulanmis = FALSE);

GRANT SELECT, INSERT ON public.firmalar TO anon, authenticated;

-- is_talepleri: Acik okuma + insert (canlı liste)
ALTER TABLE public.is_talepleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "is_talepleri_public_read_approved" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_public_insert" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_anon_select_acik" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_anon_insert" ON public.is_talepleri;

CREATE POLICY "is_talepleri_anon_select_acik"
    ON public.is_talepleri
    FOR SELECT
    TO anon, authenticated
    USING (durum = 'Acik');

CREATE POLICY "is_talepleri_anon_insert"
    ON public.is_talepleri
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

GRANT SELECT, INSERT ON public.is_talepleri TO anon, authenticated;

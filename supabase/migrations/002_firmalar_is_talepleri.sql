-- AURIX — firmalar + is_talepleri (SPA istemcisi için)
-- Supabase SQL Editor'de tamamını bir kez çalıştırın.

-- ============================================================
-- 1. FIRMALAR
-- ============================================================
CREATE TABLE IF NOT EXISTS public.firmalar (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ad              TEXT NOT NULL CHECK (char_length(trim(ad)) BETWEEN 2 AND 200),
    kategori_id     TEXT NOT NULL,
    sehir           TEXT NOT NULL,
    tel             TEXT NOT NULL CHECK (tel ~ '^90[0-9]{10}$'),
    aciklama        TEXT NOT NULL CHECK (char_length(trim(aciklama)) BETWEEN 10 AND 2000),
    durum           TEXT NOT NULL DEFAULT 'beklemede'
                    CHECK (durum IN ('beklemede', 'onaylandi', 'reddedildi', 'askida')),
    premium         BOOLEAN NOT NULL DEFAULT FALSE,
    sponsor         BOOLEAN NOT NULL DEFAULT FALSE,
    puan            NUMERIC(3,1) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_firmalar_durum ON public.firmalar (durum);
CREATE INDEX IF NOT EXISTS idx_firmalar_sehir ON public.firmalar (sehir);
CREATE INDEX IF NOT EXISTS idx_firmalar_kategori ON public.firmalar (kategori_id);

ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firmalar_public_read_approved" ON public.firmalar;
CREATE POLICY "firmalar_public_read_approved"
    ON public.firmalar FOR SELECT
    TO anon, authenticated
    USING (durum = 'onaylandi');

DROP POLICY IF EXISTS "firmalar_public_insert" ON public.firmalar;
CREATE POLICY "firmalar_public_insert"
    ON public.firmalar FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        durum = 'beklemede'
        AND premium = FALSE
        AND sponsor = FALSE
    );

GRANT SELECT, INSERT ON public.firmalar TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.firmalar_id_seq TO anon, authenticated;

-- ============================================================
-- 2. IS_TALEPLERI
-- ============================================================
CREATE TABLE IF NOT EXISTS public.is_talepleri (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baslik          TEXT NOT NULL CHECK (char_length(trim(baslik)) BETWEEN 5 AND 200),
    kategori_id     TEXT NOT NULL,
    sehir           TEXT NOT NULL,
    adet            TEXT,
    termin          TEXT,
    butce           TEXT,
    aciklama        TEXT,
    durum           TEXT NOT NULL DEFAULT 'beklemede'
                    CHECK (durum IN ('beklemede', 'onaylandi', 'reddedildi')),
    durum_tip       TEXT NOT NULL DEFAULT 'bekliyor',
    teklif_sayisi   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_is_talepleri_durum ON public.is_talepleri (durum);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_sehir ON public.is_talepleri (sehir);

ALTER TABLE public.is_talepleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "is_talepleri_public_read_approved" ON public.is_talepleri;
CREATE POLICY "is_talepleri_public_read_approved"
    ON public.is_talepleri FOR SELECT
    TO anon, authenticated
    USING (durum = 'onaylandi');

DROP POLICY IF EXISTS "is_talepleri_public_insert" ON public.is_talepleri;
CREATE POLICY "is_talepleri_public_insert"
    ON public.is_talepleri FOR INSERT
    TO anon, authenticated
    WITH CHECK (durum = 'beklemede');

GRANT SELECT, INSERT ON public.is_talepleri TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.is_talepleri_id_seq TO anon, authenticated;

-- ============================================================
-- 3. ANA SAYFA İSTATİSTİKLERİ (satır sızdırmadan toplam sayı)
-- ============================================================
CREATE OR REPLACE FUNCTION public.aurix_istatistikler()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT json_build_object(
        'firma', (SELECT COUNT(*)::int FROM public.firmalar),
        'is_talep', (SELECT COUNT(*)::int FROM public.is_talepleri)
    );
$$;

REVOKE ALL ON FUNCTION public.aurix_istatistikler() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aurix_istatistikler() TO anon, authenticated;

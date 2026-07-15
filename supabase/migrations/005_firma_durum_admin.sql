-- AURIX 005 — firmalar: durum + dogrulanmis senkron + unique + RLS
-- Production-safe / idempotent: ikinci kez çalıştırılabilir.

-- ============================================================
-- 1. SÜTUN
-- ============================================================
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS durum TEXT;

-- ============================================================
-- 2. MEVCUT KAYITLARI DÜZELT
-- ============================================================
UPDATE public.firmalar
SET durum = CASE
    WHEN dogrulanmis IS TRUE THEN 'onaylandi'
    ELSE 'beklemede'
END
WHERE durum IS NULL
   OR btrim(durum) = ''
   OR durum NOT IN ('beklemede', 'onaylandi', 'reddedildi');

UPDATE public.firmalar
SET dogrulanmis = TRUE
WHERE durum = 'onaylandi' AND dogrulanmis IS DISTINCT FROM TRUE;

UPDATE public.firmalar
SET dogrulanmis = FALSE
WHERE durum IN ('beklemede', 'reddedildi') AND dogrulanmis IS DISTINCT FROM FALSE;

-- ============================================================
-- 3. DEFAULT + NOT NULL + CHECK
-- ============================================================
ALTER TABLE public.firmalar
    ALTER COLUMN durum SET DEFAULT 'beklemede';

ALTER TABLE public.firmalar
    ALTER COLUMN durum SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'firmalar_durum_check'
          AND conrelid = 'public.firmalar'::regclass
    ) THEN
        ALTER TABLE public.firmalar
            ADD CONSTRAINT firmalar_durum_check
            CHECK (durum IN ('beklemede', 'onaylandi', 'reddedildi'));
    END IF;
END $$;

-- ============================================================
-- 4. SENKRON TRIGGER FONKSİYONU
--    onaylandi  → dogrulanmis = true
--    beklemede / reddedildi → dogrulanmis = false
-- ============================================================
CREATE OR REPLACE FUNCTION public.firmalar_durum_dogrulanmis_senkron()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.durum = 'onaylandi' THEN
        NEW.dogrulanmis := TRUE;
    ELSIF NEW.durum IN ('beklemede', 'reddedildi') THEN
        NEW.dogrulanmis := FALSE;
    END IF;

    IF NEW.dogrulanmis IS TRUE THEN
        NEW.durum := 'onaylandi';
    ELSIF NEW.dogrulanmis IS FALSE AND NEW.durum = 'onaylandi' THEN
        NEW.durum := 'beklemede';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firmalar_durum_senkron ON public.firmalar;
CREATE TRIGGER trg_firmalar_durum_senkron
    BEFORE INSERT OR UPDATE ON public.firmalar
    FOR EACH ROW
    EXECUTE FUNCTION public.firmalar_durum_dogrulanmis_senkron();

-- ============================================================
-- 5. INDEXLER (tekrar başvuru engeli)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_firmalar_email_unique
    ON public.firmalar (lower(btrim(email)))
    WHERE email IS NOT NULL AND length(btrim(email)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_firmalar_adi_sehir_unique
    ON public.firmalar (lower(btrim(firma_adi)), lower(btrim(sehir)))
    WHERE firma_adi IS NOT NULL AND sehir IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_firmalar_durum
    ON public.firmalar (durum);

CREATE INDEX IF NOT EXISTS idx_firmalar_dogrulanmis
    ON public.firmalar (dogrulanmis);

-- ============================================================
-- 6. RLS — public okuma/yazma
--    SELECT: yalnızca onaylı + doğrulanmış
--    INSERT: yalnızca beklemede + dogrulanmis=false
--    UPDATE / DELETE: politika yok (frontend yapamaz)
-- ============================================================
ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firmalar_anon_select_dogrulanmis" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_public_read_approved" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_public_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_update" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_delete" ON public.firmalar;

CREATE POLICY "firmalar_anon_select_dogrulanmis"
    ON public.firmalar
    FOR SELECT
    TO anon, authenticated
    USING (
        dogrulanmis = TRUE
        AND durum = 'onaylandi'
    );

CREATE POLICY "firmalar_anon_insert"
    ON public.firmalar
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        dogrulanmis = FALSE
        AND durum = 'beklemede'
    );

-- Sadece SELECT + INSERT (UPDATE/DELETE yok)
GRANT SELECT, INSERT ON public.firmalar TO anon, authenticated;
REVOKE UPDATE, DELETE ON public.firmalar FROM anon, authenticated;

-- Not (istemci): public firma sorgusu yalnızca şu sütunları seçmeli —
-- id, firma_adi, sehir, kategori, aciklama, dogrulanmis, created_at
-- telefon ve email public select'te kullanılmamalıdır.

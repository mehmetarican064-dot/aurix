-- AURIX 006 — public.teklifler (idempotent)
-- Tekrar çalıştırılabilir. Fiyat public SELECT ile okunamaz.
-- Supabase SQL Editor’de çalıştırın.

-- 1) Tablo (yoksa oluştur; tipler parent tablolardan)
DO $$
DECLARE
    is_id_type text;
    firma_id_type text;
BEGIN
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO is_id_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'is_talepleri'
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO firma_id_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    IF is_id_type IS NULL OR firma_id_type IS NULL THEN
        RAISE EXCEPTION 'is_talepleri.id veya firmalar.id bulunamadı';
    END IF;

    IF to_regclass('public.teklifler') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.teklifler (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                is_id %s NOT NULL,
                firma_id %s NOT NULL,
                fiyat NUMERIC(14, 2) NOT NULL,
                termin_gun INTEGER NOT NULL,
                mesaj TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        $sql$, is_id_type, firma_id_type);
    END IF;
END $$;

-- 2) Sütunlar (tablo eski/parçalıysa tamamla)
ALTER TABLE public.teklifler ADD COLUMN IF NOT EXISTS fiyat NUMERIC(14, 2);
ALTER TABLE public.teklifler ADD COLUMN IF NOT EXISTS termin_gun INTEGER;
ALTER TABLE public.teklifler ADD COLUMN IF NOT EXISTS mesaj TEXT;
ALTER TABLE public.teklifler ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- created_at varsayılan
ALTER TABLE public.teklifler ALTER COLUMN created_at SET DEFAULT NOW();

-- Boş/geçersiz satırları CHECK öncesi düzelt (idempotent)
UPDATE public.teklifler SET fiyat = 1 WHERE fiyat IS NULL OR fiyat <= 0;
UPDATE public.teklifler SET termin_gun = 1 WHERE termin_gun IS NULL OR termin_gun <= 0;
UPDATE public.teklifler SET created_at = NOW() WHERE created_at IS NULL;

-- 3) CHECK: fiyat > 0, termin_gun > 0
ALTER TABLE public.teklifler DROP CONSTRAINT IF EXISTS teklifler_fiyat_check;
ALTER TABLE public.teklifler ADD CONSTRAINT teklifler_fiyat_check CHECK (fiyat > 0);

ALTER TABLE public.teklifler DROP CONSTRAINT IF EXISTS teklifler_termin_gun_check;
ALTER TABLE public.teklifler ADD CONSTRAINT teklifler_termin_gun_check
    CHECK (termin_gun > 0 AND termin_gun <= 3650);

-- 4) FK (yoksa)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teklifler_is_id_fkey'
          AND conrelid = 'public.teklifler'::regclass
    ) THEN
        ALTER TABLE public.teklifler
            ADD CONSTRAINT teklifler_is_id_fkey
            FOREIGN KEY (is_id) REFERENCES public.is_talepleri(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teklifler_firma_id_fkey'
          AND conrelid = 'public.teklifler'::regclass
    ) THEN
        ALTER TABLE public.teklifler
            ADD CONSTRAINT teklifler_firma_id_fkey
            FOREIGN KEY (firma_id) REFERENCES public.firmalar(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5) Aynı firma + aynı iş = tek teklif
ALTER TABLE public.teklifler DROP CONSTRAINT IF EXISTS teklifler_is_firma_unique;
DROP INDEX IF EXISTS public.teklifler_is_firma_unique;
CREATE UNIQUE INDEX IF NOT EXISTS teklifler_is_firma_unique
    ON public.teklifler (is_id, firma_id);

CREATE INDEX IF NOT EXISTS idx_teklifler_is_id ON public.teklifler (is_id);
CREATE INDEX IF NOT EXISTS idx_teklifler_firma_id ON public.teklifler (firma_id);
CREATE INDEX IF NOT EXISTS idx_teklifler_created_at ON public.teklifler (created_at DESC);

-- 6) RLS
ALTER TABLE public.teklifler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teklifler_anon_insert" ON public.teklifler;
DROP POLICY IF EXISTS "teklifler_anon_select" ON public.teklifler;
DROP POLICY IF EXISTS "teklifler_public_insert" ON public.teklifler;
DROP POLICY IF EXISTS "teklifler_public_select" ON public.teklifler;
DROP POLICY IF EXISTS "teklifler_anon_update" ON public.teklifler;
DROP POLICY IF EXISTS "teklifler_anon_delete" ON public.teklifler;

-- Insert: yalnızca onaylı/doğrulanmış firma + açık iş + fiyat/termin > 0
CREATE POLICY "teklifler_anon_insert"
    ON public.teklifler
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        fiyat > 0
        AND termin_gun > 0
        AND EXISTS (
            SELECT 1 FROM public.firmalar f
            WHERE f.id = firma_id
              AND f.dogrulanmis IS TRUE
              AND f.durum = 'onaylandi'
        )
        AND EXISTS (
            SELECT 1 FROM public.is_talepleri i
            WHERE i.id = is_id
              AND i.durum = 'Acik'
        )
    );

CREATE POLICY "teklifler_anon_select"
    ON public.teklifler
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- UPDATE / DELETE yok (politika yok = anon yapamaz)
REVOKE ALL ON TABLE public.teklifler FROM anon, authenticated;
GRANT INSERT ON TABLE public.teklifler TO anon, authenticated;
GRANT SELECT (id, is_id, firma_id, termin_gun, created_at) ON TABLE public.teklifler TO anon, authenticated;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'teklifler_id_seq'
    ) THEN
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.teklifler_id_seq TO anon, authenticated';
    END IF;
END $$;

-- 7) Public özet view (fiyat/mesaj yok)
DROP VIEW IF EXISTS public.teklifler_public;
CREATE VIEW public.teklifler_public
WITH (security_invoker = true)
AS
SELECT
    id,
    is_id,
    firma_id,
    termin_gun,
    created_at
FROM public.teklifler;

GRANT SELECT ON public.teklifler_public TO anon, authenticated;

-- 8) firmalar: public SELECT’te telefon/email yok (idempotent; mevcut sütunlara göre)
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
    SELECT array_agg(a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (allowed);

    IF cols IS NULL OR array_length(cols, 1) IS NULL THEN
        RAISE NOTICE 'firmalar public sütun grant atlandı';
        RETURN;
    END IF;

    REVOKE ALL ON TABLE public.firmalar FROM anon, authenticated;
    GRANT INSERT ON TABLE public.firmalar TO anon, authenticated;

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
END $$;

-- 9) is_talepleri: update/delete yok
REVOKE UPDATE, DELETE ON TABLE public.is_talepleri FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.is_talepleri TO anon, authenticated;

COMMENT ON TABLE public.teklifler IS 'İş teklifleri — fiyat/mesaj anon SELECT ile okunamaz; update/delete yok.';
COMMENT ON COLUMN public.teklifler.fiyat IS 'Insert edilir; public select yok.';
COMMENT ON VIEW public.teklifler_public IS 'Herkese açık teklif özeti (fiyat/mesaj yok).';

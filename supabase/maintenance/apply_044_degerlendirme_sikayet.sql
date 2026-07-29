-- AURIX 044 — Tamamlanan işler için değerlendirme (puan/yorum) ve şikayet sistemi
-- Idempotent. DROP TABLE / TRUNCATE / kontrolsüz DELETE yok.
--
-- Hedef:
-- 1) public.degerlendirmeler — is_talebi başına 1 değerlendirme, yalnızca durum='tamamlandi' iken
-- 2) public.sikayetler — iş talebine bağlı şikayet kaydı + admin durum güncelleme
-- 3) firmalar.puan_ortalama / firmalar.yorum_sayisi — trigger ile otomatik güncellenir
-- 4) RPC: degerlendirme_gonder, firma_yorumlari, sikayet_bildir,
--         admin_sikayet_listesi, admin_sikayet_guncelle
--
-- Bu dosya ile supabase/migrations/044_degerlendirme_sikayet.sql aynıdır.

-- ============================================================
-- 1. firmalar: puan_ortalama / yorum_sayisi
-- ============================================================
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS puan_ortalama NUMERIC(3, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS yorum_sayisi INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.firmalar.puan_ortalama IS 'degerlendirmeler tablosundan tetikleyici ile hesaplanır (0-5).';
COMMENT ON COLUMN public.firmalar.yorum_sayisi IS 'degerlendirmeler tablosundan tetikleyici ile hesaplanır.';

-- ============================================================
-- 2. Tablo: degerlendirmeler
-- ============================================================
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
    WHERE n.nspname = 'public' AND c.relname = 'is_talepleri'
      AND a.attname = 'id' AND NOT a.attisdropped;

    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO firma_id_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'firmalar'
      AND a.attname = 'id' AND NOT a.attisdropped;

    IF is_id_type IS NULL OR firma_id_type IS NULL THEN
        RAISE EXCEPTION 'is_talepleri.id veya firmalar.id bulunamadı';
    END IF;

    IF to_regclass('public.degerlendirmeler') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.degerlendirmeler (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                is_talebi_id %s NOT NULL,
                gonderen_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                hedef_firma_id %s NOT NULL REFERENCES public.firmalar (id) ON DELETE CASCADE,
                puan SMALLINT NOT NULL CHECK (puan BETWEEN 1 AND 5),
                yorum TEXT CHECK (yorum IS NULL OR char_length(yorum) <= 1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT degerlendirmeler_is_talebi_unique UNIQUE (is_talebi_id)
            )
        $sql$, is_id_type, firma_id_type);
    END IF;
END $$;

ALTER TABLE public.degerlendirmeler ADD COLUMN IF NOT EXISTS puan SMALLINT;
ALTER TABLE public.degerlendirmeler ADD COLUMN IF NOT EXISTS yorum TEXT;
ALTER TABLE public.degerlendirmeler ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'degerlendirmeler_is_talebi_unique'
          AND conrelid = 'public.degerlendirmeler'::regclass
    ) THEN
        ALTER TABLE public.degerlendirmeler
            ADD CONSTRAINT degerlendirmeler_is_talebi_unique UNIQUE (is_talebi_id);
    END IF;
END $$;

-- FK (is_talepleri) — yoksa ekle
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'degerlendirmeler_is_talebi_fkey'
          AND conrelid = 'public.degerlendirmeler'::regclass
    ) THEN
        ALTER TABLE public.degerlendirmeler
            ADD CONSTRAINT degerlendirmeler_is_talebi_fkey
            FOREIGN KEY (is_talebi_id) REFERENCES public.is_talepleri (id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_degerlendirmeler_hedef_firma ON public.degerlendirmeler (hedef_firma_id);
CREATE INDEX IF NOT EXISTS idx_degerlendirmeler_gonderen ON public.degerlendirmeler (gonderen_id);
CREATE INDEX IF NOT EXISTS idx_degerlendirmeler_created_at ON public.degerlendirmeler (created_at DESC);

COMMENT ON TABLE public.degerlendirmeler IS
    'Tamamlanan iş talepleri için müşteri değerlendirmesi. Tek yol: degerlendirme_gonder() RPC.';

-- ============================================================
-- 3. Tablo: sikayetler
-- ============================================================
DO $$
DECLARE
    is_id_type text;
BEGIN
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO is_id_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'is_talepleri'
      AND a.attname = 'id' AND NOT a.attisdropped;

    IF is_id_type IS NULL THEN
        RAISE EXCEPTION 'is_talepleri.id bulunamadı';
    END IF;

    IF to_regclass('public.sikayetler') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.sikayetler (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                is_talebi_id %s NOT NULL,
                bildiren_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                sikayet_nedeni TEXT NOT NULL CHECK (char_length(trim(sikayet_nedeni)) BETWEEN 2 AND 200),
                detay TEXT CHECK (detay IS NULL OR char_length(detay) <= 2000),
                durum TEXT NOT NULL DEFAULT 'beklemede'
                    CHECK (durum IN ('beklemede', 'incelendi', 'cozuldu')),
                admin_not TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                guncellenme_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        $sql$, is_id_type);
    END IF;
END $$;

ALTER TABLE public.sikayetler ADD COLUMN IF NOT EXISTS admin_not TEXT;
ALTER TABLE public.sikayetler ADD COLUMN IF NOT EXISTS guncellenme_tarihi TIMESTAMPTZ DEFAULT NOW();
UPDATE public.sikayetler SET guncellenme_tarihi = COALESCE(guncellenme_tarihi, created_at, NOW())
WHERE guncellenme_tarihi IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sikayetler_is_talebi_fkey'
          AND conrelid = 'public.sikayetler'::regclass
    ) THEN
        ALTER TABLE public.sikayetler
            ADD CONSTRAINT sikayetler_is_talebi_fkey
            FOREIGN KEY (is_talebi_id) REFERENCES public.is_talepleri (id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sikayetler_durum_check'
          AND conrelid = 'public.sikayetler'::regclass
    ) THEN
        ALTER TABLE public.sikayetler DROP CONSTRAINT sikayetler_durum_check;
    END IF;
END $$;
ALTER TABLE public.sikayetler
    ADD CONSTRAINT sikayetler_durum_check CHECK (durum IN ('beklemede', 'incelendi', 'cozuldu'));

CREATE INDEX IF NOT EXISTS idx_sikayetler_is_talebi ON public.sikayetler (is_talebi_id);
CREATE INDEX IF NOT EXISTS idx_sikayetler_bildiren ON public.sikayetler (bildiren_id);
CREATE INDEX IF NOT EXISTS idx_sikayetler_durum ON public.sikayetler (durum);
CREATE INDEX IF NOT EXISTS idx_sikayetler_created_at ON public.sikayetler (created_at DESC);

COMMENT ON TABLE public.sikayetler IS
    'İş talebine bağlı şikayetler. Tek yol: sikayet_bildir() RPC. Durum admin_sikayet_guncelle() ile değişir.';

-- set_updated_at() NEW.updated_at kullanır; sikayetler.guncellenme_tarihi için ayrı fonksiyon
CREATE OR REPLACE FUNCTION public.sikayet_guncellenme_tarihi_set()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.guncellenme_tarihi = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sikayetler_updated_at ON public.sikayetler;
CREATE TRIGGER sikayetler_updated_at
    BEFORE UPDATE ON public.sikayetler
    FOR EACH ROW EXECUTE FUNCTION public.sikayet_guncellenme_tarihi_set();

-- ============================================================
-- 4. Yardımcı: firma_yetkilisi_mi
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_yetkilisi_mi(p_firma_id anyelement, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    sonuc boolean := false;
BEGIN
    IF p_firma_id IS NULL OR p_uid IS NULL THEN
        RETURN false;
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.firmalar f
        WHERE f.id = p_firma_id AND f.user_id = p_uid
    ) INTO sonuc;
    IF sonuc THEN RETURN true; END IF;
    BEGIN
        SELECT EXISTS (
            SELECT 1 FROM public.firmalar f
            WHERE f.id = p_firma_id AND f.owner_id = p_uid
        ) INTO sonuc;
    EXCEPTION WHEN OTHERS THEN
        sonuc := false;
    END;
    RETURN sonuc;
END;
$$;

REVOKE ALL ON FUNCTION public.firma_yetkilisi_mi(anyelement, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_yetkilisi_mi(anyelement, uuid) TO authenticated;

-- ============================================================
-- 5. RLS: degerlendirmeler (herkes okuyabilir — yayınlanmış puan/yorum)
-- ============================================================
ALTER TABLE public.degerlendirmeler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "degerlendirmeler_public_select" ON public.degerlendirmeler;
CREATE POLICY "degerlendirmeler_public_select"
    ON public.degerlendirmeler FOR SELECT
    TO anon, authenticated
    USING (true);

-- INSERT/UPDATE/DELETE yok — yalnızca degerlendirme_gonder() RPC (SECURITY DEFINER)
REVOKE ALL ON TABLE public.degerlendirmeler FROM anon, authenticated;
GRANT SELECT ON TABLE public.degerlendirmeler TO anon, authenticated;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'degerlendirmeler_id_seq'
    ) THEN
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.degerlendirmeler_id_seq TO anon, authenticated';
    END IF;
END $$;

-- ============================================================
-- 6. RLS: sikayetler (yalnızca bildiren veya admin okuyabilir)
-- ============================================================
ALTER TABLE public.sikayetler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sikayetler_own_or_admin_select" ON public.sikayetler;
CREATE POLICY "sikayetler_own_or_admin_select"
    ON public.sikayetler FOR SELECT
    TO authenticated
    USING (bildiren_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "sikayetler_admin_update" ON public.sikayetler;
CREATE POLICY "sikayetler_admin_update"
    ON public.sikayetler FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- INSERT yok — yalnızca sikayet_bildir() RPC
REVOKE ALL ON TABLE public.sikayetler FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.sikayetler TO authenticated;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'sikayetler_id_seq'
    ) THEN
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.sikayetler_id_seq TO authenticated';
    END IF;
END $$;

-- ============================================================
-- 7. Trigger: firmalar.puan_ortalama / yorum_sayisi otomatik güncelleme
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_puan_ozet_guncelle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    fid_new text;
    fid_old text;
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        fid_new := NEW.hedef_firma_id::text;
        UPDATE public.firmalar f
        SET puan_ortalama = COALESCE((
                SELECT ROUND(AVG(d.puan)::numeric, 2)
                FROM public.degerlendirmeler d
                WHERE d.hedef_firma_id::text = fid_new
            ), 0),
            yorum_sayisi = COALESCE((
                SELECT COUNT(*) FROM public.degerlendirmeler d
                WHERE d.hedef_firma_id::text = fid_new
            ), 0)
        WHERE f.id::text = fid_new;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        fid_old := OLD.hedef_firma_id::text;
        IF TG_OP = 'DELETE' OR fid_old IS DISTINCT FROM fid_new THEN
            UPDATE public.firmalar f
            SET puan_ortalama = COALESCE((
                    SELECT ROUND(AVG(d.puan)::numeric, 2)
                    FROM public.degerlendirmeler d
                    WHERE d.hedef_firma_id::text = fid_old
                ), 0),
                yorum_sayisi = COALESCE((
                    SELECT COUNT(*) FROM public.degerlendirmeler d
                    WHERE d.hedef_firma_id::text = fid_old
                ), 0)
            WHERE f.id::text = fid_old;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_degerlendirmeler_puan_guncelle ON public.degerlendirmeler;
CREATE TRIGGER trg_degerlendirmeler_puan_guncelle
    AFTER INSERT OR UPDATE OR DELETE ON public.degerlendirmeler
    FOR EACH ROW EXECUTE FUNCTION public.firma_puan_ozet_guncelle();

-- Grant: puan_ortalama / yorum_sayisi public select
DO $$
BEGIN
    BEGIN
        GRANT SELECT (puan_ortalama, yorum_sayisi) ON TABLE public.firmalar TO anon, authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- ============================================================
-- 8. RPC: degerlendirme_gonder
-- ============================================================
CREATE OR REPLACE FUNCTION public.degerlendirme_gonder(
    p_is_talebi_id text,
    p_puan integer,
    p_yorum text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    is_row record;
    yorum_temiz text := NULLIF(btrim(COALESCE(p_yorum, '')), '');
    yeni_id bigint;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF p_is_talebi_id IS NULL OR btrim(p_is_talebi_id) = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF p_puan IS NULL OR p_puan < 1 OR p_puan > 5 THEN
        RAISE EXCEPTION 'puan_gecersiz' USING ERRCODE = '22023';
    END IF;
    IF yorum_temiz IS NOT NULL AND char_length(yorum_temiz) > 1000 THEN
        RAISE EXCEPTION 'yorum_uzun' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO is_row
    FROM public.is_talepleri i
    WHERE i.id::text = btrim(p_is_talebi_id)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    IF NOT (is_row.kullanici_id = uid OR is_row.owner_id = uid) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    IF is_row.durum <> 'tamamlandi' THEN
        RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
    END IF;

    IF is_row.secilen_firma_id IS NULL THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.degerlendirmeler d
        WHERE d.is_talebi_id::text = btrim(p_is_talebi_id)
    ) THEN
        RAISE EXCEPTION 'zaten_degerlendirildi' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.degerlendirmeler (is_talebi_id, gonderen_id, hedef_firma_id, puan, yorum)
    VALUES (is_row.id, uid, is_row.secilen_firma_id, p_puan, yorum_temiz)
    RETURNING id INTO yeni_id;

    BEGIN
        INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar, eski_durum, yeni_durum)
        VALUES (is_row.id, uid, 'degerlendirme_gonder', 'Puan: ' || p_puan, is_row.durum, is_row.durum);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'ok', true,
        'id', yeni_id,
        'is_talebi_id', is_row.id::text,
        'hedef_firma_id', is_row.secilen_firma_id::text,
        'puan', p_puan
    );
END;
$$;

REVOKE ALL ON FUNCTION public.degerlendirme_gonder(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.degerlendirme_gonder(text, integer, text) TO authenticated;

-- ============================================================
-- 9. RPC: firma_yorumlari (public — firma profili için)
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_yorumlari(p_firma_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
    ozet record;
BEGIN
    IF p_firma_id IS NULL OR btrim(p_firma_id) = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT d.id, d.puan, d.yorum, d.created_at
        FROM public.degerlendirmeler d
        WHERE d.hedef_firma_id::text = btrim(p_firma_id)
        ORDER BY d.created_at DESC
        LIMIT 100
    ) x;

    SELECT f.puan_ortalama, f.yorum_sayisi INTO ozet
    FROM public.firmalar f
    WHERE f.id::text = btrim(p_firma_id);

    RETURN jsonb_build_object(
        'ok', true,
        'puan_ortalama', COALESCE(ozet.puan_ortalama, 0),
        'yorum_sayisi', COALESCE(ozet.yorum_sayisi, 0),
        'yorumlar', COALESCE(rows, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_yorumlari(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_yorumlari(text) TO anon, authenticated;

-- ============================================================
-- 10. RPC: sikayet_bildir
-- ============================================================
CREATE OR REPLACE FUNCTION public.sikayet_bildir(
    p_is_talebi_id text,
    p_sikayet_nedeni text,
    p_detay text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    is_row record;
    neden_temiz text := NULLIF(btrim(COALESCE(p_sikayet_nedeni, '')), '');
    detay_temiz text := NULLIF(btrim(COALESCE(p_detay, '')), '');
    yetkili boolean := false;
    yeni_id bigint;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF p_is_talebi_id IS NULL OR btrim(p_is_talebi_id) = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF neden_temiz IS NULL OR char_length(neden_temiz) < 2 THEN
        RAISE EXCEPTION 'neden_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF char_length(neden_temiz) > 200 THEN
        RAISE EXCEPTION 'neden_uzun' USING ERRCODE = '22023';
    END IF;
    IF detay_temiz IS NOT NULL AND char_length(detay_temiz) > 2000 THEN
        RAISE EXCEPTION 'detay_uzun' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO is_row
    FROM public.is_talepleri i
    WHERE i.id::text = btrim(p_is_talebi_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    IF is_row.kullanici_id = uid OR is_row.owner_id = uid THEN
        yetkili := true;
    ELSIF is_row.secilen_firma_id IS NOT NULL AND public.firma_yetkilisi_mi(is_row.secilen_firma_id, uid) THEN
        yetkili := true;
    END IF;

    IF NOT yetkili THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.sikayetler (is_talebi_id, bildiren_id, sikayet_nedeni, detay)
    VALUES (is_row.id, uid, neden_temiz, detay_temiz)
    RETURNING id INTO yeni_id;

    BEGIN
        INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar, eski_durum, yeni_durum)
        VALUES (is_row.id, uid, 'sikayet_bildir', neden_temiz, is_row.durum, is_row.durum);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object('ok', true, 'id', yeni_id, 'is_talebi_id', is_row.id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.sikayet_bildir(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sikayet_bildir(text, text, text) TO authenticated;

-- ============================================================
-- 11. RPC: admin_sikayet_listesi / admin_sikayet_guncelle
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_sikayet_listesi(p_durum text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
    filtre text := NULLIF(btrim(COALESCE(p_durum, '')), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            s.id,
            s.is_talebi_id::text AS is_talebi_id,
            COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi') AS is_baslik,
            s.bildiren_id,
            COALESCE(p.email, '') AS bildiren_email,
            s.sikayet_nedeni,
            s.detay,
            s.durum,
            s.admin_not,
            s.created_at,
            s.guncellenme_tarihi
        FROM public.sikayetler s
        LEFT JOIN public.is_talepleri i ON i.id = s.is_talebi_id
        LEFT JOIN public.profiles p ON p.id = s.bildiren_id
        WHERE filtre IS NULL OR filtre = 'hepsi' OR s.durum = filtre
    ) x;

    RETURN jsonb_build_object('ok', true, 'sikayetler', COALESCE(rows, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sikayet_guncelle(
    p_sikayet_id bigint,
    p_yeni_durum text,
    p_admin_not text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    yeni text := lower(btrim(COALESCE(p_yeni_durum, '')));
    not_temiz text := NULLIF(btrim(COALESCE(p_admin_not, '')), '');
    satir record;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;
    IF p_sikayet_id IS NULL THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF yeni NOT IN ('beklemede', 'incelendi', 'cozuldu') THEN
        RAISE EXCEPTION 'gecersiz_durum' USING ERRCODE = '22023';
    END IF;

    UPDATE public.sikayetler
    SET durum = yeni,
        admin_not = COALESCE(not_temiz, admin_not)
    WHERE id = p_sikayet_id
    RETURNING * INTO satir;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'sikayet_yok' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('ok', true, 'id', satir.id, 'durum', satir.durum);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sikayet_listesi(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_sikayet_guncelle(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sikayet_listesi(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sikayet_guncelle(bigint, text, text) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[044] Değerlendirme / şikayet sistemi tamamlandı.';
END $$;

-- AURIX 042 — İş talebine bağlı platform içi mesajlaşma
-- Idempotent. DROP TABLE / TRUNCATE / kontrolsüz DELETE yok.
--
-- Hedef:
-- 1) public.mesajlar (iş talebi + gönderen/alıcı)
-- 2) RLS: yalnızca iş sahibi veya ilgili teklif veren (ve admin)
-- 3) Private bucket mesaj-dosyalari (PNG/JPG/PDF)
-- 4) RPC: karşı taraf listesi, konuşmalar, gönder, okundu, signed URL
-- 5) Realtime yayını
--
-- Bu dosya ile supabase/maintenance/apply_042_is_talebi_mesajlasma.sql aynıdır.

-- ============================================================
-- 1. Tablo
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
    WHERE n.nspname = 'public'
      AND c.relname = 'is_talepleri'
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    IF is_id_type IS NULL THEN
        RAISE EXCEPTION 'is_talepleri.id tipi bulunamadı';
    END IF;

    IF to_regclass('public.mesajlar') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.mesajlar (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                is_talebi_id %s NOT NULL REFERENCES public.is_talepleri (id) ON DELETE CASCADE,
                gonderen_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                alici_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                mesaj_metni TEXT,
                dosya_url TEXT,
                okundu_mu BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT mesajlar_metin_veya_dosya CHECK (
                    (mesaj_metni IS NOT NULL AND btrim(mesaj_metni) <> '')
                    OR (dosya_url IS NOT NULL AND btrim(dosya_url) <> '')
                ),
                CONSTRAINT mesajlar_farkli_taraflar CHECK (gonderen_id <> alici_id),
                CONSTRAINT mesajlar_metin_uzunluk CHECK (
                    mesaj_metni IS NULL OR char_length(mesaj_metni) <= 4000
                )
            )
        $sql$, is_id_type);
    END IF;
END $$;

ALTER TABLE public.mesajlar ADD COLUMN IF NOT EXISTS mesaj_metni TEXT;
ALTER TABLE public.mesajlar ADD COLUMN IF NOT EXISTS dosya_url TEXT;
ALTER TABLE public.mesajlar ADD COLUMN IF NOT EXISTS okundu_mu BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.mesajlar ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS mesajlar_is_created_idx
    ON public.mesajlar (is_talebi_id, created_at ASC);
CREATE INDEX IF NOT EXISTS mesajlar_alici_okunmamis_idx
    ON public.mesajlar (alici_id, okundu_mu)
    WHERE okundu_mu = FALSE;
CREATE INDEX IF NOT EXISTS mesajlar_gonderen_idx
    ON public.mesajlar (gonderen_id, created_at DESC);

COMMENT ON TABLE public.mesajlar IS
    'İş talebi sohbet mesajları. dosya_url = private storage path (public URL değil).';

-- ============================================================
-- 2. Yetki yardımcıları
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_sahibi_mi(p_is_id text, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    ok boolean := false;
BEGIN
    IF p_uid IS NULL OR p_is_id IS NULL OR btrim(p_is_id) = '' THEN
        RETURN false;
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.is_talepleri i
        WHERE i.id::text = btrim(p_is_id)
          AND (i.kullanici_id = p_uid OR i.owner_id = p_uid)
    ) INTO ok;
    RETURN COALESCE(ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_talebi_teklif_veren_mi(p_is_id text, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    ok boolean := false;
    has_owner boolean := false;
BEGIN
    IF p_uid IS NULL OR p_is_id IS NULL OR btrim(p_is_id) = '' THEN
        RETURN false;
    END IF;

    BEGIN
        has_owner := EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'owner_id'
        );
    EXCEPTION WHEN OTHERS THEN
        has_owner := false;
    END;

    IF has_owner THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.teklifler t
            JOIN public.firmalar f ON f.id = t.firma_id
            WHERE t.is_id::text = btrim(p_is_id)
              AND (f.user_id = p_uid OR f.owner_id = p_uid)
        ) INTO ok;
    ELSE
        SELECT EXISTS (
            SELECT 1
            FROM public.teklifler t
            JOIN public.firmalar f ON f.id = t.firma_id
            WHERE t.is_id::text = btrim(p_is_id)
              AND f.user_id = p_uid
        ) INTO ok;
    END IF;

    RETURN COALESCE(ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.mesaj_katilimci_mi(p_is_id text, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
    SELECT COALESCE(public.is_admin(), false)
        OR public.is_talebi_sahibi_mi(p_is_id, p_uid)
        OR public.is_talebi_teklif_veren_mi(p_is_id, p_uid);
$$;

CREATE OR REPLACE FUNCTION public.mesaj_cift_gecerli(p_is_id text, p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
    SELECT p_a IS NOT NULL
       AND p_b IS NOT NULL
       AND p_a <> p_b
       AND public.mesaj_katilimci_mi(p_is_id, p_a)
       AND public.mesaj_katilimci_mi(p_is_id, p_b)
       AND (
           (public.is_talebi_sahibi_mi(p_is_id, p_a) AND public.is_talebi_teklif_veren_mi(p_is_id, p_b))
           OR
           (public.is_talebi_sahibi_mi(p_is_id, p_b) AND public.is_talebi_teklif_veren_mi(p_is_id, p_a))
       );
$$;

REVOKE ALL ON FUNCTION public.is_talebi_sahibi_mi(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_talebi_teklif_veren_mi(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesaj_katilimci_mi(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesaj_cift_gecerli(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_sahibi_mi(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_talebi_teklif_veren_mi(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_katilimci_mi(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_cift_gecerli(text, uuid, uuid) TO authenticated;

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE public.mesajlar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mesajlar_select_katilimci" ON public.mesajlar;
DROP POLICY IF EXISTS "mesajlar_insert_katilimci" ON public.mesajlar;
DROP POLICY IF EXISTS "mesajlar_update_okundu" ON public.mesajlar;

CREATE POLICY "mesajlar_select_katilimci"
    ON public.mesajlar FOR SELECT TO authenticated
    USING (
        gonderen_id = auth.uid()
        OR alici_id = auth.uid()
        OR public.mesaj_katilimci_mi(is_talebi_id::text, auth.uid())
    );

CREATE POLICY "mesajlar_insert_katilimci"
    ON public.mesajlar FOR INSERT TO authenticated
    WITH CHECK (
        gonderen_id = auth.uid()
        AND public.mesaj_cift_gecerli(is_talebi_id::text, gonderen_id, alici_id)
    );

-- okundu işaretleme yalnızca SECURITY DEFINER RPC ile
REVOKE ALL ON TABLE public.mesajlar FROM anon;
REVOKE ALL ON TABLE public.mesajlar FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.mesajlar TO authenticated;

-- ============================================================
-- 4. Storage: mesaj-dosyalari (private)
-- ============================================================
DO $$
BEGIN
    IF to_regclass('storage.buckets') IS NULL THEN
        RAISE NOTICE '[042] storage.buckets yok; mesaj-dosyalari atlandı.';
        RETURN;
    END IF;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'mesaj-dosyalari',
        'mesaj-dosyalari',
        false,
        10485760,
        ARRAY['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE SET
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[042] mesaj-dosyalari bucket: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RETURN;
    END IF;

    DROP POLICY IF EXISTS "mesaj_dosya_insert" ON storage.objects;
    DROP POLICY IF EXISTS "mesaj_dosya_select" ON storage.objects;
    DROP POLICY IF EXISTS "mesaj_dosya_delete" ON storage.objects;

    -- path: {uid}/{is_talebi_id}/{filename}
    CREATE POLICY "mesaj_dosya_insert"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'mesaj-dosyalari'
            AND (storage.foldername(name))[1] = auth.uid()::text
            AND public.mesaj_katilimci_mi((storage.foldername(name))[2], auth.uid())
        );

    CREATE POLICY "mesaj_dosya_select"
        ON storage.objects FOR SELECT TO authenticated
        USING (
            bucket_id = 'mesaj-dosyalari'
            AND (
                (storage.foldername(name))[1] = auth.uid()::text
                OR public.mesaj_katilimci_mi((storage.foldername(name))[2], auth.uid())
                OR public.is_admin()
            )
        );

    CREATE POLICY "mesaj_dosya_delete"
        ON storage.objects FOR DELETE TO authenticated
        USING (
            bucket_id = 'mesaj-dosyalari'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[042] mesaj storage politikaları: %', SQLERRM;
END $$;

-- ============================================================
-- 5. RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.mesaj_karsi_liste(p_is_talebi_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    rows jsonb := '[]'::jsonb;
    sahip_uid uuid;
    baslik text;
    has_owner boolean := false;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF p_is_talebi_id IS NULL OR btrim(p_is_talebi_id) = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF NOT public.mesaj_katilimci_mi(p_is_talebi_id, uid) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(i.kullanici_id, i.owner_id), COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi')
    INTO sahip_uid, baslik
    FROM public.is_talepleri i
    WHERE i.id::text = btrim(p_is_talebi_id);

    IF sahip_uid IS NULL THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    BEGIN
        has_owner := EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'firmalar' AND column_name = 'owner_id'
        );
    EXCEPTION WHEN OTHERS THEN
        has_owner := false;
    END;

    IF public.is_talebi_sahibi_mi(p_is_talebi_id, uid) THEN
        IF has_owner THEN
            SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.teklif_at DESC), '[]'::jsonb)
            INTO rows
            FROM (
                SELECT DISTINCT ON (karsi_uid)
                    karsi_uid AS user_id,
                    COALESCE(NULLIF(btrim(firma_adi), ''), 'Firma') AS ad,
                    firma_id,
                    teklif_id,
                    teklif_at
                FROM (
                    SELECT
                        COALESCE(f.user_id, f.owner_id) AS karsi_uid,
                        f.firma_adi,
                        f.id::text AS firma_id,
                        t.id::text AS teklif_id,
                        t.created_at AS teklif_at
                    FROM public.teklifler t
                    JOIN public.firmalar f ON f.id = t.firma_id
                    WHERE t.is_id::text = btrim(p_is_talebi_id)
                ) raw
                WHERE karsi_uid IS NOT NULL
                  AND karsi_uid <> uid
                ORDER BY karsi_uid, teklif_at DESC
            ) x;
        ELSE
            SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.teklif_at DESC), '[]'::jsonb)
            INTO rows
            FROM (
                SELECT DISTINCT ON (f.user_id)
                    f.user_id AS user_id,
                    COALESCE(NULLIF(btrim(f.firma_adi), ''), 'Firma') AS ad,
                    f.id::text AS firma_id,
                    t.id::text AS teklif_id,
                    t.created_at AS teklif_at
                FROM public.teklifler t
                JOIN public.firmalar f ON f.id = t.firma_id
                WHERE t.is_id::text = btrim(p_is_talebi_id)
                  AND f.user_id IS NOT NULL
                  AND f.user_id <> uid
                ORDER BY f.user_id, t.created_at DESC
            ) x;
        END IF;
    ELSE
        rows := jsonb_build_array(
            jsonb_build_object(
                'user_id', sahip_uid,
                'ad', 'İş veren',
                'firma_id', NULL,
                'teklif_id', NULL
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'is_talebi_id', btrim(p_is_talebi_id),
        'baslik', baslik,
        'karsilar', COALESCE(rows, '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mesaj_konusmalarim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.son_at DESC NULLS LAST), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            m.is_talebi_id::text AS is_talebi_id,
            CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END AS karsi_id,
            COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi') AS baslik,
            (
                SELECT mm.mesaj_metni
                FROM public.mesajlar mm
                WHERE mm.is_talebi_id = m.is_talebi_id
                  AND (
                      (mm.gonderen_id = uid AND mm.alici_id = CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END)
                      OR
                      (mm.alici_id = uid AND mm.gonderen_id = CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END)
                  )
                ORDER BY mm.created_at DESC
                LIMIT 1
            ) AS son_mesaj,
            (
                SELECT mm.created_at
                FROM public.mesajlar mm
                WHERE mm.is_talebi_id = m.is_talebi_id
                  AND (
                      (mm.gonderen_id = uid AND mm.alici_id = CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END)
                      OR
                      (mm.alici_id = uid AND mm.gonderen_id = CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END)
                  )
                ORDER BY mm.created_at DESC
                LIMIT 1
            ) AS son_at,
            (
                SELECT COUNT(*)::int
                FROM public.mesajlar mm
                WHERE mm.is_talebi_id = m.is_talebi_id
                  AND mm.alici_id = uid
                  AND mm.okundu_mu = FALSE
                  AND mm.gonderen_id = CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END
            ) AS okunmamis,
            CASE
                WHEN public.is_talebi_sahibi_mi(m.is_talebi_id::text, uid) THEN
                    COALESCE((
                        SELECT NULLIF(btrim(f.firma_adi), '')
                        FROM public.firmalar f
                        WHERE f.user_id = CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END
                        ORDER BY f.created_at DESC NULLS LAST
                        LIMIT 1
                    ), 'Firma')
                ELSE 'İş veren'
            END AS karsi_ad
        FROM public.mesajlar m
        JOIN public.is_talepleri i ON i.id = m.is_talebi_id
        WHERE m.gonderen_id = uid OR m.alici_id = uid
        GROUP BY
            m.is_talebi_id,
            CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END,
            i.baslik
    ) x;

    RETURN jsonb_build_object('ok', true, 'konusmalar', COALESCE(rows, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.mesaj_listele(
    p_is_talebi_id text,
    p_karsi_id uuid,
    p_limit int DEFAULT 80
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    lim int := LEAST(GREATEST(COALESCE(p_limit, 80), 1), 200);
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF NOT public.mesaj_cift_gecerli(p_is_talebi_id, uid, p_karsi_id) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at ASC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            m.id,
            m.is_talebi_id::text AS is_talebi_id,
            m.gonderen_id,
            m.alici_id,
            m.mesaj_metni,
            m.dosya_url,
            m.okundu_mu,
            m.created_at,
            (m.gonderen_id = uid) AS benim_mi
        FROM public.mesajlar m
        WHERE m.is_talebi_id::text = btrim(p_is_talebi_id)
          AND (
              (m.gonderen_id = uid AND m.alici_id = p_karsi_id)
              OR
              (m.gonderen_id = p_karsi_id AND m.alici_id = uid)
          )
        ORDER BY m.created_at ASC
        LIMIT lim
    ) x;

    RETURN jsonb_build_object('ok', true, 'mesajlar', COALESCE(rows, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.mesaj_gonder(
    p_is_talebi_id text,
    p_alici_id uuid,
    p_metin text DEFAULT NULL,
    p_dosya_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    metin text := NULLIF(btrim(COALESCE(p_metin, '')), '');
    yol text := NULLIF(btrim(COALESCE(p_dosya_path, '')), '');
    yeni_id uuid;
    is_id_val text := btrim(COALESCE(p_is_talebi_id, ''));
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF is_id_val = '' OR p_alici_id IS NULL THEN
        RAISE EXCEPTION 'parametre_eksik' USING ERRCODE = '22023';
    END IF;
    IF metin IS NULL AND yol IS NULL THEN
        RAISE EXCEPTION 'mesaj_bos' USING ERRCODE = '22023';
    END IF;
    IF metin IS NOT NULL AND char_length(metin) > 4000 THEN
        RAISE EXCEPTION 'mesaj_uzun' USING ERRCODE = '22023';
    END IF;
    IF NOT public.mesaj_cift_gecerli(is_id_val, uid, p_alici_id) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;
    IF yol IS NOT NULL AND position(uid::text || '/' || is_id_val || '/' IN yol) <> 1 THEN
        RAISE EXCEPTION 'dosya_yolu_gecersiz' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.mesajlar (is_talebi_id, gonderen_id, alici_id, mesaj_metni, dosya_url)
    SELECT i.id, uid, p_alici_id, metin, yol
    FROM public.is_talepleri i
    WHERE i.id::text = is_id_val
    RETURNING id INTO yeni_id;

    IF yeni_id IS NULL THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', yeni_id,
        'is_talebi_id', is_id_val,
        'gonderen_id', uid,
        'alici_id', p_alici_id,
        'mesaj_metni', metin,
        'dosya_url', yol,
        'okundu_mu', false,
        'created_at', NOW(),
        'benim_mi', true
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mesaj_okundu_isaretle(p_is_talebi_id text, p_karsi_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    n int := 0;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF NOT public.mesaj_cift_gecerli(p_is_talebi_id, uid, p_karsi_id) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    UPDATE public.mesajlar
    SET okundu_mu = TRUE
    WHERE is_talebi_id::text = btrim(p_is_talebi_id)
      AND alici_id = uid
      AND gonderen_id = p_karsi_id
      AND okundu_mu = FALSE;

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'adet', n);
END;
$$;

CREATE OR REPLACE FUNCTION public.mesaj_dosya_imzali_url(p_path text, p_saniye int DEFAULT 3600)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    yol text := NULLIF(btrim(COALESCE(p_path, '')), '');
    parts text[];
    is_id text;
    sure int := LEAST(GREATEST(COALESCE(p_saniye, 3600), 60), 86400);
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF yol IS NULL THEN
        RAISE EXCEPTION 'path_zorunlu' USING ERRCODE = '22023';
    END IF;

    parts := string_to_array(yol, '/');
    IF array_length(parts, 1) < 3 THEN
        RAISE EXCEPTION 'dosya_yolu_gecersiz' USING ERRCODE = '22023';
    END IF;
    is_id := parts[2];
    IF NOT public.mesaj_katilimci_mi(is_id, uid) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    /* İstemci createSignedUrl kullanır; bu RPC yalnızca yetki teyidi + path doğrular */
    RETURN jsonb_build_object(
        'ok', true,
        'bucket', 'mesaj-dosyalari',
        'path', yol,
        'expires_in', sure
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mesaj_karsi_liste(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesaj_konusmalarim() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesaj_listele(text, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesaj_gonder(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesaj_okundu_isaretle(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesaj_dosya_imzali_url(text, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mesaj_karsi_liste(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_konusmalarim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_listele(text, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_gonder(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_okundu_isaretle(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mesaj_dosya_imzali_url(text, int) TO authenticated;

-- ============================================================
-- 6. Realtime
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'mesajlar'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.mesajlar;
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[042] realtime yayını: %', SQLERRM;
END $$;

DO $$
BEGIN
    RAISE NOTICE '[042] İş talebi mesajlaşma kurulumu tamamlandı.';
END $$;

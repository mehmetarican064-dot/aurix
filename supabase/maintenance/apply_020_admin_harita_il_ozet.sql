-- ============================================================
-- AURIX 020 — Admin Genel Bakış: il bazlı detay özet
-- Idempotent. Yalnızca admin (is_admin).
--
-- Geri alma (rollback):
--   DROP FUNCTION IF EXISTS public.admin_harita_il_ozet(text);
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_harita_il_ozet(p_aralik text DEFAULT 'tum')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    aralik text := lower(btrim(COALESCE(p_aralik, 'tum')));
    since_ts timestamptz := NULL;
    satirlar jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF aralik NOT IN ('7g', '30g', 'tum') THEN
        aralik := 'tum';
    END IF;

    IF aralik = '7g' THEN
        since_ts := NOW() - INTERVAL '7 days';
    ELSIF aralik = '30g' THEN
        since_ts := NOW() - INTERVAL '30 days';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sehir), '[]'::jsonb)
    INTO satirlar
    FROM (
        WITH sehirler AS (
            SELECT DISTINCT btrim(COALESCE(f.sehir, '')) AS sehir
            FROM public.firmalar f
            WHERE btrim(COALESCE(f.sehir, '')) <> ''
              AND (since_ts IS NULL OR f.created_at >= since_ts)
            UNION
            SELECT DISTINCT btrim(COALESCE(i.sehir, '')) AS sehir
            FROM public.is_talepleri i
            WHERE btrim(COALESCE(i.sehir, '')) <> ''
              AND (since_ts IS NULL OR i.created_at >= since_ts)
        )
        SELECT
            s.sehir,
            (
                SELECT COUNT(*)::int
                FROM public.profiles p
                WHERE (since_ts IS NULL OR p.created_at >= since_ts)
                  AND (
                      SELECT btrim(COALESCE(f.sehir, ''))
                      FROM public.firmalar f
                      WHERE f.user_id = p.id
                        AND btrim(COALESCE(f.sehir, '')) <> ''
                      ORDER BY f.created_at DESC NULLS LAST
                      LIMIT 1
                  ) = s.sehir
            ) AS kullanici,
            (
                SELECT COUNT(*)::int
                FROM public.firmalar f
                WHERE btrim(COALESCE(f.sehir, '')) = s.sehir
                  AND (since_ts IS NULL OR f.created_at >= since_ts)
            ) AS firma,
            (
                SELECT COUNT(*)::int
                FROM public.is_talepleri i
                WHERE btrim(COALESCE(i.sehir, '')) = s.sehir
                  AND (since_ts IS NULL OR i.created_at >= since_ts)
            ) AS is_adet,
            (
                SELECT COUNT(*)::int
                FROM public.teklifler t
                JOIN public.is_talepleri i ON i.id = t.is_id
                WHERE btrim(COALESCE(i.sehir, '')) = s.sehir
                  AND (since_ts IS NULL OR t.created_at >= since_ts)
            ) AS teklif,
            (
                SELECT COUNT(*)::int
                FROM public.firmalar f
                WHERE btrim(COALESCE(f.sehir, '')) = s.sehir
                  AND f.durum = 'onaylandi'
                  AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                  AND (since_ts IS NULL OR f.created_at >= since_ts)
            ) AS onayli_firma,
            (
                SELECT COUNT(*)::int
                FROM public.firmalar f
                WHERE btrim(COALESCE(f.sehir, '')) = s.sehir
                  AND f.durum = 'beklemede'
                  AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                  AND (since_ts IS NULL OR f.created_at >= since_ts)
            ) AS bekleyen_firma,
            (
                SELECT COALESCE(NULLIF(btrim(i.kategori), ''), NULL)
                FROM public.is_talepleri i
                WHERE btrim(COALESCE(i.sehir, '')) = s.sehir
                  AND (since_ts IS NULL OR i.created_at >= since_ts)
                GROUP BY COALESCE(NULLIF(btrim(i.kategori), ''), '')
                ORDER BY COUNT(*) DESC, COALESCE(NULLIF(btrim(i.kategori), ''), '') ASC
                LIMIT 1
            ) AS aktif_kategori,
            (
                SELECT MAX(ts)
                FROM (
                    SELECT MAX(f.created_at) AS ts
                    FROM public.firmalar f
                    WHERE btrim(COALESCE(f.sehir, '')) = s.sehir
                      AND (since_ts IS NULL OR f.created_at >= since_ts)
                    UNION ALL
                    SELECT MAX(i.created_at) AS ts
                    FROM public.is_talepleri i
                    WHERE btrim(COALESCE(i.sehir, '')) = s.sehir
                      AND (since_ts IS NULL OR i.created_at >= since_ts)
                    UNION ALL
                    SELECT MAX(t.created_at) AS ts
                    FROM public.teklifler t
                    JOIN public.is_talepleri i ON i.id = t.is_id
                    WHERE btrim(COALESCE(i.sehir, '')) = s.sehir
                      AND (since_ts IS NULL OR t.created_at >= since_ts)
                    UNION ALL
                    SELECT MAX(p.created_at) AS ts
                    FROM public.profiles p
                    WHERE (since_ts IS NULL OR p.created_at >= since_ts)
                      AND (
                          SELECT btrim(COALESCE(f.sehir, ''))
                          FROM public.firmalar f
                          WHERE f.user_id = p.id
                            AND btrim(COALESCE(f.sehir, '')) <> ''
                          ORDER BY f.created_at DESC NULLS LAST
                          LIMIT 1
                      ) = s.sehir
                ) z
            ) AS son_kayit
        FROM sehirler s
        WHERE s.sehir <> ''
    ) x;

    RETURN jsonb_build_object(
        'aralik', aralik,
        'satirlar', COALESCE(satirlar, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_harita_il_ozet(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_harita_il_ozet(text) TO authenticated;

COMMENT ON FUNCTION public.admin_harita_il_ozet(text) IS
    'Admin harita il detay ozeti (kullanici/firma/is/teklif/onay/kategori/son_kayit). Yalniz is_admin.';

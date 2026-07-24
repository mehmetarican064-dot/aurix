-- ============================================================
-- AURIX 019 — Admin Genel Bakış: harita dağılımı + analitik
-- Idempotent. Yalnızca admin (is_admin) erişimi.
--
-- Geri alma (rollback):
--   DROP FUNCTION IF EXISTS public.admin_harita_dagilim(text);
--   DROP FUNCTION IF EXISTS public.admin_analitik_ozet(text);
--   -- admin_son_kayitlar için 013 sürümüne dönmek isterseniz
--   -- apply_013_admin_panel.sql içindeki tanımı yeniden çalıştırın.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Harita: ham şehir + adet (normalizasyon istemcide)
--    p_aralik: '7g' | '30g' | 'tum'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_harita_dagilim(p_aralik text DEFAULT 'tum')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    aralik text := lower(btrim(COALESCE(p_aralik, 'tum')));
    since_ts timestamptz := NULL;
    firma_rows jsonb;
    is_rows jsonb;
    kul_rows jsonb;
    firma_bos int;
    is_bos int;
    kul_bos int;
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

    /* Firmalar */
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sehir', x.sehir,
        'adet', x.adet
    ) ORDER BY x.adet DESC, x.sehir), '[]'::jsonb)
    INTO firma_rows
    FROM (
        SELECT btrim(COALESCE(f.sehir, '')) AS sehir, COUNT(*)::int AS adet
        FROM public.firmalar f
        WHERE (since_ts IS NULL OR f.created_at >= since_ts)
          AND btrim(COALESCE(f.sehir, '')) <> ''
        GROUP BY 1
    ) x;

    SELECT COUNT(*)::int INTO firma_bos
    FROM public.firmalar f
    WHERE (since_ts IS NULL OR f.created_at >= since_ts)
      AND btrim(COALESCE(f.sehir, '')) = '';

    /* İş talepleri */
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sehir', x.sehir,
        'adet', x.adet
    ) ORDER BY x.adet DESC, x.sehir), '[]'::jsonb)
    INTO is_rows
    FROM (
        SELECT btrim(COALESCE(i.sehir, '')) AS sehir, COUNT(*)::int AS adet
        FROM public.is_talepleri i
        WHERE (since_ts IS NULL OR i.created_at >= since_ts)
          AND btrim(COALESCE(i.sehir, '')) <> ''
        GROUP BY 1
    ) x;

    SELECT COUNT(*)::int INTO is_bos
    FROM public.is_talepleri i
    WHERE (since_ts IS NULL OR i.created_at >= since_ts)
      AND btrim(COALESCE(i.sehir, '')) = '';

    /* Kullanıcılar: profil + (varsa) en son firma şehri */
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sehir', x.sehir,
        'adet', x.adet
    ) ORDER BY x.adet DESC, x.sehir), '[]'::jsonb)
    INTO kul_rows
    FROM (
        SELECT btrim(COALESCE(t.sehir, '')) AS sehir, COUNT(*)::int AS adet
        FROM (
            SELECT p.id,
                   (
                       SELECT f.sehir
                       FROM public.firmalar f
                       WHERE f.user_id = p.id
                         AND btrim(COALESCE(f.sehir, '')) <> ''
                       ORDER BY f.created_at DESC NULLS LAST
                       LIMIT 1
                   ) AS sehir
            FROM public.profiles p
            WHERE (since_ts IS NULL OR p.created_at >= since_ts)
        ) t
        WHERE btrim(COALESCE(t.sehir, '')) <> ''
        GROUP BY 1
    ) x;

    SELECT COUNT(*)::int INTO kul_bos
    FROM (
        SELECT p.id,
               (
                   SELECT f.sehir
                   FROM public.firmalar f
                   WHERE f.user_id = p.id
                     AND btrim(COALESCE(f.sehir, '')) <> ''
                   ORDER BY f.created_at DESC NULLS LAST
                   LIMIT 1
               ) AS sehir
        FROM public.profiles p
        WHERE (since_ts IS NULL OR p.created_at >= since_ts)
    ) t
    WHERE btrim(COALESCE(t.sehir, '')) = '';

    RETURN jsonb_build_object(
        'aralik', aralik,
        'firma', COALESCE(firma_rows, '[]'::jsonb),
        'is', COALESCE(is_rows, '[]'::jsonb),
        'kullanici', COALESCE(kul_rows, '[]'::jsonb),
        'bos', jsonb_build_object(
            'firma', COALESCE(firma_bos, 0),
            'is', COALESCE(is_bos, 0),
            'kullanici', COALESCE(kul_bos, 0)
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_harita_dagilim(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_harita_dagilim(text) TO authenticated;

COMMENT ON FUNCTION public.admin_harita_dagilim(text) IS
    'Admin Genel Bakış harita dağılımı (firma/iş/kullanıcı × şehir). Yalnız is_admin.';

-- ------------------------------------------------------------
-- 2) Analitik: günlük trend + kategori / firma durum
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analitik_ozet(p_aralik text DEFAULT '30g')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    aralik text := lower(btrim(COALESCE(p_aralik, '30g')));
    since_ts timestamptz;
    gunluk jsonb;
    kat jsonb;
    durum jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF aralik = '7g' THEN
        since_ts := NOW() - INTERVAL '7 days';
    ELSIF aralik = 'tum' THEN
        since_ts := NOW() - INTERVAL '365 days';
    ELSE
        aralik := '30g';
        since_ts := NOW() - INTERVAL '30 days';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'gun', to_char(d.gun, 'YYYY-MM-DD'),
        'kullanici', d.kullanici,
        'firma', d.firma,
        'is', d.is_adet
    ) ORDER BY d.gun), '[]'::jsonb)
    INTO gunluk
    FROM (
        SELECT
            gs.gun::date AS gun,
            (
                SELECT COUNT(*)::int FROM public.profiles p
                WHERE p.created_at::date = gs.gun::date
            ) AS kullanici,
            (
                SELECT COUNT(*)::int FROM public.firmalar f
                WHERE f.created_at::date = gs.gun::date
            ) AS firma,
            (
                SELECT COUNT(*)::int FROM public.is_talepleri i
                WHERE i.created_at::date = gs.gun::date
            ) AS is_adet
        FROM generate_series(since_ts::date, CURRENT_DATE, INTERVAL '1 day') AS gs(gun)
    ) d;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'kategori', x.kategori,
        'adet', x.adet
    ) ORDER BY x.adet DESC), '[]'::jsonb)
    INTO kat
    FROM (
        SELECT COALESCE(NULLIF(btrim(i.kategori), ''), 'Belirtilmemiş') AS kategori,
               COUNT(*)::int AS adet
        FROM public.is_talepleri i
        WHERE i.created_at >= since_ts
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 8
    ) x;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'durum', x.durum,
        'adet', x.adet
    ) ORDER BY x.adet DESC), '[]'::jsonb)
    INTO durum
    FROM (
        SELECT COALESCE(NULLIF(btrim(f.durum), ''), 'bilinmiyor') AS durum,
               COUNT(*)::int AS adet
        FROM public.firmalar f
        WHERE f.created_at >= since_ts
        GROUP BY 1
    ) x;

    RETURN jsonb_build_object(
        'aralik', aralik,
        'gunluk', COALESCE(gunluk, '[]'::jsonb),
        'kategori_is', COALESCE(kat, '[]'::jsonb),
        'firma_durum', COALESCE(durum, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analitik_ozet(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analitik_ozet(text) TO authenticated;

COMMENT ON FUNCTION public.admin_analitik_ozet(text) IS
    'Admin Genel Bakış analitik özet (günlük trend, kategori, firma durum). Yalnız is_admin.';

-- ------------------------------------------------------------
-- 3) admin_son_kayitlar: sıralı agg + güvenli join (liste/KPI tutarlılığı)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_son_kayitlar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'kullanicilar', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', x.id,
                        'ad_soyad', x.ad_soyad,
                        'hesap_tipi', x.hesap_tipi,
                        'created_at', x.created_at,
                        'email', x.email
                    )
                    ORDER BY x.created_at DESC
                ),
                '[]'::jsonb
            )
            FROM (
                SELECT p.id, p.ad_soyad, p.hesap_tipi, p.created_at, u.email
                FROM public.profiles p
                LEFT JOIN auth.users u ON u.id = p.id
                ORDER BY p.created_at DESC NULLS LAST
                LIMIT 8
            ) x
        ),
        'bekleyen_firmalar', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', x.id,
                        'firma_adi', x.firma_adi,
                        'sehir', x.sehir,
                        'kategori', x.kategori,
                        'created_at', x.created_at,
                        'yetkili_ad', x.yetkili_ad
                    )
                    ORDER BY x.created_at DESC
                ),
                '[]'::jsonb
            )
            FROM (
                SELECT f.id, f.firma_adi, f.sehir, f.kategori, f.created_at,
                       p.ad_soyad AS yetkili_ad
                FROM public.firmalar f
                LEFT JOIN public.profiles p ON p.id = f.user_id
                WHERE f.durum = 'beklemede'
                  AND COALESCE(f.askiya_alindi, FALSE) IS FALSE
                ORDER BY f.created_at DESC NULLS LAST
                LIMIT 8
            ) x
        ),
        'isler', (
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'id', x.id,
                        'baslik', x.baslik,
                        'kategori', x.kategori,
                        'durum', x.durum,
                        'created_at', x.created_at,
                        'olusturan_ad', x.olusturan_ad
                    )
                    ORDER BY x.created_at DESC
                ),
                '[]'::jsonb
            )
            FROM (
                SELECT i.id, i.baslik, i.kategori, i.durum, i.created_at,
                       p.ad_soyad AS olusturan_ad
                FROM public.is_talepleri i
                LEFT JOIN public.profiles p ON p.id = i.owner_id
                ORDER BY i.created_at DESC NULLS LAST
                LIMIT 8
            ) x
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_son_kayitlar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_son_kayitlar() TO authenticated;

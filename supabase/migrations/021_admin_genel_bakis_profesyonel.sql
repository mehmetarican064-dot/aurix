-- ============================================================
-- AURIX 021 — Admin Genel Bakış profesyonelleştirme
-- Idempotent. Yalnızca admin (is_admin).
--
-- - admin_is_listesi / admin_son_kayitlar: prod’da olmayan owner_id güvenli
-- - admin_ozet: 7g / önceki 7g trend alanları
-- - admin_kullanici_listesi: firma_sehir (filtre için)
-- - admin_aktiviteler: birleşik aktivite akışı
--
-- Geri alma (rollback):
--   DROP FUNCTION IF EXISTS public.admin_aktiviteler(integer);
--   -- diğerleri önceki migration sürümleriyle REPLACE edilmeli
-- ============================================================

-- ------------------------------------------------------------
-- 1) İş listesi — owner_id / user_id yoksa NULL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_is_listesi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
    owner_expr text;
    join_expr text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF public._aurix_col_exists('is_talepleri', 'owner_id') THEN
        owner_expr := 'i.owner_id';
        join_expr := 'LEFT JOIN public.profiles p ON p.id = i.owner_id';
    ELSIF public._aurix_col_exists('is_talepleri', 'user_id') THEN
        owner_expr := 'i.user_id';
        join_expr := 'LEFT JOIN public.profiles p ON p.id = i.user_id';
    ELSE
        owner_expr := 'NULL::uuid';
        join_expr := 'LEFT JOIN public.profiles p ON FALSE';
    END IF;

    EXECUTE format(
        $q$
        SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                i.id, i.baslik, i.kategori, i.sehir, i.durum, i.created_at,
                COALESCE(i.moderasyon_durumu, 'aktif') AS moderasyon_durumu,
                i.moderasyon_notu,
                %s AS owner_id,
                p.ad_soyad AS olusturan_ad,
                (SELECT COUNT(*)::int FROM public.teklifler t WHERE t.is_id = i.id) AS teklif_sayisi
            FROM public.is_talepleri i
            %s
        ) x
        $q$,
        owner_expr,
        join_expr
    ) INTO rows;

    RETURN COALESCE(rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_is_listesi() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_is_listesi() TO authenticated;

-- ------------------------------------------------------------
-- 2) Son kayıtlar — aynı sahiplik güvenliği
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_son_kayitlar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    r jsonb;
    owner_join text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF public._aurix_col_exists('is_talepleri', 'owner_id') THEN
        owner_join := 'LEFT JOIN public.profiles p ON p.id = i.owner_id';
    ELSIF public._aurix_col_exists('is_talepleri', 'user_id') THEN
        owner_join := 'LEFT JOIN public.profiles p ON p.id = i.user_id';
    ELSE
        owner_join := 'LEFT JOIN public.profiles p ON FALSE';
    END IF;

    EXECUTE format(
        $q$
        SELECT jsonb_build_object(
            'kullanicilar', (
                SELECT COALESCE(
                    jsonb_agg(
                        jsonb_build_object(
                            'id', x.id,
                            'ad_soyad', x.ad_soyad,
                            'email', x.email,
                            'hesap_tipi', x.hesap_tipi,
                            'created_at', x.created_at
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
                    %s
                    ORDER BY i.created_at DESC NULLS LAST
                    LIMIT 8
                ) x
            )
        )
        $q$,
        owner_join
    ) INTO r;

    RETURN COALESCE(r, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_son_kayitlar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_son_kayitlar() TO authenticated;

-- ------------------------------------------------------------
-- 3) Özet + 7g / önceki 7g trend alanları
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ozet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    r jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'toplam_kullanici', (SELECT COUNT(*)::int FROM public.profiles),
        'toplam_firma', (SELECT COUNT(*)::int FROM public.firmalar),
        'bekleyen_firma', (SELECT COUNT(*)::int FROM public.firmalar WHERE durum = 'beklemede'),
        'onayli_firma', (
            SELECT COUNT(*)::int FROM public.firmalar
            WHERE durum = 'onaylandi' AND COALESCE(askiya_alindi, FALSE) IS FALSE
        ),
        'acik_is', (
            SELECT COUNT(*)::int FROM public.is_talepleri
            WHERE durum = 'Acik' AND COALESCE(moderasyon_durumu, 'aktif') = 'aktif'
        ),
        'toplam_teklif', (SELECT COUNT(*)::int FROM public.teklifler),
        'kullanici_7g', (
            SELECT COUNT(*)::int FROM public.profiles
            WHERE created_at >= NOW() - INTERVAL '7 days'
        ),
        'kullanici_onceki_7g', (
            SELECT COUNT(*)::int FROM public.profiles
            WHERE created_at >= NOW() - INTERVAL '14 days'
              AND created_at < NOW() - INTERVAL '7 days'
        ),
        'firma_7g', (
            SELECT COUNT(*)::int FROM public.firmalar
            WHERE created_at >= NOW() - INTERVAL '7 days'
        ),
        'firma_onceki_7g', (
            SELECT COUNT(*)::int FROM public.firmalar
            WHERE created_at >= NOW() - INTERVAL '14 days'
              AND created_at < NOW() - INTERVAL '7 days'
        ),
        'is_7g', (
            SELECT COUNT(*)::int FROM public.is_talepleri
            WHERE created_at >= NOW() - INTERVAL '7 days'
        ),
        'is_onceki_7g', (
            SELECT COUNT(*)::int FROM public.is_talepleri
            WHERE created_at >= NOW() - INTERVAL '14 days'
              AND created_at < NOW() - INTERVAL '7 days'
        ),
        'teklif_7g', (
            SELECT COUNT(*)::int FROM public.teklifler
            WHERE created_at >= NOW() - INTERVAL '7 days'
        ),
        'teklif_onceki_7g', (
            SELECT COUNT(*)::int FROM public.teklifler
            WHERE created_at >= NOW() - INTERVAL '14 days'
              AND created_at < NOW() - INTERVAL '7 days'
        )
    ) INTO r;

    RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ozet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ozet() TO authenticated;

-- ------------------------------------------------------------
-- 4) Kullanıcı listesi — firma_sehir (şehir filtresi)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_kullanici_listesi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            p.id,
            p.ad_soyad,
            p.telefon,
            p.role,
            p.hesap_tipi,
            p.created_at,
            COALESCE(p.askiya_alindi, FALSE) AS askiya_alindi,
            p.askiya_alma_nedeni,
            u.email,
            u.email_confirmed_at,
            u.last_sign_in_at,
            EXISTS (
                SELECT 1 FROM public.firmalar f WHERE f.user_id = p.id
            ) AS firma_var,
            (
                SELECT btrim(COALESCE(f.sehir, ''))
                FROM public.firmalar f
                WHERE f.user_id = p.id
                  AND btrim(COALESCE(f.sehir, '')) <> ''
                ORDER BY f.created_at DESC NULLS LAST
                LIMIT 1
            ) AS firma_sehir
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.id
    ) x;

    RETURN COALESCE(rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_kullanici_listesi() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_kullanici_listesi() TO authenticated;

-- ------------------------------------------------------------
-- 5) Birleşik son aktiviteler
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_aktiviteler(p_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    lim integer := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);
    rows jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.ts DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT * FROM (
            SELECT
                'yeni_kullanici'::text AS tip,
                'Yeni kullanıcı kaydı'::text AS islem,
                COALESCE(NULLIF(btrim(p.ad_soyad), ''), u.email, 'Kullanıcı') AS ilgili,
                p.id::text AS ilgili_id,
                p.created_at AS ts,
                NULL::text AS admin_ad
            FROM public.profiles p
            LEFT JOIN auth.users u ON u.id = p.id

            UNION ALL

            SELECT
                'yeni_firma',
                'Yeni firma başvurusu',
                COALESCE(NULLIF(btrim(f.firma_adi), ''), 'Firma'),
                f.id::text,
                f.created_at,
                NULL::text
            FROM public.firmalar f

            UNION ALL

            SELECT
                'is_talebi',
                'İş talebi oluşturuldu',
                COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi'),
                i.id::text,
                i.created_at,
                NULL::text
            FROM public.is_talepleri i

            UNION ALL

            SELECT
                'teklif',
                'Teklif verildi',
                COALESCE(NULLIF(btrim(f.firma_adi), ''), NULLIF(btrim(i.baslik), ''), 'Teklif'),
                t.id::text,
                t.created_at,
                NULL::text
            FROM public.teklifler t
            LEFT JOIN public.firmalar f ON f.id = t.firma_id
            LEFT JOIN public.is_talepleri i ON i.id = t.is_id

            UNION ALL

            SELECT
                k.islem_tipi,
                CASE k.islem_tipi
                    WHEN 'firma_onayla' THEN 'Firma onaylandı'
                    WHEN 'firma_reddet' THEN 'Firma reddedildi'
                    WHEN 'firma_askiya_al' THEN 'Firma askıya alındı'
                    WHEN 'firma_aski_kaldir' THEN 'Firma askısı kaldırıldı'
                    WHEN 'kullanici_askiya_al' THEN 'Kullanıcı askıya alındı'
                    WHEN 'kullanici_aski_kaldir' THEN 'Kullanıcı aktifleştirildi'
                    WHEN 'is_moderasyon' THEN 'İş talebi moderasyonu'
                    WHEN 'teklif_gizle' THEN 'Teklif gizlendi'
                    WHEN 'teklif_ac' THEN 'Teklif açıldı'
                    ELSE 'Admin işlemi'
                END,
                COALESCE(
                    NULLIF(btrim(k.aciklama), ''),
                    NULLIF(btrim(k.hedef_turu), ''),
                    k.islem_tipi
                ),
                COALESCE(k.hedef_id::text, k.id::text),
                k.created_at,
                ap.ad_soyad
            FROM public.admin_islem_kayitlari k
            LEFT JOIN public.profiles ap ON ap.id = k.admin_id
        ) e
        ORDER BY e.ts DESC NULLS LAST
        LIMIT lim
    ) x;

    RETURN COALESCE(rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_aktiviteler(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_aktiviteler(integer) TO authenticated;

COMMENT ON FUNCTION public.admin_aktiviteler(integer) IS
    'Admin Genel Bakış birleşik aktivite akışı. Yalnız is_admin.';

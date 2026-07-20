-- AURIX — 010 hızlı uygulama (Dashboard SQL Editor)
-- Production uyumlu: is_seed / owner_id yoksa referans verilmez.
-- Kaynak: supabase/migrations/010_profiles_hesap_tipi_firma_medya.sql

-- ============================================================
-- 0. Yardımcı: sütun var mı?
-- ============================================================
CREATE OR REPLACE FUNCTION public._aurix_col_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = p_table
          AND column_name = p_column
    );
$$;

-- ============================================================
-- 1. profiles.hesap_tipi — varsayılan: normal kullanıcı
-- ============================================================
DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION
            'public.profiles tablosu yok. Önce auth/profiles migrasyonunu uygulayın.';
    END IF;
END $$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS hesap_tipi TEXT NOT NULL DEFAULT 'normal';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_hesap_tipi_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_hesap_tipi_check
            CHECK (hesap_tipi IN ('normal', 'firma'));
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.hesap_tipi IS
    'normal = standart kullanıcı; firma = firma hesabı oluşturulmuş. Kayıtta her zaman normal.';

DO $$
BEGIN
    BEGIN
        GRANT SELECT (hesap_tipi) ON TABLE public.profiles TO authenticated;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- ============================================================
-- 2. firmalar medya alanları (logo + çalışma görselleri)
-- ============================================================
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS calisma_gorselleri JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.firmalar.logo_url IS 'Firma logo URL (Storage veya harici)';
COMMENT ON COLUMN public.firmalar.calisma_gorselleri IS 'Çalışma görseli URL listesi (JSONB dizi)';

DO $$
DECLARE
    wanted text[] := ARRAY[
        'id', 'firma_adi', 'sehir', 'kategori', 'aciklama',
        'dogrulanmis', 'durum', 'created_at', 'user_id',
        'logo_url', 'calisma_gorselleri'
    ];
    cols text[];
    grant_list text := '';
    col text;
BEGIN
    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (wanted);

    IF cols IS NULL OR array_length(cols, 1) IS NULL THEN
        RETURN;
    END IF;

    FOREACH col IN ARRAY cols LOOP
        IF grant_list <> '' THEN
            grant_list := grant_list || ', ';
        END IF;
        grant_list := grant_list || quote_ident(col);
    END LOOP;

    BEGIN
        EXECUTE format(
            'GRANT SELECT (%s) ON TABLE public.firmalar TO authenticated',
            grant_list
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- ============================================================
-- 3. Firma oluşturulunca profil → firma hesabı
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_profil_hesap_tipi_firma()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET hesap_tipi = 'firma'
        WHERE id = NEW.user_id
          AND COALESCE(hesap_tipi, 'normal') <> 'firma';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firmalar_sync_hesap_tipi ON public.firmalar;
CREATE TRIGGER trg_firmalar_sync_hesap_tipi
    AFTER INSERT ON public.firmalar
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profil_hesap_tipi_firma();

DO $$
BEGIN
    IF public._aurix_col_exists('firmalar', 'user_id') THEN
        UPDATE public.profiles p
        SET hesap_tipi = 'firma'
        WHERE COALESCE(p.hesap_tipi, 'normal') = 'normal'
          AND EXISTS (
              SELECT 1
              FROM public.firmalar f
              WHERE f.user_id = p.id
          );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, ad_soyad, telefon, rol, hesap_tipi)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'ad_soyad', NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'telefon', NULL),
        'kullanici',
        'normal'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Storage bucket (logo / görseller) — opsiyonel
-- ============================================================
DO $$
BEGIN
    IF to_regclass('storage.buckets') IS NULL THEN
        RAISE NOTICE 'storage.buckets yok; medya bucket atlandı.';
        RETURN;
    END IF;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'firma-medya',
        'firma-medya',
        true,
        5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    )
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage bucket oluşturulamadı: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RETURN;
    END IF;

    DROP POLICY IF EXISTS "firma_medya_public_read" ON storage.objects;
    CREATE POLICY "firma_medya_public_read"
        ON storage.objects
        FOR SELECT
        TO anon, authenticated
        USING (bucket_id = 'firma-medya');

    DROP POLICY IF EXISTS "firma_medya_auth_upload" ON storage.objects;
    CREATE POLICY "firma_medya_auth_upload"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'firma-medya'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );

    DROP POLICY IF EXISTS "firma_medya_auth_update_own" ON storage.objects;
    CREATE POLICY "firma_medya_auth_update_own"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
            bucket_id = 'firma-medya'
            AND (storage.foldername(name))[1] = auth.uid()::text
        )
        WITH CHECK (
            bucket_id = 'firma-medya'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );

    DROP POLICY IF EXISTS "firma_medya_auth_delete_own" ON storage.objects;
    CREATE POLICY "firma_medya_auth_delete_own"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'firma-medya'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage policy atlandı: %', SQLERRM;
END $$;

-- ============================================================
-- 5. Teklif INSERT — dinamik (is_seed / owner_id yoksa eklenmez)
-- ============================================================
DO $$
DECLARE
    has_teklifler boolean;
    has_fiyat boolean;
    has_termin boolean;
    has_user_id boolean;
    has_owner_id boolean;
    has_firma_is_seed boolean;
    has_is_is_seed boolean;
    has_dogrulanmis boolean;
    has_durum boolean;
    firma_ok text;
    is_ok text;
    check_expr text;
BEGIN
    has_teklifler := to_regclass('public.teklifler') IS NOT NULL;
    IF NOT has_teklifler THEN
        RAISE NOTICE 'public.teklifler yok; teklif policy atlandı.';
        RETURN;
    END IF;

    has_fiyat := public._aurix_col_exists('teklifler', 'fiyat');
    has_termin := public._aurix_col_exists('teklifler', 'termin_gun');
    has_user_id := public._aurix_col_exists('firmalar', 'user_id');
    has_owner_id := public._aurix_col_exists('firmalar', 'owner_id');
    has_firma_is_seed := public._aurix_col_exists('firmalar', 'is_seed');
    has_is_is_seed := public._aurix_col_exists('is_talepleri', 'is_seed');
    has_dogrulanmis := public._aurix_col_exists('firmalar', 'dogrulanmis');
    has_durum := public._aurix_col_exists('firmalar', 'durum');

    IF NOT has_fiyat OR NOT has_termin THEN
        RAISE NOTICE 'teklifler.fiyat / termin_gun eksik; teklif policy atlandı.';
        RETURN;
    END IF;

    IF NOT has_user_id AND NOT has_owner_id THEN
        RAISE NOTICE 'firmalar.user_id ve owner_id yok; teklif policy atlandı.';
        RETURN;
    END IF;

    IF has_user_id AND has_owner_id THEN
        firma_ok := '(f.user_id = auth.uid() OR f.owner_id = auth.uid())';
    ELSIF has_user_id THEN
        firma_ok := 'f.user_id = auth.uid()';
    ELSE
        firma_ok := 'f.owner_id = auth.uid()';
    END IF;

    IF has_dogrulanmis THEN
        firma_ok := firma_ok || ' AND f.dogrulanmis IS TRUE';
    END IF;
    IF has_durum THEN
        firma_ok := firma_ok || ' AND f.durum = ''onaylandi''';
    END IF;
    IF has_firma_is_seed THEN
        firma_ok := firma_ok || ' AND COALESCE(f.is_seed, FALSE) IS FALSE';
    END IF;

    is_ok := 'i.durum = ''Acik''';
    IF has_is_is_seed THEN
        is_ok := is_ok || ' AND COALESCE(i.is_seed, FALSE) IS FALSE';
    END IF;

    check_expr := format(
        'fiyat > 0 AND termin_gun > 0
         AND EXISTS (
             SELECT 1 FROM public.firmalar f
             WHERE f.id = firma_id AND %s
         )
         AND EXISTS (
             SELECT 1 FROM public.is_talepleri i
             WHERE i.id = is_id AND %s
         )',
        firma_ok,
        is_ok
    );

    DROP POLICY IF EXISTS "teklifler_auth_insert_owner" ON public.teklifler;

    EXECUTE format(
        'CREATE POLICY "teklifler_auth_insert_owner"
            ON public.teklifler
            FOR INSERT
            TO authenticated
            WITH CHECK (%s)',
        check_expr
    );

    RAISE NOTICE 'teklifler_auth_insert_owner oluşturuldu (user_id=%, owner_id=%, firma.is_seed=%, is_talepleri.is_seed=%)',
        has_user_id, has_owner_id, has_firma_is_seed, has_is_is_seed;
END $$;

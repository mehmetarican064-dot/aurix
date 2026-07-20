-- AURIX 011 — Auth ↔ profiles senkron (production uyumlu)
-- ensure_own_profile: giriş sonrası eksik profili güvenli şekilde oluşturur.
-- Supabase SQL Editor’de bir kez çalıştırın (idempotent).

DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'public.profiles yok. Önce profiles migrasyonunu uygulayın.';
    END IF;
END $$;

-- hesap_tipi yoksa ekle (010 uygulanmamış olabilir)
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

-- Yeni kullanıcı profili (hesap_tipi dahil)
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
        COALESCE(
            NEW.raw_user_meta_data->>'ad_soyad',
            NEW.raw_user_meta_data->>'full_name',
            ''
        ),
        COALESCE(NEW.raw_user_meta_data->>'telefon', NULL),
        'kullanici',
        'normal'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_profile();

-- Oturum açmış kullanıcının kendi profilini garanti et
CREATE OR REPLACE FUNCTION public.ensure_own_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    meta jsonb;
    sonuc public.profiles;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT raw_user_meta_data INTO meta
    FROM auth.users
    WHERE id = uid;

    INSERT INTO public.profiles (id, ad_soyad, telefon, rol, hesap_tipi)
    VALUES (
        uid,
        COALESCE(meta->>'ad_soyad', meta->>'full_name', ''),
        COALESCE(meta->>'telefon', NULL),
        'kullanici',
        'normal'
    )
    ON CONFLICT (id) DO UPDATE
        SET ad_soyad = CASE
                WHEN public.profiles.ad_soyad IS NULL
                  OR btrim(public.profiles.ad_soyad) = ''
                THEN EXCLUDED.ad_soyad
                ELSE public.profiles.ad_soyad
            END,
            telefon = COALESCE(public.profiles.telefon, EXCLUDED.telefon)
    RETURNING * INTO sonuc;

    RETURN sonuc;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_own_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_own_profile() TO authenticated;

COMMENT ON FUNCTION public.ensure_own_profile() IS
    'Auth oturumu olan kullanıcının profiles satırını oluşturur / senkronlar. Client INSERT yok.';

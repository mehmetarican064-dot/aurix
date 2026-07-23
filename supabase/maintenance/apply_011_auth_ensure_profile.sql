-- AURIX — 011 hızlı uygulama (Dashboard SQL Editor)
-- Kaynak: supabase/migrations/011_auth_ensure_profile.sql
-- profiles.role ('user'|'admin') — eski rol kolonu kullanılmaz.

DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'public.profiles yok. Önce profiles migrasyonunu uygulayın.';
    END IF;
END $$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS hesap_tipi TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE public.profiles
SET role = CASE
    WHEN lower(btrim(COALESCE(role::text, ''))) = 'admin' THEN 'admin'
    ELSE 'user'
END;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_rol_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_rol_check;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_role_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_role_check
            CHECK (role IN ('user', 'admin'));
    END IF;
END $$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS rol;

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

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, ad_soyad, telefon, role, hesap_tipi)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'ad_soyad',
            NEW.raw_user_meta_data->>'full_name',
            ''
        ),
        COALESCE(NEW.raw_user_meta_data->>'telefon', NULL),
        'user',
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

    INSERT INTO public.profiles (id, ad_soyad, telefon, role, hesap_tipi)
    VALUES (
        uid,
        COALESCE(meta->>'ad_soyad', meta->>'full_name', ''),
        COALESCE(meta->>'telefon', NULL),
        'user',
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

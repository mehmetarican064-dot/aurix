-- AURIX 007 — Auth profiles, owner_id, is_seed, RLS (idempotent / güvenlik sertleştirilmiş)
-- Supabase SQL Editor’de çalıştırın. İkinci kez güvenle çalıştırılabilir.
-- Bu dosyayı çalıştırmadan önce 001–006 uygulanmış olmalıdır.

-- ============================================================
-- 0. ÖN KONTROLLER (teklifler fiyat / termin_gun)
-- ============================================================
DO $$
BEGIN
    IF to_regclass('public.teklifler') IS NULL THEN
        RAISE EXCEPTION
            'public.teklifler tablosu yok. Önce supabase/migrations/006_teklifler.sql çalıştırın.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'teklifler'
          AND column_name = 'fiyat'
    ) THEN
        RAISE EXCEPTION
            'public.teklifler.fiyat sütunu yok. 006_teklifler.sql eksik veya bozulmuş.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'teklifler'
          AND column_name = 'termin_gun'
    ) THEN
        RAISE EXCEPTION
            'public.teklifler.termin_gun sütunu yok. 006_teklifler.sql eksik veya bozulmuş.';
    END IF;
END $$;

-- ============================================================
-- 1. profiles tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    ad_soyad TEXT,
    telefon TEXT,
    rol TEXT NOT NULL DEFAULT 'kullanici',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_rol_check'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_rol_check
            CHECK (rol IN ('kullanici', 'admin'));
    END IF;
END $$;

-- orphan + FK: profiles.id -> auth.users(id) ON DELETE CASCADE
DO $$
DECLARE
    orphan_count integer := 0;
    fk_exists boolean := false;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'profiles'
          AND c.contype = 'f'
          AND (
              c.conname = 'profiles_id_fkey'
              OR pg_get_constraintdef(c.oid) ILIKE '%REFERENCES auth.users%'
          )
    ) INTO fk_exists;

    IF fk_exists THEN
        RAISE NOTICE 'profiles → auth.users FK zaten mevcut; atlandı.';
        RETURN;
    END IF;

    SELECT COUNT(*)::integer
    INTO orphan_count
    FROM public.profiles p
    WHERE NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = p.id
    );

    IF orphan_count > 0 THEN
        RAISE NOTICE
            'UYARI: profiles tablosunda auth.users karşılığı olmayan % satır var. FK eklenmedi. Manuel temizleme gerekli: DELETE FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id); ardından 007’yi yeniden çalıştırın.',
            orphan_count;
        RETURN;
    END IF;

    ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_id_fkey
        FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

    RAISE NOTICE 'profiles_id_fkey eklendi (ON DELETE CASCADE).';
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Eski politikalar (özellikle insert_own) kaldırılır
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

-- Kullanıcı kendi satırını okuyabilir
CREATE POLICY "profiles_select_own"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Kullanıcı yalnızca kendi satırını güncelleyebilir (rol column-grant ile korunur)
CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Table-level INSERT yok; profile yalnızca trigger ile oluşur
-- Table-level UPDATE yok; yalnızca ad_soyad / telefon column-level
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (ad_soyad, telefon) ON TABLE public.profiles TO authenticated;

-- Yeni auth kullanıcısı → profile (rol asla metadata’dan gelmez)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, ad_soyad, telefon, rol)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'ad_soyad', NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'telefon', NULL),
        'kullanici'
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

-- ============================================================
-- 2. firmalar / is_talepleri: owner_id + is_seed
-- ============================================================
ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.firmalar
    ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.is_talepleri
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.is_talepleri
    ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_firmalar_owner_id ON public.firmalar (owner_id);
CREATE INDEX IF NOT EXISTS idx_firmalar_is_seed ON public.firmalar (is_seed);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_owner_id ON public.is_talepleri (owner_id);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_is_seed ON public.is_talepleri (is_seed);

-- ============================================================
-- 3. firmalar RLS (garanti ENABLE + policy yenile)
-- ============================================================
ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firmalar_anon_select_dogrulanmis" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_public_select" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_public_read_approved" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_anon_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_authenticated_insert" ON public.firmalar;
DROP POLICY IF EXISTS "firmalar_public_insert" ON public.firmalar;

CREATE POLICY "firmalar_public_select"
    ON public.firmalar
    FOR SELECT
    TO anon, authenticated
    USING (
        dogrulanmis IS TRUE
        AND durum = 'onaylandi'
        AND COALESCE(is_seed, FALSE) IS FALSE
    );

-- Lansman: anon + authenticated başvuru yapabilir.
-- Oturum varsa owner_id = auth.uid(); anon’da owner_id NULL.
CREATE POLICY "firmalar_public_insert"
    ON public.firmalar
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        dogrulanmis IS FALSE
        AND durum = 'beklemede'
        AND COALESCE(is_seed, FALSE) IS FALSE
        AND (
            (auth.uid() IS NULL AND owner_id IS NULL)
            OR (auth.uid() IS NOT NULL AND owner_id = auth.uid())
        )
    );

-- NOT: Geniş GRANT SELECT telefon/email sızdırabilir.
-- Insert/SELECT yetkileri 008_firmalar_auth_insert_user_id.sql ile netleştirilir.
REVOKE UPDATE, DELETE ON TABLE public.firmalar FROM anon, authenticated;

-- ============================================================
-- 4. is_talepleri RLS (durum standardı: 'Acik')
-- ============================================================
ALTER TABLE public.is_talepleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "is_talepleri_anon_select_acik" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_public_select" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_public_read_approved" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_anon_insert" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_public_insert" ON public.is_talepleri;

CREATE POLICY "is_talepleri_public_select"
    ON public.is_talepleri
    FOR SELECT
    TO anon, authenticated
    USING (
        durum = 'Acik'
        AND COALESCE(is_seed, FALSE) IS FALSE
    );

CREATE POLICY "is_talepleri_public_insert"
    ON public.is_talepleri
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        COALESCE(is_seed, FALSE) IS FALSE
        AND (
            (auth.uid() IS NULL AND owner_id IS NULL)
            OR (auth.uid() IS NOT NULL AND owner_id = auth.uid())
        )
    );

GRANT SELECT, INSERT ON TABLE public.is_talepleri TO anon, authenticated;
REVOKE UPDATE, DELETE ON TABLE public.is_talepleri FROM anon, authenticated;

-- ============================================================
-- 5. teklifler RLS — SELECT politikalarına dokunma; yalnızca INSERT ownership
--    006: teklifler_anon_select (USING true) + column-level SELECT (fiyat yok)
--    korunur; iş sahibi teklif sayısı / özet görünümü bozulmaz.
-- ============================================================
ALTER TABLE public.teklifler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teklifler_anon_insert" ON public.teklifler;
DROP POLICY IF EXISTS "teklifler_public_insert" ON public.teklifler;
DROP POLICY IF EXISTS "teklifler_auth_insert_owner" ON public.teklifler;
-- NOT: teklifler_anon_select / teklifler_public_select SİLİNMEZ

CREATE POLICY "teklifler_auth_insert_owner"
    ON public.teklifler
    FOR INSERT
    TO authenticated
    WITH CHECK (
        fiyat > 0
        AND termin_gun > 0
        AND EXISTS (
            SELECT 1 FROM public.firmalar f
            WHERE f.id = firma_id
              AND f.dogrulanmis IS TRUE
              AND f.durum = 'onaylandi'
              AND COALESCE(f.is_seed, FALSE) IS FALSE
              AND f.owner_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.is_talepleri i
            WHERE i.id = is_id
              AND i.durum = 'Acik'
              AND COALESCE(i.is_seed, FALSE) IS FALSE
        )
    );

-- Anon INSERT kaldırılır; SELECT grant’leri 006 ile uyumlu kalır
REVOKE INSERT ON TABLE public.teklifler FROM anon;
GRANT INSERT ON TABLE public.teklifler TO authenticated;
GRANT SELECT (id, is_id, firma_id, termin_gun, created_at) ON TABLE public.teklifler TO anon, authenticated;

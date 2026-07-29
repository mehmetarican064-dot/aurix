-- AURIX 041 — Admin paneli RBAC / erişim sıkılaştırması
-- Idempotent. DROP TABLE / TRUNCATE / kontrolsüz DELETE yok.
--
-- Hedef:
-- 1) public.is_admin() yeniden teyit (profiles.role = 'admin', auth.uid)
-- 2) authenticated kullanıcıların profiles.role kolonunu UPDATE edememesi
-- 3) JWT’li oturumda role kolonunun yetkisiz değiştirilmesini tetikleyiciyle engelle
-- 4) admin_* SECURITY DEFINER RPC’lerinde is_admin kontrolü / EXECUTE grant denetimi
--
-- Bu dosya ile supabase/maintenance/apply_041_admin_rbac_sikilastirma.sql aynıdır.

-- ============================================================
-- 1. is_admin() — tek kaynak: profiles.role
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMENT ON FUNCTION public.is_admin() IS
    'AURIX: authenticated kullanıcının profiles.role = admin olup olmadığını döner. Admin RPC’leri ve client RBAC için tek kaynak.';

-- ============================================================
-- 2. profiles.role — column-level koruma
-- ============================================================
DO $$
BEGIN
    BEGIN
        REVOKE UPDATE (role) ON TABLE public.profiles FROM authenticated;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        REVOKE UPDATE (role) ON TABLE public.profiles FROM anon;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        REVOKE ALL ON TABLE public.profiles FROM anon;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- ============================================================
-- 3. Role immutability tetikleyicisi (JWT’li non-admin)
-- ============================================================
-- auth.uid() NULL → migration / service_role (JWT yok): izin ver
-- auth.uid() dolu ve is_admin() false → role değişikliği reddet
-- auth.uid() dolu ve is_admin() true → admin RPC’leri role’ü değiştirebilir (şu an kullanılmıyor ama güvenli)

CREATE OR REPLACE FUNCTION public.profiles_role_degisiklik_engelle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
        IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'permission denied: profiles.role değiştirilemez'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_role_koru ON public.profiles;
CREATE TRIGGER trg_profiles_role_koru
    BEFORE UPDATE OF role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.profiles_role_degisiklik_engelle();

REVOKE ALL ON FUNCTION public.profiles_role_degisiklik_engelle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profiles_role_degisiklik_engelle() FROM anon, authenticated;

-- ============================================================
-- 4. Admin RPC EXECUTE: anon kapalı, authenticated açık
-- ============================================================
DO $$
DECLARE
    r record;
    n_auth int := 0;
    n_missing_guard int := 0;
    src text;
BEGIN
    FOR r IN
        SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (
              p.proname = 'is_admin'
              OR p.proname LIKE 'admin\_%' ESCAPE '\'
          )
    LOOP
        BEGIN
            EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);
            EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon', r.nspname, r.proname, r.args);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.nspname, r.proname, r.args);
            n_auth := n_auth + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[041] grant/revoke atlandı: %.%(%) — %', r.nspname, r.proname, r.args, SQLERRM;
        END;

        IF r.proname LIKE 'admin\_%' ESCAPE '\' THEN
            src := pg_get_functiondef(r.oid);
            IF src IS NULL OR position('is_admin()' IN src) = 0 THEN
                n_missing_guard := n_missing_guard + 1;
                RAISE WARNING '[041] is_admin() kontrolü bulunamadı: %.%(%)', r.nspname, r.proname, r.args;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE '[041] admin/is_admin fonksiyonlarına authenticated EXECUTE yenilendi: %', n_auth;
    IF n_missing_guard > 0 THEN
        RAISE WARNING '[041] % admin fonksiyonunda is_admin() metni bulunamadı — manuel denetleyin', n_missing_guard;
    END IF;
END $$;

-- ============================================================
-- 5. profiles UPDATE politikası — id = auth.uid() teyidi
-- ============================================================
DO $$
BEGIN
    IF to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'profiles tablosu bulunamadı';
    END IF;

    DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
    CREATE POLICY "profiles_update_own"
        ON public.profiles
        FOR UPDATE
        TO authenticated
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid());
END $$;

DO $$
BEGIN
    RAISE NOTICE '[041] Admin RBAC sıkılaştırması tamamlandı.';
END $$;

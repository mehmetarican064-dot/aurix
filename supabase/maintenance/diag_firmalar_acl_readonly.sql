-- AURIX diag — salt okuma. Policy/GRANT değiştirmez. Veri silmez.
-- Supabase SQL Editor’de çalıştırıp sonucu yapıştırın.

-- 1) firmalar_authenticated_insert WITH CHECK (+ diğer insert/select policy özeti)
SELECT
    pol.polname AS policy_name,
    CASE pol.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
        ELSE pol.polcmd::text
    END AS command,
    pg_get_expr(pol.polqual, pol.polrelid) AS using_expression,
    pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expression,
    ARRAY(
        SELECT r.rolname
        FROM pg_catalog.pg_roles r
        WHERE r.oid = ANY (pol.polroles)
    ) AS roles
FROM pg_catalog.pg_policy pol
JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'firmalar'
ORDER BY pol.polname;

-- 2) authenticated — tablo seviyesi haklar
SELECT
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'firmalar'
  AND grantee IN ('authenticated', 'anon', 'PUBLIC')
ORDER BY grantee, privilege_type;

-- 3) authenticated / anon — kolon seviyesi haklar
SELECT
    grantee,
    column_name,
    privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'firmalar'
  AND grantee IN ('authenticated', 'anon', 'PUBLIC')
ORDER BY grantee, column_name, privilege_type;

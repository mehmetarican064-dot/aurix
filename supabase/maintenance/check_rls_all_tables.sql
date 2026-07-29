-- =================================================================
-- AURIX — Tüm public Tabloları için RLS / anon Erişim Denetimi (SALT OKUNUR)
-- =================================================================
-- Bu dosya HİÇBİR VERİYİ DEĞİŞTİRMEZ.
-- Yalnızca SELECT sorguları içerir (pg_catalog / information_schema).
-- INSERT / UPDATE / DELETE / ALTER / CREATE / DROP YOKTUR.
--
-- Neden oluşturuldu:
-- Migration dosyalarının statik analizinde bulunanların CANLI veritabanıyla
-- eşleştiğini doğrulamak için (geçmişte "beklemede" durum değeri gibi
-- migration dosyalarında görünmeyen sapmalar canlıda bulunmuştu — bu script
-- o riski RLS/policy/grant tarafında kapatır).
--
-- Bu dosyayı Supabase SQL Editor'da çalıştırın ve her bölümün sonucunu
-- kontrol edin. Özellikle 4. ve 5. bölümlerdeki "DİKKAT" satırlarına bakın.
-- =================================================================


-- =================================================================
-- 1. public ŞEMASINDAKİ TÜM TABLOLAR — RLS AKTİF Mİ?
-- =================================================================
-- rls_aktif_mi = false dönen HERHANGİ bir satır KRİTİK bulgudur:
-- o tabloda RLS hiç devreye alınmamış demektir.
SELECT
    c.relname                              AS tablo_adi,
    c.relrowsecurity                       AS rls_aktif_mi,
    c.relforcerowsecurity                  AS rls_owner_icin_de_zorunlu_mu,
    CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'KRİTİK — RLS KAPALI' END AS degerlendirme
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;


-- =================================================================
-- 2. HER TABLODAKİ TÜM RLS POLİTİKALARI (rol, komut, USING, WITH CHECK)
-- =================================================================
SELECT
    tablename                              AS tablo_adi,
    policyname                             AS politika_adi,
    cmd                                     AS komut,
    roles                                   AS roller,
    permissive                             AS permissive_mi,
    qual                                    AS using_ifadesi,
    with_check                             AS with_check_ifadesi
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;


-- =================================================================
-- 3. anon ROLÜNE VERİLEN TABLO/KOLON DÜZEYİ GRANT'LER
-- =================================================================
SELECT
    table_name                             AS tablo_adi,
    privilege_type                         AS yetki,
    is_grantable                           AS devredilebilir_mi
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
ORDER BY table_name, privilege_type;

-- Kolon bazlı SELECT kısıtlaması olan tablolar için (örn. firmalar, teklifler)
-- anon'un gerçekte hangi kolonları okuyabildiğini gösterir.
SELECT
    table_name                             AS tablo_adi,
    column_name                            AS kolon_adi,
    privilege_type                         AS yetki
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND grantee = 'anon'
ORDER BY table_name, privilege_type, ordinal_position;


-- =================================================================
-- 4. RLS AKTİF AMA HİÇ POLİTİKASI OLMAYAN TABLOLAR (default-deny — bilgi amaçlı)
-- =================================================================
-- Bu tablolarda RLS açık fakat policy yok: bu GÜVENLİDİR (varsayılan davranış
-- tüm satırları reddetmektir), sadece görünürlük için raporlanır.
SELECT
    c.relname                              AS tablo_adi,
    'RLS aktif, policy yok -> varsayılan REDDET (güvenli)' AS aciklama
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity IS TRUE
  AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY c.relname;


-- =================================================================
-- 5. DİKKAT LİSTESİ — anon'a SINIRSIZ (USING true / qual NULL) erişim veren
--    SELECT/INSERT/UPDATE/DELETE politikaları
-- =================================================================
-- qual/with_check 'true' ise veya NULL ise (INSERT'te qual NULL olması
-- normaldir, with_check'e bakılır) o politika satır bazlı hiçbir filtre
-- uygulamıyor demektir. Bu, tasarım gereği olabilir (örn. herkese açık
-- statik içerik) ama HER SATIRIN kasıtlı olduğunu doğrulamak gerekir.
SELECT
    tablename                              AS tablo_adi,
    policyname                             AS politika_adi,
    cmd                                    AS komut,
    roles                                  AS roller,
    qual                                   AS using_ifadesi,
    with_check                             AS with_check_ifadesi,
    'DİKKAT — satır filtresi yok, sadece kolon GRANT kısıtı olabilir' AS uyari
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY (roles)
  AND (
        qual IS NULL
        OR btrim(lower(qual)) = 'true'
        OR with_check IS NOT NULL AND btrim(lower(with_check)) = 'true'
      )
ORDER BY tablename, cmd;


-- =================================================================
-- 6. anon'un YAZMA (INSERT/UPDATE/DELETE) YAPABİLDİĞİ TÜM TABLOLAR — ÖZET
-- =================================================================
-- Bu listedeki her tablo için "bu yazma kasıtlı mı?" sorusunu manuel
-- doğrulayın (örn. is_talepleri INSERT — giriş yapmamış kullanıcı taslak
-- oluşturamaz ama tabloya yazma genel olarak açık olabilir; atolyeler gibi
-- kullanılmayan eski tablolarda YAZMA AÇIK OLMAMALI).
SELECT DISTINCT
    p.tablename                            AS tablo_adi,
    p.cmd                                  AS komut,
    p.with_check                           AS with_check_ifadesi
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND 'anon' = ANY (p.roles)
  AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
ORDER BY p.tablename, p.cmd;


-- =================================================================
-- 7. is_talepleri — SELECT POLİTİKALARININ ÇAKIŞMA KONTROLÜ (spesifik)
-- =================================================================
-- Aynı tabloda aynı komut (SELECT) için birden fazla permissive policy
-- OR ile birleşir. Aşağıda is_talepleri için TÜM SELECT policy'leri
-- tek satırda görünür; birden fazla satır varsa ve biri diğerinden daha
-- gevşekse (örn. yayinlanma_tarihi şartı olmayan biri), o gevşek şart
-- fiilen geçerli olur.
SELECT
    policyname                             AS politika_adi,
    permissive                            AS permissive_mi,
    roles                                  AS roller,
    qual                                   AS using_ifadesi
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'is_talepleri'
  AND cmd = 'SELECT'
ORDER BY policyname;


-- =================================================================
-- 8. atolyeler — GÜNCEL POLİTİKA DURUMU (spesifik)
-- =================================================================
SELECT
    policyname                             AS politika_adi,
    cmd                                     AS komut,
    roles                                   AS roller,
    qual                                    AS using_ifadesi,
    with_check                             AS with_check_ifadesi
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'atolyeler'
ORDER BY cmd, policyname;

-- atolyeler tablosu hâlâ kullanılıyor mu (satır sayısı / son kayıt bilgi amaçlı)?
SELECT
    COUNT(*)::int                          AS toplam_kayit,
    MAX(created_at)                        AS son_kayit_tarihi
FROM public.atolyeler;

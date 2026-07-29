-- =================================================================
-- AURIX — 032 & 033 Production Durum Kontrolü (SALT OKUNUR)
-- =================================================================
-- Bu dosya HİÇBİR VERİYİ DEĞİŞTİRMEZ.
-- Yalnızca SELECT, pg_get_functiondef(), pg_get_constraintdef() ve
-- pg_policies / information_schema sorguları içerir.
-- INSERT / UPDATE / DELETE / ALTER / CREATE / DROP YOKTUR.
--
-- Kullanım: Supabase SQL Editor'da tamamını çalıştırın; her blok
-- kendi başına bağımsız bir SELECT sonucu döndürür (result set'ler
-- sırayla görünür). Herhangi bir bloğu tek başına da çalıştırabilirsiniz.
--
-- Kapsam:
--   A. is_talepleri.durum CHECK değerleri
--   B. is_talepleri.moderasyon_durumu CHECK değerleri
--   C. is_talebi_kaydet fonksiyon imzası + gövdesi
--   D. yayinla=true → teklif_bekliyor + aktif + yayinlanma_tarihi doğrulaması
--      (statik kod kontrolü + canlı veri tutarlılık kontrolü)
--   E. is_talepleri_select_yayin_032 RLS policy varlığı
--   F. 033 moderasyon hotfix'inin gerçekten uygulanıp uygulanmadığı
--   G. Tek satırlık özet checklist (PASS/FAIL)
-- =================================================================


-- =================================================================
-- A. is_talepleri.durum — CHECK constraint(ler)
-- =================================================================
-- Beklenen (034 sonrası): tek bir "is_talepleri_durum_check" constraint'i,
-- 8 standart değer: taslak, teklif_bekliyor, teklif_secildi,
-- is_emri_olusturuldu, uretimde, tamamlandi, iptal_edildi, arsivlendi.
SELECT
    con.conname                            AS constraint_adi,
    pg_get_constraintdef(con.oid, true)    AS constraint_tanimi,
    con.convalidated                       AS validate_edilmis_mi
FROM pg_constraint con
JOIN pg_class rel      ON rel.oid = con.conrelid
JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'is_talepleri'
  AND con.contype = 'c'
  AND (SELECT attnum FROM pg_attribute
       WHERE attrelid = con.conrelid AND attname = 'durum') = ANY (con.conkey)
ORDER BY con.conname;

-- A2. Canlı veride durum kolonunun DISTINCT değerleri (tahmin değil, gerçek veri)
SELECT durum, COUNT(*)::int AS satir_sayisi
FROM public.is_talepleri
GROUP BY durum
ORDER BY satir_sayisi DESC, durum NULLS FIRST;

-- A3. Standart dışı (034 hedefine uymayan) durum değerleri — 0 satır beklenir
SELECT durum, COUNT(*)::int AS satir_sayisi
FROM public.is_talepleri
WHERE durum IS NOT NULL
  AND durum NOT IN (
      'taslak', 'teklif_bekliyor', 'teklif_secildi', 'is_emri_olusturuldu',
      'uretimde', 'tamamlandi', 'iptal_edildi', 'arsivlendi'
  )
GROUP BY durum;


-- =================================================================
-- B. is_talepleri.moderasyon_durumu — CHECK constraint(ler)
-- =================================================================
-- Beklenen (033 sonrası): tek bir "is_talepleri_moderasyon_durumu_check"
-- constraint'i, 3 standart değer: aktif, incelemede, yayindan_kaldirildi.
-- Eski "is_talepleri_moderasyon_check" (013) İSE ARTIK VAR OLMAMALI.
SELECT
    con.conname                            AS constraint_adi,
    pg_get_constraintdef(con.oid, true)    AS constraint_tanimi,
    con.convalidated                       AS validate_edilmis_mi
FROM pg_constraint con
JOIN pg_class rel      ON rel.oid = con.conrelid
JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'is_talepleri'
  AND con.contype = 'c'
  AND (SELECT attnum FROM pg_attribute
       WHERE attrelid = con.conrelid AND attname = 'moderasyon_durumu') = ANY (con.conkey)
ORDER BY con.conname;

-- B2. Eski (013) constraint adı hâlâ var mı? (satır dönerse 033 tam uygulanmamış demektir)
SELECT con.conname, pg_get_constraintdef(con.oid, true) AS constraint_tanimi
FROM pg_constraint con
JOIN pg_class rel     ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'is_talepleri'
  AND con.contype = 'c'
  AND con.conname = 'is_talepleri_moderasyon_check';

-- B3. Canlı veride moderasyon_durumu DISTINCT değerleri
SELECT moderasyon_durumu, COUNT(*)::int AS satir_sayisi
FROM public.is_talepleri
GROUP BY moderasyon_durumu
ORDER BY satir_sayisi DESC, moderasyon_durumu NULLS FIRST;

-- B4. Standart dışı (033 hedefine uymayan) moderasyon_durumu değerleri — 0 satır beklenir
SELECT moderasyon_durumu, COUNT(*)::int AS satir_sayisi
FROM public.is_talepleri
WHERE moderasyon_durumu IS NOT NULL
  AND moderasyon_durumu NOT IN ('aktif', 'incelemede', 'yayindan_kaldirildi')
GROUP BY moderasyon_durumu;


-- =================================================================
-- C. is_talebi_kaydet — fonksiyon imzası ve mevcut gövde davranışı
-- =================================================================
SELECT
    p.oid::regprocedure                       AS imza,
    pg_get_function_arguments(p.oid)          AS parametreler,
    pg_get_function_result(p.oid)             AS donus_tipi,
    p.prosecdef                                AS security_definer_mi,
    array_to_string(p.proconfig, ', ')          AS fonksiyon_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_talebi_kaydet';

-- C2. Fonksiyonun tam kaynak kodu (mevcut canlı gövde — tahmin değil)
SELECT pg_get_functiondef(p.oid) AS govde
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_talebi_kaydet';


-- =================================================================
-- D. yayinla=true → teklif_bekliyor + aktif + yayinlanma_tarihi doğrulaması
-- =================================================================
-- D1. Statik kod kontrolü: fonksiyon kaynağında beklenen atamalar var mı?
--     (Gerçek çalışma zamanı davranışının yerine geçmez, ama veri
--     DEĞİŞTİRMEDEN kaynağı denetler.)
SELECT
    (pg_get_functiondef(p.oid) ILIKE '%''teklif_bekliyor''%')       AS icerir_teklif_bekliyor,
    (pg_get_functiondef(p.oid) ILIKE '%''aktif''%')                 AS icerir_aktif_atamasi,
    (pg_get_functiondef(p.oid) ILIKE '%yayinlanma_tarihi%now()%')   AS icerir_yayinlanma_tarihi_now,
    (pg_get_functiondef(p.oid) ILIKE '%yayinla%')                   AS icerir_yayinla_parametresi
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_talebi_kaydet';

-- D2. Canlı veri tutarlılık kontrolü — GERÇEK ANOMALİ:
--     durum = teklif_bekliyor İKEN yayinlanma_tarihi NULL olan satırlar.
--     is_talepleri_listele ve RLS bu satırları listelemez; bu satırlar
--     "yayında görünmesi gerekirken görünmeyen" kayıtlardır. 0 satır beklenir.
SELECT id, baslik, durum, moderasyon_durumu, yayinlanma_tarihi, created_at
FROM public.is_talepleri
WHERE durum = 'teklif_bekliyor'
  AND yayinlanma_tarihi IS NULL
ORDER BY created_at DESC
LIMIT 100;

-- D3. Bilgi amaçlı dağılım — teklif_bekliyor kayıtlarının moderasyon/yayın
--     tarihi kombinasyonlarına göre kırılımı (admin "yayından kaldır"
--     yaptıysa durum teklif_bekliyor kalır ama moderasyon_durumu
--     'yayindan_kaldirildi' olur — bu BEKLENEN bir durumdur, hata değildir).
SELECT
    durum,
    moderasyon_durumu,
    (yayinlanma_tarihi IS NOT NULL) AS yayinlanma_tarihi_var,
    COUNT(*)::int AS satir_sayisi
FROM public.is_talepleri
WHERE durum = 'teklif_bekliyor'
GROUP BY durum, moderasyon_durumu, (yayinlanma_tarihi IS NOT NULL)
ORDER BY satir_sayisi DESC;


-- =================================================================
-- E. is_talepleri_select_yayin_032 — RLS policy varlığı
-- =================================================================
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd            AS komut,
    qual           AS using_kosulu,
    with_check     AS with_check_kosulu
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'is_talepleri'
  AND policyname = 'is_talepleri_select_yayin_032';

-- E2. is_talepleri tablosundaki TÜM policy'ler (genel görünüm, karşılaştırma için)
SELECT
    policyname,
    permissive,
    roles,
    cmd AS komut,
    qual AS using_kosulu,
    with_check AS with_check_kosulu
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'is_talepleri'
ORDER BY policyname;

-- E3. RLS'in tablo üzerinde açık olup olmadığı
SELECT relname, relrowsecurity AS rls_acik_mi, relforcerowsecurity AS force_rls_mi
FROM pg_class
WHERE relname = 'is_talepleri'
  AND relnamespace = 'public'::regnamespace;


-- =================================================================
-- F. 033 moderasyon hotfix'inin gerçekten uygulanıp uygulanmadığı
-- =================================================================
-- F1. Beklenen yeni constraint (aktif/incelemede/yayindan_kaldirildi) var mı?
SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel     ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'is_talepleri'
      AND con.contype = 'c'
      AND con.conname = 'is_talepleri_moderasyon_durumu_check'
) AS yeni_constraint_var_mi;

-- F2. Eski (013) constraint temizlenmiş mi? (FALSE beklenir = artık yok)
SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel     ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'is_talepleri'
      AND con.contype = 'c'
      AND con.conname = 'is_talepleri_moderasyon_check'
) AS eski_constraint_hala_var_mi;

-- F3. admin_is_talebi_moderasyon fonksiyonu — imza + gövde
SELECT
    p.oid::regprocedure                AS imza,
    pg_get_function_arguments(p.oid)   AS parametreler,
    p.prosecdef                        AS security_definer_mi
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_is_talebi_moderasyon';

SELECT pg_get_functiondef(p.oid) AS govde
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_is_talebi_moderasyon';

-- F4. admin_is_moderasyon (eski isim, 033'te geriye dönük uyumluluk için
--     tutulmuştu) hâlâ var mı ve yeni enum'u mu yazıyor?
SELECT pg_get_functiondef(p.oid) AS govde
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_is_moderasyon';

-- F5. is_talebi_islem_loglari tablosunda 033/034 sonrası loglanmış
--     moderasyon işlemlerinin son 20 kaydı (bilgi amaçlı, veri değiştirmez)
SELECT id, is_talebi_id, admin_id, islem, notlar, created_at
FROM public.is_talebi_islem_loglari
ORDER BY created_at DESC
LIMIT 20;


-- =================================================================
-- G. ÖZET CHECKLIST — tek satırda PASS/FAIL
-- =================================================================
SELECT
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname='public' AND rel.relname='is_talepleri'
          AND con.contype='c' AND con.conname='is_talepleri_durum_check'
    ) THEN 'PASS' ELSE 'FAIL' END                         AS durum_check_var,

    CASE WHEN NOT EXISTS (
        SELECT 1 FROM public.is_talepleri
        WHERE durum IS NOT NULL AND durum NOT IN (
            'taslak','teklif_bekliyor','teklif_secildi','is_emri_olusturuldu',
            'uretimde','tamamlandi','iptal_edildi','arsivlendi'
        )
    ) THEN 'PASS' ELSE 'FAIL' END                         AS durum_verisi_standart_mi,

    CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname='public' AND rel.relname='is_talepleri'
          AND con.contype='c' AND con.conname='is_talepleri_moderasyon_durumu_check'
    ) THEN 'PASS' ELSE 'FAIL' END                         AS moderasyon_check_var,

    CASE WHEN NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname='public' AND rel.relname='is_talepleri'
          AND con.contype='c' AND con.conname='is_talepleri_moderasyon_check'
    ) THEN 'PASS' ELSE 'FAIL' END                         AS eski_moderasyon_check_temizlenmis,

    CASE WHEN NOT EXISTS (
        SELECT 1 FROM public.is_talepleri
        WHERE moderasyon_durumu IS NOT NULL
          AND moderasyon_durumu NOT IN ('aktif','incelemede','yayindan_kaldirildi')
    ) THEN 'PASS' ELSE 'FAIL' END                         AS moderasyon_verisi_standart_mi,

    CASE WHEN EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='is_talebi_kaydet'
    ) THEN 'PASS' ELSE 'FAIL' END                         AS is_talebi_kaydet_var,

    CASE WHEN NOT EXISTS (
        SELECT 1 FROM public.is_talepleri
        WHERE durum = 'teklif_bekliyor' AND yayinlanma_tarihi IS NULL
    ) THEN 'PASS' ELSE 'FAIL' END                         AS yayinlanan_kayitlarin_tarihi_dolu_mu,

    CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='is_talepleri'
          AND policyname='is_talepleri_select_yayin_032'
    ) THEN 'PASS' ELSE 'FAIL' END                         AS select_yayin_032_policy_var,

    CASE WHEN EXISTS (
        SELECT 1 FROM pg_class WHERE relname='is_talepleri' AND relnamespace='public'::regnamespace
          AND relrowsecurity = true
    ) THEN 'PASS' ELSE 'FAIL' END                         AS rls_acik_mi,

    CASE WHEN EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='admin_is_talebi_moderasyon'
    ) THEN 'PASS' ELSE 'FAIL' END                         AS admin_is_talebi_moderasyon_var;

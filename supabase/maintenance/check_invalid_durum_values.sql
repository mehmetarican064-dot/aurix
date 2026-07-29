-- =================================================================
-- AURIX — is_talepleri.durum Standart Dışı Değer Teşhisi (SALT OKUNUR)
-- =================================================================
-- Bu dosya HİÇBİR VERİYİ DEĞİŞTİRMEZ.
-- Yalnızca SELECT sorguları içerir.
-- INSERT / UPDATE / DELETE / ALTER / CREATE / DROP YOKTUR.
--
-- Neden oluşturuldu:
-- check_032_033_production_state.sql çalıştırıldığında özet checklist'te
-- yalnızca "durum_verisi_standart_mi = FAIL" döndü. Bu dosya, tam olarak
-- hangi durum değerlerinin standart dışı kaldığını, kaç kayıt etkilendiğini
-- ve bu kayıtların 034 migration'ı tarafından otomatik normalize edilip
-- edilmeyeceğini satır satır raporlar.
--
-- 034 migration'ının normalize ettiği (case-sensitive, TAM eşleşme) tek 3
-- eski değer: 'Acik' -> teklif_bekliyor, 'Tamamlandi' -> tamamlandi,
-- 'Iptal' -> iptal_edildi. Bunların DIŞINDAKİ hiçbir değer 034 tarafından
-- dönüştürülmez (aşağıdaki her sorguda bu üç değer ayrıca işaretlenir).
--
-- Standart 8 değer: taslak, teklif_bekliyor, teklif_secildi,
-- is_emri_olusturuldu, uretimde, tamamlandi, iptal_edildi, arsivlendi.
-- =================================================================


-- =================================================================
-- 0. BAĞLAM — durum CHECK constraint'i şu an var mı, validate edilmiş mi?
-- =================================================================
-- Eğer bu sorgu satır dönmüyorsa: 034 hiç çalıştırılmamış demektir.
-- Satır dönüyor ama validate_edilmis_mi = false ise: 034 çalıştı, constraint
-- eklendi, ama VALIDATE CONSTRAINT adımı aşağıdaki gibi standart dışı
-- satırlar yüzünden başarısız oldu (034 dosyası bu durumu hataya
-- düşürmeden NOTICE ile atlayacak şekilde yazılmıştı).
SELECT
    con.conname                            AS constraint_adi,
    con.convalidated                       AS validate_edilmis_mi,
    pg_get_constraintdef(con.oid, true)    AS constraint_tanimi
FROM pg_constraint con
JOIN pg_class rel      ON rel.oid = con.conrelid
JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'is_talepleri'
  AND con.contype = 'c'
  AND (SELECT attnum FROM pg_attribute
       WHERE attrelid = con.conrelid AND attname = 'durum') = ANY (con.conkey);


-- =================================================================
-- 1. STANDART DIŞI durum DEĞERLERİ + KAÇAR KAYIT VAR
-- =================================================================
SELECT
    durum                                                          AS standart_disi_deger,
    COUNT(*)::int                                                  AS kayit_sayisi,
    (durum IN ('Acik', 'Tamamlandi', 'Iptal'))                     AS migration_034_normalize_eder_mi,
    CASE
        WHEN durum = 'Acik'       THEN 'teklif_bekliyor'
        WHEN durum = 'Tamamlandi' THEN 'tamamlandi'
        WHEN durum = 'Iptal'      THEN 'iptal_edildi'
        ELSE NULL
    END                                                             AS x034_hedef_deger
FROM public.is_talepleri
WHERE durum IS NOT NULL
  AND durum NOT IN (
      'taslak', 'teklif_bekliyor', 'teklif_secildi', 'is_emri_olusturuldu',
      'uretimde', 'tamamlandi', 'iptal_edildi', 'arsivlendi'
  )
GROUP BY durum
ORDER BY kayit_sayisi DESC, durum;


-- =================================================================
-- 2. STANDART DIŞI KAYITLARIN TAM LİSTESİ (id, başlık, tarihler, moderasyon)
-- =================================================================
SELECT
    id,
    baslik                                                         AS baslik,
    durum                                                          AS standart_disi_durum,
    moderasyon_durumu,
    created_at                                                     AS olusturulma_tarihi,
    guncellenme_tarihi,
    yayinlanma_tarihi,
    (durum IN ('Acik', 'Tamamlandi', 'Iptal'))                     AS migration_034_normalize_eder_mi
FROM public.is_talepleri
WHERE durum IS NOT NULL
  AND durum NOT IN (
      'taslak', 'teklif_bekliyor', 'teklif_secildi', 'is_emri_olusturuldu',
      'uretimde', 'tamamlandi', 'iptal_edildi', 'arsivlendi'
  )
ORDER BY migration_034_normalize_eder_mi ASC, durum, olusturulma_tarihi DESC;


-- =================================================================
-- 3. NULL durum KONTROLÜ (bilgi amaçlı — CHECK constraint NULL'a izin verir,
--    bu nedenle NULL bir "hata" sayılmaz, ama görünürlük için raporlanır)
-- =================================================================
SELECT COUNT(*)::int AS null_durum_kayit_sayisi
FROM public.is_talepleri
WHERE durum IS NULL;


-- =================================================================
-- 4. ÖZET — 034 SONRASI OTOMATİK NORMALİZE OLACAK / OLMAYACAK KIRILIMI
-- =================================================================
-- "otomatik_normalize_olur" = 034'teki 3 UPDATE ifadesiyle tam eşleşen
--   (case-sensitive) satırlar: bunlar migration'ı tekrar çalıştırmakla
--   (veya hiç çalıştırılmadıysa ilk kez çalıştırmakla) düzelir.
-- "otomatik_normalize_OLMAZ" = 034'ün beklemediği herhangi bir başka
--   metin (farklı harf büyüklüğü, boşluk, yazım hatası, çok eski bir
--   sürümden kalma değer vb.) — bunlar için 034'ü tekrar çalıştırmak
--   YETERSİZDİR; ayrı bir normalize adımı / manuel karar gerekir.
SELECT
    CASE WHEN durum IN ('Acik', 'Tamamlandi', 'Iptal')
         THEN 'otomatik_normalize_olur (034 kapsıyor)'
         ELSE 'otomatik_normalize_OLMAZ (034 kapsamıyor — ek işlem gerekir)'
    END                         AS x034_sonucu,
    COUNT(*)::int               AS kayit_sayisi,
    array_agg(DISTINCT durum)   AS bu_gruptaki_degerler
FROM public.is_talepleri
WHERE durum IS NOT NULL
  AND durum NOT IN (
      'taslak', 'teklif_bekliyor', 'teklif_secildi', 'is_emri_olusturuldu',
      'uretimde', 'tamamlandi', 'iptal_edildi', 'arsivlendi'
  )
GROUP BY 1
ORDER BY 1;

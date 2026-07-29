-- AURIX 038 — Security Audit bulgusu: atolye-gorselleri bucket'ında anonim
-- (girişsiz) INSERT açığının kapatılması.
-- Idempotent. Yalnızca "atolye_gorsel_anon_upload" storage.objects policy'sini
-- DROP+CREATE eder. Veri/dosya silme yok, bucket silme yok.
--
-- Bu dosya = supabase/maintenance/apply_038_storage_anon_upload_kapat.sql
-- SQL Editor'da YALNIZCA BİRİNİ çalıştırın (037 sonrası).
--
-- KESİN NEDEN (Security Audit):
-- 001_initial_schema.sql (satır 149-155), "atolye_gorsel_anon_upload" politikası
-- storage.objects üzerinde "TO anon, authenticated" ile INSERT'e izin veriyor;
-- tek kontrol dosya uzantısıdır (jpg/jpeg/png/webp/gif). "atolyeler" tablosu ve
-- "atolye-gorselleri" bucket'ı güncel frontend kodunda (js/*.js) hiçbir yerde
-- kullanılmıyor — 036 migration'ı bunu doğrulayıp tablo INSERT policy'sini
-- (atolyeler_public_insert) authenticated'e çevirmişti, ancak STORAGE
-- policy'si o migration'da ele alınmamıştı. Sonuç: herhangi bir anonim internet
-- kullanıcısı, herkese açık anon key ile bu (genel görünürlükte, public=true)
-- bucket'a doğrudan dosya yükleyebilir (spam/istismar/depolama kotası tüketimi
-- riski) — bu, kullanılmayan bir özellik için gerçek ve gereksiz bir saldırı
-- yüzeyidir.
--
-- Bu migration SADECE bu policy'yi authenticated-only'ye çevirir; bucket'ı
-- veya tabloyu silmez, başka hiçbir policy/veriye dokunmaz.

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RAISE NOTICE '[038] storage.objects yok; adım atlandı.';
        RETURN;
    END IF;

    DROP POLICY IF EXISTS "atolye_gorsel_anon_upload" ON storage.objects;

    -- KRİTİK DÜZELTME: anon kaldırıldı, yalnızca authenticated INSERT edebilir.
    CREATE POLICY "atolye_gorsel_anon_upload"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'atolye-gorselleri'
            AND (storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp', 'gif'))
        );

    RAISE NOTICE '[038] atolye_gorsel_anon_upload güncellendi: anon INSERT kaldırıldı, yalnızca authenticated.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[038] atolye-gorselleri storage policy güncellenemedi: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'atolye_gorsel_anon_upload'
          AND roles::text NOT LIKE '%anon%'
    ) THEN
        RAISE NOTICE '[038] Doğrulama OK: atolye_gorsel_anon_upload artık anon rolünü içermiyor.';
    ELSE
        RAISE WARNING '[038] Doğrulama BAŞARISIZ veya policy bulunamadı; manuel kontrol edin.';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '[038] tamam: atolye-gorselleri bucket''ına anonim dosya yükleme kapatıldı.';
END $$;

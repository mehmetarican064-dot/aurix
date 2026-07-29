-- AURIX 036 — RLS güvenlik sıkılaştırması
-- Idempotent. DROP TABLE / veri kaybı yok. Yalnızca 2 politika hedeflenir.
--
-- Bu dosya = supabase/maintenance/apply_036_rls_guvenlik_sikilastirma.sql
-- SQL Editor'da YALNIZCA BİRİNİ çalıştırın (035 sonrası).
--
-- KAPSAM (tüm public tabloları migration dosyaları satır satır taranarak
-- denetlendi — bkz. supabase/maintenance/check_rls_all_tables.sql):
-- Denetlenen 15 tablonun (profiles, atolyeler, firmalar, is_talepleri,
-- teklifler, admin_islem_kayitlari, aurix_icerik, firma_dogrulama_basvurulari,
-- firma_dogrulama_belgeler, firma_dogrulama_riskler, firma_dogrulama_loglari,
-- firma_degerlendirmeleri, is_kategorileri, is_talebi_dosyalari,
-- is_talebi_islem_loglari) HEPSİNDE RLS aktif. Bu migration SADECE aşağıdaki
-- 2 gerçek bulguyu düzeltir; başka hiçbir tabloya/politikaya dokunmaz.
--
-- BULGU 1 — is_talepleri çakışan SELECT politikaları:
-- 028_is_talepleri.sql, "is_talepleri_select_published" politikasını
-- yayinlanma_tarihi şartı OLMADAN oluşturdu (durum + moderasyon_durumu yeterli
-- sayıldı). 032_is_talebi_yayinlama_akisi.sql daha sıkı bir politika
-- ("is_talepleri_select_yayin_032", yayinlanma_tarihi IS NOT NULL şartlı)
-- ekledi ama eskisini DROP ETMEDİ. PostgreSQL'de aynı komut için birden
-- fazla permissive policy OR ile birleşir; bu yüzden en gevşek koşul
-- (028'inki) fiilen geçerli kalıyor ve 032'nin eklediği kısıt işlemiyor.
-- Düzeltme: eski "is_talepleri_select_published" politikası DROP edilir;
-- tek geçerli SELECT politikası "is_talepleri_select_yayin_032" kalır.
--
-- BULGU 2 — atolyeler anon INSERT (kullanılmayan tablo):
-- 001_initial_schema.sql, "atolyeler_public_insert" politikasını
-- TO anon, authenticated olarak tanımladı. Bu tablo frontend kod tabanında
-- (js/*.js) hiçbir yerde kullanılmıyor; firmalar tablosuyla değiştirilmiş
-- eski bir yapı. Anon key ile doğrudan API çağrısıyla spam kayıt
-- eklenebiliyordu. Düzeltme: politika TO authenticated'e daraltılır,
-- anon'a tablo düzeyinde INSERT REVOKE edilir.
-- NOT: atolyeler tablosu canlı ortamda zaten kaldırılmış olabilir. Bu
-- migration böyle bir durumda HATA VERMEZ; ilgili adım güvenle SKIP edilir
-- ve is_talepleri düzeltmesi + genel RLS taraması normal şekilde çalışır.

DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'is_talepleri tablosu bulunamadı';
    END IF;
    IF to_regclass('public.atolyeler') IS NULL THEN
        RAISE NOTICE '[036] atolyeler tablosu canlı ortamda bulunamadı — atolyeler adımı bu çalıştırmada SKIP edilecek.';
    END IF;
END $$;

-- ============================================================
-- 1. is_talepleri — çakışan gevşek SELECT politikasını kaldır
-- ============================================================
DO $$
DECLARE
    yayin_032_var boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'is_talepleri'
          AND policyname = 'is_talepleri_select_yayin_032'
    ) INTO yayin_032_var;

    IF NOT yayin_032_var THEN
        RAISE EXCEPTION
            '[036] is_talepleri_select_yayin_032 politikası bulunamadı — '
            '032 migration''ı tekrar çalıştırılmadan is_talepleri_select_published '
            'DROP edilmeyecek (anon SELECT tamamen kapanmasın).';
    END IF;

    RAISE NOTICE '[036] is_talepleri_select_yayin_032 doğrulandı, güvenle devam ediliyor.';
END $$;

DROP POLICY IF EXISTS "is_talepleri_select_published" ON public.is_talepleri;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'is_talepleri'
          AND policyname = 'is_talepleri_select_published'
    ) THEN
        RAISE WARNING '[036] is_talepleri_select_published hâlâ mevcut — DROP başarısız oldu.';
    ELSE
        RAISE NOTICE '[036] is_talepleri_select_published kaldırıldı. '
            'Artık tek anon/authenticated SELECT politikası is_talepleri_select_yayin_032 '
            '(yayinlanma_tarihi IS NOT NULL şartlı).';
    END IF;
END $$;

-- ============================================================
-- 2. atolyeler — anon INSERT'i kapat (kullanılmayan tablo, spam yüzeyi)
--    Tablo yoksa (canlı ortamda kaldırılmışsa) bu adım SKIP edilir.
-- ============================================================
DO $$
DECLARE
    kayit_sayisi int;
BEGIN
    IF to_regclass('public.atolyeler') IS NULL THEN
        RAISE NOTICE '[036] atolyeler tablosu bulunamadı — bu adım SKIP edildi (tablo canlı ortamda mevcut değil).';
        RETURN;
    END IF;

    EXECUTE 'SELECT COUNT(*) FROM public.atolyeler' INTO kayit_sayisi;
    RAISE NOTICE '[036] atolyeler tablosunda % kayıt var (bilgi amaçlı, siliniyor değil).', kayit_sayisi;

    EXECUTE 'DROP POLICY IF EXISTS "atolyeler_public_insert" ON public.atolyeler';

    EXECUTE $pol$
        CREATE POLICY "atolyeler_public_insert"
            ON public.atolyeler FOR INSERT
            TO authenticated
            WITH CHECK (
                durum = 'beklemede'
                AND premium = FALSE
            )
    $pol$;

    EXECUTE 'REVOKE INSERT ON TABLE public.atolyeler FROM anon';

    RAISE NOTICE '[036] atolyeler_public_insert artık yalnızca authenticated. '
        'anon INSERT hem policy hem GRANT seviyesinde kapatıldı.';
END $$;

-- ============================================================
-- 3. GÜVENLİK AĞI — bilinen 15 tablonun tümünde RLS hâlâ aktif mi?
-- ============================================================
DO $$
DECLARE
    beklenen_tablolar text[] := ARRAY[
        'profiles', 'atolyeler', 'firmalar', 'is_talepleri', 'teklifler',
        'admin_islem_kayitlari', 'aurix_icerik', 'firma_dogrulama_basvurulari',
        'firma_dogrulama_belgeler', 'firma_dogrulama_riskler', 'firma_dogrulama_loglari',
        'firma_degerlendirmeleri', 'is_kategorileri', 'is_talebi_dosyalari',
        'is_talebi_islem_loglari'
    ];
    tablo text;
    rls_kapali_liste text[] := ARRAY[]::text[];
BEGIN
    FOREACH tablo IN ARRAY beklenen_tablolar LOOP
        IF to_regclass('public.' || tablo) IS NULL THEN
            RAISE NOTICE '[036] % tablosu bulunamadı (atlandı).', tablo;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = tablo
              AND c.relrowsecurity IS TRUE
        ) THEN
            rls_kapali_liste := array_append(rls_kapali_liste, tablo);
        END IF;
    END LOOP;

    IF array_length(rls_kapali_liste, 1) IS NULL THEN
        RAISE NOTICE '[036] Doğrulama OK: denetlenen tüm tablolarda RLS aktif.';
    ELSE
        RAISE WARNING '[036] KRİTİK: RLS kapalı bulunan tablolar: %', rls_kapali_liste;
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '[036] tamam: is_talepleri SELECT çakışması giderildi, '
        'atolyeler anon INSERT kapatıldı, RLS güvenlik ağı kontrolü çalıştırıldı.';
END $$;

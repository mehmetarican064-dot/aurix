-- AURIX 035 — is_talepleri.durum = 'beklemede' düzeltmesi
-- Idempotent. Yalnızca durum = 'beklemede' olan kayıtları hedefler.
-- Başka hiçbir durum değerine veya sütuna dokunmaz.
--
-- ANALİZ (kod tabanı taraması, tahmin değil):
-- 'beklemede' değeri is_talepleri.durum için HİÇBİR migration veya RPC'de
-- (028, 029, 030, 031, 032, 033, 034 / is_talebi_kaydet / is_talebi_sahip_islem /
-- admin_is_talebi_moderasyon) üretilmez. Kod tabanında 'beklemede' yalnızca
-- public.firmalar.durum sütununun varsayılan/onay-bekliyor değeridir
-- (bkz. 005_firma_durum_admin.sql: "ALTER COLUMN durum SET DEFAULT 'beklemede'").
-- Yani bu değer is_talepleri iş akışının normal bir çıktısı değildir; muhtemelen
-- eski bir test/manuel kayıt veya firmalar tablosuyla karışan bir veri girişidir.
--
-- KARAR MEKANİZMASI (taslak mı, teklif_bekliyor mu?):
-- Kod tabanındaki tek gerçek kaynak (034, is_talebi_kaydet + is_talepleri_listele)
-- şu değişmez kuralı zorunlu kılar: bir kayıt YALNIZCA gerçekten yayınlandığında
-- yayinlanma_tarihi NOT NULL olur (durum = 'teklif_bekliyor' <=> yayinlanma_tarihi
-- IS NOT NULL). Taslaklarda yayinlanma_tarihi her zaman NULL'dur (bkz. 034 satır
-- 620-622: taslağa dönüşte yayinlanma_tarihi = NULL yapılır; satır 259-261:
-- yayınlanınca yayinlanma_tarihi = COALESCE(yayinlanma_tarihi, NOW())).
--
-- Bu nedenle statik bir varsayım yapmak yerine (ör. körlemesine "taslak" yazmak),
-- migration AYNI değişmez kuralı kullanarak veriye bakar:
--   - yayinlanma_tarihi IS NOT NULL  -> kayıt bir noktada gerçekten yayınlanmış
--                                       demektir -> doğru karşılığı 'teklif_bekliyor'
--   - yayinlanma_tarihi IS NULL      -> kayıt hiç yayınlanmamış demektir
--                                       -> doğru karşılığı 'taslak' (production
--                                          güvenli varsayılan: açık listede
--                                          görünmez, sahibinden başkasına sızmaz)
--
-- PRODUCTION GÜVENLİĞİ:
-- - Yalnızca durum = 'beklemede' olan satırlar etkilenir (WHERE ile daraltılmış).
-- - Constraint DROP/CREATE yok; 034'te eklenen is_talepleri_durum_check zaten
--   'taslak' ve 'teklif_bekliyor' değerlerine izin veriyor, bu migration ek bir
--   şema değişikliği gerektirmez.
-- - Idempotent: ilk çalıştırmadan sonra WHERE durum = 'beklemede' eşleşen satır
--   kalmaz, tekrar çalıştırmak no-op olur.
-- - UPDATE'ten önce ve sonra etkilenecek/etkilenen kayıtlar NOTICE ile raporlanır.

DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'is_talepleri tablosu bulunamadı';
    END IF;
END $$;

-- ============================================================
-- 1. ETKİLENECEK KAYITLARI ÖNCEDEN RAPORLA (UPDATE öncesi görünürlük)
-- ============================================================
DO $$
DECLARE
    r RECORD;
    toplam int := 0;
BEGIN
    FOR r IN
        SELECT
            id, baslik, yayinlanma_tarihi,
            CASE WHEN yayinlanma_tarihi IS NOT NULL THEN 'teklif_bekliyor' ELSE 'taslak' END AS yeni_durum
        FROM public.is_talepleri
        WHERE durum = 'beklemede'
    LOOP
        toplam := toplam + 1;
        RAISE NOTICE '[035] id=% baslik=% yayinlanma_tarihi=% => yeni_durum=%',
            r.id, r.baslik, r.yayinlanma_tarihi, r.yeni_durum;
    END LOOP;

    IF toplam = 0 THEN
        RAISE NOTICE '[035] durum = ''beklemede'' olan kayıt bulunamadı (zaten normalize edilmiş veya hiç oluşmamış). No-op.';
    ELSE
        RAISE NOTICE '[035] Toplam % kayıt etkilenecek.', toplam;
    END IF;
END $$;

-- ============================================================
-- 2. YALNIZCA 'beklemede' DEĞERİNİ HEDEFLEYEN NORMALİZASYON
-- ============================================================
UPDATE public.is_talepleri
SET durum = CASE
        WHEN yayinlanma_tarihi IS NOT NULL THEN 'teklif_bekliyor'
        ELSE 'taslak'
    END
WHERE durum = 'beklemede';

-- ============================================================
-- 3. SONUÇ DOĞRULAMASI — artık 'beklemede' kalmadığını teyit et
-- ============================================================
DO $$
DECLARE
    kalan int;
BEGIN
    SELECT COUNT(*) INTO kalan FROM public.is_talepleri WHERE durum = 'beklemede';
    IF kalan = 0 THEN
        RAISE NOTICE '[035] Doğrulama OK: durum = ''beklemede'' olan kayıt kalmadı.';
    ELSE
        RAISE WARNING '[035] Doğrulama BAŞARISIZ: hâlâ % kayıt durum = ''beklemede''.', kalan;
    END IF;
END $$;

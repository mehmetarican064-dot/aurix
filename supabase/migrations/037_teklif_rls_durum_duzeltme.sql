-- AURIX 037 — teklifler INSERT RLS: eski durum='Acik' düzeltmesi
-- Idempotent. Yalnızca "teklifler_auth_insert_owner" policy'sini DROP+CREATE eder.
-- Veri değişikliği yok, DROP TABLE yok.
--
-- Bu dosya = supabase/maintenance/apply_037_teklif_rls_durum_duzeltme.sql
-- SQL Editor'da YALNIZCA BİRİNİ çalıştırın (036 sonrası).
--
-- KESİN NEDEN:
-- 013_admin_panel.sql (satır 898), "teklifler_auth_insert_owner" INSERT
-- policy'sinde iş talebinin açık olup olmadığını "i.durum = 'Acik'" ile
-- kontrol ediyordu. 034/035 migration'ları ile is_talepleri.durum standart
-- enum'a geçti; yayınlanmış bir kaydın gerçek değeri artık 'teklif_bekliyor'.
-- Bu nedenle "Teklif Ver" akışı aktif edilse bile INSERT, RLS tarafından
-- HER ZAMAN reddedilirdi (WITH CHECK hiçbir zaman 'Acik' bulamaz).
--
-- Bu migration SADECE bu policy'yi günceller; teklifler tablosundaki başka
-- hiçbir policy/GRANT/veriye dokunmaz.

DO $$
BEGIN
    IF to_regclass('public.teklifler') IS NULL THEN
        RAISE EXCEPTION 'teklifler tablosu bulunamadı';
    END IF;
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'is_talepleri tablosu bulunamadı';
    END IF;
    IF to_regclass('public.firmalar') IS NULL THEN
        RAISE EXCEPTION 'firmalar tablosu bulunamadı';
    END IF;
END $$;

DROP POLICY IF EXISTS "teklifler_auth_insert_owner" ON public.teklifler;

DO $$
DECLARE
    has_user_id boolean;
    has_owner_id boolean;
    has_is_seed_f boolean;
    has_is_seed_i boolean;
    has_yayinlanma boolean;
    firma_ok text;
    is_ok text;
    check_expr text;
BEGIN
    has_user_id := public._aurix_col_exists('firmalar', 'user_id');
    has_owner_id := public._aurix_col_exists('firmalar', 'owner_id');
    has_is_seed_f := public._aurix_col_exists('firmalar', 'is_seed');
    has_is_seed_i := public._aurix_col_exists('is_talepleri', 'is_seed');
    has_yayinlanma := public._aurix_col_exists('is_talepleri', 'yayinlanma_tarihi');

    IF has_user_id AND has_owner_id THEN
        firma_ok := '(f.user_id = auth.uid() OR f.owner_id = auth.uid())';
    ELSIF has_user_id THEN
        firma_ok := 'f.user_id = auth.uid()';
    ELSE
        firma_ok := 'f.owner_id = auth.uid()';
    END IF;

    firma_ok := firma_ok ||
        ' AND f.dogrulanmis IS TRUE AND f.durum = ''onaylandi''' ||
        ' AND COALESCE(f.askiya_alindi, FALSE) IS FALSE';
    IF has_is_seed_f THEN
        firma_ok := firma_ok || ' AND COALESCE(f.is_seed, FALSE) IS FALSE';
    END IF;

    -- KRİTİK DÜZELTME: 'Acik' (eski/legacy) yerine güncel standart 'teklif_bekliyor'.
    -- Ayrıca 032/034 yayınlama akışı ile tutarlı olması için yayinlanma_tarihi
    -- NOT NULL şartı da eklendi (henüz gerçekten yayınlanmamış bir kayda teklif
    -- verilemesin).
    is_ok := 'i.durum = ''teklif_bekliyor'' AND COALESCE(i.moderasyon_durumu, ''aktif'') = ''aktif''';
    IF has_yayinlanma THEN
        is_ok := is_ok || ' AND i.yayinlanma_tarihi IS NOT NULL';
    END IF;
    IF has_is_seed_i THEN
        is_ok := is_ok || ' AND COALESCE(i.is_seed, FALSE) IS FALSE';
    END IF;

    check_expr := format(
        'fiyat > 0 AND termin_gun > 0
         AND EXISTS (SELECT 1 FROM public.firmalar f WHERE f.id = firma_id AND %s)
         AND EXISTS (SELECT 1 FROM public.is_talepleri i WHERE i.id = is_id AND %s)',
        firma_ok, is_ok
    );

    EXECUTE format(
        'CREATE POLICY "teklifler_auth_insert_owner"
            ON public.teklifler FOR INSERT TO authenticated
            WITH CHECK (%s)',
        check_expr
    );

    RAISE NOTICE '[037] teklifler_auth_insert_owner güncellendi: durum=''teklif_bekliyor'' (%), is_ok=%',
        CASE WHEN has_yayinlanma THEN '+ yayinlanma_tarihi kontrolü' ELSE 'yayinlanma_tarihi kolonu yok, atlandı' END,
        is_ok;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'teklifler'
          AND policyname = 'teklifler_auth_insert_owner'
          AND with_check LIKE '%teklif_bekliyor%'
    ) THEN
        RAISE NOTICE '[037] Doğrulama OK: teklifler_auth_insert_owner artık ''teklif_bekliyor'' kontrol ediyor.';
    ELSE
        RAISE WARNING '[037] Doğrulama BAŞARISIZ: policy güncellenemedi veya beklenmeyen içerikte.';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '[037] tamam: teklifler INSERT RLS''i güncel is_talepleri.durum standardıyla uyumlu hale getirildi.';
END $$;

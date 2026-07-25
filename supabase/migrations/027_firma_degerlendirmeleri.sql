-- AURIX 027 — Firma değerlendirmeleri (iş emri altyapısına hazır)
-- Idempotent. DROP TABLE yok.
-- is_emri / is_emirleri tablosu YOKSA foreign key eklenmez (migration kırılmaz).
--
-- Bu dosya = supabase/maintenance/apply_027_firma_degerlendirmeleri.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın (026 sonrası önerilir).

-- ============================================================
-- 1. Tablo
-- ============================================================
DO $$
DECLARE
    firma_id_type text;
BEGIN
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO firma_id_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'firmalar'
      AND a.attname = 'id' AND NOT a.attisdropped;

    IF firma_id_type IS NULL THEN
        RAISE EXCEPTION 'firmalar.id bulunamadı';
    END IF;

    IF to_regclass('public.firma_degerlendirmeleri') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.firma_degerlendirmeleri (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                is_emri_id UUID NOT NULL,
                degerlendiren_firma_id %s REFERENCES public.firmalar (id) ON DELETE SET NULL,
                degerlendirilen_firma_id %s NOT NULL REFERENCES public.firmalar (id) ON DELETE CASCADE,
                degerlendiren_kullanici_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                iscilik_kalitesi SMALLINT NOT NULL
                    CHECK (iscilik_kalitesi BETWEEN 1 AND 5),
                termin_uyumu SMALLINT NOT NULL
                    CHECK (termin_uyumu BETWEEN 1 AND 5),
                iletisim SMALLINT NOT NULL
                    CHECK (iletisim BETWEEN 1 AND 5),
                is_tanimina_uygunluk SMALLINT NOT NULL
                    CHECK (is_tanimina_uygunluk BETWEEN 1 AND 5),
                yeniden_calisir BOOLEAN,
                yorum TEXT
                    CHECK (yorum IS NULL OR char_length(yorum) <= 500),
                durum TEXT NOT NULL DEFAULT 'yayinda'
                    CHECK (durum IN ('yayinda', 'gizli', 'itiraz', 'kaldirildi')),
                olusturulma_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                guncellenme_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT firma_degerlendirme_unique_is_kullanici
                    UNIQUE (is_emri_id, degerlendiren_kullanici_id),
                CONSTRAINT firma_degerlendirme_kendini_yargilama
                    CHECK (
                        degerlendiren_firma_id IS NULL
                        OR degerlendiren_firma_id IS DISTINCT FROM degerlendirilen_firma_id
                    )
            )
        $sql$, firma_id_type, firma_id_type);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fdg_degerlenen
    ON public.firma_degerlendirmeleri (degerlendirilen_firma_id, durum, olusturulma_tarihi DESC);
CREATE INDEX IF NOT EXISTS idx_fdg_is_emri
    ON public.firma_degerlendirmeleri (is_emri_id);

-- İş emri tablosu hazırsa FK ekle (yoksa atla)
DO $$
BEGIN
    IF to_regclass('public.is_emirleri') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'firma_degerlendirmeleri_is_emri_fk'
             AND conrelid = 'public.firma_degerlendirmeleri'::regclass
       ) THEN
        ALTER TABLE public.firma_degerlendirmeleri
            ADD CONSTRAINT firma_degerlendirmeleri_is_emri_fk
            FOREIGN KEY (is_emri_id) REFERENCES public.is_emirleri (id) ON DELETE CASCADE;
    ELSIF to_regclass('public.is_emri') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'firma_degerlendirmeleri_is_emri_fk'
             AND conrelid = 'public.firma_degerlendirmeleri'::regclass
       ) THEN
        ALTER TABLE public.firma_degerlendirmeleri
            ADD CONSTRAINT firma_degerlendirmeleri_is_emri_fk
            FOREIGN KEY (is_emri_id) REFERENCES public.is_emri (id) ON DELETE CASCADE;
    ELSE
        RAISE NOTICE 'is_emri tablosu yok — is_emri_id FK atlandı (iş emri migration sonrası eklenebilir).';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'is_emri FK eklenemedi: %', SQLERRM;
END $$;

COMMENT ON TABLE public.firma_degerlendirmeleri IS
    'AURIX tamamlanmış işlem değerlendirmeleri. is_emri FK iş emri tablosu gelince bağlanır.';

-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE public.firma_degerlendirmeleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fdg_select_yayinda" ON public.firma_degerlendirmeleri;
CREATE POLICY "fdg_select_yayinda"
    ON public.firma_degerlendirmeleri FOR SELECT
    TO anon, authenticated
    USING (
        durum = 'yayinda'
        OR (auth.uid() IS NOT NULL AND degerlendiren_kullanici_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "fdg_insert_own" ON public.firma_degerlendirmeleri;
CREATE POLICY "fdg_insert_own"
    ON public.firma_degerlendirmeleri FOR INSERT
    TO authenticated
    WITH CHECK (
        degerlendiren_kullanici_id = auth.uid()
        AND (
            degerlendiren_firma_id IS NULL
            OR degerlendiren_firma_id IS DISTINCT FROM degerlendirilen_firma_id
        )
        /* İş emri tarafı kontrolü: iş emri tablosu gelince RPC ile sıkılaştırılacak */
    );

-- Normal kullanıcı UPDATE/DELETE yok
DROP POLICY IF EXISTS "fdg_update_admin" ON public.firma_degerlendirmeleri;
CREATE POLICY "fdg_update_admin"
    ON public.firma_degerlendirmeleri FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.firma_degerlendirmeleri FROM PUBLIC;
GRANT SELECT ON TABLE public.firma_degerlendirmeleri TO anon, authenticated;
GRANT INSERT ON TABLE public.firma_degerlendirmeleri TO authenticated;
GRANT UPDATE ON TABLE public.firma_degerlendirmeleri TO authenticated;

-- ============================================================
-- 3. Aggregate RPC (ham PII sızdırmaz)
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_degerlendirme_ozet(p_firma_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    toplam int := 0;
    genel numeric(4,2);
    yeniden_pct numeric(5,2);
    kat jsonb;
    dagilim jsonb;
    yorumlar jsonb;
    tamamlanan int;
    zamaninda_pct numeric(5,2);
BEGIN
    SELECT COUNT(*)::int,
           ROUND(AVG(
               (iscilik_kalitesi + termin_uyumu + iletisim + is_tanimina_uygunluk)::numeric / 4
           ), 1),
           ROUND(
               100.0 * COUNT(*) FILTER (WHERE yeniden_calisir IS TRUE)
               / NULLIF(COUNT(*) FILTER (WHERE yeniden_calisir IS NOT NULL), 0),
               0
           )
    INTO toplam, genel, yeniden_pct
    FROM public.firma_degerlendirmeleri
    WHERE degerlendirilen_firma_id::text = p_firma_id
      AND durum = 'yayinda';

    IF toplam = 0 THEN
        RETURN jsonb_build_object(
            'ok', true,
            'ozet', jsonb_build_object(
                'genel_puan', NULL,
                'degerlendirme_sayisi', 0,
                'tamamlanan_is', NULL,
                'zamaninda_teslim_orani', NULL,
                'yeniden_calisma_orani', NULL,
                'kategori', NULL,
                'yildiz_dagilim', jsonb_build_object('5',0,'4',0,'3',0,'2',0,'1',0)
            ),
            'yorumlar', '[]'::jsonb
        );
    END IF;

    SELECT jsonb_build_object(
        'iscilik_kalitesi', ROUND(AVG(iscilik_kalitesi)::numeric, 1),
        'termin_uyumu', ROUND(AVG(termin_uyumu)::numeric, 1),
        'iletisim', ROUND(AVG(iletisim)::numeric, 1),
        'is_tanimina_uygunluk', ROUND(AVG(is_tanimina_uygunluk)::numeric, 1)
    ) INTO kat
    FROM public.firma_degerlendirmeleri
    WHERE degerlendirilen_firma_id::text = p_firma_id AND durum = 'yayinda';

    SELECT jsonb_build_object(
        '5', COUNT(*) FILTER (WHERE ROUND((iscilik_kalitesi+termin_uyumu+iletisim+is_tanimina_uygunluk)/4.0) = 5),
        '4', COUNT(*) FILTER (WHERE ROUND((iscilik_kalitesi+termin_uyumu+iletisim+is_tanimina_uygunluk)/4.0) = 4),
        '3', COUNT(*) FILTER (WHERE ROUND((iscilik_kalitesi+termin_uyumu+iletisim+is_tanimina_uygunluk)/4.0) = 3),
        '2', COUNT(*) FILTER (WHERE ROUND((iscilik_kalitesi+termin_uyumu+iletisim+is_tanimina_uygunluk)/4.0) = 2),
        '1', COUNT(*) FILTER (WHERE ROUND((iscilik_kalitesi+termin_uyumu+iletisim+is_tanimina_uygunluk)/4.0) = 1)
    ) INTO dagilim
    FROM public.firma_degerlendirmeleri
    WHERE degerlendirilen_firma_id::text = p_firma_id AND durum = 'yayinda';

    /* Zamanında teslim / tamamlanan iş: iş emri tablosu yokken NULL bırak */
    tamamlanan := NULL;
    zamaninda_pct := NULL;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'ad_kisa', 'K***',
        'bas_harf', 'K',
        'puan', d.puan,
        'tarih', d.tarih,
        'kategori', NULL,
        'sehir', NULL,
        'yorum', d.yorum,
        'yeniden_calisir', d.yeniden_calisir
    )), '[]'::jsonb)
    INTO yorumlar
    FROM (
        SELECT
            x.id,
            ROUND(
                (x.iscilik_kalitesi + x.termin_uyumu + x.iletisim + x.is_tanimina_uygunluk)::numeric / 4, 1
            ) AS puan,
            x.olusturulma_tarihi::date AS tarih,
            x.yorum,
            x.yeniden_calisir
        FROM public.firma_degerlendirmeleri x
        WHERE x.degerlendirilen_firma_id::text = p_firma_id
          AND x.durum = 'yayinda'
        ORDER BY x.olusturulma_tarihi DESC
        LIMIT 50
    ) d;

    RETURN jsonb_build_object(
        'ok', true,
        'ozet', jsonb_build_object(
            'genel_puan', genel,
            'degerlendirme_sayisi', toplam,
            'tamamlanan_is', tamamlanan,
            'zamaninda_teslim_orani', zamaninda_pct,
            'yeniden_calisma_orani', yeniden_pct,
            'kategori', kat,
            'yildiz_dagilim', dagilim
        ),
        'yorumlar', yorumlar
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_degerlendirme_ozet(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_degerlendirme_ozet(text) TO anon, authenticated;

COMMENT ON FUNCTION public.firma_degerlendirme_ozet(text) IS
    'Yayındaki değerlendirme özeti. E-posta/telefon/tutar dönmez. Ad kısaltması ileride zenginleştirilir.';

NOTIFY pgrst, 'reload schema';

-- AURIX 025 — Firma Güven Doğrulama (KYC / belge) modülü
-- Idempotent. DROP TABLE / TRUNCATE yok. Auth / Site URL’ye dokunulmaz.
--
-- AYIRIM:
--   durum / dogrulanmis / yayin_durumu  → yayın / liste onayı (022–023, değişmez)
--   guven_dogrulama_*                   → belge tabanlı güven rozeti (bu migration)
--
-- Bu dosya = supabase/maintenance/apply_025_firma_guven_dogrulama.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın.

-- ============================================================
-- 0. Yardımcılar
-- ============================================================
CREATE OR REPLACE FUNCTION public._aurix_col_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = p_table
          AND column_name = p_column
    );
$$;

-- ============================================================
-- 1. firmalar — güven doğrulama özet kolonları (+ mersis)
-- ============================================================
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS mersis_no TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS guven_dogrulama_durumu TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS guven_dogrulama_tarihi TIMESTAMPTZ;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS guven_sonraki_kontrol TIMESTAMPTZ;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS guven_kullanici_aciklama TEXT;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS guven_yenileme_ay INTEGER DEFAULT 12;
ALTER TABLE public.firmalar ADD COLUMN IF NOT EXISTS telefon_dogrulama_durumu TEXT DEFAULT 'bekliyor';

UPDATE public.firmalar
SET guven_dogrulama_durumu = 'yok'
WHERE guven_dogrulama_durumu IS NULL OR btrim(guven_dogrulama_durumu) = '';

UPDATE public.firmalar
SET telefon_dogrulama_durumu = 'bekliyor'
WHERE telefon_dogrulama_durumu IS NULL OR btrim(telefon_dogrulama_durumu) = '';

DO $$
BEGIN
    BEGIN
        ALTER TABLE public.firmalar
            ALTER COLUMN guven_dogrulama_durumu SET DEFAULT 'yok';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER TABLE public.firmalar
            ALTER COLUMN guven_dogrulama_durumu SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'firmalar_guven_dogrulama_durumu_check'
          AND conrelid = 'public.firmalar'::regclass
    ) THEN
        ALTER TABLE public.firmalar DROP CONSTRAINT firmalar_guven_dogrulama_durumu_check;
    END IF;
    ALTER TABLE public.firmalar
        ADD CONSTRAINT firmalar_guven_dogrulama_durumu_check
        CHECK (guven_dogrulama_durumu IN (
            'yok', 'taslak', 'incelemede', 'ek_belge_gerekli', 'dogrulandi',
            'reddedildi', 'suresi_doldu', 'askiya_alindi', 'kalici_kapatildi',
            'yenileme_gerekli'
        ));
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'firmalar_telefon_dogrulama_durumu_check'
          AND conrelid = 'public.firmalar'::regclass
    ) THEN
        ALTER TABLE public.firmalar DROP CONSTRAINT firmalar_telefon_dogrulama_durumu_check;
    END IF;
    ALTER TABLE public.firmalar
        ADD CONSTRAINT firmalar_telefon_dogrulama_durumu_check
        CHECK (telefon_dogrulama_durumu IN ('bekliyor', 'dogrulandi', 'basarisiz', 'yok'));
END $$;

-- Public SELECT: yalnızca rozet özeti (hassas yok)
DO $$
BEGIN
    IF public._aurix_col_exists('firmalar', 'guven_dogrulama_durumu') THEN
        EXECUTE 'GRANT SELECT (guven_dogrulama_durumu, guven_dogrulama_tarihi) ON TABLE public.firmalar TO anon, authenticated';
    END IF;
    IF public._aurix_col_exists('firmalar', 'mersis_no') THEN
        EXECUTE 'GRANT SELECT (mersis_no) ON TABLE public.firmalar TO authenticated';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'guven kolon grant: %', SQLERRM;
END $$;

-- ============================================================
-- 2. Yönetilebilir içerik (KVKK / saklama metinleri — garanti metni yok)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aurix_icerik (
    anahtar TEXT PRIMARY KEY,
    baslik TEXT,
    govde TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.aurix_icerik ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aurix_icerik_public_read" ON public.aurix_icerik;
CREATE POLICY "aurix_icerik_public_read"
    ON public.aurix_icerik FOR SELECT
    TO anon, authenticated
    USING (true);

INSERT INTO public.aurix_icerik (anahtar, baslik, govde) VALUES
(
    'kvkk_aydinlatma_dogrulama',
    'KVKK Aydınlatma Metni — Firma Doğrulama',
    'AURIX, firma doğrulama başvurusu kapsamında kimlik ve işletme belgelerini; başvurunun incelenmesi, risk değerlendirmesi ve güven rozeti süreçleri için işler. Detaylı metin yönetici tarafından güncellenir.'
),
(
    'acik_riza_dogrulama',
    'Açık Rıza — Belge İnceleme',
    'Başvuru sahibi, yüklediği belgelerin AURIX yetkili personeli tarafından incelenmesine açık rıza verir. Bu rıza aydınlatma metninden ayrıdır.'
),
(
    'belge_saklama_politikasi',
    'Belge Saklama Politikası',
    'Yüklenen belgeler doğrulama ve uyuşmazlık süreçleri için saklanır. Reddedilen veya iptal edilen başvurularda saklama süresi ve silme tarihi kayıt altına alınabilir. Güncel süreler yönetici içeriklerinden okunur.'
),
(
    'rozet_aciklama',
    'Doğrulama Rozeti Açıklaması',
    'Firma kaydı ve başvuruda sunulan belgeler AURIX tarafından kontrol edilmiştir. Bu doğrulama, firmanın tüm işlemlerinin risksiz olduğu veya AURIX tarafından garanti edildiği anlamına gelmez.'
)
ON CONFLICT (anahtar) DO NOTHING;

GRANT SELECT ON TABLE public.aurix_icerik TO anon, authenticated;

-- ============================================================
-- 3. Başvuru + belge + risk + log tabloları
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

    IF to_regclass('public.firma_dogrulama_basvurulari') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.firma_dogrulama_basvurulari (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                firma_id %s NOT NULL REFERENCES public.firmalar (id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                durum TEXT NOT NULL DEFAULT 'taslak'
                    CHECK (durum IN (
                        'taslak', 'incelemede', 'ek_belge_gerekli', 'dogrulandi',
                        'reddedildi', 'suresi_doldu', 'askiya_alindi', 'kalici_kapatildi',
                        'yenileme_gerekli'
                    )),
                sahip_beyani BOOLEAN NOT NULL DEFAULT FALSE,
                kvkk_aydinlatma_okundu BOOLEAN NOT NULL DEFAULT FALSE,
                acik_riza BOOLEAN NOT NULL DEFAULT FALSE,
                kullanici_aciklama TEXT,
                admin_aciklama TEXT,
                admin_ic_not TEXT,
                gerekce_kod TEXT,
                risk_skoru INTEGER NOT NULL DEFAULT 0,
                onceki_basvuru_id UUID,
                belge_saklama_silme_tarihi DATE,
                submitted_at TIMESTAMPTZ,
                decided_at TIMESTAMPTZ,
                decided_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
                dogrulama_tarihi TIMESTAMPTZ,
                sonraki_kontrol TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        $sql$, firma_id_type);
    END IF;

    IF to_regclass('public.firma_dogrulama_belgeler') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.firma_dogrulama_belgeler (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                basvuru_id UUID NOT NULL REFERENCES public.firma_dogrulama_basvurulari (id) ON DELETE CASCADE,
                firma_id %s NOT NULL REFERENCES public.firmalar (id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                belge_turu TEXT NOT NULL,
                belge_no TEXT,
                duzenlenme_tarihi DATE,
                gecerlilik_tarihi DATE,
                storage_path TEXT NOT NULL,
                mime_type TEXT,
                dosya_boyutu BIGINT,
                dosya_hash TEXT,
                orijinal_ad TEXT,
                admin_durum TEXT NOT NULL DEFAULT 'beklemede'
                    CHECK (admin_durum IN ('beklemede', 'uygun', 'uygunsuz', 'okunamadi')),
                admin_not TEXT,
                arsiv_path TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        $sql$, firma_id_type);
    END IF;

    IF to_regclass('public.firma_dogrulama_riskler') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.firma_dogrulama_riskler (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                basvuru_id UUID REFERENCES public.firma_dogrulama_basvurulari (id) ON DELETE CASCADE,
                firma_id %s NOT NULL REFERENCES public.firmalar (id) ON DELETE CASCADE,
                risk_kod TEXT NOT NULL,
                seviye TEXT NOT NULL DEFAULT 'orta'
                    CHECK (seviye IN ('dusuk', 'orta', 'yuksek', 'kritik')),
                mesaj TEXT NOT NULL,
                detay JSONB NOT NULL DEFAULT '{}'::jsonb,
                otomatik BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        $sql$, firma_id_type);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.firma_dogrulama_loglari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    basvuru_id UUID REFERENCES public.firma_dogrulama_basvurulari (id) ON DELETE SET NULL,
    firma_id TEXT,
    admin_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    islem TEXT NOT NULL,
    eski_durum TEXT,
    yeni_durum TEXT,
    gerekce TEXT,
    gerekce_kod TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fd_basvuru_firma ON public.firma_dogrulama_basvurulari (firma_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fd_basvuru_durum ON public.firma_dogrulama_basvurulari (durum);
CREATE INDEX IF NOT EXISTS idx_fd_belge_basvuru ON public.firma_dogrulama_belgeler (basvuru_id);
CREATE INDEX IF NOT EXISTS idx_fd_belge_hash ON public.firma_dogrulama_belgeler (dosya_hash)
    WHERE dosya_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fd_risk_basvuru ON public.firma_dogrulama_riskler (basvuru_id);
CREATE INDEX IF NOT EXISTS idx_fd_log_created ON public.firma_dogrulama_loglari (created_at DESC);

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public.firma_dogrulama_basvurulari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firma_dogrulama_belgeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firma_dogrulama_riskler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firma_dogrulama_loglari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fd_basvuru_select_own" ON public.firma_dogrulama_basvurulari;
CREATE POLICY "fd_basvuru_select_own"
    ON public.firma_dogrulama_basvurulari FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fd_basvuru_insert_own" ON public.firma_dogrulama_basvurulari;
CREATE POLICY "fd_basvuru_insert_own"
    ON public.firma_dogrulama_basvurulari FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fd_basvuru_update_own_draft" ON public.firma_dogrulama_basvurulari;
CREATE POLICY "fd_basvuru_update_own_draft"
    ON public.firma_dogrulama_basvurulari FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()
        AND durum IN ('taslak', 'ek_belge_gerekli', 'yenileme_gerekli')
    )
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fd_belge_select_own" ON public.firma_dogrulama_belgeler;
CREATE POLICY "fd_belge_select_own"
    ON public.firma_dogrulama_belgeler FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fd_belge_insert_own" ON public.firma_dogrulama_belgeler;
CREATE POLICY "fd_belge_insert_own"
    ON public.firma_dogrulama_belgeler FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fd_belge_update_own" ON public.firma_dogrulama_belgeler;
CREATE POLICY "fd_belge_update_own"
    ON public.firma_dogrulama_belgeler FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "fd_risk_select" ON public.firma_dogrulama_riskler;
CREATE POLICY "fd_risk_select"
    ON public.firma_dogrulama_riskler FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.firma_dogrulama_basvurulari b
            WHERE b.id = basvuru_id AND b.user_id = auth.uid()
        )
    );

-- Log: yalnız admin SELECT; INSERT SECURITY DEFINER
DROP POLICY IF EXISTS "fd_log_select_admin" ON public.firma_dogrulama_loglari;
CREATE POLICY "fd_log_select_admin"
    ON public.firma_dogrulama_loglari FOR SELECT TO authenticated
    USING (public.is_admin());

REVOKE ALL ON TABLE public.firma_dogrulama_basvurulari FROM anon;
REVOKE ALL ON TABLE public.firma_dogrulama_belgeler FROM anon;
REVOKE ALL ON TABLE public.firma_dogrulama_riskler FROM anon;
REVOKE ALL ON TABLE public.firma_dogrulama_loglari FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.firma_dogrulama_basvurulari TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.firma_dogrulama_belgeler TO authenticated;
GRANT SELECT ON TABLE public.firma_dogrulama_riskler TO authenticated;
GRANT SELECT ON TABLE public.firma_dogrulama_loglari TO authenticated;

-- Risk satırlarında kullanıcıya admin_ic_not sızıntısı yok (ayrı kolon yok);
-- basvuru SELECT’te admin_ic_not admin dışı için RPC ile maskelenir.

-- ============================================================
-- 5. Private storage bucket: firma-belgeler
-- ============================================================
DO $$
BEGIN
    IF to_regclass('storage.buckets') IS NULL THEN
        RAISE NOTICE 'storage.buckets yok; firma-belgeler atlandı.';
        RETURN;
    END IF;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'firma-belgeler',
        'firma-belgeler',
        false,
        10485760,
        ARRAY[
            'application/pdf',
            'image/jpeg', 'image/png', 'image/webp'
        ]
    )
    ON CONFLICT (id) DO UPDATE SET
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'firma-belgeler bucket: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RETURN;
    END IF;

    DROP POLICY IF EXISTS "firma_belgeler_no_public" ON storage.objects;
    DROP POLICY IF EXISTS "firma_belgeler_owner_insert" ON storage.objects;
    DROP POLICY IF EXISTS "firma_belgeler_owner_select" ON storage.objects;
    DROP POLICY IF EXISTS "firma_belgeler_owner_update" ON storage.objects;
    DROP POLICY IF EXISTS "firma_belgeler_owner_delete" ON storage.objects;
    DROP POLICY IF EXISTS "firma_belgeler_admin_select" ON storage.objects;

    -- Public/anon SELECT YOK
    CREATE POLICY "firma_belgeler_owner_insert"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'firma-belgeler'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );

    CREATE POLICY "firma_belgeler_owner_select"
        ON storage.objects FOR SELECT TO authenticated
        USING (
            bucket_id = 'firma-belgeler'
            AND (
                (storage.foldername(name))[1] = auth.uid()::text
                OR public.is_admin()
            )
        );

    CREATE POLICY "firma_belgeler_owner_update"
        ON storage.objects FOR UPDATE TO authenticated
        USING (
            bucket_id = 'firma-belgeler'
            AND (storage.foldername(name))[1] = auth.uid()::text
        )
        WITH CHECK (
            bucket_id = 'firma-belgeler'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );

    CREATE POLICY "firma_belgeler_owner_delete"
        ON storage.objects FOR DELETE TO authenticated
        USING (
            bucket_id = 'firma-belgeler'
            AND (
                (storage.foldername(name))[1] = auth.uid()::text
                OR public.is_admin()
            )
        );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'firma-belgeler storage policy: %', SQLERRM;
END $$;

-- ============================================================
-- 6. Yardimci RPC: log + risk
-- ============================================================
CREATE OR REPLACE FUNCTION public._fd_log(
    p_basvuru_id uuid,
    p_firma_id text,
    p_islem text,
    p_eski_durum text DEFAULT NULL,
    p_yeni_durum text DEFAULT NULL,
    p_gerekce text DEFAULT NULL,
    p_gerekce_kod text DEFAULT NULL,
    p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
BEGIN
    INSERT INTO public.firma_dogrulama_loglari (
        basvuru_id, firma_id, admin_id, islem,
        eski_durum, yeni_durum, gerekce, gerekce_kod, meta
    ) VALUES (
        p_basvuru_id,
        p_firma_id,
        auth.uid(),
        p_islem,
        p_eski_durum,
        p_yeni_durum,
        p_gerekce,
        p_gerekce_kod,
        COALESCE(p_meta, '{}'::jsonb)
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public._fd_log(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fd_risk_tara(p_basvuru_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    f public.firmalar%ROWTYPE;
    skor integer := 0;
    dup_count integer;
    belge_count integer;
BEGIN
    SELECT * INTO b FROM public.firma_dogrulama_basvurulari WHERE id = p_basvuru_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    SELECT * INTO f FROM public.firmalar WHERE id = b.firma_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    DELETE FROM public.firma_dogrulama_riskler
    WHERE basvuru_id = p_basvuru_id AND otomatik = TRUE;

    IF f.vergi_no IS NULL OR btrim(f.vergi_no) = '' THEN
        INSERT INTO public.firma_dogrulama_riskler (basvuru_id, firma_id, risk_kod, seviye, mesaj)
        VALUES (p_basvuru_id, b.firma_id, 'vergi_no_eksik', 'yuksek', 'Vergi numarasi eksik.');
        skor := skor + 25;
    END IF;

    IF f.mersis_no IS NULL OR btrim(f.mersis_no) = '' THEN
        INSERT INTO public.firma_dogrulama_riskler (basvuru_id, firma_id, risk_kod, seviye, mesaj)
        VALUES (p_basvuru_id, b.firma_id, 'mersis_eksik', 'orta', 'MERSIS numarasi eksik.');
        skor := skor + 10;
    END IF;

    IF f.vergi_no IS NOT NULL AND btrim(f.vergi_no) <> '' THEN
        SELECT count(*)::integer INTO dup_count
        FROM public.firmalar x
        WHERE x.id <> f.id
          AND btrim(COALESCE(x.vergi_no, '')) = btrim(f.vergi_no)
          AND btrim(f.vergi_no) <> '';
        IF dup_count > 0 THEN
            INSERT INTO public.firma_dogrulama_riskler (basvuru_id, firma_id, risk_kod, seviye, mesaj, detay)
            VALUES (
                p_basvuru_id, b.firma_id, 'vergi_no_cift', 'kritik',
                'Ayni vergi numarasi baska firmada kayitli.',
                jsonb_build_object('adet', dup_count)
            );
            skor := skor + 40;
        END IF;
    END IF;

    SELECT count(*)::integer INTO belge_count
    FROM public.firma_dogrulama_belgeler
    WHERE basvuru_id = p_basvuru_id;

    IF belge_count = 0 THEN
        INSERT INTO public.firma_dogrulama_riskler (basvuru_id, firma_id, risk_kod, seviye, mesaj)
        VALUES (p_basvuru_id, b.firma_id, 'belge_yok', 'yuksek', 'Henuz belge yuklenmedi.');
        skor := skor + 30;
    END IF;

    IF NOT b.sahip_beyani OR NOT b.kvkk_aydinlatma_okundu OR NOT b.acik_riza THEN
        INSERT INTO public.firma_dogrulama_riskler (basvuru_id, firma_id, risk_kod, seviye, mesaj)
        VALUES (p_basvuru_id, b.firma_id, 'onay_eksik', 'yuksek', 'Beyan / KVKK / acik riza tamamlanmadi.');
        skor := skor + 20;
    END IF;

    UPDATE public.firma_dogrulama_basvurulari
    SET risk_skoru = skor, updated_at = NOW()
    WHERE id = p_basvuru_id;

    RETURN skor;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fd_risk_tara(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fd_risk_tara(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.firma_dogrulama_ozet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    uid uuid := auth.uid();
    f public.firmalar%ROWTYPE;
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    admin_mode boolean := public.is_admin();
    has_owner boolean := public._aurix_col_exists('firmalar', 'owner_id');
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    IF has_owner THEN
        SELECT * INTO f
        FROM public.firmalar
        WHERE user_id = uid OR owner_id = uid
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1;
    ELSE
        SELECT * INTO f
        FROM public.firmalar
        WHERE user_id = uid
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'firma', NULL, 'basvuru', NULL);
    END IF;

    SELECT * INTO b
    FROM public.firma_dogrulama_basvurulari
    WHERE firma_id = f.id
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'ok', true,
        'firma', jsonb_build_object(
            'id', f.id,
            'guven_dogrulama_durumu', f.guven_dogrulama_durumu,
            'guven_dogrulama_tarihi', f.guven_dogrulama_tarihi,
            'guven_sonraki_kontrol', f.guven_sonraki_kontrol,
            'guven_kullanici_aciklama', f.guven_kullanici_aciklama,
            'guven_yenileme_ay', f.guven_yenileme_ay,
            'telefon_dogrulama_durumu', f.telefon_dogrulama_durumu,
            'mersis_no', f.mersis_no
        ),
        'basvuru', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', b.id,
            'durum', b.durum,
            'risk_skoru', b.risk_skoru,
            'kullanici_aciklama', b.kullanici_aciklama,
            'admin_aciklama', b.admin_aciklama,
            'admin_ic_not', CASE WHEN admin_mode THEN b.admin_ic_not ELSE NULL END,
            'gerekce_kod', b.gerekce_kod,
            'submitted_at', b.submitted_at,
            'decided_at', b.decided_at,
            'dogrulama_tarihi', b.dogrulama_tarihi,
            'sonraki_kontrol', b.sonraki_kontrol,
            'created_at', b.created_at,
            'updated_at', b.updated_at
        ) END
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_ozet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_ozet() TO authenticated;

CREATE OR REPLACE FUNCTION public.firma_dogrulama_basvuru_hazirla(
    p_kullanici_aciklama text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    uid uuid := auth.uid();
    has_owner boolean := public._aurix_col_exists('firmalar', 'owner_id');
    f public.firmalar%ROWTYPE;
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    open_id uuid;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    IF has_owner THEN
        SELECT * INTO f
        FROM public.firmalar
        WHERE user_id = uid OR owner_id = uid
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1
        FOR UPDATE;
    ELSE
        SELECT * INTO f
        FROM public.firmalar
        WHERE user_id = uid
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO open_id
    FROM public.firma_dogrulama_basvurulari
    WHERE firma_id = f.id
      AND durum IN ('taslak', 'ek_belge_gerekli', 'yenileme_gerekli', 'incelemede')
    ORDER BY created_at DESC
    LIMIT 1;

    IF open_id IS NOT NULL THEN
        UPDATE public.firma_dogrulama_basvurulari
        SET
            kullanici_aciklama = COALESCE(p_kullanici_aciklama, kullanici_aciklama),
            updated_at = NOW()
        WHERE id = open_id
        RETURNING * INTO b;
    ELSE
        INSERT INTO public.firma_dogrulama_basvurulari (
            firma_id, user_id, durum, kullanici_aciklama
        ) VALUES (
            f.id, uid, 'taslak', p_kullanici_aciklama
        )
        RETURNING * INTO b;

        UPDATE public.firmalar
        SET guven_dogrulama_durumu = CASE
                WHEN guven_dogrulama_durumu IN ('yok', 'reddedildi', 'suresi_doldu') THEN 'taslak'
                ELSE guven_dogrulama_durumu
            END,
            updated_at = NOW()
        WHERE id = f.id;
    END IF;

    PERFORM public._fd_log(
        b.id, f.id::text, 'basvuru_hazirla', NULL, b.durum, NULL, NULL,
        jsonb_build_object('basvuru_id', b.id)
    );

    RETURN jsonb_build_object('ok', true, 'basvuru', to_jsonb(b));
END;
$fn$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_basvuru_hazirla(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_basvuru_hazirla(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.firma_dogrulama_basvuru_gonder(p_basvuru_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    uid uuid := auth.uid();
    has_owner boolean := public._aurix_col_exists('firmalar', 'owner_id');
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    eski text;
    skor integer;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO b
    FROM public.firma_dogrulama_basvurulari
    WHERE id = p_basvuru_id AND user_id = uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;

    IF b.durum NOT IN ('taslak', 'ek_belge_gerekli', 'yenileme_gerekli') THEN
        RAISE EXCEPTION 'basvuru_gonderilemez' USING ERRCODE = 'P0001';
    END IF;

    IF NOT b.sahip_beyani OR NOT b.kvkk_aydinlatma_okundu OR NOT b.acik_riza THEN
        RAISE EXCEPTION 'onay_eksik' USING ERRCODE = 'P0001';
    END IF;

    eski := b.durum;

    UPDATE public.firma_dogrulama_basvurulari
    SET durum = 'incelemede', submitted_at = NOW(), updated_at = NOW()
    WHERE id = b.id
    RETURNING * INTO b;

    UPDATE public.firmalar
    SET guven_dogrulama_durumu = 'incelemede', updated_at = NOW()
    WHERE id = b.firma_id;

    skor := public.fd_risk_tara(b.id);

    PERFORM public._fd_log(
        b.id, b.firma_id::text, 'basvuru_gonder', eski, b.durum, NULL, NULL,
        jsonb_build_object('risk_skoru', skor)
    );

    RETURN jsonb_build_object('ok', true, 'basvuru', to_jsonb(b), 'risk_skoru', skor);
END;
$fn$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_basvuru_gonder(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_basvuru_gonder(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.firma_dogrulama_belge_kaydet(
    p_basvuru_id uuid,
    p_belge_turu text,
    p_storage_path text,
    p_mime_type text DEFAULT NULL,
    p_dosya_boyutu bigint DEFAULT NULL,
    p_dosya_hash text DEFAULT NULL,
    p_orijinal_ad text DEFAULT NULL,
    p_belge_no text DEFAULT NULL,
    p_duzenlenme_tarihi date DEFAULT NULL,
    p_gecerlilik_tarihi date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, storage, pg_temp
AS $fn$
DECLARE
    uid uuid := auth.uid();
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    belge public.firma_dogrulama_belgeler%ROWTYPE;
    path text := btrim(COALESCE(p_storage_path, ''));
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF path = '' OR btrim(COALESCE(p_belge_turu, '')) = '' THEN
        RAISE EXCEPTION 'belge_gecersiz' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO b
    FROM public.firma_dogrulama_basvurulari
    WHERE id = p_basvuru_id AND user_id = uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;

    IF b.durum NOT IN ('taslak', 'ek_belge_gerekli', 'yenileme_gerekli') THEN
        RAISE EXCEPTION 'basvuru_kilitli' USING ERRCODE = 'P0001';
    END IF;

    IF (storage.foldername(path))[1] IS DISTINCT FROM uid::text THEN
        RAISE EXCEPTION 'belge_yolu_hatali' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.firma_dogrulama_belgeler (
        basvuru_id, firma_id, user_id, belge_turu, belge_no,
        duzenlenme_tarihi, gecerlilik_tarihi, storage_path,
        mime_type, dosya_boyutu, dosya_hash, orijinal_ad
    ) VALUES (
        b.id, b.firma_id, uid, btrim(p_belge_turu), nullif(btrim(COALESCE(p_belge_no, '')), ''),
        p_duzenlenme_tarihi, p_gecerlilik_tarihi, path,
        p_mime_type, p_dosya_boyutu, nullif(btrim(COALESCE(p_dosya_hash, '')), ''),
        nullif(btrim(COALESCE(p_orijinal_ad, '')), '')
    )
    RETURNING * INTO belge;

    PERFORM public._fd_log(
        b.id, b.firma_id::text, 'belge_kaydet', NULL, NULL, NULL, NULL,
        jsonb_build_object('belge_id', belge.id, 'belge_turu', belge.belge_turu)
    );

    RETURN jsonb_build_object('ok', true, 'belge', to_jsonb(belge));
END;
$fn$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_belge_kaydet(uuid, text, text, text, bigint, text, text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_belge_kaydet(uuid, text, text, text, bigint, text, text, text, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.firma_dogrulama_belge_imzali_url(
    p_belge_id uuid,
    p_saniye integer DEFAULT 3600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    uid uuid := auth.uid();
    belge public.firma_dogrulama_belgeler%ROWTYPE;
    ttl integer := GREATEST(60, LEAST(COALESCE(p_saniye, 3600), 86400));
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO belge FROM public.firma_dogrulama_belgeler WHERE id = p_belge_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'belge_yok' USING ERRCODE = 'P0002';
    END IF;

    IF belge.user_id <> uid AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'bucket', 'firma-belgeler',
        'path', belge.storage_path,
        'expires_in', ttl,
        'hint', 'Client SDK createSignedUrl ile imzalayin.'
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.firma_dogrulama_belge_imzali_url(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_dogrulama_belge_imzali_url(uuid, integer) TO authenticated;

-- ============================================================
-- 7. Admin RPC: liste / detay / karar
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_dogrulama_listesi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    items jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(row_data ORDER BY submitted_at DESC NULLS LAST, created_at DESC), '[]'::jsonb)
    INTO items
    FROM (
        SELECT jsonb_build_object(
            'id', b.id,
            'firma_id', b.firma_id,
            'firma_adi', f.firma_adi,
            'sehir', f.sehir,
            'durum', b.durum,
            'guven_dogrulama_durumu', f.guven_dogrulama_durumu,
            'risk_skoru', b.risk_skoru,
            'submitted_at', b.submitted_at,
            'decided_at', b.decided_at,
            'created_at', b.created_at,
            'user_id', b.user_id
        ) AS row_data,
        b.submitted_at,
        b.created_at
        FROM public.firma_dogrulama_basvurulari b
        JOIN public.firmalar f ON f.id = b.firma_id
        WHERE b.durum NOT IN ('taslak')
        ORDER BY b.submitted_at DESC NULLS LAST, b.created_at DESC
        LIMIT 500
    ) q;

    RETURN jsonb_build_object('ok', true, 'items', items);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_dogrulama_listesi() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dogrulama_listesi() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dogrulama_detay(p_basvuru_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    f public.firmalar%ROWTYPE;
    belgeler jsonb;
    riskler jsonb;
    loglar jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO b FROM public.firma_dogrulama_basvurulari WHERE id = p_basvuru_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO f FROM public.firmalar WHERE id = b.firma_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(bg) ORDER BY bg.created_at), '[]'::jsonb)
    INTO belgeler
    FROM public.firma_dogrulama_belgeler bg
    WHERE bg.basvuru_id = b.id;

    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO riskler
    FROM public.firma_dogrulama_riskler r
    WHERE r.basvuru_id = b.id;

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC), '[]'::jsonb)
    INTO loglar
    FROM public.firma_dogrulama_loglari l
    WHERE l.basvuru_id = b.id;

    RETURN jsonb_build_object(
        'ok', true,
        'basvuru', to_jsonb(b),
        'firma', to_jsonb(f),
        'belgeler', belgeler,
        'riskler', riskler,
        'loglar', loglar
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_dogrulama_detay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dogrulama_detay(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_dogrulama_karar(
    p_basvuru_id uuid,
    p_karar text,
    p_gerekce text,
    p_gerekce_kod text,
    p_ic_not text DEFAULT NULL,
    p_yenileme_ay integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    karar text := lower(btrim(COALESCE(p_karar, '')));
    gerekce text := btrim(COALESCE(p_gerekce, ''));
    b public.firma_dogrulama_basvurulari%ROWTYPE;
    f public.firmalar%ROWTYPE;
    eski_basvuru text;
    eski_guven text;
    yeni_basvuru text;
    yeni_guven text;
    yenileme integer;
    sonraki timestamptz;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF karar NOT IN (
        'dogrula', 'ek_belge', 'reddet', 'askiya_al',
        'dogrulamayi_kaldir', 'kalici_kapat'
    ) THEN
        RAISE EXCEPTION 'karar_gecersiz' USING ERRCODE = 'P0001';
    END IF;

    IF char_length(gerekce) < 3 THEN
        RAISE EXCEPTION 'gerekce_kisa' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO b
    FROM public.firma_dogrulama_basvurulari
    WHERE id = p_basvuru_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'basvuru_yok' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO f FROM public.firmalar WHERE id = b.firma_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;

    eski_basvuru := b.durum;
    eski_guven := f.guven_dogrulama_durumu;

    yeni_basvuru := CASE karar
        WHEN 'dogrula' THEN 'dogrulandi'
        WHEN 'ek_belge' THEN 'ek_belge_gerekli'
        WHEN 'reddet' THEN 'reddedildi'
        WHEN 'askiya_al' THEN 'askiya_alindi'
        WHEN 'dogrulamayi_kaldir' THEN 'reddedildi'
        WHEN 'kalici_kapat' THEN 'kalici_kapatildi'
    END;

    yeni_guven := CASE karar
        WHEN 'dogrula' THEN 'dogrulandi'
        WHEN 'ek_belge' THEN 'ek_belge_gerekli'
        WHEN 'reddet' THEN 'reddedildi'
        WHEN 'askiya_al' THEN 'askiya_alindi'
        WHEN 'dogrulamayi_kaldir' THEN 'yok'
        WHEN 'kalici_kapat' THEN 'kalici_kapatildi'
    END;

    yenileme := COALESCE(NULLIF(p_yenileme_ay, 0), f.guven_yenileme_ay, 12);
    sonraki := CASE WHEN karar = 'dogrula'
        THEN (NOW() + make_interval(months => yenileme))
        ELSE f.guven_sonraki_kontrol
    END;

    UPDATE public.firma_dogrulama_basvurulari
    SET
        durum = yeni_basvuru,
        admin_aciklama = gerekce,
        admin_ic_not = p_ic_not,
        gerekce_kod = nullif(btrim(COALESCE(p_gerekce_kod, '')), ''),
        decided_at = NOW(),
        decided_by = auth.uid(),
        dogrulama_tarihi = CASE WHEN karar = 'dogrula' THEN NOW() ELSE dogrulama_tarihi END,
        sonraki_kontrol = CASE WHEN karar = 'dogrula' THEN sonraki ELSE sonraki_kontrol END,
        updated_at = NOW()
    WHERE id = b.id
    RETURNING * INTO b;

    UPDATE public.firmalar
    SET
        guven_dogrulama_durumu = yeni_guven,
        guven_dogrulama_tarihi = CASE
            WHEN karar = 'dogrula' THEN NOW()
            WHEN karar = 'dogrulamayi_kaldir' THEN NULL
            ELSE guven_dogrulama_tarihi
        END,
        guven_sonraki_kontrol = CASE
            WHEN karar = 'dogrula' THEN sonraki
            WHEN karar IN ('dogrulamayi_kaldir', 'reddet', 'kalici_kapat') THEN NULL
            ELSE guven_sonraki_kontrol
        END,
        guven_yenileme_ay = CASE WHEN karar = 'dogrula' THEN yenileme ELSE guven_yenileme_ay END,
        guven_kullanici_aciklama = gerekce,
        updated_at = NOW()
    WHERE id = f.id
    RETURNING * INTO f;

    PERFORM public._fd_log(
        b.id,
        f.id::text,
        'admin_karar_' || karar,
        eski_basvuru,
        yeni_basvuru,
        gerekce,
        p_gerekce_kod,
        jsonb_build_object(
            'eski_guven', eski_guven,
            'yeni_guven', yeni_guven,
            'karar', karar,
            'yenileme_ay', CASE WHEN karar = 'dogrula' THEN yenileme ELSE NULL END
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'basvuru', to_jsonb(b),
        'firma', jsonb_build_object(
            'id', f.id,
            'guven_dogrulama_durumu', f.guven_dogrulama_durumu,
            'guven_dogrulama_tarihi', f.guven_dogrulama_tarihi,
            'guven_sonraki_kontrol', f.guven_sonraki_kontrol,
            'guven_yenileme_ay', f.guven_yenileme_ay,
            'guven_kullanici_aciklama', f.guven_kullanici_aciklama
        )
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_dogrulama_karar(uuid, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dogrulama_karar(uuid, text, text, text, text, integer) TO authenticated;

-- ============================================================
-- 8. Kritik alan degisikligi -> yeniden inceleme
-- ============================================================
CREATE OR REPLACE FUNCTION public.fd_kritik_alan_degisti()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    kritik boolean := FALSE;
    bid uuid;
    uid uuid;
BEGIN
    IF OLD.guven_dogrulama_durumu IS DISTINCT FROM 'dogrulandi' THEN
        RETURN NEW;
    END IF;

    kritik := (
        OLD.firma_adi IS DISTINCT FROM NEW.firma_adi
        OR OLD.vergi_no IS DISTINCT FROM NEW.vergi_no
        OR OLD.mersis_no IS DISTINCT FROM NEW.mersis_no
        OR OLD.yetkili_ad IS DISTINCT FROM NEW.yetkili_ad
        OR OLD.firma_turu IS DISTINCT FROM NEW.firma_turu
        OR OLD.sehir IS DISTINCT FROM NEW.sehir
        OR OLD.adres IS DISTINCT FROM NEW.adres
    );

    IF NOT kritik THEN
        RETURN NEW;
    END IF;

    NEW.guven_dogrulama_durumu := 'incelemede';
    NEW.guven_kullanici_aciklama := COALESCE(
        NEW.guven_kullanici_aciklama,
        'Dogrulanmis firma bilgilerinde degisiklik yapildi; guven dogrulamasi yeniden inceleniyor.'
    );

    uid := COALESCE(NEW.user_id, OLD.user_id);

    SELECT id INTO bid
    FROM public.firma_dogrulama_basvurulari
    WHERE firma_id = NEW.id
      AND durum IN ('taslak', 'incelemede', 'ek_belge_gerekli', 'yenileme_gerekli', 'dogrulandi')
    ORDER BY created_at DESC
    LIMIT 1;

    IF bid IS NULL THEN
        INSERT INTO public.firma_dogrulama_basvurulari (
            firma_id, user_id, durum, kullanici_aciklama, submitted_at
        ) VALUES (
            NEW.id,
            uid,
            'incelemede',
            'Kritik alan degisikligi sonrasi otomatik inceleme.',
            NOW()
        )
        RETURNING id INTO bid;
    ELSE
        UPDATE public.firma_dogrulama_basvurulari
        SET durum = 'incelemede', submitted_at = COALESCE(submitted_at, NOW()), updated_at = NOW()
        WHERE id = bid;
    END IF;

    PERFORM public._fd_log(
        bid,
        NEW.id::text,
        'kritik_alan_degisti',
        'dogrulandi',
        'incelemede',
        NEW.guven_kullanici_aciklama,
        'kritik_alan',
        jsonb_build_object('firma_id', NEW.id)
    );

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS fd_kritik_alan_tetik ON public.firmalar;
CREATE TRIGGER fd_kritik_alan_tetik
    BEFORE UPDATE ON public.firmalar
    FOR EACH ROW
    EXECUTE FUNCTION public.fd_kritik_alan_degisti();

-- ============================================================
-- 9. Sure dolan dogrulamalar (cron / manuel)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fd_suresi_dolanlari_isaretle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $fn$
DECLARE
    f_cnt integer := 0;
    b_cnt integer := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    WITH u AS (
        UPDATE public.firmalar f
        SET
            guven_dogrulama_durumu = 'suresi_doldu',
            guven_kullanici_aciklama = COALESCE(
                f.guven_kullanici_aciklama,
                'Guven dogrulama suresi doldu; yenileme gerekir.'
            ),
            updated_at = NOW()
        WHERE f.guven_dogrulama_durumu = 'dogrulandi'
          AND f.guven_sonraki_kontrol IS NOT NULL
          AND f.guven_sonraki_kontrol < NOW()
        RETURNING f.id
    )
    SELECT count(*)::integer INTO f_cnt FROM u;

    WITH u2 AS (
        UPDATE public.firma_dogrulama_basvurulari b
        SET durum = 'suresi_doldu', updated_at = NOW()
        WHERE b.durum = 'dogrulandi'
          AND b.sonraki_kontrol IS NOT NULL
          AND b.sonraki_kontrol < NOW()
        RETURNING b.id
    )
    SELECT count(*)::integer INTO b_cnt FROM u2;

    RETURN jsonb_build_object('ok', true, 'firmalar', f_cnt, 'basvurular', b_cnt);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fd_suresi_dolanlari_isaretle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fd_suresi_dolanlari_isaretle() TO authenticated;

COMMENT ON FUNCTION public.firma_dogrulama_ozet() IS
    'Firma guven rozet ozeti; admin_ic_not yalniz admin oturumunda.';
COMMENT ON FUNCTION public.admin_dogrulama_karar(uuid, text, text, text, text, integer) IS
    'Guven dogrulama karari; yayin durumu / firma durum kolonlarina dokunmaz.';
COMMENT ON FUNCTION public.fd_kritik_alan_degisti() IS
    'Dogrulanmis firmada kritik alan degisince guven durumunu incelemeye alir.';
COMMENT ON FUNCTION public.fd_suresi_dolanlari_isaretle() IS
    'Sonraki kontrol tarihi gecmis dogrulamalari isaretler (admin/cron).';

NOTIFY pgrst, 'reload schema';

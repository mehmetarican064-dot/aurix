-- Aurix Production Schema
-- Supabase Dashboard > SQL Editor'de calistirin

-- ============================================================
-- 1. PROFILES (Admin rol yonetimi)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profil okuma: kendi profili veya admin
CREATE POLICY "profiles_select_own_or_admin"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id OR public.is_admin());

-- ============================================================
-- 2. ATOLYELER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.atolyeler (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ad          TEXT NOT NULL CHECK (char_length(trim(ad)) BETWEEN 2 AND 200),
    kategori    TEXT NOT NULL,
    sehir       TEXT NOT NULL,
    tel         TEXT NOT NULL CHECK (tel ~ '^90[0-9]{10}$'),
    ref         TEXT NOT NULL CHECK (char_length(trim(ref)) BETWEEN 10 AND 2000),
    puan        TEXT NOT NULL DEFAULT '⭐⭐⭐⭐⭐',
    premium     BOOLEAN NOT NULL DEFAULT FALSE,
    gorsel_url  TEXT,
    durum       TEXT NOT NULL DEFAULT 'beklemede'
                CHECK (durum IN ('beklemede', 'onaylandi', 'reddedildi')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atolyeler_durum ON public.atolyeler (durum);
CREATE INDEX IF NOT EXISTS idx_atolyeler_premium ON public.atolyeler (premium DESC);
CREATE INDEX IF NOT EXISTS idx_atolyeler_sehir ON public.atolyeler (sehir);
CREATE INDEX IF NOT EXISTS idx_atolyeler_kategori ON public.atolyeler (kategori);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atolyeler_updated_at ON public.atolyeler;
CREATE TRIGGER atolyeler_updated_at
    BEFORE UPDATE ON public.atolyeler
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.atolyeler ENABLE ROW LEVEL SECURITY;

-- Herkes onayli kayitlari okuyabilir
CREATE POLICY "atolyeler_public_read_approved"
    ON public.atolyeler FOR SELECT
    TO anon, authenticated
    USING (durum = 'onaylandi');

-- Admin tum kayitlari okuyabilir
CREATE POLICY "atolyeler_admin_read_all"
    ON public.atolyeler FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Herkes yeni basvuru ekleyebilir (sadece beklemede)
CREATE POLICY "atolyeler_public_insert"
    ON public.atolyeler FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        durum = 'beklemede'
        AND premium = FALSE
    );

-- Sadece admin guncelleyebilir
CREATE POLICY "atolyeler_admin_update"
    ON public.atolyeler FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Sadece admin silebilir
CREATE POLICY "atolyeler_admin_delete"
    ON public.atolyeler FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- ============================================================
-- 3. STORAGE (Atolye gorselleri)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'atolye-gorselleri',
    'atolye-gorselleri',
    TRUE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "atolye_gorsel_public_read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'atolye-gorselleri');

CREATE POLICY "atolye_gorsel_anon_upload"
    ON storage.objects FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        bucket_id = 'atolye-gorselleri'
        AND (storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp', 'gif'))
    );

CREATE POLICY "atolye_gorsel_admin_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'atolye-gorselleri' AND public.is_admin());

-- ============================================================
-- 4. ORNEK VERI (Opsiyonel)
-- ============================================================
INSERT INTO public.atolyeler (ad, kategori, sehir, tel, ref, puan, premium, durum)
VALUES
    ('Arıcan Vakumlu Döküm Merkezi', 'Döküm Ocağı', 'İSTANBUL', '905321112233',
     'Sıfır gözenekli altın, gümüş, platin döküm hatları. Günlük yüksek hacimli iş teslimi.', '⭐⭐⭐⭐★', TRUE, 'onaylandi'),
    ('Elmas İş Mikroskobik Mıhlama', 'Mıhlamacı', 'İZMİR', '905423334455',
     'Mikroskop altında pırlanta ve fantezi taş kitleme işçiliği.', '⭐⭐⭐⭐⭐', TRUE, 'onaylandi'),
    ('Kuzey CAD & Matrix Tasarım Atölyesi', 'Matrix / Rhino Çizimci', 'DENİZLİ', '905556667788',
     'Kusursuz ölçülü alyans, tektaş ve fantezi model STL çizimleri.', '⭐⭐⭐⭐★', FALSE, 'onaylandi'),
    ('Zirve Hassas Lazer Kesim', 'Lazer Kesim', 'KAHRAMANMARAŞ', '905339998877',
     '0.1mm altın plaka kesim, fantezi plaka ve isim kazıma işleri.', '⭐⭐⭐⭐⭐', FALSE, 'onaylandi')
;

-- ============================================================
-- 5. ADMIN ATAMA (Kendi e-postanizi yazin)
-- Supabase Auth'ta kullanici olusturduktan sonra calistirin:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@sizin-domain.com';

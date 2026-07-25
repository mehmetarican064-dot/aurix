-- AURIX 028 — İş talepleri genişletme (kategoriler, dosyalar, RPC, storage)
-- Idempotent. DROP TABLE yok.
-- is_talepleri.id / firmalar.id tipleri introspection ile alınır (bigint veya uuid).
--
-- Bu dosya = supabase/maintenance/apply_028_is_talepleri.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın (027 sonrası önerilir).

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

CREATE OR REPLACE FUNCTION public._aurix_col_type(p_table text, p_column text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = p_table
      AND a.attname = p_column
      AND NOT a.attisdropped
    LIMIT 1;
$$;

-- ============================================================
-- 1. is_talepleri — kolon genişletme
-- ============================================================
DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'public.is_talepleri bulunamadı';
    END IF;
END $$;

ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS kullanici_id UUID;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS urun_turu TEXT;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS teknik_bilgiler TEXT;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS adet INTEGER;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS malzeme TEXT;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS tahmini_gram NUMERIC(12, 3);
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS gram_gorunur BOOLEAN DEFAULT FALSE;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS malzeme_saglayici TEXT;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS tas_durumu TEXT;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS teslim_tarihi DATE;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS aciliyet TEXT DEFAULT 'standart';
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS ilce TEXT;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS teslim_sekli TEXT;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS butce_tipi TEXT DEFAULT 'teklif_bekliyorum';
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS butce_min NUMERIC(14, 2);
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS butce_max NUMERIC(14, 2);
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS para_birimi TEXT DEFAULT 'TRY';
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS butce_gorunurlugu TEXT DEFAULT 'dogrulanmis_firmalar';
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS gorunurluk TEXT DEFAULT 'tum_dogrulanmis_firmalar';
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS sahip_gizli BOOLEAN DEFAULT FALSE;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS dosya_gorunurlugu TEXT DEFAULT 'talebi_gorenler';
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS yayinlanma_tarihi TIMESTAMPTZ;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS guncellenme_tarihi TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS iptal_tarihi TIMESTAMPTZ;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS arsiv_tarihi TIMESTAMPTZ;
ALTER TABLE public.is_talepleri ADD COLUMN IF NOT EXISTS istemci_anahtar TEXT;

-- firma_id: firmalar.id tipine göre
DO $$
DECLARE
    firma_id_type text;
BEGIN
    firma_id_type := public._aurix_col_type('firmalar', 'id');
    IF firma_id_type IS NULL THEN
        RAISE NOTICE 'firmalar.id yok — firma_id atlandı.';
        RETURN;
    END IF;

    IF NOT public._aurix_col_exists('is_talepleri', 'firma_id') THEN
        EXECUTE format(
            'ALTER TABLE public.is_talepleri ADD COLUMN firma_id %s',
            firma_id_type
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_firma_id_fkey'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        BEGIN
            EXECUTE format(
                'ALTER TABLE public.is_talepleri
                    ADD CONSTRAINT is_talepleri_firma_id_fkey
                    FOREIGN KEY (firma_id) REFERENCES public.firmalar (id) ON DELETE SET NULL'
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'is_talepleri.firma_id FK: %', SQLERRM;
        END;
    END IF;
END $$;

-- kullanici_id → auth.users (nullable; backfill sonra)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_kullanici_id_fkey'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        BEGIN
            ALTER TABLE public.is_talepleri
                ADD CONSTRAINT is_talepleri_kullanici_id_fkey
                FOREIGN KEY (kullanici_id) REFERENCES auth.users (id) ON DELETE SET NULL;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'is_talepleri.kullanici_id FK: %', SQLERRM;
        END;
    END IF;
END $$;

-- Backfill: kullanici_id ← owner_id
UPDATE public.is_talepleri
SET kullanici_id = owner_id
WHERE kullanici_id IS NULL
  AND owner_id IS NOT NULL;

-- Varsayılanlar (mevcut satırlara soft)
UPDATE public.is_talepleri SET aciliyet = 'standart' WHERE aciliyet IS NULL OR btrim(aciliyet) = '';
UPDATE public.is_talepleri SET butce_tipi = 'teklif_bekliyorum' WHERE butce_tipi IS NULL OR btrim(butce_tipi) = '';
UPDATE public.is_talepleri SET para_birimi = 'TRY' WHERE para_birimi IS NULL OR btrim(para_birimi) = '';
UPDATE public.is_talepleri SET butce_gorunurlugu = 'dogrulanmis_firmalar' WHERE butce_gorunurlugu IS NULL OR btrim(butce_gorunurlugu) = '';
UPDATE public.is_talepleri SET gorunurluk = 'tum_dogrulanmis_firmalar' WHERE gorunurluk IS NULL OR btrim(gorunurluk) = '';
UPDATE public.is_talepleri SET dosya_gorunurlugu = 'talebi_gorenler' WHERE dosya_gorunurlugu IS NULL OR btrim(dosya_gorunurlugu) = '';
UPDATE public.is_talepleri SET gram_gorunur = FALSE WHERE gram_gorunur IS NULL;
UPDATE public.is_talepleri SET sahip_gizli = FALSE WHERE sahip_gizli IS NULL;
UPDATE public.is_talepleri SET guncellenme_tarihi = COALESCE(guncellenme_tarihi, created_at, NOW()) WHERE guncellenme_tarihi IS NULL;

DO $$
BEGIN
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN aciliyet SET DEFAULT 'standart'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN butce_tipi SET DEFAULT 'teklif_bekliyorum'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN para_birimi SET DEFAULT 'TRY'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN butce_gorunurlugu SET DEFAULT 'dogrulanmis_firmalar'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN gorunurluk SET DEFAULT 'tum_dogrulanmis_firmalar'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN dosya_gorunurlugu SET DEFAULT 'talebi_gorenler'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN gram_gorunur SET DEFAULT FALSE; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN sahip_gizli SET DEFAULT FALSE; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE public.is_talepleri ALTER COLUMN guncellenme_tarihi SET DEFAULT NOW(); EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ============================================================
-- 2. CHECK kısıtları (yumuşak / legacy uyumlu; sıkı doğrulama RPC’de)
-- ============================================================
DO $$
BEGIN
    -- baslik: max 90; min 5 yalnızca boş olmayan ve yeni durumlar için
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_baslik_len_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_baslik_len_check
            CHECK (
                baslik IS NULL
                OR btrim(baslik) = ''
                OR (
                    char_length(btrim(baslik)) <= 90
                    AND (
                        durum IN ('Acik', 'Tamamlandi', 'Iptal')
                        OR char_length(btrim(baslik)) >= 5
                    )
                )
            ) NOT VALID;
        BEGIN
            ALTER TABLE public.is_talepleri VALIDATE CONSTRAINT is_talepleri_baslik_len_check;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'baslik CHECK validate atlandı (legacy): %', SQLERRM;
        END;
    END IF;

    -- aciklama: üst sınır her zaman; min 40 yalnız yeni durumlar (legacy Acik kırılmaz)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_aciklama_len_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_aciklama_len_check
            CHECK (
                aciklama IS NULL
                OR (
                    char_length(aciklama) <= 2000
                    AND (
                        durum IN ('Acik', 'Tamamlandi', 'Iptal')
                        OR char_length(aciklama) >= 40
                        OR durum = 'taslak'
                    )
                )
            ) NOT VALID;
        BEGIN
            ALTER TABLE public.is_talepleri VALIDATE CONSTRAINT is_talepleri_aciklama_len_check;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'aciklama CHECK validate atlandı (legacy): %', SQLERRM;
        END;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_teknik_bilgiler_len_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_teknik_bilgiler_len_check
            CHECK (teknik_bilgiler IS NULL OR char_length(teknik_bilgiler) <= 1000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_adet_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_adet_check
            CHECK (adet IS NULL OR adet > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_tahmini_gram_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_tahmini_gram_check
            CHECK (tahmini_gram IS NULL OR tahmini_gram >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_butce_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_butce_check
            CHECK (
                (butce_min IS NULL OR butce_min >= 0)
                AND (butce_max IS NULL OR butce_max >= 0)
                AND (
                    butce_min IS NULL
                    OR butce_max IS NULL
                    OR butce_max >= butce_min
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_para_birimi_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_para_birimi_check
            CHECK (para_birimi IS NULL OR para_birimi IN ('TRY'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_aciliyet_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_aciliyet_check
            CHECK (aciliyet IS NULL OR aciliyet IN ('standart', 'oncelikli', 'acil'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_durum_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_durum_check
            CHECK (
                durum IS NULL
                OR durum IN (
                    'taslak', 'teklif_bekliyor', 'teklif_secildi', 'is_emri_olusturuldu',
                    'uretimde', 'tamamlandi', 'iptal_edildi', 'arsivlendi',
                    'Acik', 'Tamamlandi', 'Iptal'
                )
            ) NOT VALID;
        BEGIN
            ALTER TABLE public.is_talepleri VALIDATE CONSTRAINT is_talepleri_durum_check;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'durum CHECK validate atlandı: %', SQLERRM;
        END;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_butce_tipi_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_butce_tipi_check
            CHECK (
                butce_tipi IS NULL
                OR butce_tipi IN ('teklif_bekliyorum', 'tahmini', 'sabit')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_butce_gorunurlugu_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_butce_gorunurlugu_check
            CHECK (
                butce_gorunurlugu IS NULL
                OR butce_gorunurlugu IN ('herkese', 'dogrulanmis_firmalar')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_gorunurluk_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_gorunurluk_check
            CHECK (
                gorunurluk IS NULL
                OR gorunurluk IN (
                    'tum_dogrulanmis_firmalar', 'secilen_sehir', 'davet_edilen'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_dosya_gorunurlugu_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_dosya_gorunurlugu_check
            CHECK (
                dosya_gorunurlugu IS NULL
                OR dosya_gorunurlugu IN ('talebi_gorenler', 'teklif_sonrasi')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_malzeme_saglayici_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_malzeme_saglayici_check
            CHECK (
                malzeme_saglayici IS NULL
                OR malzeme_saglayici IN ('is_veren', 'hizmet_veren', 'gorusulecek')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_tas_durumu_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_tas_durumu_check
            CHECK (
                tas_durumu IS NULL
                OR tas_durumu IN ('yok', 'is_veren', 'hizmet_veren', 'gorusulecek')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_teslim_sekli_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_teslim_sekli_check
            CHECK (
                teslim_sekli IS NULL
                OR teslim_sekli IN ('elden', 'kargo', 'kurye', 'gorusulecek')
            );
    END IF;
END $$;

-- ============================================================
-- 3. İndeksler
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_is_talepleri_kullanici_id
    ON public.is_talepleri (kullanici_id);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_durum
    ON public.is_talepleri (durum);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_kategori
    ON public.is_talepleri (kategori);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_sehir
    ON public.is_talepleri (sehir);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_yayinlanma_tarihi
    ON public.is_talepleri (yayinlanma_tarihi DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_is_talepleri_istemci_anahtar
    ON public.is_talepleri (istemci_anahtar)
    WHERE istemci_anahtar IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_is_talepleri_kullanici_istemci
    ON public.is_talepleri (kullanici_id, istemci_anahtar)
    WHERE istemci_anahtar IS NOT NULL AND kullanici_id IS NOT NULL;

-- ============================================================
-- 4. guncellenme_tarihi trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talepleri_set_guncellenme()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.guncellenme_tarihi := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_is_talepleri_guncellenme ON public.is_talepleri;
CREATE TRIGGER trg_is_talepleri_guncellenme
    BEFORE UPDATE ON public.is_talepleri
    FOR EACH ROW
    EXECUTE FUNCTION public.is_talepleri_set_guncellenme();

-- ============================================================
-- 5. is_kategorileri + seed
-- ============================================================
CREATE TABLE IF NOT EXISTS public.is_kategorileri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL,
    ad TEXT NOT NULL,
    aktif BOOLEAN NOT NULL DEFAULT TRUE,
    sira INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_is_kategorileri_slug
    ON public.is_kategorileri (slug);

INSERT INTO public.is_kategorileri (slug, ad, aktif, sira)
SELECT v.slug, v.ad, TRUE, v.sira
FROM (VALUES
    ('cad-tasarim', 'CAD Tasarım', 10),
    ('mum-model', 'Mum Model', 20),
    ('kalip', 'Kalıp', 30),
    ('3d-baski', '3D Baskı', 40),
    ('dokum', 'Döküm', 50),
    ('pres', 'Pres', 60),
    ('mihlama', 'Mıhlama', 70),
    ('cila', 'Cila', 80),
    ('rodaj', 'Rodaj', 90),
    ('mine', 'Mine', 100),
    ('lazer-kaynak', 'Lazer Kaynak', 110),
    ('zincir-uretimi', 'Zincir Üretimi', 120),
    ('montur', 'Montür', 130),
    ('tas-sokme-takma', 'Taş Sökme / Takma', 140),
    ('tamir-revizyon', 'Tamir / Revizyon', 150),
    ('diger', 'Diğer', 160)
) AS v(slug, ad, sira)
WHERE NOT EXISTS (
    SELECT 1 FROM public.is_kategorileri k WHERE k.slug = v.slug
);

COMMENT ON TABLE public.is_kategorileri IS
    'İş talebi kategori sözlüğü. Lazer kesim yok; Lazer Kaynak var.';

-- ============================================================
-- 6. is_talebi_dosyalari + is_talebi_islem_loglari
-- ============================================================
DO $$
DECLARE
    is_id_type text;
BEGIN
    is_id_type := public._aurix_col_type('is_talepleri', 'id');
    IF is_id_type IS NULL THEN
        RAISE EXCEPTION 'is_talepleri.id tipi bulunamadı';
    END IF;

    IF to_regclass('public.is_talebi_dosyalari') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.is_talebi_dosyalari (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                is_talebi_id %s NOT NULL REFERENCES public.is_talepleri (id) ON DELETE CASCADE,
                kullanici_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
                storage_path TEXT NOT NULL,
                orijinal_dosya_adi TEXT,
                mime_type TEXT,
                boyut_bytes BIGINT,
                dosya_turu TEXT NOT NULL DEFAULT 'gorsel'
                    CHECK (dosya_turu IN ('gorsel', 'teknik')),
                sira INTEGER NOT NULL DEFAULT 0,
                olusturulma_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        $sql$, is_id_type);
    END IF;

    IF to_regclass('public.is_talebi_islem_loglari') IS NULL THEN
        EXECUTE format($sql$
            CREATE TABLE public.is_talebi_islem_loglari (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                is_talebi_id %s NOT NULL REFERENCES public.is_talepleri (id) ON DELETE CASCADE,
                admin_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
                islem TEXT NOT NULL,
                notlar TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        $sql$, is_id_type);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_is_talebi_dosyalari_talep
    ON public.is_talebi_dosyalari (is_talebi_id, sira);
CREATE INDEX IF NOT EXISTS idx_is_talebi_dosyalari_kullanici
    ON public.is_talebi_dosyalari (kullanici_id);
CREATE INDEX IF NOT EXISTS idx_is_talebi_islem_loglari_talep
    ON public.is_talebi_islem_loglari (is_talebi_id, created_at DESC);

COMMENT ON TABLE public.is_talebi_dosyalari IS
    'İş talebi ekleri (storage meta). İmzalı URL RPC ile; teklif veren erişimi TODO.';
COMMENT ON TABLE public.is_talebi_islem_loglari IS
    'Admin moderasyon / durum işlem audit logu.';

-- ============================================================
-- 7. RLS — is_talepleri (açık anon INSERT kaldır)
-- ============================================================
ALTER TABLE public.is_talepleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "is_talepleri_anon_insert" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_public_insert" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_public_read_approved" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_public_select" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_anon_select_acik" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_select_published" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_select_own" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_insert_auth" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_update_own" ON public.is_talepleri;
DROP POLICY IF EXISTS "is_talepleri_admin_all" ON public.is_talepleri;

DO $$
DECLARE
    has_is_seed boolean;
    pub_expr text;
    own_expr text;
BEGIN
    has_is_seed := public._aurix_col_exists('is_talepleri', 'is_seed');

    pub_expr :=
        'durum IN (''Acik'', ''teklif_bekliyor'')'
        || ' AND (moderasyon_durumu IS NULL OR moderasyon_durumu = ''aktif'')';
    IF has_is_seed THEN
        pub_expr := pub_expr || ' AND COALESCE(is_seed, FALSE) IS FALSE';
    END IF;

    own_expr :=
        'auth.uid() IS NOT NULL AND ('
        || 'kullanici_id = auth.uid() OR owner_id = auth.uid()'
        || ')';

    EXECUTE format(
        'CREATE POLICY "is_talepleri_select_published"
            ON public.is_talepleri FOR SELECT
            TO anon, authenticated
            USING (%s)',
        pub_expr
    );

    EXECUTE format(
        'CREATE POLICY "is_talepleri_select_own"
            ON public.is_talepleri FOR SELECT
            TO authenticated
            USING (%s OR public.is_admin())',
        own_expr
    );

    EXECUTE
        'CREATE POLICY "is_talepleri_insert_auth"
            ON public.is_talepleri FOR INSERT
            TO authenticated
            WITH CHECK (
                kullanici_id = auth.uid()
                OR (kullanici_id IS NULL AND owner_id = auth.uid())
            )';

    EXECUTE format(
        'CREATE POLICY "is_talepleri_update_own"
            ON public.is_talepleri FOR UPDATE
            TO authenticated
            USING (
                public.is_admin()
                OR (
                    %s
                    AND durum IN (''taslak'', ''teklif_bekliyor'', ''Acik'')
                )
            )
            WITH CHECK (
                public.is_admin()
                OR (
                    %s
                    AND durum IN (
                        ''taslak'', ''teklif_bekliyor'', ''Acik'',
                        ''iptal_edildi'', ''arsivlendi'', ''Iptal''
                    )
                )
            )',
        own_expr, own_expr
    );

    EXECUTE
        'CREATE POLICY "is_talepleri_admin_all"
            ON public.is_talepleri FOR ALL
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin())';
END $$;

DO $$
BEGIN
    BEGIN
        REVOKE INSERT ON TABLE public.is_talepleri FROM anon;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'REVOKE anon INSERT is_talepleri: %', SQLERRM;
    END;
    BEGIN
        GRANT SELECT ON TABLE public.is_talepleri TO anon, authenticated;
        GRANT INSERT, UPDATE ON TABLE public.is_talepleri TO authenticated;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'GRANT is_talepleri: %', SQLERRM;
    END;
END $$;

-- ============================================================
-- 8. RLS — yeni tablolar
-- ============================================================
ALTER TABLE public.is_kategorileri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.is_talebi_dosyalari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.is_talebi_islem_loglari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "is_kategorileri_select_aktif" ON public.is_kategorileri;
CREATE POLICY "is_kategorileri_select_aktif"
    ON public.is_kategorileri FOR SELECT
    TO anon, authenticated
    USING (aktif IS TRUE OR public.is_admin());

DROP POLICY IF EXISTS "is_kategorileri_admin_all" ON public.is_kategorileri;
CREATE POLICY "is_kategorileri_admin_all"
    ON public.is_kategorileri FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.is_kategorileri FROM PUBLIC;
GRANT SELECT ON TABLE public.is_kategorileri TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.is_kategorileri TO authenticated;

-- Dosyalar: şimdilik yalnız sahip + admin SELECT
-- TODO: teklif veren / dosya_gorunurlugu = talebi_gorenler için genişlet
DROP POLICY IF EXISTS "is_talebi_dosyalari_select_own" ON public.is_talebi_dosyalari;
CREATE POLICY "is_talebi_dosyalari_select_own"
    ON public.is_talebi_dosyalari FOR SELECT
    TO authenticated
    USING (
        kullanici_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.is_talepleri i
            WHERE i.id = is_talebi_dosyalari.is_talebi_id
              AND (i.kullanici_id = auth.uid() OR i.owner_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "is_talebi_dosyalari_insert_own" ON public.is_talebi_dosyalari;
CREATE POLICY "is_talebi_dosyalari_insert_own"
    ON public.is_talebi_dosyalari FOR INSERT
    TO authenticated
    WITH CHECK (
        kullanici_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.is_talepleri i
            WHERE i.id = is_talebi_id
              AND (i.kullanici_id = auth.uid() OR i.owner_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "is_talebi_dosyalari_delete_own" ON public.is_talebi_dosyalari;
CREATE POLICY "is_talebi_dosyalari_delete_own"
    ON public.is_talebi_dosyalari FOR DELETE
    TO authenticated
    USING (
        kullanici_id = auth.uid()
        OR public.is_admin()
    );

REVOKE ALL ON TABLE public.is_talebi_dosyalari FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE public.is_talebi_dosyalari TO authenticated;

DROP POLICY IF EXISTS "is_talebi_islem_loglari_admin" ON public.is_talebi_islem_loglari;
CREATE POLICY "is_talebi_islem_loglari_admin"
    ON public.is_talebi_islem_loglari FOR SELECT
    TO authenticated
    USING (public.is_admin());

REVOKE ALL ON TABLE public.is_talebi_islem_loglari FROM PUBLIC;
GRANT SELECT ON TABLE public.is_talebi_islem_loglari TO authenticated;
-- INSERT yalnız SECURITY DEFINER RPC

-- ============================================================
-- 9. Storage bucket: is-talebi-dosyalari (private)
-- ============================================================
DO $$
BEGIN
    IF to_regclass('storage.buckets') IS NULL THEN
        RAISE NOTICE 'storage.buckets yok; is-talebi-dosyalari atlandı.';
        RETURN;
    END IF;

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'is-talebi-dosyalari',
        'is-talebi-dosyalari',
        false,
        26214400,
        ARRAY[
            'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
            'application/pdf',
            'application/octet-stream',
            'model/stl', 'model/obj',
            'application/sla',
            'application/vnd.ms-pki.stl'
        ]
    )
    ON CONFLICT (id) DO UPDATE SET
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'is-talebi-dosyalari bucket: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF to_regclass('storage.objects') IS NULL THEN
        RETURN;
    END IF;

    DROP POLICY IF EXISTS "is_talebi_dosya_no_public" ON storage.objects;
    DROP POLICY IF EXISTS "is_talebi_dosya_owner_insert" ON storage.objects;
    DROP POLICY IF EXISTS "is_talebi_dosya_owner_select" ON storage.objects;
    DROP POLICY IF EXISTS "is_talebi_dosya_owner_update" ON storage.objects;
    DROP POLICY IF EXISTS "is_talebi_dosya_owner_delete" ON storage.objects;
    DROP POLICY IF EXISTS "is_talebi_dosya_admin_select" ON storage.objects;

    CREATE POLICY "is_talebi_dosya_owner_insert"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
            bucket_id = 'is-talebi-dosyalari'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );

    CREATE POLICY "is_talebi_dosya_owner_select"
        ON storage.objects FOR SELECT TO authenticated
        USING (
            bucket_id = 'is-talebi-dosyalari'
            AND (
                (storage.foldername(name))[1] = auth.uid()::text
                OR public.is_admin()
            )
        );

    CREATE POLICY "is_talebi_dosya_owner_update"
        ON storage.objects FOR UPDATE TO authenticated
        USING (
            bucket_id = 'is-talebi-dosyalari'
            AND (storage.foldername(name))[1] = auth.uid()::text
        )
        WITH CHECK (
            bucket_id = 'is-talebi-dosyalari'
            AND (storage.foldername(name))[1] = auth.uid()::text
        );

    CREATE POLICY "is_talebi_dosya_owner_delete"
        ON storage.objects FOR DELETE TO authenticated
        USING (
            bucket_id = 'is-talebi-dosyalari'
            AND (
                (storage.foldername(name))[1] = auth.uid()::text
                OR public.is_admin()
            )
        );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'is-talebi-dosyalari storage policy: %', SQLERRM;
END $$;

-- ============================================================
-- 10. RPC yardımcıları
-- ============================================================
CREATE OR REPLACE FUNCTION public._is_talebi_sahip_mi(p_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.is_talepleri i
        WHERE i.id::text = p_id
          AND (
              public.is_admin()
              OR i.kullanici_id = auth.uid()
              OR i.owner_id = auth.uid()
          )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public._is_talebi_resolve_firma_id(p_uid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    fid text;
    has_user boolean;
    has_owner boolean;
BEGIN
    IF p_uid IS NULL THEN
        RETURN NULL;
    END IF;
    has_user := public._aurix_col_exists('firmalar', 'user_id');
    has_owner := public._aurix_col_exists('firmalar', 'owner_id');

    IF has_user THEN
        EXECUTE 'SELECT id::text FROM public.firmalar WHERE user_id = $1 LIMIT 1'
            INTO fid USING p_uid;
        IF fid IS NOT NULL THEN
            RETURN fid;
        END IF;
    END IF;
    IF has_owner THEN
        EXECUTE 'SELECT id::text FROM public.firmalar WHERE owner_id = $1 LIMIT 1'
            INTO fid USING p_uid;
    END IF;
    RETURN fid;
END;
$$;

CREATE OR REPLACE FUNCTION public._is_talebi_validate_payload(
    p_payload jsonb,
    p_yayinla boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    b text := btrim(COALESCE(p_payload->>'baslik', ''));
    a text := COALESCE(p_payload->>'aciklama', '');
    t text := p_payload->>'teknik_bilgiler';
    adet_v int;
    gram_v numeric;
    bmin numeric;
    bmax numeric;
    acil text;
    bt text;
    pb text;
BEGIN
    IF char_length(b) < 5 OR char_length(b) > 90 THEN
        RAISE EXCEPTION 'baslik_uzunluk' USING ERRCODE = '22023';
    END IF;

    IF p_yayinla THEN
        IF char_length(a) < 40 OR char_length(a) > 2000 THEN
            RAISE EXCEPTION 'aciklama_uzunluk' USING ERRCODE = '22023';
        END IF;
    ELSIF a IS NOT NULL AND a <> '' AND char_length(a) > 2000 THEN
        RAISE EXCEPTION 'aciklama_uzunluk' USING ERRCODE = '22023';
    END IF;

    IF t IS NOT NULL AND char_length(t) > 1000 THEN
        RAISE EXCEPTION 'teknik_bilgiler_uzunluk' USING ERRCODE = '22023';
    END IF;

    IF p_payload ? 'adet' AND p_payload->>'adet' IS NOT NULL AND btrim(p_payload->>'adet') <> '' THEN
        adet_v := (p_payload->>'adet')::int;
        IF adet_v IS NULL OR adet_v <= 0 THEN
            RAISE EXCEPTION 'adet_gecersiz' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_payload ? 'tahmini_gram' AND p_payload->>'tahmini_gram' IS NOT NULL
       AND btrim(p_payload->>'tahmini_gram') <> '' THEN
        gram_v := (p_payload->>'tahmini_gram')::numeric;
        IF gram_v < 0 THEN
            RAISE EXCEPTION 'tahmini_gram_gecersiz' USING ERRCODE = '22023';
        END IF;
    END IF;

    bmin := NULLIF(btrim(COALESCE(p_payload->>'butce_min', '')), '')::numeric;
    bmax := NULLIF(btrim(COALESCE(p_payload->>'butce_max', '')), '')::numeric;
    IF bmin IS NOT NULL AND bmin < 0 THEN
        RAISE EXCEPTION 'butce_gecersiz' USING ERRCODE = '22023';
    END IF;
    IF bmax IS NOT NULL AND bmax < 0 THEN
        RAISE EXCEPTION 'butce_gecersiz' USING ERRCODE = '22023';
    END IF;
    IF bmin IS NOT NULL AND bmax IS NOT NULL AND bmax < bmin THEN
        RAISE EXCEPTION 'butce_aralik' USING ERRCODE = '22023';
    END IF;

    acil := COALESCE(NULLIF(btrim(p_payload->>'aciliyet'), ''), 'standart');
    IF acil NOT IN ('standart', 'oncelikli', 'acil') THEN
        RAISE EXCEPTION 'aciliyet_gecersiz' USING ERRCODE = '22023';
    END IF;

    bt := COALESCE(NULLIF(btrim(p_payload->>'butce_tipi'), ''), 'teklif_bekliyorum');
    IF bt NOT IN ('teklif_bekliyorum', 'tahmini', 'sabit') THEN
        RAISE EXCEPTION 'butce_tipi_gecersiz' USING ERRCODE = '22023';
    END IF;

    pb := COALESCE(NULLIF(btrim(p_payload->>'para_birimi'), ''), 'TRY');
    IF pb NOT IN ('TRY') THEN
        RAISE EXCEPTION 'para_birimi_gecersiz' USING ERRCODE = '22023';
    END IF;
END;
$$;

-- ============================================================
-- 11. is_talebi_kaydet
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_kaydet(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    yayinla boolean := COALESCE((p_payload->>'yayinla')::boolean, false)
        OR lower(COALESCE(p_payload->>'mod', '')) IN ('yayinla', 'publish');
    istemci text := NULLIF(btrim(COALESCE(p_payload->>'istemci_anahtar', '')), '');
    mevcut_id text := NULLIF(btrim(COALESCE(p_payload->>'id', '')), '');
    firma_resolved text;
    firma_id_type text;
    row_id text;
    yeni_durum text;
    eski_durum text;
    was_update boolean := false;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
    END IF;

    PERFORM public._is_talebi_validate_payload(COALESCE(p_payload, '{}'::jsonb), yayinla);

    firma_resolved := public._is_talebi_resolve_firma_id(uid);
    firma_id_type := public._aurix_col_type('firmalar', 'id');

    -- İdempotency: istemci_anahtar ile mevcut satır
    IF mevcut_id IS NULL AND istemci IS NOT NULL THEN
        SELECT i.id::text INTO mevcut_id
        FROM public.is_talepleri i
        WHERE i.kullanici_id = uid
          AND i.istemci_anahtar = istemci
        LIMIT 1;
    END IF;

    yeni_durum := CASE
        WHEN yayinla THEN 'teklif_bekliyor'
        ELSE 'taslak'
    END;

    IF mevcut_id IS NOT NULL THEN
        SELECT i.durum INTO eski_durum
        FROM public.is_talepleri i
        WHERE i.id::text = mevcut_id
          AND (i.kullanici_id = uid OR i.owner_id = uid)
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'is_yok_veya_yetkisiz' USING ERRCODE = '42501';
        END IF;

        IF eski_durum NOT IN ('taslak', 'teklif_bekliyor', 'Acik') THEN
            RAISE EXCEPTION 'durum_guncellenemez' USING ERRCODE = '22023';
        END IF;

        UPDATE public.is_talepleri SET
            baslik = btrim(p_payload->>'baslik'),
            aciklama = NULLIF(p_payload->>'aciklama', ''),
            kategori = NULLIF(btrim(COALESCE(p_payload->>'kategori', '')), ''),
            sehir = NULLIF(btrim(COALESCE(p_payload->>'sehir', '')), ''),
            ilce = NULLIF(btrim(COALESCE(p_payload->>'ilce', '')), ''),
            urun_turu = NULLIF(btrim(COALESCE(p_payload->>'urun_turu', '')), ''),
            teknik_bilgiler = NULLIF(p_payload->>'teknik_bilgiler', ''),
            adet = NULLIF(btrim(COALESCE(p_payload->>'adet', '')), '')::int,
            malzeme = NULLIF(btrim(COALESCE(p_payload->>'malzeme', '')), ''),
            tahmini_gram = NULLIF(btrim(COALESCE(p_payload->>'tahmini_gram', '')), '')::numeric,
            gram_gorunur = COALESCE((p_payload->>'gram_gorunur')::boolean, gram_gorunur, FALSE),
            malzeme_saglayici = NULLIF(btrim(COALESCE(p_payload->>'malzeme_saglayici', '')), ''),
            tas_durumu = NULLIF(btrim(COALESCE(p_payload->>'tas_durumu', '')), ''),
            teslim_tarihi = NULLIF(btrim(COALESCE(p_payload->>'teslim_tarihi', '')), '')::date,
            aciliyet = COALESCE(NULLIF(btrim(p_payload->>'aciliyet'), ''), aciliyet, 'standart'),
            teslim_sekli = NULLIF(btrim(COALESCE(p_payload->>'teslim_sekli', '')), ''),
            butce_tipi = COALESCE(NULLIF(btrim(p_payload->>'butce_tipi'), ''), butce_tipi, 'teklif_bekliyorum'),
            butce_min = NULLIF(btrim(COALESCE(p_payload->>'butce_min', '')), '')::numeric,
            butce_max = NULLIF(btrim(COALESCE(p_payload->>'butce_max', '')), '')::numeric,
            para_birimi = COALESCE(NULLIF(btrim(p_payload->>'para_birimi'), ''), para_birimi, 'TRY'),
            butce_gorunurlugu = COALESCE(NULLIF(btrim(p_payload->>'butce_gorunurlugu'), ''), butce_gorunurlugu, 'dogrulanmis_firmalar'),
            gorunurluk = COALESCE(NULLIF(btrim(p_payload->>'gorunurluk'), ''), gorunurluk, 'tum_dogrulanmis_firmalar'),
            sahip_gizli = COALESCE((p_payload->>'sahip_gizli')::boolean, sahip_gizli, FALSE),
            dosya_gorunurlugu = COALESCE(NULLIF(btrim(p_payload->>'dosya_gorunurlugu'), ''), dosya_gorunurlugu, 'talebi_gorenler'),
            kullanici_id = COALESCE(kullanici_id, uid),
            owner_id = COALESCE(owner_id, uid),
            durum = CASE
                WHEN yayinla THEN 'teklif_bekliyor'
                WHEN durum = 'Acik' AND NOT yayinla THEN durum
                ELSE 'taslak'
            END,
            yayinlanma_tarihi = CASE
                WHEN yayinla THEN COALESCE(yayinlanma_tarihi, NOW())
                ELSE yayinlanma_tarihi
            END,
            moderasyon_durumu = CASE
                WHEN yayinla THEN COALESCE(moderasyon_durumu, 'aktif')
                ELSE moderasyon_durumu
            END,
            istemci_anahtar = COALESCE(istemci, istemci_anahtar)
        WHERE id::text = mevcut_id;

        row_id := mevcut_id;
        was_update := true;
    ELSE
        INSERT INTO public.is_talepleri (
            baslik, aciklama, kategori, sehir, ilce,
            urun_turu, teknik_bilgiler, adet, malzeme, tahmini_gram, gram_gorunur,
            malzeme_saglayici, tas_durumu, teslim_tarihi, aciliyet, teslim_sekli,
            butce_tipi, butce_min, butce_max, para_birimi, butce_gorunurlugu,
            gorunurluk, sahip_gizli, dosya_gorunurlugu,
            kullanici_id, owner_id, durum,
            yayinlanma_tarihi, moderasyon_durumu, istemci_anahtar, created_at
        ) VALUES (
            btrim(p_payload->>'baslik'),
            NULLIF(p_payload->>'aciklama', ''),
            NULLIF(btrim(COALESCE(p_payload->>'kategori', '')), ''),
            NULLIF(btrim(COALESCE(p_payload->>'sehir', '')), ''),
            NULLIF(btrim(COALESCE(p_payload->>'ilce', '')), ''),
            NULLIF(btrim(COALESCE(p_payload->>'urun_turu', '')), ''),
            NULLIF(p_payload->>'teknik_bilgiler', ''),
            NULLIF(btrim(COALESCE(p_payload->>'adet', '')), '')::int,
            NULLIF(btrim(COALESCE(p_payload->>'malzeme', '')), ''),
            NULLIF(btrim(COALESCE(p_payload->>'tahmini_gram', '')), '')::numeric,
            COALESCE((p_payload->>'gram_gorunur')::boolean, FALSE),
            NULLIF(btrim(COALESCE(p_payload->>'malzeme_saglayici', '')), ''),
            NULLIF(btrim(COALESCE(p_payload->>'tas_durumu', '')), ''),
            NULLIF(btrim(COALESCE(p_payload->>'teslim_tarihi', '')), '')::date,
            COALESCE(NULLIF(btrim(p_payload->>'aciliyet'), ''), 'standart'),
            NULLIF(btrim(COALESCE(p_payload->>'teslim_sekli', '')), ''),
            COALESCE(NULLIF(btrim(p_payload->>'butce_tipi'), ''), 'teklif_bekliyorum'),
            NULLIF(btrim(COALESCE(p_payload->>'butce_min', '')), '')::numeric,
            NULLIF(btrim(COALESCE(p_payload->>'butce_max', '')), '')::numeric,
            COALESCE(NULLIF(btrim(p_payload->>'para_birimi'), ''), 'TRY'),
            COALESCE(NULLIF(btrim(p_payload->>'butce_gorunurlugu'), ''), 'dogrulanmis_firmalar'),
            COALESCE(NULLIF(btrim(p_payload->>'gorunurluk'), ''), 'tum_dogrulanmis_firmalar'),
            COALESCE((p_payload->>'sahip_gizli')::boolean, FALSE),
            COALESCE(NULLIF(btrim(p_payload->>'dosya_gorunurlugu'), ''), 'talebi_gorenler'),
            uid,
            uid,
            yeni_durum,
            CASE WHEN yayinla THEN NOW() ELSE NULL END,
            'aktif',
            istemci,
            NOW()
        )
        RETURNING id::text INTO row_id;
    END IF;

    -- firma_id: istemci değeri yok sayılır; yalnızca kullanıcının firması
    IF firma_resolved IS NOT NULL
       AND firma_id_type IS NOT NULL
       AND public._aurix_col_exists('is_talepleri', 'firma_id') THEN
        BEGIN
            EXECUTE format(
                'UPDATE public.is_talepleri SET firma_id = $1::%s WHERE id::text = $2',
                firma_id_type
            ) USING firma_resolved, row_id;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'firma_id set: %', SQLERRM;
        END;
    END IF;

    SELECT i.durum INTO yeni_durum
    FROM public.is_talepleri i
    WHERE i.id::text = row_id;

    RETURN jsonb_build_object(
        'ok', true,
        'id', row_id,
        'durum', yeni_durum,
        'idempotent', was_update AND istemci IS NOT NULL
    );
EXCEPTION
    WHEN unique_violation THEN
        SELECT i.id::text, i.durum INTO row_id, yeni_durum
        FROM public.is_talepleri i
        WHERE i.kullanici_id = uid AND i.istemci_anahtar = istemci
        LIMIT 1;
        RETURN jsonb_build_object('ok', true, 'id', row_id, 'durum', yeni_durum, 'idempotent', true);
END;
$$;

REVOKE ALL ON FUNCTION public.is_talebi_kaydet(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_kaydet(jsonb) TO authenticated;

COMMENT ON FUNCTION public.is_talebi_kaydet(jsonb) IS
    'Taslak kaydet / yayınla. kullanici_id=auth.uid(); istemci_anahtar ile idempotent.';

-- ============================================================
-- 12. is_talepleri_listele (güvenli public alanlar)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talepleri_listele(
    p_kategori text DEFAULT NULL,
    p_sehir text DEFAULT NULL,
    p_aciliyet text DEFAULT NULL,
    p_limit int DEFAULT 20,
    p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    lim int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
    off int := GREATEST(0, COALESCE(p_offset, 0));
    has_is_seed boolean := public._aurix_col_exists('is_talepleri', 'is_seed');
    rows jsonb;
    seed_clause text := '';
BEGIN
    IF has_is_seed THEN
        seed_clause := ' AND COALESCE(i.is_seed, FALSE) IS FALSE';
    END IF;

    EXECUTE format(
        $q$
        SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.siralama DESC NULLS LAST, x.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                i.id,
                i.baslik,
                CASE
                    WHEN char_length(COALESCE(i.aciklama, '')) > 220
                        THEN left(i.aciklama, 220) || '…'
                    ELSE i.aciklama
                END AS aciklama_ozet,
                i.kategori,
                i.sehir,
                i.ilce,
                i.durum,
                i.aciliyet,
                i.urun_turu,
                i.adet,
                i.malzeme,
                CASE WHEN COALESCE(i.gram_gorunur, FALSE) THEN i.tahmini_gram ELSE NULL END AS tahmini_gram,
                i.teslim_tarihi,
                i.teslim_sekli,
                i.butce_tipi,
                i.para_birimi,
                CASE
                    WHEN COALESCE(i.butce_gorunurlugu, 'dogrulanmis_firmalar') = 'herkese'
                        THEN i.butce_min
                    ELSE NULL
                END AS butce_min,
                CASE
                    WHEN COALESCE(i.butce_gorunurlugu, 'dogrulanmis_firmalar') = 'herkese'
                        THEN i.butce_max
                    ELSE NULL
                END AS butce_max,
                CASE
                    WHEN COALESCE(i.butce_gorunurlugu, 'dogrulanmis_firmalar') = 'herkese'
                         AND (i.butce_min IS NOT NULL OR i.butce_max IS NOT NULL)
                        THEN 'gorunur'
                    WHEN i.butce_tipi = 'teklif_bekliyorum'
                        THEN 'Teklif bekliyor'
                    ELSE 'Teklif bekliyor'
                END AS butce_etiket,
                CASE
                    WHEN COALESCE(i.sahip_gizli, FALSE) THEN 'Gizli sahip'
                    ELSE 'İşveren'
                END AS sahip_etiket,
                i.yayinlanma_tarihi,
                i.created_at,
                COALESCE(i.yayinlanma_tarihi, i.created_at) AS siralama,
                (
                    SELECT COUNT(*)::int
                    FROM public.is_talebi_dosyalari d
                    WHERE d.is_talebi_id = i.id
                ) AS dosya_sayisi
            FROM public.is_talepleri i
            WHERE i.durum IN ('Acik', 'teklif_bekliyor')
              AND (i.moderasyon_durumu IS NULL OR i.moderasyon_durumu = 'aktif')
              %s
              AND ($1 IS NULL OR btrim($1) = '' OR i.kategori ILIKE btrim($1))
              AND ($2 IS NULL OR btrim($2) = '' OR i.sehir ILIKE btrim($2))
              AND ($3 IS NULL OR btrim($3) = '' OR i.aciliyet = btrim($3))
            ORDER BY COALESCE(i.yayinlanma_tarihi, i.created_at) DESC NULLS LAST
            LIMIT $4 OFFSET $5
        ) x
        $q$,
        seed_clause
    )
    INTO rows
    USING p_kategori, p_sehir, p_aciliyet, lim, off;

    RETURN jsonb_build_object(
        'ok', true,
        'items', COALESCE(rows, '[]'::jsonb),
        'limit', lim,
        'offset', off
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_talepleri_listele(text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talepleri_listele(text, text, text, int, int) TO anon, authenticated;

COMMENT ON FUNCTION public.is_talepleri_listele(text, text, text, int, int) IS
    'Yayındaki iş talepleri listesi. E-posta/telefon/storage_path yok.';

-- ============================================================
-- 13. is_talebi_detay
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_detay(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    r record;
    sahip_mi boolean := false;
    admin_mi boolean := false;
    butce_goster boolean := false;
    dosya_sayisi int := 0;
    seed_flag boolean := false;
    sonuc jsonb;
BEGIN
    IF p_id IS NULL OR btrim(p_id) = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;

    admin_mi := COALESCE(public.is_admin(), false);

    SELECT i.* INTO r
    FROM public.is_talepleri i
    WHERE i.id::text = btrim(p_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    sahip_mi := uid IS NOT NULL AND (r.kullanici_id = uid OR r.owner_id = uid);

    IF NOT admin_mi AND NOT sahip_mi THEN
        IF r.durum NOT IN ('Acik', 'teklif_bekliyor')
           OR (r.moderasyon_durumu IS NOT NULL AND r.moderasyon_durumu <> 'aktif')
        THEN
            RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
        END IF;
        IF public._aurix_col_exists('is_talepleri', 'is_seed') THEN
            EXECUTE
                'SELECT COALESCE(is_seed, FALSE) FROM public.is_talepleri WHERE id::text = $1'
                INTO seed_flag
                USING btrim(p_id);
            IF seed_flag THEN
                RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    SELECT COUNT(*)::int INTO dosya_sayisi
    FROM public.is_talebi_dosyalari d
    WHERE d.is_talebi_id = r.id;

    butce_goster := sahip_mi OR admin_mi
        OR COALESCE(r.butce_gorunurlugu, '') = 'herkese';

    sonuc := jsonb_build_object(
        'ok', true,
        'id', r.id,
        'baslik', r.baslik,
        'aciklama', r.aciklama,
        'kategori', r.kategori,
        'sehir', r.sehir,
        'ilce', r.ilce,
        'durum', r.durum,
        'aciliyet', r.aciliyet,
        'urun_turu', r.urun_turu,
        'teknik_bilgiler', r.teknik_bilgiler,
        'adet', r.adet,
        'malzeme', r.malzeme,
        'tahmini_gram', CASE
            WHEN sahip_mi OR admin_mi OR COALESCE(r.gram_gorunur, FALSE)
                THEN r.tahmini_gram
            ELSE NULL
        END,
        'gram_gorunur', COALESCE(r.gram_gorunur, FALSE),
        'malzeme_saglayici', r.malzeme_saglayici,
        'tas_durumu', r.tas_durumu,
        'teslim_tarihi', r.teslim_tarihi,
        'teslim_sekli', r.teslim_sekli,
        'butce_tipi', r.butce_tipi,
        'para_birimi', r.para_birimi,
        'butce_min', CASE WHEN butce_goster THEN r.butce_min ELSE NULL END,
        'butce_max', CASE WHEN butce_goster THEN r.butce_max ELSE NULL END,
        'butce_etiket', CASE
            WHEN butce_goster AND (r.butce_min IS NOT NULL OR r.butce_max IS NOT NULL) THEN 'gorunur'
            ELSE 'Teklif bekliyor'
        END,
        'butce_gorunurlugu', r.butce_gorunurlugu,
        'gorunurluk', r.gorunurluk,
        'sahip_etiket', CASE
            WHEN COALESCE(r.sahip_gizli, FALSE) AND NOT sahip_mi AND NOT admin_mi
                THEN 'Gizli sahip'
            WHEN sahip_mi THEN 'Siz'
            ELSE 'İşveren'
        END,
        'sahip_gizli', COALESCE(r.sahip_gizli, FALSE),
        'dosya_gorunurlugu', r.dosya_gorunurlugu,
        'dosya_sayisi', dosya_sayisi,
        'yayinlanma_tarihi', r.yayinlanma_tarihi,
        'created_at', r.created_at,
        'guncellenme_tarihi', r.guncellenme_tarihi,
        'sahip_mi', sahip_mi,
        'moderasyon_durumu', CASE
            WHEN admin_mi OR sahip_mi THEN r.moderasyon_durumu
            ELSE NULL
        END
    );

    RETURN sonuc;
END;
$$;

REVOKE ALL ON FUNCTION public.is_talebi_detay(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_detay(text) TO anon, authenticated;

COMMENT ON FUNCTION public.is_talebi_detay(text) IS
    'İş talebi detayı. Yetkisizlere yalnızca yayınlanmış kayıt; PII/storage_path yok.';

-- ============================================================
-- 14. Dosya RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_dosya_kaydet(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    talep_id text := NULLIF(btrim(COALESCE(p_payload->>'is_talebi_id', '')), '');
    path text := NULLIF(btrim(COALESCE(p_payload->>'storage_path', '')), '');
    tur text := COALESCE(NULLIF(btrim(p_payload->>'dosya_turu'), ''), 'gorsel');
    is_id_type text := public._aurix_col_type('is_talepleri', 'id');
    new_id uuid;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
    END IF;
    IF talep_id IS NULL OR path IS NULL THEN
        RAISE EXCEPTION 'eksik_alan' USING ERRCODE = '22023';
    END IF;
    IF tur NOT IN ('gorsel', 'teknik') THEN
        RAISE EXCEPTION 'dosya_turu_gecersiz' USING ERRCODE = '22023';
    END IF;
    IF NOT public._is_talebi_sahip_mi(talep_id) THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;
    -- path: {uid}/...
    IF split_part(path, '/', 1) <> uid::text AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'storage_path_yetkisiz' USING ERRCODE = '42501';
    END IF;

    EXECUTE format(
        $sql$
        INSERT INTO public.is_talebi_dosyalari (
            is_talebi_id, kullanici_id, storage_path, orijinal_dosya_adi,
            mime_type, boyut_bytes, dosya_turu, sira
        ) VALUES (
            $1::%s, $2, $3, $4, $5, $6, $7, $8
        )
        RETURNING id
        $sql$,
        is_id_type
    )
    INTO new_id
    USING
        talep_id,
        uid,
        path,
        NULLIF(btrim(COALESCE(p_payload->>'orijinal_dosya_adi', '')), ''),
        NULLIF(btrim(COALESCE(p_payload->>'mime_type', '')), ''),
        NULLIF(btrim(COALESCE(p_payload->>'boyut_bytes', '')), '')::bigint,
        tur,
        COALESCE(NULLIF(btrim(COALESCE(p_payload->>'sira', '')), '')::int, 0);

    RETURN jsonb_build_object('ok', true, 'id', new_id, 'storage_path', path);
END;
$$;

REVOKE ALL ON FUNCTION public.is_talebi_dosya_kaydet(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_dosya_kaydet(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_talebi_dosya_imzali_url(
    p_dosya_id uuid,
    p_saniye int DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    d record;
    sn int := GREATEST(30, LEAST(COALESCE(p_saniye, 120), 3600));
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO d
    FROM public.is_talebi_dosyalari x
    WHERE x.id = p_dosya_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'dosya_yok' USING ERRCODE = 'P0002';
    END IF;

    -- Şimdilik yalnız sahip / admin (teklif veren erişimi TODO)
    IF NOT public.is_admin()
       AND d.kullanici_id IS DISTINCT FROM uid
       AND NOT public._is_talebi_sahip_mi(d.is_talebi_id::text)
    THEN
        RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'bucket', 'is-talebi-dosyalari',
        'path', d.storage_path,
        'expires_in', sn,
        'mime_type', d.mime_type,
        'orijinal_dosya_adi', d.orijinal_dosya_adi
        /* İstemci createSignedUrl(bucket, path, expires_in) çağırır */
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_talebi_dosya_imzali_url(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_dosya_imzali_url(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.is_talebi_dosya_imzali_url(uuid, int) IS
    'Private bucket path döner; imzalı URL istemci storage API ile üretilir. Sahip/admin.';

-- ============================================================
-- 15. admin_is_talebi_moderasyon
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_is_talebi_moderasyon(
    p_id text,
    p_islem text,
    p_not text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    islem text := lower(btrim(COALESCE(p_islem, '')));
    eski_durum text;
    eski_mod text;
    yeni_durum text;
    yeni_mod text;
    is_id_type text := public._aurix_col_type('is_talepleri', 'id');
    pid text := btrim(COALESCE(p_id, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF islem NOT IN ('yayindan_kaldir', 'tekrar_yayin', 'iptal', 'arsiv') THEN
        RAISE EXCEPTION 'gecersiz_islem' USING ERRCODE = '22023';
    END IF;

    SELECT i.durum, i.moderasyon_durumu
    INTO eski_durum, eski_mod
    FROM public.is_talepleri i
    WHERE i.id::text = pid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok' USING ERRCODE = 'P0002';
    END IF;

    yeni_durum := eski_durum;
    yeni_mod := eski_mod;

    IF islem = 'yayindan_kaldir' THEN
        yeni_mod := 'kaldirildi';
        IF length(btrim(COALESCE(p_not, ''))) < 3 THEN
            RAISE EXCEPTION 'kaldirma_nedeni_zorunlu' USING ERRCODE = '22023';
        END IF;
    ELSIF islem = 'tekrar_yayin' THEN
        yeni_mod := 'aktif';
        IF eski_durum IN ('taslak', 'iptal_edildi', 'arsivlendi', 'Iptal') THEN
            yeni_durum := 'teklif_bekliyor';
        ELSIF eski_durum IS NULL OR eski_durum = '' THEN
            yeni_durum := 'teklif_bekliyor';
        END IF;
        UPDATE public.is_talepleri SET
            yayinlanma_tarihi = COALESCE(yayinlanma_tarihi, NOW()),
            arsiv_tarihi = NULL,
            iptal_tarihi = NULL
        WHERE id::text = pid;
    ELSIF islem = 'iptal' THEN
        yeni_durum := 'iptal_edildi';
        UPDATE public.is_talepleri SET iptal_tarihi = NOW()
        WHERE id::text = pid;
    ELSIF islem = 'arsiv' THEN
        yeni_durum := 'arsivlendi';
        UPDATE public.is_talepleri SET arsiv_tarihi = NOW()
        WHERE id::text = pid;
    END IF;

    UPDATE public.is_talepleri SET
        durum = yeni_durum,
        moderasyon_durumu = COALESCE(yeni_mod, moderasyon_durumu),
        moderasyon_notu = CASE
            WHEN islem = 'tekrar_yayin' THEN NULL
            WHEN p_not IS NOT NULL THEN btrim(p_not)
            ELSE moderasyon_notu
        END
    WHERE id::text = pid;

    EXECUTE format(
        $sql$
        INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar)
        VALUES ($1::%s, $2, $3, $4)
        $sql$,
        is_id_type
    ) USING pid, auth.uid(), islem, NULLIF(btrim(COALESCE(p_not, '')), '');

    IF to_regclass('public.admin_islem_kayitlari') IS NOT NULL
       AND is_id_type LIKE 'uuid%' THEN
        BEGIN
            PERFORM public._admin_log(
                'is_talebi_' || islem,
                'is_talebi',
                pid::uuid,
                COALESCE(p_not, islem),
                jsonb_build_object('durum', eski_durum, 'moderasyon_durumu', eski_mod),
                jsonb_build_object('durum', yeni_durum, 'moderasyon_durumu', yeni_mod)
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'admin_islem_kayitlari: %', SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', pid,
        'islem', islem,
        'durum', yeni_durum,
        'moderasyon_durumu', yeni_mod
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public._is_talebi_sahip_mi(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_talebi_resolve_firma_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_talebi_validate_payload(jsonb, boolean) FROM PUBLIC;

-- ============================================================
-- 16. admin_is_listesi — dosya_sayisi + yeni kolonlar (021 stili)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_is_listesi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    rows jsonb;
    owner_expr text;
    join_expr text;
    kullanici_expr text;
    aciliyet_expr text;
    dosya_expr text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF public._aurix_col_exists('is_talepleri', 'owner_id') THEN
        owner_expr := 'i.owner_id';
        join_expr := 'LEFT JOIN public.profiles p ON p.id = COALESCE(i.kullanici_id, i.owner_id)';
    ELSIF public._aurix_col_exists('is_talepleri', 'kullanici_id') THEN
        owner_expr := 'i.kullanici_id';
        join_expr := 'LEFT JOIN public.profiles p ON p.id = i.kullanici_id';
    ELSIF public._aurix_col_exists('is_talepleri', 'user_id') THEN
        owner_expr := 'i.user_id';
        join_expr := 'LEFT JOIN public.profiles p ON p.id = i.user_id';
    ELSE
        owner_expr := 'NULL::uuid';
        join_expr := 'LEFT JOIN public.profiles p ON FALSE';
    END IF;

    IF public._aurix_col_exists('is_talepleri', 'kullanici_id') THEN
        kullanici_expr := 'i.kullanici_id';
    ELSE
        kullanici_expr := 'NULL::uuid';
    END IF;

    IF public._aurix_col_exists('is_talepleri', 'aciliyet') THEN
        aciliyet_expr := 'i.aciliyet';
    ELSE
        aciliyet_expr := 'NULL::text';
    END IF;

    IF to_regclass('public.is_talebi_dosyalari') IS NOT NULL THEN
        dosya_expr :=
            '(SELECT COUNT(*)::int FROM public.is_talebi_dosyalari d WHERE d.is_talebi_id = i.id)';
    ELSE
        dosya_expr := '0';
    END IF;

    EXECUTE format(
        $q$
        SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
        FROM (
            SELECT
                i.id, i.baslik, i.kategori, i.sehir, i.durum, i.created_at,
                COALESCE(i.moderasyon_durumu, 'aktif') AS moderasyon_durumu,
                i.moderasyon_notu,
                %s AS owner_id,
                %s AS kullanici_id,
                %s AS aciliyet,
                p.ad_soyad AS olusturan_ad,
                (SELECT COUNT(*)::int FROM public.teklifler t WHERE t.is_id = i.id) AS teklif_sayisi,
                %s AS dosya_sayisi
            FROM public.is_talepleri i
            %s
        ) x
        $q$,
        owner_expr,
        kullanici_expr,
        aciliyet_expr,
        dosya_expr,
        join_expr
    ) INTO rows;

    RETURN COALESCE(rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_is_listesi() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_is_listesi() TO authenticated;

COMMENT ON FUNCTION public.admin_is_listesi() IS
    'Admin iş talepleri listesi (+ dosya_sayisi, aciliyet, kullanici_id).';

NOTIFY pgrst, 'reload schema';

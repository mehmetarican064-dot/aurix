-- AURIX 032 — İş talebi yayınlama akışı düzeltmesi
-- Idempotent. DROP TABLE yok.
--
-- Bu dosya = supabase/maintenance/apply_032_is_talebi_yayinlama_akisi.sql
-- SQL Editor’da YALNIZCA BİRİNİ çalıştırın (031 sonrası).
--
-- Kesin neden: is_talebi_kaydet yalnızca p_payload.yayinla / mod bayrağına bakıyordu;
-- frontend durum='teklif_bekliyor' gönderse bile yayinla=false → kayıt 'taslak' kalıyordu.
-- Admin “Yayına aç” (tekrar_yayin) ile görünür hâle geliyordu.

DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'is_talepleri tablosu bulunamadı';
    END IF;
END $$;

-- ============================================================
-- 1. moderasyon_durumu: yayindan_kaldirildi desteği + varsayılan aktif
-- ============================================================
ALTER TABLE public.is_talepleri
    ADD COLUMN IF NOT EXISTS moderasyon_durumu TEXT;

ALTER TABLE public.is_talepleri
    ADD COLUMN IF NOT EXISTS yayinlanma_tarihi TIMESTAMPTZ;

-- ÖNCE CHECK drop (013: aktif|incelemede|kaldirildi). UPDATE önce olursa 032 fail eder.
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_check;
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_durumu_check;

-- Eski 'kaldirildi' → yeni standart
UPDATE public.is_talepleri
SET moderasyon_durumu = 'yayindan_kaldirildi'
WHERE moderasyon_durumu IS NOT NULL
  AND lower(btrim(moderasyon_durumu)) IN ('kaldirildi', 'yayindan_kaldirildi')
  AND moderasyon_durumu IS DISTINCT FROM 'yayindan_kaldirildi';

-- NULL moderasyon → aktif (yalnızca yayınlanmış / açık taleplerde)
UPDATE public.is_talepleri
SET moderasyon_durumu = 'aktif'
WHERE moderasyon_durumu IS NULL
  AND durum IN ('Acik', 'teklif_bekliyor');

-- Legacy Acik → teklif_bekliyor (veri kaybı yok)
UPDATE public.is_talepleri
SET durum = 'teklif_bekliyor'
WHERE durum = 'Acik';

-- Yayınlanmış ama tarih yoksa created_at ile doldur
UPDATE public.is_talepleri
SET yayinlanma_tarihi = COALESCE(yayinlanma_tarihi, created_at, NOW())
WHERE durum = 'teklif_bekliyor'
  AND yayinlanma_tarihi IS NULL;

-- Taslaklarda yayın tarihi olmasın
UPDATE public.is_talepleri
SET yayinlanma_tarihi = NULL
WHERE durum = 'taslak'
  AND yayinlanma_tarihi IS NOT NULL;

DO $$
BEGIN
    BEGIN
        ALTER TABLE public.is_talepleri
            ALTER COLUMN moderasyon_durumu SET DEFAULT 'aktif';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'moderasyon default: %', SQLERRM;
    END;

    ALTER TABLE public.is_talepleri
        DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_check;
    ALTER TABLE public.is_talepleri
        DROP CONSTRAINT IF EXISTS is_talepleri_moderasyon_durumu_check;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'is_talepleri_moderasyon_durumu_check'
          AND conrelid = 'public.is_talepleri'::regclass
    ) THEN
        ALTER TABLE public.is_talepleri
            ADD CONSTRAINT is_talepleri_moderasyon_durumu_check
            CHECK (
                moderasyon_durumu IS NULL
                OR moderasyon_durumu IN (
                    'aktif', 'incelemede', 'yayindan_kaldirildi'
                )
            );
    END IF;
END $$;

-- ============================================================
-- 2. is_talebi_kaydet — yayın bayrağı + durum + moderasyon
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_kaydet(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    p jsonb := COALESCE(p_payload, '{}'::jsonb);
    durum_in text := lower(btrim(COALESCE(p->>'durum', '')));
    yayinla boolean;
    istemci text := NULLIF(btrim(COALESCE(p->>'istemci_anahtar', '')), '');
    mevcut_id text := NULLIF(btrim(COALESCE(p->>'id', '')), '');
    firma_resolved text;
    firma_id_type text;
    row_id text;
    yeni_durum text;
    eski_durum text;
    yeni_mod text;
    was_update boolean := false;
    out_yayin timestamptz;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
    END IF;

    -- Yayın sinyali: açık bayrak VEYA durum=teklif_bekliyor / Acik / publish
    yayinla := COALESCE((NULLIF(btrim(COALESCE(p->>'yayinla', '')), ''))::boolean, false)
        OR lower(COALESCE(p->>'mod', '')) IN ('yayinla', 'publish', 'yayin')
        OR durum_in IN ('teklif_bekliyor', 'acik', 'publish', 'yayinda');

    -- Explicit taslak
    IF durum_in IN ('taslak', 'draft') AND NOT COALESCE((p->>'yayinla')::boolean, false) THEN
        yayinla := false;
    END IF;

    PERFORM public._is_talebi_validate_payload(p, yayinla);

    firma_resolved := public._is_talebi_resolve_firma_id(uid);
    firma_id_type := public._aurix_col_type('firmalar', 'id');

    IF mevcut_id IS NULL AND istemci IS NOT NULL THEN
        SELECT i.id::text INTO mevcut_id
        FROM public.is_talepleri i
        WHERE i.kullanici_id = uid
          AND i.istemci_anahtar = istemci
        LIMIT 1;
    END IF;

    IF yayinla THEN
        yeni_durum := 'teklif_bekliyor';
        yeni_mod := 'aktif';
    ELSE
        yeni_durum := 'taslak';
        yeni_mod := NULL; -- taslakta moderasyon zorunlu değil
    END IF;

    IF mevcut_id IS NOT NULL THEN
        SELECT i.durum INTO eski_durum
        FROM public.is_talepleri i
        WHERE i.id::text = mevcut_id
          AND (
              i.kullanici_id = uid
              OR (public._aurix_col_exists('is_talepleri', 'owner_id') AND i.owner_id = uid)
          )
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'is_yok_veya_yetkisiz' USING ERRCODE = '42501';
        END IF;

        IF eski_durum NOT IN (
            'taslak', 'teklif_bekliyor', 'Acik',
            'iptal_edildi', 'arsivlendi'
        ) AND eski_durum IS NOT NULL THEN
            -- İptal/arsiv dışındaki ileri durumlar kullanıcı tarafından geri alınamaz
            IF eski_durum NOT IN ('taslak', 'teklif_bekliyor', 'Acik') THEN
                RAISE EXCEPTION 'durum_guncellenemez' USING ERRCODE = '22023';
            END IF;
        END IF;

        -- İptal/arsivden tekrar yayınlama engeli (admin yolu ayrı)
        IF eski_durum IN ('iptal_edildi', 'arsivlendi', 'Iptal') AND yayinla THEN
            RAISE EXCEPTION 'durum_guncellenemez' USING ERRCODE = '22023';
        END IF;

        UPDATE public.is_talepleri SET
            baslik = btrim(p->>'baslik'),
            aciklama = NULLIF(p->>'aciklama', ''),
            kategori = NULLIF(btrim(COALESCE(p->>'kategori', '')), ''),
            sehir = NULLIF(btrim(COALESCE(p->>'sehir', '')), ''),
            ilce = NULLIF(btrim(COALESCE(p->>'ilce', '')), ''),
            urun_turu = NULLIF(btrim(COALESCE(p->>'urun_turu', '')), ''),
            teknik_bilgiler = NULLIF(p->>'teknik_bilgiler', ''),
            adet = NULLIF(btrim(COALESCE(p->>'adet', '')), '')::int,
            malzeme = NULLIF(btrim(COALESCE(p->>'malzeme', '')), ''),
            tahmini_gram = NULLIF(btrim(COALESCE(p->>'tahmini_gram', '')), '')::numeric,
            gram_gorunur = COALESCE((p->>'gram_gorunur')::boolean, gram_gorunur, FALSE),
            malzeme_saglayici = NULLIF(btrim(COALESCE(p->>'malzeme_saglayici', '')), ''),
            tas_durumu = NULLIF(btrim(COALESCE(p->>'tas_durumu', '')), ''),
            teslim_tarihi = NULLIF(btrim(COALESCE(p->>'teslim_tarihi', '')), '')::date,
            aciliyet = COALESCE(NULLIF(btrim(p->>'aciliyet'), ''), aciliyet, 'standart'),
            teslim_sekli = NULLIF(btrim(COALESCE(p->>'teslim_sekli', '')), ''),
            butce_tipi = COALESCE(NULLIF(btrim(p->>'butce_tipi'), ''), butce_tipi, 'teklif_bekliyorum'),
            butce_min = NULLIF(btrim(COALESCE(p->>'butce_min', '')), '')::numeric,
            butce_max = NULLIF(btrim(COALESCE(p->>'butce_max', '')), '')::numeric,
            para_birimi = COALESCE(NULLIF(btrim(p->>'para_birimi'), ''), para_birimi, 'TRY'),
            butce_gorunurlugu = COALESCE(NULLIF(btrim(p->>'butce_gorunurlugu'), ''), butce_gorunurlugu, 'dogrulanmis_firmalar'),
            gorunurluk = COALESCE(NULLIF(btrim(p->>'gorunurluk'), ''), gorunurluk, 'tum_dogrulanmis_firmalar'),
            sahip_gizli = COALESCE((p->>'sahip_gizli')::boolean, sahip_gizli, FALSE),
            dosya_gorunurlugu = COALESCE(NULLIF(btrim(p->>'dosya_gorunurlugu'), ''), dosya_gorunurlugu, 'talebi_gorenler'),
            kullanici_id = COALESCE(kullanici_id, uid),
            owner_id = COALESCE(owner_id, uid),
            durum = yeni_durum,
            yayinlanma_tarihi = CASE
                WHEN yayinla THEN COALESCE(yayinlanma_tarihi, NOW())
                ELSE NULL
            END,
            -- Kullanıcı yayını: her zaman aktif (admin kaldırmışsa kullanıcı tekrar yayınlayınca aktif)
            moderasyon_durumu = CASE
                WHEN yayinla THEN 'aktif'
                ELSE COALESCE(moderasyon_durumu, 'aktif')
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
            btrim(p->>'baslik'),
            NULLIF(p->>'aciklama', ''),
            NULLIF(btrim(COALESCE(p->>'kategori', '')), ''),
            NULLIF(btrim(COALESCE(p->>'sehir', '')), ''),
            NULLIF(btrim(COALESCE(p->>'ilce', '')), ''),
            NULLIF(btrim(COALESCE(p->>'urun_turu', '')), ''),
            NULLIF(p->>'teknik_bilgiler', ''),
            NULLIF(btrim(COALESCE(p->>'adet', '')), '')::int,
            NULLIF(btrim(COALESCE(p->>'malzeme', '')), ''),
            NULLIF(btrim(COALESCE(p->>'tahmini_gram', '')), '')::numeric,
            COALESCE((p->>'gram_gorunur')::boolean, FALSE),
            NULLIF(btrim(COALESCE(p->>'malzeme_saglayici', '')), ''),
            NULLIF(btrim(COALESCE(p->>'tas_durumu', '')), ''),
            NULLIF(btrim(COALESCE(p->>'teslim_tarihi', '')), '')::date,
            COALESCE(NULLIF(btrim(p->>'aciliyet'), ''), 'standart'),
            NULLIF(btrim(COALESCE(p->>'teslim_sekli', '')), ''),
            COALESCE(NULLIF(btrim(p->>'butce_tipi'), ''), 'teklif_bekliyorum'),
            NULLIF(btrim(COALESCE(p->>'butce_min', '')), '')::numeric,
            NULLIF(btrim(COALESCE(p->>'butce_max', '')), '')::numeric,
            COALESCE(NULLIF(btrim(p->>'para_birimi'), ''), 'TRY'),
            COALESCE(NULLIF(btrim(p->>'butce_gorunurlugu'), ''), 'dogrulanmis_firmalar'),
            COALESCE(NULLIF(btrim(p->>'gorunurluk'), ''), 'tum_dogrulanmis_firmalar'),
            COALESCE((p->>'sahip_gizli')::boolean, FALSE),
            COALESCE(NULLIF(btrim(p->>'dosya_gorunurlugu'), ''), 'talebi_gorenler'),
            uid,
            uid,
            yeni_durum,
            CASE WHEN yayinla THEN NOW() ELSE NULL END,
            CASE WHEN yayinla THEN 'aktif' ELSE 'aktif' END,
            istemci,
            NOW()
        )
        RETURNING id::text INTO row_id;
    END IF;

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

    SELECT i.durum, i.yayinlanma_tarihi, i.moderasyon_durumu
    INTO yeni_durum, out_yayin, yeni_mod
    FROM public.is_talepleri i
    WHERE i.id::text = row_id;

    RETURN jsonb_build_object(
        'ok', true,
        'id', row_id,
        'durum', yeni_durum,
        'moderasyon_durumu', yeni_mod,
        'yayinlanma_tarihi', out_yayin,
        'yayinlandi', (yeni_durum = 'teklif_bekliyor' AND COALESCE(yeni_mod, 'aktif') = 'aktif' AND out_yayin IS NOT NULL),
        'idempotent', was_update AND istemci IS NOT NULL
    );
EXCEPTION
    WHEN unique_violation THEN
        SELECT i.id::text, i.durum, i.yayinlanma_tarihi, i.moderasyon_durumu
        INTO row_id, yeni_durum, out_yayin, yeni_mod
        FROM public.is_talepleri i
        WHERE i.kullanici_id = uid AND i.istemci_anahtar = istemci
        LIMIT 1;
        RETURN jsonb_build_object(
            'ok', true,
            'id', row_id,
            'durum', yeni_durum,
            'moderasyon_durumu', yeni_mod,
            'yayinlanma_tarihi', out_yayin,
            'yayinlandi', (yeni_durum = 'teklif_bekliyor' AND COALESCE(yeni_mod, 'aktif') = 'aktif' AND out_yayin IS NOT NULL),
            'idempotent', true
        );
END;
$$;

REVOKE ALL ON FUNCTION public.is_talebi_kaydet(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_kaydet(jsonb) TO authenticated;

COMMENT ON FUNCTION public.is_talebi_kaydet(jsonb) IS
    '032: Taslak (yayinla=false) veya yayın (yayinla/durum=teklif_bekliyor). Yayın→aktif+yayinlanma_tarihi.';

-- ============================================================
-- 3. is_talepleri_listele — yayınlanmış + aktif
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
                    ELSE 'Teklif bekliyor'
                END AS butce_etiket,
                CASE
                    WHEN COALESCE(i.sahip_gizli, FALSE) THEN
                        'Kuyumculuk firması' || CASE
                            WHEN i.sehir IS NOT NULL AND btrim(i.sehir) <> '' THEN ' — ' || i.sehir
                            ELSE ''
                        END
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
            WHERE i.durum IN ('teklif_bekliyor', 'Acik')
              AND COALESCE(i.moderasyon_durumu, 'aktif') = 'aktif'
              AND i.yayinlanma_tarihi IS NOT NULL
              AND i.durum NOT IN ('taslak', 'iptal_edildi', 'arsivlendi')
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
    '032: durum=teklif_bekliyor|Acik, moderasyon=aktif, yayinlanma_tarihi NOT NULL. Taslak yok.';

-- ============================================================
-- 4. admin_is_talebi_moderasyon — yayindan_kaldirildi standardı
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

    -- Eski isim uyumu
    IF islem IN ('kaldirildi', 'kaldir', 'yayindan_kaldir') THEN
        islem := 'yayindan_kaldir';
    ELSIF islem IN ('aktif', 'tekrar_yayin', 'yayina_ac') THEN
        islem := 'tekrar_yayin';
    END IF;

    IF islem NOT IN ('yayindan_kaldir', 'tekrar_yayin', 'iptal', 'arsiv', 'incelemede') THEN
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
        yeni_mod := 'yayindan_kaldirildi';
        IF length(btrim(COALESCE(p_not, ''))) < 3 THEN
            RAISE EXCEPTION 'kaldirma_nedeni_zorunlu' USING ERRCODE = '22023';
        END IF;
    ELSIF islem = 'tekrar_yayin' THEN
        yeni_mod := 'aktif';
        IF eski_durum IN ('taslak', 'iptal_edildi', 'arsivlendi', 'Iptal', 'Acik')
           OR eski_durum IS NULL OR eski_durum = '' THEN
            yeni_durum := 'teklif_bekliyor';
        END IF;
        UPDATE public.is_talepleri SET
            yayinlanma_tarihi = COALESCE(yayinlanma_tarihi, NOW()),
            arsiv_tarihi = NULL,
            iptal_tarihi = NULL
        WHERE id::text = pid;
    ELSIF islem = 'incelemede' THEN
        yeni_mod := 'incelemede';
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

    IF to_regclass('public.is_talebi_islem_loglari') IS NOT NULL AND is_id_type IS NOT NULL THEN
        BEGIN
            EXECUTE format(
                $sql$
                INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar)
                VALUES ($1::%s, $2, $3, $4)
                $sql$,
                is_id_type
            ) USING pid, auth.uid(), islem, NULLIF(btrim(COALESCE(p_not, '')), '');
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'islem_log: %', SQLERRM;
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

-- ============================================================
-- 5. Public SELECT politikası — teklif_bekliyor + aktif
-- ============================================================
DO $$
DECLARE
    has_owner boolean := public._aurix_col_exists('is_talepleri', 'owner_id');
    has_kullanici boolean := public._aurix_col_exists('is_talepleri', 'kullanici_id');
    using_sql text;
BEGIN
    DROP POLICY IF EXISTS "is_talepleri_public_select" ON public.is_talepleri;
    DROP POLICY IF EXISTS "is_talepleri_anon_select_acik" ON public.is_talepleri;
    DROP POLICY IF EXISTS "is_talepleri_select_yayin" ON public.is_talepleri;
    DROP POLICY IF EXISTS "is_talepleri_select_yayin_032" ON public.is_talepleri;

    using_sql := $u$
        (
            durum IN ('teklif_bekliyor', 'Acik')
            AND COALESCE(moderasyon_durumu, 'aktif') = 'aktif'
            AND yayinlanma_tarihi IS NOT NULL
        )
        OR public.is_admin()
    $u$;

    IF has_kullanici THEN
        using_sql := using_sql || ' OR (kullanici_id = auth.uid())';
    END IF;
    IF has_owner THEN
        using_sql := using_sql || ' OR (owner_id = auth.uid())';
    END IF;

    EXECUTE format(
        'CREATE POLICY "is_talepleri_select_yayin_032" ON public.is_talepleri FOR SELECT TO anon, authenticated USING (%s)',
        using_sql
    );
    RAISE NOTICE '032 yayınlama akışı uygulandı.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '032 select policy: %', SQLERRM;
END $$;

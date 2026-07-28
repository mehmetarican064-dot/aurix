-- AURIX 034 — İş talebi modülü production stabilizasyonu
-- Idempotent. DROP TABLE yok. Veri kaybı olmadan normalize eder.
--
-- Bu dosya = supabase/migrations/034_is_talebi_production_stabilizasyon.sql
-- SQL Editor'da YALNIZCA BİRİNİ çalıştırın (031, 032, 033 sonrası).
--
-- KESİN BULUNAN HATA (audit sonucu, tahmin değil):
-- is_talebi_kaydet, UPDATE'te durum'u HER ZAMAN yayinla bayrağına göre
-- yeniden hesaplıyordu: `durum = CASE WHEN yayinla THEN 'teklif_bekliyor' ELSE 'taslak' END`.
-- Bu satır zaten yayınlanmış (teklif_bekliyor) bir talebi, kullanıcı sadece
-- düzenleyip "Taslak Kaydet" tetiklerse (örn. autosave eski istemci_anahtar'ı
-- yeniden kullanırsa) SESSİZCE taslağa düşürüyordu → talep listeden kaybolur.
-- Bu migration bu davranışı düzeltir + durum enum'unu tekleştirir + eksik
-- sahip (owner) self-servis RPC'lerini ekler.

DO $$
BEGIN
    IF to_regclass('public.is_talepleri') IS NULL THEN
        RAISE EXCEPTION 'is_talepleri tablosu bulunamadı';
    END IF;
END $$;

-- ============================================================
-- 1. durum — eski CHECK DROP (normalize öncesi; kilitli constraint altında
--    UPDATE çalıştırmak 032 hatasının aynısını tekrarlar)
-- ============================================================
ALTER TABLE public.is_talepleri
    DROP CONSTRAINT IF EXISTS is_talepleri_durum_check;

-- ============================================================
-- 2. durum — eski production değerlerini normalize et (veri kaybı yok)
-- ============================================================
UPDATE public.is_talepleri SET durum = 'teklif_bekliyor' WHERE durum = 'Acik';
UPDATE public.is_talepleri SET durum = 'tamamlandi' WHERE durum = 'Tamamlandi';
UPDATE public.is_talepleri SET durum = 'iptal_edildi' WHERE durum = 'Iptal';

-- ============================================================
-- 3. durum / moderasyon_durumu — DISTINCT raporu (tahmin değil, canlı tablo)
-- ============================================================
DO $$
DECLARE
    r record;
BEGIN
    RAISE NOTICE '034: DISTINCT is_talepleri.durum (normalize sonrası)';
    FOR r IN
        SELECT durum AS deger, COUNT(*)::int AS adet
        FROM public.is_talepleri
        GROUP BY durum
        ORDER BY adet DESC, durum NULLS FIRST
    LOOP
        RAISE NOTICE '  durum % => % satır', COALESCE(r.deger, '<NULL>'), r.adet;
    END LOOP;

    RAISE NOTICE '034: DISTINCT is_talepleri.moderasyon_durumu';
    FOR r IN
        SELECT moderasyon_durumu AS deger, COUNT(*)::int AS adet
        FROM public.is_talepleri
        GROUP BY moderasyon_durumu
        ORDER BY adet DESC, moderasyon_durumu NULLS FIRST
    LOOP
        RAISE NOTICE '  moderasyon_durumu % => % satır', COALESCE(r.deger, '<NULL>'), r.adet;
    END LOOP;

    RAISE NOTICE '034: standart dışı (geçersiz kalan) durum değerleri';
    FOR r IN
        SELECT durum AS deger, COUNT(*)::int AS adet
        FROM public.is_talepleri
        WHERE durum IS NOT NULL
          AND durum NOT IN (
              'taslak', 'teklif_bekliyor', 'teklif_secildi', 'is_emri_olusturuldu',
              'uretimde', 'tamamlandi', 'iptal_edildi', 'arsivlendi'
          )
        GROUP BY durum
    LOOP
        RAISE NOTICE '  GEÇERSİZ durum % => % satır (CHECK NOT VALID ile korunur)', r.deger, r.adet;
    END LOOP;
END $$;

-- ============================================================
-- 4. durum — yeni tek standart CHECK (8 değer). Bilinmeyen legacy satır
--    varsa (raporlandı) constraint NOT VALID eklenir; yeni yazımlar
--    yalnızca 8 değeri kabul eder, mevcut satırlar bozulmaz.
-- ============================================================
ALTER TABLE public.is_talepleri
    ADD CONSTRAINT is_talepleri_durum_check
    CHECK (
        durum IS NULL
        OR durum IN (
            'taslak', 'teklif_bekliyor', 'teklif_secildi', 'is_emri_olusturuldu',
            'uretimde', 'tamamlandi', 'iptal_edildi', 'arsivlendi'
        )
    ) NOT VALID;

DO $$
BEGIN
    ALTER TABLE public.is_talepleri VALIDATE CONSTRAINT is_talepleri_durum_check;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '034: durum CHECK validate atlandı (yukarıdaki NOTICE''daki legacy satırlar): %', SQLERRM;
END $$;

-- ============================================================
-- 4b. is_talebi_islem_loglari — eski_durum / yeni_durum kolonları eksik
--     (spec: admin_id, talep_id, eski durum, yeni durum, işlem, açıklama, tarih)
-- ============================================================
ALTER TABLE public.is_talebi_islem_loglari
    ADD COLUMN IF NOT EXISTS eski_durum text,
    ADD COLUMN IF NOT EXISTS yeni_durum text;

-- ============================================================
-- 5. is_talebi_kaydet — yayınlanmış kaydı sessizce taslağa düşürme BUGU
--    düzeltildi. Admin yayindan_kaldirildi ise owner "yayinla" ile geri
--    açamaz (moderasyon admin yetkisinde kalır). Kritik alan değişikliği
--    yayınlanmış kayıtta loglanır.
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
    eski_mod text;
    eski jsonb;
    yeni_mod text;
    was_update boolean := false;
    out_yayin timestamptz;
    kritik_degisti boolean := false;
    is_id_type text;
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

    -- Varsayılan (yeni kayıt): yalnızca yayinla bayrağına bağlı
    yeni_durum := CASE WHEN yayinla THEN 'teklif_bekliyor' ELSE 'taslak' END;
    yeni_mod := CASE WHEN yayinla THEN 'aktif' ELSE 'aktif' END;

    IF mevcut_id IS NOT NULL THEN
        SELECT i.durum, i.moderasyon_durumu, to_jsonb(i)
        INTO eski_durum, eski_mod, eski
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

        -- İptal/arşiv kayıtlar bu RPC ile düzenlenemez (yalnız görüntüle/arşivle; admin yolu ayrı)
        IF eski_durum IN ('iptal_edildi', 'arsivlendi', 'Iptal') THEN
            RAISE EXCEPTION 'durum_guncellenemez' USING ERRCODE = '22023';
        END IF;

        -- === 034 DÜZELTME: yayınlanmış kayıt sessizce taslağa düşmez ===
        IF yayinla THEN
            yeni_durum := 'teklif_bekliyor';
            -- Admin "yayından kaldırıldı" işaretlemişse owner bu RPC ile geri açamaz
            IF eski_mod = 'yayindan_kaldirildi' THEN
                yeni_mod := 'yayindan_kaldirildi';
            ELSE
                yeni_mod := 'aktif';
            END IF;
        ELSIF eski_durum IN ('teklif_bekliyor', 'Acik') THEN
            -- Zaten yayında: düzenleme yayını sessizce geri almaz, moderasyon korunur
            yeni_durum := 'teklif_bekliyor';
            yeni_mod := COALESCE(eski_mod, 'aktif');
        ELSE
            yeni_durum := 'taslak';
            yeni_mod := COALESCE(eski_mod, 'aktif');
        END IF;

        -- Kritik alan değişikliği (yayınlanmış kayıtta) — audit log
        IF eski_durum IN ('teklif_bekliyor', 'Acik') THEN
            kritik_degisti :=
                COALESCE(eski->>'kategori', '') IS DISTINCT FROM COALESCE(NULLIF(btrim(COALESCE(p->>'kategori', '')), ''), '')
                OR COALESCE(eski->>'aciklama', '') IS DISTINCT FROM COALESCE(NULLIF(p->>'aciklama', ''), '')
                OR COALESCE(eski->>'teslim_tarihi', '') IS DISTINCT FROM COALESCE(NULLIF(btrim(COALESCE(p->>'teslim_tarihi', '')), ''), '')
                OR COALESCE(eski->>'butce_tipi', '') IS DISTINCT FROM COALESCE(NULLIF(btrim(p->>'butce_tipi'), ''), '')
                OR COALESCE(eski->>'butce_min', '') IS DISTINCT FROM COALESCE(NULLIF(btrim(COALESCE(p->>'butce_min', '')), ''), '')
                OR COALESCE(eski->>'butce_max', '') IS DISTINCT FROM COALESCE(NULLIF(btrim(COALESCE(p->>'butce_max', '')), ''), '');
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
                WHEN yeni_durum = 'teklif_bekliyor' THEN COALESCE(yayinlanma_tarihi, NOW())
                ELSE NULL
            END,
            moderasyon_durumu = yeni_mod,
            istemci_anahtar = COALESCE(istemci, istemci_anahtar)
        WHERE id::text = mevcut_id;

        IF kritik_degisti THEN
            is_id_type := public._aurix_col_type('is_talepleri', 'id');
            IF to_regclass('public.is_talebi_islem_loglari') IS NOT NULL AND is_id_type IS NOT NULL THEN
            BEGIN
                EXECUTE format(
                    $sql$
                    INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar, eski_durum, yeni_durum)
                    VALUES ($1::%s, $2, $3, $4, $5, $6)
                    $sql$,
                    is_id_type
                ) USING mevcut_id, uid, 'sahip_kritik_duzenleme',
                    'Kategori/açıklama/teslim/bütçe alanlarından biri yayındaki talepte değiştirildi.',
                    eski_durum, yeni_durum;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'kritik_duzenleme_log: %', SQLERRM;
            END;
            END IF;
        END IF;

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
            'aktif',
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
    '034: Yayınlanmış (teklif_bekliyor) kayıt, yayinla=false ile sessizce taslağa düşürülmez. Admin yayindan_kaldirildi owner tarafından bypass edilemez.';

-- ============================================================
-- 6. is_talepleri_listele — sahip etiketi gerçek doğrulama durumuna göre
--    (Doğrulanmış Firma / Firma Gizli / Bireysel İşveren); bozuk 'gorunur'
--    placeholder etiketi kaldırıldı (frontend gerçek tutarı biçimlendirir).
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
    has_firma_id boolean := public._aurix_col_exists('is_talepleri', 'firma_id');
    rows jsonb;
    seed_clause text := '';
    firma_join text := '';
    dogrulanmis_expr text := 'FALSE';
    firma_var_expr text := 'FALSE';
BEGIN
    IF has_is_seed THEN
        seed_clause := ' AND COALESCE(i.is_seed, FALSE) IS FALSE';
    END IF;
    IF has_firma_id THEN
        firma_join := 'LEFT JOIN public.firmalar f ON f.id = i.firma_id';
        dogrulanmis_expr := 'f.id IS NOT NULL AND COALESCE(f.dogrulanmis, FALSE) IS TRUE '
            || 'AND f.durum = ''onaylandi'' AND COALESCE(f.askiya_alindi, FALSE) IS FALSE';
        firma_var_expr := 'f.id IS NOT NULL';
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
                    WHEN COALESCE(i.sahip_gizli, FALSE) THEN 'Firma Gizli'
                    WHEN %s THEN 'Doğrulanmış Firma'
                    WHEN %s THEN 'Firma'
                    ELSE 'Bireysel İşveren'
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
            %s
            WHERE i.durum = 'teklif_bekliyor'
              AND COALESCE(i.moderasyon_durumu, 'aktif') = 'aktif'
              AND i.yayinlanma_tarihi IS NOT NULL
              %s
              AND ($1 IS NULL OR btrim($1) = '' OR i.kategori ILIKE btrim($1))
              AND ($2 IS NULL OR btrim($2) = '' OR i.sehir ILIKE btrim($2))
              AND ($3 IS NULL OR btrim($3) = '' OR i.aciliyet = btrim($3))
            ORDER BY COALESCE(i.yayinlanma_tarihi, i.created_at) DESC NULLS LAST
            LIMIT $4 OFFSET $5
        ) x
        $q$,
        dogrulanmis_expr,
        firma_var_expr,
        firma_join,
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
    '034: durum=teklif_bekliyor, moderasyon=aktif, yayinlanma_tarihi NOT NULL. Legacy Acik zaten normalize edildi. sahip_etiket: Doğrulanmış Firma/Firma/Bireysel İşveren/Firma Gizli.';

-- ============================================================
-- 7. is_talebi_taleplerim — sahibin KENDİ taleplerini (her durumda) listeler.
--    Taslak listesi + "taleplerim" ekranı için.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_taleplerim(
    p_durum text DEFAULT NULL,
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    lim int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
    off int := GREATEST(0, COALESCE(p_offset, 0));
    durum_filtre text := NULLIF(btrim(COALESCE(p_durum, '')), '');
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sirala DESC NULLS LAST), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            i.id,
            i.baslik,
            i.kategori,
            i.sehir,
            i.durum,
            i.moderasyon_durumu,
            i.moderasyon_notu,
            i.yayinlanma_tarihi,
            i.created_at,
            i.guncellenme_tarihi,
            COALESCE(i.guncellenme_tarihi, i.created_at) AS sirala,
            (
                SELECT COUNT(*)::int
                FROM public.is_talebi_dosyalari d
                WHERE d.is_talebi_id = i.id
            ) AS dosya_sayisi
        FROM public.is_talepleri i
        WHERE (i.kullanici_id = uid OR i.owner_id = uid)
          AND (durum_filtre IS NULL OR i.durum = durum_filtre)
        ORDER BY sirala DESC NULLS LAST
        LIMIT lim OFFSET off
    ) x;

    RETURN jsonb_build_object('ok', true, 'items', COALESCE(rows, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.is_talebi_taleplerim(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_taleplerim(text, int, int) TO authenticated;

COMMENT ON FUNCTION public.is_talebi_taleplerim(text, int, int) IS
    '034: Sahibin kendi talepleri (her durum). Başkasının taslağı dönmez (kullanici_id/owner_id = auth.uid()).';

-- ============================================================
-- 8. is_talebi_sahip_islem — sahip self-servis: yayından kaldır / iptal /
--    arşivle / taslak sil. Admin yetkisi kullanmaz; kendi kaydı dışında
--    hiçbir satırı etkilemez.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_talebi_sahip_islem(
    p_id text,
    p_islem text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    islem text := lower(btrim(COALESCE(p_islem, '')));
    pid text := btrim(COALESCE(p_id, ''));
    r record;
    yeni_durum text;
    eski_durum_v text;
    is_id_type text;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
    END IF;
    IF pid = '' THEN
        RAISE EXCEPTION 'id_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF islem NOT IN ('yayindan_kaldir', 'iptal', 'arsiv', 'sil') THEN
        RAISE EXCEPTION 'gecersiz_islem' USING ERRCODE = '22023';
    END IF;

    SELECT i.* INTO r
    FROM public.is_talepleri i
    WHERE i.id::text = pid
      AND (i.kullanici_id = uid OR i.owner_id = uid)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'is_yok_veya_yetkisiz' USING ERRCODE = '42501';
    END IF;

    eski_durum_v := r.durum;

    IF islem = 'yayindan_kaldir' THEN
        IF r.durum NOT IN ('teklif_bekliyor', 'Acik') THEN
            RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
        END IF;
        UPDATE public.is_talepleri SET
            durum = 'taslak',
            yayinlanma_tarihi = NULL
        WHERE id::text = pid;
        yeni_durum := 'taslak';
    ELSIF islem = 'iptal' THEN
        IF r.durum NOT IN ('taslak', 'teklif_bekliyor', 'Acik') THEN
            RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
        END IF;
        UPDATE public.is_talepleri SET
            durum = 'iptal_edildi',
            iptal_tarihi = NOW()
        WHERE id::text = pid;
        yeni_durum := 'iptal_edildi';
    ELSIF islem = 'arsiv' THEN
        IF r.durum NOT IN ('iptal_edildi', 'tamamlandi', 'Iptal', 'Tamamlandi') THEN
            RAISE EXCEPTION 'durum_uygun_degil' USING ERRCODE = '22023';
        END IF;
        UPDATE public.is_talepleri SET
            durum = 'arsivlendi',
            arsiv_tarihi = NOW()
        WHERE id::text = pid;
        yeni_durum := 'arsivlendi';
    ELSIF islem = 'sil' THEN
        IF r.durum <> 'taslak' THEN
            RAISE EXCEPTION 'yalniz_taslak_silinebilir' USING ERRCODE = '22023';
        END IF;
        DELETE FROM public.is_talepleri WHERE id::text = pid;
        yeni_durum := 'silindi';
    END IF;

    IF islem <> 'sil' THEN
        is_id_type := public._aurix_col_type('is_talepleri', 'id');
        IF to_regclass('public.is_talebi_islem_loglari') IS NOT NULL AND is_id_type IS NOT NULL THEN
            BEGIN
                EXECUTE format(
                    $sql$
                    INSERT INTO public.is_talebi_islem_loglari (is_talebi_id, admin_id, islem, notlar, eski_durum, yeni_durum)
                    VALUES ($1::%s, $2, $3, $4, $5, $6)
                    $sql$,
                    is_id_type
                ) USING pid, uid, 'sahip_' || islem, 'Sahip kendi talebinde işlem yaptı.',
                    eski_durum_v, yeni_durum;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'sahip_islem_log: %', SQLERRM;
            END;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'id', pid, 'durum', yeni_durum);
END;
$$;

REVOKE ALL ON FUNCTION public.is_talebi_sahip_islem(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_talebi_sahip_islem(text, text) TO authenticated;

COMMENT ON FUNCTION public.is_talebi_sahip_islem(text, text) IS
    '034: Sahip self-servis (admin RPC''sinden ayrı). yayindan_kaldir=teklif_bekliyor->taslak; iptal; arsiv; sil (yalnız taslak, hard delete).';

-- ============================================================
-- 8b. admin_is_talebi_moderasyon — 033'teki mantık aynı, log kaydına
--     eski_durum / yeni_durum eklendi (spec zorunlu alan).
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
    is_id_type text := NULL;
    pid text := btrim(COALESCE(p_id, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
    END IF;

    IF islem IN ('kaldirildi', 'kaldir', 'yayindan_kaldir', 'reddedildi', 'yayindan_kaldirildi') THEN
        islem := 'yayindan_kaldir';
    ELSIF islem IN ('aktif', 'tekrar_yayin', 'yayina_ac', 'onaylandi', 'acik') THEN
        islem := 'tekrar_yayin';
    ELSIF islem IN ('beklemede', 'incelemede') THEN
        islem := 'incelemede';
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

    BEGIN
        is_id_type := public._aurix_col_type('is_talepleri', 'id');
    EXCEPTION WHEN OTHERS THEN
        is_id_type := NULL;
    END;

    IF to_regclass('public.is_talebi_islem_loglari') IS NOT NULL AND is_id_type IS NOT NULL THEN
        BEGIN
            EXECUTE format(
                $sql$
                INSERT INTO public.is_talebi_islem_loglari
                    (is_talebi_id, admin_id, islem, notlar, eski_durum, yeni_durum)
                VALUES ($1::%s, $2, $3, $4, $5, $6)
                $sql$,
                is_id_type
            ) USING pid, auth.uid(), islem, NULLIF(btrim(COALESCE(p_not, '')), ''),
                eski_durum, yeni_durum;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'islem_log: %', SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', pid,
        'durum', yeni_durum,
        'moderasyon_durumu', yeni_mod
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_is_talebi_moderasyon(text, text, text) IS
    '034: 033 ile aynı işlem mantığı; is_talebi_islem_loglari kaydına eski_durum/yeni_durum eklendi.';

-- ============================================================
-- 8c. admin_is_listesi — yayinlanma_tarihi eksikti (admin ekranı "yayın
--     tarihi" kolonu göstermek için gerekli).
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
    yayin_expr text;
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

    IF public._aurix_col_exists('is_talepleri', 'yayinlanma_tarihi') THEN
        yayin_expr := 'i.yayinlanma_tarihi';
    ELSE
        yayin_expr := 'NULL::timestamptz';
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
                %s AS yayinlanma_tarihi,
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
        yayin_expr,
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
    '034: 028 ile aynı + yayinlanma_tarihi eklendi (admin listesi "yayın tarihi" kolonu).';

-- ============================================================
-- 9. RLS doğrulama — mevcut politikalar 032'de rebuild edilmişti;
--    burada yalnızca varlık kontrolü + gerekirse yeniden oluşturma.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'is_talepleri'
          AND policyname = 'is_talepleri_select_yayin_032'
    ) THEN
        RAISE NOTICE '034: is_talepleri_select_yayin_032 RLS politikası eksik — 032 tekrar çalıştırılmalı.';
    ELSE
        RAISE NOTICE '034: is_talepleri SELECT RLS politikası doğrulandı.';
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE '034 tamam: durum tekleştirildi, yayın-taslak bugu düzeltildi, sahip RPC''leri eklendi.';
END $$;

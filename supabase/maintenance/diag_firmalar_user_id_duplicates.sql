-- AURIX diag — firmalar.user_id mükerrerleri (salt okuma, silme yok)
-- Supabase SQL Editor’de çalıştırın.

-- 1) Özet: kaç user_id birden fazla satıra sahip?
SELECT
    COUNT(*) FILTER (WHERE cnt > 1) AS mukerrer_user_id_sayisi,
    COALESCE(SUM(cnt) FILTER (WHERE cnt > 1), 0) AS mukerrer_satir_toplami,
    COUNT(*) FILTER (WHERE cnt = 1) AS tekil_user_id_sayisi,
    COUNT(*) FILTER (WHERE user_id IS NULL) AS null_user_id_grup
FROM (
    SELECT user_id, COUNT(*) AS cnt
    FROM public.firmalar
    GROUP BY user_id
) t;

-- 2) Mükerrer user_id listesi (silinmez — yalnız rapor)
SELECT
    user_id,
    COUNT(*) AS kayit_sayisi,
    array_agg(id ORDER BY created_at NULLS LAST, id) AS firma_idleri,
    array_agg(durum ORDER BY created_at NULLS LAST, id) AS durumlar,
    MIN(created_at) AS ilk_kayit,
    MAX(created_at) AS son_kayit
FROM public.firmalar
WHERE user_id IS NOT NULL
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY kayit_sayisi DESC, user_id;

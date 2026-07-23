-- AURIX 018 — firmalar.user_id partial unique index (additive, idempotent)
-- Mükerrer varken index oluşturmaz (NOTICE verir); veri silmez.
-- Public SELECT / auth policy’lere dokunmaz.

DO $$
DECLARE
    dup_users integer;
BEGIN
    SELECT COUNT(*) INTO dup_users
    FROM (
        SELECT user_id
        FROM public.firmalar
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) d;

    IF dup_users > 0 THEN
        RAISE NOTICE
            'AURIX 018 atlandı: % user_id için mükerrer firma kaydı var. Önce diag_firmalar_user_id_duplicates.sql çalıştırın; kayıtları elle birleştirin/silin, sonra bu migration’ı tekrar çalıştırın.',
            dup_users;
        RETURN;
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_firmalar_user_id_unique
        ON public.firmalar (user_id)
        WHERE user_id IS NOT NULL;

    RAISE NOTICE 'AURIX 018: idx_firmalar_user_id_unique hazır (veya zaten vardı).';
END $$;

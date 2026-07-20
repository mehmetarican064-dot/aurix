-- AURIX — Kullanıcı kendi firma satırını okuyabilsin (panel)
-- Dashboard SQL Editor'da bir kez çalıştırın.

DROP POLICY IF EXISTS "firmalar_select_own" ON public.firmalar;

CREATE POLICY "firmalar_select_own"
    ON public.firmalar
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Panel için gerekli sütunlar (public + sahiplik)
DO $$
BEGIN
    BEGIN
        GRANT SELECT (
            id, firma_adi, sehir, kategori, aciklama,
            dogrulanmis, durum, created_at, user_id
        ) ON TABLE public.firmalar TO authenticated;
    EXCEPTION WHEN OTHERS THEN
        -- Sütun yoksa veya grant zaten varsa sessizce geç
        NULL;
    END;
END $$;

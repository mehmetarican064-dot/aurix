-- AURIX 009 — authenticated kullanıcı kendi firmasını SELECT edebilsin

DROP POLICY IF EXISTS "firmalar_select_own" ON public.firmalar;

CREATE POLICY "firmalar_select_own"
    ON public.firmalar
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DO $$
BEGIN
    BEGIN
        GRANT SELECT (
            id, firma_adi, sehir, kategori, aciklama,
            dogrulanmis, durum, created_at, user_id
        ) ON TABLE public.firmalar TO authenticated;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

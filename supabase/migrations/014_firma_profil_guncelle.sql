-- Phase 2 / Modül 1: Firma sahibi kendi profilini güncelleyebilir (sınırlı alanlar)
-- Auth / Site URL / client key ayarlarına dokunulmaz.

CREATE OR REPLACE FUNCTION public.firma_profil_guncelle(
    p_firma_adi text,
    p_sehir text,
    p_kategori text,
    p_aciklama text,
    p_telefon text DEFAULT NULL,
    p_logo_url text DEFAULT NULL,
    p_kapak_url text DEFAULT NULL,
    p_yeniden_basvur boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid uuid := auth.uid();
    fid bigint;
    eski public.firmalar%ROWTYPE;
    ad text := nullif(btrim(p_firma_adi), '');
    sehir text := nullif(btrim(p_sehir), '');
    kat text := nullif(btrim(p_kategori), '');
    acik text := nullif(btrim(p_aciklama), '');
    tel text := nullif(btrim(p_telefon), '');
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;
    IF ad IS NULL OR char_length(ad) < 2 THEN
        RAISE EXCEPTION 'firma_adi_gecersiz' USING ERRCODE = '22023';
    END IF;
    IF sehir IS NULL THEN
        RAISE EXCEPTION 'sehir_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF kat IS NULL THEN
        RAISE EXCEPTION 'kategori_zorunlu' USING ERRCODE = '22023';
    END IF;
    IF acik IS NULL OR char_length(acik) < 10 THEN
        RAISE EXCEPTION 'aciklama_kisa' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO eski
    FROM public.firmalar
    WHERE user_id = uid
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF eski.id IS NULL THEN
        RAISE EXCEPTION 'firma_yok' USING ERRCODE = 'P0002';
    END IF;
    fid := eski.id;

    IF COALESCE(eski.askiya_alindi, FALSE) IS TRUE THEN
        RAISE EXCEPTION 'aski_guncelleme_yok' USING ERRCODE = '42501';
    END IF;

    UPDATE public.firmalar SET
        firma_adi = ad,
        sehir = sehir,
        kategori = kat,
        aciklama = acik,
        telefon = COALESCE(tel, telefon),
        logo_url = CASE
            WHEN p_logo_url IS NULL THEN logo_url
            WHEN btrim(p_logo_url) = '' THEN NULL
            ELSE btrim(p_logo_url)
        END,
        kapak_url = CASE
            WHEN p_kapak_url IS NULL THEN kapak_url
            WHEN btrim(p_kapak_url) = '' THEN NULL
            ELSE btrim(p_kapak_url)
        END
    WHERE id = fid;

    IF p_yeniden_basvur IS TRUE AND eski.durum = 'reddedildi' THEN
        UPDATE public.firmalar SET
            durum = 'beklemede',
            dogrulanmis = FALSE,
            red_nedeni = NULL,
            onaylayan_admin = NULL,
            onay_tarihi = NULL
        WHERE id = fid;
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'ok', true,
            'id', f.id,
            'durum', f.durum,
            'dogrulanmis', f.dogrulanmis,
            'firma_adi', f.firma_adi
        )
        FROM public.firmalar f
        WHERE f.id = fid
    );
END;
$$;

REVOKE ALL ON FUNCTION public.firma_profil_guncelle(
    text, text, text, text, text, text, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_profil_guncelle(
    text, text, text, text, text, text, text, boolean
) TO authenticated;

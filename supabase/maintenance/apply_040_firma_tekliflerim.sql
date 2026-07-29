-- AURIX 040 — Firma paneli: verdiğim teklifler (başlık + fiyat)
-- Idempotent. Fiyat public SELECT ile açılmaz; yalnızca kendi firmasının
-- teklifleri SECURITY DEFINER RPC ile döner.
--
-- Bu dosya ile supabase/maintenance/apply_040_firma_tekliflerim.sql aynıdır.

CREATE OR REPLACE FUNCTION public.firma_tekliflerim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    fid text;
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT f.id::text INTO fid
    FROM public.firmalar f
    WHERE f.user_id = uid
    ORDER BY f.created_at DESC NULLS LAST
    LIMIT 1;

    IF fid IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'teklifler', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            t.id,
            t.is_id,
            t.firma_id,
            t.fiyat,
            t.termin_gun,
            t.created_at,
            COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi') AS is_baslik,
            COALESCE(i.durum, '') AS is_durum,
            COALESCE(i.sehir, '') AS is_sehir
        FROM public.teklifler t
        LEFT JOIN public.is_talepleri i ON i.id = t.is_id
        WHERE t.firma_id::text = fid
    ) x;

    RETURN jsonb_build_object('ok', true, 'teklifler', COALESCE(rows, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.firma_tekliflerim() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_tekliflerim() TO authenticated;

COMMENT ON FUNCTION public.firma_tekliflerim() IS
    'Oturum sahibinin firmasına ait teklifler: fiyat + ilişkili iş talebi başlığı. Yalnız authenticated.';

DO $$
BEGIN
    RAISE NOTICE '[040] firma_tekliflerim RPC hazır.';
END $$;

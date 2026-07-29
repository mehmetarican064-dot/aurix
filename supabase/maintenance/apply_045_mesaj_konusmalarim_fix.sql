-- AURIX 045 — mesaj_konusmalarim RPC düzeltmesi
-- Idempotent. DROP TABLE / TRUNCATE / kontrolsüz DELETE yok.
--
-- Hata: "subquery uses ungrouped column m.gonderen_id from outer query"
-- Kök neden: 042'deki mesaj_konusmalarim() sorgusu public.mesajlar m'yi
-- (is_talebi_id, CASE karşı taraf, baslik) ifadesine göre GROUP BY yapıyordu,
-- fakat SELECT listesindeki korele alt sorgular (son_mesaj, son_at, okunmamis,
-- karsi_ad) doğrudan ham m.gonderen_id sütununa referans veriyordu. Bir grup
-- içindeki satırların m.gonderen_id değeri (mesajın hangi yönde gönderildiğine
-- göre) sabit olmadığından Postgres bunu grupsuz sütun kullanımı olarak
-- reddediyordu.
--
-- Çözüm: Önce (is_talebi_id, karsi_id) çiftlerini ayrı bir DISTINCT alt
-- sorguda üret, ardından dış sorudaki korele alt sorgularda yalnızca bu
-- (grupsuz olmayan, satır başına tekil) p.is_talebi_id / p.karsi_id
-- değerlerine referans ver. Böylece GROUP BY tamamen kalkıyor ve alt
-- sorgular güvenle çalışıyor.
--
-- Bu dosya ile supabase/migrations/045_mesaj_konusmalarim_fix.sql aynıdır.

CREATE OR REPLACE FUNCTION public.mesaj_konusmalarim()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    rows jsonb;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.son_at DESC NULLS LAST), '[]'::jsonb)
    INTO rows
    FROM (
        SELECT
            p.is_talebi_id::text AS is_talebi_id,
            p.karsi_id,
            COALESCE(NULLIF(btrim(i.baslik), ''), 'İş talebi') AS baslik,
            (
                SELECT mm.mesaj_metni
                FROM public.mesajlar mm
                WHERE mm.is_talebi_id = p.is_talebi_id
                  AND (
                      (mm.gonderen_id = uid AND mm.alici_id = p.karsi_id)
                      OR
                      (mm.alici_id = uid AND mm.gonderen_id = p.karsi_id)
                  )
                ORDER BY mm.created_at DESC
                LIMIT 1
            ) AS son_mesaj,
            (
                SELECT mm.created_at
                FROM public.mesajlar mm
                WHERE mm.is_talebi_id = p.is_talebi_id
                  AND (
                      (mm.gonderen_id = uid AND mm.alici_id = p.karsi_id)
                      OR
                      (mm.alici_id = uid AND mm.gonderen_id = p.karsi_id)
                  )
                ORDER BY mm.created_at DESC
                LIMIT 1
            ) AS son_at,
            (
                SELECT COUNT(*)::int
                FROM public.mesajlar mm
                WHERE mm.is_talebi_id = p.is_talebi_id
                  AND mm.alici_id = uid
                  AND mm.okundu_mu = FALSE
                  AND mm.gonderen_id = p.karsi_id
            ) AS okunmamis,
            CASE
                WHEN public.is_talebi_sahibi_mi(p.is_talebi_id::text, uid) THEN
                    COALESCE((
                        SELECT NULLIF(btrim(f.firma_adi), '')
                        FROM public.firmalar f
                        WHERE f.user_id = p.karsi_id
                        ORDER BY f.created_at DESC NULLS LAST
                        LIMIT 1
                    ), 'Firma')
                ELSE 'İş veren'
            END AS karsi_ad
        FROM (
            SELECT DISTINCT
                m.is_talebi_id,
                CASE WHEN m.gonderen_id = uid THEN m.alici_id ELSE m.gonderen_id END AS karsi_id
            FROM public.mesajlar m
            WHERE m.gonderen_id = uid OR m.alici_id = uid
        ) p
        JOIN public.is_talepleri i ON i.id = p.is_talebi_id
    ) x;

    RETURN jsonb_build_object('ok', true, 'konusmalar', COALESCE(rows, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.mesaj_konusmalarim() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mesaj_konusmalarim() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '[045] mesaj_konusmalarim RPC düzeltmesi tamamlandı.';
END $$;

-- AURIX 024 — Kullanıcı kendi firma satırını her durumda okuyabilsin
-- Idempotent. DROP TABLE / TRUNCATE / DELETE yok. Auth / Site URL’ye dokunulmaz.
--
-- Kök neden:
-- 017 firmalar_select_own: user_id = auth.uid() AND durum = 'beklemede'
-- → Onaylı / reddedilmiş firmalar sahibi için SELECT’te görünmez (boş sonuç).
-- 022 bu kısıtı kaldırmalıydı; kısmi uygulamada veya kolon GRANT eksikliğinde
-- panel SELECT hata verir / INSERT’e düşer.
--
-- Bu dosya = supabase/maintenance/apply_024_firma_sahip_select_rpc.sql
-- Yalnızca BİRİNİ çalıştırın.

-- ============================================================
-- 1. user_id / owner_id hizalama (güvenli backfill)
-- ============================================================
DO $$
BEGIN
    IF public._aurix_col_exists('firmalar', 'owner_id')
       AND public._aurix_col_exists('firmalar', 'user_id') THEN
        UPDATE public.firmalar
        SET user_id = owner_id
        WHERE user_id IS NULL
          AND owner_id IS NOT NULL;
    END IF;
END $$;

-- ============================================================
-- 2. firmalar_select_own — tüm durumlar (beklemede kısıtı YOK)
--    Gerçek ilişki: auth.uid() = firmalar.user_id
--    owner_id varsa OR ile dahil
-- ============================================================
DROP POLICY IF EXISTS "firmalar_select_own" ON public.firmalar;

DO $$
DECLARE
    using_expr text;
BEGIN
    using_expr := 'auth.uid() IS NOT NULL AND user_id = auth.uid()';
    IF public._aurix_col_exists('firmalar', 'owner_id') THEN
        using_expr :=
            'auth.uid() IS NOT NULL AND ('
            || 'user_id = auth.uid() OR owner_id = auth.uid()'
            || ')';
    END IF;

    EXECUTE format(
        'CREATE POLICY "firmalar_select_own"
            ON public.firmalar
            FOR SELECT
            TO authenticated
            USING (%s)',
        using_expr
    );
END $$;

-- ============================================================
-- 3. Panel kolon GRANT’leri (authenticated)
--    Vergi/adres gibi hassas alanlar burada GRANT edilmez (public
--    onaylı satır sızıntısı olmasın). Tam profil: firma_panel_getir RPC.
-- ============================================================
DO $$
DECLARE
    wanted text[] := ARRAY[
        'id', 'firma_adi', 'sehir', 'ilce', 'firma_turu', 'kategori',
        'hizmet_kategorileri', 'aciklama', 'yetkili_ad', 'kurulus_yili',
        'website', 'calisan_sayisi', 'calisma_saatleri', 'kapasite',
        'instagram', 'telefon', 'email',
        'durum', 'dogrulanmis', 'yayin_durumu', 'created_at', 'updated_at',
        'user_id', 'logo_url', 'kapak_url', 'calisma_gorselleri',
        'red_nedeni', 'askiya_alindi', 'askiya_alma_nedeni'
    ];
    cols text[];
    grant_list text := '';
    col text;
BEGIN
    SELECT array_agg(a.attname::text ORDER BY a.attname::text)
    INTO cols
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'firmalar'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname = ANY (wanted);

    IF cols IS NULL THEN
        RETURN;
    END IF;

    FOREACH col IN ARRAY cols LOOP
        IF grant_list <> '' THEN grant_list := grant_list || ', '; END IF;
        grant_list := grant_list || quote_ident(col);
    END LOOP;

    EXECUTE format(
        'GRANT SELECT (%s) ON TABLE public.firmalar TO authenticated',
        grant_list
    );
END $$;

-- ============================================================
-- 4. RPC: firma_panel_getir — SECURITY DEFINER (RLS/GRANT bypass)
--    Yalnız auth.uid() sahibinin satırı; tüm durumlar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.firma_panel_getir()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    uid uuid := auth.uid();
    has_owner boolean := public._aurix_col_exists('firmalar', 'owner_id');
    row_json jsonb;
    sql text;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'oturum_yok' USING ERRCODE = '42501';
    END IF;

    IF has_owner THEN
        sql := $q$
            SELECT to_jsonb(f) FROM public.firmalar f
            WHERE f.user_id = $1 OR f.owner_id = $1
            ORDER BY f.created_at DESC NULLS LAST
            LIMIT 1
        $q$;
    ELSE
        sql := $q$
            SELECT to_jsonb(f) FROM public.firmalar f
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC NULLS LAST
            LIMIT 1
        $q$;
    END IF;

    EXECUTE sql INTO row_json USING uid;

    IF row_json IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'firma', NULL);
    END IF;

    RETURN jsonb_build_object('ok', true, 'firma', row_json);
END;
$$;

REVOKE ALL ON FUNCTION public.firma_panel_getir() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.firma_panel_getir() TO authenticated;

COMMENT ON FUNCTION public.firma_panel_getir() IS
    'Oturum sahibinin firma satırı (tüm durumlar). Panel profil yükleme. SECURITY DEFINER.';

-- ============================================================
-- 5. Schema cache (PostgREST)
-- ============================================================
NOTIFY pgrst, 'reload schema';

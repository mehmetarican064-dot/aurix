/**
 * AURIX — Supabase istemcisi (vanilla JS + CDN, GitHub Pages uyumlu)
 * Publishable (anon) key istemci tarafında kullanılabilir; service_role ASLA eklenmez.
 *
 * Publishable Key: Supabase Dashboard → Project Settings → API → anon / publishable
 * Aşağıdaki BURAYA_PUBLISHABLE_KEY metninin tamamını kendi key’inizle değiştirin.
 */
(function (global) {
    'use strict';

    var SUPABASE_URL = 'https://svsouqnhtlpcpdvqahmd.supabase.co';

    // ↓↓↓ Publishable Key’inizi tırnakların arasına yapıştırın ↓↓↓
    var SUPABASE_ANON_KEY = sb_publishable_c2mZqJ7T3rcM0Jlcm_405Q_UqRv7peK'
    // ↑↑↑ örn. eyJ... veya sb_publishable_... ↑↑↑

    var client = null;

    function keyHazirMi() {
        var k = (SUPABASE_ANON_KEY || '').trim();
        if (!k || k === 'BURAYA_PUBLISHABLE_KEY') return false;
        return k.indexOf('eyJ') === 0 ||
            k.indexOf('sb_publishable_') === 0 ||
            k.length > 20;
    }

    function getClient() {
        if (client) return client;
        if (!keyHazirMi()) return null;
        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            return null;
        }
        client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY.trim(), {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
        return client;
    }

    function hataMesaji(err) {
        if (!err) return 'Bilinmeyen hata.';
        if (typeof err === 'string') return err;
        return err.message || err.error_description || err.details || 'İşlem başarısız.';
    }

    /**
     * Firma başvurusunu public.firmalar tablosuna yazar (durum: beklemede).
     * Not: insert sonrası .select() kullanılmaz — RLS beklemede satırları okumayı engeller.
     */
    function kaydetFirma(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Supabase hazır değil. js/supabase.js içinde Publishable Key’i yapıştırın.'
            });
        }
        return sb.from('firmalar').insert([{
            ad: veri.ad,
            kategori_id: veri.kategoriId,
            sehir: veri.sehir,
            tel: veri.tel,
            aciklama: veri.aciklama,
            durum: 'beklemede',
            premium: false,
            sponsor: false,
            puan: 0
        }]).then(function (res) {
            if (res.error) return { ok: false, error: hataMesaji(res.error) };
            return { ok: true };
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    /**
     * İş talebini public.is_talepleri tablosuna yazar (durum: beklemede).
     */
    function kaydetIsTalebi(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Supabase hazır değil. js/supabase.js içinde Publishable Key’i yapıştırın.'
            });
        }
        return sb.from('is_talepleri').insert([{
            baslik: veri.baslik,
            kategori_id: veri.kategoriId,
            sehir: veri.sehir,
            adet: veri.adet || null,
            termin: veri.termin || null,
            butce: veri.butce || null,
            aciklama: veri.aciklama || null,
            durum: 'beklemede',
            durum_tip: veri.durumTip || 'bekliyor',
            teklif_sayisi: 0
        }]).then(function (res) {
            if (res.error) return { ok: false, error: hataMesaji(res.error) };
            return { ok: true };
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    /**
     * Canlı firma + iş talebi sayıları (RPC; yoksa onaylı satır sayısı).
     */
    function getirIstatistikler() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({ ok: false, firma: null, isTalep: null });
        }

        function sayimdanOku() {
            return Promise.all([
                sb.from('firmalar').select('id', { count: 'exact', head: true }).eq('durum', 'onaylandi'),
                sb.from('is_talepleri').select('id', { count: 'exact', head: true }).eq('durum', 'onaylandi')
            ]).then(function (sonuclar) {
                var firmaRes = sonuclar[0];
                var isRes = sonuclar[1];
                if (firmaRes.error || isRes.error) {
                    return { ok: false, firma: null, isTalep: null };
                }
                return {
                    ok: true,
                    firma: typeof firmaRes.count === 'number' ? firmaRes.count : 0,
                    isTalep: typeof isRes.count === 'number' ? isRes.count : 0
                };
            });
        }

        return sb.rpc('aurix_istatistikler').then(function (res) {
            if (res.error || !res.data) return sayimdanOku();
            var data = res.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { return sayimdanOku(); }
            }
            var firma = data.firma != null ? Number(data.firma) : NaN;
            var isTalep = data.is_talep != null ? Number(data.is_talep) : NaN;
            if (isNaN(firma) || isNaN(isTalep)) return sayimdanOku();
            return { ok: true, firma: firma, isTalep: isTalep };
        }).catch(function () {
            return sayimdanOku();
        }).catch(function () {
            return { ok: false, firma: null, isTalep: null };
        });
    }

    global.AurixSupabase = {
        url: SUPABASE_URL,
        getClient: getClient,
        kaydetFirma: kaydetFirma,
        kaydetIsTalebi: kaydetIsTalebi,
        getirIstatistikler: getirIstatistikler,
        keyHazirMi: keyHazirMi
    };
})(typeof window !== 'undefined' ? window : this);

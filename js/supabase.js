/**
 * AURIX — Supabase istemcisi (vanilla JS + CDN, GitHub Pages uyumlu)
 * Publishable (anon) key istemci tarafında kullanılabilir; service_role ASLA eklenmez.
 */
(function (global) {
    'use strict';

    var SUPABASE_URL = 'https://svsouqnhtlpcpdvqahmd.supabase.co';

    // Publishable Key — Dashboard → Project Settings → API
    var SUPABASE_ANON_KEY = 'sb_publishable_c2mZqJ7T3rcM0Jlcm_405Q_UqRv7peK';

    var client = null;

    function keyMetniVarMi() {
        var k = (SUPABASE_ANON_KEY || '').trim();
        return !!(k && k !== 'BURAYA_PUBLISHABLE_KEY');
    }

    function getClient() {
        if (client) return client;
        if (!keyMetniVarMi()) return null;
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

    /** Client nesnesi oluştuysa bağlantı hazır — toast/uyarı buna bakmalı. */
    function baglantiHazirMi() {
        return !!getClient();
    }

    // Geriye dönük: keyHazirMi = baglantiHazirMi (client oluşabiliyorsa true)
    function keyHazirMi() {
        return baglantiHazirMi();
    }

    function hataMesaji(err) {
        if (!err) return 'Bilinmeyen hata.';
        if (typeof err === 'string') return err;
        return err.message || err.error_description || err.details || 'İşlem başarısız.';
    }

    /**
     * firmalar: dogrulanmis boolean (durum sütunu yok)
     */
    function kaydetFirma(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Supabase bağlantısı hazır değil. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        var satir = {
            ad: veri.ad,
            sehir: veri.sehir,
            tel: veri.tel,
            aciklama: veri.aciklama,
            dogrulanmis: false
        };
        if (veri.kategori) satir.kategori = veri.kategori;
        else if (veri.kategoriId) satir.kategori = veri.kategoriId;

        return sb.from('firmalar').insert([satir]).then(function (res) {
            if (res.error) return { ok: false, error: hataMesaji(res.error) };
            return { ok: true };
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    /** Form ekstra alanlarını (adet/termin/bütçe) aciklama metnine ekler. */
    function isTalebiAciklamaBirleştir(veri) {
        var parcalar = [];
        if (veri.aciklama) parcalar.push(String(veri.aciklama).trim());
        if (veri.adet) parcalar.push('Adet / kapsam: ' + String(veri.adet).trim());
        if (veri.termin) parcalar.push('Teslim süresi: ' + String(veri.termin).trim());
        if (veri.butce) parcalar.push('Bütçe: ' + String(veri.butce).trim());
        return parcalar.filter(Boolean).join('\n') || null;
    }

    /**
     * is_talepleri sütunları: baslik, aciklama, kategori, sehir, durum, created_at
     * created_at DB default; adet/termin/butce → aciklama içine
     */
    function kaydetIsTalebi(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Supabase bağlantısı hazır değil. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        return sb.from('is_talepleri').insert([{
            baslik: veri.baslik,
            aciklama: isTalebiAciklamaBirleştir(veri),
            kategori: veri.kategori || veri.kategoriId || null,
            sehir: veri.sehir,
            durum: veri.durum || 'beklemede'
        }]).then(function (res) {
            if (res.error) return { ok: false, error: hataMesaji(res.error) };
            return { ok: true };
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    /**
     * İstatistikler — RPC yok.
     * firmalar: dogrulanmis = true
     * is_talepleri: tüm okunabilir satırlar
     */
    function getirIstatistikler() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({ ok: false, firma: null, isTalep: null });
        }
        return Promise.all([
            sb.from('firmalar').select('*', { count: 'exact', head: true }).eq('dogrulanmis', true),
            sb.from('is_talepleri').select('*', { count: 'exact', head: true })
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
        }).catch(function () {
            return { ok: false, firma: null, isTalep: null };
        });
    }

    global.AurixSupabase = {
        url: SUPABASE_URL,
        getClient: getClient,
        baglantiHazirMi: baglantiHazirMi,
        kaydetFirma: kaydetFirma,
        kaydetIsTalebi: kaydetIsTalebi,
        getirIstatistikler: getirIstatistikler,
        keyHazirMi: keyHazirMi
    };
})(typeof window !== 'undefined' ? window : this);

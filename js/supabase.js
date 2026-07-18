/**
 * AURIX — Supabase istemcisi (vanilla JS + CDN, GitHub Pages uyumlu)
 * Publishable (anon) key istemci tarafında kullanılabilir.
 * service_role / sb_secret ASLA eklenmez — admin işlemleri Edge Function ile yapılır.
 */
(function (global) {
    'use strict';

    var SUPABASE_URL = 'https://svsouqnhtlpcpdvqahmd.supabase.co';
    var SUPABASE_ANON_KEY = 'sb_publishable_c2mZqJ7T3rcM0Jlcm_405Q_UqRv7peK';

    /** Public liste — telefon/email çekilmez */
    var FIRMA_PUBLIC_SELECT = 'id,firma_adi,sehir,kategori,aciklama,dogrulanmis,durum,created_at';

    var ADMIN_TOKEN_KEY = 'aurix_supabase_admin_token';
    var client = null;

    function isDevHost() {
        try {
            var h = (global.location && global.location.hostname) || '';
            return h === 'localhost' || h === '127.0.0.1';
        } catch (e) {
            return false;
        }
    }

    /** Production’da seed kayıtları gizlenir; localhost’ta tümü görülebilir. */
    function seedFiltreUygula(query) {
        if (!query || typeof query.eq !== 'function') return query;
        if (isDevHost()) return query;
        return query.eq('is_seed', false);
    }

    function sutunEksikMi(err) {
        var msg = String((err && err.message) || err || '');
        return /is_seed|owner_id|user_id|column.*does not exist|PGRST204/i.test(msg);
    }

    function logSupabaseHata(baglam, err) {
        try {
            console.error(baglam, err);
        } catch (e) { /* ignore */ }
    }

    function aktifKullaniciId() {
        try {
            if (global.AuthService && AuthService.getCurrentUser()) {
                return AuthService.getCurrentUser().id || null;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function oturumKullaniciId(sb) {
        if (!sb || !sb.auth || typeof sb.auth.getSession !== 'function') {
            return Promise.resolve(aktifKullaniciId());
        }
        return sb.auth.getSession().then(function (res) {
            var session = res && res.data ? res.data.session : null;
            var uid = session && session.user ? session.user.id : null;
            return uid || aktifKullaniciId();
        }).catch(function () {
            return aktifKullaniciId();
        });
    }

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
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: global.localStorage
            }
        });
        return client;
    }

    function baglantiHazirMi() {
        return !!getClient();
    }

    function keyHazirMi() {
        return baglantiHazirMi();
    }

    function hataMesaji(err) {
        if (!err) return 'Bilinmeyen hata.';
        if (typeof err === 'string') {
            if (/Failed to fetch|NetworkError|Load failed|network/i.test(err)) {
                return 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
            }
            return err;
        }
        var code = err.code || err.CODE;
        var msg = err.message || err.error_description || err.details || '';
        if (code === '23505' || /duplicate|unique|already exists/i.test(msg)) {
            if (/teklifler_is_firma|teklifler.*unique|is_id.*firma_id|teklif/i.test(msg)) {
                return 'Bu firma bu işe zaten teklif vermiş.';
            }
            return 'Bu e-posta veya firma adı ile zaten başvuru yapılmış.';
        }
        if (/teklifler_fiyat|fiyat.*check|violates check constraint.*fiyat/i.test(msg)) {
            return 'Fiyat 0’dan büyük olmalıdır.';
        }
        if (/teklifler_termin|termin_gun.*check|violates check constraint.*termin/i.test(msg)) {
            return 'Teslim süresi en az 1 gün olmalıdır.';
        }
        if (/row-level security|RLS|permission denied|42501|WITH CHECK/i.test(msg)) {
            if (/teklif/i.test(msg) || /teklifler/i.test(String(err.hint || '') + String(err.details || ''))) {
                return 'Teklif reddedildi. Giriş yapmış olmalı ve teklifi kendi onaylı firmanız adına vermelisiniz.';
            }
            return 'Kayıt güvenlik kuralları nedeniyle reddedildi. Lütfen alanları kontrol edin.';
        }
        if (/JWT|Invalid API key|401/i.test(msg)) {
            return 'Oturum veya API anahtarı geçersiz. Sayfayı yenileyip tekrar deneyin.';
        }
        if (/Failed to fetch|NetworkError|Load failed|TypeError/i.test(msg)) {
            return 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
        }
        if (/PGRST205|Could not find the table|schema cache/i.test(msg)) {
            if (/teklif/i.test(msg)) {
                return 'Teklif özelliği şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.';
            }
            return 'Veriler yüklenirken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.';
        }
        if (/PGRST|relation|column|does not exist|syntax/i.test(msg)) {
            return 'Veriler yüklenirken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.';
        }
        if (msg && /[çğıöşüÇĞİÖŞÜ]/.test(msg)) return msg;
        if (msg && /[A-Za-z]/.test(msg) && !/[çğıöşüÇĞİÖŞÜ]/.test(msg)) {
            return 'İşlem başarısız. Lütfen daha sonra tekrar deneyin.';
        }
        return msg || 'İşlem başarısız.';
    }

    function kaydetFirma(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }

        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return {
                    ok: false,
                    needsAuth: true,
                    error: 'Firma başvurusu için giriş yapmış olmalısınız.'
                };
            }

            var userId = veri.user_id || uid;
            if (userId !== uid) userId = uid;

            var satir = {
                firma_adi: veri.firma_adi || veri.ad,
                sehir: veri.sehir,
                kategori: veri.kategori || veri.kategoriId || null,
                aciklama: veri.aciklama,
                telefon: veri.telefon || veri.tel,
                email: (veri.email || '').trim().toLowerCase() || null,
                dogrulanmis: false,
                durum: 'beklemede',
                is_seed: false,
                user_id: userId,
                owner_id: userId
            };

            function dene(payload) {
                return sb.from('firmalar').insert([payload]).select('id').then(function (res) {
                    if (res.error && sutunEksikMi(res.error)) {
                        var yedek = Object.assign({}, payload);
                        var msg = String(res.error.message || '');
                        if (/user_id/i.test(msg)) delete yedek.user_id;
                        else if (/owner_id/i.test(msg)) delete yedek.owner_id;
                        else if (/is_seed/i.test(msg)) delete yedek.is_seed;
                        else {
                            delete yedek.user_id;
                            delete yedek.owner_id;
                            delete yedek.is_seed;
                        }
                        if (JSON.stringify(yedek) !== JSON.stringify(payload)) {
                            return dene(yedek);
                        }
                    }
                    if (res.error) {
                        logSupabaseHata('firmalar insert', res.error);
                        return { ok: false, error: hataMesaji(res.error) };
                    }
                    return { ok: true, id: res.data && res.data[0] ? res.data[0].id : null };
                });
            }

            return dene(satir);
        }).catch(function (err) {
            logSupabaseHata('firmalar insert', err);
            return { ok: false, error: hataMesaji(err) };
        });
    }

    function isTalebiAciklamaBirleştir(veri) {
        var parcalar = [];
        if (veri.aciklama) parcalar.push(String(veri.aciklama).trim());
        if (veri.adet) parcalar.push('Adet / kapsam: ' + String(veri.adet).trim());
        if (veri.termin) parcalar.push('Teslim süresi: ' + String(veri.termin).trim());
        if (veri.butce) parcalar.push('Bütçe: ' + String(veri.butce).trim());
        return parcalar.filter(Boolean).join('\n') || null;
    }

    function kaydetIsTalebi(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        var ownerId = aktifKullaniciId();
        var satir = {
            baslik: veri.baslik,
            aciklama: isTalebiAciklamaBirleştir(veri),
            kategori: veri.kategori || veri.kategoriId || null,
            sehir: veri.sehir,
            durum: veri.durum || 'Acik',
            is_seed: false
        };
        if (ownerId) satir.owner_id = ownerId;

        function dene(payload) {
            return sb.from('is_talepleri').insert([payload]).select('id').then(function (res) {
                if (res.error && sutunEksikMi(res.error) && (payload.owner_id || payload.is_seed === false)) {
                    var yedek = Object.assign({}, payload);
                    delete yedek.owner_id;
                    delete yedek.is_seed;
                    return dene(yedek);
                }
                if (res.error) return { ok: false, error: hataMesaji(res.error) };
                return { ok: true };
            });
        }

        return dene(satir).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    function getirIstatistikler() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({ ok: false, firma: null, isTalep: null });
        }
        return Promise.all([
            seedFiltreUygula(
                sb.from('firmalar').select('id', { count: 'exact', head: true })
                    .eq('dogrulanmis', true)
                    .eq('durum', 'onaylandi')
            ),
            seedFiltreUygula(
                sb.from('is_talepleri').select('id', { count: 'exact', head: true }).eq('durum', 'Acik')
            )
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

    function getirDogrulanmisFirmalar() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                data: [],
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        function sorgu(filtreSeed) {
            var q = sb.from('firmalar')
                .select(FIRMA_PUBLIC_SELECT)
                .eq('dogrulanmis', true)
                .eq('durum', 'onaylandi');
            if (filtreSeed) q = seedFiltreUygula(q);
            return q.order('created_at', { ascending: false });
        }

        return sorgu(true).then(function (res) {
            if (res.error && sutunEksikMi(res.error)) {
                return sorgu(false);
            }
            return res;
        }).then(function (res) {
            if (res.error) {
                return {
                    ok: false,
                    data: [],
                    error: hataMesaji(res.error) ||
                        'Firmalar yüklenemedi. Lütfen daha sonra tekrar deneyin.'
                };
            }
            var satirlar = (res.data || []).filter(function (row) {
                return row && row.dogrulanmis === true;
            });
            return { ok: true, data: satirlar };
        }).catch(function (err) {
            return {
                ok: false,
                data: [],
                error: hataMesaji(err) ||
                    'Firmalar yüklenemedi. Lütfen daha sonra tekrar deneyin.'
            };
        });
    }

    function getirAcikIsTalepleri() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                data: [],
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        function sorgu(filtreSeed) {
            var q = sb.from('is_talepleri')
                .select('id,baslik,aciklama,kategori,sehir,durum,created_at')
                .eq('durum', 'Acik');
            if (filtreSeed) q = seedFiltreUygula(q);
            return q.order('created_at', { ascending: false });
        }

        return sorgu(true).then(function (res) {
            if (res.error && sutunEksikMi(res.error)) {
                return sorgu(false);
            }
            return res;
        }).then(function (res) {
            if (res.error) {
                return {
                    ok: false,
                    data: [],
                    error: hataMesaji(res.error) ||
                        'Açık iş talepleri yüklenemedi. Lütfen daha sonra tekrar deneyin.'
                };
            }
            var satirlar = (res.data || []).filter(function (row) {
                return row && String(row.durum || '') === 'Acik';
            });
            return { ok: true, data: satirlar };
        }).catch(function (err) {
            return {
                ok: false,
                data: [],
                error: hataMesaji(err) ||
                    'Açık iş talepleri yüklenemedi. Lütfen daha sonra tekrar deneyin.'
            };
        });
    }

    /** Public özet view — fiyat/mesaj dönmez */
    var TEKLIF_PUBLIC_SELECT = 'id,is_id,firma_id,termin_gun,created_at';

    function kaydetTeklif(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        var fiyat = Number(veri.fiyat);
        var terminGun = parseInt(veri.termin_gun, 10);
        var isId = veri.is_id;
        var firmaId = veri.firma_id;

        if (isId == null || isId === '' || firmaId == null || firmaId === '') {
            return Promise.resolve({ ok: false, error: 'İş ve firma seçimi zorunludur.' });
        }
        if (isNaN(fiyat) || fiyat <= 0) {
            return Promise.resolve({ ok: false, error: 'Fiyat 0’dan büyük olmalıdır.' });
        }
        if (isNaN(terminGun) || terminGun < 1) {
            return Promise.resolve({ ok: false, error: 'Teslim süresi en az 1 gün olmalıdır.' });
        }
        if (!aktifKullaniciId()) {
            return Promise.resolve({
                ok: false,
                error: 'Teklif vermek için giriş yapmanız gerekir.'
            });
        }

        return Promise.all([
            getirDogrulanmisFirmalar(),
            getirAcikIsTalepleri()
        ]).then(function (sonuclar) {
            var firmaRes = sonuclar[0];
            var isRes = sonuclar[1];

            if (!firmaRes || !firmaRes.ok) {
                return {
                    ok: false,
                    error: (firmaRes && firmaRes.error) ||
                        'Firmalar doğrulanamadı. Lütfen daha sonra tekrar deneyin.'
                };
            }
            if (!isRes || !isRes.ok) {
                return {
                    ok: false,
                    error: (isRes && isRes.error) ||
                        'İş talebi doğrulanamadı. Lütfen daha sonra tekrar deneyin.'
                };
            }

            var firmaOk = (firmaRes.data || []).some(function (f) {
                return f && String(f.id) === String(firmaId) && f.dogrulanmis === true;
            });
            if (!firmaOk) {
                return {
                    ok: false,
                    error: 'Yalnızca doğrulanmış ve onaylı firmalar teklif verebilir.'
                };
            }

            var isOk = (isRes.data || []).some(function (row) {
                return row && String(row.id) === String(isId) && String(row.durum || '') === 'Acik';
            });
            if (!isOk) {
                return {
                    ok: false,
                    error: 'Yalnızca açık iş taleplerine teklif verilebilir.'
                };
            }

            return sb.from('teklifler').insert([{
                is_id: isId,
                firma_id: firmaId,
                fiyat: fiyat,
                termin_gun: terminGun,
                mesaj: (veri.mesaj && String(veri.mesaj).trim()) || null
            }]).select('id').then(function (res) {
                if (res.error) {
                    var msg = hataMesaji(res.error);
                    if (res.error.code === '23505' || /duplicate|unique/i.test(String(res.error.message || ''))) {
                        msg = 'Bu firma bu işe zaten teklif vermiş.';
                    }
                    return {
                        ok: false,
                        error: msg || 'Teklif kaydedilemedi. Lütfen daha sonra tekrar deneyin.'
                    };
                }
                return { ok: true };
            });
        }).catch(function (err) {
            return {
                ok: false,
                error: hataMesaji(err) ||
                    'Teklif kaydedilemedi. Lütfen daha sonra tekrar deneyin.'
            };
        });
    }

    /** is_id → teklif adedi (fiyat yok) */
    function getirTeklifSayilari() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({ ok: false, counts: {}, error: 'Supabase yok' });
        }

        function sayilariIsle(data) {
            var counts = {};
            (data || []).forEach(function (row) {
                if (!row || row.is_id == null) return;
                var key = String(row.is_id);
                counts[key] = (counts[key] || 0) + 1;
            });
            return { ok: true, counts: counts };
        }

        return sb.from('teklifler_public')
            .select(TEKLIF_PUBLIC_SELECT)
            .then(function (res) {
                if (!res.error) return sayilariIsle(res.data);
                /* View henüz yoksa güvenli sütunlarla tablodan dene (fiyat seçilmez) */
                return sb.from('teklifler')
                    .select(TEKLIF_PUBLIC_SELECT)
                    .then(function (res2) {
                        if (res2.error) {
                            return {
                                ok: false,
                                counts: {},
                                error: hataMesaji(res2.error) ||
                                    'Teklif sayıları şu anda yüklenemiyor.'
                            };
                        }
                        return sayilariIsle(res2.data);
                    });
            })
            .catch(function (err) {
                return {
                    ok: false,
                    counts: {},
                    error: hataMesaji(err) || 'Teklif sayıları yüklenemedi.'
                };
            });
    }

    function getAdminToken() {
        try {
            return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    function setAdminToken(token) {
        try {
            if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, String(token).trim());
            else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        } catch (e) { /* ignore */ }
    }

    /** Geriye dönük takma adlar */
    function getAdminDemoToken() { return getAdminToken(); }
    function setAdminDemoToken(token) { setAdminToken(token); }

    function adminTurkceHata(msg, status) {
        var m = String(msg || '');
        var st = status || 0;
        if (st === 404 || /404|not found|FunctionsHttpError|Function not found/i.test(m)) {
            return 'Admin onay servisi bulunamadı. Deploy gerekli (kurulum raporu).';
        }
        if (st === 403 || /Origin izni yok/i.test(m)) {
            return 'Bu kaynaktan admin işlemine izin verilmiyor.';
        }
        if (st === 401 || /401|Yetkisiz|unauthorized|admin token|Forbidden/i.test(m)) {
            return 'Yetkisiz. Admin token’ı kontrol edin.';
        }
        if (/Failed to send|FunctionsFetchError|Failed to fetch|NetworkError/i.test(m)) {
            return 'Admin servisine bağlanılamadı. Deploy ve ağ bağlantısını kontrol edin.';
        }
        if (/CORS/i.test(m)) {
            return 'Bağlantı engellendi. Lütfen sayfayı yenileyip tekrar deneyin.';
        }
        return m || 'İşlem başarısız.';
    }

    /**
     * Admin — Edge Function (service_role sunucuda).
     * GET list / POST approve|reject
     * Header: x-admin-token = SUPABASE_ADMIN_TOKEN secret (sessionStorage)
     * Deploy edilmeden başarılı gibi davranmaz.
     */
    function adminFirmalar(action, payload) {
        if (!keyMetniVarMi()) {
            return Promise.resolve({
                ok: false,
                error: 'Bağlantı kurulamadı.'
            });
        }
        var token = getAdminToken();
        if (!token) {
            return Promise.resolve({
                ok: false,
                error: 'Admin token girilmedi. ?devAdmin=1 ile açıp token’ı bir kez yazın (URL’ye yazmayın).',
                needToken: true
            });
        }

        var url = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/admin-firmalar';
        var headers = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY.trim(),
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY.trim(),
            'x-admin-token': token
        };

        var opts;
        if (action === 'list') {
            opts = { method: 'GET', headers: headers };
        } else {
            opts = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(Object.assign({ action: action }, payload || {}))
            };
        }

        return fetch(url, opts).then(function (res) {
            if (res.status === 404) {
                return {
                    ok: false,
                    error: adminTurkceHata('not found', 404),
                    notDeployed: true
                };
            }
            return res.text().then(function (text) {
                var data = null;
                if (text) {
                    try { data = JSON.parse(text); } catch (e) { data = null; }
                }
                if (!res.ok) {
                    return {
                        ok: false,
                        error: adminTurkceHata(
                            (data && data.error) || text || ('HTTP ' + res.status),
                            res.status
                        ),
                        status: res.status
                    };
                }
                if (data && data.ok === false) {
                    return { ok: false, error: adminTurkceHata(data.error, res.status) };
                }
                return data || { ok: true };
            });
        }).catch(function (err) {
            return { ok: false, error: adminTurkceHata(err && err.message) };
        });
    }

    global.AurixSupabase = {
        url: SUPABASE_URL,
        getClient: getClient,
        baglantiHazirMi: baglantiHazirMi,
        kaydetFirma: kaydetFirma,
        kaydetIsTalebi: kaydetIsTalebi,
        kaydetTeklif: kaydetTeklif,
        getirIstatistikler: getirIstatistikler,
        getirDogrulanmisFirmalar: getirDogrulanmisFirmalar,
        getirAcikIsTalepleri: getirAcikIsTalepleri,
        getirTeklifSayilari: getirTeklifSayilari,
        adminFirmalar: adminFirmalar,
        getAdminToken: getAdminToken,
        setAdminToken: setAdminToken,
        getAdminDemoToken: getAdminDemoToken,
        setAdminDemoToken: setAdminDemoToken,
        keyHazirMi: keyHazirMi,
        FIRMA_PUBLIC_SELECT: FIRMA_PUBLIC_SELECT
    };
})(typeof window !== 'undefined' ? window : this);

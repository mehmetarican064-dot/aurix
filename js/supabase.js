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
    var FIRMA_PUBLIC_SELECT = 'id,firma_adi,sehir,kategori,aciklama,dogrulanmis,durum,created_at,logo_url,kapak_url';

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

    /* Production’da firmalar.is_seed kolonu yok — filtre hiç gönderilmez (400 engeli). */
    function seedFiltreUygula(query) {
        return query;
    }

    function sutunEksikMi(err) {
        var msg = String((err && err.message) || err || '');
        return /is_seed|owner_id|user_id|kapak_url|logo_url|calisma_gorselleri|column.*does not exist|PGRST204/i.test(msg);
    }

    function logSupabaseHata(baglam, err) {
        try {
            var code = err && (err.code || err.CODE);
            var msg = err && (err.message || err.error_description || err.details);
            console.error(baglam, {
                code: code || null,
                message: msg || null,
                details: err && err.details != null ? err.details : null,
                hint: err && err.hint != null ? err.hint : null,
                status: err && err.status != null ? err.status : null,
                raw: err
            });
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
                /* Manuel exchangeCodeForSession (authService) — çift PKCE tüketimini önle */
                detectSessionInUrl: false,
                storage: global.localStorage,
                flowType: 'pkce'
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
            if (/firmalar|firma/i.test(msg)) {
                return 'Bu bilgilerle zaten bir firma kaydı var. Panelinizden durumunuzu kontrol edin.';
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
            if (/firmalar|firma/i.test(msg)) {
                return 'Firma başvurusu kaydedilemedi. Giriş yaptığınızdan emin olun; zaten başvurunuz varsa panelden kontrol edin.';
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

    /**
     * Firma sahibi profil güncelleme (RPC: firma_profil_guncelle).
     * Auth / client ayarlarına dokunmaz.
     */
    function guncelleFirma(veri) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        veri = veri || {};
        var ad = String(veri.firma_adi || veri.ad || '').trim();
        var sehir = String(veri.sehir || '').trim();
        var kategori = String(veri.kategori || veri.kategoriId || '').trim();
        var aciklama = String(veri.aciklama || '').trim();
        var telefon = veri.telefon != null ? String(veri.telefon).trim() : null;
        if (ad.length < 2) {
            return Promise.resolve({ ok: false, error: 'Firma adı en az 2 karakter olmalı.' });
        }
        if (!sehir) {
            return Promise.resolve({ ok: false, error: 'Şehir seçin.' });
        }
        if (!kategori) {
            return Promise.resolve({ ok: false, error: 'Hizmet kategorisi seçin.' });
        }
        if (aciklama.length < 10) {
            return Promise.resolve({ ok: false, error: 'Açıklama en az 10 karakter olmalı.' });
        }

        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return { ok: false, needsAuth: true, error: 'Giriş yapmış olmalısınız.' };
            }
            var args = {
                p_firma_adi: ad,
                p_sehir: sehir,
                p_kategori: kategori,
                p_aciklama: aciklama,
                p_telefon: telefon || null,
                p_logo_url: veri.logo_url === undefined ? null : (veri.logo_url || ''),
                p_kapak_url: veri.kapak_url === undefined ? null : (veri.kapak_url || ''),
                p_yeniden_basvur: !!veri.yenidenBasvur
            };
            /* logo/kapak değişmediyse NULL gönder → RPC mevcut URL’yi korur */
            if (veri.logo_url === undefined) args.p_logo_url = null;
            if (veri.kapak_url === undefined) args.p_kapak_url = null;

            return sb.rpc('firma_profil_guncelle', args).then(function (res) {
                if (res.error) {
                    var msg = String(res.error.message || '');
                    if (/firma_yok|P0002/i.test(msg)) {
                        return { ok: false, error: 'Firma kaydı bulunamadı.' };
                    }
                    if (/aski_guncelleme|42501/i.test(msg)) {
                        return { ok: false, error: 'Askıdaki firma profili güncellenemez.' };
                    }
                    if (/firma_adi|sehir|kategori|aciklama/i.test(msg)) {
                        return { ok: false, error: 'Lütfen firma bilgilerini kontrol edin.' };
                    }
                    if (/Could not find the function|PGRST202|schema cache/i.test(msg)) {
                        return {
                            ok: false,
                            error: 'Profil güncelleme henüz etkin değil. Lütfen daha sonra tekrar deneyin.'
                        };
                    }
                    return { ok: false, error: hataMesaji(res.error) };
                }
                var data = res.data;
                if (data && data.ok === false) {
                    return { ok: false, error: data.error || 'Güncelleme başarısız.' };
                }
                return {
                    ok: true,
                    id: data && data.id,
                    durum: data && data.durum,
                    firma: data
                };
            });
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
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

            var userId = uid;

            /* Aynı kullanıcının ikinci firma başvurusunu engelle */
            return sb.from('firmalar')
                .select('id,durum,dogrulanmis')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
                .then(function (mevcutRes) {
                    if (mevcutRes.error && !/user_id|column|PGRST/i.test(String(mevcutRes.error.message || ''))) {
                        logSupabaseHata('firmalar mevcut kontrol', mevcutRes.error);
                    }
                    if (mevcutRes.data && mevcutRes.data.id) {
                        return {
                            ok: false,
                            alreadyExists: true,
                            firma: mevcutRes.data,
                            error: 'Zaten bir firma başvurunuz var. Durumunu panelinizden takip edebilirsiniz.'
                        };
                    }

                    /* DIAG (geçici): insert().select() kaldırıldı → yalnız insert(), sonra ayrı SELECT */
                    var satir = {
                        firma_adi: veri.firma_adi || veri.ad,
                        sehir: veri.sehir,
                        kategori: veri.kategori || veri.kategoriId || null,
                        aciklama: veri.aciklama,
                        telefon: veri.telefon || veri.tel || null,
                        email: (veri.email || '').trim().toLowerCase() || null,
                        dogrulanmis: false,
                        durum: 'beklemede',
                        user_id: userId
                    };

                    if (veri.logo_url) satir.logo_url = veri.logo_url;
                    if (veri.kapak_url) satir.kapak_url = veri.kapak_url;
                    if (veri.calisma_gorselleri != null) {
                        satir.calisma_gorselleri = Array.isArray(veri.calisma_gorselleri)
                            ? veri.calisma_gorselleri
                            : [];
                    }

                    function diagLog(baslik, deger) {
                        try {
                            console.log(baslik, deger);
                        } catch (e) { /* ignore */ }
                    }

                    function dene(payload) {
                        /* yalnız insert — Prefer: return=minimal (select yok) */
                        return sb.from('firmalar').insert([payload]).then(function (insRes) {
                            diagLog('INSERT sonucu', insRes.data);
                            diagLog('INSERT error.code', insRes.error ? insRes.error.code : null);
                            diagLog('INSERT error.message', insRes.error ? insRes.error.message : null);

                            if (insRes.error && sutunEksikMi(insRes.error)) {
                                var yedek = Object.assign({}, payload);
                                var msg = String(insRes.error.message || '');
                                if (/kapak_url/i.test(msg)) delete yedek.kapak_url;
                                else if (/logo_url|calisma_gorselleri/i.test(msg)) {
                                    delete yedek.logo_url;
                                    delete yedek.calisma_gorselleri;
                                    delete yedek.kapak_url;
                                } else if (/user_id/i.test(msg)) {
                                    return {
                                        ok: false,
                                        error: 'Firma kaydı için kullanıcı kimliği gerekli. Lütfen çıkış yapıp tekrar giriş yapın.',
                                        supabase: {
                                            code: insRes.error.code || null,
                                            message: insRes.error.message || null
                                        }
                                    };
                                } else {
                                    delete yedek.logo_url;
                                    delete yedek.kapak_url;
                                    delete yedek.calisma_gorselleri;
                                }
                                if (JSON.stringify(yedek) !== JSON.stringify(payload)) {
                                    return dene(yedek);
                                }
                            }

                            if (insRes.error) {
                                logSupabaseHata('firmalar insert', insRes.error);
                                return {
                                    ok: false,
                                    error: hataMesaji(insRes.error),
                                    supabase: {
                                        code: insRes.error.code || null,
                                        message: insRes.error.message || null,
                                        details: insRes.error.details || null,
                                        hint: insRes.error.hint || null
                                    },
                                    diag: {
                                        insertError: {
                                            code: insRes.error.code || null,
                                            message: insRes.error.message || null
                                        }
                                    }
                                };
                            }

                            /* INSERT OK → aynı kullanıcıyla ayrı SELECT */
                            return sb.from('firmalar')
                                .select('id,durum,dogrulanmis,firma_adi,user_id')
                                .eq('user_id', userId)
                                .order('created_at', { ascending: false })
                                .limit(1)
                                .maybeSingle()
                                .then(function (selRes) {
                                    diagLog('SELECT sonucu', selRes.data);
                                    diagLog('SELECT error.code', selRes.error ? selRes.error.code : null);
                                    diagLog('SELECT error.message', selRes.error ? selRes.error.message : null);

                                    var row = selRes.data || null;
                                    return {
                                        ok: true,
                                        id: row ? row.id : null,
                                        durum: row ? row.durum : 'beklemede',
                                        dogrulanmis: false,
                                        firma: row,
                                        diag: {
                                            insertOk: true,
                                            selectError: selRes.error ? {
                                                code: selRes.error.code || null,
                                                message: selRes.error.message || null
                                            } : null,
                                            selectData: row
                                        }
                                    };
                                });
                        });
                    }

                    return dene(satir);
                });
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
            durum: veri.durum || 'Acik'
        };
        if (ownerId) satir.owner_id = ownerId;

        function dene(payload) {
            return sb.from('is_talepleri').insert([payload]).select('id').then(function (res) {
                if (res.error && sutunEksikMi(res.error) && payload.owner_id) {
                    var yedek = Object.assign({}, payload);
                    delete yedek.owner_id;
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

    function formatTl(n) {
        var v = Number(n);
        if (!isFinite(v) || v <= 0) return '₺0';
        try {
            return '₺' + Math.round(v).toLocaleString('tr-TR');
        } catch (e) {
            return '₺' + String(Math.round(v));
        }
    }

    /**
     * Firma paneli özeti — auth.uid() sahibinin firması / teklifleri.
     * Kazanç / ödeme / IBAN demo alanları yok.
     */
    function getirFirmaPanelOzeti() {
        var bos = {
            ok: true,
            hasFirma: false,
            firma: null,
            teklifler: [],
            kullaniciIsleri: []
        };

        var sb = getClient();
        if (!sb) {
            return Promise.resolve(Object.assign({}, bos, { ok: false }));
        }

        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return Object.assign({}, bos, { ok: false, needsAuth: true });
            }

            function firmaSorgula(selectCols) {
                return sb.from('firmalar')
                    .select(selectCols)
                    .eq('user_id', uid)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
            }

            return firmaSorgula(
                'id,firma_adi,sehir,kategori,aciklama,telefon,durum,dogrulanmis,created_at,user_id,logo_url,kapak_url,calisma_gorselleri,red_nedeni,askiya_alindi,askiya_alma_nedeni'
            ).then(function (res) {
                if (res.error && /red_nedeni|askiya_alindi|askiya_alma_nedeni|kapak_url|logo_url|calisma_gorselleri|telefon|column|PGRST/i.test(String(res.error.message || ''))) {
                    return firmaSorgula('id,firma_adi,sehir,kategori,aciklama,telefon,durum,dogrulanmis,created_at,user_id,logo_url,kapak_url,calisma_gorselleri');
                }
                return res;
            }).then(function (res) {
                if (res.error && /kapak_url|logo_url|calisma_gorselleri|telefon|column|PGRST/i.test(String(res.error.message || ''))) {
                    return firmaSorgula('id,firma_adi,sehir,kategori,aciklama,durum,dogrulanmis,created_at,user_id,logo_url');
                }
                return res;
            }).then(function (res) {
                if (res.error && /user_id|logo_url|column|PGRST/i.test(String(res.error.message || ''))) {
                    return firmaSorgula('id,firma_adi,sehir,kategori,aciklama,durum,dogrulanmis,created_at,user_id');
                }
                return res;
            }).then(function (res) {
                if (res.error && /user_id|column|PGRST/i.test(String(res.error.message || ''))) {
                    return firmaSorgula('id,firma_adi,sehir,kategori,aciklama,durum,dogrulanmis,created_at');
                }
                return res;
            }).then(function (firmaRes) {
                if (firmaRes.error) {
                    logSupabaseHata('firma panel firma', firmaRes.error);
                    return Object.assign({}, bos, { ok: true });
                }
                var firma = firmaRes.data || null;
                if (!firma || !firma.id) {
                    return Object.assign({}, bos, { ok: true, hasFirma: false });
                }

                return sb.from('teklifler')
                    .select('id,is_id,firma_id,termin_gun,created_at')
                    .eq('firma_id', firma.id)
                    .order('created_at', { ascending: false })
                    .then(function (tekRes) {
                        if (tekRes.error) {
                            logSupabaseHata('firma panel teklifler', tekRes.error);
                        }
                        var teklifler = (!tekRes.error && tekRes.data) ? tekRes.data : [];

                        var teklifKartlari = teklifler.map(function (t) {
                            return {
                                id: t.id,
                                isAdi: 'İş #' + String(t.is_id || '—'),
                                termin: t.termin_gun != null ? (t.termin_gun + ' gün') : '—',
                                durum: 'Gönderildi'
                            };
                        });

                        return {
                            ok: true,
                            hasFirma: true,
                            firma: firma,
                            teklifler: teklifKartlari
                        };
                    });
            });
        }).catch(function (err) {
            logSupabaseHata('firma panel', err);
            return Object.assign({}, bos, { ok: false });
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
        /* askiya_alindi API filtresi anon’da 401 verebilir — istemci tarafında elenir */
        function sorgu(selectCols) {
            return sb.from('firmalar')
                .select(selectCols || FIRMA_PUBLIC_SELECT)
                .eq('dogrulanmis', true)
                .eq('durum', 'onaylandi')
                .order('created_at', { ascending: false });
        }

        var selectYedek = 'id,firma_adi,sehir,kategori,aciklama,dogrulanmis,durum,created_at';

        return sorgu().then(function (res) {
            if (res.error && /logo_url|kapak_url/i.test(String(res.error.message || ''))) {
                return sorgu(selectYedek);
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
                if (!row || row.dogrulanmis !== true) return false;
                if (row.askiya_alindi === true) return false;
                return true;
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
        return sb.from('is_talepleri')
            .select('id,baslik,aciklama,kategori,sehir,durum,created_at')
            .eq('durum', 'Acik')
            .order('created_at', { ascending: false })
            .then(function (res) {
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
            })
            .catch(function (err) {
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

    /**
     * Firma logo / çalışma görselleri yükleme (storage bucket: firma-medya).
     * Başarısız olursa null döner; firma kaydı yine de devam edebilir.
     */
    function yukleFirmaMedya(file, klasor) {
        var sb = getClient();
        if (!sb || !file) {
            return Promise.resolve({ ok: false, url: null, error: 'Dosya yok.' });
        }
        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return { ok: false, url: null, error: 'Oturum gerekli.', needsAuth: true };
            }
            var uzanti = '';
            var ad = String(file.name || 'dosya');
            var nokta = ad.lastIndexOf('.');
            if (nokta > 0) uzanti = ad.slice(nokta).toLowerCase().replace(/[^a-z0-9.]/g, '');
            if (!uzanti) {
                if (/png/i.test(file.type)) uzanti = '.png';
                else if (/webp/i.test(file.type)) uzanti = '.webp';
                else if (/gif/i.test(file.type)) uzanti = '.gif';
                else uzanti = '.jpg';
            }
            var yol = uid + '/' + (klasor || 'gorsel') + '/' + Date.now() + '-' +
                Math.random().toString(36).slice(2, 8) + uzanti;

            return sb.storage.from('firma-medya').upload(yol, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || 'image/jpeg'
            }).then(function (res) {
                if (res.error) {
                    logSupabaseHata('firma-medya upload', res.error);
                    return { ok: false, url: null, error: hataMesaji(res.error) };
                }
                var pub = sb.storage.from('firma-medya').getPublicUrl(yol);
                var url = pub && pub.data ? pub.data.publicUrl : null;
                return { ok: !!url, url: url };
            });
        }).catch(function (err) {
            logSupabaseHata('firma-medya upload', err);
            return { ok: false, url: null, error: hataMesaji(err) };
        });
    }

    /** Kullanıcının kendi iş talepleri (owner_id = auth.uid()). */
    function getirKullaniciIsTalepleri() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({ ok: false, data: [], error: 'Bağlantı yok.' });
        }
        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return { ok: false, data: [], needsAuth: true, error: 'Oturum gerekli.' };
            }
            return sb.from('is_talepleri')
                .select('id,baslik,aciklama,kategori,sehir,durum,created_at,owner_id')
                .eq('owner_id', uid)
                .order('created_at', { ascending: false })
                .then(function (res) {
                    if (res.error && sutunEksikMi(res.error)) {
                        return { ok: true, data: [] };
                    }
                    if (res.error) {
                        return { ok: false, data: [], error: hataMesaji(res.error) };
                    }
                    return { ok: true, data: res.data || [] };
                });
        }).catch(function (err) {
            return { ok: false, data: [], error: hataMesaji(err) };
        });
    }

    global.AurixSupabase = {
        url: SUPABASE_URL,
        getClient: getClient,
        baglantiHazirMi: baglantiHazirMi,
        kaydetFirma: kaydetFirma,
        guncelleFirma: guncelleFirma,
        kaydetIsTalebi: kaydetIsTalebi,
        kaydetTeklif: kaydetTeklif,
        yukleFirmaMedya: yukleFirmaMedya,
        getirIstatistikler: getirIstatistikler,
        getirFirmaPanelOzeti: getirFirmaPanelOzeti,
        getirDogrulanmisFirmalar: getirDogrulanmisFirmalar,
        getirAcikIsTalepleri: getirAcikIsTalepleri,
        getirKullaniciIsTalepleri: getirKullaniciIsTalepleri,
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

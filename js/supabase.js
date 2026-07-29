/**
 * AURIX — Supabase istemcisi (vanilla JS + CDN, GitHub Pages uyumlu)
 * Publishable (anon) key istemci tarafında kullanılabilir.
 * service_role / sb_secret ASLA eklenmez — admin işlemleri Edge Function ile yapılır.
 */
(function (global) {
    'use strict';

    var SUPABASE_URL = 'https://svsouqnhtlpcpdvqahmd.supabase.co';
    var SUPABASE_ANON_KEY = 'sb_publishable_c2mZqJ7T3rcM0Jlcm_405Q_UqRv7peK';

    /** Public liste — telefon/email/adres/vergi çekilmez */
    var FIRMA_PUBLIC_SELECT = 'id,firma_adi,sehir,ilce,firma_turu,yetkili_ad,kurulus_yili,calisan_sayisi,calisma_saatleri,kapasite,hizmet_kategorileri,yayin_durumu,calisma_gorselleri,kategori,aciklama,dogrulanmis,durum,guven_dogrulama_durumu,guven_dogrulama_tarihi,created_at,logo_url,kapak_url';

    /** Panel sahibi — tüm profil alanları (özel alanlar dahil) */
    var FIRMA_PANEL_SELECT = 'id,firma_adi,sehir,ilce,firma_turu,kategori,hizmet_kategorileri,aciklama,yetkili_ad,kurulus_yili,adres,calisan_sayisi,calisma_saatleri,kapasite,telefon,durum,dogrulanmis,yayin_durumu,guven_dogrulama_durumu,guven_dogrulama_tarihi,guven_kullanici_aciklama,vergi_kimlik_durumu,created_at,updated_at,user_id,logo_url,kapak_url,calisma_gorselleri,red_nedeni,askiya_alindi,askiya_alma_nedeni';

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
        return /is_seed|owner_id|user_id|kapak_url|logo_url|calisma_gorselleri|ilce|firma_turu|hizmet_kategorileri|yayin_durumu|yetkili_ad|kurulus_yili|updated_at|vergi_|adres|guven_dogrulama|mersis|column.*does not exist|permission denied for column|PGRST204/i.test(msg);
    }

    function logSupabaseHata(baglam, err) {
        try {
            var code = err && (err.code || err.CODE);
            var msg = err && (err.message || err.error_description || err.details);
            console.error('[AURIX]', baglam, {
                code: code || null,
                message: msg || null,
                details: err && err.details != null ? err.details : null,
                hint: err && err.hint != null ? err.hint : null,
                status: err && err.status != null ? err.status : null,
                raw: err
            });
        } catch (e) { /* ignore */ }
    }

    /** Kullanıcıya gösterilecek kısa teknik ek (debug) */
    function hataTeknikOzet(err) {
        if (!err) return '';
        var code = err.code || err.CODE || '';
        var msg = err.message || err.error_description || '';
        var parca = [code, msg].filter(Boolean).join(' — ');
        return parca ? String(parca).slice(0, 220) : '';
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
            if (/firmalar_user_id|idx_firmalar_user_id|user_id|firmalar|firma/i.test(msg)) {
                return 'Bu hesapla zaten bir firma başvurusu bulunuyor.';
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
            if (/permission denied for column|column/i.test(msg) && /firmalar|firma/i.test(msg)) {
                return 'Firma profil alanlarına şu anda erişilemiyor. Lütfen daha sonra tekrar deneyin.';
            }
            if (/firmalar|firma/i.test(msg)) {
                return 'Firma kaydınız okunamadı veya güncellenemedi. Oturumunuzu kontrol edip tekrar deneyin.';
            }
            return 'Kayıt güvenlik kuralları nedeniyle reddedildi. Lütfen alanları kontrol edin.';
        }
        if (/oturum_yok/i.test(msg)) {
            return 'Giriş yapmış olmalısınız.';
        }
        if (/function.*firma_panel_getir|PGRST202|Could not find the function/i.test(msg)) {
            return 'Bu özellik şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.';
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

    /**
     * Oturum sahibinin firma satırı.
     * auth.uid() → firmalar.user_id; yoksa (kolon varsa) firmalar.owner_id.
     * firmalar.id asla kullanıcı kimliği sanılmaz.
     */
    function sahipFirmaSorgula(sb, uid, selectCols) {
        function tek(kolon, cols) {
            return sb.from('firmalar')
                .select(cols)
                .eq(kolon, uid)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
        }

        return tek('user_id', selectCols).then(function (res) {
            if (res.error && /user_id|column|PGRST204/i.test(String(res.error.message || ''))) {
                return tek('owner_id', selectCols).then(function (r2) {
                    if (r2.error && /owner_id|column|PGRST204/i.test(String(r2.error.message || ''))) {
                        return res;
                    }
                    return r2;
                });
            }
            if (!res.error && res.data && res.data.id) {
                return res;
            }
            /* user_id ile satır yok — owner_id dene (şemada varsa) */
            return tek('owner_id', selectCols).then(function (r2) {
                if (r2.error && /owner_id|column|does not exist|PGRST204/i.test(String(r2.error.message || ''))) {
                    return res;
                }
                return r2;
            });
        });
    }

    function sahipFirmaSelectDene(sb, uid, colsList) {
        var i = 0;
        function sonraki() {
            if (i >= colsList.length) {
                return Promise.resolve({ data: null, error: { message: 'Firma kolonları okunamadı.' } });
            }
            var cols = colsList[i++];
            return sahipFirmaSorgula(sb, uid, cols).then(function (res) {
                if (res.error && sutunEksikMi(res.error) && i < colsList.length) {
                    return sonraki();
                }
                return res;
            });
        }
        return sonraki();
    }

    var FIRMA_SAHIP_SELECT_YEDEK = [
        FIRMA_PANEL_SELECT,
        'id,firma_adi,sehir,ilce,firma_turu,kategori,hizmet_kategorileri,aciklama,yetkili_ad,kurulus_yili,adres,telefon,durum,dogrulanmis,yayin_durumu,guven_dogrulama_durumu,created_at,updated_at,user_id,logo_url,kapak_url,calisma_gorselleri,red_nedeni,askiya_alindi,askiya_alma_nedeni',
        'id,firma_adi,sehir,kategori,aciklama,telefon,durum,dogrulanmis,yayin_durumu,created_at,user_id,logo_url,kapak_url,calisma_gorselleri,red_nedeni,askiya_alindi,askiya_alma_nedeni',
        'id,firma_adi,sehir,kategori,aciklama,telefon,durum,dogrulanmis,created_at,user_id,logo_url,kapak_url,calisma_gorselleri,red_nedeni,askiya_alindi,askiya_alma_nedeni',
        'id,firma_adi,sehir,kategori,aciklama,telefon,durum,dogrulanmis,created_at,user_id,logo_url,kapak_url,calisma_gorselleri',
        'id,firma_adi,sehir,kategori,aciklama,durum,dogrulanmis,created_at,user_id,logo_url',
        'id,firma_adi,sehir,kategori,aciklama,durum,dogrulanmis,created_at,user_id',
        'id,firma_adi,sehir,kategori,aciklama,durum,dogrulanmis,created_at'
    ];

    /**
     * Önce SECURITY DEFINER RPC (firma_panel_getir), olmazsa doğrudan SELECT.
     * RLS beklemede-kısıtı veya kolon GRANT sorunlarında RPC kurtarır.
     */
    function getirKullaniciFirmaRpc(sb) {
        return sb.rpc('firma_panel_getir').then(function (res) {
            if (res.error) {
                logSupabaseHata('firma_panel_getir rpc', res.error);
                return {
                    ok: false,
                    usedRpc: true,
                    firma: null,
                    error: hataMesaji(res.error),
                    supabase: {
                        code: res.error.code || null,
                        message: res.error.message || null,
                        details: res.error.details || null,
                        hint: res.error.hint || null
                    },
                    teknik: hataTeknikOzet(res.error)
                };
            }
            var payload = res.data;
            var firma = null;
            if (payload && typeof payload === 'object') {
                if (payload.firma != null) firma = payload.firma;
                else if (payload.id) firma = payload;
            }
            return { ok: true, usedRpc: true, firma: firma || null };
        });
    }

    /**
     * Oturum sahibinin firma kaydı (beklemede / onaylandi / reddedildi fark etmez).
     */
    function getirKullaniciFirma() {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                firma: null,
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return { ok: false, needsAuth: true, firma: null, error: 'Giriş yapmış olmalısınız.' };
            }

            return getirKullaniciFirmaRpc(sb).then(function (rpcRes) {
                /* RPC yoksa / şema cache: doğrudan SELECT yedeği */
                var rpcEksik = rpcRes && rpcRes.supabase &&
                    /PGRST202|does not exist|Could not find the function|firma_panel_getir/i.test(
                        String(rpcRes.supabase.message || '') + String(rpcRes.supabase.code || '')
                    );
                if (rpcRes && rpcRes.ok) {
                    return rpcRes;
                }
                if (rpcRes && !rpcEksik && rpcRes.error) {
                    /* Gerçek RPC hatası — sahte “yok” sayma */
                    return rpcRes;
                }

                return sahipFirmaSelectDene(sb, uid, FIRMA_SAHIP_SELECT_YEDEK).then(function (res) {
                    if (res.error) {
                        logSupabaseHata('firmalar kullanici kaydi select', res.error);
                        return {
                            ok: false,
                            usedRpc: false,
                            firma: null,
                            error: hataMesaji(res.error),
                            supabase: {
                                code: res.error.code || null,
                                message: res.error.message || null,
                                details: res.error.details || null,
                                hint: res.error.hint || null
                            },
                            teknik: hataTeknikOzet(res.error)
                        };
                    }
                    return { ok: true, usedRpc: false, firma: res.data || null };
                });
            });
        }).catch(function (err) {
            logSupabaseHata('getirKullaniciFirma', err);
            return {
                ok: false,
                firma: null,
                error: hataMesaji(err),
                teknik: hataTeknikOzet(err)
            };
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
            var zatenVarMesaj = 'Bu hesapla zaten bir firma başvurusu bulunuyor.';

            return getirKullaniciFirma().then(function (mevcut) {
                if (mevcut && mevcut.ok === false && !mevcut.needsAuth) {
                    /* SELECT/RPC başarısızken INSERT deneme — yanlış ikinci kayıt riski */
                    logSupabaseHata('kaydetFirma: mevcut sorgu basarisiz', mevcut.supabase || mevcut);
                    return {
                        ok: false,
                        firma: null,
                        error: mevcut.error || 'Mevcut firma kaydı okunamadı; yeni başvuru yapılmadı.',
                        teknik: mevcut.teknik || null,
                        supabase: mevcut.supabase || null
                    };
                }
                if (mevcut && mevcut.firma && mevcut.firma.id) {
                    return {
                        ok: false,
                        alreadyExists: true,
                        firma: mevcut.firma,
                        error: zatenVarMesaj
                    };
                }

                var satir = {
                    firma_adi: veri.firma_adi || veri.ad,
                    sehir: veri.sehir,
                    kategori: veri.kategori || veri.kategoriId || null,
                    aciklama: veri.aciklama,
                    telefon: veri.telefon || veri.tel || null,
                    email: (veri.email || '').trim().toLowerCase() || null,
                    dogrulanmis: false,
                    durum: 'basvuru_bekliyor',
                    yayin_durumu: 'incelemede',
                    user_id: userId
                };

                if (veri.yetkili_ad) satir.yetkili_ad = String(veri.yetkili_ad).trim();
                if (veri.ilce) satir.ilce = String(veri.ilce).trim();
                if (veri.adres) satir.adres = String(veri.adres).trim();
                if (veri.vergi_no) satir.vergi_no = String(veri.vergi_no).trim();
                if (veri.vergi_dairesi) satir.vergi_dairesi = String(veri.vergi_dairesi).trim();
                if (veri.hizmet_kategorileri != null) {
                    satir.hizmet_kategorileri = Array.isArray(veri.hizmet_kategorileri)
                        ? veri.hizmet_kategorileri
                        : [veri.hizmet_kategorileri];
                } else if (satir.kategori) {
                    satir.hizmet_kategorileri = [satir.kategori];
                }

                if (veri.logo_url) satir.logo_url = veri.logo_url;
                if (veri.kapak_url) satir.kapak_url = veri.kapak_url;
                if (veri.calisma_gorselleri != null) {
                    satir.calisma_gorselleri = Array.isArray(veri.calisma_gorselleri)
                        ? veri.calisma_gorselleri
                        : [];
                }

                function dene(payload) {
                    return sb.from('firmalar').insert([payload]).then(function (insRes) {
                        if (insRes.error && sutunEksikMi(insRes.error)) {
                            var yedek = Object.assign({}, payload);
                            var msg = String(insRes.error.message || '');
                            if (/kapak_url/i.test(msg)) delete yedek.kapak_url;
                            else if (/logo_url|calisma_gorselleri/i.test(msg)) {
                                delete yedek.logo_url;
                                delete yedek.calisma_gorselleri;
                                delete yedek.kapak_url;
                            } else if (/yetkili_ad|ilce|adres|vergi_|hizmet_kategorileri|yayin_durumu/i.test(msg)) {
                                delete yedek.yetkili_ad;
                                delete yedek.ilce;
                                delete yedek.adres;
                                delete yedek.vergi_no;
                                delete yedek.vergi_dairesi;
                                delete yedek.hizmet_kategorileri;
                                delete yedek.yayin_durumu;
                            } else if (/user_id/i.test(msg)) {
                                return {
                                    ok: false,
                                    error: 'Firma kaydı için kullanıcı kimliği gerekli. Lütfen çıkış yapıp tekrar giriş yapın.'
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
                            var code = insRes.error.code || '';
                            if (code === '23505' || /duplicate|unique|user_id/i.test(String(insRes.error.message || ''))) {
                                return {
                                    ok: false,
                                    alreadyExists: true,
                                    error: zatenVarMesaj,
                                    supabase: {
                                        code: insRes.error.code || null,
                                        message: insRes.error.message || null
                                    }
                                };
                            }
                            logSupabaseHata('firmalar insert', insRes.error);
                            return {
                                ok: false,
                                error: hataMesaji(insRes.error),
                                supabase: {
                                    code: insRes.error.code || null,
                                    message: insRes.error.message || null
                                }
                            };
                        }

                        return getirKullaniciFirma().then(function (son) {
                            var row = son && son.firma ? son.firma : null;
                            return {
                                ok: true,
                                id: row ? row.id : null,
                                durum: row ? row.durum : 'basvuru_bekliyor',
                                dogrulanmis: false,
                                firma: row
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
        veri = veri || {};
        var durum = veri.durum || 'teklif_bekliyor';
        if (durum === 'Acik') durum = 'teklif_bekliyor';

        /* 028 RPC — zengin alanlar + sahip doğrulama */
        return sb.rpc('is_talebi_kaydet', {
            p_payload: Object.assign({}, veri, {
                durum: durum,
                kategori: veri.kategori || veri.kategoriId || null,
                aciklama: veri.aciklama || isTalebiAciklamaBirleştir(veri)
            })
        }).then(function (res) {
            if (!res.error) {
                var d = res.data || {};
                if (d && d.ok === false) {
                    return { ok: false, error: d.error || 'İş talebi kaydedilemedi.' };
                }
                return {
                    ok: true,
                    id: d.id || (d.data && d.data.id) || null,
                    data: d
                };
            }
            /* RPC yoksa eski minimal insert (geriye uyum) */
            var satir = {
                baslik: veri.baslik,
                aciklama: isTalebiAciklamaBirleştir(veri),
                kategori: veri.kategori || veri.kategoriId || null,
                sehir: veri.sehir,
                durum: 'Acik'
            };
            return sb.from('is_talepleri').insert([satir]).select('id').then(function (ins) {
                if (ins.error) return { ok: false, error: hataMesaji(ins.error) };
                return { ok: true, id: ins.data && ins.data[0] ? ins.data[0].id : null };
            });
        }).catch(function (err) {
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

            return getirKullaniciFirma().then(function (firmaRes) {
                if (firmaRes && firmaRes.needsAuth) {
                    return Object.assign({}, bos, { ok: false, needsAuth: true });
                }
                if (firmaRes && firmaRes.ok === false) {
                    var msg = firmaRes.error || 'Firma kaydı yüklenemedi.';
                    var teknik = firmaRes.teknik || '';
                    logSupabaseHata('firma panel firma', firmaRes.supabase || { message: msg });
                    return Object.assign({}, bos, {
                        ok: false,
                        hasFirma: false,
                        firma: null,
                        error: msg,
                        firmaError: msg,
                        supabase: firmaRes.supabase || null,
                        teknik: teknik
                    });
                }
                var firma = firmaRes && firmaRes.firma ? firmaRes.firma : null;
                if (!firma || !firma.id) {
                    return Object.assign({}, bos, { ok: true, hasFirma: false });
                }

                return sb.rpc('firma_tekliflerim').then(function (tekRes) {
                    var teklifKartlari = [];
                    if (!tekRes.error && tekRes.data) {
                        var payload = tekRes.data;
                        var rows = Array.isArray(payload)
                            ? payload
                            : (payload && Array.isArray(payload.teklifler) ? payload.teklifler : []);
                        teklifKartlari = rows.map(function (t) {
                            return {
                                id: t.id,
                                isId: t.is_id,
                                isAdi: t.is_baslik || 'İş talebi',
                                isSehir: t.is_sehir || '',
                                isDurum: t.is_durum || '',
                                fiyat: t.fiyat != null ? Number(t.fiyat) : null,
                                terminGun: t.termin_gun != null ? Number(t.termin_gun) : null,
                                termin: t.termin_gun != null ? (t.termin_gun + ' gün') : '—',
                                durum: 'Gönderildi',
                                createdAt: t.created_at || null
                            };
                        });
                        return {
                            ok: true,
                            hasFirma: true,
                            firma: firma,
                            teklifler: teklifKartlari,
                            usedRpc: !!(firmaRes && firmaRes.usedRpc)
                        };
                    }

                    /* RPC yoksa / hata: başlık için join dene, fiyat gösterilmez */
                    if (tekRes.error) {
                        logSupabaseHata('firma_tekliflerim', tekRes.error);
                    }

                    return sb.from('teklifler')
                        .select('id,is_id,firma_id,termin_gun,created_at,is_talepleri(baslik,sehir,durum)')
                        .eq('firma_id', firma.id)
                        .order('created_at', { ascending: false })
                        .then(function (fallback) {
                            if (fallback.error) {
                                logSupabaseHata('firma panel teklifler fallback', fallback.error);
                                /* Son çare: eski select */
                                return sb.from('teklifler')
                                    .select('id,is_id,firma_id,termin_gun,created_at')
                                    .eq('firma_id', firma.id)
                                    .order('created_at', { ascending: false });
                            }
                            return fallback;
                        })
                        .then(function (tekFallback) {
                            var teklifler = (!tekFallback.error && tekFallback.data) ? tekFallback.data : [];
                            teklifKartlari = teklifler.map(function (t) {
                                var isRel = t.is_talepleri;
                                if (Array.isArray(isRel)) isRel = isRel[0] || null;
                                var baslik = isRel && isRel.baslik
                                    ? String(isRel.baslik)
                                    : null;
                                return {
                                    id: t.id,
                                    isId: t.is_id,
                                    isAdi: baslik || 'İş talebi',
                                    isSehir: (isRel && isRel.sehir) || '',
                                    isDurum: (isRel && isRel.durum) || '',
                                    fiyat: null,
                                    terminGun: t.termin_gun != null ? Number(t.termin_gun) : null,
                                    termin: t.termin_gun != null ? (t.termin_gun + ' gün') : '—',
                                    durum: 'Gönderildi',
                                    createdAt: t.created_at || null
                                };
                            });
                            return {
                                ok: true,
                                hasFirma: true,
                                firma: firma,
                                teklifler: teklifKartlari,
                                usedRpc: !!(firmaRes && firmaRes.usedRpc)
                            };
                        });
                });
            });
        }).catch(function (err) {
            logSupabaseHata('firma panel', err);
            var msg = hataMesaji(err);
            var teknik = hataTeknikOzet(err);
            return Object.assign({}, bos, {
                ok: false,
                error: msg,
                firmaError: msg,
                teknik: teknik
            });
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
            if (res.error && sutunEksikMi(res.error)) {
                return sorgu(selectYedek + ',logo_url,kapak_url');
            }
            if (res.error && /logo_url|kapak_url/i.test(String(res.error.message || ''))) {
                return sorgu(selectYedek);
            }
            return res;
        }).then(function (res) {
            if (res.error && sutunEksikMi(res.error)) {
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
                /* 022 sonrası: yalnızca yayında olanlar (eski kayıtlarda alan yoksa geç) */
                if (row.yayin_durumu && row.yayin_durumu !== 'yayinda') return false;
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

        function selectFallback() {
            return sb.from('is_talepleri')
                .select('id,baslik,aciklama,kategori,sehir,durum,created_at,aciliyet,teslim_tarihi,adet,malzeme,urun_turu,butce_tipi,yayinlanma_tarihi,moderasyon_durumu')
                .in('durum', ['Acik', 'teklif_bekliyor'])
                .eq('moderasyon_durumu', 'aktif')
                .not('yayinlanma_tarihi', 'is', null)
                .order('yayinlanma_tarihi', { ascending: false })
                .limit(40)
                .then(function (res) {
                    if (res.error) {
                        /* Eski şema / kolon eksik: yalnızca Acik */
                        return sb.from('is_talepleri')
                            .select('id,baslik,aciklama,kategori,sehir,durum,created_at')
                            .eq('durum', 'Acik')
                            .order('created_at', { ascending: false })
                            .then(function (res2) {
                                if (res2.error) {
                                    return {
                                        ok: false,
                                        data: [],
                                        error: hataMesaji(res2.error) ||
                                            'Açık iş talepleri yüklenemedi. Lütfen daha sonra tekrar deneyin.'
                                    };
                                }
                                return { ok: true, data: res2.data || [] };
                            });
                    }
                    return { ok: true, data: res.data || [] };
                });
        }

        return sb.rpc('is_talepleri_listele', {
            p_kategori: null,
            p_sehir: null,
            p_aciliyet: null,
            p_limit: 40,
            p_offset: 0
        }).then(function (res) {
            if (res.error) return selectFallback();
            var d = res.data;
            var items = [];
            if (Array.isArray(d)) items = d;
            else if (d && Array.isArray(d.items)) items = d.items;
            else if (d && d.ok && Array.isArray(d.items)) items = d.items;
            return { ok: true, data: items };
        }).catch(function () {
            return selectFallback();
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
                return row && String(row.id) === String(isId) &&
                    (String(row.durum || '') === 'teklif_bekliyor' || String(row.durum || '') === 'Acik');
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

    function medyaDosyaDogrula(file) {
        if (!file) return { ok: false, error: 'Dosya seçilmedi.' };
        if (file.size > 5 * 1024 * 1024) {
            return { ok: false, error: 'Dosya boyutu en fazla 5 MB olabilir.' };
        }
        var tip = String(file.type || '').toLowerCase();
        var ad = String(file.name || '');
        var izinli = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (izinli.indexOf(tip) !== -1 || /\.(jpe?g|png|webp)$/i.test(ad)) {
            return { ok: true, error: null };
        }
        return { ok: false, error: 'Yalnızca JPEG, PNG veya WebP yükleyebilirsiniz.' };
    }

    /**
     * Firma logo / kapak / galeri yükleme (storage bucket: firma-medya).
     * opts.eskiPath verilirse yeni yükleme sonrası eski dosya silinir.
     */
    function yukleFirmaMedya(file, klasor, opts) {
        opts = opts || {};
        var sb = getClient();
        if (!sb || !file) {
            return Promise.resolve({ ok: false, url: null, path: null, error: 'Dosya yok.' });
        }
        var dogrulama = medyaDosyaDogrula(file);
        if (!dogrulama.ok) {
            return Promise.resolve({ ok: false, url: null, path: null, error: dogrulama.error });
        }
        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return { ok: false, url: null, path: null, error: 'Oturum gerekli.', needsAuth: true };
            }
            var uzanti = '';
            var ad = String(file.name || 'dosya');
            var nokta = ad.lastIndexOf('.');
            if (nokta > 0) uzanti = ad.slice(nokta).toLowerCase().replace(/[^a-z0-9.]/g, '');
            if (!uzanti) {
                if (/png/i.test(file.type)) uzanti = '.png';
                else if (/webp/i.test(file.type)) uzanti = '.webp';
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
                    return { ok: false, url: null, path: null, error: hataMesaji(res.error) };
                }
                var pub = sb.storage.from('firma-medya').getPublicUrl(yol);
                var url = pub && pub.data ? pub.data.publicUrl : null;
                if (!url) {
                    return { ok: false, url: null, path: yol, error: 'Görsel URL alınamadı.' };
                }
                var eskiPath = opts.eskiPath ? String(opts.eskiPath).trim() : '';
                if (!eskiPath) {
                    return { ok: true, url: url, path: yol };
                }
                return sb.storage.from('firma-medya').remove([eskiPath]).then(function () {
                    return { ok: true, url: url, path: yol };
                }).catch(function () {
                    return { ok: true, url: url, path: yol };
                });
            });
        }).catch(function (err) {
            logSupabaseHata('firma-medya upload', err);
            return { ok: false, url: null, path: null, error: hataMesaji(err) };
        });
    }

    function silFirmaMedya(path) {
        var sb = getClient();
        if (!sb || !path) {
            return Promise.resolve({ ok: false, error: 'Dosya yolu yok.' });
        }
        return sb.storage.from('firma-medya').remove([String(path)]).then(function (res) {
            if (res.error) {
                logSupabaseHata('firma-medya sil', res.error);
                return { ok: false, error: hataMesaji(res.error) };
            }
            return { ok: true };
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    /**
     * Firma profil kaydet (RPC: firma_profil_kaydet) — taslak / yayına gönder.
     */
    function kaydetFirmaProfil(payload) {
        var sb = getClient();
        if (!sb) {
            return Promise.resolve({
                ok: false,
                error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.'
            });
        }
        payload = payload || {};
        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) {
                return { ok: false, needsAuth: true, error: 'Giriş yapmış olmalısınız.' };
            }
            return sb.rpc('firma_profil_kaydet', { p_payload: payload }).then(function (res) {
                if (res.error) {
                    var msg = String(res.error.message || '');
                    if (/Could not find the function|PGRST202|schema cache/i.test(msg)) {
                        return {
                            ok: false,
                            error: 'Profil kaydetme henüz etkin değil. Veritabanı güncellemesi (022) uygulanmış olmalıdır.'
                        };
                    }
                    if (/firma_yok|P0002/i.test(msg)) {
                        return { ok: false, error: 'Firma kaydı bulunamadı.' };
                    }
                    if (/aski_guncelleme|42501/i.test(msg)) {
                        return { ok: false, error: 'Askıdaki firma profili güncellenemez.' };
                    }
                    if (/firma_adi_gecersiz/i.test(msg)) {
                        return { ok: false, error: 'Firma adı en az 2 karakter olmalı.' };
                    }
                    if (/firma_turu_zorunlu/i.test(msg)) {
                        return { ok: false, error: 'Firma türü seçin.' };
                    }
                    if (/sehir_zorunlu/i.test(msg)) {
                        return { ok: false, error: 'Şehir seçin.' };
                    }
                    if (/ilce_zorunlu/i.test(msg)) {
                        return { ok: false, error: 'İlçe seçin.' };
                    }
                    if (/kategori_zorunlu/i.test(msg)) {
                        return { ok: false, error: 'En az bir hizmet kategorisi seçin.' };
                    }
                    if (/aciklama_kisa/i.test(msg)) {
                        return { ok: false, error: 'Açıklama en az 10 karakter olmalı.' };
                    }
                    if (/yetkili_ad_zorunlu/i.test(msg)) {
                        return { ok: false, error: 'Yetkili adı girin.' };
                    }
                    if (/kurulus_yili_gecersiz/i.test(msg)) {
                        return { ok: false, error: 'Geçerli bir kuruluş yılı girin.' };
                    }
                    return { ok: false, error: hataMesaji(res.error) };
                }
                var data = res.data;
                if (data && data.ok === false) {
                    return { ok: false, error: data.error || 'Kayıt başarısız.' };
                }
                return {
                    ok: true,
                    id: data && data.id,
                    durum: data && data.durum,
                    yayin_durumu: data && data.yayin_durumu,
                    dogrulanmis: data && data.dogrulanmis,
                    firma: data
                };
            });
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    /**
     * Panel iş listesi.
     * Prod’da is_talepleri.owner_id / user_id yok → sahiplik filtresi yok;
     * yalnızca mevcut kolonlar seçilir (42703 engeli).
     */
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
                .select('id,baslik,aciklama,kategori,sehir,durum,created_at')
                .order('created_at', { ascending: false })
                .then(function (res) {
                    if (res.error) {
                        return { ok: false, data: [], error: hataMesaji(res.error) };
                    }
                    return { ok: true, data: res.data || [] };
                });
        }).catch(function (err) {
            return { ok: false, data: [], error: hataMesaji(err) };
        });
    }

    function dogrulamaRpcHata(err) {
        var msg = String((err && err.message) || '');
        if (/email_dogrulanmadi/i.test(msg)) return 'Önce e-posta adresinizi doğrulayın.';
        if (/profil_eksik/i.test(msg)) return 'Firma profilindeki zorunlu alanları tamamlayın.';
        if (/belge_zorunlu/i.test(msg)) return 'En az bir belge yükleyin.';
        if (/sahip_beyani|kvkk_aydinlatma|acik_riza/i.test(msg)) return 'Zorunlu onay kutularını işaretleyin.';
        if (/vergi_no_gecersiz/i.test(msg)) return 'Vergi kimlik numarası formatı geçersiz.';
        if (/vergi_belgesi_zorunlu/i.test(msg)) return 'Güncel e-Vergi levhası yükleyin.';
        if (/oda_belgesi_zorunlu/i.test(msg)) return 'Oda veya sicil belgesi yükleyin.';
        if (/vergi_eslesmedi/i.test(msg)) return 'Önce vergi kaydı GİB kontrolü ile eşleşmeli.';
        if (/oda_sicil_eslesmedi|sahiplik_eslesmedi/i.test(msg)) return 'Oda/sicil veya sahiplik eşleşmesi işaretlenmedi.';
        if (/telefon_teyit_yok/i.test(msg)) return 'Telefon doğrulaması veya admin teyidi gerekli.';
        if (/PGRST202|firma_dogrulama|does not exist/i.test(msg)) {
            return 'Doğrulama API’si eksik. Migration 025/026 uygulanmalı.';
        }
        return hataMesaji(err);
    }

    function firmaDogrulamaKimlikKaydet(payload) {
        var sb = getClient();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        return sb.rpc('firma_dogrulama_kimlik_kaydet', { p_payload: payload || {} }).then(function (res) {
            if (res.error) return { ok: false, error: dogrulamaRpcHata(res.error) };
            return Object.assign({ ok: true }, res.data || {});
        });
    }

    function firmaDogrulamaOzet() {
        var sb = getClient();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        return sb.rpc('firma_dogrulama_ozet').then(function (res) {
            if (res.error) {
                logSupabaseHata('firma_dogrulama_ozet', res.error);
                return { ok: false, error: dogrulamaRpcHata(res.error), teknik: hataTeknikOzet(res.error) };
            }
            return Object.assign({ ok: true }, res.data || {});
        }).catch(function (err) {
            return { ok: false, error: dogrulamaRpcHata(err) };
        });
    }

    function firmaDogrulamaBasvuruHazirla() {
        var sb = getClient();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        return sb.rpc('firma_dogrulama_basvuru_hazirla').then(function (res) {
            if (res.error) return { ok: false, error: dogrulamaRpcHata(res.error) };
            return Object.assign({ ok: true }, res.data || {});
        });
    }

    function firmaDogrulamaBasvuruGonder(basvuruId, flags) {
        var sb = getClient();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        flags = flags || {};
        return sb.rpc('firma_dogrulama_basvuru_gonder', {
            p_basvuru_id: basvuruId,
            p_sahip_beyani: !!flags.sahipBeyani,
            p_kvkk_aydinlatma: !!flags.kvkk,
            p_acik_riza: !!flags.acikRiza
        }).then(function (res) {
            if (res.error) return { ok: false, error: dogrulamaRpcHata(res.error) };
            return Object.assign({ ok: true }, res.data || {});
        });
    }

    /** Private bucket yükleme + meta RPC — public URL tutulmaz */
    function yukleFirmaDogrulamaBelgesi(opts) {
        var sb = getClient();
        var FD = global.AurixFirmaDogrulama || {};
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        opts = opts || {};
        var file = opts.file;
        var check = typeof FD.validateBelgeFile === 'function'
            ? FD.validateBelgeFile(file)
            : { ok: !!file };
        if (!check.ok) return Promise.resolve({ ok: false, error: check.error || 'Dosya geçersiz.' });

        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) return { ok: false, needsAuth: true, error: 'Oturum gerekli.' };
            var ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
            var firmaId = String(opts.firmaId || 'firma');
            var tur = String(opts.belgeTuru || 'diger').replace(/[^a-z0-9_]/gi, '');
            var yol = uid + '/' + firmaId + '/' + tur + '/' + Date.now() + '-' +
                Math.random().toString(36).slice(2, 8) + '.' + ext;

            return file.arrayBuffer().then(function (buf) {
                var hashP = typeof FD.sha256Hex === 'function' ? FD.sha256Hex(buf) : Promise.resolve(null);
                return hashP.then(function (hash) {
                    return sb.storage.from('firma-belgeler').upload(yol, file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: file.type
                    }).then(function (up) {
                        if (up.error) {
                            logSupabaseHata('firma-belgeler upload', up.error);
                            return { ok: false, error: hataMesaji(up.error) };
                        }
                        return sb.rpc('firma_dogrulama_belge_kaydet', {
                            p_payload: {
                                basvuru_id: opts.basvuruId,
                                belge_turu: tur,
                                belge_no: opts.belgeNo || null,
                                duzenlenme_tarihi: opts.duzenlenmeTarihi || null,
                                gecerlilik_tarihi: opts.gecerlilikTarihi || null,
                                storage_path: yol,
                                mime_type: file.type,
                                dosya_boyutu: file.size,
                                dosya_hash: hash,
                                orijinal_ad: file.name
                            }
                        }).then(function (meta) {
                            if (meta.error) {
                                logSupabaseHata('firma_dogrulama_belge_kaydet', meta.error);
                                return { ok: false, error: dogrulamaRpcHata(meta.error) };
                            }
                            return Object.assign({ ok: true, path: yol }, meta.data || {});
                        });
                    });
                });
            });
        }).catch(function (err) {
            return { ok: false, error: dogrulamaRpcHata(err) };
        });
    }

    function firmaDogrulamaBelgeImzaliUrl(belgeId) {
        var sb = getClient();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        return sb.rpc('firma_dogrulama_belge_imzali_url', {
            p_belge_id: belgeId,
            p_saniye: 120
        }).then(function (res) {
            if (res.error) return { ok: false, error: dogrulamaRpcHata(res.error) };
            var d = res.data || {};
            if (!d.path) return { ok: false, error: 'Belge yolu alınamadı.' };
            return sb.storage.from(d.bucket || 'firma-belgeler')
                .createSignedUrl(d.path, d.expires_in || 120)
                .then(function (signed) {
                    if (signed.error) {
                        logSupabaseHata('createSignedUrl', signed.error);
                        return { ok: false, error: hataMesaji(signed.error) };
                    }
                    return {
                        ok: true,
                        url: signed.data && signed.data.signedUrl,
                        expires_in: d.expires_in || 120
                    };
                });
        });
    }

    function firmaDegerlendirmeOzet(firmaId) {
        var sb = getClient();
        if (!sb || firmaId == null || firmaId === '') {
            return Promise.resolve({ ok: false, error: 'Firma yok.' });
        }
        return sb.rpc('firma_degerlendirme_ozet', { p_firma_id: String(firmaId) }).then(function (res) {
            if (res.error) {
                /* RPC yoksa sessiz düş — UI demo/boş duruma geçer */
                return { ok: false, error: hataMesaji(res.error) };
            }
            var d = res.data || {};
            return {
                ok: true,
                ozet: d.ozet || null,
                yorumlar: Array.isArray(d.yorumlar) ? d.yorumlar : []
            };
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    function validateBasvuruBelgeFile(file) {
        if (!file) return { ok: false, error: 'Dosya seçilmedi.' };
        var max = 10 * 1024 * 1024;
        if (file.size > max) return { ok: false, error: 'Dosya boyutu en fazla 10 MB olabilir.' };
        var mime = String(file.type || '').toLowerCase();
        var ad = String(file.name || '').toLowerCase();
        var okMime = mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png';
        var okExt = /\.(pdf|jpe?g|png)$/i.test(ad);
        if (!okMime && !okExt) {
            return { ok: false, error: 'Yalnızca PDF, JPG veya PNG dosyaları kabul edilir.' };
        }
        if (mime === 'application/pdf' && !/\.pdf$/i.test(ad)) {
            return { ok: false, error: 'PDF dosyasının uzantısı .pdf olmalıdır.' };
        }
        return { ok: true };
    }

    /** Private bucket: başvuru belgeleri (vergi levhası / oda belgesi) */
    function yukleFirmaBasvuruBelgesi(opts) {
        var sb = getClient();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        opts = opts || {};
        var file = opts.file;
        var check = validateBasvuruBelgeFile(file);
        if (!check.ok) return Promise.resolve({ ok: false, error: check.error });

        return oturumKullaniciId(sb).then(function (uid) {
            if (!uid) return { ok: false, needsAuth: true, error: 'Oturum gerekli.' };
            var ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (ext === 'jpeg') ext = 'jpg';
            var firmaId = String(opts.firmaId || 'firma');
            var tur = String(opts.belgeTuru || '').replace(/[^a-z0-9_]/gi, '');
            if (tur !== 'vergi_levhasi' && tur !== 'oda_belgesi') {
                return { ok: false, error: 'Belge türü geçersiz.' };
            }
            var yol = uid + '/' + firmaId + '/' + tur + '/' + Date.now() + '-' +
                Math.random().toString(36).slice(2, 8) + '.' + ext;
            var mime = file.type || (ext === 'pdf' ? 'application/pdf' : (ext === 'png' ? 'image/png' : 'image/jpeg'));

            return sb.storage.from('firma-belgeler').upload(yol, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: mime
            }).then(function (up) {
                if (up.error) {
                    logSupabaseHata('firma-belgeler basvuru upload', up.error);
                    return { ok: false, error: hataMesaji(up.error) };
                }
                return sb.rpc('firma_basvuru_belge_kaydet', {
                    p_firma_id: firmaId,
                    p_belge_turu: tur,
                    p_storage_path: yol,
                    p_mime_type: mime,
                    p_dosya_boyutu: file.size,
                    p_orijinal_ad: file.name
                }).then(function (meta) {
                    if (meta.error) {
                        logSupabaseHata('firma_basvuru_belge_kaydet', meta.error);
                        return { ok: false, error: hataMesaji(meta.error) };
                    }
                    return Object.assign({ ok: true, path: yol }, meta.data || {});
                });
            });
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    function firmaBasvuruBelgeImzaliUrl(belgeId) {
        var sb = getClient();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        return sb.rpc('firma_basvuru_belge_imzali_url', {
            p_belge_id: belgeId,
            p_saniye: 120
        }).then(function (res) {
            if (res.error) return { ok: false, error: hataMesaji(res.error) };
            var d = res.data || {};
            if (!d.path) return { ok: false, error: 'Belge yolu alınamadı.' };
            return sb.storage.from(d.bucket || 'firma-belgeler')
                .createSignedUrl(d.path, d.expires_in || 120)
                .then(function (signed) {
                    if (signed.error || !signed.data || !signed.data.signedUrl) {
                        return { ok: false, error: 'Belge bağlantısı oluşturulamadı.' };
                    }
                    return {
                        ok: true,
                        url: signed.data.signedUrl,
                        expiresIn: d.expires_in || 120,
                        belgeTuru: d.belge_turu,
                        orijinalAd: d.orijinal_ad
                    };
                });
        }).catch(function (err) {
            return { ok: false, error: hataMesaji(err) };
        });
    }

    global.AurixSupabase = {
        url: SUPABASE_URL,
        getClient: getClient,
        baglantiHazirMi: baglantiHazirMi,
        kaydetFirma: kaydetFirma,
        getirKullaniciFirma: getirKullaniciFirma,
        guncelleFirma: guncelleFirma,
        kaydetFirmaProfil: kaydetFirmaProfil,
        kaydetIsTalebi: kaydetIsTalebi,
        kaydetTeklif: kaydetTeklif,
        yukleFirmaMedya: yukleFirmaMedya,
        silFirmaMedya: silFirmaMedya,
        firmaDogrulamaOzet: firmaDogrulamaOzet,
        firmaDogrulamaBasvuruHazirla: firmaDogrulamaBasvuruHazirla,
        firmaDogrulamaBasvuruGonder: firmaDogrulamaBasvuruGonder,
        firmaDogrulamaKimlikKaydet: firmaDogrulamaKimlikKaydet,
        yukleFirmaDogrulamaBelgesi: yukleFirmaDogrulamaBelgesi,
        firmaDogrulamaBelgeImzaliUrl: firmaDogrulamaBelgeImzaliUrl,
        yukleFirmaBasvuruBelgesi: yukleFirmaBasvuruBelgesi,
        firmaBasvuruBelgeImzaliUrl: firmaBasvuruBelgeImzaliUrl,
        validateBasvuruBelgeFile: validateBasvuruBelgeFile,
        firmaDegerlendirmeOzet: firmaDegerlendirmeOzet,
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
        FIRMA_PUBLIC_SELECT: FIRMA_PUBLIC_SELECT,
        FIRMA_PANEL_SELECT: FIRMA_PANEL_SELECT
    };
})(typeof window !== 'undefined' ? window : this);

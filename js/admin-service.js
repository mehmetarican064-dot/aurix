/**
 * AURIX Admin Service — güvenli RPC çağrıları (anon key + kullanıcı JWT)
 * service_role asla kullanılmaz.
 */
(function (global) {
    'use strict';

    function getSb() {
        if (!global.AurixSupabase || typeof AurixSupabase.getClient !== 'function') return null;
        return AurixSupabase.getClient();
    }

    function hataMesaji(err) {
        if (!err) return 'İşlem başarısız.';
        var msg = String(err.message || err.error_description || err || '');
        if (/not_admin|42501|permission denied|jwt/i.test(msg)) {
            return 'Bu alana erişim yetkiniz bulunmuyor.';
        }
        if (/red_nedeni_zorunlu|aski_nedeni_zorunlu|kaldirma_nedeni|gerekce_zorunlu/i.test(msg)) {
            return 'Neden / gerekçe alanı zorunludur.';
        }
        if (/vergi_eslesmedi|oda_sicil_eslesmedi|sahiplik_eslesmedi|telefon_teyit_yok|email_dogrulanmadi|firma_askida/i.test(msg)) {
            return 'Rozet önkoşulları eksik (vergi eşleşmesi, oda/sicil, sahiplik, e-posta/telefon teyidi).';
        }
        if (/firma_yok|kullanici_yok|is_yok|teklif_yok/i.test(msg)) {
            return 'Kayıt bulunamadı.';
        }
        if (/firma_onay_basarisiz|firma_red_basarisiz|firma_aski/i.test(msg)) {
            return 'Firma durumu güncellenemedi. Lütfen tekrar deneyin.';
        }
        if (/admin_askiya_alinamaz|kendini_askiya/i.test(msg)) {
            return 'Bu kullanıcı için işlem yapılamaz.';
        }
        if (/invalid input syntax for type uuid|22P02|operator does not exist/i.test(msg)) {
            return 'Kayıt kimliği geçersiz görünüyor. Sayfayı yenileyip tekrar deneyin.';
        }
        if (/network|Failed to fetch|Load failed/i.test(msg)) {
            return 'Bağlantı kurulamadı. İnternetinizi kontrol edin.';
        }
        if (/function.*does not exist|PGRST202|Could not find the function/i.test(msg)) {
            return 'Admin API güncel değil. Migration 023 (firma onay) uygulanmalı.';
        }
        return msg.length < 180 ? msg : 'İşlem başarısız. Lütfen tekrar deneyin.';
    }

    function rpc(name, args) {
        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, data: null, error: 'Supabase bağlantısı yok.' });
        }
        return sb.rpc(name, args || {}).then(function (res) {
            if (res.error) {
                return { ok: false, data: null, error: hataMesaji(res.error) };
            }
            return { ok: true, data: res.data, error: null };
        }).catch(function (err) {
            return { ok: false, data: null, error: hataMesaji(err) };
        });
    }

    /** RPC gövdesinde { ok:false } varsa sahte başarı sayma */
    function rpcJsonOk(res, varsayilanHata) {
        if (!res || !res.ok) return res || { ok: false, data: null, error: varsayilanHata || 'İşlem başarısız.' };
        var d = res.data;
        if (d && typeof d === 'object' && !Array.isArray(d) && d.ok === false) {
            return {
                ok: false,
                data: d,
                error: d.error || d.message || varsayilanHata || 'İşlem başarısız.'
            };
        }
        return res;
    }

    function firmaIdArg(id) {
        var fid = String(id == null ? '' : id).trim();
        if (!fid) {
            return { ok: false, arg: null, error: 'Firma kimliği eksik.' };
        }
        return { ok: true, arg: fid, error: null };
    }

    function ozet() {
        return rpc('admin_ozet');
    }

    function sonKayitlar() {
        return rpc('admin_son_kayitlar');
    }

    /** Genel Bakış harita: p_aralik = 7g | 30g | tum */
    function haritaDagilim(aralik) {
        return rpc('admin_harita_dagilim', { p_aralik: aralik || 'tum' });
    }

    /** Genel Bakış analitik: p_aralik = 7g | 30g | tum */
    function analitikOzet(aralik) {
        return rpc('admin_analitik_ozet', { p_aralik: aralik || '30g' });
    }

    /** Genel Bakış harita il detay özeti */
    function haritaIlOzet(aralik) {
        return rpc('admin_harita_il_ozet', { p_aralik: aralik || 'tum' });
    }

    /** Genel Bakış birleşik aktivite akışı */
    function aktiviteler(limit) {
        return rpc('admin_aktiviteler', { p_limit: limit || 40 });
    }

    function firmaListesi(filtre) {
        return rpc('admin_firma_listesi', { p_filtre: filtre || 'hepsi' });
    }

    function firmaOnayla(id) {
        var p = firmaIdArg(id);
        if (!p.ok) return Promise.resolve({ ok: false, data: null, error: p.error });
        return rpc('admin_firma_onayla', { p_firma_id: p.arg }).then(function (res) {
            return rpcJsonOk(res, 'Firma onaylanamadı.');
        });
    }

    function firmaReddet(id, neden) {
        var p = firmaIdArg(id);
        if (!p.ok) return Promise.resolve({ ok: false, data: null, error: p.error });
        return rpc('admin_firma_reddet', { p_firma_id: p.arg, p_neden: neden }).then(function (res) {
            return rpcJsonOk(res, 'Firma reddedilemedi.');
        });
    }

    function firmaAskiyaAl(id, neden) {
        var p = firmaIdArg(id);
        if (!p.ok) return Promise.resolve({ ok: false, data: null, error: p.error });
        return rpc('admin_firma_askiya_al', { p_firma_id: p.arg, p_neden: neden }).then(function (res) {
            return rpcJsonOk(res, 'Firma askıya alınamadı.');
        });
    }

    function firmaAskiKaldir(id) {
        var p = firmaIdArg(id);
        if (!p.ok) return Promise.resolve({ ok: false, data: null, error: p.error });
        return rpc('admin_firma_aski_kaldir', { p_firma_id: p.arg }).then(function (res) {
            return rpcJsonOk(res, 'Askı kaldırılamadı.');
        });
    }

    function kullaniciListesi() {
        return rpc('admin_kullanici_listesi');
    }

    function kullaniciAskiyaAl(id, neden) {
        return rpc('admin_kullanici_askiya_al', { p_user_id: id, p_neden: neden });
    }

    function kullaniciAskiKaldir(id) {
        return rpc('admin_kullanici_aski_kaldir', { p_user_id: id });
    }

    function isListesi() {
        return rpc('admin_is_listesi');
    }

    function isModerasyon(id, durum, notu) {
        /* Standart: aktif | incelemede | yayindan_kaldirildi */
        var mod = String(durum || '').toLowerCase();
        if (mod === 'kaldirildi' || mod === 'reddedildi') mod = 'yayindan_kaldirildi';
        if (mod === 'beklemede') mod = 'incelemede';
        if (mod === 'onaylandi' || mod === 'acik') mod = 'aktif';

        var islem = mod;
        if (mod === 'yayindan_kaldirildi') islem = 'yayindan_kaldir';
        if (mod === 'aktif') islem = 'tekrar_yayin';
        if (mod === 'incelemede') islem = 'incelemede';

        return rpc('admin_is_talebi_moderasyon', {
            p_id: id,
            p_islem: islem,
            p_not: notu || null
        }).then(function (res) {
            if (res && res.ok) return res;
            return rpc('admin_is_moderasyon', {
                p_is_id: id,
                p_durum: mod,
                p_not: notu || null
            });
        }).catch(function () {
            return rpc('admin_is_moderasyon', {
                p_is_id: id,
                p_durum: mod,
                p_not: notu || null
            });
        });
    }

    function teklifListesi() {
        return rpc('admin_teklif_listesi');
    }

    function teklifGizle(id, gizli, aciklama) {
        return rpc('admin_teklif_gizle', {
            p_teklif_id: id,
            p_gizli: !!gizli,
            p_aciklama: aciklama || null
        });
    }

    function islemListesi(hedefTuru) {
        return rpc('admin_islem_listesi', {
            p_hedef_turu: hedefTuru || null
        });
    }

    function firmaYenidenBasvur() {
        return rpc('firma_yeniden_basvur');
    }

    function dogrulamaListesi(filtre) {
        return rpc('admin_dogrulama_listesi').then(function (res) {
            if (!res.ok) return res;
            var rows = [];
            if (res.data && Array.isArray(res.data.items)) rows = res.data.items;
            else if (Array.isArray(res.data)) rows = res.data;
            if (filtre && filtre !== 'hepsi') {
                rows = rows.filter(function (r) {
                    return String(r.durum || '') === filtre;
                });
            }
            return { ok: true, data: rows, error: null };
        });
    }

    function dogrulamaDetay(basvuruId) {
        return rpc('admin_dogrulama_detay', { p_basvuru_id: basvuruId });
    }

    function dogrulamaKarar(basvuruId, karar, gerekce, gerekceKod, icNot, yenilemeAy) {
        return rpc('admin_dogrulama_karar', {
            p_basvuru_id: basvuruId,
            p_karar: karar,
            p_gerekce: gerekce,
            p_gerekce_kod: gerekceKod || null,
            p_ic_not: icNot || null,
            p_yenileme_ay: yenilemeAy != null ? yenilemeAy : null
        }).then(function (res) {
            return rpcJsonOk(res, 'Doğrulama kararı kaydedilemedi.');
        });
    }

    function vergiKontrolKarar(basvuruId, karar, gerekce, opts) {
        opts = opts || {};
        return rpc('admin_vergi_kontrol_karar', {
            p_basvuru_id: basvuruId,
            p_karar: karar,
            p_gerekce: gerekce,
            p_eslesen: opts.eslesen || {},
            p_uyusmayan: opts.uyusmayan || {},
            p_gib_kontrol_edildi: opts.gibKontrolEdildi !== false
        }).then(function (res) {
            return rpcJsonOk(res, 'Vergi kontrol kararı kaydedilemedi.');
        });
    }

    function dogrulamaEslesmeIsaretle(basvuruId, odaSicil, sahiplik, telefonTeyit) {
        return rpc('admin_dogrulama_eslesme_isaretle', {
            p_basvuru_id: basvuruId,
            p_oda_sicil: !!odaSicil,
            p_sahiplik: !!sahiplik,
            p_telefon_teyit: telefonTeyit == null ? null : !!telefonTeyit
        }).then(function (res) {
            return rpcJsonOk(res, 'Eşleşme kaydedilemedi.');
        });
    }

    /** İstemci tarafı sağlık kontrolleri — uydurma “çalışıyor” yok. */
    function sistemDurumu() {
        var sb = getSb();
        var sonuc = {
            supabase: { durum: 'kontrol_edilemedi', detay: '' },
            oturum: { durum: 'kontrol_edilemedi', detay: '' },
            storage: { durum: 'kontrol_edilemedi', detay: '' },
            realtime: { durum: 'kontrol_edilemedi', detay: '' },
            piyasa: { durum: 'kontrol_edilemedi', detay: '' },
            sonGuncelleme: null,
            surum: '0.4-admin'
        };

        if (!sb) {
            sonuc.supabase = { durum: 'sorun', detay: 'İstemci yok' };
            return Promise.resolve({ ok: true, data: sonuc });
        }

        var p1 = sb.from('profiles').select('id', { count: 'exact', head: true }).then(function (res) {
            if (res.error) {
                sonuc.supabase = { durum: 'sorun', detay: hataMesaji(res.error) };
            } else {
                sonuc.supabase = { durum: 'calisiyor', detay: 'Bağlantı OK' };
            }
        }).catch(function () {
            sonuc.supabase = { durum: 'sorun', detay: 'Bağlantı hatası' };
        });

        var p2 = sb.auth.getSession().then(function (res) {
            if (res.error) {
                sonuc.oturum = { durum: 'sorun', detay: hataMesaji(res.error) };
            } else if (res.data && res.data.session) {
                sonuc.oturum = { durum: 'calisiyor', detay: 'Oturum aktif' };
            } else {
                sonuc.oturum = { durum: 'sorun', detay: 'Oturum yok' };
            }
        }).catch(function () {
            sonuc.oturum = { durum: 'kontrol_edilemedi', detay: 'Oturum okunamadı' };
        });

        var p3 = sb.storage.listBuckets().then(function (res) {
            if (res.error) {
                sonuc.storage = { durum: 'kontrol_edilemedi', detay: 'Bucket listesi alınamadı' };
            } else {
                sonuc.storage = { durum: 'calisiyor', detay: (res.data || []).length + ' bucket' };
            }
        }).catch(function () {
            sonuc.storage = { durum: 'kontrol_edilemedi', detay: 'Storage API erişilemedi' };
        });

        var p4 = Promise.resolve().then(function () {
            try {
                var rt = sb.realtime;
                if (!rt) {
                    sonuc.realtime = { durum: 'kontrol_edilemedi', detay: 'Realtime API yok' };
                    return;
                }
                var state = String(
                    (rt.connection && (rt.connection.state || rt.connection.connectionState)) ||
                    rt._connectionState ||
                    ''
                ).toLowerCase();
                if (state === 'open' || state === 'connected' || state === '1') {
                    sonuc.realtime = { durum: 'calisiyor', detay: 'Bağlantı açık' };
                } else if (state === 'connecting' || state === '0') {
                    sonuc.realtime = { durum: 'kontrol_edilemedi', detay: 'Bağlanıyor' };
                } else if (state) {
                    sonuc.realtime = { durum: 'sorun', detay: 'Durum: ' + state };
                } else {
                    sonuc.realtime = { durum: 'kontrol_edilemedi', detay: 'Durum okunamadı' };
                }
            } catch (e) {
                sonuc.realtime = { durum: 'kontrol_edilemedi', detay: 'Realtime kontrol edilemedi' };
            }
        });

        var p5 = Promise.resolve().then(function () {
            if (global.Aurix && typeof Aurix.getMarketStatus === 'function') {
                var st = Aurix.getMarketStatus();
                if (st && st.ok) {
                    sonuc.piyasa = { durum: 'calisiyor', detay: st.detail || 'Aktif' };
                    sonuc.sonGuncelleme = st.lastUpdate || null;
                } else if (st) {
                    sonuc.piyasa = {
                        durum: st.checked ? 'sorun' : 'kontrol_edilemedi',
                        detay: st.detail || 'Bilinmiyor'
                    };
                    sonuc.sonGuncelleme = st.lastUpdate || null;
                }
            }
        });

        return Promise.all([p1, p2, p3, p4, p5]).then(function () {
            return { ok: true, data: sonuc };
        });
    }

    global.AurixAdminService = {
        ozet: ozet,
        sonKayitlar: sonKayitlar,
        haritaDagilim: haritaDagilim,
        analitikOzet: analitikOzet,
        haritaIlOzet: haritaIlOzet,
        aktiviteler: aktiviteler,
        firmaListesi: firmaListesi,
        firmaOnayla: firmaOnayla,
        firmaReddet: firmaReddet,
        firmaAskiyaAl: firmaAskiyaAl,
        firmaAskiKaldir: firmaAskiKaldir,
        kullaniciListesi: kullaniciListesi,
        kullaniciAskiyaAl: kullaniciAskiyaAl,
        kullaniciAskiKaldir: kullaniciAskiKaldir,
        isListesi: isListesi,
        isModerasyon: isModerasyon,
        teklifListesi: teklifListesi,
        teklifGizle: teklifGizle,
        islemListesi: islemListesi,
        firmaYenidenBasvur: firmaYenidenBasvur,
        dogrulamaListesi: dogrulamaListesi,
        dogrulamaDetay: dogrulamaDetay,
        dogrulamaKarar: dogrulamaKarar,
        vergiKontrolKarar: vergiKontrolKarar,
        dogrulamaEslesmeIsaretle: dogrulamaEslesmeIsaretle,
        sistemDurumu: sistemDurumu,
        hataMesaji: hataMesaji
    };
})(typeof window !== 'undefined' ? window : this);

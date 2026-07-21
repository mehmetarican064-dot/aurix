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
        if (/red_nedeni_zorunlu|aski_nedeni_zorunlu|kaldirma_nedeni/i.test(msg)) {
            return 'Neden alanı zorunludur.';
        }
        if (/firma_yok|kullanici_yok|is_yok|teklif_yok/i.test(msg)) {
            return 'Kayıt bulunamadı.';
        }
        if (/admin_askiya_alinamaz|kendini_askiya/i.test(msg)) {
            return 'Bu kullanıcı için işlem yapılamaz.';
        }
        if (/network|Failed to fetch|Load failed/i.test(msg)) {
            return 'Bağlantı kurulamadı. İnternetinizi kontrol edin.';
        }
        if (/function.*does not exist|PGRST202/i.test(msg)) {
            return 'Admin API henüz kurulmadı. Migration 013 uygulanmalı.';
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

    function ozet() {
        return rpc('admin_ozet');
    }

    function sonKayitlar() {
        return rpc('admin_son_kayitlar');
    }

    function firmaListesi(filtre) {
        return rpc('admin_firma_listesi', { p_filtre: filtre || 'hepsi' });
    }

    function firmaOnayla(id) {
        return rpc('admin_firma_onayla', { p_firma_id: id });
    }

    function firmaReddet(id, neden) {
        return rpc('admin_firma_reddet', { p_firma_id: id, p_neden: neden });
    }

    function firmaAskiyaAl(id, neden) {
        return rpc('admin_firma_askiya_al', { p_firma_id: id, p_neden: neden });
    }

    function firmaAskiKaldir(id) {
        return rpc('admin_firma_aski_kaldir', { p_firma_id: id });
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
        return rpc('admin_is_moderasyon', {
            p_is_id: id,
            p_durum: durum,
            p_not: notu || null
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

    /** İstemci tarafı sağlık kontrolleri — uydurma “çalışıyor” yok. */
    function sistemDurumu() {
        var sb = getSb();
        var sonuc = {
            supabase: { durum: 'kontrol_edilemedi', detay: '' },
            oturum: { durum: 'kontrol_edilemedi', detay: '' },
            storage: { durum: 'kontrol_edilemedi', detay: '' },
            piyasa: { durum: 'kontrol_edilemedi', detay: '' },
            sonGuncelleme: null,
            surum: '0.3-admin'
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

        return Promise.all([p1, p2, p3, p4]).then(function () {
            return { ok: true, data: sonuc };
        });
    }

    global.AurixAdminService = {
        ozet: ozet,
        sonKayitlar: sonKayitlar,
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
        sistemDurumu: sistemDurumu,
        hataMesaji: hataMesaji
    };
})(typeof window !== 'undefined' ? window : this);

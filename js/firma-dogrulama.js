/**
 * AURIX Firma Güven Doğrulama — belge listeleri, durum etiketleri, panel UI yardımcıları
 * Yayın onayı (dogrulanmis/yayin) ile karıştırılmaz.
 */
(function (global) {
    'use strict';

    var esc = (global.AurixUtils && AurixUtils.escapeHtml)
        ? AurixUtils.escapeHtml
        : function (s) { return String(s == null ? '' : s); };

    var BELGE_MAX_BYTES = 10 * 1024 * 1024;
    var BELGE_MIME = {
        'application/pdf': true,
        'image/jpeg': true,
        'image/png': true,
        'image/webp': true
    };

    var DURUM_ETIKET = {
        yok: 'Başvuru yok',
        taslak: 'Taslak',
        incelemede: 'İncelemede',
        ek_belge_gerekli: 'Ek belge gerekli',
        dogrulandi: 'Doğrulandı',
        reddedildi: 'Reddedildi',
        suresi_doldu: 'Süresi doldu',
        askiya_alindi: 'Askıya alındı',
        kalici_kapatildi: 'Kalıcı kapatıldı',
        yenileme_gerekli: 'Yenileme gerekli'
    };

    var GEREKCE_HAZIR = [
        { id: 'belge_okunamiyor', ad: 'Belge okunamıyor' },
        { id: 'bilgiler_eslesmiyor', ad: 'Bilgiler eşleşmiyor' },
        { id: 'belge_guncel_degil', ad: 'Belge güncel değil' },
        { id: 'sahiplik_yok', ad: 'Firma sahipliği doğrulanamadı' },
        { id: 'mukerrer', ad: 'Mükerrer başvuru' },
        { id: 'supheli_belge', ad: 'Şüpheli/değiştirilmiş belge' },
        { id: 'faaliyet_uyumsuz', ad: 'Faaliyet alanı uyumsuz' },
        { id: 'ek_belge', ad: 'Ek belge gerekiyor' },
        { id: 'diger', ad: 'Diğer' }
    ];

    var TEMEL_BELGELER = [
        { id: 'vergi_levhasi', ad: 'Vergi levhası', zorunlu: true },
        { id: 'oda_faaliyet', ad: 'Oda kayıt / faaliyet belgesi', zorunlu: true },
        { id: 'sicil', ad: 'Esnaf sicil / ticaret sicil belgesi', zorunlu: true },
        { id: 'adres_belgesi', ad: 'Firma adresini destekleyen belge', zorunlu: false }
    ];

    function firmaTuruGrup(firmaTuru) {
        var t = String(firmaTuru || '').toLowerCase();
        if (/şahıs|sahis|esnaf|atelier|atölye|atolye/.test(t)) return 'sahis';
        if (/ltd|a\.ş|as\.|anonim|limited|şirket|sirket/.test(t)) return 'sirket';
        return 'genel';
    }

    function belgeListesiForFirma(firma) {
        var grup = firmaTuruGrup(firma && firma.firma_turu);
        var list = TEMEL_BELGELER.slice();
        if (grup === 'sirket') {
            list.push(
                { id: 'mersis', ad: 'MERSİS numarası belgesi', zorunlu: true },
                { id: 'imza_sirkusu', ad: 'İmza sirküsü', zorunlu: false }
            );
        } else if (grup === 'sahis') {
            list.push(
                { id: 'esnaf_oda', ad: 'Esnaf sicil / oda kaydı', zorunlu: true },
                { id: 'imza_beyani', ad: 'İmza beyannamesi', zorunlu: false }
            );
        } else {
            list.push({ id: 'mersis', ad: 'MERSİS (varsa)', zorunlu: false });
        }
        return list;
    }

    function durumEtiket(d) {
        return DURUM_ETIKET[d] || d || '—';
    }

    function guvenRozetAktifMi(firma) {
        return !!(firma && String(firma.guven_dogrulama_durumu || '') === 'dogrulandi');
    }

    function validateBelgeFile(file) {
        if (!file) return { ok: false, error: 'Dosya seçin.' };
        if (file.size > BELGE_MAX_BYTES) {
            return { ok: false, error: 'Dosya en fazla 10 MB olabilir.' };
        }
        var mime = String(file.type || '').toLowerCase();
        if (!BELGE_MIME[mime]) {
            return { ok: false, error: 'Yalnızca PDF, JPG, PNG veya WEBP yükleyin.' };
        }
        var ad = String(file.name || '').toLowerCase();
        if (mime === 'application/pdf' && !/\.pdf$/i.test(ad)) {
            return { ok: false, error: 'PDF uzantısı ile MIME uyuşmuyor.' };
        }
        if (/^image\//.test(mime) && !/\.(jpe?g|png|webp)$/i.test(ad)) {
            return { ok: false, error: 'Görsel uzantısı ile MIME uyuşmuyor.' };
        }
        return { ok: true };
    }

    function sha256Hex(arrayBuffer) {
        if (!global.crypto || !crypto.subtle) {
            return Promise.resolve(null);
        }
        return crypto.subtle.digest('SHA-256', arrayBuffer).then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) {
                return ('0' + b.toString(16)).slice(-2);
            }).join('');
        }).catch(function () { return null; });
    }

    function profilTamamMi(firma) {
        if (!firma) return false;
        return !!(
            String(firma.firma_adi || '').trim().length >= 2 &&
            String(firma.sehir || '').trim() &&
            String(firma.yetkili_ad || '').trim() &&
            String(firma.vergi_no || '').trim()
        );
    }

    global.AurixFirmaDogrulama = {
        BELGE_MAX_BYTES: BELGE_MAX_BYTES,
        GEREKCE_HAZIR: GEREKCE_HAZIR,
        DURUM_ETIKET: DURUM_ETIKET,
        belgeListesiForFirma: belgeListesiForFirma,
        durumEtiket: durumEtiket,
        guvenRozetAktifMi: guvenRozetAktifMi,
        validateBelgeFile: validateBelgeFile,
        sha256Hex: sha256Hex,
        profilTamamMi: profilTamamMi,
        firmaTuruGrup: firmaTuruGrup,
        esc: esc
    };
})(typeof window !== 'undefined' ? window : this);

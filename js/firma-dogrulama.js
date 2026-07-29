/**
 * AURIX Firma Güven / Vergi Doğrulama — yardımcıları
 * Yayın onayı (dogrulanmis/yayin) ile karıştırılmaz.
 * Format geçerli ≠ AURIX Doğrulanmış Firma rozeti.
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

    var VERGI_DURUM_ETIKET = {
        girilmedi: 'Firma doğrulaması yapılmadı',
        format_gecerli: 'Format kontrolü geçti (resmî doğrulama değil)',
        belge_yuklendi: 'Belge yüklendi',
        resmi_kaynaktan_kontrol_bekliyor: 'İnceleme bekliyor',
        eslesti: 'Doğrulandı',
        uyusmazlik: 'Uyuşmazlık',
        gecersiz: 'Geçersiz',
        yeniden_belge_gerekli: 'Ek belge gerekli'
    };

    var KART_DURUM = {
        girilmedi: { metin: 'Firma doğrulaması yapılmadı', sinif: 'bekliyor' },
        format_gecerli: { metin: 'Firma doğrulaması yapılmadı', sinif: 'bekliyor' },
        belge_yuklendi: { metin: 'İnceleme bekliyor', sinif: 'inceleme' },
        resmi_kaynaktan_kontrol_bekliyor: { metin: 'İnceleme bekliyor', sinif: 'inceleme' },
        eslesti: { metin: 'Doğrulandı', sinif: 'ok' },
        uyusmazlik: { metin: 'Ek belge gerekli', sinif: 'uyari' },
        gecersiz: { metin: 'Ek belge gerekli', sinif: 'uyari' },
        yeniden_belge_gerekli: { metin: 'Ek belge gerekli', sinif: 'uyari' }
    };

    var ISLETME_TURLERI = [
        { id: 'sahis', ad: 'Şahıs işletmesi' },
        { id: 'limited', ad: 'Limited şirket' },
        { id: 'anonim', ad: 'Anonim şirket' },
        { id: 'kooperatif', ad: 'Kooperatif' },
        { id: 'diger', ad: 'Diğer' }
    ];

    var BASVURAN_SIFATLARI = [
        { id: 'sahip', ad: 'İşletme sahibi' },
        { id: 'ortak', ad: 'Şirket ortağı' },
        { id: 'yetkili', ad: 'Yetkili' }
    ];

    var GIB_KARARLAR = [
        { id: 'eslesti', ad: 'Eşleşti' },
        { id: 'uyusmazlik', ad: 'Uyuşmazlık var' },
        { id: 'belge_okunamiyor', ad: 'Belge okunamıyor' },
        { id: 'belge_guncel_degil', ad: 'Belge güncel değil' },
        { id: 'resmi_kayitta_yok', ad: 'Resmî kayıtta bulunamadı' },
        { id: 'ek_belge', ad: 'Ek belge gerekli' }
    ];

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
        { id: 'e_vergi_levhasi', ad: 'Güncel e-Vergi Levhası', zorunlu: true },
        { id: 'vergi_levhasi', ad: 'Vergi levhası (alternatif)', zorunlu: false },
        { id: 'oda_faaliyet', ad: 'Oda veya sicil belgesi', zorunlu: true },
        { id: 'sicil', ad: 'Ticaret sicil / esnaf sicil belgesi', zorunlu: true },
        { id: 'yetki_belgesi', ad: 'Yetkiyi gösteren belge (gerekiyorsa)', zorunlu: false },
        { id: 'adres_belgesi', ad: 'Firma adresini destekleyen belge', zorunlu: false }
    ];

    function sadeceRakam(s) {
        return String(s || '').replace(/\D/g, '');
    }

    /** TR VKN (10 hane) checksum */
    function vknGecerli(vkn) {
        var v = sadeceRakam(vkn);
        if (v.length !== 10 || /^0+$/.test(v)) return false;
        var sum = 0;
        var i;
        for (i = 0; i < 9; i++) {
            var d = parseInt(v.charAt(i), 10);
            var tmp = (d + (9 - i)) % 10;
            tmp = (tmp * Math.pow(2, 9 - i)) % 9;
            if (((d + (9 - i)) % 10) !== 0 && tmp === 0) tmp = 9;
            sum += tmp;
        }
        var check = (10 - (sum % 10)) % 10;
        return check === parseInt(v.charAt(9), 10);
    }

    /** TCKN (11 hane) checksum */
    function tcknGecerli(tckn) {
        var s = sadeceRakam(tckn);
        if (s.length !== 11 || s.charAt(0) === '0') return false;
        var d = [];
        var i;
        for (i = 0; i < 11; i++) d.push(parseInt(s.charAt(i), 10));
        var odd = 0;
        var even = 0;
        for (i = 0; i < 9; i++) {
            if (i % 2 === 0) odd += d[i];
            else even += d[i];
        }
        if (((odd * 7) - even) % 10 !== d[9]) return false;
        if ((odd + even + d[9]) % 10 !== d[10]) return false;
        return true;
    }

    function vergiNoKontrol(raw, isletmeTuru) {
        var v = sadeceRakam(raw);
        var sahis = String(isletmeTuru || '') === 'sahis';
        if (!v) {
            return { ok: false, durum: 'girilmedi', tur: null, error: 'Vergi kimlik numarası girin.' };
        }
        if (sahis || v.length === 11) {
            if (v.length !== 11) {
                return { ok: false, durum: 'gecersiz', tur: 'tckn', error: 'Şahıs işletmesi için TCKN 11 hane olmalıdır.' };
            }
            if (!tcknGecerli(v)) {
                return { ok: false, durum: 'gecersiz', tur: 'tckn', error: 'TC Kimlik numarası geçerli değil, lütfen kontrol edin.' };
            }
            return { ok: true, durum: 'format_gecerli', tur: 'tckn', value: v };
        }
        if (v.length !== 10) {
            return { ok: false, durum: 'gecersiz', tur: 'vkn', error: 'VKN yalnızca 10 rakamdan oluşmalıdır.' };
        }
        if (!vknGecerli(v)) {
            return { ok: false, durum: 'gecersiz', tur: 'vkn', error: 'Vergi kimlik numarası geçerli değil, lütfen kontrol edin.' };
        }
        return { ok: true, durum: 'format_gecerli', tur: 'vkn', value: v };
    }

    function firmaTuruGrup(firmaTuru) {
        var t = String(firmaTuru || '').toLowerCase();
        if (/şahıs|sahis|esnaf|atelier|atölye|atolye/.test(t)) return 'sahis';
        if (/ltd|a\.ş|as\.|anonim|limited|şirket|sirket/.test(t)) return 'sirket';
        return 'genel';
    }

    function belgeListesiForFirma(firma) {
        var grup = firmaTuruGrup(firma && (firma.isletme_turu || firma.firma_turu));
        var list = TEMEL_BELGELER.slice();
        if (grup === 'sirket' || grup === 'limited' || grup === 'anonim') {
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
            list.push({ id: 'mersis', ad: 'MERSİS (uygulanıyorsa)', zorunlu: false });
        }
        return list;
    }

    function durumEtiket(d) {
        return DURUM_ETIKET[d] || d || '—';
    }

    function vergiDurumEtiket(d) {
        return VERGI_DURUM_ETIKET[d] || d || 'Firma doğrulaması yapılmadı';
    }

    function profilKartDurum(firma, basvuru) {
        var guven = String((firma && firma.guven_dogrulama_durumu) || '');
        if (guven === 'dogrulandi') {
            return { metin: 'Doğrulandı', sinif: 'ok', kod: 'dogrulandi' };
        }
        if (guven === 'ek_belge_gerekli' || guven === 'yenileme_gerekli') {
            return { metin: 'Ek belge gerekli', sinif: 'uyari', kod: guven };
        }
        if (guven === 'incelemede' || (basvuru && basvuru.durum === 'incelemede')) {
            return { metin: 'İnceleme bekliyor', sinif: 'inceleme', kod: 'incelemede' };
        }
        var v = String((firma && firma.vergi_kimlik_durumu) || 'girilmedi');
        if (KART_DURUM[v]) {
            return Object.assign({ kod: v }, KART_DURUM[v]);
        }
        return { metin: 'Firma doğrulaması yapılmadı', sinif: 'bekliyor', kod: 'girilmedi' };
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
            return { ok: false, error: 'Bu dosya türü desteklenmiyor. Lütfen .pdf uzantılı bir dosya yükleyin.' };
        }
        if (/^image\//.test(mime) && !/\.(jpe?g|png|webp)$/i.test(ad)) {
            return { ok: false, error: 'Bu dosya türü desteklenmiyor. Lütfen JPG, PNG veya WEBP formatında bir görsel yükleyin.' };
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
            String(firma.hukuki_unvan || firma.firma_adi || '').trim().length >= 2 &&
            String(firma.vergi_no || '').trim() &&
            String(firma.vergi_dairesi || '').trim() &&
            String(firma.isletme_turu || '').trim() &&
            String(firma.basvuran_sifati || '').trim()
        );
    }

    function dogrulamaDurumKartiHtml(firma, basvuru) {
        var k = profilKartDurum(firma, basvuru);
        return '<div class="fp-dogrulama-kart fp-dogrulama-kart--' + esc(k.sinif) + '" role="status">' +
            '<div class="fp-dogrulama-kart__ust">' +
            '<strong>' + esc(k.metin) + '</strong>' +
            '<button type="button" class="btn btn--ghost btn--xs" data-panel-aksiyon="dogrulama">' +
            'Firma Doğrulama</button></div>' +
            '<p class="panel-not">Vergi ve resmî belgeler bu sekmede toplanır. Format kontrolü resmî doğrulama değildir; ' +
            '“AURIX Doğrulanmış Firma” rozeti yalnızca belge ve admin eşleşmesi sonrası verilir.</p>' +
            '</div>';
    }

    global.AurixFirmaDogrulama = {
        BELGE_MAX_BYTES: BELGE_MAX_BYTES,
        GEREKCE_HAZIR: GEREKCE_HAZIR,
        GIB_KARARLAR: GIB_KARARLAR,
        DURUM_ETIKET: DURUM_ETIKET,
        VERGI_DURUM_ETIKET: VERGI_DURUM_ETIKET,
        ISLETME_TURLERI: ISLETME_TURLERI,
        BASVURAN_SIFATLARI: BASVURAN_SIFATLARI,
        belgeListesiForFirma: belgeListesiForFirma,
        durumEtiket: durumEtiket,
        vergiDurumEtiket: vergiDurumEtiket,
        profilKartDurum: profilKartDurum,
        guvenRozetAktifMi: guvenRozetAktifMi,
        validateBelgeFile: validateBelgeFile,
        sha256Hex: sha256Hex,
        profilTamamMi: profilTamamMi,
        firmaTuruGrup: firmaTuruGrup,
        vknGecerli: vknGecerli,
        tcknGecerli: tcknGecerli,
        vergiNoKontrol: vergiNoKontrol,
        sadeceRakam: sadeceRakam,
        dogrulamaDurumKartiHtml: dogrulamaDurumKartiHtml,
        esc: esc
    };
})(typeof window !== 'undefined' ? window : this);

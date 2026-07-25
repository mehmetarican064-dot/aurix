/**
 * AURIX — Firma profil yardımcıları (tamamlama, galeri, kategori chip UI)
 */
(function (global) {
    'use strict';

    var FIRMA_TURLERI = [
        { id: 'kuyumcu-atolyesi', ad: 'Kuyumcu Atölyesi' },
        { id: 'cizim-cad', ad: 'Çizim / CAD Tasarım' },
        { id: 'mum-model', ad: 'Mum Model' },
        { id: 'dokum', ad: 'Döküm' },
        { id: 'mihlama', ad: 'Mıhlama' },
        { id: 'cila', ad: 'Cila' },
        { id: 'kalip', ad: 'Kalıp' },
        { id: 'zincir-uretimi', ad: 'Zincir Üretimi' },
        { id: 'tas-tedarikci', ad: 'Taş Tedarikçisi' },
        { id: 'malzeme-tedarikci', ad: 'Malzeme Tedarikçisi' },
        { id: 'makine-ekipman', ad: 'Makine ve Ekipman Tedarikçisi' },
        { id: 'diger', ad: 'Diğer' }
    ];

    if (global.AURIX_DATA) {
        global.AURIX_DATA.FIRMA_TURLERI = FIRMA_TURLERI;
    }

    var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    var ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    var ALLOWED_IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

    function esc(s) {
        if (global.AurixUtils && typeof AurixUtils.escapeHtml === 'function') {
            return AurixUtils.escapeHtml(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function firmaTuruAd(id) {
        if (!id) return '';
        var list = FIRMA_TURLERI;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id || list[i].ad === id) return list[i].ad;
        }
        return String(id);
    }

    function hizmetKategorileriDizi(firma) {
        if (!firma) return [];
        var ham = firma.hizmet_kategorileri;
        if (Array.isArray(ham) && ham.length) return ham.filter(Boolean).map(String);
        if (typeof ham === 'string') {
            try {
                var parsed = JSON.parse(ham);
                if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
            } catch (e) { /* ignore */ }
        }
        if (firma.kategori) return [String(firma.kategori)];
        return [];
    }

    function hesaplaTamamlama(firma) {
        firma = firma || {};
        var eksikler = [];
        var yuzde = 0;

        if (String(firma.firma_adi || '').trim().length >= 2) {
            yuzde += 10;
        } else {
            eksikler.push('Firma adı');
        }

        if (String(firma.firma_turu || '').trim()) {
            yuzde += 10;
        } else {
            eksikler.push('Firma türü');
        }

        if (String(firma.sehir || '').trim() && String(firma.ilce || '').trim()) {
            yuzde += 10;
        } else {
            eksikler.push('Şehir ve ilçe');
        }

        var hizmetler = hizmetKategorileriDizi(firma);
        if (hizmetler.length || String(firma.kategori || '').trim()) {
            yuzde += 15;
        } else {
            eksikler.push('Hizmet kategorileri');
        }

        if (String(firma.aciklama || '').trim().length >= 10) {
            yuzde += 15;
        } else {
            eksikler.push('Firma açıklaması');
        }

        if (String(firma.yetkili_ad || '').trim()) {
            yuzde += 10;
        } else {
            eksikler.push('Yetkili adı');
        }

        var yil = firma.kurulus_yili;
        if (yil != null && yil !== '' && !isNaN(Number(yil))) {
            yuzde += 5;
        } else {
            eksikler.push('Kuruluş yılı');
        }

        if (String(firma.logo_url || '').trim()) {
            yuzde += 10;
        } else {
            eksikler.push('Logo');
        }

        if (String(firma.kapak_url || '').trim()) {
            yuzde += 5;
        } else {
            eksikler.push('Kapak görseli');
        }

        var galeri = parseGaleri(firma);
        if (galeri.length >= 3) {
            yuzde += 10;
        } else {
            eksikler.push('Galeri (en az 3 görsel)');
        }

        return { yuzde: Math.min(100, yuzde), eksikler: eksikler };
    }

    function parseGaleri(firma) {
        if (!firma) return [];
        var ham = firma.calisma_gorselleri;
        var liste = [];
        if (Array.isArray(ham)) {
            liste = ham;
        } else if (typeof ham === 'string' && ham.trim()) {
            try {
                var parsed = JSON.parse(ham);
                if (Array.isArray(parsed)) liste = parsed;
            } catch (e) { /* ignore */ }
        }
        return liste.map(function (g) {
            if (!g) return null;
            if (typeof g === 'string') return { url: g, path: null };
            return {
                url: g.url || g.publicUrl || '',
                path: g.path || g.storage_path || null
            };
        }).filter(function (g) { return g && g.url; });
    }

    function yetkiliPublicAd(ad) {
        var s = String(ad || '').trim();
        if (!s) return '';
        return s.split(/\s+/)[0];
    }

    function validateImageFile(file) {
        if (!file) return { ok: false, error: 'Dosya seçilmedi.' };
        if (file.size > MAX_IMAGE_BYTES) {
            return { ok: false, error: 'Dosya boyutu en fazla 5 MB olabilir.' };
        }
        var tip = String(file.type || '').toLowerCase();
        var ad = String(file.name || '');
        if (ALLOWED_IMAGE_TYPES.indexOf(tip) !== -1 || ALLOWED_IMAGE_EXT.test(ad)) {
            return { ok: true, error: null };
        }
        return { ok: false, error: 'Yalnızca JPEG, PNG veya WebP yükleyebilirsiniz.' };
    }

    function kategoriAdBul(idOrAd) {
        var list = (global.AURIX_DATA && global.AURIX_DATA.KATEGORILER) || [];
        var ham = String(idOrAd || '');
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === ham || list[i].ad === ham) return list[i].ad;
        }
        return ham;
    }

    function katChipHtml(kat, secili) {
        var id = typeof kat === 'string' ? kat : kat.id;
        var ad = typeof kat === 'string' ? kategoriAdBul(kat) : kat.ad;
        var ikon = typeof kat === 'object' && kat.ikon ? kat.ikon + ' ' : '';
        return '<button type="button" class="fp-kat-chip' + (secili ? ' fp-kat-chip--secili' : '') + '" data-fp-kat="' + esc(id) + '" aria-pressed="' + (secili ? 'true' : 'false') + '">' +
            esc(ikon + ad) + '</button>';
    }

    function katChipGrupHtml(seciliIds) {
        seciliIds = seciliIds || [];
        var list = (global.AURIX_DATA && global.AURIX_DATA.KATEGORILER) || [];
        return list.map(function (k) {
            var secili = seciliIds.indexOf(k.id) !== -1 ||
                seciliIds.indexOf(k.ad) !== -1 ||
                seciliIds.some(function (s) {
                    return String(s).toLocaleLowerCase('tr-TR') === String(k.ad).toLocaleLowerCase('tr-TR');
                });
            return katChipHtml(k, secili);
        }).join('');
    }

    function tamamlamaBarHtml(firma) {
        var t = hesaplaTamamlama(firma);
        var eksikMetin = t.eksikler.length
            ? '<p class="fp-profil-tamamlama__eksik">Eksik: ' + esc(t.eksikler.join(', ')) + '</p>'
            : '<p class="fp-profil-tamamlama__eksik fp-profil-tamamlama__eksik--tam">Profiliniz yayına hazır görünüyor.</p>';
        return '<div class="fp-profil-tamamlama">' +
            '<div class="fp-profil-tamamlama__ust">' +
            '<span>Profil tamamlanma</span>' +
            '<strong>%' + esc(String(t.yuzde)) + '</strong>' +
            '</div>' +
            '<div class="fp-profil-tamamlama__bar" role="progressbar" aria-valuenow="' + esc(String(t.yuzde)) + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="fp-profil-tamamlama__dolgu" style="width:' + esc(String(t.yuzde)) + '%"></div>' +
            '</div>' +
            eksikMetin +
            '</div>';
    }

    function galeriOnizlemeHtml(galeri, duzenlenebilir) {
        galeri = galeri || [];
        if (!galeri.length && !duzenlenebilir) {
            return '<p class="fp-bos-metin">Henüz galeri görseli eklenmedi.</p>';
        }
        var ogeler = galeri.map(function (g, i) {
            return '<figure class="fp-galeri-edit__oge" data-galeri-index="' + i + '">' +
                '<img src="' + esc(g.url) + '" alt="" loading="lazy" width="120" height="90">' +
                (duzenlenebilir
                    ? '<button type="button" class="fp-galeri-edit__sil" data-fp-galeri-sil="' + i + '" aria-label="Görseli kaldır">×</button>'
                    : '') +
                '</figure>';
        }).join('');
        var yukle = duzenlenebilir
            ? '<label class="fp-galeri-edit__ekle">' +
                '<span>+ Görsel Ekle</span>' +
                '<input type="file" id="firmaProfilGaleriInput" accept="image/jpeg,image/png,image/webp" multiple hidden>' +
                '</label>'
            : '';
        return '<div class="fp-galeri-edit" id="firmaProfilGaleriOnizleme">' + ogeler + yukle + '</div>';
    }

    function yayinDurumuEtiket(durum) {
        var map = {
            taslak: 'Taslak',
            incelemede: 'İncelemede',
            yayinda: 'Yayında'
        };
        return map[durum] || durum || '—';
    }

    global.AurixFirmaProfil = {
        FIRMA_TURLERI: FIRMA_TURLERI,
        hesaplaTamamlama: hesaplaTamamlama,
        parseGaleri: parseGaleri,
        yetkiliPublicAd: yetkiliPublicAd,
        validateImageFile: validateImageFile,
        hizmetKategorileriDizi: hizmetKategorileriDizi,
        firmaTuruAd: firmaTuruAd,
        katChipHtml: katChipHtml,
        katChipGrupHtml: katChipGrupHtml,
        tamamlamaBarHtml: tamamlamaBarHtml,
        galeriOnizlemeHtml: galeriOnizlemeHtml,
        yayinDurumuEtiket: yayinDurumuEtiket,
        kategoriAdBul: kategoriAdBul
    };
})(typeof window !== 'undefined' ? window : this);

/**
 * AURIX Profesyonel Admin Paneli
 * Erişim: #admin / data-sayfa=admin — yalnızca profiles.role = admin
 */
(function (global) {
    'use strict';

    var aktifBolum = 'genel';
    var firmaOnaySekme = 'beklemede';
    var yukleniyor = {};
    var cache = {
        ozet: null,
        son: null,
        firmalar: [],
        kullanicilar: [],
        isler: [],
        teklifler: [],
        islemler: [],
        sistem: null,
        aktiviteler: null,
        harita: null,
        haritaIl: null,
        analitik: null
    };

    var genelUI = {
        haritaMetrik: 'firma',
        haritaAralik: 'tum',
        analitikAralik: '30g',
        seciliPlaka: null
    };

    /* 81 il — ad + yaklaşık SVG koordinatları (viewBox 1000×480) */
    var TR_ILLER = [
        { p: '01', ad: 'Adana', x: 620, y: 320 },
        { p: '02', ad: 'Adıyaman', x: 700, y: 290 },
        { p: '03', ad: 'Afyonkarahisar', x: 420, y: 250 },
        { p: '04', ad: 'Ağrı', x: 900, y: 180 },
        { p: '05', ad: 'Amasya', x: 620, y: 140 },
        { p: '06', ad: 'Ankara', x: 520, y: 200 },
        { p: '07', ad: 'Antalya', x: 430, y: 340 },
        { p: '08', ad: 'Artvin', x: 820, y: 100 },
        { p: '09', ad: 'Aydın', x: 300, y: 300 },
        { p: '10', ad: 'Balıkesir', x: 280, y: 180 },
        { p: '11', ad: 'Bilecik', x: 380, y: 170 },
        { p: '12', ad: 'Bingöl', x: 800, y: 230 },
        { p: '13', ad: 'Bitlis', x: 860, y: 250 },
        { p: '14', ad: 'Bolu', x: 440, y: 150 },
        { p: '15', ad: 'Burdur', x: 400, y: 300 },
        { p: '16', ad: 'Bursa', x: 340, y: 170 },
        { p: '17', ad: 'Çanakkale', x: 220, y: 160 },
        { p: '18', ad: 'Çankırı', x: 560, y: 150 },
        { p: '19', ad: 'Çorum', x: 580, y: 150 },
        { p: '20', ad: 'Denizli', x: 360, y: 300 },
        { p: '21', ad: 'Diyarbakır', x: 780, y: 280 },
        { p: '22', ad: 'Edirne', x: 180, y: 100 },
        { p: '23', ad: 'Elazığ', x: 760, y: 250 },
        { p: '24', ad: 'Erzincan', x: 760, y: 190 },
        { p: '25', ad: 'Erzurum', x: 840, y: 170 },
        { p: '26', ad: 'Eskişehir', x: 420, y: 200 },
        { p: '27', ad: 'Gaziantep', x: 680, y: 320 },
        { p: '28', ad: 'Giresun', x: 720, y: 120 },
        { p: '29', ad: 'Gümüşhane', x: 760, y: 140 },
        { p: '30', ad: 'Hakkari', x: 940, y: 290 },
        { p: '31', ad: 'Hatay', x: 640, y: 360 },
        { p: '32', ad: 'Isparta', x: 420, y: 290 },
        { p: '33', ad: 'Mersin', x: 560, y: 340 },
        { p: '34', ad: 'İstanbul', x: 300, y: 110 },
        { p: '35', ad: 'İzmir', x: 260, y: 260 },
        { p: '36', ad: 'Kars', x: 880, y: 140 },
        { p: '37', ad: 'Kastamonu', x: 520, y: 100 },
        { p: '38', ad: 'Kayseri', x: 620, y: 240 },
        { p: '39', ad: 'Kırklareli', x: 200, y: 90 },
        { p: '40', ad: 'Kırşehir', x: 560, y: 220 },
        { p: '41', ad: 'Kocaeli', x: 340, y: 130 },
        { p: '42', ad: 'Konya', x: 500, y: 280 },
        { p: '43', ad: 'Kütahya', x: 380, y: 220 },
        { p: '44', ad: 'Malatya', x: 720, y: 260 },
        { p: '45', ad: 'Manisa', x: 300, y: 250 },
        { p: '46', ad: 'Kahramanmaraş', x: 660, y: 290 },
        { p: '47', ad: 'Mardin', x: 820, y: 310 },
        { p: '48', ad: 'Muğla', x: 320, y: 340 },
        { p: '49', ad: 'Muş', x: 840, y: 230 },
        { p: '50', ad: 'Nevşehir', x: 580, y: 250 },
        { p: '51', ad: 'Niğde', x: 580, y: 280 },
        { p: '52', ad: 'Ordu', x: 700, y: 120 },
        { p: '53', ad: 'Rize', x: 780, y: 100 },
        { p: '54', ad: 'Sakarya', x: 360, y: 140 },
        { p: '55', ad: 'Samsun', x: 640, y: 110 },
        { p: '56', ad: 'Siirt', x: 860, y: 280 },
        { p: '57', ad: 'Sinop', x: 580, y: 80 },
        { p: '58', ad: 'Sivas', x: 680, y: 190 },
        { p: '59', ad: 'Tekirdağ', x: 220, y: 120 },
        { p: '60', ad: 'Tokat', x: 640, y: 160 },
        { p: '61', ad: 'Trabzon', x: 760, y: 110 },
        { p: '62', ad: 'Tunceli', x: 760, y: 220 },
        { p: '63', ad: 'Şanlıurfa', x: 740, y: 320 },
        { p: '64', ad: 'Uşak', x: 360, y: 260 },
        { p: '65', ad: 'Van', x: 920, y: 240 },
        { p: '66', ad: 'Yozgat', x: 580, y: 190 },
        { p: '67', ad: 'Zonguldak', x: 440, y: 110 },
        { p: '68', ad: 'Aksaray', x: 540, y: 260 },
        { p: '69', ad: 'Bayburt', x: 800, y: 150 },
        { p: '70', ad: 'Karaman', x: 520, y: 320 },
        { p: '71', ad: 'Kırıkkale', x: 540, y: 190 },
        { p: '72', ad: 'Batman', x: 820, y: 290 },
        { p: '73', ad: 'Şırnak', x: 880, y: 300 },
        { p: '74', ad: 'Bartın', x: 460, y: 90 },
        { p: '75', ad: 'Ardahan', x: 880, y: 110 },
        { p: '76', ad: 'Iğdır', x: 920, y: 160 },
        { p: '77', ad: 'Yalova', x: 320, y: 140 },
        { p: '78', ad: 'Karabük', x: 480, y: 120 },
        { p: '79', ad: 'Kilis', x: 660, y: 340 },
        { p: '80', ad: 'Osmaniye', x: 640, y: 330 },
        { p: '81', ad: 'Düzce', x: 400, y: 130 }
    ];

    var TR_IL_ALIAS = {
        'afyon': 'Afyonkarahisar',
        'afyon karahisar': 'Afyonkarahisar',
        'afyonkarahisar': 'Afyonkarahisar',
        'agmri': 'Ağrı',
        'agri': 'Ağrı',
        'ic el': 'Mersin',
        'icel': 'Mersin',
        'içel': 'Mersin',
        'mersin': 'Mersin',
        'istanbul': 'İstanbul',
        'izmir': 'İzmir',
        'sanliurfa': 'Şanlıurfa',
        'şanliurfa': 'Şanlıurfa',
        'urfa': 'Şanlıurfa',
        'marash': 'Kahramanmaraş',
        'maras': 'Kahramanmaraş',
        'maraş': 'Kahramanmaraş',
        'kahramanmaras': 'Kahramanmaraş',
        'kahramanmaraş': 'Kahramanmaraş',
        'k.maras': 'Kahramanmaraş',
        'k.maraş': 'Kahramanmaraş',
        'sirnak': 'Şırnak',
        'şırnak': 'Şırnak',
        'igdir': 'Iğdır',
        'ığdır': 'Iğdır',
        'canakkale': 'Çanakkale',
        'çanakkale': 'Çanakkale',
        'ankara': 'Ankara',
        'gaziantep': 'Gaziantep',
        'antep': 'Gaziantep',
        'diyarbakir': 'Diyarbakır',
        'diyarbakır': 'Diyarbakır',
        'elazig': 'Elazığ',
        'elazığ': 'Elazığ',
        'gumushane': 'Gümüşhane',
        'gümüşhane': 'Gümüşhane',
        'nevsehir': 'Nevşehir',
        'nevşehir': 'Nevşehir',
        'nigde': 'Niğde',
        'niğde': 'Niğde',
        'mugla': 'Muğla',
        'muğla': 'Muğla',
        'mus': 'Muş',
        'muş': 'Muş',
        'tekirdag': 'Tekirdağ',
        'tekirdağ': 'Tekirdağ',
        'kirklareli': 'Kırklareli',
        'kırklareli': 'Kırklareli',
        'kirikkale': 'Kırıkkale',
        'kırıkkale': 'Kırıkkale',
        'kirsehir': 'Kırşehir',
        'kırşehir': 'Kırşehir',
        'usak': 'Uşak',
        'uşak': 'Uşak',
        'balikesir': 'Balıkesir',
        'balıkesir': 'Balıkesir',
        'canakkale': 'Çanakkale',
        'cankiri': 'Çankırı',
        'çankırı': 'Çankırı',
        'corum': 'Çorum',
        'çorum': 'Çorum',
        'eskisehir': 'Eskişehir',
        'eskişehir': 'Eskişehir',
        'kutahya': 'Kütahya',
        'kütahya': 'Kütahya',
        'hatay': 'Hatay',
        'antakya': 'Hatay'
    };

    var TR_IL_BOLGE = {
        '01': 'Akdeniz', '02': 'Güneydoğu Anadolu', '03': 'Ege', '04': 'Doğu Anadolu', '05': 'Karadeniz',
        '06': 'İç Anadolu', '07': 'Akdeniz', '08': 'Karadeniz', '09': 'Ege', '10': 'Marmara',
        '11': 'Marmara', '12': 'Doğu Anadolu', '13': 'Doğu Anadolu', '14': 'Karadeniz', '15': 'Akdeniz',
        '16': 'Marmara', '17': 'Marmara', '18': 'İç Anadolu', '19': 'Karadeniz', '20': 'Ege',
        '21': 'Güneydoğu Anadolu', '22': 'Marmara', '23': 'Doğu Anadolu', '24': 'Doğu Anadolu', '25': 'Doğu Anadolu',
        '26': 'İç Anadolu', '27': 'Güneydoğu Anadolu', '28': 'Karadeniz', '29': 'Karadeniz', '30': 'Doğu Anadolu',
        '31': 'Akdeniz', '32': 'Akdeniz', '33': 'Akdeniz', '34': 'Marmara', '35': 'Ege',
        '36': 'Doğu Anadolu', '37': 'Karadeniz', '38': 'İç Anadolu', '39': 'Marmara', '40': 'İç Anadolu',
        '41': 'Marmara', '42': 'İç Anadolu', '43': 'Ege', '44': 'Doğu Anadolu', '45': 'Ege',
        '46': 'Akdeniz', '47': 'Güneydoğu Anadolu', '48': 'Ege', '49': 'Doğu Anadolu', '50': 'İç Anadolu',
        '51': 'İç Anadolu', '52': 'Karadeniz', '53': 'Karadeniz', '54': 'Marmara', '55': 'Karadeniz',
        '56': 'Güneydoğu Anadolu', '57': 'Karadeniz', '58': 'İç Anadolu', '59': 'Marmara', '60': 'Karadeniz',
        '61': 'Karadeniz', '62': 'Doğu Anadolu', '63': 'Güneydoğu Anadolu', '64': 'Ege', '65': 'Doğu Anadolu',
        '66': 'İç Anadolu', '67': 'Karadeniz', '68': 'İç Anadolu', '69': 'Karadeniz', '70': 'İç Anadolu',
        '71': 'İç Anadolu', '72': 'Güneydoğu Anadolu', '73': 'Güneydoğu Anadolu', '74': 'Karadeniz', '75': 'Doğu Anadolu',
        '76': 'Doğu Anadolu', '77': 'Marmara', '78': 'Karadeniz', '79': 'Güneydoğu Anadolu', '80': 'Akdeniz', '81': 'Karadeniz'
    };
    var TR_BOLGE_SIRASI = ['Marmara', 'Ege', 'Akdeniz', 'İç Anadolu', 'Karadeniz', 'Doğu Anadolu', 'Güneydoğu Anadolu'];

    var TR_IL_BY_NORM = null;

    function sehirNormalize(raw) {
        var s = String(raw == null ? '' : raw).trim();
        if (!s) return '';
        s = s.replace(/\s+/g, ' ');
        s = s.replace(/\s+(ili|il)$/i, '');
        try {
            s = s.toLocaleLowerCase('tr-TR');
        } catch (e) {
            s = s.toLowerCase();
        }
        /* TR: I→ı, İ→i — ASCII I ile yazılan İstanbul/Istanbul eşleşsin */
        s = s.replace(/\u0131/g, 'i');
        return s;
    }

    function ilIndexKur() {
        if (TR_IL_BY_NORM) return;
        TR_IL_BY_NORM = {};
        TR_ILLER.forEach(function (il) {
            TR_IL_BY_NORM[sehirNormalize(il.ad)] = il;
        });
        Object.keys(TR_IL_ALIAS).forEach(function (k) {
            var ad = TR_IL_ALIAS[k];
            var il = TR_ILLER.filter(function (x) { return x.ad === ad; })[0];
            if (il) TR_IL_BY_NORM[sehirNormalize(k)] = il;
        });
    }

    function ilBul(sehirHam) {
        ilIndexKur();
        var n = sehirNormalize(sehirHam);
        if (!n) return null;
        if (TR_IL_BY_NORM[n]) return TR_IL_BY_NORM[n];
        /* alias tablosu zaten norm key ile */
        if (TR_IL_ALIAS[n]) {
            var ad = TR_IL_ALIAS[n];
            return TR_ILLER.filter(function (x) { return x.ad === ad; })[0] || null;
        }
        return null;
    }

    function illerAlfabetik() {
        return TR_ILLER.slice().sort(function (a, b) {
            return a.ad.localeCompare(b.ad, 'tr');
        });
    }

    function sehirSelectHtml(id, selectedValue) {
        var secili = selectedValue == null ? '' : String(selectedValue);
        var opts = '<option value="">Tüm Şehirler</option>' +
            illerAlfabetik().map(function (il) {
                var sel = secili && secili === il.ad ? ' selected' : '';
                return '<option value="' + esc(il.ad) + '"' + sel + '>' + esc(il.ad) + '</option>';
            }).join('');
        return '<select class="form-input" id="' + esc(id) + '">' + opts + '</select>';
    }

    function sehirEslesir(ham, secili) {
        if (!secili) return true;
        var il = ilBul(ham);
        var hedef = ilBul(secili) || TR_ILLER.filter(function (x) { return x.ad === secili; })[0] || null;
        if (!hedef) return sehirNormalize(ham) === sehirNormalize(secili);
        if (!il) return false;
        return il.p === hedef.p;
    }

    function kpiTrendHtml(curr, prev) {
        var c = Number(curr) || 0;
        var p = Number(prev);
        var hafta = (c > 0 ? '+' : '') + c + ' bu hafta';
        var pctTxt = '—';
        var dir = 'flat';
        if (prev != null && !isNaN(p) && p !== 0) {
            var pct = ((c - p) / p) * 100;
            if (isFinite(pct)) {
                var rounded = Math.round(pct);
                pctTxt = 'Önceki döneme göre ' + (rounded > 0 ? '+' : '') + rounded + '%';
                dir = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat');
            }
        } else if (c > 0) {
            dir = 'up';
        }
        return '<div class="ap-kpi__trend ap-kpi__trend--' + dir + '">' +
            '<span>' + esc(hafta) + '</span>' +
            '<span>' + esc(pctTxt) + '</span></div>';
    }

    function paraTR(n) {
        var v = Number(n) || 0;
        try {
            return v.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
        } catch (e) {
            return '₺' + v.toFixed(2).replace('.', ',');
        }
    }

    function asArray(v) {
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object') {
            try {
                return Object.keys(v).map(function (k) { return v[k]; });
            } catch (e) { /* ignore */ }
        }
        if (typeof v === 'string') {
            try {
                var p = JSON.parse(v);
                return Array.isArray(p) ? p : [];
            } catch (e2) { return []; }
        }
        return [];
    }

    var RED_NEDENLERI = [
        'Eksik firma bilgileri',
        'Doğrulanamayan firma',
        'Uygunsuz içerik',
        'Yanlış kategori',
        'Tekrarlanan firma hesabı',
        'Diğer'
    ];

    function esc(s) {
        if (global.AurixUtils && AurixUtils.escapeHtml) return AurixUtils.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(mesaj, tip) {
        if (global.Aurix && Aurix.toast) Aurix.toast(mesaj, tip || 'info');
    }

    function svc() {
        return global.AurixAdminService || null;
    }

    function $(id) {
        return document.getElementById(id);
    }

    function tarihTR(v) {
        if (!v) return '—';
        try {
            return new Date(v).toLocaleString('tr-TR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return '—';
        }
    }

    function tarihKisa(v) {
        if (!v) return '—';
        try {
            return new Date(v).toLocaleDateString('tr-TR');
        } catch (e) {
            return '—';
        }
    }

    function durumRozet(durum) {
        var d = String(durum || '').toLowerCase();
        var cls = 'ap-badge';
        if (d === 'onaylandi' || d === 'aktif' || d === 'acik') cls += ' ap-badge--ok';
        else if (d === 'beklemede' || d === 'incelemede') cls += ' ap-badge--warn';
        else if (d === 'reddedildi' || d === 'kaldirildi' || d === 'aski') cls += ' ap-badge--bad';
        return '<span class="' + cls + '">' + esc(durum || '—') + '</span>';
    }

    function bosDurum(mesaj) {
        return '<div class="ap-bos" role="status"><p>' + esc(mesaj) + '</p></div>';
    }

    function hataDurum(mesaj) {
        return '<div class="ap-hata" role="alert"><p>' + esc(mesaj) + '</p></div>';
    }

    function yukleniyorHtml() {
        return '<div class="ap-yukleniyor" role="status"><span class="ap-spinner" aria-hidden="true"></span><p>Yükleniyor…</p></div>';
    }

    function setBolumLoading(id, on) {
        yukleniyor[id] = !!on;
        var el = $('apIcerik');
        if (el && aktifBolum === id && on) el.innerHTML = yukleniyorHtml();
    }

    /* ---------- Erişim ---------- */
    function yetkiliMi() {
        return !!(global.AuthService && AuthService.isAdmin && AuthService.isAdmin());
    }

    function panelAc() {
        if (!yetkiliMi()) {
            toast('Bu alana erişim yetkiniz bulunmuyor.', 'error');
            if (global.Aurix && Aurix.sayfaGoster) Aurix.sayfaGoster('ana-sayfa');
            return false;
        }
        document.documentElement.classList.add('ap-aktif');
        menuyuSenkronla();
        bolumGoster(aktifBolum || 'genel');
        return true;
    }

    function panelKapat() {
        document.documentElement.classList.remove('ap-aktif');
        document.documentElement.classList.remove('ap-menu-acik');
    }

    /* ---------- Menü ---------- */
    function menuyuSenkronla() {
        document.querySelectorAll('[data-ap-bolum]').forEach(function (btn) {
            var b = btn.getAttribute('data-ap-bolum');
            btn.classList.toggle('ap-nav__item--aktif', b === aktifBolum);
            btn.setAttribute('aria-current', b === aktifBolum ? 'page' : 'false');
        });
        var baslik = $('apUstBaslik');
        var map = {
            genel: 'Genel Bakış',
            onaylar: 'Firma Onayları',
            dogrulama: 'Güven Doğrulama',
            firmalar: 'Firmalar',
            kullanicilar: 'Kullanıcılar',
            isler: 'İş Talepleri',
            teklifler: 'Teklifler',
            sikayetler: 'Şikâyetler',
            islemler: 'İşlem Kayıtları',
            sistem: 'Sistem Durumu'
        };
        if (baslik) baslik.textContent = map[aktifBolum] || 'Admin';
    }

    function bolumGoster(id) {
        aktifBolum = id || 'genel';
        menuyuSenkronla();
        document.documentElement.classList.remove('ap-menu-acik');
        var el = $('apIcerik');
        if (!el) return;
        el.innerHTML = yukleniyorHtml();

        if (id === 'genel') return yukleGenel();
        if (id === 'onaylar') return yukleOnaylar();
        if (id === 'dogrulama') return yukleDogrulama();
        if (id === 'firmalar') return yukleFirmalar();
        if (id === 'kullanicilar') return yukleKullanicilar();
        if (id === 'isler') return yukleIsler();
        if (id === 'teklifler') return yukleTeklifler();
        if (id === 'sikayetler') {
            el.innerHTML = bosDurum('Henüz şikâyet sistemi etkin değil.');
            return;
        }
        if (id === 'islemler') return yukleIslemler();
        if (id === 'sistem') return yukleSistem();
        el.innerHTML = bosDurum('Bölüm bulunamadı.');
    }

    /* ---------- Genel ---------- */
    function haritaMetrikKey() {
        if (genelUI.haritaMetrik === 'kullanici') return 'kullanici';
        if (genelUI.haritaMetrik === 'is') return 'is';
        return 'firma';
    }

    function haritaAralikEtiket() {
        if (genelUI.haritaAralik === '7g') return 'Son 7 gün';
        if (genelUI.haritaAralik === '30g') return 'Son 30 gün';
        return 'Tüm zamanlar';
    }

    var turkeySvgCache = null;
    var turkeySvgPromise = null;

    function loadTurkeySvg() {
        if (turkeySvgCache) return Promise.resolve(turkeySvgCache);
        if (turkeySvgPromise) return turkeySvgPromise;
        turkeySvgPromise = fetch('assets/turkey-provinces.svg')
            .then(function (res) {
                if (!res.ok) throw new Error('SVG yüklenemedi');
                return res.text();
            })
            .then(function (txt) {
                turkeySvgCache = txt;
                return txt;
            })
            .catch(function (err) {
                turkeySvgPromise = null;
                throw err;
            });
        return turkeySvgPromise;
    }

    function haritaAggregeMetrik(key) {
        var data = cache.harita || {};
        var rows = asArray(data[key]);
        var byPlaka = {};
        var eslesmeyen = [];
        var eslesmeyenAdet = 0;

        rows.forEach(function (r) {
            var ham = r && r.sehir != null ? r.sehir : '';
            var adet = Number(r && r.adet) || 0;
            if (!adet) return;
            var il = ilBul(ham);
            if (!il) {
                eslesmeyen.push({ sehir: String(ham || '—'), adet: adet });
                eslesmeyenAdet += adet;
                return;
            }
            byPlaka[il.p] = (byPlaka[il.p] || 0) + adet;
        });

        var bos = (data.bos && data.bos[key]) ? Number(data.bos[key]) || 0 : 0;
        if (bos > 0) {
            eslesmeyen.push({ sehir: '(şehir boş)', adet: bos });
            eslesmeyenAdet += bos;
        }

        return { byPlaka: byPlaka, eslesmeyen: eslesmeyen, eslesmeyenAdet: eslesmeyenAdet };
    }

    function haritaAggrege() {
        var key = haritaMetrikKey();
        var selected = haritaAggregeMetrik(key);
        var kul = haritaAggregeMetrik('kullanici').byPlaka;
        var fir = haritaAggregeMetrik('firma').byPlaka;
        var ism = haritaAggregeMetrik('is').byPlaka;
        var byPlaka = {};
        var max = 0;

        TR_ILLER.forEach(function (il) {
            var c = {
                kullanici: kul[il.p] || 0,
                firma: fir[il.p] || 0,
                is: ism[il.p] || 0
            };
            c.adet = c[key] || 0;
            byPlaka[il.p] = { il: il, counts: c, adet: c.adet };
            if (c.adet > max) max = c.adet;
        });

        return {
            byPlaka: byPlaka,
            eslesmeyen: selected.eslesmeyen,
            eslesmeyenAdet: selected.eslesmeyenAdet,
            max: max,
            key: key
        };
    }

    function haritaAltinFill(t) {
        /* t: 0..1 — veri yoğunluğu arttıkça altın koyulaşır/parlaklaşır */
        var clamped = Math.max(0, Math.min(1, t));
        var r = Math.round(90 + clamped * (232 - 90));
        var g = Math.round(72 + clamped * (196 - 72));
        var b = Math.round(18 + clamped * (72 - 18));
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function haritaIlAdi(plaka) {
        var il = TR_ILLER.filter(function (x) { return x.p === plaka; })[0];
        return il ? il.ad : plaka;
    }

    function applyTurkeyMapColors(svgRoot, agg) {
        if (!svgRoot || !agg) return 0;
        var max = agg.max || 0;
        var groups = svgRoot.querySelectorAll('g[data-plakakodu]');
        var n = 0;
        groups.forEach(function (g) {
            var p = g.getAttribute('data-plakakodu');
            if (!p || p === '00') return;
            n += 1;
            var row = agg.byPlaka[p];
            var adet = row ? row.adet : 0;
            var fill = adet > 0 && max > 0
                ? haritaAltinFill(adet / max)
                : '#2a2e35';
            g.setAttribute('data-ap-il', p);
            g.classList.add('ap-map__il');
            g.classList.toggle('ap-map__il--aktif', genelUI.seciliPlaka === p);
            g.querySelectorAll('path').forEach(function (path) {
                path.setAttribute('fill', fill);
                path.style.fill = fill;
                path.setAttribute('stroke', 'rgba(201,162,39,0.45)');
                path.setAttribute('stroke-width', '0.55');
                path.style.pointerEvents = 'all';
            });
        });
        return n;
    }

    function bindTurkeyMapInteractions(wrap, agg) {
        /* Eski body tooltip varsa kaldır */
        var stale = document.getElementById('apMapTooltip');
        if (stale && stale.parentNode !== wrap) stale.parentNode.removeChild(stale);

        var tip = wrap.querySelector('.ap-map-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.className = 'ap-map-tooltip';
            tip.setAttribute('aria-hidden', 'true');
            tip.hidden = true;
            wrap.appendChild(tip);
        }

        var tipW = 180;
        var tipH = 110;

        function hideTip() {
            tip.hidden = true;
            tip.setAttribute('aria-hidden', 'true');
        }

        function showTip(plaka, evt) {
            var d = ilDetayPlaka(plaka);
            tip.innerHTML =
                '<strong>' + esc(haritaIlAdi(plaka)) + '</strong>' +
                '<span>Kullanıcı: <b>' + esc(String(d.kullanici)) + '</b></span>' +
                '<span>Firma: <b>' + esc(String(d.firma)) + '</b></span>' +
                '<span>İş talebi: <b>' + esc(String(d.is)) + '</b></span>' +
                '<em>' + esc(haritaAralikEtiket()) + '</em>';
            tip.hidden = false;
            tip.setAttribute('aria-hidden', 'false');

            var rect = wrap.getBoundingClientRect();
            var relX = (evt.clientX - rect.left) + wrap.scrollLeft;
            var relY = (evt.clientY - rect.top) + wrap.scrollTop;
            var left = relX + 12;
            var top = relY + 12;
            var maxL = Math.max(4, wrap.clientWidth - tipW - 4);
            var maxT = Math.max(4, wrap.clientHeight - tipH - 4);
            if (left > maxL) left = relX - tipW - 12;
            if (top > maxT) top = relY - tipH - 12;
            left = Math.max(4, Math.min(maxL, left));
            top = Math.max(4, Math.min(maxT, top));
            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
        }

        wrap.addEventListener('mouseenter', function (e) {
            var g = e.target.closest && e.target.closest('g[data-ap-il]');
            if (g && wrap.contains(g)) showTip(g.getAttribute('data-ap-il'), e);
        }, true);

        wrap.addEventListener('mousemove', function (e) {
            var g = e.target.closest && e.target.closest('g[data-ap-il]');
            if (!g || !wrap.contains(g)) {
                hideTip();
                return;
            }
            showTip(g.getAttribute('data-ap-il'), e);
        });

        wrap.addEventListener('mouseleave', hideTip);
    }

    function mountTurkeyMap() {
        var mount = $('apMapMount');
        if (!mount) return;
        var agg = haritaAggrege();
        mount.innerHTML = '<div class="ap-map-loading">Harita yükleniyor…</div>';

        loadTurkeySvg().then(function (svgText) {
            if (!$('apMapMount')) return;
            mount.innerHTML = svgText;
            var svg = mount.querySelector('svg');
            if (!svg) {
                mount.innerHTML = hataDurum('Harita SVG okunamadı.');
                return;
            }
            svg.classList.add('ap-map__svg');
            var count = applyTurkeyMapColors(svg, agg);
            mount.setAttribute('data-ap-il-count', String(count));
            mount.classList.add('ap-map-wrap--ready');
            bindTurkeyMapInteractions(mount, agg);
        }).catch(function () {
            if ($('apMapMount')) {
                mount.innerHTML = hataDurum('Türkiye haritası yüklenemedi.');
            }
        });
    }

    function emptyIlDetay() {
        return {
            kullanici: 0,
            firma: 0,
            is: 0,
            teklif: 0,
            onayli_firma: 0,
            bekleyen_firma: 0,
            aktif_kategori: null,
            son_kayit: null
        };
    }

    /** Ham şehir satırlarını plakaya göre birleştir (il ozet RPC) */
    function haritaIlOzetByPlaka() {
        var map = {};
        var rows = asArray(cache.haritaIl && cache.haritaIl.satirlar);
        rows.forEach(function (r) {
            var il = ilBul(r && r.sehir);
            if (!il) return;
            if (!map[il.p]) {
                map[il.p] = emptyIlDetay();
                map[il.p]._katIs = 0;
            }
            var d = map[il.p];
            var isAdet = Number(r.is_adet != null ? r.is_adet : r.is) || 0;
            d.kullanici += Number(r.kullanici) || 0;
            d.firma += Number(r.firma) || 0;
            d.is += isAdet;
            d.teklif += Number(r.teklif) || 0;
            d.onayli_firma += Number(r.onayli_firma) || 0;
            d.bekleyen_firma += Number(r.bekleyen_firma) || 0;
            if (r.aktif_kategori && isAdet >= (d._katIs || 0)) {
                d.aktif_kategori = r.aktif_kategori;
                d._katIs = isAdet;
            }
            if (r.son_kayit) {
                var t = new Date(r.son_kayit).getTime();
                var prev = d.son_kayit ? new Date(d.son_kayit).getTime() : 0;
                if (!prev || t > prev) d.son_kayit = r.son_kayit;
            }
        });
        return map;
    }

    function ilDetayPlaka(plaka) {
        var fromOzet = haritaIlOzetByPlaka()[plaka];
        if (fromOzet) return fromOzet;
        /* RPC yoksa harita dağılımından güvenli düşüş */
        var agg = haritaAggrege();
        var row = agg.byPlaka[plaka];
        var c = row && row.counts ? row.counts : {};
        var d = emptyIlDetay();
        d.kullanici = Number(c.kullanici) || 0;
        d.firma = Number(c.firma) || 0;
        d.is = Number(c.is) || 0;
        return d;
    }

    function renderIlDetayKarti() {
        if (!genelUI.seciliPlaka) {
            return '<aside class="ap-map-detay-card ap-map-detay-card--bos" role="status">' +
                '<p class="ap-muted">Detayları görmek için haritadan bir il seçin</p></aside>';
        }
        var d = ilDetayPlaka(genelUI.seciliPlaka);
        var kat = d.aktif_kategori ? String(d.aktif_kategori) : 'Veri yok';
        var son = d.son_kayit ? tarihKisa(d.son_kayit) : '—';
        function cell(label, value, gold) {
            return '<div class="ap-map-detay-card__cell">' +
                '<dt>' + esc(label) + '</dt>' +
                '<dd' + (gold ? ' class="ap-map-detay-card__val--gold"' : '') + '>' +
                esc(String(value)) + '</dd></div>';
        }
        return '<aside class="ap-map-detay-card" role="status">' +
            '<div class="ap-map-detay-card__ust">' +
            '<h4>' + esc(haritaIlAdi(genelUI.seciliPlaka)) + '</h4>' +
            '<button type="button" class="btn btn--ghost btn--xs" data-ap-il-temizle="1">Kapat</button>' +
            '</div>' +
            '<p class="ap-map-detay-card__aralik">' + esc(haritaAralikEtiket()) + '</p>' +
            '<dl class="ap-map-detay-card__grid">' +
            cell('Kullanıcı', d.kullanici, true) +
            cell('Firma', d.firma, true) +
            cell('İş talebi', d.is, true) +
            cell('Toplam teklif', d.teklif, false) +
            cell('Onaylanan firma', d.onayli_firma, false) +
            cell('Onay bekleyen', d.bekleyen_firma, false) +
            cell('En aktif kategori', kat, false) +
            cell('Son kayıt', son, false) +
            '</dl></aside>';
    }

    function renderHizliIslemler() {
        var btns = [
            ['onaylar', 'Firma Onayları'],
            ['kullanicilar', 'Kullanıcılar'],
            ['isler', 'İş Talepleri'],
            ['sikayetler', 'Şikâyetler'],
            ['islemler', 'İşlem Kayıtları'],
            ['sistem', 'Sistem Durumu']
        ];
        return '<section class="ap-panel ap-hizli">' +
            '<h3 class="ap-panel__baslik">Hızlı İşlemler</h3>' +
            '<div class="ap-hizli__grup">' + btns.map(function (b) {
                return '<button type="button" class="ap-hizli__btn" data-ap-bolum="' + esc(b[0]) + '">' +
                    esc(b[1]) + '</button>';
            }).join('') + '</div></section>';
    }

    function renderEnAktifSehirler() {
        var agg = haritaAggrege();
        var metrik = genelUI.haritaMetrik;
        var metrikEtiket = metrik === 'kullanici' ? 'Kullanıcı' : (metrik === 'is' ? 'İş' : 'Firma');
        var sirali = Object.keys(agg.byPlaka).map(function (p) {
            return agg.byPlaka[p];
        }).filter(function (row) {
            return row.adet > 0;
        }).sort(function (a, b) {
            return b.adet - a.adet;
        }).slice(0, 5);

        var icerik = sirali.length
            ? '<ol class="ap-rank">' + sirali.map(function (row, i) {
                return '<li class="ap-rank__item">' +
                    '<button type="button" class="ap-rank__btn" data-ap-il="' + esc(row.il.p) + '">' +
                    '<span class="ap-rank__no">' + esc(String(i + 1)) + '</span>' +
                    '<span class="ap-rank__ad">' + esc(row.il.ad) + '</span>' +
                    '<span class="ap-rank__adet">' + esc(String(row.adet)) + ' ' + esc(metrikEtiket) + '</span>' +
                    '</button></li>';
            }).join('') + '</ol>'
            : bosDurum('Bu metrikte veri olan şehir yok.');

        return '<div class="ap-panel ap-panel--compact">' +
            '<h4 class="ap-panel__baslik">En Aktif Şehirler</h4>' +
            '<p class="ap-muted">' + esc(haritaAralikEtiket()) + ' · ' + esc(metrikEtiket) + '</p>' +
            icerik + '</div>';
    }

    function renderBolgeselDagilim() {
        var agg = haritaAggrege();
        var bolgeTop = {};
        var total = 0;
        TR_BOLGE_SIRASI.forEach(function (b) { bolgeTop[b] = 0; });

        Object.keys(agg.byPlaka).forEach(function (p) {
            var adet = agg.byPlaka[p].adet || 0;
            if (!adet) return;
            var bolge = TR_IL_BOLGE[p] || 'Diğer';
            if (!bolgeTop[bolge]) bolgeTop[bolge] = 0;
            bolgeTop[bolge] += adet;
            total += adet;
        });

        if (!total) {
            return '<div class="ap-panel ap-panel--compact">' +
                '<h4 class="ap-panel__baslik">Bölgesel Dağılım</h4>' +
                bosDurum('Dağılım için yeterli veri yok.') + '</div>';
        }

        var raw = TR_BOLGE_SIRASI.map(function (b) {
            return { bolge: b, adet: bolgeTop[b] || 0 };
        });
        var pctler = raw.map(function (r) {
            return total > 0 ? (r.adet / total) * 100 : 0;
        });
        var floored = pctler.map(function (p) { return Math.floor(p); });
        var kalan = 100 - floored.reduce(function (a, b) { return a + b; }, 0);
        var fracs = pctler.map(function (p, i) {
            return { i: i, frac: p - floored[i] };
        }).sort(function (a, b) { return b.frac - a.frac; });
        for (var k = 0; k < kalan; k++) {
            floored[fracs[k % fracs.length].i] += 1;
        }

        var satirlar = raw.map(function (r, i) {
            var pct = floored[i];
            return '<div class="ap-bolge__satir">' +
                '<div class="ap-bolge__ust">' +
                '<span class="ap-bolge__ad">' + esc(r.bolge) + '</span>' +
                '<span class="ap-bolge__sayi">' + esc(String(r.adet)) + ' · %' + esc(String(pct)) + '</span>' +
                '</div>' +
                '<div class="ap-bolge__bar" role="presentation">' +
                '<div class="ap-bolge__fill" style="width:' + pct + '%"></div>' +
                '</div></div>';
        }).join('');

        return '<div class="ap-panel ap-panel--compact">' +
            '<h4 class="ap-panel__baslik">Bölgesel Dağılım</h4>' +
            '<div class="ap-bolge">' + satirlar + '</div></div>';
    }

    function renderPlatformSagligiOzeti() {
        var d = cache.sistem;
        if (!d) {
            return '<section class="ap-panel ap-saglik-ozet">' +
                '<h3 class="ap-panel__baslik">Platform Sağlığı</h3>' +
                bosDurum('Sistem durumu yüklenemedi.') + '</section>';
        }
        var kalemler = [
            ['Supabase', d.supabase],
            ['Oturum', d.oturum],
            ['Storage', d.storage],
            ['Realtime', d.realtime],
            ['Piyasa', d.piyasa]
        ];
        var kartlar = kalemler.map(function (k) {
            var obj = k[1] || {};
            return '<div class="ap-saglik-ozet__kart">' +
                '<span class="ap-saglik-ozet__ad">' + esc(k[0]) + '</span>' +
                sistemEtiket(obj.durum) +
                '<span class="ap-saglik-ozet__detay">' + esc(obj.detay || '—') + '</span></div>';
        }).join('');
        return '<section class="ap-panel ap-saglik-ozet">' +
            '<h3 class="ap-panel__baslik">Platform Sağlığı</h3>' +
            '<div class="ap-saglik-ozet__grid">' + kartlar + '</div></section>';
    }

    function renderSonAktiviteler() {
        var rows = asArray(cache.aktiviteler);
        var tablo = rows.length
            ? '<div class="ap-tablo-wrap ap-aktivite"><table class="ap-tablo ap-tablo--compact">' +
            '<thead><tr><th>İşlem</th><th>İlgili</th><th>Tarih</th><th>Admin</th></tr></thead><tbody>' +
            rows.map(function (r) {
                return '<tr>' +
                    '<td>' + esc(r.islem || '—') + '</td>' +
                    '<td>' + esc(r.ilgili || '—') + '</td>' +
                    '<td>' + esc(tarihTR(r.ts)) + '</td>' +
                    '<td>' + esc(r.admin_ad || '—') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
            : bosDurum('Henüz aktivite yok.');
        return '<section class="ap-panel ap-aktivite-panel">' +
            '<h3 class="ap-panel__baslik">Son Aktiviteler</h3>' + tablo + '</section>';
    }

    function renderHaritaBolum() {
        var agg = haritaAggrege();
        var metrik = genelUI.haritaMetrik;
        var metrikEtiket = metrik === 'kullanici' ? 'Kullanıcılar' : (metrik === 'is' ? 'İş Talepleri' : 'Firmalar');
        var toplamEslesen = 0;
        var doluIl = 0;
        Object.keys(agg.byPlaka).forEach(function (p) {
            if (agg.byPlaka[p].adet > 0) {
                toplamEslesen += agg.byPlaka[p].adet;
                doluIl += 1;
            }
        });

        var ozetKartlar =
            '<div class="ap-map-ozet">' +
            '<div class="ap-kpi"><span class="ap-kpi__etiket">Eşleşen kayıt</span><span class="ap-kpi__deger">' +
            esc(String(toplamEslesen)) + '</span></div>' +
            '<div class="ap-kpi"><span class="ap-kpi__etiket">Veri olan il</span><span class="ap-kpi__deger">' +
            esc(String(doluIl)) + ' / 81</span></div>' +
            '<div class="ap-kpi"><span class="ap-kpi__etiket">Eşleşmeyen</span><span class="ap-kpi__deger">' +
            esc(String(agg.eslesmeyenAdet)) + '</span></div>' +
            '<div class="ap-kpi"><span class="ap-kpi__etiket">Metrik</span><span class="ap-kpi__deger ap-kpi__deger--sm">' +
            esc(metrikEtiket) + '</span></div>' +
            '</div>';

        var detay = renderIlDetayKarti();

        var eslesmeyenHtml = '';
        if (agg.eslesmeyen.length) {
            eslesmeyenHtml = '<div class="ap-map-eslesmeyen"><h4>Eşleşmeyen kayıtlar</h4><ul>' +
                agg.eslesmeyen.map(function (e) {
                    return '<li>' + esc(e.sehir) + ' <span>(' + esc(String(e.adet)) + ')</span></li>';
                }).join('') + '</ul><p class="ap-muted">Bu kayıtlar yanlış bir ile bağlanmadı.</p></div>';
        }

        var haritaHata = cache.harita && cache.harita.__error
            ? hataDurum(cache.harita.__error)
            : '';

        return '<section class="ap-panel ap-panel--map">' +
            '<div class="ap-panel__baslik-satir">' +
            '<h3 class="ap-panel__baslik">Türkiye Haritası</h3>' +
            '<div class="ap-seg" role="group" aria-label="Harita metriği">' +
            '<button type="button" class="ap-seg__btn' + (metrik === 'kullanici' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-harita-metrik="kullanici">Kullanıcılar</button>' +
            '<button type="button" class="ap-seg__btn' + (metrik === 'firma' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-harita-metrik="firma">Firmalar</button>' +
            '<button type="button" class="ap-seg__btn' + (metrik === 'is' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-harita-metrik="is">İş Talepleri</button>' +
            '</div>' +
            '<div class="ap-seg" role="group" aria-label="Zaman aralığı">' +
            '<button type="button" class="ap-seg__btn' + (genelUI.haritaAralik === '7g' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-harita-aralik="7g">Son 7 gün</button>' +
            '<button type="button" class="ap-seg__btn' + (genelUI.haritaAralik === '30g' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-harita-aralik="30g">Son 30 gün</button>' +
            '<button type="button" class="ap-seg__btn' + (genelUI.haritaAralik === 'tum' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-harita-aralik="tum">Tüm zamanlar</button>' +
            '</div></div>' +
            haritaHata +
            '<div class="ap-map-layout">' +
            '<div class="ap-map-wrap" id="apMapMount"></div>' +
            detay +
            '</div>' +
            ozetKartlar + eslesmeyenHtml +
            '<div class="ap-map-alt-grid">' +
            renderEnAktifSehirler() +
            renderBolgeselDagilim() +
            '</div>' +
            '</section>';
    }

    function renderFinansBolum() {
        var kalemler = [
            ['Toplam gelir', 0],
            ['Bu ayki gelir', 0],
            ['Bugünkü gelir', 0],
            ['Bekleyen ödeme', 0],
            ['Platform komisyonu', 0],
            ['Premium üyelik geliri', 0],
            ['Reklam geliri', 0],
            ['İade edilen tutar', 0]
        ];
        var grid = kalemler.map(function (k) {
            return '<div class="ap-kpi">' +
                '<span class="ap-kpi__etiket">' + esc(k[0]) + '</span>' +
                '<span class="ap-kpi__deger">' + esc(paraTR(k[1])) + '</span></div>';
        }).join('');
        return '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Finansal Özet</h3>' +
            '<div class="ap-kpi-grid ap-kpi-grid--finans">' + grid + '</div>' +
            '<p class="ap-finans-bos" role="status">Henüz aktif ücretli işlem bulunmuyor.</p>' +
            '</section>';
    }

    function svgBarChart(items, valueKey, labelKey) {
        var rows = asArray(items).filter(function (r) {
            return (Number(r[valueKey]) || 0) > 0;
        });
        if (!rows.length) {
            return bosDurum('Bu aralıkta grafik için kayıt yok.');
        }
        var max = 0;
        rows.forEach(function (r) {
            var v = Number(r[valueKey]) || 0;
            if (v > max) max = v;
        });
        var w = 560;
        var barH = 18;
        var gap = 8;
        var h = rows.length * (barH + gap) + 8;
        var bars = rows.map(function (r, i) {
            var v = Number(r[valueKey]) || 0;
            var bw = max > 0 ? Math.max(2, (v / max) * (w - 160)) : 0;
            var y = 4 + i * (barH + gap);
            var label = String(r[labelKey] == null ? '—' : r[labelKey]);
            return '<text x="0" y="' + (y + 13) + '" class="ap-chart__label">' + esc(label) + '</text>' +
                '<rect x="150" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + barH +
                '" rx="3" class="ap-chart__bar"/>' +
                '<text x="' + (156 + bw) + '" y="' + (y + 13) + '" class="ap-chart__val">' + esc(String(v)) + '</text>';
        }).join('');
        return '<svg class="ap-chart__svg" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + bars + '</svg>';
    }

    function svgLineChart(gunluk) {
        var rows = asArray(gunluk);
        var has = rows.some(function (r) {
            return (Number(r.kullanici) || 0) + (Number(r.firma) || 0) + (Number(r.is) || 0) > 0;
        });
        if (!has) return bosDurum('Bu aralıkta günlük hareket yok.');

        var w = 640;
        var h = 180;
        var pad = { l: 28, r: 12, t: 12, b: 28 };
        var max = 1;
        rows.forEach(function (r) {
            ['kullanici', 'firma', 'is'].forEach(function (k) {
                var v = Number(r[k]) || 0;
                if (v > max) max = v;
            });
        });
        function pt(i, val) {
            var x = pad.l + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * (w - pad.l - pad.r));
            var y = pad.t + (1 - (Number(val) || 0) / max) * (h - pad.t - pad.b);
            return x.toFixed(1) + ',' + y.toFixed(1);
        }
        function poly(key) {
            return rows.map(function (r, i) { return pt(i, r[key]); }).join(' ');
        }
        return '<svg class="ap-chart__svg ap-chart__svg--line" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
            '<polyline class="ap-chart__line ap-chart__line--a" fill="none" points="' + poly('kullanici') + '"/>' +
            '<polyline class="ap-chart__line ap-chart__line--b" fill="none" points="' + poly('firma') + '"/>' +
            '<polyline class="ap-chart__line ap-chart__line--c" fill="none" points="' + poly('is') + '"/>' +
            '</svg>' +
            '<div class="ap-chart__legend">' +
            '<span><i class="ap-dot ap-dot--a"></i>Kullanıcı</span>' +
            '<span><i class="ap-dot ap-dot--b"></i>Firma</span>' +
            '<span><i class="ap-dot ap-dot--c"></i>İş</span></div>';
    }

    function renderAnalitikBolum() {
        var a = cache.analitik || {};
        if (a.__error) {
            return '<section class="ap-panel"><h3 class="ap-panel__baslik">Analitik</h3>' +
                hataDurum(a.__error) + '</section>';
        }
        return '<section class="ap-panel">' +
            '<div class="ap-panel__baslik-satir">' +
            '<h3 class="ap-panel__baslik">Analitik Grafikler</h3>' +
            '<div class="ap-seg" role="group" aria-label="Analitik aralığı">' +
            '<button type="button" class="ap-seg__btn' + (genelUI.analitikAralik === '7g' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-analitik-aralik="7g">7 gün</button>' +
            '<button type="button" class="ap-seg__btn' + (genelUI.analitikAralik === '30g' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-analitik-aralik="30g">30 gün</button>' +
            '<button type="button" class="ap-seg__btn' + (genelUI.analitikAralik === 'tum' ? ' ap-seg__btn--aktif' : '') +
            '" data-ap-analitik-aralik="tum">1 yıl</button>' +
            '</div></div>' +
            '<div class="ap-chart-grid">' +
            '<div class="ap-chart"><h4>Günlük kayıt trendi</h4>' + svgLineChart(a.gunluk) + '</div>' +
            '<div class="ap-chart"><h4>İş kategorileri</h4>' + svgBarChart(a.kategori_is, 'adet', 'kategori') + '</div>' +
            '<div class="ap-chart"><h4>Firma durum dağılımı</h4>' + svgBarChart(a.firma_durum, 'adet', 'durum') + '</div>' +
            '</div></section>';
    }

    function renderPlatformKpi(o) {
        var kartlar = [
            ['Toplam kullanıcı', o.toplam_kullanici, o.kullanici_7g, o.kullanici_onceki_7g],
            ['Toplam firma', o.toplam_firma, o.firma_7g, o.firma_onceki_7g],
            ['Onay bekleyen firma', o.bekleyen_firma, null, null],
            ['Onaylanan firma', o.onayli_firma, null, null],
            ['Açık iş talebi', o.acik_is, null, null],
            ['Toplam teklif', o.toplam_teklif, o.teklif_7g, o.teklif_onceki_7g],
            ['Son 7 günde kullanıcı', o.kullanici_7g, null, null],
            ['Son 7 günde iş', o.is_7g, o.is_7g, o.is_onceki_7g]
        ];
        return '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Platform KPI</h3>' +
            '<div class="ap-kpi-grid">' + kartlar.map(function (k) {
                var trend = (k[2] != null && k[3] != null) ? kpiTrendHtml(k[2], k[3]) : '';
                return '<div class="ap-kpi">' +
                    '<span class="ap-kpi__etiket">' + esc(k[0]) + '</span>' +
                    '<span class="ap-kpi__deger">' + esc(String(k[1] != null ? k[1] : '—')) + '</span>' +
                    trend + '</div>';
            }).join('') + '</div></section>';
    }

    function listeBosMesaji(tip, o, satirVar) {
        if (satirVar) return null;
        if (tip === 'kullanici') {
            if ((Number(o.toplam_kullanici) || 0) > 0) {
                return 'Kullanıcı kayıtları var ancak liste yüklenemedi. Kullanıcılar sekmesini kontrol edin.';
            }
            return 'Henüz kullanıcı kaydı yok.';
        }
        if (tip === 'bekleyen') {
            if ((Number(o.bekleyen_firma) || 0) > 0) {
                return 'Onay bekleyen firma var ancak liste yüklenemedi. Firma Onayları sekmesine gidin.';
            }
            return 'Onay bekleyen firma yok.';
        }
        if (tip === 'is') {
            if ((Number(o.acik_is) || 0) > 0 || (Number(o.is_7g) || 0) > 0) {
                return 'İş talepleri var ancak liste yüklenemedi. İş Talepleri sekmesini kontrol edin.';
            }
            return 'Henüz iş talebi yok.';
        }
        return 'Kayıt yok.';
    }

    function normalizeSonData(raw) {
        var son = raw || {};
        if (typeof son === 'string') {
            try { son = JSON.parse(son); } catch (e) { son = {}; }
        }
        return {
            kullanicilar: asArray(son.kullanicilar),
            bekleyen_firmalar: asArray(son.bekleyen_firmalar),
            isler: asArray(son.isler)
        };
    }

    function yukleGenel() {
        var s = svc();
        if (!s) {
            $('apIcerik').innerHTML = hataDurum('Admin servisi yüklenemedi.');
            return;
        }
        setBolumLoading('genel', true);
        var pOzet = s.ozet();
        var pSon = s.sonKayitlar();
        var pHarita = typeof s.haritaDagilim === 'function'
            ? s.haritaDagilim(genelUI.haritaAralik)
            : Promise.resolve({ ok: false, error: 'Harita API yok (019).' });
        var pHaritaIl = typeof s.haritaIlOzet === 'function'
            ? s.haritaIlOzet(genelUI.haritaAralik)
            : Promise.resolve({ ok: false, error: 'İl özet API yok (020).' });
        var pAnalitik = typeof s.analitikOzet === 'function'
            ? s.analitikOzet(genelUI.analitikAralik)
            : Promise.resolve({ ok: false, error: 'Analitik API yok (019).' });
        var pAktiviteler = typeof s.aktiviteler === 'function'
            ? s.aktiviteler(40)
            : Promise.resolve({ ok: false, data: [] });
        var pSistem = typeof s.sistemDurumu === 'function'
            ? s.sistemDurumu()
            : Promise.resolve({ ok: false, data: null });

        Promise.all([pOzet, pSon, pHarita, pHaritaIl, pAnalitik, pAktiviteler, pSistem]).then(function (arr) {
            var ozet = arr[0];
            var son = arr[1];
            var harita = arr[2];
            var haritaIl = arr[3];
            var analitik = arr[4];
            var aktivite = arr[5];
            var sistem = arr[6];

            function bitir() {
                setBolumLoading('genel', false);
                if (aktifBolum !== 'genel') return;
                if (!ozet.ok) {
                    $('apIcerik').innerHTML = hataDurum(ozet.error);
                    return;
                }
                cache.ozet = ozet.data || {};
                renderGenel();
            }

            cache.harita = harita.ok ? (harita.data || {}) : { __error: harita.error || 'Harita yüklenemedi.' };
            cache.haritaIl = haritaIl.ok ? (haritaIl.data || {}) : null;
            cache.analitik = analitik.ok ? (analitik.data || {}) : { __error: analitik.error || 'Analitik yüklenemedi.' };
            cache.son = normalizeSonData(son.ok ? son.data : {});
            cache.aktiviteler = aktivite.ok ? asArray(aktivite.data) : [];
            cache.sistem = sistem.ok ? (sistem.data || {}) : null;

            var o = ozet.ok ? (ozet.data || {}) : {};
            var needKul = !cache.son.kullanicilar.length && (Number(o.toplam_kullanici) || 0) > 0;
            var needBek = !cache.son.bekleyen_firmalar.length && (Number(o.bekleyen_firma) || 0) > 0;
            var fallbacks = [];

            if (needKul && typeof s.kullaniciListesi === 'function') {
                fallbacks.push(s.kullaniciListesi().then(function (res) {
                    if (res.ok) {
                        cache.son.kullanicilar = asArray(res.data).slice(0, 8).map(function (u) {
                            return {
                                id: u.id,
                                ad_soyad: u.ad_soyad,
                                email: u.email,
                                hesap_tipi: u.hesap_tipi,
                                created_at: u.created_at
                            };
                        });
                    }
                }));
            }
            if (needBek && typeof s.firmaListesi === 'function') {
                fallbacks.push(s.firmaListesi('beklemede').then(function (res) {
                    if (res.ok) {
                        cache.son.bekleyen_firmalar = asArray(res.data).slice(0, 8).map(function (f) {
                            return {
                                id: f.id,
                                firma_adi: f.firma_adi,
                                sehir: f.sehir,
                                kategori: f.kategori,
                                created_at: f.created_at,
                                yetkili_ad: f.yetkili_ad
                            };
                        });
                    }
                }));
            }

            if (fallbacks.length) {
                Promise.all(fallbacks).then(bitir).catch(bitir);
            } else {
                bitir();
            }
        });
    }

    function yukleHaritaSadece() {
        var s = svc();
        if (!s || typeof s.haritaDagilim !== 'function') return;
        var p1 = s.haritaDagilim(genelUI.haritaAralik);
        var p2 = typeof s.haritaIlOzet === 'function'
            ? s.haritaIlOzet(genelUI.haritaAralik)
            : Promise.resolve({ ok: false });
        Promise.all([p1, p2]).then(function (arr) {
            if (aktifBolum !== 'genel') return;
            cache.harita = arr[0].ok ? (arr[0].data || {}) : { __error: arr[0].error || 'Harita yüklenemedi.' };
            cache.haritaIl = arr[1].ok ? (arr[1].data || {}) : null;
            renderGenel();
        });
    }

    function yukleAnalitikSadece() {
        var s = svc();
        if (!s || typeof s.analitikOzet !== 'function') return;
        s.analitikOzet(genelUI.analitikAralik).then(function (res) {
            if (aktifBolum !== 'genel') return;
            cache.analitik = res.ok ? (res.data || {}) : { __error: res.error || 'Analitik yüklenemedi.' };
            renderGenel();
        });
    }

    function renderGenel() {
        var o = cache.ozet || {};
        var son = normalizeSonData(cache.son);

        var kullanicilar = son.kullanicilar.map(function (u) {
            return '<tr>' +
                '<td>' + esc(u.ad_soyad || '—') + '</td>' +
                '<td>' + esc(u.email || '—') + '</td>' +
                '<td>' + esc(u.hesap_tipi || 'normal') + '</td>' +
                '<td>' + esc(tarihKisa(u.created_at)) + '</td></tr>';
        }).join('');

        var bekleyen = son.bekleyen_firmalar.map(function (f) {
            return '<tr>' +
                '<td>' + esc(f.firma_adi || '—') + '</td>' +
                '<td>' + esc(f.yetkili_ad || '—') + '</td>' +
                '<td>' + esc(f.sehir || '—') + '</td>' +
                '<td>' + esc(f.kategori || '—') + '</td>' +
                '<td>' + esc(tarihKisa(f.created_at)) + '</td>' +
                '<td><button type="button" class="btn btn--ghost btn--xs" data-ap-goto-onay="' +
                esc(f.id) + '">İncele</button></td></tr>';
        }).join('');

        var isler = son.isler.map(function (i) {
            return '<tr>' +
                '<td>' + esc(i.baslik || '—') + '</td>' +
                '<td>' + esc(i.kategori || '—') + '</td>' +
                '<td>' + esc(i.olusturan_ad || '—') + '</td>' +
                '<td>' + esc(tarihKisa(i.created_at)) + '</td>' +
                '<td>' + durumRozet(i.durum) + '</td></tr>';
        }).join('');

        var kulBos = listeBosMesaji('kullanici', o, !!kullanicilar);
        var bekBos = listeBosMesaji('bekleyen', o, !!bekleyen);
        var isBos = listeBosMesaji('is', o, !!isler);

        var listeler =
            '<div class="ap-paneller ap-paneller--alt">' +
            '<h3 class="ap-alt-baslik">Mevcut Dashboard</h3>' +
            '<div class="ap-kpi-grid">' +
            [
                ['Toplam kullanıcı', o.toplam_kullanici],
                ['Toplam firma', o.toplam_firma],
                ['Onay bekleyen firma', o.bekleyen_firma],
                ['Onaylanan firma', o.onayli_firma],
                ['Açık iş talebi', o.acik_is],
                ['Toplam teklif', o.toplam_teklif],
                ['Son 7 günde kullanıcı', o.kullanici_7g],
                ['Son 7 günde iş', o.is_7g]
            ].map(function (k) {
                return '<div class="ap-kpi">' +
                    '<span class="ap-kpi__etiket">' + esc(k[0]) + '</span>' +
                    '<span class="ap-kpi__deger">' + esc(String(k[1] != null ? k[1] : '—')) + '</span></div>';
            }).join('') + '</div>' +
            '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Son kayıt olan kullanıcılar</h3>' +
            (kullanicilar
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Ad soyad</th><th>E-posta</th><th>Hesap tipi</th><th>Kayıt</th></tr></thead>' +
                '<tbody>' + kullanicilar + '</tbody></table></div>'
                : bosDurum(kulBos)) +
            '</section>' +
            '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Onay bekleyen firmalar</h3>' +
            (bekleyen
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Firma</th><th>Yetkili</th><th>Şehir</th><th>Hizmet</th><th>Başvuru</th><th></th></tr></thead>' +
                '<tbody>' + bekleyen + '</tbody></table></div>'
                : bosDurum(bekBos)) +
            '</section>' +
            '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Son açılan işler</h3>' +
            (isler
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Başlık</th><th>Kategori</th><th>Oluşturan</th><th>Tarih</th><th>Durum</th></tr></thead>' +
                '<tbody>' + isler + '</tbody></table></div>'
                : bosDurum(isBos)) +
            '</section></div>';

        $('apIcerik').innerHTML =
            '<div class="ap-genel">' +
            renderHizliIslemler() +
            renderPlatformKpi(o) +
            renderHaritaBolum() +
            '<div class="ap-genel-ikili">' +
            renderPlatformSagligiOzeti() +
            renderSonAktiviteler() +
            '</div>' +
            renderFinansBolum() +
            renderAnalitikBolum() +
            listeler +
            '</div>';
        mountTurkeyMap();
    }

    /* ---------- Firma onayları ---------- */
    var dogrulamaFiltre = 'hepsi';
    var dogrulamaDetayId = null;

    function yukleDogrulama() {
        var s = svc();
        if (!s || typeof s.dogrulamaListesi !== 'function') {
            $('apIcerik').innerHTML = hataDurum('Doğrulama API’si yok. Migration 025 uygulayın.');
            return;
        }
        setBolumLoading('dogrulama', true);
        if (dogrulamaDetayId) {
            s.dogrulamaDetay(dogrulamaDetayId).then(function (res) {
                setBolumLoading('dogrulama', false);
                if (aktifBolum !== 'dogrulama') return;
                if (!res.ok) {
                    $('apIcerik').innerHTML = hataDurum(res.error);
                    return;
                }
                renderDogrulamaDetay(res.data || {});
            });
            return;
        }
        s.dogrulamaListesi(dogrulamaFiltre).then(function (res) {
            setBolumLoading('dogrulama', false);
            if (aktifBolum !== 'dogrulama') return;
            if (!res.ok) {
                $('apIcerik').innerHTML = hataDurum(res.error);
                return;
            }
            renderDogrulamaListe(Array.isArray(res.data) ? res.data : []);
        });
    }

    function renderDogrulamaListe(rows) {
        var FD = window.AurixFirmaDogrulama || {};
        var sekmeler = [
            ['hepsi', 'Tümü'],
            ['incelemede', 'İncelemede'],
            ['ek_belge_gerekli', 'Ek belge'],
            ['dogrulandi', 'Doğrulandı'],
            ['reddedildi', 'Red'],
            ['askiya_alindi', 'Askı']
        ];
        var tabHtml = sekmeler.map(function (t) {
            return '<button type="button" class="ap-sekme' +
                (dogrulamaFiltre === t[0] ? ' ap-sekme--aktif' : '') +
                '" data-ap-fd-filtre="' + t[0] + '">' + esc(t[1]) + '</button>';
        }).join('');
        var satirlar = rows.map(function (r) {
            var durumAd = FD.durumEtiket ? FD.durumEtiket(r.durum) : r.durum;
            return '<tr class="ap-satir-masa">' +
                '<td>' + esc(r.firma_adi || '—') + '</td>' +
                '<td>' + esc(r.sehir || '—') + '</td>' +
                '<td>' + esc(durumAd) + '</td>' +
                '<td>' + esc(String(r.risk_skoru != null ? r.risk_skoru : '—')) + '</td>' +
                '<td><button type="button" class="btn btn--ghost btn--xs" data-ap-fd-detay="' +
                esc(r.id) + '">İncele</button></td></tr>';
        }).join('');
        $('apIcerik').innerHTML =
            '<p class="panel-not">Yayın onayı (Firma Onayları) ile güven doğrulama ayrıdır. Rozet yalnızca burada verilir.</p>' +
            '<div class="ap-sekmeler">' + tabHtml + '</div>' +
            (rows.length
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Firma</th><th>Şehir</th><th>Durum</th><th>Risk</th><th></th></tr></thead><tbody>' +
                satirlar + '</tbody></table></div>'
                : bosDurum('Bu filtrede başvuru yok.'));
    }

    function renderDogrulamaDetay(data) {
        var FD = window.AurixFirmaDogrulama || {};
        var b = data.basvuru || {};
        var f = data.firma || {};
        var belgeler = data.belgeler || [];
        var riskler = data.riskler || [];
        var loglar = data.loglar || [];
        var gerekOpts = (FD.GEREKCE_HAZIR || []).map(function (g) {
            return '<option value="' + esc(g.id) + '">' + esc(g.ad) + '</option>';
        }).join('');
        var belgeHtml = belgeler.map(function (d) {
            return '<li><strong>' + esc(d.belge_turu) + '</strong> · ' + esc(d.mime_type || '') +
                ' · ' + esc(d.admin_durum || '') +
                ' <button type="button" class="btn btn--ghost btn--xs" data-ap-fd-belge="' +
                esc(d.id) + '">Signed URL</button></li>';
        }).join('') || '<li>Belge yok</li>';
        var riskHtml = riskler.map(function (r) {
            return '<li class="ap-risk ap-risk--' + esc(r.seviye || 'orta') + '">' +
                esc(r.seviye) + ': ' + esc(r.mesaj) + '</li>';
        }).join('') || '<li>Otomatik risk yok</li>';
        var logHtml = loglar.slice(0, 12).map(function (l) {
            return '<li>' + esc(String(l.created_at || '').slice(0, 19)) + ' · ' +
                esc(l.islem) + ' · ' + esc(l.eski_durum || '') + ' → ' + esc(l.yeni_durum || '') +
                (l.gerekce ? ' — ' + esc(l.gerekce) : '') + '</li>';
        }).join('') || '<li>Log yok</li>';

        var gibOpts = (FD.GIB_KARARLAR || []).map(function (g) {
            return '<option value="' + esc(g.id) + '">' + esc(g.ad) + '</option>';
        }).join('');
        var vergiEtiket = FD.vergiDurumEtiket
            ? FD.vergiDurumEtiket(f.vergi_kimlik_durumu || b.vergi_format_durumu)
            : (f.vergi_kimlik_durumu || '—');

        $('apIcerik').innerHTML =
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-geri>← Listeye dön</button>' +
            '<h3 style="margin:12px 0 8px">' + esc(f.firma_adi || 'Firma') + '</h3>' +
            '<dl class="ap-dl">' +
            '<div><dt>Başvuru durumu</dt><dd>' + esc(FD.durumEtiket ? FD.durumEtiket(b.durum) : b.durum) + '</dd></div>' +
            '<div><dt>Güven rozeti</dt><dd>' + esc(f.guven_dogrulama_durumu || '—') + '</dd></div>' +
            '<div><dt>Vergi kimlik durumu</dt><dd>' + esc(vergiEtiket) + '</dd></div>' +
            '<div><dt>Hukuki unvan</dt><dd>' + esc(b.hukuki_unvan || f.hukuki_unvan || '—') + '</dd></div>' +
            '<div><dt>VKN / TCKN</dt><dd>' + esc(b.vergi_no || f.vergi_no || '—') + '</dd></div>' +
            '<div><dt>Vergi dairesi</dt><dd>' + esc(b.vergi_dairesi || f.vergi_dairesi || '—') + '</dd></div>' +
            '<div><dt>Belge işlem/doğrulama kodu</dt><dd>' + esc(b.vergi_levha_islem_kodu || f.vergi_levha_islem_kodu || '—') + '</dd></div>' +
            '<div><dt>İşletme türü</dt><dd>' + esc(b.isletme_turu || f.isletme_turu || '—') + '</dd></div>' +
            '<div><dt>MERSİS</dt><dd>' + esc(b.mersis_no || f.mersis_no || '—') + '</dd></div>' +
            '<div><dt>Sicil no</dt><dd>' + esc(b.sicil_no || f.sicil_no || '—') + '</dd></div>' +
            '<div><dt>Başvuran sıfatı</dt><dd>' + esc(b.basvuran_sifati || f.basvuran_sifati || '—') + '</dd></div>' +
            '<div><dt>Yetkili</dt><dd>' + esc(f.yetkili_ad || '—') + '</dd></div>' +
            '<div><dt>İl / İlçe</dt><dd>' + esc([f.ilce, f.sehir].filter(Boolean).join(', ') || '—') + '</dd></div>' +
            '<div><dt>Risk skoru</dt><dd>' + esc(String(b.risk_skoru != null ? b.risk_skoru : '—')) + '</dd></div>' +
            '<div><dt>Yayın (ayrı eksen)</dt><dd>' + esc(f.durum) + ' / ' + esc(f.yayin_durumu) +
            ' / dogrulanmis=' + esc(String(f.dogrulanmis)) + '</dd></div>' +
            '<div><dt>GİB kontrol</dt><dd>' +
            (b.gib_kontrol_edildi ? 'Evet · ' + esc(String(b.gib_kontrol_tarihi || '').slice(0, 19)) : 'Hayır') +
            (b.gib_karar ? ' · ' + esc(b.gib_karar) : '') + '</dd></div>' +
            '</dl>' +
            '<h4>Karşılaştırma checklist</h4>' +
            '<ul class="ap-check-list">' +
            '<li>Profil firma adı ↔ vergi levhası unvanı</li>' +
            '<li>Girilen VKN/TCKN ↔ belgedeki numara</li>' +
            '<li>Vergi dairesi ↔ belgedeki vergi dairesi</li>' +
            '<li>Şehir ↔ belge/adres</li>' +
            '<li>Firma türü ↔ hukuki statü</li>' +
            '<li>MERSİS/sicil ↔ ilgili belge</li>' +
            '<li>Başvuran kişi ↔ sahip/ortak/yetkili belgesi</li>' +
            '</ul>' +
            '<h4>Risk uyarıları (otomatik red değil)</h4><ul>' + riskHtml + '</ul>' +
            '<h4>Belgeler (signed URL)</h4><ul>' + belgeHtml + '</ul>' +
            '<h4>GİB üzerinden manuel kontrol</h4>' +
            '<p class="panel-not">Scrape/CAPTCHA/e-Devlet şifresi yok. Resmî sayfada kontrol edip sonucu kaydedin.</p>' +
            '<label class="fp-check"><input type="checkbox" id="apFdGibKontrol" checked> GİB üzerinden kontrol edildi</label>' +
            '<div class="form-grup"><label class="form-label">GİB karar</label>' +
            '<select class="form-select" id="apFdGibKarar"><option value="">Seçin</option>' + gibOpts + '</select></div>' +
            '<div class="form-grup"><label class="form-label">Eşleşen bilgiler</label>' +
            '<textarea class="form-textarea" id="apFdEslesen" rows="2" placeholder="unvan, vkn, vergi dairesi…"></textarea></div>' +
            '<div class="form-grup"><label class="form-label">Uyuşmayan bilgiler</label>' +
            '<textarea class="form-textarea" id="apFdUyusmayan" rows="2"></textarea></div>' +
            '<div class="form-grup"><label class="form-label">GİB gerekçesi (zorunlu)</label>' +
            '<textarea class="form-textarea" id="apFdGibGerekce" rows="2"></textarea></div>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-gib>GİB kontrol sonucunu kaydet</button>' +
            '<h4 style="margin-top:16px">Eşleşme işaretleri (rozet önkoşulu)</h4>' +
            '<label class="fp-check"><input type="checkbox" id="apFdOdaEslesti"' +
            (b.oda_sicil_eslesti ? ' checked' : '') + '> Oda/sicil kaydı eşleşti</label>' +
            '<label class="fp-check"><input type="checkbox" id="apFdSahiplikEslesti"' +
            (b.sahiplik_eslesti ? ' checked' : '') + '> Sahiplik/yetki doğrulandı</label>' +
            '<label class="fp-check"><input type="checkbox" id="apFdTelTeyit"' +
            (f.telefon_admin_teyit ? ' checked' : '') + '> Telefon admince teyit edildi</label>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-eslesme>Eşleşmeleri kaydet</button>' +
            '<h4 style="margin-top:16px">Rozet kararı</h4>' +
            '<div class="form-grup"><label class="form-label">Hazır gerekçe</label>' +
            '<select class="form-select" id="apFdGerekceKod"><option value="">Seçin</option>' + gerekOpts + '</select></div>' +
            '<div class="form-grup"><label class="form-label">Gerekçe (zorunlu)</label>' +
            '<textarea class="form-textarea" id="apFdGerekce" rows="3" required></textarea></div>' +
            '<div class="form-grup"><label class="form-label">İç admin notu (kullanıcı görmez)</label>' +
            '<textarea class="form-textarea" id="apFdIcNot" rows="2"></textarea></div>' +
            '<div class="form-grup"><label class="form-label">Yenileme süresi (ay)</label>' +
            '<input class="form-input" type="number" id="apFdYenileme" min="1" max="36" value="12"></div>' +
            '<p class="fp-aksiyon-satir fp-aksiyon-satir--cift">' +
            '<button type="button" class="btn btn--primary btn--sm" data-ap-fd-karar="dogrula">Doğrula (rozet)</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-karar="ek_belge">Ek belge iste</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-karar="reddet">Reddet</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-karar="askiya_al">Askıya al</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-karar="dogrulamayi_kaldir">Doğrulamayı kaldır</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-ap-fd-karar="kalici_kapat">Kalıcı kapat</button>' +
            '</p>' +
            '<h4>İşlem kayıtları</h4><ul class="ap-log-mini">' + logHtml + '</ul>';
    }

    function yukleOnaylar() {
        var s = svc();
        if (!s) return;
        setBolumLoading('onaylar', true);
        s.firmaListesi(firmaOnaySekme === 'aski' ? 'aski' : firmaOnaySekme).then(function (res) {
            setBolumLoading('onaylar', false);
            if (aktifBolum !== 'onaylar') return;
            if (!res.ok) {
                $('apIcerik').innerHTML = hataDurum(res.error);
                return;
            }
            cache.firmalar = Array.isArray(res.data) ? res.data : [];
            renderOnaylar();
        });
    }

    function renderOnaylar() {
        var sekmeler = [
            ['beklemede', 'Bekleyenler'],
            ['onaylandi', 'Onaylananlar'],
            ['reddedildi', 'Reddedilenler'],
            ['aski', 'Askıya Alınanlar']
        ];
        var tabHtml = sekmeler.map(function (t) {
            return '<button type="button" class="ap-sekme' +
                (firmaOnaySekme === t[0] ? ' ap-sekme--aktif' : '') +
                '" data-ap-onay-sekme="' + t[0] + '">' + esc(t[1]) + '</button>';
        }).join('');

        var sehirSec = ($('apOnaySehir') && $('apOnaySehir').value) || '';
        var liste = (cache.firmalar || []).filter(function (f) {
            return sehirEslesir(f.sehir, sehirSec);
        });
        var kartlar = liste.length ? liste.map(firmaKartHtml).join('') : bosDurum('Bu sekmede kayıt yok.');

        $('apIcerik').innerHTML =
            '<div class="ap-sekmeler" role="tablist">' + tabHtml + '</div>' +
            '<div class="ap-filtreler ap-filtreler--tek">' + sehirSelectHtml('apOnaySehir', sehirSec) + '</div>' +
            '<div class="ap-kart-liste">' + kartlar + '</div>';
    }

    function profilTamamlanma(f) {
        if (typeof AurixFirmaProfil !== 'undefined' && AurixFirmaProfil.hesaplaTamamlama) {
            return AurixFirmaProfil.hesaplaTamamlama(f).yuzde;
        }
        var alanlar = [f.firma_adi, f.sehir, f.kategori, f.aciklama, f.telefon, f.email, f.logo_url];
        var dolu = alanlar.filter(function (x) { return x && String(x).trim(); }).length;
        return Math.round((dolu / alanlar.length) * 100);
    }

    function firmaKartHtml(f) {
        var logo = f.logo_url
            ? '<img class="ap-firma-kart__logo" src="' + esc(f.logo_url) + '" alt="" width="56" height="56">'
            : '<div class="ap-firma-kart__logo ap-firma-kart__logo--bos" aria-hidden="true"></div>';
        var aski = f.askiya_alindi ? durumRozet('Askı') : durumRozet(f.durum);
        return '<article class="ap-firma-kart" data-firma-id="' + esc(f.id) + '">' +
            '<div class="ap-firma-kart__ust">' + logo +
            '<div><h3 class="ap-firma-kart__ad">' + esc(f.firma_adi || '—') + '</h3>' +
            aski + '</div></div>' +
            '<dl class="ap-dl">' +
            '<div><dt>Yetkili</dt><dd>' + esc(f.yetkili_ad || '—') + '</dd></div>' +
            '<div><dt>E-posta</dt><dd>' + esc(f.email || '—') + '</dd></div>' +
            '<div><dt>Telefon</dt><dd>' + esc(f.telefon || '—') + '</dd></div>' +
            '<div><dt>Şehir</dt><dd>' + esc(f.sehir || '—') + '</dd></div>' +
            (f.ilce ? '<div><dt>İlçe</dt><dd>' + esc(f.ilce) + '</dd></div>' : '') +
            (f.firma_turu ? '<div><dt>Firma türü</dt><dd>' + esc(f.firma_turu) + '</dd></div>' : '') +
            (f.yayin_durumu ? '<div><dt>Yayın</dt><dd>' + esc(f.yayin_durumu) + '</dd></div>' : '') +
            '<div><dt>Hizmet</dt><dd>' + esc(f.kategori || '—') + '</dd></div>' +
            '<div><dt>Başvuru</dt><dd>' + esc(tarihTR(f.created_at)) + '</dd></div>' +
            '<div><dt>Profil</dt><dd>%' + esc(String(profilTamamlanma(f))) + '</dd></div>' +
            '</dl>' +
            (f.aciklama ? '<p class="ap-firma-kart__aciklama">' + esc(f.aciklama) + '</p>' : '') +
            (f.red_nedeni ? '<p class="ap-uyari">Red: ' + esc(f.red_nedeni) + '</p>' : '') +
            (f.askiya_alma_nedeni ? '<p class="ap-uyari">Askı: ' + esc(f.askiya_alma_nedeni) + '</p>' : '') +
            '<div class="ap-firma-kart__aksiyon">' +
            '<button type="button" class="btn btn--primary btn--xs" data-ap-firma-onay="' + esc(f.id) + '">Onayla</button>' +
            '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-red="' + esc(f.id) + '">Reddet</button>' +
            (f.askiya_alindi
                ? '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-aski-kaldir="' + esc(f.id) + '">Askıyı Kaldır</button>'
                : '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-aski="' + esc(f.id) + '">Askıya Al</button>') +
            '</div></article>';
    }

    /* ---------- Firmalar (tablo + filtre) ---------- */
    function yukleFirmalar() {
        var s = svc();
        if (!s) return;
        setBolumLoading('firmalar', true);
        s.firmaListesi('hepsi').then(function (res) {
            setBolumLoading('firmalar', false);
            if (aktifBolum !== 'firmalar') return;
            if (!res.ok) {
                $('apIcerik').innerHTML = hataDurum(res.error);
                return;
            }
            cache.firmalar = Array.isArray(res.data) ? res.data : [];
            renderFirmalarTablo();
        });
    }

    function renderFirmalarTablo() {
        var q = (($('apFirmaAra') && $('apFirmaAra').value) || '').toLowerCase().trim();
        var sehir = ($('apFirmaSehir') && $('apFirmaSehir').value) || '';
        var kat = (($('apFirmaKat') && $('apFirmaKat').value) || '').toLowerCase().trim();
        var durum = (($('apFirmaDurum') && $('apFirmaDurum').value) || '').toLowerCase().trim();

        var liste = (cache.firmalar || []).filter(function (f) {
            if (q && String(f.firma_adi || '').toLowerCase().indexOf(q) === -1) return false;
            if (!sehirEslesir(f.sehir, sehir)) return false;
            if (kat && String(f.kategori || '').toLowerCase().indexOf(kat) === -1) return false;
            if (durum === 'aski' && !f.askiya_alindi) return false;
            if (durum && durum !== 'aski' && String(f.durum || '') !== durum) return false;
            return true;
        });

        var satirlar = liste.map(function (f) {
            var logo = f.logo_url
                ? '<img class="ap-mini-logo" src="' + esc(f.logo_url) + '" alt="">'
                : '';
            return '<tr class="ap-satir-masa">' +
                '<td>' + logo + ' ' + esc(f.firma_adi || '—') + '</td>' +
                '<td>' + esc(f.yetkili_ad || '—') + '</td>' +
                '<td>' + esc(f.sehir || '—') + '</td>' +
                '<td>' + esc(f.kategori || '—') + '</td>' +
                '<td>' + (f.askiya_alindi ? durumRozet('Askı') : durumRozet(f.durum)) + '</td>' +
                '<td>' + esc(tarihKisa(f.created_at)) + '</td>' +
                '<td class="ap-islemler">' +
                '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-onay="' + esc(f.id) + '">Onayla</button> ' +
                '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-red="' + esc(f.id) + '">Reddet</button> ' +
                (f.askiya_alindi
                    ? '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-aski-kaldir="' + esc(f.id) + '">Askıyı Kaldır</button>'
                    : '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-aski="' + esc(f.id) + '">Askıya Al</button>') +
                '</td></tr>' +
                '<tr class="ap-satir-mobil"><td colspan="7">' +
                '<div class="ap-mobil-kart">' +
                '<strong>' + esc(f.firma_adi || '—') + '</strong>' +
                '<span>' + esc(f.sehir || '') + ' · ' + esc(f.kategori || '') + '</span>' +
                (f.askiya_alindi ? durumRozet('Askı') : durumRozet(f.durum)) +
                '<div class="ap-islemler">' +
                '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-onay="' + esc(f.id) + '">Onayla</button>' +
                '<button type="button" class="btn btn--ghost btn--xs" data-ap-firma-red="' + esc(f.id) + '">Reddet</button>' +
                '</div></div></td></tr>';
        }).join('');

        $('apIcerik').innerHTML =
            '<div class="ap-filtreler">' +
            '<input type="search" class="form-input" id="apFirmaAra" placeholder="Firma adı ara…" value="' + esc(q) + '">' +
            sehirSelectHtml('apFirmaSehir', sehir) +
            '<input type="text" class="form-input" id="apFirmaKat" placeholder="Kategori" value="' + esc(kat) + '">' +
            '<select class="form-input" id="apFirmaDurum">' +
            '<option value="">Tüm durumlar</option>' +
            '<option value="beklemede"' + (durum === 'beklemede' ? ' selected' : '') + '>Beklemede</option>' +
            '<option value="onaylandi"' + (durum === 'onaylandi' ? ' selected' : '') + '>Onaylandı</option>' +
            '<option value="reddedildi"' + (durum === 'reddedildi' ? ' selected' : '') + '>Reddedildi</option>' +
            '<option value="aski"' + (durum === 'aski' ? ' selected' : '') + '>Askıda</option>' +
            '</select>' +
            '<button type="button" class="btn btn--ghost btn--sm" id="apFirmaFiltreBtn">Filtrele</button>' +
            '</div>' +
            (liste.length
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo ap-tablo--firmalar"><thead><tr>' +
                '<th>Firma</th><th>Yetkili</th><th>Şehir</th><th>Hizmet</th><th>Durum</th><th>Kayıt</th><th>İşlemler</th>' +
                '</tr></thead><tbody>' + satirlar + '</tbody></table></div>'
                : bosDurum('Filtreye uyan firma yok.'));
    }

    /* ---------- Kullanıcılar ---------- */
    function yukleKullanicilar() {
        var s = svc();
        if (!s) return;
        setBolumLoading('kullanicilar', true);
        s.kullaniciListesi().then(function (res) {
            setBolumLoading('kullanicilar', false);
            if (aktifBolum !== 'kullanicilar') return;
            if (!res.ok) {
                $('apIcerik').innerHTML = hataDurum(res.error);
                return;
            }
            cache.kullanicilar = Array.isArray(res.data) ? res.data : [];
            renderKullanicilar();
        });
    }

    function renderKullanicilar() {
        var filtre = (($('apKulFiltre') && $('apKulFiltre').value) || 'hepsi');
        var sehirSec = ($('apKulSehir') && $('apKulSehir').value) || '';
        var liste = (cache.kullanicilar || []).filter(function (u) {
            if (!sehirEslesir(u.firma_sehir, sehirSec)) return false;
            if (filtre === 'normal' && u.hesap_tipi === 'firma') return false;
            if (filtre === 'firma' && u.hesap_tipi !== 'firma' && !u.firma_var) return false;
            if (filtre === 'admin' && u.role !== 'admin') return false;
            if (filtre === 'dogrulanmis' && !u.email_confirmed_at) return false;
            if (filtre === 'dogrulanmamis' && u.email_confirmed_at) return false;
            if (filtre === 'aktif' && u.askiya_alindi) return false;
            if (filtre === 'aski' && !u.askiya_alindi) return false;
            return true;
        });

        var satirlar = liste.map(function (u) {
            var durum = u.askiya_alindi ? 'Askıda' : 'Aktif';
            return '<tr>' +
                '<td>' + esc(u.ad_soyad || '—') + '</td>' +
                '<td>' + esc(u.email || '—') + '</td>' +
                '<td>' + esc(u.hesap_tipi || 'normal') + '</td>' +
                '<td>' + (u.firma_var ? 'Evet' : 'Hayır') + '</td>' +
                '<td>' + (u.email_confirmed_at ? 'Evet' : 'Hayır') + '</td>' +
                '<td>' + esc(tarihKisa(u.created_at)) + '</td>' +
                '<td>' + esc(tarihTR(u.last_sign_in_at)) + '</td>' +
                '<td>' + durumRozet(durum) + '</td>' +
                '<td class="ap-islemler">' +
                (u.role === 'admin'
                    ? '<span class="ap-muted">Admin</span>'
                    : (u.askiya_alindi
                        ? '<button type="button" class="btn btn--ghost btn--xs" data-ap-kul-aski-kaldir="' + esc(u.id) + '">Askıyı Kaldır</button>'
                        : '<button type="button" class="btn btn--ghost btn--xs" data-ap-kul-aski="' + esc(u.id) + '">Askıya Al</button>')) +
                '</td></tr>';
        }).join('');

        $('apIcerik').innerHTML =
            '<div class="ap-filtreler">' +
            '<select class="form-input" id="apKulFiltre">' +
            '<option value="hepsi"' + (filtre === 'hepsi' ? ' selected' : '') + '>Tümü</option>' +
            '<option value="normal"' + (filtre === 'normal' ? ' selected' : '') + '>Normal kullanıcı</option>' +
            '<option value="firma"' + (filtre === 'firma' ? ' selected' : '') + '>Firma sahibi</option>' +
            '<option value="admin"' + (filtre === 'admin' ? ' selected' : '') + '>Admin</option>' +
            '<option value="dogrulanmis"' + (filtre === 'dogrulanmis' ? ' selected' : '') + '>Doğrulanmış</option>' +
            '<option value="dogrulanmamis"' + (filtre === 'dogrulanmamis' ? ' selected' : '') + '>Doğrulanmamış</option>' +
            '<option value="aktif"' + (filtre === 'aktif' ? ' selected' : '') + '>Aktif</option>' +
            '<option value="aski"' + (filtre === 'aski' ? ' selected' : '') + '>Askıda</option>' +
            '</select>' +
            sehirSelectHtml('apKulSehir', sehirSec) +
            '</div>' +
            (liste.length
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Ad soyad</th><th>E-posta</th><th>Hesap</th><th>Firma</th><th>E-posta OK</th>' +
                '<th>Kayıt</th><th>Son giriş</th><th>Durum</th><th>İşlem</th></tr></thead>' +
                '<tbody>' + satirlar + '</tbody></table></div>'
                : bosDurum('Kullanıcı bulunamadı.'));
    }

    /* ---------- İşler ---------- */
    function yukleIsler() {
        var s = svc();
        if (!s) return;
        setBolumLoading('isler', true);
        s.isListesi().then(function (res) {
            setBolumLoading('isler', false);
            if (aktifBolum !== 'isler') return;
            if (!res.ok) {
                $('apIcerik').innerHTML = hataDurum(res.error);
                return;
            }
            cache.isler = Array.isArray(res.data) ? res.data : [];
            renderIsler();
        });
    }

    function renderIsler() {
        var filtre = (($('apIsFiltre') && $('apIsFiltre').value) || 'hepsi');
        var sehirSec = ($('apIsSehir') && $('apIsSehir').value) || '';
        var liste = (cache.isler || []).filter(function (i) {
            if (!sehirEslesir(i.sehir, sehirSec)) return false;
            var mod = String(i.moderasyon_durumu || 'aktif');
            var d = String(i.durum || '');
            if (filtre === 'acik' && d !== 'Acik') return false;
            if (filtre === 'tamamlandi' && d !== 'Tamamlandi' && d !== 'Tamamlandı') return false;
            if (filtre === 'iptal' && d !== 'Iptal' && d !== 'İptal') return false;
            if (filtre === 'incelemede' && mod !== 'incelemede') return false;
            if (filtre === 'kaldirildi' && mod !== 'kaldirildi') return false;
            return true;
        });

        var satirlar = liste.map(function (i) {
            return '<tr>' +
                '<td>' + esc(i.baslik || '—') + '</td>' +
                '<td>' + esc(i.kategori || '—') + '</td>' +
                '<td>' + esc(i.olusturan_ad || '—') + '</td>' +
                '<td>' + esc(i.sehir || '—') + '</td>' +
                '<td>' + esc(String(i.teklif_sayisi != null ? i.teklif_sayisi : 0)) + '</td>' +
                '<td>' + esc(tarihKisa(i.created_at)) + '</td>' +
                '<td>' + durumRozet(i.durum) + ' ' + durumRozet(i.moderasyon_durumu || 'aktif') + '</td>' +
                '<td class="ap-islemler">' +
                '<button type="button" class="btn btn--ghost btn--xs" data-ap-is-mod="incelemede" data-ap-is-id="' + esc(i.id) + '">İncelemeye al</button> ' +
                '<button type="button" class="btn btn--ghost btn--xs" data-ap-is-mod="aktif" data-ap-is-id="' + esc(i.id) + '">Yayına aç</button> ' +
                '<button type="button" class="btn btn--ghost btn--xs" data-ap-is-mod="kaldirildi" data-ap-is-id="' + esc(i.id) + '">Kaldır</button>' +
                '</td></tr>';
        }).join('');

        $('apIcerik').innerHTML =
            '<div class="ap-filtreler">' +
            '<select class="form-input" id="apIsFiltre">' +
            '<option value="hepsi">Tümü</option>' +
            '<option value="acik"' + (filtre === 'acik' ? ' selected' : '') + '>Açık</option>' +
            '<option value="tamamlandi"' + (filtre === 'tamamlandi' ? ' selected' : '') + '>Tamamlandı</option>' +
            '<option value="iptal"' + (filtre === 'iptal' ? ' selected' : '') + '>İptal</option>' +
            '<option value="incelemede"' + (filtre === 'incelemede' ? ' selected' : '') + '>İncelemede</option>' +
            '<option value="kaldirildi"' + (filtre === 'kaldirildi' ? ' selected' : '') + '>Kaldırıldı</option>' +
            '</select>' +
            sehirSelectHtml('apIsSehir', sehirSec) +
            '</div>' +
            (liste.length
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Başlık</th><th>Kategori</th><th>Oluşturan</th><th>Şehir</th><th>Teklif</th><th>Tarih</th><th>Durum</th><th>İşlem</th>' +
                '</tr></thead><tbody>' + satirlar + '</tbody></table></div>'
                : bosDurum('İş talebi bulunamadı.'));
    }

    /* ---------- Teklifler ---------- */
    function yukleTeklifler() {
        var s = svc();
        if (!s) return;
        setBolumLoading('teklifler', true);
        s.teklifListesi().then(function (res) {
            setBolumLoading('teklifler', false);
            if (aktifBolum !== 'teklifler') return;
            if (!res.ok) {
                $('apIcerik').innerHTML = hataDurum(res.error);
                return;
            }
            cache.teklifler = Array.isArray(res.data) ? res.data : [];
            renderTeklifler();
        });
    }

    function renderTeklifler() {
        var liste = cache.teklifler || [];
        var satirlar = liste.map(function (t) {
            return '<tr>' +
                '<td>' + esc(t.is_baslik || '—') + '</td>' +
                '<td>' + esc(t.firma_adi || '—') + '</td>' +
                '<td>' + esc(t.fiyat != null ? String(t.fiyat) : '—') + '</td>' +
                '<td>' + esc(t.termin_gun != null ? (t.termin_gun + ' gün') : '—') + '</td>' +
                '<td>' + esc(tarihKisa(t.created_at)) + '</td>' +
                '<td>' + durumRozet(t.gizli ? 'Gizli' : 'Görünür') + '</td>' +
                '<td class="ap-islemler">' +
                (t.gizli
                    ? '<button type="button" class="btn btn--ghost btn--xs" data-ap-teklif-ac="' + esc(t.id) + '">Tekrar görünür yap</button>'
                    : '<button type="button" class="btn btn--ghost btn--xs" data-ap-teklif-gizle="' + esc(t.id) + '">Gizle</button>') +
                '</td></tr>';
        }).join('');

        $('apIcerik').innerHTML = liste.length
            ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
            '<th>İş</th><th>Firma</th><th>Tutar</th><th>Teslim</th><th>Tarih</th><th>Durum</th><th>İşlem</th>' +
            '</tr></thead><tbody>' + satirlar + '</tbody></table></div>'
            : bosDurum('Henüz teklif yok.');
    }

    /* ---------- İşlem kayıtları ---------- */
    function yukleIslemler() {
        var s = svc();
        if (!s) return;
        var hedef = (($('apIslemFiltre') && $('apIslemFiltre').value) || '') || null;
        setBolumLoading('islemler', true);
        s.islemListesi(hedef).then(function (res) {
            setBolumLoading('islemler', false);
            if (aktifBolum !== 'islemler') return;
            if (!res.ok) {
                $('apIcerik').innerHTML = hataDurum(res.error);
                return;
            }
            cache.islemler = Array.isArray(res.data) ? res.data : [];
            renderIslemler();
        });
    }

    function renderIslemler() {
        var filtre = (($('apIslemFiltre') && $('apIslemFiltre').value) || '');
        var liste = cache.islemler || [];
        var satirlar = liste.map(function (k) {
            return '<tr>' +
                '<td>' + esc(k.admin_ad || 'Admin') + '</td>' +
                '<td>' + esc(k.islem_tipi || '—') + '</td>' +
                '<td>' + esc(k.hedef_turu || '—') + '</td>' +
                '<td>' + esc(k.aciklama || '—') + '</td>' +
                '<td>' + esc(tarihTR(k.created_at)) + '</td></tr>';
        }).join('');

        $('apIcerik').innerHTML =
            '<div class="ap-filtreler">' +
            '<select class="form-input" id="apIslemFiltre">' +
            '<option value="">Tümü</option>' +
            '<option value="firma"' + (filtre === 'firma' ? ' selected' : '') + '>Firma</option>' +
            '<option value="kullanici"' + (filtre === 'kullanici' ? ' selected' : '') + '>Kullanıcı</option>' +
            '<option value="is_talebi"' + (filtre === 'is_talebi' ? ' selected' : '') + '>İlan</option>' +
            '<option value="teklif"' + (filtre === 'teklif' ? ' selected' : '') + '>Teklif</option>' +
            '</select>' +
            '<button type="button" class="btn btn--ghost btn--sm" id="apIslemYenile">Yenile</button>' +
            '</div>' +
            (liste.length
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Admin</th><th>İşlem</th><th>Hedef</th><th>Açıklama</th><th>Tarih</th></tr></thead>' +
                '<tbody>' + satirlar + '</tbody></table></div>'
                : bosDurum('Henüz işlem kaydı yok.'));
    }

    /* ---------- Sistem ---------- */
    function yukleSistem() {
        var s = svc();
        if (!s) return;
        setBolumLoading('sistem', true);
        s.sistemDurumu().then(function (res) {
            setBolumLoading('sistem', false);
            if (aktifBolum !== 'sistem') return;
            cache.sistem = res.data || {};
            renderSistem();
        });
    }

    function sistemEtiket(d) {
        if (d === 'calisiyor') return '<span class="ap-badge ap-badge--ok">Çalışıyor</span>';
        if (d === 'sorun') return '<span class="ap-badge ap-badge--bad">Sorun Var</span>';
        return '<span class="ap-badge ap-badge--muted">Kontrol Edilemedi</span>';
    }

    function renderSistem() {
        var d = cache.sistem || {};
        function satir(ad, obj) {
            obj = obj || {};
            return '<tr><td>' + esc(ad) + '</td><td>' + sistemEtiket(obj.durum) +
                '</td><td>' + esc(obj.detay || '—') + '</td></tr>';
        }
        $('apIcerik').innerHTML =
            '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
            '<th>Servis</th><th>Durum</th><th>Detay</th></tr></thead><tbody>' +
            satir('Supabase bağlantısı', d.supabase) +
            satir('Kullanıcı oturumu', d.oturum) +
            satir('Storage', d.storage) +
            satir('Realtime', d.realtime) +
            satir('Canlı piyasa servisi', d.piyasa) +
            '<tr><td>Son başarılı veri güncellemesi</td><td colspan="2">' +
            esc(d.sonGuncelleme ? tarihTR(d.sonGuncelleme) : 'Kontrol edilemedi') +
            '</td></tr>' +
            '<tr><td>Uygulama sürümü</td><td colspan="2">' + esc(d.surum || '—') + '</td></tr>' +
            '</tbody></table></div>';
    }

    /* ---------- Modallar / aksiyonlar ---------- */
    function onayPenceresi(mesaj) {
        return new Promise(function (resolve) {
            var overlay = document.createElement('div');
            overlay.className = 'ap-modal-overlay';
            overlay.innerHTML =
                '<div class="ap-modal" role="dialog" aria-modal="true">' +
                '<p class="ap-modal__metin">' + esc(mesaj) + '</p>' +
                '<div class="ap-modal__aksiyon">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-ap-modal="hayir">Vazgeç</button>' +
                '<button type="button" class="btn btn--primary btn--sm" data-ap-modal="evet">Onayla</button>' +
                '</div></div>';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', function (e) {
                var t = e.target.getAttribute('data-ap-modal');
                if (!t && e.target === overlay) t = 'hayir';
                if (!t) return;
                overlay.remove();
                resolve(t === 'evet');
            });
        });
    }

    function nedenPenceresi(baslik, hazirListe) {
        return new Promise(function (resolve) {
            var opts = (hazirListe || []).map(function (n) {
                return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
            }).join('');
            var overlay = document.createElement('div');
            overlay.className = 'ap-modal-overlay';
            overlay.innerHTML =
                '<div class="ap-modal" role="dialog" aria-modal="true">' +
                '<h3 class="ap-modal__baslik">' + esc(baslik) + '</h3>' +
                (hazirListe && hazirListe.length
                    ? '<label class="form-label">Neden</label>' +
                    '<select class="form-input" id="apNedenSelect">' + opts + '</select>'
                    : '') +
                '<label class="form-label" for="apNedenText">Açıklama</label>' +
                '<textarea class="form-input" id="apNedenText" rows="3" maxlength="500"></textarea>' +
                '<div class="ap-modal__aksiyon">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-ap-modal="hayir">Vazgeç</button>' +
                '<button type="button" class="btn btn--primary btn--sm" data-ap-modal="evet">Kaydet</button>' +
                '</div></div>';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', function (e) {
                var t = e.target.getAttribute('data-ap-modal');
                if (!t && e.target === overlay) t = 'hayir';
                if (!t) return;
                if (t === 'hayir') {
                    overlay.remove();
                    resolve(null);
                    return;
                }
                var sel = overlay.querySelector('#apNedenSelect');
                var txt = overlay.querySelector('#apNedenText');
                var neden = sel ? sel.value : '';
                var ekstra = txt ? String(txt.value || '').trim() : '';
                if (neden === 'Diğer' || !hazirListe || !hazirListe.length) {
                    if (ekstra.length < 3) {
                        toast('Açıklama zorunludur (en az 3 karakter).', 'error');
                        return;
                    }
                    neden = ekstra;
                } else if (ekstra) {
                    neden = neden + ' — ' + ekstra;
                }
                if (!neden || neden.length < 3) {
                    toast('Neden zorunludur.', 'error');
                    return;
                }
                overlay.remove();
                resolve(neden);
            });
        });
    }

    function bindEvents() {
        var root = $('apRoot');
        if (!root || root.getAttribute('data-ap-bound') === '1') return;
        root.setAttribute('data-ap-bound', '1');

        root.addEventListener('click', function (e) {
            var bolumBtn = e.target.closest('[data-ap-bolum]');
            if (bolumBtn) {
                bolumGoster(bolumBtn.getAttribute('data-ap-bolum'));
                return;
            }
            if (e.target.closest('#apMenuToggle')) {
                document.documentElement.classList.toggle('ap-menu-acik');
                return;
            }
            if (e.target.closest('[data-ap-siteye-don]')) {
                panelKapat();
                if (global.Aurix && Aurix.sayfaGoster) Aurix.sayfaGoster('ana-sayfa');
                return;
            }
            if (e.target.closest('[data-ap-cikis]')) {
                panelKapat();
                if (global.AuthService) {
                    AuthService.signOut().then(function () {
                        if (global.Aurix && Aurix.sayfaGoster) Aurix.sayfaGoster('ana-sayfa');
                        toast('Çıkış yapıldı.', 'info');
                    });
                }
                return;
            }

            var onaySekme = e.target.closest('[data-ap-onay-sekme]');
            if (onaySekme) {
                firmaOnaySekme = onaySekme.getAttribute('data-ap-onay-sekme');
                yukleOnaylar();
                return;
            }

            var fdFiltre = e.target.closest('[data-ap-fd-filtre]');
            if (fdFiltre) {
                dogrulamaFiltre = fdFiltre.getAttribute('data-ap-fd-filtre') || 'hepsi';
                dogrulamaDetayId = null;
                yukleDogrulama();
                return;
            }
            var fdDetay = e.target.closest('[data-ap-fd-detay]');
            if (fdDetay) {
                dogrulamaDetayId = fdDetay.getAttribute('data-ap-fd-detay');
                yukleDogrulama();
                return;
            }
            if (e.target.closest('[data-ap-fd-geri]')) {
                dogrulamaDetayId = null;
                yukleDogrulama();
                return;
            }
            var fdBelge = e.target.closest('[data-ap-fd-belge]');
            if (fdBelge) {
                var bid = fdBelge.getAttribute('data-ap-fd-belge');
                if (window.AurixSupabase && typeof AurixSupabase.firmaDogrulamaBelgeImzaliUrl === 'function') {
                    AurixSupabase.firmaDogrulamaBelgeImzaliUrl(bid).then(function (r) {
                        if (!r.ok) return toast(r.error || 'URL alınamadı.', 'error');
                        if (r.url) window.open(r.url, '_blank', 'noopener');
                    });
                }
                return;
            }
            if (e.target.closest('[data-ap-fd-gib]')) {
                var gibKarar = ($('apFdGibKarar') && $('apFdGibKarar').value) || '';
                var gibGerekce = (($('apFdGibGerekce') && $('apFdGibGerekce').value) || '').trim();
                if (!gibKarar) {
                    toast('GİB kararı seçin.', 'error');
                    return;
                }
                if (gibGerekce.length < 3) {
                    toast('GİB gerekçesi zorunludur.', 'error');
                    return;
                }
                if (!svc() || typeof svc().vergiKontrolKarar !== 'function') {
                    toast('Vergi kontrol API’si yok (026).', 'error');
                    return;
                }
                svc().vergiKontrolKarar(dogrulamaDetayId, gibKarar, gibGerekce, {
                    gibKontrolEdildi: !($('apFdGibKontrol') && !$('apFdGibKontrol').checked),
                    eslesen: { not: ($('apFdEslesen') && $('apFdEslesen').value) || '' },
                    uyusmayan: { not: ($('apFdUyusmayan') && $('apFdUyusmayan').value) || '' }
                }).then(function (res) {
                    if (!res.ok) return toast(res.error || 'GİB sonucu kaydedilemedi.', 'error');
                    toast('GİB kontrol sonucu kaydedildi.', 'success');
                    yukleDogrulama();
                });
                return;
            }
            if (e.target.closest('[data-ap-fd-eslesme]')) {
                if (!svc() || typeof svc().dogrulamaEslesmeIsaretle !== 'function') {
                    toast('Eşleşme API’si yok (026).', 'error');
                    return;
                }
                svc().dogrulamaEslesmeIsaretle(
                    dogrulamaDetayId,
                    !!($('apFdOdaEslesti') && $('apFdOdaEslesti').checked),
                    !!($('apFdSahiplikEslesti') && $('apFdSahiplikEslesti').checked),
                    !!($('apFdTelTeyit') && $('apFdTelTeyit').checked)
                ).then(function (res) {
                    if (!res.ok) return toast(res.error || 'Kaydedilemedi.', 'error');
                    toast('Eşleşmeler kaydedildi.', 'success');
                    yukleDogrulama();
                });
                return;
            }
            var fdKarar = e.target.closest('[data-ap-fd-karar]');
            if (fdKarar) {
                var karar = fdKarar.getAttribute('data-ap-fd-karar');
                var gerekce = (($('apFdGerekce') && $('apFdGerekce').value) || '').trim();
                var gerekceKod = ($('apFdGerekceKod') && $('apFdGerekceKod').value) || '';
                var icNot = ($('apFdIcNot') && $('apFdIcNot').value) || '';
                var yenileme = parseInt(($('apFdYenileme') && $('apFdYenileme').value) || '12', 10);
                if (gerekce.length < 3) {
                    toast('Gerekçe zorunludur (en az 3 karakter).', 'error');
                    return;
                }
                if (!svc() || typeof svc().dogrulamaKarar !== 'function') {
                    toast('Doğrulama API’si yok.', 'error');
                    return;
                }
                svc().dogrulamaKarar(dogrulamaDetayId, karar, gerekce, gerekceKod, icNot, yenileme)
                    .then(function (res) {
                        if (!res.ok) return toast(res.error || 'Karar kaydedilemedi.', 'error');
                        toast('Karar kaydedildi.', 'success');
                        yukleDogrulama();
                    });
                return;
            }

            if (e.target.closest('[data-ap-goto-onay]')) {
                firmaOnaySekme = 'beklemede';
                bolumGoster('onaylar');
                return;
            }

            var haritaMetrikBtn = e.target.closest('[data-ap-harita-metrik]');
            if (haritaMetrikBtn) {
                genelUI.haritaMetrik = haritaMetrikBtn.getAttribute('data-ap-harita-metrik') || 'firma';
                /* seçili şehir kartı korunur — yalnızca renklendirme metriği değişir */
                if (aktifBolum === 'genel') renderGenel();
                return;
            }
            var haritaAralikBtn = e.target.closest('[data-ap-harita-aralik]');
            if (haritaAralikBtn) {
                genelUI.haritaAralik = haritaAralikBtn.getAttribute('data-ap-harita-aralik') || 'tum';
                /* seçim korunur; zaman bağımlı veriler yeniden yüklenir */
                yukleHaritaSadece();
                return;
            }
            var analitikAralikBtn = e.target.closest('[data-ap-analitik-aralik]');
            if (analitikAralikBtn) {
                genelUI.analitikAralik = analitikAralikBtn.getAttribute('data-ap-analitik-aralik') || '30g';
                yukleAnalitikSadece();
                return;
            }
            var ilBtn = e.target.closest('[data-ap-il]');
            if (ilBtn) {
                genelUI.seciliPlaka = ilBtn.getAttribute('data-ap-il');
                if (aktifBolum === 'genel') renderGenel();
                return;
            }
            if (e.target.closest('[data-ap-il-temizle]')) {
                genelUI.seciliPlaka = null;
                if (aktifBolum === 'genel') renderGenel();
                return;
            }

            var onayId = e.target.closest('[data-ap-firma-onay]');
            if (onayId) {
                var fid = onayId.getAttribute('data-ap-firma-onay');
                onayPenceresi('Bu firma AURIX içerisinde görünür olacak ve işlere teklif verebilecek. Onaylıyor musunuz?')
                    .then(function (ok) {
                        if (!ok || !svc()) return;
                        return svc().firmaOnayla(fid).then(function (res) {
                            if (!res || !res.ok) {
                                return toast((res && res.error) || 'Firma onaylanamadı.', 'error');
                            }
                            var d = res.data || {};
                            if (d.durum && d.durum !== 'onaylandi') {
                                return toast('Onay tamamlanamadı. Firma durumu: ' + d.durum, 'error');
                            }
                            if (d.yayin_durumu && d.yayin_durumu !== 'yayinda') {
                                return toast('Onay yazıldı ancak yayın durumu güncellenemedi.', 'error');
                            }
                            toast('Firma onaylandı.', 'success');
                            if (aktifBolum === 'onaylar') yukleOnaylar();
                            else if (aktifBolum === 'firmalar') yukleFirmalar();
                            else if (aktifBolum === 'genel') yukleGenel();
                        }).catch(function (err) {
                            toast((err && err.message) || 'Firma onaylanamadı.', 'error');
                        });
                    });
                return;
            }

            var redId = e.target.closest('[data-ap-firma-red]');
            if (redId) {
                var rid = redId.getAttribute('data-ap-firma-red');
                nedenPenceresi('Firmayı reddet', RED_NEDENLERI).then(function (neden) {
                    if (!neden || !svc()) return;
                    return svc().firmaReddet(rid, neden).then(function (res) {
                        if (!res || !res.ok) {
                            return toast((res && res.error) || 'Firma reddedilemedi.', 'error');
                        }
                        toast('Firma reddedildi.', 'success');
                        if (aktifBolum === 'onaylar') yukleOnaylar();
                        else yukleFirmalar();
                    }).catch(function (err) {
                        toast((err && err.message) || 'Firma reddedilemedi.', 'error');
                    });
                });
                return;
            }

            var askiId = e.target.closest('[data-ap-firma-aski]');
            if (askiId) {
                var aid = askiId.getAttribute('data-ap-firma-aski');
                nedenPenceresi('Firmayı askıya al', []).then(function (neden) {
                    if (!neden || !svc()) return;
                    return svc().firmaAskiyaAl(aid, neden).then(function (res) {
                        if (!res || !res.ok) {
                            return toast((res && res.error) || 'Firma askıya alınamadı.', 'error');
                        }
                        toast('Firma askıya alındı.', 'success');
                        if (aktifBolum === 'onaylar') yukleOnaylar();
                        else yukleFirmalar();
                    }).catch(function (err) {
                        toast((err && err.message) || 'Firma askıya alınamadı.', 'error');
                    });
                });
                return;
            }

            var askiKaldir = e.target.closest('[data-ap-firma-aski-kaldir]');
            if (askiKaldir) {
                var kid = askiKaldir.getAttribute('data-ap-firma-aski-kaldir');
                if (!svc()) return;
                svc().firmaAskiKaldir(kid).then(function (res) {
                    if (!res || !res.ok) {
                        return toast((res && res.error) || 'Askı kaldırılamadı.', 'error');
                    }
                    toast('Askı kaldırıldı.', 'success');
                    if (aktifBolum === 'onaylar') yukleOnaylar();
                    else yukleFirmalar();
                }).catch(function (err) {
                    toast((err && err.message) || 'Askı kaldırılamadı.', 'error');
                });
                return;
            }

            var kulAski = e.target.closest('[data-ap-kul-aski]');
            if (kulAski) {
                var uid = kulAski.getAttribute('data-ap-kul-aski');
                nedenPenceresi('Kullanıcıyı askıya al', []).then(function (neden) {
                    if (!neden || !svc()) return;
                    return svc().kullaniciAskiyaAl(uid, neden).then(function (res) {
                        if (!res.ok) return toast(res.error, 'error');
                        toast('Kullanıcı askıya alındı.', 'success');
                        yukleKullanicilar();
                    });
                });
                return;
            }

            var kulKaldir = e.target.closest('[data-ap-kul-aski-kaldir]');
            if (kulKaldir) {
                var ukid = kulKaldir.getAttribute('data-ap-kul-aski-kaldir');
                if (!svc()) return;
                svc().kullaniciAskiKaldir(ukid).then(function (res) {
                    if (!res.ok) return toast(res.error, 'error');
                    toast('Askı kaldırıldı.', 'success');
                    yukleKullanicilar();
                });
                return;
            }

            var isMod = e.target.closest('[data-ap-is-mod]');
            if (isMod) {
                var isId = isMod.getAttribute('data-ap-is-id');
                var mod = isMod.getAttribute('data-ap-is-mod');
                var run = function (notu) {
                    if (!svc()) return;
                    svc().isModerasyon(isId, mod, notu).then(function (res) {
                        if (!res.ok) return toast(res.error, 'error');
                        toast('İlan moderasyonu güncellendi.', 'success');
                        yukleIsler();
                    });
                };
                if (mod === 'kaldirildi') {
                    nedenPenceresi('İlanı yayından kaldır', []).then(function (n) {
                        if (n) run(n);
                    });
                } else {
                    run(null);
                }
                return;
            }

            var tg = e.target.closest('[data-ap-teklif-gizle]');
            if (tg) {
                if (!svc()) return;
                svc().teklifGizle(tg.getAttribute('data-ap-teklif-gizle'), true, 'Uygunsuz içerik').then(function (res) {
                    if (!res.ok) return toast(res.error, 'error');
                    toast('Teklif gizlendi.', 'success');
                    yukleTeklifler();
                });
                return;
            }
            var ta = e.target.closest('[data-ap-teklif-ac]');
            if (ta) {
                if (!svc()) return;
                svc().teklifGizle(ta.getAttribute('data-ap-teklif-ac'), false, 'Tekrar görünür').then(function (res) {
                    if (!res.ok) return toast(res.error, 'error');
                    toast('Teklif görünür yapıldı.', 'success');
                    yukleTeklifler();
                });
                return;
            }

            if (e.target.closest('#apFirmaFiltreBtn')) {
                renderFirmalarTablo();
                return;
            }
            if (e.target.closest('#apIslemYenile')) {
                yukleIslemler();
            }
        });

        root.addEventListener('change', function (e) {
            if (e.target.id === 'apKulFiltre' || e.target.id === 'apKulSehir') renderKullanicilar();
            if (e.target.id === 'apIsFiltre' || e.target.id === 'apIsSehir') renderIsler();
            if (e.target.id === 'apIslemFiltre') yukleIslemler();
            if (e.target.id === 'apFirmaDurum' || e.target.id === 'apFirmaSehir') renderFirmalarTablo();
            if (e.target.id === 'apOnaySehir') renderOnaylar();
        });
    }

    function init() {
        bindEvents();
    }

    global.AurixAdmin = {
        init: init,
        panelAc: panelAc,
        panelKapat: panelKapat,
        bolumGoster: bolumGoster,
        yetkiliMi: yetkiliMi
    };
})(typeof window !== 'undefined' ? window : this);

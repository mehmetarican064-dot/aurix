/**
 * AURIX İş Talebi — oluşturma sihirbazı, önizleme, detay
 * Servis: AurixIsTalebiService. Demo: localhost / ?demoIsTalebi=1
 */
(function (global) {
    'use strict';

    var esc = (global.AurixUtils && AurixUtils.escapeHtml)
        ? AurixUtils.escapeHtml
        : function (s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

    var PROD_HOST = /(?:^|\.)aurixb2b\.com$/i;
    var SECTIONS = ['ozet', 'detay', 'dosyalar', 'teslimat', 'gizlilik', 'onizleme'];
    var SECTION_LABELS = {
        ozet: 'Özet',
        detay: 'Detay',
        dosyalar: 'Dosyalar',
        teslimat: 'Teslimat',
        gizlilik: 'Gizlilik',
        onizleme: 'Önizleme'
    };

    var LS_PENDING = 'aurix_is_talep_pending';
    var LS_PENDING_FLAG = 'aurix_pending_is_talep';
    var LS_DRAFTS = 'aurix_is_talep_drafts';
    var LS_AUTOSAVE = 'aurix_is_talep_autosave';
    var LS_DEMO = 'aurix_demo_is_talebi';
    var DRAFT_MAX_DAYS = 30;
    var AUTOSAVE_MS = 400;
    var MAX_FILES = 10;
    var MAX_TOTAL_BYTES = 100 * 1024 * 1024;

    var IS_KATEGORILERI = [
        { slug: 'cad-tasarim', ad: 'CAD Tasarım' },
        { slug: 'mum-model', ad: 'Mum Model' },
        { slug: 'kalip', ad: 'Kalıp' },
        { slug: '3d-baski', ad: '3D Baskı' },
        { slug: 'dokum', ad: 'Döküm' },
        { slug: 'pres', ad: 'Pres' },
        { slug: 'mihlama', ad: 'Mıhlama' },
        { slug: 'cila', ad: 'Cila' },
        { slug: 'rodaj', ad: 'Rodaj' },
        { slug: 'mine', ad: 'Mine' },
        { slug: 'lazer-kaynak', ad: 'Lazer Kaynak' },
        { slug: 'zincir-uretimi', ad: 'Zincir Üretimi' },
        { slug: 'montur', ad: 'Montür' },
        { slug: 'tas-sokme-takma', ad: 'Taş Sökme / Takma' },
        { slug: 'tamir-revizyon', ad: 'Tamir / Revizyon' },
        { slug: 'diger', ad: 'Diğer' }
    ];

    var URUN_TURLERI = [
        { slug: 'yuzuk', ad: 'Yüzük' }, { slug: 'kolye', ad: 'Kolye' }, { slug: 'kupe', ad: 'Küpe' },
        { slug: 'bileklik', ad: 'Bileklik' }, { slug: 'zincir', ad: 'Zincir' }, { slug: 'alyans', ad: 'Alyans' },
        { slug: 'bros', ad: 'Broş' }, { slug: 'set', ad: 'Set' }, { slug: 'aksesuar', ad: 'Aksesuar / Parça' }, { slug: 'diger', ad: 'Diğer' }
    ];

    var MALZEMELER = [
        { slug: '8-ayar', ad: '8 Ayar Altın' }, { slug: '14-ayar', ad: '14 Ayar Altın' }, { slug: '18-ayar', ad: '18 Ayar Altın' },
        { slug: '22-ayar', ad: '22 Ayar Altın' }, { slug: 'has-altin', ad: 'Has Altın' }, { slug: 'gumus', ad: 'Gümüş' },
        { slug: 'pirinc', ad: 'Pirinç' }, { slug: 'bronz', ad: 'Bronz' }, { slug: 'celik', ad: 'Çelik' },
        { slug: 'belirtilmedi', ad: 'Malzeme belirtilmedi' }, { slug: 'diger', ad: 'Diğer' }
    ];

    var ACILIYET = [
        { slug: 'standart', ad: 'Standart' },
        { slug: 'oncelikli', ad: 'Öncelikli' },
        { slug: 'acil', ad: 'Acil' }
    ];

    var MALZEME_SAGLAYICI = [
        { slug: 'is_veren', ad: 'İş veren sağlayacak' },
        { slug: 'hizmet_veren', ad: 'Hizmeti veren firma sağlayacak' },
        { slug: 'gorusulecek', ad: 'Görüşülecek' }
    ];

    var TAS_DURUMU = [
        { slug: 'yok', ad: 'Taş yok' },
        { slug: 'is_veren', ad: 'Taşlar iş veren tarafından sağlanacak' },
        { slug: 'hizmet_veren', ad: 'Taşlar firmadan talep edilecek' },
        { slug: 'gorusulecek', ad: 'Görüşülecek' }
    ];

    var TESLIM_SEKLI = [
        { slug: 'elden', ad: 'Elden teslim' },
        { slug: 'kargo', ad: 'Kargo' },
        { slug: 'kurye', ad: 'Kurye' },
        { slug: 'gorusulecek', ad: 'Görüşülecek' }
    ];

    var BUTCE_TIPI = [
        { slug: 'teklif_bekliyorum', ad: 'Teklif bekliyorum' },
        { slug: 'tahmini', ad: 'Tahmini bütçem var' },
        { slug: 'sabit', ad: 'Sabit bütçe' }
    ];

    var BUTCE_GORUNURLUGU = [
        { slug: 'herkese', ad: 'Evet, herkese açık' },
        { slug: 'dogrulanmis_firmalar', ad: 'Yalnızca teklif verebilen doğrulanmış firmalar görsün' }
    ];

    var GORUNURLUK = [
        { slug: 'tum_dogrulanmis_firmalar', ad: 'Tüm doğrulanmış firmalar' },
        { slug: 'secilen_sehir', ad: 'Yalnızca seçilen şehirdeki firmalar' },
        { slug: 'davet_edilen', ad: 'Davet edilen firmalar', yakinda: true }
    ];

    var DOSYA_GORUNURLUGU = [
        { slug: 'talebi_gorenler', ad: 'Talep detayını görebilen firmalar' },
        { slug: 'teklif_sonrasi', ad: 'Yalnızca teklif verdikten sonra', yakinda: true }
    ];

    var state = {
        formData: null,
        localFiles: [],
        stepIndex: 0,
        dirty: false,
        publishing: false,
        istemciAnahtar: null,
        talepId: null,
        mode: 'form',
        draftTimer: null,
        bound: false,
        onAuthRequired: null
    };

    function svc() {
        return global.AurixIsTalebiService || null;
    }

    function toast(msg, tip) {
        if (typeof global.toast === 'function') {
            try { global.toast(msg, tip || 'info'); return; } catch (e) { /* ignore */ }
        }
        if (global.Aurix && typeof Aurix.toast === 'function') {
            try { Aurix.toast(msg, tip || 'info'); return; } catch (e2) { /* ignore */ }
        }
    }

    function uuid() {
        if (global.crypto && typeof crypto.randomUUID === 'function') {
            try { return crypto.randomUUID(); } catch (e) { /* fall */ }
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function todayISO() {
        var d = new Date();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    function formatBytes(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatMoneyTR(n, pb) {
        if (n == null || n === '') return '—';
        var num = Number(n);
        if (!isFinite(num)) return String(n);
        try {
            return new Intl.NumberFormat('tr-TR', {
                style: 'currency',
                currency: pb || 'TRY',
                maximumFractionDigits: 0
            }).format(num);
        } catch (e) {
            return String(Math.round(num)) + ' ' + (pb || 'TRY');
        }
    }

    function labelFor(list, slug) {
        if (!slug) return '—';
        for (var i = 0; i < list.length; i++) {
            if (list[i].slug === slug) return list[i].ad;
        }
        return String(slug);
    }

    function isLoggedIn() {
        try {
            if (global.AuthService && typeof AuthService.getCurrentUser === 'function') {
                var u = AuthService.getCurrentUser();
                if (u && u.id) return true;
            }
            if (global.AuthService && typeof AuthService.getUser === 'function') {
                var u2 = AuthService.getUser();
                if (u2 && (u2.id || u2.email)) return true;
            }
            if (global.AuthService && typeof AuthService.getSession === 'function') {
                var s = AuthService.getSession();
                if (s && (s.user || s.access_token)) return true;
            }
            if (global.Aurix && Aurix.user && Aurix.user.id) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function openAuthModal() {
        try {
            if (typeof state.onAuthRequired === 'function') {
                try { state.onAuthRequired({ reason: 'is-talebi' }); } catch (e0) { /* ignore */ }
            }
            if (global.Aurix && typeof Aurix.uyelikModalAc === 'function') {
                Aurix.uyelikModalAc('giris');
                return;
            }
            if (typeof global.uyelikModalAc === 'function') {
                global.uyelikModalAc('giris');
                return;
            }
            try {
                document.dispatchEvent(new CustomEvent('aurix:auth-required', { detail: { source: 'is-talebi' } }));
            } catch (e2) { /* ignore */ }
            var giris = document.getElementById('girisModal');
            if (giris) {
                giris.classList.add('modal--acik');
                document.body.classList.add('modal-acik');
                return;
            }
            var btn = document.getElementById('navGirisBtn') ||
                document.querySelector('[data-auth-open], [data-modal-ac="girisModal"], #girisAcBtn');
            if (btn) btn.click();
        } catch (e) { /* ignore */ }
    }

    function modalAc(id) {
        var el = typeof id === 'string' ? document.getElementById(id) : id;
        if (!el) return;
        if (global.Aurix && typeof Aurix.modalAc === 'function') {
            try { Aurix.modalAc(el.id || id); return; } catch (e) { /* fall */ }
        }
        if (typeof global.modalAc === 'function') {
            try { global.modalAc(el.id || id); return; } catch (e2) { /* fall */ }
        }
        el.classList.add('modal--acik');
        el.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-acik');
    }

    function modalKapat(id) {
        var el = typeof id === 'string' ? document.getElementById(id) : id;
        if (!el) return;
        if (global.Aurix && typeof Aurix.modalKapat === 'function') {
            try { Aurix.modalKapat(el.id || id); return; } catch (e) { /* fall */ }
        }
        if (typeof global.modalKapat === 'function') {
            try { global.modalKapat(el.id || id); return; } catch (e2) { /* fall */ }
        }
        el.classList.remove('modal--acik');
        el.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-acik');
    }

    function lsGet(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    function lsSet(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    }

    function lsSetRaw(key, val) {
        try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
    }

    function demoModAktifMi() {
        try {
            if (new URLSearchParams(location.search).get('demoIsTalebi') === '1') return true;
            if (global.localStorage && localStorage.getItem(LS_DEMO) === '1') return true;
        } catch (e2) { /* ignore */ }
        if (global.AURIX_DEMO_IS_TALEBI === true) return true;

        var host = '';
        try { host = String(global.location && location.hostname || '').toLowerCase(); } catch (e) { host = ''; }
        if (PROD_HOST.test(host)) return false;

        var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
            host === '' || /\.local$/i.test(host) || host === '0.0.0.0';
        return local;
    }

    function getDemoTalepler() {
        return [
            {
                id: 'demo-it-1',
                _kaynak: 'demo',
                baslik: '50 adet 14 ayar yüzük için döküm hizmeti',
                kategori: 'Döküm',
                urun_turu: 'Yüzük',
                sehir: 'İstanbul',
                ilce: 'Fatih',
                aciliyet: 'oncelikli',
                teslim_tarihi: '2026-08-05',
                butce_tipi: 'teklif_bekliyorum',
                butce_etiket: 'Teklif bekliyor',
                butce_min: null,
                butce_max: null,
                para_birimi: 'TRY',
                durum: 'teklif_bekliyor',
                sahip_etiket: 'Kuyumculuk firması — İstanbul',
                dosya_sayisi: 1,
                yayinlanma_tarihi: new Date().toISOString(),
                aciklama: '50 adet 14 ayar yüzük için döküm hizmeti. Teslim tercihen 10 gün içinde. Klasik erkek yüzük modeli; ağırlık ve ölçü çizimi ektedir.',
                adet: 50,
                malzeme: '14 Ayar Altın'
            },
            {
                id: 'demo-it-2',
                _kaynak: 'demo',
                baslik: 'Alyans döküm + cila paketi',
                kategori: 'dokum',
                urun_turu: 'alyans',
                sehir: 'İzmir',
                ilce: 'Konak',
                aciliyet: 'standart',
                teslim_tarihi: '2026-09-05',
                butce_tipi: 'teklif_bekliyorum',
                butce_min: null,
                butce_max: null,
                para_birimi: 'TRY',
                durum: 'teklif_bekliyor',
                aciklama: 'Çift alyans seti. Döküm sonrası yüzey hazırlığı ve cila dahil teklif bekleniyor. Taş yok.',
                adet: '2 takım',
                malzeme: '18-ayar'
            },
            {
                id: 'demo-it-3',
                _kaynak: 'demo',
                baslik: 'Kolye uç döküm (pirinç master)',
                kategori: 'dokum',
                urun_turu: 'kolye',
                sehir: 'Ankara',
                ilce: 'Çankaya',
                aciliyet: 'acil',
                teslim_tarihi: '2026-08-02',
                butce_tipi: 'sabit',
                butce_min: 18000,
                butce_max: 18000,
                para_birimi: 'TRY',
                durum: 'teklif_bekliyor',
                aciklama: 'Mevcut pirinç master üzerinden döküm. Dar termin. Teknik PDF ve fotoğraflar ekte.',
                adet: '40',
                malzeme: 'pirinc'
            }
        ];
    }

    function emptyForm() {
        return {
            baslik: '',
            kategori: '',
            urun_turu: '',
            adet: '',
            aciklama: '',
            teknik_bilgiler: '',
            malzeme: '',
            malzeme_saglayici: 'gorusulecek',
            tahmini_gram: '',
            gram_gorunur: false,
            tas_durumu: 'yok',
            sehir: '',
            ilce: '',
            teslim_tarihi: '',
            aciliyet: 'standart',
            teslim_sekli: 'gorusulecek',
            butce_tipi: 'teklif_bekliyorum',
            butce_min: '',
            butce_max: '',
            para_birimi: 'TRY',
            butce_gorunurlugu: 'dogrulanmis_firmalar',
            gorunurluk: 'tum_dogrulanmis_firmalar',
            dosya_gorunurlugu: 'talebi_gorenler',
            sahip_gizli: false
        };
    }

    function optionsHtml(list, selected, includeEmpty) {
        var h = includeEmpty ? '<option value="">Seçin</option>' : '';
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            var sel = selected === it.slug ? ' selected' : '';
            var dis = it.yakinda ? ' disabled' : '';
            var label = it.ad + (it.yakinda ? ' (Yakında)' : '');
            h += '<option value="' + esc(it.slug) + '"' + sel + dis + '>' + esc(label) + '</option>';
        }
        return h;
    }

    function sehirOptions(selected) {
        var cities = (global.AURIX_DATA && AURIX_DATA.SEHIRLER) || [];
        var h = '<option value="">Şehir seçin</option>';
        h += '<option value="__turkiye__"' + (selected === '__turkiye__' ? ' selected' : '') + '>Fark etmez / Türkiye geneli</option>';
        for (var i = 0; i < cities.length; i++) {
            var c = cities[i];
            var name = typeof c === 'string' ? c : (c.ad || c.name || c);
            var sel = selected === name ? ' selected' : '';
            h += '<option value="' + esc(name) + '"' + sel + '>' + esc(name) + '</option>';
        }
        return h;
    }

    function ilceOptions(sehir, selected) {
        var list = [];
        try {
            if (typeof global.AURIX_ilcelerFor === 'function') list = AURIX_ilcelerFor(sehir) || [];
        } catch (e) { list = []; }
        var h = '<option value="">İlçe seçin</option>';
        h += '<option value="__fark_etmez__"' + (selected === '__fark_etmez__' ? ' selected' : '') + '>Fark etmez</option>';
        for (var i = 0; i < list.length; i++) {
            var name = typeof list[i] === 'string' ? list[i] : (list[i].ad || list[i]);
            var sel = selected === name ? ' selected' : '';
            h += '<option value="' + esc(name) + '"' + sel + '>' + esc(name) + '</option>';
        }
        return h;
    }

    function radioGroupHtml(name, list, selected) {
        var h = '<div class="it-radyo-grup" role="radiogroup">';
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            var id = 'it_' + name + '_' + it.slug;
            var chk = (selected || '') === it.slug ? ' checked' : '';
            var dis = it.yakinda ? ' disabled' : '';
            var cls = 'it-radyo' + (it.yakinda ? ' it-radyo--yakinda' : '');
            h += '<label class="' + cls + '" for="' + id + '">';
            h += '<input type="radio" name="' + esc(name) + '" id="' + id + '" value="' + esc(it.slug) + '" data-it-field="' + esc(name) + '"' + chk + dis + '>';
            h += '<span>' + esc(it.ad) + (it.yakinda ? ' <em>(Yakında)</em>' : '') + '</span></label>';
        }
        h += '</div>';
        return h;
    }

    function buildWizardHtml() {
        var minDate = todayISO();
        var h = '';
        h += '<div class="it-wizard it-wizard--mobile-steps" id="itWizard">';
        h += '<p class="it-guven-metni">Talebiniz yalnızca seçtiğiniz görünürlük ayarlarına uygun firmalar tarafından görüntülenir.</p>';
        h += '<div class="it-adimlar" id="itAdimlar" role="tablist" aria-label="Adımlar">';
        for (var s = 0; s < SECTIONS.length; s++) {
            h += '<button type="button" class="it-adim' + (s === 0 ? ' it-adim--aktif' : '') + '" data-it-step="' + s + '" role="tab">' + (s + 1) + '. ' + esc(SECTION_LABELS[SECTIONS[s]]) + '</button>';
        }
        h += '</div>';
        h += '<div class="it-taslak-durum" id="itTaslakDurum" aria-live="polite"></div>';

        /* Özet */
        h += '<section class="it-bolum it-bolum--aktif" data-it-section="ozet">';
        h += '<h4 class="it-bolum__baslik">Talep özeti</h4>';
        h += '<p class="it-bolum__alt">Firmaların ilk bakışta anlayacağı başlık ve kategori bilgilerini girin.</p>';
        h += '<div class="it-alan"><label class="form-label" for="itBaslik">Başlık *</label>';
        h += '<input class="form-input" id="itBaslik" data-it-field="baslik" maxlength="90" placeholder="50 adet 14 ayar yüzük için döküm hizmeti">';
        h += '<div class="it-sayac" data-it-count="baslik">0 / 90</div><div class="it-hata" data-it-error="baslik" hidden></div></div>';
        h += '<div class="it-alan it-alan--iki">';
        h += '<div><label class="form-label" for="itKategori">İş kategorisi *</label>';
        h += '<select class="form-select" id="itKategori" data-it-field="kategori">' + optionsHtml(IS_KATEGORILERI, '', true) + '</select>';
        h += '<div class="it-hata" data-it-error="kategori" hidden></div></div>';
        h += '<div><label class="form-label" for="itUrun">Ürün türü *</label>';
        h += '<select class="form-select" id="itUrun" data-it-field="urun_turu">' + optionsHtml(URUN_TURLERI, '', true) + '</select>';
        h += '<div class="it-hata" data-it-error="urun_turu" hidden></div></div></div>';
        h += '<div class="it-alan it-alan--iki">';
        h += '<div><label class="form-label" for="itAdet">Adet / kapsam</label>';
        h += '<input class="form-input" id="itAdet" data-it-field="adet" maxlength="80" placeholder="Örn. 120 adet"></div>';
        h += '<div><label class="form-label" for="itAciliyet">Aciliyet</label>';
        h += '<select class="form-select" id="itAciliyet" data-it-field="aciliyet">' + optionsHtml(ACILIYET, 'standart', false) + '</select></div></div>';
        h += '<div class="it-uyari" id="itAcilUyari" hidden>Acil talepler daha yüksek işçilik teklifleri alabilir.</div>';
        h += '</section>';

        /* Detay */
        h += '<section class="it-bolum" data-it-section="detay">';
        h += '<h4 class="it-bolum__baslik">İş detayı</h4>';
        h += '<p class="it-bolum__alt">Teklif kalitesi için açıklamayı net yazın. Teknik notlar isteğe bağlıdır.</p>';
        h += '<div class="it-alan"><label class="form-label" for="itAciklama">Açıklama *</label>';
        h += '<textarea class="form-textarea" id="itAciklama" data-it-field="aciklama" rows="5" maxlength="2000" placeholder="İşin kapsamı, beklenti, model referansı..."></textarea>';
        h += '<div class="it-sayac" data-it-count="aciklama">0 / 2000</div><div class="it-hata" data-it-error="aciklama" hidden></div></div>';
        h += '<p class="it-yardim">Ölçü, adet, ürün tipi, işçilik beklentisi ve özel talepleri açıkça belirtin.</p>';
        h += '<div class="it-alan"><label class="form-label" for="itTeknik">Teknik bilgiler</label>';
        h += '<textarea class="form-textarea" id="itTeknik" data-it-field="teknik_bilgiler" rows="3" maxlength="1000" placeholder="Ölçü, tolerans, alaşım notu..."></textarea>';
        h += '<div class="it-sayac" data-it-count="teknik_bilgiler">0 / 1000</div></div>';
        h += '<div class="it-alan it-alan--iki">';
        h += '<div><label class="form-label" for="itMalzeme">Malzeme</label>';
        h += '<select class="form-select" id="itMalzeme" data-it-field="malzeme">' + optionsHtml(MALZEMELER, '', true) + '</select></div>';
        h += '<div><label class="form-label">Malzeme sağlayıcı</label>' + radioGroupHtml('malzeme_saglayici', MALZEME_SAGLAYICI, 'gorusulecek') + '</div></div>';
        h += '<div class="it-alan it-alan--iki">';
        h += '<div><label class="form-label" for="itGram">Tahmini gram</label>';
        h += '<input class="form-input" type="number" id="itGram" data-it-field="tahmini_gram" min="0" step="0.001" inputmode="decimal" placeholder="örn. 12.5">';
        h += '<p class="it-yardim">Birim: gr</p></div>';
        h += '<div><label class="it-radyo" for="itGramGorunur"><input type="checkbox" id="itGramGorunur" data-it-field="gram_gorunur"><span>Tahmini gramı herkese açık göster</span></label></div></div>';
        h += '<div class="it-alan"><label class="form-label">Taş durumu</label>' + radioGroupHtml('tas_durumu', TAS_DURUMU, 'yok') + '</div>';
        h += '</section>';

        /* Dosyalar */
        h += '<section class="it-bolum" data-it-section="dosyalar">';
        h += '<h4 class="it-bolum__baslik">Dosyalar</h4>';
        h += '<p class="it-bolum__alt">JPG, PNG, WEBP, STL, 3DM, OBJ, STEP, PDF — en fazla 10 dosya, toplam 100 MB.</p>';
        h += '<div class="it-uyari">Telefon numarası, e-posta veya platform dışı iletişim bilgisi içeren dosyalar paylaşmayın.</div>';
        h += '<div class="it-dropzone" id="itDropzone" tabindex="0" role="button" aria-label="Dosya yükle">';
        h += '<strong>Dosyaları sürükleyin veya seçin</strong>';
        h += '<small>Görseller için önizleme gösterilir</small></div>';
        h += '<input type="file" id="itFileInput" multiple accept=".jpg,.jpeg,.png,.webp,.stl,.3dm,.obj,.step,.stp,.pdf,image/*" hidden>';
        h += '<div class="it-dosya-listesi" id="itDosyaListesi"></div>';
        h += '<div class="it-hata" data-it-error="dosyalar" hidden></div>';
        h += '<div class="it-alan" style="margin-top:14px"><label class="form-label">Dosya görünürlüğü</label>';
        h += radioGroupHtml('dosya_gorunurlugu', DOSYA_GORUNURLUGU, 'talebi_gorenler') + '</div>';
        h += '</section>';

        /* Teslimat */
        h += '<section class="it-bolum" data-it-section="teslimat">';
        h += '<h4 class="it-bolum__baslik">Teslimat & bütçe</h4>';
        h += '<p class="it-bolum__alt">Şehir, termin ve bütçe tercihlerinizi belirtin.</p>';
        h += '<div class="it-alan it-alan--iki">';
        h += '<div><label class="form-label" for="itSehir">Şehir *</label>';
        h += '<select class="form-select" id="itSehir" data-it-field="sehir">' + sehirOptions('') + '</select>';
        h += '<div class="it-hata" data-it-error="sehir" hidden></div></div>';
        h += '<div><label class="form-label" for="itIlce">İlçe</label>';
        h += '<select class="form-select" id="itIlce" data-it-field="ilce">' + ilceOptions('', '') + '</select></div></div>';
        h += '<div class="it-alan it-alan--iki">';
        h += '<div><label class="form-label" for="itTermin">Teslim tarihi (önerilir)</label>';
        h += '<input class="form-input" type="date" id="itTermin" data-it-field="teslim_tarihi" min="' + minDate + '">';
        h += '<div class="it-hata" data-it-error="teslim_tarihi" hidden></div>';
        h += '<div class="it-uyari" id="itTerminUyari" hidden>Bu teslim süresi firmalar için yetersiz olabilir.</div></div>';
        h += '<div><label class="form-label">Teslim şekli</label>' + radioGroupHtml('teslim_sekli', TESLIM_SEKLI, 'gorusulecek') + '</div></div>';
        h += '<div class="it-alan"><label class="form-label">Bütçe tipi *</label>' + radioGroupHtml('butce_tipi', BUTCE_TIPI, 'teklif_bekliyorum') + '</div>';
        h += '<div class="it-butce-alanlari" id="itButceAlanlari" hidden>';
        h += '<div class="it-alan it-alan--iki">';
        h += '<div id="itButceMinKutu"><label class="form-label" for="itButceMin">Min. bütçe (₺)</label>';
        h += '<input class="form-input" type="number" id="itButceMin" data-it-field="butce_min" min="0" step="1" inputmode="numeric"></div>';
        h += '<div><label class="form-label" for="itButceMax" id="itButceMaxLabel">Max. bütçe (₺)</label>';
        h += '<input class="form-input" type="number" id="itButceMax" data-it-field="butce_max" min="0" step="1" inputmode="numeric"></div></div>';
        h += '<div class="it-hata" data-it-error="butce" hidden></div></div>';
        h += '<div class="it-alan"><label class="form-label">Bütçe görünürlüğü</label>' + radioGroupHtml('butce_gorunurlugu', BUTCE_GORUNURLUGU, 'dogrulanmis_firmalar') + '</div>';
        h += '<p class="it-yardim">Altın, taş veya diğer malzeme bedellerinin bütçeye dahil olup olmadığını açıklamada belirtin.</p>';
        h += '</section>';

        /* Gizlilik */
        h += '<section class="it-bolum" data-it-section="gizlilik">';
        h += '<h4 class="it-bolum__baslik">Gizlilik</h4>';
        h += '<p class="it-bolum__alt">Talebinizi kimlerin görebileceğini seçin.</p>';
        h += '<div class="it-alan"><label class="form-label">Görünürlük</label>' + radioGroupHtml('gorunurluk', GORUNURLUK, 'tum_dogrulanmis_firmalar') + '</div>';
        h += '<div class="it-alan"><label class="it-radyo" for="itSahipGizli"><input type="checkbox" id="itSahipGizli" data-it-field="sahip_gizli"><span>Firma adıma gizli yayınla (isteğe bağlı)</span></label>';
        h += '<p class="it-yardim">Gizli yayınlarda doğrulanmış firmalar işi görür; kimliğiniz teklif aşamasına kadar sınırlı kalabilir.</p></div>';
        h += '<div class="it-uyari">Teklif verme ve doğrulama akışı bir sonraki fazda tamamlanacaktır.</div>';
        h += '</section>';

        /* Önizleme */
        h += '<section class="it-bolum" data-it-section="onizleme">';
        h += '<h4 class="it-bolum__baslik">Önizleme</h4>';
        h += '<p class="it-bolum__alt">Yayınlamadan önce talebinizin firmalara nasıl görüneceğini kontrol edin.</p>';
        h += '<div class="it-onizleme-kart" id="itOnizlemeKart"></div>';
        h += '</section>';

        h += '<div class="it-basari" id="itBasari" hidden>';
        h += '<div class="it-basari__ikon" aria-hidden="true">✓</div>';
        h += '<h3>İş talebiniz yayınlandı</h3>';
        h += '<p id="itBasariMetin">Uygun firmalar talebinizi inceleyerek teklif gönderebilir.</p>';
        h += '<div class="it-basari__aksiyon">';
        h += '<button type="button" class="btn btn--primary" id="itBasariGoruntule">Talebi Görüntüle</button>';
        h += '<button type="button" class="btn btn--secondary" id="itBasariYeni">Yeni Talep Oluştur</button>';
        h += '<button type="button" class="btn btn--ghost" id="itBasariAna">Ana Sayfaya Dön</button>';
        h += '</div></div>';

        h += '<div class="it-aksiyon-bar" id="itAksiyonBar">';
        h += '<div class="it-aksiyon-bar__nav">';
        h += '<button type="button" class="btn btn--ghost" id="itPrevBtn">Geri</button>';
        h += '<button type="button" class="btn btn--secondary" id="itNextBtn">İleri</button></div>';
        h += '<div class="it-aksiyon-bar__sag">';
        h += '<button type="button" class="btn btn--ghost" id="itDraftBtn">Taslak Kaydet</button>';
        h += '<button type="button" class="btn btn--secondary" id="itPreviewBtn">Önizle</button>';
        h += '<button type="button" class="btn btn--primary" id="itPublishBtn">Yayınla</button></div></div>';

        h += '</div>';
        return h;
    }

    function ensureModalDom() {
        var modal = document.getElementById('isTalepModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'isTalepModal';
            modal.className = 'modal';
            modal.setAttribute('aria-hidden', 'true');
            modal.innerHTML = '<div class="modal__kutu modal__kutu--it" role="dialog" aria-modal="true" aria-labelledby="isTalepModalBaslik">' +
                '<button type="button" class="modal__kapat" data-modal-kapat="isTalepModal" aria-label="Kapat">×</button>' +
                '<div class="modal__baslik"><h3 id="isTalepModalBaslik">İş Talebi Oluştur</h3></div>' +
                '<div id="isTalepModalGovde"></div></div>';
            document.body.appendChild(modal);
        }
        var kutu = modal.querySelector('.modal__kutu');
        if (kutu) kutu.classList.add('modal__kutu--it');

        var oldForm = document.getElementById('isTalepForm');
        if (oldForm && !document.getElementById('isTalepModalGovde')) {
            oldForm.hidden = true;
            oldForm.style.display = 'none';
        }

        var govde = document.getElementById('isTalepModalGovde');
        if (!govde) {
            govde = document.createElement('div');
            govde.id = 'isTalepModalGovde';
            if (kutu) kutu.appendChild(govde);
            else modal.appendChild(govde);
        }
        if (!govde.querySelector('.it-wizard')) {
            govde.innerHTML = buildWizardHtml();
        }
        if (oldForm) {
            oldForm.hidden = true;
            oldForm.setAttribute('aria-hidden', 'true');
            try { oldForm.style.display = 'none'; } catch (e) { /* ignore */ }
        }

        var detay = document.getElementById('isTalepDetayModal');
        if (!detay) {
            detay = document.createElement('div');
            detay.id = 'isTalepDetayModal';
            detay.className = 'modal';
            detay.setAttribute('aria-hidden', 'true');
            detay.innerHTML = '<div class="modal__kutu modal__kutu--it" role="dialog" aria-modal="true">' +
                '<button type="button" class="modal__kapat" data-modal-kapat="isTalepDetayModal" aria-label="Kapat">×</button>' +
                '<div class="modal__baslik"><h3>İş Talebi Detayı</h3></div>' +
                '<div class="it-detay" id="isTalepDetayGovde"></div></div>';
            document.body.appendChild(detay);
            detay.addEventListener('click', function (ev) {
                var kapat = ev.target.closest('[data-modal-kapat="isTalepDetayModal"]');
                if (kapat || ev.target === detay) modalKapat('isTalepDetayModal');
            });
        }

        var taleplerim = document.getElementById('isTaleplerimModal');
        if (!taleplerim) {
            taleplerim = document.createElement('div');
            taleplerim.id = 'isTaleplerimModal';
            taleplerim.className = 'modal';
            taleplerim.setAttribute('aria-hidden', 'true');
            taleplerim.innerHTML = '<div class="modal__kutu modal__kutu--it" role="dialog" aria-modal="true">' +
                '<button type="button" class="modal__kapat" data-modal-kapat="isTaleplerimModal" aria-label="Kapat">×</button>' +
                '<div class="modal__baslik"><h3>Taleplerim</h3></div>' +
                '<div class="it-taleplerim" id="isTaleplerimGovde"></div></div>';
            document.body.appendChild(taleplerim);
            taleplerim.addEventListener('click', function (ev) {
                var kapat = ev.target.closest('[data-modal-kapat="isTaleplerimModal"]');
                if (kapat || ev.target === taleplerim) modalKapat('isTaleplerimModal');
            });
        }
        return modal;
    }

    function rootEl() {
        return document.getElementById('isTalepModalGovde') || document.getElementById('itWizard');
    }

    function setMode(mode) {
        state.mode = mode || 'form';
        var wizard = document.getElementById('itWizard');
        var basari = document.getElementById('itBasari');
        var bar = document.getElementById('itAksiyonBar');
        if (!wizard) return;
        if (state.mode === 'basari') {
            wizard.querySelectorAll('.it-bolum').forEach(function (el) { el.hidden = true; });
            if (basari) basari.hidden = false;
            if (bar) bar.hidden = true;
        } else {
            wizard.querySelectorAll('.it-bolum').forEach(function (el) { el.hidden = false; });
            if (basari) basari.hidden = true;
            if (bar) bar.hidden = false;
            syncStepUi();
        }
    }

    function syncStepUi() {
        var wizard = document.getElementById('itWizard');
        if (!wizard) return;
        var desktop = window.matchMedia('(min-width: 768px)').matches;
        wizard.classList.toggle('it-wizard--desktop', desktop);
        wizard.classList.toggle('it-wizard--mobile-steps', !desktop);
        var steps = wizard.querySelectorAll('.it-adim');
        var sections = wizard.querySelectorAll('.it-bolum');
        for (var i = 0; i < steps.length; i++) {
            steps[i].classList.toggle('it-adim--aktif', i === state.stepIndex);
            steps[i].classList.toggle('it-adim--done', i < state.stepIndex);
        }
        for (var j = 0; j < sections.length; j++) {
            sections[j].classList.toggle('it-bolum--aktif', j === state.stepIndex);
        }
        var prev = document.getElementById('itPrevBtn');
        var next = document.getElementById('itNextBtn');
        if (prev) prev.disabled = state.stepIndex <= 0;
        if (next) next.textContent = state.stepIndex >= SECTIONS.length - 1 ? 'Önizleme' : 'İleri';
        if (SECTIONS[state.stepIndex] === 'onizleme') renderPreviewCard();
        updateBudgetVisibility();
        updateGramGorunurVisibility();
    }

    function goStep(idx) {
        state.stepIndex = Math.max(0, Math.min(SECTIONS.length - 1, idx));
        syncStepUi();
    }

    function fieldEls(name) {
        var root = rootEl();
        if (!root) return [];
        return Array.prototype.slice.call(root.querySelectorAll('[data-it-field="' + name + '"]'));
    }

    function readField(name) {
        var els = fieldEls(name);
        if (!els.length) return '';
        var el = els[0];
        if (el.type === 'radio') {
            for (var i = 0; i < els.length; i++) {
                if (els[i].checked) return els[i].value;
            }
            return '';
        }
        if (el.type === 'checkbox') return !!el.checked;
        return el.value;
    }

    function writeField(name, value) {
        var els = fieldEls(name);
        if (!els.length) return;
        var el = els[0];
        if (el.type === 'radio') {
            for (var i = 0; i < els.length; i++) {
                els[i].checked = els[i].value === String(value);
            }
            return;
        }
        if (el.type === 'checkbox') {
            el.checked = !!value;
            return;
        }
        el.value = value == null ? '' : value;
    }

    function updateCounters() {
        var pairs = [
            ['baslik', 90],
            ['aciklama', 2000],
            ['teknik_bilgiler', 1000]
        ];
        for (var i = 0; i < pairs.length; i++) {
            var name = pairs[i][0];
            var max = pairs[i][1];
            var el = document.querySelector('[data-it-count="' + name + '"]');
            if (el) el.textContent = String(readField(name) || '').length + ' / ' + max;
        }
    }

    function showError(name, msg) {
        var el = document.querySelector('[data-it-error="' + name + '"]');
        if (!el) return;
        if (msg) {
            el.hidden = false;
            el.textContent = msg;
        } else {
            el.hidden = true;
            el.textContent = '';
        }
    }

    function clearErrors() {
        document.querySelectorAll('[data-it-error]').forEach(function (el) {
            el.hidden = true;
            el.textContent = '';
        });
    }

    function updateBudgetVisibility() {
        var tip = readField('butce_tipi') || (state.formData && state.formData.butce_tipi) || 'teklif_bekliyorum';
        var box = document.getElementById('itButceAlanlari');
        if (!box) return;
        var show = tip === 'tahmini' || tip === 'sabit';
        if (show) box.removeAttribute('hidden');
        else box.setAttribute('hidden', '');

        var minKutu = document.getElementById('itButceMinKutu');
        var maxLabel = document.getElementById('itButceMaxLabel');
        if (tip === 'sabit') {
            if (minKutu) minKutu.setAttribute('hidden', '');
            if (maxLabel) maxLabel.textContent = 'Sabit bütçe (₺)';
        } else {
            if (minKutu) minKutu.removeAttribute('hidden');
            if (maxLabel) maxLabel.textContent = 'Max. bütçe (₺)';
        }
    }

    function updateGramGorunurVisibility() {
        var gram = readField('tahmini_gram');
        var els = fieldEls('gram_gorunur');
        var hasVal = gram !== '' && gram != null && isFinite(Number(gram));
        els.forEach(function (el) {
            el.disabled = !hasVal;
            if (!hasVal) el.checked = false;
            var label = el.closest('.it-radyo');
            if (label) label.classList.toggle('is-disabled', !hasVal);
        });
    }

    function collectForm() {
        var data = emptyForm();
        Object.keys(data).forEach(function (k) {
            var v = readField(k);
            if (typeof data[k] === 'boolean') data[k] = !!v;
            else data[k] = v == null ? '' : v;
        });
        state.formData = data;
        return data;
    }

    function applyForm(data) {
        data = data || emptyForm();
        var merged = Object.assign(emptyForm(), data);
        var svc = global.AurixIsTalebiService;
        if (svc && typeof svc.normalizePayload === 'function') {
            var n = svc.normalizePayload({
                malzeme_saglayici: merged.malzeme_saglayici,
                tas_durumu: merged.tas_durumu,
                teslim_sekli: merged.teslim_sekli,
                aciliyet: merged.aciliyet,
                butce_tipi: merged.butce_tipi,
                butce_gorunurlugu: merged.butce_gorunurlugu,
                gorunurluk: merged.gorunurluk,
                dosya_gorunurlugu: merged.dosya_gorunurlugu
            });
            Object.keys(n).forEach(function (k) {
                if (k in merged && n[k] != null) merged[k] = n[k];
            });
            if (!merged.malzeme_saglayici) merged.malzeme_saglayici = 'gorusulecek';
            if (!merged.tas_durumu) merged.tas_durumu = 'yok';
            if (!merged.teslim_sekli) merged.teslim_sekli = 'gorusulecek';
        }
        state.formData = merged;
        Object.keys(state.formData).forEach(function (k) {
            writeField(k, state.formData[k]);
        });
        var sehir = state.formData.sehir;
        var ilceSel = document.getElementById('itIlce');
        if (ilceSel) ilceSel.innerHTML = ilceOptions(sehir, state.formData.ilce || '');
        updateCounters();
        updateBudgetVisibility();
        updateGramGorunurVisibility();
        renderFileList();
    }

    function validate(opts) {
        opts = opts || {};
        clearErrors();
        var d = collectForm();
        var ok = true;
        var firstSection = null;

        function fail(field, msg, section) {
            ok = false;
            showError(field, msg);
            if (firstSection == null) firstSection = section;
        }

        var baslik = String(d.baslik || '').trim();
        if (baslik.length < 5) fail('baslik', 'Başlık en az 5 karakter olmalı.', 'ozet');
        else if (baslik.length > 90) fail('baslik', 'Başlık en fazla 90 karakter olabilir.', 'ozet');

        if (!d.kategori) fail('kategori', 'İş kategorisi seçin.', 'ozet');
        if (!d.urun_turu) fail('urun_turu', 'Ürün türü seçin.', 'ozet');

        var aciklama = String(d.aciklama || '').trim();
        if (aciklama.length < 40) fail('aciklama', 'Açıklama en az 40 karakter olmalı.', 'detay');
        else if (aciklama.length > 2000) fail('aciklama', 'Açıklama en fazla 2000 karakter olabilir.', 'detay');

        var teknik = String(d.teknik_bilgiler || '');
        if (teknik.length > 1000) fail('aciklama', 'Teknik notlar en fazla 1000 karakter olabilir.', 'detay');

        if (!opts.draftOnly) {
            if (!d.sehir) fail('sehir', 'Şehir seçin.', 'teslimat');
            if (d.teslim_tarihi && d.teslim_tarihi < todayISO()) fail('teslim_tarihi', 'Teslim tarihi geçmiş olamaz.', 'teslimat');

            if (d.tahmini_gram !== '' && d.tahmini_gram != null) {
                var gram = Number(d.tahmini_gram);
                if (!isFinite(gram) || gram < 0) fail('aciklama', 'Tahmini gram 0 veya daha büyük olmalı.', 'detay');
            }

            if (d.butce_tipi === 'tahmini') {
                var mn = Number(d.butce_min);
                var mx = Number(d.butce_max);
                if (!isFinite(mn) || !isFinite(mx) || mn < 0 || mx < 0) fail('butce', 'Tahmini bütçe için geçerli min/max girin.', 'teslimat');
                else if (mx < mn) fail('butce', 'Maksimum bütçe minimumdan küçük olamaz.', 'teslimat');
            }
            if (d.butce_tipi === 'sabit') {
                var sabit = Number(d.butce_max || d.butce_min);
                if (!isFinite(sabit) || sabit <= 0) fail('butce', 'Sabit bütçe için geçerli tutar girin.', 'teslimat');
            }
        }

        var total = 0;
        for (var i = 0; i < state.localFiles.length; i++) total += (state.localFiles[i].file && state.localFiles[i].file.size) || 0;
        if (state.localFiles.length > MAX_FILES) fail('dosyalar', 'En fazla 10 dosya ekleyebilirsiniz.', 'dosyalar');
        if (total > MAX_TOTAL_BYTES) fail('dosyalar', 'Toplam dosya boyutu 100 MB sınırını aşıyor.', 'dosyalar');

        if (!ok && firstSection && !opts.silent) {
            var idx = SECTIONS.indexOf(firstSection);
            if (idx >= 0) goStep(idx);
        }
        return { ok: ok, data: d, firstSection: firstSection };
    }

    function pruneDrafts() {
        var list = lsGet(LS_DRAFTS, []);
        if (!Array.isArray(list)) list = [];
        var cut = Date.now() - DRAFT_MAX_DAYS * 24 * 60 * 60 * 1000;
        list = list.filter(function (d) {
            var t = Date.parse(d && d.updatedAt);
            return isFinite(t) && t >= cut;
        });
        lsSet(LS_DRAFTS, list);
        return list;
    }

    function upsertDraftList(data) {
        var list = pruneDrafts();
        var id = state.istemciAnahtar || uuid();
        state.istemciAnahtar = id;
        var row = { id: id, updatedAt: new Date().toISOString(), data: data };
        var found = false;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { list[i] = row; found = true; break; }
        }
        if (!found) list.unshift(row);
        if (list.length > 20) list = list.slice(0, 20);
        lsSet(LS_DRAFTS, list);
    }

    function removeDraftFromList(id) {
        if (!id) return;
        var list = pruneDrafts().filter(function (d) { return d.id !== id; });
        lsSet(LS_DRAFTS, list);
    }

    function setTaslakDurum(msg) {
        var el = document.getElementById('itTaslakDurum');
        if (el) el.textContent = msg || '';
    }

    function scheduleAutosave() {
        state.dirty = true;
        if (state.draftTimer) clearTimeout(state.draftTimer);
        state.draftTimer = setTimeout(function () {
            var data = collectForm();
            lsSet(LS_AUTOSAVE, { updatedAt: new Date().toISOString(), data: data, istemciAnahtar: state.istemciAnahtar });
            upsertDraftList(data);
            setTaslakDurum('Taslak kaydedildi');
        }, AUTOSAVE_MS);
    }

    function renderFileList() {
        var box = document.getElementById('itDosyaListesi');
        if (!box) return;
        if (!state.localFiles.length) {
            box.innerHTML = '';
            return;
        }
        var h = '';
        for (var i = 0; i < state.localFiles.length; i++) {
            var f = state.localFiles[i];
            var name = (f.file && f.file.name) || 'dosya';
            var size = formatBytes(f.file && f.file.size);
            var prog = Math.max(0, Math.min(100, Number(f.progress) || 0));
            h += '<div class="it-dosya" data-local-id="' + esc(f.localId) + '">';
            h += '<div class="it-dosya__onizleme">';
            if (f.previewUrl) h += '<img src="' + esc(f.previewUrl) + '" alt="">';
            else h += '<span>DOSYA</span>';
            h += '</div><div class="it-dosya__meta"><strong>' + esc(name) + '</strong><span>' + esc(size) + '</span>';
            h += '<div class="it-dosya__progress"><i style="width:' + prog + '%"></i></div></div>';
            h += '<button type="button" class="it-dosya__sil" data-it-remove="' + esc(f.localId) + '" aria-label="Kaldır">×</button></div>';
        }
        box.innerHTML = h;
    }

    function addFiles(fileList) {
        var arr = Array.prototype.slice.call(fileList || []);
        var s = svc();
        for (var i = 0; i < arr.length; i++) {
            if (state.localFiles.length >= MAX_FILES) {
                toast('En fazla 10 dosya ekleyebilirsiniz.', 'error');
                break;
            }
            var file = arr[i];
            var check = s && typeof s.validateFile === 'function' ? s.validateFile(file) : { ok: true };
            if (!check.ok) {
                toast(check.error || 'Geçersiz dosya.', 'error');
                continue;
            }
            var total = state.localFiles.reduce(function (a, x) { return a + ((x.file && x.file.size) || 0); }, 0) + (file.size || 0);
            if (total > MAX_TOTAL_BYTES) {
                toast('Toplam dosya boyutu 100 MB sınırını aşıyor.', 'error');
                break;
            }
            var localId = uuid();
            var previewUrl = null;
            if (file.type && file.type.indexOf('image/') === 0) {
                try { previewUrl = URL.createObjectURL(file); } catch (e) { previewUrl = null; }
            }
            state.localFiles.push({ localId: localId, file: file, previewUrl: previewUrl, progress: 0, remoteId: null });
        }
        renderFileList();
        scheduleAutosave();
    }

    function removeFile(localId) {
        state.localFiles = state.localFiles.filter(function (f) {
            if (f.localId === localId) {
                if (f.previewUrl) {
                    try { URL.revokeObjectURL(f.previewUrl); } catch (e) { /* ignore */ }
                }
                return false;
            }
            return true;
        });
        renderFileList();
        scheduleAutosave();
    }

    function renderPreviewCard() {
        var d = collectForm();
        var el = document.getElementById('itOnizlemeKart');
        if (!el) return;
        var butce = 'Teklif bekleniyor';
        if (d.butce_tipi === 'tahmini') {
            butce = formatMoneyTR(d.butce_min, d.para_birimi) + ' – ' + formatMoneyTR(d.butce_max, d.para_birimi);
        } else if (d.butce_tipi === 'sabit') {
            butce = formatMoneyTR(d.butce_max || d.butce_min, d.para_birimi);
        }
        var h = '<h4>' + esc(d.baslik || 'Başlıksız talep') + '</h4>';
        h += '<p>' + esc(d.aciklama || '') + '</p>';
        h += '<dl>';
        h += '<dt>Kategori</dt><dd>' + esc(labelFor(IS_KATEGORILERI, d.kategori)) + '</dd>';
        h += '<dt>Ürün</dt><dd>' + esc(labelFor(URUN_TURLERI, d.urun_turu)) + '</dd>';
        h += '<dt>Malzeme</dt><dd>' + esc(labelFor(MALZEMELER, d.malzeme)) + '</dd>';
        h += '<dt>Konum</dt><dd>' + esc([d.sehir, d.ilce].filter(Boolean).join(' / ') || '—') + '</dd>';
        h += '<dt>Teslim</dt><dd>' + esc(d.teslim_tarihi || '—') + ' · ' + esc(labelFor(TESLIM_SEKLI, d.teslim_sekli)) + '</dd>';
        h += '<dt>Aciliyet</dt><dd>' + esc(labelFor(ACILIYET, d.aciliyet)) + '</dd>';
        h += '<dt>Bütçe</dt><dd>' + esc(butce) + '</dd>';
        h += '<dt>Dosya</dt><dd>' + state.localFiles.length + ' dosya</dd>';
        h += '</dl>';
        el.innerHTML = h;
    }

    function showPreview() {
        var v = validate({ silent: false });
        if (!v.ok) {
            toast('Önizleme için zorunlu alanları tamamlayın.', 'error');
            return;
        }
        goStep(SECTIONS.indexOf('onizleme'));
        renderPreviewCard();
        state.mode = 'onizleme';
    }

    function payloadFromForm(data, durum, opts) {
        opts = opts || {};
        var yayinla = !!opts.yayinla;
        var butceMin = data.butce_min === '' || data.butce_min == null ? null : Number(data.butce_min);
        var butceMax = data.butce_max === '' || data.butce_max == null ? null : Number(data.butce_max);
        if (data.butce_tipi === 'sabit' && (butceMax == null || !isFinite(butceMax))) butceMax = butceMin;
        if (data.butce_tipi === 'teklif_bekliyorum') { butceMin = null; butceMax = null; }
        var raw = {
            id: state.talepId || undefined,
            istemci_anahtar: state.istemciAnahtar,
            durum: durum,
            yayinla: yayinla,
            mod: yayinla ? 'yayinla' : 'taslak',
            baslik: String(data.baslik || '').trim(),
            kategori: labelFor(IS_KATEGORILERI, data.kategori) || data.kategori,
            kategori_slug: data.kategori || null,
            urun_turu: labelFor(URUN_TURLERI, data.urun_turu) || data.urun_turu,
            adet: data.adet || null,
            aciklama: String(data.aciklama || '').trim(),
            teknik_bilgiler: String(data.teknik_bilgiler || '').trim() || null,
            malzeme: data.malzeme ? (labelFor(MALZEMELER, data.malzeme) || data.malzeme) : null,
            malzeme_saglayici: data.malzeme_saglayici,
            tahmini_gram: (data.tahmini_gram === '' || data.tahmini_gram == null) ? null : Number(data.tahmini_gram),
            gram_gorunur: !!data.gram_gorunur,
            tas_durumu: data.tas_durumu,
            sehir: data.sehir === '__turkiye__' ? 'Türkiye geneli' : data.sehir,
            ilce: data.ilce === '__fark_etmez__' ? 'Fark etmez' : (data.ilce || null),
            teslim_tarihi: data.teslim_tarihi,
            aciliyet: data.aciliyet,
            teslim_sekli: data.teslim_sekli,
            butce_tipi: data.butce_tipi,
            butce_min: butceMin,
            butce_max: butceMax,
            para_birimi: data.para_birimi || 'TRY',
            butce_gorunurlugu: data.butce_gorunurlugu,
            gorunurluk: data.gorunurluk,
            dosya_gorunurlugu: data.dosya_gorunurlugu,
            sahip_gizli: !!data.sahip_gizli
        };
        var svc = global.AurixIsTalebiService;
        if (svc && typeof svc.normalizePayload === 'function') {
            return svc.normalizePayload(raw);
        }
        return raw;
    }

    function saveDraft() {
        var data = collectForm();
        if (!state.istemciAnahtar) state.istemciAnahtar = uuid();
        lsSet(LS_AUTOSAVE, { updatedAt: new Date().toISOString(), data: data, istemciAnahtar: state.istemciAnahtar });
        upsertDraftList(data);
        setTaslakDurum('Taslak kaydedildi');
        state.dirty = false;

        if (!isLoggedIn()) {
            toast('Taslak cihazınıza kaydedildi. Yayınlamak için giriş yapın.', 'info');
            return Promise.resolve({ ok: true, local: true });
        }
        var s = svc();
        if (!s || typeof s.kaydet !== 'function') {
            toast('Taslak yerel olarak kaydedildi.', 'info');
            return Promise.resolve({ ok: true, local: true });
        }
        var payload = payloadFromForm(data, 'taslak', { yayinla: false });
        return s.kaydet(payload).then(function (res) {
            if (res && res.ok) {
                state.talepId = res.id || state.talepId;
                toast('Taslak kaydedildi.', 'success');
                return res;
            }
            toast((res && res.error) || 'Taslak sunucuya kaydedilemedi; yerel kopya duruyor.', 'error');
            return res || { ok: false };
        }).catch(function () {
            toast('Taslak sunucuya kaydedilemedi; yerel kopya duruyor.', 'error');
            return { ok: false };
        });
    }

    function uploadPendingFiles(talepId) {
        var s = svc();
        if (!s || typeof s.dosyaYukle !== 'function') return Promise.resolve({ ok: true });
        var chain = Promise.resolve({ ok: true });
        state.localFiles.forEach(function (f) {
            if (f.remoteId) return;
            chain = chain.then(function () {
                return s.dosyaYukle({
                    file: f.file,
                    talepId: talepId,
                    onProgress: function (p) {
                        f.progress = p;
                        renderFileList();
                    }
                }).then(function (res) {
                    if (res && res.ok) {
                        f.progress = 100;
                        f.remoteId = (res.data && (res.data.id || res.data.dosya_id)) || res.id || true;
                    } else {
                        toast((res && res.error) || ('Dosya yüklenemedi: ' + ((f.file && f.file.name) || '')), 'error');
                    }
                    renderFileList();
                    return res;
                });
            });
        });
        return chain;
    }

    function publish() {
        if (state.publishing) return Promise.resolve({ ok: false, error: 'busy' });
        if (!isLoggedIn()) {
            var dataPend = collectForm();
            if (!state.istemciAnahtar) state.istemciAnahtar = uuid();
            lsSet(LS_PENDING, { data: dataPend, istemciAnahtar: state.istemciAnahtar, filesMeta: state.localFiles.map(function (f) { return f.file && f.file.name; }) });
            lsSetRaw(LS_PENDING_FLAG, '1');
            toast('Yayınlamak için giriş yapmanız gerekir.', 'info');
            openAuthModal();
            return Promise.resolve({ ok: false, needsAuth: true });
        }
        var v = validate();
        if (!v.ok) {
            toast('Yayınlamadan önce eksikleri tamamlayın.', 'error');
            return Promise.resolve({ ok: false, error: 'validation' });
        }
        if (!state.istemciAnahtar) state.istemciAnahtar = uuid();
        state.publishing = true;
        var btn = document.getElementById('itPublishBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Yayınlanıyor…'; }
        var s = svc();
        var payload = payloadFromForm(v.data, 'teklif_bekliyor', { yayinla: true });

        var done = function (res) {
            state.publishing = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Yayınla'; }
            return res;
        };

        if (!s || typeof s.kaydet !== 'function') {
            if (demoModAktifMi()) {
                state.talepId = 'demo-' + uuid().slice(0, 8);
                state.dirty = false;
                setMode('basari');
                toast('Demo modunda talep yayınlandı gibi gösterildi.', 'success');
                return Promise.resolve(done({ ok: true, demo: true, id: state.talepId }));
            }
            toast('İş talebi servisi hazır değil.', 'error');
            return Promise.resolve(done({ ok: false }));
        }

        return s.kaydet(payload).then(function (res) {
            if (!res || !res.ok) {
                toast((res && res.error) || 'Yayınlama başarısız.', 'error');
                return done(res || { ok: false });
            }
            var d = res.data || res;
            var durum = String(res.durum || d.durum || '');
            var yayinlandi = d.yayinlandi === true
                || (durum === 'teklif_bekliyor' && d.yayinlanma_tarihi);
            if (!yayinlandi && durum !== 'teklif_bekliyor') {
                toast('Talep kaydedildi ancak henüz yayında görünmüyor. Lütfen tekrar deneyin.', 'error');
                return done({ ok: false, error: 'not_published', data: d });
            }
            state.talepId = res.id || state.talepId;
            return uploadPendingFiles(state.talepId).then(function () {
                state.dirty = false;
                try {
                    localStorage.removeItem(LS_PENDING);
                    localStorage.removeItem(LS_PENDING_FLAG);
                    /* KRİTİK: yayınlanan kaydın istemci_anahtar'ı autosave/taslak
                       listesinde kalmasın; aksi halde bir sonraki "Yeni Talep"
                       açılışında bu YAYINDAKİ kayıt taslak olarak yeniden hedeflenir
                       ve sessizce taslağa düşürülebilir. */
                    localStorage.removeItem(LS_AUTOSAVE);
                    removeDraftFromList(state.istemciAnahtar);
                } catch (e) { /* ignore */ }
                state.istemciAnahtar = uuid();
                setMode('basari');
                toast('İş talebiniz yayınlandı.', 'success');
                try {
                    document.dispatchEvent(new CustomEvent('aurix:is-talebi-yayinlandi', {
                        detail: { id: state.talepId, durum: 'teklif_bekliyor' }
                    }));
                } catch (e2) { /* ignore */ }
                try {
                    if (global.Aurix && typeof Aurix.yukleAcikIsTalepleri === 'function') {
                        Aurix.yukleAcikIsTalepleri();
                    }
                } catch (e3) { /* ignore */ }
                return done(res);
            });
        }).catch(function (err) {
            try {
                if (typeof console !== 'undefined' && console.warn) console.warn('[is-talebi publish]', err);
            } catch (eLog) { /* ignore */ }
            toast('İş talebi bilgileri kaydedilirken bir uyumsuzluk oluştu. Lütfen tekrar deneyin.', 'error');
            return done({ ok: false, error: 'publish_failed' });
        });
    }

    var OWNER_ISLEM_ONAY = {
        yayindan_kaldir: 'Talep taslağa alınacak ve açık listeden kaldırılacak. Onaylıyor musunuz?',
        iptal: 'Talep iptal edilecek. Bu işlem geri alınamaz. Onaylıyor musunuz?',
        arsiv: 'Talep arşivlenecek. Onaylıyor musunuz?',
        sil: 'Taslak kalıcı olarak silinecek. Onaylıyor musunuz?'
    };

    function buildOwnerActionsHtml(t) {
        var durum = t.durum;
        var h = '<div class="it-sahip-aksiyon">';
        if (durum === 'taslak') {
            h += '<button type="button" class="btn btn--primary" data-it-owner-edit="' + esc(t.id) + '">Düzenle</button>';
            h += '<button type="button" class="btn btn--secondary" data-it-owner-islem="sil" data-it-owner-id="' + esc(t.id) + '">Sil</button>';
        } else if (durum === 'teklif_bekliyor' || durum === 'Acik') {
            h += '<button type="button" class="btn btn--primary" data-it-owner-edit="' + esc(t.id) + '">Düzenle</button>';
            h += '<button type="button" class="btn btn--secondary" data-it-owner-islem="yayindan_kaldir" data-it-owner-id="' + esc(t.id) + '">Yayından Kaldır</button>';
            h += '<button type="button" class="btn btn--ghost" data-it-owner-islem="iptal" data-it-owner-id="' + esc(t.id) + '">İptal Et</button>';
        } else if (durum === 'iptal_edildi' || durum === 'Iptal') {
            h += '<button type="button" class="btn btn--secondary" data-it-owner-islem="arsiv" data-it-owner-id="' + esc(t.id) + '">Arşivle</button>';
            h += '<p class="it-yardim">Talep iptal edilmiş. Yalnızca görüntüleyebilir veya arşivleyebilirsiniz.</p>';
        } else if (durum === 'tamamlandi' || durum === 'Tamamlandi') {
            h += '<p class="it-yardim">Talep tamamlanmış. Yalnızca görüntüleyebilirsiniz.</p>';
        } else {
            h += '<p class="it-yardim">Bu talep şu an düzenlenemez (' + esc(durum || '—') + ').</p>';
        }
        h += '</div>';
        return h;
    }

    function bindOwnerActionButtons(govde, id) {
        var editBtn = govde.querySelector('[data-it-owner-edit]');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                modalKapat('isTalepDetayModal');
                openEditById(id);
            });
        }
        var islemBtns = govde.querySelectorAll('[data-it-owner-islem]');
        islemBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var islem = btn.getAttribute('data-it-owner-islem');
                var pid = btn.getAttribute('data-it-owner-id');
                var onay = OWNER_ISLEM_ONAY[islem] || 'Bu işlemi yapmak istediğinize emin misiniz?';
                if (!window.confirm(onay)) return;
                var s = svc();
                if (!s || typeof s.sahipIslem !== 'function') return;
                btn.disabled = true;
                s.sahipIslem(pid, islem).then(function (res) {
                    if (!res || !res.ok) {
                        toast((res && res.error) || 'İşlem yapılamadı.', 'error');
                        btn.disabled = false;
                        return;
                    }
                    toast('İşlem tamamlandı.', 'success');
                    modalKapat('isTalepDetayModal');
                    try {
                        if (global.Aurix && typeof Aurix.yukleAcikIsTalepleri === 'function') {
                            Aurix.yukleAcikIsTalepleri();
                        }
                    } catch (e) { /* ignore */ }
                }).catch(function () {
                    toast('İşlem yapılamadı. Lütfen tekrar deneyin.', 'error');
                    btn.disabled = false;
                });
            });
        });
    }

    function openEditById(id, opts) {
        opts = opts || {};
        var s = svc();
        if (!s || typeof s.detay !== 'function') return;
        s.detay(id).then(function (res) {
            if (!res || !res.ok || !res.data) {
                toast('Talep yüklenemedi.', 'error');
                return;
            }
            var t = res.data;
            openCreate({ useAutosave: false });
            state.talepId = t.id;
            state.istemciAnahtar = t.istemci_anahtar || uuid();
            applyForm(t);
            state.dirty = false;
            if (opts.gotoPreview) showPreview();
        });
    }

    function openTaleplerim() {
        if (!isLoggedIn()) {
            toast('Taleplerinizi görmek için giriş yapmanız gerekir.', 'info');
            openAuthModal();
            return;
        }
        ensureModalDom();
        var govde = document.getElementById('isTaleplerimGovde');
        if (!govde) return;
        govde.innerHTML = '<p class="it-yardim">Yükleniyor…</p>';
        modalAc('isTaleplerimModal');

        var s = svc();
        if (!s || typeof s.taleplerim !== 'function') {
            govde.innerHTML = '<p class="it-hata">Taleplerim servisi hazır değil.</p>';
            return;
        }
        s.taleplerim({}).then(function (res) {
            if (!res || !res.ok) {
                govde.innerHTML = '<p class="it-hata">' + esc((res && res.error) || 'Talepleriniz yüklenemedi.') + '</p>';
                return;
            }
            renderTaleplerimList(govde, Array.isArray(res.data) ? res.data : []);
        }).catch(function () {
            govde.innerHTML = '<p class="it-hata">Talepleriniz yüklenemedi.</p>';
        });
    }

    var TALEP_DURUM_ETIKET = {
        taslak: 'Taslak',
        teklif_bekliyor: 'Yayında',
        Acik: 'Yayında',
        teklif_secildi: 'Teklif Seçildi',
        is_emri_olusturuldu: 'İş Emri Oluşturuldu',
        uretimde: 'Üretimde',
        tamamlandi: 'Tamamlandı',
        Tamamlandi: 'Tamamlandı',
        iptal_edildi: 'İptal Edildi',
        Iptal: 'İptal Edildi',
        arsivlendi: 'Arşivlendi'
    };

    function renderTaleplerimList(govde, items) {
        if (!items.length) {
            govde.innerHTML = '<p class="it-yardim">Henüz bir iş talebiniz yok.</p>' +
                '<button type="button" class="btn btn--primary" id="itTaleplerimYeniBtn">İlk iş talebini oluştur</button>';
            var yeniBtn = govde.querySelector('#itTaleplerimYeniBtn');
            if (yeniBtn) {
                yeniBtn.addEventListener('click', function () {
                    modalKapat('isTaleplerimModal');
                    openCreate();
                });
            }
            return;
        }
        var h = '<div class="it-taleplerim-liste">';
        items.forEach(function (t) {
            var etiket = TALEP_DURUM_ETIKET[t.durum] || t.durum || '—';
            var guncelleme = t.guncellenme_tarihi || t.created_at;
            h += '<div class="it-taleplerim-satir" data-it-tp-id="' + esc(t.id) + '">';
            h += '<div class="it-taleplerim-satir__bilgi">';
            h += '<b>' + esc(t.baslik || 'Başlıksız talep') + '</b>';
            h += '<span class="it-badge">' + esc(etiket) + '</span>';
            h += '<span class="it-yardim">Son güncelleme: ' + esc(formatTarihGoreliTR(guncelleme)) + '</span>';
            h += '</div>';
            h += '<div class="it-taleplerim-satir__aksiyon">';
            if (t.durum === 'taslak') {
                h += '<button type="button" class="btn btn--ghost btn--sm" data-it-tp-edit="' + esc(t.id) + '">Düzenle</button>';
                h += '<button type="button" class="btn btn--primary btn--sm" data-it-tp-publish="' + esc(t.id) + '">Yayınla</button>';
                h += '<button type="button" class="btn btn--ghost btn--sm" data-it-tp-sil="' + esc(t.id) + '">Sil</button>';
            } else if (t.durum === 'teklif_bekliyor' || t.durum === 'Acik') {
                h += '<button type="button" class="btn btn--ghost btn--sm" data-it-tp-detay="' + esc(t.id) + '">Görüntüle</button>';
            } else {
                h += '<button type="button" class="btn btn--ghost btn--sm" data-it-tp-detay="' + esc(t.id) + '">Görüntüle</button>';
            }
            h += '</div></div>';
        });
        h += '</div>';
        govde.innerHTML = h;

        govde.querySelectorAll('[data-it-tp-edit]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                modalKapat('isTaleplerimModal');
                openEditById(btn.getAttribute('data-it-tp-edit'));
            });
        });
        govde.querySelectorAll('[data-it-tp-publish]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                modalKapat('isTaleplerimModal');
                openEditById(btn.getAttribute('data-it-tp-publish'), { gotoPreview: true });
            });
        });
        govde.querySelectorAll('[data-it-tp-detay]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                modalKapat('isTaleplerimModal');
                openDetail(btn.getAttribute('data-it-tp-detay'));
            });
        });
        govde.querySelectorAll('[data-it-tp-sil]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (!window.confirm('Taslak kalıcı olarak silinecek. Onaylıyor musunuz?')) return;
                var s = svc();
                if (!s || typeof s.sahipIslem !== 'function') return;
                var pid = btn.getAttribute('data-it-tp-sil');
                s.sahipIslem(pid, 'sil').then(function (res) {
                    if (!res || !res.ok) {
                        toast((res && res.error) || 'Taslak silinemedi.', 'error');
                        return;
                    }
                    toast('Taslak silindi.', 'success');
                    openTaleplerim();
                });
            });
        });
    }

    function formatTarihGoreliTR(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        try {
            return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) {
            return d.toISOString().slice(0, 10);
        }
    }

    function openDetail(id) {
        ensureModalDom();
        var govde = document.getElementById('isTalepDetayGovde');
        if (!govde) return;
        govde.innerHTML = '<p class="it-yardim">Yükleniyor…</p>';
        modalAc('isTalepDetayModal');

        var finish = function (t) {
            if (!t) {
                govde.innerHTML = '<p class="it-hata">Talep bulunamadı.</p>';
                return;
            }
            var badgeCls = 'it-badge';
            if (t.aciliyet === 'acil') badgeCls += ' it-badge--acil';
            else if (t.aciliyet === 'oncelikli') badgeCls += ' it-badge--oncelikli';
            else badgeCls += ' it-badge--standart';
            var h = '<div class="it-detay__ust">';
            h += '<h3>' + esc(t.baslik || 'İş talebi') + '</h3>';
            h += '<div class="it-detay__metrikler">';
            h += '<span class="it-badge">' + esc(labelFor(IS_KATEGORILERI, t.kategori) || t.kategori || '—') + '</span>';
            h += '<span class="' + badgeCls + '">' + esc(labelFor(ACILIYET, t.aciliyet) || t.aciliyet || '—') + '</span>';
            h += '<span class="it-badge">' + esc([t.sehir, t.ilce].filter(Boolean).join(' / ') || '—') + '</span>';
            if (t._kaynak === 'demo') h += '<span class="it-badge">Demo</span>';
            h += '</div></div>';
            h += '<div class="it-detay__govde">' + esc(t.aciklama || '') + '</div>';
            h += '<dl class="it-onizleme-kart" style="margin-top:14px">';
            h += '<dt>Ürün</dt><dd>' + esc(labelFor(URUN_TURLERI, t.urun_turu) || t.urun_turu || '—') + '</dd>';
            h += '<dt>Teslim</dt><dd>' + esc(t.teslim_tarihi || '—') + '</dd>';
            h += '<dt>Durum</dt><dd>' + esc(t.durum || '—') + '</dd></dl>';
            h += '<div class="it-detay__aksiyon">';
            if (t.sahip_mi) {
                h += buildOwnerActionsHtml(t);
            } else {
                h += '<button type="button" class="btn btn--primary" disabled title="Sonraki faz">Teklif Ver</button>';
                h += '<p class="it-yardim">Teklif verme, firma doğrulaması tamamlandıktan sonraki fazda açılacak.</p>';
            }
            h += '</div>';
            govde.innerHTML = h;
            bindOwnerActionButtons(govde, t.id);
        };

        var demos = getDemoTalepler();
        for (var i = 0; i < demos.length; i++) {
            if (String(demos[i].id) === String(id)) {
                finish(demos[i]);
                return;
            }
        }

        var s = svc();
        if (!s || typeof s.detay !== 'function') {
            finish(null);
            return;
        }
        s.detay(id).then(function (res) {
            if (res && res.ok) finish(res.data || res);
            else finish(null);
        }).catch(function () { finish(null); });
    }

    function enhanceListCards(container) {
        var root = container || document;
        var cards = root.querySelectorAll('.it-kart');
        cards.forEach(function (card) {
            if (card.getAttribute('data-it-enhanced') === '1') return;
            card.setAttribute('data-it-enhanced', '1');
            card.addEventListener('click', function (ev) {
                var id = card.getAttribute('data-it-id') || card.getAttribute('data-id');
                if (!id) return;
                ev.preventDefault();
                openDetail(id);
            });
        });
    }

    function beforeClose() {
        if (!state.dirty || state.mode === 'basari') return true;
        return window.confirm('Kaydedilmemiş değişiklikler var. Kapatmak istiyor musunuz?');
    }

    function resetState(restore) {
        state.localFiles.forEach(function (f) {
            if (f.previewUrl) {
                try { URL.revokeObjectURL(f.previewUrl); } catch (e) { /* ignore */ }
            }
        });
        state.localFiles = [];
        state.stepIndex = 0;
        state.dirty = false;
        state.publishing = false;
        state.talepId = null;
        state.mode = 'form';
        if (restore && restore.data) {
            state.istemciAnahtar = restore.istemciAnahtar || uuid();
            applyForm(restore.data);
        } else {
            state.istemciAnahtar = uuid();
            applyForm(emptyForm());
        }
        setMode('form');
        syncStepUi();
        setTaslakDurum('');
    }

    function bindOnce() {
        if (state.bound) return;
        var govde = document.getElementById('isTalepModalGovde');
        if (!govde) return;
        state.bound = true;

        govde.addEventListener('input', function (ev) {
            var t = ev.target;
            if (!t || !t.getAttribute('data-it-field')) return;
            updateCounters();
            updateBudgetVisibility();
            if (t.getAttribute('data-it-field') === 'tahmini_gram') updateGramGorunurVisibility();
            scheduleAutosave();
        });
        govde.addEventListener('change', function (ev) {
            var t = ev.target;
            if (!t) return;
            if (t.id === 'itSehir') {
                var ilceSel = document.getElementById('itIlce');
                if (ilceSel) ilceSel.innerHTML = ilceOptions(t.value, '');
            }
            if (t.id === 'itAciliyet' || (t.getAttribute('data-it-field') === 'aciliyet')) {
                var uy = document.getElementById('itAcilUyari');
                if (uy) uy.hidden = (readField('aciliyet') !== 'acil');
            }
            if (t.id === 'itTermin' || t.getAttribute('data-it-field') === 'teslim_tarihi') {
                var tu = document.getElementById('itTerminUyari');
                if (tu) {
                    var val = readField('teslim_tarihi');
                    var warn = false;
                    if (val) {
                        var d0 = new Date(val + 'T12:00:00');
                        var now = new Date();
                        var diff = (d0 - now) / (1000 * 60 * 60 * 24);
                        warn = diff >= 0 && diff <= 3;
                    }
                    tu.hidden = !warn;
                }
            }
            if (t.getAttribute('data-it-field')) {
                updateBudgetVisibility();
                scheduleAutosave();
            }
        });
        govde.addEventListener('click', function (ev) {
            var t = ev.target;
            if (!t) return;
            var stepBtn = t.closest('[data-it-step]');
            if (stepBtn) {
                goStep(Number(stepBtn.getAttribute('data-it-step')));
                return;
            }
            var rem = t.closest('[data-it-remove]');
            if (rem) {
                removeFile(rem.getAttribute('data-it-remove'));
                return;
            }
            if (t.id === 'itDropzone' || t.closest('#itDropzone')) {
                var inp = document.getElementById('itFileInput');
                if (inp) inp.click();
            }
            if (t.id === 'itPrevBtn') goStep(state.stepIndex - 1);
            if (t.id === 'itNextBtn') {
                if (state.stepIndex >= SECTIONS.length - 1) showPreview();
                else goStep(state.stepIndex + 1);
            }
            if (t.id === 'itDraftBtn') saveDraft();
            if (t.id === 'itPreviewBtn') showPreview();
            if (t.id === 'itPublishBtn') publish();
            if (t.id === 'itBasariGoruntule') {
                state.dirty = false;
                modalKapat('isTalepModal');
                if (state.talepId) openDetail(state.talepId);
            }
            if (t.id === 'itBasariYeni') {
                resetState();
                setMode('form');
            }
            if (t.id === 'itBasariAna') {
                state.dirty = false;
                modalKapat('isTalepModal');
                try {
                    if (global.Aurix && typeof Aurix.sayfaGoster === 'function') {
                        Aurix.sayfaGoster('ana');
                    } else {
                        location.hash = '';
                        window.scrollTo(0, 0);
                    }
                } catch (eAna) {
                    location.hash = '';
                    window.scrollTo(0, 0);
                }
            }
        });

        var drop = document.getElementById('itDropzone');
        var fileInput = document.getElementById('itFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                addFiles(fileInput.files);
                fileInput.value = '';
            });
        }
        if (drop) {
            ['dragenter', 'dragover'].forEach(function (evt) {
                drop.addEventListener(evt, function (e) {
                    e.preventDefault();
                    drop.classList.add('it-dropzone--aktif');
                });
            });
            ['dragleave', 'drop'].forEach(function (evt) {
                drop.addEventListener(evt, function (e) {
                    e.preventDefault();
                    drop.classList.remove('it-dropzone--aktif');
                    if (evt === 'drop' && e.dataTransfer) addFiles(e.dataTransfer.files);
                });
            });
        }

        var modal = document.getElementById('isTalepModal');
        if (modal) {
            modal.addEventListener('click', function (ev) {
                var kapat = ev.target.closest('[data-modal-kapat="isTalepModal"]');
                if (!kapat && ev.target !== modal) return;
                if (ev.target === modal || kapat) {
                    if (!beforeClose()) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        return;
                    }
                    state.dirty = false;
                    modalKapat('isTalepModal');
                }
            }, true);
        }

        window.addEventListener('resize', function () { syncStepUi(); });
    }

    function openCreate(opts) {
        opts = opts || {};
        ensureModalDom();
        bindOnce();

        var restore = opts.restore || null;
        if (!restore) {
            var auto = lsGet(LS_AUTOSAVE, null);
            if (auto && auto.data && opts.useAutosave !== false) {
                restore = { data: auto.data, istemciAnahtar: auto.istemciAnahtar };
            }
        }
        resetState(restore);

        if (!isLoggedIn()) {
            /* Formu şimdi açma — giriş sonrası tryRestorePendingAfterAuth ile dönülür */
            var data = (restore && restore.data) || emptyForm();
            if (!state.istemciAnahtar) state.istemciAnahtar = uuid();
            lsSet(LS_PENDING, { data: data, istemciAnahtar: state.istemciAnahtar });
            lsSetRaw(LS_PENDING_FLAG, '1');
            toast('İş talebi oluşturmak için giriş yapmanız gerekir.', 'info');
            openAuthModal();
            return;
        }
        modalAc('isTalepModal');
        syncStepUi();
    }

    function tryRestorePendingAfterAuth() {
        var flag = null;
        try { flag = localStorage.getItem(LS_PENDING_FLAG); } catch (e) { flag = null; }
        if (flag !== '1') return;
        if (!isLoggedIn()) return;
        var pending = lsGet(LS_PENDING, null);
        try { localStorage.removeItem(LS_PENDING_FLAG); } catch (e2) { /* ignore */ }
        if (pending && pending.data) {
            openCreate({ restore: pending, useAutosave: false });
            toast('Yarım kalan iş talebiniz geri yüklendi.', 'success');
        }
    }

    function init() {
        ensureModalDom();
        bindOnce();
        pruneDrafts();

        var acBtn = document.getElementById('isTalepAcBtn');
        if (acBtn && !acBtn.getAttribute('data-it-bound')) {
            acBtn.setAttribute('data-it-bound', '1');
            acBtn.addEventListener('click', function (e) {
                e.preventDefault();
                openCreate();
            });
        }

        var taleplerimBtn = document.getElementById('isTaleplerimBtn');
        if (taleplerimBtn && !taleplerimBtn.getAttribute('data-it-bound')) {
            taleplerimBtn.setAttribute('data-it-bound', '1');
            taleplerimBtn.addEventListener('click', function (e) {
                e.preventDefault();
                openTaleplerim();
            });
        }

        if (global.AuthService && typeof AuthService.onAuthStateChange === 'function') {
            try {
                AuthService.onAuthStateChange(function () {
                    tryRestorePendingAfterAuth();
                });
            } catch (e) { /* ignore */ }
        }

        document.addEventListener('aurix:auth-changed', tryRestorePendingAfterAuth);
        document.addEventListener('aurix:login', tryRestorePendingAfterAuth);

        enhanceListCards(document.getElementById('isTalepleriGrid') || document);

        if (demoModAktifMi()) {
            try { /* demo hazır */ } catch (e3) { /* ignore */ }
        }
    }

    var api = {
        openCreate: openCreate,
        openDetail: openDetail,
        init: init,
        demoModAktifMi: demoModAktifMi,
        getDemoTalepler: getDemoTalepler,
        IS_KATEGORILERI: IS_KATEGORILERI,
        enhanceListCards: enhanceListCards,
        saveDraft: saveDraft,
        publish: publish
    };

    Object.defineProperty(api, 'onAuthRequired', {
        get: function () { return state.onAuthRequired; },
        set: function (fn) { state.onAuthRequired = typeof fn === 'function' ? fn : null; },
        enumerable: true,
        configurable: true
    });

    global.AurixIsTalebi = api;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);

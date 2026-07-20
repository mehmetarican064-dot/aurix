/**
 * Aurix Beta v0.1 — Uygulama çekirdeği
 * StorageAdapter: localStorage (demo) → v1.0'da SupabaseAdapter ile değiştirilecek
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'aurix_beta_v03_firms';
    // Admin panel v1.0'da Supabase Auth + profiles.role='admin' ile etkinleştirilecek.
    var ADMIN_PANEL_ENABLED = false;
    // TODO: Supabase Auth sonrası devAdmin parametresi tamamen kaldırılacak.
    var devAdminMode = false;
    /** Tanıtım videosu sunum modu — yalnızca ?demoVideo=1 */
    var demoVideoMode = false;

    var esc = AurixUtils.escapeHtml;
    var safeUrl = AurixUtils.safeUrl;
    var safeImageUrl = AurixUtils.safeImageUrl;
    var safeCss = AurixUtils.safeCssClass;

    var state = {
        firmalar: [],
        isTalepleri: [],
        malzemeler: [],
        kullanicilar: [],
        aktifSayfa: 'ana-sayfa',
        piyasaTab: 'kuyumcu',
        adminArama: '',
        adminSilBekleyenId: null,
        filtre: { arama: '', grupId: '', kategoriId: '', sehir: '' },
        vitrin: { sayfa: 1, boyut: 9, siralama: 'yeni' },
        malzeme: { arama: '', kategoriId: '' },
        liveIstatistik: null,
        istatistikYukleniyor: true,
        liveFirmalar: [],
        firmalarHata: null,
        firmalarYukleniyor: false,
        liveIsTalepleri: [],
        isTalepleriHata: null,
        isTalepleriYukleniyor: false,
        adminBekleyenFirmalar: [],
        adminBekleyenHata: null,
        adminLokalRedler: {}
    };

    function cloneJson(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /** İş/malzeme moderasyonu oturum içi; admin yetkisi localStorage'a yazılmaz.
     *  Ana sayfa açık iş talepleri örnek veriden gelmez — yalnızca Supabase. */
    function initModerationQueues() {
        var demo = AURIX_DATA.ADMIN_PANEL_DEMO || {};
        state.isTalepleri = [];
        (demo.bekleyenIsTalepleri || []).forEach(function (t) {
            var c = cloneJson(t);
            c.moderasyon = c.moderasyon || 'beklemede';
            state.isTalepleri.push(c);
        });

        /* Public malzeme vitrini örnek ürün göstermez — gerçek kaynak bağlanana kadar boş. */
        state.malzemeler = [];
        if (devAdminMode) {
            (demo.bekleyenMalzemeler || []).forEach(function (u) {
                var c = cloneJson(u);
                c.moderasyon = 'beklemede';
                state.malzemeler.push(c);
            });
        }

        state.kullanicilar = cloneJson(demo.kullanicilar || []);
    }

    /** Ana sayfa: yalnızca Supabase durum=Acik kayıtları (örnek veri yok). */
    function onayliIsTalepleri() {
        return Array.isArray(state.liveIsTalepleri) ? state.liveIsTalepleri : [];
    }

    function onayliMalzemeler() {
        return state.malzemeler.filter(function (u) { return u.moderasyon === 'onaylandi'; });
    }

    function initDevAdminMode() {
        var params = new URLSearchParams(window.location.search);
        devAdminMode = params.get('devAdmin') === '1';
        if (devAdminMode && window.AurixSupabase) {
            var hasToken = typeof AurixSupabase.getAdminToken === 'function'
                ? AurixSupabase.getAdminToken()
                : AurixSupabase.getAdminDemoToken && AurixSupabase.getAdminDemoToken();
            if (!hasToken) {
                var token = window.prompt(
                    'Admin token girin\n\n(Oturum boyunca sessionStorage’da saklanır; URL’ye yazmayın)'
                );
                if (token) {
                    if (AurixSupabase.setAdminToken) AurixSupabase.setAdminToken(token);
                    else if (AurixSupabase.setAdminDemoToken) AurixSupabase.setAdminDemoToken(token);
                }
            }
        }
    }

    function initDemoVideoMode() {
        var params = new URLSearchParams(window.location.search);
        demoVideoMode = params.get('demoVideo') === '1';
        if (!demoVideoMode) return;

        document.documentElement.classList.add('demo-video');
        if (document.body) document.body.classList.add('demo-video');

        var footerNot = document.querySelector('.footer__not');
        if (footerNot) footerNot.textContent = '© 2026 AURIX · Kuyumculuk İş Ağı';
    }

    function applyDemoVideoUi() {
        if (!demoVideoMode) return;
        document.documentElement.classList.add('demo-video');
        if (document.body) document.body.classList.add('demo-video');

        var banner = $('devAdminBanner');
        if (banner) banner.hidden = true;

        document.querySelectorAll('.panel-beta-bar, .admin-demo-info, .admin-demo-bar, .admin-demo-not').forEach(function (el) {
            el.hidden = true;
        });
    }

    function isDemoVideoMode() {
        return demoVideoMode;
    }

    function isAdminSession() {
        return devAdminMode || (ADMIN_PANEL_ENABLED && AuthService.isAdmin());
    }

    function renderDevAdminBanner() {
        var el = $('devAdminBanner');
        if (el) el.hidden = !devAdminMode;
    }

    function devAdminCikis() {
        devAdminMode = false;
        renderDevAdminBanner();
        renderAdminUI();
        try {
            var url = new URL(window.location.href);
            url.searchParams.delete('devAdmin');
            var temiz = url.pathname + (url.search ? url.search : '') + url.hash;
            window.history.replaceState({}, '', temiz);
        } catch (e) { /* demo */ }
        sayfaGoster('ana-sayfa');
        toast('Geliştirme modu kapatıldı.', 'info');
    }

    var marketService = null;
    var marketQuotes = [];

    // ================================================================
    // STORAGE ADAPTER (Supabase'e geçişte sadece bu katman değişir)
    // ================================================================

    function firmaGorselTemizle(firma) {
        if (!firma) return firma;
        var temiz = Object.assign({}, firma);
        if (temiz.gorsel) {
            var g = safeImageUrl(temiz.gorsel, '');
            if (!g || g.indexOf('assets/') !== 0) delete temiz.gorsel;
            else temiz.gorsel = g;
        }
        if (temiz.logo) {
            var l = safeImageUrl(temiz.logo, '');
            if (!l || l.indexOf('assets/') !== 0) delete temiz.logo;
            else temiz.logo = l;
        }
        return temiz;
    }

    /** Ana sayfa / firmalar: örnek listeden beslenmez — yalnızca Supabase canlı kayıtları.
     *  state.firmalar admin demo / localStorage için kalır. */
    var StorageAdapter = {
        load: function () {
            try {
                var raw = localStorage.getItem(STORAGE_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) { /* demo mod */ }
            return null;
        },
        save: function (firmalar) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(firmalar));
        },
        reset: function () {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('aurix_beta_v02_firms');
            localStorage.removeItem('aurix_beta_v01_firms');
        },
        init: function () {
            /* Public vitrin yalnızca Supabase. Eski örnek firma localStorage kalıntısını temizle. */
            this.reset();
            state.firmalar = [];
        }
    };

    // ================================================================
    // YARDIMCILAR
    // ================================================================

    function $(id) { return document.getElementById(id); }

    function kategoriBul(id) {
        return AURIX_DATA.KATEGORILER.find(function (k) { return k.id === id; }) || { ad: id, ikon: '🏢' };
    }

    function yeniId() {
        return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function telTemizle(tel) {
        return String(tel || '').replace(/\D/g, '');
    }

    /** Kullanıcı girişini 10 haneli TR cep (5XXXXXXXXX) hâline getirir */
    function normalizeTrCepDigits(ham) {
        var d = telTemizle(ham);
        if (d.indexOf('90') === 0 && d.length >= 12) d = d.slice(2);
        if (d.charAt(0) === '0') d = d.slice(1);
        if (d.indexOf('90') === 0 && d.length >= 12) d = d.slice(2);
        if (d.length > 10) d = d.slice(-10);
        return d.slice(0, 10);
    }

    function formatTrCepDisplay(digits) {
        var d = String(digits || '').replace(/\D/g, '').slice(0, 10);
        if (d.length <= 3) return d;
        if (d.length <= 6) return d.slice(0, 3) + ' ' + d.slice(3);
        if (d.length <= 8) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
        return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 8) + ' ' + d.slice(8, 10);
    }

    function isValidTrCep(digits) {
        return /^5[0-9]{9}$/.test(String(digits || ''));
    }

    function toE164TrCep(digits) {
        return isValidTrCep(digits) ? ('+90' + digits) : '';
    }

    var TEL_HATA_MESAJ = 'Geçerli bir cep telefonu numarası girin. Örnek: 5XX XXX XX XX';
    var EMAIL_DOGRULAMA_MESAJ =
        'E-posta adresinize doğrulama bağlantısı gönderildi. E-postanızı doğruladıktan sonra giriş yapın.';
    var PENDING_FIRMA_KEY = 'pendingFirmaBasvurusu';
    var kayitBekleyenEmail = '';
    var pendingFirmaPromise = null;

    function pendingFirmaOku() {
        try {
            var ham = localStorage.getItem(PENDING_FIRMA_KEY);
            if (!ham) return null;
            var veri = JSON.parse(ham);
            if (!veri || typeof veri !== 'object') return null;
            return veri;
        } catch (e) {
            return null;
        }
    }

    function pendingFirmaKaydet(payload) {
        try {
            localStorage.setItem(PENDING_FIRMA_KEY, JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }

    function pendingFirmaSil() {
        try {
            localStorage.removeItem(PENDING_FIRMA_KEY);
        } catch (e) { /* ignore */ }
    }

    function pendingFirmaGonder() {
        if (pendingFirmaPromise) return pendingFirmaPromise;
        var pending = pendingFirmaOku();
        if (!pending) return Promise.resolve({ ok: true, skipped: true });
        if (!window.AurixSupabase || typeof AurixSupabase.kaydetFirma !== 'function') {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }
        pendingFirmaPromise = AurixSupabase.kaydetFirma(pending).then(function (res) {
            if (!res || !res.ok) {
                if (res && !res.needsAuth) {
                    toast((res && res.error) || 'Başvuru kaydedilemedi.', 'error');
                }
                return res || { ok: false, error: 'Başvuru kaydedilemedi.' };
            }
            pendingFirmaSil();
            toast('Firma hesabınız oluşturuldu. İnceleme sonrası yayınlanır.', 'success');
            if (typeof yukleCanliVerilerSupabase === 'function') yukleCanliVerilerSupabase();
            if (window.AuthService && typeof AuthService.refreshProfile === 'function') {
                AuthService.refreshProfile();
            }
            if (window.PanelUI && typeof PanelUI.renderUserPanel === 'function') {
                PanelUI.renderUserPanel();
            }
            return res;
        }).catch(function (err) {
            try { console.error('pendingFirmaBasvurusu gönderim', err); } catch (e) { /* ignore */ }
            toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
            return { ok: false, error: 'Bağlantı hatası. Lütfen tekrar deneyin.' };
        }).then(function (res) {
            pendingFirmaPromise = null;
            return res;
        });
        return pendingFirmaPromise;
    }

    function toast(mesaj, tip) {
        var wrap = $('toastWrap');
        if (!wrap) return;
        var el = document.createElement('div');
        el.className = 'toast toast--' + (tip || 'info');
        el.textContent = mesaj;
        wrap.appendChild(el);
        setTimeout(function () {
            el.classList.add('toast--hide');
            setTimeout(function () { el.remove(); }, 300);
        }, 3500);
    }

    function yildizGoster(puan) {
        if (!puan) return '—';
        var tam = Math.floor(puan);
        var yarim = puan - tam >= 0.5;
        var s = '';
        for (var i = 0; i < tam; i++) s += '★';
        if (yarim) s += '½';
        return s + ' ' + puan.toFixed(1);
    }

    var FIRMA_SEKTOR_TEMA = {
        dokumcu: 'dokum',
        mumcu: 'kalip',
        kalipci: 'kalip',
        ramat: 'dokum',
        cizimci: 'cad',
        matrix: 'cad',
        rhino: 'cad',
        mihlamaci: 'mihlama',
        tas: 'tas',
        lazer: 'lazer',
        makine: 'makine',
        malzeme: 'malzeme',
        polisaj: 'malzeme',
        sarf: 'malzeme',
        kimyasal: 'malzeme',
        tel: 'malzeme',
        lehim: 'malzeme',
        aparat: 'malzeme',
        kilit: 'malzeme',
        kutu: 'malzeme',
        toptanci: 'malzeme',
        vitrin: 'malzeme',
        ayar: 'malzeme',
        bilezik: 'malzeme',
        zincir: 'malzeme',
        tamir: 'malzeme'
    };

    var KAPAK_ALTERNATIF_HAVUZ = [
        'assets/images/dokum.png',
        'assets/images/cad.png',
        'assets/images/mihlama.png',
        'assets/images/tas.png',
        'assets/images/mum.png',
        'assets/images/makine.png',
        'assets/images/malzeme.jpg',
        'assets/images/lazer.png',
        'assets/images/kalip.png',
        'assets/images/firma.png'
    ];

    function firmaSektorTema(kategoriId) {
        return FIRMA_SEKTOR_TEMA[kategoriId] || 'genel';
    }

    function varsayilanFirmaGorseli() {
        return safeImageUrl(AURIX_DATA.VARSAYILAN_GORSEL, 'assets/images/firma.png');
    }

    function firmaKategoriGorseli(firma) {
        var map = AURIX_DATA.KATEGORI_KAPAK_GORSELLERI || {};
        var kat = firma && firma.kategoriId;
        if (kat && map[kat]) {
            return safeImageUrl(map[kat], '');
        }
        return varsayilanFirmaGorseli();
    }

    function firmaKapakGorsel(firma) {
        if (firma && firma.gorsel) {
            var yerel = safeImageUrl(firma.gorsel, '');
            if (yerel && yerel.indexOf('assets/') === 0) return yerel;
        }
        return firmaKategoriGorseli(firma);
    }

    function firmaKapakAlternatif(firma, yasakSrc) {
        var birincil = firmaKapakGorsel(firma);
        var adaylar = [];
        var map = AURIX_DATA.KATEGORI_KAPAK_GORSELLERI || {};
        Object.keys(map).forEach(function (k) {
            var yol = safeImageUrl(map[k], '');
            if (yol && yol !== yasakSrc && yol !== birincil && adaylar.indexOf(yol) === -1) {
                adaylar.push(yol);
            }
        });
        KAPAK_ALTERNATIF_HAVUZ.forEach(function (yol) {
            var g = safeImageUrl(yol, '');
            if (g && g !== yasakSrc && g !== birincil && adaylar.indexOf(g) === -1) {
                adaylar.push(g);
            }
        });
        if (!adaylar.length) return '';
        var n = parseInt(String((firma && firma.id) || '').replace(/\D/g, ''), 10) || 1;
        return adaylar[n % adaylar.length];
    }

    /* Sıralamayı değiştirmez; yalnızca ardışık aynı kapak / placeholder'ı engeller. */
    function createKapakSirasi() {
        var oncekiSrc = '';
        var oncekiPh = false;
        return {
            attrs: function (firma) {
                var katGorsel = firmaKategoriGorseli(firma);
                var src = firmaKapakGorsel(firma);
                var forcePh = false;
                if (oncekiSrc && src === oncekiSrc) {
                    var alt = firmaKapakAlternatif(firma, oncekiSrc);
                    if (alt) {
                        src = alt;
                    } else {
                        forcePh = true;
                        src = '';
                    }
                }
                if (forcePh && oncekiPh) {
                    var alt2 = firmaKapakAlternatif(firma, oncekiSrc || katGorsel);
                    if (alt2) {
                        forcePh = false;
                        src = alt2;
                    }
                }
                oncekiPh = forcePh;
                oncekiSrc = forcePh ? '__aurix_logo_ph__' : src;
                return { src: src, katGorsel: katGorsel, forcePh: forcePh };
            }
        };
    }

    function firmaKapakImgAttrs(firma) {
        var katGorsel = firmaKategoriGorseli(firma);
        var src = firmaKapakGorsel(firma);
        return { src: src, katGorsel: katGorsel, forcePh: false };
    }

    function firmaSektorPlaceholderHtml() {
        return '<div class="firma-sektor-ph" aria-hidden="true">' +
            '<div class="firma-sektor-ph__bg"></div>' +
            '<img class="firma-sektor-ph__logo" src="assets/logo.png" alt="" width="160" height="160" loading="lazy" decoding="async">' +
            '<div class="firma-sektor-ph__frost"></div>' +
            '<div class="firma-sektor-ph__glow"></div>' +
            '</div>';
    }

    function firmaGorselAlaniHtml(firma, alt, opts) {
        opts = opts || {};
        var tema = firmaSektorTema(firma.kategoriId);
        var g = opts.kapakAttrs || firmaKapakImgAttrs(firma);
        var imgClass = opts.imgClass || 'firma-kart__kapak-img';
        var wrapCls = 'firma-gorsel-alan firma-gorsel-alan--' + safeCss(tema, 'genel');
        if (opts.wrapClass) wrapCls += ' ' + opts.wrapClass;
        if (g.forcePh) wrapCls += ' firma-gorsel-alan--ph';
        var fbSrc = (!g.forcePh && g.katGorsel && g.katGorsel !== g.src) ? g.katGorsel : '';
        var imgSrc = g.forcePh ? 'assets/logo.png' : g.src;
        return '<div class="' + wrapCls + '" data-sektor="' + esc(firma.kategoriId || '') + '">' +
            '<img class="' + esc(imgClass) + ' aurix-img-fallback" src="' + esc(imgSrc) + '" alt="' + esc(alt || '') + '"' +
            ' width="' + (opts.width || 400) + '" height="' + (opts.height || 200) + '" loading="eager" decoding="async"' +
            ' data-fallback-src="' + esc(fbSrc) + '" data-fallback-final="' + esc(AurixUtils.PH_MARKER) + '"' +
            (g.forcePh ? ' data-force-ph="1" data-fallback-applied="2"' : '') + '>' +
            firmaSektorPlaceholderHtml() +
            '</div>';
    }

    function firmaAnaKapakHtml(firma, alt, kapakAttrs) {
        return '<div class="firma-kart__thumb">' +
            firmaGorselAlaniHtml(firma, alt, {
                imgClass: 'firma-kart__thumb-img',
                width: 320,
                height: 64,
                wrapClass: 'firma-gorsel-alan--thumb',
                kapakAttrs: kapakAttrs
            }) +
            '</div>';
    }

    function firmaKapakImgHtml(firma, alt, kapakAttrs) {
        return firmaGorselAlaniHtml(firma, alt, {
            imgClass: 'firma-kart__kapak-img',
            width: 400,
            height: 200,
            kapakAttrs: kapakAttrs
        });
    }

    function detayGorselGuncelle(firma) {
        var wrap = $('detayGorselWrap');
        var img = $('detayGorsel');
        if (!wrap || !img) return;
        var g = firmaKapakImgAttrs(firma);
        var tema = firmaSektorTema(firma.kategoriId);
        var fbSrc = g.katGorsel && g.katGorsel !== g.src ? g.katGorsel : '';
        wrap.className = 'detay-gorsel-wrap firma-gorsel-alan firma-gorsel-alan--' + safeCss(tema, 'genel');
        wrap.setAttribute('data-sektor', firma.kategoriId || '');
        var ph = wrap.querySelector('.firma-sektor-ph');
        if (!ph) {
            ph = document.createElement('div');
            ph.className = 'firma-sektor-ph';
            ph.setAttribute('aria-hidden', 'true');
            wrap.appendChild(ph);
        }
        ph.innerHTML = '<div class="firma-sektor-ph__bg"></div>' +
            '<img class="firma-sektor-ph__logo" src="assets/logo.png" alt="" width="160" height="160" loading="lazy" decoding="async">' +
            '<div class="firma-sektor-ph__frost"></div>' +
            '<div class="firma-sektor-ph__glow"></div>';
        wrap.classList.remove('firma-gorsel-alan--ok', 'firma-gorsel-alan--ph');
        img.classList.add('aurix-img-fallback');
        img.dataset.fallbackApplied = '';
        img.setAttribute('data-fallback-src', fbSrc);
        img.setAttribute('data-fallback-final', AurixUtils.PH_MARKER);
        img.removeAttribute('data-force-ph');
        img.src = g.src;
        img.alt = firma.ad;
        if (img.complete && img.naturalWidth > 0) {
            wrap.classList.add('firma-gorsel-alan--ok');
        }
    }

    function heroKategoriFiltre(kategoriId, aramaMetni) {
        var grup = kategoriGrupBul(kategoriId);
        state.filtre.kategoriId = kategoriId;
        state.filtre.grupId = grup ? grup.id : '';
        state.filtre.arama = aramaMetni || '';
        guncelleFiltreChipAktif();
        vitrinSayfaSifirla();
        var aramaInput = $('aramaInput');
        if (aramaInput) aramaInput.value = state.filtre.arama;
        renderVitrin();
        sayfaGoster('firmalar');
    }

    function firmaDogrulamaVerisi(firma) {
        if (firma && firma.dogrulama) return firma.dogrulama;
        return {};
    }

    function firmaDogrulamaRozetleriHtml(firma, kompakt) {
        var d = firmaDogrulamaVerisi(firma);
        var alanlar = AURIX_DATA.DOGRULAMA_ALANLARI || [];
        return '<div class="firma-dogrulama' + (kompakt ? ' firma-dogrulama--kompakt' : '') + '">' +
            alanlar.map(function (a) {
                var aktif = d[a.id];
                return '<span class="firma-dogrulama__rozet' + (aktif ? ' firma-dogrulama__rozet--aktif' : '') + '" title="' + esc(a.etiket) + '">' +
                    (aktif ? '✓ ' : '') + esc(a.etiket) + '</span>';
            }).join('') +
            '</div>';
    }

    function detayGuvenPanelHtml(firma) {
        var dogrulandi = firma.durum === 'onaylandi';
        if (!dogrulandi) return '';
        return '<div class="detay-guven__rozetler">' +
            '<span class="firma-dogrulama__rozet firma-dogrulama__rozet--aktif">✓ Doğrulanmış firma</span>' +
            '</div>';
    }

    /* Firma profil modalı — sahte hizmet / iş listesi yok */
    function firmaProfilHizmetler(firma) {
        var kat = kategoriBul(firma.kategoriId);
        return kat && kat.ad ? [kat.ad] : [];
    }

    function firmaProfilIsler() {
        return [];
    }

    function firmaProfilGaleri(firma) {
        var birincil = firmaKapakGorsel(firma);
        return birincil ? [birincil] : [];
    }

    function detayLogoGuncelle(firma) {
        var el = $('detayLogo');
        if (!el) return;
        var logoSrc = firma.logo ? safeImageUrl(firma.logo, '') : '';
        if (logoSrc && logoSrc.indexOf('assets/') === 0) {
            el.innerHTML = '<img class="detay-logo__img aurix-img-fallback" src="' + esc(logoSrc) + '" alt="" width="72" height="72" loading="lazy" decoding="async" data-fallback-final="' + esc(AurixUtils.PH_MARKER) + '">';
        } else {
            el.innerHTML = '<span class="detay-logo__harf">' + esc(firmaBasHarfleri(firma.ad)) + '</span>';
        }
    }

    function detayHizmetlerGuncelle(firma) {
        var el = $('detayHizmetler');
        if (!el) return;
        var hizmetler = firmaProfilHizmetler(firma);
        var bolum = el.closest('.detay-bolum');
        if (!hizmetler.length) {
            el.innerHTML = '';
            if (bolum) bolum.hidden = true;
            return;
        }
        if (bolum) bolum.hidden = false;
        el.innerHTML = hizmetler.map(function (h) {
            return '<span class="detay-hizmet-chip">' + esc(h) + '</span>';
        }).join('');
    }

    function detayGaleriGuncelle(firma) {
        var el = $('detayGaleri');
        if (!el) return;
        var gorseller = firmaProfilGaleri(firma);
        var bolum = el.closest('.detay-bolum');
        if (!gorseller.length) {
            el.innerHTML = '';
            if (bolum) bolum.hidden = true;
            return;
        }
        if (bolum) bolum.hidden = false;
        var tema = firmaSektorTema(firma.kategoriId);
        el.innerHTML = gorseller.map(function (src) {
            return '<div class="detay-galeri__oge firma-gorsel-alan firma-gorsel-alan--' + safeCss(tema, 'genel') + '">' +
                '<img class="detay-galeri__img aurix-img-fallback" src="' + esc(src) + '" alt="" width="160" height="120" loading="lazy" decoding="async"' +
                ' data-fallback-final="' + esc(AurixUtils.PH_MARKER) + '">' +
                firmaSektorPlaceholderHtml() +
                '</div>';
        }).join('');
        AurixUtils.refreshFirmaGorselleri(el);
    }

    function detayIslerGuncelle(firma) {
        var el = $('detayIsler');
        if (!el) return;
        var isler = firmaProfilIsler(firma);
        var bolum = el.closest('.detay-bolum');
        if (!isler.length) {
            el.innerHTML = '';
            if (bolum) bolum.hidden = true;
            return;
        }
        if (bolum) bolum.hidden = false;
        el.innerHTML = isler.map(function (is) {
            return '<li class="detay-is">' +
                '<div class="detay-is__ust">' +
                '<strong class="detay-is__baslik">' + esc(is.baslik) + '</strong>' +
                '<span class="detay-is__tutar">' + esc(is.tutar) + '</span>' +
                '</div>' +
                '<div class="detay-is__alt">' +
                '<span>' + esc(is.musteri) + '</span>' +
                '<time>' + esc(is.tarih) + '</time>' +
                '</div></li>';
        }).join('');
    }

    function malzemeKategoriBul(id) {
        var list = AURIX_DATA.MALZEME_KATEGORILER || [];
        return list.find(function (k) { return k.id === id; }) || { ad: id, ikon: '📦' };
    }

    /** Firmalar sayfası / vitrin: yalnızca Supabase (örnek veri yok). */
    function onayliFirmalar() {
        return Array.isArray(state.liveFirmalar) ? state.liveFirmalar : [];
    }

    function kategoriGrupBul(kategoriId) {
        var gruplar = AURIX_DATA.FILTRE_GRUPLARI || [];
        for (var i = 0; i < gruplar.length; i++) {
            if (gruplar[i].kategoriler && gruplar[i].kategoriler.indexOf(kategoriId) !== -1) {
                return gruplar[i];
            }
        }
        return null;
    }

    function firmaFiltreUygun(firma) {
        var f = state.filtre;
        var kat = kategoriBul(firma.kategoriId);
        var arama = f.arama.toLowerCase();
        var metin = (firma.ad + ' ' + kat.ad + ' ' + firma.sehir + ' ' + firma.aciklama).toLowerCase();
        if (arama && metin.indexOf(arama) === -1) return false;
        if (f.kategoriId && firma.kategoriId !== f.kategoriId) return false;
        if (f.grupId && !f.kategoriId) {
            var grup = AURIX_DATA.FILTRE_GRUPLARI.find(function (g) { return g.id === f.grupId; });
            if (grup && grup.kategoriler && grup.kategoriler.indexOf(firma.kategoriId) === -1) return false;
        }
        if (f.sehir && firma.sehir !== f.sehir) return false;
        return true;
    }

    function filtreliFirmalar() {
        return onayliFirmalar().filter(firmaFiltreUygun);
    }

    function filtreAktifMi() {
        var f = state.filtre;
        return !!(f.arama || f.sehir || f.kategoriId || f.grupId);
    }

    function scrollToBolum(id) {
        sayfaGoster('ana-sayfa');
        navMenuKapat();
        window.setTimeout(function () {
            var el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    }

    function firmaBasHarfleri(ad) {
        var kelimeler = String(ad || '').trim().split(/\s+/).filter(Boolean);
        if (kelimeler.length >= 2) {
            return (kelimeler[0].charAt(0) + kelimeler[1].charAt(0)).toLocaleUpperCase('tr-TR');
        }
        return String(ad || 'A').slice(0, 2).toLocaleUpperCase('tr-TR');
    }

    function firmaOnerilenSira(a, b) {
        if (a.premium !== b.premium) return a.premium ? -1 : 1;
        if (a.sponsor !== b.sponsor) return a.sponsor ? -1 : 1;
        return (b.puan || 0) - (a.puan || 0);
    }

    function siraliVitrinFirmalari(list) {
        var siralama = state.vitrin.siralama || 'onerilen';
        var sorted = list.slice();
        if (siralama === 'puan') {
            sorted.sort(function (a, b) {
                var puanFark = (b.puan || 0) - (a.puan || 0);
                return puanFark !== 0 ? puanFark : firmaOnerilenSira(a, b);
            });
        } else if (siralama === 'yeni') {
            sorted.sort(function (a, b) {
                var aT = a.eklenmeTarihi ? new Date(a.eklenmeTarihi).getTime() : 0;
                var bT = b.eklenmeTarihi ? new Date(b.eklenmeTarihi).getTime() : 0;
                return bT - aT;
            });
        } else if (siralama === 'ad') {
            sorted.sort(function (a, b) {
                return a.ad.localeCompare(b.ad, 'tr');
            });
        } else {
            sorted.sort(firmaOnerilenSira);
        }
        return sorted;
    }

    function vitrinSayfaSifirla() {
        state.vitrin.sayfa = 1;
    }

    // ================================================================
    // RENDER
    // ================================================================

    function piyasaDegisimGoster(k) {
        var yon = k.yon || 'flat';
        var ok = yon === 'up' ? '▲ ' : (yon === 'down' ? '▼ ' : '');
        var cls = yon === 'up'
            ? 'piyasa-kart__degisim--up'
            : (yon === 'down' ? 'piyasa-kart__degisim--down' : 'piyasa-kart__degisim--flat');
        return { ok: ok, cls: cls, metin: k.degisim || '0,00%' };
    }

    function piyasaKartHtml(k) {
        var d = piyasaDegisimGoster(k);
        var grupCls = k.grup ? ' piyasa-kart--' + k.grup : '';
        var premiumCls = k.premium ? ' piyasa-kart--premium-esnaf' : '';
        return '<div class="piyasa-kart' + grupCls + premiumCls + '" data-piyasa="' + esc(k.id) + '">' +
            '<span class="piyasa-kart__etiket">' + esc(k.etiket) + '</span>' +
            '<div class="piyasa-kart__deger-satir">' +
            '<span class="piyasa-kart__deger">' + esc(k.deger) + '</span>' +
            '<span class="piyasa-kart__birim">' + esc(k.birim) + '</span>' +
            '</div>' +
            '<span class="piyasa-kart__degisim ' + d.cls + '">' + d.ok + esc(d.metin) + '</span>' +
            '</div>';
    }

    function piyasaFiltreliKotasyonlar() {
        if (!marketQuotes.length) return [];
        if (window.MarketService && MarketService.filterQuotesByTab) {
            return MarketService.filterQuotesByTab(marketQuotes, state.piyasaTab);
        }
        return marketQuotes;
    }

    function piyasaTabSec(tab, skipRender) {
        if (!window.MarketService || !MarketService.TAB_INSTRUMENTS[tab]) tab = 'kuyumcu';
        state.piyasaTab = tab;
        document.querySelectorAll('[data-piyasa-tab]').forEach(function (btn) {
            var aktif = btn.getAttribute('data-piyasa-tab') === tab;
            btn.classList.toggle('hero-terminal__tab--aktif', btn.classList.contains('hero-terminal__tab') && aktif);
            btn.classList.toggle('piyasa-page-tab--aktif', btn.classList.contains('piyasa-page-tab') && aktif);
            btn.setAttribute('aria-selected', aktif ? 'true' : 'false');
        });
        if (!skipRender) {
            renderPiyasaBandi();
            renderHeroTerminal(marketQuotes);
        }
    }

    function initPiyasaTabs() {
        document.querySelectorAll('[data-piyasa-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                piyasaTabSec(btn.getAttribute('data-piyasa-tab'));
            });
        });
    }

    var piyasaYuklemeTimeout = null;
    var piyasaVeriGeldi = false;

    function piyasaBosMesaj() {
        return '<div class="piyasa-hata" role="status">Piyasa verilerine şu anda ulaşılamıyor.</div>';
    }

    function renderPiyasaBandi() {
        var quotes = piyasaFiltreliKotasyonlar();
        var html;
        if (!quotes.length) {
            html = piyasaVeriGeldi ? piyasaBosMesaj() : '<div class="piyasa-yukleniyor">Piyasa verileri yükleniyor…</div>';
        } else {
            var kartlar = quotes.map(piyasaKartHtml).join('');
            html = kartlar + kartlar;
        }
        ['piyasaBandi', 'piyasaBandiAna'].forEach(function (id) {
            var wrap = $(id);
            if (wrap) wrap.innerHTML = html;
        });
    }

    function renderHeroTerminal(quotes) {
        var body = $('heroTerminalBody');
        var saatEl = $('heroTerminalSaat');
        var guncellemeEl = $('heroTerminalGuncelleme');
        if (saatEl) {
            saatEl.textContent = new Intl.DateTimeFormat('tr-TR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            }).format(new Date());
        }
        if (guncellemeEl) {
            guncellemeEl.textContent = 'Güncelleme: ' + new Intl.DateTimeFormat('tr-TR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            }).format(new Date());
        }
        if (!body) return;
        var filtered = quotes && quotes.length ? piyasaFiltreliKotasyonlar() : [];
        if (!filtered.length) {
            body.innerHTML = piyasaVeriGeldi
                ? '<div class="hero-terminal__yukleniyor">' + esc('Piyasa verilerine şu anda ulaşılamıyor.') + '</div>'
                : '<div class="hero-terminal__yukleniyor">Piyasa verileri yükleniyor…</div>';
            return;
        }
        body.innerHTML = filtered.map(function (q) {
            var yon = q.yon || 'flat';
            var cls = yon === 'up' ? 'terminal-row--up' : (yon === 'down' ? 'terminal-row--down' : 'terminal-row--flat');
            var ok = yon === 'up' ? '▲ ' : (yon === 'down' ? '▼ ' : '');
            var grupCls = q.grup ? ' terminal-row--' + esc(q.grup) : '';
            var premiumCls = q.premium ? ' terminal-row--premium-esnaf' : '';
            return '<div class="terminal-row' + grupCls + premiumCls + ' ' + cls + '" data-quote="' + esc(q.id) + '">' +
                '<span class="terminal-row__sembol">' + esc(q.etiket) + '</span>' +
                '<span class="terminal-row__fiyat">' + esc(q.deger) + '<small>' + esc(q.birim) + '</small></span>' +
                '<span class="terminal-row__degisim">' + ok + esc(q.degisim || '') + '</span>' +
                '</div>';
        }).join('');
    }

    function heroTerminalSaatGuncelle() {
        var saatEl = $('heroTerminalSaat');
        if (!saatEl) return;
        saatEl.textContent = new Intl.DateTimeFormat('tr-TR', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(new Date());
    }

    function initMarketService() {
        var wrap = $('piyasaBandi');
        if (!window.MarketService) {
            piyasaVeriGeldi = true;
            if (wrap) wrap.innerHTML = piyasaBosMesaj();
            return;
        }
        piyasaVeriGeldi = false;
        if (piyasaYuklemeTimeout) clearTimeout(piyasaYuklemeTimeout);
        piyasaYuklemeTimeout = setTimeout(function () {
            if (!marketQuotes.length) {
                piyasaVeriGeldi = true;
                renderPiyasaBandi();
                renderHeroTerminal([]);
            }
        }, 8000);
        marketService = MarketService.create('mock', { intervalMs: 5000 });
        marketService.subscribe(function (quotes) {
            marketQuotes = quotes || [];
            if (marketQuotes.length) {
                piyasaVeriGeldi = true;
                if (piyasaYuklemeTimeout) {
                    clearTimeout(piyasaYuklemeTimeout);
                    piyasaYuklemeTimeout = null;
                }
            }
            renderPiyasaBandi();
            renderHeroTerminal(quotes);
        });
        initPiyasaTabs();
        piyasaTabSec(state.piyasaTab, true);
        marketService.start();
        window.addEventListener('beforeunload', function () {
            if (marketService) marketService.stop();
            if (piyasaYuklemeTimeout) clearTimeout(piyasaYuklemeTimeout);
        });
    }

    function sponsorFirmalar() {
        return onayliFirmalar().filter(function (f) { return f.sponsor; }).sort(function (a, b) {
            if (a.premium !== b.premium) return a.premium ? -1 : 1;
            return (b.puan || 0) - (a.puan || 0);
        });
    }

    function renderSponsorAnaSayfa() {
        var grid = $('sponsorAlaniGrid');
        var bolum = $('sponsorAlaniBolum');
        if (!grid) return;
        var list = sponsorFirmalar();
        if (bolum) bolum.hidden = !list.length;
        if (!list.length) {
            grid.innerHTML = '';
            return;
        }
        var kapak = createKapakSirasi();
        grid.innerHTML = list.slice(0, 3).map(function (f) {
            var kat = kategoriBul(f.kategoriId);
            var gorsel = firmaGorselAlaniHtml(f, f.ad, {
                imgClass: 'sponsor-alani-kart__img',
                width: 640,
                height: 360,
                kapakAttrs: kapak.attrs(f)
            });
            return '<article class="sponsor-alani-kart" data-detay="' + esc(f.id) + '">' +
                '<div class="sponsor-alani-kart__gorsel">' + gorsel + '</div>' +
                '<div class="sponsor-alani-kart__govde">' +
                    '<span class="sponsor-alani-kart__rozet">SPONSOR</span>' +
                    '<h3 class="sponsor-alani-kart__ad">' + esc(f.ad) + '</h3>' +
                    '<p class="sponsor-alani-kart__kat">' + kat.ikon + ' ' + esc(kat.ad) + ' · ' + esc(f.sehir) + '</p>' +
                    '<div class="sponsor-alani-kart__aksiyon">' +
                    '<button type="button" class="btn btn--ghost btn--sm" data-detay="' + esc(f.id) + '">Detayları Gör</button>' +
                    '</div>' +
                '</div>' +
            '</article>';
        }).join('');
        baglaKartEventleri(grid);
    }

    function firmaGuvenVerisi(firma) {
        return {
            tamamlananIs: typeof firma.tamamlananIs === 'number' ? firma.tamamlananIs : null,
            cevapSuresi: firma.cevapSuresi || null,
            uyelikYili: firma.uyelikYili || (firma.eklenmeTarihi ? new Date(firma.eklenmeTarihi).getFullYear() : null),
            sonAktif: firma.sonAktif || null
        };
    }

    function kategoriFirmaSayisiGoster(item) {
        return onayliFirmalar().filter(function (f) { return f.kategoriId === item.id; }).length;
    }

    function kategoriFirmaSayisi(kategoriId) {
        return onayliFirmalar().filter(function (f) { return f.kategoriId === kategoriId; }).length;
    }

    function kategoriIsSayisi(item) {
        return onayliIsTalepleri().filter(function (t) {
            return t.kategoriId === item.id;
        }).length;
    }

    function platformIstatistikleri() {
        return AURIX_DATA.PLATFORM_ISTATISTIK || [];
    }

    function parseIstatDeger(str) {
        var ham = String(str || '').trim();
        if (!ham) return { raw: str, numeric: null, suffix: '', decimal: false };
        var suffix = '';
        if (ham.charAt(ham.length - 1) === '+') {
            suffix = '+';
            ham = ham.slice(0, -1).trim();
        }
        var ondalik = ham.indexOf('.') !== -1 && ham.indexOf('.') >= ham.length - 2;
        var sayi = ondalik
            ? parseFloat(ham.replace(',', '.'))
            : parseFloat(ham.replace(/\./g, '').replace(',', '.'));
        if (isNaN(sayi)) return { raw: str, numeric: null, suffix: '', decimal: false };
        return { raw: str, numeric: sayi, suffix: suffix, decimal: ondalik };
    }

    function formatIstatDeger(n, parsed) {
        if (parsed.decimal) return n.toFixed(1) + parsed.suffix;
        return Math.round(n).toLocaleString('tr-TR') + parsed.suffix;
    }

    function initHeroIstatAnimasyon(container) {
        if (!container) return;
        var kutular = container.querySelectorAll('.hero-istat-kutu__deger[data-target]');
        if (!kutular.length) return;

        function degerleriYazdir() {
            kutular.forEach(function (el) {
                var parsed = parseIstatDeger(el.getAttribute('data-raw'));
                el.textContent = parsed.raw;
            });
        }

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            degerleriYazdir();
            return;
        }

        function animasyonuBaslat() {
            var sure = 1100;
            var baslangic = performance.now();
            kutular.forEach(function (el) {
                var hedef = parseFloat(el.getAttribute('data-target'));
                var parsed = parseIstatDeger(el.getAttribute('data-raw'));
                if (isNaN(hedef) || !parsed.numeric) {
                    el.textContent = parsed.raw;
                    return;
                }
                function kare(now) {
                    var t = Math.min((now - baslangic) / sure, 1);
                    var ease = 1 - Math.pow(1 - t, 3);
                    el.textContent = formatIstatDeger(hedef * ease, parsed);
                    if (t < 1) requestAnimationFrame(kare);
                }
                requestAnimationFrame(kare);
            });
        }

        if (!('IntersectionObserver' in window)) {
            animasyonuBaslat();
            return;
        }

        var basladi = false;
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting && !basladi) {
                    basladi = true;
                    animasyonuBaslat();
                    observer.disconnect();
                }
            });
        }, { threshold: 0.25 });
        observer.observe(container);
    }

    function renderHeroIstatistikler(overrides) {
        var el = $('heroIstatistikler');
        if (!el) return;
        if (overrides) {
            state.liveIstatistik = overrides;
            state.istatistikYukleniyor = false;
        }
        var live = state.liveIstatistik;
        var yukleniyor = state.istatistikYukleniyor && !live;
        var stats = [
            { key: 'firma', etiket: 'Firma', deger: live && typeof live.firma === 'number' ? live.firma : null },
            { key: 'isTalep', etiket: 'Açık İş Talebi', deger: live && typeof live.isTalep === 'number' ? live.isTalep : null }
        ];

        if (yukleniyor) {
            el.innerHTML = stats.map(function (stat) {
                return '<div class="hero-istat-kutu hero-istat-kutu--premium hero-istat-kutu--skeleton" role="listitem" aria-busy="true">' +
                    '<span class="hero-istat-kutu__deger hero-istat-skeleton" aria-hidden="true">&nbsp;</span>' +
                    '<span class="hero-istat-kutu__etiket">' + esc(stat.etiket) + '</span>' +
                    '</div>';
            }).join('');
            return;
        }

        if (!live) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML = stats.map(function (stat) {
            var metin = typeof stat.deger === 'number' ? Number(stat.deger).toLocaleString('tr-TR') : '—';
            var parsed = parseIstatDeger(metin);
            var dataAttrs = parsed.numeric != null
                ? ' data-target="' + parsed.numeric + '" data-raw="' + esc(metin) + '"'
                : ' data-raw="' + esc(metin) + '"';
            return '<div class="hero-istat-kutu hero-istat-kutu--premium" role="listitem">' +
                '<span class="hero-istat-kutu__deger"' + dataAttrs + '>' + (parsed.numeric != null ? '0' : metin) + '</span>' +
                '<span class="hero-istat-kutu__etiket">' + esc(stat.etiket) + '</span>' +
                '</div>';
        }).join('');
        initHeroIstatAnimasyon(el);
    }

    function yukleHeroIstatistiklerSupabase() {
        state.istatistikYukleniyor = true;
        renderHeroIstatistikler();
        if (!window.AurixSupabase || typeof AurixSupabase.getirIstatistikler !== 'function') {
            state.istatistikYukleniyor = false;
            state.liveIstatistik = null;
            renderHeroIstatistikler();
            return;
        }
        AurixSupabase.getirIstatistikler().then(function (res) {
            state.istatistikYukleniyor = false;
            if (!res || !res.ok) {
                state.liveIstatistik = null;
                renderHeroIstatistikler();
                return;
            }
            renderHeroIstatistikler({ firma: res.firma, isTalep: res.isTalep });
        }).catch(function () {
            state.istatistikYukleniyor = false;
            state.liveIstatistik = null;
            renderHeroIstatistikler();
        });
    }

    function kategoriIdBul(adVeyaId) {
        if (!adVeyaId) return '';
        var ham = String(adVeyaId).trim();
        var list = (AURIX_DATA.KATEGORILER || []);
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === ham || list[i].ad === ham) return list[i].id;
            if (list[i].ad && list[i].ad.toLocaleLowerCase('tr-TR') === ham.toLocaleLowerCase('tr-TR')) {
                return list[i].id;
            }
        }
        return ham;
    }

    function supabaseFirmaMap(row) {
        var kategoriHam = row.kategori || '';
        return {
            id: 'sb-f-' + (row.id != null ? row.id : Date.now()),
            supabaseId: row.id,
            ad: row.firma_adi || row.ad || '—',
            kategoriId: kategoriIdBul(kategoriHam),
            sehir: row.sehir || '—',
            /* telefon/email public API’de yok — ziyaretçiye açık gösterilmez */
            tel: '',
            email: '',
            aciklama: row.aciklama || '',
            premium: false,
            sponsor: false,
            durum: row.durum === 'onaylandi' || row.dogrulanmis === true ? 'onaylandi' : (row.durum || 'onaylandi'),
            puan: 0,
            tamamlananIs: 0,
            cevapSuresi: '—',
            sonAktif: '—',
            eklenmeTarihi: row.created_at || new Date().toISOString(),
            kaynak: 'supabase',
            dogrulanmis: true,
            gizliIletisim: true
        };
    }

    function aciklamadanAlanCek(aciklama, etiket) {
        if (!aciklama) return '';
        var re = new RegExp(etiket + '\\s*:\\s*(.+)', 'i');
        var satirlar = String(aciklama).split(/\n+/);
        for (var i = 0; i < satirlar.length; i++) {
            var m = satirlar[i].match(re);
            if (m) return m[1].trim();
        }
        return '';
    }

    function supabaseIsTalebiMap(row) {
        var aciklama = row.aciklama || '';
        var created = row.created_at ? new Date(row.created_at) : null;
        var acilis = '—';
        if (created && !isNaN(created.getTime())) {
            acilis = created.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return {
            id: 'sb-it-' + (row.id != null ? row.id : Date.now()),
            supabaseId: row.id,
            kategoriId: kategoriIdBul(row.kategori),
            baslik: row.baslik || '—',
            sehir: row.sehir || '—',
            adet: aciklamadanAlanCek(aciklama, 'Adet\\s*/\\s*kapsam') || '—',
            termin: aciklamadanAlanCek(aciklama, 'Teslim süresi') || '—',
            butce: aciklamadanAlanCek(aciklama, 'Bütçe') || '—',
            teklifSayisi: 0,
            acilisTarihi: acilis,
            durum: (row.durum === 'Acik' ? 'Açık' : (row.durum || 'Açık')),
            durumTip: 'bekliyor',
            sonGuncelleme: '—',
            aciklama: aciklama,
            moderasyon: 'onaylandi',
            kaynak: 'supabase'
        };
    }

    function teklifSayilariniUygula(counts) {
        counts = counts || {};
        (state.liveIsTalepleri || []).forEach(function (t) {
            var key = t.supabaseId != null ? String(t.supabaseId) : '';
            t.teklifSayisi = key && counts[key] != null ? counts[key] : 0;
        });
    }

    function yukleTeklifSayilariSupabase() {
        if (!window.AurixSupabase || typeof AurixSupabase.getirTeklifSayilari !== 'function') {
            return Promise.resolve();
        }
        if (!AurixSupabase.baglantiHazirMi()) return Promise.resolve();
        return AurixSupabase.getirTeklifSayilari().then(function (res) {
            if (res && res.ok) {
                teklifSayilariniUygula(res.counts);
                renderIsTalepleri();
            }
        }).catch(function () { /* sayılar opsiyonel */ });
    }

    function yukleAcikIsTalepleriSupabase() {
        var varsayilanHata = 'Açık iş talepleri yüklenemedi. Lütfen daha sonra tekrar deneyin.';

        if (!window.AurixSupabase || typeof AurixSupabase.getirAcikIsTalepleri !== 'function') {
            state.isTalepleriHata = 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.';
            state.liveIsTalepleri = [];
            renderIsTalepleri();
            return Promise.resolve();
        }
        if (!AurixSupabase.baglantiHazirMi()) {
            state.isTalepleriHata = 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.';
            state.liveIsTalepleri = [];
            renderIsTalepleri();
            return Promise.resolve();
        }

        state.isTalepleriYukleniyor = true;
        return AurixSupabase.getirAcikIsTalepleri().then(function (res) {
            state.isTalepleriYukleniyor = false;
            if (!res || !res.ok) {
                state.isTalepleriHata = (res && res.error) ? String(res.error) : varsayilanHata;
                state.liveIsTalepleri = [];
                renderIsTalepleri();
                return;
            }
            state.isTalepleriHata = null;
            state.liveIsTalepleri = (res.data || []).map(supabaseIsTalebiMap);
            renderIsTalepleri();
            return yukleTeklifSayilariSupabase();
        }).catch(function () {
            state.isTalepleriYukleniyor = false;
            state.isTalepleriHata = varsayilanHata;
            state.liveIsTalepleri = [];
            renderIsTalepleri();
        });
    }

    function yukleFirmalarSupabase() {
        var varsayilanHata = 'Firmalar yüklenemedi. Lütfen daha sonra tekrar deneyin.';

        if (!window.AurixSupabase || typeof AurixSupabase.getirDogrulanmisFirmalar !== 'function') {
            state.firmalarHata = 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.';
            state.liveFirmalar = [];
            renderVitrin();
            renderFirmaBolumleri();
            renderKategoriGruplari();
            renderSponsorAnaSayfa();
            return Promise.resolve();
        }
        if (!AurixSupabase.baglantiHazirMi()) {
            state.firmalarHata = 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.';
            state.liveFirmalar = [];
            renderVitrin();
            renderFirmaBolumleri();
            renderKategoriGruplari();
            renderSponsorAnaSayfa();
            return Promise.resolve();
        }

        state.firmalarYukleniyor = true;
        return AurixSupabase.getirDogrulanmisFirmalar().then(function (res) {
            state.firmalarYukleniyor = false;
            if (!res || !res.ok) {
                state.firmalarHata = (res && res.error) ? String(res.error) : varsayilanHata;
                state.liveFirmalar = [];
                renderVitrin();
                renderFirmaBolumleri();
                renderKategoriGruplari();
                renderSponsorAnaSayfa();
                return;
            }
            state.firmalarHata = null;
            state.liveFirmalar = (res.data || []).map(supabaseFirmaMap);
            renderVitrin();
            renderFirmaBolumleri();
            renderKategoriGruplari();
            renderSponsorAnaSayfa();
        }).catch(function () {
            state.firmalarYukleniyor = false;
            state.firmalarHata = varsayilanHata;
            state.liveFirmalar = [];
            renderVitrin();
            renderFirmaBolumleri();
            renderKategoriGruplari();
            renderSponsorAnaSayfa();
        });
    }

    function yukleCanliVerilerSupabase() {
        yukleHeroIstatistiklerSupabase();
        yukleFirmalarSupabase();
        yukleAcikIsTalepleriSupabase();
    }

    function firmaKartAnaProHtml(firma, kapakAttrs) {
        var kat = kategoriBul(firma.kategoriId);
        var aciklama = (firma.aciklama || '').trim();

        return '<article class="firma-kart firma-kart--ana firma-kart--kompakt" data-id="' + esc(firma.id) + '">' +
            firmaAnaKapakHtml(firma, firma.ad, kapakAttrs) +
            '<div class="firma-kart__govde">' +
            '<div class="firma-kart__baslik-satir">' +
            '<h3 class="firma-kart__ad">' + esc(firma.ad) + '</h3>' +
            '<span class="firma-kart__dogrulandi firma-kart__dogrulandi--inline">Doğrulandı</span>' +
            '</div>' +
            '<p class="firma-kart__hizmet">' + esc(kat.ad) + '</p>' +
            '<p class="firma-kart__sehir">' + esc(firma.sehir) + '</p>' +
            (aciklama ? '<p class="firma-kart__aciklama firma-kart__aciklama--kisa">' + esc(aciklama) + '</p>' : '') +
            '<div class="firma-kart__aksiyon firma-kart__aksiyon--kompakt">' +
            '<button type="button" class="btn btn--primary btn--sm" data-teklif="' + esc(firma.id) + '">Teklif Al</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-detay="' + esc(firma.id) + '">Profili Gör</button>' +
            '</div></div></article>';
    }

    function firmaGuvenHtml(firma) {
        if (firma.durum === 'onaylandi') {
            return '<div class="firma-kart__puan-alan"><span class="firma-kart__dogrulandi">Doğrulandı</span></div>';
        }
        return '';
    }

    function firmaKartHtml(firma, opts) {
        opts = opts || {};
        var kapakAttrs = opts.kapakAttrs;
        if (opts.anaSayfa && firma.durum === 'onaylandi') {
            return firmaKartAnaProHtml(firma, kapakAttrs);
        }
        var kat = kategoriBul(firma.kategoriId);
        var anaSayfa = !!opts.anaSayfa;
        var premiumCls = (!anaSayfa && firma.premium) ? ' firma-kart--premium' : '';
        var partnerBadge = (!anaSayfa && firma.sponsor) ? '<span class="firma-kart__partner">PARTNER</span>' : '';
        var dogrulandi = (!anaSayfa && firma.durum === 'onaylandi')
            ? '<span class="firma-kart__dogrulandi">Doğrulandı</span>'
            : (anaSayfa ? '' : '');
        var premiumEtiket = (!anaSayfa && firma.premium) ? '<span class="firma-kart__premium">PREMIUM</span>' : '';
        var gorselIcerik = firmaGorselAlaniHtml(firma, firma.ad, {
            imgClass: 'firma-kart__gorsel-img',
            width: 400,
            height: 200,
            kapakAttrs: kapakAttrs
        });
        var guvenHtml = firmaGuvenHtml(firma);
        var birincilBtn = anaSayfa
            ? '<button type="button" class="btn btn--primary btn--sm" data-teklif="' + esc(firma.id) + '">Teklif Al</button>'
            : '<button type="button" class="btn btn--ghost btn--sm" data-detay="' + esc(firma.id) + '">Detayları Gör</button>';

        return '<article class="firma-kart' + premiumCls + (anaSayfa ? ' firma-kart--ana' : '') + '" data-id="' + esc(firma.id) + '">' +
            premiumEtiket + partnerBadge + dogrulandi +
            '<div class="firma-kart__gorsel">' + gorselIcerik + '</div>' +
            '<div class="firma-kart__govde">' +
            '<div class="firma-kart__kat-rozet">' +
            '<span class="firma-kart__kat-ikon">' + kat.ikon + '</span>' +
            '<span class="firma-kart__kat-ad">' + esc(kat.ad) + '</span>' +
            '</div>' +
            '<div class="firma-kart__ust">' +
            '<h3 class="firma-kart__ad">' + esc(firma.ad) + '</h3>' +
            '<span class="firma-kart__sehir">' + esc(firma.sehir) + '</span>' +
            '</div>' +
            guvenHtml +
            '<div class="firma-kart__aksiyon">' + birincilBtn +
            '</div></div></article>';
    }

    function firmaKartVitrinHtml(firma, kapakAttrs) {
        var kat = kategoriBul(firma.kategoriId);
        var gorselIcerik = firmaGorselAlaniHtml(firma, firma.ad, {
            imgClass: 'firma-kart__gorsel-img',
            width: 400,
            height: 200,
            kapakAttrs: kapakAttrs
        });
        var logoSrc = firma.logo ? safeUrl(firma.logo, '') : '';
        var logoIcerik = logoSrc
            ? '<img class="aurix-img-fallback" src="' + esc(logoSrc) + '" alt="" width="48" height="48" loading="lazy" decoding="async" data-remove-parent=".firma-kart__logo">'
            : '<span class="firma-kart__logo-harf">' + esc(firmaBasHarfleri(firma.ad)) + '</span>';
        var aciklama = (firma.aciklama || '').trim();
        var dogrulandiBadge = '<span class="firma-kart__dogrulandi firma-kart__dogrulandi--vitrin">Doğrulandı</span>';

        return '<article class="firma-kart firma-kart--vitrin" data-id="' + esc(firma.id) + '">' +
            '<div class="firma-kart__gorsel">' + gorselIcerik + '</div>' +
            '<div class="firma-kart__govde">' +
            '<div class="firma-kart__kimlik">' +
            '<div class="firma-kart__logo">' + logoIcerik + '</div>' +
            '<div class="firma-kart__kimlik-metin">' +
            '<div class="firma-kart__baslik-satir">' +
            '<h3 class="firma-kart__ad">' + esc(firma.ad || '—') + '</h3>' +
            dogrulandiBadge +
            '</div>' +
            '<div class="firma-kart__meta">' +
            '<span class="firma-kart__sehir">' + esc(firma.sehir || '—') + '</span>' +
            '<span class="firma-kart__kat-rozet">' +
            '<span class="firma-kart__kat-ikon">' + kat.ikon + '</span>' +
            '<span class="firma-kart__kat-ad">' + esc(kat.ad || '—') + '</span>' +
            '</span></div></div></div>' +
            '<p class="firma-kart__aciklama">' + esc(aciklama || '—') + '</p>' +
            '<div class="firma-kart__aksiyon">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-detay="' + esc(firma.id) + '">Profili Gör</button>' +
            '<button type="button" class="btn btn--primary btn--sm" data-teklif="' + esc(firma.id) + '">Teklif Gönder</button>' +
            '</div></div></article>';
    }

    function renderVitrinSayfalama(toplam, aktifSayfa, sayfaBoyutu) {
        var nav = $('vitrinSayfalama');
        if (!nav) return;
        var toplamSayfa = Math.max(1, Math.ceil(toplam / sayfaBoyutu));
        if (toplamSayfa <= 1) {
            nav.innerHTML = '';
            nav.hidden = true;
            return;
        }
        nav.hidden = false;
        var html = '<button type="button" class="vitrin-sayfa-btn" data-sayfa="prev"' +
            (aktifSayfa <= 1 ? ' disabled' : '') + ' aria-label="Önceki sayfa">‹</button>';
        for (var i = 1; i <= toplamSayfa; i++) {
            html += '<button type="button" class="vitrin-sayfa-btn' +
                (i === aktifSayfa ? ' vitrin-sayfa-btn--aktif' : '') +
                '" data-sayfa="' + i + '" aria-label="Sayfa ' + i + '"' +
                (i === aktifSayfa ? ' aria-current="page"' : '') + '>' + i + '</button>';
        }
        html += '<button type="button" class="vitrin-sayfa-btn" data-sayfa="next"' +
            (aktifSayfa >= toplamSayfa ? ' disabled' : '') + ' aria-label="Sonraki sayfa">›</button>';
        nav.innerHTML = html;
    }

    function baglaVitrinSayfalama(toplam, sayfaBoyutu) {
        var nav = $('vitrinSayfalama');
        if (!nav) return;
        nav.querySelectorAll('.vitrin-sayfa-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (btn.disabled) return;
                var hedef = btn.getAttribute('data-sayfa');
                var toplamSayfa = Math.max(1, Math.ceil(toplam / sayfaBoyutu));
                if (hedef === 'prev') state.vitrin.sayfa = Math.max(1, state.vitrin.sayfa - 1);
                else if (hedef === 'next') state.vitrin.sayfa = Math.min(toplamSayfa, state.vitrin.sayfa + 1);
                else state.vitrin.sayfa = parseInt(hedef, 10) || 1;
                renderVitrin(false);
                var grid = $('vitrinGrid');
                if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    function firmalariBolumeGore(kategoriIds, limit) {
        var list = onayliFirmalar().filter(function (f) {
            return kategoriIds.indexOf(f.kategoriId) !== -1;
        });
        list.sort(function (a, b) {
            if (a.premium !== b.premium) return a.premium ? -1 : 1;
            if (a.sponsor !== b.sponsor) return a.sponsor ? -1 : 1;
            return (b.puan || 0) - (a.puan || 0);
        });
        return typeof limit === 'number' ? list.slice(0, limit) : list;
    }

    function renderFirmaBolumleri() {
        if (!AURIX_DATA.FIRMA_BOLUMLERI) return;
        AURIX_DATA.FIRMA_BOLUMLERI.forEach(function (bolum) {
            var el = $(bolum.gridId);
            if (!el) return;
            var limit = bolum.gridId === 'ureticilerGrid' ? 3 : 6;
            var list = firmalariBolumeGore(bolum.kategoriler, limit);
            var kapak = createKapakSirasi();
            el.innerHTML = list.length
                ? list.map(function (f) {
                    return firmaKartHtml(f, {
                        anaSayfa: bolum.gridId === 'ureticilerGrid',
                        kapakAttrs: kapak.attrs(f)
                    });
                }).join('')
                : '<p class="bolum-bos">Henüz doğrulanmış firma bulunmuyor.</p>';
            baglaKartEventleri(el);
        });
    }

    function guncelleSehirChipAktif() {
        var sehir = state.filtre.sehir || '';
        document.querySelectorAll('#filtreSehirChips .filtre-chip').forEach(function (btn) {
            btn.classList.toggle('filtre-chip--aktif', (btn.getAttribute('data-sehir') || '') === sehir);
        });
    }

    function guncelleFiltreChipAktif() {
        var grupId = state.filtre.grupId || '';
        var katId = state.filtre.kategoriId || '';
        document.querySelectorAll('#filtreGrupChips .filtre-chip').forEach(function (btn) {
            var bg = btn.getAttribute('data-grup') || '';
            var bk = btn.getAttribute('data-kat') || '';
            var aktif = bk ? (bk === katId) : (!katId && bg === grupId);
            btn.classList.toggle('filtre-chip--aktif', aktif);
        });
        var sehirSel = $('filtreSehir');
        if (sehirSel) sehirSel.value = state.filtre.sehir || '';
        guncelleSehirChipAktif();
    }

    function renderSehirChips() {
        var el = $('filtreSehirChips');
        if (!el || !AURIX_DATA.SEHIRLER) return;

        var html = '<button type="button" class="filtre-chip filtre-chip--sehir' +
            (!state.filtre.sehir ? ' filtre-chip--aktif' : '') +
            '" data-sehir="">Tümü</button>';
        AURIX_DATA.SEHIRLER.forEach(function (s) {
            html += '<button type="button" class="filtre-chip filtre-chip--sehir' +
                (state.filtre.sehir === s ? ' filtre-chip--aktif' : '') +
                '" data-sehir="' + esc(s) + '">' + esc(s) + '</button>';
        });
        el.innerHTML = html;

        el.querySelectorAll('.filtre-chip').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.filtre.sehir = btn.getAttribute('data-sehir') || '';
                var sehirSel = $('filtreSehir');
                if (sehirSel) sehirSel.value = state.filtre.sehir;
                guncelleSehirChipAktif();
                vitrinSayfaSifirla();
                renderVitrin();
            });
        });
    }

    function renderFiltreChips() {
        var grupEl = $('filtreGrupChips');
        if (!grupEl) return;

        grupEl.innerHTML = (AURIX_DATA.FILTRE_GRUPLARI || []).map(function (g) {
            return '<button type="button" class="filtre-chip' + (!state.filtre.grupId && !state.filtre.kategoriId && g.id === '' ? ' filtre-chip--aktif' : '') + '" data-grup="' + g.id + '">' + g.baslik + '</button>';
        }).join('');

        grupEl.querySelectorAll('.filtre-chip').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.filtre.grupId = btn.getAttribute('data-grup') || '';
                state.filtre.kategoriId = '';
                guncelleFiltreChipAktif();
                vitrinSayfaSifirla();
                renderVitrin();
            });
        });

        guncelleFiltreChipAktif();
    }

    function renderVitrin(sayfaSifirla) {
        if (sayfaSifirla !== false) vitrinSayfaSifirla();
        var el = $('vitrinGrid');
        var sayac = $('vitrinSayac');
        var siralamaSel = $('vitrinSiralama');
        if (!el) return;

        if (siralamaSel && siralamaSel.value !== state.vitrin.siralama) {
            siralamaSel.value = state.vitrin.siralama;
        }

        if (state.firmalarHata) {
            if (sayac) sayac.textContent = '';
            el.innerHTML = '<p class="bolum-bos bolum-bos--hata" role="alert">' +
                esc(state.firmalarHata) + '</p>';
            renderVitrinSayfalama(0, 1, state.vitrin.boyut || 9);
            return;
        }

        var list = siraliVitrinFirmalari(filtreliFirmalar());
        var boyut = state.vitrin.boyut || 9;
        var toplamSayfa = Math.max(1, Math.ceil(list.length / boyut));
        if (state.vitrin.sayfa > toplamSayfa) state.vitrin.sayfa = toplamSayfa;
        if (state.vitrin.sayfa < 1) state.vitrin.sayfa = 1;

        var baslangic = (state.vitrin.sayfa - 1) * boyut;
        var sayfaList = list.slice(baslangic, baslangic + boyut);

        if (sayac) {
            if (!list.length) {
                if (!onayliFirmalar().length) {
                    sayac.textContent = '';
                } else if (filtreAktifMi()) {
                    sayac.textContent = 'Aramanıza uygun firma bulunamadı.';
                } else {
                    sayac.textContent = '';
                }
            } else if (list.length <= boyut) {
                sayac.textContent = list.length + ' firma listeleniyor';
            } else {
                sayac.textContent = list.length + ' firma · Sayfa ' + state.vitrin.sayfa + ' / ' + toplamSayfa;
            }
        }

        if (!sayfaList.length) {
            if (!onayliFirmalar().length) {
                el.innerHTML = '<p class="bolum-bos">Henüz doğrulanmış firma bulunmuyor.</p>';
            } else {
                el.innerHTML = '<div class="bos-durum vitrin-bos-durum"><div class="bos-durum__ikon">🔍</div><p>Aramanıza uygun firma bulunamadı.</p><p class="vitrin-bos-durum__alt">Filtreleri temizleyerek tekrar deneyin.</p></div>';
            }
            renderVitrinSayfalama(list.length, state.vitrin.sayfa, boyut);
            return;
        }

        var kapak = createKapakSirasi();
        el.innerHTML = sayfaList.map(function (f) { return firmaKartVitrinHtml(f, kapak.attrs(f)); }).join('');
        baglaKartEventleri(el);
        renderVitrinSayfalama(list.length, state.vitrin.sayfa, boyut);
        baglaVitrinSayfalama(list.length, boyut);
    }

    function renderKategoriGruplari() {
        var el = $('kategoriGruplari');
        if (!el) return;
        var anaListe = AURIX_DATA.ESNAF_ANA_KATEGORILER;

        if (anaListe && anaListe.length) {
            el.className = 'esnaf-kategori-grid kategori-gruplar--fuar esnaf-kategori-grid--adet-' + anaListe.length;
            el.innerHTML = anaListe.map(function (item) {
                var firmaSay = kategoriFirmaSayisiGoster(item);
                var isSay = kategoriIsSayisi(item);
                return '<button type="button" class="esnaf-kategori-kutu esnaf-kategori-kutu--pro" data-kat="' + item.id + '">' +
                    '<span class="esnaf-kategori-kutu__ikon-buyuk" aria-hidden="true">' + item.sembol + '</span>' +
                    '<span class="esnaf-kategori-kutu__ad">' + item.ad + '</span>' +
                    '<span class="esnaf-kategori-kutu__sayilar">' +
                    '<span><strong>' + firmaSay + '</strong> firma</span>' +
                    '<span><strong>' + isSay + '</strong> açık iş</span></span>' +
                    '<span class="esnaf-kategori-kutu__aciklama">' + (item.aciklama || '') + '</span></button>';
            }).join('');
        } else {
            el.className = 'kategori-gruplar kategori-gruplar--fuar';
            el.innerHTML = AURIX_DATA.KATEGORI_GRUPLARI.map(function (grup) {
                var chips = grup.kategoriler.map(function (kid) {
                    var k = kategoriBul(kid);
                    return '<button type="button" class="kategori-chip" data-kat="' + kid + '">' + k.ikon + ' ' + k.ad + '</button>';
                }).join('');
                return '<div class="kategori-grup">' +
                    '<div class="kategori-grup__baslik"><span class="kategori-grup__ikon">' + grup.ikon + '</span>' + grup.baslik + '</div>' +
                    '<div class="kategori-grup__liste">' + chips + '</div></div>';
            }).join('');
        }

        el.querySelectorAll('[data-kat]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var kid = btn.getAttribute('data-kat');
                var item = (AURIX_DATA.ESNAF_ANA_KATEGORILER || []).find(function (k) { return k.id === kid; });
                if (item && item.ozelSayfa === 'malzeme') {
                    sayfaGoster('malzeme');
                    return;
                }
                var grup = kategoriGrupBul(kid);
                state.filtre.kategoriId = kid;
                state.filtre.grupId = grup ? grup.id : '';
                guncelleFiltreChipAktif();
                vitrinSayfaSifirla();
                renderVitrin();
                sayfaGoster('firmalar');
            });
        });
    }

    function renderIsTalepleri() {
        var el = $('isTalepleriGrid');
        if (!el) return;

        if (state.isTalepleriHata) {
            el.innerHTML = '<p class="bolum-bos bolum-bos--hata" role="alert">' +
                esc(state.isTalepleriHata) + '</p>';
            return;
        }

        var liste = onayliIsTalepleri();
        if (!liste.length) {
            el.innerHTML = '<p class="bolum-bos">Henüz açık iş talebi bulunmuyor.</p>';
            return;
        }

        el.innerHTML = liste.map(function (talep) {
            var kat = kategoriBul(talep.kategoriId);
            var teklifMetin = (talep.teklifSayisi != null ? talep.teklifSayisi : 0) + ' teklif';
            var ozet = String(talep.aciklama || '')
                .split(/\n+/)
                .filter(function (s) { return s && !/^(Adet|Teslim|Bütçe)/i.test(s.trim()); })
                .join(' ')
                .trim();
            var butceHtml = (talep.butce && talep.butce !== '—')
                ? '<li><span>Bütçe</span><strong>' + esc(talep.butce) + '</strong></li>'
                : '';
            var teklifBtn = '<button type="button" class="btn btn--primary btn--sm is-talep-kart__btn" data-teklif-is="' + esc(talep.id) + '">Teklif Ver</button>';
            var oturum = window.AuthService ? AuthService.getCurrentUser() : null;
            if (oturum && !oturum.isFirmaHesabi) {
                teklifBtn = '<span class="is-talep-kart__not" title="Yalnızca firma hesapları teklif verebilir">Firma hesabı gerekli</span>';
            }
            return '<article class="is-talep-kart is-talep-kart--pro" data-is-id="' + esc(talep.id) + '">' +
                '<div class="is-talep-kart__ust">' +
                '<div class="is-talep-kart__baslik-grup">' +
                '<h3 class="is-talep-kart__baslik">' + esc(talep.baslik || '—') + '</h3>' +
                '<span class="is-talep-kart__sehir">' + esc(talep.sehir || '—') + '</span></div>' +
                '<span class="is-talep-kart__kat">' + esc(kat.ad || '—') + '</span></div>' +
                (ozet ? '<p class="is-talep-kart__ozet">' + esc(ozet) + '</p>' : '') +
                '<ul class="is-talep-kart__detaylar is-talep-kart__detaylar--odak">' +
                '<li class="is-talep-kart__acilis"><span>Açılış</span><strong>' + esc(talep.acilisTarihi || '—') + '</strong></li>' +
                '<li><span>Teklif</span><strong>' + esc(teklifMetin) + '</strong></li>' +
                butceHtml +
                '</ul>' +
                teklifBtn +
                '</article>';
        }).join('');
        el.querySelectorAll('[data-teklif-is]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                teklifModalAc(btn.getAttribute('data-teklif-is'));
            });
        });
    }

    function renderCanliAktivite() {
        var el = $('canliAktiviteListe');
        if (!el) return;
        el.innerHTML = '';
        var bolum = el.closest('.bolum--canli-aktivite') || document.getElementById('canli-aktivite');
        if (bolum) bolum.hidden = true;
    }

    function initCanliAktiviteCanli() {
        /* Sahte canlı aktivite akışı kaldırıldı */
    }

    function malzemeUrunDurumEtiket(urun) {
        var ham = String(urun.urunDurum || urun.condition || '').trim().toLocaleLowerCase('tr-TR');
        if (!ham) return '';
        if (ham === 'sıfır' || ham === 'sifir' || ham === 'yeni') return 'Sıfır';
        if (ham === '2. el' || ham === '2 el' || ham === 'ikinci el' || ham === 'ikinciel') return '2. El';
        return '';
    }

    function malzemeKartHtml(urun) {
        var kat = malzemeKategoriBul(urun.kategoriId);
        var yedek = safeImageUrl('assets/images/malzeme.jpg', 'assets/images/malzeme.jpg');
        var gorsel = safeImageUrl(urun.gorsel, yedek);
        var durumEtiket = malzemeUrunDurumEtiket(urun);
        var sehir = (urun.sehir || '').trim();
        return '<article class="malzeme-kart" data-malzeme-id="' + esc(urun.id) + '">' +
            '<div class="malzeme-kart__gorsel">' +
            '<img class="aurix-img-fallback" src="' + esc(gorsel) + '" alt="' + esc(urun.baslik) + '" width="320" height="200" loading="lazy" decoding="async" data-fallback-src="' + esc(yedek) + '" data-fallback-final="' + esc(yedek) + '">' +
            (durumEtiket ? '<span class="malzeme-kart__urun-durum">' + esc(durumEtiket) + '</span>' : '') +
            '</div>' +
            '<div class="malzeme-kart__govde">' +
            '<span class="malzeme-kart__kat">' + esc(kat.ad) + '</span>' +
            '<h3 class="malzeme-kart__baslik">' + esc(urun.baslik) + '</h3>' +
            '<div class="malzeme-kart__meta">' +
            '<span class="malzeme-kart__fiyat">' + esc(urun.fiyat) + '</span>' +
            (sehir ? '<span class="malzeme-kart__sehir">' + esc(sehir) + '</span>' : '') +
            '</div>' +
            '<button type="button" class="btn btn--ghost btn--sm malzeme-kart__btn" data-malzeme-detay="' + esc(urun.id) + '">Detayları Gör</button>' +
            '</div></article>';
    }

    function filtreliMalzemeUrunleri() {
        var list = onayliMalzemeler();
        var arama = (state.malzeme.arama || '').toLocaleLowerCase('tr-TR');
        var katId = state.malzeme.kategoriId;
        return list.filter(function (u) {
            if (katId && u.kategoriId !== katId) return false;
            if (!arama) return true;
            var kat = malzemeKategoriBul(u.kategoriId);
            var metin = ((u.baslik || '') + ' ' + (u.satici || '') + ' ' + (u.sehir || '') + ' ' + kat.ad).toLocaleLowerCase('tr-TR');
            return metin.indexOf(arama) !== -1;
        });
    }

    function renderMalzemePazari() {
        var chipEl = $('malzemeKategoriChips');
        var grid = $('malzemeGrid');
        var sayac = $('malzemeSayac');
        if (!grid) return;

        if (chipEl) {
            var kategoriler = AURIX_DATA.MALZEME_KATEGORILER || [];
            chipEl.innerHTML = '<button type="button" class="malzeme-chip' + (!state.malzeme.kategoriId ? ' malzeme-chip--aktif' : '') + '" data-malzeme-kat="">Tümü</button>' +
                kategoriler.map(function (k) {
                    var aktif = state.malzeme.kategoriId === k.id;
                    return '<button type="button" class="malzeme-chip' + (aktif ? ' malzeme-chip--aktif' : '') + '" data-malzeme-kat="' + k.id + '">' + k.ikon + ' ' + k.ad + '</button>';
                }).join('');
            chipEl.querySelectorAll('[data-malzeme-kat]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    state.malzeme.kategoriId = btn.getAttribute('data-malzeme-kat') || '';
                    renderMalzemePazari();
                });
            });
        }

        var list = filtreliMalzemeUrunleri();
        if (sayac) {
            sayac.textContent = list.length
                ? (list.length + ' ürün listeleniyor')
                : '';
        }
        if (!list.length) {
            var aramaVar = !!(state.malzeme.arama || state.malzeme.kategoriId);
            grid.innerHTML = '<div class="bos-durum"><p>' +
                esc(aramaVar
                    ? 'Aramanıza uygun ürün bulunamadı.'
                    : 'Henüz malzeme ilanı bulunmuyor.') +
                '</p></div>';
            return;
        }
        grid.innerHTML = list.map(malzemeKartHtml).join('');

        grid.querySelectorAll('[data-malzeme-detay]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-malzeme-detay');
                var urun = onayliMalzemeler().find(function (u) { return String(u.id) === String(id); });
                if (!urun) return;
                var kat = malzemeKategoriBul(urun.kategoriId);
                var durum = malzemeUrunDurumEtiket(urun);
                toast(
                    urun.baslik +
                    ' · ' + kat.ad +
                    (urun.sehir ? ' · ' + urun.sehir : '') +
                    (durum ? ' · ' + durum : '') +
                    ' · ' + (urun.fiyat || ''),
                    'info'
                );
            });
        });
    }

    function renderNedenAurix() {
        var el = $('nedenGrid');
        if (!el || !AURIX_DATA.NEDEN_AURIX) return;
        el.innerHTML = AURIX_DATA.NEDEN_AURIX.map(function (item, i) {
            return '<article class="neden-kart" data-reveal style="--reveal-delay:' + (i * 80) + 'ms">' +
                '<div class="neden-kart__ikon neden-kart__ikon--' + item.ikon + '" aria-hidden="true"></div>' +
                '<h3 class="neden-kart__baslik">' + item.baslik + '</h3>' +
                '<p class="neden-kart__metin">' + item.metin + '</p></article>';
        }).join('');
        initScrollReveal(el);
    }

    function initScrollReveal(container) {
        if (!container) return;
        if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            container.querySelectorAll('[data-reveal]').forEach(function (el) {
                el.classList.add('is-visible');
            });
            return;
        }
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
        container.querySelectorAll('[data-reveal]').forEach(function (el) {
            observer.observe(el);
        });
    }

    function renderKategoriSelectler() {
        var opts = AURIX_DATA.KATEGORILER.map(function (k) {
            return '<option value="' + k.id + '">' + k.ikon + ' ' + k.ad + '</option>';
        }).join('');
        var sehirOpts = AURIX_DATA.SEHIRLER.map(function (s) {
            return '<option value="' + s + '">' + s + '</option>';
        }).join('');

        var firmaBasvuruKat = $('firmaBasvuruKategori');
        if (firmaBasvuruKat) firmaBasvuruKat.innerHTML = opts;
        var firmaBasvuruSehir = $('firmaBasvuruSehir');
        if (firmaBasvuruSehir) firmaBasvuruSehir.innerHTML = sehirOpts;

        var isTalepKat = $('isTalepKategori');
        if (isTalepKat) isTalepKat.innerHTML = opts;
        var isTalepSehir = $('isTalepSehir');
        if (isTalepSehir) isTalepSehir.innerHTML = sehirOpts;

        var adminKayitKat = $('adminKayitKategori');
        if (adminKayitKat) adminKayitKat.innerHTML = opts;
        var adminKayitSehir = $('adminKayitSehir');
        if (adminKayitSehir) adminKayitSehir.innerHTML = sehirOpts;

        var filtreSehir = $('filtreSehir');
        if (filtreSehir) {
            filtreSehir.innerHTML = '<option value="">Tüm Şehirler</option>' + sehirOpts;
            filtreSehir.value = state.filtre.sehir || '';
        }
    }

    function kategoriGrupAdi(kategoriId) {
        var gruplar = AURIX_DATA.FILTRE_GRUPLARI || [];
        for (var i = 0; i < gruplar.length; i++) {
            if (gruplar[i].kategoriler && gruplar[i].kategoriler.indexOf(kategoriId) !== -1) {
                return gruplar[i].baslik;
            }
        }
        return '—';
    }

    function adminDurumEtiket(durum) {
        var map = {
            beklemede: 'Beklemede',
            onaylandi: 'Onaylandı',
            askida: 'Askıda',
            reddedildi: 'Reddedildi'
        };
        return map[durum] || durum;
    }

    function adminTabloSatirlari() {
        var arama = (state.adminArama || '').toLowerCase();
        var kaynak = state.adminBekleyenFirmalar || [];
        return kaynak.filter(function (f) {
            if (state.adminLokalRedler && state.adminLokalRedler[String(f.id)]) return false;
            if (!arama) return true;
            var ad = (f.firma_adi || f.ad || '').toLowerCase();
            var sehir = (f.sehir || '').toLowerCase();
            var kat = (f.kategori || '').toLowerCase();
            var email = (f.email || '').toLowerCase();
            return ad.indexOf(arama) !== -1 || sehir.indexOf(arama) !== -1 ||
                kat.indexOf(arama) !== -1 || email.indexOf(arama) !== -1;
        });
    }

    function adminAksiyonHtml(f) {
        var id = f.id;
        return '<button type="button" class="admin-btn admin-btn--onay" data-sb-onay="' + esc(String(id)) + '" title="Onayla">Onayla</button>' +
            '<button type="button" class="admin-btn admin-btn--red" data-sb-red="' + esc(String(id)) + '" title="Reddet">Reddet</button>';
    }

    var DEMO_GELIR = {
        uyelikBirim: 200,
        premiumBirim: 500,
        partnerBirim: 1000,
        komisyon: 0
    };

    function tlFormat(tutar) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(tutar || 0);
    }

    function adminGelirHesapla() {
        var firmalar = state.firmalar;
        var onayliSay = firmalar.filter(function (f) { return f.durum === 'onaylandi'; }).length;
        var premiumSay = firmalar.filter(function (f) { return f.premium; }).length;
        var partnerSay = firmalar.filter(function (f) { return f.sponsor; }).length;

        var uyelik = onayliSay * DEMO_GELIR.uyelikBirim;
        var premium = premiumSay * DEMO_GELIR.premiumBirim;
        var partner = partnerSay * DEMO_GELIR.partnerBirim;
        var komisyon = DEMO_GELIR.komisyon;
        var aylik = uyelik + premium + partner + komisyon;

        return {
            uyelik: uyelik,
            premium: premium,
            partner: partner,
            komisyon: komisyon,
            aylik: aylik,
            yillik: aylik * 12
        };
    }

    function renderAdminGelir() {
        var gelir = adminGelirHesapla();
        var uyelikEl = $('adminGelirUyelik');
        var premiumEl = $('adminGelirPremium');
        var partnerEl = $('adminGelirPartner');
        var komisyonEl = $('adminGelirKomisyon');
        var aylikEl = $('adminGelirAylik');
        var yillikEl = $('adminGelirYillik');

        if (uyelikEl) uyelikEl.textContent = tlFormat(gelir.uyelik);
        if (premiumEl) premiumEl.textContent = tlFormat(gelir.premium);
        if (partnerEl) partnerEl.textContent = tlFormat(gelir.partner);
        if (komisyonEl) komisyonEl.textContent = tlFormat(gelir.komisyon);
        if (aylikEl) aylikEl.textContent = tlFormat(gelir.aylik);
        if (yillikEl) yillikEl.textContent = tlFormat(gelir.yillik);
    }

    function renderAdminOzet() {
        var firmalar = state.firmalar;
        var toplam = $('adminToplam');
        var bekleyen = $('adminBekleyen');
        var onayli = $('adminOnayli');
        var partner = $('adminPartner');
        var prem = $('adminPremium');
        if (toplam) toplam.textContent = firmalar.length;
        if (bekleyen) bekleyen.textContent = (state.adminBekleyenFirmalar || []).filter(function (f) {
            return !(state.adminLokalRedler && state.adminLokalRedler[String(f.id)]);
        }).length;
        if (onayli) onayli.textContent = (state.liveFirmalar && state.liveFirmalar.length)
            ? state.liveFirmalar.length
            : firmalar.filter(function (f) { return f.durum === 'onaylandi'; }).length;
        if (partner) partner.textContent = firmalar.filter(function (f) { return f.sponsor; }).length;
        if (prem) prem.textContent = firmalar.filter(function (f) { return f.premium; }).length;
        renderAdminGelir();
    }

    function adminBasvuruTarihi(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('tr-TR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function adminBekleyenKartHtml(f) {
        var id = f.id;
        var ad = f.firma_adi || f.ad || '—';
        return '<article class="admin-bekleyen-kart" data-id="' + esc(String(id)) + '">' +
            '<div class="admin-bekleyen-kart__ust">' +
            '<h3 class="admin-bekleyen-kart__ad">' + esc(ad) + '</h3>' +
            '<span class="durum durum--beklemede">Beklemede</span>' +
            '</div>' +
            '<dl class="admin-bekleyen-kart__meta">' +
            '<div><dt>Şehir</dt><dd>' + esc(f.sehir || '—') + '</dd></div>' +
            '<div><dt>Kategori</dt><dd>' + esc(f.kategori || '—') + '</dd></div>' +
            '<div><dt>Başvuru</dt><dd>' + esc(adminBasvuruTarihi(f.created_at)) + '</dd></div>' +
            '<div><dt>Telefon</dt><dd>' + esc(f.telefon || f.tel || '—') + '</dd></div>' +
            '<div><dt>E-posta</dt><dd>' + esc(f.email || '—') + '</dd></div>' +
            '</dl>' +
            '<p class="admin-bekleyen-kart__aciklama">' + esc(f.aciklama || '—') + '</p>' +
            '<div class="admin-aksiyon admin-aksiyon--kart">' +
            '<button type="button" class="btn btn--primary btn--sm" data-sb-onay="' + esc(String(id)) + '">Onayla</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-sb-red="' + esc(String(id)) + '">Reddet</button>' +
            '</div></article>';
    }

    function renderAdminTablo() {
        var liste = $('adminBekleyenListe');
        if (!liste) return;
        var rows = adminTabloSatirlari();

        if (state.adminBekleyenHata) {
            liste.innerHTML = '<p class="admin-bekleyen-bos admin-bekleyen-bos--hata" role="alert">' +
                esc(state.adminBekleyenHata) + '</p>';
            renderAdminOzet();
            return;
        }

        if (!rows.length) {
            liste.innerHTML = '<p class="admin-bekleyen-bos">Henüz bekleyen firma başvurusu yok.</p>';
            renderAdminOzet();
            return;
        }

        liste.innerHTML = rows.map(adminBekleyenKartHtml).join('');

        liste.querySelectorAll('[data-sb-onay]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminSbOnayla(btn.getAttribute('data-sb-onay'), btn);
            });
        });
        liste.querySelectorAll('[data-sb-red]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminSbReddet(btn.getAttribute('data-sb-red'), btn);
            });
        });

        renderAdminOzet();
    }

    function yukleAdminBekleyenFirmalar() {
        if (!isAdminSession() || !window.AurixSupabase || typeof AurixSupabase.adminFirmalar !== 'function') {
            return;
        }
        AurixSupabase.adminFirmalar('list').then(function (res) {
            if (!res || !res.ok) {
                state.adminBekleyenFirmalar = [];
                state.adminBekleyenHata = (res && res.error)
                    ? String(res.error)
                    : 'Admin işlemleri için Edge Function deploy edilmeli.';
                renderAdminTablo();
                return;
            }
            state.adminBekleyenHata = null;
            state.adminBekleyenFirmalar = res.data || [];
            renderAdminTablo();
        });
    }

    function adminSbOnayla(id, btn) {
        if (!isAdminSession()) return;
        if (btn) btn.disabled = true;
        AurixSupabase.adminFirmalar('approve', { id: id }).then(function (res) {
            if (btn) btn.disabled = false;
            if (!res || !res.ok) {
                toast((res && res.error) || 'Onay başarısız.', 'error');
                return;
            }
            toast(res.message || 'Firma onaylandı.', 'success');
            yukleAdminBekleyenFirmalar();
            yukleCanliVerilerSupabase();
        });
    }

    function adminSbReddet(id, btn) {
        if (!isAdminSession()) return;
        if (btn) btn.disabled = true;
        AurixSupabase.adminFirmalar('reject', { id: id }).then(function (res) {
            if (btn) btn.disabled = false;
            if (!res || !res.ok) {
                toast((res && res.error) || 'Red işlemi başarısız.', 'error');
                return;
            }
            toast(res.message || 'Firma reddedildi.', 'success');
            yukleAdminBekleyenFirmalar();
        });
    }

    function adminModDurumEtiket(durum) {
        var map = { beklemede: 'Beklemede', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi' };
        return map[durum] || durum || '—';
    }

    function adminKullaniciDurumHtml(u) {
        var tip = safeCss(u.durumTip || u.durum, 'aktif');
        return '<span class="admin-mod-durum admin-mod-durum--' + tip + '">' + esc(u.durum || '—') + '</span>';
    }

    function adminModListeBos(metin) {
        return '<div class="admin-mod-bos"><p>' + esc(metin) + '</p></div>';
    }

    function renderAdminIsTalepleriSekme() {
        var el = $('adminSekmeIsTalepleri');
        if (!el) return;
        var bekleyen = state.isTalepleri.filter(function (t) { return t.moderasyon === 'beklemede'; });
        if (!bekleyen.length) {
            el.innerHTML = adminModListeBos('Bekleyen iş talebi yok.');
            return;
        }
        el.innerHTML = '<div class="admin-mod">' +
            '<h3 class="admin-mod__baslik">Bekleyen İş Talepleri</h3>' +
            '<ul class="admin-mod__liste" aria-label="Bekleyen iş talepleri">' +
            bekleyen.map(function (t) {
                return '<li class="admin-mod__oge">' +
                    '<div class="admin-mod__bilgi">' +
                    '<strong class="admin-mod__ad">' + esc(t.baslik || '—') + '</strong>' +
                    '<span class="admin-mod__meta">' + esc(t.sehir || '—') + ' · ' + esc(t.basvuru || t.acilisTarihi || '—') + '</span>' +
                    '<span class="admin-mod__meta">' + esc(t.butce || '—') + ' · ' + esc(t.termin || '—') + '</span>' +
                    '</div>' +
                    '<div class="admin-aksiyon">' +
                    '<button type="button" class="admin-btn admin-btn--onay" data-is-onay="' + esc(t.id) + '" title="Onayla">✓</button>' +
                    '<button type="button" class="admin-btn admin-btn--red" data-is-red="' + esc(t.id) + '" title="Reddet">✕</button>' +
                    '</div></li>';
            }).join('') +
            '</ul></div>';

        el.querySelectorAll('[data-is-onay]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminModerasyonGuncelle('is', btn.getAttribute('data-is-onay'), 'onaylandi');
            });
        });
        el.querySelectorAll('[data-is-red]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminModerasyonGuncelle('is', btn.getAttribute('data-is-red'), 'reddedildi');
            });
        });
    }

    function renderAdminMalzemelerSekme() {
        var el = $('adminSekmeMalzemeler');
        if (!el) return;
        var bekleyen = state.malzemeler.filter(function (u) { return u.moderasyon === 'beklemede'; });
        if (!bekleyen.length) {
            el.innerHTML = adminModListeBos('Bekleyen malzeme ilanı yok.');
            return;
        }
        el.innerHTML = '<div class="admin-mod">' +
            '<h3 class="admin-mod__baslik">Bekleyen Malzeme İlanları</h3>' +
            '<ul class="admin-mod__liste" aria-label="Bekleyen malzeme ilanları">' +
            bekleyen.map(function (u) {
                return '<li class="admin-mod__oge">' +
                    '<div class="admin-mod__bilgi">' +
                    '<strong class="admin-mod__ad">' + esc(u.baslik || '—') + '</strong>' +
                    '<span class="admin-mod__meta">' + esc(u.satici || '—') + ' · ' + esc(u.sehir || '—') + '</span>' +
                    '<span class="admin-mod__meta">' + esc(u.fiyat || '—') + ' · Başvuru: ' + esc(u.basvuru || '—') + '</span>' +
                    '</div>' +
                    '<div class="admin-aksiyon">' +
                    '<button type="button" class="admin-btn admin-btn--onay" data-mal-onay="' + esc(u.id) + '" title="Onayla">✓</button>' +
                    '<button type="button" class="admin-btn admin-btn--red" data-mal-red="' + esc(u.id) + '" title="Reddet">✕</button>' +
                    '</div></li>';
            }).join('') +
            '</ul></div>';

        el.querySelectorAll('[data-mal-onay]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminModerasyonGuncelle('malzeme', btn.getAttribute('data-mal-onay'), 'onaylandi');
            });
        });
        el.querySelectorAll('[data-mal-red]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminModerasyonGuncelle('malzeme', btn.getAttribute('data-mal-red'), 'reddedildi');
            });
        });
    }

    function renderAdminKullanicilarSekme() {
        var el = $('adminSekmeKullanicilar');
        if (!el) return;
        var liste = state.kullanicilar || [];
        if (!liste.length) {
            el.innerHTML = adminModListeBos('Kullanıcı kaydı yok.');
            return;
        }
        el.innerHTML = '<div class="admin-mod">' +
            '<h3 class="admin-mod__baslik">Kullanıcılar</h3>' +
            '<div class="admin-mod__tablo-wrap">' +
            '<table class="admin-tablo admin-tablo--mod">' +
            '<thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Şehir</th><th>Kayıt</th><th>Durum</th></tr></thead>' +
            '<tbody>' +
            liste.map(function (u) {
                return '<tr class="admin-tablo__satir">' +
                    '<td><span class="admin-tablo__firma">' + esc(u.ad || '—') + '</span></td>' +
                    '<td><span class="admin-tablo__meta">' + esc(u.email || '—') + '</span></td>' +
                    '<td><span class="admin-tablo__meta">' + esc(u.rol || '—') + '</span></td>' +
                    '<td><span class="admin-tablo__meta">' + esc(u.sehir || '—') + '</span></td>' +
                    '<td><span class="admin-tablo__meta">' + esc(u.kayit || '—') + '</span></td>' +
                    '<td>' + adminKullaniciDurumHtml(u) + '</td></tr>';
            }).join('') +
            '</tbody></table></div></div>';
    }

    function renderAdminRaporlarSekme() {
        var el = $('adminSekmeRaporlar');
        if (!el) return;
        var toplamFirma = state.firmalar.length;
        var bekleyenFirma = state.firmalar.filter(function (f) { return f.durum === 'beklemede'; }).length;
        var bekleyenIs = state.isTalepleri.filter(function (t) { return t.moderasyon === 'beklemede'; }).length;
        var aktifMalzeme = onayliMalzemeler().length;
        el.innerHTML = '<div class="admin-ozet admin-ozet--rapor">' +
            '<div class="admin-kart"><div class="admin-kart__etiket">Toplam Firma</div><div class="admin-kart__sayi">' + toplamFirma + '</div></div>' +
            '<div class="admin-kart admin-kart--uyari"><div class="admin-kart__etiket">Bekleyen Başvuru</div><div class="admin-kart__sayi">' + bekleyenFirma + '</div></div>' +
            '<div class="admin-kart"><div class="admin-kart__etiket">Bekleyen İş Talebi</div><div class="admin-kart__sayi">' + bekleyenIs + '</div></div>' +
            '<div class="admin-kart admin-kart--yesil"><div class="admin-kart__etiket">Yayındaki Malzeme</div><div class="admin-kart__sayi">' + aktifMalzeme + '</div></div>' +
            '</div><p class="panel-not">Metrikler oturumdaki platform verilerinden hesaplanır.</p>';
    }

    function renderAdminModeration() {
        if (!isAdminSession()) return;
        renderAdminIsTalepleriSekme();
        renderAdminMalzemelerSekme();
        renderAdminKullanicilarSekme();
        renderAdminRaporlarSekme();
    }

    function adminModerasyonGuncelle(tip, id, durum) {
        if (!isAdminSession()) return;
        var liste = tip === 'is' ? state.isTalepleri : state.malzemeler;
        var item = liste.find(function (x) { return x.id === id; });
        if (!item) return;
        item.moderasyon = durum;
        if (tip === 'malzeme' && durum === 'onaylandi') item.dogrulandi = true;
        var ad = item.baslik || id;
        toast(ad + ' → ' + adminModDurumEtiket(durum), 'success');
        renderAdminModeration();
        renderIsTalepleri();
        renderMalzemePazari();
    }

    function renderAdminUI() {
        var link = $('navAdmin');
        var btn = $('adminGirisBtn');
        var headerSag = $('adminHeaderSag');
        var merhaba = headerSag ? headerSag.querySelector('.panel-header__merhaba, .admin-header__merhaba') : null;
        var adminSayfa = document.querySelector('[data-sayfa="admin"]');
        var adminBetaBar = document.querySelector('[data-sayfa="admin"] .panel-beta-bar--admin');
        if (link) {
            link.hidden = true;
            link.setAttribute('aria-hidden', 'true');
        }
        if (btn) btn.hidden = true;
        renderDevAdminBanner();
        if (adminSayfa) adminSayfa.hidden = !isAdminSession();
        if (adminBetaBar) adminBetaBar.hidden = devAdminMode;
        if (!isAdminSession()) {
            if (headerSag) headerSag.hidden = true;
            return;
        }
        if (merhaba) merhaba.textContent = devAdminMode ? 'Geliştirme modu' : 'Merhaba Admin';
        if (headerSag) headerSag.hidden = false;
    }

    function renderNavAuth() {
        var el = $('navAuthAlani');
        var menu = $('navMenu');
        if (!el) return;
        var eskiMenuCikis = menu ? menu.querySelector('#navCikisMenu') : null;
        if (eskiMenuCikis) eskiMenuCikis.remove();

        var user = window.AuthService ? AuthService.getCurrentUser() : null;
        if (user) {
            el.innerHTML =
                '<button type="button" class="nav__link nav__link--cta nav__cta-sm" id="navHesabim" data-nav="panel">Hesabım</button>' +
                '<button type="button" class="nav__link nav__cikis-desktop" id="navCikis" data-nav-cikis="1">Çıkış Yap</button>';
            if (menu) {
                var menuCikis = document.createElement('button');
                menuCikis.type = 'button';
                menuCikis.id = 'navCikisMenu';
                menuCikis.className = 'nav__link nav__cikis-menu';
                menuCikis.setAttribute('data-nav-cikis', '1');
                menuCikis.textContent = 'Çıkış Yap';
                menu.appendChild(menuCikis);
            }
        } else {
            el.innerHTML = '<button type="button" class="nav__link nav__link--cta nav__cta-sm" id="navKayitOl" data-nav="kayit">Kayıt Ol</button>';
        }
    }

    function kullaniciCikis() {
        var bitir = function () {
            renderNavAuth();
            renderAdminUI();
            sayfaGoster('ana-sayfa');
            toast('Çıkış yapıldı.', 'info');
        };
        if (window.AuthService && typeof AuthService.signOut === 'function') {
            AuthService.signOut().then(bitir).catch(bitir);
        } else {
            bitir();
        }
    }

    function firmaBasvuruModalAc() {
        var user = window.AuthService ? AuthService.getCurrentUser() : null;
        if (!user || !user.id) {
            toast('Firma hesabı oluşturmak için giriş yapmanız gerekir.', 'info');
            uyelikModalAc('giris');
            return;
        }
        if (user.isFirmaHesabi || (window.PanelUI && PanelUI.hasFirmaHesabi && PanelUI.hasFirmaHesabi())) {
            toast('Firma hesabınız zaten oluşturulmuş.', 'info');
            sayfaGoster('panel');
            return;
        }
        modalAc('firmaBasvuruModal');
    }

    function isTalepModalAc() {
        var user = window.AuthService ? AuthService.getCurrentUser() : null;
        if (!user) {
            toast('İş talebi oluşturmak için giriş yapmanız gerekir.', 'info');
            uyelikModalAc('giris');
            return;
        }
        modalAc('isTalepModal');
    }

    function emailDogrulamaBekleyenGoster(email) {
        kayitBekleyenEmail = String(email || '').trim().toLowerCase();
        var bekleyen = $('emailDogrulamaBekleyen');
        var metin = $('emailDogrulamaMetin');
        var sekmeler = document.querySelector('.uyelik-sekmeler');
        var panelGiris = $('uyelikPanelGiris');
        var panelKayit = $('uyelikPanelKayit');
        if (metin) metin.textContent = EMAIL_DOGRULAMA_MESAJ;
        if (sekmeler) sekmeler.hidden = true;
        if (panelGiris) panelGiris.hidden = true;
        if (panelKayit) panelKayit.hidden = true;
        if (bekleyen) bekleyen.hidden = false;
        if ($('girisEmail') && kayitBekleyenEmail) $('girisEmail').value = kayitBekleyenEmail;
    }

    function emailDogrulamaBekleyenGizle() {
        var bekleyen = $('emailDogrulamaBekleyen');
        var sekmeler = document.querySelector('.uyelik-sekmeler');
        if (bekleyen) bekleyen.hidden = true;
        if (sekmeler) sekmeler.hidden = false;
    }

    function uyelikSekmeSec(sekme) {
        emailDogrulamaBekleyenGizle();
        var hedef = sekme === 'giris' ? 'giris' : 'kayit';
        document.querySelectorAll('[data-uyelik-sekme]').forEach(function (btn) {
            var aktif = btn.getAttribute('data-uyelik-sekme') === hedef;
            btn.classList.toggle('uyelik-sekme--aktif', aktif);
            btn.setAttribute('aria-selected', aktif ? 'true' : 'false');
        });
        var panelGiris = $('uyelikPanelGiris');
        var panelKayit = $('uyelikPanelKayit');
        if (panelGiris) panelGiris.hidden = hedef !== 'giris';
        if (panelKayit) panelKayit.hidden = hedef !== 'kayit';
        var girisForm = $('girisForm');
        var sifreSifirlaForm = $('sifreSifirlaForm');
        var sifreYenileForm = $('sifreYenileForm');
        if (girisForm) girisForm.hidden = false;
        if (sifreSifirlaForm) sifreSifirlaForm.hidden = true;
        if (sifreYenileForm) sifreYenileForm.hidden = true;
        var sekmeler = document.querySelector('.uyelik-sekmeler');
        if (sekmeler) sekmeler.hidden = false;
    }

    function sifreYenileFormGoster() {
        emailDogrulamaBekleyenGizle();
        var sekmeler = document.querySelector('.uyelik-sekmeler');
        var panelGiris = $('uyelikPanelGiris');
        var panelKayit = $('uyelikPanelKayit');
        var girisForm = $('girisForm');
        var sifreSifirlaForm = $('sifreSifirlaForm');
        var sifreYenileForm = $('sifreYenileForm');
        if (sekmeler) sekmeler.hidden = true;
        if (panelGiris) panelGiris.hidden = false;
        if (panelKayit) panelKayit.hidden = true;
        if (girisForm) girisForm.hidden = true;
        if (sifreSifirlaForm) sifreSifirlaForm.hidden = true;
        if (sifreYenileForm) sifreYenileForm.hidden = false;
        modalAc('girisModal');
    }

    function paneleYonlendir() {
        renderNavAuth();
        if (window.PanelUI && typeof PanelUI.renderUserPanel === 'function') {
            PanelUI.renderUserPanel();
        }
        sayfaGoster('panel');
    }

    function uyelikModalAc(sekme) {
        uyelikSekmeSec(sekme || 'kayit');
        modalAc('girisModal');
    }

    function tumunuRenderEt(opts) {
        opts = opts || {};
        if (!opts.skipPiyasa) {
            renderPiyasaBandi();
            renderHeroTerminal(marketQuotes);
        }
        renderSponsorAnaSayfa();
        renderIsTalepleri();
        renderHeroIstatistikler();
        renderKategoriGruplari();
        renderFirmaBolumleri();
        renderNedenAurix();
        renderCanliAktivite();
        renderMalzemePazari();
        renderVitrin();
        if (isAdminSession()) {
            renderAdminTablo();
            renderAdminModeration();
        }
        renderAdminUI();
        renderNavAuth();
        AurixUtils.refreshFirmaGorselleri();
    }

    // ================================================================
    // ETKİLEŞİM
    // ================================================================

    function baglaKartEventleri(container) {
        if (!container) return;
        container.querySelectorAll('[data-detay]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                detayModalAc(btn.getAttribute('data-detay'));
            });
        });
        container.querySelectorAll('[data-teklif]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                detayModalAc(btn.getAttribute('data-teklif'));
            });
        });
        AurixUtils.refreshFirmaGorselleri(container);
    }

    function detayModalAc(id) {
        var firma = onayliFirmalar().find(function (f) { return String(f.id) === String(id); });
        if (!firma && isAdminSession()) {
            firma = state.firmalar.find(function (f) { return String(f.id) === String(id); });
        }
        if (!firma) return;
        var kat = kategoriBul(firma.kategoriId);
        /* Public kart/profil: telefon ve e-posta gösterilmez */
        $('detayAd').textContent = firma.ad;
        $('detayKat').textContent = kat.ikon + ' ' + kat.ad;
        $('detaySehir').textContent = firma.sehir;
        $('detayAciklama').textContent = firma.aciklama || '—';
        $('detayPuan').textContent = firma.puan ? yildizGoster(firma.puan) : '';
        var detayPuanEl = $('detayPuan');
        if (detayPuanEl) detayPuanEl.hidden = !firma.puan;
        detayGorselGuncelle(firma);
        detayLogoGuncelle(firma);
        detayHizmetlerGuncelle(firma);
        detayGaleriGuncelle(firma);
        detayIslerGuncelle(firma);

        var detayMesajNot = $('detayMesajNot');
        if (detayMesajNot) detayMesajNot.hidden = false;

        var rozetler = $('detayRozetler');
        if (rozetler) {
            rozetler.innerHTML =
                (firma.durum === 'onaylandi' ? '<span class="rozet rozet--dogrulandi">Doğrulandı</span>' : '') +
                (firma.premium ? '<span class="rozet rozet--premium">PREMIUM</span>' : '') +
                (firma.sponsor ? '<span class="rozet rozet--partner">PARTNER</span>' : '');
        }

        var detayGuven = $('detayGuven');
        if (detayGuven) detayGuven.innerHTML = detayGuvenPanelHtml(firma);

        var teklifBtn = $('detayTeklifBtn');
        if (teklifBtn) {
            teklifBtn.onclick = function () {
                toast(firma.ad + ' firmasına teklif talebiniz alındı. En kısa sürede dönüş yapılacak.', 'success');
            };
        }

        modalAc('detayModal');
        AurixUtils.refreshFirmaGorselleri($('detayModal'));
    }

    function modalAc(id) {
        var el = $(id);
        if (el) { el.classList.add('modal--acik'); document.body.classList.add('modal-acik'); }
    }

    function modalKapat(id) {
        var el = $(id);
        if (el) { el.classList.remove('modal--acik'); document.body.classList.remove('modal-acik'); }
    }

    function teklifFirmaSelectDoldur() {
        var sel = $('teklifFirma');
        if (!sel) return;
        var firmalar = onayliFirmalar();
        var opts = '<option value="">Firma seçin</option>';
        firmalar.forEach(function (f) {
            if (f.supabaseId == null) return;
            opts += '<option value="' + esc(String(f.supabaseId)) + '">' +
                esc(f.ad) + ' · ' + esc(f.sehir) + '</option>';
        });
        sel.innerHTML = opts;
    }

    function teklifModalAc(talepId) {
        var user = window.AuthService ? AuthService.getCurrentUser() : null;
        if (!user) {
            toast('Teklif vermek için giriş yapmanız gerekir.', 'info');
            uyelikModalAc('giris');
            return;
        }
        if (!user.isFirmaHesabi && !(window.PanelUI && PanelUI.hasFirmaHesabi && PanelUI.hasFirmaHesabi())) {
            toast('Teklif vermek yalnızca firma hesabı olan kullanıcılar içindir.', 'error');
            return;
        }
        var talep = onayliIsTalepleri().find(function (t) { return String(t.id) === String(talepId); });
        if (!talep || talep.supabaseId == null) {
            toast('İş talebi bulunamadı. Listeyi yenileyip tekrar deneyin.', 'error');
            return;
        }
        if (!window.AurixSupabase || !AurixSupabase.baglantiHazirMi()) {
            toast('Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.', 'error');
            return;
        }

        function modalAcFirmaIle(firma) {
            if (!firma || !firma.id) {
                toast('Firma kaydınız bulunamadı.', 'error');
                return;
            }
            if (!firma.dogrulanmis || firma.durum !== 'onaylandi') {
                toast('Teklif vermek için firmanızın onaylanmış olması gerekir.', 'error');
                return;
            }
            var isIdEl = $('teklifIsId');
            var baslikEl = $('teklifIsBaslik');
            var ozetEl = $('teklifIsOzet');
            var sel = $('teklifFirma');
            if (isIdEl) isIdEl.value = String(talep.supabaseId);
            if (baslikEl) baslikEl.textContent = talep.baslik || 'İş talebi';
            if (ozetEl) {
                ozetEl.textContent = (talep.sehir || '—') +
                    (talep.butce && talep.butce !== '—' ? ' · Bütçe: ' + talep.butce : '') +
                    (talep.termin && talep.termin !== '—' ? ' · Termin: ' + talep.termin : '');
            }
            if (sel) {
                sel.innerHTML = '<option value="' + esc(String(firma.id)) + '">' +
                    esc(firma.firma_adi || 'Firmam') + ' · ' + esc(firma.sehir || '') + '</option>';
            }
            if ($('teklifForm')) $('teklifForm').reset();
            if (isIdEl) isIdEl.value = String(talep.supabaseId);
            if (sel) sel.value = String(firma.id);
            modalAc('teklifModal');
        }

        if (typeof AurixSupabase.getirFirmaPanelOzeti !== 'function') {
            toast('Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.', 'error');
            return;
        }

        AurixSupabase.getirFirmaPanelOzeti().then(function (res) {
            if (!res || !res.hasFirma || !res.firma) {
                toast('Teklif vermek için önce firma hesabı oluşturmanız gerekir.', 'error');
                return;
            }
            modalAcFirmaIle(res.firma);
        }).catch(function () {
            toast('Firma bilgisi alınamadı. Lütfen tekrar deneyin.', 'error');
        });
    }

    function teklifGonder(e) {
        e.preventDefault();
        var isId = ($('teklifIsId') && $('teklifIsId').value || '').trim();
        var firmaId = ($('teklifFirma') && $('teklifFirma').value || '').trim();
        var fiyatHam = ($('teklifFiyat') && $('teklifFiyat').value || '').trim();
        var terminHam = ($('teklifTerminGun') && $('teklifTerminGun').value || '').trim();
        var mesaj = ($('teklifMesaj') && $('teklifMesaj').value || '').trim();

        if (!isId) {
            toast('İş talebi seçilemedi. Lütfen tekrar deneyin.', 'error');
            return;
        }
        if (!firmaId) {
            toast('Lütfen teklif verecek firmayı seçin.', 'error');
            return;
        }
        var fiyat = Number(String(fiyatHam).replace(',', '.'));
        var terminGun = parseInt(terminHam, 10);
        if (isNaN(fiyat) || fiyat <= 0) {
            toast('Fiyat 0’dan büyük olmalıdır.', 'error');
            return;
        }
        if (isNaN(terminGun) || terminGun < 1) {
            toast('Teslim süresi en az 1 gün olmalıdır.', 'error');
            return;
        }

        if (!window.AurixSupabase || typeof AurixSupabase.kaydetTeklif !== 'function') {
            toast('Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.', 'error');
            return;
        }

        var submitBtn = e.target && e.target.querySelector
            ? e.target.querySelector('[type="submit"]')
            : null;
        if (submitBtn) submitBtn.disabled = true;

        var isIdDeger = /^\d+$/.test(isId) ? Number(isId) : isId;
        var firmaIdDeger = /^\d+$/.test(firmaId) ? Number(firmaId) : firmaId;

        AurixSupabase.kaydetTeklif({
            is_id: isIdDeger,
            firma_id: firmaIdDeger,
            fiyat: fiyat,
            termin_gun: terminGun,
            mesaj: mesaj
        }).then(function (res) {
            if (submitBtn) submitBtn.disabled = false;
            if (!res || !res.ok) {
                toast((res && res.error) || 'Teklif kaydedilemedi.', 'error');
                return;
            }
            if ($('teklifForm')) $('teklifForm').reset();
            modalKapat('teklifModal');
            toast('Teklifiniz başarıyla gönderildi.', 'success');
            yukleTeklifSayilariSupabase();
        }).catch(function () {
            if (submitBtn) submitBtn.disabled = false;
            toast('Teklif kaydedilemedi. Lütfen daha sonra tekrar deneyin.', 'error');
        });
    }

    function navMenuKapat() {
        var menu = $('navMenu');
        var toggle = $('menuToggle');
        var backdrop = $('navBackdrop');
        if (menu) menu.classList.remove('nav__menu--acik');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        if (backdrop) { backdrop.hidden = true; backdrop.setAttribute('aria-hidden', 'true'); }
        document.body.classList.remove('nav-acik');
    }

    function navMenuAc() {
        var menu = $('navMenu');
        var toggle = $('menuToggle');
        var backdrop = $('navBackdrop');
        if (menu) menu.classList.add('nav__menu--acik');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        if (backdrop) { backdrop.hidden = false; backdrop.setAttribute('aria-hidden', 'false'); }
        document.body.classList.add('nav-acik');
    }

    function navMenuToggle() {
        var menu = $('navMenu');
        if (menu && menu.classList.contains('nav__menu--acik')) navMenuKapat();
        else navMenuAc();
    }

    function sayfaGoster(id) {
        if (id === 'giris' || id === 'kayit') {
            navMenuKapat();
            uyelikModalAc(id === 'giris' ? 'giris' : 'kayit');
            return;
        }
        if (id === 'firma-basvuru') {
            navMenuKapat();
            firmaBasvuruModalAc();
            return;
        }
        document.querySelectorAll('.modal--acik').forEach(function (m) {
            modalKapat(m.id);
        });
        if (id === 'admin') {
            if (!isAdminSession()) return;
        }
        if (id === 'panel') {
            var user = window.AuthService ? AuthService.getCurrentUser() : null;
            if (!user && !demoVideoMode) {
                /* Init henüz bitmediyse oturumu bekle — yanlışlıkla giriş isteme */
                if (window.AuthService && typeof AuthService.isReady === 'function') {
                    AuthService.isReady().then(function (u) {
                        if (u || AuthService.getCurrentUser()) {
                            PanelUI.renderUserPanel();
                            PanelUI.panelTabSec('dashboard');
                            state.aktifSayfa = 'panel';
                            document.querySelectorAll('[data-sayfa]').forEach(function (s) {
                                s.classList.toggle('sayfa--aktif', s.getAttribute('data-sayfa') === 'panel');
                            });
                            document.querySelectorAll('[data-nav]').forEach(function (n) {
                                n.classList.toggle('nav__link--aktif', n.getAttribute('data-nav') === 'panel');
                            });
                        } else {
                            uyelikModalAc('giris');
                        }
                    });
                    return;
                }
                uyelikModalAc('giris');
                return;
            }
            PanelUI.renderUserPanel();
            PanelUI.panelTabSec('dashboard');
        }
        navMenuKapat();
        state.aktifSayfa = id;
        document.querySelectorAll('[data-sayfa]').forEach(function (s) {
            s.classList.toggle('sayfa--aktif', s.getAttribute('data-sayfa') === id);
        });
        document.querySelectorAll('[data-nav]').forEach(function (n) {
            n.classList.toggle('nav__link--aktif', n.getAttribute('data-nav') === id);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (id === 'admin') {
            PanelUI.renderAdminSkeleton();
            yukleAdminBekleyenFirmalar();
            renderAdminTablo();
            renderAdminModeration();
        }
        if (id === 'malzeme') renderMalzemePazari();
        if (id === 'piyasa') {
            renderPiyasaBandi();
            renderHeroTerminal(marketQuotes);
        }
        var aktifSayfa = document.querySelector('.sayfa--aktif');
        if (aktifSayfa) AurixUtils.refreshFirmaGorselleri(aktifSayfa);
    }

    function firmaBasvuruDogrula(ad, aciklama, telDigitsOrE164, email) {
        if (ad.length < 2) return 'Firma adı en az 2 karakter olmalı.';
        if (aciklama.length < 10) return 'Açıklama en az 10 karakter olmalı.';
        if (telDigitsOrE164 !== undefined && telDigitsOrE164 !== null) {
            var digits = normalizeTrCepDigits(telDigitsOrE164);
            if (!isValidTrCep(digits)) return TEL_HATA_MESAJ;
        }
        if (email !== undefined && email !== null) {
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return 'Geçerli bir e-posta girin.';
            }
        }
        return null;
    }

    function firmaBasvuruOlustur(ad, tel, aciklama, kategoriId, sehir) {
        return {
            id: yeniId(), ad: ad, kategoriId: kategoriId, sehir: sehir, tel: tel,
            aciklama: aciklama, premium: false, sponsor: false,
            durum: 'beklemede', puan: 0, gorsel: null,
            eklenmeTarihi: new Date().toISOString()
        };
    }

    function kayitGonder(e) {
        e.preventDefault();
        if (!window.AuthService || typeof AuthService.signUp !== 'function') {
            toast('Üyelik servisi hazır değil. Sayfayı yenileyip tekrar deneyin.', 'error');
            return;
        }
        var adSoyad = ($('kayitAdSoyad') && $('kayitAdSoyad').value || '').trim();
        var email = ($('kayitEmail') && $('kayitEmail').value || '').trim();
        var sifre = ($('kayitSifre') && $('kayitSifre').value || '');
        var sifreTekrar = ($('kayitSifreTekrar') && $('kayitSifreTekrar').value || '');

        var submitBtn = e.target && e.target.querySelector
            ? e.target.querySelector('[type="submit"]')
            : null;
        if (submitBtn) submitBtn.disabled = true;

        AuthService.signUp({
            adSoyad: adSoyad,
            email: email,
            password: sifre,
            passwordAgain: sifreTekrar
        }).then(function (res) {
            if (submitBtn) submitBtn.disabled = false;
            if (!res || !res.ok) {
                toast((res && res.error) || 'Kayıt başarısız.', 'error');
                if (res && res.alreadyRegistered) {
                    if ($('girisEmail')) $('girisEmail').value = res.email || email;
                    uyelikSekmeSec('giris');
                }
                return;
            }
            if ($('kayitForm')) $('kayitForm').reset();
            /* Session yoksa firma insert YAPILMAZ — pendingFirmaBasvurusu bekler */
            if (res.needsEmailConfirmation) {
                emailDogrulamaBekleyenGoster(res.email || email);
                toast(res.message || EMAIL_DOGRULAMA_MESAJ, 'success');
                return;
            }
            modalKapat('girisModal');
            toast('Hesabınız oluşturuldu.', 'success');
            pendingFirmaGonder().then(function () {
                paneleYonlendir();
            });
        }).catch(function () {
            if (submitBtn) submitBtn.disabled = false;
            toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
        });
    }

    function firmaBasvuruGonder(e) {
        e.preventDefault();
        var ad = ($('firmaBasvuruAd') && $('firmaBasvuruAd').value || '').trim();
        var aciklama = ($('firmaBasvuruAciklama') && $('firmaBasvuruAciklama').value || '').trim();
        var kategoriId = $('firmaBasvuruKategori') ? $('firmaBasvuruKategori').value : '';
        var sehir = $('firmaBasvuruSehir') ? $('firmaBasvuruSehir').value : '';
        var logoInput = $('firmaBasvuruLogo');
        var gorselInput = $('firmaBasvuruGorseller');

        var hata = firmaBasvuruDogrula(ad, aciklama);
        if (hata) { toast(hata, 'error'); return; }
        if (!kategoriId || !sehir) {
            toast('Şehir ve hizmet alanı seçin.', 'error');
            return;
        }

        var mevcut = window.AuthService && typeof AuthService.getCurrentUser === 'function'
            ? AuthService.getCurrentUser()
            : null;

        if (!mevcut || !mevcut.id) {
            toast('Firma hesabı oluşturmak için giriş yapmanız gerekir.', 'info');
            modalKapat('firmaBasvuruModal');
            uyelikModalAc('giris');
            return;
        }

        if (!window.AurixSupabase || typeof AurixSupabase.baglantiHazirMi !== 'function' || !AurixSupabase.baglantiHazirMi()) {
            toast('Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.', 'error');
            return;
        }

        var submitBtn = e.target && e.target.querySelector
            ? e.target.querySelector('[type="submit"]')
            : null;
        if (submitBtn) submitBtn.disabled = true;

        var kategoriAd = kategoriId;
        if (window.AURIX_DATA && AURIX_DATA.KATEGORILER) {
            var katBul = AURIX_DATA.KATEGORILER.find(function (k) { return k.id === kategoriId; });
            if (katBul) kategoriAd = katBul.ad;
        }

        function medyaYukle() {
            var logoFile = logoInput && logoInput.files && logoInput.files[0] ? logoInput.files[0] : null;
            var gorselFiles = gorselInput && gorselInput.files ? Array.prototype.slice.call(gorselInput.files, 0, 6) : [];
            var logoPromise = logoFile && typeof AurixSupabase.yukleFirmaMedya === 'function'
                ? AurixSupabase.yukleFirmaMedya(logoFile, 'logo')
                : Promise.resolve({ ok: true, url: null });
            var gorselPromises = gorselFiles.map(function (f) {
                return AurixSupabase.yukleFirmaMedya(f, 'calisma');
            });
            return Promise.all([logoPromise].concat(gorselPromises)).then(function (sonuclar) {
                var logoUrl = sonuclar[0] && sonuclar[0].ok ? sonuclar[0].url : null;
                var gorseller = [];
                for (var i = 1; i < sonuclar.length; i++) {
                    if (sonuclar[i] && sonuclar[i].ok && sonuclar[i].url) {
                        gorseller.push(sonuclar[i].url);
                    }
                }
                return { logo_url: logoUrl, calisma_gorselleri: gorseller };
            });
        }

        medyaYukle().then(function (medya) {
            var payload = {
                firma_adi: ad,
                kategori: kategoriAd,
                sehir: sehir,
                aciklama: aciklama,
                email: (mevcut.email || '').trim().toLowerCase() || null,
                telefon: mevcut.telefon || null,
                logo_url: medya.logo_url || null,
                calisma_gorselleri: medya.calisma_gorselleri || []
            };

            return AurixSupabase.kaydetFirma(payload);
        }).then(function (res) {
            if (submitBtn) submitBtn.disabled = false;
            if (!res || !res.ok) {
                if (res && res.needsAuth) {
                    toast('Firma hesabı oluşturmak için giriş yapmanız gerekir.', 'info');
                    modalKapat('firmaBasvuruModal');
                    uyelikModalAc('giris');
                    return;
                }
                toast((res && res.error) || 'Firma hesabı oluşturulamadı.', 'error');
                return;
            }
            pendingFirmaSil();
            if ($('firmaBasvuruForm')) $('firmaBasvuruForm').reset();
            modalKapat('firmaBasvuruModal');
            toast('Firma hesabınız oluşturuldu. İnceleme sonrası vitrinde yayınlanır.', 'success');
            var yenile = function () {
                if (window.PanelUI && typeof PanelUI.renderUserPanel === 'function') {
                    PanelUI.renderUserPanel();
                }
                sayfaGoster('panel');
            };
            if (window.AuthService && typeof AuthService.refreshProfile === 'function') {
                AuthService.refreshProfile().then(yenile).catch(yenile);
            } else {
                yenile();
            }
        }).catch(function (err) {
            if (submitBtn) submitBtn.disabled = false;
            try { console.error('firmaBasvuruGonder', err); } catch (ex) { /* ignore */ }
            toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
        });
    }

    function baglaTelInput(elId, blurHata) {
        var el = $(elId);
        if (!el || el.dataset.telBound) return;
        el.dataset.telBound = '1';
        el.addEventListener('input', function () {
            var digits = normalizeTrCepDigits(el.value);
            var start = el.selectionStart;
            var beforeLen = el.value.length;
            el.value = formatTrCepDisplay(digits);
            var afterLen = el.value.length;
            try {
                var pos = Math.max(0, (start || 0) + (afterLen - beforeLen));
                el.setSelectionRange(pos, pos);
            } catch (err) { /* ignore */ }
        });
        el.addEventListener('blur', function () {
            var digits = normalizeTrCepDigits(el.value);
            el.value = formatTrCepDisplay(digits);
            if (blurHata !== false && digits && !isValidTrCep(digits)) {
                toast(TEL_HATA_MESAJ, 'error');
            }
        });
        el.addEventListener('paste', function () {
            setTimeout(function () {
                el.value = formatTrCepDisplay(normalizeTrCepDigits(el.value));
            }, 0);
        });
    }

    function baglaFirmaTelInput() {
        baglaTelInput('adminKayitTel', false);
    }

    function isTalepGonder(e) {
        e.preventDefault();
        var baslik = ($('isTalepBaslik') && $('isTalepBaslik').value || '').trim();
        var kategoriId = $('isTalepKategori') ? $('isTalepKategori').value : '';
        var sehir = $('isTalepSehir') ? $('isTalepSehir').value : '';
        var adet = ($('isTalepAdet') && $('isTalepAdet').value || '').trim();
        var termin = ($('isTalepTermin') && $('isTalepTermin').value || '').trim();
        var butce = ($('isTalepButce') && $('isTalepButce').value || '').trim();
        var aciklama = ($('isTalepAciklama') && $('isTalepAciklama').value || '').trim();

        if (baslik.length < 5) {
            toast('İş başlığı en az 5 karakter olmalı.', 'error');
            return;
        }
        if (!kategoriId || !sehir) {
            toast('Branş ve şehir seçin.', 'error');
            return;
        }

        var submitBtn = e.target && e.target.querySelector
            ? e.target.querySelector('[type="submit"]')
            : null;
        if (submitBtn) submitBtn.disabled = true;

        if (!window.AurixSupabase || typeof AurixSupabase.baglantiHazirMi !== 'function' || !AurixSupabase.baglantiHazirMi()) {
            if (submitBtn) submitBtn.disabled = false;
            toast('Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.', 'error');
            return;
        }

        var kategoriAd = kategoriId;
        if (window.AURIX_DATA && AURIX_DATA.KATEGORILER) {
            var katBul = AURIX_DATA.KATEGORILER.find(function (k) { return k.id === kategoriId; });
            if (katBul) kategoriAd = katBul.ad;
        }

        AurixSupabase.kaydetIsTalebi({
            baslik: baslik,
            kategori: kategoriAd,
            sehir: sehir,
            adet: adet,
            termin: termin,
            butce: butce,
            aciklama: aciklama,
            durum: 'Acik'
        }).then(function (res) {
            if (submitBtn) submitBtn.disabled = false;
            if (!res.ok) {
                toast(res.error || 'İş talebi kaydedilemedi.', 'error');
                return;
            }
            if ($('isTalepForm')) $('isTalepForm').reset();
            modalKapat('isTalepModal');
            toast('İş talebiniz alındı.', 'success');
            yukleAcikIsTalepleriSupabase();
            yukleHeroIstatistiklerSupabase();
        }).catch(function () {
            if (submitBtn) submitBtn.disabled = false;
            toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
        });
    }

    function adminDurumGuncelle(id, durum) {
        if (!isAdminSession()) return;
        var firma = state.firmalar.find(function (f) { return f.id === id; });
        if (!firma) return;
        firma.durum = durum;
        StorageAdapter.save(state.firmalar);
        toast(firma.ad + ' → ' + adminDurumEtiket(durum), 'success');
        tumunuRenderEt();
    }

    function adminTogglePremium(id) {
        if (!isAdminSession()) return;
        var firma = state.firmalar.find(function (f) { return f.id === id; });
        if (!firma) return;
        firma.premium = !firma.premium;
        StorageAdapter.save(state.firmalar);
        toast(firma.ad + ' — Premium ' + (firma.premium ? 'açıldı' : 'kapatıldı'), 'success');
        tumunuRenderEt();
    }

    function adminTogglePartner(id) {
        if (!isAdminSession()) return;
        var firma = state.firmalar.find(function (f) { return f.id === id; });
        if (!firma) return;
        firma.sponsor = !firma.sponsor;
        StorageAdapter.save(state.firmalar);
        toast(firma.ad + ' — Partner ' + (firma.sponsor ? 'açıldı' : 'kapatıldı'), 'success');
        tumunuRenderEt();
    }

    function adminKayitGonder(e) {
        e.preventDefault();
        if (!isAdminSession()) return;
        var ad = $('adminKayitAd').value.trim();
        var telDigits = normalizeTrCepDigits(($('adminKayitTel') && $('adminKayitTel').value) || '');
        var aciklama = $('adminKayitAciklama').value.trim();
        var kategoriId = $('adminKayitKategori').value;
        var sehir = $('adminKayitSehir').value;

        if ($('adminKayitTel')) $('adminKayitTel').value = formatTrCepDisplay(telDigits);
        var hata = firmaBasvuruDogrula(ad, aciklama, telDigits);
        if (hata) { toast(hata, 'error'); return; }

        var yeni = firmaBasvuruOlustur(ad, toE164TrCep(telDigits), aciklama, kategoriId, sehir);
        state.firmalar.push(yeni);
        StorageAdapter.save(state.firmalar);
        $('adminKayitForm').reset();
        modalKapat('adminKayitModal');
        toast('Yeni firma kaydı oluşturuldu.', 'success');
        tumunuRenderEt();
    }

    function adminSil(id) {
        if (!isAdminSession()) return;
        state.adminSilBekleyenId = id;
        modalAc('adminSilModal');
    }

    function adminSilOnayla() {
        if (!isAdminSession() || !state.adminSilBekleyenId) return;
        var id = state.adminSilBekleyenId;
        state.firmalar = state.firmalar.filter(function (f) { return f.id !== id; });
        StorageAdapter.save(state.firmalar);
        state.adminSilBekleyenId = null;
        modalKapat('adminSilModal');
        toast('Kayıt silindi.', 'info');
        tumunuRenderEt();
    }

    function adminCikis() {
        if (devAdminMode) {
            devAdminCikis();
            return;
        }
        AuthService.signOut();
        renderAdminUI();
        renderNavAuth();
        sayfaGoster('ana-sayfa');
        toast('Çıkış yapıldı.', 'info');
    }

    function demoVeriSifirla() {
        if (!confirm('Tüm demo verileri sıfırlansın mı?')) return;
        StorageAdapter.reset();
        StorageAdapter.init();
        initModerationQueues();
        tumunuRenderEt();
        toast('Demo verileri sıfırlandı.', 'info');
    }

    // ================================================================
    // BAŞLATMA
    // ================================================================

    function init() {
        initDevAdminMode();
        initDemoVideoMode();
        StorageAdapter.init();
        initModerationQueues();

        AurixUtils.initImageFallbackHandler();
        renderKategoriSelectler();
        renderFiltreChips();
        renderSehirChips();
        initCanliAktiviteCanli();
        initMarketService();
        tumunuRenderEt({ skipPiyasa: true });

        function authHazirSonrasi() {
            renderNavAuth();
            yukleCanliVerilerSupabase();
            if (isAdminSession()) {
                PanelUI.renderAdminSkeleton();
                renderAdminModeration();
                yukleAdminBekleyenFirmalar();
            }
        }

        function authIntentIsle(user) {
            var intent = (window.AuthService && typeof AuthService.consumeAuthIntent === 'function')
                ? AuthService.consumeAuthIntent()
                : null;
            if (intent === 'recovery') {
                sifreYenileFormGoster();
                toast('Yeni şifrenizi belirleyin.', 'info');
                return;
            }
            if (intent === 'confirmed' && user) {
                toast('E-posta adresiniz doğrulandı. Hoş geldiniz!', 'success');
                pendingFirmaGonder().then(function () {
                    paneleYonlendir();
                });
                return;
            }
            /* Oturum kalıcı — sayfa yenilemede tekrar giriş isteme; sadece nav güncelle */
            if (user) {
                pendingFirmaGonder();
            }
        }

        if (window.AuthService && typeof AuthService.init === 'function') {
            AuthService.init().then(function (user) {
                authHazirSonrasi();
                authIntentIsle(user);
            }).catch(authHazirSonrasi);
            if (typeof AuthService.onAuthStateChange === 'function') {
                AuthService.onAuthStateChange(function (user, event) {
                    renderNavAuth();
                    renderAdminUI();
                    if (event === 'PASSWORD_RECOVERY') {
                        sifreYenileFormGoster();
                        return;
                    }
                    if (user && user.id) pendingFirmaGonder();
                    /* Oturum düştüyse paneldeyse ana sayfaya dön */
                    if (!user && state.aktifSayfa === 'panel' && !demoVideoMode) {
                        sayfaGoster('ana-sayfa');
                    }
                });
            }
        } else {
            authHazirSonrasi();
        }

        setInterval(heroTerminalSaatGuncelle, 1000);
        setInterval(yukleAcikIsTalepleriSupabase, 30000);
        setInterval(yukleFirmalarSupabase, 30000);

        PanelUI.bindTabs();
        applyDemoVideoUi();
        if (demoVideoMode) {
            PanelUI.renderUserPanel();
        }

        // Navigasyon (delegation — hamburger + üst bar Kayıt Ol / Hesabım)
        var siteNav = $('siteNav');
        var navMenu = $('navMenu');
        if (siteNav) {
            siteNav.addEventListener('click', function (e) {
                var cikisBtn = e.target.closest('[data-nav-cikis]');
                if (cikisBtn && siteNav.contains(cikisBtn)) {
                    e.preventDefault();
                    kullaniciCikis();
                    return;
                }
                var navEl = e.target.closest('[data-nav]');
                if (!navEl || !siteNav.contains(navEl)) return;
                e.preventDefault();
                sayfaGoster(navEl.getAttribute('data-nav'));
            });
        }
        document.querySelectorAll('[data-nav]').forEach(function (el) {
            if (siteNav && siteNav.contains(el)) return;
            el.addEventListener('click', function (e) {
                e.preventDefault();
                sayfaGoster(el.getAttribute('data-nav'));
            });
        });

        document.querySelectorAll('[data-uyelik-sekme]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                uyelikSekmeSec(btn.getAttribute('data-uyelik-sekme'));
            });
        });

        document.querySelectorAll('[data-yakinda]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                var tip = el.getAttribute('data-yakinda');
                if (tip === 'mobil') {
                    toast('Mobil uygulama yakında. Şimdilik web sürümünü kullanabilirsiniz.', 'info');
                } else if (tip === 'sosyal') {
                    toast('Sosyal medya hesapları yakında paylaşılacak.', 'info');
                } else {
                    toast('Bu özellik yakında aktif olacak.', 'info');
                }
            });
        });

        var iletisimForm = $('iletisimForm');
        if (iletisimForm) {
            iletisimForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var ad = ($('iletisimAd') && $('iletisimAd').value || '').trim();
                var email = ($('iletisimEmail') && $('iletisimEmail').value || '').trim();
                var konu = ($('iletisimKonu') && $('iletisimKonu').value || '').trim();
                var mesaj = ($('iletisimMesaj') && $('iletisimMesaj').value || '').trim();
                if (ad.length < 2) {
                    toast('Lütfen ad / firma bilgisini girin.', 'error');
                    return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    toast('Geçerli bir e-posta girin.', 'error');
                    return;
                }
                if (!konu) {
                    toast('Lütfen konu seçin.', 'error');
                    return;
                }
                if (mesaj.length < 10) {
                    toast('Mesaj en az 10 karakter olmalı.', 'error');
                    return;
                }
                iletisimForm.reset();
                toast('Mesajınız alındı. En kısa sürede dönüş yapılacaktır.', 'success');
            });
        }

        document.querySelectorAll('[data-scroll]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                scrollToBolum(el.getAttribute('data-scroll'));
            });
        });

        var heroArama = $('heroArama');
        if (heroArama) {
            heroArama.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var arama = heroArama.value.trim();
                    var malzemeKelime = /malzeme|makine|mikromotor|freze|terazi|alet|sarf|kimyasal/i.test(arama);
                    if (malzemeKelime) {
                        state.malzeme.arama = arama;
                        var malzemeInput = $('malzemeArama');
                        if (malzemeInput) malzemeInput.value = arama;
                        renderMalzemePazari();
                        sayfaGoster('malzeme');
                        return;
                    }
                    state.filtre.arama = arama;
                    state.filtre.kategoriId = '';
                    state.filtre.grupId = '';
                    guncelleFiltreChipAktif();
                    vitrinSayfaSifirla();
                    var aramaInput = $('aramaInput');
                    if (aramaInput) aramaInput.value = state.filtre.arama;
                    renderVitrin();
                    sayfaGoster('firmalar');
                }
            });
        }

        document.querySelectorAll('[data-hero-kat]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                heroKategoriFiltre(btn.getAttribute('data-hero-kat'), $('heroArama') ? $('heroArama').value.trim() : '');
            });
        });

        document.querySelectorAll('[data-hero-nav]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var hedef = btn.getAttribute('data-hero-nav');
                var arama = $('heroArama') ? $('heroArama').value.trim() : '';
                if (hedef === 'malzeme') {
                    state.malzeme.arama = arama;
                    var malzemeInput = $('malzemeArama');
                    if (malzemeInput) malzemeInput.value = arama;
                    renderMalzemePazari();
                    sayfaGoster('malzeme');
                }
            });
        });

        var malzemeArama = $('malzemeArama');
        if (malzemeArama) {
            malzemeArama.addEventListener('input', function () {
                state.malzeme.arama = this.value.trim();
                renderMalzemePazari();
            });
        }

        var girisForm = $('girisForm');
        if (girisForm) {
            girisForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!window.AuthService || typeof AuthService.signIn !== 'function') {
                    toast('Giriş servisi hazır değil.', 'error');
                    return;
                }
                var email = $('girisEmail') ? $('girisEmail').value : '';
                var sifre = $('girisSifre') ? $('girisSifre').value : '';
                var btn = $('girisBtn');
                if (btn) btn.disabled = true;
                AuthService.signIn(email, sifre).then(function (result) {
                    if (btn) btn.disabled = false;
                    if (!result || !result.ok) {
                        if (result && result.needsEmailConfirmation) {
                            emailDogrulamaBekleyenGoster(result.email || email);
                            toast(result.error || EMAIL_DOGRULAMA_MESAJ, 'info');
                            return;
                        }
                        toast((result && result.error) || 'Giriş başarısız.', 'error');
                        return;
                    }
                    modalKapat('girisModal');
                    toast('Giriş başarılı.', 'success');
                    pendingFirmaGonder().then(function () {
                        paneleYonlendir();
                    });
                }).catch(function () {
                    if (btn) btn.disabled = false;
                    toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
                });
            });
        }

        var emailDogrulamaYenidenBtn = $('emailDogrulamaYenidenBtn');
        if (emailDogrulamaYenidenBtn) {
            emailDogrulamaYenidenBtn.addEventListener('click', function () {
                var email = kayitBekleyenEmail ||
                    (($('girisEmail') && $('girisEmail').value) || '').trim();
                if (!window.AuthService || typeof AuthService.resendSignupEmail !== 'function') {
                    toast('E-posta servisi hazır değil.', 'error');
                    return;
                }
                if (!email) {
                    toast('Geçerli bir e-posta girin.', 'error');
                    return;
                }
                emailDogrulamaYenidenBtn.disabled = true;
                AuthService.resendSignupEmail(email).then(function (res) {
                    emailDogrulamaYenidenBtn.disabled = false;
                    if (!res || !res.ok) {
                        toast((res && res.error) || 'E-posta gönderilemedi.', 'error');
                        return;
                    }
                    kayitBekleyenEmail = email;
                    toast(res.message || EMAIL_DOGRULAMA_MESAJ, 'success');
                }).catch(function () {
                    emailDogrulamaYenidenBtn.disabled = false;
                    toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
                });
            });
        }

        var emailDogrulamaGirisBtn = $('emailDogrulamaGirisBtn');
        if (emailDogrulamaGirisBtn) {
            emailDogrulamaGirisBtn.addEventListener('click', function () {
                uyelikSekmeSec('giris');
            });
        }

        var sifreUnuttumBtn = $('sifreUnuttumBtn');
        var sifreSifirlaForm = $('sifreSifirlaForm');
        var sifreSifirlaGeriBtn = $('sifreSifirlaGeriBtn');
        var sifreYenileForm = $('sifreYenileForm');
        if (sifreUnuttumBtn && sifreSifirlaForm && girisForm) {
            sifreUnuttumBtn.addEventListener('click', function () {
                girisForm.hidden = true;
                if (sifreYenileForm) sifreYenileForm.hidden = true;
                sifreSifirlaForm.hidden = false;
                var ge = $('girisEmail');
                var se = $('sifreSifirlaEmail');
                if (ge && se && !se.value) se.value = ge.value || '';
            });
        }
        if (sifreSifirlaGeriBtn && sifreSifirlaForm && girisForm) {
            sifreSifirlaGeriBtn.addEventListener('click', function () {
                sifreSifirlaForm.hidden = true;
                if (sifreYenileForm) sifreYenileForm.hidden = true;
                girisForm.hidden = false;
            });
        }
        if (sifreSifirlaForm) {
            sifreSifirlaForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!window.AuthService || typeof AuthService.resetPasswordForEmail !== 'function') {
                    toast('Şifre sıfırlama servisi hazır değil.', 'error');
                    return;
                }
                var email = ($('sifreSifirlaEmail') && $('sifreSifirlaEmail').value) || '';
                var btn = e.target.querySelector('[type="submit"]');
                if (btn) btn.disabled = true;
                AuthService.resetPasswordForEmail(email).then(function (res) {
                    if (btn) btn.disabled = false;
                    if (!res || !res.ok) {
                        toast((res && res.error) || 'İşlem başarısız.', 'error');
                        return;
                    }
                    toast(res.message || 'Şifre sıfırlama bağlantısı gönderildi.', 'success');
                    sifreSifirlaForm.hidden = true;
                    if (girisForm) girisForm.hidden = false;
                }).catch(function () {
                    if (btn) btn.disabled = false;
                    toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
                });
            });
        }
        if (sifreYenileForm) {
            sifreYenileForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!window.AuthService || typeof AuthService.updatePassword !== 'function') {
                    toast('Şifre güncelleme servisi hazır değil.', 'error');
                    return;
                }
                var yeni = ($('sifreYenileYeni') && $('sifreYenileYeni').value) || '';
                var tekrar = ($('sifreYenileTekrar') && $('sifreYenileTekrar').value) || '';
                var btn = $('sifreYenileBtn');
                if (btn) btn.disabled = true;
                AuthService.updatePassword(yeni, tekrar).then(function (res) {
                    if (btn) btn.disabled = false;
                    if (!res || !res.ok) {
                        toast((res && res.error) || 'Şifre güncellenemedi.', 'error');
                        return;
                    }
                    sifreYenileForm.reset();
                    modalKapat('girisModal');
                    toast(res.message || 'Şifreniz güncellendi.', 'success');
                    paneleYonlendir();
                }).catch(function () {
                    if (btn) btn.disabled = false;
                    toast('Bağlantı hatası. Lütfen tekrar deneyin.', 'error');
                });
            });
        }

        // Arama
        var aramaInput = $('aramaInput');
        if (aramaInput) {
            aramaInput.addEventListener('input', function () {
                state.filtre.arama = this.value;
                vitrinSayfaSifirla();
                renderVitrin();
            });
        }

        var filtreSehir = $('filtreSehir');
        if (filtreSehir) {
            filtreSehir.addEventListener('change', function () {
                state.filtre.sehir = this.value;
                guncelleSehirChipAktif();
                vitrinSayfaSifirla();
                renderVitrin();
            });
        }

        function vitrinFiltrePanelAc() {
            var panel = $('vitrinFiltrePanel');
            var backdrop = $('vitrinFiltreBackdrop');
            var btn = $('vitrinFiltreAcBtn');
            if (panel) panel.classList.add('vitrin-filtre__panel--acik');
            if (backdrop) {
                backdrop.hidden = false;
                backdrop.setAttribute('aria-hidden', 'false');
            }
            if (btn) btn.setAttribute('aria-expanded', 'true');
            document.body.classList.add('vitrin-filtre-acik');
        }
        function vitrinFiltrePanelKapat() {
            var panel = $('vitrinFiltrePanel');
            var backdrop = $('vitrinFiltreBackdrop');
            var btn = $('vitrinFiltreAcBtn');
            if (panel) panel.classList.remove('vitrin-filtre__panel--acik');
            if (backdrop) {
                backdrop.hidden = true;
                backdrop.setAttribute('aria-hidden', 'true');
            }
            if (btn) btn.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('vitrin-filtre-acik');
        }
        var vitrinFiltreAcBtn = $('vitrinFiltreAcBtn');
        if (vitrinFiltreAcBtn) vitrinFiltreAcBtn.addEventListener('click', vitrinFiltrePanelAc);
        var vitrinFiltreKapatBtn = $('vitrinFiltreKapatBtn');
        if (vitrinFiltreKapatBtn) vitrinFiltreKapatBtn.addEventListener('click', vitrinFiltrePanelKapat);
        var vitrinFiltreBackdrop = $('vitrinFiltreBackdrop');
        if (vitrinFiltreBackdrop) vitrinFiltreBackdrop.addEventListener('click', vitrinFiltrePanelKapat);
        var vitrinFiltreUygulaBtn = $('vitrinFiltreUygulaBtn');
        if (vitrinFiltreUygulaBtn) {
            vitrinFiltreUygulaBtn.addEventListener('click', function () {
                vitrinSayfaSifirla();
                renderVitrin();
                vitrinFiltrePanelKapat();
            });
        }
        var vitrinFiltreTemizleBtn = $('vitrinFiltreTemizleBtn');
        if (vitrinFiltreTemizleBtn) {
            vitrinFiltreTemizleBtn.addEventListener('click', function () {
                state.filtre.arama = '';
                state.filtre.sehir = '';
                state.filtre.grupId = '';
                state.filtre.kategoriId = '';
                if (aramaInput) aramaInput.value = '';
                if (filtreSehir) filtreSehir.value = '';
                guncelleSehirChipAktif();
                vitrinSayfaSifirla();
                renderVitrin();
                renderFiltreChips();
            });
        }

        var vitrinSiralama = $('vitrinSiralama');
        if (vitrinSiralama) {
            vitrinSiralama.addEventListener('change', function () {
                state.vitrin.siralama = this.value;
                vitrinSayfaSifirla();
                renderVitrin();
            });
        }

        // Form
        var kayitForm = $('kayitForm');
        if (kayitForm) kayitForm.addEventListener('submit', kayitGonder);
        var firmaBasvuruForm = $('firmaBasvuruForm');
        if (firmaBasvuruForm) firmaBasvuruForm.addEventListener('submit', firmaBasvuruGonder);
        baglaFirmaTelInput();

        var isTalepAcBtn = $('isTalepAcBtn');
        if (isTalepAcBtn) {
            isTalepAcBtn.addEventListener('click', function () {
                isTalepModalAc();
            });
        }
        var isTalepForm = $('isTalepForm');
        if (isTalepForm) isTalepForm.addEventListener('submit', isTalepGonder);
        var teklifForm = $('teklifForm');
        if (teklifForm) teklifForm.addEventListener('submit', teklifGonder);

        // Admin — yalnızca ADMIN_PANEL_ENABLED true iken bağlanır
        if ($('demoSifirlaBtn')) $('demoSifirlaBtn').addEventListener('click', demoVeriSifirla);

        var adminArama = $('adminAramaInput');
        if (adminArama) {
            adminArama.addEventListener('input', function () {
                state.adminArama = this.value;
                renderAdminTablo();
            });
        }
        var adminYeniFirma = $('adminYeniFirmaBtn');
        if (adminYeniFirma) {
            adminYeniFirma.addEventListener('click', function () {
                if (!isAdminSession()) return;
                modalAc('adminKayitModal');
            });
        }
        var adminKayitForm = $('adminKayitForm');
        if (adminKayitForm) adminKayitForm.addEventListener('submit', adminKayitGonder);
        var adminSilOnay = $('adminSilOnayBtn');
        if (adminSilOnay) adminSilOnay.addEventListener('click', adminSilOnayla);
        var adminPanelCikis = $('adminPanelCikisBtn');
        if (adminPanelCikis) adminPanelCikis.addEventListener('click', adminCikis);
        var adminTokenBtn = $('adminTokenBtn');
        if (adminTokenBtn) {
            adminTokenBtn.addEventListener('click', function () {
                var token = window.prompt('Admin token girin (URL’ye yazmayın)');
                if (token && window.AurixSupabase) {
                    if (AurixSupabase.setAdminToken) AurixSupabase.setAdminToken(token);
                    else if (AurixSupabase.setAdminDemoToken) AurixSupabase.setAdminDemoToken(token);
                    toast('Admin token oturuma kaydedildi.', 'info');
                    yukleAdminBekleyenFirmalar();
                }
            });
        }
        var adminYenile = $('adminBekleyenYenileBtn');
        if (adminYenile) {
            adminYenile.addEventListener('click', function () {
                yukleAdminBekleyenFirmalar();
            });
        }

        // Modal kapat
        document.querySelectorAll('[data-modal-kapat]').forEach(function (btn) {
            btn.addEventListener('click', function () { modalKapat(btn.getAttribute('data-modal-kapat')); });
        });
        document.querySelectorAll('.modal').forEach(function (m) {
            m.addEventListener('click', function (e) { if (e.target === m) modalKapat(m.id); });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            var acikModallar = document.querySelectorAll('.modal--acik');
            if (acikModallar.length) {
                acikModallar.forEach(function (m) { modalKapat(m.id); });
                return;
            }
            navMenuKapat();
        });

        // Mobil menü
        var menuToggle = $('menuToggle');
        if (menuToggle) menuToggle.addEventListener('click', navMenuToggle);
        var navBackdrop = $('navBackdrop');
        if (navBackdrop) navBackdrop.addEventListener('click', navMenuKapat);

        renderAdminUI();

        if (devAdminMode) {
            sayfaGoster('admin');
        }
    }

    // Global (HTML onclick yerine event delegation tercih edildi; geriye dönük)
    window.Aurix = {
        sayfaGoster: sayfaGoster,
        scrollToBolum: scrollToBolum,
        modalKapat: modalKapat,
        demoSifirla: demoVeriSifirla,
        toast: toast,
        renderAdminModeration: renderAdminModeration,
        isDemoVideoMode: isDemoVideoMode,
        firmaBasvuruModalAc: firmaBasvuruModalAc,
        isTalepModalAc: isTalepModalAc
    };

    document.addEventListener('DOMContentLoaded', init);
})();

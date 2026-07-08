/**
 * Aurix Beta v0.1 — Uygulama çekirdeği
 * StorageAdapter: localStorage (demo) → v1.0'da SupabaseAdapter ile değiştirilecek
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'aurix_beta_v01_firms';
    // Admin panel v1.0'da Supabase Auth + profiles.role='admin' ile etkinleştirilecek.
    var ADMIN_PANEL_ENABLED = false;
    // TODO: Supabase Auth sonrası devAdmin parametresi tamamen kaldırılacak.
    var devAdminMode = false;

    var esc = AurixUtils.escapeHtml;
    var safeUrl = AurixUtils.safeUrl;
    var safeImageUrl = AurixUtils.safeImageUrl;
    var defaultImg = AurixUtils.defaultImage;
    var safeWaHref = AurixUtils.safeWhatsAppHref;
    var safeCss = AurixUtils.safeCssClass;

    var state = {
        firmalar: [],
        aktifSayfa: 'ana-sayfa',
        piyasaTab: 'kuyumcu',
        adminArama: '',
        adminSilBekleyenId: null,
        filtre: { arama: '', grupId: '', kategoriId: '', sehir: '' },
        vitrin: { sayfa: 1, boyut: 9, siralama: 'onerilen' },
        malzeme: { arama: '', kategoriId: '' }
    };

    function initDevAdminMode() {
        var params = new URLSearchParams(window.location.search);
        devAdminMode = params.get('devAdmin') === '1';
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
        },
        init: function () {
            var kayitli = this.load();
            if (kayitli && kayitli.length) {
                state.firmalar = kayitli;
            } else {
                state.firmalar = JSON.parse(JSON.stringify(AURIX_DATA.ORNEK_FIRMALAR));
                this.save(state.firmalar);
            }
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
        return String(tel).replace(/\D/g, '');
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

    function varsayilanFirmaGorseli() {
        return safeImageUrl(AURIX_DATA.VARSAYILAN_GORSEL, defaultImg());
    }

    function varsayilanMalzemeGorseli() {
        return safeImageUrl(AURIX_DATA.VARSAYILAN_MALZEME_GORSEL, 'assets/images/malzeme.svg');
    }

    function firmaKapakGorsel(firma) {
        if (firma && firma.gorsel && AurixUtils.isLocalAssetPath(firma.gorsel)) {
            return safeImageUrl(firma.gorsel, varsayilanFirmaGorseli());
        }
        var map = AURIX_DATA.KATEGORI_KAPAK_GORSELLERI || {};
        if (firma && map[firma.kategoriId]) {
            return safeImageUrl(map[firma.kategoriId], varsayilanFirmaGorseli());
        }
        return varsayilanFirmaGorseli();
    }

    function malzemeKapakGorsel(urun) {
        var yedek = varsayilanMalzemeGorseli();
        if (urun && urun.gorsel && AurixUtils.isLocalAssetPath(urun.gorsel)) {
            return safeImageUrl(urun.gorsel, yedek);
        }
        var map = AURIX_DATA.MALZEME_KATEGORI_GORSELLERI || {};
        if (urun && map[urun.kategoriId]) {
            return safeImageUrl(map[urun.kategoriId], yedek);
        }
        return yedek;
    }

    function gorselImgHtml(src, opts) {
        opts = opts || {};
        var yedek = safeImageUrl(opts.fallback || defaultImg(), defaultImg());
        var imgSrc = safeImageUrl(src, yedek);
        var cls = 'aurix-img-fallback' + (opts.extraClass ? ' ' + opts.extraClass : '');
        return '<img class="' + cls + '" src="' + esc(imgSrc) + '"' +
            ' alt="' + esc(opts.alt != null ? opts.alt : '') + '"' +
            ' width="' + (opts.width || 400) + '" height="' + (opts.height || 200) + '"' +
            ' loading="lazy" decoding="async"' +
            ' data-fallback-src="' + esc(yedek) + '"' +
            (opts.removeOnFail ? ' data-remove-on-fail="' + esc(opts.removeOnFail) + '"' : '') +
            '>';
    }

    function firmaAnaKapakHtml(firma, alt) {
        return '<div class="firma-kart__kapak">' +
            gorselImgHtml(firmaKapakGorsel(firma), {
                alt: alt,
                extraClass: 'firma-kart__kapak-img',
                width: 400,
                height: 200,
                fallback: varsayilanFirmaGorseli()
            }) +
            '</div>';
    }

    function firmaKapakImgHtml(firma, alt) {
        return gorselImgHtml(firmaKapakGorsel(firma), {
            alt: alt,
            extraClass: 'firma-kart__kapak-img',
            width: 400,
            height: 200,
            fallback: varsayilanFirmaGorseli()
        });
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
        var n = parseInt(String(firma.id || '').replace(/\D/g, ''), 10) || 1;
        var onayli = firma.durum === 'onaylandi';
        return {
            vergi: onayli && n % 5 !== 0,
            telefon: onayli || !!firma.tel,
            adres: onayli && n % 4 !== 0,
            whatsapp: !!firma.tel
        };
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
        var guven = firmaGuvenVerisi(firma);
        var puanMetin = firma.puan ? firma.puan.toFixed(1) : '—';
        return '<div class="detay-guven__rozetler">' + firmaDogrulamaRozetleriHtml(firma, false) + '</div>' +
            '<div class="detay-guven__metrikler">' +
            '<div class="detay-guven__metrik"><span>Tamamlanan iş</span><strong>' + guven.tamamlananIs + '</strong></div>' +
            '<div class="detay-guven__metrik"><span>Ortalama puan</span><strong>★ ' + puanMetin + '</strong></div>' +
            '<div class="detay-guven__metrik"><span>Son aktif</span><strong>' + esc(guven.sonAktif) + '</strong></div>' +
            '<div class="detay-guven__metrik"><span>Ort. cevap</span><strong>' + esc(guven.cevapSuresi) + '</strong></div>' +
            '</div>';
    }

    function malzemeKategoriBul(id) {
        var list = AURIX_DATA.MALZEME_KATEGORILER || [];
        return list.find(function (k) { return k.id === id; }) || { ad: id, ikon: '📦' };
    }

    function onayliFirmalar() {
        return state.firmalar.filter(function (f) { return f.durum === 'onaylandi'; });
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

    function piyasaKartHtml(k) {
        var cls = k.yon === 'up' ? 'piyasa-kart__degisim--up' : 'piyasa-kart__degisim--down';
        var grupCls = k.grup ? ' piyasa-kart--' + k.grup : '';
        var premiumCls = k.premium ? ' piyasa-kart--premium-esnaf' : '';
        return '<div class="piyasa-kart' + grupCls + premiumCls + '" data-piyasa="' + k.id + '">' +
            '<span class="piyasa-kart__etiket">' + k.etiket + '</span>' +
            '<div class="piyasa-kart__deger-satir">' +
            '<span class="piyasa-kart__deger">' + k.deger + '</span>' +
            '<span class="piyasa-kart__birim">' + k.birim + '</span>' +
            '</div>' +
            '<span class="piyasa-kart__degisim ' + cls + '">' + k.degisim + '</span>' +
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

    function renderPiyasaBandi() {
        var quotes = piyasaFiltreliKotasyonlar();
        var html = !quotes.length
            ? '<div class="piyasa-yukleniyor">Piyasa verileri yükleniyor…</div>'
            : (function () {
                var kartlar = quotes.map(piyasaKartHtml).join('');
                return kartlar + kartlar;
            }());
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
            body.innerHTML = '<div class="hero-terminal__yukleniyor">Piyasa verileri yükleniyor…</div>';
            return;
        }
        body.innerHTML = filtered.map(function (q) {
            var cls = q.yon === 'up' ? 'terminal-row--up' : 'terminal-row--down';
            var grupCls = q.grup ? ' terminal-row--' + q.grup : '';
            var premiumCls = q.premium ? ' terminal-row--premium-esnaf' : '';
            return '<div class="terminal-row' + grupCls + premiumCls + ' ' + cls + '" data-quote="' + q.id + '">' +
                '<span class="terminal-row__sembol">' + q.etiket + '</span>' +
                '<span class="terminal-row__fiyat">' + q.deger + '<small>' + q.birim + '</small></span>' +
                '<span class="terminal-row__degisim">' + q.degisim + '</span>' +
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
            if (wrap) wrap.innerHTML = '<div class="piyasa-hata">Piyasa modülü yüklenemedi.</div>';
            return;
        }
        marketService = MarketService.create('mock', { intervalMs: 5000 });
        marketService.subscribe(function (quotes) {
            marketQuotes = quotes;
            renderPiyasaBandi();
            renderHeroTerminal(quotes);
        });
        initPiyasaTabs();
        piyasaTabSec(state.piyasaTab, true);
        marketService.start();
        window.addEventListener('beforeunload', function () {
            if (marketService) marketService.stop();
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
        grid.innerHTML = list.slice(0, 3).map(function (f) {
            var kat = kategoriBul(f.kategoriId);
            var waHref = safeWaHref(f.tel);
            var gorsel = gorselImgHtml(firmaKapakGorsel(f), {
                alt: f.ad,
                width: 640,
                height: 360,
                fallback: varsayilanFirmaGorseli()
            });
            return '<article class="sponsor-alani-kart" data-detay="' + esc(f.id) + '">' +
                '<div class="sponsor-alani-kart__gorsel">' + gorsel + '</div>' +
                '<div class="sponsor-alani-kart__govde">' +
                    '<span class="sponsor-alani-kart__rozet">SPONSOR</span>' +
                    '<h3 class="sponsor-alani-kart__ad">' + esc(f.ad) + '</h3>' +
                    '<p class="sponsor-alani-kart__kat">' + kat.ikon + ' ' + esc(kat.ad) + ' · ' + esc(f.sehir) + '</p>' +
                    '<div class="sponsor-alani-kart__aksiyon">' +
                    '<button type="button" class="btn btn--ghost btn--sm" data-detay="' + esc(f.id) + '">Detay</button>' +
                    (waHref ? '<a class="btn btn--primary btn--sm" href="' + esc(waHref) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
                    '</div>' +
                '</div>' +
            '</article>';
        }).join('');
        baglaKartEventleri(grid);
    }

    function firmaGuvenVerisi(firma) {
        var n = parseInt(String(firma.id || '').replace(/\D/g, ''), 10) || 1;
        var uyelikYili = firma.uyelikYili;
        if (!uyelikYili && firma.eklenmeTarihi) {
            uyelikYili = new Date(firma.eklenmeTarihi).getFullYear();
        }
        if (!uyelikYili) uyelikYili = 2022 + (n % 4);
        return {
            tamamlananIs: firma.tamamlananIs != null ? firma.tamamlananIs : 12 + ((n * 13) % 140),
            cevapSuresi: firma.cevapSuresi || ['< 1 saat', '2 saat', '4 saat', '6 saat', 'Aynı gün'][n % 5],
            uyelikYili: uyelikYili,
            sonAktif: firma.sonAktif || ['Bugün', 'Dün', '2 gün önce', '3 gün önce'][n % 4]
        };
    }

    function kategoriFirmaSayisiGoster(item) {
        var gercek = onayliFirmalar().filter(function (f) { return f.kategoriId === item.id; }).length;
        var taban = item.firmaTaban || 0;
        return Math.max(taban, gercek + taban);
    }

    function kategoriFirmaSayisi(kategoriId) {
        return onayliFirmalar().filter(function (f) { return f.kategoriId === kategoriId; }).length;
    }

    function kategoriIsSayisi(item) {
        var taban = item.isSayisi || 0;
        var acik = (AURIX_DATA.ACIK_IS_TALEPLERI || []).filter(function (t) {
            return t.kategoriId === item.id;
        }).length;
        return taban + acik;
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

    function renderHeroIstatistikler() {
        var el = $('heroIstatistikler');
        if (!el) return;
        el.innerHTML = platformIstatistikleri().map(function (stat) {
            var parsed = parseIstatDeger(stat.deger);
            var dataAttrs = parsed.numeric != null
                ? ' data-target="' + parsed.numeric + '" data-raw="' + stat.deger + '"'
                : ' data-raw="' + stat.deger + '"';
            return '<div class="hero-istat-kutu hero-istat-kutu--premium" role="listitem">' +
                '<span class="hero-istat-kutu__deger"' + dataAttrs + '>' + (parsed.numeric != null ? '0' + parsed.suffix : stat.deger) + '</span>' +
                '<span class="hero-istat-kutu__etiket">' + stat.etiket + '</span>' +
                '</div>';
        }).join('');
        initHeroIstatAnimasyon(el);
    }

    function firmaKartAnaProHtml(firma) {
        var kat = kategoriBul(firma.kategoriId);
        var guven = firmaGuvenVerisi(firma);
        var puanMetin = firma.puan ? firma.puan.toFixed(1) : '—';

        return '<article class="firma-kart firma-kart--ana firma-kart--kompakt" data-id="' + esc(firma.id) + '">' +
            firmaAnaKapakHtml(firma, firma.ad) +
            '<div class="firma-kart__govde">' +
            '<div class="firma-kart__baslik-satir">' +
            '<h3 class="firma-kart__ad">' + esc(firma.ad) + '</h3>' +
            '<span class="firma-kart__dogrulandi firma-kart__dogrulandi--inline">Doğrulandı</span>' +
            '</div>' +
            '<p class="firma-kart__hizmet">' + esc(kat.ad) + '</p>' +
            '<p class="firma-kart__sehir">' + esc(firma.sehir) + '</p>' +
            '<div class="firma-kart__puan-satir">' +
            '<span class="firma-kart__puan-deger">★ ' + puanMetin + '</span>' +
            '<span class="firma-kart__puan-etiket">Puan</span></div>' +
            '<div class="firma-kart__metrik-grid firma-kart__metrik-grid--kompakt">' +
            '<span class="firma-kart__metrik"><strong>' + guven.tamamlananIs + '</strong> Tamamlanan iş</span>' +
            '<span class="firma-kart__metrik"><strong>' + esc(guven.cevapSuresi) + '</strong> Ort. cevap</span>' +
            '<span class="firma-kart__metrik firma-kart__metrik--aktif"><strong>' + esc(guven.sonAktif) + '</strong> Son aktif</span>' +
            '</div>' +
            '<div class="firma-kart__aksiyon firma-kart__aksiyon--kompakt">' +
            '<button type="button" class="btn btn--primary btn--sm" data-teklif="' + esc(firma.id) + '">Teklif Al</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-detay="' + esc(firma.id) + '">Profili Gör</button>' +
            '</div></div></article>';
    }

    function firmaGuvenHtml(firma, anaSayfa) {
        if (!anaSayfa || firma.durum !== 'onaylandi') {
            return firma.puan
                ? '<div class="firma-kart__puan-alan"><span class="firma-kart__puan">' + yildizGoster(firma.puan) + '</span></div>'
                : '<div class="firma-kart__puan-alan"><span class="firma-kart__puan firma-kart__puan--bos">Henüz yorum yok</span></div>';
        }
        var guven = firmaGuvenVerisi(firma);
        var puanMetin = firma.puan ? firma.puan.toFixed(1) : '—';
        return '<div class="firma-kart__guven">' +
            '<div class="firma-kart__guven-ust">' +
            '<span class="firma-kart__puan firma-kart__puan--sayi">★ ' + puanMetin + '</span>' +
            '<span class="firma-kart__guven-rozet">Doğrulandı</span>' +
            '</div>' +
            '<div class="firma-kart__guven-metrikler">' +
            '<span class="firma-kart__guven-metrik">' + guven.tamamlananIs + ' iş</span>' +
            '<span class="firma-kart__guven-metrik">' + esc(guven.cevapSuresi) + '</span>' +
            '</div></div>';
    }

    function firmaKartHtml(firma, opts) {
        opts = opts || {};
        if (opts.anaSayfa && firma.durum === 'onaylandi') {
            return firmaKartAnaProHtml(firma);
        }
        var kat = kategoriBul(firma.kategoriId);
        var tel = telTemizle(firma.tel);
        var waHref = safeWaHref(tel);
        var anaSayfa = !!opts.anaSayfa;
        var premiumCls = (!anaSayfa && firma.premium) ? ' firma-kart--premium' : '';
        var partnerBadge = (!anaSayfa && firma.sponsor) ? '<span class="firma-kart__partner">PARTNER</span>' : '';
        var dogrulandi = (!anaSayfa && firma.durum === 'onaylandi')
            ? '<span class="firma-kart__dogrulandi">Doğrulandı</span>'
            : (anaSayfa ? '' : '');
        var premiumEtiket = (!anaSayfa && firma.premium) ? '<span class="firma-kart__premium">PREMIUM</span>' : '';
        var gorselIcerik = firmaKapakImgHtml(firma, firma.ad).replace('firma-kart__kapak-img', 'firma-kart__gorsel-img');
        var guvenHtml = firmaGuvenHtml(firma, anaSayfa);
        var birincilBtn = anaSayfa
            ? '<button type="button" class="btn btn--primary btn--sm" data-teklif="' + esc(firma.id) + '">Teklif Al</button>'
            : '<button type="button" class="btn btn--ghost btn--sm" data-detay="' + esc(firma.id) + '">Profili Gör</button>';
        var ikincilBtn = anaSayfa
            ? (waHref ? '<a class="btn btn--ghost btn--sm" href="' + esc(waHref) + '" target="_blank" rel="noopener">İletişim</a>' : '')
            : (waHref ? '<a class="btn btn--primary btn--sm" href="' + esc(waHref) + '" target="_blank" rel="noopener">WhatsApp</a>' : '');

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
            '<div class="firma-kart__aksiyon">' + birincilBtn + ikincilBtn +
            '</div></div></article>';
    }

    function firmaKartVitrinHtml(firma) {
        var kat = kategoriBul(firma.kategoriId);
        var guven = firmaGuvenVerisi(firma);
        var premiumCls = firma.premium ? ' firma-kart--premium' : '';
        var partnerBadge = firma.sponsor ? '<span class="firma-kart__partner">PARTNER</span>' : '';
        var gorselIcerik = firmaKapakImgHtml(firma, firma.ad).replace('firma-kart__kapak-img', 'firma-kart__gorsel-img');
        var logoSrc = firma.logo && AurixUtils.isLocalAssetPath(firma.logo) ? safeImageUrl(firma.logo, '') : '';
        var logoIcerik = logoSrc
            ? gorselImgHtml(logoSrc, { alt: '', width: 48, height: 48, extraClass: 'firma-kart__logo-img', fallback: varsayilanFirmaGorseli() })
            : '<span class="firma-kart__logo-harf">' + esc(firmaBasHarfleri(firma.ad)) + '</span>';
        var aciklama = firma.aciklama || '';
        var puanMetin = firma.puan ? firma.puan.toFixed(1) : '—';
        var puanHtml = firma.puan
            ? '<span class="firma-kart__puan-deger">★ ' + puanMetin + '</span>'
            : '<span class="firma-kart__puan firma-kart__puan--bos">Henüz puan yok</span>';
        var dogrulandiBadge = firma.durum === 'onaylandi'
            ? '<span class="firma-kart__dogrulandi firma-kart__dogrulandi--vitrin">Doğrulandı</span>'
            : '';

        return '<article class="firma-kart firma-kart--vitrin' + premiumCls + '" data-id="' + esc(firma.id) + '">' +
            (firma.premium ? '<span class="firma-kart__premium">PREMIUM</span>' : '') +
            partnerBadge +
            '<div class="firma-kart__gorsel">' + gorselIcerik + '</div>' +
            '<div class="firma-kart__govde">' +
            '<div class="firma-kart__kimlik">' +
            '<div class="firma-kart__logo">' + logoIcerik + '</div>' +
            '<div class="firma-kart__kimlik-metin">' +
            '<div class="firma-kart__baslik-satir">' +
            '<h3 class="firma-kart__ad">' + esc(firma.ad) + '</h3>' +
            dogrulandiBadge +
            '</div>' +
            '<div class="firma-kart__meta">' +
            '<span class="firma-kart__sehir">' + esc(firma.sehir) + '</span>' +
            '<span class="firma-kart__kat-rozet">' +
            '<span class="firma-kart__kat-ikon">' + kat.ikon + '</span>' +
            '<span class="firma-kart__kat-ad">' + esc(kat.ad) + '</span>' +
            '</span></div></div></div>' +
            '<div class="firma-kart__vitrin-metrikler">' +
            '<span class="firma-kart__vitrin-metrik">' + puanHtml + '</span>' +
            '<span class="firma-kart__vitrin-metrik"><strong>' + guven.tamamlananIs + '</strong> tamamlanan iş</span>' +
            '<span class="firma-kart__vitrin-metrik firma-kart__vitrin-metrik--aktif"><strong>' + esc(guven.sonAktif) + '</strong> aktif</span>' +
            '</div>' +
            (aciklama ? '<p class="firma-kart__aciklama">' + esc(aciklama) + '</p>' : '') +
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
            el.innerHTML = list.length
                ? list.map(function (f) { return firmaKartHtml(f, { anaSayfa: bolum.gridId === 'ureticilerGrid' }); }).join('')
                : (bolum.gridId === 'ureticilerGrid'
                    ? '<p class="bos-metin bos-metin--firma">Doğrulanmış firmalar yakında burada listelenecek.</p>'
                    : '<p class="bos-metin">Bu bölümde henüz onaylı firma bulunmuyor.</p>');
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
                    sayac.textContent = 'Doğrulanmış firmalar yakında burada listelenecek.';
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

        el.innerHTML = sayfaList.length
            ? sayfaList.map(function (f) { return firmaKartVitrinHtml(f); }).join('')
            : '<div class="bos-durum vitrin-bos-durum"><div class="bos-durum__ikon">🔍</div><p>Aramanıza uygun firma bulunamadı.</p><p class="vitrin-bos-durum__alt">Filtreleri temizleyerek tekrar deneyin.</p></div>';
        baglaKartEventleri(el);
        renderVitrinSayfalama(list.length, state.vitrin.sayfa, boyut);
        baglaVitrinSayfalama(list.length, boyut);
    }

    function renderKategoriGruplari() {
        var el = $('kategoriGruplari');
        if (!el) return;
        var anaListe = AURIX_DATA.ESNAF_ANA_KATEGORILER;

        if (anaListe && anaListe.length) {
            el.className = 'esnaf-kategori-grid kategori-gruplar--fuar';
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
        if (!el || !AURIX_DATA.ACIK_IS_TALEPLERI) return;
        el.innerHTML = AURIX_DATA.ACIK_IS_TALEPLERI.map(function (talep) {
            var durumCls = 'is-talep-kart__durum--' + safeCss(talep.durumTip, 'bekliyor');
            return '<article class="is-talep-kart is-talep-kart--pro">' +
                '<div class="is-talep-kart__ust">' +
                '<div class="is-talep-kart__baslik-grup">' +
                '<h3 class="is-talep-kart__baslik">' + esc(talep.baslik) + '</h3>' +
                '<span class="is-talep-kart__sehir">' + esc(talep.sehir) + '</span></div>' +
                '<span class="is-talep-kart__durum ' + durumCls + '">' + esc(talep.durum) + '</span></div>' +
                '<ul class="is-talep-kart__detaylar is-talep-kart__detaylar--odak">' +
                '<li><span>Açılış</span><strong>' + esc(talep.acilisTarihi || '—') + '</strong></li>' +
                '<li><span>Teklif</span><strong>' + (talep.teklifSayisi != null ? talep.teklifSayisi + ' teklif' : '—') + '</strong></li>' +
                '<li><span>Yaklaşık bütçe</span><strong>' + esc(talep.butce || '—') + '</strong></li>' +
                '<li><span>Teslim süresi</span><strong>' + esc(talep.termin || '—') + '</strong></li>' +
                '</ul>' +
                '<button type="button" class="btn btn--primary btn--sm is-talep-kart__btn" data-teklif-is="' + esc(talep.id) + '">Teklif Ver</button>' +
                '</article>';
        }).join('');
        el.querySelectorAll('[data-teklif-is]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                toast('Teklif gönderme özelliği çok yakında aktif olacak.', 'info');
            });
        });
    }

    function renderCanliAktivite() {
        var el = $('canliAktiviteListe');
        if (!el || !AURIX_DATA.CANLI_AKTIVITE) return;
        el.innerHTML = AURIX_DATA.CANLI_AKTIVITE.map(function (a, i) {
            return '<li class="canli-aktivite-oge canli-aktivite-oge--' + safeCss(a.tip, 'genel') + '" style="--aktivite-delay:' + (i * 120) + 'ms">' +
                '<span class="canli-aktivite-oge__nokta" aria-hidden="true"></span>' +
                '<div class="canli-aktivite-oge__icerik">' +
                '<span class="canli-aktivite-oge__metin">' + esc(a.metin) + '</span>' +
                '<time class="canli-aktivite-oge__zaman">' + esc(a.zaman || 'Az önce') + '</time>' +
                '</div></li>';
        }).join('');
    }

    var canliAktiviteZamanlar = ['2 dakika önce', '5 dakika önce', '8 dakika önce', '12 dakika önce', '20 dakika önce', '35 dakika önce'];

    function initCanliAktiviteCanli() {
        var el = $('canliAktiviteListe');
        if (!el || !AURIX_DATA.CANLI_AKTIVITE) return;
        setInterval(function () {
            var ogeler = el.querySelectorAll('.canli-aktivite-oge__zaman');
            ogeler.forEach(function (zamanEl, i) {
                var idx = canliAktiviteZamanlar.indexOf(zamanEl.textContent);
                if (idx === -1) idx = 0;
                zamanEl.textContent = canliAktiviteZamanlar[Math.min(idx + 1, canliAktiviteZamanlar.length - 1)];
            });
            var ilk = el.querySelector('.canli-aktivite-oge');
            if (ilk) {
                ilk.classList.add('canli-aktivite-oge--pulse');
                setTimeout(function () { ilk.classList.remove('canli-aktivite-oge--pulse'); }, 800);
            }
        }, 15000);
    }

    function malzemeKartHtml(urun) {
        var kat = malzemeKategoriBul(urun.kategoriId);
        var yedek = varsayilanMalzemeGorseli();
        var gorsel = malzemeKapakGorsel(urun);
        return '<article class="malzeme-kart" data-malzeme-id="' + esc(urun.id) + '">' +
            '<div class="malzeme-kart__gorsel">' +
            gorselImgHtml(gorsel, { alt: urun.baslik, width: 320, height: 200, extraClass: 'malzeme-kart__img', fallback: yedek }) +
            (urun.dogrulandi ? '<span class="malzeme-kart__dogrulandi">Doğrulandı</span>' : '') +
            '</div>' +
            '<div class="malzeme-kart__govde">' +
            '<span class="malzeme-kart__kat">' + kat.ikon + ' ' + esc(kat.ad) + '</span>' +
            '<h3 class="malzeme-kart__baslik">' + esc(urun.baslik) + '</h3>' +
            '<div class="malzeme-kart__meta">' +
            '<span class="malzeme-kart__fiyat">' + esc(urun.fiyat) + '</span>' +
            '<span class="malzeme-kart__durum">' + esc(urun.durum) + '</span>' +
            '</div>' +
            '<p class="malzeme-kart__satici">' + esc(urun.satici) + ' · ' + esc(urun.sehir) + '</p>' +
            '<button type="button" class="btn btn--primary btn--sm malzeme-kart__btn" data-malzeme-teklif="' + esc(urun.id) + '">Teklif Al</button>' +
            '</div></article>';
    }

    function filtreliMalzemeUrunleri() {
        var list = AURIX_DATA.MALZEME_URUNLER || [];
        var arama = (state.malzeme.arama || '').toLocaleLowerCase('tr-TR');
        var katId = state.malzeme.kategoriId;
        return list.filter(function (u) {
            if (katId && u.kategoriId !== katId) return false;
            if (!arama) return true;
            var kat = malzemeKategoriBul(u.kategoriId);
            var metin = (u.baslik + ' ' + u.satici + ' ' + u.sehir + ' ' + kat.ad).toLocaleLowerCase('tr-TR');
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
        if (sayac) sayac.textContent = list.length + ' ürün listeleniyor';
        grid.innerHTML = list.length
            ? list.map(malzemeKartHtml).join('')
            : '<div class="bos-durum"><p>Aramanıza uygun ürün bulunamadı.</p></div>';

        grid.querySelectorAll('[data-malzeme-teklif]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                toast('Malzeme teklif özelliği çok yakında aktif olacak.', 'info');
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

        var kayitKat = $('kayitKategori');
        if (kayitKat) kayitKat.innerHTML = opts;
        var kayitSehir = $('kayitSehir');
        if (kayitSehir) kayitSehir.innerHTML = sehirOpts;

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
        return state.firmalar.slice().filter(function (f) {
            if (!arama) return true;
            return f.ad.toLowerCase().indexOf(arama) !== -1;
        }).sort(function (a, b) {
            if (a.durum === 'beklemede' && b.durum !== 'beklemede') return -1;
            if (b.durum === 'beklemede' && a.durum !== 'beklemede') return 1;
            return 0;
        });
    }

    function adminAksiyonHtml(f) {
        var html = '';
        if (f.durum === 'beklemede') {
            html += '<button type="button" class="admin-btn admin-btn--onay" data-onay="' + f.id + '" title="Onayla">✓</button>';
            html += '<button type="button" class="admin-btn admin-btn--red" data-red="' + f.id + '" title="Reddet">✕</button>';
        } else if (f.durum === 'onaylandi') {
            html += '<button type="button" class="admin-btn admin-btn--askiya" data-askiya="' + f.id + '" title="Askıya Al">⏸</button>';
        } else {
            html += '<button type="button" class="admin-btn admin-btn--onay" data-onay="' + f.id + '" title="Onayla">✓</button>';
        }
        html += '<button type="button" class="admin-btn admin-btn--premium' + (f.premium ? ' admin-btn--aktif' : '') + '" data-premium="' + f.id + '" title="Premium ' + (f.premium ? 'Kapat' : 'Aç') + '">★</button>';
        html += '<button type="button" class="admin-btn admin-btn--partner' + (f.sponsor ? ' admin-btn--aktif' : '') + '" data-partner="' + f.id + '" title="Partner ' + (f.sponsor ? 'Kapat' : 'Aç') + '">◆</button>';
        html += '<button type="button" class="admin-btn admin-btn--sil" data-sil="' + f.id + '" title="Sil">🗑</button>';
        return html;
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
        if (bekleyen) bekleyen.textContent = firmalar.filter(function (f) { return f.durum === 'beklemede'; }).length;
        if (onayli) onayli.textContent = firmalar.filter(function (f) { return f.durum === 'onaylandi'; }).length;
        if (partner) partner.textContent = firmalar.filter(function (f) { return f.sponsor; }).length;
        if (prem) prem.textContent = firmalar.filter(function (f) { return f.premium; }).length;
        renderAdminGelir();
    }

    function renderAdminTablo() {
        var tbody = $('adminTbody');
        if (!tbody) return;
        var rows = adminTabloSatirlari();

        tbody.innerHTML = rows.length ? rows.map(function (f) {
            var kat = kategoriBul(f.kategoriId);
            var grupAd = kategoriGrupAdi(f.kategoriId);
            var durumCls = 'durum durum--' + safeCss(f.durum, 'beklemede');
            return '<tr class="admin-tablo__satir">' +
                '<td><span class="admin-tablo__firma">' + esc(f.ad) + '</span></td>' +
                '<td><span class="admin-tablo__meta">' + kat.ikon + ' ' + esc(kat.ad) + '</span></td>' +
                '<td><span class="admin-tablo__meta">' + esc(f.sehir) + '</span></td>' +
                '<td><span class="admin-tablo__kategori">' + esc(grupAd) + '</span></td>' +
                '<td><span class="admin-tablo__tel">+' + telTemizle(f.tel) + '</span></td>' +
                '<td><span class="' + durumCls + '">' + adminDurumEtiket(f.durum) + '</span></td>' +
                '<td><div class="admin-aksiyon">' + adminAksiyonHtml(f) + '</div></td></tr>';
        }).join('') : '<tr><td colspan="7" class="admin-tablo__bos">Sonuç bulunamadı.</td></tr>';

        tbody.querySelectorAll('[data-onay]').forEach(function (btn) {
            btn.addEventListener('click', function () { adminDurumGuncelle(btn.getAttribute('data-onay'), 'onaylandi'); });
        });
        tbody.querySelectorAll('[data-red]').forEach(function (btn) {
            btn.addEventListener('click', function () { adminDurumGuncelle(btn.getAttribute('data-red'), 'reddedildi'); });
        });
        tbody.querySelectorAll('[data-askiya]').forEach(function (btn) {
            btn.addEventListener('click', function () { adminDurumGuncelle(btn.getAttribute('data-askiya'), 'askida'); });
        });
        tbody.querySelectorAll('[data-premium]').forEach(function (btn) {
            btn.addEventListener('click', function () { adminTogglePremium(btn.getAttribute('data-premium')); });
        });
        tbody.querySelectorAll('[data-partner]').forEach(function (btn) {
            btn.addEventListener('click', function () { adminTogglePartner(btn.getAttribute('data-partner')); });
        });
        tbody.querySelectorAll('[data-sil]').forEach(function (btn) {
            btn.addEventListener('click', function () { adminSil(btn.getAttribute('data-sil')); });
        });

        renderAdminOzet();
    }

    function renderAdminUI() {
        var link = $('navAdmin');
        var btn = $('adminGirisBtn');
        var headerSag = $('adminHeaderSag');
        var merhaba = headerSag ? headerSag.querySelector('.panel-header__merhaba, .admin-header__merhaba') : null;
        var adminSayfa = document.querySelector('[data-sayfa="admin"]');
        var adminBetaBar = document.querySelector('[data-sayfa="admin"] .panel-beta-bar--admin');
        if (link) link.hidden = true;
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
        }
        renderAdminUI();
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
    }

    function detayModalAc(id) {
        var firma = state.firmalar.find(function (f) { return f.id === id; });
        if (!firma) return;
        var kat = kategoriBul(firma.kategoriId);
        var tel = telTemizle(firma.tel);
        $('detayAd').textContent = firma.ad;
        $('detayKat').textContent = kat.ikon + ' ' + kat.ad;
        $('detaySehir').textContent = firma.sehir;
        $('detayAciklama').textContent = firma.aciklama;
        $('detayPuan').textContent = firma.puan ? yildizGoster(firma.puan) : 'Henüz puan yok';
        var detayImg = $('detayGorsel');
        if (detayImg) {
            detayImg.classList.add('aurix-img-fallback');
            detayImg.dataset.fallbackApplied = '';
            var detayYedek = varsayilanFirmaGorseli();
            detayImg.setAttribute('data-fallback-src', detayYedek);
            detayImg.onerror = null;
            detayImg.classList.remove('aurix-img-fallback--hidden');
            detayImg.style.display = '';
            var detayWrap = detayImg.parentElement;
            if (detayWrap) detayWrap.classList.remove('gorsel-alan--placeholder');
            detayImg.src = safeImageUrl(firmaKapakGorsel(firma), detayYedek);
            detayImg.alt = firma.ad;
        }
        var detayWa = $('detayWa');
        if (detayWa) {
            var waHref = safeWaHref(tel);
            if (waHref) {
                detayWa.href = waHref;
                detayWa.hidden = false;
            } else {
                detayWa.removeAttribute('href');
                detayWa.hidden = true;
            }
        }
        var rozetler = $('detayRozetler');
        if (rozetler) {
            rozetler.innerHTML = (firma.durum === 'onaylandi' ? '<span class="rozet rozet--dogrulandi">Doğrulandı</span>' : '') +
                (firma.premium ? '<span class="rozet rozet--premium">PREMIUM</span>' : '') +
                (firma.sponsor ? '<span class="rozet rozet--partner">PARTNER</span>' : '');
        }
        var detayGuven = $('detayGuven');
        if (detayGuven) detayGuven.innerHTML = detayGuvenPanelHtml(firma);
        modalAc('detayModal');
    }

    function modalAc(id) {
        var el = $(id);
        if (el) { el.classList.add('modal--acik'); document.body.classList.add('modal-acik'); }
    }

    function modalKapat(id) {
        var el = $(id);
        if (el) { el.classList.remove('modal--acik'); document.body.classList.remove('modal-acik'); }
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
        if (id === 'giris') {
            navMenuKapat();
            modalAc('girisModal');
            return;
        }
        if (id === 'admin') {
            if (!isAdminSession()) return;
        }
        if (id === 'panel') {
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
            renderAdminTablo();
        }
        if (id === 'malzeme') renderMalzemePazari();
        if (id === 'piyasa') {
            renderPiyasaBandi();
            renderHeroTerminal(marketQuotes);
        }
    }

    function firmaBasvuruDogrula(ad, tel, aciklama) {
        if (ad.length < 2) return 'Firma adı en az 2 karakter olmalı.';
        if (!/^90[0-9]{10}$/.test(tel)) return 'Telefon: 905XXXXXXXXX formatında girin.';
        if (aciklama.length < 10) return 'Açıklama en az 10 karakter olmalı.';
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
        var ad = $('kayitAd').value.trim();
        var tel = telTemizle($('kayitTel').value);
        var aciklama = $('kayitAciklama').value.trim();
        var kategoriId = $('kayitKategori').value;
        var sehir = $('kayitSehir').value;

        var hata = firmaBasvuruDogrula(ad, tel, aciklama);
        if (hata) { toast(hata, 'error'); return; }

        var yeni = firmaBasvuruOlustur(ad, tel, aciklama, kategoriId, sehir);
        state.firmalar.push(yeni);
        StorageAdapter.save(state.firmalar);
        $('kayitForm').reset();
        toast('Başvurunuz alındı! Onay sürecinden sonra vitrinde görünecek.', 'success');
        tumunuRenderEt();
        sayfaGoster('ana-sayfa');
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
        var tel = telTemizle($('adminKayitTel').value);
        var aciklama = $('adminKayitAciklama').value.trim();
        var kategoriId = $('adminKayitKategori').value;
        var sehir = $('adminKayitSehir').value;

        var hata = firmaBasvuruDogrula(ad, tel, aciklama);
        if (hata) { toast(hata, 'error'); return; }

        var yeni = firmaBasvuruOlustur(ad, tel, aciklama, kategoriId, sehir);
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

    function adminGiris() {
        // v1.0: Supabase Auth signInWithPassword + profiles.role === 'admin' doğrulaması burada yapılacak.
        if (!ADMIN_PANEL_ENABLED) {
            toast('Yönetim paneli şu an devre dışı.', 'info');
            return;
        }
        toast('Geçersiz e-posta veya şifre.', 'error');
    }

    function adminCikis() {
        if (devAdminMode) {
            devAdminCikis();
            return;
        }
        AuthService.signOut();
        renderAdminUI();
        sayfaGoster('ana-sayfa');
        toast('Çıkış yapıldı.', 'info');
    }

    function demoVeriSifirla() {
        if (!confirm('Tüm demo verileri sıfırlansın mı?')) return;
        StorageAdapter.reset();
        StorageAdapter.init();
        tumunuRenderEt();
        toast('Demo verileri sıfırlandı.', 'info');
    }

    // ================================================================
    // BAŞLATMA
    // ================================================================

    function init() {
        initDevAdminMode();
        StorageAdapter.init();

        AurixUtils.initImageFallbackHandler();
        renderKategoriSelectler();
        renderFiltreChips();
        renderSehirChips();
        initCanliAktiviteCanli();
        initMarketService();
        tumunuRenderEt({ skipPiyasa: true });
        setInterval(heroTerminalSaatGuncelle, 1000);

        PanelUI.bindTabs();
        PanelUI.renderAdminSkeleton();

        // Navigasyon
        document.querySelectorAll('[data-nav]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                sayfaGoster(el.getAttribute('data-nav'));
            });
        });

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

        var girisBtn = $('girisBtn');
        if (girisBtn) {
            girisBtn.addEventListener('click', function () {
                var email = $('girisEmail') ? $('girisEmail').value : '';
                var sifre = $('girisSifre') ? $('girisSifre').value : '';
                var result = AuthService.signIn(email, sifre);
                if (!result.ok) {
                    toast(result.error, 'error');
                    return;
                }
                modalKapat('girisModal');
                PanelUI.renderUserPanel();
                sayfaGoster('panel');
                toast('Firma paneli açıldı.', 'info');
            });
        }

        document.querySelectorAll('.giris-modal__kayit-link').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                modalKapat('girisModal');
                sayfaGoster('kayit');
            });
        });

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

        var vitrinSiralama = $('vitrinSiralama');
        if (vitrinSiralama) {
            vitrinSiralama.addEventListener('change', function () {
                state.vitrin.siralama = this.value;
                vitrinSayfaSifirla();
                renderVitrin();
            });
        }

        // Form
        $('kayitForm').addEventListener('submit', kayitGonder);

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
        $('menuToggle').addEventListener('click', navMenuToggle);
        var navBackdrop = $('navBackdrop');
        if (navBackdrop) navBackdrop.addEventListener('click', navMenuKapat);

        renderAdminUI();

        if (devAdminMode) {
            sayfaGoster('admin');
        }
    }

    // Global (HTML onclick yerine event delegation tercih edildi; geriye dönük)
    window.Aurix = { sayfaGoster: sayfaGoster, scrollToBolum: scrollToBolum, modalKapat: modalKapat, demoSifirla: demoVeriSifirla, toast: toast };

    document.addEventListener('DOMContentLoaded', init);
})();

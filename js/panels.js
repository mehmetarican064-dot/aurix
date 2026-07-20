/**
 * AURIX Panel UI — kullanıcı / firma paneli (Supabase)
 * Normal kullanıcı: karşılama + temel menüler
 * Firma hesabı: firma menüleri (teklif, profil, ayarlar)
 */
(function (global) {
    'use strict';

    var esc = AurixUtils.escapeHtml;

    function $(id) { return document.getElementById(id); }

    var userTab = 'dashboard';
    var adminTab = 'firmalar';
    var panelBound = false;
    var lastHasFirma = false;

    var NORMAL_TABS = [
        { id: 'dashboard', label: 'Ana Sayfa' },
        { id: 'islerim', label: 'İş Taleplerim' },
        { id: 'mesajlar', label: 'Mesajlar' },
        { id: 'firma-olustur', label: 'Firma Hesabı Oluştur', action: true }
    ];

    var FIRMA_TABS = [
        { id: 'dashboard', label: 'Ana Sayfa' },
        { id: 'islerim', label: 'İş Taleplerim' },
        { id: 'gelen', label: 'Gelen İşler' },
        { id: 'teklifler', label: 'Verdiğim Teklifler' },
        { id: 'profil', label: 'Firma Profilim' },
        { id: 'mesajlar', label: 'Mesajlar' },
        { id: 'ayarlar', label: 'Firma Ayarları' }
    ];

    function panelTabSec(tab) {
        if (!tab) return;
        if (tab === 'firma-olustur') {
            if (global.Aurix && typeof Aurix.firmaBasvuruModalAc === 'function') {
                Aurix.firmaBasvuruModalAc();
            }
            return;
        }
        userTab = tab;
        document.querySelectorAll('[data-panel-tab]').forEach(function (btn) {
            var aktif = btn.getAttribute('data-panel-tab') === tab;
            btn.classList.toggle('panel-tab--aktif', aktif);
            btn.setAttribute('aria-selected', aktif ? 'true' : 'false');
        });
        document.querySelectorAll('[data-panel-icerik]').forEach(function (el) {
            var aktif = el.getAttribute('data-panel-icerik') === tab;
            el.classList.toggle('panel-sekme--aktif', aktif);
            el.hidden = !aktif;
        });
    }

    function adminPanelTabSec(tab) {
        if (!tab) return;
        adminTab = tab;
        document.querySelectorAll('[data-admin-tab]').forEach(function (btn) {
            var aktif = btn.getAttribute('data-admin-tab') === tab;
            btn.classList.toggle('panel-tab--aktif', aktif);
            btn.setAttribute('aria-selected', aktif ? 'true' : 'false');
        });
        document.querySelectorAll('[data-admin-icerik]').forEach(function (el) {
            var aktif = el.getAttribute('data-admin-icerik') === tab;
            el.classList.toggle('panel-sekme--aktif', aktif);
            el.hidden = !aktif;
        });
    }

    function toastInfo(mesaj) {
        if (global.Aurix && Aurix.toast) Aurix.toast(mesaj, 'info');
    }

    function fpDurumSlug(durum) {
        var d = String(durum || '').toLowerCase();
        if (/ödendi|teslim|onay/.test(d)) return 'yesil';
        if (/devam|üretim|hazırlan|incelen|gönderildi|bekle|acik|açık/.test(d)) return 'turuncu';
        if (/iptal|red/.test(d)) return 'kirmizi';
        return 'notr';
    }

    function fpDurumBadge(durum) {
        var slug = fpDurumSlug(durum);
        return '<span class="fp-badge fp-badge--' + slug + '">' + esc(durum || '—') + '</span>';
    }

    function fpBolumHtml(baslik, icerik) {
        return '<section class="fp-bolum">' +
            '<h3 class="fp-bolum__baslik">' + esc(baslik) + '</h3>' +
            icerik +
            '</section>';
    }

    function guncellePanelTabs(hasFirma) {
        var nav = $('panelTabs');
        if (!nav) return;
        var tabs = hasFirma ? FIRMA_TABS : NORMAL_TABS;
        var mevcut = userTab;
        var gecerli = tabs.some(function (t) { return t.id === mevcut && !t.action; });
        if (!gecerli) mevcut = 'dashboard';
        userTab = mevcut;

        nav.innerHTML = tabs.map(function (t) {
            var aktif = !t.action && t.id === userTab;
            var cls = 'panel-tab' + (aktif ? ' panel-tab--aktif' : '') +
                (t.action ? ' panel-tab--aksiyon' : '');
            return '<button type="button" class="' + cls + '" data-panel-tab="' + esc(t.id) +
                '" role="tab" aria-selected="' + (aktif ? 'true' : 'false') + '">' +
                esc(t.label) + '</button>';
        }).join('');

        nav.querySelectorAll('[data-panel-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                panelTabSec(btn.getAttribute('data-panel-tab'));
            });
        });

        document.querySelectorAll('[data-panel-icerik]').forEach(function (el) {
            var id = el.getAttribute('data-panel-icerik');
            var aktif = id === userTab;
            el.classList.toggle('panel-sekme--aktif', aktif);
            el.hidden = !aktif;
        });
    }

    function guncellePanelHeader(hasFirma) {
        var baslik = document.querySelector('.panel-header__baslik');
        var beta = document.querySelector('.panel-beta-bar__metin');
        if (baslik) {
            baslik.textContent = hasFirma ? 'Firma Paneli' : 'Hesabım';
        }
        if (beta) {
            beta.textContent = hasFirma
                ? 'İşlerinizi, tekliflerinizi ve firma profilinizi tek panelden yönetin.'
                : 'Canlı piyasayı takip edin, firmaları inceleyin veya iş talebi oluşturun.';
        }
    }

    /** Normal kullanıcı — demo KPI yok; sade karşılama */
    function renderKarsilama() {
        return '<div class="fp-karsilama">' +
            '<h2 class="fp-karsilama__baslik">Hoş Geldiniz</h2>' +
            '<p class="fp-karsilama__aciklama">' +
            'Canlı piyasayı takip edebilir, firmaları inceleyebilir, iş talebi oluşturabilir ' +
            'veya isterseniz firma hesabınızı oluşturabilirsiniz.' +
            '</p>' +
            '<div class="fp-karsilama__kartlar">' +
            '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="piyasa">' +
            '<span class="fp-karsilama-kart__baslik">Canlı Piyasa</span>' +
            '<span class="fp-karsilama-kart__metin">Altın ve döviz fiyatlarını anlık takip edin.</span>' +
            '</button>' +
            '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="is-talebi">' +
            '<span class="fp-karsilama-kart__baslik">İş Talebi Oluştur</span>' +
            '<span class="fp-karsilama-kart__metin">İş yaptırmak için talep oluşturun, teklifleri alın.</span>' +
            '</button>' +
            '<button type="button" class="fp-karsilama-kart fp-karsilama-kart--vurgu" data-panel-aksiyon="firma-hesabi">' +
            '<span class="fp-karsilama-kart__baslik">Firma Hesabı Oluştur</span>' +
            '<span class="fp-karsilama-kart__metin">İş almak istiyorsanız firma hesabınızı oluşturun.</span>' +
            '</button>' +
            '</div></div>';
    }

    /** Firma sahibi — özet (demo kazanç yok) */
    function renderFirmaDashboard(veri) {
        var f = (veri && veri.firma) || null;
        var teklifler = (veri && veri.teklifler) || [];
        var durum = f ? (f.durum || (f.dogrulanmis ? 'onaylandi' : 'beklemede')) : '—';
        var durumMetin = {
            beklemede: 'Başvurunuz inceleniyor',
            onaylandi: 'Firma hesabınız aktif',
            reddedildi: 'Başvuru reddedildi'
        };

        return '<div class="fp-karsilama fp-karsilama--firma">' +
            '<h2 class="fp-karsilama__baslik">Firma Paneli</h2>' +
            '<p class="fp-karsilama__aciklama">' +
            esc(durumMetin[durum] || 'Firma hesabınız') +
            (f && f.firma_adi ? ' · ' + esc(f.firma_adi) : '') +
            '</p>' +
            '<div class="fp-karsilama__kartlar fp-karsilama__kartlar--3">' +
            '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="gelen">' +
            '<span class="fp-karsilama-kart__baslik">Gelen İşler</span>' +
            '<span class="fp-karsilama-kart__metin">Açık iş taleplerini inceleyin.</span>' +
            '</button>' +
            '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="teklifler">' +
            '<span class="fp-karsilama-kart__baslik">Verdiğim Teklifler</span>' +
            '<span class="fp-karsilama-kart__metin">' + esc(String(teklifler.length)) + ' teklif kaydı</span>' +
            '</button>' +
            '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="profil">' +
            '<span class="fp-karsilama-kart__baslik">Firma Profilim</span>' +
            '<span class="fp-karsilama-kart__metin">Profil ve ayarlarınızı yönetin.</span>' +
            '</button>' +
            '</div></div>';
    }

    function renderDashboard(veri) {
        if (veri && veri.hasFirma) return renderFirmaDashboard(veri);
        return renderKarsilama();
    }

    function renderIslerim(veri) {
        var liste = (veri && veri.kullaniciIsleri) || [];
        if (!liste.length) {
            return '<div class="fp-bos-kutu">' +
                '<p class="fp-bos-metin">Henüz iş talebiniz yok.</p>' +
                '<button type="button" class="btn btn--primary btn--sm" data-panel-aksiyon="is-talebi">İş Talebi Oluştur</button>' +
                '</div>';
        }
        var html = liste.map(function (o) {
            return '<li class="fp-is-satir">' +
                '<div class="fp-is-satir__sol">' +
                '<strong>' + esc(o.baslik || 'İş talebi') + '</strong>' +
                '<span class="fp-is-satir__musteri">' + esc(o.sehir || '—') +
                (o.kategori ? ' · ' + esc(o.kategori) : '') + '</span>' +
                '</div>' +
                '<div class="fp-is-satir__sag">' +
                fpDurumBadge(o.durum || 'Acik') +
                '</div></li>';
        }).join('');
        return fpBolumHtml('İş Taleplerim',
            '<ul class="fp-is-list">' + html + '</ul>' +
            '<p class="fp-aksiyon-satir"><button type="button" class="btn btn--primary btn--sm" data-panel-aksiyon="is-talebi">Yeni İş Talebi</button></p>');
    }

    function renderGelenIsler() {
        return '<div class="fp-bos-kutu">' +
            '<p class="fp-bos-metin">Açık iş taleplerini ana sayfadaki listeden inceleyebilirsiniz.</p>' +
            '<button type="button" class="btn btn--primary btn--sm" data-panel-aksiyon="acik-isler">Açık İş Taleplerine Git</button>' +
            '</div>';
    }

    function renderTeklifler(veri) {
        var teklifler = (veri && veri.teklifler) || [];
        if (!teklifler.length) {
            return '<p class="fp-bos-metin">Henüz teklif vermediniz.</p>';
        }
        return teklifler.map(function (t) {
            return '<article class="fp-teklif-kart" data-teklif-id="' + esc(String(t.id || '')) + '">' +
                '<div class="fp-teklif-kart__ust">' +
                '<h4 class="fp-teklif-kart__baslik">' + esc(t.isAdi) + '</h4>' +
                fpDurumBadge(t.durum) +
                '</div>' +
                '<dl class="fp-teklif-kart__meta">' +
                '<div><dt>İş</dt><dd>' + esc(t.isAdi) + '</dd></div>' +
                '<div><dt>Teslim süresi</dt><dd>' + esc(t.termin || '—') + '</dd></div>' +
                '</dl></article>';
        }).join('');
    }

    function renderProfil(veri, user) {
        var f = (veri && veri.firma) || null;
        if (!f) {
            return '<div class="fp-bos-kutu">' +
                '<p class="fp-bos-metin">Firma profiliniz henüz oluşturulmadı.</p>' +
                '<button type="button" class="btn btn--gold btn--sm" data-panel-aksiyon="firma-hesabi">Firma Hesabı Oluştur</button>' +
                '</div>';
        }
        var durumEtiket = f.durum || (f.dogrulanmis ? 'onaylandi' : 'beklemede');
        var logoHtml = f.logo_url
            ? '<img class="fp-profil-logo" src="' + esc(f.logo_url) + '" alt="" width="72" height="72">'
            : '';
        var gorseller = Array.isArray(f.calisma_gorselleri) ? f.calisma_gorselleri : [];
        var galeri = gorseller.length
            ? '<div class="fp-profil-galeri">' + gorseller.map(function (u) {
                return '<img src="' + esc(u) + '" alt="" loading="lazy">';
            }).join('') + '</div>'
            : '';

        return '<div class="fp-profil-grid">' +
            '<article class="fp-profil-kart fp-profil-kart--ana">' +
            '<div class="fp-profil-kart__ust">' +
            logoHtml +
            '<h3 class="fp-profil-kart__firma">' + esc(f.firma_adi || '—') + '</h3>' +
            fpDurumBadge(durumEtiket) +
            '</div>' +
            '<dl class="fp-profil-dl">' +
            '<div><dt>Hizmet alanı</dt><dd>' + esc(f.kategori || '—') + '</dd></div>' +
            '<div><dt>Şehir</dt><dd>' + esc(f.sehir || '—') + '</dd></div>' +
            '<div><dt>Açıklama</dt><dd>' + esc(f.aciklama || '—') + '</dd></div>' +
            '</dl>' +
            galeri +
            '</article>' +
            '<article class="fp-profil-kart">' +
            '<h4 class="fp-profil-kart__alt-baslik">Hesap</h4>' +
            '<p class="fp-profil-hesap">' + esc(user ? user.email : 'Oturum açılmadı') + '</p>' +
            '<p class="panel-not">Firma hesabınız oluşturuldu. Onay sonrası vitrinde yer alırsınız.</p>' +
            '</article></div>';
    }

    function renderMesajlar() {
        return '<div class="fp-bos-kutu">' +
            '<p class="fp-bos-metin">Mesajlaşma yakında kullanıma açılacaktır.</p>' +
            '</div>';
    }

    function renderAyarlar() {
        var satirlar = [
            { key: 'firmaBildirim', label: 'Firma bildirimleri', aciklama: 'Yeni iş ve teklif bildirimleri', varsayilan: true },
            { key: 'panelBildirim', label: 'Panel Bildirimleri', aciklama: 'Kritik iş güncellemeleri', varsayilan: true },
            { key: 'profilGorunurluk', label: 'Profil görünürlüğü', aciklama: 'Onay sonrası firma profiliniz arama sonuçlarında', varsayilan: true }
        ];

        var html = satirlar.map(function (s) {
            var checked = s.varsayilan ? ' checked' : '';
            return '<label class="fp-toggle">' +
                '<span class="fp-toggle__metin">' +
                '<strong class="fp-toggle__label">' + esc(s.label) + '</strong>' +
                '<span class="fp-toggle__aciklama">' + esc(s.aciklama) + '</span>' +
                '</span>' +
                '<input type="checkbox" class="fp-toggle__input" data-panel-ayar="' + esc(s.key) + '"' + checked + '>' +
                '<span class="fp-toggle__track" aria-hidden="true"></span>' +
                '</label>';
        }).join('');

        return '<div class="fp-ayarlar">' + html + '</div>';
    }

    function guncelleFirmaUyari(hasFirma) {
        var el = $('panelFirmaUyari');
        if (!el) return;
        /* Karşılama kartları yeterli; ayrı uyarı bandı gizlenir */
        el.hidden = true;
    }

    function panelAksiyon(aksiyon) {
        if (aksiyon === 'piyasa') {
            if (global.Aurix && Aurix.sayfaGoster) Aurix.sayfaGoster('piyasa');
            return;
        }
        if (aksiyon === 'is-talebi') {
            if (global.Aurix && typeof Aurix.isTalepModalAc === 'function') {
                Aurix.isTalepModalAc();
            } else {
                var btn = $('isTalepAcBtn');
                if (btn) btn.click();
            }
            return;
        }
        if (aksiyon === 'firma-hesabi') {
            if (global.Aurix && typeof Aurix.firmaBasvuruModalAc === 'function') {
                Aurix.firmaBasvuruModalAc();
            }
            return;
        }
        if (aksiyon === 'acik-isler') {
            if (global.Aurix && Aurix.sayfaGoster) Aurix.sayfaGoster('ana-sayfa');
            setTimeout(function () {
                var hedef = document.getElementById('acik-is-talepleri');
                if (hedef) hedef.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
            return;
        }
        if (aksiyon === 'gelen' || aksiyon === 'teklifler' || aksiyon === 'profil') {
            panelTabSec(aksiyon);
        }
    }

    function bindPanelActions() {
        if (panelBound) return;
        panelBound = true;

        var olusturBtn = $('panelFirmaOlusturBtn');
        if (olusturBtn) {
            olusturBtn.addEventListener('click', function () {
                panelAksiyon('firma-hesabi');
            });
        }

        var icerik = $('panelIcerik');
        if (icerik) {
            icerik.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-panel-aksiyon]');
                if (!btn) return;
                panelAksiyon(btn.getAttribute('data-panel-aksiyon'));
            });
            icerik.addEventListener('change', function (e) {
                var input = e.target.closest('[data-panel-ayar]');
                if (!input) return;
                var durum = input.checked ? 'açık' : 'kapalı';
                var labelEl = input.closest('.fp-toggle');
                var label = labelEl && labelEl.querySelector('.fp-toggle__label');
                var ad = label ? label.textContent : 'Tercih';
                toastInfo(ad + ' ' + durum + '.');
            });
        }
    }

    function panelIcerikYukle(veri) {
        var user = global.AuthService ? AuthService.getCurrentUser() : null;
        var hasFirma = !!(veri && veri.hasFirma);
        lastHasFirma = hasFirma;

        var greeting = $('panelUserGreeting');
        if (greeting) {
            greeting.textContent = user
                ? 'Merhaba, ' + user.displayName
                : 'Hoş geldiniz';
        }

        guncellePanelHeader(hasFirma);
        guncellePanelTabs(hasFirma);
        guncelleFirmaUyari(hasFirma);

        var dashEl = $('panelSekmeDashboard');
        if (dashEl) dashEl.innerHTML = renderDashboard(veri);

        var islerEl = $('panelSekmeIslerim');
        if (islerEl) islerEl.innerHTML = renderIslerim(veri);

        var gelenEl = $('panelSekmeGelen');
        if (gelenEl) gelenEl.innerHTML = renderGelenIsler();

        var teklifEl = $('panelSekmeTeklifler');
        if (teklifEl) teklifEl.innerHTML = renderTeklifler(veri);

        var profilEl = $('panelSekmeProfil');
        if (profilEl) profilEl.innerHTML = renderProfil(veri, user);

        var mesajEl = $('panelSekmeMesajlar');
        if (mesajEl) mesajEl.innerHTML = renderMesajlar();

        var ayarEl = $('panelSekmeAyarlar');
        if (ayarEl) ayarEl.innerHTML = renderAyarlar();

        bindPanelActions();
    }

    function renderUserPanel() {
        var sifir = {
            hasFirma: false,
            firma: null,
            teklifler: [],
            kullaniciIsleri: []
        };

        var user = global.AuthService ? AuthService.getCurrentUser() : null;
        if (user && user.isFirmaHesabi) sifir.hasFirma = true;

        panelIcerikYukle(sifir);

        if (!global.AurixSupabase || typeof AurixSupabase.getirFirmaPanelOzeti !== 'function') {
            return;
        }

        var panelPromise = AurixSupabase.getirFirmaPanelOzeti();
        var islerPromise = (typeof AurixSupabase.getirKullaniciIsTalepleri === 'function')
            ? AurixSupabase.getirKullaniciIsTalepleri()
            : Promise.resolve({ ok: true, data: [] });

        Promise.all([panelPromise, islerPromise]).then(function (sonuclar) {
            var res = sonuclar[0] || {};
            var isRes = sonuclar[1] || {};
            panelIcerikYukle({
                hasFirma: !!res.hasFirma,
                firma: res.firma || null,
                teklifler: res.teklifler || [],
                kullaniciIsleri: (isRes.ok && isRes.data) ? isRes.data : []
            });
            if (res.hasFirma && global.AuthService && typeof AuthService.refreshProfile === 'function') {
                AuthService.refreshProfile();
            }
        }).catch(function () {
            panelIcerikYukle(sifir);
        });
    }

    function renderAdminSkeleton() {
        if (global.Aurix && typeof Aurix.renderAdminModeration === 'function') {
            Aurix.renderAdminModeration();
            return;
        }
        var el;
        el = $('adminSekmeIsTalepleri');
        if (el) el.innerHTML = '<div class="admin-mod-bos"><p>Yükleniyor…</p></div>';
        el = $('adminSekmeMalzemeler');
        if (el) el.innerHTML = '<div class="admin-mod-bos"><p>Yükleniyor…</p></div>';
        el = $('adminSekmeKullanicilar');
        if (el) el.innerHTML = '<div class="admin-mod-bos"><p>Yükleniyor…</p></div>';
        el = $('adminSekmeRaporlar');
        if (el) el.innerHTML = '<div class="admin-mod-bos"><p>Yükleniyor…</p></div>';
    }

    function bindTabs() {
        document.querySelectorAll('[data-admin-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminPanelTabSec(btn.getAttribute('data-admin-tab'));
            });
        });
        var panelCikis = $('panelCikisBtn');
        if (panelCikis) {
            panelCikis.addEventListener('click', function () {
                var bitir = function () {
                    if (global.Aurix && Aurix.sayfaGoster) Aurix.sayfaGoster('ana-sayfa');
                    if (global.Aurix && Aurix.toast) Aurix.toast('Oturum kapatıldı.', 'info');
                };
                if (global.AuthService && typeof AuthService.signOut === 'function') {
                    AuthService.signOut().then(bitir).catch(bitir);
                } else {
                    bitir();
                }
            });
        }
        bindPanelActions();
    }

    global.PanelUI = {
        renderUserPanel: renderUserPanel,
        renderAdminSkeleton: renderAdminSkeleton,
        panelTabSec: panelTabSec,
        adminPanelTabSec: adminPanelTabSec,
        bindTabs: bindTabs,
        hasFirmaHesabi: function () { return lastHasFirma; }
    };
})(typeof window !== 'undefined' ? window : this);

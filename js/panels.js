/**
 * AURIX Panel UI — kullanıcı ve admin iskelet (Beta v0.1)
 * v1.0'da Supabase veri katmanı ile genişletilecek.
 */
(function (global) {
    'use strict';

    var esc = AurixUtils.escapeHtml;

    function $(id) { return document.getElementById(id); }

    var userTab = 'profil';
    var adminTab = 'firmalar';

    function panelTabSec(tab) {
        if (!tab) return;
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

    function panelKartHtml(baslik, satirlar) {
        var rows = satirlar.map(function (s) {
            return '<div class="panel-kart__satir"><span class="panel-kart__etiket">' + esc(s.etiket) +
                '</span><span class="panel-kart__deger">' + esc(s.deger) + '</span></div>';
        }).join('');
        return '<article class="panel-kart"><h3 class="panel-kart__baslik">' + esc(baslik) + '</h3><div class="panel-kart__govde">' + rows + '</div></article>';
    }

    function panelListeHtml(baslik, ogeler, alanlar) {
        if (!ogeler.length) {
            return '<div class="panel-bos"><p>Henüz kayıt yok.</p></div>';
        }
        var html = ogeler.map(function (o) {
            var satirlar = alanlar.map(function (a) {
                return '<span class="panel-liste__hucre panel-liste__hucre--' + esc(a.key) + '">' + esc(o[a.key] || '—') + '</span>';
            }).join('');
            return '<li class="panel-liste__oge">' + satirlar + '</li>';
        }).join('');
        var basliklar = alanlar.map(function (a) {
            return '<span class="panel-liste__baslik-hucre">' + esc(a.label) + '</span>';
        }).join('');
        return '<div class="panel-liste-wrap"><h3 class="panel-liste__baslik">' + esc(baslik) + '</h3>' +
            '<ul class="panel-liste panel-liste--baslikli" aria-label="' + esc(baslik) + '">' +
            '<li class="panel-liste__oge panel-liste__oge--baslik" aria-hidden="true">' + basliklar + '</li>' +
            html + '</ul></div>';
    }

    function renderUserPanel() {
        var demo = AURIX_DATA.PANEL_DEMO || {};
        var user = global.AuthService ? AuthService.getCurrentUser() : null;
        var profil = demo.profil || {};

        var greeting = $('panelUserGreeting');
        if (greeting) {
            greeting.textContent = user
                ? 'Merhaba, ' + user.displayName
                : 'Firma paneli — demo görünüm';
        }

        var emailEl = $('panelHesapEmail');
        if (emailEl) emailEl.textContent = user ? user.email : '—';

        var profilEl = $('panelSekmeProfil');
        if (profilEl) {
            profilEl.innerHTML = panelKartHtml('Firma Profilim', [
                { etiket: 'Firma adı', deger: profil.firmaAd },
                { etiket: 'Branş', deger: profil.kategori },
                { etiket: 'Şehir', deger: profil.sehir },
                { etiket: 'Durum', deger: profil.durum },
                { etiket: 'WhatsApp', deger: profil.tel ? '+' + profil.tel : '—' },
                { etiket: 'Hizmet alanı', deger: profil.aciklama }
            ]);
        }

        var isEl = $('panelSekmeIs');
        if (isEl) {
            isEl.innerHTML = panelListeHtml('İş Taleplerim', (demo.isTalepleri || []).map(function (t) {
                return {
                    baslik: t.baslik,
                    durum: t.durum,
                    teklifSayisi: t.teklifSayisi != null ? String(t.teklifSayisi) : '0',
                    tarih: t.tarih
                };
            }), [
                { key: 'baslik', label: 'Başlık' },
                { key: 'durum', label: 'Durum' },
                { key: 'teklifSayisi', label: 'Teklif' },
                { key: 'tarih', label: 'Tarih' }
            ]);
        }

        var teklifEl = $('panelSekmeTeklif');
        if (teklifEl) {
            teklifEl.innerHTML = panelListeHtml('Gelen Teklifler', demo.teklifler || [], [
                { key: 'isBaslik', label: 'İş' },
                { key: 'firma', label: 'Firma' },
                { key: 'tutar', label: 'Tutar' },
                { key: 'durum', label: 'Durum' }
            ]);
        }

        var malzemeEl = $('panelSekmeMalzeme');
        if (malzemeEl) {
            isEl = demo.malzemeIlanlari || [];
            malzemeEl.innerHTML = panelListeHtml('Malzeme İlanlarım', isEl.map(function (m) {
                return {
                    baslik: m.baslik,
                    fiyat: m.fiyat,
                    durum: m.durum,
                    goruntulenme: m.goruntulenme != null ? String(m.goruntulenme) : '0'
                };
            }), [
                { key: 'baslik', label: 'Ürün' },
                { key: 'fiyat', label: 'Fiyat' },
                { key: 'durum', label: 'Durum' },
                { key: 'goruntulenme', label: 'Görüntülenme' }
            ]);
        }

        var hesapEl = $('panelSekmeHesap');
        if (hesapEl) {
            var hesap = demo.hesap || {};
            hesapEl.innerHTML = panelKartHtml('Hesap Ayarları', [
                { etiket: 'E-posta', deger: user ? user.email : 'Giriş yapılmadı (demo)' },
                { etiket: 'Bildirimler', deger: hesap.bildirimler || '—' },
                { etiket: 'Güvenlik', deger: hesap.guvenlik || '—' }
            ]) + '<p class="panel-not">Bu alan yalnızca arayüz iskeletidir. Ayarlar v1.0\'da kaydedilecektir.</p>';
        }
    }

    function renderAdminSkeleton() {
        var demo = AURIX_DATA.ADMIN_PANEL_DEMO || {};

        var isEl = $('adminSekmeIsTalepleri');
        if (isEl) {
            isEl.innerHTML = panelListeHtml('Bekleyen İş Talepleri', demo.isTalepleri || [], [
                { key: 'baslik', label: 'Başlık' },
                { key: 'sehir', label: 'Şehir' },
                { key: 'basvuru', label: 'Başvuru' }
            ]);
        }

        var malEl = $('adminSekmeMalzemeler');
        if (malEl) {
            malEl.innerHTML = panelListeHtml('Bekleyen Malzemeler', demo.malzemeler || [], [
                { key: 'baslik', label: 'Ürün' },
                { key: 'satici', label: 'Satıcı' },
                { key: 'durum', label: 'Durum' }
            ]);
        }

        var kulEl = $('adminSekmeKullanicilar');
        if (kulEl) {
            kulEl.innerHTML = panelListeHtml('Kullanıcılar', demo.kullanicilar || [], [
                { key: 'ad', label: 'Ad' },
                { key: 'email', label: 'E-posta' },
                { key: 'rol', label: 'Rol' },
                { key: 'durum', label: 'Durum' }
            ]);
        }

        var rapEl = $('adminSekmeRaporlar');
        if (rapEl) {
            var r = demo.raporlar || {};
            rapEl.innerHTML = '<div class="admin-ozet admin-ozet--rapor">' +
                '<div class="admin-kart"><div class="admin-kart__etiket">Toplam Firma</div><div class="admin-kart__sayi">' + esc(String(r.toplamFirma || 0)) + '</div></div>' +
                '<div class="admin-kart admin-kart--uyari"><div class="admin-kart__etiket">Bekleyen Başvuru</div><div class="admin-kart__sayi">' + esc(String(r.bekleyenBasvuru || 0)) + '</div></div>' +
                '<div class="admin-kart"><div class="admin-kart__etiket">Aylık İş Talebi</div><div class="admin-kart__sayi">' + esc(String(r.aylikIsTalebi || 0)) + '</div></div>' +
                '<div class="admin-kart admin-kart--yesil"><div class="admin-kart__etiket">Aktif Malzeme</div><div class="admin-kart__sayi">' + esc(String(r.aktifMalzeme || 0)) + '</div></div>' +
                '</div><p class="panel-not">Raporlar demo veridir. Gerçek metrikler Supabase bağlantısından gelecektir.</p>';
        }
    }

    function bindTabs() {
        document.querySelectorAll('[data-panel-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                panelTabSec(btn.getAttribute('data-panel-tab'));
            });
        });
        document.querySelectorAll('[data-admin-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                adminPanelTabSec(btn.getAttribute('data-admin-tab'));
            });
        });
        var panelCikis = $('panelCikisBtn');
        if (panelCikis) {
            panelCikis.addEventListener('click', function () {
                if (global.AuthService) AuthService.signOut();
                if (global.Aurix && Aurix.sayfaGoster) Aurix.sayfaGoster('ana-sayfa');
                if (global.Aurix && Aurix.toast) Aurix.toast('Panel oturumu kapatıldı (demo).', 'info');
            });
        }
    }

    global.PanelUI = {
        renderUserPanel: renderUserPanel,
        renderAdminSkeleton: renderAdminSkeleton,
        panelTabSec: panelTabSec,
        adminPanelTabSec: adminPanelTabSec,
        bindTabs: bindTabs
    };
})(typeof window !== 'undefined' ? window : this);

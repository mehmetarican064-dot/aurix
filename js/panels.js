/**
 * AURIX Panel UI — firma B2B dashboard & admin iskelet (Beta)
 * v1.0'da Supabase veri katmanı ile genişletilecek.
 */
(function (global) {
    'use strict';

    var esc = AurixUtils.escapeHtml;

    function $(id) { return document.getElementById(id); }

    var userTab = 'dashboard';
    var adminTab = 'firmalar';
    var panelDemoBound = false;

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

    function demoToast(mesaj) {
        if (global.Aurix && Aurix.toast) {
            Aurix.toast(mesaj, 'info');
        }
    }

    function fpDurumSlug(durum) {
        var d = String(durum || '').toLowerCase();
        if (/ödendi|teslim|onay/.test(d)) return 'yesil';
        if (/devam|üretim|hazırlan|incelen/.test(d)) return 'turuncu';
        if (/iptal|red/.test(d)) return 'kirmizi';
        return 'notr';
    }

    function fpDurumBadge(durum) {
        var slug = fpDurumSlug(durum);
        return '<span class="fp-badge fp-badge--' + slug + '">' + esc(durum) + '</span>';
    }

    function fpKpiGridHtml(kartlar) {
        var html = kartlar.map(function (k) {
            return '<article class="fp-kpi">' +
                '<div class="fp-kpi__etiket">' + esc(k.etiket) + '</div>' +
                '<div class="fp-kpi__deger">' + esc(k.deger) + '</div>' +
                (k.alt ? '<div class="fp-kpi__alt">' + esc(k.alt) + '</div>' : '') +
                '</article>';
        }).join('');
        return '<div class="fp-kpi-grid">' + html + '</div>';
    }

    function fpBolumHtml(baslik, icerik) {
        return '<section class="fp-bolum">' +
            '<h3 class="fp-bolum__baslik">' + esc(baslik) + '</h3>' +
            icerik +
            '</section>';
    }

    function fpAktiviteListHtml(ogeler) {
        if (!ogeler.length) {
            return '<p class="fp-bos-metin">Henüz aktivite yok.</p>';
        }
        var html = ogeler.map(function (a) {
            return '<li class="fp-aktivite">' +
                '<span class="fp-aktivite__metin">' + esc(a.metin) + '</span>' +
                '<time class="fp-aktivite__zaman">' + esc(a.zaman) + '</time>' +
                '</li>';
        }).join('');
        return '<ul class="fp-aktivite-list">' + html + '</ul>';
    }

    function fpMiniIsListHtml(ogeler) {
        if (!ogeler.length) {
            return '<p class="fp-bos-metin">Kayıt bulunamadı.</p>';
        }
        var html = ogeler.map(function (o) {
            return '<li class="fp-mini-kart">' +
                '<div class="fp-mini-kart__ust">' +
                '<strong class="fp-mini-kart__baslik">' + esc(o.baslik || o.isAdi) + '</strong>' +
                fpDurumBadge(o.durum) +
                '</div>' +
                '<div class="fp-mini-kart__alt">' +
                '<span>' + esc(o.musteri) + '</span>' +
                (o.termin ? '<span>Termin: ' + esc(o.termin) + '</span>' : '') +
                (o.tutar ? '<span class="fp-mini-kart__tutar">' + esc(o.tutar) + '</span>' : '') +
                '</div></li>';
        }).join('');
        return '<ul class="fp-mini-list">' + html + '</ul>';
    }

    function renderDashboard(demo) {
        var d = demo.dashboard || {};
        var ozet = d.ozet || {};
        var perf = d.performansOzet || {};

        var kpi = fpKpiGridHtml([
            { etiket: 'Bu Ay Kazanç', deger: ozet.buAyKazanc || '—' },
            { etiket: 'Ödenecek Bakiye', deger: ozet.odenecekBakiye || '—' },
            { etiket: 'Sonraki Ödeme', deger: ozet.sonrakiOdeme || '—' },
            { etiket: 'Profil Puanı', deger: ozet.profilPuani || '—', alt: '5 üzerinden' }
        ]);

        var perfOzet = '<div class="fp-perf-ozet">' +
            '<div class="fp-perf-ozet__hucre"><span>Ort. teslim</span><strong>' + esc(perf.ortTeslim || '—') + '</strong></div>' +
            '<div class="fp-perf-ozet__hucre"><span>Ort. puan</span><strong>' + esc(perf.ortPuan || '—') + '</strong></div>' +
            '<div class="fp-perf-ozet__hucre"><span>Teklif dönüş</span><strong>' + esc(perf.teklifDonus || '—') + '</strong></div>' +
            '</div>';

        return kpi +
            '<div class="fp-dash-grid">' +
            fpBolumHtml('Son aktiviteler', fpAktiviteListHtml(d.aktiviteler || [])) +
            fpBolumHtml('Devam eden işler', fpMiniIsListHtml(d.devamEdenIsler || [])) +
            fpBolumHtml('Yeni gelen teklifler', fpMiniIsListHtml((d.yeniTeklifler || []).map(function (t) {
                return { baslik: t.isAdi, musteri: t.musteri, tutar: t.tutar, durum: t.durum };
            }))) +
            fpBolumHtml('Performans özeti', perfOzet) +
            '</div>';
    }

    function renderGelirler(demo) {
        var g = demo.gelirler || {};
        var kpi = fpKpiGridHtml([
            { etiket: 'Toplam Kazanç', deger: g.toplamKazanc || '—' },
            { etiket: 'Kesilen Komisyon', deger: g.komisyon || '—' },
            { etiket: 'Çekilebilir Bakiye', deger: g.cekilebilir || '—' },
            { etiket: 'Bekleyen Ödeme', deger: g.bekleyen || '—' },
            { etiket: 'Sonraki Ödeme Tarihi', deger: g.sonrakiOdemeTarihi || '—' },
            { etiket: 'IBAN', deger: g.ibanMaskeli || '—', alt: 'Kayıtlı hesap' }
        ]);

        var rows = (g.gecmis || []).map(function (r) {
            return '<tr>' +
                '<td data-label="Tarih">' + esc(r.tarih) + '</td>' +
                '<td data-label="Tutar">' + esc(r.tutar) + '</td>' +
                '<td data-label="Durum">' + fpDurumBadge(r.durum) + '</td>' +
                '<td data-label="Açıklama">' + esc(r.aciklama) + '</td>' +
                '</tr>';
        }).join('');

        var tablo = '<div class="fp-table-wrap">' +
            '<table class="fp-table">' +
            '<thead><tr><th>Tarih</th><th>Tutar</th><th>Durum</th><th>Açıklama</th></tr></thead>' +
            '<tbody>' + (rows || '<tr><td colspan="4" class="fp-bos-hucre">Ödeme geçmişi yok.</td></tr>') + '</tbody>' +
            '</table></div>';

        return kpi + fpBolumHtml('Ödeme geçmişi', tablo);
    }

    function renderIsler(demo) {
        var is = demo.isler || {};
        var s = is.sayac || {};
        var kpi = fpKpiGridHtml([
            { etiket: 'Bekleyen İşler', deger: String(s.bekleyen != null ? s.bekleyen : 0) },
            { etiket: 'Devam Eden İşler', deger: String(s.devam != null ? s.devam : 0) },
            { etiket: 'Teslim Edilen İşler', deger: String(s.teslim != null ? s.teslim : 0) },
            { etiket: 'İptal Edilenler', deger: String(s.iptal != null ? s.iptal : 0) }
        ]);

        var liste = (is.liste || []).map(function (o) {
            return '<li class="fp-is-satir">' +
                '<div class="fp-is-satir__sol">' +
                '<strong>' + esc(o.baslik) + '</strong>' +
                '<span class="fp-is-satir__musteri">' + esc(o.musteri) + '</span>' +
                '</div>' +
                '<div class="fp-is-satir__sag">' +
                fpDurumBadge(o.durum) +
                '<span class="fp-is-satir__termin">Termin: ' + esc(o.termin) + '</span>' +
                '<span class="fp-is-satir__tutar">' + esc(o.tutar) + '</span>' +
                '</div></li>';
        }).join('');

        return kpi + fpBolumHtml('İş listesi',
            '<ul class="fp-is-list">' + (liste || '<li class="fp-bos-metin">İş bulunamadı.</li>') + '</ul>');
    }

    function renderTeklifler(demo) {
        var teklifler = demo.teklifler || [];
        if (!teklifler.length) {
            return '<p class="fp-bos-metin">Henüz teklif yok.</p>';
        }
        return teklifler.map(function (t) {
            return '<article class="fp-teklif-kart" data-teklif-id="' + esc(t.id || '') + '">' +
                '<div class="fp-teklif-kart__ust">' +
                '<h4 class="fp-teklif-kart__baslik">' + esc(t.isAdi) + '</h4>' +
                fpDurumBadge(t.durum) +
                '</div>' +
                '<dl class="fp-teklif-kart__meta">' +
                '<div><dt>Müşteri / Firma</dt><dd>' + esc(t.musteri) + '</dd></div>' +
                '<div><dt>Teklif tutarı</dt><dd>' + esc(t.tutar) + '</dd></div>' +
                '<div><dt>Teslim süresi</dt><dd>' + esc(t.termin) + '</dd></div>' +
                '</dl>' +
                '<div class="fp-teklif-kart__aksiyon">' +
                '<button type="button" class="btn btn--ghost btn--sm" data-teklif-demo="detay">Detay</button>' +
                '<button type="button" class="btn btn--ghost btn--sm" data-teklif-demo="mesaj">Mesaj</button>' +
                '<button type="button" class="btn btn--gold btn--sm" data-teklif-demo="kabul">Kabul Et</button>' +
                '</div></article>';
        }).join('');
    }

    function renderProfil(demo, user) {
        var p = demo.profil || {};
        var oran = p.tamamlamaOrani != null ? p.tamamlamaOrani : 0;

        return '<div class="fp-profil-grid">' +
            '<article class="fp-profil-kart fp-profil-kart--ana">' +
            '<div class="fp-profil-kart__ust">' +
            '<h3 class="fp-profil-kart__firma">' + esc(p.firmaAd) + '</h3>' +
            fpDurumBadge(p.durum) +
            '</div>' +
            '<dl class="fp-profil-dl">' +
            '<div><dt>Branş</dt><dd>' + esc(p.kategori) + '</dd></div>' +
            '<div><dt>Şehir</dt><dd>' + esc(p.sehir) + '</dd></div>' +
            '<div><dt>WhatsApp</dt><dd>' + esc(p.tel ? '+' + p.tel : '—') + '</dd></div>' +
            '<div><dt>Hizmet alanı</dt><dd>' + esc(p.aciklama) + '</dd></div>' +
            '</dl>' +
            '<div class="fp-profil-tamamlama">' +
            '<div class="fp-profil-tamamlama__ust">' +
            '<span>Profil tamamlama oranı</span>' +
            '<strong>' + esc(String(oran)) + '%</strong>' +
            '</div>' +
            '<div class="fp-profil-tamamlama__bar" role="progressbar" aria-valuenow="' + esc(String(oran)) + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="fp-profil-tamamlama__dolgu" style="width:' + esc(String(oran)) + '%"></div>' +
            '</div></div>' +
            '</article>' +
            '<article class="fp-profil-kart">' +
            '<h4 class="fp-profil-kart__alt-baslik">Hesap</h4>' +
            '<p class="fp-profil-hesap">' + esc(user ? user.email : 'Oturum açılmadı') + '</p>' +
            '<p class="panel-not">Profil düzenleme yakında aktif olacaktır.</p>' +
            '</article></div>';
    }

    function renderPerformans(demo) {
        var p = demo.performans || {};
        var kpi = fpKpiGridHtml([
            { etiket: 'Tamamlanan İş', deger: String(p.tamamlananIs != null ? p.tamamlananIs : 0) },
            { etiket: 'Ortalama Teslim Süresi', deger: p.ortTeslim || '—' },
            { etiket: 'Ortalama Puan', deger: p.ortPuan || '—' },
            { etiket: 'Son 30 Gün Görüntülenme', deger: String(p.goruntulenme30 != null ? p.goruntulenme30 : 0) },
            { etiket: 'Profil Ziyareti', deger: String(p.profilZiyaret != null ? p.profilZiyaret : 0) },
            { etiket: 'Teklif Dönüş Oranı', deger: p.teklifDonus || '—' },
            { etiket: 'Teslim Oranı', deger: p.teslimOrani || '—' },
            { etiket: 'Müşteri Memnuniyeti', deger: p.musteriMemnuniyeti || '—' }
        ]);

        var grafik = p.grafik || [];
        var maxVal = 1;
        grafik.forEach(function (g) {
            if (g.tutar > maxVal) maxVal = g.tutar;
        });
        var bars = grafik.map(function (g) {
            var yuzde = Math.round((g.tutar / maxVal) * 100);
            return '<div class="fp-chart__hucre">' +
                '<div class="fp-chart__deger">' + esc('₺' + Math.round(g.tutar / 1000) + 'K') + '</div>' +
                '<div class="fp-chart__bar-wrap" style="--bar-h:' + esc(String(yuzde)) + '%">' +
                '<div class="fp-chart__bar"></div></div>' +
                '<span class="fp-chart__etiket">' + esc(g.ay) + '</span></div>';
        }).join('');

        return kpi + fpBolumHtml('Son 6 ay kazanç',
            '<div class="fp-chart" role="img" aria-label="Son 6 ay kazanç grafiği">' + bars + '</div>');
    }

    function renderAyarlar(demo) {
        var a = demo.ayarlar || {};
        var satirlar = [
            { key: 'firmaBildirim', label: 'Firma bildirimleri', aciklama: 'Yeni iş ve teklif bildirimleri', varsayilan: a.firmaBildirim },
            { key: 'whatsappBildirim', label: 'WhatsApp bildirimleri', aciklama: 'Kritik iş güncellemeleri', varsayilan: a.whatsappBildirim },
            { key: 'odemeBildirim', label: 'Ödeme bildirimi', aciklama: 'Hakediş ve ödeme durumu', varsayilan: a.odemeBildirim },
            { key: 'profilGorunurluk', label: 'Profil görünürlüğü', aciklama: 'Firma profiliniz arama sonuçlarında', varsayilan: a.profilGorunurluk }
        ];

        var html = satirlar.map(function (s) {
            var checked = s.varsayilan ? ' checked' : '';
            return '<label class="fp-toggle">' +
                '<span class="fp-toggle__metin">' +
                '<strong class="fp-toggle__label">' + esc(s.label) + '</strong>' +
                '<span class="fp-toggle__aciklama">' + esc(s.aciklama) + '</span>' +
                '</span>' +
                '<input type="checkbox" class="fp-toggle__input" data-demo-ayar="' + esc(s.key) + '"' + checked + '>' +
                '<span class="fp-toggle__track" aria-hidden="true"></span>' +
                '</label>';
        }).join('');

        return '<div class="fp-ayarlar">' + html + '</div>';
    }

    function bindPanelDemoActions() {
        if (panelDemoBound) return;
        panelDemoBound = true;

        var icerik = $('panelIcerik');
        if (icerik) {
            icerik.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-teklif-demo]');
                if (!btn) return;
                var aksiyon = btn.getAttribute('data-teklif-demo');
                var kart = btn.closest('[data-teklif-id]');
                var id = kart ? kart.getAttribute('data-teklif-id') : '';
                var mesajlar = {
                    detay: 'Teklif detayları açılıyor (#' + id + ').',
                    mesaj: 'Mesajlaşma modülü yakında aktif olacak (#' + id + ').',
                    kabul: 'Teklif kabul edildi — iş süreci başlatılıyor (#' + id + ').'
                };
                demoToast(mesajlar[aksiyon] || 'İşlem kaydedildi.');
            });

            icerik.addEventListener('change', function (e) {
                var input = e.target.closest('[data-demo-ayar]');
                if (!input) return;
                var key = input.getAttribute('data-demo-ayar');
                var durum = input.checked ? 'açık' : 'kapalı';
                demoToast('Bildirim tercihi güncellendi: ' + key + ' ' + durum + '.');
            });
        }
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

        var greeting = $('panelUserGreeting');
        if (greeting) {
            greeting.textContent = user
                ? 'Merhaba, ' + user.displayName
                : 'Hoş geldiniz';
        }

        var dashEl = $('panelSekmeDashboard');
        if (dashEl) dashEl.innerHTML = renderDashboard(demo);

        var islerEl = $('panelSekmeIsler');
        if (islerEl) islerEl.innerHTML = renderIsler(demo);

        var gelirEl = $('panelSekmeGelirler');
        if (gelirEl) gelirEl.innerHTML = renderGelirler(demo);

        var teklifEl = $('panelSekmeTeklifler');
        if (teklifEl) teklifEl.innerHTML = renderTeklifler(demo);

        var profilEl = $('panelSekmeProfil');
        if (profilEl) profilEl.innerHTML = renderProfil(demo, user);

        var perfEl = $('panelSekmePerformans');
        if (perfEl) perfEl.innerHTML = renderPerformans(demo);

        var ayarEl = $('panelSekmeAyarlar');
        if (ayarEl) ayarEl.innerHTML = renderAyarlar(demo);

        bindPanelDemoActions();
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
                '</div><p class="panel-not">Metrikler platform verilerinden hesaplanır.</p>';
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
                if (global.Aurix && Aurix.toast) Aurix.toast('Oturum kapatıldı.', 'info');
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

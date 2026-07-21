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
        sistem: null
    };

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
    function yukleGenel() {
        var s = svc();
        if (!s) {
            $('apIcerik').innerHTML = hataDurum('Admin servisi yüklenemedi.');
            return;
        }
        setBolumLoading('genel', true);
        Promise.all([s.ozet(), s.sonKayitlar()]).then(function (arr) {
            setBolumLoading('genel', false);
            if (aktifBolum !== 'genel') return;
            var ozet = arr[0];
            var son = arr[1];
            if (!ozet.ok) {
                $('apIcerik').innerHTML = hataDurum(ozet.error);
                return;
            }
            cache.ozet = ozet.data || {};
            cache.son = (son.ok && son.data) ? son.data : {};
            renderGenel();
        });
    }

    function renderGenel() {
        var o = cache.ozet || {};
        var son = cache.son || {};
        var kartlar = [
            ['Toplam kullanıcı', o.toplam_kullanici],
            ['Toplam firma', o.toplam_firma],
            ['Onay bekleyen firma', o.bekleyen_firma],
            ['Onaylanan firma', o.onayli_firma],
            ['Açık iş talebi', o.acik_is],
            ['Toplam teklif', o.toplam_teklif],
            ['Son 7 günde kullanıcı', o.kullanici_7g],
            ['Son 7 günde iş', o.is_7g]
        ];

        var kpi = kartlar.map(function (k) {
            return '<div class="ap-kpi">' +
                '<span class="ap-kpi__etiket">' + esc(k[0]) + '</span>' +
                '<span class="ap-kpi__deger">' + esc(String(k[1] != null ? k[1] : '—')) + '</span>' +
                '</div>';
        }).join('');

        var kullanicilar = (son.kullanicilar || []).map(function (u) {
            return '<tr>' +
                '<td>' + esc(u.ad_soyad || '—') + '</td>' +
                '<td>' + esc(u.email || '—') + '</td>' +
                '<td>' + esc(u.hesap_tipi || 'normal') + '</td>' +
                '<td>' + esc(tarihKisa(u.created_at)) + '</td></tr>';
        }).join('');

        var bekleyen = (son.bekleyen_firmalar || []).map(function (f) {
            return '<tr>' +
                '<td>' + esc(f.firma_adi || '—') + '</td>' +
                '<td>' + esc(f.yetkili_ad || '—') + '</td>' +
                '<td>' + esc(f.sehir || '—') + '</td>' +
                '<td>' + esc(f.kategori || '—') + '</td>' +
                '<td>' + esc(tarihKisa(f.created_at)) + '</td>' +
                '<td><button type="button" class="btn btn--ghost btn--xs" data-ap-goto-onay="' +
                esc(f.id) + '">İncele</button></td></tr>';
        }).join('');

        var isler = (son.isler || []).map(function (i) {
            return '<tr>' +
                '<td>' + esc(i.baslik || '—') + '</td>' +
                '<td>' + esc(i.kategori || '—') + '</td>' +
                '<td>' + esc(i.olusturan_ad || '—') + '</td>' +
                '<td>' + esc(tarihKisa(i.created_at)) + '</td>' +
                '<td>' + durumRozet(i.durum) + '</td></tr>';
        }).join('');

        $('apIcerik').innerHTML =
            '<div class="ap-kpi-grid">' + kpi + '</div>' +
            '<div class="ap-paneller">' +
            '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Son kayıt olan kullanıcılar</h3>' +
            (kullanicilar
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Ad soyad</th><th>E-posta</th><th>Hesap tipi</th><th>Kayıt</th></tr></thead>' +
                '<tbody>' + kullanicilar + '</tbody></table></div>'
                : bosDurum('Henüz kullanıcı kaydı yok.')) +
            '</section>' +
            '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Onay bekleyen firmalar</h3>' +
            (bekleyen
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Firma</th><th>Yetkili</th><th>Şehir</th><th>Hizmet</th><th>Başvuru</th><th></th></tr></thead>' +
                '<tbody>' + bekleyen + '</tbody></table></div>'
                : bosDurum('Onay bekleyen firma yok.')) +
            '</section>' +
            '<section class="ap-panel">' +
            '<h3 class="ap-panel__baslik">Son açılan işler</h3>' +
            (isler
                ? '<div class="ap-tablo-wrap"><table class="ap-tablo"><thead><tr>' +
                '<th>Başlık</th><th>Kategori</th><th>Oluşturan</th><th>Tarih</th><th>Durum</th></tr></thead>' +
                '<tbody>' + isler + '</tbody></table></div>'
                : bosDurum('Henüz iş talebi yok.')) +
            '</section></div>';
    }

    /* ---------- Firma onayları ---------- */
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

        var liste = cache.firmalar || [];
        var kartlar = liste.length ? liste.map(firmaKartHtml).join('') : bosDurum('Bu sekmede kayıt yok.');

        $('apIcerik').innerHTML =
            '<div class="ap-sekmeler" role="tablist">' + tabHtml + '</div>' +
            '<div class="ap-kart-liste">' + kartlar + '</div>';
    }

    function profilTamamlanma(f) {
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
        var sehir = (($('apFirmaSehir') && $('apFirmaSehir').value) || '').toLowerCase().trim();
        var kat = (($('apFirmaKat') && $('apFirmaKat').value) || '').toLowerCase().trim();
        var durum = (($('apFirmaDurum') && $('apFirmaDurum').value) || '').toLowerCase().trim();

        var liste = (cache.firmalar || []).filter(function (f) {
            if (q && String(f.firma_adi || '').toLowerCase().indexOf(q) === -1) return false;
            if (sehir && String(f.sehir || '').toLowerCase().indexOf(sehir) === -1) return false;
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
            '<input type="text" class="form-input" id="apFirmaSehir" placeholder="Şehir" value="' + esc(sehir) + '">' +
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
        var liste = (cache.kullanicilar || []).filter(function (u) {
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
            '</select></div>' +
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
        var liste = (cache.isler || []).filter(function (i) {
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
            '</select></div>' +
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

            if (e.target.closest('[data-ap-goto-onay]')) {
                firmaOnaySekme = 'beklemede';
                bolumGoster('onaylar');
                return;
            }

            var onayId = e.target.closest('[data-ap-firma-onay]');
            if (onayId) {
                var fid = onayId.getAttribute('data-ap-firma-onay');
                onayPenceresi('Bu firma AURIX içerisinde görünür olacak ve işlere teklif verebilecek. Onaylıyor musunuz?')
                    .then(function (ok) {
                        if (!ok || !svc()) return;
                        return svc().firmaOnayla(fid).then(function (res) {
                            if (!res.ok) return toast(res.error, 'error');
                            toast('Firma onaylandı.', 'success');
                            if (aktifBolum === 'onaylar') yukleOnaylar();
                            else if (aktifBolum === 'firmalar') yukleFirmalar();
                            else if (aktifBolum === 'genel') yukleGenel();
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
                        if (!res.ok) return toast(res.error, 'error');
                        toast('Firma reddedildi.', 'success');
                        if (aktifBolum === 'onaylar') yukleOnaylar();
                        else yukleFirmalar();
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
                        if (!res.ok) return toast(res.error, 'error');
                        toast('Firma askıya alındı.', 'success');
                        if (aktifBolum === 'onaylar') yukleOnaylar();
                        else yukleFirmalar();
                    });
                });
                return;
            }

            var askiKaldir = e.target.closest('[data-ap-firma-aski-kaldir]');
            if (askiKaldir) {
                var kid = askiKaldir.getAttribute('data-ap-firma-aski-kaldir');
                if (!svc()) return;
                svc().firmaAskiKaldir(kid).then(function (res) {
                    if (!res.ok) return toast(res.error, 'error');
                    toast('Askı kaldırıldı.', 'success');
                    if (aktifBolum === 'onaylar') yukleOnaylar();
                    else yukleFirmalar();
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
            if (e.target.id === 'apKulFiltre') renderKullanicilar();
            if (e.target.id === 'apIsFiltre') renderIsler();
            if (e.target.id === 'apIslemFiltre') yukleIslemler();
            if (e.target.id === 'apFirmaDurum') renderFirmalarTablo();
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

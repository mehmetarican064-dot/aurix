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
    var lastFirma = null;
    var lastFirmaError = null;

    function firmaKartMeta(firma) {
        var FP = global.AurixFirmaProfil || {};
        if (typeof FP.firmaHesapKartMeta === 'function') {
            return FP.firmaHesapKartMeta(firma);
        }
        if (firma && firma.id) {
            return {
                baslik: 'Firma Profilini Düzenle',
                metin: 'Firma profilinizi yönetin.',
                mode: 'duzenle'
            };
        }
        return {
            baslik: 'Firma Hesabı Oluştur',
            metin: 'İş almak istiyorsanız firma hesabınızı oluşturun.',
            mode: 'olustur'
        };
    }

    function normalTabs() {
        var meta = firmaKartMeta(lastFirma);
        return [
            { id: 'dashboard', label: 'Ana Sayfa' },
            { id: 'islerim', label: 'İş Taleplerim' },
            { id: 'mesajlar', label: 'Mesajlar' },
            { id: 'firma-olustur', label: meta.baslik, action: true }
        ];
    }

    function firmaTabs() {
        var meta = firmaKartMeta(lastFirma);
        return [
            { id: 'dashboard', label: 'Ana Sayfa' },
            { id: 'islerim', label: 'İş Taleplerim' },
            { id: 'gelen', label: 'Gelen İşler' },
            { id: 'teklifler', label: 'Verdiğim Teklifler' },
            { id: 'profil', label: meta.baslik || 'Firma Profilim' },
            { id: 'dogrulama', label: 'Firma Doğrulama' },
            { id: 'mesajlar', label: 'Mesajlar' },
            { id: 'ayarlar', label: 'Firma Ayarları' }
        ];
    }

    function mevcutFirmaProfilineGit() {
        panelTabSec('profil');
    }

    function panelTabSec(tab) {
        if (!tab) return;
        if (tab === 'firma-olustur') {
            panelAksiyon('firma-hesabi');
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
        var tabs = hasFirma ? firmaTabs() : normalTabs();
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

    function renderFirmaYuklemeHatasi(mesaj) {
        return '<div class="fp-bos-kutu" role="alert">' +
            '<p class="fp-bos-metin"><strong>Firma kaydı yüklenemedi.</strong></p>' +
            '<p class="fp-bos-metin">' + esc(mesaj || 'Lütfen sayfayı yenileyip tekrar deneyin.') + '</p>' +
            '<button type="button" class="btn btn--primary btn--sm" data-panel-aksiyon="firma-yenile">Tekrar Dene</button>' +
            '</div>';
    }

    /** Normal kullanıcı — demo KPI yok; sade karşılama */
    function renderKarsilama(veri) {
        var meta = firmaKartMeta(veri && veri.firma ? veri.firma : null);
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
            '<span class="fp-karsilama-kart__baslik">' + esc(meta.baslik) + '</span>' +
            '<span class="fp-karsilama-kart__metin">' + esc(meta.metin) + '</span>' +
            '</button>' +
            '</div></div>';
    }

    /** Firma sahibi — özet (demo kazanç yok) */
    function renderFirmaDashboard(veri) {
        var f = (veri && veri.firma) || null;
        var teklifler = (veri && veri.teklifler) || [];
        var durum = f ? (f.durum || (f.dogrulanmis ? 'onaylandi' : 'beklemede')) : 'beklemede';
        var aski = !!(f && f.askiya_alindi);
        var incelemede = !aski && (!f || durum === 'beklemede' ||
            (f && !f.dogrulanmis && durum !== 'onaylandi' && durum !== 'reddedildi'));
        var onayli = !aski && !!(f && (durum === 'onaylandi' || f.dogrulanmis === true));

        var durumKutu = '';
        if (aski) {
            durumKutu = '<div class="fp-basvuru-durum fp-basvuru-durum--red" role="status">' +
                '<strong class="fp-basvuru-durum__baslik">Firma hesabınız geçici olarak askıya alındı.</strong>' +
                '<p class="fp-basvuru-durum__metin">' +
                esc(f.askiya_alma_nedeni || 'Detay için destek ile iletişime geçin.') +
                '</p></div>';
        } else if (incelemede) {
            durumKutu = '<div class="fp-basvuru-durum fp-basvuru-durum--beklemede" role="status">' +
                '<strong class="fp-basvuru-durum__baslik">Firma hesabınız inceleniyor.</strong>' +
                '<p class="fp-basvuru-durum__metin">Onaylandığında işlere teklif verebilir ve firma listenizde görünür olabilirsiniz.' +
                (f && f.firma_adi ? ' (' + esc(f.firma_adi) + ')' : '') +
                '</p></div>';
        } else if (durum === 'reddedildi') {
            durumKutu = '<div class="fp-basvuru-durum fp-basvuru-durum--red" role="status">' +
                '<strong class="fp-basvuru-durum__baslik">Firma başvurunuz onaylanmadı.</strong>' +
                '<p class="fp-basvuru-durum__metin">' +
                esc(f.red_nedeni || 'Başvurunuz mevcut kriterlere uygun bulunmadı.') +
                '</p>' +
                '<p class="fp-aksiyon-satir" style="margin-top:10px">' +
                '<button type="button" class="btn btn--gold btn--sm" data-panel-aksiyon="firma-yeniden">Bilgileri Düzenle ve Yeniden Gönder</button>' +
                '</p></div>';
        } else if (onayli) {
            durumKutu = '<div class="fp-basvuru-durum fp-basvuru-durum--onay" role="status">' +
                '<strong class="fp-basvuru-durum__baslik">Firma hesabınız onaylandı.</strong>' +
                '<p class="fp-basvuru-durum__metin">' +
                esc(f && f.firma_adi ? f.firma_adi : 'Firmanız') +
                ' doğrulanmış firma olarak listede görünür.</p></div>';
        }

        return '<div class="fp-karsilama fp-karsilama--firma">' +
            '<h2 class="fp-karsilama__baslik">Firma Paneli</h2>' +
            durumKutu +
            '<div class="fp-karsilama__kartlar fp-karsilama__kartlar--3">' +
            '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="gelen">' +
            '<span class="fp-karsilama-kart__baslik">Gelen İşler</span>' +
            '<span class="fp-karsilama-kart__metin">Açık iş taleplerini inceleyin.</span>' +
            '</button>' +
            '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="teklifler">' +
            '<span class="fp-karsilama-kart__baslik">Verdiğim Teklifler</span>' +
            '<span class="fp-karsilama-kart__metin">' + esc(String(teklifler.length)) + ' teklif kaydı</span>' +
            '</button>' +
            (function () {
                var meta = firmaKartMeta(f);
                return '<button type="button" class="fp-karsilama-kart" data-panel-aksiyon="profil">' +
                    '<span class="fp-karsilama-kart__baslik">' + esc(meta.baslik) + '</span>' +
                    '<span class="fp-karsilama-kart__metin">' + esc(meta.metin) + '</span>' +
                    '</button>';
            })() +
            '</div></div>';
    }

    function renderDashboard(veri) {
        if (veri && veri.firmaError) {
            return renderFirmaYuklemeHatasi(veri.firmaError);
        }
        if (veri && veri.hasFirma) return renderFirmaDashboard(veri);
        return renderKarsilama(veri);
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
        if (veri && veri.firmaError) {
            return renderFirmaYuklemeHatasi(veri.firmaError);
        }
        if (!f) {
            var bosMeta = firmaKartMeta(null);
            return '<div class="fp-bos-kutu">' +
                '<p class="fp-bos-metin">Firma profiliniz henüz oluşturulmadı.</p>' +
                '<button type="button" class="btn btn--gold btn--sm" data-panel-aksiyon="firma-hesabi">' +
                esc(bosMeta.baslik) + '</button>' +
                '</div>';
        }

        var FP = global.AurixFirmaProfil || {};
        var tamamlamaHtml = typeof FP.tamamlamaBarHtml === 'function' ? FP.tamamlamaBarHtml(f) : '';
        var durumEtiket = f.durum || (f.dogrulanmis ? 'onaylandi' : 'beklemede');
        var yayinEtiket = typeof FP.yayinDurumuEtiket === 'function'
            ? FP.yayinDurumuEtiket(f.yayin_durumu)
            : (f.yayin_durumu || '—');
        var durumInsan = {
            beklemede: 'İncelemede',
            onaylandi: 'Onaylandı',
            reddedildi: 'Reddedildi'
        };
        if (f.askiya_alindi) durumInsan[durumEtiket] = 'Askıda';

        var logoHtml = f.logo_url
            ? '<img class="fp-profil-logo" id="firmaProfilLogoOnizleme" src="' + esc(f.logo_url) + '" alt="" width="72" height="72">'
            : '<div class="fp-logo-placeholder" id="firmaProfilLogoOnizleme" aria-hidden="true"><img src="assets/logo-mark.png" alt="" width="36" height="36"></div>';
        var kapakHtml = f.kapak_url
            ? '<div class="fp-profil-kapak"><img id="firmaProfilKapakOnizleme" src="' + esc(f.kapak_url) + '" alt="" loading="lazy"></div>'
            : '<div class="fp-profil-kapak fp-profil-kapak--bos" id="firmaProfilKapakWrap"><div class="fp-logo-placeholder fp-logo-placeholder--kapak" id="firmaProfilKapakOnizleme"><img src="assets/logo-mark.png" alt="" width="48" height="48"></div></div>';

        var hizmetler = typeof FP.hizmetKategorileriDizi === 'function'
            ? FP.hizmetKategorileriDizi(f)
            : (f.kategori ? [f.kategori] : []);
        var katChipHtml = typeof FP.katChipGrupHtml === 'function' ? FP.katChipGrupHtml(hizmetler) : '';
        var galeri = typeof FP.parseGaleri === 'function' ? FP.parseGaleri(f) : [];
        var galeriHtml = typeof FP.galeriOnizlemeHtml === 'function'
            ? FP.galeriOnizlemeHtml(galeri, !f.askiya_alindi)
            : '';

        var incelemeNotu = '';
        if (f.askiya_alindi) {
            incelemeNotu = '<div class="fp-basvuru-durum fp-basvuru-durum--red" style="margin-top:12px" role="status">' +
                '<strong>Firma hesabınız geçici olarak askıya alındı.</strong>' +
                '<p>' + esc(f.askiya_alma_nedeni || '') + '</p></div>';
        } else if (durumEtiket === 'beklemede' || f.yayin_durumu === 'incelemede') {
            incelemeNotu = '<p class="fp-basvuru-durum fp-basvuru-durum--beklemede" style="margin-top:12px">' +
                'Profiliniz inceleniyor. Onaylandığında firma listenizde görünür olacaktır.</p>';
        } else if (durumEtiket === 'reddedildi') {
            incelemeNotu = '<div class="fp-basvuru-durum fp-basvuru-durum--red" style="margin-top:12px" role="status">' +
                '<strong>Firma başvurunuz onaylanmadı.</strong>' +
                '<p>' + esc(f.red_nedeni || '') + '</p>' +
                '<p class="panel-not">Bilgileri güncelleyip yayına gönderince başvuru yeniden incelenir.</p>' +
                '</div>';
        } else if (durumEtiket === 'onaylandi' && f.dogrulanmis) {
            incelemeNotu = '<p class="fp-basvuru-durum fp-basvuru-durum--onay" style="margin-top:12px">' +
                'Firma hesabınız yayında. “AURIX Doğrulanmış Firma” rozeti için Firma Doğrulama sekmesinden belge başvurusu gerekir.</p>';
        }

        var FD = global.AurixFirmaDogrulama || {};
        var dogrulamaKartHtml = typeof FD.dogrulamaDurumKartiHtml === 'function'
            ? FD.dogrulamaDurumKartiHtml(f, null)
            : '';

        var duzenleForm = '';
        if (!f.askiya_alindi) {
            var telGoster = String(f.telefon || '').replace(/^\+90/, '').replace(/\D/g, '');
            if (telGoster.length === 10) {
                telGoster = telGoster.slice(0, 3) + ' ' + telGoster.slice(3, 6) + ' ' +
                    telGoster.slice(6, 8) + ' ' + telGoster.slice(8);
            }
            var firmaTurOpts = (FP.FIRMA_TURLERI || []).map(function (t) {
                var sel = (f.firma_turu === t.id || f.firma_turu === t.ad) ? ' selected' : '';
                return '<option value="' + esc(t.id) + '"' + sel + '>' + esc(t.ad) + '</option>';
            }).join('');
            var yayinBtnMetin = durumEtiket === 'onaylandi'
                ? 'Güncelle'
                : (durumEtiket === 'reddedildi' ? 'Yeniden Gönder' : 'Yayına Gönder');

            duzenleForm =
                '<article class="fp-profil-kart" style="margin-top:16px">' +
                '<h4 class="fp-profil-kart__alt-baslik">Profili Düzenle</h4>' +
                tamamlamaHtml +
                '<form id="firmaProfilDuzenleForm" class="fp-profil-form" novalidate>' +
                '<input type="hidden" id="firmaProfilYeniden" value="' +
                (durumEtiket === 'reddedildi' ? '1' : '0') + '">' +
                '<input type="hidden" id="firmaProfilDurum" value="' + esc(durumEtiket) + '">' +
                '<input type="hidden" id="firmaProfilLogoUrl" value="' + esc(f.logo_url || '') + '">' +
                '<input type="hidden" id="firmaProfilKapakUrl" value="' + esc(f.kapak_url || '') + '">' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilAd">Firma Adı <span class="form-zorunlu">*</span></label>' +
                '<input class="form-input" type="text" id="firmaProfilAd" required maxlength="200" value="' +
                esc(f.firma_adi || '') + '">' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilTuru">Firma Türü <span class="form-zorunlu">*</span></label>' +
                '<select class="form-select" id="firmaProfilTuru" required>' +
                '<option value="">Seçin</option>' + firmaTurOpts + '</select>' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilSehir">Şehir <span class="form-zorunlu">*</span></label>' +
                '<select class="form-select" id="firmaProfilSehir" required></select>' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilIlce">İlçe <span class="form-zorunlu">*</span></label>' +
                '<select class="form-select" id="firmaProfilIlce" required disabled>' +
                '<option value="">Önce şehir seçin</option></select>' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilKatAra">Hizmet Kategorileri <span class="form-zorunlu">*</span></label>' +
                '<input class="form-input fp-kat-ara" type="search" id="firmaProfilKatAra" placeholder="Kategori ara..." autocomplete="off">' +
                '<div class="fp-kat-chips" id="firmaProfilKatChips" role="group" aria-label="Hizmet kategorileri">' +
                katChipHtml + '</div>' +
                '<p class="form-yardim">Birden fazla kategori seçebilirsiniz.</p>' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilAciklama">Firma Açıklaması <span class="form-zorunlu">*</span></label>' +
                '<textarea class="form-textarea" id="firmaProfilAciklama" rows="4" required maxlength="2000">' +
                esc(f.aciklama || '') + '</textarea>' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilYetkili">Yetkili Adı <span class="form-zorunlu">*</span></label>' +
                '<input class="form-input" type="text" id="firmaProfilYetkili" required maxlength="120" value="' +
                esc(f.yetkili_ad || '') + '">' +
                '<p class="form-yardim">Halka açık profilde yalnızca ad gösterilir.</p>' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilKurulus">Kuruluş Yılı <span class="form-zorunlu">*</span></label>' +
                '<input class="form-input" type="number" id="firmaProfilKurulus" required min="1900" max="2099" value="' +
                esc(f.kurulus_yili != null ? String(f.kurulus_yili) : '') + '">' +
                '</div>' +

                '<div class="form-grup fp-medya-grup">' +
                '<label class="form-label">Logo</label>' +
                '<div class="fp-medya-onizleme">' + logoHtml + '</div>' +
                '<input class="form-input" type="file" id="firmaProfilLogo" accept="image/jpeg,image/png,image/webp">' +
                '<p class="form-yardim">JPEG, PNG veya WebP — en fazla 5 MB.</p>' +
                '</div>' +

                '<div class="form-grup fp-medya-grup">' +
                '<label class="form-label">Kapak Görseli</label>' +
                kapakHtml +
                '<input class="form-input" type="file" id="firmaProfilKapak" accept="image/jpeg,image/png,image/webp">' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label">Çalışma Galerisi</label>' +
                galeriHtml +
                '<p class="form-yardim">En fazla 12 görsel. Yayına göndermek için en az 3 önerilir.</p>' +
                '</div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilTel">Telefon <span class="fp-ozel-etiket">(gizli)</span></label>' +
                '<div class="tel-input" role="group">' +
                '<span class="tel-input__kod" aria-hidden="true">+90</span>' +
                '<input class="form-input tel-input__alan" type="tel" id="firmaProfilTel" ' +
                'inputmode="tel" maxlength="13" value="' + esc(telGoster) + '">' +
                '</div><p class="form-yardim">Halka açık profilde gösterilmez.</p></div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilAdres">Adres <span class="fp-ozel-etiket">(gizli)</span></label>' +
                '<textarea class="form-textarea" id="firmaProfilAdres" rows="2" maxlength="500">' +
                esc(f.adres || '') + '</textarea></div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilCalisan">Çalışan Sayısı</label>' +
                '<input class="form-input" type="text" id="firmaProfilCalisan" maxlength="80" value="' +
                esc(f.calisan_sayisi || '') + '"></div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilSaatler">Çalışma Saatleri</label>' +
                '<input class="form-input" type="text" id="firmaProfilSaatler" maxlength="200" placeholder="Pzt–Cum 09:00–18:00" value="' +
                esc(f.calisma_saatleri || '') + '"></div>' +

                '<div class="form-grup">' +
                '<label class="form-label" for="firmaProfilKapasite">Kapasite / Üretim Bilgisi</label>' +
                '<input class="form-input" type="text" id="firmaProfilKapasite" maxlength="200" value="' +
                esc(f.kapasite || '') + '"></div>' +

                '<p class="fp-aksiyon-satir fp-aksiyon-satir--cift">' +
                '<button type="button" class="btn btn--ghost btn--sm" id="firmaProfilTaslakBtn" data-fp-kayit="taslak">Taslak Kaydet</button>' +
                '<button type="button" class="btn btn--gold btn--sm" id="firmaProfilYayinBtn" data-fp-kayit="yayin">' +
                esc(yayinBtnMetin) + '</button></p>' +
                '</form></article>';
        }

        var turAd = typeof FP.firmaTuruAd === 'function' ? FP.firmaTuruAd(f.firma_turu) : (f.firma_turu || '—');
        var hizmetGoster = hizmetler.length
            ? hizmetler.map(function (k) { return esc(typeof FP.kategoriAdBul === 'function' ? FP.kategoriAdBul(k) : k); }).join(', ')
            : esc(f.kategori || '—');

        return '<div class="fp-profil-grid">' +
            '<article class="fp-profil-kart fp-profil-kart--ana">' +
            kapakHtml +
            '<div class="fp-profil-kart__ust">' +
            logoHtml +
            '<div class="fp-profil-kart__kimlik">' +
            '<h3 class="fp-profil-kart__firma">' + esc(f.firma_adi || '—') + '</h3>' +
            '<div class="fp-profil-kart__rozetler">' +
            fpDurumBadge(durumInsan[durumEtiket] || durumEtiket) +
            '<span class="fp-durum-badge fp-durum-badge--yayin">' + esc(yayinEtiket) + '</span>' +
            '</div></div></div>' +
            '<dl class="fp-profil-dl">' +
            '<div><dt>Firma türü</dt><dd>' + esc(turAd) + '</dd></div>' +
            '<div><dt>Hizmet kategorileri</dt><dd>' + hizmetGoster + '</dd></div>' +
            '<div><dt>Konum</dt><dd>' + esc([f.ilce, f.sehir].filter(Boolean).join(', ') || f.sehir || '—') + '</dd></div>' +
            '<div><dt>Açıklama</dt><dd>' + esc(f.aciklama || '—') + '</dd></div>' +
            '</dl>' +
            incelemeNotu +
            dogrulamaKartHtml +
            duzenleForm +
            '</article>' +
            '<article class="fp-profil-kart">' +
            '<h4 class="fp-profil-kart__alt-baslik">Hesap</h4>' +
            '<p class="fp-profil-hesap">' + esc(user ? user.email : 'Oturum açılmadı') + '</p>' +
            '<p class="panel-not">Çıkış yapıp tekrar giriş yapsanız da firma bilgileriniz korunur.</p>' +
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
        if (aksiyon === 'firma-yenile') {
            renderUserPanel();
            return;
        }
        if (aksiyon === 'firma-hesabi') {
            /* Mevcut kayıt varsa oluşturma değil profil; yoksa başvuru formu */
            if (lastFirma && lastFirma.id) {
                mevcutFirmaProfilineGit();
                return;
            }
            if (lastFirmaError) {
                if (global.Aurix && Aurix.toast) {
                    Aurix.toast(lastFirmaError, 'error');
                }
                return;
            }
            if (global.Aurix && typeof Aurix.firmaBasvuruModalAc === 'function') {
                Aurix.firmaBasvuruModalAc();
            }
            return;
        }
        if (aksiyon === 'firma-yeniden') {
            if (!global.AurixAdminService || typeof AurixAdminService.firmaYenidenBasvur !== 'function') {
                toastInfo('Yeniden başvuru servisi hazır değil.');
                return;
            }
            AurixAdminService.firmaYenidenBasvur().then(function (res) {
                if (!res.ok) {
                    if (global.Aurix && Aurix.toast) Aurix.toast(res.error || 'İşlem başarısız.', 'error');
                    return;
                }
                if (global.Aurix && Aurix.toast) {
                    Aurix.toast('Başvurunuz yeniden incelemeye alındı.', 'success');
                }
                renderUserPanel();
            });
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
        if (aksiyon === 'gelen' || aksiyon === 'teklifler' || aksiyon === 'profil' || aksiyon === 'dogrulama') {
            panelTabSec(aksiyon);
        }
    }

    function renderDogrulamaPlaceholder() {
        return '<div class="fp-bos-kutu"><p class="fp-bos-metin">Doğrulama bilgileri yükleniyor…</p></div>';
    }

    function yukleDogrulamaSekmesi() {
        var el = $('panelSekmeDogrulama');
        if (!el) return;
        if (!global.AurixSupabase || typeof AurixSupabase.firmaDogrulamaOzet !== 'function') {
            el.innerHTML = '<div class="fp-bos-kutu"><p class="fp-bos-metin">Doğrulama servisi hazır değil. Migration 025 gerekir.</p></div>';
            return;
        }
        el.innerHTML = renderDogrulamaPlaceholder();
        AurixSupabase.firmaDogrulamaOzet().then(function (res) {
            if (!el) return;
            if (!res || !res.ok) {
                el.innerHTML = '<div class="fp-bos-kutu" role="alert">' +
                    '<p class="fp-bos-metin">' + esc((res && res.error) || 'Doğrulama yüklenemedi.') + '</p>' +
                    (res && res.teknik ? '<p class="panel-not">' + esc(res.teknik) + '</p>' : '') +
                    '</div>';
                return;
            }
            el.innerHTML = renderDogrulamaHtml(res);
            bindDogrulamaForm(el, res);
        });
    }

    function renderDogrulamaHtml(res) {
        var FD = global.AurixFirmaDogrulama || {};
        var f = res.firma;
        if (!f) {
            return '<div class="fp-bos-kutu"><p class="fp-bos-metin">Önce firma hesabı oluşturun.</p>' +
                '<button type="button" class="btn btn--gold btn--sm" data-panel-aksiyon="firma-hesabi">Firma Hesabı</button></div>';
        }
        var b = res.basvuru;
        var belgeler = res.belgeler || [];
        var icerik = res.icerik || {};
        var kvkk = icerik.kvkk_aydinlatma_dogrulama || {};
        var riza = icerik.acik_riza_dogrulama || {};
        var saklama = icerik.belge_saklama_politikasi || {};
        var durum = (b && b.durum) || f.guven_dogrulama_durumu || 'yok';
        var durumAd = typeof FD.durumEtiket === 'function' ? FD.durumEtiket(durum) : durum;
        var liste = typeof FD.belgeListesiForFirma === 'function' ? FD.belgeListesiForFirma(f) : [];
        var emailOk = !!res.email_dogrulandi;
        var telDurum = res.telefon_dogrulama_durumu || 'bekliyor';
        var profilOk = typeof FD.profilTamamMi === 'function' ? FD.profilTamamMi(f) : true;
        var duzenlenebilir = !b || ['taslak', 'ek_belge_gerekli', 'yenileme_gerekli'].indexOf(b.durum) !== -1;

        var belgeSatir = belgeler.map(function (d) {
            return '<li class="fp-belge-satir">' +
                '<strong>' + esc(d.belge_turu) + '</strong> · ' + esc(d.admin_durum || 'beklemede') +
                (d.belge_no ? ' · No: ' + esc(d.belge_no) : '') +
                ' <button type="button" class="btn btn--ghost btn--xs" data-fd-belge-gor="' + esc(d.id) + '">Görüntüle</button></li>';
        }).join('') || '<li class="fp-bos-metin">Henüz belge yok.</li>';

        var turOpts = liste.map(function (t) {
            return '<option value="' + esc(t.id) + '">' + esc(t.ad) + (t.zorunlu ? ' *' : '') + '</option>';
        }).join('');

        var isletmeOpts = (FD.ISLETME_TURLERI || []).map(function (t) {
            var sel = (b && b.isletme_turu) === t.id || f.isletme_turu === t.id ? ' selected' : '';
            return '<option value="' + esc(t.id) + '"' + sel + '>' + esc(t.ad) + '</option>';
        }).join('');
        var sifatOpts = (FD.BASVURAN_SIFATLARI || []).map(function (t) {
            var sel = (b && b.basvuran_sifati) === t.id || f.basvuran_sifati === t.id ? ' selected' : '';
            return '<option value="' + esc(t.id) + '"' + sel + '>' + esc(t.ad) + '</option>';
        }).join('');
        var vergiDurum = f.vergi_kimlik_durumu || (b && b.vergi_format_durumu) || 'girilmedi';
        var vergiEtiket = typeof FD.vergiDurumEtiket === 'function'
            ? FD.vergiDurumEtiket(vergiDurum)
            : vergiDurum;
        var hukuki = (b && b.hukuki_unvan) || f.hukuki_unvan || f.firma_adi || '';
        var vergiNo = (b && b.vergi_no) || f.vergi_no || '';
        var vergiDairesi = (b && b.vergi_dairesi) || f.vergi_dairesi || '';
        var mersis = (b && b.mersis_no) || f.mersis_no || '';
        var sicil = (b && b.sicil_no) || f.sicil_no || '';
        var islemKod = (b && b.vergi_levha_islem_kodu) || f.vergi_levha_islem_kodu || '';
        var riskHtml = (res.riskler || []).map(function (r) {
            return '<li class="fp-risk fp-risk--' + esc(r.seviye || 'orta') + '">' + esc(r.mesaj || r.risk_kod) + '</li>';
        }).join('');

        return '<div class="fp-dogrulama" data-fd-basvuru="' + esc(b && b.id ? b.id : '') + '" data-fd-firma="' + esc(String(f.id)) + '">' +
            '<h3 class="fp-bolum__baslik">Firma Doğrulama</h3>' +
            '<p class="panel-not">Yayında olmak ile “AURIX Doğrulanmış Firma” rozeti aynı şey değildir. ' +
            'Vergi numarası format kontrolü resmî doğrulama sayılmaz.</p>' +
            '<div class="fp-basvuru-durum" role="status">' +
            '<strong>Başvuru: ' + esc(durumAd) + '</strong>' +
            '<p>Vergi kimlik: ' + esc(vergiEtiket) + '</p>' +
            (b && b.admin_aciklama ? '<p>' + esc(b.admin_aciklama) + '</p>' : '') +
            (f.guven_kullanici_aciklama ? '<p>' + esc(f.guven_kullanici_aciklama) + '</p>' : '') +
            (f.guven_dogrulama_tarihi ? '<p class="panel-not">Son doğrulama: ' + esc(String(f.guven_dogrulama_tarihi).slice(0, 10)) + '</p>' : '') +
            '</div>' +
            '<ul class="fp-onkosul">' +
            '<li>E-posta: ' + (emailOk ? '✓ Doğrulandı' : '✗ Doğrulanmadı') + '</li>' +
            '<li>Telefon: ' + esc(telDurum) +
            (res.telefon_admin_teyit ? ' (admin teyitli)' : ' — altyapı yoksa admin teyidi gerekir') + '</li>' +
            '<li>Kimlik alanları: ' + (profilOk ? '✓ Tamam' : '✗ Eksik — aşağıdaki formu doldurun') + '</li>' +
            '</ul>' +
            (riskHtml ? '<ul class="fp-risk-list" role="alert">' + riskHtml + '</ul>' : '') +
            '<div class="fp-icerik-kutu"><h4>' + esc(kvkk.baslik || 'KVKK Aydınlatma') + '</h4>' +
            '<p class="panel-not">' + esc(kvkk.govde || '') + '</p></div>' +
            '<div class="fp-icerik-kutu"><h4>' + esc(riza.baslik || 'Açık Rıza') + '</h4>' +
            '<p class="panel-not">' + esc(riza.govde || '') + '</p></div>' +
            '<div class="fp-icerik-kutu"><h4>' + esc(saklama.baslik || 'Saklama') + '</h4>' +
            '<p class="panel-not">' + esc(saklama.govde || '') + '</p></div>' +
            (duzenlenebilir
                ? ('<div class="fp-profil-kart" style="margin-top:12px">' +
                    '<h4 class="fp-profil-kart__alt-baslik">Vergi ve resmî kimlik</h4>' +
                    '<div class="form-grup"><label class="form-label" for="fdHukukiUnvan">Firma hukuki unvanı *</label>' +
                    '<input class="form-input" type="text" id="fdHukukiUnvan" maxlength="200" value="' + esc(hukuki) + '"></div>' +
                    '<div class="form-grup"><label class="form-label" for="fdIsletmeTuru">İşletme türü *</label>' +
                    '<select class="form-select" id="fdIsletmeTuru"><option value="">Seçin</option>' + isletmeOpts + '</select></div>' +
                    '<div class="form-grup"><label class="form-label" for="fdVergiNo">Vergi kimlik no (VKN/TCKN) *</label>' +
                    '<input class="form-input" type="text" id="fdVergiNo" inputmode="numeric" maxlength="11" value="' + esc(vergiNo) + '">' +
                    '<p class="form-yardim" id="fdVergiYardim">VKN 10, şahıs TCKN 11 hane. Geçerli format = doğrulanmış rozet değildir.</p></div>' +
                    '<div class="form-grup"><label class="form-label" for="fdVergiDairesi">Vergi dairesi *</label>' +
                    '<input class="form-input" type="text" id="fdVergiDairesi" maxlength="120" value="' + esc(vergiDairesi) + '"></div>' +
                    '<div class="form-grup"><label class="form-label" for="fdMersis">MERSİS numarası (uygulanıyorsa)</label>' +
                    '<input class="form-input" type="text" id="fdMersis" maxlength="40" value="' + esc(mersis) + '"></div>' +
                    '<div class="form-grup"><label class="form-label" for="fdSicil">Ticaret / esnaf sicil numarası</label>' +
                    '<input class="form-input" type="text" id="fdSicil" maxlength="80" value="' + esc(sicil) + '"></div>' +
                    '<div class="form-grup"><label class="form-label" for="fdBasvuranSifat">Başvuran kişinin firma sıfatı *</label>' +
                    '<select class="form-select" id="fdBasvuranSifat"><option value="">Seçin</option>' + sifatOpts + '</select></div>' +
                    '<div class="form-grup"><label class="form-label" for="fdIslemKod">e-Vergi levhası işlem/doğrulama kodu (varsa)</label>' +
                    '<input class="form-input" type="text" id="fdIslemKod" maxlength="80" value="' + esc(islemKod) + '"></div>' +
                    '<button type="button" class="btn btn--ghost btn--sm" id="fdKimlikKaydetBtn">Kimlik Bilgilerini Kaydet</button></div>')
                : '') +
            '<h4 class="fp-profil-kart__alt-baslik">Yüklenen belgeler</h4><ul class="fp-belge-list">' + belgeSatir + '</ul>' +
            (duzenlenebilir
                ? ('<div class="fp-profil-kart" style="margin-top:12px">' +
                    '<h4 class="fp-profil-kart__alt-baslik">Belge yükle</h4>' +
                    '<div class="form-grup"><label class="form-label">Belge türü</label>' +
                    '<select class="form-select" id="fdBelgeTur">' + turOpts + '</select></div>' +
                    '<div class="form-grup"><label class="form-label">Belge no</label>' +
                    '<input class="form-input" type="text" id="fdBelgeNo" maxlength="80"></div>' +
                    '<div class="form-grup"><label class="form-label">Düzenlenme tarihi</label>' +
                    '<input class="form-input" type="date" id="fdBelgeDuzen"></div>' +
                    '<div class="form-grup"><label class="form-label">Son geçerlilik (varsa)</label>' +
                    '<input class="form-input" type="date" id="fdBelgeGecer"></div>' +
                    '<div class="form-grup"><label class="form-label">Dosya (PDF/JPG/PNG/WEBP, max 10MB)</label>' +
                    '<input class="form-input" type="file" id="fdBelgeDosya" accept=".pdf,image/jpeg,image/png,image/webp"></div>' +
                    '<button type="button" class="btn btn--ghost btn--sm" id="fdBelgeYukleBtn">Belgeyi Yükle</button></div>' +
                    '<label class="fp-check"><input type="checkbox" id="fdSahipBeyan"> Firma sahibi/yetkilisi olduğumu beyan ederim.</label>' +
                    '<label class="fp-check"><input type="checkbox" id="fdKvkk"> KVKK Aydınlatma Metni’ni okudum.</label>' +
                    '<label class="fp-check"><input type="checkbox" id="fdRiza"> Belge incelemesi için açık rıza veriyorum (ayrı onay).</label>' +
                    '<p class="fp-aksiyon-satir" style="margin-top:12px">' +
                    '<button type="button" class="btn btn--ghost btn--sm" id="fdHazirlaBtn">Başvuru Taslağı Oluştur</button> ' +
                    '<button type="button" class="btn btn--gold btn--sm" id="fdGonderBtn">İncelemeye Gönder</button></p>')
                : '<p class="panel-not">Bu durumda belge düzenlemesi kapalı. Admin açıklamasını bekleyin.</p>') +
            '</div>';
    }

    function bindDogrulamaForm(el, res) {
        if (!el) return;
        var FD = global.AurixFirmaDogrulama || {};
        var toast = function (m, t) {
            if (global.Aurix && Aurix.toast) Aurix.toast(m, t || 'info');
            else toastInfo(m);
        };
        var vergiNoEl = el.querySelector('#fdVergiNo');
        var isletmeEl = el.querySelector('#fdIsletmeTuru');
        var yardimEl = el.querySelector('#fdVergiYardim');
        function guncelleVergiYardim() {
            if (!vergiNoEl || !yardimEl || typeof FD.vergiNoKontrol !== 'function') return;
            var r = FD.vergiNoKontrol(vergiNoEl.value, isletmeEl && isletmeEl.value);
            if (!vergiNoEl.value) {
                yardimEl.textContent = 'VKN 10, şahıs TCKN 11 hane. Geçerli format = doğrulanmış rozet değildir.';
                return;
            }
            yardimEl.textContent = r.ok
                ? 'Format geçerli (' + r.tur.toUpperCase() + '). Bu, resmî doğrulama değildir.'
                : (r.error || 'Geçersiz numara.');
        }
        if (vergiNoEl) vergiNoEl.addEventListener('input', guncelleVergiYardim);
        if (isletmeEl) isletmeEl.addEventListener('change', guncelleVergiYardim);

        var kimlikBtn = el.querySelector('#fdKimlikKaydetBtn');
        if (kimlikBtn) {
            kimlikBtn.addEventListener('click', function () {
                var root = el.querySelector('.fp-dogrulama');
                var bid = root && root.getAttribute('data-fd-basvuru');
                var kontrol = typeof FD.vergiNoKontrol === 'function'
                    ? FD.vergiNoKontrol(
                        (el.querySelector('#fdVergiNo') || {}).value,
                        (el.querySelector('#fdIsletmeTuru') || {}).value
                    )
                    : { ok: true };
                if (!kontrol.ok) return toast(kontrol.error || 'Vergi no geçersiz.', 'error');
                function kaydet(id) {
                    kimlikBtn.disabled = true;
                    AurixSupabase.firmaDogrulamaKimlikKaydet({
                        basvuru_id: id,
                        hukuki_unvan: (el.querySelector('#fdHukukiUnvan') || {}).value,
                        vergi_no: kontrol.value || (el.querySelector('#fdVergiNo') || {}).value,
                        vergi_kimlik_turu: kontrol.tur,
                        vergi_dairesi: (el.querySelector('#fdVergiDairesi') || {}).value,
                        isletme_turu: (el.querySelector('#fdIsletmeTuru') || {}).value,
                        mersis_no: (el.querySelector('#fdMersis') || {}).value,
                        sicil_no: (el.querySelector('#fdSicil') || {}).value,
                        basvuran_sifati: (el.querySelector('#fdBasvuranSifat') || {}).value,
                        vergi_levha_islem_kodu: (el.querySelector('#fdIslemKod') || {}).value
                    }).then(function (r) {
                        kimlikBtn.disabled = false;
                        if (!r.ok) return toast(r.error, 'error');
                        toast('Kimlik kaydedildi. Format geçerli ≠ resmî doğrulama.', 'success');
                        yukleDogrulamaSekmesi();
                    });
                }
                if (bid) return kaydet(bid);
                AurixSupabase.firmaDogrulamaBasvuruHazirla().then(function (r) {
                    if (!r.ok) return toast(r.error, 'error');
                    kaydet(r.basvuru_id);
                });
            });
        }
        var hazirla = el.querySelector('#fdHazirlaBtn');
        if (hazirla) {
            hazirla.addEventListener('click', function () {
                AurixSupabase.firmaDogrulamaBasvuruHazirla().then(function (r) {
                    if (!r.ok) return toast(r.error, 'error');
                    toast('Taslak hazır.', 'success');
                    yukleDogrulamaSekmesi();
                });
            });
        }
        var yukleBtn = el.querySelector('#fdBelgeYukleBtn');
        if (yukleBtn) {
            yukleBtn.addEventListener('click', function () {
                var fileEl = el.querySelector('#fdBelgeDosya');
                var file = fileEl && fileEl.files && fileEl.files[0];
                var basvuruId = el.querySelector('.fp-dogrulama').getAttribute('data-fd-basvuru');
                var firmaId = el.querySelector('.fp-dogrulama').getAttribute('data-fd-firma');
                function doUpload(bid) {
                    yukleBtn.disabled = true;
                    AurixSupabase.yukleFirmaDogrulamaBelgesi({
                        file: file,
                        basvuruId: bid,
                        firmaId: firmaId,
                        belgeTuru: (el.querySelector('#fdBelgeTur') || {}).value,
                        belgeNo: (el.querySelector('#fdBelgeNo') || {}).value,
                        duzenlenmeTarihi: (el.querySelector('#fdBelgeDuzen') || {}).value || null,
                        gecerlilikTarihi: (el.querySelector('#fdBelgeGecer') || {}).value || null
                    }).then(function (r) {
                        yukleBtn.disabled = false;
                        if (!r.ok) return toast(r.error, 'error');
                        toast('Belge yüklendi.', 'success');
                        yukleDogrulamaSekmesi();
                    });
                }
                if (!file) return toast('Dosya seçin.', 'error');
                if (basvuruId) return doUpload(basvuruId);
                AurixSupabase.firmaDogrulamaBasvuruHazirla().then(function (r) {
                    if (!r.ok) return toast(r.error, 'error');
                    doUpload(r.basvuru_id);
                });
            });
        }
        var gonder = el.querySelector('#fdGonderBtn');
        if (gonder) {
            gonder.addEventListener('click', function () {
                var root = el.querySelector('.fp-dogrulama');
                var bid = root && root.getAttribute('data-fd-basvuru');
                var flags = {
                    sahipBeyani: !!(el.querySelector('#fdSahipBeyan') || {}).checked,
                    kvkk: !!(el.querySelector('#fdKvkk') || {}).checked,
                    acikRiza: !!(el.querySelector('#fdRiza') || {}).checked
                };
                function send(id) {
                    gonder.disabled = true;
                    AurixSupabase.firmaDogrulamaBasvuruGonder(id, flags).then(function (r) {
                        gonder.disabled = false;
                        if (!r.ok) return toast(r.error, 'error');
                        toast('Başvurunuz incelemeye alındı.', 'success');
                        yukleDogrulamaSekmesi();
                    });
                }
                if (bid) return send(bid);
                AurixSupabase.firmaDogrulamaBasvuruHazirla().then(function (r) {
                    if (!r.ok) return toast(r.error, 'error');
                    send(r.basvuru_id);
                });
            });
        }
        el.querySelectorAll('[data-fd-belge-gor]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-fd-belge-gor');
                AurixSupabase.firmaDogrulamaBelgeImzaliUrl(id).then(function (r) {
                    if (!r.ok) return toast(r.error, 'error');
                    if (r.url) global.open(r.url, '_blank', 'noopener');
                });
            });
        });
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
        var hasFirma = !!(veri && veri.hasFirma && veri.firma && veri.firma.id);
        lastHasFirma = hasFirma;
        lastFirma = (veri && veri.firma && veri.firma.id) ? veri.firma : null;
        lastFirmaError = (veri && veri.firmaError) ? String(veri.firmaError) : null;

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
        if (profilEl) {
            profilEl.innerHTML = renderProfil(veri, user);
            if (global.Aurix && typeof Aurix.firmaProfilFormHazirla === 'function') {
                Aurix.firmaProfilFormHazirla(veri && veri.firma ? veri.firma : null);
            }
        }

        var dogrulamaEl = $('panelSekmeDogrulama');
        if (dogrulamaEl) {
            if (hasFirma) yukleDogrulamaSekmesi();
            else {
                dogrulamaEl.innerHTML = '<div class="fp-bos-kutu"><p class="fp-bos-metin">Doğrulama için önce firma hesabı gerekir.</p></div>';
            }
        }

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
            var firma = res.firma || null;
            var hasFirma = !!(res.hasFirma && firma && firma.id);
            var firmaError = null;
            if (res.ok === false && (res.firmaError || res.error)) {
                firmaError = res.firmaError || res.error;
            }
            panelIcerikYukle({
                hasFirma: hasFirma,
                firma: firma,
                firmaError: firmaError,
                teklifler: res.teklifler || [],
                kullaniciIsleri: (isRes.ok && isRes.data) ? isRes.data : []
            });
            /* refreshProfile kaldırıldı — ensure_own_profile / auth notify döngüsü yaratıyordu */
        }).catch(function () {
            panelIcerikYukle({
                hasFirma: false,
                firma: null,
                firmaError: 'Firma paneli yüklenemedi. Lütfen tekrar deneyin.',
                teklifler: [],
                kullaniciIsleri: []
            });
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
        hasFirmaHesabi: function () { return lastHasFirma; },
        getFirma: function () { return lastFirma; },
        openFirmaProfil: mevcutFirmaProfilineGit
    };
})(typeof window !== 'undefined' ? window : this);

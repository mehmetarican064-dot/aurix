/**
 * AURIX Firma Değerlendirmeleri — profil özeti + yorum listesi
 * Demo yalnızca geliştirme ortamında; production’da sahte veri yok.
 * Gerçek işlem iddiası oluşturmaz (_kaynak: 'demo' | 'api').
 */
(function (global) {
    'use strict';

    var esc = (global.AurixUtils && AurixUtils.escapeHtml)
        ? AurixUtils.escapeHtml
        : function (s) { return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

    var PROD_HOST = /(?:^|\.)aurixb2b\.com$/i;

    function demoModAktifMi() {
        var host = '';
        try { host = String(global.location && location.hostname || '').toLowerCase(); } catch (e) { host = ''; }
        if (PROD_HOST.test(host)) return false;
        var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
            host === '' || /\.local$/i.test(host) || host === '0.0.0.0';
        if (local) return true;
        try {
            if (new URLSearchParams(location.search).get('demoDegerlendirme') === '1') return true;
            if (global.localStorage && localStorage.getItem('aurix_demo_degerlendirme') === '1') return true;
        } catch (e2) { /* ignore */ }
        if (global.AURIX_DEMO_DEGERLENDIRME === true) return true;
        return false;
    }

    function demoOzet() {
        return {
            _kaynak: 'demo',
            genel_puan: 4.8,
            degerlendirme_sayisi: 24,
            tamamlanan_is: 38,
            zamaninda_teslim_orani: 96,
            yeniden_calisma_orani: 92,
            kategori: {
                iscilik_kalitesi: 4.9,
                termin_uyumu: 4.7,
                iletisim: 4.8,
                is_tanimina_uygunluk: 4.9
            },
            yildiz_dagilim: { 5: 16, 4: 6, 3: 2, 2: 0, 1: 0 }
        };
    }

    function demoYorumlar() {
        return [
            {
                id: 'demo-1',
                _kaynak: 'demo',
                ad_kisa: 'M*** Kuyumculuk',
                bas_harf: 'M',
                puan: 5.0,
                tarih: '2026-05-12',
                kategori: 'Döküm',
                sehir: null,
                yorum: 'İş teslim süresine uygun tamamlandı. Döküm kalitesi beklentimizi karşıladı ve iletişim süreç boyunca düzenliydi.',
                yeniden_calisir: true
            },
            {
                id: 'demo-2',
                _kaynak: 'demo',
                ad_kisa: 'A*** Mücevherat',
                bas_harf: 'A',
                puan: 4.7,
                tarih: '2026-04-28',
                kategori: 'Mum Model',
                sehir: null,
                yorum: 'Detaylar iş emrine uygun hazırlandı. Teslimat planlanan tarihte gerçekleştirildi.',
                yeniden_calisir: true
            },
            {
                id: 'demo-3',
                _kaynak: 'demo',
                ad_kisa: 'K*** Atölye',
                bas_harf: 'K',
                puan: 4.6,
                tarih: '2026-03-19',
                kategori: 'Mıhlama',
                sehir: null,
                yorum: 'İletişim hızlıydı ve revize talebimiz dikkatli şekilde uygulandı.',
                yeniden_calisir: true
            },
            {
                id: 'demo-4',
                _kaynak: 'demo',
                ad_kisa: 'S*** Gold',
                bas_harf: 'S',
                puan: 4.8,
                tarih: '2026-02-08',
                kategori: 'Cila',
                sehir: null,
                yorum: 'Yüzey kalitesi tutarlıydı. Süreç boyunca güncellemeler düzenli geldi.',
                yeniden_calisir: true
            },
            {
                id: 'demo-5',
                _kaynak: 'demo',
                ad_kisa: 'B*** Kuyum',
                bas_harf: 'B',
                puan: 4.5,
                tarih: '2026-01-21',
                kategori: 'Döküm',
                sehir: null,
                yorum: 'İlk siparişte süreç netleşti. Termin planına uyuldu.',
                yeniden_calisir: false
            }
        ];
    }

    function bosOzet() {
        return {
            _kaynak: 'bos',
            genel_puan: null,
            degerlendirme_sayisi: 0,
            tamamlanan_is: null,
            zamaninda_teslim_orani: null,
            yeniden_calisma_orani: null,
            kategori: null,
            yildiz_dagilim: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        };
    }

    function formatPuan(n) {
        if (n == null || n === '' || isNaN(Number(n))) return '—';
        return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    function formatTarih(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso).slice(0, 10);
            return d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return String(iso).slice(0, 10);
        }
    }

    function yildizHtml(puan, boyut) {
        var p = Number(puan);
        if (isNaN(p) || p <= 0) {
            return '<span class="fdg-yildiz fdg-yildiz--bos" aria-hidden="true"></span>';
        }
        var dolu = Math.round(Math.min(5, Math.max(0, p)));
        var parts = [];
        var i;
        for (i = 1; i <= 5; i++) {
            parts.push('<span class="fdg-yildiz__birim' + (i <= dolu ? ' fdg-yildiz__birim--dolu' : '') +
                '" aria-hidden="true">★</span>');
        }
        return '<span class="fdg-yildiz fdg-yildiz--' + esc(boyut || 'md') +
            '" role="img" aria-label="' + esc(formatPuan(p) + ' üzerinden 5') + '">' +
            parts.join('') + '</span>';
    }

    function metrikDeger(v, suffix) {
        if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return '—';
        if (typeof v === 'number' && v === 0) return '—';
        if (suffix === '%') return '%' + String(v);
        if (suffix === '/5') return formatPuan(v) + ' / 5';
        return String(v);
    }

    function performansOzetHtml(ozet) {
        ozet = ozet || bosOzet();
        var hasData = (ozet.degerlendirme_sayisi || 0) > 0 || (ozet.tamamlanan_is || 0) > 0;
        var genel = hasData ? metrikDeger(ozet.genel_puan, '/5') : '—';
        var zaman = hasData ? metrikDeger(ozet.zamaninda_teslim_orani, '%') : '—';
        var tekrar = hasData ? metrikDeger(ozet.yeniden_calisma_orani, '%') : '—';
        var isSay = hasData && ozet.tamamlanan_is ? String(ozet.tamamlanan_is) : '—';
        var altGenel = hasData && ozet.degerlendirme_sayisi
            ? (ozet.degerlendirme_sayisi + ' doğrulanmış işlem')
            : 'Henüz veri yok';
        var sinifZaman = hasData && ozet.zamaninda_teslim_orani >= 90 ? ' fdg-metrik--olumlu' : '';
        var sinifTekrar = hasData && ozet.yeniden_calisma_orani >= 90 ? ' fdg-metrik--olumlu' : '';

        return '<section class="fdg-performans" aria-labelledby="fdgPerformansBaslik">' +
            '<h4 class="detay-bolum__baslik" id="fdgPerformansBaslik">Güven ve Performans</h4>' +
            '<div class="fdg-metrik-grid">' +
            '<div class="fdg-metrik">' +
            '<span class="fdg-metrik__etiket">Genel değerlendirme</span>' +
            '<strong class="fdg-metrik__deger">' + esc(genel) + '</strong>' +
            '<span class="fdg-metrik__alt">' + esc(altGenel) + '</span></div>' +
            '<div class="fdg-metrik' + sinifZaman + '">' +
            '<span class="fdg-metrik__etiket">Zamanında teslim</span>' +
            '<strong class="fdg-metrik__deger">' + esc(zaman) + '</strong>' +
            '<span class="fdg-metrik__alt">Son 12 ay</span></div>' +
            '<div class="fdg-metrik' + sinifTekrar + '">' +
            '<span class="fdg-metrik__etiket">Tekrar çalışma oranı</span>' +
            '<strong class="fdg-metrik__deger">' + esc(tekrar) + '</strong>' +
            '<span class="fdg-metrik__alt">Müşteri tercihi</span></div>' +
            '<div class="fdg-metrik">' +
            '<span class="fdg-metrik__etiket">Tamamlanan iş</span>' +
            '<strong class="fdg-metrik__deger">' + esc(isSay) + '</strong>' +
            '<span class="fdg-metrik__alt">AURIX üzerinden</span></div>' +
            '</div>' +
            '<p class="fdg-dipnot">Performans bilgileri yalnızca AURIX üzerinden tamamlanan ve kayıt altına alınan işlemlerden oluşturulur.</p>' +
            '</section>';
    }

    function dagilimSatirHtml(yildiz, adet, toplam) {
        var pct = toplam > 0 ? Math.round((adet / toplam) * 100) : 0;
        return '<div class="fdg-dagilim__satir">' +
            '<span class="fdg-dagilim__etiket">' + esc(String(yildiz)) + ' yıldız</span>' +
            '<div class="fdg-bar" role="progressbar" aria-valuenow="' + pct +
            '" aria-valuemin="0" aria-valuemax="100" aria-label="' +
            esc(yildiz + ' yıldız: ' + adet + ' değerlendirme') + '">' +
            '<span class="fdg-bar__dolgu" data-fdg-pct="' + pct + '"></span></div>' +
            '<span class="fdg-dagilim__adet">' + esc(String(adet)) + '</span></div>';
    }

    function kategoriSatirHtml(ad, puan) {
        var p = Number(puan);
        var pct = isNaN(p) ? 0 : Math.round((p / 5) * 100);
        return '<div class="fdg-kat__satir">' +
            '<span class="fdg-kat__ad">' + esc(ad) + '</span>' +
            '<div class="fdg-bar fdg-bar--ince" role="progressbar" aria-valuenow="' +
            (isNaN(p) ? 0 : p) + '" aria-valuemin="0" aria-valuemax="5" aria-label="' +
            esc(ad + ': ' + formatPuan(p)) + '">' +
            '<span class="fdg-bar__dolgu" data-fdg-pct="' + pct + '"></span></div>' +
            '<span class="fdg-kat__puan">' + esc(formatPuan(p)) + '</span></div>';
    }

    function bosDurumHtml() {
        return '<div class="fdg-bos" role="status">' +
            '<h5 class="fdg-bos__baslik">Henüz değerlendirme bulunmuyor</h5>' +
            '<p class="fdg-bos__metin">Bu firma AURIX üzerinden tamamlanan ilk işinin ardından doğrulanmış değerlendirmeler almaya başlayacaktır.</p>' +
            '<p class="fdg-dipnot">AURIX’te yalnızca tamamlanmış işlemlerin tarafları değerlendirme yapabilir.</p>' +
            '</div>';
    }

    function yorumKartHtml(y) {
        y = y || {};
        var yeniden = y.yeniden_calisir
            ? '<p class="fdg-yorum__yeniden"><span class="fdg-yorum__check" aria-hidden="true">✓</span> Bu firmayla yeniden çalışırım</p>'
            : '';
        return '<article class="fdg-yorum" data-fdg-yorum="' + esc(String(y.id || '')) + '">' +
            '<div class="fdg-yorum__ust">' +
            '<div class="fdg-yorum__kimlik">' +
            '<span class="fdg-avatar" aria-hidden="true">' + esc(y.bas_harf || '·') + '</span>' +
            '<div><strong class="fdg-yorum__ad">' + esc(y.ad_kisa || 'Firma') + '</strong>' +
            '<time class="fdg-yorum__tarih" datetime="' + esc(y.tarih || '') + '">' +
            esc(formatTarih(y.tarih)) + '</time></div></div>' +
            '<div class="fdg-yorum__puan">' +
            '<span class="fdg-yorum__skor">' + esc(formatPuan(y.puan)) + '</span>' +
            yildizHtml(y.puan, 'sm') +
            '</div></div>' +
            '<div class="fdg-yorum__etiketler">' +
            '<span class="fdg-etiket fdg-etiket--dogrulanmis">Doğrulanmış İşlem</span>' +
            (y.kategori ? '<span class="fdg-etiket">' + esc(y.kategori) + '</span>' : '') +
            (y.sehir ? '<span class="fdg-etiket">' + esc(y.sehir) + '</span>' : '') +
            '</div>' +
            '<p class="fdg-yorum__metin">' + esc(y.yorum || '') + '</p>' +
            yeniden +
            '</article>';
    }

    function degerlendirmelerHtml(ozet, yorumlar, opts) {
        opts = opts || {};
        var limit = opts.limit != null ? opts.limit : 3;
        var genis = !!opts.genis;
        ozet = ozet || bosOzet();
        yorumlar = Array.isArray(yorumlar) ? yorumlar : [];
        var sayi = ozet.degerlendirme_sayisi || 0;
        var hasData = sayi > 0 && yorumlar.length > 0;

        var baslikSag = hasData
            ? '<span class="fdg-bolum__sayi">' + esc(String(sayi) + ' doğrulanmış değerlendirme') + '</span>'
            : '';

        if (!hasData) {
            return '<section class="fdg-bolum" aria-labelledby="fdgDegerlendirmeBaslik">' +
                '<div class="fdg-bolum__baslik-satir">' +
                '<h4 class="detay-bolum__baslik" id="fdgDegerlendirmeBaslik">Değerlendirmeler</h4>' +
                baslikSag + '</div>' +
                bosDurumHtml() +
                '</section>';
        }

        var dag = ozet.yildiz_dagilim || {};
        var dagHtml = [5, 4, 3, 2, 1].map(function (y) {
            return dagilimSatirHtml(y, dag[y] || 0, sayi);
        }).join('');

        var kat = ozet.kategori || {};
        var katHtml =
            kategoriSatirHtml('İşçilik kalitesi', kat.iscilik_kalitesi) +
            kategoriSatirHtml('Termin uyumu', kat.termin_uyumu) +
            kategoriSatirHtml('İletişim', kat.iletisim) +
            kategoriSatirHtml('İş tanımına uygunluk', kat.is_tanimina_uygunluk);

        var goster = genis ? yorumlar : yorumlar.slice(0, limit);
        var kartlar = goster.map(yorumKartHtml).join('');
        var dahaVar = !genis && yorumlar.length > limit;

        return '<section class="fdg-bolum" aria-labelledby="fdgDegerlendirmeBaslik" data-fdg-root="1">' +
            '<div class="fdg-bolum__baslik-satir">' +
            '<h4 class="detay-bolum__baslik" id="fdgDegerlendirmeBaslik">Değerlendirmeler</h4>' +
            baslikSag + '</div>' +
            '<div class="fdg-ozet-grid">' +
            '<div class="fdg-ozet-sol">' +
            '<p class="fdg-ozet-sol__puan">' + esc(formatPuan(ozet.genel_puan)) + '</p>' +
            yildizHtml(ozet.genel_puan, 'lg') +
            '<p class="fdg-ozet-sol__meta">' + esc(String(sayi) + ' değerlendirme') + '</p>' +
            (ozet.yeniden_calisma_orani != null
                ? '<p class="fdg-ozet-sol__meta fdg-ozet-sol__meta--olumlu">%' +
                    esc(String(ozet.yeniden_calisma_orani)) + ' yeniden çalışır</p>'
                : '') +
            '<div class="fdg-dagilim">' + dagHtml + '</div></div>' +
            '<div class="fdg-ozet-sag" aria-label="Kategori puanları">' +
            '<h5 class="fdg-ozet-sag__baslik">Kategori puanları</h5>' +
            katHtml + '</div></div>' +
            '<div class="fdg-yorum-liste" id="fdgYorumListe">' + kartlar + '</div>' +
            (dahaVar
                ? '<p class="fdg-tum-wrap"><button type="button" class="btn btn--ghost btn--sm" id="fdgTumBtn">' +
                    'Tüm değerlendirmeleri görüntüle</button></p>'
                : '') +
            '</section>';
    }

    function skeletonHtml() {
        return '<section class="fdg-bolum fdg-bolum--yukleniyor" aria-busy="true" aria-label="Değerlendirmeler yükleniyor">' +
            '<div class="fdg-skeleton"></div><div class="fdg-skeleton fdg-skeleton--kisa"></div></section>';
    }

    function hataHtml(mesaj) {
        return '<section class="fdg-bolum" role="alert">' +
            '<h4 class="detay-bolum__baslik">Değerlendirmeler</h4>' +
            '<p class="fdg-hata">' + esc(mesaj || 'Değerlendirmeler yüklenemedi.') + '</p></section>';
    }

    function uygulaBarGenislikleri(kok) {
        if (!kok) return;
        kok.querySelectorAll('[data-fdg-pct]').forEach(function (el) {
            var n = parseInt(el.getAttribute('data-fdg-pct'), 10);
            if (isNaN(n)) n = 0;
            el.style.width = Math.max(0, Math.min(100, n)) + '%';
        });
    }

    /** İleride tamamlanmış iş ekranından açılacak — profilde tetiklenmez */
    function degerlendirmeFormHtml() {
        function yildizInput(name, etiket) {
            var opts = '';
            var i;
            for (i = 1; i <= 5; i++) {
                opts += '<label class="fdg-form-yildiz">' +
                    '<input type="radio" name="' + esc(name) + '" value="' + i + '" required> ' +
                    '<span>' + i + '</span></label>';
            }
            return '<fieldset class="fdg-form-alan">' +
                '<legend>' + esc(etiket) + '</legend>' +
                '<div class="fdg-form-yildizlar" role="radiogroup" aria-label="' + esc(etiket) + '">' +
                opts + '</div></fieldset>';
        }
        return '<form id="fdgDegerlendirmeForm" class="fdg-form" novalidate>' +
            '<p class="fdg-dipnot">Yalnızca tamamlanmış bir işlemin tarafları değerlendirme yapabilir. Bir işlem için tek değerlendirme.</p>' +
            yildizInput('iscilik_kalitesi', 'İşçilik kalitesi') +
            yildizInput('termin_uyumu', 'Termin uyumu') +
            yildizInput('iletisim', 'İletişim') +
            yildizInput('is_tanimina_uygunluk', 'İş tanımına uygunluk') +
            '<fieldset class="fdg-form-alan">' +
            '<legend>Bu firmayla yeniden çalışır mısınız?</legend>' +
            '<label class="fdg-form-radio"><input type="radio" name="yeniden_calisir" value="1" required> Evet</label> ' +
            '<label class="fdg-form-radio"><input type="radio" name="yeniden_calisir" value="0"> Hayır</label>' +
            '</fieldset>' +
            '<div class="form-grup">' +
            '<label class="form-label" for="fdgYorum">Yorum</label>' +
            '<textarea class="form-textarea" id="fdgYorum" name="yorum" rows="4" maxlength="500" ' +
            'placeholder="Deneyiminizi kısaca yazın (en fazla 500 karakter)"></textarea>' +
            '<p class="form-yardim"><span id="fdgYorumSayac">0</span>/500</p></div>' +
            '<p class="fp-aksiyon-satir">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-fdg-form-kapat>Vazgeç</button> ' +
            '<button type="submit" class="btn btn--gold btn--sm" disabled title="Altyapı hazırlanıyor">Gönder</button></p>' +
            '<p class="fdg-dipnot">Gönderim sonrası puan alanları değiştirilemez. Yorumlar moderasyona tabi olabilir.</p>' +
            '</form>';
    }

    function yukleFirmaDegerlendirme(firma) {
        var firmaId = firma && (firma.supabaseId != null ? firma.supabaseId : firma.id);
        var sb = global.AurixSupabase && AurixSupabase.getClient && AurixSupabase.getClient();

        if (sb && global.AurixSupabase && typeof AurixSupabase.firmaDegerlendirmeOzet === 'function') {
            return AurixSupabase.firmaDegerlendirmeOzet(firmaId).then(function (res) {
                if (res && res.ok && res.ozet && (res.ozet.degerlendirme_sayisi || 0) > 0) {
                    return {
                        ozet: Object.assign({ _kaynak: 'api' }, res.ozet),
                        yorumlar: (res.yorumlar || []).map(function (y) {
                            return Object.assign({ _kaynak: 'api' }, y);
                        })
                    };
                }
                if (demoModAktifMi()) {
                    return { ozet: demoOzet(), yorumlar: demoYorumlar() };
                }
                return { ozet: bosOzet(), yorumlar: [] };
            }).catch(function () {
                if (demoModAktifMi()) {
                    return { ozet: demoOzet(), yorumlar: demoYorumlar() };
                }
                return { ozet: bosOzet(), yorumlar: [] };
            });
        }

        if (demoModAktifMi()) {
            return Promise.resolve({ ozet: demoOzet(), yorumlar: demoYorumlar() });
        }
        return Promise.resolve({ ozet: bosOzet(), yorumlar: [] });
    }

    function renderProfilDegerlendirme(kapsayiciPerformans, kapsayiciDegerlendirme, firma) {
        if (kapsayiciPerformans) kapsayiciPerformans.innerHTML = skeletonHtml();
        if (kapsayiciDegerlendirme) kapsayiciDegerlendirme.innerHTML = skeletonHtml();

        return yukleFirmaDegerlendirme(firma).then(function (data) {
            var ozet = data.ozet || bosOzet();
            var yorumlar = data.yorumlar || [];
            if (kapsayiciPerformans) {
                kapsayiciPerformans.innerHTML = performansOzetHtml(ozet);
                uygulaBarGenislikleri(kapsayiciPerformans);
            }
            if (kapsayiciDegerlendirme) {
                kapsayiciDegerlendirme.innerHTML = degerlendirmelerHtml(ozet, yorumlar, { limit: 3 });
                uygulaBarGenislikleri(kapsayiciDegerlendirme);
                var tumBtn = kapsayiciDegerlendirme.querySelector('#fdgTumBtn');
                if (tumBtn) {
                    tumBtn.addEventListener('click', function () {
                        kapsayiciDegerlendirme.innerHTML = degerlendirmelerHtml(ozet, yorumlar, {
                            limit: 3,
                            genis: true
                        });
                        uygulaBarGenislikleri(kapsayiciDegerlendirme);
                    });
                }
            }
            return data;
        }).catch(function () {
            if (kapsayiciPerformans) {
                kapsayiciPerformans.innerHTML = performansOzetHtml(bosOzet());
            }
            if (kapsayiciDegerlendirme) {
                kapsayiciDegerlendirme.innerHTML = hataHtml('Değerlendirmeler şu an görüntülenemiyor.');
            }
        });
    }

    global.AurixFirmaDegerlendirme = {
        demoModAktifMi: demoModAktifMi,
        demoOzet: demoOzet,
        demoYorumlar: demoYorumlar,
        bosOzet: bosOzet,
        performansOzetHtml: performansOzetHtml,
        degerlendirmelerHtml: degerlendirmelerHtml,
        degerlendirmeFormHtml: degerlendirmeFormHtml,
        yukleFirmaDegerlendirme: yukleFirmaDegerlendirme,
        renderProfilDegerlendirme: renderProfilDegerlendirme,
        uygulaBarGenislikleri: uygulaBarGenislikleri,
        formatPuan: formatPuan,
        yildizHtml: yildizHtml
    };
})(typeof window !== 'undefined' ? window : this);

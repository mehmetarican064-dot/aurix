/**
 * AURIX — Tamamlanan iş değerlendirme (puan/yorum) ve şikayet modali
 * RPC: degerlendirme_gonder | sikayet_bildir (migration 044)
 */
(function (global) {
    'use strict';

    var SIKAYET_NEDENLERI = [
        'İş zamanında teslim edilmedi',
        'Kalite beklenenin altında',
        'İletişim kurulamadı',
        'Anlaşılan fiyattan farklı ücret talep edildi',
        'Diğer'
    ];

    var state = {
        mod: null,
        isId: null,
        baslik: '',
        puan: 0,
        gonderiliyor: false,
        onSuccess: null
    };

    function esc(s) {
        if (global.AurixUtils && typeof AurixUtils.escapeHtml === 'function') {
            return AurixUtils.escapeHtml(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(msg, tip) {
        if (global.Aurix && typeof Aurix.toast === 'function') {
            Aurix.toast(msg, tip || 'info');
            return;
        }
        try { console.log('[deg-sik]', tip, msg); } catch (e) { /* ignore */ }
    }

    function modalAc(id) {
        if (global.Aurix && typeof Aurix.modalAc === 'function') {
            Aurix.modalAc(id);
            return;
        }
        var el = document.getElementById(id);
        if (el) {
            el.classList.add('modal--acik');
            document.body.classList.add('modal-acik');
        }
    }

    function modalKapat(id) {
        if (global.Aurix && typeof Aurix.modalKapat === 'function') {
            Aurix.modalKapat(id);
            return;
        }
        var el = document.getElementById(id);
        if (el) {
            el.classList.remove('modal--acik');
            document.body.classList.remove('modal-acik');
        }
    }

    function yildizInputHtml(puan) {
        var html = '<div class="ds-yildiz-secim" role="radiogroup" aria-label="Puan seçin">';
        for (var i = 1; i <= 5; i++) {
            html += '<button type="button" class="ds-yildiz-btn' +
                (i <= puan ? ' ds-yildiz-btn--dolu' : '') +
                '" data-ds-puan="' + i + '" role="radio" aria-checked="' +
                (i === puan ? 'true' : 'false') + '" aria-label="' + i + ' yıldız">★</button>';
        }
        html += '</div>';
        return html;
    }

    function yildizGuncelle() {
        var wrap = document.getElementById('dsYildizWrap');
        if (wrap) wrap.innerHTML = yildizInputHtml(state.puan);
        bindYildiz();
    }

    function bindYildiz() {
        var wrap = document.getElementById('dsYildizWrap');
        if (!wrap) return;
        wrap.querySelectorAll('[data-ds-puan]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.puan = Number(btn.getAttribute('data-ds-puan')) || 0;
                yildizGuncelle();
            });
        });
    }

    function sikayetNedenSecenekleri() {
        return SIKAYET_NEDENLERI.map(function (n) {
            return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
        }).join('');
    }

    function formHtml() {
        if (state.mod === 'sikayet') {
            return '<div class="ds-alan">' +
                '<label class="form-label" for="dsSikayetNeden">Şikayet nedeni</label>' +
                '<select class="form-input" id="dsSikayetNeden">' + sikayetNedenSecenekleri() + '</select>' +
                '</div>' +
                '<div class="ds-alan">' +
                '<label class="form-label" for="dsSikayetDetay">Detay (opsiyonel)</label>' +
                '<textarea class="form-textarea" id="dsSikayetDetay" rows="4" maxlength="2000" placeholder="Yaşadığınız sorunu detaylandırın…"></textarea>' +
                '</div>' +
                '<button type="submit" class="btn btn--primary" id="dsGonderBtn">Şikayeti Gönder</button>';
        }
        return '<div class="ds-alan">' +
            '<label class="form-label">Puanınız</label>' +
            '<div id="dsYildizWrap">' + yildizInputHtml(state.puan) + '</div>' +
            '</div>' +
            '<div class="ds-alan">' +
            '<label class="form-label" for="dsYorum">Yorumunuz (opsiyonel)</label>' +
            '<textarea class="form-textarea" id="dsYorum" rows="4" maxlength="1000" placeholder="Firma ile ilgili deneyiminizi paylaşın…"></textarea>' +
            '</div>' +
            '<button type="submit" class="btn btn--primary" id="dsGonderBtn">Değerlendirmeyi Gönder</button>';
    }

    function ensureModal() {
        var el = document.getElementById('degSikModal');
        if (!el) {
            el = document.createElement('div');
            el.id = 'degSikModal';
            el.className = 'modal';
            el.setAttribute('aria-hidden', 'true');
            el.innerHTML =
                '<div class="modal__kutu" role="dialog" aria-modal="true" aria-labelledby="degSikBaslik">' +
                '<div class="modal__baslik">' +
                '<h3 id="degSikBaslik">İşlem</h3>' +
                '<button type="button" class="modal__kapat" data-modal-kapat="degSikModal" aria-label="Kapat">×</button>' +
                '</div>' +
                '<p class="ds-alt-baslik" id="degSikAlt"></p>' +
                '<form class="ds-form" id="degSikForm" autocomplete="off"></form>' +
                '</div>';
            document.body.appendChild(el);
        }
        if (el.getAttribute('data-ds-bound') === '1') return el;
        el.setAttribute('data-ds-bound', '1');
        el.addEventListener('click', function (ev) {
            if (ev.target === el || ev.target.closest('[data-modal-kapat="degSikModal"]')) {
                modalKapat('degSikModal');
            }
        });
        return el;
    }

    function ac(mod, opts) {
        opts = opts || {};
        var isId = opts.isTalebiId || opts.isId;
        if (!isId) {
            toast('İş talebi bulunamadı.', 'error');
            return;
        }
        var me = global.AuthService && AuthService.getCurrentUser ? AuthService.getCurrentUser() : null;
        if (!me) {
            toast(mod === 'sikayet' ? 'Şikayet bildirmek için giriş yapın.' : 'Değerlendirme yapmak için giriş yapın.', 'error');
            if (global.Aurix && typeof Aurix.sayfaGoster === 'function') {
                Aurix.sayfaGoster('giris');
            }
            return;
        }
        state.mod = mod;
        state.isId = String(isId);
        state.baslik = opts.baslik || 'İş talebi';
        state.puan = 0;
        state.onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : null;

        ensureModal();
        var h = document.getElementById('degSikBaslik');
        var alt = document.getElementById('degSikAlt');
        if (h) h.textContent = mod === 'sikayet' ? 'Şikayet Et' : 'Değerlendir / Puan Ver';
        if (alt) alt.textContent = state.baslik;

        var form = document.getElementById('degSikForm');
        if (form) {
            form.innerHTML = formHtml();
            form.onsubmit = function (e) {
                e.preventDefault();
                gonderUi();
            };
            if (mod !== 'sikayet') bindYildiz();
        }
        modalAc('degSikModal');
    }

    function gonderUi() {
        if (state.gonderiliyor || !state.isId) return;
        var btn = document.getElementById('dsGonderBtn');

        if (state.mod === 'sikayet') {
            var nedenSel = document.getElementById('dsSikayetNeden');
            var detay = document.getElementById('dsSikayetDetay');
            var neden = nedenSel ? nedenSel.value : '';
            if (!neden) {
                toast('Şikayet nedeni seçin.', 'info');
                return;
            }
            if (!global.AurixSupabase || typeof AurixSupabase.sikayetBildir !== 'function') {
                toast('Şikayet servisi hazır değil (044).', 'error');
                return;
            }
            state.gonderiliyor = true;
            if (btn) btn.disabled = true;
            AurixSupabase.sikayetBildir(state.isId, neden, detay ? detay.value : '').then(function (res) {
                if (!res.ok) {
                    toast(res.error || 'Şikayet gönderilemedi.', 'error');
                    return;
                }
                toast('Şikayetiniz alındı. En kısa sürede incelenecektir.', 'success');
                modalKapat('degSikModal');
                if (state.onSuccess) state.onSuccess(res);
            }).catch(function () {
                toast('Şikayet gönderilemedi.', 'error');
            }).finally(function () {
                state.gonderiliyor = false;
                if (btn) btn.disabled = false;
            });
            return;
        }

        if (!state.puan) {
            toast('Lütfen bir puan seçin.', 'info');
            return;
        }
        var yorumEl = document.getElementById('dsYorum');
        if (!global.AurixSupabase || typeof AurixSupabase.degerlendirmeGonder !== 'function') {
            toast('Değerlendirme servisi hazır değil (044).', 'error');
            return;
        }
        state.gonderiliyor = true;
        if (btn) btn.disabled = true;
        AurixSupabase.degerlendirmeGonder(state.isId, state.puan, yorumEl ? yorumEl.value : '').then(function (res) {
            if (!res.ok) {
                toast(res.error || 'Değerlendirme gönderilemedi.', 'error');
                return;
            }
            toast('Değerlendirmeniz için teşekkürler!', 'success');
            modalKapat('degSikModal');
            if (state.onSuccess) state.onSuccess(res);
        }).catch(function () {
            toast('Değerlendirme gönderilemedi.', 'error');
        }).finally(function () {
            state.gonderiliyor = false;
            if (btn) btn.disabled = false;
        });
    }

    function degerlendirAc(opts) { ac('degerlendir', opts); }
    function sikayetAc(opts) { ac('sikayet', opts); }

    global.AurixDegerlendirmeSikayet = {
        degerlendirAc: degerlendirAc,
        sikayetAc: sikayetAc,
        ensureModal: ensureModal
    };
})(typeof window !== 'undefined' ? window : this);

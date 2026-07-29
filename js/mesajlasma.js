/**
 * AURIX — İş talebi mesajlaşma (sohbet)
 * RPC: mesaj_* | Realtime postgres_changes + poll yedek | dosya: mesaj-dosyalari
 */
(function (global) {
    'use strict';

    var BUCKET = 'mesaj-dosyalari';
    var MAX_FILE = 10 * 1024 * 1024;
    var ALLOWED = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'application/pdf': 'pdf'
    };

    var state = {
        isId: null,
        aliciId: null,
        baslik: '',
        karsiAd: '',
        mesajlar: [],
        channel: null,
        pollTimer: null,
        gonderiliyor: false,
        pendingFile: null
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
        try { console.log('[mesaj]', tip, msg); } catch (e) { /* ignore */ }
    }

    function getSb() {
        if (global.AurixSupabase && typeof AurixSupabase.getClient === 'function') {
            return AurixSupabase.getClient();
        }
        return null;
    }

    function uid() {
        var u = global.AuthService && AuthService.getCurrentUser
            ? AuthService.getCurrentUser()
            : null;
        return u && u.id ? u.id : null;
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

    function rpcErr(err) {
        var msg = String((err && err.message) || err || '');
        if (/oturum_yok|JWT/i.test(msg)) return 'Oturum gerekli.';
        if (/yetkisiz|42501|not_admin/i.test(msg)) return 'Bu sohbete erişim yetkiniz yok.';
        if (/mesaj_bos/i.test(msg)) return 'Mesaj veya dosya gerekli.';
        if (/mesaj_uzun/i.test(msg)) return 'Mesaj en fazla 4000 karakter olabilir.';
        if (/dosya_yolu/i.test(msg)) return 'Dosya yolu geçersiz.';
        if (/is_yok|P0002/i.test(msg)) return 'İş talebi bulunamadı.';
        if (/function.*mesaj_/i.test(msg) || /404|PGRST202/i.test(msg)) {
            return 'Mesajlaşma henüz etkin değil. Yönetici migration 042’yi uygulamalı.';
        }
        return msg || 'İşlem başarısız.';
    }

    function karsiListe(isId) {
        var sb = getSb();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        return sb.rpc('mesaj_karsi_liste', { p_is_talebi_id: String(isId) }).then(function (res) {
            if (res.error) return { ok: false, error: rpcErr(res.error) };
            var d = res.data || {};
            return {
                ok: true,
                baslik: d.baslik || 'İş talebi',
                karsilar: Array.isArray(d.karsilar) ? d.karsilar : []
            };
        }).catch(function (e) { return { ok: false, error: rpcErr(e) }; });
    }

    function konusmalarim() {
        var sb = getSb();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.', konusmalar: [] });
        return sb.rpc('mesaj_konusmalarim').then(function (res) {
            if (res.error) return { ok: false, error: rpcErr(res.error), konusmalar: [] };
            var d = res.data || {};
            return {
                ok: true,
                konusmalar: Array.isArray(d.konusmalar) ? d.konusmalar : []
            };
        }).catch(function (e) {
            return { ok: false, error: rpcErr(e), konusmalar: [] };
        });
    }

    function listele(isId, karsiId) {
        var sb = getSb();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.', mesajlar: [] });
        return sb.rpc('mesaj_listele', {
            p_is_talebi_id: String(isId),
            p_karsi_id: karsiId,
            p_limit: 100
        }).then(function (res) {
            if (res.error) return { ok: false, error: rpcErr(res.error), mesajlar: [] };
            var d = res.data || {};
            return {
                ok: true,
                mesajlar: Array.isArray(d.mesajlar) ? d.mesajlar : []
            };
        }).catch(function (e) {
            return { ok: false, error: rpcErr(e), mesajlar: [] };
        });
    }

    function gonder(isId, aliciId, metin, dosyaPath) {
        var sb = getSb();
        if (!sb) return Promise.resolve({ ok: false, error: 'Bağlantı yok.' });
        return sb.rpc('mesaj_gonder', {
            p_is_talebi_id: String(isId),
            p_alici_id: aliciId,
            p_metin: metin || null,
            p_dosya_path: dosyaPath || null
        }).then(function (res) {
            if (res.error) return { ok: false, error: rpcErr(res.error) };
            return { ok: true, mesaj: res.data };
        }).catch(function (e) { return { ok: false, error: rpcErr(e) }; });
    }

    function okunduIsaretle(isId, karsiId) {
        var sb = getSb();
        if (!sb) return Promise.resolve({ ok: false });
        return sb.rpc('mesaj_okundu_isaretle', {
            p_is_talebi_id: String(isId),
            p_karsi_id: karsiId
        }).then(function () { return { ok: true }; })
            .catch(function () { return { ok: false }; });
    }

    function validateFile(file) {
        if (!file) return 'Dosya seçilmedi.';
        if (file.size > MAX_FILE) return 'Dosya en fazla 10 MB olabilir.';
        var mime = String(file.type || '').toLowerCase();
        if (!ALLOWED[mime]) return 'Yalnızca JPG, PNG veya PDF gönderilebilir.';
        return null;
    }

    function dosyaYukle(isId, file) {
        var sb = getSb();
        var me = uid();
        if (!sb || !me) return Promise.resolve({ ok: false, error: 'Oturum gerekli.' });
        var err = validateFile(file);
        if (err) return Promise.resolve({ ok: false, error: err });
        var ext = ALLOWED[String(file.type || '').toLowerCase()] || 'bin';
        var path = me + '/' + String(isId) + '/' +
            Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        return sb.storage.from(BUCKET).upload(path, file, {
            upsert: false,
            contentType: file.type || 'application/octet-stream'
        }).then(function (res) {
            if (res.error) {
                return { ok: false, error: res.error.message || 'Dosya yüklenemedi.' };
            }
            return { ok: true, path: path };
        }).catch(function (e) {
            return { ok: false, error: rpcErr(e) };
        });
    }

    function dosyaImzaliUrl(path) {
        var sb = getSb();
        if (!sb || !path) return Promise.resolve(null);
        return sb.rpc('mesaj_dosya_imzali_url', { p_path: path, p_saniye: 3600 }).then(function (yetki) {
            if (yetki.error) return null;
            return sb.storage.from(BUCKET).createSignedUrl(path, 3600).then(function (res) {
                if (res.error) return null;
                return res.data && res.data.signedUrl ? res.data.signedUrl : null;
            });
        }).catch(function () { return null; });
    }

    /* ---------- UI ---------- */
    function ensureModal() {
        var el = document.getElementById('mesajSohbetModal');
        if (!el) {
            el = document.createElement('div');
            el.id = 'mesajSohbetModal';
            el.className = 'modal';
            el.setAttribute('aria-hidden', 'true');
            el.innerHTML =
                '<div class="modal__kutu modal__kutu--msg" role="dialog" aria-modal="true" aria-labelledby="mesajSohbetBaslik">' +
                '<div class="modal__baslik msg-baslik">' +
                '<div class="msg-baslik__metin">' +
                '<h3 id="mesajSohbetBaslik">Sohbet</h3>' +
                '<p class="msg-baslik__alt" id="mesajSohbetAlt"></p>' +
                '</div>' +
                '<button type="button" class="modal__kapat" data-modal-kapat="mesajSohbetModal" aria-label="Kapat">×</button>' +
                '</div>' +
                '<div class="msg-secici" id="mesajKarsiSecici" hidden></div>' +
                '<div class="msg-akisi" id="mesajAkisi" aria-live="polite"></div>' +
                '<form class="msg-form" id="mesajForm" autocomplete="off">' +
                '<div class="msg-form__dosya" id="mesajDosyaOnizleme" hidden></div>' +
                '<div class="msg-form__bar">' +
                '<input type="file" id="mesajDosyaInput" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" hidden>' +
                '<button type="button" class="msg-form__ek" id="mesajDosyaBtn" title="Dosya ekle" aria-label="Dosya ekle">📎</button>' +
                '<div class="msg-form__govde">' +
                '<textarea class="msg-form__input" id="mesajMetin" rows="1" maxlength="4000" placeholder="Mesajınızı yazın…"></textarea>' +
                '</div>' +
                '<button type="submit" class="btn btn--primary btn--sm msg-form__gonder" id="mesajGonderBtn">Gönder</button>' +
                '</div>' +
                '</form>' +
                '</div>';
            document.body.appendChild(el);
        }
        if (el.getAttribute('data-msg-bound') === '1') return el;
        el.setAttribute('data-msg-bound', '1');

        el.addEventListener('click', function (ev) {
            if (ev.target === el || ev.target.closest('[data-modal-kapat="mesajSohbetModal"]')) {
                kapat();
            }
        });

        var form = document.getElementById('mesajForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                gonderUi();
            });
        }
        var dosyaBtn = document.getElementById('mesajDosyaBtn');
        var dosyaInput = document.getElementById('mesajDosyaInput');
        if (dosyaBtn && dosyaInput) {
            dosyaBtn.addEventListener('click', function () { dosyaInput.click(); });
            dosyaInput.addEventListener('change', function () {
                var f = dosyaInput.files && dosyaInput.files[0];
                if (!f) return;
                var v = validateFile(f);
                if (v) {
                    toast(v, 'error');
                    dosyaInput.value = '';
                    return;
                }
                state.pendingFile = f;
                var oniz = document.getElementById('mesajDosyaOnizleme');
                if (oniz) {
                    oniz.hidden = false;
                    oniz.innerHTML = '<span>' + esc(f.name) + '</span>' +
                        '<button type="button" class="msg-form__dosya-sil" id="mesajDosyaSil" aria-label="Dosyayı kaldır">×</button>';
                    var sil = document.getElementById('mesajDosyaSil');
                    if (sil) {
                        sil.addEventListener('click', function () {
                            state.pendingFile = null;
                            dosyaInput.value = '';
                            oniz.hidden = true;
                            oniz.innerHTML = '';
                        });
                    }
                }
            });
        }
        var ta = document.getElementById('mesajMetin');
        if (ta) {
            ta.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    gonderUi();
                }
            });
        }
        return el;
    }

    function formatSaat(iso) {
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString('tr-TR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return '';
        }
    }

    function dosyaEtiket(path) {
        var name = String(path || '').split('/').pop() || 'Dosya';
        if (/\.pdf$/i.test(name)) return 'PDF belge';
        if (/\.(png|jpe?g)$/i.test(name)) return 'Görsel';
        return name;
    }

    function dosyaGorselMi(path) {
        return /\.(png|jpe?g)$/i.test(String(path || ''));
    }

    function gorselLightboxAc(url) {
        if (!url) return;
        var lb = document.getElementById('galeriLightbox');
        if (!lb) {
            global.open(url, '_blank', 'noopener');
            return;
        }
        var img = lb.querySelector('.galeri-lightbox__img');
        if (img) img.src = url;
        lb.classList.add('galeri-lightbox--acik');
    }

    function renderMesajlar() {
        var akis = document.getElementById('mesajAkisi');
        if (!akis) return;
        var me = uid();
        if (!state.mesajlar.length) {
            akis.innerHTML = '<p class="msg-bos">Henüz mesaj yok. İlk mesajı siz gönderin.</p>';
            return;
        }
        var html = state.mesajlar.map(function (m) {
            var benim = m.benim_mi === true || (me && String(m.gonderen_id) === String(me));
            var cls = 'msg-balon' + (benim ? ' msg-balon--ben' : ' msg-balon--karsi');
            var icerik = '';
            if (m.mesaj_metni) {
                icerik += '<p class="msg-balon__metin">' + esc(m.mesaj_metni) + '</p>';
            }
            if (m.dosya_url && dosyaGorselMi(m.dosya_url)) {
                icerik += '<button type="button" class="msg-balon__gorsel" data-msg-gorsel="' +
                    esc(m.dosya_url) + '" aria-label="Görseli büyüt">' +
                    '<span class="msg-balon__gorsel-yukleniyor">Görsel yükleniyor…</span>' +
                    '</button>';
            } else if (m.dosya_url) {
                icerik += '<button type="button" class="msg-balon__dosya" data-msg-dosya="' +
                    esc(m.dosya_url) + '">' + esc(dosyaEtiket(m.dosya_url)) + '</button>';
            }
            return '<div class="' + cls + '" data-msg-id="' + esc(String(m.id || '')) + '">' +
                icerik +
                '<time class="msg-balon__zaman">' + esc(formatSaat(m.created_at)) + '</time>' +
                '</div>';
        }).join('');
        akis.innerHTML = html;
        akis.scrollTop = akis.scrollHeight;

        akis.querySelectorAll('[data-msg-dosya]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var path = btn.getAttribute('data-msg-dosya');
                dosyaImzaliUrl(path).then(function (url) {
                    if (!url) {
                        toast('Dosya açılamadı.', 'error');
                        return;
                    }
                    global.open(url, '_blank', 'noopener');
                });
            });
        });

        akis.querySelectorAll('[data-msg-gorsel]').forEach(function (btn) {
            var path = btn.getAttribute('data-msg-gorsel');
            dosyaImzaliUrl(path).then(function (url) {
                if (!url) {
                    btn.innerHTML = '<span class="msg-balon__gorsel-yukleniyor">Görsel açılamadı</span>';
                    return;
                }
                btn.innerHTML = '<img class="msg-balon__gorsel-img" src="' + esc(url) +
                    '" alt="Gönderilen görsel" loading="lazy">';
                btn.setAttribute('data-msg-gorsel-url', url);
            });
            btn.addEventListener('click', function () {
                var url = btn.getAttribute('data-msg-gorsel-url');
                if (url) {
                    gorselLightboxAc(url);
                } else {
                    dosyaImzaliUrl(path).then(gorselLightboxAc);
                }
            });
        });
    }

    function baslikGuncelle() {
        var h = document.getElementById('mesajSohbetBaslik');
        var alt = document.getElementById('mesajSohbetAlt');
        if (h) h.textContent = state.baslik || 'Sohbet';
        if (alt) alt.textContent = state.karsiAd ? ('Karşı taraf: ' + state.karsiAd) : '';
    }

    function dinlemeyiDurdur() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
        if (state.channel) {
            try {
                var sb = getSb();
                if (sb) sb.removeChannel(state.channel);
            } catch (e) { /* ignore */ }
            state.channel = null;
        }
    }

    function yenileMesajlar() {
        if (!state.isId || !state.aliciId) return Promise.resolve();
        return listele(state.isId, state.aliciId).then(function (res) {
            if (!res.ok) return;
            state.mesajlar = res.mesajlar || [];
            renderMesajlar();
            okunduIsaretle(state.isId, state.aliciId);
        });
    }

    function dinlemeyiBaslat() {
        dinlemeyiDurdur();
        if (!state.isId || !state.aliciId) return;
        var sb = getSb();
        var me = uid();
        if (sb && me) {
            try {
                state.channel = sb.channel('mesajlar:' + state.isId + ':' + state.aliciId)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'mesajlar',
                        filter: 'is_talebi_id=eq.' + state.isId
                    }, function () {
                        yenileMesajlar();
                    })
                    .subscribe(function (status) {
                        if (status === 'SUBSCRIBED') return;
                        /* Realtime yoksa poll devam eder */
                    });
            } catch (e) {
                state.channel = null;
            }
        }
        state.pollTimer = setInterval(function () {
            if (document.getElementById('mesajSohbetModal') &&
                document.getElementById('mesajSohbetModal').classList.contains('modal--acik')) {
                yenileMesajlar();
            }
        }, 8000);
    }

    function sohbetAc(isId, aliciId, meta) {
        meta = meta || {};
        state.isId = String(isId);
        state.aliciId = aliciId;
        state.baslik = meta.baslik || state.baslik || 'Sohbet';
        state.karsiAd = meta.karsiAd || '';
        state.pendingFile = null;
        ensureModal();
        var secici = document.getElementById('mesajKarsiSecici');
        if (secici) {
            secici.hidden = true;
            secici.innerHTML = '';
        }
        var form = document.getElementById('mesajForm');
        if (form) form.hidden = false;
        var oniz = document.getElementById('mesajDosyaOnizleme');
        if (oniz) {
            oniz.hidden = true;
            oniz.innerHTML = '';
        }
        var dosyaInput = document.getElementById('mesajDosyaInput');
        if (dosyaInput) dosyaInput.value = '';
        var metin = document.getElementById('mesajMetin');
        if (metin) metin.value = '';
        baslikGuncelle();
        var akis = document.getElementById('mesajAkisi');
        if (akis) akis.innerHTML = '<p class="msg-bos">Yükleniyor…</p>';
        modalAc('mesajSohbetModal');
        yenileMesajlar().then(function () {
            dinlemeyiBaslat();
        });
    }

    function karsiSeciciGoster(isId, karsilar, baslik) {
        ensureModal();
        state.isId = String(isId);
        state.aliciId = null;
        state.baslik = baslik || 'Sohbet';
        state.karsiAd = '';
        state.mesajlar = [];
        baslikGuncelle();
        var form = document.getElementById('mesajForm');
        if (form) form.hidden = true;
        var akis = document.getElementById('mesajAkisi');
        if (akis) akis.innerHTML = '';
        var secici = document.getElementById('mesajKarsiSecici');
        if (!secici) return;
        secici.hidden = false;
        if (!karsilar.length) {
            secici.innerHTML = '<p class="msg-bos">Sohbet için önce bir teklif olması gerekir.</p>';
        } else {
            secici.innerHTML = '<p class="msg-secici__baslik">Kiminle yazışmak istersiniz?</p>' +
                '<ul class="msg-secici__liste">' +
                karsilar.map(function (k) {
                    return '<li><button type="button" class="btn btn--ghost msg-secici__btn" data-msg-karsi="' +
                        esc(String(k.user_id)) + '" data-msg-karsi-ad="' + esc(k.ad || 'Firma') + '">' +
                        esc(k.ad || 'Firma') + '</button></li>';
                }).join('') +
                '</ul>';
            secici.querySelectorAll('[data-msg-karsi]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    sohbetAc(isId, btn.getAttribute('data-msg-karsi'), {
                        baslik: baslik,
                        karsiAd: btn.getAttribute('data-msg-karsi-ad') || ''
                    });
                });
            });
        }
        modalAc('mesajSohbetModal');
    }

    function ac(opts) {
        opts = opts || {};
        var isId = opts.isTalebiId || opts.isId;
        if (!isId) {
            toast('İş talebi bulunamadı.', 'error');
            return;
        }
        var me = uid();
        if (!me) {
            toast('Mesajlaşmak için giriş yapın.', 'error');
            if (global.Aurix && typeof Aurix.sayfaGoster === 'function') {
                Aurix.sayfaGoster('giris');
            }
            return;
        }

        if (opts.aliciId) {
            sohbetAc(isId, opts.aliciId, {
                baslik: opts.baslik || 'Sohbet',
                karsiAd: opts.karsiAd || ''
            });
            return;
        }

        karsiListe(isId).then(function (res) {
            if (!res.ok) {
                toast(res.error || 'Sohbet açılamadı.', 'error');
                return;
            }
            var karsilar = res.karsilar || [];
            if (karsilar.length === 1) {
                sohbetAc(isId, karsilar[0].user_id, {
                    baslik: res.baslik,
                    karsiAd: karsilar[0].ad || ''
                });
                return;
            }
            karsiSeciciGoster(isId, karsilar, res.baslik);
        });
    }

    function kapat() {
        dinlemeyiDurdur();
        state.pendingFile = null;
        modalKapat('mesajSohbetModal');
    }

    function onModalClosed() {
        dinlemeyiDurdur();
        state.pendingFile = null;
    }

    function gonderUi() {
        if (state.gonderiliyor || !state.isId || !state.aliciId) return;
        var ta = document.getElementById('mesajMetin');
        var metin = ta ? String(ta.value || '').trim() : '';
        var file = state.pendingFile;
        if (!metin && !file) {
            toast('Mesaj yazın veya dosya ekleyin.', 'info');
            return;
        }
        state.gonderiliyor = true;
        var btn = document.getElementById('mesajGonderBtn');
        if (btn) btn.disabled = true;

        var uploadP = file
            ? dosyaYukle(state.isId, file)
            : Promise.resolve({ ok: true, path: null });

        uploadP.then(function (up) {
            if (!up.ok) {
                toast(up.error || 'Dosya yüklenemedi.', 'error');
                return null;
            }
            return gonder(state.isId, state.aliciId, metin || null, up.path || null);
        }).then(function (res) {
            if (!res) return;
            if (!res.ok) {
                toast(res.error || 'Gönderilemedi.', 'error');
                return;
            }
            if (ta) ta.value = '';
            state.pendingFile = null;
            var dosyaInput = document.getElementById('mesajDosyaInput');
            if (dosyaInput) dosyaInput.value = '';
            var oniz = document.getElementById('mesajDosyaOnizleme');
            if (oniz) {
                oniz.hidden = true;
                oniz.innerHTML = '';
            }
            if (res.mesaj) {
                state.mesajlar = state.mesajlar.concat([res.mesaj]);
                renderMesajlar();
            } else {
                yenileMesajlar();
            }
        }).finally(function () {
            state.gonderiliyor = false;
            if (btn) btn.disabled = false;
        });
    }

    function panelListeHtml(konusmalar) {
        if (!konusmalar || !konusmalar.length) {
            return '<div class="fp-bos-kutu">' +
                '<p class="fp-bos-metin">Henüz sohbetiniz yok. İş talebi detayından veya teklif kartından mesaj başlatabilirsiniz.</p>' +
                '</div>';
        }
        return '<div class="msg-inbox">' +
            konusmalar.map(function (k) {
                var badge = (k.okunmamis > 0)
                    ? '<span class="msg-inbox__badge">' + esc(String(k.okunmamis)) + '</span>'
                    : '';
                return '<button type="button" class="msg-inbox__oge" data-msg-ac-is="' +
                    esc(String(k.is_talebi_id)) + '" data-msg-ac-karsi="' +
                    esc(String(k.karsi_id)) + '" data-msg-ac-baslik="' +
                    esc(k.baslik || 'Sohbet') + '" data-msg-ac-ad="' +
                    esc(k.karsi_ad || '') + '">' +
                    '<span class="msg-inbox__ust">' +
                    '<strong>' + esc(k.baslik || 'İş talebi') + '</strong>' + badge +
                    '</span>' +
                    '<span class="msg-inbox__alt">' + esc(k.karsi_ad || '') +
                    (k.son_mesaj ? ' · ' + esc(String(k.son_mesaj).slice(0, 80)) : '') +
                    '</span>' +
                    '</button>';
            }).join('') +
            '</div>';
    }

    function renderPanelMesajlar(container) {
        var el = container || document.getElementById('panelSekmeMesajlar');
        if (!el) return;
        el.innerHTML = '<div class="fp-bos-kutu"><p class="fp-bos-metin">Sohbetler yükleniyor…</p></div>';
        konusmalarim().then(function (res) {
            if (!el) return;
            if (!res.ok && (!res.konusmalar || !res.konusmalar.length)) {
                el.innerHTML = '<div class="fp-bos-kutu" role="alert">' +
                    '<p class="fp-bos-metin">' + esc(res.error || 'Sohbetler yüklenemedi.') + '</p></div>';
                return;
            }
            el.innerHTML = '<section class="fp-bolum">' +
                '<h3 class="fp-bolum__baslik">Mesajlar</h3>' +
                panelListeHtml(res.konusmalar) +
                '</section>';
            el.querySelectorAll('[data-msg-ac-is]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    ac({
                        isTalebiId: btn.getAttribute('data-msg-ac-is'),
                        aliciId: btn.getAttribute('data-msg-ac-karsi'),
                        baslik: btn.getAttribute('data-msg-ac-baslik'),
                        karsiAd: btn.getAttribute('data-msg-ac-ad')
                    });
                });
            });
        });
    }

    global.AurixMesajlasma = {
        ac: ac,
        kapat: kapat,
        onModalClosed: onModalClosed,
        karsiListe: karsiListe,
        konusmalarim: konusmalarim,
        renderPanelMesajlar: renderPanelMesajlar,
        ensureModal: ensureModal
    };
})(typeof window !== 'undefined' ? window : this);

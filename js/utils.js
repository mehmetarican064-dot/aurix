/**
 * AURIX — Güvenlik yardımcıları (XSS / URL)
 */
(function (global) {
    'use strict';

    var PH_MARKER = '__PH__';

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeUrl(url, fallback) {
        fallback = fallback == null ? '' : String(fallback);
        if (url == null || url === '') return fallback;
        var s = String(url).trim();
        if (/[\x00-\x1f\x7f]/.test(s)) return fallback;
        if (/^(javascript|data|vbscript|file):/i.test(s)) return fallback;
        if (/^https?:\/\//i.test(s)) return s;
        if (s.charAt(0) === '/' || s.charAt(0) === '.' || s.indexOf('assets/') === 0) return s;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
        return fallback;
    }

    function safeImageUrl(url, fallback) {
        fallback = fallback == null ? '' : String(fallback);
        if (url == null || url === '') return fallback;
        var s = String(url).trim();
        if (/[\x00-\x1f\x7f]/.test(s)) return fallback;
        /* Supabase Storage (firma logo/kapak) — yalnızca storage yolu */
        if (/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\//i.test(s)) return s;
        if (/^https?:\/\//i.test(s)) return fallback;
        if (s.indexOf('assets/') === 0) return s;
        return safeUrl(s, fallback) || fallback;
    }

    function safeCssClass(str, fallback) {
        fallback = fallback || 'default';
        var s = String(str || '').replace(/[^a-z0-9_-]/gi, '');
        return s || fallback;
    }

    function isFirmaKapakImg(img) {
        if (!img || img.tagName !== 'IMG') return false;
        if (img.classList.contains('firma-sektor-ph__logo')) return false;
        return !!img.closest('.firma-gorsel-alan');
    }

    function firmaGorselAlanDurum(img, phAktif) {
        var wrap = img.closest('.firma-gorsel-alan');
        if (!wrap) return;
        if (phAktif) {
            wrap.classList.remove('firma-gorsel-alan--ok');
            wrap.classList.add('firma-gorsel-alan--ph');
        } else {
            wrap.classList.add('firma-gorsel-alan--ok');
            wrap.classList.remove('firma-gorsel-alan--ph');
        }
    }

    function syncFirmaGorselAlanlar(root) {
        var scope = root || document;
        scope.querySelectorAll('.firma-gorsel-alan > img.aurix-img-fallback').forEach(function (img) {
            if (!isFirmaKapakImg(img)) return;
            if (img.getAttribute('data-force-ph') === '1') {
                firmaGorselAlanDurum(img, true);
                return;
            }
            if (img.complete && img.naturalWidth > 0) {
                firmaGorselAlanDurum(img, false);
            } else if (img.complete && !img.naturalWidth) {
                firmaGorselAlanDurum(img, true);
            }
        });
    }

    function refreshFirmaGorselleri(root) {
        var scope = root || document;
        scope.querySelectorAll('.firma-gorsel-alan > img.aurix-img-fallback').forEach(function (img) {
            if (!isFirmaKapakImg(img)) return;
            if (img.getAttribute('data-force-ph') === '1') {
                firmaGorselAlanDurum(img, true);
                return;
            }
            img.loading = 'eager';
            if (img.complete && img.naturalWidth > 0) {
                firmaGorselAlanDurum(img, false);
                return;
            }
            if (img.complete && !img.naturalWidth) {
                firmaGorselAlanDurum(img, true);
                return;
            }
            var src = img.getAttribute('src');
            if (src) {
                img.addEventListener('load', function onLoad() {
                    img.removeEventListener('load', onLoad);
                    firmaGorselAlanDurum(img, false);
                }, { once: true });
                img.addEventListener('error', function onErr() {
                    img.removeEventListener('error', onErr);
                    firmaGorselAlanDurum(img, true);
                }, { once: true });
            }
        });
        syncFirmaGorselAlanlar(scope);
    }

    function initImageFallbackHandler() {
        if (initImageFallbackHandler._bound) return;
        initImageFallbackHandler._bound = true;

        document.addEventListener('load', function (e) {
            var img = e.target;
            if (!isFirmaKapakImg(img)) return;
            if (img.getAttribute('data-force-ph') === '1') {
                firmaGorselAlanDurum(img, true);
                return;
            }
            firmaGorselAlanDurum(img, false);
        }, true);

        document.addEventListener('error', function (e) {
            var img = e.target;
            if (!img || img.tagName !== 'IMG' || !img.classList.contains('aurix-img-fallback')) return;
            if (img.dataset.fallbackApplied === '2') {
                if (isFirmaKapakImg(img)) firmaGorselAlanDurum(img, true);
                return;
            }
            if (img.dataset.fallbackApplied === '1') {
                var finalFb = img.getAttribute('data-fallback-final');
                if (finalFb === PH_MARKER || !finalFb) {
                    img.dataset.fallbackApplied = '2';
                    if (isFirmaKapakImg(img)) firmaGorselAlanDurum(img, true);
                    return;
                }
                img.dataset.fallbackApplied = '2';
                img.src = finalFb;
                return;
            }
            var fb = img.getAttribute('data-fallback-src');
            if (!fb) {
                if (isFirmaKapakImg(img)) {
                    img.dataset.fallbackApplied = '2';
                    firmaGorselAlanDurum(img, true);
                    return;
                }
                var removeOnly = img.getAttribute('data-remove-parent');
                if (removeOnly) {
                    var p = img.closest(removeOnly);
                    if (p) p.remove();
                }
                return;
            }
            if (fb === img.getAttribute('src')) {
                img.dataset.fallbackApplied = '2';
                if (isFirmaKapakImg(img)) firmaGorselAlanDurum(img, true);
                return;
            }
            img.dataset.fallbackApplied = '1';
            img.src = fb;
        }, true);
    }

    global.AurixUtils = {
        escapeHtml: escapeHtml,
        safeImageUrl: safeImageUrl,
        safeUrl: safeUrl,
        safeCssClass: safeCssClass,
        initImageFallbackHandler: initImageFallbackHandler,
        syncFirmaGorselAlanlar: syncFirmaGorselAlanlar,
        refreshFirmaGorselleri: refreshFirmaGorselleri,
        PH_MARKER: PH_MARKER
    };
})(typeof window !== 'undefined' ? window : this);

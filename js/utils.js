/**
 * AURIX — Güvenlik yardımcıları (XSS / URL)
 */
(function (global) {
    'use strict';

    var DEFAULT_IMG = 'assets/images/firma.svg';

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

    function isLocalAssetPath(url) {
        var s = String(url || '').trim();
        return s.indexOf('assets/') === 0 || (s.charAt(0) === '/' && s.indexOf('/assets/') !== -1);
    }

    function safeImageUrl(url, fallback) {
        fallback = fallback == null ? DEFAULT_IMG : String(fallback || DEFAULT_IMG);
        if (url == null || url === '') return fallback;
        var s = String(url).trim();
        if (/^https?:\/\//i.test(s)) return fallback;
        return safeUrl(s, fallback) || fallback;
    }

    function safeWhatsAppHref(tel) {
        var t = String(tel || '').replace(/\D/g, '');
        if (!/^90[0-9]{10}$/.test(t)) return '';
        return 'https://wa.me/' + t;
    }

    function safeCssClass(str, fallback) {
        fallback = fallback || 'default';
        var s = String(str || '').replace(/[^a-z0-9_-]/gi, '');
        return s || fallback;
    }

    function gorselPlaceholderGoster(img) {
        var wrap = img.parentElement;
        if (!wrap) return;
        wrap.classList.add('gorsel-alan--placeholder');
        img.classList.add('aurix-img-fallback--hidden');
        img.style.display = 'none';
        if (wrap.querySelector('.aurix-gorsel-placeholder')) return;
        var ph = document.createElement('div');
        ph.className = 'aurix-gorsel-placeholder';
        ph.setAttribute('aria-hidden', 'true');
        wrap.appendChild(ph);
    }

    function initImageFallbackHandler() {
        if (initImageFallbackHandler._bound) return;
        initImageFallbackHandler._bound = true;
        document.addEventListener('error', function (e) {
            var img = e.target;
            if (!img || img.tagName !== 'IMG' || !img.classList.contains('aurix-img-fallback')) return;
            if (img.dataset.fallbackApplied === '1') {
                var removeSel = img.getAttribute('data-remove-on-fail');
                if (removeSel) {
                    var removeTarget = img.closest(removeSel);
                    if (removeTarget) removeTarget.remove();
                    return;
                }
                gorselPlaceholderGoster(img);
                return;
            }
            var fb = safeImageUrl(img.getAttribute('data-fallback-src'), DEFAULT_IMG);
            img.dataset.fallbackApplied = '1';
            img.src = fb;
        }, true);
    }

    global.AurixUtils = {
        escapeHtml: escapeHtml,
        safeUrl: safeUrl,
        safeImageUrl: safeImageUrl,
        isLocalAssetPath: isLocalAssetPath,
        defaultImage: function () { return DEFAULT_IMG; },
        safeWhatsAppHref: safeWhatsAppHref,
        safeCssClass: safeCssClass,
        initImageFallbackHandler: initImageFallbackHandler
    };
})(typeof window !== 'undefined' ? window : this);

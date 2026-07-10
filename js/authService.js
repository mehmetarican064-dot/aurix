/**
 * AURIX Auth Service — mock (Beta v0.1)
 * v1.0'da yalnızca bu dosya Supabase Auth ile değiştirilecek.
 */
(function (global) {
    'use strict';

    /** Bellek içi oturum; sessionStorage/localStorage kullanılmaz. */
    var currentUser = null;

    /**
     * @param {string} email
     * @param {string} password
     * @returns {{ ok: boolean, user?: object, error?: string }}
     */
    function signIn(email, password, opts) {
        email = String(email || '').trim();
        password = String(password || '');
        opts = opts || {};

        if (!email) return { ok: false, error: 'E-posta adresi gerekli.' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { ok: false, error: 'Geçerli bir e-posta adresi girin.' };
        }
        if (!password || password.length < 4) {
            return { ok: false, error: 'Şifre en az 4 karakter olmalı.' };
        }

        // Mock kullanıcı — gerçek doğrulama yok; yalnızca panel iskeleti için.
        currentUser = {
            id: 'mock-' + Date.now().toString(36),
            email: email,
            role: opts.role === 'admin' ? 'user' : (opts.role || 'user'),
            displayName: opts.displayName || email.split('@')[0].replace(/[._-]/g, ' ')
        };

        return { ok: true, user: currentUser };
    }

    function signOut() {
        currentUser = null;
        return { ok: true };
    }

    function getCurrentUser() {
        return currentUser;
    }

    /** v1.0: profiles.role === 'admin' kontrolü Supabase üzerinden yapılacak. */
    function isAdmin() {
        return !!(currentUser && currentUser.role === 'admin');
    }

    global.AuthService = {
        signIn: signIn,
        signOut: signOut,
        getCurrentUser: getCurrentUser,
        isAdmin: isAdmin
    };
})(typeof window !== 'undefined' ? window : this);

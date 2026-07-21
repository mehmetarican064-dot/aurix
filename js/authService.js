/**
 * AURIX Auth Service — üretime hazır Supabase Auth (email / şifre)
 *
 * - Oturum localStorage’da kalıcı (persistSession + autoRefreshToken)
 * - Aynı e-posta ile ikinci hesap engeli (identities boş = obfuscated duplicate)
 * - E-posta doğrulama / şifre sıfırlama URL callback
 * - Auth ↔ profiles senkron (ensure_own_profile RPC + trigger)
 */
(function (global) {
    'use strict';

    var currentUser = null;
    var listeners = [];
    var readyPromise = null;
    var lastAuthEvent = null;
    var pendingAuthIntent = null;

    var MSG_DOGRULAMA =
        'E-posta adresinize doğrulama bağlantısı gönderildi. Bağlantıyı açtığınızda hesabınız doğrulanır ve otomatik olarak giriş yapılır.';
    var MSG_SIFRE_LINK =
        'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Gelen kutunuzu (ve spam klasörünü) kontrol edin.';

    var authStateSubscribed = false;
    var urlCallbackDone = false;

    /**
     * Auth redirect tabanı — ortama göre (hardcoded production yok).
     * - localhost / 127.0.0.1 → mevcut origin (port dahil)
     * - *.github.io → origin + repo path (project pages)
     * - aurixb2b.com / www → https://aurixb2b.com
     * - diğer → mevcut origin
     */
    function resolveAuthBase() {
        try {
            var loc = global.location;
            if (!loc || !loc.protocol || loc.protocol === 'file:') {
                return 'https://aurixb2b.com';
            }
            var host = String(loc.hostname || '').toLowerCase();
            var origin = String(loc.origin || '');

            if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
                return origin.replace(/\/$/, '');
            }

            if (host === 'aurixb2b.com' || host === 'www.aurixb2b.com') {
                return 'https://aurixb2b.com';
            }

            if (/\.github\.io$/i.test(host)) {
                var parts = String(loc.pathname || '/').split('/').filter(Boolean);
                if (parts.length >= 1 && !/\.(html?|js|css|png|jpg|svg|webp|ico)$/i.test(parts[0])) {
                    return (origin + '/' + parts[0]).replace(/\/$/, '');
                }
                return origin.replace(/\/$/, '');
            }

            return origin.replace(/\/$/, '') || 'https://aurixb2b.com';
        } catch (e) {
            return 'https://aurixb2b.com';
        }
    }

    function redirectUrl() {
        return resolveAuthBase();
    }

    function emailConfirmRedirect() {
        return resolveAuthBase() + '/?auth=confirmed';
    }

    function passwordRecoveryRedirect() {
        return resolveAuthBase() + '/?auth=recovery';
    }

    function getSb() {
        if (!global.AurixSupabase || typeof AurixSupabase.getClient !== 'function') {
            return null;
        }
        return AurixSupabase.getClient();
    }

    function turkceAuthHata(err) {
        if (!err) return 'İşlem başarısız.';
        var msg = String(err.message || err.error_description || err.error || err || '');
        var status = err.status || err.statusCode || 0;
        var code = String(err.code || '');

        if (/Email not confirmed|email_not_confirmed|email_not_confirmed/i.test(msg + code)) {
            return 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzdaki bağlantıyı açın veya yeni bağlantı isteyin.';
        }
        if (/Invalid login credentials|invalid_credentials|Invalid login/i.test(msg + code)) {
            return 'E-posta veya şifre hatalı.';
        }
        if (/User already registered|already been registered|already registered|email_exists|user_already_exists/i.test(msg + code)) {
            return 'Bu e-posta ile zaten bir hesap var. Giriş yapın veya “Şifremi unuttum” kullanın.';
        }
        if (/Password should be at least|password.*at least|weak_password|Password is known/i.test(msg + code)) {
            return 'Şifre en az 8 karakter olmalı ve kolay tahmin edilememelidir.';
        }
        if (/Signup requires a valid password/i.test(msg)) {
            return 'Geçerli bir şifre girin (en az 8 karakter).';
        }
        if (/same_password|New password should be different/i.test(msg + code)) {
            return 'Yeni şifre eskisiyle aynı olamaz.';
        }
        if (/rate limit|too many requests|over_email_send_rate_limit|429/i.test(msg + code) || status === 429) {
            return 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.';
        }
        if (/Token has expired|otp_expired|expired|flow_state.*expired/i.test(msg + code)) {
            return 'Bağlantının süresi dolmuş. Lütfen yeni bir bağlantı isteyin.';
        }
        if (/Email rate limit|email_send/i.test(msg + code)) {
            return 'E-posta gönderim limiti aşıldı. Lütfen bir süre sonra tekrar deneyin.';
        }
        if (/network|Failed to fetch|Load failed|NetworkError/i.test(msg)) {
            return 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.';
        }
        if (/For security purposes|only request this after/i.test(msg)) {
            return 'Güvenlik nedeniyle kısa süre bekleyip tekrar deneyin.';
        }
        if (status === 400 && /password/i.test(msg)) {
            return 'Şifre geçersiz. En az 8 karakter kullanın.';
        }
        if (status === 400 && /login|credential|invalid/i.test(msg)) {
            return 'E-posta veya şifre hatalı.';
        }
        if (msg && /[çğıöşüÇĞİÖŞÜ]/.test(msg)) return msg;
        return 'İşlem başarısız. Lütfen bilgilerinizi kontrol edip tekrar deneyin.';
    }

    function emailGecerliMi(email) {
        return !!(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    }

    function sifreGecerliMi(password) {
        return typeof password === 'string' && password.length >= 8 && password.length <= 72;
    }

    /** Confirm-email açıkken duplicate signup obfuscated user döner (identities: []). */
    function isDuplicateSignupUser(user) {
        if (!user) return false;
        var identities = user.identities;
        if (Array.isArray(identities) && identities.length === 0) return true;
        return false;
    }

    function emailOnayliMi(user) {
        if (!user) return false;
        return !!(user.email_confirmed_at || user.confirmed_at);
    }

    function mapUser(sessionUser, profile) {
        if (!sessionUser) return null;
        var meta = sessionUser.user_metadata || {};
        var hesapTipi = (profile && profile.hesap_tipi) || 'normal';
        if (hesapTipi !== 'firma') hesapTipi = 'normal';
        return {
            id: sessionUser.id,
            email: sessionUser.email || '',
            displayName: (profile && profile.ad_soyad) || meta.ad_soyad || meta.full_name ||
                (sessionUser.email ? sessionUser.email.split('@')[0] : 'Kullanıcı'),
            telefon: (profile && profile.telefon) || meta.telefon || '',
            role: (profile && profile.role) || 'user',
            hesapTipi: hesapTipi,
            isFirmaHesabi: hesapTipi === 'firma',
            emailConfirmed: emailOnayliMi(sessionUser)
        };
    }

    function profilYukle(userId) {
        var sb = getSb();
        if (!sb || !userId) return Promise.resolve(null);
        function dene(cols) {
            return sb.from('profiles')
                .select(cols)
                .eq('id', userId)
                .maybeSingle();
        }
        return dene('id,ad_soyad,telefon,role,hesap_tipi,created_at')
            .then(function (res) {
                if (res.error && /hesap_tipi|column/i.test(String(res.error.message || ''))) {
                    return dene('id,ad_soyad,telefon,role,created_at');
                }
                return res;
            })
            .then(function (res) {
                if (res.error && /role|column|PGRST/i.test(String(res.error.message || ''))) {
                    return null;
                }
                return res;
            })
            .then(function (res) {
                if (!res || res.error) return null;
                return res.data || null;
            })
            .catch(function () { return null; });
    }

    /** profiles satırını garanti et (RPC yoksa sadece SELECT). */
    function ensureProfil(sessionUser) {
        if (!sessionUser || !sessionUser.id) return Promise.resolve(null);
        var sb = getSb();
        if (!sb) return Promise.resolve(null);

        return sb.rpc('ensure_own_profile').then(function (res) {
            if (!res.error && res.data) {
                return Array.isArray(res.data) ? (res.data[0] || null) : res.data;
            }
            return profilYukle(sessionUser.id);
        }).catch(function () {
            return profilYukle(sessionUser.id);
        });
    }

    function setCurrentFromSession(session) {
        if (!session || !session.user) {
            currentUser = null;
            return Promise.resolve(null);
        }
        return ensureProfil(session.user).then(function (profile) {
            currentUser = mapUser(session.user, profile);
            return currentUser;
        });
    }

    function notify(eventName) {
        lastAuthEvent = eventName || lastAuthEvent;
        listeners.forEach(function (fn) {
            try { fn(currentUser, lastAuthEvent); } catch (e) { /* ignore */ }
        });
    }

    function onAuthStateChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
        return function () {
            listeners = listeners.filter(function (f) { return f !== fn; });
        };
    }

    function parseAuthIntentFromLocation() {
        try {
            var search = new URLSearchParams(global.location.search || '');
            var hashRaw = String(global.location.hash || '').replace(/^#/, '');
            var hash = new URLSearchParams(hashRaw);
            var authQ = (search.get('auth') || '').toLowerCase();
            var typeH = (hash.get('type') || search.get('type') || '').toLowerCase();

            if (authQ === 'recovery' || typeH === 'recovery') return 'recovery';
            if (authQ === 'confirmed' || typeH === 'signup' || typeH === 'email' ||
                typeH === 'magiclink' || typeH === 'invite') {
                return 'confirmed';
            }
            if (search.get('code') && !typeH) return 'confirmed';
            if (hash.get('access_token') && typeH) {
                return typeH === 'recovery' ? 'recovery' : 'confirmed';
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function authCallbackParamsVarMi() {
        try {
            var search = new URLSearchParams(global.location.search || '');
            var hash = new URLSearchParams(String(global.location.hash || '').replace(/^#/, ''));
            return !!(
                search.get('code') ||
                search.get('token_hash') ||
                search.get('error') ||
                search.get('error_description') ||
                hash.get('access_token') ||
                hash.get('error') ||
                hash.get('error_description') ||
                hash.get('type')
            );
        } catch (e) {
            return false;
        }
    }

    function cleanAuthUrl() {
        try {
            var url = new URL(global.location.href);
            var dirty = false;
            [
                'auth', 'code', 'type', 'token_hash', 'error', 'error_description', 'error_code'
            ].forEach(function (k) {
                if (url.searchParams.has(k)) {
                    url.searchParams.delete(k);
                    dirty = true;
                }
            });
            if (url.hash && /(access_token|refresh_token|type=|error=|token_type=)/i.test(url.hash)) {
                url.hash = '';
                dirty = true;
            }
            if (dirty && global.history && typeof global.history.replaceState === 'function') {
                var next = url.pathname + (url.search || '');
                if (!next || next === '') next = '/';
                global.history.replaceState({}, document.title, next);
            }
        } catch (e) { /* ignore */ }
    }

    /**
     * Doğrulama / OAuth dönüşü:
     * 1) URLSearchParams → code
     * 2) code varsa exchangeCodeForSession
     * 3) başarılıysa URL temizle + getSession
     */
    function recoverSessionFromUrl(sb) {
        if (!sb) return Promise.resolve(null);
        if (urlCallbackDone) {
            return sb.auth.getSession().then(function (res) {
                return res && res.data ? res.data.session : null;
            });
        }

        var params = new URLSearchParams(global.location.search || '');
        var hash = new URLSearchParams(String(global.location.hash || '').replace(/^#/, ''));
        var errDesc = params.get('error_description') || hash.get('error_description') ||
            params.get('error') || hash.get('error');

        if (errDesc) {
            urlCallbackDone = true;
            try { console.error('auth callback', errDesc); } catch (e) { /* ignore */ }
            cleanAuthUrl();
            return Promise.resolve(null);
        }

        var code = params.get('code');
        var tokenHash = params.get('token_hash');
        var otpType = (params.get('type') || hash.get('type') || '').toLowerCase();
        var authHint = String(params.get('auth') || '').toLowerCase();

        function markIntent() {
            if (pendingAuthIntent) return;
            if (otpType === 'recovery' || authHint === 'recovery') {
                pendingAuthIntent = 'recovery';
            } else if (code || tokenHash || authHint === 'confirmed' ||
                otpType === 'signup' || otpType === 'email' || otpType === 'invite') {
                pendingAuthIntent = 'confirmed';
            }
        }

        function finishWithSession(session) {
            urlCallbackDone = true;
            markIntent();
            cleanAuthUrl();
            return session || null;
        }

        /* 1–2) code varsa tek seferlik exchange (PKCE code bir kez tüketilir) */
        if (code) {
            urlCallbackDone = true;
            markIntent();
            return sb.auth.exchangeCodeForSession(code).then(function (ex) {
                if (ex.error) {
                    try { console.error('exchangeCodeForSession', ex.error); } catch (e) { /* ignore */ }
                    cleanAuthUrl();
                    return sb.auth.getSession().then(function (res) {
                        return (res && res.data ? res.data.session : null) || null;
                    });
                }
                var session = ex.data && ex.data.session;
                cleanAuthUrl();
                return sb.auth.getSession().then(function (res) {
                    var s2 = res && res.data ? res.data.session : null;
                    return s2 || session || null;
                });
            }).catch(function (err) {
                try { console.error('exchangeCodeForSession', err); } catch (e) { /* ignore */ }
                cleanAuthUrl();
                return sb.auth.getSession().then(function (res) {
                    return res && res.data ? res.data.session : null;
                });
            });
        }

        /* token_hash (alternatif e-posta şablonu) */
        if (tokenHash && otpType) {
            return sb.auth.verifyOtp({ token_hash: tokenHash, type: otpType }).then(function (vr) {
                if (vr.error) {
                    try { console.error('verifyOtp', vr.error); } catch (e) { /* ignore */ }
                    urlCallbackDone = true;
                    cleanAuthUrl();
                    return null;
                }
                finishWithSession(vr.data && vr.data.session);
                return sb.auth.getSession().then(function (res) {
                    return (res && res.data && res.data.session) || (vr.data && vr.data.session) || null;
                });
            }).catch(function (err) {
                try { console.error('verifyOtp', err); } catch (e) { /* ignore */ }
                urlCallbackDone = true;
                cleanAuthUrl();
                return null;
            });
        }

        /* 4) Normal / kalıcı oturum */
        return sb.auth.getSession().then(function (res) {
            var session = res && res.data ? res.data.session : null;
            if (authHint || hash.get('access_token')) {
                markIntent();
                if (hash.get('access_token') || authHint) cleanAuthUrl();
                urlCallbackDone = true;
            }
            return session || null;
        }).catch(function () {
            urlCallbackDone = true;
            return null;
        });
    }

    function consumeAuthIntent() {
        var intent = pendingAuthIntent;
        pendingAuthIntent = null;
        return intent;
    }

    function peekAuthIntent() {
        return pendingAuthIntent;
    }

    function getLastAuthEvent() {
        return lastAuthEvent;
    }

    function init() {
        if (readyPromise) return readyPromise;
        var sb = getSb();
        if (!sb) {
            readyPromise = Promise.resolve(null);
            return readyPromise;
        }

        pendingAuthIntent = parseAuthIntentFromLocation();

        /* Listener’ı exchange’den önce bağla — SIGNED_IN kaçmasın */
        if (!authStateSubscribed) {
            authStateSubscribed = true;
            sb.auth.onAuthStateChange(function (event, session) {
                lastAuthEvent = event;
                if (event === 'PASSWORD_RECOVERY') {
                    pendingAuthIntent = 'recovery';
                }
                if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    notify(event);
                    return;
                }
                setCurrentFromSession(session).then(function () {
                    notify(event);
                });
            });
        }

        readyPromise = recoverSessionFromUrl(sb).then(function (session) {
            /* Her durumda getSession ile doğrula */
            return sb.auth.getSession().then(function (res) {
                var s = (res && res.data && res.data.session) || session || null;
                return setCurrentFromSession(s);
            });
        }).catch(function () {
            currentUser = null;
            return null;
        });

        return readyPromise;
    }

    function signUp(opts) {
        opts = opts || {};
        var email = String(opts.email || '').trim().toLowerCase();
        var password = String(opts.password || '');
        var password2 = String(opts.passwordAgain || opts.passwordConfirm || '');
        var adSoyad = String(opts.adSoyad || opts.ad_soyad || '').trim();
        var telefon = String(opts.telefon || '').trim();

        if (adSoyad.length < 2) {
            return Promise.resolve({ ok: false, error: 'Ad soyad en az 2 karakter olmalı.' });
        }
        if (!emailGecerliMi(email)) {
            return Promise.resolve({ ok: false, error: 'Geçerli bir e-posta girin.' });
        }
        if (!sifreGecerliMi(password)) {
            return Promise.resolve({ ok: false, error: 'Şifre en az 8 karakter olmalı.' });
        }
        if (password !== password2) {
            return Promise.resolve({ ok: false, error: 'Şifreler eşleşmiyor.' });
        }

        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }

        return sb.auth.signUp({
            email: email,
            password: password,
            options: {
                emailRedirectTo: emailConfirmRedirect(),
                data: {
                    ad_soyad: adSoyad,
                    telefon: telefon || null
                }
            }
        }).then(function (res) {
            if (res.error) {
                return { ok: false, error: turkceAuthHata(res.error) };
            }
            var data = res.data || {};
            var session = data.session;
            var user = data.user;

            /* Aynı e-posta — confirm açıkken fake user (identities: []) */
            if (isDuplicateSignupUser(user)) {
                return {
                    ok: false,
                    error: 'Bu e-posta ile zaten bir hesap var. Giriş yapın veya “Şifremi unuttum” kullanın.',
                    alreadyRegistered: true,
                    email: email
                };
            }

            if (!user) {
                return { ok: false, error: 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.' };
            }

            /* Tipik akış: doğrulama zorunlu → session yok */
            if (!session) {
                return {
                    ok: true,
                    needsEmailConfirmation: true,
                    email: email,
                    message: MSG_DOGRULAMA,
                    user: mapUser(user, null)
                };
            }

            /* Session geldi ama e-posta onaylı değil → oturumu kapat, doğrulama iste */
            if (!emailOnayliMi(session.user)) {
                return sb.auth.signOut({ scope: 'local' }).then(function () {
                    currentUser = null;
                    notify('SIGNED_OUT');
                    return {
                        ok: true,
                        needsEmailConfirmation: true,
                        email: email,
                        message: MSG_DOGRULAMA
                    };
                });
            }

            return setCurrentFromSession(session).then(function (u) {
                notify('SIGNED_IN');
                return { ok: true, user: u, needsEmailConfirmation: false };
            });
        }).catch(function (err) {
            return { ok: false, error: turkceAuthHata(err) };
        });
    }

    function signIn(email, password) {
        email = String(email || '').trim().toLowerCase();
        password = String(password || '');

        if (!emailGecerliMi(email)) {
            return Promise.resolve({ ok: false, error: 'Geçerli bir e-posta adresi girin.' });
        }
        if (!password) {
            return Promise.resolve({ ok: false, error: 'Şifrenizi girin.' });
        }
        if (password.length < 8) {
            return Promise.resolve({ ok: false, error: 'Şifre en az 8 karakter olmalı.' });
        }

        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }

        return sb.auth.signInWithPassword({ email: email, password: password })
            .then(function (res) {
                if (res.error) {
                    try { console.error('signIn', res.error); } catch (e) { /* ignore */ }
                    var msg = String(res.error.message || '');
                    if (/Email not confirmed|email_not_confirmed/i.test(msg)) {
                        return {
                            ok: false,
                            needsEmailConfirmation: true,
                            email: email,
                            error: 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzdaki bağlantıyı açın veya yeni bağlantı isteyin.'
                        };
                    }
                    return { ok: false, error: turkceAuthHata(res.error) };
                }
                var session = res.data && res.data.session;
                var user = session && session.user;
                if (user && !emailOnayliMi(user)) {
                    return sb.auth.signOut({ scope: 'local' }).then(function () {
                        currentUser = null;
                        notify('SIGNED_OUT');
                        return {
                            ok: false,
                            needsEmailConfirmation: true,
                            email: email,
                            error: 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzdaki bağlantıyı açın veya yeni bağlantı isteyin.'
                        };
                    });
                }
                return setCurrentFromSession(session).then(function (u) {
                    notify('SIGNED_IN');
                    return { ok: true, user: u };
                });
            })
            .catch(function (err) {
                return { ok: false, error: turkceAuthHata(err) };
            });
    }

    function resendSignupEmail(email) {
        email = String(email || '').trim().toLowerCase();
        if (!emailGecerliMi(email)) {
            return Promise.resolve({ ok: false, error: 'Geçerli bir e-posta girin.' });
        }
        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }
        return sb.auth.resend({
            type: 'signup',
            email: email,
            options: {
                emailRedirectTo: emailConfirmRedirect()
            }
        }).then(function (res) {
            if (res.error) return { ok: false, error: turkceAuthHata(res.error) };
            return { ok: true, message: MSG_DOGRULAMA };
        }).catch(function (err) {
            return { ok: false, error: turkceAuthHata(err) };
        });
    }

    function signOut() {
        var sb = getSb();
        currentUser = null;
        if (!sb) {
            notify('SIGNED_OUT');
            return Promise.resolve({ ok: true });
        }
        return sb.auth.signOut({ scope: 'local' }).then(function () {
            notify('SIGNED_OUT');
            return { ok: true };
        }).catch(function () {
            notify('SIGNED_OUT');
            return { ok: true };
        });
    }

    function resetPasswordForEmail(email) {
        email = String(email || '').trim().toLowerCase();
        if (!emailGecerliMi(email)) {
            return Promise.resolve({ ok: false, error: 'Geçerli bir e-posta girin.' });
        }
        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }
        return sb.auth.resetPasswordForEmail(email, {
            redirectTo: passwordRecoveryRedirect()
        }).then(function (res) {
            if (res.error) return { ok: false, error: turkceAuthHata(res.error) };
            /* Güvenlik: e-posta yoksa da aynı mesaj (enumeration engeli) */
            return { ok: true, message: MSG_SIFRE_LINK };
        }).catch(function (err) {
            return { ok: false, error: turkceAuthHata(err) };
        });
    }

    /** Recovery oturumu varken yeni şifre belirle */
    function updatePassword(password, passwordAgain) {
        password = String(password || '');
        passwordAgain = String(passwordAgain || '');
        if (!sifreGecerliMi(password)) {
            return Promise.resolve({ ok: false, error: 'Yeni şifre en az 8 karakter olmalı.' });
        }
        if (password !== passwordAgain) {
            return Promise.resolve({ ok: false, error: 'Şifreler eşleşmiyor.' });
        }
        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }
        return sb.auth.updateUser({ password: password }).then(function (res) {
            if (res.error) return { ok: false, error: turkceAuthHata(res.error) };
            return sb.auth.getSession().then(function (sRes) {
                var session = sRes && sRes.data ? sRes.data.session : null;
                return setCurrentFromSession(session).then(function (u) {
                    notify('USER_UPDATED');
                    return {
                        ok: true,
                        user: u,
                        message: 'Şifreniz güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.'
                    };
                });
            });
        }).catch(function (err) {
            return { ok: false, error: turkceAuthHata(err) };
        });
    }

    function refreshProfile() {
        if (!currentUser || !currentUser.id) return Promise.resolve(null);
        var sb = getSb();
        if (!sb) return Promise.resolve(currentUser);
        return sb.auth.getSession().then(function (res) {
            var session = res && res.data ? res.data.session : null;
            return setCurrentFromSession(session).then(function (u) {
                notify('USER_UPDATED');
                return u;
            });
        }).catch(function () { return currentUser; });
    }

    function getSession() {
        var sb = getSb();
        if (!sb) return Promise.resolve(null);
        return sb.auth.getSession().then(function (res) {
            return res && res.data ? res.data.session : null;
        }).catch(function () { return null; });
    }

    function getCurrentUser() {
        return currentUser;
    }

    function isReady() {
        return readyPromise || Promise.resolve(null);
    }

    function isAdmin() {
        return !!(currentUser && currentUser.role === 'admin');
    }

    global.AuthService = {
        init: init,
        isReady: isReady,
        signUp: signUp,
        signIn: signIn,
        signOut: signOut,
        resetPasswordForEmail: resetPasswordForEmail,
        updatePassword: updatePassword,
        resendSignupEmail: resendSignupEmail,
        getSession: getSession,
        getCurrentUser: getCurrentUser,
        refreshProfile: refreshProfile,
        isAdmin: isAdmin,
        onAuthStateChange: onAuthStateChange,
        redirectUrl: redirectUrl,
        emailConfirmRedirect: emailConfirmRedirect,
        passwordRecoveryRedirect: passwordRecoveryRedirect,
        resolveAuthBase: resolveAuthBase,
        consumeAuthIntent: consumeAuthIntent,
        peekAuthIntent: peekAuthIntent,
        getLastAuthEvent: getLastAuthEvent,
        get EMAIL_CONFIRM_REDIRECT() { return emailConfirmRedirect(); },
        get PASSWORD_RECOVERY_REDIRECT() { return passwordRecoveryRedirect(); },
        get SITE_ORIGIN() { return resolveAuthBase(); }
    };
})(typeof window !== 'undefined' ? window : this);

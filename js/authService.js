/**
 * AURIX Auth Service — Supabase Auth (email / şifre)
 * Oturum localStorage’da Supabase istemcisi tarafından saklanır (persistSession).
 */
(function (global) {
    'use strict';

    var currentUser = null;
    var listeners = [];
    var readyPromise = null;

    /** E-posta doğrulama / kayıt linkleri her zaman canlı siteye dönsün */
    var EMAIL_REDIRECT_TO = 'https://aurixb2b.com';

    function redirectUrl() {
        return EMAIL_REDIRECT_TO;
    }

    function getSb() {
        if (!global.AurixSupabase || typeof AurixSupabase.getClient !== 'function') {
            return null;
        }
        return AurixSupabase.getClient();
    }

    function turkceAuthHata(err) {
        if (!err) return 'İşlem başarısız.';
        var msg = String(err.message || err.error_description || err || '');
        var status = err.status || err.statusCode || 0;
        if (/Email not confirmed|email_not_confirmed/i.test(msg)) {
            return 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzdaki bağlantıyı açın.';
        }
        if (/Invalid login credentials|invalid_credentials|Invalid login/i.test(msg)) {
            return 'E-posta veya şifre hatalı.';
        }
        if (/User already registered|already been registered|already registered/i.test(msg)) {
            return 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.';
        }
        if (/Password should be at least|password.*at least|weak_password/i.test(msg)) {
            return 'Şifre en az 8 karakter olmalı.';
        }
        if (/Signup requires a valid password/i.test(msg)) {
            return 'Geçerli bir şifre girin (en az 8 karakter).';
        }
        if (/rate limit|too many requests|over_email_send_rate_limit/i.test(msg)) {
            return 'Çok fazla e-posta gönderildi. Lütfen bir süre sonra tekrar deneyin.';
        }
        if (/Token has expired|expired|otp_expired/i.test(msg)) {
            return 'Doğrulama bağlantısının süresi dolmuş. Yeni bağlantı isteyin.';
        }
        if (/network|Failed to fetch|Load failed/i.test(msg)) {
            return 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.';
        }
        if (status === 400 && /confirm/i.test(msg)) {
            return 'E-posta veya şifre hatalı.';
        }
        if (msg && /[çğıöşüÇĞİÖŞÜ]/.test(msg)) return msg;
        return 'İşlem başarısız. Lütfen bilgilerinizi kontrol edip tekrar deneyin.';
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
            role: (profile && profile.rol) || 'kullanici',
            hesapTipi: hesapTipi,
            isFirmaHesabi: hesapTipi === 'firma',
            emailConfirmed: !!(sessionUser.email_confirmed_at || sessionUser.confirmed_at)
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
        return dene('id,ad_soyad,telefon,rol,hesap_tipi,created_at')
            .then(function (res) {
                if (res.error && /hesap_tipi|column/i.test(String(res.error.message || ''))) {
                    return dene('id,ad_soyad,telefon,rol,created_at');
                }
                return res;
            })
            .then(function (res) {
                if (res.error) return null;
                return res.data || null;
            })
            .catch(function () { return null; });
    }

    /** Profil / hesap tipini oturumdan yeniden yükler (firma hesabı sonrası). */
    function refreshProfile() {
        if (!currentUser || !currentUser.id) return Promise.resolve(null);
        var sb = getSb();
        if (!sb) return Promise.resolve(currentUser);
        return sb.auth.getSession().then(function (res) {
            var session = res && res.data ? res.data.session : null;
            return setCurrentFromSession(session).then(function (u) {
                notify();
                return u;
            });
        }).catch(function () { return currentUser; });
    }

    function setCurrentFromSession(session) {
        if (!session || !session.user) {
            currentUser = null;
            return Promise.resolve(null);
        }
        return profilYukle(session.user.id).then(function (profile) {
            currentUser = mapUser(session.user, profile);
            return currentUser;
        });
    }

    function notify() {
        listeners.forEach(function (fn) {
            try { fn(currentUser); } catch (e) { /* ignore */ }
        });
    }

    function onAuthStateChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
        return function () {
            listeners = listeners.filter(function (f) { return f !== fn; });
        };
    }

    function init() {
        if (readyPromise) return readyPromise;
        var sb = getSb();
        if (!sb) {
            readyPromise = Promise.resolve(null);
            return readyPromise;
        }

        readyPromise = sb.auth.getSession().then(function (res) {
            var session = res && res.data ? res.data.session : null;
            return setCurrentFromSession(session);
        }).catch(function () {
            currentUser = null;
            return null;
        }).then(function (user) {
            sb.auth.onAuthStateChange(function (_event, session) {
                setCurrentFromSession(session).then(function () {
                    notify();
                });
            });
            return user;
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
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return Promise.resolve({ ok: false, error: 'Geçerli bir e-posta girin.' });
        }
        if (password.length < 8) {
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
                emailRedirectTo: EMAIL_REDIRECT_TO,
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
            var EMAIL_DOGRULAMA_MESAJ =
                'E-posta adresinize doğrulama bağlantısı gönderildi. E-postanızı doğruladıktan sonra giriş yapın.';
            /* Email confirmation açıksa session null olabilir — firma insert yapılmaz */
            if (!session && user) {
                return {
                    ok: true,
                    needsEmailConfirmation: true,
                    email: email,
                    message: EMAIL_DOGRULAMA_MESAJ,
                    user: mapUser(user, null)
                };
            }
            /* Confirmation kapalıysa bile e-posta onaylanmamışsa girişe izin verme */
            if (session && session.user && !session.user.email_confirmed_at && !session.user.confirmed_at) {
                return sb.auth.signOut().then(function () {
                    currentUser = null;
                    notify();
                    return {
                        ok: true,
                        needsEmailConfirmation: true,
                        email: email,
                        message: EMAIL_DOGRULAMA_MESAJ
                    };
                });
            }
            return setCurrentFromSession(session).then(function (u) {
                notify();
                return { ok: true, user: u, needsEmailConfirmation: false };
            });
        }).catch(function (err) {
            return { ok: false, error: turkceAuthHata(err) };
        });
    }

    function signIn(email, password) {
        email = String(email || '').trim().toLowerCase();
        password = String(password || '');

        if (!email) return Promise.resolve({ ok: false, error: 'E-posta adresi gerekli.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return Promise.resolve({ ok: false, error: 'Geçerli bir e-posta adresi girin.' });
        }
        if (!password || password.length < 8) {
            return Promise.resolve({ ok: false, error: 'Şifre en az 8 karakter olmalı.' });
        }

        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }

        var EMAIL_DOGRULAMA_MESAJ =
            'E-posta adresinize doğrulama bağlantısı gönderildi. E-postanızı doğruladıktan sonra giriş yapın.';

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
                            error: EMAIL_DOGRULAMA_MESAJ
                        };
                    }
                    return { ok: false, error: turkceAuthHata(res.error) };
                }
                var session = res.data && res.data.session;
                var user = session && session.user;
                if (user && !user.email_confirmed_at && !user.confirmed_at) {
                    return sb.auth.signOut().then(function () {
                        currentUser = null;
                        notify();
                        return {
                            ok: false,
                            needsEmailConfirmation: true,
                            email: email,
                            error: EMAIL_DOGRULAMA_MESAJ
                        };
                    });
                }
                return setCurrentFromSession(session).then(function (u) {
                    notify();
                    return { ok: true, user: u };
                });
            })
            .catch(function (err) {
                return { ok: false, error: turkceAuthHata(err) };
            });
    }

    /** Kayıt doğrulama e-postasını yeniden gönder */
    function resendSignupEmail(email) {
        email = String(email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
                emailRedirectTo: EMAIL_REDIRECT_TO
            }
        }).then(function (res) {
            if (res.error) return { ok: false, error: turkceAuthHata(res.error) };
            return {
                ok: true,
                message: 'E-posta adresinize doğrulama bağlantısı gönderildi. E-postanızı doğruladıktan sonra giriş yapın.'
            };
        }).catch(function (err) {
            return { ok: false, error: turkceAuthHata(err) };
        });
    }

    function signOut() {
        var sb = getSb();
        currentUser = null;
        if (!sb) {
            notify();
            return Promise.resolve({ ok: true });
        }
        return sb.auth.signOut().then(function () {
            notify();
            return { ok: true };
        }).catch(function () {
            notify();
            return { ok: true };
        });
    }

    function resetPasswordForEmail(email) {
        email = String(email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return Promise.resolve({ ok: false, error: 'Geçerli bir e-posta girin.' });
        }
        var sb = getSb();
        if (!sb) {
            return Promise.resolve({ ok: false, error: 'Bağlantı kurulamadı. Sayfayı yenileyip tekrar deneyin.' });
        }
        return sb.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl()
        }).then(function (res) {
            if (res.error) return { ok: false, error: turkceAuthHata(res.error) };
            return {
                ok: true,
                message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
            };
        }).catch(function (err) {
            return { ok: false, error: turkceAuthHata(err) };
        });
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

    function isAdmin() {
        return !!(currentUser && currentUser.role === 'admin');
    }

    global.AuthService = {
        init: init,
        signUp: signUp,
        signIn: signIn,
        signOut: signOut,
        resetPasswordForEmail: resetPasswordForEmail,
        resendSignupEmail: resendSignupEmail,
        getSession: getSession,
        getCurrentUser: getCurrentUser,
        refreshProfile: refreshProfile,
        isAdmin: isAdmin,
        onAuthStateChange: onAuthStateChange,
        redirectUrl: redirectUrl
    };
})(typeof window !== 'undefined' ? window : this);

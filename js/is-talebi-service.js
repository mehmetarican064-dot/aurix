/**
 * AURIX — İş Talebi veri servisi (Supabase RPC + Storage)
 * RPC/bucket yoksa { ok:false, error } döner; throw etmez.
 */
(function (global) {
    'use strict';

    var MAX_FILES = 10;
    var MAX_FILE_BYTES = 25 * 1024 * 1024;
    var MAX_TOTAL_BYTES = 100 * 1024 * 1024;
    var BUCKET = 'is-talebi-dosyalari';

    var IMAGE_EXTS = { jpg: 1, jpeg: 1, png: 1, webp: 1 };
    var TECH_EXTS = { stl: 1, '3dm': 1, obj: 1, step: 1, stp: 1, pdf: 1 };
    var ALLOWED_EXTS = Object.assign({}, IMAGE_EXTS, TECH_EXTS);

    var IMAGE_MIMES = {
        'image/jpeg': 1,
        'image/jpg': 1,
        'image/png': 1,
        'image/webp': 1
    };

    function getSb() {
        if (!global.AurixSupabase || typeof AurixSupabase.getClient !== 'function') return null;
        return AurixSupabase.getClient();
    }

    function rpcMissing(err) {
        var msg = String((err && (err.message || err.error_description || err)) || '');
        return /function.*does not exist|PGRST202|Could not find the function|schema cache/i.test(msg);
    }

    function bucketMissing(err) {
        var msg = String((err && (err.message || err.error_description || err)) || '');
        return /bucket not found|No such bucket|Bucket not found/i.test(msg);
    }

    function hataMesaji(err, fallback) {
        if (!err) return fallback || 'İşlem başarısız.';
        var msg = String(err.message || err.error_description || err || '');
        if (rpcMissing(err)) {
            return 'İş talebi API henüz hazır değil. Migration 028 uygulanmalı.';
        }
        if (bucketMissing(err)) {
            return 'Dosya deposu (is-talebi-dosyalari) henüz yapılandırılmamış.';
        }
        if (/JWT|not authenticated|oturum|session|401/i.test(msg)) {
            return 'Bu işlem için giriş yapmanız gerekir.';
        }
        if (/network|Failed to fetch|Load failed/i.test(msg)) {
            return 'Bağlantı kurulamadı. İnternetinizi kontrol edin.';
        }
        if (/duplicate|istemci_anahtar|unique/i.test(msg)) {
            return 'Bu talep zaten kaydedilmiş görünüyor.';
        }
        if (/permission|42501|RLS|row-level/i.test(msg)) {
            return 'Bu işlem için yetkiniz bulunmuyor.';
        }
        return msg.length < 200 ? msg : (fallback || 'İşlem başarısız. Lütfen tekrar deneyin.');
    }

    function fail(error, extra) {
        return Object.assign({ ok: false, error: error || 'İşlem başarısız.' }, extra || {});
    }

    function ok(data) {
        return Object.assign({ ok: true, error: null }, data || {});
    }

    function extOf(name) {
        var parts = String(name || '').split('.');
        if (parts.length < 2) return '';
        return parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function sanitizeFileName(name) {
        var raw = String(name || 'dosya').trim();
        var ext = extOf(raw);
        var base = raw.replace(/\.[^.]+$/, '');
        base = base
            .replace(/[^a-zA-Z0-9._\-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^[._-]+|[._-]+$/g, '')
            .slice(0, 80);
        if (!base) base = 'dosya';
        return ext ? (base + '.' + ext) : base;
    }

    function validateFile(file) {
        if (!file || typeof file !== 'object') {
            return { ok: false, error: 'Dosya seçilmedi.' };
        }
        var ext = extOf(file.name);
        if (!ext || !ALLOWED_EXTS[ext]) {
            return { ok: false, error: 'Bu dosya türü desteklenmiyor.' };
        }
        var size = Number(file.size) || 0;
        if (size <= 0) {
            return { ok: false, error: 'Dosya boş görünüyor.' };
        }
        if (size > MAX_FILE_BYTES) {
            return { ok: false, error: 'Dosya boyutu 25 MB sınırını aşıyor.' };
        }
        var mime = String(file.type || '').toLowerCase();
        var isImage = !!IMAGE_EXTS[ext];
        if (mime && isImage && !IMAGE_MIMES[mime]) {
            return { ok: false, error: 'Dosya türü (MIME) uzantıyla uyuşmuyor.' };
        }
        if (mime && ext === 'pdf' && mime !== 'application/pdf' && mime !== 'application/octet-stream') {
            return { ok: false, error: 'PDF dosyası geçersiz görünüyor.' };
        }
        return {
            ok: true,
            ext: ext,
            dosya_turu: isImage ? 'gorsel' : 'teknik',
            safeName: sanitizeFileName(file.name)
        };
    }

    function randomId() {
        try {
            if (global.crypto && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
        } catch (e) { /* ignore */ }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            var v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    function currentUserId(sb) {
        return sb.auth.getSession().then(function (res) {
            var u = res && res.data && res.data.session && res.data.session.user;
            if (u && u.id) return u.id;
            if (global.AuthService && typeof AuthService.getCurrentUser === 'function') {
                var cu = AuthService.getCurrentUser();
                return cu && cu.id ? cu.id : null;
            }
            return null;
        }).catch(function () { return null; });
    }

    function unwrapRpcData(data) {
        if (data && typeof data === 'object' && !Array.isArray(data) && data.ok === false) {
            return fail(data.error || data.message || 'İşlem başarısız.', { data: data });
        }
        return ok({ data: data });
    }

    function kaydet(payload) {
        var sb = getSb();
        if (!sb) return Promise.resolve(fail('Supabase bağlantısı yok.'));
        var body = payload && typeof payload === 'object' ? payload : {};
        return sb.rpc('is_talebi_kaydet', { p_payload: body }).then(function (res) {
            if (res.error) return fail(hataMesaji(res.error));
            var u = unwrapRpcData(res.data);
            if (!u.ok) return u;
            var d = u.data || {};
            return ok({
                data: d,
                id: d.id || d.talep_id || (d.talep && d.talep.id) || null,
                durum: d.durum || body.durum || null
            });
        }).catch(function (err) {
            return fail(hataMesaji(err));
        });
    }

    function listeleFallback(sb, filters) {
        var f = filters || {};
        var lim = Math.min(Number(f.limit) || 24, 100);
        var q = sb.from('is_talepleri')
            .select('id,baslik,kategori,sehir,ilce,teslim_tarihi,aciliyet,urun_turu,butce_tipi,butce_min,butce_max,para_birimi,durum,yayinlanma_tarihi,sahip_gizli,created_at')
            .in('durum', ['teklif_bekliyor', 'Acik'])
            .order('created_at', { ascending: false })
            .limit(lim);
        if (f.kategori) q = q.eq('kategori', f.kategori);
        if (f.sehir) q = q.eq('sehir', f.sehir);
        if (f.aciliyet) q = q.eq('aciliyet', f.aciliyet);
        return q.then(function (res) {
            if (res.error) return fail(hataMesaji(res.error, 'Talepler listelenemedi.'));
            return ok({ data: res.data || [], kaynak: 'select' });
        }).catch(function (err) {
            return fail(hataMesaji(err, 'Talepler listelenemedi.'));
        });
    }

    function listele(filters) {
        var sb = getSb();
        if (!sb) return Promise.resolve(fail('Supabase bağlantısı yok.'));
        var f = filters || {};
        return sb.rpc('is_talepleri_listele', {
            p_kategori: f.kategori || null,
            p_sehir: f.sehir || null,
            p_aciliyet: f.aciliyet || null,
            p_limit: Math.min(Number(f.limit) || 24, 100),
            p_offset: Math.max(Number(f.offset) || 0, 0)
        }).then(function (res) {
            if (res.error) {
                if (rpcMissing(res.error)) return listeleFallback(sb, f);
                return fail(hataMesaji(res.error));
            }
            var d = res.data;
            if (Array.isArray(d)) return ok({ data: d, kaynak: 'rpc' });
            if (d && Array.isArray(d.items)) return ok({ data: d.items, toplam: d.toplam, kaynak: 'rpc' });
            if (d && Array.isArray(d.talepler)) return ok({ data: d.talepler, kaynak: 'rpc' });
            return ok({ data: d || [], kaynak: 'rpc' });
        }).catch(function (err) {
            if (rpcMissing(err)) return listeleFallback(sb, f);
            return fail(hataMesaji(err));
        });
    }

    function detay(id) {
        var sb = getSb();
        if (!sb) return Promise.resolve(fail('Supabase bağlantısı yok.'));
        if (id == null || id === '') return Promise.resolve(fail('Talep kimliği eksik.'));
        return sb.rpc('is_talebi_detay', { p_id: id }).then(function (res) {
            if (res.error) return fail(hataMesaji(res.error, 'Talep detayı alınamadı.'));
            var u = unwrapRpcData(res.data);
            if (!u.ok) return u;
            return ok({ data: u.data });
        }).catch(function (err) {
            return fail(hataMesaji(err, 'Talep detayı alınamadı.'));
        });
    }

    function dosyaYukle(opts) {
        var sb = getSb();
        if (!sb) return Promise.resolve(fail('Supabase bağlantısı yok.'));
        opts = opts || {};
        var file = opts.file;
        var talepId = opts.talepId;
        var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
        var check = validateFile(file);
        if (!check.ok) return Promise.resolve(fail(check.error));
        if (!talepId) return Promise.resolve(fail('Talep kimliği gerekli.'));

        if (onProgress) {
            try { onProgress(5); } catch (e0) { /* ignore */ }
        }

        return currentUserId(sb).then(function (uid) {
            if (!uid) return fail('Bu işlem için giriş yapmanız gerekir.', { needsAuth: true });
            var ext = check.ext || 'bin';
            var yol = uid + '/' + String(talepId) + '/' + randomId().replace(/-/g, '').slice(0, 16) + '.' + ext;
            if (onProgress) {
                try { onProgress(20); } catch (e1) { /* ignore */ }
            }
            return sb.storage.from(BUCKET).upload(yol, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type || (check.dosya_turu === 'gorsel' ? 'image/jpeg' : 'application/octet-stream')
            }).then(function (up) {
                if (up.error) {
                    return fail(hataMesaji(up.error, 'Dosya yüklenemedi.'));
                }
                if (onProgress) {
                    try { onProgress(70); } catch (e2) { /* ignore */ }
                }
                return sb.rpc('is_talebi_dosya_kaydet', {
                    p_payload: {
                        is_talebi_id: talepId,
                        storage_path: yol,
                        orijinal_dosya_adi: check.safeName || sanitizeFileName(file.name),
                        mime_type: file.type || null,
                        boyut_bytes: file.size,
                        dosya_turu: check.dosya_turu,
                        sira: opts.sira != null ? opts.sira : null
                    }
                }).then(function (meta) {
                    if (meta.error) {
                        try { sb.storage.from(BUCKET).remove([yol]); } catch (e3) { /* ignore */ }
                        return fail(hataMesaji(meta.error, 'Dosya kaydı oluşturulamadı.'));
                    }
                    if (onProgress) {
                        try { onProgress(100); } catch (e4) { /* ignore */ }
                    }
                    var u = unwrapRpcData(meta.data);
                    if (!u.ok) return u;
                    return ok({
                        data: u.data,
                        path: yol,
                        id: (u.data && (u.data.id || u.data.dosya_id)) || null
                    });
                });
            });
        }).catch(function (err) {
            return fail(hataMesaji(err, 'Dosya yüklenemedi.'));
        });
    }

    function dosyaImzaliUrl(dosyaId) {
        var sb = getSb();
        if (!sb) return Promise.resolve(fail('Supabase bağlantısı yok.'));
        if (!dosyaId) return Promise.resolve(fail('Dosya kimliği eksik.'));
        return sb.rpc('is_talebi_dosya_imzali_url', {
            p_dosya_id: dosyaId,
            p_saniye: 120
        }).then(function (res) {
            if (res.error) return fail(hataMesaji(res.error, 'İmzalı bağlantı alınamadı.'));
            var d = res.data || {};
            if (d && d.ok === false) return fail(d.error || 'İmzalı bağlantı alınamadı.');
            var path = d.path || d.storage_path;
            var bucket = d.bucket || BUCKET;
            if (!path) return fail('Dosya yolu alınamadı.');
            return sb.storage.from(bucket).createSignedUrl(path, d.expires_in || 120).then(function (signed) {
                if (signed.error) return fail(hataMesaji(signed.error));
                return ok({
                    url: signed.data && signed.data.signedUrl,
                    expires_in: d.expires_in || 120
                });
            });
        }).catch(function (err) {
            return fail(hataMesaji(err, 'İmzalı bağlantı alınamadı.'));
        });
    }

    function dosyaSil(dosyaId) {
        var sb = getSb();
        if (!sb) return Promise.resolve(fail('Supabase bağlantısı yok.'));
        if (!dosyaId) return Promise.resolve(fail('Dosya kimliği eksik.'));
        return sb.rpc('is_talebi_dosya_sil', { p_dosya_id: dosyaId }).then(function (res) {
            if (res.error) {
                if (rpcMissing(res.error)) return fail('Dosya silme henüz desteklenmiyor.');
                return fail(hataMesaji(res.error, 'Dosya silinemedi.'));
            }
            var u = unwrapRpcData(res.data);
            if (!u.ok) return u;
            return ok({ data: u.data });
        }).catch(function (err) {
            if (rpcMissing(err)) return fail('Dosya silme henüz desteklenmiyor.');
            return fail(hataMesaji(err, 'Dosya silinemedi.'));
        });
    }

    global.AurixIsTalebiService = {
        MAX_FILES: MAX_FILES,
        MAX_TOTAL: MAX_TOTAL_BYTES,
        MAX_FILE_BYTES: MAX_FILE_BYTES,
        BUCKET: BUCKET,
        kaydet: kaydet,
        listele: listele,
        detay: detay,
        dosyaYukle: dosyaYukle,
        dosyaImzaliUrl: dosyaImzaliUrl,
        dosyaSil: dosyaSil,
        validateFile: validateFile,
        sanitizeFileName: sanitizeFileName
    };
})(typeof window !== 'undefined' ? window : this);

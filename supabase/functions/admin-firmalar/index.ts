/**
 * AURIX — Admin firma moderasyonu (Edge Function)
 *
 * service_role yalnızca bu fonksiyonda (Supabase secrets) kullanılır.
 * Frontend ASLA service_role / sb_secret içermemelidir.
 *
 * Secrets:
 *   SUPABASE_ADMIN_TOKEN     — geçici geliştirme admin token’ı
 *   SUPABASE_URL             — otomatik
 *   SUPABASE_SERVICE_ROLE_KEY — otomatik (Edge ortamında)
 *
 * API:
 *   GET  /admin-firmalar              → durum=beklemede firmalar
 *   POST /admin-firmalar { action, id }
 *        action=approve → durum=onaylandi, dogrulanmis=true
 *        action=reject  → durum=reddedildi, dogrulanmis=false
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ALLOWED_ORIGINS = [
  'https://aurixb2b.com',
  'https://www.aurixb2b.com',
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some((o) =>
    origin === o || origin.startsWith(o + ':') || origin.startsWith(o + '/')
  );
  const allowOrigin = allowed ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-aurix-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function yetkiKontrol(req) {
  const secret = Deno.env.get('SUPABASE_ADMIN_TOKEN') || '';
  const incoming = req.headers.get('x-aurix-admin-token') || '';
  if (!secret) {
    return { ok: false, error: 'Sunucu yapılandırması eksik: SUPABASE_ADMIN_TOKEN secret tanımlı değil.' };
  }
  if (!incoming || incoming !== secret) {
    return { ok: false, error: 'Yetkisiz. Geçerli admin token gerekli.' };
  }
  return { ok: true };
}

function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) {
    return { error: 'Sunucu yapılandırması eksik (SERVICE_ROLE yalnızca Edge Function içinde).' };
  }
  return {
    client: createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function listeleBekleyen(admin) {
  return admin
    .from('firmalar')
    .select('id,firma_adi,sehir,kategori,aciklama,telefon,email,dogrulanmis,durum,created_at')
    .eq('durum', 'beklemede')
    .order('created_at', { ascending: false });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const yetki = yetkiKontrol(req);
    if (!yetki.ok) return json(req, { ok: false, error: yetki.error }, 401);

    const { client: admin, error: cfgErr } = adminClient();
    if (cfgErr) return json(req, { ok: false, error: cfgErr }, 500);

    if (req.method === 'GET') {
      const { data, error } = await listeleBekleyen(admin);
      if (error) {
        return json(req, { ok: false, error: 'Bekleyen firmalar alınamadı: ' + error.message }, 400);
      }
      return json(req, { ok: true, data: data || [] });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const action = body.action;

      if (action === 'list') {
        const { data, error } = await listeleBekleyen(admin);
        if (error) {
          return json(req, { ok: false, error: 'Bekleyen firmalar alınamadı: ' + error.message }, 400);
        }
        return json(req, { ok: true, data: data || [] });
      }

      if (action === 'approve' || action === 'reject') {
        const id = body.id;
        if (id == null || id === '') {
          return json(req, { ok: false, error: 'Firma id gerekli.' }, 400);
        }

        const patch = action === 'approve'
          ? { durum: 'onaylandi', dogrulanmis: true }
          : { durum: 'reddedildi', dogrulanmis: false };

        const { error } = await admin.from('firmalar').update(patch).eq('id', id);
        if (error) {
          const islem = action === 'approve' ? 'Onay' : 'Red';
          return json(req, { ok: false, error: islem + ' işlemi başarısız: ' + error.message }, 400);
        }
        return json(req, {
          ok: true,
          action,
          message: action === 'approve'
            ? 'Firma onaylandı.'
            : 'Firma reddedildi (kayıt silinmedi).',
        });
      }

      return json(req, { ok: false, error: 'Bilinmeyen işlem. action: list | approve | reject' }, 400);
    }

    return json(req, { ok: false, error: 'Desteklenmeyen HTTP metodu.' }, 405);
  } catch (err) {
    return json(req, {
      ok: false,
      error: err && err.message ? ('Sunucu hatası: ' + err.message) : 'Sunucu hatası.',
    }, 500);
  }
});

/**
 * AURIX — Admin firma moderasyonu (Edge Function)
 *
 * service_role YALNIZCA bu fonksiyonun ortam değişkeninden alınır.
 * Frontend ASLA service_role / sb_secret / admin token içermemelidir.
 *
 * Secrets:
 *   SUPABASE_ADMIN_TOKEN      — geçici admin token (x-admin-token header)
 *   SUPABASE_URL              — otomatik
 *   SUPABASE_SERVICE_ROLE_KEY — otomatik (Edge ortamında)
 *
 * JWT: Bu geçici token modeli nedeniyle deploy’da --no-verify-jwt gerekir
 * (gateway JWT’si yerine x-admin-token doğrulanır).
 * Uzun vadede: Supabase Auth + profiles.role='admin' + JWT doğrulaması.
 *
 * API:
 *   GET  → durum=beklemede firmalar (telefon/email dahil)
 *   POST { action: 'approve'|'reject', id }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ALLOWED_ORIGINS = [
  'https://aurixb2b.com',
  'https://www.aurixb2b.com',
  'http://127.0.0.1:8765',
  'http://localhost:8765',
];

function originIzinliMi(origin: string): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-admin-token, x-aurix-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(
  origin: string,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Timing-safe string compare (UTF-8) */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function adminTokenAl(req: Request): string {
  return (
    req.headers.get('x-admin-token') ||
    req.headers.get('x-aurix-admin-token') ||
    ''
  ).trim();
}

function yetkiKontrol(req: Request): { ok: true } | { ok: false; error: string } {
  const secret = (Deno.env.get('SUPABASE_ADMIN_TOKEN') || '').trim();
  const incoming = adminTokenAl(req);
  if (!secret) {
    return {
      ok: false,
      error: 'Sunucu yapılandırması eksik: SUPABASE_ADMIN_TOKEN tanımlı değil.',
    };
  }
  if (!incoming || !timingSafeEqual(incoming, secret)) {
    return { ok: false, error: 'Yetkisiz. Geçerli admin token gerekli.' };
  }
  return { ok: true };
}

function adminClient():
  | { client: ReturnType<typeof createClient> }
  | { error: string } {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) {
    return {
      error: 'Sunucu yapılandırması eksik (SERVICE_ROLE yalnızca Edge Function içinde).',
    };
  }
  return {
    client: createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function listeleBekleyen(admin: ReturnType<typeof createClient>) {
  return admin
    .from('firmalar')
    .select(
      'id,firma_adi,sehir,kategori,aciklama,telefon,email,dogrulanmis,durum,user_id,is_seed,created_at',
    )
    .eq('durum', 'beklemede')
    .order('created_at', { ascending: false });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';

  // OPTIONS: izinli origin için CORS; aksi halde 403
  if (req.method === 'OPTIONS') {
    if (!originIzinliMi(origin)) {
      return new Response(JSON.stringify({ ok: false, error: 'Origin izni yok.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return new Response('ok', { status: 200, headers: corsHeaders(origin) });
  }

  if (!originIzinliMi(origin)) {
    return new Response(JSON.stringify({ ok: false, error: 'Origin izni yok.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const yetki = yetkiKontrol(req);
    if (!yetki.ok) return json(origin, { ok: false, error: yetki.error }, 401);

    const created = adminClient();
    if ('error' in created) {
      return json(origin, { ok: false, error: created.error }, 500);
    }
    const admin = created.client;

    if (req.method === 'GET') {
      const { data, error } = await listeleBekleyen(admin);
      if (error) {
        return json(
          origin,
          { ok: false, error: 'Bekleyen firmalar alınamadı.' },
          500,
        );
      }
      return json(origin, { ok: true, data: data || [] });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return json(origin, { ok: false, error: 'Geçersiz istek gövdesi.' }, 400);
      }

      const action = (body as { action?: string }).action;
      const id = (body as { id?: string | number }).id;

      if (action === 'list') {
        const { data, error } = await listeleBekleyen(admin);
        if (error) {
          return json(
            origin,
            { ok: false, error: 'Bekleyen firmalar alınamadı.' },
            500,
          );
        }
        return json(origin, { ok: true, data: data || [] });
      }

      if (action === 'approve' || action === 'reject') {
        if (id == null || id === '') {
          return json(origin, { ok: false, error: 'Geçersiz veya eksik firma id.' }, 400);
        }

        const patch = action === 'approve'
          ? { durum: 'onaylandi', dogrulanmis: true }
          : { durum: 'reddedildi', dogrulanmis: false };

        const { data, error } = await admin
          .from('firmalar')
          .update(patch)
          .eq('id', id)
          .select('id')
          .maybeSingle();

        if (error) {
          return json(origin, {
            ok: false,
            error: action === 'approve'
              ? 'Onay işlemi başarısız.'
              : 'Red işlemi başarısız.',
          }, 500);
        }
        if (!data) {
          return json(origin, { ok: false, error: 'Firma bulunamadı.' }, 400);
        }

        return json(origin, {
          ok: true,
          action,
          message: action === 'approve'
            ? 'Firma onaylandı.'
            : 'Firma reddedildi (kayıt silinmedi).',
        });
      }

      return json(origin, {
        ok: false,
        error: 'Geçersiz action. Kullanım: approve | reject | list',
      }, 400);
    }

    return json(origin, { ok: false, error: 'Desteklenmeyen HTTP metodu.' }, 405);
  } catch (_err) {
    return json(origin, { ok: false, error: 'Beklenmeyen sunucu hatası.' }, 500);
  }
});

# AURIX — admin-firmalar Edge Function

Bekleyen firma listesi ve onay/red işlemleri **anon/publishable key ile yapılamaz** (RLS).
`service_role` yalnızca bu Edge Function içinde (Supabase secrets) kullanılır.

## Deploy (sırayla)

```bash
supabase functions deploy admin-firmalar
supabase secrets set SUPABASE_ADMIN_TOKEN="guclu-rastgele-token-buraya"
```

> `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` Edge ortamında otomatik gelir; bunları frontend’e koymayın.

## API

| Metod | Açıklama |
|-------|----------|
| `GET` | `durum = 'beklemede'` firmaları listeler |
| `POST` `{ "action": "approve", "id": ... }` | `durum=onaylandi`, `dogrulanmis=true` |
| `POST` `{ "action": "reject", "id": ... }` | `durum=reddedildi`, `dogrulanmis=false` |

Header: `x-aurix-admin-token: <SUPABASE_ADMIN_TOKEN>`

CORS: yalnızca `aurixb2b.com` ve `localhost` / `127.0.0.1` (yaygın portlar).

## Frontend kullanım (geçici)

1. Siteyi `?devAdmin=1` ile açın.
2. Admin token’ı bir kez girin (sessionStorage; URL/source’a yazılmaz).
3. Bekleyen kartlarda **Onayla** / **Reddet**.

## Production

Bu token modeli **geçicidir**. Kalıcı çözüm:
- Supabase Auth + `role=admin`
- Edge Function’da JWT doğrulama
- `service_role` asla GitHub Pages / tarayıcı kodunda olmamalı

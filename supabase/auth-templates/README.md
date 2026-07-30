# AURIX Auth E-posta Şablonları

Kesinleşmiş resmi logo + tek premium beyaz kart tasarımı. Supabase’e doğrudan yapıştırılabilir.

| Dosya | Supabase şablonu | Subject (konu) |
|--------|------------------|----------------|
| `confirm-signup.html` | Confirm signup | `AURIX B2B — E-posta doğrulama` |
| `recovery.html` | Reset Password | `AURIX B2B — Parola sıfırlama` |
| `magic-link.html` | Magic Link | `AURIX B2B — Güvenli giriş` |
| `welcome.html` | Invite user | `AURIX B2B’ye hoş geldiniz` |

## Gönderen adı / SMTP (zorunlu Dashboard ayarı)

Hosted Supabase’de gönderen adı `config.toml` ile otomatik gelmez; Dashboard’da ayarlanmalıdır:

1. **Project Settings → Authentication → SMTP Settings** (veya Email)
2. **Sender name:** `AURIX B2B`
3. **Sender email:** `info@aurixb2b.com` (veya doğrulanmış SMTP hesabınız)
4. **Authentication → Email Templates:** her şablonun Subject alanına yukarıdaki konuları yapıştırın; Body’ye ilgili HTML dosyasını kopyalayın.

Yerel CLI (`supabase start`) için `supabase/config.toml` içindeki `[auth.email.template.*]` satırları kullanılır.

## Logo
- Mark: `assets/logo-mark.png` (resmi sembol)
- E-posta: `assets/logo-email-horizontal.png` → `https://aurixb2b.com/assets/logo-email-horizontal.png`
- Görünen genişlik: **220 px** (mark–yazı boşluğu sıkı)

## Ortak yapı
Logo → ayırıcı (çizgi + nokta) → başlık → metin → siyah CTA → geçerlilik notu → güvenlik → yardım/iletişim → footer

İletişim: info@aurixb2b.com · https://aurixb2b.com

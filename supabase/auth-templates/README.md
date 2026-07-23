# AURIX Auth E-posta Şablonları

Premium kurumsal tasarım — canlıya hazır.

## Supabase’e yapıştırma

| Dosya | Supabase şablonu | Subject |
|--------|------------------|---------|
| `confirm-signup.html` | Confirm signup | `AURIX — E-posta doğrulama` |
| `recovery.html` | Reset Password | `AURIX — Parola sıfırlama` |
| `magic-link.html` | Magic Link | `AURIX — Güvenli giriş` |
| `welcome.html` | Invite user | `AURIX’e hoş geldiniz` |

## Logo

- Dosya: `assets/logo-email-horizontal.png`
- Canlı URL: `https://aurixb2b.com/assets/logo-email-horizontal.png`
- İçerik: gri A sembolü + AURIX yazısı (altıgen yok, alt yazı yok)
- E-posta genişliği: **250 px**

Şablonlar production absolute URL kullanır. Yerel preview için geçici olarak göreli yol da çalışır (logo dosyası `../../assets/` altında).

## Ortak kurallar

- CTA: `{{ .ConfirmationURL }}`
- Ayırıcı: ince gri çizgi + ortada nokta
- İletişim: `info@aurixb2b.com` · `https://aurixb2b.com`
- Telefon / WhatsApp / emoji / sosyal ikon yok
- © 2026 AURIX | Tüm hakları saklıdır.

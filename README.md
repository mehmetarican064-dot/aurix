# AURIX — Beta v0.1 Demo

Türkiye kuyumculuk sektörü için B2B platform demosu. Frontend ağırlıklı, tarayıcıda çalışır; ileride Supabase bağlanacak şekilde yapılandırılmıştır.

## Hızlı Başlangıç

1. `index.html` dosyasını tarayıcıda açın (veya Live Server kullanın)
2. Ek kurulum gerekmez — npm, Supabase, API yok

## Dosya Yapısı

```
├── index.html          # Ana uygulama (SPA)
├── css/styles.css      # Aurix lüks teknoloji teması (mat siyah / gümüş)
├── js/
│   ├── utils.js        # escapeHtml, safeUrl, güvenlik yardımcıları
│   ├── data.js         # Kategoriler + örnek firmalar (→ Supabase ile değişecek)
│   └── app.js          # Uygulama mantığı + StorageAdapter
├── assets/             # Logo, görseller (ileride)
└── README.md
```

## Demo Özellikleri

- ✅ Aurix marka kimliği
- ✅ 20 kategori
- ✅ Sponsor & Premium firma alanları
- ✅ Firma vitrini (arama + filtre)
- ✅ Firma detay modalı
- ✅ Firma kayıt formu
- ✅ WhatsApp iletişim
- ✅ Demo canlı piyasa bandı
- ⏸ Admin paneli (v1.0'da Supabase Auth ile — şu an devre dışı)
- ✅ Mobil uyumlu responsive tasarım

## Admin Paneli

Beta v0.1'de yönetim paneli **devre dışıdır**. v1.0'da Supabase Auth ve `profiles.role = 'admin'` ile etkinleştirilecektir.

## Veri Saklama

Beta v0.1'de tüm veriler **localStorage** (`aurix_beta_v01_firms`) içinde tutulur. Admin panelindeki **Verileri Sıfırla** butonu örnek verilere döner.

## v1.0'a Geçiş Planı

| Katman | Beta v0.1 | v1.0 |
|--------|-----------|------|
| Veri | `js/data.js` + localStorage | Supabase PostgreSQL |
| Auth | Devre dışı (public) | Supabase Auth + MFA |
| Storage | Harici görseller | Supabase Storage |
| Adapter | `StorageAdapter` in app.js | `SupabaseAdapter` |

## Lisans

© 2026 Aurix — Demo sürüm

-- AURIX geliştirme seed’i (yalnızca INSERT)
-- Schema / policy içermez.
-- Kayıtlar is_seed=true, dogrulanmis=false, durum='beklemede' — public production sorgularında görünmez.
-- Çalıştırmadan önce 007_auth_profiles_owner_seed.sql uygulanmış olmalıdır.
-- Tekrar çalıştırmada mevcut örnek e-postalar atlanır (üretim verisine dokunmaz).

INSERT INTO public.firmalar (
    firma_adi, sehir, kategori, aciklama, telefon, email,
    dogrulanmis, durum, is_seed
)
SELECT v.firma_adi, v.sehir, v.kategori, v.aciklama, v.telefon, v.email,
       FALSE, 'beklemede', TRUE
FROM (VALUES
    ('Örnek Atölye Döküm', 'İstanbul', 'Dökümcüler',
     'Geliştirme amaçlı örnek firma kaydı (test). Production vitrinde görünmez.',
     '905551110001', 'ornek.dokum@test.aurix.local'),
    ('Örnek Mıhlama Atölyesi', 'İzmir', 'Mıhlamacılar',
     'Geliştirme amaçlı örnek firma kaydı (test). Production vitrinde görünmez.',
     '905551110002', 'ornek.mihlama@test.aurix.local'),
    ('Örnek CAD Çizim', 'Ankara', 'Çizimciler',
     'Geliştirme amaçlı örnek firma kaydı (test). Production vitrinde görünmez.',
     '905551110003', 'ornek.cad@test.aurix.local'),
    ('Örnek Mum Basım', 'Bursa', 'Mumcular',
     'Geliştirme amaçlı örnek firma kaydı (test). Production vitrinde görünmez.',
     '905551110004', 'ornek.mum@test.aurix.local'),
    ('Örnek Lazer Atölye', 'Denizli', 'Lazer',
     'Geliştirme amaçlı örnek firma kaydı (test). Production vitrinde görünmez.',
     '905551110005', 'ornek.lazer@test.aurix.local')
) AS v(firma_adi, sehir, kategori, aciklama, telefon, email)
WHERE NOT EXISTS (
    SELECT 1 FROM public.firmalar f
    WHERE lower(btrim(f.email)) = lower(btrim(v.email))
);

INSERT INTO public.is_talepleri (
    baslik, aciklama, kategori, sehir, durum, is_seed
)
SELECT v.baslik, v.aciklama, v.kategori, v.sehir, 'Acik', TRUE
FROM (VALUES
    ('Örnek — Alyans döküm talebi',
     'Geliştirme amaçlı örnek iş talebi (test). Production listesinde görünmez.',
     'Dökümcüler', 'İstanbul'),
    ('Örnek — Tektaş mıhlama',
     'Geliştirme amaçlı örnek iş talebi (test). Production listesinde görünmez.',
     'Mıhlamacılar', 'İzmir'),
    ('Örnek — CAD model çizimi',
     'Geliştirme amaçlı örnek iş talebi (test). Production listesinde görünmez.',
     'Çizimciler', 'Ankara'),
    ('Örnek — Mum basım serisi',
     'Geliştirme amaçlı örnek iş talebi (test). Production listesinde görünmez.',
     'Mumcular', 'Bursa'),
    ('Örnek — Lazer gravür işi',
     'Geliştirme amaçlı örnek iş talebi (test). Production listesinde görünmez.',
     'Lazer', 'Denizli')
) AS v(baslik, aciklama, kategori, sehir)
WHERE NOT EXISTS (
    SELECT 1 FROM public.is_talepleri i
    WHERE i.baslik = v.baslik AND COALESCE(i.is_seed, FALSE) IS TRUE
);

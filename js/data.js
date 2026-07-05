/**
 * Aurix Beta v0.1 — Veri katmanı
 * v1.0'da bu dosya Supabase sorguları ile değiştirilecek.
 */
window.AURIX_DATA = {
    VERSION: '0.1.0',

    KATEGORILER: [
        { id: 'cizimci', ad: 'Çizimciler', ikon: '✏️' },
        { id: 'matrix', ad: 'Matrix Uzmanları', ikon: '💎' },
        { id: 'rhino', ad: 'Rhino Uzmanları', ikon: '🦏' },
        { id: 'dokumcu', ad: 'Dökümcüler', ikon: '⚙️' },
        { id: 'mihlamaci', ad: 'Mıhlamacılar', ikon: '💍' },
        { id: 'mumcu', ad: 'Mumcular', ikon: '🕯️' },
        { id: 'tas', ad: 'Taş Satıcıları', ikon: '🔮' },
        { id: 'ayar', ad: 'Ayar Evleri', ikon: '⚖️' },
        { id: 'ramat', ad: 'Ramat Evleri', ikon: '♻️' },
        { id: 'kalipci', ad: 'Kalıpçılar', ikon: '🔲' },
        { id: 'polisaj', ad: 'Polisaj', ikon: '✨' },
        { id: 'lazer', ad: 'Lazer', ikon: '⚡' },
        { id: 'zincir', ad: 'Zincir Üreticileri', ikon: '⛓️' },
        { id: 'kilit', ad: 'Kilit Üreticileri', ikon: '🔐' },
        { id: 'bilezik', ad: 'Bilezik Üreticileri', ikon: '📿' },
        { id: 'toptanci', ad: 'Toptancılar', ikon: '🏪' },
        { id: 'makine', ad: 'Makine Satıcıları', ikon: '🏭' },
        { id: 'vitrin', ad: 'Kuyumcu Vitrin Firmaları', ikon: '🪟' },
        { id: 'kutu', ad: 'Kuyumcu Kutu Firmaları', ikon: '📦' },
        { id: 'malzeme', ad: 'Kuyumcu Malzeme Tedarikçileri', ikon: '🧰' },
        { id: 'sarf', ad: 'Sarf Malzemeleri', ikon: '📋' },
        { id: 'kimyasal', ad: 'Kimyasal', ikon: '🧪' },
        { id: 'tel', ad: 'Tel', ikon: '〰️' },
        { id: 'lehim', ad: 'Lehim', ikon: '🔥' },
        { id: 'aparat', ad: 'Aparat', ikon: '🔧' },
        { id: 'kaplama', ad: 'Kaplama', ikon: '◈' },
        { id: 'tamir', ad: 'Tamir', ikon: '⚙️' }
    ],

    SEHIRLER: ['İSTANBUL', 'İZMİR', 'DENİZLİ', 'KAHRAMANMARAŞ', 'ANKARA', 'BURSA', 'GAZİANTEP'],

    PIYASA_DEMO: {
        dolar: { etiket: 'DOLAR ($)', deger: '34,18', birim: 'TL', degisim: '+0,12' },
        euro: { etiket: 'EURO (€)', deger: '37,42', birim: 'TL', degisim: '-0,05' },
        hasAltin: { etiket: 'HAS ALTIN', deger: '3.124', birim: 'TL', degisim: '+18' },
        ons: { etiket: 'ONS', deger: '2.338', birim: '$', degisim: '+4,2' },
        gumus: { etiket: 'GÜMÜŞ', deger: '38,42', birim: 'TL', degisim: '-0,28' }
    },

    /* Firma vitrini filtre grupları (chip) */
    FILTRE_GRUPLARI: [
        { id: '', baslik: 'Tümü', kategoriler: null },
        {
            id: 'ureticiler', baslik: 'Üreticiler',
            kategoriler: ['dokumcu', 'mihlamaci', 'mumcu', 'polisaj', 'lazer', 'zincir', 'kilit', 'bilezik', 'toptanci']
        },
        {
            id: 'tasarim', baslik: 'Tasarım',
            kategoriler: ['cizimci', 'matrix', 'rhino']
        },
        {
            id: 'tasMucevher', baslik: 'Taş & Mücevher',
            kategoriler: ['tas']
        },
        {
            id: 'uretimDestek', baslik: 'Üretim Destek',
            kategoriler: ['ayar', 'ramat', 'kalipci']
        },
        {
            id: 'vitrinMagaza', baslik: 'Mağaza & Vitrin',
            kategoriler: ['vitrin', 'kutu']
        },
        {
            id: 'makine', baslik: 'Makine & Ekipman',
            kategoriler: ['makine']
        },
        {
            id: 'malzeme', baslik: 'Malzeme Tedarikçileri',
            kategoriler: ['malzeme', 'sarf', 'kimyasal', 'tel', 'lehim', 'aparat']
        }
    ],

    /* Ana sayfa firma bölümleri */
    FIRMA_BOLUMLERI: [
        {
            id: 'ureticiler', gridId: 'ureticilerGrid', baslik: 'Üreticiler',
            alt: 'Dökümcüler, mıhlamacılar, mumcular, polisaj, lazer, zincir, kilit, bilezik ve toptancılar.',
            kategoriler: ['dokumcu', 'mihlamaci', 'mumcu', 'polisaj', 'lazer', 'zincir', 'kilit', 'bilezik', 'toptanci']
        },
        {
            id: 'tasarim', gridId: 'tasarimGrid', baslik: 'Tasarım',
            alt: 'Çizimciler, Matrix ve Rhino uzmanları.',
            kategoriler: ['cizimci', 'matrix', 'rhino']
        },
        {
            id: 'tasMucevher', gridId: 'tasGrid', baslik: 'Taş & Mücevher',
            alt: 'Taş satıcıları ve mücevher tedarikçileri.',
            kategoriler: ['tas']
        },
        {
            id: 'uretimDestek', gridId: 'uretimDestekGrid', baslik: 'Üretim Destek',
            alt: 'Ayar evleri, ramat evleri ve kalıpçılar.',
            kategoriler: ['ayar', 'ramat', 'kalipci']
        },
        {
            id: 'vitrinMagaza', gridId: 'vitrinMagazaGrid', baslik: 'Mağaza & Vitrin',
            alt: 'Kuyumcu vitrin ve kutu firmaları.',
            kategoriler: ['vitrin', 'kutu']
        },
        {
            id: 'makine', gridId: 'makineGrid', baslik: 'Makine & Ekipman',
            alt: 'Kuyumculuk makine ve ekipman satıcıları.',
            kategoriler: ['makine']
        },
        {
            id: 'malzeme', gridId: 'malzemeGrid', baslik: 'Malzeme Tedarikçileri',
            alt: 'Malzeme, sarf, kimyasal, tel, lehim ve aparat tedarikçileri.',
            kategoriler: ['malzeme', 'sarf', 'kimyasal', 'tel', 'lehim', 'aparat']
        }
    ],

    /* Ana sayfa — 20 branş grupları */
    KATEGORI_GRUPLARI: [
        {
            id: 'ureticiler', baslik: 'Üreticiler', ikon: '⚙️',
            kategoriler: ['dokumcu', 'mihlamaci', 'mumcu', 'polisaj', 'lazer', 'zincir', 'kilit', 'bilezik', 'toptanci']
        },
        {
            id: 'tasarim', baslik: 'Tasarım', ikon: '✏️',
            kategoriler: ['cizimci', 'matrix', 'rhino']
        },
        {
            id: 'tasMucevher', baslik: 'Taş & Mücevher', ikon: '🔮',
            kategoriler: ['tas']
        },
        {
            id: 'uretimDestek', baslik: 'Üretim Destek', ikon: '⚖️',
            kategoriler: ['ayar', 'ramat', 'kalipci']
        },
        {
            id: 'vitrinMagaza', baslik: 'Mağaza & Vitrin', ikon: '🪟',
            kategoriler: ['vitrin', 'kutu']
        },
        {
            id: 'makine', baslik: 'Makine & Ekipman', ikon: '🏭',
            kategoriler: ['makine']
        },
        {
            id: 'malzeme', baslik: 'Malzeme Tedarikçileri', ikon: '🧰',
            kategoriler: ['malzeme', 'sarf', 'kimyasal', 'tel', 'lehim', 'aparat']
        }
    ],

    /* Açık iş talepleri — ana sayfa */
    ACIK_IS_TALEPLERI: [
        {
            id: 'it001',
            kategoriId: 'dokumcu',
            baslik: '925 Gümüş Kolye Dökümü',
            sehir: 'İstanbul',
            adet: '300 adet',
            termin: '10 gün',
            butce: '₺45.000 – ₺60.000',
            teklifSayisi: 4,
            acilisTarihi: '12 Haz 2026',
            durum: 'Teklif bekliyor',
            durumTip: 'bekliyor',
            sonGuncelleme: '2 saat önce'
        },
        {
            id: 'it002',
            kategoriId: 'cizimci',
            baslik: 'CAD Model Çizimi',
            sehir: 'İzmir',
            adet: '1 model',
            termin: '3 gün',
            butce: '₺2.500 – ₺4.000',
            teklifSayisi: 7,
            acilisTarihi: '14 Haz 2026',
            durum: 'Acil',
            durumTip: 'acil',
            sonGuncelleme: '45 dk önce'
        },
        {
            id: 'it003',
            kategoriId: 'mumcu',
            baslik: 'Mum Basımı',
            sehir: 'Kahramanmaraş',
            adet: '120 adet',
            termin: '2 gün',
            butce: '₺8.000 – ₺12.000',
            teklifSayisi: 3,
            acilisTarihi: '10 Haz 2026',
            durum: 'Teklif bekliyor',
            durumTip: 'bekliyor',
            sonGuncelleme: '5 saat önce'
        }
    ],

    /* Ana sayfa kategorileri — isSayisi: aktif talep tabanı */
    ESNAF_ANA_KATEGORILER: [
        { id: 'cizimci', ad: 'CAD Çizim', sembol: '◇', isSayisi: 14, firmaTaban: 280, aciklama: '3D model, teknik çizim ve STL teslimi.' },
        { id: 'mumcu', ad: 'Mum Basım', sembol: '◆', isSayisi: 9, firmaTaban: 190, aciklama: 'Kuyumcu mum basım ve model hazırlığı.' },
        { id: 'dokumcu', ad: 'Döküm', sembol: '⚙', isSayisi: 22, firmaTaban: 420, aciklama: 'Altın, gümüş ve fantezi döküm üretimi.' },
        { id: 'mihlamaci', ad: 'Mıhlama', sembol: '◈', isSayisi: 11, firmaTaban: 310, aciklama: 'Taş kitleme ve mikro mıhlama işleri.' },
        { id: 'polisaj', ad: 'Rodaj', sembol: '◎', isSayisi: 8, firmaTaban: 240, aciklama: 'Parlatma, rodaj ve yüzey işleme.' },
        { id: 'lazer', ad: 'Lazer', sembol: '⚡', isSayisi: 6, firmaTaban: 165, aciklama: 'Lazer kesim, kazıma ve markalama.' },
        { id: 'tas', ad: 'Taş', sembol: '✦', isSayisi: 10, firmaTaban: 350, aciklama: 'Pırlanta ve değerli taş tedariki.' },
        { id: 'kaplama', ad: 'Kaplama', sembol: '◉', isSayisi: 5, firmaTaban: 120, aciklama: 'Rodaj sonrası kaplama ve finish.' },
        { id: 'tamir', ad: 'Tamir', sembol: '⊕', isSayisi: 7, firmaTaban: 200, aciklama: 'Bakım, ölçü ve tamir hizmetleri.' },
        { id: 'malzeme-tedarik', ad: 'Malzeme Tedarik', sembol: '▣', isSayisi: 18, firmaTaban: 320, aciklama: 'Takı ekipmanları, makineler, sarf malzemeleri, el aletleri ve yedek parçalar.', ozelSayfa: 'malzeme' }
    ],

    PLATFORM_ISTATISTIK: [
        { deger: '2.500+', etiket: 'Firma' },
        { deger: '7.000+', etiket: 'İş Talebi' },
        { deger: '15.000+', etiket: 'Teklif' },
        { deger: '4.9', etiket: 'Ortalama Puan' }
    ],

    CANLI_AKTIVITE: [
        { tip: 'is', metin: "İstanbul'da yeni CAD işi oluşturuldu.", zaman: '2 dakika önce' },
        { tip: 'firma', metin: "Ankara'da yeni firma doğrulandı.", zaman: '5 dakika önce' },
        { tip: 'teklif', metin: "İzmir'de teklif kabul edildi.", zaman: '5 dakika önce' },
        { tip: 'is', metin: "Kahramanmaraş'ta döküm işi yayınlandı.", zaman: '20 dakika önce' }
    ],

    /* Firma profili güven alanları — v1.0 backend ile doldurulacak */
    DOGRULAMA_ALANLARI: [
        { id: 'vergi', etiket: 'Vergi doğrulandı' },
        { id: 'telefon', etiket: 'Telefon doğrulandı' },
        { id: 'adres', etiket: 'Adres doğrulandı' },
        { id: 'whatsapp', etiket: 'WhatsApp doğrulandı' }
    ],

    /* Malzeme Pazarı kategorileri */
    MALZEME_KATEGORILER: [
        { id: 'lazer-makine', ad: 'Lazer Makineleri', ikon: '⚡' },
        { id: 'dokum-makine', ad: 'Döküm Makineleri', ikon: '⚙' },
        { id: 'polisaj', ad: 'Polisaj', ikon: '✨' },
        { id: 'rodaj', ad: 'Rodaj', ikon: '◎' },
        { id: 'mihlama-alet', ad: 'Mıhlama Aletleri', ikon: '◈' },
        { id: 'el-alet', ad: 'El Aletleri', ikon: '🔧' },
        { id: 'matkap-uc', ad: 'Matkap Uçları', ikon: '⬡' },
        { id: 'freze', ad: 'Frezeler', ikon: '◆' },
        { id: 'motor', ad: 'Motorlar', ikon: '⚡' },
        { id: 'mikromotor', ad: 'Mikromotor', ikon: '◉' },
        { id: 'terazi', ad: 'Hassas Teraziler', ikon: '⚖' },
        { id: 'kalem', ad: 'Kalemler', ikon: '✎' },
        { id: 'pense', ad: 'Penseler', ikon: '⊃' },
        { id: 'cimoz', ad: 'Cımbızlar', ikon: '⊥' },
        { id: 'kimyasal', ad: 'Kimyasallar', ikon: '🧪' },
        { id: 'sarf', ad: 'Sarf Malzemeleri', ikon: '📋' },
        { id: 'yedek-parca', ad: 'Yedek Parçalar', ikon: '⚙' }
    ],

    MALZEME_URUNLER: [
        { id: 'mu001', kategoriId: 'lazer-makine', baslik: 'Fiber Lazer Kesim 30W', fiyat: '₺185.000', satici: 'Tekno Lazer Ltd.', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1611591437281-460bf24535ce?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu002', kategoriId: 'dokum-makine', baslik: 'Vakum Döküm Makinesi 1kg', fiyat: '₺420.000', satici: 'Altın Makina', sehir: 'Kahramanmaraş', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu003', kategoriId: 'mikromotor', baslik: 'Saeshin Strong 210 Mikromotor', fiyat: '₺12.500', satici: 'Nova Kuyumculuk Malzeme', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu004', kategoriId: 'terazi', baslik: 'Hassas Dijital Terazi 0,001g', fiyat: '₺8.900', satici: 'Precision Tools TR', sehir: 'Ankara', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu005', kategoriId: 'mihlama-alet', baslik: 'Mikro Mıhlama Pens Seti', fiyat: '₺2.400', satici: 'Elmas Mikro Mıhlama', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1515562141203-7a88fb7ce338?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu006', kategoriId: 'polisaj', baslik: 'Profesyonel Polisaj Fırça Seti', fiyat: '₺1.850', satici: 'Rodaj Pro', sehir: 'Bursa', durum: 'Stokta', dogrulandi: false, gorsel: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu007', kategoriId: 'rodaj', baslik: 'Rodaj Diski Seti 120–3000 grit', fiyat: '₺950', satici: 'Rodaj Pro', sehir: 'Bursa', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu008', kategoriId: 'el-alet', baslik: 'Kuyumcu El Aleti Seti 12 Parça', fiyat: '₺3.200', satici: 'Nova Kuyumculuk Malzeme', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu009', kategoriId: 'matkap-uc', baslik: 'HSS Matkap Ucu Seti 0,5–3mm', fiyat: '₺680', satici: 'Precision Tools TR', sehir: 'Ankara', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu010', kategoriId: 'freze', baslik: 'Carbide Freze Seti 20 Parça', fiyat: '₺1.450', satici: 'Precision Tools TR', sehir: 'Ankara', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu011', kategoriId: 'motor', baslik: 'Hanging Motor 1/4 HP', fiyat: '₺6.800', satici: 'Altın Makina', sehir: 'Kahramanmaraş', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu012', kategoriId: 'kalem', baslik: 'Graver Kalemi Seti', fiyat: '₺520', satici: 'Nova Kuyumculuk Malzeme', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu013', kategoriId: 'pense', baslik: 'Flat Nose Pense Seti', fiyat: '₺780', satici: 'Nova Kuyumculuk Malzeme', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu014', kategoriId: 'cimoz', baslik: 'Anti-Manyetik Cımbız Seti', fiyat: '₺640', satici: 'Precision Tools TR', sehir: 'Ankara', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu015', kategoriId: 'kimyasal', baslik: 'Ultrasonik Temizlik Solüsyonu 5L', fiyat: '₺420', satici: 'Kimya Gold', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu016', kategoriId: 'sarf', baslik: 'Lehim Teli 0,5mm 50g', fiyat: '₺380', satici: 'Kimya Gold', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu017', kategoriId: 'yedek-parca', baslik: 'Mikromotor Kollet Seti', fiyat: '₺290', satici: 'Nova Kuyumculuk Malzeme', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80' },
        { id: 'mu018', kategoriId: 'lazer-makine', baslik: 'CO2 Lazer Kazıma 40W', fiyat: '₺95.000', satici: 'Tekno Lazer Ltd.', sehir: 'İstanbul', durum: 'Sipariş', dogrulandi: true, gorsel: 'https://images.unsplash.com/photo-1611591437281-460bf24535ce?auto=format&fit=crop&w=600&q=80' }
    ],

    NEDEN_AURIX: [
        { ikon: 'shield', baslik: 'Doğrulanmış Firmalar', metin: 'Onaylı profiller ve şeffaf firma bilgileri.' },
        { ikon: 'teklif', baslik: 'Teklif Toplama', metin: 'Birden fazla firmadan hızlı teklif alın.' },
        { ikon: 'guven', baslik: 'Güvenli İş Süreci', metin: 'Doğrudan iletişim ve güvenilir eşleşme.' },
        { ikon: 'ag', baslik: 'Profesyonel Ağ', metin: 'Tüm kuyumculuk ekosistemi tek çatıda.' }
    ],

    VARSAYILAN_GORSEL: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=800&q=80',

    /* Kategori bazlı yerel kapak görselleri (yedek) */
    KATEGORI_KAPAK_GORSELLERI: {
        cizimci: 'assets/cizim.png',
        matrix: 'assets/cizim.png',
        rhino: 'assets/cizim.png',
        dokumcu: 'assets/dokum.png',
        mumcu: 'assets/mum.png',
        tas: 'assets/tas.png',
        mihlamaci: 'assets/tas.png',
        polisaj: 'assets/toptan.jpg',
        lazer: 'assets/dokum.png',
        toptanci: 'assets/toptan.jpg'
    },

    ORNEK_FIRMALAR: [
        {
            id: 'f001', ad: 'Altın İş Merkezi Döküm', kategoriId: 'dokumcu',
            sehir: 'İSTANBUL', tel: '905321112233',
            aciklama: 'Vakumlu döküm, yüksek hacimli altın ve gümüş üretim. Günlük 500+ parça kapasite.',
            premium: true, sponsor: true, durum: 'onaylandi', puan: 4.8,
            tamamlananIs: 186, cevapSuresi: '< 2 saat',
            eklenmeTarihi: '2026-01-10T10:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f002', ad: 'Elmas Mikro Mıhlama Atölyesi', kategoriId: 'mihlamaci',
            sehir: 'İZMİR', tel: '905423334455',
            aciklama: 'Mikroskop altında pırlanta ve fantezi taş kitleme. Tektaş ve yüzük uzmanlığı.',
            premium: true, sponsor: true, durum: 'onaylandi', puan: 4.9,
            eklenmeTarihi: '2026-02-14T09:30:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1515562141203-7a88fb7ce338?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f003', ad: 'Aurum Matrix Tasarım Stüdyosu', kategoriId: 'matrix',
            sehir: 'DENİZLİ', tel: '905556667788',
            aciklama: 'Matrix 9 & 10, STL ve 3DM arşivi. Alyans, tektaş ve fantezi model kütüphanesi.',
            premium: true, sponsor: false, durum: 'onaylandi', puan: 4.7,
            eklenmeTarihi: '2026-02-20T14:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f004', ad: 'Zirve Hassas Lazer Kesim', kategoriId: 'lazer',
            sehir: 'KAHRAMANMARAŞ', tel: '905339998877',
            aciklama: '0,1 mm altın plaka kesim, isim kazıma ve fantezi plaka üretimi.',
            premium: false, sponsor: true, durum: 'onaylandi', puan: 4.6,
            eklenmeTarihi: '2026-03-01T11:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1611591437281-460bf24535ce?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f005', ad: 'Anadolu Taş Tedarik', kategoriId: 'tas',
            sehir: 'İSTANBUL', tel: '905067788990',
            aciklama: 'GIA sertifikalı pırlanta, safir, zümrüt ve fantezi taş toptan tedarik.',
            premium: true, sponsor: true, durum: 'onaylandi', puan: 4.9,
            eklenmeTarihi: '2026-03-08T08:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1603561596112-0a132757a803?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f006', ad: 'Kapalıçarşı Ayar Evi', kategoriId: 'ayar',
            sehir: 'İSTANBUL', tel: '905124455667',
            aciklama: '916, 750, 585 ayar analizi. Hızlı rapor, sertifikalı laboratuvar.',
            premium: false, sponsor: false, durum: 'onaylandi', puan: 4.5,
            eklenmeTarihi: '2026-03-12T16:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f007', ad: 'Rhino Pro Model Ofisi', kategoriId: 'rhino',
            sehir: 'ANKARA', tel: '905334455667',
            aciklama: 'Rhino 7/8 ile organik ve geometrik kuyumcu modelleme. Render ve STL teslim.',
            premium: true, sponsor: false, durum: 'onaylandi', puan: 4.7,
            eklenmeTarihi: '2026-03-18T10:30:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f008', ad: 'Marmara Zincir Sanayi', kategoriId: 'zincir',
            sehir: 'BURSA', tel: '905228899001',
            aciklama: 'İtalyan ve fantezi zincir üretimi. 14K, 18K, 22K gramaj seçenekleri.',
            premium: false, sponsor: true, durum: 'onaylandi', puan: 4.4,
            eklenmeTarihi: '2026-03-22T13:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f009', ad: 'Beta Demo Başvuru Atölyesi', kategoriId: 'polisaj',
            sehir: 'İZMİR', tel: '905009887766',
            aciklama: 'Admin onayı bekleyen örnek başvuru kaydı.',
            premium: false, sponsor: false, durum: 'beklemede', puan: 0,
            eklenmeTarihi: '2026-03-25T09:00:00.000Z',
            gorsel: null
        },
        {
            id: 'f010', ad: 'Nova Kuyumculuk Malzeme', kategoriId: 'malzeme',
            sehir: 'İSTANBUL', tel: '905331122334',
            aciklama: 'Genel kuyumculuk malzeme ve aparat toptan tedarik. Hızlı sevkiyat.',
            premium: false, sponsor: false, durum: 'onaylandi', puan: 4.3,
            eklenmeTarihi: '2026-03-20T10:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f011', ad: 'Prestij Vitrin Sistemleri', kategoriId: 'vitrin',
            sehir: 'İSTANBUL', tel: '905442233445',
            aciklama: 'Kuyumcu vitrin, manken ve LED aydınlatma çözümleri. Montaj dahil.',
            premium: true, sponsor: true, durum: 'onaylandi', puan: 4.6,
            eklenmeTarihi: '2026-03-21T11:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f012', ad: 'Elegance Kutu & Ambalaj', kategoriId: 'kutu',
            sehir: 'BURSA', tel: '905553344556',
            aciklama: 'Özel tasarım kuyumcu kutuları, süet çantalar ve marka baskılı ambalaj.',
            premium: false, sponsor: false, durum: 'onaylandi', puan: 4.4,
            eklenmeTarihi: '2026-03-23T14:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 'f013', ad: 'Kapalıçarşı Ramat Evi', kategoriId: 'ramat',
            sehir: 'İSTANBUL', tel: '905127788990',
            aciklama: 'Hurda altın, gümüş ve değerli metal ramat işlemleri. Şeffaf tartım ve ödeme.',
            premium: false, sponsor: false, durum: 'onaylandi', puan: 4.5,
            eklenmeTarihi: '2026-03-24T09:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=800&q=80'
        },
        {
            id: 'f014', ad: 'Altın Tel & Lehim Merkezi', kategoriId: 'lehim',
            sehir: 'İSTANBUL', tel: '905338877665',
            aciklama: 'Altın lehim, kaynak teli ve flux kimyasalları. Toptan ve perakende.',
            premium: false, sponsor: false, durum: 'onaylandi', puan: 4.2,
            eklenmeTarihi: '2026-03-19T12:00:00.000Z',
            gorsel: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80'
        }
    ],

    /* Kullanıcı paneli demo verisi (Beta iskelet) */
    PANEL_DEMO: {
        profil: {
            firmaAd: 'Arıcan Vakumlu Döküm Merkezi',
            kategori: 'Dökümcü',
            sehir: 'İSTANBUL',
            durum: 'Onay bekliyor',
            tel: '905321112233',
            aciklama: 'Sıfır gözenekli altın, gümüş ve platin döküm hatları. Günlük yüksek hacimli iş teslimi.'
        },
        isTalepleri: [
            { id: 'pit1', baslik: '22 ayar bilezik seri üretimi', durum: 'Açık', teklifSayisi: 4, tarih: '28.06.2026' },
            { id: 'pit2', baslik: 'Tektaş montür mıhlama', durum: 'Teklif toplanıyor', teklifSayisi: 2, tarih: '25.06.2026' }
        ],
        teklifler: [
            { id: 'ptk1', isBaslik: 'Fantezi kolye döküm', firma: 'Kuzey CAD Atölyesi', tutar: '₺18.500', durum: 'Bekliyor' },
            { id: 'ptk2', isBaslik: 'Lazer kesim plaka', firma: 'Zirve Lazer Kesim', tutar: '₺4.200', durum: 'Kabul edildi' }
        ],
        malzemeIlanlari: [
            { id: 'pml1', baslik: 'Japon freze uç seti', fiyat: '₺6.750', durum: 'Yayında', goruntulenme: 124 },
            { id: 'pml2', baslik: 'Mikro motor + el parçası', fiyat: '₺9.900', durum: 'Taslak', goruntulenme: 0 }
        ],
        hesap: {
            bildirimler: 'E-posta ve uygulama bildirimleri',
            guvenlik: 'İki adımlı doğrulama v1.0\'da'
        }
    },

    /* Admin panel demo verisi (Beta iskelet — panel kapalıyken referans) */
    ADMIN_PANEL_DEMO: {
        isTalepleri: [
            { id: 'ait1', baslik: '500 adet alyans üretimi', sehir: 'İZMİR', basvuru: '14.06.2026' },
            { id: 'ait2', baslik: 'Pırlanta montür işi', sehir: 'İSTANBUL', basvuru: '13.06.2026' }
        ],
        malzemeler: [
            { id: 'aml1', baslik: 'Terazi kalibrasyon seti', satici: 'Teknik Tedarik', durum: 'İncelemede' },
            { id: 'aml2', baslik: 'Sarf kimyasal paketi', satici: 'Altın Kimya', durum: 'İncelemede' }
        ],
        kullanicilar: [
            { id: 'u1', ad: 'Mehmet Y.', email: 'mehmet@ornek-atolye.com', rol: 'Firma', durum: 'Aktif' },
            { id: 'u2', ad: 'Ayşe K.', email: 'ayse@ornek-ticaret.com', rol: 'Firma', durum: 'Beklemede' }
        ],
        raporlar: {
            toplamFirma: 128,
            bekleyenBasvuru: 7,
            aylikIsTalebi: 34,
            aktifMalzeme: 56
        }
    }
};


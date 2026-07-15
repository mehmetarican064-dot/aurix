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
        { id: 'tamir', ad: 'Tamir', ikon: '⚙️' }
    ],

    SEHIRLER: ['İSTANBUL', 'İZMİR', 'ANKARA', 'BURSA', 'DENİZLİ', 'KAHRAMANMARAŞ', 'TRABZON', 'GAZİANTEP', 'ADANA', 'KONYA'],

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

    /* Ana sayfa kategorileri — sayılar yalnızca canlı veriden gelir */
    ESNAF_ANA_KATEGORILER: [
        { id: 'cizimci', ad: 'CAD Çizim', sembol: '◇', aciklama: '3D model, teknik çizim ve STL teslimi.' },
        { id: 'mumcu', ad: 'Mum Basım', sembol: '◆', aciklama: 'Kuyumcu mum basım ve model hazırlığı.' },
        { id: 'dokumcu', ad: 'Döküm', sembol: '⚙', aciklama: 'Altın, gümüş ve fantezi döküm üretimi.' },
        { id: 'mihlamaci', ad: 'Mıhlama', sembol: '◈', aciklama: 'Taş kitleme ve mikro mıhlama işleri.' },
        { id: 'tas', ad: 'Taş', sembol: '✦', aciklama: 'Pırlanta ve değerli taş tedariki.' },
        { id: 'tamir', ad: 'Tamir', sembol: '⊕', aciklama: 'Bakım, ölçü ve tamir hizmetleri.' },
        { id: 'malzeme-tedarik', ad: 'Malzeme Tedarik', sembol: '▣', aciklama: 'Takı ekipmanları, makineler, sarf malzemeleri, el aletleri ve yedek parçalar.', ozelSayfa: 'malzeme' }
    ],

    /* Hero istatistik etiketleri — değerler yalnızca Supabase’den gelir */
    PLATFORM_ISTATISTIK: [
        { key: 'firma', etiket: 'Firma' },
        { key: 'isTalep', etiket: 'Açık İş Talebi' }
    ],

    CANLI_AKTIVITE: [],

    /* Firma profili güven alanları — v1.0 backend ile doldurulacak */
    DOGRULAMA_ALANLARI: [
        { id: 'vergi', etiket: 'Vergi doğrulandı' },
        { id: 'telefon', etiket: 'Telefon doğrulandı' },
        { id: 'adres', etiket: 'Adres doğrulandı' },
        { id: 'whatsapp', etiket: 'AURIX Mesaj doğrulandı' }
    ],

    /* Malzeme Pazarı kategorileri */
    MALZEME_KATEGORILER: [
        { id: 'lazer-makine', ad: 'Lazer Makineleri', ikon: '⚡' },
        { id: 'dokum-makine', ad: 'Döküm Makineleri', ikon: '⚙' },
        { id: 'polisaj', ad: 'Polisaj', ikon: '✨' },
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
        { id: 'yedek-parca', ad: 'Yedek Parçalar', ikon: '⚙' },
        { id: 'kalip-malzeme', ad: 'Kalıp Malzemeleri', ikon: '🔲' },
        { id: 'hammadde', ad: 'Hammadde & Tel', ikon: '〰' },
        { id: 'aksesuar', ad: 'Aksesuar & Parça', ikon: '⛓' },
        { id: 'parlatma', ad: 'Parlatma Malzemeleri', ikon: '✦' }
    ],

    MALZEME_URUNLER: [
        { id: 'mu001', kategoriId: 'dokum-makine', baslik: 'Vakum Döküm Makinesi 3kg', fiyat: '₺485.000', satici: 'İstanbul Kuyum Teknoloji', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true },
        { id: 'mu002', kategoriId: 'kimyasal', baslik: 'Ultrasonik Temizleyici 6L', fiyat: '₺14.800', satici: 'Vizyon Döküm Tedarik', sehir: 'Bursa', durum: 'Stokta', dogrulandi: true },
        { id: 'mu003', kategoriId: 'motor', baslik: 'Polisaj Motoru 1/4 HP', fiyat: '₺7.200', satici: 'Ege Polisaj Tedarik', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true },
        { id: 'mu004', kategoriId: 'kalem', baslik: 'Gravür Kalemi Seti 12 Parça', fiyat: '₺680', satici: 'Kale Kalıp Malzeme', sehir: 'Denizli', durum: 'Stokta', dogrulandi: true },
        { id: 'mu005', kategoriId: 'motor', baslik: 'El Motoru Hanging 1/4 HP', fiyat: '₺6.400', satici: 'İstanbul Kuyum Teknoloji', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true },
        { id: 'mu006', kategoriId: 'mikromotor', baslik: 'Saeshin Strong 210 Mikromotor', fiyat: '₺12.500', satici: 'Ahenk Kuyum Malzeme', sehir: 'Konya', durum: 'Stokta', dogrulandi: true },
        { id: 'mu007', kategoriId: 'matkap-uc', baslik: 'Matkap Ucu Seti 0,5–3mm HSS', fiyat: '₺720', satici: 'Lider Lazer Tedarik', sehir: 'Kahramanmaraş', durum: 'Stokta', dogrulandi: true },
        { id: 'mu008', kategoriId: 'mihlama-alet', baslik: 'Mıhlama Kalemi Profesyonel', fiyat: '₺1.950', satici: 'Nova Mıhlama Tedarik', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true },
        { id: 'mu009', kategoriId: 'pense', baslik: 'Kuyumcu Pense Seti 6 Parça', fiyat: '₺890', satici: 'Ahenk Kuyum Malzeme', sehir: 'Konya', durum: 'Stokta', dogrulandi: true },
        { id: 'mu010', kategoriId: 'kalip-malzeme', baslik: 'Kalıp Lastiği 2mm Rulo', fiyat: '₺340', satici: 'Atlas Kalıp Malzeme', sehir: 'Bursa', durum: 'Stokta', dogrulandi: true },
        { id: 'mu011', kategoriId: 'kalip-malzeme', baslik: 'Döküm Alçısı 25kg', fiyat: '₺580', satici: 'Kale Kalıp Malzeme', sehir: 'Denizli', durum: 'Stokta', dogrulandi: true },
        { id: 'mu012', kategoriId: 'kalip-malzeme', baslik: 'Grafit Pota Seti 3 Boy', fiyat: '₺2.100', satici: 'Altıneller Döküm Tedarik', sehir: 'Kahramanmaraş', durum: 'Stokta', dogrulandi: true },
        { id: 'mu013', kategoriId: 'sarf', baslik: 'Refrakter Malzeme Karışımı 5kg', fiyat: '₺760', satici: 'Mira Döküm Kimya', sehir: 'Denizli', durum: 'Stokta', dogrulandi: true },
        { id: 'mu014', kategoriId: 'hammadde', baslik: '925 Gümüş Tel 1mm 50g', fiyat: '₺420', satici: 'Doruk Gold Hammadde', sehir: 'Ankara', durum: 'Stokta', dogrulandi: true },
        { id: 'mu015', kategoriId: 'hammadde', baslik: '14 Ayar Altın Tel 0,8mm', fiyat: '₺1.850', satici: 'Doruk Gold Hammadde', sehir: 'Ankara', durum: 'Stokta', dogrulandi: true },
        { id: 'mu016', kategoriId: 'aksesuar', baslik: 'İtalyan Zincir 45cm 14K', fiyat: '₺3.400', satici: 'Marina Stone Aksesuar', sehir: 'Trabzon', durum: 'Stokta', dogrulandi: true },
        { id: 'mu017', kategoriId: 'aksesuar', baslik: 'Kuyumcu Kilit Seti 8mm', fiyat: '₺290', satici: 'Ahenk Kuyum Malzeme', sehir: 'Konya', durum: 'Stokta', dogrulandi: true },
        { id: 'mu018', kategoriId: 'aksesuar', baslik: 'Taş Yuvası Seti 3–6mm', fiyat: '₺540', satici: 'Elmas Stone Tedarik', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true },
        { id: 'mu019', kategoriId: 'parlatma', baslik: 'Zımpara Disk Seti 120–3000 grit', fiyat: '₺980', satici: 'Ege Polisaj Tedarik', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true },
        { id: 'mu020', kategoriId: 'parlatma', baslik: 'Parlatma Keçesi Seti 6 Parça', fiyat: '₺650', satici: 'Ege Polisaj Tedarik', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true },
        { id: 'mu021', kategoriId: 'lazer-makine', baslik: 'Fiber Lazer Kesim 30W', fiyat: '₺185.000', satici: 'Lider Lazer Makine', sehir: 'Kahramanmaraş', durum: 'Stokta', dogrulandi: true },
        { id: 'mu022', kategoriId: 'terazi', baslik: 'Hassas Dijital Terazi 0,001g', fiyat: '₺8.900', satici: 'Prestij Ayar Ekipman', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true },
        { id: 'mu023', kategoriId: 'freze', baslik: 'Carbide Freze Seti 20 Parça', fiyat: '₺1.450', satici: 'Zenith Jewelry Works', sehir: 'Ankara', durum: 'Stokta', dogrulandi: true },
        { id: 'mu024', kategoriId: 'mihlama-alet', baslik: 'Mikro Mıhlama Pens Seti', fiyat: '₺2.400', satici: 'Safir Jewelry Tools', sehir: 'Gaziantep', durum: 'Stokta', dogrulandi: true },
        { id: 'mu025', kategoriId: 'el-alet', baslik: 'Kuyumcu El Aleti Seti 12 Parça', fiyat: '₺3.200', satici: 'İnci Gold Design Tedarik', sehir: 'Adana', durum: 'Stokta', dogrulandi: true },
        { id: 'mu026', kategoriId: 'sarf', baslik: 'Lehim Teli 0,5mm 50g', fiyat: '₺380', satici: 'Arıcan Kuyumculuk Tedarik', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true },
        { id: 'mu027', kategoriId: 'polisaj', baslik: 'Profesyonel Polisaj Fırça Seti', fiyat: '₺1.850', satici: 'Ege Polisaj Tedarik', sehir: 'İzmir', durum: 'Stokta', dogrulandi: true },
        { id: 'mu028', kategoriId: 'lazer-makine', baslik: 'CO2 Lazer Kazıma 40W', fiyat: '₺95.000', satici: 'Lider Lazer Makine', sehir: 'Kahramanmaraş', durum: 'Sipariş', dogrulandi: true },
        { id: 'mu029', kategoriId: 'yedek-parca', baslik: 'Vakum Döküm Pompa Membranı', fiyat: '₺2.850', satici: 'İstanbul Kuyum Teknoloji', sehir: 'İstanbul', durum: 'Stokta', dogrulandi: true },
        { id: 'mu030', kategoriId: 'yedek-parca', baslik: 'Lazer Lens Seti 20mm Fiber', fiyat: '₺4.200', satici: 'Lider Lazer Makine', sehir: 'Kahramanmaraş', durum: 'Stokta', dogrulandi: true }
    ],

    NEDEN_AURIX: [
        { ikon: 'shield', baslik: 'Doğrulanmış Firmalar', metin: 'Onaylı profiller ve şeffaf firma bilgileri.' },
        { ikon: 'teklif', baslik: 'Teklif Toplama', metin: 'Birden fazla firmadan hızlı teklif alın.' },
        { ikon: 'guven', baslik: 'Güvenli İş Süreci', metin: 'Doğrudan iletişim ve güvenilir eşleşme.' },
        { ikon: 'ag', baslik: 'Profesyonel Ağ', metin: 'Tüm kuyumculuk ekosistemi tek çatıda.' }
    ],

    VARSAYILAN_GORSEL: 'assets/images/firma.png',

    /* Kategori bazlı yerel kapak görselleri — assets/images/ */
    KATEGORI_KAPAK_GORSELLERI: {
        cizimci: 'assets/images/cad.png',
        matrix: 'assets/images/cad.png',
        rhino: 'assets/images/cad.png',
        dokumcu: 'assets/images/dokum.png',
        mumcu: 'assets/images/mum.png',
        kalipci: 'assets/images/kalip.png',
        mihlamaci: 'assets/images/mihlama.png',
        tas: 'assets/images/tas.png',
        ayar: 'assets/images/malzeme.jpg',
        ramat: 'assets/images/dokum.png',
        polisaj: 'assets/images/malzeme.jpg',
        lazer: 'assets/images/lazer.png',
        makine: 'assets/images/makine.png',
        zincir: 'assets/images/malzeme.jpg',
        kilit: 'assets/images/malzeme.jpg',
        bilezik: 'assets/images/malzeme.jpg',
        toptanci: 'assets/images/firma.png',
        vitrin: 'assets/images/firma.png',
        kutu: 'assets/images/firma.png',
        malzeme: 'assets/images/malzeme.jpg',
        sarf: 'assets/images/malzeme.jpg',
        kimyasal: 'assets/images/malzeme.jpg',
        tel: 'assets/images/malzeme.jpg',
        lehim: 'assets/images/malzeme.jpg',
        aparat: 'assets/images/malzeme.jpg',
        tamir: 'assets/images/malzeme.jpg'
    },

    /* Firmalar sayfası yalnızca Supabase; örnek firma listesi yok */
    ORNEK_FIRMALAR: [],

    /* Firma paneli demo verisi (B2B dashboard — Beta) */
    PANEL_DEMO: {
        dashboard: {
            ozet: {
                gunlukKazanc: '₺6.850',
                aylikKazanc: '₺48.600',
                bekleyenOdemeler: '₺9.400',
                hesabaGececek: '₺14.200',
                tamamlananIs: '214',
                aktifIs: '4'
            },
            odemeKarti: {
                mevcutBakiye: '₺14.200',
                bekleyenBakiye: '₺9.400',
                komisyon: '₺10.740',
                tahminiOdeme: '15.07.2026',
                ibanDurumu: 'Doğrulandı',
                ibanMaskeli: 'TR••••••••••1234'
            },
            performansOzet: {
                profilGoruntulenme: '428',
                teklifDonus: '%42',
                musteriMemnuniyeti: '4.8 / 5',
                tamamlamaOrani: '%96'
            },
            yeniTeklifler: [
                { isAdi: '925 gümüş erkek yüzük dökümü', musteri: 'Kuzey Tasarım', tutar: '₺21.500', durum: 'Bekliyor' },
                { isAdi: 'Gram altın plaka lazer kesim', musteri: 'Lider Lazer', tutar: '₺7.200', durum: 'İnceleniyor' },
                { isAdi: 'Fantezi kolye döküm', musteri: 'Anadolu CAD Tasarım', tutar: '₺19.800', durum: 'Bekliyor' },
                { isAdi: 'Pırlanta mıhlama — 36 adet', musteri: 'Nova Mıhlama', tutar: '₺11.400', durum: 'Bekliyor' }
            ],
            devamEdenIsler: [
                { baslik: 'Tektaş montür mıhlama', musteri: 'Elmas Stone', termin: '18.07.2026', durum: 'Devam ediyor', tutar: '₺8.500' },
                { baslik: 'Alyans prototip döküm', musteri: 'Safir Jewelry', termin: '22.07.2026', durum: 'Üretimde', tutar: '₺12.400' },
                { baslik: '18 ayar küpe seri döküm', musteri: 'Nova Mıhlama', termin: '25.07.2026', durum: 'Bekliyor', tutar: '₺18.600' }
            ],
            tamamlananIsler: [
                { baslik: '22 ayar alyans serisi', musteri: 'Ahenk Kuyum', termin: '05.07.2026', durum: 'Teslim edildi', tutar: '₺32.000' },
                { baslik: 'Platin mini döküm seti', musteri: 'Vizyon Döküm', termin: '28.06.2026', durum: 'Teslim edildi', tutar: '₺24.000' },
                { baslik: '18 ayar fantezi küpe', musteri: 'İnci Gold Design', termin: '05.07.2026', durum: 'Teslim edildi', tutar: '₺6.200' }
            ],
            yaklasanOdemeler: [
                { baslik: 'Temmuz hakediş ödemesi', musteri: 'AURIX Ödeme', termin: '15.07.2026', durum: 'Planlandı', tutar: '₺14.200' },
                { baslik: 'Mıhlama işi tahsilatı', musteri: 'Elmas Stone', termin: '18.07.2026', durum: 'Bekliyor', tutar: '₺8.500' },
                { baslik: 'Alyans döküm bakiyesi', musteri: 'Safir Jewelry', termin: '22.07.2026', durum: 'Bekliyor', tutar: '₺4.800' }
            ],
            aktiviteler: [
                { metin: '925 gümüş erkek yüzük dökümü için teklif alındı', zaman: '45 dk önce' },
                { metin: '22 ayar alyans serisi teslim edildi — ₺32.000', zaman: 'Dün 17:20' },
                { metin: 'Profiliniz 18 kez görüntülendi', zaman: 'Dün' },
                { metin: 'Haziran hakediş ödemesi hesabınıza aktarıldı', zaman: '01.07.2026' },
                { metin: 'Pırlanta mıhlama işi tamamlandı — 4.9 puan', zaman: '28.06.2026' }
            ]
        },
        gelirler: {
            toplamKazanc: '₺214.800',
            komisyon: '₺10.740',
            cekilebilir: '₺14.200',
            bekleyen: '₺9.400',
            sonrakiOdemeTarihi: '15.07.2026',
            ibanMaskeli: 'TR••••••••••1234',
            gecmis: [
                { tarih: '01.07.2026', tutar: '₺16.400', durum: 'Ödendi', aciklama: 'Haziran hakediş ödemesi' },
                { tarih: '15.06.2026', tutar: '₺14.200', durum: 'Ödendi', aciklama: 'Mayıs hakediş ödemesi' },
                { tarih: '28.05.2026', tutar: '₺11.600', durum: 'Ödendi', aciklama: 'Nisan hakediş ödemesi' },
                { tarih: '10.05.2026', tutar: '₺8.900', durum: 'Hazırlanıyor', aciklama: 'Mart kapanış düzeltmesi' },
                { tarih: '02.05.2026', tutar: '₺7.800', durum: 'Beklemede', aciklama: 'Ek iş onay sürecinde' }
            ]
        },
        isler: {
            sayac: { bekleyen: 3, devam: 4, teslim: 214, iptal: 2 },
            liste: [
                { baslik: '925 gümüş erkek yüzük dökümü', musteri: 'Kuzey Tasarım', durum: 'Bekliyor', termin: '28.07.2026', tutar: '₺21.500' },
                { baslik: '22 ayar bilezik seri üretimi', musteri: 'Ahenk Kuyum', durum: 'Bekliyor', termin: '25.07.2026', tutar: '₺32.000' },
                { baslik: 'Tektaş montür mıhlama', musteri: 'Elmas Stone', durum: 'Devam ediyor', termin: '18.07.2026', tutar: '₺8.500' },
                { baslik: 'Alyans prototip döküm', musteri: 'Safir Jewelry', durum: 'Üretimde', termin: '22.07.2026', tutar: '₺12.400' },
                { baslik: '18 ayar fantezi küpe dökümü', musteri: 'İnci Gold Design', durum: 'Teslim edildi', termin: '05.07.2026', tutar: '₺6.200' },
                { baslik: 'Platin mini döküm seti', musteri: 'Vizyon Döküm', durum: 'Teslim edildi', termin: '28.06.2026', tutar: '₺24.000' }
            ]
        },
        /* Canlı teklifler Supabase’den; panel demo listesi yok */
        teklifler: [],
        profil: {
            firmaAd: 'Arıcan Kuyumculuk',
            kategori: 'Dökümcü',
            sehir: 'İSTANBUL',
            durum: 'Onaylı',
            tel: '905321112233',
            aciklama: 'Vakumlu altın ve gümüş döküm. Günlük 600+ parça kapasite, sıfır gözenek garantisi.',
            tamamlamaOrani: 94
        },
        performans: {
            tamamlananIs: 214,
            ortTeslim: '3.8 gün',
            ortPuan: '4.8',
            goruntulenme30: 428,
            profilZiyaret: 112,
            teklifDonus: '%42',
            teslimOrani: '%96',
            musteriMemnuniyeti: '4.8 / 5',
            grafik: [
                { ay: 'Oca', tutar: 24800 },
                { ay: 'Şub', tutar: 31200 },
                { ay: 'Mar', tutar: 35600 },
                { ay: 'Nis', tutar: 38400 },
                { ay: 'May', tutar: 44200 },
                { ay: 'Haz', tutar: 48600 }
            ]
        },
        ayarlar: {
            firmaBildirim: true,
            whatsappBildirim: true,
            odemeBildirim: false,
            profilGorunurluk: true
        }
    },

    /* Admin panel — bekleyen iş/malzeme kuyruğu + kullanıcı demo (oturum içi moderasyon) */
    ADMIN_PANEL_DEMO: {
        bekleyenIsTalepleri: [
            {
                id: 'ait1', kategoriId: 'dokumcu',
                baslik: '500 adet 14 ayar alyans dökümü',
                sehir: 'İzmir', adet: '500 adet', termin: '18 gün',
                butce: '₺95.000 – ₺120.000', teklifSayisi: 0,
                acilisTarihi: '10 Tem 2026', durum: 'Teklif bekliyor', durumTip: 'bekliyor',
                basvuru: '10.07.2026', sonGuncelleme: 'Az önce'
            },
            {
                id: 'ait2', kategoriId: 'mihlamaci',
                baslik: 'Pırlanta montür mıhlama — 48 adet',
                sehir: 'İstanbul', adet: '48 adet', termin: '9 gün',
                butce: '₺16.000 – ₺22.000', teklifSayisi: 0,
                acilisTarihi: '09 Tem 2026', durum: 'Teklif bekliyor', durumTip: 'bekliyor',
                basvuru: '09.07.2026', sonGuncelleme: '2 saat önce'
            },
            {
                id: 'ait3', kategoriId: 'polisaj',
                baslik: '22 ayar bilezik seri polisaj',
                sehir: 'Denizli', adet: '160 adet', termin: '7 gün',
                butce: '₺28.000 – ₺36.000', teklifSayisi: 0,
                acilisTarihi: '08 Tem 2026', durum: 'Acil', durumTip: 'acil',
                basvuru: '08.07.2026', sonGuncelleme: '5 saat önce'
            }
        ],
        bekleyenMalzemeler: [
            {
                id: 'aml1', kategoriId: 'kimyasal',
                baslik: 'Ultrasonik Temizleyici 10L Endüstriyel',
                fiyat: '₺22.400', satici: 'Vizyon Döküm Tedarik', sehir: 'Bursa',
                durum: 'Stokta', dogrulandi: false, basvuru: '09.07.2026'
            },
            {
                id: 'aml2', kategoriId: 'kalip-malzeme',
                baslik: 'Grafit Pota Seti 5 Boy',
                fiyat: '₺3.450', satici: 'Altıneller Döküm Tedarik', sehir: 'Kahramanmaraş',
                durum: 'Stokta', dogrulandi: false, basvuru: '08.07.2026'
            },
            {
                id: 'aml3', kategoriId: 'mikromotor',
                baslik: 'Saeshin Strong 204 Mikromotor Set',
                fiyat: '₺9.800', satici: 'Ahenk Kuyum Malzeme', sehir: 'Konya',
                durum: 'Sipariş', dogrulandi: false, basvuru: '07.07.2026'
            }
        ],
        kullanicilar: [
            { id: 'u1', ad: 'Mehmet Arıcan', email: 'mehmet@arican-kuyum.com', rol: 'Firma', durum: 'Aktif', durumTip: 'aktif', sehir: 'İstanbul', kayit: '12.03.2026' },
            { id: 'u2', ad: 'Ayşe Korkmaz', email: 'ayse@novamihlama.com', rol: 'Firma', durum: 'Aktif', durumTip: 'aktif', sehir: 'İzmir', kayit: '28.04.2026' },
            { id: 'u3', ad: 'Can Yılmaz', email: 'can@egepolisaj.com', rol: 'Firma', durum: 'Beklemede', durumTip: 'beklemede', sehir: 'İzmir', kayit: '06.07.2026' },
            { id: 'u4', ad: 'Elif Demir', email: 'elif@dorukgold.com', rol: 'Alıcı', durum: 'Aktif', durumTip: 'aktif', sehir: 'Ankara', kayit: '15.05.2026' },
            { id: 'u5', ad: 'Burak Şahin', email: 'burak@liderlazer.com', rol: 'Firma', durum: 'Askıda', durumTip: 'askida', sehir: 'Kahramanmaraş', kayit: '02.02.2026' },
            { id: 'u6', ad: 'Zeynep Aksoy', email: 'zeynep@safirjewelry.com', rol: 'Firma', durum: 'Aktif', durumTip: 'aktif', sehir: 'Gaziantep', kayit: '19.06.2026' }
        ]
    }
};


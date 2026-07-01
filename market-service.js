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
        { id: 'aparat', ad: 'Aparat', ikon: '🔧' }
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

    /* Ana sayfa — wireframe esnaf kategorileri */
    ESNAF_ANA_KATEGORILER: [
        { id: 'dokumcu', ad: 'Döküm', gorsel: '' },
        { id: 'mihlamaci', ad: 'Mıhlama', gorsel: '' },
        { id: 'cizimci', ad: 'Çizim', gorsel: '' },
        { id: 'ayar', ad: 'Ayar', gorsel: '' },
        { id: 'lazer', ad: 'Lazer', gorsel: '' },
        { id: 'tas', ad: 'Taş', gorsel: '' },
        { id: 'ramat', ad: 'Ramat', gorsel: '' },
        { id: 'kutu', ad: 'Ambalaj', gorsel: '' }
    ],

    NEDEN_AURIX: [
        { ikon: '⚡', baslik: 'Doğru firmaya hızlı ulaş', metin: 'Branş ve şehir filtreleriyle ihtiyacınız olan atölyeyi saniyeler içinde bulun.' },
        { ikon: '★', baslik: 'Güven veren profiller', metin: 'Doğrulanmış firma bilgileri, puanlama ve şeffaf kullanıcı geri bildirimleri.' },
        { ikon: '◈', baslik: 'Tüm sektör tek ağda', metin: 'Tasarımdan üretime, tedarikten mağaza ekipmanına kadar tüm kuyumculuk ekosistemi.' },
        { ikon: '⚖', baslik: 'Atölye, tedarikçi ve üreticileri karşılaştır', metin: 'Kapasite, uzmanlık ve konum bilgileriyle bilinçli seçim yapın.' }
    ],

    VARSAYILAN_GORSEL: 'https://images.unsplash.com/photo-1617032210775-8a046a4a4899?auto=format&fit=crop&w=600&q=80',

    ORNEK_FIRMALAR: [
        {
            id: 'f001', ad: 'Altın İş Merkezi Döküm', kategoriId: 'dokumcu',
            sehir: 'İSTANBUL', tel: '905321112233',
            aciklama: 'Vakumlu döküm, yüksek hacimli altın ve gümüş üretim. Günlük 500+ parça kapasite.',
            premium: true, sponsor: true, durum: 'onaylandi', puan: 4.8,
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
            gorsel: null
        },
        {
            id: 'f014', ad: 'Altın Tel & Lehim Merkezi', kategoriId: 'lehim',
            sehir: 'İSTANBUL', tel: '905338877665',
            aciklama: 'Altın lehim, kaynak teli ve flux kimyasalları. Toptan ve perakende.',
            premium: false, sponsor: false, durum: 'onaylandi', puan: 4.2,
            eklenmeTarihi: '2026-03-19T12:00:00.000Z',
            gorsel: null
        }
    ]
};


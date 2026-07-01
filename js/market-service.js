/**
 * Aurix Beta v0.1 — Kuyumcu piyasa veri katmanı (demo simülasyon)
 */
(function (window) {
    'use strict';

    var TAB_INSTRUMENTS = {
        kuyumcu: [
            'aurixEsnafAlis', 'aurixEsnafSatis',
            'kapalicarsiAlis', 'kapalicarsiSatis',
            'hasAltin', 'ayar24', 'ayar22', 'ayar18', 'ayar14', 'ayar8',
            'gramAltin',
            'ceyrekAltin', 'yarimAltin', 'tamAltin', 'cumhuriyetAltini',
            'ataAltin', 'resatAltini', 'hediyelikAltin',
            'gumus'
        ],
        doviz: [
            'dolar', 'euro', 'sterlin', 'frank', 'yen', 'riyal', 'dirhem',
            'kanada', 'avustralya', 'ruble', 'manat', 'yuan'
        ],
        altin: [
            'onsAltin', 'hasAltin', 'gramAltin', 'ceyrekAltin', 'yarimAltin',
            'tamAltin', 'cumhuriyetAltini', 'ayar22', 'ayar14'
        ]
    };

    var QUOTE_ORDER = [
        'aurixEsnafAlis', 'aurixEsnafSatis',
        'kapalicarsiAlis', 'kapalicarsiSatis',
        'hasAltin', 'ayar24', 'ayar22', 'ayar18', 'ayar14', 'ayar8', 'gramAltin',
        'ceyrekAltin', 'yarimAltin', 'tamAltin', 'cumhuriyetAltini',
        'ataAltin', 'resatAltini', 'hediyelikAltin',
        'gumus', 'dolar', 'euro', 'sterlin', 'frank', 'yen', 'riyal', 'dirhem',
        'kanada', 'avustralya', 'ruble', 'manat', 'yuan', 'onsAltin'
    ];

    var ESNAF_MARJ = { alis: 4, satis: 6 };

    var INSTRUMENT_META = {
        kapalicarsiAlis: {
            etiket: 'Kapalıçarşı Alış', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, tickPct: 0.0018, grup: 'kapali', tick: true
        },
        kapalicarsiSatis: {
            etiket: 'Kapalıçarşı Satış', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, tickPct: 0.0018, grup: 'kapali', tick: true
        },
        aurixEsnafAlis: {
            etiket: 'Aurix Esnaf Alış', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'aurix', derived: true, premium: true
        },
        aurixEsnafSatis: {
            etiket: 'Aurix Esnaf Satış', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'aurix', derived: true, premium: true
        },
        hasAltin: {
            etiket: 'Has Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        gramAltin: {
            etiket: 'Gram Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        ayar24: {
            etiket: '24 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        ayar22: {
            etiket: '22 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        ayar18: {
            etiket: '18 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        ayar14: {
            etiket: '14 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        ayar8: {
            etiket: '8 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        ceyrekAltin: {
            etiket: 'Çeyrek Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        yarimAltin: {
            etiket: 'Yarım Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        tamAltin: {
            etiket: 'Tam Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        cumhuriyetAltini: {
            etiket: 'Cumhuriyet Altını', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        ataAltin: {
            etiket: 'Ata Altını', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        resatAltini: {
            etiket: 'Reşat Altını', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        hediyelikAltin: {
            etiket: 'Hediyelik Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin', derived: true
        },
        gumus: {
            etiket: 'Gümüş', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.004, grup: 'kapali', tick: true
        },
        dolar: {
            etiket: 'USD', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        euro: {
            etiket: 'EUR', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        sterlin: {
            etiket: 'GBP', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        frank: {
            etiket: 'CHF', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        yen: {
            etiket: 'JPY', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.004, grup: 'doviz', tick: true
        },
        riyal: {
            etiket: 'SAR', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        dirhem: {
            etiket: 'AED', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        kanada: {
            etiket: 'CAD', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        avustralya: {
            etiket: 'AUD', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        ruble: {
            etiket: 'RUB', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.004, grup: 'doviz', tick: true
        },
        manat: {
            etiket: 'AZN', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        yuan: {
            etiket: 'CNY', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, tickPct: 0.003, grup: 'doviz', tick: true
        },
        onsAltin: {
            etiket: 'Ons Altın', birim: '$', decimals: 0, degisimDecimals: 1,
            thousands: true, tickPct: 0.002, grup: 'altin', tick: true
        }
    };

    var MOCK_SEED = {
        kapalicarsiAlis: 3118,
        kapalicarsiSatis: 3142,
        gumus: 38.42,
        dolar: 34.18,
        euro: 37.42,
        sterlin: 43.65,
        frank: 38.12,
        yen: 0.22,
        riyal: 9.11,
        dirhem: 9.31,
        kanada: 24.85,
        avustralya: 22.45,
        ruble: 0.38,
        manat: 20.12,
        yuan: 4.72,
        onsAltin: 2338
    };

    function makeRaw(id, deger, degisim) {
        var meta = INSTRUMENT_META[id];
        return {
            id: id,
            etiket: meta.etiket,
            birim: meta.birim,
            deger: deger,
            degisim: degisim || 0
        };
    }

    function computeDerived(state) {
        var alis = state.kapalicarsiAlis.deger;
        var satis = state.kapalicarsiSatis.deger;
        var alisD = state.kapalicarsiAlis.degisim;
        var satisD = state.kapalicarsiSatis.degisim;

        state.aurixEsnafAlis = makeRaw('aurixEsnafAlis', alis + ESNAF_MARJ.alis, alisD);
        state.aurixEsnafSatis = makeRaw('aurixEsnafSatis', satis + ESNAF_MARJ.satis, satisD);

        var has = (alis + satis) / 2;
        var hasD = (alisD + satisD) / 2;

        state.hasAltin = makeRaw('hasAltin', Math.round(has), Math.round(hasD));
        state.ayar24 = makeRaw('ayar24', Math.round(has), Math.round(hasD));
        state.ayar22 = makeRaw('ayar22', Math.round(has * 22 / 24), Math.round(hasD * 22 / 24));
        state.ayar18 = makeRaw('ayar18', Math.round(has * 18 / 24), Math.round(hasD * 18 / 24));
        state.ayar14 = makeRaw('ayar14', Math.round(has * 14 / 24), Math.round(hasD * 14 / 24));
        state.ayar8 = makeRaw('ayar8', Math.round(has * 8 / 24), Math.round(hasD * 8 / 24));
        state.gramAltin = makeRaw('gramAltin', Math.round(has), Math.round(hasD));
        state.ceyrekAltin = makeRaw('ceyrekAltin', Math.round(has * 1.632), Math.round(hasD * 1.632));
        state.yarimAltin = makeRaw('yarimAltin', Math.round(has * 3.264), Math.round(hasD * 3.264));
        state.tamAltin = makeRaw('tamAltin', Math.round(has * 7.216), Math.round(hasD * 7.216));
        state.cumhuriyetAltini = makeRaw('cumhuriyetAltini', Math.round(has * 6.696), Math.round(hasD * 6.696));
        state.ataAltin = makeRaw('ataAltin', Math.round(has * 7.390), Math.round(hasD * 7.390));
        state.resatAltini = makeRaw('resatAltini', Math.round(has * 7.320), Math.round(hasD * 7.320));
        state.hediyelikAltin = makeRaw('hediyelikAltin', Math.round(has * 1.050), Math.round(hasD * 1.050));
    }

    function formatTrNumber(num, meta) {
        meta = meta || { decimals: 2, thousands: false };
        var n = Number(num);
        if (!isFinite(n)) n = 0;
        if (meta.decimals === 0) {
            var intStr = String(Math.round(n));
            return meta.thousands ? intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : intStr;
        }
        var fixed = n.toFixed(meta.decimals);
        var pair = fixed.split('.');
        var intPart = pair[0];
        if (meta.thousands) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return intPart + ',' + pair[1];
    }

    function formatDegisim(delta, meta) {
        meta = meta || { degisimDecimals: 2 };
        var sign = delta >= 0 ? '+' : '-';
        var abs = Math.abs(delta);
        if (meta.degisimDecimals === 0) return sign + Math.round(abs);
        return sign + abs.toFixed(meta.degisimDecimals).replace('.', ',');
    }

    function initMockState(seed) {
        seed = seed || MOCK_SEED;
        var state = {
            kapalicarsiAlis: makeRaw('kapalicarsiAlis', seed.kapalicarsiAlis, 0),
            kapalicarsiSatis: makeRaw('kapalicarsiSatis', seed.kapalicarsiSatis, 0),
            gumus: makeRaw('gumus', seed.gumus, 0),
            dolar: makeRaw('dolar', seed.dolar, 0),
            euro: makeRaw('euro', seed.euro, 0),
            sterlin: makeRaw('sterlin', seed.sterlin, 0),
            frank: makeRaw('frank', seed.frank, 0),
            yen: makeRaw('yen', seed.yen, 0),
            riyal: makeRaw('riyal', seed.riyal, 0),
            dirhem: makeRaw('dirhem', seed.dirhem, 0),
            kanada: makeRaw('kanada', seed.kanada, 0),
            avustralya: makeRaw('avustralya', seed.avustralya, 0),
            ruble: makeRaw('ruble', seed.ruble, 0),
            manat: makeRaw('manat', seed.manat, 0),
            yuan: makeRaw('yuan', seed.yuan, 0),
            onsAltin: makeRaw('onsAltin', seed.onsAltin, 0)
        };
        computeDerived(state);
        return state;
    }

    function toDisplayQuote(raw) {
        var meta = INSTRUMENT_META[raw.id] || {};
        var delta = raw.degisim || 0;
        return {
            id: raw.id,
            etiket: raw.etiket,
            deger: formatTrNumber(raw.deger, meta),
            birim: raw.birim,
            degisim: formatDegisim(delta, meta),
            yon: delta >= 0 ? 'up' : 'down',
            grup: meta.grup || 'doviz',
            premium: !!meta.premium
        };
    }

    function filterQuotesByTab(quotes, tab) {
        var ids = TAB_INSTRUMENTS[tab] || TAB_INSTRUMENTS.kuyumcu;
        var map = {};
        quotes.forEach(function (q) { map[q.id] = q; });
        return ids.map(function (id) { return map[id]; }).filter(Boolean);
    }

    function getQuotesArray(state) {
        return QUOTE_ORDER.map(function (id) {
            return toDisplayQuote(state[id]);
        });
    }

    function randomTickValue(current, meta) {
        var pct = (Math.random() * meta.tickPct * 2) - meta.tickPct;
        var delta = current * pct;
        if (meta.decimals === 0) delta = Math.round(delta);
        var next = Math.max(0.01, current + delta);
        if (meta.decimals === 0) next = Math.round(next);
        return { deger: next, degisim: delta };
    }

    function MockMarketService(options) {
        options = options || {};
        this.intervalMs = options.intervalMs || 5000;
        this.listeners = [];
        this._timer = null;
        this._state = initMockState(options.seed);
    }

    MockMarketService.prototype.subscribe = function (fn) {
        if (typeof fn === 'function') this.listeners.push(fn);
        return function () {
            this.listeners = this.listeners.filter(function (l) { return l !== fn; });
        }.bind(this);
    };

    MockMarketService.prototype._emit = function () {
        var quotes = getQuotesArray(this._state);
        this.listeners.forEach(function (fn) {
            try { fn(quotes); } catch (e) { console.error('[MockMarketService]', e); }
        });
    };

    MockMarketService.prototype._tick = function () {
        var self = this;
        QUOTE_ORDER.forEach(function (id) {
            var meta = INSTRUMENT_META[id];
            if (!meta || !meta.tick) return;
            var q = self._state[id];
            var next = randomTickValue(q.deger, meta);
            q.deger = next.deger;
            q.degisim = next.degisim;
        });
        computeDerived(this._state);
        this._emit();
    };

    MockMarketService.prototype.start = function () {
        this.stop();
        this._emit();
        this._timer = setInterval(this._tick.bind(this), this.intervalMs);
    };

    MockMarketService.prototype.stop = function () {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    };

    MockMarketService.prototype.getSnapshot = function () {
        return getQuotesArray(this._state);
    };

    function create(type, options) {
        return new MockMarketService(options);
    }

    window.MarketService = {
        create: create,
        MockMarketService: MockMarketService,
        TAB_INSTRUMENTS: TAB_INSTRUMENTS,
        filterQuotesByTab: filterQuotesByTab
    };
}(window));

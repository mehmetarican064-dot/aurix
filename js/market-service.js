/**
 * AURIX — Kuyumcu piyasa veri katmanı (canlı kaynak: finans.truncgil.com)
 */
(function (window) {
    'use strict';

    var API_URL = 'https://finans.truncgil.com/v4/today.json';
    var FETCH_TIMEOUT_MS = 12000;

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
            thousands: true, grup: 'kapali'
        },
        kapalicarsiSatis: {
            etiket: 'Kapalıçarşı Satış', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'kapali'
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
            thousands: true, grup: 'altin'
        },
        gramAltin: {
            etiket: 'Gram Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        ayar24: {
            etiket: '24 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        ayar22: {
            etiket: '22 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        ayar18: {
            etiket: '18 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        ayar14: {
            etiket: '14 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        ayar8: {
            etiket: '8 Ayar', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        ceyrekAltin: {
            etiket: 'Çeyrek Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        yarimAltin: {
            etiket: 'Yarım Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        tamAltin: {
            etiket: 'Tam Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        cumhuriyetAltini: {
            etiket: 'Cumhuriyet Altını', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        ataAltin: {
            etiket: 'Ata Altını', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        resatAltini: {
            etiket: 'Reşat Altını', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        hediyelikAltin: {
            etiket: 'Hediyelik Altın', birim: 'TL', decimals: 0, degisimDecimals: 0,
            thousands: true, grup: 'altin'
        },
        gumus: {
            etiket: 'Gümüş', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'kapali'
        },
        dolar: {
            etiket: 'USD', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        euro: {
            etiket: 'EUR', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        sterlin: {
            etiket: 'GBP', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        frank: {
            etiket: 'CHF', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        yen: {
            etiket: 'JPY', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        riyal: {
            etiket: 'SAR', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        dirhem: {
            etiket: 'AED', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        kanada: {
            etiket: 'CAD', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        avustralya: {
            etiket: 'AUD', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        ruble: {
            etiket: 'RUB', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        manat: {
            etiket: 'AZN', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        yuan: {
            etiket: 'CNY', birim: 'TL', decimals: 2, degisimDecimals: 2,
            thousands: false, grup: 'doviz'
        },
        onsAltin: {
            etiket: 'Ons Altın', birim: '$', decimals: 0, degisimDecimals: 1,
            thousands: true, grup: 'altin'
        }
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

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function mid(row) {
        if (!row || typeof row !== 'object') return null;
        var b = num(row.Buying);
        var s = num(row.Selling);
        if (b != null && s != null) return (b + s) / 2;
        if (s != null) return s;
        if (b != null) return b;
        return null;
    }

    function changeAbs(row, deger) {
        var pct = num(row && row.Change);
        if (pct == null || deger == null) return 0;
        return deger * (pct / 100);
    }

    function pair(row) {
        if (!row || typeof row !== 'object') return null;
        var b = num(row.Buying);
        var s = num(row.Selling);
        if (b == null && s == null) return null;
        return {
            alis: b != null ? b : s,
            satis: s != null ? s : b,
            change: num(row.Change) || 0
        };
    }

    function buildStateFromApi(data) {
        var gra = pair(data.GRA);
        var has = pair(data.HAS);
        var yia = pair(data.YIA);
        var a18 = pair(data['18AYARALTIN']);
        var a14 = pair(data['14AYARALTIN']);
        var gumus = pair(data.GUMUS);
        var usd = pair(data.USD);
        var eur = pair(data.EUR);
        var gbp = pair(data.GBP);
        var chf = pair(data.CHF);
        var jpy = pair(data.JPY);
        var sar = pair(data.SAR);
        var aed = pair(data.AED);
        var cad = pair(data.CAD);
        var aud = pair(data.AUD);
        var rub = pair(data.RUB);
        var azn = pair(data.AZN);
        var cny = pair(data.CNY);
        var ons = pair(data.ONS);
        var ceyrek = pair(data.CEYREKALTIN);
        var yarim = pair(data.YARIMALTIN);
        var tam = pair(data.TAMALTIN);
        var cumhuriyet = pair(data.CUMHURIYETALTINI);
        var ata = pair(data.ATAALTIN);
        var resat = pair(data.RESATALTIN);

        if (!has && !gra && !usd) return null;

        var hasMid = has ? (has.alis + has.satis) / 2 : (gra ? (gra.alis + gra.satis) / 2 : null);
        if (hasMid == null) return null;

        var hasChg = has ? changeAbs(data.HAS, hasMid) : (gra ? changeAbs(data.GRA, hasMid) : 0);
        var kapAli = gra ? gra.alis : has.alis;
        var kapSat = gra ? gra.satis : has.satis;
        var kapChg = gra ? changeAbs(data.GRA, (kapAli + kapSat) / 2) : hasChg;

        var state = {
            kapalicarsiAlis: makeRaw('kapalicarsiAlis', Math.round(kapAli), Math.round(kapChg)),
            kapalicarsiSatis: makeRaw('kapalicarsiSatis', Math.round(kapSat), Math.round(kapChg)),
            gumus: makeRaw('gumus', gumus ? ((gumus.alis + gumus.satis) / 2) : 0, gumus ? changeAbs(data.GUMUS, (gumus.alis + gumus.satis) / 2) : 0),
            dolar: makeRaw('dolar', usd ? ((usd.alis + usd.satis) / 2) : 0, usd ? changeAbs(data.USD, (usd.alis + usd.satis) / 2) : 0),
            euro: makeRaw('euro', eur ? ((eur.alis + eur.satis) / 2) : 0, eur ? changeAbs(data.EUR, (eur.alis + eur.satis) / 2) : 0),
            sterlin: makeRaw('sterlin', gbp ? ((gbp.alis + gbp.satis) / 2) : 0, gbp ? changeAbs(data.GBP, (gbp.alis + gbp.satis) / 2) : 0),
            frank: makeRaw('frank', chf ? ((chf.alis + chf.satis) / 2) : 0, chf ? changeAbs(data.CHF, (chf.alis + chf.satis) / 2) : 0),
            yen: makeRaw('yen', jpy ? ((jpy.alis + jpy.satis) / 2) : 0, jpy ? changeAbs(data.JPY, (jpy.alis + jpy.satis) / 2) : 0),
            riyal: makeRaw('riyal', sar ? ((sar.alis + sar.satis) / 2) : 0, sar ? changeAbs(data.SAR, (sar.alis + sar.satis) / 2) : 0),
            dirhem: makeRaw('dirhem', aed ? ((aed.alis + aed.satis) / 2) : 0, aed ? changeAbs(data.AED, (aed.alis + aed.satis) / 2) : 0),
            kanada: makeRaw('kanada', cad ? ((cad.alis + cad.satis) / 2) : 0, cad ? changeAbs(data.CAD, (cad.alis + cad.satis) / 2) : 0),
            avustralya: makeRaw('avustralya', aud ? ((aud.alis + aud.satis) / 2) : 0, aud ? changeAbs(data.AUD, (aud.alis + aud.satis) / 2) : 0),
            ruble: makeRaw('ruble', rub ? ((rub.alis + rub.satis) / 2) : 0, rub ? changeAbs(data.RUB, (rub.alis + rub.satis) / 2) : 0),
            manat: makeRaw('manat', azn ? ((azn.alis + azn.satis) / 2) : 0, azn ? changeAbs(data.AZN, (azn.alis + azn.satis) / 2) : 0),
            yuan: makeRaw('yuan', cny ? ((cny.alis + cny.satis) / 2) : 0, cny ? changeAbs(data.CNY, (cny.alis + cny.satis) / 2) : 0),
            onsAltin: makeRaw('onsAltin', ons && (ons.satis || ons.alis) ? (ons.satis || ons.alis) : 0, ons ? changeAbs(data.ONS, ons.satis || ons.alis) : 0)
        };

        state.aurixEsnafAlis = makeRaw('aurixEsnafAlis', Math.round(kapAli + ESNAF_MARJ.alis), Math.round(kapChg));
        state.aurixEsnafSatis = makeRaw('aurixEsnafSatis', Math.round(kapSat + ESNAF_MARJ.satis), Math.round(kapChg));

        state.hasAltin = makeRaw('hasAltin', Math.round(hasMid), Math.round(hasChg));
        state.ayar24 = makeRaw('ayar24', Math.round(hasMid), Math.round(hasChg));

        var a22mid = yia ? (yia.alis + yia.satis) / 2 : hasMid * 22 / 24;
        var a22chg = yia ? changeAbs(data.YIA, a22mid) : hasChg * 22 / 24;
        state.ayar22 = makeRaw('ayar22', Math.round(a22mid), Math.round(a22chg));

        var a18mid = a18 ? (a18.alis + a18.satis) / 2 : hasMid * 18 / 24;
        var a18chg = a18 ? changeAbs(data['18AYARALTIN'], a18mid) : hasChg * 18 / 24;
        state.ayar18 = makeRaw('ayar18', Math.round(a18mid), Math.round(a18chg));

        var a14mid = a14 ? (a14.alis + a14.satis) / 2 : hasMid * 14 / 24;
        var a14chg = a14 ? changeAbs(data['14AYARALTIN'], a14mid) : hasChg * 14 / 24;
        state.ayar14 = makeRaw('ayar14', Math.round(a14mid), Math.round(a14chg));

        state.ayar8 = makeRaw('ayar8', Math.round(hasMid * 8 / 24), Math.round(hasChg * 8 / 24));

        var graMid = gra ? (gra.alis + gra.satis) / 2 : hasMid;
        state.gramAltin = makeRaw('gramAltin', Math.round(graMid), Math.round(gra ? changeAbs(data.GRA, graMid) : hasChg));

        function coin(id, p, apiKey, factor) {
            var m = p ? (p.alis + p.satis) / 2 : hasMid * factor;
            var c = p ? changeAbs(data[apiKey], m) : hasChg * factor;
            state[id] = makeRaw(id, Math.round(m), Math.round(c));
        }

        coin('ceyrekAltin', ceyrek, 'CEYREKALTIN', 1.632);
        coin('yarimAltin', yarim, 'YARIMALTIN', 3.264);
        coin('tamAltin', tam, 'TAMALTIN', 7.216);
        coin('cumhuriyetAltini', cumhuriyet, 'CUMHURIYETALTINI', 6.696);
        coin('ataAltin', ata, 'ATAALTIN', 7.390);
        coin('resatAltini', resat, 'RESATALTIN', 7.320);
        state.hediyelikAltin = makeRaw('hediyelikAltin', Math.round(hasMid * 1.050), Math.round(hasChg * 1.050));

        return state;
    }

    function formatTrNumber(numVal, meta) {
        meta = meta || { decimals: 2, thousands: false };
        var n = Number(numVal);
        if (!isFinite(n)) n = 0;
        if (meta.decimals === 0) {
            var intStr = String(Math.round(n));
            return meta.thousands ? intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : intStr;
        }
        var fixed = n.toFixed(meta.decimals);
        var pairParts = fixed.split('.');
        var intPart = pairParts[0];
        if (meta.thousands) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return intPart + ',' + pairParts[1];
    }

    function formatDegisimPct(delta, deger) {
        var base = Number(deger) || 0;
        if (!base) return { text: '0,00%', yon: 'flat' };
        var pct = (Number(delta) || 0) / base * 100;
        if (!isFinite(pct) || Math.abs(pct) < 0.005) {
            return { text: '0,00%', yon: 'flat' };
        }
        var sign = pct > 0 ? '+' : '';
        return {
            text: sign + pct.toFixed(2).replace('.', ',') + '%',
            yon: pct > 0 ? 'up' : 'down'
        };
    }

    function toDisplayQuote(raw) {
        var meta = INSTRUMENT_META[raw.id] || {};
        var delta = raw.degisim || 0;
        var deg = formatDegisimPct(delta, raw.deger);
        return {
            id: raw.id,
            etiket: raw.etiket,
            deger: formatTrNumber(raw.deger, meta),
            birim: raw.birim,
            degisim: deg.text,
            yon: deg.yon,
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

    function fetchJson(url) {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = null;
        var opts = { method: 'GET', cache: 'no-store' };
        if (ctrl) {
            opts.signal = ctrl.signal;
            timer = setTimeout(function () {
                try { ctrl.abort(); } catch (e) { /* ignore */ }
            }, FETCH_TIMEOUT_MS);
        }
        return fetch(url, opts).then(function (res) {
            if (timer) clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).catch(function (err) {
            if (timer) clearTimeout(timer);
            throw err;
        });
    }

    function LiveMarketService(options) {
        options = options || {};
        this.intervalMs = options.intervalMs || 60000;
        this.listeners = [];
        this._timer = null;
        this._state = null;
        this._fetching = false;
        this._lastOk = false;
        this._lastError = null;
        this._lastUpdate = null;
        this._checked = false;
    }

    LiveMarketService.prototype.subscribe = function (fn) {
        if (typeof fn === 'function') this.listeners.push(fn);
        return function () {
            this.listeners = this.listeners.filter(function (l) { return l !== fn; });
        }.bind(this);
    };

    LiveMarketService.prototype._emit = function (quotes) {
        this.listeners.forEach(function (fn) {
            try { fn(quotes); } catch (e) { console.error('[LiveMarketService]', e); }
        });
    };

    LiveMarketService.prototype._applyError = function (err) {
        this._checked = true;
        this._lastOk = false;
        this._lastError = err ? String(err.message || err) : 'fetch failed';
        this._state = null;
        this._emit([]);
    };

    LiveMarketService.prototype._applyOk = function (state) {
        this._checked = true;
        this._lastOk = true;
        this._lastError = null;
        this._lastUpdate = new Date().toISOString();
        this._state = state;
        this._emit(getQuotesArray(state));
    };

    LiveMarketService.prototype._fetch = function () {
        var self = this;
        if (self._fetching) return;
        self._fetching = true;
        fetchJson(API_URL).then(function (data) {
            self._fetching = false;
            var state = buildStateFromApi(data || {});
            if (!state) {
                self._applyError(new Error('incomplete payload'));
                return;
            }
            self._applyOk(state);
        }).catch(function (err) {
            self._fetching = false;
            self._applyError(err);
        });
    };

    LiveMarketService.prototype.start = function () {
        this.stop();
        this._fetch();
        this._timer = setInterval(this._fetch.bind(this), this.intervalMs);
    };

    LiveMarketService.prototype.stop = function () {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    };

    LiveMarketService.prototype.getSnapshot = function () {
        return this._state ? getQuotesArray(this._state) : [];
    };

    LiveMarketService.prototype.getStatus = function () {
        return {
            ok: this._lastOk,
            checked: this._checked,
            lastUpdate: this._lastUpdate,
            detail: this._lastOk
                ? 'Canlı kaynak aktif'
                : (this._lastError ? ('Kaynak hatası: ' + this._lastError) : 'Henüz kontrol edilmedi'),
            source: API_URL
        };
    };

    function create(type, options) {
        return new LiveMarketService(options);
    }

    window.MarketService = {
        create: create,
        LiveMarketService: LiveMarketService,
        TAB_INSTRUMENTS: TAB_INSTRUMENTS,
        filterQuotesByTab: filterQuotesByTab
    };
}(window));

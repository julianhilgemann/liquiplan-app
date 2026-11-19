/* ===== presets.js: example data and the reader for the "deposit-savings-planner" JSON =====
   All rates are illustrative placeholders. */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};
  function products(extra) {
    var list = [
      { term: 3, rate: 2.10, bank: 'Bank A', min: 1000, max: 100000, conv: 'simple' },
      { term: 6, rate: 2.30, bank: 'Bank A', min: 1000, max: 100000, conv: 'simple' },
      { term: 9, rate: 2.40, bank: 'Bank B', min: 2500, max: 100000, conv: 'simple' },
      { term: 12, rate: 2.55, bank: 'Bank B', min: 2500, max: 100000, conv: 'simple' },
      { term: 18, rate: 2.60, bank: 'Bank B', min: 2500, max: 100000, conv: 'annual' },
      { term: 24, rate: 2.70, bank: 'Bank C', min: 5000, max: 100000, conv: 'annual' },
      { term: 36, rate: 2.80, bank: 'Bank C', min: 5000, max: 100000, conv: 'annual' },
      { term: 60, rate: 2.90, bank: 'Bank C', min: 5000, max: 100000, conv: 'annual' },
      { term: 120, rate: 3.00, bank: 'Bank D', min: 5000, max: 100000, conv: 'compound' }
    ];
    (extra || []).forEach(function (e) { list.push(e); });
    return list.map(function (p, i) { p.id = 'p' + (i + 1); p.on = true; return p; });
  }
  function base() {
    return {
      v: 1, lang: 'de', presetId: 'g', rateScenario: 'current',
      startDate: '2026-11-30', horizon: 132,
      giro: 2500, tg: 10000, tgRate: 1.00, tgBank: '',
      weekly: { on: true, nextDate: '' }, baseRate: 2.5, rateEvents: [],
      need: 1500, needIdx: 2.0, needStart: '', buffer: 2000, lead: 1, denom: 100,
      tax: { on: true, church: 0, allowance: 1000 },
      bankCap: { on: false, cap: 100000 },
      naiveReserve: 3,
      products: products(),
      existing: [], streams: [], oneoffs: [], overrides: {}, pins: [], stash: {}
    };
  }

  /* Reader for the wizard JSON of specification G: { format: "...savings-planner", version, input: {...} }.
     Fields the monthly model cannot use yet (processing days, weekly access date, base rate) are kept as data. */
  function isWizardJson(j) { return !!(j && typeof j === 'object' && j.input && typeof j.input === 'object' && (/savings-planner/.test(String(j.format || '')) || 'offers' in j.input || 'liquidity' in j.input)); }
  function fromWizardJson(j) {
    var inp = j.input || {}, s = base(), n = function (v) { v = +v; return isFinite(v) ? v : 0; }, any = false;
    var pick = function (o, keys) { for (var i = 0; i < keys.length; i++) if (o[keys[i]] != null && o[keys[i]] !== '') return o[keys[i]]; return ''; };
    s.presetId = 'custom';
    if (inp.start) s.startDate = String(inp.start).slice(0, 10);
    s.giro = n(inp.liquidity);
    s.weekly = { on: !!inp.weeklyEnabled, nextDate: String(inp.weeklyNextDate || '').slice(0, 10) };
    s.tg = s.weekly.on ? n(inp.weeklyBalance) : 0; s.tgRate = s.weekly.on ? n(inp.weeklyRate) : 0;
    s.needStart = String(inp.firstWithdrawalDate || '').slice(0, 10); s.need = n(inp.initialWithdrawal);
    s.needIdx = inp.inflationRate != null ? n(inp.inflationRate) : 3; s.baseRate = inp.baseRate != null ? n(inp.baseRate) : 2.5;
    s.horizon = Math.max(12, Math.min(360, Math.round(n(inp.planYears != null ? inp.planYears : 10) * 12)));
    s.rateEvents = (inp.rateEvents || []).filter(function (e) { return e && e.date; }).map(function (e, i) { return { id: 'v' + (i + 1), date: String(e.date).slice(0, 10), change: n(e.change) }; });
    s.rateScenario = s.rateEvents.length ? 'events' : 'current';
    s.existing = (inp.deposits || []).filter(function (d) { return d && d.maturity; }).map(function (d, i) {
      var pd = n(pick(d, ['processing_days', 'processingDays'])); if (pd > 0) any = true;
      return { id: 'e' + (i + 1), label: String(d.name || ''), type: 'festgeld', bank: String(d.name || ''), amount: n(d.sum), rate: 0, maturity: String(d.maturity).slice(0, 10), procDays: pd };
    });
    s.streams = (inp.payments || []).filter(Boolean).map(function (f, i) {
      var every = String(pick(f, ['every', 'repeat', 'repeating', 'interval', 'frequency'])).toLowerCase();
      return { id: 's' + (i + 1), name: String(f.name || ''), kind: String(f.type || 'other').toLowerCase(), amount: n(pick(f, ['amount', 'sum'])),
        freq: /quart|^3|viertel/.test(every) ? 'q' : /year|annual|^12|jahr/.test(every) ? 'y' : 'm',
        start: String(pick(f, ['start', 'begin', 'beginning', 'date'])).slice(0, 10), end: String(pick(f, ['until', 'end', 'repeatUntil'])).slice(0, 10), idx: 0 };
    });
    s.products = (inp.offers || []).filter(function (o) { return o && n(o.term) >= 1; }).map(function (o, i) {
      var pd = n(pick(o, ['processing_days', 'processingDays'])); if (pd > 0) any = true;
      return { id: 'p' + (i + 1), term: Math.round(n(o.term)), rate: n(o.rate), bank: String(o.name || ''), min: n(o.min), max: 0, conv: 'simple', on: true, procDays: pd };
    });
    // his spec has no buffer, tax or denomination: neutral defaults; processing days become a one-month safety lead
    s.buffer = 0; s.tax = { on: false, church: 0, allowance: 1000 }; s.lead = any ? 1 : 0; s.denom = 100;
    s.oneoffs = []; s.pins = []; s.overrides = {}; s.stash = {};
    return s;
  }

  // example case G (v26 of the specification)
  var EXAMPLE_G = { format: 'deposit-savings-planner', version: 1, input: {
    start: '2026-11-14', liquidity: 2222, weeklyEnabled: true, weeklyBalance: 9999, weeklyRate: 2.5, weeklyNextDate: '2026-11-18',
    firstWithdrawalDate: '2027-01-27', initialWithdrawal: 1500, inflationRate: 3, baseRate: 2.5, planYears: 11,
    rateEvents: [{ date: '2026-12-17', change: 0.25 }, { date: '2027-03-18', change: 0.25 }, { date: '2028-03-16', change: -0.25 }],
    deposits: [{ name: 'Imprebanca', maturity: '2026-11-30', sum: 10051, processing_days: 3 }, { name: 'Brocc', maturity: '2026-12-15', sum: 10117, processing_days: 3 }, { name: 'Brocc', maturity: '2026-12-16', sum: 6709, processing_days: 3 }],
    payments: [{ name: 'Stellplatz (Untervermietung)', type: 'rent', start: '2026-12-01', amount: 200, every: 'monthly', until: '' }],
    offers: [
      { name: 'Myntro 9', min: 1000, term: 108, rate: 3.9, processing_days: 2 }, { name: 'Myntro 5', min: 1000, term: 60, rate: 3.85, processing_days: 2 },
      { name: 'Myntro 4', min: 1000, term: 48, rate: 3.73, processing_days: 2 }, { name: 'Morgan Stanley 2', min: 1000, term: 24, rate: 3.5, processing_days: 2 },
      { name: 'Brocc', min: 1000, term: 30, rate: 3.5, processing_days: 2 }, { name: 'FIMBank 3m', min: 1000, term: 3, rate: 2.7, processing_days: 2 },
      { name: 'HoistSpar', min: 1000, term: 36, rate: 3.45, processing_days: 2 }, { name: 'Morgan Stanley 1', min: 1000, term: 12, rate: 3.35, processing_days: 2 },
      { name: 'Avarda Bank', min: 1000, term: 18, rate: 3.3, processing_days: 2 }, { name: 'FIMBank 6m', min: 1000, term: 6, rate: 3.18, processing_days: 2 },
      { name: 'Resurs', min: 1000, term: 9, rate: 3.01, processing_days: 2 }
    ] } };

  var presets = {
    g: function () { var s = fromWizardJson(JSON.parse(JSON.stringify(EXAMPLE_G))); s.presetId = 'g'; return s; },
    ruhestand: function () {
      var s = base();
      s.presetId = 'ruhestand'; s.horizon = 240;
      s.giro = 4000; s.tg = 60000; s.need = 3100; s.buffer = 5000;
      s.tax.allowance = 2000;
      s.existing = [
        { id: 'e1', label: 'Festgeld Bestand', type: 'festgeld', bank: 'Bank B', amount: 50000, rate: 2.2, maturity: '2027-09-15' },
        { id: 'e2', label: 'Abfindung (Sperrfrist)', type: 'spar', bank: 'Bank A', amount: 180000, rate: 1.0, maturity: '2027-01-15' }
      ];
      s.streams = [
        { id: 's1', name: 'Mieteinnahmen', kind: 'rent', amount: 850, freq: 'm', start: '2026-12-01', end: '', idx: 1.5 },
        { id: 's2', name: 'Gesetzliche Rente', kind: 'income', amount: 1450, freq: 'm', start: '2028-07-01', end: '', idx: 2 },
        { id: 's3', name: 'Gebäudeversicherung', kind: 'other', amount: -900, freq: 'y', start: '2027-01-01', end: '', idx: 3 },
        { id: 's4', name: 'Instandhaltungsrücklage', kind: 'other', amount: -600, freq: 'q', start: '2027-03-01', end: '', idx: 2 }
      ];
      s.oneoffs = [
        { id: 'o1', date: '2028-05-15', amount: -18000, label: 'Dachsanierung' },
        { id: 'o2', date: '2031-03-15', amount: -35000, label: 'Auto' },
        { id: 'o3', date: '2034-09-15', amount: -22000, label: 'Heizung' },
        { id: 'o4', date: '2030-01-15', amount: 15000, label: 'Lebensversicherung' }
      ];
      return s;
    },
    zinsfalle: function () {
      var s = presets.g();
      s.presetId = 'zinsfalle';
      s.products.push({ id: 'ptrap', term: 120, rate: 5.9, bank: 'Lockbank 10J', min: 1000, max: 0, conv: 'compound', on: true, procDays: 2 });
      return s;
    }
  };
  LP.presets = presets;
  LP.presetIds = ['g', 'ruhestand', 'zinsfalle'];
  LP.wizardJson = { is: isWizardJson, read: fromWizardJson, example: EXAMPLE_G };
})(typeof self !== 'undefined' ? self : globalThis);

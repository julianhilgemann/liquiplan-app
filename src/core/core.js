/* ===== core.js: shared input preparation (dates, calendar, cash-flow timeline, rates) =====
   Used by the main thread and by the solver worker. Contains NO payout, tax or balance logic:
   the solver model (worker) and the simulator (main thread) each implement that on their own. */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};

  // ---------- date helpers (pure calendar arithmetic, no time zones) ----------
  function parseISO(s) {
    var m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(String(s || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +(m[3] || 1) };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d || 1); }
  function ymOf(idx) { return { y: Math.floor(idx / 12), m: (idx % 12 + 12) % 12 + 1 }; }
  function ymIdx(y, m) { return y * 12 + (m - 1); }
  function dow(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function addDays(dt, n) {
    var t = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function cmpDate(a, b) { return (a.y - b.y) * 10000 + (a.m - b.m) * 100 + (a.d - b.d); }
  function easter(y) { // anonymous Gregorian algorithm
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return { y: y, m: month, d: day };
  }
  var holCache = {};
  function holidays(y) { // German nationwide public holidays + 24.12./31.12. (no bank business days)
    if (holCache[y]) return holCache[y];
    var e = easter(y), set = {};
    function add(dt) { set[iso(dt.y, dt.m, dt.d)] = 1; }
    add({ y: y, m: 1, d: 1 }); add(addDays(e, -2)); add(addDays(e, 1)); add({ y: y, m: 5, d: 1 });
    add(addDays(e, 39)); add(addDays(e, 50)); add({ y: y, m: 10, d: 3 });
    add({ y: y, m: 12, d: 24 }); add({ y: y, m: 12, d: 25 }); add({ y: y, m: 12, d: 26 }); add({ y: y, m: 12, d: 31 });
    return (holCache[y] = set);
  }
  function isBusinessDay(dt) {
    var w = dow(dt.y, dt.m, dt.d);
    if (w === 0 || w === 6) return false;
    return !holidays(dt.y)[iso(dt.y, dt.m, dt.d)];
  }
  function nextBusinessDay(dt) { var c = dt; while (!isBusinessDay(c)) c = addDays(c, 1); return c; }
  function prevBusinessDay(dt) { var c = dt; while (!isBusinessDay(c)) c = addDays(c, -1); return c; }
  function firstBusinessDay(y, m) { return nextBusinessDay({ y: y, m: m, d: 1 }); }
  function penultimateBusinessDay(y, m) {
    var last = prevBusinessDay({ y: y, m: m, d: daysInMonth(y, m) });
    return prevBusinessDay(addDays(last, -1));
  }

  // ---------- rate scenarios (illustrative placeholders) ----------
  var SCENARIOS = ['current', 'fall2028', 'rise', 'inverse'];
  function scenariosFor(state) { return (state.rateEvents && state.rateEvents.length) ? ['events'].concat(SCENARIOS) : SCENARIOS.slice(); }
  function scenarioRate(kind, basePct, t, ym, scenario, ctx) {
    var r = basePct;
    if (scenario === 'fall2028') { if (ym.y >= 2028) r = basePct - 1.0; }
    else if (scenario === 'rise') { r = basePct + Math.min(1.5, 0.5 * (t / 12)); }
    else if (scenario === 'inverse') { r = kind === 'tg' ? basePct + 0.75 : ctx.inverse; }
    else if (scenario === 'events') { r = basePct + ctx.ev[t]; } // user-defined central bank steps, passed through 1:1
    return Math.max(0, r) / 100;
  }

  // ---------- problem data ----------
  function num(v, d) { v = +v; return isFinite(v) ? v : (d || 0); }
  // b^n for a whole n >= 0 by repeated multiplication. Math.pow may differ in the last bit between browsers,
  // which is enough to send the search down another branch; plain multiplication is the same everywhere.
  function powi(b, n) { var r = 1; for (var i = 0; i < n; i++) r *= b; return r; }

  function prepare(state, over) {
    over = over || {};
    var sd = parseISO(state.startDate) || { y: 2026, m: 11, d: 30 };
    var idx0 = ymIdx(sd.y, sd.m) + (sd.d === 1 ? 0 : 1);
    var H = Math.max(1, Math.min(360, Math.round(num(over.horizon != null ? over.horizon : state.horizon, 120))));
    var scenario = over.rateScenario || state.rateScenario || 'current';
    var shift = num(over.rateShift); // sensitivity: parallel shift of all new rates in percentage points
    var P = {
      H: H, idx0: idx0, start: sd, scenario: scenario,
      s0: num(state.giro) + num(state.tg), giro0: num(state.giro), tg0: num(state.tg),
      lead: Math.max(0, Math.min(3, Math.round(num(state.lead)))),
      denom: Math.max(1, num(state.denom, 100)),
      buffer: Math.max(0, num(state.buffer)),
      tax: { on: !!(state.tax && state.tax.on), rate: 0, allowance: 0 },
      bankCap: { on: !!(state.bankCap && state.bankCap.on), cap: num(state.bankCap && state.bankCap.cap, 100000) },
      naiveReserve: Math.max(0, num(state.naiveReserve, 3)),
      needStartIdx: 0, months: [], need: [], recIn: [], recOut: [], oneIn: [], oneOut: [], extraNeed: [], extraIn: [],
      inflow: [], outflow: [], net: [], floor: [], manualMin: [], rTG: [], year: [], isDec: [],
      products: [], existing: [], pins: [], warnings: []
    };
    if (P.tax.on) {
      var k = num(state.tax.church) / 100;
      var kest = 0.25 / (1 + 0.25 * k);
      P.tax.rate = kest * (1 + 0.055 + k);
      P.tax.allowance = Math.max(0, num(state.tax.allowance, 1000));
    }
    var t, i;
    // first cash requirement: withdrawals start with the first 1st of a month on or after that date
    var ns = parseISO(state.needStart);
    if (ns) P.needStartIdx = Math.max(0, ymIdx(ns.y, ns.m) + (ns.d === 1 ? 0 : 1) - idx0);
    // cumulative rate steps: an event counts from the first month that begins on or after its date
    var evs = (state.rateEvents || []).map(function (e) { var d = parseISO(e.date); return d ? { idx: ymIdx(d.y, d.m) + (d.d === 1 ? 0 : 1) - idx0, ch: num(e.change) } : null; }).filter(Boolean), evShift = [];
    for (t = 0; t < H; t++) { var sh = 0; for (i = 0; i < evs.length; i++) if (evs[i].idx <= t) sh += evs[i].ch; evShift.push(sh); }
    for (t = 0; t < H; t++) {
      var ym = ymOf(idx0 + t);
      P.months.push({ y: ym.y, m: ym.m, key: ym.y + '-' + pad(ym.m) });
      P.year.push(ym.y); P.isDec.push(ym.m === 12);
      P.recIn.push(0); P.recOut.push(0); P.oneIn.push(0); P.oneOut.push(0);
      P.need.push(t < P.needStartIdx ? 0 : num(state.need) * powi(1 + num(state.needIdx) / 100, Math.floor((t - P.needStartIdx) / 12)));
      var ov = (state.overrides || {})[P.months[t].key] || {};
      P.extraNeed.push(Math.max(0, num(ov.extraNeed)));
      P.extraIn.push(Math.max(0, num(ov.extraIn)));
      var mm = (ov.minLiq === '' || ov.minLiq == null || !isFinite(+ov.minLiq)) ? null : Math.max(0, +ov.minLiq);
      P.manualMin.push(mm);
      P.floor.push(mm == null ? P.buffer : mm);
    }
    // recurring streams
    (state.streams || []).forEach(function (st) {
      var amt = num(st.amount); if (!amt) return;
      var per = st.freq === 'q' ? 3 : st.freq === 'y' ? 12 : 1;
      var s = parseISO(st.start), e = parseISO(st.end);
      var sIdx = s ? ymIdx(s.y, s.m) - idx0 : 0;
      var eIdx = e ? ymIdx(e.y, e.m) - idx0 : Infinity;
      var base = Math.max(sIdx, 0);
      for (var t2 = Math.max(0, sIdx); t2 < H && t2 <= eIdx; t2++) {
        if (((t2 - sIdx) % per + per) % per !== 0) continue;
        var v = amt * powi(1 + num(st.idx) / 100, Math.floor((t2 - base) / 12));
        if (v >= 0) P.recIn[t2] += v; else P.recOut[t2] += -v;
      }
    });
    // one-off events
    (state.oneoffs || []).forEach(function (o) {
      var d = parseISO(o.date), amt = num(o.amount); if (!d || !amt) return;
      var ti = ymIdx(d.y, d.m) - idx0; if (ti < 0) ti = 0; if (ti >= H) return;
      if (amt >= 0) P.oneIn[ti] += amt; else P.oneOut[ti] += -amt;
    });
    for (t = 0; t < H; t++) {
      P.inflow.push(P.recIn[t] + P.oneIn[t] + P.extraIn[t]);
      P.outflow.push(P.need[t] + P.recOut[t] + P.oneOut[t] + P.extraNeed[t]);
      P.net.push(P.inflow[t] - P.outflow[t]);
    }
    // products and rates per placement month
    var prods = (state.products || []).filter(function (p) { return p && p.on !== false && num(p.term) >= 1; })
      .map(function (p) { return p; }).sort(function (a, b) { return num(a.term) - num(b.term); });
    var sortedRates = prods.map(function (p) { return num(p.rate); }).sort(function (a, b) { return b - a; });
    for (t = 0; t < H; t++) P.rTG.push(Math.max(0, scenarioRate('tg', num(state.tgRate), t, P.months[t], scenario, { ev: evShift }) + shift / 100));
    prods.forEach(function (p, rank) {
      var rates = [];
      for (var t3 = 0; t3 < H; t3++) rates.push(Math.max(0, scenarioRate('fg', num(p.rate), t3, P.months[t3], scenario, { inverse: sortedRates[rank], ev: evShift }) + shift / 100));
      var denom = P.denom;
      var mx = num(p.max, 0) > 0 ? num(p.max) : 1e7;
      P.products.push({
        k: P.products.length, id: p.id, term: Math.round(num(p.term)), bank: String(p.bank || ''), conv: p.conv === 'annual' || p.conv === 'compound' ? p.conv : 'simple',
        min: Math.max(0, num(p.min)), max: mx, minU: Math.max(1, Math.ceil(Math.max(0, num(p.min)) / denom - 1e-9)), maxU: Math.floor(mx / denom + 1e-9),
        rate: rates, baseRate: num(p.rate)
      });
    });
    // existing tranches
    (state.existing || []).forEach(function (x) {
      var d = parseISO(x.maturity), amt = num(x.amount); if (!d || amt <= 0) return;
      var ti = Math.max(0, ymIdx(d.y, d.m) - idx0);
      P.existing.push({ id: x.id, label: String(x.label || ''), type: x.type || 'festgeld', bank: String(x.bank || ''), amount: amt, rate: num(x.rate) / 100, t: ti, date: d });
    });
    // pinned placements
    (state.pins || []).forEach(function (pn) {
      var d = parseISO(pn.month), amt = num(pn.amount); if (!d || amt <= 0) return;
      var ti = ymIdx(d.y, d.m) - idx0;
      var pr = null; P.products.forEach(function (q) { if (q.id === pn.productId) pr = q; });
      if (!pr || ti < 0 || ti >= H) { P.warnings.push({ code: 'pin_ignored', id: pn.id }); return; }
      P.pins.push({ id: pn.id, t: ti, k: pr.k, amount: amt });
    });
    return P;
  }

  LP.core = {
    parseISO: parseISO, iso: iso, pad: pad, ymOf: ymOf, ymIdx: ymIdx, dow: dow, daysInMonth: daysInMonth, addDays: addDays, cmpDate: cmpDate,
    easter: easter, holidays: holidays, isBusinessDay: isBusinessDay, nextBusinessDay: nextBusinessDay, prevBusinessDay: prevBusinessDay,
    firstBusinessDay: firstBusinessDay, penultimateBusinessDay: penultimateBusinessDay,
    SCENARIOS: SCENARIOS, scenariosFor: scenariosFor, prepare: prepare, powi: powi
  };
})(typeof self !== 'undefined' ? self : globalThis);

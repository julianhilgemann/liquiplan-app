/* ===== sim.js: independent month-by-month simulator (main thread) =====
   Deliberately shares no code with the solver model: it walks through the calendar and keeps the state of
   every tranche (principal, age), books interest, tax and cash flows, and judges each month.
   Used to verify every plan before it is shown, and for the two baselines. */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};
  var CENT = 0.005;

  function run(P, placements, opts) {
    opts = opts || {};
    var H = P.H, t, i;
    var res = {
      s: new Float64Array(H), giro: new Float64Array(H), tg: new Float64Array(H), locked: new Float64Array(H),
      lockedByK: P.products.map(function () { return new Float64Array(H); }), lockedExisting: new Float64Array(H),
      matPay: new Float64Array(H), place: new Float64Array(H), intTG: new Float64Array(H), intFG: new Float64Array(H),
      tax: new Float64Array(H), avail: new Float64Array(H), trCash: new Float64Array(H), ok: [], tranches: [], Tstar: -1, firstShort: -1
    };
    var byMonth = {};
    (placements || []).forEach(function (p) { (byMonth[p.t] = byMonth[p.t] || []).push(p); });
    var liq = P.s0, taxableYTD = 0, active = [];
    // holdings that already exist at the start
    P.existing.forEach(function (x) {
      var tr = { kind: 'existing', label: x.label, bank: x.bank, start: 0, term: x.t, due: x.t, amount: x.amount, principal: x.amount, rate: x.rate, conv: 'simple', k: -1, interest: 0, payout: 0, open: true, id: x.id };
      active.push(tr); res.tranches.push(tr);
    });
    var allOK = true;
    for (t = 0; t < H; t++) {
      // 1) Tagesgeld interest on last month's closing liquidity
      var iTG = Math.max(0, liq) * P.rTG[t] / 12;
      liq += iTG; taxableYTD += iTG; res.intTG[t] = iTG;
      // 2) tranche events at the start of the month
      var mat = 0, iFG = 0, cashIn = 0;
      for (i = 0; i < active.length; i++) {
        var tr = active[i]; if (!tr.open) continue;
        var age = t - tr.start;
        if (tr.kind === 'existing') {
          if (t === tr.due) { var ie = tr.amount * tr.rate * tr.due / 12; tr.interest = ie; tr.payout = tr.amount + ie; liq += tr.payout; mat += tr.payout; cashIn += tr.payout; iFG += ie; taxableYTD += ie; tr.open = false; }
          continue;
        }
        if (age === tr.term) { // maturity
          var lastYears = Math.floor((tr.term - 1) / 12), stub = tr.term - 12 * lastYears, fin;
          if (tr.conv === 'simple') fin = tr.amount * tr.rate * tr.term / 12; else fin = tr.principal * tr.rate * stub / 12;
          tr.interest += fin; iFG += fin; taxableYTD += fin;
          var cash = tr.principal + fin; tr.payout += cash; liq += cash; mat += cash; cashIn += cash; tr.open = false;
        } else if (age > 0 && age % 12 === 0 && tr.conv !== 'simple') { // anniversary
          var ia = tr.principal * tr.rate; tr.interest += ia; iFG += ia; taxableYTD += ia;
          if (tr.conv === 'annual') { liq += ia; tr.payout += ia; cashIn += ia; } else tr.principal += ia;
        }
      }
      // 3) one-off and recurring flows of the month
      liq += P.inflow[t] - P.outflow[t];
      // 4) new placements (from the plan, or decided by a baseline policy)
      var todays = byMonth[t] || [];
      if (opts.policy) { var spare = liq - mat; for (i = 1; i < P.lead; i++) if (t - i >= 0) spare -= res.matPay[t - i]; if (P.lead === 0) spare = liq; todays = todays.concat(opts.policy(t, spare, P) || []); }
      for (i = 0; i < todays.length; i++) {
        var p = todays[i], pr = P.products[p.k];
        var nt = { kind: 'new', pinned: !!p.pinned, pinId: p.pinId, bank: pr.bank, start: t, term: pr.term, due: t + pr.term, amount: p.amount, principal: p.amount, rate: pr.rate[t], conv: pr.conv, k: p.k, interest: 0, payout: 0, open: true };
        liq -= p.amount; res.place[t] += p.amount; active.push(nt); res.tranches.push(nt);
      }
      // 5) tax: settled once a year in December on the interest above the allowance
      if (P.tax.on && P.isDec[t]) { var tx = P.tax.rate * Math.max(0, taxableYTD - P.tax.allowance); liq -= tx; res.tax[t] = tx; }
      if (P.isDec[t]) taxableYTD = 0;
      // 6) month-end records
      res.s[t] = liq; res.matPay[t] = mat; res.intFG[t] = iFG; res.trCash[t] = cashIn;
      var lock = 0;
      for (i = 0; i < active.length; i++) { var a = active[i]; if (!a.open) continue; lock += a.principal; if (a.k >= 0) res.lockedByK[a.k][t] += a.principal; else res.lockedExisting[t] += a.principal; }
      res.locked[t] = lock;
      var nextOut = t + 1 < H ? P.outflow[t + 1] : P.outflow[t];
      res.giro[t] = Math.max(0, Math.min(liq, nextOut)); res.tg[t] = liq - res.giro[t];
      // 7) judge the month: maturities of the last `lead` months do not count yet
      var notYet = 0; for (i = 0; i < P.lead; i++) if (t - i >= 0) notYet += res.matPay[t - i];
      res.avail[t] = liq - notYet;
      var ok = res.avail[t] >= P.floor[t] - CENT;
      res.ok.push(ok);
      if (!ok && allOK) { allOK = false; res.firstShort = t; }
      if (allOK) res.Tstar = t;
    }
    // sums up to T*
    var gi = 0, gt = 0, lockShare = 0, n = 0, peak = 0;
    for (t = 0; t <= res.Tstar; t++) { gi += res.intTG[t] + res.intFG[t]; gt += res.tax[t]; var tot = res.s[t] + res.locked[t]; if (tot > 0) { var sh = res.locked[t] / tot; lockShare += sh; n++; if (sh > peak) peak = sh; } }
    res.interestToT = gi; res.taxToT = gt; res.lockShareAvg = n ? lockShare / n : 0; res.lockSharePeak = peak;
    res.shortfall = res.firstShort >= 0 ? Math.max(0, P.floor[res.firstShort] - res.avail[res.firstShort]) : 0;
    return res;
  }

  function withPins(P, placements) {
    var out = (placements || []).map(function (p) { return { t: p.t, k: p.k, amount: p.amount }; });
    P.pins.forEach(function (pn) { out.push({ t: pn.t, k: pn.k, amount: pn.amount, pinned: true, pinId: pn.id }); });
    return out;
  }

  // baseline (a): everything stays in Tagesgeld
  function allTagesgeld(P) { return run(P, []); }
  // baseline (b): naive interest maximiser, always buys the product with the highest rate with all spare cash
  function naive(P) {
    return run(P, [], {
      policy: function (t, liq, P) { // liq = cash that is reliably available this month
        if (!P.products.length) return [];
        var best = -1, br = 0;
        P.products.forEach(function (pr) { if (pr.rate[t] > br + 1e-12 || (Math.abs(pr.rate[t] - br) <= 1e-12 && best >= 0 && pr.term > P.products[best].term)) { br = pr.rate[t]; best = pr.k; } });
        if (best < 0 || br <= P.rTG[t]) return [];
        var pr = P.products[best];
        var reserve = P.floor[t] + P.naiveReserve * P.need[Math.min(P.H - 1, Math.max(t + 1, P.needStartIdx))];
        var units = Math.floor((liq - reserve) / P.denom + 1e-9), amt = Math.min(units * P.denom, Math.floor(pr.max / P.denom) * P.denom);
        if (amt < Math.max(pr.min, P.denom)) return [];
        return [{ t: t, k: best, amount: amt }];
      }
    });
  }

  // checks a solver result independently; returns {ok, errors, sim}
  function verify(P, result) {
    var errors = [], D = P.denom;
    (result.placements || []).forEach(function (p) {
      var pr = P.products[p.k];
      if (!pr) { errors.push({ code: 'product', p: p }); return; }
      if (!(p.amount > 0) || p.t < 0 || p.t >= P.H) errors.push({ code: 'range', p: p });
      if (result.integer !== false) {
        if (Math.abs(p.amount / D - Math.round(p.amount / D)) > 1e-6) errors.push({ code: 'denomination', p: p });
        if (p.amount < pr.min - 1e-6) errors.push({ code: 'min', p: p });
      }
      if (p.amount > pr.max + 1e-6) errors.push({ code: 'max', p: p });
      if (!(pr.rate[p.t] > 0)) errors.push({ code: 'rate', p: p });
    });
    var sim = run(P, withPins(P, result.placements));
    if (sim.Tstar < result.T) errors.push({ code: 'horizon', claimed: result.T, simulated: sim.Tstar, month: sim.firstShort });
    if (P.bankCap.on) {
      var byBank = {}, fresh = {};
      sim.tranches.forEach(function (tr) {
        var arr = byBank[tr.bank] = byBank[tr.bank] || new Float64Array(P.H), fr = fresh[tr.bank] = fresh[tr.bank] || new Float64Array(P.H);
        for (var t = tr.start; t < Math.min(P.H, tr.due); t++) { arr[t] += tr.amount; if (tr.kind === 'new' && !tr.pinned) fr[t] += tr.amount; }
      });
      Object.keys(byBank).forEach(function (b) { for (var t = 0; t <= result.T; t++) if (fresh[b][t] > 0.01 && byBank[b][t] > P.bankCap.cap + 0.01) { errors.push({ code: 'bankcap', bank: b, t: t, amount: byBank[b][t] }); break; } });
    }
    return { ok: errors.length === 0, errors: errors, sim: sim };
  }

  LP.sim = { run: run, withPins: withPins, allTagesgeld: allTagesgeld, naive: naive, verify: verify };
})(typeof self !== 'undefined' ? self : globalThis);

/* ===== model.js: MILP model of the deposit ladder (solver side only) =====
   Monthly grid t = 0..T. Variables:
     u[t]  = s[t] - R[t]  liquidity at month end minus maturities still inside the safety lead (>= floor[t])
     n[j]  = units (denomination steps) placed into candidate j = (month tau, product k)
     y[j]  = 1 if candidate j is used (only for minimum amounts, MILP)
     q[y]  = taxable interest of calendar year y above the allowance
     z     = slack of the first month after T* (stage 4)
   Balance: s[t] = s[t-1](1+rTG/12) + net[t] + payouts[t] - placements[t] - tax[t]            */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};

  var powi = LP.core.powi;

  // cash-flow coefficients of 1 EUR placed in a product with rate r (decimal) and term L months
  function unitFlows(conv, r, L) {
    var ev = [], n = Math.floor((L - 1) / 12), f = L - 12 * n, j;
    if (conv === 'annual') {
      for (j = 1; 12 * j < L; j++) ev.push({ dt: 12 * j, cash: r, tax: r, fin: false });
      ev.push({ dt: L, cash: 1 + r * f / 12, tax: r * f / 12, fin: true });
    } else if (conv === 'compound') {
      for (j = 1; 12 * j < L; j++) ev.push({ dt: 12 * j, cash: 0, tax: r * powi(1 + r, j - 1), fin: false });
      var g = powi(1 + r, n);
      ev.push({ dt: L, cash: g * (1 + r * f / 12), tax: g * r * f / 12, fin: true });
    } else {
      ev.push({ dt: L, cash: 1 + r * L / 12, tax: r * L / 12, fin: true });
    }
    return ev;
  }
  // value (principal + accrued, unpaid interest) of 1 EUR after e elapsed months, 1 <= e <= L
  function unitAccrued(conv, r, e) {
    var n = Math.floor((e - 1) / 12), f = e - 12 * n;
    if (conv === 'annual') return 1 + r * f / 12;
    if (conv === 'compound') return powi(1 + r, n) * (1 + r * f / 12);
    return 1 + r * e / 12;
  }

  function Model(sense) { this.sense = sense || 'min'; this.cols = []; this.rows = []; this.objConst = 0; this.byName = {}; }
  Model.prototype.col = function (name, lb, ub, isInt, obj) {
    var c = { name: name, lb: lb, ub: ub, int: !!isInt, obj: obj || 0, semi: 0 };
    this.byName[name] = this.cols.length; this.cols.push(c); return this.cols.length - 1;
  };
  Model.prototype.row = function (name, lb, ub) { this.rows.push({ name: name, lb: lb, ub: ub, idx: [], val: [] }); return this.rows.length - 1; };
  Model.prototype.add = function (r, c, v) { if (v !== 0 && Math.abs(v) > 1e-11) { var R = this.rows[r]; R.idx.push(c); R.val.push(v); } };

  /* opt: { obj:'none'|'wealth'|'term'|'slack', integer:bool, nativeSemi:bool, allowBeyond:bool,
            cand: null | {key:1}, wealthMin: number|null } */
  function buildModel(P, T, opt) {
    var INF = Infinity, D = P.denom, lead = P.lead, K = P.products.length;
    var slack = opt.obj === 'slack';
    var M = new Model(opt.obj === 'wealth' ? 'max' : 'min');
    var rho = [], t, i, j, k;
    for (t = 0; t <= T; t++) rho.push(P.rTG[t] / 12);

    // ----- fixed tranches: existing holdings and pinned placements -----
    var Fcash = new Float64Array(T + 2), Fmat = new Float64Array(T + 2), Fint = new Float64Array(T + 2), Fplace = new Float64Array(T + 2);
    var Fopen = 0, bankIdx = {}, banks = [], Fbank = [];
    function bankOf(name) { if (!(name in bankIdx)) { bankIdx[name] = banks.length; banks.push(name); Fbank.push(new Float64Array(T + 1)); } return bankIdx[name]; }
    P.existing.forEach(function (x) {
      var b = bankOf(x.bank);
      for (var tt = 0; tt <= T && tt < x.t; tt++) Fbank[b][tt] += x.amount;
      if (x.t <= T) { var it = x.amount * x.rate * x.t / 12; Fcash[x.t] += x.amount + it; Fmat[x.t] += x.amount + it; Fint[x.t] += it; }
      else Fopen += x.amount * (1 + x.rate * (T + 1) / 12);
    });
    P.pins.forEach(function (pn) {
      if (pn.t > T) return;
      var pr = P.products[pn.k], r = pr.rate[pn.t], b = bankOf(pr.bank);
      Fplace[pn.t] += pn.amount;
      for (var tt = pn.t; tt <= T && tt < pn.t + pr.term; tt++) Fbank[b][tt] += pn.amount;
      unitFlows(pr.conv, r, pr.term).forEach(function (e) {
        var m = pn.t + e.dt; if (m > T) return;
        Fcash[m] += pn.amount * e.cash; Fint[m] += pn.amount * e.tax; if (e.fin) Fmat[m] += pn.amount * e.cash;
      });
      if (pn.t + pr.term > T) Fopen += pn.amount * unitAccrued(pr.conv, r, T - pn.t + 1);
    });
    var FR = new Float64Array(T + 2);
    for (t = 0; t <= T; t++) for (i = 0; i < lead; i++) if (t - i >= 0) FR[t] += Fmat[t - i];

    // ----- columns: liquidity -----
    var uCol = [];
    for (t = 0; t <= T; t++) uCol.push(M.col('u' + t, P.floor[t], INF, false, 0));
    // ----- tax years (a year is taxed in its December; only years whose December lies within 0..T) -----
    var taxOn = P.tax.on && P.tax.rate > 0, qCol = {}, qRow = {}, decOf = {};
    if (taxOn) for (t = 0; t <= T; t++) if (P.isDec[t]) { decOf[P.year[t]] = t; }
    // ----- balance rows -----
    var bRow = [];
    for (t = 0; t <= T; t++) {
      var rhs = P.net[t] + Fcash[t] - FR[t] + (t > 0 ? (1 + rho[t]) * FR[t - 1] : (1 + rho[0]) * P.s0) - Fplace[t];
      var r0 = M.row('b' + t, rhs, rhs); bRow.push(r0);
      M.add(r0, uCol[t], 1); if (t > 0) M.add(r0, uCol[t - 1], -(1 + rho[t]));
    }
    if (taxOn) {
      Object.keys(decOf).forEach(function (ys) {
        var y = +ys, c = M.col('q' + y, 0, INF, false, 0); qCol[y] = c;
        var konst = -P.tax.allowance;
        var rr = M.row('x' + y, 0, INF); qRow[y] = rr;
        M.add(rr, c, 1);
        for (var tt = 0; tt <= decOf[y]; tt++) {
          if (P.year[tt] !== y) continue;
          konst += Fint[tt] + (tt > 0 ? rho[tt] * FR[tt - 1] : rho[0] * P.s0);
          if (tt > 0) M.add(rr, uCol[tt - 1], -rho[tt]);
        }
        M.rows[rr].lb = konst;
        M.add(bRow[decOf[y]], c, P.tax.rate);
      });
    }
    // ----- stage-4 slack: u[T] + z >= floor[T]  (u[T] here already means u' = u + z) -----
    var zCol = -1;
    if (slack) { zCol = M.col('z', 0, INF, false, 1); M.add(bRow[T], zCol, -1); }

    // ----- candidate placements -----
    var cands = [], capBound = P.s0, wealthIdx = [], wealthVal = [];
    for (t = 0; t <= T; t++) capBound += P.inflow[t];
    P.existing.forEach(function (x) { capBound += x.amount * (1 + x.rate * x.t / 12); });
    capBound *= 1.6;
    var bankTerms = null;
    var capOn = P.bankCap.on && P.bankCap.cap > 0;
    if (capOn) { bankTerms = {}; }
    for (var tau = 0; tau <= T; tau++) {
      for (k = 0; k < K; k++) {
        var pr = P.products[k], r = pr.rate[tau], L = pr.term;
        if (!(r > 0) || pr.maxU < pr.minU) continue;
        if (!opt.allowBeyond && tau + L + lead > T) continue;
        if (opt.cand && !opt.cand[tau + '_' + k]) continue;
        if (opt.grid > 1 && tau % opt.grid !== 0 && !(opt.gridEv && opt.gridEv[tau])) continue; // coarse placement grid (large models in the embedded solver)
        var maxU = Math.min(pr.maxU, Math.max(pr.minU, Math.ceil(capBound / D)));
        var objc = opt.obj === 'term' ? D * L / 1000 : 0;
        var c = M.col('n' + tau + '_' + k, 0, maxU, !!opt.integer, objc);
        M.cols[c].ubImplied = maxU < pr.maxU;
        var semi = pr.minU > 1;
        if (semi && opt.integer) {
          if (opt.nativeSemi) M.cols[c].semi = pr.minU;
          else {
            var yc = M.col('y' + tau + '_' + k, 0, 1, true, 0);
            var ra = M.row('ma' + c, 0, INF); M.add(ra, c, 1); M.add(ra, yc, -pr.minU);
            var rb = M.row('mb' + c, -INF, 0); M.add(rb, c, 1); M.add(rb, yc, -maxU);
          }
        }
        var co = {}; // balance-row coefficients
        var tx = {}; // tax-row coefficients by year
        co[tau] = D;
        var ev = unitFlows(pr.conv, r, L), wcoef = 0;
        for (i = 0; i < ev.length; i++) {
          var m = tau + ev[i].dt;
          if (m <= T) {
            co[m] = (co[m] || 0) - D * ev[i].cash;
            if (taxOn && ev[i].tax && decOf[P.year[m]] != null) tx[P.year[m]] = (tx[P.year[m]] || 0) - D * ev[i].tax;
          }
          if (ev[i].fin) {
            for (var q = 0; q < lead; q++) {
              var tR = m + q; if (tR > T) break;
              var Rc = D * ev[i].cash;
              co[tR] = (co[tR] || 0) + Rc;
              if (tR + 1 <= T) {
                co[tR + 1] = (co[tR + 1] || 0) - (1 + rho[tR + 1]) * Rc;
                if (taxOn && decOf[P.year[tR + 1]] != null) tx[P.year[tR + 1]] = (tx[P.year[tR + 1]] || 0) - rho[tR + 1] * Rc;
              }
              if (tR === T) wcoef += Rc;
            }
          }
        }
        if (tau + L > T) wcoef += D * unitAccrued(pr.conv, r, T - tau + 1);
        for (var key in co) M.add(bRow[+key], c, co[key]);
        for (var ky in tx) M.add(qRow[+ky], c, tx[ky]);
        if (wcoef) { wealthIdx.push(c); wealthVal.push(wcoef); }
        if (capOn) {
          var b = bankOf(pr.bank);
          (bankTerms[b] = bankTerms[b] || []).push({ c: c, from: tau, to: Math.min(T, tau + L - 1) });
        }
        cands.push({ col: c, t: tau, k: k });
      }
    }
    // ----- wealth at T: s[T] + open deposits incl. accrued interest -----
    var wConst = FR[T] + Fopen;
    if (opt.obj === 'wealth') {
      M.cols[uCol[T]].obj = 1;
      for (i = 0; i < wealthIdx.length; i++) M.cols[wealthIdx[i]].obj = wealthVal[i];
      M.objConst = wConst;
    }
    if (opt.wealthMin != null) {
      var wr = M.row('w', opt.wealthMin - wConst, INF);
      M.add(wr, uCol[T], 1);
      for (i = 0; i < wealthIdx.length; i++) M.add(wr, wealthIdx[i], wealthVal[i]);
    }
    // ----- optional cap per bank (deposit guarantee); rows are added lazily via opt.capKeys ('bank|month') -----
    var capInfo = null;
    if (capOn) {
      capInfo = { names: banks, terms: bankTerms, fixed: Fbank, cap: P.bankCap.cap, D: D, T: T };
      for (var bn in bankTerms) {
        var list = bankTerms[bn], fb = Fbank[+bn], months = [];
        if (opt.capKeys) { for (var tk = 0; tk <= T; tk++) if (opt.capKeys[banks[+bn] + '|' + tk]) months.push(tk); }
        else {
          // only months at which a tranche starts can be the first month of a new maximum
          var starts = { 0: 1 }; list.forEach(function (e) { starts[e.from] = 1; });
          for (var tb = 1; tb <= T; tb++) if (fb[tb] > fb[tb - 1]) starts[tb] = 1;
          months = Object.keys(starts).map(Number);
        }
        for (var mi = 0; mi < months.length; mi++) {
          var tt = months[mi], rr = M.row('k' + bn + '_' + tt, -INF, Math.max(0, (P.bankCap.cap - fb[tt]) / D)), cnt = 0;
          for (var a = 0; a < list.length; a++) if (list[a].from <= tt && tt <= list[a].to) { M.add(rr, list[a].c, 1); cnt++; }
          if (!cnt) M.rows.pop();
        }
      }
    }
    M.meta = { T: T, cands: cands, uCol: uCol, zCol: zCol, D: D, wConst: wConst, wealthIdx: wealthIdx, wealthVal: wealthVal, capInfo: capInfo };
    return M;
  }

  function wealthOf(M, x) {
    var w = M.meta.wConst + x[M.meta.uCol[M.meta.T]];
    for (var i = 0; i < M.meta.wealthIdx.length; i++) w += M.meta.wealthVal[i] * x[M.meta.wealthIdx[i]];
    return w;
  }
  function objOf(M, x) { var o = M.objConst; for (var j = 0; j < M.cols.length; j++) if (M.cols[j].obj) o += M.cols[j].obj * x[j]; return o; }

  // generic feasibility check of a solution vector against the model (bounds, rows, integrality)
  function checkSolution(M, x, tol) {
    tol = tol || 1e-5;
    var worst = 0, j, i;
    for (j = 0; j < M.cols.length; j++) {
      var c = M.cols[j], v = x[j];
      if (!(v === v)) return { ok: false, worst: Infinity };
      var sc = 1 + Math.abs(v);
      if (v < c.lb) worst = Math.max(worst, (c.lb - v) / sc);
      if (v > c.ub) worst = Math.max(worst, (v - c.ub) / sc);
      if (c.int) {
        worst = Math.max(worst, Math.abs(v - Math.round(v)));
        if (c.semi && Math.round(v) > 0 && Math.round(v) < c.semi) worst = Math.max(worst, 1);
      }
    }
    for (i = 0; i < M.rows.length; i++) {
      var R = M.rows[i], a = 0, mag = 1;
      for (j = 0; j < R.idx.length; j++) { var p = R.val[j] * x[R.idx[j]]; a += p; mag += Math.abs(p); }
      if (a < R.lb) worst = Math.max(worst, (R.lb - a) / mag);
      if (a > R.ub) worst = Math.max(worst, (a - R.ub) / mag);
    }
    return { ok: worst <= tol, worst: worst };
  }

  // months in which the open deposits at a bank exceed the cap (for the lazy cap rows)
  function capViolations(M, x) {
    var ci = M.meta.capInfo, out = [];
    if (!ci) return out;
    for (var bn in ci.terms) {
      var list = ci.terms[bn], fb = ci.fixed[+bn], expo = new Float64Array(ci.T + 1), peak = new Uint8Array(ci.T + 1), a, t;
      // the exposure can only rise in a month in which a tranche starts: only those months need a row
      for (a = 0; a < list.length; a++) { var v = x[list[a].c]; if (v > 1e-9) { peak[list[a].from] = 1; for (t = list[a].from; t <= list[a].to; t++) expo[t] += v * ci.D; } }
      for (t = 1; t <= ci.T; t++) if (fb[t] > fb[t - 1]) peak[t] = 1;
      for (t = 0; t <= ci.T; t++) if (peak[t] && expo[t] > 1e-6 && expo[t] + fb[t] > Math.max(ci.cap, fb[t]) + 1e-6 * (1 + ci.cap)) out.push(ci.names[+bn] + '|' + t);
    }
    return out;
  }

  function placementsOf(M, x, integer) {
    var out = [], D = M.meta.D;
    M.meta.cands.forEach(function (c) {
      var v = x[c.col]; if (integer) v = Math.round(v);
      if (v > 1e-7) out.push({ t: c.t, k: c.k, amount: integer ? v * D : Math.round(v * D * 100) / 100 });
    });
    return out;
  }

  // ----- CPLEX LP format (for HiGHS) -----
  function fmt(v) { var s = String(+v.toPrecision(15)); return s; }
  function toLPString(M) {
    var out = [], i, j, line, cnt;
    out.push(M.sense === 'max' ? 'Maximize' : 'Minimize');
    line = ' obj:'; cnt = 0;
    for (j = 0; j < M.cols.length; j++) {
      var o = M.cols[j].obj; if (!o) continue;
      line += (o < 0 ? ' - ' : ' + ') + fmt(Math.abs(o)) + ' ' + M.cols[j].name;
      if (++cnt % 6 === 0) { out.push(line); line = ' '; }
    }
    if (cnt === 0) line += ' 0 ' + M.cols[0].name;
    out.push(line);
    out.push('Subject To');
    for (i = 0; i < M.rows.length; i++) {
      var R = M.rows[i]; line = ' ' + R.name + ':'; cnt = 0;
      for (j = 0; j < R.idx.length; j++) {
        var v = R.val[j];
        line += (v < 0 ? ' - ' : ' + ') + fmt(Math.abs(v)) + ' ' + M.cols[R.idx[j]].name;
        if (++cnt % 6 === 0) { out.push(line); line = ' '; }
      }
      if (R.lb === R.ub) line += ' = ' + fmt(R.lb);
      else if (R.lb > -Infinity) line += ' >= ' + fmt(R.lb);
      else line += ' <= ' + fmt(R.ub);
      out.push(line);
    }
    out.push('Bounds');
    var gens = [], bins = [];
    for (j = 0; j < M.cols.length; j++) {
      var c = M.cols[j];
      if (c.int && c.lb === 0 && c.ub === 1) { bins.push(c.name); continue; }
      if (c.int) gens.push(c.name);
      if (c.lb === -Infinity && c.ub === Infinity) out.push(' ' + c.name + ' free');
      else if (c.ub === Infinity) { if (c.lb !== 0) out.push(' ' + c.name + ' >= ' + fmt(c.lb)); }
      else out.push(' ' + fmt(c.lb) + ' <= ' + c.name + ' <= ' + fmt(c.ub));
    }
    function list(title, arr) { if (!arr.length) return; out.push(title); for (var a = 0; a < arr.length; a += 8) out.push(' ' + arr.slice(a, a + 8).join(' ')); }
    list('General', gens); list('Binary', bins);
    out.push('End');
    return out.join('\n');
  }

  LP.model = { unitFlows: unitFlows, unitAccrued: unitAccrued, buildModel: buildModel, toLPString: toLPString, checkSolution: checkSolution, placementsOf: placementsOf, capViolations: capViolations, wealthOf: wealthOf, objOf: objOf };
})(typeof self !== 'undefined' ? self : globalThis);

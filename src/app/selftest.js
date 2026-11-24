/* ===== selftest.js: self-test (solver, simulator and Excel export checked against each other) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, $ = A.$, el = A.el, t = A.t;
  var xlsxCtx = A.xlsxCtx; // export.js

  A.selftest = async function () {
    var box = $('tests'), btn = $('btnSelftest'), pass = 0, total = 0;
    box.innerHTML = ''; btn.disabled = true;
    function line(text) { var st = el('span', { class: 'pill warn', text: t('st_run') }), tx = el('span', { text: text }), row = el('div', null, st, tx); box.appendChild(row); return { done: function (ok, txt) { total++; if (ok) pass++; st.className = 'pill ' + (ok ? 'ok' : 'bad'); st.textContent = ok ? t('st_pass') : t('st_fail'); if (txt) tx.textContent = txt; } }; }
    function lab(P, T) { return T < 0 ? '0 M' : (T + 1) + ' M · ' + A.monthLabel(P.months[Math.min(P.H - 1, T)]); }
    async function solve(state) { state = A.normalize(JSON.parse(JSON.stringify(state))); return A.solveState(state, null, 0.5); }
    var results = {}, id;
    try {
      for (var i = 0; i < LP.presetIds.length; i++) {
        id = LP.presetIds[i];
        var l1 = line(t('st_sim', { p: t('p_' + id), m: '…' })), r = await solve(LP.presets[id]());
        results[id] = r;
        l1.done(r.ver.ok && r.sim.Tstar >= r.res.T, t('st_sim', { p: t('p_' + id), m: lab(r.P, r.sim.Tstar) }));
        var l2 = line(''); l2.done(r.ver.ok && r.sim.Tstar >= r.base.tg.Tstar, t('st_tg', { p: t('p_' + id), a: lab(r.P, r.sim.Tstar), b: lab(r.P, r.base.tg.Tstar) }));
      }
      var o = results.g, z = results.zinsfalle;
      line('').done(o.ver.ok && z.ver.ok && z.sim.Tstar >= o.sim.Tstar, t('st_trap', { a: (o.sim.Tstar + 1) + ' M', b: (z.sim.Tstar + 1) + ' M' }));
      var lp = line(t('st_monoP', { a: '…', b: '…' })), sp = LP.presets.g();
      sp.products.push({ id: 'pX', term: 15, rate: 3.6, bank: 'Bank E', min: 1000, max: 0, conv: 'simple', on: true });
      var rp = await solve(sp); lp.done(rp.ver.ok && rp.sim.Tstar >= o.sim.Tstar, t('st_monoP', { a: (o.sim.Tstar + 1) + ' M', b: (rp.sim.Tstar + 1) + ' M' }));
      var li = line(t('st_monoI', { a: '…', b: '…' })), si = LP.presets.g();
      si.oneoffs.push({ id: 'oX', date: '2027-09-15', amount: 6000, label: 'Zufluss' });
      var ri = await solve(si); li.done(ri.ver.ok && ri.sim.Tstar >= o.sim.Tstar, t('st_monoI', { a: (o.sim.Tstar + 1) + ' M', b: (ri.sim.Tstar + 1) + ' M' }));
      // the limit on new deposits: example G with at most four, and a limit with room to spare, which must leave the plan as it is
      var nF = o.res.placements.length, lm = line(t('st_max', { p: t('p_g'), n: 4, k: '…', a: '…', f: nF, b: (o.sim.Tstar + 1) + ' M' })), sm = LP.presets.g();
      sm.trancheCap = { on: true, max: 4 };
      var rm = await solve(sm);
      lm.done(rm.ver.ok && rm.res.placements.length <= 4 && rm.sim.Tstar <= o.sim.Tstar && rm.sim.Tstar >= rm.base.tg.Tstar, t('st_max', { p: t('p_g'), n: 4, k: rm.res.placements.length, a: (rm.sim.Tstar + 1) + ' M', f: nF, b: (o.sim.Tstar + 1) + ' M' }));
      var lf = line(t('st_maxFree', { n: nF + 5, k: '…' })), sf = LP.presets.g();
      sf.trancheCap = { on: true, max: nF + 5 };
      var rf = await solve(sf);
      lf.done(rf.ver.ok && JSON.stringify(rf.res.placements) === JSON.stringify(o.res.placements), t('st_maxFree', { n: nF + 5, k: rf.res.placements.length }));
      var lx = line(t('st_xlsx', { d: '…', e: '…' }));
      try {
        await A.xlsxLibs();
        var st0 = A.normalize(LP.presets.g()), built = await LP.xlsx.build(xlsxCtx({ P: o.P, sim: o.sim, res: o.res, base: o.base, scen: {} }, st0), window.ExcelJS, window.JSZip);
        var wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(built.data);
        var ws = wb.getWorksheet('Liquidity'), maxd = 0, n, cell;
        for (n = 0; n < o.P.H; n++) { cell = ws.getCell('N' + (6 + n)).value; maxd = Math.max(maxd, Math.abs((cell && cell.result != null ? cell.result : NaN) - o.sim.s[n])); }
        var reach = ws.getCell('F2').value, reachV = reach && reach.result, expect = o.sim.firstShort >= 0 ? o.sim.firstShort : o.P.H;
        lx.done(maxd <= 0.01 && reachV === expect, t('st_xlsx', { d: A.eur2(maxd), e: reachV + ' = ' + expect }));
      } catch (e) { lx.done(false, t('st_xlsx', { d: '–', e: String(e && e.message || e) })); }
      // the ladder spreadsheet, read back: per month the tranches' closing balances add up to the locked capital, the cash lines match
      var lq = line(t('lx_st', { d: '…', n: '…' }));
      try {
        var lb = await LP.ladderXlsx.build(A.ladderCtx({ P: o.P, sim: o.sim }), window.ExcelJS), lw = new window.ExcelJS.Workbook(); await lw.xlsx.load(lb.data);
        var ms = lw.worksheets[1], RW = LP.ladderXlsx.ROWS, c0 = LP.ladderXlsx.C0, nM = lb.schedule.M, dev = 0, chk = true;
        var eopRows = lb.schedule.rows.map(function (rw, i) { return lb.rows.blockRow[i] + 1 + rw.lines.indexOf('eop'); });
        var num = function (r, k) { var x = ms.getCell(r, c0 + k).value; x = x && typeof x === 'object' ? x.result : x; return typeof x === 'number' ? x : 0; }; // a cached 0 reads back as undefined
        for (n = 0; n < o.P.H; n++) {
          if (n >= nM) { dev = Math.max(dev, Math.abs(o.sim.locked[n]), Math.abs(o.sim.place[n]), Math.abs(o.sim.trCash[n])); continue; } // nothing after the last maturity
          var sumE = eopRows.reduce(function (a, r) { return a + num(r, n); }, 0);
          dev = Math.max(dev, Math.abs(sumE - o.sim.locked[n]), Math.abs(num(RW.eop, n) - o.sim.locked[n]), Math.abs(-num(RW.cPl, n) - o.sim.place[n]),
            Math.abs(num(RW.cRep, n) + num(RW.cInt, n) - o.sim.trCash[n]), Math.abs(num(RW.int, n) + num(RW.cap, n) - o.sim.intFG[n]));
          if (num(RW.chk, n) !== 0) chk = false;
        }
        lq.done(dev <= 0.01 && chk && eopRows.length === o.sim.tranches.length, t('lx_st', { d: A.eur2(dev), n: nM }));
      } catch (e3) { lq.done(false, t('lx_st', { d: '–', n: String(e3 && e3.message || e3) })); }
    } catch (e2) { line(String(e2 && e2.message || e2)).done(false); }
    box.appendChild(el('div', null, el('span', { class: 'pill ' + (pass === total ? 'ok' : 'bad'), text: pass + '/' + total }), el('strong', { text: t('st_done', { p: pass, n: total }) })));
    btn.disabled = false;
    return { pass: pass, total: total };
  };
})();

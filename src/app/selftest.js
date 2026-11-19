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
    } catch (e2) { line(String(e2 && e2.message || e2)).done(false); }
    box.appendChild(el('div', null, el('span', { class: 'pill ' + (pass === total ? 'ok' : 'bad'), text: pass + '/' + total }), el('strong', { text: t('st_done', { p: pass, n: total }) })));
    btn.disabled = false;
    return { pass: pass, total: total };
  };
})();

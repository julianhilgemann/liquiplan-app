/* ===== xlsx.js: Excel export with real formulas, cached values and native charts =====
   The workbook is written with ExcelJS; DrawingML charts and the Solver names are injected with JSZip.
   `mirror()` re-computes every formula column in plain JS, row by row, the way Excel will: these values are
   stored as cached results and are compared with the web simulation in the self-test. */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};
  var R0 = 6; // first data row on CashFlows, Ladder and Liquidity
  function colL(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
  function D(ym, d) { return new Date(Date.UTC(ym.y, ym.m - 1, d || 1)); }
  var CONV = { simple: 'E', annual: 'J', compound: 'Z' };

  // ---------- data model of the workbook ----------
  function ladderRows(ctx) {
    var P = ctx.P, rows = [];
    ctx.sim.tranches.forEach(function (tr) { if (tr.kind === 'existing') rows.push({ art: 'Bestand', pid: '', bank: tr.bank, e: 0, g: tr.amount, i: tr.term, base: tr.rate, delta: 0, conv: 'E', s: 0, label: tr.label }); });
    ctx.sim.tranches.forEach(function (tr) { if (tr.kind === 'new' && tr.pinned) rows.push(newRow(P, tr, 'Fixiert')); });
    ctx.sim.tranches.forEach(function (tr) { if (tr.kind === 'new' && !tr.pinned) rows.push(newRow(P, tr, 'Neu')); });
    return rows;
  }
  function newRow(P, tr, art) { var pr = P.products[tr.k]; return { art: art, pid: pr.id, bank: pr.bank, e: tr.start, g: tr.amount, i: pr.term, base: pr.baseRate / 100, delta: tr.rate - pr.baseRate / 100, conv: CONV[pr.conv], s: 1 }; }

  // re-computation of the sheet formulas (independent of solver and simulator code)
  function mirror(ctx, rows) {
    var P = ctx.P, H = P.H, tax = P.tax, lead = P.lead, n, k;
    rows = rows || ladderRows(ctx);
    var Tst = ctx.sim.Tstar;
    var lad = rows.map(function (r) {
      var L = r.art === 'Bestand' ? r.base : Math.max(0, r.base + r.delta), I = r.i, yrs = Math.floor((I - 1) / 12), f = I - 12 * yrs, h = r.g, pay, q, tfin, u = 0;
      if (r.conv === 'J') { pay = h * (1 + L * f / 12); q = h * L * (yrs + f / 12); tfin = h * L * f / 12; }
      else if (r.conv === 'Z') { pay = h * Math.pow(1 + L, yrs) * (1 + L * f / 12); q = pay - h; tfin = h * Math.pow(1 + L, yrs) * L * f / 12; }
      else { pay = h * (1 + L * I / 12); q = pay - h; tfin = h * L * I / 12; }
      var N = r.e + I;
      if (r.e <= Tst && N > Tst) { var e = Tst - r.e + 1, ny = Math.floor((Tst - r.e) / 12), ff = e - 12 * ny; u = h * (r.conv === 'J' ? 1 + L * ff / 12 : r.conv === 'Z' ? Math.pow(1 + L, ny) * (1 + L * ff / 12) : 1 + L * e / 12); }
      return { H: h, L: L, N: N, P: pay, Q: q, R: h > 0 && I > 0 ? Math.pow(1 + q / h, 12 / I) - 1 : 0, T: tfin, U: u, E: r.e, I: I, M: r.conv, S: r.s };
    });
    var m = { lad: lad, C: [], E: [], G: [], Hh: [], I: [], K: [], L: [], M: [], N: [], O: [], Pv: [], R: [], S: [], Tg: [], Ut: [], W: [] };
    for (n = 0; n < H; n++) {
      var C = n === 0 ? P.s0 : m.N[n - 1], E = Math.max(0, C) * Math.max(0, P.rTG[n]) / 12, G = 0, Hh = 0, I = 0, K = E, S = 0;
      for (k = 0; k < lad.length; k++) {
        var a = lad[k];
        if (a.N === n) { G += a.P; K += a.T; }
        if (n > a.E && n < a.N && (n - a.E) % 12 === 0) { if (a.M === 'J') { Hh += a.H * a.L; K += a.H * a.L; } else if (a.M === 'Z') K += a.H * a.L * Math.pow(1 + a.L, (n - a.E) / 12 - 1); }
        if (a.E === n && a.S === 1) I += a.H;
        if (a.E <= n && a.N > n) S += a.H;
      }
      var Lc = (n === 0 || P.months[n].m === 1) ? K : m.L[n - 1] + K;
      var M = (tax.on && P.months[n].m === 12) ? tax.rate * Math.max(0, Lc - tax.allowance) : 0;
      var N = C + E + P.inflow[n] + G + Hh - I - P.outflow[n] - M;
      m.C.push(C); m.E.push(E); m.G.push(G); m.Hh.push(Hh); m.I.push(I); m.K.push(K); m.L.push(Lc); m.M.push(M); m.N.push(N); m.S.push(S); m.W.push(G + Hh);
      var O = 0; for (k = Math.max(0, n - lead + 1); k <= n; k++) O += m.G[k];
      m.O.push(O); m.Pv.push(N - O); m.R.push(N - O < P.floor[n] - 0.005 ? 1 : 0);
    }
    for (n = 0; n < H; n++) { var tg = Math.max(0, Math.min(m.N[n], P.outflow[Math.min(H - 1, n + 1)])); m.Tg.push(tg); m.Ut.push(Math.max(0, m.N[n] - tg)); }
    m.firstShort = m.R.indexOf(1);
    m.wealth = Tst >= 0 ? m.N[Tst] + lad.reduce(function (s, a) { return s + a.U; }, 0) : 0;
    return m;
  }

  // plan re-simulated under parallel rate shifts (for the sensitivity table)
  function sensitivity(ctx) {
    var out = [];
    [-1, -0.5, 0, 0.5, 1].forEach(function (sh) {
      var P2 = LP.core.prepare(ctx.state, { rateShift: sh }), plan = LP.sim.withPins(P2, ctx.res.placements), s2 = LP.sim.run(P2, plan);
      out.push({ shift: sh, T: s2.Tstar, interest: s2.interestToT, liq: ctx.sim.Tstar >= 0 ? s2.s[ctx.sim.Tstar] : 0 });
    });
    return out;
  }

  async function build(ctx, ExcelJS, JSZip) {
    var P = ctx.P, sim = ctx.sim, H = P.H, st = ctx.state, de = ctx.lang !== 'en';
    var T = function (a, b) { return de ? a : b; };
    var rows = ladderRows(ctx), m = mirror(ctx, rows), nT = rows.length, LE = R0 + nT + 15 - 1, LR = R0 + H - 1;
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Liquiditätsplaner'; wb.created = new Date(); wb.calcProperties.fullCalcOnLoad = true;
    var BLUE = { color: { argb: 'FF0000FF' } }, GREEN = { color: { argb: 'FF006100' } }, BOLD = { bold: true };
    var EUR = '#,##0 "€"', EUR2 = '#,##0.00 "€"', DAT = 'dd.mm.yyyy', PCT = '0.00%', INT = '0';
    var HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF0' } };
    function head(ws, r, labels, widths) {
      labels.forEach(function (l, i) { var c = ws.getCell(r, i + 1); c.value = l; c.font = BOLD; c.fill = HEAD; c.alignment = { wrapText: true, vertical: 'middle' }; c.border = { bottom: { style: 'thin', color: { argb: 'FF9AA5A8' } } }; });
      if (widths) widths.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      ws.getRow(r).height = 30;
    }
    function v(ws, addr, value, fmt, font) { var c = ws.getCell(addr); c.value = value; if (fmt) c.numFmt = fmt; if (font) c.font = font; return c; }
    function f(ws, addr, formula, result, fmt, font) { var c = ws.getCell(addr); c.value = { formula: formula, result: result == null ? 0 : result }; if (fmt) c.numFmt = fmt; if (font) c.font = font; return c; }
    function page(ws, landscape) { ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }; ws.headerFooter = { oddFooter: '&L&A&R&P / &N' }; }
    var monthDate = function (n) { return D(P.months[Math.min(H - 1, Math.max(0, n))]); };
    var month0 = D(P.months[0]);

    // ===== 1 Cover =====
    var w1 = wb.addWorksheet('Cover'); w1.getColumn(1).width = 30; w1.getColumn(2).width = 96;
    v(w1, 'A1', T('Liquiditätsplaner – Festgeld-Leiter mit Überlebenshorizont', 'Liquidity planner – deposit ladder with survival horizon'), null, { bold: true, size: 16 });
    var Tlab = sim.Tstar < 0 ? T('sofortiger Engpass', 'immediate shortfall') : (sim.Tstar >= H - 1 ? '≥ ' : '') + P.months[sim.Tstar].key;
    var cover = [
      [T('Zweck', 'Purpose'), T('Liquiditätsplan einer Privatperson. Hauptziel ist der Überlebenshorizont T*: der letzte Monat, bis zu dem jeder Monatsbedarf ohne Engpass gedeckt ist. Zinsen sind nachrangig.', 'Liquidity plan for a private person. The primary objective is the survival horizon T*: the last month up to which every monthly need is covered. Interest is secondary.')],
      [T('Ergebnis des Web-Optimierers', 'Result of the web optimiser'), T('Liquidität gesichert bis ', 'Liquidity secured until ') + Tlab + ' (' + (sim.Tstar + 1) + T(' Monate). Solver: ', ' months). Solver: ') + (ctx.res.solver || '') + T('. Zinsen bis T*: ', '. Interest until T*: ') + Math.round(sim.interestToT) + ' €.' + (P.trancheCap && P.trancheCap.on ? T(' Höchstens ' + P.trancheCap.max + ' neue Anlagen.', ' At most ' + P.trancheCap.max + ' new deposits.') : '')],
      [T('Vergleich', 'Comparison'), T('Alles im Tagesgeld: ', 'All overnight: ') + (ctx.base.tg.Tstar + 1) + T(' Monate; naiv zinsmaximierend: ', ' months; naive rate maximiser: ') + (ctx.base.naive.Tstar + 1) + T(' Monate.', ' months.')],
      [T('Annahmen', 'Assumptions'), T('Monatsraster. Girokonto und Tagesgeld bilden eine Liquiditätsgröße und werden mit dem Tagesgeld-Zins verzinst. Festgeld ist bis zur Fälligkeit gebunden. Abgeltungsteuer wird im Dezember auf die Zinsen über dem Sparerpauschbetrag abgerechnet. Fälligkeiten zählen erst nach dem Sicherheitsvorlauf als verfügbar. Alle Zinssätze sind Beispielwerte.', 'Monthly grid. Current account and overnight money form one liquidity figure and earn the overnight rate. Deposits are locked until maturity. Tax is settled in December on interest above the allowance. Maturities only count as available after the safety lead. All rates are illustrative.')],
      [T('So wird gerechnet', 'How it calculates'), T('Inputs → CashFlows (Monatsströme) → Ladder (Tranchen) → Liquidity (Monatswasserfall, Engpass-Flag, KPI „Erster Engpass“) → Gap (Liquiditätsablaufbilanz) → Charts. Alle Werte sind Formeln; beim Öffnen wird neu berechnet.', 'Inputs → CashFlows (monthly flows) → Ladder (tranches) → Liquidity (monthly waterfall, shortfall flag, KPI “first shortfall”) → Gap (liquidity gap analysis) → Charts. All values are formulas; the file recalculates on open.')],
      [T('So wird es benutzt', 'How to use'), T('Blaue Zellen ändern (Inputs, Extra-Spalten in CashFlows, Beträge in Ladder). Der Plan rechnet sofort neu; rote Zeilen in Liquidity zeigen Engpässe. Zins_Shift auf Inputs verschiebt alle neuen Zinsen parallel. Blatt Solver: Neuoptimierung mit dem Excel-Solver.', 'Change blue cells (Inputs, extra columns in CashFlows, amounts in Ladder). The plan recalculates at once; red rows in Liquidity show shortfalls. Zins_Shift on Inputs shifts all new rates in parallel. Sheet Solver: re-optimise with Excel Solver.')],
      [T('Farblegende', 'Colour legend'), ''], [T('Blau', 'Blue'), T('Eingabe', 'Input')], [T('Schwarz', 'Black'), T('Formel', 'Formula')], [T('Grün', 'Green'), T('Verknüpfung auf ein anderes Blatt', 'Link to another sheet')],
      [T('Erstellt', 'Created'), new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
      [T('Hinweis', 'Note'), T('Keine Anlageberatung.', 'Not investment advice.')]
    ];
    cover.forEach(function (c, i) { var r = 3 + i; v(w1, 'A' + r, c[0], null, BOLD); var cc = v(w1, 'B' + r, c[1]); cc.alignment = { wrapText: true, vertical: 'top' }; });
    w1.getCell('A10').font = { bold: true, color: { argb: 'FF0000FF' } }; w1.getCell('A12').font = { bold: true, color: { argb: 'FF006100' } };
    page(w1, false);

    // ===== 2 Inputs =====
    var w2 = wb.addWorksheet('Inputs', { views: [{ state: 'frozen', ySplit: 2 }] });
    [26, 16, 18, 14, 14, 12, 12, 12].forEach(function (w, i) { w2.getColumn(i + 1).width = w; });
    v(w2, 'A1', T('Eingaben', 'Inputs'), null, { bold: true, size: 14 }); v(w2, 'A2', T('Blaue Zellen sind Eingaben.', 'Blue cells are inputs.'));
    function inp(r, label, name, value, fmt, note, formula) {
      v(w2, 'A' + r, label);
      var c = formula ? f(w2, 'B' + r, formula, value, fmt) : v(w2, 'B' + r, value, fmt, BLUE);
      c.names = [name]; if (note) v(w2, 'C' + r, note);
      return c;
    }
    inp(4, T('Stichtag', 'Start date'), 'Start', D({ y: P.start.y, m: P.start.m }, P.start.d), DAT);
    inp(5, T('Erster Planmonat', 'First plan month'), 'Monat0', month0, DAT, null, 'IF(DAY(Start)=1,Start,EOMONTH(Start,0)+1)');
    inp(6, T('Horizont (Monate)', 'Horizon (months)'), 'Horizont', H, INT, T('Zeilenzahl der Monatsblätter ist fest.', 'Row count of the monthly sheets is fixed.'));
    inp(7, T('Girokonto', 'Current account'), 'Giro', P.giro0, EUR); inp(8, T('Tagesgeld', 'Overnight money'), 'Tagesgeld', P.tg0, EUR);
    inp(9, T('Startliquidität', 'Opening liquidity'), 'Liq0', P.s0, EUR, null, 'Giro+Tagesgeld');
    inp(10, T('Monatsbedarf', 'Monthly need'), 'Bedarf', +st.need, EUR); inp(11, T('Indexierung Bedarf p. a.', 'Indexation of need p.a.'), 'Bedarf_Index', (+st.needIdx || 0) / 100, PCT);
    inp(12, T('Sockel (Mindestliquidität)', 'Buffer (minimum liquidity)'), 'Sockel', P.buffer, EUR);
    inp(13, T('Sicherheitsvorlauf (Monate)', 'Safety lead (months)'), 'Vorlauf', P.lead, INT).dataValidation = { type: 'list', allowBlank: false, formulae: ['"0,1,3"'] };
    inp(14, T('Stückelung', 'Denomination'), 'Stueckelung', P.denom, EUR).dataValidation = { type: 'list', allowBlank: false, formulae: ['"50,100,500,1000"'] };
    inp(15, T('Steuer aktiv (1/0)', 'Tax on (1/0)'), 'Steuer_Aktiv', P.tax.on ? 1 : 0, INT).dataValidation = { type: 'list', allowBlank: false, formulae: ['"0,1"'] };
    inp(16, T('Kirchensteuersatz', 'Church tax rate'), 'Kirchensteuer', (+st.tax.church || 0) / 100, PCT).dataValidation = { type: 'list', allowBlank: false, formulae: ['"0%,8%,9%"'] };
    var kk = (+st.tax.church || 0) / 100;
    inp(17, T('Steuersatz gesamt', 'Total tax rate'), 'Steuersatz', 0.25 / (1 + 0.25 * kk) * (1 + 0.055 + kk), '0.000%', T('25 % zzgl. Soli und ggf. Kirchensteuer', '25 % plus surcharge and church tax'), '0.25/(1+0.25*Kirchensteuer)*(1+0.055+Kirchensteuer)');
    inp(18, T('Sparerpauschbetrag pro Jahr', 'Allowance per year'), 'Pauschbetrag', +st.tax.allowance || 0, EUR).dataValidation = { type: 'list', allowBlank: false, formulae: ['"0,1000,2000"'] };
    inp(19, T('Tagesgeld-Zins (Basis)', 'Overnight rate (base)'), 'TG_Zins', (+st.tgRate || 0) / 100, PCT, T('Monatswerte je Szenario stehen in Liquidity!D.', 'Monthly values per scenario are in Liquidity!D.'));
    v(w2, 'A20', T('Zinsszenario', 'Rate scenario')); v(w2, 'B20', P.scenario);
    inp(21, T('Zins-Shift (parallel)', 'Rate shift (parallel)'), 'Zins_Shift', 0, PCT, T('Sensitivität: verschiebt Tagesgeld-Zins und alle neuen Festgeld-Zinsen.', 'Sensitivity: shifts the overnight rate and all new deposit rates.'));
    v(w2, 'A22', T('Erste Entnahme am (leer = sofort)', 'First withdrawal on (empty = at once)'));
    var nsd = LP.core.parseISO(st.needStart), nsCell = w2.getCell('B22');
    if (nsd) nsCell.value = D(nsd, nsd.d); nsCell.numFmt = DAT; nsCell.font = BLUE; nsCell.names = ['Bedarf_Datum'];
    f(w2, 'C22', 'IF(Bedarf_Datum="",0,MAX(0,(YEAR(Bedarf_Datum)-YEAR(Monat0))*12+MONTH(Bedarf_Datum)-MONTH(Monat0)+IF(DAY(Bedarf_Datum)=1,0,1)))', P.needStartIdx, INT).names = ['Bedarf_Start'];
    v(w2, 'D22', T('Monats-Index der ersten Entnahme', 'Month index of the first withdrawal'));
    // products
    var PR = 25, nP = st.products.length, PE = PR + Math.max(1, nP) + 5 - 1;
    v(w2, 'A23', T('Festgeld-Produkte (Beispielzinsen)', 'Deposit products (illustrative rates)'), null, BOLD);
    head(w2, 24, ['ID', T('Laufzeit (M)', 'Term (m)'), T('Zins p. a.', 'Rate p.a.'), 'Bank', T('Mindestbetrag', 'Minimum'), T('Höchstbetrag', 'Maximum'), T('Konvention (E/J/Z)', 'Convention (E/J/Z)'), T('aktiv', 'active')]);
    st.products.forEach(function (p, i) {
      var r = PR + i;
      v(w2, 'A' + r, p.id); v(w2, 'B' + r, +p.term, INT, BLUE); v(w2, 'C' + r, (+p.rate || 0) / 100, PCT, BLUE); v(w2, 'D' + r, p.bank || '', null, BLUE); v(w2, 'E' + r, +p.min || 0, EUR, BLUE); v(w2, 'F' + r, +p.max || 0, EUR, BLUE);
      v(w2, 'G' + r, CONV[p.conv] || 'E', null, BLUE).dataValidation = { type: 'list', allowBlank: false, formulae: ['"E,J,Z"'] }; v(w2, 'H' + r, p.on === false ? 0 : 1, INT, BLUE);
    });
    wb.definedNames.add('Inputs!$A$' + PR + ':$H$' + PE, 'Produkte');
    // recurring streams
    var SH = PE + 3, SR = SH + 1, nS = st.streams.length, SE = SR + Math.max(1, nS) - 1;
    v(w2, 'A' + (SH - 1), T('Regelmäßige Zahlungen', 'Recurring payments'), null, BOLD);
    head(w2, SH, ['Name', T('Betrag (+/−)', 'Amount (+/−)'), T('Periode (M)', 'Period (m)'), T('Beginn', 'Start'), T('Ende', 'End'), 'Index p. a.', 'Start-Index', T('End-Index', 'End index')]);
    var sIdx = [], eIdx = [];
    st.streams.forEach(function (s, i) {
      var r = SR + i, sd = LP.core.parseISO(s.start), ed = LP.core.parseISO(s.end);
      v(w2, 'A' + r, s.name || '', null, BLUE); v(w2, 'B' + r, +s.amount || 0, EUR2, BLUE); v(w2, 'C' + r, s.freq === 'q' ? 3 : s.freq === 'y' ? 12 : 1, INT, BLUE);
      if (sd) v(w2, 'D' + r, D(sd, sd.d), DAT, BLUE); if (ed) v(w2, 'E' + r, D(ed, ed.d), DAT, BLUE);
      v(w2, 'F' + r, (+s.idx || 0) / 100, PCT, BLUE);
      sIdx.push(sd ? LP.core.ymIdx(sd.y, sd.m) - P.idx0 : 0); eIdx.push(ed ? LP.core.ymIdx(ed.y, ed.m) - P.idx0 : 9999);
      f(w2, 'G' + r, 'IF(D' + r + '="",0,(YEAR(D' + r + ')-YEAR(Monat0))*12+MONTH(D' + r + ')-MONTH(Monat0))', sIdx[i], INT);
      f(w2, 'H' + r, 'IF(E' + r + '="",9999,(YEAR(E' + r + ')-YEAR(Monat0))*12+MONTH(E' + r + ')-MONTH(Monat0))', eIdx[i], INT);
    });
    // one-offs
    var OH = SE + 3, OR = OH + 1, nO = st.oneoffs.length, OE = OR + Math.max(1, nO) + 5 - 1;
    v(w2, 'A' + (OH - 1), T('Einmalereignisse', 'One-off events'), null, BOLD);
    head(w2, OH, [T('Datum', 'Date'), T('Betrag (+/−)', 'Amount (+/−)'), T('Bezeichnung', 'Label'), T('Monats-Index', 'Month index')]);
    var oIdx = [];
    st.oneoffs.forEach(function (o, i) {
      var r = OR + i, d = LP.core.parseISO(o.date); if (!d) return;
      v(w2, 'A' + r, D(d, d.d), DAT, BLUE); v(w2, 'B' + r, +o.amount || 0, EUR2, BLUE); v(w2, 'C' + r, o.label || '', null, BLUE);
      oIdx.push(Math.max(0, LP.core.ymIdx(d.y, d.m) - P.idx0));
      f(w2, 'D' + r, 'IF(A' + r + '="","",MAX(0,(YEAR(A' + r + ')-YEAR(Monat0))*12+MONTH(A' + r + ')-MONTH(Monat0)))', oIdx[oIdx.length - 1], INT);
    });
    page(w2, false);

    // ===== 3 CashFlows =====
    var w3 = wb.addWorksheet('CashFlows', { views: [{ state: 'frozen', xSplit: 2, ySplit: R0 - 1 }] });
    v(w3, 'A1', T('Monatliche Zahlungsströme', 'Monthly cash flows'), null, { bold: true, size: 14 });
    v(w3, 'A2', T('Spalten H–J sind manuelle Überschreibungen (blau). Ab Spalte P: eine Spalte je regelmäßiger Zahlung.', 'Columns H–J are manual overrides (blue). From column P: one column per recurring payment.'));
    var cfHead = ['n', T('Monat', 'Month'), T('Bedarf', 'Need'), T('Wiederk. Ein', 'Recurring in'), T('Wiederk. Aus', 'Recurring out'), T('Einmalig Ein', 'One-off in'), T('Einmalig Aus', 'One-off out'), T('Extra-Bedarf', 'Extra need'), T('Extra-Zufluss', 'Extra inflow'), T('Min.-Liquidität manuell', 'Min. liquidity manual'), T('Sockel wirksam', 'Buffer in force'), T('Zufluss gesamt', 'Total inflow'), T('Abfluss gesamt', 'Total outflow'), T('Netto', 'Net'), ''];
    st.streams.forEach(function (s) { cfHead.push(s.name || 'Stream'); });
    head(w3, R0 - 1, cfHead, [6, 12, 12, 13, 13, 13, 13, 13, 13, 14, 13, 14, 14, 13, 3]);
    var c0 = 16, cLast = colL(c0 + Math.max(1, nS) - 1), oB = 'Inputs!$B$' + OR + ':$B$' + OE, oD = 'Inputs!$D$' + OR + ':$D$' + OE, n;
    for (n = 0; n < H; n++) {
      var r = R0 + n, ov = (st.overrides || {})[P.months[n].key] || {};
      v(w3, 'A' + r, n, INT); f(w3, 'B' + r, 'EDATE(Monat0,A' + r + ')', monthDate(n), DAT);
      f(w3, 'C' + r, 'IF(A' + r + '<Bedarf_Start,0,Bedarf*(1+Bedarf_Index)^INT((A' + r + '-Bedarf_Start)/12))', P.need[n], EUR);
      if (nS) { f(w3, 'D' + r, 'SUMIF(' + colL(c0) + r + ':' + cLast + r + ',">0")', P.recIn[n], EUR); f(w3, 'E' + r, '-SUMIF(' + colL(c0) + r + ':' + cLast + r + ',"<0")', P.recOut[n], EUR); }
      else { v(w3, 'D' + r, 0, EUR); v(w3, 'E' + r, 0, EUR); }
      f(w3, 'F' + r, 'SUMIFS(' + oB + ',' + oD + ',A' + r + ',' + oB + ',">0")', P.oneIn[n], EUR, GREEN);
      f(w3, 'G' + r, '-SUMIFS(' + oB + ',' + oD + ',A' + r + ',' + oB + ',"<0")', P.oneOut[n], EUR, GREEN);
      v(w3, 'H' + r, P.extraNeed[n], EUR, BLUE); v(w3, 'I' + r, P.extraIn[n], EUR, BLUE);
      var jc = w3.getCell('J' + r); if (P.manualMin[n] != null) jc.value = P.manualMin[n]; jc.numFmt = EUR; jc.font = BLUE;
      f(w3, 'K' + r, 'IF(J' + r + '="",Sockel,J' + r + ')', P.floor[n], EUR);
      f(w3, 'L' + r, 'D' + r + '+F' + r + '+I' + r, P.inflow[n], EUR); f(w3, 'M' + r, 'C' + r + '+E' + r + '+G' + r + '+H' + r, P.outflow[n], EUR); f(w3, 'N' + r, 'L' + r + '-M' + r, P.net[n], EUR);
      for (var j = 0; j < nS; j++) {
        var sr = SR + j, per = st.streams[j].freq === 'q' ? 3 : st.streams[j].freq === 'y' ? 12 : 1, amt = +st.streams[j].amount || 0, val = 0;
        if (n >= sIdx[j] && n <= eIdx[j] && (((n - sIdx[j]) % per) + per) % per === 0) val = amt * Math.pow(1 + (+st.streams[j].idx || 0) / 100, Math.floor((n - Math.max(sIdx[j], 0)) / 12));
        f(w3, colL(c0 + j) + r, 'IF(AND(A' + r + '>=Inputs!$G$' + sr + ',A' + r + '<=Inputs!$H$' + sr + ',MOD(A' + r + '-Inputs!$G$' + sr + ',Inputs!$C$' + sr + ')=0),Inputs!$B$' + sr + '*(1+Inputs!$F$' + sr + ')^INT((A' + r + '-MAX(Inputs!$G$' + sr + ',0))/12),0)', val, EUR, GREEN);
        w3.getColumn(c0 + j).width = 14;
      }
    }
    page(w3, true);

    // ===== 4 Ladder =====
    var w4 = wb.addWorksheet('Ladder', { views: [{ state: 'frozen', xSplit: 2, ySplit: R0 - 1 }] });
    v(w4, 'A1', T('Tranchen (Festgeld-Leiter)', 'Tranches (deposit ladder)'), null, { bold: true, size: 14 });
    v(w4, 'A2', T('Beträge in Spalte G sind editierbar; alles rechnet neu. Konvention: E = einfach, J = jährliche Auszahlung, Z = thesaurierend. Bis Zeile ' + LE + ' können Tranchen ergänzt werden (Formeln nach unten kopieren).', 'Amounts in column G are editable; everything recalculates. Convention: E = simple, J = annual payout, Z = compounding. Tranches can be added down to row ' + LE + ' (copy the formulas down).'));
    head(w4, R0 - 1, ['Nr', T('Art', 'Type'), T('Produkt-ID', 'Product ID'), 'Bank', T('Anlage-Index', 'Placement index'), T('Anlagedatum', 'Placement date'), T('Betrag (Eingabe)', 'Amount (input)'), T('Betrag wirksam', 'Amount in force'), T('Laufzeit (M)', 'Term (m)'), T('Basiszins', 'Base rate'), T('Szenario-Δ', 'Scenario Δ'), T('Zins wirksam', 'Rate in force'), T('Konv.', 'Conv.'), T('Fälligkeits-Index', 'Maturity index'), T('Fälligkeit', 'Maturity'), T('Auszahlung bei Fälligkeit', 'Payout at maturity'), T('Zinsen gesamt', 'Total interest'), T('Effektivzins p. a.', 'Effective yield p.a.'), T('Neuanlage (1/0)', 'New money (1/0)'), T('Schlusszins (steuerpfl.)', 'Final interest (taxable)'), T('Wert in T* inkl. Zinsen', 'Value at T* incl. interest')],
      [5, 9, 11, 14, 9, 12, 14, 14, 9, 10, 10, 10, 7, 10, 12, 15, 13, 11, 10, 14, 15]);
    var SR0 = 9; // first table row on the Solver sheet
    rows.forEach(function (rw, i) {
      var r = R0 + i, a = m.lad[i], ii = 'I' + r, L = 'L' + r, Hc = 'H' + r, stub = '(' + ii + '-12*INT((' + ii + '-1)/12))', yrs = 'INT((' + ii + '-1)/12)';
      v(w4, 'A' + r, i + 1, INT); v(w4, 'B' + r, rw.art); v(w4, 'C' + r, rw.pid || rw.label || ''); v(w4, 'D' + r, rw.bank || '');
      v(w4, 'E' + r, rw.e, INT); f(w4, 'F' + r, 'EDATE(Monat0,E' + r + ')', monthDate(rw.e), DAT);
      v(w4, 'G' + r, rw.g, EUR, BLUE);
      if (rw.art === 'Neu') f(w4, Hc, 'IF(Solver_Aktiv=1,Solver!C' + (SR0 + i) + ',G' + r + ')', a.H, EUR, GREEN); else f(w4, Hc, 'G' + r, a.H, EUR);
      v(w4, ii, rw.i, INT);
      if (rw.art === 'Bestand') { v(w4, 'J' + r, rw.base, PCT, BLUE); v(w4, 'K' + r, 0, PCT); f(w4, L, 'J' + r, a.L, PCT); }
      else { f(w4, 'J' + r, 'INDEX(Inputs!$C$' + PR + ':$C$' + PE + ',MATCH(C' + r + ',Inputs!$A$' + PR + ':$A$' + PE + ',0))', rw.base, PCT, GREEN); v(w4, 'K' + r, Math.round(rw.delta * 1e8) / 1e8, PCT, BLUE); f(w4, L, 'MAX(0,J' + r + '+K' + r + '+Zins_Shift)', a.L, PCT); }
      v(w4, 'M' + r, rw.conv); f(w4, 'N' + r, 'E' + r + '+' + ii, a.N, INT);
      f(w4, 'O' + r, 'EDATE(F' + r + ',' + ii + ')', D(LP.core.ymOf(P.idx0 + a.N)), DAT);
      f(w4, 'P' + r, Hc + '*IF(M' + r + '="J",1+' + L + '*' + stub + '/12,IF(M' + r + '="Z",(1+' + L + ')^' + yrs + '*(1+' + L + '*' + stub + '/12),1+' + L + '*' + ii + '/12))', a.P, EUR2);
      f(w4, 'Q' + r, 'IF(M' + r + '="J",' + Hc + '*' + L + '*(' + yrs + '+' + stub + '/12),P' + r + '-' + Hc + ')', a.Q, EUR2);
      f(w4, 'R' + r, 'IF(AND(' + Hc + '>0,' + ii + '>0),(1+Q' + r + '/' + Hc + ')^(12/' + ii + ')-1,0)', a.R, PCT);
      v(w4, 'S' + r, rw.s, INT);
      f(w4, 'T' + r, 'IF(M' + r + '="J",' + Hc + '*' + L + '*' + stub + '/12,IF(M' + r + '="Z",' + Hc + '*(1+' + L + ')^' + yrs + '*' + L + '*' + stub + '/12,' + Hc + '*' + L + '*' + ii + '/12))', a.T, EUR2);
      var e1 = '(Tstar_Idx-E' + r + '+1)', ny = 'INT((Tstar_Idx-E' + r + ')/12)', ff = '(' + e1 + '-12*' + ny + ')';
      f(w4, 'U' + r, 'IF(AND(E' + r + '<=Tstar_Idx,N' + r + '>Tstar_Idx),' + Hc + '*IF(M' + r + '="J",1+' + L + '*' + ff + '/12,IF(M' + r + '="Z",(1+' + L + ')^' + ny + '*(1+' + L + '*' + ff + '/12),1+' + L + '*' + e1 + '/12)),0)', a.U, EUR2);
    });
    page(w4, true);

    // ===== 5 Liquidity =====
    var w5 = wb.addWorksheet('Liquidity', { views: [{ state: 'frozen', xSplit: 2, ySplit: R0 - 1 }] });
    var lr = function (c) { return 'Ladder!$' + c + '$' + R0 + ':$' + c + '$' + LE; };
    v(w5, 'A1', T('Liquiditäts-Wasserfall je Monat', 'Monthly liquidity waterfall'), null, { bold: true, size: 14 });
    v(w5, 'D1', T('Erster Engpass', 'First shortfall'), null, BOLD);
    f(w5, 'F1', 'IFERROR(INDEX($B$' + R0 + ':$B$' + LR + ',MATCH(1,$R$' + R0 + ':$R$' + LR + ',0)),"' + T('kein Engpass', 'no shortfall') + '")', m.firstShort >= 0 ? monthDate(m.firstShort) : T('kein Engpass', 'no shortfall'), 'mm/yyyy', BOLD).names = ['Erster_Engpass'];
    v(w5, 'D2', T('Reichweite T* (Monate)', 'Runway T* (months)'), null, BOLD); f(w5, 'F2', 'IFERROR(MATCH(1,$R$' + R0 + ':$R$' + LR + ',0)-1,Horizont)', m.firstShort >= 0 ? m.firstShort : H, INT, BOLD).names = ['Reichweite'];
    var wam = 0, wsum = 0; m.lad.forEach(function (a) { wam += a.H * a.I; wsum += a.H; });
    v(w5, 'H1', T('Gewichtete Laufzeit (M)', 'Weighted avg. maturity (m)'), null, BOLD); f(w5, 'K1', 'IF(SUM(' + lr('H') + ')=0,0,SUMPRODUCT(' + lr('H') + ',' + lr('I') + ')/SUM(' + lr('H') + '))', wsum ? wam / wsum : 0, '0.0', BOLD);
    v(w5, 'H2', T('Max. gebundenes Kapital', 'Max. locked capital'), null, BOLD); f(w5, 'K2', 'MAX($S$' + R0 + ':$S$' + LR + ')', Math.max.apply(null, m.S), EUR, BOLD);
    head(w5, R0 - 1, ['n', T('Monat', 'Month'), T('Anfangsbestand', 'Opening balance'), T('TG-Zins p. a.', 'Overnight rate'), T('+ Tagesgeld-Zinsen', '+ Overnight interest'), T('+ Zuflüsse', '+ Inflows'), T('+ Fälligkeiten', '+ Maturities'), T('+ Zinszahlungen Festgeld', '+ Deposit interest paid'), T('− Neuanlagen', '− Placements'), T('− Bedarf und Abflüsse', '− Need and outflows'), T('Steuerpfl. Zinsen', 'Taxable interest'), T('Zinsen kum. im Jahr', 'Interest YTD'), T('− Steuer', '− Tax'), T('= Endbestand', '= Closing balance'), T('Fälligkeiten im Vorlauf', 'Maturities inside lead'), T('Verfügbar', 'Available'), T('Sockel', 'Buffer'), T('Engpass (1/0)', 'Shortfall (1/0)'), T('Gebundenes Kapital', 'Locked capital'), 'Giro', T('Tagesgeld', 'Overnight'), T('Festgeld', 'Deposits'), T('Rückflüsse Festgeld', 'Deposit repayments')],
      [6, 11, 14, 9, 12, 12, 13, 13, 13, 13, 12, 12, 11, 14, 12, 13, 11, 9, 14, 11, 12, 12, 12]);
    for (n = 0; n < H; n++) {
      var q = R0 + n, A1 = 'A' + q, cond = '(' + A1 + '>' + lr('E') + ')*(' + A1 + '<' + lr('N') + ')*(MOD(' + A1 + '-' + lr('E') + ',12)=0)*' + lr('H') + '*' + lr('L');
      v(w5, A1, n, INT); f(w5, 'B' + q, 'CashFlows!B' + q, monthDate(n), 'mm/yyyy', GREEN);
      if (n === 0) f(w5, 'C' + q, 'Liq0', m.C[n], EUR, GREEN); else f(w5, 'C' + q, 'N' + (q - 1), m.C[n], EUR);
      v(w5, 'D' + q, Math.round(P.rTG[n] * 1e8) / 1e8, PCT, BLUE);
      f(w5, 'E' + q, 'MAX(0,C' + q + ')*MAX(0,D' + q + '+Zins_Shift)/12', m.E[n], EUR2);
      f(w5, 'F' + q, 'CashFlows!L' + q, P.inflow[n], EUR, GREEN);
      f(w5, 'G' + q, 'SUMIFS(' + lr('P') + ',' + lr('N') + ',' + A1 + ')', m.G[n], EUR2, GREEN);
      f(w5, 'H' + q, 'SUMPRODUCT((' + lr('M') + '="J")*' + cond + ')', m.Hh[n], EUR2, GREEN);
      f(w5, 'I' + q, 'SUMIFS(' + lr('H') + ',' + lr('E') + ',' + A1 + ',' + lr('S') + ',1)', m.I[n], EUR, GREEN);
      f(w5, 'J' + q, 'CashFlows!M' + q, P.outflow[n], EUR, GREEN);
      f(w5, 'K' + q, 'E' + q + '+SUMIFS(' + lr('T') + ',' + lr('N') + ',' + A1 + ')+H' + q + '+SUMPRODUCT((' + lr('M') + '="Z")*' + cond + '*(1+' + lr('L') + ')^((' + A1 + '-' + lr('E') + ')/12-1))', m.K[n], EUR2);
      if (n === 0) f(w5, 'L' + q, 'K' + q, m.L[n], EUR2); else f(w5, 'L' + q, 'IF(MONTH(B' + q + ')=1,K' + q + ',L' + (q - 1) + '+K' + q + ')', m.L[n], EUR2);
      f(w5, 'M' + q, 'IF(AND(Steuer_Aktiv=1,MONTH(B' + q + ')=12),Steuersatz*MAX(0,L' + q + '-Pauschbetrag),0)', m.M[n], EUR2);
      f(w5, 'N' + q, 'C' + q + '+E' + q + '+F' + q + '+G' + q + '+H' + q + '-I' + q + '-J' + q + '-M' + q, m.N[n], EUR2, BOLD);
      f(w5, 'O' + q, 'SUMIFS($G$' + R0 + ':$G$' + LR + ',$A$' + R0 + ':$A$' + LR + ',">"&(' + A1 + '-Vorlauf),$A$' + R0 + ':$A$' + LR + ',"<="&' + A1 + ')', m.O[n], EUR2);
      f(w5, 'P' + q, 'N' + q + '-O' + q, m.Pv[n], EUR2); f(w5, 'Q' + q, 'CashFlows!K' + q, P.floor[n], EUR, GREEN);
      f(w5, 'R' + q, 'IF(P' + q + '<Q' + q + '-0.005,1,0)', m.R[n], INT);
      f(w5, 'S' + q, 'SUMPRODUCT((' + lr('E') + '<=' + A1 + ')*(' + lr('N') + '>' + A1 + ')*' + lr('H') + ')', m.S[n], EUR, GREEN);
      f(w5, 'T' + q, 'MAX(0,MIN(N' + q + ',J' + (n < H - 1 ? q + 1 : q) + '))', m.Tg[n], EUR); f(w5, 'U' + q, 'MAX(0,N' + q + '-T' + q + ')', m.Ut[n], EUR);
      f(w5, 'V' + q, 'S' + q, m.S[n], EUR); f(w5, 'W' + q, 'G' + q + '+H' + q, m.W[n], EUR2);
    }
    w5.addConditionalFormatting({ ref: 'A' + R0 + ':W' + LR, rules: [{ type: 'expression', priority: 1, formulae: ['$R' + R0 + '=1'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: 'FF9C0006' } } } }] });
    page(w5, true);

    // ===== 6 Gap (Liquiditätsablaufbilanz) =====
    var w6 = wb.addWorksheet('Gap', { views: [{ state: 'frozen', ySplit: 5 }] });
    v(w6, 'A1', T('Liquiditätsablaufbilanz', 'Liquidity gap analysis'), null, { bold: true, size: 14 });
    v(w6, 'A2', T('Zu- und Abflüsse je Laufzeitband ab Planbeginn. Die kumulierte Lücke enthält die Startliquidität und entspricht dem Endbestand am Bandende.', 'Inflows and outflows per time band from the plan start. The cumulative gap includes the opening liquidity and equals the closing balance at the end of the band.'));
    head(w6, 5, [T('Band', 'Band'), T('von (Index)', 'from (index)'), T('bis (Index)', 'to (index)'), T('Zuflüsse', 'Inflows'), T('Rückflüsse Festgeld', 'Deposit repayments'), T('Tagesgeld-Zinsen', 'Overnight interest'), T('Summe Zuflüsse', 'Total inflows'), T('Bedarf und Abflüsse', 'Need and outflows'), T('Neuanlagen', 'Placements'), T('Steuer', 'Tax'), T('Summe Abflüsse', 'Total outflows'), T('Lücke Periode', 'Period gap'), T('Kumulierte Lücke', 'Cumulative gap')], [12, 10, 10, 13, 14, 13, 14, 14, 13, 11, 14, 14, 15]);
    var bands = [['≤ 1M', 0, 0], ['1–3M', 1, 2], ['3–6M', 3, 5], ['6–12M', 6, 11], [T('1–2J', '1–2Y'), 12, 23], [T('2–5J', '2–5Y'), 24, 59], [T('> 5J', '> 5Y'), 60, 9999]], cum = P.s0, gapCum = [];
    var liq = function (c) { return 'Liquidity!$' + c + '$' + R0 + ':$' + c + '$' + LR; };
    bands.forEach(function (b, i) {
      var r = 6 + i, sum = function (arr) { var s = 0; for (var x = b[1]; x <= Math.min(H - 1, b[2]); x++) s += arr[x]; return s; };
      var sf = function (c) { return 'SUMIFS(' + liq(c) + ',' + liq('A') + ',">="&B' + r + ',' + liq('A') + ',"<="&C' + r + ')'; };
      var d1 = sum(P.inflow), d2 = sum(m.W), d3 = sum(m.E), o1 = sum(P.outflow), o2 = sum(m.I), o3 = sum(m.M), gap = d1 + d2 + d3 - o1 - o2 - o3; cum += gap; gapCum.push(cum);
      v(w6, 'A' + r, b[0]); v(w6, 'B' + r, b[1], INT, BLUE); v(w6, 'C' + r, b[2], INT, BLUE);
      f(w6, 'D' + r, sf('F'), d1, EUR, GREEN); f(w6, 'E' + r, sf('W'), d2, EUR, GREEN); f(w6, 'F' + r, sf('E'), d3, EUR, GREEN); f(w6, 'G' + r, 'D' + r + '+E' + r + '+F' + r, d1 + d2 + d3, EUR);
      f(w6, 'H' + r, sf('J'), o1, EUR, GREEN); f(w6, 'I' + r, sf('I'), o2, EUR, GREEN); f(w6, 'J' + r, sf('M'), o3, EUR, GREEN); f(w6, 'K' + r, 'H' + r + '+I' + r + '+J' + r, o1 + o2 + o3, EUR);
      f(w6, 'L' + r, 'G' + r + '-K' + r, gap, EUR); f(w6, 'M' + r, i === 0 ? 'Liq0+L' + r : 'M' + (r - 1) + '+L' + r, cum, EUR, BOLD);
    });
    page(w6, true);

    // ===== 7 Scenarios =====
    var w7 = wb.addWorksheet('Scenarios');
    v(w7, 'A1', T('Szenarien (Werte aus dem Web-Optimierer)', 'Scenarios (values from the web optimiser)'), null, { bold: true, size: 14 });
    head(w7, 3, [T('Zinsszenario', 'Rate scenario'), T('T* optimiert (Monate)', 'T* optimised (months)'), T('Alles im Tagesgeld (Monate)', 'All overnight (months)'), T('Naiv (Monate)', 'Naive (months)'), T('Zinsen bis T*', 'Interest until T*'), T('Gewinn ggü. Tagesgeld (M)', 'Gain vs. overnight (m)'), T('Gewinn ggü. naiv (M)', 'Gain vs. naive (m)')], [34, 16, 18, 14, 16, 18, 16]);
    LP.core.scenariosFor(st).forEach(function (sc, i) {
      var r = 4 + i, s = (ctx.scen || {})[sc]; v(w7, 'A' + r, (ctx.scenNames || {})[sc] || sc);
      if (s && !s.fail) { v(w7, 'B' + r, s.T + 1, INT); v(w7, 'C' + r, s.Ttg + 1, INT); v(w7, 'D' + r, s.Tnv + 1, INT); v(w7, 'E' + r, Math.round(s.interest), EUR); f(w7, 'F' + r, 'B' + r + '-C' + r, s.T - s.Ttg, INT); f(w7, 'G' + r, 'B' + r + '-D' + r, s.T - s.Tnv, INT); }
      else v(w7, 'B' + r, T('nicht berechnet', 'not calculated'));
    });
    v(w7, 'A10', T('Zins-Shift-Sensitivität: derselbe Plan bei parallel verschobenen Zinsen (Simulation im Web)', 'Rate-shift sensitivity: the same plan under parallel rate shifts (simulated in the web app)'), null, BOLD);
    head(w7, 11, [T('Shift (Prozentpunkte)', 'Shift (percentage points)'), T('Reichweite des Plans (Monate)', 'Runway of the plan (months)'), T('Zinsen bis dahin', 'Interest until then'), T('Liquidität im Monat T*', 'Liquidity in month T*')]);
    (ctx.sens || sensitivity(ctx)).forEach(function (s, i) { var r = 12 + i; v(w7, 'A' + r, s.shift / 100, '+0.00%;-0.00%;0.00%'); v(w7, 'B' + r, s.T + 1, INT); v(w7, 'C' + r, Math.round(s.interest), EUR); v(w7, 'D' + r, Math.round(s.liq), EUR); });
    v(w7, 'A18', T('Zum Nachrechnen im Modell: Inputs!Zins_Shift setzen und Liquidity!F2 ablesen.', 'To replay in the model: set Inputs!Zins_Shift and read Liquidity!F2.'));
    page(w7, true);

    // ===== 8 Charts =====
    var w8 = wb.addWorksheet('Charts');
    v(w8, 'A1', T('Diagramme (verknüpft mit Liquidity und Gap; aktualisieren sich mit den Eingaben)', 'Charts (linked to Liquidity and Gap; they update with the inputs)'), null, { bold: true, size: 14 });
    page(w8, true);

    // ===== 9 Solver =====
    var w9 = wb.addWorksheet('Solver', { views: [{ state: 'frozen', ySplit: SR0 - 1 }] });
    [8, 12, 16, 22, 3, 12, 18, 3, 90].forEach(function (w, i) { w9.getColumn(i + 1).width = w; });
    var Tst = sim.Tstar, firstNew = -1, lastNew = -1;
    rows.forEach(function (rw, i) { if (rw.art === 'Neu') { if (firstNew < 0) firstNew = i; lastNew = i; } });
    v(w9, 'A1', T('Neuoptimierung mit dem Excel-Solver (Stufe 2: Vermögen in T* maximieren, T* fest)', 'Re-optimisation with Excel Solver (stage 2: maximise wealth at T*, T* fixed)'), null, { bold: true, size: 14 });
    v(w9, 'A3', T('Solver-Werte aktiv (1/0)', 'Use solver values (1/0)')); var sa = v(w9, 'C3', 0, INT, BLUE); sa.names = ['Solver_Aktiv']; sa.dataValidation = { type: 'list', allowBlank: false, formulae: ['"0,1"'] };
    v(w9, 'A4', T('Zielzelle: Vermögen in T*', 'Objective: wealth at T*'));
    f(w9, 'C4', 'IF(Tstar_Idx<0,0,INDEX(Liquidity!$N$' + R0 + ':$N$' + LR + ',Tstar_Idx+1)+SUM(' + lr('U') + '))', m.wealth, EUR2, BOLD).names = ['Vermoegen_Tstar'];
    v(w9, 'A5', T('T* (Monats-Index, fest)', 'T* (month index, fixed)')); v(w9, 'C5', Tst, INT, BLUE).names = ['Tstar_Idx'];
    head(w9, SR0 - 1, ['Nr', T('Art', 'Type'), T('Betrag (Entscheidungszelle)', 'Amount (decision cell)'), T('Tranche', 'Tranche'), '', T('Monats-Index', 'Month index'), T('Verfügbar − Sockel (≥ 0)', 'Available − buffer (≥ 0)')]);
    rows.forEach(function (rw, i) { var r = SR0 + i; v(w9, 'A' + r, i + 1, INT); v(w9, 'B' + r, rw.art); v(w9, 'C' + r, rw.g, EUR, rw.art === 'Neu' ? BLUE : null); v(w9, 'D' + r, (rw.pid || rw.label || '') + ' · ' + rw.i + 'M · ' + P.months[Math.min(H - 1, rw.e)].key); });
    var nCon = Math.max(0, Tst + 1);
    for (n = 0; n < nCon; n++) { var cr = SR0 + n; v(w9, 'F' + cr, n, INT); f(w9, 'G' + cr, 'INDEX(Liquidity!$P$' + R0 + ':$P$' + LR + ',F' + cr + '+1)-INDEX(Liquidity!$Q$' + R0 + ':$Q$' + LR + ',F' + cr + '+1)', m.Pv[n] - P.floor[n], EUR2, GREEN); }
    var eng = P.tax.on ? 1 : 2, adj = firstNew >= 0 ? 'Solver!$C$' + (SR0 + firstNew) + ':$C$' + (SR0 + lastNew) : null, lhs = nCon ? 'Solver!$G$' + SR0 + ':$G$' + (SR0 + nCon - 1) : null;
    var steps = [
      T('Schritt für Schritt', 'Step by step'),
      T('1. Excel: Datei → Optionen → Add-Ins → Excel-Add-Ins → „Solver“ aktivieren.', '1. Excel: File → Options → Add-ins → Excel Add-ins → enable “Solver”.'),
      T('2. Zelle C3 (Solver_Aktiv) auf 1 setzen. Dann verwendet Ladder die Beträge aus Spalte C dieses Blatts.', '2. Set cell C3 (Solver_Aktiv) to 1. Ladder then uses the amounts in column C of this sheet.'),
      T('3. Daten → Solver öffnen. Die Einstellungen sind vorbelegt; falls nicht, wie folgt setzen:', '3. Open Data → Solver. The settings are pre-filled; if not, set them as follows:'),
      T('   Ziel festlegen: $C$4, Max.', '   Set objective: $C$4, Max.'),
      T('   Durch Ändern von Variablenzellen: ', '   By changing variable cells: ') + (adj ? adj.replace('Solver!', '') : '–'),
      T('   Nebenbedingung: ', '   Constraint: ') + (lhs ? lhs.replace('Solver!', '') + ' >= 0' : '–'),
      T('   „Nicht eingeschränkte Variablen als nicht-negativ festlegen“ aktivieren.', '   Tick “Make unconstrained variables non-negative”.'),
      T('   Lösungsmethode: Simplex-LP (bei aktiver Steuer: GRG-Nichtlinear, weil MAX(0;…) einen Knick hat).', '   Solving method: Simplex LP (with tax on: GRG Nonlinear, because MAX(0,…) has a kink).'),
      T('4. Lösen. Optional für die Stückelung: Hilfsspalte Betrag/Stueckelung anlegen und als „int“ einschränken.', '4. Solve. Optional for denominations: add a helper column amount/Stueckelung and constrain it to “int”.'),
      T('5. Der Excel-Solver erlaubt höchstens 200 Variablenzellen. T* bleibt fest: Die Nebenbedingungen gelten für die Monate 0 … T*.', '5. Excel Solver allows at most 200 variable cells. T* stays fixed: the constraints cover months 0 … T*.'),
      T('6. Zurück zu den eigenen Beträgen: C3 wieder auf 0 setzen.', '6. Back to your own amounts: set C3 to 0 again.')
    ];
    steps.forEach(function (s, i) { var c = v(w9, 'I' + (SR0 - 1 + i), s, null, i === 0 ? BOLD : null); c.alignment = { wrapText: true, vertical: 'top' }; });
    page(w9, true);

    // ===== write and post-process =====
    var buf = await wb.xlsx.writeBuffer();
    var zip = await JSZip.loadAsync(buf);
    var wbXml = await zip.file('xl/workbook.xml').async('string'), relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    function sheetPath(name) {
      var mm = new RegExp('<sheet[^>]*name="' + name + '"[^>]*r:id="([^"]+)"').exec(wbXml) || new RegExp('<sheet[^>]*r:id="([^"]+)"[^>]*name="' + name + '"').exec(wbXml);
      var rr = new RegExp('<Relationship[^>]*Id="' + mm[1] + '"[^>]*Target="([^"]+)"').exec(relsXml) || new RegExp('<Relationship[^>]*Target="([^"]+)"[^>]*Id="' + mm[1] + '"').exec(relsXml);
      return 'xl/' + rr[1].replace(/^\/?xl\//, '');
    }
    var sheetNames = []; wbXml.replace(/<sheet [^>]*name="([^"]+)"/g, function (_, nm) { sheetNames.push(nm); return _; });
    // --- charts ---
    var cats = { f: 'Liquidity!$B$' + R0 + ':$B$' + LR, vals: [], fmt: 'mm/yyyy' };
    for (n = 0; n < H; n++) cats.vals.push(Math.round(month0.getTime() / 86400000 + 25569) + 0); // placeholder, replaced below
    cats.vals = P.months.map(function (ym) { return Math.round(Date.UTC(ym.y, ym.m - 1, 1) / 86400000 + 25569); });
    var hd = function (c) { return 'Liquidity!$' + c + '$' + (R0 - 1); }, rg = function (c) { return 'Liquidity!$' + c + '$' + R0 + ':$' + c + '$' + LR; };
    var r2 = function (a) { return a.map(function (x) { return Math.round(x * 100) / 100; }); };
    var chartsXml = [
      chartXml({ type: 'area', title: T('Giro, Tagesgeld und Festgeld (Monatsende)', 'Current account, overnight and deposits (month end)'), cat: cats, skip: 12,
        series: [{ name: 'Giro', nf: hd('T'), f: rg('T'), vals: r2(m.Tg), color: 'EDA100' }, { name: T('Tagesgeld', 'Overnight'), nf: hd('U'), f: rg('U'), vals: r2(m.Ut), color: '1BAF7A' }, { name: T('Festgeld', 'Deposits'), nf: hd('V'), f: rg('V'), vals: r2(m.S), color: '2A78D6' }] }),
      chartXml({ type: 'line', title: T('Verfügbare Liquidität und Sockel', 'Available liquidity and buffer'), cat: cats, skip: 12,
        series: [{ name: T('Verfügbar', 'Available'), nf: hd('P'), f: rg('P'), vals: r2(m.Pv), color: '2A78D6' }, { name: T('Sockel', 'Buffer'), nf: hd('Q'), f: rg('Q'), vals: r2(P.floor), color: 'D03B3B' }] }),
      chartXml({ type: 'bar', title: T('Rückflüsse aus Festgeld je Monat', 'Deposit repayments per month'), cat: cats, skip: 12,
        series: [{ name: T('Rückflüsse Festgeld', 'Deposit repayments'), nf: hd('W'), f: rg('W'), vals: r2(m.W), color: '1C5CAB' }] }),
      chartXml({ type: 'bar', title: T('Kumulierte Liquiditätslücke je Laufzeitband', 'Cumulative liquidity gap per band'), cat: { f: 'Gap!$A$6:$A$12', str: bands.map(function (b) { return b[0]; }) }, skip: 1,
        series: [{ name: T('Kumulierte Lücke', 'Cumulative gap'), nf: 'Gap!$M$5', f: 'Gap!$M$6:$M$12', vals: r2(gapCum), color: '1F6F78' }] })
    ];
    var anchors = [[0, 2, 11, 22], [12, 2, 23, 22], [0, 24, 11, 44], [12, 24, 23, 44]], drawing = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">';
    var dRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">', ctAdd = '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    chartsXml.forEach(function (xml, i) {
      var a = anchors[i], id = i + 1;
      zip.file('xl/charts/chart' + id + '.xml', xml);
      drawing += '<xdr:twoCellAnchor><xdr:from><xdr:col>' + a[0] + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + a[1] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>' + a[2] + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + a[3] + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
        '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (id + 1) + '" name="Chart ' + id + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId' + id + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
      dRels += '<Relationship Id="rId' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + id + '.xml"/>';
      ctAdd += '<Override PartName="/xl/charts/chart' + id + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
    });
    zip.file('xl/drawings/drawing1.xml', drawing + '</xdr:wsDr>');
    zip.file('xl/drawings/_rels/drawing1.xml.rels', dRels + '</Relationships>');
    var chartSheet = sheetPath('Charts'), csXml = await zip.file(chartSheet).async('string');
    var relPath = chartSheet.replace('worksheets/', 'worksheets/_rels/') + '.rels', relFile = zip.file(relPath), drawRel = '<Relationship Id="rIdDrw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>';
    if (relFile) zip.file(relPath, (await relFile.async('string')).replace('</Relationships>', drawRel + '</Relationships>'));
    else zip.file(relPath, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drawRel + '</Relationships>');
    if (csXml.indexOf('xmlns:r=') < 0) csXml = csXml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    var dtag = '<drawing r:id="rIdDrw1"/>', anchor = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'], placed = false;
    for (var ai = 0; ai < anchor.length && !placed; ai++) { var pos = csXml.indexOf(anchor[ai]); if (pos >= 0) { csXml = csXml.slice(0, pos) + dtag + csXml.slice(pos); placed = true; } }
    zip.file(chartSheet, csXml);
    var ct = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct.replace('</Types>', ctAdd + '</Types>'));
    // --- Solver settings as hidden sheet-scoped names (what Excel itself writes) ---
    var sIdxSheet = sheetNames.indexOf('Solver');
    if (adj && lhs && sIdxSheet >= 0 && wbXml.indexOf('</definedNames>') >= 0) {
      var sn = { solver_adj: adj, solver_cvg: '0.0001', solver_drv: '1', solver_eng: String(eng), solver_est: '1', solver_itr: '2147483647', solver_lhs1: lhs, solver_lin: eng === 2 ? '1' : '2', solver_mip: '2147483647', solver_mni: '30', solver_mrt: '0.075', solver_msl: '2', solver_neg: '1', solver_nod: '2147483647', solver_num: '1', solver_nwt: '1', solver_opt: 'Solver!$C$4', solver_pre: '0.000001', solver_rbv: '1', solver_rel1: '3', solver_rhs1: '0', solver_rlx: '2', solver_rsd: '0', solver_scl: '1', solver_sho: '2', solver_ssz: '100', solver_tim: '2147483647', solver_tol: '0.01', solver_typ: '1', solver_val: '0', solver_ver: '3' };
      var dn = Object.keys(sn).sort().map(function (k2) { return '<definedName name="' + k2 + '" localSheetId="' + sIdxSheet + '" hidden="1">' + sn[k2] + '</definedName>'; }).join('');
      wbXml = wbXml.replace('</definedNames>', dn + '</definedNames>');
      zip.file('xl/workbook.xml', wbXml);
    }
    var out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { data: out, mirror: m, rows: rows };
  }

  // ---------- DrawingML chart part ----------
  function x(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function numCache(vals, fmt) { var s = '<c:numCache><c:formatCode>' + x(fmt || 'General') + '</c:formatCode><c:ptCount val="' + vals.length + '"/>'; vals.forEach(function (vv, i) { s += '<c:pt idx="' + i + '"><c:v>' + (isFinite(vv) ? vv : 0) + '</c:v></c:pt>'; }); return s + '</c:numCache>'; }
  function strCache(vals) { var s = '<c:strCache><c:ptCount val="' + vals.length + '"/>'; vals.forEach(function (vv, i) { s += '<c:pt idx="' + i + '"><c:v>' + x(vv) + '</c:v></c:pt>'; }); return s + '</c:strCache>'; }
  function chartXml(o) {
    var ax1 = 500000001, ax2 = 500000002, ser = '';
    var cat = o.cat.str ? '<c:cat><c:strRef><c:f>' + x(o.cat.f) + '</c:f>' + strCache(o.cat.str) + '</c:strRef></c:cat>' : '<c:cat><c:numRef><c:f>' + x(o.cat.f) + '</c:f>' + numCache(o.cat.vals, o.cat.fmt) + '</c:numRef></c:cat>';
    o.series.forEach(function (s, i) {
      var sp = o.type === 'line' ? '<c:spPr><a:ln w="22225" cap="rnd"><a:solidFill><a:srgbClr val="' + s.color + '"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>' : '<c:spPr><a:solidFill><a:srgbClr val="' + s.color + '"/></a:solidFill></c:spPr>' + (o.type === 'bar' ? '<c:invertIfNegative val="0"/>' : '');
      ser += '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/><c:tx><c:strRef><c:f>' + x(s.nf) + '</c:f>' + strCache([s.name]) + '</c:strRef></c:tx>' + sp + cat + '<c:val><c:numRef><c:f>' + x(s.f) + '</c:f>' + numCache(s.vals, 'General') + '</c:numRef></c:val>' + (o.type === 'line' ? '<c:smooth val="0"/>' : '') + '</c:ser>';
    });
    var body;
    if (o.type === 'area') body = '<c:areaChart><c:grouping val="stacked"/><c:varyColors val="0"/>' + ser + '<c:axId val="' + ax1 + '"/><c:axId val="' + ax2 + '"/></c:areaChart>';
    else if (o.type === 'line') body = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + ser + '<c:marker val="1"/><c:axId val="' + ax1 + '"/><c:axId val="' + ax2 + '"/></c:lineChart>';
    else body = '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + ser + '<c:gapWidth val="60"/><c:axId val="' + ax1 + '"/><c:axId val="' + ax2 + '"/></c:barChart>';
    var grid = '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
    var catAx = '<c:catAx><c:axId val="' + ax1 + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' + (o.cat.str ? '' : '<c:numFmt formatCode="mm/yyyy" sourceLinked="0"/>') + '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:crossAx val="' + ax2 + '"/><c:crosses val="autoZero"/><c:auto val="0"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:tickLblSkip val="' + o.skip + '"/><c:tickMarkSkip val="' + o.skip + '"/><c:noMultiLvlLbl val="1"/></c:catAx>';
    var valAx = '<c:valAx><c:axId val="' + ax2 + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>' + grid + '<c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="' + ax1 + '"/><c:crosses val="autoZero"/><c:crossBetween val="' + (o.type === 'bar' ? 'between' : 'midCat') + '"/></c:valAx>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:roundedCorners val="0"/><c:chart>' +
      '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="de-DE" sz="1200" b="1"/><a:t>' + x(o.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>' +
      '<c:plotArea><c:layout/>' + body + catAx + valAx + '</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="zero"/></c:chart></c:chartSpace>';
  }

  LP.xlsx = { build: build, mirror: mirror, ladderRows: ladderRows, sensitivity: sensitivity };
})(typeof self !== 'undefined' ? self : globalThis);

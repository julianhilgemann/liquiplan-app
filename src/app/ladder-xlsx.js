/* ===== ladder-xlsx.js: the deposit ladder as a small spreadsheet (one row per tranche, then every tranche as a roll-forward) =====
   Three sheets: the tranches with their terms, a monthly and a yearly schedule. In the schedules each tranche is a block
   opening balance + placement + capitalised interest + repayment = closing balance, plus the interest it pays out; the totals
   and the cash view of the liquid accounts sit on top. Written with ExcelJS alone, for Excel and Google Sheets alike: classic
   functions, formulas and conditional formats within one sheet where Google Sheets needs it, rules of the "formula" and
   "cell value" kinds only, no post-processing of the file.
   `schedule()` computes every formula cell in plain JS, the way the sheet computes it. Those values are stored as cached
   results, so the numbers show in viewers that do not recalculate, and the self-test compares them with the simulator. */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};

  // layout of the two schedule sheets (Monthly and Yearly use the same rows, so a yearly cell sums the monthly row it sits in)
  var C0 = 11; // first period column (K); A–J: number, label, rate, total and the terms of the tranche
  var R = { title: 1, sub: 2, mark: 3, head: 4, head2: 5, tot: 6, bop: 7, pl: 8, cap: 9, rep: 10, eop: 11, int: 12, chk: 13, chk2: 14, cash: 15, cPl: 16, cRep: 17, cInt: 18, cNet: 19, trs: 21, tr0: 22 };
  var TR = { head: 8, row0: 9 }; // table on the tranche sheet
  var LINES = { existing: ['bop', 'rep', 'eop', 'int'], simple: ['bop', 'pl', 'rep', 'eop', 'int'], annual: ['bop', 'pl', 'rep', 'eop', 'int'], compound: ['bop', 'pl', 'cap', 'rep', 'eop', 'int'] };
  // bar colours of the app's ladder (tokens --c-f1 … --c-f4, --c-ex), the maturity green, and the marks of the sheet
  var COL = { f1: 'FF86B6EF', f2: 'FF3987E5', f3: 'FF1C5CAB', f4: 'FF0D366B', ex: 'FF6250D6', due: 'FF1BAF7A', eop: 'FFEAF1FB', ts: 'FF1D1D1F', bad: 'FFF8D7DA', badInk: 'FF9C0006', neg: 'FFC00000', late: 'FFFFF2CC', lateInk: 'FF7F6000' };

  function colL(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
  function monthDate(P, n) { var ym = LP.core.ymOf(P.idx0 + n); return new Date(Date.UTC(ym.y, ym.m - 1, 1)); }
  function stubOf(L) { return L - 12 * Math.floor((L - 1) / 12); } // months of interest paid at maturity (annual, compound)
  function round2(x) { return (x < 0 ? -1 : 1) * Math.round(Math.abs(x) * 100) / 100; } // ROUND(x, 2): halves away from zero
  function sheetRef(name) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : "'" + name.replace(/'/g, "''") + "'"; }

  // ---------- the data: tranches in reading order and their schedule ----------
  function convOf(tr) { return tr.kind === 'existing' ? 'simple' : tr.conv; }
  function linesOf(tr) { return LINES[tr.kind === 'existing' ? 'existing' : tr.conv] || LINES.simple; }
  function order(sim) { // existing holdings first, then by placement month and maturity (as the ladder shows them)
    return sim.tranches.map(function (tr, i) { return { tr: tr, i: i }; }).sort(function (a, b) {
      return (a.tr.kind === 'existing' ? 0 : 1) - (b.tr.kind === 'existing' ? 0 : 1) || a.tr.start - b.tr.start || a.tr.due - b.tr.due || a.i - b.i;
    }).map(function (x) { return x.tr; });
  }
  // contract figures of one tranche over its full life (also when it matures after the plan), as the tranche sheet computes them
  function contract(tr) {
    var h = tr.amount, r = tr.rate, L = tr.term, n = Math.floor((L - 1) / 12), f = L - 12 * n, conv = convOf(tr), q, pay;
    if (conv === 'annual') { q = h * r * (n + f / 12); pay = h * (1 + r * f / 12); }
    else if (conv === 'compound') { q = h * (Math.pow(1 + r, n) * (1 + r * f / 12) - 1); pay = h + q; }
    else { q = h * r * L / 12; pay = h + q; }
    return { interest: q, payout: pay, yld: h > 0 && L > 0 ? Math.pow(1 + q / h, 12 / L) - 1 : 0 };
  }
  // month by month from the plan start to the last maturity (or to the end of the horizon when a tranche runs beyond it)
  function schedule(P, sim) {
    var H = P.H, list = order(sim), end = -1, n, k;
    list.forEach(function (tr) { end = Math.max(end, Math.min(H - 1, tr.due)); });
    if (end < 0) end = Math.min(H - 1, 11); // no tranches: one year of empty totals
    var M = end + 1, KEYS = ['bop', 'pl', 'cap', 'rep', 'eop', 'int'];
    var rows = list.map(function (tr) {
      var ex = tr.kind === 'existing', h = tr.amount, r = tr.rate, L = tr.term, s = tr.start, due = tr.start + tr.term, conv = convOf(tr), prev = 0;
      var o = { tr: tr, conv: conv, lines: linesOf(tr), c: contract(tr), bop: [], pl: [], cap: [], rep: [], eop: [], int: [] };
      for (n = 0; n < M; n++) {
        var b = n === 0 ? (ex ? h : 0) : prev, pl = !ex && n === s ? h : 0;
        var ann = n > s && n < due && (n - s) % 12 === 0; // anniversary before maturity
        var cap = conv === 'compound' && ann ? b * r : 0, rep = n === due ? -b : 0, e = b + pl + cap + rep;
        var it = n === due ? b * r * (conv === 'simple' ? L : stubOf(L)) / 12 : (conv === 'annual' && ann ? b * r : 0);
        o.bop.push(b); o.pl.push(pl); o.cap.push(cap); o.rep.push(rep); o.eop.push(e); o.int.push(it); prev = e;
      }
      o.sum = {}; KEYS.forEach(function (key) { o.sum[key] = o[key].reduce(function (a, x) { return a + x; }, 0); });
      o.sum.bop = o.bop[0]; o.sum.eop = o.eop[M - 1];
      return o;
    });
    var tot = { bop: [], pl: [], cap: [], rep: [], eop: [], int: [], chk: [], cPl: [], cRep: [], cInt: [], cNet: [] };
    for (n = 0; n < M; n++) {
      var add = function (key) { var s = 0; for (k = 0; k < rows.length; k++) s += rows[k][key][n]; return s; };
      var tb = n === 0 ? add('bop') : tot.eop[n - 1], tp = add('pl'), tc = add('cap'), tr2 = add('rep'), te = tb + tp + tc + tr2;
      tot.bop.push(tb); tot.pl.push(tp); tot.cap.push(tc); tot.rep.push(tr2); tot.eop.push(te); tot.int.push(add('int'));
      tot.chk.push(round2(add('eop') - te));
      tot.cPl.push(-tp); tot.cRep.push(-tr2); tot.cInt.push(tot.int[n]); tot.cNet.push(-tp + -tr2 + tot.int[n]);
    }
    // calendar years: the same lines, summed
    var years = [];
    for (n = 0; n < M; n++) { var y = P.months[n].y; if (!years.length || years[years.length - 1].y !== y) years.push({ y: y, a: n, b: n }); else years[years.length - 1].b = n; }
    function sumY(arr, yy) { var s = 0; for (var i = yy.a; i <= yy.b; i++) s += arr[i]; return s; }
    rows.forEach(function (o) {
      o.y = { bop: [], pl: [], cap: [], rep: [], eop: [], int: [] };
      years.forEach(function (yy, j) {
        var b = j === 0 ? o.bop[0] : o.y.eop[j - 1], pl = sumY(o.pl, yy), cap = sumY(o.cap, yy), rep = sumY(o.rep, yy);
        o.y.bop.push(b); o.y.pl.push(pl); o.y.cap.push(cap); o.y.rep.push(rep); o.y.int.push(sumY(o.int, yy));
        o.y.eop.push(o.lines.indexOf('cap') >= 0 ? b + pl + cap + rep : (o.lines.indexOf('pl') >= 0 ? b + pl + rep : b + rep));
      });
      o.y.sum = { bop: o.y.bop[0], eop: o.y.eop[years.length - 1] };
      ['pl', 'cap', 'rep', 'int'].forEach(function (key) { o.y.sum[key] = o.y[key].reduce(function (a, x) { return a + x; }, 0); });
    });
    var ty = { bop: [], pl: [], cap: [], rep: [], eop: [], int: [], chk: [], chk2: [], cPl: [], cRep: [], cInt: [], cNet: [] };
    years.forEach(function (yy, j) {
      var add = function (key) { var s = 0; for (k = 0; k < rows.length; k++) s += rows[k].y[key][j]; return s; };
      var tb = j === 0 ? add('bop') : ty.eop[j - 1], tp = add('pl'), tc = add('cap'), tr2 = add('rep'), te = tb + tp + tc + tr2;
      ty.bop.push(tb); ty.pl.push(tp); ty.cap.push(tc); ty.rep.push(tr2); ty.eop.push(te); ty.int.push(add('int'));
      ty.chk.push(round2(add('eop') - te)); ty.chk2.push(round2(te - tot.eop[yy.b]));
      ty.cPl.push(-tp); ty.cRep.push(-tr2); ty.cInt.push(ty.int[j]); ty.cNet.push(-tp + -tr2 + ty.int[j]);
    });
    return { list: list, rows: rows, M: M, tot: tot, years: years, ty: ty };
  }

  // ---------- the workbook ----------
  async function build(ctx, ExcelJS) {
    var P = ctx.P, sim = ctx.sim, t = ctx.t, H = P.H, de = ctx.lang !== 'en';
    var S = schedule(P, sim), rows = S.rows, M = S.M, nT = rows.length, years = S.years, nY = years.length;
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Liquiditätsplaner'; wb.created = ctx.created || new Date(); wb.calcProperties.fullCalcOnLoad = true;
    var NT = t('lx_shTr'), NM = t('lx_shMon'), NY = t('lx_shYear'), rT = sheetRef(NT), rM = sheetRef(NM);

    // styles: complete objects, shared by many cells and never changed afterwards
    var AMT = '#,##0.00_);(#,##0.00);"–"_)', PCT = '0.00##%', PCT2 = '0.00%', INT = '0', MON = 'mmm yyyy', AVG = '0.0';
    var F = function (o) { var f = { name: 'Calibri', size: 10 }; for (var k in o) f[k] = o[k]; return f; };
    var INK = { blue: { argb: 'FF0000FF' }, green: { argb: 'FF006100' }, grey: { argb: 'FF6E6E73' } };
    var fill = function (argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb }, bgColor: { argb: argb } }; };
    var HEADFILL = fill('FFE7EEF0'), BLOCKFILL = fill('FFF3F5F6'), thin = { style: 'thin', color: { argb: 'FF9AA5A8' } }, hair = { style: 'thin', color: { argb: 'FFD9DDE0' } };
    function st(font, numFmt, extra) { var s = { font: F(font || {}) }; if (numFmt) s.numFmt = numFmt; if (extra) for (var k in extra) s[k] = extra[k]; return s; }
    var ST = {
      title: st({ bold: true, size: 14 }), sub: st({ color: INK.grey }), lab: st(), labB: st({ bold: true }), labI: st({ italic: true, color: INK.grey }),
      labIn: st({}, null, { alignment: { indent: 1 } }), labInB: st({ bold: true }, null, { alignment: { indent: 1 }, border: { top: hair } }),
      head: st({ bold: true }, null, { fill: HEADFILL, alignment: { wrapText: true, vertical: 'middle' }, border: { bottom: thin } }),
      headR: st({ bold: true }, null, { fill: HEADFILL, alignment: { wrapText: true, vertical: 'middle', horizontal: 'right' }, border: { bottom: thin } }),
      headM: st({ bold: true }, MON, { fill: HEADFILL, alignment: { vertical: 'middle', horizontal: 'right' }, border: { bottom: thin } }),
      headML: st({ bold: true, color: INK.green }, MON, { fill: HEADFILL, alignment: { vertical: 'middle', horizontal: 'right' }, border: { bottom: thin } }),
      headY: st({ bold: true }, INT, { fill: HEADFILL, alignment: { vertical: 'middle', horizontal: 'right' }, border: { bottom: thin } }),
      headYL: st({ bold: true, color: INK.green }, INT, { fill: HEADFILL, alignment: { vertical: 'middle', horizontal: 'right' }, border: { bottom: thin } }),
      yr: st({ size: 8, color: INK.grey }, INT, { alignment: { horizontal: 'right' } }), yrL: st({ size: 8, color: INK.green }, INT, { alignment: { horizontal: 'right' } }),
      sec: st({ bold: true }, null, { fill: HEADFILL }),
      blk: st({ bold: true }, null, { fill: BLOCKFILL, border: { top: hair } }), blkN: st({ color: INK.grey }, INT, { fill: BLOCKFILL, border: { top: hair }, alignment: { horizontal: 'left' } }), blkE: st({}, null, { fill: BLOCKFILL, border: { top: hair } }),
      blkPct: st({ color: INK.green }, PCT, { fill: BLOCKFILL, border: { top: hair } }), blkAmt: st({ color: INK.green }, AMT, { fill: BLOCKFILL, border: { top: hair } }),
      blkInt: st({ color: INK.green }, INT, { fill: BLOCKFILL, border: { top: hair } }), blkTxt: st({ color: INK.green }, null, { fill: BLOCKFILL, border: { top: hair } }),
      blkMon: st({ color: INK.green }, MON, { fill: BLOCKFILL, border: { top: hair }, alignment: { horizontal: 'right' } }),
      amt: st({}, AMT), amtIn: st({ color: INK.blue }, AMT), amtL: st({ color: INK.green }, AMT),
      amtE: st({ bold: true }, AMT, { border: { top: hair } }),
      amtT: st({ bold: true }, AMT, { border: { top: thin, bottom: { style: 'double', color: { argb: 'FF9AA5A8' } } } }),
      chk: st({ italic: true, color: INK.grey }, AMT), chkL: st({ italic: true, color: INK.green }, AMT),
      pct: st({}, PCT), pctIn: st({ color: INK.blue }, PCT), pct2: st({}, PCT2), int: st({}, INT), intIn: st({ color: INK.blue }, INT),
      mon: st({}, MON, { alignment: { horizontal: 'right' } }), monIn: st({ color: INK.blue }, MON, { alignment: { horizontal: 'right' } }),
      monL: st({}, MON, { alignment: { horizontal: 'left' } }), monInL: st({ color: INK.blue }, MON, { alignment: { horizontal: 'left' } }), intInL: st({ color: INK.blue }, INT, { alignment: { horizontal: 'left' } }),
      totLab: st({ bold: true }, null, { border: { top: thin, bottom: { style: 'double', color: { argb: 'FF9AA5A8' } } } }),
      totAmt: st({ bold: true }, AMT, { border: { top: thin, bottom: { style: 'double', color: { argb: 'FF9AA5A8' } } } }),
      totE: st({ bold: true }, null, { border: { top: thin, bottom: { style: 'double', color: { argb: 'FF9AA5A8' } } } }), eopE: st({}, null, { border: { top: hair } }),
      avg: st({ italic: true }, AVG), avgPct: st({ italic: true }, PCT), avgLab: st({ italic: true }),
      note: st({ color: INK.grey }), legB: st({ color: INK.blue }, AMT), legK: st({}, AMT), legG: st({ color: INK.green }, AMT)
    };
    function put(ws, r, c, value, style) { var cell = ws.getCell(r, c); cell.value = value; if (style) cell.style = style; return cell; }
    function fx(ws, r, c, formula, result, style) { return put(ws, r, c, { formula: formula, result: result }, style); }
    function page(ws, wide, titleRows, titleCols) {
      ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: Math.max(1, wide), fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 } };
      if (titleRows) ws.pageSetup.printTitlesRow = titleRows;
      if (titleCols) ws.pageSetup.printTitlesColumn = titleCols;
      ws.headerFooter = { oddFooter: '&L&A&R&P / &N' };
    }
    var cfPrio = 0;
    function cf(ws, ref, rules) { ws.addConditionalFormatting({ ref: ref, rules: rules.map(function (rl) { rl.priority = ++cfPrio; return rl; }) }); }
    function cfFill(argb, ink, bold) { var s = { fill: fill(argb) }; if (ink) s.font = { color: { argb: ink }, bold: !!bold }; return s; }
    function q(s) { return '"' + String(s).replace(/"/g, '""') + '"'; } // a text literal inside a formula
    // one level of row grouping, open. ExcelJS would mark every grouped row as collapsed (its getter compares the row's
    // level with the sheet's); the rows are not hidden, but a viewer could read the flag as "group closed".
    function group(row) { row.outlineLevel = 1; Object.defineProperty(row, 'collapsed', { value: false }); }

    var typeOf = function (tr) { return tr.kind === 'existing' ? t('lx_tyEx') : tr.pinned ? t('lx_tyPin') : t('lx_tyNew'); };
    var bankOf = function (tr) { var b = tr.bank || (tr.k >= 0 && P.products[tr.k] ? P.products[tr.k].id : ''); return tr.kind === 'existing' ? (tr.label && tr.label !== b ? (b ? b + ' · ' : '') + tr.label : b || t('lx_tyEx')) : b; };
    var nameOf = function (tr) { return tr.kind === 'existing' ? bankOf(tr) : bankOf(tr) + ' · ' + t('lx_dep', { n: tr.term }); }; // the type stands beside it
    var trRow = function (i) { return TR.row0 + i; };
    var Tst = sim.Tstar, lastMonth = monthDate(P, H - 1), schedEnd = monthDate(P, M - 1);

    // ===== 1 Tranches: the building blocks with their terms =====
    var w1 = wb.addWorksheet(NT, { views: [{ state: 'frozen', ySplit: TR.head, topLeftCell: 'A' + TR.row0, activeCell: 'A' + TR.row0 }] });
    [5, 10, 26, 10, 10, 10, 13, 9, 14, 13, 14, 10, 14, 44].forEach(function (w, i) { w1.getColumn(i + 1).width = w; });
    put(w1, 1, 1, t('lx_title'), ST.title); w1.getRow(1).height = 22;
    put(w1, 2, 1, t('lx_what', { m: NM, y: NY }), ST.sub);
    put(w1, 3, 1, t('lx_start'), ST.labB); put(w1, 3, 4, monthDate(P, 0), ST.monInL);
    put(w1, 4, 1, t('lx_horizon'), ST.labB); put(w1, 4, 4, H, ST.intInL); put(w1, 4, 5, t('lx_months'), ST.lab);
    put(w1, 5, 1, t('lx_last'), ST.labB); fx(w1, 5, 4, 'EDATE(D3,D4-1)', lastMonth, ST.monL);
    put(w1, 6, 1, t('lx_amounts'), ST.labB); put(w1, 6, 4, t('lx_amountsV'), ST.lab);
    put(w1, 3, 8, t('lx_ts'), ST.labB);
    if (Tst < 0) put(w1, 3, 10, t('lx_tsNone'), ST.lab);
    else { put(w1, 3, 10, monthDate(P, Math.min(Tst, H - 1)), ST.monInL); put(w1, 3, 11, Tst >= H - 1 ? t('lx_tsAll') : t('lx_tsN', { n: Tst + 1 }), ST.lab); }
    put(w1, 4, 8, t('lx_scen'), ST.labB); put(w1, 4, 10, ctx.scenName || P.scenario, ST.lab);
    var cr = ctx.created || new Date(), pad = function (x) { return (x < 10 ? '0' : '') + x; };
    put(w1, 5, 8, t('lx_created'), ST.labB);
    put(w1, 5, 10, de ? pad(cr.getDate()) + '.' + pad(cr.getMonth() + 1) + '.' + cr.getFullYear() + ', ' + pad(cr.getHours()) + ':' + pad(cr.getMinutes()) : cr.getFullYear() + '-' + pad(cr.getMonth() + 1) + '-' + pad(cr.getDate()) + ' ' + pad(cr.getHours()) + ':' + pad(cr.getMinutes()), ST.lab);
    put(w1, 6, 8, t('lx_noteL'), ST.labB); put(w1, 6, 10, t('lx_advice'), ST.labB);
    var heads = [t('lx_hNo'), t('lx_hType'), t('lx_hBank'), t('lx_hTerm'), t('lx_hPlaced'), t('lx_hMat'), t('lx_hAmt'), t('lx_hRate'), t('lx_hConv'), t('lx_hInt'), t('lx_hPay'), t('lx_hYld'), t('lx_hInPlan'), t('lx_hNote')];
    heads.forEach(function (h, i) { put(w1, TR.head, i + 1, h, i >= 3 && i <= 12 && i !== 8 ? ST.headR : ST.head); });
    w1.getRow(TR.head).height = 30;
    var convWord = { simple: t('lx_cvSimple'), annual: t('lx_cvAnnual'), compound: t('lx_cvCompound') };
    var blockRow = []; // first row of each tranche block on the schedule sheets
    (function () { var r = R.tr0; rows.forEach(function (o) { blockRow.push(r); r += 1 + o.lines.length; }); })();
    var lineRow = function (i, key) { var k = rows[i].lines.indexOf(key); return k < 0 ? -1 : blockRow[i] + 1 + k; };
    rows.forEach(function (o, i) {
      var tr = o.tr, r = trRow(i), D = 'D' + r, G = 'G' + r, Hh = 'H' + r, stub = '(' + D + '-12*INT((' + D + '-1)/12))', yrs = 'INT((' + D + '-1)/12)';
      put(w1, r, 1, i + 1, ST.int); put(w1, r, 2, typeOf(tr), ST.lab); put(w1, r, 3, bankOf(tr), ST.lab);
      put(w1, r, 4, tr.term, ST.intIn); put(w1, r, 5, monthDate(P, tr.start), ST.monIn);
      fx(w1, r, 6, 'EDATE(E' + r + ',' + D + ')', monthDate(P, tr.due), ST.mon);
      put(w1, r, 7, tr.amount, ST.amtIn); put(w1, r, 8, tr.rate, ST.pctIn); put(w1, r, 9, convWord[o.conv], ST.lab);
      if (o.conv === 'annual') { fx(w1, r, 10, G + '*' + Hh + '*(' + yrs + '+' + stub + '/12)', o.c.interest, ST.amt); fx(w1, r, 11, G + '*(1+' + Hh + '*' + stub + '/12)', o.c.payout, ST.amt); }
      else if (o.conv === 'compound') { fx(w1, r, 10, G + '*((1+' + Hh + ')^' + yrs + '*(1+' + Hh + '*' + stub + '/12)-1)', o.c.interest, ST.amt); fx(w1, r, 11, G + '+J' + r, o.c.payout, ST.amt); }
      else { fx(w1, r, 10, G + '*' + Hh + '*' + D + '/12', o.c.interest, ST.amt); fx(w1, r, 11, G + '+J' + r, o.c.payout, ST.amt); }
      fx(w1, r, 12, 'IF(AND(' + G + '>0,' + D + '>0),(1+J' + r + '/' + G + ')^(12/' + D + ')-1,0)', o.c.yld, ST.pct2);
      var ci = lineRow(i, 'cap'), inPlan = o.sum.int + o.sum.cap;
      fx(w1, r, 13, rM + '!$D$' + lineRow(i, 'int') + (ci > 0 ? '+' + rM + '!$D$' + ci : ''), inPlan, ST.amtL);
      var notes = [];
      if (tr.kind === 'existing') notes.push(t('lx_nEx'));
      if (tr.pinned) notes.push(t('lx_nPin'));
      if (tr.due > H - 1) notes.push(t('lx_nAfter'));
      if (notes.length) put(w1, r, 14, notes.join(' · '), ST.note);
    });
    var rLast = trRow(Math.max(1, nT) - 1), rSum = rLast + 1, rAvg = rSum + 1;
    if (!nT) put(w1, TR.row0, 3, t('lx_noTr'), ST.labI);
    var rg = function (c) { return c + TR.row0 + ':' + c + rLast; }, sumOf = function (key) { return rows.reduce(function (a, o) { return a + (key === 'inPlan' ? o.sum.int + o.sum.cap : key === 'amt' ? o.tr.amount : o.c[key]); }, 0); };
    for (var c = 1; c <= 14; c++) put(w1, rSum, c, null, ST.totE);
    put(w1, rSum, 2, t('lx_sum'), ST.totLab);
    fx(w1, rSum, 7, 'SUM(' + rg('G') + ')', sumOf('amt'), ST.totAmt); fx(w1, rSum, 10, 'SUM(' + rg('J') + ')', sumOf('interest'), ST.totAmt);
    fx(w1, rSum, 11, 'SUM(' + rg('K') + ')', sumOf('payout'), ST.totAmt); fx(w1, rSum, 13, 'SUM(' + rg('M') + ')', sumOf('inPlan'), ST.totAmt);
    var amtSum = sumOf('amt'), wavg = function (f) { return amtSum ? rows.reduce(function (a, o) { return a + f(o) * o.tr.amount; }, 0) / amtSum : 0; };
    put(w1, rAvg, 2, t('lx_wavg'), ST.avgLab);
    var wf = function (col) { return 'IF(G' + rSum + '=0,0,SUMPRODUCT(' + rg(col) + ',' + rg('G') + ')/G' + rSum + ')'; };
    fx(w1, rAvg, 4, wf('D'), wavg(function (o) { return o.tr.term; }), ST.avg); fx(w1, rAvg, 8, wf('H'), wavg(function (o) { return o.tr.rate; }), ST.avgPct);
    fx(w1, rAvg, 12, wf('L'), wavg(function (o) { return o.c.yld; }), ST.avgPct);
    if (nT) cf(w1, 'F' + TR.row0 + ':F' + rLast, [{ type: 'expression', formulae: ['AND(ISNUMBER($F' + TR.row0 + '),$F' + TR.row0 + '>$D$5)'], style: cfFill(COL.late, COL.lateInk) }]);
    // legend
    var L0 = rAvg + 2;
    put(w1, L0, 1, t('lx_legend'), ST.labB);
    var leg = [[ST.legB, 1234.56, 'lx_lgBlue'], [ST.legK, 1234.56, 'lx_lgBlack'], [ST.legG, 1234.56, 'lx_lgGreen'], [ST.legK, -1234.56, 'lx_lgFmt']];
    leg.forEach(function (l, i) { put(w1, L0 + 1 + i, 2, l[1], l[0]); put(w1, L0 + 1 + i, 3, t(l[2]), ST.lab); });
    var rb = L0 + 1 + leg.length, sw = [['f1', 'lx_b1'], ['f2', 'lx_b2'], ['f3', 'lx_b3'], ['f4', 'lx_b4'], ['ex', 'lx_tyEx']];
    sw.forEach(function (s, i) { put(w1, rb, 2 + i, t(s[1]), st({ size: 9, color: { argb: s[0] === 'f1' ? 'FF0B1A2E' : 'FFFFFFFF' } }, null, { fill: fill(COL[s[0]]), alignment: { horizontal: 'center' } })); });
    put(w1, rb, 7, t('lx_lgBars'), ST.lab);
    var marks = [[COL.due, 'FFFFFFFF', 'lx_lgDueS', 'lx_lgDue'], [COL.ts, 'FFFFFFFF', 'lx_lgTsS', 'lx_lgTs'], [COL.eop, 'FF1D1D1F', 'lx_lgEopS', 'lx_lgEop'], [COL.bad, COL.badInk, 'lx_lgChkS', 'lx_lgChk'], [COL.late, COL.lateInk, 'lx_lgLateS', 'lx_lgLate']];
    marks.forEach(function (m2, i) { var r = rb + 1 + i; put(w1, r, 2, t(m2[2]), st({ size: 9, color: { argb: m2[1] }, bold: m2[0] === COL.ts }, null, { fill: fill(m2[0]), alignment: { horizontal: 'center' } })); put(w1, r, 3, t(m2[3]), ST.lab); });
    var txt = ['lx_lgSimple', 'lx_lgAnnual', 'lx_lgCompound', 'lx_lgEx', 'lx_lgSigns', 'lx_lgTiming', 'lx_lgTotal', 'lx_lgGroups'];
    var rt = rb + 1 + marks.length;
    txt.forEach(function (k, i) { put(w1, rt + i, 3, t(k), ST.lab); });
    put(w1, rt + txt.length + 1, 1, t('lx_advice'), ST.labB);
    page(w1, 1, TR.head + ':' + TR.head);

    // ===== 2 and 3: the schedules, one month or one calendar year per column =====
    function scheduleSheet(name, yearly) {
      var nC = yearly ? nY : M, cL = colL(C0 + nC - 1), first = colL(C0);
      var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 4, ySplit: R.head2, topLeftCell: 'E' + R.tot, activeCell: first + R.bop }] });
      ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false }; // the button of a group sits on the tranche's first row
      if (nT) ws.properties.outlineLevelRow = 1;
      [4.5, 31, 9, 13.5, 9, 13, 7, 13, 9.5, 9.5].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      for (var j = 0; j < nC; j++) ws.getColumn(C0 + j).width = yearly ? 13.5 : 12.5;
      put(ws, R.title, 1, t(yearly ? 'lx_titleY' : 'lx_titleM'), ST.title); ws.getRow(R.title).height = 22;
      put(ws, R.sub, 1, t('lx_sub'), ST.sub);
      if (yearly) { put(ws, R.mark, 2, t('lx_schedEnd'), ST.labB); fx(ws, R.mark, 3, rM + '!$' + colL(C0 + M - 1) + '$' + R.head, schedEnd, st({ color: INK.green }, MON, { alignment: { horizontal: 'right' } })); }
      else {
        put(ws, R.mark, 2, t('lx_ts'), ST.labB);
        var tsVal = Tst < 0 ? t('lx_tsNone') : monthDate(P, Math.min(Tst, H - 1));
        fx(ws, R.mark, 3, rT + '!$J$3', tsVal, st({ color: INK.green }, MON, { alignment: { horizontal: 'right' } }));
      }
      // header rows
      [t('lx_hNo'), t('lx_hLine'), t('lx_hRate'), t('lx_hTot'), t('lx_hType'), t('lx_hAmt'), t('lx_hTerm'), t('lx_hConv'), t('lx_hPlaced'), t('lx_hMat')].forEach(function (h, i) { put(ws, R.head, i + 1, h, i === 2 || i === 3 || i === 5 || i === 6 || i === 8 || i === 9 ? ST.headR : ST.head); });
      ws.getRow(R.head).height = 28;
      put(ws, R.head2, 2, t(yearly ? 'lx_inPlan' : 'lx_year'), ST.labI);
      for (j = 0; j < nC; j++) {
        var cc = C0 + j, X = colL(cc), W = colL(cc - 1);
        if (yearly) {
          if (j === 0) fx(ws, R.head, cc, 'YEAR(' + rM + '!' + first + R.head + ')', years[0].y, ST.headYL); else fx(ws, R.head, cc, W + R.head + '+1', years[j].y, ST.headY);
          fx(ws, R.head2, cc, 'COUNTIF(' + rM + '!$' + first + '$' + R.head2 + ':$' + colL(C0 + M - 1) + '$' + R.head2 + ',' + X + '$' + R.head + ')', years[j].b - years[j].a + 1, ST.yrL);
        } else {
          if (j === 0) fx(ws, R.head, cc, rT + '!$D$3', monthDate(P, 0), ST.headML); else fx(ws, R.head, cc, 'EDATE(' + W + R.head + ',1)', monthDate(P, j), ST.headM);
          fx(ws, R.head2, cc, 'YEAR(' + X + R.head + ')', P.months[j].y, ST.yr);
        }
      }
      // tranche area (rows R.tr0 … tEnd) and the totals above it
      var tEnd = nT ? blockRow[nT - 1] + rows[nT - 1].lines.length : R.tr0;
      var bRg = '$B$' + R.tr0 + ':$B$' + tEnd, cRg = function (X) { return X + '$' + R.tr0 + ':' + X + '$' + tEnd; };
      var mRow = function (r) { return rM + '!$' + first + '$' + r + ':$' + colL(C0 + M - 1) + '$' + r; }; // a monthly row, for SUMIF
      var mHead = rM + '!$' + first + '$' + R.head2 + ':$' + colL(C0 + M - 1) + '$' + R.head2;
      var T2 = yearly ? S.ty : S.tot, LAB = { bop: t('lx_lBop'), pl: t('lx_lPl'), cap: t('lx_lCap'), rep: t('lx_lRep'), eop: t('lx_lEop'), int: t('lx_lInt') };
      put(ws, R.tot, 2, t('lx_all'), ST.sec); put(ws, R.tot, 1, null, ST.sec); put(ws, R.tot, 3, null, ST.sec); put(ws, R.tot, 4, null, ST.sec);
      ['bop', 'pl', 'cap', 'rep', 'eop', 'int'].forEach(function (key) { put(ws, R[key], 2, LAB[key], key === 'eop' ? ST.labInB : ST.labIn); });
      put(ws, R.chk, 2, t('lx_chk'), ST.labI);
      if (yearly) put(ws, R.chk2, 2, t('lx_chk2'), ST.labI);
      put(ws, R.cash, 2, t('lx_cash'), ST.sec); put(ws, R.cash, 1, null, ST.sec); put(ws, R.cash, 3, null, ST.sec); put(ws, R.cash, 4, null, ST.sec);
      put(ws, R.cPl, 2, t('lx_cPl'), ST.labIn); put(ws, R.cRep, 2, t('lx_cRep'), ST.labIn); put(ws, R.cInt, 2, t('lx_cInt'), ST.labIn); put(ws, R.cNet, 2, t('lx_cNet'), ST.totLab);
      put(ws, R.trs, 2, t('lx_byTr'), ST.sec); put(ws, R.trs, 1, null, ST.sec); put(ws, R.trs, 3, null, ST.sec); put(ws, R.trs, 4, null, ST.sec);
      if (!nT) put(ws, R.tr0, 2, t('lx_noTr'), ST.labI);
      var sumRow = function (r) { return 'SUM(' + first + r + ':' + cL + r + ')'; };
      var sum = function (arr) { return arr.reduce(function (a, x) { return a + x; }, 0); };
      // total column D
      fx(ws, R.bop, 4, first + R.bop, T2.bop[0], ST.amt);
      ['pl', 'cap', 'rep', 'int'].forEach(function (key) { fx(ws, R[key], 4, sumRow(R[key]), sum(T2[key]), ST.amt); });
      fx(ws, R.eop, 4, cL + R.eop, T2.eop[nC - 1], ST.amtE);
      fx(ws, R.chk, 4, 'ROUND(SUMIF(' + bRg + ',$B$' + R.eop + ',' + cRg('D') + ')-D' + R.eop + ',2)', round2(rows.reduce(function (a, o) { return a + (yearly ? o.y.sum.eop : o.sum.eop); }, 0) - T2.eop[nC - 1]), ST.chk);
      if (yearly) fx(ws, R.chk2, 4, 'ROUND(D' + R.eop + '-' + rM + '!$D$' + R.eop + ',2)', round2(T2.eop[nC - 1] - S.tot.eop[M - 1]), ST.chkL);
      fx(ws, R.cPl, 4, sumRow(R.cPl), sum(T2.cPl), ST.amt); fx(ws, R.cRep, 4, sumRow(R.cRep), sum(T2.cRep), ST.amt); fx(ws, R.cInt, 4, sumRow(R.cInt), sum(T2.cInt), ST.amt);
      fx(ws, R.cNet, 4, 'D' + R.cPl + '+D' + R.cRep + '+D' + R.cInt, sum(T2.cPl) + sum(T2.cRep) + sum(T2.cInt), ST.amtT);
      for (j = 0; j < nC; j++) {
        cc = C0 + j; X = colL(cc); W = colL(cc - 1);
        if (j === 0) fx(ws, R.bop, cc, 'SUMIF(' + bRg + ',$B' + R.bop + ',' + cRg(X) + ')', T2.bop[j], ST.amt);
        else fx(ws, R.bop, cc, W + R.eop, T2.bop[j], ST.amt);
        ['pl', 'cap', 'rep', 'int'].forEach(function (key) { fx(ws, R[key], cc, 'SUMIF(' + bRg + ',$B' + R[key] + ',' + cRg(X) + ')', T2[key][j], ST.amt); });
        fx(ws, R.eop, cc, X + R.bop + '+' + X + R.pl + '+' + X + R.cap + '+' + X + R.rep, T2.eop[j], ST.amtE);
        fx(ws, R.chk, cc, 'ROUND(SUMIF(' + bRg + ',$B$' + R.eop + ',' + cRg(X) + ')-' + X + R.eop + ',2)', T2.chk[j], ST.chk);
        if (yearly) fx(ws, R.chk2, cc, 'ROUND(' + X + R.eop + '-INDEX(' + mRow(R.eop) + ',1,COUNTIF(' + mHead + ',"<="&' + X + '$' + R.head + ')),2)', T2.chk2[j], ST.chkL);
        fx(ws, R.cPl, cc, '-' + X + R.pl, T2.cPl[j], ST.amt); fx(ws, R.cRep, cc, '-' + X + R.rep, T2.cRep[j], ST.amt); fx(ws, R.cInt, cc, X + R.int, T2.cInt[j], ST.amt);
        fx(ws, R.cNet, cc, X + R.cPl + '+' + X + R.cRep + '+' + X + R.cInt, T2.cNet[j], ST.amtT);
      }
      [1, 3, 5, 6, 7, 8, 9, 10].forEach(function (c) { put(ws, R.cNet, c, null, ST.totE); put(ws, R.eop, c, null, ST.eopE); }); // the rules run through
      // one block per tranche: its terms on the first row (linked to the tranche sheet), then the lines of the roll-forward
      rows.forEach(function (o, i) {
        var h = blockRow[i], tr = o.tr, ex = tr.kind === 'existing', orow = trRow(i), A = function (c) { return '$' + c + '$' + h; };
        var V = yearly ? o.y : o, lk = function (c) { return rT + '!$' + c + '$' + orow; };
        put(ws, h, 1, i + 1, ST.blkN); put(ws, h, 2, nameOf(tr), ST.blk);
        fx(ws, h, 3, lk('H'), tr.rate, ST.blkPct); put(ws, h, 4, null, ST.blkE); fx(ws, h, 5, lk('B'), typeOf(tr), ST.blkTxt);
        fx(ws, h, 6, lk('G'), tr.amount, ST.blkAmt); fx(ws, h, 7, lk('D'), tr.term, ST.blkInt); fx(ws, h, 8, lk('I'), convWord[o.conv], ST.blkTxt);
        fx(ws, h, 9, lk('E'), monthDate(P, tr.start), ST.blkMon); fx(ws, h, 10, lk('F'), monthDate(P, tr.due), ST.blkMon);
        var lr = {}; o.lines.forEach(function (key, k) { lr[key] = h + 1 + k; });
        o.lines.forEach(function (key) {
          var r = lr[key], isE = key === 'eop';
          put(ws, r, 2, LAB[key], isE ? ST.labInB : ST.labIn); group(ws.getRow(r));
          var tot = key === 'bop' ? first + r : key === 'eop' ? cL + r : sumRow(r), totV = (yearly ? o.y.sum : o.sum)[key];
          fx(ws, r, 4, tot, totV, isE ? ST.amtE : ST.amt);
        });
        var stub = '(' + A('G') + '-12*INT((' + A('G') + '-1)/12))';
        for (var j2 = 0; j2 < nC; j2++) {
          var c2 = C0 + j2, X2 = colL(c2), W2 = colL(c2 - 1), d = X2 + '$' + R.head, b = X2 + lr.bop;
          var ann = 'AND(MONTH(' + d + ')=MONTH(' + A('I') + '),' + d + '>' + A('I') + ',' + d + '<' + A('J') + ')';
          o.lines.forEach(function (key) {
            var r = lr[key], val = V[key][j2], fm = null, style = key === 'eop' ? ST.amtE : ST.amt;
            if (yearly) {
              if (key === 'bop') { if (j2 === 0) { fm = rM + '!' + first + r; style = ST.amtL; } else fm = W2 + lr.eop; }
              else if (key === 'eop') fm = o.lines.filter(function (x) { return x !== 'eop' && x !== 'int'; }).map(function (x) { return X2 + lr[x]; }).join('+');
              else { fm = 'SUMIF(' + mHead + ',' + X2 + '$' + R.head + ',' + mRow(r) + ')'; style = ST.amtL; }
            } else if (key === 'bop') fm = j2 === 0 ? (ex ? A('F') : null) : W2 + lr.eop;
            else if (key === 'pl') fm = 'IF(' + d + '=' + A('I') + ',' + A('F') + ',0)';
            else if (key === 'cap') fm = 'IF(' + ann + ',' + b + '*' + A('C') + ',0)';
            else if (key === 'rep') fm = 'IF(' + d + '=' + A('J') + ',-' + b + ',0)';
            else if (key === 'eop') fm = o.lines.filter(function (x) { return x !== 'eop' && x !== 'int'; }).map(function (x) { return X2 + lr[x]; }).join('+');
            else if (key === 'int') {
              if (o.conv === 'annual') fm = 'IF(' + d + '=' + A('J') + ',' + b + '*' + A('C') + '*' + stub + '/12,IF(' + ann + ',' + b + '*' + A('C') + ',0))';
              else if (o.conv === 'compound') fm = 'IF(' + d + '=' + A('J') + ',' + b + '*' + A('C') + '*' + stub + '/12,0)';
              else fm = 'IF(' + d + '=' + A('J') + ',' + b + '*' + A('C') + '*' + A('G') + '/12,0)';
            }
            if (fm) fx(ws, r, c2, fm, val, style); else put(ws, r, c2, val, style);
          });
        }
      });
      // conditional formats (all within this sheet): the ladder bars, the maturity, the closing balances, the checks, outflows
      if (nT) {
        var r0 = R.tr0, J = '$J' + r0, I = '$I' + r0, E = '$E' + r0, G = '$G' + r0, d0 = first + '$' + R.head, isHead = 'ISNUMBER(' + J + ')';
        var due = yearly ? 'AND(' + isHead + ',YEAR(' + J + ')=' + d0 + ',' + J + '<=$C$' + R.mark + ')' : 'AND(' + isHead + ',' + d0 + '=' + J + ')';
        var live = yearly ? I + '<' + J + ',' + I + '<=DATE(' + d0 + ',12,1),' + J + '>DATE(' + d0 + ',1,1),OR(YEAR(' + J + ')<>' + d0 + ',' + J + '>$C$' + R.mark + ')' : d0 + '>=' + I + ',' + d0 + '<' + J;
        var exT = q(t('lx_tyEx')), bar = function (cond) { return 'AND(' + isHead + ',' + live + ',' + cond + ')'; };
        cf(ws, first + r0 + ':' + cL + tEnd, [
          { type: 'expression', formulae: [due], style: cfFill(COL.due) },
          { type: 'expression', formulae: [bar(E + '=' + exT)], style: cfFill(COL.ex) },
          { type: 'expression', formulae: [bar(E + '<>' + exT + ',' + G + '<=6')], style: cfFill(COL.f1) },
          { type: 'expression', formulae: [bar(E + '<>' + exT + ',' + G + '>6,' + G + '<=12')], style: cfFill(COL.f2) },
          { type: 'expression', formulae: [bar(E + '<>' + exT + ',' + G + '>12,' + G + '<=36')], style: cfFill(COL.f3) },
          { type: 'expression', formulae: [bar(E + '<>' + exT + ',' + G + '>36')], style: cfFill(COL.f4) }
        ]);
      }
      cf(ws, first + R.bop + ':' + cL + tEnd, [{ type: 'expression', formulae: ['AND($B' + R.bop + '=' + q(LAB.eop) + ',ABS(' + first + R.bop + ')>=0.005)'], style: cfFill(COL.eop) }]);
      cf(ws, 'D' + R.chk + ':' + cL + (yearly ? R.chk2 : R.chk), [{ type: 'expression', formulae: ['ABS(D' + R.chk + ')>=0.005'], style: cfFill(COL.bad, COL.badInk, true) }]);
      cf(ws, 'D' + R.cPl + ':' + cL + R.cNet, [{ type: 'cellIs', operator: 'lessThan', formulae: ['-0.004'], style: { font: { color: { argb: COL.neg } } } }]);
      if (!yearly) cf(ws, first + R.head + ':' + cL + R.head, [{ type: 'expression', formulae: [first + '$' + R.head + '=$C$' + R.mark], style: cfFill(COL.ts, 'FFFFFFFF', true) }]);
      page(ws, Math.ceil(nC / 12), R.head + ':' + R.head2, 'A:D');
      return ws;
    }
    scheduleSheet(NM, false);
    scheduleSheet(NY, true);
    var data = await wb.xlsx.writeBuffer();
    return { data: data, schedule: S, rows: { R: R, blockRow: blockRow, C0: C0 }, sheets: { tranches: NT, monthly: NM, yearly: NY } };
  }

  LP.ladderXlsx = { build: build, schedule: schedule, order: order, contract: contract, ROWS: R, C0: C0 };
})(typeof self !== 'undefined' ? self : globalThis);

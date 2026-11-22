/* ===== ladder-xlsx.js: the deposit ladder as a small spreadsheet (one row per tranche, then every tranche as a roll-forward) =====
   Three sheets: the tranches with their terms, a monthly and a yearly schedule. In the schedules each tranche is a block
   opening balance + placement + capitalised interest + repayment = closing balance, plus the interest it pays out; the totals
   and the cash view of the liquid accounts sit on top. Written with ExcelJS alone, for Excel and Google Sheets alike: classic
   functions, formulas and conditional formats within one sheet where Google Sheets needs it, rules of the "formula" and
   "cell value" kinds only, no post-processing of the file. It is dressed as a financial model: navy bands for titles and
   column heads, blue bars for sections, pale yellow for inputs, lines above totals (lookTranches and lookSchedule in build).
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
  // (T* is amber so that it shows on the navy column heads; "after the plan" is not yellow, which marks an input)
  var COL = { f1: 'FF86B6EF', f2: 'FF3987E5', f3: 'FF1C5CAB', f4: 'FF0D366B', ex: 'FF6250D6', due: 'FF1BAF7A', eop: 'FFEAF1FB', ts: 'FFFFC000', tsInk: 'FF000000', bad: 'FFF8D7DA', badInk: 'FF9C0006', neg: 'FFC00000', late: 'FFFCE4D6', lateInk: 'FF843C0C' };
  // the look of the sheets: the bands, fills and lines that build() puts on once the content is written
  var LOOK = { navy: 'FF1F3864', section: 'FF2F5597', tint: 'FFD9E1F2', panel: 'FFF2F2F2', input: 'FFFFF2CC' };

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

    // styles: complete objects, shared by many cells and never changed afterwards. A style says what a cell holds: font,
    // number format, alignment. Font colours: blue = a value from the plan, black = a formula, green = a link to another
    // sheet, white = text on a band. The fills, lines and row heights are put on afterwards (lookTranches, lookSchedule).
    var AMT = '#,##0.00_);(#,##0.00);"–"_)', PCT = '0.00##%', PCT2 = '0.00%', INT = '0', MON = 'mmm yyyy', AVG = '0.0';
    var F = function (o) { var f = { name: 'Calibri', size: 10 }; for (var k in o) f[k] = o[k]; return f; };
    var INK = { blue: { argb: 'FF0000FF' }, green: { argb: 'FF006100' }, grey: { argb: 'FF6E6E73' }, dim: { argb: 'FF595959' }, faint: { argb: 'FF7F7F7F' }, text: { argb: 'FF262626' }, navy: { argb: LOOK.navy }, white: { argb: 'FFFFFFFF' } };
    var fill = function (argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb }, bgColor: { argb: argb } }; };
    function st(font, numFmt, extra) { // extra: alignment (added to "vertically centred") and, for a legend swatch, its fill
      var s = { font: F(font || {}), alignment: { vertical: 'middle' } }, k;
      if (numFmt) s.numFmt = numFmt;
      if (extra) for (k in extra) { if (k === 'alignment') for (var a in extra.alignment) s.alignment[a] = extra.alignment[a]; else s[k] = extra[k]; }
      return s;
    }
    var RIGHT = { alignment: { horizontal: 'right' } }, LEFT = { alignment: { horizontal: 'left' } }, CENTER = { alignment: { horizontal: 'center' } }, IN = { alignment: { indent: 1 } };
    var ST = {
      title: st({ bold: true, size: 14, color: INK.white }), sub: st({ italic: true, color: INK.dim }), lab: st(), labB: st({ bold: true }), labI: st({ italic: true, color: INK.grey }),
      labP: st({ bold: true, color: INK.navy }), info: st({ italic: true, color: INK.dim }), stat: st({ bold: true, color: INK.green }), // the info panel: label, remark, how far the plan is covered
      labIn: st({}, null, IN), labInB: st({ bold: true }, null, IN),
      head: st({ bold: true, color: INK.white }, null, { alignment: { wrapText: true } }), headR: st({ bold: true, color: INK.white }, null, { alignment: { wrapText: true, horizontal: 'right' } }),
      headM: st({ bold: true, color: INK.white }, MON, { alignment: { wrapText: true, horizontal: 'right' } }), headY: st({ bold: true, color: INK.white }, INT, { alignment: { wrapText: true, horizontal: 'right' } }),
      yr: st({ size: 9, color: INK.navy }, INT, RIGHT), yrL: st({ size: 9, color: INK.green }, INT, RIGHT),
      sec: st({ bold: true, color: INK.white }),
      blk: st({ bold: true, color: INK.navy }), blkN: st({ bold: true, color: INK.navy }, INT, CENTER),
      blkPct: st({ color: INK.green }, PCT), blkAmt: st({ color: INK.green }, AMT), blkInt: st({ color: INK.green }, INT), blkTxt: st({ color: INK.green }), blkMon: st({ color: INK.green }, MON, RIGHT),
      amt: st({}, AMT), amtIn: st({ color: INK.blue }, AMT), amtL: st({ color: INK.green }, AMT), amtB: st({ bold: true }, AMT),
      chk: st({ italic: true, color: INK.grey }, AMT), chkL: st({ italic: true, color: INK.green }, AMT), link: st({ color: INK.green }, MON, RIGHT),
      pctIn: st({ color: INK.blue }, PCT), pct2: st({}, PCT2), no: st({ color: INK.dim }, INT, CENTER), intIn: st({ color: INK.blue }, INT),
      mon: st({}, MON, RIGHT), monIn: st({ color: INK.blue }, MON, RIGHT), monL: st({}, MON, LEFT), monInL: st({ color: INK.blue }, MON, LEFT), intInL: st({ color: INK.blue }, INT, LEFT),
      sumLab: st({ bold: true, color: INK.navy }), avg: st({ italic: true }, AVG), avgPct: st({ italic: true }, PCT), avgLab: st({ italic: true, color: INK.dim }),
      note: st({ italic: true, color: INK.grey }), leg: st({ color: INK.text }), disc: st({ italic: true, color: INK.faint }),
      legB: st({ color: INK.blue }, AMT), legK: st({}, AMT), legG: st({ color: INK.green }, AMT)
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

    // ---------- the look: bands, fills, lines and row heights, put on a sheet once its content is written ----------
    // Navy band: the title and the column heads. Blue bar: a section. Light blue: the first row of a tranche and the grand
    // total. Grey: the info panel and the Total column. Pale yellow: an input. A thin line above a subtotal, thin above
    // and double below a final total, a dotted line above a check row, grey dividers beside the Total column and after
    // the terms of the tranche. The rows come from the layout of this plan (L), never from fixed numbers.
    // A style object is shared by many cells, so dress() gives a cell a copy of its style: the fill replaced, the border
    // sides merged one by one, so that a line above keeps the divider beside it. One style and one patch give one copy.
    var ln = function (style, argb) { return { style: style, color: { argb: argb } }; };
    var LN = { head: ln('thin', 'FF9AA5A8'), panel: ln('thin', 'FF8EA9DB'), box: ln('thin', 'FFBFBFBF'), row: ln('thin', 'FFD9D9D9'), soft: ln('thin', 'FFD9DDE0'), sub: ln('thin', 'FFA6A6A6'),
      ink: ln('thin', 'FF000000'), ink2: ln('double', 'FF000000'), old: ln('thin', 'FF9AA5A8'), old2: ln('double', 'FF9AA5A8'), dots: ln('hair', 'FFBFBFBF'), div: ln('thin', 'FF808080'), years: ln('medium', LOOK.navy) };
    var PT = {
      band: { fill: fill(LOOK.navy) }, head: { fill: fill(LOOK.navy), border: { bottom: LN.head } }, years: { fill: fill(LOOK.tint), border: { bottom: LN.years } },
      section: { fill: fill(LOOK.section) }, panel: { fill: fill(LOOK.panel) }, panelTop: { border: { top: LN.panel } }, panelEnd: { border: { bottom: LN.panel } },
      input: { fill: fill(LOOK.input) }, inputBox: { fill: fill(LOOK.input), border: { top: LN.box, bottom: LN.box, left: LN.box, right: LN.box } },
      rowLine: { border: { bottom: LN.row } }, grand: { fill: fill(LOOK.tint), border: { top: LN.ink, bottom: LN.ink2 } }, discTop: { border: { top: LN.box } },
      subLab: { border: { top: LN.soft } }, subTot: { border: { top: LN.ink } }, subTr: { border: { top: LN.sub } }, check: { border: { top: LN.dots } },
      totLab: { border: { top: LN.old, bottom: LN.old2 } }, total: { border: { top: LN.ink, bottom: LN.ink2 } },
      tranche: { fill: fill(LOOK.tint), border: { top: LN.panel } }, trancheTop: { border: { top: LN.panel } }, divLR: { border: { left: LN.div, right: LN.div } }, divR: { border: { right: LN.div } }
    };
    var dressed = new Map(), BLANK = {}; // style → (patch → the copy); BLANK stands for every cell that has no style yet
    function dress(ws, r, c1, c2, patch) {
      for (var c = c1; c <= c2; c++) {
        var cell = ws.getCell(r, c), base = cell.style || BLANK, key = Object.keys(base).length ? base : BLANK, k;
        var copies = dressed.get(key); if (!copies) dressed.set(key, copies = new Map());
        var s = copies.get(patch);
        if (!s) {
          s = {}; for (k in base) s[k] = base[k];
          if (patch.fill) s.fill = patch.fill;
          if (patch.border) { s.border = {}; for (k in base.border) s.border[k] = base.border[k]; for (k in patch.border) s.border[k] = patch.border[k]; }
          copies.set(patch, s);
        }
        cell.style = s;
      }
    }
    // the tranche sheet. L: head (column heads), row0…rowN (the tranches; rowN < row0 when there are none), sum (grand total),
    // legend (its bar; the sample of an input is in the row below), last (the closing note), inputs ([row, column] in the panel)
    function lookTranches(ws, L) {
      var n = 14, r;
      dress(ws, 1, 1, n, PT.band); ws.getRow(1).height = 25.5; ws.getRow(2).height = 16.5;
      for (r = 3; r <= 6; r++) dress(ws, r, 1, n, PT.panel);
      dress(ws, 3, 1, n, PT.panelTop); dress(ws, 6, 1, n, PT.panelEnd);
      L.inputs.forEach(function (a) { dress(ws, a[0], a[1], a[1], PT.inputBox); });
      dress(ws, L.head, 1, n, PT.head); ws.getRow(L.head).height = 27;
      for (r = L.row0; r <= L.rowN; r++) {
        if (r < L.rowN) dress(ws, r, 1, n, PT.rowLine);
        [4, 5, 7, 8].forEach(function (c) { dress(ws, r, c, c, PT.input); }); // term, placement month, principal, rate
      }
      dress(ws, L.sum, 1, n, PT.grand);
      dress(ws, L.legend, 1, n, PT.section); ws.getRow(L.legend).height = 18;
      dress(ws, L.legend + 1, 2, 2, PT.inputBox);
      dress(ws, L.last, 1, n, PT.discTop);
    }
    // a schedule sheet. L: last (the last period column), end (the last row), checks (the check rows),
    // blocks ([{ head, eop }]: the first row of each tranche and its closing balance)
    function lookSchedule(ws, L) {
      var n = L.last, r;
      dress(ws, R.title, 1, n, PT.band); ws.getRow(R.title).height = 25.5; ws.getRow(R.sub).height = 16.5;
      dress(ws, R.mark, 1, n, PT.panel);
      dress(ws, R.head, 1, n, PT.head); ws.getRow(R.head).height = 25.5;
      dress(ws, R.head2, 1, n, PT.years);
      for (r = R.tot; r <= L.end; r++) dress(ws, r, 4, 4, PT.panel); // the Total column first: section bars and tranche rows run across it
      [R.tot, R.cash, R.trs].forEach(function (rr) { dress(ws, rr, 1, n, PT.section); ws.getRow(rr).height = 18; });
      dress(ws, R.eop, 1, 3, PT.subLab); dress(ws, R.eop, 4, n, PT.subTot);
      L.checks.forEach(function (rr) { dress(ws, rr, 2, n, PT.check); });
      dress(ws, R.cNet, 1, 3, PT.totLab); dress(ws, R.cNet, 4, n, PT.total);
      L.blocks.forEach(function (b) {
        dress(ws, b.head, 1, C0 - 1, PT.tranche); dress(ws, b.head, C0, n, PT.trancheTop); // no fill from the first period on: the ladder bars are drawn there
        dress(ws, b.eop, 2, 2, PT.subLab); dress(ws, b.eop, 4, n, PT.subTr);
      });
      for (r = R.head; r <= L.end; r++) { dress(ws, r, 4, 4, PT.divLR); dress(ws, r, C0 - 1, C0 - 1, PT.divR); }
    }

    var typeOf = function (tr) { return tr.kind === 'existing' ? t('lx_tyEx') : tr.pinned ? t('lx_tyPin') : t('lx_tyNew'); };
    var bankOf = function (tr) { var b = tr.bank || (tr.k >= 0 && P.products[tr.k] ? P.products[tr.k].id : ''); return tr.kind === 'existing' ? (tr.label && tr.label !== b ? (b ? b + ' · ' : '') + tr.label : b || t('lx_tyEx')) : b; };
    var nameOf = function (tr) { return tr.kind === 'existing' ? bankOf(tr) : bankOf(tr) + ' · ' + t('lx_dep', { n: tr.term }); }; // the type stands beside it
    var trRow = function (i) { return TR.row0 + i; };
    var Tst = sim.Tstar, lastMonth = monthDate(P, H - 1), schedEnd = monthDate(P, M - 1);

    // ===== 1 Tranches: the building blocks with their terms =====
    var w1 = wb.addWorksheet(NT, { views: [{ state: 'frozen', ySplit: TR.head, topLeftCell: 'A' + TR.row0, activeCell: 'A' + TR.row0 }] });
    [5, 10, 26, 10, 10, 10, 13, 9, 14, 13, 14, 10, 14, 44].forEach(function (w, i) { w1.getColumn(i + 1).width = w; });
    put(w1, 1, 1, t('lx_title'), ST.title);
    put(w1, 2, 1, t('lx_what', { m: NM, y: NY }), ST.sub);
    var panelIn = [[3, 4], [4, 4]]; // the inputs of the info panel: plan start, horizon and, when a month is covered, T*
    put(w1, 3, 1, t('lx_start'), ST.labP); put(w1, 3, 4, monthDate(P, 0), ST.monInL);
    put(w1, 4, 1, t('lx_horizon'), ST.labP); put(w1, 4, 4, H, ST.intInL); put(w1, 4, 5, t('lx_months'), ST.lab);
    put(w1, 5, 1, t('lx_last'), ST.labP); fx(w1, 5, 4, 'EDATE(D3,D4-1)', lastMonth, ST.monL);
    put(w1, 6, 1, t('lx_amounts'), ST.labP); put(w1, 6, 4, t('lx_amountsV'), ST.info);
    put(w1, 3, 8, t('lx_ts'), ST.labP);
    if (Tst < 0) put(w1, 3, 10, t('lx_tsNone'), ST.labB);
    else { put(w1, 3, 10, monthDate(P, Math.min(Tst, H - 1)), ST.monInL); panelIn.push([3, 10]); put(w1, 3, 11, Tst >= H - 1 ? t('lx_tsAll') : t('lx_tsN', { n: Tst + 1 }), ST.stat); }
    put(w1, 4, 8, t('lx_scen'), ST.labP); put(w1, 4, 10, ctx.scenName || P.scenario, ST.lab);
    var cr = ctx.created || new Date(), pad = function (x) { return (x < 10 ? '0' : '') + x; };
    put(w1, 5, 8, t('lx_created'), ST.labP);
    put(w1, 5, 10, de ? pad(cr.getDate()) + '.' + pad(cr.getMonth() + 1) + '.' + cr.getFullYear() + ', ' + pad(cr.getHours()) + ':' + pad(cr.getMinutes()) : cr.getFullYear() + '-' + pad(cr.getMonth() + 1) + '-' + pad(cr.getDate()) + ' ' + pad(cr.getHours()) + ':' + pad(cr.getMinutes()), ST.lab);
    put(w1, 6, 8, t('lx_noteL'), ST.labP); put(w1, 6, 10, t('lx_advice'), ST.info);
    var heads = [t('lx_hNo'), t('lx_hType'), t('lx_hBank'), t('lx_hTerm'), t('lx_hPlaced'), t('lx_hMat'), t('lx_hAmt'), t('lx_hRate'), t('lx_hConv'), t('lx_hInt'), t('lx_hPay'), t('lx_hYld'), t('lx_hInPlan'), t('lx_hNote')];
    heads.forEach(function (h, i) { put(w1, TR.head, i + 1, h, i >= 3 && i <= 12 && i !== 8 ? ST.headR : ST.head); });
    var convWord = { simple: t('lx_cvSimple'), annual: t('lx_cvAnnual'), compound: t('lx_cvCompound') };
    var blockRow = []; // first row of each tranche block on the schedule sheets
    (function () { var r = R.tr0; rows.forEach(function (o) { blockRow.push(r); r += 1 + o.lines.length; }); })();
    var lineRow = function (i, key) { var k = rows[i].lines.indexOf(key); return k < 0 ? -1 : blockRow[i] + 1 + k; };
    rows.forEach(function (o, i) {
      var tr = o.tr, r = trRow(i), D = 'D' + r, G = 'G' + r, Hh = 'H' + r, stub = '(' + D + '-12*INT((' + D + '-1)/12))', yrs = 'INT((' + D + '-1)/12)';
      put(w1, r, 1, i + 1, ST.no); put(w1, r, 2, typeOf(tr), ST.lab); put(w1, r, 3, bankOf(tr), ST.lab);
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
    put(w1, rSum, 2, t('lx_sum'), ST.sumLab);
    fx(w1, rSum, 7, 'SUM(' + rg('G') + ')', sumOf('amt'), ST.amtB); fx(w1, rSum, 10, 'SUM(' + rg('J') + ')', sumOf('interest'), ST.amtB);
    fx(w1, rSum, 11, 'SUM(' + rg('K') + ')', sumOf('payout'), ST.amtB); fx(w1, rSum, 13, 'SUM(' + rg('M') + ')', sumOf('inPlan'), ST.amtB);
    var amtSum = sumOf('amt'), wavg = function (f) { return amtSum ? rows.reduce(function (a, o) { return a + f(o) * o.tr.amount; }, 0) / amtSum : 0; };
    put(w1, rAvg, 2, t('lx_wavg'), ST.avgLab);
    var wf = function (col) { return 'IF(G' + rSum + '=0,0,SUMPRODUCT(' + rg(col) + ',' + rg('G') + ')/G' + rSum + ')'; };
    fx(w1, rAvg, 4, wf('D'), wavg(function (o) { return o.tr.term; }), ST.avg); fx(w1, rAvg, 8, wf('H'), wavg(function (o) { return o.tr.rate; }), ST.avgPct);
    fx(w1, rAvg, 12, wf('L'), wavg(function (o) { return o.c.yld; }), ST.avgPct);
    if (nT) cf(w1, 'F' + TR.row0 + ':F' + rLast, [{ type: 'expression', formulae: ['AND(ISNUMBER($F' + TR.row0 + '),$F' + TR.row0 + '>$D$5)'], style: cfFill(COL.late, COL.lateInk) }]);
    // legend
    var L0 = rAvg + 2;
    put(w1, L0, 1, t('lx_legend'), ST.sec);
    var leg = [[ST.legB, 1234.56, 'lx_lgBlue'], [ST.legK, 1234.56, 'lx_lgBlack'], [ST.legG, 1234.56, 'lx_lgGreen'], [ST.legK, -1234.56, 'lx_lgFmt']];
    leg.forEach(function (l, i) { put(w1, L0 + 1 + i, 2, l[1], l[0]); put(w1, L0 + 1 + i, 3, t(l[2]), ST.leg); });
    var rb = L0 + 1 + leg.length, sw = [['f1', 'lx_b1'], ['f2', 'lx_b2'], ['f3', 'lx_b3'], ['f4', 'lx_b4'], ['ex', 'lx_tyEx']];
    sw.forEach(function (s, i) { put(w1, rb, 2 + i, t(s[1]), st({ size: 9, color: { argb: s[0] === 'f1' ? 'FF0B1A2E' : 'FFFFFFFF' } }, null, { fill: fill(COL[s[0]]), alignment: { horizontal: 'center' } })); });
    put(w1, rb, 7, t('lx_lgBars'), ST.leg);
    var marks = [[COL.due, 'FFFFFFFF', 'lx_lgDueS', 'lx_lgDue'], [COL.ts, COL.tsInk, 'lx_lgTsS', 'lx_lgTs'], [COL.eop, 'FF1D1D1F', 'lx_lgEopS', 'lx_lgEop'], [COL.bad, COL.badInk, 'lx_lgChkS', 'lx_lgChk'], [COL.late, COL.lateInk, 'lx_lgLateS', 'lx_lgLate']];
    marks.forEach(function (m2, i) { var r = rb + 1 + i; put(w1, r, 2, t(m2[2]), st({ size: 9, color: { argb: m2[1] }, bold: m2[0] === COL.ts }, null, { fill: fill(m2[0]), alignment: { horizontal: 'center' } })); put(w1, r, 3, t(m2[3]), ST.leg); });
    var txt = ['lx_lgSimple', 'lx_lgAnnual', 'lx_lgCompound', 'lx_lgEx', 'lx_lgSigns', 'lx_lgTiming', 'lx_lgTotal', 'lx_lgGroups'];
    var rt = rb + 1 + marks.length;
    txt.forEach(function (k, i) { put(w1, rt + i, 3, t(k), ST.leg); });
    put(w1, rt + txt.length + 1, 1, t('lx_advice'), ST.disc);
    page(w1, 1, TR.head + ':' + TR.head);
    lookTranches(w1, { head: TR.head, row0: TR.row0, rowN: nT ? rLast : TR.row0 - 1, sum: rSum, legend: L0, last: rt + txt.length + 1, inputs: panelIn });

    // ===== 2 and 3: the schedules, one month or one calendar year per column =====
    function scheduleSheet(name, yearly) {
      var nC = yearly ? nY : M, cL = colL(C0 + nC - 1), first = colL(C0);
      var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 4, ySplit: R.head2, topLeftCell: 'E' + R.tot, activeCell: first + R.bop }] });
      ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false }; // the button of a group sits on the tranche's first row
      if (nT) ws.properties.outlineLevelRow = 1;
      [4.5, 31, 9, 13.5, 9, 13, 7, 13, 9.5, 9.5].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
      for (var j = 0; j < nC; j++) ws.getColumn(C0 + j).width = yearly ? 13.5 : 12.5;
      put(ws, R.title, 1, t(yearly ? 'lx_titleY' : 'lx_titleM'), ST.title);
      put(ws, R.sub, 1, t('lx_sub'), ST.sub);
      if (yearly) { put(ws, R.mark, 2, t('lx_schedEnd'), ST.labP); fx(ws, R.mark, 3, rM + '!$' + colL(C0 + M - 1) + '$' + R.head, schedEnd, ST.link); }
      else {
        put(ws, R.mark, 2, t('lx_ts'), ST.labP);
        var tsVal = Tst < 0 ? t('lx_tsNone') : monthDate(P, Math.min(Tst, H - 1));
        fx(ws, R.mark, 3, rT + '!$J$3', tsVal, ST.link);
      }
      // header rows
      [t('lx_hNo'), t('lx_hLine'), t('lx_hRate'), t('lx_hTot'), t('lx_hType'), t('lx_hAmt'), t('lx_hTerm'), t('lx_hConv'), t('lx_hPlaced'), t('lx_hMat')].forEach(function (h, i) { put(ws, R.head, i + 1, h, i === 2 || i === 3 || i === 5 || i === 6 || i === 8 || i === 9 ? ST.headR : ST.head); });
      put(ws, R.head2, 2, t(yearly ? 'lx_inPlan' : 'lx_year'), ST.labI);
      for (j = 0; j < nC; j++) {
        var cc = C0 + j, X = colL(cc), W = colL(cc - 1);
        if (yearly) {
          if (j === 0) fx(ws, R.head, cc, 'YEAR(' + rM + '!' + first + R.head + ')', years[0].y, ST.headY); else fx(ws, R.head, cc, W + R.head + '+1', years[j].y, ST.headY);
          fx(ws, R.head2, cc, 'COUNTIF(' + rM + '!$' + first + '$' + R.head2 + ':$' + colL(C0 + M - 1) + '$' + R.head2 + ',' + X + '$' + R.head + ')', years[j].b - years[j].a + 1, ST.yrL);
        } else {
          if (j === 0) fx(ws, R.head, cc, rT + '!$D$3', monthDate(P, 0), ST.headM); else fx(ws, R.head, cc, 'EDATE(' + W + R.head + ',1)', monthDate(P, j), ST.headM);
          fx(ws, R.head2, cc, 'YEAR(' + X + R.head + ')', P.months[j].y, ST.yr);
        }
      }
      // tranche area (rows R.tr0 … tEnd) and the totals above it
      var tEnd = nT ? blockRow[nT - 1] + rows[nT - 1].lines.length : R.tr0;
      var bRg = '$B$' + R.tr0 + ':$B$' + tEnd, cRg = function (X) { return X + '$' + R.tr0 + ':' + X + '$' + tEnd; };
      var mRow = function (r) { return rM + '!$' + first + '$' + r + ':$' + colL(C0 + M - 1) + '$' + r; }; // a monthly row, for SUMIF
      var mHead = rM + '!$' + first + '$' + R.head2 + ':$' + colL(C0 + M - 1) + '$' + R.head2;
      var T2 = yearly ? S.ty : S.tot, LAB = { bop: t('lx_lBop'), pl: t('lx_lPl'), cap: t('lx_lCap'), rep: t('lx_lRep'), eop: t('lx_lEop'), int: t('lx_lInt') };
      put(ws, R.tot, 2, t('lx_all'), ST.sec);
      ['bop', 'pl', 'cap', 'rep', 'eop', 'int'].forEach(function (key) { put(ws, R[key], 2, LAB[key], key === 'eop' ? ST.labInB : ST.labIn); });
      put(ws, R.chk, 2, t('lx_chk'), ST.labI);
      if (yearly) put(ws, R.chk2, 2, t('lx_chk2'), ST.labI);
      put(ws, R.cash, 2, t('lx_cash'), ST.sec);
      put(ws, R.cPl, 2, t('lx_cPl'), ST.labIn); put(ws, R.cRep, 2, t('lx_cRep'), ST.labIn); put(ws, R.cInt, 2, t('lx_cInt'), ST.labIn); put(ws, R.cNet, 2, t('lx_cNet'), ST.labB);
      put(ws, R.trs, 2, t('lx_byTr'), ST.sec);
      if (!nT) put(ws, R.tr0, 2, t('lx_noTr'), ST.labI);
      var sumRow = function (r) { return 'SUM(' + first + r + ':' + cL + r + ')'; };
      var sum = function (arr) { return arr.reduce(function (a, x) { return a + x; }, 0); };
      // total column D
      fx(ws, R.bop, 4, first + R.bop, T2.bop[0], ST.amt);
      ['pl', 'cap', 'rep', 'int'].forEach(function (key) { fx(ws, R[key], 4, sumRow(R[key]), sum(T2[key]), ST.amt); });
      fx(ws, R.eop, 4, cL + R.eop, T2.eop[nC - 1], ST.amtB);
      fx(ws, R.chk, 4, 'ROUND(SUMIF(' + bRg + ',$B$' + R.eop + ',' + cRg('D') + ')-D' + R.eop + ',2)', round2(rows.reduce(function (a, o) { return a + (yearly ? o.y.sum.eop : o.sum.eop); }, 0) - T2.eop[nC - 1]), ST.chk);
      if (yearly) fx(ws, R.chk2, 4, 'ROUND(D' + R.eop + '-' + rM + '!$D$' + R.eop + ',2)', round2(T2.eop[nC - 1] - S.tot.eop[M - 1]), ST.chkL);
      fx(ws, R.cPl, 4, sumRow(R.cPl), sum(T2.cPl), ST.amt); fx(ws, R.cRep, 4, sumRow(R.cRep), sum(T2.cRep), ST.amt); fx(ws, R.cInt, 4, sumRow(R.cInt), sum(T2.cInt), ST.amt);
      fx(ws, R.cNet, 4, 'D' + R.cPl + '+D' + R.cRep + '+D' + R.cInt, sum(T2.cPl) + sum(T2.cRep) + sum(T2.cInt), ST.amtB);
      for (j = 0; j < nC; j++) {
        cc = C0 + j; X = colL(cc); W = colL(cc - 1);
        if (j === 0) fx(ws, R.bop, cc, 'SUMIF(' + bRg + ',$B' + R.bop + ',' + cRg(X) + ')', T2.bop[j], ST.amt);
        else fx(ws, R.bop, cc, W + R.eop, T2.bop[j], ST.amt);
        ['pl', 'cap', 'rep', 'int'].forEach(function (key) { fx(ws, R[key], cc, 'SUMIF(' + bRg + ',$B' + R[key] + ',' + cRg(X) + ')', T2[key][j], ST.amt); });
        fx(ws, R.eop, cc, X + R.bop + '+' + X + R.pl + '+' + X + R.cap + '+' + X + R.rep, T2.eop[j], ST.amtB);
        fx(ws, R.chk, cc, 'ROUND(SUMIF(' + bRg + ',$B$' + R.eop + ',' + cRg(X) + ')-' + X + R.eop + ',2)', T2.chk[j], ST.chk);
        if (yearly) fx(ws, R.chk2, cc, 'ROUND(' + X + R.eop + '-INDEX(' + mRow(R.eop) + ',1,COUNTIF(' + mHead + ',"<="&' + X + '$' + R.head + ')),2)', T2.chk2[j], ST.chkL);
        fx(ws, R.cPl, cc, '-' + X + R.pl, T2.cPl[j], ST.amt); fx(ws, R.cRep, cc, '-' + X + R.rep, T2.cRep[j], ST.amt); fx(ws, R.cInt, cc, X + R.int, T2.cInt[j], ST.amt);
        fx(ws, R.cNet, cc, X + R.cPl + '+' + X + R.cRep + '+' + X + R.cInt, T2.cNet[j], ST.amtB);
      }
      // one block per tranche: its terms on the first row (linked to the tranche sheet), then the lines of the roll-forward
      rows.forEach(function (o, i) {
        var h = blockRow[i], tr = o.tr, ex = tr.kind === 'existing', orow = trRow(i), A = function (c) { return '$' + c + '$' + h; };
        var V = yearly ? o.y : o, lk = function (c) { return rT + '!$' + c + '$' + orow; };
        put(ws, h, 1, i + 1, ST.blkN); put(ws, h, 2, nameOf(tr), ST.blk);
        fx(ws, h, 3, lk('H'), tr.rate, ST.blkPct); fx(ws, h, 5, lk('B'), typeOf(tr), ST.blkTxt);
        fx(ws, h, 6, lk('G'), tr.amount, ST.blkAmt); fx(ws, h, 7, lk('D'), tr.term, ST.blkInt); fx(ws, h, 8, lk('I'), convWord[o.conv], ST.blkTxt);
        fx(ws, h, 9, lk('E'), monthDate(P, tr.start), ST.blkMon); fx(ws, h, 10, lk('F'), monthDate(P, tr.due), ST.blkMon);
        var lr = {}; o.lines.forEach(function (key, k) { lr[key] = h + 1 + k; });
        o.lines.forEach(function (key) {
          var r = lr[key], isE = key === 'eop';
          put(ws, r, 2, LAB[key], isE ? ST.labInB : ST.labIn); group(ws.getRow(r));
          var tot = key === 'bop' ? first + r : key === 'eop' ? cL + r : sumRow(r), totV = (yearly ? o.y.sum : o.sum)[key];
          fx(ws, r, 4, tot, totV, isE ? ST.amtB : ST.amt);
        });
        var stub = '(' + A('G') + '-12*INT((' + A('G') + '-1)/12))';
        for (var j2 = 0; j2 < nC; j2++) {
          var c2 = C0 + j2, X2 = colL(c2), W2 = colL(c2 - 1), d = X2 + '$' + R.head, b = X2 + lr.bop;
          var ann = 'AND(MONTH(' + d + ')=MONTH(' + A('I') + '),' + d + '>' + A('I') + ',' + d + '<' + A('J') + ')';
          o.lines.forEach(function (key) {
            var r = lr[key], val = V[key][j2], fm = null, style = key === 'eop' ? ST.amtB : ST.amt;
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
      if (!yearly) cf(ws, first + R.head + ':' + cL + R.head, [{ type: 'expression', formulae: [first + '$' + R.head + '=$C$' + R.mark], style: cfFill(COL.ts, COL.tsInk, true) }]);
      page(ws, Math.ceil(nC / 12), R.head + ':' + R.head2, 'A:D');
      lookSchedule(ws, { last: C0 + nC - 1, end: tEnd, checks: yearly ? [R.chk, R.chk2] : [R.chk], blocks: rows.map(function (o, i) { return { head: blockRow[i], eop: lineRow(i, 'eop') }; }) });
      return ws;
    }
    scheduleSheet(NM, false);
    scheduleSheet(NY, true);
    var data = await wb.xlsx.writeBuffer();
    return { data: data, schedule: S, rows: { R: R, blockRow: blockRow, C0: C0 }, sheets: { tranches: NT, monthly: NM, yearly: NY } };
  }

  LP.ladderXlsx = { build: build, schedule: schedule, order: order, contract: contract, ROWS: R, C0: C0 };
})(typeof self !== 'undefined' ? self : globalThis);

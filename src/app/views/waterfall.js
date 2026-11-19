/* ===== views/waterfall.js: cash-flow waterfall, per year or per month ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  var charts = V.charts, chart = V.chart, axisStyle = V.axisStyle, tipStyle = V.tipStyle, compact = V.compact; // shared.js

  var wf = { mode: 'y', idx: 0 };

  function wfPeriods() {
    var v = A.view, P = v.P, out = [], i;
    if (wf.mode === 'm') { for (i = 0; i < P.H; i++) out.push({ label: A.monthLabel(P.months[i]), a: i, b: i }); return out; }
    var cur = null;
    for (i = 0; i < P.H; i++) { if (!cur || cur.y !== P.months[i].y) { cur = { y: P.months[i].y, label: String(P.months[i].y), a: i, b: i }; out.push(cur); } else cur.b = i; }
    return out;
  }
  // horizontal waterfall: one row per step, each bar floats from the running total before to the one after,
  // a hairline connects it to the next step, the signed amount sits at the end the money moves to
  function renderWf() {
    var v = A.view, sel = $('wfSel'), leg = $('wfLegend'); sel.innerHTML = ''; leg.innerHTML = ''; $('wfSum').textContent = '';
    $('wfYear').setAttribute('aria-pressed', wf.mode === 'y'); $('wfMonth').setAttribute('aria-pressed', wf.mode === 'm');
    [['wf_up', '--c-up'], ['wf_down', '--c-down'], ['wf_tot', '--c-tot']].forEach(function (c) { leg.appendChild(el('span', null, el('i', { style: 'background:' + A.css(c[1]) }), t(c[0]))); });
    if (!v) { var c0 = chart('chartWf'); if (c0) c0.clear(); return; }
    var ps = wfPeriods(); wf.idx = Math.max(0, Math.min(ps.length - 1, wf.idx));
    ps.forEach(function (p, i) { sel.appendChild(el('option', { value: i, text: p.label })); }); sel.value = String(wf.idx);
    var P = v.P, sim = v.sim, p = ps[wf.idx], open = p.a === 0 ? P.s0 : sim.s[p.a - 1], close = sim.s[p.b], i;
    var sums = { in: 0, int: 0, mat: 0, need: 0, out: 0, place: 0, tax: 0 }, any = { in: 0, int: 0, mat: 0, need: 0, out: 0, place: 0, tax: 0 };
    for (i = p.a; i <= p.b; i++) { sums.in += P.inflow[i]; sums.int += sim.intTG[i]; sums.mat += sim.trCash[i]; sums.need += P.need[i] + P.extraNeed[i]; sums.out += P.recOut[i] + P.oneOut[i]; sums.place += sim.place[i]; sums.tax += sim.tax[i]; }
    // a row stays whenever it carries money somewhere in the horizon, so switching periods never reshuffles the chart
    for (i = 0; i < P.H; i++) { any.in += Math.abs(P.inflow[i]); any.int += sim.intTG[i]; any.mat += sim.trCash[i]; any.need += P.need[i] + P.extraNeed[i]; any.out += P.recOut[i] + P.oneOut[i]; any.place += sim.place[i]; any.tax += sim.tax[i]; }
    var steps = [['wf_open', open, 'tot', 1], ['wf_in', sums.in, '', any.in], ['wf_int', sums.int, '', any.int], ['wf_mat', sums.mat, '', any.mat], ['wf_need', -sums.need, '', any.need],
      ['wf_out', -sums.out, '', any.out], ['wf_place', -sums.place, '', any.place], ['wf_tax', -sums.tax, '', any.tax], ['wf_close', close, 'tot', 1]].filter(function (s) { return s[3] > 0.005; });
    var rows = [], run = 0;
    steps.forEach(function (s) {
      var r = { name: t(s[0]), raw: s[1], zero: Math.abs(s[1]) <= 0.005 };
      if (s[2] === 'tot') { r.kind = 'tot'; r.lo = Math.min(0, s[1]); r.hi = Math.max(0, s[1]); run = s[1]; }
      else { r.kind = s[1] >= 0 ? 'up' : 'down'; r.lo = Math.min(run, run + s[1]); r.hi = Math.max(run, run + s[1]); run += s[1]; }
      r.end = run; rows.push(r);
    });
    var d = close - open;
    $('wfSum').innerHTML = '<strong>' + esc(p.label) + '</strong> · ' + esc(t('wf_open')) + ' ' + esc(A.eur(open)) + ' → ' + esc(t('wf_close')) + ' <strong>' + esc(A.eur(close)) + '</strong> · ' + esc(t('wf_change')) + ' ' + esc((d < 0 ? '−' : '+') + A.eur(Math.abs(d)));
    var host = $('chartWf'), hNew = Math.max(260, rows.length * 40 + 40) + 'px';
    if (host.style.height !== hNew) { host.style.height = hNew; if (charts.chartWf) charts.chartWf.resize(); }
    var ch = chart('chartWf'); if (!ch) return;
    var ax = axisStyle(), fam = A.css('--font'), ink = A.css('--ink'), ink2 = A.css('--ink-2'), lineC = A.css('--line-2'), col = { up: A.css('--c-up'), down: A.css('--c-down'), tot: A.css('--c-tot') };
    var narrow = window.matchMedia('(max-width: 720px)').matches, neg = rows.some(function (r) { return r.lo < 0; });
    function lab(r) { return r.kind === 'tot' ? A.eur(r.raw) : (r.zero ? '–' : (r.raw < 0 ? '−' : '+') + A.eur(Math.abs(r.raw))); }
    ch.setOption({
      animation: false, grid: { left: 8, right: 28, top: 4, bottom: 4, containLabel: true },
      yAxis: Object.assign({ type: 'category', inverse: true, data: rows.map(function (r) { return r.name; }) }, ax, { axisLine: { show: false }, splitLine: { show: false },
        axisLabel: Object.assign({}, ax.axisLabel, { color: ink2, fontSize: 12, lineHeight: 14 }, narrow ? { width: 84, overflow: 'break' } : { width: 150, overflow: 'truncate' }) }),
      xAxis: Object.assign({ type: 'value', boundaryGap: [neg ? '18%' : 0, '18%'], splitNumber: narrow ? 2 : 5 }, ax, { axisLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { formatter: compact, hideOverlap: true }) }),
      tooltip: Object.assign({ trigger: 'item', formatter: function (q) { var r = rows[q.dataIndex]; return '<strong>' + esc(lab(r)) + '</strong><br><span style="color:' + ink2 + '">' + esc(r.name) + ' · ' + esc(p.label) + '</span>'; } }, tipStyle()),
      series: [{
        type: 'custom', encode: { x: [0, 1], y: 2 }, data: rows.map(function (r, k) { return [r.lo, r.hi, k]; }),
        renderItem: function (params, api) {
          var k = params.dataIndex, r = rows[k], a = api.coord([r.lo, k]), b = api.coord([r.hi, k]), h = Math.min(22, Math.max(10, api.size([0, 1])[1] * 0.55)), left = r.kind === 'down';
          var kids = [{ type: 'rect', shape: { x: a[0], y: a[1] - h / 2, width: r.zero ? 0 : Math.max(2, b[0] - a[0]), height: h, r: 3 }, style: { fill: col[r.kind] } },
            { type: 'text', silent: true, x: left ? a[0] - 8 : b[0] + 8, y: a[1], style: { text: lab(r), fill: r.kind === 'tot' ? ink : ink2, font: (r.kind === 'tot' ? '600 ' : '') + '12px ' + fam, align: left ? 'right' : 'left', verticalAlign: 'middle' } }];
          if (k < rows.length - 1) { var c1 = api.coord([r.end, k]), c2 = api.coord([r.end, k + 1]); kids.push({ type: 'line', silent: true, shape: { x1: c1[0], y1: c1[1] + h / 2, x2: c2[0], y2: c2[1] - h / 2 }, style: { stroke: lineC, lineWidth: 1 } }); }
          return { type: 'group', children: kids };
        }
      }]
    }, true);
  }

  A.renderWf = renderWf; A.wf = wf;

  V.renderWf = renderWf;
})();

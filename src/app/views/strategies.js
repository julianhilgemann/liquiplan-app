/* ===== views/strategies.js: strategy comparison (the optimised ladder against "all in overnight money" and the naive rate maximiser) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  var mLabel = V.mLabel, chart = V.chart, axisStyle = V.axisStyle, tipStyle = V.tipStyle, compact = V.compact, sw = V.sw, toggleLegend = V.toggleLegend; // shared.js

  var strat = { mode: 'liq' }, stratOff = {};
  var STRATS = [['opt', 'leg_opt', '--c-opt', 'str_opt_d'], ['tg', 'leg_tg', '--c-tg', 'str_tg_d'], ['nv', 'leg_naive', '--c-naive', 'str_nv_d']];
  function renderStrat() {
    var v = A.view, box = $('strats'); box.innerHTML = '';
    $('strLiq').setAttribute('aria-pressed', strat.mode === 'liq'); $('strTot').setAttribute('aria-pressed', strat.mode === 'tot');
    $('strLiq').onclick = function () { strat.mode = 'liq'; renderStrat(); }; $('strTot').onclick = function () { strat.mode = 'tot'; renderStrat(); };
    var items = STRATS.map(function (s) { return { key: s[0], name: t(s[1]), color: A.css(s[2]), mark: 'line' }; });
    if (strat.mode === 'liq') items.push({ key: 'floor', name: t('seriesFloor'), color: A.css('--ink'), mark: 'dash' });
    var legendOpt = toggleLegend($('strLegend'), 'chartStrat', items, stratOff);
    var P = v && v.P, sims = v ? { opt: v.sim, tg: v.base.tg, nv: v.base.naive } : null, desc = {};
    if (P) { // what the naive plan buys today: the highest rate above overnight money, longer term on ties (as in the simulator)
      var best = null; P.products.forEach(function (pr) { if (!best || pr.rate[0] > best.rate[0] + 1e-12 || (Math.abs(pr.rate[0] - best.rate[0]) <= 1e-12 && pr.term > best.term)) best = pr; });
      desc.opt = t('str_opt_d'); desc.tg = t('str_tg_d', { r: A.pct(P.rTG[0] * 100) });
      desc.nv = t('str_nv_d', { n: P.naiveReserve, p: best && best.rate[0] > P.rTG[0] ? (best.bank ? best.bank + ', ' : '') + best.term + ' ' + t('months_short') + ', ' + A.pct(best.rate[0] * 100) : t('str_nv_none') });
    }
    STRATS.forEach(function (s) {
      var sm = sims && sims[s[0]], T = sm ? sm.Tstar : null, H = P ? P.H : 0;
      var big = !sm ? '–' : T < 0 ? t('k_months', { n: 0 }) : (T >= H - 1 ? '≥ ' : '') + t('k_months', { n: T + 1 });
      var reach = !sm ? '' : T < 0 ? t('k_none') : t('str_reach') + ' ' + (T >= H - 1 ? '≥ ' : '') + mLabel(P, T, true);
      box.appendChild(el('div', { class: 'strat' },
        el('div', { class: 'strat-h' }, el('i', { style: 'border-top-color:' + A.css(s[2]) }), el('span', { text: t(s[1]) })),
        el('div', { class: 'strat-big', text: big }),
        el('div', { class: 'strat-sub', text: reach || ' ' }),
        el('div', { class: 'strat-k' }, el('span', { text: t('str_int') }), el('strong', { text: sm ? A.eur(sm.interestToT) : '–' })),
        el('p', { class: 'strat-d', text: desc[s[0]] || t(s[3], { r: '…', n: A.state.naiveReserve, p: '…' }) })));
    });
    var ch = chart('chartStrat'); if (!ch) return;
    if (!v) { ch.clear(); return; }
    var H = P.H, tot = strat.mode === 'tot', ex0 = 0, x = [t('start')], data = { opt: [], tg: [], nv: [] }, floor = [null], i;
    P.existing.forEach(function (e) { ex0 += e.amount; });
    STRATS.forEach(function (s) { data[s[0]].push(Math.round(tot ? P.s0 + ex0 : P.s0)); });
    for (i = 0; i < H; i++) {
      x.push(A.monthLabel(P.months[i])); floor.push(P.floor[i]);
      STRATS.forEach(function (s) { var sm = sims[s[0]]; data[s[0]].push(Math.round(tot ? sm.s[i] + sm.locked[i] : sm.s[i])); });
    }
    var surface = A.css('--surface'), ax = axisStyle(), last = 0;
    STRATS.forEach(function (s) { last = Math.max(last, sims[s[0]].Tstar); });
    var zoomEnd = last >= 0 && last < H - 13 ? last + 13 : H, top = 0, low = 0;
    STRATS.forEach(function (s) { data[s[0]].forEach(function (y) { if (y > top) top = y; if (y < low) low = y; }); });
    var step = top > 50000 ? 10000 : 5000, yMin = low < -0.5 * top ? -Math.ceil(0.5 * top / step) * step : null;
    var series = STRATS.map(function (s, si) {
      var c = A.css(s[2]), fs = sims[s[0]].firstShort;
      return { name: t(s[1]), type: 'line', symbol: 'none', data: data[s[0]], z: 4 - si, lineStyle: { width: 2, color: c, cap: 'round', join: 'round' }, itemStyle: { color: c }, emphasis: { disabled: true },
        markPoint: fs >= 0 ? { silent: true, symbol: 'circle', symbolSize: 10, itemStyle: { color: c, borderColor: surface, borderWidth: 2 }, label: { show: false }, data: [{ coord: [fs + 1, data[s[0]][fs + 1]] }] } : undefined };
    });
    if (!tot) series.push({ name: t('seriesFloor'), type: 'line', symbol: 'none', data: floor, step: 'end', lineStyle: { width: 2, type: 'dashed', color: A.css('--ink') }, itemStyle: { color: A.css('--ink') }, z: 5 });
    ch.setOption({
      animation: false, legend: legendOpt(), grid: { left: 6, right: 28, top: 14, bottom: 52, containLabel: true },
      xAxis: Object.assign({ type: 'category', boundaryGap: false, data: x }, ax, { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', min: yMin, name: t(tot ? 'str_axis_tot' : 'str_axis_liq'), nameLocation: 'end', nameTextStyle: { color: A.css('--muted'), fontSize: 11, align: 'left' } }, ax, { axisLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { formatter: compact }) }),
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: A.css('--muted') } }, formatter: function (ps) {
        var idx = ps[0].dataIndex, tt = idx - 1, html = '<strong>' + esc(x[idx]) + '</strong>';
        STRATS.forEach(function (s) { if (stratOff[s[0]]) return; var sm = sims[s[0]], bad = tt >= 0 && !sm.ok[tt];
          html += '<br>' + sw(A.css(s[2])) + '<span style="color:' + A.css('--ink-2') + '">' + esc(t(s[1])) + (bad ? ' · ' + esc(t('shortfall')) : '') + '</span><strong style="float:right;margin-left:16px">' + A.eur(data[s[0]][idx]) + '</strong>'; });
        if (!tot && tt >= 0 && !stratOff.floor) html += '<br><span style="color:' + A.css('--ink-2') + '">' + esc(t('seriesFloor')) + ': ' + A.eur(P.floor[tt]) + '</span>';
        return html;
      } }, tipStyle()),
      dataZoom: [{ type: 'inside', startValue: 0, endValue: zoomEnd }, { type: 'slider', startValue: 0, endValue: zoomEnd, height: 20, bottom: 8, borderColor: A.css('--line-2'), textStyle: { color: A.css('--muted') }, brushSelect: false, fillerColor: 'rgba(120,120,128,0.16)', dataBackground: { lineStyle: { color: A.css('--line-2') }, areaStyle: { color: A.css('--line') } } }],
      series: series
    }, true);
  }

  V.renderStrat = renderStrat;
})();

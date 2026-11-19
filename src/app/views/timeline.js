/* ===== views/timeline.js: main chart (month-end balances as stacked areas) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, $ = A.$, t = A.t, esc = A.esc;
  var mLabel = V.mLabel, bucketOf = V.bucketOf, SERIES = V.SERIES, chart = V.chart, axisStyle = V.axisStyle, tipStyle = V.tipStyle, compact = V.compact, sw = V.sw, toggleLegend = V.toggleLegend; // shared.js

  var mainOff = {};
  function renderMain() {
    var v = A.view;
    var items = SERIES.map(function (s) { return { key: s[0], name: t(s[1]), color: A.css(s[2]), mark: 'area' }; });
    items.push({ key: 'floor', name: t('seriesFloor'), color: A.css('--ink'), mark: 'dash' });
    items.push({ key: 'short', name: t('shortfall'), color: A.css('--c-crit'), mark: 'area' });
    var legendOpt = toggleLegend($('chartLegend'), 'chartMain', items, mainOff);
    var ch = chart('chartMain'); if (!ch) return;
    if (!v) { ch.clear(); return; }
    var P = v.P, sim = v.sim, H = P.H, x = [t('start')], data = { giro: [P.giro0], tg: [P.tg0], f1: [0], f2: [0], f3: [0], f4: [0], ex: [0] }, floor = [null], i, k;
    P.existing.forEach(function (e) { data.ex[0] += e.amount; });
    for (i = 0; i < H; i++) {
      x.push(A.monthLabel(P.months[i]));
      var liq = sim.s[i];
      data.giro.push(liq > 0 ? Math.round(sim.giro[i]) : 0); data.tg.push(liq > 0 ? Math.round(Math.max(0, sim.tg[i])) : 0);
      var b = { f1: 0, f2: 0, f3: 0, f4: 0 };
      for (k = 0; k < P.products.length; k++) b[bucketOf(P.products[k].term)] += sim.lockedByK[k][i];
      data.f1.push(Math.round(b.f1)); data.f2.push(Math.round(b.f2)); data.f3.push(Math.round(b.f3)); data.f4.push(Math.round(b.f4));
      data.ex.push(Math.round(sim.lockedExisting[i])); floor.push(P.floor[i]);
    }
    var areas = [], a0 = -1;
    for (i = 0; i <= H; i++) { var bad = i < H && !sim.ok[i]; if (bad && a0 < 0) a0 = i; if (!bad && a0 >= 0) { areas.push([{ xAxis: a0 }, { xAxis: i }]); a0 = -1; } }
    var surface = A.css('--surface'), ax = axisStyle(), zoomEnd = sim.Tstar >= 0 && sim.Tstar < H - 13 ? sim.Tstar + 13 : H;
    var series = SERIES.map(function (s) {
      return { name: t(s[1]), type: 'line', stack: 'all', symbol: 'none', data: data[s[0]], lineStyle: { width: 2, color: surface }, areaStyle: { color: A.css(s[2]), opacity: 0.92 }, itemStyle: { color: A.css(s[2]) }, emphasis: { disabled: true } };
    });
    var none = x.map(function () { return null; });
    series.push({ name: t('seriesFloor'), type: 'line', symbol: 'none', data: floor, step: 'end', lineStyle: { width: 2, type: 'dashed', color: A.css('--ink') }, itemStyle: { color: A.css('--ink') }, z: 5 });
    series.push({ name: t('shortfall'), type: 'line', symbol: 'none', data: none, itemStyle: { color: A.css('--c-crit') }, silent: true,
      markArea: { silent: true, itemStyle: { color: A.css('--c-crit'), opacity: 0.16 }, label: { show: areas.length > 0, position: 'insideTop', color: A.css('--crit'), fontSize: 11, formatter: t('shortfall') }, data: areas } });
    if (sim.Tstar >= 0 && sim.Tstar < H - 1) series.push({ name: '__tstar', type: 'line', symbol: 'none', data: none, silent: true, z: 6,
      markLine: { silent: true, symbol: 'none', lineStyle: { color: A.css('--accent'), width: 2, type: 'solid' }, label: { formatter: 'T* ' + mLabel(P, sim.Tstar), color: A.css('--accent'), fontWeight: 600, fontSize: 11, position: 'insideEndTop' }, data: [{ xAxis: sim.Tstar + 1 }] } });
    ch.setOption({
      animation: false, legend: legendOpt(), grid: { left: 6, right: 14, top: 14, bottom: 52, containLabel: true },
      xAxis: Object.assign({ type: 'category', boundaryGap: false, data: x }, ax, { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value' }, ax, { axisLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { formatter: compact }) }),
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: A.css('--muted') } }, formatter: function (ps) {
        var idx = ps[0].dataIndex, tt = idx - 1, html = '<strong>' + esc(x[idx]) + '</strong>', liqSum = 0, lockSum = 0;
        SERIES.forEach(function (s, si) { var val = data[s[0]][idx]; if (si < 2) liqSum += val; else lockSum += val; if (val && !mainOff[s[0]]) html += '<br>' + sw(A.css(s[2])) + '<span style="color:' + A.css('--ink-2') + '">' + esc(t(s[1])) + '</span><strong style="float:right;margin-left:16px">' + A.eur(val) + '</strong>'; });
        html += '<br><span style="color:' + A.css('--ink-2') + '">' + esc(t('g_liq')) + ': ' + A.eur(liqSum) + ' · ' + esc(t('g_lock')) + ': ' + A.eur(lockSum) + '</span>';
        if (tt >= 0) html += '<br><span style="color:' + A.css('--ink-2') + '">' + esc(t('seriesFloor')) + ': ' + A.eur(P.floor[tt]) + ' · ' + esc(t('need')) + ': ' + A.eur(P.need[tt] + P.extraNeed[tt]) + '</span>' + (sim.ok[tt] ? '' : '<br><strong style="color:' + A.css('--crit') + '">' + esc(t('shortfall')) + '</strong>');
        return html;
      } }, tipStyle()),
      dataZoom: [{ type: 'inside', startValue: 0, endValue: zoomEnd }, { type: 'slider', startValue: 0, endValue: zoomEnd, height: 20, bottom: 8, borderColor: A.css('--line-2'), textStyle: { color: A.css('--muted') }, brushSelect: false, fillerColor: 'rgba(120,140,150,0.18)', dataBackground: { lineStyle: { color: A.css('--line-2') }, areaStyle: { color: A.css('--line') } } }],
      series: series
    }, true);
  }

  V.renderMain = renderMain;
})();

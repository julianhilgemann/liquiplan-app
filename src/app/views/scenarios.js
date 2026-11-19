/* ===== views/scenarios.js: scenario comparison ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, C = LP.core, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  var chart = V.chart, axisStyle = V.axisStyle, tipStyle = V.tipStyle, sw = V.sw; // shared.js

  function renderScen() {
    var v = A.view, leg = $('scenLegend'), tb = $('scenTable'); leg.innerHTML = ''; tb.innerHTML = '';
    var cols = [['leg_opt', '--c-opt'], ['leg_tg', '--c-tg'], ['leg_naive', '--c-naive']];
    cols.forEach(function (c) { leg.appendChild(el('span', { html: '<i style="background:' + A.css(c[1]) + '"></i>' + esc(t(c[0])) })); });
    var ch = chart('chartScen');
    if (!v) { if (ch) ch.clear(); return; }
    var head = el('tr', null, [t('sc_col'), t('sc_T'), t('sc_Ttg'), t('sc_Tnv'), t('sc_int'), t('sc_gTG'), t('sc_gNv')].map(function (h, i) { return el('th', { class: i ? '' : 'l', text: h }); }));
    tb.appendChild(el('thead', null, head));
    var body = el('tbody'), names = [], d = [[], [], []], P = v.P;
    function mm(T, H) { return T < 0 ? '0 M' : (T >= H - 1 ? '≥ ' : '') + (T + 1) + ' M'; }
    C.scenariosFor(A.state).forEach(function (sc) {
      var r = v.scen[sc], name = t('sc_' + sc) + (sc === A.state.rateScenario ? ' ●' : '');
      names.push(t('sc_' + sc));
      if (!r) { body.appendChild(el('tr', null, el('td', { text: name }), el('td', { colspan: 6, class: 'l muted', text: t('sc_run') }))); d[0].push(null); d[1].push(null); d[2].push(null); return; }
      if (r.aborted) { body.appendChild(el('tr', null, el('td', { text: name }), el('td', { colspan: 6, class: 'l muted', text: t('sc_abort') }))); d[0].push(null); d[1].push(null); d[2].push(null); return; }
      if (r.fail) { body.appendChild(el('tr', null, el('td', { text: name }), el('td', { colspan: 6, class: 'l', text: t('sc_fail') }))); d[0].push(null); d[1].push(null); d[2].push(null); return; }
      d[0].push(r.T + 1); d[1].push(r.Ttg + 1); d[2].push(r.Tnv + 1);
      var sg = function (n) { return (n > 0 ? '+' : '') + n + ' M'; };
      body.appendChild(el('tr', null, el('td', { text: name }), el('td', { text: mm(r.T, r.H) + (r.T >= 0 ? ' (' + A.monthLabel(P.months[Math.min(P.H - 1, r.T)]) + ')' : '') }), el('td', { text: mm(r.Ttg, r.H) }), el('td', { text: mm(r.Tnv, r.H) }),
        el('td', { text: A.eur(r.interest) }), el('td', { text: sg(r.T - r.Ttg) }), el('td', { text: sg(r.T - r.Tnv) })));
    });
    tb.appendChild(body);
    if (!ch) return;
    var ax = axisStyle();
    ch.setOption({
      animation: false, grid: { left: 6, right: 44, top: 8, bottom: 24, containLabel: true },
      yAxis: Object.assign({ type: 'category', data: names, inverse: true }, ax, { splitLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { width: 120, overflow: 'break', color: A.css('--ink-2') }) }),
      xAxis: Object.assign({ type: 'value', name: t('monthsAxis'), nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: A.css('--muted'), fontSize: 11 } }, ax, { axisLine: { show: false } }),
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) { return '<strong>' + esc(ps[0].name) + '</strong>' + ps.map(function (q) { return '<br>' + sw(q.color) + esc(q.seriesName) + ': ' + (q.value == null ? '…' : q.value + ' M'); }).join(''); } }, tipStyle()),
      series: cols.map(function (c, i) { return { name: t(c[0]), type: 'bar', data: d[i], barMaxWidth: 14, barGap: '25%', itemStyle: { color: A.css(c[1]), borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: A.css('--ink-2'), fontSize: 11, formatter: function (q) { return q.value == null ? '' : q.value + ' M'; } } }; })
    }, true);
  }

  V.renderScen = renderScen;
})();

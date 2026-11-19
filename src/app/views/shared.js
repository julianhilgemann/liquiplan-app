/* ===== views/shared.js: what the result views share (chart instances and their styling, switchable legends, month labels) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views = {}, $ = A.$, el = A.el, t = A.t, esc = A.esc;

  var charts = {};
  A.view = null; A.busy = false;

  function hasData(s) { // something to plan with: money to start from, or money going in or out
    var money = +s.giro > 0 || +s.tg > 0 || (s.existing || []).some(function (x) { return +x.amount > 0; });
    var flows = +s.need > 0 || (s.streams || []).some(function (r) { return +r.amount !== 0; }) || (s.oneoffs || []).some(function (o) { return +o.amount !== 0; });
    return money || flows;
  }
  A.hasData = hasData;

  function mLabel(P, tt, long) { return tt < 0 ? t('start') : A.monthLabel(P.months[Math.min(P.H - 1, tt)], long); }
  function bucketOf(term) { return term <= 6 ? 'f1' : term <= 12 ? 'f2' : term <= 36 ? 'f3' : 'f4'; }
  var SERIES = [['giro', 'seriesGiro', '--c-giro'], ['tg', 'seriesTG', '--c-tg'], ['f1', 'seriesF1', '--c-f1'], ['f2', 'seriesF2', '--c-f2'], ['f3', 'seriesF3', '--c-f3'], ['f4', 'seriesF4', '--c-f4'], ['ex', 'seriesEx', '--c-ex']];
  function chart(id) {
    if (!window.echarts) { var n = $(id); if (!n.firstChild) n.appendChild(el('div', { class: 'empty', text: t('chartsOff') })); return null; }
    if (!charts[id]) charts[id] = window.echarts.init($(id), null, { renderer: 'canvas' });
    return charts[id];
  }
  function axisStyle() {
    return { axisLine: { lineStyle: { color: A.css('--axis') } }, axisTick: { show: false }, axisLabel: { color: A.css('--muted'), fontFamily: A.css('--font'), fontSize: 11 }, splitLine: { lineStyle: { color: A.css('--grid'), type: 'solid' } } };
  }
  function tipStyle() { return { transitionDuration: 0, padding: [8, 12], backgroundColor: A.css('--surface'), borderColor: A.css('--line'), textStyle: { color: A.css('--ink'), fontFamily: A.css('--font'), fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);max-width:300px;white-space:normal;' }; }
  function compact(v) { return Math.abs(v) >= 10000 ? A.n0(v / 1000) + ' Tsd.' : A.n0(v); }
  function sw(color) { return '<span style="display:inline-block;width:12px;height:0;border-top:2px solid ' + color + ';border-radius:1px;margin-right:7px;vertical-align:middle"></span>'; } // tooltip key: a short stroke, not a box

  function solverNote(res) { return res.solver && res.solver !== 'HiGHS' ? '<br>' + esc(t('k_fallback')) : ''; } // the LP solver decides which plan is found
  function gridNote(res) { var g = 0; (res.notes || []).forEach(function (n) { if (n.indexOf('grid_') === 0) g = +n.slice(5); }); return g > 1 ? '<br>' + esc(t('k_grid', { n: g })) : ''; }

  // ---------- legend whose entries switch series on and off (state survives re-renders) ----------
  // items: [{ key, name, color, mark: 'area' | 'line' | 'dash' }], off: { key: true } for hidden series
  function toggleLegend(box, chartId, items, off) {
    box.innerHTML = '';
    var btns = items.map(function (it) {
      var sw = el('i', { class: it.mark === 'area' ? '' : 'ln' + (it.mark === 'dash' ? ' dash' : ''), style: it.mark === 'area' ? 'background:' + it.color : 'border-top-color:' + it.color });
      var b = el('button', { type: 'button', class: 'lg', onclick: function () { off[it.key] = !off[it.key]; sync(); } }, sw, el('span', { text: it.name }));
      box.appendChild(b); return b;
    });
    var all = el('button', { type: 'button', class: 'lg-all', text: t('showAll'), onclick: function () { items.forEach(function (it) { off[it.key] = false; }); sync(); } });
    box.appendChild(all);
    function sync() {
      items.forEach(function (it, i) { btns[i].setAttribute('aria-pressed', off[it.key] ? 'false' : 'true'); });
      all.classList.toggle('hide', !items.some(function (it) { return off[it.key]; }));
      var ch = charts[chartId]; if (!ch) return;
      var sel = {}; items.forEach(function (it) { sel[it.name] = !off[it.key]; });
      ch.setOption({ legend: { selected: sel } }); // merge: keeps the zoom; the value axis rescales to the visible series
    }
    sync();
    return function () { var sel = {}; items.forEach(function (it) { sel[it.name] = !off[it.key]; }); return { show: false, data: items.map(function (it) { return it.name; }), selected: sel }; };
  }

  V.charts = charts; V.hasData = hasData; V.mLabel = mLabel; V.bucketOf = bucketOf; V.SERIES = SERIES; V.chart = chart; V.axisStyle = axisStyle;
  V.tipStyle = tipStyle; V.compact = compact; V.sw = sw; V.solverNote = solverNote; V.gridNote = gridNote; V.toggleLegend = toggleLegend;
})();

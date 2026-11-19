/* ===== views/render.js: static parts (texts, selects, section navigation) and renderAll, which draws every view from A.view ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, C = LP.core, $ = A.$, el = A.el, t = A.t;
  var charts = V.charts, hasData = V.hasData; // shared.js
  var renderKpis = V.renderKpis; // kpis.js
  var renderMain = V.renderMain; // timeline.js
  var renderStrat = V.renderStrat; // strategies.js
  var renderLadder = V.renderLadder; // ladder.js
  var renderWf = V.renderWf; // waterfall.js
  var renderActions = V.renderActions; // actions.js
  var renderScen = V.renderScen; // scenarios.js
  var renderGrid = V.renderGrid; // grid.js

  A.fillSelects = function () {
    var sp = $('selPreset'), ss = $('selScenario'); sp.innerHTML = ''; ss.innerHTML = '';
    LP.presetIds.forEach(function (id) { sp.appendChild(el('option', { value: id, text: t('p_' + id) })); });
    if (LP.presetIds.indexOf(A.state.presetId) < 0) sp.appendChild(el('option', { value: 'custom', text: t('p_custom') }));
    sp.value = LP.presetIds.indexOf(A.state.presetId) < 0 ? 'custom' : A.state.presetId;
    C.scenariosFor(A.state).forEach(function (sc) { ss.appendChild(el('option', { value: sc, text: t('sc_' + sc) })); });
    ss.value = A.state.rateScenario;
    var note = $('presetNote');
    if (LP.presetIds.indexOf(A.state.presetId) >= 0) { note.classList.remove('hide'); note.textContent = t('note_' + A.state.presetId) + (A.state.presetId === 'ruhestand' ? ' ' + t('examplesOnly') : ''); } else note.classList.add('hide');
  };
  A.renderStatic = function () {
    document.documentElement.lang = A.lang;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    $('langDe').setAttribute('aria-pressed', A.lang === 'de'); $('langEn').setAttribute('aria-pressed', A.lang === 'en');
    $('themeSwitch').setAttribute('aria-label', t('th_dark')); $('themeSwitch').title = t('th_dark');
    $('btnInputs').setAttribute('aria-label', t('inputs')); $('btnInputs').title = t('inputs');
    A.fillSelects();
    var nav = $('nav'); nav.innerHTML = '';
    ['chart', 'strat', 'ladder', 'waterfall', 'actions', 'scen', 'grid', 'method', 'test'].forEach(function (k) {
      nav.appendChild(el('button', { type: 'button', text: t('nav_' + k), onclick: function () { $('sec-' + k).scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } }));
    });
    $('methodBody').innerHTML = LP.i18n.method[A.lang].map(function (p) { return p.replace(/\{(\w+)\}/g, function (m, k) { return LP.i18n.gloss[k] ? A.term(k) : m; }); }).join('');
  };
  function renderAll() {
    var empty = !hasData(A.state), ready = !empty && !A.view && !A.lastError, gate = empty || ready;
    $('main').classList.toggle('is-empty', gate); $('emptyState').classList.toggle('hide', !gate); $('emptyState').classList.toggle('ready', ready);
    $('app').classList.toggle('blank', empty); $('btnOptimize').disabled = empty; // blank slate: only the (inactive) Optimise, language and theme stay up top
    if (ready) { var pid = A.state.presetId; $('readyText').textContent = (LP.presetIds.indexOf(pid) >= 0 ? t('e_readyEx', { p: t('p_' + pid) }) : t('e_readyOwn')) + ' ' + t('e_readyRun'); }
    $('btnOptimize').classList.toggle('due', !A.busy && !empty && (ready || !!A.stale)); // dot = a calculation is waiting: no result yet, or one older than the inputs
    renderKpis(); if (gate) { if (!A.busy) V.badgeDone(); return; } // the result views stay hidden until there is a result
    renderMain(); renderStrat(); renderLadder(); renderWf(); renderActions(); renderScen(); renderGrid();
  }
  A.renderAll = renderAll;
  A.resizeCharts = function () { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); if (A.view) renderLadder(); };

  V.renderAll = renderAll;
})();

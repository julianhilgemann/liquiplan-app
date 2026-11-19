/* ===== views/progress.js: progress dialog while optimising (the solver's real stages, a bar that keeps creeping between them, cancel) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, $ = A.$, el = A.el, t = A.t;

  var STEPS = ['load', 'search', 'wealthLP', 'tieLP', 'milp', 'tie', 'slack', 'verify', 'scen'];
  var SPAN = { load: [0, 4], search: [4, 12], wealthLP: [12, 18], tieLP: [18, 24], milp: [24, 42], tie: [42, 52], slack: [52, 58], verify: [58, 62], scen: [62, 100] };
  var RS = { open: false, visible: false, hidden: false, step: -1, T: null, phase: 'main', scenI: 0, scenN: 0, scenName: '', shown: 0, floor: 0, cap: 0, t0: 0, last: 0, raf: 0, token: 0, back: null, wasStale: false };
  function stillMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function stepText(k) {
    if (k === 'load') return t('r_load');
    if (k === 'search') return t('s_stage_search', { T: RS.T != null ? RS.T : '…' });
    if (k === 'verify') return t('r_verify');
    if (k === 'scen') return t('r_scen') + (RS.phase === 'scen' && RS.scenN ? ' (' + Math.min(RS.scenI + 1, RS.scenN) + '/' + RS.scenN + ')' : '');
    return t('s_stage_' + k);
  }
  function paintRun() {
    var list = $('runSteps'); list.innerHTML = '';
    STEPS.forEach(function (k, i) {
      if (k === 'scen' && RS.scenN === 0) return; // only when there are other rate scenarios to compare
      var st = i < RS.step ? 'done' : (i === RS.step ? 'now' : 'todo');
      list.appendChild(el('li', { class: st, 'aria-current': st === 'now' ? 'step' : null }, el('span', { class: 'ic', 'aria-hidden': 'true' }),
        el('span', { text: stepText(k) }), k === 'scen' ? el('span', { class: 'run-sub', text: st === 'now' && RS.scenName ? RS.scenName : '\u00a0' }) : null)); // the sub-line keeps its space
    });
    var cur = STEPS[Math.min(RS.step, STEPS.length - 1)];
    $('runTitle').textContent = t(RS.phase === 'scen' ? 'r_titleScen' : 'r_title');
    $('runStep').textContent = RS.step >= STEPS.length ? t('r_done') : stepText(cur);
  }
  function runStep(k, p) {
    var i = STEPS.indexOf(k); if (i < 0) return;
    if (p && p.T != null && k === 'search') RS.T = p.T + 1;
    if (i >= RS.step) {
      RS.step = i;
      var sp = SPAN[k];
      if (k === 'scen' && RS.scenN) { var w = (sp[1] - sp[0]) / RS.scenN; sp = [sp[0] + w * RS.scenI, sp[0] + w * (RS.scenI + 1)]; }
      RS.floor = Math.max(RS.floor, sp[0]); RS.cap = sp[1] - 0.6;
    }
    if (RS.open) paintRun();
  }
  function frame(ts) {
    if (!RS.visible) return;
    var dt = RS.last ? Math.min(0.1, (ts - RS.last) / 1000) : 0; RS.last = ts;
    RS.shown = Math.max(RS.shown, RS.floor);
    if (!stillMotion()) RS.shown += (RS.cap - RS.shown) * (1 - Math.exp(-dt / 1.6)); // creeps toward the end of the current stage, never past it
    $('runFill').style.width = RS.shown.toFixed(2) + '%'; $('runBar').setAttribute('aria-valuenow', String(Math.round(RS.shown)));
    $('runTime').textContent = new Intl.NumberFormat(A.lang === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((Date.now() - RS.t0) / 1000) + ' s';
    RS.raf = requestAnimationFrame(frame);
  }
  function showSheet() {
    if (!RS.open || RS.hidden || RS.visible || (A.wizard && A.wizard.open)) return;
    RS.visible = true; RS.back = document.activeElement; RS.last = 0;
    $('runSheet').classList.remove('hide');
    [document.querySelector('.top'), $('wizard'), $('shell')].forEach(function (n) { if (n) n.inert = true; });
    paintRun(); $('runIn').focus();
    cancelAnimationFrame(RS.raf); RS.raf = requestAnimationFrame(frame);
  }
  function hideSheet() {
    if (!RS.visible) return;
    RS.visible = false; cancelAnimationFrame(RS.raf);
    $('runSheet').classList.add('hide');
    [document.querySelector('.top'), $('wizard'), $('shell')].forEach(function (n) { if (n) n.inert = false; });
    if (RS.back && RS.back.focus && document.contains(RS.back)) { try { RS.back.focus(); } catch (e) { /* ignore */ } }
  }
  function runOpen(token, nScen) {
    RS.open = true; RS.hidden = false; RS.token = token; RS.step = -1; RS.T = null; RS.phase = 'main'; RS.scenI = 0; RS.scenN = nScen || 0; RS.scenName = '';
    RS.shown = 0; RS.floor = 0; RS.cap = 0; RS.t0 = Date.now();
    runStep('load'); showSheet();
  }
  function runClose() { RS.open = false; hideSheet(); }
  function runFinish(token) { // everything done: fill the bar, tick every step, then get out of the way
    if (RS.token !== token || !RS.open) return;
    RS.step = STEPS.length; RS.floor = RS.cap = 100; if (RS.visible) paintRun();
    setTimeout(function () { if (RS.token === token) runClose(); }, 450);
  }
  A.runSheet = { show: showSheet, hide: hideSheet };
  $('runAbort').onclick = function () { A.abortRun(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && RS.visible) { e.stopImmediatePropagation(); A.abortRun(); } }, true);

  V.RS = RS; V.runStep = runStep; V.runOpen = runOpen; V.runClose = runClose; V.runFinish = runFinish;
})();

/* ===== views/progress.js: progress dialog while optimising (the solver's real stages, a bar that keeps creeping between them, cancel) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, $ = A.$, el = A.el, t = A.t;

  /* 'cap' (the search within the limit on new deposits) and 'more' (the search without a time limit) are listed only
     when the setting is on. `limit`, `more`: those settings; keep: an interim plan exists, the run can be ended and the
     best plan kept; best: { T, n, wealth } of that plan; live: what the open-ended search is doing { part, round, T, nodes }. */
  var STEPS = ['load', 'search', 'wealthLP', 'tieLP', 'milp', 'tie', 'cap', 'slack', 'more', 'verify', 'scen'];
  var SPAN = { load: [0, 4], search: [4, 12], wealthLP: [12, 18], tieLP: [18, 24], milp: [24, 40], tie: [40, 48], cap: [48, 54], slack: [54, 58], more: [58, 62], verify: [62, 64], scen: [64, 100] };
  var RS = { open: false, visible: false, hidden: false, step: -1, T: null, phase: 'main', scenI: 0, scenN: 0, scenName: '', shown: 0, floor: 0, cap: 0, t0: 0, last: 0, raf: 0, token: 0, back: null, wasStale: false,
    limit: false, more: false, keep: false, best: null, live: null, capT: null, P: null };
  function stillMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function month(T) { return RS.P && T != null ? V.mLabel(RS.P, T) : '…'; }
  function stepText(k) {
    if (k === 'load') return t('r_load');
    if (k === 'search') return t('s_stage_search', { T: RS.T != null ? RS.T : '…' });
    if (k === 'verify') return t('r_verify');
    if (k === 'scen') return t('r_scen') + (RS.phase === 'scen' && RS.scenN ? ' (' + Math.min(RS.scenI + 1, RS.scenN) + '/' + RS.scenN + ')' : '');
    if (k === 'cap') return t('r_cap', { n: RS.P ? RS.P.trancheCap.max : '' });
    if (k === 'more') return t('r_more');
    return t('s_stage_' + k);
  }
  function subText(k, now) { // second line of a step: what it is doing right now
    if (!now) return '\u00a0';
    if (k === 'scen') return RS.scenName || '\u00a0';
    if (k === 'cap') return RS.capT != null ? t('r_capSub', { m: month(RS.capT) }) : '\u00a0';
    var l = RS.live; if (!l) return '\u00a0';
    return t('r_more_' + l.part, { m: month(l.T) }) + ' · ' + t('r_round', { n: l.round }) + (l.nodes != null ? ' · ' + t('r_nodes', { n: A.n0(l.nodes) }) : '');
  }
  function paintRun() {
    var list = $('runSteps'); list.innerHTML = '';
    STEPS.forEach(function (k, i) {
      if (k === 'scen' && RS.scenN === 0) return; // only when there are other rate scenarios to compare
      if ((k === 'cap' && !RS.limit) || (k === 'more' && !RS.more)) return;
      var st = i < RS.step ? 'done' : (i === RS.step ? 'now' : 'todo'), sub = k === 'scen' || k === 'cap' || k === 'more';
      list.appendChild(el('li', { class: st, 'aria-current': st === 'now' ? 'step' : null }, el('span', { class: 'ic', 'aria-hidden': 'true' }),
        el('span', { text: stepText(k) }), sub ? el('span', { class: 'run-sub', text: subText(k, st === 'now') }) : null)); // the sub-line keeps its space
    });
    var cur = STEPS[Math.min(RS.step, STEPS.length - 1)], keep = RS.keep && RS.phase === 'main' && cur === 'more', b = RS.best;
    $('runTitle').textContent = t(RS.phase === 'scen' ? 'r_titleScen' : keep ? 'r_titleMore' : 'r_title');
    $('runStep').textContent = RS.step >= STEPS.length ? t('r_done') : stepText(cur);
    $('runKeep').classList.toggle('hide', !keep);
    $('runBest').classList.toggle('hide', !(keep && b));
    if (keep && b) $('runBest').textContent = t('r_best', { m: month(b.T), n: b.n }) + (b.wealth != null ? ' · ' + t('r_bestW', { w: Math.abs(b.wealth) < 1000 ? A.eur2(b.wealth) : A.eur(b.wealth) }) : '');
  }
  function runStep(k, p) {
    var i = STEPS.indexOf(k); if (i < 0) return;
    if (p && p.T != null && k === 'search') RS.T = p.T + 1;
    if (p && p.T != null && k === 'cap') RS.capT = p.T;
    if (p && k === 'more') {
      if (p.note === 'interim') { RS.keep = true; RS.best = { T: p.result.T, n: p.result.placements.length, wealth: p.result.wealth }; }
      else if (p.note === 'better') RS.best = { T: p.T, n: p.plan.length, wealth: p.wealth };
      if (p.part) { var same = RS.live && RS.live.part === p.part && RS.live.round === p.round && RS.live.T === p.T; RS.live = { part: p.part, round: p.round, T: p.T, nodes: p.nodes != null ? p.nodes : same ? RS.live.nodes : null }; }
    }
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
    var secs = (Date.now() - RS.t0) / 1000, two = function (n) { return (n < 10 ? '0' : '') + n; }; // a long search shows h:mm:ss
    $('runTime').textContent = secs < 120 ? new Intl.NumberFormat(A.lang === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(secs) + ' s'
      : (secs >= 3600 ? Math.floor(secs / 3600) + ':' + two(Math.floor(secs / 60) % 60) : String(Math.floor(secs / 60))) + ':' + two(Math.floor(secs) % 60);
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
  function runOpen(token, nScen, o) { // o: { cap, more: the two settings of this run, P: its prepared inputs (for month names) }
    o = o || {};
    RS.open = true; RS.hidden = false; RS.token = token; RS.step = -1; RS.T = null; RS.phase = 'main'; RS.scenI = 0; RS.scenN = nScen || 0; RS.scenName = '';
    RS.limit = !!o.cap; RS.more = !!o.more; RS.P = o.P || null; RS.keep = false; RS.best = null; RS.live = null; RS.capT = null;
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
  $('runKeep').onclick = function () { A.keepRun(); };
  // Escape cancels the run. Once the open-ended search has a plan to keep, it keeps it: hours of search are not thrown away by one key
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && RS.visible) { e.stopImmediatePropagation(); if (RS.keep && RS.phase === 'main') A.keepRun(); else A.abortRun(); } }, true);

  V.RS = RS; V.runStep = runStep; V.runOpen = runOpen; V.runClose = runClose; V.runFinish = runFinish;
})();

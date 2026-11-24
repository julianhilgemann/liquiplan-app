/* ===== views/pipeline.js: optimisation pipeline (solve and verify the chosen scenario, show it, then the other rate scenarios) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, C = LP.core, SIM = LP.sim, $ = A.$, t = A.t, esc = A.esc;
  var hasData = V.hasData; // shared.js
  var RS = V.RS, runStep = V.runStep, runOpen = V.runOpen, runClose = V.runClose, runFinish = V.runFinish; // progress.js
  var renderAll = V.renderAll; // render.js
  var renderScen = V.renderScen; // scenarios.js
  var lad = V.lad; // ladder.js

  var runSeq = 0, debounce = null;

  A.schedule = function (delay) { clearTimeout(debounce); debounce = setTimeout(A.run, delay == null ? 700 : delay); };
  function summarize(P, sim, base) { return { T: sim.Tstar, Ttg: base.tg.Tstar, Tnv: base.naive.Tstar, interest: sim.interestToT, H: P.H }; }
  function baselines(P) { return { tg: SIM.allTagesgeld(P), naive: SIM.naive(P) }; }
  /* Optimise + verify one state; used by the main run, the scenarios and the self-test. `unlimited` (main run only):
     search on without a time limit once the plan of the usual budgets stands. */
  A.solveState = async function (state, over, timeScale, onProgress, unlimited) {
    var P = C.prepare(state, over), base = baselines(P), hint = SIM.run(P, SIM.withPins(P, [])).Tstar;
    var res = await A.solver.solve(state, over, { integer: true, loHint: hint, timeScale: timeScale || 1, unlimited: !!unlimited }, onProgress);
    var ver = SIM.verify(P, res);
    if (res.interim) { // a search ended by hand: its best plan must pass like any other; if it does not, the plan of the usual budgets stands
      var first = res.interim; delete res.interim;
      if (!ver.ok) { res = Object.assign({}, first, { stages: Object.assign({}, first.stages, { unlimited: 'stopped' }) }); ver = SIM.verify(P, res); }
    }
    return { P: P, res: res, ver: ver, sim: ver.sim, base: base };
  };
  var STAGE_PCT = { search: 30, wealthLP: 45, tieLP: 52, milp: 60, milp2: 72, tie: 80, cap: 86, slack: 92, more: 95 };
  function setBusy(on, text, pct) {
    A.busy = on;
    var b = $('solverBadge'); b.className = 'badge ' + (on ? 'busy' : (A.view ? 'ok' : (A.lastError ? 'err' : '')));
    $('solverText').textContent = text; $('solverBadge').title = text;
    $('progressBar').style.width = on ? (pct || 8) + '%' : '0';
    $('btnOptimize').disabled = !hasData(A.state); // greyed out until there is something to optimise
    A.replay.sync(); A.syncLadXlsx();
  }
  function badgeDone(ms) {
    if (!hasData(A.state)) { setBusy(false, t('e_status')); $('solverBadge').title = t('e_status'); return; } // nothing to plan with (an older result may still be in memory)
    if (!A.view && !A.lastError) { setBusy(false, t('s_notRun')); $('solverBadge').title = t('s_notRun'); return; } // waiting for "Optimieren"
    if (ms == null && A.view) ms = A.view.ms; // the time of the plan on screen, also after a worker restart
    var name = A.solver.info.solver || '…', secs = ms ? ' · ' + new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(ms / 1000) + ' s' : '', ver = t('s_verified');
    var full = t('s_ready') + ': ' + name + (A.view ? ' · ' + ver + secs : '');
    setBusy(false, A.view ? ver.charAt(0).toUpperCase() + ver.slice(1) + secs : full); // short in the toolbar, the solver name on hover
    $('solverBadge').title = full;
  }
  A.onSolverInfo = function () { if (!A.busy) badgeDone(); A.renderChainInfo(); };
  A.markStale = function () { // inputs changed: no calculation until "Optimieren" is pressed
    var any = hasData(A.state);
    clearTimeout(debounce); A.stale = true; $('main').classList.add('stale'); $('staleNote').classList.toggle('hide', !(any && A.view)); $('btnOptimize').classList.toggle('due', any); $('btnOptimize').disabled = !any; $('app').classList.toggle('blank', !any);
    runSeq++; A.solver.cancelAll(); // a run for the previous inputs is of no use any more
    A.busy = false; $('progressBar').style.width = '0'; $('solverBadge').className = 'badge'; $('solverText').textContent = t('s_stale'); $('solverBadge').title = t('s_stale');
    runClose(); A.replay.sync(); A.syncLadXlsx();
    if (!A.view || !any) renderAll(); // placeholders switch to "not calculated yet", or to the empty state
  };
  function fresh() { $('main').classList.remove('stale'); } // results on screen match the inputs again

  A.keepRun = function () { // search without a time limit: end it and go on with the best plan found so far
    if (!RS.open || RS.phase !== 'main' || !RS.keep) return;
    RS.keep = false; runStep('verify');
    if (!A.solver.finishEarly()) RS.keep = true; // nothing to keep yet: the run goes on
  };
  A.abortRun = function () { // stop the calculation; whatever is on screen stays, flagged when it no longer matches the inputs
    if (!RS.open) return;
    var inScen = RS.phase === 'scen';
    runSeq++; A.solver.cancelAll(); runClose();
    if (inScen && A.view) {
      C.scenariosFor(A.state).forEach(function (sc) { if (!A.view.scen[sc]) A.view.scen[sc] = { aborted: true }; });
      renderScen(); badgeDone(A.view.ms);
    } else if (RS.wasStale || !A.view) A.markStale();
    else badgeDone(A.view.ms);
    A.toast(t('r_aborted'));
  };

  A.run = async function () {
    clearTimeout(debounce);
    if (!hasData(A.state)) { // nothing to optimise: the empty state explains what is missing
      runSeq++; A.solver.cancelAll(); runClose(); A.view = null; A.stale = false; A.lastError = null;
      $('staleNote').classList.add('hide'); $('btnOptimize').classList.remove('due'); $('main').classList.remove('stale');
      renderAll(); setBusy(false, t('e_status')); return;
    }
    var my = ++runSeq, st = A.state, t0 = Date.now();
    A.runId = my; // lets "Rechenweg" open once this run is done
    A.solver.cancelAll();
    RS.wasStale = A.stale || !A.view;
    A.lastError = null; A.stale = false; $('wizStale').classList.add('hide'); $('staleNote').classList.add('hide'); $('btnOptimize').classList.remove('due');
    setBusy(true, A.solver.ready ? t('s_solving') : t('s_loading'), 6);
    var others = C.scenariosFor(st).filter(function (sc) { return sc !== st.rateScenario; });
    var Pm = C.prepare(st), noLimit = !!st.unlimited && !A.solver.mainOnly;
    runOpen(my, others.length, { cap: Pm.trancheCap.on, more: noLimit, P: Pm });
    if (!A.view) renderAll();
    try {
      var r = await A.solveState(st, null, 1, function (p) {
        if (my !== runSeq) return;
        if (p.note !== 'tick' && p.note !== 'better') setBusy(true, t('s_stage_' + p.stage, { T: p.T != null ? p.T + 1 : '' }), STAGE_PCT[p.stage]);
        runStep(p.stage === 'milp2' ? 'milp' : p.stage, p);
      }, noLimit);
      if (my !== runSeq) return;
      runStep('verify');
      if (!r.ver.ok) {
        A.view = null; A.lastError = 'verify'; showVerifyError(r);
        runClose(); fresh(); renderAll(); badgeDone(); return;
      }
      $('verifyError').classList.add('hide');
      A.view = { P: r.P, res: r.res, sim: r.sim, base: r.base, scen: {}, ms: Date.now() - t0 };
      A.view.scen[st.rateScenario] = summarize(r.P, r.sim, r.base);
      lad.open = null;
      fresh(); renderAll(); badgeDone(A.view.ms); A.renderChainInfo();
      // scenario comparison: the plan is on screen behind the dialog, which stays until the comparison is done too
      RS.phase = 'scen';
      for (var i = 0; i < others.length; i++) {
        var sc = others[i];
        setBusy(true, t('s_scen') + ' ' + t('sc_' + sc), 40 + i * 15);
        RS.scenI = i; RS.scenName = t('sc_' + sc); runStep('scen');
        var r2 = await A.solveState(st, { rateScenario: sc }, 0.4);
        if (my !== runSeq) return;
        A.view.scen[sc] = r2.ver.ok ? summarize(r2.P, r2.sim, r2.base) : { fail: true };
        renderScen();
      }
      badgeDone(A.view.ms); runFinish(my); A.replay.runDone(my);
    } catch (e) {
      if (my !== runSeq || (e && e.message === 'cancelled')) return;
      A.lastError = 'solve'; A.view = null;
      var n = $('verifyError'); n.classList.remove('hide'); n.textContent = t('solveErr', { e: String(e && e.message || e) });
      runClose(); fresh(); renderAll(); setBusy(false, t('s_failed'));
    }
  };
  function showVerifyError(r) {
    var n = $('verifyError'), lines = [];
    r.ver.errors.slice(0, 4).forEach(function (e) {
      if (e.code === 'horizon') lines.push(t('v_horizon', { c: e.claimed + 1, s: e.simulated + 1, m: e.month >= 0 ? A.monthLabel(r.P.months[e.month]) : '–' }));
      else lines.push(t('v_other', { c: e.code }));
    });
    n.classList.remove('hide');
    n.innerHTML = '<strong>' + esc(t('v_title')) + '</strong><br>' + lines.map(esc).join('<br>') + '<br>' + esc(t('v_hint'));
  }

  V.badgeDone = badgeDone;
})();

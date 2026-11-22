/* ===== views/kpis.js: KPI strip ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  var hasData = V.hasData, mLabel = V.mLabel, solverNote = V.solverNote, gridNote = V.gridNote; // shared.js

  function renderKpis() {
    var box = $('kpis'); box.innerHTML = '';
    var v = A.view;
    function tile(cls, lab, val, sub, valCls) { return box.appendChild(el('div', { class: 'kpi ' + (cls || '') }, el('div', { class: 'lab', html: lab }), el('div', { class: 'val ' + (valCls || ''), html: val }), sub ? el('div', { class: 'sub', html: sub }) : null)); }
    if (!hasData(A.state) || (!v && !A.lastError)) { // skeleton: the tiles that will appear, without numbers
      var sk = function (w) { return '<span class="sk" style="width:' + w + '"></span>'; };
      tile('hero', esc(t('k_safe')), sk('11rem'), sk('16rem')); tile('', esc(t('k_runway')), sk('6rem'), sk('4rem')); tile('', esc(t('k_interest')), sk('5rem'), sk('6rem'));
      tile('wide', esc(t('k_gain')), sk('5rem'), sk('8rem')); tile('k-lock', esc(t('k_locked')), sk('4rem'), sk('7rem')); tile('full', esc(t('k_next')), sk('20rem'), '', 'sm');
      box.classList.add('skeleton'); return;
    }
    box.classList.remove('skeleton');
    if (!v && A.lastError) { tile('hero bad', A.term('tstar', t('k_safe')), '–', esc(t('v_hint'))); return; }
    if (!v) { // no result yet: same tiles as the result, so nothing jumps when it arrives
      tile('hero', A.term('tstar', t('k_safe')), '–', esc(t(A.busy ? 's_solving' : 'k_notRun'))); tile('', esc(t('k_runway')), '–', '&nbsp;'); tile('', esc(t('k_interest')), '–', '&nbsp;<br>&nbsp;');
      tile('wide', A.term('base', t('k_gain')), '–', '&nbsp;'); tile('k-lock', esc(t('k_locked')), '–', '&nbsp;'); tile('full', esc(t('k_next')), '–', '', 'sm'); return;
    }
    var P = v.P, T = v.sim.Tstar, H = P.H, res = v.res, sub;
    var seeHow = function (n) { n.appendChild(el('button', { type: 'button', class: 'rp-link', 'aria-controls': 'replay', text: t('rp_see'), onclick: function () { A.replay.open(); } })); }; // the step-by-step view of this result
    if (T < 0) seeHow(tile('hero bad', A.term('tstar', t('k_safe')), esc(t('k_none')), ''));
    else if (T >= H - 1) seeHow(tile('hero', A.term('tstar', t('k_safe')), '≥ ' + esc(mLabel(P, T, true)), esc(t('k_safeAll')) + gridNote(res) + solverNote(res)));
    else {
      var slack = res.slack != null && res.slack > 0.005 ? res.slack : (res.slackLP != null && res.slackLP > 0.005 ? res.slackLP : null);
      sub = esc(t('k_firstGap', { m: mLabel(P, T + 1, true) })) + ' · ' + A.term('slack', slack != null ? t('k_slack', { a: A.eur(slack) }) : t('k_slackPlan', { a: A.eur(v.sim.shortfall) }));
      var open = (res.notes || []).some(function (n) { return n.indexOf('milp_timeout_at_') === 0; }); // the search budget ran out at some month: nothing was proven
      if (res.TLP > T) sub += '<br>' + A.term('lprel', t(open ? 'k_boundOpen' : 'k_bound', { m: mLabel(P, res.TLP) }));
      sub += gridNote(res) + solverNote(res);
      seeHow(tile('hero', A.term('tstar', t('k_safe')), esc(mLabel(P, T, true)), sub));
    }
    tile('', esc(t('k_runway')), esc(t('k_months', { n: T + 1 })), esc(t('k_years', { y: new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format((T + 1) / 12) })));
    var g1 = T - v.base.tg.Tstar, g2 = T - v.base.naive.Tstar, sg = function (n) { return (n > 0 ? '+' : '') + n; };
    box.appendChild(el('div', { class: 'kpi wide' }, el('div', { class: 'lab', html: A.term('base', t('k_gain')) }), el('div', { class: 'duo' },
      el('div', null, el('div', { class: 'val', text: sg(g1) + ' M' }), el('div', { class: 'sub', text: t('k_gainTG') })),
      el('div', null, el('div', { class: 'val', text: sg(g2) + ' M' }), el('div', { class: 'sub', text: t('k_gainNaive') })))));
    // the total counts overnight money and deposits; the line below says how much the deposits earn (the ladder spreadsheet holds only those)
    tile('', esc(t('k_interest')), esc(A.eur(v.sim.interestToT)), esc(t('k_interestDep', { d: A.eur(v.sim.interestDepToT) })) + '<br>' + esc(t('k_interestSub', { t: A.eur(v.sim.taxToT) })));
    tile('k-lock', esc(t('k_locked')), esc(A.pct(100 * v.sim.lockShareAvg, 0)), esc(t('k_lockedSub', { p: A.pct(100 * v.sim.lockSharePeak, 0) })));
    var acts = V.buildActions(v), first = null;
    for (var i = 0; i < acts.length; i++) if (acts[i].type === 'place') { first = acts[i]; break; }
    tile('full', esc(t('k_next')), first ? '<strong>' + esc(first.when) + ':</strong> ' + esc(first.text) : esc(t('k_noAction')), '', 'sm');
  }

  V.renderKpis = renderKpis;
})();

/* ===== views/replay.js: "Rechenweg", a page mode (like the wizard) that replays the steps the optimiser took for the plan on screen =====
   The steps are the trace of the run (A.view.res.trace, written by solver/optimize.js). Two steps are added here: the
   path without new deposits first, and the final plan as the independent simulator recomputed it last. The balances
   of a step's plan are simulated here with LP.sim, once per step. */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, SIM = LP.sim, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  var hasData = V.hasData, mLabel = V.mLabel, chart = V.chart, axisStyle = V.axisStyle, tipStyle = V.tipStyle, compact = V.compact, toggleLegend = V.toggleLegend; // shared.js
  var balances = V.balances, balanceItems = V.balanceItems, balanceOption = V.balanceOption; // timeline.js

  var GROUP = { start: 'start', probe: 'find', wealthLP: 'build', tieLP: 'build', milp: 'build', widen: 'build', ask: 'build', back: 'build', tie: 'build', slack: 'check', verify: 'check' };
  var NO_PLAN = { probe: 1, back: 1, slack: 1 }; // kinds that never carry a plan of their own
  var TARGET = { wealthLP: 1, tieLP: 1, milp: 1, widen: 1, back: 1, tie: 1 }; // kinds whose month is the month being planned for
  // on: the page is shown; i: current step; view: the result the steps were built from; menu: phone list view;
  // y: page scroll when entering; want: run id to open after; mode: 'search' | 'plan' for this step; off: hidden legend series
  var S = { on: false, i: 0, view: null, steps: null, menu: false, y: 0, want: null, mode: null, off: {}, drawn: null, w: 0 };
  var R = A.replay = {};

  function narrow() { return window.matchMedia('(max-width: 720px)').matches; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function mon(T, long) { return T == null ? '–' : mLabel(S.view.P, T, long); }
  function months(n) { return n === 1 ? t('rp_mo1') : t('rp_moN', { n: A.n0(n) }); }
  function plural(key, n) { var p = t(key).split('|'); return A.n0(n) + ' ' + (n === 1 ? p[0] : (p[1] || p[0])); }
  // a text as HTML: the template is escaped, the values are inserted as given (escape them, or pass A.term(...))
  function h(key, vars) { var s = esc(t(key)); if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]); return s; }
  var NF1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function termFmt(v) { return v == null ? '–' : NF1.format(v) + ' ' + t('months_short'); }
  // amounts next to a small best case (example G ends with about 50 €) are shown with cents, so that the figures add up
  function cents(ref) { return ref != null && Math.abs(ref) < 1000; }
  function money(x, ref) { return cents(ref == null ? x : ref) ? A.eur2(x) : A.eur(x); }

  // ---------- the steps ----------
  function build(v) {
    var tr = v && v.res && v.res.trace;
    if (!tr || !Array.isArray(tr.steps)) return null;
    var P = v.P, H = P.H, sim0 = SIM.run(P, SIM.withPins(P, []));
    var list = [{ kind: 'start', T: sim0.Tstar, ok: null, plan: [], sim: sim0 }];
    tr.steps.forEach(function (s) { if (s && GROUP[s.kind] && s.kind !== 'start' && s.kind !== 'verify') list.push(Object.assign({}, s)); });
    list.push({ kind: 'verify', T: v.sim.Tstar, ok: true, plan: v.res.placements || [], sim: v.sim, solves: [] });
    var known = {}, last = 0, target = null, lo = sim0.Tstar, hi = sim0.Tstar;
    list.forEach(function (s, i) {
      s.i = i; s.group = GROUP[s.kind]; s.T = num(s.T); s.from = num(s.from);
      s.own = !NO_PLAN[s.kind] && Array.isArray(s.plan);
      s.prev = last; // the latest step before this one with a plan of its own (the first step always has one)
      if (s.own) last = i;
      if (s.kind === 'ask' && s.ok === true && target != null && s.T != null && s.T > target) s.jump = true; // a month given up earlier is reachable after all
      if (TARGET[s.kind] && s.T != null) target = s.T;
      if (s.kind === 'ask' && s.T != null) target = s.T;
      // what is known about the months after this step: the latest verdict for each month asked about
      if (s.T != null) {
        if (s.kind === 'probe' && s.ok != null) known[s.T] = s.ok ? 'yes' : 'no';
        if ((s.kind === 'milp' || s.kind === 'widen' || s.kind === 'ask') && s.ok === true) known[s.T] = 'yes';
        if (s.kind === 'ask' && s.ok === false) known[s.T] = 'no';
        if (s.kind === 'verify' && s.T >= 0) known[s.T] = 'yes';
      }
      if (s.kind === 'back' && s.from != null) known[s.from] = 'no';
      s.known = Object.assign({}, known);
      [s.T, s.from].forEach(function (m) { if (m != null) { lo = Math.min(lo, m); hi = Math.max(hi, m); } });
    });
    // the horizon strip: from just before the starting reach to just after the latest month asked about (at least six months)
    lo = Math.max(-1, lo - 1); hi = Math.min(H - 1, hi + 1);
    while (hi - lo < 5 && (lo > -1 || hi < H - 1)) { if (hi < H - 1) hi++; if (hi - lo < 5 && lo > -1) lo--; }
    S.lo = lo; S.hi = hi;
    var top = Math.max(hi - 1, sim0.Tstar, v.sim.Tstar);
    S.zoomEnd = top >= 0 && top < H - 13 ? top + 13 : H;
    return list;
  }
  function simOf(s) {
    if (s.sim) return s.sim;
    var P = S.view.P, sim = SIM.run(P, SIM.withPins(P, s.plan)), t, ok = true;
    if (s.kind === 'wealthLP' || s.kind === 'tieLP') {
      /* Unrounded plans reach the buffer exactly in many months; with their amounts in cents the simulator then finds
         a few cents missing there. That is rounding, not a shortfall: below 1 € a month counts as covered. */
      sim.Tstar = -1; sim.firstShort = -1;
      for (t = 0; t < P.H; t++) {
        if (!sim.ok[t] && P.floor[t] - sim.avail[t] < 1) sim.ok[t] = true;
        if (!sim.ok[t] && ok) { ok = false; sim.firstShort = t; }
        if (ok) sim.Tstar = t;
      }
    }
    return (s.sim = sim);
  }
  function termOf(plan) { // amount-weighted average term, and the euro-months locked, of a list of placements
    var P = S.view.P, a = 0, w = 0, n = 0;
    (plan || []).forEach(function (p) { var pr = P.products[p.k]; if (!pr || !(p.amount > 0.5)) return; a += p.amount; w += p.amount * pr.term; n++; });
    return { n: n, mm: w, avg: a > 0 ? w / a : null };
  }
  function bound(s) { // the best case for this step's month: its own bound, else the latest wealthLP before it
    if (num(s.bound) != null) return s.bound;
    for (var i = s.i - 1; i >= 0; i--) { var p = S.steps[i]; if (p.kind === 'wealthLP' && p.T === s.T && num(p.obj) != null) return p.obj; }
    return null;
  }
  function seedOf(s) { for (var i = s.i - 1; i >= 0; i--) { var p = S.steps[i]; if ((p.kind === 'ask' || p.kind === 'widen') && p.ok === true) return i; } return null; }
  function horizon(known, T0) { // reachable through `reach`, not reachable from `notFrom` (null: nothing ruled out yet)
    var reach = T0, notFrom = null, ks = Object.keys(known);
    ks.forEach(function (k) { var m = +k; if (known[k] === 'yes' && m > reach) reach = m; });
    ks.forEach(function (k) { var m = +k; if (known[k] === 'no' && m > reach && (notFrom == null || m < notFrom)) notFrom = m; });
    return { reach: reach, notFrom: notFrom };
  }
  function markOf(s) { // the mark in the list: yes, no, or a neutral dash (a tie-break that changed nothing is no failure)
    if (s.kind === 'verify') return ['ok', t('rp_checked')];
    if (s.ok === true) return ['ok', t('rp_yes')];
    if (s.ok === false) return s.kind === 'tie' ? ['dash', t('rp_same')] : ['no', s.kind === 'milp' && s.status === 'unknown' ? t('rp_notFound') : t('rp_no')];
    if (s.kind === 'ask') return ['dash', t('rp_noAnswer')];
    return null;
  }

  // ---------- question and answer ----------
  function qa(s) {
    var st = S.steps, P = S.view.P, H = P.H, T0 = st[0].T, m = esc(mon(s.T, true)), a = [], q = '', pill = null;
    var YES = { cls: 'ok', text: t('rp_yes') }, NO = { cls: 'bad', text: t('rp_no') }, eur = function (x, ref) { return esc(ref == null ? A.eur(x) : money(x, ref)); };
    var div = A.term('lprel', t('rp_w_div'));
    switch (s.kind) {
      case 'start':
        q = t('rp_q_start');
        if (s.T < 0) a.push(h('rp_a_startNone', { m: esc(mon(0, true)) }));
        else if (s.T >= H - 1) a.push(h('rp_a_startAll', { m: m }));
        else a.push(h('rp_a_start', { m: m, sockel: A.term('sockel', t('rp_w_sockel')) }));
        break;
      case 'probe':
        q = t('rp_q_probe', { m: mon(s.T, true) });
        if (s.ok) { pill = YES; a.push(h('rp_a_probeYes', { m: m, div: div })); } else { pill = NO; a.push(h('rp_a_probeNo', { m: m, div: div })); }
        var nx = st[s.i + 1];
        if (nx && nx.kind === 'probe') a.push(h('rp_a_next', { m: esc(mon(nx.T, true)) }));
        else { var r = horizon(s.known, T0).reach; a.push(r >= H - 1 ? h('rp_a_foundAll') : r < 0 ? h('rp_a_foundNone') : h('rp_a_found', { m: esc(mon(r, true)) })); }
        break;
      case 'wealthLP':
        q = t('rp_q_wealthLP', { m: mon(s.T, true) });
        a.push(num(s.obj) != null ? h('rp_a_wealthLP', { a: eur(s.obj, s.obj), div: div }) : h('rp_a_wealthLPno'));
        break;
      case 'tieLP':
        q = t('rp_q_tieLP');
        a.push(s.own ? h('rp_a_tieLP') : h('rp_a_tieLPno'));
        break;
      case 'milp':
        q = t('rp_q_milp', { m: mon(s.T, true) });
        if (s.ok) {
          pill = YES;
          var bd = bound(s), w = num(s.obj), g = bd != null && w != null ? Math.max(0, bd - w) : null, tiny = cents(bd) ? 0.005 : 0.5;
          if (w == null) w = 0;
          a.push(g == null ? h('rp_a_milpYesB', { a: eur(w) }) : g < tiny ? h('rp_a_milpYes0', { a: eur(w, bd) }) : h('rp_a_milpYes', { a: eur(w, bd), g: eur(g, bd) }));
          var tl = Array.isArray(s.trail) && s.trail.length ? s.trail : null;
          if (tl) {
            var lt = tl[tl.length - 1], N = num(s.nodes) != null ? Math.max(s.nodes, lt.n) : lt.n;
            if (lt.n === 0) a.push(N > 0 ? h('rp_a_trail0', { N: esc(A.n0(N)) }) : h('rp_a_trailRoot'));
            else a.push(h(tl.length === 1 ? 'rp_a_trail1' : 'rp_a_trailN', { n: esc(A.n0(tl.length)), k: esc(A.n0(lt.n)), N: esc(A.n0(N)) }));
          }
          var sd = s.seeded ? seedOf(s) : null;
          if (sd != null) a.push(h(tl ? 'rp_a_seeded' : 'rp_a_seededKept', { n: String(sd + 1) }));
          if (s.status === 'optimal' && tl) a.push(h('rp_a_optimal'));
          else if (s.status === 'feasible' && g != null && g >= tiny) a.push(h(tl ? 'rp_a_feasible' : 'rp_a_feasibleKept', { g: eur(g, bd) }));
        } else {
          pill = s.status === 'unknown' ? { cls: 'warn', text: t('rp_notFound') } : NO;
          a.push(s.status === 'infeasible' ? h('rp_a_milpNo', { m: m, denom: A.term('denom', t('rp_w_denom')) }) : h('rp_a_milpUnknown', { m: m }));
        }
        break;
      case 'widen':
        q = t('rp_q_widen');
        if (s.ok) { pill = YES; a.push(h('rp_a_widenYes', { m: m })); }
        else { pill = NO; a.push((s.status === 'feasible' || s.status === 'optimal') && num(s.obj) != null && s.obj > 0.005 ? h('rp_a_widenShort', { m: m, a: eur(s.obj) }) : h('rp_a_widenNo', { m: m })); }
        break;
      case 'ask':
        q = t('rp_q_ask', { m: mon(s.T, true) });
        if (s.ok === true) { pill = YES; a.push(s.jump ? h('rp_a_askBack', { m: m }) : h('rp_a_askYes')); }
        else if (s.ok === false) { pill = NO; a.push(h('rp_a_askNo', { m: m })); }
        else { pill = { cls: 'warn', text: t('rp_noAnswer') }; a.push(h('rp_a_askNull')); }
        break;
      case 'back':
        q = t('rp_q_back', { m: mon(s.T, true), m2: mon(s.from, true) });
        var pv = st[s.i - 1];
        a.push(h(pv && (pv.kind === 'milp' || pv.kind === 'widen' || pv.kind === 'ask') ? 'rp_a_backWhy' : 'rp_a_backWhy0', { m2: esc(mon(s.from, true)) }));
        a.push(s.T > T0 ? h('rp_a_back') : s.T >= 0 ? h('rp_a_backStart', { m: m }) : h('rp_a_backNone'));
        break;
      case 'tie':
        q = t('rp_q_tie');
        if (s.ok && s.own) {
          pill = YES;
          var b0 = termOf(st[s.prev].plan), b1 = termOf(s.plan);
          a.push(b0.avg != null && b1.avg != null && b1.avg < b0.avg - 0.05 ? h('rp_a_tieYes') : b1.mm < b0.mm - 0.5 ? h('rp_a_tieYesSum') : h('rp_a_tieYesEq'));
        } else { pill = { cls: 'neutral', text: t('rp_same') }; a.push(h('rp_a_tieNo')); }
        break;
      case 'slack':
        q = t('rp_q_slack', { m: mon(s.T, true) });
        var lp = num(s.slackLP) != null ? s.slackLP : num(s.obj), real = num(s.obj) != null ? s.obj : lp;
        if (lp == null) a.push(h('rp_a_wealthLPno'));
        else if (lp > 0.005) { a.push(h('rp_a_slack', { a: eur(lp), m: m, div: div })); if (real > lp + 0.5) a.push(h('rp_a_slackReal', { b: eur(real) })); }
        else a.push(real > 0.005 ? h('rp_a_slack0Real', { b: eur(real) }) : h('rp_a_slack0'));
        break;
      case 'verify':
        q = t('rp_q_verify'); pill = { cls: 'ok', text: t('rp_checked') };
        a.push(s.T < 0 ? h('rp_a_verifyNone') : s.T >= H - 1 ? h('rp_a_verifyAll', { m: m }) : h('rp_a_verify', { m: m }));
        break;
    }
    return { q: q, a: a.join(' '), pill: pill };
  }

  // ---------- rendering ----------
  function renderMenu() {
    var ol = $('rpSteps'), grp = null; ol.innerHTML = '';
    S.steps.forEach(function (s, i) {
      if (s.group !== grp) { grp = s.group; ol.appendChild(el('li', { class: 'rp-grp', text: t('rp_g_' + grp) })); }
      var mk = markOf(s);
      ol.appendChild(el('li', null, el('button', { type: 'button', class: 'wiz-item rp-item', id: 'rpStep' + i, 'aria-current': i === S.i ? 'step' : null, onclick: function () { S.menu = false; go(i, true); } },
        el('span', { class: 'no', text: String(i + 1) }), el('span', { class: 'tt', text: t('rp_l_' + s.kind) }),
        el('span', { class: 'mo', text: s.T == null ? '' : mon(s.T) }),
        mk ? el('span', { class: 'meta ' + mk[0], title: mk[1] }, el('span', { class: 'sr', text: mk[1] })) : el('span', { class: 'meta' }),
        el('span', { class: 'chev', 'aria-hidden': 'true' }))));
    });
  }
  function menuToCurrent() { // keeps the current row visible inside the menu's own scroll area
    var menu = $('rpMenu'), cur = $('rpStep' + S.i); if (!cur || menu.scrollHeight <= menu.clientHeight) return;
    var mr = menu.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    if (cr.top < mr.top + 8) menu.scrollTop -= mr.top + 8 - cr.top; else if (cr.bottom > mr.bottom - 8) menu.scrollTop += cr.bottom - mr.bottom + 8;
  }
  function renderQ(s) {
    var box = $('rpQ'), x = qa(s); box.innerHTML = '';
    box.appendChild(el('div', { class: 'rp-kicker', text: t('rp_pos', { n: s.i + 1, N: S.steps.length }) + ' · ' + t('rp_g_' + s.group) }));
    box.appendChild(el('h3', { text: x.q }));
    box.appendChild(el('p', { class: 'rp-answer' }, x.pill ? el('span', { class: 'pill ' + x.pill.cls, text: x.pill.text }) : null, el('span', { html: x.a })));
  }
  function renderStrip(s) {
    var box = $('rpHz'), P = S.view.P, H = P.H, T0 = S.steps[0].T, lo = S.lo, hi = S.hi, n = hi - lo + 1, hz = horizon(s.known, T0);
    var at = function (m) { return ((m - lo + 0.5) / n * 100).toFixed(3) + '%'; };
    box.innerHTML = '';
    var leg = el('div', { class: 'rp-hz-leg' });
    [['start', 'rp_z_start'], ['yes', 'rp_z_yes'], ['no', 'rp_z_no'], ['open', 'rp_z_open'], ['cur', 'rp_z_cur']].forEach(function (k) {
      leg.appendChild(el('span', null, el('i', { class: k[0] === 'open' ? 'rp-sw-open' : k[0] === 'cur' ? 'rp-sw-cur' : 'rp-mk ' + k[0], 'aria-hidden': 'true' }), t(k[1])));
    });
    var track = el('div', { class: 'rp-hz-track', 'aria-hidden': 'true' });
    var o0 = Math.max(lo, hz.reach + 1), o1 = Math.min(hi, (hz.notFrom != null ? hz.notFrom : hi + 1) - 1);
    if (o1 >= o0) track.appendChild(el('span', { class: 'rp-open', style: 'left:' + ((o0 - lo) / n * 100).toFixed(3) + '%;width:' + ((o1 - o0 + 1) / n * 100).toFixed(3) + '%' }));
    if (s.T != null && s.T >= lo && s.T <= hi) track.appendChild(el('span', { class: 'rp-cur', style: 'left:' + at(s.T) + ';--w:' + (100 / n).toFixed(3) + '%' }));
    if (T0 >= lo && T0 <= hi) track.appendChild(el('span', { class: 'rp-mk start', style: 'left:' + at(T0) }));
    Object.keys(s.known).forEach(function (k) { var m = +k; if (m >= lo && m <= hi) track.appendChild(el('span', { class: 'rp-mk ' + s.known[k], style: 'left:' + at(m) })); });
    // month axis: labels as dense as the width allows, on calendar steps (every month, 2, 3, 6 months, years)
    var ax = el('div', { class: 'rp-hz-ax', 'aria-hidden': 'true' }), wpx = Math.max(0, box.clientWidth - 90), maxL = Math.max(2, Math.floor(wpx / 80));
    var tickAt = function (m, k) { if (m < 0) return k === 1; var ym = P.months[m]; return k < 12 ? (ym.m - 1) % k === 0 : ym.m === 1 && ym.y % (k / 12) === 0; };
    var STEPS = [1, 2, 3, 6, 12, 24, 60, 120], stp = 120, j, m;
    for (j = 0; j < STEPS.length; j++) { var c = 0; for (m = lo; m <= hi; m++) if (tickAt(m, STEPS[j])) c++; if (c <= maxL) { stp = STEPS[j]; break; } }
    for (m = lo; m <= hi; m++) {
      if (n <= 72) ax.appendChild(el('i', { style: 'left:' + at(m) }));
      if (tickAt(m, stp)) ax.appendChild(el('span', { style: 'left:' + at(m), text: m < 0 ? t('start') : stp >= 12 ? String(P.months[m].y) : A.monthLabel(P.months[m]) }));
    }
    var txt;
    if (hz.notFrom != null) {
      txt = hz.reach >= 0 ? t('rp_z_both', { a: mon(hz.reach, true), b: mon(hz.notFrom, true) }) : t('rp_z_noOnly', { b: mon(hz.notFrom, true) });
      var gap = hz.notFrom - hz.reach - 1;
      if (gap === 1) txt += ' ' + t('rp_z_open1', { c: mon(hz.reach + 1, true) }); else if (gap > 1) txt += ' ' + t('rp_z_openN', { n: A.n0(gap) });
    } else if (hz.reach >= H - 1) txt = t('rp_z_all', { a: mon(hz.reach, true) });
    else if (hz.reach < 0) txt = t('rp_z_noneYet');
    else txt = t('rp_z_yesOnly', { a: mon(hz.reach, true) });
    box.appendChild(el('div', { class: 'rp-hz-head' }, el('h3', { text: t('rp_z_label') }), leg));
    box.appendChild(el('div', { class: 'rp-hz-body' }, track, ax));
    box.appendChild(el('p', { class: 'rp-hz-text', text: txt }));
  }
  function canSearch(s) { return s.kind === 'milp' && s.ok === true && Array.isArray(s.trail) && s.trail.length >= 3 && num(s.obj) != null; }
  function renderVisual(s) {
    var ok = canSearch(s);
    if (S.mode == null) S.mode = ok ? 'search' : 'plan';
    var mode = ok ? S.mode : 'plan';
    $('rpSeg').classList.toggle('hide', !ok);
    $('rpSegSearch').setAttribute('aria-pressed', mode === 'search' ? 'true' : 'false'); $('rpSegPlan').setAttribute('aria-pressed', mode === 'plan' ? 'true' : 'false');
    if (mode === 'search') drawSearch(s); else drawPlan(s);
    renderFigs(s);
  }
  var TITLE = { start: 'rp_v_start', wealthLP: 'rp_v_lp', tieLP: 'rp_v_lp', milp: 'rp_v_plan', tie: 'rp_v_plan', widen: 'rp_v_found', ask: 'rp_v_found', verify: 'rp_v_final' };
  function drawPlan(s) {
    var P = S.view.P, H = P.H, st = S.steps, T0 = st[0].T, src = s, faded = false, cap = '';
    if (s.kind === 'probe') { src = st[0]; cap = t('rp_v_probe'); }
    else if (!s.own) { src = st[s.prev]; faded = true; cap = t('rp_v_faded', { n: s.prev + 1 }); }
    $('rpVisTitle').textContent = t(s.kind === 'probe' ? 'rp_v_start' : faded ? 'rp_v_last' : TITLE[s.kind] || 'rp_v_plan');
    $('rpCap').textContent = cap; $('rpVis').classList.toggle('faded', faded);
    $('chartReplay').setAttribute('aria-label', t('chartTitle'));
    var items = balanceItems(); if (s.kind === 'probe') items = items.filter(function (it) { return it.key !== 'short'; });
    var legendOpt = toggleLegend($('rpLegend'), 'chartReplay', items, S.off);
    var ch = chart('chartReplay'); if (!ch) return;
    var b = balances(P, simOf(src), S.off), shortName = t('shortfall');
    if (faded) b.series.forEach(function (se) { if (se.areaStyle) se.areaStyle.opacity = 0.3; });
    if (s.kind === 'probe' && s.T != null) { // the path without new deposits, the months asked about tinted
      b.series.forEach(function (se) { if (se.name === shortName && se.markArea) { se.markArea.data = []; se.markArea.label.show = false; } });
      var good = s.ok === true, c = A.css(good ? '--good' : '--c-crit'), ink = A.css(good ? '--good' : '--crit');
      b.series.push({ name: '__probe', type: 'line', symbol: 'none', data: b.none, silent: true, z: 6,
        markArea: { silent: true, itemStyle: { color: c, opacity: 0.16 }, data: [[{ xAxis: Math.max(0, T0 + 1) }, { xAxis: s.T + 1 }]] },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: ink, width: 2, type: 'solid' }, label: { formatter: t(good ? 'rp_t_yes' : 'rp_t_no', { m: mon(s.T) }), color: ink, fontWeight: 600, fontSize: 11, position: 'insideEndTop' }, data: [{ xAxis: s.T + 1 }] } });
    } else if (s.T != null && s.T >= 0) { // the month of the step, styled like the T* line of the main chart
      var acc = A.css('--accent');
      b.series.push({ name: '__step', type: 'line', symbol: 'none', data: b.none, silent: true, z: 6,
        markLine: { silent: true, symbol: 'none', lineStyle: { color: acc, width: 2, type: 'solid' }, label: { formatter: (s.kind === 'verify' ? 'T* ' : '') + mon(s.T), color: acc, fontWeight: 600, fontSize: 11, position: 'insideEndTop' }, data: [{ xAxis: Math.min(H, s.T + 1) }] } });
    }
    var opt = balanceOption(b, legendOpt(), S.zoomEnd);
    if (S.drawn === 'plan') { // keep the reader's zoom from one step to the next
      try { var dz = ch.getOption().dataZoom; if (dz && dz[0] && dz[0].start != null) opt.dataZoom.forEach(function (d) { delete d.startValue; delete d.endValue; d.start = dz[0].start; d.end = dz[0].end; }); } catch (e) { /* default zoom */ }
    }
    ch.setOption(opt, true); S.drawn = 'plan';
  }
  function drawSearch(s) { // wealth of the best plan so far over the search nodes, against the best case
    var tl = s.trail, bd = bound(s), lt = tl[tl.length - 1], N = Math.max(1, num(s.nodes) || 0, lt.n), c = A.css('--c-opt'), ink = A.css('--ink'), ax = axisStyle(), surface = A.css('--surface');
    $('rpVisTitle').textContent = t('rp_v_search'); $('rpCap').textContent = t('rp_v_searchCap'); $('rpVis').classList.remove('faded');
    $('chartReplay').setAttribute('aria-label', t('rp_v_search'));
    var lg = $('rpLegend'); lg.innerHTML = '';
    lg.appendChild(el('span', { class: 'lg-s' }, el('i', { class: 'ln', style: 'border-top-color:' + c }), el('span', { text: t('rp_s_best') })));
    if (bd != null) lg.appendChild(el('span', { class: 'lg-s' }, el('i', { class: 'ln dash', style: 'border-top-color:' + ink }), el('span', { text: t('rp_s_bound') })));
    var ch = chart('chartReplay'); if (!ch) return;
    var data = tl.map(function (p) { return { value: [Math.max(1, p.n), p.v] }; });
    if (N > data[data.length - 1].value[0]) data.push({ value: [N, lt.v], symbol: 'none' });
    var series = [{ name: t('rp_s_best'), type: 'line', step: 'end', data: data, symbol: 'circle', symbolSize: 7, showSymbol: true, z: 4,
      lineStyle: { width: 2, color: c }, itemStyle: { color: c, borderColor: surface, borderWidth: 1.5 }, emphasis: { scale: 1.4 } }];
    if (bd != null) {
      var gap = Math.max(0, bd - lt.v);
      series.push({ name: t('rp_s_bound'), type: 'line', data: [[1, bd], [N, bd]], symbol: 'none', silent: true, z: 3, lineStyle: { opacity: 0 }, tooltip: { show: false },
        markArea: gap >= 0.005 ? { silent: true, itemStyle: { color: c, opacity: 0.08 }, data: [[{ yAxis: lt.v }, { yAxis: bd }]] } : undefined,
        markLine: { silent: true, symbol: 'none', lineStyle: { color: ink, width: 1.5, type: 'dashed' }, label: { position: 'insideEndTop', color: A.css('--ink-2'), fontSize: 11, fontWeight: 600, formatter: gap >= (cents(bd) ? 0.005 : 0.5) ? t('rp_s_gap', { g: money(gap, bd) }) : t('rp_s_atBound') }, data: [{ yAxis: bd }] } });
    }
    ch.setOption({
      animation: false, grid: { left: 6, right: 18, top: 22, bottom: 34, containLabel: true },
      xAxis: Object.assign({ type: 'log', logBase: 10, min: 1, max: N, name: t('rp_s_axis'), nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: A.css('--muted'), fontSize: 11 } }, ax,
        { splitLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { formatter: function (x) { return A.n0(x); } }) }),
      yAxis: Object.assign({ type: 'value', scale: true }, ax, { axisLine: { show: false }, axisLabel: Object.assign({}, ax.axisLabel, { formatter: compact }) }),
      tooltip: Object.assign({ trigger: 'item', formatter: function (p) { var i = p.dataIndex; if (p.seriesIndex !== 0 || i >= tl.length) return ''; return esc(t('rp_s_tip', { n: A.n0(tl[i].n), v: money(tl[i].v, bd != null ? bd : tl[i].v) })); } }, tipStyle()),
      series: series
    }, true);
    S.drawn = 'search';
  }
  function renderFigs(s) {
    var box = $('rpFigs'), st = S.steps, v = S.view, P = v.P, H = P.H, T0 = st[0].T, f = [], E = A.eur, L = function (k, vars) { return esc(t(k, vars)); };
    var arrow = function (a, b) { return a === b ? b : a + ' → ' + b; }, bd, b0, b1;
    switch (s.kind) {
      case 'start':
        f.push([L('rp_f_reach'), s.T < 0 ? t('k_none') : (s.T >= H - 1 ? '≥ ' : '') + mon(s.T)]);
        if (s.sim.firstShort >= 0) { f.push([L('rp_f_first'), mon(s.sim.firstShort)]); f.push([L('rp_f_short'), E(s.sim.shortfall)]); }
        break;
      case 'probe':
        f.push([L('rp_f_asked'), mon(s.T)]);
        if (s.T != null && s.T > T0) f.push([L('rp_f_beyond'), '+' + months(s.T - T0)]);
        break;
      case 'wealthLP':
        if (num(s.obj) != null) f.push([A.term('lprel', t('rp_f_best')), money(s.obj), t('rp_f_bestSub')]);
        if (s.own) { b1 = termOf(s.plan); f.push([L('rp_f_tr'), A.n0(b1.n)]); f.push([L('rp_f_term'), termFmt(b1.avg)]); }
        break;
      case 'tieLP':
        bd = bound(s); if (bd != null) f.push([A.term('lprel', t('rp_f_best')), money(bd), t('rp_f_bestSub')]);
        if (s.own) { b0 = termOf(st[s.prev].plan); b1 = termOf(s.plan); f.push([L('rp_f_term'), arrow(termFmt(b0.avg), termFmt(b1.avg))]); f.push([L('rp_f_tr'), arrow(A.n0(b0.n), A.n0(b1.n))]); }
        break;
      case 'milp':
        bd = bound(s);
        if (s.ok && num(s.obj) != null) {
          f.push([L('rp_f_wealth'), money(s.obj, bd)]);
          if (bd != null) { var g = Math.max(0, bd - s.obj); f.push([A.term('lprel', t('rp_f_best')), money(bd)]); f.push([L('rp_f_gap'), money(g, bd), bd > 0 ? A.pct(100 * g / bd, 2) : null]); }
        } else if (bd != null) f.push([A.term('lprel', t('rp_f_best')), money(bd), t('rp_f_bestSub')]);
        if (s.own) f.push([L('rp_f_tr'), A.n0(termOf(s.plan).n)]);
        if (num(s.nodes) != null) f.push([L('rp_f_nodes'), A.n0(s.nodes)]);
        if (Array.isArray(s.trail) && s.trail.length) f.push([L('rp_f_impr'), A.n0(s.trail.length)]);
        break;
      case 'widen':
        if (!s.ok && num(s.obj) != null && s.obj > 0.005) f.push([L('rp_f_short2', { m: mon(s.T) }), E(s.obj)]);
        if (s.own) f.push([L('rp_f_tr'), A.n0(termOf(s.plan).n)]);
        if (num(s.nodes) != null) f.push([L('rp_f_nodes'), A.n0(s.nodes)]);
        break;
      case 'ask':
        if (s.own) f.push([L('rp_f_tr'), A.n0(termOf(s.plan).n)]);
        break;
      case 'back':
        f.push([L('rp_f_given'), mon(s.from)]); f.push([L('rp_f_target'), s.T > T0 ? mon(s.T) : mon(s.T) + ' · ' + t('rp_g_start')]);
        break;
      case 'tie':
        b0 = termOf(st[s.prev].plan); b1 = s.own ? termOf(s.plan) : b0;
        f.push([L('rp_f_term'), arrow(termFmt(b0.avg), termFmt(b1.avg))]); f.push([L('rp_f_tr'), arrow(A.n0(b0.n), A.n0(b1.n))]);
        if (num(s.nodes) != null) f.push([L('rp_f_nodes'), A.n0(s.nodes)]);
        break;
      case 'slack':
        var lp = num(s.slackLP) != null ? s.slackLP : num(s.obj);
        if (lp != null) f.push([A.term('slack', t('rp_f_slackLP')), E(lp), t('rp_f_slackSub')]);
        if (num(s.obj) != null && lp != null && s.obj > lp + 0.5) f.push([L('rp_f_slackReal'), E(s.obj)]);
        break;
      case 'verify':
        f.push([L('rp_f_reach'), s.T < 0 ? t('k_none') : (s.T >= H - 1 ? '≥ ' : '') + mon(s.T)]);
        if (num(v.res.wealth) != null) f.push([L('rp_f_wealth'), money(v.res.wealth)]);
        f.push([L('rp_f_newDep'), A.n0(termOf(v.res.placements).n)]);
        f.push([A.term('tstar', t('k_interest')), E(s.sim.interestToT)]);
        break;
    }
    box.innerHTML = '';
    f.forEach(function (x) { box.appendChild(el('div', { class: 'rp-fig' }, el('div', { class: 'lab', html: x[0] }), el('div', { class: 'val', text: x[1] }), x[2] ? el('div', { class: 'sub', text: x[2] }) : null)); });
  }
  function solverName(n) { return /^Eingebettet/.test(n || '') ? t('rp_emb') : (n || '–'); }
  function statusWord(kind, sk, st) {
    if (st === 'optimal') return t(kind === 'probe' ? 'rp_s_optimalP' : 'rp_s_optimal');
    if (st === 'feasible') return t(sk === 'ask' ? 'rp_s_feasibleA' : 'rp_s_feasible');
    if (st === 'infeasible') return t('rp_s_infeasible');
    if (st === 'unknown' || st == null) return t('rp_s_unknown');
    return String(st);
  }
  function mixText(mix, pre) { // "189 monthly balances, 16 tax years" from { b: 189, x: 16 }; zero counts are left out
    var out = [], other = 0, order = pre === 'r' ? 'bxmkw' : 'unyqz';
    Object.keys(mix || {}).forEach(function (k) { if (order.indexOf(k) < 0) other += +mix[k] || 0; });
    order.split('').forEach(function (k) { if (+(mix || {})[k] > 0) out.push(plural('rp_' + pre + '_' + k, +mix[k])); });
    if (other > 0) out.push(plural('rp_' + pre + '_other', other));
    return out.join(', ');
  }
  function renderHood(s) {
    var box = $('rpHood'), sv = Array.isArray(s.solves) ? s.solves.filter(Boolean) : [];
    box.innerHTML = ''; box.classList.remove('hide');
    box.appendChild(el('h3', { text: t('rp_h_title') }));
    if (s.kind === 'start' || s.kind === 'verify') { box.appendChild(el('p', { text: t('rp_h_sim') })); return; }
    if (!sv.length) { if (s.kind === 'back') box.appendChild(el('p', { text: t('rp_h_back') })); else box.classList.add('hide'); return; }
    // one block per kind of call (LP, search, yes/no question); repeated calls of one kind (bank caps added on demand) show the last
    var groups = [];
    sv.forEach(function (c) { var g = groups[groups.length - 1]; if (g && g.kind === c.kind && g.solver === c.solver) { g.n++; g.last = c; } else groups.push({ kind: c.kind, solver: c.solver, n: 1, last: c }); });
    groups.forEach(function (g) {
      var c = g.last, dl = el('dl', { class: 'rp-dl' }), row = function (k, v) { dl.appendChild(el('dt', { text: k })); dl.appendChild(el('dd', { text: v })); };
      if (groups.length > 1) box.appendChild(el('h4', { text: t('rp_k_' + c.kind) || c.kind }));
      row(t('rp_h_solver'), solverName(c.solver) + (groups.length > 1 ? '' : ' · ' + t('rp_k_' + c.kind)));
      if (num(c.rows) != null && num(c.cols) != null) row(t('rp_h_sizeL'), t('rp_h_sizeV', { r: A.n0(c.rows), c: A.n0(c.cols) }));
      var mr = mixText(c.mixR, 'r'), mc = mixText(c.mixC, 'c');
      if (mr) row(t('rp_h_rows'), mr);
      if (mc) row(t('rp_h_cols'), mc);
      if (c.kind !== 'ask') row(t('rp_h_pivots'), num(c.pivots) != null ? A.n0(c.pivots) : t(/highs/i.test(c.solver || '') ? 'rp_h_noPivots' : 'rp_h_noPivots2'));
      if (num(c.nodes) != null) row(t('rp_h_nodes'), A.n0(c.nodes));
      row(t('rp_h_status'), statusWord(s.kind, c.kind, c.status));
      if (g.n > 1) row(t('rp_h_calls'), t('rp_h_callsSub', { n: A.n0(g.n) }));
      box.appendChild(dl);
    });
    box.appendChild(el('p', { class: 'rp-expl', text: t('rp_h_explain') }));
  }
  function renderFoot() {
    var n = S.steps ? S.steps.length : 0, last = !n || S.i >= n - 1;
    $('rpBack').disabled = !n || S.i === 0;
    $('rpNext').textContent = last ? t('rp_finish') : t('w_next');
  }
  function lead() { var pid = A.state.presetId; return t('rp_lead', { p: LP.presetIds.indexOf(pid) >= 0 ? t('p_' + pid) : t('p_custom'), s: t('sc_' + A.state.rateScenario) }); }
  function render() {
    if (!S.on) return;
    if (S.view !== A.view || S.res !== (A.view && A.view.res)) { // a new result: build its steps (a result without a trace, or a broken one, gets the note instead)
      S.view = A.view; S.res = A.view && A.view.res; S.i = 0; S.mode = null; S.drawn = null;
      try { S.steps = A.view ? build(A.view) : null; } catch (e) { S.steps = null; }
    }
    var ok = !!(S.steps && S.steps.length), rp = $('replay');
    rp.classList.toggle('rp-empty', !ok); rp.classList.toggle('show-menu', ok && S.menu && narrow());
    $('rpMenu').setAttribute('aria-label', t('rp_menu'));
    $('rpLead').textContent = A.view ? lead() : '';
    $('rpNone').classList.toggle('hide', ok);
    S.w = window.innerWidth;
    renderFoot();
    if (!ok) return;
    var s = S.steps[S.i];
    renderMenu(); renderQ(s); renderStrip(s); renderVisual(s); renderHood(s);
    menuToCurrent();
  }
  function reveal() { // after a step change: bring the question into view when it has scrolled away
    if (S.menu && narrow()) return;
    var q = $('rpQ'), r = q.getBoundingClientRect(), bar = document.querySelector('.top'), top = bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0;
    if (r.top < top || r.top > window.innerHeight - 120) q.scrollIntoView({ block: 'start' });
  }
  function go(i, fromMenu) {
    if (!S.steps) return;
    S.i = Math.max(0, Math.min(S.steps.length - 1, i)); S.mode = null;
    render();
    if (fromMenu && narrow()) window.scrollTo(0, 0); else reveal();
  }

  // ---------- entering and leaving ----------
  function sync() { // the toolbar button (and the other entry points): label, state, what a click will do
    var b = $('btnReplay'); if (!b) return;
    var need = !A.view || !!A.stale, lab = b.querySelector('span'), key = S.on ? 'analysis' : 'rp_btn', name = S.on ? t('analysis') : t(need ? 'rp_btnRun' : 'rp_btn');
    lab.setAttribute('data-i18n', key); lab.textContent = t(key);
    b.disabled = !S.on && !hasData(A.state); // same condition as "Optimieren"
    if (S.on) b.removeAttribute('title'); else b.title = name;
    b.setAttribute('aria-label', name);
    var others = [$('btnReplayM')].concat(Array.prototype.slice.call(document.querySelectorAll('.rp-link')));
    others.forEach(function (n) { if (!n) return; if (need) n.title = t('rp_btnRun'); else n.removeAttribute('title'); });
  }
  function show() {
    if (!S.on) { S.y = window.pageYOffset || 0; S.on = true; }
    S.menu = false; S.i = 0; S.mode = null; S.drawn = null;
    $('app').classList.add('rp'); $('replay').classList.remove('hide');
    sync(); render(); window.scrollTo(0, 0);
    var ch = V.charts.chartReplay; if (ch) ch.resize();
    try { (narrow() ? $('rpQ') : $('rpTitle')).focus({ preventScroll: true }); } catch (e) { /* ignore */ } // phones show the step, not the title
    $('rpMenu').scrollTop = 0;
  }
  function close() {
    if (!S.on) return;
    S.on = false; S.menu = false;
    $('app').classList.remove('rp'); $('replay').classList.add('hide');
    sync(); A.resizeCharts();
    window.scrollTo(0, S.y);
    var a = document.activeElement, b = $('btnReplay'); // focus was on the page just hidden: back to the toolbar, as the handbook does
    if ((!a || a === document.body || $('replay').contains(a)) && b && b.offsetParent) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function open() {
    if (S.on) { go(0); return; }
    if (!hasData(A.state)) return;
    if (A.view && !A.stale && !A.busy) { show(); return; }
    A.run(); S.want = A.runId; // optimise first; runDone opens the page once the whole run has finished
  }
  function runDone(id) { // called by the pipeline after a run completed (not after a cancelled or failed one)
    if (S.want == null || S.want !== id) return;
    S.want = null;
    setTimeout(function () { if (A.runId === id && A.view && !A.stale && !A.busy && !S.on && !(A.wizard && A.wizard.open)) show(); }, 500); // after the progress dialog has closed
  }

  $('btnReplay').onclick = function () { if (S.on) close(); else open(); };
  $('btnReplayM').onclick = function () { open(); };
  $('rpBack').onclick = function () { go(S.i - 1); };
  $('rpNext').onclick = function () { if (!S.steps || S.i >= S.steps.length - 1) close(); else go(S.i + 1); };
  $('rpToMenu').onclick = function () {
    S.menu = true; render(); window.scrollTo(0, 0);
    var cur = $('rpStep' + S.i); if (cur && cur.getBoundingClientRect().bottom > window.innerHeight) cur.scrollIntoView({ block: 'center' });
  };
  $('rpSegSearch').onclick = function () { S.mode = 'search'; renderVisual(S.steps[S.i]); };
  $('rpSegPlan').onclick = function () { S.mode = 'plan'; renderVisual(S.steps[S.i]); };
  document.addEventListener('keydown', function (e) {
    if (!S.on || e.defaultPrevented || $('modal').classList.contains('open') || !$('runSheet').classList.contains('hide')) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !S.steps) return;
    var k = e.key, n = S.steps.length, tg = e.target;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
    if (tg && tg.closest && tg.closest('input, select, textarea, [contenteditable], [role="slider"], [role="listbox"], [role="menu"], [role="tablist"]')) return; // controls that use the arrows themselves
    e.preventDefault();
    var to = k === 'ArrowLeft' ? S.i - 1 : k === 'ArrowRight' ? S.i + 1 : k === 'Home' ? 0 : n - 1;
    if (to >= 0 && to < n && to !== S.i) { S.menu = false; go(to); }
  });
  var rz = null;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (S.on && window.innerWidth !== S.w) render(); }, 160); }); // the strip's labels and the phone list follow the width

  R.open = open; R.close = close; R.render = render; R.isOpen = function () { return S.on; }; R.sync = sync; R.runDone = runDone;
})();

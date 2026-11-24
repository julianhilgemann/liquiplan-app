/* ===== optimize.js: lexicographic optimisation (survival horizon first, then wealth, then shorter terms, then the shortfall) ===== */
(function (root) {
  'use strict';
  var LP = root.LP, MD = LP.model;

  function supportKeys(M, x, eps) {
    var cand = {}; M.meta.cands.forEach(function (c) { if (x[c.col] > (eps || 1e-6)) cand[c.t + '_' + c.k] = 1; }); return cand;
  }
  function eventMonths(P, T) {
    var ev = { 0: 1 }, t, i;
    P.existing.forEach(function (e) { for (i = 0; i <= P.lead; i++) if (e.t + i <= T) ev[e.t + i] = 1; });
    for (t = 0; t <= T; t++) if (P.oneIn[t] + P.extraIn[t] > 0) ev[t] = 1;
    return ev;
  }
  function addEvents(P, T, cand, ev) { for (var t in ev) for (var k = 0; k < P.products.length; k++) cand[t + '_' + k] = 1; return cand; }
  function addNeighbours(cand, T) {
    var out = {}; Object.keys(cand).forEach(function (key) { out[key] = 1; var p = key.split('_'), t = +p[0]; if (t > 0) out[(t - 1) + '_' + p[1]] = 1; if (t < T) out[(t + 1) + '_' + p[1]] = 1; }); return out;
  }
  // the months in which the money of a plan comes back (up to the safety lead later), with every product: where a plan
  // of few placements would place it again. Returns how many candidates were new.
  function addReturns(P, T, cand, M, x) {
    var n = 0;
    M.meta.cands.forEach(function (c) {
      if (!(x[c.col] > 0.5)) return;
      var m = c.t + P.products[c.k].term;
      for (var i = 0; i <= P.lead; i++) if (m + i <= T) for (var k = 0; k < P.products.length; k++) if (!cand[(m + i) + '_' + k]) { cand[(m + i) + '_' + k] = 1; n++; }
    });
    return n;
  }
  function addKeys(into, from) { for (var k in from) into[k] = 1; return into; }

  /* cfg: { integer:bool, loHint:int (months 0..loHint are feasible without new placements; -1 = unknown),
            timeScale:number, unlimited:bool (once the plan of the usual budgets stands, keep searching without one) }
     P.trancheCap = { on, max, left }: the plan may hold at most `left` new placements. */
  async function optimize(P, cfg, engine, progress) {
    cfg = cfg || {}; progress = progress || function () { };
    var ts = cfg.timeScale || 1, H = P.H, t0 = Date.now();
    var capN = P.trancheCap && P.trancheCap.on ? P.trancheCap.left : null; // new placements the plan may hold (null: any number)
    var lim = null; // the limit the integer models carry: none while the plan without a limit is worked out
    var out = { T: -1, TLP: -1, placements: [], integer: cfg.integer !== false, wealth: null, wealthLP: null, slack: null, slackLP: null, notes: [], stages: {}, solver: engine.active().name };
    /* Trace for the step-by-step view: one entry per decision, in order, with the solver calls made for it (the
       engine logs them). Pure bookkeeping: nothing in it is read back by the search. Plain data, it goes through
       postMessage. */
    out.trace = { v: 1, hint: cfg.loHint != null ? cfg.loHint : -1, steps: [] };
    engine.log = [];
    function mark(kind, T, o) {
      var s = { kind: kind, T: T, ok: null, status: null, obj: null, bound: null, trail: null, nodes: null, plan: null, solves: engine.log };
      engine.log = [];
      for (var f in o) if (o[f] !== undefined) s[f] = o[f];
      out.trace.steps.push(s);
    }
    var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
    var planOf = function (r, integer) { return MD.placementsOf(r.M, r.x, integer); };
    var milpStep = function (T, r, o) { mark('milp', T, Object.assign({ ok: isPlan(r), status: r.status, obj: num(r.obj), bound: wLP, trail: r.trail, nodes: r.nodes, plan: isPlan(r) ? planOf(r, true) : null }, o)); };
    var askStep = function (T, r) { var y = r.status === 'feasible'; mark('ask', T, { ok: y ? true : r.status === 'infeasible' ? false : null, status: r.status, plan: y ? planOf(r, true) : null }); };
    var capKeys = P.bankCap.on && P.bankCap.cap > 0 ? {} : null; // cap rows found violated so far (lazy constraints)
    // the dense embedded solver cannot carry many cap rows on a monthly grid: thin out the placement months for large models
    var K0 = P.products.length, grid = (capKeys && engine.active() === engine.embedded && H * K0 > 700) ? Math.ceil(H * K0 / 500) : 0, gridEv = eventMonths(P, H - 1);
    if (grid > 1) out.notes.push('grid_' + grid);
    function B(T, opt) { return function (nativeSemi) { return MD.buildModel(P, T, Object.assign({ nativeSemi: nativeSemi, capKeys: capKeys, grid: grid, gridEv: gridEv, maxNew: lim }, opt)); }; }
    async function lazy(kind, build, o) { // solve, add violated cap rows, repeat
      var r;
      for (var it = 0; it < 25; it++) {
        r = kind === 'lp' ? await engine.lp(build) : kind === 'ask' ? await engine.ask(build, o) : await engine.milp(build, o);
        if (!capKeys || !r.x || (r.status !== 'optimal' && r.status !== 'feasible')) return r;
        var viol = MD.capViolations(r.M, r.x);
        if (!viol.length) return r;
        viol.forEach(function (k) { capKeys[k] = 1; });
      }
      return { status: 'unknown', M: r.M };
    }
    var LPs = function (build) { return lazy('lp', build); }, MILPs = function (build, o) { return lazy('milp', build, o); }, ASK = function (build, share) { return lazy('ask', build, share); };
    var isPlan = function (r) { return r.status === 'optimal' || r.status === 'feasible'; }, anyPlan = function (T, cand) { return B(T, { obj: 'none', integer: true, allowBeyond: true, cand: cand }); };
    var asking = true, firstMiss = null; // the yes/no questions to HiGHS are rationed, see below

    // ----- stage 1: maximise T* by binary search on LP feasibility (monotone in T) -----
    var lo = Math.max(-1, Math.min(H - 1, cfg.loHint != null ? cfg.loHint : -1)), hi = H - 1, nLP = 0;
    async function feas(T) { nLP++; progress({ stage: 'search', T: T, lo: lo, hi: hi }); var r = await LPs(B(T, { obj: 'none', integer: false })); mark('probe', T, { ok: r.status === 'optimal', status: r.status }); return r.status === 'optimal'; }
    if (lo < hi) { // gallop upwards from the known-feasible month, then bisect
      var step = 1, top = H; // `top` = smallest month known to be infeasible (H = none inside the horizon)
      while (lo < H - 1) { var tt = Math.min(H - 1, lo + step); if (await feas(tt)) { lo = tt; step *= 2; } else { top = tt; break; } }
      hi = top;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (await feas(mid)) lo = mid; else hi = mid; }
    }
    out.TLP = lo; out.stages.searchLPs = nLP;
    if (lo < 0) { out.T = -1; out.ms = Date.now() - t0; out.solver = engine.active().name; return out; }

    var T = lo, plan = null, wLP = null, planX = null, planM = null, best2 = null, tie3 = null, cand = null;
    /* Local search for more wealth within the limit. One placement of the plan at a time is set free while the others
       stay in the plan, and a short search looks for a better plan with that one slot (the smallest amount times term
       first). After every gain it starts again; it ends when no slot gives one or its budget is used up
       (0.8 s on the work clock times `scale`). The gains are added to the trail of `best`, so it still ends at the plan returned. */
    async function swapOne(Tq, best, cnd, scale) {
      var spent = 0, budget = 0.8 * ts * scale, gain = true, nodes = best.nodes || 0, trail = (best.trail || []).slice();
      var o = { timeLimit: 2.5 * ts * scale, embTime: 0.12 * ts * scale, relGap: 1e-5, absGap: 0.05, rules: [['chronosemi', 'down', 0.6, 'drop'], ['chronosemi', 'down', 1, 'span']] };
      while (gain && spent < budget) {
        gain = false;
        var S = best.M.meta.cands.filter(function (c) { return best.x[c.col] > 0.5; })
          .sort(function (p, q) { return (best.x[p.col] * P.products[p.k].term - best.x[q.col] * P.products[q.k].term) || (p.col - q.col); }).map(function (c) { return c.t + '_' + c.k; });
        for (var i = 0; i < S.length && spent < budget; i++) {
          var inPlan = {}, w0 = LP.simplex.now();
          for (var j = 0; j < S.length; j++) if (j !== i) inPlan[S[j]] = 1;
          var r = await MILPs(B(Tq, { obj: 'wealth', integer: true, allowBeyond: true, cand: cnd, inPlan: inPlan }), Object.assign({ start: { M: best.M, x: best.x } }, o));
          spent += (LP.simplex.now() - w0) / 1000; nodes += r.nodes || 0;
          if (isPlan(r) && r.obj > best.obj + 0.005) {
            if (trail.length >= 300) trail.pop();
            trail.push({ n: nodes, v: r.obj });
            best = { status: 'feasible', M: r.M, x: r.x, obj: r.obj }; gain = true; break;
          }
        }
      }
      best.nodes = nodes; best.trail = trail;
      return best;
    }
    // stage 3 (MILP): among the plans with (nearly) the wealth of `m2`, the one that binds money for the shortest time; on the support of `m2`
    async function tieBreak(Tq, m2, more) {
      progress({ stage: 'tie', T: Tq });
      var sup = supportKeys(m2.M, m2.x, 0.5), tolM = Math.max(0.05, 1e-6 * Math.abs(m2.obj));
      var m3 = await MILPs(B(Tq, { obj: 'term', integer: true, allowBeyond: true, cand: sup, wealthMin: m2.obj - tolM }), Object.assign({ timeLimit: 1.5 * ts, embTime: 0.5, relGap: 1e-4, absGap: 1e-3 }, more));
      var acc = (m3.status === 'optimal' || m3.status === 'feasible') && MD.wealthOf(m3.M, m3.x) >= m2.obj - tolM - 1e-6;
      if (acc) { planM = m3.M; planX = m3.x; out.stages.milp3 = m3.status; out.wealth = MD.wealthOf(m3.M, m3.x); }
      mark('tie', Tq, { ok: acc, status: m3.status, trail: m3.trail, nodes: m3.nodes, plan: acc ? planOf(m3, true) : null, more: more && more.more ? more.more : undefined });
      return m3;
    }
    while (true) {
      // ----- stage 2 (LP bound): maximise wealth at T -----
      progress({ stage: 'wealthLP', T: T });
      var r2 = await LPs(B(T, { obj: 'wealth', integer: false, allowBeyond: true }));
      mark('wealthLP', T, { status: r2.status, obj: r2.status === 'optimal' ? num(r2.obj) : null, plan: r2.status === 'optimal' ? planOf(r2, false) : null });
      if (r2.status !== 'optimal') {
        if (engine.active() === engine.embedded && grid < 12) { grid = grid > 1 ? grid * 2 : 3; out.notes.push('grid_' + grid); continue; } // too large: retry on a coarser placement grid
        out.notes.push('lp_stage2_failed'); break;
      }
      wLP = r2.obj;
      // ----- stage 3 (LP): among wealth-optimal plans prefer short terms -----
      progress({ stage: 'tieLP', T: T });
      var tolLP = Math.max(0.01, 1e-7 * Math.abs(r2.obj));
      var r3 = await LPs(B(T, { obj: 'term', integer: false, allowBeyond: true, wealthMin: r2.obj - tolLP }));
      mark('tieLP', T, { status: r3.status, plan: r3.status === 'optimal' ? planOf(r3, false) : null });
      var lpM = r3.status === 'optimal' ? r3.M : r2.M, lpX = r3.status === 'optimal' ? r3.x : r2.x;
      if (out.integer === false) { plan = MD.placementsOf(lpM, lpX, false); out.wealth = r2.obj; break; }
      // ----- MILP near T*: denominations and minimum amounts on the LP-guided candidate set -----
      cand = addEvents(P, T, supportKeys(lpM, lpX), eventMonths(P, T));
      var s2 = supportKeys(r2.M, r2.x); for (var k2 in s2) cand[k2] = 1;
      progress({ stage: 'milp', T: T, cands: Object.keys(cand).length });
      var mopt = { timeLimit: 2.5 * ts, relGap: 1e-5, absGap: 0.05 };
      var m2 = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: cand }), mopt);
      milpStep(T, m2);
      if (!isPlan(m2)) {
        /* The search found no plan for month T. Unless it proved that there is none, that is not a "no": its budget
           may simply have run out.
           With HiGHS: the first such month is given up without further ado, because it usually is out of reach and
           proving that can take HiGHS long. If the search then fails again one month lower, it is the search that is
           failing, not the months: now the yes/no question is put directly, first for the month given up, then for
           this one. A "yes" comes with a plan, and the month given up is taken back.
           Without HiGHS: the embedded search minimises the shortfall of month T on a slightly wider candidate set. */
        progress({ stage: 'milp2', T: T });
        out.stages.widened = true;
        var found = null, exact = false, ex = null;
        if (engine.canAsk()) {
          if (m2.status === 'unknown' && asking) {
            if (!firstMiss) firstMiss = { T: T, cand: cand, wLP: wLP };
            else {
              ex = await ASK(anyPlan(firstMiss.T, firstMiss.cand));
              askStep(firstMiss.T, ex);
              if (ex.status === 'feasible') { // the month given up is reachable after all: go back to it
                T = firstMiss.T; cand = firstMiss.cand; wLP = firstMiss.wLP;
                out.notes = out.notes.filter(function (n) { return n !== 'milp_timeout_at_' + T; });
                out.stages.conservative = T < out.TLP;
              } else { ex = await ASK(anyPlan(T, cand)); askStep(T, ex); }
              asking = false; // two questions per run at most
              out.stages.asked = true;
              if (ex.status === 'feasible') { found = ex; exact = true; } else if (ex.status === 'infeasible') m2 = { status: 'infeasible' };
            }
          }
        } else {
          var rs = await LPs(B(T, { obj: 'slack', integer: false })), cs = addNeighbours(cand, T);
          if (rs.status === 'optimal') { var ss = supportKeys(rs.M, rs.x); for (var k3 in ss) cs[k3] = 1; }
          var ms = await MILPs(B(T, { obj: 'slack', integer: true, allowBeyond: true, cand: cs }), { timeLimit: 2.5 * ts, relGap: 1e-6, absGap: 1e-4 });
          if (isPlan(ms) && ms.obj <= 0.004) found = ms; else if (ms.status === 'optimal') m2 = { status: 'infeasible' };
          mark('widen', T, { ok: !!found, status: ms.status, obj: num(ms.obj), nodes: ms.nodes, plan: found ? planOf(ms, true) : null });
        }
        if (found) { // a plan that reaches month T exists: now look for a good one, starting from it
          var sup2 = supportKeys(found.M, found.x, 0.5), cu = {}, kk, seed = { M: found.M, x: found.x };
          for (kk in cand) cu[kk] = 1; for (kk in sup2) cu[kk] = 1;
          m2 = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: cu }), Object.assign({ start: seed }, mopt));
          if (!isPlan(m2)) m2 = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: sup2 }), { timeLimit: 1.5 * ts, relGap: 1e-5, absGap: 0.05, start: seed });
          if (!isPlan(m2) && exact) m2 = { status: 'feasible', M: found.M, x: found.x, obj: MD.wealthOf(found.M, found.x) }; // the answer itself is a valid plan
          milpStep(T, m2, { seeded: true }); // both searches in one step; it carries the plan kept (no trail if that is the answer itself)
        }
      }
      if (isPlan(m2)) {
        out.wealth = m2.obj; out.stages.milp2 = m2.status; planM = m2.M; planX = m2.x; best2 = m2;
        tie3 = await tieBreak(T, m2); // ----- stage 3 (MILP): tie-break on the support of the incumbent -----
        plan = MD.placementsOf(planM, planX, true);
        break;
      }
      out.notes.push(m2.status === 'infeasible' ? 'milp_infeasible_at_' + T : 'milp_timeout_at_' + T);
      out.stages.conservative = true;
      T--;
      mark('back', T, { from: T + 1 });
      if (T <= Math.max(-1, cfg.loHint != null ? cfg.loHint : -1)) { plan = []; out.wealth = null; break; }
    }
    if (plan == null) { // LP stage failed unexpectedly: fall back to the hint (no new placements)
      var Tf = T; T = Math.max(-1, cfg.loHint != null ? cfg.loHint : -1); plan = [];
      if (T !== Tf) mark('back', T, { from: Tf });
    }
    if (capN != null && plan.length > capN) {
      /* ----- the plan holds more new placements than allowed: the search with the limit -----
         Had the plan kept the limit, it would stand as it is: a limit that does not bind changes nothing.
         A relaxation cannot count placements, so the month the limit allows is looked for with integer plans: the
         month of the plan above first, then by halving the gap down to the month that needs no new placement at all
         (a plan for a month also is a plan for every month before it). */
      var topT = T, candTop = cand, wTop = wLP;
      out.free = { T: T, n: plan.length, wealth: out.wealth }; // what the limit is measured against
      mark('limit', T, { n: plan.length, max: capN, obj: num(out.wealth), plan: plan });
      lim = capN; plan = null; planM = planX = best2 = tie3 = null; out.wealth = null; delete out.stages.milp2; delete out.stages.milp3;
      var hint = Math.max(-1, Math.min(topT, cfg.loHint != null ? cfg.loHint : -1)), keep = {}, known = null, zero = { M: { byName: {} }, x: [] };
      var capOpt = { timeLimit: 1.5 * ts, embTime: 1.5 * ts, relGap: 1e-5, absGap: 0.05, first: true, greedy: [8] };
      /* Any integer plan up to month Tq within the limit? On the candidates of stage 2 alone: more of them make the
         search slower and no better at finding a plan. What the plans found here teach (their placements, and the months
         in which their money comes back) is kept for the wealth search below. */
      var capAsk = async function (Tq) {
        progress({ stage: 'cap', T: Tq });
        var c = null, m = { status: 'unknown' };
        if (Tq === topT && candTop) c = addKeys({}, candTop);
        else { var rl = await LPs(B(Tq, { obj: 'wealth', integer: false, allowBeyond: true })); if (rl.status === 'optimal') c = addEvents(P, Tq, supportKeys(rl.M, rl.x), eventMonths(P, Tq)); }
        if (c) {
          m = await MILPs(B(Tq, { obj: 'wealth', integer: true, allowBeyond: true, cand: c }), capOpt);
          if (isPlan(m)) { addKeys(keep, supportKeys(m.M, m.x, 0.5)); addReturns(P, H - 1, keep, m.M, m.x); }
        }
        mark('cap', Tq, { ok: isPlan(m) ? true : m.status === 'infeasible' ? false : null, status: m.status, nodes: m.nodes, plan: isPlan(m) ? planOf(m, true) : null });
        return m;
      };
      var Tc = hint, top = topT + 1, miss = null; // `top`: the earliest month for which no plan within the limit turned up
      if (capN > 0 && topT > hint) {
        var a = await capAsk(topT);
        if (isPlan(a)) { Tc = topT; known = a; }
        else {
          top = topT; miss = a.status;
          while (top - Tc > 1) { var mc = (Tc + top) >> 1; a = await capAsk(mc); if (isPlan(a)) { Tc = mc; known = a; } else { top = mc; miss = a.status; } }
        }
      }
      if (Tc < topT) { out.notes.push((capN === 0 ? 'cap_zero_at_' : miss === 'infeasible' ? 'cap_infeasible_at_' : 'cap_timeout_at_') + (Tc + 1)); mark('back', Tc, { from: topT, limit: true }); }
      T = Tc; wLP = null; cand = null;
      if (T >= 0 && capN > 0) {
        // ----- stages 2 and 3 for month T: the best case without the limit (known already for the month of the plan above), then the best plan found within it -----
        if (T === topT && candTop) { cand = addKeys({}, candTop); wLP = wTop; }
        else {
          progress({ stage: 'wealthLP', T: T });
          var q2 = await LPs(B(T, { obj: 'wealth', integer: false, allowBeyond: true }));
          mark('wealthLP', T, { status: q2.status, obj: q2.status === 'optimal' ? num(q2.obj) : null, plan: q2.status === 'optimal' ? planOf(q2, false) : null });
          if (q2.status === 'optimal') {
            wLP = q2.obj;
            progress({ stage: 'tieLP', T: T });
            var q3 = await LPs(B(T, { obj: 'term', integer: false, allowBeyond: true, wealthMin: q2.obj - Math.max(0.01, 1e-7 * Math.abs(q2.obj)) }));
            mark('tieLP', T, { status: q3.status, plan: q3.status === 'optimal' ? planOf(q3, false) : null });
            cand = addEvents(P, T, supportKeys(q2.M, q2.x), eventMonths(P, T));
            if (q3.status === 'optimal') addKeys(cand, supportKeys(q3.M, q3.x));
          } else out.notes.push('lp_stage2_failed');
        }
        if (cand) {
          addKeys(cand, keep);
          progress({ stage: 'milp', T: T, cands: Object.keys(cand).length });
          var wopt = { timeLimit: 2.5 * ts, embTime: 2 * ts, relGap: 1e-5, absGap: 0.05, greedy: [8, 16] };
          var w2 = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: cand }), Object.assign({ start: known || zero }, wopt));
          if (!isPlan(w2) && known) w2 = { status: 'feasible', M: known.M, x: known.x, obj: MD.wealthOf(known.M, known.x) }; // the answer to the question above is a valid plan
          // where the money of this plan comes back it could be placed again: add those months and search on from the plan (twice at most)
          for (var again = 0; again < 2 && isPlan(w2); again++) {
            var c2 = addKeys({}, cand);
            if (!addReturns(P, T, c2, w2.M, w2.x)) break;
            cand = c2;
            var wb = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: cand }), Object.assign({}, wopt, { embTime: ts, start: { M: w2.M, x: w2.x } }));
            if (!isPlan(wb) || !(wb.obj > w2.obj + 0.005)) break;
            w2 = wb;
          }
          if (isPlan(w2) && w2.status !== 'optimal') w2 = await swapOne(T, w2, cand, 1);
          mark('milp', T, { ok: isPlan(w2), status: w2.status, obj: num(w2.obj), bound: wLP, trail: w2.trail, nodes: w2.nodes, plan: isPlan(w2) ? planOf(w2, true) : null, limit: true });
          if (isPlan(w2)) {
            out.wealth = w2.obj; out.stages.milp2 = w2.status; planM = w2.M; planX = w2.x; best2 = w2;
            tie3 = await tieBreak(T, w2);
            plan = MD.placementsOf(planM, planX, true);
          }
        }
      }
      if (plan == null) { plan = []; out.wealth = null; }
    }
    out.T = T; out.placements = plan; out.wealthLP = wLP;

    // ----- stage 4: minimal slack (shortfall) of the first month after T* -----
    async function shortfall() {
      out.slack = null; out.slackLP = null; delete out.stages.milp4;
      if (T + 1 > H - 1) return;
      progress({ stage: 'slack', T: T + 1 });
      var r4 = await LPs(B(T + 1, { obj: 'slack', integer: false })), m4 = null;
      if (r4.status === 'optimal') {
        out.slackLP = Math.max(0, r4.obj);
        out.slack = out.slackLP;
        if (out.integer !== false) {
          var c4 = addEvents(P, T + 1, supportKeys(r4.M, r4.x), eventMonths(P, T + 1));
          if (planM) { var sp = supportKeys(planM, planX, 0.5); for (var key in sp) { var pp = key.split('_'); if (+pp[0] + P.products[+pp[1]].term + P.lead <= T + 1) c4[key] = 1; } }
          m4 = await MILPs(B(T + 1, { obj: 'slack', integer: true, cand: c4 }), { timeLimit: 1.2 * ts, embTime: 0.5, relGap: 1e-3, absGap: 0.5 });
          if (m4.status === 'optimal' || m4.status === 'feasible') { out.slack = Math.max(out.slackLP, m4.obj); out.stages.milp4 = m4.status; }
        }
      }
      mark('slack', T + 1, { slackLP: out.slackLP, obj: out.slack, status: m4 ? m4.status : r4.status });
    }
    await shortfall();

    /* ----- without a time limit -----
       The plan above is the one the usual budgets give, and the page is told so ('interim'): it can be kept at any
       moment. Then the search goes on in rounds, each with four times the budget of the one before: for a later month
       (one at a time, as long as a plan turns up), for more wealth in the month reached, for shorter terms at that
       wealth. A part whose search was completed is settled and is not repeated. The rounds end when every part is
       settled; until then every better plan is reported as it is found. The budgets stay on the work clock, so the
       plan after a given round is the same on every machine. */
    if (cfg.unlimited && out.integer !== false) {
      out.ms = Date.now() - t0; out.solver = engine.active().name; out.engine = engine.stats;
      progress({ stage: 'more', T: T, note: 'interim', result: out });
      var moved = false, lastTick = 0, noteNo = lim != null ? 'cap_infeasible_at_' : 'milp_infeasible_at_', noteOpen = lim != null ? 'cap_timeout_at_' : 'milp_timeout_at_';
      var live = function (part, Tq, round) {
        return {
          onBetter: function (M, x, obj, nodes) { if (capKeys && MD.capViolations(M, x).length) return; progress({ stage: 'more', part: part, round: round, T: Tq, note: 'better', plan: MD.placementsOf(M, x, true), wealth: MD.wealthOf(M, x), nodes: nodes }); },
          onTick: function (nodes) { var nowMs = Date.now(); if (nowMs - lastTick < 400) return; lastTick = nowMs; progress({ stage: 'more', part: part, round: round, T: Tq, note: 'tick', nodes: nodes }); } // real time only spaces the messages
        };
      };
      for (var round = 1, mult = 4; ; round++, mult *= 4) {
        var open = false, redo = false;
        while (T < out.TLP) { // (1) a later month
          var Tn = T + 1;
          if (out.notes.indexOf('milp_infeasible_at_' + Tn) >= 0 || out.notes.indexOf('cap_infeasible_at_' + Tn) >= 0 || out.notes.indexOf('cap_zero_at_' + Tn) >= 0) break; // shown to be out of reach
          progress({ stage: 'more', part: 'month', round: round, T: Tn });
          var rn = await LPs(B(Tn, { obj: 'wealth', integer: false, allowBeyond: true }));
          if (rn.status !== 'optimal') break;
          var cn = addEvents(P, Tn, supportKeys(rn.M, rn.x), eventMonths(P, Tn));
          if (planM) { addKeys(cn, supportKeys(planM, planX, 0.5)); addReturns(P, Tn, cn, planM, planX); }
          var mn = await MILPs(B(Tn, { obj: 'wealth', integer: true, allowBeyond: true, cand: cn }), Object.assign({ timeLimit: 1.5 * ts * mult, embTime: 1.5 * ts * mult, relGap: 1e-5, absGap: 0.05, first: true, greedy: [8, 16] }, live('month', Tn, round)));
          mark('milp', Tn, { ok: isPlan(mn), status: mn.status, obj: num(mn.obj), bound: rn.obj, trail: mn.trail, nodes: mn.nodes, plan: isPlan(mn) ? planOf(mn, true) : null, more: round, climb: true, limit: lim != null ? true : undefined });
          out.notes = out.notes.filter(function (n) { return n !== 'milp_timeout_at_' + Tn && n !== 'cap_timeout_at_' + Tn; });
          if (!isPlan(mn)) { if (mn.status === 'infeasible') out.notes.push(noteNo + Tn); else { out.notes.push(noteOpen + Tn); open = true; } break; }
          T = Tn; moved = redo = true; planM = mn.M; planX = mn.x; best2 = mn; tie3 = null; wLP = rn.obj; cand = cn; out.wealth = mn.obj; out.stages.milp2 = 'feasible'; delete out.stages.milp3;
        }
        if (best2 && cand) {
          if (redo || best2.status !== 'optimal') { // (2) more wealth in month T, starting from the best plan so far
            progress({ stage: 'more', part: 'wealth', round: round, T: T });
            addKeys(cand, supportKeys(best2.M, best2.x, 0.5));
            var mw = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: cand }), Object.assign({ timeLimit: 2 * ts * mult, embTime: 2 * ts * mult, relGap: 1e-5, absGap: 0.05, greedy: [8, 16], start: { M: best2.M, x: best2.x } }, live('wealth', T, round)));
            if (lim != null && isPlan(mw) && mw.status !== 'optimal') mw = await swapOne(T, mw, cand, mult);
            var gain = isPlan(mw) && mw.obj > best2.obj + 0.005;
            mark('milp', T, { ok: isPlan(mw), status: mw.status, obj: num(mw.obj), bound: wLP, trail: mw.trail, nodes: mw.nodes, plan: isPlan(mw) ? planOf(mw, true) : null, more: round, limit: lim != null ? true : undefined });
            if (isPlan(mw)) {
              if (gain || redo) { planM = mw.M; planX = mw.x; best2 = mw; tie3 = null; out.wealth = mw.obj; delete out.stages.milp3; }
              else best2 = { status: mw.status, M: best2.M, x: best2.x, obj: best2.obj }; // the same wealth: the plan stays, what is known about it may have changed
              out.stages.milp2 = mw.status;
            }
            if (!isPlan(mw) || mw.status !== 'optimal') open = true;
          }
          if (!tie3 || tie3.status !== 'optimal') { // (3) shorter terms at that wealth
            progress({ stage: 'more', part: 'tie', round: round, T: T });
            tie3 = await tieBreak(T, best2, Object.assign({ timeLimit: 0.5 * ts * mult, embTime: 0.5 * ts * mult, start: { M: planM, x: planX }, more: round }, live('tie', T, round)));
            if (tie3.status !== 'optimal') open = true;
          }
          plan = MD.placementsOf(planM, planX, true);
        }
        out.T = T; out.placements = plan; out.wealthLP = wLP;
        if (!open) break;
      }
      if (T >= out.TLP) out.stages.conservative = false;
      if (moved) await shortfall();
      out.stages.unlimited = 'complete';
    }
    out.ms = Date.now() - t0; out.solver = engine.active().name; out.engine = engine.stats;
    return out;
  }

  LP.solve.optimize = optimize;
})(typeof self !== 'undefined' ? self : globalThis);

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

  /* cfg: { integer:bool, loHint:int (months 0..loHint are feasible without new placements; -1 = unknown),
            timeScale:number, deadline?:ms }  */
  async function optimize(P, cfg, engine, progress) {
    cfg = cfg || {}; progress = progress || function () { };
    var ts = cfg.timeScale || 1, H = P.H, t0 = Date.now();
    var out = { T: -1, TLP: -1, placements: [], integer: cfg.integer !== false, wealth: null, wealthLP: null, slack: null, slackLP: null, notes: [], stages: {}, solver: engine.active().name };
    var capKeys = P.bankCap.on && P.bankCap.cap > 0 ? {} : null; // cap rows found violated so far (lazy constraints)
    // the dense embedded solver cannot carry many cap rows on a monthly grid: thin out the placement months for large models
    var K0 = P.products.length, grid = (capKeys && engine.active() === engine.embedded && H * K0 > 700) ? Math.ceil(H * K0 / 500) : 0, gridEv = eventMonths(P, H - 1);
    if (grid > 1) out.notes.push('grid_' + grid);
    function B(T, opt) { return function (nativeSemi) { return MD.buildModel(P, T, Object.assign({ nativeSemi: nativeSemi, capKeys: capKeys, grid: grid, gridEv: gridEv }, opt)); }; }
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
    async function feas(T) { nLP++; progress({ stage: 'search', T: T, lo: lo, hi: hi }); var r = await LPs(B(T, { obj: 'none', integer: false })); return r.status === 'optimal'; }
    if (lo < hi) { // gallop upwards from the known-feasible month, then bisect
      var step = 1, top = H; // `top` = smallest month known to be infeasible (H = none inside the horizon)
      while (lo < H - 1) { var tt = Math.min(H - 1, lo + step); if (await feas(tt)) { lo = tt; step *= 2; } else { top = tt; break; } }
      hi = top;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (await feas(mid)) lo = mid; else hi = mid; }
    }
    out.TLP = lo; out.stages.searchLPs = nLP;
    if (lo < 0) { out.T = -1; out.ms = Date.now() - t0; out.solver = engine.active().name; return out; }

    var T = lo, plan = null, wLP = null, planX = null, planM = null;
    while (true) {
      // ----- stage 2 (LP bound): maximise wealth at T -----
      progress({ stage: 'wealthLP', T: T });
      var r2 = await LPs(B(T, { obj: 'wealth', integer: false, allowBeyond: true }));
      if (r2.status !== 'optimal') {
        if (engine.active() === engine.embedded && grid < 12) { grid = grid > 1 ? grid * 2 : 3; out.notes.push('grid_' + grid); continue; } // too large: retry on a coarser placement grid
        out.notes.push('lp_stage2_failed'); break;
      }
      wLP = r2.obj;
      // ----- stage 3 (LP): among wealth-optimal plans prefer short terms -----
      progress({ stage: 'tieLP', T: T });
      var tolLP = Math.max(0.01, 1e-7 * Math.abs(r2.obj));
      var r3 = await LPs(B(T, { obj: 'term', integer: false, allowBeyond: true, wealthMin: r2.obj - tolLP }));
      var lpM = r3.status === 'optimal' ? r3.M : r2.M, lpX = r3.status === 'optimal' ? r3.x : r2.x;
      if (out.integer === false) { plan = MD.placementsOf(lpM, lpX, false); out.wealth = r2.obj; break; }
      // ----- MILP near T*: denominations and minimum amounts on the LP-guided candidate set -----
      var cand = addEvents(P, T, supportKeys(lpM, lpX), eventMonths(P, T));
      var s2 = supportKeys(r2.M, r2.x); for (var k2 in s2) cand[k2] = 1;
      progress({ stage: 'milp', T: T, cands: Object.keys(cand).length });
      var mopt = { timeLimit: 2.5 * ts, relGap: 1e-5, absGap: 0.05 };
      var m2 = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: cand }), mopt);
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
              if (ex.status === 'feasible') { // the month given up is reachable after all: go back to it
                T = firstMiss.T; cand = firstMiss.cand; wLP = firstMiss.wLP;
                out.notes = out.notes.filter(function (n) { return n !== 'milp_timeout_at_' + T; });
                out.stages.conservative = T < out.TLP;
              } else ex = await ASK(anyPlan(T, cand));
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
        }
        if (found) { // a plan that reaches month T exists: now look for a good one, starting from it
          var sup2 = supportKeys(found.M, found.x, 0.5), cu = {}, kk, seed = { M: found.M, x: found.x };
          for (kk in cand) cu[kk] = 1; for (kk in sup2) cu[kk] = 1;
          m2 = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: cu }), Object.assign({ start: seed }, mopt));
          if (!isPlan(m2)) m2 = await MILPs(B(T, { obj: 'wealth', integer: true, allowBeyond: true, cand: sup2 }), { timeLimit: 1.5 * ts, relGap: 1e-5, absGap: 0.05, start: seed });
          if (!isPlan(m2) && exact) m2 = { status: 'feasible', M: found.M, x: found.x, obj: MD.wealthOf(found.M, found.x) }; // the answer itself is a valid plan
        }
      }
      if (isPlan(m2)) {
        out.wealth = m2.obj; out.stages.milp2 = m2.status; planM = m2.M; planX = m2.x;
        // ----- stage 3 (MILP): tie-break on the support of the incumbent -----
        progress({ stage: 'tie', T: T });
        var sup = supportKeys(m2.M, m2.x, 0.5), tolM = Math.max(0.05, 1e-6 * Math.abs(m2.obj));
        var m3 = await MILPs(B(T, { obj: 'term', integer: true, allowBeyond: true, cand: sup, wealthMin: m2.obj - tolM }), { timeLimit: 1.5 * ts, embTime: 0.5, relGap: 1e-4, absGap: 1e-3 });
        if ((m3.status === 'optimal' || m3.status === 'feasible') && MD.wealthOf(m3.M, m3.x) >= m2.obj - tolM - 1e-6) { planM = m3.M; planX = m3.x; out.stages.milp3 = m3.status; out.wealth = MD.wealthOf(m3.M, m3.x); }
        plan = MD.placementsOf(planM, planX, true);
        break;
      }
      out.notes.push(m2.status === 'infeasible' ? 'milp_infeasible_at_' + T : 'milp_timeout_at_' + T);
      out.stages.conservative = true;
      T--;
      if (T <= Math.max(-1, cfg.loHint != null ? cfg.loHint : -1)) { plan = []; out.wealth = null; break; }
    }
    if (plan == null) { // LP stage failed unexpectedly: fall back to the hint (no new placements)
      T = Math.max(-1, cfg.loHint != null ? cfg.loHint : -1); plan = [];
    }
    out.T = T; out.placements = plan; out.wealthLP = wLP;

    // ----- stage 4: minimal slack (shortfall) of the first month after T* -----
    if (T + 1 <= H - 1) {
      progress({ stage: 'slack', T: T + 1 });
      var r4 = await LPs(B(T + 1, { obj: 'slack', integer: false }));
      if (r4.status === 'optimal') {
        out.slackLP = Math.max(0, r4.obj);
        out.slack = out.slackLP;
        if (out.integer !== false) {
          var c4 = addEvents(P, T + 1, supportKeys(r4.M, r4.x), eventMonths(P, T + 1));
          if (planM) { var sp = supportKeys(planM, planX, 0.5); for (var key in sp) { var pp = key.split('_'); if (+pp[0] + P.products[+pp[1]].term + P.lead <= T + 1) c4[key] = 1; } }
          var m4 = await MILPs(B(T + 1, { obj: 'slack', integer: true, cand: c4 }), { timeLimit: 1.2 * ts, embTime: 0.5, relGap: 1e-3, absGap: 0.5 });
          if (m4.status === 'optimal' || m4.status === 'feasible') { out.slack = Math.max(out.slackLP, m4.obj); out.stages.milp4 = m4.status; }
        }
      }
    }
    out.ms = Date.now() - t0; out.solver = engine.active().name; out.engine = engine.stats;
    return out;
  }

  LP.solve.optimize = optimize;
})(typeof self !== 'undefined' ? self : globalThis);

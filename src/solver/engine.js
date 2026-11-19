/* ===== engine.js: which backend answers which question =====
   Nothing here is limited by the wall clock, so the same inputs give the same plan on every machine:
   - LPs go to the first backend that loaded. They have one exact answer.
   - Integer problems with an objective go to the embedded branch-and-bound, whose limits run on the work clock of
     simplex.js. HiGHS is not used for them: it hands over its best plan so far only when it stops on a time limit.
   - Yes/no questions ("is there any integer plan up to month T?") go to HiGHS when the search finds nothing. Without
     an objective the first plan it finds is optimal, so it stops there and hands it over. Its limit is a number of
     clock reads (onTickClock in backends.js), not seconds. */
(function (root) {
  'use strict';
  var LP = root.LP, EmbeddedBackend = LP.solve.EmbeddedBackend;

  /* `primary` is the first backend of the chain HiGHS -> javascript-lp-solver that could be loaded (or null); it
     solves the LPs. The embedded solver is always present: it is the last resort for LPs, the second opinion for
     untrusted answers, and the only solver for the integer problems. */
  function Engine(primary, hooks) {
    this.primary = primary || null; this.embedded = new EmbeddedBackend(); this.hooks = hooks || {};
    this.stats = { lp: 0, milp: 0, fallbacks: 0, by: {} }; this.dead = null;
  }
  Engine.prototype.active = function () { return this.primary && !this.dead ? this.primary : this.embedded; };
  Engine.prototype.note = function (name) { this.stats.by[name] = (this.stats.by[name] || 0) + 1; };
  Engine.prototype.beat = function (name, budgetMs) { if (this.hooks.beat) this.hooks.beat(name, budgetMs); };
  Engine.prototype.fail = async function (b, e) {
    if (b.reset && (b.crashes = (b.crashes || 0) + 1) < 3) { try { await b.reset(); return; } catch (e2) { /* fall through */ } }
    this.dead = 'crash'; if (this.hooks.demoted) this.hooks.demoted(b.name, 'crash', String(e && e.message || e));
  };
  Engine.prototype.lp = async function (build) {
    this.stats.lp++;
    var b = this.active(), r, M;
    if (b !== this.embedded) {
      M = build(b.nativeSemi);
      this.beat(b.name, b.lpBudget || 30000);
      try { r = b.lp(M); } catch (e) { r = { status: 'unknown' }; await this.fail(b, e); }
      if (r.status === 'optimal' && r.needsOptCheck && M.cols.some(function (c) { return c.obj; })) {
        // untrusted optimum: accept only if the embedded solver agrees on the objective value
        var Me = build(true); this.beat(this.embedded.name, 240000); var e3 = this.embedded.lp(Me);
        if (e3.status === 'optimal' && Math.abs(e3.obj - r.obj) <= 1e-6 * (1 + Math.abs(e3.obj))) { this.note(b.name); r.M = M; return r; }
        b.rejected++; this.stats.fallbacks++; this.note(this.embedded.name); e3.M = Me; r = e3; M = Me;
      } else if (r.status === 'optimal' || r.status === 'infeasible' || r.status === 'unbounded') { this.note(b.name); r.M = M; }
      else { this.stats.fallbacks++; r = null; }
      if (b.rejected >= 2 && !this.dead) { this.dead = 'unreliable'; if (this.hooks.demoted) this.hooks.demoted(b.name, 'unreliable', ''); }
      if (r) return r;
    }
    M = build(true); this.beat(this.embedded.name, 240000);
    r = this.embedded.lp(M); r.M = M; this.note(this.embedded.name);
    return r;
  };
  /* Integer problems: embedded branch-and-bound for `timeLimit` seconds on the work clock (capped by `embTime`).
     The outcome depends on the model alone, not on the machine. 'unknown' means the budget ran out without a plan.
     o.start = { M, x }: a plan of another model of the same scenario to begin with (columns are matched by name). */
  Engine.prototype.milp = async function (build, o) {
    this.stats.milp++;
    o = o || {};
    var M = build(true), te = Math.min(o.timeLimit || 4, o.embTime || 1.2), start = null;
    if (o.start) { start = new Float64Array(M.cols.length); for (var j = 0; j < M.cols.length; j++) { var from = o.start.M.byName[M.cols[j].name]; start[j] = from != null ? o.start.x[from] : 0; } }
    this.beat(this.embedded.name, te * 30000 + 30000); // real-time watchdog only: generous, so that a slow device is not mistaken for a hang
    var e = this.embedded.milp(M, { timeLimit: te, relGap: o.relGap, absGap: o.absGap, start: start }); e.M = M;
    if (e.status === 'optimal' || e.status === 'feasible') { this.note(this.embedded.name); return e; }
    return { status: e.status === 'infeasible' ? 'infeasible' : 'unknown', M: M };
  };
  /* Yes/no question: does this integer model have any solution? Only HiGHS answers it (within a fixed amount of work). */
  Engine.prototype.canAsk = function () { var b = this.active(); if (b.askable == null) b.askable = !!(b.feasible && b.tickable && b.tickable()); return b.askable; };
  Engine.prototype.ask = async function (build, share) { // share: fraction of the usual work limit
    var b = this.active(), M = build(b.nativeSemi), r;
    this.stats.ask = (this.stats.ask || 0) + 1;
    this.beat(b.name, 300000);
    try { r = b.feasible(M, share); } catch (e) { r = { status: 'unknown' }; await this.fail(b, e); }
    if (r.status !== 'unknown') this.note(b.name);
    r.M = M; return r;
  };

  LP.solve.Engine = Engine;
})(typeof self !== 'undefined' ? self : globalThis);

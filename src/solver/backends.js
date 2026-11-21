/* ===== backends.js: solver backends (HiGHS, javascript-lp-solver, embedded) behind one interface ===== */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};
  var MD = LP.model, polish = LP.simplex.polish;

  /* HiGHS reads the time through performance.now() and Date.now(). While `fn` runs, both return a counter that goes
     up by one per call. A time limit then is a fixed number of clock reads, that is a fixed amount of HiGHS's own
     work, and where it stops no longer depends on the speed of the machine. */
  function onTickClock(fn) {
    var perf = root.performance, own = !!perf && Object.prototype.hasOwnProperty.call(perf, 'now'), pn = perf && perf.now, dn = Date.now, n = 0;
    var tick = function () { return ++n; };
    try { if (perf) perf.now = tick; Date.now = tick; return fn(); }
    finally { Date.now = dn; if (perf) { if (own) perf.now = pn; else delete perf.now; } }
  }
  var ASK_TICKS = 1500000; // limit of one yes/no question, in clock reads (the large example scenarios need about half of it)

  // ---------- backend: HiGHS (WebAssembly) ----------
  function HighsBackend(factory) { this.name = 'HiGHS'; this.nativeSemi = false; this.factory = factory; this.h = null; this.crashes = 0; this.rejected = 0; }
  HighsBackend.prototype.init = function () { var self = this; return this.factory().then(function (h) { self.h = h; return self.selfTest(); }); };
  // can the clock be replaced in this environment? (if not, yes/no questions are not asked)
  HighsBackend.prototype.tickable = function () { try { return onTickClock(function () { return (!root.performance || root.performance.now() === 1) && Date.now() > 0 && Date.now() < 4; }); } catch (e) { return false; } };
  HighsBackend.prototype.selfTest = function () {
    var r = this.h.solve('Maximize\n obj: x + 2 y\nSubject To\n c1: x + y <= 4\n c2: x - y >= -2\nBounds\n x <= 3\nGeneral\n y\nEnd', {});
    if (r.Status !== 'Optimal' || Math.abs(r.ObjectiveValue - 7) > 1e-6) throw new Error('HiGHS self-test failed');
    return true;
  };
  HighsBackend.prototype.reset = function () { var self = this; return this.factory().then(function (h) { self.h = h; }); };
  HighsBackend.prototype.raw = function (M, o) {
    var r = this.h.solve(MD.toLPString(M), o), x = null;
    if (r.Columns) { x = new Float64Array(M.cols.length); for (var j = 0; j < M.cols.length; j++) { var c = r.Columns[M.cols[j].name]; x[j] = c ? +c.Primal : NaN; } }
    return { st: r.Status, obj: r.ObjectiveValue, x: x };
  };
  HighsBackend.prototype.lp = function (M) {
    var tries = [{ presolve: 'on' }, { presolve: 'off' }, { presolve: 'off', solver: 'ipm' }], r;
    for (var i = 0; i < tries.length; i++) {
      r = this.raw(M, tries[i]);
      if (r.st === 'Optimal') return { status: 'optimal', x: r.x, obj: r.obj + M.objConst };
      if (r.st === 'Infeasible') return { status: 'infeasible' };
    }
    return { status: 'unknown' };
  };
  // yes/no: does the integer model have any solution? ('unknown': the work limit ran out before an answer)
  HighsBackend.prototype.feasible = function (M, share) {
    var self = this, r = onTickClock(function () { return self.raw(M, { presolve: 'on', time_limit: ASK_TICKS * (share || 1) / 1000 }); });
    if (r.st === 'Infeasible') return { status: 'infeasible' };
    if (r.st !== 'Optimal' || !r.x) return { status: 'unknown' };
    var p = polish(M, r.x);
    return p.ok ? { status: 'feasible', x: p.x } : { status: 'unknown' };
  };

  // ---------- backend: javascript-lp-solver ----------
  function JsLpBackend(lib) { this.name = 'javascript-lp-solver'; this.nativeSemi = false; this.lib = lib; this.rejected = 0; this.used = 0; this.lpBudget = 2500; }
  JsLpBackend.prototype.init = function () {
    var r = this.lib.Solve({ optimize: 'o', opType: 'max', constraints: { a: { max: 4 }, b: { min: -2 } }, variables: { x: { o: 1, a: 1, b: 1 }, y: { o: 2, a: 1, b: -1 } }, ints: { y: 1 } });
    if (!r.feasible || Math.abs(r.result - 7) > 1e-6) throw new Error('javascript-lp-solver self-test failed');
    return Promise.resolve(true);
  };
  JsLpBackend.prototype.convert = function (M, timeoutMs) {
    var model = { optimize: 'obj', opType: M.sense, constraints: {}, variables: {}, ints: {}, options: { timeout: timeoutMs || 3000 } };
    var shift = new Float64Array(M.cols.length), j, i, k, any = false;
    for (j = 0; j < M.cols.length; j++) {
      var c = M.cols[j]; model.variables[c.name] = {}; shift[j] = c.lb > -Infinity ? c.lb : 0;
      if (c.obj) { model.variables[c.name].obj = c.obj; any = true; }
      if (c.int) model.ints[c.name] = 1;
      if (c.ub < Infinity && !c.ubImplied) { model.constraints['ub' + j] = { max: c.ub - shift[j] }; model.variables[c.name]['ub' + j] = 1; }
    }
    if (!any) model.variables[M.cols[0].name].obj = 0;
    for (i = 0; i < M.rows.length; i++) {
      var R = M.rows[i], off = 0;
      for (k = 0; k < R.idx.length; k++) { off += R.val[k] * shift[R.idx[k]]; model.variables[M.cols[R.idx[k]].name][R.name] = R.val[k]; }
      var con = {};
      if (R.lb === R.ub) con.equal = R.lb - off; else { if (R.lb > -Infinity) con.min = R.lb - off; if (R.ub < Infinity) con.max = R.ub - off; }
      model.constraints[R.name] = con;
    }
    return { model: model, shift: shift };
  };
  JsLpBackend.prototype.run = function (M, timeoutMs) {
    var cv = this.convert(M, timeoutMs), r = this.lib.Solve(cv.model);
    this.used++;
    if (!r || !r.feasible) return { status: 'infeasible' };
    var x = new Float64Array(M.cols.length);
    for (var j = 0; j < M.cols.length; j++) x[j] = (+r[M.cols[j].name] || 0) + cv.shift[j];
    return { status: 'optimal', x: x };
  };
  JsLpBackend.prototype.lp = function (M) {
    var r = this.run(M, 3000);
    if (r.status === 'optimal') {
      if (MD.checkSolution(M, r.x, 1e-6).ok) return { status: 'optimal', x: r.x, obj: MD.objOf(M, r.x), needsOptCheck: true };
      this.rejected++; return { status: 'unknown' };
    }
    return { status: 'unknown', claim: 'infeasible' }; // an infeasibility claim is never trusted without a second opinion
  };

  // ---------- backend: embedded simplex + branch-and-bound ----------
  // `pivots`, `nodes` and `trail` are reported for the trace of a run (optimize.js) only
  function EmbeddedBackend() { this.name = 'Eingebettet (Simplex + B&B)'; this.nativeSemi = true; }
  EmbeddedBackend.prototype.init = function () { return Promise.resolve(true); };
  EmbeddedBackend.prototype.lp = function (M) {
    var p0 = LP.simplex.pivots(), r = LP.simplex.solveLP(M, { deadline: LP.simplex.now() + 30000 }), pv = LP.simplex.pivots() - p0;
    if (r.status === 'optimal' && !MD.checkSolution(M, r.x, 1e-6).ok) return { status: 'unknown', pivots: pv };
    return { status: r.status, x: r.x, obj: r.obj, pivots: pv };
  };
  EmbeddedBackend.prototype.milp = function (M, o) {
    var p0 = LP.simplex.pivots(), r = LP.simplex.solveMILP(M, { timeLimit: o.timeLimit || 5, relGap: o.relGap, absGap: o.absGap, start: o.start });
    if (!r.x) return { status: r.status, nodes: r.nodes, trail: r.trail, pivots: LP.simplex.pivots() - p0 };
    var p = polish(M, r.x);
    if (!p.ok) return { status: 'unknown', nodes: r.nodes, trail: r.trail, pivots: LP.simplex.pivots() - p0 };
    return { status: r.status, x: p.x, obj: p.obj, bound: r.bound, nodes: r.nodes, trail: r.trail, pivots: LP.simplex.pivots() - p0 };
  };

  LP.solve = { polish: polish, HighsBackend: HighsBackend, JsLpBackend: JsLpBackend, EmbeddedBackend: EmbeddedBackend };
})(typeof self !== 'undefined' ? self : globalThis);

/* ===== simplex.js: embedded fallback solver =====
   Dense bounded-variable simplex (two-phase primal, dual re-optimisation) plus branch-and-bound
   for integer and semi-integer columns. No dependencies. */
(function (root) {
  'use strict';
  var LP = root.LP = root.LP || {};
  var FTOL = 1e-7, DTOL = 1e-9, PTOL = 1e-7;

  /* Work clock. Every limit in this solver is measured on it, never on the wall clock: it advances with the
     arithmetic done (tableau operations), so the same inputs stop at the same step on every machine and a slower
     machine only takes longer to get there. One unit is about one millisecond on a 2020 laptop. */
  var WORK = 0, WORK_PER_MS = 700000;
  function now() { return WORK / WORK_PER_MS; }
  var PIVOTS = 0; // for the trace of a run only (backends.js): counts, never limits, so it cannot change a result

  function Dense(M) {
    var n = M.cols.length, m = M.rows.length, i, j, k;
    var ns = 0, slackOf = new Int32Array(m);
    for (i = 0; i < m; i++) slackOf[i] = (M.rows[i].lb !== M.rows[i].ub) ? n + ns++ : -1;
    var N = n + ns;
    this.M = M; this.n = n; this.m = m; this.N = N;
    this.lb = new Float64Array(N); this.ub = new Float64Array(N); this.c = new Float64Array(N);
    var sgn = M.sense === 'max' ? -1 : 1;
    for (j = 0; j < n; j++) {
      this.lb[j] = M.cols[j].lb; this.ub[j] = M.cols[j].ub; this.c[j] = sgn * M.cols[j].obj;
      if (this.lb[j] === -Infinity && this.ub[j] === Infinity) throw new Error('free variable not supported');
    }
    this.tab = new Array(m); this.basis = new Int32Array(m); this.beta = new Float64Array(m);
    this.inBasis = new Uint8Array(N); this.atUp = new Uint8Array(N); this.d = new Float64Array(N);
    this.artFixed = false; this.iters = 0;
    for (j = 0; j < n; j++) this.atUp[j] = this.lb[j] === -Infinity ? 1 : 0;
    var scale = 0;
    for (i = 0; i < m; i++) {
      var R = M.rows[i], row = new Float64Array(N + 1), b, sig = 0;
      for (k = 0; k < R.idx.length; k++) row[R.idx[k]] += R.val[k];
      if (R.lb === R.ub) b = R.lb;
      else if (R.lb > -Infinity) { b = R.lb; sig = -1; this.lb[slackOf[i]] = 0; this.ub[slackOf[i]] = R.ub - R.lb; }
      else { b = R.ub; sig = 1; this.lb[slackOf[i]] = 0; this.ub[slackOf[i]] = Infinity; }
      var res = b;
      for (k = 0; k < R.idx.length; k++) { j = R.idx[k]; res -= R.val[k] * (this.atUp[j] ? this.ub[j] : this.lb[j]); }
      scale = Math.max(scale, Math.abs(b));
      var sj = slackOf[i], done = false;
      if (sj >= 0) {
        row[sj] = sig;
        var sv = res / sig;
        if (sv >= -FTOL && sv <= this.ub[sj] + FTOL) { // slack can be basic
          for (k = 0; k <= N; k++) row[k] = row[k] / sig; row[N] = b / sig;
          this.basis[i] = sj; this.inBasis[sj] = 1; done = true;
        } else if (sv > this.ub[sj]) { this.atUp[sj] = 1; res -= sig * this.ub[sj]; }
      }
      if (!done) {
        var s2 = res < 0 ? -1 : 1;
        if (s2 < 0) for (k = 0; k < N; k++) row[k] = -row[k];
        row[N] = s2 * b;
        this.basis[i] = N + i; // artificial
      }
      this.tab[i] = row;
    }
    this.scale = 1 + scale;
    this.orig = this.tab.map(function (r) { return new Float64Array(r); });
    WORK += 2 * m * (N + 1);
    this.sinceRef = 0;
    this.refreshBeta();
  }
  // rebuild the tableau from the original rows for the current basis (removes accumulated rounding error)
  Dense.prototype.refactor = function () {
    var N = this.N, m = this.m, i, j, k, T = this.orig.map(function (r) { return new Float64Array(r); });
    WORK += 2 * m * (N + 1);
    var used = new Uint8Array(m), newBasis = new Int32Array(m), real = [];
    for (i = 0; i < m; i++) { if (this.basis[i] >= N) { used[i] = 1; newBasis[i] = this.basis[i]; } else real.push(this.basis[i]); }
    // artificial of row i must stay with row i
    for (i = 0; i < m; i++) if (this.basis[i] >= N && this.basis[i] !== N + i) return false;
    for (k = 0; k < real.length; k++) {
      var b = real[k], pr = -1, pa = 1e-11;
      for (i = 0; i < m; i++) if (!used[i] && Math.abs(T[i][b]) > pa) { pa = Math.abs(T[i][b]); pr = i; }
      if (pr < 0) return false;
      var rowp = T[pr], inv = 1 / rowp[b], nz = [], hit = 0;
      for (j = 0; j <= N; j++) if (rowp[j] !== 0) { rowp[j] *= inv; nz.push(j); }
      rowp[b] = 1;
      for (i = 0; i < m; i++) {
        if (i === pr) continue;
        var row = T[i], f = row[b]; if (f === 0) continue;
        for (j = 0; j < nz.length; j++) row[nz[j]] -= f * rowp[nz[j]];
        row[b] = 0; hit++;
      }
      WORK += N + 2 * m + hit * nz.length;
      used[pr] = 1; newBasis[pr] = b;
    }
    for (i = 0; i < m; i++) { this.tab[i].set(T[i]); this.basis[i] = newBasis[i]; }
    this.sinceRef = 0;
    this.refreshBeta();
    return true;
  };
  Dense.prototype.valN = function (j) { return this.atUp[j] ? this.ub[j] : this.lb[j]; };
  Dense.prototype.refreshBeta = function () {
    var N = this.N, m = this.m, i, j, nb = [], vals = [];
    for (j = 0; j < N; j++) if (!this.inBasis[j]) { var v = this.valN(j); if (v !== 0) { nb.push(j); vals.push(v); } }
    for (i = 0; i < m; i++) {
      var row = this.tab[i], s = row[N];
      for (j = 0; j < nb.length; j++) s -= row[nb[j]] * vals[j];
      this.beta[i] = s;
    }
    WORK += N + m * (nb.length + 1);
  };
  Dense.prototype.computeD = function (phase1) {
    var N = this.N, m = this.m, d = this.d, i, j;
    if (phase1) { for (j = 0; j < N; j++) d[j] = 0; }
    else { for (j = 0; j < N; j++) d[j] = this.c[j]; }
    for (i = 0; i < m; i++) {
      var bi = this.basis[i], cb = bi >= N ? (phase1 ? 1 : 0) : (phase1 ? 0 : this.c[bi]);
      if (cb === 0) continue;
      var row = this.tab[i];
      for (j = 0; j < N; j++) d[j] -= cb * row[j];
      WORK += N;
    }
    WORK += N + m;
    for (i = 0; i < m; i++) if (this.basis[i] < N) d[this.basis[i]] = 0;
  };
  Dense.prototype.pivot = function (r, q) {
    var N = this.N, m = this.m, tab = this.tab, rowr = tab[r], piv = rowr[q], j, i, nz = [];
    var inv = 1 / piv;
    for (j = 0; j <= N; j++) { var v = rowr[j]; if (v !== 0) { v *= inv; if (Math.abs(v) < 1e-13) v = 0; rowr[j] = v; if (v !== 0) nz.push(j); } }
    rowr[q] = 1;
    var L = nz.length, hit = 0;
    for (i = 0; i < m; i++) {
      if (i === r) continue;
      var row = tab[i], f = row[q];
      if (f === 0) continue;
      for (j = 0; j < L; j++) { var cidx = nz[j]; row[cidx] -= f * rowr[cidx]; }
      row[q] = 0; hit++;
    }
    WORK += N + m + (hit + 1) * L;
    var d = this.d, fd = d[q];
    if (fd !== 0) { for (j = 0; j < L; j++) { var c2 = nz[j]; if (c2 < N) d[c2] -= fd * rowr[c2]; } d[q] = 0; }
    var old = this.basis[r];
    if (old < N) this.inBasis[old] = 0;
    this.basis[r] = q; this.inBasis[q] = 1;
    this.iters++; this.sinceRef++; PIVOTS++;
  };
  Dense.prototype.loB = function (bi) { return bi >= this.N ? 0 : this.lb[bi]; };
  Dense.prototype.upB = function (bi, phase1) { return bi >= this.N ? (phase1 ? Infinity : 0) : this.ub[bi]; };

  // primal simplex; returns 'optimal' | 'unbounded' | 'limit'
  Dense.prototype.primal = function (phase1, deadline) {
    var N = this.N, m = this.m, tab = this.tab, d = this.d, beta = this.beta, lb = this.lb, ub = this.ub;
    var stall = 0, bland = false, maxIt = 200 * (m + 20) + 5 * N, it = 0, i, j;
    var ftol = FTOL;
    while (true) {
      if (++it > maxIt) return 'limit';
      if ((it & 63) === 0) { if (this.sinceRef > 400 + 2 * m) { if (this.refactor()) this.computeD(phase1); } else this.refreshBeta(); if (deadline && now() > deadline) return 'limit'; }
      WORK += N + 3 * m;
      var q = -1, best = DTOL;
      for (j = 0; j < N; j++) {
        if (this.inBasis[j] || lb[j] === ub[j]) continue;
        var dj = d[j], sc;
        if (!this.atUp[j]) { if (dj >= -DTOL) continue; sc = -dj; } else { if (dj <= DTOL) continue; sc = dj; }
        if (bland) { q = j; break; }
        if (sc > best) { best = sc; q = j; }
      }
      if (q < 0) return 'optimal';
      var sigma = this.atUp[q] ? -1 : 1;
      var flip = ub[q] - lb[q];
      var tmax = Infinity, alpha, bi, lo, up, ratio;
      for (i = 0; i < m; i++) {
        alpha = sigma * tab[i][q];
        if (alpha > PTOL) { bi = this.basis[i]; lo = this.loB(bi); ratio = (beta[i] - lo + ftol) / alpha; if (ratio < tmax) tmax = ratio; }
        else if (alpha < -PTOL) { bi = this.basis[i]; up = this.upB(bi, phase1); if (up < Infinity) { ratio = (up - beta[i] + ftol) / (-alpha); if (ratio < tmax) tmax = ratio; } }
      }
      if (tmax === Infinity && flip === Infinity) return 'unbounded';
      var theta, r = -1;
      if (flip <= tmax) { theta = flip; }
      else {
        var bestA = 0, bestRatio = 0;
        for (i = 0; i < m; i++) {
          alpha = sigma * tab[i][q];
          if (alpha > PTOL) { bi = this.basis[i]; ratio = (beta[i] - this.loB(bi)) / alpha; }
          else if (alpha < -PTOL) { bi = this.basis[i]; up = this.upB(bi, phase1); if (up === Infinity) continue; ratio = (up - beta[i]) / (-alpha); }
          else continue;
          if (ratio <= tmax && Math.abs(alpha) > bestA) { bestA = Math.abs(alpha); r = i; bestRatio = ratio; }
        }
        theta = bestRatio > 0 ? bestRatio : 0;
      }
      if (theta > 1e-10) { stall = 0; bland = false; } else if (++stall > 30 + m) bland = true;
      var st = sigma * theta;
      if (r < 0) {
        if (st !== 0) for (i = 0; i < m; i++) { var a0 = tab[i][q]; if (a0 !== 0) beta[i] -= a0 * st; }
        this.atUp[q] ^= 1;
      } else {
        if (st !== 0) for (i = 0; i < m; i++) { var a1 = tab[i][q]; if (a1 !== 0) beta[i] -= a1 * st; }
        var xq = this.valN(q) + st, leave = this.basis[r];
        if (leave < N) this.atUp[leave] = (sigma * tab[r][q] < 0) ? 1 : 0;
        this.pivot(r, q);
        beta[r] = xq;
      }
    }
  };

  // dual simplex re-optimisation after bound changes; returns 'optimal' | 'infeasible' | 'limit'
  Dense.prototype.dual = function (deadline) {
    var N = this.N, m = this.m, tab = this.tab, d = this.d, beta = this.beta, lb = this.lb, ub = this.ub;
    var maxIt = 60 * (m + 20), it = 0, i, j, ftol = FTOL * 10;
    while (true) {
      if (++it > maxIt) return 'limit';
      if ((it & 15) === 0) {
        if (this.sinceRef > 120 + m) { if (this.refactor()) { this.computeD(false); this.cleanD(); } } else this.refreshBeta();
        if (deadline && now() > deadline) return 'limit';
      }
      WORK += 3 * N + 2 * m;
      var r = -1, worst = ftol, dir = 0, target = 0;
      for (i = 0; i < m; i++) {
        var bi = this.basis[i], lo = this.loB(bi), up = this.upB(bi, false), v = beta[i];
        if (lo - v > worst) { worst = lo - v; r = i; dir = 1; target = lo; }
        else if (v - up > worst) { worst = v - up; r = i; dir = -1; target = up; }
      }
      if (r < 0) return 'optimal';
      var row = tab[r], q = -1, bestRatio = Infinity, bestA = 0, a, ratio;
      // pass 1: smallest ratio with tolerance
      var rmax = Infinity;
      for (j = 0; j < N; j++) {
        if (this.inBasis[j] || lb[j] === ub[j]) continue;
        a = row[j]; if (a > -PTOL && a < PTOL) continue;
        var ok = this.atUp[j] ? (dir > 0 ? a > 0 : a < 0) : (dir > 0 ? a < 0 : a > 0);
        if (!ok) continue;
        ratio = (Math.abs(d[j]) + 1e-7) / Math.abs(a);
        if (ratio < rmax) rmax = ratio;
      }
      if (rmax === Infinity) return 'infeasible';
      for (j = 0; j < N; j++) {
        if (this.inBasis[j] || lb[j] === ub[j]) continue;
        a = row[j]; if (a > -PTOL && a < PTOL) continue;
        var ok2 = this.atUp[j] ? (dir > 0 ? a > 0 : a < 0) : (dir > 0 ? a < 0 : a > 0);
        if (!ok2) continue;
        ratio = Math.abs(d[j]) / Math.abs(a);
        if (ratio <= rmax && Math.abs(a) > bestA) { bestA = Math.abs(a); q = j; bestRatio = ratio; }
      }
      if (q < 0) return 'infeasible';
      var dx = (beta[r] - target) / row[q];
      for (i = 0; i < m; i++) { var a2 = tab[i][q]; if (a2 !== 0) beta[i] -= a2 * dx; }
      var xq = this.valN(q) + dx, leave = this.basis[r];
      if (leave < N) this.atUp[leave] = dir < 0 ? 1 : 0;
      this.pivot(r, q);
      beta[r] = xq;
      this.cleanD();
    }
  };
  // keep dual feasibility exactly: remove tiny sign errors of the reduced costs
  Dense.prototype.cleanD = function () {
    var d = this.d, N = this.N, j;
    for (j = 0; j < N; j++) { if (this.inBasis[j]) continue; if (!this.atUp[j]) { if (d[j] < 0 && d[j] > -1e-7) d[j] = 0; } else if (d[j] > 0 && d[j] < 1e-7) d[j] = 0; }
  };

  Dense.prototype.solveLP = function (deadline) {
    var N = this.N, m = this.m, i, j, hasArt = false;
    for (i = 0; i < m; i++) if (this.basis[i] >= N) { hasArt = true; break; }
    if (hasArt) {
      this.computeD(true);
      var s1 = this.primal(true, deadline);
      if (s1 === 'limit') return 'limit';
      this.refreshBeta();
      var inf = 0;
      for (i = 0; i < m; i++) if (this.basis[i] >= N) inf += Math.abs(this.beta[i]);
      if (inf > 1e-5) return 'infeasible';
      // drive remaining artificials out of the basis where possible
      for (i = 0; i < m; i++) {
        if (this.basis[i] < N) continue;
        var row = this.tab[i], bj = -1, ba = 1e-7;
        for (j = 0; j < N; j++) if (!this.inBasis[j] && Math.abs(row[j]) > ba) { ba = Math.abs(row[j]); bj = j; }
        if (bj >= 0) { var val = this.valN(bj); this.pivot(i, bj); this.beta[i] = val; }
      }
      this.refreshBeta();
    }
    this.artFixed = true;
    this.computeD(false);
    var s2 = this.primal(false, deadline);
    if (s2 !== 'optimal') return s2;
    if (this.sinceRef > 50 && this.refactor()) { // polish: remove drift, then continue if anything moved
      this.computeD(false);
      var s3 = this.dual(deadline); if (s3 === 'infeasible') return 'infeasible';
      s3 = this.primal(false, deadline); if (s3 !== 'optimal') return s3;
    }
    this.refreshBeta();
    return 'optimal';
  };
  Dense.prototype.x = function () {
    var out = new Float64Array(this.n), j, i;
    for (j = 0; j < this.n; j++) if (!this.inBasis[j]) out[j] = this.valN(j);
    for (i = 0; i < this.m; i++) if (this.basis[i] < this.n) out[this.basis[i]] = this.beta[i];
    for (j = 0; j < this.n; j++) { if (out[j] < this.lb[j] && out[j] > this.lb[j] - 1e-5) out[j] = this.lb[j]; else if (out[j] > this.ub[j] && out[j] < this.ub[j] + 1e-5) out[j] = this.ub[j]; }
    return out;
  };
  Dense.prototype.objMin = function (x) { var o = 0; for (var j = 0; j < this.n; j++) o += this.c[j] * x[j]; return o; };
  // change bounds of a structural column (keeps the basis; caller re-optimises with dual())
  Dense.prototype.setBounds = function (j, lo, up) { this.lb[j] = lo; this.ub[j] = up; if (!this.inBasis[j]) { if (this.atUp[j] && up === Infinity) this.atUp[j] = 0; } };

  function solveLP(M, opts) {
    opts = opts || {};
    var S = new Dense(M), st = S.solveLP(opts.deadline);
    if (st === 'optimal') { var x = S.x(); return { status: 'optimal', x: x, obj: LP.model.objOf(M, x), S: S }; }
    return { status: st === 'limit' ? 'unknown' : st, x: null, S: S };
  }

  // exact values for the continuous columns once the integer columns are fixed at their rounded values.
  // Lower bounds of continuous columns may be missed by `slackEps` (well below half a cent).
  function polish(M, x, slackEps) {
    var eps = slackEps == null ? 0.002 : slackEps;
    var n = M.cols.length, j, i, k, map = new Int32Array(n), R2 = { sense: M.sense, cols: [], rows: [], objConst: M.objConst };
    for (j = 0; j < n; j++) {
      var c = M.cols[j];
      if (c.int) {
        var v = Math.round(x[j]);
        if (v < c.lb - 1e-9 || v > c.ub + 1e-9 || (c.semi && v > 0 && v < c.semi)) return { ok: false };
        map[j] = -1; R2.objConst += c.obj * v;
      } else { map[j] = R2.cols.length; R2.cols.push({ name: c.name, lb: c.lb > -Infinity ? c.lb - eps : c.lb, ub: c.ub, int: false, obj: c.obj }); }
    }
    for (i = 0; i < M.rows.length; i++) {
      var R = M.rows[i], off = 0, idx = [], val = [], mag = 1;
      for (k = 0; k < R.idx.length; k++) { j = R.idx[k]; if (map[j] < 0) { var pv = R.val[k] * Math.round(x[j]); off += pv; mag += Math.abs(pv); } else { idx.push(map[j]); val.push(R.val[k]); } }
      if (!idx.length) { if (off < R.lb - 1e-7 * mag || off > R.ub + 1e-7 * mag) return { ok: false }; continue; }
      R2.rows.push({ name: R.name, lb: R.lb - off, ub: R.ub - off, idx: idx, val: val });
    }
    var r = solveLP(R2, {});
    if (r.status !== 'optimal') return { ok: false };
    var out = new Float64Array(n);
    for (j = 0; j < n; j++) out[j] = map[j] < 0 ? Math.round(x[j]) : r.x[map[j]];
    return { ok: true, x: out, obj: LP.model.objOf(M, out) };
  }

  /* branch and bound; opts: {timeLimit (s on the work clock), absGap, relGap,
       stopAtFirst, start (a solution vector to begin with), rules (the branching rules, see below), greedy (with a limit:
       look-ahead widths of the eliminations tried first, see cardGreedy), onBetter(x, obj, nodes) (told of every better
       plan), onTick(nodes, obj | null) (told now and then that the search is alive)}
     M.card = { cols, w, max }: at most `max` of the columns `cols` may be above zero. No row says so: a node whose
       answer uses more of them branches on one column, "in the plan" (at least its minimum) or "out" (zero), and once
       `max` columns are in, all the others are fixed at zero. w ranks the columns (see cardPick). */
  function solveMILP(M, opts) {
    opts = opts || {};
    var t0 = now(), deadline = t0 + 1000 * (opts.timeLimit || 5);
    var ints = [], j;
    for (j = 0; j < M.cols.length; j++) if (M.cols[j].int) ints.push(j);
    var card = M.card && M.card.cols && M.card.cols.length ? M.card : null, inCard = null, wCard = null;
    if (card) { inCard = new Uint8Array(M.cols.length); wCard = new Float64Array(M.cols.length); for (j = 0; j < card.cols.length; j++) { inCard[card.cols[j]] = 1; wCard[card.cols[j]] = card.w ? card.w[j] : 1; } }
    var S = new Dense(M), st = S.solveLP(deadline);
    if (st !== 'optimal') return { status: st === 'limit' ? 'unknown' : st, x: null, nodes: 0 };
    var x = S.x();
    if (!ints.length) { var o0 = LP.model.objOf(M, x); return { status: 'optimal', x: x, obj: o0, bound: o0, nodes: 0, trail: [{ n: 0, v: o0 }] }; }
    var sgn = M.sense === 'max' ? -1 : 1;
    var rootMin = S.objMin(x) ;
    var lb0 = new Float64Array(M.cols.length), ub0 = new Float64Array(M.cols.length);
    for (j = 0; j < M.cols.length; j++) { lb0[j] = M.cols[j].lb; ub0[j] = M.cols[j].ub; }
    var incumbent = null, incMin = Infinity, nodes = 0, cur = [], openBound = rootMin;
    function gapOK(bound) {
      if (!incumbent) return false;
      var g = incMin - bound;
      return g <= (opts.absGap || 1e-6) || g <= (opts.relGap || 1e-6) * Math.max(1, Math.abs(incMin));
    }
    function applyPath(path) {
      var k;
      for (k = 0; k < cur.length; k++) S.setBounds(cur[k].v, lb0[cur[k].v], ub0[cur[k].v]);
      for (k = 0; k < path.length; k++) S.setBounds(path[k].v, path[k].lo, path[k].up);
      cur = path;
      // columns that were fixed may carry a reduced cost of the wrong sign: put them at the bound that is dual feasible
      for (k = 0; k < ints.length; k++) {
        var c = ints[k];
        if (S.inBasis[c] || S.lb[c] === S.ub[c]) continue;
        if (!S.atUp[c] && S.d[c] < -DTOL && S.ub[c] < Infinity) S.atUp[c] = 1;
        else if (S.atUp[c] && S.d[c] > DTOL) S.atUp[c] = 0;
      }
      S.refreshBeta();
    }
    var FAIL = { failed: true }, incomplete = false;
    function evalNode(path) {
      if (S.sinceRef > 60 + (S.m >> 1)) { if (S.refactor()) { S.computeD(false); S.cleanD(); } }
      applyPath(path);
      var s = S.dual(deadline);
      if (s === 'limit') { // numerical trouble: rebuild from scratch with the node's bounds
        if (now() > deadline) return FAIL;
        var M2 = { sense: M.sense, cols: M.cols.map(function (c) { return { name: c.name, lb: c.lb, ub: c.ub, int: c.int, obj: c.obj, semi: c.semi }; }), rows: M.rows, objConst: M.objConst };
        path.forEach(function (p) { M2.cols[p.v].lb = p.lo; M2.cols[p.v].ub = p.up; });
        var r2 = solveLP(M2, { deadline: deadline });
        if (r2.status === 'infeasible') return null;
        if (r2.status !== 'optimal') return FAIL;
        return { x: r2.x, objMin: sgn * (LP.model.objOf(M, r2.x) - M.objConst) };
      }
      if (s !== 'optimal') return null;
      S.refreshBeta();
      if (S.primal(false, deadline) !== 'optimal') return FAIL; // removes any remaining dual infeasibility
      S.refreshBeta();
      var xs = S.x();
      return { x: xs, objMin: S.objMin(xs) };
    }
    var varRule = 'chronosemi', childRule = 'down', cardRule = 'span';
    // ----- limit on the number of columns in use (M.card) -----
    function cardUsed(xs) { var n = 0; for (var a = 0; a < card.cols.length; a++) if (xs[card.cols[a]] > 0.5) n++; return n; }
    /* The column to branch on when the answer of a node uses more columns than allowed (-1: it does not).
       'span': the largest amount times term first, 'size': the largest amount first; both try "in the plan" first, so
       a dive keeps the big rungs of the ladder and drops the rest. 'drop': the smallest amount times term first,
       "out" first. Ties go to the column that comes first. */
    function cardIn(path) { // the columns that are in the plan on this path: by their own lower bound, or by a decision of the search
      var a, on = {}, n = 0;
      for (a = 0; a < card.cols.length; a++) if (lb0[card.cols[a]] >= 1) { on[card.cols[a]] = 1; n++; }
      for (a = 0; a < path.length; a++) if (inCard[path[a].v] && path[a].lo >= 1 && !on[path[a].v]) { on[path[a].v] = 1; n++; }
      return { on: on, n: n };
    }
    function cardPick(xs, path) {
      var a, c, n = 0, on, best = -1, bs = 0, s;
      for (a = 0; a < card.cols.length; a++) if (xs[card.cols[a]] > 1e-6) n++;
      if (n <= card.max) return -1;
      on = cardIn(path).on;
      for (a = 0; a < card.cols.length; a++) {
        c = card.cols[a]; if (!(xs[c] > 1e-6) || on[c]) continue;
        s = cardRule === 'size' ? xs[c] : xs[c] * wCard[c];
        if (best < 0 || (cardRule === 'drop' ? s < bs : s > bs)) { best = c; bs = s; }
      }
      return best;
    }
    // a path with as many columns "in" as allowed: every other column of the limit is fixed at zero (null: too many are in)
    function cardClose(path) {
      var a, st = cardIn(path), n = st.n, on = st.on, out;
      if (n > card.max) return null;
      if (n < card.max) return path;
      out = path.filter(function (p) { return !inCard[p.v] || on[p.v]; });
      for (a = 0; a < card.cols.length; a++) if (!on[card.cols[a]]) out.push({ v: card.cols[a], lo: 0, up: 0 });
      return out;
    }
    function violation(xs) {
      var bestJ = -1, bestS = 1e-6, v, f, sc;
      for (var a = 0; a < ints.length; a++) {
        var c = ints[a]; v = xs[c]; f = v - Math.floor(v + 1e-9);
        var semi = M.cols[c].semi;
        if (semi && v > 1e-6 && v < semi - 1e-6) sc = 2 + v / semi;
        else { if (f < 1e-6 || f > 1 - 1e-6) continue; sc = Math.min(f, 1 - f); }
        if (varRule === 'chrono') { return c; }
        if (varRule === 'chronosemi') { if (sc >= 2) return c; if (bestJ < 0) bestJ = c; continue; }
        if (varRule === 'large') sc = (sc >= 2 ? 1e6 : 0) + v;
        if (sc > bestS) { bestS = sc; bestJ = c; }
      }
      return bestJ;
    }
    var rejected = 0, trail = [], quiet = false; // trail: each better plan as { n: nodes so far, v: its objective }, for the trace of a run
    function tryIncumbent(xs, objMin) {
      var p = polish(M, xs);
      if (!p.ok) { rejected++; return false; }
      if (card && cardUsed(p.x) > card.max) { rejected++; return false; }
      var om = sgn * (p.obj - M.objConst);
      if (om < incMin - 1e-9) { // full: the newest replaces the last, so the trail always ends at the plan returned
        incMin = om; incumbent = p.x; if (trail.length >= 300) trail.pop(); trail.push({ n: nodes, v: p.obj });
        if (opts.onBetter && !quiet) opts.onBetter(p.x, p.obj, nodes);
      }
      return true;
    }
    if (opts.start) { quiet = true; tryIncumbent(opts.start, 0); quiet = false; } // a plan known from elsewhere: the search can only improve on it (and the caller knows it already)
    // root heuristic: round all integer columns down, fix them, re-solve the continuous rest
    (function () {
      var path = [], keep = null, a;
      if (card) { // with a limit: only its largest columns (amount times term) stay, the others go to zero
        var used = card.cols.filter(function (c) { return x[c] > 1e-6; }).sort(function (p, q) { return (x[q] * wCard[q] - x[p] * wCard[p]) || (p - q); });
        keep = new Uint8Array(M.cols.length); for (a = 0; a < used.length && a < card.max; a++) keep[used[a]] = 1;
      }
      for (a = 0; a < ints.length; a++) {
        var c = ints[a], v = Math.floor(x[c] + 1e-6), semi = M.cols[c].semi;
        if (semi && v > 0 && v < semi) v = 0;
        if (keep && inCard[c] && !keep[c]) v = 0;
        v = Math.max(lb0[c], Math.min(ub0[c], v));
        path.push({ v: c, lo: v, up: v });
      }
      var r = evalNode(path);
      if (r && r !== FAIL) tryIncumbent(r.x, r.objMin);
      applyPath([]);
    })();
    /* With a limit: a first choice of columns by elimination. As long as the answer uses too many columns, each of its
       `look` smallest (amount times term) is taken out on trial, and the one whose loss costs the objective least goes
       for good. The path returned fixes every column that is left over at zero; the search looks at that subtree first. */
    function cardGreedy(look) {
      var path = [], a, c, r, used, best, bestObj, t;
      while (true) {
        if (now() > deadline) return null;
        r = evalNode(path); nodes++;
        if (!r || r === FAIL) return null;
        used = card.cols.filter(function (c) { return r.x[c] > 1e-6; });
        if (used.length <= card.max) break;
        used = used.filter(function (c) { return lb0[c] < 1; }).sort(function (p, q) { return (r.x[p] * wCard[p] - r.x[q] * wCard[q]) || (p - q); });
        best = -1; bestObj = 0;
        for (a = 0; a < used.length && a < look; a++) {
          t = evalNode(path.concat([{ v: used[a], lo: 0, up: 0 }])); nodes++;
          if (t && t !== FAIL && (best < 0 || t.objMin < bestObj - 1e-9)) { best = used[a]; bestObj = t.objMin; }
        }
        if (best < 0) return null; // none of them can go
        path.push({ v: best, lo: 0, up: 0 });
      }
      var out = {}; for (a = 0; a < path.length; a++) out[path[a].v] = 1;
      for (a = 0; a < card.cols.length; a++) { c = card.cols[a]; if (!out[c] && !(r.x[c] > 1e-6)) path.push({ v: c, lo: 0, up: 0 }); }
      return path;
    }
    var limit = true, total = deadline - now();
    // each rule: [which column to branch on, which child first, share of the budget used up when it ends, order for a limit (cardPick)].
    // A search for any plan within a limit starts with 'drop': its nodes are cheap, and it finds a plan, or shows there is none, soonest.
    var rules = opts.rules || (card && opts.stopAtFirst ? [['chronosemi', 'down', 0.5, 'drop'], ['chronosemi', 'down', 0.85, 'span'], ['mostfrac', 'nearest', 1, 'size']]
      : [['chronosemi', 'down', 0.5, 'span'], ['large', 'down', 0.75, 'size'], ['mostfrac', 'nearest', 1, 'drop']]);
    var tick = 0;
    function dfs(until, from) { // depth-first search from the root (or below the path `from`); returns true when that tree was searched completely
      var stack = [{ path: from || (card ? cardClose([]) || [] : []), bound: rootMin }];
      while (stack.length) {
        if (now() > until || (opts.maxNodes && nodes >= opts.maxNodes)) return false;
        if (opts.onTick && (++tick & 255) === 0) opts.onTick(nodes, incumbent ? sgn * incMin + M.objConst : null);
        var node = stack.pop();
        if (incumbent && (node.bound >= incMin - 1e-9 || gapOK(node.bound))) continue;
        nodes++;
        var res = evalNode(node.path);
        if (res === FAIL) { incomplete = true; continue; }
        if (!res) continue;
        if (incumbent && (res.objMin >= incMin - 1e-9 || gapOK(res.objMin))) continue;
        var bc = card ? cardPick(res.x, node.path) : -1, bj = bc >= 0 ? bc : violation(res.x);
        if (bj < 0) { tryIncumbent(res.x, res.objMin); if (opts.stopAtFirst && incumbent) return false; continue; }
        var v = res.x[bj], semi = M.cols[bj].semi, plo = lb0[bj], pup = ub0[bj], k;
        for (k = 0; k < node.path.length; k++) if (node.path[k].v === bj) { plo = node.path[k].lo; pup = node.path[k].up; }
        var base = node.path.filter(function (p) { return p.v !== bj; });
        var down, upc, downFirst = true;
        if (bc >= 0) { // too many columns in use: this one is out (zero), or in (at least its minimum)
          down = { v: bj, lo: plo, up: 0 }; upc = { v: bj, lo: Math.max(plo, semi || 1), up: pup }; downFirst = cardRule === 'drop';
        } else if (semi && v < semi - 1e-6 && v > 1e-6) {
          down = { v: bj, lo: plo, up: 0 }; upc = { v: bj, lo: Math.max(plo, semi), up: pup }; downFirst = v < semi / 2;
        } else {
          var fl = Math.floor(v + 1e-9);
          down = { v: bj, lo: plo, up: (semi && fl < semi) ? 0 : fl }; upc = { v: bj, lo: Math.max(plo, fl + 1, semi && fl + 1 < semi ? semi : 0), up: pup };
          if (childRule === 'nearest') downFirst = (v - fl) < 0.5; else if (childRule === 'up') downFirst = false;
        }
        var cd = down.up >= down.lo ? { path: base.concat([down]), bound: res.objMin } : null;
        var cu = upc.lo <= upc.up ? { path: base.concat([upc]), bound: res.objMin } : null;
        if (cu && card && inCard[bj]) { cu.path = cardClose(cu.path); if (!cu.path) cu = null; }
        if (downFirst) { if (cu) stack.push(cu); if (cd) stack.push(cd); } else { if (cd) stack.push(cd); if (cu) stack.push(cu); }
      }
      return true;
    }
    // with a limit: the choices of the elimination come first, each with a small share of the budget for its amounts
    for (var gi = 0; card && opts.greedy && gi < opts.greedy.length && !(opts.stopAtFirst && incumbent) && now() < deadline; gi++) {
      var gp = cardGreedy(opts.greedy[gi]);
      if (gp) { varRule = 'chronosemi'; childRule = 'down'; dfs(Math.min(deadline, now() + 0.08 * total), gp); }
      applyPath([]);
    }
    for (var ri = 0; ri < rules.length; ri++) {
      if (opts.stopAtFirst && incumbent) break;
      varRule = rules[ri][0]; childRule = rules[ri][1]; cardRule = rules[ri][3] || 'span';
      incomplete = false;
      if (dfs(Math.min(deadline, t0 + (deadline - t0) * rules[ri][2])) && !incomplete) { limit = false; break; }
      if (now() > deadline) break;
    }
    var bound = limit ? Math.min(rootMin, incMin) : incMin;
    if (!incumbent) return { status: limit ? 'unknown' : 'infeasible', x: null, nodes: nodes, bound: sgn * bound + M.objConst, trail: trail };
    return { status: limit ? 'feasible' : 'optimal', x: incumbent, obj: LP.model.objOf(M, incumbent), bound: sgn * bound + M.objConst, nodes: nodes, rejected: rejected, trail: trail };
  }

  LP.simplex = { Dense: Dense, solveLP: solveLP, solveMILP: solveMILP, polish: polish, now: now, work: function () { return WORK; }, pivots: function () { return PIVOTS; } };
})(typeof self !== 'undefined' ? self : globalThis);

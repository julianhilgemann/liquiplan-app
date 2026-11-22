/* ===== handbook/simplex-chart.js: the interactive simplex picture of the theory chapter th-lp =====
   A toy problem with two unknowns and the flavour of the app: how much of 100 (thousand euros) goes into a 12-month
   and how much into a 24-month deposit. It is solved by the app's own embedded simplex, LP.simplex.Dense from
   src/solver/simplex.js, the code the worker falls back to and the branch-and-bound builds on. The solver is watched,
   not imitated: its pivot method is wrapped and its bound flags are observed, so every corner on the path is one that
   code actually visited. Nothing a plan depends on is touched: each Dense starts from its model alone, and the work
   clock it advances only matters relative to the start of a solve.
   Inline SVG rather than ECharts: exact geometry with equal units on both axes, a handle to drag, colours straight
   from the tokens in CSS (so the picture follows the theme by itself), and no wait for the chart library. */
(function () {
  'use strict';
  var LP = window.LP; LP.hb = LP.hb || {}; LP.hb.extra = LP.hb.extra || [];
  var A = LP.app;

  // ---------- the toy problem, in thousand euros ----------
  var G = 0.015, CASH = 100, KEEP = 10, CAP = 60, STEP = 10, DOM = 100, HANDLE_A = 95;
  var DEF = { r12: 2.6, r24: 2.2, Z: 40 }, RANGE = { r12: [0.5, 4, 0.05], r24: [0.5, 4, 0.05], Z: [0, 70, 1] };

  // conditions 1..4 of the picture as half-planes w·(a, b) <= ub, then the two axes a >= 0, b >= 0
  function halfPlanes(p) {
    var r1 = p.r12 / 100;
    return [{ w: [1, 1], ub: CASH - KEEP }, { w: [-(r1 - G), 1 + G], ub: CASH * (1 + G) - KEEP - p.Z },
      { w: [1, 0], ub: CAP }, { w: [0, 1], ub: CAP }, { w: [-1, 0], ub: 0 }, { w: [0, -1], ub: 0 }];
  }
  // gain over the overnight account per thousand euros: one year at r12 instead of g; two years simple at r24 instead of g compounded
  function gains(p) { return [(p.r12 / 100 - G) * (1 + G), 1 + 2 * p.r24 / 100 - (1 + G) * (1 + G)]; }
  // the same problem as LP.model builds its models: conditions 3 and 4 are column bounds, 1 and 2 are rows
  function model(p) {
    var h = halfPlanes(p), c = gains(p);
    return { sense: 'max', objConst: 0, rows: [0, 1].map(function (i) { return { name: 'r' + (i + 1), lb: -Infinity, ub: h[i].ub, idx: [0, 1], val: h[i].w.slice() }; }),
      cols: [{ name: 'a', lb: 0, ub: CAP, int: false, obj: c[0] }, { name: 'b', lb: 0, ub: CAP, int: false, obj: c[1] }] };
  }
  function near(x, y, e) { return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) < e; }

  /* Solve with LP.simplex.Dense and record each corner it reaches. Tableau variables: 0 = a, 1 = b, 2 and 3 = the
     slacks of conditions 1 and 2. A step ends in a pivot (variable `hit` leaves the basis at a bound) or in a bound
     flip (the entering variable reaches its own other bound first, `hit` = itself). Steps that do not move are merged. */
  function walk(p) {
    var M = model(p), S = new LP.simplex.Dense(M), N = S.N, flags = S.atUp, pivot = S.pivot, steps = [], st;
    function at(j) { return flags[j] ? S.ub[j] : S.lb[j]; }
    function point() { // read from the tableau without touching the solver's own values
      var x = [at(0), at(1)], i, j;
      for (i = 0; i < S.m; i++) {
        var bi = S.basis[i]; if (bi > 1) continue;
        var row = S.tab[i], v = row[N];
        for (j = 0; j < N; j++) if (!S.inBasis[j] && row[j]) v -= row[j] * at(j);
        x[bi] = v;
      }
      return x;
    }
    function gain(j) { return (flags[j] ? 1 : -1) * S.d[j]; } // objective per unit as j leaves its bound (d belongs to the minimised -z)
    function push(ev) { ev.x = point(); if (!near(ev.x, steps[steps.length - 1].x, 1e-9)) steps.push(ev); }
    steps.push({ x: point() });
    S.pivot = function (r, q) { var ev = { q: q, dir: flags[q] ? -1 : 1, gain: gain(q), hit: this.basis[r] }; pivot.call(this, r, q); ev.up = !!flags[ev.hit]; push(ev); };
    S.atUp = new Proxy(flags, { set: function (o, k, v) {
      var j = +k;
      if (!S.inBasis[j] && o[j] !== +v) { var ev = { q: j, dir: o[j] ? -1 : 1, gain: gain(j), hit: j, up: !!+v }; o[j] = v; push(ev); return true; } // a flip; leaving variables are still basic here
      o[j] = v; return true;
    } });
    try { st = S.solveLP(); } finally { S.atUp = flags; delete S.pivot; }
    var x = st === 'optimal' ? S.x() : null, c = gains(p);
    if (x && !near(x, steps[steps.length - 1].x, 1e-7)) steps.push({ x: [x[0], x[1]] });
    return { status: st, steps: steps, x: x ? [x[0], x[1]] : null, z: x ? c[0] * x[0] + c[1] * x[1] : null, c: c };
  }

  // ---------- brute force: every corner, every whole step ----------
  function ok(h, x) { for (var i = 0; i < h.length; i++) if (h[i].w[0] * x[0] + h[i].w[1] * x[1] > h[i].ub + 1e-9 * (1 + Math.abs(h[i].ub))) return false; return true; }
  function tight(h, x) { return h.map(function (c) { return Math.abs(c.w[0] * x[0] + c.w[1] * x[1] - c.ub) < 1e-6 * (1 + Math.abs(c.ub)); }); }
  function corners(p) {
    var h = halfPlanes(p), out = [], i, j, cx = 0, cy = 0;
    for (i = 0; i < h.length; i++) for (j = i + 1; j < h.length; j++) {
      var u = h[i].w, v = h[j].w, det = u[0] * v[1] - u[1] * v[0];
      if (Math.abs(det) < 1e-12) continue;
      var x = [(h[i].ub * v[1] - u[1] * h[j].ub) / det, (u[0] * h[j].ub - h[i].ub * v[0]) / det];
      if (ok(h, x) && !out.some(function (y) { return near(x, y, 1e-7); })) out.push(x);
    }
    out.forEach(function (x) { cx += x[0] / out.length; cy += x[1] / out.length; });
    return out.sort(function (x, y) { return Math.atan2(x[1] - cy, x[0] - cx) - Math.atan2(y[1] - cy, y[0] - cx); });
  }
  function grid(p) {
    var h = halfPlanes(p), c = gains(p), pts = [], best = null, a, b;
    for (a = 0; a <= CAP; a += STEP) for (b = 0; b <= CAP; b += STEP) if (ok(h, [a, b])) { var z = c[0] * a + c[1] * b; pts.push([a, b]); if (!best || z > best.z + 1e-12) best = { x: [a, b], z: z }; }
    return { pts: pts, best: best };
  }

  // ---------- drawing helpers ----------
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function f1(v) { return Math.round(v * 10) / 10; }
  function seg(w, ub) { // the part of the line w·x = ub inside the plotted square
    var pts = [], e = 1e-9;
    if (Math.abs(w[1]) > e) [0, DOM].forEach(function (a) { var b = (ub - w[0] * a) / w[1]; if (b >= -e && b <= DOM + e) pts.push([a, b]); });
    if (Math.abs(w[0]) > e) [0, DOM].forEach(function (b) { var a = (ub - w[1] * b) / w[0]; if (a >= -e && a <= DOM + e) pts.push([a, b]); });
    var best = null, d = -1;
    pts.forEach(function (p) { pts.forEach(function (q) { var dd = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]); if (dd > d) { d = dd; best = [p, q]; } }); });
    return d > 1e-6 ? best : null;
  }
  function onLine(h, a) { return [a, (h.ub - h.w[0] * a) / h.w[1]]; } // a point of condition 2 (its b coefficient is never 0)

  /* Mount the chart into `host`. L: the strings of one language (theory-de.js / theory-en.js). Returns { destroy }. */
  function mount(host, L) {
    var el = A.el, NF1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
    var st = { p: { r12: DEF.r12, r24: DEF.r24, Z: DEF.Z }, k: 0, grid: false, run: null, gr: null, cs: null, dead: false, play: 0, anim: 0, ann: 0, drag: null };
    var lay = null; // { L, T, side, sc, w, h }
    function X(a) { return lay.L + a * lay.sc; }
    function Y(b) { return lay.T + lay.side - b * lay.sc; }
    function eur(v) { return ((v > 0.0005 ? '+' : '') + A.eur(v * 1000)).replace(' €', '\u00a0€'); }
    function coord(x) { return L.corner.replace(/ = /g, '\u00a0=\u00a0').replace('{a}', NF1.format(f1(x[0]) + 0)).replace('{b}', NF1.format(f1(x[1]) + 0)); }

    // ----- markup -----
    var svg = svgEl('svg', { class: 'th-svg', role: 'img', 'aria-label': L.aria, tabindex: '0', 'aria-describedby': 'th-lp-status', focusable: 'true' });
    var gFrame = svgEl('g', {}), gModel = svgEl('g', {}), gLines = svgEl('g', {}), gDyn = svgEl('g', {}), gGrid = svgEl('g', {});
    var handle = svgEl('g', { class: 'th-hd', 'aria-hidden': 'true' });
    var hit = svgEl('circle', { class: 'th-hit', r: '22' });
    handle.appendChild(hit); handle.appendChild(svgEl('circle', { class: 'th-knob', r: '7.5' })); handle.appendChild(svgEl('path', { class: 'th-grip', d: 'M-3.5 -2h7M-3.5 0.5h7M-3.5 3h7' }));
    [gFrame, gModel, gLines, gDyn, gGrid, handle].forEach(function (g) { svg.appendChild(g); });
    var bBack = el('button', { type: 'button', class: 'btn sm', text: '‹ ' + L.back, onclick: function () { stop(); go(st.k - 1); } });
    var bNext = el('button', { type: 'button', class: 'btn sm', text: L.next + ' ›', onclick: function () { stop(); go(st.k + 1); } });
    var bPlay = el('button', { type: 'button', class: 'btn sm', text: L.play, 'aria-pressed': 'false', onclick: function () { if (st.play) stop(); else play(); } });
    var bReset = el('button', { type: 'button', class: 'btn sm', text: L.reset, onclick: function () { stop(); go(0, true); } });
    var status = el('div', { class: 'th-status', id: 'th-lp-status' }), live = el('div', { class: 'sr', 'aria-live': 'polite' });
    var legend = el('ol', { class: 'th-leg' }), items = L.cons.map(function (txt, i) {
      var li = el('li', null, el('span', { class: 'th-num', 'aria-hidden': 'true', text: String(i + 1) }), el('span', null, txt + ' ', el('span', { class: 'pill neutral hide', text: L.binding })));
      legend.appendChild(li); return li;
    });
    var inputs = {};
    function slider(key, label, fmt) {
      var r = RANGE[key], id = 'th-lp-' + key.toLowerCase();
      var inp = el('input', { type: 'range', id: id, min: r[0], max: r[1], step: r[2], value: st.p[key] }), out = el('output', { for: id, text: fmt(st.p[key]) });
      inp.setAttribute('aria-valuetext', fmt(st.p[key]));
      function sync() { out.textContent = fmt(st.p[key]); inp.setAttribute('aria-valuetext', out.textContent); }
      inp.addEventListener('input', function () { st.p[key] = +inp.value; sync(); changed(); });
      inputs[key] = { inp: inp, sync: sync };
      return el('div', { class: 'th-sl' }, el('div', { class: 'th-sl-h' }, el('label', { for: id, text: label }), out), inp);
    }
    var pct = function (v) { return A.pct(v, 2); }, keur = function (v) { return A.eur(v * 1000); };
    var gridBox = el('input', { type: 'checkbox', onchange: function () { st.grid = gridBox.checked; drawModel(); describe(); } });
    var fig = el('figure', { class: 'card th-fig tex2jax_ignore' },
      el('figcaption', { class: 'th-fig-h' }, el('strong', { text: L.title }), el('span', { class: 'muted small', text: L.sub })),
      el('div', { class: 'th-fig-grid' },
        el('div', { class: 'th-main' }, el('div', { class: 'th-plot' }, svg), el('div', { class: 'th-ctl' }, bBack, bNext, bPlay, bReset), status, live),
        el('div', { class: 'th-side' }, legend, slider('r12', L.r12, pct), slider('r24', L.r24, pct), slider('Z', L.z, keur),
          el('label', { class: 'chk th-gridchk' }, gridBox, el('span', { text: L.grid })), el('p', { class: 'small muted th-hint', text: L.hint }))));
    host.appendChild(fig);

    // ----- layout and drawing -----
    function layout() {
      var w = Math.max(240, Math.min(560, host.querySelector('.th-plot').clientWidth || 300)), Lm = 34, R = 14, T = 22, B = 34;
      var side = Math.min(w - Lm - R, 420);
      lay = { L: Lm, T: T, side: side, sc: side / DOM, w: Lm + side + R, h: T + side + B };
      svg.setAttribute('viewBox', '0 0 ' + lay.w + ' ' + lay.h); svg.setAttribute('width', lay.w); svg.setAttribute('height', lay.h);
      var s = '', v;
      for (v = 0; v <= DOM; v += 20) {
        s += '<line class="th-gl" x1="' + X(v) + '" y1="' + Y(0) + '" x2="' + X(v) + '" y2="' + Y(DOM) + '"/><line class="th-gl" x1="' + X(0) + '" y1="' + Y(v) + '" x2="' + X(DOM) + '" y2="' + Y(v) + '"/>';
        s += '<text class="th-tk" x="' + X(v) + '" y="' + (Y(0) + 15) + '" text-anchor="middle">' + v + '</text><text class="th-tk" x="' + (X(0) - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>';
      }
      s += '<line class="th-ax" x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(DOM) + '" y2="' + Y(0) + '"/><line class="th-ax" x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(0) + '" y2="' + Y(DOM) + '"/>';
      s += '<text class="th-at" x="' + X(DOM) + '" y="' + (lay.h - 4) + '" text-anchor="end">' + A.esc(L.axA) + '</text><text class="th-at" x="' + (X(0) - 2) + '" y="13">' + A.esc(L.axB) + '</text>';
      gFrame.innerHTML = s;
      drawModel(); frame(null);
    }
    function drawModel() {
      var s = '', cs = st.cs;
      if (cs.length > 2) s += '<polygon class="th-reg" points="' + cs.map(function (x) { return X(x[0]) + ',' + Y(x[1]); }).join(' ') + '"/>';
      cs.forEach(function (x) { s += '<circle class="th-corner" r="3.5" cx="' + X(x[0]) + '" cy="' + Y(x[1]) + '"/>'; });
      gModel.innerHTML = s; s = '';
      if (st.grid) { // on top of the path: the best grid point often sits right beside the LP corner
        st.gr.pts.forEach(function (x) { s += '<circle class="th-gp" r="2.25" cx="' + X(x[0]) + '" cy="' + Y(x[1]) + '"/>'; });
        var g = st.gr.best.x; s += '<rect class="th-gb" width="11" height="11" rx="2" x="' + (X(g[0]) - 5.5) + '" y="' + (Y(g[1]) - 5.5) + '"/>';
      }
      gGrid.innerHTML = s;
      var h2 = halfPlanes(st.p)[1], hp = onLine(h2, HANDLE_A);
      handle.setAttribute('transform', 'translate(' + X(hp[0]) + ' ' + Y(Math.max(0, Math.min(DOM, hp[1]))) + ')');
    }
    // the moving parts: lines with their badges, path, objective contour, gradient arrow and the current corner.
    // mv = null: at step st.k; mv = { from, to, t }: between two steps while animating
    function frame(mv) {
      var steps = st.run.steps, h = halfPlanes(st.p), c = st.run.c, k = mv ? Math.min(mv.from, mv.to) : st.k, s = '', i;
      var x = mv ? [steps[mv.from].x[0] + (steps[mv.to].x[0] - steps[mv.from].x[0]) * mv.t, steps[mv.from].x[1] + (steps[mv.to].x[1] - steps[mv.from].x[1]) * mv.t] : steps[st.k].x;
      var tt = mv ? [false, false, false, false] : tight(h, x), lbl = [[84, 6], null, [60, 94], [70, 60]];
      for (i = 0; i < 4; i++) {
        var sg = seg(h[i].w, h[i].ub); if (!sg) continue;
        s += '<line class="th-cl' + (tt[i] ? ' on' : '') + '" x1="' + X(sg[0][0]) + '" y1="' + Y(sg[0][1]) + '" x2="' + X(sg[1][0]) + '" y2="' + Y(sg[1][1]) + '"/>';
        var at = lbl[i] || onLine(h[i], 82);
        if (at[1] > 2 && at[1] < DOM - 2) s += '<g class="th-bd' + (tt[i] ? ' on' : '') + '"><circle r="8" cx="' + X(at[0]) + '" cy="' + Y(at[1]) + '"/><text x="' + X(at[0]) + '" y="' + (Y(at[1]) + 3.8) + '" text-anchor="middle">' + (i + 1) + '</text></g>';
      }
      gLines.innerHTML = s; s = '';
      var z = c[0] * x[0] + c[1] * x[1], sc = seg(c, z), len = Math.sqrt(c[0] * c[0] + c[1] * c[1]);
      if (sc && len > 1e-9) {
        s += '<line class="th-obj" x1="' + X(sc[0][0]) + '" y1="' + Y(sc[0][1]) + '" x2="' + X(sc[1][0]) + '" y2="' + Y(sc[1][1]) + '"/>';
        var ux = c[0] / len, uy = -c[1] / len, px = X(x[0]), py = Y(x[1]), ex = px + 30 * ux, ey = py + 30 * uy;
        s += '<line class="th-arr" x1="' + px + '" y1="' + py + '" x2="' + ex + '" y2="' + ey + '"/><path class="th-arrh" d="M' + (ex + 7 * ux) + ' ' + (ey + 7 * uy) + 'L' + (ex - 4 * uy) + ' ' + (ey + 4 * ux) + 'L' + (ex + 4 * uy) + ' ' + (ey - 4 * ux) + 'Z"/>';
      }
      var pts = steps.slice(0, k + 1).map(function (q) { return q.x; }); if (mv) pts.push(x);
      if (pts.length > 1) s += '<polyline class="th-path" points="' + pts.map(function (q) { return X(q[0]) + ',' + Y(q[1]); }).join(' ') + '"/>';
      steps.slice(0, k + 1).forEach(function (q) { s += '<circle class="th-vis" r="3.5" cx="' + X(q.x[0]) + '" cy="' + Y(q.x[1]) + '"/>'; });
      if (!mv && st.k === steps.length - 1) s += '<circle class="th-ring" r="11" cx="' + X(x[0]) + '" cy="' + Y(x[1]) + '"/>';
      s += '<circle class="th-cur" r="6.5" cx="' + X(x[0]) + '" cy="' + Y(x[1]) + '"/>';
      gDyn.innerHTML = s;
      if (!mv) items.forEach(function (li, j) { li.classList.toggle('on', tt[j]); li.querySelector('.pill').classList.toggle('hide', !tt[j]); });
    }

    // ----- the words: where the walk stands, what the last step did, and the cross-checks -----
    function moveText(ev) {
      var who = ev.q < 2 ? L.vars[ev.q] : L.slack.replace('{i}', ev.q - 1), verb = ev.q < 2 ? (ev.dir > 0 ? L.up : L.down) : L.away;
      var stop = ev.hit < 2 ? (ev.up ? L.hits.replace('{i}', ev.hit + 3) : L.zero[ev.hit]) : L.hits.replace('{i}', ev.hit - 1);
      return L.move.replace('{v}', who).replace('{verb}', verb).replace('{g}', A.eur2(ev.gain * 1000)).replace('{w}', stop);
    }
    function describe(quiet) {
      var steps = st.run.steps, last = steps.length - 1, q = steps[st.k], c = st.run.c, z = c[0] * q.x[0] + c[1] * q.x[1], p = [];
      var head = (st.k === 0 ? L.start : L.step.replace('{i}', st.k).replace('{n}', last)) + ' · ' + coord(q.x);
      p.push('<p class="th-st1"><strong>' + A.esc(head) + '</strong>' + (st.k === last ? ' <span class="pill ok">' + A.esc(L.optimum) + '</span>' : '') + '</p>');
      p.push('<p>' + A.esc(L.gain.replace('{z}', eur(z))) + '</p>');
      var why = st.k === 0 ? (last === 0 ? L.startOpt : L.startTxt) : moveText(q);
      if (st.k === last && st.k > 0) why += ' ' + L.done;
      p.push('<p>' + A.esc(why) + '</p>');
      if (st.k === last) {
        var best = -Infinity; st.cs.forEach(function (x) { best = Math.max(best, c[0] * x[0] + c[1] * x[1]); });
        var good = st.run.status === 'optimal' && st.run.z >= best - 1e-9 * (1 + Math.abs(best));
        p.push('<p class="small muted">' + A.esc(good ? L.check.replace('{n}', st.cs.length) : L.checkBad) + '</p>');
      }
      if (st.grid) {
        var gb = st.gr.best, d = (st.run.z - gb.z) * 1000;
        p.push('<p class="small">' + A.esc(d < 0.5 ? L.gridSame.replace('{z}', eur(gb.z)) : L.gridTxt.replace('{p}', coord(gb.x)).replace('{z}', eur(gb.z)).replace('{d}', A.eur(d)).replace('{lp}', eur(st.run.z))) + '</p>');
      }
      status.innerHTML = p.join('');
      fig.setAttribute('data-step', st.k); fig.setAttribute('data-steps', last); fig.setAttribute('data-a', q.x[0]); fig.setAttribute('data-b', q.x[1]);
      fig.setAttribute('data-opt', st.run.x ? st.run.x.join(' ') : ''); fig.setAttribute('data-z', st.run.z);
      bBack.disabled = st.k === 0; bNext.disabled = st.k === last;
      clearTimeout(st.ann); // the screen reader hears the state once things stop moving
      st.ann = setTimeout(function () { live.textContent = status.textContent; }, quiet ? 450 : 60);
    }

    // ----- stepping, playing, changing -----
    function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
    function go(k, instant) {
      var last = st.run.steps.length - 1; k = Math.max(0, Math.min(last, k));
      cancelAnimationFrame(st.anim); st.anim = 0;
      if (k === st.k) { frame(null); describe(); return; }
      var from = st.k; st.k = k;
      if (instant || reduced() || Math.abs(k - from) !== 1) { frame(null); describe(); return; }
      var t0 = null, dur = 420;
      (function tick(ts) {
        if (st.dead) return;
        if (t0 == null) t0 = ts;
        var t = Math.min(1, (ts - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
        if (t < 1) { frame({ from: from, to: k, t: e }); st.anim = requestAnimationFrame(tick); } else { st.anim = 0; frame(null); }
      })(performance.now());
      describe();
    }
    function play() {
      if (st.k >= st.run.steps.length - 1) go(0, true);
      bPlay.textContent = L.pause; bPlay.setAttribute('aria-pressed', 'true');
      (function next() { st.play = setTimeout(function () { go(st.k + 1); if (st.k < st.run.steps.length - 1) next(); else stop(); }, 1100); })();
    }
    function stop() { clearTimeout(st.play); st.play = 0; bPlay.textContent = L.play; bPlay.setAttribute('aria-pressed', 'false'); }
    function solve() { st.run = walk(st.p); st.cs = corners(st.p); st.gr = grid(st.p); }
    function changed() { stop(); cancelAnimationFrame(st.anim); st.anim = 0; solve(); st.k = st.run.steps.length - 1; drawModel(); frame(null); describe(true); } // a change shows where the optimum went

    // ----- dragging condition 2 at its handle (the payment Z); a finger on the handle does not scroll the page -----
    function dragTo(e) {
      var r = svg.getBoundingClientRect(), py = (e.clientY - r.top) * lay.h / r.height, b = (lay.T + lay.side - py) / lay.sc;
      var r1 = st.p.r12 / 100, Z = CASH * (1 + G) - KEEP - ((1 + G) * b - (r1 - G) * HANDLE_A);
      Z = Math.max(RANGE.Z[0], Math.min(RANGE.Z[1], Math.round(Z)));
      if (Z !== st.p.Z) { st.p.Z = Z; inputs.Z.inp.value = Z; inputs.Z.sync(); changed(); }
    }
    hit.addEventListener('pointerdown', function (e) { e.preventDefault(); st.drag = e.pointerId; try { hit.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } handle.classList.add('drag'); });
    hit.addEventListener('pointermove', function (e) { if (st.drag === e.pointerId) dragTo(e); });
    function endDrag() { st.drag = null; handle.classList.remove('drag'); }
    hit.addEventListener('pointerup', endDrag); hit.addEventListener('pointercancel', endDrag); hit.addEventListener('lostpointercapture', endDrag);
    hit.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    svg.addEventListener('keydown', function (e) {
      var k = { ArrowRight: st.k + 1, ArrowDown: st.k + 1, ArrowLeft: st.k - 1, ArrowUp: st.k - 1, Home: 0, End: st.run.steps.length - 1 }[e.key];
      if (k == null) return;
      e.preventDefault(); stop(); go(k, e.key === 'Home' || e.key === 'End');
    });

    solve();
    var ro = null, raf = 0;
    function relayout() { cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { if (!st.dead) layout(); }); }
    if (window.ResizeObserver) { ro = new ResizeObserver(relayout); ro.observe(host); } else window.addEventListener('resize', relayout);
    layout(); describe(true);
    return {
      destroy: function () {
        st.dead = true; stop(); clearTimeout(st.ann); cancelAnimationFrame(st.anim); cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', relayout);
        if (fig.parentNode) fig.parentNode.removeChild(fig);
      }
    };
  }

  LP.hb.lpChart = { mount: mount, model: model, walk: walk, corners: corners, grid: grid, gains: gains, halfPlanes: halfPlanes, DEF: DEF };
})();

/* ===== ui/solver-client.js: solver client (Web Worker with watchdog; main-thread fallback) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, C = LP.core, $ = A.$;

  var S = A.solver = { worker: null, jobs: {}, seq: 0, skip: {}, info: { solver: null, chain: [], demoted: [] }, ready: false, mainOnly: false, wd: null, gen: 0 };
  var SKIPKEY = 'liquiditaetsplaner:solver-skip'; // a backend that hung on this device is not tried again for a week
  try { var sk = JSON.parse(window.localStorage.getItem(SKIPKEY) || 'null'); if (sk && sk.until > Date.now() && sk.jslp) S.skip.jslp = sk.jslp; } catch (e) { /* ignore */ }
  function rememberSkip() { try { window.localStorage.setItem(SKIPKEY, JSON.stringify({ until: Date.now() + 7 * 864e5, jslp: S.skip.jslp || null })); } catch (e) { /* ignore */ } }
  function workerSource() { return $('src-core').textContent + '\n' + $('src-solver').textContent; }
  S.start = function () {
    S.ready = false;
    if (S.mainOnly) return;
    try {
      var url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
      var w = new Worker(url), gen = ++S.gen;
      S.worker = w;
      w.onmessage = function (ev) { if (gen === S.gen) S.onMsg(ev.data); };
      w.onerror = function (e) { if (gen !== S.gen) return; if (e.preventDefault) e.preventDefault(); S.toMain('worker error'); };
      w.postMessage({ type: 'init', cdn: { highs: A.CDN.highs, jslp: A.CDN.jslp }, skip: S.skip });
      S.arm('init', 30000);
    } catch (e) { S.toMain(String(e && e.message || e)); }
  };
  S.toMain = function (why) { // no worker available: run the embedded solver on the main thread
    S.kill(); S.mainOnly = true; S.ready = true; S.info.solver = new LP.solve.EmbeddedBackend().name; S.info.chain = [{ name: 'Worker', ok: false, error: why }, { name: 'embedded', ok: true }];
    if (A.onSolverInfo) A.onSolverInfo();
    Object.keys(S.jobs).forEach(function (id) { S.runMain(S.jobs[id]); });
  };
  S.kill = function () { clearTimeout(S.wd); if (S.worker) { try { S.worker.terminate(); } catch (e) { /* ignore */ } S.worker = null; } S.gen++; S.ready = false; };
  S.arm = function (name, ms) {
    clearTimeout(S.wd);
    S.wd = setTimeout(function () { // the worker is stuck: drop the backend that hung and restart
      if (name === 'HiGHS') S.skip.highs = 'timeout'; else if (name === 'javascript-lp-solver') S.skip.jslp = 'timeout';
      else if (name === 'init') { if (!S.skip.highs) S.skip.highs = 'timeout'; else S.skip.jslp = 'timeout'; }
      else { S.toMain('timeout'); return; }
      S.info.demoted.push({ name: name, why: 'timeout' }); rememberSkip();
      S.kill(); S.start();
      Object.keys(S.jobs).forEach(function (id) { S.send(S.jobs[id]); });
    }, ms);
  };
  S.onMsg = function (m) {
    if (m.type === 'ready') { S.ready = true; clearTimeout(S.wd); S.info.solver = m.solver; S.info.chain = m.chain; if (A.onSolverInfo) A.onSolverInfo(); }
    else if (m.type === 'beat') S.arm(m.name, m.budget);
    else if (m.type === 'demoted') { S.info.demoted.push({ name: m.name, why: m.why }); if (m.name === 'javascript-lp-solver') { S.skip.jslp = m.why; rememberSkip(); } }
    else if (m.type === 'progress') { var j = S.jobs[m.id]; if (j && j.onProgress) j.onProgress(m); }
    else if (m.type === 'result' || m.type === 'error') {
      var job = S.jobs[m.id]; if (!job) return;
      delete S.jobs[m.id];
      if (!Object.keys(S.jobs).length) clearTimeout(S.wd);
      if (m.type === 'result') { if (m.result.solver) S.info.solver = m.result.solver; job.resolve(m.result); } else job.reject(new Error(m.message));
    }
  };
  S.send = function (job) { if (S.worker) S.worker.postMessage({ type: 'solve', id: job.id, state: job.state, over: job.over, cfg: job.cfg }); };
  S.runMain = function (job) {
    setTimeout(function () {
      if (!S.jobs[job.id]) return;
      var P = C.prepare(job.state, job.over);
      LP.solve.optimize(P, job.cfg, new LP.solve.Engine(null), job.onProgress || function () { }).then(function (r) { delete S.jobs[job.id]; job.resolve(r); }, function (e) { delete S.jobs[job.id]; job.reject(e); });
    }, 20);
  };
  S.solve = function (state, over, cfg, onProgress) {
    return new Promise(function (resolve, reject) {
      var job = { id: ++S.seq, state: JSON.parse(JSON.stringify(state)), over: over || null, cfg: cfg, onProgress: onProgress, resolve: resolve, reject: reject };
      S.jobs[job.id] = job;
      if (S.mainOnly) S.runMain(job); else { if (!S.worker) S.start(); S.send(job); }
    });
  };
  S.cancelAll = function () { // a running solve cannot be interrupted: restart the worker
    var had = Object.keys(S.jobs).length > 0;
    Object.keys(S.jobs).forEach(function (id) { var j = S.jobs[id]; delete S.jobs[id]; j.reject(new Error('cancelled')); });
    if (had && !S.mainOnly) { S.kill(); S.start(); }
  };
})();

/* ===== workerglue.js: message protocol of the solver worker =====
   Chain: HiGHS (WebAssembly, jsDelivr) -> javascript-lp-solver (jsDelivr) -> embedded simplex + B&B. */
(function (root) {
  'use strict';
  var LP = root.LP;
  if (typeof WorkerGlobalScope === 'undefined' || !(root instanceof WorkerGlobalScope)) return; // only inside the worker
  var engine = null, chain = [], ready = null, queue = Promise.resolve();
  function post(m) { root.postMessage(m); }
  function withTimeout(p, ms, what) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error(what + ': timeout')); }, ms); })]); }
  function msg(e) { return String(e && e.message || e).slice(0, 160); }

  async function init(cfg) {
    var primary = null, skip = cfg.skip || {};
    if (skip.highs) chain.push({ name: 'HiGHS', ok: false, error: skip.highs });
    else {
      try {
        root.importScripts(cfg.cdn.highs);
        var base = cfg.cdn.highs.replace(/[^/]+$/, '');
        var hb = new LP.solve.HighsBackend(function () { return root.Module({ locateFile: function (f) { return base + f; } }); });
        await withTimeout(hb.init(), 20000, 'HiGHS');
        primary = hb; chain.push({ name: 'HiGHS', ok: true });
      } catch (e) { chain.push({ name: 'HiGHS', ok: false, error: msg(e) }); }
    }
    if (!primary) {
      if (skip.jslp) chain.push({ name: 'javascript-lp-solver', ok: false, error: skip.jslp });
      else {
        try {
          root.importScripts(cfg.cdn.jslp);
          var jb = new LP.solve.JsLpBackend(root.solver);
          await jb.init();
          primary = jb; chain.push({ name: 'javascript-lp-solver', ok: true });
        } catch (e2) { chain.push({ name: 'javascript-lp-solver', ok: false, error: msg(e2) }); }
      }
    }
    chain.push({ name: 'embedded', ok: true });
    engine = new LP.solve.Engine(primary, {
      beat: function (name, budget) { post({ type: 'beat', name: name, budget: budget }); },
      demoted: function (name, why, detail) { post({ type: 'demoted', name: name, why: why, detail: detail }); }
    });
    post({ type: 'ready', solver: engine.active().name, chain: chain });
  }
  async function solve(m) {
    try {
      await ready;
      var P = LP.core.prepare(m.state, m.over);
      engine.stats = { lp: 0, milp: 0, fallbacks: 0, by: {} };
      var res = await LP.solve.optimize(P, m.cfg, engine, function (p) { p.type = 'progress'; p.id = m.id; post(p); });
      post({ type: 'result', id: m.id, result: res });
    } catch (e) { post({ type: 'error', id: m.id, message: String(e && e.stack || e).slice(0, 500) }); }
  }
  root.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.type === 'init') ready = init(m);
    else if (m.type === 'solve') queue = queue.then(function () { return solve(m); });
  };
})(typeof self !== 'undefined' ? self : globalThis);

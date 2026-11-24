/* ===== ui/state.js: state (the inputs in A.state: defaults, normalisation, the copy in localStorage) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, C = LP.core, $ = A.$;

  function readEmbedded() { try { return JSON.parse($('embedded-state').textContent) || {}; } catch (e) { return {}; } }
  var embedded = readEmbedded();
  A.docId = embedded.docId || 'artifact';
  var STORE = 'liquiditaetsplaner:' + A.docId;
  var DEFAULTS = { v: 1, lang: 'de', presetId: 'custom', rateScenario: 'current', horizon: 120, giro: 0, tg: 0, tgRate: 0, tgBank: '', baseRate: 2.5,
    need: 0, needIdx: 3, needStart: '', buffer: 0, lead: 1, denom: 100, naiveReserve: 3, unlimited: false, wizDone: false };
  function normalize(s) {
    if (s && s.presetId === 'on' + 'kel') s.presetId = 'g';
    var k, d = new Date();
    s = s && typeof s === 'object' ? s : {};
    for (k in DEFAULTS) if (s[k] == null) s[k] = DEFAULTS[k];
    if (!C.parseISO(s.startDate)) s.startDate = C.iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    s.tax = Object.assign({ on: false, church: 0, allowance: 1000 }, s.tax || {});
    s.bankCap = Object.assign({ on: false, cap: 100000 }, s.bankCap || {});
    s.trancheCap = Object.assign({ on: false, max: 6 }, s.trancheCap || {}); // at most `max` new deposits in the plan (pinned ones count)
    s.trancheCap.on = !!s.trancheCap.on; s.trancheCap.max = isFinite(+s.trancheCap.max) && +s.trancheCap.max >= 1 ? Math.min(999, Math.round(+s.trancheCap.max)) : 6;
    s.unlimited = s.unlimited === true; // search on without a time limit after the plan of the usual budgets
    s.weekly = Object.assign({ on: +s.tg > 0 || +s.tgRate > 0, nextDate: '' }, s.weekly || {});
    ['products', 'existing', 'streams', 'oneoffs', 'pins', 'rateEvents'].forEach(function (key) { if (!Array.isArray(s[key])) s[key] = []; s[key].forEach(function (r, i) { if (!r.id) r.id = key[0] + Date.now().toString(36) + i; }); });
    ['overrides', 'stash', 'sec'].forEach(function (key) { if (!s[key] || typeof s[key] !== 'object') s[key] = {}; });
    if (C.scenariosFor(s).indexOf(s.rateScenario) < 0) s.rateScenario = 'current';
    s.v = 1;
    return s;
  }
  A.normalize = normalize;
  A.blankState = function (lang) { // nothing entered yet: the app opens on the blank slate
    var d = new Date();
    return normalize({ lang: lang || 'de', presetId: 'custom', startDate: C.iso(d.getFullYear(), d.getMonth() + 1, d.getDate()), weekly: { on: false, nextDate: '' }, sec: { events: false, deposits: false, flows: false, offers: false }, products: [] });
  };
  function loadState() {
    try { var raw = window.localStorage.getItem(STORE); if (raw) { var o = JSON.parse(raw); if (o && o.v === 1) return normalize(o); } } catch (e) { /* storage unavailable */ }
    if (embedded.state) return normalize(embedded.state);
    return A.blankState();
  }
  A.state = loadState();
  var saveTimer = null;
  A.save = function () { clearTimeout(saveTimer); saveTimer = setTimeout(function () { try { window.localStorage.setItem(STORE, JSON.stringify(A.state)); } catch (e) { /* ignore */ } }, 300); };
})();

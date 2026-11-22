/* ===== main.js: JSON dialogs, event wiring and start-up ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, $ = A.$, t = A.t;
  var stamp = A.stamp; // export.js

  // ---------- JSON dialogs ----------
  var modalApply = null, modalName = 'daten.json';
  function openModal(title, hint, text, fileName, onApply) {
    $('modalTitle').textContent = title; $('modalHint').textContent = hint; $('modalText').value = text; modalApply = onApply; modalName = fileName;
    $('modalApply').classList.toggle('hide', !onApply); $('modalFile').classList.toggle('hide', !onApply); $('modalFile').value = '';
    behind(true); $('modal').classList.add('open'); $('modalText').focus();
  }
  function behind(on) { [document.querySelector('.top'), $('wizard'), $('shell')].forEach(function (n) { if (n) n.inert = on; }); } // as the progress dialog does
  function closeModal() {
    if (!$('modal').classList.contains('open')) return;
    $('modal').classList.remove('open'); behind(false);
    try { $('btnMenu').focus(); } catch (e) { /* ignore */ } // back to where the dialog was opened from
  }
  function applyState(obj) { // accepts our own state or the wizard JSON of specification G; nothing is changed unless the whole input is valid
    if (LP.wizardJson.is(obj)) obj = LP.wizardJson.read(obj);
    else if (obj && obj.state && typeof obj.state === 'object') obj = obj.state;
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.products)) throw new Error('products');
    var keepLang = A.lang, done = A.state.wizDone; A.state = A.normalize(JSON.parse(JSON.stringify(obj))); A.state.lang = keepLang; A.state.wizDone = done; if (LP.presetIds.indexOf(A.state.presetId) >= 0) A.state.presetId = 'custom';
    A.save(); A.renderStatic(); A.renderSide(); A.markStale(); // imported inputs wait for "Optimieren" like any other change
  }
  A.applyState = applyState;
  function ratesOf(s) { return { tgRate: +s.tgRate, tgBank: s.tgBank || '', products: s.products.map(function (p) { return { id: p.id, term: +p.term, rate: +p.rate, bank: p.bank || '', min: +p.min || 0, max: +p.max || 0, conv: p.conv || 'simple', on: p.on !== false }; }) }; }
  function applyRates(obj) {
    if (!obj || !Array.isArray(obj.products)) throw new Error('products');
    A.touch(function (st) {
      if (obj.tgRate != null && isFinite(+obj.tgRate)) st.tgRate = +obj.tgRate; if (obj.tgBank != null) st.tgBank = String(obj.tgBank);
      st.products = obj.products.filter(function (p) { return p && +p.term >= 1; }).map(function (p, i) { return { id: p.id || ('p' + (i + 1)), term: Math.round(+p.term), rate: +p.rate || 0, bank: String(p.bank || ''), min: +p.min || 0, max: +p.max || 100000, conv: ['simple', 'annual', 'compound'].indexOf(p.conv) >= 0 ? p.conv : 'simple', on: p.on !== false }; });
      var ids = {}; st.products.forEach(function (p) { ids[p.id] = 1; }); st.pins = st.pins.filter(function (pn) { return ids[pn.productId]; });
    }, true);
  }

  // ---------- events ----------
  function isNarrow() { return window.matchMedia('(max-width: 1100px)').matches; }
  function syncInputsBtn() { var sh = $('shell'), open = isNarrow() ? sh.classList.contains('drawer') : !sh.classList.contains('side-off'); $('btnInputs').setAttribute('aria-expanded', open ? 'true' : 'false'); }
  function toggleSide(force) {
    var sh = $('shell');
    if (isNarrow()) sh.classList.toggle('drawer', force != null ? force : !sh.classList.contains('drawer'));
    else sh.classList.toggle('side-off', force != null ? !force : !sh.classList.contains('side-off'));
    syncInputsBtn();
    A.resizeCharts();
  }
  function setLang(l) { A.lang = l; A.state.lang = l; A.save(); A.renderStatic(); A.renderSide(); A.renderAll(); A.onSolverInfo(); A.wizard.render(); A.replay.render(); }
  function wire() {
    $('btnInputs').onclick = function () { toggleSide(); };
    $('btnCloseSide').onclick = function () { toggleSide(false); }; $('scrim').onclick = function () { toggleSide(false); };
    $('selPreset').onchange = function () {
      var id = $('selPreset').value; if (LP.presetIds.indexOf(id) < 0) return;
      var keep = { lang: A.lang, done: A.state.wizDone };
      A.state = A.normalize(LP.presets[id]()); A.state.lang = keep.lang; A.state.wizDone = keep.done;
      A.save(); A.fillSelects(); A.renderSide(); A.wizard.render(); A.markStale();
    };
    $('selScenario').onchange = function () { A.state.rateScenario = $('selScenario').value; A.save(); A.markStale(); };
    $('btnOptimize').onclick = function () { A.run(); }; $('btnStaleRun').onclick = function () { A.run(); };
    $('emptyWizard').onclick = function () { A.wizard.show(0); };
    $('emptyExample').onclick = function () { // load example G; the analysis waits for "Optimieren"
      var keep = A.lang; A.state = A.normalize(LP.presets.g()); A.state.lang = keep; A.state.wizDone = true;
      A.save(); A.renderStatic(); A.renderSide(); A.markStale(); // ready to calculate; "Optimieren" starts it
    };
    $('langDe').onclick = function () { setLang('de'); }; $('langEn').onclick = function () { setLang('en'); };
    var THEME = 'liquiditaetsplaner:theme';
    var sysDark = window.matchMedia('(prefers-color-scheme: dark)');
    function isDark() { var a = document.documentElement.getAttribute('data-theme'); return a ? a === 'dark' : sysDark.matches; }
    function syncTheme() { $('themeSwitch').setAttribute('aria-checked', isDark() ? 'true' : 'false'); }
    $('themeSwitch').onclick = function () { // two states; matching the system again means "follow the system" from then on
      var next = isDark() ? 'light' : 'dark', sys = sysDark.matches ? 'dark' : 'light';
      if (next === sys) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', next);
      try { if (next === sys) window.localStorage.removeItem(THEME); else window.localStorage.setItem(THEME, next); } catch (e) { /* not remembered */ }
      syncTheme(); // the charts re-read their colours through the data-theme observer below
    };
    try { sysDark.addEventListener('change', syncTheme); } catch (e) { /* ignore */ }
    syncTheme();
    var menu = $('menuExport');
    function closeMenu() { menu.classList.remove('open'); $('btnMenu').setAttribute('aria-expanded', 'false'); } // the button's state follows the menu
    $('btnMenu').onclick = function (e) { e.stopPropagation(); var op = menu.classList.toggle('open'); $('btnMenu').setAttribute('aria-expanded', op); };
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) closeMenu(); });
    $('btnDlHtml').onclick = function () { closeMenu(); A.saveFile('Liquiditaetsplaner_' + stamp() + '.html', A.buildHtml(), 'text/html'); };
    $('btnDlXlsx').onclick = function () { closeMenu(); A.exportXlsx(); };
    $('btnDlJson').onclick = function () { closeMenu(); openModal(t('stateTitle'), t('stateHint'), JSON.stringify(A.state, null, 2), 'Liquiditaetsplan_' + stamp() + '.json', null); };
    $('btnImJson').onclick = function () { closeMenu(); openModal(t('stateTitle'), t('stateHint'), '', 'Liquiditaetsplan.json', applyState); };
    $('btnRates').onclick = function () { closeMenu(); openModal(t('ratesTitle'), t('ratesHint'), JSON.stringify(ratesOf(A.state), null, 2), 'Zinssaetze_' + stamp() + '.json', applyRates); };
    $('modalClose').onclick = closeModal;
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    $('modalCopy').onclick = function () {
      var ta = $('modalText');
      function fallback() { ta.select(); try { document.execCommand('copy'); A.toast(t('copied')); } catch (e) { /* the text stays selected for a manual copy */ } }
      try { navigator.clipboard.writeText(ta.value).then(function () { A.toast(t('copied')); }, fallback); } catch (e) { fallback(); }
    };
    $('modalSave').onclick = function () { A.saveFile(modalName, $('modalText').value, 'application/json'); };
    $('modalApply').onclick = function () { try { modalApply(JSON.parse($('modalText').value)); closeModal(); A.toast(t('imported')); } catch (e) { A.toast(t('badJson', { e: e.message }), true); } };
    $('modalFile').onchange = function () { var f = $('modalFile').files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { $('modalText').value = String(rd.result || ''); }; rd.readAsText(f); };
    $('wfYear').onclick = function () { A.wf.mode = 'y'; A.wf.idx = 0; A.renderWf(); }; $('wfMonth').onclick = function () { A.wf.mode = 'm'; A.wf.idx = 0; A.renderWf(); };
    $('wfSel').onchange = function () { A.wf.idx = +$('wfSel').value; A.renderWf(); };
    $('wfPrev').onclick = function () { A.wf.idx = Math.max(0, A.wf.idx - 1); A.renderWf(); }; $('wfNext').onclick = function () { A.wf.idx++; A.renderWf(); };
    $('actShowMat').onchange = function () { A.renderActions(); };
    $('ladYear').onclick = function () { A.lad.mode = 'year'; A.lad.open = null; A.renderLadder(); }; $('ladAll').onclick = function () { A.lad.mode = 'all'; A.lad.open = null; A.renderLadder(); };
    $('ladXlsx').onclick = function () { A.exportLadderXlsx(); };
    $('btnResetOv').onclick = function () { A.resetOverrides(); };
    $('btnSelftest').onclick = function () { A.selftest(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); closeMenu(); if (isNarrow()) toggleSide(false); } });
    var rz = null; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(A.resizeCharts, 150); });
    // re-colour the charts when the viewer switches between light and dark
    var th = null, recolor = function () { clearTimeout(th); th = setTimeout(function () { A.renderAll(); A.replay.render(); }, 60); };
    try { new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* ignore */ }
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor); } catch (e2) { /* ignore */ }
  }

  // ---------- start ----------
  wire();
  window.__echartsReady = function () { A.renderAll(); };
  A.renderStatic(); A.renderSide(); A.renderAll();
  if (isNarrow()) $('shell').classList.remove('drawer');
  syncInputsBtn(); window.addEventListener('resize', syncInputsBtn);
  A.solver.start(); // warms up the solver only; nothing is calculated until "Optimieren" is pressed
})();

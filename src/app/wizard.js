/* ===== wizard.js: six-chapter setup wizard (input only; it hands the state to the existing calculation) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, C = LP.core, $ = A.$, el = A.el, t = A.t;
  var W = A.wizard = { open: false, step: 0 };
  var LIST = { events: 'rateEvents', deposits: 'existing', flows: 'streams', offers: 'products' };
  var uid = 0;

  // an edit inside the wizard never starts a calculation: it only marks the result as out of date
  function change(fn, rerender) {
    fn(A.state);
    if (LP.presetIds.indexOf(A.state.presetId) >= 0) { A.state.presetId = 'custom'; A.fillSelects(); }
    syncScenario(A.state);
    A.save(); A.markStale();
    if (rerender) W.render();
  }
  function syncScenario(s) {
    var any = (s.rateEvents || []).some(function (e) { return e && e.date && +e.change; });
    if (any && s.rateScenario === 'current') s.rateScenario = 'events';
    if (!any && s.rateScenario === 'events') s.rateScenario = 'current';
  }
  function newId(p) { return p + Date.now().toString(36) + (++uid); }
  function blank(key) {
    if (key === 'events') return { id: newId('v'), date: '', change: 0 };
    if (key === 'deposits') return { id: newId('e'), label: '', type: 'festgeld', bank: '', amount: 0, rate: 0, maturity: '', procDays: 0 };
    if (key === 'flows') return { id: newId('s'), name: '', kind: 'income', amount: 0, freq: 'm', start: '', end: '', idx: 0 };
    return { id: newId('p'), term: 0, rate: 0, bank: '', min: 0, max: 0, conv: 'simple', on: true, procDays: 0 };
  }
  function secOn(key) { var s = A.state; s.sec = s.sec || {}; if (s.sec[key] == null) s.sec[key] = (s[LIST[key]] || []).length > 0; return s.sec[key]; }
  function setSec(key, on) { // "No" parks the rows instead of deleting them
    change(function (s) {
      var lk = LIST[key]; s.stash = s.stash || {}; s.sec = s.sec || {};
      if (!on) { if (s[lk].length) s.stash[key] = s[lk]; s[lk] = []; }
      else if (!s[lk].length) { s[lk] = (s.stash[key] && s.stash[key].length) ? s.stash[key] : [blank(key)]; delete s.stash[key]; }
      s.sec[key] = on;
    }, true);
  }
  function setWeekly(on) {
    change(function (s) {
      s.stash = s.stash || {}; s.weekly = s.weekly || { nextDate: '' };
      if (!on) { s.stash.weekly = { tg: s.tg, tgRate: s.tgRate }; s.tg = 0; s.tgRate = 0; }
      else if (s.stash.weekly) { s.tg = s.stash.weekly.tg; s.tgRate = s.stash.weekly.tgRate; delete s.stash.weekly; }
      s.weekly.on = on;
    }, true);
  }
  function sortRows(s) { // rows are sorted once the input is committed
    var byDate = function (k) { return function (a, b) { return (a[k] || '9999').localeCompare(b[k] || '9999'); }; };
    s.rateEvents.sort(byDate('date')); s.existing.sort(byDate('maturity')); s.streams.sort(byDate('start'));
    s.products.sort(function (a, b) { return ((+a.term || 1e9) - (+b.term || 1e9)); });
  }

  // ---------- controls ----------
  function numIn(val, set, o) { // o: { id, min, max, eur (an amount), ph, keepZero }
    o = o || {};
    return A.numField({ id: o.id || ('w' + (++uid)), value: val, min: o.min, max: o.max, eur: o.eur, ph: o.ph, empty: 0, blank: val == null || val === '' || (!o.keepZero && +val === 0) }, set);
  }
  function txtIn(val, set, o) { o = o || {}; var inp = el('input', { type: o.type || 'text', id: o.id || ('w' + (++uid)), placeholder: o.ph, value: val || '' }); inp.addEventListener('change', function () { set(inp.value); }); return inp; }
  function selIn(val, opts, set, o) { o = o || {}; var s = el('select', { id: o.id || ('w' + (++uid)) }); opts.forEach(function (op) { s.appendChild(el('option', { value: op[0], text: op[1] })); }); s.value = String(val); s.addEventListener('change', function () { set(s.value); }); return s; }
  function yesNo(val, set, id) {
    var y = el('button', { type: 'button', id: id + '-yes', 'aria-pressed': val ? 'true' : 'false', text: t('yes'), onclick: function () { if (!val) set(true); } });
    var n = el('button', { type: 'button', id: id + '-no', 'aria-pressed': val ? 'false' : 'true', text: t('no'), onclick: function () { if (val) set(false); } });
    return el('div', { class: 'seg', role: 'group' }, y, n);
  }
  function q(no, text, control, hint, sub) {
    var lab = control.tagName === 'DIV' ? el('span', { text: text }) : el('label', { for: control.id, text: text });
    return el('div', { class: 'q' + (sub ? ' sub' : '') }, el('div', { class: 'ql' }, el('span', { class: 'qn', text: no }), lab, hint ? el('span', { class: 'qh', text: hint }) : null), control);
  }
  function rows(key, fields, titleOf, addLabel) {
    var s = A.state, list = s[LIST[key]], box = el('div');
    if (!list.length) box.appendChild(el('p', { class: 'small muted wiz-norows', text: t('w_noRows') }));
    list.forEach(function (r, i) {
      var card = el('div', { class: 'wrow' }, el('div', { class: 'wrow-head' }, el('span', { text: titleOf(r, i) || (t('w_row') + ' ' + (i + 1)) }), el('div', { class: 'wrow-acts' },
        el('button', { class: 'btn sm ghost', type: 'button', text: t('w_dup'), onclick: function () { change(function (st) { var c = JSON.parse(JSON.stringify(r)); c.id = newId(String(r.id || 'r').charAt(0)); st[LIST[key]].splice(i + 1, 0, c); }, true); } }),
        el('button', { class: 'btn sm ghost danger', type: 'button', text: t('w_del'), onclick: function () { change(function (st) { st[LIST[key]].splice(i, 1); }, true); } }))));
      fields(r, i).forEach(function (n) { card.appendChild(n); });
      box.appendChild(card);
    });
    box.appendChild(el('div', { class: 'wiz-add' },
      el('button', { class: 'btn sm', type: 'button', text: addLabel, onclick: function () { change(function (st) { st[LIST[key]].push(blank(key)); }, true); } }),
      el('button', { class: 'btn sm ghost danger', type: 'button', text: t('w_clear'), disabled: !list.length, onclick: function () { change(function (st) { st[LIST[key]] = []; }, true); } })));
    return box;
  }

  // ---------- chapters ----------
  var CH = [
    function (s, b) { // 1 starting liquidity
      b.appendChild(q('', t('q00'), txtIn(s.startDate, function (v) { if (C.parseISO(v)) change(function (st) { st.startDate = v; }); }, { type: 'date', id: 'wq00' })));
      b.appendChild(q('01', t('q01'), numIn(s.giro, function (v) { change(function (st) { st.giro = v; }); }, { id: 'wq01', min: 0, eur: true, ph: '2.500' }), t('q01_tip')));
      var on = !!(s.weekly && s.weekly.on);
      b.appendChild(q('01a', t('q01a'), yesNo(on, setWeekly, 'wq01a')));
      if (on) {
        b.appendChild(q('01b', t('q01b'), numIn(s.tg, function (v) { change(function (st) { st.tg = v; }); }, { id: 'wq01b', min: 0, eur: true, ph: '10.000' }), null, true));
        b.appendChild(q('01c', t('q01c'), numIn(s.tgRate, function (v) { change(function (st) { st.tgRate = v; }); }, { id: 'wq01c', min: 0, step: 0.05, ph: '2,5' }), null, true));
        b.appendChild(q('01d', t('q01d'), txtIn(s.weekly.nextDate, function (v) { change(function (st) { st.weekly.nextDate = v; }); }, { type: 'date', id: 'wq01d' }), t('q01d_tip'), true));
      }
      b.appendChild(q('02', t('q02'), txtIn(s.needStart, function (v) { change(function (st) { st.needStart = v; }); }, { type: 'date', id: 'wq02' }), t('q02_tip')));
      b.appendChild(q('03', t('q03'), numIn(s.need, function (v) { change(function (st) { st.need = v; }); }, { id: 'wq03', min: 0, eur: true, ph: '1.500' })));
    },
    function (s, b) { // 2 economic baseline
      b.appendChild(q('04', t('q04'), numIn(s.needIdx, function (v) { change(function (st) { st.needIdx = v; }); }, { id: 'wq04', step: 0.1, ph: '3,0', keepZero: true }), t('q04_tip')));
      b.appendChild(q('05', t('q05'), numIn(s.baseRate, function (v) { change(function (st) { st.baseRate = v; }); }, { id: 'wq05', step: 0.05, ph: '2,5', keepZero: true }), t('q05_tip')));
      b.appendChild(q('06', t('q06'), numIn(Math.round(s.horizon / 12 * 10) / 10, function (v) { change(function (st) { st.horizon = Math.max(12, Math.min(360, Math.round(v * 12))); }, true); }, { id: 'wq06', min: 1, max: 30, step: 1, ph: '10' })));
    },
    function (s, b) { // 3 rate events
      var on = secOn('events');
      b.appendChild(q('07', t('q07'), yesNo(on, function (v) { setSec('events', v); }, 'wq07'), t('q07_tip')));
      if (on) b.appendChild(rows('events', function (r, i) {
        return [q('07a', t('q07a'), txtIn(r.date, function (v) { change(function () { r.date = v; }); }, { type: 'date', id: 'wq07a' + i })),
          q('07b', t('q07b'), numIn(r.change, function (v) { change(function () { r.change = v; }); }, { id: 'wq07b' + i, step: 0.05, ph: '+0,25 / -0,25' }))];
      }, function (r) { return r.date ? A.dateStr(C.parseISO(r.date)) + ' · ' + (r.change > 0 ? '+' : '') + r.change + ' Pp' : ''; }, t('w_addEvent')));
    },
    function (s, b) { // 4 ongoing deposits
      var on = secOn('deposits');
      b.appendChild(q('08', t('q08'), yesNo(on, function (v) { setSec('deposits', v); }, 'wq08')));
      if (on) b.appendChild(rows('deposits', function (r, i) {
        return [q('', t('q08n'), txtIn(r.label, function (v) { change(function () { r.label = v; if (!r.bank) r.bank = v; }, true); }, { id: 'wq08n' + i, ph: 'Bank X' })),
          q('08a', t('q08a'), txtIn(r.maturity, function (v) { change(function () { r.maturity = v; }); }, { type: 'date', id: 'wq08a' + i })),
          q('08b', t('q08b'), numIn(r.amount, function (v) { change(function () { r.amount = v; }); }, { id: 'wq08b' + i, min: 0, eur: true, ph: '10.000' })),
          q('08c', t('q08c'), numIn(r.procDays, function (v) { change(function () { r.procDays = Math.round(v); }); }, { id: 'wq08c' + i, min: 0, step: 1, ph: '3' }), t('w_procTip'))];
      }, function (r) { return r.label; }, t('w_addDep')));
    },
    function (s, b) { // 5 recurring cash flows
      var on = secOn('flows');
      b.appendChild(q('09', t('q09'), yesNo(on, function (v) { setSec('flows', v); }, 'wq09')));
      if (on) b.appendChild(rows('flows', function (r, i) {
        return [q('', t('q09n'), txtIn(r.name, function (v) { change(function () { r.name = v; }, true); }, { id: 'wq09n' + i, ph: 'Miete' })),
          q('', t('q09t'), selIn(r.kind || 'other', [['income', t('k_income')], ['rent', t('k_rent')], ['other', t('k_other')]], function (v) { change(function () { r.kind = v; }); }, { id: 'wq09t' + i })),
          q('09a', t('q09a'), txtIn(r.start, function (v) { change(function () { r.start = v; }); }, { type: 'date', id: 'wq09a' + i })),
          q('09b', t('q09b'), numIn(r.amount, function (v) { change(function () { r.amount = v; }); }, { id: 'wq09b' + i, eur: true, ph: '200 / -300' })),
          q('09c', t('q09c'), selIn(r.freq || 'm', [['m', t('fr_m')], ['q', t('fr_q')], ['y', t('fr_y')]], function (v) { change(function () { r.freq = v; }); }, { id: 'wq09c' + i })),
          q('09d', t('q09d'), txtIn(r.end, function (v) { change(function () { r.end = v; }); }, { type: 'date', id: 'wq09d' + i }))];
      }, function (r) { return r.name; }, t('w_addFlow')));
    },
    function (s, b) { // 6 fixed-term offers
      var on = secOn('offers');
      b.appendChild(q('10', t('q10'), yesNo(on, function (v) { setSec('offers', v); }, 'wq10')));
      if (on) b.appendChild(rows('offers', function (r, i) {
        return [q('', t('q10n'), txtIn(r.bank, function (v) { change(function () { r.bank = v; }, true); }, { id: 'wq10n' + i, ph: 'Bank Y 12M' })),
          q('10a', t('q10a'), numIn(r.min, function (v) { change(function () { r.min = v; }); }, { id: 'wq10a' + i, min: 0, eur: true, ph: '1.000' })),
          q('10b', t('q10b'), numIn(r.term, function (v) { change(function () { r.term = Math.round(v); }, true); }, { id: 'wq10b' + i, min: 1, max: 240, step: 1, ph: '12' })),
          q('10c', t('q10c'), numIn(r.rate, function (v) { change(function () { r.rate = v; }); }, { id: 'wq10c' + i, min: 0, step: 0.05, ph: '3,35' })),
          q('10d', t('q10d'), numIn(r.procDays, function (v) { change(function () { r.procDays = Math.round(v); }); }, { id: 'wq10d' + i, min: 0, step: 1, ph: '2' }), i === 0 ? t('w_procTip') : null)];
      }, function (r) { return (r.bank || '') + (r.term ? ' · ' + r.term + ' ' + t('months_short') : '') + (r.rate ? ' · ' + A.pct(+r.rate) : ''); }, t('w_addOffer')));
    },
    function (s, b) { // JSON
      b.classList.add('wiz-json');
      var ta = el('textarea', { id: 'wizJson', spellcheck: 'false', 'aria-label': 'JSON', placeholder: '{ "format": "deposit-savings-planner", "version": 1, "input": { … } }' });
      b.appendChild(el('p', { class: 'small muted', text: t('w_jsonHint') }));
      b.appendChild(ta);
      b.appendChild(el('div', { class: 'ctl', style: 'margin-top:8px' },
        el('button', { class: 'btn', type: 'button', id: 'wizWrite', text: t('w_write'), onclick: function () { ta.value = JSON.stringify(A.state, null, 2); } }),
        el('button', { class: 'btn', type: 'button', id: 'wizCopy', text: t('w_copy'), onclick: function () {
          if (!ta.value) ta.value = JSON.stringify(A.state, null, 2);
          var fb = function () { ta.select(); try { document.execCommand('copy'); A.toast(t('copied')); } catch (e) { /* stays selected */ } };
          try { navigator.clipboard.writeText(ta.value).then(function () { A.toast(t('copied')); }, fb); } catch (e) { fb(); }
        } }),
        el('button', { class: 'btn primary', type: 'button', id: 'wizApply', text: t('w_apply'), onclick: function () {
          var obj; try { obj = JSON.parse(ta.value); A.applyState(obj, true); } catch (e) { A.toast(t('badJson', { e: e.message }), true); return; }
          A.toast(t('imported')); W.render();
        } })));
    }
  ];
  var TITLES = ['w_ch1', 'w_ch2', 'w_ch3', 'w_ch4', 'w_ch5', 'w_ch6', 'w_json'];

  W.seen = {}; W.menu = false;
  function narrow() { return window.matchMedia('(max-width: 720px)').matches; }
  function stepMeta(k) { // what each chapter holds, at a glance
    var s = A.state;
    if (k === 0) return (+s.giro > 0 || +s.tg > 0 || +s.need > 0) ? 'ok' : t('w_reqShort');
    if (k === 1) return W.seen[1] ? 'ok' : t('w_reqShort');
    if (k <= 5) { var key = ['events', 'deposits', 'flows', 'offers'][k - 2], n = secOn(key) ? (s[LIST[key]] || []).length : 0; return n ? String(n) : '–'; }
    return '';
  }
  W.render = function () {
    if (!W.open) return;
    var steps = $('wizSteps'), body = $('wizBody'), s = A.state, i;
    $('wizard').classList.toggle('show-menu', W.menu && narrow());
    steps.innerHTML = '';
    for (i = 0; i < CH.length; i++) (function (k) {
      var meta = stepMeta(k);
      if (k === 6) steps.appendChild(el('li', { class: 'sep', 'aria-hidden': 'true' }));
      steps.appendChild(el('li', null, el('button', { type: 'button', class: 'wiz-item', id: 'wizStep' + k, 'aria-current': k === W.step && !(W.menu && narrow()) ? 'step' : null, onclick: function () { W.menu = false; W.go(k); } },
        el('span', { class: 'no', text: k < 6 ? String(k + 1) : '{ }' }), el('span', { class: 'tt', text: t(TITLES[k]) }),
        meta === 'ok' ? el('span', { class: 'meta ok', title: t('w_doneShort') }, el('span', { class: 'sr', text: t('w_doneShort') })) : el('span', { class: 'meta', text: meta }),
        el('span', { class: 'chev', 'aria-hidden': 'true' }))));
    })(i);
    body.className = 'card wiz-body'; body.innerHTML = '';
    body.appendChild(el('h3', { text: (W.step < 6 ? (W.step + 1) + ' · ' : '') + t(TITLES[W.step]) }));
    if (W.step < 6) body.appendChild(el('div', { class: 'wiz-kind', text: W.step < 2 ? t('w_req') : t('w_opt') }));
    CH[W.step](s, body);
    $('wizBack').disabled = W.step === 0;
    $('wizNext').textContent = W.step >= 5 ? t('w_finish') : t('w_next');
  };
  W.go = function (k) { sortRows(A.state); W.step = Math.max(0, Math.min(CH.length - 1, k)); W.seen[W.step] = true; W.render(); window.scrollTo(0, 0); };
  function wizBtn() { var b = $('btnWizard'), k = W.open ? 'analysis' : 'wizard'; b.setAttribute('data-i18n', k); b.textContent = t(k); } // "Analyse" leads back
  W.show = function (k) {
    W.open = true; if (k != null) W.step = k; wizBtn(); W.menu = narrow(); W.seen[W.step] = true; // phones start on the chapter list
    if (A.runSheet) A.runSheet.hide();
    $('app').classList.add('wiz'); $('wizard').classList.remove('hide');
    W.render(); window.scrollTo(0, 0);
  };
  W.hide = function () {
    W.open = false; wizBtn(); $('app').classList.remove('wiz'); $('wizard').classList.add('hide');
    if (A.busy && A.runSheet) A.runSheet.show();
    A.renderSide(); A.fillSelects(); A.renderAll(); A.resizeCharts();
  };
  W.finish = function () { // "Proceed to future projection"
    sortRows(A.state); A.state.wizDone = true; A.save();
    W.hide(); window.scrollTo(0, 0); // no calculation here: the analysis offers "Optimieren"
  };
  var armed = null;
  function reset() { // two taps: there is no confirm dialog inside the viewer
    var b = $('wizReset');
    if (!armed) { b.textContent = t('w_reset') + '?'; b.classList.add('armed'); armed = setTimeout(function () { armed = null; b.textContent = t('w_reset'); b.classList.remove('armed'); }, 4000); return; }
    clearTimeout(armed); armed = null; b.textContent = t('w_reset'); b.classList.remove('armed');
    A.state = A.blankState(A.lang);
    A.view = null; A.save(); A.fillSelects(); A.markStale(); W.step = 0; W.seen = {}; W.render();
  }
  $('wizBack').onclick = function () { W.go(W.step - 1); };
  $('wizNext').onclick = function () { if (W.step >= 5) W.finish(); else W.go(W.step + 1); };
  $('wizToMenu').onclick = function () { W.menu = true; W.render(); window.scrollTo(0, 0); };
  $('wizExample').onclick = function () { // fill the wizard with example G; nothing is calculated until the analysis is opened
    var keep = A.lang; A.state = A.normalize(LP.presets.g()); A.state.lang = keep;
    A.save(); A.fillSelects(); A.renderSide(); A.markStale(); W.seen = {}; W.step = 0; W.menu = narrow(); W.render(); A.toast(t('w_exampleLoaded'));
  };
  $('wizReset').onclick = reset;
  $('btnWizard').onclick = function () { if (W.open) W.finish(); else W.show(); };
})();

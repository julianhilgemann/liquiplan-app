/* ===== ui/drawer.js: inputs drawer ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, C = LP.core, $ = A.$, el = A.el, t = A.t, S = A.solver;

  var uid = 0;
  function field(o) { // {label(html), type (default: a number), value, set(v), min, max, eur (an amount), options:[[v,label]], id}
    var id = o.id || ('f' + (++uid)), inp;
    if (o.type === 'select') {
      inp = el('select', { id: id });
      o.options.forEach(function (op) { inp.appendChild(el('option', { value: op[0], text: op[1] })); });
      inp.value = String(o.value);
    } else if (!o.type || o.type === 'number') inp = A.numField({ id: id, value: o.value, min: o.min, max: o.max, eur: o.eur, empty: o.empty != null ? o.empty : 0 }, o.set);
    else inp = el('input', { id: id, type: o.type, value: o.value == null ? '' : o.value });
    if (o.type && o.type !== 'number') inp.addEventListener('change', function () { o.set(inp.value); });
    return el('label', { class: 'f', for: id }, el('span', { html: o.label }), inp);
  }
  function check(label, value, set, id) {
    id = id || ('c' + (++uid));
    var inp = el('input', { type: 'checkbox', id: id, checked: value, onchange: function () { set(inp.checked); } });
    return el('label', { class: 'chk', for: id }, inp, el('span', { html: label }));
  }
  function group(key, title, open, body) { return el('details', { class: 'grp', id: 'grp-' + key, open: open }, el('summary', { html: title }), el('div', { class: 'grp-body' }, body)); }
  function touch(fn, rerender) { // apply an input change
    fn(A.state);
    if (LP.presetIds.indexOf(A.state.presetId) >= 0) { A.state.presetId = 'custom'; A.fillSelects(); }
    A.save(); if (rerender) A.renderSide();
    A.markStale(); // no automatic recalculation: results wait for "Optimieren"
  }
  A.touch = touch;
  function dup(key, i) { return el('button', { class: 'btn sm ghost', type: 'button', text: t('w_dup'), onclick: function () { touch(function (st) { var c = JSON.parse(JSON.stringify(st[key][i])); c.id = key[0] + Date.now().toString(36); st[key].splice(i + 1, 0, c); }, true); } }); }

  A.renderSide = function () {
    var s = A.state, body = $('sideBody'), openMap = {};
    Array.prototype.forEach.call(body.querySelectorAll('details.grp'), function (d) { openMap[d.id] = d.open; });
    var isOpen = function (k, def) { return ('grp-' + k) in openMap ? openMap['grp-' + k] : def; };
    var scroll = $('side').scrollTop;
    body.innerHTML = '';
    var hz = el('span', { id: 'hzLabel', text: t('f_horizon', { n: s.horizon }) });
    var slider = el('input', { type: 'range', id: 'in-horizon', min: 12, max: 360, step: 1, value: s.horizon, 'aria-labelledby': 'hzLabel',
      oninput: function () { hz.textContent = t('f_horizon', { n: slider.value }); }, onchange: function () { touch(function (st) { st.horizon = +slider.value; }); } });
    body.appendChild(group('base', t('grp_base'), isOpen('base', true), [
      field({ id: 'in-start', label: t('f_start'), type: 'date', value: s.startDate, set: function (v) { if (C.parseISO(v)) touch(function (st) { st.startDate = v; }); } }),
      el('div', { class: 'f' }, hz, slider),
      el('div', { class: 'f2' }, field({ id: 'in-giro', label: A.term('giro', t('f_giro')), value: s.giro, min: 0, eur: true, set: function (v) { touch(function (st) { st.giro = v; }); } }),
        field({ id: 'in-tg', label: A.term('tg', t('f_tg')), value: s.tg, min: 0, eur: true, set: function (v) { touch(function (st) { st.tg = v; }); } })),
      el('div', { class: 'f2' }, field({ id: 'in-tgrate', label: t('f_tgRate'), value: s.tgRate, min: 0, step: 0.05, set: function (v) { touch(function (st) { st.tgRate = v; }); } }),
        field({ id: 'in-tgbank', label: t('f_tgBank'), type: 'text', value: s.tgBank || '', set: function (v) { touch(function (st) { st.tgBank = v; }); } }))
    ]));
    body.appendChild(group('need', t('grp_need'), isOpen('need', true), [
      el('div', { class: 'f2' }, field({ id: 'in-need', label: t('f_need'), value: s.need, min: 0, eur: true, set: function (v) { touch(function (st) { st.need = v; }); } }),
        field({ id: 'in-needidx', label: A.term('idx', t('f_needIdx')), value: s.needIdx, step: 0.1, set: function (v) { touch(function (st) { st.needIdx = v; }); } })),
      el('div', { class: 'f2' }, field({ id: 'in-buffer', label: A.term('sockel', t('f_buffer')), value: s.buffer, min: 0, eur: true, set: function (v) { touch(function (st) { st.buffer = v; }); } }),
        field({ id: 'in-denom', label: A.term('denom', t('f_denom')), type: 'select', value: s.denom, options: [[50, '50'], [100, '100'], [500, '500'], [1000, '1.000']], set: function (v) { touch(function (st) { st.denom = +v; }); } })),
      field({ id: 'in-needstart', label: t('f_needStart'), type: 'date', value: s.needStart || '', set: function (v) { touch(function (st) { st.needStart = v; }); } }),
      field({ id: 'in-lead', label: A.term('lead', t('f_lead')), type: 'select', value: s.lead, options: [[0, t('f_lead0')], [1, t('f_lead1')], [3, t('f_lead3')]], set: function (v) { touch(function (st) { st.lead = +v; }); } })
    ]));
    // products
    var convOpts = [['simple', t('conv_simple')], ['annual', t('conv_annual')], ['compound', t('conv_compound')]];
    var prodRows = s.products.map(function (p, i) {
      var pid = 'p' + i + '-';
      return el('div', { class: 'rowcard' },
        el('div', { class: 'rowcard-head' }, el('span', { text: (p.term || '?') + ' ' + t('months_short') + ' · ' + (p.bank || '') }),
          el('span', null, check(t('f_on'), p.on !== false, function (v) { touch(function () { p.on = v; }); }, pid + 'on'), ' ', dup('products', i),
            el('button', { class: 'btn sm ghost', type: 'button', text: t('remove'), onclick: function () { touch(function (st) { st.products.splice(i, 1); }, true); } }))),
        el('div', { class: 'f3' }, field({ id: pid + 'term', label: t('f_term'), value: p.term, min: 1, max: 240, step: 1, set: function (v) { touch(function () { p.term = Math.round(v); }, true); } }),
          field({ id: pid + 'rate', label: t('f_rate'), value: p.rate, min: 0, step: 0.05, set: function (v) { touch(function () { p.rate = v; }); } }),
          field({ id: pid + 'bank', label: t('f_bank'), type: 'text', value: p.bank || '', set: function (v) { touch(function () { p.bank = v; }, true); } })),
        el('div', { class: 'f3' }, field({ id: pid + 'min', label: t('f_min'), value: p.min, min: 0, eur: true, set: function (v) { touch(function () { p.min = v; }); } }),
          field({ id: pid + 'max', label: t('f_max'), value: p.max, min: 0, eur: true, set: function (v) { touch(function () { p.max = v; }); } }),
          field({ id: pid + 'conv', label: A.term('conv', t('f_conv')), type: 'select', value: p.conv || 'simple', options: convOpts, set: function (v) { touch(function () { p.conv = v; }); } })));
    });
    body.appendChild(group('prod', t('grp_prod'), isOpen('prod', false), [
      el('p', { class: 'small muted', text: t('examplesOnly') }), el('div', { class: 'rows' }, prodRows),
      el('button', { class: 'btn sm', type: 'button', text: t('add'), onclick: function () { touch(function (st) { st.products.push({ id: 'p' + Date.now().toString(36), term: 12, rate: 2.5, bank: 'Bank', min: 1000, max: 100000, conv: 'simple', on: true }); }, true); } })
    ]));
    // existing holdings
    var exRows = s.existing.map(function (x, i) {
      var xid = 'x' + i + '-';
      return el('div', { class: 'rowcard' },
        el('div', { class: 'rowcard-head' }, el('span', { text: x.label || t('newExist') }), el('span', null, dup('existing', i), el('button', { class: 'btn sm ghost', type: 'button', text: t('remove'), onclick: function () { touch(function (st) { st.existing.splice(i, 1); }, true); } }))),
        el('div', { class: 'f2' }, field({ id: xid + 'label', label: t('f_label'), type: 'text', value: x.label || '', set: function (v) { touch(function () { x.label = v; }, true); } }),
          field({ id: xid + 'type', label: t('f_type'), type: 'select', value: x.type || 'festgeld', options: [['festgeld', t('ty_festgeld')], ['spar', t('ty_spar')]], set: function (v) { touch(function () { x.type = v; }); } })),
        el('div', { class: 'f2' }, field({ id: xid + 'amount', label: t('f_amount'), value: x.amount, min: 0, eur: true, set: function (v) { touch(function () { x.amount = v; }); } }),
          field({ id: xid + 'rate', label: t('f_rate'), value: x.rate, min: 0, step: 0.05, set: function (v) { touch(function () { x.rate = v; }); } })),
        el('div', { class: 'f2' }, field({ id: xid + 'mat', label: t('f_maturity'), type: 'date', value: x.maturity, set: function (v) { if (C.parseISO(v)) touch(function () { x.maturity = v; }); } }),
          field({ id: xid + 'bank', label: t('f_bank'), type: 'text', value: x.bank || '', set: function (v) { touch(function () { x.bank = v; }); } })));
    });
    body.appendChild(group('exist', t('grp_exist'), isOpen('exist', false), [el('div', { class: 'rows' }, exRows),
      el('button', { class: 'btn sm', type: 'button', text: t('add'), onclick: function () { touch(function (st) { st.existing.push({ id: 'e' + Date.now().toString(36), label: t('newExist'), type: 'festgeld', bank: '', amount: 10000, rate: 2, maturity: C.iso(C.parseISO(st.startDate).y + 1, C.parseISO(st.startDate).m, 15) }); }, true); } })]));
    // recurring streams
    var stRows = s.streams.map(function (r, i) {
      var rid = 'r' + i + '-';
      return el('div', { class: 'rowcard' },
        el('div', { class: 'rowcard-head' }, el('span', { text: r.name || t('newStream') }), el('span', null, dup('streams', i), el('button', { class: 'btn sm ghost', type: 'button', text: t('remove'), onclick: function () { touch(function (st) { st.streams.splice(i, 1); }, true); } }))),
        el('div', { class: 'f2' }, field({ id: rid + 'name', label: t('f_name'), type: 'text', value: r.name || '', set: function (v) { touch(function () { r.name = v; }, true); } }),
          field({ id: rid + 'amt', label: t('f_amountPM'), value: r.amount, eur: true, set: function (v) { touch(function () { r.amount = v; }); } })),
        el('div', { class: 'f2' }, field({ id: rid + 'freq', label: t('f_freq'), type: 'select', value: r.freq || 'm', options: [['m', t('fr_m')], ['q', t('fr_q')], ['y', t('fr_y')]], set: function (v) { touch(function () { r.freq = v; }); } }),
          field({ id: rid + 'idx', label: t('f_idx'), value: r.idx || 0, step: 0.1, set: function (v) { touch(function () { r.idx = v; }); } })),
        el('div', { class: 'f2' }, field({ id: rid + 'from', label: t('f_from'), type: 'date', value: r.start || '', set: function (v) { touch(function () { r.start = v; }); } }),
          field({ id: rid + 'to', label: t('f_to'), type: 'date', value: r.end || '', set: function (v) { touch(function () { r.end = v; }); } })));
    });
    body.appendChild(group('streams', t('grp_streams'), isOpen('streams', false), [el('div', { class: 'rows' }, stRows),
      el('button', { class: 'btn sm', type: 'button', text: t('add'), onclick: function () { touch(function (st) { st.streams.push({ id: 's' + Date.now().toString(36), name: t('newStream'), amount: 100, freq: 'm', start: '', end: '', idx: 0 }); }, true); } })]));
    // one-offs
    var ooRows = s.oneoffs.map(function (o, i) {
      var oid = 'o' + i + '-';
      return el('div', { class: 'rowcard' },
        el('div', { class: 'rowcard-head' }, el('span', { text: o.label || t('newOne') }), el('span', null, dup('oneoffs', i), el('button', { class: 'btn sm ghost', type: 'button', text: t('remove'), onclick: function () { touch(function (st) { st.oneoffs.splice(i, 1); }, true); } }))),
        field({ id: oid + 'label', label: t('f_label'), type: 'text', value: o.label || '', set: function (v) { touch(function () { o.label = v; }, true); } }),
        el('div', { class: 'f2' }, field({ id: oid + 'date', label: t('f_date'), type: 'date', value: o.date, set: function (v) { if (C.parseISO(v)) touch(function () { o.date = v; }); } }),
          field({ id: oid + 'amt', label: t('f_amountPM'), value: o.amount, eur: true, set: function (v) { touch(function () { o.amount = v; }); } })));
    });
    body.appendChild(group('one', t('grp_one'), isOpen('one', false), [el('div', { class: 'rows' }, ooRows),
      el('button', { class: 'btn sm', type: 'button', text: t('add'), onclick: function () { touch(function (st) { var d = C.parseISO(st.startDate); st.oneoffs.push({ id: 'o' + Date.now().toString(36), date: C.iso(d.y + 2, d.m, 15), amount: -5000, label: t('newOne') }); }, true); } })]));
    // pins
    var prodOpts = s.products.map(function (p) { return [p.id, p.term + ' ' + t('months_short') + ' · ' + (p.bank || '') + ' · ' + A.pct(+p.rate)]; });
    var pinRows = s.pins.map(function (pn, i) {
      var nid = 'n' + i + '-';
      return el('div', { class: 'rowcard' },
        el('div', { class: 'rowcard-head' }, el('span', { text: t('newPin') + ' ' + (i + 1) }), el('span', null, dup('pins', i), el('button', { class: 'btn sm ghost', type: 'button', text: t('remove'), onclick: function () { touch(function (st) { st.pins.splice(i, 1); }, true); } }))),
        field({ id: nid + 'prod', label: t('f_prod'), type: 'select', value: pn.productId, options: prodOpts, set: function (v) { touch(function () { pn.productId = v; }); } }),
        field({ id: nid + 'month', label: t('f_month'), type: 'month', value: String(pn.month || '').slice(0, 7), set: function (v) { if (C.parseISO(v)) touch(function () { pn.month = v; }); } }),
        field({ id: nid + 'amt', label: t('f_amount'), value: pn.amount, min: 0, eur: true, set: function (v) { touch(function () { pn.amount = v; }); } }));
    });
    body.appendChild(group('pins', A.term('pin', t('grp_pins')), isOpen('pins', false), [pinRows.length ? el('div', { class: 'rows' }, pinRows) : el('p', { class: 'small muted', text: t('pinNone') }),
      el('button', { class: 'btn sm', type: 'button', text: t('add'), disabled: !s.products.length, onclick: function () { touch(function (st) { var d = C.parseISO(st.startDate), m0 = C.ymOf(C.ymIdx(d.y, d.m) + (d.d === 1 ? 0 : 1)); st.pins.push({ id: 'n' + Date.now().toString(36), month: m0.y + '-' + C.pad(m0.m), productId: st.products[0].id, amount: Math.max(5000, +st.products[0].min || 0) }); }, true); } })]));
    // tax and deposit guarantee
    body.appendChild(group('tax', t('grp_tax'), isOpen('tax', false), [
      check(A.term('abg', t('f_taxOn')), s.tax.on, function (v) { touch(function (st) { st.tax.on = v; }); }, 'in-taxon'),
      el('div', { class: 'f2' }, field({ id: 'in-church', label: t('f_church'), type: 'select', value: s.tax.church, options: [[0, t('ch0')], [8, t('ch8')], [9, t('ch9')]], set: function (v) { touch(function (st) { st.tax.church = +v; }); } }),
        field({ id: 'in-allow', label: A.term('spb', t('f_allow')), type: 'select', value: s.tax.allowance, options: [[1000, '1.000'], [2000, '2.000'], [0, '0']], set: function (v) { touch(function (st) { st.tax.allowance = +v; }); } })),
      check(A.term('esi', t('f_capOn')), s.bankCap.on, function (v) { touch(function (st) { st.bankCap.on = v; }); }, 'in-capon'),
      field({ id: 'in-cap', label: t('f_cap'), value: s.bankCap.cap, min: 0, eur: true, set: function (v) { touch(function (st) { st.bankCap.cap = v; }); } })
    ]));
    body.appendChild(group('solver', t('grp_solver'), isOpen('solver', false), [
      check(A.term('maxdep', t('f_maxOn')), s.trancheCap.on, function (v) { touch(function (st) { st.trancheCap.on = v; }); }, 'in-maxon'),
      field({ id: 'in-max', label: t('f_maxN'), value: s.trancheCap.max, min: 1, max: 999, empty: 6, set: function (v) { touch(function (st) { st.trancheCap.max = Math.max(1, Math.round(v)); }, true); } }),
      el('p', { class: 'small muted', text: t('f_maxHint') }),
      check(A.term('nolimit', t('f_unlimited')), s.unlimited, function (v) { touch(function (st) { st.unlimited = v; }); }, 'in-unlimited'),
      el('p', { class: 'small muted', text: t('f_unlimitedHint') }),
      field({ id: 'in-naive', label: A.term('base', t('f_naive')), value: s.naiveReserve, min: 0, max: 24, step: 1, set: function (v) { touch(function (st) { st.naiveReserve = v; }); } }),
      el('div', { class: 'small muted', id: 'chainInfo' })
    ]));
    $('side').scrollTop = scroll;
    A.renderChainInfo();
  };
  A.renderChainInfo = function () {
    var n = $('chainInfo'); if (!n) return;
    var parts = (S.info.chain || []).map(function (c) { return (c.name === 'embedded' ? new LP.solve.EmbeddedBackend().name : c.name) + ': ' + (c.ok ? 'ok' : '✕ ' + (c.error || '')); });
    (S.info.demoted || []).forEach(function (d) { parts.push(t('s_demoted', { n: d.name, w: d.why })); });
    n.textContent = t('s_chain') + ' — ' + (parts.join(' · ') || '…');
  };
})();

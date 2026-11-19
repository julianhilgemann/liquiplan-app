/* ===== views/grid.js: monthly grid with overrides for single months ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, C = LP.core, $ = A.$, el = A.el, t = A.t, esc = A.esc;

  function renderGrid() {
    var v = A.view, tb = $('gridTable'), st = A.state, focusId = document.activeElement && document.activeElement.id;
    tb.innerHTML = '';
    var P = v ? v.P : C.prepare(st), sim = v ? v.sim : null;
    var heads = ['g_month', 'g_recIn', 'g_recOut', 'g_one', 'g_mat', 'g_need', 'g_xNeed', 'g_xIn', 'g_min', 'g_net', 'g_liq', 'g_lock', 'g_status'];
    tb.appendChild(el('thead', null, el('tr', null, heads.map(function (h) { return el('th', { html: h === 'g_min' ? A.term('sockel', t(h)) : esc(t(h)) }); }))));
    var body = el('tbody');
    function cell(key, fieldName, val, ph) {
      var ov = (st.overrides[key] || {})[fieldName], has = ov != null && ov !== '' && isFinite(+ov) && (fieldName === 'minLiq' || +ov !== 0);
      var inp = A.numField({ id: 'ov-' + key + '-' + fieldName, min: 0, eur: true, value: has ? ov : null, ph: ph, empty: null, label: t(fieldName === 'extraNeed' ? 'g_xNeed' : fieldName === 'extraIn' ? 'g_xIn' : 'g_min') + ' ' + key }, function (v) { setOv(key, fieldName, v); });
      var rs = el('button', { type: 'button', class: 'rs', title: t('reset'), 'aria-label': t('reset'), text: '×', onclick: function () { setOv(key, fieldName, null); } });
      return el('td', { class: 'in' + (has ? ' ov' : '') }, inp, rs);
    }
    for (var i = 0; i < P.H; i++) {
      var key = P.months[i].key, ok = sim ? sim.ok[i] : true;
      var tr = el('tr', { class: (sim && !ok ? 'short' : '') + (sim && i === sim.Tstar && i < P.H - 1 ? ' tstar' : '') },
        el('td', { text: A.monthLabel(P.months[i]) }), el('td', { text: P.recIn[i] ? A.n0(P.recIn[i]) : '' }), el('td', { text: P.recOut[i] ? A.n0(P.recOut[i]) : '' }),
        el('td', { text: (P.oneIn[i] - P.oneOut[i]) ? A.n0(P.oneIn[i] - P.oneOut[i]) : '' }), el('td', { text: sim && sim.trCash[i] ? A.n0(sim.trCash[i]) : '' }), el('td', { text: A.n0(P.need[i]) }),
        cell(key, 'extraNeed', P.extraNeed[i], '0'), cell(key, 'extraIn', P.extraIn[i], '0'), cell(key, 'minLiq', P.manualMin[i], A.n0(P.buffer)),
        el('td', { text: A.n0(P.net[i]) }), el('td', { text: sim ? A.n0(sim.s[i]) : '' }), el('td', { text: sim ? A.n0(sim.locked[i]) : '' }),
        el('td', null, sim ? el('span', { class: 'pill ' + (ok ? 'ok' : 'bad'), text: ok ? t('g_ok') : t('g_short') }) : ''));
      body.appendChild(tr);
    }
    tb.appendChild(body);
    if (focusId && focusId.indexOf('ov-') === 0 && $(focusId)) $(focusId).focus();
  }
  function setOv(key, fieldName, val) {
    A.touch(function (st) {
      var o = st.overrides[key] || {};
      if (val == null || (fieldName !== 'minLiq' && val === 0)) delete o[fieldName]; else o[fieldName] = val;
      if (Object.keys(o).length) st.overrides[key] = o; else delete st.overrides[key];
    });
    renderGrid();
  }
  A.resetOverrides = function () { A.touch(function (st) { st.overrides = {}; }); renderGrid(); };

  V.renderGrid = renderGrid;
})();

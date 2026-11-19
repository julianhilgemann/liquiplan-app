/* ===== views/actions.js: action list (what to do, and when) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, C = LP.core, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  var trancheDates = V.trancheDates, trancheTotals = V.trancheTotals; // ladder.js

  function buildActions(v) {
    var P = v.P, sim = v.sim, out = [];
    sim.tranches.forEach(function (tr) {
      var d = trancheDates(P, tr), tot = trancheTotals(tr);
      if (tr.kind !== 'existing') {
        var prod = t('fg') + ' ' + tr.term + ' ' + t('months_short');
        out.push({ type: 'place', sort: d.order, pinned: tr.pinned, when: d.now ? t('a_now', { d: A.dateStr(d.order, true) }) : t('a_until', { d: A.dateStr(d.order, true) }),
          text: t('a_place', { a: A.eur(tr.amount), L: tr.term, b: tr.bank || '–', r: A.pct(tr.rate * 100), d: A.dateStr(d.due) }),
          amount: tr.amount, product: prod, bank: tr.bank, rate: tr.rate, due: A.dateStr(d.due) });
        if (tr.due < P.H) { var pay = tr.conv === 'annual' ? tr.amount * (1 + tr.rate * (tr.term - 12 * Math.floor((tr.term - 1) / 12)) / 12) : tot.payout;
          out.push({ type: 'mat', sort: d.due, when: A.dateStr(d.due, true), text: t('a_mature', { p: prod + ' (' + (tr.bank || '–') + ')', a: A.eur2(pay) }), amount: pay, product: prod, bank: tr.bank, rate: tr.rate, due: '' }); }
      } else if (tr.due < P.H && d.due) out.push({ type: 'mat', sort: d.due, when: A.dateStr(d.due, true), text: t('a_matEx', { l: tr.label || t('d_existing'), b: tr.bank || '–', a: A.eur2(tot.payout) }),
        amount: tot.payout, product: tr.label && tr.label !== tr.bank ? tr.label : t('seriesEx'), bank: tr.bank, rate: tr.rate, due: '' });
    });
    out.sort(function (a, b) { return C.cmpDate(a.sort, b.sort) || (a.type === 'mat' ? -1 : 1); });
    return out;
  }
  function renderActions() {
    var v = A.view, box = $('acts'), st = $('actStanding'); box.innerHTML = ''; st.innerHTML = '';
    if (!v) { st.classList.add('hide'); box.appendChild(el('div', { class: 'empty', text: t(A.lastError ? 'v_hint' : (A.busy ? 's_solving' : 'k_notRun')) })); return; }
    st.classList.remove('hide');
    var P = v.P, prev = C.ymOf(P.idx0 - 1), d0 = C.penultimateBusinessDay(prev.y, prev.m), mi = 0;
    if (C.cmpDate(d0, P.start) < 0) { var cur = C.ymOf(P.idx0); d0 = C.penultimateBusinessDay(cur.y, cur.m); mi = Math.min(1, P.H - 1); }
    st.innerHTML = A.term('t1', 'T+1') + ' · ' + esc(t('a_standing', { d: A.dateStr(d0, true), a: A.eur(P.outflow[mi]) }));
    // one table, grouped by date: a header row per date with its sums, then one row per action in fixed columns
    var groups = [], g = null, showMat = $('actShowMat').checked;
    buildActions(v).forEach(function (a) {
      if (a.type === 'mat' && !showMat) return;
      if (!g || g.when !== a.when) { g = { when: a.when, items: [] }; groups.push(g); }
      g.items.push(a);
    });
    if (!groups.length) { box.appendChild(el('div', { class: 'empty', text: t('a_none') })); return; }
    var cols = [['c_type', 'l'], ['c_amount', ''], ['c_product', 'l'], ['c_bank', 'l'], ['c_rate', ''], ['c_due', '']];
    var tbl = el('table', { class: 'tbl acts-tbl' }), body = el('tbody');
    tbl.appendChild(el('thead', null, el('tr', null, cols.map(function (c) { return el('th', { class: c[1], scope: 'col', text: t(c[0]) }); }))));
    groups.forEach(function (gr) {
      var sp = 0, sm = 0; gr.items.forEach(function (a) { if (a.type === 'place') sp += a.amount; else sm += a.amount; });
      var sum = [sp ? t('sum_place', { a: A.eur(sp) }) : '', sm ? t('sum_mat', { a: A.eur(sm) }) : ''].filter(Boolean).join(' · ');
      body.appendChild(el('tr', { class: 'grp' }, el('td', { colspan: cols.length }, el('span', { class: 'grp-when', text: gr.when }), el('span', { class: 'grp-sum', text: sum }))));
      gr.items.forEach(function (a) {
        var mat = a.type === 'mat';
        body.appendChild(el('tr', { class: mat ? 'mat' : 'place' },
          el('td', { class: 'l', 'data-l': t('c_type') }, el('span', { class: 'tag', text: mat ? t('t_mature') : t('t_place') }), a.pinned ? el('span', { class: 'tag', text: t('t_pinned') }) : null),
          el('td', { class: 'amt', 'data-l': t('c_amount'), text: mat ? A.eur2(a.amount) : A.eur(a.amount) }),
          el('td', { class: 'l', 'data-l': t('c_product'), text: a.product }),
          el('td', { class: 'l', 'data-l': t('c_bank'), text: a.bank || '–' }),
          el('td', { 'data-l': t('c_rate'), text: a.rate ? A.pct(a.rate * 100) : '–' }),
          el('td', { 'data-l': t('c_due'), text: a.due || '–' })));
      });
    });
    tbl.appendChild(body); box.appendChild(tbl);
  }

  A.renderActions = renderActions; A.buildActions = buildActions;

  V.buildActions = buildActions; V.renderActions = renderActions;
})();

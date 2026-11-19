/* ===== views/ladder.js: ladder (Gantt), per year or for the whole horizon, and the calendar dates of a tranche ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, V = LP.views, C = LP.core, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  var mLabel = V.mLabel, bucketOf = V.bucketOf; // shared.js

  function trancheName(P, tr) { return tr.kind === 'existing' ? (tr.label || t('d_existing')) : t('fg') + ' ' + tr.term + ' ' + t('months_short'); }
  function trancheDates(P, tr) {
    var idx0 = P.idx0, pm = C.ymOf(idx0 + tr.start), dm = C.ymOf(idx0 + tr.due), out = {};
    if (tr.kind === 'existing') { out.due = findExisting(P, tr) || { y: dm.y, m: dm.m, d: 1 }; return out; }
    out.value = C.firstBusinessDay(pm.y, pm.m);
    var prev = C.ymOf(idx0 + tr.start - 1), ord = C.penultimateBusinessDay(prev.y, prev.m);
    out.now = C.cmpDate(ord, P.start) < 0; out.order = out.now ? C.nextBusinessDay(P.start) : ord;
    if (out.now && C.cmpDate(out.order, out.value) > 0) out.value = out.order;
    out.due = C.nextBusinessDay({ y: dm.y, m: dm.m, d: Math.min(out.value.d, C.daysInMonth(dm.y, dm.m)) });
    return out;
  }
  function findExisting(P, tr) { for (var i = 0; i < P.existing.length; i++) if (P.existing[i].id === tr.id) return P.existing[i].date; return null; }
  function trancheTotals(tr) { // payout and interest over the full life (also for tranches still open at the end of the horizon)
    var r = tr.rate, L = tr.term, n = Math.floor((L - 1) / 12), f = L - 12 * n, interest;
    if (tr.kind === 'existing') interest = tr.amount * r * L / 12;
    else if (tr.conv === 'annual') interest = tr.amount * r * (n + f / 12);
    else if (tr.conv === 'compound') interest = tr.amount * (Math.pow(1 + r, n) * (1 + r * f / 12) - 1);
    else interest = tr.amount * r * L / 12;
    return { interest: interest, payout: tr.amount + interest, yield: L > 0 ? Math.pow(1 + interest / tr.amount, 12 / L) - 1 : 0 };
  }
  A.trancheTotals = trancheTotals; A.trancheDates = trancheDates;
  var lad = { mode: null, year: null, open: null };
  A.lad = lad;
  function renderLadder() {
    var v = A.view, g = $('gantt'), leg = $('ladderLegend'); g.innerHTML = ''; leg.innerHTML = ''; $('trancheDetail').innerHTML = ''; $('ladYears').innerHTML = '';
    [['f1', 'seriesF1'], ['f2', 'seriesF2'], ['f3', 'seriesF3'], ['f4', 'seriesF4'], ['ex', 'seriesEx']].forEach(function (s) { leg.appendChild(el('span', { html: '<i style="background:' + A.css('--c-' + s[0]) + '"></i>' + esc(t(s[1])) })); });
    leg.appendChild(el('span', { html: '<i style="background:transparent;box-shadow:inset 0 0 0 2px ' + A.css('--ink') + '"></i>' + A.term('pin', t('d_pinned')) }));
    if (!lad.mode) lad.mode = window.matchMedia('(max-width: 900px)').matches ? 'year' : 'all';
    $('ladYear').setAttribute('aria-pressed', lad.mode === 'year'); $('ladAll').setAttribute('aria-pressed', lad.mode === 'all');
    $('ladPager').classList.toggle('hide', lad.mode !== 'year' || !v);
    g.style.width = ''; g.className = 'gantt' + (lad.mode === 'year' ? ' yv' : '');
    if (!v) { g.appendChild(el('div', { class: 'empty', text: t(A.lastError ? 'v_hint' : (A.busy ? 's_solving' : 'k_notRun')) })); return; }
    var P = v.P, sim = v.sim, trs = sim.tranches.slice().sort(function (a, b) { return a.start - b.start || a.due - b.due; });
    if (!trs.length) { $('ladPager').classList.add('hide'); g.appendChild(el('div', { class: 'empty', text: P.products.length ? t('a_none') : t('noProducts') })); return; }
    if (lad.mode === 'year') ladderYear(P, sim, trs, g); else ladderAll(P, sim, trs, g);
  }
  // the planned span on one time axis: from the start to the last maturity or T* + 1, not the whole horizon
  function ladderAll(P, sim, trs, g) {
    var H = P.H, end = 0;
    trs.forEach(function (tr) { end = Math.max(end, Math.min(H, tr.due)); });
    if (sim.Tstar >= 0 && sim.Tstar < H - 1) end = Math.max(end, sim.Tstar + 2);
    var M = Math.min(H, Math.max(12, end + 1)); // months shown
    var wrapW = Math.max(640, g.parentNode.clientWidth || 800), ppm = Math.max(7, (wrapW - 2) / M), W = Math.floor(ppm * M);
    g.style.width = W + 'px';
    var axis = el('div', { class: 'g-axis' }), xT = (sim.Tstar >= 0 && sim.Tstar < H - 1) ? (sim.Tstar + 1) * ppm : -1;
    var clash = function (x) { return xT >= 0 && x > xT - 10 && x < xT + 96; }, qOK = ppm * 3 >= 34;
    var mfmt = new Intl.DateTimeFormat(A.lang === 'de' ? 'de-DE' : 'en-GB', { month: 'short', timeZone: 'UTC' });
    for (var i = 0; i < M; i++) {
      var mo = P.months[i], x = i * ppm, toJan = (13 - mo.m) % 12;
      if (mo.m === 1 || i === 0) { // year boundary (and the year the plan starts in, when there is room before the next January)
        if (i > 0) g.appendChild(el('div', { class: 'g-grid', style: 'left:' + x + 'px' }));
        if (!clash(x) && (i > 0 || toJan * ppm >= 44) && (ppm * 12 >= 44 || mo.y % 2 === 0)) axis.appendChild(el('span', { class: 'y', style: 'left:' + x + 'px', text: String(mo.y) }));
      } else if (qOK && (mo.m - 1) % 3 === 0) { // quarters, when they fit
        g.appendChild(el('div', { class: 'g-grid q', style: 'left:' + x + 'px' }));
        if (!clash(x)) axis.appendChild(el('span', { style: 'left:' + x + 'px', text: mfmt.format(new Date(Date.UTC(mo.y, mo.m - 1, 1))).replace('.', '') }));
      }
    }
    g.appendChild(axis);
    var lanes = [], laneEnd = [];
    trs.forEach(function (tr, ri) {
      var b = tr.kind === 'existing' ? 'ex' : bucketOf(tr.term), x0 = tr.start * ppm, x1 = Math.min(M, tr.due) * ppm, w = Math.max(4, x1 - x0 - 2);
      var li = 0; while (li < laneEnd.length && laneEnd[li] > tr.start) li++;
      if (li === laneEnd.length) { lanes.push(el('div', { class: 'g-row' })); g.appendChild(lanes[li]); }
      laneEnd[li] = Math.max(tr.due, tr.start + Math.ceil((w + 4) / ppm));
      var label = A.eur(tr.amount) + ' · ' + A.pct(tr.rate * 100) + (w >= 200 && tr.bank ? ' · ' + tr.bank : ''), title = trancheTitle(P, tr);
      var bar = el('button', { type: 'button', class: 'g-bar' + (b === 'f1' ? ' light' : '') + (tr.pinned ? ' pin' : '') + (lad.open === ri ? ' sel' : ''), style: 'left:' + x0 + 'px;width:' + w + 'px;background:' + A.css('--c-' + b), title: title, 'aria-label': title,
        onclick: function () { lad.open = ri; Array.prototype.forEach.call(g.querySelectorAll('.g-bar.sel'), function (n) { n.classList.remove('sel'); }); bar.classList.add('sel'); var box = $('trancheDetail'); box.innerHTML = ''; box.appendChild(trancheDetail(tr)); } }, w >= 104 ? label : (w >= 52 ? A.n0(tr.amount / 1000) + 'k' : ''));
      lanes[li].appendChild(bar);
    });
    if (sim.Tstar >= 0 && sim.Tstar < H - 1) g.appendChild(el('div', { class: 'g-line', style: 'left:' + ((sim.Tstar + 1) * ppm) + 'px' }, el('span', { class: xT > W - 110 ? 'flip' : null, text: 'T* ' + mLabel(P, sim.Tstar) })));
    if (lad.open != null && trs[lad.open]) $('trancheDetail').appendChild(trancheDetail(trs[lad.open]));
  }
  // one calendar year per page, twelve month columns, every tranche with a readable caption (no hover needed)
  function ladderYear(P, sim, trs, g) {
    var H = P.H, y0 = P.months[0].y, lastM = 0;
    trs.forEach(function (tr) { lastM = Math.max(lastM, Math.min(H - 1, tr.due)); });
    var yLast = P.months[Math.min(H - 1, Math.max(lastM, sim.Tstar >= 0 ? sim.Tstar : 0))].y, years = [], y;
    for (y = y0; y <= yLast; y++) years.push(y);
    if (lad.year == null || years.indexOf(lad.year) < 0) lad.year = years[0];
    var box = $('ladYears');
    years.forEach(function (yy) { box.appendChild(el('button', { type: 'button', 'aria-pressed': yy === lad.year ? 'true' : 'false', text: String(yy), onclick: function () { lad.year = yy; lad.open = null; renderLadder(); } })); });
    var curBtn = box.querySelector('[aria-pressed="true"]'); if (curBtn && curBtn.scrollIntoView) { try { box.scrollLeft = Math.max(0, curBtn.offsetLeft - box.clientWidth / 2 + curBtn.offsetWidth / 2); } catch (e) { /* ignore */ } }
    $('ladPrev').disabled = years.indexOf(lad.year) <= 0; $('ladNext').disabled = years.indexOf(lad.year) >= years.length - 1;
    $('ladPrev').onclick = function () { lad.year = years[Math.max(0, years.indexOf(lad.year) - 1)]; lad.open = null; renderLadder(); };
    $('ladNext').onclick = function () { lad.year = years[Math.min(years.length - 1, years.indexOf(lad.year) + 1)]; lad.open = null; renderLadder(); };
    // month index of January of the selected year (may lie before the plan start)
    var j0 = C.ymIdx(lad.year, 1) - P.idx0, head = el('div', { class: 'yv-head' }), m;
    var fmt = new Intl.DateTimeFormat(A.lang === 'de' ? 'de-DE' : 'en-GB', { month: 'short', timeZone: 'UTC' });
    var tsIn = sim.Tstar >= 0 && sim.Tstar < H - 1 && sim.Tstar >= j0 && sim.Tstar < j0 + 12, tsPos = tsIn ? (sim.Tstar + 1 - j0) / 12 * 100 : -1;
    for (m = 0; m < 12; m++) head.appendChild(el('span', { class: (j0 + m < 0 || j0 + m >= H) ? 'off' : (tsIn && j0 + m === sim.Tstar ? 'ts' : ''), text: fmt.format(new Date(Date.UTC(lad.year, m, 1))).replace('.', '').slice(0, 3) }));
    g.appendChild(head);
    var rowsBox = el('div', { class: 'yv-rows' }), nAct = 0, placed = 0, matured = 0;
    trs.forEach(function (tr, ri) {
      if (tr.kind !== 'existing' && tr.start >= j0 && tr.start < j0 + 12) placed += tr.amount;
      if (tr.due >= j0 && tr.due < j0 + 12 && tr.due < H) matured += tr.amount;
      var a0 = Math.max(tr.start, j0), a1 = Math.min(tr.due, j0 + 12);
      if (a1 <= a0) return;
      nAct++;
      var b = tr.kind === 'existing' ? 'ex' : bucketOf(tr.term), before = tr.start < j0, after = tr.due > j0 + 12;
      var cap = el('div', { class: 'yv-cap' }, el('span', { class: 'yv-main', text: A.eur(tr.amount) + ' · ' + trancheName(P, tr) + ' · ' + A.pct(tr.rate * 100) }),
        el('span', { class: 'yv-side', text: (tr.bank ? tr.bank + ' · ' : '') + mLabel(P, tr.start) + ' → ' + (tr.due < H ? mLabel(P, tr.due) : '> ' + mLabel(P, H - 1)) + (tr.pinned ? ' · ' + t('d_pinned') : '') }));
      var bar = el('span', { class: 'yv-bar' + (before ? ' cut-l' : '') + (after ? ' cut-r' : '') + (tr.pinned ? ' pin' : ''), style: 'left:' + ((a0 - j0) / 12 * 100) + '%;width:' + ((a1 - a0) / 12 * 100) + '%;background:' + A.css('--c-' + b) });
      var row = el('button', { type: 'button', class: 'yv-row' + (lad.open === ri ? ' sel' : ''), 'aria-expanded': lad.open === ri ? 'true' : 'false', 'aria-label': trancheTitle(P, tr),
        onclick: function () { lad.open = lad.open === ri ? null : ri; renderLadder(); } }, cap, el('span', { class: 'yv-track' }, bar, tsIn ? el('i', { class: 'yv-t', style: 'left:' + tsPos + '%' }) : null));
      rowsBox.appendChild(row);
      if (lad.open === ri) rowsBox.appendChild(trancheDetail(tr));
    });
    if (!nAct) rowsBox.appendChild(el('div', { class: 'empty', text: t('l_none') }));
    g.appendChild(rowsBox);
    g.appendChild(el('div', { class: 'yv-sum', text: t(nAct === 1 ? 'l_sum1' : 'l_sum', { y: lad.year, n: nAct, a: A.eur(placed), b: A.eur(matured) }) + (tsIn ? ' · ' + t('l_ts', { m: mLabel(P, sim.Tstar) }) : '') }));
  }
  function trancheTitle(P, tr) { return trancheName(P, tr) + ' · ' + tr.bank + ' · ' + A.eur(tr.amount) + ' · ' + A.pct(tr.rate * 100) + ' · ' + mLabel(P, tr.start) + ' → ' + (tr.due < P.H ? mLabel(P, tr.due) : '> ' + mLabel(P, P.H - 1)); }
  function trancheDetail(tr) {
    var v = A.view, P = v.P, d = trancheDates(P, tr), tot = trancheTotals(tr);
    function dd(k, val) { return el('div', null, el('dt', { text: k }), el('dd', { text: val })); }
    var items = [dd(t('d_product'), trancheName(P, tr) + (tr.pinned ? ' (' + t('d_pinned') + ')' : '')), dd(t('d_bank'), tr.bank || '–'), dd(t('d_amount'), A.eur(tr.amount)), dd(t('d_rate'), A.pct(tr.rate * 100)),
      dd(t('d_conv'), t('conv_' + tr.conv))];
    if (tr.kind !== 'existing') { items.push(dd(t('d_order'), d.now ? t('a_now', { d: A.dateStr(d.order, true) }) : A.dateStr(d.order, true))); items.push(dd(t('d_placed'), A.dateStr(d.value, true))); }
    items.push(dd(t('d_due'), d.due ? A.dateStr(d.due, true) : '–')); items.push(dd(t('d_payout'), A.eur2(tot.payout))); items.push(dd(t('d_interest'), A.eur2(tot.interest))); items.push(dd(t('d_yield'), A.pct(tot.yield * 100)));
    var btn = null;
    if (tr.kind !== 'existing') {
      if (tr.pinned) btn = el('button', { class: 'btn sm', type: 'button', text: t('d_unpin'), onclick: function () { A.touch(function (st) { st.pins = st.pins.filter(function (p) { return p.id !== tr.pinId; }); }, true); } });
      else btn = el('button', { class: 'btn sm', type: 'button', text: t('d_pin'), onclick: function () { A.touch(function (st) { st.pins.push({ id: 'n' + Date.now().toString(36), month: P.months[tr.start].key, productId: P.products[tr.k].id, amount: tr.amount }); }, true); } });
    }
    return el('div', { class: 'detail' }, el('dl', null, items), btn ? el('div', null, btn) : null);
  }

  A.renderLadder = renderLadder;

  V.trancheDates = trancheDates; V.trancheTotals = trancheTotals; V.lad = lad; V.renderLadder = renderLadder;
})();

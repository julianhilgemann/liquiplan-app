/* ===== handbook.js: "Handbuch", the in-app handbook, a page mode like the wizard and the step-by-step view =====
   The chapters come from three sources, and the page, its menu and the search index are all built from them, so what
   is searched is what is shown:
   - the texts in i18n/handbook-de.js and i18n/handbook-en.js (LP.hb.de, LP.hb.en; their header explains the markup),
   - shared data: the glossary chapter from LP.i18n.gloss (also behind the underlined terms), "What's new" from
     LP.changelog (i18n/changelog.js, whose first entry is the version the app shows),
   - chapters other files push onto LP.hb.extra, shown in the menu group "Theorie" after the chapter on the optimiser.
     The interface: { id: 'th-…', title: { de, en }, sections: [{ id, title: { de, en }, text: { de, en } }],
     render(box, lang), teardown() }. render fills an empty block element (class "prose") and creates one element
     with id === section.id per section; teardown, when present, runs before the chapter is left or drawn again.
   Addresses: #handbuch opens the handbook (the chapter list on phones), #handbuch/<id> a chapter, or any section by
   its id, and #handbuch/<chapter>/<section> a section. Links in the handbook are plain links to these addresses, and
   the hash is the only state: following one adds a history entry, so the browser's Back button goes back through the
   chapters and finally out of the handbook. */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, $ = A.$, el = A.el, t = A.t, esc = A.esc;
  LP.hb = LP.hb || {}; LP.hb.extra = LP.hb.extra || [];
  var HB = LP.hb;

  // the menu: groups in order with their chapters; 'theory' holds the chapters of LP.hb.extra (and is left out without them)
  var OUTLINE = [['start', ['intro', 'quick']], ['use', ['inputs', 'results', 'howto', 'privacy']], ['bg', ['optimiser']], ['theory', null], ['ref', ['faq', 'glossary', 'news', 'disclaimer']]];
  // on: shown; cur: chapter on screen; last: the chapter read last (where the handbook reopens); menu: the phone's chapter list
  // y: page scroll of the page underneath; overWiz: opened on top of the wizard; hash: the address on screen;
  // q, hits, act: the search; ext: the theory chapter on screen (for its teardown); drawn: language + chapter drawn
  var S = { on: false, cur: null, last: null, menu: false, y: 0, overWiz: false, hash: null, q: '', hits: [], act: -1, open: false, ext: null, drawn: null, marks: null, flash: 0, live: 0 };
  var H = A.handbook = {};

  function narrow() { return window.matchMedia('(max-width: 720px)').matches; }
  function pick(o) { return o == null ? '' : typeof o === 'string' ? o : String(o[A.lang] != null ? o[A.lang] : (o.de != null ? o.de : '')); }
  A.version = (LP.changelog && LP.changelog[0] && LP.changelog[0].version) || '';
  function dateStr(iso, long) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return iso || '';
    return new Intl.DateTimeFormat(A.lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  }

  // ---------- the chapters, per language ----------
  var CACHE = { key: '', list: [] };
  function chapters() {
    var key = A.lang + ':' + HB.extra.length;
    if (CACHE.key === key) return CACHE.list;
    var tx = HB[A.lang] || HB.de || {}, list = [], seen = {};
    OUTLINE.forEach(function (g) {
      var add = function (c) { if (c && c.title && !seen[c.id]) { seen[c.id] = 1; c.group = g[0]; list.push(c); } };
      if (!g[1]) HB.extra.forEach(function (x) { if (x && /^th-[a-z0-9-]+$/.test(x.id) && typeof x.render === 'function') add(extraCh(x)); });
      else g[1].forEach(function (id) { add(id === 'glossary' ? glossCh(tx.glossary) : id === 'news' ? newsCh(tx.news) : textCh(id, tx[id])); });
    });
    list.forEach(function (c, i) { c.no = i + 1; });
    CACHE = { key: key, list: list };
    return list;
  }
  function byId(id) { var l = chapters(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function findSec(id) { var l = chapters(); for (var i = 0; i < l.length; i++) for (var j = 0; j < l[i].sections.length; j++) if (l[i].sections[j].id === id) return l[i]; return null; }
  function has(id) { return HB.extra.some(function (x) { return x && x.id === id; }) || !!(HB[A.lang] || {})[id]; }

  function textCh(id, d) {
    if (!d) return null;
    return { id: id, kind: 'text', title: lab(d.t), lead: d.l || '', toc: d.toc, sections: (d.s || []).map(function (s) { return { id: s[0], title: lab(s[1]), html: s[2] }; }) };
  }
  function titleOf(id) { // of a chapter or a section
    var c = byId(id); if (c) return c.title;
    c = findSec(id); if (!c) return '';
    for (var j = 0; j < c.sections.length; j++) if (c.sections[j].id === id) return c.sections[j].title;
    return '';
  }
  function glossCh(d) {
    if (!d) return null;
    var G = LP.i18n.gloss, de = A.lang === 'de', i = de ? 0 : 2, coll = new Intl.Collator(A.lang, { sensitivity: 'base', numeric: true });
    var keys = Object.keys(G).sort(function (a, b) { return coll.compare(G[a][i], G[b][i]); });
    return { id: 'glossary', kind: 'gloss', title: d.t, lead: d.l || '', sections: keys.map(function (k) {
      var g = G[k], alt = de || g[0].toLowerCase() === g[2].toLowerCase() ? '' : g[0];
      return { id: 'gl-' + k, title: g[i], alt: alt, html: '<p>' + esc(g[i + 1]) + '</p>' };
    }) };
  }
  function newsCh(d) {
    if (!d) return null;
    return { id: 'news', kind: 'news', title: d.t, lead: d.l || '', sections: (LP.changelog || []).map(function (r) {
      var items = (r.items || []).map(function (it) { return '<li><span class="hb-kind ' + esc(it.kind) + '">' + esc(t('hb_k_' + it.kind)) + '</span> ' + esc(pick(it)) + '</li>'; }).join('');
      return { id: 'news-' + String(r.version).replace(/[^0-9a-z]+/gi, '-'), title: r.version + ' · ' + pick(r.title), html: '<p class="hb-date">' + esc(t('hb_version', { v: r.version })) + ' · ' + esc(dateStr(r.date, true)) + '</p><ul class="hb-log">' + items + '</ul>' };
    }) };
  }
  function extraCh(x) {
    return { id: x.id, kind: 'extra', ext: x, title: pick(x.title), lead: '', sections: (x.sections || []).filter(function (s) { return s && s.id; }).map(function (s) { return { id: s.id, title: pick(s.title), text: pick(s.text) }; }) };
  }

  // ---------- the texts' markup ----------
  // [[key]]: a label as the app shows it (LP.i18n); [[#id]]: a link to a chapter or section, with its title as the text;
  // {key} or {key|text}: a glossary term with its tooltip; an element with data-needs="<chapter id>" is left out while
  // that chapter does not exist (the theory chapters are optional). Titles may hold [[key]] too.
  var UI = /\[\[(\w+)\]\]/g, LINK = /\[\[#([a-z0-9-]+)\]\]/g, TERM = /\{(\w+)(?:\|([^{}]+))?\}/g, NEEDS = /<(p|div|li)\b[^>]*\sdata-needs="([a-z0-9-]+)"[^>]*>[\s\S]*?<\/\1>/g;
  function lab(s) { return String(s || '').replace(UI, function (m, k) { return t(k); }); }
  function rich(html) {
    return String(html || '').replace(NEEDS, function (m, tag, id) { return has(id) ? m : ''; })
      .replace(LINK, function (m, id) { return '<a href="#handbuch/' + id + '">' + esc(titleOf(id) || id) + '</a>'; })
      .replace(UI, function (m, k) { return '<b class="hb-ui">' + esc(t(k)) + '</b>'; })
      .replace(TERM, function (m, k, txt) { return LP.i18n.gloss[k] ? A.term(k, txt) : m; });
  }
  var BLOCK = /<\/?(?:p|li|ul|ol|h[1-6]|br|div|tr|td|th|dt|dd|dl|section|table|pre|blockquote)\b[^>]*>/gi, dec = document.createElement('textarea');
  function plain(html) { dec.innerHTML = rich(html).replace(BLOCK, ' ').replace(/<[^>]*>/g, ''); return dec.value.replace(/\s+/g, ' ').trim(); }

  // ---------- search: folding, index, ranking, snippets ----------
  /* Text is compared in two folded forms, so that spellings with and without umlauts find each other: lower case,
     no accents, no hyphens, ß as ss, and umlauts once as two letters ("über" → "ueber") and once as the plain vowel
     ("über" → "uber"). A word matches when it occurs in either form. map[i] is the position in the original text
     of the folded character i, which places the highlight. */
  var UML = { 'ä': ['ae', 'a'], 'ö': ['oe', 'o'], 'ü': ['ue', 'u'], 'ß': ['ss', 'ss'] };
  function fold(str, k) {
    var out = '', map = [], i, c, r, j;
    for (i = 0; i < str.length; i++) {
      c = str.charAt(i).toLowerCase();
      if (c === '-' || c === '­') continue;
      if (UML[c]) r = UML[c][k]; else if (c < 'À') r = c; else r = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (j = 0; j < r.length; j++) { out += r.charAt(j); map.push(i); }
    }
    return { s: out, map: map };
  }
  function folds(str) { return [fold(str, 0), fold(str, 1)]; }
  var IDX = { key: '', list: [] };
  function index() {
    var key = A.lang + ':' + HB.extra.length;
    if (IDX.key === key) return IDX.list;
    var out = [];
    chapters().forEach(function (c) {
      out.push(entry(c, null, c.title, '', c.lead ? plain(c.lead) : ''));
      c.sections.forEach(function (s) { out.push(entry(c, s, s.title, s.alt, s.text != null ? String(s.text).replace(/\s+/g, ' ').trim() : plain(s.html))); });
    });
    IDX = { key: key, list: out };
    return out;
  }
  // a section's title (and a glossary term's German name in English), its text, and the chapter it belongs to
  function entry(c, s, title, alt, text) { return { c: c, s: s, title: title + (alt ? ' · ' + alt : ''), text: text, ft: folds(title), fa: alt ? folds(alt) : null, fx: folds(text), fc: s ? folds(c.title) : null }; }
  function terms(q) {
    var seen = {};
    return q.split(/\s+/).map(function (w) { return [fold(w, 0).s, fold(w, 1).s]; }).filter(function (p) { if (!p[0] || seen[p[0]]) return false; seen[p[0]] = 1; return true; });
  }
  function at(f, tm) { for (var k = 0; k < 2; k++) { var i = f[k].s.indexOf(tm[k]); if (i >= 0) return { k: k, i: i }; } return null; }
  function wordStart(f, hit) { var c = hit.i > 0 ? f[hit.k].s.charAt(hit.i - 1) : ' '; return !/[a-z0-9]/.test(c); }
  /* Ranking: every word has to occur in the section (its title, its text, or the title of its chapter), and at least
     one in the section itself. Words in a title count most, more so at the start of a word; the whole query as a
     phrase, or as the complete title (a glossary term, a chapter), counts extra. Ties keep the order of the handbook. */
  function score(e, tms, phrase, whole) {
    var sc = 0, own = false;
    for (var n = 0; n < tms.length; n++) {
      var tm = tms[n], ht = at(e.ft, tm), ha = e.fa ? at(e.fa, tm) : null, hx = at(e.fx, tm), hc = e.fc ? at(e.fc, tm) : null;
      if (!ht && !ha && !hx && !hc) return 0;
      if (ht || ha) { own = true; sc += 30 + ((ht ? wordStart(e.ft, ht) : wordStart(e.fa, ha)) ? 15 : 0); }
      if (hx) { own = true; sc += 6 + (wordStart(e.fx, hx) ? 3 : 0); }
      if (hc) sc += 8;
    }
    if (!own) return 0; // a chapter's title alone does not make each of its sections a hit
    if (phrase) { if (at(e.ft, phrase)) sc += 40; else if (at(e.fx, phrase)) sc += 12; }
    if (e.ft[0].s.replace(/\s+/g, '') === whole || (e.fa && e.fa[0].s.replace(/\s+/g, '') === whole)) sc += 60;
    if (!e.s) sc += 4;
    return sc;
  }
  function search(q) {
    var tms = terms(q), list = index(), out = [];
    if (!tms.length) return out;
    var phrase = tms.length > 1 ? [0, 1].map(function (k) { return tms.map(function (x) { return x[k]; }).join(' '); }) : null, whole = tms.map(function (x) { return x[0]; }).join('');
    list.forEach(function (e, i) { var sc = score(e, tms, phrase, whole); if (sc > 0) out.push({ e: e, sc: sc, i: i }); });
    out.sort(function (a, b) { return b.sc - a.sc || a.i - b.i; });
    return out;
  }
  // the places of all search words in str, as [start, end) in str, merged where they overlap
  function ranges(str, tms) {
    var f = folds(str), rs = [], out = [];
    tms.forEach(function (tm) {
      for (var k = 0; k < 2; k++) {
        var s = f[k].s, q = tm[k], i = s.indexOf(q);
        while (q && i >= 0) { rs.push([f[k].map[i], f[k].map[i + q.length - 1] + 1]); i = s.indexOf(q, i + q.length); }
      }
    });
    rs.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    rs.forEach(function (r) { var l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); });
    return out;
  }
  function highlight(str, tms) {
    var rs = ranges(str, tms), html = '', pos = 0;
    rs.forEach(function (r) { html += esc(str.slice(pos, r[0])) + '<mark>' + esc(str.slice(r[0], r[1])) + '</mark>'; pos = r[1]; });
    return html + esc(str.slice(pos));
  }
  function snippet(text, tms) {
    if (!text) return '';
    var rs = ranges(text, tms), first = rs.length ? rs[0][0] : 0, start = Math.max(0, first - 60), end, sp;
    if (start > 0) { sp = text.indexOf(' ', start); if (sp > 0 && sp < first) start = sp + 1; }
    end = Math.min(text.length, start + 180);
    if (end < text.length) { sp = text.lastIndexOf(' ', end); if (sp > start + 90) end = sp; }
    return (start > 0 ? '… ' : '') + highlight(text.slice(start, end), tms) + (end < text.length ? ' …' : '');
  }

  // ---------- drawing ----------
  function foot() { // the version at the foot of the analysis and in the menu
    var v = A.version, f = $('appVer');
    if (f) { f.textContent = v ? t('hb_version', { v: v }) : ''; f.title = t('hb_whatsNew'); }
  }
  function renderMenu() {
    var box = $('hbSteps'), list = chapters(), grp = null, ol = null;
    box.innerHTML = '';
    list.forEach(function (c) {
      if (c.group !== grp) { grp = c.group; ol = el('ol', { class: 'wiz-steps' }); box.appendChild(el('li', { class: 'hb-g' }, el('span', { class: 'rp-grp hb-grp', id: 'hbG-' + grp, text: t('hb_g_' + grp) }), ol)); ol.setAttribute('aria-labelledby', 'hbG-' + grp); }
      ol.appendChild(el('li', null, el('a', { class: 'wiz-item hb-item', href: '#handbuch/' + c.id, 'aria-current': c.id === S.cur ? 'page' : null },
        el('span', { class: 'no', text: String(c.no) }), el('span', { class: 'tt', text: c.title }), el('span', { class: 'chev', 'aria-hidden': 'true' }))));
    });
    var r = LP.changelog && LP.changelog[0], ver = $('hbVer'); ver.innerHTML = '';
    if (r) ver.appendChild(el('a', { href: '#handbuch/news' }, t('hb_version', { v: r.version }) + ' · ' + dateStr(r.date)));
  }
  function heading(c, s, tag) {
    return el(tag || 'h3', { id: s.id + '-h', tabindex: '-1' }, el('a', { class: 'hb-self', href: '#handbuch/' + c.id + '/' + s.id }, el('span', { text: s.title }), s.alt ? el('span', { class: 'hb-alt', lang: 'de', text: s.alt }) : null, el('span', { class: 'hb-hash', 'aria-hidden': 'true', text: '#' })));
  }
  function teardown() {
    var x = S.ext; S.ext = null;
    if (x && typeof x.teardown === 'function') { try { x.teardown(); } catch (e) { if (window.console) console.error(e); } }
  }
  function renderChapter(c) {
    teardown();
    var body = $('hbBody'), list = chapters(), i = list.indexOf(c);
    body.innerHTML = ''; body.className = 'hb-text hb-' + c.kind;
    $('hbChTitle').textContent = c.title;
    $('hbKicker').textContent = t('hb_g_' + c.group) + ' · ' + t('hb_ch', { n: c.no, N: list.length });
    if (c.kind === 'extra') {
      var box = el('div', { class: 'prose' }); body.appendChild(box);
      try { c.ext.render(box, A.lang); S.ext = c.ext; }
      catch (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'note warn', text: t('hb_err') })); if (window.console) console.error(e); }
    } else {
      if (c.lead) body.appendChild(el('p', { class: 'hb-intro', html: rich(c.lead) }));
      if (c.kind === 'text' && c.toc !== false && c.sections.length >= 4) {
        body.appendChild(el('nav', { class: 'hb-toc', 'aria-label': t('hb_toc') }, el('p', { class: 'hb-toc-h', 'aria-hidden': 'true', text: t('hb_toc') }),
          el('ul', null, c.sections.map(function (s) { return el('li', null, el('a', { href: '#handbuch/' + c.id + '/' + s.id, text: s.title })); }))));
      }
      c.sections.forEach(function (s) {
        var sec = el('section', { class: 'hb-sec', id: s.id, 'aria-labelledby': s.id + '-h' }, heading(c, s));
        sec.insertAdjacentHTML('beforeend', rich(s.html));
        body.appendChild(sec);
      });
    }
    var pg = $('hbPager'), prev = list[i - 1], next = list[i + 1];
    pg.innerHTML = ''; pg.setAttribute('aria-label', t('hb_pager'));
    function link(x, cls, k) {
      var arrow = function (s) { return el('span', { 'aria-hidden': 'true', text: s }); };
      return el('a', { class: 'hb-pg ' + cls, href: '#handbuch/' + x.id }, el('span', { class: 'k' }, cls === 'prev' ? arrow('‹ ') : null, t(k), cls === 'next' ? arrow(' ›') : null), el('span', { class: 'tt', text: x.title }));
    }
    if (prev) pg.appendChild(link(prev, 'prev', 'hb_prev'));
    if (next) pg.appendChild(link(next, 'next', 'hb_next'));
    S.cur = c.id; S.last = c.id; S.drawn = A.lang + ':' + c.id + ':' + HB.extra.length;
  }
  function paint() { // what is visible: phone list or chapter, search results or chapter
    var hb = $('handbook'), res = S.open;
    hb.classList.toggle('show-menu', S.menu && !res);
    hb.classList.toggle('searching', res);
    $('hbRes').classList.toggle('hide', !res);
    $('hbArt').classList.toggle('hide', res); $('hbPager').classList.toggle('hide', res);
    $('hbQ').setAttribute('aria-expanded', res && S.hits.length ? 'true' : 'false');
    Array.prototype.forEach.call(document.querySelectorAll('#hbSteps .hb-item'), function (a) { if (a.getAttribute('href') === '#handbuch/' + S.cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function labels() { // texts that renderStatic does not set: placeholders, names, the toolbar button
    var q = $('hbQ');
    q.placeholder = t('hb_ph'); q.setAttribute('aria-label', t('hb_search'));
    $('hbClear').setAttribute('aria-label', t('hb_clear')); $('hbClear').title = t('hb_clear');
    $('hbMenu').setAttribute('aria-label', t('hb_menu')); $('hbHits').setAttribute('aria-label', t('hb_results'));
    sync();
  }
  function sync() { // the toolbar button: "Handbuch", or the way back while the handbook is open
    var b = $('btnHandbook'); if (!b) return;
    var key = S.on ? (S.overWiz ? 'wizard' : 'analysis') : 'hb_btn', lab = b.querySelector('span');
    lab.setAttribute('data-i18n', key); lab.textContent = t(key);
    b.setAttribute('aria-label', t(key));
    if (S.on) b.removeAttribute('title'); else b.title = t('hb_btn');
  }

  // ---------- search on screen ----------
  function runSearch(announce) {
    var q = $('hbQ').value, tq = q.trim();
    S.q = q; $('hbClear').classList.toggle('hide', !q); $('handbook').classList.toggle('has-q', !!q);
    if (tq.length < 2) { S.open = false; S.hits = []; S.act = -1; $('hbQ').removeAttribute('aria-activedescendant'); paint(); say(''); return; }
    var tms = terms(tq), all = search(tq), hits = all.slice(0, 60), ol = $('hbHits');
    S.hits = hits; S.act = -1; S.open = true; ol.innerHTML = '';
    $('hbQ').removeAttribute('aria-activedescendant');
    hits.forEach(function (h, i) {
      var e = h.e, path = e.s ? e.c.title : t('hb_g_' + e.c.group);
      ol.appendChild(el('li', { class: 'hb-hit', role: 'option', id: 'hbHit' + i, 'aria-selected': 'false', onclick: function () { openHit(i); } },
        el('span', { class: 'hb-hit-path', text: path }), el('span', { class: 'hb-hit-t', html: highlight(e.s ? e.title : e.c.title, tms) }),
        e.text ? el('span', { class: 'hb-hit-x', html: snippet(e.text, tms) }) : null));
    });
    var n = all.length, none = $('hbNone');
    $('hbCount').textContent = n ? t(n === 1 ? 'hb_hit1' : 'hb_hitN', { n: n, q: tq }) + (n > hits.length ? ' ' + t('hb_shown', { n: hits.length }) : '') : '';
    none.classList.toggle('hide', !!n); ol.classList.toggle('hide', !n);
    if (!n) {
      none.innerHTML = '';
      none.appendChild(el('p', { class: 'hb-none-h', text: t('hb_none', { q: tq }) }));
      none.appendChild(el('p', null, t('hb_noneHint') + ' ', el('a', { href: '#handbuch/glossary', text: byId('glossary') ? byId('glossary').title : '' }), ' · ', el('a', { href: '#handbuch/faq', text: byId('faq') ? byId('faq').title : '' })));
    }
    paint();
    if (announce !== false) say(n ? $('hbCount').textContent : t('hb_none', { q: tq }));
  }
  function say(text) { // the result count for screen readers, once typing pauses
    clearTimeout(S.live);
    S.live = setTimeout(function () { $('hbLive').textContent = text; }, text ? 450 : 0);
  }
  function paintAct() {
    var q = $('hbQ');
    S.hits.forEach(function (h, i) { var n = $('hbHit' + i); if (n) n.setAttribute('aria-selected', i === S.act ? 'true' : 'false'); });
    var cur = S.act >= 0 ? $('hbHit' + S.act) : null;
    if (cur) { q.setAttribute('aria-activedescendant', cur.id); try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } } else q.removeAttribute('aria-activedescendant');
  }
  function openHit(i) {
    var h = S.hits[i]; if (!h) return;
    S.marks = terms(S.q.trim());
    S.open = false; paint();
    go('#handbuch/' + h.e.c.id + (h.e.s ? '/' + h.e.s.id : ''));
  }
  function clearSearch() { $('hbQ').value = ''; runSearch(false); }

  // ---------- going places ----------
  function saveY() { try { history.replaceState(Object.assign({}, history.state, { hbY: window.pageYOffset }), ''); } catch (e) { /* no history here */ } }
  function go(hash) { // follow an address as a link would
    saveY();
    if (location.hash === hash) { route(true); return; }
    location.hash = hash;
  }
  function setUrl(hash) { // leave the handbook: a new history entry without the hash, so that Back reopens it
    var base = location.href.split('#')[0];
    try { history.pushState(null, '', base + (hash || '')); return; } catch (e) { /* a document that may not change its address */ }
    try { if (location.hash) location.hash = hash || ''; } catch (e2) { /* ignore */ }
  }
  var RE = /^#handbuch(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?\/?$/;
  function parse(h) { var m = RE.exec(h || ''); return m ? { a: m[1] || null, b: m[2] || null } : null; }
  function route(force) {
    var h = location.hash, p = parse(h);
    if (!p) { if (S.on) close(true); return; }
    if (S.on && h === S.hash && force !== true) return; // popstate and hashchange both report one step
    var y = history.state && typeof history.state.hbY === 'number' ? history.state.hbY : null;
    S.hash = h;
    if (!S.on) enter();
    var c = null, sec = null;
    if (p.a) { c = byId(p.a); if (!c && (c = findSec(p.a))) sec = p.a; if (c && p.b) sec = p.b; }
    S.menu = !p.a && narrow();
    show(c || byId(S.last) || chapters()[0], sec, y);
  }
  function show(c, sec, y) {
    if (!c) return;
    var key = A.lang + ':' + c.id + ':' + HB.extra.length;
    if (S.drawn !== key || S.cur !== c.id) renderChapter(c); else clearMarks();
    S.open = false; paint();
    var marks = S.marks; S.marks = null;
    if (S.menu) { window.scrollTo(0, y || 0); focus($('hbTitle')); return; }
    if (y != null) { window.scrollTo(0, y); focus($('hbChTitle')); return; }
    if (sec && document.getElementById(sec) && $('hbBody').contains(document.getElementById(sec))) { reveal(sec, c.kind === 'extra' ? null : marks); return; }
    window.scrollTo(0, 0); focus($('hbChTitle'));
  }
  function focus(n) { try { n.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function reveal(id, tms) {
    var n = document.getElementById(id), h = /^H[1-6]$/.test(n.tagName) ? n : n.querySelector('h1, h2, h3, h4, h5, h6'), f = h || n;
    clearMarks();
    if (tms && tms.length) markIn(n, tms);
    n.scrollIntoView({ block: 'start' });
    if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
    focus(f);
    var old = document.querySelector('.hb-target'); if (old) old.classList.remove('hb-target');
    f.classList.add('hb-target'); clearTimeout(S.flash); S.flash = setTimeout(function () { f.classList.remove('hb-target'); }, 2600);
  }
  function markIn(root, tms) { // highlights the search words in the section a result led to
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = w.nextNode())) if (n.nodeValue.trim() && !(n.parentNode.closest && n.parentNode.closest('.hb-hash'))) nodes.push(n);
    nodes.forEach(function (tn) {
      var s = tn.nodeValue, rs = ranges(s, tms), frag, pos = 0;
      if (!rs.length) return;
      frag = document.createDocumentFragment();
      rs.forEach(function (r) { if (r[0] > pos) frag.appendChild(document.createTextNode(s.slice(pos, r[0]))); frag.appendChild(el('mark', { class: 'hb-mark', text: s.slice(r[0], r[1]) })); pos = r[1]; });
      if (pos < s.length) frag.appendChild(document.createTextNode(s.slice(pos)));
      tn.parentNode.replaceChild(frag, tn);
    });
  }
  function clearMarks() {
    Array.prototype.forEach.call(document.querySelectorAll('#hbBody mark.hb-mark'), function (m) { var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
  }

  // ---------- entering and leaving ----------
  function enter() {
    S.on = true; S.y = window.pageYOffset || 0;
    if (A.replay && A.replay.isOpen && A.replay.isOpen()) A.replay.close(); // its keys would act on the hidden page
    S.overWiz = !!(A.wizard && A.wizard.open);
    if (A.runSheet) A.runSheet.hide();
    $('app').classList.add('hb'); $('handbook').classList.remove('hide');
    labels(); renderMenu();
  }
  function close(fromHistory) {
    if (!S.on) return;
    teardown();
    S.on = false; S.menu = false; S.hash = null; S.drawn = null;
    clearSearch();
    $('app').classList.remove('hb'); $('handbook').classList.add('hide');
    sync();
    if (!fromHistory) setUrl('');
    if (A.busy && A.runSheet) A.runSheet.show();
    if (!S.overWiz) A.resizeCharts(); // the charts may have been drawn or resized while hidden
    window.scrollTo(0, S.y);
    var b = $('btnHandbook'); if (b && b.offsetParent) focus(b);
  }
  // after a change of language or appearance: draw everything again in place, the section being read stays where it was
  function render() {
    foot();
    if (!S.on) { sync(); return; }
    var c = byId(S.cur) || chapters()[0], anchor = null, top = 0;
    if (!S.menu && !S.open) {
      var lim = $('hbBody').getBoundingClientRect().top < 0 ? barBottom() + 24 : -Infinity;
      c.sections.forEach(function (s) { var n = document.getElementById(s.id); if (n && n.getBoundingClientRect().top <= lim) { anchor = s.id; top = n.getBoundingClientRect().top; } });
    }
    var y = window.pageYOffset;
    labels(); renderMenu(); S.drawn = null; renderChapter(c); paint();
    if (S.q.trim().length >= 2) runSearch(false);
    var n = anchor && document.getElementById(anchor);
    if (n) window.scrollBy(0, n.getBoundingClientRect().top - top); else window.scrollTo(0, y);
  }
  function barBottom() { var b = document.querySelector('.hb-bar'); return b ? b.getBoundingClientRect().bottom : 0; }

  // ---------- wiring ----------
  $('btnHandbook').onclick = function () { if (S.on) close(); else go('#handbuch'); };
  var q = $('hbQ');
  q.addEventListener('input', function () { runSearch(); });
  q.addEventListener('focus', function () { if (q.value.trim().length >= 2 && !S.open) runSearch(false); });
  q.addEventListener('keydown', function (e) {
    var k = e.key, n = S.hits.length;
    if ((k === 'ArrowDown' || k === 'ArrowUp') && S.open && n) { e.preventDefault(); S.act = k === 'ArrowDown' ? (S.act + 1) % n : (S.act <= 0 ? n - 1 : S.act - 1); paintAct(); }
    else if (k === 'Enter') { e.preventDefault(); if (!S.open && q.value.trim().length >= 2) runSearch(); else if (S.open && n) openHit(S.act >= 0 ? S.act : 0); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (q.value) clearSearch(); else focus(S.menu ? $('hbTitle') : $('hbChTitle')); }
  });
  $('hbClear').onclick = function () { clearSearch(); q.focus(); };
  document.addEventListener('keydown', function (e) {
    if (!S.on || e.defaultPrevented || $('modal').classList.contains('open') || !$('runSheet').classList.contains('hide')) return;
    var tg = e.target, typing = tg && tg.closest && tg.closest('input, textarea, select, [contenteditable]');
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); q.focus(); q.select(); return; }
    if (e.key === 'Escape' && !typing) close();
  });
  document.addEventListener('click', function (e) { // a link to the address already on screen: show it again (the browser would do nothing)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#handbuch"]'); if (!a) return;
    saveY();
    if (a.getAttribute('href') === location.hash) { e.preventDefault(); route(true); }
  });
  window.addEventListener('hashchange', function () { route(); });
  window.addEventListener('popstate', function () { route(); });
  // the theory chapters may draw charts: redraw them in the other appearance
  var th = null, recolor = function () { clearTimeout(th); th = setTimeout(function () { if (S.on && S.ext) render(); }, 80); };
  try { new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* ignore */ }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor); } catch (e2) { /* ignore */ }

  foot(); sync();
  if (parse(location.hash)) setTimeout(route, 0); // a link into the handbook: open it once the page has started

  H.open = function (id) { go('#handbuch' + (id ? '/' + id : '')); };
  H.close = function () { close(); };
  H.render = render; H.isOpen = function () { return S.on; };
  H.index = index; H.search = search; H.chapters = chapters; // for tests and for other views that want to link into the handbook
})();

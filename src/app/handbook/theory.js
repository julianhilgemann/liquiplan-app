/* ===== handbook/theory.js: the theory chapters of the handbook (registration, rendering, formulas) =====
   Pushes the chapters th-lp … th-check onto LP.hb.extra, the list the handbook page shows under "Theorie".
   Texts come from theory-de.js / theory-en.js (LP.hb.theoryText), the chart of th-lp from simplex-chart.js.
   Formulas: MathJax 3 with SVG output, loaded from jsDelivr (A.CDN.mathjax) the first time a theory chapter is shown.
   It is configured before it loads so that it typesets nothing by itself; each render then typesets its own box only.
   SVG rather than CHTML: one file and no web fonts to fetch, so a formula either appears whole or the TeX stays; the
   glyphs are paths in currentColor and follow the theme; a display formula is one element of fixed width that can scroll
   in its container; and it looks the same in Chromium, Firefox and WebKit. If the library cannot be loaded, the TeX
   source stays readable and a note says so. */
(function () {
  'use strict';
  var LP = window.LP; LP.hb = LP.hb || {}; LP.hb.extra = LP.hb.extra || [];
  var A = LP.app, TX = LP.hb.theoryText, ORDER = ['th-lp', 'th-model', 'th-lex', 'th-int', 'th-check'];
  var MJ_TIMEOUT = 20000;

  // ---------- texts: $…$ / $$…$$ become MathJax delimiters, {key} / {key|text} glossary terms ----------
  var MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  function termText(k, txt, lang) { var g = LP.i18n.gloss[k]; return g ? (txt || g[lang === 'de' ? 0 : 2]) : null; }
  function terms(s, lang, html) {
    return s.replace(/\{(\w+)(?:\|([^}]*))?\}/g, function (m, k, txt) { var w = termText(k, txt, lang); return w == null ? m : html ? A.term(k, w) : w; });
  }
  function toHtml(src, lang) {
    var out = '', last = 0, m;
    MATH.lastIndex = 0;
    while ((m = MATH.exec(src))) {
      out += terms(src.slice(last, m.index), lang, true);
      last = MATH.lastIndex;
      if (m[1] != null) { out += '<div class="th-eq">\\[' + A.esc(m[1].trim()) + '\\]</div>'; continue; }
      var p = /^[.,;:)]+/.exec(src.slice(last)); p = p ? p[0] : ''; last += p.length; // a full stop never starts a line of its own
      out += '<span class="th-m">\\(' + A.esc(m[2]) + '\\)' + p + '</span>';
    }
    return out + terms(src.slice(last), lang, true);
  }
  // plain text for the search index: display formulas dropped, inline TeX turned into readable symbols
  var SYM = { le: '≤', ge: '≥', cdot: '·', sum: 'Σ', in: '∈', tau: 'τ', rho: 'ρ', lambda: 'λ', sigma: 'σ', varepsilon: 'ε', delta: 'δ', alpha: 'α', dots: '…', lfloor: '⌊', rfloor: '⌋', max: 'max', min: 'min' };
  function texPlain(t) {
    return t.replace(/\\(?:text|mathit)\{([^}]*)\}/g, '$1').replace(/\\([a-zA-Z]+)/g, function (m, c) { return SYM[c] || ' '; })
      .replace(/\\./g, ' ').replace(/[{}^_]/g, '').replace(/\s+/g, ' ').trim();
  }
  function plain(src, lang) {
    var s = src.replace(MATH, function (m, d, i) { return d != null ? ' ' : texPlain(i); });
    return terms(s, lang, false).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,;:)])/g, '$1').trim();
  }

  // ---------- MathJax, loaded once and on demand ----------
  var mjState = 0, mjWait = []; // 0 not loaded (or failed: the next chapter tries again), 1 loading, 2 ready
  function mjFlush(err) { var l = mjWait; mjWait = []; l.forEach(function (w) { clearTimeout(w.t); if (err) w.rej(err); else w.res(window.MathJax); }); }
  function mathjax() {
    return new Promise(function (res, rej) {
      if (mjState === 2) { res(window.MathJax); return; }
      var w = { res: res, rej: rej };
      w.t = setTimeout(function () { var i = mjWait.indexOf(w); if (i >= 0) mjWait.splice(i, 1); rej(new Error('timeout')); }, MJ_TIMEOUT);
      mjWait.push(w);
      if (mjState === 1) return;
      mjState = 1;
      window.MathJax = { // read by MathJax when it starts: no typesetting of its own, no formulas in the tab order
        tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] },
        svg: { fontCache: 'local' },
        options: { menuOptions: { settings: { inTabOrder: false } } },
        startup: {
          typeset: false,
          ready: function () {
            var M = window.MathJax; M.startup.defaultReady();
            M.startup.promise.then(function () { mjState = 2; mjFlush(null); }, function (e) { mjState = 0; mjFlush(e || new Error('startup')); });
          }
        }
      };
      var sc = document.createElement('script');
      sc.src = A.CDN.mathjax; sc.async = true;
      sc.onerror = function () { if (sc.parentNode) sc.parentNode.removeChild(sc); mjState = 0; mjFlush(new Error('load')); };
      document.head.appendChild(sc);
    });
  }

  // ---------- one rendered chapter ----------
  function fit(live) { // a display formula wider than its box scrolls; then it can take the keyboard focus to scroll
    var eqs = live.box.querySelectorAll('.th-eq');
    for (var i = 0; i < eqs.length; i++) {
      var e = eqs[i], over = e.scrollWidth > e.clientWidth + 1;
      e.classList.toggle('th-over', over);
      if (over) { e.setAttribute('tabindex', '0'); e.setAttribute('role', 'group'); e.setAttribute('aria-label', live.T.eqScroll); end(e); }
      else { e.removeAttribute('tabindex'); e.removeAttribute('role'); e.removeAttribute('aria-label'); }
      if (!e.thScroll) { e.thScroll = true; e.addEventListener('scroll', function () { end(this); }, { passive: true }); } // goes with the element
    }
  }
  function end(e) { e.classList.toggle('th-end', e.scrollLeft + e.clientWidth >= e.scrollWidth - 2); }
  function fallback(live) {
    if (live.dead) return;
    live.box.classList.remove('th-wait'); live.box.classList.add('th-raw');
    live.box.insertBefore(A.el('p', { class: 'note warn th-mjnote', role: 'status', text: live.T.mjFail }), live.box.firstChild);
  }
  function typeset(live) {
    mathjax().then(function (MJ) {
      if (live.dead) return;
      var job = MJ.startup.promise.then(function () { if (!live.dead) return MJ.typesetPromise([live.box]); });
      MJ.startup.promise = job.catch(function () { /* the next chapter starts from a clean chain */ });
      job.then(function () {
        if (live.dead) return;
        live.box.classList.remove('th-wait');
        fit(live);
        if (window.ResizeObserver) { live.ro = new ResizeObserver(function () { if (!live.dead) fit(live); }); live.ro.observe(live.box); }
      }, function () { fallback(live); });
    }, function () { fallback(live); });
  }
  function start(id, box, lang) {
    var T = TX[lang], ch = T.chapters[id], live = { T: T, dead: false, chart: null, ro: null, box: A.el('div', { class: 'th-body th-wait' }) };
    live.box.innerHTML = ch.sections.map(function (s) { return '<section class="th-sec" id="' + s[0] + '"><h3>' + A.esc(s[1]) + '</h3>' + toHtml(s[2], lang) + '</section>'; }).join('');
    box.appendChild(live.box);
    var host = live.box.querySelector('.th-chart');
    if (host && LP.simplex && LP.hb.lpChart) live.chart = LP.hb.lpChart.mount(host, T.chart);
    typeset(live);
    return live;
  }
  function stop(live) {
    live.dead = true;
    if (live.chart) live.chart.destroy();
    if (live.ro) live.ro.disconnect();
    var MJ = window.MathJax;
    if (mjState === 2 && MJ && MJ.typesetClear) { try { MJ.typesetClear([live.box]); } catch (e) { /* nothing to forget */ } }
  }

  function chapter(id) {
    var de = TX.de.chapters[id], en = TX.en.chapters[id], live = null;
    return {
      id: id,
      title: { de: de.title, en: en.title },
      sections: de.sections.map(function (s, i) { var e = en.sections[i]; return { id: s[0], title: { de: s[1], en: e[1] }, text: { de: plain(s[2], 'de'), en: plain(e[2], 'en') } }; }),
      render: function (box, lang) {
        if (live) { stop(live); if (live.box.parentNode) live.box.parentNode.removeChild(live.box); } // rendered again without a teardown
        live = start(id, box, lang === 'en' ? 'en' : 'de');
      },
      teardown: function () { if (live) stop(live); live = null; }
    };
  }
  ORDER.forEach(function (id) { LP.hb.extra.push(chapter(id)); });
})();

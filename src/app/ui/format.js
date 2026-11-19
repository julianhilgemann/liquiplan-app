/* ===== ui/format.js: i18n and formatting (texts, numbers, dates, number fields, toasts) ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, C = LP.core, $ = A.$, el = A.el, esc = A.esc;

  A.lang = A.state.lang === 'en' ? 'en' : 'de';
  function t(key, vars) {
    var d = LP.i18n[A.lang], s = d[key] != null ? d[key] : (LP.i18n.de[key] != null ? LP.i18n.de[key] : key);
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  A.t = t;
  A.term = function (key, text) { var g = LP.i18n.gloss[key]; return '<span class="term" tabindex="0" data-term="' + key + '">' + esc(text || (g ? g[A.lang === 'de' ? 0 : 2] : key)) + '</span>'; };
  var NF0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }), NF2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  A.eur = function (v) { return NF0.format(Math.round(v)) + ' €'; };
  A.eur2 = function (v) { return NF2.format(v) + ' €'; };
  A.pct = function (v, d) { return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }).format(v) + ' %'; };
  A.n0 = function (v) { return NF0.format(v); };
  /* Numbers typed by hand. Number fields are plain text fields read by this parser, because <input type="number">
     follows the language of the browser: one set to English rejects "3,12", one set to German rejects "3.12", and
     the rejected text arrives here as an empty field. Both decimal signs are accepted everywhere.
     `eur` marks amounts: there a single sign followed by exactly three digits is a thousands separator ("10.000" and
     "10,000" are ten thousand); in rates it is the decimal sign ("3,125" is 3.125).
     Returns a number, null for an empty field, or NaN for text that is not a number. */
  A.parseNum = function (str, eur) {
    var s = String(str == null ? '' : str).replace(/[\s\u00a0\u202f'\u2019\u20ac%]/g, '').replace(/[\u2212\u2013]/g, '-');
    if (s === '') return null;
    var m = /^([+-]?)([\d.,]+)$/.exec(s);
    if (!m || !/\d/.test(m[2])) return NaN;
    var b = m[2], dots = b.split('.').length - 1, commas = b.split(',').length - 1, dec = '', other = '';
    if (dots && commas) { dec = b.lastIndexOf('.') > b.lastIndexOf(',') ? '.' : ','; other = dec === '.' ? ',' : '.'; }
    else if (dots + commas === 1) {
      var parts = b.split(/[.,]/);
      if (eur && parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && +parts[0] !== 0) other = dots ? '.' : ',';
      else dec = dots ? '.' : ',';
    } else if (dots + commas > 1) other = dots ? '.' : ',';
    var whole = dec ? b.slice(0, b.lastIndexOf(dec)) : b, frac = dec ? b.slice(b.lastIndexOf(dec) + 1) : '';
    if (dec && (frac.indexOf('.') >= 0 || frac.indexOf(',') >= 0 || whole.indexOf(dec) >= 0)) return NaN;
    if (other && whole.indexOf(other) >= 0) { // thousands groups must be groups: 1 to 3 digits, then threes
      var g = whole.split(other), i;
      if (!/^\d{1,3}$/.test(g[0])) return NaN;
      for (i = 1; i < g.length; i++) if (!/^\d{3}$/.test(g[i])) return NaN;
      whole = g.join('');
    }
    var v = +((whole || '0') + (frac ? '.' + frac : ''));
    return isFinite(v) ? (m[1] === '-' ? -v : v) : NaN;
  };
  // how a number is shown inside a field: the app's number format, so that the echo matches the tiles and tables
  var NFI = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6, useGrouping: false }), NFE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  A.numStr = function (v, eur) { return v == null || v === '' || !isFinite(+v) ? '' : (eur ? NFE : NFI).format(+v); };
  function loc() { return A.lang === 'de' ? 'de-DE' : 'en-GB'; }
  A.monthLabel = function (ym, long) { return new Intl.DateTimeFormat(loc(), { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(ym.y, ym.m - 1, 1))); };
  A.dateStr = function (d, wd) {
    var s = C.pad(d.d) + '.' + C.pad(d.m) + '.' + d.y;
    if (!wd) return s;
    return new Intl.DateTimeFormat(loc(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(d.y, d.m - 1, d.d))).replace('.', '') + ' ' + s;
  };
  A.css = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  /* A number field. o: { id, value, min, max, eur, ph, label, blank (show the value as empty), empty (value of an empty field) }.
     A valid entry is echoed back in the app's format, so the reader sees what was understood. Text that is not a
     number is flagged and never stored: the last valid value stays in force. */
  A.numField = function (o, set) {
    var inp = el('input', { type: 'text', id: o.id, inputmode: o.min != null && o.min >= 0 ? 'decimal' : null, autocomplete: 'off', spellcheck: 'false', placeholder: o.ph, 'aria-label': o.label, value: o.blank ? '' : A.numStr(o.value, o.eur) });
    inp.addEventListener('change', function () {
      var v = A.parseNum(inp.value, o.eur);
      if (v !== v) { inp.setAttribute('aria-invalid', 'true'); A.toast(t('n_bad', { v: inp.value.slice(0, 24) }), true); return; }
      inp.removeAttribute('aria-invalid');
      if (v == null) v = o.empty;
      else { if (o.min != null && v < o.min) v = +o.min; if (o.max != null && v > o.max) v = +o.max; inp.value = A.numStr(v, o.eur); }
      set(v);
    });
    return inp;
  };
  A.toast = function (msg, isErr) { var n = el('div', { class: 'toast' + (isErr ? ' err' : ''), text: msg }); $('toasts').appendChild(n); setTimeout(function () { n.remove(); }, isErr ? 9000 : 4000); };
})();

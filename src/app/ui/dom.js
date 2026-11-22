/* ===== ui/dom.js: the app namespace LP.app (A for short), CDN addresses, small DOM helper ===== */
(function () {
  'use strict';
  var LP = window.LP;
  var A = LP.app = {};

  A.CDN = {
    echarts: 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js',
    exceljs: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    highs: 'https://cdn.jsdelivr.net/npm/highs@1.15.4/build/highs.js',
    jslp: 'https://cdn.jsdelivr.net/npm/javascript-lp-solver@0.4.24/prod/solver.js',
    mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js' // formulas of the handbook's theory chapters, loaded when the first one is shown
  };
  var $ = A.$ = function (id) { return document.getElementById(id); };
  A.skeleton = $('app').innerHTML; // pristine markup, kept for "HTML herunterladen"

  function el(tag, props) {
    var n = document.createElement(tag), i, k;
    if (props) for (k in props) {
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else if (k === 'value') n.value = v; else if (k === 'checked') n.checked = !!v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); else n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return n;
  }
  A.el = el;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  A.esc = esc;
})();

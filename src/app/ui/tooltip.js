/* ===== ui/tooltip.js: glossary tooltip ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, $ = A.$, esc = A.esc;

  (function () {
    var tip = $('tip'), cur = null;
    function show(n) {
      var g = LP.i18n.gloss[n.getAttribute('data-term')]; if (!g) return;
      cur = n; tip.innerHTML = '<strong>' + esc(g[A.lang === 'de' ? 0 : 2]) + '</strong><br>' + esc(g[A.lang === 'de' ? 1 : 3]);
      tip.style.display = 'block';
      var r = n.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)), y = r.bottom + 6;
      if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    function hide() { cur = null; tip.style.display = 'none'; }
    document.addEventListener('mouseover', function (e) { var n = e.target.closest && e.target.closest('.term'); if (n) show(n); });
    document.addEventListener('mouseout', function (e) { if (e.target.closest && e.target.closest('.term')) hide(); });
    document.addEventListener('focusin', function (e) { var n = e.target.closest && e.target.closest('.term'); if (n) show(n); });
    document.addEventListener('focusout', function (e) { if (e.target.closest && e.target.closest('.term')) hide(); });
    document.addEventListener('click', function (e) { var n = e.target.closest && e.target.closest('.term'); if (n) { if (cur === n) hide(); else show(n); } else hide(); });
    window.addEventListener('scroll', hide, true);
  })();
})();

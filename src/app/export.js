/* ===== export.js: saving files, "HTML herunterladen" and the Excel download ===== */
(function () {
  'use strict';
  var LP = window.LP, A = LP.app, C = LP.core, $ = A.$, el = A.el, t = A.t;

  var TITLE = 'Liquiditätsplaner – Festgeld-Leiter mit Überlebenshorizont';

  // ---------- saving files: Claude's download capability when the page runs as an artifact, a normal download otherwise ----------
  var inArtifact = false, dlCap = Promise.resolve(null);
  try { if (window.claude && typeof window.claude.use === 'function') { inArtifact = true; dlCap = Promise.resolve(window.claude.use('downloads')).catch(function () { return null; }); } } catch (e) { /* not an artifact */ }
  A.saveFile = async function (name, data, mime) {
    if (inArtifact) {
      var cap = await dlCap; // the viewer's save dialog; null when this view cannot offer it
      if (cap) {
        try { await cap.save({ filename: name, data: data }); A.toast(t('savedOk', { f: name })); }
        catch (e) { if (!e || e.code !== 'declined') A.toast(t('saveFail', { e: (e && (e.message || e.code)) || '?' }), true); }
        return;
      }
    }
    try {
      var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob), a = el('a', { href: url, download: name, style: 'display:none' });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      A.toast(t('saved', { f: name }));
    } catch (e2) { A.toast(t('saveFail', { e: String(e2 && e2.message || e2) }), true); }
  };
  function stamp() { var d = new Date(); return d.getFullYear() + C.pad(d.getMonth() + 1) + C.pad(d.getDate()); }

  // ---------- "HTML herunterladen": the page itself with the current state embedded ----------
  A.buildHtml = function () {
    var payload = JSON.stringify({ docId: 'd' + Date.now().toString(36), savedAt: new Date().toISOString(), state: A.state }).replace(/</g, '\\u003c');
    var close = '</' + 'script>', parts = ['src-core', 'src-solver', 'src-app'].map(function (id) { return '<script id="' + id + '">' + $(id).textContent + close; });
    return '<!DOCTYPE html>\n<html lang="' + A.lang + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + TITLE + '</title>\n' +
      '<script id="src-theme">' + $('src-theme').textContent + close + '\n<style id="css">' + $('css').textContent + '</style>\n<script src="' + A.CDN.echarts + '" async onload="window.__echartsReady&&window.__echartsReady()">' + close + '\n</head>\n<body>\n<div id="app">' + A.skeleton + '</div>\n' +
      '<script id="embedded-state" type="application/json">' + payload + close + '\n' + parts.join('\n') + '\n</body>\n</html>\n';
  };

  // ---------- lazy libraries for the Excel export ----------
  var libs = {};
  function loadScript(url) {
    if (!libs[url]) libs[url] = new Promise(function (res, rej) { var s = el('script', { src: url }); s.onload = res; s.onerror = function () { delete libs[url]; rej(new Error(url.split('/').slice(-1)[0])); }; document.head.appendChild(s); });
    return libs[url];
  }
  A.xlsxLibs = async function () { await loadScript(A.CDN.exceljs); await loadScript(A.CDN.jszip); if (!window.ExcelJS || !window.JSZip) throw new Error('ExcelJS/JSZip'); };
  function xlsxCtx(v, state) {
    var names = {}; ['events'].concat(C.SCENARIOS).forEach(function (sc) { names[sc] = t('sc_' + sc); });
    return { P: v.P, sim: v.sim, res: v.res, base: v.base, scen: v.scen || {}, scenNames: names, state: state, lang: A.lang };
  }
  A.exportXlsx = async function () {
    if (!A.view) { A.toast(t('v_hint'), true); return; }
    A.toast(t('xl_building'));
    try { await A.xlsxLibs(); } catch (e) { A.toast(t('libFail', { l: e.message }), true); return; }
    try {
      var r = await LP.xlsx.build(xlsxCtx(A.view, A.state), window.ExcelJS, window.JSZip);
      await A.saveFile('Liquiditaetsplan_' + stamp() + '.xlsx', new Blob([r.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    } catch (e2) { A.toast(t('saveFail', { e: String(e2 && e2.message || e2) }), true); }
  };

  A.stamp = stamp; A.xlsxCtx = xlsxCtx;
})();

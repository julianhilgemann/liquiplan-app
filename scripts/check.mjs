#!/usr/bin/env node
// Checks the app before a pull request: builds it, then drives dist/index.html in a headless browser.
//
//   node scripts/check.mjs                     Chromium, everything
//   node scripts/check.mjs --browser=webkit    or firefox, or all (one after the other)
//   node scripts/check.mjs --quick             without the in-app self-test
//   node scripts/check.mjs --update-baseline   write the plans of this build to scripts/baseline.json
//   node scripts/check.mjs --strict-links      README links that miss their symbol fail the check (otherwise warnings)
//
// What it checks:
//   1. the build (node build.mjs) succeeds;
//   2. de.js and en.js have the same keys (in Node, no browser);
//   3. in the browser: the page loads from file:// without errors; every handbook chapter in both languages has no
//      unresolved markup ([[key]], {term}, raw TeX), no broken #handbuch link, no MathJax error, and the same section ids
//      in both languages; a few fixed searches find what they should;
//   4. every example (LP.presetIds) is optimised; its plan must pass the app's own verification, and its T* and placements
//      must equal scripts/baseline.json (skipped with a note when HiGHS did not load: the fallback solver may differ).
//      Two examples are optimised a second time with a limit on the number of new deposits (LIMITS): the plan must keep
//      it, must not reach a later month than the plan without the limit, and must equal its own baseline entry;
//   5. the search without a time limit: one run that ends by itself with the plan of the usual budgets, and one that is
//      ended by hand and must keep a verified plan;
//   6. the in-app self-test passes every line;
//   7. no sideways overflow at 360, 768 and 1440 px in the analysis, the wizard, the step-by-step view and the handbook,
//      and no gap between the handbook's pinned title and search while a chapter scrolls;
//   8. README links into the code such as [`name()`](src/app/x.js#L42) point at a line that contains the name.
//
// Needs Playwright with its browsers, installed globally (npm i -g playwright; npx playwright install). The page loads its
// libraries (ECharts, HiGHS, MathJax, ExcelJS) from jsDelivr, so the check needs the network.

import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'index.html');
const BASELINE = join(ROOT, 'scripts', 'baseline.json');
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, dflt) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.split('=')[1] : dflt; };
const BROWSERS = opt('browser', 'chromium') === 'all' ? ['chromium', 'firefox', 'webkit'] : [opt('browser', 'chromium')];
const WIDTHS = [360, 768, 1440];
const LIMITS = { g: 4, ruhestand: 6 }; // examples that are also optimised with a limit on the number of new deposits

// ---------- reporting ----------
const failures = [], warnings = [], notes = [];
let passed = 0;
function section(title) { console.log('\n' + title); }
function check(ok, what, detail) {
  if (ok) { passed++; console.log('  ok    ' + what); } else { failures.push(what + (detail ? ': ' + detail : '')); console.log('  FAIL  ' + what + (detail ? ': ' + detail : '')); }
  return ok;
}
function note(text) { notes.push(text); console.log('  note  ' + text); }

// ---------- 1. build ----------
section('Build');
const build = spawnSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, encoding: 'utf8' });
if (!check(build.status === 0, 'node build.mjs', (build.stderr || build.stdout).trim())) finish();
console.log('        ' + build.stdout.trim());

// ---------- 2. translations ----------
section('Translations');
{
  const sandbox = {}; sandbox.self = sandbox; vm.createContext(sandbox);
  for (const f of ['de', 'en']) vm.runInContext(readFileSync(join(ROOT, 'src/app/i18n', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
  const { de, en } = sandbox.LP.i18n, dk = Object.keys(de), ek = Object.keys(en);
  const onlyDe = dk.filter((k) => !(k in en)), onlyEn = ek.filter((k) => !(k in de));
  check(!onlyDe.length && !onlyEn.length, `de.js and en.js have the same ${dk.length} keys`, [onlyDe.length && 'only in de: ' + onlyDe.join(', '), onlyEn.length && 'only in en: ' + onlyEn.join(', ')].filter(Boolean).join('; '));
}

// ---------- 3.–7. in the browser ----------
const pw = loadPlaywright();
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const fresh = { note: 'T* and a digest (FNV-1a of JSON.stringify(res.placements)) per example under its default rate scenario, solved with HiGHS; "+maxN" is the same example with at most N new deposits. Rewrite with: node scripts/check.mjs --update-baseline', presets: {} };
for (const name of BROWSERS) await inBrowser(name);
if (flag('update-baseline')) {
  if (Object.keys(fresh.presets).length) { writeFileSync(BASELINE, JSON.stringify(fresh, null, 2) + '\n'); note('wrote ' + BASELINE.slice(ROOT.length + 1)); }
  else check(false, 'update the baseline', 'no plan solved with HiGHS, nothing written');
}

// ---------- 8. README links ----------
section('README links into the code' + (flag('strict-links') ? '' : ' (warnings only; --strict-links makes them fail)'));
readmeLinks();
finish();

// ==================================================================================================================

function loadPlaywright() {
  let root = '';
  try { root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* npm missing */ }
  try { return createRequire(import.meta.url)(join(root, 'playwright')); } catch {
    console.error('\nPlaywright was not found in the global node_modules (' + (root || 'npm root -g failed') + ').\n' +
      'Install it once with:  npm install -g playwright && npx playwright install chromium firefox webkit');
    process.exit(2);
  }
}

async function inBrowser(name) {
  const tag = (s) => `${s} [${name}]`;
  let browser;
  try { browser = await pw[name].launch(); } catch (e) { section(tag('Browser')); check(false, 'launch ' + name, e.message.split('\n')[0]); return; }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  const url = pathToFileURL(DIST).href;
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const typeset = () => page.waitForFunction(() => { const b = document.querySelector('#hbBody .th-body'); return !b || !b.classList.contains('th-wait'); }, null, { timeout: 30000 }).catch(() => {});
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const widths = async (what, prepare) => {
    const over = [];
    for (const w of WIDTHS) { await page.setViewportSize({ width: w, height: 900 }); await settle(250); if (prepare) await prepare(w); const o = await overflow(); if (o > 0) over.push(`${w}px: ${o}px too wide`); }
    await page.setViewportSize({ width: 1280, height: 900 }); await settle(200);
    check(!over.length, tag(`no sideways overflow in ${what} at ${WIDTHS.join(', ')} px`), over.join(', '));
  };

  try {
    section(tag('Page'));
    await page.goto(url); await settle(600);
    check(await page.evaluate(() => !!(window.LP && LP.app && LP.app.handbook)), tag('dist/index.html starts from file://'));

    // ----- handbook: every chapter, both languages -----
    section(tag('Handbook'));
    await page.evaluate(() => { location.hash = '#handbuch'; }); await settle(300);
    const ids = {};
    for (const lang of ['de', 'en']) {
      await page.evaluate((l) => document.getElementById(l === 'de' ? 'langDe' : 'langEn').click(), lang); await settle(200);
      const chapters = await page.evaluate(() => LP.app.handbook.chapters().map((c) => ({ id: c.id, kind: c.kind, sections: c.sections.map((s) => s.id) })));
      const known = new Map(chapters.map((c) => [c.id, new Set(c.sections)]));
      const problems = [];
      ids[lang] = chapters.map((c) => c.id + ': ' + c.sections.slice().sort().join(' ')).join('\n'); // sorted: the glossary is alphabetical per language
      for (const c of chapters) {
        await page.evaluate((id) => { location.hash = '#handbuch/' + id; }, c.id); await settle(60);
        if (c.kind === 'extra') await typeset();
        const r = await page.evaluate(() => {
          const body = document.getElementById('hbBody'), copy = body.cloneNode(true);
          copy.querySelectorAll('mjx-container, .th-eq, .th-m, code, kbd, .th-fig').forEach((n) => n.remove());
          const raw = copy.textContent.match(/\[\[[^\]]*\]\]|\{\w+(\|[^{}]*)?\}|\$[^$\s][^$]*\$|\\\(|\\\[/g) || [];
          const links = Array.from(document.querySelectorAll('#handbook a[href^="#handbuch"]')).map((a) => a.getAttribute('href'));
          const terms = Array.from(body.querySelectorAll('.term')).filter((n) => !LP.i18n.gloss[n.getAttribute('data-term')]).map((n) => n.getAttribute('data-term'));
          return { raw: raw.slice(0, 3), links, terms, mjErr: body.querySelectorAll('mjx-merror, [data-mjx-error]').length, mjFail: !!body.querySelector('.th-raw'), title: document.getElementById('hbChTitle').textContent };
        });
        if (r.raw.length) problems.push(`${c.id}: unresolved markup ${r.raw.join(' ')}`);
        if (r.terms.length) problems.push(`${c.id}: glossary terms without an entry ${r.terms.join(' ')}`);
        if (r.mjErr) problems.push(`${c.id}: ${r.mjErr} MathJax error(s)`);
        if (r.mjFail) problems.push(`${c.id}: MathJax did not load (no network?), the TeX stayed`);
        for (const href of new Set(r.links)) {
          const m = /^#handbuch(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?\/?$/.exec(href);
          const a = m && m[1], b = m && m[2], inChapter = (id) => [...known.values()].some((s) => s.has(id));
          const fine = m && (!a || (known.has(a) ? (!b || known.get(a).has(b)) : (!b && inChapter(a))));
          if (!fine) problems.push(`${c.id}: broken link ${href}`);
        }
      }
      check(!problems.length, tag(`${chapters.length} chapters in ${lang === 'de' ? 'German' : 'English'}: markup, links, terms, formulas`), problems.join('; '));
    }
    check(ids.de === ids.en, tag('the same chapter and section ids in both languages'), diffLines(ids.de, ids.en));

    // ----- searches -----
    const SEARCHES = [['de', 'Download', 'howto/howto-ladder'], ['de', 'Simplex', 'th-lp/'], ['de', 'ueberlebenshorizont', 'glossary/gl-tstar'], ['de', 'Sockel', 'glossary/gl-sockel'], ['de', 'xqzvw', null],
      ['en', 'spreadsheet', 'howto/howto-ladder'], ['en', 'buffer', 'glossary/gl-sockel'], ['en', 'Simplex', 'th-lp/'], ['en', 'zzqqx', null]];
    const missed = [];
    for (const [lang, q, want] of SEARCHES) {
      await page.evaluate((l) => document.getElementById(l === 'de' ? 'langDe' : 'langEn').click(), lang); await settle(60);
      await page.fill('#hbQ', q); await settle(120);
      const r = await page.evaluate(() => { const h = LP.app.handbook.search(document.getElementById('hbQ').value.trim()); return { top: h[0] ? h[0].e.c.id + '/' + (h[0].e.s ? h[0].e.s.id : '') : null, empty: !document.getElementById('hbNone').classList.contains('hide') }; });
      if (want ? !(r.top && r.top.startsWith(want)) : !(r.top === null && r.empty)) missed.push(`${lang} "${q}" gave ${r.top || 'nothing'}, expected ${want || 'the empty state'}`);
    }
    await page.fill('#hbQ', ''); await page.evaluate(() => document.getElementById('langDe').click()); await settle(100);
    check(!missed.length, tag(`${SEARCHES.length} fixed searches`), missed.join('; '));
    await widths('the handbook (a theory chapter with its chart)', async () => { await page.evaluate(() => { location.hash = '#handbuch/th-lp'; }); await typeset(); });
    // the pinned blocks must meet or overlap: a gap of a fraction of a pixel lets the scrolling chapter show through
    const slits = [];
    for (const w of [768, 1440]) {
      await page.setViewportSize({ width: w, height: 900 }); await settle(250);
      await page.evaluate(() => { location.hash = '#handbuch/th-lp'; }); await typeset(); await page.evaluate(() => window.scrollTo(0, 700)); await settle(150);
      const g = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect(), top = r('.top'), head = r('.hb-head'), bar = r('.hb-bar');
        return { bar: bar.top - head.bottom, head: getComputedStyle(document.querySelector('.top')).position === 'sticky' ? head.top - top.bottom : 0 };
      });
      if (g.bar > 0.01) slits.push(`${w}px: ${g.bar.toFixed(2)}px between the title and the search`);
      if (g.head > 0.01) slits.push(`${w}px: ${g.head.toFixed(2)}px between the toolbar and the title`);
    }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.setViewportSize({ width: 1280, height: 900 }); await settle(200);
    check(!slits.length, tag('no gap between the pinned blocks of the handbook while a chapter scrolls'), slits.join(', '));
    await page.click('#btnHandbook'); await settle(300); // "Analyse": back to the analysis

    // ----- the examples: optimise, verify, compare with the baseline -----
    section(tag('Plans'));
    const presets = await page.evaluate(() => LP.presetIds.slice());
    await page.click('#emptyExample'); await settle(300);
    // optimises what is loaded and checks the plan; `limit`: the highest number of new deposits it may hold
    const plan = async (id, key, limit) => {
      await page.click('#btnOptimize');
      const done = await page.waitForFunction(() => LP.app.view && !LP.app.busy && !LP.app.stale, null, { timeout: 300000 }).then(() => true, () => false);
      if (!check(done, tag(`${key}: optimised`), 'no result within 5 minutes')) return;
      const r = await page.evaluate(() => {
        const v = LP.app.view, s = JSON.stringify(v.res.placements); let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return { scenario: LP.app.state.rateScenario, solver: v.res.solver, Tstar: v.sim.Tstar, T: v.res.T, placements: v.res.placements.length, digest: h.toString(16).padStart(8, '0'), verified: LP.sim.verify(v.P, v.res).ok, free: v.res.free || null };
      });
      check(r.verified, tag(`${key} (${r.scenario}): the plan passes the verification, T* ${r.Tstar}, ${r.placements} placements, ${r.solver}`));
      if (limit != null) check(r.placements <= limit && (!r.free || r.Tstar <= r.free.T), tag(`${key}: at most ${limit} new deposits, and no later month than the plan without the limit` + (r.free ? ` (${r.free.n} deposits, T* ${r.free.T})` : '')), `${r.placements} deposits, T* ${r.Tstar}`);
      if (r.solver !== 'HiGHS') { note(tag(`${key}: solved by ${r.solver}, not HiGHS; baseline comparison skipped`)); return; }
      fresh.presets[key] = { rateScenario: r.scenario, Tstar: r.Tstar, T: r.T, placements: r.placements, digest: r.digest };
      if (flag('update-baseline')) return;
      const b = baseline && baseline.presets[key];
      if (!b) { check(false, tag(`${key}: baseline`), 'no entry in scripts/baseline.json (run with --update-baseline)'); return; }
      check(b.rateScenario === r.scenario && b.Tstar === r.Tstar && b.digest === r.digest, tag(`${key}: same plan as the baseline`),
        `baseline T* ${b.Tstar} digest ${b.digest} (${b.rateScenario}), now T* ${r.Tstar} digest ${r.digest} (${r.scenario})`);
    };
    for (const id of presets) {
      await page.selectOption('#selPreset', id); await settle(200);
      await plan(id, id, null);
      if (!LIMITS[id]) continue; // the same example with a limit on the number of new deposits
      await page.evaluate((n) => LP.app.touch((st) => { st.trancheCap = { on: true, max: n }; }, true), LIMITS[id]); await settle(200);
      await plan(id, `${id}+max${LIMITS[id]}`, LIMITS[id]);
    }

    // ----- the search without a time limit: one that ends by itself, one that is ended by hand -----
    section(tag('Search without a time limit'));
    const result = () => page.waitForFunction(() => LP.app.view && !LP.app.busy && !LP.app.stale, null, { timeout: 300000 }).then(() => true, () => false);
    const state = () => page.evaluate(() => {
      const v = LP.app.view, s = JSON.stringify(v.res.placements); let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      return { solver: v.res.solver, Tstar: v.sim.Tstar, digest: h.toString(16).padStart(8, '0'), verified: LP.sim.verify(v.P, v.res).ok, ended: (v.res.stages || {}).unlimited || null, steps: v.res.trace ? v.res.trace.steps.length : 0 };
    });
    await page.selectOption('#selPreset', 'g'); await settle(200);
    await page.evaluate((n) => LP.app.touch((st) => { st.trancheCap = { on: true, max: n }; st.unlimited = true; }, true), LIMITS.g); await settle(200);
    await page.click('#btnOptimize');
    if (check(await result(), tag(`g+max${LIMITS.g}, without a time limit: ended by itself`), 'no result within 5 minutes')) {
      const r = await state(), b = baseline && baseline.presets[`g+max${LIMITS.g}`];
      check(r.verified && r.ended === 'complete' && (r.solver !== 'HiGHS' || flag('update-baseline') || !b || b.digest === r.digest), tag('the search was completed and the plan is the one of the usual budgets (it was proven best there already)'), `ended: ${r.ended}, digest ${r.digest}`);
    }
    await page.evaluate(() => LP.app.touch((st) => { st.trancheCap.on = false; }, true)); await settle(200);
    await page.click('#btnOptimize');
    const keep = await page.waitForFunction(() => !document.getElementById('runKeep').classList.contains('hide'), null, { timeout: 180000 }).then(() => true, () => false);
    if (check(keep, tag('g, without a time limit: the plan of the usual budgets is offered while the search goes on'), 'the button to keep the plan did not appear')) {
      await settle(2500); await page.click('#runKeep');
      if (check(await result(), tag('g: ended by hand'), 'no result within 5 minutes')) {
        const r = await state(), b = baseline && baseline.presets.g;
        check(r.verified && r.ended === 'stopped' && r.steps > 0 && (!b || r.Tstar >= b.Tstar), tag(`the best plan was kept: verified, T* ${r.Tstar}, with its step-by-step record`), `ended: ${r.ended}, verified ${r.verified}, T* ${r.Tstar}`);
      }
    }

    // ----- layout of the analysis, the wizard and the step-by-step view (with a result on screen) -----
    section(tag('Layout'));
    await widths('the analysis');
    await page.click('#btnWizard'); await settle(300);
    await widths('the wizard');
    await page.click('#btnWizard'); await settle(400);
    await page.click('#btnReplay'); await settle(500);
    await widths('the step-by-step view');
    await page.keyboard.press('Escape'); await settle(300);

    // ----- the in-app self-test -----
    if (flag('quick')) note(tag('self-test skipped (--quick)'));
    else {
      section(tag('Self-test'));
      await page.evaluate(() => document.getElementById('btnSelftest').click());
      const done = await page.waitForFunction(() => { const b = document.getElementById('tests'), l = b.lastElementChild; return l && /^\d+\/\d+$/.test((l.querySelector('.pill') || {}).textContent || ''); }, null, { timeout: 400000 }).then(() => true, () => false);
      const r = await page.evaluate(() => { const rows = Array.from(document.getElementById('tests').children); const sum = rows.pop(); return { sum: sum ? sum.textContent : '', bad: rows.filter((n) => !n.querySelector('.pill.ok')).map((n) => n.textContent) }; });
      check(done && !r.bad.length, tag('in-app self-test: ' + (/(\d+\/\d+)/.exec(r.sum) || ['', 'did not finish'])[1]), r.bad.join('; '));
    }
    check(!errors.length, tag('no page errors'), errors.slice(0, 5).join(' | '));
  } catch (e) {
    check(false, tag('the browser run'), e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
}

function readmeLinks() {
  const file = join(ROOT, 'README.md');
  if (!existsSync(file)) { note('README.md not found'); return; }
  const lines = readFileSync(file, 'utf8').split('\n'), cache = {};
  const LINK = /\[([^\]]*)\]\(((?:src|scripts)\/[^)#\s]+)(?:#L(\d+)(?:-L?\d+)?)?\)/g;
  let total = 0;
  lines.forEach((text, i) => {
    for (const m of text.matchAll(LINK)) {
      total++;
      const [whole, label, path, lineNo] = m, where = `README.md:${i + 1}`;
      const abs = join(ROOT, path);
      if (!existsSync(abs)) { warnings.push(`${where}: ${whole}: ${path} does not exist`); continue; }
      if (statSync(abs).isDirectory()) continue;
      const src = cache[path] || (cache[path] = readFileSync(abs, 'utf8').split('\n'));
      const code = /`([^`]+)`/.exec(label);
      if (!lineNo || !code) continue; // only links that name a symbol and a line are checked against each other
      // The name: `A.render(x)` is found as "A.render" or "render", as a whole word and ignoring case. A tag such as
      // `<script id="embedded-state">` is found by its id="…" in an HTML file; a tag linked to line 1, or to a file that is
      // not HTML, points at the first file of its block and names no symbol.
      const tag = /^<\w+\b[^>]*\bid="([^"]+)"/.exec(code[1]);
      if (tag && (lineNo === '1' || !path.endsWith('.html'))) continue;
      const full = tag ? `id="${tag[1]}"` : code[1].replace(/\(.*$/, '').trim(), last = tag ? full : full.split('.').filter(Boolean).pop() || full;
      const matches = (l, needle) => /^[\w$]+$/.test(needle) ? new RegExp('(^|[^\\w$])' + needle.replace(/\$/g, '\\$') + '([^\\w$]|$)', 'i').test(l) : l.toLowerCase().includes(needle.toLowerCase());
      const has = (l) => l != null && (matches(l, full) || matches(l, last));
      if (has(src[+lineNo - 1])) continue;
      const found = src.findIndex(has);
      warnings.push(`${where}: ${whole}: line ${lineNo} of ${path} does not contain "${last}"` + (found >= 0 ? ` (first found at line ${found + 1})` : ' (not found in the file)'));
    }
  });
  if (!warnings.length) console.log(`  ok    ${total} links checked`);
  else {
    console.log(`  ${warnings.length} of ${total} links miss their symbol:`);
    warnings.forEach((w) => console.log('  warn  ' + w));
    if (flag('strict-links')) failures.push(`${warnings.length} README links miss their symbol`);
  }
}

function diffLines(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  return x.map((l, i) => (l !== y[i] ? `de "${l}" / en "${y[i]}"` : null)).filter(Boolean).slice(0, 3).join('; ');
}

function finish() {
  console.log('\nSummary');
  console.log(`  ${passed} passed, ${failures.length} failed` + (warnings.length ? `, ${warnings.length} README link warnings` : '') + (notes.length ? `, ${notes.length} notes` : ''));
  failures.forEach((f) => console.log('  FAIL  ' + f));
  notes.forEach((n) => console.log('  note  ' + n));
  process.exit(failures.length ? 1 : 0);
}

#!/usr/bin/env node
// Writes the app's changelog to the two places where GitHub shows it. The single source stays
// src/app/i18n/changelog.js, the list the app itself shows under "What's new".
//
//   node scripts/changelog.mjs           write CHANGELOG.md and the marked lines of README.md
//   node scripts/changelog.mjs --check   write nothing; exit 1 if either file differs from what would be written
//
//   CHANGELOG.md   every release, newest first.
//   README.md      the text between two pairs of marker comments, each on a line of its own:
//                  "changelog:version" – the current version and its date, under the link to the app;
//                  "changelog:latest"  – the section "What's new": the newest release, the SHOWN - 1 before it folded
//                                        away, and a link to CHANGELOG.md.
//
// Both are in English, like the README. The labels New / Improved / Fixed are the app's own (en.js). Run it after every
// edit of changelog.js; scripts/check.mjs runs it with --check, so a pull request cannot leave the two files behind.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'src/app/i18n/changelog.js';
const SHOWN = 3; // releases in the README: the newest in full, the others folded away
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- read the app's list and its labels ----------
const sandbox = {}; sandbox.self = sandbox; vm.createContext(sandbox);
for (const f of ['de.js', 'en.js', 'changelog.js']) vm.runInContext(readFileSync(join(ROOT, 'src/app/i18n', f), 'utf8'), sandbox, { filename: f });
const log = sandbox.LP.changelog, en = sandbox.LP.i18n.en;
if (!Array.isArray(log) || !log.length) fail(SOURCE + ' holds no release');

// ---------- Markdown ----------
const md = (s) => String(s).replace(/[\\`*_[\]<>]/g, '\\$&'); // plain text: nothing in it may turn into markup
const day = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) fail(`${SOURCE}: "${iso}" is not a date YYYY-MM-DD`); return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`; };
const label = (kind) => en['hb_k_' + kind] || fail(`${SOURCE}: unknown kind "${kind}" (en.js has no hb_k_${kind})`);
const release = (r, level) => [
  `${'#'.repeat(level)} ${md(r.version)} · ${md(r.title.en)}`, '',
  `*${day(r.date)}*`, '',
  ...r.items.map((it) => `- **${md(label(it.kind))}:** ${md(it.en)}`)
].join('\n');
const list = (words) => words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words.at(-1);

const NOTE = `written by \`node scripts/changelog.mjs\` from ${SOURCE}: edit that file, not these lines`;
const first = log.at(-1), newest = log[0], folded = log.slice(1, SHOWN);

const changelog = [
  '# Changelog', '',
  `<!-- This file is ${NOTE}. -->`, '',
  'What changed in Liquiplan for the people who use it, newest release first. The app shows the same list, in German and in English, in its handbook under *What\'s new*.', '',
  'Version numbers are MAJOR.MINOR, with a third number for a release that only fixes things. MINOR goes up with every release that adds or changes something users see, MAJOR only when saved inputs or exported JSON stop working with the new version.', '',
  log.map((r) => release(r, 2)).join('\n\n'), ''
].join('\n');

const version = `**Version ${md(newest.version)}** · ${day(newest.date)} · [What's new](#whats-new)`;
const latest = [
  release(newest, 3), '',
  ...(folded.length ? [
    '<details>',
    `<summary>Before that: ${list(folded.map((r) => md(r.version)))}</summary>`, '',
    folded.map((r) => release(r, 3)).join('\n\n'), '',
    '</details>', ''
  ] : []),
  `All ${log.length} releases since ${md(first.version)} (${day(first.date)}): [CHANGELOG.md](CHANGELOG.md).`
].join('\n');

// ---------- write, or compare ----------
const readmeFile = join(ROOT, 'README.md'), changelogFile = join(ROOT, 'CHANGELOG.md');
let readme = readFileSync(readmeFile, 'utf8');
readme = region(readme, 'version', version);
readme = region(readme, 'latest', latest);
const files = [[changelogFile, 'CHANGELOG.md', changelog], [readmeFile, 'README.md', readme]];
const stale = files.filter(([file, , text]) => !existsSync(file) || readFileSync(file, 'utf8') !== text).map(([, name]) => name);

if (process.argv.includes('--check')) {
  if (stale.length) fail(`${list(stale)} ${stale.length > 1 ? 'differ' : 'differs'} from ${SOURCE}; run: node scripts/changelog.mjs`);
  console.log(`CHANGELOG.md and README.md match ${SOURCE} (${log.length} releases, newest ${newest.version})`);
} else {
  for (const [file, name, text] of files) if (stale.includes(name)) writeFileSync(file, text);
  console.log(stale.length ? `wrote ${list(stale)} (${log.length} releases, newest ${newest.version})` : `nothing to write: CHANGELOG.md and README.md match ${SOURCE}`);
}

// Replaces what stands between the marker lines <!-- changelog:NAME … --> and <!-- /changelog:NAME -->.
function region(text, name, body) {
  const open = '<!-- changelog:' + name, close = '<!-- /changelog:' + name + ' -->';
  const a = text.indexOf(open), b = text.indexOf(close);
  if (a < 0 || b < a || text.indexOf(open, a + 1) >= 0) fail(`README.md: expected one pair of marker lines ${open} --> … ${close}`);
  return text.slice(0, a) + `${open} (${NOTE}) -->\n${body}\n` + text.slice(b);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

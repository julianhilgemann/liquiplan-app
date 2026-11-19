#!/usr/bin/env node
// Assembles the sources in src/ into the single-file app dist/index.html.
//
//   node build.mjs           build once
//   node build.mjs --watch   build, then rebuild whenever a file in src/ changes
//
// No dependencies. The app has to stay one HTML file with inline <style> and <script>
// blocks: the solver worker is started from the text of two of those blocks, and
// "HTML herunterladen" saves the page by writing the blocks back out.
//
// src/index.html is the template. Two kinds of line are special in .html sources:
//
//   <!-- @include path -->   replaced by that file's text (path relative to the including
//                            file, final newline dropped). If the directive starts its line,
//                            its indentation is added to every line of the included text.
//   <!--# note -->           a note for readers of the source; the whole line is dropped.

import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist', 'index.html');

const NOTE = /^[ \t]*<!--# .*-->\n/gm;
const INCLUDE = /(^[ \t]*)?<!-- @include (\S+) -->/gm;

// Text that would end an inline block early, or switch the HTML parser into another mode.
const FORBIDDEN = [
  [/\.js$/, /<\/script|<!--/i, 'write it as two joined strings, e.g. \'</\' + \'script>\''],
  [/\.css$/, /<\/style/i, 'it would close the <style> block']
];

const rel = (file) => relative(ROOT, file);

function read(file, from) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new Error(`${rel(file)} not found` + (from ? ` (included from ${rel(from)})` : ''));
  }
}

function expand(file, chain, used) {
  if (chain.includes(file)) throw new Error('circular include: ' + [...chain, file].map(rel).join(' -> '));
  let text = read(file, chain.at(-1));
  used.add(file);
  for (const [type, pattern, hint] of FORBIDDEN) {
    const hit = type.test(file) && pattern.exec(text);
    if (hit) throw new Error(`${rel(file)} contains "${hit[0]}": ${hint}`);
  }
  if (!file.endsWith('.html')) return text; // only templates carry directives; scripts and styles go in verbatim
  text = text.replace(NOTE, '');
  return text.replace(INCLUDE, (_, indent, path) => {
    const part = expand(join(dirname(file), path), [...chain, file], used).replace(/\n$/, '');
    return indent === undefined ? part : part.replace(/^(?=.)/gm, indent);
  });
}

function build() {
  const used = new Set();
  const html = expand(join(SRC, 'index.html'), [], used);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html);
  console.log(`${rel(OUT)}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB from ${used.size} source files`);
}

function tryBuild() {
  try {
    build();
    return true;
  } catch (e) {
    console.error('build failed: ' + e.message);
    return false;
  }
}

if (process.argv.includes('--watch')) {
  tryBuild();
  let timer = null;
  watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(tryBuild, 80);
  });
  console.log('watching src/ … (Ctrl+C to stop)');
} else if (!tryBuild()) {
  process.exit(1);
}

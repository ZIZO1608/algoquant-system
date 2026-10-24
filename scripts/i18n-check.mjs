#!/usr/bin/env node
/**
 * Translation coverage check for the Arabic-source i18n setup (src/i18n).
 *
 * Arabic text in the source is the translation key; English lives in src/i18n/en/*.js.
 * For every .js/.jsx file under src (except src/i18n) this reports:
 *   ERROR  jsx-text    Arabic JSX text that is not wrapped in {t('…')}
 *   ERROR  attribute   Arabic JSX attribute string (placeholder="…") not wrapped in {t('…')}
 *   ERROR  template    Arabic template literal with ${…} (use t('… {name}', { name }))
 *   ERROR  missing     Arabic string with no English entry
 *   ERROR  vars        English entry whose {placeholders} differ from the Arabic key
 *   WARN   indirect    Arabic string not passed straight to t() (constants, maps) — shown with --indirect
 *
 * Usage:
 *   node scripts/i18n-check.mjs                    all files
 *   node scripts/i18n-check.mjs src/pages/Tasks.jsx  only these files
 *   --indirect   also list indirect strings
 *   --unused     list English keys that no source file uses (full scan only)
 *   --freq       print Arabic strings that appear in 3+ files
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSync } from 'rolldown/utils';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const I18N_DIR = path.join(SRC, 'i18n');
const HAS_ARABIC = /[؀-ۿ]/;
/** Calls whose first argument is a translation key. */
const T_CALLEES = new Set(['t', 'tr', 'td', 'translate', 'translateData']);
/** Calls that only pick between Arabic keys, e.g. t(pluralAr(n, 'a', 'b', 'c'), { n }). */
const TRANSPARENT_CALLEES = new Set(['pluralAr']);

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const only = argv.filter((a) => !a.startsWith('--')).map((f) => path.resolve(ROOT, f));

function walkDir(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== I18N_DIR) out.push(...walkDir(full));
    } else if (/\.(jsx?|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function loadDictionary() {
  try {
    const mod = await import(pathToFileURL(path.join(I18N_DIR, 'en', 'index.js')).href);
    return {
      en: mod.default || {},
      dictionaries: mod.DICTIONARIES || {},
      serverKeys: new Set(Object.keys(mod.SERVER_MESSAGES || {})),
    };
  } catch (err) {
    console.warn(`! English dictionary not loaded (${err.message})`);
    return { en: {}, dictionaries: {}, serverKeys: new Set() };
  }
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function placeholders(str) {
  return [...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
}

function calleeName(call) {
  const c = call.callee;
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property?.type === 'Identifier') return c.property.name;
  return null;
}

/** True when the node reaches a t()-like call's first argument through ternaries / || / pluralAr(). */
function isDirectKey(node, parents) {
  let child = node;
  let parent = parents.get(child);
  while (parent) {
    if (parent.type === 'ConditionalExpression' && (parent.consequent === child || parent.alternate === child)) {
      child = parent;
    } else if (parent.type === 'LogicalExpression' || parent.type === 'ParenthesizedExpression') {
      child = parent;
    } else if (parent.type === 'CallExpression' && TRANSPARENT_CALLEES.has(calleeName(parent)) && parent.arguments.includes(child)) {
      child = parent;
    } else if (parent.type === 'CallExpression' && T_CALLEES.has(calleeName(parent))) {
      return parent.arguments[0] === child;
    } else {
      return false;
    }
    parent = parents.get(child);
  }
  return false;
}

/** A file whose Arabic is data rather than UI text (number words, sample records) opts out near its top. */
const SKIP_FILE = /i18n-check:\s*skip-file/;

function scanFile(file, en, report, freq) {
  const source = fs.readFileSync(file, 'utf8');
  if (SKIP_FILE.test(source.slice(0, 600))) return new Set();
  const rel = path.relative(ROOT, file).replaceAll('\\', '/');
  const result = parseSync(file, source, { lang: 'jsx' });
  if (result.errors?.length) {
    report.push({ level: 'ERROR', kind: 'parse', file: rel, line: 0, text: result.errors[0].message });
    return;
  }
  const starts = lineStarts(source);
  const parents = new WeakMap();
  const seenInFile = new Set();

  const addString = (value, node, parent) => {
    const line = lineOf(starts, node.start);
    const inAttr = parent?.type === 'JSXAttribute';
    if (freq) {
      if (!freq.has(value)) freq.set(value, new Set());
      freq.get(value).add(rel);
    }
    seenInFile.add(value);
    if (inAttr) {
      report.push({ level: 'ERROR', kind: 'attribute', file: rel, line, text: value });
    } else if (!isDirectKey(node, parents)) {
      report.push({ level: 'WARN', kind: 'indirect', file: rel, line, text: value });
    }
    if (!Object.hasOwn(en, value)) {
      report.push({ level: 'ERROR', kind: 'missing', file: rel, line, text: value });
    } else if (typeof en[value] === 'string' && placeholders(value) !== placeholders(en[value])) {
      report.push({ level: 'ERROR', kind: 'vars', file: rel, line, text: `${value}  →  ${en[value]}` });
    }
  };

  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    if (parent) parents.set(node, parent);

    if (node.type === 'Literal' || node.type === 'StringLiteral') {
      if (typeof node.value === 'string' && HAS_ARABIC.test(node.value)) addString(node.value, node, parent);
    } else if (node.type === 'TemplateLiteral') {
      const text = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('${…}');
      if (HAS_ARABIC.test(text)) {
        if (node.expressions.length) {
          report.push({ level: 'ERROR', kind: 'template', file: rel, line: lineOf(starts, node.start), text });
        } else {
          addString(node.quasis[0].value.cooked ?? node.quasis[0].value.raw, node, parent);
        }
      }
    } else if (node.type === 'JSXText') {
      const text = node.value.replace(/\s+/g, ' ').trim();
      if (HAS_ARABIC.test(text)) {
        report.push({ level: 'ERROR', kind: 'jsx-text', file: rel, line: lineOf(starts, node.start), text });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) if (item && typeof item === 'object') visit(item, node);
      } else if (value && typeof value === 'object') {
        visit(value, node);
      }
    }
  };

  visit(result.program, null);
  return seenInFile;
}

const { en, dictionaries, serverKeys } = await loadDictionary();
const files = only.length ? only : walkDir(SRC);
const report = [];
const freq = flags.has('--freq') ? new Map() : null;
const used = new Set();
for (const file of files) {
  const seen = scanFile(file, en, report, freq);
  if (seen) for (const s of seen) used.add(s);
}

if (freq) {
  const rows = [...freq.entries()].filter(([, set]) => set.size >= 3).sort((a, b) => b[1].size - a[1].size);
  console.log(`Arabic strings used in 3+ files (${rows.length}):`);
  for (const [text, set] of rows) console.log(`${String(set.size).padStart(3)}  ${JSON.stringify(text)}`);
  process.exit(0);
}

// English values that still contain Arabic are almost always copy-paste mistakes.
for (const [key, value] of Object.entries(en)) {
  if (typeof value === 'string' && HAS_ARABIC.test(value)) {
    report.push({ level: 'ERROR', kind: 'en-arabic', file: 'src/i18n/en', line: 0, text: `${key}  →  ${value}` });
  }
}

// The same key translated differently in two area files: only one wins at runtime.
const definitions = new Map();
for (const [area, dict] of Object.entries(dictionaries)) {
  for (const [key, value] of Object.entries(dict)) {
    if (!definitions.has(key)) definitions.set(key, []);
    definitions.get(key).push({ area, value: String(value) });
  }
}
for (const [key, defs] of definitions) {
  if (new Set(defs.map((d) => d.value)).size > 1) {
    const detail = defs.map((d) => `${d.area}: ${JSON.stringify(d.value)}`).join(' | ');
    report.push({ level: 'ERROR', kind: 'conflict', file: 'src/i18n/en', line: 0, text: `${key}  →  ${detail}` });
  }
}

const showIndirect = flags.has('--indirect');
const visible = report.filter((r) => r.level === 'ERROR' || showIndirect);
const byFile = new Map();
for (const r of visible) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file).push(r);
}
for (const [file, rows] of byFile) {
  console.log(`\n${file}`);
  for (const r of rows.sort((a, b) => a.line - b.line)) {
    console.log(`  ${String(r.line).padStart(5)}  ${r.level.padEnd(5)} ${r.kind.padEnd(9)} ${r.text}`);
  }
}

if (flags.has('--unused') && !only.length) {
  const unused = Object.keys(en).filter((k) => !used.has(k) && !serverKeys.has(k));
  console.log(`\nEnglish keys not used in src (${unused.length}):`);
  for (const k of unused) console.log(`  ${k}`);
}

const errors = report.filter((r) => r.level === 'ERROR');
const counts = {};
for (const r of report) counts[r.kind] = (counts[r.kind] || 0) + 1;
console.log(
  `\n${files.length} file(s) · ${Object.keys(en).length} English entries · ` +
    (Object.keys(counts).length ? Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ') : 'no findings')
);
process.exit(errors.length ? 1 : 0);

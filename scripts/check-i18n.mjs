// Fails if any UI language has a missing, empty or extra key, missing plural forms, or mismatched
// interpolation variables compared with English (plan section 11.2, guard 1).
import { readFileSync, existsSync } from 'node:fs';

const languages = JSON.parse(readFileSync('src/i18n/languages.json', 'utf8'));
const load = (code) => JSON.parse(readFileSync(`src/i18n/locales/${code}.json`, 'utf8'));

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const PLURAL = /_(zero|one|two|few|many|other)$/;
const vars = (s) => new Set([...String(s).matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]));
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const en = flatten(load('en'));
// Base keys: plural keys collapsed to their stem.
const base = new Map();
for (const [k, v] of Object.entries(en)) {
  const stem = k.replace(PLURAL, '');
  const entry = base.get(stem) ?? { plural: false, vars: new Set() };
  entry.plural ||= PLURAL.test(k);
  for (const x of vars(v)) entry.vars.add(x);
  base.set(stem, entry);
}

const errors = [];
for (const { code } of languages) {
  const file = `src/i18n/locales/${code}.json`;
  if (!existsSync(file)) {
    errors.push(`${code}: locale file missing`);
    continue;
  }
  const loc = flatten(load(code));
  const cats = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  const expected = new Set();
  for (const [stem, { plural, vars: v }] of base) {
    const keys = plural ? cats.map((c) => `${stem}_${c}`) : [stem];
    for (const key of keys) {
      expected.add(key);
      const val = loc[key];
      if (val === undefined) errors.push(`${code}: missing "${key}"`);
      else if (typeof val !== 'string' || !val.trim()) errors.push(`${code}: empty "${key}"`);
      else {
        const got = vars(val);
        // Plural forms may omit {{count}} (e.g. "one" written as a word); every other variable must match.
        const want = new Set(v);
        if (plural) {
          want.delete('count');
          got.delete('count');
        }
        if (!sameSet(want, got))
          errors.push(`${code}: variables differ in "${key}" (expected [${[...want]}], got [${[...got]}])`);
      }
    }
  }
  for (const key of Object.keys(loc)) {
    // Extra plural categories (e.g. an English-style _one) are tolerated when the stem is a plural key.
    if (!expected.has(key) && !(PLURAL.test(key) && base.get(key.replace(PLURAL, ''))?.plural))
      errors.push(`${code}: unexpected key "${key}"`);
  }
}

if (errors.length) {
  console.error(`i18n check failed (${errors.length} problems):\n  ` + errors.slice(0, 80).join('\n  '));
  process.exit(1);
}
console.log(`i18n check passed: ${languages.length} languages, ${base.size} keys each.`);

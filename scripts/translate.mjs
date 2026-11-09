// Machine-assisted translation of the UI strings (plan 11.1): fills missing or outdated keys in every locale from
// English using the Groq generator model, then validates interpolation variables and plural forms.
// Usage: node scripts/translate.mjs [lang ...]   (reads GROQ_API_KEY from .env; never prints it)
// Translations are then reviewed; src/i18n/translation-sources.json records which English text each one was
// made from, so changed English strings are re-translated automatically.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const KEY = process.env.GROQ_API_KEY ?? env.match(/^GROQ_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) {
  console.error('translate: GROQ_API_KEY missing');
  process.exit(1);
}
// Free-tier limits are per model, so requests rotate across three models for throughput.
const MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
const languages = JSON.parse(readFileSync('src/i18n/languages.json', 'utf8'));
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : languages.map((l) => l.code).filter((c) => c !== 'en');
const SOURCES_FILE = 'src/i18n/translation-sources.json';
const sources = existsSync(SOURCES_FILE) ? JSON.parse(readFileSync(SOURCES_FILE, 'utf8')) : {};

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};
const unflatten = (flat) => {
  const out = {};
  for (const [key, v] of Object.entries(flat).sort(([a], [b]) => a.localeCompare(b))) {
    const parts = key.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) o = o[p] ??= {};
    o[parts.at(-1)] = v;
  }
  return out;
};
const PLURAL = /_(zero|one|two|few|many|other)$/;
/** A string that should differ from English once translated (has real words, not just names/symbols). */
const translatable = (s) =>
  (
    String(s)
      .replace(/\{\{[^}]+\}\}|StudyNight|XP/g, '')
      .match(/\p{L}{3,}/gu) ?? []
  ).length >= 2;
const untranslated = (t, en) => typeof t === 'string' && t.trim() === String(en).trim() && translatable(en);
const vars = (s) =>
  [...String(s).matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

const en = flatten(JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8')));
// Group English keys: plural stems carry their one/other forms.
const stems = new Map();
for (const [k, v] of Object.entries(en)) {
  const stem = k.replace(PLURAL, '');
  const e = stems.get(stem) ?? { plural: PLURAL.test(k), forms: {} };
  e.plural ||= PLURAL.test(k);
  e.forms[k.match(PLURAL)?.[1] ?? '_'] = v;
  stems.set(stem, e);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let modelTurn = 0;
/** When each model may be used again (free-tier limits are per model, including daily token caps). */
const readyAt = new Map(MODELS.map((m) => [m, 0]));

async function callModel(system, user) {
  for (let attempt = 0; attempt < 60; attempt++) {
    // Round-robin among models that are available now; otherwise wait for the first one to free up.
    const now = Date.now();
    const free = MODELS.filter((m) => readyAt.get(m) <= now);
    const model = free.length ? free[modelTurn++ % free.length] : [...readyAt].sort((a, b) => a[1] - b[1])[0][0];
    const waitMs = readyAt.get(model) - now;
    if (waitMs > 0) await sleep(Math.min(900_000, waitMs));
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_completion_tokens: 8000,
        ...(model.startsWith('qwen/') ? { reasoning_format: 'hidden' } : { reasoning_effort: 'low' }),
        response_format: { type: 'json_object' },
      }),
    });
    if (res.status === 429) {
      // Daily token caps answer with long waits: mark this model busy and carry on with the others.
      const wait = Number(res.headers.get('retry-after')) || 8;
      readyAt.set(model, Date.now() + Math.min(900, wait) * 1000 + Math.random() * 1500);
      continue;
    }
    if (!res.ok) {
      await sleep(3000);
      continue;
    }
    const j = await res.json();
    try {
      return JSON.parse(j.choices[0].message.content);
    } catch {
      continue;
    }
  }
  throw new Error('translation failed after retries');
}

function systemPrompt(lang) {
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang);
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  return `You translate the user interface of "StudyNight", a friendly, playful study app for students of all ages, from British English into ${name} (${lang}).
Rules:
- Natural, warm, concise ${name} as a native app would use; informal "you" where that is normal for consumer apps in ${name}. Keep strings short — they appear on phone buttons and labels.
- Keep every {{variable}} exactly as written (same names, not translated). Keep the brand name "StudyNight", "XP", and emoji as they are.
- Do not translate keys. Do not add explanations.
- Plural entries: the input gives English "one"/"other" forms; output an object with exactly these plural categories for ${name}: ${cats.join(', ')}, each a full string (use {{count}} where the number should appear).
Output JSON: {"translations": {"<key>": "<text>" or {"<category>": "<text>"}}}`;
}

for (const lang of targets) {
  const file = `src/i18n/locales/${lang}.json`;
  const current = existsSync(file) ? flatten(JSON.parse(readFileSync(file, 'utf8'))) : {};
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  const src = (sources[lang] ??= {});
  const todo = [];
  for (const [stem, e] of stems) {
    const fingerprint = JSON.stringify(e.forms);
    const keys = e.plural ? cats.map((c) => `${stem}_${c}`) : [stem];
    const missing = keys.some((k) => !current[k] || untranslated(current[k], en[k] ?? en[`${stem}_other`]));
    if (missing || src[stem] !== fingerprint) todo.push([stem, e]);
  }
  // Drop keys that no longer exist in English.
  for (const k of Object.keys(current)) if (!stems.has(k.replace(PLURAL, ''))) delete current[k];
  if (!todo.length) {
    console.log(`${lang}: up to date`);
    writeFileSync(file, JSON.stringify(unflatten(current), null, 2) + '\n');
    continue;
  }
  console.log(`${lang}: translating ${todo.length} strings`);
  const BATCH = 45;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const input = Object.fromEntries(
      batch.map(([stem, e]) => [stem, e.plural ? { one: e.forms.one, other: e.forms.other } : e.forms._]),
    );
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const out = await callModel(systemPrompt(lang), JSON.stringify(input, null, 1));
      const tr = out?.translations ?? {};
      let bad = 0;
      for (const [stem, e] of batch) {
        const t = tr[stem];
        if (e.plural) {
          if (!t || typeof t !== 'object') {
            bad++;
            continue;
          }
          const want = vars(e.forms.other)
            .replace(/(^|,)count(,|$)/, '$1$2')
            .replace(/^,|,$/g, '');
          let good = true;
          for (const c of cats) {
            const s = t[c] ?? t.other;
            if (
              typeof s !== 'string' ||
              !s.trim() ||
              untranslated(s, e.forms.other) ||
              vars(s)
                .replace(/(^|,)count(,|$)/, '$1$2')
                .replace(/^,|,$/g, '') !== want
            )
              good = false;
          }
          if (!good) {
            bad++;
            continue;
          }
          for (const c of cats) current[`${stem}_${c}`] = (t[c] ?? t.other).trim();
          src[stem] = JSON.stringify(e.forms);
        } else {
          if (
            typeof t !== 'string' ||
            !t.trim() ||
            untranslated(t, e.forms._) ||
            vars(t) !== vars(e.forms._)
          ) {
            bad++;
            continue;
          }
          current[stem] = t.trim();
          src[stem] = JSON.stringify(e.forms);
        }
      }
      ok = bad === 0;
      if (!ok) {
        for (const k of Object.keys(input))
          if (src[k] === JSON.stringify(stems.get(k).forms)) delete input[k];
        if (!Object.keys(input).length) ok = true;
      }
    }
    writeFileSync(file, JSON.stringify(unflatten(current), null, 2) + '\n');
    writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 1) + '\n');
    process.stdout.write('.');
  }
  console.log(` done`);
}

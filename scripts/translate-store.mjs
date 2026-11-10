// Translates the Google Play listing texts (store/descriptions/en.json) into the 20 other UI languages with the
// project's own Groq models, enforcing Play's limits (short ≤ 80 characters, full ≤ 4,000).
// Usage: node scripts/translate-store.mjs [lang …]   (reads GROQ_API_KEY from .env; never prints it)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const KEY = process.env.GROQ_API_KEY ?? env.match(/^GROQ_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) {
  console.error('translate-store: GROQ_API_KEY missing');
  process.exit(1);
}
const MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
const readyAt = new Map(MODELS.map((m) => [m, 0]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const en = JSON.parse(readFileSync('store/descriptions/en.json', 'utf8'));
const languages = JSON.parse(readFileSync('src/i18n/languages.json', 'utf8'));
const targets = process.argv.slice(2).length ? process.argv.slice(2) : languages.map((l) => l.code).filter((c) => c !== 'en');

async function call(system, user) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = Date.now();
    const free = MODELS.filter((m) => readyAt.get(m) <= now);
    const model = free[attempt % Math.max(1, free.length)] ?? [...readyAt].sort((a, b) => a[1] - b[1])[0][0];
    const wait = readyAt.get(model) - now;
    if (wait > 0) await sleep(Math.min(900_000, wait));
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
        max_completion_tokens: 6000,
        ...(model.startsWith('qwen/') ? { reasoning_format: 'hidden' } : { reasoning_effort: 'low' }),
        response_format: { type: 'json_object' },
      }),
    });
    if (res.status === 429) {
      readyAt.set(model, Date.now() + Math.min(900, Number(res.headers.get('retry-after')) || 8) * 1000);
      continue;
    }
    if (!res.ok) {
      await sleep(3000);
      continue;
    }
    try {
      return JSON.parse((await res.json()).choices[0].message.content);
    } catch {
      continue;
    }
  }
  throw new Error('translation failed');
}

for (const lang of targets) {
  const file = `store/descriptions/${lang}.json`;
  if (existsSync(file)) {
    console.log(`${lang}: exists`);
    continue;
  }
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang);
  const system = `You translate the Google Play store listing of "StudyNight", a friendly study app, from British English into ${name} (${lang}).
Write natural, appealing ${name} as a native app store listing would. Keep "StudyNight" unchanged. Keep the bullet structure and line breaks of the full description, and keep the list of language names exactly as it is.
"short" must be at most 80 characters (count carefully). "full" must be at most 4000 characters.
Output JSON: {"short": "…", "full": "…"}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const out = await call(system, JSON.stringify(en));
    if (typeof out?.short === 'string' && typeof out?.full === 'string' && out.short.length <= 80 && out.full.length <= 4000 && out.full.includes('StudyNight')) {
      writeFileSync(file, JSON.stringify({ short: out.short.trim(), full: out.full.trim() }, null, 2) + '\n');
      console.log(`${lang}: ok (${out.short.length}/${out.full.length})`);
      break;
    }
    if (attempt === 3) console.log(`${lang}: FAILED validation`);
  }
}

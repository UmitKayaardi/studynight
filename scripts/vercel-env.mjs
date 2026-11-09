// Copies GROQ_* variables from .env into the linked Vercel project (production + preview) without printing any
// value: each value is piped to `vercel env add` on stdin. Usage: node scripts/vercel-env.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const vars = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => /^(GROQ_[A-Z_]+)=(.+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const defaults = {
  GROQ_GENERATOR_MODEL: 'openai/gpt-oss-120b',
  GROQ_GENERATOR_FALLBACK_MODEL: 'openai/gpt-oss-20b',
  GROQ_VERIFIER_MODEL: 'qwen/qwen3.8-27b',
  GROQ_VERIFIER_FALLBACK_MODEL: 'openai/gpt-oss-20b',
  GROQ_VISION_MODEL: 'qwen/qwen3.8-27b',
  GROQ_STT_MODEL: 'whisper-large-v3',
  GROQ_STT_FALLBACK_MODEL: 'whisper-large-v3-turbo',
};
const all = { ...defaults, ...vars };
if (!all.GROQ_API_KEY) {
  console.error('vercel-env: GROQ_API_KEY missing in .env');
  process.exit(1);
}
for (const [name, value] of Object.entries(all)) {
  for (const target of ['production', 'preview']) {
    spawnSync('vercel', ['env', 'rm', name, target, '--yes'], { shell: true, stdio: 'ignore' });
    const r = spawnSync('vercel', ['env', 'add', name, target], {
      input: value,
      shell: true,
      stdio: ['pipe', 'ignore', 'pipe'],
      encoding: 'utf8',
    });
    console.log(`${name} (${target}): ${r.status === 0 ? 'set' : 'FAILED'}`);
  }
}

// Runs a TypeScript module (default export: async function) through Vite's SSR loader, so build-time scripts
// can reuse the app's own TypeScript code (chunker, prompts, verifier). Loads GROQ_* variables from .env.
// Usage: node scripts/run-ts.mjs scripts/build-samples.ts [args...]
import { createServer } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^(GROQ_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <file.ts> [args]');
  process.exit(1);
}
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const mod = await server.ssrLoadModule(resolve(entry));
  await mod.default(args);
} finally {
  await server.close();
}

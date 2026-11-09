// Measures the initial JavaScript a first visit downloads (the entry chunk plus all chunks it imports
// statically), gzipped, and fails above the budget (plan 13.2: aim ≤ 250 KB).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = 250;
const html = readFileSync('dist/index.html', 'utf8');
const entry = /<script type="module"[^>]*src="\/([^"]+)"/.exec(html)?.[1];
if (!entry) throw new Error('entry script not found in dist/index.html');
const seen = new Set();
const queue = [entry];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const code = readFileSync(join('dist', file), 'utf8');
  // Static imports only (dynamic import() chunks load later, on demand).
  for (const m of code.matchAll(/(?:^|[;\n}])\s*import\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g)) {
    queue.push(`assets/${m[1]}`);
  }
}
let total = 0;
for (const f of seen) {
  const kb = gzipSync(readFileSync(join('dist', f))).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`);
}
console.log(`initial JS: ${total.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB) process.exit(1);

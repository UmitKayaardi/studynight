// Fails if any production dependency uses a licence outside the allow-list (plan section 13.3).
import { execSync } from 'node:child_process';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'OFL-1.1',
  // Zlib: permissive (used by pako, together with MIT). See DECISIONS.md.
  'Zlib',
]);

// Packages whose metadata is imprecise, verified by reading their LICENSE file.
const VERIFIED = {
  duck: 'BSD-2-Clause', // LICENSE has the two BSD clauses and no endorsement clause.
};

// Native Node-only binaries pulled in by @huggingface/transformers for server-side use. They are never bundled
// into the browser app (transformers.js runs in a Web Worker in the browser) nor imported by the /api functions.
const EXCLUDED_PREFIXES = ['@img/sharp-', 'sharp@', 'onnxruntime-node@', '@napi-rs/canvas'];

const out = execSync('npx license-checker-rseidelsohn --production --json --excludePrivatePackages', {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const data = JSON.parse(out);

function ok(expr) {
  const e = expr.replace(/[()]/g, '').trim();
  if (e.includes(' OR ')) return e.split(' OR ').some((p) => ok(p));
  if (e.includes(' AND ')) return e.split(' AND ').every((p) => ok(p));
  return ALLOWED.has(e.replace(/\*$/, ''));
}

const failures = [];
let count = 0;
for (const [pkg, info] of Object.entries(data)) {
  if (EXCLUDED_PREFIXES.some((p) => pkg.startsWith(p))) continue;
  count++;
  const name = pkg.slice(0, pkg.lastIndexOf('@'));
  const lic =
    VERIFIED[name] ?? (Array.isArray(info.licenses) ? info.licenses.join(' AND ') : String(info.licenses));
  if (!ok(lic)) failures.push(`${pkg}: ${lic}`);
}

if (failures.length) {
  console.error('Licence check failed — not on the allow-list:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`Licence check passed (${count} production packages).`);

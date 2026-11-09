// Copies the ONNX Runtime WebAssembly files used by transformers.js into public/ort/ so they are served
// from our own origin (strict CSP, offline caching) instead of a CDN. Runs before dev and build.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = 'node_modules/onnxruntime-web/dist';
const dest = 'public/ort';
const files = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

mkdirSync(dest, { recursive: true });
for (const f of files) {
  const from = join(src, f);
  const to = join(dest, f);
  if (!existsSync(from)) {
    console.error(`copy-ort: missing ${from}`);
    process.exit(1);
  }
  if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
}
console.log('copy-ort: ONNX Runtime files ready in public/ort/');

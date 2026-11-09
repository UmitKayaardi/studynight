/// <reference lib="webworker" />
/**
 * Embeddings worker: runs the multilingual sentence-embedding model with transformers.js (ONNX, WebAssembly)
 * and does cosine-similarity search over a deck's chunk vectors, off the main thread.
 */
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { normalise, topK, type VectorMatrix } from './vector';
import { EMBED_MODEL, type EmbedRequest, type EmbedResponse } from './embedProtocol';

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
env.useBrowserCache = true;
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { mjs: '/ort/ort-wasm-simd-threaded.mjs', wasm: '/ort/ort-wasm-simd-threaded.wasm' };
  onnx.wasm.numThreads = 1; // no cross-origin isolation → no SharedArrayBuffer threads
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;
const indexes = new Map<string, VectorMatrix>();

function post(msg: EmbedResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

function load(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    const files = new Map<string, { loaded: number; total: number }>();
    extractor = pipeline('feature-extraction', EMBED_MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.file && p.total) {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          post({ type: 'progress', loaded, total });
        }
      },
    }) as Promise<FeatureExtractionPipeline>;
    extractor.catch(() => {
      extractor = null;
    });
  }
  return extractor;
}

/** e5 models expect "query: " / "passage: " prefixes. */
async function embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]> {
  const model = await load();
  const out: Float32Array[] = [];
  const BATCH = 8;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => `${kind}: ${t}`);
    const tensor = await model(batch, { pooling: 'mean', normalize: true });
    const dim = tensor.dims.at(-1)!;
    const data = tensor.data as Float32Array;
    for (let r = 0; r < batch.length; r++) out.push(normalise(data.slice(r * dim, (r + 1) * dim)));
  }
  return out;
}

self.onmessage = async (e: MessageEvent<EmbedRequest>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'load':
        await load();
        post({ type: 'ready', id: msg.id });
        break;
      case 'embed': {
        const vectors = await embed(msg.texts, msg.kind);
        post(
          { type: 'vectors', id: msg.id, vectors },
          vectors.map((v) => v.buffer),
        );
        break;
      }
      case 'index':
        indexes.set(msg.deckId, { ids: msg.ids, dim: msg.dim, data: msg.data });
        post({ type: 'ok', id: msg.id });
        break;
      case 'drop':
        indexes.delete(msg.deckId);
        post({ type: 'ok', id: msg.id });
        break;
      case 'search': {
        const m = indexes.get(msg.deckId);
        if (!m || !m.ids.length) {
          post({ type: 'hits', id: msg.id, hits: [] });
          break;
        }
        const [q] = await embed([msg.query], 'query');
        post({ type: 'hits', id: msg.id, hits: topK(m, q!, msg.k) });
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.name : 'Error' });
  }
};

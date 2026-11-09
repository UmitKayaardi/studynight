/**
 * Main-thread client for the embeddings worker. The model downloads once, lazily, and is cached in Cache
 * Storage by transformers.js. If it is unavailable (declined, failed, low memory), callers fall back to BM25.
 */
import type { Hit } from './bm25';
import { EMBED_MODEL, type EmbedRequest, type EmbedResponse } from './embedProtocol';
import { toMatrix } from './vector';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Pending = { resolve: (v: EmbedResponse) => void; reject: (e: Error) => void };

const CACHE_NAME = 'transformers-cache';

class EmbedClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private progressListeners = new Set<(loaded: number, total: number) => void>();
  private indexed = new Set<string>();
  ready = false;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<EmbedResponse>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          for (const l of this.progressListeners) l(msg.loaded, msg.total);
          return;
        }
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.type === 'error') p.reject(new Error(msg.message));
        else p.resolve(msg);
      };
      this.worker.onerror = () => {
        for (const p of this.pending.values()) p.reject(new Error('WorkerError'));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
        this.ready = false;
        this.indexed.clear();
      };
    }
    return this.worker;
  }

  private request(msg: WithoutId<EmbedRequest>, transfer: Transferable[] = []) {
    const id = ++this.seq;
    return new Promise<EmbedResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.getWorker().postMessage({ ...msg, id } as EmbedRequest, transfer);
    });
  }

  onProgress(fn: (loaded: number, total: number) => void): () => void {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  async load(): Promise<void> {
    await this.request({ type: 'load' });
    this.ready = true;
  }

  async embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]> {
    const r = await this.request({ type: 'embed', texts, kind });
    return r.type === 'vectors' ? r.vectors : [];
  }

  async setIndex(deckId: string, items: Array<{ id: string; vector: Float32Array }>): Promise<void> {
    const m = toMatrix(items);
    await this.request({ type: 'index', deckId, ids: m.ids, dim: m.dim, data: m.data }, [m.data.buffer]);
    this.indexed.add(deckId);
  }

  hasIndex(deckId: string): boolean {
    return this.indexed.has(deckId);
  }

  async dropIndex(deckId: string): Promise<void> {
    this.indexed.delete(deckId);
    if (this.worker) await this.request({ type: 'drop', deckId });
  }

  async search(deckId: string, query: string, k: number): Promise<Hit[]> {
    const r = await this.request({ type: 'search', deckId, query, k });
    return r.type === 'hits' ? r.hits : [];
  }

  /** Whether the model files are already in Cache Storage (downloaded before). */
  async isDownloaded(): Promise<boolean> {
    try {
      if (!('caches' in globalThis)) return false;
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      return keys.some((k) => k.url.includes(EMBED_MODEL) && k.url.endsWith('.onnx'));
    } catch {
      return false;
    }
  }

  /** Removes the downloaded model and stops the worker. */
  async remove(): Promise<void> {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.indexed.clear();
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      /* Cache Storage unavailable: nothing to remove */
    }
  }
}

export const embedClient = new EmbedClient();

/** True when the device is on mobile data or has asked to save data — then we ask before downloading. */
export function onMeteredConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return !!c && (c.saveData === true || c.type === 'cellular');
}

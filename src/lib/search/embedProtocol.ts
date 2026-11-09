import type { Hit } from './bm25';

/** Multilingual sentence-embedding model (MIT licence). See DECISIONS.md. */
export const EMBED_MODEL = 'Xenova/multilingual-e5-small';
export const EMBED_DIM = 384;
/** Approximate one-time download (int8 model + tokenizer + ONNX Runtime), in megabytes. */
export const EMBED_DOWNLOAD_MB = 130;

export type EmbedRequest =
  | { type: 'load'; id: number }
  | { type: 'embed'; id: number; texts: string[]; kind: 'query' | 'passage' }
  | { type: 'index'; id: number; deckId: string; ids: string[]; dim: number; data: Float32Array }
  | { type: 'drop'; id: number; deckId: string }
  | { type: 'search'; id: number; deckId: string; query: string; k: number };

export type EmbedResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; id: number }
  | { type: 'ok'; id: number }
  | { type: 'vectors'; id: number; vectors: Float32Array[] }
  | { type: 'hits'; id: number; hits: Hit[] }
  | { type: 'error'; id: number; message: string };

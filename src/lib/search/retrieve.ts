/**
 * Hybrid retrieval: BM25 (always) + embeddings (when the model is available), fused with Reciprocal Rank
 * Fusion. Any embedding failure silently falls back to BM25 only — never an error for the learner.
 */
import { buildBm25, searchBm25, type Bm25Index, type Hit } from './bm25';
import { embedClient } from './embedClient';
import { rrf } from './vector';

const bm25Cache = new Map<string, { size: number; index: Bm25Index }>();

export function bm25For(deckId: string, chunks: Array<{ id: string; text: string }>): Bm25Index {
  const cached = bm25Cache.get(deckId);
  if (cached && cached.size === chunks.length) return cached.index;
  const index = buildBm25(chunks);
  bm25Cache.set(deckId, { size: chunks.length, index });
  return index;
}

export function forgetDeckIndex(deckId: string): void {
  bm25Cache.delete(deckId);
  void embedClient.dropIndex(deckId).catch(() => undefined);
}

/**
 * Weight of the keyword list in Reciprocal Rank Fusion (the vector list has weight 1). Chosen with the
 * retrieval benchmark (docs/BENCHMARK.md): weak keyword hits on cross-language queries otherwise push good
 * semantic matches down.
 */
export const HYBRID_BM25_WEIGHT = 0.5;

/** Fuses keyword and vector hits; with no vector hits this is BM25 order. */
export function fuse(keyword: Hit[], vector: Hit[] | null, k: number): Hit[] {
  if (!vector || vector.length === 0) return keyword.slice(0, k);
  return rrf([keyword, vector], k, 60, [HYBRID_BM25_WEIGHT, 1]);
}

export async function retrieve(
  deckId: string,
  chunks: Array<{ id: string; text: string }>,
  query: string,
  k = 6,
): Promise<Hit[]> {
  const keyword = searchBm25(bm25For(deckId, chunks), query, k * 3);
  let vector: Hit[] | null = null;
  if (embedClient.ready && embedClient.hasIndex(deckId)) {
    try {
      vector = await embedClient.search(deckId, query, k * 3);
    } catch {
      vector = null;
    }
  }
  return fuse(keyword, vector, k);
}

/** Highest cosine similarity between `v` and any of `others` (all normalised). */
export function maxSimilarity(v: Float32Array, others: Float32Array[]): number {
  let best = -1;
  for (const o of others) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i]! * o[i]!;
    if (s > best) best = s;
  }
  return best;
}

/** Embedding similarity above which two questions count as duplicates. */
export const DUPLICATE_SIMILARITY = 0.92;

/**
 * Vector store helpers: vectors are L2-normalised Float32Arrays, so cosine similarity is a dot product.
 * Brute-force search over a contiguous matrix is fast enough at deck scale (5,000 × 384 in a few ms).
 */
import type { Hit } from './bm25';

export function normalise(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

export interface VectorMatrix {
  ids: string[];
  dim: number;
  data: Float32Array; // ids.length × dim
}

export function toMatrix(items: Array<{ id: string; vector: Float32Array }>): VectorMatrix {
  const dim = items[0]?.vector.length ?? 0;
  const data = new Float32Array(items.length * dim);
  items.forEach((it, i) => data.set(it.vector, i * dim));
  return { ids: items.map((i) => i.id), dim, data };
}

/** Top-k by cosine similarity (inputs normalised). */
export function topK(m: VectorMatrix, query: Float32Array, k = 10): Hit[] {
  const n = m.ids.length;
  const scores = new Float32Array(n);
  const { dim, data } = m;
  for (let r = 0; r < n; r++) {
    let s = 0;
    const off = r * dim;
    for (let i = 0; i < dim; i++) s += data[off + i]! * query[i]!;
    scores[r] = s;
  }
  // Partial selection: keep a small sorted list.
  const best: Hit[] = [];
  for (let r = 0; r < n; r++) {
    const s = scores[r]!;
    if (best.length < k || s > best[best.length - 1]!.score) {
      let j = best.length;
      while (j > 0 && best[j - 1]!.score < s) j--;
      best.splice(j, 0, { id: m.ids[r]!, score: s });
      if (best.length > k) best.pop();
    }
  }
  return best;
}

/**
 * Reciprocal Rank Fusion: score(d) = Σ 1 / (c + rank_i(d)) over the ranked lists that contain d.
 * Robust to the different score scales of BM25 and cosine similarity.
 */
export function rrf(lists: Hit[][], k = 10, c = 60, weights: number[] = []): Hit[] {
  const scores = new Map<string, number>();
  lists.forEach((list, li) => {
    const w = weights[li] ?? 1;
    list.forEach((h, rank) => scores.set(h.id, (scores.get(h.id) ?? 0) + w / (c + rank + 1)));
  });
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, k);
}

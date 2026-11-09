import { describe, expect, it } from 'vitest';
import { bm25For, fuse, maxSimilarity, retrieve } from './retrieve';
import { normalise } from './vector';

const chunks = [
  { id: 'c1', text: 'Saving money regularly builds an emergency fund for unexpected costs.' },
  { id: 'c2', text: 'Compound interest means earning interest on previously earned interest.' },
  { id: 'c3', text: 'A budget lists income and planned spending for a month.' },
];

describe('retrieve', () => {
  it('falls back to BM25 when embeddings are not available', async () => {
    const hits = await retrieve('deck', chunks, 'compound interest', 2);
    expect(hits[0]!.id).toBe('c2');
  });

  it('caches the BM25 index per deck and rebuilds when chunks change', () => {
    const a = bm25For('d2', chunks);
    expect(bm25For('d2', chunks)).toBe(a);
    expect(bm25For('d2', chunks.slice(0, 2))).not.toBe(a);
  });
});

describe('fuse', () => {
  it('uses keyword order without vectors and fuses with them', () => {
    const kw = [
      { id: 'a', score: 3 },
      { id: 'b', score: 1 },
    ];
    expect(fuse(kw, null, 5)).toEqual(kw);
    expect(fuse(kw, [], 5)).toEqual(kw);
    const fused = fuse(
      kw,
      [
        { id: 'c', score: 0.9 },
        { id: 'b', score: 0.8 },
      ],
      5,
    );
    expect(fused[0]!.id).toBe('b');
  });
});

describe('maxSimilarity', () => {
  it('finds the closest vector', () => {
    const a = normalise(new Float32Array([1, 0]));
    const b = normalise(new Float32Array([0, 1]));
    const c = normalise(new Float32Array([1, 0.1]));
    expect(maxSimilarity(a, [b, c])).toBeGreaterThan(0.99);
    expect(maxSimilarity(a, [])).toBe(-1);
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildBm25, searchBm25, tokenize } from './bm25';
import { dot, normalise, rrf, toMatrix, topK } from './vector';

const docs = [
  {
    id: 'sun',
    text: 'The Sun is a star at the centre of the Solar System. It produces energy by nuclear fusion.',
  },
  { id: 'moon', text: 'The Moon orbits the Earth and causes the tides through its gravity.' },
  { id: 'mars', text: 'Mars is the fourth planet. It has a thin atmosphere and two small moons.' },
  {
    id: 'vaccine',
    text: 'Vaccines train the immune system to recognise a pathogen without causing the disease.',
  },
];

describe('tokenize', () => {
  it('folds case and accents and drops single letters', () => {
    expect(tokenize('The Énergie of a STAR')).toEqual(['the', 'energie', 'of', 'star']);
  });
  it('uses bigrams for unspaced scripts', () => {
    expect(tokenize('光合成')).toEqual(['光合', '合成']);
  });
});

describe('BM25', () => {
  const index = buildBm25(docs);
  it('ranks the relevant document first', () => {
    expect(searchBm25(index, 'nuclear fusion energy')[0]!.id).toBe('sun');
    expect(searchBm25(index, 'tides gravity')[0]!.id).toBe('moon');
    expect(searchBm25(index, 'immune system')[0]!.id).toBe('vaccine');
  });
  it('returns nothing for unknown words or an empty index', () => {
    expect(searchBm25(index, 'quantum chromodynamics')).toEqual([]);
    expect(searchBm25(buildBm25([]), 'sun')).toEqual([]);
  });
  it('limits results and orders by score', () => {
    const hits = searchBm25(index, 'the', 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
  });
  it('finds CJK text', () => {
    const idx = buildBm25([
      { id: 'a', text: '光合成は植物がエネルギーを作る仕組みです' },
      { id: 'b', text: '火星は四番目の惑星です' },
    ]);
    expect(searchBm25(idx, '光合成')[0]!.id).toBe('a');
  });
});

function randomUnit(dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() - 0.5;
  return normalise(v);
}

describe('vector search', () => {
  it('normalises vectors', () => {
    const v = normalise(new Float32Array([3, 4]));
    expect(dot(v, v)).toBeCloseTo(1, 6);
  });

  it('finds the nearest vectors', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: String(i), vector: randomUnit(16) }));
    const m = toMatrix(items);
    const hits = topK(m, items[7]!.vector, 3);
    expect(hits[0]!.id).toBe('7');
    expect(hits[0]!.score).toBeCloseTo(1, 5);
    expect(hits).toHaveLength(3);
  });

  it('matches a full sort', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 1, max: 12 }), (n, k) => {
        const items = Array.from({ length: n }, (_, i) => ({ id: String(i), vector: randomUnit(8) }));
        const q = randomUnit(8);
        const m = toMatrix(items);
        const want = items
          .map((it) => ({ id: it.id, score: dot(it.vector, q) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, k)
          .map((h) => h.id);
        return JSON.stringify(topK(m, q, k).map((h) => h.id)) === JSON.stringify(want);
      }),
    );
  });

  it('searches 5,000 × 384 vectors in under 50 ms', () => {
    const items = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), vector: randomUnit(384) }));
    const m = toMatrix(items);
    const q = randomUnit(384);
    topK(m, q, 10); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) topK(m, q, 10);
    expect((performance.now() - t0) / 5).toBeLessThan(50);
  });
});

describe('rrf', () => {
  it('rewards documents ranked well by both lists', () => {
    const fused = rrf([
      [
        { id: 'a', score: 9 },
        { id: 'b', score: 5 },
        { id: 'c', score: 1 },
      ],
      [
        { id: 'b', score: 0.9 },
        { id: 'd', score: 0.8 },
        { id: 'a', score: 0.1 },
      ],
    ]);
    expect(
      fused
        .slice(0, 2)
        .map((h) => h.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(fused.map((h) => h.id)).toContain('d');
  });
  it('equals the single list when only one is given', () => {
    const list = [
      { id: 'x', score: 3 },
      { id: 'y', score: 2 },
    ];
    expect(rrf([list]).map((h) => h.id)).toEqual(['x', 'y']);
  });
});

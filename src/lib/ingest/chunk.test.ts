import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { chunkBlocks, chunkUnits, CHUNK_MAX, toUnits } from './chunk';
import type { Block } from './types';

const word = fc.stringMatching(/^[a-z]{1,10}$/);
const sentence = fc.array(word, { minLength: 1, maxLength: 40 }).map((ws) => {
  const s = ws.join(' ');
  return s[0]!.toUpperCase() + s.slice(1) + '.';
});
const blockArb = fc.record({
  heading: fc.boolean(),
  sentences: fc.array(sentence, { minLength: 1, maxLength: 25 }),
  page: fc.integer({ min: 1, max: 30 }),
  source: fc.constantFrom('a', 'b'),
});

function toBlocks(
  raw: Array<{ heading: boolean; sentences: string[]; page: number; source: string }>,
): Block[] {
  return raw.map((r) =>
    r.heading
      ? {
          kind: 'heading',
          level: 2,
          text: r.sentences[0]!.slice(0, 60),
          ref: { sourceId: r.source, page: r.page, headingPath: [] },
        }
      : {
          kind: 'text',
          text: r.sentences.join(' '),
          ref: { sourceId: r.source, page: r.page, headingPath: [] },
        },
  );
}

describe('chunker properties', () => {
  it('covers all text in order, respects the size limit and keeps correct refs', () => {
    fc.assert(
      fc.property(fc.array(blockArb, { minLength: 1, maxLength: 40 }), (raw) => {
        const blocks = toBlocks(raw);
        const units = toUnits(blocks);
        const chunks = chunkUnits(units);
        if (units.length === 0) return chunks.length === 0;

        // Coverage and order: ranges start at 0, end at N, always progress.
        expect(chunks[0]!.start).toBe(0);
        expect(chunks.at(-1)!.end).toBe(units.length);
        for (let i = 1; i < chunks.length; i++) {
          const a = chunks[i - 1]!;
          const b = chunks[i]!;
          expect(b.start).toBeLessThanOrEqual(a.end);
          expect(b.start).toBeGreaterThan(a.start);
          expect(b.end).toBeGreaterThan(a.end);
        }
        for (const c of chunks) {
          // Size limit.
          expect(c.wordCount).toBeLessThanOrEqual(CHUNK_MAX);
          // Every unit's text is in the chunk text, in order.
          let pos = 0;
          for (let i = c.start; i < c.end; i++) {
            const at = c.text.indexOf(units[i]!.text, pos);
            expect(at).toBeGreaterThanOrEqual(0);
            pos = at + units[i]!.text.length;
          }
          // Refs are exactly the refs of the contained units.
          const want = new Set(units.slice(c.start, c.end).map((u) => `${u.ref.sourceId}|${u.ref.page}`));
          const got = new Set(c.refs.map((r) => `${r.sourceId}|${r.page}`));
          expect(got).toEqual(want);
        }
        return true;
      }),
      { numRuns: 150 },
    );
  });

  it('overlaps consecutive chunks by at most ~15 %', () => {
    const blocks = toBlocks([
      {
        heading: false,
        sentences: Array(200).fill('One two three four five six seven eight nine ten.'),
        page: 1,
        source: 'a',
      },
    ]);
    const chunks = chunkBlocks(blocks);
    expect(chunks.length).toBeGreaterThan(3);
    for (let i = 1; i < chunks.length; i++) {
      const overlap = chunks[i - 1]!.end - chunks[i]!.start;
      expect(overlap).toBeGreaterThan(0);
      expect(overlap * 10).toBeLessThanOrEqual(Math.ceil(chunks[i - 1]!.wordCount * 0.15));
    }
    for (const c of chunks.slice(0, -1)) expect(c.wordCount).toBeGreaterThanOrEqual(250);
  });

  it('starts a new chunk at a heading when the current chunk is large enough', () => {
    const blocks = toBlocks([
      {
        heading: false,
        sentences: Array(15).fill('Alpha beta gamma delta epsilon zeta eta theta iota kappa.'),
        page: 1,
        source: 'a',
      },
      { heading: true, sentences: ['Second section'], page: 2, source: 'a' },
      { heading: false, sentences: ['Short text.'], page: 2, source: 'a' },
    ]);
    const chunks = chunkBlocks(blocks);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.text.startsWith('Second section')).toBe(true);
  });

  it('splits a single very long sentence and unspaced scripts', () => {
    const long = Array(1000).fill('word').join(' ');
    const cjk = '細胞'.repeat(800);
    for (const text of [long, cjk]) {
      const chunks = chunkBlocks([{ kind: 'text', text, ref: { sourceId: 's', headingPath: [] } }]);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) expect(c.wordCount).toBeLessThanOrEqual(CHUNK_MAX);
    }
  });

  it('returns no chunks for no text', () => expect(chunkBlocks([])).toEqual([]));
});

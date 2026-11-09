import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { pick, randomInt, shuffle } from './random';

describe('randomInt', () => {
  it('stays in range', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (n) => {
        const v = randomInt(n);
        return Number.isInteger(v) && v >= 0 && v < n;
      }),
    );
  });

  it('rejects values in the biased tail', () => {
    // A source that first returns a value in the rejected tail for n = 3, then 7.
    const values = [2 ** 32 - 1, 7];
    const source = (buf: Uint32Array<ArrayBuffer>) => {
      buf[0] = values.shift()!;
      return buf;
    };
    expect(randomInt(3, source)).toBe(7 % 3);
  });

  it('is roughly uniform', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[randomInt(6)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(9_000);
  });

  it('rejects invalid bounds', () => {
    expect(() => randomInt(0)).toThrow();
    expect(() => randomInt(1.5)).toThrow();
  });
});

describe('shuffle', () => {
  it('is a permutation and does not mutate input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const copy = arr.slice();
        const out = shuffle(arr);
        expect(arr).toEqual(copy);
        expect(out.slice().sort((a, b) => a - b)).toEqual(copy.sort((a, b) => a - b));
      }),
    );
  });
});

describe('pick', () => {
  it('returns an element', () => {
    expect([1, 2, 3]).toContain(pick([1, 2, 3]));
    expect(() => pick([])).toThrow();
  });
});

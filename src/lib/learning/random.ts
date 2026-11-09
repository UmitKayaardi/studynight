/**
 * Unbiased randomness from `crypto.getRandomValues` with rejection sampling.
 * Used for question order and option shuffling (never Math.random).
 */

type RandomSource = (buf: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer>;

const defaultSource: RandomSource = (buf) => crypto.getRandomValues(buf);

/** Returns an integer in [0, maxExclusive). */
export function randomInt(maxExclusive: number, source: RandomSource = defaultSource): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0)
    throw new RangeError('maxExclusive must be a positive integer');
  if (maxExclusive === 1) return 0;
  const range = 2 ** 32;
  // Largest multiple of maxExclusive that fits in 32 bits; values at or above it are rejected to avoid bias.
  const limit = range - (range % maxExclusive);
  const buf = new Uint32Array(1);
  for (;;) {
    const v = source(buf)[0]!;
    if (v < limit) return v % maxExclusive;
  }
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], source: RandomSource = defaultSource): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, source);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Picks one item uniformly. */
export function pick<T>(items: readonly T[], source: RandomSource = defaultSource): T {
  if (items.length === 0) throw new RangeError('cannot pick from an empty list');
  return items[randomInt(items.length, source)]!;
}

/** Random identifier for local records. */
export function newId(): string {
  return crypto.randomUUID();
}

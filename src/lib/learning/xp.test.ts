import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { activeMs, comboBonus, levelFromXp, xpForAnswer, xpForLevel } from './xp';

describe('xpForAnswer', () => {
  const base = { type: 'mcq' as const, difficulty: 1 as const, correct: true, usedHint: false, combo: 1 };
  it('gives base XP for a correct answer', () => expect(xpForAnswer(base)).toBe(10));
  it('gives nothing for a wrong answer', () => expect(xpForAnswer({ ...base, correct: false })).toBe(0));
  it('gives nothing for a reported question', () => expect(xpForAnswer({ ...base, reported: true })).toBe(0));
  it('halves XP after a hint', () => expect(xpForAnswer({ ...base, usedHint: true })).toBe(5));
  it('scales with difficulty', () => expect(xpForAnswer({ ...base, difficulty: 3 })).toBe(15));
  it('adds a capped combo bonus', () => {
    expect(comboBonus(2)).toBe(0);
    expect(comboBonus(3)).toBe(2);
    expect(comboBonus(50)).toBe(10);
    expect(xpForAnswer({ ...base, combo: 4 })).toBe(14);
  });
  it('gives explain answers XP in proportion to key points covered', () => {
    const e = { ...base, type: 'explain' as const };
    expect(xpForAnswer({ ...e, score: 0.5, correct: false })).toBe(10);
    expect(xpForAnswer({ ...e, score: 0, correct: false })).toBe(0);
  });
  it('is never negative', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('mcq', 'tf', 'fill', 'flashcard', 'match', 'order', 'explain' as const),
        fc.constantFrom(1, 2, 3),
        fc.boolean(),
        fc.boolean(),
        fc.nat(100),
        fc.double({ min: -1, max: 2, noNaN: true }),
        (type, difficulty, correct, usedHint, combo, score) =>
          xpForAnswer({ type, difficulty: difficulty as 1 | 2 | 3, correct, usedHint, combo, score }) >= 0,
      ),
    );
  });
});

describe('levels', () => {
  it('starts at level 1', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, into: 0 });
    expect(xpForLevel(1)).toBe(0);
  });
  it('is monotonic', () => {
    fc.assert(
      fc.property(
        fc.nat(1_000_000),
        fc.nat(1000),
        (a, d) => levelFromXp(a + d).level >= levelFromXp(a).level,
      ),
    );
  });
  it('reports progress inside the level', () => {
    const at = xpForLevel(5);
    const info = levelFromXp(at + 1);
    expect(info.level).toBe(5);
    expect(info.into).toBe(1);
    expect(info.progress).toBeGreaterThan(0);
    expect(info.progress).toBeLessThan(1);
  });
});

describe('activeMs', () => {
  it('sums gaps and caps idle time', () => {
    expect(activeMs([0, 10_000, 20_000])).toBe(20_000);
    expect(activeMs([0, 10_000, 10 * 60_000])).toBe(70_000);
    expect(activeMs([])).toBe(0);
    expect(activeMs([5])).toBe(0);
  });
  it('never exceeds the cap per gap or the wall-clock span', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(10_000_000), { maxLength: 50 }), (ts) => {
        const a = activeMs(ts);
        const span = ts.length ? Math.max(...ts) - Math.min(...ts) : 0;
        return a >= 0 && a <= span && a <= Math.max(0, ts.length - 1) * 60_000;
      }),
    );
  });
});

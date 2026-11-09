import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { newCardState, Rating, schedule } from './fsrs';
import { SKILL_MAX, SKILL_MIN, targetDifficulty, topicMastery, updateSkill } from './mastery';

const T0 = Date.UTC(2026, 2, 1);

describe('topicMastery', () => {
  it('is 0 for an untouched topic', () => {
    expect(topicMastery({ cards: [undefined, undefined], recent: [], now: T0 })).toBe(0);
    expect(topicMastery({ cards: [], recent: [], now: T0 })).toBe(0);
  });

  it('rises with recent accuracy and retrievability', () => {
    const learned = schedule(newCardState(T0), Rating.Good, T0);
    const low = topicMastery({ cards: [learned, undefined, undefined], recent: [false, true], now: T0 });
    const high = topicMastery({ cards: [learned, learned, learned], recent: [true, true, true], now: T0 });
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
  });

  it('only uses the last 10 answers', () => {
    const recent = [...Array(20).fill(false), ...Array(10).fill(true)];
    expect(topicMastery({ cards: [undefined], recent, now: T0 })).toBe(40);
  });

  it('stays within 0–100', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 30 }), fc.integer({ min: 0, max: 5 }), (recent, n) => {
        const cards = Array.from({ length: n + 1 }, (_, i) =>
          i % 2 ? schedule(newCardState(T0), Rating.Good, T0) : undefined,
        );
        const m = topicMastery({ cards, recent, now: T0 + 3 * 86_400_000 });
        return m >= 0 && m <= 100 && Number.isInteger(m);
      }),
    );
  });
});

describe('adaptive difficulty', () => {
  const skill = fc.double({ min: SKILL_MIN, max: SKILL_MAX, noNaN: true });
  const diff = fc.constantFrom(1, 2, 3);

  it('stays within bounds', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(diff, fc.boolean()), { maxLength: 200 }), (answers) => {
        let s = 1.5;
        for (const [d, ok] of answers) {
          s = updateSkill(s, d, ok);
          if (s < SKILL_MIN || s > SKILL_MAX) return false;
        }
        return true;
      }),
    );
  });

  it('moves up after a correct answer and down after a wrong one', () => {
    fc.assert(
      fc.property(skill, diff, (s, d) => {
        return updateSkill(s, d, true) >= s && updateSkill(s, d, false) <= s;
      }),
    );
  });

  it('rewards beating a hard question more than an easy one', () => {
    expect(updateSkill(2, 3, true) - 2).toBeGreaterThan(updateSkill(2, 1, true) - 2);
  });

  it('targets the nearest difficulty', () => {
    expect(targetDifficulty(1)).toBe(1);
    expect(targetDifficulty(2.4)).toBe(2);
    expect(targetDifficulty(2.6)).toBe(3);
    expect(targetDifficulty(99)).toBe(3);
    expect(targetDifficulty(-5)).toBe(1);
  });

  it('recovers from a non-finite skill', () => {
    expect(updateSkill(Number.NaN, 2, true)).toBeGreaterThan(1.5);
  });
});

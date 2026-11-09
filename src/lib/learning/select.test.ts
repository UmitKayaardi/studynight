import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { newCardState, Rating, schedule } from './fsrs';
import { interleave, selectQuestions, type Candidate } from './select';

const T0 = Date.UTC(2026, 3, 1);
const DAY = 86_400_000;

function q(id: string, o: Partial<Candidate> = {}): Candidate {
  return { id, type: 'mcq', difficulty: 2, topicId: 't', ...o };
}

describe('selectQuestions', () => {
  it('puts due reviews first', () => {
    const dueCard = schedule(newCardState(T0 - 10 * DAY), Rating.Good, T0 - 10 * DAY);
    const pool = [q('a'), q('b', { card: dueCard }), q('c')];
    const out = selectQuestions(pool, { count: 2, now: T0 });
    expect(out.map((x) => x.id)).toContain('b');
    expect(out).toHaveLength(2);
  });

  it('returns only due questions in review mode', () => {
    const dueCard = schedule(newCardState(T0 - 10 * DAY), Rating.Good, T0 - 10 * DAY);
    const pool = [q('a'), q('b', { card: dueCard })];
    expect(selectQuestions(pool, { count: 10, now: T0, dueOnly: true }).map((x) => x.id)).toEqual(['b']);
  });

  it('prefers unseen questions near the target difficulty', () => {
    const pool = [q('easy', { difficulty: 1 }), q('hard', { difficulty: 3 }), q('mid', { difficulty: 2 })];
    expect(selectQuestions(pool, { count: 1, now: T0, target: () => 3 })[0]!.id).toBe('hard');
    expect(selectQuestions(pool, { count: 1, now: T0, target: () => 1 })[0]!.id).toBe('easy');
  });

  it('filters by type', () => {
    const pool = [q('a', { type: 'flashcard' }), q('b')];
    expect(selectQuestions(pool, { count: 5, now: T0, types: ['flashcard'] }).map((x) => x.id)).toEqual([
      'a',
    ]);
  });

  it('never repeats or exceeds the count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 20 }),
        fc.boolean(),
        (n, count, hard) => {
          const pool = Array.from({ length: n }, (_, i) =>
            q(String(i), { difficulty: ((i % 3) + 1) as 1 | 2 | 3 }),
          );
          const out = selectQuestions(pool, { count, now: T0, hard });
          return out.length === Math.min(n, count) && new Set(out.map((x) => x.id)).size === out.length;
        },
      ),
    );
  });
});

describe('interleave', () => {
  it('avoids repeating a type when possible', () => {
    const items = [q('1'), q('2'), q('3', { type: 'tf' }), q('4', { type: 'tf' })];
    const out = interleave(items);
    for (let i = 1; i < out.length; i++) expect(out[i]!.type).not.toBe(out[i - 1]!.type);
  });
});

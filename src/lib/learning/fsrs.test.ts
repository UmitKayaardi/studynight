import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  isDue,
  newCardState,
  Rating,
  ratingFor,
  retrievability,
  schedule,
  State,
  type AnswerOutcome,
} from './fsrs';

const T0 = Date.UTC(2026, 0, 1, 10);
const DAY = 86_400_000;

const outcome = (o: Partial<AnswerOutcome>): AnswerOutcome => ({
  type: 'mcq',
  correct: true,
  usedHint: false,
  durationMs: 10_000,
  difficulty: 2,
  ...o,
});

describe('ratingFor', () => {
  it('maps wrong answers to Again', () => {
    expect(ratingFor(outcome({ correct: false }))).toBe(Rating.Again);
  });
  it('maps correct after a hint to Hard', () => {
    expect(ratingFor(outcome({ usedHint: true }))).toBe(Rating.Hard);
  });
  it('maps a normal correct answer to Good', () => {
    expect(ratingFor(outcome({}))).toBe(Rating.Good);
  });
  it('maps a fast correct answer on an easy question to Easy', () => {
    expect(ratingFor(outcome({ difficulty: 1, durationMs: 3_000 }))).toBe(Rating.Easy);
    expect(ratingFor(outcome({ difficulty: 2, durationMs: 3_000 }))).toBe(Rating.Good);
  });
  it('uses the flashcard self-grade directly', () => {
    expect(ratingFor(outcome({ type: 'flashcard', selfGrade: 'again' }))).toBe(Rating.Again);
    expect(ratingFor(outcome({ type: 'flashcard', selfGrade: 'hard' }))).toBe(Rating.Hard);
    expect(ratingFor(outcome({ type: 'flashcard', selfGrade: 'good' }))).toBe(Rating.Good);
    expect(ratingFor(outcome({ type: 'flashcard', selfGrade: 'easy' }))).toBe(Rating.Easy);
  });
  it('grades explain answers by key-point coverage', () => {
    expect(ratingFor(outcome({ type: 'explain', score: 1 }))).toBe(Rating.Good);
    expect(ratingFor(outcome({ type: 'explain', score: 0.5 }))).toBe(Rating.Hard);
    expect(ratingFor(outcome({ type: 'explain', score: 0.2 }))).toBe(Rating.Again);
  });
  it('never returns Easy for an incorrect or hinted answer', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 60_000 }),
        fc.constantFrom(1, 2, 3),
        (correct, usedHint, durationMs, difficulty) => {
          const r = ratingFor(
            outcome({ correct, usedHint, durationMs, difficulty: difficulty as 1 | 2 | 3 }),
          );
          if (!correct) return r === Rating.Again;
          if (usedHint) return r === Rating.Hard;
          return r === Rating.Good || r === Rating.Easy;
        },
      ),
    );
  });
});

describe('scheduling', () => {
  it('starts new cards as New with zero retrievability', () => {
    const c = newCardState(T0);
    expect(c.state).toBe(State.New);
    expect(retrievability(c, T0)).toBe(0);
    expect(isDue(c, T0)).toBe(false);
  });

  it('schedules Again sooner than Good, and Good no later than Easy', () => {
    const c = newCardState(T0);
    const again = schedule(c, Rating.Again, T0);
    const good = schedule(c, Rating.Good, T0);
    const easy = schedule(c, Rating.Easy, T0);
    expect(again.due).toBeLessThanOrEqual(good.due);
    expect(good.due).toBeLessThanOrEqual(easy.due);
    expect(again.reps).toBe(1);
  });

  it('grows intervals with repeated Good answers', () => {
    let c = newCardState(T0);
    let now = T0;
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      const next = schedule(c, Rating.Good, now);
      intervals.push(next.due - now);
      now = next.due;
      c = next;
    }
    expect(intervals.at(-1)!).toBeGreaterThan(intervals[2]!);
    expect(c.state).toBe(State.Review);
  });

  it('becomes due at its due time and loses retrievability over time', () => {
    let c = schedule(newCardState(T0), Rating.Easy, T0);
    expect(isDue(c, c.due - 1)).toBe(false);
    expect(isDue(c, c.due)).toBe(true);
    c = schedule(c, Rating.Good, c.due);
    const r1 = retrievability(c, c.due - 1 * DAY);
    const r2 = retrievability(c, c.due + 30 * DAY);
    expect(r1).toBeGreaterThan(r2);
    expect(r1).toBeLessThanOrEqual(1);
    expect(r2).toBeGreaterThanOrEqual(0);
  });

  it('counts lapses after forgetting a review card', () => {
    let c = schedule(newCardState(T0), Rating.Easy, T0);
    c = schedule(c, Rating.Again, c.due);
    expect(c.lapses).toBe(1);
  });
});

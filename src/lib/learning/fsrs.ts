/**
 * FSRS spaced repetition via ts-fsrs. Card state is stored per question as plain numbers (IndexedDB friendly).
 * Answer outcomes are mapped to FSRS ratings by code — never by the model.
 */
import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { QuestionType } from '../../../shared/question';

export { Rating, State };

export interface CardState {
  due: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview: number | null;
}

// Fuzz is off so scheduling is deterministic and testable.
const scheduler = fsrs({ enable_fuzz: false, request_retention: 0.9, maximum_interval: 365 });

function toCard(s: CardState): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.lastReview === null ? undefined : new Date(s.lastReview),
  };
}

function fromCard(c: Card): CardState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ? c.last_review.getTime() : null,
  };
}

export function newCardState(now: number): CardState {
  return fromCard(createEmptyCard(new Date(now)));
}

/** Schedules the next review after an answer with the given rating. */
export function schedule(state: CardState, rating: Grade, now: number): CardState {
  return fromCard(scheduler.next(toCard(state), new Date(now), rating).card);
}

/** Probability of recall now (0 for cards never reviewed). */
export function retrievability(state: CardState | undefined, now: number): number {
  if (!state || state.state === State.New || state.lastReview === null) return 0;
  const r = scheduler.retrievability(toCard(state), new Date(now));
  return Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0;
}

export function isDue(state: CardState | undefined, now: number): boolean {
  return !!state && state.state !== State.New && state.due <= now;
}

export type SelfGrade = 'again' | 'hard' | 'good' | 'easy';

export interface AnswerOutcome {
  type: QuestionType;
  correct: boolean;
  /** For "explain" questions: share of key points covered (0..1). */
  score?: number;
  usedHint: boolean;
  durationMs: number;
  difficulty: 1 | 2 | 3;
  /** Flashcards: the learner's own grade, used directly. */
  selfGrade?: SelfGrade;
}

/** Answers faster than this (per type) on an easy question count as "Easy". */
const FAST_MS: Record<QuestionType, number> = {
  mcq: 6_000,
  tf: 4_000,
  fill: 9_000,
  flashcard: 5_000,
  match: 15_000,
  order: 15_000,
  explain: 0, // never "fast" — free text
};

/**
 * Maps an answer to an FSRS rating:
 * - flashcards: the learner's self-grade;
 * - wrong → Again; correct after a hint → Hard;
 * - explain: ≥ 80 % key points → Good, ≥ 40 % → Hard, else Again;
 * - fast correct answer on an easy question → Easy; otherwise correct → Good.
 */
export function ratingFor(o: AnswerOutcome): Grade {
  if (o.selfGrade) {
    return { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy }[
      o.selfGrade
    ] as Grade;
  }
  if (o.type === 'explain') {
    const s = o.score ?? (o.correct ? 1 : 0);
    if (s >= 0.8) return o.usedHint ? Rating.Hard : Rating.Good;
    if (s >= 0.4) return Rating.Hard;
    return Rating.Again;
  }
  if (!o.correct) return Rating.Again;
  if (o.usedHint) return Rating.Hard;
  if (o.difficulty === 1 && o.durationMs > 0 && o.durationMs <= FAST_MS[o.type]) return Rating.Easy;
  return Rating.Good;
}

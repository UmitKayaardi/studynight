/**
 * Topic mastery (0–100 %) and adaptive difficulty. Formulas are documented in docs/ARCHITECTURE.md.
 *
 * mastery = 100 × (0.6 × mean retrievability over the topic's active questions + 0.4 × recent accuracy)
 * - retrievability of a never-reviewed question is 0, so coverage is part of the mean;
 * - recent accuracy = share correct over the last 10 answers in the topic (0 when there are none).
 */
import { retrievability, type CardState } from './fsrs';

export const RECENT_WINDOW = 10;

export interface MasteryInput {
  /** Card states of the topic's active (not reported) questions; undefined = never answered. */
  cards: Array<CardState | undefined>;
  /** Most recent answers in the topic, newest last (true = correct). */
  recent: boolean[];
  now: number;
}

export function topicMastery({ cards, recent, now }: MasteryInput): number {
  if (cards.length === 0) return 0;
  const meanR = cards.reduce((s, c) => s + retrievability(c, now), 0) / cards.length;
  const window = recent.slice(-RECENT_WINDOW);
  const acc = window.length ? window.filter(Boolean).length / window.length : 0;
  const m = 100 * (0.6 * meanR + 0.4 * acc);
  return Math.round(Math.min(100, Math.max(0, m)));
}

/** A topic counts as weak below this mastery once it has been practised. */
export const WEAK_THRESHOLD = 50;
/** Boss battle unlocks at this mastery. */
export const BOSS_UNLOCK = 60;

/**
 * Adaptive difficulty: a running skill estimate per topic in [1, 3], nudged after each answer like an Elo
 * rating — the expected success at a question of difficulty d is 1 / (1 + e^(-2(skill − d))), and the skill
 * moves by K × (outcome − expected). Correct answers never lower the skill; wrong answers never raise it.
 */
export const SKILL_MIN = 1;
export const SKILL_MAX = 3;
export const SKILL_START = 1.5;
const K = 0.35;

export function expectedSuccess(skill: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-2 * (skill - difficulty)));
}

export function updateSkill(skill: number, difficulty: number, correct: boolean): number {
  const s = Number.isFinite(skill) ? skill : SKILL_START;
  const next = s + K * ((correct ? 1 : 0) - expectedSuccess(s, difficulty));
  return Math.min(SKILL_MAX, Math.max(SKILL_MIN, next));
}

/** Difficulty to aim for next: the nearest level to the skill estimate. */
export function targetDifficulty(skill: number): 1 | 2 | 3 {
  const d = Math.round(Math.min(SKILL_MAX, Math.max(SKILL_MIN, skill)));
  return d as 1 | 2 | 3;
}

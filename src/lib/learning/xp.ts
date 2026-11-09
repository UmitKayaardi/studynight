/**
 * XP, levels and active study time. All deterministic.
 */
import type { QuestionType } from '../../../shared/question';

export const BASE_XP: Record<QuestionType, number> = {
  tf: 8,
  flashcard: 6,
  mcq: 10,
  fill: 14,
  match: 16,
  order: 16,
  explain: 20,
};
const DIFFICULTY_MULT = { 1: 1, 2: 1.25, 3: 1.5 } as const;

/** Combo bonus: +2 XP per correct answer in a row beyond the second, capped at +10. */
export function comboBonus(combo: number): number {
  return Math.min(10, Math.max(0, combo - 2) * 2);
}

export interface XpInput {
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  correct: boolean;
  /** Explain questions: share of key points covered (0..1). */
  score?: number;
  usedHint: boolean;
  /** Correct answers in a row including this one. */
  combo: number;
  /** Reported questions never earn XP. */
  reported?: boolean;
}

/** XP for one answer. Wrong answers earn nothing; a hint halves the XP; explain answers earn in proportion. */
export function xpForAnswer(i: XpInput): number {
  if (i.reported) return 0;
  const base = BASE_XP[i.type] * DIFFICULTY_MULT[i.difficulty];
  let xp: number;
  if (i.type === 'explain') {
    const s = Math.min(1, Math.max(0, i.score ?? (i.correct ? 1 : 0)));
    xp = base * s;
  } else {
    xp = i.correct ? base : 0;
  }
  if (xp > 0 && i.usedHint) xp /= 2;
  if (xp > 0 && i.correct) xp += comboBonus(i.combo);
  return Math.round(xp);
}

export const BONUS = {
  sessionComplete: 10,
  bossVictory: 50,
  perfectExam: 30,
  dailyGoal: 20,
} as const;

/** Total XP needed to reach a level: 60 × (level − 1)^1.6, rounded. Level 1 starts at 0 XP. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(60 * (level - 1) ** 1.6);
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  progress: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 999) level++;
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  return { level, into: xp - start, span, progress: span ? (xp - start) / span : 0 };
}

/**
 * Active study time from interaction timestamps (ms, any order): the sum of gaps between consecutive
 * interactions, each capped at `idleCapMs`, so idle time does not count.
 */
export function activeMs(timestamps: number[], idleCapMs = 60_000): number {
  const t = timestamps.filter(Number.isFinite).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < t.length; i++) total += Math.min(idleCapMs, t[i]! - t[i - 1]!);
  return total;
}

/** Daily goal options in minutes. */
export const DAILY_GOALS = [5, 10, 20] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

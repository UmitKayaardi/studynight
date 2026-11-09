/**
 * Streaks based on the learner's local calendar date. Days are compared as calendar dates
 * ("YYYY-MM-DD" in the learner's time zone), never as 24-hour spans, so DST changes and
 * travel across time zones cannot break or double-count a day.
 *
 * A day counts towards the streak once the learner finishes at least one answer that day.
 * Streak freezes: one is earned every time the streak reaches a multiple of 7 days (max 2 held);
 * they are used automatically to cover missed days.
 */

export type DayKey = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date of `ms` in `timeZone` (defaults to the device's zone). */
export function dayKey(ms: number, timeZone?: string): DayKey {
  const tz = timeZone ?? 'local';
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Days since the epoch for a day key (calendar arithmetic, time-zone free). */
export function dayIndex(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function keyFromIndex(index: number): DayKey {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(key: DayKey, n: number): DayKey {
  return keyFromIndex(dayIndex(key) + n);
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return dayIndex(to) - dayIndex(from);
}

export interface StreakState {
  current: number;
  best: number;
  lastDay: DayKey | null;
  freezes: number;
  /** Days that were covered by a freeze (for the calendar). */
  frozenDays: DayKey[];
}

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

export const emptyStreak = (): StreakState => ({
  current: 0,
  best: 0,
  lastDay: null,
  freezes: 0,
  frozenDays: [],
});

/** Records study on `today`. Idempotent for the same day; ignores days earlier than the last one. */
export function recordStudyDay(s: StreakState, today: DayKey): StreakState {
  if (s.lastDay === today) return s;
  let { current, freezes } = s;
  const frozenDays = s.frozenDays.slice();
  if (s.lastDay === null) {
    current = 1;
  } else {
    const gap = daysBetween(s.lastDay, today);
    if (gap <= 0) return s; // clock moved backwards: keep state
    const missed = gap - 1;
    if (missed === 0) current += 1;
    else if (missed <= freezes) {
      freezes -= missed;
      for (let i = 1; i <= missed; i++) frozenDays.push(addDays(s.lastDay, i));
      current += 1;
    } else current = 1;
  }
  if (current > 0 && current % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
  return {
    current,
    best: Math.max(s.best, current),
    lastDay: today,
    freezes,
    frozenDays: frozenDays.slice(-60),
  };
}

export type StreakStatus = 'none' | 'done-today' | 'at-risk' | 'lost';

/**
 * Streak as shown on `today` without recording study: a streak is still alive if the missed days since the last
 * study day can be covered by freezes; it is "at risk" when today has not been studied yet.
 */
export function streakStatus(s: StreakState, today: DayKey): { status: StreakStatus; current: number } {
  if (!s.lastDay || s.current === 0) return { status: 'none', current: 0 };
  const gap = daysBetween(s.lastDay, today);
  if (gap <= 0) return { status: 'done-today', current: s.current };
  if (gap - 1 <= s.freezes) return { status: 'at-risk', current: s.current };
  return { status: 'lost', current: 0 };
}

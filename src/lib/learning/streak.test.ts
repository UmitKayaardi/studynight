import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, dayIndex, dayKey, daysBetween, emptyStreak, recordStudyDay, streakStatus } from './streak';

describe('dayKey', () => {
  it('uses the given time zone', () => {
    const t = Date.UTC(2026, 0, 1, 23, 30); // 23:30 UTC on 1 Jan
    expect(dayKey(t, 'UTC')).toBe('2026-01-01');
    expect(dayKey(t, 'Europe/Istanbul')).toBe('2026-01-02'); // UTC+3
    expect(dayKey(t, 'America/New_York')).toBe('2026-01-01');
  });

  it('handles DST transitions (London, spring forward and fall back)', () => {
    // 29 March 2026: clocks go forward at 01:00 UTC. 25 October 2026: back at 01:00 UTC.
    expect(dayKey(Date.UTC(2026, 2, 28, 23, 59), 'Europe/London')).toBe('2026-03-28');
    expect(dayKey(Date.UTC(2026, 2, 29, 0, 30), 'Europe/London')).toBe('2026-03-29');
    expect(dayKey(Date.UTC(2026, 2, 29, 22, 59), 'Europe/London')).toBe('2026-03-29');
    expect(dayKey(Date.UTC(2026, 2, 29, 23, 0), 'Europe/London')).toBe('2026-03-30');
    expect(dayKey(Date.UTC(2026, 9, 24, 23, 0), 'Europe/London')).toBe('2026-10-25');
    expect(dayKey(Date.UTC(2026, 9, 25, 23, 30), 'Europe/London')).toBe('2026-10-25');
  });

  it('gives consecutive keys exactly one day apart across a whole year in several zones', () => {
    for (const tz of ['Europe/London', 'America/New_York', 'Australia/Sydney', 'Asia/Kolkata']) {
      let prev = dayKey(Date.UTC(2026, 0, 1, 12), tz);
      for (let h = 0; h < 366 * 24; h += 1) {
        const k = dayKey(Date.UTC(2026, 0, 1, 12) + h * 3_600_000, tz);
        if (k !== prev) {
          expect(daysBetween(prev, k)).toBe(1);
          prev = k;
        }
      }
    }
  });
});

describe('day arithmetic', () => {
  it('round-trips', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60_000 }), fc.integer({ min: -400, max: 400 }), (i, n) => {
        const k = addDays('2000-01-01', i);
        return daysBetween(k, addDays(k, n)) === n && dayIndex(k) === dayIndex('2000-01-01') + i;
      }),
    );
  });
});

describe('streaks', () => {
  it('starts, continues and resets', () => {
    let s = recordStudyDay(emptyStreak(), '2026-03-01');
    expect(s.current).toBe(1);
    s = recordStudyDay(s, '2026-03-01');
    expect(s.current).toBe(1);
    s = recordStudyDay(s, '2026-03-02');
    expect(s.current).toBe(2);
    s = recordStudyDay(s, '2026-03-05');
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });

  it('earns a freeze every 7 days, max 2, and uses it automatically', () => {
    let s = emptyStreak();
    for (let i = 0; i < 21; i++) s = recordStudyDay(s, addDays('2026-01-01', i));
    expect(s.current).toBe(21);
    expect(s.freezes).toBe(2);
    // Miss two days: both covered.
    s = recordStudyDay(s, addDays('2026-01-01', 23));
    expect(s.current).toBe(22);
    expect(s.freezes).toBe(0);
    expect(s.frozenDays).toEqual(['2026-01-22', '2026-01-23']);
  });

  it('reports status', () => {
    const s = recordStudyDay(emptyStreak(), '2026-03-01');
    expect(streakStatus(s, '2026-03-01').status).toBe('done-today');
    expect(streakStatus(s, '2026-03-02').status).toBe('at-risk');
    expect(streakStatus(s, '2026-03-03')).toEqual({ status: 'lost', current: 0 });
    expect(streakStatus(emptyStreak(), '2026-03-03').status).toBe('none');
  });

  it('ignores a clock moving backwards', () => {
    const s = recordStudyDay(recordStudyDay(emptyStreak(), '2026-03-02'), '2026-03-01');
    expect(s.lastDay).toBe('2026-03-02');
  });

  it('keeps invariants for any study pattern', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 80 }), (gaps) => {
        let s = emptyStreak();
        let day = '2026-01-01';
        for (const g of gaps) {
          day = addDays(day, g);
          s = recordStudyDay(s, day);
          if (s.current < 1 || s.best < s.current || s.freezes < 0 || s.freezes > 2) return false;
        }
        return true;
      }),
    );
  });
});

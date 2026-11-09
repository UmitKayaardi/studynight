import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  BADGE_IDS,
  emptyStats,
  newBadges,
  predictedBand,
  sessionTitle,
  TITLE_IDS,
  type SessionSummary,
} from './badges';

describe('badges', () => {
  it('awards nothing for empty stats', () => expect(newBadges(emptyStats(), [])).toEqual([]));

  it('awards badges by rule and skips owned ones', () => {
    const s = {
      ...emptyStats(),
      decksCreated: 1,
      questionsAnswered: 120,
      bestStreak: 8,
      quizLanguages: ['en', 'tr'],
    };
    expect(newBadges(s, [])).toEqual(['firstDeck', 'firstQuiz', 'streak7', 'questions100', 'polyglot']);
    expect(newBadges(s, ['firstDeck', 'polyglot'])).toEqual(['firstQuiz', 'streak7', 'questions100']);
  });

  it('does not count the same language twice for polyglot', () => {
    expect(newBadges({ ...emptyStats(), quizLanguages: ['en', 'en'] }, [])).not.toContain('polyglot');
  });

  it('has around 20 badges with unique ids', () => {
    expect(new Set(BADGE_IDS).size).toBe(BADGE_IDS.length);
    expect(BADGE_IDS.length).toBeGreaterThanOrEqual(20);
  });
});

const answer = (correct: boolean, durationMs = 15_000, topicId = 't1', usedHint = false) => ({
  correct,
  durationMs,
  topicId,
  usedHint,
});
const session = (o: Partial<SessionSummary>): SessionSummary => ({
  answers: [],
  bestCombo: 0,
  mode: 'quick',
  hour: 14,
  isFirstSession: false,
  ...o,
});

describe('sessionTitle', () => {
  it('picks specific titles', () => {
    expect(sessionTitle(session({ mode: 'boss', bossWon: true }))).toBe('bossSlayer');
    expect(sessionTitle(session({ answers: Array(5).fill(answer(true)) }))).toBe('perfectionist');
    expect(sessionTitle(session({ answers: [answer(false)], isFirstSession: true }))).toBe('freshStart');
    expect(
      sessionTitle(session({ answers: [...Array(4).fill(answer(true, 3000)), answer(false, 3000)] })),
    ).toBe('speedReader');
    expect(
      sessionTitle(
        session({ answers: [answer(false), answer(false), answer(true), ...Array(7).fill(answer(true))] }),
      ),
    ).toBe('comebackKid');
    expect(sessionTitle(session({ answers: [answer(false)], hour: 23 }))).toBe('nightOwlMode');
    expect(sessionTitle(session({ answers: [answer(false), answer(false)] }))).toBe('neverGiveUp');
  });

  it('always returns a known title', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.boolean(), fc.nat(90_000), fc.constantFrom('a', 'b', 'c'), fc.boolean()), {
          maxLength: 40,
        }),
        fc.nat(20),
        fc.integer({ min: 0, max: 23 }),
        fc.boolean(),
        (as, combo, hour, first) => {
          const t = sessionTitle(
            session({
              answers: as.map(([c, d, tp, h]) => answer(c, d, tp, h)),
              bestCombo: combo,
              hour,
              isFirstSession: first,
            }),
          );
          return (TITLE_IDS as readonly string[]).includes(t);
        },
      ),
    );
  });
});

describe('predictedBand', () => {
  it('is a valid band within 0–100 that narrows with more questions', () => {
    const a = predictedBand(0.8, 0.7, 10);
    const b = predictedBand(0.8, 0.7, 40);
    expect(a.low).toBeLessThan(a.high);
    expect(b.high - b.low).toBeLessThan(a.high - a.low);
    fc.assert(
      fc.property(fc.double({ noNaN: false }), fc.double(), fc.nat(100), (x, y, n) => {
        const r = predictedBand(x, y, n);
        return r.low >= 0 && r.high <= 100 && r.low <= r.high;
      }),
    );
  });
});

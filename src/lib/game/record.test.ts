import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { createDeck, getProfile } from '../../db/repo';
import { bumpStat, finishSession, recordAnswer, revokeXp } from './record';
import { State } from '../learning/fsrs';

const NOW = Date.UTC(2026, 4, 10, 14);

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

async function setup() {
  const deck = await createDeck({ title: 'D', quizLanguage: 'tr', examDate: null });
  await db.topics.add({
    id: `${deck.id}:t1`,
    deckId: deck.id,
    key: 't1',
    order: 0,
    title: 'T',
    summary: '',
    chunkIds: [],
    skill: 1.5,
    status: 'ready',
    emptyRounds: 0,
  });
  return deck;
}

const answer = (deckId: string, o: Partial<Parameters<typeof recordAnswer>[0]> = {}) =>
  recordAnswer({
    questionId: 'q1',
    deckId,
    topicId: `${deckId}:t1`,
    type: 'mcq',
    difficulty: 2,
    correct: true,
    score: 1,
    usedHint: false,
    durationMs: 9000,
    activeMs: 9000,
    combo: 1,
    mode: 'quick',
    quizLanguage: 'tr',
    now: NOW,
    ...o,
  });

describe('recordAnswer', () => {
  it('updates the card, review log, skill, day, XP, stats and streak together', async () => {
    const deck = await setup();
    const r = await answer(deck.id);
    expect(r.xp).toBe(13); // 10 × 1.25
    const card = await db.cardStates.get('q1');
    expect(card?.state).not.toBe(State.New);
    expect(await db.reviews.count()).toBe(1);
    expect((await db.topics.get(`${deck.id}:t1`))!.skill).toBeGreaterThan(1.5);
    const p = await getProfile();
    expect(p).toMatchObject({ xp: 13, streak: { current: 1 } });
    expect(p.stats).toMatchObject({ questionsAnswered: 1, correctAnswers: 1, quizLanguages: ['tr'] });
    expect((await db.days.toArray())[0]).toMatchObject({ answered: 1, correct: 1, activeMs: 9000, xp: 13 });
  });

  it('gives no XP and lowers skill for a wrong answer', async () => {
    const deck = await setup();
    const r = await answer(deck.id, { correct: false, score: 0 });
    expect(r.xp).toBe(0);
    expect((await db.topics.get(`${deck.id}:t1`))!.skill).toBeLessThan(1.5);
  });

  it('revokes XP for reported questions', async () => {
    const deck = await setup();
    await answer(deck.id);
    await revokeXp(13, NOW);
    expect((await getProfile()).xp).toBe(0);
  });
});

describe('finishSession', () => {
  it('awards the daily goal once, a session bonus, badges and a title', async () => {
    const deck = await setup();
    // 10 minutes of active study meets the default goal.
    for (let k = 0; k < 5; k++) await answer(deck.id, { questionId: `q${k}`, activeMs: 120_000 });
    const answers = Array.from({ length: 5 }, () => ({
      correct: true,
      durationMs: 9000,
      usedHint: false,
      topicId: 't',
    }));
    const res = await finishSession({
      deckId: deck.id,
      mode: 'quick',
      startedAt: NOW - 60_000,
      answers,
      xp: 65,
      bestCombo: 5,
      activeMs: 600_000,
      daysAway: 0,
      isFirstSession: true,
      now: NOW,
    });
    expect(res.goalJustMet).toBe(true);
    expect(res.bonusXp).toBe(30);
    expect(res.title).toBe('perfectionist');
    expect(res.newBadges).toContain('firstQuiz');
    const again = await finishSession({
      deckId: deck.id,
      mode: 'quick',
      startedAt: NOW,
      answers,
      xp: 0,
      bestCombo: 0,
      activeMs: 0,
      daysAway: 0,
      isFirstSession: false,
      now: NOW,
    });
    expect(again.goalJustMet).toBe(false);
    expect(await db.sessions.count()).toBe(2);
    expect((await db.decks.get(deck.id))!.lastPlayedAt).toBe(NOW);
  });

  it('tracks sudden-death personal bests per deck', async () => {
    const deck = await setup();
    const base = {
      deckId: deck.id,
      mode: 'sudden' as const,
      startedAt: NOW,
      answers: [],
      xp: 0,
      bestCombo: 0,
      activeMs: 0,
      daysAway: 0,
      isFirstSession: false,
      now: NOW,
    };
    expect((await finishSession({ ...base, suddenDeathScore: 7 })).newBestSuddenDeath).toBe(true);
    expect((await finishSession({ ...base, suddenDeathScore: 5 })).newBestSuddenDeath).toBe(false);
    expect((await db.decks.get(deck.id))!.bestSuddenDeath).toBe(7);
  });

  it('awards action badges', async () => {
    expect(await bumpStat('decksCreated')).toEqual(['firstDeck']);
    expect(await bumpStat('decksCreated')).toEqual([]);
  });
});

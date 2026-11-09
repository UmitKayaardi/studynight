import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  activeQuestions,
  addQuestions,
  createDeck,
  deckChunks,
  deleteDeck,
  getProfile,
  getSettings,
  listDecks,
  reportQuestion,
  restoreDeck,
  setSetting,
  undoReport,
  updateProfile,
  DEFAULT_SETTINGS,
} from './repo';
import type { QuestionContent } from '../../shared/question';

const q = (prompt: string): QuestionContent => ({
  type: 'flashcard',
  prompt,
  back: 'Answer',
  explanation: 'Because.',
  hint: 'Think.',
  difficulty: 1,
  topicId: 't',
  sourceChunkIds: ['c1'],
  evidenceQuote: 'Answer',
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('profile and settings', () => {
  it('creates a default profile once and updates it', async () => {
    const p = await getProfile();
    expect(p).toMatchObject({ id: 'me', xp: 0, onboarded: false, dailyGoalMinutes: 10 });
    await updateProfile({ nickname: 'Ada', xp: 50 });
    expect(await getProfile()).toMatchObject({ nickname: 'Ada', xp: 50, createdAt: p.createdAt });
  });

  it('returns defaults and stores changes', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await setSetting('theme', 'dark');
    await setSetting('language', 'ar');
    expect(await getSettings()).toMatchObject({ theme: 'dark', language: 'ar', sound: true });
  });
});

describe('decks', () => {
  it('deletes a deck with everything derived from it, and restores it on undo', async () => {
    const deck = await createDeck({ title: 'Biology', quizLanguage: 'auto', examDate: null });
    const other = await createDeck({ title: 'Other', quizLanguage: 'auto', examDate: null });
    await db.chunks.bulkAdd([
      {
        id: 'c1',
        deckId: deck.id,
        index: 0,
        text: 'x',
        headingPath: [],
        refs: [],
        wordCount: 1,
        vector: new Float32Array([1, 0]),
      },
      { id: 'c2', deckId: other.id, index: 0, text: 'y', headingPath: [], refs: [], wordCount: 1 },
    ]);
    const [question] = await addQuestions(deck.id, `${deck.id}:t1`, [q('What?')]);
    await db.reviews.add({
      questionId: question!.id,
      deckId: deck.id,
      topicId: 't',
      at: 1,
      day: '2026-01-01',
      correct: true,
      score: null,
      rating: 3,
      durationMs: 1,
      usedHint: false,
      mode: 'quick',
    });

    const snap = await deleteDeck(deck.id);
    expect(snap?.chunks).toHaveLength(1);
    expect(await db.decks.get(deck.id)).toBeUndefined();
    expect(await db.chunks.where('deckId').equals(deck.id).count()).toBe(0);
    expect(await db.questions.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
    expect(await db.chunks.get('c2')).toBeDefined();

    await restoreDeck(snap!);
    expect(Array.from((await deckChunks(deck.id))[0]!.vector!)).toEqual([1, 0]);
    expect(await db.questions.count()).toBe(1);
    expect((await listDecks()).map((d) => d.title).sort()).toEqual(['Biology', 'Other']);
  });

  it('returns null when deleting a missing deck', async () => {
    expect(await deleteDeck('nope')).toBeNull();
  });
});

describe('questions', () => {
  it('removes reported questions from play and restores them on undo', async () => {
    const deck = await createDeck({ title: 'D', quizLanguage: 'en', examDate: null });
    const rows = await addQuestions(deck.id, 'T', [q('One?'), q('Two?')]);
    await reportQuestion(rows[0]!.id, 'wrong');
    expect((await activeQuestions(deck.id)).map((r) => r.content.prompt)).toEqual(['Two?']);
    expect((await activeQuestions(deck.id, 'T')).length).toBe(1);
    await undoReport(rows[0]!.id);
    expect(await activeQuestions(deck.id)).toHaveLength(2);
  });
});

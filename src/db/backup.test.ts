// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { addQuestions, createDeck, getProfile, setSetting, updateDeck } from './repo';
import { backupFileName, exportBackup, importBackup, parseBackup } from './backup';
import { deleteAllData } from './storage';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

async function seed() {
  const deck = await createDeck({ title: 'Space', quizLanguage: 'en', examDate: '2026-12-01' });
  await updateDeck(deck.id, { status: 'ready', embedState: 'done' });
  await db.chunks.add({
    id: 'c1',
    deckId: deck.id,
    index: 0,
    text: 'The Sun is a star.',
    headingPath: ['Sun'],
    refs: [{ sourceId: 's1', page: 1, headingPath: [] }],
    wordCount: 5,
    vector: new Float32Array([0.6, 0.8]),
  });
  await db.images.add({
    id: 'i1',
    deckId: deck.id,
    sourceId: 's1',
    page: 2,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
    hasFigure: true,
    description: 'A diagram.',
  });
  await addQuestions(deck.id, `${deck.id}:t1`, [
    {
      type: 'tf',
      prompt: 'The Sun is a planet.',
      answer: false,
      correction: 'The Sun is a star.',
      explanation: 'Stated.',
      hint: 'Look up.',
      difficulty: 1,
      topicId: `${deck.id}:t1`,
      sourceChunkIds: ['c1'],
      evidenceQuote: 'The Sun is a star.',
    },
  ]);
  await getProfile();
  await setSetting('theme', 'dark');
  return deck;
}

describe('backup', () => {
  it('round-trips all data, excluding embeddings', async () => {
    const deck = await seed();
    const backup = await exportBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toContain('vector');
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview).toMatchObject({ decks: 1, questions: 1 });

    await deleteAllData();
    await db.open();
    expect(await db.decks.count()).toBe(0);

    await importBackup(parsed.backup);
    const restored = await db.decks.get(deck.id);
    expect(restored).toMatchObject({ title: 'Space', embedState: 'pending' });
    expect(await db.questions.count()).toBe(1);
    expect((await db.chunks.get('c1'))?.vector).toBeUndefined();
    const img = await db.images.get('i1');
    expect(img?.description).toBe('A diagram.');
    expect(img?.blob.size).toBe(3);
    expect((await db.settings.get('theme'))?.value).toBe('dark');
  });

  it('rejects malformed or tampered files without throwing', async () => {
    await seed();
    const good = await exportBackup();
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...good, format: 99 })).ok).toBe(false);
    const orphan = structuredClone(good);
    orphan.data.questions[0]!.deckId = 'other';
    expect(parseBackup(JSON.stringify(orphan)).ok).toBe(false);
    const badQuestion = structuredClone(good) as unknown as {
      data: { questions: Array<{ content: { type: string } }> };
    };
    badQuestion.data.questions[0]!.content.type = 'script';
    expect(parseBackup(JSON.stringify(badQuestion)).ok).toBe(false);
  });

  it('names files by date', () => {
    expect(backupFileName(new Date('2026-05-04T10:00:00Z'))).toBe('studynight-backup-2026-05-04.studynight');
  });
});

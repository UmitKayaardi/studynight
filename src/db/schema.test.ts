import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V1, StudyNightDB } from './schema';

const NAME = 'schema-test';
afterEach(async () => {
  await Dexie.delete(NAME);
});

describe('schema migrations', () => {
  it('opens a fresh database at the latest version', async () => {
    const db = new StudyNightDB(NAME);
    await db.open();
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toContain('days');
    db.close();
  });

  it('migrates v1 → v2 and backfills daily activity from reviews without losing data', async () => {
    const v1 = new Dexie(NAME);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('decks').add({ id: 'd1', title: 'Old deck' });
    await v1.table('reviews').bulkAdd([
      {
        questionId: 'q1',
        deckId: 'd1',
        topicId: 't',
        at: Date.UTC(2026, 0, 5, 12),
        day: '2026-01-05',
        correct: true,
        durationMs: 10_000,
      },
      {
        questionId: 'q2',
        deckId: 'd1',
        topicId: 't',
        at: Date.UTC(2026, 0, 5, 13),
        day: '2026-01-05',
        correct: false,
        durationMs: 500_000,
      },
      {
        questionId: 'q1',
        deckId: 'd1',
        topicId: 't',
        at: Date.UTC(2026, 0, 6, 9),
        day: '2026-01-06',
        correct: true,
        durationMs: 5_000,
      },
    ]);
    v1.close();

    const db = new StudyNightDB(NAME);
    await db.open();
    expect(await db.decks.get('d1')).toMatchObject({ title: 'Old deck' });
    expect(await db.reviews.count()).toBe(3);
    expect(await db.days.get('2026-01-05')).toMatchObject({ answered: 2, correct: 1, activeMs: 130_000 });
    expect(await db.days.get('2026-01-06')).toMatchObject({ answered: 1, correct: 1 });
    db.close();
  });
});

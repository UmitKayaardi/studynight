import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createDeck, getProfile } from './repo';
import { deleteAllData, isQuotaError } from './storage';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

const seed = async () => {
  await createDeck({ title: 'Space', quizLanguage: 'en', examDate: null });
  await getProfile();
};

describe('storage', () => {
  it('detects quota errors', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'X', inner: { name: 'QuotaExceededError' } })).toBe(true);
    expect(isQuotaError(new Error('x'))).toBe(false);
  });

  it('deletes everything including preferences', async () => {
    await seed();
    localStorage.setItem('sn-theme', 'dark');
    await deleteAllData();
    expect(localStorage.getItem('sn-theme')).toBeNull();
    await db.open();
    expect(await db.decks.count()).toBe(0);
    expect(await db.profile.count()).toBe(0);
  });
});

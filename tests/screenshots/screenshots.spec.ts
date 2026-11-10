/** README screenshots from the sample decks, light and dark. Output: docs/screenshots/<name>-<theme>.png */
import { expect, test, type Page } from '@playwright/test';
import { answer, currentQuestion, mockApi, next, openSample } from '../e2e/helpers';

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/screenshots';
const DAY = 86_400_000;

/** Seeds a lived-in profile: streak, badges, 12 weeks of activity and a well-practised first topic. */
async function seed(page: Page, language: string, theme: string) {
  await page.evaluate(
    async ({ language, theme, DAY }) => {
      const open = indexedDB.open('studynight');
      const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)));
      const all = <T>(store: string) =>
        new Promise<T[]>((res) => {
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => res(r.result as T[]);
        });
      const now = Date.now();
      const key = (t: number) => new Date(t).toLocaleDateString('en-CA');
      const decks = await all<{ id: string; title: string }>('decks');
      const deck = decks.find((d) => d.title === 'The Solar System')!;
      const topics = (await all<{ id: string; deckId: string; order: number }>('topics'))
        .filter((t) => t.deckId === deck.id)
        .sort((a, b) => a.order - b.order);
      const qs = (await all<{ id: string; topicId: string }>('questions')).filter(
        (q) => q.topicId === topics[0]!.id,
      );
      const tx = db.transaction(
        ['profile', 'badges', 'days', 'cardStates', 'reviews', 'settings', 'exams'],
        'readwrite',
      );
      tx.objectStore('profile').put({
        id: 'me',
        nickname: 'Maya',
        avatar: 6,
        mascotTheme: 0,
        createdAt: now - 90 * DAY,
        xp: 1840,
        dailyGoalMinutes: 10,
        streak: {
          current: 12,
          best: 21,
          lastDay: key(now - DAY),
          freezes: 1,
          frozenDays: [key(now - 20 * DAY)],
        },
        stats: {
          decksCreated: 3,
          questionsAnswered: 412,
          correctAnswers: 338,
          bossWins: 1,
          perfectExams: 0,
          bestStreak: 21,
          quizLanguages: ['en', 'tr'],
          bestCombo: 11,
          bestSuddenDeath: 14,
          flashcardsReviewed: 64,
          greatExplains: 4,
          questionsAsked: 6,
          challengesSent: 1,
          examsPlanned: 1,
          level: 7,
          bestDayMinutes: 48,
          nightSessions: 3,
          earlySessions: 0,
          comebacks: 0,
        },
        onboarded: true,
      });
      for (const [id, d] of [
        ['firstDeck', 80],
        ['firstQuiz', 80],
        ['firstBoss', 30],
        ['streak7', 40],
        ['questions100', 50],
        ['polyglot', 20],
        ['combo10', 10],
        ['challenger', 5],
        ['planner', 3],
        ['nightSession', 12],
      ] as const)
        tx.objectStore('badges').put({ id, earnedAt: now - d * DAY });
      for (let i = 1; i < 84; i++) {
        const pattern = (i * 7) % 11;
        if (pattern < 3) continue;
        const activeMs = (pattern * 4 + 2) * 60_000;
        tx.objectStore('days').put({
          day: key(now - i * DAY),
          activeMs,
          answered: pattern * 3,
          correct: pattern * 2,
          xp: pattern * 20,
          goalMet: activeMs >= 600_000,
        });
      }
      for (const q of qs) {
        tx.objectStore('cardStates').put({
          questionId: q.id,
          deckId: deck.id,
          topicId: q.topicId,
          due: now + 6 * DAY,
          stability: 12,
          difficulty: 4,
          scheduledDays: 6,
          learningSteps: 0,
          reps: 3,
          lapses: 0,
          state: 2,
          lastReview: now - 3_600_000,
        });
        tx.objectStore('reviews').add({
          questionId: q.id,
          deckId: deck.id,
          topicId: q.topicId,
          at: now - 3_600_000,
          day: key(now),
          correct: true,
          score: null,
          rating: 3,
          durationMs: 9000,
          usedHint: false,
          mode: 'quick',
        });
      }
      tx.objectStore('exams').put({
        id: 'exam-1',
        deckId: deck.id,
        title: 'Astronomy',
        date: key(now + 12 * DAY),
        createdAt: now,
      });
      tx.objectStore('settings').put({ key: 'language', value: language });
      tx.objectStore('settings').put({ key: 'theme', value: theme });
      tx.objectStore('settings').put({ key: 'smartSearch', value: 'off' });
      await new Promise((res) => (tx.oncomplete = res));
      db.close();
      localStorage.setItem('sn-theme', theme);
    },
    { language, theme, DAY },
  );
}

async function shot(page: Page, name: string, theme: string) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
}

async function setup(page: Page, theme: string, language = 'en') {
  await mockApi(page, {
    topics: async () => {
      /* never answers: keeps the processing screen on screen */
    },
  });
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Just look around' }).click();
  await openSample(page);
  const deckUrl = page.url();
  await seed(page, language, theme);
  await page.goto('/');
  return deckUrl;
}

/** Answers questions until the current one has the wanted type (answers others correctly). */
async function playUntil(page: Page, type: string) {
  for (let i = 0; i < 30; i++) {
    await expect(page.getByTestId('prompt')).toBeVisible();
    const q = await currentQuestion(page);
    if (q?.type === type) return;
    await answer(page, true);
    await next(page);
  }
  throw new Error(`no ${type} question found`);
}

for (const theme of ['light', 'dark']) {
  test(`screens (${theme})`, async ({ page }) => {
    const deckUrl = await setup(page, theme);
    await expect(page.getByText('Maya')).toBeVisible();
    await shot(page, '01-home', theme);

    await page.goto('/new');
    await shot(page, '02-upload', theme);
    await page.getByRole('button', { name: 'Paste text instead' }).click();
    await page
      .getByLabel('Your text')
      .fill('Rivers carry water from the land to the sea and shape valleys over time.');
    await page.getByLabel('Deck title').fill('Rivers');
    await page.getByRole('button', { name: 'Create my quiz' }).click();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await shot(page, '03-processing', theme);

    await page.goto(deckUrl);
    await page.getByRole('heading', { name: 'Topic map' }).scrollIntoViewIfNeeded();
    await shot(page, '04-deck', theme);

    await page.getByRole('button', { name: /^Quick play/ }).click();
    await playUntil(page, 'mcq');
    await shot(page, '05-question', theme);
    await answer(page, true);
    await page
      .getByRole('button', { name: /From your notes/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await shot(page, '06-source', theme);
    await page.keyboard.press('Escape');
    await next(page);

    await page.goto(deckUrl);
    const explainTopic = await page.evaluate(async () => {
      const open = indexedDB.open('studynight');
      const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)));
      const get = <T>(s: string) =>
        new Promise<T[]>((res) => {
          const r = db.transaction(s).objectStore(s).getAll();
          r.onsuccess = () => res(r.result as T[]);
        });
      const topics = (await get<{ id: string; title: string; order: number; deckId: string }>('topics')).sort(
        (a, b) => a.order - b.order,
      );
      const qs = await get<{ topicId: string; content: { type: string } }>('questions');
      db.close();
      const deckTopics = topics.filter(
        (t) =>
          t.deckId ===
          topics.find((x) => qs.some((q) => q.topicId === x.id && q.content.type === 'explain'))?.deckId,
      );
      return deckTopics.findIndex((t) => qs.some((q) => q.topicId === t.id && q.content.type === 'explain'));
    });
    await page.getByRole('button', { name: /^Practise a topic/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button')
      .nth(1 + Math.max(0, explainTopic))
      .click();
    await playUntil(page, 'explain');
    await answer(page, true);
    await expect(page.getByText(/You covered/)).toBeVisible();
    await shot(page, '07-explain', theme);

    await page.goto(deckUrl);
    await page.getByRole('button', { name: /^Boss battle/ }).click();
    await page.getByRole('dialog').getByRole('button').nth(1).click();
    await expect(page.getByRole('img', { name: '3 hearts left' })).toBeVisible();
    await shot(page, '08-boss', theme);

    await page.goto(deckUrl);
    await page.getByRole('button', { name: /^Sudden death/ }).click();
    for (let i = 0; i < 6; i++) {
      await answer(page, true);
      await next(page);
    }
    await answer(page, false);
    await next(page);
    await expect(page).toHaveURL(/\/results/);
    await page.waitForTimeout(250); // confetti mid-flight
    await page.screenshot({ path: `${OUT}/09-results-${theme}.png` });

    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Last 12 weeks' })).toBeVisible();
    await shot(page, '10-profile', theme);
  });
}

test('arabic and japanese', async ({ page }) => {
  const deckUrl = await setup(page, 'dark', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await shot(page, '11-arabic-home', 'dark');
  await page.evaluate(async () => {
    const open = indexedDB.open('studynight');
    const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)));
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'language', value: 'ja' });
    tx.objectStore('settings').put({ key: 'theme', value: 'light' });
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
    localStorage.setItem('sn-theme', 'light');
  });
  await page.goto(deckUrl);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await shot(page, '12-japanese-deck', 'light');
});

import { expect, test, type Page } from '@playwright/test';
import { answer, mockApi, next, openSample, skipOnboarding } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

async function startMode(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).click();
}

/** Plays until the results screen, answering correctly unless `wrongAt` says otherwise. */
async function playThrough(page: Page, opts: { wrongAt?: number; max?: number; feedback?: boolean } = {}) {
  const types = new Set<string>();
  for (let i = 0; i < (opts.max ?? 45); i++) {
    if (page.url().includes('/results')) break;
    await expect(page.getByTestId('prompt')).toBeVisible();
    types.add(await answer(page, opts.wrongAt !== i));
    if (opts.feedback !== false) {
      await expect(
        page.getByRole('heading', { name: /Correct!|Not quite|Great answer!|Partly there|Not yet/ }),
      ).toBeVisible();
      await next(page);
    }
    await page.waitForTimeout(150);
  }
  await expect(page).toHaveURL(/\/results/);
  return types;
}

test('onboarding: intro cards, profile setup and sample deck', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole('heading', { name: 'Your notes, turned into a game' })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Nickname (optional)').fill('Ada');
  await page.getByRole('radio', { name: 'Avatar 5' }).click();
  await page.getByRole('radio', { name: '20 min' }).click();
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(page.getByRole('heading', { name: 'Sample decks' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ada/ })).toBeVisible();
});

test('quick play on a sample deck: every answer saved, source sheet, report with undo, results', async ({
  page,
}) => {
  await skipOnboarding(page);
  await openSample(page);
  await expect(page.getByText(/AI can make mistakes/)).toBeVisible();
  await startMode(page, /Quick play/);
  await expect(page.getByTestId('prompt')).toBeVisible();
  // Report the first question, then undo.
  await page.getByRole('button', { name: 'Report this question' }).click();
  await page.getByRole('button', { name: 'Unclear' }).click();
  await expect(page.getByText('Question removed')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  // First answer: open the source sheet.
  await answer(page, true);
  await page
    .getByRole('button', { name: /From your notes/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'From your notes' })).toBeVisible();
  await expect(page.locator('mark').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await next(page);
  await playThrough(page);
  await expect(page.getByText('Accuracy')).toBeVisible();
  await expect(page.getByRole('heading', { name: /\d+\/\d+/ })).toBeVisible();
});

test('exam mode gives no feedback until the end, then an estimated score band', async ({ page }) => {
  await skipOnboarding(page);
  await openSample(page);
  await startMode(page, /Exam mode/);
  await page.getByRole('radio', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('button', { name: /Hint/ })).toHaveCount(0);
  await playThrough(page, { feedback: false, max: 10 });
  await expect(page.getByText('Predicted score')).toBeVisible();
  await expect(page.getByText(/This is an estimate/)).toBeVisible();
  await expect(page.getByText('By topic')).toBeVisible();
});

test('sudden death ends at the first mistake and records a personal best', async ({ page }) => {
  await skipOnboarding(page);
  await openSample(page);
  await startMode(page, /Sudden death/);
  await playThrough(page, { wrongAt: 2 });
  await expect(page.getByRole('heading', { name: '2 in a row!' })).toBeVisible();
  await expect(page.getByText('New personal best!')).toBeVisible();
});

test('flashcards mode with self-grading', async ({ page }) => {
  await skipOnboarding(page);
  await openSample(page);
  await startMode(page, /Flashcards/);
  for (let i = 0; i < 25 && !page.url().includes('/results'); i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: i % 2 ? 'Good' : 'Easy' }).click();
    await page.waitForTimeout(100);
  }
  await expect(page).toHaveURL(/\/results/);
});

test('topic practice raises mastery and unlocks a boss battle that can be won', async ({ page }) => {
  test.setTimeout(180_000);
  await skipOnboarding(page);
  await openSample(page);
  const deckUrl = page.url();
  for (let round = 0; round < 4; round++) {
    await page.goto(deckUrl);
    if (await page.getByRole('button', { name: /^Boss battle/ }).isEnabled()) break;
    await page.getByRole('button', { name: /Practise a topic/ }).click();
    await page.getByRole('dialog').getByRole('button').nth(1).click();
    await playThrough(page);
  }
  await page.goto(deckUrl);
  await page.getByRole('button', { name: /^Boss battle/ }).click();
  await page.getByRole('dialog').getByRole('button').nth(1).click();
  await expect(page.getByRole('img', { name: '3 hearts left' })).toBeVisible();
  await playThrough(page);
  await expect(page.getByRole('heading', { name: 'Storm cleared!' })).toBeVisible();
});

test('ask your notes answers with a citation that opens the passage', async ({ page }) => {
  await skipOnboarding(page);
  await openSample(page);
  await startMode(page, /Ask your notes/);
  await page.getByLabel('Your question').fill('How much of the mass is in the Sun?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/99.8 per cent/)).toBeVisible();
  await page.getByRole('button', { name: 'Open source 1' }).click();
  await expect(page.getByRole('dialog', { name: 'From your notes' })).toBeVisible();
});

test('challenge link round trip in a fresh browser', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await skipOnboarding(page);
  await openSample(page);
  await startMode(page, /Quick play/);
  await playThrough(page);
  await page.getByRole('button', { name: 'Challenge a friend' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('/challenge#c=');
  expect(link.length).toBeLessThanOrEqual(1800);

  const friend = await browser.newContext();
  const fp = await friend.newPage();
  await mockApi(fp);
  await fp.goto(link);
  await expect(fp.getByRole('heading', { name: /challenges you!/ })).toBeVisible();
  await fp.getByRole('button', { name: 'Accept the challenge' }).click();
  for (let i = 0; i < 12 && !fp.url().includes('/results'); i++) {
    await expect(fp.getByTestId('prompt')).toBeVisible();
    const tf = fp.getByRole('button', { name: 'True', exact: true });
    if (await tf.count()) await tf.click();
    else if (await fp.getByPlaceholder('Type your answer').count()) {
      await fp.getByPlaceholder('Type your answer').fill('x');
      await fp.getByRole('button', { name: 'Check' }).click();
    } else if (await fp.getByRole('list', { name: 'Terms' }).count()) {
      const terms = fp.getByRole('list', { name: 'Terms' }).getByRole('button');
      const defs = fp.getByRole('list', { name: 'Meanings' }).getByRole('button');
      for (let k = 0; k < (await terms.count()); k++) {
        await terms.nth(k).click();
        await defs.nth(k).click();
      }
      await fp.getByRole('button', { name: 'Check' }).click();
    } else if (await fp.getByText('put them in order').count())
      await fp.getByRole('button', { name: 'Check' }).click();
    else await fp.locator('main ul li button').first().click();
    await fp.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(fp.getByText('Scores in challenge links are just for fun.')).toBeVisible();
  await friend.close();
});

test('malformed challenge links show a friendly error', async ({ page }) => {
  await page.goto('/challenge#c=broken-link');
  await expect(page.getByRole('heading', { name: "This challenge link doesn't work" })).toBeVisible();
});

test('backup export, import and delete all data', async ({ page }) => {
  await skipOnboarding(page);
  await openSample(page);
  await page.goto('/profile/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export a backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.studynight$/);
  const path = await file.path();

  await page.getByRole('button', { name: 'Delete all my data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page).toHaveURL(/\/welcome/);

  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Just look around' }).click();
  await page.goto('/profile/settings');
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByText(/with 1 decks/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace and import' }).click();
  await page.goto('/decks');
  await expect(page.getByText('The Solar System')).toBeVisible();
});

test.describe('offline', () => {
  // Like a real visitor: the service worker installs on the first visit and precaches the app.
  test.use({ serviceWorkers: 'allow' });

  test('the app reloads and a sample deck plays fully offline', async ({ page, context }) => {
    await skipOnboarding(page);
    await openSample(page);
    const deckUrl = page.url();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto(deckUrl);
    await expect(page.getByRole('button', { name: /Quick play/ })).toBeVisible();
    await startMode(page, /Quick play/);
    await expect(page.getByTestId('prompt')).toBeVisible();
    await answer(page, true);
    await expect(page.getByRole('heading', { name: 'Correct!' })).toBeVisible();
    await context.setOffline(false);
  });
});

test('language switch to Arabic (RTL) and Japanese keeps state', async ({ page }) => {
  await skipOnboarding(page);
  await openSample(page);
  const url = page.url();
  await page.getByRole('button', { name: /Quick play/ }).waitFor();
  await page.goto('/');
  await page.getByRole('button', { name: /Change language/ }).click();
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page
    .getByRole('button', { name: /English|العربية/ })
    .first()
    .click();
  await page.getByRole('button', { name: '日本語' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await page.goto(url);
  await expect(page.getByText('The Solar System')).toBeVisible();
});

test('theme switch applies immediately', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/profile/settings');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('upload flow with pasted text builds a deck (mocked AI)', async ({ page }) => {
  await mockApi(page, {
    topics: (route) => {
      const body = route.request().postDataJSON() as { chunks: Array<{ id: string }> };
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          topics: [
            {
              id: 't1',
              title: 'Volcanoes',
              summary: 'How volcanoes form.',
              chunkIds: body.chunks.map((c) => c.id),
            },
          ],
          detectedLanguage: 'en',
        }),
      });
    },
    questions: (route) => {
      const body = route.request().postDataJSON() as { chunks: Array<{ id: string }>; topic: { id: string } };
      const c = body.chunks[0]!.id;
      const q = (prompt: string, answer: boolean) => ({
        type: 'tf',
        prompt,
        answer,
        ...(answer ? {} : { correction: 'Magma that reaches the surface is called lava.' }),
        explanation: 'Stated in the notes.',
        hint: 'Think about the surface.',
        difficulty: 1,
        topicId: body.topic.id,
        sourceChunkIds: [c],
        evidenceQuote: 'When magma reaches the surface it is called lava.',
      });
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          questions: [
            q('Magma that reaches the surface is called lava.', true),
            q('Magma that reaches the surface is called ash.', false),
            q('Lava is magma that has reached the surface.', true),
            q('Ash is the name for magma at the surface.', false),
          ],
          rejected: { schema: 0, evidence: 0, structure: 0, duplicate: 0, verifier: 0 },
          drafted: 4,
        }),
      });
    },
  });
  await skipOnboarding(page);
  await page.goto('/new');
  await page.getByRole('button', { name: 'Paste text instead' }).click();
  await page
    .getByLabel('Your text')
    .fill(
      '# Volcanoes\n\nVolcanoes form where molten rock rises through cracks in the crust. When magma reaches the surface it is called lava. Shield volcanoes have gentle slopes.',
    );
  await page.getByLabel('Deck title').fill('Volcanoes');
  await page.getByRole('button', { name: 'Create my quiz' }).click();
  await expect(page).toHaveURL(/\/deck\//, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Volcanoes' }).first()).toBeVisible();
  await startMode(page, /Quick play/);
  await expect(page.getByTestId('prompt')).toBeVisible();
});

test('error states: unsupported file and AI busy', async ({ page }) => {
  await mockApi(page, {
    topics: (route) =>
      route.fulfill({
        status: 429,
        headers: { 'retry-after': '1' },
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'busy' } }),
      }),
  });
  await skipOnboarding(page);
  await page.goto('/new');
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'tool.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await page.getByRole('button', { name: 'Create my quiz' }).click();
  await expect(page.getByRole('alert')).toContainText('File type not supported');
  await page.getByRole('button', { name: 'Remove tool.exe' }).click();
  await page.getByRole('button', { name: 'Paste text instead' }).click();
  await page
    .getByLabel('Your text')
    .fill('Some notes about rivers. Rivers carry water to the sea and shape valleys over time.');
  await page.getByRole('button', { name: 'Create my quiz' }).click();
  await expect(page.getByRole('alert')).toContainText('Lots of people are studying right now', {
    timeout: 60_000,
  });
});

test('legal pages are reachable', async ({ page }) => {
  for (const [path, heading] of [
    ['/privacy', 'Groq, our AI provider'],
    ['/terms', 'AI can make mistakes'],
    ['/licences', 'Smart search model'],
    ['/about', 'AI writes the questions. Code decides everything else.'],
  ]) {
    await page.goto(path!);
    await expect(page.getByText(heading!).first()).toBeVisible();
  }
});

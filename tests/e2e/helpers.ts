import { expect, type Page, type Route } from '@playwright/test';

/** Every /api call is mocked: CI never calls Groq. Individual tests can override routes. */
export async function mockApi(
  page: Page,
  overrides: Record<string, (route: Route) => Promise<void> | void> = {},
) {
  if (process.env.E2E_DEBUG) {
    page.on('console', (m) => m.type() === 'error' && console.log('[browser]', m.text().slice(0, 300)));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  }
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/', '');
    if (overrides[path]) return overrides[path](route);
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    switch (path) {
      case 'health':
        return json({
          ok: true,
          configured: true,
          models: { generator: 'g', verifier: 'v', vision: 'x', stt: 's' },
        });
      case 'questions':
        return json({
          questions: [],
          rejected: { schema: 0, evidence: 0, structure: 0, duplicate: 0, verifier: 0 },
          drafted: 0,
        });
      case 'grade': {
        const body = route.request().postDataJSON() as { keyPoints: string[]; answer: string };
        const blank = /don.t know/i.test(body.answer);
        return json({
          covered: body.keyPoints.map((_, i) => !blank && i < body.keyPoints.length - 1),
          feedback: body.keyPoints.map((_, i) =>
            i < body.keyPoints.length - 1 ? '' : 'Mention the last point too.',
          ),
        });
      }
      case 'ask':
        return json({
          found: true,
          answer: 'From your notes: the Sun holds about 99.8 per cent of the mass [1].',
          citations: [1],
        });
      default:
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'UPSTREAM', message: 'mock' } }),
        });
    }
  });
}

/** Skips onboarding with a profile already set up (most tests start from Home). */
export async function skipOnboarding(page: Page) {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Just look around' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function openSample(page: Page, title = 'The Solar System') {
  await page.goto('/samples');
  const card = page.locator('li').filter({ hasText: title });
  await card.getByRole('button', { name: /Play/ }).click();
  await expect(page).toHaveURL(/\/deck\//);
}

interface Q {
  type: string;
  prompt: string;
  options?: string[];
  answerIndex?: number;
  answer?: boolean | string;
  back?: string;
  pairs?: Array<{ term: string; definition: string }>;
  steps?: string[];
  modelAnswer?: string;
}

/** Looks up the current question in IndexedDB by its prompt text. */
export async function currentQuestion(page: Page): Promise<Q | null> {
  const prompt = (await page.getByTestId('prompt').innerText()).trim();
  return page.evaluate(async (text) => {
    const open = indexedDB.open('studynight');
    const db: IDBDatabase = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
    const all: Array<{ content: Q }> = await new Promise((res) => {
      const req = db.transaction('questions').objectStore('questions').getAll();
      req.onsuccess = () => res(req.result);
    });
    db.close();
    const norm = (s: string) =>
      s
        .replace(/＿＿＿＿/g, '____')
        .replace(/\s+/g, ' ')
        .trim();
    const hit =
      all.find((q) => norm(q.content.prompt) === norm(text)) ??
      all.find((q) => norm(text).startsWith(norm(q.content.prompt).slice(0, 40)));
    return hit ? hit.content : null;
  }, prompt);
}

/** Answers the visible question correctly (or wrongly when `correct` is false). */
export async function answer(page: Page, correct = true): Promise<string> {
  const q = await currentQuestion(page);
  if (!q) throw new Error('question not found in IndexedDB');
  const main = page.locator('main');
  switch (q.type) {
    case 'mcq': {
      const wanted = correct ? q.options![q.answerIndex!]! : q.options!.find((_, i) => i !== q.answerIndex)!;
      await main
        .getByRole('button')
        .filter({ hasText: wanted.replace(/\$/g, '').slice(0, 30) })
        .first()
        .click();
      break;
    }
    case 'tf': {
      const value = correct ? q.answer : !q.answer;
      await main.getByRole('button', { name: value ? 'True' : 'False', exact: true }).click();
      break;
    }
    case 'fill':
      await page.getByPlaceholder('Type your answer').fill(correct ? String(q.answer) : 'zzzz');
      await page.getByRole('button', { name: 'Check' }).click();
      break;
    case 'flashcard':
      await page.getByRole('button', { name: 'Show answer' }).click();
      await page.getByRole('button', { name: correct ? 'Good' : 'Again' }).click();
      break;
    case 'match': {
      const terms = page.getByRole('list', { name: 'Terms' });
      const defs = page.getByRole('list', { name: 'Meanings' });
      const pairs = correct
        ? q.pairs!
        : q.pairs!.map((p, i) => ({
            term: p.term,
            definition: q.pairs![(i + 1) % q.pairs!.length]!.definition,
          }));
      for (const p of pairs) {
        await terms
          .getByRole('button')
          .filter({ hasText: p.term.slice(0, 25) })
          .first()
          .click();
        await defs
          .getByRole('button')
          .filter({ hasText: p.definition.slice(0, 25) })
          .first()
          .click();
      }
      await page.getByRole('button', { name: 'Check' }).click();
      break;
    }
    case 'order': {
      if (correct) {
        for (let i = 0; i < q.steps!.length; i++) {
          const items = await main.locator('ol > li').allInnerTexts();
          const at = items.findIndex((t) => t.includes(q.steps![i]!.slice(0, 25)));
          for (let p = at; p > i; p--)
            await page.getByRole('button', { name: `Move step ${p + 1} up` }).click();
        }
      }
      await page.getByRole('button', { name: 'Check' }).click();
      break;
    }
    case 'explain':
      await page.getByPlaceholder('Explain it in your own words…').fill(correct ? (q.modelAnswer ?? 'answer') : "I don't know.");
      await page.getByRole('button', { name: 'Check my answer' }).click();
      break;
  }
  return q.type;
}

export async function next(page: Page) {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

/**
 * Language sweep (plan 11.2, guard 3): for every UI language, open every main screen at 360 px in light and
 * dark mode and check: no horizontal overflow, no text clipped in buttons, script fonts loaded (no missing
 * glyph boxes) and the correct text direction.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockApi } from './helpers';
import { allTypesBackup } from './fixtures';

const languages = JSON.parse(readFileSync('src/i18n/languages.json', 'utf8')) as Array<{ code: string; dir: string; script: string }>;
const FONT: Record<string, string> = {
  arabic: 'Noto Sans Arabic',
  devanagari: 'Noto Sans Devanagari',
  bengali: 'Noto Sans Bengali',
  jp: 'Noto Sans JP',
  kr: 'Noto Sans KR',
  sc: 'Noto Sans SC',
  latin: 'Inter Variable',
};

/** Characters of each script (Latin also covers Cyrillic and Vietnamese, served by Inter). */
const SCRIPT_RE: Record<string, string> = {
  arabic: '\\p{Script=Arabic}',
  devanagari: '\\p{Script=Devanagari}',
  bengali: '\\p{Script=Bengali}',
  jp: '[\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]',
  kr: '\\p{Script=Hangul}',
  sc: '\\p{Script=Han}',
  latin: '[\\p{Script=Latin}\\p{Script=Cyrillic}]',
};

test.use({ viewport: { width: 360, height: 760 } });

async function setPrefs(page: Page, language: string, theme: string) {
  await page.evaluate(
    async ([lang, th]) => {
      const open = indexedDB.open('studynight');
      const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)));
      await new Promise<void>((res) => {
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ key: 'language', value: lang });
        tx.objectStore('settings').put({ key: 'theme', value: th });
        tx.oncomplete = () => res();
      });
      db.close();
      localStorage.setItem('sn-theme', th!);
    },
    [language, theme],
  );
}

async function checkLayout(page: Page, lang: { code: string; dir: string; script: string }, where: string) {
  await page.waitForTimeout(250);
  const problems = await page.evaluate(
    async ({ dir, font, scriptRe }) => {
      await document.fonts.ready;
      const out: string[] = [];
      if (document.documentElement.dir !== dir) out.push(`dir is ${document.documentElement.dir}`);
      if (document.documentElement.scrollWidth > window.innerWidth + 1)
        out.push(`horizontal overflow ${document.documentElement.scrollWidth}px > ${window.innerWidth}px`);
      for (const b of Array.from(document.querySelectorAll('button'))) {
        const r = b.getBoundingClientRect();
        if (!r.width || getComputedStyle(b).visibility === 'hidden') continue;
        for (const el of [b, ...Array.from(b.querySelectorAll('span:not(.sr-only)'))] as HTMLElement[]) {
          const cs = getComputedStyle(el);
          const clips = cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis' || el === b;
          if (clips && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
            out.push(`clipped button text: "${(b.textContent ?? '').trim().slice(0, 40)}"`);
        }
      }
      // Glyph coverage: the characters of this language's script on the page must be covered by loaded faces of
      // the script font (otherwise the browser would fall back and may show missing-glyph boxes).
      const chars = [...new Set(Array.from(document.body.innerText.match(new RegExp(scriptRe, 'gu')) ?? []))].slice(0, 60).join('');
      if (chars) {
        const faces = await document.fonts.load(`16px "${font}"`, chars);
        if (!faces.length || faces.some((f) => f.status !== 'loaded')) out.push(`font ${font} does not cover the page text`);
      }
      return [...new Set(out)];
    },
    { dir: lang.dir, font: FONT[lang.script] ?? 'Inter Variable', scriptRe: SCRIPT_RE[lang.script] ?? SCRIPT_RE.latin! },
  );
  expect(problems, `${lang.code} ${where}`).toEqual([]);
}

for (const lang of languages) {
  test(`language sweep: ${lang.code}`, async ({ page }) => {
    test.setTimeout(240_000);
    await mockApi(page, {
      // Keeps the processing screen visible long enough to check it.
      topics: async (route) => {
        await new Promise((r) => setTimeout(r, 4000));
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UPSTREAM', message: 'x' } }) });
      },
    });
    // Seed the fixture deck through the app's own backup import.
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: 'Just look around' }).click();
    await page.goto('/profile/settings');
    await page.locator('input[type=file]').setInputFiles({ name: 'fixture.studynight', mimeType: 'application/json', buffer: Buffer.from(allTypesBackup()) });
    await page.getByRole('button', { name: 'Replace and import' }).click();
    await expect(page).toHaveURL(/\/$/);

    for (const theme of ['light', 'dark']) {
      await setPrefs(page, lang.code, theme);
      for (const path of ['/', '/decks', '/new', '/deck/fixture-deck', '/review', '/profile', '/profile/settings', '/profile/planner', '/privacy', '/deck/fixture-deck/ask']) {
        await page.goto(path);
        await expect(page.locator('main').first()).toBeVisible();
        await checkLayout(page, lang, `${theme} ${path}`);
      }

      // Processing screen.
      await page.goto('/new');
      await page.locator('textarea').waitFor({ state: 'detached' }).catch(() => undefined);
      await page.locator('main button').nth(2).click(); // "paste text" (third button in the drop zone)
      await page.locator('textarea').fill('Rivers carry water from the land to the sea. They shape valleys over time.');
      await page.locator('main button').last().click();
      await expect(page.getByRole('progressbar')).toBeVisible();
      await checkLayout(page, lang, `${theme} processing`);

      // Every question type: question and feedback.
      await page.goto('/deck/fixture-deck');
      await page.locator('section[aria-label] button').first().click(); // quick play
      for (let i = 0; i < 7; i++) {
        await expect(page.getByTestId('prompt')).toBeVisible();
        await checkLayout(page, lang, `${theme} question ${i}`);
        const main = page.locator('main');
        // Answer with whatever is first: enough to reach the feedback screen in any language.
        if (await page.locator('#fill-answer').count()) {
          await page.locator('#fill-answer').fill('clouds');
          await page.locator('#fill-answer').press('Enter');
        } else if (await page.locator('#explain-answer').count()) {
          await page.locator('#explain-answer').fill('Water evaporates, cools and condenses into clouds.');
          await main.locator('button').last().click();
        } else if (await main.locator('[aria-expanded="false"]').count()) {
          await main.locator('[aria-expanded="false"]').first().click();
          await main.getByRole('group').getByRole('button').nth(2).click();
        } else if (await main.locator('ul[aria-label] button[aria-pressed]').count()) {
          const terms = main.locator('ul[aria-label]').first().locator('button');
          const defs = main.locator('ul[aria-label]').nth(1).locator('button');
          for (let k = 0; k < 4; k++) {
            await terms.nth(k).click();
            await defs.nth(k).click();
          }
          await main.locator('button').last().click();
        } else if (await main.locator('ol').count()) {
          await main.locator('button').last().click();
        } else {
          await main.locator('button').first().click();
        }
        await expect(page.locator('#feedback-title')).toBeVisible();
        await checkLayout(page, lang, `${theme} feedback ${i}`);
        await page.locator('#feedback-title').locator('xpath=..').getByRole('button').last().click();
      }
      await expect(page).toHaveURL(/\/results/);
      await checkLayout(page, lang, `${theme} results`);
    }
  });
}

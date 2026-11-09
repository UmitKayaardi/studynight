/** Automated accessibility audit (axe-core, WCAG 2.1 A/AA rules) of every main screen in light and dark mode. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './helpers';
import { allTypesBackup } from './fixtures';

async function seedFixture(page: Page) {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Just look around' }).click();
  await page.goto('/profile/settings');
  await page.locator('input[type=file]').setInputFiles({ name: 'fixture.studynight', mimeType: 'application/json', buffer: Buffer.from(allTypesBackup()) });
  await page.getByRole('button', { name: 'Replace and import' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function audit(page: Page, where: string) {
  await page.waitForTimeout(300);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  expect(violations, where).toEqual([]);
}

for (const theme of ['light', 'dark']) {
  test(`accessibility audit (${theme})`, async ({ page }) => {
    test.setTimeout(180_000);
    await mockApi(page);
    await seedFixture(page);
    await page.goto('/profile/settings');
    await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
    for (const path of ['/', '/decks', '/new', '/samples', '/deck/fixture-deck', '/deck/fixture-deck/ask', '/review', '/profile', '/profile/settings', '/profile/planner', '/privacy', '/terms', '/licences', '/about', '/challenge#c=bad']) {
      await page.goto(path);
      await expect(page.locator('main').first()).toBeVisible();
      await audit(page, `${theme} ${path}`);
    }
    // Play screens: question and feedback for every type.
    await page.goto('/deck/fixture-deck');
    await page.getByRole('button', { name: /^Quick play/ }).click();
    for (let i = 0; i < 7; i++) {
      await expect(page.getByTestId('prompt')).toBeVisible();
      await audit(page, `${theme} question ${i}`);
      const main = page.locator('main');
      if (await page.locator('#fill-answer').count()) {
        await page.locator('#fill-answer').fill('clouds');
        await page.locator('#fill-answer').press('Enter');
      } else if (await page.locator('#explain-answer').count()) {
        await page.locator('#explain-answer').fill('Water evaporates and condenses.');
        await page.getByRole('button', { name: 'Check my answer' }).click();
      } else if (await main.locator('[aria-expanded="false"]').count()) {
        await main.locator('[aria-expanded="false"]').first().click();
        await page.getByRole('button', { name: 'Good' }).click();
      } else if (await page.getByRole('list', { name: 'Terms' }).count()) {
        const terms = page.getByRole('list', { name: 'Terms' }).getByRole('button');
        const defs = page.getByRole('list', { name: 'Meanings' }).getByRole('button');
        for (let k = 0; k < 4; k++) {
          await terms.nth(k).click();
          await defs.nth(k).click();
        }
        await page.getByRole('button', { name: 'Check' }).click();
      } else if (await main.locator('ol').count()) {
        await page.getByRole('button', { name: 'Check' }).click();
      } else {
        await main.locator('button').first().click();
      }
      await expect(page.locator('#feedback-title')).toBeVisible();
      await audit(page, `${theme} feedback ${i}`);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/results/);
    await audit(page, `${theme} results`);
  });
}

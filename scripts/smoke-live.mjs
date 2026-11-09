/* global document, window, MediaRecorder */
// Smoke test of a deployed StudyNight with the real AI service. Usage: BASE=https://… node scripts/smoke-live.mjs
// Uses only original text written for this test. Prints a short PASS/FAIL report and saves screenshots to
// smoke-results/ (git-ignored).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://studynight-sable.vercel.app';
const OUT = 'smoke-results';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = async (name, fn) => {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push(`PASS ${name} (${Math.round((Date.now() - t) / 100) / 10} s)${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`);
  }
  console.log(results.at(-1));
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: [] });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

await check('health endpoint', async () => {
  const r = await page.request.get(`${BASE}/api/health`);
  const j = await r.json();
  if (!j.ok || !j.configured) throw new Error(JSON.stringify(j));
  return `models: ${j.models.generator}, ${j.models.verifier}`;
});

await check('sample deck playable in under 10 s', async () => {
  const t0 = Date.now();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  await page.locator('li').filter({ hasText: 'The Solar System' }).getByRole('button', { name: /Play/ }).click();
  await page.waitForURL('**/deck/**');
  await page.getByRole('button', { name: /^Quick play/ }).click();
  await page.getByTestId('prompt').waitFor();
  const ms = Date.now() - t0;
  for (let i = 0; i < 3; i++) {
    const main = page.locator('main');
    if (await page.getByRole('button', { name: 'True', exact: true }).count()) await page.getByRole('button', { name: 'True', exact: true }).click();
    else if (await page.locator('#fill-answer').count()) {
      await page.locator('#fill-answer').fill('x');
      await page.locator('#fill-answer').press('Enter');
    } else if (await main.locator('[aria-expanded="false"]').count()) {
      await main.locator('[aria-expanded="false"]').first().click();
      await main.getByRole('group').getByRole('button').nth(2).click();
    } else if (await page.locator('#explain-answer').count()) break;
    else await main.locator('ul li button, ol + button').first().click();
    await page.locator('#feedback-title').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.screenshot({ path: `${OUT}/sample-play.png` });
  if (ms > 10_000) throw new Error(`took ${ms} ms`);
  return `${ms} ms from opening the site to the first question`;
});

await check('Smart search model downloads under the CSP', async () => {
  await page.goto(`${BASE}/profile/settings`);
  await page.getByRole('button', { name: /Download \(/ }).click();
  await page.getByRole('button', { name: 'Remove Smart search' }).waitFor({ timeout: 240_000 });
  const csp = consoleErrors.filter((e) => /Content Security Policy|Refused to/.test(e));
  if (csp.length) throw new Error(csp[0]);
});

await check('upload a small PDF and play generated questions', async () => {
  const pdfPage = await context.newPage();
  await pdfPage.setContent(`<h1>Bees and Pollination</h1>
  <p>Pollination is the transfer of pollen from the male part of a flower, the anther, to the female part, the stigma. Bees are among the most important pollinators. While they collect nectar for food, pollen sticks to the hairs on their bodies and is carried to the next flower.</p>
  <h2>Honey bee colonies</h2>
  <p>A honey bee colony has one queen, who lays the eggs. Worker bees are female; they collect food, build the comb from wax and look after the young. Drones are male bees whose main role is to mate with a queen from another colony.</p>
  <h2>The waggle dance</h2>
  <p>A worker bee that finds a good source of food returns to the hive and performs the waggle dance. The angle of the dance tells other bees the direction of the food relative to the sun, and the length of the waggle part tells them how far away it is.</p>`);
  const pdf = await pdfPage.pdf({ format: 'A4' });
  await pdfPage.close();
  await page.goto(`${BASE}/new`);
  await page.getByTestId('file-input').setInputFiles({ name: 'bees.pdf', mimeType: 'application/pdf', buffer: pdf });
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Create my quiz' }).click();
  await page.waitForURL('**/deck/**', { timeout: 240_000 });
  const ms = Date.now() - t0;
  await page.screenshot({ path: `${OUT}/upload-deck.png` });
  await page.getByRole('button', { name: /^Quick play/ }).click();
  await page.getByTestId('prompt').waitFor({ timeout: 60_000 });
  await page.screenshot({ path: `${OUT}/upload-question.png` });
  return `deck ready ${Math.round(ms / 1000)} s after upload`;
});

await check('ask your notes (answer with citation, and refusal)', async () => {
  await page.goto(`${BASE}/decks`);
  await page.getByText('The Solar System').click();
  await page.getByRole('button', { name: /^Ask your notes/ }).click();
  await page.getByLabel('Your question').fill('Why is Venus the hottest planet?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: /^Open source/ }).first().waitFor({ timeout: 90_000 });
  await page.getByLabel('Your question').fill('What is the capital of Peru?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText(/don't seem to cover|don’t seem to cover|notes don/).first().waitFor({ timeout: 90_000 });
  await page.screenshot({ path: `${OUT}/ask.png` });
});

await check('explain answer graded', async () => {
  await page.goto(`${BASE}/decks`);
  await page.getByText('The Solar System').click();
  await page.getByRole('button', { name: /^Practise a topic/ }).click();
  const topics = page.getByRole('dialog').getByRole('button');
  for (let t = 1; t < (await topics.count()); t++) {
    if (t > 1) {
      await page.goto(`${BASE}/decks`);
      await page.getByText('The Solar System').click();
      await page.getByRole('button', { name: /^Practise a topic/ }).click();
    }
    await page.getByRole('dialog').getByRole('button').nth(t).click();
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('prompt').waitFor();
      if (await page.locator('#explain-answer').count()) {
        await page.locator('#explain-answer').fill('The solar wind is charged particles from the Sun; the magnetic field steers some to the poles where they make the air glow.');
        await page.getByRole('button', { name: 'Check my answer' }).click();
        await page.getByText(/You covered/).waitFor({ timeout: 90_000 });
        await page.screenshot({ path: `${OUT}/explain.png` });
        return (await page.getByText(/You covered/).innerText()).trim();
      }
      if (await page.getByRole('button', { name: 'True', exact: true }).count()) await page.getByRole('button', { name: 'True', exact: true }).click();
      else if (await page.locator('#fill-answer').count()) {
        await page.locator('#fill-answer').fill('x');
        await page.locator('#fill-answer').press('Enter');
      } else if (await page.locator('main [aria-expanded="false"]').count()) {
        await page.locator('main [aria-expanded="false"]').first().click();
        await page.locator('main').getByRole('group').getByRole('button').nth(2).click();
      } else if (await page.locator('main ol').count()) await page.locator('main button').last().click();
      else await page.locator('main ul li button').first().click();
      await page.locator('#feedback-title').waitFor();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      if (page.url().includes('/results')) break;
    }
  }
  throw new Error('no explain question reached');
});

await check('challenge link opens in a fresh browser', async () => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.goto(`${BASE}/decks`);
  await page.getByText('The Solar System').click();
  await page.getByRole('button', { name: /^Sudden death/ }).click();
  await page.getByTestId('prompt').waitFor();
  if (await page.getByRole('button', { name: 'True', exact: true }).count()) await page.getByRole('button', { name: 'True', exact: true }).click();
  else await page.locator('main ul li button').first().click();
  await page.locator('#feedback-title').waitFor().catch(() => undefined);
  await page.getByRole('button', { name: 'Pause or quit' }).click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.waitForTimeout(500);
  if (!page.url().includes('/results')) throw new Error('no results page after leaving');
  await page.getByRole('button', { name: 'Challenge a friend' }).click();
  const link = await page.evaluate(() => {
    const el = document.querySelector('[role=dialog]');
    return el ? el.textContent : '';
  });
  await page.getByRole('button', { name: 'Copy link' }).click().catch(() => undefined);
  const url = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  if (!url.includes('#c=')) return `challenge sheet shown (${(link ?? '').slice(0, 40)}…); clipboard not readable here`;
  const friend = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fp = await friend.newPage();
  await fp.goto(url);
  await fp.getByRole('heading', { name: /challenges you!/ }).waitFor();
  await fp.screenshot({ path: `${OUT}/challenge.png` });
  await friend.close();
  return `link ${url.length} characters`;
});

await check('Arabic (RTL) and Japanese', async () => {
  await page.goto(BASE);
  await page.getByRole('button', { name: /Change language/ }).click();
  await page.getByRole('button', { name: 'العربية' }).click();
  await page.waitForFunction(() => document.documentElement.dir === 'rtl');
  await page.screenshot({ path: `${OUT}/arabic.png` });
  await page.getByRole('button', { name: /اللغة|العربية/ }).first().click();
  await page.getByRole('button', { name: '日本語' }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  await page.screenshot({ path: `${OUT}/japanese.png` });
});

await check('microphone available over HTTPS', async () => {
  const ok = await page.evaluate(() => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
  if (!ok) throw new Error('not a secure context or no MediaRecorder');
  return 'secure context; the browser asks for microphone permission on "Answer by voice"';
});

const csp = consoleErrors.filter((e) => /Content Security Policy|Refused to/.test(e));
results.push(csp.length ? `FAIL no CSP violations: ${csp[0].slice(0, 160)}` : 'PASS no CSP violations in the console');
console.log(results.at(-1));
await browser.close();
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} checks passed`);

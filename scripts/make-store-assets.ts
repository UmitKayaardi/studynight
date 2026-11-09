/**
 * Renders the Google Play graphics into store/: icon-512.png and feature-graphic.png (1024 × 500), using the app's
 * own Mascot and Logo components (server-rendered to SVG) and fonts.
 * Usage: node scripts/run-ts.mjs scripts/make-store-assets.ts
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import { Mascot } from '../src/components/art/Mascot';
import { Logo } from '../src/components/art/Art';

export default async function main() {
  mkdirSync('store/screenshots', { recursive: true });
  copyFileSync('public/icons/maskable-512.png', 'store/icon-512.png');

  const mascot = renderToStaticMarkup(createElement(Mascot, { mood: 'celebrating', size: 330 }));
  const logo = renderToStaticMarkup(createElement(Logo, { size: 84 }));
  const nunito = pathToFileURL(resolve('node_modules/@fontsource-variable/nunito/index.css')).href;
  const inter = pathToFileURL(resolve('node_modules/@fontsource-variable/inter/index.css')).href;
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${nunito}"><link rel="stylesheet" href="${inter}">
<style>
  body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: radial-gradient(circle at 78% 40%, #1d2552 0%, #0b1026 60%); font-family: 'Inter Variable', sans-serif; color: #eef1ff; }
  .wrap { display: flex; align-items: center; height: 100%; padding: 0 64px; gap: 24px; }
  .text { flex: 1; }
  .brand { display: flex; align-items: center; gap: 18px; }
  h1 { font-family: 'Nunito Variable', sans-serif; font-weight: 900; font-size: 72px; margin: 0; letter-spacing: -1px; }
  p { font-size: 34px; margin: 22px 0 0; color: #aab2dc; font-weight: 500; }
  .pill { display: inline-block; margin-top: 26px; padding: 10px 22px; border-radius: 999px; background: #2ee6c5; color: #04201b; font-family: 'Nunito Variable', sans-serif; font-weight: 800; font-size: 24px; }
  .star { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #ffc94d; opacity: .8; }
</style></head><body>
${[[120, 60], [460, 420], [560, 80], [930, 450], [700, 30], [300, 470], [990, 120]].map(([x, y]) => `<span class="star" style="left:${x}px;top:${y}px"></span>`).join('')}
<div class="wrap"><div class="text"><div class="brand">${logo}<h1>StudyNight</h1></div><p>Your notes, turned into a game.</p><span class="pill">Free · Private · 21 languages</span></div>${mascot}</div>
</body></html>`;
  const file = resolve('store/.feature.html');
  writeFileSync(file, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'store/feature-graphic.png' });
  await browser.close();
  console.log('store: icon-512.png, feature-graphic.png');
}

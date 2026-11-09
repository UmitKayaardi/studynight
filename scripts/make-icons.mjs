// Renders the app icons (PWA + Apple touch + maskable) from the original logo SVG with Playwright.
// Usage: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const jobs = [
  { file: 'public/icons/icon-192.png', size: 192, maskable: false },
  { file: 'public/icons/icon-512.png', size: 512, maskable: false },
  { file: 'public/icons/apple-touch-icon.png', size: 180, maskable: true },
  { file: 'public/icons/maskable-512.png', size: 512, maskable: true },
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  // Maskable icons fill the square with the background and keep the artwork inside the 80 % safe zone.
  const art = j.maskable
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${j.size}" height="${j.size}">${inner.replace('rx="16"', 'rx="0"').replace('<circle', '<g transform="translate(6.4 6.4) scale(0.8)"><circle')}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${j.size}" height="${j.size}">${inner}</svg>`;
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${art}</body></html>`);
  await page.screenshot({ path: j.file, omitBackground: !j.maskable, clip: { x: 0, y: 0, width: j.size, height: j.size } });
  console.log('icon', j.file);
}
await browser.close();

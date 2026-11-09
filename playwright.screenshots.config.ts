import { defineConfig } from '@playwright/test';

/** Renders the README screenshots (docs/screenshots/) from sample decks: `npx playwright test -c playwright.screenshots.config.ts`. */
export default defineConfig({
  testDir: './tests/screenshots',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

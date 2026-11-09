import { defineConfig, devices } from '@playwright/test';

/** E2E tests run against the production build with every /api call mocked — they never call Groq. */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'mobile-chromium' }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

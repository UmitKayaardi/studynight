import { defineConfig } from '@playwright/test';
import base from './playwright.screenshots.config';

/** Google Play phone screenshots: 1080 × 1920 (9:16, within Play's 2:1 limit). Writes to store/screenshots/raw. */
process.env.SCREENSHOT_DIR = 'store/screenshots/raw';
export default defineConfig({ ...base, use: { ...base.use, viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 } });

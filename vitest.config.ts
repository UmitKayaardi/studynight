import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'server/**/*.test.ts',
      'shared/**/*.test.ts',
      'tests/unit/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
    ],
    restoreMocks: true,
    testTimeout: 20000,
  },
});

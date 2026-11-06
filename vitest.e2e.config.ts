import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// End-to-end tests: real route handlers against a real database, outside systems stubbed.
// Kept apart from `npm test` (vitest.config.ts) because they need SQL Server and write to it.
//   npm run test:e2e
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    // One borrower walks through the steps in order; files must not run side by side.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});

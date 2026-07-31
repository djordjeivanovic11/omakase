import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Opt-in suite that calls a real provider. It is never part of `pnpm test`
 * so neither CI nor a normal local run can incur provider cost.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@omakase/contracts': path.resolve(__dirname, '../../packages/contracts/dist/index.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});

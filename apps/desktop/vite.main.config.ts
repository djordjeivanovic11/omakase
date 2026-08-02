import path from 'node:path';
import { defineConfig } from 'vite';
// @ts-expect-error -- packaging helper ships as plain ESM JS
import { NATIVE_EXTERNALS } from './native-externals.mjs';

const emptyModule = path.resolve(__dirname, 'src/main/stubs/empty-module.cjs');

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@core': path.resolve(__dirname, 'src/core'),
      // linkedom (via defuddle/node) optionally requires `canvas`. We never use
      // canvas APIs for webpage extraction, so stub it instead of shipping a
      // native dependency that breaks both `pnpm dev` and packaging.
      canvas: emptyModule,
    },
  },
  build: {
    rollupOptions: {
      external: ['electron', ...NATIVE_EXTERNALS],
    },
  },
  optimizeDeps: {
    exclude: ['canvas'],
  },
});

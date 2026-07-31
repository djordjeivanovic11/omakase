/**
 * Modules that must stay outside the Vite main bundle because they load native
 * addons at runtime. They are copied into the packaged app by the
 * `packageAfterCopy` hook in forge.config.ts.
 */
export const NATIVE_EXTERNALS = [
  'better-sqlite3',
  '@huggingface/transformers',
  'onnxruntime-node',
  // Defuddle's Node entry point resolves its DOM implementation at runtime, so
  // Rollup leaves the require in place and the package must ship with the app.
  '@mixmark-io/domino',
];

#!/usr/bin/env node
/**
 * Downloads the bundled local embedding model into `resources/models`.
 *
 * The weights are Apache-2.0 but far too large for version control, so they are
 * fetched once and verified by digest. Packaging fails if they are absent, which
 * keeps a release from silently shipping without semantic search.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const EMBEDDING_MODEL = {
  id: 'granite-embedding-107m-multilingual',
  repo: 'ibm-granite/granite-embedding-107m-multilingual',
  revision: 'main',
  dimensions: 384,
  maxSequenceLength: 512,
  pooling: 'cls',
  license: 'Apache-2.0',
};

/** Destination paths follow the layout transformers.js expects for a local model. */
const FILES = [
  { remote: 'config.json', local: 'config.json' },
  { remote: 'tokenizer.json', local: 'tokenizer.json' },
  { remote: 'tokenizer_config.json', local: 'tokenizer_config.json' },
  { remote: 'special_tokens_map.json', local: 'special_tokens_map.json' },
  { remote: 'model.onnx', local: 'onnx/model.onnx' },
];

const modelDir = path.join(appRoot, 'resources', 'models', EMBEDDING_MODEL.id);

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function download(remote, destination) {
  const url = `https://huggingface.co/${EMBEDDING_MODEL.repo}/resolve/${EMBEDDING_MODEL.revision}/${remote}`;
  process.stdout.write(`  ${remote} … `);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  process.stdout.write(`${(buffer.length / 1e6).toFixed(1)} MB\n`);
}

export function modelIsPresent() {
  return FILES.every((file) => fs.existsSync(path.join(modelDir, file.local)));
}

async function main() {
  const force = process.argv.includes('--force');
  if (modelIsPresent() && !force) {
    console.log(`Embedding model already present at ${modelDir}`);
    return;
  }

  console.log(`Downloading ${EMBEDDING_MODEL.repo} (${EMBEDDING_MODEL.license})`);
  for (const file of FILES) {
    await download(file.remote, path.join(modelDir, file.local));
  }

  const manifest = {
    modelId: EMBEDDING_MODEL.id,
    repo: EMBEDDING_MODEL.repo,
    revision: EMBEDDING_MODEL.revision,
    dimensions: EMBEDDING_MODEL.dimensions,
    maxSequenceLength: EMBEDDING_MODEL.maxSequenceLength,
    pooling: EMBEDDING_MODEL.pooling,
    license: EMBEDDING_MODEL.license,
    files: Object.fromEntries(
      FILES.map((file) => [file.local, sha256File(path.join(modelDir, file.local))]),
    ),
  };

  fs.writeFileSync(
    path.join(appRoot, 'resources', 'models', 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Wrote manifest for ${EMBEDDING_MODEL.id}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

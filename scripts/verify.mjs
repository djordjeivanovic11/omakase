#!/usr/bin/env node
/**
 * Release / AI verification gates.
 * Usage: node scripts/verify.mjs [default|release|ai]
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] ?? 'default';

const env = {
  ...process.env,
  OMAKASE_TEST: '1',
  OMAKASE_MOCK_PROVIDER: '1',
};

function run(label, command, args = []) {
  console.log(`\n▶ ${label}\n  $ ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n✗ FAILED: ${label}`);
    console.error(
      `  Fix the error above, then re-run: pnpm verify${mode === 'default' ? '' : `:${mode}`}\n`,
    );
    process.exit(result.status ?? 1);
  }
  console.log(`\n✓ ${label}`);
}

const steps = {
  default: [
    ['Doctor (required checks)', 'node', ['scripts/doctor.mjs']],
    ['Format check (Biome)', 'pnpm', ['format:check']],
    ['Lint', 'pnpm', ['lint']],
    ['Typecheck', 'pnpm', ['typecheck']],
    ['Unit tests', 'pnpm', ['test:unit']],
    ['Integration tests', 'pnpm', ['test:integration']],
    ['Deterministic AI evals', 'pnpm', ['eval:deterministic']],
    ['Contracts + desktop tests', 'pnpm', ['test']],
    ['Website build', 'pnpm', ['build:website']],
    ['Extension build', 'pnpm', ['build:extension']],
    ['Desktop production package', 'pnpm', ['build:desktop']],
  ],
  release: [
    ['Default verify', 'node', ['scripts/verify.mjs', 'default']],
    ['Package make artifacts', 'pnpm', ['package']],
    ['Scan stubs / secrets patterns', 'pnpm', ['scan:stubs']],
    [
      'Release docs present',
      'node',
      [
        '--input-type=module',
        '-e',
        "import fs from 'node:fs'; fs.accessSync('docs/release.md'); fs.accessSync('docs/ACCEPTANCE_CHECKLIST.md'); console.log('release docs ok');",
      ],
    ],
  ],
  ai: [
    ['AI contract + deterministic evals', 'pnpm', ['eval:deterministic']],
    ['Promptfoo regression (offline)', 'pnpm', ['eval:promptfoo']],
    ['Promptfoo red team (offline fixtures)', 'pnpm', ['eval:redteam']],
    [
      'Desktop AI-related unit/integration',
      'pnpm',
      [
        '--filter',
        '@omakase/desktop',
        'exec',
        'vitest',
        'run',
        'tests/unit/citations.test.ts',
        'tests/unit/evidence.test.ts',
        'tests/unit/agent-budgets.test.ts',
        'tests/unit/architecture.test.ts',
        'tests/integration/mock-agent-golden.test.ts',
        'tests/integration/ai-budgets.test.ts',
      ],
    ],
  ],
};

const selected = steps[mode];
if (!selected) {
  console.error(`Unknown mode: ${mode}. Use default | release | ai`);
  process.exit(1);
}

console.log(`\n=== Omakase verify:${mode === 'default' ? 'default' : mode} ===\n`);
for (const [label, cmd, args] of selected) {
  run(label, cmd, args);
}
console.log(`\n=== verify:${mode === 'default' ? 'default' : mode} PASSED ===\n`);

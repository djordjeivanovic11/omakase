#!/usr/bin/env node
/**
 * Opt-in live evals. Refuses to run unless OMAKASE_LIVE_EVALS=1.
 * Never writes provider keys into Promptfoo config files.
 */

if (process.env.OMAKASE_LIVE_EVALS !== '1') {
  console.error(`Live evals are opt-in and may spend money.

Set OMAKASE_LIVE_EVALS=1 and export provider keys in your shell, then re-run:
  OMAKASE_LIVE_EVALS=1 pnpm eval:live

Ordinary CI must not set this flag.
`);
  process.exit(1);
}

console.error(
  'Live eval harness scaffold: configure provider-specific Promptfoo configs locally (gitignored).',
);
console.error(
  'Use committed offline suites (pnpm eval:deterministic / eval:redteam) for the release gate.',
);
process.exit(0);

---
name: omakase-release-verification
description: Use before declaring an Omakase release ready. Runs the golden-path and packaging verification checklist with reproducible evidence.
---

# Omakase release verification

## Entry conditions

Activate before release tags, acceptance checklist completion, or “ready to ship” claims.

## Required checks

1. Clean install (`pnpm install --frozen-lockfile`)
2. `pnpm run doctor`
3. Clean database / migration path
4. Provider setup (mock sufficient for gate; real keys opt-in)
5. Source import
6. Cited answer
7. Learn
8. Three-turn Probe
9. Learner-state persistence + restart recovery
10. Packaged `.app` / Windows artifact smoke
11. Website + extension builds
12. No secrets committed
13. Updated documentation / acceptance evidence
14. `pnpm verify` and, when packaging, `pnpm verify:release`

## Evidence required

- Commands and artifacts recorded in `docs/IMPLEMENTATION_STATUS.md` / acceptance checklist
- Deterministic AI evals green without API keys

## Failure modes

- Claiming packaged readiness from dev-only runs
- Skipping citation/evidence gates
- Shipping with remote telemetry enabled by default

See `references/gate.md`.

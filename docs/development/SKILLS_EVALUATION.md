# Skills evaluation (2026-07-31)

## Upstream skills retained

From `addyosmani/agent-skills@7829ffd90d973b6325f5f12f1b1226dcace74443` (MIT), unmodified:

| Skill | Keep? | Rationale |
| --- | --- | --- |
| `source-driven-development` | **Yes** | Matches Context7 + pinned AI SDK/Electron docs need |
| `incremental-implementation` | **Yes** | Aligns with milestone/slice discipline in `docs/AGENTS.md` |
| `debugging-and-error-recovery` | **Yes** | Useful for Electron/native/module failures |
| `code-review-and-quality` | **Yes** | Fits PR review agents; keep activation scoped |
| `security-and-hardening` | **Yes** | Reinforces IPC/secrets/injection posture |

No other upstream skills installed (megabundles rejected).

## Omakase-specific skills

| Skill | Keep? | Rationale |
| --- | --- | --- |
| `omakase-ai-change` | **Yes** | Eval-first workflow for prompts/tools/context |
| `omakase-probe-evaluation` | **Yes** | Encodes mastery/evidence invariants |
| `omakase-source-ingestion` | **Yes** | Anchors, hashing, injection, packaged paths |
| `omakase-release-verification` | **Yes** | Golden-path / verify commands |

## Conceptual comparison (with vs without)

Representative tasks reviewed against skill procedures (not a large automated harness):

1. **Change Probe mastery rule** — without skill: easy to skip evidence fixture; with `omakase-probe-evaluation`: forces verbatim + reading-only checks.
2. **Bump AI SDK usage** — without skill: risk of remembered APIs; with `source-driven-development` + `omakase-ai-change`: version pin + eval first.
3. **Add IPC channel** — without skill: may widen bridge; with `security-and-hardening` + architecture tests: allowlist pressure.
4. **Release claim** — without skill: docs-only optimism; with `omakase-release-verification`: `pnpm verify` evidence.

Token overhead: project skills are short; upstream skills are longer (`security-and-hardening` ~467 lines). Acceptable because they are progressive-disclosure and not alwaysApply rules.

## Rejected / not installed

- Full `addyosmani/agent-skills` pack (interview-me, idea-refine, etc.) — ceremony without clear Omakase ROI
- Evalite skill/tooling — beta, deferred
- Graphify’s default always-on exploration skill/rule — conflicts with optional stance (replaced)

## Final skill set

Small and justified: **5 upstream + 4 Omakase-specific**, plus provenance in `.cursor/skills/UPSTREAM.md`.

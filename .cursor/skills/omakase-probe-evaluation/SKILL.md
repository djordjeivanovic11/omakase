---
name: omakase-probe-evaluation
description: Use when changing Probe, mastery, learner evidence, questioning, or Learning Maps. Verifies one-question adaptation, verbatim evidence, and deterministic mastery rules.
---

# Omakase Probe evaluation

## Entry conditions

Activate for Probe machine, rubrics, mastery transitions, evidence excerpts, Learning Map, or next-action after Probe.

## Required checks

1. One open-ended question at a time
2. Question purpose and rubric present
3. Adaptation based on the prior answer
4. Exact evidence excerpt validation (verbatim in learner answer)
5. Deterministic mastery transition rules
6. Contradictory-evidence handling
7. Correction and retraction via new events
8. No mastery gain from source exposure alone
9. Next-action quality after completion
10. Persistence after restart

## Evidence required

- Fixture or eval covering the changed behavior
- `learner-evidence` / `probe-adaptation` / `mastery-transitions` datasets updated when semantics change
- Projector rebuild still consistent

## Failure modes

- Static questionnaires as primary UX
- Using source text or agent feedback as learner evidence
- Promoting to `can_explain` from reading alone

See `references/rubric.md`.

# Review Rubric Audit

Date: 2026-06-21

## P1 Map

System boundary: prompt-time review guidance only. The public hook route remains
`UserPromptSubmit.default`; no host adapter route or Stop route is added. The
single shell output owner remains `assets/hooks/prompt-guard.sh`.

Authoritative surfaces:

- `src/cli/hook/review-rubric.ts` owns `REVIEW_RUBRIC_VERSION = 1` and the
  stable renderer.
- `src/cli/hook-entry.ts review-rubric` exposes the renderer through dynamic
  import so ordinary hook dispatch does not load it.
- `assets/hooks/prompt-guard.sh` injects the rubric only when the TypeScript
  classifier reports `REVIEW_RELEASE`.
- `.ai/hooks/prompt-guard.sh` is the generated self-host projection.

Out of scope: Stop review evidence, review freshness invalidation, model
execution, edits, file writes, and Waza `/check` execution.

## P2 Trace

Concrete route:

1. Host fires `UserPromptSubmit.default`.
2. `prompt-guard.sh` sends prompt facts to the existing TypeScript decision
   engine.
3. When `PG_FACT REVIEW_RELEASE` is true, `emit_waza_route_hint` prints the
   existing Waza `/check` route hint.
4. The same branch calls `review_rubric_prompt`, which resolves
   `repo-harness-hook review-rubric --format prompt` through the shared hook CLI
   resolver.
5. `hook-entry.ts` dynamically imports `review-rubric.ts` and prints the stable
   v1 prompt.
6. `emit_external_acceptance_prompt` embeds the same v1 rubric in the peer
   acceptance prompt while preserving "do not run /check", "do not edit files",
   and current plan/contract/review/checks paths.

Implementation and planning prompts do not hit this branch and do not receive
the rubric.

## P3 Decision

The current design keeps review routing in `prompt-guard.sh` because that file
already owns Waza `/check`, external acceptance, and cross-review hints. Adding a
new route or second UserPromptSubmit script would create competing output owners
and risk double JSON/host protocol drift.

The rubric is stable text rather than policy JSON because it is review prompt
material, not a runtime decision. Its invariant is severity ordering:
correctness, security, compatibility, and missing tests outrank
minimal-change/YAGNI concerns. Minimal-change appears only as a maintenance-cost
dimension and cannot by itself become P0/P1.

At 10x usage, the first failure mode would be prompt noise, not CPU. The rubric
is therefore restricted to review/release intent and stays out of execution,
planning, and passive status prompts.

## Verification

- `bun run check:type`
- `bun run check:hooks`
- `bun test tests/review-rubric.test.ts tests/hook-runtime.test.ts tests/cli/hook.test.ts tests/hook-source-projection.test.ts`

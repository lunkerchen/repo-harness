# Sprint Review: codegraph-readiness

> **Status**: Dependency + detector slice implemented; full CLI registration pending
> **Plan**: plans/plan-20260528-1652-codegraph-readiness.md
> **Contract**: tasks/contracts/codegraph-readiness.contract.md
> **Notes File**: tasks/notes/codegraph-readiness.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-05-28
> **Recommendation**: pending

## Mode Evidence

- Selected route: `plan-eng-review` correction pass.
- P1 map: CodeGraph readiness crosses the future CLI, the current external tooling probe, generated policy/template surfaces, and root agent docs.
- P2 trace: readiness currently enters through `scripts/check-agent-tooling.sh`; the new plan must route future CLI doctor and tools ensure behavior through one implementation instead of duplicating the detector.
- P3 decision: keep the separate `tools ensure codegraph` registry so host-adapter install semantics do not absorb tool lifecycle semantics.

## Verification Evidence

- Review findings were written into the plan, contract, and notes.
- Dependency + detector slice implemented on 2026-05-28.
- Full contract remains open until `agentic-dev tools ensure codegraph` and `agentic-dev doctor` are registered after the hook-global runtime CLI scaffold lands.

## Current Blocking Findings

- None for the dependency + detector slice.
- Full implementation remains gated by the contract exit criteria and a later review update with `Recommendation: pass`.

## Retest Steps

- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun test tests/check-agent-tooling.test.ts tests/cli/codegraph-resolver.test.ts`
- `bash scripts/ensure-codegraph.sh --check --json`
- `bash scripts/check-agent-tooling.sh --host codex --strict-readiness --json`
- During implementation, run every command listed in `tasks/contracts/codegraph-readiness.contract.md`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Plan clarity | 8/10 | Scope now names contract, generated policy, and existing detector reuse. |
| Boundary control | 8/10 | Host install and tool readiness are kept separate. |
| Test readiness | 8/10 | Detector and read-only ensure tests exist; full CLI tests remain pending. |
| Execution readiness | 7/10 | Dependency + detector slice is implemented; command registration waits for the CLI scaffold. |

## Summary

The first implementation slice is coherent and verified. Do not treat this review as completion of the CodeGraph readiness contract until the full CLI surface lands and the recommendation changes to `pass`.

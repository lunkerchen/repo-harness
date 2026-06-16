# Transactional Adoption Planner Notes

> **Status**: Executing
> **Sprint**: `plans/sprints/20260616-architecture-upgrade-sprint.md`

## Phase 1 Evidence

- Added the adoption operation model under `src/core/adoption/` with stable operation IDs, mode typing, plan summaries, `.gitignore` managed block planning, and JSON/text renderers.
- Added the safe operation applicator subset under `src/effects/` for `mkdir`, `writeFile ifMissing`, and `appendManagedBlock`.
- Wired only `repo-harness adopt --dry-run --json` to the TypeScript planner. Default apply and human-readable dry-run still go through the existing `runInit()` / `scripts/migrate-project-template.sh` compatibility path.
- Added fixture-backed tests and a CLI smoke test in `tests/cli/adoption-plan.test.ts`.

## Verification

```bash
bun test tests/cli/adoption-plan.test.ts
```

Result: pass, 9 tests.

## Decisions

- The JSON dry-run output redacts operation content and exposes `contentHash` plus a short preview so stdout stays reviewable and does not dump large generated templates.
- Self-host mode records a skipped `runCheck` operation plus warning instead of migrating hooks/helpers in this sprint, preserving the self-host source repo boundary.
- The first `.gitignore` planner step uses a single `repo-harness generated-runtime` managed block and supports replacing the legacy `claude-runtime-temp` block.

# Task Execution Checklist (Primary)

> **Source Plan**: plans/plan-20260528-1652-codegraph-readiness.md
> **Status**: Executing
> **Phase Progress**: Dependency + detector slice complete 2026-05-28; full CLI integration waits for hook-global runtime Phase 1A
> **Generated**: 2026-05-28 17:58
> **Source Plan Slug**: codegraph-readiness
> **Review File**: tasks/reviews/codegraph-readiness.review.md
> **Notes File**: tasks/notes/codegraph-readiness.notes.md
> **Capability ID**: verification-codegraph-readiness
> **Parent Run ID**: run-20260528T1758
> **Supersedes**: plans/plan-20260528-1436-hook-global-runtime.md

## Execution

- [x] Materialize `tasks/contracts/codegraph-readiness.contract.md`, `tasks/notes/codegraph-readiness.notes.md`, and `tasks/reviews/codegraph-readiness.review.md`
- [x] Add `@colbymchenry/codegraph` as a self-host dev dependency and generate `bun.lock`
- [x] Add `scripts/ensure-codegraph.sh` plus temporary `src/cli/tools/codegraph-runner.ts`
- [x] Add `src/cli/tools/codegraph.ts` facade for future CLI reuse
- [x] Update `scripts/check-agent-tooling.sh` to resolve CodeGraph local-first and report global drift/fallback
- [x] Keep generated downstream policy default explicit: no package dependency unless local policy opts in
- [x] Document self-host CodeGraph readiness and register the capability/architecture module
- [x] Verify read-only check paths do not run `bun install`, `codegraph init`, `codegraph sync`, or `codegraph install`
- [ ] Execute full `agentic-dev tools ensure codegraph` / `agentic-dev doctor` CLI registration after hook-global runtime Phase 1A lands
- [ ] Update `tasks/reviews/codegraph-readiness.review.md` to `Recommendation: pass` only after the full contract exit criteria pass

## Verification

```bash
bun test tests/check-agent-tooling.test.ts tests/cli/codegraph-resolver.test.ts
bash scripts/ensure-codegraph.sh --check --json
bash scripts/check-agent-tooling.sh --host codex --strict-readiness --json
```

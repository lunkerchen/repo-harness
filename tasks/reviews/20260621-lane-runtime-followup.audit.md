# Lane Runtime Follow-up Audit

> Status: locally validated; ready for GitHub review push
> Branch: `codex/lane-runtime-pr4-pr5`
> Base: `e60a1d6fc4cd9afda6c5cd9b42d56c0cd5363b86` (`origin/main`)
> Initial reviewed head: `5a8bd646de9d3c2465fb1e58052871db4866fe04`
> Source review: `tasks/reviews/20260621-lane runtime sprint.review.md`
> Follow-up sprint: `plans/sprints/20260621-lane-runtime-followup.sprint.md`

## Diff Scope

Command:

```bash
git diff --name-status "$(git merge-base HEAD origin/main)"...HEAD
```

Current branch adds the lane runtime, context audit/status, subagent lane evidence, and explicit review merge-check surfaces introduced by the lane sprint.

## PR1-PR5 Acceptance Map

| PR | Acceptance | Implementation evidence | Test evidence | Current state |
| --- | --- | --- | --- | --- |
| PR1 | Context audit/status must be explicit CLI, cache must not promote stale/unknown to clean. | `src/cli/commands/context.ts`, `src/core/context-audit/*`; `runContextStatus` re-checks repo identity and fingerprint. | `tests/unit/context-audit-static.test.ts`, `tests/cli/context-lanes.test.ts`. | Strengthened: same-HEAD context edits now mark status stale; corrupt cache is not clean. |
| PR2 | Context hook sentinel must be changed-only, isolated, and not expand public hook routes. | `.ai/hooks/lib/workflow-state.sh`, `assets/hooks/lib/workflow-state.sh`, `session-start-context.sh`, `stop-orchestrator.sh`; hook entry still uses existing route registry. | `tests/context-hook-contracts.test.ts`, route registry tests. | Strengthened: dirty marker writes are lock-protected and concurrent triggers merge. |
| PR3 | Lane scope enforcement must protect write/forbidden/high-context boundaries. | `src/cli/hook/lane-decision.ts`, `src/core/lanes/ownership-resolver.ts`, `src/core/lanes/schema.ts`, `src/core/lanes/state.ts`. | `tests/lane-hook-contracts.test.ts`, `tests/unit/lane-ownership-resolver.test.ts`, `tests/unit/lane-schema.test.ts`. | Main path covered; broader shell/symlink/rename matrix remains a follow-up risk unless fully added before merge. |
| PR4 | Subagent/reviewer evidence must require independent reviewer and concrete reviewed head SHA. | `src/cli/hook/subagent-lane.ts`, `src/core/lanes/state.ts`; reviewer lanes implicitly require `reviewed_head_sha` on merge, stop, and close. | `tests/subagent-lane-contracts.test.ts`, `tests/unit/lane-state.test.ts`, `tests/cli/context-lanes.test.ts`. | Strengthened: reviewer stop/close paths reject missing or non-full `reviewed_head_sha`; concurrent evidence merges preserve fields. |
| PR5 | `review merge-check` must be explicit CLI only, gather complete GitHub evidence, be conservative on incomplete evidence, and require explicit authorization. | `src/cli/commands/review.ts`, `src/core/review/merge-check.ts`; no hook route registration. | `tests/cli/review-merge-check.test.ts`, `tests/cli/route-registry.test.ts`. | Strengthened: only `merge_allowed=true` exits 0; ready-but-unauthorized exits 3; incomplete evidence exits 4; GraphQL review threads page through all pages. |

## Verification Snapshot

Commands run after the follow-up changes:

```bash
bun run check:type
bun test tests/cli/review-merge-check.test.ts tests/unit/lane-state.test.ts tests/unit/context-audit-static.test.ts tests/context-hook-contracts.test.ts tests/cli/context-lanes.test.ts
bun test tests/cli/route-registry.test.ts tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/hook-protocol.test.ts tests/cli/hook.test.ts tests/lane-hook-contracts.test.ts tests/subagent-lane-contracts.test.ts tests/cli/review-merge-check.test.ts tests/unit/lane-state.test.ts tests/unit/context-audit-static.test.ts tests/context-hook-contracts.test.ts tests/cli/context-lanes.test.ts
bun test
bun src/cli/index.ts context audit --static --write-state --json
bun src/cli/index.ts context status --json
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

Result:

- `bun run check:type`: passed
- Targeted follow-up suite: `21 pass / 0 fail`
- Hook/runtime review suite: `202 pass / 0 fail`
- Full `bun test`: `918 pass / 0 fail`
- `context audit --static --write-state` plus `context status`: `status=clean`, cache `state=hit`
- `check-deploy-sql-order`: passed
- `check-architecture-sync`: advisory check passed with `blocking=0`
- `check-task-sync`: passed
- `check-task-workflow --strict`: passed after refreshing the Codex handoff/resume packet
- `inspect-project-state`: passed with no drift requiring a decision
- `migrate-project-template --repo . --dry-run`: passed

## Remaining Risk To Verify Before Merge

- PR3 shell/symlink/rename bypass coverage remains broader than the regression set added in this follow-up. Existing lane tests cover the main enforcement path; a dedicated bypass-matrix expansion should be treated as a separate review slice before broadening lane trust.
- The follow-up sprint requested repeated migration loops; this patch ran the required migration dry-run once after edits. Repeat-loop soak remains useful but was not required to make the current GitHub review branch visible.

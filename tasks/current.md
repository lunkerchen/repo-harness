# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-24T00:52:08+0800 -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: 2026-06-24T00:52:08+0800
> **Source Branch**: main
> **Source Commit**: c75273d
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: split-hook-latency-from-codegraph-rollout
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Idle
- Active Plan: (none)
- Plan Status: (none)
- Next Task: (none)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- (none)
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/single-source-minimal-change-review. Command: bash scripts/contract-worktree.sh cleanup --slug single-source-minimal-change-review --target main

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 8 changed/untracked path(s)

```
 M .ai/hooks/.projection.json
 M .ai/hooks/post-tool-observer.sh
 M .ai/hooks/prompt-guard.sh
 M assets/hooks/post-tool-observer.sh
 M assets/hooks/prompt-guard.sh
 M src/cli/hook/runtime.ts
 M tests/cli/hook.test.ts
 M tests/hook-runtime.test.ts
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- PRDs: `plans/prds/*.prd.md`
- Sprints: `plans/sprints/*.sprint.md`
- Active sprint marker: `.ai/harness/sprint/active-sprint`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`

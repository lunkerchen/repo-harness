# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-01T03:11:05+0800 -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: 2026-06-01T03:11:05+0800
> **Source Branch**: main
> **Source Commit**: c93ee71
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: release-0.1.5-merge
> **Derived From**: active-plan, workstreams, handoff, checks, git status

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
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/tgz-pick-wt. Command: bash scripts/contract-worktree.sh cleanup --slug tgz-pick-wt --target main

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 19 changed/untracked path(s)

```
M  assets/skill-commands/repo-harness-ship/SKILL.md
M  assets/templates/helpers/check-task-workflow.sh
M  assets/templates/helpers/contract-worktree.sh
M  assets/templates/helpers/prepare-codex-handoff.sh
M  assets/templates/helpers/ship-worktrees.sh
M  deploy/release-checklists/260601-repo-harness-0.1.5.md
M  docs/CHANGELOG.md
A  plans/archive/plan-20260601-0139-tgz-pick-wt.md
M  scripts/check-task-workflow.sh
M  scripts/contract-worktree.sh
M  scripts/prepare-codex-handoff.sh
M  scripts/ship-worktrees.sh
A  tasks/archive/notes-20260601-0309-tgz-pick-wt.md
A  tasks/archive/todo-20260601-0309-tgz-pick-wt.md
A  tasks/contracts/20260601-0139-tgz-pick-wt.contract.md
M  tasks/current.md
A  tasks/reviews/20260601-0139-tgz-pick-wt.review.md
M  tests/helper-scripts.test.ts
?? plans/plan-20260601-0106-tgz-pick-wt.md
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`

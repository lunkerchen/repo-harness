# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-05-31T21:31:13+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-05-31T21:31:13+0800
> **Source Branch**: main
> **Source Commit**: 97d0465
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: plan-stem-task-artifact-names
> **Derived From**: active-plan, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: (none)
- Plan Status: (none)
- Next Task: inspect active worktree marker(s)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- /Users/ancienttwo/Projects/agentic-dev-wt-attachment-context-priority: plans/plan-20260531-0326-codex-attachment-context-priority.md
- /Users/ancienttwo/Projects/agentic-dev-wt-attachment-context-priority: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-attachment-context-priority
- /Users/ancienttwo/Projects/agentic-dev-wt-codex: plans/plan-20260531-0326-codex.md
- /Users/ancienttwo/Projects/agentic-dev-wt-codex: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-codex
- /Users/ancienttwo/Projects/agentic-dev-wt-prompt-guard-cli-rewrite-plan: plans/plan-20260531-1847-prompt-guard-cli-rewrite-plan.md
- /Users/ancienttwo/Projects/agentic-dev-wt-prompt-guard-cli-rewrite-plan: active-worktree owner -> /Users/ancienttwo/Projects/agentic-dev-wt-prompt-guard-cli-rewrite-plan
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/attachment-context-priority. Command: bash scripts/contract-worktree.sh cleanup --slug attachment-context-priority --target main

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 35 changed/untracked path(s)

```
 M .ai/hooks/lib/workflow-state.sh
 M AGENTS.md
 M CLAUDE.md
 M README.md
 M README.zh-CN.md
 M assets/hooks/lib/workflow-state.sh
 M assets/partials-agents/04-task-protocol.partial.md
 M assets/partials-agents/06-quality-safety.partial.md
 M assets/partials/07-footer.partial.md
 M assets/partials/08-orchestration.partial.md
 M assets/reference-configs/evaluator-rubric.md
 M assets/reference-configs/harness-overview.md
 M assets/reference-configs/sprint-contracts.md
 M assets/templates/contract.template.md
 M assets/templates/helpers/archive-workflow.sh
 M assets/templates/helpers/capture-plan.sh
 M assets/templates/helpers/codex-handoff-resume.sh
 M assets/templates/helpers/contract-worktree.sh
 M assets/templates/helpers/ensure-task-workflow.sh
 M assets/templates/helpers/new-plan.sh
 M assets/templates/helpers/plan-to-todo.sh
 M assets/templates/plan.template.md
 M docs/CHANGELOG.md
 M docs/reference-configs/evaluator-rubric.md
 M docs/reference-configs/harness-overview.md
 M docs/reference-configs/sprint-contracts.md
 M scripts/archive-workflow.sh
 M scripts/capture-plan.sh
 M scripts/codex-handoff-resume.sh
 M scripts/contract-worktree.sh
 M scripts/ensure-task-workflow.sh
 M scripts/lib/project-init-lib.sh
 M scripts/new-plan.sh
 M scripts/plan-to-todo.sh
 M tests/helper-scripts.test.ts
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`

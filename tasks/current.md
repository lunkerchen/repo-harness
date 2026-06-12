# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-13T00:46:43+0800 -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: 2026-06-13T00:46:43+0800
> **Source Branch**: main
> **Source Commit**: cc859b5
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: runtime-isolation-closeout
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

- Sprint: `plans/sprints/20260612-0236-loop-engine.sprint.md`
- Sprint Status: Done
- Backlog: 8/8
- Next Sprint Task: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/prd-sprint-skills. Command: bash scripts/contract-worktree.sh cleanup --slug prd-sprint-skills --target main

## Checks

- status=pass, source=post-bash, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 92 changed/untracked path(s)

```
 M .ai/context/context-map.json
 M .ai/harness/policy.json
 M .ai/harness/workflow-contract.json
 M .ai/hooks/AGENTS.md
 M .ai/hooks/CLAUDE.md
 M .ai/hooks/session-start-context.sh
 M .claude/templates/contract.template.md
 M .claude/templates/plan.template.md
 M .claude/templates/sprint.template.md
 M AGENTS.md
 M CLAUDE.md
 M README.md
 M SKILL.md
 M assets/hooks/AGENTS.md
 M assets/hooks/CLAUDE.md
 M assets/hooks/session-start-context.sh
 M assets/partials-agents/02-operating-mode.partial.md
 M assets/partials-agents/03-orchestration.partial.md
 M assets/partials-agents/04-task-protocol.partial.md
 M assets/partials-agents/06-quality-safety.partial.md
 M assets/partials/04-project-structure.partial.md
 M assets/partials/05-workflow.partial.md
 M assets/partials/08-orchestration.partial.md
 M assets/reference-configs/agentic-development-flow.md
 M assets/reference-configs/document-generation.md
 M assets/reference-configs/external-tooling.md
 M assets/reference-configs/harness-overview.md
 M assets/reference-configs/heartbeat-triage.md
 M assets/reference-configs/hook-operations.md
 M assets/reference-configs/sprint-contracts.md
 M assets/skill-commands/manifest.json
 M assets/skill-commands/repo-harness-architecture/SKILL.md
 M assets/skill-commands/repo-harness-check/SKILL.md
 M assets/skill-commands/repo-harness-deploy/SKILL.md
 M assets/skill-commands/repo-harness-handoff/SKILL.md
 M assets/skill-commands/repo-harness-init/SKILL.md
 M assets/skill-commands/repo-harness-plan/SKILL.md
 M assets/skill-commands/repo-harness-ship/SKILL.md
 M assets/skill-commands/repo-harness-sprint/SKILL.md
 M assets/templates/contract.template.md
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- Sprints: `plans/sprints/*.sprint.md`
- Active sprint marker: `.ai/harness/sprint/active-sprint`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`

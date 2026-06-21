# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-21T23:22:14+0800 -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: 2026-06-21T23:22:14+0800
> **Source Branch**: codex/release-0.7.5
> **Source Commit**: 75b7a50
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: mcp-external-gates-blocker
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

- Summary: 48 changed/untracked path(s)

```
 M .github/workflows/ci.yml
MM README.md
MM docs/CHANGELOG.md
MM docs/repo-harness-chatgpt-mcp-setup.md
AM plans/sprints/20260621-mcp-fix.sprint.md
 M src/cli/commands/adopt-plan.ts
 M src/cli/commands/init.ts
MM src/cli/commands/mcp.ts
MM src/cli/mcp/auth.ts
 M src/cli/mcp/instructions.ts
MM src/cli/mcp/oauth.ts
MM src/cli/mcp/paths.ts
MM src/cli/mcp/policy.ts
MM src/cli/mcp/server.ts
MM src/cli/mcp/setup.ts
MM src/cli/mcp/tools.ts
MM src/cli/mcp/transports/http.ts
MM src/cli/mcp/types.ts
MM tasks/current.md
 M tests/bootstrap-files.test.ts
 M tests/cli/adoption-plan.test.ts
 M tests/cli/init.test.ts
MM tests/cli/mcp-http.test.ts
MM tests/cli/mcp-policy.test.ts
MM tests/cli/mcp-setup.test.ts
MM tests/cli/mcp-tools.test.ts
MM tests/cli/mcp.test.ts
 M tests/hook-recursive-copy.test.ts
?? .ai/harness/handoff/mcp-reader-external-gates-blocker.md
?? .ai/harness/handoff/mcp-reader-local-http-e2e.md
?? .ai/harness/handoff/mcp-reader-review-prep.md
?? .ai/harness/handoff/mcp-reader-review-request.md
?? .ai/harness/handoff/mcp-reader-self-review.md
?? .ai/harness/handoff/mcp-reader-sprint-closeout.md
?? plans/prds/20260621-repo-harness-mcp-reader-hardening-prd.md
?? "plans/prds/Cherry-pick Analysis of Ponytail into Repo-harness Hooks.md"
?? plans/sprints/20260621-minimal-change-hooks.sprint.md
?? plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md
?? plans/sprints/20260621-single-source-minimal-change-review.sprint.md
?? src/cli/mcp/reader-tools.ts
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

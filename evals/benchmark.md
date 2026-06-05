# Skill Benchmark Report

Latest iteration: `iteration-20260606-023606-darwin-fulltest-route-fix`

Workspace root: `/Users/ancienttwo/Projects/repo-harness-workspace`

Generated: 2026-06-05T18:39:12.608Z

## Quality Metrics

| Metric | Value |
| --- | ---: |
| full_test_count | 1 |
| dry_run_count | 0 |
| dry_run_ratio | 0.0% |
| grader_pass_rate | 100.0% (4/4) |
| effectiveness_authority | authoritative |

Effectiveness evidence is authoritative for this benchmark run.

## Command Matrix

| Agent | Profile | Command |
| --- | --- | --- |
| codex | with_skill | `codex exec -C /Users/ancienttwo/Projects/repo-harness-workspace/iteration-20260606-023606-darwin-fulltest-route-fix/codex/with_skill/route-workflow-check --dangerously-bypass-approvals-and-sandbox -o /Users/ancienttwo/Projects/repo-harness-workspace/iteration-20260606-023606-darwin-fulltest-route-fix/codex/with_skill/route-workflow-check/final-response.md --add-dir /Users/ancienttwo/Projects/agentic-dev 'Check whether this repo-harness harness is ready to merge. Run the workflow gates, inspector, task sync, and migration dry-run and give me the release readiness verdict.'` |

## codex / with_skill

| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |
| --- | --- | --- | ---: | ---: | --- |
| route-workflow-check | success | 0 / graders pass | 186196ms | 0 | [workspace](../repo-harness-workspace/iteration-20260606-023606-darwin-fulltest-route-fix/codex/with_skill/route-workflow-check) |

### route-workflow-check

- Eval: `12`
- Workspace: [../repo-harness-workspace/iteration-20260606-023606-darwin-fulltest-route-fix/codex/with_skill/route-workflow-check](../repo-harness-workspace/iteration-20260606-023606-darwin-fulltest-route-fix/codex/with_skill/route-workflow-check)
- Changed files: none
- Diff summary: no diff captured
- Agent status: success (exit 0)
- Graders: passed (4/4 passed)
- Final response excerpt: **结论** 不可合并，release readiness 是 **RED**。 我按 `repo-harness-check` 路由检查了当前 repo。目标 repo 工作树干净，但 harness 本身没有达到 tasks-first contract 的最低形态：缺 `.ai/harness/workflow-contract.json`、缺 `.ai/harness/`、缺 `plans/`、缺任务 contract/rev…
- Expectations:
  - Uses check as a verification entrypoint, not a mutating repair.
  - Includes inspector and migration dry-run in the evidence set.
  - Gives a readiness verdict grounded in command output.
- Grader results:
  - PASS files_exist: files_exist: final-response.md
  - PASS files_contain: files_contain: final-response.md =~ repo-harness-check
  - PASS files_contain: files_contain: final-response.md =~ check-task-sync
  - PASS files_contain: files_contain: final-response.md =~ migrate-project-template.*dry-run

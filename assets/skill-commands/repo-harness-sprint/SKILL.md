---
name: repo-harness-sprint
description: Program-level sprint planning and execution entrypoint. Discusses a PRD with the user from PM and architect perspectives, decomposes it into an ordered backlog in tasks/sprints/, then drives backlog tasks one at a time through the existing plan, contract, and worktree flow.
when_to_use: "repo-harness-sprint, plan a sprint, create sprint backlog, PRD to backlog, run next sprint task, sprint status"
---

# repo-harness-sprint

Use this command to plan a program-level Sprint (PRD + ordered backlog) and execute its tasks through the existing task-contract flow. Sub-routes: `plan`, `run`, `status`.

## Protocol

1. Confirm the working repo with `git rev-parse --show-toplevel`; read `docs/spec.md`, `.ai/harness/policy.json`, and `bash scripts/sprint-backlog.sh status` when present.
2. Route `plan` (default when no sprint is active):
   - Discuss the PRD with the user from two named perspectives before writing anything: product (problem, users, success criteria, acceptance scenarios, non-goals) and architecture (capabilities touched, dependency order, risks, slice granularity).
   - Run `bash scripts/sprint-backlog.sh init --slug <slug> --title <title>`, then fill `## PRD`, `## Architecture Notes`, and the ordered `## Backlog` table; every row needs a concrete machine-checkable acceptance line and a mode (`contract` or `inline`).
   - Present the draft sprint to the user. Only after explicit approval set `> **Status**: Approved`; `check-task-workflow.sh --strict` rejects placeholder PRDs, placeholder acceptance lines, and duplicate backlog rows.
3. Route `run` (incremental, one backlog task per invocation):
   - Run `bash scripts/sprint-backlog.sh next` to resolve the next pending row; when it exits 3, report the backlog as complete and recommend setting the sprint Status to Done after review.
   - Run `bash scripts/sprint-backlog.sh start-task --execute` to capture the task plan with `--source repo-harness-sprint` and project it through `plan-to-todo.sh` into the contract worktree flow.
   - Execute the slice as usual (implement, `/check`, external acceptance, `scripts/contract-worktree.sh finish`); finish back-fills the backlog row warn-only.
4. Route `status`: report `bash scripts/sprint-backlog.sh status` plus the Active Sprint section of `tasks/current.md`; mutate nothing.
5. After each completed task, re-read the sprint file before starting the next one; user edits to the backlog override stale session memory.

## Failure Modes

- If no sprint file exists and the user asked for `run` or `status`, report that no sprint is active and route to `plan`.
- If the backlog table is malformed or `check-task-workflow.sh --strict` rejects the sprint, stop and fix the sprint file before starting any task.
- If `start-task` fails after the plan was captured, report the orphan plan path and stop instead of retrying blindly.
- If a task contract is already executing in this worktree, finish or archive it first; never stack a second backlog task on top of it.

## Boundaries

- Does not implement backlog tasks itself; execution always flows through the existing plan -> contract -> worktree -> verify gates.
- Does not set `> **Status**: Approved` without explicit user approval of the PRD and backlog.
- Never bypasses `/check`, external acceptance, or `verify-sprint.sh` to mark a backlog row complete.
- Goal mode (`run --goal`, autonomous continuation) is not part of this command yet; treat requests for it as future work and say so.
- Do not run two backlog tasks in parallel: concurrent contract rows merge-conflict on the sprint file's Updated and Execution Log lines; the backlog is an ordered queue.
- `tasks/todo.md` stays the deferred-goal ledger; never write the backlog there.

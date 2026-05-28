# Sprint Review: hook-global-runtime

> **Status**: Pending
> **Plan**: plans/plan-20260528-1436-hook-global-runtime.md
> **Contract**: tasks/contracts/hook-global-runtime.contract.md
> **Notes File**: tasks/notes/hook-global-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-05-28 16:05
> **Recommendation**: pass for Phase 0 canary prep; keep Phase 1 contract open

## Mode Evidence

- Selected route: Waza `/check` branch acceptance.
- P1 map: current branch only contains Phase 0 canary prep, workflow task artifacts, and a portable strict-check fix. It does not contain the Phase 1 CLI runtime, installer, doctor, migrate, docs, or distribution surfaces named by the wider contract.
- P2 trace: `scripts/canary-global-hook.sh install` writes tagged hook entries to host-level Codex and Claude JSON files, `status` counts tagged entries and Codex trust-state keys, and `uninstall` removes only entries whose command contains `agentic-dev-canary`.
- P3 decision: accept the canary prep as a bounded reviewable unit, but do not mark the full global hook runtime contract complete until Phase 1 artifacts and host smoke evidence exist.

## Verification Evidence

- Commands run:
  - `bash -n scripts/canary-global-hook.sh`
  - `HOME="$(mktemp -d)" bash scripts/canary-global-hook.sh install`
  - `HOME="$(mktemp -d)" bash scripts/canary-global-hook.sh status`
  - `HOME="$(mktemp -d)" bash scripts/canary-global-hook.sh uninstall`
  - `bun test`
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-task-sync.sh`
  - `bash scripts/check-task-workflow.sh --strict`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `bun test tests/helper-scripts.test.ts`
- Manual checks: no real `~/.codex/hooks.json` or `~/.claude/settings.json` mutation was performed during acceptance; canary install/uninstall was validated under a temporary `HOME`.
- Supporting artifacts: `plans/plan-20260528-1436-hook-global-runtime.md`, `tasks/contracts/hook-global-runtime.contract.md`, `tasks/notes/hook-global-runtime.notes.md`, `scripts/canary-global-hook.sh`.
- Implementation notes reviewed: yes.
- Run snapshot: current shell transcript.

## Behavior Diff Notes

- Adds a dual-host canary script for Phase 0 operational validation.
- Fixes `check-task-workflow.sh` capability binding detection on macOS/BSD grep by matching literal `>` portably.

## Residual Risks / Follow-ups

- Phase 0 still needs real host smoke: install canary into actual user-level hook files, restart/trigger Codex and Claude, record trust prompt and hash behavior, then uninstall.
- Phase 1 remains unimplemented: CLI `install` / `hook` / `status` / `doctor` / `migrate`, contract schema changes, docs, distribution, and migration behavior.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 7/10 | Phase 0 canary prep works in isolated HOME; real host smoke remains manual. |
| Product depth | 6/10 | Correctly narrows the first slice, but does not yet deliver the global CLI product. |
| Design quality | 7/10 | Keeps repo-local artifacts and host-global canary separate. |
| Code quality | 8/10 | Shell syntax and idempotent JSON mutation validated; portable grep fix applied. |

## Failing Items

- Full contract exit criteria are not met; this review only accepts the Phase 0 prep slice.

## Retest Steps

- Re-run the commands listed in Verification Evidence.
- For real host smoke, run `bash scripts/canary-global-hook.sh install`, trigger Codex/Claude events, capture `status` and log output, then run `bash scripts/canary-global-hook.sh uninstall`.

## Summary

- Pass this branch as a bounded Phase 0 canary-prep merge. Do not claim the full global hook runtime is complete.

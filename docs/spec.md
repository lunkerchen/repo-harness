# Product Spec: repo-harness

> **Status**: Active
> **Last Updated**: 2026-04-19 01:04
> **Owner**: Planner

## Product Outcome

Install, update, generate, and migrate repo-local agentic workflow contracts for
Claude and Codex through the `repo-harness` CLI and hook automation layer. The
skill entrypoint, formerly `repo-harness-skill`, remains a compatibility router;
workflow authority lives in repo-local artifacts, scripts, hooks, and the
versioned contract this repository self-hosts for downstream repos.

## Success Criteria

- Primary workflow:
  install or refresh the CLI+hooks runtime and, for repo-local adoption,
  create/migrate `plans/`, `tasks/`, `.ai/context/`, `.ai/harness/`, shared
  hooks, and verification helpers so they are internally consistent.
- Command surface:
  expose `repo-harness` CLI commands plus thin compatibility facades for
  planning, review, autoplan, ship, init, scaffold, migrate, upgrade,
  capability configuration, architecture maintenance, handoff rollover, deploy
  readiness, repair, and check without duplicating the workflow engine.
- Quality bar:
  self-migration is idempotent, critical parity surfaces stay aligned, and the
  required verification commands pass in this repo.
- Out of scope:
  replicating the full Hermes runtime, adding a SQLite session store, or building
  a multi-provider agent gateway.

## Constraints

- Technical:
  keep workflow state file-backed with Markdown, JSON, and JSONL; keep root
  routing docs short; prefer shared helper libraries over duplicated logic.
- Compliance:
  contracts must be machine-readable where possible and safe to keep as long-lived
  repo context.
- Delivery:
  self-host and generated critical surfaces should move together, with tests
  guarding the important parity points.

## Acceptance Scenarios

- Given
  a repository missing the tasks-first harness,
  When
  `bash scripts/migrate-project-template.sh --repo <repo> --apply` runs,
  Then
  `docs/spec.md`, `tasks/reviews/`, `.ai/context/context-map.json`,
  `.ai/harness/policy.json`, `.ai/harness/workflow-contract.json`, and the
  required helper scripts exist and
  `bash scripts/check-task-workflow.sh --strict` passes.

- Given
  hook-backed workflow events such as tool tracing or handoff refresh,
  When
  the shared workflow state helpers append structured metadata,
  Then
  `.claude/.trace.jsonl` and `.ai/harness/events.jsonl` are written without
  aborting the session flow.

- Given
  a user asks to initialize an existing repo or scaffold a new project,
  When
  the CLI command/facade surface routes the request,
  Then
  `repo-harness-init` routes existing repo adoption through
  `repo-harness update` from the target repo root without requiring `--repo .`, and
  `repo-harness-scaffold` handles new project or module creation, while hook and
  docs initialization remain internal implementation steps.

## Open Questions

- Should `.ai/hooks/` and `assets/hooks/` eventually sync mechanically instead of by parity discipline?
- Should the skill expose a first-class preset for self-hosted tooling repos instead of hand-authored root routing docs?

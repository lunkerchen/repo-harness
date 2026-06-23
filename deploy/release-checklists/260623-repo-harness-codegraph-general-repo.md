# Release Filing: General Repo MCP CodeGraph Rollout

Date: 2026-06-23
Status: Prepared for stacked Sprint 4 PR review; package publish is out of scope

## Scope

- Feature line: GPT CodeGraph general repo access through repo-harness MCP.
- Source PRD: `plans/prds/20260622-1700-gpt-codegraph.prd.md`
- Source sprint: `plans/sprints/20260622-repo-harness-codegraph-sprint-plan.md`
- Module PRs:
  - Security hardening: PR #30
  - Observability: PR #31
  - Migration, rollout gate, docs, and exit evidence: PR #32

## Included In This Filing

- policy-driven rollout flags for general repo read/write, fallback, canary,
  shadow compare, and rollback;
- compatibility wrapper behavior for legacy workflow reads;
- local rollout gate for shadow parity, canary readiness, rollback surface, and
  CodeGraph ignore audit;
- user/admin/developer reference docs;
- operational runbook for stale index, CodeGraph down, incomplete manifests,
  mutation conflicts, reindex dead letters, and rollback;
- release notes and known limits.

## Verification Evidence

- `bun test`: 978 pass / 1 skip / 0 fail / 10273 expect calls.
- `bun run check:type`: passed.
- Focused tests: `bun test tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts tests/mcp-rollout-gate.test.ts`.
- Rollout gate: `bun scripts/mcp-rollout-gate.ts --repo . --out .ai/harness/runs/mcp-rollout-gate.json`, with `shadow=pass`, `canary=ready`, and `rollback=pass`.
- Workflow gates: `bash scripts/check-task-sync.sh` and `bash scripts/check-task-workflow.sh --strict`.
- Self-host migration gate: `bash scripts/migrate-project-template.sh --repo . --dry-run`.
- CodeGraph readiness: `bash scripts/ensure-codegraph.sh --sync` returned ready and up to date.
- Setup readback: `repo-harness setup check --target codex --check-updates --json` exited 0 with 27 ok, 1 optional warning, and 0 failures.
- Hosted PR #32 checks: 8/8 success, merge state clean.

## Exit Checklist

- [x] Security review has no open P0/P1 after the S4 security follow-up fix.
- [x] Canary gate passes for the current registered self-host read-only canary.
- [x] The rollout gate supports `--require-three-canaries` for a later external
      small/medium/large release window.
- [x] CodeGraph stale/down, fallback, incomplete manifest, mutation conflict,
      reindex dead-letter, and rollback behavior is documented in the runbook.
- [x] Performance evidence is recorded in
      `docs/researches/20260623-general-repo-reader-performance-baseline.md`.
- [x] Legacy artifact-only behavior is preserved only as compatibility wrapper
      and rollback surface.
- [x] Dashboard, alerts, trace, metrics, and rollback commands are documented.
- [x] Docs cover tool reference, repo administration, CodeGraph health,
      privacy/audit, developer migration, known limits, and release notes.

## Publish Hold

This filing does not authorize npm publish, Git tag creation, or GitHub release
publication. Those require the normal package release checklist after the
stacked PR chain is merged to `main`.

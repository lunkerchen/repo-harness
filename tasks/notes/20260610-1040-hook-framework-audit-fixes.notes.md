# Implementation Notes: hook-framework-audit-fixes

> **Status**: Active
> **Plan**: plans/plan-20260610-1040-hook-framework-audit-fixes.md
> **Contract**: tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md
> **Review**: tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md
> **Last Updated**: 2026-06-10 10:40
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Slice 4 — dead-hook triage verdicts (2026-06-10)

Key discovery that changed the plan's disposition: `src/cli/hook/route-registry.ts`
is the framework's declared single source of truth for event×script wiring, and it
already routes `security-sentinel.sh` at SessionStart. The "8 dead hooks" were a
Phase 0.5 bash-shim ↔ Phase 1 route-registry drift, not uniformly dead code.

| Hook | Verdict | Basis |
|---|---|---|
| finalize-handoff.sh | DELETE (absorbed) | stop-orchestrator.sh:104-126 reimplements it verbatim incl. the [FinalizeHandoff] tag |
| tdd-guard-hook.sh | DELETE (absorbed) | pre-edit-guard.sh owns edit-time TDD/BDD reminders (header + lines 96-154) |
| pre-code-change.sh | DELETE (absorbed) | pre-edit-guard.sh owns asset-layer + ContractScopeGuard warnings |
| atomic-commit.sh | DELETE (deprecated) | self-declared "Deprecated: not enabled by the shared settings template" |
| atomic-pending.sh | DELETE (deprecated) | same self-declaration |
| security-sentinel.sh | REWIRE (settings entry) | route-registry SessionStart already lists it; added to build_hooks_json + both legacy templates as a second command in the same entry (NOT chained inside session-start-context.sh, which would double-run under the Phase 1 CLI) |
| anti-simplification.sh | REWIRE (aggregated) | unique compat/branch-complexity nudge; chained from post-edit-guard.sh — registry deliberately keeps one PostToolUse-edit entry, so in-script aggregation preserves parity |
| changelog-guard.sh | REWIRE (aggregated) | release-command-only reminder; chained from post-bash.sh via TOOL_COMMAND env (stdin already consumed by parent) |

Test surface updates: scaffold-parity expected-file list, route-registry KNOWN set,
representative-hook swaps in create-project-dirs.runtime + migration-script tests,
cwd-drift test vehicle switched atomic-pending → trace-event (same SCRIPT_DIR
fallback property via hook-input.sh).

## Plan deviations log

- P2-5 reframed: hook-input.sh:118 WARN was NOT fully dead — `HOOK_STDIN_JSON_VALID=""`
  is reachable on invalid JSON. The actual gap was the silent `unknown` (no jq/bun)
  path; fixed with a once-per-process warning instead.
- prompt-guard regression tests went into tests/hook-runtime.test.ts (reuses the
  fixture infra) instead of a new tests/prompt-guard-intent.test.ts.
- /health route keeps diagnostic interrogatives (为什么/why/not firing) as health
  verbs when paired with tooling nouns — required by the existing
  "continuation diagnostics" contract test; review intent still wins for
  review/audit phrasing because the health branch demands a verb+noun pair.

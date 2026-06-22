# Hook Source Projection Audit

> Sprint: `plans/sprints/20260621-single-source-minimal-change-review.sprint.md`
> Baseline: `e60a1d6fc4cd9afda6c5cd9b42d56c0cd5363b86`

## P1 Map

The hook runtime boundary has four materialization surfaces:

- Canonical authoring root: `assets/hooks/`
- Self-host repo-pinned projection: `.ai/hooks/`, active because `.ai/harness/policy.json` pins `"hook_source": "repo"`
- Packaged runtime: `src/cli/hook/runtime.ts::packagedHooksDir()` resolves to `assets/hooks/`
- Bash central bundle: `scripts/repo-harness.sh install` copies managed hook files into `~/.repo-harness/hooks/`

The public adapter contract remains `src/cli/hook/route-registry.ts` `(event, routeId, matcher)` plus route order. This slice does not add or reorder routes.

Ordinary downstream repos do not receive the full runtime unless they explicitly pin `"hook_source": "repo"`. `scripts/lib/project-init-lib.sh` still prunes top-level `.ai/hooks/*.sh` for non-pinned repos and keeps only helper libraries plus README fallback.

## P2 Trace

Concrete self-host trace:

1. Host adapter invokes `repo-harness-hook <event> --route <route>`.
2. `src/cli/hook/runtime.ts` resolves the repo root and sees `"hook_source": "repo"`.
3. The runtime dispatches scripts from `.ai/hooks/`.
4. `.ai/hooks/` is now checked by `bun run check:hooks` against `assets/hooks/projection.json`.
5. `bun run sync:hooks` copies canonical managed files from `assets/hooks/` to `.ai/hooks/`, writes `.ai/hooks/.projection.json`, preserves executable bits, and fails on unclassified target drift.

Concrete install trace:

1. `scripts/repo-harness.sh install` reads `assets/hooks/`.
2. It copies all managed files except package-only files into `~/.repo-harness/hooks/`.
3. The bash shim still resolves central-first unless a repo policy pin selects `.ai/hooks`.

## P3 Decision

`assets/hooks/` is the single human-authored source because npm already ships it, packaged CLI runtime already resolves it, and central installation already uses it. `.ai/hooks/` remains checked in only to support self-host dogfood and repo-pin source checkouts.

The projection deliberately avoids symlinks. Windows, npm tarballs, and downstream copy/migration flows must keep working with ordinary files.

Package-only files are:

- `projection.json`
- `codex.hooks.template.json`
- `settings.template.json`

Repo-only files are currently none.

The three Codex lifecycle scripts are shared canonical files, not repo-only exceptions:

- `codex-delegation-advisor.sh` is owned by `UserPromptSubmit.delegation`.
- `subagent-start-context.sh` is owned by `SubagentStart.context`.
- `subagent-stop-quality.sh` is owned by `SubagentStop.quality`.

All `*.sh` files under `assets/hooks/` are now executable, and projection preserves that executable bit. This keeps direct shell invocation, central install, and self-host projection aligned.

## Verification

- `bun run check:hooks`
- `bun run check:type`
- `bun test tests/hook-source-projection.test.ts tests/workflow-contract.test.ts tests/hook-shim-resolution.test.ts`
- `bun test tests/hook-source-projection.test.ts tests/workflow-contract.test.ts tests/hook-contracts.test.ts tests/cli/route-registry.test.ts tests/cli/hook.test.ts tests/hook-shim-resolution.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/hook-recursive-copy.test.ts tests/cli/install.test.ts`
  - Combined run hit default 30s migration fixture timeouts.
  - The timed-out migration cases passed when rerun with focused patterns and larger timeout:
    - `apply mode refreshes|prune vendored|prune stale|idempotent`
    - `keep full vendored hook runtime`

## Out Of Scope

This slice does not implement minimal-change policy, SessionStart context advice, PostToolUse edit signals, Stop review evidence, deep review rubric, or review freshness invalidation. Those remain later sprint PRs.

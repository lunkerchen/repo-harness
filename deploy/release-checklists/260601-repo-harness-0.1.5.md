# Release Filing: repo-harness 0.1.5

Date: 2026-06-01
Filing ID: 260601-repo-harness-0.1.5
Status: Prepared

## Naming

Release filing documents use a `YYMMDD-<package>-<version>.md` filename. This
file intentionally uses `260601` so the release artifact sorts by filing date
without relying only on GitHub or npm metadata.

## Scope

- Package: `repo-harness@0.1.5`
- Generated workflow compatibility: `5.2.3`
- Public CLI commands: unchanged
- Host adapter contract: unchanged, still `repo-harness-hook <event> --route <route>`
- Main change: runtime-facing generated markers and environment variable aliases
  now prefer `repo-harness` naming while preserving legacy compatibility.

## Included Changes

- Added `REPO_HARNESS_*` aliases for scaffold, migration, context-block
  selection, external-tooling checks, and contract-worktree controls.
- Kept `PROJECT_INITIALIZER_*` as legacy fallbacks.
- Switched new runtime `.gitignore` and Codex resume generated markers to
  `repo-harness` naming.
- Preserved dual-read compatibility for existing `project-initializer` markers.

## Verification

- `repo-harness --version` returned `0.1.5` from the local linked CLI.
- `bun src/cli/index.ts --version` returned `0.1.5`.
- `bun test tests/bootstrap-files.test.ts tests/cli/status.test.ts tests/cli/doctor.test.ts tests/skill-version.test.ts` passed.
- `bash scripts/check-npm-release.sh` passed before publish: 538 pass, 6 skip, 0 fail.
- `bash scripts/ensure-codegraph.sh --check --json` reported the project index up-to-date.
- `bun src/cli/index.ts doctor --json` reported `9 ok / 0 warn / 0 fail`.
- `npm view repo-harness version --registry https://registry.npmjs.org/` still returned `0.1.4`, so `0.1.5` remains prepared locally until publish.

## Published Artifacts

- Pending npm publish.
- Pending GitHub release.

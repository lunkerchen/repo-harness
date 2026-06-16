# Transactional Adoption Planner

> **Status**: Sprint foundation
> **CLI Surface**: `repo-harness adopt --dry-run --json`
> **Protocol**: `1`

## Why This Exists

`repo-harness adopt` still applies repo-local workflow changes through
`scripts/migrate-project-template.sh`. That shell path remains the compatibility
apply engine, but it is hard to audit as a machine-readable plan because
creation, skip behavior, managed blocks, and verification are mixed with shell
side effects.

The transactional adoption planner starts the migration toward a structured
operation plan. The first shipped surface is additive: JSON dry-run planning.
It lets agents, tests, and future review tools inspect what adoption would do
without executing the legacy shell migrator or writing files.

## Boundary Map

- CLI boundary: `src/cli/index.ts` validates `adopt` arguments and routes only
  `--dry-run --json` into the TypeScript planner.
- Planning boundary: `src/core/adoption/` owns operation types, modes,
  summaries, deterministic templates, `.gitignore` block planning, and
  renderers.
- Effects boundary: `src/effects/` owns repo-relative path safety and the
  safe applicator subset for tests and future opt-in apply paths.
- Compatibility boundary: default `repo-harness adopt`, human-readable
  `--dry-run`, verification, CodeGraph setup, and runtime reclaim continue
  through the existing `runInit()` / `scripts/migrate-project-template.sh`
  path.

## Protocol 1 JSON Shape

```json
{
  "protocol": 1,
  "command": "adopt",
  "repoRoot": "/absolute/repo/path",
  "mode": "standard",
  "apply": false,
  "operations": [
    {
      "id": "mkdir:.ai/harness/checks",
      "kind": "mkdir",
      "path": ".ai/harness/checks",
      "reason": "Ensure repo-harness workflow surface directory exists",
      "risk": "low",
      "status": "planned"
    }
  ],
  "summary": {
    "total": 23,
    "byKind": {
      "mkdir": 17,
      "writeFile": 5,
      "appendManagedBlock": 1
    },
    "userOwnedFilesTouched": 1,
    "generatedFiles": 6,
    "repoHarnessOwnedFiles": 7,
    "requiresVerification": false
  },
  "warnings": []
}
```

Operation paths are repo-relative. `repoRoot` appears only in the plan header.
Renderers redact generated file content by default and expose `contentHash` plus
`contentPreview` for reviewable diffs without large stdout payloads.

## Supported Operation Kinds

The first model defines the following operation union:

- `mkdir`
- `writeFile`
- `appendManagedBlock`
- reserved future kinds: `mergeJson`, `move`, `remove`, `gitUntrack`, `runCheck`

The first safe applicator supports only:

- `mkdir`
- `writeFile ifMissing`
- `appendManagedBlock`

Unsupported operation kinds return structured failures from the applicator
rather than exiting the process.

## Gitignore Managed Block

The planner emits a `.gitignore` `appendManagedBlock` operation with marker:

```text
repo-harness generated-runtime
```

The applicator inserts the block when missing, replaces the existing block when
out of date, and preserves user-owned content outside the block. It also
recognizes legacy `claude-runtime-temp` markers so future apply migration can
replace the old shell-managed runtime block without duplicating entries.

## Workflow Contract Install Operation

In `standard` and `self-host` modes, the planner emits a `writeFile` operation
for `.ai/harness/workflow-contract.json` using the canonical tracked source
`assets/workflow-contract.v1.json`. The operation is marked `skipped` when the
target already matches the asset, and `planned` when the runtime manifest is
missing or stale.

This operation is currently part of the auditable dry-run plan only. Default
apply remains on the shell migrator, which still performs the actual manifest
copy until the opt-in TypeScript apply path is introduced.

## Compatibility Strategy

The current sprint does not replace shell apply. The invariant is:

- `repo-harness adopt --dry-run --json`: TypeScript planner, no shell migration,
  no file writes.
- `repo-harness adopt --dry-run`: existing human-readable dry-run path.
- `repo-harness adopt`: existing shell apply path and verification behavior.

This keeps existing user adoption behavior stable while making the new plan
auditable and testable.

## Next Migration Path

The next coherent slice is to add an explicit opt-in apply path after this
planner proves stable:

- move workflow-contract install application into the TypeScript applicator
- add an atomic writer with backup metadata
- expose `--experimental-ts-apply` for the safe subset
- add rollback metadata to operation plans
- migrate human-readable dry-run text to render from the same plan

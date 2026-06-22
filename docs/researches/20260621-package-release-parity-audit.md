# Package Release Parity Audit

Date: 2026-06-21

## P1 Map

System boundary: package, installer, migration, and release verification for
the completed single-source hook flow. The public hook route registry and
runtime resolver stay unchanged.

Authoritative surfaces:

- `assets/hooks/` remains the canonical shared hook authoring root.
- `.ai/hooks/` remains the self-host generated projection.
- `assets/hooks/projection.json` defines package-only files and managed
  projection files.
- `scripts/repo-harness.sh install` owns the bash central bundle at
  `~/.repo-harness/hooks/`.
- `scripts/check-tarball-install-smoke.sh` owns package smoke evidence.
- `package.json` and `assets/skill-version.json` own the release line.
- READMEs expose the current public release line.

Out of scope: publishing to npm, tagging Git, changing route tuples, or changing
the TypeScript adapter-only `repo-harness install --location` behavior.

## P2 Trace

Concrete route:

1. `npm pack` creates the package tarball from `package.json` `files`.
2. The smoke script inspects the pack manifest and requires canonical hook
   assets plus package-only templates under `assets/hooks/`.
3. The same check rejects any `.ai/hooks/` path in the package so the tarball
   does not depend on the self-host projection.
4. A temporary app installs the tarball and starts both packaged bins:
   `repo-harness` and `repo-harness-hook`.
5. `repo-harness adopt --dry-run --json` proves packaged adoption still returns
   protocol v1 without writing target repo files.
6. `repo-harness-hook prompt-guard-decide` proves the lightweight hook entry can
   start from the package.
7. The packaged bash installer writes `~/.repo-harness/hooks/` from packaged
   `assets/hooks/`.
8. The smoke computes a file list, byte, and executable-bit digest for the
   installed central bundle, excluding `.version`, and compares it to packaged
   canonical managed assets.

The pressure point was installer context: npm package `scripts/` directories
are not Git repos, so auto-trust is now limited to real source checkouts.

## P3 Decision

The release gate checks package contents and installed digest parity instead of
adding a new runtime abstraction. `src/cli/hook/runtime.ts::packagedHooksDir()`
continues to resolve packaged `assets/hooks/`; the bash installer continues to
own central bundle installation. This preserves existing host adapter behavior
while proving every runtime surface is derived from the same authoring root.

The version line moved to `0.8.0` because `repo-harness@0.7.4` is already
published and the sprint targets a next-minor release. Keeping `0.7.4` would
make `check:release` correctly fail before CI.

At 10x release volume, the first failure mode would be publishing a tarball that
accidentally ships `.ai/hooks/` or omits package-only templates. The smoke uses
the pack manifest plus installed digest comparison to catch that before publish.

## Verification

- `bash -n scripts/repo-harness.sh scripts/check-tarball-install-smoke.sh`
- `bun test tests/hook-shim-resolution.test.ts tests/bootstrap-files.test.ts`
- `bash scripts/check-tarball-install-smoke.sh`
- `bun test tests/skill-version.test.ts tests/readme-dx.test.ts`
- `bun run check:release` — 914 tests, 0 fail; tarball smoke and npm
  unpublished-version gate passed for `repo-harness@0.8.0`.

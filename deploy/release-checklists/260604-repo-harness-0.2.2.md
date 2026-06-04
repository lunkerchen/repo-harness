# Release Filing: repo-harness 0.2.2

Date: 2026-06-04
Filing ID: 260604-repo-harness-0.2.2
Status: Prepared

## Naming

Release filing documents use a `YYMMDD-<package>-<version>.md` filename. This
file uses `260604` so the release artifact sorts by filing date without relying
only on GitHub or npm metadata.

## Scope

- Package: `repo-harness@0.2.2`
- Generated workflow compatibility: `5.2.3` (unchanged)
- Public CLI commands: `repo-harness init` remains the first-run global runtime
  bootstrap; `repo-harness update` owns existing repo-local harness refresh.
- Main change: a safety patch release that makes first-run global init visible
  while removing the Superpowers Claude marketplace plugin from default setup.

## Included Changes

- Updated `src/cli/index.ts` so `repo-harness init` streams
  `scripts/setup-plugins.sh` output directly to the terminal.
- Updated `src/cli/commands/global-runtime.ts` to support inherited stdio for
  user-facing init while keeping captured stdio available for tests.
- Updated `scripts/setup-plugins.sh` so the Superpowers marketplace plugin is
  installed only with explicit `--with-superpowers`.
- Added `repo-harness init --with-superpowers` CLI plumbing and regression
  coverage.
- Updated README and changelog release metadata for the `0.2.2` npm line.

## Verification

- Pending: `bun src/cli/index.ts --version`
- Pending: `bun src/cli/index.ts status`
- Pending: focused regression coverage
- Pending: `bash scripts/check-npm-release.sh`
- Pending: `npm publish --registry https://registry.npmjs.org/ --access public`
- Pending: registry readback
- Pending: clean-temp npm CLI smoke

## Published Artifacts

- Pending: npm package URL
- Pending: npm tarball URL
- Pending: GitHub release

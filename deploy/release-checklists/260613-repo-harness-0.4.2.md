# Release Filing: repo-harness 0.4.2

Date: 2026-06-13
Status: Prepared; npm publish, registry readback, GitHub tag, and GitHub release
remain pending

## Scope

- Package target: `repo-harness@0.4.2`
- Current npm latest at preflight: `repo-harness@0.4.1`
- Base npm tag: `v0.4.1`
- Target branch: `main`
- Source commit: pending release-prep commit
- Release tag: `v0.4.2`
- Version surfaces bumped before publish:
  - `package.json`
  - `assets/skill-version.json`
  - `src/cli/commands/status.ts`
  - README version/stamp references
  - version expectation tests

## Version Decision

Use `0.4.2` as a patch release on top of the published `0.4.1` line. The diff
since `v0.4.1` adds a public command facade and planning hierarchy, but it does
not break the `repo-harness init` / `repo-harness update` lifecycle or the
`0.4.x` unified package/template version line.

This release prepares the PRD-to-Sprint planning split, generated-project helper
runtime isolation, managed subagent return-channel guard, and PRD workflow check
runtime path alignment for publish.

## Release Notes

- Added `repo-harness-prd` as the upper-layer PRD command facade. PRDs live
  under `plans/prds/`, while Sprint backlogs live under
  `plans/sprints/*.sprint.md`.
- Updated `repo-harness-sprint` to derive ordered execution backlogs from PRDs
  or user-provided slices without re-deciding product intent.
- Isolated generated-project helper implementations under
  `.ai/harness/scripts/` while preserving root `scripts/*` as compatibility
  wrappers.
- Added PRD and PRD-to-Sprint eval fixtures so command routing and generated
  planning artifacts are covered by the release gate.
- Added a managed subagent return-channel hook route for Claude and Codex host
  adapters.
- Aligned `repo-harness-prd` guidance with the installed
  `.ai/harness/scripts/check-task-workflow.sh` verification path.

## Verification So Far

- Registry preflight:
  - `npm view repo-harness@0.4.2 version --json --registry
    https://registry.npmjs.org/`
  - Result: `E404`, proving `0.4.2` is not published yet.
  - `npm view repo-harness version dist-tags.latest --json --registry
    https://registry.npmjs.org/`
  - Result: `version=0.4.1`, `latest=0.4.1`.
- Version consistency:
  - `bun scripts/check-skill-version.ts --project .`
  - Result: passed; self-host repo is up to date at `0.4.2`.
- Local CLI smoke:
  - `bun src/cli/index.ts --version`
  - Result: `0.4.2`.
- Focused release metadata tests:
  - `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts
    tests/skill-version.test.ts`
  - Result: `32 pass, 0 fail, 484 expect() calls`.
- Full release gate:
  - `bash scripts/check-npm-release.sh`
  - Result: pass.
  - Latest rerun summary: `689 pass, 0 fail, 6828 expect() calls across 66
    files`.
  - Deploy SQL order, architecture sync, task sync, brain manifest, brain sync,
    strict workflow, inspect, migration dry-run, and package dry-run all
    completed.
- Package dry run:
  - `npm pack --dry-run --json`
  - filename: `repo-harness-0.4.2.tgz`
  - entries: `291`
  - shasum: `16f1bc7cb9239fc35188de7f086a0937846b5be5`

## Required Release Actions

- `npm publish --access public --registry https://registry.npmjs.org/`
- Registry readback for `repo-harness@0.4.2`
- Clean-room `npx --yes repo-harness@0.4.2 --version`
- Git tag `v0.4.2`
- GitHub release for `v0.4.2`

Rerun `bash scripts/check-npm-release.sh` before publish if any package,
template, test, workflow, or release-document files change after this filing.

## Publish Status

- npm: pending.
- GitHub release: pending.
- Hold reason: npm registry authentication is missing on this machine
  (`npm whoami --registry https://registry.npmjs.org/` returned `ENEEDAUTH`), so
  publish/readback/tag/release steps have not run yet in this filing.

# Release Filing: repo-harness 0.7.5

Date: 2026-06-21
Status: Prepared from merged `main`; npm publish and post-publish readback pending

## Scope

- Package target: `repo-harness@0.7.5`
- Base release: `v0.7.4`
- Release commit: `983b2700e11ae9b8f9da037104809e769a91b315`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.7.5` as a patch release. The release closes the post-`0.7.4` hook and
MCP safety line:

- repo-pinned user-level hook dispatch and sibling-repo isolation;
- ChatGPT MCP workspace reader hardening with registered/adopted repo roots;
- default-off advisory minimal-change hooks after PR #15 review fixes.

The minimal-change hooks are packaged in this patch because the merged head
keeps the new behavior opt-in: missing or malformed `minimal_change` policy
normalizes to `mode: "off"`, `PostToolUse` observation requires explicit
`post_edit_observer: true`, and reentrant `Stop` exits before handoff writes.

## Required Alignment

- `package.json`
- `assets/skill-version.json`
- README current release/stamp references
- `docs/CHANGELOG.md`
- self-host `.ai/hooks` and packaged `assets/hooks`
- hook runtime and installer tests
- release checklist

## Preflight Evidence

- `npm view repo-harness version dist-tags --json --registry
  https://registry.npmjs.org/` returned current latest `0.7.4` before publish.
- `npm view repo-harness@0.7.5 version --json --registry
  https://registry.npmjs.org/` returned unpublished/E404 before publish.
- GitHub release `v0.7.4` exists at
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.7.4`.
- PR #15 merged as `983b2700e11ae9b8f9da037104809e769a91b315` after hosted
  push and pull-request CI passed on
  `e526a4d0c1052951c56561e0dd8e25086510c8f4`.

## Verification

Required before publish:

- `bun src/cli/index.ts --version` returned `0.7.5`.
- `bun scripts/check-skill-version.ts --project .` passed for
  `repo-harness=0.7.5` and `template=0.7.5`.
- `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  must pass with `[release] OK: npm package gate passed.`
- The release gate's tarball smoke must pass:
  `[tarball-smoke] OK: repo-harness-0.7.5.tgz installs and packaged CLI bins start.`

## Publish Evidence

Pending:

- npm publish result for `repo-harness@0.7.5`
- registry readback for version, tarball, shasum, integrity, and `gitHead`
- `latest` dist-tag readback
- Git tag `v0.7.5`
- GitHub release URL
- clean-room `npx --package repo-harness@0.7.5 repo-harness --version`
- local `repo-harness update --version 0.7.5 --json`
- final `repo-harness status --json` and `repo-harness doctor --json`

## Publish Hold

- Do not publish until an authenticated npm identity is available.
- Do not tag `v0.7.5` or create the GitHub release until npm publish and
  registry readback succeed.

# Release Filing: repo-harness 0.8.1

Date: 2026-06-24
Status: Prepared and locally verified from `main`; npm publish and post-publish
readback pending

## Scope

- Package target: `repo-harness@0.8.1`
- Base release: `v0.8.0`
- Release branch: `main`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.8.1` as the next package release because `repo-harness@0.8.0` is already
published and the current `main` line contains post-`0.8.0` shipped changes:

- General Repo MCP CodeGraph access, rollout gates, observability reports, and
  security policy hardening;
- removal of the experimental ChatGPT Chrome extension bridge provider;
- Codex Desktop Stop-hook stdout suppression for `Stop.default` decision JSON.

This release keeps one package/template version line:
`repo-harness@0.8.1+template@0.8.1`.

## Required Alignment

- `package.json`
- `.claude/.skill-version`
- `assets/skill-version.json`
- README current release/stamp references, including localized READMEs
- `docs/CHANGELOG.md`
- release checklist and task notes

## Preflight Evidence

- `npm view repo-harness version versions --json --registry
  https://registry.npmjs.org/` returned latest `0.8.0`.
- `npm view repo-harness@0.8.1 version --json --registry
  https://registry.npmjs.org/` returned `E404`, proving the target package is
  unpublished before publish.
- GitHub latest release is `v0.8.0`.
- `gh release view v0.8.1 --repo Ancienttwo/repo-harness` returned
  `release not found`, and no local or remote `v0.8.1` tag exists.
- `npm whoami --registry https://registry.npmjs.org/` returned `E401` for the
  default npm config in this shell.
- Local and remote `main` were aligned at `7629eb1` before release prep.

## Verification

- `bun src/cli/index.ts --version` returned `0.8.1`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.8.1`, `template=0.8.1`, and project stamp up to date.
- Focused release metadata checks passed:
  `bun test tests/skill-version.test.ts tests/readme-dx.test.ts tests/bootstrap-files.test.ts`
  returned `37 pass`, `0 fail`.
- Full release gate passed:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `986 pass`, `1 skip`, `0 fail`, completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed.`
- `npm pack --dry-run --json --registry https://registry.npmjs.org/` returned:
  - filename: `repo-harness-0.8.1.tgz`
  - package size: `7941985`
  - unpacked size: `10701607`
  - total files: `356`
  - shasum: `08167d5a63c82bb7bb9789596d017268140173b0`
  - integrity:
    `sha512-9QVzVYgfeEyMUwoonMiweXNDPIBbAQMrgtQjLPY40CQidf/Qb7qYq2LnaLHdQ274qEC+t/PieL5XGwPB6jONZQ==`

## Publish Evidence

Pending:

- npm publish result for `repo-harness@0.8.1`
- registry readback for version, tarball, shasum, integrity, and `gitHead`
- `latest` dist-tag readback
- Git tag `v0.8.1`
- GitHub release URL
- clean-room `npx --package repo-harness@0.8.1 repo-harness --version`
- `bash scripts/check-release-published.sh 0.8.1`

## Publish Hold

- Do not tag `v0.8.1` or create the GitHub release until npm publish and
  registry readback succeed.

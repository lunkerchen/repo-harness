# Release Filing: repo-harness 0.8.1

Date: 2026-06-24
Status: Published to npm and GitHub from `main` at
`e2b0099577d5568bc7e849ab5ee919267554e30a`

## Scope

- Package target: `repo-harness@0.8.1`
- Base release: `v0.8.0`
- Release branch: `main`
- Release commit: `e2b0099577d5568bc7e849ab5ee919267554e30a`
- Registry: `https://registry.npmjs.org/`

## Version Decision

Use `0.8.1` as the next package release because `repo-harness@0.8.0` is already
published and the current `main` line contains post-`0.8.0` shipped changes:

- General Repo MCP CodeGraph access, rollout gates, observability reports, and
  security policy hardening;
- removal of the experimental ChatGPT Chrome extension bridge provider;
- Codex Desktop Stop-hook stdout suppression for `Stop.default` decision JSON;
- global runtime init guard so a globally installed Bun copy does not attempt
  to self-install into its own prefix.

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
- Before publish, local and remote `main` were aligned at
  `e2b0099577d5568bc7e849ab5ee919267554e30a`.

## Verification

- `bun src/cli/index.ts --version` returned `0.8.1`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.8.1`, `template=0.8.1`, and project stamp up to date.
- Focused release metadata checks passed:
  `bun test tests/skill-version.test.ts tests/readme-dx.test.ts tests/bootstrap-files.test.ts`
  returned `37 pass`, `0 fail`.
- Full release gate passed before the late global-runtime update:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `986 pass`, `1 skip`, `0 fail`, completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed.`
- A second publish attempt was interrupted while `prepublishOnly` was still
  running so the late two-file `global-runtime` update could be included.
  The final publish used `npm publish --ignore-scripts` after the explicit
  user instruction to skip retesting.
- `npm pack --dry-run --json --registry https://registry.npmjs.org/` returned:
  - filename: `repo-harness-0.8.1.tgz`
  - package size: `7961676`
  - unpacked size: `10702785`
  - total files: `356`
  - shasum: `7ee740dd0d7781f6c6b503600b1a5760306592c0`
  - integrity:
    `sha512-pBoG7xph/8GyMYFPDYU+jGdeUCzgGbGgVShmo3wwJMFO69Qq7lm0v2ryH+CaAwdh0e9BJRpY4V3buJeUlZDhFQ==`
  - included product update:
    `src/cli/commands/global-runtime.ts`

## Publish Evidence

- `npm publish --access public --registry https://registry.npmjs.org/
  --ignore-scripts` returned `+ repo-harness@0.8.1`.
- Registry readback returned:
  - version: `0.8.1`
  - tarball:
    `https://registry.npmjs.org/repo-harness/-/repo-harness-0.8.1.tgz`
  - shasum: `7ee740dd0d7781f6c6b503600b1a5760306592c0`
  - integrity:
    `sha512-pBoG7xph/8GyMYFPDYU+jGdeUCzgGbGgVShmo3wwJMFO69Qq7lm0v2ryH+CaAwdh0e9BJRpY4V3buJeUlZDhFQ==`
  - gitHead: `e2b0099577d5568bc7e849ab5ee919267554e30a`
- `npm view repo-harness dist-tags --json --registry
  https://registry.npmjs.org/` returned `latest: 0.8.1`.
- Git tag `v0.8.1` was pushed; `git rev-list -n 1 v0.8.1` returned
  `e2b0099577d5568bc7e849ab5ee919267554e30a`.
- GitHub release:
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.8.1`.
- `bash scripts/check-release-published.sh 0.8.1` passed with
  `[release-published] OK: registry, dist-tag, tarball, tag, and local version
  files agree.`
- GitHub CI for the late update was still in progress at publish time:
  `https://github.com/Ancienttwo/repo-harness/actions/runs/28072060580`.

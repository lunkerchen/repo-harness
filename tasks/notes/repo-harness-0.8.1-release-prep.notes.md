# repo-harness 0.8.1 Release Prep Notes

Prepare the npm/package release line `repo-harness@0.8.1` from current `main`.

## Decisions

| Decision | Rationale | Impact |
| --- | --- | --- |
| Use `0.8.1` | npm and GitHub latest are `0.8.0`, and current `main` contains post-`0.8.0` changes that need a new package line. | `package.json`, `assets/skill-version.json`, `.claude/.skill-version`, README/localized READMEs, changelog, and release filing move together to `0.8.1`. |
| Keep one package/template version line | The repo retired the old split compatibility line in `0.4.0`; no new compatibility split is introduced here. | Downstream generated stamps move together to `repo-harness@0.8.1+template@0.8.1`. |
| Hold tag and GitHub release until npm readback | A GitHub release without a published npm tarball would create a misleading public release state. | Publish, registry readback, tag, GitHub release, and clean-room install remain a single closeout slice. |

## Evidence

- `npm view repo-harness version versions --json --registry https://registry.npmjs.org/`
  returned latest `0.8.0`.
- `npm view repo-harness@0.8.1 version --json --registry https://registry.npmjs.org/`
  returned `E404`, so the target version is available.
- `gh release list --repo Ancienttwo/repo-harness --limit 20` showed latest
  GitHub release `v0.8.0`.
- `gh release view v0.8.1 --repo Ancienttwo/repo-harness` returned
  `release not found`, and no local or remote `v0.8.1` tag exists.
- `npm whoami --registry https://registry.npmjs.org/` returned `E401` for the
  default npm config in this shell.
- `main` and `origin/main` were aligned at `7629eb1` before release prep.

## Verification

- `bun src/cli/index.ts --version` returned `0.8.1`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.8.1`, `template=0.8.1`, and project stamp up to date.
- Focused release metadata checks passed:
  `bun test tests/skill-version.test.ts tests/readme-dx.test.ts tests/bootstrap-files.test.ts`
  returned `37 pass`, `0 fail`.
- Full release gate passed:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `986 pass`, `1 skip`, `0 fail`, then completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed`.
- `npm pack --dry-run --json --registry https://registry.npmjs.org/` returned
  `repo-harness-0.8.1.tgz`, package size `7941985`, unpacked size `10701607`,
  `356` files, shasum `08167d5a63c82bb7bb9789596d017268140173b0`, and
  integrity
  `sha512-9QVzVYgfeEyMUwoonMiweXNDPIBbAQMrgtQjLPY40CQidf/Qb7qYq2LnaLHdQ274qEC+t/PieL5XGwPB6jONZQ==`.

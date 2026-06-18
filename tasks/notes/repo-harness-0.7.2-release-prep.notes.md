# repo-harness 0.7.2 Release Prep Notes

Prepare the npm/package release line `repo-harness@0.7.2` after merging PR #10
to `main`.

## Decisions

| Decision | Rationale | Impact |
| --- | --- | --- |
| Use `0.7.2` | The merged diff hardens existing GPT Pro, Oracle, and ChatGPT MCP setup surfaces without adding a new public product line. | `package.json`, `assets/skill-version.json`, `.claude/.skill-version`, README release surfaces, changelog, and version tests move together to `0.7.2`. |
| Keep one package/template version line | The 0.4.0 release retired the separate generated-workflow compatibility line, and this release does not introduce a compatibility split. | Downstream generated stamps move together to `repo-harness@0.7.2+template@0.7.2`. |
| Stop before publish/tag/release unless npm auth is explicitly available | The default npm config returns `ENEEDAUTH`; creating a tag or GitHub release before npm publish would make public release state misleading. | Release checklist records the hold reason and required publish/readback steps. |

## Evidence

- PR #10 was merged to `main` as merge commit `87d60a2`.
- `npm view repo-harness version dist-tags --json --registry https://registry.npmjs.org/`
  returned current latest `0.7.1`.
- `npm view repo-harness@0.7.2 version --json --registry https://registry.npmjs.org/`
  returned `E404`, so the target version is available.
- `npm whoami --registry https://registry.npmjs.org/` returned `ENEEDAUTH` for
  the default npm config in this shell.

## Verification

- `bun src/cli/index.ts --version` returned `0.7.2`.
- `bun scripts/check-skill-version.ts --project .` passed with
  `repo-harness=0.7.2`, `template=0.7.2`, and project stamp up to date.
- Focused release metadata and GPT Pro/browser checks passed:
  `bun test tests/bootstrap-files.test.ts tests/skill-version.test.ts tests/readme-dx.test.ts tests/cli/chatgpt-browser.test.ts tests/cli/mcp-setup.test.ts tests/action-command-skills.test.ts`
  returned `90 pass`, `0 fail`.
- Full release gate passed:
  `BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release`
  returned `866 pass`, `0 fail`, then completed deploy SQL order,
  architecture sync, task sync, brain sync, strict workflow, repository
  inspection, package dry-run, tarball install smoke, and
  `[release] OK: npm package gate passed`.
- `npm pack --dry-run --json --registry https://registry.npmjs.org/`
  returned `repo-harness-0.7.2.tgz`, package size `7859002`, unpacked size
  `10245516`, `333` files, shasum
  `fd80672886702dcf7f925cb9384dcb030a0694f5`, and integrity
  `sha512-yokXmM1rt4lc/ajJKnDWvVZPQq9s0x5O37wtYLqxALRG6ugOhV+UUqOPN0MaXojZSikagrkz1yhRSzLVc+Ur7A==`.
- npm publish, `v0.7.2` tag push, and GitHub release creation are intentionally
  held until npm auth is available and registry readback can be completed.

# init/update CLI Semantics Notes

Public CLI semantics are split by lifecycle:

```bash
npx -y repo-harness init
npx -y repo-harness update
```

`init` is the first-run global bootstrap. It stays a thin wrapper around the
packaged `scripts/setup-plugins.sh`, so npm users can install global Claude
plugins and hook profiles without cloning the source repository.

`update` owns existing repo-local harness installation and refresh. It reuses the
existing `runInit` implementation for workflow files, hook assets, host adapters,
skill aliases, CodeGraph readiness, brain manifest options, and verification.

Hook-side CodeGraph behavior remains advisory and non-blocking. When
`prompt-guard.sh` detects a structural code-navigation prompt and the repo has no
`.codegraph/codegraph.db`, it first runs `CODEGRAPH_NO_DAEMON=1 codegraph init
-i .` via a repo-local `node_modules/.bin/codegraph` or PATH-visible CodeGraph
binary. This initializes the index when CodeGraph is available, but it does not
run the heavier repo-harness readiness probe, install dependencies, or block the
prompt if CodeGraph is unavailable. Because current CodeGraph may also write a
Cursor rule during init, the hook removes `.cursor/rules/codegraph.mdc` only when
that file did not exist before the automatic init.

## Release Gate Stabilization

- Scoped synchronous CodeGraph auto-init to explicit structural navigation
  prompts. Generic bug/debug prompts still receive the CodeGraph route nudge, but
  do not run a potentially slow real `codegraph init` inside prompt submission.
- Isolated the recursive hook migration test from parent npm lifecycle
  environment variables so `npm publish` preflight cannot leak `npm_*` state into
  the target-repo migration fixture.
- Treated unreadable external brain-vault targets as advisory during
  `sync-brain-docs.sh --check` unless `--require-vault` is set. Repo source files
  remain hard failures; only local CloudDocs/TCC target read failures downgrade
  to warnings to keep release checks from crashing on machine-local vault locks.

## Publish Attempt

- `npm publish --registry https://registry.npmjs.org/ --access public` reran the
  full release gate successfully, then failed at the registry PUT with
  `E404 Not Found - PUT https://registry.npmjs.org/repo-harness`.
- The package name is valid and public registry state still stops at `0.2.0`.
  The blocker is npm authentication on this machine: `npm whoami` returns
  `E401 Unauthorized`, `NPM_TOKEN` and `NODE_AUTH_TOKEN` are unset, and the
  existing `~/.npmrc` token is rejected by npmjs.

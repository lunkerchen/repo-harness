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

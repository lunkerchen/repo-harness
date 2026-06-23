# Runbook: General Repo MCP CodeGraph Rollout

Status: Sprint 4 rollout runbook
Applies to: repo-harness MCP general repo tools

## Healthy State

Run the normal readiness checks from the repo root:

```bash
bash scripts/ensure-codegraph.sh --sync
repo-harness setup check --target codex --check-updates --json
bun scripts/mcp-rollout-gate.ts --repo . --out .ai/harness/runs/mcp-rollout-gate.json
bun scripts/mcp-observability-report.ts --repo . --out .ai/harness/runs/mcp-observability-report.json
```

Expected results:

- CodeGraph reports ready and `index=up-to-date`.
- Setup check exits 0 with no failed checks.
- Rollout gate reports `shadow=pass`, `canary=ready`, and `rollback=pass`.
- Observability report exits 0 when no alert thresholds fire.

## Index Stale

Symptoms:

- setup check reports CodeGraph `index=stale`;
- tool responses include `snapshot_state: "index_lagging"`;
- observability alert `index-lag-threshold` fires.

Actions:

```bash
bash scripts/ensure-codegraph.sh --sync
bun scripts/mcp-rollout-gate.ts --repo . --out .ai/harness/runs/mcp-rollout-gate.json
```

If a write mutation returned `mutation_id`, call `refresh_repo_index` for the
changed paths. If `refresh_repo_index` dead-letters, run the sync command above
and retry the tool once.

## CodeGraph Down

Symptoms:

- `ensure-codegraph.sh` reports missing or unavailable CodeGraph;
- `read_file` on indexed metadata cannot use the adapter;
- `fs_fallback=false` requests return `INDEX_UNAVAILABLE`.

Actions:

1. Keep the MCP server in read-only mode.
2. Run `bash scripts/ensure-codegraph.sh --sync`.
3. If CodeGraph remains unavailable, leave `fs_fallback=true` for read/stat
   continuity or disable general repo read with the rollback command below.
4. Do not enable `repo_write=true` while CodeGraph readiness is failing.

## Manifest Incomplete

Symptoms:

- rollout gate reports manifest shadow failure;
- tool response has `partial:true` with walker errors;
- observability alert `manifest-incomplete` fires.

Actions:

1. Inspect `.ignore` first; policy exclusions are expected to be absent.
2. Check for permission-denied directories, external symlinks, or files being
   created/deleted during traversal.
3. Rerun the rollout gate after the filesystem settles.
4. If incomplete manifests persist, leave rollback active and do not merge the
   affected release branch.

## Mutation Conflict

Symptoms:

- write tools return `REVISION_CONFLICT`;
- `write_conflicts` increases in the observability report.

Actions:

1. Re-read the file with `stat_file` or `read_file`.
2. Recompute the intended edit against the new `sha256`.
3. Retry with the new `expected_sha256`.
4. Do not bypass the precondition. A conflict is the expected lost-update guard.

## Reindex Dead Letter

Symptoms:

- `refresh_repo_index` reports failure;
- `.ai/harness/mcp/index-events.jsonl` contains a dead-letter event;
- observability alert `reindex-dead-letter` fires.

Actions:

```bash
bash scripts/ensure-codegraph.sh --sync
bun scripts/mcp-rollout-gate.ts --repo . --out .ai/harness/runs/mcp-rollout-gate.json
```

If sync succeeds, call `refresh_repo_index` again with the original
`mutation_id` and changed paths when they are still known.

## Rollback

Use rollback when security, manifest completeness, or canary checks fail.

One-process rollback:

```bash
REPO_HARNESS_MCP_GENERAL_REPO_READ=0 \
REPO_HARNESS_MCP_ROLLBACK_LEGACY_TOOLS=1 \
repo-harness mcp serve --repo . --transport http --profile planner
```

Write-disable only:

```bash
REPO_HARNESS_MCP_REPO_WRITE=0 \
repo-harness mcp serve --repo . --transport http --profile planner
```

Fallback-disable canary:

```bash
REPO_HARNESS_MCP_FS_FALLBACK=0 \
repo-harness mcp serve --repo . --transport http --profile planner
```

Rollback hides the general repo tools and keeps legacy workflow-reader tools
available. It does not mutate the registered repo whitelist.

## Evidence To Attach To Release Review

- PR links for security, observability, and rollout/docs modules.
- `bun test` summary.
- `bun run check:type`.
- rollout gate output and report path.
- observability report output and report path.
- setup check JSON summary.
- hosted GitHub checks for the module PR.
- note of current canary inventory and whether `--require-three-canaries` was
  enforced.

# General Repo Reader Performance Baseline

Date: 2026-06-23

Source task: `plans/sprints/20260622-repo-harness-codegraph-sprint-plan.md`

## Scope

This records the first reproducible baseline for the general repo reader
performance slice. The benchmark fixture intentionally disables CodeGraph in
order to isolate the filesystem walker, snapshot cache, entry metadata cache,
pagination, read, and search behavior.

Benchmark entrypoint:

```bash
bun run benchmark:mcp-reader -- --entries <count> --json
```

## 10k Fixture

Command:

```bash
bun run benchmark:mcp-reader -- --entries 10000 --json
```

Result:

| Measurement | Duration |
| --- | ---: |
| cold manifest first page | 366.09 ms |
| warm manifest first page | 95.31 ms |
| list_tree root depth 1 | 88.54 ms |
| read_file first chunk | 0.60 ms |
| warm literal search | 512.12 ms |

Observed state:

- `snapshot_state`: `ready`
- `complete`: `true`
- `counts.entries`: `10109`
- `counts.files`: `10005`
- `next_cursor`: `1000`
- `rss_bytes_after_measurements`: `147718144`
- warm manifest cache: `hit=true`
- warm manifest entry metadata cache: `hits=10108`, `misses=1`
- search matches: `10`

## 100k Fixture

Command:

```bash
bun run benchmark:mcp-reader -- --entries 100000 --json
```

Result:

| Measurement | Duration |
| --- | ---: |
| cold manifest first page | 14894.23 ms |
| warm manifest first page | 919.11 ms |
| list_tree root depth 1 | 922.27 ms |
| read_file first chunk | 0.94 ms |
| warm literal search | 1038.71 ms |

Observed state:

- `snapshot_state`: `ready`
- `complete`: `true`
- `counts.entries`: `100109`
- `counts.files`: `100005`
- `next_cursor`: `1000`
- `rss_bytes_after_measurements`: `678952960`
- warm manifest cache: `hit=true`
- warm manifest entry metadata cache: `hits=100108`, `misses=1`
- search matches: `50`
- search `truncated`: `true`

This proves the generated 100k fixture can complete without OOM, returns
paginated results, and satisfies the proposed Sprint 2 warm-path SLO on this
machine: warm manifest first page is below 2 seconds, read first chunk is below
500 ms, and warm search is below 2 seconds.

## 500k Fixture Attempt

Command:

```bash
bun run benchmark:mcp-reader -- --entries 500000 --json
```

Observed outcome: manually interrupted after more than 9 minutes without a JSON
result. The temporary fixture directory was removed after interruption.

This does not prove the 500k baseline. It shows the remaining large-repo
bottleneck has moved to fixture generation, cold manifest construction, and the
fact that the manifest still materializes and sorts the full visible entry set.

## Decision

The path-aware response cache key and entry metadata cache close the
cache-key/invalidation slice. The optimized walker and path-scoped cached
snapshot reuse close the 100k warm-path SLO on this machine. They do not close
true streaming manifest or the 500k baseline: cold manifest still materializes
and sorts the full visible tree before returning first-page manifest results.

# CodeGraph Capability Matrix For General Repo Access

> Scope: Sprint 0 spike evidence for the general repo access PRD.
> Local version checked: `@colbymchenry/codegraph` 1.0.1.
> Checked from: `/Users/ancienttwo/Projects/repo-harness`.

## Local Evidence

Commands run:

```bash
./node_modules/.bin/codegraph --version
./node_modules/.bin/codegraph --help
./node_modules/.bin/codegraph status .
./node_modules/.bin/codegraph files --help
./node_modules/.bin/codegraph query --help
./node_modules/.bin/codegraph node --help
./node_modules/.bin/codegraph sync --help
./node_modules/.bin/codegraph files --path . --format flat --json
```

Temporary fixture mutation spike:

```bash
codegraph init <temp-repo>
codegraph files --path <temp-repo> --format flat --json
# create src/added.ts, modify src/app.ts, move docs/guide.md, delete file.widget
codegraph sync <temp-repo>
codegraph files --path <temp-repo> --format flat --json
```

Observed state:

- Version: `1.0.1`.
- Indexed files in this repo: `844`.
- Indexed nodes: `13,132`.
- Indexed edges: `46,333`.
- Status: up to date.
- Warning: index was built by an earlier version and should be rebuilt with
  `codegraph index -f` or `codegraph sync`.
- JSON-capable CLI surfaces: `files --json`, `query --json`.
- Source/file read surface: `node --file`, line-numbered text output.
- Refresh surface: `sync`; full rebuild through `index`.
- Temp fixture result: initial inventory reported only indexed TypeScript
  source; after `sync`, newly created and modified TypeScript paths were
  visible, deleted unknown-extension paths stayed absent, and Markdown/dotfile
  paths were not inventory-visible.

## Capability Matrix

| Requirement | Status | Evidence | Repo-harness handling |
|---|---|---|---|
| Enumerate indexed files | native | `codegraph files --format flat --json` returns path, language, node count, and size | Use through adapter when available |
| Enumerate every non-ignored repo path | filesystem-fallback | local `files` output is index inventory, not a complete filesystem manifest | Secure walker is manifest source of truth; merge CodeGraph metadata |
| Include dotfiles by policy | filesystem-fallback | CodeGraph indexes some hidden paths such as `.github`, but it is not the policy source | Walker applies `.ignore` only; dotfiles are visible unless ignored |
| Include unknown extensions and non-code text | filesystem-fallback | CodeGraph file inventory is language/index oriented | Walker lists them; read fallback handles allowed text |
| Literal symbol/code search | native | `query --json` and MCP search surfaces exist for indexed symbols/code | Adapter calls CodeGraph first |
| Stable full-text literal search over all allowed files | adapter-emulated | current CLI search is index scoped and not tied to `.ignore` policy | Use filesystem search fallback for unindexed allowed text |
| Regex search | adapter-emulated | no verified stable regex search contract in CLI help | Implement bounded server-side fallback until CodeGraph supports it |
| Read indexed source by file | native | `codegraph node --file` returns line-numbered source | Use for indexed text reads where snapshot permits |
| Read arbitrary allowed text not indexed by CodeGraph | filesystem-fallback | unindexed ordinary files are outside CodeGraph read guarantee | Secure direct read with path guard and `.ignore` policy |
| File hash/revision from CodeGraph | unsupported | CLI help does not expose hash or revision fields | Compute sha256 in repo-harness |
| Index revision | unsupported | status output has counts but no stable revision token | Use adapter-reported best effort plus repo-harness snapshot state |
| Snapshot ID shared by manifest/search/read | unsupported | local CodeGraph CLI does not expose stable snapshot handles | Snapshot Coordinator is a repo-harness responsibility |
| Incremental refresh | native for indexed files | `sync [path]` is available; temp spike saw new/modified/deleted TypeScript path updates | Index Sync Coordinator may call it after mutations |
| New/modify/move/delete visibility for non-indexed files | filesystem-fallback | temp spike did not expose Markdown, dotfile, or unknown-extension paths in inventory | Manifest/read must use secure walker and direct metadata |
| Per-path invalidation | unsupported | CLI help does not expose an invalidate command | Use repo refresh/sync fallback |
| Write/edit/delete | unsupported | CodeGraph CLI is read/index oriented | Mutation plane stays in repo-harness |
| Path authorization | unsupported by design | CodeGraph resolves projects and files, not repo-harness policy | Guard before and after adapter calls |
| `.ignore` as sole policy source | unsupported by design | CodeGraph has its own indexing behavior | Repo-harness applies `.ignore` consistently |

## Source Of Truth Decision

`repo_manifest` must be produced by secure filesystem walking plus CodeGraph
metadata merge. CodeGraph inventory alone is insufficient for a complete visible
file-set proof because Sprint 0 requires dotfiles, unknown extensions, allowed
unindexed text, binary metadata, and transport-limit visibility.

## Fallback Rules

- If CodeGraph inventory omits an allowed path, manifest still includes it with
  `indexed: false`.
- If CodeGraph read/search is unavailable for an allowed text file, filesystem
  fallback may serve it and must return `indexed: false` or equivalent metadata.
- If a file is binary, unsupported, or too large for one response, it remains in
  manifest and returns metadata plus continuation or a typed error.
- If CodeGraph returns a path that is outside the repo or now ignored by
  `.ignore`, repo-harness filters it and records a policy rejection without
  exposing the path content.

## Sprint 1 Pressure Points

The current production MCP reader still has legacy behavior that conflicts with
the new PRD: common deny globs, `.gitignore`-based ignore handling, hidden-file
defaults, and response redaction. Those are intentionally left unchanged in this
Sprint 0 contract PR and must be replaced only after the new registry, guard,
ignore, and schema surfaces are in place.

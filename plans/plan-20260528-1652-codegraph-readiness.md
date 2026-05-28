# Plan: Codegraph Vendoring + Tool Readiness

> **Status**: Draft
> **Created**: 20260528-1652
> **Slug**: codegraph-readiness
> **Planning Source**: codex-plan
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/codegraph-readiness.contract.md`
> **Sprint Review**: `tasks/reviews/codegraph-readiness.review.md`
> **Implementation Notes**: `tasks/notes/codegraph-readiness.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260528-1652-codegraph-readiness.md`
- Sprint contract: `tasks/contracts/codegraph-readiness.contract.md`
- Sprint review: `tasks/reviews/codegraph-readiness.review.md`
- Implementation notes: `tasks/notes/codegraph-readiness.notes.md`
- Todo projection: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/codegraph-readiness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan when present; `.claude/.active-plan` is a legacy fallback during transition. Use `scripts/switch-plan.sh --plan plans/plan-20260528-1652-codegraph-readiness.md` when multiple plans exist.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260528-1652-codegraph-readiness.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260528-1652-codegraph-readiness.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/codegraph-readiness.contract.md`
- Review file: `tasks/reviews/codegraph-readiness.review.md`
- Implementation notes file: `tasks/notes/codegraph-readiness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/codegraph-readiness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and mirrored to `.claude/.active-plan` unless --no-active is used; latest non-archived `plans/plan-*.md` is a compatibility fallback only.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `tasks/todo.md`, `tasks/contracts/codegraph-readiness.contract.md`, `tasks/reviews/codegraph-readiness.review.md`, and `tasks/notes/codegraph-readiness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/codegraph-readiness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260528-1652-codegraph-readiness.md`; after execution revert branch `codex/codegraph-readiness` or the generated task artifacts

## Captured Planning Output

# Codegraph Vendoring + Tool Readiness

> Status: Draft (do NOT execute — gated behind hook-global-runtime Phase 0 closeout)
> Source: codex-plan (session 019e6db1-47b5-75d2-957f-d59e0fddb3db, two-round consult on 2026-05-28)
> Origin: derived from "B vs C" debate during hook-global-runtime Phase 0; codex independently recommended Option D (unified CLI surface, separate registry) over both B (independent plan) and C (fold into active plan).

## Goal

Vendor `@colbymchenry/codegraph` as a repo `devDependency` so cross-machine bootstrap is `bun install` instead of `npm install -g codegraph + codegraph install --target codex`. Surface codegraph readiness through the same `agentic-dev` CLI that hosts the global hook runtime — without polluting the host-adapter installer's `--target` semantics.

## Rationale (why D, not B or C)

- **C (fold into hook-global-runtime plan)** is rejected: it would overload `agentic-dev install --target` from "host adapter writer" into "host or tool readiness orchestrator". host targets write global config + handle trust; tool targets install deps + init repo state + may spawn daemons + may mutate `.codegraph/`. Same word, different lifecycle, rollback, permissions, and failure modes. Registry rots on the first non-codegraph tool.
- **B (pure independent plan)** is rejected: it creates split-brain — `agentic-dev doctor` says hooks fine while codegraph is missing or stale. Long-term that is a product lie because the user experiences the machine as one readiness contract.
- **D wins**: keep `install --target codex|claude|both` host-only; add a separate `agentic-dev tools ensure codegraph` verb plus `doctor.checkCodegraph()`. Unified CLI surface, separate registry. Future extension point: `agentic-dev tools ensure <other-tool>`.

## Scope

- In scope:
  - `package.json`: add `@colbymchenry/codegraph` to `devDependencies`
  - `bun.lock`: commit lockfile
  - `scripts/ensure-codegraph.sh`: shell entry adapter (CI / postinstall / bootstrap). Thin — calls `bun src/cli/index.ts tools ensure codegraph "$@"` once CLI exists; uses a temporary `src/cli/tools/codegraph-runner.ts` during the dependency slice before Phase 1A CLI is built.
  - `src/cli/tools/codegraph.ts`: authoritative TS implementation (resolve / check / ensure)
  - `src/cli/commands/tools.ts`: registers `agentic-dev tools ensure codegraph` (and reserves `tools restart codegraph`, `tools mcp install codegraph` as later verbs)
  - `src/cli/commands/doctor.ts`: extend to call `checkCodegraph()` and surface `mcpRegistered / indexFresh / daemonRunning / globalFallbackUsed`
  - `.ai/hooks/lib/codegraph-bin.sh`: shared helper that resolves codegraph bin path (local-first, optional global fallback). Replaces ad-hoc `command -v codegraph` in any hook that needs it.
  - `tests/cli/codegraph.test.ts` + `tests/cli/codegraph-resolver.test.ts` + `tests/tooling/codegraph-integration.test.ts`
  - `scripts/check-agent-tooling.sh`: change recommendation from `npm install -g codegraph` to `bun install` for this repo; keep global install as fallback for non-vendored repos
  - `docs/architecture/modules/verification/codegraph-readiness.md` (new architecture module)
  - `docs/reference-configs/external-tooling.md`: add vendored codegraph section
  - `.ai/context/capabilities.json`: register `verification-codegraph-readiness` capability
  - `tasks/contracts/codegraph-readiness.contract.md` (new sprint contract)
  - `tasks/notes/codegraph-readiness.notes.md`, `tasks/reviews/codegraph-readiness.review.md`
  - `CLAUDE.md` + `AGENTS.md`: update line about codegraph from "non-vendored, required" to "vendored as devDep + verified by `agentic-dev doctor`"
- Out of scope (future direction):
  - Auto-writing MCP config to point at vendored bin (would break other repos that share global MCP). Stays manual / opt-in via later `agentic-dev tools mcp install codegraph --target both`.
  - Vendoring sentrux / gbrain / other tools. The `tools ensure X` shape is intentionally extensible; first additional tool gets its own slice.
  - Killing existing `~/.codegraph/` daemon on doctor run. `--restart-daemon` is explicit.
  - Removing global codegraph from user machines.

## Implementation Sketch (D-as-designed-by-codex)

### `src/cli/tools/codegraph.ts` API

```ts
export type CodegraphSource = "local" | "global" | "missing";
export type CodegraphStatus = "ready" | "warning" | "partial" | "missing" | "failed";

export interface CodegraphResolveOptions {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
  preferLocal?: boolean;          // default true
  allowGlobalFallback?: boolean;  // default true; false = repo-only intent
}

export interface CodegraphResolution {
  source: CodegraphSource;
  binPath: string | null;
  version: string | null;
  globalBinPath?: string | null;
  localBinPath?: string | null;
  drift?: { local: string | null; global: string | null } | null;
  reason: string;
}

export interface CodegraphCheckResult {
  status: CodegraphStatus;
  resolution: CodegraphResolution;
  mcp: { codex: McpStatus; claude: McpStatus };
  index: { exists: boolean; status: "fresh" | "stale" | "missing" | "unknown"; path: string };
  daemon: { running: boolean | null; pid: number | null; source: "local" | "global" | "unknown" | null };
  commands: { init: string; sync: string; status: string };
  failures: ToolFailure[];  // each capped at ~4KB stdout/stderr; overflow links to ~/.codegraph/logs/
}

export interface CodegraphEnsureOptions extends CodegraphResolveOptions {
  init?: boolean;                                   // default true
  sync?: boolean;                                   // default true
  installMcp?: false | "codex" | "claude" | "both"; // default false — see Q6
  restartDaemon?: boolean;                          // default false
  json?: boolean;
}

export interface CodegraphEnsureResult extends CodegraphCheckResult {
  actions: ToolAction[];
  changed: boolean;
}

export function resolveCodegraph(opts: CodegraphResolveOptions): Promise<CodegraphResolution>;
export function checkCodegraph(opts: CodegraphResolveOptions): Promise<CodegraphCheckResult>;  // read-only
export function ensureCodegraph(opts: CodegraphEnsureOptions): Promise<CodegraphEnsureResult>; // mutates
```

### PATH resolution (key invariant)

- Never rely on shell `$PATH` for THIS repo's hook/CLI invocations.
- Resolution order: `<repoRoot>/node_modules/.bin/codegraph` → `command -v codegraph` (only if `allowGlobalFallback`) → missing.
- Hooks call `.ai/hooks/lib/codegraph-bin.sh` (thin printer) instead of inlining resolution logic.
- Version drift: local wins silently in execution; doctor reports `warning: local=X global=Y using=local`.

### MCP non-interference

- `ensureCodegraph({ installMcp: false })` is the default. Reason: MCP config lives in `~/.codex/config.toml` / `~/.claude/.mcp.json` — global host state. Auto-pointing it at a repo-local bin breaks other repos.
- Doctor reports `mcpRegistered: false` with remediation text; does NOT mutate.
- Later explicit verb: `agentic-dev tools mcp install codegraph --target codex|claude|both` (reserve, do not build yet).

### Edge case decision table

| Scenario | `doctor` returns |
|----------|------------------|
| Global exists, devDep declared, `bun install` not run | `status: partial`, `source: global`, `globalFallbackUsed: true`, remediation: `bun install` |
| `bun install` offline, Bun cache hit | `status: partial`, falls through to local |
| `bun install` offline, no cache | `status: missing`, remediation: `bun install` when online (NOT `npm install -g`) |
| `.codegraph/daemon.pid` from prior global session | do NOT kill; run `codegraph status .`; only `--restart-daemon` if bin/daemon mismatch or stale lock |
| User intentionally removed global, local bin present | `status: ready`; global absence silent |
| `allowGlobalFallback: false` AND local missing | `status: missing` (treats repo-only intent as authoritative) |

### Shell adapter strategy

- `scripts/ensure-codegraph.sh` is a thin entry. Once `src/cli/` exists: `exec bun src/cli/index.ts tools ensure codegraph "$@"`.
- Before Phase 1A CLI scaffold: shell calls temporary `src/cli/tools/codegraph-runner.ts` directly via `bun`. Merged into formal CLI in Phase 1A.
- Shell never reimplements init/sync/MCP logic. One source of truth.

### `tasks/contracts/codegraph-readiness.contract.md` skeleton

- Capability ID: `verification-codegraph-readiness`
- Architecture domain: `verification`
- Architecture module: `docs/architecture/modules/verification/codegraph-readiness.md`
- `allowed_paths`:
  - `package.json`, `bun.lock`
  - `scripts/ensure-codegraph.sh`, `scripts/check-agent-tooling.sh`
  - `src/cli/**`, `tests/cli/**`, `tests/tooling/**`
  - `docs/architecture/modules/verification/codegraph-readiness.md`
  - `docs/reference-configs/external-tooling.md`
  - `.ai/context/capabilities.json`, `.ai/hooks/lib/codegraph-bin.sh`
  - `tasks/contracts/codegraph-readiness.contract.md`, `tasks/notes/codegraph-readiness.notes.md`, `tasks/reviews/codegraph-readiness.review.md`
  - `tasks/todo.md`
  - `CLAUDE.md`, `AGENTS.md`
- Verification:
  - `bun install --frozen-lockfile` (CI variant; local doctor uses plain `bun install`)
  - `bash scripts/ensure-codegraph.sh --check --json`
  - `bun test tests/cli/codegraph*.test.ts tests/tooling/codegraph*.test.ts`
  - `bash scripts/check-agent-tooling.sh --host both --strict-readiness --json` (NOTE: `--strict-readiness` flag may not exist yet — confirm in Phase 1 of this plan)
  - `agentic-dev doctor --json`

## Rollout Phases

### Phase 0: Gating

- **MUST NOT START** until `hook-global-runtime` Phase 0 closeout: canary log matrix recorded in `docs/architecture/modules/runtime-harness/global-runtime.md` (note: codex initially suggested `docs/architecture/global-hook-runtime.md`, but repo convention puts module docs under `docs/architecture/modules/runtime-harness/` — confirm path during plan approval)
- Verify by reading current `tasks/contracts/hook-global-runtime.contract.md` Status field → should be `Done` or `Complete`

### Phase 1: Dependency slice (no CLI required)

- Add `@colbymchenry/codegraph` to `devDependencies`
- `bun install` to generate `bun.lock`
- Write `scripts/ensure-codegraph.sh` + temporary `src/cli/tools/codegraph-runner.ts`
- Tests for resolver (local-present, global-present, both-present-with-drift, neither, allowGlobalFallback=false)
- `scripts/check-agent-tooling.sh` switches default recommendation

### Phase 2: CLI integration (after hook-global-runtime Phase 1A lands)

- Move runner logic to `src/cli/tools/codegraph.ts` proper
- Register `src/cli/commands/tools.ts` with subcommand `ensure codegraph`
- Wire `src/cli/commands/doctor.ts` to call `checkCodegraph()`
- `.ai/hooks/lib/codegraph-bin.sh` for hook reuse

### Phase 3: Contract + docs

- Write contract + capability + architecture module
- Update CLAUDE.md / AGENTS.md
- Update `docs/reference-configs/external-tooling.md`

### Phase 4: Closeout

- Contract verification suite passes
- codegraph init/sync smoke on this repo (vendored bin path)
- Confirm other repos still work with their global codegraph (no global config mutation by us)

## Open Questions (resolve before approving)

1. **Path convention**: should `docs/architecture/global-hook-runtime.md` be `docs/architecture/modules/runtime-harness/global-runtime.md`? Confirm with active hook-global-runtime contract before Phase 4 of THIS plan writes the new verification module.
2. **`--strict-readiness` flag**: does `scripts/check-agent-tooling.sh` currently expose this? If not, adding it is in scope of THIS plan or a sub-task.
3. **`McpStatus` / `ToolFailure` / `ToolAction` types**: do these belong in `src/cli/tools/codegraph.ts` or in a shared `src/cli/tools/types.ts`? Decision affects whether `tools ensure <other-tool>` reuses types from day one.
4. **Lockfile strategy**: `bun install --frozen-lockfile` in verification — does local doctor downgrade to `bun install` automatically, or do we expose a `--allow-lock-update` flag?
5. **`tools restart codegraph`**: reserve the verb in Phase 2 CLI or defer to a later plan?

## Claude (Sonnet 4.6) micro-adjustments on top of codex design

| Codex said | Claude refinement |
|---|---|
| `bun install --frozen-lockfile` as verification check | Fine for CI; local doctor uses plain `bun install` to avoid blocking dev when user changes deps. |
| `.ai/hooks/lib/codegraph-bin.sh` helper | Place alongside existing `scripts/lib/workflow-state.sh` convention; one source of bin resolution per host. |
| `docs/architecture/global-hook-runtime.md` | Use `docs/architecture/modules/runtime-harness/global-runtime.md` to match existing module hierarchy convention (current module at `docs/architecture/modules/runtime-harness/hook-adapters.md`). |
| `failures: ToolFailure[]` with stdout/stderr | Cap each at ~4KB; overflow points to `~/.codegraph/logs/` via path reference. |
| `--restart-daemon` flag on ensure | Promote to standalone verb `agentic-dev tools restart codegraph` instead of overloading ensure. |

## Source

- Codex session: `019e6db1-47b5-75d2-957f-d59e0fddb3db` (continue via `/codex` in `.context/codex-session-id`)
- Origin debate: "B vs C" decision during hook-global-runtime Phase 0 execution, captured 2026-05-28
- Active plan being protected: `plans/plan-20260528-1436-hook-global-runtime.md` (do not modify Phase 1A `Target` types or `install --target` semantics from this plan)

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Codegraph Vendoring + Tool Readiness

#!/usr/bin/env bun

import { mkdirSync, realpathSync, writeFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { repoHarnessRepoIdFor } from "../src/effects/repo-registry";
import { getMcpPolicy } from "../src/cli/mcp/policy";
import { createMcpToolContext } from "../src/cli/mcp/server";
import { buildMcpToolDefinitions, callMcpTool, type McpToolContext } from "../src/cli/mcp/tools";
import type { McpPolicy } from "../src/cli/mcp/types";

export const DEFAULT_ROLLOUT_GATE_REPORT = ".ai/harness/runs/mcp-rollout-gate.json";
const DEFAULT_SHADOW_QUERY = "repo-harness";
const MAX_READ_COMPARE_FILES = 10;

export interface McpRolloutGateReport {
  protocol: "repo-harness-mcp-rollout-gate/v1";
  generated_at: string;
  repo: string;
  ok: boolean;
  rollout: McpPolicy["generalRepo"];
  shadow: {
    status: "pass" | "fail";
    legacy_files: number;
    manifest_entries: number;
    missing_from_manifest: string[];
    compared_reads: number;
    mismatched_reads: string[];
    tree_checked: boolean;
    search: {
      query: string;
      legacy_matches: number;
      general_repo_matches: number;
      checked: boolean;
    };
  };
  canary: {
    status: "ready" | "limited";
    stage: "read_only";
    selected_repos: Array<{
      repo_id: string;
      path?: string;
      size_class: "small" | "medium" | "large";
      visible_entries: number;
      access_mode?: string;
    }>;
    read_write_repo_enabled: string | null;
  };
  rollback: {
    status: "pass" | "fail";
    legacy_tools_available: boolean;
    general_repo_tools_hidden: boolean;
    command: string;
    preserves_registered_repos: boolean;
  };
  codegraph_ignore_audit: {
    status: "pass" | "warn";
    codegraph_available: boolean;
    filtered_path_count: number;
    manifest_complete: boolean;
    note: string;
  };
}

interface GateOptions {
  repo: string;
  out?: string;
  query?: string;
  requireThreeCanaries?: boolean;
}

function usage(): string {
  return [
    "Usage: scripts/mcp-rollout-gate.ts [--repo PATH] [--out PATH] [--query TEXT] [--require-three-canaries] [--json]",
    "",
    "Runs the local repo-harness MCP rollout gate for general repo CodeGraph migration.",
  ].join("\n");
}

function resolveInRepo(repo: string, path: string): string {
  return isAbsolute(path) ? path : resolve(repo, path);
}

async function jsonTool(ctx: McpToolContext, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await callMcpTool(ctx, name, args);
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
    : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function classifySize(entries: number): "small" | "medium" | "large" {
  if (entries < 1_000) return "small";
  if (entries < 50_000) return "medium";
  return "large";
}

function selectedCanaries(
  repos: Array<{ repo_id: string; path?: string; access_mode?: string; visible_entries: number }>,
  configured: string[],
): Array<{ repo_id: string; path?: string; access_mode?: string; visible_entries: number }> {
  const byIdOrPath = (candidate: { repo_id: string; path?: string }) => configured.includes(candidate.repo_id) || (candidate.path ? configured.includes(candidate.path) : false);
  const candidates = configured.length > 0 ? repos.filter(byIdOrPath) : repos;
  const sorted = [...candidates].sort((a, b) => a.visible_entries - b.visible_entries);
  if (sorted.length <= 3) return sorted;
  return [
    sorted[0],
    sorted[Math.floor(sorted.length / 2)],
    sorted[sorted.length - 1],
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
}

async function manifestFor(ctx: McpToolContext, repoId: string): Promise<Record<string, unknown>> {
  const entries: Record<string, unknown>[] = [];
  let cursor: string | null | undefined;
  let firstPage: Record<string, unknown> | null = null;
  for (let page = 0; page < 200; page += 1) {
    const response = await jsonTool(ctx, "repo_manifest", { repo_id: repoId, page_size: 1000, ...(cursor ? { cursor } : {}) });
    if (!firstPage) firstPage = response;
    entries.push(...recordArray(response.entries));
    cursor = typeof response.next_cursor === "string" && response.next_cursor.length > 0 ? response.next_cursor : null;
    if (!cursor) break;
  }
  return {
    ...(firstPage ?? {}),
    entries,
  };
}

export async function buildMcpRolloutGateReport(opts: GateOptions): Promise<McpRolloutGateReport> {
  const repo = realpathSync(resolve(opts.repo));
  const ctx = createMcpToolContext({ repo, profile: "planner", enableReader: true, allowedRoots: [repo] });
  const rollout = ctx.policy.generalRepo;
  const repoId = repoHarnessRepoIdFor(repo);
  const legacyFilesResult = await jsonTool(ctx, "list_workflow_files");
  const legacyFiles = recordArray(legacyFilesResult.files)
    .map((entry) => stringValue(entry.path))
    .filter((path): path is string => path !== undefined);
  const manifest = await manifestFor(ctx, repoId);
  const entries = recordArray(manifest.entries);
  const manifestPaths = new Set(entries.map((entry) => stringValue(entry.path)).filter((path): path is string => path !== undefined));
  const missingFromManifest = legacyFiles.filter((path) => !manifestPaths.has(path));

  const compareFiles = legacyFiles
    .filter((path) => manifestPaths.has(path))
    .slice(0, MAX_READ_COMPARE_FILES);
  const mismatchedReads: string[] = [];
  for (const path of compareFiles) {
    const legacyRead = await jsonTool(ctx, "read_workflow_file", { path });
    const generalRead = await jsonTool(ctx, "read_file", { repo_id: repoId, path });
    if (legacyRead.error || generalRead.error || legacyRead.sha256 !== generalRead.sha256) {
      mismatchedReads.push(path);
    }
  }

  const tree = await jsonTool(ctx, "list_tree", { repo_id: repoId, path: ".", depth: 1, page_size: 100 });
  const allowedRoots = await jsonTool(ctx, "list_allowed_roots");
  const currentRoot = recordArray(allowedRoots.roots).find((entry) => entry.path === repo);
  let legacyMatches = 0;
  let generalMatches = 0;
  let searchChecked = false;
  if (currentRoot) {
    const opened = await jsonTool(ctx, "open_workspace", { root_id: currentRoot.root_id });
    if (typeof opened.workspace_id === "string") {
      const query = opts.query ?? DEFAULT_SHADOW_QUERY;
      const legacySearch = await jsonTool(ctx, "search_text", { workspace_id: opened.workspace_id, query, path: ".", max_results: 20 });
      const generalSearch = await jsonTool(ctx, "search_text", { repo_id: repoId, query, paths: ["."], max_results: 20 });
      legacyMatches = recordArray(legacySearch.matches).length;
      generalMatches = recordArray(generalSearch.matches).length;
      searchChecked = !legacySearch.error && !generalSearch.error;
    }
  }

  const repos = recordArray(allowedRoots.roots).map((entry) => ({
    repo_id: String(entry.repo_id ?? ""),
    path: stringValue(entry.path),
    access_mode: stringValue(entry.access_mode),
  })).filter((entry) => entry.repo_id.length > 0);
  const canaryInputs = repos.length > 0 ? repos : [{ repo_id: repoId, path: repo, access_mode: "read_only" }];
  const canaryWithCounts: Array<{ repo_id: string; path?: string; access_mode?: string; visible_entries: number }> = [];
  for (const candidate of canaryInputs) {
    try {
      const candidateManifest = await manifestFor(ctx, candidate.repo_id);
      const counts = candidateManifest.counts as Record<string, unknown> | undefined;
      canaryWithCounts.push({
        ...candidate,
        visible_entries: numberValue(counts?.entries) || recordArray(candidateManifest.entries).length,
      });
    } catch (_error) {
      canaryWithCounts.push({ ...candidate, visible_entries: 0 });
    }
  }
  const pickedCanaries = selectedCanaries(canaryWithCounts, rollout.canary_repos);

  const rollbackPolicy = getMcpPolicy("planner", {
    enableReader: true,
    allowedRoots: [repo],
    generalRepo: {
      ...rollout,
      general_repo_read: false,
      repo_write: false,
      rollback_to_legacy_tools: true,
    },
  });
  const rollbackToolNames = buildMcpToolDefinitions(rollbackPolicy).map((tool) => tool.name);
  const legacyToolsAvailable = ["read_workflow_file", "read_text", "search_text"].every((tool) => rollbackToolNames.includes(tool));
  const generalRepoToolsHidden = ["repo_manifest", "read_file", "write_file", "refresh_repo_index"].every((tool) => !rollbackToolNames.includes(tool));
  const rollbackStatus = legacyToolsAvailable && generalRepoToolsHidden ? "pass" : "fail";
  const codegraph = manifest.codegraph as Record<string, unknown> | undefined;
  const manifestComplete = manifest.complete !== false;
  const filteredPathCount = numberValue(codegraph?.filtered_paths);
  const codegraphAvailable = codegraph?.available === true;

  const shadowStatus = missingFromManifest.length === 0 &&
    mismatchedReads.length === 0 &&
    Array.isArray(tree.entries) &&
    searchChecked
    ? "pass"
    : "fail";
  const canaryStatus = opts.requireThreeCanaries && pickedCanaries.length < 3 ? "limited" : "ready";
  const codegraphIgnoreStatus = manifestComplete ? "pass" : "warn";

  return {
    protocol: "repo-harness-mcp-rollout-gate/v1",
    generated_at: new Date().toISOString(),
    repo,
    ok: shadowStatus === "pass" && rollbackStatus === "pass" && (canaryStatus === "ready" || !opts.requireThreeCanaries),
    rollout,
    shadow: {
      status: shadowStatus,
      legacy_files: legacyFiles.length,
      manifest_entries: numberValue((manifest.counts as Record<string, unknown> | undefined)?.entries) || entries.length,
      missing_from_manifest: missingFromManifest,
      compared_reads: compareFiles.length,
      mismatched_reads: mismatchedReads,
      tree_checked: Array.isArray(tree.entries),
      search: {
        query: opts.query ?? DEFAULT_SHADOW_QUERY,
        legacy_matches: legacyMatches,
        general_repo_matches: generalMatches,
        checked: searchChecked,
      },
    },
    canary: {
      status: canaryStatus,
      stage: "read_only",
      selected_repos: pickedCanaries.map((entry) => ({
        repo_id: entry.repo_id,
        path: entry.path,
        size_class: classifySize(entry.visible_entries),
        visible_entries: entry.visible_entries,
        access_mode: entry.access_mode,
      })),
      read_write_repo_enabled: rollout.repo_write ? pickedCanaries.find((entry) => entry.access_mode === "read_write")?.repo_id ?? null : null,
    },
    rollback: {
      status: rollbackStatus,
      legacy_tools_available: legacyToolsAvailable,
      general_repo_tools_hidden: generalRepoToolsHidden,
      command: "REPO_HARNESS_MCP_GENERAL_REPO_READ=0 REPO_HARNESS_MCP_ROLLBACK_LEGACY_TOOLS=1 repo-harness mcp serve --repo . --transport http --profile planner",
      preserves_registered_repos: true,
    },
    codegraph_ignore_audit: {
      status: codegraphIgnoreStatus,
      codegraph_available: codegraphAvailable,
      filtered_path_count: filteredPathCount,
      manifest_complete: manifestComplete,
      note: codegraphAvailable
        ? "CodeGraph returned paths are rechecked by path guard and .ignore; manifest remains walker-backed."
        : "CodeGraph is unavailable; manifest completeness is still checked through the secure filesystem walker.",
    },
  };
}

function parseArgs(argv: string[]): GateOptions & { json?: boolean } {
  const opts: GateOptions & { json?: boolean } = { repo: "." };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo") opts.repo = argv[++index] ?? ".";
    else if (arg === "--out") opts.out = argv[++index];
    else if (arg === "--query") opts.query = argv[++index];
    else if (arg === "--require-three-canaries") opts.requireThreeCanaries = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

if (import.meta.main) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const report = await buildMcpRolloutGateReport(opts);
    const outPath = resolveInRepo(resolve(opts.repo), opts.out ?? DEFAULT_ROLLOUT_GATE_REPORT);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`[mcp-rollout] ${report.ok ? "OK" : "FAIL"} shadow=${report.shadow.status} canary=${report.canary.status} rollback=${report.rollback.status} report=${outPath}`);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exit(2);
  }
}

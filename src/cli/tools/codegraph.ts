import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export type CodegraphSource = "local" | "global" | "missing";
export type CodegraphStatus = "present" | "warning" | "partial" | "missing";

export interface CodegraphResolveOptions {
  repoRoot: string;
  env?: NodeJS.ProcessEnv;
}

export interface CodegraphResolution {
  source: CodegraphSource;
  binPath: string | null;
  version: string | null;
  localBinPath: string | null;
  globalBinPath: string | null;
  globalFallbackUsed: boolean;
  drift: { local: string | null; global: string | null; using: string } | null;
}

export interface CodegraphCheckResult {
  status: CodegraphStatus;
  reason: string;
  resolution: CodegraphResolution;
  raw: Record<string, unknown>;
}

export interface CodegraphEnsureResult extends CodegraphCheckResult {
  changed: boolean;
  actions: Array<Record<string, unknown>>;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..");

function runJson(command: string, args: string[], repoRoot: string, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(env ?? {}) },
  });

  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr || result.stdout || String(result.error));
  }

  return JSON.parse(result.stdout);
}

function normalize(raw: Record<string, any>): CodegraphCheckResult {
  return {
    status: raw.status,
    reason: raw.reason,
    resolution: {
      source: raw.source,
      binPath: raw.bin_path,
      version: raw.version,
      localBinPath: raw.local_bin_path,
      globalBinPath: raw.global_bin_path,
      globalFallbackUsed: Boolean(raw.global_fallback_used),
      drift: raw.drift,
    },
    raw,
  };
}

export async function checkCodegraph(opts: CodegraphResolveOptions): Promise<CodegraphCheckResult> {
  const report = runJson("bash", [join(REPO_ROOT, "scripts", "check-agent-tooling.sh"), "--json", "--host", "codex"], opts.repoRoot, opts.env);
  return normalize(report.tools.codegraph);
}

export async function resolveCodegraph(opts: CodegraphResolveOptions): Promise<CodegraphResolution> {
  return (await checkCodegraph(opts)).resolution;
}

export async function ensureCodegraph(opts: CodegraphResolveOptions): Promise<CodegraphEnsureResult> {
  const report = runJson("bash", [join(REPO_ROOT, "scripts", "ensure-codegraph.sh"), "--json", "--repo", opts.repoRoot], opts.repoRoot, opts.env);
  const normalized = normalize(report.codegraph);
  return {
    ...normalized,
    changed: Boolean(report.changed),
    actions: Array.isArray(report.actions) ? report.actions : [],
  };
}

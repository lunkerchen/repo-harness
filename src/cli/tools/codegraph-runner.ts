#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

type ActionStatus = "changed" | "unchanged" | "failed";

interface RunnerOptions {
  checkOnly: boolean;
  json: boolean;
  init: boolean;
  sync: boolean;
  installDeps: boolean;
  repoRoot: string;
}

interface Action {
  action: string;
  status: ActionStatus;
  command: string[];
  stdout?: string;
  stderr?: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..");

function usage() {
  console.log(`Usage: scripts/ensure-codegraph.sh [--check] [--json] [--init] [--sync] [--no-install-deps] [--repo <path>]

Options:
  --check             Read-only readiness check. Does not install, init, sync, or write MCP config.
  --json              Print structured JSON.
  --init              Initialize the repo index when missing.
  --sync              Sync the repo index.
  --no-install-deps   Do not run bun install when the local binary is missing.
  --repo <path>       Repository root to check or ensure. Defaults to current directory.
`);
}

function parseArgs(argv: string[]): RunnerOptions {
  const opts: RunnerOptions = {
    checkOnly: false,
    json: false,
    init: false,
    sync: false,
    installDeps: true,
    repoRoot: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      opts.checkOnly = true;
      continue;
    }
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--init") {
      opts.init = true;
      continue;
    }
    if (arg === "--sync") {
      opts.sync = true;
      continue;
    }
    if (arg === "--no-install-deps") {
      opts.installDeps = false;
      continue;
    }
    if (arg === "--repo") {
      const next = argv[index + 1];
      if (!next) throw new Error("--repo requires a path");
      opts.repoRoot = next;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return opts;
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message || result.error) : "",
  };
}

function trimOutput(value: string) {
  if (value.length <= 4096) return value;
  return `${value.slice(0, 4096)}\n[output truncated]`;
}

function readJson(path: string) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (_error) {
    return null;
  }
}

function readToolingReport(repoRoot: string) {
  const checker = join(REPO_ROOT, "scripts", "check-agent-tooling.sh");
  const result = run("bash", [checker, "--json", "--host", "codex"], repoRoot);
  if (!result.ok) {
    throw new Error(`check-agent-tooling failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed.tools.codegraph;
}

function hasCodegraphDependency(repoRoot: string) {
  const pkg = readJson(join(repoRoot, "package.json"));
  return Boolean(
    pkg?.devDependencies?.["@colbymchenry/codegraph"] ||
      pkg?.dependencies?.["@colbymchenry/codegraph"] ||
      pkg?.optionalDependencies?.["@colbymchenry/codegraph"]
  );
}

function appendAction(actions: Action[], action: string, command: string[], result: ReturnType<typeof run>): boolean {
  actions.push({
    action,
    status: result.ok ? "changed" : "failed",
    command,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr || result.error),
  });
  return result.ok;
}

function ensureCodegraph(opts: RunnerOptions) {
  const repoRoot = opts.repoRoot;
  const actions: Action[] = [];

  if (opts.checkOnly) {
    const codegraph = readToolingReport(repoRoot);
    return { changed: false, read_only: true, codegraph, actions };
  }

  let codegraph = readToolingReport(repoRoot);
  if (opts.installDeps && hasCodegraphDependency(repoRoot) && !codegraph.local_bin_path) {
    appendAction(actions, "install-deps", ["bun", "install"], run("bun", ["install"], repoRoot));
    codegraph = readToolingReport(repoRoot);
  }

  const binPath = codegraph.bin_path;
  if (!binPath) {
    return { changed: actions.some((entry) => entry.status === "changed"), read_only: false, codegraph, actions };
  }

  if (opts.init && codegraph.project_index?.status === "not-initialized") {
    appendAction(actions, "init-index", [binPath, "init", "-i", "."], run(binPath, ["init", "-i", "."], repoRoot));
    codegraph = readToolingReport(repoRoot);
  }

  if (opts.sync) {
    mkdirSync(join(repoRoot, ".codegraph"), { recursive: true });
    appendAction(actions, "sync-index", [binPath, "sync", "."], run(binPath, ["sync", "."], repoRoot));
    codegraph = readToolingReport(repoRoot);
  }

  return {
    changed: actions.some((entry) => entry.status === "changed"),
    read_only: false,
    codegraph,
    actions,
  };
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(opts.repoRoot)) {
    throw new Error(`Repo root does not exist: ${opts.repoRoot}`);
  }
  const result = ensureCodegraph(opts);
  if (opts.json) {
    console.log(JSON.stringify({
      generated_at: new Date().toISOString(),
      repo_root: opts.repoRoot,
      ...result,
    }, null, 2));
  } else {
    console.log(`CodeGraph: ${result.codegraph.status} (${result.codegraph.reason})`);
    console.log(`Source: ${result.codegraph.source}`);
    if (result.actions.length > 0) {
      for (const action of result.actions) {
        console.log(`${action.action}: ${action.status}`);
      }
    }
  }

  const failed = result.actions.some((entry) => entry.status === "failed");
  process.exit(failed ? 1 : 0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}

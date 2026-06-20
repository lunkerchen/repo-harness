import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  decideLaneEdit,
  decideLaneStop,
  formatLaneEditDecision,
  formatLaneStopDecision,
  normalizeGateMode,
  recordLaneEdit,
  type LaneGateMode,
} from "../../core/lanes/state";

export interface LaneHookCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function readPolicyGate(cwd: string, path: "scope_gate" | "closure_gate"): string | undefined {
  const file = join(cwd, ".ai/harness/policy.json");
  if (!existsSync(file)) return undefined;
  try {
    const policy = JSON.parse(readFileSync(file, "utf-8"));
    const value = policy?.lanes?.[path];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function laneScopeGateMode(cwd: string): LaneGateMode {
  return normalizeGateMode(
    process.env.REPO_HARNESS_LANE_SCOPE_GATE ?? readPolicyGate(cwd, "scope_gate"),
    "advice",
  );
}

function laneClosureGateMode(cwd: string): LaneGateMode {
  return normalizeGateMode(
    process.env.REPO_HARNESS_LANE_CLOSURE_GATE ?? readPolicyGate(cwd, "closure_gate"),
    "advice",
  );
}

export function isHighContextLanePath(path: string): boolean {
  return (
    /^(AGENTS|CLAUDE|WARP|CONTRIBUTING)\.md$/.test(path) ||
    path === ".github/copilot-instructions.md" ||
    /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(path) ||
    /^\.codex\/skills\/[^/]+\/SKILL\.md$/.test(path) ||
    path.startsWith(".ai/context/") ||
    path.startsWith(".ai/hooks/") ||
    path.startsWith("assets/hooks/") ||
    path === ".ai/harness/policy.json" ||
    path === ".ai/harness/workflow-contract.json" ||
    path === "assets/workflow-contract.v1.json" ||
    path === "package.json" ||
    path === "bun.lock" ||
    path === "bun.lockb" ||
    path === "Makefile" ||
    path === "pyproject.toml" ||
    path === "Cargo.toml" ||
    path === "go.mod" ||
    path.startsWith(".github/workflows/") ||
    path === "docs/spec.md" ||
    path.startsWith("docs/reference-configs/") ||
    /^specs\/[^/]+\/(PRODUCT|TECH)\.md$/.test(path) ||
    path.startsWith("tasks/workstreams/")
  );
}

export function runLaneEditDecisionCli(argv: readonly string[]): LaneHookCliResult {
  const target = argv[0];
  if (!target) {
    return {
      stdout: "",
      stderr: "[LaneScopeGuard] missing target path\n",
      exitCode: 2,
    };
  }
  const mode = laneScopeGateMode(process.cwd());
  const decision = decideLaneEdit(target, {
    mode,
    highContext: isHighContextLanePath,
  });
  const message = formatLaneEditDecision(decision);
  if (decision.action === "block") {
    return { stdout: "", stderr: message ? `${message}\n` : "", exitCode: 2 };
  }
  return { stdout: message ? `${message}\n` : "", stderr: "", exitCode: 0 };
}

export function runLaneRecordEditCli(argv: readonly string[]): LaneHookCliResult {
  const target = argv[0];
  if (!target) return { stdout: "", stderr: "", exitCode: 0 };
  try {
    recordLaneEdit(target, { highContext: isHighContextLanePath });
  } catch {
    // PostEdit state capture is advisory; never break the edit path.
  }
  return { stdout: "", stderr: "", exitCode: 0 };
}

export function runLaneStopDecisionCli(): LaneHookCliResult {
  const decision = decideLaneStop({ mode: laneClosureGateMode(process.cwd()) });
  if (decision.action === "allow") return { stdout: "", stderr: "", exitCode: 0 };
  const message = formatLaneStopDecision(decision);
  return { stdout: message ? `${message}\n` : "", stderr: "", exitCode: 0 };
}

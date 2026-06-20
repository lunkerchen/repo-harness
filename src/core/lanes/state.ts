import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "path";
import { ensureRepoRelativePath } from "../../effects/path-safety";
import { laneForbiddenScopes, resolveLaneWriteOwner } from "./ownership-resolver";
import {
  validateLaneContract,
  type LaneContract,
  type LaneDefinition,
  type LaneValidationReport,
} from "./schema";

export type LaneGateMode = "advice" | "enforce" | "off";
export type LaneDecisionAction = "allow" | "advise" | "block";

export interface ActiveLaneRun {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly contract_file: string;
  readonly activated_at: string;
  readonly status: "active" | "closed";
}

export interface LaneWorktreeBinding {
  readonly lane_id: string;
  readonly worktree: string;
  readonly branch?: string;
  readonly bound_at: string;
}

export interface LaneWorktreeBindings {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly bindings: readonly LaneWorktreeBinding[];
}

export interface LaneRuntimeEntry {
  readonly status: "ready" | "active" | "blocked" | "closed";
  readonly touched_files: readonly string[];
  readonly unauthorized_changes: readonly string[];
  readonly evidence: Record<string, unknown>;
  readonly updated_at?: string;
  readonly closed_at?: string;
}

export interface LaneRuntimeState {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly contract_file: string;
  readonly updated_at: string;
  readonly lanes: Record<string, LaneRuntimeEntry>;
}

export interface LaneStatusReport {
  readonly schema_version: 1;
  readonly status: "inactive" | "active" | "closed" | "invalid";
  readonly repo_root: string;
  readonly current_worktree: string;
  readonly active_run?: ActiveLaneRun;
  readonly current_lane?: LaneWorktreeBinding;
  readonly contract?: LaneContract;
  readonly bindings?: LaneWorktreeBindings;
  readonly runtime?: LaneRuntimeState;
  readonly validation?: LaneValidationReport;
}

export interface LaneEditDecision {
  readonly schema_version: 1;
  readonly action: LaneDecisionAction;
  readonly guard: "LaneScopeGuard";
  readonly mode: LaneGateMode;
  readonly reason?: string;
  readonly recommendation?: string;
  readonly lane_id?: string;
  readonly owner_lane_id?: string;
  readonly target_path?: string;
}

export interface LaneRecordEditResult {
  readonly schema_version: 1;
  readonly status: "recorded" | "skipped";
  readonly reason?: string;
  readonly lane_id?: string;
  readonly unauthorized?: boolean;
}

export interface LaneStopDecision {
  readonly schema_version: 1;
  readonly action: LaneDecisionAction;
  readonly guard: "LaneEvidenceGate";
  readonly mode: LaneGateMode;
  readonly reason?: string;
  readonly lane_id?: string;
  readonly missing?: readonly string[];
}

export interface LaneEvidenceMergeResult {
  readonly schema_version: 1;
  readonly status: "recorded" | "skipped";
  readonly reason?: string;
  readonly lane_id?: string;
  readonly missing?: readonly string[];
}

const ACTIVE_FILE = ".ai/harness/orchestration/active.json";
const BINDINGS_FILE = ".ai/harness/orchestration/worktree-bindings.json";
const STOP_SIGNATURES_FILE = ".ai/harness/orchestration/stop-signatures.json";

function nowIso(): string {
  return new Date().toISOString();
}

export function resolveRepoRoot(cwd = process.cwd()): string {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

function currentBranch(cwd: string): string | undefined {
  try {
    const branch = execFileSync("git", ["-C", cwd, "branch", "--show-current"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

function currentHead(cwd: string): string | undefined {
  try {
    const head = execFileSync("git", ["-C", cwd, "rev-parse", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return head || undefined;
  } catch {
    return undefined;
  }
}

function canonicalWorktree(path: string): string {
  const absolute = isAbsolute(path) ? path : resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return resolve(absolute);
  }
}

function readJsonFile<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(tmp, file);
}

function repoRelativeFile(repoRoot: string, file: string): string {
  const absolute = isAbsolute(file) ? resolve(file) : resolve(repoRoot, file);
  const rel = relative(repoRoot, absolute).replace(/\\/g, "/");
  const checked = ensureRepoRelativePath(rel);
  if (!checked.ok || !checked.path) throw new Error(checked.error ?? `invalid repo path: ${file}`);
  return checked.path;
}

function readContractFile(repoRoot: string, file: string): { path: string; report: LaneValidationReport } {
  const contractPath = repoRelativeFile(repoRoot, file);
  const raw = JSON.parse(readFileSync(join(repoRoot, contractPath), "utf-8"));
  return { path: contractPath, report: validateLaneContract(raw) };
}

export function laneStatePaths(repoRoot: string, runId?: string): {
  activeFile: string;
  bindingsFile: string;
  stopSignaturesFile: string;
  runDir?: string;
  laneStateFile?: string;
} {
  const paths = {
    activeFile: join(repoRoot, ACTIVE_FILE),
    bindingsFile: join(repoRoot, BINDINGS_FILE),
    stopSignaturesFile: join(repoRoot, STOP_SIGNATURES_FILE),
  };
  if (!runId) return paths;
  const runDir = join(repoRoot, ".ai/harness/runs", runId);
  return {
    ...paths,
    runDir,
    laneStateFile: join(runDir, "lane-state.json"),
  };
}

export function readActiveLaneRun(repoRoot: string): ActiveLaneRun | undefined {
  return readJsonFile<ActiveLaneRun>(laneStatePaths(repoRoot).activeFile);
}

export function readLaneBindings(repoRoot: string, runId: string): LaneWorktreeBindings {
  return readJsonFile<LaneWorktreeBindings>(laneStatePaths(repoRoot, runId).bindingsFile) ?? {
    schema_version: 1,
    run_id: runId,
    bindings: [],
  };
}

export function readLaneRuntimeState(repoRoot: string, runId: string): LaneRuntimeState | undefined {
  const file = laneStatePaths(repoRoot, runId).laneStateFile;
  return file ? readJsonFile<LaneRuntimeState>(file) : undefined;
}

function writeLaneRuntimeState(repoRoot: string, state: LaneRuntimeState): void {
  const file = laneStatePaths(repoRoot, state.run_id).laneStateFile;
  if (!file) throw new Error("missing lane state path");
  writeJsonAtomic(file, state);
}

function loadActiveContract(repoRoot: string): {
  active?: ActiveLaneRun;
  report?: LaneValidationReport;
  contract?: LaneContract;
} {
  const active = readActiveLaneRun(repoRoot);
  if (!active || active.status !== "active") return {};
  const report = readContractFile(repoRoot, active.contract_file).report;
  return { active, report, contract: report.contract };
}

function initialRuntimeState(contract: LaneContract, contractFile: string): LaneRuntimeState {
  const lanes: Record<string, LaneRuntimeEntry> = {};
  for (const lane of contract.lanes) {
    lanes[lane.id] = {
      status: lane.status ?? "ready",
      touched_files: [],
      unauthorized_changes: [],
      evidence: {},
    };
  }
  return {
    schema_version: 1,
    run_id: contract.run_id,
    contract_file: contractFile,
    updated_at: nowIso(),
    lanes,
  };
}

export function activateLaneContract(file: string, cwd = process.cwd()): LaneStatusReport {
  const repoRoot = resolveRepoRoot(cwd);
  const { path: contractFile, report } = readContractFile(repoRoot, file);
  if (report.status === "fail" || !report.contract) {
    return {
      schema_version: 1,
      status: "invalid",
      repo_root: repoRoot,
      current_worktree: canonicalWorktree(repoRoot),
      validation: report,
    };
  }

  const active: ActiveLaneRun = {
    schema_version: 1,
    run_id: report.contract.run_id,
    contract_file: contractFile,
    activated_at: nowIso(),
    status: "active",
  };
  const bindings: LaneWorktreeBindings = {
    schema_version: 1,
    run_id: report.contract.run_id,
    bindings: [],
  };
  const runtime = initialRuntimeState(report.contract, contractFile);
  const paths = laneStatePaths(repoRoot, report.contract.run_id);
  if (!paths.laneStateFile) throw new Error("missing lane state path");
  mkdirSync(paths.runDir ?? dirname(paths.laneStateFile), { recursive: true });
  writeJsonAtomic(paths.activeFile, active);
  writeJsonAtomic(paths.bindingsFile, bindings);
  writeLaneRuntimeState(repoRoot, runtime);
  return {
    schema_version: 1,
    status: "active",
    repo_root: repoRoot,
    current_worktree: canonicalWorktree(repoRoot),
    active_run: active,
    contract: report.contract,
    bindings,
    runtime,
    validation: report,
  };
}

export function bindLaneWorktree(
  laneId: string,
  options: { cwd?: string; worktree?: string; branch?: string } = {},
): LaneStatusReport {
  const repoRoot = resolveRepoRoot(options.cwd ?? process.cwd());
  const { active, report, contract } = loadActiveContract(repoRoot);
  if (!active || !contract || !report) {
    throw new Error("no active lane run; use repo-harness lanes activate <contract>");
  }
  const lane = contract.lanes.find((entry) => entry.id === laneId);
  if (!lane) throw new Error(`unknown lane id: ${laneId}`);

  const worktree = canonicalWorktree(options.worktree ?? repoRoot);
  const existing = readLaneBindings(repoRoot, active.run_id);
  const conflict = existing.bindings.find((binding) => binding.worktree === worktree && binding.lane_id !== laneId);
  if (conflict) {
    throw new Error(`worktree ${worktree} is already bound to lane ${conflict.lane_id}`);
  }

  const binding: LaneWorktreeBinding = {
    lane_id: laneId,
    worktree,
    branch: options.branch ?? currentBranch(worktree) ?? lane.branch,
    bound_at: nowIso(),
  };
  const bindings: LaneWorktreeBindings = {
    schema_version: 1,
    run_id: active.run_id,
    bindings: [...existing.bindings.filter((entry) => entry.lane_id !== laneId), binding],
  };
  writeJsonAtomic(laneStatePaths(repoRoot).bindingsFile, bindings);

  const runtime = readLaneRuntimeState(repoRoot, active.run_id) ?? initialRuntimeState(contract, active.contract_file);
  const laneState = runtime.lanes[laneId] ?? {
    status: "ready",
    touched_files: [],
    unauthorized_changes: [],
    evidence: {},
  };
  const nextRuntime: LaneRuntimeState = {
    ...runtime,
    updated_at: nowIso(),
    lanes: {
      ...runtime.lanes,
      [laneId]: {
        ...laneState,
        status: laneState.status === "closed" ? "closed" : "active",
        updated_at: nowIso(),
      },
    },
  };
  writeLaneRuntimeState(repoRoot, nextRuntime);
  return laneStatus(options.cwd ?? process.cwd());
}

function currentBinding(repoRoot: string, bindings: LaneWorktreeBindings, cwd = process.cwd()): LaneWorktreeBinding | undefined {
  const current = canonicalWorktree(resolveRepoRoot(cwd));
  return bindings.bindings.find((binding) => canonicalWorktree(binding.worktree) === current);
}

export function laneStatus(cwd = process.cwd()): LaneStatusReport {
  const repoRoot = resolveRepoRoot(cwd);
  const current = canonicalWorktree(repoRoot);
  const active = readActiveLaneRun(repoRoot);
  if (!active) {
    return { schema_version: 1, status: "inactive", repo_root: repoRoot, current_worktree: current };
  }
  const report = readContractFile(repoRoot, active.contract_file).report;
  const bindings = readLaneBindings(repoRoot, active.run_id);
  const runtime = readLaneRuntimeState(repoRoot, active.run_id);
  return {
    schema_version: 1,
    status: active.status === "closed" ? "closed" : report.status === "fail" ? "invalid" : "active",
    repo_root: repoRoot,
    current_worktree: current,
    active_run: active,
    current_lane: currentBinding(repoRoot, bindings, cwd),
    contract: report.contract,
    bindings,
    runtime,
    validation: report,
  };
}

function evidenceFromFile(repoRoot: string, file: string): Record<string, unknown> {
  const evidenceFile = repoRelativeFile(repoRoot, file);
  const raw = JSON.parse(readFileSync(join(repoRoot, evidenceFile), "utf-8"));
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("lane evidence must be a JSON object");
  }
  return raw as Record<string, unknown>;
}

export function closeLane(
  laneId: string,
  options: { cwd?: string; evidenceFile?: string } = {},
): LaneStatusReport {
  const repoRoot = resolveRepoRoot(options.cwd ?? process.cwd());
  const { active, contract } = loadActiveContract(repoRoot);
  if (!active || !contract) throw new Error("no active lane run");
  if (!contract.lanes.some((lane) => lane.id === laneId)) throw new Error(`unknown lane id: ${laneId}`);

  const runtime = readLaneRuntimeState(repoRoot, active.run_id) ?? initialRuntimeState(contract, active.contract_file);
  const laneState = runtime.lanes[laneId] ?? {
    status: "ready",
    touched_files: [],
    unauthorized_changes: [],
    evidence: {},
  };
  const evidence = options.evidenceFile
    ? { ...laneState.evidence, ...evidenceFromFile(repoRoot, options.evidenceFile) }
    : laneState.evidence;
  const closedAt = nowIso();
  const nextLanes: Record<string, LaneRuntimeEntry> = {
    ...runtime.lanes,
    [laneId]: {
      ...laneState,
      status: "closed",
      evidence,
      updated_at: closedAt,
      closed_at: closedAt,
    },
  };
  const nextRuntime: LaneRuntimeState = {
    ...runtime,
    updated_at: closedAt,
    lanes: nextLanes,
  };
  writeLaneRuntimeState(repoRoot, nextRuntime);

  if (contract.lanes.every((lane) => nextLanes[lane.id]?.status === "closed")) {
    const closed: ActiveLaneRun = { ...active, status: "closed" };
    writeJsonAtomic(laneStatePaths(repoRoot).activeFile, closed);
  }

  return laneStatus(options.cwd ?? process.cwd());
}

export function normalizeGateMode(value: string | undefined, fallback: LaneGateMode = "advice"): LaneGateMode {
  if (value === "enforce" || value === "advice" || value === "off") return value;
  return fallback;
}

function decisionFromMode(mode: LaneGateMode): LaneDecisionAction {
  return mode === "enforce" ? "block" : "advise";
}

function missingEvidence(lane: LaneDefinition, entry: LaneRuntimeEntry | undefined, cwd: string): string[] {
  const missing: string[] = [];
  const evidence = entry?.evidence ?? {};
  for (const field of lane.required_evidence ?? []) {
    if (field === "files_changed") {
      if ((entry?.touched_files.length ?? 0) === 0 && evidence[field] === undefined) missing.push(field);
      continue;
    }
    if (field === "unauthorized_changes") {
      if (evidence[field] === undefined && entry?.unauthorized_changes === undefined) missing.push(field);
      continue;
    }
    if (field === "head_sha") {
      if (evidence[field] === undefined && !currentHead(cwd)) missing.push(field);
      continue;
    }
    if (evidence[field] === undefined || evidence[field] === null || evidence[field] === "") {
      missing.push(field);
    }
  }
  return missing;
}

function effectiveRequiredEvidence(lane: LaneDefinition): readonly string[] {
  const required = new Set(lane.required_evidence ?? []);
  if (lane.role === "reviewer") {
    required.add("reviewed_head_sha");
  }
  return [...required].sort();
}

function loadActiveLaneContext(cwd: string): {
  repoRoot: string;
  active?: ActiveLaneRun;
  contract?: LaneContract;
  bindings?: LaneWorktreeBindings;
  runtime?: LaneRuntimeState;
  binding?: LaneWorktreeBinding;
} {
  const repoRoot = resolveRepoRoot(cwd);
  const { active, contract } = loadActiveContract(repoRoot);
  if (!active || !contract) return { repoRoot };
  const bindings = readLaneBindings(repoRoot, active.run_id);
  const runtime = readLaneRuntimeState(repoRoot, active.run_id);
  return {
    repoRoot,
    active,
    contract,
    bindings,
    runtime,
    binding: currentBinding(repoRoot, bindings, cwd),
  };
}

export function decideLaneEdit(
  targetPath: string,
  options: { cwd?: string; mode?: LaneGateMode; highContext?: (path: string) => boolean } = {},
): LaneEditDecision {
  const mode = options.mode ?? "advice";
  const cwd = options.cwd ?? process.cwd();
  if (mode === "off") return { schema_version: 1, action: "allow", guard: "LaneScopeGuard", mode };
  const { contract, binding } = loadActiveLaneContext(cwd);
  if (!contract) return { schema_version: 1, action: "allow", guard: "LaneScopeGuard", mode };

  const target = ensureRepoRelativePath(targetPath);
  if (!target.ok || !target.path) {
    return {
      schema_version: 1,
      action: decisionFromMode(mode),
      guard: "LaneScopeGuard",
      mode,
      reason: target.error ?? "invalid target path",
      recommendation: "Use repo-relative paths inside the active lane worktree.",
    };
  }

  if (!binding) {
    return {
      schema_version: 1,
      action: decisionFromMode(mode),
      guard: "LaneScopeGuard",
      mode,
      target_path: target.path,
      reason: "active lane run exists but this worktree is not bound to a lane",
      recommendation: "Run repo-harness lanes bind <lane-id> --worktree <path> before editing.",
    };
  }

  const currentLane = contract.lanes.find((lane) => lane.id === binding.lane_id);
  if (!currentLane) {
    return {
      schema_version: 1,
      action: decisionFromMode(mode),
      guard: "LaneScopeGuard",
      mode,
      target_path: target.path,
      lane_id: binding.lane_id,
      reason: `bound lane ${binding.lane_id} is missing from the active contract`,
      recommendation: "Re-bind this worktree to a lane declared by the active contract.",
    };
  }

  const owner = resolveLaneWriteOwner(contract, target.path);
  if (owner.status !== "owned" || !owner.owner) {
    return {
      schema_version: 1,
      action: decisionFromMode(mode),
      guard: "LaneScopeGuard",
      mode,
      target_path: target.path,
      lane_id: currentLane.id,
      reason: owner.status === "ambiguous"
        ? `path has ambiguous lane ownership: ${owner.candidates.map((candidate) => candidate.lane.id).join(", ")}`
        : `path is not assigned to any writable lane: ${target.path}`,
      recommendation: "Update the lane contract write_scopes or edit a path owned by the current lane.",
    };
  }

  if (owner.owner.lane.id !== currentLane.id) {
    return {
      schema_version: 1,
      action: decisionFromMode(mode),
      guard: "LaneScopeGuard",
      mode,
      target_path: target.path,
      lane_id: currentLane.id,
      owner_lane_id: owner.owner.lane.id,
      reason: `path belongs to lane ${owner.owner.lane.id}; current worktree is bound to ${currentLane.id}`,
      recommendation: "Switch worktrees or re-scope the lane contract before editing this file.",
    };
  }

  const forbidden = laneForbiddenScopes(currentLane, target.path);
  if (forbidden.length > 0) {
    return {
      schema_version: 1,
      action: decisionFromMode(mode),
      guard: "LaneScopeGuard",
      mode,
      target_path: target.path,
      lane_id: currentLane.id,
      owner_lane_id: owner.owner.lane.id,
      reason: `path is forbidden for lane ${currentLane.id}: ${forbidden.join(", ")}`,
      recommendation: "Move this change to an authorized coordinator lane or update forbidden_scopes deliberately.",
    };
  }

  if (options.highContext?.(target.path) && currentLane.allow_high_context !== true) {
    return {
      schema_version: 1,
      action: decisionFromMode(mode),
      guard: "LaneScopeGuard",
      mode,
      target_path: target.path,
      lane_id: currentLane.id,
      owner_lane_id: owner.owner.lane.id,
      reason: `high-context file requires allow_high_context for lane ${currentLane.id}`,
      recommendation: "Set allow_high_context on the lane or route this edit through a coordinator lane.",
    };
  }

  return {
    schema_version: 1,
    action: "allow",
    guard: "LaneScopeGuard",
    mode,
    target_path: target.path,
    lane_id: currentLane.id,
    owner_lane_id: owner.owner.lane.id,
  };
}

export function recordLaneEdit(
  targetPath: string,
  options: { cwd?: string; highContext?: (path: string) => boolean } = {},
): LaneRecordEditResult {
  const cwd = options.cwd ?? process.cwd();
  const context = loadActiveLaneContext(cwd);
  if (!context.contract || !context.active || !context.binding) {
    return { schema_version: 1, status: "skipped", reason: "no active bound lane" };
  }

  const target = ensureRepoRelativePath(targetPath);
  if (!target.ok || !target.path) {
    return { schema_version: 1, status: "skipped", reason: target.error ?? "invalid target path" };
  }

  const lane = context.contract.lanes.find((entry) => entry.id === context.binding?.lane_id);
  if (!lane) return { schema_version: 1, status: "skipped", reason: "bound lane missing" };

  const decision = decideLaneEdit(target.path, { cwd, mode: "enforce", highContext: options.highContext });
  const unauthorized = decision.action === "block";
  const runtime = context.runtime ?? initialRuntimeState(context.contract, context.active.contract_file);
  const current = runtime.lanes[lane.id] ?? {
    status: "active",
    touched_files: [],
    unauthorized_changes: [],
    evidence: {},
  };
  const touched = new Set(current.touched_files);
  touched.add(target.path);
  const unauthorizedChanges = new Set(current.unauthorized_changes);
  if (unauthorized) unauthorizedChanges.add(target.path);
  const nextRuntime: LaneRuntimeState = {
    ...runtime,
    updated_at: nowIso(),
    lanes: {
      ...runtime.lanes,
      [lane.id]: {
        ...current,
        status: current.status === "closed" ? "closed" : "active",
        touched_files: [...touched].sort(),
        unauthorized_changes: [...unauthorizedChanges].sort(),
        updated_at: nowIso(),
      },
    },
  };
  writeLaneRuntimeState(context.repoRoot, nextRuntime);
  return {
    schema_version: 1,
    status: "recorded",
    lane_id: lane.id,
    unauthorized,
  };
}

export function mergeLaneEvidence(
  laneId: string,
  evidence: Record<string, unknown>,
  options: { cwd?: string } = {},
): LaneEvidenceMergeResult {
  const cwd = options.cwd ?? process.cwd();
  const context = loadActiveLaneContext(cwd);
  if (!context.contract || !context.active) {
    return { schema_version: 1, status: "skipped", reason: "no active lane run" };
  }
  const lane = context.contract.lanes.find((entry) => entry.id === laneId);
  if (!lane) {
    return { schema_version: 1, status: "skipped", reason: `unknown lane id: ${laneId}` };
  }

  const runtime = context.runtime ?? initialRuntimeState(context.contract, context.active.contract_file);
  const current = runtime.lanes[laneId] ?? {
    status: "ready",
    touched_files: [],
    unauthorized_changes: [],
    evidence: {},
  };
  const nextEntry: LaneRuntimeEntry = {
    ...current,
    evidence: { ...current.evidence, ...evidence },
    updated_at: nowIso(),
  };
  const nextRuntime: LaneRuntimeState = {
    ...runtime,
    updated_at: nowIso(),
    lanes: {
      ...runtime.lanes,
      [laneId]: nextEntry,
    },
  };
  writeLaneRuntimeState(context.repoRoot, nextRuntime);
  return {
    schema_version: 1,
    status: "recorded",
    lane_id: laneId,
    missing: missingEvidence({ ...lane, required_evidence: effectiveRequiredEvidence(lane) }, nextEntry, cwd),
  };
}

export function laneEvidenceStatus(
  laneId: string,
  options: { cwd?: string } = {},
): LaneEvidenceMergeResult {
  const cwd = options.cwd ?? process.cwd();
  const context = loadActiveLaneContext(cwd);
  if (!context.contract || !context.active) {
    return { schema_version: 1, status: "skipped", reason: "no active lane run" };
  }
  const lane = context.contract.lanes.find((entry) => entry.id === laneId);
  if (!lane) {
    return { schema_version: 1, status: "skipped", reason: `unknown lane id: ${laneId}` };
  }
  const entry = context.runtime?.lanes[laneId];
  return {
    schema_version: 1,
    status: "recorded",
    lane_id: laneId,
    missing: missingEvidence({ ...lane, required_evidence: effectiveRequiredEvidence(lane) }, entry, cwd),
  };
}

function readStopSignatures(repoRoot: string): Set<string> {
  const raw = readJsonFile<{ signatures?: string[] }>(laneStatePaths(repoRoot).stopSignaturesFile);
  return new Set(Array.isArray(raw?.signatures) ? raw.signatures : []);
}

function writeStopSignatures(repoRoot: string, signatures: Set<string>): void {
  writeJsonAtomic(laneStatePaths(repoRoot).stopSignaturesFile, {
    schema_version: 1,
    updated_at: nowIso(),
    signatures: [...signatures].sort(),
  });
}

export function decideLaneStop(options: { cwd?: string; mode?: LaneGateMode } = {}): LaneStopDecision {
  const mode = options.mode ?? "advice";
  const cwd = options.cwd ?? process.cwd();
  if (mode === "off") return { schema_version: 1, action: "allow", guard: "LaneEvidenceGate", mode };
  const context = loadActiveLaneContext(cwd);
  if (!context.contract || !context.active || !context.binding) {
    return { schema_version: 1, action: "allow", guard: "LaneEvidenceGate", mode };
  }
  const lane = context.contract.lanes.find((entry) => entry.id === context.binding?.lane_id);
  if (!lane) return { schema_version: 1, action: "allow", guard: "LaneEvidenceGate", mode };
  const entry = context.runtime?.lanes[lane.id];
  if (entry?.status === "closed") {
    return { schema_version: 1, action: "allow", guard: "LaneEvidenceGate", mode, lane_id: lane.id };
  }
  const missing = missingEvidence(lane, entry, cwd);
  if (missing.length === 0) {
    return { schema_version: 1, action: "allow", guard: "LaneEvidenceGate", mode, lane_id: lane.id };
  }

  const signature = `${context.active.run_id}:${lane.id}:${missing.join(",")}:${(entry?.touched_files ?? []).join(",")}`;
  const signatures = readStopSignatures(context.repoRoot);
  if (signatures.has(signature)) {
    return { schema_version: 1, action: "allow", guard: "LaneEvidenceGate", mode, lane_id: lane.id };
  }
  signatures.add(signature);
  writeStopSignatures(context.repoRoot, signatures);
  return {
    schema_version: 1,
    action: decisionFromMode(mode),
    guard: "LaneEvidenceGate",
    mode,
    lane_id: lane.id,
    missing,
    reason: `Lane ${lane.id} is missing closure evidence: ${missing.join(", ")}. Run repo-harness lanes close ${lane.id} --evidence <file> or provide the missing evidence before finalizing.`,
  };
}

export function formatLaneStatus(report: LaneStatusReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  if (report.status === "inactive") return `Lane run: inactive\nRepo: ${report.repo_root}`;
  const lines = [
    `Lane run: ${report.status}`,
    `Run: ${report.active_run?.run_id ?? "(none)"}`,
    `Contract: ${report.active_run?.contract_file ?? "(none)"}`,
    `Current worktree: ${report.current_worktree}`,
    `Current lane: ${report.current_lane?.lane_id ?? "(unbound)"}`,
  ];
  const lanes = report.contract?.lanes ?? [];
  for (const lane of lanes) {
    const entry = report.runtime?.lanes[lane.id];
    lines.push(
      `- ${lane.id}: ${entry?.status ?? lane.status ?? "ready"} touched=${entry?.touched_files.length ?? 0} unauthorized=${entry?.unauthorized_changes.length ?? 0}`,
    );
  }
  return lines.join("\n");
}

export function formatLaneEditDecision(decision: LaneEditDecision): string {
  if (decision.action === "allow") return "";
  const prefix = decision.action === "block" ? "[LaneScopeGuard]" : "[LaneScopeGuard] Advisory";
  return `${prefix} ${decision.reason}\n  ${decision.recommendation ?? "Follow the active lane contract before editing."}`;
}

export function formatLaneStopDecision(decision: LaneStopDecision): string {
  return decision.reason ? `[LaneEvidenceGate] ${decision.reason}` : "";
}

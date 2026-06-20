import { ensureRepoRelativePath } from "../../effects/path-safety";

export type LaneRole = "coordinator" | "worker" | "reviewer" | "researcher" | "observer";
export type LaneStatus = "ready" | "blocked" | "active" | "closed";
export type LaneExecutionMode = "parallel" | "serial" | "serial_after_dependency";

export interface LaneLimits {
  readonly max_writable_lanes?: number;
  readonly max_reviewers_per_change?: number;
}

export interface LaneDefinition {
  readonly id: string;
  readonly role: LaneRole;
  readonly status?: LaneStatus;
  readonly depends_on?: readonly string[];
  readonly execution_mode?: LaneExecutionMode;
  readonly branch?: string;
  readonly worktree?: string;
  readonly write_scopes?: readonly string[];
  readonly forbidden_scopes?: readonly string[];
  readonly allow_high_context?: boolean;
  readonly verification_scope?: string;
  readonly required_evidence?: readonly string[];
}

export interface LaneContract {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly task_contract?: string;
  readonly mode?: string;
  readonly goal?: string;
  readonly base_ref?: string;
  readonly merge_policy?: string;
  readonly verification_owner?: string;
  readonly limits?: LaneLimits;
  readonly lanes: readonly LaneDefinition[];
}

export type LaneValidationSeverity = "error" | "warn";

export interface LaneValidationIssue {
  readonly code: string;
  readonly severity: LaneValidationSeverity;
  readonly path: string;
  readonly message: string;
}

export interface LaneValidationReport {
  readonly schema_version: 1;
  readonly status: "ok" | "warn" | "fail";
  readonly contract?: LaneContract;
  readonly issues: readonly LaneValidationIssue[];
}

const VALID_ROLES = new Set<LaneRole>(["coordinator", "worker", "reviewer", "researcher", "observer"]);
const VALID_STATUS = new Set<LaneStatus>(["ready", "blocked", "active", "closed"]);
const VALID_EXECUTION_MODES = new Set<LaneExecutionMode>(["parallel", "serial", "serial_after_dependency"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): readonly string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === "string") ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseLimits(value: unknown, issues: LaneValidationIssue[]): LaneLimits | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push({
      code: "invalid-limits",
      severity: "error",
      path: "limits",
      message: "limits must be an object when present",
    });
    return undefined;
  }

  const out: LaneLimits = {};
  for (const key of ["max_writable_lanes", "max_reviewers_per_change"] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (!Number.isInteger(raw) || (raw as number) < 0) {
      issues.push({
        code: "invalid-limit",
        severity: "error",
        path: `limits.${key}`,
        message: `${key} must be a non-negative integer`,
      });
      continue;
    }
    (out as Record<typeof key, number>)[key] = raw as number;
  }
  return out;
}

export function normalizeLaneScope(scope: string): { ok: true; scope: string } | { ok: false; error: string } {
  if (/[?*[\]{}]/.test(scope)) {
    return { ok: false, error: `glob scopes are not supported in lane contracts: ${scope}` };
  }
  const checked = ensureRepoRelativePath(scope.replace(/\/+$/, ""));
  if (!checked.ok || !checked.path) return { ok: false, error: checked.error ?? "invalid scope" };
  return { ok: true, scope: checked.path };
}

function parseLane(value: unknown, index: number, issues: LaneValidationIssue[]): LaneDefinition | null {
  const path = `lanes[${index}]`;
  if (!isRecord(value)) {
    issues.push({ code: "invalid-lane", severity: "error", path, message: "lane must be an object" });
    return null;
  }

  const id = value.id;
  if (typeof id !== "string" || id.trim() === "" || !SAFE_ID.test(id)) {
    issues.push({
      code: "invalid-lane-id",
      severity: "error",
      path: `${path}.id`,
      message: "lane id must be a non-empty safe identifier",
    });
  }

  const role = value.role;
  if (typeof role !== "string" || !VALID_ROLES.has(role as LaneRole)) {
    issues.push({
      code: "invalid-lane-role",
      severity: "error",
      path: `${path}.role`,
      message: `lane role must be one of ${[...VALID_ROLES].join(", ")}`,
    });
  }

  const status = value.status;
  if (status !== undefined && (typeof status !== "string" || !VALID_STATUS.has(status as LaneStatus))) {
    issues.push({
      code: "invalid-lane-status",
      severity: "error",
      path: `${path}.status`,
      message: `lane status must be one of ${[...VALID_STATUS].join(", ")}`,
    });
  }

  const executionMode = value.execution_mode;
  if (
    executionMode !== undefined &&
    (typeof executionMode !== "string" || !VALID_EXECUTION_MODES.has(executionMode as LaneExecutionMode))
  ) {
    issues.push({
      code: "invalid-execution-mode",
      severity: "error",
      path: `${path}.execution_mode`,
      message: `execution_mode must be one of ${[...VALID_EXECUTION_MODES].join(", ")}`,
    });
  }

  const dependsOn = stringArray(value.depends_on);
  const writeScopes = stringArray(value.write_scopes);
  const forbiddenScopes = stringArray(value.forbidden_scopes);
  const requiredEvidence = stringArray(value.required_evidence);
  for (const [field, parsed] of [
    ["depends_on", dependsOn],
    ["write_scopes", writeScopes],
    ["forbidden_scopes", forbiddenScopes],
    ["required_evidence", requiredEvidence],
  ] as const) {
    if (parsed === null) {
      issues.push({
        code: "invalid-string-array",
        severity: "error",
        path: `${path}.${field}`,
        message: `${field} must be an array of strings`,
      });
    }
  }

  for (const [field, scopes] of [
    ["write_scopes", writeScopes],
    ["forbidden_scopes", forbiddenScopes],
  ] as const) {
    if (!scopes) continue;
    scopes.forEach((scope, scopeIndex) => {
      const normalized = normalizeLaneScope(scope);
      if (!normalized.ok) {
        issues.push({
          code: "invalid-scope",
          severity: "error",
          path: `${path}.${field}[${scopeIndex}]`,
          message: normalized.error,
        });
      }
    });
  }

  return {
    id: typeof id === "string" ? id : "",
    role: typeof role === "string" && VALID_ROLES.has(role as LaneRole) ? role as LaneRole : "worker",
    status: typeof status === "string" && VALID_STATUS.has(status as LaneStatus) ? status as LaneStatus : undefined,
    depends_on: dependsOn ?? [],
    execution_mode:
      typeof executionMode === "string" && VALID_EXECUTION_MODES.has(executionMode as LaneExecutionMode)
        ? executionMode as LaneExecutionMode
        : undefined,
    branch: optionalString(value.branch),
    worktree: optionalString(value.worktree),
    write_scopes: writeScopes ?? [],
    forbidden_scopes: forbiddenScopes ?? [],
    allow_high_context: optionalBoolean(value.allow_high_context),
    verification_scope: optionalString(value.verification_scope),
    required_evidence: requiredEvidence ?? [],
  };
}

export function validateLaneContract(raw: unknown): LaneValidationReport {
  const issues: LaneValidationIssue[] = [];
  if (!isRecord(raw)) {
    return {
      schema_version: 1,
      status: "fail",
      issues: [{ code: "invalid-contract", severity: "error", path: "$", message: "lane contract must be an object" }],
    };
  }

  if (raw.schema_version !== 1) {
    issues.push({
      code: "invalid-schema-version",
      severity: "error",
      path: "schema_version",
      message: "lane contract schema_version must be 1",
    });
  }

  const runId = raw.run_id;
  if (typeof runId !== "string" || runId.trim() === "" || !SAFE_ID.test(runId)) {
    issues.push({
      code: "invalid-run-id",
      severity: "error",
      path: "run_id",
      message: "run_id must be a non-empty safe identifier",
    });
  }

  const rawLanes = raw.lanes;
  if (!Array.isArray(rawLanes) || rawLanes.length === 0) {
    issues.push({
      code: "invalid-lanes",
      severity: "error",
      path: "lanes",
      message: "lanes must be a non-empty array",
    });
  }

  const lanes = Array.isArray(rawLanes)
    ? rawLanes.map((lane, index) => parseLane(lane, index, issues)).filter((lane): lane is LaneDefinition => lane !== null)
    : [];

  const ids = new Map<string, number>();
  lanes.forEach((lane, index) => {
    if (!lane.id) return;
    const previous = ids.get(lane.id);
    if (previous !== undefined) {
      issues.push({
        code: "duplicate-lane-id",
        severity: "error",
        path: `lanes[${index}].id`,
        message: `lane id duplicates lanes[${previous}]: ${lane.id}`,
      });
    }
    ids.set(lane.id, index);
  });

  lanes.forEach((lane, index) => {
    for (const dep of lane.depends_on ?? []) {
      if (dep === lane.id) {
        issues.push({
          code: "self-dependency",
          severity: "error",
          path: `lanes[${index}].depends_on`,
          message: `lane ${lane.id} cannot depend on itself`,
        });
      } else if (!ids.has(dep)) {
        issues.push({
          code: "unknown-dependency",
          severity: "error",
          path: `lanes[${index}].depends_on`,
          message: `lane ${lane.id} depends on unknown lane ${dep}`,
        });
      }
    }
    if (lane.role === "reviewer" && (lane.write_scopes?.length ?? 0) > 0) {
      issues.push({
        code: "reviewer-write-scope",
        severity: "error",
        path: `lanes[${index}].write_scopes`,
        message: `reviewer lane ${lane.id} must be read-only`,
      });
    }
  });

  const limits = parseLimits(raw.limits, issues);
  const writableLanes = lanes.filter((lane) => (lane.write_scopes?.length ?? 0) > 0);
  if (limits?.max_writable_lanes !== undefined && writableLanes.length > limits.max_writable_lanes) {
    issues.push({
      code: "max-writable-lanes-exceeded",
      severity: "error",
      path: "limits.max_writable_lanes",
      message: `contract declares ${writableLanes.length} writable lanes but max_writable_lanes is ${limits.max_writable_lanes}`,
    });
  }

  const scopes = new Map<string, string>();
  for (const lane of writableLanes) {
    for (const rawScope of lane.write_scopes ?? []) {
      const normalized = normalizeLaneScope(rawScope);
      if (!normalized.ok) continue;
      const previousLane = scopes.get(normalized.scope);
      if (previousLane && previousLane !== lane.id) {
        issues.push({
          code: "duplicate-write-scope",
          severity: "error",
          path: `lanes.${lane.id}.write_scopes`,
          message: `write scope ${normalized.scope} is assigned to both ${previousLane} and ${lane.id}`,
        });
      }
      scopes.set(normalized.scope, lane.id);
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  const hasWarn = issues.some((issue) => issue.severity === "warn");
  const contract: LaneContract = {
    schema_version: 1,
    run_id: typeof runId === "string" ? runId : "",
    task_contract: optionalString(raw.task_contract),
    mode: optionalString(raw.mode),
    goal: optionalString(raw.goal),
    base_ref: optionalString(raw.base_ref),
    merge_policy: optionalString(raw.merge_policy),
    verification_owner: optionalString(raw.verification_owner),
    limits,
    lanes,
  };

  return {
    schema_version: 1,
    status: hasError ? "fail" : hasWarn ? "warn" : "ok",
    contract: hasError ? undefined : contract,
    issues,
  };
}

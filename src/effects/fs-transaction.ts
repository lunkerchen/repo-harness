import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import type {
  AdoptionOperation,
  AdoptionOperationStatus,
  AdoptionPlan,
  AppendManagedBlockOperation,
  MkdirOperation,
  WriteFileOperation,
} from "../core/adoption/operations";
import { resolveInsideRepo, resolveParentInsideRepo } from "./path-safety";
import { upsertManagedBlock } from "./managed-block";

export interface ApplyOperationResult {
  readonly id: string;
  readonly kind: AdoptionOperation["kind"];
  readonly path?: string;
  readonly status: AdoptionOperationStatus;
  readonly error?: string;
}

export interface ApplyAdoptionPlanResult {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly results: readonly ApplyOperationResult[];
}

function failure(operation: AdoptionOperation, error: string): ApplyOperationResult {
  return {
    id: operation.id,
    kind: operation.kind,
    path: operation.path,
    status: "failed",
    error,
  };
}

function ensureParent(repoRoot: string, path: string): string | null {
  const parent = resolveParentInsideRepo(repoRoot, path);
  if (!parent.ok || !parent.path) return parent.error ?? "failed to resolve parent directory";
  mkdirSync(parent.path, { recursive: true });
  return null;
}

export function applyMkdirOperation(repoRoot: string, operation: MkdirOperation, dryRun = false): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  mkdirSync(target.path, { recursive: true });
  return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied" };
}

export function applyWriteFileIfMissingOperation(
  repoRoot: string,
  operation: WriteFileOperation,
  dryRun = false,
): ApplyOperationResult {
  if (operation.ifMissing !== true) {
    return failure(operation, "writeFile applicator only supports ifMissing operations");
  }
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  if (existsSync(target.path)) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  const parentError = ensureParent(repoRoot, operation.path);
  if (parentError) return failure(operation, parentError);
  writeFileSync(target.path, operation.content, { mode: operation.mode });
  return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied" };
}

export function applyAppendManagedBlockOperation(
  repoRoot: string,
  operation: AppendManagedBlockOperation,
  dryRun = false,
): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  const existing = existsSync(target.path) ? readFileSync(target.path, "utf-8") : "";
  const update = upsertManagedBlock(existing, operation);
  if (!update.ok) return failure(operation, update.error ?? "failed to update managed block");
  if (!update.changed) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  const parentError = ensureParent(repoRoot, operation.path);
  if (parentError) return failure(operation, parentError);
  writeFileSync(target.path, update.content ?? "");
  return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied" };
}

export function applyAdoptionPlan(plan: AdoptionPlan, dryRun = false): ApplyAdoptionPlanResult {
  const results = plan.operations.map((operation) => {
    switch (operation.kind) {
      case "mkdir":
        return applyMkdirOperation(plan.repoRoot, operation, dryRun);
      case "writeFile":
        return applyWriteFileIfMissingOperation(plan.repoRoot, operation, dryRun);
      case "appendManagedBlock":
        return applyAppendManagedBlockOperation(plan.repoRoot, operation, dryRun);
      default:
        return failure(operation, `unsupported operation kind: ${operation.kind}`);
    }
  });

  return {
    ok: results.every((result) => result.status !== "failed"),
    dryRun,
    results,
  };
}

import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "fs";
import { basename, dirname, resolve } from "path";
import type {
  AdoptionOperation,
  AdoptionOperationStatus,
  AdoptionPlan,
  AppendManagedBlockOperation,
  MkdirOperation,
  WriteFileOperation,
} from "../core/adoption/operations";
import { isWorkflowContractInstallOperation } from "../core/adoption/workflow-contract-plan";
import { resolveInsideRepo, resolveParentInsideRepo } from "./path-safety";
import { upsertManagedBlock } from "./managed-block";

const BACKUP_ROOT = ".ai/harness/backups/fs-transaction";
const LOCK_SUFFIX = ".repo-harness.lock";
let atomicWriteSequence = 0;

export interface ApplyOperationResult {
  readonly id: string;
  readonly kind: AdoptionOperation["kind"];
  readonly path?: string;
  readonly status: AdoptionOperationStatus;
  readonly backupPath?: string;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fsyncDirectory(path: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_RDONLY);
    fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!["EINVAL", "EPERM", "ENOTSUP", "EISDIR"].includes(code ?? "")) throw error;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function writeFileDurably(path: string, content: string, mode?: number): void {
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, mode);
    const data = Buffer.from(content);
    let offset = 0;
    while (offset < data.length) {
      offset += writeSync(fd, data, offset, data.length - offset);
    }
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function sanitizeBackupStem(path: string): string {
  return path.replace(/[^a-zA-Z0-9._-]+/g, "__").replace(/^_+|_+$/g, "") || "file";
}

function backupPathFor(path: string): string {
  atomicWriteSequence += 1;
  return `${BACKUP_ROOT}/${sanitizeBackupStem(path)}.${Date.now()}-${process.pid}-${atomicWriteSequence}.bak`;
}

function withTargetLock<T>(targetPath: string, fn: () => T): T {
  const lockPath = `${targetPath}${LOCK_SUFFIX}`;
  let fd: number | null = null;
  let locked = false;
  try {
    fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    locked = true;
    writeSync(fd, `${process.pid}\n`);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    return fn();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") throw new Error(`target is locked: ${lockPath}`);
    throw error;
  } finally {
    if (fd !== null) closeSync(fd);
    if (locked) {
      rmSync(lockPath, { force: true });
      fsyncDirectory(dirname(targetPath));
    }
  }
}

export interface AtomicWriteResult {
  readonly backupPath?: string;
}

export function atomicWriteFile(
  repoRoot: string,
  path: string,
  content: string,
  opts: { readonly mode?: number } = {},
): AtomicWriteResult {
  const target = resolveInsideRepo(repoRoot, path);
  if (!target.ok || !target.path) throw new Error(target.error ?? "invalid path");
  const parentError = ensureParent(repoRoot, path);
  if (parentError) throw new Error(parentError);

  return withTargetLock(target.path, () => {
    let backupPath: string | undefined;
    if (existsSync(target.path)) {
      backupPath = backupPathFor(path);
      const backup = resolveInsideRepo(repoRoot, backupPath);
      if (!backup.ok || !backup.path) throw new Error(backup.error ?? "invalid backup path");
      const backupParentError = ensureParent(repoRoot, backupPath);
      if (backupParentError) throw new Error(backupParentError);
      writeFileDurably(backup.path, readFileSync(target.path, "utf-8"));
      fsyncDirectory(dirname(backup.path));
    }

    const tempPath = resolve(dirname(target.path), `.${basename(target.path)}.${process.pid}.${Date.now()}.tmp`);
    try {
      writeFileDurably(tempPath, content, opts.mode);
      renameSync(tempPath, target.path);
      fsyncDirectory(dirname(target.path));
    } finally {
      rmSync(tempPath, { force: true });
    }

    return { backupPath };
  });
}

export function applyMkdirOperation(repoRoot: string, operation: MkdirOperation, dryRun = false): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  mkdirSync(target.path, { recursive: true });
  return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied" };
}

export function applyWriteFileOperation(
  repoRoot: string,
  operation: WriteFileOperation,
  dryRun = false,
): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  if (operation.ifMissing === true && existsSync(target.path)) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (operation.ifMissing !== true && !isWorkflowContractInstallOperation(operation)) {
    return failure(operation, "writeFile applicator only supports ifMissing operations and workflow-contract install");
  }
  if (operation.ifMissing !== true && existsSync(target.path) && readFileSync(target.path, "utf-8") === operation.content) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  try {
    const write = atomicWriteFile(repoRoot, operation.path, operation.content, { mode: operation.mode });
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied", backupPath: write.backupPath };
  } catch (error) {
    return failure(operation, errorMessage(error));
  }
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
  try {
    const write = atomicWriteFile(repoRoot, operation.path, update.content ?? "");
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied", backupPath: write.backupPath };
  } catch (error) {
    return failure(operation, errorMessage(error));
  }
}

export function applyAdoptionPlan(plan: AdoptionPlan, dryRun = false): ApplyAdoptionPlanResult {
  const results = plan.operations.map((operation) => {
    switch (operation.kind) {
      case "mkdir":
        return applyMkdirOperation(plan.repoRoot, operation, dryRun);
      case "writeFile":
        return applyWriteFileOperation(plan.repoRoot, operation, dryRun);
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

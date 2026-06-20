import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fingerprintFiles } from "./fingerprint";

export type ContextAuditStatus = "ok" | "warn" | "fail";
export type ContextAuditSeverity = "warn" | "fail";

export interface ContextAuditFinding {
  readonly rule_id: string;
  readonly severity: ContextAuditSeverity;
  readonly file_path: string;
  readonly summary: string;
  readonly recommendation: string;
}

export interface ContextAuditReport {
  readonly schema_version: 1;
  readonly generated_at: string;
  readonly repo_root: string;
  readonly repo_identity: string;
  readonly worktree_identity: string;
  readonly head_sha?: string;
  readonly mode: "static" | "changed";
  readonly status: ContextAuditStatus;
  readonly score: number;
  readonly findings: readonly ContextAuditFinding[];
  readonly files_scanned: readonly Array<{ path: string; kind: string; exists: boolean; bytes?: number }>;
  readonly fingerprint: {
    readonly algorithm: "sha256";
    readonly value: string;
  };
}

export interface ContextDirtyTrigger {
  readonly path: string;
  readonly reason: string;
}

export interface ContextDirtyState {
  readonly schema_version: 1;
  readonly status: "clean" | "dirty";
  readonly updated_at: string;
  readonly audit_head_sha?: string;
  readonly triggers: readonly ContextDirtyTrigger[];
}

export interface ContextStatusReport {
  readonly schema_version: 1;
  readonly generated_at: string;
  readonly repo_root: string;
  readonly head_sha?: string;
  readonly status: "unknown" | "clean" | "stale" | "warn" | "fail";
  readonly latest_file: string;
  readonly dirty_file: string;
  readonly latest_audit?: {
    readonly exists: boolean;
    readonly status?: ContextAuditStatus;
    readonly head_sha?: string;
    readonly fingerprint?: string;
    readonly generated_at?: string;
  };
  readonly cache: {
    readonly state: "hit" | "miss" | "stale" | "invalid";
    readonly reason: string;
    readonly latest_fingerprint?: string;
    readonly current_fingerprint?: string;
  };
  readonly dirty?: {
    readonly exists: boolean;
    readonly status?: "clean" | "dirty";
    readonly triggers: readonly ContextDirtyTrigger[];
  };
}

export const DEFAULT_CONTEXT_LATEST_FILE = ".ai/harness/context-health/latest.json";
export const DEFAULT_CONTEXT_DIRTY_FILE = ".ai/harness/context-health/dirty.json";

export function resolveRepoRoot(cwd: string = process.cwd()): string {
  try {
    const out = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() || resolve(cwd);
  } catch {
    return resolve(cwd);
  }
}

export function currentHead(repoRoot: string): string | undefined {
  try {
    const out = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function stablePathIdentity(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function readJsonFile<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(tmp, file);
}

export function contextStatePaths(repoRoot: string): { latestFile: string; dirtyFile: string } {
  return {
    latestFile: join(repoRoot, DEFAULT_CONTEXT_LATEST_FILE),
    dirtyFile: join(repoRoot, DEFAULT_CONTEXT_DIRTY_FILE),
  };
}

export function writeContextAuditState(report: ContextAuditReport): void {
  const { latestFile, dirtyFile } = contextStatePaths(report.repo_root);
  writeJsonAtomic(latestFile, report);
  const dirty: ContextDirtyState = {
    schema_version: 1,
    status: "clean",
    updated_at: report.generated_at,
    audit_head_sha: report.head_sha,
    triggers: [],
  };
  writeJsonAtomic(dirtyFile, dirty);
}

export function runContextStatus(cwd: string = process.cwd()): ContextStatusReport {
  const repoRoot = resolveRepoRoot(cwd);
  const { latestFile, dirtyFile } = contextStatePaths(repoRoot);
  const latest = readJsonFile<ContextAuditReport>(latestFile);
  const dirty = readJsonFile<ContextDirtyState>(dirtyFile);
  const head = currentHead(repoRoot);
  const repoIdentity = stablePathIdentity(repoRoot);
  let cache: ContextStatusReport["cache"] = { state: "miss", reason: "latest audit cache is missing" };

  let status: ContextStatusReport["status"] = "unknown";
  if (latest) {
    if (
      latest.schema_version !== 1 ||
      latest.repo_root !== repoRoot ||
      latest.repo_identity !== repoIdentity ||
      !Array.isArray(latest.files_scanned) ||
      !latest.fingerprint?.value
    ) {
      cache = { state: "invalid", reason: "latest audit cache does not match this repo or schema" };
    } else {
      const currentFingerprint = fingerprintFiles(repoRoot, latest.files_scanned.map((file) => file.path));
      if (currentFingerprint.value !== latest.fingerprint.value) {
        cache = {
          state: "stale",
          reason: "context file fingerprint changed since latest audit",
          latest_fingerprint: latest.fingerprint.value,
          current_fingerprint: currentFingerprint.value,
        };
      } else {
        cache = {
          state: "hit",
          reason: "latest audit cache matches repo identity and context fingerprint",
          latest_fingerprint: latest.fingerprint.value,
          current_fingerprint: currentFingerprint.value,
        };
        if (latest.status === "fail") status = "fail";
        else if (latest.status === "warn") status = "warn";
        else status = "clean";
      }
    }
  }
  if (latest && head && latest.head_sha && latest.head_sha !== head) status = "stale";
  if (cache.state === "stale" || cache.state === "invalid") status = "stale";
  if (dirty?.status === "dirty" && dirty.triggers.length > 0) status = "stale";

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    head_sha: head,
    status,
    latest_file: DEFAULT_CONTEXT_LATEST_FILE,
    dirty_file: DEFAULT_CONTEXT_DIRTY_FILE,
    latest_audit: {
      exists: Boolean(latest),
      status: latest?.status,
      head_sha: latest?.head_sha,
      fingerprint: latest?.fingerprint?.value,
      generated_at: latest?.generated_at,
    },
    cache,
    dirty: {
      exists: Boolean(dirty),
      status: dirty?.status,
      triggers: dirty?.triggers ?? [],
    },
  };
}

export function formatContextStatus(report: ContextStatusReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines = [
    `Context health: ${report.status}`,
    `Repo: ${report.repo_root}`,
    `Latest audit: ${report.latest_audit?.exists ? report.latest_audit.status ?? "unknown" : "missing"}`,
    `Dirty state: ${report.dirty?.exists ? report.dirty.status ?? "unknown" : "missing"}`,
  ];
  if ((report.dirty?.triggers.length ?? 0) > 0) {
    for (const trigger of report.dirty?.triggers ?? []) lines.push(`  - ${trigger.path}: ${trigger.reason}`);
  }
  return lines.join("\n");
}

export function formatContextAudit(report: ContextAuditReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines = [
    `Context audit: ${report.status}`,
    `Score: ${report.score}`,
    `Files scanned: ${report.files_scanned.filter((file) => file.exists).length}`,
  ];
  for (const finding of report.findings) {
    lines.push(`- [${finding.severity}] ${finding.rule_id} ${finding.file_path}: ${finding.summary}`);
  }
  return lines.join("\n");
}

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { ensureRepoRelativePath } from "../../effects/path-safety";
import { contextFileForPath, discoverContextFiles, type ContextFile } from "./discover";
import { fingerprintFiles } from "./fingerprint";
import {
  currentHead,
  type ContextAuditFinding,
  type ContextAuditReport,
  resolveRepoRoot,
  stablePathIdentity,
  writeContextAuditState,
} from "./report";

interface ContextMap {
  root_context_files?: unknown;
  discoverable_contexts?: unknown;
}

interface CapabilityRegistry {
  capabilities?: unknown;
}

interface CapabilityEntry {
  id?: unknown;
  prefixes?: unknown;
  contract_files?: unknown;
  architecture_module?: unknown;
}

export interface RunContextAuditOptions {
  readonly cwd?: string;
  readonly mode?: "static" | "changed";
  readonly writeState?: boolean;
}

function readJson(repoRoot: string, relativePath: string, findings: ContextAuditFinding[]): unknown | undefined {
  const file = join(repoRoot, relativePath);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch (error) {
    findings.push({
      rule_id: "invalid_json",
      severity: "fail",
      file_path: relativePath,
      summary: `Could not parse JSON: ${(error as Error).message}`,
      recommendation: "Fix JSON syntax before relying on context routing from this file.",
    });
    return undefined;
  }
}

function globBase(pattern: string): string {
  const parts = pattern.split("/");
  const fixed: string[] = [];
  for (const part of parts) {
    if (part.includes("*")) break;
    fixed.push(part);
  }
  return fixed.length === 0 ? "." : fixed.join("/");
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length;) {
    if (pattern.startsWith("**/", index)) {
      source += "(?:[^/]+/)*";
      index += 3;
      continue;
    }
    if (pattern.startsWith("**", index)) {
      source += ".*";
      index += 2;
      continue;
    }
    const char = pattern[index];
    if (char === "*") source += "[^/]*";
    else source += escapeRegex(char);
    index += 1;
  }
  source += "$";
  return new RegExp(source);
}

function walkFiles(repoRoot: string, relativeDir: string, limit = 5000): string[] {
  const fullDir = join(repoRoot, relativeDir);
  if (!existsSync(fullDir)) return [];
  const out: string[] = [];
  const visit = (dir: string): void => {
    if (out.length >= limit) return;
    for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const relativePath = dir === "." ? entry.name : `${dir}/${entry.name}`;
      const stat = statSync(join(repoRoot, relativePath));
      if (stat.isDirectory()) visit(relativePath);
      else if (stat.isFile()) out.push(relativePath);
      if (out.length >= limit) return;
    }
  };
  visit(relativeDir);
  return out;
}

function globExists(repoRoot: string, pattern: string): boolean {
  if (pattern.includes("\0") || pattern.startsWith("/") || pattern.split("/").includes("..")) return false;
  const base = globBase(pattern);
  if (base !== ".") {
    const baseCheck = ensureRepoRelativePath(base);
    if (!baseCheck.ok) return false;
  }
  const regex = globToRegex(pattern);
  return walkFiles(repoRoot, base === "." ? "." : dirname(`${base}/placeholder`)).some((path) => regex.test(path));
}

function pathExists(repoRoot: string, relativePath: string): boolean {
  if (relativePath.includes("*")) return globExists(repoRoot, relativePath);
  const checked = ensureRepoRelativePath(relativePath);
  return Boolean(checked.ok && checked.path && existsSync(join(repoRoot, checked.path)));
}

function pushBrokenReference(
  findings: ContextAuditFinding[],
  filePath: string,
  referencedPath: string,
  field: string,
): void {
  findings.push({
    rule_id: "broken_reference",
    severity: "fail",
    file_path: filePath,
    summary: `${field} references missing path ${referencedPath}`,
    recommendation: "Update the reference or create the referenced repo-local file.",
  });
}

function checkContextMap(repoRoot: string, parsed: ContextMap | undefined, findings: ContextAuditFinding[]): void {
  if (!parsed) return;
  const rootFiles = Array.isArray(parsed.root_context_files) ? parsed.root_context_files : [];
  rootFiles.forEach((entry, index) => {
    if (typeof entry !== "string") return;
    if (!pathExists(repoRoot, entry)) pushBrokenReference(findings, ".ai/context/context-map.json", entry, `root_context_files[${index}]`);
  });

  const discoverable = Array.isArray(parsed.discoverable_contexts) ? parsed.discoverable_contexts : [];
  discoverable.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const path = (entry as { path?: unknown }).path;
    if (typeof path !== "string") return;
    if (!pathExists(repoRoot, path)) {
      pushBrokenReference(findings, ".ai/context/context-map.json", path, `discoverable_contexts[${index}].path`);
    }
  });
}

function checkCapabilities(repoRoot: string, parsed: CapabilityRegistry | undefined, findings: ContextAuditFinding[]): void {
  if (!parsed || !Array.isArray(parsed.capabilities)) return;
  const prefixOwners = new Map<string, string>();
  parsed.capabilities.forEach((raw, index) => {
    const capability = raw as CapabilityEntry;
    const id = typeof capability.id === "string" ? capability.id : `capability[${index}]`;
    const prefixes = Array.isArray(capability.prefixes) ? capability.prefixes : [];
    for (const prefix of prefixes) {
      if (typeof prefix !== "string") continue;
      const normalized = ensureRepoRelativePath(prefix);
      if (!normalized.ok || !normalized.path) {
        findings.push({
          rule_id: "invalid_scope",
          severity: "fail",
          file_path: ".ai/context/capabilities.json",
          summary: `${id} declares invalid prefix ${prefix}`,
          recommendation: "Use repo-relative capability prefixes without glob syntax or path traversal.",
        });
        continue;
      }
      const previous = prefixOwners.get(normalized.path);
      if (previous && previous !== id) {
        findings.push({
          rule_id: "equal_scope_conflict",
          severity: "fail",
          file_path: ".ai/context/capabilities.json",
          summary: `prefix ${normalized.path} is owned by both ${previous} and ${id}`,
          recommendation: "Split the scope or make one capability prefix more specific.",
        });
      }
      prefixOwners.set(normalized.path, id);
    }

    if (capability.contract_files && typeof capability.contract_files === "object" && !Array.isArray(capability.contract_files)) {
      for (const [field, value] of Object.entries(capability.contract_files)) {
        if (typeof value === "string" && !pathExists(repoRoot, value)) {
          pushBrokenReference(findings, ".ai/context/capabilities.json", value, `${id}.contract_files.${field}`);
        }
      }
    }

    if (typeof capability.architecture_module === "string" && !pathExists(repoRoot, capability.architecture_module)) {
      pushBrokenReference(findings, ".ai/context/capabilities.json", capability.architecture_module, `${id}.architecture_module`);
    }
  });
}

function checkOverloadedRouters(files: readonly ContextFile[], findings: ContextAuditFinding[]): void {
  for (const file of files) {
    if (!file.exists || file.kind !== "agent-router" || file.bytes === undefined) continue;
    if (file.bytes > 24_000) {
      findings.push({
        rule_id: "agent_router_overloaded",
        severity: "warn",
        file_path: file.path,
        summary: `agent router is ${file.bytes} bytes`,
        recommendation: "Move detailed guidance into referenced docs or capability-local agent files.",
      });
    }
  }
}

function literalContextReferences(parsed: ContextMap | undefined): readonly string[] {
  if (!parsed) return [];
  const paths = new Set<string>();
  const addPath = (value: unknown): void => {
    if (typeof value === "string" && !value.includes("*")) paths.add(value);
  };
  if (Array.isArray(parsed.root_context_files)) parsed.root_context_files.forEach(addPath);
  if (Array.isArray(parsed.discoverable_contexts)) {
    parsed.discoverable_contexts.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      addPath((entry as { path?: unknown }).path);
    });
  }
  return [...paths].sort();
}

function mergeScannedFiles(repoRoot: string, discovered: readonly ContextFile[], contextMap: ContextMap | undefined): readonly ContextFile[] {
  const byPath = new Map(discovered.map((file) => [file.path, file]));
  for (const path of literalContextReferences(contextMap)) {
    if (!byPath.has(path)) byPath.set(path, contextFileForPath(repoRoot, path));
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function runContextAudit(opts: RunContextAuditOptions = {}): ContextAuditReport {
  const repoRoot = resolveRepoRoot(opts.cwd ?? process.cwd());
  const findings: ContextAuditFinding[] = [];
  const discoveredFiles = discoverContextFiles(repoRoot);
  const contextMap = readJson(repoRoot, ".ai/context/context-map.json", findings) as ContextMap | undefined;
  const capabilities = readJson(repoRoot, ".ai/context/capabilities.json", findings) as CapabilityRegistry | undefined;
  const files = mergeScannedFiles(repoRoot, discoveredFiles, contextMap);
  readJson(repoRoot, ".ai/harness/policy.json", findings);
  readJson(repoRoot, "package.json", findings);

  checkContextMap(repoRoot, contextMap, findings);
  checkCapabilities(repoRoot, capabilities, findings);
  checkOverloadedRouters(files, findings);

  const fingerprint = fingerprintFiles(repoRoot, files.map((file) => file.path));
  const status = findings.some((finding) => finding.severity === "fail")
    ? "fail"
    : findings.some((finding) => finding.severity === "warn")
      ? "warn"
      : "ok";
  const score = Math.max(0, 100 - findings.reduce((sum, finding) => sum + (finding.severity === "fail" ? 20 : 5), 0));
  const report: ContextAuditReport = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    repo_identity: stablePathIdentity(repoRoot),
    worktree_identity: stablePathIdentity(repoRoot),
    head_sha: currentHead(repoRoot),
    mode: opts.mode ?? "static",
    status,
    score,
    findings,
    files_scanned: files,
    fingerprint: {
      algorithm: fingerprint.algorithm,
      value: fingerprint.value,
    },
  };
  if (opts.writeState) writeContextAuditState(report);
  return report;
}

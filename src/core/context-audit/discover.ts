import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export type ContextFileKind =
  | "agent-router"
  | "agent-skill"
  | "context-map"
  | "policy"
  | "hook-runtime"
  | "ci-workflow"
  | "command-source"
  | "reference-config"
  | "spec"
  | "workstream"
  | "unknown";

export interface ContextFile {
  readonly path: string;
  readonly kind: ContextFileKind;
  readonly exists: boolean;
  readonly bytes?: number;
}

const STATIC_CONTEXT_FILES: readonly Array<{ path: string; kind: ContextFileKind }> = [
  { path: "AGENTS.md", kind: "agent-router" },
  { path: "CLAUDE.md", kind: "agent-router" },
  { path: "WARP.md", kind: "agent-router" },
  { path: "CONTRIBUTING.md", kind: "agent-router" },
  { path: ".github/copilot-instructions.md", kind: "agent-router" },
  { path: ".ai/context/context-map.json", kind: "context-map" },
  { path: ".ai/context/capabilities.json", kind: "context-map" },
  { path: ".ai/harness/policy.json", kind: "policy" },
  { path: ".ai/harness/workflow-contract.json", kind: "policy" },
  { path: "assets/workflow-contract.v1.json", kind: "policy" },
  { path: "package.json", kind: "command-source" },
  { path: "bun.lock", kind: "command-source" },
  { path: "bun.lockb", kind: "command-source" },
  { path: "Makefile", kind: "command-source" },
  { path: "pyproject.toml", kind: "command-source" },
  { path: "Cargo.toml", kind: "command-source" },
  { path: "go.mod", kind: "command-source" },
  { path: "docs/spec.md", kind: "spec" },
];

export function contextFileForPath(repoRoot: string, path: string, kind: ContextFileKind = "unknown"): ContextFile {
  const full = join(repoRoot, path);
  if (!existsSync(full)) return { path, kind, exists: false };
  const stat = statSync(full);
  return { path, kind, exists: true, bytes: stat.size };
}

function walk(repoRoot: string, dir: string, predicate: (path: string) => boolean, limit = 500): string[] {
  const start = join(repoRoot, dir);
  if (!existsSync(start)) return [];
  const out: string[] = [];
  const visit = (relativeDir: string): void => {
    if (out.length >= limit) return;
    const entries = readdirSync(join(repoRoot, relativeDir), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const relativePath = `${relativeDir}/${entry.name}`.replace(/^\/+/, "");
      if (entry.isDirectory()) {
        visit(relativePath);
      } else if (entry.isFile() && predicate(relativePath)) {
        out.push(relativePath);
      }
      if (out.length >= limit) return;
    }
  };
  visit(dir);
  return out;
}

export function discoverContextFiles(repoRoot: string): readonly ContextFile[] {
  const byPath = new Map<string, ContextFile>();
  for (const entry of STATIC_CONTEXT_FILES) byPath.set(entry.path, contextFileForPath(repoRoot, entry.path, entry.kind));

  for (const path of walk(repoRoot, ".agents/skills", (candidate) => candidate.endsWith("/SKILL.md"))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "agent-skill"));
  }
  for (const path of walk(repoRoot, ".codex/skills", (candidate) => candidate.endsWith("/SKILL.md"))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "agent-skill"));
  }
  for (const path of walk(repoRoot, ".ai/hooks", (candidate) => candidate.endsWith(".sh") || candidate.endsWith(".json"))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "hook-runtime"));
  }
  for (const path of walk(repoRoot, "assets/hooks", (candidate) => candidate.endsWith(".sh") || candidate.endsWith(".json"))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "hook-runtime"));
  }
  for (const path of walk(repoRoot, ".github/workflows", (candidate) => candidate.endsWith(".yml") || candidate.endsWith(".yaml"))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "ci-workflow"));
  }
  for (const path of walk(repoRoot, "docs/reference-configs", (candidate) => candidate.endsWith(".md"))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "reference-config"));
  }
  for (const path of walk(repoRoot, "specs", (candidate) => /\/(PRODUCT|TECH)\.md$/.test(candidate))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "spec"));
  }
  for (const path of walk(repoRoot, "tasks/workstreams", (candidate) => candidate.endsWith(".md"))) {
    byPath.set(path, contextFileForPath(repoRoot, path, "workstream"));
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

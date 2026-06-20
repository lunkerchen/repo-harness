import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runContextAudit } from "../../src/core/context-audit/static-checks";
import { runContextStatus } from "../../src/core/context-audit/report";

function withRepo(fn: (repo: string) => void): void {
  const repo = mkdtempSync(join(tmpdir(), "repo-harness-context-audit-"));
  try {
    mkdirSync(join(repo, ".ai/context"), { recursive: true });
    mkdirSync(join(repo, ".ai/harness"), { recursive: true });
    mkdirSync(join(repo, "docs/architecture/modules/root"), { recursive: true });
    mkdirSync(join(repo, "docs/reference-configs"), { recursive: true });
    mkdirSync(join(repo, "tasks/workstreams/runtime/hook"), { recursive: true });
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "AGENTS.md"), "# Agents\n");
    writeFileSync(join(repo, "CLAUDE.md"), "# Claude\n");
    writeFileSync(join(repo, "docs/spec.md"), "# Spec\n");
    writeFileSync(join(repo, "docs/architecture/modules/root/router.md"), "# Router\n");
    writeFileSync(join(repo, "docs/reference-configs/hook-operations.md"), "# Hook Ops\n");
    writeFileSync(join(repo, "tasks/workstreams/runtime/hook/status.md"), "# Status\n");
    writeFileSync(join(repo, "package.json"), JSON.stringify({ scripts: { test: "bun test" } }, null, 2));
    writeFileSync(join(repo, ".ai/harness/policy.json"), JSON.stringify({ version: 1 }, null, 2));
    writeFileSync(
      join(repo, ".ai/context/context-map.json"),
      JSON.stringify({
        version: 1,
        root_context_files: ["AGENTS.md", "CLAUDE.md", "docs/spec.md"],
        discoverable_contexts: [
          { path: "AGENTS.md" },
          { path: "docs/reference-configs/*.md" },
          { path: "tasks/workstreams/**/*.md" },
        ],
      }, null, 2),
    );
    writeFileSync(
      join(repo, ".ai/context/capabilities.json"),
      JSON.stringify({
        version: 1,
        capabilities: [
          {
            id: "root-router",
            prefixes: ["AGENTS.md"],
            contract_files: { agents: "AGENTS.md", claude: "CLAUDE.md" },
            architecture_module: "docs/architecture/modules/root/router.md",
          },
        ],
      }, null, 2),
    );
    fn(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe("context audit static checks", () => {
  test("reports ok and writes state for a minimal routed repo", () => {
    withRepo((repo) => {
      const report = runContextAudit({ cwd: repo, writeState: true });
      expect(report.status).toBe("ok");
      expect(report.files_scanned.some((file) => file.path === "AGENTS.md" && file.exists)).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/context-health/latest.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/context-health/dirty.json"))).toBe(true);

      const latest = JSON.parse(readFileSync(join(repo, ".ai/harness/context-health/latest.json"), "utf-8"));
      expect(latest.fingerprint.value).toBe(report.fingerprint.value);
      const status = runContextStatus(repo);
      expect(status.status).toBe("clean");
      expect(status.cache.state).toBe("hit");
    });
  });

  test("marks cached status stale when audited files change under the same HEAD", () => {
    withRepo((repo) => {
      runContextAudit({ cwd: repo, writeState: true });
      writeFileSync(join(repo, "AGENTS.md"), "# Agents\n\nchanged under same head\n");

      const status = runContextStatus(repo);
      expect(status.status).toBe("stale");
      expect(status.cache.state).toBe("stale");
      expect(status.cache.reason).toContain("fingerprint");
    });
  });

  test("does not treat corrupt cache JSON as clean", () => {
    withRepo((repo) => {
      runContextAudit({ cwd: repo, writeState: true });
      writeFileSync(join(repo, ".ai/harness/context-health/latest.json"), "{");

      const status = runContextStatus(repo);
      expect(status.status).toBe("unknown");
      expect(status.cache.state).toBe("miss");
    });
  });

  test("fails on broken context-map references", () => {
    withRepo((repo) => {
      writeFileSync(
        join(repo, ".ai/context/context-map.json"),
        JSON.stringify({ version: 1, root_context_files: ["missing.md"], discoverable_contexts: [] }, null, 2),
      );

      const report = runContextAudit({ cwd: repo });
      expect(report.status).toBe("fail");
      expect(report.findings.map((finding) => finding.rule_id)).toContain("broken_reference");
    });
  });

  test("fails on duplicate equal capability prefixes", () => {
    withRepo((repo) => {
      writeFileSync(
        join(repo, ".ai/context/capabilities.json"),
        JSON.stringify({
          version: 1,
          capabilities: [
            { id: "a", prefixes: ["src"] },
            { id: "b", prefixes: ["src"] },
          ],
        }, null, 2),
      );

      const report = runContextAudit({ cwd: repo });
      expect(report.status).toBe("fail");
      expect(report.findings.map((finding) => finding.rule_id)).toContain("equal_scope_conflict");
    });
  });
});

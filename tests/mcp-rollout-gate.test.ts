import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildMcpRolloutGateReport } from "../scripts/mcp-rollout-gate";

function withRolloutRepo<T>(fn: (repoRoot: string) => Promise<T>): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), "repo-harness-mcp-rollout-gate-"));
  const repoHarnessHome = mkdtempSync(join(tmpdir(), "repo-harness-mcp-rollout-home-"));
  const previousHome = process.env.REPO_HARNESS_HOME;
  return (async () => {
    try {
      process.env.REPO_HARNESS_HOME = repoHarnessHome;
      mkdirSync(join(repoRoot, ".ai", "harness", "handoff"), { recursive: true });
      mkdirSync(join(repoRoot, ".ai", "harness", "checks"), { recursive: true });
      mkdirSync(join(repoRoot, "plans", "prds"), { recursive: true });
      mkdirSync(join(repoRoot, "plans", "sprints"), { recursive: true });
      mkdirSync(join(repoRoot, "tasks"), { recursive: true });
      writeFileSync(join(repoRoot, ".ai", "harness", "policy.json"), "{}\n");
      writeFileSync(join(repoRoot, "AGENTS.md"), "repo-harness rollout instructions\n");
      writeFileSync(join(repoRoot, "tasks", "current.md"), "status=Active\nrepo-harness\n");
      writeFileSync(join(repoRoot, "plans", "prds", "example.prd.md"), "# PRD\nrepo-harness\n");
      writeFileSync(join(repoRoot, "plans", "sprints", "example.sprint.md"), "# Sprint\nrepo-harness\n");
      return await fn(repoRoot);
    } finally {
      if (previousHome === undefined) delete process.env.REPO_HARNESS_HOME;
      else process.env.REPO_HARNESS_HOME = previousHome;
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(repoHarnessHome, { recursive: true, force: true });
    }
  })();
}

describe("mcp rollout gate", () => {
  test("builds a passing shadow, canary, rollback, and CodeGraph-ignore audit report", async () => {
    await withRolloutRepo(async (repoRoot) => {
      const report = await buildMcpRolloutGateReport({ repo: repoRoot, query: "repo-harness" });

      expect(report.ok).toBe(true);
      expect(report.shadow.status).toBe("pass");
      expect(report.shadow.legacy_files).toBeGreaterThan(0);
      expect(report.shadow.missing_from_manifest).toEqual([]);
      expect(report.shadow.compared_reads).toBeGreaterThan(0);
      expect(report.shadow.mismatched_reads).toEqual([]);
      expect(report.shadow.search.checked).toBe(true);
      expect(report.shadow.search.general_repo_matches).toBeGreaterThan(0);
      expect(report.canary.stage).toBe("read_only");
      expect(report.canary.selected_repos.length).toBeGreaterThan(0);
      expect(report.canary.read_write_repo_enabled).toBeNull();
      expect(report.rollback.status).toBe("pass");
      expect(report.rollback.legacy_tools_available).toBe(true);
      expect(report.rollback.general_repo_tools_hidden).toBe(true);
      expect(report.rollback.command).toContain("REPO_HARNESS_MCP_ROLLBACK_LEGACY_TOOLS=1");
      expect(report.codegraph_ignore_audit.manifest_complete).toBe(true);
      expect(existsSync(join(repoRoot, ".ai", "harness", "mcp", "metrics.jsonl"))).toBe(true);
    });
  });
});

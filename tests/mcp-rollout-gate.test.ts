import { describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
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
      writeFileSync(join(repoRoot, ".gitignore"), ".ai/harness/runs/\n.ai/harness/mcp/\n");
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

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initGitHistory(repoRoot: string): { baseSha: string; headSha: string; eventPath: string } {
  git(repoRoot, ["init", "-q"]);
  git(repoRoot, ["config", "user.name", "Repo Harness Test"]);
  git(repoRoot, ["config", "user.email", "repo-harness-test@example.com"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-qm", "base"]);
  const baseSha = git(repoRoot, ["rev-parse", "HEAD"]);
  writeFileSync(join(repoRoot, "tasks", "release-gate-head.md"), "head\nrepo-harness\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-qm", "head"]);
  const headSha = git(repoRoot, ["rev-parse", "HEAD"]);
  const eventPath = join(repoRoot, ".git", "github-event.json");
  writeFileSync(eventPath, `${JSON.stringify({
    number: 35,
    pull_request: {
      base: { sha: baseSha },
      head: { sha: headSha },
    },
  }, null, 2)}\n`);
  return { baseSha, headSha, eventPath };
}

describe("mcp rollout gate", () => {
  test("builds a passing shadow, canary, rollback, and CodeGraph-ignore audit report", async () => {
    await withRolloutRepo(async (repoRoot) => {
      const { baseSha, headSha, eventPath } = initGitHistory(repoRoot);
      const report = await buildMcpRolloutGateReport({
        repo: repoRoot,
        query: "repo-harness",
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_REPOSITORY: "Ancienttwo/repo-harness",
          GITHUB_RUN_ID: "28028497809",
          GITHUB_RUN_ATTEMPT: "1",
          GITHUB_WORKFLOW: "main CI",
          GITHUB_JOB: "test",
          GITHUB_SHA: headSha,
        },
      });

      expect(report.ok).toBe(true);
      expect(report.provenance.status).toBe("bound");
      expect(report.provenance.source.base_sha).toBe(baseSha);
      expect(report.provenance.source.head_sha).toBe(headSha);
      expect(report.provenance.source.current_sha).toBe(headSha);
      expect(report.provenance.source.head_matches_current).toBe(true);
      expect(report.provenance.source.pr_number).toBe(35);
      expect(report.provenance.source.dirty_tree.status).toBe("clean");
      expect(report.provenance.ci.workflow).toBe("main CI");
      expect(report.provenance.ci.run_id).toBe("28028497809");
      expect(report.provenance.ci.run_url).toBe("https://github.com/Ancienttwo/repo-harness/actions/runs/28028497809");
      expect(report.provenance.artifact_digest.algorithm).toBe("sha256");
      expect(report.provenance.artifact_digest.scope).toBe("canonical-json-with-provenance.artifact_digest.value-null");
      expect(report.provenance.artifact_digest.value).toMatch(/^[a-f0-9]{64}$/);
      const digestInput = {
        ...report,
        provenance: {
          ...report.provenance,
          artifact_digest: {
            ...report.provenance.artifact_digest,
            value: null,
          },
        },
      };
      const expectedDigest = createHash("sha256")
        .update(`${JSON.stringify(digestInput, null, 2)}\n`)
        .digest("hex");
      expect(report.provenance.artifact_digest.value).toBe(expectedDigest);
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
      expect(new Date(report.canary.observation.window.ended_at).getTime()).toBeGreaterThanOrEqual(
        new Date(report.canary.observation.window.started_at).getTime(),
      );
      expect(report.canary.observation.window.duration_ms).toBeGreaterThanOrEqual(0);
      expect(report.canary.observation.read_only_config.repo_write_enabled).toBe(false);
      expect(report.canary.observation.request_volume.total).toBeGreaterThan(0);
      expect(report.canary.observation.request_volume.by_tool.repo_manifest).toBeGreaterThan(0);
      expect(report.canary.observation.error_rate.error_count).toBe(0);
      expect(report.canary.observation.latency_ms.max).toBeGreaterThanOrEqual(report.canary.observation.latency_ms.min);
      expect(report.canary.observation.shadow_mismatch.missing_from_manifest).toBe(0);
      expect(report.canary.observation.shadow_mismatch.mismatched_reads).toBe(0);
      expect(report.canary.observation.rollback_triggers).toEqual([
        expect.objectContaining({ trigger: "rollback_to_legacy_tools", active: true, status: "pass" }),
        expect.objectContaining({ trigger: "hide_general_repo_tools", active: true, status: "pass" }),
      ]);
      expect(report.rollback.status).toBe("pass");
      expect(report.rollback.legacy_tools_available).toBe(true);
      expect(report.rollback.general_repo_tools_hidden).toBe(true);
      expect(report.rollback.command).toContain("REPO_HARNESS_MCP_ROLLBACK_LEGACY_TOOLS=1");
      expect(report.codegraph_ignore_audit.manifest_complete).toBe(true);
      expect(existsSync(join(repoRoot, ".ai", "harness", "mcp", "metrics.jsonl"))).toBe(true);
    });
  });

  test("fails closed when rollout evidence is generated from a dirty tree", async () => {
    await withRolloutRepo(async (repoRoot) => {
      const { headSha, eventPath } = initGitHistory(repoRoot);
      writeFileSync(join(repoRoot, "tasks", "dirty-release-evidence.md"), "dirty\nrepo-harness\n");

      const report = await buildMcpRolloutGateReport({
        repo: repoRoot,
        query: "repo-harness",
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_REPOSITORY: "Ancienttwo/repo-harness",
          GITHUB_RUN_ID: "28028497809",
          GITHUB_WORKFLOW: "main CI",
          GITHUB_SHA: headSha,
        },
      });

      expect(report.shadow.status).toBe("pass");
      expect(report.rollback.status).toBe("pass");
      expect(report.provenance.status).toBe("dirty");
      expect(report.provenance.source.head_matches_current).toBe(true);
      expect(report.provenance.source.dirty_tree.status).toBe("dirty");
      expect(report.provenance.source.dirty_tree.changed_paths).toContain("tasks/dirty-release-evidence.md");
      expect(report.ok).toBe(false);
    });
  });

  test("fails closed when rollout evidence lacks PR CI provenance", async () => {
    await withRolloutRepo(async (repoRoot) => {
      const { headSha, eventPath } = initGitHistory(repoRoot);

      const report = await buildMcpRolloutGateReport({
        repo: repoRoot,
        query: "repo-harness",
        env: {
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_SHA: headSha,
        },
      });

      expect(report.shadow.status).toBe("pass");
      expect(report.rollback.status).toBe("pass");
      expect(report.provenance.source.pr_number).toBe(35);
      expect(report.provenance.source.head_matches_current).toBe(true);
      expect(report.provenance.ci.workflow).toBeNull();
      expect(report.provenance.ci.run_id).toBeNull();
      expect(report.provenance.status).toBe("partial");
      expect(report.ok).toBe(false);
    });
  });
});

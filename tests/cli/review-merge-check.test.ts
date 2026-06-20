import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function tmpRepo(prefix: string): { cwd: string; head: string } {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Merge Check Test"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "merge-check@test.local"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "base\n");
  spawnSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd, encoding: "utf-8" });
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" }).stdout.trim();
  return { cwd, head };
}

function run(cwd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8", env: env ? { ...process.env, ...env } : process.env });
}

describe("review merge-check CLI", () => {
  test("reports ready_but_not_authorized when remote and independent review evidence are clean", () => {
    const { cwd, head } = tmpRepo("merge-check-ready");
    try {
      const fixture = join(cwd, "github.json");
      const evidence = join(cwd, "review.json");
      writeFileSync(fixture, JSON.stringify({
        head_sha: head,
        merge_state: "clean",
        checks: "passed",
        unresolved_actionable_threads: 0,
      }));
      writeFileSync(evidence, JSON.stringify({
        independent_review: "passed",
        reviewer_lane_id: "reviewer-api",
        worker_lane_id: "worker-api",
        reviewed_head_sha: head,
      }));
      const res = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--no-fetch",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.decision).toBe("ready_but_not_authorized");
      expect(report.independent_review).toBe("passed");
      expect(report.merge_authorized).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when independent review evidence is missing or head is stale", () => {
    const { cwd, head } = tmpRepo("merge-check-blocked");
    try {
      const fixture = join(cwd, "github.json");
      writeFileSync(fixture, JSON.stringify({
        head_sha: head,
        merge_state: "clean",
        checks: "passed",
        unresolved_actionable_threads: 0,
      }));
      const missingReview = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--no-fetch",
        "--github-fixture",
        fixture,
        "--json",
      ]);
      expect(missingReview.status).toBe(1);
      expect(JSON.parse(missingReview.stdout).decision).toBe("blocked_independent_review");

      const staleFixture = join(cwd, "github-stale.json");
      const evidence = join(cwd, "review.json");
      writeFileSync(staleFixture, JSON.stringify({
        head_sha: "0000000000000000000000000000000000000000",
        merge_state: "clean",
        checks: "passed",
        unresolved_actionable_threads: 0,
      }));
      writeFileSync(evidence, JSON.stringify({
        independent_review: "passed",
        reviewer_lane_id: "reviewer-api",
        worker_lane_id: "worker-api",
        reviewed_head_sha: "0000000000000000000000000000000000000000",
      }));
      const stale = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--no-fetch",
        "--github-fixture",
        staleFixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(stale.status).toBe(1);
      expect(JSON.parse(stale.stdout).decision).toBe("blocked_head_mismatch");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("infers repo slug for live gh review thread checks", () => {
    const { cwd, head } = tmpRepo("merge-check-gh");
    try {
      spawnSync("git", ["remote", "add", "origin", "git@github.com:Ancienttwo/agentic-dev.git"], { cwd, encoding: "utf-8" });
      const bin = join(cwd, "bin");
      mkdirSync(bin, { recursive: true });
      const log = join(cwd, "gh-calls.jsonl");
      const gh = join(bin, "gh");
      writeFileSync(gh, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GH_CALL_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "pr" && args[1] === "view") {
  console.log(JSON.stringify({
    url: "https://github.com/Ancienttwo/agentic-dev/pull/12",
    headRefOid: process.env.MERGE_CHECK_HEAD,
    mergeStateStatus: "CLEAN",
    isDraft: false,
    statusCheckRollup: [{ conclusion: "SUCCESS", status: "COMPLETED" }],
  }));
  process.exit(0);
}
if (args[0] === "api" && args[1] === "graphql") {
  console.log(JSON.stringify({
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [{ isResolved: true }],
        },
      },
    },
  }));
  process.exit(0);
}
process.exit(1);
`);
      chmodSync(gh, 0o755);
      const evidence = join(cwd, "review.json");
      writeFileSync(evidence, JSON.stringify({
        independent_review: "passed",
        reviewer_lane_id: "reviewer-api",
        worker_lane_id: "worker-api",
        reviewed_head_sha: head,
      }));

      const res = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--no-fetch",
        "--review-evidence",
        evidence,
        "--json",
      ], {
        GH_CALL_LOG: log,
        MERGE_CHECK_HEAD: head,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      });

      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.repo).toBe("Ancienttwo/agentic-dev");
      expect(report.review_threads.unresolved_actionable).toBe(0);
      const calls = readFileSync(log, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
      expect(calls.some((args: string[]) => args.includes("--repo") && args.includes("Ancienttwo/agentic-dev"))).toBe(true);
      expect(calls.some((args: string[]) => args[0] === "api" && args[1] === "graphql")).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

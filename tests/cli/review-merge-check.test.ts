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
  spawnSync("git", ["remote", "add", "origin", cwd], { cwd, encoding: "utf-8" });
  return { cwd, head };
}

function run(cwd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8", env: env ? { ...process.env, ...env } : process.env });
}

function requiredChecksFixture(overrides: Record<string, unknown> = {}) {
  return {
    complete: true,
    contexts: ["required-ci"],
    statuses: { "required-ci": "passed" },
    source: "fixture",
    ...overrides,
  };
}

function githubFixture(head: string, overrides: Record<string, unknown> = {}) {
  return {
    head_sha: head,
    merge_state: "clean",
    checks: "passed",
    required_checks: requiredChecksFixture(),
    unresolved_actionable_threads: 0,
    review_threads_complete: true,
    ...overrides,
  };
}

describe("review merge-check CLI", () => {
  test("allows merge only with complete evidence and head-bound authorization", () => {
    const { cwd, head } = tmpRepo("merge-check-ready");
    try {
      const fixture = join(cwd, "github.json");
      const evidence = join(cwd, "review.json");
      const authorization = join(cwd, "authorization.json");
      writeFileSync(fixture, JSON.stringify(githubFixture(head)));
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
        independent_review: "passed",
        reviewer_lane_id: "reviewer-api",
        worker_lane_id: "worker-api",
        reviewed_head_sha: head,
      }));
      writeFileSync(authorization, JSON.stringify({
        schema_version: 1,
        authorized: true,
        repo: "Ancienttwo/agentic-dev",
        pr: 12,
        head_sha: head,
        actor: "reviewer",
        authorized_at: "2026-06-21T00:00:00.000Z",
      }));
      const res = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--authorization",
        authorization,
        "--json",
      ]);
      expect(res.status).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.decision).toBe("ready");
      expect(report.independent_review).toBe("passed");
      expect(report.merge_authorized).toBe(true);
      expect(report.authorization_actor).toBe("reviewer");
      expect(report.merge_allowed).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reports ready_but_not_authorized with a non-zero exit when authorization is missing", () => {
    const { cwd, head } = tmpRepo("merge-check-not-authorized");
    try {
      const fixture = join(cwd, "github.json");
      const evidence = join(cwd, "review.json");
      writeFileSync(fixture, JSON.stringify(githubFixture(head)));
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
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
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(res.status).toBe(3);
      const report = JSON.parse(res.stdout);
      expect(report.decision).toBe("ready_but_not_authorized");
      expect(report.merge_allowed).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("requires authorization actor and unexpired authorization time", () => {
    const { cwd, head } = tmpRepo("merge-check-auth-binding");
    try {
      const fixture = join(cwd, "github.json");
      const evidence = join(cwd, "review.json");
      const authorization = join(cwd, "authorization.json");
      writeFileSync(fixture, JSON.stringify(githubFixture(head)));
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
        independent_review: "passed",
        reviewer_lane_id: "reviewer-api",
        worker_lane_id: "worker-api",
        reviewed_head_sha: head,
      }));

      writeFileSync(authorization, JSON.stringify({
        schema_version: 1,
        authorized: true,
        repo: "Ancienttwo/agentic-dev",
        pr: 12,
        head_sha: head,
        authorized_at: "2026-06-21T00:00:00.000Z",
      }));
      const missingActor = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--authorization",
        authorization,
        "--json",
      ]);
      expect(missingActor.status).toBe(3);
      expect(JSON.parse(missingActor.stdout).decision).toBe("ready_but_not_authorized");

      writeFileSync(authorization, JSON.stringify({
        schema_version: 1,
        authorized: true,
        repo: "Ancienttwo/agentic-dev",
        pr: 12,
        head_sha: head,
        actor: "reviewer",
        authorized_at: "2026-06-21T00:00:00.000Z",
        expires_at: "2020-01-01T00:00:00.000Z",
      }));
      const expired = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--authorization",
        authorization,
        "--json",
      ]);
      expect(expired.status).toBe(3);
      expect(JSON.parse(expired.stdout).merge_allowed).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when independent review evidence is missing or head is stale", () => {
    const { cwd, head } = tmpRepo("merge-check-blocked");
    try {
      const fixture = join(cwd, "github.json");
      writeFileSync(fixture, JSON.stringify(githubFixture(head)));
      const missingReview = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--json",
      ]);
      expect(missingReview.status).toBe(2);
      expect(JSON.parse(missingReview.stdout).decision).toBe("blocked_independent_review");

      const staleFixture = join(cwd, "github-stale.json");
      const evidence = join(cwd, "review.json");
      writeFileSync(staleFixture, JSON.stringify(githubFixture("0000000000000000000000000000000000000000")));
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
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
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        staleFixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(stale.status).toBe(2);
      expect(JSON.parse(stale.stdout).decision).toBe("blocked_head_mismatch");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blocks incomplete GitHub review-thread evidence and incomplete review evidence", () => {
    const { cwd, head } = tmpRepo("merge-check-incomplete");
    try {
      const fixture = join(cwd, "github.json");
      const evidence = join(cwd, "review.json");
      writeFileSync(fixture, JSON.stringify({
        head_sha: head,
        merge_state: "clean",
        checks: "passed",
        required_checks: requiredChecksFixture(),
      }));
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
        independent_review: "passed",
        reviewer_lane_id: "reviewer-api",
        worker_lane_id: "worker-api",
        reviewed_head_sha: head,
      }));
      const incompleteThreads = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(incompleteThreads.status).toBe(4);
      expect(JSON.parse(incompleteThreads.stdout).decision).toBe("evidence_incomplete");

      writeFileSync(fixture, JSON.stringify(githubFixture(head)));
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
        independent_review: "passed",
      }));
      const incompleteReview = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(incompleteReview.status).toBe(2);
      expect(JSON.parse(incompleteReview.stdout).decision).toBe("blocked_independent_review");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("requires complete required-check evidence", () => {
    const { cwd, head } = tmpRepo("merge-check-required-evidence");
    try {
      const fixture = join(cwd, "github.json");
      const evidence = join(cwd, "review.json");
      writeFileSync(fixture, JSON.stringify({
        head_sha: head,
        merge_state: "clean",
        checks: "passed",
        unresolved_actionable_threads: 0,
        review_threads_complete: true,
      }));
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
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
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(res.status).toBe(4);
      const report = JSON.parse(res.stdout);
      expect(report.decision).toBe("evidence_incomplete");
      expect(report.required_checks.complete).toBe(false);
      expect(report.blockers.join("\n")).toContain("required check evidence is incomplete");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("gates required checks without treating optional failures as blockers", () => {
    const { cwd, head } = tmpRepo("merge-check-required-statuses");
    try {
      const fixture = join(cwd, "github.json");
      const evidence = join(cwd, "review.json");
      writeFileSync(evidence, JSON.stringify({
        schema_version: 1,
        independent_review: "passed",
        reviewer_lane_id: "reviewer-api",
        worker_lane_id: "worker-api",
        reviewed_head_sha: head,
      }));

      writeFileSync(fixture, JSON.stringify(githubFixture(head, {
        checks: "failed",
        required_checks: requiredChecksFixture(),
      })));
      const optionalFailure = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(optionalFailure.status).toBe(3);
      const optionalReport = JSON.parse(optionalFailure.stdout);
      expect(optionalReport.checks).toBe("failed");
      expect(optionalReport.required_checks.state).toBe("passed");
      expect(optionalReport.decision).toBe("ready_but_not_authorized");

      writeFileSync(fixture, JSON.stringify(githubFixture(head, {
        checks: "passed",
        required_checks: requiredChecksFixture({
          contexts: ["missing-ci", "required-ci"],
          statuses: { "required-ci": "passed", "missing-ci": "missing" },
          missing: ["missing-ci"],
        }),
      })));
      const missingRequired = run(cwd, [
        "review",
        "merge-check",
        "--pr",
        "12",
        "--repo",
        "Ancienttwo/agentic-dev",
        "--github-fixture",
        fixture,
        "--review-evidence",
        evidence,
        "--json",
      ]);
      expect(missingRequired.status).toBe(2);
      const missingReport = JSON.parse(missingRequired.stdout);
      expect(missingReport.decision).toBe("blocked_checks");
      expect(missingReport.required_checks.state).toBe("missing");
      expect(missingReport.required_checks.missing).toEqual(["missing-ci"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("infers repo slug for live gh review thread checks", () => {
    const { cwd, head } = tmpRepo("merge-check-gh");
    try {
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
	    baseRefName: "main",
	    mergeStateStatus: "CLEAN",
	    isDraft: false,
	    statusCheckRollup: [{ context: "required-ci", state: "SUCCESS" }],
	  }));
	  process.exit(0);
	}
	if (args[0] === "api" && args[1] === "/repos/Ancienttwo/agentic-dev/rules/branches/main?per_page=100") {
	  console.log(JSON.stringify([
	    { type: "required_status_checks", parameters: { required_status_checks: [{ context: "required-ci" }] } },
	  ]));
	  process.exit(0);
	}
	if (args[0] === "api" && args[1] === "graphql") {
	  const queryArg = args.find((arg) => arg.startsWith("query=")) || "";
	  if (queryArg.includes("branchProtectionRule")) {
	    console.log(JSON.stringify({
	      repository: {
	        ref: {
	          branchProtectionRule: {
	            requiredStatusCheckContexts: ["required-ci"],
	            requiredStatusChecks: [],
	          },
	        },
	      },
	    }));
	    process.exit(0);
	  }
	  const cursorArg = args.find((arg) => arg.startsWith("cursor="));
  if (!cursorArg) {
    console.log(JSON.stringify({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [{ id: "thread-1", isResolved: true }],
            pageInfo: { hasNextPage: true, endCursor: "next" },
          },
        },
      },
    }));
    process.exit(0);
  }
  console.log(JSON.stringify({
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [{ id: "thread-2", isResolved: true }],
          pageInfo: { hasNextPage: false, endCursor: null },
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
        schema_version: 1,
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
        "--review-evidence",
        evidence,
        "--json",
      ], {
        GH_CALL_LOG: log,
        MERGE_CHECK_HEAD: head,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      });

      expect(res.status).toBe(3);
      const report = JSON.parse(res.stdout);
      expect(report.repo).toBe("Ancienttwo/agentic-dev");
      expect(report.required_checks.state).toBe("passed");
      expect(report.review_threads.unresolved_actionable).toBe(0);
      expect(report.review_threads.complete).toBe(true);
      const calls = readFileSync(log, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
      expect(calls.some((args: string[]) => (
        args[0] === "api" &&
        args[1] === "graphql" &&
        args.some((arg) => typeof arg === "string" && arg.includes("branchProtectionRule")) &&
        args.includes("qualifiedName=main")
      ))).toBe(true);
      expect(calls.some((args: string[]) => (
        args[0] === "api" &&
        args[1] === "/repos/Ancienttwo/agentic-dev/rules/branches/main?per_page=100"
      ))).toBe(true);
      expect(calls.some((args: string[]) => (
        args[0] === "api" &&
        args[1] === "graphql" &&
        args.some((arg) => typeof arg === "string" && arg.includes("reviewThreads")) &&
        args.includes("owner=Ancienttwo") &&
        args.includes("name=agentic-dev")
      ))).toBe(true);
      expect(calls.some((args: string[]) => args[0] === "pr" && args[1] === "merge")).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when PR head changes during live merge-check", () => {
    const { cwd, head } = tmpRepo("merge-check-toctou");
    try {
      const bin = join(cwd, "bin");
      mkdirSync(bin, { recursive: true });
      const log = join(cwd, "gh-calls.jsonl");
      const gh = join(bin, "gh");
      const nextHead = "1111111111111111111111111111111111111111";
      writeFileSync(gh, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GH_CALL_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "pr" && args[1] === "view") {
  const calls = fs.readFileSync(process.env.GH_CALL_LOG, "utf8")
    .trim()
    .split("\\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry[0] === "pr" && entry[1] === "view").length;
  console.log(JSON.stringify({
	    url: "https://github.com/Ancienttwo/agentic-dev/pull/12",
	    headRefOid: calls === 1 ? process.env.MERGE_CHECK_HEAD : process.env.MERGE_CHECK_NEXT_HEAD,
	    baseRefName: "main",
	    mergeStateStatus: "CLEAN",
	    isDraft: false,
	    statusCheckRollup: [{ context: "required-ci", state: "SUCCESS" }],
	  }));
	  process.exit(0);
	}
	if (args[0] === "api" && args[1] === "/repos/Ancienttwo/agentic-dev/rules/branches/main?per_page=100") {
	  console.log(JSON.stringify([
	    { type: "required_status_checks", parameters: { required_status_checks: [{ context: "required-ci" }] } },
	  ]));
	  process.exit(0);
	}
	if (args[0] === "api" && args[1] === "graphql") {
	  const queryArg = args.find((arg) => arg.startsWith("query=")) || "";
	  if (queryArg.includes("branchProtectionRule")) {
	    console.log(JSON.stringify({
	      repository: {
	        ref: {
	          branchProtectionRule: {
	            requiredStatusCheckContexts: ["required-ci"],
	            requiredStatusChecks: [],
	          },
	        },
	      },
	    }));
	    process.exit(0);
	  }
	  console.log(JSON.stringify({
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
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
        schema_version: 1,
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
        "--review-evidence",
        evidence,
        "--json",
      ], {
        GH_CALL_LOG: log,
        MERGE_CHECK_HEAD: head,
        MERGE_CHECK_NEXT_HEAD: nextHead,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      });

      expect(res.status).toBe(2);
      const report = JSON.parse(res.stdout);
      expect(report.decision).toBe("blocked_head_mismatch");
      expect(report.final_head_sha).toBe(nextHead);
      expect(report.blockers.join("\n")).toContain("PR head changed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

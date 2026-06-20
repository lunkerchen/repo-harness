import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  activateLaneContract,
  bindLaneWorktree,
  closeLane,
  decideLaneEdit,
  decideLaneStop,
  recordLaneEdit,
} from "../../src/core/lanes/state";

function tmpRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "repo-harness-lane-state-"));
  spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Lane State Test"], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "lane-state@test.local"], { cwd: repo, encoding: "utf-8" });
  writeFileSync(join(repo, "README.md"), "base\n");
  spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: repo, encoding: "utf-8" });
  mkdirSync(join(repo, "tasks/contracts"), { recursive: true });
  writeFileSync(
    join(repo, "tasks/contracts/demo.lanes.json"),
    JSON.stringify(
      {
        schema_version: 1,
        run_id: "demo-run",
        lanes: [
          {
            id: "worker-api",
            role: "worker",
            write_scopes: ["src/auth"],
            forbidden_scopes: ["AGENTS.md"],
            required_evidence: ["files_changed", "commands_run"],
          },
          { id: "worker-ui", role: "worker", write_scopes: ["src/ui"] },
          { id: "reviewer", role: "reviewer", write_scopes: [] },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  return repo;
}

describe("lane runtime state", () => {
  test("activates, binds, decides ownership, records edits, and closes with evidence", () => {
    const repo = tmpRepo();
    try {
      const activated = activateLaneContract("tasks/contracts/demo.lanes.json", repo);
      expect(activated.status).toBe("active");

      const bound = bindLaneWorktree("worker-api", { cwd: repo, worktree: repo });
      expect(bound.current_lane?.lane_id).toBe("worker-api");

      expect(decideLaneEdit("src/auth/session.ts", { cwd: repo, mode: "enforce" }).action).toBe("allow");
      const wrongLane = decideLaneEdit("src/ui/button.ts", { cwd: repo, mode: "enforce" });
      expect(wrongLane.action).toBe("block");
      expect(wrongLane.owner_lane_id).toBe("worker-ui");

      const recorded = recordLaneEdit("src/auth/session.ts", { cwd: repo });
      expect(recorded.status).toBe("recorded");
      const state = JSON.parse(readFileSync(join(repo, ".ai/harness/runs/demo-run/lane-state.json"), "utf-8"));
      expect(state.lanes["worker-api"].touched_files).toContain("src/auth/session.ts");

      const firstStop = decideLaneStop({ cwd: repo, mode: "advice" });
      expect(firstStop.action).toBe("advise");
      expect(firstStop.missing).toContain("commands_run");
      const secondStop = decideLaneStop({ cwd: repo, mode: "advice" });
      expect(secondStop.action).toBe("allow");

      writeFileSync(join(repo, "evidence.json"), JSON.stringify({ commands_run: ["bun test"] }, null, 2));
      const closed = closeLane("worker-api", { cwd: repo, evidenceFile: "evidence.json" });
      expect(closed.runtime?.lanes["worker-api"].status).toBe("closed");
      expect(decideLaneStop({ cwd: repo, mode: "advice" }).action).toBe("allow");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("requires reviewer reviewed_head_sha on stop and close paths", () => {
    const repo = tmpRepo();
    try {
      activateLaneContract("tasks/contracts/demo.lanes.json", repo);
      bindLaneWorktree("reviewer", { cwd: repo, worktree: repo });

      const stop = decideLaneStop({ cwd: repo, mode: "enforce" });
      expect(stop.action).toBe("block");
      expect(stop.missing).toContain("reviewed_head_sha");

      writeFileSync(join(repo, "bad-review.json"), JSON.stringify({ findings: [] }, null, 2));
      expect(() => closeLane("reviewer", { cwd: repo, evidenceFile: "bad-review.json" })).toThrow(/reviewed_head_sha/);

      const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf-8" }).stdout.trim();
      writeFileSync(join(repo, "review.json"), JSON.stringify({ reviewed_head_sha: head, findings: [] }, null, 2));
      const closed = closeLane("reviewer", { cwd: repo, evidenceFile: "review.json" });
      expect(closed.runtime?.lanes.reviewer.status).toBe("closed");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

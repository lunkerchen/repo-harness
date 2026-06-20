import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
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
  recordLaneShellCommand,
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
            forbidden_scopes: ["AGENTS.md", "src/auth/private"],
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

      const traversal = decideLaneEdit("../outside.ts", { cwd: repo, mode: "enforce" });
      expect(traversal.action).toBe("block");
      expect(traversal.reason).toContain("path traversal");

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

  test("records shell write bypasses as unauthorized and blocks lane closure", () => {
    const repo = tmpRepo();
    try {
      activateLaneContract("tasks/contracts/demo.lanes.json", repo);
      bindLaneWorktree("worker-api", { cwd: repo, worktree: repo });

      const wrongLane = recordLaneShellCommand("printf x | tee src/ui/button.ts", { cwd: repo });
      expect(wrongLane.status).toBe("recorded");
      expect(wrongLane.unauthorized).toBe(true);
      expect(wrongLane.targets).toContain("src/ui/button.ts");

      const forbidden = recordLaneShellCommand("sed -i '' 's/a/b/' src/auth/private/token.ts", { cwd: repo });
      expect(forbidden.status).toBe("recorded");
      expect(forbidden.unauthorized).toBe(true);
      expect(forbidden.targets).toContain("src/auth/private/token.ts");

      const rename = recordLaneShellCommand("mv src/auth/session.ts src/ui/session.ts", { cwd: repo });
      expect(rename.status).toBe("recorded");
      expect(rename.targets).toContain("src/auth/session.ts");
      expect(rename.targets).toContain("src/ui/session.ts");
      expect(rename.unauthorized).toBe(true);

      const opaque = recordLaneShellCommand("python -c \"from pathlib import Path; Path('src/auth/session.ts').write_text('x')\"", { cwd: repo });
      expect(opaque.status).toBe("recorded");
      expect(opaque.opaque).toBe(true);
      expect(opaque.unauthorized).toBe(true);

      const state = JSON.parse(readFileSync(join(repo, ".ai/harness/runs/demo-run/lane-state.json"), "utf-8"));
      expect(state.lanes["worker-api"].touched_files).toContain("src/ui/button.ts");
      expect(state.lanes["worker-api"].touched_files).toContain("src/auth/private/token.ts");
      expect(state.lanes["worker-api"].touched_files).toContain("src/auth/session.ts");
      expect(state.lanes["worker-api"].touched_files).toContain("src/ui/session.ts");
      expect(state.lanes["worker-api"].unauthorized_changes).toContain("src/ui/button.ts");
      expect(state.lanes["worker-api"].unauthorized_changes).toContain("src/auth/private/token.ts");
      expect(state.lanes["worker-api"].unauthorized_changes).toContain("src/ui/session.ts");
      expect(state.lanes["worker-api"].unauthorized_changes.some((entry: string) => entry.startsWith("opaque-shell-command:"))).toBe(true);

      const stop = decideLaneStop({ cwd: repo, mode: "enforce" });
      expect(stop.action).toBe("block");
      expect(stop.reason).toContain("unauthorized changes");

      writeFileSync(join(repo, "evidence.json"), JSON.stringify({ commands_run: ["bun test"] }, null, 2));
      expect(() => closeLane("worker-api", { cwd: repo, evidenceFile: "evidence.json" })).toThrow(/unauthorized changes/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("blocks symlink escapes through the nearest existing parent", () => {
    const repo = tmpRepo();
    const outside = mkdtempSync(join(tmpdir(), "repo-harness-lane-outside-"));
    try {
      activateLaneContract("tasks/contracts/demo.lanes.json", repo);
      bindLaneWorktree("worker-api", { cwd: repo, worktree: repo });
      mkdirSync(join(repo, "src/auth"), { recursive: true });
      symlinkSync(outside, join(repo, "src/auth/outside-link"), "dir");

      const decision = decideLaneEdit("src/auth/outside-link/secret.ts", { cwd: repo, mode: "enforce" });
      expect(decision.action).toBe("block");
      expect(decision.reason).toContain("symlink");
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

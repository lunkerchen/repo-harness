import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

setDefaultTimeout(30000);

const ROOT = join(import.meta.dir, "..");
const ASSETS_HOOKS_DIR = join(ROOT, "assets/hooks");
const CLI = join(ROOT, "src/cli/index.ts");
const HOOK_ENTRY = join(ROOT, "src/cli/hook-entry.ts");

function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

function installHooks(cwd: string): void {
  const aiHooksDir = join(cwd, ".ai", "hooks");
  mkdirSync(aiHooksDir, { recursive: true });
  for (const f of readdirSync(ASSETS_HOOKS_DIR, { withFileTypes: true })) {
    cpSync(join(ASSETS_HOOKS_DIR, f.name), join(aiHooksDir, f.name), { recursive: f.isDirectory() });
  }
  spawnSync("sh", ["-c", `find "${aiHooksDir}" -type f -name '*.sh' -exec chmod +x {} +`], {
    encoding: "utf-8",
  });
}

function initGitRepo(cwd: string): void {
  spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Lane Hook Test"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "lane-hook@test.local"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "base\n");
  spawnSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd, encoding: "utf-8" });
}

function writeLaneContract(cwd: string): void {
  mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
  writeFileSync(
    join(cwd, "tasks/contracts/demo.lanes.json"),
    JSON.stringify(
      {
        schema_version: 1,
        run_id: "demo-run",
        lanes: [
          {
            id: "worker-api",
            role: "worker",
            write_scopes: ["src/auth", "AGENTS.md"],
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
}

function runHook(
  script: string,
  cwd: string,
  filePath: string | undefined,
  env?: Record<string, string>,
) {
  return spawnSync("bash", [join(cwd, ".ai/hooks", script)], {
    cwd,
    input: filePath ? JSON.stringify({ tool_input: { file_path: filePath } }) : "",
    encoding: "utf-8",
    env: {
      ...process.env,
      REPO_HARNESS_CLI: CLI,
      REPO_HARNESS_HOOK_CLI: HOOK_ENTRY,
      REPO_HARNESS_EDIT_PLAN_GATE: "off",
      ...(env ?? {}),
    },
  });
}

function runHookPayload(
  script: string,
  cwd: string,
  payload: Record<string, unknown>,
  env?: Record<string, string>,
) {
  return spawnSync("bash", [join(cwd, ".ai/hooks", script)], {
    cwd,
    input: JSON.stringify(payload),
    encoding: "utf-8",
    env: {
      ...process.env,
      REPO_HARNESS_CLI: CLI,
      REPO_HARNESS_HOOK_CLI: HOOK_ENTRY,
      REPO_HARNESS_EDIT_PLAN_GATE: "off",
      ...(env ?? {}),
    },
  });
}

function cli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8" });
}

describe("lane hook contracts", () => {
  test("LaneScopeGuard allows owned paths and blocks wrong-lane, forbidden, reviewer, and unbound edits", () => {
    const cwd = tmpWorkspace("lane-hook-scope");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeLaneContract(cwd);
      expect(cli(cwd, ["lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"]).status).toBe(0);
      expect(cli(cwd, ["lanes", "bind", "worker-api", "--json"]).status).toBe(0);

      const owned = runHook("pre-edit-guard.sh", cwd, "src/auth/session.ts", {
        REPO_HARNESS_LANE_SCOPE_GATE: "enforce",
      });
      expect(owned.status).toBe(0);
      expect(owned.stderr).not.toContain("[LaneScopeGuard]");

      const wrong = runHook("pre-edit-guard.sh", cwd, "src/ui/button.ts", {
        REPO_HARNESS_LANE_SCOPE_GATE: "enforce",
      });
      expect(wrong.status).toBe(2);
      expect(wrong.stderr).toContain("[LaneScopeGuard]");
      expect(wrong.stderr).toContain("worker-ui");

      const forbidden = runHook("pre-edit-guard.sh", cwd, "AGENTS.md", {
        REPO_HARNESS_LANE_SCOPE_GATE: "enforce",
      });
      expect(forbidden.status).toBe(2);
      expect(forbidden.stderr).toContain("forbidden");

      expect(cli(cwd, ["lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"]).status).toBe(0);
      expect(cli(cwd, ["lanes", "bind", "reviewer", "--json"]).status).toBe(0);
      const reviewer = runHook("pre-edit-guard.sh", cwd, "src/auth/session.ts", {
        REPO_HARNESS_LANE_SCOPE_GATE: "enforce",
      });
      expect(reviewer.status).toBe(2);
      expect(reviewer.stderr).toContain("worker-api");

      expect(cli(cwd, ["lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"]).status).toBe(0);
      const unboundAdvice = runHook("pre-edit-guard.sh", cwd, "src/auth/session.ts", {
        REPO_HARNESS_LANE_SCOPE_GATE: "advice",
      });
      expect(unboundAdvice.status).toBe(0);
      expect(unboundAdvice.stdout).toContain("active lane run exists");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("PostEdit records touched files and Stop emits one-shot evidence gate", () => {
    const cwd = tmpWorkspace("lane-hook-evidence");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeLaneContract(cwd);
      expect(cli(cwd, ["lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"]).status).toBe(0);
      expect(cli(cwd, ["lanes", "bind", "worker-api", "--json"]).status).toBe(0);

      const post = runHook("post-edit-guard.sh", cwd, "src/auth/session.ts");
      expect(post.status).toBe(0);
      const state = JSON.parse(readFileSync(join(cwd, ".ai/harness/runs/demo-run/lane-state.json"), "utf-8"));
      expect(state.lanes["worker-api"].touched_files).toContain("src/auth/session.ts");

      const firstStop = runHook("stop-orchestrator.sh", cwd, undefined, { HOOK_HOST: "codex" });
      expect(firstStop.status).toBe(0);
      const decision = JSON.parse(firstStop.stdout);
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("[LaneEvidenceGate]");
      expect(decision.reason).toContain("commands_run");

      const secondStop = runHook("stop-orchestrator.sh", cwd, undefined, { HOOK_HOST: "codex" });
      expect(secondStop.status).toBe(0);
      expect(secondStop.stdout).toBe("");

      writeFileSync(join(cwd, "lane-evidence.json"), JSON.stringify({ commands_run: ["bun test"] }, null, 2));
      expect(cli(cwd, ["lanes", "close", "worker-api", "--evidence", "lane-evidence.json", "--json"]).status).toBe(0);
      const afterClose = runHook("stop-orchestrator.sh", cwd, undefined, { HOOK_HOST: "codex" });
      expect(afterClose.status).toBe(0);
      expect(afterClose.stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("PostBash records shell write bypasses and Stop blocks unauthorized lane state", () => {
    const cwd = tmpWorkspace("lane-hook-shell-bypass");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeLaneContract(cwd);
      expect(cli(cwd, ["lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"]).status).toBe(0);
      expect(cli(cwd, ["lanes", "bind", "worker-api", "--json"]).status).toBe(0);

      const post = runHookPayload("post-bash.sh", cwd, {
        tool_input: { command: "printf x | tee src/ui/button.ts" },
        tool_output: "x\n",
        exit_code: 0,
      });
      expect(post.status).toBe(0);
      expect(post.stdout).toContain("Recorded unauthorized shell write");

      const state = JSON.parse(readFileSync(join(cwd, ".ai/harness/runs/demo-run/lane-state.json"), "utf-8"));
      expect(state.lanes["worker-api"].touched_files).toContain("src/ui/button.ts");
      expect(state.lanes["worker-api"].unauthorized_changes).toContain("src/ui/button.ts");

      const stop = runHook("stop-orchestrator.sh", cwd, undefined, {
        HOOK_HOST: "codex",
        REPO_HARNESS_LANE_CLOSURE_GATE: "enforce",
      });
      expect(stop.status).toBe(0);
      const decision = JSON.parse(stop.stdout);
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("unauthorized changes");

      writeFileSync(join(cwd, "lane-evidence.json"), JSON.stringify({ commands_run: ["bun test"] }, null, 2));
      const close = cli(cwd, ["lanes", "close", "worker-api", "--evidence", "lane-evidence.json", "--json"]);
      expect(close.status).toBe(1);
      expect(JSON.parse(close.stdout).error).toContain("unauthorized changes");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

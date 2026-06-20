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

function initGitRepo(cwd: string): string {
  spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Subagent Lane Test"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "subagent-lane@test.local"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "README.md"), "base\n");
  spawnSync("git", ["add", "README.md"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd, encoding: "utf-8" });
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" }).stdout.trim();
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
            write_scopes: ["src/auth"],
            required_evidence: ["files_changed", "commands_run", "head_sha", "verification"],
          },
          {
            id: "reviewer-api",
            role: "reviewer",
            depends_on: ["worker-api"],
            write_scopes: [],
            required_evidence: ["findings", "commands_run", "verdict"],
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
}

function cli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8" });
}

function runHook(script: string, cwd: string, input: unknown, extraEnv?: Record<string, string>) {
  return spawnSync("bash", [join(cwd, ".ai/hooks", script)], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf-8",
    env: {
      ...process.env,
      REPO_HARNESS_CLI: CLI,
      REPO_HARNESS_HOOK_CLI: HOOK_ENTRY,
      HOOK_HOST: "codex",
      ...(extraEnv ?? {}),
    },
  });
}

describe("subagent lane contracts", () => {
  test("PreToolUse.subagent validates lane metadata and appends lane contract", () => {
    const cwd = tmpWorkspace("subagent-lane-pretool");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeLaneContract(cwd);
      expect(cli(cwd, ["lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"]).status).toBe(0);
      expect(cli(cwd, ["lanes", "bind", "worker-api", "--json"]).status).toBe(0);

      const missingLane = runHook("subagent-return-channel-guard.sh", cwd, {
        tool_name: "Task",
        tool_input: { prompt: "role: worker\nwrite_scope: src/auth\nimplement auth refresh" },
      });
      const missingOutput = JSON.parse(missingLane.stdout);
      expect(missingOutput.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(missingOutput.hookSpecificOutput.permissionDecisionReason).toContain("lane_id");

      const worker = runHook("subagent-return-channel-guard.sh", cwd, {
        tool_name: "Task",
        tool_input: {
          prompt: "lane_id: worker-api\nrole: worker\nwrite_scope: src/auth\nrequired_evidence: files_changed, commands_run\nimplement auth refresh",
        },
      });
      const workerOutput = JSON.parse(worker.stdout);
      expect(workerOutput.hookSpecificOutput.permissionDecision).toBe("allow");
      expect(workerOutput.hookSpecificOutput.updatedInput.prompt).toContain("[repo-harness:lane-contract]");

      const reviewerMissingHead = runHook("subagent-return-channel-guard.sh", cwd, {
        tool_name: "Task",
        tool_input: { prompt: "lane_id: reviewer-api\nrole: reviewer\nreviewer_for: worker-api\nreview the worker output" },
      });
      expect(JSON.parse(reviewerMissingHead.stdout).hookSpecificOutput.permissionDecisionReason).toContain("reviewed_head_sha");

      const reviewerSelf = runHook("subagent-return-channel-guard.sh", cwd, {
        tool_name: "Task",
        tool_input: {
          prompt: "lane_id: reviewer-api\nrole: reviewer\nreviewer_for: reviewer-api\nreviewed_head_sha: abc123\nreview the worker output",
        },
      });
      expect(JSON.parse(reviewerSelf.stdout).hookSpecificOutput.permissionDecisionReason).toContain("cannot review itself");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("SubagentStart injects active lane context and SubagentStop enforces reviewer evidence", () => {
    const cwd = tmpWorkspace("subagent-lane-stop");
    try {
      const head = initGitRepo(cwd);
      installHooks(cwd);
      writeLaneContract(cwd);
      expect(cli(cwd, ["lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"]).status).toBe(0);
      expect(cli(cwd, ["lanes", "bind", "reviewer-api", "--json"]).status).toBe(0);

      const start = runHook("subagent-start-context.sh", cwd, { session_id: "s1" });
      const startOutput = JSON.parse(start.stdout);
      expect(startOutput.hookSpecificOutput.additionalContext).toContain("Lane: reviewer-api");
      expect(startOutput.hookSpecificOutput.additionalContext).toContain("reviewed_head_sha");

      const missingEvidence = runHook("subagent-stop-quality.sh", cwd, {
        session_id: "s1",
        subagent_id: "reviewer-api",
        final_message: [
          "lane_id: reviewer-api",
          "role: reviewer",
          "reviewed_lane_id: worker-api",
          "findings: none",
          "commands_run: bun test",
          "verdict: pass",
          "files inspected: src/auth/session.ts",
          "recommended parent action: proceed",
        ].join("\n"),
      });
      expect(JSON.parse(missingEvidence.stdout).reason).toContain("reviewed_head_sha");

      const completeEvidence = runHook("subagent-stop-quality.sh", cwd, {
        session_id: "s1",
        subagent_id: "reviewer-api-2",
        final_message: [
          "lane_id: reviewer-api",
          "role: reviewer",
          "reviewed_lane_id: worker-api",
          `reviewed_head_sha: ${head}`,
          "findings: none",
          "commands_run: bun test",
          "verdict: pass",
          "files inspected: src/auth/session.ts",
          "evidence: inspected worker output at the reviewed head",
          "recommended parent action: proceed",
        ].join("\n"),
      });
      expect(completeEvidence.stdout).toBe("");
      const state = JSON.parse(readFileSync(join(cwd, ".ai/harness/runs/demo-run/lane-state.json"), "utf-8"));
      expect(state.lanes["reviewer-api"].evidence.reviewed_head_sha).toBe(head);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  cpSync,
  existsSync,
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

function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

function installHooks(cwd: string): void {
  const aiHooksDir = join(cwd, ".ai", "hooks");
  mkdirSync(aiHooksDir, { recursive: true });
  for (const f of readdirSync(ASSETS_HOOKS_DIR, { withFileTypes: true })) {
    const src = join(ASSETS_HOOKS_DIR, f.name);
    cpSync(src, join(aiHooksDir, f.name), { recursive: f.isDirectory() });
  }
  spawnSync("sh", ["-c", `find "${aiHooksDir}" -type f -name '*.sh' -exec chmod +x {} +`], {
    encoding: "utf-8",
  });
}

function initGitRepo(cwd: string): void {
  spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Context Hook Test"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "context-hook@test.local"], { cwd, encoding: "utf-8" });
  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  spawnSync("git", ["add", "tracked.txt"], { cwd, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd, encoding: "utf-8" });
}

function runHook(
  script: string,
  cwd: string,
  options?: { stdin?: string; env?: Record<string, string> },
) {
  return spawnSync("bash", [join(cwd, ".ai/hooks", script)], {
    cwd,
    input: options?.stdin ?? "",
    encoding: "utf-8",
    env: {
      ...process.env,
      REPO_HARNESS_CLI: CLI,
      ...(options?.env ?? {}),
    },
  });
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf-8")) as T;
}

function writeDirty(cwd: string): void {
  const dir = join(cwd, ".ai/harness/context-health");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "dirty.json"),
    JSON.stringify(
      {
        schema_version: 1,
        status: "dirty",
        updated_at: "2026-06-21T00:00:00.000Z",
        triggers: [{ path: "package.json", reason: "command_source_changed" }],
      },
      null,
      2,
    ) + "\n",
  );
}

describe("context hook contracts", () => {
  test("PostEdit marks high-context paths dirty without marking ordinary source edits", () => {
    const cwd = tmpWorkspace("context-hook-post-edit");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "src"), { recursive: true });

      const ordinary = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
      });
      expect(ordinary.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/context-health/dirty.json"))).toBe(false);

      const highContext = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "package.json" } }),
      });
      expect(highContext.status).toBe(0);
      const dirty = readJson<{
        status: string;
        triggers: Array<{ path: string; reason: string }>;
      }>(join(cwd, ".ai/harness/context-health/dirty.json"));
      expect(dirty.status).toBe("dirty");
      expect(dirty.triggers).toContainEqual({
        path: "package.json",
        reason: "command_source_changed",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("PreEdit emits high-context write advice without blocking advice mode", () => {
    const cwd = tmpWorkspace("context-hook-pre-edit");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const res = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: ".ai/context/context-map.json" } }),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContextHealthGuard]");
      expect(res.stdout).toContain("repo-harness context audit --changed --write-state");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("SessionStart renders context health once and audit --write-state clears the warning", () => {
    const cwd = tmpWorkspace("context-hook-session");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDirty(cwd);

      const first = runHook("session-start-context.sh", cwd);
      expect(first.status).toBe(0);
      const firstContext = JSON.parse(first.stdout).hookSpecificOutput.additionalContext;
      expect(firstContext).toContain("# Context Health");
      expect(firstContext).toContain("package.json: command_source_changed");

      const second = runHook("session-start-context.sh", cwd);
      expect(second.status).toBe(0);
      expect(second.stdout).toBe("");

      const audit = spawnSync("bun", [CLI, "context", "audit", "--static", "--write-state", "--json"], {
        cwd,
        encoding: "utf-8",
      });
      expect(audit.status).toBe(0);
      const afterAudit = runHook("session-start-context.sh", cwd);
      expect(afterAudit.status).toBe(0);
      expect(afterAudit.stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("Stop emits a one-shot context health block for dirty high-context state", () => {
    const cwd = tmpWorkspace("context-hook-stop");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDirty(cwd);

      const first = runHook("stop-orchestrator.sh", cwd, { env: { HOOK_HOST: "codex" } });
      expect(first.status).toBe(0);
      const decision = JSON.parse(first.stdout);
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("[ContextHealthGate]");
      expect(decision.reason).toContain("package.json");

      const second = runHook("stop-orchestrator.sh", cwd, { env: { HOOK_HOST: "codex" } });
      expect(second.status).toBe(0);
      expect(second.stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

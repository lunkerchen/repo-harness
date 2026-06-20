import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn, spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "../..");
const CLI = join(ROOT, "src/cli/index.ts");

function runCliAsync(cwd: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function createRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "repo-harness-context-cli-"));
  spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["config", "user.name", "Context Lane Test"], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "context-lane@test.local"], { cwd: repo, encoding: "utf-8" });
  mkdirSync(join(repo, ".ai/context"), { recursive: true });
  mkdirSync(join(repo, ".ai/harness"), { recursive: true });
  mkdirSync(join(repo, "tasks/contracts"), { recursive: true });
  mkdirSync(join(repo, "docs/architecture/modules/root"), { recursive: true });
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "AGENTS.md"), "# Agents\n");
  writeFileSync(join(repo, "CLAUDE.md"), "# Claude\n");
  writeFileSync(join(repo, "docs/spec.md"), "# Spec\n");
  writeFileSync(join(repo, "docs/architecture/modules/root/router.md"), "# Router\n");
  writeFileSync(join(repo, "package.json"), "{}\n");
  writeFileSync(join(repo, ".ai/harness/policy.json"), JSON.stringify({ version: 1 }, null, 2));
  writeFileSync(
    join(repo, ".ai/context/context-map.json"),
    JSON.stringify({ version: 1, root_context_files: ["AGENTS.md"], discoverable_contexts: [] }, null, 2),
  );
  writeFileSync(
    join(repo, ".ai/context/capabilities.json"),
    JSON.stringify({
      version: 1,
      capabilities: [{ id: "root", prefixes: ["AGENTS.md"], contract_files: { agents: "AGENTS.md" } }],
    }, null, 2),
  );
  spawnSync("git", ["add", "."], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: repo, encoding: "utf-8" });
  return repo;
}

function withRepo(fn: (repo: string) => void): void {
  const repo = createRepo();
  try {
    fn(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe("context and lanes CLI", () => {
  test("context audit emits JSON and writes state", () => {
    withRepo((repo) => {
      const audit = spawnSync(process.execPath, [CLI, "context", "audit", "--static", "--write-state", "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(audit.status).toBe(0);
      const parsed = JSON.parse(audit.stdout);
      expect(parsed.status).toBe("ok");

      const status = spawnSync(process.execPath, [CLI, "context", "status", "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(status.status).toBe(0);
      expect(JSON.parse(status.stdout).status).toBe("clean");
    });
  });

  test("lanes validate emits fail JSON for invalid contracts", () => {
    withRepo((repo) => {
      const contract = join(repo, "bad.lanes.json");
      writeFileSync(contract, JSON.stringify({
        schema_version: 1,
        run_id: "run-1",
        lanes: [{ id: "reviewer", role: "reviewer", write_scopes: ["src"] }],
      }, null, 2));

      const res = spawnSync(process.execPath, [CLI, "lanes", "validate", contract, "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(res.status).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.status).toBe("fail");
      expect(parsed.issues.map((issue: { code: string }) => issue.code)).toContain("reviewer-write-scope");
    });
  });

  test("lanes activate, bind, status, and close write runtime state", () => {
    withRepo((repo) => {
      const contract = join(repo, "tasks/contracts/demo.lanes.json");
      writeFileSync(contract, JSON.stringify({
        schema_version: 1,
        run_id: "demo-run",
        lanes: [{ id: "worker-api", role: "worker", write_scopes: ["src/auth"], required_evidence: ["commands_run"] }],
      }, null, 2));
      writeFileSync(join(repo, "evidence.json"), JSON.stringify({ commands_run: ["bun test"] }, null, 2));

      const activate = spawnSync(process.execPath, [CLI, "lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(activate.status).toBe(0);
      expect(JSON.parse(activate.stdout).active_run.run_id).toBe("demo-run");

      const bind = spawnSync(process.execPath, [CLI, "lanes", "bind", "worker-api", "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(bind.status).toBe(0);
      expect(JSON.parse(bind.stdout).current_lane.lane_id).toBe("worker-api");

      const status = spawnSync(process.execPath, [CLI, "lanes", "status", "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(status.status).toBe(0);
      expect(JSON.parse(status.stdout).status).toBe("active");

      const close = spawnSync(process.execPath, [CLI, "lanes", "close", "worker-api", "--evidence", "evidence.json", "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(close.status).toBe(0);
      expect(JSON.parse(close.stdout).runtime.lanes["worker-api"].status).toBe("closed");
    });
  });

  test("lanes evidence merges concurrent updates without losing fields", async () => {
    const repo = createRepo();
    try {
      const contract = join(repo, "tasks/contracts/demo.lanes.json");
      writeFileSync(contract, JSON.stringify({
        schema_version: 1,
        run_id: "demo-run",
        lanes: [{ id: "worker-api", role: "worker", write_scopes: ["src/auth"] }],
      }, null, 2));
      const activate = spawnSync(process.execPath, [CLI, "lanes", "activate", "tasks/contracts/demo.lanes.json", "--json"], {
        cwd: repo,
        encoding: "utf-8",
      });
      expect(activate.status).toBe(0);
      for (const name of ["one", "two", "three", "four"]) {
        writeFileSync(join(repo, `${name}.json`), JSON.stringify({ [name]: true }, null, 2));
      }
      const results = await Promise.all(["one", "two", "three", "four"].map((name) => runCliAsync(repo, [
        "lanes",
        "evidence",
        "worker-api",
        "--from",
        `${name}.json`,
        "--json",
      ])));
      expect(results.every((result) => result.status === 0)).toBe(true);
      const state = JSON.parse(readFileSync(join(repo, ".ai/harness/runs/demo-run/lane-state.json"), "utf-8"));
      expect(state.lanes["worker-api"].evidence).toMatchObject({
        one: true,
        two: true,
        three: true,
        four: true,
      });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function writeExecutable(filePath: string, content: string) {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
}

function setupFakeEnvironment(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const home = join(root, "home");
  const fakeBin = join(root, "fakebin");
  mkdirSync(home, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  return { root, home, fakeBin };
}

function writeFakeCodeGraph(fakeBin: string, logFile: string) {
  writeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      `echo "codegraph $*" >> "${logFile}"`,
      "case \"${1:-}\" in",
      "  \"--version\") echo '0.9.6' ;;",
      "  \"status\") echo 'CodeGraph Status'; echo 'Index is up to date' ;;",
      "  \"install\") echo 'installed' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeGbrain(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "gbrain"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "case \"$1 ${2:-}\" in",
      "  \"--version \") echo 'gbrain 0.12.0' ;;",
      "  \"doctor --json\") echo '{\"status\":\"warnings\",\"health_score\":90}' ;;",
      "  \"integrations list\") echo '{\"local\":[]}' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n")
  );
}

function writeFakeNpx(fakeBin: string) {
  writeExecutable(
    join(fakeBin, "npx"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "if [[ \"$*\" == *\"skills ls -g --json\"* ]]; then echo '[]'; exit 0; fi",
      "exit 1",
      "",
    ].join("\n")
  );
}

function runConfigure(target: string) {
  const envRoot = setupFakeEnvironment(`repo-harness-tools-configure-${target}`);
  const logFile = join(envRoot.root, "tool.log");
  try {
    mkdirSync(join(envRoot.home, ".codex"), { recursive: true });
    writeFileSync(join(envRoot.home, ".codex", "config.toml"), "# no codegraph yet\n");
    writeFakeCodeGraph(envRoot.fakeBin, logFile);
    writeFakeGbrain(envRoot.fakeBin);
    writeFakeNpx(envRoot.fakeBin);

    const res = spawnSync("bun", [CLI, "tools", "configure", "codegraph", "--target", target, "--location", "global", "--json", "--repo", ROOT], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: envRoot.home,
        PATH: `${envRoot.fakeBin}:${process.env.PATH ?? ""}`,
        AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
      },
    });

    const log = readFileSync(logFile, "utf-8");
    return { res, log };
  } finally {
    rmSync(envRoot.root, { recursive: true, force: true });
  }
}

describe("tools configure codegraph", () => {
  test("configures Codex through the CodeGraph target adapter", () => {
    const { res, log } = runConfigure("codex");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("codex");
    expect(result.location).toBe("global");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual(["configure-codex"]);
    expect(log).toContain("codegraph install --target codex --location global --yes");
  }, 15000);

  test("configures Claude through the CodeGraph target adapter", () => {
    const { res, log } = runConfigure("claude");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("claude");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual(["configure-claude"]);
    expect(log).toContain("codegraph install --target claude --location global --yes");
  }, 15000);

  test("configures both hosts without exposing host-specific tool names", () => {
    const { res, log } = runConfigure("both");
    expect(res.status).toBe(0);
    const result = JSON.parse(res.stdout);
    expect(result.target).toBe("both");
    expect(result.actions.map((entry: { action: string }) => entry.action)).toEqual(["configure-codex", "configure-claude"]);
    expect(log).toContain("codegraph install --target codex --location global --yes");
    expect(log).toContain("codegraph install --target claude --location global --yes");
    expect(res.stdout).not.toContain("mcp__codegraph__");
  }, 15000);
});

import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { PassThrough, Writable } from "stream";
import {
  runInit,
  runInteractiveInit,
  syncCrossReviewSkills,
  writeGlobalContextFiles,
} from "../../src/cli/commands/init";
import { configuredBrainRoot } from "../../src/cli/commands/brain-root";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src/cli/index.ts");

function makeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function setupFakeSource(root: string): void {
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "assets", "reference-configs"), { recursive: true });
  writeFileSync(
    join(root, "assets", "reference-configs", "global-working-rules.md"),
    [
      "# Global Working Rules",
      "",
      "```md",
      "# Global Working Rules",
      "",
      "- Use the user's language for reports; keep technical terms in English.",
      "- Finish and verify the concrete task.",
      "```",
      "",
    ].join("\n"),
  );
  makeExecutable(
    join(root, "scripts", "sync-codex-installed-copies.sh"),
    "#!/bin/bash\nset -euo pipefail\necho \"sync link=${AGENTIC_DEV_LINK_INSTALLED_COPIES:-unset}\"\n",
  );
  writeFileSync(
    join(root, "scripts", "inspect-project-state.ts"),
    "console.log('mode: initialize')\n",
  );
  makeExecutable(
    join(root, "scripts", "migrate-project-template.sh"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      "repo=''",
      "mode='dry-run'",
      "while [[ $# -gt 0 ]]; do",
      "  case \"$1\" in",
      "    --repo) repo=\"$2\"; shift 2 ;;",
      "    --apply) mode='apply'; shift ;;",
      "    --dry-run) mode='dry-run'; shift ;;",
      "    *) shift ;;",
      "  esac",
      "done",
      "if [[ \"$mode\" != 'apply' ]]; then",
      "  echo dry-run \"$repo\"",
      "  exit 0",
      "fi",
      "mkdir -p \"$repo/scripts\" \"$repo/.ai/harness\"",
      "printf '{}\\n' > \"$repo/.ai/harness/workflow-contract.json\"",
      "cat > \"$repo/.ai/harness/brain-manifest.json\" <<'EOF'",
      "{",
      "  \"version\": 1,",
      "  \"project\": \"demo\",",
      "  \"default_brain_path\": \"brain/demo/*\",",
      "  \"entries\": []",
      "}",
      "EOF",
      "cat > \"$repo/scripts/check-task-workflow.sh\" <<'EOF'",
      "#!/bin/bash",
      "echo '[workflow] OK'",
      "EOF",
      "chmod +x \"$repo/scripts/check-task-workflow.sh\"",
      "echo migrate \"$repo\"",
      "",
    ].join("\n"),
  );
  mkdirSync(join(root, "assets", "skills", "codex-review"), { recursive: true });
  writeFileSync(
    join(root, "assets", "skills", "codex-review", "SKILL.md"),
    "---\nname: codex-review\n---\n",
  );
  mkdirSync(join(root, "assets", "skills", "claude-review"), { recursive: true });
  writeFileSync(
    join(root, "assets", "skills", "claude-review", "SKILL.md"),
    "---\nname: claude-review\n---\n",
  );
}

function writeFakeCodegraph(fakeBin: string, logFile: string): void {
  makeExecutable(
    join(fakeBin, "codegraph"),
    [
      "#!/bin/bash",
      "set -euo pipefail",
      `echo "codegraph $*" >> "${logFile}"`,
      "case \"${1:-}\" in",
      "  \"--version\") echo '0.9.6' ;;",
      "  \"status\")",
      "    if [[ -f .codegraph/initialized ]]; then",
      "      echo 'CodeGraph Status'",
      "      echo 'Index is up to date'",
      "    else",
      "      echo 'CodeGraph Status'",
      "      echo 'Not initialized'",
      "      echo 'Run \"codegraph init\" to initialize'",
      "    fi",
      "    ;;",
      "  \"init\") mkdir -p .codegraph; touch .codegraph/initialized; echo 'initialized' ;;",
      "  \"sync\") mkdir -p .codegraph; touch .codegraph/initialized; echo 'synced' ;;",
      "  \"install\") echo 'installed' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"),
  );
}

describe("init command", () => {
  test("defaults --repo to cwd and applies the existing-repo harness", () => {
    const tmp = join(tmpdir(), `repo-harness-init-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const previousCwd = process.cwd();
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);
      process.chdir(repo);

      const result = runInit({
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        codegraph: false,
      });

      expect(result.exitCode).toBe(0);
      expect(realpathSync(result.repoRoot)).toBe(realpathSync(repo));
      expect(result.steps.map((step) => step.step)).toContain("apply repo harness");
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
    } finally {
      process.chdir(previousCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("bootstraps core Waza, Mermaid, and cross-review skills for Claude and Codex during update", () => {
    const tmp = join(tmpdir(), `repo-harness-init-skills-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const npxLog = join(tmp, "npx.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      makeExecutable(
        join(fakeBin, "npx"),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> "${npxLog}"\nexit 0\n`,
      );

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        verify: false,
        codegraph: false,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(readFileSync(npxLog, "utf-8")).toContain(
        "-y skills add tw93/Waza -g -a claude-code codex -s think hunt check health -y",
      );
      expect(readFileSync(npxLog, "utf-8")).toContain(
        "-y skills add BfdCampos/dotfiles -g -a claude-code codex -s mermaid -y",
      );
      // Cross-review skills install host-aware: codex-review on Claude, claude-review on Codex.
      expect(existsSync(join(home, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "codex-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-review", "SKILL.md"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("dry-run does not mutate host runtime or apply the target harness", () => {
    const tmp = join(tmpdir(), `repo-harness-init-dry-run-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);

      const result = runInit({
        repo,
        sourceRoot: source,
        apply: false,
        target: "codex",
        env: {
          ...process.env,
          HOME: home,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "sync repo-harness skills")?.detail).toBe("dry-run");
      expect(result.steps.find((step) => step.step === "install host adapters")?.detail).toBe("dry-run");
      expect(existsSync(join(home, ".codex", "hooks.json"))).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("npx cache sources force copy-based installed skill sync", () => {
    const tmp = join(tmpdir(), `repo-harness-init-npx-${Date.now()}`);
    const source = join(tmp, "_npx", "abc123", "node_modules", "repo-harness");
    const repo = join(tmp, "repo");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      setupFakeSource(source);

      const result = runInit({
        repo,
        sourceRoot: source,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
        codegraph: false,
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "sync repo-harness skills")?.stdout).toContain(
        "sync link=0",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("CLI update --no-codegraph disables the CodeGraph step", () => {
    const tmp = join(tmpdir(), `repo-harness-init-cli-codegraph-${Date.now()}`);
    try {
      mkdirSync(tmp, { recursive: true });
      const res = spawnSync(
        "bun",
        [
          CLI,
          "update",
          "--repo",
          tmp,
          "--dry-run",
          "--no-sync-skill",
          "--no-host-adapters",
          "--no-external-skills",
          "--no-verify",
          "--no-codegraph",
          "--json",
        ],
        {
          cwd: ROOT,
          encoding: "utf-8",
        },
      );

      expect(res.status).toBe(0);
      const result = JSON.parse(res.stdout);
      const codegraphStep = result.steps.find((step: { step: string }) => step.step === "ensure codegraph index");
      expect(codegraphStep?.status).toBe("skipped");
      expect(codegraphStep?.detail).toBe("disabled");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15000);

  test("CLI exposes update help for repo-local refresh", () => {
    const res = spawnSync("bun", [CLI, "update", "--help"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Usage: repo-harness update");
    expect(res.stdout).toContain("--repo <path>");
    expect(res.stdout).toContain("--dry-run");
    expect(res.stdout).toContain("--no-codegraph");
  });

  test("configures CodeGraph MCP only when explicitly requested", () => {
    const tmp = join(tmpdir(), `repo-harness-init-configure-codegraph-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const logFile = join(tmp, "codegraph.log");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, logFile);

      const result = runInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        externalSkills: false,
        verify: false,
        configureCodegraphMcp: true,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "ensure codegraph index")?.detail).toContain(
        "init-index:changed",
      );
      const configureStep = result.steps.find((step) => step.step === "configure codegraph mcp");
      expect(configureStep?.status).toBe("ok");
      expect(configureStep?.detail).toContain("configure-codex:changed");
      expect(configureStep?.detail).toContain("configure-claude:changed");

      const log = readFileSync(logFile, "utf-8");
      expect(log).toContain("codegraph init -i .");
      expect(log).toContain("codegraph install --target codex --location global --yes");
      expect(log).toContain("codegraph install --target claude --location global --yes");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15000);

  test("writes global working rules as an idempotent managed block", () => {
    const tmp = join(tmpdir(), `repo-harness-init-global-rules-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      setupFakeSource(source);
      mkdirSync(join(home, ".codex"), { recursive: true });
      writeFileSync(join(home, ".codex", "AGENTS.md"), "user content\n");

      const first = writeGlobalContextFiles(
        source,
        "both",
        { reportLanguageInstruction: "Use Chinese to report to user." },
        { ...process.env, HOME: home },
      );
      const second = writeGlobalContextFiles(
        source,
        "both",
        { reportLanguageInstruction: "Use Chinese to report to user." },
        { ...process.env, HOME: home },
      );

      expect(first.status).toBe("ok");
      expect(second.detail).toContain("unchanged");
      const codex = readFileSync(join(home, ".codex", "AGENTS.md"), "utf-8");
      const claude = readFileSync(join(home, ".claude", "CLAUDE.md"), "utf-8");
      expect(codex).toContain("user content");
      expect(codex).toContain("<!-- BEGIN: repo-harness global-working-rules -->");
      expect(codex).toContain("- Use Chinese to report to user.");
      expect(claude).toContain("- Use Chinese to report to user.");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("resolves brain roots from REPO_HARNESS_BRAIN_ROOT", () => {
    const tmp = join(tmpdir(), `repo-harness-brain-root-${Date.now()}`);
    try {
      mkdirSync(tmp, { recursive: true });
      const root = configuredBrainRoot({
        ...process.env,
        HOME: join(tmp, "home"),
        REPO_HARNESS_BRAIN_ROOT: "~/custom-brain",
      });
      expect(root).toBe(join(tmp, "home", "custom-brain"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("interactive init collects a plan then calls existing init primitives", async () => {
    const tmp = join(tmpdir(), `repo-harness-init-interactive-${Date.now()}`);
    const source = join(tmp, "source");
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const fakeBin = join(tmp, "bin");
    const npxLog = join(tmp, "npx.log");
    const codegraphLog = join(tmp, "codegraph.log");
    const outputChunks: string[] = [];
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      mkdirSync(fakeBin, { recursive: true });
      setupFakeSource(source);
      writeFakeCodegraph(fakeBin, codegraphLog);
      makeExecutable(join(fakeBin, "npx"), `#!/bin/bash\nprintf '%s\\n' "$*" >> "${npxLog}"\nexit 0\n`);

      const input = new PassThrough();
      ["\n", "3\n", "\n", "\n", "y\n"].forEach((answer, index) => {
        setTimeout(() => input.write(answer), index * 5);
      });
      setTimeout(() => input.end(), 30);
      const output = new Writable({
        write(chunk, _encoding, callback) {
          outputChunks.push(String(chunk));
          callback();
        },
      });
      const result = await runInteractiveInit({
        repo,
        sourceRoot: source,
        syncSkill: false,
        hostAdapters: false,
        verify: false,
        input,
        output,
        env: {
          ...process.env,
          HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          AGENTIC_DEV_CODEGRAPH_ALLOW_REPO_LOCAL: "0",
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.steps.find((step) => step.step === "global working rules")?.status).toBe("ok");
      expect(result.steps.find((step) => step.step === "ensure brain root")?.detail).toBe(join(home, "Documents", "brain"));
      expect(readFileSync(join(home, ".codex", "AGENTS.md"), "utf-8")).toContain("Use English to report to user.");
      expect(readFileSync(codegraphLog, "utf-8")).toContain("codegraph sync .");
      expect(outputChunks.join("")).toContain("CodeGraph=required ensure --init --sync plus global MCP configure");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15000);
});

describe("syncCrossReviewSkills", () => {
  function makeSource(root: string): void {
    mkdirSync(join(root, "assets", "skills", "codex-review"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "codex-review", "SKILL.md"),
      "---\nname: codex-review\n---\n",
    );
    mkdirSync(join(root, "assets", "skills", "claude-review"), { recursive: true });
    writeFileSync(
      join(root, "assets", "skills", "claude-review", "SKILL.md"),
      "---\nname: claude-review\n---\n",
    );
  }

  test("installs host-aware: codex-review to Claude, claude-review to Codex", () => {
    const tmp = join(tmpdir(), `cross-review-both-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });
      makeSource(source);

      const steps = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home });

      expect(steps.every((s) => s.status === "ok")).toBe(true);
      expect(existsSync(join(home, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".codex", "skills", "codex-review", "SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".claude", "skills", "claude-review", "SKILL.md"))).toBe(false);

      const again = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home });
      expect(again.some((s) => /already present/.test(s.detail ?? ""))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("respects target=claude (only codex-review) and target=codex (only claude-review)", () => {
    const tmp = join(tmpdir(), `cross-review-target-${Date.now()}`);
    const source = join(tmp, "source");
    const claudeHome = join(tmp, "home-claude");
    const codexHome = join(tmp, "home-codex");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(claudeHome, { recursive: true });
      mkdirSync(codexHome, { recursive: true });
      makeSource(source);

      syncCrossReviewSkills(source, "claude", { ...process.env, HOME: claudeHome });
      expect(existsSync(join(claudeHome, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(claudeHome, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(false);

      syncCrossReviewSkills(source, "codex", { ...process.env, HOME: codexHome });
      expect(existsSync(join(codexHome, ".codex", "skills", "claude-review", "SKILL.md"))).toBe(true);
      expect(existsSync(join(codexHome, ".claude", "skills", "codex-review", "SKILL.md"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("skips (does not fail) when the bundled source is missing", () => {
    const tmp = join(tmpdir(), `cross-review-missing-${Date.now()}`);
    const source = join(tmp, "source");
    const home = join(tmp, "home");
    try {
      mkdirSync(source, { recursive: true });
      mkdirSync(home, { recursive: true });

      const steps = syncCrossReviewSkills(source, "both", { ...process.env, HOME: home });
      expect(steps.every((s) => s.status !== "failed")).toBe(true);
      expect(steps.some((s) => s.status === "skipped")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

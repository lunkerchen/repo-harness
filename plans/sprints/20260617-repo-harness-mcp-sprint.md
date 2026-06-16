下面内容可直接保存为：

```text
plans/sprints/repo-harness-chatgpt-mcp-connector-mvp.sprint.md
```

# Sprint: repo-harness ChatGPT MCP Connector MVP

## 0. Metadata

```yaml
id: sprint-repo-harness-chatgpt-mcp-connector-mvp
status: planned
prd: plans/prds/repo-harness-chatgpt-mcp-connector.prd.md
target_branch: feature/repo-harness-mcp-connector
primary_agent: codex
secondary_agent: chatgpt-planner
risk_level: medium
default_profile: planner
```

## 1. Sprint Goal

Build the MVP for an internal `repo-harness` MCP sidecar that lets ChatGPT Connector act as a safe planner/reviewer for a repo-harness adopted repository, while Codex remains the executor.

The sprint should deliver:

* `repo-harness mcp serve`
* read-only workflow tools
* planning writer tools
* ChatGPT setup guide generation
* Codex MCP config helper
* Codex Skill installation
* security guardrails
* tests and manual E2E checklist

The MVP must **not** expose arbitrary shell, direct source-code editing, or automatic `codex exec` orchestration by default.

---

## 2. Non-goals

Do not implement these in this sprint:

* [ ] Do not make ChatGPT Web Pro available as a Codex model.
* [ ] Do not implement general-purpose local filesystem MCP access.
* [ ] Do not expose `run_shell` as a public MCP tool.
* [ ] Do not allow ChatGPT to modify application source files through MCP.
* [ ] Do not implement default `run_codex_goal` / `codex exec` runner.
* [ ] Do not automate ChatGPT login, 2FA, admin approval, or browser account actions.
* [ ] Do not store OpenAI, ChatGPT, Codex, tunnel, OAuth, or workspace secrets in git.

---

## 3. Definition of Done

The sprint is complete when all of the following are true:

* [ ] `repo-harness mcp serve --transport stdio --profile planner` starts successfully.
* [ ] `repo-harness mcp serve --transport http --port 8765 --profile planner` starts successfully.
* [ ] HTTP server exposes `/health`.
* [ ] HTTP server exposes `/mcp`.
* [ ] MCP server exposes safe read-only tools.
* [ ] MCP server exposes planning-only write tools.
* [ ] Planner profile cannot read denied paths.
* [ ] Planner profile cannot write application source files.
* [ ] `repo-harness mcp doctor --repo .` reports actionable setup status.
* [ ] `repo-harness mcp setup chatgpt --repo .` generates local config and manual setup guide.
* [ ] `repo-harness mcp setup codex --repo . --scope project` safely patches `.codex/config.toml`.
* [ ] `repo-harness mcp install-skill --repo .` installs the Codex Skill.
* [ ] Unit tests cover path policy, writes, redaction, and config patching.
* [ ] Manual E2E has been run on a sample repo.
* [ ] `.gitignore` prevents local MCP secrets and audit logs from being committed.
* [ ] README or generated guide explains the ChatGPT Connector setup flow.
* [ ] No secrets, local tokens, tunnel URLs, OAuth passphrases, or user auth files are committed.

---

## 4. Agent Operating Rules

Agents working on this sprint must follow these rules:

* [ ] Prefer small, reviewable changes.
* [ ] Preserve existing CLI style and command registration patterns.
* [ ] Do not rewrite unrelated repo-harness architecture.
* [ ] Do not introduce source-code editing through MCP in MVP.
* [ ] Do not bypass repo-harness workflow files.
* [ ] Add tests with each functional module where practical.
* [ ] Keep generated local secrets out of git.
* [ ] Update this sprint checklist as work completes.
* [ ] If blocked, write a blocker note under `.ai/harness/handoff/`.

---

## 5. Expected User Workflow

### 5.1 ChatGPT Planner Flow

User runs locally:

```bash
repo-harness mcp setup chatgpt --repo .
repo-harness mcp serve --repo . --transport http --port 8765 --profile planner
```

User exposes local server through a tunnel, then adds the `/mcp` endpoint in ChatGPT Connector.

In ChatGPT:

```text
Use repo-harness to inspect this repo.
Create a PRD for <feature>.
Do not edit source code.
Write the PRD and prepare a Codex goal prompt.
```

Expected written artifacts:

```text
plans/prds/<feature>.prd.md
.ai/harness/handoff/codex-goal.md
```

### 5.2 Codex Executor Flow

User runs:

```bash
repo-harness mcp setup codex --repo . --scope project
codex
```

Then in Codex:

```text
Use repo-harness-chatgpt-bridge.
Execute the latest ChatGPT-generated Codex goal.
```

Codex reads:

```text
.ai/harness/handoff/codex-goal.md
plans/prds/<feature>.prd.md
docs/spec.md
tasks/current.md
.ai/harness/handoff/resume.md
```

Codex then implements, runs checks, writes review evidence, and updates handoff.

---

# Sprint Backlog

## Epic A: Discovery and Baseline

### A1. Inspect existing CLI architecture

* [ ] Inspect `src/cli/index.ts`.
* [ ] Inspect existing command builders under `src/cli/commands/`.
* [ ] Inspect `run`, `tools`, `brain`, `docs`, `install`, and `adopt` command patterns.
* [ ] Identify current test runner and test layout.
* [ ] Identify package manager and script commands.
* [ ] Confirm how repo root is resolved today.
* [ ] Confirm how repo-harness adopted state is detected today.
* [ ] Confirm how helper scripts are invoked today.

Acceptance criteria:

* [ ] Agent has a short implementation note in `.ai/harness/handoff/mcp-discovery.md`.
* [ ] Note includes command registration pattern.
* [ ] Note includes preferred test command.
* [ ] Note includes risk notes for path handling and config patching.

---

## Epic B: CLI Command Scaffold

### B1. Add `repo-harness mcp` command group

Likely files:

```text
src/cli/commands/mcp.ts
src/cli/index.ts
```

Tasks:

* [ ] Create `buildMcpCommand()`.
* [ ] Add top-level `mcp` command.
* [ ] Register `mcp` in CLI entrypoint.
* [ ] Add `mcp --help`.
* [ ] Add `mcp serve --help`.
* [ ] Add `mcp doctor --help`.
* [ ] Add `mcp setup --help`.
* [ ] Add `mcp install-skill --help`.

Initial command shape:

```bash
repo-harness mcp serve
repo-harness mcp doctor
repo-harness mcp setup chatgpt
repo-harness mcp setup codex
repo-harness mcp install-skill
repo-harness mcp print-chatgpt-guide
```

Acceptance criteria:

* [ ] `repo-harness mcp --help` works.
* [ ] `repo-harness mcp serve --help` works.
* [ ] `repo-harness mcp doctor --help` works.
* [ ] Invalid subcommands produce useful errors.
* [ ] No existing CLI command behavior regresses.

---

## Epic C: Policy, Paths, and Security Core

### C1. Implement policy model

Likely files:

```text
src/cli/mcp/policy.ts
src/cli/mcp/paths.ts
src/cli/mcp/types.ts
```

Tasks:

* [ ] Define `McpProfileName`.
* [ ] Define `McpPolicy`.
* [ ] Define planner profile.
* [ ] Define executor profile.
* [ ] Define future orchestrator profile but keep disabled.
* [ ] Add read allowlist globs.
* [ ] Add write allowlist globs.
* [ ] Add deny globs.
* [ ] Add max file size limit.
* [ ] Add path traversal prevention.
* [ ] Add symlink escape prevention.
* [ ] Add repo-root confinement.
* [ ] Add normalized POSIX-style path matching.

Planner read allowlist:

```text
AGENTS.md
CLAUDE.md
SKILL.md
docs/spec.md
docs/reference-configs/**
plans/**
tasks/current.md
tasks/contracts/**
tasks/reviews/**
tasks/notes/**
.ai/context/**
.ai/harness/handoff/**
.ai/harness/checks/**
```

Planner write allowlist:

```text
plans/prds/**
plans/sprints/**
plans/plan-*.md
.ai/harness/handoff/codex-goal.md
.ai/harness/handoff/chatgpt-plan.md
```

Default denied paths:

```text
.env
.env.*
*.pem
*.key
*.p12
*.pfx
.ssh/**
.git/**
node_modules/**
dist/**
build/**
coverage/**
secrets/**
credentials/**
private/**
.cache/**
.DS_Store
```

Acceptance criteria:

* [ ] Allowed workflow files can be read.
* [ ] Denied files cannot be read.
* [ ] Files outside repo root cannot be read.
* [ ] Symlink escape is blocked.
* [ ] Planner writes are restricted to planning/handoff files.
* [ ] Planner cannot write `src/**`, `app/**`, `packages/**`, `package.json`, lockfiles, or CI config.

---

### C2. Add redaction helpers

Likely files:

```text
src/cli/mcp/redaction.ts
```

Tasks:

* [ ] Add basic secret-like pattern redaction.
* [ ] Redact obvious API keys.
* [ ] Redact bearer tokens.
* [ ] Redact private key blocks.
* [ ] Redact OAuth-style tokens.
* [ ] Apply redaction to tool output errors.
* [ ] Avoid storing raw sensitive content in audit logs.

Acceptance criteria:

* [ ] Tool outputs do not expose redacted patterns.
* [ ] Errors do not print full local secret values.
* [ ] Audit log stores hashes or metadata, not raw prompts/secrets.

---

### C3. Add audit log

Likely files:

```text
src/cli/mcp/audit.ts
```

Tasks:

* [ ] Create `.ai/harness/mcp/` when needed.
* [ ] Write `.ai/harness/mcp/audit.log`.
* [ ] Log timestamp.
* [ ] Log tool name.
* [ ] Log target path when applicable.
* [ ] Log result status.
* [ ] Log input hash instead of raw input.
* [ ] Redact errors.
* [ ] Ensure audit log path is gitignored.

Acceptance criteria:

* [ ] Read tools can log access metadata.
* [ ] Write tools log writes.
* [ ] No raw secret content appears in audit log.
* [ ] Audit logging failure does not crash normal tool execution.

---

## Epic D: MCP Server Core

### D1. Add MCP server factory

Likely files:

```text
src/cli/mcp/server.ts
src/cli/mcp/instructions.ts
```

Tasks:

* [ ] Add MCP server construction.
* [ ] Add server name.
* [ ] Add server version.
* [ ] Add server instructions.
* [ ] Register read-only tools.
* [ ] Register write tools.
* [ ] Apply profile filtering.
* [ ] Add structured error handling.
* [ ] Add JSON-safe outputs.
* [ ] Add tests or smoke tests for server creation.

Server instruction text should communicate:

```text
repo-harness exposes repo-local workflow artifacts, not general filesystem access.
Use it to read product intent, plans, contracts, checks, reviews, and handoff.
For ChatGPT, act as planner/reviewer: write PRDs, sprints, plans, and Codex goal prompts.
Do not edit application source through this server. Codex is the executor.
Before writing a plan, inspect docs/spec.md, tasks/current.md, latest handoff, and existing plans.
```

Acceptance criteria:

* [ ] Server can be created with planner profile.
* [ ] Server can be created with executor profile.
* [ ] Server rejects unknown profile.
* [ ] Tool list changes according to profile.
* [ ] Instructions are present and concise.

---

### D2. Implement STDIO transport

Likely files:

```text
src/cli/mcp/transports/stdio.ts
```

Tasks:

* [ ] Add `--transport stdio`.
* [ ] Wire MCP server to STDIO transport.
* [ ] Suppress noisy logs on stdout.
* [ ] Send operational logs to stderr.
* [ ] Ensure process exits cleanly.
* [ ] Add smoke test or manual test command.

Command:

```bash
repo-harness mcp serve --repo . --transport stdio --profile planner
```

Acceptance criteria:

* [ ] STDIO transport starts.
* [ ] STDIO transport works with local MCP-compatible clients.
* [ ] No human-readable logs corrupt JSON-RPC stdout.
* [ ] Errors are printed to stderr.

---

### D3. Implement HTTP transport

Likely files:

```text
src/cli/mcp/transports/http.ts
```

Tasks:

* [ ] Add `--transport http`.
* [ ] Add `--host`.
* [ ] Add `--port`.
* [ ] Add `/health`.
* [ ] Add `/mcp`.
* [ ] Bind to `127.0.0.1` by default.
* [ ] Avoid binding to `0.0.0.0` unless explicitly requested.
* [ ] Add basic request size limit.
* [ ] Add graceful shutdown.
* [ ] Add CORS behavior only if needed.
* [ ] Add useful startup output.

Command:

```bash
repo-harness mcp serve --repo . --transport http --host 127.0.0.1 --port 8765 --profile planner
```

Acceptance criteria:

* [ ] `curl http://127.0.0.1:8765/health` returns healthy JSON.
* [ ] `/mcp` endpoint is available.
* [ ] Default host is localhost.
* [ ] Startup message includes local endpoint.
* [ ] Startup message does not print secrets.

---

## Epic E: Read-only MCP Tools

### E1. `harness_status`

Tasks:

* [ ] Implement `harness_status`.
* [ ] Return repo root.
* [ ] Return adopted state.
* [ ] Return available workflow roots.
* [ ] Return active profile.
* [ ] Return current git branch when available.
* [ ] Mark as read-only.

Acceptance criteria:

* [ ] Tool works in adopted repo.
* [ ] Tool returns useful error in non-adopted repo.
* [ ] Tool does not leak denied paths.

---

### E2. `harness_doctor`

Tasks:

* [ ] Implement `harness_doctor`.
* [ ] Reuse existing doctor logic if available.
* [ ] Return structured JSON.
* [ ] Mark as read-only.
* [ ] Redact local paths if needed only for remote clients.

Acceptance criteria:

* [ ] Tool returns pass/warn/fail sections.
* [ ] Tool handles missing repo-harness artifacts.
* [ ] Tool output is compact enough for model consumption.

---

### E3. `list_workflow_files`

Tasks:

* [ ] Implement allowlist-based workflow file listing.
* [ ] Include relative paths.
* [ ] Include file size.
* [ ] Include modified time if simple.
* [ ] Exclude denied paths.
* [ ] Exclude files above configured max size.
* [ ] Mark as read-only.

Acceptance criteria:

* [ ] Lists `docs/spec.md` when present.
* [ ] Lists `plans/**` when present.
* [ ] Lists `.ai/harness/handoff/**` when present.
* [ ] Does not list `.env`.
* [ ] Does not list `.git/**`.

---

### E4. `read_workflow_file`

Tasks:

* [ ] Implement file read by relative path.
* [ ] Enforce allowlist.
* [ ] Enforce denylist.
* [ ] Enforce max file size.
* [ ] Normalize path.
* [ ] Block `../`.
* [ ] Block symlink escape.
* [ ] Redact output.
* [ ] Mark as read-only.

Acceptance criteria:

* [ ] Can read `docs/spec.md`.
* [ ] Can read files under `plans/`.
* [ ] Can read `.ai/harness/handoff/resume.md`.
* [ ] Cannot read `.env`.
* [ ] Cannot read `../outside`.
* [ ] Cannot read symlink to outside repo.

---

### E5. `latest_handoff`

Tasks:

* [ ] Implement latest handoff discovery.
* [ ] Prefer `.ai/harness/handoff/resume.md`.
* [ ] Include `codex-goal.md` status.
* [ ] Include `chatgpt-plan.md` status.
* [ ] Return concise summary.
* [ ] Mark as read-only.

Acceptance criteria:

* [ ] Tool works when handoff exists.
* [ ] Tool gives useful empty state when missing.
* [ ] Tool does not fail if optional files are absent.

---

### E6. `latest_checks`

Tasks:

* [ ] Implement checks summary.
* [ ] Read `.ai/harness/checks/**`.
* [ ] Return latest check files.
* [ ] Include timestamps and relative paths.
* [ ] Mark as read-only.

Acceptance criteria:

* [ ] Tool works with no check files.
* [ ] Tool returns latest check artifacts when present.
* [ ] Tool output stays concise.

---

## Epic F: Planning Writer Tools

### F1. `write_prd`

Tasks:

* [ ] Implement PRD writer.
* [ ] Accept title.
* [ ] Accept slug.
* [ ] Accept markdown body.
* [ ] Slugify filename.
* [ ] Write to `plans/prds/<slug>.prd.md`.
* [ ] Create directory if needed.
* [ ] Prevent overwrite by default.
* [ ] Support explicit overwrite flag.
* [ ] Add frontmatter.
* [ ] Audit write.
* [ ] Run content validation.

Input shape:

```json
{
  "title": "Add GitHub OAuth Login",
  "slug": "github-oauth-login",
  "body": "...",
  "overwrite": false
}
```

Acceptance criteria:

* [ ] Valid PRD writes to `plans/prds/*.prd.md`.
* [ ] Invalid path is rejected.
* [ ] Overwrite is blocked by default.
* [ ] Audit log records write.
* [ ] Output returns relative path and status.

---

### F2. `write_sprint`

Tasks:

* [ ] Implement sprint writer.
* [ ] Accept title.
* [ ] Accept slug.
* [ ] Accept markdown body.
* [ ] Write to `plans/sprints/<slug>.sprint.md`.
* [ ] Create directory if needed.
* [ ] Prevent overwrite by default.
* [ ] Add frontmatter.
* [ ] Audit write.

Acceptance criteria:

* [ ] Valid sprint writes to `plans/sprints/*.sprint.md`.
* [ ] Overwrite requires explicit flag.
* [ ] Planner profile can write sprint.
* [ ] Planner profile cannot write outside `plans/sprints/**`.

---

### F3. `write_plan`

Tasks:

* [ ] Implement implementation plan writer.
* [ ] Accept title.
* [ ] Accept slug.
* [ ] Accept markdown body.
* [ ] Write to `plans/plan-<slug>.md`.
* [ ] Prevent overwrite by default.
* [ ] Add frontmatter.
* [ ] Audit write.

Acceptance criteria:

* [ ] Writes only `plans/plan-*.md`.
* [ ] Rejects nested arbitrary paths.
* [ ] Output includes relative path.

---

### F4. `write_codex_goal`

Tasks:

* [ ] Implement Codex goal writer.
* [ ] Write only `.ai/harness/handoff/codex-goal.md`.
* [ ] Accept markdown body.
* [ ] Validate required sections.
* [ ] Prevent empty or tiny goals.
* [ ] Include source-of-truth references.
* [ ] Include scope.
* [ ] Include required checks.
* [ ] Include done criteria.
* [ ] Include handoff update requirement.
* [ ] Audit write.

Required sections:

```text
# Codex Goal
## Source of truth
## Role
## Scope
## Required workflow
## Required checks
## Done when
```

Acceptance criteria:

* [ ] Valid goal writes successfully.
* [ ] Missing required sections are rejected with actionable error.
* [ ] Goal path is fixed and cannot be changed by model input.
* [ ] Audit log records write.

---

### F5. `append_handoff_note`

Tasks:

* [ ] Implement handoff note appender.
* [ ] Append to `.ai/harness/handoff/chatgpt-plan.md`.
* [ ] Add timestamp header.
* [ ] Add actor field.
* [ ] Add concise note body.
* [ ] Audit write.

Acceptance criteria:

* [ ] Notes append without overwriting existing content.
* [ ] Notes are timestamped.
* [ ] Notes remain inside allowed handoff path.

---

### F6. `run_workflow_check`

Tasks:

* [ ] Implement fixed workflow check runner.
* [ ] Do not expose arbitrary command input.
* [ ] Run existing repo-harness workflow check helper.
* [ ] Capture stdout/stderr.
* [ ] Redact output.
* [ ] Return exit code.
* [ ] Apply timeout.
* [ ] Audit execution.

Allowed command should be fixed, for example:

```bash
repo-harness run check-task-workflow -- --strict
```

Acceptance criteria:

* [ ] Tool runs only the fixed workflow check.
* [ ] Tool does not accept arbitrary shell.
* [ ] Tool returns structured success/failure.
* [ ] Timeout is enforced.

---

## Epic G: ChatGPT Setup Automation

### G1. Local MCP config generation

Likely files:

```text
src/cli/mcp/setup/chatgpt.ts
src/cli/mcp/config.ts
```

Tasks:

* [ ] Create `.repo-harness/` if missing.
* [ ] Generate `.repo-harness/mcp.local.json`.
* [ ] Generate auth passphrase or token if selected.
* [ ] Store secret only in local ignored file or environment instruction.
* [ ] Add `.repo-harness/mcp.local.json` to `.gitignore`.
* [ ] Add `.repo-harness/mcp.tokens.json` to `.gitignore`.
* [ ] Add `.ai/harness/mcp/audit.log` to `.gitignore`.
* [ ] Print next-step commands.

Command:

```bash
repo-harness mcp setup chatgpt --repo .
```

Acceptance criteria:

* [ ] Setup creates local config.
* [ ] Setup does not commit secrets.
* [ ] Setup prints server start command.
* [ ] Setup prints tunnel instruction.
* [ ] Setup prints guide path.

---

### G2. Generate ChatGPT manual guide

Likely files:

```text
src/cli/mcp/setup/guide.ts
docs/repo-harness-chatgpt-mcp-setup.md
```

Tasks:

* [ ] Generate `docs/repo-harness-chatgpt-mcp-setup.md`.
* [ ] Include prerequisites.
* [ ] Include server start command.
* [ ] Include tunnel example.
* [ ] Include ChatGPT Connector steps.
* [ ] Include test prompt.
* [ ] Include PRD-generation prompt.
* [ ] Include Codex handoff prompt.
* [ ] Include troubleshooting.
* [ ] Include security notes.
* [ ] Avoid embedding secrets in guide.

Acceptance criteria:

* [ ] Guide is generated.
* [ ] Guide is safe to commit.
* [ ] Guide includes copy-paste commands.
* [ ] Guide clearly marks manual ChatGPT UI steps.

---

### G3. `print-chatgpt-guide`

Tasks:

* [ ] Add command:

```bash
repo-harness mcp print-chatgpt-guide --repo .
```

* [ ] Print the same instructions to stdout.
* [ ] Support `--write` to write guide file.
* [ ] Support `--endpoint <url>` to include known tunnel endpoint.
* [ ] Do not print auth secret unless explicit `--show-secret` is provided.
* [ ] Prefer not to implement `--show-secret` unless necessary.

Acceptance criteria:

* [ ] Command works without tunnel.
* [ ] Command works with provided endpoint.
* [ ] Output is usable as human tutorial.

---

## Epic H: Codex Setup Automation

### H1. Patch `.codex/config.toml`

Likely files:

```text
src/cli/mcp/setup/codex.ts
src/cli/mcp/setup/toml.ts
```

Tasks:

* [ ] Detect existing `.codex/config.toml`.
* [ ] Create `.codex/` if missing.
* [ ] Preserve unrelated config.
* [ ] Add or update `[mcp_servers.repo_harness]`.
* [ ] Use STDIO by default.
* [ ] Add `enabled_tools`.
* [ ] Add approval mode.
* [ ] Create backup before patching.
* [ ] Support `--dry-run`.
* [ ] Support `--scope project`.
* [ ] Optionally support `--scope user` later.

Default config:

```toml
[mcp_servers.repo_harness]
command = "repo-harness"
args = [
  "mcp",
  "serve",
  "--repo",
  ".",
  "--transport",
  "stdio",
  "--profile",
  "executor"
]
enabled_tools = [
  "harness_status",
  "read_workflow_file",
  "latest_handoff",
  "latest_checks",
  "write_codex_goal",
  "run_workflow_check"
]
default_tools_approval_mode = "prompt"
```

Acceptance criteria:

* [ ] `.codex/config.toml` is created if absent.
* [ ] Existing config is preserved.
* [ ] Backup is created before modification.
* [ ] Dry run prints planned patch.
* [ ] Config uses relative repo path when safe.
* [ ] No secrets are written.

---

### H2. Validate Codex setup

Tasks:

* [ ] Add Codex checks to `mcp doctor`.
* [ ] Check `codex` command availability.
* [ ] Check `.codex/config.toml` presence.
* [ ] Check `repo_harness` MCP server entry.
* [ ] Check required enabled tools.
* [ ] Provide next-step command.

Acceptance criteria:

* [ ] Doctor reports Codex configured/unconfigured.
* [ ] Doctor provides exact fix command.
* [ ] Doctor does not fail if Codex is not installed.

---

## Epic I: Codex Skill

### I1. Add Skill template

Likely files:

```text
src/cli/mcp/skill/templates/SKILL.md
src/cli/mcp/skill/templates/references/chatgpt-connector-manual.md
src/cli/mcp/skill/templates/references/workflow.md
```

Tasks:

* [ ] Create Skill template.
* [ ] Include frontmatter.
* [ ] Define when to use.
* [ ] Define planner/executor boundary.
* [ ] Define setup behavior.
* [ ] Define execution behavior.
* [ ] Define computer-use safety rules.
* [ ] Define handoff update requirements.
* [ ] Define secrets handling rules.

Skill frontmatter:

```markdown
---
name: repo-harness-chatgpt-bridge
description: Use when setting up or operating the repo-harness ChatGPT MCP Connector, bridging ChatGPT planning artifacts into Codex execution through repo-harness PRDs, sprints, checks, and handoffs.
---
```

Acceptance criteria:

* [ ] Skill has clear trigger description.
* [ ] Skill tells Codex to read `codex-goal.md`.
* [ ] Skill tells Codex not to handle secrets.
* [ ] Skill tells Codex not to automate ChatGPT login unless explicitly requested.
* [ ] Skill tells Codex to update review evidence and handoff.

---

### I2. Add `install-skill` command

Tasks:

* [ ] Add command:

```bash
repo-harness mcp install-skill --repo .
```

* [ ] Install to:

```text
.agents/skills/repo-harness-chatgpt-bridge/
```

* [ ] Create directories if needed.
* [ ] Preserve existing skill unless `--overwrite`.
* [ ] Support `--dry-run`.
* [ ] Print installed files.

Acceptance criteria:

* [ ] Skill installs into repo.
* [ ] Existing skill is not overwritten by default.
* [ ] Dry run works.
* [ ] No secrets are written.

---

### I3. Computer-use assisted setup instructions

Tasks:

* [ ] Add a reference doc for optional computer-use assisted setup.
* [ ] Clearly mark as experimental.
* [ ] Require user confirmation for browser/account actions.
* [ ] Instruct agent not to type passwords.
* [ ] Instruct agent not to type 2FA codes.
* [ ] Instruct agent not to approve workspace/admin prompts without user confirmation.
* [ ] Instruct agent to stop before final connector creation if unsure.
* [ ] Include manual fallback path.

Acceptance criteria:

* [ ] Skill supports assisted setup safely.
* [ ] Skill does not imply full automation is guaranteed.
* [ ] Manual path remains primary.

---

## Epic J: `mcp doctor`

### J1. Implement doctor command

Likely files:

```text
src/cli/mcp/doctor.ts
```

Command:

```bash
repo-harness mcp doctor --repo .
```

Tasks:

* [ ] Check git repo.
* [ ] Check repo-harness adoption.
* [ ] Check `docs/spec.md`.
* [ ] Check `plans/`.
* [ ] Check `tasks/`.
* [ ] Check `.ai/context/`.
* [ ] Check `.ai/harness/handoff/`.
* [ ] Check `.ai/harness/checks/`.
* [ ] Check local MCP config.
* [ ] Check `.gitignore` entries.
* [ ] Check Codex config.
* [ ] Check Skill installation.
* [ ] Check HTTP server if `--endpoint` is passed.
* [ ] Print human-readable output by default.
* [ ] Support `--json`.

Example JSON shape:

```json
{
  "status": "needs_chatgpt_connector",
  "repo": "/path/to/repo",
  "mcp": {
    "config": "present",
    "planner_profile": "valid"
  },
  "chatgpt": {
    "local_endpoint": "http://127.0.0.1:8765/mcp",
    "public_endpoint": null,
    "manual_steps_required": true
  },
  "codex": {
    "configured": true,
    "skill_installed": true
  },
  "warnings": [
    "ChatGPT requires an HTTPS tunnel before connector setup."
  ]
}
```

Acceptance criteria:

* [ ] Human output is readable.
* [ ] JSON output is machine-readable.
* [ ] Warnings include exact next command.
* [ ] Doctor does not require server to be running unless endpoint check requested.

---

## Epic K: Tests

### K1. Unit tests: path policy

Tasks:

* [ ] Test allowed read path.
* [ ] Test denied read path.
* [ ] Test path traversal.
* [ ] Test symlink escape.
* [ ] Test allowed write path.
* [ ] Test denied source write.
* [ ] Test max file size.
* [ ] Test slug generation.

Acceptance criteria:

* [ ] All policy tests pass.
* [ ] Tests cover Unix-style and platform-native path separators.

---

### K2. Unit tests: writer tools

Tasks:

* [ ] Test `write_prd`.
* [ ] Test `write_sprint`.
* [ ] Test `write_plan`.
* [ ] Test `write_codex_goal`.
* [ ] Test overwrite prevention.
* [ ] Test validation error messages.
* [ ] Test audit entries.

Acceptance criteria:

* [ ] Writer tools only write allowed paths.
* [ ] Invalid inputs produce actionable errors.
* [ ] Audit log is written without secrets.

---

### K3. Unit tests: config patching

Tasks:

* [ ] Test new `.codex/config.toml`.
* [ ] Test patch existing config.
* [ ] Test preserve unrelated config.
* [ ] Test backup creation.
* [ ] Test dry run.
* [ ] Test repeated setup idempotency.

Acceptance criteria:

* [ ] Running setup twice does not duplicate config.
* [ ] Existing config remains valid.
* [ ] Dry run does not write files.

---

### K4. Integration tests: server

Tasks:

* [ ] Start STDIO server smoke test.
* [ ] Start HTTP server smoke test.
* [ ] Check `/health`.
* [ ] Check MCP tool listing if test harness supports it.
* [ ] Call read-only tool.
* [ ] Call writer tool against temp repo.
* [ ] Verify denied paths remain blocked.

Acceptance criteria:

* [ ] HTTP server starts and stops cleanly.
* [ ] STDIO server does not print logs to stdout.
* [ ] Tool calls work in temp repo.

---

### K5. Manual E2E test

Use a disposable repo.

Steps:

* [ ] Create or select sample repo.
* [ ] Run `repo-harness adopt --repo .` if needed.
* [ ] Run `repo-harness mcp setup chatgpt --repo .`.
* [ ] Run `repo-harness mcp setup codex --repo . --scope project`.
* [ ] Run `repo-harness mcp install-skill --repo .`.
* [ ] Start HTTP MCP server.
* [ ] Start tunnel manually.
* [ ] Add ChatGPT Connector manually.
* [ ] Ask ChatGPT to call `harness_status`.
* [ ] Ask ChatGPT to read latest handoff.
* [ ] Ask ChatGPT to write a test PRD.
* [ ] Ask ChatGPT to write Codex goal.
* [ ] Open Codex.
* [ ] Ask Codex to use the Skill and read latest goal.
* [ ] Confirm Codex can follow goal.
* [ ] Confirm review evidence and handoff are updated.

Acceptance criteria:

* [ ] ChatGPT can read workflow state.
* [ ] ChatGPT can write PRD.
* [ ] ChatGPT can write Codex goal.
* [ ] Codex can consume the goal.
* [ ] No source files are modified by ChatGPT MCP tools.
* [ ] No secrets appear in logs.

---

## Epic L: Documentation

### L1. Add generated setup guide content

Tasks:

* [ ] Add guide template.
* [ ] Include setup commands.
* [ ] Include ChatGPT Connector manual steps.
* [ ] Include tunnel explanation.
* [ ] Include test prompts.
* [ ] Include common errors.
* [ ] Include security warnings.
* [ ] Include fallback workflow when ChatGPT MCP is unavailable.

Acceptance criteria:

* [ ] Guide can be generated by CLI.
* [ ] Guide can be committed safely.
* [ ] Guide is enough for manual setup without reading source code.

---

### L2. Add README section or docs link

Tasks:

* [ ] Add short README mention.
* [ ] Link to generated guide.
* [ ] Explain planner/executor split.
* [ ] Explain that ChatGPT does not execute code in MVP.
* [ ] Explain Codex remains executor.
* [ ] Explain MCP support depends on user ChatGPT workspace availability.

Acceptance criteria:

* [ ] README update is concise.
* [ ] README does not overpromise automatic ChatGPT configuration.
* [ ] README positions MCP as optional sidecar.

---

## Epic M: Release Hygiene

### M1. Git hygiene

Tasks:

* [ ] Ensure `.repo-harness/mcp.local.json` is ignored.
* [ ] Ensure `.repo-harness/mcp.tokens.json` is ignored.
* [ ] Ensure `.ai/harness/mcp/audit.log` is ignored.
* [ ] Ensure generated guide does not contain secrets.
* [ ] Ensure test fixtures do not contain fake realistic secrets unless redacted.
* [ ] Review `git diff` for accidental local paths or tokens.

Acceptance criteria:

* [ ] `git status` contains only intended files.
* [ ] No local machine secrets or private paths are committed.
* [ ] No tunnel URL is committed unless it is clearly placeholder text.

---

### M2. Final validation commands

Run project-appropriate checks. Minimum:

```bash
repo-harness mcp doctor --repo .
repo-harness mcp setup chatgpt --repo . --dry-run
repo-harness mcp setup codex --repo . --scope project --dry-run
repo-harness mcp install-skill --repo . --dry-run
```

Also run the project’s standard checks:

```bash
bun test
bun run typecheck
bun run lint
```

If commands differ, record actual commands in handoff.

Acceptance criteria:

* [ ] All available tests pass.
* [ ] Typecheck passes.
* [ ] Lint passes or known unrelated failures are documented.
* [ ] Manual smoke test result is documented.

---

# Implementation Order

Agents should follow this sequence unless blocked:

1. [ ] Discovery and baseline.
2. [ ] CLI scaffold.
3. [ ] Policy and path security.
4. [ ] MCP server core.
5. [ ] STDIO transport.
6. [ ] HTTP transport.
7. [ ] Read-only tools.
8. [ ] Writer tools.
9. [ ] `mcp doctor`.
10. [ ] ChatGPT setup and guide generation.
11. [ ] Codex config setup.
12. [ ] Codex Skill installation.
13. [ ] Tests.
14. [ ] Documentation.
15. [ ] Manual E2E.
16. [ ] Final cleanup and handoff.

---

# Agent Task Cards

## Task Card 1: CLI Scaffold

```yaml
id: mcp-cli-scaffold
priority: P0
status: todo
owner: codex
```

Checklist:

* [ ] Create `src/cli/commands/mcp.ts`.
* [ ] Add `buildMcpCommand()`.
* [ ] Register command in CLI entrypoint.
* [ ] Add subcommands with placeholder actions.
* [ ] Verify help output.
* [ ] Add basic smoke test if test framework exists.

Done when:

* [ ] `repo-harness mcp --help` works.
* [ ] `repo-harness mcp serve --help` works.
* [ ] Existing commands still work.

---

## Task Card 2: Policy Engine

```yaml
id: mcp-policy-engine
priority: P0
status: todo
owner: codex
```

Checklist:

* [ ] Implement profile types.
* [ ] Implement planner profile.
* [ ] Implement executor profile.
* [ ] Implement denylist.
* [ ] Implement allowlist matching.
* [ ] Implement path normalization.
* [ ] Implement repo-root confinement.
* [ ] Implement symlink escape check.
* [ ] Add tests.

Done when:

* [ ] Planner can read workflow files.
* [ ] Planner cannot read secrets.
* [ ] Planner cannot write source files.

---

## Task Card 3: MCP Server Core

```yaml
id: mcp-server-core
priority: P0
status: todo
owner: codex
```

Checklist:

* [ ] Add server factory.
* [ ] Add instructions.
* [ ] Register placeholder tools.
* [ ] Add STDIO transport.
* [ ] Add HTTP transport.
* [ ] Add `/health`.
* [ ] Add structured errors.

Done when:

* [ ] STDIO server starts.
* [ ] HTTP server starts.
* [ ] `/health` responds.
* [ ] Tools are listed by MCP client.

---

## Task Card 4: Read-only Tools

```yaml
id: mcp-read-tools
priority: P0
status: todo
owner: codex
```

Checklist:

* [ ] Implement `harness_status`.
* [ ] Implement `harness_doctor`.
* [ ] Implement `list_workflow_files`.
* [ ] Implement `read_workflow_file`.
* [ ] Implement `latest_handoff`.
* [ ] Implement `latest_checks`.
* [ ] Add tests.

Done when:

* [ ] ChatGPT can inspect workflow state.
* [ ] Denied paths remain blocked.
* [ ] Outputs are concise and redacted.

---

## Task Card 5: Planning Writer Tools

```yaml
id: mcp-planning-writers
priority: P0
status: todo
owner: codex
```

Checklist:

* [ ] Implement `write_prd`.
* [ ] Implement `write_sprint`.
* [ ] Implement `write_plan`.
* [ ] Implement `write_codex_goal`.
* [ ] Implement `append_handoff_note`.
* [ ] Implement `run_workflow_check`.
* [ ] Add validation.
* [ ] Add audit logging.
* [ ] Add tests.

Done when:

* [ ] ChatGPT can write PRD.
* [ ] ChatGPT can write Codex goal.
* [ ] ChatGPT cannot write source files.
* [ ] Workflow check can be run through fixed command only.

---

## Task Card 6: ChatGPT Setup

```yaml
id: mcp-chatgpt-setup
priority: P1
status: todo
owner: codex
```

Checklist:

* [ ] Implement `mcp setup chatgpt`.
* [ ] Generate local config.
* [ ] Update `.gitignore`.
* [ ] Generate guide.
* [ ] Print server start command.
* [ ] Print tunnel command example.
* [ ] Print ChatGPT Connector steps.
* [ ] Add dry-run if practical.

Done when:

* [ ] User can run one command and receive all local setup artifacts.
* [ ] ChatGPT UI steps are documented.
* [ ] No secrets are written to tracked files.

---

## Task Card 7: Codex Setup

```yaml
id: mcp-codex-setup
priority: P1
status: todo
owner: codex
```

Checklist:

* [ ] Implement `mcp setup codex`.
* [ ] Create `.codex/config.toml` if missing.
* [ ] Preserve existing config.
* [ ] Add `repo_harness` MCP server.
* [ ] Add backup.
* [ ] Add dry-run.
* [ ] Add doctor validation.

Done when:

* [ ] Project-level Codex MCP config is generated safely.
* [ ] Running setup twice is idempotent.
* [ ] Existing user config is preserved.

---

## Task Card 8: Codex Skill

```yaml
id: mcp-codex-skill
priority: P1
status: todo
owner: codex
```

Checklist:

* [ ] Create Skill template.
* [ ] Add `SKILL.md`.
* [ ] Add manual setup reference.
* [ ] Add workflow reference.
* [ ] Add computer-use safety rules.
* [ ] Implement `install-skill`.
* [ ] Add dry-run.
* [ ] Add overwrite protection.

Done when:

* [ ] Skill installs into `.agents/skills/repo-harness-chatgpt-bridge/`.
* [ ] Skill tells Codex how to consume `codex-goal.md`.
* [ ] Skill does not encourage unsafe browser automation.

---

## Task Card 9: Doctor and Diagnostics

```yaml
id: mcp-doctor
priority: P1
status: todo
owner: codex
```

Checklist:

* [ ] Implement repo checks.
* [ ] Implement MCP config checks.
* [ ] Implement Codex config checks.
* [ ] Implement Skill checks.
* [ ] Implement guide checks.
* [ ] Add `--json`.
* [ ] Add actionable next steps.

Done when:

* [ ] Doctor explains what is ready.
* [ ] Doctor explains what is missing.
* [ ] Doctor gives exact commands to fix missing setup.

---

## Task Card 10: Final E2E

```yaml
id: mcp-final-e2e
priority: P0
status: todo
owner: codex
```

Checklist:

* [ ] Create disposable test repo.
* [ ] Adopt repo-harness.
* [ ] Run ChatGPT setup.
* [ ] Run Codex setup.
* [ ] Install Skill.
* [ ] Start HTTP MCP server.
* [ ] Verify `/health`.
* [ ] Connect through local MCP test client if available.
* [ ] Manually connect ChatGPT if available.
* [ ] Write sample PRD.
* [ ] Write sample Codex goal.
* [ ] Confirm Codex can read latest goal.
* [ ] Run checks.
* [ ] Update handoff.

Done when:

* [ ] E2E result is documented in `.ai/harness/handoff/mcp-e2e-result.md`.
* [ ] Known limitations are documented.
* [ ] Sprint checklist is updated.

---

# Required File Outputs

By the end of the sprint, expected new or changed files include:

```text
src/cli/commands/mcp.ts
src/cli/mcp/server.ts
src/cli/mcp/instructions.ts
src/cli/mcp/types.ts
src/cli/mcp/policy.ts
src/cli/mcp/paths.ts
src/cli/mcp/redaction.ts
src/cli/mcp/audit.ts
src/cli/mcp/transports/stdio.ts
src/cli/mcp/transports/http.ts
src/cli/mcp/tools/harness-status.ts
src/cli/mcp/tools/harness-doctor.ts
src/cli/mcp/tools/list-workflow-files.ts
src/cli/mcp/tools/read-workflow-file.ts
src/cli/mcp/tools/latest-handoff.ts
src/cli/mcp/tools/latest-checks.ts
src/cli/mcp/tools/write-prd.ts
src/cli/mcp/tools/write-sprint.ts
src/cli/mcp/tools/write-plan.ts
src/cli/mcp/tools/write-codex-goal.ts
src/cli/mcp/tools/append-handoff-note.ts
src/cli/mcp/tools/run-workflow-check.ts
src/cli/mcp/setup/chatgpt.ts
src/cli/mcp/setup/codex.ts
src/cli/mcp/setup/guide.ts
src/cli/mcp/doctor.ts
src/cli/mcp/skill/templates/SKILL.md
src/cli/mcp/skill/templates/references/chatgpt-connector-manual.md
src/cli/mcp/skill/templates/references/workflow.md
```

Potential generated repo files:

```text
docs/repo-harness-chatgpt-mcp-setup.md
.agents/skills/repo-harness-chatgpt-bridge/SKILL.md
.agents/skills/repo-harness-chatgpt-bridge/references/chatgpt-connector-manual.md
.agents/skills/repo-harness-chatgpt-bridge/references/workflow.md
```

Local ignored files:

```text
.repo-harness/mcp.local.json
.repo-harness/mcp.tokens.json
.ai/harness/mcp/audit.log
```

---

# Final Sprint Review Checklist

Before closing the sprint:

* [ ] All P0 task cards are complete.
* [ ] P1 task cards are complete or explicitly deferred.
* [ ] Tests pass.
* [ ] Typecheck passes.
* [ ] Lint passes or unrelated failures are documented.
* [ ] Manual E2E result is documented.
* [ ] README/docs are updated.
* [ ] Generated guide is safe to commit.
* [ ] Codex Skill is safe to commit.
* [ ] `.gitignore` covers local MCP config and audit logs.
* [ ] No secret-like content appears in git diff.
* [ ] No arbitrary shell MCP tool exists.
* [ ] No default Codex runner exists.
* [ ] ChatGPT planner can only write planning/handoff artifacts.
* [ ] Codex executor remains responsible for implementation.
* [ ] Handoff file summarizes completed work, checks, blockers, and next step.

---

# Sprint Closeout Template

At the end of the sprint, write this to:

```text
.ai/harness/handoff/mcp-connector-sprint-closeout.md
```

```markdown
# Sprint Closeout: repo-harness ChatGPT MCP Connector MVP

## Completed

- TBD

## Not completed

- TBD

## Tests run

- TBD

## Manual E2E result

- TBD

## Security review

- Denied paths tested:
- Source write blocking tested:
- Secrets redaction tested:
- Audit log checked:

## Known limitations

- TBD

## Follow-up sprint candidates

- Enable authenticated HTTP mode hardening
- Add better MCP client test harness
- Add optional tunnel helper
- Add optional orchestrator profile
- Add experimental `run_codex_goal`
- Add richer ChatGPT review tools
- Add generated PRD/sprint templates

## Next recommended task

- TBD
```

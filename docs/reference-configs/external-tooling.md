# External Tooling

Generated repos route external tooling by host/runtime shape. Task-level
skill routing lives in `docs/reference-configs/agentic-development-flow.md`.

- `gstack` supplies `office-hours`, `plan-eng-review`, and `plan-design-review`
- `Waza` supplies `/think`, `/hunt`, and `/check` for daily small/medium work
- Codex automation requires `health`, `check`, and `diagram-design` from `~/.codex/skills`
- `gbrain` supports knowledge capture, repo sync, and handoff retrieval
- `CodeGraph` may supply advisory MCP/CLI structure queries for supported source files

Waza is Codex-first in this contract. `~/.codex/skills` is the Codex runtime
source, while `~/.agents/skills` is only the skills CLI staging/cache path used
to receive upstream `tw93/Waza` updates before syncing verified copies into
Codex.

The Codex automation profile is a runtime reference, not a vendored copy. It
requires Waza `health`, Waza `check`, and the standalone `diagram-design` skill
to exist under `~/.codex/skills`; the skill bodies stay owned by their original
installations.

## Detect Safely

Use `bash scripts/check-agent-tooling.sh` for a read-only advisory report.
Init and migration reports run the detector without update checks by default;
set `PROJECT_INITIALIZER_CHECK_TOOLING_UPDATES=1` when that advisory pass should
also compare upstream versions.

Supported flags:

- `--host claude|codex|both`
- `--json`
- `--check-updates`

The detector intentionally avoids side-effecting commands. It does not run:

- `gstack setup`
- `npx skills check`
- `npx skills update`
- `gbrain serve`
- `gbrain sync`

With `--check-updates`, Waza update checks fetch upstream GitHub raw
`SKILL.md` and shared `rules/` files, then compare versions/hashes against each
host path. The detector also compares each host's Waza skill directories and
shared rules against the `~/.agents` staging cache so helper files under
`references/`, `scripts/`, `agents/`, and cross-skill `rules/` links cannot
silently drift. Network failures are reported as `unknown`; the detector never
updates skills.

## Install

### gstack

Claude Code:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup
```

Codex:

```bash
test -d ~/.claude/skills/gstack || git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --host codex
```

### Waza

Both hosts:

```bash
npx -y skills add tw93/Waza -g -a claude-code codex -s check design health hunt learn read think write -y
```

Single host:

```bash
npx -y skills add tw93/Waza -g -a claude-code -s check design health hunt learn read think write -y
```

Replace `claude-code` with `codex` when installing for Codex only.

After installing or updating through the skills CLI, verify Codex has its own
runtime copy:

```bash
for d in check design health hunt learn read think write; do
  rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/
done
mkdir -p ~/.codex/rules
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cp ~/.agents/rules/$f ~/.codex/rules/$f
done
for d in check design health hunt learn read think write; do
  diff -qr ~/.agents/skills/$d ~/.codex/skills/$d
done
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cmp -s ~/.agents/rules/$f ~/.codex/rules/$f
done
```

### gbrain

```bash
bun add -g gbrain
```

### CodeGraph

`CodeGraph` stays advisory-first in this contract. It can speed up agent
exploration for indexed TypeScript and other supported languages, but it does
not replace `.ai/context/capabilities.json`, workflow checks, or shell-script
review.

Do not ask users to copy MCP TOML by hand. The user-facing path is one terminal
command, or explicit authorization for their agent to run the same command:

```bash
npm install -g @colbymchenry/codegraph && mkdir -p ~/.local/bin && ln -sfn "$(npm config get prefix)/bin/codegraph" ~/.local/bin/codegraph && PATH="$HOME/.local/bin:$PATH" codegraph install --target codex --location global --yes
```

This writes global Codex MCP config and may create `~/.codex/AGENTS.md`, so do
not run it automatically from `agentic-dev init`, `migrate`, or `upgrade`.
Restart Codex after the installer finishes so the MCP server is discovered.
If a Codex launch environment still cannot find `codegraph`, an authorized
agent should diagnose `PATH` and the `~/.local/bin/codegraph` shim. Do not make
the user hand-edit MCP TOML as the fallback.

For troubleshooting only, inspect the Codex config snippet without writing:

```bash
codegraph install --print-config codex
```

Project-local indexes are ignored runtime state:

```bash
codegraph init -i .
codegraph status .
```

For this repo, do not treat `codegraph affected` as an authoritative test
selector. Many tests execute scripts by path or subprocess rather than import
edges, so run the repo verification commands instead.

## Update

### gstack

Claude Code:

```bash
cd ~/.claude/skills/gstack && git pull && ./setup
```

Codex:

```bash
cd ~/.claude/skills/gstack && git pull && ./setup --host codex
```

### Waza

```bash
npx -y skills update
for d in check design health hunt learn read think write; do
  rsync -a --delete ~/.agents/skills/$d/ ~/.codex/skills/$d/
done
mkdir -p ~/.codex/rules
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cp ~/.agents/rules/$f ~/.codex/rules/$f
done
for d in check design health hunt learn read think write; do
  diff -qr ~/.agents/skills/$d ~/.codex/skills/$d
done
for f in anti-patterns.md chinese.md durable-context.md english.md; do
  cmp -s ~/.agents/rules/$f ~/.codex/rules/$f
done
```

### gbrain

```bash
gbrain check-update --json
gbrain upgrade
```

### CodeGraph

```bash
npm install -g @colbymchenry/codegraph@latest && mkdir -p ~/.local/bin && ln -sfn "$(npm config get prefix)/bin/codegraph" ~/.local/bin/codegraph && PATH="$HOME/.local/bin:$PATH" codegraph sync . && PATH="$HOME/.local/bin:$PATH" codegraph status .
```

## Manual Knowledge Sync

`gbrain` stays advisory-first in this contract. Manual repo sync is allowed:

```bash
gbrain sync --repo <path>
```

## Default Brain Vault

Long-lived external knowledge should land in the default brain file vault before
or alongside `gbrain` import:

```text
icloud/brain/<project>/*
```

For this repo, use:

```text
icloud/brain/agentic-dev/*
```

`icloud/brain/agentic-dev-skill/*` and `icloud/brain/project-initializer/*`
are legacy alias paths and should remain as redirects/indexes during the
compatibility window.

Keep runtime contracts, hooks, scripts, checks, evidence, and migration state in
the repo. The default brain stores reusable explanations, runbooks, decisions,
and patterns only.

Repo stubs that point to default brain pages are indexed in
`.ai/harness/brain-manifest.json`. Run this check after changing those stubs:

```bash
bash scripts/check-brain-manifest.sh
```

## Why gbrain MCP Stays Off by Default

- `gbrain` is useful even when only the CLI is healthy.
- Local MCP endpoints are more failure-prone than the CLI health path.
- The policy keeps `gbrain` as a candidate MCP entry, not a required runtime dependency.
- Re-enable MCP only after the local host config is explicitly updated and `gbrain doctor --json` is healthy enough for your workflow.

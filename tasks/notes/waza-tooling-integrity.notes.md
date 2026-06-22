# Waza Tooling Integrity

## Decision

`check-agent-tooling.sh` now treats a Waza install as a directory-level runtime
bundle, not only a set of `SKILL.md` files.

## Rationale

Waza upstream can add helper files under skill-local `references/`, `scripts/`,
or `agents/`, and newer skill bodies can reference shared files under
`../../rules/`. A `SKILL.md`-only hash check can report `up-to-date` while the
runtime still has broken local references.

## Tradeoff

The detector still stays read-only and avoids a full GitHub tree clone. It
compares host installs against the `~/.agents` staging cache for full skill
directories, and compares the current shared Waza `rules/` files against both
staging and upstream raw URLs. If upstream introduces a new shared top-level
directory, the detector needs a small constant update instead of discovering the
entire repository tree dynamically.

## 2026-06-23 Runtime Refresh Repair

`repo-harness install` must sync Waza shared rules to every selected host, not
only run `skills add` for `think`, `hunt`, `check`, and `health`. The setup
checker already treats `rules/*.md` as part of the Waza runtime bundle, so a
host can report `update-available` after a successful install if the installer
does not copy `~/.agents/rules` into `~/.codex/rules` and `~/.claude/rules`.

The repair keeps the detector read-only, but makes its remediation command
host-aware and makes the installer perform the same shared-rule sync it expects
to verify. Verified locally with `repo-harness install --target both --no-cli`,
`repo-harness setup check --target codex --check-updates --json`,
`repo-harness setup check --target claude --check-updates --json`,
`bun run check:type`, and `bun test`.

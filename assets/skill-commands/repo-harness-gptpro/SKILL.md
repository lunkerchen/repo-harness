---
name: repo-harness-gptpro
description: Direct GPT Pro consult facade for repo-harness. Use when the user asks for repo-harness:gptpro, GPT Pro advice, GPT Pro review, gptpro consult, or continuing/opening a GPT Pro browser session through the Oracle-first local ChatGPT Web browser provider.
when_to_use: "repo-harness-gptpro, repo-harness:gptpro, gptpro, gptpro consult, GPT Pro consult, GPT Pro review, browser_session consult, browser-session consult, continue GPT Pro session"
---

# repo-harness-gptpro

Use this command when the user wants local Codex to consult GPT Pro through the repo-harness ChatGPT Web browser provider. Oracle is the default main path; native is deprecated and bridge is experimental/explicit-only.

Use GPT Pro language with the user. Treat the `browser-*` command names as implementation details:

| User-facing action | Engine command |
| --- | --- |
| `gptpro consult` | `repo-harness chatgpt browser-consult` |
| `gptpro continue` | `repo-harness chatgpt browser-followup` |
| `gptpro read` | `repo-harness chatgpt browser-session` |
| `gptpro open` | `repo-harness chatgpt browser-open` |
| `gptpro list` | `repo-harness chatgpt browser-list` |

## Protocol

1. Confirm the target repo path with `git rev-parse --show-toplevel` or the user's explicit path. Preserve unrelated dirty worktree state.
2. Verify GPT Pro browser readiness before any real consult:
   `repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json`
3. If Oracle is missing, install or point to a pinned `oracle` CLI (`--oracle-bin` or `REPO_HARNESS_ORACLE_BIN`) before a real consult. Do not silently fall back to another provider.
4. If Oracle doctor reports `ORACLE_INCOMPATIBLE`, stop and report the missing capabilities from `oracle.missingCapabilities`; do not run a consult that would pass unsupported Oracle flags.
5. If a repo-local ChatGPT profile binding exists, keep it in the Oracle path. The real consult should use the selected profile cookie DB (for example `Profile 1/Cookies`) and must not silently fall back to the default Chrome/Oracle browser profile.
6. If the user provides an existing GPT Pro session id, inspect it with:
   `repo-harness chatgpt browser-session --repo <repo> <sessionId>`
7. Continue an existing GPT Pro conversation with:
   `repo-harness chatgpt browser-followup --repo <repo> --session <sessionId> --prompt <prompt>`
8. Open the saved GPT Pro conversation when the user asks to view it:
   `repo-harness chatgpt browser-open --repo <repo> <sessionId>`
9. Start a new GPT Pro consult with GPT Pro wording in the report, while running the browser engine underneath. Keep GPT Pro replies under `.ai/harness/handoff/gptpro/`, never reuse a fixed output filename, and include a timestamp plus short slug so local output cannot be confused with a previous ChatGPT session:
   `stamp="$(date -u +%Y%m%dT%H%M%SZ)"; slug="<short-purpose>"; mkdir -p .ai/harness/handoff/gptpro; out=".ai/harness/handoff/gptpro/gptpro-${stamp}-${slug}.md"; repo-harness chatgpt browser-consult --repo <repo> --provider oracle --model gpt-5.5-pro --title "gptpro-${stamp}-${slug}" --prompt <prompt> --write-output "$out"`
10. Use `--dry-run` first when attaching files, then run the real consult only after the prompt bundle and allowed paths are clear.
11. When the user asks for a reasoning mode, pass repo-harness `--thinking <light|standard|extended|heavy>` only after `browser-doctor --provider oracle` reports `browserThinkingTime:true`; repo-harness maps it to Oracle `--browser-thinking-time`.
12. Report the GPT Pro result with: session id, timestamped output path, conversation URL if present, whether it was a new consult or follow-up, and any visible-browser blocker.

## Research Promotion

- Treat `.ai/harness/handoff/gptpro/*.md` as raw local GPT Pro evidence. These files are timestamped and ignored so repeated reviews do not collide or pollute tracked workflow handoff files.
- When a GPT Pro result contains durable repo knowledge, create or update `docs/researches/YYYYMMDD-<topic>.md` with a curated synthesis instead of copying the raw answer as authority.
- The research note should include the conclusion, key findings, implementation implications, open questions, and a short provenance block: raw artifact path, repo-harness `sessionId`, upstream provider session id when present, requested model, capture timestamp, and conversation URL when available.
- Keep task-local decisions in `tasks/notes/` and repeated correction rules in `tasks/lessons.md`; `docs/researches/` is for stable cross-task knowledge.

## Failure Modes

- If `browser-doctor --provider oracle` reports `ORACLE_NOT_INSTALLED`, install or configure a pinned Oracle CLI and rerun doctor before a real consult.
- If Oracle reports `ORACLE_PROFILE_COOKIE_NOT_FOUND`, fix the selected Chrome profile binding before retrying; do not let the run proceed against the default profile.
- If Oracle reports `ORACLE_CAPTURE_INCOMPLETE`, do not auto-retry on native or bridge; the prompt may already have been submitted. Reattach through the saved provider session when available.
- Use bridge only when the user explicitly asks for the experimental bridge path. If bridge consult reports `CHATGPT_BRIDGE_EXTENSION_NOT_CONNECTED`, tell the user to run `browser-bind --open`, load the unpacked extension, open ChatGPT, and retry.
- If ChatGPT Web needs login, captcha, SSO, workspace selection, or manual verification, report the blocker and ask the user to complete it in the visible browser.
- If the user asks for `gptpro_mcp`, Connector setup, or ChatGPT -> local repo access, route to `repo-harness:gptpro_setup`; this command is for local -> GPT Pro consults.
- If a session id is invalid or missing, list recent GPT Pro sessions with `repo-harness chatgpt browser-list --repo <repo>` and ask for the intended session.
- If files include secrets, denied paths, symlink escapes, or oversized prompt bundles, preserve the failed dry-run evidence and do not run the real consult.

## Boundaries

- Does not rename or replace the underlying `repo-harness chatgpt browser-*` CLI commands; it only presents GPT Pro wording at the skill layer.
- Does not configure MCP Connector, HTTPS tunnels, OAuth passphrases, or bearer tokens; use `repo-harness:gptpro_setup` for setup.
- Does not use `oracle-mcp` as the default runtime provider; repo-harness needs the Oracle CLI path for per-run isolation and `--write-output` capture authority.
- Does not request or handle ChatGPT passwords, 2FA codes, cookies, browser storage, or session tokens.
- Does not use ChatGPT Pro as an OpenAI API key, API quota, or billing surface.
- Does not treat raw GPT Pro replies as durable repo documentation until they have been distilled into `docs/researches/` with provenance.
- Does not treat GPT Pro advice as implementation authority; Codex still owns repo edits and verification.

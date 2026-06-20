# 2026-06-20 GPT Pro Deep Research MCP trigger notes

- User-provided ChatGPT Web evidence shows Pro MCP becomes available when the composer has **Deep research** enabled and the recorded Connector chip selected.
- User-provided ChatGPT Web evidence also shows a GitHub app lane where Pro can select an exact hosted repository from the composer. This is useful for pushed repo/PR review but is not proof of local MCP or uncommitted file access.
- Repo-harness now records this as an activation precondition for GPT Pro MCP read-back prompts instead of treating Pro Extended selection or prompt text as sufficient.
- A second bug was found in the local MCP path: GPT could pass a repo-like name such as `my-app/` without knowing its absolute local path, but `repo_path` treated that as a literal relative path. Full-disk authorized MCP reads now resolve such aliases through `discover_harness_repos`.
- CDP/browser-provider work should target semantic UI state first: enable Deep research, then select the recorded Connector, and only use coordinates as a bounded fallback owned by the Oracle/browser automation layer.

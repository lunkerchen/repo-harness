#!/bin/bash
# Shared minimal-change hook adapter helpers.

minimal_change_hook_entry() {
  local lib_dir hooks_dir source_hook_cli

  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  hooks_dir="$(cd "$lib_dir/.." && pwd)"
  source_hook_cli="$(cd "$hooks_dir/../.." 2>/dev/null && pwd)/src/cli/hook-entry.ts"

  if [[ -n "${REPO_HARNESS_HOOK_CLI:-}" && -f "${REPO_HARNESS_HOOK_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_HOOK_CLI" minimal-change "$@"
    return $?
  fi

  if [[ -f "$source_hook_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_hook_cli" minimal-change "$@"
    return $?
  fi

  if [[ -n "${HOOK_REPO_ROOT:-}" && -f "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" ]] && command -v bun >/dev/null 2>&1; then
    bun "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" minimal-change "$@"
    return $?
  fi

  if command -v repo-harness-hook >/dev/null 2>&1; then
    repo-harness-hook minimal-change "$@"
    return $?
  fi

  return 127
}

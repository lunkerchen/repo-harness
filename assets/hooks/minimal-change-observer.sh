#!/bin/bash
# Minimal-change objective signal observer — PostToolUse on Edit|Write.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/minimal-change.sh"

file_path="$(hook_get_file_path "${1:-}")"
[[ -z "$file_path" ]] && exit 0

if output="$(minimal_change_hook_entry signals --phase post-edit --path "$file_path" 2>&1 >/dev/null)"; then
  :
else
  [[ -n "$output" ]] && printf 'minimal-change observer skipped: %s\n' "$output" >&2
  exit 0
fi

exit 0

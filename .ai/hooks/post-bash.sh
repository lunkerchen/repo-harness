#!/bin/bash
# Post-Bash Hook — PostToolUse on Bash
# Reminds to rewrite (not patch) when tests fail.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

TOOL_OUTPUT="${1:-${TOOL_OUTPUT:-}}"
EXIT_CODE="${2:-${EXIT_CODE:-}}"
COMMAND_TEXT="$(hook_json_get '.tool_input.command' '')"

if [[ -z "$TOOL_OUTPUT" ]]; then
  TOOL_OUTPUT="$(hook_json_get '.tool_output' '')"
fi
if [[ -z "$EXIT_CODE" ]]; then
  EXIT_CODE="$(hook_json_get '.exit_code' '')"
fi

post_bash_output_line_count() {
  local output="$1"
  if [[ -z "$output" ]]; then
    printf '0'
    return
  fi
  printf '%s' "$output" | awk 'END { print NR }'
}

post_bash_broad_command() {
  local command_text="$1"
  local trimmed
  trimmed="$(printf '%s' "$command_text" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"

  [[ -n "$trimmed" ]] || return 1

  if printf '%s\n' "$trimmed" | grep -qE '(^|[;&|][[:space:]]*)find[[:space:]]+\./?([[:space:]]|$)'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '(^|[;&|][[:space:]]*)ls[[:space:]]+-[^;&|]*R'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '^[[:space:]]*rg([[:space:]]+-[-A-Za-z0-9_=]+)*[[:space:]]+[^[:space:]]+[[:space:]]*$'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '^[[:space:]]*grep[[:space:]]+-[A-Za-z]*[Rr][A-Za-z]*([[:space:]]+-[-A-Za-z0-9_=]+)*[[:space:]]+[^[:space:]]+[[:space:]]*$'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '(^|[;&|][[:space:]]*)cat[[:space:]]+([^;&|]*[*?][^;&|]*|\.(/)?([[:space:]]|$)|[^;&|]*[[:space:]][^;&|]*[[:space:]][^;&|]*)'; then
    return 0
  fi

  return 1
}

broad_command=false
recommended_next_tool=""
if post_bash_broad_command "$COMMAND_TEXT"; then
  broad_command=true
  recommended_next_tool="codegraph_context"
fi
output_line_count="$(post_bash_output_line_count "$TOOL_OUTPUT")"

if [[ "$EXIT_CODE" != "0" ]]; then
  if echo "$TOOL_OUTPUT" | grep -qEi "(FAIL|failed|error.*test)"; then
    echo "[PostBash] Tests failed. Reminder: failure = rewrite module, not patching."
  fi
fi

checks_file="$(workflow_checks_file)"
post_bash_checks_file="$(dirname "$checks_file")/post-bash-latest.json"
target_checks_file="$checks_file"
if [[ -f "$checks_file" ]] && grep -Eq '"source"[[:space:]]*:[[:space:]]*"verify-sprint"' "$checks_file"; then
  target_checks_file="$post_bash_checks_file"
fi

mkdir -p "$(dirname "$target_checks_file")"
cat > "$target_checks_file" <<EOF_CHECKS
{
  "source": "post-bash",
  "command": "$(hook_json_escape "$COMMAND_TEXT")",
  "exit_code": ${EXIT_CODE:-0},
  "status": "$([[ "${EXIT_CODE:-0}" = "0" ]] && echo pass || echo fail)",
  "broad_command": ${broad_command},
  "output_line_count": ${output_line_count:-0},
  "recommended_next_tool": "$(hook_json_escape "$recommended_next_tool")",
  "generated_at": "$(date '+%Y-%m-%dT%H:%M:%S%z')"
}
EOF_CHECKS

if [[ "$target_checks_file" != "$checks_file" ]]; then
  echo "[ChecksFile] Preserved ${checks_file}; updated ${target_checks_file}."
else
  echo "[ChecksFile] Updated ${checks_file}."
fi

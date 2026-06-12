#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/new-sprint.sh --slug <slug> [--title <title>]

Creates a program-level sprint backlog under plans/sprints/.
Use scripts/new-plan.sh or scripts/capture-plan.sh for execution plans under plans/.
USAGE_EOF
}

slug=""
title=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      slug="${2:-}"
      shift 2
      ;;
    --title)
      title="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

[[ -n "$slug" ]] || { echo "--slug is required" >&2; usage; exit 1; }
[[ -n "$title" ]] || title="$slug"

exec bash scripts/sprint-backlog.sh init --slug "$slug" --title "$title"

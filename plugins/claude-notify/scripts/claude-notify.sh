#!/usr/bin/env bash
# Cross-platform notifier for Claude Code Notification / Stop hooks.
# Always exits 0 so hook failures never block Claude Code.
set -eu

mode="${1:-need-input}"
project="${CLAUDE_PROJECT_DIR:-$PWD}"
project_name="$(basename "$project")"

case "$mode" in
  need-input) title="${project_name} · Claude 在等你"; body="Claude needs your input" ;;
  done)       title="${project_name} · Claude 任務完成"; body="Task finished" ;;
  *) exit 0 ;;
esac

case "$(uname)" in
  Darwin)
    osascript -e "display notification \"${body}\" with title \"${title}\" sound name \"default\"" >/dev/null 2>&1 || true
    ;;
  Linux)
    command -v notify-send >/dev/null 2>&1 && notify-send "${title}" "${body}" || true
    ;;
esac
exit 0

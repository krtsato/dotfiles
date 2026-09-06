#!/usr/bin/env bash

set -eu

usage() {
  printf 'Usage: %s [--delete] <worktree-path>\n' "$(basename "$0")" >&2
}

mode=dry-run
if [ "${1:-}" = "--delete" ]; then
  mode=delete
  shift
fi

if [ "$#" -ne 1 ]; then
  usage
  exit 64
fi

target_input=$1
if [ ! -d "$target_input" ]; then
  printf 'Error: worktree does not exist: %s\n' "$target_input" >&2
  exit 66
fi

target=$(cd "$target_input" && pwd -P)
repo_root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ] || [ "$(cd "$repo_root" && pwd -P)" != "$target" ]; then
  printf 'Error: path is not a worktree root: %s\n' "$target" >&2
  exit 65
fi

worktree_list=$(git -C "$target" worktree list --porcelain)
main_worktree=$(printf '%s\n' "$worktree_list" | awk '/^worktree / {sub(/^worktree /, ""); print; exit}')
main_worktree=$(cd "$main_worktree" && pwd -P)

if [ "$target" = "$main_worktree" ]; then
  printf 'Error: refusing to clean the main worktree: %s\n' "$target" >&2
  exit 65
fi

if ! printf '%s\n' "$worktree_list" | awk '/^worktree / {sub(/^worktree /, ""); print}' | grep -Fxq "$target"; then
  printf 'Error: path is not registered as a git worktree: %s\n' "$target" >&2
  exit 65
fi

claude_projects_dir=${CLAUDE_PROJECTS_DIR:-"$HOME/.claude/projects"}
session_state_dir=${CLAUDE_WORKTREE_SESSION_STATE_DIR:-"${CODEX_HOME:-$HOME/.codex}/state/claude-worktree-sessions"}
manifest=$(mktemp "${TMPDIR:-/tmp}/claude-worktree-sessions.XXXXXX")
trap 'rm -f "$manifest"' EXIT HUP INT TERM

session_cwd() {
  file=$1
  line=$(rg -m 1 '"cwd"[[:space:]]*:' "$file" 2>/dev/null || true)
  if [ -n "$line" ]; then
    printf '%s\n' "$line" | jq -r '.cwd // empty' 2>/dev/null || true
  fi
}

if [ -d "$claude_projects_dir" ]; then
  find "$claude_projects_dir" -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' -print0 |
    while IFS= read -r -d '' transcript; do
      if [ "$(session_cwd "$transcript")" = "$target" ]; then
        session_id=$(basename "$transcript" .jsonl)
        printf 'native-file\t%s\n' "$transcript" >>"$manifest"
        if [ -f "$transcript.wakatime" ]; then
          printf 'native-file\t%s\n' "$transcript.wakatime" >>"$manifest"
        fi
        session_dir=$(dirname "$transcript")/$session_id
        if [ -d "$session_dir" ]; then
          printf 'native-dir\t%s\n' "$session_dir" >>"$manifest"
        fi
      fi
    done
fi

active=0
if [ -d "$session_state_dir" ]; then
  find "$session_state_dir" -mindepth 1 -maxdepth 1 -type f -name '*.json' -print0 |
    while IFS= read -r -d '' state_file; do
      cwd=$(jq -r '.cwd // empty' "$state_file" 2>/dev/null || true)
      [ "$cwd" = "$target" ] || continue
      lock_dir=${state_file%.json}.lock
      lock_pid=$(cat "$lock_dir/pid" 2>/dev/null || true)
      if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
        printf 'active\t%s\n' "$lock_dir" >>"$manifest"
      else
        printf 'state-file\t%s\n' "$state_file" >>"$manifest"
        if [ -d "$lock_dir" ]; then
          printf 'state-lock\t%s\n' "$lock_dir" >>"$manifest"
        fi
      fi
    done
fi

if grep -q '^active' "$manifest"; then
  active=1
  printf 'Error: active Claude CLI session found for %s:\n' "$target" >&2
  awk -F '\t' '$1 == "active" {print "  " $2}' "$manifest" >&2
fi

if [ "$active" -ne 0 ]; then
  printf 'Wait for the Claude CLI process to finish or stop it, then retry.\n' >&2
  exit 75
fi

count=$(awk -F '\t' '$1 != "active" {count++} END {print count + 0}' "$manifest")
printf 'Claude session cleanup (%s): %s\n' "$mode" "$target"
printf 'Matched artifacts: %s\n' "$count"
awk -F '\t' '$1 != "active" {print "  [" $1 "] " $2}' "$manifest"

if [ "$mode" = dry-run ]; then
  exit 0
fi

while IFS="$(printf '\t')" read -r kind path; do
  case "$kind" in
    native-file | state-file)
      rm -f "$path"
      ;;
    native-dir | state-lock)
      rm -rf "$path"
      ;;
  esac
done <"$manifest"

printf 'Deleted artifacts: %s\n' "$count"

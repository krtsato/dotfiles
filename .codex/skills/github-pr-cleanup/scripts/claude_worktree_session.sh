#!/usr/bin/env bash

set -eu

usage() {
  printf 'Usage: %s --agent <researcher|implementer|reviewer> [--model <sonnet|opus>] [--cwd <worktree-path>] -- <prompt>\n' "$(basename "$0")" >&2
}

agent=
model=sonnet
target_input=$PWD
while [ "$#" -gt 0 ]; do
  case "$1" in
    --agent)
      [ "$#" -ge 2 ] || { usage; exit 64; }
      agent=$2
      shift 2
      ;;
    --model)
      [ "$#" -ge 2 ] || { usage; exit 64; }
      model=$2
      shift 2
      ;;
    --cwd)
      [ "$#" -ge 2 ] || { usage; exit 64; }
      target_input=$2
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      usage
      exit 64
      ;;
  esac
done

case "$agent" in
  researcher | implementer | reviewer) ;;
  *)
    usage
    exit 64
    ;;
esac

case "$model" in
  sonnet | opus) ;;
  *)
    usage
    exit 64
    ;;
esac

if [ "$#" -eq 0 ] || [ ! -d "$target_input" ]; then
  usage
  exit 64
fi

target=$(cd "$target_input" && pwd -P)
repo_root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ] || [ "$(cd "$repo_root" && pwd -P)" != "$target" ]; then
  printf 'Error: path is not a worktree root: %s\n' "$target" >&2
  exit 65
fi

prompt=$*
state_dir=${CLAUDE_WORKTREE_SESSION_STATE_DIR:-"${CODEX_HOME:-$HOME/.codex}/state/claude-worktree-sessions"}
key=$(printf '%s' "$target" | shasum -a 256 | awk '{print $1}')
state_file=$state_dir/$key.json
lock_dir=$state_dir/$key.lock
claude_bin=${CLAUDE_BIN:-claude}

umask 077
mkdir -p "$state_dir"

if [ -d "$lock_dir" ]; then
  lock_pid=$(cat "$lock_dir/pid" 2>/dev/null || true)
  if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
    printf 'Error: Claude session is already running for %s (pid %s)\n' "$target" "$lock_pid" >&2
    exit 75
  fi
  rm -rf "$lock_dir"
fi

if ! mkdir "$lock_dir" 2>/dev/null; then
  printf 'Error: failed to lock Claude session for %s\n' "$target" >&2
  exit 75
fi
printf '%s\n' "$$" >"$lock_dir/pid"
trap 'rm -rf "$lock_dir"' EXIT HUP INT TERM

session_id=
if [ -f "$state_file" ] && [ "$(jq -r '.cwd // empty' "$state_file" 2>/dev/null || true)" = "$target" ]; then
  session_id=$(jq -r '.sessionId // empty' "$state_file" 2>/dev/null || true)
fi

case "$session_id" in
  ????????-????-????-????-????????????) ;;
  *) session_id= ;;
esac

if [ -z "$session_id" ]; then
  session_id=$(uuidgen | tr '[:upper:]' '[:lower:]')
  state_tmp=$state_file.tmp.$$
  jq -n --arg cwd "$target" --arg session_id "$session_id" \
    '{cwd: $cwd, sessionId: $session_id}' >"$state_tmp"
  mv "$state_tmp" "$state_file"
  session_option=--session-id
else
  session_option=--resume
fi

(
  cd "$target"
  "$claude_bin" -p \
    --agent "$agent" \
    --model "$model" \
    --strict-mcp-config \
    --mcp-config '{"mcpServers":{}}' \
    "$session_option" "$session_id" \
    -- "$prompt"
)

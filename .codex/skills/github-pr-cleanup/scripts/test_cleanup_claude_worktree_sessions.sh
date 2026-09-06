#!/usr/bin/env bash

set -eu

script_dir=$(cd "$(dirname "$0")" && pwd -P)
cleanup_script=$script_dir/cleanup_claude_worktree_sessions.sh
fixture=$(mktemp -d "${TMPDIR:-/tmp}/claude-cleanup-test.XXXXXX")
fixture=$(cd "$fixture" && pwd -P)
trap 'rm -rf "$fixture"' EXIT HUP INT TERM

repo=$fixture/repo
worktree=$repo/.worktrees/feature
other_worktree=$repo/.worktrees/other
projects=$fixture/claude-projects
session_state=$fixture/session-state

git init -q "$repo"
git -C "$repo" -c user.name=Test -c user.email=test@example.com commit --allow-empty -qm init
git -C "$repo" worktree add -qb feature "$worktree"
git -C "$repo" worktree add -qb other "$other_worktree"

mkdir -p "$projects/project-a/session-feature" "$projects/project-a/session-other"
mkdir -p "$projects/project-a/memory"
printf '{"cwd":"%s","sessionId":"session-feature"}\n' "$worktree" >"$projects/project-a/session-feature.jsonl"
printf '{"cwd":"%s","sessionId":"session-other"}\n' "$other_worktree" >"$projects/project-a/session-other.jsonl"
printf 'keep\n' >"$projects/project-a/memory/MEMORY.md"

mkdir -p "$session_state"
printf '{"cwd":"%s","sessionId":"11111111-1111-1111-1111-111111111111"}\n' "$worktree" >"$session_state/feature.json"
printf '{"cwd":"%s","sessionId":"22222222-2222-2222-2222-222222222222"}\n' "$other_worktree" >"$session_state/other.json"

CLAUDE_PROJECTS_DIR=$projects CLAUDE_WORKTREE_SESSION_STATE_DIR=$session_state \
  "$cleanup_script" "$worktree" >"$fixture/dry-run.log"
test -f "$projects/project-a/session-feature.jsonl"
test -f "$session_state/feature.json"

CLAUDE_PROJECTS_DIR=$projects CLAUDE_WORKTREE_SESSION_STATE_DIR=$session_state \
  "$cleanup_script" --delete "$worktree" >"$fixture/delete.log"
test ! -e "$projects/project-a/session-feature.jsonl"
test ! -e "$projects/project-a/session-feature"
test ! -e "$session_state/feature.json"
test -f "$projects/project-a/session-other.jsonl"
test -d "$projects/project-a/session-other"
test -f "$projects/project-a/memory/MEMORY.md"
test -f "$session_state/other.json"

if CLAUDE_PROJECTS_DIR=$projects CLAUDE_WORKTREE_SESSION_STATE_DIR=$session_state \
  "$cleanup_script" "$repo" >"$fixture/main.log" 2>&1; then
  printf 'Expected main worktree cleanup to fail\n' >&2
  exit 1
fi

mkdir -p "$session_state/other.lock"
printf '%s\n' "$$" >"$session_state/other.lock/pid"
if CLAUDE_PROJECTS_DIR=$projects CLAUDE_WORKTREE_SESSION_STATE_DIR=$session_state \
  "$cleanup_script" --delete "$other_worktree" >"$fixture/active.log" 2>&1; then
  printf 'Expected active session cleanup to fail\n' >&2
  exit 1
fi
test -f "$projects/project-a/session-other.jsonl"
test -d "$session_state/other.lock"

printf 'All cleanup tests passed\n'

#!/usr/bin/env bash

set -eu

script_dir=$(cd "$(dirname "$0")" && pwd -P)
session_script=$script_dir/claude_worktree_session.sh
fixture=$(mktemp -d "${TMPDIR:-/tmp}/claude-session-test.XXXXXX")
fixture=$(cd "$fixture" && pwd -P)
trap 'rm -rf "$fixture"' EXIT HUP INT TERM

repo=$fixture/repo
worktree=$repo/.worktrees/feature
state_dir=$fixture/state
fake_claude=$fixture/claude
call_log=$fixture/calls.log

git init -q "$repo"
git -C "$repo" -c user.name=Test -c user.email=test@example.com commit --allow-empty -qm init
git -C "$repo" worktree add -qb feature "$worktree"

# shellcheck disable=SC2016
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "CALL\\n" >>"$CLAUDE_TEST_LOG"' \
  'printf "CWD=%s\\n" "$PWD" >>"$CLAUDE_TEST_LOG"' \
  'printf "%s\\n" "$@" >>"$CLAUDE_TEST_LOG"' \
  'printf "ok\\n"' >"$fake_claude"
chmod +x "$fake_claude"

CLAUDE_BIN=$fake_claude CLAUDE_TEST_LOG=$call_log \
  CLAUDE_WORKTREE_SESSION_STATE_DIR=$state_dir \
  "$session_script" --agent reviewer --cwd "$worktree" -- 'Review this change' >"$fixture/first.out"

state_file=$(find "$state_dir" -maxdepth 1 -type f -name '*.json' -print -quit)
session_id=$(jq -r '.sessionId' "$state_file")
test "$(jq -r '.cwd' "$state_file")" = "$worktree"
grep -Fxq 'CWD='"$worktree" "$call_log"
grep -Fxq -- '--session-id' "$call_log"
grep -Fxq -- '--model' "$call_log"
grep -Fxq 'sonnet' "$call_log"
grep -Fxq -- '--strict-mcp-config' "$call_log"
grep -Fxq '{"mcpServers":{}}' "$call_log"
grep -Fxq "$session_id" "$call_log"

if CLAUDE_BIN=$fake_claude CLAUDE_TEST_LOG=$call_log \
  CLAUDE_WORKTREE_SESSION_STATE_DIR=$state_dir \
  "$session_script" --agent reviewer --model haiku --cwd "$worktree" -- 'Reject this model' \
  >"$fixture/invalid-model.out" 2>&1; then
  printf 'Expected unsupported model to fail\n' >&2
  exit 1
fi

CLAUDE_BIN=$fake_claude CLAUDE_TEST_LOG=$call_log \
  CLAUDE_WORKTREE_SESSION_STATE_DIR=$state_dir \
  "$session_script" --agent implementer --model opus --cwd "$worktree" -- 'Apply the fix' >"$fixture/second.out"

test "$(grep -Fxc 'CALL' "$call_log")" -eq 2
grep -Fxq -- '--resume' "$call_log"
grep -Fxq 'opus' "$call_log"
test "$(grep -Fxc "$session_id" "$call_log")" -eq 2
test ! -d "${state_file%.json}.lock"

printf 'All Claude worktree session tests passed\n'

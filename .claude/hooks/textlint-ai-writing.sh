#!/bin/bash
# PostToolUse hook: lint freshly written Markdown with textlint's AI-writing
# preset and hand the findings back to the model so it can revise the prose.
#
# Shared by Claude Code and Codex. Claude Code names the file directly
# (tool_input.file_path / tool_response.filePath); Codex's apply_patch passes
# the whole patch text in tool_input.command, so paths are parsed out of it.
#
# The hook is registered in four Claude Code scopes, so one write can invoke
# this script more than once; the mtime marker makes repeat runs a no-op
# instead of duplicating findings in the model's context.
#
# Exits 0 in every path. A linter must never break the turn.
set -uo pipefail

CONFIG="${TEXTLINT_AI_WRITING_CONFIG:-$HOME/.textlintrc.json}"
MAX_BYTES="${TEXTLINT_AI_WRITING_MAX_BYTES:-4000}"

command -v jq >/dev/null 2>&1 || exit 0
[ -f "$CONFIG" ] || exit 0

# textlint lives in the mise-managed node prefix, which is not on PATH for
# non-login shells. Fall back to the shim directory before giving up.
TEXTLINT="$(command -v textlint 2>/dev/null || true)"
if [ -z "$TEXTLINT" ]; then
  for candidate in "$HOME/.local/share/mise/shims/textlint" \
                   "$HOME/.local/share/mise/installs/node/latest/bin/textlint"; do
    [ -x "$candidate" ] && TEXTLINT="$candidate" && break
  done
fi
[ -n "$TEXTLINT" ] || exit 0

payload="$(cat)"

# Direct path keys, then any *** Update/Add File: lines inside an apply_patch.
candidates="$(printf '%s' "$payload" | jq -r '
  [ .tool_response.filePath?, .tool_input.file_path?, .tool_input.path? ]
  | map(select(. != null and . != "")) | .[]' 2>/dev/null)"

patch_text="$(printf '%s' "$payload" | jq -r '.tool_input.command? // empty' 2>/dev/null)"
if [ -n "$patch_text" ]; then
  patch_paths="$(printf '%s' "$patch_text" \
    | sed -nE 's/^\*\*\* (Update|Add) File: //p')"
  candidates="$(printf '%s\n%s' "$candidates" "$patch_paths")"
fi

cwd="$(printf '%s' "$payload" | jq -r '.cwd? // empty' 2>/dev/null)"

marker_dir="${TMPDIR:-/tmp}/claude-textlint-ai-writing"
mkdir -p "$marker_dir" 2>/dev/null || exit 0

findings=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in
    /*) ;;
    *) [ -n "$cwd" ] && file="$cwd/$file" ;;
  esac
  [ -f "$file" ] || continue
  case "$file" in
    *.md|*.mdx|*.markdown) ;;
    *) continue ;;
  esac

  # Skip the duplicate invocation from another scope: same file, same mtime.
  marker="$marker_dir/$(printf '%s' "$file" | shasum | cut -d' ' -f1)"
  stamp="$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || echo 0)"
  [ "$(cat "$marker" 2>/dev/null)" = "$stamp" ] && continue
  printf '%s' "$stamp" >"$marker"

  out="$("$TEXTLINT" -c "$CONFIG" -f compact "$file" 2>/dev/null)"
  [ -n "$out" ] && findings="${findings}${out}"$'\n'
done <<<"$candidates"

[ -n "$findings" ] || exit 0
findings="$(printf '%s' "$findings" | head -c "$MAX_BYTES")"

context="[textlint / AI っぽい文章の検出] 直前に書いた Markdown に指摘があります。
該当箇所を読み直し、機械的・誇張的に見える表現を自然な日本語に書き直してください。
指摘が妥当でない場合は、そのまま進めて構いません。

${findings}"

# hookSpecificOutput is the Claude Code shape; the flat additionalContext key
# is included for Codex, which documents the field but not the wrapper.
jq -n --arg ctx "$context" '{
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: $ctx },
  additionalContext: $ctx,
  suppressOutput: true
}'

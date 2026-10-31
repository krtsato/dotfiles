#!/bin/bash
# Report which local base-image tags are no longer written anywhere.
#
# usage: find-unused-base-images.sh [root ...]
#   roots default to ~/dev/me and ~/go/src/github.com/awa
#
# Output, one line per tag or finding:
#   used <tag>              the tag is written somewhere
#   unused <tag>            safe to delete
#   held <tag> <file>       not written, but a FROM builds this kind of tag from a variable
#   check-by-eye <file>: <line>
#                           a Dockerfile builds its whole base from a variable; read it
#                           before deleting anything
# Exit 2 with no per-tag lines when a search hits any error: an unreadable
# place may hold a use, so nothing may be deleted on that run.
set -u

if ! command -v rg >/dev/null 2>&1; then
  echo "rg (ripgrep) is required: brew install ripgrep" >&2
  exit 2
fi
if [ "$#" -eq 0 ]; then
  set -- "$HOME/dev/me" "$HOME/go/src/github.com/awa"
fi

families='golang|python|node|golangci/golangci-lint|gcr\.io/distroless/[^:]+|debian|alpine'
# Conversation logs are excluded: a tag mentioned in a chat is not a use.
globs=(-g '!node_modules' -g '!.git'
  -g '!.claude/projects' -g '!.claude/file-history'
  -g '!.codex/sessions' -g '!.codex/archived_sessions')

tags=$(mktemp)
files=$(mktemp)
var_from=$(mktemp)
trap 'rm -f "$tags" "$files" "$var_from"' EXIT

# A Dockerfile's first instruction, after blank lines, comments and ARG, is
# always FROM. That tells a Dockerfile by its content, whatever its name, from
# SQL ("FROM ${table}") or docs that only quote a FROM line.
is_dockerfile() {
  awk '{ l = tolower($0); sub(/^[ \t]+/, "", l) }
       l == "" || l ~ /^#/ || l ~ /^arg[ \t]/ { next }
       { found = (l ~ /^from[ \t]/); exit }
       END { exit !found }' "$1"
}

fail() {
  echo "SEARCH-FAILED($1): delete nothing" >&2
  exit 2
}

docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E "^($families):" | grep -v ':latest$' | sort -u > "$tags"
[ -s "$tags" ] || exit 0

# Pass 1: read every file once and keep those that contain any tag.
# rg skips sockets and pipes, which made a plain grep -r fail on every run.
rc=0
rg --no-ignore --hidden -F -l -0 "${globs[@]}" -f "$tags" -- "$@" > "$files" || rc=$?
case $rc in 0 | 1) ;; *) fail "$rc" ;; esac

# FROM lines whose image is built from a variable never contain the tag text.
# Runner work copies are skipped: they hold the Go toolchain's own sources.
rc=0
rg --no-ignore --hidden -H -N --null -i "${globs[@]}" -g '!actions-runners' \
  '^[[:space:]]*FROM[[:space:]]+(--platform=[^[:space:]]+[[:space:]]+)?[^[:space:]]*[$]' \
  -- "$@" > "$var_from" || rc=$?
case $rc in 0 | 1) ;; *) fail "$rc" ;; esac

held=()     # "family<TAB>file" for FROM node:${V} and the like
while IFS= read -r -d '' path && IFS= read -r line; do
  is_dockerfile "$path" || continue
  token=$(printf '%s\n' "$line" \
    | sed -E 's/^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]]+(--platform=[^[:space:]]+[[:space:]]+)?//; s/[[:space:]].*//')
  if [[ $token == \$* ]]; then
    echo "check-by-eye $path: $line"
  elif family=$(printf '%s\n' "$token" | grep -oE "^($families)(:|@)"); then
    held+=("${family%[:@]}"$'\t'"$path")
  fi
done < "$var_from"

# Pass 2: check each tag against the few files from pass 1. A single -o pass
# cannot do this: when one tag contains another (node:24, node:24.22.1),
# rg reports only one of them at a position and the other would look unused.
while IFS= read -r tag; do
  if [ -s "$files" ] && xargs -0 rg -F -l -e "$tag" -- < "$files" | grep -q .; then
    echo "used $tag"
    continue
  fi
  for h in ${held[@]+"${held[@]}"}; do
    if [ "${tag%%:*}" = "${h%%$'\t'*}" ]; then
      echo "held $tag ${h#*$'\t'}"
      continue 2
    fi
  done
  echo "unused $tag"
done < "$tags"

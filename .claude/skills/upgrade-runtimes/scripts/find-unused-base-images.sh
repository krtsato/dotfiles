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
err=$(mktemp)
trap 'rm -f "$tags" "$files" "$var_from" "$err"' EXIT

# A Dockerfile's first instruction, after blank lines, comments and ARG
# (including its continuation lines), is always FROM. That tells a Dockerfile by
# its content, whatever its name, from SQL ("FROM ${table}") or docs that only
# quote a FROM line. Python's "from x import y" is not a FROM.
# Exit 0 yes, 1 no, anything else means the file could not be read.
is_dockerfile() {
  awk '{ l = tolower($0); sub(/\r$/, "", l); sub(/^[ \t]+/, "", l) }
       cont { cont = (l ~ /[\\`][ \t]*$/); next }
       l == "" || l ~ /^#/ { next }
       l ~ /^arg[ \t]/ { cont = (l ~ /[\\`][ \t]*$/); next }
       { found = (l ~ /^from[ \t]/ && l !~ /^from[ \t]+[^ \t]+[ \t]+import([ \t]|$)/); exit }
       END { exit !found }' "$1"
}

fail() {
  echo "SEARCH-FAILED($1): delete nothing" >&2
  exit 2
}

docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E "^($families):" | grep -v ':latest$' | sort -u > "$tags"
if [ ! -s "$tags" ]; then
  echo "no base-image tags to check"
  exit 0
fi

# Pass 1: read every file once and keep those that contain any tag.
# rg skips sockets and pipes, which made a plain grep -r fail on every run.
rc=0
rg --no-ignore --hidden -F -l -0 "${globs[@]}" -f "$tags" -- "$@" > "$files" || rc=$?
case $rc in 0 | 1) ;; *) fail "$rc" ;; esac

# FROM lines whose image is built from a variable never contain the tag text,
# and a FROM continued with a backslash has no image on its own line.
# Runner work copies are skipped in this search only: they hold the Go
# toolchain's own sources, whose FROM lines are never built here.
rc=0
rg --no-ignore --hidden -H -N --null -i "${globs[@]}" -g '!actions-runners' \
  -e '^[[:space:]]*FROM[[:space:]]+(--platform=[^[:space:]]+[[:space:]]+)?[^[:space:]]*[$]' \
  -e '^[[:space:]]*FROM[[:space:]].*[\\`][[:space:]]*\r?$' \
  -- "$@" > "$var_from" || rc=$?
case $rc in 0 | 1) ;; *) fail "$rc" ;; esac

held=()     # "repo<TAB>file" for FROM node:${V} and the like
checks=()
while IFS= read -r -d '' path && IFS= read -r line; do
  rc=0
  is_dockerfile "$path" || rc=$?
  case $rc in 0) ;; 1) continue ;; *) fail "$rc" ;; esac
  line=${line%$'\r'}
  if [[ $line =~ [\\\`][[:space:]]*$ ]]; then
    # FROM continued on the next line (\ or, under "# escape=`", a backtick):
    # the image is not on this one.
    checks+=("check-by-eye $path: $line")
    continue
  fi
  # The image name, with the registry prefix Docker drops from local tags.
  token=$(printf '%s\n' "$line" \
    | sed -E 's/^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]]+(--platform=[^[:space:]]+[[:space:]]+)?//; s/[[:space:]].*//' \
    | sed -E 's#^(index\.)?docker\.io/##; s#^library/##')
  repo=${token%%[:@]*}
  if [[ $repo == *\$* ]]; then
    # The kind of image itself is a variable (FROM ${BASE}): no way to tell.
    checks+=("check-by-eye $path: $line")
  elif printf '%s\n' "$repo" | grep -qxE "$families"; then
    held+=("$repo"$'\t'"$path")
  fi
done < "$var_from"

# Pass 2: check each tag against the few files from pass 1. A single -o pass
# cannot do this: when one tag contains another (node:24, node:24.22.1),
# rg reports only one of them at a position and the other would look unused.
# A file can vanish between the passes (a worktree removed meanwhile). It
# holds no use any more, so drop it instead of failing the whole run.
live=$(mktemp)
while IFS= read -r -d '' f; do
  [ -e "$f" ] && printf '%s\0' "$f"
done < "$files" > "$live"
mv "$live" "$files"

# Results are printed only after every search has succeeded, so an error in
# this pass can never leave an "unused" line behind.
results=()
while IFS= read -r tag; do
  hit=
  if [ -s "$files" ]; then
    rc=0
    hit=$(xargs -0 rg -F -l -e "$tag" -- < "$files" 2> "$err") || rc=$?
    # xargs reports 123 when any rg call found nothing in its batch; only
    # stderr tells that apart from a read error.
    if [ -s "$err" ] || { [ "$rc" -ne 0 ] && [ "$rc" -ne 123 ]; }; then
      cat "$err" >&2
      fail 2
    fi
  fi
  if [ -n "$hit" ]; then
    results+=("used $tag")
    continue
  fi
  for h in ${held[@]+"${held[@]}"}; do
    if [ "${tag%%:*}" = "${h%%$'\t'*}" ]; then
      results+=("held $tag ${h#*$'\t'}")
      continue 2
    fi
  done
  results+=("unused $tag")
done < "$tags"

for c in ${checks[@]+"${checks[@]}"}; do echo "$c"; done
printf '%s\n' "${results[@]}"

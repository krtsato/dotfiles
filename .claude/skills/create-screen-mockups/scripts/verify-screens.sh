#!/bin/bash
# Check that the screen registry, the exported PNGs and the README agree, and
# (optionally) that every requirement number is mapped to at least one screen.
#
# Usage: verify-screens.sh <screens-dir> [first-req last-req]
#   verify-screens.sh docs/requirements/screens 7 34
#
# Reads <screens-dir>/src/app.js (SCREENS), <screens-dir>/*.png and
# <screens-dir>/README.md (rows starting with | `NN-name.png` |).
# Requirement numbers are matched as 3-digit values (007) in the README rows.
# Exit status is 1 on any mismatch.
set -euo pipefail

DIR="${1:?usage: verify-screens.sh <screens-dir> [first-req last-req]}"
FIRST="${2:-}"
LAST="${3:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0

# Missing inputs must fail loudly; only an empty *match* inside them is tolerated below.
[ -d "$DIR" ] || { echo "FAIL  not a directory: $DIR"; exit 1; }
for f in "$DIR/src/app.js" "$DIR/README.md"; do
  [ -f "$f" ] || { echo "FAIL  missing file: $f"; exit 1; }
done
if { [ -n "$FIRST" ] && [ -z "$LAST" ]; } || { [ -z "$FIRST" ] && [ -n "$LAST" ]; } || { [ -n "$FIRST" ] && ! [[ "$FIRST$LAST" =~ ^[0-9]+$ ]]; }; then
  echo "FAIL  requirement range must be two integers: <first-req> <last-req>"; exit 1
fi
if [ -n "$FIRST" ]; then
  # 10#: read zero-padded input such as 007 as decimal, not octal.
  FIRST=$((10#$FIRST)); LAST=$((10#$LAST))
  [ "$FIRST" -le "$LAST" ] || { echo "FAIL  requirement range is reversed: $FIRST > $LAST"; exit 1; }
fi

# `|| true`: an empty match (no PNGs yet, placeholder README) must reach the FAIL report
# instead of silently stopping under `set -e`.
{ sed -nE 's/^ *\["[^"]+", "([^"]+)", "([^"]+)", "[^"]+"\],?$/\2/p' "$DIR/src/app.js" || true; } | sort > "$TMP/registry"
{ (cd "$DIR" && ls ./*.png 2>/dev/null) || true; } | sed -E 's#^\./##; s/\.png$//' | sort > "$TMP/png"
{ grep -oE '^\| `[0-9]{2}-[a-z0-9-]+\.png`' "$DIR/README.md" || true; } | sed -E 's/^\| `(.*)\.png`/\1/' | sort -u > "$TMP/readme"

check() {
  if diff -q "$TMP/$1" "$TMP/$2" >/dev/null; then
    echo "OK    $1 == $2 ($(wc -l < "$TMP/$1" | tr -d ' '))"
  else
    echo "FAIL  $1 != $2"; { diff "$TMP/$1" "$TMP/$2" || true; } | sed 's/^/      /'; fail=1
  fi
}
if [ ! -s "$TMP/registry" ]; then
  echo "FAIL  no screens registered in SCREENS of $DIR/src/app.js"; exit 1
fi
check registry png
check registry readme

if [ -n "$FIRST" ] && [ -n "$LAST" ]; then
  missing=()
  for n in $(seq "$FIRST" "$LAST"); do
    num=$(printf '%03d' "$n")
    # Only screen rows (| `NN-name.png` | ... |) count; file-description rows do not.
    grep -qE "^\| \`[0-9]{2}-[a-z0-9-]+\.png\` \|.*(\| |、)$num(、| \|)" "$DIR/README.md" || missing+=("$num")
  done
  if [ "${#missing[@]}" -eq 0 ]; then
    echo "OK    requirements $(printf '%03d' "$FIRST")-$(printf '%03d' "$LAST") all mapped"
  else
    echo "FAIL  requirements not mapped to any screen: ${missing[*]}"; fail=1
  fi
fi

# Requirement numbers must never be rendered on screen.
# Comment lines (// ...) are not rendered, so they are ignored.
if grep -nE '要件 ?No|要求 ?No' "$DIR/src/app.js" | grep -vE '^[0-9]+:[[:space:]]*//' >/dev/null; then
  echo "FAIL  requirement numbers appear in src/app.js:"; grep -nE '要件 ?No|要求 ?No' "$DIR/src/app.js" | grep -vE '^[0-9]+:[[:space:]]*//' | sed 's/^/      /'; fail=1
else
  echo "OK    no requirement numbers in screen text"
fi
exit "$fail"

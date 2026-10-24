#!/bin/bash
# Check that the screen registry, the exported PNGs and the README agree, and
# (optionally) that every requirement number is mapped to at least one screen.
#
# Usage: verify-screens.sh <screens-dir> [first-req last-req | --ids <file>]
#   verify-screens.sh docs/requirements/screens 1 6          # numeric ids, written 001-006
#   verify-screens.sh docs/requirements/screens --ids ids.txt # any format (FR-01, 2.3.1)
#
# Reads <screens-dir>/src/app.js (SCREENS), <screens-dir>/*.png and
# <screens-dir>/README.md (rows starting with | `NN-name.png` |).
# A numeric range is matched as 3-digit values (007). An --ids file lists one
# requirement id per line exactly as the README writes it; blank and # lines are skipped.
# Listed ids are also searched in screen text as plain strings, so very short ids
# (1, A) can match unrelated words; prefer the numeric range for plain numbers.
# In the README, ids in one cell are separated by 、.
# Exit status is 1 on any mismatch.
set -euo pipefail

DIR="${1:?usage: verify-screens.sh <screens-dir> [first-req last-req | --ids <file>]}"
IDS_FILE=""
if [ "${2:-}" = "--ids" ]; then
  IDS_FILE="${3:?usage: verify-screens.sh <screens-dir> --ids <file>}"
  [ -f "$IDS_FILE" ] || { echo "FAIL  missing ids file: $IDS_FILE"; exit 1; }
  FIRST=""; LAST=""
else
  FIRST="${2:-}"; LAST="${3:-}"
fi
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

if [ -n "$FIRST" ]; then
  for n in $(seq "$FIRST" "$LAST"); do printf '%03d\n' "$n"; done > "$TMP/ids"
elif [ -n "$IDS_FILE" ]; then
  { grep -vE '^[[:space:]]*(#|$)' "$IDS_FILE" || true; } | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' > "$TMP/ids"
  [ -s "$TMP/ids" ] || { echo "FAIL  no ids in $IDS_FILE"; exit 1; }
fi
if [ -s "$TMP/ids" ]; then
  missing=()
  while IFS= read -r id; do
    # Escape regex metacharacters so ids such as 2.3.1 match literally.
    re=$(printf '%s' "$id" | sed -E 's/[][\.*^$+?(){}|/]/\\&/g')
    # Only screen rows (| `NN-name.png` | ... |) count; file-description rows do not.
    grep -qE "^\| \`[0-9]{2}-[a-z0-9-]+\.png\` \|.*(\| |、)$re(、| \|)" "$DIR/README.md" || missing+=("$id")
  done < "$TMP/ids"
  if [ "${#missing[@]}" -eq 0 ]; then
    echo "OK    requirements $(head -n 1 "$TMP/ids") … $(tail -n 1 "$TMP/ids") all mapped ($(wc -l < "$TMP/ids" | tr -d ' '))"
  else
    echo "FAIL  requirements not mapped to any screen: ${missing[*]}"; fail=1
  fi
fi

# Requirement numbers must never be rendered on screen. Comments are not rendered, so
# blank them out first. A small scanner tells strings, template literals (with ${...})
# and comments apart, which regexes cannot; newlines are kept so line numbers match.
# Regex literals are read as code, so a quote inside one (/"/) would confuse it.
node - "$DIR/src/app.js" > "$TMP/code.js" <<'JS'
const src = require("fs").readFileSync(process.argv[2], "utf8");
let out = "", i = 0;
const stack = []; // open quotes; "}" marks a ${...} inside a template literal
const blank = (s) => s.replace(/[^\n]/g, " ");
while (i < src.length) {
  const c = src[i], top = stack[stack.length - 1];
  if (top === "'" || top === '"' || top === "`") {
    if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
    if (c === top) stack.pop();
    else if (top === "`" && c === "$" && src[i + 1] === "{") { stack.push("}"); out += "${"; i += 2; continue; }
    out += c; i++; continue;
  }
  if (c === "/" && src[i + 1] === "/") { const j = src.indexOf("\n", i); const e = j < 0 ? src.length : j; out += blank(src.slice(i, e)); i = e; continue; }
  if (c === "/" && src[i + 1] === "*") { const j = src.indexOf("*/", i + 2); const e = j < 0 ? src.length : j + 2; out += blank(src.slice(i, e)); i = e; continue; }
  if (c === "'" || c === '"' || c === "`") stack.push(c);
  else if (c === "{" && (top === "}" || top === "{")) stack.push("{");
  else if (c === "}" && (top === "}" || top === "{")) stack.pop();
  out += c; i++;
}
process.stdout.write(out);
JS
LABELS='要件 ?No|要求 ?No|要件番号'
if grep -nE "$LABELS" "$TMP/code.js" >/dev/null; then
  echo "FAIL  requirement numbers appear in src/app.js:"; grep -nE "$LABELS" "$TMP/code.js" | sed 's/^/      /'; fail=1
else
  echo "OK    no requirement numbers in screen text"
fi
# With --ids, the ids themselves (FR-01, 2.3.1) must not appear in screen text either.
# Numeric ranges are skipped here: 001-style values collide with ordinary figures.
if [ -n "$IDS_FILE" ]; then
  leaked=()
  while IFS= read -r id; do
    grep -qF -- "$id" "$TMP/code.js" && leaked+=("$id")
  done < "$TMP/ids"
  if [ "${#leaked[@]}" -eq 0 ]; then
    echo "OK    no listed ids in screen text"
  else
    echo "FAIL  listed ids appear in src/app.js: ${leaked[*]}"; fail=1
  fi
fi
exit "$fail"

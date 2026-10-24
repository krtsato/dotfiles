#!/bin/bash
# Export every screen registered in src/app.js (SCREENS) as PNG.
#
# Usage: src/capture.sh [screen-id ...]
#   With no arguments all screens are exported.
#
# Output: ../<file>.png (the parent of src/) at 390x844, device scale 2.
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="file://$SRC_DIR/index.html"
OUT="$(cd "$SRC_DIR/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
[ -s "$SRC_DIR/vendor/fonts.css" ] || { echo "vendor/fonts.css missing: run src/fetch-assets.sh first" >&2; exit 1; }
[ -x "$CHROME" ] || { echo "Chrome not found: $CHROME (set CHROME=<path to a Chromium-based browser>)" >&2; exit 1; }

# Lines look like: ["group", "screen-id", "file-name", "label"],
mapfile_entries() {
  sed -nE 's/^ *\["[^"]+", "([^"]+)", "([^"]+)", "[^"]+"\],?$/\1|\2/p' "$SRC_DIR/app.js"
}

entries=()
while IFS= read -r line; do entries+=("$line"); done < <(mapfile_entries)
if [ "${#entries[@]}" -eq 0 ]; then
  echo "No screens found in app.js" >&2
  exit 1
fi

# Every requested id must exist, so a typo is reported instead of silently skipped.
# Compare as plain strings: an id like "det.il" must not match "detail".
for want in "$@"; do
  found=0
  for entry in "${entries[@]}"; do
    [ "${entry%%|*}" = "$want" ] && { found=1; break; }
  done
  [ "$found" -eq 1 ] || { echo "unknown screen id: $want (see SCREENS in app.js)" >&2; exit 1; }
done

failed=0
count=0
for entry in "${entries[@]}"; do
  id="${entry%%|*}"
  file="${entry#*|}"
  if [ "$#" -gt 0 ] && [[ ! " $* " == *" $id "* ]]; then
    continue
  fi
  # Render check first: app.js sets body[data-render="ok"] only when the screen
  # function ran and every font loaded. Exceptions and missing fonts would
  # otherwise still produce a PNG. A failed screen's old PNG is removed so that
  # verify-screens.sh reports the gap instead of passing on stale output.
  dom=$(timeout 45 "$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=2000 \
    --window-size=390,844 --dump-dom "$SRC?screen=$id&shot=1" 2>/dev/null) || dom=""
  if ! grep -q 'data-render="ok"' <<<"$dom"; then
    state=$(grep -oE 'data-render="[^"]*"' <<<"$dom" | head -1 || true)
    echo "failed: $file.png (${state:-page did not finish rendering})" >&2
    rm -f "$OUT/$file.png"
    failed=$((failed + 1))
    continue
  fi
  # A single hung launch would block the whole run, so cap each capture at 45 s
  # (a cold start takes ~5 s). 2 s of virtual time is enough because fonts are
  # local files in vendor/; scale 2 matches a 2x phone screen (780x1688 PNG).
  if ! timeout 45 "$CHROME" \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --hide-scrollbars \
    --force-device-scale-factor=2 \
    --virtual-time-budget=2000 \
    --window-size=390,844 \
    --screenshot="$TMP/$file.png" \
    "$SRC?screen=$id&shot=1" >/dev/null 2>&1; then
    echo "failed: $file.png (chrome screenshot)" >&2
    rm -f "$OUT/$file.png"
    failed=$((failed + 1))
    continue
  fi
  cp "$TMP/$file.png" "$OUT/$file.png"
  count=$((count + 1))
  echo "wrote: $file.png"
done

if [ "$#" -gt 0 ] && [ "$count" -eq 0 ] && [ "$failed" -eq 0 ]; then
  echo "unknown screen id(s): $* (see SCREENS in app.js)" >&2
  exit 1
fi
if [ "$failed" -gt 0 ]; then
  echo "$failed screen(s) failed" >&2
  exit 1
fi
echo "done: $count screen(s) -> $OUT"

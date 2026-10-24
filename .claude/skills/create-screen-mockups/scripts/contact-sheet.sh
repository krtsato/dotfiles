#!/bin/bash
# Tile exported screens 4 per image at 1x (4 phones fit a 1600 px wide image that
# image readers show without downscaling the text), so a whole set can be reviewed in a few
# image reads (by you, or passed to `codex exec -i`).
#
# Usage: contact-sheet.sh <png-dir> <out-dir> [png-name ...]
#   contact-sheet.sh docs/requirements/screens /tmp/sheets
#   contact-sheet.sh docs/requirements/screens /tmp/sheets 02-home 06-case-detail
#
# Output: <out-dir>/sheet-0.png, sheet-1.png, ... (old sheets are removed first)
set -euo pipefail

[ -d "${1:?usage: contact-sheet.sh <png-dir> <out-dir> [png-name ...]}" ] || { echo "not a directory: $1" >&2; exit 1; }
SRC="$(cd "$1" && pwd)"
OUT="${2:?usage: contact-sheet.sh <png-dir> <out-dir> [png-name ...]}"
shift 2
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

files=()
if [ "$#" -gt 0 ]; then
  for name in "$@"; do files+=("$SRC/${name%.png}.png"); done
else
  for f in "$SRC"/*.png; do [ -e "$f" ] && files+=("$f"); done
fi

[ "${#files[@]}" -gt 0 ] || { echo "no PNG files in $SRC" >&2; exit 1; }
for f in "${files[@]}"; do [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }; done
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
rm -f "$OUT"/sheet-*.png "$OUT"/sheet-*.html

# 390 px = phone width at 1x; 4 phones + 3 gaps of 8 px = 1592 px.
n=0
for ((i = 0; i < ${#files[@]}; i += 4)); do
  html="$OUT/sheet-$n.html"
  echo '<body style="margin:0;display:flex;gap:8px;background:#888">' > "$html"
  for f in "${files[@]:i:4}"; do echo "<img src=\"file://$f\" style=\"width:390px\">" >> "$html"; done
  # 45 s: a cold headless Chrome start takes ~5 s; a hung launch must not block the loop.
  timeout 45 "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1592,844 --screenshot="$OUT/sheet-$n.png" "file://$html" >/dev/null 2>&1 \
    || { echo "chrome failed on sheet-$n (check CHROME=$CHROME)" >&2; exit 1; }
  rm -f "$html"
  n=$((n + 1))
done
echo "wrote $n sheet(s) for ${#files[@]} screen(s) -> $OUT"

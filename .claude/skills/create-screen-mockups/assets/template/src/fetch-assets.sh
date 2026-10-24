#!/bin/bash
# Download subset web fonts used by the mockup into vendor/.
#
# Usage: src/fetch-assets.sh
#   Typeface and weights come from src/font.conf (FONT, FONT_WEIGHTS).
#
# - The typeface is subset to the characters that appear in app.js and
#   index.html, so re-run this after adding new text.
# - The icon font is subset to the icon names used in app.js, so re-run this
#   after using a new icon.
# - Everything is downloaded into a temporary directory and checked first; the
#   current vendor/ is replaced only when every file arrived.
# Output: vendor/fonts.css and the referenced .woff2 files.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
VENDOR="$SRC/vendor"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NEW="$TMP/vendor"
mkdir -p "$NEW"

env_font="${FONT:-}"
env_weights="${FONT_WEIGHTS:-}"
# shellcheck source=/dev/null
[ -f "$SRC/font.conf" ] && . "$SRC/font.conf"
FONT="${env_font:-${FONT:-IBM Plex Sans JP}}"
FONT_WEIGHTS="${env_weights:-${FONT_WEIGHTS:-400;500;700}}"

# Every distinct character in the sources (plus ASCII printable), URL-encoded.
TEXT=$(python3 -I - "$SRC/app.js" "$SRC/index.html" <<'PY'
import sys, urllib.parse
chars = set(chr(c) for c in range(0x20, 0x7f))
for path in sys.argv[1:]:
    chars |= set(open(path, encoding="utf-8").read())
chars = "".join(sorted(c for c in chars if c.isprintable()))
print(urllib.parse.quote(chars, safe=""))
PY
)

# Icon names: Icon("x"), IconButton("x"), icon/trailing/leading/nav: "x" (or a = default),
# Fab("..", "x"), and the icon column of NAV / STATUS tables.
ICONS=$(
  {
    grep -oE '(Icon|IconButton)\("[a-z0-9_]+"' "$SRC/app.js" || true
    grep -oE '(icon|trailing|leading|nav) ?[:=] ?"[a-z0-9_]+"' "$SRC/app.js" || true
    grep -oE 'Fab\("[^"]+", "[a-z0-9_]+"' "$SRC/app.js" || true
    grep -oE '\["[a-z]+", "[^"]+", "[a-z0-9_]+"\]' "$SRC/app.js" || true
    grep -oE '\["[^"]+", "[a-z0-9_]+"\],' "$SRC/app.js" || true
  } | sed -E 's/.*"([a-z0-9_]+)"\]?,?$/\1/' | { grep -E '^[a-z0-9_]+$' || true; } | sort -u | paste -sd, -
)
[ -n "$ICONS" ] || { echo "no icon names found in app.js" >&2; exit 1; }

family="$(echo "$FONT" | tr ' ' '+')"
prefix="$(echo "$FONT" | tr 'A-Z ' 'a-z-')"
curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?family=$family:wght@$FONT_WEIGHTS&display=block&text=$TEXT" -o "$TMP/font.css" \
  || { echo "Google Fonts rejected \"$FONT\" with weights $FONT_WEIGHTS (check font.conf)" >&2; exit 1; }
n=0
weight=""
while IFS= read -r line; do
  case "$line" in
    *"font-weight:"*) weight=$(echo "$line" | grep -oE '[0-9]+') ;;
    *"src: url("*)
      url=$(echo "$line" | grep -oE 'https://[^)]+')
      file="$prefix-$weight.woff2"
      curl -fsS "$url" -o "$NEW/$file" || { echo "font file download failed: $file" >&2; exit 1; }
      printf '@font-face { font-family: "%s"; font-weight: %s; font-display: block; src: url("%s") format("woff2"); }\n' \
        "$FONT" "$weight" "$file" >> "$NEW/fonts.css"
      n=$((n + 1))
      ;;
  esac
done < "$TMP/font.css"
expected=$(echo "$FONT_WEIGHTS" | tr ';' '\n' | grep -c .)
[ "$n" -eq "$expected" ] || { echo "$FONT: got $n of $expected weights ($FONT_WEIGHTS)" >&2; exit 1; }
echo "$FONT: $n weight(s)"

# Axes: full optical-size range (20..48) so 16-24 px icons stay crisp; weight 400..700
# to follow the text weights; FILL 0..1 because selected icons are filled; GRAD fixed at 0.
curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,0&icon_names=$ICONS" -o "$TMP/icons.css" \
  || { echo "Google Fonts rejected the icon list (an unknown icon name in app.js?): $ICONS" >&2; exit 1; }
icon_url=$(grep -oE 'https://[^)]+' "$TMP/icons.css" | head -1 || true)
[ -n "$icon_url" ] || { echo "icon font URL not found in Google Fonts response" >&2; exit 1; }
curl -fsS "$icon_url" -o "$NEW/material-symbols-rounded.woff2" || { echo "icon font download failed" >&2; exit 1; }
printf '@font-face { font-family: "Material Symbols Rounded"; font-weight: 400; src: url("material-symbols-rounded.woff2") format("woff2"); }\n' >> "$NEW/fonts.css"
echo "icons: $(echo "$ICONS" | tr ',' '\n' | wc -l | tr -d ' ')"

for f in "$NEW"/*.woff2; do
  [ -s "$f" ] || { echo "empty download: $(basename "$f")" >&2; exit 1; }
done
rm -rf "$VENDOR"
mv "$NEW" "$VENDOR"
ls -l "$VENDOR" | awk 'NR>1 {printf "  %-40s %6d KB\n", $9, $5/1024}'

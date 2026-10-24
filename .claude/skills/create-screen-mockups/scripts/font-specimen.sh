#!/bin/bash
# Render the same UI text in several Google Fonts side by side, to choose a typeface.
#
# Usage: font-specimen.sh <out.png> "Font A" "Font B" ...
#   font-specimen.sh /tmp/specimen.png "IBM Plex Sans JP" "Noto Sans JP" "BIZ UDPGothic"
#
# Sample text comes from SAMPLE_* env vars; pass the project's own words (a real
# item title, a place, a caption, an amount) so the comparison reflects its screens.
# Each family is requested at 400 and 700, which every candidate above provides.
set -euo pipefail

OUT="${1:?usage: font-specimen.sh <out.png> \"Font A\" ...}"
shift
[ "$#" -gt 0 ] || { echo "give at least one font family" >&2; exit 1; }
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
HEAD="${SAMPLE_HEAD:-項目名の例}"
BODY="${SAMPLE_BODY:-場所の例 1 階}"
CAPTION="${SAMPLE_CAPTION:-市区町村 1 丁目・担当者の例}"
FIGURE="${SAMPLE_FIGURE:-¥123,456}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
families=$(printf '%s\n' "$@" | sed 's/ /+/g; s/$/:wght@400;700/; s/^/family=/' | paste -sd'&' -)
{
  echo "<!doctype html><meta charset=utf-8><link rel=stylesheet href=\"https://fonts.googleapis.com/css2?$families&display=block\">"
  # Sizes mirror the type scale in DESIGN.md: 24 px headline, 14 px body, 13 px caption,
  # 28 px figure; 11 px / 600 is only the label naming each font.
  echo '<style>body{margin:0;background:#fff;color:#1d1d1d;display:grid;grid-template-columns:repeat(3,1fr)}
  .c{padding:16px 20px;border:1px solid #dddddd;font-feature-settings:"palt"} .n{font:600 11px system-ui;color:#666666;margin-bottom:8px}
  .h{font-size:24px;font-weight:700;line-height:32px} .b{font-size:14px;line-height:22px;color:#444444} .s{font-size:13px;color:#444444}
  .m{font-size:28px;font-weight:700;margin-top:6px}</style><body>'
  for f in "$@"; do
    echo "<div class=c style=\"font-family:'$f'\"><div class=n>$f</div><div class=h>$HEAD</div><div class=b>$BODY</div><div class=s>$CAPTION</div><div class=m>$FIGURE</div></div>"
  done
} > "$TMP/specimen.html"
rows=$(( ($# + 2) / 3 ))
# 8 s of virtual time lets the web fonts finish loading before the screenshot;
# 60 s caps the whole run in case the network stalls. 1050 px = 3 columns of 350 px;
# each row of samples is 210 px tall, +20 px bottom margin. Scale 2 renders like a
# 2x phone screen, so thin strokes and kana spacing are judged at the size users see.
timeout 60 "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --virtual-time-budget=8000 --window-size=1050,$((rows * 210 + 20)) \
  --screenshot="$OUT" "file://$TMP/specimen.html" >/dev/null 2>&1 \
  || { echo "chrome failed (check CHROME=$CHROME and network to Google Fonts)" >&2; exit 1; }
echo "wrote: $OUT"

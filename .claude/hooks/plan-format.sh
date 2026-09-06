#!/bin/bash
# PostToolUse hook: check that a plan document reads without opening its
# details, and hand the findings back to the model.
#
# Only mechanical properties are checked. "Is this plain Japanese" cannot be
# measured; missing, thin, prose-only and jargon-laden summaries can be, and
# those are the four ways the format has actually failed.
#
# Scope is deliberately narrow -- plan documents only. Applied to every markdown
# file the warnings would become background noise and stop being read.
#
# Exits 0 in every path. A checker must never break the turn.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)"
[ -n "$file" ] && [ -f "$file" ] || exit 0

case "$file" in
  */plans/*.md|*/plan-*.md|*/docs/plan*.md) ;;
  *) exit 0 ;;
esac

# MIN は空白を除いた文字数。良い例が 254、明らかに薄いものが 54〜89 だったので
# その間に置いた。ALLOW は訳す必要のない語だけ。増え続けるのは検出される側。
findings="$(awk -v MIN=150 '
function flush(  n, body, name, jarg, w, i, arr) {
  if (head == "") return
  name = head; sub(/^#+ /, "", name)
  if (head ~ /（/ || head ~ /\(/)
    print "見出しに括弧: " name " — 修飾は ` — ` で繋ぎ、日付や但し書きは要約へ"
  body = buf
  gsub(/[ \t\r\n]/, "", body)
  if (body == "") { print "要約が無い: " name " — 見出しの直後に要約、その後に details"; return }
  n = length(body)
  if (n < MIN) print "要約が薄い（" n " 字）: " name " — 詳細を開かずに中身が分かる水準に"
  else if (buf !~ /\|/ && buf !~ /(^|\n)[ \t]*[-*0-9]/)
    print "要約が文章だけ: " name " — 表・箇条書き・太字で見て分かる形に"
  # コード表記は意図的な識別子なので落としてから英単語を拾う
  jarg = buf; gsub(/`[^`]*`/, "", jarg)
  gsub(/[^A-Za-z_-]/, " ", jarg)
  split(jarg, arr, " "); hits = ""
  for (i in arr) {
    w = arr[i]
    if (length(w) < 3) continue
    if (w == toupper(w)) continue                 # 全大文字の略語は訳さなくてよい
    if (index(ALLOW, " " tolower(w) " ")) continue
    if (index(hits, " " w " ")) continue
    hits = hits " " w " "
  }
  if (hits != "") { gsub(/  +/, " ", hits); print "要約に専門語:" " " name " —" hits "を日本語に" }
}
BEGIN {
  ALLOW = " codex mdreview claude slack github gh go python markdownlint textlint jq yaml json pdf csv url "
  head = ""; buf = ""; depth = 0
}
/^#{2,6} / { flush(); head = $0; buf = ""; depth = 0; next }
/^[ \t]*<details/ { depth++; next }
/^[ \t]*<\/details>[ \t]*$/ { depth--; next }
{ if (head != "" && depth == 0) buf = buf "\n" $0 }
END { flush() }
' "$file" 2>/dev/null | head -20)"

[ -n "$findings" ] || exit 0

jq -n --arg f "$findings" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("[plan の書式] 詳細を開かずに読める形に直してください。\n" + $f)
  }
}'

#!/usr/bin/env sh
#
# 売買の振り返りを作る。約定を取り、持ち高を組み立て、前向き台帳と突き合わせて
# 報告書を書くところまでを 1 本で行う。
#
# 判定はここに無い。どの技法がいつ出たかは台帳が結果を知る前に記録したもので、
# この script は Go の道具を呼ぶだけ。2 か所に判定を持たないため。
#
# 使い方:
#   sh review.sh                 # 既定の期間（今年）
#   sh review.sh 2025-01-01      # 開始日を指定
set -eu

START="${1:-$(date -u +%Y)-01-01}"
END="${2:-$(date -u +%Y-%m-%d)}"
IK="${REVIEW_IK:-$HOME/dev/me/mcp-invest-knowledge}"
TV="${REVIEW_TV:-$HOME/dev/me/mcp-tradingview}"
TM="${REVIEW_TM:-$HOME/dev/me/trade-moomoo}"
ACC="${MOOMOO_ACC_ID:-}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for d in "$IK" "$TV" "$TM"; do
  [ -d "$d" ] || { echo "error: $d がありません" >&2; exit 1; }
done
LEDGER="$TV/data/paper-ledger"
[ -d "$LEDGER" ] || {
  echo "error: 前向き台帳がありません（$TV/data/paper-ledger）。" >&2
  echo "       台帳が無いと、技法が出ていたかを確かめられません。" >&2
  exit 1; }
[ -n "$ACC" ] || {
  echo "error: MOOMOO_ACC_ID を指定してください（現物の口座 ID）。" >&2
  echo "       一覧: MOOMOO_ALLOW_REAL=1 FUTU_TRD_ENV=REAL $TM/bin/moomoo scripts/trade/get_accounts.py --json" >&2
  exit 1; }

# 1 回の照会は 360 日まで。建値は開始日より前の買いで決まるので、
# 指定された開始日の 1 年前から取る。足りなければ報告書が「建値が分からず除外」として数える。
fetch() { # $1=start $2=end $3=out
  ( cd "$TM" && MOOMOO_ALLOW_REAL=1 FUTU_TRD_ENV=REAL ./bin/moomoo \
      scripts/trade/get_history_order_fill_list.py \
      --acc-id "$ACC" --market JP --start "$1" --end "$2" --json 2>/dev/null ) \
    | grep -E '^[{[]' | tail -1 > "$3.raw"
  python3 - "$3.raw" "$3" "$1" "$2" <<'PY'
import json, sys
raw, out, a, b = sys.argv[1:5]
try:
    obj = json.load(open(raw, encoding="utf-8"))
except Exception:
    sys.exit("%s..%s: 約定の応答が読めません" % (a, b))
# Errors come as {"ret": N, "error": ...} from check_ret, or as {"error": ...}
# without "ret" from the script's own exception handler.
if isinstance(obj, dict) and ("error" in obj or obj.get("ret", 0) != 0):
    sys.exit("%s..%s: %s" % (a, b, obj.get("error")))
rows = obj if isinstance(obj, list) else obj.get("deals")
if rows is None:
    sys.exit("%s..%s: 想定外の応答です" % (a, b))
json.dump(rows, open(out, "w"), ensure_ascii=False)
print("  %s 〜 %s : %d 件" % (a, b, len(rows)), file=sys.stderr)
PY
}

echo "約定を取得（建値のため開始日の 1 年前から）" >&2
python3 - "$START" "$END" > "$WORK/windows.txt" <<'PY'
import sys, datetime
start = datetime.date.fromisoformat(sys.argv[1]) - datetime.timedelta(days=365)
end = datetime.date.fromisoformat(sys.argv[2])
# 1 回 360 日までなので 180 日ずつに割る（境界で取りこぼさないよう余裕を持つ）
cur = start
while cur <= end:
    nxt = min(cur + datetime.timedelta(days=179), end)
    print("%s %s" % (cur.isoformat(), nxt.isoformat()))
    cur = nxt + datetime.timedelta(days=1)
PY

i=0; FILLS=""
while read -r a b; do
  i=$((i + 1))
  fetch "$a" "$b" "$WORK/f$i.json"
  FILLS="${FILLS:+$FILLS,}$WORK/f$i.json"
done < "$WORK/windows.txt"

OUT="$IK/derived/trade-reviews/$END.md"
echo "突き合わせて報告書を書く" >&2
# The market-regime record is display only: without it the report is still written.
REGIME=""
if ls "$TV/data/market-regime/"*.jsonl >/dev/null 2>&1; then
  REGIME="$TV/data/market-regime"
else
  echo "注意: 市場全体の技法の記録（$TV/data/market-regime）が無いので、その件数を出さずに報告書を作ります。" >&2
fi
# 52-week line phase of each entry day: display only. The phase is computed in
# mcp-tradingview (the one place the rule lives); a failure here never stops the
# review, the section's rows are then all "—".
( cd "$IK" && go build -o "$WORK/tr" ./cmd/trade-review )
"$WORK/tr" -fills "$FILLS" -ledger "$LEDGER" -notes "$IK/sources/technique-notes" \
    -ma52w-items-out "$WORK/ma52w-items.jsonl" -out "$WORK/pre.md" 2>/dev/null || true
MA52W="$WORK/ma52w.json"
echo "[]" > "$MA52W"
LAYOUT="${TV_CHART_LAYOUT:-$(gh variable get TV_CHART_LAYOUT -R krtsato/mcp-tradingview 2>/dev/null || true)}"
if [ -s "$WORK/ma52w-items.jsonl" ] && [ -n "$LAYOUT" ] \
   && ( cd "$TV" && go build -o "$WORK/cb" ./cmd/tradingview-chart-bars ); then
  # Exit 2 means some symbols could not be read: the file still holds the rows
  # that were, so keep it; only a missing file leaves the section all "—".
  "$WORK/cb" ma52w -layout "$LAYOUT" -items "$WORK/ma52w-items.jsonl" -out "$WORK/ma52w.json.new" || true
  if [ -s "$WORK/ma52w.json.new" ]; then
    mv "$WORK/ma52w.json.new" "$MA52W"
  else
    echo "注意: 52 週線の局面を読めなかったので、その節は全部「—」になります。" >&2
  fi
else
  echo "注意: 52 週線の局面の段を飛ばします（取引・layout・ビルドのいずれかが無い）。節は全部「—」になります。" >&2
fi
( cd "$IK" && "$WORK/tr" \
    -fills "$FILLS" \
    -ledger "$LEDGER" \
    -notes sources/technique-notes \
    ${REGIME:+-regime "$REGIME"} \
    -ma52w "$MA52W" \
    -out "$OUT" )
echo "$OUT"

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
# 置き場（日付ごとのファイル）が本来の形。単一ファイルは 2026-10-02 までの古い形で、
# 古い clone でも動くよう残してある。どちらも無ければ確かめようがないので止める。
LEDGER="$TV/data/paper-ledger"
[ -d "$LEDGER" ] || LEDGER="$TV/data/paper-ledger.jsonl"
[ -e "$LEDGER" ] || {
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
if isinstance(obj, dict) and obj.get("ret", 0) != 0:
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
( cd "$IK" && go run ./cmd/trade-review \
    -fills "$FILLS" \
    -ledger "$LEDGER" \
    -notes sources/technique-notes \
    -out "$OUT" )
echo "$OUT"

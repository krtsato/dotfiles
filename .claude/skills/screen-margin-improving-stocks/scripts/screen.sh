#!/bin/sh
# 信用倍率が改善していて売買が活発な買い候補を出す。
#
# 判定は Docker コンテナの中で動く。実行するマシンの Go の版や証明書の中身に
# 結果が左右されないようにするため——同じデータなら同じ表が出る。
#
# ここは呼び出しを短くするだけの層で、判定も並べ替えも一切持たない。
# 2 か所に判定があると必ず食い違う。
#
# 使い方:
#   screen.sh [件数] [ウォッチリスト名]
#
# 環境変数:
#   SCREEN_REPO   mcp-tradingview のパス（既定: ~/dev/me/mcp-tradingview）
#   SCREEN_NOTES  technique-note のパス（既定: mcp-invest-knowledge の中）
#   SCREEN_CANON  分類の正本のパス（既定: mcp-invest-knowledge の中）
#   SCREEN_IMAGE  使う image 名（既定: tradingview-screen-margin:local）
#
# 既定は 30 件・全市場。読み取りのみで、何も書かない。
#
# ウォッチリスト名を渡すと母集団がその日本株だけになり、該当しなかった構成銘柄も
# 理由つきで出る。渡さなければ正本は読まないので、正本が無い環境でも従来どおり動く。
set -eu

REPO="${SCREEN_REPO:-$HOME/dev/me/mcp-tradingview}"
NOTES="${SCREEN_NOTES:-$HOME/dev/me/mcp-invest-knowledge/sources/technique-notes}"
CANON="${SCREEN_CANON:-$HOME/dev/me/mcp-invest-knowledge/sources/watchlists}"
IMAGE="${SCREEN_IMAGE:-tradingview-screen-margin:local}"
COUNT="${1:-30}"
LIST="${2:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker が見つかりません。" >&2
  echo "Docker を使うのは、実行環境によらず同じ結果を出すためです。" >&2
  echo "ホストで直接動かすこともできますが、その場合は結果が Go の版に依存します:" >&2
  echo "  cd $REPO" >&2
  echo "  go run ./cmd/tradingview-screen-margin -repo $REPO -notes $NOTES -count $COUNT" >&2
  exit 1
fi
if [ ! -d "$REPO/data/seido-margin" ]; then
  echo "信用残高のファイルが見つかりません: $REPO/data/seido-margin" >&2
  echo "週次の取り込みが止まっている可能性があります。先にそちらを確認してください。" >&2
  exit 1
fi
if [ ! -d "$NOTES" ]; then
  echo "技法ノートがありません: $NOTES" >&2
  exit 1
fi
if [ -n "$LIST" ] && [ ! -d "$CANON" ]; then
  echo "分類の正本がありません: $CANON" >&2
  echo "ウォッチリストで絞るには正本が要ります。SCREEN_CANON で場所を指定できます。" >&2
  exit 1
fi

# 毎回ビルドする。tag の有無だけを見て済ませると、ソースや Dockerfile が変わった後も
# 古い image が黙って使われ、いまのデータを古いコードで判定してしまう。
# layer は再利用されるので、変更が無ければ 10 秒ほどで終わる（実測 9.5 秒）。
cd "$REPO"
docker build -q -f Dockerfile.screen -t "$IMAGE" . >/dev/null

# data と notes は読み取り専用で渡す。コンテナは何も書かない。
# 正本は絞るときだけ渡す。常に繋ぐと、正本が無い環境で絞らない実行まで落ちる。
if [ -n "$LIST" ]; then
  exec docker run --rm \
    -v "$REPO/data:/work/data:ro" \
    -v "$NOTES:/notes:ro" \
    -v "$CANON:/canon:ro" \
    "$IMAGE" -count "$COUNT" -canon /canon -list "$LIST"
fi
exec docker run --rm \
  -v "$REPO/data:/work/data:ro" \
  -v "$NOTES:/notes:ro" \
  "$IMAGE" -count "$COUNT"

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
#   screen.sh [件数]
#
# 環境変数:
#   SCREEN_REPO   mcp-tradingview のパス（既定: ~/dev/me/mcp-tradingview）
#   SCREEN_NOTES  technique-note のパス（既定: mcp-invest-knowledge の中）
#   SCREEN_IMAGE  使う image 名（既定: tradingview-screen-margin:local）
#
# 既定は 30 件。読み取りのみで、何も書かない。
set -eu

REPO="${SCREEN_REPO:-$HOME/dev/me/mcp-tradingview}"
NOTES="${SCREEN_NOTES:-$HOME/dev/me/mcp-invest-knowledge/sources/technique-notes}"
IMAGE="${SCREEN_IMAGE:-tradingview-screen-margin:local}"
COUNT="${1:-30}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker が見つかりません。" >&2
  echo "Docker を使うのは、実行環境によらず同じ結果を出すためです。" >&2
  echo "ホストで直接動かすこともできますが、その場合は結果が Go の版に依存します:" >&2
  echo "  cd $REPO" >&2
  echo "  go run ./cmd/tradingview-screen-margin -repo $REPO -notes $NOTES -count $COUNT" >&2
  exit 1
fi
if [ ! -d "$REPO/data/seido-margin" ]; then
  echo "信用残高のデータがありません: $REPO/data/seido-margin" >&2
  echo "週次の取り込みが止まっている可能性があります。先にそちらを確認してください。" >&2
  exit 1
fi
if [ ! -d "$NOTES" ]; then
  echo "技法ノートがありません: $NOTES" >&2
  exit 1
fi

# image が無ければ作る。layer は再利用されるので、2 回目以降は数秒で終わる。
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "image を作ります（初回のみ）: $IMAGE" >&2
  cd "$REPO"
  docker build -f Dockerfile.screen -t "$IMAGE" . >&2
fi

# data と notes は読み取り専用で渡す。コンテナは何も書かない。
exec docker run --rm \
  -v "$REPO/data:/work/data:ro" \
  -v "$NOTES:/notes:ro" \
  "$IMAGE" -count "$COUNT"

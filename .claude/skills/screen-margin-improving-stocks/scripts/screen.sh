#!/bin/sh
# 信用倍率が改善していて売買が活発な買い候補を出す。
#
# 判定は Docker コンテナの中で動く。実行するマシンの Go の版や証明書の中身に
# 結果が左右されないようにするため——同じデータなら同じ表が出る。
#
# コンテナ 1 段で流す。主表・予兆・静かな時期の 3 つの表の列「52週線」は、表に出す行が
# 決まった後に、Pine スクリーナーへの問い合わせ 1 回で埋める（mcp-tradingview
# docs/pine-screener.md）。TradingView のアプリは要らない。
# 問い合わせにはログインの証明が要る。手元のファイル（~/.config/mcp-tradingview/cookies.json）
# から 2 つの値を読み、環境変数でコンテナへ渡す（値は画面にもログにも出さない）。
# 読めない・拒否されたときは列が全行「—」になるだけで、絞り込みは止まらない。
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
#   TRADINGVIEW_COOKIES_FILE  ログインの証明のファイル（既定: ~/.config/mcp-tradingview/cookies.json）
#
# 既定は 30 件・全市場。data と notes には何も書かない（読み取り専用で渡す）。
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
# Check the LIVE feed, not the archive. JPX moved this statistic to a daily
# publication on 2026-09-25; data/seido-margin now holds only the retired weekly
# files and will always exist, so testing it would pass while the daily ingest is
# dead and the screen silently compares four-week-old numbers.
if [ ! -d "$REPO/data/seido-margin-daily" ]; then
  echo "信用残高のファイルが見つかりません: $REPO/data/seido-margin-daily" >&2
  echo "日次の取り込みが止まっている可能性があります。先にそちらを確認してください。" >&2
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

# ログインの証明を手元のファイルから読み、コンテナには環境変数で渡す。ファイルを渡す
# 方式は、コンテナの利用者（nonroot）とファイルの権限 0600 の検査が食い違うので採らない。
# 値はシェルの変数に一度も入れない（`sh -x` でも出ない）。python3 が、ファイルが通常の
# ファイルで持ち主だけが読める（0600 相当）ことを確かめてから、0600 の一時ファイルに
# docker の --env-file の形で書く。一時ファイルは終了時に消す。
COOKIES_FILE="${TRADINGVIEW_COOKIES_FILE:-$HOME/.config/mcp-tradingview/cookies.json}"
ENV_DIR="$(mktemp -d)"
trap 'rm -rf "$ENV_DIR"' EXIT INT TERM
ENV_FILE="$ENV_DIR/tv.env"
ENV_ARGS=""
if command -v python3 >/dev/null 2>&1 && python3 -I - "$COOKIES_FILE" "$ENV_FILE" <<'PY' 2>/dev/null
import json, os, stat, sys
src, dst = sys.argv[1], sys.argv[2]
st = os.lstat(src)
if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o077:
    sys.exit(1)  # same refusal as internal/auth: not a regular file, or readable by others
with open(src) as f:
    c = json.load(f)
sid, sign = c.get("sessionid", ""), c.get("sessionid_sign", "")
if not sid or not sign:
    sys.exit(1)
fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    f.write("TRADINGVIEW_SESSIONID=" + sid + "\n")
    f.write("TRADINGVIEW_SESSIONID_SIGN=" + sign + "\n")
PY
then
  ENV_ARGS="--env-file $ENV_FILE"
else
  echo "52 週線: ログインの証明を読めないため問い合わせません（列は全行 —）。" >&2
fi

# data と notes は読み取り専用で渡す。正本は絞るときだけ渡す。常に繋ぐと、正本が無い
# 環境で絞らない実行まで落ちる。ENV_ARGS は一時ファイルのパスだけ（値は入っていない）。
# shellcheck disable=SC2086
if [ -n "$LIST" ]; then
  docker run --rm $ENV_ARGS \
    -v "$REPO/data:/work/data:ro" \
    -v "$NOTES:/notes:ro" \
    -v "$CANON:/canon:ro" \
    "$IMAGE" -count "$COUNT" -canon /canon -list "$LIST"
else
  docker run --rm $ENV_ARGS \
    -v "$REPO/data:/work/data:ro" \
    -v "$NOTES:/notes:ro" \
    "$IMAGE" -count "$COUNT"
fi

#!/usr/bin/env python3
"""現在時刻を出力するスクリプト。

デフォルトは日本標準時 (JST / Asia/Tokyo)。
--tz でタイムゾーン、--format で出力書式を変更できる。
依存ライブラリは標準ライブラリのみ (Python 3.9+ の zoneinfo を使用)。
"""

import argparse
import sys
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# よく使う書式のプリセット。--format には任意の strftime 文字列も渡せる。
PRESETS = {
    "default": "%Y-%m-%d %H:%M:%S %Z",          # 2026-06-22 14:30:05 JST
    "iso": "%Y-%m-%dT%H:%M:%S%z",                # 2026-06-22T14:30:05+0900
    "ja": "%Y年%m月%d日 %H時%M分%S秒",            # 2026年06月22日 14時30分05秒
    "date": "%Y-%m-%d",                          # 2026-06-22
    "time": "%H:%M:%S",                          # 14:30:05
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="現在時刻を指定したタイムゾーン・書式で出力する。"
    )
    parser.add_argument(
        "--tz",
        default="Asia/Tokyo",
        help="IANA タイムゾーン名 (例: Asia/Tokyo, UTC, America/New_York)。既定: Asia/Tokyo",
    )
    parser.add_argument(
        "--format",
        default="default",
        help=(
            "出力書式。プリセット名 (default, iso, ja, date, time) または "
            "任意の strftime 文字列。既定: default"
        ),
    )
    args = parser.parse_args()

    try:
        tz = ZoneInfo(args.tz)
    except (ZoneInfoNotFoundError, ValueError):
        print(f"エラー: タイムゾーン '{args.tz}' が見つかりません。", file=sys.stderr)
        return 1

    now = datetime.now(tz)
    fmt = PRESETS.get(args.format, args.format)
    print(now.strftime(fmt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

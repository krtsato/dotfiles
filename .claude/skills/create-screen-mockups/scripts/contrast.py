#!/usr/bin/env python3
"""Check WCAG 2.x contrast ratios for color pairs.

Usage: python3 -I contrast.py <fg>:<bg>[:text|graphic] ...
  python3 -I contrast.py "#FFFFFF:#65558F" "#CAC4CF:#FDF7FF:graphic"

Thresholds: text 4.5:1 (normal size), graphic 3:1 (bars, icons that carry meaning).
Exit status is 1 when any pair fails, so it can gate a loop.
"""
import re
import sys

THRESHOLD = {"text": 4.5, "graphic": 3.0}


def luminance(hex_color):
    # Relative luminance as defined by WCAG 2.x (sRGB linearisation and Rec. 709 weights).
    h = hex_color.lstrip("#")
    channels = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    channels = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    failed = 0
    for arg in sys.argv[1:]:
        parts = arg.split(":")
        kind = parts[2] if len(parts) > 2 else "text"
        if len(parts) not in (2, 3) or kind not in THRESHOLD or not all(
                re.fullmatch(r"#[0-9A-Fa-f]{6}", c) for c in parts[:2]):
            sys.exit(f"bad argument {arg!r}; expected #RRGGBB:#RRGGBB[:text|graphic]\n{__doc__}")
        fg, bg = parts[0], parts[1]
        r = ratio(fg, bg)
        ok = r >= THRESHOLD[kind]
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {fg} on {bg}  {r:.2f}:1  ({kind} >= {THRESHOLD[kind]})")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

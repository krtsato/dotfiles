#!/usr/bin/env python3
"""Rank the colors a website actually uses, to pick a brand seed color.

Usage: python3 -I brand-colors.py <page-url> [top-n]

Fetches the page, its linked stylesheets and inline <svg> logos, normalizes
#rgb / #rrggbb / rgb() / rgba() to #RRGGBB and prints them by frequency.
Achromatic colors (white, black, greys) are listed separately because they
cannot be a seed. The most frequent chromatic color is usually the brand color;
confirm it against the logo fill printed at the end.
"""
import colorsys
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    # 20 s: corporate sites are often slow; longer waits rarely succeed.
    with urllib.request.urlopen(req, timeout=20) as res:
        return res.read().decode("utf-8", errors="replace")


def normalize(token):
    token = token.strip().lower()
    if token.startswith("#"):
        h = token[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return "#" + h.upper() if len(h) == 6 else None
    nums = re.findall(r"[\d.]+%?", token)
    if len(nums) < 3:
        return None
    if len(nums) == 4:
        alpha = float(nums[3].rstrip("%")) / (100 if nums[3].endswith("%") else 1)
        if alpha < 0.5:
            return None  # mostly transparent overlays are not brand colors
    # Channels may be 0-255 or percentages ("rgb(100%, 0%, 0%)").
    r, g, b = (max(0, min(255, round(float(n[:-1]) * 2.55 if n.endswith("%") else float(n)))) for n in nums[:3])
    return f"#{r:02X}{g:02X}{b:02X}"


def is_chromatic(hex_color):
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    _, lightness, saturation = colorsys.rgb_to_hls(r, g, b)
    # Saturation below 0.15 or near-white/near-black reads as grey on screen.
    return saturation >= 0.15 and 0.08 < lightness < 0.95


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: brand-colors.py <page-url> [top-n]")
    page = sys.argv[1]
    # 12: enough to see the brand color plus its gradient partners.
    if len(sys.argv) > 2 and not (sys.argv[2].isdigit() and int(sys.argv[2]) > 0):
        sys.exit(f"top-n must be a positive integer: {sys.argv[2]}")
    top = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    try:
        html = fetch(page)
    except Exception as exc:
        sys.exit(f"cannot fetch {page}: {exc} (check the URL, or pick the seed from the logo instead)")
    sources = [html]
    links = [m.group(0) for m in re.finditer(r"<link\b[^>]*>", html, re.I)]
    # Attribute values may be double-quoted, single-quoted or bare (minified HTML).
    hrefs = [m.group(1) for tag in links
             if re.search(r"""rel=["']?stylesheet""", tag, re.I)
             for m in [re.search(r"""href=["']?([^"'\s>]+)""", tag)] if m]
    for href in hrefs:
        if "fonts.googleapis" in href:
            continue
        try:
            sources.append(fetch(urllib.parse.urljoin(page, href)))
        except Exception as exc:  # keep going; one broken stylesheet is common
            print(f"skip stylesheet {href}: {exc}", file=sys.stderr)
    logo_fills = []
    # Inline <svg> blocks often hold the logo; external logo files are named *logo*.svg.
    for svg in re.findall(r"<svg\b.*?</svg>", html, re.I | re.S):
        logo_fills += [normalize(c) for c in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", svg)]
    for src in re.findall(r"""<img[^>]+src=["']([^"']*logo[^"']*\.svg)["']""", html, re.I):
        try:
            svg = fetch(urllib.parse.urljoin(page, src))
            logo_fills += [normalize(c) for c in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", svg)]
        except Exception as exc:
            print(f"skip logo {src}: {exc}", file=sys.stderr)

    pattern = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)")
    counts = Counter(c for s in sources for c in map(normalize, pattern.findall(s)) if c)
    chromatic = [(c, n) for c, n in counts.most_common() if is_chromatic(c)]
    neutral = [(c, n) for c, n in counts.most_common() if not is_chromatic(c)]

    print(f"stylesheets read: {len(sources) - 1} of {len(hrefs)} linked")
    print("chromatic (seed candidates):")
    for c, n in chromatic[:top]:
        print(f"  {c}  {n}")
    print("neutral (text, lines, backgrounds):")
    for c, n in neutral[:top]:
        print(f"  {c}  {n}")
    print("logo svg fills:", ", ".join(sorted({c for c in logo_fills if c})) or "none found")


if __name__ == "__main__":
    main()

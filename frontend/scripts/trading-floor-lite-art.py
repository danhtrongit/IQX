#!/usr/bin/env python3
"""Builds the half-resolution character art of the trading floor (Khu giao dịch).

Phones run out of memory on the full sheets (a walk sheet is 2048x512, eight of them per character),
so touch devices load `*@1x.webp` siblings instead: the same picture at half the size. Each
`characters/**/*@2x.webp` gets one. A 2x2 box filter keeps sprite cells from bleeding into each other
(every cell size is even). Run again after the art changes:

    python3 -I frontend/scripts/trading-floor-lite-art.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "trading-floor" / "assets" / "characters"


def main() -> None:
    made = 0
    for source in sorted(ROOT.rglob("*@2x.webp")):
        with Image.open(source) as image:
            width, height = image.size
            if width % 2 or height % 2:
                raise SystemExit(f"{source}: odd size {width}x{height}")
            half = image.convert("RGBA").resize((width // 2, height // 2), Image.Resampling.BOX)
        target = source.with_name(source.name.replace("@2x.webp", "@1x.webp"))
        half.save(target, "WEBP", quality=90, method=6)
        made += 1
    print(f"{made} files written under {ROOT}")


if __name__ == "__main__":
    main()

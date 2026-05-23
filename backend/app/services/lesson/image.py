"""Resize uploaded thumbnail to max 1280x720 JPEG via Pillow."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image


def save_thumbnail_jpeg(
    src_bytes: bytes,
    target: Path,
    max_w: int = 1280,
    max_h: int = 720,
) -> int:
    """Resize image and save as JPEG. Returns file size in bytes."""
    target.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(BytesIO(src_bytes))
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.save(target, format="JPEG", quality=85, optimize=True)
    return target.stat().st_size

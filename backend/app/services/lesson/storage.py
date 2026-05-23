"""Local filesystem storage for lesson media. Atomic write + safe delete."""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Iterable

from app.core.config import get_settings


class MediaStorage:
    def __init__(self, base_dir: str | Path | None = None) -> None:
        s = get_settings()
        # Allow override via env LESSON_MEDIA_DIR (defaults to ./media for dev,
        # /www/wwwroot/iqx.vn/media in prod via env var)
        self.base = Path(base_dir or s.LESSON_MEDIA_DIR).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    def course_dir(self, course_id: uuid.UUID) -> Path:
        d = self.base / "courses" / str(course_id)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def public_url(self, abs_path: Path) -> str:
        """Convert absolute path -> public URL served under /media/."""
        rel = abs_path.relative_to(self.base)
        return f"/media/{rel.as_posix()}"

    def write_atomic(self, target: Path, content_iterator: Iterable[bytes]) -> int:
        """Stream chunks to a .tmp file then atomic rename. Return total bytes."""
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        total = 0
        try:
            with open(tmp, "wb") as f:
                for chunk in content_iterator:
                    f.write(chunk)
                    total += len(chunk)
            os.replace(tmp, target)
        except Exception:
            # Clean up temp file on failure
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            raise
        return total

    def delete(self, abs_path: Path | str) -> bool:
        """Best-effort delete; returns True if removed, False if missing or error."""
        p = Path(abs_path) if not isinstance(abs_path, Path) else abs_path
        try:
            p.unlink(missing_ok=True)
            return True
        except OSError:
            return False

    def from_url(self, url: str | None) -> Path | None:
        """Resolve /media/courses/.../file.pdf -> absolute Path inside base dir."""
        if not url or not url.startswith("/media/"):
            return None
        rel = url[len("/media/"):]
        p = (self.base / rel).resolve()
        # Defensive: ensure inside base
        try:
            p.relative_to(self.base)
        except ValueError:
            return None
        return p

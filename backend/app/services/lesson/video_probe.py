"""Use ffprobe shell to extract video duration in seconds. Best-effort."""
from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path


async def probe_duration_seconds(path: Path) -> int | None:
    """Return duration as int seconds or None if probe fails."""
    if not shutil.which("ffprobe"):
        return None
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        data = json.loads(out)
        return int(float(data["format"]["duration"]))
    except Exception:
        return None

"""In-memory TTL cache for market data responses.

Supports different TTLs for different data categories:
- reference: long TTL (symbols/industries change rarely)
- history: medium TTL (daily data is stable intraday)
- realtime: short TTL (price boards, intraday)
"""

from __future__ import annotations

import time
from typing import Any


class TTLCache:
    """Simple in-memory TTL cache backed by a dict."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        """Get value if key exists and hasn't expired."""
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        """Set value with a TTL in seconds."""
        self._store[key] = (time.monotonic() + ttl_seconds, value)

    def invalidate(self, key: str) -> None:
        """Remove a specific key."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Clear all entries."""
        self._store.clear()

    def cleanup(self) -> int:
        """Remove all expired entries. Returns count of removed entries."""
        now = time.monotonic()
        expired = [k for k, (exp, _) in self._store.items() if now > exp]
        for k in expired:
            del self._store[k]
        return len(expired)


# Module-level singleton
_cache = TTLCache()


def get_cache() -> TTLCache:
    """Return the module-level TTLCache singleton."""
    return _cache

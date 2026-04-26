"""In-memory TTL cache for market data responses.

Supports different TTLs for different data categories:
- reference: long TTL (symbols/industries change rarely)
- history: medium TTL (daily data is stable intraday)
- realtime: short TTL (price boards, intraday)

Features:
- TTL expiry per key
- Max size with LRU eviction (oldest-accessed entries evicted first)
- Thread-safe cleanup
"""

from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any


class TTLCache:
    """In-memory TTL cache with max-size LRU eviction.

    NOT thread-safe. Designed for single-process async use within one
    event loop. If used from multiple threads, add external locking.
    """

    def __init__(self, max_size: int = 1000) -> None:
        self._store: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._max_size = max_size

    def get(self, key: str) -> Any | None:
        """Get value if key exists and hasn't expired. Moves key to end (LRU)."""
        entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        # Move to end (most recently used)
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        """Set value with a TTL in seconds. Evicts oldest if at max size."""
        if key in self._store:
            self._store.move_to_end(key)
        self._store[key] = (time.monotonic() + ttl_seconds, value)
        # Evict oldest entries if over max size
        while len(self._store) > self._max_size:
            self._store.popitem(last=False)

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

    @property
    def size(self) -> int:
        """Current number of live (non-expired) entries."""
        now = time.monotonic()
        return sum(1 for exp, _ in self._store.values() if now <= exp)

    @property
    def max_size(self) -> int:
        return self._max_size


# Module-level singleton
_cache: TTLCache | None = None


def get_cache() -> TTLCache:
    """Return the module-level TTLCache singleton."""
    global _cache  # noqa: PLW0603
    if _cache is None:
        from app.core.config import get_settings

        _cache = TTLCache(max_size=get_settings().MARKET_DATA_CACHE_MAX_SIZE)
    return _cache

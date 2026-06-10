"""High-level orchestration: registry chain + fallback execution.

Endpoints provide a registry key and a mapping of ``source_name -> async
callable`` (each callable returns ``(data, raw_endpoint_url)``). The orchestrator
resolves the ordered source chain from the registry (honouring an optional
``?source=`` override) and delegates to ``fetch_with_fallback`` to try each
source in priority order.

This replaces the previous pattern of building ``[("VCI", _vci), ("VND", _vnd)]``
lists by hand inside every endpoint.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.services.market_data.fallback import DataValidator, fetch_with_fallback
from app.services.market_data.registry import sources_for
from app.services.market_data.schemas import MarketDataResponse

SourceCallable = Callable[[], Awaitable[tuple[Any, str]]]


async def fetch_from_registry(
    key: str,
    handlers: dict[str, SourceCallable],
    *,
    override: str | None = None,
    validator: DataValidator | None = None,
    allow_empty: bool = False,
) -> MarketDataResponse:
    """Resolve the source chain for ``key`` and fetch with fallback.

    Args:
        key: Registry key, e.g. ``"quote.ohlcv"``.
        handlers: Map of upper-case source name -> async callable returning
            ``(data, raw_endpoint_url)``. Must cover every source the registry
            may select for ``key`` (after applying ``override``).
        override: Optional source name to force (from ``?source=``).
        validator: Optional data validator passed through to the fallback layer.
        allow_empty: Skip the validator entirely when empty data is valid.

    Raises:
        KeyError: If the registry key is unknown.
        RuntimeError: If every source in the resolved chain fails.
        ValueError: If a resolved source has no registered handler.
    """
    chain = sources_for(key, override)
    sources: list[tuple[str, SourceCallable]] = []
    for name in chain:
        fn = handlers.get(name)
        if fn is None:
            raise ValueError(
                f"No handler registered for source '{name}' (registry key '{key}')"
            )
        sources.append((name, fn))

    return await fetch_with_fallback(
        sources, validator=validator, allow_empty=allow_empty
    )

"""Multi-source fallback orchestration.

Runs through a list of async source callables in priority order.
Returns the first successful result, annotating metadata with source info.

Supports an optional ``validator`` callable to reject empty/invalid data
so the next source in the priority list is tried.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from app.services.market_data.schemas import MarketDataMeta, MarketDataResponse

logger = logging.getLogger(__name__)

SourceCallable = Callable[[], Awaitable[tuple[Any, str]]]
# Each callable returns (data, raw_endpoint_url)

DataValidator = Callable[[Any], bool]
# Returns True if data is considered valid/non-empty


def _default_validator(data: Any) -> bool:
    """Reject empty list, empty dict, and None as source failures."""
    if data is None:
        return False
    return not (isinstance(data, (list, dict)) and len(data) == 0)


async def fetch_with_fallback(
    sources: list[tuple[str, SourceCallable]],
    *,
    validator: DataValidator | None = None,
    allow_empty: bool = False,
) -> MarketDataResponse:
    """Try each (source_name, callable) in order; return first success.

    Each callable should return ``(data, raw_endpoint_url)`` on success
    or raise an exception on failure.

    Args:
        sources: Priority-ordered list of (name, async_callable).
        validator: Optional callable to check data validity.
                   Defaults to rejecting empty list/dict/None.
        allow_empty: If True, skip the validator entirely (for endpoints
                     where empty data is a valid response).

    If all sources fail, raises the last exception wrapped in a RuntimeError.
    """
    check = validator if validator is not None else _default_validator
    last_exc: Exception | None = None

    for priority, (source_name, fn) in enumerate(sources, start=1):
        try:
            data, raw_endpoint = await fn()

            # Validate data unless allow_empty is set
            if not allow_empty and not check(data):
                logger.warning(
                    "Source %s (priority %d) returned empty/invalid data, skipping",
                    source_name,
                    priority,
                )
                last_exc = ValueError(
                    f"Nguồn {source_name} trả về dữ liệu rỗng"
                )
                continue

            return MarketDataResponse(
                data=data,
                meta=MarketDataMeta(
                    source=source_name,
                    source_priority=priority,
                    fallback_used=priority > 1,
                    as_of=datetime.now(UTC),
                    raw_endpoint=raw_endpoint,
                ),
            )
        except Exception as exc:
            logger.warning(
                "Source %s (priority %d) failed: %s",
                source_name,
                priority,
                exc,
            )
            last_exc = exc

    # All failed
    msg = f"Tất cả {len(sources)} nguồn dữ liệu thị trường đều thất bại"
    if last_exc:
        raise RuntimeError(msg) from last_exc
    raise RuntimeError(msg)

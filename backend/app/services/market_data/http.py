"""Shared HTTP client for market data sources.

Provides a reusable httpx.AsyncClient with:
- Configurable timeouts
- Exponential backoff retry logic
- Source-specific headers matching vnstock's DEFAULT_HEADERS + HEADERS_MAPPING_SOURCE
- Support for form-encoded POST (data=) and JSON POST (json=)
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Default User-Agent pool (mimics vnstock browser profiles) ──
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/605.1.15 Version/16.3 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
]

# ── Default base headers (matches vnstock.core.utils.user_agent.DEFAULT_HEADERS) ──
_DEFAULT_BASE_HEADERS: dict[str, str] = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
    "Connection": "keep-alive",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "DNT": "1",
    "Pragma": "no-cache",
    "sec-ch-ua-platform": '"Windows"',
    "sec-ch-ua-mobile": "?0",
}

# ── Source-specific Referer/Origin (reverse-engineered from vnstock) ──
_SOURCE_HEADERS: dict[str, dict[str, str]] = {
    "VCI": {
        "Referer": "https://trading.vietcap.com.vn/",
        "Origin": "https://trading.vietcap.com.vn",
    },
    "VND": {
        "Referer": "https://mkw.vndirect.com.vn",
        "Origin": "https://mkw.vndirect.com.vn",
    },
    "CAFEF": {
        "Referer": "https://s.cafef.vn/lich-su-giao-dich-vnindex-3.chn",
        "Origin": "https://s.cafef.vn",
    },
    "KBS": {
        "Referer": "https://kbbuddywts.kbsec.com.vn/",
        "Origin": "https://kbbuddywts.kbsec.com.vn",
    },
    "MBK": {
        "Referer": "https://data.maybanktrade.com.vn",
        "Origin": "https://data.maybanktrade.com.vn",
    },
    "FMARKET": {
        "Referer": "https://fmarket.vn/",
        "Origin": "https://fmarket.vn",
    },
    "SPL": {},
    "RSS": {},
}

_DEFAULT_TIMEOUT = 15.0
_MAX_RETRIES = 3
_BACKOFF_BASE = 0.5


def get_headers(source: str, random_agent: bool = True) -> dict[str, str]:
    """Build browser-like headers for a given data source.

    Matches vnstock DEFAULT_HEADERS + per-source Referer/Origin.
    """
    ua = random.choice(_USER_AGENTS) if random_agent else _USER_AGENTS[0]
    headers = _DEFAULT_BASE_HEADERS.copy()
    headers["User-Agent"] = ua
    source_extra = _SOURCE_HEADERS.get(source.upper(), {})
    headers.update(source_extra)
    return headers


async def fetch_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | list[Any] | None = None,
    form_data: str | None = None,
    timeout: float = _DEFAULT_TIMEOUT,
    max_retries: int = _MAX_RETRIES,
    source: str = "UNKNOWN",
) -> Any:
    """Fetch JSON from an upstream API with retries and exponential backoff.

    Args:
        json_body: Send as JSON (Content-Type: application/json)
        form_data: Send as raw form-encoded body (Content-Type already in headers)

    Returns the parsed JSON response body.
    Raises httpx.HTTPStatusError for 4xx/5xx after all retries exhausted.
    """
    if headers is None:
        headers = get_headers(source)

    last_exc: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if method.upper() == "POST":
                    if form_data is not None:
                        # Form-encoded body (e.g. MBK macro)
                        resp = await client.post(
                            url,
                            headers=headers,
                            params=params,
                            content=form_data.encode("utf-8"),
                        )
                    else:
                        resp = await client.post(
                            url,
                            headers=headers,
                            params=params,
                            json=json_body,
                        )
                else:
                    resp = await client.get(
                        url,
                        headers=headers,
                        params=params,
                    )

                resp.raise_for_status()
                return resp.json()

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_exc = exc
            if attempt < max_retries:
                delay = _BACKOFF_BASE * (2 ** (attempt - 1)) + random.uniform(0, 0.3)
                logger.warning(
                    "market_data[%s] attempt %d/%d failed (%s), retrying in %.1fs",
                    source,
                    attempt,
                    max_retries,
                    type(exc).__name__,
                    delay,
                )
                await asyncio.sleep(delay)

        except httpx.HTTPStatusError as exc:
            # Don't retry client errors (4xx)
            if 400 <= exc.response.status_code < 500:
                raise
            last_exc = exc
            if attempt < max_retries:
                delay = _BACKOFF_BASE * (2 ** (attempt - 1))
                logger.warning(
                    "market_data[%s] attempt %d/%d got HTTP %d, retrying in %.1fs",
                    source,
                    attempt,
                    max_retries,
                    exc.response.status_code,
                    delay,
                )
                await asyncio.sleep(delay)

    # All retries exhausted
    if last_exc:
        raise last_exc
    msg = f"All {max_retries} retries exhausted for {url}"
    raise httpx.ConnectError(msg)

"""Vietcap Screening (IQ Insight) source connector.

Fetches screening criteria, paging results, and preset screeners
from iq.vietcap.com.vn.

Upstream APIs:
- Screening criteria:  GET  .../screening/criteria
- Screening paging:    POST .../screening/paging
- Preset screeners:    GET  .../setting/screeners

Exception hierarchy:
- ScreeningUpstreamShapeError → 502
- ScreeningUpstreamError      → 503
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.market_data.http import fetch_json, get_headers

logger = logging.getLogger(__name__)

_IQ_BASE = "https://iq.vietcap.com.vn/api/iq-insight-service"


# ── Exceptions ───────────────────────────────────────


class ScreeningUpstreamShapeError(Exception):
    """Upstream returned data in unexpected shape."""


class ScreeningUpstreamError(Exception):
    """Upstream transport/connection failure."""


# ── Headers ──────────────────────────────────────────


def _iq_headers() -> dict[str, str]:
    h = get_headers("VCI")
    h["Accept"] = "application/json"
    h["Referer"] = "https://trading.vietcap.com.vn/iq/screening"
    return h


# ── Shape validators ────────────────────────────────


def _unwrap(data: Any, url: str) -> Any:
    """Unwrap IQ API response: {status, data}."""
    if not isinstance(data, dict):
        raise ScreeningUpstreamShapeError(
            f"Expected dict from {url}, got {type(data).__name__}",
        )
    return data.get("data")


def _require_list(data: Any, label: str) -> list[Any]:
    if not isinstance(data, list):
        raise ScreeningUpstreamShapeError(
            f"Expected list from {label}, got {type(data).__name__}",
        )
    return data


def _require_dict(data: Any, label: str) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ScreeningUpstreamShapeError(
            f"Expected dict from {label}, got {type(data).__name__}",
        )
    return data


# ── Transport ────────────────────────────────────────


async def _get_iq(
    path: str, params: dict[str, Any] | None = None,
) -> tuple[Any, str]:
    url = f"{_IQ_BASE}{path}"
    try:
        data = await fetch_json(url, params=params, headers=_iq_headers())
    except Exception as exc:
        raise ScreeningUpstreamError(f"GET {path}: {exc}") from exc
    return data, url


async def _post_iq(
    path: str, body: dict[str, Any],
) -> tuple[Any, str]:
    url = f"{_IQ_BASE}{path}"
    try:
        data = await fetch_json(
            url, method="POST", json_body=body, headers=_iq_headers(),
        )
    except Exception as exc:
        raise ScreeningUpstreamError(f"POST {path}: {exc}") from exc
    return data, url


# ══════════════════════════════════════════════════════
# 1. Screening Criteria
# ══════════════════════════════════════════════════════


async def fetch_screening_criteria() -> tuple[list[dict[str, Any]], str]:
    """Fetch all 34 screening criteria with condition options.

    Each criterion includes: id, category, name, selectType,
    min/max, conditionOptions, conditionExtra, etc.
    """
    data, url = await _get_iq("/v1/screening/criteria")
    inner = _unwrap(data, url)
    items = _require_list(inner, "screening/criteria")

    result: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        result.append({
            "id": item.get("id", ""),
            "category": item.get("category", ""),
            "name": item.get("name", ""),
            "order": item.get("order"),
            "allow_duplicate": item.get("allowDuplicate", False),
            "select_type": item.get("selectType", ""),
            "slider_stepper": item.get("sliderStepper"),
            "multiplier": item.get("multiplier"),
            "min": item.get("min"),
            "max": item.get("max"),
            "condition_options": item.get("conditionOptions", []),
            "condition_extra": item.get("conditionExtra"),
            "active": item.get("active", True),
        })
    return result, url


# ══════════════════════════════════════════════════════
# 2. Screening Paging (Search)
# ══════════════════════════════════════════════════════


async def fetch_screening_paging(
    *,
    page: int = 0,
    page_size: int = 50,
    sort_fields: list[str] | None = None,
    sort_orders: list[str] | None = None,
    filters: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], str]:
    """Fetch screened stocks with pagination and filtering.

    Returns paginated content with total count.
    """
    body: dict[str, Any] = {
        "page": page,
        "pageSize": page_size,
        "sortFields": sort_fields or ["stockStrength"],
        "sortOrders": sort_orders or ["DESC"],
        "filter": filters or [],
    }
    data, url = await _post_iq("/v1/screening/paging", body)
    inner = _unwrap(data, url)
    inner = _require_dict(inner, "screening/paging")

    content = inner.get("content", [])
    _require_list(content, "screening/paging.content")

    stocks: list[dict[str, Any]] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        stocks.append({
            "ticker": item.get("ticker", ""),
            "exchange": item.get("exchange", ""),
            "ref_price": item.get("refPrice"),
            "ceiling": item.get("ceiling"),
            "market_price": item.get("marketPrice"),
            "floor": item.get("floor"),
            "accumulated_value": item.get("accumulatedValue"),
            "accumulated_volume": item.get("accumulatedVolume"),
            "market_cap": item.get("marketCap"),
            "daily_price_change_percent": item.get("dailyPriceChangePercent"),
            "en_organ_name": item.get("enOrganName", ""),
            "vi_organ_name": item.get("viOrganName", ""),
            "en_organ_short_name": item.get("enOrganShortName", ""),
            "vi_organ_short_name": item.get("viOrganShortName", ""),
            "icb_code_lv2": item.get("icbCodeLv2", ""),
            "en_sector": item.get("enSector", ""),
            "vi_sector": item.get("viSector", ""),
            "icb_code_lv4": item.get("icbCodeLv4", ""),
            "stock_strength": item.get("stockStrength"),
        })

    return {
        "content": stocks,
        "total_elements": inner.get("totalElements", 0),
        "total_pages": inner.get("totalPages", 0),
        "page": inner.get("number", page),
        "page_size": inner.get("size", page_size),
        "first": inner.get("first", True),
        "last": inner.get("last", False),
        "empty": inner.get("empty", False),
    }, url


# ══════════════════════════════════════════════════════
# 3. Preset Screeners
# ══════════════════════════════════════════════════════


async def fetch_preset_screeners() -> tuple[dict[str, Any], str]:
    """Fetch preset screeners (system + user if authenticated).

    Returns dict with SYSTEM (and optionally USER) screener lists.
    """
    data, url = await _get_iq("/v1/setting/screeners")
    inner = _unwrap(data, url)
    inner = _require_dict(inner, "setting/screeners")

    result: dict[str, Any] = {}
    for category_key, screener_list in inner.items():
        if not isinstance(screener_list, list):
            continue
        normalized: list[dict[str, Any]] = []
        for s in screener_list:
            if not isinstance(s, dict):
                continue
            normalized.append({
                "id": s.get("id", ""),
                "name": s.get("name", ""),
                "vi_name": s.get("viName", ""),
                "mode": s.get("mode", ""),
                "order": s.get("order"),
                "metrics": s.get("metrics", []),
            })
        result[category_key] = normalized
    return result, url

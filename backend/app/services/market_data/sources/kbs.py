"""KBS (KB Securities) data source connector — company profile & news.

Upstream API:
- Profile: https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile/{symbol}?l=1
- News:    https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/news/{symbol}?l=1&p=1&s={size}

Field mappings derived from vnstock_data/explorer/kbs/const.py.
"""

from __future__ import annotations

import contextlib
import re
from typing import Any

from app.services.market_data.http import fetch_json

_SOURCE = "KBS"
_STOCKINFO_BASE = "https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo"

# KBS requires these specific headers
_KBS_HEADERS: dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
    ),
    "Referer": "https://kbbuddywts.kbsec.com.vn/6d054136-b880-4c8b-887b-90311120d1c4",
    "Origin": "https://kbbuddywts.kbsec.com.vn",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
}

# ── Exchange code map (from const.py _EXCHANGE_CODE_MAP) ──────────
_EXCHANGE_CODE_MAP = {"HOSE": "HOSE", "HSX": "HOSE", "HNX": "HNX", "UPCOM": "UPCOM", "XHNF": "HNX"}

# ── Profile field map (from const.py _COMPANY_PROFILE_MAP) ───────
_PROFILE_MAP: dict[str, str] = {
    "SM": "business_model",
    "SB": "symbol",
    "FD": "founded_date",
    "CC": "charter_capital_raw",  # in millions VND, converted later
    "HM": "number_of_employees",
    "LD": "listing_date",
    "FV": "par_value_raw",  # in VND (actual)
    "EX": "exchange",
    "LP": "listing_price_raw",  # in VND (actual)
    "VL": "listed_volume_raw",  # in millions shares, converted later
    "CTP": "ceo_name",
    "CTPP": "ceo_position",
    "IS": "inspector_name",
    "ISP": "inspector_position",
    "FP": "establishment_license",
    "BP": "business_code",
    "TC": "tax_id",
    "KT": "auditor",
    "TY": "company_type",
    "ADD": "address",
    "PHONE": "phone",
    "FAX": "fax",
    "EMAIL": "email",
    "URL": "website",
    "BRANCH": "branches",
    "HS": "history",
    "KLCPNY": "free_float_vnd",  # actual VND (not millions)
    "SFV": "free_float_shares",  # actual share count
    "KLCPLH": "outstanding_shares",  # actual share count
    "AD": "as_of_date",
}

# Fields from KBS that are in millions and need to be converted
_MILLION_FIELDS = {"charter_capital_raw", "listed_volume_raw"}

# ── Sub-entity maps (from const.py) ─────────────────────────────
_SHAREHOLDERS_MAP: dict[str, str] = {
    "NM": "name",
    "D": "date",
    "V": "shares_owned",
    "OR": "ownership_percentage",
}

_LEADERS_MAP: dict[str, str] = {
    "FD": "from_date",
    "PN": "position",
    "NM": "name",
    "PO": "position_en",
    "PI": "owner_code",
}

_SUBSIDIARIES_MAP: dict[str, str] = {
    "D": "date",
    "NM": "name",
    "CC": "charter_capital",
    "OR": "ownership_percent",
    "CR": "currency",
}


def _strip_html(text: str | None) -> str:
    """Remove HTML tags from a string."""
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).strip()


# ════════════════════════════════════════════════════════
# Profile fetch (one call, cached per request)
# ════════════════════════════════════════════════════════


async def fetch_company_profile(symbol: str) -> tuple[dict[str, Any], str]:
    """Fetch full company profile from KBS.

    Returns (raw_data_dict, url_used).
    """
    url = f"{_STOCKINFO_BASE}/profile/{symbol.upper()}"
    data = await fetch_json(
        url,
        headers=_KBS_HEADERS,
        params={"l": 1},
        source=_SOURCE,
    )
    if not isinstance(data, dict) or not data:
        return {}, url
    return data, url


# ════════════════════════════════════════════════════════
# Normalize functions
# ════════════════════════════════════════════════════════


def normalize_overview(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize raw KBS profile into snake_case overview dict.

    KBS returns CC/VL in millions.  We convert them to actual units:
    - charter_capital → VND (CC × 1_000_000)
    - listed_volume → shares (VL × 1_000_000)
    - par_value, listing_price → VND (already actual)
    - outstanding_shares (KLCPLH) → already actual share count
    """
    if not raw:
        return {}
    result: dict[str, Any] = {}
    for kbs_key, snake_key in _PROFILE_MAP.items():
        if kbs_key in raw:
            val = raw[kbs_key]
            # Strip HTML from text fields
            if isinstance(val, str) and ("<" in val or "&" in val):
                val = _strip_html(val)
            result[snake_key] = val

    # Normalize exchange code
    if "exchange" in result:
        result["exchange"] = _EXCHANGE_CODE_MAP.get(str(result["exchange"]), result["exchange"])

    # Convert million-unit fields to actual values and rename to final keys
    for raw_key, final_key, multiplier in [
        ("charter_capital_raw", "charter_capital", 1_000_000),
        ("listed_volume_raw", "listed_volume", 1_000_000),
    ]:
        if raw_key in result:
            with contextlib.suppress(ValueError, TypeError):
                result[final_key] = int(float(result[raw_key]) * multiplier)
            del result[raw_key]

    # par_value and listing_price: rename from _raw to final (already actual units)
    for raw_key, final_key in [("par_value_raw", "par_value"), ("listing_price_raw", "listing_price")]:
        if raw_key in result:
            result[final_key] = result.pop(raw_key)

    # Employee count from LaborStructure
    labor = raw.get("LaborStructure")
    if isinstance(labor, list) and labor:
        total = 0
        for item in labor:
            v = item.get("Value")
            if v is not None:
                with contextlib.suppress(ValueError, TypeError):
                    total += int(v)
        if total > 0:
            result["number_of_employees"] = total

    return result


def normalize_shareholders(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract and normalize shareholders from KBS profile."""
    items = raw.get("Shareholders")
    if not isinstance(items, list) or not items:
        return []
    return [
        {snake: item.get(kbs) for kbs, snake in _SHAREHOLDERS_MAP.items()}
        for item in items
    ]


def normalize_officers(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract and normalize officers/leaders from KBS profile."""
    items = raw.get("Leaders")
    if not isinstance(items, list) or not items:
        return []
    return [
        {snake: item.get(kbs) for kbs, snake in _LEADERS_MAP.items()}
        for item in items
    ]


def normalize_subsidiaries(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract and normalize subsidiaries from KBS profile."""
    items = raw.get("Subsidiaries")
    if not isinstance(items, list) or not items:
        return []
    result = []
    for item in items:
        row: dict[str, Any] = {snake: item.get(kbs) for kbs, snake in _SUBSIDIARIES_MAP.items()}
        pct = row.get("ownership_percent")
        if pct is not None:
            try:
                row["type"] = "subsidiary" if float(pct) > 50 else "affiliate"
            except (ValueError, TypeError):
                row["type"] = "unknown"
        result.append(row)
    return result


# ════════════════════════════════════════════════════════
# News (separate endpoint)
# ════════════════════════════════════════════════════════


async def fetch_company_news(
    symbol: str,
    *,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch company news from KBS.

    Returns (normalized_list, url_used).
    """
    url = f"{_STOCKINFO_BASE}/news/{symbol.upper()}"
    data = await fetch_json(
        url,
        headers=_KBS_HEADERS,
        params={"l": 1, "p": page, "s": page_size},
        source=_SOURCE,
    )
    if not isinstance(data, list):
        return [], url

    news: list[dict[str, Any]] = []
    for item in data:
        news.append(
            {
                "article_id": item.get("ArticleID"),
                "title": item.get("Title", ""),
                "summary": _strip_html(item.get("Head", "")),
                "url": item.get("URL", ""),
                "published_at": item.get("PublishTime", ""),
            }
        )
    return news, url

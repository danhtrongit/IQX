"""Vietcombank exchange-rate data source connector.

Upstream API: https://www.vietcombank.com.vn/api/exchangerates
``date`` query param is REQUIRED (missing → 404).
"""

from __future__ import annotations

from typing import Any

from app.services.market_data.http import fetch_json, get_headers

_SOURCE = "VCB"
_URL = "https://www.vietcombank.com.vn/api/exchangerates"


def _parse(value: str | None) -> float | None:
    if value is None or value == "-":
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


async def fetch_fx(date: str) -> tuple[list[dict[str, Any]], str]:
    """Fetch Vietcombank exchange rates for a date (YYYY-MM-DD)."""
    data = await fetch_json(
        _URL,
        method="GET",
        headers=get_headers(_SOURCE),
        params={"date": date},
        source=_SOURCE,
    )

    rows = data.get("Data", []) if isinstance(data, dict) else []
    as_of = (data.get("Date", "") if isinstance(data, dict) else "")[:10]
    records: list[dict[str, Any]] = [
        {
            "currency_code": r.get("currencyCode"),
            "currency_name": r.get("currencyName"),
            "buy_cash": _parse(r.get("cash")),
            "buy_transfer": _parse(r.get("transfer")),
            "sell": _parse(r.get("sell")),
            "date": as_of or date,
        }
        for r in (rows or [])
    ]
    return records, _URL

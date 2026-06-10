"""SJC gold price data source connector.

Upstream API: https://sjc.com.vn/GoldPrice/Services/PriceService.ashx
POST form-encoded; ``toDate`` is DD/MM/YYYY. BuyValue/SellValue are absolute VND.
"""

from __future__ import annotations

from typing import Any

from app.services.market_data.http import fetch_json, get_headers

_SOURCE = "SJC"
_URL = "https://sjc.com.vn/GoldPrice/Services/PriceService.ashx"


def _to_sjc_date(iso: str) -> str:
    """Convert YYYY-MM-DD → DD/MM/YYYY (the format SJC expects)."""
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


async def fetch_gold(date: str) -> tuple[list[dict[str, Any]], str]:
    """Fetch SJC gold prices for a given trade date (YYYY-MM-DD)."""
    headers = get_headers(_SOURCE)
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"

    from urllib.parse import quote

    body = f"method=GetSJCGoldPriceByDate&toDate={quote(_to_sjc_date(date), safe='')}"
    data = await fetch_json(
        _URL, method="POST", headers=headers, form_data=body, source=_SOURCE
    )

    rows = data.get("data", []) if isinstance(data, dict) else []
    records: list[dict[str, Any]] = [
        {
            "date": date,
            "name": r.get("TypeName"),
            "branch": r.get("BranchName"),
            "buy_price": r.get("BuyValue"),
            "sell_price": r.get("SellValue"),
        }
        for r in (rows or [])
    ]
    return records, _URL

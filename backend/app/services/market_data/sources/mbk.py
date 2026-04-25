"""MBK/Maybank Trade data source connector for macroeconomic data.

Upstream API: https://data.maybanktrade.com.vn/
"""

from __future__ import annotations

from typing import Any

from app.services.market_data.http import fetch_json, get_headers

_SOURCE = "MBK"
_BASE_URL = "https://data.maybanktrade.com.vn/"

_REPORT_PERIOD = {"day": "1", "month": "2", "quarter": "3", "year": "4"}

_TYPE_ID = {
    "gdp": "43",
    "cpi": "52",
    "industrial_production": "46",
    "export_import": "48",
    "retail": "47",
    "fdi": "50",
    "money_supply": "51",
    "exchange_rate": "53",
    "population_labor": "55",
    "interest_rate": "66",
}

VALID_INDICATORS = set(_TYPE_ID.keys())


async def fetch_macro_data(
    indicator: str,
    *,
    start_year: int = 2015,
    end_year: int | None = None,
    period: str = "quarter",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch macroeconomic data from Maybank Trade.

    indicator: gdp, cpi, fdi, exchange_rate, interest_rate, money_supply, etc.
    period: day, month, quarter, year
    """
    import re
    from datetime import datetime

    if indicator not in _TYPE_ID:
        msg = f"Unknown indicator '{indicator}'. Valid: {sorted(_TYPE_ID.keys())}"
        raise ValueError(msg)

    if end_year is None:
        end_year = datetime.now().year

    period_type = _REPORT_PERIOD.get(period, "3")
    norm_type_id = _TYPE_ID[indicator]

    url = f"{_BASE_URL}data/reportdatatopbynormtype"
    headers = get_headers(_SOURCE)
    # Remove default JSON Content-Type, set form-urlencoded (key case must match)
    headers.pop("Content-Type", None)
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"

    # MBK uses form-encoded body
    payload_str = (
        f"type={period_type}&fromYear={start_year}&toYear={end_year}"
        f"&from=0&to=0&normTypeID={norm_type_id}"
    )

    data = await fetch_json(
        url,
        method="POST",
        headers=headers,
        form_data=payload_str,
        source=_SOURCE,
    )

    records: list[dict[str, Any]] = []
    if isinstance(data, list):
        for item in data:
            # camelCase to snake_case
            row: dict[str, Any] = {}
            for k, v in item.items():
                snake = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", k)
                snake = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", snake).lower()
                # Clean up common prefixes
                snake = (
                    snake.replace("tern_", "")
                    .replace("norm_", "")
                    .replace("term_", "")
                    .replace("from_", "")
                    .replace("_code", "")
                )
                row[snake] = v
            records.append(row)

    return records, url

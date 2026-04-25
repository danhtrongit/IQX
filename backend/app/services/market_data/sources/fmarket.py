"""Fmarket data source connector for mutual fund data.

Upstream API: https://api.fmarket.vn/res/products/
"""

from __future__ import annotations

from typing import Any

import httpx

from app.services.market_data.http import fetch_json, get_headers

_SOURCE = "FMARKET"
_BASE_URL = "https://api.fmarket.vn/res/products"


async def fetch_fund_listing(
    fund_type: str = "",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch all open-end fund listing from Fmarket.

    fund_type: '', 'BALANCED', 'BOND', 'STOCK'
    """
    url = f"{_BASE_URL}/filter"
    headers = get_headers(_SOURCE)

    fund_type_map = {
        "": [],
        "BALANCED": ["BALANCED"],
        "BOND": ["BOND"],
        "STOCK": ["STOCK"],
    }

    payload = {
        "types": ["NEW_FUND", "TRADING_FUND"],
        "issuerIds": [],
        "sortOrder": "DESC",
        "sortField": "navTo6Months",
        "page": 1,
        "pageSize": 100,
        "isIpo": False,
        "fundAssetTypes": fund_type_map.get(fund_type.upper(), []),
        "bondRemainPeriods": [],
        "searchField": "",
        "isBuyByReward": False,
        "thirdAppIds": [],
    }

    data = await fetch_json(
        url, method="POST", headers=headers, json_body=payload, source=_SOURCE
    )

    records: list[dict[str, Any]] = []
    rows = []
    if isinstance(data, dict):
        rows = data.get("data", {}).get("rows", [])

    for item in rows:
        nav_change = item.get("productNavChange", {}) or {}
        records.append({
            "fund_id": item.get("id"),
            "short_name": item.get("shortName", ""),
            "name": item.get("name", ""),
            "fund_type": (item.get("dataFundAssetType", {}) or {}).get("name", ""),
            "fund_owner": (item.get("owner", {}) or {}).get("name", ""),
            "management_fee": item.get("managementFee"),
            "inception_date": item.get("firstIssueAt"),
            "nav": item.get("nav"),
            "code": item.get("code", ""),
            "nav_change_1m": nav_change.get("navTo1Months"),
            "nav_change_3m": nav_change.get("navTo3Months"),
            "nav_change_6m": nav_change.get("navTo6Months"),
            "nav_change_12m": nav_change.get("navTo12Months"),
            "nav_change_36m": nav_change.get("navTo36Months"),
            "nav_update_at": nav_change.get("updateAt"),
        })

    return records, url


async def fetch_fund_details(
    fund_id: int,
) -> tuple[dict[str, Any], str]:
    """Fetch fund details including top holdings, industry holdings, asset holdings.

    Raises ValueError for invalid/non-existent fund_id.
    """
    url = f"{_BASE_URL}/{fund_id}"
    headers = get_headers(_SOURCE)

    try:
        data = await fetch_json(url, headers=headers, source=_SOURCE)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            raise ValueError(f"Fund {fund_id} not found") from exc
        raise

    result: dict[str, Any] = {}
    if isinstance(data, dict):
        fund_data = data.get("data", {})

        # Top holdings
        top_holdings = fund_data.get("productTopHoldingList", [])
        bond_holdings = fund_data.get("productTopHoldingBondList", [])
        result["top_holdings"] = [
            {
                "stock_code": h.get("stockCode", ""),
                "industry": h.get("industry", ""),
                "net_asset_percent": h.get("netAssetPercent"),
                "type": h.get("type", ""),
            }
            for h in (top_holdings or []) + (bond_holdings or [])
        ]

        # Industry holdings
        industry_holdings = fund_data.get("productIndustriesHoldingList", [])
        result["industry_holdings"] = [
            {
                "industry": h.get("industry", ""),
                "net_asset_percent": h.get("assetPercent"),
            }
            for h in (industry_holdings or [])
        ]

        # Asset holdings
        asset_holdings = fund_data.get("productAssetHoldingList", [])
        result["asset_holdings"] = [
            {
                "asset_type": (h.get("assetType", {}) or {}).get("name", ""),
                "asset_percent": h.get("assetPercent"),
            }
            for h in (asset_holdings or [])
        ]

    return result, url


async def fetch_fund_nav_history(
    fund_id: int,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch NAV history for a fund.

    Raises ValueError for invalid/non-existent fund_id.
    """
    from datetime import datetime

    url = f"{_BASE_URL[:-1]}/get-nav-history"
    headers = get_headers(_SOURCE)

    payload = {
        "isAllData": 1,
        "productId": fund_id,
        "fromDate": None,
        "toDate": datetime.now().strftime("%Y%m%d"),
    }

    try:
        data = await fetch_json(
            url, method="POST", headers=headers, json_body=payload, source=_SOURCE
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            raise ValueError(f"Fund {fund_id} not found") from exc
        raise

    records: list[dict[str, Any]] = []
    items = data.get("data", []) if isinstance(data, dict) else []
    for item in items:
        records.append({
            "date": item.get("navDate"),
            "nav_per_unit": item.get("nav"),
        })

    return records, url

"""VCI/Vietcap data source connector.

Upstream APIs:
- Trading: https://trading.vietcap.com.vn/api/
- IQ Insight: https://iq.vietcap.com.vn/api/iq-insight-service/
"""

from __future__ import annotations

import re
from typing import Any

from app.services.market_data.http import fetch_json, get_headers

_SOURCE = "VCI"
_TRADING_BASE = "https://trading.vietcap.com.vn/api"
_IQ_BASE = "https://iq.vietcap.com.vn/api/iq-insight-service"


def _to_num(val: Any) -> float:
    """Safely convert a numeric string or number to float. Returns 0.0 on failure."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0

# Valid groups from vnstock VCI listing
VALID_GROUPS = {
    "HOSE",
    "VN30",
    "VNMidCap",
    "VNSmallCap",
    "VNAllShare",
    "VN100",
    "ETF",
    "HNX",
    "HNX30",
    "HNXCon",
    "HNXFin",
    "HNXLCap",
    "HNXMSCap",
    "HNXMan",
    "UPCOM",
    "FU_INDEX",
    "CW",
    "BOND",
}

# Interval mapping (vnstock_data/explorer/vci/const.py)
INTERVAL_MAP = {
    "1D": "ONE_DAY",
    "1W": "ONE_WEEK",
    "1M": "ONE_MONTH",
}


def _camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case."""
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


# ══════════════════════════════════════════════════════
# Reference data
# ══════════════════════════════════════════════════════


async def fetch_symbols_by_exchange() -> tuple[list[dict[str, Any]], str]:
    """Fetch all symbols from VCI trading API.

    Returns (records, raw_endpoint_url).
    """
    url = f"{_TRADING_BASE}/price/symbols/getAll"
    headers = get_headers(_SOURCE)
    data = await fetch_json(url, headers=headers, source=_SOURCE)

    records: list[dict[str, Any]] = []
    for item in data:
        records.append(
            {
                "symbol": item.get("symbol", ""),
                "name": item.get("organName", item.get("organ_name", "")),
                "exchange": _normalize_exchange(item.get("board", "")),
                "asset_type": item.get("type", "").lower() if item.get("type") else None,
            }
        )

    return records, url


async def fetch_industries_icb() -> tuple[list[dict[str, Any]], str]:
    """Fetch ICB industry classification from VCI."""
    url = f"{_IQ_BASE}/v1/sectors/icb-codes"
    headers = get_headers(_SOURCE)
    data = await fetch_json(url, headers=headers, source=_SOURCE)

    records: list[dict[str, Any]] = []
    items = data.get("data", data) if isinstance(data, dict) else data
    if isinstance(items, list):
        for item in items:
            records.append(
                {
                    "icb_code": item.get("name", ""),
                    "icb_name": item.get("viSector", ""),
                    "en_icb_name": item.get("enSector", ""),
                    "level": item.get("icbLevel"),
                }
            )

    return records, url


async def fetch_symbols_by_group(group: str) -> tuple[list[dict[str, Any]], str]:
    """Fetch symbols for a specific index group from VCI."""
    url = f"{_TRADING_BASE}/price/symbols/getByGroup?group={group}"
    headers = get_headers(_SOURCE)
    data = await fetch_json(url, headers=headers, source=_SOURCE)

    records: list[dict[str, Any]] = []
    if isinstance(data, list):
        for item in data:
            symbol = item.get("symbol", item) if isinstance(item, dict) else str(item)
            records.append({"symbol": symbol})

    return records, url


# ══════════════════════════════════════════════════════
# OHLCV quotes
# ══════════════════════════════════════════════════════


async def fetch_ohlcv(
    symbol: str,
    *,
    start_ts: int,
    end_ts: int,
    interval: str = "1D",
    count_back: int = 1000,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch OHLCV data from VCI chart API.

    Args:
        symbol: Stock symbol (e.g. 'VCB')
        start_ts: Unix timestamp for start
        end_ts: Unix timestamp for end
        interval: One of '1D', '1W', '1M'
        count_back: Number of candles to request
    """
    url = f"{_TRADING_BASE}/chart/OHLCChart/gap-chart"
    headers = get_headers(_SOURCE)
    time_frame = INTERVAL_MAP.get(interval, "ONE_DAY")

    payload = {
        "timeFrame": time_frame,
        "symbols": [symbol.upper()],
        "to": end_ts,
        "countBack": count_back,
    }

    data = await fetch_json(
        url,
        method="POST",
        headers=headers,
        json_body=payload,
        source=_SOURCE,
    )

    records: list[dict[str, Any]] = []
    if data and isinstance(data, list) and len(data) > 0:
        chart = data[0]
        times = chart.get("t", [])
        opens = chart.get("o", [])
        highs = chart.get("h", [])
        lows = chart.get("l", [])
        closes = chart.get("c", [])
        volumes = chart.get("v", [])

        for i in range(len(times)):
            records.append(
                {
                    "time": times[i],
                    "open": opens[i] if i < len(opens) else 0,
                    "high": highs[i] if i < len(highs) else 0,
                    "low": lows[i] if i < len(lows) else 0,
                    "close": closes[i] if i < len(closes) else 0,
                    "volume": volumes[i] if i < len(volumes) else 0,
                }
            )

    return records, url


# ══════════════════════════════════════════════════════
# Intraday & Price depth
# ══════════════════════════════════════════════════════


async def fetch_intraday(
    symbol: str,
    *,
    page_size: int = 100,
    last_time: str | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch intraday tick data from VCI LEData API."""
    url = f"{_TRADING_BASE}/market-watch/LEData/getAll"
    headers = get_headers(_SOURCE)
    payload: dict[str, Any] = {"symbol": symbol.upper(), "limit": page_size}
    if last_time:
        payload["truncTime"] = last_time

    data = await fetch_json(
        url, method="POST", headers=headers, json_body=payload, source=_SOURCE
    )

    records: list[dict[str, Any]] = []
    if isinstance(data, list):
        for item in data:
            # VCI live keys: truncTime, matchPrice, matchVol, matchType,
            #                accumulatedVolume, accumulatedValue
            records.append(
                {
                    "time": item.get("truncTime", ""),
                    "price": _to_num(item.get("matchPrice")),
                    "volume": _to_num(item.get("matchVol")),
                    "side": item.get("matchType", ""),
                    "accumulated_volume": _to_num(item.get("accumulatedVolume")),
                    "accumulated_value": _to_num(item.get("accumulatedValue")),
                }
            )

    return records, url


async def fetch_price_depth(symbol: str) -> tuple[list[dict[str, Any]], str]:
    """Fetch accumulated price-step volume data from VCI."""
    url = f"{_TRADING_BASE}/market-watch/AccumulatedPriceStepVol/getSymbolData"
    headers = get_headers(_SOURCE)
    payload = {"symbol": symbol.upper()}

    data = await fetch_json(
        url, method="POST", headers=headers, json_body=payload, source=_SOURCE
    )

    records: list[dict[str, Any]] = []
    if isinstance(data, list):
        for item in data:
            records.append(
                {
                    "price": _to_num(item.get("priceStep")),
                    "volume": _to_num(item.get("accumulatedVolume")),
                    "buy_volume": _to_num(item.get("accumulatedBuyVolume")),
                    "sell_volume": _to_num(item.get("accumulatedSellVolume")),
                    "undefined_volume": _to_num(item.get("accumulatedUndefinedVolume")),
                }
            )

    return records, url


# ══════════════════════════════════════════════════════
# Price board
# ══════════════════════════════════════════════════════


async def fetch_price_board(
    symbols: list[str],
) -> tuple[list[dict[str, Any]], str]:
    """Fetch realtime price board from VCI for a list of symbols."""
    url = f"{_TRADING_BASE}/price/symbols/getList"
    headers = get_headers(_SOURCE)
    payload = {"symbols": [s.upper() for s in symbols]}

    data = await fetch_json(
        url, method="POST", headers=headers, json_body=payload, source=_SOURCE
    )

    records: list[dict[str, Any]] = []
    if isinstance(data, list):
        for item in data:
            listing = item.get("listingInfo", {})
            match = item.get("matchPrice", {})
            records.append(
                {
                    "symbol": listing.get("symbol", ""),
                    "exchange": _normalize_exchange(listing.get("board", "")),
                    "ceiling_price": listing.get("ceiling"),
                    "floor_price": listing.get("floor"),
                    "reference_price": listing.get("refPrice"),
                    "open_price": match.get("openPrice"),
                    "high_price": match.get("highest"),
                    "low_price": match.get("lowest"),
                    "close_price": match.get("matchPrice"),
                    "average_price": match.get("avgMatchPrice"),
                    "total_volume": match.get("accumulatedVolume"),
                    "total_value": match.get("accumulatedValue"),
                }
            )

    return records, url


# ══════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════


def _normalize_exchange(raw: str) -> str:
    """Normalize exchange codes (HSX → HOSE)."""
    mapping = {"HSX": "HOSE", "HNX": "HNX", "UPCOM": "UPCOM"}
    return mapping.get(raw, raw)


# ══════════════════════════════════════════════════════
# Company data (GraphQL)
# ══════════════════════════════════════════════════════

# GraphQL query reverse-engineered from vci/company.py (line 38)
# Uses \n-separated fields matching vnstock's exact format
_COMPANY_GRAPHQL_QUERY = (
    "query Query($ticker: String!, $lang: String!) {\n"
    "  CompanyListingInfo(ticker: $ticker) {\n"
    "    id\n    issueShare\n    en_History\n    history\n"
    "    en_CompanyProfile\n    companyProfile\n"
    "    icbName3\n    enIcbName3\n    icbName2\n    enIcbName2\n"
    "    icbName4\n    enIcbName4\n"
    "    financialRatio {\n      id\n      ticker\n      issueShare\n"
    "      charterCapital\n      __typename\n    }\n    __typename\n  }\n"
    "  OrganizationShareHolders(ticker: $ticker) {\n"
    "    id\n    ticker\n    ownerFullName\n    en_OwnerFullName\n"
    "    quantity\n    percentage\n    updateDate\n    __typename\n  }\n"
    "  OrganizationManagers(ticker: $ticker) {\n"
    "    id\n    ticker\n    fullName\n    positionName\n    positionShortName\n"
    "    en_PositionName\n    en_PositionShortName\n"
    "    updateDate\n    percentage\n    quantity\n    __typename\n  }\n"
    "  OrganizationEvents(ticker: $ticker) {\n"
    "    id\n    organCode\n    ticker\n    eventTitle\n    en_EventTitle\n"
    "    publicDate\n    issueDate\n    sourceUrl\n    eventListCode\n"
    "    ratio\n    value\n    recordDate\n    exrightDate\n"
    "    eventListName\n    en_EventListName\n    __typename\n  }\n"
    "  News(ticker: $ticker, langCode: $lang) {\n"
    "    id\n    organCode\n    ticker\n    newsTitle\n    newsSubTitle\n"
    "    friendlySubTitle\n    newsImageUrl\n    newsSourceLink\n"
    "    createdAt\n    publicDate\n    updatedAt\n"
    "    langCode\n    newsId\n    newsShortContent\n    __typename\n  }\n"
    "  Subsidiary(ticker: $ticker) {\n"
    "    id\n    organCode\n    subOrganCode\n    percentage\n"
    "    subOrListingInfo {\n      enOrganName\n      organName\n"
    "      __typename\n    }\n    __typename\n  }\n"
    "}\n"
)

# GraphQL URL is NOT under /api — from vnstock/explorer/vci/const.py
_GRAPHQL_URL = "https://trading.vietcap.com.vn/data-mt/graphql"


async def fetch_company_data(symbol: str) -> tuple[dict[str, Any], str]:
    """Fetch all company data via VCI GraphQL in a single request."""
    import json as _json

    headers = get_headers(_SOURCE)
    payload = {
        "query": _COMPANY_GRAPHQL_QUERY,
        "variables": {"ticker": symbol.upper(), "lang": "vi"},
    }

    # vnstock sends data=json.dumps(payload) not json=payload
    data = await fetch_json(
        _GRAPHQL_URL,
        method="POST",
        headers=headers,
        form_data=_json.dumps(payload),
        source=_SOURCE,
    )

    raw = data.get("data", {}) if isinstance(data, dict) else {}
    return raw, _GRAPHQL_URL


def normalize_company_overview(raw: dict[str, Any]) -> dict[str, Any]:
    """Extract overview from raw GraphQL company data."""
    info = raw.get("CompanyListingInfo", {})
    if not info:
        return {}
    ratio = info.get("financialRatio", {}) or {}
    return {
        "issue_share": info.get("issueShare"),
        "charter_capital": ratio.get("charterCapital"),
        "company_profile": info.get("companyProfile", ""),
        "history": info.get("history", ""),
        "icb_name_2": info.get("icbName2"),
        "icb_name_3": info.get("icbName3"),
        "icb_name_4": info.get("icbName4"),
    }


def normalize_shareholders(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract shareholders from raw GraphQL data."""
    items = raw.get("OrganizationShareHolders", [])
    records: list[dict[str, Any]] = []
    for item in items:
        records.append({
            "name": item.get("ownerFullName", ""),
            "quantity": item.get("quantity"),
            "percentage": item.get("percentage"),
            "update_date": item.get("updateDate"),
        })
    return records


def normalize_officers(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract officers from raw GraphQL data."""
    items = raw.get("OrganizationManagers", [])
    records: list[dict[str, Any]] = []
    for item in items:
        records.append({
            "name": item.get("fullName", ""),
            "position": item.get("positionName", ""),
            "quantity": item.get("quantity"),
            "percentage": item.get("percentage"),
            "update_date": item.get("updateDate"),
        })
    return records


def normalize_events(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract events from raw GraphQL data."""
    items = raw.get("OrganizationEvents", [])
    records: list[dict[str, Any]] = []
    for item in items:
        records.append({
            "title": item.get("eventTitle", ""),
            "event_code": item.get("eventListCode", ""),
            "event_name": item.get("eventListName", ""),
            "public_date": item.get("publicDate"),
            "issue_date": item.get("issueDate"),
            "record_date": item.get("recordDate"),
            "exright_date": item.get("exrightDate"),
            "ratio": item.get("ratio"),
            "value": item.get("value"),
        })
    return records


def normalize_news(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract news from raw GraphQL data."""
    items = raw.get("News", [])
    records: list[dict[str, Any]] = []
    for item in items:
        records.append({
            "title": item.get("newsTitle", ""),
            "subtitle": item.get("newsSubTitle", ""),
            "short_content": item.get("newsShortContent", ""),
            "image_url": item.get("newsImageUrl", ""),
            "source_link": item.get("newsSourceLink", ""),
            "public_date": item.get("publicDate"),
            "created_at": item.get("createdAt"),
        })
    return records


def normalize_subsidiaries(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract subsidiaries from raw GraphQL data."""
    items = raw.get("Subsidiary", [])
    records: list[dict[str, Any]] = []
    for item in items:
        sub_info = item.get("subOrListingInfo", {}) or {}
        records.append({
            "name": sub_info.get("organName", ""),
            "en_name": sub_info.get("enOrganName", ""),
            "percentage": item.get("percentage"),
        })
    return records


# ══════════════════════════════════════════════════════
# Trading details (foreign, prop, insider)
# ══════════════════════════════════════════════════════

_REPORT_RESOLUTION = {
    "1D": "ONE_DAY",
    "1W": "ONE_WEEK",
    "1M": "ONE_MONTH",
    "1Q": "ONE_QUARTER",
    "1Y": "ONE_YEAR",
}


async def fetch_trading_history(
    symbol: str,
    *,
    resolution: str = "1D",
    start: str | None = None,
    end: str | None = None,
    page: int = 0,
    size: int = 50,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch full price-history rows from VCI IQ Insight.

    The upstream response contains both foreign trading and supply-demand
    fields. Keep all fields so API routes can expose full or filtered views.
    """
    url = f"{_IQ_BASE}/v1/company/{symbol.upper()}/price-history"
    headers = get_headers(_SOURCE)
    params: dict[str, Any] = {
        "timeFrame": _REPORT_RESOLUTION.get(resolution, "ONE_DAY"),
        "page": page,
        "size": size,
    }
    if start and end:
        params["fromDate"] = start.replace("-", "")
        params["toDate"] = end.replace("-", "")

    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)
    items = _extract_data(data, path=["data", "content"])
    records = [{_camel_to_snake(k): v for k, v in item.items()} for item in items]
    return records, url


async def fetch_trading_summary(
    symbol: str,
    *,
    resolution: str = "1D",
    start: str | None = None,
    end: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Fetch full price-history-summary from VCI IQ Insight."""
    url = f"{_IQ_BASE}/v1/company/{symbol.upper()}/price-history-summary"
    headers = get_headers(_SOURCE)
    params: dict[str, Any] = {
        "timeFrame": _REPORT_RESOLUTION.get(resolution, "ONE_DAY"),
    }
    if start and end:
        params["fromDate"] = start.replace("-", "")
        params["toDate"] = end.replace("-", "")

    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)
    raw = data.get("data", {}) if isinstance(data, dict) else {}
    record = {_camel_to_snake(k): v for k, v in raw.items()} if isinstance(raw, dict) else {}
    return record, url


async def fetch_foreign_trade(
    symbol: str,
    *,
    resolution: str = "1D",
    start: str | None = None,
    end: str | None = None,
    page: int = 0,
    size: int = 100,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch foreign trade data from VCI."""
    items, url = await fetch_trading_history(
        symbol,
        resolution=resolution,
        start=start,
        end=end,
        page=page,
        size=size,
    )
    records: list[dict[str, Any]] = []
    for item in items:
        fr_fields = {k: v for k, v in item.items() if k.startswith("foreign")}
        fr_fields["trading_date"] = item.get("trading_date")
        records.append(fr_fields)
    return records, url


async def fetch_insider_deals(
    symbol: str,
    *,
    limit: int = 100,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch insider transaction data from VCI."""
    url = f"{_IQ_BASE}/v1/company/{symbol.upper()}/insider-transaction"
    headers = get_headers(_SOURCE)
    params: dict[str, Any] = {"page": 0, "size": limit}

    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)
    items = _extract_data(data, path=["data", "content"])
    records = [{_camel_to_snake(k): v for k, v in item.items()} for item in items]
    return records, url


# ══════════════════════════════════════════════════════
# Financials
# ══════════════════════════════════════════════════════

_FINANCE_TYPES = {
    "balance_sheet": "BALANCE_SHEET",
    "income_statement": "INCOME_STATEMENT",
    "cash_flow": "CASH_FLOW",
    "ratio": "RATIO",
}


async def fetch_financial_report(
    symbol: str,
    *,
    report_type: str = "balance_sheet",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch financial report data from VCI IQ Insight.

    report_type: balance_sheet, income_statement, cash_flow, ratio
    """
    sym = symbol.upper()
    section = _FINANCE_TYPES.get(report_type, "BALANCE_SHEET")

    if section == "RATIO":
        url = f"{_IQ_BASE}/v1/company/{sym}/statistics-financial"
        params: dict[str, Any] = {}
    else:
        url = f"{_IQ_BASE}/v1/company/{sym}/financial-statement"
        params = {"section": section}

    headers = get_headers(_SOURCE)
    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)

    raw_data = data.get("data") if isinstance(data, dict) else data

    records: list[dict[str, Any]] = []
    if isinstance(raw_data, list):
        # Ratio returns list directly
        for item in raw_data:
            records.append({_camel_to_snake(k): v for k, v in item.items()})
    elif isinstance(raw_data, dict):
        # Financial statements keyed by quarter
        for period_key, items_list in raw_data.items():
            if isinstance(items_list, list):
                for item in items_list:
                    row = {_camel_to_snake(k): v for k, v in item.items()}
                    row["report_period"] = period_key.rstrip("s") if period_key else ""
                    records.append(row)

    return records, url


# ══════════════════════════════════════════════════════
# Events calendar
# ══════════════════════════════════════════════════════

_EVENTS_URL = f"{_IQ_BASE}/v1/events"

_EVENT_TYPE_MAP = {
    "dividend": "ISS,DIV",
    "insider": "DDIND,DDRP,DDINS",
    "agm": "EGME,AGME,AGMR",
    "others": "MOVE,MA,NLIS,AIS,RETU,OTHE,SUSP",
}


async def fetch_events_calendar(
    *,
    start: str,
    end: str | None = None,
    event_type: str | None = None,
    limit: int = 20000,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch events calendar from VCI."""
    from_date = start.replace("-", "")
    to_date = (end or start).replace("-", "")

    url = f"{_EVENTS_URL}?fromDate={from_date}&toDate={to_date}&page=0&size={limit}"
    if event_type:
        code = _EVENT_TYPE_MAP.get(event_type.lower(), event_type)
        url += f"&eventCode={code}"

    headers = get_headers(_SOURCE)
    # Events API needs extra headers
    headers.update({
        "Origin": "https://trading.vietcap.com.vn",
        "Referer": "https://trading.vietcap.com.vn/",
    })

    data = await fetch_json(url, headers=headers, source=_SOURCE)
    items: list[dict[str, Any]] = []
    if isinstance(data, dict):
        content = data.get("data", {})
        if isinstance(content, dict):
            items = content.get("content", [])
        elif isinstance(content, list):
            items = content

    records = [{_camel_to_snake(k): v for k, v in item.items()} for item in items]
    return records, url


# ══════════════════════════════════════════════════════
# Company statistics (per-ticker)
# ══════════════════════════════════════════════════════


async def fetch_proprietary_history(
    symbol: str,
    *,
    resolution: str = "1D",
    start: str | None = None,
    end: str | None = None,
    page: int = 0,
    size: int = 50,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch proprietary trading history for a company.

    Returns paginated list of daily proprietary buy/sell data.
    """
    url = f"{_IQ_BASE}/v1/company/{symbol.upper()}/proprietary-history"
    headers = get_headers(_SOURCE)
    params: dict[str, Any] = {
        "timeFrame": _REPORT_RESOLUTION.get(resolution, "ONE_DAY"),
        "page": page,
        "size": size,
    }
    if start and end:
        params["fromDate"] = start.replace("-", "")
        params["toDate"] = end.replace("-", "")

    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)
    items = _extract_data(data, path=["data", "content"])
    records = [{_camel_to_snake(k): v for k, v in item.items()} for item in items]
    return records, url


async def fetch_proprietary_summary(
    symbol: str,
    *,
    resolution: str = "1D",
    start: str | None = None,
    end: str | None = None,
) -> tuple[dict[str, Any], str]:
    """Fetch proprietary trading summary for a company."""
    url = f"{_IQ_BASE}/v1/company/{symbol.upper()}/proprietary-history-summary"
    headers = get_headers(_SOURCE)
    params: dict[str, Any] = {
        "timeFrame": _REPORT_RESOLUTION.get(resolution, "ONE_DAY"),
    }
    if start and end:
        params["fromDate"] = start.replace("-", "")
        params["toDate"] = end.replace("-", "")

    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)
    raw = data.get("data", {}) if isinstance(data, dict) else {}
    record = {_camel_to_snake(k): v for k, v in raw.items()} if isinstance(raw, dict) else {}
    return record, url


async def fetch_company_details(
    symbol: str,
) -> tuple[dict[str, Any], str]:
    """Fetch company details from VCI IQ Insight.

    Returns company info including sector, exchange, name, etc.
    """
    url = f"{_IQ_BASE}/v1/company/details"
    headers = get_headers(_SOURCE)
    params: dict[str, Any] = {"ticker": symbol.upper()}

    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)
    raw = data.get("data", {}) if isinstance(data, dict) else {}
    if not isinstance(raw, dict):
        raw = {}
    record = {_camel_to_snake(k): v for k, v in raw.items()}
    return record, url


async def fetch_price_chart(
    symbol: str,
    *,
    length: int = 365,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch adjusted OHLC price chart data from VCI IQ Insight.

    Returns list of {open_price, high_price, low_price, closing_price, trading_time}.
    """
    url = f"{_IQ_BASE}/v1/company/{symbol.upper()}/price-chart"
    headers = get_headers(_SOURCE)
    params: dict[str, Any] = {"lengthReport": length}

    data = await fetch_json(url, headers=headers, params=params, source=_SOURCE)
    raw = data.get("data", data) if isinstance(data, dict) else data
    items = raw if isinstance(raw, list) else []
    records = []
    for item in items:
        if not isinstance(item, dict):
            continue
        records.append({
            "open_price": _to_num(item.get("openPrice")),
            "high_price": _to_num(item.get("highPrice")),
            "low_price": _to_num(item.get("lowPrice")),
            "closing_price": _to_num(item.get("closingPrice")),
            "trading_time": item.get("tradingTime"),
        })
    return records, url


# ══════════════════════════════════════════════════════
# Internal helpers
# ══════════════════════════════════════════════════════


def _extract_data(
    data: Any,
    path: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Navigate a nested dict by path to extract list of records."""
    if path is None:
        path = ["data"]
    current = data
    for key in path:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return []
    return current if isinstance(current, list) else []

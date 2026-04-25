"""SPL/Simplize data source connector for commodity price data.

Upstream API: https://api.simplize.vn/api/
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.services.market_data.http import fetch_json

_SOURCE = "SPL"
_BASE_URL = "https://api.simplize.vn/api"

# Custom headers for Simplize (from vnstock_data/explorer/spl/const.py)
_HEADERS = {
    "accept": "application/json",
    "user-agent": "vns_market_data/1.0",
}

# Commodity ticker map (reverse-engineered from spl/commodity.py)
COMMODITY_MAP: dict[str, dict[str, str]] = {
    "gold_vn_buy": {"ticker": "GOLD:VN:BUY", "name": "Vàng VN (mua)"},
    "gold_vn_sell": {"ticker": "GOLD:VN:SELL", "name": "Vàng VN (bán)"},
    "gold_global": {"ticker": "GC=F", "name": "Vàng thế giới"},
    "oil_crude": {"ticker": "CL=F", "name": "Dầu thô"},
    "gas_natural": {"ticker": "NG=F", "name": "Khí thiên nhiên"},
    "gas_ron92": {"ticker": "GAS:RON92:VN", "name": "Xăng RON92"},
    "gas_ron95": {"ticker": "GAS:RON95:VN", "name": "Xăng RON95"},
    "oil_do": {"ticker": "GAS:DO:VN", "name": "Dầu DO"},
    "coke": {"ticker": "ICEEUR:NCF1!", "name": "Than cốc"},
    "steel_d10": {"ticker": "STEEL:D10:VN", "name": "Thép D10 VN"},
    "iron_ore": {"ticker": "COMEX:TIO1!", "name": "Quặng sắt"},
    "steel_hrc": {"ticker": "COMEX:HRC1!", "name": "Thép HRC"},
    "fertilizer_ure": {"ticker": "CBOT:UME1!", "name": "Phân ure"},
    "soybean": {"ticker": "ZM=F", "name": "Đậu tương"},
    "corn": {"ticker": "ZC=F", "name": "Ngô"},
    "sugar": {"ticker": "SB=F", "name": "Đường"},
    "pork_north_vn": {"ticker": "PIG:NORTH:VN", "name": "Heo hơi miền Bắc VN"},
    "pork_china": {"ticker": "PIG:CHINA", "name": "Heo hơi Trung Quốc"},
}

VALID_COMMODITIES = set(COMMODITY_MAP.keys())


async def fetch_commodity_price(
    code: str,
    *,
    start: str | None = None,
    end: str | None = None,
    interval: str = "1d",
) -> tuple[list[dict[str, Any]], str]:
    """Fetch commodity OHLCV data from Simplize.

    code: key from COMMODITY_MAP (e.g. 'gold_global', 'oil_crude')
    start/end: YYYY-MM-DD
    interval: '1d', '1h', '1m'
    """
    if code not in COMMODITY_MAP:
        msg = f"Unknown commodity '{code}'. Valid: {sorted(COMMODITY_MAP.keys())}"
        raise ValueError(msg)

    ticker = COMMODITY_MAP[code]["ticker"]
    url = f"{_BASE_URL}/historical/prices/ohlcv"

    params: dict[str, Any] = {
        "ticker": ticker,
        "interval": interval,
        "type": "commodity",
    }

    # Convert dates to timestamps
    if start:
        start_dt = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=UTC)
        params["from"] = int(start_dt.timestamp())
    if end:
        end_dt = datetime.strptime(end, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, tzinfo=UTC
        )
        params["to"] = int(end_dt.timestamp())

    data = await fetch_json(url, headers=_HEADERS, params=params, source=_SOURCE)

    records: list[dict[str, Any]] = []
    raw_data = data.get("data", []) if isinstance(data, dict) else data
    if isinstance(raw_data, list):
        for item in raw_data:
            if isinstance(item, list) and len(item) >= 6:
                records.append({
                    "time": item[0],
                    "open": item[1],
                    "high": item[2],
                    "low": item[3],
                    "close": item[4],
                    "volume": item[5],
                })
            elif isinstance(item, dict):
                records.append({
                    "time": item.get("time"),
                    "open": item.get("open"),
                    "high": item.get("high"),
                    "low": item.get("low"),
                    "close": item.get("close"),
                    "volume": item.get("volume"),
                })

    return records, url


def list_commodities() -> list[dict[str, str]]:
    """Return the full commodity catalog."""
    return [
        {"code": code, "ticker": info["ticker"], "name": info["name"]}
        for code, info in COMMODITY_MAP.items()
    ]

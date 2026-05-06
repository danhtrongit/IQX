"""Google Sheets data source connector.

Fetches data from a published Google Spreadsheet using the Sheets v4 Values API.
Used for interbank rates (VND), government bond yields (TPCP), and FX rates (TYGIA).

The API key is read from the GOOGLE_SHEETS_API_KEY setting.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.services.market_data.http import fetch_json

logger = logging.getLogger(__name__)

_SOURCE = "GOOGLE_SHEETS"
_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"
_SPREADSHEET_ID = "1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI"

# Sheet ranges
SHEET_VND = "VND"
SHEET_TPCP = "TPCP"
SHEET_TYGIA = "TYGIA"


def _get_api_key() -> str:
    """Read Google Sheets API key from settings."""
    from app.core.config import get_settings
    key = get_settings().GOOGLE_SHEETS_API_KEY
    if not key:
        raise RuntimeError("GOOGLE_SHEETS_API_KEY is not configured")
    return key


def _parse_vn_percent(s: str) -> float | None:
    """Parse Vietnamese-formatted percent string to float.

    '5,50%' -> 5.50, '-3,10%' -> -3.10, '0,00%' -> 0.0
    """
    s = s.strip()
    if not s or s == "-":
        return None
    # Remove % suffix
    s = s.rstrip("%").strip()
    # Replace Vietnamese comma with dot
    s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_number(s: str) -> float | None:
    """Parse a number that may use '.' as thousands separator.

    '26.334' (Vietnamese style thousands) -> 26334.0
    '165' -> 165.0
    '-3' -> -3.0
    '-' -> None
    """
    s = s.strip()
    if not s or s == "-":
        return None

    # If it looks like a thousands-separated integer (e.g. '26.334', '30.434')
    # detect by pattern: digits.digits where each group after first dot is 3 digits
    # But also allow negative
    cleaned = s.replace(".", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


async def fetch_sheet_data(sheet_range: str) -> tuple[list[dict[str, Any]], str]:
    """Fetch and parse a Google Sheet range into list of dicts.

    Row 0 = headers, rows 1+ = data.
    Returns (records, source_url).
    """
    api_key = _get_api_key()
    url = f"{_BASE_URL}/{_SPREADSHEET_ID}/values/{sheet_range}"

    raw = await fetch_json(
        url,
        params={"key": api_key},
        headers={"Accept": "application/json"},
        source=_SOURCE,
        max_retries=2,
    )

    values: list[list[str]] = raw.get("values", [])
    if len(values) < 2:
        return [], url

    headers = [h.strip() for h in values[0]]
    records = []
    for row in values[1:]:
        # Pad row to header length
        padded = row + [""] * (len(headers) - len(row))
        record = {headers[i]: padded[i] for i in range(len(headers))}
        records.append(record)

    return records, url


def normalize_vnd(raw_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize VND interbank rates sheet data.

    Input headers: KỲ HẠN, TODAY, YESTERDAY, CHÊNH LỆNH %
    Output: { tenor, today, yesterday, change, changeNumeric }
    """
    result = []
    for row in raw_rows:
        tenor = row.get("KỲ HẠN", "").strip()
        today_str = row.get("TODAY", "").strip()
        yesterday_str = row.get("YESTERDAY", "").strip()
        change_str = row.get("CHÊNH LỆNH %", row.get("CHÊNH LỆCH %", "")).strip()

        today_num = _parse_vn_percent(today_str)
        yesterday_num = _parse_vn_percent(yesterday_str)
        change_num = _parse_vn_percent(change_str)

        result.append({
            "tenor": tenor,
            "today": today_str,
            "yesterday": yesterday_str,
            "change": change_str,
            "todayNumeric": today_num,
            "yesterdayNumeric": yesterday_num,
            "changeNumeric": change_num,
        })
    return result


def normalize_tpcp(raw_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize TPCP government bond yields sheet data.

    Input headers: KỲ HẠN, TODAY, YESTERDAY, CHÊNH LỆNH POINTS
    Output: { tenor, today, yesterday, change, changeNumeric }
    """
    result = []
    for row in raw_rows:
        tenor = row.get("KỲ HẠN", "").strip()
        today_str = row.get("TODAY", "").strip()
        yesterday_str = row.get("YESTERDAY", "").strip()
        change_str = row.get("CHÊNH LỆNH POINTS", row.get("CHÊNH LỆCH POINTS", "")).strip()

        today_num = _parse_vn_percent(today_str)
        yesterday_num = _parse_vn_percent(yesterday_str)

        # Change for TPCP is in points (e.g. "0,2", "-0,1", "-")
        change_num: float | None = None
        if change_str and change_str != "-":
            try:
                change_num = float(change_str.replace(",", "."))
            except ValueError:
                change_num = None

        result.append({
            "tenor": tenor,
            "today": today_str,
            "yesterday": yesterday_str,
            "change": change_str,
            "todayNumeric": today_num,
            "yesterdayNumeric": yesterday_num,
            "changeNumeric": change_num,
        })
    return result


def normalize_tygia(raw_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize TYGIA FX rates sheet data.

    Input headers: NGOẠI TỆ, TODAY, YESTERDAY, CHÊNH LỆCH
    Output: { currency, today, yesterday, change, changeNumeric }
    """
    result = []
    for row in raw_rows:
        currency = row.get("NGOẠI TỆ", "").strip()
        today_str = row.get("TODAY", "").strip()
        yesterday_str = row.get("YESTERDAY", "").strip()
        change_str = row.get("CHÊNH LỆCH", "").strip()

        today_num = _parse_number(today_str)
        yesterday_num = _parse_number(yesterday_str)

        change_num: float | None = None
        if change_str and change_str != "-":
            try:
                change_num = float(change_str.replace(",", "."))
            except ValueError:
                change_num = None

        result.append({
            "currency": currency,
            "today": today_str,
            "yesterday": yesterday_str,
            "change": change_str,
            "todayNumeric": today_num,
            "yesterdayNumeric": yesterday_num,
            "changeNumeric": change_num,
        })
    return result

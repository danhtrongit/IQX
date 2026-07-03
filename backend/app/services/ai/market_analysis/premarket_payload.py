"""Pre-market brief payload helpers.

Contains normalizers for news and events consumed by the pre-market
analysis pipeline.  The payload builder (which assembles the full
payload dict and calls the LLM) will be added in a subsequent task.

Step-0 live verification (2026-07-03):
  VCI events API real field names (after camelCase→snake_case conversion):
    id, organ_code, event_name_vi, event_name_en, organ_name_en,
    organ_name_vi, ticker, event_code, event_title_vi, event_title_en,
    display_date1, display_date2, public_date, start_date, end_date,
    action_type_vi, action_type_en, category
  NOTE: There is NO event_time field in the VCI events API response.
        The 'time' field in normalized output is always None unless
        display_date1 contains a non-midnight time component.
"""

from __future__ import annotations

import difflib
from datetime import datetime, timezone
from typing import Any

# ── Source ranking (lower = higher priority) ──────────────────────────────────
# Used by normalize_news dedup to keep the higher-ranked source.

SOURCE_RANK: dict[str, int] = {
    "reuters": 0,
    "bloomberg": 1,
    "vnexpress": 2,
    "tuổi trẻ": 2,
    "tuoi tre": 2,
    "cafef": 3,
    "ndh": 3,
    "tinnhanhchungkhoan": 4,
    "đtck": 4,
    "dtck": 4,
}

# ── Event code → semantic type ────────────────────────────────────────────────

_EVENT_TYPE_MAP: dict[str, str] = {
    "ISS": "ex_dividend",
    "DIV": "ex_dividend",
    "EGME": "agm",
    "AGME": "agm",
    "AGMR": "agm",
    "DDIND": "insider",
    "DDRP": "insider",
    "DDINS": "insider",
    "NLIS": "listing",
    "AIS": "listing",
}
_DEFAULT_EVENT_TYPE = "other"


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_dt(ts: str) -> datetime | None:
    """Parse an ISO 8601 datetime string to an aware datetime.

    If the string has no timezone info, it is assumed to be UTC.
    Returns None on parse failure.
    """
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _source_rank(source_name: str) -> int:
    """Return the numeric rank for a source name (lower = better)."""
    normalized = source_name.casefold()
    for key, rank in SOURCE_RANK.items():
        if normalized.startswith(key) or key in normalized:
            return rank
    return 9


def _title_key(title: str) -> str:
    """Return first 80 chars of casefolded title for similarity comparison."""
    return title.casefold()[:80]


# ── normalize_news ─────────────────────────────────────────────────────────────


def normalize_news(
    items: list[dict[str, Any]],
    *,
    window_start: datetime,
    window_end: datetime,
) -> list[dict[str, Any]]:
    """Filter, normalize, dedup, and cap news items.

    Args:
        items: Raw news items from vietcap_ai_news.fetch_news_list.
               Expected keys: id, title, short_content, source_name, source,
               update_date, ticker, industry, sentiment, source_link.
        window_start: Inclusive window start (aware datetime).
        window_end:   Inclusive window end (aware datetime).

    Returns:
        List of normalized news dicts, up to 20 items, deduped by near-duplicate
        title (SequenceMatcher >= 0.8 on first 80 chars), keeping the
        higher-ranked source.
    """
    # 1. Filter by window
    in_window: list[dict[str, Any]] = []
    for item in items:
        ts = _parse_dt(item.get("update_date", ""))
        if ts is not None and window_start <= ts <= window_end:
            in_window.append(item)

    # 2. Normalize shape
    normalized: list[dict[str, Any]] = []
    for item in in_window:
        source = item.get("source_name") or item.get("source") or ""
        ticker = item.get("ticker")
        industry = item.get("industry")
        normalized.append({
            "id": item.get("id", ""),
            "title": item.get("title", ""),
            "summary": item.get("short_content", ""),
            "source": source,
            "published_at": item.get("update_date", ""),
            "tickers": [ticker] if ticker else [],
            "sectors": [industry] if industry else [],
            "sentiment": item.get("sentiment", ""),
            "url": item.get("source_link", ""),
            # Keep rank for dedup; stripped before output
            "_rank": _source_rank(source),
        })

    # 3. Dedup near-duplicate titles (SequenceMatcher >= 0.8 on first 80 chars)
    deduped: list[dict[str, Any]] = []
    for candidate in normalized:
        ckey = _title_key(candidate["title"])
        matched_idx: int | None = None
        for idx, existing in enumerate(deduped):
            ekey = _title_key(existing["title"])
            ratio = difflib.SequenceMatcher(None, ckey, ekey).ratio()
            if ratio >= 0.8:
                matched_idx = idx
                break
        if matched_idx is None:
            deduped.append(candidate)
        else:
            # Replace if candidate has strictly better (lower) rank
            if candidate["_rank"] < deduped[matched_idx]["_rank"]:
                deduped[matched_idx] = candidate

    # 4. Strip internal rank field
    for item in deduped:
        item.pop("_rank", None)

    # 5. Cap at 20
    return deduped[:20]


# ── normalize_events ───────────────────────────────────────────────────────────


def normalize_events(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize VCI events calendar rows.

    Args:
        raw: Rows from fetch_events_calendar (after camelCase→snake_case).
             Real VCI keys: id, event_code, event_title_vi, ticker,
             display_date1 (primary display date, ISO datetime string).
             NOTE: VCI API does NOT provide an event_time field.

    Returns:
        List of normalized event dicts with keys:
            id         — stable str (source id or "{code}-{date}-{ticker}")
            type       — ex_dividend | agm | insider | listing | other
            time       — HH:MM str if display_date1 has a non-midnight time,
                         else None
            time_label — human-readable display string (time or date)
            title      — event_title_vi
            tickers    — [ticker] if ticker present, else []
    """
    result: list[dict[str, Any]] = []
    for row in raw:
        event_code: str = row.get("event_code", "") or ""
        event_type = _EVENT_TYPE_MAP.get(event_code, _DEFAULT_EVENT_TYPE)

        # Stable ID
        source_id = row.get("id")
        if source_id:
            stable_id = str(source_id)
        else:
            date_str = _extract_date(row.get("display_date1", ""))
            ticker = row.get("ticker", "")
            stable_id = f"{event_code}-{date_str}-{ticker}"

        # Time extraction from display_date1
        # VCI does not provide a separate time field; if display_date1 has a
        # non-midnight time component we surface it.
        time_str, time_label = _extract_time_and_label(
            row.get("display_date1", "")
        )

        ticker = row.get("ticker")
        result.append({
            "id": stable_id,
            "type": event_type,
            "time": time_str,
            "time_label": time_label,
            "title": row.get("event_title_vi", ""),
            "tickers": [ticker] if ticker else [],
        })

    return result


# ── Event time helpers ─────────────────────────────────────────────────────────


def _extract_date(display_date: str) -> str:
    """Extract YYYY-MM-DD from an ISO datetime string."""
    if not display_date:
        return ""
    # Handle both "2026-07-03T00:00:00" and "2026-07-03"
    return display_date[:10]


def _extract_time_and_label(display_date: str) -> tuple[str | None, str]:
    """Extract time and time_label from a display_date1 ISO datetime string.

    VCI does not provide a dedicated time field.  If display_date1 has a
    non-midnight time component (HH:MM != 00:00) we treat it as the event time.

    Returns:
        (time_str, time_label) where time_str is "HH:MM" or None,
        and time_label is a non-empty human-readable string.
    """
    date_part = _extract_date(display_date)
    if not display_date or len(display_date) < 16:
        return None, date_part or display_date

    time_component = display_date[11:16]  # "HH:MM"
    if time_component and time_component != "00:00":
        return time_component, time_component
    else:
        return None, date_part

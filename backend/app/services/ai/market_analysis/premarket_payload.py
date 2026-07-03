"""Pre-market brief payload helpers.

Contains normalizers for news and events consumed by the pre-market
analysis pipeline, plus the main `build_premarket_payload` entry point.

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

import asyncio
import difflib
import logging
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── ICT timezone ───────────────────────────────────────────────────────────────
ICT = timezone(timedelta(hours=7))

# ── Re-export for patchability in tests ──────────────────────────────────────
# Tests patch these names on this module; so we import them at module level.
from app.services.market_data.intl_snapshot import load_latest_snapshot  # noqa: E402
from app.services.market_data.sources.vietcap_ai_news import fetch_news_list  # noqa: E402
from app.services.market_data.sources.vietcap import fetch_events_calendar  # noqa: E402
from app.services.market_data.sources.vcb import fetch_fx  # noqa: E402

# ── Vietnamese weekday names ───────────────────────────────────────────────────
_WEEKDAY_VI = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

# ── Grid cell definitions (fixed order) ───────────────────────────────────────
_GRID_CELLS: list[tuple[str, str]] = [
    ("^GSPC",    "S&P 500"),
    ("^IXIC",    "NASDAQ"),
    ("^N225",    "NIKKEI 225"),
    ("BZ=F",     "Dầu Brent"),
    ("GC=F",     "Vàng"),
    ("VND=X",    "USD/VND"),
]

# Context symbols (not in the 6 fixed cells)
_CONTEXT_SYMBOLS = {"^KS11", "DX-Y.NYB", "ES=F", "NQ=F", "^VIX"}

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

    Vietcap news `update_date` strings are NAIVE local ICT timestamps, so a
    naive string is localized as ICT (UTC+7). Assuming UTC here would shift
    every naive timestamp +7h at comparison time and silently drop all
    00:00–06:30 ICT morning news from the pre-market window. Aware strings
    are passed through unchanged. Returns None on parse failure.
    """
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ICT)
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


# ── Shared safe-fetch helper ───────────────────────────────────────────────────


async def _safe(coro: Any, label: str) -> Any:
    """Await a fetch coroutine, unwrap (data, url) tuple → data, swallow errors."""
    try:
        res = await coro
        return res[0] if isinstance(res, tuple) else res
    except Exception as exc:  # noqa: BLE001
        logger.warning("premarket_payload source '%s' failed: %s", label, exc)
        return None


# ── Previous EOD loader (reuses the midday query pattern) ─────────────────────


async def _load_previous_eod(db: AsyncSession) -> dict | None:
    """Return the latest published daily AnalysisHistory record.

    Returns a dict with headline/tagline/scenarios/watchlist, or None.
    """
    from sqlalchemy import select
    from app.models.market_analysis import AnalysisHistory

    try:
        row = (await db.execute(
            select(AnalysisHistory)
            .where(
                AnalysisHistory.report_type == "daily",
                AnalysisHistory.is_published.is_(True),
            )
            .order_by(AnalysisHistory.session_date.desc())
            .limit(1)
        )).scalar_one_or_none()
    except Exception as exc:  # noqa: BLE001
        logger.warning("premarket_payload _load_previous_eod DB query failed: %s", exc)
        return None

    if row is None:
        return None

    return {
        "headline": row.headline,
        "tagline": row.tagline,
        "scenarios": row.scenarios,
        "watchlist": row.watchlist,
        "session_date": row.session_date.isoformat() if row.session_date else None,
    }


# ── Calendar helpers ───────────────────────────────────────────────────────────


def _compute_calendar_flags(today: date) -> tuple[bool, bool]:
    """Return (is_post_weekend, is_post_holiday).

    is_post_weekend: today is Monday (weekday 0).
    is_post_holiday: the previous CALENDAR day was a weekday but not a trading day
                     (i.e. it was a holiday, not a weekend day).
    """
    from app.services.ai.market_analysis.market_calendar import is_trading_day

    is_post_weekend = today.weekday() == 0  # Monday

    prev_calendar_day = today - timedelta(days=1)
    # is_post_holiday: prev day was a weekday AND was not a trading day
    is_post_holiday = (
        prev_calendar_day.weekday() < 5
        and not is_trading_day(prev_calendar_day)
    )

    return is_post_weekend, is_post_holiday


def _prev_trading_day(today: date) -> date:
    """Walk back from `today` (exclusive) to find the most recent trading day."""
    from app.services.ai.market_analysis.market_calendar import is_trading_day

    d = today - timedelta(days=1)
    for _ in range(14):  # safety cap
        if is_trading_day(d):
            return d
        d -= timedelta(days=1)
    return today - timedelta(days=1)  # fallback: yesterday


# ── Sentiment helper ───────────────────────────────────────────────────────────


def _sentiment(change_pct: float | None, *, invert: bool = False) -> str:
    """Convert a change percentage to a sentiment string.

    Args:
        change_pct: Percentage change value (or None).
        invert: When True, negative change → "up", positive → "down"
                (used for USD/VND: USD weakening is good for VN market).

    Returns:
        "up" | "down" | "flat"
    """
    if change_pct is None:
        return "flat"
    if change_pct == 0:
        return "flat"
    if invert:
        return "up" if change_pct < 0 else "down"
    return "up" if change_pct > 0 else "down"


# ── Global-markets builder ────────────────────────────────────────────────────


def _build_global_markets(
    snapshot_rows: list,
    vcb_usd_sell: float | None,
    missing_fields: list[str],
) -> dict:
    """Build the global_markets block.

    Args:
        snapshot_rows: List of MarketDataSnapshot ORM rows.
        vcb_usd_sell: VCB sell rate for USD (fallback for VND=X).
        missing_fields: Mutable list; entries appended if symbols are absent.

    Returns:
        {cells: [6 dicts], context: {...}}
    """
    # Index by symbol
    by_symbol: dict[str, Any] = {r.symbol: r for r in snapshot_rows}

    cells: list[dict] = []
    any_missing = False

    for sym, label in _GRID_CELLS:
        row = by_symbol.get(sym)
        is_usdvnd = sym == "VND=X"

        row_is_stale_usdvnd = is_usdvnd and row is not None and bool(row.stale)

        if row is None or row_is_stale_usdvnd:
            # Absent symbol OR stale VND=X — try VCB fallback for VND=X
            if is_usdvnd and vcb_usd_sell is not None:
                cell: dict = {
                    "id": sym,
                    "label": label,
                    "value": float(vcb_usd_sell),
                    "change_pct": None,
                    "sentiment": "flat",
                    "stale": False,
                    "source": "vcb",
                }
            elif row_is_stale_usdvnd:
                # VCB also unavailable but we have a stale row — stale beats nothing
                raw_price = row.last_price  # type: ignore[union-attr]
                raw_pct = row.change_percent  # type: ignore[union-attr]
                price_f: float | None = float(raw_price) if raw_price is not None else None
                pct_f: float | None = float(raw_pct) if raw_pct is not None else None
                cell = {
                    "id": sym,
                    "label": label,
                    "value": price_f,
                    "change_pct": pct_f,
                    "sentiment": _sentiment(pct_f, invert=True),
                    "stale": True,
                }
            else:
                any_missing = True
                cell = {
                    "id": sym,
                    "label": label,
                    "value": None,
                    "change_pct": None,
                    "sentiment": "flat",
                    "stale": True,
                }
        else:
            raw_price = row.last_price
            raw_pct = row.change_percent
            price_f = float(raw_price) if raw_price is not None else None
            pct_f = float(raw_pct) if raw_pct is not None else None

            cell = {
                "id": sym,
                "label": label,
                "value": price_f,
                "change_pct": pct_f,
                "sentiment": _sentiment(pct_f, invert=is_usdvnd),
                "stale": bool(row.stale),
            }

        cells.append(cell)

    if any_missing:
        missing_fields.append("global_markets")

    # Context block (non-grid symbols)
    context: dict = {}
    for row in snapshot_rows:
        if row.symbol in _CONTEXT_SYMBOLS:
            raw_price = row.last_price
            raw_pct = row.change_percent
            context[row.symbol] = {
                "value": float(raw_price) if raw_price is not None else None,
                "change_pct": float(raw_pct) if raw_pct is not None else None,
                "stale": bool(row.stale),
            }

    return {"cells": cells, "context": context}


def _stale_out_outdated_snapshot(snapshot_rows: list, today_ict: date) -> list:
    """Force every snapshot row stale when the snapshot pre-dates today (ICT).

    load_latest_snapshot returns MAX(snapshot_date) with no today check: if no
    fetch wave ran today (flag misconfig, deploy window across the crons,
    scheduler death) it silently serves yesterday's prices, which would render
    as fresh cells and be narrated as overnight moves. Days-old data must go
    through the existing stale-cell path ("—" + note, stale VND=X → VCB
    fallback) instead.

    Rows are copied into lightweight stand-ins rather than mutated: flipping
    ``stale`` on live ORM rows would dirty the session and get flushed back to
    the DB by the pipeline's later commits. Rows without a readable
    snapshot_date are left untouched.
    """
    snap_dates = [
        d for d in (getattr(r, "snapshot_date", None) for r in snapshot_rows) if d is not None
    ]
    if not snap_dates or max(snap_dates) >= today_ict:
        return snapshot_rows

    logger.warning(
        "premarket_payload: latest intl snapshot is %s (< today %s ICT) — forcing all %d rows stale",
        max(snap_dates).isoformat(), today_ict.isoformat(), len(snapshot_rows),
    )

    class _StaleRow:
        __slots__ = ("symbol", "last_price", "change_percent", "stale", "snapshot_date")

        def __init__(self, row: Any) -> None:
            self.symbol = row.symbol
            self.last_price = row.last_price
            self.change_percent = row.change_percent
            self.stale = True
            self.snapshot_date = getattr(row, "snapshot_date", None)

    return [_StaleRow(r) for r in snapshot_rows]


# ── Main entry point ──────────────────────────────────────────────────────────


async def build_premarket_payload(db: AsyncSession) -> dict[str, Any]:
    """Build the pre-market payload dict for the AI prompt.

    Assembles: meta, global_markets (6 fixed cells + context), news_pool,
    events_pool, eod_previous_summary, and config.

    Degrades gracefully: absent symbols → stale cells; fetch failures → empty
    pools with missing_fields entries.  Never fabricates data.
    """
    today = date.today()
    today_str = today.isoformat()

    is_post_weekend, is_post_holiday = _compute_calendar_flags(today)
    weekday_vi = _WEEKDAY_VI[today.weekday()]

    missing: list[str] = []

    # ── News window: 17:00 prev trading day → 06:30 today (ICT) ─────────────
    prev_td = _prev_trading_day(today)
    window_start = datetime(prev_td.year, prev_td.month, prev_td.day, 17, 0, 0, tzinfo=ICT)
    window_end   = datetime(today.year, today.month, today.day, 6, 30, 0, tzinfo=ICT)
    window_start_str = prev_td.isoformat()
    window_end_str   = today_str

    # ── Fetch sources ─────────────────────────────────────────────────────────
    # The two DB queries (snapshot + previous EOD) run SEQUENTIALLY: they share
    # the one AsyncSession and SQLAlchemy forbids concurrent operations on a
    # single session — running them inside the gather crashed _load_previous_eod
    # on every run, silently nulling eod_previous_summary. Only the external
    # HTTP fetches are gathered concurrently.
    snapshot_rows = await _safe(load_latest_snapshot(db), "snapshot")

    (
        news_raw,
        events_raw,
        vcb_fx,
    ) = await asyncio.gather(
        _safe(fetch_news_list("business", page=1, page_size=20,
                              update_from=window_start_str, update_to=window_end_str),
              "news"),
        _safe(fetch_events_calendar(start=today_str, end=today_str), "events"),
        _safe(fetch_fx(today_str), "vcb_fx"),
        return_exceptions=False,
    )

    eod_prev = await _load_previous_eod(db)

    # _safe unwraps (data, url) tuples; load_latest_snapshot returns a plain
    # list, so it passes through directly (or None on failure).
    if snapshot_rows is None:
        snapshot_rows = []

    # Freshness guard: a snapshot dated before today (ICT) must not render as
    # fresh overnight moves — force every row through the stale-cell path.
    snapshot_rows = _stale_out_outdated_snapshot(snapshot_rows, datetime.now(ICT).date())

    # ── News pool ─────────────────────────────────────────────────────────────
    if news_raw is None:
        news_pool: list[dict] = []
        missing.append("news_pool")
    else:
        raw_items = news_raw if isinstance(news_raw, list) else []
        news_pool = normalize_news(
            raw_items,
            window_start=window_start,
            window_end=window_end,
        )

    # ── Events pool ───────────────────────────────────────────────────────────
    if events_raw is None:
        events_pool: list[dict] = []
        missing.append("events_pool")
    else:
        raw_events = events_raw if isinstance(events_raw, list) else []
        events_pool = normalize_events(raw_events)

    # ── VCB USD/VND fallback value ────────────────────────────────────────────
    vcb_usd_sell: float | None = None
    if vcb_fx is not None:
        fx_rows = vcb_fx if isinstance(vcb_fx, list) else []
        for fx_row in fx_rows:
            if fx_row.get("currency_code") == "USD":
                sell_val = fx_row.get("sell")
                if sell_val is not None:
                    vcb_usd_sell = float(sell_val)
                break

    # ── Global markets ────────────────────────────────────────────────────────
    global_markets = _build_global_markets(snapshot_rows, vcb_usd_sell, missing)

    # ── EOD previous summary ──────────────────────────────────────────────────
    eod_previous_summary: dict | None = None
    if eod_prev is not None:
        eod_previous_summary = {
            "headline":  eod_prev.get("headline"),
            "tagline":   eod_prev.get("tagline"),
            "scenarios": eod_prev.get("scenarios"),
            "watchlist": eod_prev.get("watchlist"),
            "session_date": eod_prev.get("session_date"),
        }

    # ── Assemble payload ──────────────────────────────────────────────────────
    meta: dict[str, Any] = {
        "report_type": "premarket",
        "generated_for_date": today_str,
        "missing_fields": missing,
        "weekday_vi": weekday_vi,
        "is_post_weekend": is_post_weekend,
        "is_post_holiday": is_post_holiday,
        "as_of": datetime.now(UTC).isoformat(),
    }

    config: dict[str, Any] = {
        "generated_for_date": today_str,
        "weekday_vi": weekday_vi,
        "is_post_weekend": is_post_weekend,
        "is_post_holiday": is_post_holiday,
    }

    return {
        "meta": meta,
        "global_markets": global_markets,
        "news_pool": news_pool,
        "events_pool": events_pool,
        "eod_previous_summary": eod_previous_summary,
        "config": config,
    }

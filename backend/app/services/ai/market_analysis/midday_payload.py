"""AM-session (mid-day) payload collector for the mid-day market brief.

Intended to run around 11:30 ICT — captures the accumulated AM session state
from the same Vietcap data-source functions used by the daily payload builder,
but scoped to the current session window.

Key differences from `payload.py`:
- `meta.report_type = "midday"`, `meta.session_phase = "am"`
- `market_health_detail` and `sector_rotation` are NOT recomputed (breadth
  series / sector series only reflect EOD state); they are forwarded FROZEN
  from the latest daily AnalysisHistory record with `data_state="eod_previous"`.
- Adds a `pulse` block for the mid-day pulse bar (Task 13).
- AM-window liquidity: 09:00–now via ONE_MINUTE time_frame; MA20 is computed
  over available prior days (partial if < 20 days found).
- Any block that cannot be fetched → None, name added to `meta.missing_fields`,
  `charts.<block>.data_state = "unavailable"`.  Never fabricate.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_analysis import AnalysisHistory
from app.services.market_data.sources import vietcap_market_overview as mo

logger = logging.getLogger(__name__)

ICT = timezone(timedelta(hours=7))
_VND_B = 1_000_000_000   # VND → tỷ
_MILLION_PER_B = 1_000   # million VND → tỷ

# Re-export the module itself as MP so tests can patch `MP._load_previous_eod`
import sys as _sys
MP = _sys.modules[__name__]


# ── shared helpers (mirror payload.py) ─────────────────────────────────────

def _r(x: Any, n: int = 2) -> Any:
    return round(x, n) if isinstance(x, (int, float)) else None


async def _safe(coro: Any, label: str) -> Any:
    """Await a fetch_* coroutine, unwrap (data, url) → data, swallow errors."""
    try:
        res = await coro
        return res[0] if isinstance(res, tuple) else res
    except Exception as exc:  # noqa: BLE001
        logger.warning("midday_payload source '%s' failed: %s", label, exc)
        return None


def _am_window_ts() -> tuple[int, int]:
    """Return (from_ts, to_ts) for today's AM session: 09:00–now ICT."""
    now_ict = datetime.now(ICT)
    open_ict = now_ict.replace(hour=9, minute=0, second=0, microsecond=0)
    return int(open_ict.timestamp()), int(now_ict.timestamp())


def _am_window_for_date(d: date) -> tuple[int, int]:
    """09:00–11:30 ICT window for a historical date (for MA20 backfill)."""
    open_dt = datetime(d.year, d.month, d.day, 9, 0, 0, tzinfo=ICT)
    close_dt = datetime(d.year, d.month, d.day, 11, 30, 0, tzinfo=ICT)
    return int(open_dt.timestamp()), int(close_dt.timestamp())


def _extract_am_total_million(liquidity_rows: list[dict] | None) -> float | None:
    """Last accumulated value (million VND) from a fetch_liquidity response."""
    if not liquidity_rows:
        return None
    for row in liquidity_rows:
        vals = row.get("accumulated_value_million_vnd") or []
        vals = [v for v in vals if v is not None]
        if vals:
            return vals[-1]
    return None


def _build_sparkline(liquidity_rows: list[dict] | None) -> list[float]:
    """Extract minute-bar accumulated values as a sparkline for the pulse bar."""
    if not liquidity_rows:
        return []
    for row in liquidity_rows:
        vals = row.get("accumulated_value_million_vnd") or []
        return [float(v) for v in vals if v is not None]
    return []


# ── previous EOD loader ────────────────────────────────────────────────────


async def _load_previous_eod(db: AsyncSession) -> dict | None:
    """Return the latest daily AnalysisHistory record's charts + continuity fields.

    Returns None if no daily record exists.
    """
    try:
        row = (await db.execute(
            select(AnalysisHistory)
            .where(AnalysisHistory.report_type == "daily", AnalysisHistory.is_published.is_(True))
            .order_by(AnalysisHistory.session_date.desc())
            .limit(1)
        )).scalar_one_or_none()
    except Exception as exc:  # noqa: BLE001
        logger.warning("midday_payload _load_previous_eod DB query failed: %s", exc)
        return None

    if row is None:
        return None

    meta = row.meta or {}
    charts = meta.get("charts") or {}
    return {
        "charts": charts,
        "headline": row.headline,
        "tagline": row.tagline,
        "paragraphs": row.paragraphs,
        "scenarios": row.scenarios,
        "watchlist": row.watchlist,
        "session_date": row.session_date.isoformat() if row.session_date else None,
    }


# ── charts builder ─────────────────────────────────────────────────────────


def _build_midday_charts(
    *,
    breadth: dict | None,
    contribution: dict | None,
    foreign_detail: dict | None,
    prop_detail: dict | None,
    eod_previous_charts: dict | None,
) -> dict:
    """Build the mid-day charts block.

    AM-live tiers (breadth, contribution, foreign_detail, prop_detail):
      - present  → data_state = "am_session"
      - absent   → data_state = "unavailable" (key still emitted)

    Frozen tiers (market_health_detail, sector_rotation):
      - sourced from eod_previous_charts → data_state = "eod_previous"
      - absent   → data_state = "unavailable"
    """

    def _am_block(data: dict | None) -> dict:
        if data is None:
            return {"data_state": "unavailable"}
        return {**data, "data_state": "am_session"}

    def _frozen_block(key: str) -> dict:
        if eod_previous_charts and key in eod_previous_charts:
            block = eod_previous_charts[key]
            if isinstance(block, dict):
                return {**block, "data_state": "eod_previous"}
        return {"data_state": "unavailable"}

    return {
        "breadth": _am_block(breadth),
        "contribution": _am_block(contribution),
        "foreign_detail": _am_block(foreign_detail),
        "prop_detail": _am_block(prop_detail),
        "market_health_detail": _frozen_block("market_health_detail"),
        "sector_rotation": _frozen_block("sector_rotation"),
    }


# ── derived-field helpers (AM-scoped versions of daily helpers) ────────────


def _build_am_breadth(vn_snap: dict) -> dict | None:
    """Build breadth block from a fetch_market_index snapshot.

    Returns None if breadth counts are entirely absent.
    """
    adv = vn_snap.get("total_stock_increase")
    dec = vn_snap.get("total_stock_decline")
    if adv is None and dec is None:
        return None
    adv = adv or 0
    dec = dec or 0
    flat = vn_snap.get("total_stock_no_change") or 0
    ceiling = vn_snap.get("total_stock_ceiling") or 0
    floor_ = vn_snap.get("total_stock_floor") or 0
    ratio_float = adv / max(dec, 1)
    ratio_str = (
        f"1 : {(1 / ratio_float):.1f}".replace(".", ",")
        if ratio_float < 1
        else f"{ratio_float:.1f} : 1".replace(".", ",")
    )
    classification = _breadth_classification(adv, dec)
    return {
        "up": adv, "down": dec, "flat": flat,
        "ceiling": ceiling, "floor": floor_,
        "ratio_up_down": ratio_str,
        "classification": classification,
        "pct_above_ma20": None,  # not available intraday
    }


def _breadth_classification(up: int, down: int) -> str:
    ratio = up / max(down, 1)
    if ratio < 0.5:
        return "Phân hóa tiêu cực"
    if ratio < 0.8:
        return "Nghiêng giảm"
    if ratio <= 1.25:
        return "Cân bằng"
    if ratio <= 2:
        return "Nghiêng tăng"
    return "Tích cực"


def _build_am_contribution(imp: dict | None, change_points: float) -> dict | None:
    """Build contribution block from index impact data."""
    if not imp:
        return None
    top_up = imp.get("top_up") or []
    top_down = imp.get("top_down") or []
    if not top_up and not top_down:
        return None
    ups = sorted(
        [x for x in top_up if (x.get("impact") or 0) > 0],
        key=lambda x: -x["impact"],
    )
    downs = sorted(
        [x for x in top_down if (x.get("impact") or 0) < 0],
        key=lambda x: x["impact"],
    )
    return {
        "top_positive": [
            {"ticker": x["symbol"], "points": _r(x["impact"])}
            for x in ups[:8]
        ],
        "top_negative": [
            {"ticker": x["symbol"], "points": _r(x["impact"])}
            for x in downs[:8]
        ],
    }


def _build_am_foreign(fser: list[dict] | None, ftop: dict | None) -> dict | None:
    """Build foreign_detail block from AM-accumulated series."""
    if not fser:
        return None
    today_row = fser[-1] if fser else {}
    buy_v = today_row.get("foreign_buy_value_vnd") or 0
    sell_v = today_row.get("foreign_sell_value_vnd") or 0
    net_v = buy_v - sell_v

    def _top(items: list[dict]) -> list[dict]:
        seen: dict[str, float] = {}
        for x in items or []:
            sym = x.get("symbol")
            if not sym:
                continue
            v = x.get("net_value_vnd") or 0
            if sym not in seen or abs(v) > abs(seen[sym]):
                seen[sym] = v
        rows = sorted(seen.items(), key=lambda kv: abs(kv[1]), reverse=True)[:5]
        return [{"ticker": s, "value": _r(v / _VND_B)} for s, v in rows]

    return {
        "total_buy_vnd_billion": _r(buy_v / _VND_B),
        "total_sell_vnd_billion": _r(sell_v / _VND_B),
        "streak": {
            "count": 1,
            "direction": "buy" if net_v >= 0 else "sell",
            "last_5d_cumulative": None,
        },
        "last_12_sessions": [],  # insufficient AM history for 12-session series
        "top_buy": _top(ftop.get("net_buy", [])) if ftop else [],
        "top_sell": _top(ftop.get("net_sell", [])) if ftop else [],
    }


def _build_am_prop(pser: list[dict] | None, ptop: dict | None) -> dict | None:
    """Build prop_detail block from AM-accumulated proprietary data."""
    if not pser:
        return None
    last = pser[-1]
    buy_v = last.get("total_buy_value_vnd")
    sell_v = last.get("total_sell_value_vnd")
    if buy_v is None and sell_v is None:
        return None
    buy_v = buy_v or 0
    sell_v = sell_v or 0
    net_v = buy_v - sell_v

    def _top(items: list[dict]) -> list[dict]:
        return [
            {"ticker": x.get("ticker"), "value": _r((x.get("total_value_vnd") or 0) / _VND_B)}
            for x in (items or [])[:5]
        ]

    return {
        "total_buy_vnd_billion": _r(buy_v / _VND_B),
        "total_sell_vnd_billion": _r(sell_v / _VND_B),
        "net_vnd_billion": _r(net_v / _VND_B),
        "last_12_sessions": [],
        "top_buy": _top(ptop.get("buy")) if ptop else [],
        "top_sell": _top(ptop.get("sell")) if ptop else [],
    }


# ── AM liquidity + MA20 ────────────────────────────────────────────────────


async def _am_liquidity_ma20(today_am_million: float | None) -> tuple[float | None, float | None, bool]:
    """Compute AM MA20 by fetching same 09:00–11:30 window for prior trading days.

    Returns (ma20_billion, vs_ma20_pct, partial) where partial=True when < 20
    trading days were available.
    """
    if today_am_million is None:
        return None, None, False

    # Collect last 25 calendar days to find 20 trading days
    today_date = datetime.now(ICT).date()
    hist_values: list[float] = []
    partial = False

    for offset in range(1, 30):
        d = today_date - timedelta(days=offset)
        if d.weekday() >= 5:  # skip weekends
            continue
        from_ts, to_ts = _am_window_for_date(d)
        rows = await _safe(
            mo.fetch_liquidity(symbols="ALL", time_frame="ONE_MINUTE", from_ts=from_ts, to_ts=to_ts),
            f"am_liq_{d.isoformat()}",
        )
        val = _extract_am_total_million(rows)
        if val is not None and val > 0:
            hist_values.append(val)
        if len(hist_values) >= 20:
            break

    if not hist_values:
        return None, None, False

    partial = len(hist_values) < 20
    ma20_million = sum(hist_values) / len(hist_values)
    ma20_b = _r(ma20_million / _MILLION_PER_B, 0)
    today_b = today_am_million / _MILLION_PER_B
    vs_pct = _r((today_b / ma20_b - 1) * 100) if ma20_b else None

    return ma20_b, vs_pct, partial


# ── main entry ─────────────────────────────────────────────────────────────


async def build_midday_payload(db: AsyncSession) -> dict[str, Any]:
    """Build AM-session (~11:30) payload for the mid-day market brief.

    Same top-level shape as `build_analysis_payload()` (meta, index blocks,
    charts) plus a `pulse` block for the mid-day pulse bar.
    """
    from_ts, to_ts = _am_window_ts()

    # ── fetch all AM sources concurrently ───────────────────────────────────
    (
        snap_list,
        liq_rows,
        imp,
        fser,
        ftop,
        pser,
        ptop,
        eod_prev,
    ) = await asyncio.gather(
        _safe(mo.fetch_market_index(symbols=["VNINDEX", "VN30", "HNXIndex", "HNXUpcomIndex"]), "snapshot"),
        _safe(mo.fetch_liquidity(symbols="ALL", time_frame="ONE_MINUTE", from_ts=from_ts, to_ts=to_ts), "am_liquidity"),
        _safe(mo.fetch_index_impact(group="ALL", time_frame="ONE_DAY"), "impact"),
        _safe(mo.fetch_foreign(group="ALL", time_frame="ONE_DAY", from_ts=from_ts, to_ts=to_ts), "foreign"),
        _safe(mo.fetch_foreign_top(group="ALL", time_frame="ONE_DAY", from_ts=from_ts, to_ts=to_ts), "foreign_top"),
        _safe(mo.fetch_proprietary(market="ALL", time_frame="ONE_DAY"), "prop"),
        _safe(mo.fetch_proprietary_top(exchange="ALL", time_frame="ONE_DAY"), "prop_top"),
        MP._load_previous_eod(db),
    )

    snap = {s["symbol"]: s for s in (snap_list or [])}
    vn_snap = snap.get("VNINDEX", {})

    # ── index values ─────────────────────────────────────────────────────────
    price = vn_snap.get("price")
    ref = vn_snap.get("ref_price")
    change = vn_snap.get("change")
    change_pct = vn_snap.get("change_percent")
    if change is None and price is not None and ref:
        change = price - ref
    if change_pct is None and change is not None and ref:
        change_pct = change / ref * 100

    # ── AM liquidity + MA20 ──────────────────────────────────────────────────
    am_total_million = _extract_am_total_million(liq_rows)
    am_total_b = _r(am_total_million / _MILLION_PER_B, 0) if am_total_million is not None else None
    sparkline = _build_sparkline(liq_rows)

    ma20_b, vs_ma20_pct, ma20_partial = await _am_liquidity_ma20(am_total_million)

    # ── derived blocks ────────────────────────────────────────────────────────
    missing: list[str] = []

    am_breadth = _build_am_breadth(vn_snap)
    if am_breadth is None:
        missing.append("breadth")

    am_contribution = _build_am_contribution(imp, change or 0.0)
    if am_contribution is None:
        missing.append("contribution")

    am_foreign = _build_am_foreign(fser, ftop)
    if am_foreign is None:
        missing.append("foreign_detail")

    am_prop = _build_am_prop(pser, ptop)
    if am_prop is None:
        missing.append("prop_detail")

    if ma20_partial:
        missing.append("am_ma20_partial")

    if not liq_rows:
        missing.append("am_liquidity")

    # ── EOD-frozen context ────────────────────────────────────────────────────
    eod_charts: dict | None = (eod_prev or {}).get("charts") if eod_prev else None

    # ── charts block ─────────────────────────────────────────────────────────
    charts = _build_midday_charts(
        breadth=am_breadth,
        contribution=am_contribution,
        foreign_detail=am_foreign,
        prop_detail=am_prop,
        eod_previous_charts=eod_charts,
    )

    # ── pulse block ───────────────────────────────────────────────────────────
    foreign_net_b: float | None = None
    if fser:
        row = fser[-1]
        buy_v = row.get("foreign_buy_value_vnd") or 0
        sell_v = row.get("foreign_sell_value_vnd") or 0
        foreign_net_b = _r((buy_v - sell_v) / _VND_B)

    pulse = {
        "vn_index": {
            "value": _r(price),
            "change": _r(change),
            "change_pct": _r(change_pct),
            "sparkline": sparkline,
        },
        "breadth": {
            "up": (am_breadth or {}).get("up"),
            "down": (am_breadth or {}).get("down"),
        },
        "foreign_net_billion": foreign_net_b,
        "liquidity": {
            "am_value_billion": am_total_b,
            "ma20_billion": ma20_b,
            "vs_ma20_pct": vs_ma20_pct,
        },
    }

    # ── assemble payload ──────────────────────────────────────────────────────
    today_str = date.today().isoformat()

    payload: dict[str, Any] = {
        "meta": {
            "report_type": "midday",
            "session_phase": "am",
            "generated_for_date": today_str,
            "as_of": datetime.now(UTC).isoformat(),
            "missing_fields": missing,
        },
        "vnindex": {
            "price": _r(price),
            "ref_price": _r(ref),
            "change": _r(change),
            "change_pct": _r(change_pct),
        },
        "vn30": {
            "price": _r((snap.get("VN30") or {}).get("price")),
            "change_pct": _r((snap.get("VN30") or {}).get("change_percent")),
        },
        "hnx": {
            "price": _r((snap.get("HNXIndex") or {}).get("price")),
            "change_pct": _r((snap.get("HNXIndex") or {}).get("change_percent")),
        },
        "upcom": {
            "price": _r((snap.get("HNXUpcomIndex") or {}).get("price")),
            "change_pct": _r((snap.get("HNXUpcomIndex") or {}).get("change_percent")),
        },
        "breadth": am_breadth,
        "am_contribution": am_contribution,
        "am_foreign": am_foreign,
        "am_prop": am_prop,
        "charts": charts,
        "pulse": pulse,
        "previous_eod": {
            "headline": (eod_prev or {}).get("headline"),
            "tagline": (eod_prev or {}).get("tagline"),
            "session_date": (eod_prev or {}).get("session_date"),
        } if eod_prev else None,
    }

    return payload

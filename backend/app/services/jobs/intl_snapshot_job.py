"""International market snapshot scheduler job (3-wave, pre-market ICT).

Wave 1 (06:00 ICT): ALL_SYMBOLS — full universe including crypto (BTC-USD, ETH-USD via Binance).
Wave 2 (07:05 ICT): WAVE2_SYMBOLS — Asia early opens + FX + commodities.
Wave 3 (08:30 ICT): WAVE3_SYMBOLS — late-open Asia + Vietnam ETF proxy.

Cron runs mon-fri. Advisory lock (826_101_733) ensures exactly one uvicorn
worker does the fetch per firing when session=None (scheduled path). Pass an
explicit session to skip the lock (tests / manual triggers).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from app.services.market_data.intl_symbols import (
    ALL_SYMBOLS,
    CRITICAL_SYMBOLS,
    WAVE2_SYMBOLS,
    WAVE3_SYMBOLS,
)
from app.services.market_data.intl_snapshot import persist_snapshot_rows
from app.services.market_data.sources.yahoo import fetch_many
from app.services.ai.market_analysis.market_calendar import is_trading_day

logger = logging.getLogger(__name__)

_ICT = timezone(timedelta(hours=7))
_INTL_LOCK_KEY = 826_101_733

# Crypto symbols that are fetched via Binance, not Yahoo
_CRYPTO_SYMBOLS = {"BTC-USD", "ETH-USD"}

# Mapping: IQX symbol → Binance ticker symbol + display name
_BINANCE_MAP: dict[str, dict[str, str]] = {
    "BTC-USD": {"ticker": "BTCUSDT", "name": "Bitcoin"},
    "ETH-USD": {"ticker": "ETHUSDT", "name": "Ethereum"},
}

_WAVE_SETS: dict[int, list[str]] = {
    1: ALL_SYMBOLS,
    2: WAVE2_SYMBOLS,
    3: WAVE3_SYMBOLS,
}


async def _fetch_crypto(symbols: list[str]) -> dict[str, dict]:
    """Fetch crypto symbols via Binance and return parsed snapshot dicts.

    If a symbol's Binance fetch fails or required fields are absent, that
    symbol is silently omitted (will be stale-copied by persist_snapshot_rows).
    """
    from app.services.market_data.sources import binance

    parsed: dict[str, dict] = {}
    for symbol in symbols:
        if symbol not in _BINANCE_MAP:
            logger.warning("intl_snapshot_job: no Binance mapping for crypto symbol %r", symbol)
            continue
        meta = _BINANCE_MAP[symbol]
        try:
            data, _ = await binance.fetch_ticker(meta["ticker"])
            # binance.fetch_ticker normalized fields:
            #   last_price (float), price_change (float), open_price (float),
            #   high_price, low_price, volume, quote_volume, change_pct, etc.
            # previous_close = last_price - price_change
            last_price = data.get("last_price")
            price_change = data.get("price_change")
            if last_price is None or price_change is None:
                logger.warning(
                    "intl_snapshot_job: Binance missing required fields for %r — skipping",
                    symbol,
                )
                continue
            previous_close = last_price - price_change
            change_value = price_change
            change_percent = data.get("change_pct", 0.0)
            parsed[symbol] = {
                "last_price": float(last_price),
                "previous_close": float(previous_close),
                "change_value": float(change_value),
                "change_percent": float(change_percent),
                "day_high": float(data["high_price"]) if data.get("high_price") is not None else None,
                "day_low": float(data["low_price"]) if data.get("low_price") is not None else None,
                "volume": float(data["volume"]) if data.get("volume") is not None else None,
                "currency": "USD",
                "market_state": "REGULAR",
                "name": meta["name"],
            }
        except Exception as exc:
            logger.warning("intl_snapshot_job: Binance fetch failed for %r: %s", symbol, exc)

    return parsed


async def _run(wave: int, session: Any) -> dict[str, Any]:
    """Core logic: fetch + persist for the given wave, using the provided session."""
    symbol_set = _WAVE_SETS[wave]
    today = datetime.now(_ICT).date()

    # Split requested set into Yahoo symbols and crypto symbols
    crypto_requested = [s for s in symbol_set if s in _CRYPTO_SYMBOLS]
    yahoo_requested = [s for s in symbol_set if s not in _CRYPTO_SYMBOLS]

    # Fetch Yahoo symbols
    yahoo_parsed: dict[str, dict] = {}
    if yahoo_requested:
        yahoo_parsed = await fetch_many(yahoo_requested)

    # Fetch crypto symbols (only if this wave contains any)
    crypto_parsed: dict[str, dict] = {}
    if crypto_requested:
        crypto_parsed = await _fetch_crypto(crypto_requested)

    # Merge parsed results; crypto augments yahoo
    parsed = {**yahoo_parsed, **crypto_parsed}

    # Full requested list (both yahoo + crypto)
    requested = yahoo_requested + crypto_requested

    # Persist
    result = await persist_snapshot_rows(session, today, parsed, requested)

    # ── Alert rule ────────────────────────────────────────────────────────────
    missing: list[str] = result.get("missing", [])
    stale_copied: int = result.get("stale_copied", 0)
    n_requested = len(requested)

    # Stale-copied symbols are not individually identified in the return value,
    # so we treat the count as a proxy for the threshold check.
    threshold_exceeded = (len(missing) + stale_copied) > 0.2 * n_requested
    critical_missing = any(s in missing for s in CRITICAL_SYMBOLS)

    # Also detect critical symbols that were stale-copied:
    # We can infer stale symbols as requested symbols absent from parsed.
    absent = set(s for s in requested if s not in parsed)
    critical_stale = any(s in absent for s in CRITICAL_SYMBOLS if s not in missing)

    if threshold_exceeded or critical_missing or critical_stale:
        alert_symbols = sorted(absent | set(missing))
        logger.error(
            "intl_snapshot_job wave=%d: data quality alert — "
            "affected=%r missing=%r stale_copied=%d (critical symbols affected: %r)",
            wave,
            alert_symbols,
            missing,
            stale_copied,
            [s for s in CRITICAL_SYMBOLS if s in absent or s in missing],
        )

    result["wave"] = wave
    result["date"] = today.isoformat()
    return result


async def run_intl_snapshot_job(wave: int = 1, session: Any | None = None) -> dict[str, Any]:
    """Run the international snapshot job for the given wave.

    Scheduled run (session=None) takes a pg advisory lock so only one uvicorn
    worker executes. Manual/test triggers may pass an explicit session to skip
    the lock.
    """
    today = datetime.now(_ICT).date()
    if not is_trading_day(today):
        logger.info("intl_snapshot_job wave=%d skipped: %s is not a VN trading day", wave, today)
        return {"skipped": "not_trading_day", "date": today.isoformat()}

    if session is not None:
        return await _run(wave, session)

    from app.core.database import get_session_factory

    factory = get_session_factory()
    async with factory() as db:
        got = (
            await db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _INTL_LOCK_KEY})
        ).scalar()
        if not got:
            logger.info("intl_snapshot_job wave=%d: lock held by another worker — skipping", wave)
            return {"skipped": "locked", "date": today.isoformat()}
        try:
            return await _run(wave, db)
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _INTL_LOCK_KEY})
            await db.commit()


# ── Thin no-args wrappers for APScheduler ────────────────────────────────────

async def run_intl_wave1() -> None:
    """APScheduler job: Wave 1 — ALL_SYMBOLS at 06:00 ICT."""
    await run_intl_snapshot_job(wave=1)


async def run_intl_wave2() -> None:
    """APScheduler job: Wave 2 — WAVE2_SYMBOLS at 07:05 ICT."""
    await run_intl_snapshot_job(wave=2)


async def run_intl_wave3() -> None:
    """APScheduler job: Wave 3 — WAVE3_SYMBOLS at 08:30 ICT."""
    await run_intl_snapshot_job(wave=3)

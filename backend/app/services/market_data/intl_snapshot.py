"""Snapshot upsert/stale service for the international-data pipeline.

Provides two public coroutines:
- persist_snapshot_rows: upsert parsed symbols; stale-copy or report missing for absent requested symbols.
- load_latest_snapshot: return all rows from the most-recent snapshot_date (optional category filter).
"""

from __future__ import annotations

import logging
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data_snapshot import MarketDataSnapshot
from app.services.market_data.intl_symbols import CATEGORY_BY_SYMBOL

logger = logging.getLogger(__name__)


async def persist_snapshot_rows(
    db: AsyncSession,
    day: date,
    parsed: dict[str, dict],
    requested: list[str],
) -> dict:
    """Upsert parsed snapshot rows; stale-copy or report missing for absent symbols.

    Args:
        db: Async SQLAlchemy session.
        day: The snapshot date for this batch.
        parsed: Mapping of symbol → parsed price dict (from yahoo parse_chart_meta).
        requested: Full list of symbols that were expected in this fetch.

    Returns:
        {"upserted": int, "stale_copied": int, "missing": list[str]}
    """
    upserted = 0
    stale_copied = 0
    missing: list[str] = []

    # ── 0. Pre-filter incomplete parsed rows (NOT NULL guard) ────────────────
    valid_parsed = {
        sym: d for sym, d in parsed.items()
        if d.get("last_price") is not None
        and d.get("previous_close") is not None
        and d.get("change_value") is not None
        and d.get("change_percent") is not None
    }

    # Log dropped symbols that are missing required fields
    dropped = [s for s in parsed if s not in valid_parsed]
    if dropped:
        logger.warning(
            "intl_snapshot: missing required price fields for symbols %r — routing to stale/missing path",
            dropped,
        )

    # ── 1. Upsert each parsed symbol ────────────────────────────────────────
    for symbol, data in valid_parsed.items():
        category = CATEGORY_BY_SYMBOL.get(symbol)
        if category is None:
            logger.warning("intl_snapshot: unknown symbol %r, defaulting category to 'other'", symbol)
            category = "other"

        # Convert market_time ISO string → datetime (or keep None)
        raw_market_time = data.get("market_time")
        market_time: datetime | None = None
        if raw_market_time is not None:
            try:
                market_time = datetime.fromisoformat(raw_market_time)
            except (ValueError, TypeError):
                logger.warning("intl_snapshot: could not parse market_time %r for %s", raw_market_time, symbol)

        # Check for existing row for (day, symbol)
        result = await db.execute(
            select(MarketDataSnapshot).where(
                MarketDataSnapshot.snapshot_date == day,
                MarketDataSnapshot.symbol == symbol,
            )
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            # Update in-place
            existing.asset_category = category
            existing.name = data.get("name", existing.name)
            existing.last_price = data["last_price"]
            existing.previous_close = data["previous_close"]
            existing.change_value = data["change_value"]
            existing.change_percent = data["change_percent"]
            existing.day_high = data.get("day_high")
            existing.day_low = data.get("day_low")
            existing.volume = data.get("volume")
            existing.currency = data.get("currency")
            existing.market_state = data.get("market_state")
            existing.market_time = market_time
            existing.stale = False
        else:
            # Insert new row
            row = MarketDataSnapshot(
                snapshot_date=day,
                asset_category=category,
                symbol=symbol,
                name=data.get("name", symbol),
                last_price=data["last_price"],
                previous_close=data["previous_close"],
                change_value=data["change_value"],
                change_percent=data["change_percent"],
                day_high=data.get("day_high"),
                day_low=data.get("day_low"),
                volume=data.get("volume"),
                currency=data.get("currency"),
                market_state=data.get("market_state"),
                market_time=market_time,
                stale=False,
            )
            db.add(row)

        upserted += 1

    # ── 2. Handle requested symbols absent from valid_parsed ─────────────────
    absent = [s for s in requested if s not in valid_parsed]

    for symbol in absent:
        # Look for the newest row strictly before `day`
        result = await db.execute(
            select(MarketDataSnapshot)
            .where(
                MarketDataSnapshot.symbol == symbol,
                MarketDataSnapshot.snapshot_date < day,
            )
            .order_by(MarketDataSnapshot.snapshot_date.desc())
            .limit(1)
        )
        source_row = result.scalar_one_or_none()

        if source_row is None:
            missing.append(symbol)
            continue

        # Determine category for this symbol
        category = CATEGORY_BY_SYMBOL.get(symbol, "other")

        # Check if today's row already exists (e.g., from a previous partial run)
        today_result = await db.execute(
            select(MarketDataSnapshot).where(
                MarketDataSnapshot.snapshot_date == day,
                MarketDataSnapshot.symbol == symbol,
            )
        )
        today_row = today_result.scalar_one_or_none()

        if today_row is not None:
            # Update existing today row with stale values
            today_row.asset_category = source_row.asset_category
            today_row.name = source_row.name
            today_row.last_price = source_row.last_price
            today_row.previous_close = source_row.previous_close
            today_row.change_value = source_row.change_value
            today_row.change_percent = source_row.change_percent
            today_row.day_high = source_row.day_high
            today_row.day_low = source_row.day_low
            today_row.volume = source_row.volume
            today_row.currency = source_row.currency
            today_row.market_state = source_row.market_state
            today_row.market_time = source_row.market_time
            today_row.source = source_row.source
            today_row.stale = True
        else:
            # Insert a stale copy for today
            stale_row = MarketDataSnapshot(
                snapshot_date=day,
                asset_category=source_row.asset_category,
                symbol=source_row.symbol,
                name=source_row.name,
                last_price=source_row.last_price,
                previous_close=source_row.previous_close,
                change_value=source_row.change_value,
                change_percent=source_row.change_percent,
                day_high=source_row.day_high,
                day_low=source_row.day_low,
                volume=source_row.volume,
                currency=source_row.currency,
                market_state=source_row.market_state,
                market_time=source_row.market_time,
                source=source_row.source,
                stale=True,
            )
            db.add(stale_row)

        stale_copied += 1

    await db.commit()

    return {"upserted": upserted, "stale_copied": stale_copied, "missing": missing}


async def load_latest_snapshot(
    db: AsyncSession,
    category: str | None = None,
) -> list[MarketDataSnapshot]:
    """Return all rows from the most-recent snapshot_date.

    Args:
        db: Async SQLAlchemy session.
        category: Optional asset_category filter.

    Returns:
        List of MarketDataSnapshot rows ordered by (asset_category, symbol).
    """
    # Find the maximum snapshot_date in the table
    from sqlalchemy import func

    max_date_result = await db.execute(
        select(func.max(MarketDataSnapshot.snapshot_date))
    )
    max_date = max_date_result.scalar_one_or_none()

    if max_date is None:
        return []

    query = select(MarketDataSnapshot).where(
        MarketDataSnapshot.snapshot_date == max_date
    )

    if category is not None:
        query = query.where(MarketDataSnapshot.asset_category == category)

    query = query.order_by(
        MarketDataSnapshot.asset_category,
        MarketDataSnapshot.symbol,
    )

    result = await db.execute(query)
    return list(result.scalars().all())

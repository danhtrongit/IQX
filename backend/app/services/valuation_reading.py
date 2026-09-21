"""Canonical three-way reading for BCTC ``blocks.valuation``.

The BCTC dashboard owns the numbers.  This module only turns its existing
``fair_median`` / ``current_price`` / ``methods[].bear,bull`` contract into the
five visual levels used by the learning journey.  It deliberately does not
substitute L2 from AI Insight: L2 is liquidity, not valuation.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import date
from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journey_identity import JourneyReadingDataset
from app.services.journey_identity.classification import digest

logger = logging.getLogger(__name__)


def positive(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


@dataclass(frozen=True)
class ValuationReading:
    """A verified reading of one BCTC valuation block."""

    verdict: str
    rank: int
    label: str
    price: float
    fair_median: float
    low: float
    high: float
    trading_date: date | None = None
    source_ref: str | None = None

    @property
    def explanation(self) -> str:
        return (
            f"BCTC Khối 02: giá hiện tại {self.price:,.0f}đ; vùng giá trị "
            f"{self.low:,.0f}–{self.high:,.0f}đ; trung vị "
            f"{self.fair_median:,.0f}đ."
        )


def read_valuation(
    valuation: object,
    *,
    observed_price: object = None,
    trading_date: date | None = None,
    source_ref: str | None = None,
) -> ValuationReading | None:
    """Read BCTC valuation using the established Cấp-1/identity convention.

    Bounds are the lowest positive ``bear`` and highest positive ``bull`` from
    the methods.  When a side is absent, the existing fallback is median ±15%.
    Inside those bounds, median ±5% separates support, neutral and opposition.
    Missing/non-finite/non-positive price or median means unknown.
    """
    if not isinstance(valuation, dict):
        return None
    median_raw = valuation.get("fair_median")
    price_raw = observed_price if positive(observed_price) else valuation.get("current_price")
    if not positive(price_raw) or not positive(median_raw):
        return None
    price = float(cast(float, price_raw))  # narrowed by ``positive`` above
    median = float(cast(float, median_raw))

    methods = valuation.get("methods")
    if not isinstance(methods, list):
        methods = []
    bears = [float(m["bear"]) for m in methods if isinstance(m, dict) and positive(m.get("bear"))]
    bulls = [float(m["bull"]) for m in methods if isinstance(m, dict) and positive(m.get("bull"))]
    low = min(bears) if bears else median * 0.85
    high = max(bulls) if bulls else median * 1.15

    if price < low:
        verdict, rank, label = "ok", 5, "Thấp hơn vùng giá trị"
    elif price < median * 0.95:
        verdict, rank, label = "ok", 4, "Nửa dưới vùng giá trị"
    elif price > high:
        verdict, rank, label = "bad", 1, "Vượt vùng giá trị"
    elif price > median * 1.05:
        verdict, rank, label = "bad", 2, "Nửa trên vùng giá trị"
    else:
        verdict, rank, label = "neu", 3, "Quanh trung vị"

    return ValuationReading(
        verdict=verdict,
        rank=rank,
        label=label,
        price=price,
        fair_median=median,
        low=low,
        high=high,
        trading_date=trading_date,
        source_ref=source_ref,
    )


class JourneyValuationSource:
    """Read already-frozen BCTC valuation evidence in one database query.

    ``JourneyReadingDataset`` is populated from ``compute_dashboard`` and keeps
    the exact raw valuation and observed price.  Reusing it avoids an N-symbol
    network fan-out every time Cấp 5 opens a Watchlist.  A corrupt, mismatched,
    stale or incomplete receipt is ignored instead of being guessed neutral.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _reading(row: JourneyReadingDataset) -> ValuationReading | None:
        payload = row.payload
        if not isinstance(payload, dict) or digest(payload) != row.dataset_hash:
            logger.warning("valuation_dataset_integrity_error", extra={"dataset_id": str(row.id)})
            return None
        requested = payload.get("symbol")
        source = payload.get("valuation_source_symbol")
        expected = row.symbol.upper()
        if (
            not isinstance(requested, str)
            or requested.upper() != expected
            or not isinstance(source, str)
            or source.upper() != expected
        ):
            logger.warning("valuation_dataset_symbol_mismatch", extra={"dataset_id": str(row.id)})
            return None
        snapshot = payload.get("source_snapshot")
        valuation = snapshot.get("valuation") if isinstance(snapshot, dict) else None
        reading = read_valuation(
            valuation,
            observed_price=payload.get("price"),
            trading_date=row.trading_date,
            source_ref=f"journey_reading_dataset:{row.id}:{row.dataset_hash}",
        )
        declared = payload.get("ai_answers")
        declared = declared.get("dinh_gia") if isinstance(declared, dict) else None
        if reading is None or declared != reading.verdict:
            logger.warning("valuation_dataset_contract_mismatch", extra={"dataset_id": str(row.id)})
            return None
        return reading

    async def latest_many(self, symbols: list[str] | tuple[str, ...], *, earliest: date) -> dict[str, ValuationReading]:
        wanted = sorted({symbol.strip().upper() for symbol in symbols if symbol.strip()})
        if not wanted:
            return {}
        rows = (
            (
                await self._session.execute(
                    select(JourneyReadingDataset)
                    .where(
                        JourneyReadingDataset.symbol.in_(wanted),
                        JourneyReadingDataset.trading_date >= earliest,
                    )
                    .order_by(
                        JourneyReadingDataset.symbol.asc(),
                        JourneyReadingDataset.trading_date.desc(),
                        JourneyReadingDataset.created_at.desc(),
                    )
                )
            )
            .scalars()
            .all()
        )
        result: dict[str, ValuationReading] = {}
        for row in rows:
            symbol = row.symbol.upper()
            if symbol in result:
                continue
            reading = self._reading(row)
            if reading is not None:
                result[symbol] = reading
        return result

    async def latest(self, symbol: str, *, earliest: date) -> ValuationReading | None:
        return (await self.latest_many((symbol,), earliest=earliest)).get(symbol.strip().upper())

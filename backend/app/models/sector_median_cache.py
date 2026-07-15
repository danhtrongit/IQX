"""Sector median cache model — daily peer-median snapshot per ICB level-2 sector.

One row per ``(icb_lv2, asof_date)`` holds the sector-relative medians of the
key valuation/profitability ratios, computed by the peer-median service over a
bounded top-K set of peers. Read back on cache hit so peers are fetched at most
once per sector per day.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base, UUIDMixin


class SectorMedianCache(UUIDMixin, Base):
    """Cached sector-relative ratio medians for one ICB lv2 sector on one date."""

    __tablename__ = "sector_median_cache"
    __table_args__ = (
        UniqueConstraint("icb_lv2", "asof_date", name="uq_sector_median_icb_asof"),
    )

    icb_lv2: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    asof_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # sa.JSON here so SQLite tests work; migration uses JSONB on Postgres.
    medians: Mapped[dict] = mapped_column(JSON, nullable=False)
    peer_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        return (
            f"<SectorMedianCache {self.icb_lv2} {self.asof_date} n={self.peer_count}>"
        )

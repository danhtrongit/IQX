"""Neutral, live portfolio-allocation snapshot used by balance-aware features.

This module deliberately contains only allocation and data-completeness facts. It
neither persists progress nor evaluates P&L, trading streaks, correlation, stops,
or any other level-specific journey evidence.
"""

from __future__ import annotations

import math
import uuid
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.symbol import SymbolRepository
from app.services.virtual_trading.service import VirtualTradingService

MAX_SYMBOL_WEIGHT_PCT = 30.0
MAX_SECTOR_WEIGHT_PCT = 40.0
MIN_HELD_SYMBOLS = 4
MIN_KNOWN_SECTORS = 3

SectorLookup = Callable[[str], Awaitable[str | None]]
SectorSource = SectorLookup | Mapping[str, str | None]


@dataclass(frozen=True, slots=True)
class PortfolioPositionInput:
    """The allocation-relevant part of one virtual-trading position."""

    symbol: str
    quantity: int
    market_value_vnd: float | int | None


class SymbolAllocation(BaseModel):
    """One held symbol, retaining unknown pricing and sector states explicitly."""

    model_config = ConfigDict(frozen=True)

    symbol: str
    market_value_vnd: float | None = None
    weight_pct: float | None = None
    sector: str | None = None


class SectorAllocation(BaseModel):
    """The priced market value and NAV weight of one known ICB sector."""

    model_config = ConfigDict(frozen=True)

    sector: str
    market_value_vnd: float
    weight_pct: float | None = None


class PortfolioBalanceSnapshot(BaseModel):
    """A serializable allocation snapshot and its exact balance decision.

    ``known_sector_count`` counts distinct resolved sectors among all held
    symbols. A known sector on an unpriced position still counts as known, but
    that position is absent from ``sectors`` because its sector *weight* cannot
    be measured. ``data_complete`` and ``can_doi_ok`` remain false until every
    positive position has both a price and a resolved sector.
    """

    model_config = ConfigDict(frozen=True)

    nav_vnd: float
    cash_vnd: float | None = None
    cash_weight_pct: float | None = None
    positions: tuple[SymbolAllocation, ...]
    sectors: tuple[SectorAllocation, ...]
    held_symbol_count: int
    known_sector_count: int
    max_symbol: str | None = None
    max_symbol_weight_pct: float | None = None
    max_sector: str | None = None
    max_sector_weight_pct: float | None = None
    unpriced_symbols: tuple[str, ...]
    unknown_sector_symbols: tuple[str, ...]
    data_complete: bool
    can_doi_ok: bool


def _finite_non_negative(value: float | int | None) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def _normalise_sector(value: str | None) -> str | None:
    if value is None:
        return None
    sector = value.strip()
    return sector or None


def _cash_from_account(account: Any) -> float | None:
    """Return the full cash balance only when every cash component is usable."""

    total = 0.0
    for value in (
        getattr(account, "cash_available_vnd", None),
        getattr(account, "cash_reserved_vnd", None),
        getattr(account, "cash_pending_vnd", None),
    ):
        amount = _finite_non_negative(value)
        if amount is None:
            return None
        total += amount
    return total



async def build_portfolio_balance_snapshot(
    *,
    nav_vnd: float | int | None,
    cash_vnd: float | int | None,
    positions: Iterable[PortfolioPositionInput],
    sector_lookup: SectorSource,
) -> PortfolioBalanceSnapshot:
    """Build one honest balance snapshot from priced positions and ICB sectors.

    The denominator is the virtual account NAV supplied by
    ``VirtualTradingService`` and therefore includes all cash states. Invalid or
    zero NAV produces unknown weights and can never satisfy the balance gate.
    A sector lookup failure should be represented by ``None`` from
    ``sector_lookup``; this builder records it as an explicit unknown rather
    than treating its allocation as zero.
    """

    nav = _finite_non_negative(nav_vnd) or 0.0
    cash = _finite_non_negative(cash_vnd)
    positive_positions = [position for position in positions if position.quantity > 0]

    sector_cache: dict[str, str | None] = {}

    async def sector_for(symbol: str) -> str | None:
        if symbol not in sector_cache:
            if isinstance(sector_lookup, Mapping):
                value = sector_lookup.get(symbol)
            else:
                try:
                    value = await sector_lookup(symbol)
                except Exception:  # noqa: BLE001 - a failed lookup is an unknown sector
                    value = None
            sector_cache[symbol] = _normalise_sector(value)
        return sector_cache[symbol]

    allocations: list[SymbolAllocation] = []
    sector_market_values: dict[str, float] = {}
    known_sectors: set[str] = set()
    unpriced_symbols: list[str] = []
    unknown_sector_symbols: list[str] = []

    for position in sorted(positive_positions, key=lambda item: item.symbol.upper()):
        symbol = position.symbol.upper()
        sector = await sector_for(symbol)
        if sector is None:
            unknown_sector_symbols.append(symbol)
        else:
            known_sectors.add(sector)

        market_value = _finite_non_negative(position.market_value_vnd)
        if market_value is None:
            unpriced_symbols.append(symbol)
            allocations.append(SymbolAllocation(symbol=symbol, sector=sector))
            continue

        weight = market_value / nav * 100.0 if nav > 0 else None
        allocations.append(
            SymbolAllocation(
                symbol=symbol,
                market_value_vnd=market_value,
                weight_pct=weight,
                sector=sector,
            )
        )
        if sector is not None:
            sector_market_values[sector] = sector_market_values.get(sector, 0.0) + market_value

    sector_allocations = [
        SectorAllocation(
            sector=sector,
            market_value_vnd=market_value,
            weight_pct=market_value / nav * 100.0 if nav > 0 else None,
        )
        for sector, market_value in sector_market_values.items()
    ]
    sector_allocations.sort(key=lambda item: (-(item.weight_pct or 0.0), item.sector))

    priced_positions = [allocation for allocation in allocations if allocation.weight_pct is not None]
    max_position = max(priced_positions, key=lambda item: item.weight_pct or 0.0, default=None)
    max_sector = max(sector_allocations, key=lambda item: item.weight_pct or 0.0, default=None)

    data_complete = (
        nav > 0
        and cash is not None
        and not unpriced_symbols
        and not unknown_sector_symbols
    )

    can_doi_ok = (
        data_complete
        and len(allocations) >= MIN_HELD_SYMBOLS
        and len(known_sectors) >= MIN_KNOWN_SECTORS
        and (
            max_position is None
            or (
                max_position.weight_pct is not None
                and max_position.weight_pct <= MAX_SYMBOL_WEIGHT_PCT
            )
        )
        and (
            max_sector is None
            or (
                max_sector.weight_pct is not None
                and max_sector.weight_pct <= MAX_SECTOR_WEIGHT_PCT
            )
        )
    )

    return PortfolioBalanceSnapshot(
        nav_vnd=nav,
        cash_vnd=cash,
        cash_weight_pct=cash / nav * 100.0 if nav > 0 and cash is not None else None,
        positions=tuple(allocations),
        sectors=tuple(sector_allocations),
        held_symbol_count=len(allocations),
        known_sector_count=len(known_sectors),
        max_symbol=max_position.symbol if max_position is not None else None,
        max_symbol_weight_pct=max_position.weight_pct if max_position is not None else None,
        max_sector=max_sector.sector if max_sector is not None else None,
        max_sector_weight_pct=max_sector.weight_pct if max_sector is not None else None,
        unpriced_symbols=tuple(unpriced_symbols),
        unknown_sector_symbols=tuple(unknown_sector_symbols),
        data_complete=data_complete,
        can_doi_ok=can_doi_ok,
    )


class PortfolioBalanceService:
    """Fetches the two live sources needed by :func:`build_portfolio_balance_snapshot`."""

    def __init__(self, session: AsyncSession) -> None:
        self._virtual_trading = VirtualTradingService(session)
        self._symbols = SymbolRepository(session)

    async def get_snapshot(self, user_id: uuid.UUID) -> PortfolioBalanceSnapshot:
        """Return the current allocation snapshot for the user's virtual account."""

        portfolio: dict[str, Any] = await self._virtual_trading.get_portfolio(user_id)
        account = portfolio["account"]
        positions = [
            PortfolioPositionInput(
                symbol=row["symbol"],
                quantity=int(row["quantity_total"]),
                market_value_vnd=row.get("market_value_vnd"),
            )
            for row in portfolio["positions"]
        ]
        sector_by_symbol = await self._sectors_for_symbols(
            [position.symbol for position in positions if position.quantity > 0]
        )
        cash = _cash_from_account(account)
        return await build_portfolio_balance_snapshot(
            nav_vnd=portfolio["nav_vnd"],
            cash_vnd=cash,
            positions=positions,
            sector_lookup=sector_by_symbol,
        )

    async def get_snapshot_after_sale(
        self, user_id: uuid.UUID, symbol: str, quantity: int
    ) -> PortfolioBalanceSnapshot:
        """Project allocation after selling ``quantity`` at the current mark.

        NAV remains the live portfolio NAV: a sale converts the selected marked
        position value to cash. Missing price/cash data stays unknown instead of
        fabricating a safe post-sale allocation.
        """
        portfolio: dict[str, Any] = await self._virtual_trading.get_portfolio(user_id)
        target = next(
            (row for row in portfolio["positions"] if row["symbol"].upper() == symbol.upper()),
            None,
        )
        if target is None:
            raise ValueError("position not found")
        total = int(target["quantity_total"])
        if quantity <= 0 or quantity > total:
            raise ValueError("invalid proposed sale quantity")

        target_value = _finite_non_negative(target.get("market_value_vnd"))
        remaining_quantity = total - quantity
        remaining_value = (
            target_value * remaining_quantity / total if target_value is not None and total > 0 else None
        )
        cash = _cash_from_account(portfolio["account"])
        projected_cash = (
            cash + (target_value - remaining_value)
            if cash is not None and target_value is not None and remaining_value is not None
            else None
        )
        positions = [
            PortfolioPositionInput(
                symbol=row["symbol"],
                quantity=remaining_quantity if row is target else int(row["quantity_total"]),
                market_value_vnd=remaining_value if row is target else row.get("market_value_vnd"),
            )
            for row in portfolio["positions"]
        ]
        sector_by_symbol = await self._sectors_for_symbols(
            [position.symbol for position in positions if position.quantity > 0]
        )
        return await build_portfolio_balance_snapshot(
            nav_vnd=portfolio["nav_vnd"],
            cash_vnd=projected_cash,
            positions=positions,
            sector_lookup=sector_by_symbol,
        )

    async def _sectors_for_symbols(self, symbols: list[str]) -> dict[str, str | None]:
        """Resolve the held basket in one query; unavailable catalog data is unknown."""

        try:
            rows = await self._symbols.get_by_symbols(symbols)
        except Exception:  # noqa: BLE001 - a failed catalog query cannot imply safe sectors
            return {}
        return {
            symbol: _normalise_sector(row.icb_lv2) or _normalise_sector(row.icb_lv1)
            for symbol, row in rows.items()
        }

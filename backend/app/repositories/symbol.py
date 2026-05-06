"""Symbol repository — data access layer for the Symbol model."""

from __future__ import annotations

from typing import Any

from sqlalchemy import case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.symbol import Symbol


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcards to prevent wildcard injection."""
    return (
        value
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


class SymbolRepository:
    """Pure data-access class for symbols."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_symbol(self, symbol: str) -> Symbol | None:
        """Get a single symbol by its ticker code."""
        result = await self._session.execute(
            select(Symbol).where(Symbol.symbol == symbol.upper())
        )
        return result.scalar_one_or_none()

    async def search(
        self,
        *,
        q: str | None = None,
        exchange: str | None = None,
        asset_type: str | None = None,
        include_indices: bool = False,
        is_active: bool = True,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Symbol], int]:
        """Search symbols with ranking: exact > prefix > contains.

        Returns (symbols, total_count).
        """
        query = select(Symbol)

        # ── Filters ──────────────────────────────────
        if is_active:
            query = query.where(Symbol.is_active.is_(True))

        if not include_indices:
            query = query.where(Symbol.is_index.is_(False))

        if exchange:
            query = query.where(Symbol.exchange == exchange.upper())

        if asset_type:
            query = query.where(Symbol.asset_type == asset_type.lower())

        # ── Search ───────────────────────────────────
        if q:
            cleaned = q.strip().upper()
            escaped = _escape_like(cleaned)
            contains_pattern = f"%{escaped}%"

            # Match any of: symbol, name, short_name
            query = query.where(
                or_(
                    Symbol.symbol.ilike(contains_pattern, escape="\\"),
                    Symbol.name.ilike(contains_pattern, escape="\\"),
                    Symbol.short_name.ilike(contains_pattern, escape="\\"),
                )
            )

            # Ranking: 1=exact symbol, 2=symbol prefix, 3=contains
            rank_expr = case(
                (Symbol.symbol == cleaned, literal(1)),
                (Symbol.symbol.ilike(f"{escaped}%", escape="\\"), literal(2)),
                else_=literal(3),
            )
            query = query.order_by(rank_expr, Symbol.symbol)
        else:
            query = query.order_by(Symbol.symbol)

        # ── Total count ─────────────────────────────
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self._session.execute(count_query)).scalar_one()

        # ── Pagination ──────────────────────────────
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self._session.execute(query)
        symbols = list(result.scalars().all())
        return symbols, total

    async def upsert_many(self, records: list[dict[str, Any]]) -> tuple[int, int]:
        """Upsert symbols by symbol key. Returns (inserted, updated)."""
        inserted = 0
        updated = 0

        for data in records:
            symbol_code = data.get("symbol", "").upper()
            if not symbol_code:
                continue

            existing = await self.get_by_symbol(symbol_code)
            if existing is None:
                obj = Symbol(**data)
                self._session.add(obj)
                inserted += 1
            else:
                for key, value in data.items():
                    if key != "symbol" and value is not None:
                        setattr(existing, key, value)
                updated += 1

        await self._session.flush()
        return inserted, updated

    async def deactivate_missing(self, active_symbols: set[str]) -> int:
        """Mark symbols not in active_symbols as inactive. Returns count."""
        query = select(Symbol).where(
            Symbol.is_active.is_(True),
            Symbol.symbol.notin_(active_symbols),
        )
        result = await self._session.execute(query)
        symbols = list(result.scalars().all())
        for sym in symbols:
            sym.is_active = False
        await self._session.flush()
        return len(symbols)

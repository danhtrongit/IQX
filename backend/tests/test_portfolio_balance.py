"""Focused contracts for the neutral portfolio-balance snapshot."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.portfolio_balance import (
    MAX_SECTOR_WEIGHT_PCT,
    MAX_SYMBOL_WEIGHT_PCT,
    MIN_HELD_SYMBOLS,
    MIN_KNOWN_SECTORS,
    PortfolioBalanceService,
    PortfolioPositionInput,
    build_portfolio_balance_snapshot,
)


def _sectors(values: dict[str, str | None]):
    async def lookup(symbol: str) -> str | None:
        return values.get(symbol)

    return lookup


async def _snapshot(
    positions: list[PortfolioPositionInput],
    sectors: dict[str, str | None],
    *,
    nav_vnd: float = 1_000.0,
    cash_vnd: float = 100.0,
):
    return await build_portfolio_balance_snapshot(
        nav_vnd=nav_vnd,
        cash_vnd=cash_vnd,
        positions=positions,
        sector_lookup=_sectors(sectors),
    )


def _balanced_positions() -> list[PortfolioPositionInput]:
    return [
        PortfolioPositionInput(symbol="AAA", quantity=10, market_value_vnd=300.0),
        PortfolioPositionInput(symbol="BBB", quantity=10, market_value_vnd=100.0),
        PortfolioPositionInput(symbol="CCC", quantity=10, market_value_vnd=300.0),
        PortfolioPositionInput(symbol="DDD", quantity=10, market_value_vnd=200.0),
    ]


async def test_service_uses_virtual_portfolio_cash_and_icb_sectors(db_session):
    service = PortfolioBalanceService(db_session)
    positions = _balanced_positions()

    class FakeVirtualTrading:
        async def get_portfolio(self, _user_id):
            return {
                "account": SimpleNamespace(
                    cash_available_vnd=60.0,
                    cash_reserved_vnd=30.0,
                    cash_pending_vnd=10.0,
                ),
                "nav_vnd": 1_000.0,
                "positions": [
                    {
                        "symbol": position.symbol,
                        "quantity_total": position.quantity,
                        "market_value_vnd": position.market_value_vnd,
                    }
                    for position in positions
                ],
            }

    class FakeSymbolRepository:
        async def get_by_symbol(self, symbol: str):
            sectors = {
                "AAA": "Công nghệ",
                "BBB": "Công nghệ",
                "CCC": "Tài chính",
                "DDD": "Công nghiệp",
            }
            return SimpleNamespace(icb_lv2=sectors[symbol], icb_lv1=None)

    service._virtual_trading = FakeVirtualTrading()
    service._symbols = FakeSymbolRepository()

    snapshot = await service.get_snapshot(uuid.uuid4())

    assert snapshot.cash_vnd == 100.0
    assert snapshot.cash_weight_pct == 10.0
    assert snapshot.can_doi_ok is True


async def test_snapshot_uses_nav_including_cash_and_accepts_exact_thresholds():
    snapshot = await _snapshot(
        _balanced_positions(),
        {"AAA": "Công nghệ", "BBB": "Công nghệ", "CCC": "Tài chính", "DDD": "Công nghiệp"},
    )

    assert snapshot.cash_weight_pct == 10.0
    assert snapshot.max_symbol_weight_pct == MAX_SYMBOL_WEIGHT_PCT
    assert snapshot.max_sector_weight_pct == MAX_SECTOR_WEIGHT_PCT
    assert snapshot.max_symbol == "AAA"
    assert snapshot.max_sector == "Công nghệ"
    assert snapshot.held_symbol_count == MIN_HELD_SYMBOLS
    assert snapshot.known_sector_count == MIN_KNOWN_SECTORS
    assert snapshot.can_doi_ok is True


async def test_snapshot_rejects_a_symbol_weight_strictly_above_30_percent():
    positions = _balanced_positions()
    positions[0] = PortfolioPositionInput(symbol="AAA", quantity=10, market_value_vnd=301.0)
    positions[1] = PortfolioPositionInput(symbol="BBB", quantity=10, market_value_vnd=99.0)

    snapshot = await _snapshot(
        positions,
        {"AAA": "Công nghệ", "BBB": "Công nghệ", "CCC": "Tài chính", "DDD": "Công nghiệp"},
    )

    assert snapshot.max_symbol_weight_pct == pytest.approx(30.1)
    assert snapshot.can_doi_ok is False


async def test_snapshot_rejects_a_sector_weight_strictly_above_40_percent():
    positions = _balanced_positions()
    positions[1] = PortfolioPositionInput(symbol="BBB", quantity=10, market_value_vnd=101.0)

    snapshot = await _snapshot(
        positions,
        {"AAA": "Công nghệ", "BBB": "Công nghệ", "CCC": "Tài chính", "DDD": "Công nghiệp"},
        cash_vnd=99.0,
    )

    assert snapshot.max_sector_weight_pct == 40.1
    assert snapshot.can_doi_ok is False


async def test_snapshot_rejects_too_few_held_symbols_even_when_weights_are_safe():
    snapshot = await _snapshot(
        [
            PortfolioPositionInput(symbol="AAA", quantity=10, market_value_vnd=200.0),
            PortfolioPositionInput(symbol="BBB", quantity=10, market_value_vnd=200.0),
            PortfolioPositionInput(symbol="CCC", quantity=10, market_value_vnd=200.0),
        ],
        {"AAA": "Công nghệ", "BBB": "Tài chính", "CCC": "Công nghiệp"},
        cash_vnd=400.0,
    )

    assert snapshot.held_symbol_count == MIN_HELD_SYMBOLS - 1
    assert snapshot.max_symbol_weight_pct == 20.0
    assert snapshot.max_sector_weight_pct == 20.0
    assert snapshot.can_doi_ok is False


async def test_snapshot_rejects_too_few_known_sectors_even_when_symbol_count_is_safe():
    snapshot = await _snapshot(
        _balanced_positions(),
        {"AAA": "Công nghệ", "BBB": "Công nghệ", "CCC": "Tài chính", "DDD": "Tài chính"},
    )

    assert snapshot.held_symbol_count == MIN_HELD_SYMBOLS
    assert snapshot.known_sector_count == MIN_KNOWN_SECTORS - 1
    assert snapshot.can_doi_ok is False


async def test_snapshot_reports_unknown_sector_as_unsafe_instead_of_a_zero_weight():
    snapshot = await _snapshot(
        _balanced_positions(),
        {"AAA": "Công nghệ", "BBB": "Công nghệ", "CCC": "Tài chính", "DDD": None},
    )
    assert snapshot.data_complete is False

    assert snapshot.unknown_sector_symbols == ("DDD",)
    assert snapshot.sectors[-1].sector == "Tài chính"
    assert snapshot.can_doi_ok is False


async def test_snapshot_reports_unpriced_positive_position_as_unsafe():
    positions = _balanced_positions()
    positions[3] = PortfolioPositionInput(symbol="DDD", quantity=10, market_value_vnd=None)

    snapshot = await _snapshot(
        positions,
        {"AAA": "Công nghệ", "BBB": "Công nghệ", "CCC": "Tài chính", "DDD": "Công nghiệp"},
    )

    assert snapshot.held_symbol_count == MIN_HELD_SYMBOLS
    assert snapshot.known_sector_count == MIN_KNOWN_SECTORS
    assert snapshot.data_complete is False
    assert snapshot.unpriced_symbols == ("DDD",)
    assert snapshot.can_doi_ok is False


async def test_snapshot_makes_empty_and_zero_nav_portfolios_explicitly_unsafe():
    empty = await _snapshot([], {}, nav_vnd=1_000.0, cash_vnd=1_000.0)
    zero_nav = await _snapshot(
        _balanced_positions(),
        {"AAA": "Công nghệ", "BBB": "Công nghệ", "CCC": "Tài chính", "DDD": "Công nghiệp"},
        nav_vnd=0.0,
        cash_vnd=0.0,
    )

    assert empty.cash_weight_pct == 100.0
    assert empty.max_symbol_weight_pct is None
    assert empty.max_sector_weight_pct is None
    assert empty.can_doi_ok is False
    assert zero_nav.cash_weight_pct is None
    assert zero_nav.max_symbol_weight_pct is None
    assert zero_nav.data_complete is False
    assert zero_nav.max_sector_weight_pct is None
    assert zero_nav.held_symbol_count == MIN_HELD_SYMBOLS
    assert zero_nav.can_doi_ok is False

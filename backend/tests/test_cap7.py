"""Cấp 7 live portfolio-balance contract tests."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import ConflictError
from app.models.cap6 import Cap6Progress
from app.models.cap7 import Cap7Progress
from app.models.virtual_trading import VirtualPosition, VirtualTradingAccount
from app.services.cap7.service import Cap7Service
from app.services.portfolio_balance import (
    PortfolioBalanceSnapshot,
    SectorAllocation,
    SymbolAllocation,
)


def valid_snapshot(
    *,
    can_doi_ok: bool,
    symbol_weight: float = 30.0,
    sector_weight: float = 40.0,
    unpriced: tuple[str, ...] = (),
    unknown: tuple[str, ...] = (),
) -> PortfolioBalanceSnapshot:
    return PortfolioBalanceSnapshot(
        nav_vnd=1_000_000,
        cash_vnd=100_000,
        cash_weight_pct=10.0,
        positions=(
            SymbolAllocation(
                symbol="AAA",
                market_value_vnd=300_000,
                weight_pct=symbol_weight,
                sector="Ngân hàng",
            ),
        ),
        sectors=(
            SectorAllocation(
                sector="Ngân hàng",
                market_value_vnd=400_000,
                weight_pct=sector_weight,
            ),
        ),
        held_symbol_count=4,
        known_sector_count=3,
        max_symbol="AAA",
        max_symbol_weight_pct=symbol_weight,
        max_sector="Ngân hàng",
        max_sector_weight_pct=sector_weight,
        unpriced_symbols=unpriced,
        unknown_sector_symbols=unknown,
        data_complete=not unpriced and not unknown,
        can_doi_ok=can_doi_ok,
    )


async def add_account(db_session, user) -> VirtualTradingAccount:
    account = VirtualTradingAccount(
        user_id=user.id,
        initial_cash_vnd=1_000_000,
        cash_available_vnd=1_000_000,
        activated_at=datetime.now(UTC),
    )
    db_session.add(account)
    await db_session.flush()
    return account

@pytest.mark.asyncio
async def test_enter_requires_cap6_graduation(db_session, test_user) -> None:
    db_session.add(Cap6Progress(user_id=test_user.id, entered_at=datetime.now(UTC)))
    await db_session.flush()
    with pytest.raises(ConflictError, match="Chưa tốt nghiệp Cấp 6"):
        await Cap7Service(db_session).enter(test_user.id)


@pytest.mark.asyncio
async def test_progress_persists_recomputed_live_gate(db_session, test_user, monkeypatch) -> None:
    progress = Cap7Progress(user_id=test_user.id, entered_at=datetime.now(UTC), can_doi_ok=False)
    db_session.add(progress)
    await db_session.flush()
    service = Cap7Service(db_session)

    async def current_balance(_user_id):
        return valid_snapshot(can_doi_ok=True)

    monkeypatch.setattr(service, "_snapshot", current_balance)
    payload = await service.get_progress(test_user.id)
    assert payload["can_doi_ok"] is True
    assert progress.can_doi_ok is True
    assert payload["ty_trong_ma_cao_nhat_pct"] == 30.0
    assert payload["ty_trong_nganh_cao_nhat_pct"] == 40.0


@pytest.mark.asyncio
@pytest.mark.parametrize("unsafe", [
    valid_snapshot(can_doi_ok=False, symbol_weight=30.01),
    valid_snapshot(can_doi_ok=False, sector_weight=40.01),
    valid_snapshot(can_doi_ok=False, unpriced=("AAA",)),
    valid_snapshot(can_doi_ok=False, unknown=("AAA",)),
])
async def test_graduation_rejects_each_live_unsafe_leg(db_session, test_user, monkeypatch, unsafe) -> None:
    progress = Cap7Progress(user_id=test_user.id, entered_at=datetime.now(UTC), can_doi_ok=True)
    db_session.add(progress)
    await db_session.flush()
    service = Cap7Service(db_session)
    await add_account(db_session, test_user)

    async def current_balance(_user_id):
        return unsafe

    monkeypatch.setattr(service, "_snapshot", current_balance)
    with pytest.raises(ConflictError, match="Danh mục chưa cân đối"):
        await service.graduate(test_user.id)
    assert progress.graduated_at is None
    assert progress.can_doi_ok is False


@pytest.mark.asyncio
async def test_graduation_recomputes_instead_of_trusting_stored_credit(db_session, test_user, monkeypatch) -> None:
    progress = Cap7Progress(user_id=test_user.id, entered_at=datetime.now(UTC), can_doi_ok=False)
    db_session.add(progress)
    await db_session.flush()
    service = Cap7Service(db_session)

    async def current_balance(_user_id):
        return valid_snapshot(can_doi_ok=True)

    monkeypatch.setattr(service, "_snapshot", current_balance)
    await add_account(db_session, test_user)
    result = await service.graduate(test_user.id)
    assert result["can_doi_ok"] is True
    assert progress.graduated_at is not None


@pytest.mark.asyncio
async def test_graduation_locks_account_and_position_set_before_live_snapshot(
    db_session, test_user, monkeypatch
) -> None:
    progress = Cap7Progress(user_id=test_user.id, entered_at=datetime.now(UTC), can_doi_ok=False)
    db_session.add(progress)
    account = await add_account(db_session, test_user)
    db_session.add(VirtualPosition(
        account_id=account.id,
        symbol="AAA",
        quantity_total=100,
        quantity_sellable=100,
        quantity_pending=0,
        quantity_reserved=0,
        avg_cost_vnd=100,
    ))
    await db_session.flush()
    service = Cap7Service(db_session)
    locked_positions = False
    original_lock = service._repo.list_positions_for_update

    async def lock_positions(account_id):
        nonlocal locked_positions
        rows = await original_lock(account_id)
        locked_positions = True
        return rows

    async def snapshot_after_mutations_are_blocked(_user_id):
        assert locked_positions
        return valid_snapshot(can_doi_ok=True)

    monkeypatch.setattr(service._repo, "list_positions_for_update", lock_positions)
    monkeypatch.setattr(service, "_snapshot", snapshot_after_mutations_are_blocked)

    await service.graduate(test_user.id)
    assert progress.graduated_at is not None

def test_only_live_balance_routes_are_advertised() -> None:
    from app.api.v1.endpoints.cap7 import router

    paths = {route.path for route in router.routes}
    assert paths == {"/cap7/progress", "/cap7/enter", "/cap7/portfolio", "/cap7/graduate"}


@pytest.mark.asyncio
async def test_exact_weight_boundaries_pass_but_any_excess_fails() -> None:
    from app.services.portfolio_balance import PortfolioPositionInput, build_portfolio_balance_snapshot

    exact = [
        PortfolioPositionInput("AAA", 1, 300_000),
        PortfolioPositionInput("AAB", 1, 100_000),
        PortfolioPositionInput("BBB", 1, 100_000),
        PortfolioPositionInput("CCC", 1, 100_000),
    ]
    sectors = {"AAA": "A", "AAB": "A", "BBB": "B", "CCC": "C"}
    snapshot = await build_portfolio_balance_snapshot(
        nav_vnd=1_000_000, cash_vnd=400_000, positions=exact, sector_lookup=sectors
    )
    assert snapshot.can_doi_ok is True

    too_large_symbol = await build_portfolio_balance_snapshot(
        nav_vnd=1_000_000,
        cash_vnd=400_000,
        positions=[PortfolioPositionInput("AAA", 1, 300_001), *exact[1:]],
        sector_lookup=sectors,
    )
    assert too_large_symbol.can_doi_ok is False

    too_large_sector = await build_portfolio_balance_snapshot(
        nav_vnd=1_000_000,
        cash_vnd=400_000,
        positions=[PortfolioPositionInput("AAA", 1, 300_000), PortfolioPositionInput("AAB", 1, 100_001), *exact[2:]],
        sector_lookup=sectors,
    )
    assert too_large_sector.can_doi_ok is False

    unknown_data = await build_portfolio_balance_snapshot(
        nav_vnd=1_000_000,
        cash_vnd=400_000,
        positions=[PortfolioPositionInput("AAA", 1, None), *exact[1:]],
        sector_lookup={"AAA": None, "AAB": "A", "BBB": "B", "CCC": "C"},
    )
    assert unknown_data.data_complete is False
    assert unknown_data.can_doi_ok is False

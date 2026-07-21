"""Tests for the Cấp 0 onboarding backend — progress, placement, tasks, graduate.

The brief's illustrative tests use a ``user`` fixture; this repo names it
``test_user`` (see tests/conftest.py), so they are bound to that name here.
"""

from __future__ import annotations

import pytest

from app.core.exceptions import ConflictError
from app.services.cap0.service import Cap0Service


@pytest.mark.asyncio
async def test_enter_creates_progress_and_seeds_250tr(db_session, test_user):
    svc = Cap0Service(db_session)
    p = await svc.enter(test_user.id)
    assert p.virtual_balance_init == 250_000_000

    # A 250tr virtual account is seeded for a user with no prior account.
    from app.repositories.virtual_trading import VirtualTradingRepository

    account = await VirtualTradingRepository(db_session).get_account_by_user_id(test_user.id)
    assert account is not None
    assert account.initial_cash_vnd == 250_000_000

    # idempotent
    p2 = await svc.enter(test_user.id)
    assert p2.id == p.id


@pytest.mark.asyncio
async def test_placement_maps_level(db_session, test_user):
    svc = Cap0Service(db_session)
    assert (await svc.set_placement(test_user.id, has_traded=False)).placed_level == 0
    # re-answer overwrites or idempotent — assert no crash
    assert (await svc.set_placement(test_user.id, has_traded=True)).placed_level == 2


@pytest.mark.asyncio
async def test_graduate_requires_all_tasks_and_gates(db_session, test_user):
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    with pytest.raises(ConflictError):  # 409 — chưa đủ
        await svc.graduate(test_user.id)
    for n in (1, 2, 3, 4, 5, 6):
        await svc.complete_task(test_user.id, n, gate=None)
    await svc.complete_task(test_user.id, 5, gate="sl_typed")
    await svc.complete_task(test_user.id, 6, gate="debrief")
    await svc.complete_task(test_user.id, 1, gate="star")
    g = await svc.graduate(test_user.id)
    assert g.graduated_at is not None
    assert g.time_to_graduate_hours is not None


@pytest.mark.asyncio
async def test_task_completion_is_idempotent_and_sets_gates(db_session, test_user):
    svc = Cap0Service(db_session)
    await svc.enter(test_user.id)
    p1 = await svc.complete_task(test_user.id, 1, gate="star")
    first_ts = p1.task_1_done_at
    assert first_ts is not None
    assert p1.task1_star_clicked is True
    # re-completing keeps the original timestamp (idempotent)
    p2 = await svc.complete_task(test_user.id, 1, gate=None)
    assert p2.task_1_done_at == first_ts


@pytest.mark.asyncio
async def test_cap0_endpoints_wired_and_free(client, test_user):
    """Router is mounted under /api/v1/cap0 and gated by CurrentUser (not premium)."""
    from app.core.security import create_access_token

    token = create_access_token(
        subject=test_user.id, extra_claims={"role": test_user.role.value}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # No progress yet
    r = await client.get("/api/v1/cap0/progress", headers=headers)
    assert r.status_code == 200
    assert r.json() is None

    # Enter creates progress
    r = await client.post("/api/v1/cap0/enter", headers=headers)
    assert r.status_code == 200
    assert r.json()["virtual_balance_init"] == 250_000_000

    # Placement
    r = await client.post(
        "/api/v1/cap0/placement", headers=headers, json={"has_traded_before": True}
    )
    assert r.status_code == 200
    assert r.json()["placed_level"] == 2

    # Unauthenticated is rejected
    r = await client.get("/api/v1/cap0/progress")
    assert r.status_code == 401

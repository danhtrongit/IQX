"""Graduation is durable independently of Bot funding and mascot assignment."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.security import create_access_token
from app.models.bot_run import BotAccount, BotCashLedger, BotInstance
from app.models.cap6 import Cap6Progress
from app.models.journey_identity import BotMascotProfile


@pytest.mark.parametrize("failed_branch", [None, "bot", "mascot"])
async def test_graduation_retry_recovers_independent_branches_without_refunding(
    production_client, db_session, fresh_session, test_user, monkeypatch, failed_branch
):
    from app.api.v1.endpoints import cap6

    user_id = test_user.id
    graduated_at = datetime.now(UTC) - timedelta(days=1)
    db_session.add(
        Cap6Progress(user_id=user_id, entered_at=graduated_at - timedelta(days=10), graduated_at=graduated_at)
    )
    await db_session.commit()
    auth = {"Authorization": f"Bearer {create_access_token(subject=user_id)}"}

    async def unavailable(*args, **kwargs):
        raise RuntimeError("test-only downstream failure")

    with monkeypatch.context() as scoped:
        if failed_branch == "bot":
            scoped.setattr(cap6, "initialize_bot", unavailable)
        if failed_branch == "mascot":
            scoped.setattr(cap6.JourneyIdentityService, "initialize", unavailable)
        response = await production_client.post("/api/v1/cap6/graduate", headers=auth)
        assert response.status_code == 200, response.text

    saved = await fresh_session.scalar(select(Cap6Progress).where(Cap6Progress.user_id == user_id))
    assert saved.graduated_at.replace(tzinfo=UTC) == graduated_at
    assert await fresh_session.scalar(select(func.count()).select_from(BotInstance)) == (failed_branch != "bot")
    assert await fresh_session.scalar(select(func.count()).select_from(BotMascotProfile)) == (failed_branch != "mascot")

    # Recovery is a backend lifecycle retry, never a GET or a presentation event.
    for _ in range(2):
        response = await production_client.post("/api/v1/cap6/graduate", headers=auth)
        assert response.status_code == 200, response.text
    await fresh_session.rollback()
    assert await fresh_session.scalar(select(func.count()).select_from(BotInstance)) == 1
    assert await fresh_session.scalar(select(func.count()).select_from(BotAccount)) == 1
    assert await fresh_session.scalar(select(func.count()).select_from(BotCashLedger)) == 1
    account = await fresh_session.scalar(select(BotAccount))
    assert account.cash_vnd == 100_000_000

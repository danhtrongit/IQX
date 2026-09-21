"""The current journey ends at Cấp 6 without migrating historical progress."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.cap6 import Cap6Progress
from app.models.cap7 import Cap7Progress
from app.models.cap8 import Cap8Progress


@pytest.mark.asyncio
@pytest.mark.parametrize("level", [7, 8])
async def test_api_rejects_new_entry_even_after_previous_level_graduated(
    client, db_session, test_user, level
):
    now = datetime.now(UTC)
    cap6 = Cap6Progress(user_id=test_user.id, entered_at=now, graduated_at=now)
    db_session.add(cap6)
    if level == 8:
        db_session.add(Cap7Progress(user_id=test_user.id, entered_at=now, graduated_at=now))
    await db_session.flush()
    token = create_access_token(subject=test_user.id, extra_claims={"role": test_user.role.value})

    response = await client.post(
        f"/api/v1/cap{level}/enter", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 409
    assert "kết thúc tại Cấp 6" in response.json()["detail"]
    model = Cap7Progress if level == 7 else Cap8Progress
    assert (await db_session.execute(select(model))).scalar_one_or_none() is None
    await db_session.refresh(cap6)
    assert cap6.graduated_at is not None


@pytest.mark.asyncio
async def test_historical_cap7_entry_preserves_graduation(db_session, test_user, monkeypatch):
    from app.services.cap7.service import Cap7Service

    now = datetime.now(UTC)
    progress = Cap7Progress(user_id=test_user.id, entered_at=now, graduated_at=now)
    db_session.add(progress)
    await db_session.flush()
    service = Cap7Service(db_session)

    async def unchanged(existing):
        assert existing is progress
        return {"id": existing.id, "graduated_at": existing.graduated_at}, None

    monkeypatch.setattr(service, "_recompute", unchanged)
    result = await service.enter(test_user.id)
    assert result["graduated_at"] == now
    assert result["id"] == progress.id

import uuid

import pytest
from sqlalchemy import func, select

from app.core.security import create_access_token
from app.models.cap6 import Cap6Progress
from app.models.journey_event import JourneyEvent
from app.models.virtual_trading import VirtualCashLedger
from app.services.journey_events import record_journey_event


def headers(user):
    return {"Authorization": f"Bearer {create_access_token(subject=user.id)}"}


async def test_client_events_are_authenticated_idempotent_and_never_graduate(client, db_session, test_user):
    payload = {"event_id": str(uuid.uuid4()), "name": "cap6_graduate", "fields": {"level": 6}}
    assert (await client.post("/api/v1/journey/events", json=payload)).status_code == 401
    for _ in range(2):
        response = await client.post("/api/v1/journey/events", json=payload, headers=headers(test_user))
        assert response.status_code == 202
    rows = (await db_session.execute(select(JourneyEvent))).scalars().all()
    assert len(rows) == 1
    assert rows[0].source == "client" and rows[0].user_id == test_user.id
    assert rows[0].occurred_at is not None
    assert (await db_session.scalar(select(func.count()).select_from(Cap6Progress))) == 0
    assert (await db_session.scalar(select(func.count()).select_from(VirtualCashLedger))) == 0


@pytest.mark.parametrize(
    "change",
    [
        {"user_id": str(uuid.uuid4())},
        {"name": "payment_paid"},
        {"fields": {"email": "private@example.com"}},
        {"fields": {"notes": "freeform"}},
        {"fields": {"state": "x" * 161}},
        {"fields": {"nested": {"unsafe": True}}},
    ],
)
async def test_telemetry_rejects_identity_payload_and_unbounded_fields(client, test_user, change):
    payload = {"event_id": str(uuid.uuid4()), "name": "mascot_view", **change}
    assert (await client.post("/api/v1/journey/events", json=payload, headers=headers(test_user))).status_code == 422


async def test_event_ids_cannot_be_reused_by_another_user(client, test_user, admin_user):
    payload = {"event_id": str(uuid.uuid4()), "name": "mascot_view"}
    assert (await client.post("/api/v1/journey/events", json=payload, headers=headers(test_user))).status_code == 202
    assert (await client.post("/api/v1/journey/events", json=payload, headers=headers(admin_user))).status_code == 409


async def test_server_events_share_transaction_and_stable_deduplication(db_session, test_user):
    first = await record_journey_event(db_session, test_user.id, "cap0_task_complete", {"task_id": 1}, dedup_key="1")
    again = await record_journey_event(db_session, test_user.id, "cap0_task_complete", {"task_id": 1}, dedup_key="1")
    assert first.id == again.id and first.source == "server"
    assert (await db_session.scalar(select(func.count()).select_from(JourneyEvent))) == 1


async def test_client_cannot_reserve_authoritative_event_id(client, db_session, test_user):
    event_id = uuid.uuid5(uuid.NAMESPACE_URL, f"iqx:{test_user.id}:cap6_graduate:known-progress-id")
    response = await client.post(
        "/api/v1/journey/events",
        headers=headers(test_user),
        json={
            "event_id": str(event_id),
            "name": "cap6_graduate",
            "fields": {"level": 6},
        },
    )
    assert response.status_code == 422
    event = await record_journey_event(
        db_session, test_user.id, "cap6_graduate", {"level": 6}, dedup_key="known-progress-id"
    )
    assert event.id == event_id and event.source == "server"


async def test_client_retry_cannot_change_event_fields(client, test_user):
    payload = {"event_id": str(uuid.uuid4()), "name": "tour_bantin_step_view", "fields": {"step_id": 1}}
    assert (await client.post("/api/v1/journey/events", json=payload, headers=headers(test_user))).status_code == 202
    payload["fields"] = {"step_id": 2}
    assert (await client.post("/api/v1/journey/events", json=payload, headers=headers(test_user))).status_code == 409

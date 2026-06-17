"""Endpoint tests for the alert system (user + admin)."""

from __future__ import annotations

from httpx import AsyncClient

from app.core.security import create_access_token
from app.services.alerts.seeder import seed_alert_signals


async def test_signals_and_rule_crud(client: AsyncClient, premium_user, db_session):
    _user, headers = premium_user
    await seed_alert_signals(db_session)

    r = await client.get("/api/v1/alerts/signals", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 10

    # subscribe to a preset (copy-on-subscribe)
    r = await client.post("/api/v1/alerts/rules", json={"signal_key": "pullback"}, headers=headers)
    assert r.status_code == 201, r.text
    rule = r.json()
    assert rule["base_signal_key"] == "pullback" and rule["side"] == "buy"
    rid = rule["id"]

    # custom rule
    r = await client.post(
        "/api/v1/alerts/rules",
        json={
            "name": "RSI thấp",
            "side": "buy",
            "combination": {"logic": "AND", "conditions": [{"indicator": "rsi_14", "op": "<", "value": 30}]},
        },
        headers=headers,
    )
    assert r.status_code == 201

    # invalid combination → 400
    r = await client.post(
        "/api/v1/alerts/rules",
        json={
            "name": "Bad",
            "side": "buy",
            "combination": {"logic": "AND", "conditions": [{"indicator": "nope", "op": "<", "value": 1}]},
        },
        headers=headers,
    )
    assert r.status_code == 400

    r = await client.get("/api/v1/alerts/rules", headers=headers)
    assert len(r.json()) == 2

    # disable
    r = await client.put(f"/api/v1/alerts/rules/{rid}", json={"is_enabled": False}, headers=headers)
    assert r.status_code == 200 and r.json()["is_enabled"] is False

    # delete
    r = await client.delete(f"/api/v1/alerts/rules/{rid}", headers=headers)
    assert r.status_code == 204


async def test_telegram_status_and_link_unconfigured(client: AsyncClient, premium_user):
    _user, headers = premium_user
    r = await client.get("/api/v1/alerts/telegram", headers=headers)
    assert r.status_code == 200 and r.json()["linked"] is False
    # bot username not configured in tests → 503
    r = await client.post("/api/v1/alerts/telegram/link", headers=headers)
    assert r.status_code == 503


async def test_alerts_require_premium(client: AsyncClient, test_user):
    token = create_access_token(subject=test_user.id, extra_claims={"role": test_user.role.value})
    r = await client.get("/api/v1/alerts/signals", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_admin_signal_update(client: AsyncClient, admin_user, db_session):
    await seed_alert_signals(db_session)
    token = create_access_token(subject=admin_user.id, extra_claims={"role": "admin"})
    h = {"Authorization": f"Bearer {token}"}

    r = await client.get("/api/v1/admin/alerts/signals", headers=h)
    assert r.status_code == 200 and len(r.json()) == 10

    body = {
        "side": "buy",
        "ta_name": "Pullback X",
        "message_title": "Mua điều chỉnh X",
        "combination": {"logic": "AND", "conditions": [{"indicator": "rsi_14", "op": "<", "value": 40}]},
        "is_enabled": True,
        "sort_order": 0,
    }
    r = await client.put("/api/v1/admin/alerts/signals/pullback", json=body, headers=h)
    assert r.status_code == 200 and r.json()["ta_name"] == "Pullback X"

    # non-admin rejected
    r = await client.get("/api/v1/admin/alerts/signals")
    assert r.status_code in (401, 403)

"""Endpoint tests for saved-strategy CRUD (Premium-gated)."""

from __future__ import annotations

from httpx import AsyncClient

_CONFIG = {
    "buy": {"logic": "AND", "factors": [{"id": "rsi_14_oversold", "value": 30}]},
    "sell": {"logic": "OR", "factors": [{"id": "rsi_14_overbought", "value": 70}]},
    "risk": {"stop_loss": "atr", "stop_atr_mult": 2.0, "max_holding": 60},
}


async def test_strategies_crud(client: AsyncClient, premium_user):
    _user, headers = premium_user

    # create
    r = await client.post(
        "/api/v1/backtest/strategies",
        json={"name": "Chiến lược A", "symbol": "fpt", "config": _CONFIG},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["name"] == "Chiến lược A"
    assert created["symbol"] == "FPT"
    sid = created["id"]

    # duplicate name -> 409
    r = await client.post(
        "/api/v1/backtest/strategies",
        json={"name": "Chiến lược A", "config": _CONFIG},
        headers=headers,
    )
    assert r.status_code == 409

    # list
    r = await client.get("/api/v1/backtest/strategies", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1

    # update
    r = await client.put(
        f"/api/v1/backtest/strategies/{sid}",
        json={"name": "Chiến lược B"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Chiến lược B"

    # delete
    r = await client.delete(f"/api/v1/backtest/strategies/{sid}", headers=headers)
    assert r.status_code == 204

    r = await client.get("/api/v1/backtest/strategies", headers=headers)
    assert r.json() == []


async def test_strategies_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/backtest/strategies")
    assert r.status_code in (401, 403)


async def test_catalog_requires_premium(client: AsyncClient, test_user):
    # a non-premium user is rejected
    from app.core.security import create_access_token

    token = create_access_token(subject=test_user.id, extra_claims={"role": test_user.role.value})
    r = await client.get("/api/v1/backtest/catalog", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_catalog_ok_for_premium(client: AsyncClient, premium_user):
    _user, headers = premium_user
    r = await client.get("/api/v1/backtest/catalog", headers=headers)
    assert r.status_code == 200
    assert r.json()["factors"]["count"] > 30

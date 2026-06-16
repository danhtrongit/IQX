"""Tests for per-user TradingView chart-drawing persistence endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.models.user import User
from tests.conftest import get_auth_headers


async def _auth_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    return get_auth_headers(resp.json()["access_token"])


_STATE = {"sources": {"abc": {"type": "trendline", "points": [1, 2]}}}


@pytest.mark.asyncio
async def test_chart_drawings_require_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/chart-drawings/FPT")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chart_drawings_empty_when_none(client: AsyncClient, test_user: User) -> None:
    headers = await _auth_headers(client)
    resp = await client.get("/api/v1/chart-drawings/FPT", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["symbol"] == "FPT"
    assert body["state"] is None


@pytest.mark.asyncio
async def test_chart_drawings_put_then_get_roundtrip(
    client: AsyncClient, test_user: User
) -> None:
    headers = await _auth_headers(client)
    put = await client.put(
        "/api/v1/chart-drawings/fpt", headers=headers, json={"state": _STATE}
    )
    assert put.status_code == 200
    assert put.json()["symbol"] == "FPT"  # normalized upper-case

    got = await client.get("/api/v1/chart-drawings/FPT", headers=headers)
    assert got.status_code == 200
    assert got.json()["state"] == _STATE


@pytest.mark.asyncio
async def test_chart_drawings_upsert_overwrites(
    client: AsyncClient, test_user: User
) -> None:
    headers = await _auth_headers(client)
    await client.put("/api/v1/chart-drawings/FPT", headers=headers, json={"state": _STATE})
    new_state = {"sources": {}}
    await client.put(
        "/api/v1/chart-drawings/FPT", headers=headers, json={"state": new_state}
    )
    got = await client.get("/api/v1/chart-drawings/FPT", headers=headers)
    assert got.json()["state"] == new_state


@pytest.mark.asyncio
async def test_chart_drawings_delete(client: AsyncClient, test_user: User) -> None:
    headers = await _auth_headers(client)
    await client.put("/api/v1/chart-drawings/FPT", headers=headers, json={"state": _STATE})
    deleted = await client.delete("/api/v1/chart-drawings/FPT", headers=headers)
    assert deleted.status_code == 204
    got = await client.get("/api/v1/chart-drawings/FPT", headers=headers)
    assert got.json()["state"] is None

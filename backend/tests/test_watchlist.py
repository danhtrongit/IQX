"""Tests for watchlist validation and ordering."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.symbol import Symbol
from app.models.user import User
from tests.conftest import get_auth_headers


async def _auth_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "Test@1234"},
    )
    return get_auth_headers(resp.json()["access_token"])


@pytest.fixture
async def seeded_symbols(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            Symbol(symbol="VCB", name="Vietcombank", exchange="HOSE", asset_type="stock", is_index=False),
            Symbol(symbol="FPT", name="FPT", exchange="HOSE", asset_type="stock", is_index=False),
            Symbol(symbol="VNINDEX", name="VN-Index", exchange="HOSE", asset_type="index", is_index=True),
        ]
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_watchlist_rejects_index_symbols(
    client: AsyncClient,
    test_user: User,
    seeded_symbols: None,
) -> None:
    headers = await _auth_headers(client)

    resp = await client.post("/api/v1/watchlist", headers=headers, json={"symbol": "VNINDEX"})

    assert resp.status_code == 400
    assert "cổ phiếu" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_watchlist_rejects_unknown_symbols(
    client: AsyncClient,
    test_user: User,
    seeded_symbols: None,
) -> None:
    headers = await _auth_headers(client)

    resp = await client.post("/api/v1/watchlist", headers=headers, json={"symbol": "NOPE"})

    assert resp.status_code == 400
    assert "không tồn tại" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_watchlist_reorder_persists_symbol_order(
    client: AsyncClient,
    test_user: User,
    seeded_symbols: None,
) -> None:
    headers = await _auth_headers(client)
    await client.post("/api/v1/watchlist", headers=headers, json={"symbol": "VCB"})
    await client.post("/api/v1/watchlist", headers=headers, json={"symbol": "FPT"})

    resp = await client.put("/api/v1/watchlist/reorder", headers=headers, json={"symbols": ["FPT", "VCB"]})

    assert resp.status_code == 200
    assert [item["symbol"] for item in resp.json()["items"]] == ["FPT", "VCB"]

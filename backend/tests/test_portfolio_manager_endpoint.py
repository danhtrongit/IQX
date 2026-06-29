from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient



@pytest.mark.asyncio
async def test_analyze_requires_auth(client: AsyncClient):
    resp = await client.post("/api/v1/portfolio-manager/analyze")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analyze_returns_report(client: AsyncClient, premium_user):
    _, headers = premium_user
    fake = {"analysis": {"meta": {"mode": "first"}}, "narrative": {"title": "x"},
            "meta": {"valid": True, "cached": False}}
    with patch("app.api.v1.endpoints.portfolio_manager.generate_report",
               new=AsyncMock(return_value=fake)):
        resp = await client.post("/api/v1/portfolio-manager/analyze", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["narrative"]["title"] == "x"
    assert body["meta"]["valid"] is True


@pytest.mark.asyncio
async def test_non_premium_forbidden(client: AsyncClient, test_user):
    # log in as the non-premium test_user
    login = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "Test@1234"})
    token = login.json()["access_token"]
    resp = await client.post("/api/v1/portfolio-manager/analyze",
                             headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.ai.proxy_client import AIProxyError


async def test_ai_bctc_success(client, premium_user) -> None:
    _user, headers = premium_user
    result = {"type": "bctc", "input": {"symbol": "FPT"},
              "analysis": {"memo": "memo", "modules": {"dupont": "note"}},
              "model": "test-model", "as_of": "2026-06-03T00:00:00+00:00"}
    with patch("app.api.v1.endpoints.ai_analysis.analyze_bctc", new_callable=AsyncMock, return_value=result):
        resp = await client.get("/api/v1/ai/bctc/FPT", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["analysis"]["memo"] == "memo"


async def test_ai_bctc_requires_auth(client) -> None:
    resp = await client.get("/api/v1/ai/bctc/FPT")
    assert resp.status_code == 401


async def test_ai_bctc_proxy_error_502(client, premium_user) -> None:
    _user, headers = premium_user
    with patch("app.api.v1.endpoints.ai_analysis.analyze_bctc", new_callable=AsyncMock,
               side_effect=AIProxyError("timeout")):
        resp = await client.get("/api/v1/ai/bctc/FPT", headers=headers)
    assert resp.status_code == 502

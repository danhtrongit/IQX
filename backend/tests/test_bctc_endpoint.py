from __future__ import annotations

from unittest.mock import AsyncMock, patch


async def test_bctc_endpoint_returns_envelope(client) -> None:
    payload = {"template": "A", "sector": "nonbank", "periods": ["2025", "2024"],
               "snapshot": [], "modules": [], "forensic": {"green": [], "red": []}, "flags": []}
    with patch("app.api.v1.endpoints.market_data.get_bctc", new_callable=AsyncMock,
               return_value=(payload, "https://vci/...")):
        resp = await client.get("/api/v1/market-data/bctc/FPT")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["template"] == "A"
    assert body["meta"]["source"] == "VCI"


async def test_bctc_endpoint_invalid_symbol(client) -> None:
    resp = await client.get("/api/v1/market-data/bctc/!!")
    assert resp.status_code == 422

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.ai.payloads import build_bctc_ai_payload


async def test_build_bctc_ai_payload_reuses_engine() -> None:
    kpi = {"template": "A", "sector": "nonbank", "snapshot": [], "modules": [],
           "forensic": {"green": [], "red": []}, "trinity": {}, "flags": []}
    with patch("app.services.ai.payloads.get_bctc", new_callable=AsyncMock,
               return_value=(kpi, "https://vci/...")):
        payload = await build_bctc_ai_payload(symbol="fpt", term_type=1)
    assert payload["symbol"] == "FPT"
    assert payload["bctc"]["template"] == "A"
    assert "as_of" in payload

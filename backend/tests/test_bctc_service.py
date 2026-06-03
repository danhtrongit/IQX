from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.bctc.service import get_bctc


async def test_get_bctc_assembles_from_mocked_fetch() -> None:
    statements = {
        "balance_sheet": [{"year_report": 2025, "length_report": 5, "bsa53": 1000.0}],
        "income_statement": [
            {"year_report": 2025, "length_report": 5, "isa3": 200.0},
            {"year_report": 2024, "length_report": 5, "isa3": 160.0},
        ],
        "cash_flow": [],
    }
    with patch("app.services.bctc.service.vietcap.fetch_bctc_statements", new_callable=AsyncMock, return_value=(statements, "https://vci/...")), \
         patch("app.services.bctc.service.vietcap.fetch_financial_report", new_callable=AsyncMock, return_value=([], "u")):
        payload, url = await get_bctc("FPT")
    assert payload["template"] == "A"
    rg = next(s for s in payload["snapshot"] if s["key"] == "revenue_growth")
    assert abs(rg["value"] - 0.25) < 1e-9

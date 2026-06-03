from __future__ import annotations

from typing import Any

from app.services.bctc.assemble import build_bctc_payload
from app.services.market_data.sources import vietcap


async def get_bctc(symbol: str, *, term_type: int = 1) -> tuple[dict[str, Any], str]:
    """Lấy 3 BCTC từ VCI, tính KPI, trả (payload, raw_url)."""
    statements, url = await vietcap.fetch_bctc_statements(symbol, term_type=term_type)
    payload = build_bctc_payload(
        statements.get("balance_sheet", []),
        statements.get("income_statement", []),
        statements.get("cash_flow", []),
    )
    return payload, url

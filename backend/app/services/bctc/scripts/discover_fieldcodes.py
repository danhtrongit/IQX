"""Dump FieldCode -> titleVi cho một rổ mã, gom theo section, để ánh xạ concept thủ công.

Guide BCTC viết công thức theo mã TT200/TT22; VCI dùng FieldCode riêng (isa*/bsa*/cfa*
cho phi-ngân hàng, isb*/bsb*/cfb* cho ngân hàng). Script này lấy metric metadata thật
từ VCI để con người đối chiếu titleVi -> concept và điền vào mapping/*.yaml.

Chạy LIVE (gọi VCI thật):
    cd backend && uv run --frozen python -m app.services.bctc.scripts.discover_fieldcodes FPT VCB HPG VNM MWG
"""
from __future__ import annotations

import asyncio
import sys
from typing import Any

from app.services.market_data.sources import vietcap

_SECTIONS = ("INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW")


async def _metrics(symbol: str) -> dict[str, list[dict[str, Any]]]:
    return await vietcap._fetch_financial_metrics(symbol.upper())  # noqa: SLF001


async def main(symbols: list[str]) -> None:
    for sym in symbols:
        try:
            metrics = await _metrics(sym)
        except Exception as exc:  # noqa: BLE001
            print(f"# {sym}: LỖI {type(exc).__name__}: {exc}", file=sys.stderr)
            continue
        print(f"\n################## {sym} ##################")
        for section in _SECTIONS:
            rows = metrics.get(section) or []
            print(f"\n===== {sym} {section} ({len(rows)} dòng) =====")
            for row in rows:
                field = str(row.get("field") or "").lower()
                title = row.get("titleVi") or row.get("fullTitleVi") or ""
                if field:
                    print(f"{field}\tL{row.get('level')}\t{title}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or ["FPT", "VCB", "HPG", "VNM", "MWG"]))

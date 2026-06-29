# tests/test_portfolio_manager_e2e.py
import datetime as dt
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.models.virtual_trading import VirtualPosition, VirtualTradingAccount
from app.services.ai.portfolio_manager import inputs as I
from app.services.ai.portfolio_manager import generator as G
from app.services.virtual_trading import service as vt_service
from app.services.virtual_trading.price_resolver import PriceResult


_PRICES = {"HPG": 26750, "TCB": 34000, "MBB": 24000}


def _bars():
    return [{"time": str(1_700_000_000 + i * 86400), "open": 26.0, "high": 26.5,
             "low": 25.5, "close": 26.0 + i * 0.01, "volume": 2_000_000.0, "value": 52_000.0}
            for i in range(130)]


class _Trade:
    def __init__(self, symbol, side, quantity, price_vnd, traded_at):
        self.symbol, self.side, self.quantity = symbol, side, quantity
        self.price_vnd, self.traded_at = price_vnd, traded_at


_GOOD_NARRATIVE = {
    "title": "Danh mục khỏe lên", "verdict": "Khỏe lên.", "lede": "Mở đầu.", "progress_text": "",
    "layers": {k: "Một đoạn phân tích." for k in
               ("overview", "performance", "allocation", "stress", "risk", "attribution", "quality", "behavior")},
    "insight": {"label": "x", "text": "TCB và MBB cùng nhịp."}, "low_data_note": "Một số mã chưa đủ dữ liệu thanh khoản.",
    "actions": [{"title": "Nâng tiền mặt", "detail": "Đưa tiền mặt lên 15,0%."}],
    "watch": "Ba mốc.", "closing": "Đi đúng hướng.",
}


@pytest.mark.asyncio
async def test_full_pipeline_then_cache_hit(db_session, premium_user):
    user, _ = premium_user
    acct = VirtualTradingAccount(
        user_id=user.id, status="active", initial_cash_vnd=482_000_000,
        cash_available_vnd=49_000_000, cash_reserved_vnd=0, cash_pending_vnd=0,
        activated_at=dt.datetime(2025, 11, 1, tzinfo=dt.UTC),
    )
    db_session.add(acct)
    await db_session.flush()
    for sym, qty, cost in [("HPG", 4000, 19500), ("TCB", 1000, 30000), ("MBB", 1000, 22000)]:
        db_session.add(VirtualPosition(account_id=acct.id, symbol=sym, quantity_total=qty,
                                       quantity_sellable=qty, quantity_pending=0, quantity_reserved=0,
                                       avg_cost_vnd=cost))
    await db_session.flush()

    def _price(symbol, **_):
        return PriceResult(price_vnd=_PRICES.get(symbol, 1000), source="close",
                           timestamp=dt.datetime(2026, 6, 23, tzinfo=dt.UTC))

    trades = [_Trade("HPG", "buy", 4000, 19500, dt.datetime(2025, 11, 23, tzinfo=dt.UTC)),
              _Trade("TCB", "buy", 1000, 30000, dt.datetime(2025, 12, 1, tzinfo=dt.UTC)),
              _Trade("MBB", "buy", 1000, 22000, dt.datetime(2025, 12, 1, tzinfo=dt.UTC))]

    with patch.object(vt_service, "resolve_price", new=AsyncMock(side_effect=_price)), \
         patch.object(I, "fetch_ohlcv", new=AsyncMock(return_value=(_bars(), "u"))), \
         patch.object(I, "fetch_financial_report",
                      new=AsyncMock(return_value=([{"pe": 9.8, "pb": 1.4, "roe": 0.16, "dividend": 0.02}], "u"))), \
         patch.object(I, "_load_sector_info", new=AsyncMock(return_value=({"Ngân hàng": 0.38, "Thép": 0.05}, {}))), \
         patch.object(I, "_load_sectors_for",
                      new=AsyncMock(return_value={"HPG": "Thép", "TCB": "Ngân hàng", "MBB": "Ngân hàng"})), \
         patch.object(I, "_load_all_trades", new=AsyncMock(return_value=trades)), \
         patch.object(G, "chat_completion", new=AsyncMock(return_value=(json.dumps(_GOOD_NARRATIVE), "deepseek-test"))):
        out1 = await G.generate_report(db_session, user.id)
        out2 = await G.generate_report(db_session, user.id)

    assert out1["meta"]["valid"] is True
    assert "insufficient_data" not in out1["analysis"]
    assert set(out1["analysis"]) >= {"overview", "performance", "allocation", "concentration",
                                     "risk", "attribution", "quality", "behavior", "scores",
                                     "selected_insights", "progress", "meta"}
    assert out2["meta"]["cached"] is True   # day-cache hit on the second call

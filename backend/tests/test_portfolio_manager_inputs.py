# tests/test_portfolio_manager_inputs.py
import datetime as dt
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.portfolio_manager import inputs as I


@pytest.mark.asyncio
async def test_load_inputs_shapes_holdings_and_benchmark(db_session, premium_user):
    user, _ = premium_user
    portfolio = {
        "account": type("A", (), {"cash_available_vnd": 49_000_000, "cash_reserved_vnd": 0,
                                  "cash_pending_vnd": 0, "initial_cash_vnd": 482_000_000})(),
        "positions": [
            {"symbol": "HPG", "quantity_total": 4000, "avg_cost_vnd": 19500,
             "current_price_vnd": 26750, "market_value_vnd": 107_000_000,
             "unrealized_pnl_vnd": 29_000_000},
        ],
        "nav_vnd": 534_000_000, "total_market_value_vnd": 485_000_000, "return_pct": 10.7,
    }
    ohlcv_bars = [{"time": str(1_700_000_000 + i * 86400), "close": 26.0 + i * 0.01,
                   "volume": 1_000_000.0, "value": 26000.0} for i in range(130)]
    ratio_rows = [{"pe": 9.8, "pb": 1.4, "roe": 0.16, "dividend": 0.02}]

    with patch.object(I, "VirtualTradingService") as Svc, \
         patch.object(I, "fetch_ohlcv", new=AsyncMock(return_value=(ohlcv_bars, "u"))), \
         patch.object(I, "fetch_financial_report", new=AsyncMock(return_value=(ratio_rows, "u"))), \
         patch.object(I, "_load_sector_weights", new=AsyncMock(return_value={"Tài nguyên Cơ bản": 0.05})), \
         patch.object(I, "_load_sectors_for", new=AsyncMock(return_value={"HPG": "Tài nguyên Cơ bản"})):
        svc = Svc.return_value
        svc.get_portfolio = AsyncMock(return_value=portfolio)
        svc.list_trades = AsyncMock(return_value=([], 0))
        result = await I.load_inputs(db_session, user.id)

    assert result.nav == 534_000_000
    assert result.cash == 49_000_000
    assert len(result.holdings) == 1
    h = result.holdings[0]
    assert h.ticker == "HPG"
    assert h.sector == "Tài nguyên Cơ bản"
    assert h.pe == 9.8 and h.roe == 0.16
    assert len(h.closes) == 130
    assert len(result.benchmark_closes) == 130

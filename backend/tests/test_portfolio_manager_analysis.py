import datetime as dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.portfolio_manager import analysis as A
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _sample_inputs():
    bench = [1000.0 * (1.0007 ** i) for i in range(130)]
    def closes(drift):
        return [100.0 * ((1 + drift) ** i) for i in range(130)]
    h = [
        Holding("HPG", 4000, 19500, 21360, "Thép", 85_440_000, 38_000_000, 47_440_000,
                closes=closes(0.002), volumes=[2_000_000.0] * 130, pe=9.8, pb=1.4, roe=0.16, dividend=0.02),
        Holding("TCB", 1000, 30000, 34000, "Ngân hàng", 99_858_000, 9_000_000, 90_858_000,
                closes=closes(0.0015), volumes=[2_000_000.0] * 130, pe=8.0, pb=1.2, roe=0.20, dividend=0.015),
        Holding("MBB", 1000, 22000, 24000, "Ngân hàng", 83_838_000, 6_000_000, 77_838_000,
                closes=closes(0.0015), volumes=[2_000_000.0] * 130, pe=7.5, pb=1.1, roe=0.21, dividend=0.02),
    ]
    return PortfolioInputs(nav=534_000_000, cash=49_100_000, holdings=h, benchmark_closes=bench,
                           sector_weights={"Ngân hàng": 0.38, "Thép": 0.05}, inception_date=dt.date(2025, 11, 23),
                           trades=[_T("HPG", "buy", 4000, 19500, dt.datetime(2025, 11, 23))], as_of=dt.date(2026, 6, 23))


class _T:
    def __init__(self, symbol, side, quantity, price_vnd, traded_at):
        self.symbol, self.side, self.quantity, self.price_vnd, self.traded_at = symbol, side, quantity, price_vnd, traded_at


@pytest.mark.asyncio
async def test_build_analysis_full_shape(db_session, premium_user):
    user, _ = premium_user
    with patch.object(A, "load_inputs", new=AsyncMock(return_value=_sample_inputs())), \
         patch.object(A, "_resolve_account_id", new=AsyncMock(return_value=uuid.UUID("00000000-0000-0000-0000-000000000009"))):
        out = await A.build_analysis(db_session, user.id)
    assert "insufficient_data" not in out
    assert set(out) >= {"meta", "overview", "performance", "allocation", "concentration",
                        "risk", "attribution", "quality", "behavior", "scores", "selected_insights", "progress"}
    assert out["overview"]["n_positions"] == 3
    assert out["scores"]["overall"] >= 1.0
    assert out["meta"]["mode"] == "first"  # no previous snapshot


@pytest.mark.asyncio
async def test_build_analysis_insufficient(db_session, premium_user):
    user, _ = premium_user
    empty = PortfolioInputs(nav=1_000_000_000, cash=1_000_000_000, holdings=[], benchmark_closes=[],
                            sector_weights={}, inception_date=None, trades=[], as_of=dt.date(2026, 6, 23))
    with patch.object(A, "load_inputs", new=AsyncMock(return_value=empty)), \
         patch.object(A, "_resolve_account_id", new=AsyncMock(return_value=uuid.UUID("00000000-0000-0000-0000-000000000009"))):
        out = await A.build_analysis(db_session, user.id)
    assert out["insufficient_data"] is True

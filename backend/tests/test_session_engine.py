# backend/tests/test_session_engine.py
import datetime as dt
from unittest.mock import AsyncMock, patch
import pytest
from app.services.ai.market_analysis import generator as G
from sqlalchemy import select
from app.models.market_analysis import AnalysisHistory

FAKE_OUT = {"headline": "VN-Index tăng 0,5% — thanh khoản cải thiện",
            "tagline": {"text": "TÍCH CỰC", "color": "up"},
            "paragraphs": {"structure": "a", "smart_money": "b", "market_health": "c"},
            "scenarios": [], "watchlist": [], "unexplained": None}

@pytest.mark.asyncio
async def test_run_session_analysis_persists_report_type(db_session):
    cfg = G.SessionConfig(report_type="midday",
                          payload_builder=AsyncMock(return_value={"meta": {"generated_for_date": "2026-07-01"}, "charts": {}}),
                          prompt_builder=lambda p, s: "prompt", system_prompt="sys",
                          validator=lambda out, p: [], session_display={}, use_memory=False, persist_claims=False)
    with patch.object(G, "chat_completion", new=AsyncMock(return_value=(__import__("json").dumps(FAKE_OUT), "deepseek"))):
        res = await G.run_session_analysis(cfg, db=db_session)
    assert res["persisted"] is True
    row = (await db_session.execute(select(AnalysisHistory).where(AnalysisHistory.report_type == "midday"))).scalar_one()
    assert row.report_type == "midday"

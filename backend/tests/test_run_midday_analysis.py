# backend/tests/test_run_midday_analysis.py
import datetime as dt
import json
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy import select
from app.services.ai.market_analysis import generator as G
from app.models.market_analysis import AnalysisHistory

VALID = json.dumps({
  "headline": "VN-Index giảm 0,4% phiên sáng — thanh khoản dưới trung bình 20 phiên",
  "tagline": {"text": "THẬN TRỌNG · Thanh khoản thấp · Khối ngoại bán", "color": "neutral"},
  "paragraphs": {"session_structure": {"status":"published","content":"a"},
                 "money_flow": {"status":"published","content":"b"},
                 "market_health": {"status":"pending","pending_message":"16:30","pending_until":"2026-07-01T16:30:00+07:00"}},
  "unexplained": {"title":"Điểm cần xác nhận trong phiên chiều","content":"Nếu ..."},
  "scenarios": [{"type":"up","condition":"Nếu","outcome":"x","scope":"afternoon_session"},
                {"type":"down","condition":"Nếu","outcome":"y","scope":"afternoon_session"},
                {"type":"down","condition":"Khi","outcome":"z","scope":"afternoon_session"}],
  "watchlist": [{"key":"VN-Index","alert_level":"alert","reason":"—"},{"key":"Giao dịch chiều","alert_level":"alert","reason":"—"},
                {"key":"VHM","alert_level":"normal","reason":"—"},{"key":"NH","alert_level":"normal","reason":"—"},{"key":"TK","alert_level":"warn","reason":"—"}],
})

@pytest.mark.asyncio
async def test_run_midday_persists_midday_record(db_session):
    payload = {"meta": {"generated_for_date": "2026-07-01"}, "charts": {}}
    with patch.object(G, "build_midday_payload", new=AsyncMock(return_value=payload)), \
         patch.object(G, "chat_completion", new=AsyncMock(return_value=(VALID, "deepseek"))):
        res = await G.run_midday_analysis(session=db_session)
    assert res["persisted"] is True
    row = (await db_session.execute(select(AnalysisHistory).where(AnalysisHistory.report_type == "midday"))).scalar_one()
    assert row.report_type == "midday" and "Giao dịch chiều" in json.dumps(row.watchlist, ensure_ascii=False)


@pytest.mark.asyncio
async def test_build_memory_context_filters_daily_only(db_session):
    """build_memory_context must return only report_type='daily' rows as last_analysis
    and recent_5_sessions_overview — midday rows must be excluded."""
    today = dt.date(2026, 7, 2)
    yesterday = dt.date(2026, 7, 1)

    # Insert a daily row and a midday row both published on yesterday
    db_session.add(AnalysisHistory(
        public_id="vnindex-2026-07-01-daily",
        session_date=yesterday,
        session_type="low_volatility",
        report_type="daily",
        headline="Daily EOD headline",
        tagline={"text": "EOD"},
        paragraphs={},
        scenarios=[],
        is_published=True,
    ))
    db_session.add(AnalysisHistory(
        public_id="vnindex-2026-07-01-midday",
        session_date=yesterday,
        session_type="low_volatility",
        report_type="midday",
        headline="Midday headline — must not appear",
        tagline={"text": "AM"},
        paragraphs={},
        scenarios=[],
        is_published=True,
    ))
    await db_session.commit()

    from app.services.ai.market_analysis.memory import build_memory_context
    ctx = await build_memory_context(db_session, today)

    # last_analysis must reference the daily headline, NOT the midday one
    assert ctx["last_analysis"] is not None
    assert ctx["last_analysis"]["headline"] == "Daily EOD headline"

    # recent overview must contain only daily rows
    for entry in ctx["recent_5_sessions_overview"]:
        assert entry["headline"] != "Midday headline — must not appear"

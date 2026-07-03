# backend/tests/test_run_premarket_analysis.py
"""Runner test for run_premarket_analysis.

TDD: written BEFORE implementation.  This file mirrors test_run_midday_analysis.py
conventions, extended with premarket-specific assertions:
- persisted row has report_type='premarket'
- tagline is stored as {"text": <string>} (normalized from plain string contract)
- meta contains RESOLVED hot_news (has 'title' from the pool, not just id)
- meta contains RESOLVED events_filtered (has 'title' from pool)
- meta carries world_overview block
- watchlist stored from watch_today
- paragraphs stored from world_paragraph
"""

import datetime as dt
import json
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.services.ai.market_analysis import generator as G
from app.models.market_analysis import AnalysisHistory

# ── Mocked pool data ─────────────────────────────────────────────────────────

_NEWS_POOL = [
    {
        "id": "news-001",
        "title": "Thị trường Mỹ tăng nhẹ trước số liệu việc làm",
        "summary": "S&P 500 tăng 0,3% phiên thứ Tư.",
        "source": "bloomberg",
        "published_at": "2026-07-02T22:30:00+00:00",
        "tickers": [],
        "sectors": [],
        "sentiment": "positive",
        "url": "https://bloomberg.com/1",
    },
    {
        "id": "news-002",
        "title": "FDI vào Việt Nam tăng 15% nửa đầu năm",
        "summary": "Số liệu FDI tích cực.",
        "source": "vnexpress",
        "published_at": "2026-07-02T23:00:00+00:00",
        "tickers": [],
        "sectors": [],
        "sentiment": "positive",
        "url": "https://vnexpress.net/2",
    },
    {
        "id": "news-003",
        "title": "Ngân hàng Nhà nước giữ nguyên lãi suất điều hành",
        "summary": "NHNN không thay đổi lãi suất.",
        "source": "cafef",
        "published_at": "2026-07-03T01:00:00+00:00",
        "tickers": [],
        "sectors": [],
        "sentiment": "neutral",
        "url": "https://cafef.vn/3",
    },
    {
        "id": "news-004",
        "title": "Xuất khẩu thủy sản tăng 12% so cùng kỳ",
        "summary": "Số liệu xuất khẩu tốt.",
        "source": "cafef",
        "published_at": "2026-07-03T01:30:00+00:00",
        "tickers": [],
        "sectors": [],
        "sentiment": "positive",
        "url": "https://cafef.vn/4",
    },
    {
        "id": "news-005",
        "title": "Doanh nghiệp bất động sản nới room ngoại",
        "summary": "Một doanh nghiệp bảo hiểm nới room.",
        "source": "ndh",
        "published_at": "2026-07-03T02:00:00+00:00",
        "tickers": [],
        "sectors": [],
        "sentiment": "positive",
        "url": "https://ndh.vn/5",
    },
]

_EVENTS_POOL = [
    {
        "id": "evt-001",
        "type": "ex_dividend",
        "time": None,
        "time_label": "2026-07-03",
        "title": "VCB: Ngày giao dịch không hưởng quyền cổ tức",
        "tickers": ["VCB"],
    },
    {
        "id": "evt-002",
        "type": "agm",
        "time": None,
        "time_label": "2026-07-03",
        "title": "HPG: Đại hội cổ đông thường niên",
        "tickers": ["HPG"],
    },
    {
        "id": "evt-003",
        "type": "listing",
        "time": None,
        "time_label": "2026-07-03",
        "title": "FPT: Niêm yết thêm cổ phiếu",
        "tickers": ["FPT"],
    },
]

_GLOBAL_MARKETS = {
    "cells": [
        {"id": "^GSPC", "label": "S&P 500", "value": 5482.0, "change_pct": 0.31, "sentiment": "up", "stale": False},
        {"id": "^IXIC", "label": "NASDAQ", "value": 17800.0, "change_pct": 0.18, "sentiment": "up", "stale": False},
        {"id": "^N225", "label": "NIKKEI 225", "value": 38950.0, "change_pct": 0.55, "sentiment": "up", "stale": False},
        {"id": "BZ=F", "label": "Dầu Brent", "value": 84.2, "change_pct": -0.4, "sentiment": "down", "stale": False},
        {"id": "GC=F", "label": "Vàng", "value": 2338.0, "change_pct": 0.1, "sentiment": "up", "stale": False},
        {"id": "VND=X", "label": "USD/VND", "value": 25400.0, "change_pct": None, "sentiment": "flat", "stale": False},
    ],
    "context": {},
}

# ── Valid LLM output JSON (all ids ∈ mocked pool) ───────────────────────────

# world_paragraph must be 70–130 words (HTML-stripped)
_WORLD_PARA = (
    "S&P 500 đóng cửa tại <span class='num'>5.482</span> (<span class='up-text num'>+0,31%</span>); "
    "NASDAQ tăng <span class='up-text num'>+0,18%</span> trong phiên giao dịch thưa. "
    "Nikkei 225 tại <span class='num'>38.950</span> (<span class='up-text num'>+0,55%</span>) nhờ JPY yếu. "
    "Dầu Brent tại <span class='num'>84,2</span> USD/thùng giảm nhẹ <span class='down-text num'>−0,4%</span> sau tuần tăng. "
    "Vàng tại <span class='num'>2.338</span> USD/oz ổn định quanh đỉnh ngắn hạn. "
    "USD/VND tại mức trung tính theo dữ liệu tỷ giá VCB, không tạo áp lực đặc biệt lên khối ngoại trong phiên hôm nay. "
    "Tổng thể thị trường quốc tế tích cực nhẹ, không có cú sốc qua đêm, tạo nền tâm lý thuận cho phiên khai mạc buổi sáng."
)

_INSIGHT_1 = (
    "<strong>Tác động phiên sáng nay:</strong> "
    "Kết quả kinh doanh quý II vượt kỳ vọng có thể tạo lực mua chủ động nhóm ngân hàng trong phiên sáng, "
    "đặc biệt nếu thanh khoản mở cửa đạt trên một nghìn hai trăm tỷ trong mười lăm phút đầu giao dịch chính thức."
)
_INSIGHT_2 = (
    "<strong>Tác động phiên sáng nay:</strong> "
    "Thông tin FDI tăng mạnh hỗ trợ tâm lý tích cực cho nhóm khu công nghiệp; "
    "tuy nhiên cần quan sát biến động thực tế thay vì phản ứng theo kỳ vọng ban đầu của nhà đầu tư cá nhân."
)
_INSIGHT_3 = (
    "<strong>Tác động phiên sáng nay:</strong> "
    "Thông tin giữ nguyên lãi suất tạo nền ổn định cho thị trường trái phiếu, "
    "nhóm bất động sản vốn nhạy cảm với chi phí vốn có thể phản ứng tích cực khi mở cửa sáng nay."
)
_INSIGHT_4 = (
    "<strong>Tác động phiên sáng nay:</strong> "
    "Tin xuất khẩu thủy sản tăng mười hai phần trăm so cùng kỳ hỗ trợ tâm lý nhóm thủy sản vốn hóa nhỏ; "
    "tác động lên điểm số toàn thị trường hạn chế do trọng số thấp trong rổ."
)
_INSIGHT_5 = (
    "<strong>Tác động phiên sáng nay:</strong> "
    "Thông tin nới room ngoại cho một doanh nghiệp bảo hiểm có thể thu hút dòng tiền đặc thù phiên sáng, "
    "không đại diện cho xu hướng toàn thị trường trong ngày giao dịch hôm nay."
)

VALID_PREMARKET = json.dumps(
    {
        "headline": "Phố Wall tăng nhẹ qua đêm — tâm lý thận trọng trước số liệu việc làm Mỹ",
        "tagline": "THẬN TRỌNG · 3 tin tích cực · 2 sự kiện cao · Theo dõi thanh khoản mở cửa",
        "world_paragraph": _WORLD_PARA,
        "hot_news": [
            {"id": "news-001", "rank_order": 1, "insight": _INSIGHT_1},
            {"id": "news-002", "rank_order": 2, "insight": _INSIGHT_2},
            {"id": "news-003", "rank_order": 3, "insight": _INSIGHT_3},
            {"id": "news-004", "rank_order": 4, "insight": _INSIGHT_4},
            {"id": "news-005", "rank_order": 5, "insight": _INSIGHT_5},
        ],
        "events_filtered": [
            {"id": "evt-001", "note": "Ngày giao dịch không hưởng quyền — giá tham chiếu giảm kỹ thuật", "impact": "high"},
            {"id": "evt-002", "note": "ĐHCĐ thường niên quyết định kế hoạch lợi nhuận và cổ tức", "impact": "high"},
            {"id": "evt-003", "note": "Niêm yết thêm cổ phiếu có thể pha loãng nhẹ trong ngắn hạn", "impact": "medium"},
        ],
        "watch_today": [
            {"level": "normal", "content": "VN-Index: ngưỡng hỗ trợ một nghìn hai trăm chín mươi điểm là vùng giữ chính phiên sáng nay; nếu mở cửa trên đây và giữ được tâm lý sẽ cải thiện rõ."},
            {"level": "alert", "content": "<span class='tkr'>VCB</span>: ngày giao dịch không hưởng quyền cổ tức — giá tham chiếu giảm kỹ thuật; áp lực bán thực tế cần phân biệt khỏi điều chỉnh tham chiếu kỹ thuật hôm nay."},
            {"level": "normal", "content": "<span class='tkr'>HPG</span>: nhóm thép theo dõi giá dầu và quặng sắt qua đêm; HPG chiếm trọng số lớn trong nhóm công nghiệp cơ bản trên sàn hiện tại."},
            {"level": "warn", "content": "<span class='tkr'>VIC</span>: nhạy cảm với thông tin lãi suất; nếu nhóm bất động sản mở cửa giảm trên một phần trăm có thể kéo độ rộng toàn sàn xuống thấp."},
            {"level": "normal", "content": "<span class='tkr'>FPT</span>: nằm trong nhóm công nghệ hưởng lợi từ tâm lý Phố Wall tích cực; theo dõi thanh khoản có xác nhận dòng tiền thực hay không hôm nay."},
        ],
    },
    ensure_ascii=False,
)

# ── Fixtures / payload ────────────────────────────────────────────────────────

_MOCK_PAYLOAD = {
    "meta": {"generated_for_date": "2026-07-03", "report_type": "premarket"},
    "global_markets": _GLOBAL_MARKETS,
    "news_pool": _NEWS_POOL,
    "events_pool": _EVENTS_POOL,
    "eod_previous_summary": None,
    "config": {"generated_for_date": "2026-07-03", "weekday_vi": "Thứ Năm", "is_post_weekend": False, "is_post_holiday": False},
}


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_premarket_persists_premarket_record(db_session):
    """run_premarket_analysis persists a row with report_type='premarket'."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        res = await G2.run_premarket_analysis(session=db_session)

    assert res["persisted"] is True, f"persisted should be True, errors: {res['errors']}"
    row = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalar_one()
    assert row.report_type == "premarket"


@pytest.mark.asyncio
async def test_run_premarket_tagline_normalized_to_dict(db_session):
    """The plain-string tagline from LLM is normalized to {"text": <string>} on persist."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        await G2.run_premarket_analysis(session=db_session)

    row = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalar_one()
    assert isinstance(row.tagline, dict), f"tagline must be dict, got {type(row.tagline)}"
    assert "text" in row.tagline, f"tagline must have 'text' key, got {row.tagline}"
    assert "THẬN TRỌNG" in row.tagline["text"]


@pytest.mark.asyncio
async def test_run_premarket_meta_contains_resolved_hot_news(db_session):
    """The persisted meta.hot_news contains RESOLVED objects (with 'title' from pool)."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        await G2.run_premarket_analysis(session=db_session)

    row = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalar_one()
    meta = row.meta or {}
    hot_news = meta.get("hot_news") or []
    assert len(hot_news) == 5, f"meta.hot_news should have 5 items, got {len(hot_news)}"
    first = hot_news[0]
    # Must have title (from pool) AND insight (from LLM output)
    assert "title" in first, f"resolved hot_news item must have 'title', got keys: {list(first.keys())}"
    assert first["title"] == "Thị trường Mỹ tăng nhẹ trước số liệu việc làm"
    assert "insight" in first, "resolved hot_news item must retain 'insight'"
    assert "rank_order" in first, "resolved hot_news item must retain 'rank_order'"


@pytest.mark.asyncio
async def test_run_premarket_meta_contains_resolved_events(db_session):
    """The persisted meta.events_filtered contains RESOLVED objects (with 'title' from pool)."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        await G2.run_premarket_analysis(session=db_session)

    row = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalar_one()
    meta = row.meta or {}
    events = meta.get("events_filtered") or []
    assert len(events) == 3
    first_evt = events[0]
    assert "title" in first_evt, f"resolved event must have 'title', got: {list(first_evt.keys())}"
    assert "VCB" in first_evt["title"]
    assert "note" in first_evt
    assert "impact" in first_evt


@pytest.mark.asyncio
async def test_run_premarket_meta_contains_world_overview(db_session):
    """The persisted meta.world_overview is attached from payload global_markets."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        await G2.run_premarket_analysis(session=db_session)

    row = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalar_one()
    meta = row.meta or {}
    assert "world_overview" in meta, f"meta must contain 'world_overview', got keys: {list(meta.keys())}"
    assert meta["world_overview"] == _GLOBAL_MARKETS


@pytest.mark.asyncio
async def test_run_premarket_watchlist_from_watch_today(db_session):
    """The persisted watchlist is populated from watch_today output."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        await G2.run_premarket_analysis(session=db_session)

    row = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalar_one()
    assert row.watchlist is not None
    wl_json = json.dumps(row.watchlist, ensure_ascii=False)
    assert "VN-Index" in wl_json


@pytest.mark.asyncio
async def test_run_premarket_paragraphs_contains_world_paragraph(db_session):
    """The persisted paragraphs = {"world_paragraph": ...}."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        await G2.run_premarket_analysis(session=db_session)

    row = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalar_one()
    assert isinstance(row.paragraphs, dict)
    assert "world_paragraph" in row.paragraphs, f"paragraphs must have 'world_paragraph', got: {list(row.paragraphs.keys())}"


@pytest.mark.asyncio
async def test_run_premarket_does_not_create_daily_row(db_session):
    """run_premarket_analysis must not create a row with report_type='daily'."""
    from app.services.ai.market_analysis import generator as G2

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        await G2.run_premarket_analysis(session=db_session)

    daily_rows = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "daily")
        )
    ).scalars().all()
    assert len(daily_rows) == 0, "premarket run must not pollute daily report_type"


def test_run_premarket_analysis_is_importable():
    """Import guard: run_premarket_analysis must be importable from the package __init__."""
    from app.services.ai.market_analysis import run_premarket_analysis  # noqa: F401

    assert callable(run_premarket_analysis)


# ── Daily-side mocks (valid daily output/payload, mirrors test_market_analysis_v14) ──

_DAILY_PAYLOAD = {
    "meta": {"generated_for_date": "2026-07-03"},
    "point_contribution": {"top_positive": [{"ticker": "VHM"}]},
    "foreign_flow": {"top_sell": [{"ticker": "VHM", "value_vnd_billion": -817}]},
    "prop_trading": {"buy_concentration_flag": {"concentrated": True}},
    "technical_levels": {"scenario_realistic_range": {"far_support": 1715.1}},
    "memory_context": {"verifiable_claims_from_recent_analyses": []},
}

_VALID_DAILY = json.dumps(
    {
        "headline": "Bề mặt giảm nhẹ — HNX lao dốc",
        "session_type": "hidden_distribution",
        "tagline": {"direction": "down", "marker": "▼", "text": "RÚT TIỀN NGẦM · ngoại bán"},
        "paragraphs": {
            "structure": "<span class='num'>1.824</span> điểm.",
            "smart_money": "Khối ngoại bán ròng <span class='num'>1.868 tỷ</span>.",
            "market_health": (
                "Tỷ lệ mã trên MA20 còn 43%, giảm so với phiên trước, thanh khoản tương đương MA20, "
                "VN30 dưới MA50 và MA200 cho thấy xu hướng yếu, ngành dẫn dắt như bất động sản và "
                "ngân hàng đều giảm liên tiếp hai phiên, vốn hóa nhỏ và vừa giảm mạnh hơn bluechip, "
                "dòng tiền thu hẹp rõ rệt khiến sức khỏe thị trường suy yếu rõ nét trên diện rộng "
                "toàn phiên giao dịch."
            ),
        },
        "scenarios": [{"direction": "down", "condition_html": "Mất <strong>1.815</strong>", "outcome_html": "test <strong>1.795</strong>"}],
        "watchlist": [{"ticker": "VHM", "alert": True, "reason_html": "— mâu thuẫn"}],
        "unexplained": "VHM tăng nhưng KN bán mạnh.",
    },
    ensure_ascii=False,
)


@pytest.mark.asyncio
async def test_premarket_then_daily_same_date_distinct_public_ids(db_session):
    """Regression (public_id collision): a premarket run followed by a daily run for the
    SAME session_date must persist BOTH rows with DISTINCT public_ids.

    On the buggy code both fall back to public_id='vnindex-{date}' (UNIQUE column) —
    the daily INSERT hits the unique violation and the LIVE daily brief fails to persist.
    """
    from app.services.ai.market_analysis import generator as G2

    # 07:15 — premarket run persists its row
    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
    ):
        res_pm = await G2.run_premarket_analysis(session=db_session)
    assert res_pm["persisted"] is True, f"premarket persist failed: {res_pm['errors']}"

    # 16:30 — daily run for the SAME session_date must also persist
    with patch.object(G2, "chat_completion", new=AsyncMock(return_value=(_VALID_DAILY, "deepseek"))):
        res_daily = await G2.generate_analysis(payload=dict(_DAILY_PAYLOAD), db=db_session)
    assert res_daily["persisted"] is True, (
        f"daily persist failed (public_id collision with premarket row?): {res_daily['errors']}"
    )

    rows = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.session_date == dt.date(2026, 7, 3))
        )
    ).scalars().all()
    assert len(rows) == 2, f"expected premarket + daily rows, got {[(r.report_type, r.public_id) for r in rows]}"

    by_type = {r.report_type: r for r in rows}
    assert set(by_type) == {"premarket", "daily"}
    assert by_type["premarket"].public_id != by_type["daily"].public_id
    # premarket must NOT squat on the daily public contract id
    assert by_type["premarket"].public_id.startswith("premarket-"), by_type["premarket"].public_id
    # daily keeps the LIVE public contract id format
    assert by_type["daily"].public_id == "vnindex-2026-07-03"


@pytest.mark.asyncio
async def test_postprocess_exception_aborts_persist(db_session):
    """A resolver crash must abort the persist (rollback path), never store a bad row."""
    from app.services.ai.market_analysis import generator as G2

    def _boom(output, payload):
        raise RuntimeError("resolver crashed")

    with (
        patch.object(G2, "build_premarket_payload", new=AsyncMock(return_value=_MOCK_PAYLOAD)),
        patch.object(G2, "chat_completion", new=AsyncMock(return_value=(VALID_PREMARKET, "deepseek"))),
        patch.object(G2.PREMARKET_CONFIG, "postprocess", new=_boom),
    ):
        res = await G2.run_premarket_analysis(session=db_session)

    assert res["persisted"] is False
    rows = (
        await db_session.execute(
            select(AnalysisHistory).where(AnalysisHistory.report_type == "premarket")
        )
    ).scalars().all()
    assert rows == [], "no premarket row may be persisted when postprocess raises"

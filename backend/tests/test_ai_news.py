"""Tests for Vietcap AI News source connector and API endpoints."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest

from app.services.market_data.sources.vietcap_ai_news import (
    AINewsNotFoundError,
    AINewsUpstreamError,
    AINewsUpstreamShapeError,
    _norm_detail,
    _norm_item,
    _strip_html,
    fetch_audio,
    fetch_catalogs,
    fetch_news_detail,
    fetch_news_list,
    fetch_ticker_sentiment,
)

_FETCH = "app.services.market_data.sources.vietcap_ai_news.fetch_json"

# ── Normalization unit tests ─────────────────────────


class TestNormItem:
    def test_business_item(self):
        raw = {
            "id": "abc123", "slug": "test-slug", "ticker": "VCB",
            "industry": "Ngân hàng", "news_title": "Test Title",
            "news_short_content": "Short", "news_source_link": "https://x.com",
            "news_image_url": "https://img.com/x.jpg",
            "update_date": "2026-04-25 10:00:00",
            "news_from": "cafef", "news_from_name": "CafeF",
            "sentiment": "Positive", "score": 9.5,
            "male_audio_duration": 120.0, "female_audio_duration": 130.0,
        }
        item = _norm_item(raw, "business")
        assert item["id"] == "abc123"
        assert item["title"] == "Test Title"
        assert item["source"] == "cafef"
        assert item["raw_type"] == "business"
        assert item["score"] == 9.5

    def test_topic_item_has_topic_name(self):
        raw = {
            "topic_name": "Giá vàng", "ticker": "gia-vang",
            "id": "x", "slug": "s",
        }
        item = _norm_item(raw, "topic")
        assert item["topic_name"] == "Giá vàng"
        assert item["raw_type"] == "topic"

    def test_exchange_item_thin(self):
        raw = {
            "id": "x", "slug": "s", "ticker": "SGB",
            "news_title": "SGB Report",
        }
        item = _norm_item(raw, "exchange")
        assert item["title"] == "SGB Report"
        assert item["sentiment"] == ""
        assert item["score"] == 0

    def test_missing_fields_default(self):
        item = _norm_item({}, "business")
        assert item["id"] == ""
        assert item["title"] == ""


class TestNormDetail:
    def test_detail_with_attachments(self):
        raw = {
            "id": "x", "slug": "s", "ticker": "SGB",
            "news_title": "Title", "company_name": "Corp",
            "summary": "Sum", "highlight_position": "key point",
            "news_full_content": "<p>HTML</p>",
            "file_attachment": [{"text": "file.pdf", "url": "https://x/f.pdf"}],
            "news_type": "exchange_news",
        }
        d = _norm_detail(raw)
        assert d["company_name"] == "Corp"
        assert d["news_full_content_html"] == "<p>HTML</p>"
        assert d["news_full_content_text"] == "HTML"
        assert len(d["file_attachments"]) == 1
        assert d["news_type"] == "exchange_news"

    def test_detail_text_complex_html(self):
        raw = {
            "id": "x", "slug": "s", "ticker": "VCB",
            "news_full_content": "<h1>Title</h1><p>Para <b>bold</b></p>",
        }
        d = _norm_detail(raw)
        assert "<" not in d["news_full_content_text"]
        assert "Title" in d["news_full_content_text"]
        assert "bold" in d["news_full_content_text"]

    def test_detail_empty_html(self):
        raw = {"id": "x", "slug": "s", "ticker": "VCB"}
        d = _norm_detail(raw)
        assert d["news_full_content_text"] == ""


class TestStripHtml:
    def test_basic(self):
        assert _strip_html("<p>Hello</p>") == "Hello"

    def test_nested(self):
        assert "bold" in _strip_html("<p>text <b>bold</b></p>")

    def test_empty(self):
        assert _strip_html("") == ""


# ── Connector tests with mocked fetch_json ───────────


@pytest.mark.asyncio
async def test_fetch_business_list():
    mock_resp = {
        "total_records": 1,
        "news_info": [
            {"id": "a", "slug": "s", "ticker": "VCB", "news_title": "T"},
        ],
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        items, total, url = await fetch_news_list(
            "business", page=1, page_size=5,
        )
    assert total == 1
    assert len(items) == 1
    assert items[0]["raw_type"] == "business"


@pytest.mark.asyncio
async def test_fetch_topic_list():
    mock_resp = {
        "total_records": 2,
        "news_info": [
            {
                "id": "a", "slug": "s", "ticker": "gia-vang",
                "news_title": "Gold", "topic_name": "Giá vàng",
            },
            {"id": "b", "slug": "s2", "ticker": "gia-vang", "news_title": "G2"},
        ],
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        items, total, _ = await fetch_news_list("topic", topic="gia-vang")
    assert total == 2
    assert items[0]["topic_name"] == "Giá vàng"


@pytest.mark.asyncio
async def test_fetch_exchange_list():
    mock_resp = {
        "total_records": 1,
        "news_info": [
            {"id": "x", "slug": "s", "ticker": "SGB", "news_title": "SGB"},
        ],
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        items, total, _ = await fetch_news_list("exchange")
    assert items[0]["sentiment"] == ""


@pytest.mark.asyncio
async def test_invalid_kind_raises():
    with pytest.raises(ValueError, match="Loại tin không hợp lệ"):
        await fetch_news_list("invalid_kind")


@pytest.mark.asyncio
async def test_missing_news_info_key_raises_shape_error():
    """Response dict without 'news_info' key → UpstreamShapeError."""
    mock_resp = {"total_records": 5}  # missing news_info
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(AINewsUpstreamShapeError, match="news_info"),
    ):
        await fetch_news_list("business")


@pytest.mark.asyncio
async def test_non_dict_response_raises_shape_error():
    """Upstream returns string → UpstreamShapeError."""
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value="not a dict"),
        pytest.raises(AINewsUpstreamShapeError, match="Expected dict"),
    ):
        await fetch_news_list("business")


@pytest.mark.asyncio
async def test_news_info_not_list_raises_shape_error():
    """news_info is a string instead of list → UpstreamShapeError."""
    mock_resp = {"total_records": 0, "news_info": "bad"}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(AINewsUpstreamShapeError, match="expected list"),
    ):
        await fetch_news_list("business")


@pytest.mark.asyncio
async def test_transport_error_raises_upstream_error():
    """fetch_json raises → wrapped as AINewsUpstreamError."""
    with (
        patch(
            _FETCH, new_callable=AsyncMock,
            side_effect=Exception("connection reset"),
        ),
        pytest.raises(AINewsUpstreamError, match="connection reset"),
    ):
        await fetch_news_list("business")


@pytest.mark.asyncio
async def test_empty_list_allowed():
    """Valid empty list from upstream is allowed."""
    mock_resp = {"total_records": 0, "news_info": []}
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        items, total, _ = await fetch_news_list("business")
    assert items == []
    assert total == 0


# ── Detail tests ─────────────────────────────────────


@pytest.mark.asyncio
async def test_detail_by_slug():
    mock_resp = {
        "id": "abc", "slug": "test-slug", "ticker": "VCB",
        "news_title": "Title", "news_full_content": "<p>X</p>",
        "file_attachment": [], "news_type": "stock_news",
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        detail, _ = await fetch_news_detail("test-slug")
    assert detail["news_full_content_html"] == "<p>X</p>"


@pytest.mark.asyncio
async def test_detail_missing_raises_not_found():
    """Empty dict (no id) → NotFoundError."""
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value={}),
        pytest.raises(AINewsNotFoundError, match="No detail found"),
    ):
        await fetch_news_detail("nonexistent")


@pytest.mark.asyncio
async def test_detail_malformed_raises_shape_error():
    """Non-dict detail → UpstreamShapeError."""
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=[1, 2, 3]),
        pytest.raises(AINewsUpstreamShapeError, match="expected dict"),
    ):
        await fetch_news_detail("slug")


@pytest.mark.asyncio
async def test_detail_transport_error():
    with (
        patch(
            _FETCH, new_callable=AsyncMock,
            side_effect=Exception("timeout"),
        ),
        pytest.raises(AINewsUpstreamError, match="timeout"),
    ):
        await fetch_news_detail("slug")


# ── Audio tests ──────────────────────────────────────


@pytest.mark.asyncio
async def test_audio_by_id():
    mock_resp = {
        "male": "https://s3.com/male.m4a",
        "female": "https://s3.com/female.m4a",
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        audio, _ = await fetch_audio("abc123")
    assert audio["male_url"] == "https://s3.com/male.m4a"


@pytest.mark.asyncio
async def test_audio_malformed_raises_shape_error():
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value="not dict"),
        pytest.raises(AINewsUpstreamShapeError),
    ):
        await fetch_audio("id")


@pytest.mark.asyncio
async def test_audio_missing_keys_raises_not_found():
    """Dict without male/female → NotFoundError."""
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value={"other": "x"}),
        pytest.raises(AINewsNotFoundError, match="No audio"),
    ):
        await fetch_audio("id")


# ── Catalog tests ────────────────────────────────────


@pytest.mark.asyncio
async def test_catalogs_full_success():
    with patch(_FETCH, new_callable=AsyncMock) as mock:
        mock.side_effect = [
            {"static_topic": [{"name": "Gold", "key": "gia-vang"}]},
            [{"viName": "CafeF", "value": "cafef"}],
            [{"viName": "Banks", "value": "banks"}],
            {"ticker_info": [{"ticker": "VCB", "score": 9.0}]},
        ]
        cats, urls = await fetch_catalogs()
    assert len(cats["topics"]) == 1
    assert cats["partial"] is False
    assert cats["warnings"] == []
    assert len(urls) == 4


@pytest.mark.asyncio
async def test_catalogs_partial_failure():
    """One sub-fetch fails → partial=True with warning."""
    with patch(_FETCH, new_callable=AsyncMock) as mock:
        mock.side_effect = [
            Exception("topics down"),  # topics fail
            [{"viName": "CafeF", "value": "cafef"}],
            [{"viName": "Banks", "value": "banks"}],
            {"ticker_info": []},
        ]
        cats, urls = await fetch_catalogs()
    assert cats["partial"] is True
    assert len(cats["warnings"]) >= 1
    assert cats["topics"] == []
    assert len(cats["sources"]) == 1


@pytest.mark.asyncio
async def test_catalogs_shape_error_is_partial():
    """Shape error in one catalog sub-fetch → partial, not crash."""
    with patch(_FETCH, new_callable=AsyncMock) as mock:
        mock.side_effect = [
            "not a dict",  # topics shape error
            [{"viName": "CafeF", "value": "cafef"}],
            [{"viName": "Banks", "value": "banks"}],
            {"ticker_info": []},
        ]
        cats, _ = await fetch_catalogs()
    assert cats["partial"] is True
    assert cats["topics"] == []


# ── Ticker sentiment tests ───────────────────────────


@pytest.mark.asyncio
async def test_ticker_sentiment():
    mock_resp = {
        "ticker_info": [{
            "ticker": "VCB", "score": 8.5, "sentiment": "Positive",
            "cnt_news": 10, "count_pos": 7, "count_neu": 2, "count_neg": 1,
            "organ_name": "Vietcombank",
        }],
    }
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_ticker_sentiment("VCB")
    assert data["score"] == 8.5
    assert data["news_count"] == 10


@pytest.mark.asyncio
async def test_ticker_sentiment_transport_error():
    with (
        patch(
            _FETCH, new_callable=AsyncMock,
            side_effect=Exception("network"),
        ),
        pytest.raises(AINewsUpstreamError, match="network"),
    ):
        await fetch_ticker_sentiment("VCB")


@pytest.mark.asyncio
async def test_ticker_sentiment_shape_error():
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value="bad"),
        pytest.raises(AINewsUpstreamShapeError),
    ):
        await fetch_ticker_sentiment("VCB")


# ── API endpoint validation tests ────────────────────


@pytest.mark.asyncio
async def test_ai_news_invalid_kind(client):
    resp = await client.get("/api/v1/market-data/news/ai?kind=bad")
    assert resp.status_code == 422
    assert "không hợp lệ" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_ai_news_invalid_sentiment(client):
    resp = await client.get("/api/v1/market-data/news/ai?sentiment=Wrong")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ai_news_invalid_date_format(client):
    resp = await client.get("/api/v1/market-data/news/ai?update_from=not-a-date")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ai_news_impossible_date(client):
    """2026-02-30 is regex-valid but not a real date → 422."""
    resp = await client.get("/api/v1/market-data/news/ai?update_from=2026-02-30")
    assert resp.status_code == 422
    assert "không hợp lệ" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_ai_news_feb_29_non_leap(client):
    """2025-02-29 doesn't exist (not leap year) → 422."""
    resp = await client.get("/api/v1/market-data/news/ai?update_to=2025-02-29")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ai_news_compact_date_rejected(client):
    """20260425 (no dashes) → 422."""
    resp = await client.get("/api/v1/market-data/news/ai?update_from=20260425")
    assert resp.status_code == 422
    assert "định dạng date format" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_ai_news_iso_week_date_rejected(client):
    """2026-W17-6 (ISO week date) → 422."""
    resp = await client.get("/api/v1/market-data/news/ai?update_to=2026-W17-6")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_news_info_item_not_dict_raises():
    """news_info contains non-dict item → shape error."""
    mock_resp = {"total_records": 1, "news_info": ["not a dict"]}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(AINewsUpstreamShapeError, match="news_info\\[0\\]"),
    ):
        await fetch_news_list("business")


@pytest.mark.asyncio
async def test_ticker_sentiment_missing_key_raises():
    """Response dict without 'ticker_info' key → shape error (not silent)."""
    mock_resp = {"other_key": "value"}  # missing ticker_info
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(AINewsUpstreamShapeError, match="ticker_info"),
    ):
        await fetch_ticker_sentiment("VCB")


@pytest.mark.asyncio
async def test_ticker_sentiment_empty_list_valid():
    """ticker_info key present but empty → valid no sentiment."""
    mock_resp: dict[str, list[object]] = {"ticker_info": []}
    with patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp):
        data, _ = await fetch_ticker_sentiment("VCB")
    assert data["score"] == 0
    assert data["sentiment"] == ""


@pytest.mark.asyncio
async def test_catalogs_all_fail():
    """All 4 sub-fetches fail → partial=True, available_sections=[]."""
    with patch(_FETCH, new_callable=AsyncMock) as mock:
        mock.side_effect = [
            Exception("1"), Exception("2"), Exception("3"), Exception("4"),
        ]
        cats, urls = await fetch_catalogs()
    assert cats["partial"] is True
    assert cats["available_sections"] == []
    assert len(cats["warnings"]) == 4


@pytest.mark.asyncio
async def test_ticker_sentiment_info_not_list():
    """ticker_info is a string instead of list → shape error."""
    mock_resp = {"ticker_info": "bad"}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(AINewsUpstreamShapeError, match="expected list"),
    ):
        await fetch_ticker_sentiment("VCB")


@pytest.mark.asyncio
async def test_ticker_sentiment_item_not_dict():
    """ticker_info[0] is not dict → shape error."""
    mock_resp = {"ticker_info": ["not a dict"]}
    with (
        patch(_FETCH, new_callable=AsyncMock, return_value=mock_resp),
        pytest.raises(AINewsUpstreamShapeError, match="ticker_info\\[0\\]"),
    ):
        await fetch_ticker_sentiment("VCB")


@pytest.mark.asyncio
async def test_catalogs_available_sections():
    """Partial catalog: available_sections lists only successful ones."""
    with patch(_FETCH, new_callable=AsyncMock) as mock:
        mock.side_effect = [
            {"static_topic": [{"name": "Gold", "key": "gia-vang"}]},
            Exception("sources down"),
            [{"viName": "Banks", "value": "banks"}],
            Exception("tickers down"),
        ]
        cats, _ = await fetch_catalogs()
    assert cats["partial"] is True
    assert "topics" in cats["available_sections"]
    assert "industries" in cats["available_sections"]
    assert "sources" not in cats["available_sections"]
    assert "top_tickers" not in cats["available_sections"]


# ── Endpoint partial/warning tests ───────────────────


@pytest.mark.asyncio
async def test_ticker_endpoint_partial_on_shape_error(client):
    """If ticker_score returns malformed shape, endpoint returns partial=true, not 500."""
    _ticker_fetch = "app.services.market_data.sources.vietcap_ai_news.fetch_json"
    with patch(_ticker_fetch, new_callable=AsyncMock) as mock:
        # ticker_score returns bad shape, news calls return valid
        mock.side_effect = [
            "not a dict",  # ticker_score → shape error
            {"total_records": 0, "news_info": []},  # business
            {"total_records": 0, "news_info": []},  # exchange
        ]
        resp = await client.get("/api/v1/market-data/news/ai/tickers/VCB")
    assert resp.status_code == 200
    body = resp.json()
    assert body["partial"] is True
    assert len(body["warnings"]) >= 1
    assert "sentiment" in body["warnings"][0]


# ── Live tests (behind env flag) ─────────────────────

_LIVE = os.environ.get("RUN_MARKET_DATA_LIVE_TESTS") == "1"
_skip_live = pytest.mark.skipif(
    not _LIVE, reason="RUN_MARKET_DATA_LIVE_TESTS not set",
)


@_skip_live
@pytest.mark.asyncio
async def test_live_business_news():
    items, total, _ = await fetch_news_list(
        "business", page=1, page_size=2,
    )
    assert total > 0
    assert len(items) > 0
    assert items[0]["id"]


@_skip_live
@pytest.mark.asyncio
async def test_live_topic_news():
    items, total, _ = await fetch_news_list(
        "topic", topic="gia-vang", page=1, page_size=2,
    )
    assert total > 0


@_skip_live
@pytest.mark.asyncio
async def test_live_exchange_news():
    items, total, _ = await fetch_news_list("exchange", page=1, page_size=2)
    assert total > 0


@_skip_live
@pytest.mark.asyncio
async def test_live_detail():
    items, _, _ = await fetch_news_list("business", page=1, page_size=1)
    assert len(items) > 0
    detail, _ = await fetch_news_detail(items[0]["slug"])
    assert detail["id"] == items[0]["id"]


@_skip_live
@pytest.mark.asyncio
async def test_live_catalogs():
    cats, urls = await fetch_catalogs()
    assert len(cats["topics"]) > 0
    assert len(cats["sources"]) > 0


@_skip_live
@pytest.mark.asyncio
async def test_live_ticker_sentiment():
    data, _ = await fetch_ticker_sentiment("VCB")
    assert data["ticker"] == "VCB"

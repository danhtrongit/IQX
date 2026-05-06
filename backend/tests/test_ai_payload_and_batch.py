"""Tests for AI payload parallel fetch, caching, and batch endpoint."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ═══════════════════════════════════════════════════════
# 1. Payload Parallel Fetch Tests
# ═══════════════════════════════════════════════════════


class TestPayloadParallelFetch:
    """Verify that payload builders use asyncio.gather and handle per-source failures."""

    async def test_dashboard_payload_parallel_execution(self) -> None:
        """All dashboard sources should be fetched in parallel via asyncio.gather."""
        call_times: list[float] = []

        async def _slow_fetch(*a, **kw):  # noqa: ANN002
            import time
            call_times.append(time.monotonic())
            await asyncio.sleep(0.01)  # Simulate network delay
            return [], "http://mock"

        async def _slow_news(*a, **kw):  # noqa: ANN002
            import time
            call_times.append(time.monotonic())
            await asyncio.sleep(0.01)
            return [], 0, "http://mock"

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        _ai = "app.services.market_data.sources.vietcap_ai_news"
        patches = [
            patch(f"{_ov}.fetch_market_index", _slow_fetch),
            patch(f"{_ov}.fetch_liquidity", _slow_fetch),
            patch(f"{_ov}.fetch_breadth", _slow_fetch),
            patch(f"{_ov}.fetch_sectors_allocation", _slow_fetch),
            patch(f"{_ov}.fetch_index_impact", _slow_fetch),
            patch(f"{_ov}.fetch_foreign", _slow_fetch),
            patch(f"{_ov}.fetch_foreign_top", _slow_fetch),
            patch(f"{_ov}.fetch_proprietary", _slow_fetch),
            patch(f"{_ov}.fetch_proprietary_top", _slow_fetch),
            patch(f"{_ai}.fetch_news_list", _slow_news),
            patch("app.services.ai.payloads._cache_get", AsyncMock(return_value=None)),
            patch("app.services.ai.payloads._cache_set", AsyncMock()),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_dashboard_payload
            payload = await build_dashboard_payload(language="vi")

            # All 10 sources should have been called
            assert len(call_times) == 10
            # Parallel: all should start within a tight window
            span = max(call_times) - min(call_times)
            assert span < 0.05, f"Sources not parallel: span={span:.3f}s"
            assert "market_index" in payload
        finally:
            for p in patches:
                p.stop()

    async def test_dashboard_one_source_fails_others_succeed(self) -> None:
        """If one source raises, others should still populate the payload."""
        async def _ok_fetch(*a, **kw):  # noqa: ANN002
            return [{"data": "ok"}], "http://mock"

        async def _fail_fetch(*a, **kw):  # noqa: ANN002
            raise ConnectionError("upstream down")

        async def _ok_news(*a, **kw):  # noqa: ANN002
            return [{"title": "news"}], 1, "http://mock"

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        _ai = "app.services.market_data.sources.vietcap_ai_news"
        patches = [
            patch(f"{_ov}.fetch_market_index", _ok_fetch),
            patch(f"{_ov}.fetch_liquidity", _fail_fetch),  # This one fails
            patch(f"{_ov}.fetch_breadth", _ok_fetch),
            patch(f"{_ov}.fetch_sectors_allocation", _ok_fetch),
            patch(f"{_ov}.fetch_index_impact", _ok_fetch),
            patch(f"{_ov}.fetch_foreign", _ok_fetch),
            patch(f"{_ov}.fetch_foreign_top", _ok_fetch),
            patch(f"{_ov}.fetch_proprietary", _ok_fetch),
            patch(f"{_ov}.fetch_proprietary_top", _ok_fetch),
            patch(f"{_ai}.fetch_news_list", _ok_news),
            patch("app.services.ai.payloads._cache_get", AsyncMock(return_value=None)),
            patch("app.services.ai.payloads._cache_set", AsyncMock()),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_dashboard_payload
            payload = await build_dashboard_payload(language="vi")

            # Failed source should be None
            assert payload["liquidity"] is None
            # Other sources should have data
            assert payload["market_index"] is not None
            assert payload["breadth"] is not None
            assert payload["news"] is not None
        finally:
            for p in patches:
                p.stop()


# ═══════════════════════════════════════════════════════
# 2. Payload Cache Tests
# ═══════════════════════════════════════════════════════


class TestPayloadCaching:
    """Verify Redis caching for AI payloads."""

    async def test_dashboard_cache_hit_skips_upstream(self) -> None:
        """When cache hit, no upstream calls should be made."""
        cached_payload = {"as_of": "2026-01-01", "language": "vi", "market_index": [1, 2, 3]}

        mock_fetch = AsyncMock(side_effect=AssertionError("Should not call upstream"))

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        with (
            patch("app.services.ai.payloads._cache_get", AsyncMock(return_value=cached_payload)),
            patch(f"{_ov}.fetch_market_index", mock_fetch),
        ):
            from app.services.ai.payloads import build_dashboard_payload
            result = await build_dashboard_payload(language="vi")

        assert result == cached_payload
        mock_fetch.assert_not_called()

    async def test_industry_cache_hit_skips_upstream(self) -> None:
        """Industry payload cache hit by icb_code+language should skip upstream."""
        cached = {"icb_code": 8300, "language": "vi", "sector_detail_1d": []}

        with patch("app.services.ai.payloads._cache_get", AsyncMock(return_value=cached)):
            from app.services.ai.payloads import build_industry_payload
            result = await build_industry_payload(icb_code=8300, language="vi")

        assert result == cached

    async def test_cache_miss_calls_upstream_and_caches(self) -> None:
        """On cache miss, upstream is called and result is cached."""
        cache_set_mock = AsyncMock()

        async def _mock_fetch(*a, **kw):  # noqa: ANN002
            return [], "http://mock"

        async def _mock_news(*a, **kw):  # noqa: ANN002
            return [], 0, "http://mock"

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        _ai = "app.services.market_data.sources.vietcap_ai_news"
        patches = [
            patch(f"{_ov}.fetch_market_index", _mock_fetch),
            patch(f"{_ov}.fetch_liquidity", _mock_fetch),
            patch(f"{_ov}.fetch_breadth", _mock_fetch),
            patch(f"{_ov}.fetch_sectors_allocation", _mock_fetch),
            patch(f"{_ov}.fetch_index_impact", _mock_fetch),
            patch(f"{_ov}.fetch_foreign", _mock_fetch),
            patch(f"{_ov}.fetch_foreign_top", _mock_fetch),
            patch(f"{_ov}.fetch_proprietary", _mock_fetch),
            patch(f"{_ov}.fetch_proprietary_top", _mock_fetch),
            patch(f"{_ai}.fetch_news_list", _mock_news),
            patch("app.services.ai.payloads._cache_get", AsyncMock(return_value=None)),
            patch("app.services.ai.payloads._cache_set", cache_set_mock),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_dashboard_payload
            await build_dashboard_payload(language="vi")
            cache_set_mock.assert_called_once()
            args = cache_set_mock.call_args
            assert "iqx:ai:payload:dashboard:vi" in args[0][0]
        finally:
            for p in patches:
                p.stop()

    async def test_redis_down_fallback_uncached(self) -> None:
        """If Redis is down, fetch proceeds uncached without error."""
        async def _mock_fetch(*a, **kw):  # noqa: ANN002
            return [{"ok": True}], "http://mock"

        async def _mock_news(*a, **kw):  # noqa: ANN002
            return [], 0, "http://mock"

        # Simulate Redis returning None (cache miss / Redis down)
        async def _cache_get_fail(key):  # noqa: ANN001
            return None  # _cache_get already catches Redis errors internally

        async def _cache_set_noop(key, value, ttl):  # noqa: ANN001
            pass  # _cache_set already catches Redis errors internally

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        _ai = "app.services.market_data.sources.vietcap_ai_news"
        patches = [
            patch(f"{_ov}.fetch_market_index", _mock_fetch),
            patch(f"{_ov}.fetch_liquidity", _mock_fetch),
            patch(f"{_ov}.fetch_breadth", _mock_fetch),
            patch(f"{_ov}.fetch_sectors_allocation", _mock_fetch),
            patch(f"{_ov}.fetch_index_impact", _mock_fetch),
            patch(f"{_ov}.fetch_foreign", _mock_fetch),
            patch(f"{_ov}.fetch_foreign_top", _mock_fetch),
            patch(f"{_ov}.fetch_proprietary", _mock_fetch),
            patch(f"{_ov}.fetch_proprietary_top", _mock_fetch),
            patch(f"{_ai}.fetch_news_list", _mock_news),
            patch("app.services.ai.payloads._cache_get", _cache_get_fail),
            patch("app.services.ai.payloads._cache_set", _cache_set_noop),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_dashboard_payload
            # Should NOT raise
            payload = await build_dashboard_payload(language="vi")
            assert payload["market_index"] is not None
        finally:
            for p in patches:
                p.stop()


# ═══════════════════════════════════════════════════════
# 3. Batch Industry Endpoint Tests
# ═══════════════════════════════════════════════════════


class TestBatchIndustryEndpoint:
    """Test POST /api/v1/ai/industry/analyze-batch."""

    _MOCK_ANALYSIS = "Test sector analysis text"

    async def test_batch_success_multiple_codes(self, client) -> None:  # noqa: ANN001
        """Batch endpoint returns results for multiple ICB codes."""
        async def _mock_analyze(*, icb_code, language="vi", include_payload=False):  # noqa: ANN001
            return {
                "type": "industry",
                "input": {"icb_code": icb_code, "language": language},
                "analysis": f"Analysis for {icb_code}",
                "model": "test-model",
                "as_of": "2026-04-27T00:00:00+00:00",
            }

        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_industry",
            new_callable=AsyncMock,
            side_effect=lambda **kw: _mock_analyze(**kw),
        ), patch(
            "app.services.ai.payloads.build_industry_payload_batch",
            new_callable=AsyncMock,
            return_value={8300: {"icb_code": 8300}, 9500: {"icb_code": 9500}},
        ), patch(
            "app.services.ai.proxy_client.chat_completion",
            new_callable=AsyncMock,
            return_value=("Test analysis", "test-model"),
        ):
            resp = await client.post(
                "/api/v1/ai/industry/analyze-batch",
                json={"icb_codes": [8300, 9500], "language": "vi"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
        assert len(data["results"]) == 2

    async def test_batch_per_item_error(self, client) -> None:  # noqa: ANN001
        """If one sector fails, others still return successfully."""
        call_count = 0

        async def _mock_chat(system_prompt, user_content):  # noqa: ANN001
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return ("Good analysis", "test-model")
            raise ConnectionError("AI proxy down for second call")

        with (
            patch(
                "app.services.ai.payloads.build_industry_payload_batch",
                new_callable=AsyncMock,
                return_value={8300: {"icb_code": 8300}, 9500: {"icb_code": 9500}},
            ),
            patch("app.services.ai.prompt_loader.load_prompt", return_value="test prompt"),
            patch("app.services.ai.proxy_client.chat_completion", _mock_chat),
        ):
            resp = await client.post(
                "/api/v1/ai/industry/analyze-batch",
                json={"icb_codes": [8300, 9500], "language": "vi"},
            )

        assert resp.status_code == 200
        results = resp.json()["results"]
        assert len(results) == 2
        # One should succeed, one should have error
        has_success = any("analysis" in r for r in results)
        has_error = any("error" in r for r in results)
        assert has_success
        assert has_error

    async def test_batch_empty_list_rejected(self, client) -> None:  # noqa: ANN001
        """Empty icb_codes list returns 422."""
        resp = await client.post(
            "/api/v1/ai/industry/analyze-batch",
            json={"icb_codes": [], "language": "vi"},
        )
        assert resp.status_code == 422

    async def test_batch_too_many_codes_rejected(self, client) -> None:  # noqa: ANN001
        """More than 20 codes returns 422."""
        resp = await client.post(
            "/api/v1/ai/industry/analyze-batch",
            json={"icb_codes": list(range(1, 25)), "language": "vi"},
        )
        assert resp.status_code == 422

    async def test_batch_deduplicates_codes(self, client) -> None:  # noqa: ANN001
        """Duplicate ICB codes should be deduplicated."""
        with (
            patch(
                "app.services.ai.payloads.build_industry_payload_batch",
                new_callable=AsyncMock,
                return_value={8300: {"icb_code": 8300}},
            ) as batch_mock,
            patch("app.services.ai.prompt_loader.load_prompt", return_value="test"),
            patch(
                "app.services.ai.proxy_client.chat_completion",
                AsyncMock(return_value=("Analysis", "model")),
            ),
        ):
            resp = await client.post(
                "/api/v1/ai/industry/analyze-batch",
                json={"icb_codes": [8300, 8300, 8300], "language": "vi"},
            )

        assert resp.status_code == 200
        # Should only have 1 result (deduplicated)
        assert len(resp.json()["results"]) == 1

    async def test_original_endpoint_still_works(self, client) -> None:  # noqa: ANN001
        """Original single-industry endpoint is preserved for backward compat."""
        result = {
            "type": "industry",
            "input": {"icb_code": 8300},
            "analysis": "Test",
            "model": "test",
            "as_of": "2026-01-01",
        }
        with patch(
            "app.api.v1.endpoints.ai_analysis.analyze_industry",
            new_callable=AsyncMock,
            return_value=result,
        ):
            resp = await client.post(
                "/api/v1/ai/industry/analyze",
                json={"icb_code": 8300, "language": "vi"},
            )
        assert resp.status_code == 200
        assert resp.json()["type"] == "industry"


# ═══════════════════════════════════════════════════════
# 4. Industry Payload Batch Builder Tests
# ═══════════════════════════════════════════════════════


class TestIndustryPayloadBatch:
    """Test build_industry_payload_batch shared data reuse."""

    async def test_shared_sources_fetched_once(self) -> None:
        """Shared sources should only be called once even for multiple codes."""
        call_counts: dict[str, int] = {}

        async def _counting_fetch(label, *a, **kw):  # noqa: ANN002
            call_counts[label] = call_counts.get(label, 0) + 1
            return [], "http://mock"

        async def _mock_allocation(*a, **kw):  # noqa: ANN002
            call_counts["allocation"] = call_counts.get("allocation", 0) + 1
            return [], "http://mock"

        async def _mock_info(*a, **kw):  # noqa: ANN002
            call_counts["info"] = call_counts.get("info", 0) + 1
            return [], "http://mock"

        async def _mock_ranking(*a, **kw):  # noqa: ANN002
            call_counts["ranking"] = call_counts.get("ranking", 0) + 1
            return [], "http://mock"

        async def _mock_strength(*a, **kw):  # noqa: ANN002
            call_counts["strength"] = call_counts.get("strength", 0) + 1
            return [], "http://mock"

        async def _mock_index(*a, **kw):  # noqa: ANN002
            call_counts["index"] = call_counts.get("index", 0) + 1
            return [], "http://mock"

        async def _mock_foreign(*a, **kw):  # noqa: ANN002
            call_counts["foreign"] = call_counts.get("foreign", 0) + 1
            return [], "http://mock"

        async def _mock_detail(*a, **kw):  # noqa: ANN002
            call_counts["detail"] = call_counts.get("detail", 0) + 1
            return [], "http://mock"

        _ov = "app.services.market_data.sources.vietcap_market_overview"
        _sec = "app.services.market_data.sources.vietcap_sector"
        patches = [
            patch(f"{_ov}.fetch_sectors_allocation", _mock_allocation),
            patch(f"{_sec}.fetch_sector_information", _mock_info),
            patch(f"{_sec}.fetch_sector_ranking", _mock_ranking),
            patch(f"{_ov}.fetch_stock_strength", _mock_strength),
            patch(f"{_ov}.fetch_market_index", _mock_index),
            patch(f"{_ov}.fetch_foreign_top", _mock_foreign),
            patch(f"{_ov}.fetch_sector_detail", _mock_detail),
            patch("app.services.ai.payloads._cache_get", AsyncMock(return_value=None)),
            patch("app.services.ai.payloads._cache_set", AsyncMock()),
        ]
        for p in patches:
            p.start()
        try:
            from app.services.ai.payloads import build_industry_payload_batch
            result = await build_industry_payload_batch(
                icb_codes=[8300, 9500, 3500], language="vi",
            )

            # 3 sectors, each payload should exist
            assert len(result) == 3
            assert 8300 in result
            assert 9500 in result

            # Shared sources called exactly once each
            for key in ["allocation", "info", "ranking", "strength", "index", "foreign"]:
                assert call_counts.get(key, 0) == 1, f"{key} called {call_counts.get(key, 0)} times"

            # Sector detail called 3 times per sector (3 timeframes) = 9
            assert call_counts.get("detail", 0) == 9
        finally:
            for p in patches:
                p.stop()

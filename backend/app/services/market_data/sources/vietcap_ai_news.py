"""Vietcap AI News source connector.

Fetches AI-curated news from https://ai.vietcap.com.vn
No dependency on vnstock_*.

Exception hierarchy:
- AINewsNotFoundError → 404 (detail slug not found)
- AINewsUpstreamShapeError → 502 (malformed response from upstream)
- AINewsUpstreamError → 503 (transport/connection failure)
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.services.market_data.http import fetch_json, get_headers

logger = logging.getLogger(__name__)

_SOURCE = "VCI"
_BASE = "https://ai.vietcap.com.vn"


# ── Exception hierarchy ──────────────────────────────


class AINewsNotFoundError(Exception):
    """Resource not found (slug/id does not exist upstream)."""


class AINewsUpstreamShapeError(Exception):
    """Upstream returned data but in unexpected shape."""


class AINewsUpstreamError(Exception):
    """Upstream transport/connection failure."""


def _ai_headers() -> dict[str, str]:
    h = get_headers(_SOURCE)
    h["Accept"] = "application/json"
    return h


# ── Normalization ────────────────────────────────────


def _norm_item(raw: dict[str, Any], raw_type: str) -> dict[str, Any]:
    """Normalize a list item to stable snake_case fields."""
    return {
        "id": raw.get("id", ""),
        "slug": raw.get("slug", ""),
        "ticker": raw.get("ticker", ""),
        "industry": raw.get("industry", ""),
        "title": raw.get("news_title", ""),
        "short_content": raw.get("news_short_content", ""),
        "source_link": raw.get("news_source_link", ""),
        "image_url": raw.get("news_image_url", ""),
        "update_date": raw.get("update_date", ""),
        "source": raw.get("news_from", ""),
        "source_name": raw.get("news_from_name", ""),
        "sentiment": raw.get("sentiment", ""),
        "score": raw.get("score", 0),
        "topic_name": raw.get("topic_name", ""),
        "male_audio_duration": raw.get("male_audio_duration", 0),
        "female_audio_duration": raw.get("female_audio_duration", 0),
        "raw_type": raw_type,
    }


def _strip_html(html: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def _norm_detail(raw: dict[str, Any]) -> dict[str, Any]:
    base = _norm_item(raw, raw.get("news_type", "unknown"))
    html = raw.get("news_full_content", "")
    base.update({
        "company_name": raw.get("company_name", ""),
        "summary": raw.get("summary", ""),
        "highlight_position": raw.get("highlight_position", ""),
        "news_full_content_html": html,
        "news_full_content_text": _strip_html(html) if html else "",
        "file_attachments": raw.get("file_attachment", []),
        "news_type": raw.get("news_type", ""),
    })
    return base


def _build_list_params(
    *,
    page: int = 1,
    page_size: int = 20,
    ticker: str = "",
    industry: str = "",
    topic: str = "",
    source: str = "",
    sentiment: str = "",
    update_from: str = "",
    update_to: str = "",
    language: str = "vi",
) -> dict[str, str | int]:
    params: dict[str, str | int] = {
        "page": page,
        "page_size": page_size,
        "language": language,
    }
    if ticker:
        params["ticker"] = ticker
    if industry:
        params["industry"] = industry
    if topic:
        params["topic"] = topic
    if source:
        params["newsfrom"] = source
    if sentiment:
        params["sentiment"] = sentiment
    if update_from:
        params["update_from"] = update_from
    if update_to:
        params["update_to"] = update_to
    return params


# ── List ─────────────────────────────────────────────

_KIND_MAP = {
    "business": "/api/v3/news_info",
    "topic": "/api/v3/topics_info",
    "exchange": "/api/v3/xnews_info",
}


async def fetch_news_list(
    kind: str,
    **kwargs: Any,
) -> tuple[list[dict[str, Any]], int, str]:
    """Fetch news list by kind. Returns (items, total_records, url).

    Raises:
        ValueError: invalid kind
        AINewsUpstreamShapeError: missing required keys
        AINewsUpstreamError: transport failure
    """
    path = _KIND_MAP.get(kind)
    if path is None:
        raise ValueError(f"Invalid news kind: {kind}")

    params = _build_list_params(**kwargs)
    url = f"{_BASE}{path}"

    try:
        data = await fetch_json(url, params=params, headers=_ai_headers())
    except Exception as exc:
        raise AINewsUpstreamError(f"Failed to fetch {kind} news: {exc}") from exc

    if not isinstance(data, dict):
        raise AINewsUpstreamShapeError(
            f"Expected dict from {url}, got {type(data).__name__}",
        )
    if "news_info" not in data:
        raise AINewsUpstreamShapeError(
            f"Missing required key 'news_info' from {url}",
        )
    raw_items = data["news_info"]
    if not isinstance(raw_items, list):
        raise AINewsUpstreamShapeError(
            f"'news_info' is {type(raw_items).__name__}, expected list",
        )

    total = data.get("total_records", 0)
    # Validate every item is a dict before normalization
    for i, r in enumerate(raw_items):
        if not isinstance(r, dict):
            raise AINewsUpstreamShapeError(
                f"news_info[{i}] is {type(r).__name__}, expected dict",
            )
    items = [_norm_item(r, kind) for r in raw_items]
    return items, total, url


# ── Detail ───────────────────────────────────────────


async def fetch_news_detail(
    slug: str, language: str = "vi",
) -> tuple[dict[str, Any], str]:
    """Fetch detail by slug. Raises AINewsNotFoundError or shape/upstream."""
    url = f"{_BASE}/api/v3/news_from_slug"
    params = {"slug": slug, "language": language}

    try:
        data = await fetch_json(url, params=params, headers=_ai_headers())
    except Exception as exc:
        raise AINewsUpstreamError(
            f"Failed to fetch detail for slug={slug}: {exc}",
        ) from exc

    if not isinstance(data, dict):
        raise AINewsUpstreamShapeError(
            f"Detail response is {type(data).__name__}, expected dict",
        )
    if not data.get("id"):
        raise AINewsNotFoundError(f"No detail found for slug='{slug}'")

    return _norm_detail(data), url


# ── Audio ────────────────────────────────────────────


async def fetch_audio(
    news_id: str,
) -> tuple[dict[str, Any], str]:
    """Fetch audio URLs by news id."""
    url = f"{_BASE}/api/audio_from_id"
    params = {"id": news_id}

    try:
        data = await fetch_json(url, params=params, headers=_ai_headers())
    except Exception as exc:
        raise AINewsUpstreamError(
            f"Failed to fetch audio for id={news_id}: {exc}",
        ) from exc

    if not isinstance(data, dict):
        raise AINewsUpstreamShapeError(
            f"Audio response is {type(data).__name__}, expected dict",
        )
    if "male" not in data and "female" not in data:
        raise AINewsNotFoundError(
            f"No audio found for id='{news_id}'",
        )

    return {
        "male_url": data.get("male", ""),
        "female_url": data.get("female", ""),
    }, url


# ── Catalogs ─────────────────────────────────────────


async def fetch_catalogs(
    language: str = "vi",
) -> tuple[dict[str, Any], list[str]]:
    """Fetch catalogs. Returns (data, urls).

    Partial failures are recorded in warnings; caller decides how to surface.
    Returns: (result_dict_with_warnings, fetched_urls)
    """
    results: dict[str, Any] = {}
    warnings: list[str] = []
    urls: list[str] = []

    # Topics
    try:
        url = f"{_BASE}/api/v3/topics_all"
        data = await fetch_json(
            url, params={"language": language}, headers=_ai_headers(),
        )
        if not isinstance(data, dict) or "static_topic" not in data:
            raise AINewsUpstreamShapeError("topics_all: missing static_topic")
        topics = data["static_topic"]
        results["topics"] = [
            {"name": t.get("name", ""), "key": t.get("key", "")}
            for t in topics
        ]
        urls.append(url)
    except Exception as exc:
        logger.warning("Failed to fetch topics: %s", exc)
        results["topics"] = []
        warnings.append(f"topics: {exc}")

    # Sources
    try:
        url = f"{_BASE}/api/v3/get_source_info"
        data = await fetch_json(
            url, params={"language": language}, headers=_ai_headers(),
        )
        if not isinstance(data, list):
            raise AINewsUpstreamShapeError("get_source_info: expected list")
        results["sources"] = [
            {
                "name": s.get("viName", s.get("enName", "")),
                "value": s.get("value", ""),
            }
            for s in data
        ]
        urls.append(url)
    except Exception as exc:
        logger.warning("Failed to fetch sources: %s", exc)
        results["sources"] = []
        warnings.append(f"sources: {exc}")

    # Industries
    try:
        url = f"{_BASE}/api/get_industry_info"
        data = await fetch_json(url, headers=_ai_headers())
        if not isinstance(data, list):
            raise AINewsUpstreamShapeError("get_industry_info: expected list")
        results["industries"] = [
            {
                "name": i.get("viName", i.get("enName", "")),
                "value": i.get("value", ""),
            }
            for i in data
        ]
        urls.append(url)
    except Exception as exc:
        logger.warning("Failed to fetch industries: %s", exc)
        results["industries"] = []
        warnings.append(f"industries: {exc}")

    # Top tickers
    try:
        url = f"{_BASE}/api/v2/get_top_tickers"
        data = await fetch_json(
            url,
            params={
                "industry": "", "group": "hose",
                "top_neg": "5", "top_pos": "5",
            },
            headers=_ai_headers(),
        )
        if not isinstance(data, dict) or "ticker_info" not in data:
            raise AINewsUpstreamShapeError("get_top_tickers: missing ticker_info")
        results["top_tickers"] = [
            {
                "ticker": t.get("ticker", ""),
                "score": t.get("score", 0),
                "sentiment": t.get("sentiment", ""),
                "company_name": t.get("organ_name", ""),
                "logo": t.get("logo", ""),
            }
            for t in data["ticker_info"]
        ]
        urls.append(url)
    except Exception as exc:
        logger.warning("Failed to fetch top tickers: %s", exc)
        results["top_tickers"] = []
        warnings.append(f"top_tickers: {exc}")

    available = [k for k in ("topics", "sources", "industries", "top_tickers")
                 if results.get(k)]
    results["partial"] = len(warnings) > 0
    results["available_sections"] = available
    results["warnings"] = warnings
    return results, urls


# ── Ticker sentiment ─────────────────────────────────


async def fetch_ticker_sentiment(
    symbol: str, language: str = "vi",
) -> tuple[dict[str, Any], str]:
    """Fetch ticker sentiment. Raises upstream errors, never silently empty."""
    url = f"{_BASE}/api/v3/ticker_score"
    params = {
        "ticker": symbol.upper(),
        "industry": "", "group": "",
        "summary": "false", "language": language,
    }

    try:
        data = await fetch_json(url, params=params, headers=_ai_headers())
    except Exception as exc:
        raise AINewsUpstreamError(
            f"Failed to fetch ticker_score for {symbol}: {exc}",
        ) from exc

    if not isinstance(data, dict):
        raise AINewsUpstreamShapeError(
            f"ticker_score response is {type(data).__name__}, expected dict",
        )

    if "ticker_info" not in data:
        raise AINewsUpstreamShapeError(
            "Missing required key 'ticker_info' in ticker_score response",
        )
    ticker_info = data["ticker_info"]
    if not isinstance(ticker_info, list):
        raise AINewsUpstreamShapeError(
            f"'ticker_info' is {type(ticker_info).__name__}, expected list",
        )
    if not ticker_info:
        return {
            "ticker": symbol.upper(), "score": 0,
            "sentiment": "", "news_count": 0,
        }, url

    t = ticker_info[0]
    if not isinstance(t, dict):
        raise AINewsUpstreamShapeError(
            f"ticker_info[0] is {type(t).__name__}, expected dict",
        )
    return {
        "ticker": t.get("ticker", symbol.upper()),
        "score": t.get("score", 0),
        "sentiment": t.get("sentiment", ""),
        "news_count": t.get("cnt_news", 0),
        "count_positive": t.get("count_pos", 0),
        "count_neutral": t.get("count_neu", 0),
        "count_negative": t.get("count_neg", 0),
        "company_name": t.get("organ_name", ""),
        "logo": t.get("logo", ""),
        "summaries": t.get("extractive_summaries", []),
        "summary_sentiments": t.get("extractive_sentiments", []),
    }, url

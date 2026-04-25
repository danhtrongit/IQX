"""Market data API endpoints.

Single unified router at /api/v1/market-data covering reference data,
quotes, trading, company info, fundamentals, analytics, macro, funds, and news.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query

from app.services.market_data.fallback import fetch_with_fallback
from app.services.market_data.schemas import MarketDataResponse
from app.services.market_data.sources import fmarket, kbs, mbk, news, spl, vietcap, vndirect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market-data", tags=["Market Data"])

# Valid intervals for OHLCV
_VALID_INTERVALS = {"1m", "5m", "15m", "30m", "1H", "1D", "1W", "1M"}


# ══════════════════════════════════════════════════════
# 1. Reference Data
# ══════════════════════════════════════════════════════


@router.get("/reference/symbols", response_model=MarketDataResponse)
async def list_symbols(
    exchange: Annotated[str | None, Query(description="Filter by exchange: HOSE, HNX, UPCOM")] = None,
    asset_type: Annotated[str | None, Query(description="Filter by type: stock, etf, etc.")] = None,
    source: Annotated[str | None, Query(description="Force source: VCI or VND")] = None,
) -> MarketDataResponse:
    """List all symbols with optional exchange/type filter. Supports VCI (primary) and VND (fallback)."""

    async def _vci() -> tuple[Any, str]:
        data, url = await vietcap.fetch_symbols_by_exchange()
        return _filter_symbols(data, exchange, asset_type), url

    async def _vnd() -> tuple[Any, str]:
        ex = exchange or "HOSE,HNX,UPCOM"
        data, url = await vndirect.fetch_symbols(exchange=ex)
        return _filter_symbols(data, exchange, asset_type), url

    sources: list[tuple[str, Any]] = []
    if source and source.upper() == "VND":
        sources = [("VND", _vnd)]
    elif source and source.upper() == "VCI":
        sources = [("VCI", _vci)]
    else:
        sources = [("VCI", _vci), ("VND", _vnd)]

    try:
        return await fetch_with_fallback(sources)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/reference/industries", response_model=MarketDataResponse)
async def list_industries(
    source: Annotated[str | None, Query(description="Force source: VCI")] = None,
) -> MarketDataResponse:
    """List ICB industry classifications."""

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_industries_icb()

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/reference/indices", response_model=MarketDataResponse)
async def list_indices(
    group: Annotated[str | None, Query(description="Filter group: e.g. HOSE, HNX")] = None,
) -> MarketDataResponse:
    """List available market indices (static mapping from VCI)."""
    from app.services.market_data.schemas import MarketDataMeta

    indices = [
        {"code": "VNINDEX", "name": "VN-Index", "exchange": "HOSE"},
        {"code": "HNXIndex", "name": "HNX-Index", "exchange": "HNX"},
        {"code": "UPCOMIndex", "name": "UPCOM-Index", "exchange": "UPCOM"},
        {"code": "VN30", "name": "VN30", "exchange": "HOSE"},
        {"code": "VN100", "name": "VN100", "exchange": "HOSE"},
        {"code": "VNMID", "name": "VN Mid Cap", "exchange": "HOSE"},
        {"code": "VNSML", "name": "VN Small Cap", "exchange": "HOSE"},
        {"code": "VNALL", "name": "VN All Share", "exchange": "HOSE"},
        {"code": "HNX30", "name": "HNX30", "exchange": "HNX"},
    ]

    if group:
        indices = [i for i in indices if i["exchange"] == group.upper()]

    return MarketDataResponse(
        data=indices,
        meta=MarketDataMeta(
            source="STATIC",
            source_priority=1,
            fallback_used=False,
            as_of=datetime.now(UTC),
            raw_endpoint="static_mapping",
        ),
    )


@router.get("/reference/groups/{group}/symbols", response_model=MarketDataResponse)
async def list_group_symbols(
    group: str,
    source: Annotated[str | None, Query(description="Force source: VCI")] = None,
) -> MarketDataResponse:
    """List symbols in a specific index group (e.g. VN30, HOSE, ETF)."""
    if group not in vietcap.VALID_GROUPS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid group '{group}'. Valid: {sorted(vietcap.VALID_GROUPS)}",
        )

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_symbols_by_group(group)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 2. Quotes & Trading
# ══════════════════════════════════════════════════════


@router.get("/quotes/{symbol}/ohlcv", response_model=MarketDataResponse)
async def get_ohlcv(
    symbol: str,
    start: Annotated[str | None, Query(description="Start date YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="End date YYYY-MM-DD")] = None,
    interval: Annotated[str, Query(description="Candle interval: 1m,5m,15m,30m,1H,1D,1W,1M")] = "1D",
    source: Annotated[str | None, Query(description="Force source: VND, VCI, auto")] = None,
) -> MarketDataResponse:
    """Get OHLCV candlestick data for a symbol."""
    symbol = symbol.upper()

    if interval not in _VALID_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid interval '{interval}'. Valid: {sorted(_VALID_INTERVALS)}",
        )

    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    # Parse dates to timestamps
    now = datetime.now(UTC)
    end_ts = int(now.timestamp())
    start_ts = int((now.replace(year=now.year - 1)).timestamp())

    if end:
        try:
            end_dt = datetime.strptime(end, "%Y-%m-%d").replace(tzinfo=UTC)
            end_ts = int(end_dt.timestamp())
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid end date: {end}") from None

    if start:
        try:
            start_dt = datetime.strptime(start, "%Y-%m-%d").replace(tzinfo=UTC)
            start_ts = int(start_dt.timestamp())
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid start date: {start}") from None

    async def _vnd() -> tuple[Any, str]:
        return await vndirect.fetch_ohlcv(
            symbol, start_ts=start_ts, end_ts=end_ts, interval=interval
        )

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_ohlcv(
            symbol, start_ts=start_ts, end_ts=end_ts, interval=interval
        )

    # VND is primary for OHLCV (simpler public chart API), VCI fallback
    src = (source or "auto").upper()
    sources: list[tuple[str, Any]] = []
    if src == "VCI":
        sources = [("VCI", _vci)]
    elif src == "VND":
        sources = [("VND", _vnd)]
    else:
        sources = [("VND", _vnd), ("VCI", _vci)]

    try:
        return await fetch_with_fallback(sources)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/quotes/{symbol}/intraday", response_model=MarketDataResponse)
async def get_intraday(
    symbol: str,
    page_size: Annotated[int, Query(ge=1, le=30000)] = 100,
    source: Annotated[str | None, Query()] = None,
) -> MarketDataResponse:
    """Get intraday tick data for a symbol."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_intraday(symbol, page_size=page_size)

    try:
        return await fetch_with_fallback([("VCI", _vci)], allow_empty=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/quotes/{symbol}/price-depth", response_model=MarketDataResponse)
async def get_price_depth(
    symbol: str,
    source: Annotated[str | None, Query()] = None,
) -> MarketDataResponse:
    """Get accumulated price-step volume data for a symbol."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_price_depth(symbol)

    try:
        return await fetch_with_fallback([("VCI", _vci)], allow_empty=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/trading/price-board", response_model=MarketDataResponse)
async def get_price_board(
    body: dict[str, Any],
) -> MarketDataResponse:
    """Get realtime price board for a list of symbols.

    Body: `{"symbols": ["VCB", "FPT"], "source": "auto"}`
    """
    symbols = body.get("symbols", [])
    if not symbols or not isinstance(symbols, list):
        raise HTTPException(status_code=422, detail="symbols must be a non-empty list")

    if len(symbols) > 50:
        raise HTTPException(status_code=422, detail="Maximum 50 symbols per request")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_price_board(symbols)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 5. Analytics / Insights
# ══════════════════════════════════════════════════════


@router.get("/insights/ranking/{kind}", response_model=MarketDataResponse)
async def get_ranking(
    kind: str,
    index: Annotated[str, Query(description="Market index: VNINDEX, HNX, VN30")] = "VNINDEX",
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    date: Annotated[str | None, Query(description="Trading date for foreign-buy/sell (YYYY-MM-DD)")] = None,
) -> MarketDataResponse:
    """Get stock ranking by kind: gainer, loser, value, volume, deal, foreign-buy, foreign-sell."""
    valid_kinds = {"gainer", "loser", "value", "volume", "deal", "foreign-buy", "foreign-sell"}
    if kind not in valid_kinds:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid kind '{kind}'. Valid: {sorted(valid_kinds)}",
        )

    async def _vnd() -> tuple[Any, str]:
        return await vndirect.fetch_top_stocks(kind, index=index, limit=limit, date=date)

    try:
        return await fetch_with_fallback([("VND", _vnd)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 3. Company  (Primary: KBS)
#
# Data sourced from KB Securities (KBS) profile API.
# One profile request returns overview, shareholders,
# officers, and subsidiaries.  News uses a separate endpoint.
#
# Note: the /company/{symbol}/events endpoint has been
# removed because the KBS events API consistently returns
# empty data for most symbols, and VCI GraphQL is down.
# ══════════════════════════════════════════════════════


@router.get("/company/{symbol}/overview", response_model=MarketDataResponse)
async def get_company_overview(symbol: str) -> MarketDataResponse:
    """Get company overview information from KBS."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _kbs() -> tuple[Any, str]:
        raw, url = await kbs.fetch_company_profile(symbol)
        return kbs.normalize_overview(raw), url

    try:
        return await fetch_with_fallback([("KBS", _kbs)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/company/{symbol}/shareholders", response_model=MarketDataResponse)
async def get_shareholders(symbol: str) -> MarketDataResponse:
    """Get company shareholders from KBS."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _kbs() -> tuple[Any, str]:
        raw, url = await kbs.fetch_company_profile(symbol)
        return kbs.normalize_shareholders(raw), url

    try:
        return await fetch_with_fallback([("KBS", _kbs)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/company/{symbol}/officers", response_model=MarketDataResponse)
async def get_officers(symbol: str) -> MarketDataResponse:
    """Get company officers/managers from KBS."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _kbs() -> tuple[Any, str]:
        raw, url = await kbs.fetch_company_profile(symbol)
        return kbs.normalize_officers(raw), url

    try:
        return await fetch_with_fallback([("KBS", _kbs)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/company/{symbol}/subsidiaries", response_model=MarketDataResponse)
async def get_subsidiaries(symbol: str) -> MarketDataResponse:
    """Get company subsidiaries from KBS."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _kbs() -> tuple[Any, str]:
        raw, url = await kbs.fetch_company_profile(symbol)
        return kbs.normalize_subsidiaries(raw), url

    try:
        return await fetch_with_fallback([("KBS", _kbs)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/company/{symbol}/news", response_model=MarketDataResponse)
async def get_company_news(symbol: str) -> MarketDataResponse:
    """Get company-related news from KBS."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _kbs() -> tuple[Any, str]:
        return await kbs.fetch_company_news(symbol)

    try:
        return await fetch_with_fallback([("KBS", _kbs)], allow_empty=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 4. Fundamentals
# ══════════════════════════════════════════════════════

_VALID_REPORT_TYPES = {"balance_sheet", "income_statement", "cash_flow", "ratio"}


@router.get("/fundamentals/{symbol}/{report_type}", response_model=MarketDataResponse)
async def get_financial_report(
    symbol: str,
    report_type: str,
) -> MarketDataResponse:
    """Get financial report: balance_sheet, income_statement, cash_flow, ratio."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")
    if report_type not in _VALID_REPORT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid report_type '{report_type}'. Valid: {sorted(_VALID_REPORT_TYPES)}",
        )

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_financial_report(symbol, report_type=report_type)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 6. Trading details
# ══════════════════════════════════════════════════════


@router.get("/trading/{symbol}/foreign-trade", response_model=MarketDataResponse)
async def get_foreign_trade(
    symbol: str,
    start: Annotated[str | None, Query(description="Start date YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="End date YYYY-MM-DD")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
) -> MarketDataResponse:
    """Get foreign trade data for a symbol."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_foreign_trade(
            symbol, start=start, end=end, limit=limit
        )

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/trading/{symbol}/insider-deals", response_model=MarketDataResponse)
async def get_insider_deals(
    symbol: str,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
) -> MarketDataResponse:
    """Get insider transaction data for a symbol."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_insider_deals(symbol, limit=limit)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 7. Events calendar
# ══════════════════════════════════════════════════════


@router.get("/events/calendar", response_model=MarketDataResponse)
async def get_events_calendar(
    start: Annotated[str, Query(description="Start date YYYY-MM-DD")],
    end: Annotated[str | None, Query(description="End date YYYY-MM-DD")] = None,
    event_type: Annotated[
        str | None,
        Query(description="Type: dividend, insider, agm, others"),
    ] = None,
) -> MarketDataResponse:
    """Get events calendar (dividends, AGM, new listings, insider trading)."""

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_events_calendar(
            start=start, end=end, event_type=event_type
        )

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 8. Macro Economy
# ══════════════════════════════════════════════════════


@router.get("/macro/economy/{indicator}", response_model=MarketDataResponse)
async def get_macro_data(
    indicator: str,
    start_year: Annotated[int, Query(ge=2000, le=2030)] = 2015,
    end_year: Annotated[int | None, Query(ge=2000, le=2030)] = None,
    period: Annotated[str, Query(description="day, month, quarter, year")] = "quarter",
) -> MarketDataResponse:
    """Get macroeconomic data: gdp, cpi, fdi, exchange_rate, interest_rate, etc."""
    if indicator not in mbk.VALID_INDICATORS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid indicator '{indicator}'. Valid: {sorted(mbk.VALID_INDICATORS)}",
        )

    async def _mbk() -> tuple[Any, str]:
        return await mbk.fetch_macro_data(
            indicator, start_year=start_year, end_year=end_year, period=period
        )

    try:
        return await fetch_with_fallback([("MBK", _mbk)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 9. Funds
# ══════════════════════════════════════════════════════


@router.get("/funds", response_model=MarketDataResponse)
async def list_funds(
    fund_type: Annotated[
        str, Query(description="Fund type: '', BALANCED, BOND, STOCK")
    ] = "",
) -> MarketDataResponse:
    """List all open-end mutual funds."""

    async def _fmk() -> tuple[Any, str]:
        return await fmarket.fetch_fund_listing(fund_type=fund_type)

    try:
        return await fetch_with_fallback([("FMARKET", _fmk)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/funds/{fund_id}", response_model=MarketDataResponse)
async def get_fund_details(
    fund_id: int,
) -> MarketDataResponse:
    """Get fund details: top holdings, industry holdings, asset holdings."""

    async def _fmk() -> tuple[Any, str]:
        return await fmarket.fetch_fund_details(fund_id)

    try:
        return await fetch_with_fallback([("FMARKET", _fmk)])
    except RuntimeError as exc:
        cause = exc.__cause__
        if isinstance(cause, ValueError):
            raise HTTPException(status_code=404, detail=str(cause)) from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/funds/{fund_id}/nav", response_model=MarketDataResponse)
async def get_fund_nav(
    fund_id: int,
) -> MarketDataResponse:
    """Get NAV history for a fund."""

    async def _fmk() -> tuple[Any, str]:
        return await fmarket.fetch_fund_nav_history(fund_id)

    try:
        return await fetch_with_fallback([("FMARKET", _fmk)])
    except RuntimeError as exc:
        cause = exc.__cause__
        if isinstance(cause, ValueError):
            raise HTTPException(status_code=404, detail=str(cause)) from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 10. Commodities
# ══════════════════════════════════════════════════════


@router.get("/macro/commodities", response_model=MarketDataResponse)
async def list_commodities() -> MarketDataResponse:
    """List all available commodity codes."""
    from app.services.market_data.schemas import MarketDataMeta

    return MarketDataResponse(
        data=spl.list_commodities(),
        meta=MarketDataMeta(
            source="SPL",
            source_priority=1,
            fallback_used=False,
            as_of=datetime.now(UTC),
            raw_endpoint="static_mapping",
        ),
    )


@router.get("/macro/commodities/{code}", response_model=MarketDataResponse)
async def get_commodity_price(
    code: str,
    start: Annotated[str | None, Query(description="Start date YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="End date YYYY-MM-DD")] = None,
    interval: Annotated[str, Query(description="Interval: 1d, 1h, 1m")] = "1d",
) -> MarketDataResponse:
    """Get commodity price history."""
    if code not in spl.VALID_COMMODITIES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid commodity '{code}'. Valid: {sorted(spl.VALID_COMMODITIES)}",
        )

    async def _spl() -> tuple[Any, str]:
        return await spl.fetch_commodity_price(
            code, start=start, end=end, interval=interval
        )

    try:
        return await fetch_with_fallback([("SPL", _spl)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 11. News
# ══════════════════════════════════════════════════════


@router.get("/news/latest", response_model=MarketDataResponse)
async def get_latest_news(
    sites: Annotated[
        str | None,
        Query(description="Comma-separated sites: vnexpress,tuoitre,cafebiz,..."),
    ] = None,
    max_per_site: Annotated[int, Query(ge=1, le=100)] = 20,
) -> MarketDataResponse:
    """Get latest financial news from Vietnamese RSS feeds."""
    site_list = [s.strip() for s in sites.split(",")] if sites else None

    async def _rss() -> tuple[Any, str]:
        return await news.fetch_rss_news(sites=site_list, max_per_site=max_per_site)

    try:
        return await fetch_with_fallback([("RSS", _rss)], allow_empty=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/news/sources", response_model=MarketDataResponse)
async def list_news_sources() -> MarketDataResponse:
    """List available news sources and their RSS feed URLs."""
    from app.services.market_data.schemas import MarketDataMeta

    sources = [
        {"site": site, "feeds": feeds}
        for site, feeds in news.RSS_FEEDS.items()
    ]

    return MarketDataResponse(
        data=sources,
        meta=MarketDataMeta(
            source="STATIC",
            source_priority=1,
            fallback_used=False,
            as_of=datetime.now(UTC),
            raw_endpoint="static_mapping",
        ),
    )


# ══════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════


def _validate_symbol(symbol: str) -> bool:
    """Basic symbol validation: 1-10 uppercase alphanumeric chars."""
    import re

    return bool(re.match(r"^[A-Z0-9]{1,10}$", symbol))


def _filter_symbols(
    records: list[dict[str, Any]],
    exchange: str | None,
    asset_type: str | None,
) -> list[dict[str, Any]]:
    """Filter symbol records by exchange and asset_type."""
    result = records
    if exchange:
        ex_upper = exchange.upper()
        result = [r for r in result if (r.get("exchange") or "").upper() == ex_upper]
    if asset_type:
        at_lower = asset_type.lower()
        result = [r for r in result if (r.get("asset_type") or "") == at_lower]
    return result

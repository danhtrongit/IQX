"""Market data API endpoints.

Single unified router at /api/v1/market-data covering reference data,
quotes, trading, company info, fundamentals, analytics, macro, funds, and news.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field, field_validator

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.services.market_data.fallback import fetch_with_fallback
from app.services.market_data.schemas import MarketDataResponse
from app.services.market_data.sources import fmarket, kbs, mbk, news, spl, vietcap, vndirect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market-data", tags=["Market Data"])

_MARKET_DATA_LIMIT = get_settings().RATE_LIMIT_MARKET_DATA

# Valid intervals for OHLCV
_VALID_INTERVALS = {"1m", "5m", "15m", "30m", "1H", "1D", "1W", "1M"}

# Symbol pattern for validation
_SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]{1,10}$")


# ── Request schemas ──────────────────────────────────


class PriceBoardRequest(BaseModel):
    """Validated request body for POST /trading/price-board."""

    symbols: list[str] = Field(
        ..., min_length=1, max_length=50,
        description="List of stock symbols (1-50)",
    )
    source: str = Field(
        "auto",
        pattern=r"^(auto|VCI|VND)$",
        description="Data source: auto, VCI, or VND",
    )

    @field_validator("symbols", mode="before")
    @classmethod
    def _validate_symbols(cls, v: Any) -> list[str]:
        if not isinstance(v, list):
            raise ValueError("symbols must be a list")
        result = []
        for i, item in enumerate(v):
            if not isinstance(item, str):
                raise ValueError(f"symbols[{i}] must be a string, got {type(item).__name__}")
            upper = item.strip().upper()
            if not _SYMBOL_PATTERN.match(upper):
                raise ValueError(
                    f"symbols[{i}]='{item}' is invalid. "
                    f"Each symbol must be 1-10 uppercase alphanumeric characters."
                )
            result.append(upper)
        return result


# ══════════════════════════════════════════════════════
# 1. Reference Data
# ══════════════════════════════════════════════════════


@router.get("/reference/symbols", tags=["Market Data: Reference"], response_model=MarketDataResponse)
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


@router.get("/reference/industries", tags=["Market Data: Reference"], response_model=MarketDataResponse)
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


@router.get("/reference/indices", tags=["Market Data: Reference"], response_model=MarketDataResponse)
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


@router.get("/reference/groups/{group}/symbols", tags=["Market Data: Reference"], response_model=MarketDataResponse)
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


@router.get("/quotes/{symbol}/ohlcv", tags=["Market Data: Quotes"], response_model=MarketDataResponse)
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


@router.get("/quotes/{symbol}/intraday", tags=["Market Data: Quotes"], response_model=MarketDataResponse)
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


@router.get("/quotes/{symbol}/price-depth", tags=["Market Data: Quotes"], response_model=MarketDataResponse)
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


@router.post("/trading/price-board", tags=["Market Data: Trading"], response_model=MarketDataResponse)
@limiter.limit(_MARKET_DATA_LIMIT)
async def get_price_board(
    request: Request,
    body: PriceBoardRequest,
) -> MarketDataResponse:
    """Get realtime price board for a list of symbols.

    Body: `{"symbols": ["VCB", "FPT"], "source": "auto"}`
    """
    symbols = body.symbols

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_price_board(symbols)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 5. Analytics / Insights
# ══════════════════════════════════════════════════════


@router.get("/insights/ranking/{kind}", tags=["Market Data: Insights"], response_model=MarketDataResponse)
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


@router.get("/company/{symbol}/overview", tags=["Market Data: Company"], response_model=MarketDataResponse)
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


@router.get("/company/{symbol}/shareholders", tags=["Market Data: Company"], response_model=MarketDataResponse)
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


@router.get("/company/{symbol}/officers", tags=["Market Data: Company"], response_model=MarketDataResponse)
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


@router.get("/company/{symbol}/subsidiaries", tags=["Market Data: Company"], response_model=MarketDataResponse)
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


@router.get("/company/{symbol}/news", tags=["Market Data: Company"], response_model=MarketDataResponse)
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


@router.get(
    "/fundamentals/{symbol}/{report_type}", tags=["Market Data: Fundamentals"], response_model=MarketDataResponse
)
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


@router.get("/trading/{symbol}/foreign-trade", tags=["Market Data: Trading"], response_model=MarketDataResponse)
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


@router.get("/trading/{symbol}/insider-deals", tags=["Market Data: Trading"], response_model=MarketDataResponse)
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


_VALID_TIMEFRAME_STATS = {"1D", "1W", "1M", "1Q", "1Y"}
_VALID_YYYYMMDD = re.compile(r"^\d{8}$")


def _validate_yyyymmdd(v: str | None, name: str) -> str | None:
    """Validate YYYYMMDD date parameter."""
    if v is None:
        return None
    if not _VALID_YYYYMMDD.match(v):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {name}: '{v}'. Must be YYYYMMDD (e.g. 20260425).",
        )
    return v


@router.get("/trading/{symbol}/proprietary", tags=["Market Data: Trading"], response_model=MarketDataResponse)
async def get_proprietary_history(
    symbol: str,
    resolution: Annotated[str, Query(description="1D, 1W, 1M, 1Q, 1Y")] = "1D",
    from_date: Annotated[str | None, Query(alias="fromDate", description="YYYYMMDD")] = None,
    to_date: Annotated[str | None, Query(alias="toDate", description="YYYYMMDD")] = None,
    page: Annotated[int, Query(ge=0, le=1000)] = 0,
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> MarketDataResponse:
    """Get proprietary trading history for a company."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")
    if resolution not in _VALID_TIMEFRAME_STATS:
        raise HTTPException(status_code=422, detail=f"Invalid resolution: {resolution}")
    _validate_yyyymmdd(from_date, "fromDate")
    _validate_yyyymmdd(to_date, "toDate")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_proprietary_history(
            symbol, resolution=resolution, start=from_date, end=to_date,
            page=page, size=size,
        )

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/trading/{symbol}/proprietary/summary", tags=["Market Data: Trading"], response_model=MarketDataResponse)
async def get_proprietary_summary(
    symbol: str,
    resolution: Annotated[str, Query(description="1D, 1W, 1M, 1Q, 1Y")] = "1D",
    from_date: Annotated[str | None, Query(alias="fromDate", description="YYYYMMDD")] = None,
    to_date: Annotated[str | None, Query(alias="toDate", description="YYYYMMDD")] = None,
) -> MarketDataResponse:
    """Get proprietary trading summary for a company."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")
    if resolution not in _VALID_TIMEFRAME_STATS:
        raise HTTPException(status_code=422, detail=f"Invalid resolution: {resolution}")
    _validate_yyyymmdd(from_date, "fromDate")
    _validate_yyyymmdd(to_date, "toDate")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_proprietary_summary(
            symbol, resolution=resolution, start=from_date, end=to_date,
        )

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/company/{symbol}/details", tags=["Market Data: Company"], response_model=MarketDataResponse)
async def get_company_details(
    symbol: str,
) -> MarketDataResponse:
    """Get company details from VCI IQ Insight (sector, exchange, name)."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_company_details(symbol)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/company/{symbol}/price-chart", tags=["Market Data: Company"], response_model=MarketDataResponse)
async def get_company_price_chart(
    symbol: str,
    length: Annotated[int, Query(ge=1, le=3650, description="Number of data points")] = 365,
) -> MarketDataResponse:
    """Get adjusted OHLC price chart data from VCI IQ Insight."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")

    async def _vci() -> tuple[Any, str]:
        return await vietcap.fetch_price_chart(symbol, length=length)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# 7. Events calendar
# ══════════════════════════════════════════════════════


@router.get("/events/calendar", tags=["Market Data: Events"], response_model=MarketDataResponse)
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


@router.get("/macro/economy/{indicator}", tags=["Market Data: Macro"], response_model=MarketDataResponse)
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


@router.get("/funds", tags=["Market Data: Funds"], response_model=MarketDataResponse)
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


@router.get("/funds/{fund_id}", tags=["Market Data: Funds"], response_model=MarketDataResponse)
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


@router.get("/funds/{fund_id}/nav", tags=["Market Data: Funds"], response_model=MarketDataResponse)
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


@router.get("/macro/commodities", tags=["Market Data: Macro"], response_model=MarketDataResponse)
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


@router.get("/macro/commodities/{code}", tags=["Market Data: Macro"], response_model=MarketDataResponse)
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


@router.get("/news/latest", tags=["Market Data: News"], response_model=MarketDataResponse)
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


@router.get("/news/sources", tags=["Market Data: News"], response_model=MarketDataResponse)
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
# 11b. Market Overview (Vietcap)
# ══════════════════════════════════════════════════════


def _validate_overview_enum(val: str, valid: set[str], name: str) -> None:
    if val not in valid:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {name}='{val}'. Valid: {', '.join(sorted(valid))}",
        )


@router.get("/overview/liquidity", tags=["Market Data: Overview"])
async def get_liquidity(
    symbols: Annotated[str, Query(description="ALL, VNINDEX, HNXIndex, HNXUpcomIndex")] = "ALL",
    time_frame: Annotated[str, Query(description="ONE_MINUTE, ONE_DAY, etc")] = "ONE_MINUTE",
    from_ts: Annotated[int | None, Query(description="Unix epoch seconds")] = None,
    to_ts: Annotated[int | None, Query(description="Unix epoch seconds")] = None,
) -> dict[str, Any]:
    """Fetch liquidity data. Units: accumulatedValue = million VND."""
    from app.services.market_data.sources.vietcap_market_overview import (
        LIQUIDITY_SYMBOLS,
        TIME_FRAMES_LIQUIDITY,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_liquidity,
    )
    _validate_overview_enum(symbols, LIQUIDITY_SYMBOLS, "symbols")
    _validate_overview_enum(time_frame, TIME_FRAMES_LIQUIDITY, "time_frame")
    try:
        data, url = await fetch_liquidity(
            symbols=symbols, time_frame=time_frame,
            from_ts=from_ts, to_ts=to_ts,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/index-impact", tags=["Market Data: Overview"])
async def get_index_impact(
    group: Annotated[str, Query()] = "ALL",
    time_frame: Annotated[str, Query()] = "ONE_DAY",
) -> dict[str, Any]:
    """Top stocks impacting index. Units: impact = index points."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        TIME_FRAMES_IMPACT,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_index_impact,
    )
    _validate_overview_enum(group, GROUPS, "group")
    _validate_overview_enum(time_frame, TIME_FRAMES_IMPACT, "time_frame")
    try:
        data, url = await fetch_index_impact(group=group, time_frame=time_frame)
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/foreign", tags=["Market Data: Overview"])
async def get_foreign(
    group: Annotated[str, Query()] = "ALL",
    time_frame: Annotated[str, Query()] = "ONE_MONTH",
    from_ts: Annotated[int | None, Query()] = None,
    to_ts: Annotated[int | None, Query()] = None,
) -> dict[str, Any]:
    """Foreign buy/sell volume/value. Units: *Value = VND, *Volume = shares."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        TIME_FRAMES_IMPACT,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_foreign,
    )
    _validate_overview_enum(group, GROUPS, "group")
    _validate_overview_enum(time_frame, TIME_FRAMES_IMPACT, "time_frame")
    try:
        data, url = await fetch_foreign(
            group=group, time_frame=time_frame, from_ts=from_ts, to_ts=to_ts,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/foreign/top", tags=["Market Data: Overview"])
async def get_foreign_top(
    group: Annotated[str, Query()] = "ALL",
    time_frame: Annotated[str, Query()] = "ONE_YEAR",
    from_ts: Annotated[int | None, Query()] = None,
    to_ts: Annotated[int | None, Query()] = None,
) -> dict[str, Any]:
    """Top foreign net buy/sell stocks. Units: net/value = VND."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        TIME_FRAMES_IMPACT,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_foreign_top,
    )
    _validate_overview_enum(group, GROUPS, "group")
    _validate_overview_enum(time_frame, TIME_FRAMES_IMPACT, "time_frame")
    try:
        data, url = await fetch_foreign_top(
            group=group, time_frame=time_frame, from_ts=from_ts, to_ts=to_ts,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/proprietary", tags=["Market Data: Overview"])
async def get_proprietary(
    market: Annotated[str, Query()] = "ALL",
    time_frame: Annotated[str, Query()] = "ONE_YEAR",
) -> dict[str, Any]:
    """Proprietary trading data. Units: *Value = VND, *Volume = shares."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        TIME_FRAMES_IMPACT,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_proprietary,
    )
    _validate_overview_enum(market, GROUPS, "market")
    _validate_overview_enum(time_frame, TIME_FRAMES_IMPACT, "time_frame")
    try:
        data, url = await fetch_proprietary(market=market, time_frame=time_frame)
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/proprietary/top", tags=["Market Data: Overview"])
async def get_proprietary_top(
    exchange: Annotated[str, Query()] = "ALL",
    time_frame: Annotated[str, Query()] = "ONE_YEAR",
) -> dict[str, Any]:
    """Top proprietary net buy/sell. Units: totalValue = VND."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        TIME_FRAMES_IMPACT,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_proprietary_top,
    )
    _validate_overview_enum(exchange, GROUPS, "exchange")
    _validate_overview_enum(time_frame, TIME_FRAMES_IMPACT, "time_frame")
    try:
        data, url = await fetch_proprietary_top(
            exchange=exchange, time_frame=time_frame,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/allocation", tags=["Market Data: Overview"])
async def get_allocation(
    group: Annotated[str, Query()] = "ALL",
    time_frame: Annotated[str, Query()] = "ONE_YEAR",
) -> dict[str, Any]:
    """Market allocation (up/down/flat). Units: values = VND."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        TIME_FRAMES_IMPACT,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_allocation,
    )
    _validate_overview_enum(group, GROUPS, "group")
    _validate_overview_enum(time_frame, TIME_FRAMES_IMPACT, "time_frame")
    try:
        data, url = await fetch_allocation(group=group, time_frame=time_frame)
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/sectors/allocation", tags=["Market Data: Overview"])
async def get_sectors_allocation(
    group: Annotated[str, Query()] = "ALL",
    time_frame: Annotated[str, Query()] = "ONE_YEAR",
) -> dict[str, Any]:
    """ICB sector allocation. Units: totalValue = VND."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        TIME_FRAMES_IMPACT,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_sectors_allocation,
    )
    _validate_overview_enum(group, GROUPS, "group")
    _validate_overview_enum(time_frame, TIME_FRAMES_IMPACT, "time_frame")
    try:
        data, url = await fetch_sectors_allocation(
            group=group, time_frame=time_frame,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/valuation", tags=["Market Data: Overview"])
async def get_valuation(
    val_type: Annotated[str, Query(alias="type", description="pe, pb")] = "pe",
    com_group_code: Annotated[str, Query(description="VNINDEX, VN30, etc")] = "VNINDEX",
    time_frame: Annotated[str, Query()] = "ONE_YEAR",
) -> dict[str, Any]:
    """P/E or P/B valuation history. Units: value = ratio."""
    from app.services.market_data.sources.vietcap_market_overview import (
        COM_GROUP_CODES,
        TIME_FRAMES_VALUATION,
        VALUATION_TYPES,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_valuation,
    )
    _validate_overview_enum(val_type, VALUATION_TYPES, "type")
    _validate_overview_enum(com_group_code, COM_GROUP_CODES, "com_group_code")
    _validate_overview_enum(time_frame, TIME_FRAMES_VALUATION, "time_frame")
    try:
        data, url = await fetch_valuation(
            val_type=val_type, com_group_code=com_group_code,
            time_frame=time_frame,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/breadth", tags=["Market Data: Overview"])
async def get_breadth(
    condition: Annotated[str, Query()] = "EMA50",
    exchange: Annotated[str, Query(description="HSX,HNX,UPCOM")] = "HSX,HNX,UPCOM",
    period: Annotated[str, Query(description="M6, YTD, Y1, Y2, Y5, ALL")] = "Y1",
) -> dict[str, Any]:
    """Market breadth. Units: percent = 0-1 ratio."""
    from app.services.market_data.sources.vietcap_market_overview import (
        BREADTH_CONDITIONS,
        BREADTH_PERIODS,
        EXCHANGES_BREADTH,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_breadth,
    )
    _validate_overview_enum(condition, BREADTH_CONDITIONS, "condition")
    _validate_overview_enum(period, BREADTH_PERIODS, "period")
    # Validate each exchange in comma-separated list
    for ex in exchange.split(","):
        _validate_overview_enum(ex.strip(), EXCHANGES_BREADTH, "exchange")
    try:
        data, url = await fetch_breadth(
            condition=condition, exchange=exchange, period=period,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/heatmap", tags=["Market Data: Overview"])
async def get_heatmap(
    group: Annotated[str, Query()] = "ALL",
    sector: Annotated[str, Query(description="icb_code_1..4")] = "icb_code_2",
    size: Annotated[str, Query(description="MKC, VOL, VAL")] = "MKC",
) -> dict[str, Any]:
    """Heatmap by ICB sector. Units: value = million VND, price = VND."""
    from app.services.market_data.sources.vietcap_market_overview import (
        GROUPS,
        HEATMAP_SECTORS,
        HEATMAP_SIZES,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_heatmap,
    )
    _validate_overview_enum(group, GROUPS, "group")
    _validate_overview_enum(sector, HEATMAP_SECTORS, "sector")
    _validate_overview_enum(size, HEATMAP_SIZES, "size")
    try:
        data, url = await fetch_heatmap(group=group, sector=sector, size=size)
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/heatmap/index", tags=["Market Data: Overview"])
async def get_heatmap_index() -> dict[str, Any]:
    """Heatmap index summary. Units: value = million VND."""
    from app.services.market_data.sources.vietcap_market_overview import (
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_heatmap_index,
    )
    try:
        data, url = await fetch_heatmap_index()
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


# ══════════════════════════════════════════════════════
# 11b. Overview Supplement
# ══════════════════════════════════════════════════════


@router.get("/overview/sectors/detail", tags=["Market Data: Overview"])
async def get_sector_detail(
    icb_code: Annotated[int, Query(description="ICB sector code (e.g. 8300)", ge=1)],
    group: Annotated[str, Query(description="ALL, HOSE, HNX, UPCOM")] = "ALL",
    time_frame: Annotated[str, Query(description="ONE_DAY, ONE_WEEK, ONE_MONTH, YTD, ONE_YEAR")] = "ONE_DAY",
) -> dict[str, Any]:
    """Get detailed stock breakdown for an ICB sector."""
    from app.services.market_data.sources.vietcap_market_overview import (
        EXCHANGES_SECTOR_DETAIL,
        TIME_FRAMES_SECTOR_DETAIL,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_sector_detail,
    )
    if group not in EXCHANGES_SECTOR_DETAIL:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid group: {group}. Must be one of {sorted(EXCHANGES_SECTOR_DETAIL)}",
        )
    if time_frame not in TIME_FRAMES_SECTOR_DETAIL:
        raise HTTPException(status_code=422, detail=f"Invalid time_frame: {time_frame}")
    try:
        data, url = await fetch_sector_detail(
            group=group, time_frame=time_frame, icb_code=icb_code,
        )
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/stock-strength", tags=["Market Data: Overview"])
async def get_stock_strength(
    exchange: Annotated[str, Query(description="ALL, HOSE, HNX, UPCOM, HSX")] = "ALL",
) -> dict[str, Any]:
    """Get technical analysis stock-strength scores (flat map ticker:score)."""
    from app.services.market_data.sources.vietcap_market_overview import (
        EXCHANGES_STRENGTH,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_stock_strength,
    )
    if exchange not in EXCHANGES_STRENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid exchange: {exchange}. Must be one of {sorted(EXCHANGES_STRENGTH)}",
        )
    try:
        data, url = await fetch_stock_strength(exchange=exchange)
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/market-index", tags=["Market Data: Overview"])
async def get_market_index(
    symbols: Annotated[
        str | None,
        Query(description="Comma-separated: VNINDEX,HNXIndex,HNXUpcomIndex,VN30,HNX30"),
    ] = None,
) -> dict[str, Any]:
    """Get market index data (VN-Index, HNX-Index, UPCOM-Index, etc.)."""
    from app.services.market_data.sources.vietcap_market_overview import (
        VALID_INDEX_SYMBOLS,
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_market_index,
    )
    symbol_list: list[str] | None = None
    if symbols:
        symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
        invalid = [s for s in symbol_list if s not in VALID_INDEX_SYMBOLS]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid symbols: {invalid}. Must be from {sorted(VALID_INDEX_SYMBOLS)}",
            )
    try:
        data, url = await fetch_market_index(symbols=symbol_list)
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/reference/search", tags=["Market Data: Reference"])
async def get_search_bar(
    language: Annotated[int, Query(ge=1, le=2, description="1=Vietnamese, 2=English")] = 1,
) -> dict[str, Any]:
    """Get company search-bar data for autocomplete (~2000 companies)."""
    from app.services.market_data.sources.vietcap_market_overview import (
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_search_bar,
    )
    try:
        data, url = await fetch_search_bar(language=language)
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/reference/event-codes", tags=["Market Data: Reference"])
async def get_event_codes() -> dict[str, Any]:
    """Get event code reference data (maps event codes to names)."""
    from app.services.market_data.sources.vietcap_market_overview import (
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_event_codes,
    )
    try:
        data, url = await fetch_event_codes()
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


@router.get("/overview/maintenance", tags=["Market Data: Overview"])
async def get_maintenance() -> dict[str, Any]:
    """Get maintenance notification (if any)."""
    from app.services.market_data.sources.vietcap_market_overview import (
        MarketOverviewUpstreamError,
        MarketOverviewUpstreamShapeError,
        fetch_maintenance,
    )
    try:
        data, url = await fetch_maintenance()
    except MarketOverviewUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except MarketOverviewUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"data": data, "source_url": url}


# ══════════════════════════════════════════════════════
# 12. AI News (Vietcap)
# ══════════════════════════════════════════════════════

_VALID_NEWS_KINDS = {"business", "topic", "exchange"}
_VALID_SENTIMENTS = {"Positive", "Neutral", "Negative", ""}


def _validate_date_str(d: str | None) -> str:
    """Validate as exactly YYYY-MM-DD and a real calendar date. Returns '' if None."""
    if not d:
        return ""
    import re as _re
    from datetime import date as _date
    # Reject ISO week dates (2026-W17-6), compact (20260425), etc.
    if not _re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid date format: '{d}'. Must be exactly YYYY-MM-DD.",
        )
    try:
        _date.fromisoformat(d)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid date: '{d}'. Not a valid calendar date.",
        ) from None
    return d


@router.get("/news/ai", tags=["Market Data: AI News"])
async def get_ai_news(
    kind: Annotated[str, Query(description="business, topic, exchange")] = "business",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    ticker: Annotated[str | None, Query()] = None,
    topic: Annotated[str | None, Query()] = None,
    industry: Annotated[str | None, Query()] = None,
    source: Annotated[str | None, Query(description="Source key")] = None,
    sentiment: Annotated[str | None, Query(description="Positive, Neutral, Negative")] = None,
    update_from: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
    update_to: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
) -> dict[str, Any]:
    """Fetch AI-curated news list (business/topic/exchange)."""
    from app.services.market_data.sources.vietcap_ai_news import (
        AINewsUpstreamError,
        AINewsUpstreamShapeError,
        fetch_news_list,
    )

    if kind not in _VALID_NEWS_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid kind='{kind}'. Valid: {', '.join(sorted(_VALID_NEWS_KINDS))}",
        )
    if sentiment and sentiment not in _VALID_SENTIMENTS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid sentiment='{sentiment}'. Valid: Positive, Neutral, Negative",
        )
    uf = _validate_date_str(update_from)
    ut = _validate_date_str(update_to)

    try:
        items, total, url = await fetch_news_list(
            kind,
            page=page, page_size=page_size,
            ticker=ticker or "", industry=industry or "",
            topic=topic or "", source=source or "",
            sentiment=sentiment or "",
            update_from=uf, update_to=ut,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AINewsUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except AINewsUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "data": items, "total_records": total, "kind": kind,
        "page": page, "page_size": page_size, "source_url": url,
    }


@router.get("/news/ai/detail/{slug}", tags=["Market Data: AI News"])
async def get_ai_news_detail(
    slug: str = Path(
        ...,
        min_length=1,
        max_length=200,
        pattern=r"^[a-zA-Z0-9._-]+$",
        description="News article slug",
    ),
) -> dict[str, Any]:
    """Fetch AI news detail by slug."""
    from app.services.market_data.sources.vietcap_ai_news import (
        AINewsNotFoundError,
        AINewsUpstreamError,
        AINewsUpstreamShapeError,
        fetch_news_detail,
    )

    try:
        detail, url = await fetch_news_detail(slug)
    except AINewsNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AINewsUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except AINewsUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"data": detail, "source_url": url}


@router.get("/news/ai/audio/{news_id}", tags=["Market Data: AI News"])
async def get_ai_news_audio(
    news_id: str = Path(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[a-zA-Z0-9._-]+$",
        description="News article ID",
    ),
) -> dict[str, Any]:
    """Fetch audio URLs by news id."""
    from app.services.market_data.sources.vietcap_ai_news import (
        AINewsNotFoundError,
        AINewsUpstreamError,
        AINewsUpstreamShapeError,
        fetch_audio,
    )

    try:
        audio, url = await fetch_audio(news_id)
    except AINewsNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AINewsUpstreamShapeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except AINewsUpstreamError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"data": audio, "source_url": url}


@router.get("/news/ai/catalogs", tags=["Market Data: AI News"])
async def get_ai_news_catalogs() -> dict[str, Any]:
    """Fetch catalogs. Returns partial=true with warnings if any sub-fetch fails."""
    from app.services.market_data.sources.vietcap_ai_news import fetch_catalogs

    catalogs, urls = await fetch_catalogs()
    return {
        "data": catalogs,
        "partial": catalogs.get("partial", False),
        "warnings": catalogs.get("warnings", []),
        "source_urls": urls,
    }


@router.get("/news/ai/tickers/{symbol}", tags=["Market Data: AI News"])
async def get_ai_ticker_view(
    symbol: str,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 12,
    sentiment: Annotated[str | None, Query()] = None,
    source: Annotated[str | None, Query()] = None,
    update_from: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
    update_to: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
) -> dict[str, Any]:
    """Combined ticker view: sentiment + business news + exchange news.

    Partial failures are surfaced via warnings, not silently swallowed.
    """
    from app.services.market_data.sources.vietcap_ai_news import (
        AINewsUpstreamError,
        AINewsUpstreamShapeError,
        fetch_news_list,
        fetch_ticker_sentiment,
    )

    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Invalid symbol: {symbol}")
    if sentiment and sentiment not in _VALID_SENTIMENTS:
        raise HTTPException(status_code=422, detail=f"Invalid sentiment: {sentiment}")
    uf = _validate_date_str(update_from)
    ut = _validate_date_str(update_to)

    warnings: list[str] = []

    try:
        sentiment_data, _ = await fetch_ticker_sentiment(symbol)
    except (AINewsUpstreamError, AINewsUpstreamShapeError) as exc:
        warnings.append(f"sentiment: {exc}")
        sentiment_data = {"ticker": symbol.upper(), "score": 0, "sentiment": ""}

    kw: dict[str, Any] = {
        "page": page, "page_size": page_size,
        "ticker": symbol.upper(), "source": source or "",
        "sentiment": sentiment or "",
        "update_from": uf, "update_to": ut,
    }
    try:
        biz_items, biz_total, _ = await fetch_news_list("business", **kw)
    except (AINewsUpstreamError, AINewsUpstreamShapeError) as exc:
        warnings.append(f"business_news: {exc}")
        biz_items, biz_total = [], 0
    try:
        ex_items, ex_total, _ = await fetch_news_list("exchange", **kw)
    except (AINewsUpstreamError, AINewsUpstreamShapeError) as exc:
        warnings.append(f"exchange_news: {exc}")
        ex_items, ex_total = [], 0

    return {
        "ticker": symbol.upper(),
        "sentiment": sentiment_data,
        "business_news": {"data": biz_items, "total_records": biz_total},
        "exchange_news": {"data": ex_items, "total_records": ex_total},
        "partial": len(warnings) > 0,
        "warnings": warnings,
        "page": page, "page_size": page_size,
    }


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

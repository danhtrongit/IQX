"""Global & extended macro market-data endpoints.

Adds new domains ported from the IQX-TS reference backend:
- Gold (SJC → Simplize commodity fallback)
- FX table (Vietcombank → MBK macro fallback)
- World indices / forex / crypto (Binance, MSN)

All responses use the shared ``MarketDataResponse`` envelope and resolve their
source chains from the centralized registry.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query, Request

from app.services.cache.decorator import redis_cached
from app.services.cache.redis_cache import get_redis_client
from app.services.market_data.orchestrator import fetch_from_registry
from app.services.market_data.schemas import MarketDataResponse
from app.services.market_data.sources import binance, msn, sjc, spl, vcb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market-data")

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CRYPTO_SYMBOL_RE = re.compile(r"^[A-Z0-9]{2,20}$")


def _validate_date(value: str, name: str) -> str:
    if not _DATE_RE.match(value):
        raise HTTPException(
            status_code=422,
            detail=f"Giá trị {name}='{value}' không hợp lệ. Định dạng YYYY-MM-DD.",
        )
    return value


# ══════════════════════════════════════════════════════
# Macro: Gold & FX
# ══════════════════════════════════════════════════════


@router.get("/macro/gold", tags=["Dữ liệu thị trường: Vĩ mô"], response_model=MarketDataResponse)
@redis_cached(ttl_setting="REDIS_DEFAULT_TTL_SECONDS")
async def get_gold_prices(
    request: Request,
    date: Annotated[str | None, Query(description="Ngày YYYY-MM-DD (mặc định hôm nay)")] = None,
    source: Annotated[str | None, Query(description="Buộc dùng nguồn: SJC, SIMPLIZE")] = None,
) -> MarketDataResponse:
    """Lấy giá vàng. Nguồn chính SJC, dự phòng Simplize (vàng thế giới)."""
    trade_date = _validate_date(date, "date") if date else datetime.now(UTC).strftime("%Y-%m-%d")

    async def _sjc() -> tuple[Any, str]:
        return await sjc.fetch_gold(trade_date)

    async def _simplize() -> tuple[Any, str]:
        return await spl.fetch_commodity_price("gold_global", start=trade_date, end=trade_date)

    try:
        return await fetch_from_registry(
            "macro.gold", {"SJC": _sjc, "SIMPLIZE": _simplize}, override=source
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/macro/fx", tags=["Dữ liệu thị trường: Vĩ mô"], response_model=MarketDataResponse)
@redis_cached(ttl_setting="REDIS_DEFAULT_TTL_SECONDS")
async def get_exchange_rates(
    request: Request,
    date: Annotated[str | None, Query(description="Ngày YYYY-MM-DD (mặc định hôm nay)")] = None,
    source: Annotated[str | None, Query(description="Buộc dùng nguồn: VCB")] = None,
) -> MarketDataResponse:
    """Lấy bảng tỷ giá ngoại tệ. Nguồn chính Vietcombank."""
    trade_date = _validate_date(date, "date") if date else datetime.now(UTC).strftime("%Y-%m-%d")

    async def _vcb() -> tuple[Any, str]:
        return await vcb.fetch_fx(trade_date)

    try:
        return await fetch_from_registry("macro.fx", {"VCB": _vcb}, override=source)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ══════════════════════════════════════════════════════
# Global: World indices / Forex / Crypto
# ══════════════════════════════════════════════════════


@router.get("/global/world-index", tags=["Dữ liệu thị trường: Quốc tế"], response_model=MarketDataResponse)
@redis_cached(ttl_setting="REDIS_DEFAULT_TTL_SECONDS")
async def get_world_index(
    request: Request,
    symbol: Annotated[str, Query(description="Mã chỉ số: INX, DJI, N225, UKX, VNI...")],
    start: Annotated[str | None, Query(description="Ngày bắt đầu YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="Ngày kết thúc YYYY-MM-DD")] = None,
) -> MarketDataResponse:
    """Lấy dữ liệu lịch sử chỉ số chứng khoán thế giới (MSN)."""
    sym = symbol.upper()
    if msn.resolve_secid(sym) is None:
        raise HTTPException(status_code=422, detail=f"Không hỗ trợ mã chỉ số: {sym}")

    async def _msn() -> tuple[Any, str]:
        apikey = await msn.resolve_apikey(get_redis_client())
        return await msn.fetch_world_index(sym, apikey, start=start, end=end)

    try:
        return await fetch_from_registry("intl.world_index", {"MSN": _msn}, allow_empty=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/global/forex", tags=["Dữ liệu thị trường: Quốc tế"], response_model=MarketDataResponse)
@redis_cached(ttl_setting="REDIS_DEFAULT_TTL_SECONDS")
async def get_global_forex(
    request: Request,
    symbol: Annotated[str, Query(description="Cặp tiền: EURUSD, USDJPY, USDVND, XAUUSD...")],
    start: Annotated[str | None, Query(description="Ngày bắt đầu YYYY-MM-DD")] = None,
    end: Annotated[str | None, Query(description="Ngày kết thúc YYYY-MM-DD")] = None,
) -> MarketDataResponse:
    """Lấy dữ liệu lịch sử cặp tiền tệ quốc tế (MSN)."""
    sym = symbol.upper()
    if msn.resolve_secid(sym) is None:
        raise HTTPException(status_code=422, detail=f"Không hỗ trợ cặp tiền: {sym}")

    async def _msn() -> tuple[Any, str]:
        apikey = await msn.resolve_apikey(get_redis_client())
        return await msn.fetch_forex(sym, apikey, start=start, end=end)

    try:
        return await fetch_from_registry("intl.forex", {"MSN": _msn}, allow_empty=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/global/crypto/{symbol}/ohlc",
    tags=["Dữ liệu thị trường: Quốc tế"],
    response_model=MarketDataResponse,
)
@redis_cached(ttl_setting="REDIS_DEFAULT_TTL_SECONDS")
async def get_crypto_ohlc(
    request: Request,
    symbol: Annotated[str, Path(description="Mã crypto, vd BTCUSDT")],
    interval: Annotated[str, Query(description="Khung nến: 1m,5m,15m,1h,4h,1d,1w")] = "1d",
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
) -> MarketDataResponse:
    """Lấy nến OHLCV crypto. Nguồn chính Binance (USDT), dự phòng MSN (VND)."""
    sym = symbol.upper()
    if not _CRYPTO_SYMBOL_RE.match(sym):
        raise HTTPException(status_code=422, detail=f"Mã crypto không hợp lệ: {sym}")

    async def _binance() -> tuple[Any, str]:
        return await binance.fetch_ohlc(sym, interval=interval, limit=limit)

    async def _msn() -> tuple[Any, str]:
        apikey = await msn.resolve_apikey(get_redis_client())
        return await msn.fetch_crypto(sym, apikey)

    try:
        return await fetch_from_registry(
            "intl.crypto_ohlc", {"BINANCE": _binance, "MSN": _msn}
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/global/crypto/{symbol}/ticker",
    tags=["Dữ liệu thị trường: Quốc tế"],
    response_model=MarketDataResponse,
)
@redis_cached(ttl_setting="REDIS_TTL_REALTIME_SECONDS")
async def get_crypto_ticker(
    request: Request,
    symbol: Annotated[str, Path(description="Mã crypto, vd BTCUSDT")],
) -> MarketDataResponse:
    """Lấy thống kê 24h cho một mã crypto (Binance)."""
    sym = symbol.upper()
    if not _CRYPTO_SYMBOL_RE.match(sym):
        raise HTTPException(status_code=422, detail=f"Mã crypto không hợp lệ: {sym}")

    async def _binance() -> tuple[Any, str]:
        return await binance.fetch_ticker(sym)

    try:
        return await fetch_from_registry("intl.crypto_ticker", {"BINANCE": _binance})
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get(
    "/global/crypto/{symbol}/depth",
    tags=["Dữ liệu thị trường: Quốc tế"],
    response_model=MarketDataResponse,
)
@redis_cached(ttl_setting="REDIS_TTL_REALTIME_SECONDS", cache_empty=True)
async def get_crypto_depth(
    request: Request,
    symbol: Annotated[str, Path(description="Mã crypto, vd BTCUSDT")],
    limit: Annotated[int, Query(ge=1, le=5000)] = 100,
) -> MarketDataResponse:
    """Lấy order book (bids/asks) cho một mã crypto (Binance)."""
    sym = symbol.upper()
    if not _CRYPTO_SYMBOL_RE.match(sym):
        raise HTTPException(status_code=422, detail=f"Mã crypto không hợp lệ: {sym}")

    async def _binance() -> tuple[Any, str]:
        return await binance.fetch_depth(sym, limit=limit)

    try:
        return await fetch_from_registry(
            "intl.crypto_depth", {"BINANCE": _binance}, allow_empty=True
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

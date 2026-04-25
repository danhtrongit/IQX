"""Price resolver for virtual trading — abstracts market data sources.

Returns current price in integer VND for a given symbol.
Trading session awareness (Asia/Ho_Chi_Minh):
- During trading hours: last matched / realtime price
- Outside trading hours: latest close price

Symbol validation:
- Strict HOSE/HNX/UPCOM universe check — fail-closed on source error.

Price normalization:
- VCI intraday/OHLCV: already in VND (e.g. 60600)
- VND OHLCV: returns kVND (e.g. 60.6 = 60,600 VND) — multiply by 1000
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone

logger = logging.getLogger(__name__)

# Vietnam timezone: UTC+7
_VN_TZ = timezone(timedelta(hours=7))

# Trading sessions (local time in Vietnam)
_MORNING_OPEN = (9, 0)   # 09:00
_MORNING_CLOSE = (11, 30)  # 11:30
_AFTERNOON_OPEN = (13, 0)  # 13:00
_AFTERNOON_CLOSE = (14, 45)  # 14:45

# VND OHLCV returns prices in kVND (thousands); multiply to get integer VND
_VND_OHLCV_MULTIPLIER = 1000


class PriceUnavailableError(Exception):
    """Raised when price cannot be resolved for a symbol."""

    def __init__(self, symbol: str, reason: str = "Price data unavailable") -> None:
        self.symbol = symbol
        self.reason = reason
        super().__init__(f"{symbol}: {reason}")


class SymbolValidationError(Exception):
    """Raised when symbol validation fails due to upstream error."""

    def __init__(self, symbol: str, reason: str) -> None:
        self.symbol = symbol
        self.reason = reason
        super().__init__(f"{symbol}: {reason}")


@dataclass(frozen=True)
class PriceResult:
    """Resolved price for a symbol."""

    price_vnd: int  # Integer VND
    source: str  # "realtime" or "close"
    timestamp: datetime


def _to_int_vnd(raw: object, *, multiplier: int = 1) -> int | None:
    """Coerce a raw price to integer VND using explicit multiplier.

    Contract:
    - VNDIRECT OHLCV: multiplier=1000 (returns kVND, e.g. 60.6 → 60600)
    - VCI intraday/OHLCV: multiplier=1 (returns VND, e.g. 60600 → 60600)
    - VCI penny stocks: multiplier=1 (e.g. 700 → 700, NOT 700000)

    Returns None for zero, negative, or non-numeric input.
    """
    try:
        val = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if val <= 0:
        return None
    result = int(val * multiplier)
    return result if result > 0 else None


def is_trading_session(
    now: datetime | None = None,
    holidays: set[str] | None = None,
) -> bool:
    """Check if current time falls within Vietnam stock exchange trading hours.

    Trading sessions: 09:00-11:30 and 13:00-14:45, weekdays, excluding holidays.
    """
    now = datetime.now(_VN_TZ) if now is None else now.astimezone(_VN_TZ)

    # Weekend check
    if now.weekday() >= 5:
        return False

    # Holiday check
    if holidays and now.date().isoformat() in holidays:
        return False

    hm = (now.hour, now.minute)
    in_morning = _MORNING_OPEN <= hm < _MORNING_CLOSE
    in_afternoon = _AFTERNOON_OPEN <= hm < _AFTERNOON_CLOSE
    return in_morning or in_afternoon


async def resolve_price(
    symbol: str,
    *,
    now: datetime | None = None,
    holidays: set[str] | None = None,
    force_close: bool = False,
) -> PriceResult:
    """Resolve current price for a symbol using market data sources.

    Args:
        symbol: Stock ticker (e.g. 'VCB').
        now: Override current time for testability.
        holidays: Set of holiday date strings 'YYYY-MM-DD'.
        force_close: If True, skip realtime and use close price only.

    Strategy:
    - During trading session (and not force_close): try intraday realtime first.
    - Always available: fall back to latest OHLCV close.
    - Raise PriceUnavailableError if all sources fail.
    """
    use_realtime = not force_close and is_trading_session(now=now, holidays=holidays)

    if use_realtime:
        result = await _try_intraday(symbol)
        if result is not None:
            return result

    # Fall back to close price (always valid)
    result = await _try_ohlcv_close(symbol)
    if result is not None:
        return result

    raise PriceUnavailableError(symbol, "All price sources failed")


async def _try_intraday(symbol: str) -> PriceResult | None:
    """Try to get realtime price from VCI intraday.

    VCI intraday returns prices in VND (e.g. 60600 for 60,600 VND).
    """
    try:
        from app.services.market_data.sources import vietcap

        data, _url = await vietcap.fetch_intraday(symbol, page_size=1)
        if data and len(data) > 0:
            last_trade = data[0]
            raw = last_trade.get("close_price") or last_trade.get("price")
            price_vnd = _to_int_vnd(raw, multiplier=1)
            if price_vnd is not None:
                return PriceResult(
                    price_vnd=price_vnd,
                    source="realtime",
                    timestamp=datetime.now(UTC),
                )
    except Exception as exc:
        logger.debug("Intraday price failed for %s: %s", symbol, exc)
    return None


async def _try_ohlcv_close(symbol: str) -> PriceResult | None:
    """Try OHLCV close from VND then VCI.

    VND OHLCV returns prices in kVND (e.g. 60.6 = 60,600 VND).
    VCI OHLCV returns prices in VND (e.g. 60600).
    """
    # Try VND first (kVND — multiply by 1000)
    try:
        from app.services.market_data.sources import vndirect

        now_ts = int(time.time())
        week_ago_ts = now_ts - 7 * 86400
        data, _url = await vndirect.fetch_ohlcv(
            symbol, start_ts=week_ago_ts, end_ts=now_ts, interval="1D",
        )
        if data and len(data) > 0:
            last_candle = data[-1] if isinstance(data, list) else data
            raw = last_candle.get("close") or last_candle.get("adClose")
            price_vnd = _to_int_vnd(raw, multiplier=_VND_OHLCV_MULTIPLIER)
            if price_vnd is not None:
                return PriceResult(
                    price_vnd=price_vnd,
                    source="close",
                    timestamp=datetime.now(UTC),
                )
    except Exception as exc:
        logger.debug("VND OHLCV close failed for %s: %s", symbol, exc)

    # Fallback to VCI OHLCV (already VND)
    try:
        from app.services.market_data.sources import vietcap

        now_ts = int(time.time())
        week_ago_ts = now_ts - 7 * 86400
        data, _url = await vietcap.fetch_ohlcv(
            symbol, start_ts=week_ago_ts, end_ts=now_ts, interval="1D",
        )
        if data and len(data) > 0:
            last_candle = data[-1] if isinstance(data, list) else data
            raw = last_candle.get("close") or last_candle.get("closePrice")
            price_vnd = _to_int_vnd(raw, multiplier=1)
            if price_vnd is not None:
                return PriceResult(
                    price_vnd=price_vnd,
                    source="close",
                    timestamp=datetime.now(UTC),
                )
    except Exception as exc:
        logger.debug("VCI OHLCV close failed for %s: %s", symbol, exc)

    return None


# ── Symbol validation cache ──────────────────────────

_symbol_cache: set[str] | None = None
_symbol_cache_ts: float = 0.0
_SYMBOL_CACHE_TTL = 300.0  # 5 minutes


async def validate_symbol(symbol: str) -> bool:
    """Check if a symbol is a valid listed stock on HOSE/HNX/UPCOM.

    Fail-closed: if the upstream source is unreachable, raise SymbolValidationError
    instead of allowing unknown symbols through.
    """
    global _symbol_cache, _symbol_cache_ts  # noqa: PLW0603

    now = time.monotonic()
    if _symbol_cache is not None and (now - _symbol_cache_ts) < _SYMBOL_CACHE_TTL:
        return symbol.upper() in _symbol_cache

    try:
        from app.services.market_data.sources import vietcap

        data, _url = await vietcap.fetch_symbols_by_exchange()
        symbol_set = {
            r.get("symbol", "").upper()
            for r in data
            if r.get("exchange") in ("HOSE", "HNX", "UPCOM")
            and r.get("asset_type") in ("stock", None, "")
        }
        if not symbol_set:
            raise SymbolValidationError(
                symbol, "Symbol reference returned empty — cannot verify symbol",
            )
        _symbol_cache = symbol_set
        _symbol_cache_ts = now
        return symbol.upper() in symbol_set
    except SymbolValidationError:
        raise
    except Exception as exc:
        logger.warning("Symbol validation upstream failed: %s", exc)
        raise SymbolValidationError(
            symbol, f"Cannot verify symbol: upstream source error ({exc})",
        ) from exc

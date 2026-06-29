# app/services/ai/portfolio_manager/inputs.py
"""Load and shape every input the quant tier needs (spec §1)."""

from __future__ import annotations

import logging
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.symbol import Symbol
from app.models.virtual_trading import VirtualTrade
from app.services.market_data.sources.vietcap import fetch_financial_report, fetch_ohlcv
from app.services.market_data.sources import vietcap_market_overview as mo
from app.services.market_data.sources import vietcap_sector as sector_src
from app.services.virtual_trading.service import VirtualTradingService

from .config import RISK_LOOKBACK_DAYS

logger = logging.getLogger(__name__)

_OHLCV_WINDOW_DAYS = 400  # calendar days back; yields ~260 trading bars


@dataclass
class Holding:
    ticker: str
    quantity: int
    avg_cost_vnd: int
    current_price_vnd: int
    sector: str
    market_value: int
    unrealized_pnl: int
    cost_basis: int
    closes: list[float] = field(default_factory=list)
    volumes: list[float] = field(default_factory=list)
    pe: float | None = None
    pb: float | None = None
    roe: float | None = None
    dividend: float | None = None


@dataclass
class PortfolioInputs:
    nav: int
    cash: int
    holdings: list[Holding]
    benchmark_closes: list[float]
    sector_weights: dict[str, float]
    inception_date: date | None
    trades: list[VirtualTrade]
    as_of: date
    sector_returns_6m: dict[str, float] = field(default_factory=dict)


def _norm_sector(name: str) -> str:
    """Casefold + strip accents for taxonomy matching between Symbol.icb and VCI sector names."""
    if not name:
        return ""
    decomposed = unicodedata.normalize("NFKD", name)
    no_accent = "".join(c for c in decomposed if not unicodedata.combining(c))
    return no_accent.casefold().strip()


async def _safe(coro, default):
    try:
        res = await coro
        return res[0] if isinstance(res, tuple) else res
    except Exception:  # noqa: BLE001 — data sources are best-effort
        return default


async def _load_ohlcv(symbol: str, *, count_back: int) -> list[dict]:
    end = int(time.time())
    start = end - _OHLCV_WINDOW_DAYS * 86400
    bars = await _safe(
        fetch_ohlcv(symbol, start_ts=start, end_ts=end, interval="1D", count_back=count_back),
        default=[],
    )
    return bars or []


async def _load_ratios(symbol: str) -> dict:
    rows = await _safe(fetch_financial_report(symbol, report_type="ratio", period="Y"), default=[])
    if isinstance(rows, list) and rows:
        return rows[0]  # newest period first
    return {}


async def _load_sectors_for(db: AsyncSession, tickers: list[str]) -> dict[str, str]:
    if not tickers:
        return {}
    res = await db.execute(select(Symbol).where(Symbol.symbol.in_(tickers)))
    out: dict[str, str] = {}
    for s in res.scalars().all():
        out[s.symbol] = s.icb_lv2 or s.icb_lv1 or "Khác"
    for t in tickers:
        out.setdefault(t, "Khác")
    return out


def _icb_int(v) -> int | None:
    # fetch_icb_codes returns icb_code as int (from i["name"]); fetch_sector_information returns
    # icb_code as the RAW item["icbCode"] (often a string, maybe "8300" or "8300.0"). Coerce BOTH
    # through the same int path so the join can't silently miss on a type/format mismatch.
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None


def _pct_to_fraction(v) -> float | None:
    n = _num(v)
    if n is None:
        return None
    return n / 100.0 if abs(n) > 1.5 else n  # VCI may give percent (14.0) or fraction (0.14)


async def _load_sector_info() -> tuple[dict[str, float], dict[str, float]]:
    """Returns (sector_weights, sector_returns_6m) keyed by VN sector name. ({}, {}) if unavailable."""
    info = await _safe(sector_src.fetch_sector_information(icb_level=2), default=[])
    icb_names = await _safe(mo.fetch_icb_codes(), default=[])
    if not info or not icb_names:
        return {}, {}
    name_by_code: dict[int, str] = {}
    for r in icb_names:
        code = _icb_int(r.get("icb_code"))
        if code is not None and r.get("vi_sector"):
            name_by_code[code] = r["vi_sector"]
    caps: dict[str, float] = {}
    rets: dict[str, float] = {}
    for row in info:
        code = _icb_int(row.get("icb_code"))
        vi = name_by_code.get(code) if code is not None else None
        if not vi:
            continue
        cap = row.get("market_cap")
        if isinstance(cap, (int, float)) and cap > 0:
            caps[vi] = caps.get(vi, 0.0) + float(cap)
        r6 = _pct_to_fraction(row.get("percent_price_change_6m"))
        if r6 is not None:
            rets[vi] = r6
    total = sum(caps.values())
    weights = {name: cap / total for name, cap in caps.items()} if total > 0 else {}
    if not weights:
        logger.warning("portfolio_manager: sector-weight join matched 0 sectors (ICB code mismatch?)")
    return weights, rets


async def load_inputs(db: AsyncSession, user_id) -> PortfolioInputs:
    svc = VirtualTradingService(db)
    portfolio = await svc.get_portfolio(user_id)
    account = portfolio["account"]
    cash = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd

    raw_positions = [p for p in portfolio["positions"] if p.get("quantity_total", 0) > 0]
    tickers = [p["symbol"] for p in raw_positions]

    sectors = await _load_sectors_for(db, tickers)
    sector_weights, sector_returns_6m = await _load_sector_info()

    holdings: list[Holding] = []
    for p in raw_positions:
        bars = await _load_ohlcv(p["symbol"], count_back=RISK_LOOKBACK_DAYS + 20)
        ratios = await _load_ratios(p["symbol"])
        mv = p.get("market_value_vnd") or 0
        cost = p["avg_cost_vnd"] * p["quantity_total"]
        holdings.append(
            Holding(
                ticker=p["symbol"],
                quantity=p["quantity_total"],
                avg_cost_vnd=p["avg_cost_vnd"],
                current_price_vnd=p.get("current_price_vnd") or 0,
                sector=sectors.get(p["symbol"], "Khác"),
                market_value=mv,
                unrealized_pnl=p.get("unrealized_pnl_vnd") or (mv - cost),
                cost_basis=cost,
                closes=[float(b["close"]) for b in bars],
                volumes=[float(b.get("volume") or 0) for b in bars],
                pe=_pick(ratios, "pe", "price_to_earning", "pe_ratio"),
                pb=_pick(ratios, "pb", "price_to_book", "pb_ratio"),
                roe=_pick(ratios, "roe", "roea", "roe_ratio"),
                dividend=_pick(ratios, "dividend", "cash_dividend", "dividend_yield"),
            )
        )

    bench_bars = await _load_ohlcv("VNINDEX", count_back=RISK_LOOKBACK_DAYS + 20)
    benchmark_closes = [float(b["close"]) for b in bench_bars]

    all_trades = await _load_all_trades(svc, user_id)
    inception = min((t.traded_at.date() for t in all_trades), default=None)

    return PortfolioInputs(
        nav=portfolio["nav_vnd"],
        cash=cash,
        holdings=holdings,
        benchmark_closes=benchmark_closes,
        sector_weights=sector_weights,
        inception_date=inception,
        trades=all_trades,
        as_of=datetime.now(UTC).date(),
        sector_returns_6m=sector_returns_6m,
    )


async def _load_all_trades(svc: VirtualTradingService, user_id) -> list[VirtualTrade]:
    trades, total = await svc.list_trades(user_id, page=1, page_size=500)
    out = list(trades)
    page = 2
    while len(out) < total:
        more, _ = await svc.list_trades(user_id, page=page, page_size=500)
        if not more:
            break
        out.extend(more)
        page += 1
    return out


def _num(v) -> float | None:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _pick(row: dict, *keys: str) -> float | None:
    """Return the first present, non-None numeric value among candidate key names.

    VCI's snake_cased ratio keys are not guaranteed to be literally pe/pb/roe (they may be
    price_to_earning / price_to_book / roea). Try the likely names. **Before implementing,
    inspect a real fetch_financial_report(symbol, report_type="ratio") row** (see Step 3a) and
    put the actual key first.
    """
    for k in keys:
        if k in row and row[k] is not None:
            return _num(row[k])
    return None


# expose the sector-name normalizer for layers that match taxonomies
normalize_sector_name = _norm_sector

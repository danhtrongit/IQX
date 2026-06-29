"""Quant-tier orchestrator: inputs → 8 layers → score → insights → Analysis JSON (spec §8)."""

from __future__ import annotations

from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.repositories.portfolio_manager import PortfolioReportRepository
from app.services.virtual_trading.service import VirtualTradingService

from . import layers as L
from .config import CHANGED_WEIGHT_THRESHOLD, MIN_POSITIONS_FOR_ANALYSIS, SECTOR_BENCH_THRESHOLD
from .insights import select_insights
from .inputs import PortfolioInputs, load_inputs
from .scoring import overall_score, score_pillars

INSUFFICIENT_REASON = "Danh mục chưa đủ dữ liệu để phân tích — cần ít nhất 2 mã và lịch sử giao dịch."
NO_ACCOUNT_REASON = "Bạn chưa kích hoạt tài khoản giao dịch ảo."


async def _resolve_account_id(db: AsyncSession, user_id):
    account = await VirtualTradingService(db).get_account(user_id)
    return account.id


def _nav_proxy_series(inp: PortfolioInputs) -> list[float]:
    # Build a weighted NAV index. CRITICAL: each symbol's closes are in its OWN price
    # scale, so we REBASE each window to an index (close/first) before weighting —
    # otherwise the largest-priced symbol dominates and the drawdown is meaningless.
    confident = [h for h in inp.holdings if len(h.closes) >= 2]
    if not confident:
        return []
    n = min(len(h.closes) for h in confident)
    total_mv = sum(h.market_value for h in confident) or 1
    weights = {h.ticker: h.market_value / total_mv for h in confident}
    series: list[float] = []
    for i in range(n):
        val = 0.0
        for h in confident:
            window = h.closes[-n:]
            base = window[0] or 1.0
            val += weights[h.ticker] * (window[i] / base)
        series.append(val)
    return series


def _holding_months(inp: PortfolioInputs) -> int:
    if not inp.inception_date:
        return 0
    delta = inp.as_of - inp.inception_date
    return max(1, round(delta.days / 30))


def holdings_changed(prev_snapshot: dict | None, current_weights: dict[str, float]) -> bool:
    if not prev_snapshot:
        return True
    if set(prev_snapshot) != set(current_weights):
        return True
    for t, w in current_weights.items():
        if abs(w - prev_snapshot.get(t, 0.0)) > CHANGED_WEIGHT_THRESHOLD:
            return True
    return False


async def build_analysis(db: AsyncSession, user_id) -> dict:
    try:
        inp = await load_inputs(db, user_id)  # raises NotFoundError if no virtual account
    except NotFoundError:
        return {"insufficient_data": True, "reason": NO_ACCOUNT_REASON}
    if len(inp.holdings) < MIN_POSITIONS_FOR_ANALYSIS or not inp.trades:
        return {"insufficient_data": True, "reason": INSUFFICIENT_REASON}

    account_id = await _resolve_account_id(db, user_id)
    repo = PortfolioReportRepository(db)
    prev = await repo.get_latest(account_id)
    period_number = await repo.count_for_account(account_id) + 1

    risk, low_conf = L.layer_risk(inp)
    holding_months = _holding_months(inp)
    nav_series = _nav_proxy_series(inp)

    overview = L.layer_overview(inp, low_conf, holding_months)
    performance = L.layer_performance(inp, nav_series=nav_series)
    allocation = L.layer_allocation(inp)
    concentration = L.layer_concentration(inp)
    attribution = L.layer_attribution(inp)
    quality = L.layer_quality(inp)
    behavior = L.layer_behavior(inp)

    max_corr = max((c["value"] for c in risk.get("correlation", [])), default=0.0)
    pillars = score_pillars(performance, risk, concentration, quality, behavior, max_corr=max_corr)
    overall = overall_score(pillars)

    current_weights = {p["ticker"]: p["weight"] for p in overview["positions"]}
    prev_snapshot = (prev.holdings_snapshot if prev else None)
    mode = "first" if prev is None else ("full_changed" if holdings_changed(prev_snapshot, current_weights) else "light_unchanged")

    progress = {"prev_actions": []}
    prev_overall = None
    if prev is not None:
        prev_overall = (prev.scores or {}).get("overall")
        progress["prev_actions"] = _diff_prev_actions(prev.recommended_actions or [], current_weights, prev_snapshot or {})

    # NOTE: quality.sector_benchmark is left as None in v1 — per-sector return attribution
    # (computing `your_return` vs `industry_return` for each sector) requires a per-sector
    # OHLCV series that is not yet available in load_inputs. Full sector-benchmark merge is
    # deferred to Phase 2 (see spec §8 deferred list). The layer_quality call already returns
    # sector_benchmark=None; nothing more to merge here.

    analysis = {
        "meta": {"portfolio_id": str(account_id)[:8], "date": inp.as_of.isoformat(),
                 "mode": mode, "period": f"kỳ {period_number}", "period_number": period_number},
        "overview": overview,
        "performance": performance,
        "allocation": allocation,
        "concentration": concentration,
        "risk": risk,
        "attribution": attribution,
        "quality": quality,
        "behavior": behavior,
        "scores": {"overall": overall, "prev_overall": prev_overall, "pillars": pillars},
        "selected_insights": [],
        "progress": progress,
    }
    analysis["selected_insights"] = select_insights(analysis)
    return analysis


def _diff_prev_actions(prev_actions: list[dict], current_weights: dict, prev_snapshot: dict) -> list[dict]:
    # An action is "done" if a ticker it MENTIONS dropped materially (or is gone) since last period.
    # Actions carry no structured ticker, so scan the action text for any previously-held ticker.
    out = []
    prev_tickers = list(prev_snapshot.keys())
    for act in prev_actions:
        text = (act.get("text") or "").upper()
        done = False
        for t in prev_tickers:
            if t in text:
                new_w = current_weights.get(t, 0.0)
                if t not in current_weights or (prev_snapshot[t] - new_w > CHANGED_WEIGHT_THRESHOLD):
                    done = True
        out.append({"id": act.get("id"), "done": done, "detail": act.get("text", "")})
    return out

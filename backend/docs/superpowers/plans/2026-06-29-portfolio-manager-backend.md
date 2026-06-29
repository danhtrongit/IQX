# Portfolio Manager — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic quant engine + DeepSeek narrative + persistence + premium-gated `POST /api/v1/portfolio-manager/analyze` endpoint that returns a portfolio analysis report (Analysis JSON + Narrative JSON), day-cached per `(account_id, trading_date)`.

**Architecture:** Two tiers, mirroring the in-production `app/services/ai/market_analysis/` package. A **quant tier** (pure Python/numpy, no AI) loads the user's virtual-trading portfolio + market data and computes 8 layers → an **Analysis JSON** (the golden rule: every displayed number originates here). An **interpretation tier** sends that JSON to DeepSeek via the existing `chat_completion` proxy and gets back a **Narrative JSON** (prose only), validated against QA rules with a retry loop. The result is persisted as a `PortfolioReport` row keyed by trading date (the day-cache) with snapshot fields for next-period "vs last" comparison.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2.0 (typed `Mapped`/`mapped_column`), async, `uv` for tooling, pytest (sqlite+aiosqlite in tests), `numpy` for risk math, DeepSeek via `app/services/ai/proxy_client.chat_completion`, Alembic (hand-written migrations, sync psycopg driver), Redis cache helpers (fail-safe, default disabled).

## Global Constraints

- **Golden rule:** the LLM may only restate numbers present in the Analysis JSON. The quant tier computes every number. (Spec §0.)
- **All monetary values are integer VND** (`BigInteger`), consistent with `virtual_trading`.
- **No VaR** anywhere — risk is communicated via the client-side stress-test (frontend plan). (Spec §5/§6.)
- **Performance method v1 = simple since-inception** (`method:"simple_inception"`); TWR deferred. (Locked decision.)
- **Risk lookback = 120 sessions**; data-confidence gate: ≥120 bars AND 20-day avg traded value ≥ 2,000,000,000 VND. (Spec §4/§12.)
- **6 starter insight templates:** `hidden_corr`, `profit_concentration`, `sector_tilt`, `holding_losers`, `cash_dry`, `healthy_focus`. (Locked decision.)
- **LLM temperature = 0.5**, JSON output, retry ≤ 3. (Spec §11.)
- **Auth:** every route uses the `PremiumUser` dependency (admins bypass). (Recon area 4.)
- **DB session:** inject via the `DBSession` type alias; repositories `flush()` never `commit()` (request auto-commits in `get_db`).
- **Vocabulary/format** (decimal comma, "điểm %", no "khuyến nghị mua/bán", no "chắc chắn") are enforced by the validator and are the LLM's responsibility — the quant tier emits raw floats/ints; formatting happens in the narrative + frontend.
- **Config constants** live in `app/services/ai/portfolio_manager/config.py` (Spec §12), imported by every layer — never hard-code thresholds inline.
- Model must be registered in **both** `app/models/__init__.py` AND `alembic/env.py`.
- Run tests with `uv run pytest` from `backend/`. Run migrations with `uv run alembic ...` from `backend/`.

## The shared API contract — Analysis JSON (this plan PRODUCES it; the frontend plan CONSUMES it)

This is the §8 contract. The orchestrator (Task 14) assembles exactly this shape; the endpoint (Task 18) returns `{ "analysis": <AnalysisJSON>, "narrative": <NarrativeJSON>, "meta": {...} }`.

```jsonc
{
  "meta": { "portfolio_id": "A-0412", "date": "2026-06-23", "mode": "full_changed", "period": "kỳ 3", "period_number": 3 },
  "overview": {
    "nav": 534000000, "cash_pct": 0.092, "n_positions": 7,
    "total_return": 0.107, "total_pnl": 52000000, "holding_months": 7,
    "positions": [ { "ticker":"HPG","sector":"Thép","weight":0.16,"pnl":38000000,"low_confidence":false } ]
  },
  "performance": { "portfolio_return":0.107, "benchmark_return":0.072, "excess_return":0.035, "max_drawdown":-0.09, "method":"simple_inception" },
  "allocation": [ {"sector":"Ngân hàng","weight":0.344,"benchmark":0.38,"active":-0.036} ],
  "concentration": { "top1":0.187, "top3":0.504, "effective_n":5.8, "largest_sector":0.344 },
  "risk": {
    "beta":1.25, "volatility":0.21, "tracking_error":0.08,
    "correlation":[ {"a":"TCB","b":"MBB","value":0.82} ],
    "excluded": [ {"ticker":"APG","reason":"low_liquidity_short_history"} ]
  },
  "attribution": [ {"ticker":"HPG","pnl":38000000,"pct":0.63} ],
  "quality": { "pe":11.4, "pb":1.6, "roe":0.18, "dividend":0.02,
    "sector_benchmark": {"sector":"Ngân hàng","your_return":0.09,"industry_return":0.14,"gap":-0.05} },
  "behavior": { "avg_holding_days":48, "losing_count":3, "disposition_flag":true,
    "worst_loser":{"ticker":"VND","pnl_pct":-0.15,"periods_held":3} },
  "scores": { "overall":3.5, "prev_overall":3.2,
    "pillars":{"performance":4,"risk":3,"diversification":3,"quality":4,"discipline":2} },
  "selected_insights": [ {"id":"sector_tilt","data":{"sector":"Thép","ratio":3.2,"weight":0.16}} ],
  "progress": { "prev_actions":[ {"id":"trim_hpg","done":true,"detail":"giảm 25%→16%"}, {"id":"sell_vnd","done":false,"detail":""} ] }
}
```

When the portfolio is too small to analyze, the engine returns `{ "insufficient_data": true, "reason": "<vi text>" }` instead, and no LLM call is made.

## File Structure

**New package** `app/services/ai/portfolio_manager/`:
- `config.py` — §12 constants (one module-level constant each).
- `returns.py` — pure math: daily returns, MA, stdev, beta, correlation, max drawdown.
- `inputs.py` — `PortfolioInputs` dataclass + `async load_inputs(db, user_id)`; pulls holdings/cash/trades/OHLCV/fundamentals/sectors/benchmark/prev-snapshot.
- `data_confidence.py` — `evaluate_confidence(bars)` → per-ticker gate (§4).
- `layers.py` — pure functions `layer_overview/performance/allocation/concentration/risk/attribution/quality/behavior`, each returns one Analysis-JSON section.
- `scoring.py` — `score_pillars(...)` + `overall_score(...)` (§3).
- `insights.py` — `select_insights(analysis)` (§5; 6 templates).
- `analysis.py` — `async build_analysis(db, user_id)` orchestrates quant tier → Analysis JSON (incl. mode + progress).
- `prompts.py` — `SYSTEM_PROMPT` (loaded from markdown) + `build_user_prompt(analysis)`.
- `validator.py` — `validate_narrative(narrative, analysis)` → `list[str]` (§10).
- `generator.py` — `async generate_report(db, user_id)` (full pipeline: analysis → LLM → validate → retry → persist) + `_parse_json`.
- `__init__.py` — exports `build_analysis`, `generate_report`.

**New supporting files:**
- `app/models/portfolio_report.py` — `PortfolioReport` model.
- `app/schemas/portfolio_manager.py` — response Pydantic models.
- `app/repositories/portfolio_manager.py` — `PortfolioReportRepository`.
- `app/api/v1/endpoints/portfolio_manager.py` — router.
- `backend/docs/ai/ai-portfolio-manager.md` — the system prompt (clean original of `IQX-Danh-Muc-SystemPrompt.md`).
- `alembic/versions/<hash>_add_portfolio_report_table.py` — migration.
- `tests/test_portfolio_manager_*.py` — tests.

**Modified files:**
- `app/models/__init__.py` — register `PortfolioReport`.
- `alembic/env.py` — import `PortfolioReport` for autogenerate.
- `app/api/v1/router.py` — include the new router.
- `app/core/config.py` — add `REDIS_TTL_PORTFOLIO_MANAGER_SECONDS` (optional; reuse default otherwise).

---

### Task 0: Obtain source artifacts (HARD GATE)

The product spec, the verbatim system prompt, and the golden-fixture HTML arrived in chat **encoding-mangled** and are **not in the repo**. Several tasks (15 LLM prompt, 16 validator wording, frontend porting) depend on faithful originals. Complete this before Task 15.

- [ ] **Step 1:** Obtain the clean originals from the user: `IQX-Danh-Muc-Spec.md`, `IQX-Danh-Muc-SystemPrompt.md`, `bao-cao-danh-muc-day-du.html`.
- [ ] **Step 2:** Save the system prompt's inner block (everything inside the ```` ``` ```` fence under "## System Prompt") to `backend/docs/ai/ai-portfolio-manager.md` (UTF-8). Save the product spec to `backend/docs/ai/portfolio-manager-spec.md` for reference. (The HTML reference is committed in the frontend plan's Task 0.)
- [ ] **Step 3:** Verify the markdown opens with correct Vietnamese (no `Ã`/`â` mojibake) and is > 1 KB.
- [ ] **Step 4:** Cross-check that the §9 narrative keys and §10 forbidden phrases the validator (Task 16) and types assume actually match the system prompt's stated output schema; note any divergence and reconcile Task 16 / frontend types to the real prompt before implementing them.
- [ ] **Step 5: Commit**

```bash
git add backend/docs/ai/ai-portfolio-manager.md backend/docs/ai/portfolio-manager-spec.md
git commit -m "docs(portfolio-manager): commit clean system prompt + product spec"
```

---

### Task 1: Config constants

**Files:**
- Create: `app/services/ai/portfolio_manager/__init__.py` (empty for now)
- Create: `app/services/ai/portfolio_manager/config.py`
- Test: `tests/test_portfolio_manager_config.py`

**Interfaces:**
- Produces: module-level constants `RISK_LOOKBACK_DAYS`, `DATA_CONF_MIN_HISTORY`, `DATA_CONF_MIN_AVG_VALUE_VND`, `SECTOR_BENCH_THRESHOLD`, `CHANGED_WEIGHT_THRESHOLD`, `HIDDEN_CORR_MIN`, `PROFIT_CONCENTRATION_MIN`, `SECTOR_TILT_RATIO_MIN`, `CASH_DRY_MAX`, `LLM_TEMPERATURE`, `ANNUALIZE_FACTOR`, `MIN_POSITIONS_FOR_ANALYSIS`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_config.py
from app.services.ai.portfolio_manager import config


def test_config_constants_match_spec():
    assert config.RISK_LOOKBACK_DAYS == 120
    assert config.DATA_CONF_MIN_HISTORY == 120
    assert config.DATA_CONF_MIN_AVG_VALUE_VND == 2_000_000_000
    assert config.SECTOR_BENCH_THRESHOLD == 0.25
    assert config.CHANGED_WEIGHT_THRESHOLD == 0.03
    assert config.HIDDEN_CORR_MIN == 0.75
    assert config.PROFIT_CONCENTRATION_MIN == 0.60
    assert config.SECTOR_TILT_RATIO_MIN == 3.0
    assert config.CASH_DRY_MAX == 0.05
    assert config.LLM_TEMPERATURE == 0.5
    assert config.ANNUALIZE_FACTOR == 252
    assert config.MIN_POSITIONS_FOR_ANALYSIS == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_config.py -q`
Expected: FAIL (ModuleNotFoundError: app.services.ai.portfolio_manager.config)

- [ ] **Step 3: Create the package + config**

```python
# app/services/ai/portfolio_manager/__init__.py
"""Portfolio Manager — deterministic quant tier + AI narrative tier."""
```

```python
# app/services/ai/portfolio_manager/config.py
"""Configuration constants for the Portfolio Manager engine (spec §12)."""

from __future__ import annotations

RISK_LOOKBACK_DAYS = 120
DATA_CONF_MIN_HISTORY = 120
DATA_CONF_MIN_AVG_VALUE_VND = 2_000_000_000
SECTOR_BENCH_THRESHOLD = 0.25
CHANGED_WEIGHT_THRESHOLD = 0.03
HIDDEN_CORR_MIN = 0.75
PROFIT_CONCENTRATION_MIN = 0.60
SECTOR_TILT_RATIO_MIN = 3.0
CASH_DRY_MAX = 0.05
LLM_TEMPERATURE = 0.5
ANNUALIZE_FACTOR = 252

# IQX integration constant (NOT a spec §12 value): below this many positions we return
# `insufficient_data` instead of a report. SECTOR_BENCH_THRESHOLD above is a §12 constant
# reserved for the deferred conditional sector-benchmark (Layer 07) — see design deferred list.
MIN_POSITIONS_FOR_ANALYSIS = 2
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_config.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/__init__.py app/services/ai/portfolio_manager/config.py tests/test_portfolio_manager_config.py
git commit -m "feat(portfolio-manager): config constants (spec §12)"
```

---

### Task 2: Risk math helpers (`returns.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/returns.py`
- Test: `tests/test_portfolio_manager_returns.py`

**Interfaces:**
- Produces:
  - `daily_returns(closes: list[float]) -> list[float]` — simple returns `c[t]/c[t-1]-1`.
  - `stdev(xs: list[float]) -> float` — sample stdev (ddof=1).
  - `annualized_vol(returns: list[float], factor: int = ANNUALIZE_FACTOR) -> float`.
  - `beta(asset_returns: list[float], market_returns: list[float]) -> float` — `cov/var(market)`.
  - `correlation(a: list[float], b: list[float]) -> float` — Pearson.
  - `max_drawdown(closes: list[float]) -> float` — most-negative `c/runmax-1` (≤0).
  - All use `numpy`; series are aligned by caller (equal length). Return `0.0` for degenerate input (len<2 or zero variance), never raise.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_returns.py
import math
from app.services.ai.portfolio_manager import returns as R


def test_daily_returns_simple():
    assert R.daily_returns([100, 110, 99]) == [0.1, -0.1]


def test_beta_perfectly_tracks_market_is_one():
    mkt = [0.01, -0.02, 0.03, -0.01, 0.02]
    asset = [2 * x for x in mkt]          # asset moves 2x market exactly
    assert math.isclose(R.beta(asset, mkt), 2.0, rel_tol=1e-9)


def test_correlation_identical_series_is_one():
    a = [0.01, -0.02, 0.03, -0.01, 0.02]
    assert math.isclose(R.correlation(a, a), 1.0, rel_tol=1e-9)


def test_correlation_anticorrelated_is_minus_one():
    a = [0.01, -0.02, 0.03, -0.01]
    b = [-x for x in a]
    assert math.isclose(R.correlation(a, b), -1.0, rel_tol=1e-9)


def test_max_drawdown_simple():
    # peak 120 then trough 90 → -0.25
    assert math.isclose(R.max_drawdown([100, 120, 90, 110]), -0.25, rel_tol=1e-9)


def test_degenerate_inputs_return_zero():
    assert R.beta([0.0], [0.0]) == 0.0
    assert R.correlation([], []) == 0.0
    assert R.annualized_vol([0.0, 0.0, 0.0]) == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_returns.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement `returns.py`**

```python
# app/services/ai/portfolio_manager/returns.py
"""Pure risk/return math. numpy-backed; degenerate inputs return 0.0, never raise."""

from __future__ import annotations

import numpy as np

from .config import ANNUALIZE_FACTOR


def daily_returns(closes: list[float]) -> list[float]:
    if len(closes) < 2:
        return []
    arr = np.asarray(closes, dtype=float)
    prev = arr[:-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.where(prev != 0, arr[1:] / prev - 1.0, 0.0)
    return [float(x) for x in r]


def stdev(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    return float(np.std(np.asarray(xs, dtype=float), ddof=1))


def annualized_vol(returns: list[float], factor: int = ANNUALIZE_FACTOR) -> float:
    s = stdev(returns)
    return float(s * np.sqrt(factor))


def beta(asset_returns: list[float], market_returns: list[float]) -> float:
    n = min(len(asset_returns), len(market_returns))
    if n < 2:
        return 0.0
    a = np.asarray(asset_returns[-n:], dtype=float)
    m = np.asarray(market_returns[-n:], dtype=float)
    var_m = float(np.var(m, ddof=1))
    if var_m == 0.0:
        return 0.0
    cov = float(np.cov(a, m, ddof=1)[0, 1])
    return cov / var_m


def correlation(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    x = np.asarray(a[-n:], dtype=float)
    y = np.asarray(b[-n:], dtype=float)
    if np.std(x) == 0.0 or np.std(y) == 0.0:
        return 0.0
    return float(np.corrcoef(x, y)[0, 1])


def max_drawdown(closes: list[float]) -> float:
    if len(closes) < 2:
        return 0.0
    arr = np.asarray(closes, dtype=float)
    running_max = np.maximum.accumulate(arr)
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(running_max != 0, arr / running_max - 1.0, 0.0)
    return float(dd.min())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_returns.py -q`
Expected: PASS

- [ ] **Step 5: Verify numpy is available**

Run: `uv run python -c "import numpy; print(numpy.__version__)"`
Expected: prints a version (numpy is already a dep via the TA engine). If it errors, run `uv add numpy` and note it in the commit.

- [ ] **Step 6: Commit**

```bash
git add app/services/ai/portfolio_manager/returns.py tests/test_portfolio_manager_returns.py
git commit -m "feat(portfolio-manager): risk/return math helpers"
```

---

### Task 3: Data-confidence gate (`data_confidence.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/data_confidence.py`
- Test: `tests/test_portfolio_manager_data_confidence.py`

**Interfaces:**
- Consumes: `config.DATA_CONF_MIN_HISTORY`, `config.DATA_CONF_MIN_AVG_VALUE_VND`.
- Produces:
  - `evaluate_confidence(bars: list[dict]) -> tuple[bool, str | None]` — `bars` are normalized OHLCV dicts with keys `close: float`, `volume: float` (VND-unit close). Returns `(True, None)` if confident, else `(False, "low_liquidity_short_history")`. Rule: `len(bars) >= MIN_HISTORY` AND mean(close*volume over last 20 bars) >= MIN_AVG_VALUE_VND.
- Note: `close*volume` is the deliberate turnover proxy here (the bar's true `value`/`accumulatedValue` field is intentionally NOT loaded into `Holding`); it is dimensionally correct (VCI close is VND × shares → VND) and sufficient for the 2e9 gate.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_data_confidence.py
from app.services.ai.portfolio_manager.data_confidence import evaluate_confidence


def _bars(n, close, volume):
    return [{"close": close, "volume": volume} for _ in range(n)]


def test_confident_when_enough_history_and_liquid():
    bars = _bars(130, close=26000.0, volume=1_000_000.0)  # 26e9 traded value
    assert evaluate_confidence(bars) == (True, None)


def test_excluded_when_short_history():
    bars = _bars(40, close=26000.0, volume=1_000_000.0)
    ok, reason = evaluate_confidence(bars)
    assert ok is False
    assert reason == "low_liquidity_short_history"


def test_excluded_when_illiquid():
    bars = _bars(130, close=5000.0, volume=100.0)  # 0.5e6 traded value << 2e9
    ok, reason = evaluate_confidence(bars)
    assert ok is False
    assert reason == "low_liquidity_short_history"


def test_empty_bars_excluded():
    assert evaluate_confidence([]) == (False, "low_liquidity_short_history")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_data_confidence.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement**

```python
# app/services/ai/portfolio_manager/data_confidence.py
"""Per-ticker data-confidence gate (spec §4). Protects risk metrics from thin data."""

from __future__ import annotations

from .config import DATA_CONF_MIN_AVG_VALUE_VND, DATA_CONF_MIN_HISTORY

LOW_DATA_REASON = "low_liquidity_short_history"


def evaluate_confidence(bars: list[dict]) -> tuple[bool, str | None]:
    if len(bars) < DATA_CONF_MIN_HISTORY:
        return False, LOW_DATA_REASON
    last20 = bars[-20:]
    if not last20:
        return False, LOW_DATA_REASON
    avg_value = sum(float(b["close"]) * float(b["volume"]) for b in last20) / len(last20)
    if avg_value < DATA_CONF_MIN_AVG_VALUE_VND:
        return False, LOW_DATA_REASON
    return True, None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_data_confidence.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/data_confidence.py tests/test_portfolio_manager_data_confidence.py
git commit -m "feat(portfolio-manager): data-confidence gate (spec §4)"
```

---

### Task 4: Input model + loader (`inputs.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/inputs.py`
- Test: `tests/test_portfolio_manager_inputs.py`

**Interfaces:**
- Consumes:
  - `app.services.virtual_trading.service.VirtualTradingService` — `.get_portfolio(user_id)` → dict (`account`, `positions[]` with `current_price_vnd`, `nav_vnd`, `total_market_value_vnd`, `return_pct`). `.list_trades(user_id, page, page_size)` → `(list[VirtualTrade], total)`.
  - `app.services.market_data.sources.vietcap.fetch_ohlcv(symbol, *, start_ts, end_ts, interval="1D", count_back)` → `(list[bar], url)`; bar keys `time`(str epoch), `open/high/low/close`(float), `volume`(float), `value`(float|None).
  - `app.services.market_data.sources.vietcap.fetch_financial_report(symbol, report_type="ratio", period="Y")` → `(list[ratio_row], url)`; row keys include `pe`, `pb`, `roe`, `dividend`.
  - `app.services.market_data.sources.vietcap_sector.fetch_sector_information(icb_level=2)` → `(list[{icb_code, market_cap, ...}], url)`.
  - `app.services.market_data.sources.vietcap_market_overview.fetch_icb_codes()` → `(list[{icb_code, vi_sector, ...}], url)`.
  - `app.models.symbol.Symbol` (columns `symbol`, `icb_lv1`, `icb_lv2`) for per-ticker sector.
  - `app.repositories.portfolio_manager.PortfolioReportRepository` (Task 13) — but to avoid a forward dependency, the prev-snapshot is loaded by the orchestrator (Task 14), NOT here. `inputs.py` does NOT touch `PortfolioReport`.
- Produces:
  - dataclass `Holding` with `ticker: str`, `quantity: int`, `avg_cost_vnd: int`, `current_price_vnd: int`, `sector: str`, `market_value: int`, `unrealized_pnl: int`, `cost_basis: int`, `closes: list[float]` (VND-unit daily closes, newest last), `volumes: list[float]`, `pe: float | None`, `pb: float | None`, `roe: float | None`, `dividend: float | None`.
  - dataclass `PortfolioInputs` with `nav: int`, `cash: int`, `holdings: list[Holding]`, `benchmark_closes: list[float]` (VN-Index daily closes), `sector_weights: dict[str, float]` (VN-Index sector→weight, normalized to sum≈1; `{}` if unavailable), `inception_date: date | None`, `trades: list[VirtualTrade]`, `as_of: date`.
  - `async load_inputs(db, user_id) -> PortfolioInputs`.
- Notes on units: **VCI `fetch_ohlcv` close is already absolute VND** (no ×1000); it is VNDIRECT OHLCV that returns kVND (per `price_resolver.py` multipliers). For risk math only *relative* returns matter, so the exact unit is irrelevant to beta/corr/volatility — but DO NOT mix units within one series, and never compare absolute closes across symbols (each holding keeps its own series; cross-symbol combination must rebase to an index — see Task 14 `_nav_proxy_series`).
- Notes on ratio keys: the real snake_cased keys from `fetch_financial_report(report_type="ratio")` are NOT confirmed to be `pe`/`pb`/`roe` — `_pick` tries fallbacks; **verify against a live row in Step 3a** and reorder so the real key is first.

- [ ] **Step 1: Write the failing test** (mocks all network/data sources; verifies shaping + unit handling)

```python
# tests/test_portfolio_manager_inputs.py
import datetime as dt
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.portfolio_manager import inputs as I


@pytest.mark.asyncio
async def test_load_inputs_shapes_holdings_and_benchmark(db_session, premium_user):
    user, _ = premium_user
    portfolio = {
        "account": type("A", (), {"cash_available_vnd": 49_000_000, "cash_reserved_vnd": 0,
                                  "cash_pending_vnd": 0, "initial_cash_vnd": 482_000_000})(),
        "positions": [
            {"symbol": "HPG", "quantity_total": 4000, "avg_cost_vnd": 19500,
             "current_price_vnd": 26750, "market_value_vnd": 107_000_000,
             "unrealized_pnl_vnd": 29_000_000},
        ],
        "nav_vnd": 534_000_000, "total_market_value_vnd": 485_000_000, "return_pct": 10.7,
    }
    ohlcv_bars = [{"time": str(1_700_000_000 + i * 86400), "close": 26.0 + i * 0.01,
                   "volume": 1_000_000.0, "value": 26000.0} for i in range(130)]
    ratio_rows = [{"pe": 9.8, "pb": 1.4, "roe": 0.16, "dividend": 0.02}]

    with patch.object(I, "VirtualTradingService") as Svc, \
         patch.object(I, "fetch_ohlcv", new=AsyncMock(return_value=(ohlcv_bars, "u"))), \
         patch.object(I, "fetch_financial_report", new=AsyncMock(return_value=(ratio_rows, "u"))), \
         patch.object(I, "_load_sector_weights", new=AsyncMock(return_value={"Tài nguyên Cơ bản": 0.05})), \
         patch.object(I, "_load_sectors_for", new=AsyncMock(return_value={"HPG": "Tài nguyên Cơ bản"})):
        svc = Svc.return_value
        svc.get_portfolio = AsyncMock(return_value=portfolio)
        svc.list_trades = AsyncMock(return_value=([], 0))
        result = await I.load_inputs(db_session, user.id)

    assert result.nav == 534_000_000
    assert result.cash == 49_000_000
    assert len(result.holdings) == 1
    h = result.holdings[0]
    assert h.ticker == "HPG"
    assert h.sector == "Tài nguyên Cơ bản"
    assert h.pe == 9.8 and h.roe == 0.16
    assert len(h.closes) == 130
    assert len(result.benchmark_closes) == 130
```

(The orchestrator test in Task 14 covers the end-to-end values; this test only proves shaping.)

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_inputs.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement `inputs.py`**

Full module (imports are module-level so tests can `patch.object`):

```python
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


async def _load_sector_weights() -> dict[str, float]:
    """VN-Index sector weights by market cap (spec §1.6). {} if unavailable."""
    info = await _safe(sector_src.fetch_sector_information(icb_level=2), default=[])
    icb_names = await _safe(mo.fetch_icb_codes(), default=[])
    if not info or not icb_names:
        return {}
    name_by_code: dict[int, str] = {}
    for r in icb_names:
        code = _icb_int(r.get("icb_code"))
        if code is not None and r.get("vi_sector"):
            name_by_code[code] = r["vi_sector"]
    caps: dict[str, float] = {}
    matched = 0
    for row in info:
        code = _icb_int(row.get("icb_code"))
        cap = row.get("market_cap")
        vi = name_by_code.get(code) if code is not None else None
        if vi and isinstance(cap, (int, float)) and cap > 0:
            caps[vi] = caps.get(vi, 0.0) + float(cap)
            matched += 1
    if matched == 0:
        # Observable degrade: Layer 03 active-weight will fall back to "no benchmark".
        logger.warning("portfolio_manager: sector-weight join matched 0 sectors (ICB code mismatch?)")
    total = sum(caps.values())
    if total <= 0:
        return {}
    return {name: cap / total for name, cap in caps.items()}


async def load_inputs(db: AsyncSession, user_id) -> PortfolioInputs:
    svc = VirtualTradingService(db)
    portfolio = await svc.get_portfolio(user_id)
    account = portfolio["account"]
    cash = account.cash_available_vnd + account.cash_reserved_vnd + account.cash_pending_vnd

    raw_positions = [p for p in portfolio["positions"] if p.get("quantity_total", 0) > 0]
    tickers = [p["symbol"] for p in raw_positions]

    sectors = await _load_sectors_for(db, tickers)
    sector_weights = await _load_sector_weights()

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_inputs.py -q`
Expected: PASS

- [ ] **Step 4a: Verify the three fragile data joins against LIVE sources** (one-off, with the backend env configured)

The unit tests mock the sources, so confirm the real shapes once:
```bash
uv run python -c "
import asyncio
from app.services.market_data.sources.vietcap import fetch_financial_report, fetch_ohlcv
async def main():
    rows,_ = await fetch_financial_report('HPG', report_type='ratio', period='Y')
    print('RATIO KEYS:', sorted(rows[0].keys()) if rows else 'EMPTY')   # confirm pe/pb/roe key names
    bars,_ = await fetch_ohlcv('VNINDEX', start_ts=0, end_ts=2**31, interval='1D', count_back=140)
    print('VNINDEX bars:', len(bars))                                    # must be > 0
asyncio.run(main())
"
uv run python -c "
import asyncio
from app.services.ai.portfolio_manager.inputs import _load_sector_weights
print('SECTOR WEIGHTS:', len(asyncio.run(_load_sector_weights())), 'sectors')  # must be > 0
"
```
Expected: real ratio keys printed (reorder `_pick` candidates so the actual key is first if it differs from `pe`/`pb`/`roe`); VNINDEX bars > 0 (the market_analysis payload already uses `fetch_ohlcv("VNINDEX", count_back=260)`, so this is precedented); sector weights > 0 (if 0, the ICB-code join failed — inspect both sources' `icb_code` values and adjust `_icb_int`). Fix any mismatch before proceeding.

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/inputs.py tests/test_portfolio_manager_inputs.py
git commit -m "feat(portfolio-manager): input loader (holdings, OHLCV, fundamentals, sectors, benchmark)"
```

---

### Task 5: Layers — overview (01) + concentration (04)

**Files:**
- Create: `app/services/ai/portfolio_manager/layers.py`
- Test: `tests/test_portfolio_manager_layers_overview.py`

**Interfaces:**
- Consumes: `PortfolioInputs`, `Holding` (Task 4); a per-ticker `low_confidence: dict[str,bool]` and `holding_months: int` are passed in by the orchestrator (Task 14).
- Produces:
  - `layer_overview(inp: PortfolioInputs, low_conf: dict[str, bool], holding_months: int) -> dict` → `overview` section. `weight_i = market_value_i / nav`; `cash_pct = cash / nav`; `total_pnl = Σ unrealized_pnl`; `total_return = total_pnl / Σ cost_basis`.
  - `layer_concentration(inp: PortfolioInputs) -> dict` → `concentration` section. `hhi = Σ weight_i²` (equity only, exclude cash); `effective_n = 1/hhi`; `top1`, `top3`, `largest_sector`.
- Notes: weights here are fractions of NAV (so they sum to `1 - cash_pct`). `largest_sector` aggregates position weights by `sector`. Round floats to 3 decimals for stable JSON (use a shared `_r3`).

- [ ] **Step 1: Write the failing test** (uses a builder fixture reproducing the §8 sample)

```python
# tests/test_portfolio_manager_layers_overview.py
import math
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs
import datetime as dt


def _inp():
    # NAV 534M, cash 49.1M (≈9.2%); HPG mv 85.44M (16.0%), TCB 99.86M (18.7%)
    holdings = [
        Holding("HPG", 4000, 19500, 21360, "Thép", 85_440_000, 38_000_000, 47_440_000),
        Holding("TCB", 0, 0, 0, "Ngân hàng", 99_858_000, 9_000_000, 90_858_000),
    ]
    return PortfolioInputs(nav=534_000_000, cash=49_100_000, holdings=holdings,
                           benchmark_closes=[], sector_weights={}, inception_date=dt.date(2025, 11, 1),
                           trades=[], as_of=dt.date(2026, 6, 23))


def test_overview_weights_and_cash():
    out = L.layer_overview(_inp(), low_conf={"HPG": False, "TCB": False}, holding_months=7)
    assert math.isclose(out["cash_pct"], 49_100_000 / 534_000_000, abs_tol=1e-4)
    assert out["n_positions"] == 2
    assert out["holding_months"] == 7
    hpg = next(p for p in out["positions"] if p["ticker"] == "HPG")
    assert math.isclose(hpg["weight"], 85_440_000 / 534_000_000, abs_tol=1e-4)
    assert hpg["low_confidence"] is False


def test_concentration_hhi_and_effective_n():
    out = L.layer_concentration(_inp())
    assert out["top1"] >= out["largest_sector"] or out["top1"] <= 1.0  # sanity
    assert out["effective_n"] > 1.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_layers_overview.py -q`
Expected: FAIL (ModuleNotFoundError / AttributeError)

- [ ] **Step 3: Implement (start `layers.py` with shared helpers + these two functions)**

```python
# app/services/ai/portfolio_manager/layers.py
"""Quant layers 01–08 (spec §2). Each function is pure: inputs in, one Analysis-JSON section out."""

from __future__ import annotations

from .inputs import Holding, PortfolioInputs


def _r3(x: float | None) -> float | None:
    return None if x is None else round(float(x), 3)


def _weight(h: Holding, nav: int) -> float:
    return h.market_value / nav if nav else 0.0


def layer_overview(inp: PortfolioInputs, low_conf: dict[str, bool], holding_months: int) -> dict:
    positions = [
        {
            "ticker": h.ticker,
            "sector": h.sector,
            "weight": _r3(_weight(h, inp.nav)),
            "pnl": h.unrealized_pnl,
            "low_confidence": bool(low_conf.get(h.ticker, False)),
        }
        for h in inp.holdings
    ]
    total_pnl = sum(h.unrealized_pnl for h in inp.holdings)
    total_cost = sum(h.cost_basis for h in inp.holdings)
    return {
        "nav": inp.nav,
        "cash_pct": _r3(inp.cash / inp.nav if inp.nav else 0.0),
        "n_positions": len(inp.holdings),
        "total_return": _r3(total_pnl / total_cost if total_cost else 0.0),
        "total_pnl": total_pnl,
        "holding_months": holding_months,
        "positions": positions,
    }


def layer_concentration(inp: PortfolioInputs) -> dict:
    weights = [_weight(h, inp.nav) for h in inp.holdings]
    weights_sorted = sorted(weights, reverse=True)
    hhi = sum(w * w for w in weights)
    sector_w: dict[str, float] = {}
    for h in inp.holdings:
        sector_w[h.sector] = sector_w.get(h.sector, 0.0) + _weight(h, inp.nav)
    return {
        "top1": _r3(weights_sorted[0]) if weights_sorted else 0.0,
        "top3": _r3(sum(weights_sorted[:3])),
        "effective_n": _r3(1.0 / hhi) if hhi > 0 else 0.0,
        "largest_sector": _r3(max(sector_w.values())) if sector_w else 0.0,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_layers_overview.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/layers.py tests/test_portfolio_manager_layers_overview.py
git commit -m "feat(portfolio-manager): layers 01 overview + 04 concentration"
```

---

### Task 6: Layer — performance (02)

**Files:**
- Modify: `app/services/ai/portfolio_manager/layers.py`
- Test: `tests/test_portfolio_manager_layers_performance.py`

**Interfaces:**
- Consumes: `PortfolioInputs`, `returns.max_drawdown`, `returns.daily_returns`.
- Produces: `layer_performance(inp: PortfolioInputs) -> dict` → `performance` section. v1 simple since-inception:
  - `portfolio_return = total_pnl / total_cost` (reuse overview's basis).
  - `benchmark_return = bench_close[-1]/bench_close[0] - 1` over the SAME inception→as_of window. To align the window to inception, slice `benchmark_closes` to bars on/after `inception_date`. If the benchmark series lacks dates here (we only have closes), use the full available `benchmark_closes` window as the proxy and record `method:"simple_inception"`.
  - `excess_return = portfolio_return - benchmark_return`.
  - `max_drawdown` = `max_drawdown` of the **portfolio NAV proxy**: v1 uses the equity-weighted close series if available, else the benchmark drawdown as a floor proxy — but to stay honest, compute it from a synthesized weighted close series built by the orchestrator and passed in. To keep this layer pure and simple, accept an optional `nav_series: list[float] | None`; if `None`, set `max_drawdown` to the min of per-holding `max_drawdown` weighted — **simplify to**: `max_drawdown = max_drawdown(benchmark_closes)` as a documented v1 proxy with `method` noting it.

  **Decision (v1, explicit):** `max_drawdown` is computed from a weighted-close NAV proxy series built in Task 14 and passed via `nav_series`. This keeps the layer testable and the number meaningful. Signature: `layer_performance(inp, *, nav_series: list[float] | None = None) -> dict`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_layers_performance.py
import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _inp(bench):
    h = Holding("HPG", 4000, 19500, 21360, "Thép", 110_000_000, 10_000_000, 100_000_000)
    return PortfolioInputs(nav=534_000_000, cash=0, holdings=[h], benchmark_closes=bench,
                           sector_weights={}, inception_date=dt.date(2025, 11, 1), trades=[],
                           as_of=dt.date(2026, 6, 23))


def test_performance_excess_return():
    inp = _inp(bench=[1000.0, 1072.0])  # +7.2%
    out = L.layer_performance(inp, nav_series=[100.0, 120.0, 90.0, 110.0])
    assert math.isclose(out["portfolio_return"], 0.10, abs_tol=1e-3)   # 10M/100M
    assert math.isclose(out["benchmark_return"], 0.072, abs_tol=1e-3)
    assert math.isclose(out["excess_return"], 0.028, abs_tol=1e-3)
    assert math.isclose(out["max_drawdown"], -0.25, abs_tol=1e-3)
    assert out["method"] == "simple_inception"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_layers_performance.py -q`
Expected: FAIL (AttributeError: layer_performance)

- [ ] **Step 3: Implement (append to `layers.py`)**

```python
from . import returns as R


def layer_performance(inp: PortfolioInputs, *, nav_series: list[float] | None = None) -> dict:
    total_pnl = sum(h.unrealized_pnl for h in inp.holdings)
    total_cost = sum(h.cost_basis for h in inp.holdings)
    portfolio_return = total_pnl / total_cost if total_cost else 0.0

    bench = inp.benchmark_closes
    benchmark_return = (bench[-1] / bench[0] - 1.0) if len(bench) >= 2 and bench[0] else 0.0

    dd_source = nav_series if nav_series else bench
    mdd = R.max_drawdown(dd_source) if dd_source else 0.0

    return {
        "portfolio_return": _r3(portfolio_return),
        "benchmark_return": _r3(benchmark_return),
        "excess_return": _r3(portfolio_return - benchmark_return),
        "max_drawdown": _r3(mdd),
        "method": "simple_inception",
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_layers_performance.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/layers.py tests/test_portfolio_manager_layers_performance.py
git commit -m "feat(portfolio-manager): layer 02 performance (simple since-inception)"
```

---

### Task 7: Layer — allocation (03)

**Files:**
- Modify: `app/services/ai/portfolio_manager/layers.py`
- Test: `tests/test_portfolio_manager_layers_allocation.py`

**Interfaces:**
- Consumes: `PortfolioInputs`, `inputs.normalize_sector_name`.
- Produces: `layer_allocation(inp: PortfolioInputs) -> list[dict]` → `allocation` section. Per sector present in the portfolio: `weight` = Σ position weights; `benchmark` = VN-Index sector weight matched by normalized name (or `None` if not matched / `sector_weights` empty — **degrade, don't fabricate**); `active = weight - benchmark` (or `None`). Sorted by `weight` desc.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_layers_allocation.py
import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _inp(weights):
    h = [Holding(t, 0, 0, 0, sec, mv, 0, mv) for (t, sec, mv) in
         [("TCB", "Ngân hàng", 100_000_000), ("MBB", "Ngân hàng", 84_000_000),
          ("HPG", "Thép", 85_000_000)]]
    return PortfolioInputs(nav=534_000_000, cash=0, holdings=h, benchmark_closes=[],
                           sector_weights=weights, inception_date=None, trades=[], as_of=dt.date(2026, 6, 23))


def test_allocation_matches_benchmark_by_normalized_name():
    inp = _inp({"Ngân hàng": 0.38, "Thép": 0.05})
    out = L.layer_allocation(inp)
    nh = next(r for r in out if r["sector"] == "Ngân hàng")
    assert math.isclose(nh["weight"], 184_000_000 / 534_000_000, abs_tol=1e-3)
    assert math.isclose(nh["benchmark"], 0.38, abs_tol=1e-9)
    assert nh["active"] is not None


def test_allocation_degrades_when_no_benchmark():
    inp = _inp({})  # no VN-Index sector weights available
    out = L.layer_allocation(inp)
    assert all(r["benchmark"] is None and r["active"] is None for r in out)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_layers_allocation.py -q`
Expected: FAIL (AttributeError)

- [ ] **Step 3: Implement (append to `layers.py`)**

```python
from .inputs import normalize_sector_name


def layer_allocation(inp: PortfolioInputs) -> list[dict]:
    by_sector: dict[str, float] = {}
    for h in inp.holdings:
        by_sector[h.sector] = by_sector.get(h.sector, 0.0) + _weight(h, inp.nav)

    bench_by_norm = {normalize_sector_name(k): v for k, v in inp.sector_weights.items()}

    rows = []
    for sector, weight in by_sector.items():
        bench = bench_by_norm.get(normalize_sector_name(sector))
        rows.append({
            "sector": sector,
            "weight": _r3(weight),
            "benchmark": _r3(bench) if bench is not None else None,
            "active": _r3(weight - bench) if bench is not None else None,
        })
    rows.sort(key=lambda r: r["weight"], reverse=True)
    return rows
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_layers_allocation.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/layers.py tests/test_portfolio_manager_layers_allocation.py
git commit -m "feat(portfolio-manager): layer 03 allocation (active weight, degrades w/o benchmark)"
```

---

### Task 8: Layer — risk & correlation (05)

**Files:**
- Modify: `app/services/ai/portfolio_manager/layers.py`
- Test: `tests/test_portfolio_manager_layers_risk.py`

**Interfaces:**
- Consumes: `PortfolioInputs`, `returns.*`, `data_confidence.evaluate_confidence`.
- Produces: `layer_risk(inp: PortfolioInputs) -> tuple[dict, dict[str, bool]]` → (`risk` section, `low_conf` map). Only confident holdings (per `evaluate_confidence`) enter risk math; excluded ones go to `risk.excluded` and `low_conf[ticker]=True`. Build portfolio daily returns as Σ weight_i·r_i,t over the common window of confident holdings; `beta` vs benchmark returns; `volatility` annualized; `tracking_error = annualized stdev(r_port - r_bench)`; pairwise `correlation` for confident pairs with `value >= 0` (report all distinct pairs, caller can filter). Returns `low_conf` so the orchestrator can pass it to `layer_overview`.
- Notes: align all return series to the shortest common length (trim from the front). If fewer than 2 confident holdings, `beta/volatility/tracking_error = 0.0` and `correlation = []`.

- [ ] **Step 1: Write the failing test** (synthetic series with known beta/corr)

```python
# tests/test_portfolio_manager_layers_risk.py
import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _series_from_returns(rets, start=100.0):
    closes = [start]
    for r in rets:
        closes.append(closes[-1] * (1 + r))
    return closes


def _confident(closes):
    # pad to ≥120 bars with liquid volume so the confidence gate passes
    pad = 130 - len(closes)
    closes = [closes[0]] * max(pad, 0) + closes
    return closes


def test_risk_excludes_low_confidence_and_computes_beta():
    bench_r = [0.01, -0.02, 0.03, -0.01, 0.02] * 26  # 130 returns
    bench = _series_from_returns(bench_r)
    a_r = [2 * x for x in bench_r]                     # beta 2 asset
    a_closes = _series_from_returns(a_r)
    big = Holding("AAA", 100, 1000, 1000, "X", 100_000_000, 0, 100_000_000,
                  closes=a_closes, volumes=[1_000_000.0] * len(a_closes))
    thin = Holding("APG", 100, 1000, 1000, "CK", 8_000_000, 0, 8_000_000,
                   closes=[1000.0] * 30, volumes=[10.0] * 30)  # short history → excluded
    inp = PortfolioInputs(nav=108_000_000, cash=0, holdings=[big, thin],
                          benchmark_closes=bench, sector_weights={}, inception_date=None,
                          trades=[], as_of=dt.date(2026, 6, 23))
    risk, low_conf = L.layer_risk(inp)
    assert low_conf["APG"] is True
    assert low_conf["AAA"] is False
    assert any(e["ticker"] == "APG" for e in risk["excluded"])
    assert math.isclose(risk["beta"], 2.0, abs_tol=0.05)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_layers_risk.py -q`
Expected: FAIL (AttributeError)

- [ ] **Step 3: Implement (append to `layers.py`)**

```python
from itertools import combinations

from .data_confidence import evaluate_confidence


def layer_risk(inp: PortfolioInputs) -> tuple[dict, dict[str, bool]]:
    low_conf: dict[str, bool] = {}
    confident: list[Holding] = []
    excluded: list[dict] = []
    for h in inp.holdings:
        ok, reason = evaluate_confidence(
            [{"close": c, "volume": v} for c, v in zip(h.closes, h.volumes, strict=False)]
        )
        low_conf[h.ticker] = not ok
        if ok:
            confident.append(h)
        else:
            excluded.append({"ticker": h.ticker, "reason": reason})

    bench_returns = R.daily_returns(inp.benchmark_closes)
    per_returns = {h.ticker: R.daily_returns(h.closes) for h in confident}

    series_lengths = [len(bench_returns)] + [len(r) for r in per_returns.values()]
    n = min(series_lengths) if series_lengths else 0
    if n < 2 or len(confident) < 1:
        return ({"beta": 0.0, "volatility": 0.0, "tracking_error": 0.0,
                 "correlation": [], "excluded": excluded}, low_conf)

    bench_returns = bench_returns[-n:]
    for t in per_returns:
        per_returns[t] = per_returns[t][-n:]

    total_mv = sum(h.market_value for h in confident) or 1
    weights = {h.ticker: h.market_value / total_mv for h in confident}
    port_returns = [
        sum(weights[t] * per_returns[t][i] for t in per_returns) for i in range(n)
    ]

    beta = R.beta(port_returns, bench_returns)
    vol = R.annualized_vol(port_returns)
    te_series = [port_returns[i] - bench_returns[i] for i in range(n)]
    tracking_error = R.annualized_vol(te_series)

    corr = []
    for a, b in combinations(sorted(per_returns), 2):
        corr.append({"a": a, "b": b, "value": _r3(R.correlation(per_returns[a], per_returns[b]))})

    return ({"beta": _r3(beta), "volatility": _r3(vol), "tracking_error": _r3(tracking_error),
             "correlation": corr, "excluded": excluded}, low_conf)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_layers_risk.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/layers.py tests/test_portfolio_manager_layers_risk.py
git commit -m "feat(portfolio-manager): layer 05 risk + correlation (confidence-gated)"
```

---

### Task 9: Layers — attribution (06), quality (07), behavior (08)

**Files:**
- Modify: `app/services/ai/portfolio_manager/layers.py`
- Test: `tests/test_portfolio_manager_layers_rest.py`

**Interfaces:**
- Produces:
  - `layer_attribution(inp) -> list[dict]` — per holding `{ticker, pnl, pct}` where `pct = pnl / total_pnl`. Sorted by abs(pnl) desc.
  - `layer_quality(inp) -> dict` — weight-weighted `pe/pb/roe/dividend` over holdings with non-None values (weights renormalized over those holdings); `sector_benchmark` is computed by the orchestrator (needs per-stock period returns) and merged in Task 14 — this function returns `sector_benchmark: None` placeholder.
  - `layer_behavior(inp) -> dict` — from `inp.trades`: `avg_holding_days` (mean days between matched BUY→SELL per symbol, FIFO), `losing_count` (holdings with `unrealized_pnl < 0`), `disposition_flag` (`avg_hold_losers_held > avg_hold_winners_sold * 1.5`), `worst_loser` (`{ticker, pnl_pct, periods_held}` for the most-negative `unrealized_pnl/cost_basis` holding; `periods_held` defaults to 1 here, overwritten by the orchestrator from snapshot history).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_layers_rest.py
import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _inp():
    h = [
        Holding("HPG", 1, 1, 1, "Thép", 100, 38_000_000, 100, pe=9.8, pb=1.4, roe=0.16, dividend=0.02),
        Holding("VND", 1, 1, 1, "CK", 100, -7_000_000, 47_000_000, pe=15.0, pb=1.1, roe=0.08, dividend=0.0),
    ]
    return PortfolioInputs(nav=200, cash=0, holdings=h, benchmark_closes=[], sector_weights={},
                           inception_date=None, trades=[], as_of=dt.date(2026, 6, 23))


def test_attribution_pct_sums_to_one_ish():
    out = L.layer_attribution(_inp())
    total = sum(r["pnl"] for r in out)
    assert total == 31_000_000
    hpg = next(r for r in out if r["ticker"] == "HPG")
    assert math.isclose(hpg["pct"], 38_000_000 / 31_000_000, abs_tol=1e-3)


def test_quality_weighted_pe():
    out = L.layer_quality(_inp())
    assert out["pe"] is not None and out["roe"] is not None
    assert out["sector_benchmark"] is None


def test_behavior_losing_count_and_worst_loser():
    out = L.layer_behavior(_inp())
    assert out["losing_count"] == 1
    assert out["worst_loser"]["ticker"] == "VND"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_layers_rest.py -q`
Expected: FAIL (AttributeError)

- [ ] **Step 3: Implement (append to `layers.py`)**

```python
def layer_attribution(inp: PortfolioInputs) -> list[dict]:
    total = sum(h.unrealized_pnl for h in inp.holdings)
    rows = [
        {"ticker": h.ticker, "pnl": h.unrealized_pnl,
         "pct": _r3(h.unrealized_pnl / total) if total else None}
        for h in inp.holdings
    ]
    rows.sort(key=lambda r: abs(r["pnl"]), reverse=True)
    return rows


def _weighted(inp: PortfolioInputs, attr: str) -> float | None:
    pairs = [(h, getattr(h, attr)) for h in inp.holdings if getattr(h, attr) is not None]
    total_mv = sum(h.market_value for h, _ in pairs)
    if total_mv <= 0:
        return None
    return sum((h.market_value / total_mv) * v for h, v in pairs)


def layer_quality(inp: PortfolioInputs) -> dict:
    return {
        "pe": _r3(_weighted(inp, "pe")),
        "pb": _r3(_weighted(inp, "pb")),
        "roe": _r3(_weighted(inp, "roe")),
        "dividend": _r3(_weighted(inp, "dividend")),
        "sector_benchmark": None,  # merged by orchestrator (needs per-stock returns)
    }


def layer_behavior(inp: PortfolioInputs) -> dict:
    avg_holding_days = _avg_holding_days(inp.trades)
    losers = [h for h in inp.holdings if h.unrealized_pnl < 0]
    worst = None
    if losers:
        w = min(losers, key=lambda h: (h.unrealized_pnl / h.cost_basis) if h.cost_basis else 0.0)
        worst = {
            "ticker": w.ticker,
            "pnl_pct": _r3(w.unrealized_pnl / w.cost_basis) if w.cost_basis else None,
            "periods_held": 1,  # overwritten by orchestrator from snapshot history
        }
    return {
        "avg_holding_days": avg_holding_days,
        "losing_count": len(losers),
        "disposition_flag": _disposition_flag(inp.trades),
        "worst_loser": worst,
    }


def _avg_holding_days(trades) -> int:
    # FIFO match BUY→SELL per symbol; average (sell_date - buy_date) in days over closed legs.
    from collections import defaultdict, deque
    buys: dict[str, deque] = defaultdict(deque)
    spans: list[float] = []
    for t in sorted(trades, key=lambda x: x.traded_at):
        side = str(t.side)
        if side.endswith("buy"):
            buys[t.symbol].extend([t.traded_at] * t.quantity)
        elif side.endswith("sell"):
            for _ in range(t.quantity):
                if buys[t.symbol]:
                    bt = buys[t.symbol].popleft()
                    spans.append((t.traded_at - bt).days)
    return int(round(sum(spans) / len(spans))) if spans else 0


def _disposition_flag(trades) -> bool:
    # avg holding days of SOLD winners vs (proxy) sold losers; flag if losers held ≥1.5× longer.
    from collections import defaultdict, deque
    buys: dict[str, deque] = defaultdict(deque)
    winner_days: list[float] = []
    loser_days: list[float] = []
    for t in sorted(trades, key=lambda x: x.traded_at):
        side = str(t.side)
        if side.endswith("buy"):
            buys[t.symbol].extend([(t.traded_at, t.price_vnd)] * t.quantity)
        elif side.endswith("sell"):
            for _ in range(t.quantity):
                if buys[t.symbol]:
                    bt, bp = buys[t.symbol].popleft()
                    days = (t.traded_at - bt).days
                    (winner_days if t.price_vnd >= bp else loser_days).append(days)
    if not winner_days or not loser_days:
        return False
    avg_w = sum(winner_days) / len(winner_days)
    avg_l = sum(loser_days) / len(loser_days)
    return avg_l > avg_w * 1.5
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_layers_rest.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/layers.py tests/test_portfolio_manager_layers_rest.py
git commit -m "feat(portfolio-manager): layers 06 attribution, 07 quality, 08 behavior"
```

---

### Task 10: Scoring (`scoring.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/scoring.py`
- Test: `tests/test_portfolio_manager_scoring.py`

**Interfaces:**
- Consumes: the assembled section dicts (`performance`, `risk`, `concentration`, `quality`, `behavior`).
- Produces:
  - `score_pillars(performance, risk, concentration, quality, behavior) -> dict[str,int]` with keys `performance, risk, diversification, quality, discipline`, each 1–5, via the §3 threshold table.
  - `overall_score(pillars: dict[str,int]) -> float` = `round(mean(values), 1)`.
- Threshold tables encode §3 (give it as a small mapping). Each pillar maps its driving metric through ordered thresholds.

- [ ] **Step 1: Write the failing test** (reproduce §8 sample → overall 3.5, pillars {4,3,3,4,2})

```python
# tests/test_portfolio_manager_scoring.py
from app.services.ai.portfolio_manager import scoring as S


def test_pillars_match_sample():
    pillars = S.score_pillars(
        performance={"excess_return": 0.035},
        risk={"beta": 1.25},
        concentration={"effective_n": 5.8},
        quality={"roe": 0.18, "pe": 11.4},
        behavior={"disposition_flag": True, "losing_count": 3},
        max_corr=0.82,
    )
    assert pillars == {"performance": 4, "risk": 3, "diversification": 3, "quality": 4, "discipline": 2}


def test_overall_is_mean_rounded_1dp():
    assert S.overall_score({"performance": 4, "risk": 3, "diversification": 3, "quality": 4, "discipline": 2}) == 3.2
    assert S.overall_score({"performance": 4, "risk": 4, "diversification": 3, "quality": 4, "discipline": 2}) == 3.4
```

(Note: the §8 sample pillars average to 3.2; the headline "overall 3.5" in the HTML is the *current* period while 3.2 is `prev_overall`. The orchestrator sets `prev_overall` from the previous snapshot; `overall` is computed from current pillars. The test asserts the scoring function's mean, not the narrative's 3.5.)

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_scoring.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement**

```python
# app/services/ai/portfolio_manager/scoring.py
"""5-pillar health scoring (spec §3). Each pillar 1–5; overall = mean rounded 1dp."""

from __future__ import annotations


def _score_performance(excess_return: float) -> int:
    if excess_return > 0.05:
        return 5
    if excess_return > 0.02:
        return 4
    if excess_return >= -0.02:
        return 3
    if excess_return >= -0.08:
        return 2
    return 1


def _score_risk(beta: float) -> int:
    if 0.8 <= beta <= 1.1:
        return 5
    if 1.1 < beta <= 1.15 or 0.7 <= beta < 0.8:
        return 4
    if 1.15 < beta <= 1.3:
        return 3
    if 1.3 < beta <= 1.5:
        return 2
    return 1


def _score_diversification(effective_n: float, max_corr: float) -> int:
    # Base score from breadth (effective number of holdings)...
    if effective_n > 8 and max_corr < 0.5:
        base = 5
    elif effective_n > 6:
        base = 4
    elif effective_n >= 4:
        base = 3
    elif effective_n >= 3:
        base = 2
    else:
        base = 1
    # ...then a high-correlation penalty CAPS (never collapses) the score.
    if max_corr > 0.8:
        base = min(base, 3)
    return base
    # Verify: (effective_n=5.8, max_corr=0.82) → base 3, cap min(3,3) = 3 ✓ (matches the sample test)


def _score_quality(roe: float, pe: float) -> int:
    if roe > 0.18 and pe < 12:
        return 5
    if roe >= 0.15:
        return 4
    if roe >= 0.12:
        return 3
    if roe >= 0.08:
        return 2
    return 1


def _score_discipline(disposition_flag: bool, losing_count: int) -> int:
    if not disposition_flag and losing_count == 0:
        return 5
    if not disposition_flag and losing_count <= 1:
        return 4
    if not disposition_flag:
        return 3
    if losing_count <= 2:
        return 3
    return 2


def score_pillars(performance, risk, concentration, quality, behavior, *, max_corr: float) -> dict[str, int]:
    return {
        "performance": _score_performance(performance.get("excess_return") or 0.0),
        "risk": _score_risk(risk.get("beta") or 0.0),
        "diversification": _score_diversification(concentration.get("effective_n") or 0.0, max_corr),
        "quality": _score_quality(quality.get("roe") or 0.0, quality.get("pe") or 99.0),
        "discipline": _score_discipline(bool(behavior.get("disposition_flag")), behavior.get("losing_count") or 0),
    }


def overall_score(pillars: dict[str, int]) -> float:
    vals = list(pillars.values())
    return round(sum(vals) / len(vals), 1) if vals else 0.0
```

The bands above are pinned to the sample fixture: `_score_risk(1.25)` → 3 (1.15 < 1.25 ≤ 1.3); `_score_diversification(5.8, 0.82)` → 3; `_score_quality(0.18, 11.4)` → 4 (roe ≥ 0.15); `_score_performance(0.035)` → 4; `_score_discipline(True, 3)` → 2. Mean of {4,3,3,4,2} = 3.2. Do not change the bands unless a test demands it.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_scoring.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/scoring.py tests/test_portfolio_manager_scoring.py
git commit -m "feat(portfolio-manager): 5-pillar scoring (spec §3)"
```

---

### Task 11: Insight selection (`insights.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/insights.py`
- Test: `tests/test_portfolio_manager_insights.py`

**Interfaces:**
- Consumes: the assembled Analysis JSON sections (`overview`, `allocation`, `risk`, `attribution`, `quality`, `behavior`) + `config` thresholds.
- Produces: `select_insights(analysis: dict) -> list[dict]` — evaluates 6 templates, returns up to 2 with the highest `severity`, guaranteeing ≥1 positive (`healthy_focus`) is preferred when eligible. Each item `{"id": str, "data": {...}}`. The 6 templates (§5): `hidden_corr`, `profit_concentration`, `sector_tilt`, `holding_losers`, `cash_dry`, `healthy_focus`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_insights.py
from app.services.ai.portfolio_manager.insights import select_insights


def _analysis(**over):
    base = {
        "overview": {"cash_pct": 0.092, "positions": [
            {"ticker": "TCB", "weight": 0.187}, {"ticker": "MBB", "weight": 0.157}]},
        "allocation": [{"sector": "Thép", "weight": 0.16, "benchmark": 0.05, "active": 0.11}],
        "risk": {"correlation": [{"a": "TCB", "b": "MBB", "value": 0.82}]},
        "attribution": [{"ticker": "HPG", "pnl": 38_000_000, "pct": 0.63}],
        "quality": {"roe": 0.18, "pe": 11.4},
        "behavior": {"disposition_flag": True},
    }
    base.update(over)
    return base


def test_guarantees_positive_when_eligible_and_caps_at_two():
    out = select_insights(_analysis())
    ids = [i["id"] for i in out]
    assert 1 <= len(out) <= 2
    # healthy_focus is eligible (top1 0.187 < 0.25, roe 0.18, pe 11.4) → must appear, exactly once,
    # alongside (at most) the single strongest negative — never evicted by a second positive.
    assert ids.count("healthy_focus") == 1
    assert all(i not in ("healthy_focus",) for i in ids if ids.index(i) != ids.index("healthy_focus")) or len(out) == 1


def test_hidden_corr_payload_when_only_firing_template():
    a = {
        "overview": {"cash_pct": 0.2, "positions": [{"ticker": "TCB", "weight": 0.2}, {"ticker": "MBB", "weight": 0.2}]},
        "allocation": [{"sector": "Ngân hàng", "weight": 0.4, "benchmark": 0.38, "active": 0.02}],
        "risk": {"correlation": [{"a": "TCB", "b": "MBB", "value": 0.82}]},
        "attribution": [{"ticker": "HPG", "pnl": 1, "pct": 0.1}],
        "quality": {"roe": 0.05, "pe": 20.0},   # healthy_focus ineligible
        "behavior": {"disposition_flag": False},
    }
    out = select_insights(a)
    hc = next((i for i in out if i["id"] == "hidden_corr"), None)
    assert hc is not None
    assert hc["data"]["pair"] == ["TCB", "MBB"]
    assert hc["data"]["corr"] == 0.82
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_insights.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement**

```python
# app/services/ai/portfolio_manager/insights.py
"""Insight template library + selection (spec §5). 6 starter templates."""

from __future__ import annotations

from .config import (
    CASH_DRY_MAX,
    HIDDEN_CORR_MIN,
    PROFIT_CONCENTRATION_MIN,
    SECTOR_TILT_RATIO_MIN,
)


def _hidden_corr(a: dict) -> dict | None:
    weights = {p["ticker"]: p.get("weight") or 0.0 for p in a["overview"]["positions"]}
    best = None
    for pair in a["risk"].get("correlation", []):
        combined = (weights.get(pair["a"], 0.0) + weights.get(pair["b"], 0.0))
        if pair["value"] > HIDDEN_CORR_MIN and combined > 0.2:
            severity = pair["value"] * combined
            if best is None or severity > best["severity"]:
                best = {"id": "hidden_corr", "severity": severity,
                        "data": {"pair": [pair["a"], pair["b"]], "corr": pair["value"],
                                 "combined_weight": round(combined, 3)}}
    return best


def _profit_concentration(a: dict) -> dict | None:
    rows = a.get("attribution", [])
    top = max((r.get("pct") or 0.0 for r in rows), default=0.0)
    if top > PROFIT_CONCENTRATION_MIN:
        return {"id": "profit_concentration", "severity": top, "data": {"max_contribution_pct": round(top, 3)}}
    return None


def _sector_tilt(a: dict) -> dict | None:
    best = None
    for row in a.get("allocation", []):
        bench = row.get("benchmark")
        if bench and bench > 0:
            ratio = row["weight"] / bench
            if ratio > SECTOR_TILT_RATIO_MIN and (best is None or ratio > best["severity"]):
                best = {"id": "sector_tilt", "severity": ratio,
                        "data": {"sector": row["sector"], "ratio": round(ratio, 2), "weight": row["weight"]}}
    return best


def _holding_losers(a: dict) -> dict | None:
    if a["behavior"].get("disposition_flag"):
        worst = a["behavior"].get("worst_loser") or {}
        periods = worst.get("periods_held", 1)
        return {"id": "holding_losers", "severity": float(periods), "data": worst}
    return None


def _cash_dry(a: dict) -> dict | None:
    cash_pct = a["overview"].get("cash_pct") or 0.0
    if cash_pct < CASH_DRY_MAX:
        return {"id": "cash_dry", "severity": CASH_DRY_MAX - cash_pct, "data": {"cash_pct": cash_pct}}
    return None


def _healthy_focus(a: dict) -> dict | None:
    # positive: concentrated but in quality names (high roe, reasonable pe)
    q = a.get("quality", {})
    roe, pe = q.get("roe") or 0.0, q.get("pe") or 99.0
    top1 = max((p.get("weight") or 0.0 for p in a["overview"]["positions"]), default=0.0)
    if roe >= 0.15 and pe < 13 and top1 < 0.25:
        return {"id": "healthy_focus", "severity": roe, "data": {"roe": roe, "pe": pe}}
    return None


_TEMPLATES = [_hidden_corr, _profit_concentration, _sector_tilt, _holding_losers, _cash_dry, _healthy_focus]
_POSITIVE = {"healthy_focus"}


def select_insights(analysis: dict) -> list[dict]:
    hits = [t(analysis) for t in _TEMPLATES]
    hits = [h for h in hits if h is not None]
    hits.sort(key=lambda h: h["severity"], reverse=True)

    negatives = [h for h in hits if h["id"] not in _POSITIVE]
    positive = next((h for h in hits if h["id"] in _POSITIVE), None)

    # Spec §5: guarantee a positive note when one is eligible — but WITHOUT evicting the
    # single strongest warning. So: strongest negative + the positive (≤2). When no positive
    # is eligible, take the top-2 negatives by severity.
    if positive is not None:
        chosen = ([negatives[0]] if negatives else []) + [positive]
    else:
        chosen = negatives[:2]

    return [{"id": h["id"], "data": h["data"]} for h in chosen]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_insights.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/insights.py tests/test_portfolio_manager_insights.py
git commit -m "feat(portfolio-manager): insight selection (6 starter templates, spec §5)"
```

---

### Task 12: PortfolioReport model + registration + migration

**Files:**
- Create: `app/models/portfolio_report.py`
- Modify: `app/models/__init__.py` (register), `alembic/env.py` (import for autogenerate)
- Create: `alembic/versions/<hash>_add_portfolio_report_table.py`
- Test: `tests/test_portfolio_manager_model.py`

**Interfaces:**
- Produces: `PortfolioReport(UUIDMixin, TimestampMixin, Base)` table `portfolio_reports`, columns:
  - `account_id: uuid.UUID` FK `virtual_trading_accounts.id` ondelete CASCADE, indexed.
  - `session_date: date` (indexed).
  - `period_number: int`, `mode: str(20)`.
  - `analysis_json: JSON`, `narrative_json: JSON | None`.
  - `scores: JSON | None`, `recommended_actions: JSON | None`, `watch_conditions: JSON | None`, `holdings_snapshot: JSON | None`.
  - `model_used: str(50) | None`, `generation_time_ms: int | None`, `valid: bool` server_default true.
  - `__table_args__ = (UniqueConstraint("account_id", "session_date", name="uq_portfolio_reports_account_date"),)`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_model.py
import datetime as dt
import uuid
import pytest
from sqlalchemy import select
from app.models.portfolio_report import PortfolioReport


@pytest.mark.asyncio
async def test_portfolio_report_persists(db_session):
    row = PortfolioReport(
        account_id=uuid.uuid4(), session_date=dt.date(2026, 6, 23),
        period_number=1, mode="first", analysis_json={"overview": {}},
        narrative_json=None, scores={"overall": 3.5}, valid=True,
    )
    db_session.add(row)
    await db_session.flush()
    found = (await db_session.execute(select(PortfolioReport))).scalar_one()
    assert found.mode == "first"
    assert found.analysis_json == {"overview": {}}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_model.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Create the model**

```python
# app/models/portfolio_report.py
"""Persisted portfolio-manager report, keyed by (account_id, session_date) — the day-cache."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class PortfolioReport(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "portfolio_reports"
    __table_args__ = (
        UniqueConstraint("account_id", "session_date", name="uq_portfolio_reports_account_date"),
        Index("ix_portfolio_reports_account_date", "account_id", "session_date"),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("virtual_trading_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    period_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    analysis_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    narrative_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recommended_actions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    watch_conditions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    holdings_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(50), nullable=True)
    generation_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    valid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
```

- [ ] **Step 4: Register the model**

In `app/models/__init__.py`, add (alphabetically near the other imports):
```python
from app.models.portfolio_report import PortfolioReport  # noqa: F401
```
In `alembic/env.py`, add to the model-import block:
```python
from app.models.portfolio_report import PortfolioReport  # noqa: F401, E402
```

- [ ] **Step 5: Run test to verify it passes (sqlite create_all picks up the new model)**

Run: `uv run pytest tests/test_portfolio_manager_model.py -q`
Expected: PASS

- [ ] **Step 6: Generate the Alembic migration**

Run: `uv run alembic revision --autogenerate -m "add portfolio report table"`
Then open the generated file in `alembic/versions/` and verify it creates `portfolio_reports` with the unique constraint + indexes and FK to `virtual_trading_accounts` with `ondelete="CASCADE"`. If autogenerate misses the FK ondelete or index names, hand-edit to match the `op.f(...)` naming convention used in `c1d2e3f4a5b6_add_watchlist_items_table.py`.

- [ ] **Step 7: Apply + verify the migration round-trips**

Run: `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`
Expected: no errors; table created, dropped, recreated.

- [ ] **Step 8: Commit**

```bash
git add app/models/portfolio_report.py app/models/__init__.py alembic/env.py alembic/versions/*portfolio_report*.py tests/test_portfolio_manager_model.py
git commit -m "feat(portfolio-manager): PortfolioReport model + migration (day-cache + snapshot)"
```

---

### Task 13: Repository (`portfolio_manager.py`)

**Files:**
- Create: `app/repositories/portfolio_manager.py`
- Test: `tests/test_portfolio_manager_repository.py`

**Interfaces:**
- Consumes: `PortfolioReport`, `AsyncSession`.
- Produces: `PortfolioReportRepository(session)`:
  - `async get_for_date(account_id, session_date) -> PortfolioReport | None`.
  - `async get_latest(account_id) -> PortfolioReport | None` (order by `session_date` desc).
  - `async list_recent(account_id, limit=10) -> list[PortfolioReport]`.
  - `async insert(report: PortfolioReport) -> PortfolioReport` (`session.add` + `flush`).
  - `async count_for_account(account_id) -> int`.
- Notes: `flush()` only, never `commit()` (request auto-commits).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_repository.py
import datetime as dt
import uuid
import pytest
from app.models.portfolio_report import PortfolioReport
from app.repositories.portfolio_manager import PortfolioReportRepository


@pytest.mark.asyncio
async def test_get_for_date_and_latest(db_session):
    repo = PortfolioReportRepository(db_session)
    acct = uuid.uuid4()
    await repo.insert(PortfolioReport(account_id=acct, session_date=dt.date(2026, 6, 20),
                                      period_number=1, mode="first", analysis_json={}, valid=True))
    await repo.insert(PortfolioReport(account_id=acct, session_date=dt.date(2026, 6, 23),
                                      period_number=2, mode="full_changed", analysis_json={}, valid=True))
    assert (await repo.get_for_date(acct, dt.date(2026, 6, 23))).period_number == 2
    assert (await repo.get_latest(acct)).session_date == dt.date(2026, 6, 23)
    assert await repo.count_for_account(acct) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_repository.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement**

```python
# app/repositories/portfolio_manager.py
"""Data access for PortfolioReport (day-cache + history)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.portfolio_report import PortfolioReport


class PortfolioReportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_for_date(self, account_id: uuid.UUID, session_date: date) -> PortfolioReport | None:
        res = await self._session.execute(
            select(PortfolioReport).where(
                PortfolioReport.account_id == account_id,
                PortfolioReport.session_date == session_date,
            )
        )
        return res.scalar_one_or_none()

    async def get_latest(self, account_id: uuid.UUID) -> PortfolioReport | None:
        res = await self._session.execute(
            select(PortfolioReport)
            .where(PortfolioReport.account_id == account_id)
            .order_by(PortfolioReport.session_date.desc())
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def list_recent(self, account_id: uuid.UUID, limit: int = 10) -> list[PortfolioReport]:
        res = await self._session.execute(
            select(PortfolioReport)
            .where(PortfolioReport.account_id == account_id)
            .order_by(PortfolioReport.session_date.desc())
            .limit(limit)
        )
        return list(res.scalars().all())

    async def count_for_account(self, account_id: uuid.UUID) -> int:
        res = await self._session.execute(
            select(func.count()).select_from(PortfolioReport).where(
                PortfolioReport.account_id == account_id
            )
        )
        return int(res.scalar() or 0)

    async def insert(self, report: PortfolioReport) -> PortfolioReport:
        self._session.add(report)
        await self._session.flush()
        return report
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_repository.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/repositories/portfolio_manager.py tests/test_portfolio_manager_repository.py
git commit -m "feat(portfolio-manager): PortfolioReport repository"
```

---

### Task 14: Analysis orchestrator (`analysis.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/analysis.py`
- Test: `tests/test_portfolio_manager_analysis.py`

**Interfaces:**
- Consumes: `inputs.load_inputs`, all `layers.*`, `scoring.*`, `insights.select_insights`, `PortfolioReportRepository`, `config.MIN_POSITIONS_FOR_ANALYSIS`, `config.CHANGED_WEIGHT_THRESHOLD`.
- Produces: `async build_analysis(db, user_id) -> dict` returning either the full Analysis JSON (§8) or `{"insufficient_data": True, "reason": <vi>}`. Steps:
  1. `inp = await load_inputs(db, user_id)`. If `len(inp.holdings) < MIN_POSITIONS_FOR_ANALYSIS` or no trades → return insufficient.
  2. Build a NAV proxy close series (equity-weighted, normalized) for `max_drawdown` (pass to `layer_performance`).
  3. `risk, low_conf = layer_risk(inp)`; compute `holding_months` from `inp.inception_date` → `as_of`.
  4. Assemble sections: overview/performance/allocation/concentration/risk/attribution/quality/behavior.
  5. `max_corr` = max correlation value (or 0); `pillars = score_pillars(...)`; `overall = overall_score(pillars)`.
  6. Resolve `mode` + `prev_overall` + `progress.prev_actions` + `worst_loser.periods_held` from the previous snapshot (via repo `get_latest`). `period_number = count_for_account + 1`.
  7. `selected_insights = select_insights(analysis_so_far)`.
  8. Merge `quality.sector_benchmark` if any sector exceeds `SECTOR_BENCH_THRESHOLD` (compute `your_return` vs `industry_return` — v1: leave as `None` if per-sector return series unavailable; document). 
  9. Return the full dict with `meta` (`portfolio_id` = str(account_id)[:8], `date`, `mode`, `period`, `period_number`).
- `holdings_changed(prev_snapshot, current_weights)` helper (§7).

- [ ] **Step 1: Write the failing test** (mock `load_inputs` to return the sample portfolio; assert §8 shape + insufficient path)

```python
# tests/test_portfolio_manager_analysis.py
import datetime as dt
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.portfolio_manager import analysis as A
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _sample_inputs():
    bench = [1000.0 * (1.0007 ** i) for i in range(130)]
    def closes(drift):
        return [100.0 * ((1 + drift) ** i) for i in range(130)]
    h = [
        Holding("HPG", 4000, 19500, 21360, "Thép", 85_440_000, 38_000_000, 47_440_000,
                closes=closes(0.002), volumes=[2_000_000.0] * 130, pe=9.8, pb=1.4, roe=0.16, dividend=0.02),
        Holding("TCB", 1000, 30000, 34000, "Ngân hàng", 99_858_000, 9_000_000, 90_858_000,
                closes=closes(0.0015), volumes=[2_000_000.0] * 130, pe=8.0, pb=1.2, roe=0.20, dividend=0.015),
        Holding("MBB", 1000, 22000, 24000, "Ngân hàng", 83_838_000, 6_000_000, 77_838_000,
                closes=closes(0.0015), volumes=[2_000_000.0] * 130, pe=7.5, pb=1.1, roe=0.21, dividend=0.02),
    ]
    return PortfolioInputs(nav=534_000_000, cash=49_100_000, holdings=h, benchmark_closes=bench,
                           sector_weights={"Ngân hàng": 0.38, "Thép": 0.05}, inception_date=dt.date(2025, 11, 23),
                           trades=[_T("HPG", "buy", 4000, 19500, dt.datetime(2025, 11, 23))], as_of=dt.date(2026, 6, 23))


class _T:
    def __init__(self, symbol, side, quantity, price_vnd, traded_at):
        self.symbol, self.side, self.quantity, self.price_vnd, self.traded_at = symbol, side, quantity, price_vnd, traded_at


@pytest.mark.asyncio
async def test_build_analysis_full_shape(db_session, premium_user):
    user, _ = premium_user
    with patch.object(A, "load_inputs", new=AsyncMock(return_value=_sample_inputs())), \
         patch.object(A, "_resolve_account_id", new=AsyncMock(return_value=uuid.UUID("00000000-0000-0000-0000-000000000009"))):
        out = await A.build_analysis(db_session, user.id)
    assert "insufficient_data" not in out
    assert set(out) >= {"meta", "overview", "performance", "allocation", "concentration",
                        "risk", "attribution", "quality", "behavior", "scores", "selected_insights", "progress"}
    assert out["overview"]["n_positions"] == 3
    assert out["scores"]["overall"] >= 1.0
    assert out["meta"]["mode"] == "first"  # no previous snapshot


@pytest.mark.asyncio
async def test_build_analysis_insufficient(db_session, premium_user):
    user, _ = premium_user
    empty = PortfolioInputs(nav=1_000_000_000, cash=1_000_000_000, holdings=[], benchmark_closes=[],
                            sector_weights={}, inception_date=None, trades=[], as_of=dt.date(2026, 6, 23))
    with patch.object(A, "load_inputs", new=AsyncMock(return_value=empty)), \
         patch.object(A, "_resolve_account_id", new=AsyncMock(return_value=uuid.UUID("00000000-0000-0000-0000-000000000009"))):
        out = await A.build_analysis(db_session, user.id)
    assert out["insufficient_data"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_analysis.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement `analysis.py`**

```python
# app/services/ai/portfolio_manager/analysis.py
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
```

(The `sector_benchmark` merge in step 8 stays `None` in v1 — `layer_quality` already returns it as `None`. Note this in a code comment; full sector-return attribution is deferred.)

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_analysis.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/analysis.py tests/test_portfolio_manager_analysis.py
git commit -m "feat(portfolio-manager): analysis orchestrator → Analysis JSON (spec §8)"
```

---

### Task 15: System prompt file + `prompts.py`

**Files:**
- Create: `backend/docs/ai/ai-portfolio-manager.md` (clean original of the user's `IQX-Danh-Muc-SystemPrompt.md`)
- Create: `app/services/ai/portfolio_manager/prompts.py`
- Test: `tests/test_portfolio_manager_prompts.py`

**⚠️ Dependency:** the clean system prompt markdown at `backend/docs/ai/ai-portfolio-manager.md` must already exist (created in **Task 0**). Do not start this task until Task 0 is committed.

**Interfaces:**
- Consumes: the Analysis JSON dict.
- Produces:
  - `SYSTEM_PROMPT: str` — read once from `backend/docs/ai/ai-portfolio-manager.md` via pathlib (cached).
  - `build_user_prompt(analysis: dict) -> str` — wraps the analysis JSON per the prompt's INPUT convention.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_prompts.py
from app.services.ai.portfolio_manager import prompts as P


def test_system_prompt_loaded_and_nonempty():
    assert isinstance(P.SYSTEM_PROMPT, str)
    assert len(P.SYSTEM_PROMPT) > 200


def test_user_prompt_embeds_analysis_json():
    up = P.build_user_prompt({"meta": {"date": "2026-06-23"}, "overview": {"nav": 534000000}})
    assert "analysis_json" in up
    assert "534000000" in up
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_prompts.py -q`
Expected: FAIL (ModuleNotFoundError, or FileNotFoundError if md missing)

- [ ] **Step 3: Implement `prompts.py`** (the markdown already exists from Task 0):

```python
# app/services/ai/portfolio_manager/prompts.py
"""System + user prompt builders for the portfolio-manager narrative tier."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

# prompts.py lives at backend/app/services/ai/portfolio_manager/prompts.py
# parents[0]=portfolio_manager [1]=ai [2]=services [3]=app [4]=backend → docs/ai is under backend/
_PROMPT_PATH = Path(__file__).resolve().parents[4] / "docs" / "ai" / "ai-portfolio-manager.md"


@lru_cache(maxsize=1)
def _load_system_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


SYSTEM_PROMPT = _load_system_prompt()

_USER_TEMPLATE = (
    "Đây là Analysis JSON cho báo cáo kỳ này. "
    "Hãy viết Narrative JSON theo đúng system prompt.\n\n"
    "<analysis_json>\n{analysis_json}\n</analysis_json>"
)


def build_user_prompt(analysis: dict) -> str:
    return _USER_TEMPLATE.format(analysis_json=json.dumps(analysis, ensure_ascii=False, indent=2))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_prompts.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/prompts.py tests/test_portfolio_manager_prompts.py
git commit -m "feat(portfolio-manager): prompt builders (system prompt committed in Task 0)"
```

---

### Task 16: Narrative validator (`validator.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/validator.py`
- Test: `tests/test_portfolio_manager_validator.py`

**Interfaces:**
- Consumes: the Narrative JSON dict + the Analysis JSON dict.
- Produces: `validate_narrative(narrative: dict, analysis: dict) -> list[str]` (empty = valid). Rules (spec §10), each appends a `"CODE: message"`:
  - `STRUCT`: required keys present (`title, verdict, lede, layers, actions, closing`; `progress_text` required unless `mode=="first"`).
  - `ACTIONS_COUNT`: `len(actions) <= 3`.
  - `ACTIONS_NUMBER`: every `actions[i].detail` contains a digit (`re.search(r"\d", detail)`).
  - `FORBIDDEN_RECO`: no "khuyến nghị mua", "khuyến nghị bán".
  - `FORBIDDEN_CERTAINTY`: no "chắc chắn tăng", "chắc chắn giảm".
  - `DECIMAL_COMMA`: any `\d+\.\d` (dot-decimal) in rendered strings is flagged (Vietnamese uses comma).
  - `INSIGHT`: if `analysis.selected_insights` non-empty, `insight.text` non-empty.
  - `LOW_DATA`: `low_data_note` non-empty iff `analysis.risk.excluded` non-empty.
  - `PROGRESS_FIRST`: `progress_text` empty when `mode=="first"`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_validator.py
from app.services.ai.portfolio_manager.validator import validate_narrative


def _good():
    return {
        "title": "Danh mục khỏe lên", "verdict": "Một danh mục đang khỏe lên.",
        "lede": "Một câu mở đầu.", "progress_text": "Bạn đã làm đúng.",
        "layers": {k: "Một đoạn phân tích." for k in
                   ("overview", "performance", "allocation", "stress", "risk", "attribution", "quality", "behavior")},
        "insight": {"label": "Điều bạn chưa để ý", "text": "TCB và MBB vận động cùng nhịp."},
        "low_data_note": "Với APG tôi chưa chấm điểm rủi ro.",
        "actions": [{"title": "Dứt điểm VND", "detail": "Mã đang lỗ 15,0% — đặt ngưỡng dừng."}],
        "watch": "Ba mốc.", "closing": "Bạn đang đi đúng hướng.",
    }


def _analysis():
    return {"meta": {"mode": "full_changed"}, "selected_insights": [{"id": "hidden_corr"}],
            "risk": {"excluded": [{"ticker": "APG"}]}}


def test_good_narrative_passes():
    assert validate_narrative(_good(), _analysis()) == []


def test_action_without_number_flagged():
    n = _good()
    n["actions"] = [{"title": "Xem lại", "detail": "Cân nhắc giảm bớt ngân hàng."}]  # no digit
    errs = validate_narrative(n, _analysis())
    assert any(e.startswith("ACTIONS_NUMBER") for e in errs)


def test_forbidden_recommendation_flagged():
    n = _good()
    n["closing"] = "Tôi khuyến nghị mua thêm HPG."
    assert any(e.startswith("FORBIDDEN_RECO") for e in validate_narrative(n, _analysis()))


def test_dot_decimal_flagged():
    n = _good()
    n["verdict"] = "Danh mục tăng 10.7%."
    assert any(e.startswith("DECIMAL_COMMA") for e in validate_narrative(n, _analysis()))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_validator.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement**

```python
# app/services/ai/portfolio_manager/validator.py
"""QA validation of the Narrative JSON (spec §10). Returns a list of error codes; empty = valid."""

from __future__ import annotations

import re

_REQUIRED = ("title", "verdict", "lede", "layers", "actions", "watch", "closing")
_LAYER_KEYS = ("overview", "performance", "allocation", "stress", "risk", "attribution", "quality", "behavior")
_FORBIDDEN_RECO = ("khuyến nghị mua", "khuyến nghị bán")
_FORBIDDEN_CERTAINTY = ("chắc chắn tăng", "chắc chắn giảm")
_DOT_DECIMAL = re.compile(r"\d+\.\d")
_DIGIT = re.compile(r"\d")


def _all_strings(obj) -> list[str]:
    out: list[str] = []
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            out.extend(_all_strings(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_all_strings(v))
    return out


def validate_narrative(narrative: dict, analysis: dict) -> list[str]:
    e: list[str] = []
    mode = (analysis.get("meta") or {}).get("mode", "full_changed")

    for key in _REQUIRED:
        if not narrative.get(key):
            e.append(f"STRUCT: thiếu trường '{key}'")
    if mode != "first" and not narrative.get("progress_text"):
        e.append("STRUCT: thiếu 'progress_text' (mode != first)")
    if mode == "first" and narrative.get("progress_text"):
        e.append("PROGRESS_FIRST: 'progress_text' phải rỗng khi mode=first")

    # All 8 layer prose blocks must be present + non-empty — the frontend reads each by key.
    layers = narrative.get("layers") or {}
    for k in _LAYER_KEYS:
        v = layers.get(k)
        if not (isinstance(v, str) and v.strip()):
            e.append(f"LAYERS: thiếu hoặc rỗng layers.{k}")

    # NOTE: the §10 "ghi nhận tốt → nói thẳng" mirror pair and the positive-direction closing are
    # enforced primarily by the SYSTEM PROMPT (Task 15) — they are tone/structure rules a regex
    # can't reliably detect. The validator enforces closing PRESENCE (via _REQUIRED) + the
    # FORBIDDEN_CERTAINTY rule (no doom-certainty). Deep mirror-pair detection is deferred to the prompt.

    actions = narrative.get("actions") or []
    if len(actions) > 3:
        e.append(f"ACTIONS_COUNT: {len(actions)} hành động (tối đa 3)")
    for i, a in enumerate(actions):
        if not _DIGIT.search(a.get("detail", "")):
            e.append(f"ACTIONS_NUMBER: action[{i}].detail thiếu con số")

    text = " ".join(_all_strings(narrative)).lower()
    for term in _FORBIDDEN_RECO:
        if term in text:
            e.append(f"FORBIDDEN_RECO: chứa '{term}'")
    for term in _FORBIDDEN_CERTAINTY:
        if term in text:
            e.append(f"FORBIDDEN_CERTAINTY: chứa '{term}'")

    for s in _all_strings(narrative):
        if _DOT_DECIMAL.search(s):
            e.append("DECIMAL_COMMA: dùng dấu chấm thập phân — phải dùng dấu phẩy")
            break

    if analysis.get("selected_insights"):
        if not (narrative.get("insight") or {}).get("text"):
            e.append("INSIGHT: thiếu nội dung insight dù có selected_insights")

    excluded = (analysis.get("risk") or {}).get("excluded") or []
    has_note = bool((narrative.get("low_data_note") or "").strip())
    if excluded and not has_note:
        e.append("LOW_DATA: có mã excluded nhưng thiếu low_data_note")
    if not excluded and has_note:
        e.append("LOW_DATA: không có mã excluded nhưng vẫn có low_data_note")

    return e
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_validator.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/validator.py tests/test_portfolio_manager_validator.py
git commit -m "feat(portfolio-manager): narrative QA validator (spec §10)"
```

---

### Task 17: Generator (`generator.py`)

**Files:**
- Create: `app/services/ai/portfolio_manager/generator.py`
- Modify: `app/services/ai/portfolio_manager/__init__.py` (export `generate_report`)
- Test: `tests/test_portfolio_manager_generator.py`

**Interfaces:**
- Consumes: `build_analysis`, `prompts.SYSTEM_PROMPT`/`build_user_prompt`, `proxy_client.chat_completion`, `validator.validate_narrative`, `PortfolioReportRepository`, `config.LLM_TEMPERATURE`.
- Produces: `async generate_report(db, user_id, *, max_retries=3) -> dict` returning `{"analysis", "narrative", "meta": {valid, attempts, errors, model, persisted, generation_time_ms, cached}}`. Flow: day-cache check (repo `get_for_date` on today) → return cached; else `build_analysis` → if insufficient return early (no LLM, persist nothing); else LLM retry loop → `_parse_json` → `validate_narrative` → persist `PortfolioReport`.
- `_parse_json(text)` mirrors the market_analysis fence-strip + brace-slice fallback.

- [ ] **Step 1: Write the failing test** (stub `chat_completion` + `build_analysis`)

```python
# tests/test_portfolio_manager_generator.py
import datetime as dt
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.portfolio_manager import generator as G


_GOOD_NARRATIVE = {
    "title": "Danh mục khỏe lên", "verdict": "Khỏe lên.", "lede": "Mở đầu.",
    "progress_text": "", "layers": {"overview": "..."},
    "insight": {"label": "x", "text": "y"}, "low_data_note": "",
    "actions": [{"title": "Nâng tiền mặt", "detail": "Đưa tiền mặt lên 15,0%."}],
    "watch": "...", "closing": "Đi đúng hướng.",
}

_ANALYSIS = {
    "meta": {"mode": "first", "date": "2026-06-23", "period_number": 1},
    "overview": {"positions": [{"ticker": "HPG", "weight": 0.16}]},
    "scores": {"overall": 3.5}, "selected_insights": [{"id": "x"}],
    "risk": {"excluded": []},
}


@pytest.mark.asyncio
async def test_generate_persists_and_returns(db_session, premium_user):
    user, _ = premium_user
    with patch.object(G, "build_analysis", new=AsyncMock(return_value=_ANALYSIS)), \
         patch.object(G, "_resolve_account_id", new=AsyncMock(return_value="00000000-0000-0000-0000-000000000001")), \
         patch.object(G, "chat_completion", new=AsyncMock(return_value=(json.dumps(_GOOD_NARRATIVE), "deepseek-test"))):
        out = await G.generate_report(db_session, user.id)
    assert out["meta"]["valid"] is True
    assert out["narrative"]["title"] == "Danh mục khỏe lên"
    assert out["meta"]["attempts"] == 1


@pytest.mark.asyncio
async def test_generate_retries_on_invalid_then_succeeds(db_session, premium_user):
    user, _ = premium_user
    bad = dict(_GOOD_NARRATIVE, actions=[{"title": "x", "detail": "không có số"}])
    responses = [(json.dumps(bad), "m"), (json.dumps(_GOOD_NARRATIVE), "m")]
    mock = AsyncMock(side_effect=responses)
    with patch.object(G, "build_analysis", new=AsyncMock(return_value=_ANALYSIS)), \
         patch.object(G, "_resolve_account_id", new=AsyncMock(return_value="00000000-0000-0000-0000-000000000002")), \
         patch.object(G, "chat_completion", new=mock):
        out = await G.generate_report(db_session, user.id)
    assert out["meta"]["attempts"] == 2
    assert out["meta"]["valid"] is True


@pytest.mark.asyncio
async def test_insufficient_skips_llm(db_session, premium_user):
    user, _ = premium_user
    with patch.object(G, "_resolve_account_id", new=AsyncMock(return_value="00000000-0000-0000-0000-000000000003")), \
         patch.object(G, "build_analysis", new=AsyncMock(return_value={"insufficient_data": True, "reason": "r"})), \
         patch.object(G, "chat_completion", new=AsyncMock()) as llm:
        out = await G.generate_report(db_session, user.id)
    assert out["analysis"]["insufficient_data"] is True
    llm.assert_not_called()


@pytest.mark.asyncio
async def test_no_virtual_account_returns_insufficient_not_404(db_session, premium_user):
    from app.core.exceptions import NotFoundError
    user, _ = premium_user
    with patch.object(G, "_resolve_account_id", new=AsyncMock(side_effect=NotFoundError("tài khoản giao dịch ảo"))), \
         patch.object(G, "chat_completion", new=AsyncMock()) as llm:
        out = await G.generate_report(db_session, user.id)
    assert out["analysis"]["insufficient_data"] is True
    assert out["meta"]["insufficient"] is True
    llm.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_generator.py -q`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 3: Implement `generator.py`**

```python
# app/services/ai/portfolio_manager/generator.py
"""Full report pipeline: analysis → DeepSeek narrative → validate → retry → persist."""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.portfolio_report import PortfolioReport
from app.repositories.portfolio_manager import PortfolioReportRepository
from app.services.ai.proxy_client import chat_completion

from .analysis import NO_ACCOUNT_REASON, _resolve_account_id, build_analysis
from .config import LLM_TEMPERATURE
from .prompts import SYSTEM_PROMPT, build_user_prompt
from .validator import validate_narrative

logger = logging.getLogger(__name__)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
ICT = timezone(timedelta(hours=7))  # Vietnam trading-day boundary

# NOTE (v1): the day-cache is keyed on the ICT calendar date. Folding weekend/holiday
# onto the most recent trading session (via app.services.ai.market_analysis.market_calendar)
# is a documented refinement — see design §5 / open risks.


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = _FENCE.sub("", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        i, j = cleaned.find("{"), cleaned.rfind("}")
        if i != -1 and j != -1 and j > i:
            return json.loads(cleaned[i : j + 1])
        raise


def _snapshot_from_analysis(analysis: dict) -> dict:
    return {p["ticker"]: p["weight"] for p in analysis.get("overview", {}).get("positions", [])}


def _recommended_actions(narrative: dict) -> list[dict]:
    return [{"id": f"action_{i}", "text": a.get("title", ""), "status": "open"}
            for i, a in enumerate(narrative.get("actions", []))]


def _insufficient(reason: str, t0: float) -> dict:
    return {"analysis": {"insufficient_data": True, "reason": reason}, "narrative": None,
            "meta": {"valid": False, "cached": False, "insufficient": True, "attempts": 0,
                     "errors": [], "model": "", "persisted": False,
                     "generation_time_ms": int((time.monotonic() - t0) * 1000)}}


async def generate_report(db: AsyncSession, user_id, *, max_retries: int = 3) -> dict:
    t0 = time.monotonic()
    try:
        account_id = await _resolve_account_id(db, user_id)  # raises NotFoundError if no account
    except NotFoundError:
        return _insufficient(NO_ACCOUNT_REASON, t0)
    repo = PortfolioReportRepository(db)
    today = datetime.now(ICT).date()

    cached = await repo.get_for_date(account_id, today)
    if cached is not None:
        return {"analysis": cached.analysis_json, "narrative": cached.narrative_json,
                "meta": {"valid": cached.valid, "cached": True, "model": cached.model_used,
                         "attempts": 0, "errors": [], "persisted": True,
                         "generation_time_ms": 0}}

    analysis = await build_analysis(db, user_id)
    if analysis.get("insufficient_data"):
        return {"analysis": analysis, "narrative": None,
                "meta": {"valid": False, "cached": False, "insufficient": True,
                         "attempts": 0, "errors": [], "model": "", "persisted": False,
                         "generation_time_ms": int((time.monotonic() - t0) * 1000)}}

    last_errors: list[str] = []
    narrative: dict | None = None
    model_used = ""
    attempt = 0
    for attempt in range(1, max_retries + 1):
        user_prompt = build_user_prompt(analysis)
        if last_errors:
            user_prompt += "\n\n=== SỬA LỖI ===\nBài trước có lỗi sau, hãy sửa và sinh lại:\n" + \
                "\n".join(f"- {e}" for e in last_errors)
        text, model_used = await chat_completion(
            system_prompt=SYSTEM_PROMPT, user_content=user_prompt, temperature=LLM_TEMPERATURE)
        try:
            narrative = _parse_json(text)
        except json.JSONDecodeError:
            last_errors = ["STRUCT: output không phải JSON hợp lệ"]
            continue
        last_errors = validate_narrative(narrative, analysis)
        if not last_errors:
            break

    valid = not last_errors and narrative is not None
    period_number = analysis["meta"]["period_number"]
    report = PortfolioReport(
        account_id=account_id, session_date=today, period_number=period_number,
        mode=analysis["meta"]["mode"], analysis_json=analysis, narrative_json=narrative,
        scores=analysis.get("scores"), recommended_actions=_recommended_actions(narrative or {}),
        watch_conditions=[], holdings_snapshot=_snapshot_from_analysis(analysis),
        model_used=model_used, generation_time_ms=int((time.monotonic() - t0) * 1000), valid=valid,
    )
    await repo.insert(report)

    return {"analysis": analysis, "narrative": narrative,
            "meta": {"valid": valid, "cached": False, "attempts": attempt,
                     "errors": last_errors, "model": model_used, "persisted": True,
                     "generation_time_ms": report.generation_time_ms}}
```

Update `app/services/ai/portfolio_manager/__init__.py`:
```python
from .analysis import build_analysis
from .generator import generate_report

__all__ = ["build_analysis", "generate_report"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_generator.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/ai/portfolio_manager/generator.py app/services/ai/portfolio_manager/__init__.py tests/test_portfolio_manager_generator.py
git commit -m "feat(portfolio-manager): generator pipeline (LLM + retry + day-cache + persist)"
```

---

### Task 18: API endpoint + schemas + router registration

**Files:**
- Create: `app/schemas/portfolio_manager.py`
- Create: `app/api/v1/endpoints/portfolio_manager.py`
- Modify: `app/api/v1/router.py` (import + include)
- Test: `tests/test_portfolio_manager_endpoint.py`

**Interfaces:**
- Consumes: `generate_report`, `PremiumUser`, `DBSession`, `PortfolioReportRepository`.
- Produces:
  - `app/schemas/portfolio_manager.py`: `class AnalyzeResponse(BaseModel): analysis: dict; narrative: dict | None; meta: dict`.
  - Routes on `router = APIRouter(prefix="/portfolio-manager", tags=["Quản lý danh mục"])`:
    - `POST /portfolio-manager/analyze` → `AnalyzeResponse` (premium-gated). Calls `generate_report(db, user.id)`.
    - `GET /portfolio-manager/report` → `AnalyzeResponse` (premium-gated): returns the latest cached report; raises `NotFoundError` if none.
- Full URL prefix: `/api/v1/portfolio-manager/...`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_portfolio_manager_endpoint.py
import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.config import get_settings


async def _premium_headers(client, premium_user):
    _, headers = premium_user
    return headers


@pytest.mark.asyncio
async def test_analyze_requires_auth(client: AsyncClient):
    resp = await client.post("/api/v1/portfolio-manager/analyze")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analyze_returns_report(client: AsyncClient, premium_user):
    _, headers = premium_user
    fake = {"analysis": {"meta": {"mode": "first"}}, "narrative": {"title": "x"},
            "meta": {"valid": True, "cached": False}}
    with patch("app.api.v1.endpoints.portfolio_manager.generate_report",
               new=AsyncMock(return_value=fake)):
        resp = await client.post("/api/v1/portfolio-manager/analyze", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["narrative"]["title"] == "x"
    assert body["meta"]["valid"] is True


@pytest.mark.asyncio
async def test_non_premium_forbidden(client: AsyncClient, test_user):
    # log in as the non-premium test_user
    login = await client.post("/api/v1/auth/login", json={"email": "test@example.com", "password": "Test@1234"})
    token = login.json()["access_token"]
    resp = await client.post("/api/v1/portfolio-manager/analyze",
                             headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
```

(Note: the `premium_user` fixture returns `(User, headers)` per conftest. Confirm the login email/password in conftest — `test@example.com` / `Test@1234`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_portfolio_manager_endpoint.py -q`
Expected: FAIL (404 on the route / ModuleNotFoundError)

- [ ] **Step 3: Implement schemas + endpoint**

```python
# app/schemas/portfolio_manager.py
"""Response schemas for the portfolio-manager API."""

from __future__ import annotations

from pydantic import BaseModel


class AnalyzeResponse(BaseModel):
    analysis: dict
    narrative: dict | None = None
    meta: dict
```

```python
# app/api/v1/endpoints/portfolio_manager.py
"""Portfolio Manager API — premium-gated analyze + latest-report read."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DBSession, PremiumUser
from app.core.exceptions import NotFoundError
from app.repositories.portfolio_manager import PortfolioReportRepository
from app.schemas.portfolio_manager import AnalyzeResponse
from app.services.ai.portfolio_manager import generate_report
from app.services.ai.portfolio_manager.analysis import _resolve_account_id

router = APIRouter(prefix="/portfolio-manager", tags=["Quản lý danh mục"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(user: PremiumUser, db: DBSession) -> AnalyzeResponse:
    """Sinh (hoặc trả về cache trong ngày) báo cáo phân tích danh mục cho người dùng hiện tại."""
    result = await generate_report(db, user.id)
    return AnalyzeResponse(**result)


@router.get("/report", response_model=AnalyzeResponse)
async def latest_report(user: PremiumUser, db: DBSession) -> AnalyzeResponse:
    """Trả về báo cáo gần nhất đã lưu (không sinh mới)."""
    account_id = await _resolve_account_id(db, user.id)
    repo = PortfolioReportRepository(db)
    row = await repo.get_latest(account_id)
    if row is None:
        raise NotFoundError("báo cáo phân tích danh mục")
    return AnalyzeResponse(
        analysis=row.analysis_json, narrative=row.narrative_json,
        meta={"valid": row.valid, "cached": True, "model": row.model_used,
              "session_date": row.session_date.isoformat(), "period_number": row.period_number},
    )
```

In `app/api/v1/router.py`: add `portfolio_manager` to the `from app.api.v1.endpoints import (...)` block and add `api_v1_router.include_router(portfolio_manager.router)` to the include block.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_portfolio_manager_endpoint.py -q`
Expected: PASS

- [ ] **Step 5: Run the full portfolio-manager suite**

Run: `uv run pytest tests/ -k portfolio_manager -q`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add app/schemas/portfolio_manager.py app/api/v1/endpoints/portfolio_manager.py app/api/v1/router.py tests/test_portfolio_manager_endpoint.py
git commit -m "feat(portfolio-manager): analyze + report API endpoints (premium-gated)"
```

---

### Task 19: End-to-end smoke against a seeded portfolio (manual verification)

**Files:**
- Test: `tests/test_portfolio_manager_e2e.py` (uses stubbed `chat_completion`, real layers, an in-DB seeded account/positions/trades)

**Interfaces:**
- Consumes everything above; proves the quant tier runs on real ORM data end-to-end (no mocked `load_inputs`), with only the LLM and the external OHLCV/fundamentals sources stubbed.

- [ ] **Step 1: Write the test** — seed a real `VirtualTradingAccount` + 3 `VirtualPosition` via `db_session` (the account/positions are REAL ORM rows, so `_resolve_account_id`/`get_portfolio` run for real); patch only the network seams (`service.resolve_price`, `inputs.fetch_ohlcv`, `inputs.fetch_financial_report`, `inputs._load_sector_weights`, `inputs._load_sectors_for`, `inputs._load_all_trades`) and `generator.chat_completion`. (Trades are patched rather than seeded to avoid the `VirtualOrder` FK chain `VirtualTrade.order_id` requires.)

```python
# tests/test_portfolio_manager_e2e.py
import datetime as dt
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.models.virtual_trading import VirtualPosition, VirtualTradingAccount
from app.services.ai.portfolio_manager import inputs as I
from app.services.ai.portfolio_manager import generator as G
from app.services.virtual_trading import service as vt_service
from app.services.virtual_trading.price_resolver import PriceResult


_PRICES = {"HPG": 26750, "TCB": 34000, "MBB": 24000}


def _bars():
    return [{"time": str(1_700_000_000 + i * 86400), "open": 26.0, "high": 26.5,
             "low": 25.5, "close": 26.0 + i * 0.01, "volume": 2_000_000.0, "value": 52_000.0}
            for i in range(130)]


class _Trade:
    def __init__(self, symbol, side, quantity, price_vnd, traded_at):
        self.symbol, self.side, self.quantity = symbol, side, quantity
        self.price_vnd, self.traded_at = price_vnd, traded_at


_GOOD_NARRATIVE = {
    "title": "Danh mục khỏe lên", "verdict": "Khỏe lên.", "lede": "Mở đầu.", "progress_text": "",
    "layers": {k: "Một đoạn phân tích." for k in
               ("overview", "performance", "allocation", "stress", "risk", "attribution", "quality", "behavior")},
    "insight": {"label": "x", "text": "TCB và MBB cùng nhịp."}, "low_data_note": "",
    "actions": [{"title": "Nâng tiền mặt", "detail": "Đưa tiền mặt lên 15,0%."}],
    "watch": "Ba mốc.", "closing": "Đi đúng hướng.",
}


@pytest.mark.asyncio
async def test_full_pipeline_then_cache_hit(db_session, premium_user):
    user, _ = premium_user
    acct = VirtualTradingAccount(
        user_id=user.id, status="active", initial_cash_vnd=482_000_000,
        cash_available_vnd=49_000_000, cash_reserved_vnd=0, cash_pending_vnd=0,
        activated_at=dt.datetime(2025, 11, 1, tzinfo=dt.UTC),
    )
    db_session.add(acct)
    await db_session.flush()
    for sym, qty, cost in [("HPG", 4000, 19500), ("TCB", 1000, 30000), ("MBB", 1000, 22000)]:
        db_session.add(VirtualPosition(account_id=acct.id, symbol=sym, quantity_total=qty,
                                       quantity_sellable=qty, quantity_pending=0, quantity_reserved=0,
                                       avg_cost_vnd=cost))
    await db_session.flush()

    def _price(symbol, **_):
        return PriceResult(price_vnd=_PRICES.get(symbol, 1000), source="close",
                           timestamp=dt.datetime(2026, 6, 23, tzinfo=dt.UTC))

    trades = [_Trade("HPG", "buy", 4000, 19500, dt.datetime(2025, 11, 23, tzinfo=dt.UTC)),
              _Trade("TCB", "buy", 1000, 30000, dt.datetime(2025, 12, 1, tzinfo=dt.UTC)),
              _Trade("MBB", "buy", 1000, 22000, dt.datetime(2025, 12, 1, tzinfo=dt.UTC))]

    with patch.object(vt_service, "resolve_price", new=AsyncMock(side_effect=_price)), \
         patch.object(I, "fetch_ohlcv", new=AsyncMock(return_value=(_bars(), "u"))), \
         patch.object(I, "fetch_financial_report",
                      new=AsyncMock(return_value=([{"pe": 9.8, "pb": 1.4, "roe": 0.16, "dividend": 0.02}], "u"))), \
         patch.object(I, "_load_sector_weights", new=AsyncMock(return_value={"Ngân hàng": 0.38, "Thép": 0.05})), \
         patch.object(I, "_load_sectors_for",
                      new=AsyncMock(return_value={"HPG": "Thép", "TCB": "Ngân hàng", "MBB": "Ngân hàng"})), \
         patch.object(I, "_load_all_trades", new=AsyncMock(return_value=trades)), \
         patch.object(G, "chat_completion", new=AsyncMock(return_value=(json.dumps(_GOOD_NARRATIVE), "deepseek-test"))):
        out1 = await G.generate_report(db_session, user.id)
        out2 = await G.generate_report(db_session, user.id)

    assert out1["meta"]["valid"] is True
    assert "insufficient_data" not in out1["analysis"]
    assert set(out1["analysis"]) >= {"overview", "performance", "allocation", "concentration",
                                     "risk", "attribution", "quality", "behavior", "scores",
                                     "selected_insights", "progress", "meta"}
    assert out2["meta"]["cached"] is True   # day-cache hit on the second call
```

- [ ] **Step 2: Run it**

Run: `uv run pytest tests/test_portfolio_manager_e2e.py -q`
Expected: PASS

- [ ] **Step 3: Manual API smoke (optional, against local backend)**

Per memory [IQX local backend]: start the backend (`uv run fastapi dev` on :8000, db `iqx_dev`, seed symbols), log in as the premium test user, then:
```bash
curl -s -X POST localhost:8000/api/v1/portfolio-manager/analyze -H "Authorization: Bearer <token>" | python -m json.tool | head -40
```
Expected: a JSON body with `analysis` (12 sections) + `narrative` + `meta.valid`. Confirm the day-cache by calling twice (second call `meta.cached: true`).

- [ ] **Step 4: Commit**

```bash
git add tests/test_portfolio_manager_e2e.py
git commit -m "test(portfolio-manager): end-to-end pipeline + day-cache smoke"
```

---

## Backend plan — done

The backend now exposes `POST /api/v1/portfolio-manager/analyze` returning `{analysis, narrative, meta}` — the contract the frontend plan consumes. Proceed to `2026-06-29-portfolio-manager-frontend.md`.

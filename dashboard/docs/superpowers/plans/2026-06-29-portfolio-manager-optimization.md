# Portfolio Manager Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the shipped Portfolio Manager: (B1) make the stress-test scenario sentence data-driven; (B2) sign-aware return tone + small format fixes; (B3) restore light-mode editorial warmth via a `--chip` token; (B4) verify the live data joins actually populate fundamentals/sector-weights; (B5) implement the Layer-07 conditional sector benchmark. Report stays a modal.

**Architecture:** Mostly frontend (`dashboard/src/features/portfolio-manager/`) + two backend changes in `backend/app/services/ai/portfolio_manager/` (inputs sector-returns loader + `layer_quality` sector benchmark). No new endpoints, no migration. Backend changes require a redeploy (same Coolify flow as before).

**Tech Stack:** React 19 + Vitest/RTL; Python 3.14 + pytest (sqlite); existing `useAnalyzePortfolio` + `AnalyzeResponse` contract.

## Global Constraints

- Frontend: no `import React` in component files; no unused imports; **verify with `npm run build`** (`tsc -b`), not just `tsc --noEmit`. Render narrative as plain text (no `dangerouslySetInnerHTML`). Numbers via `format.ts`.
- Golden rule: every displayed number originates in the quant tier / is a faithful client computation; never fabricate.
- Backend: `uv run pytest` from `backend/`. Keep `layer_*` functions pure (inputs in → dict out). Degrade to `null`/`None` rather than show a wrong number.
- Config constant: `SECTOR_BENCH_THRESHOLD = 0.25` (already in `config.py`) gates the sector benchmark.
- The contract types live in `dashboard/src/features/portfolio-manager/types.ts` — `quality.sector_benchmark: { sector, your_return, industry_return, gap } | null` is already declared (frontend `QualitySector` already renders it when non-null).

## File Structure

Frontend (`dashboard/src/features/portfolio-manager/`):
- Modify: `components/StressTest.tsx` (data-driven sentence + new prop), `PortfolioReport.tsx` (pass top holdings).
- Modify: `format.ts` (`vnd` U+2212 minus), `components/HoldingsTable.tsx` (cash "—"), `components/Attribution.tsx` + any other return-rendering component (tone sweep).
- Modify: `portfolio-manager.css` (`--chip` token + apply).
- Tests: `components/StressTest.test.tsx`, `format.test.ts` (extend).

Backend (`backend/app/services/ai/portfolio_manager/`):
- Modify: `inputs.py` (`_load_sector_weights` → also return per-sector 6-month return; `PortfolioInputs.sector_returns_6m`; `load_inputs` wires it).
- Modify: `layers.py` (`layer_quality` computes `sector_benchmark`).
- Tests: `tests/test_portfolio_manager_layers_rest.py` (extend), `tests/test_portfolio_manager_inputs.py` (extend).

---

### Task B1: Data-driven stress-test scenario sentence

**Files:**
- Modify: `dashboard/src/features/portfolio-manager/components/StressTest.tsx`
- Modify: `dashboard/src/features/portfolio-manager/PortfolioReport.tsx`
- Modify: `dashboard/src/features/portfolio-manager/components/StressTest.test.tsx`

**Interfaces:**
- `StressTest` gains a prop `topHoldings: string[]` (the portfolio's largest holdings by weight, already-formatted tickers). The orchestrator computes it from `analysis.overview.positions`.

- [ ] **Step 1: Update the failing test** — extend `StressTest.test.tsx` so the scenario sentence names the real top holdings, not a generic phrase:

```tsx
// add to StressTest.test.tsx
it("names the portfolio's actual top holdings in the scenario sentence", async () => {
  render(<StressTest beta={1.25} nav={534_000_000} managerVoice="x" topHoldings={["TCB", "HPG"]} />)
  // default d=10 is rendered; the explanation should reference the real holdings
  expect(screen.getByText(/TCB/)).toBeInTheDocument()
  expect(screen.getByText(/HPG/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it (red)**

Run: `npx vitest run src/features/portfolio-manager/components/StressTest.test.tsx`
Expected: FAIL (current sentence is generic, `topHoldings` prop doesn't exist).

- [ ] **Step 3: Implement** — add the prop + use it in the explanation (replace the generic second sentence):

In `StressTest.tsx`, change the props interface + the explanation text:
```tsx
interface StressTestProps {
  beta: number
  nav: number
  managerVoice: string
  topHoldings: string[]
}

export function StressTest({ beta, nav, managerVoice, topHoldings }: StressTestProps) {
  ...
  const drivers =
    topHoldings.length > 0
      ? topHoldings.slice(0, 3).join(", ")
      : "các vị thế lớn nhất"
  ...
          <div className="stress-expl">
            {scenText} sẽ kéo danh mục của bạn xuống khoảng{" "}
            <b style={{ color: "#fff" }}>{lossPct}</b>. Phần lớn mức giảm đến từ {drivers}{" "}
            — những vị thế lớn nhất của bạn.
          </div>
  ...
}
```

In `PortfolioReport.tsx`, where `<StressTest .../>` is rendered, pass the top holdings by weight:
```tsx
// near the StressTest usage — compute once from analysis.overview.positions
const topHoldings = [...analysis.overview.positions]
  .sort((a, b) => b.weight - a.weight)
  .slice(0, 3)
  .map((p) => p.ticker)
...
<StressTest
  beta={analysis.risk.beta}
  nav={analysis.overview.nav}
  managerVoice={narrative.layers.stress}
  topHoldings={topHoldings}
/>
```

- [ ] **Step 4: Run it (green)**

Run: `npx vitest run src/features/portfolio-manager/components/StressTest.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/portfolio-manager/components/StressTest.tsx src/features/portfolio-manager/PortfolioReport.tsx src/features/portfolio-manager/components/StressTest.test.tsx
git commit -m "feat(portfolio-manager): data-driven stress-test attribution sentence"
```

---

### Task B2: Sign-aware tone sweep + format fixes

**Files:**
- Modify: `dashboard/src/features/portfolio-manager/format.ts`
- Modify: `dashboard/src/features/portfolio-manager/format.test.ts`
- Modify: `dashboard/src/features/portfolio-manager/components/HoldingsTable.tsx`
- Audit/Modify: `components/Attribution.tsx`, `components/PerformanceStats.tsx`, `PortfolioReport.tsx`, and any other component rendering a return/P&L.

**Interfaces:** `vnd(n)` keeps its signature but renders negatives with U+2212 `−` (matching `signedPct`).

- [ ] **Step 1: Failing test for `vnd` negative minus** — add to `format.test.ts`:

```ts
it("vnd renders negatives with the U+2212 minus (consistent with signedPct)", () => {
  expect(vnd(-534000000)).toBe("−534.000.000 ₫")  // U+2212, not ASCII -
})
```
Run: `npx vitest run src/features/portfolio-manager/format.test.ts` → FAIL (currently `toLocaleString` emits ASCII `-`).

- [ ] **Step 2: Fix `vnd`** in `format.ts`:
```ts
const MINUS = "−" // U+2212 (already defined at top of file — reuse it)

export function vnd(n: number): string {
  const abs = Math.round(Math.abs(n)).toLocaleString("vi-VN")
  return `${n < 0 ? MINUS : ""}${abs} ₫`
}
```
Run the test → PASS. (Confirm the positive case `vnd(534000000)` still equals `"534.000.000 ₫"` — the existing test must stay green.)

- [ ] **Step 3: Tone sweep** — grep the components for return/P&L cells and ensure none paints a loss green:
```
grep -rn 'tone:\|"up"\|"down"\|pos\|neg\|\.up\|\.down' src/features/portfolio-manager/components src/features/portfolio-manager/PortfolioReport.tsx
```
For each cell/value derived from a signed number (`pnl`, `*_return`, `excess`, `gap`, `pnl_pct`), confirm the tone/class is `value >= 0 ? up : down` (NOT hardcoded). Already-correct: `total_return` (PortfolioReport) and `portfolio_return` (PerformanceStats). Fix any remaining hardcoded-positive tone (likely candidates: any benchmark/return cell). Where a value is displayed without a sign on a P&L, switch to `signedPct`/`vndShort`/`vnd` (which now sign correctly).

- [ ] **Step 4: HoldingsTable cash P&L** — in `HoldingsTable.tsx`, the cash row's P&L cell currently shows `"0"`; change it to a neutral dash `"—"` (cash has no P&L). Also (defensive) render the `.mgr` manager-voice block only when the string is non-empty: `{managerVoice && <div className="mgr">{managerVoice}</div>}` — apply the same guard in the other components that take a `managerVoice` prop (Attribution, QualitySector, BehaviorLowData, AllocationBars, PerformanceStats, HoldingsTable).

- [ ] **Step 5: Run the feature suite + build**

Run: `npx vitest run src/features/portfolio-manager`
Run: `npm run build`
Expected: all pass, no TS/build errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/portfolio-manager
git commit -m "fix(portfolio-manager): U+2212 minus in vnd, sign-aware tone sweep, cash dash, managerVoice guards"
```

---

### Task B3: `--chip` warm token (light-mode editorial warmth)

**Files:**
- Modify: `dashboard/src/features/portfolio-manager/portfolio-manager.css`

**Interfaces:** none (CSS only).

- [ ] **Step 1: Add the token** — in the `.portfolio-manager` token block (after `--card`) add `--chip`, and override it in the light block:
```css
.portfolio-manager {
  ...
  --card: var(--color-bg-1);
  --chip: var(--color-fill-2);   /* warm parchment surface for chips/tracks/panels */
  ...
}
body[arco-theme='light'] .portfolio-manager {
  ...
  --card: #fffdf8;
  --chip: #f3ece0;               /* warm parchment (light only) */
  ...
}
```

- [ ] **Step 2: Apply `--chip`** to the editorial chip/track/panel surfaces (swap `background: var(--card)` → `background: var(--chip)` on these selectors only): `.fig` (line ~88), `.flag` (~114), `.stat` (~119), `.wbar .track` (~129), `.heat .self` (~160), `.lowdata` (~165), `.attr .track` (~174), `.sectorbench` (~191), `.chip` (~203), `.watch` (~228). Leave true card surfaces (`.card`, `.hero`, etc.) on `var(--card)`.

- [ ] **Step 3: Verify nothing broke** — `npx vitest run src/features/portfolio-manager` (CSS isn't unit-tested; this just confirms the build/tests still pass). Visual check happens in Task B6.

- [ ] **Step 4: Commit**

```bash
git add src/features/portfolio-manager/portfolio-manager.css
git commit -m "style(portfolio-manager): warm --chip token restores light-mode editorial warmth"
```

---

### Task B4: Verify the live data joins populate (deferred Step-4a)

**Files:** none (verification; only edits `inputs.py` `_pick` if a key is wrong).

This confirms the quant tier isn't silently emitting nulls. Run against an environment with VCI network (the prod backend container, or a local backend per memory [IQX local backend]).

- [ ] **Step 1: Run the live checks** (in the backend container or locally):
```bash
uv run python -c "
import asyncio
from app.services.market_data.sources.vietcap import fetch_financial_report, fetch_ohlcv
async def main():
    rows,_ = await fetch_financial_report('HPG', report_type='ratio', period='Y')
    print('RATIO KEYS:', sorted(rows[0].keys())[:40] if rows else 'EMPTY')
    bars,_ = await fetch_ohlcv('VNINDEX', start_ts=0, end_ts=2**31, interval='1D', count_back=140)
    print('VNINDEX bars:', len(bars))
asyncio.run(main())
"
uv run python -c "
import asyncio
from app.services.ai.portfolio_manager.inputs import _load_sector_weights
print('SECTOR WEIGHTS:', len(asyncio.run(_load_sector_weights())))
"
```
Expected: ratio keys printed (find the real `pe`/`pb`/`roe` keys), VNINDEX bars > 0, sector weights > 0.

- [ ] **Step 2: Fix `_pick` if needed** — if the ratio row does NOT contain literal `pe`/`pb`/`roe`, reorder the `_pick(ratios, ...)` candidate lists in `inputs.py` so the real key is first (e.g. `price_to_earning`, `price_to_book`, `roea`). If everything resolves, no change.

- [ ] **Step 3: Add a regression test** — in `tests/test_portfolio_manager_inputs.py`, assert `_pick` extracts pe/pb/roe from a row using the REAL key names you found in Step 1:
```python
def test_pick_extracts_real_ratio_keys():
    from app.services.ai.portfolio_manager.inputs import _pick
    row = {"<REAL_PE_KEY>": 9.8, "<REAL_PB_KEY>": 1.4, "<REAL_ROE_KEY>": 0.16}
    assert _pick(row, "pe", "price_to_earning", "pe_ratio") == 9.8  # adjust candidates to match Step 1
    # ... pb, roe
```
Run: `uv run pytest tests/test_portfolio_manager_inputs.py -q` → PASS.

- [ ] **Step 4: Commit** (only if `_pick`/test changed)

```bash
git add backend/app/services/ai/portfolio_manager/inputs.py backend/tests/test_portfolio_manager_inputs.py
git commit -m "fix(portfolio-manager): verified ratio key names populate fundamentals"
```

---

### Task B5: Implement the Layer-07 conditional sector benchmark

**Files:**
- Modify: `backend/app/services/ai/portfolio_manager/inputs.py` (load per-sector 6-month return; add `PortfolioInputs.sector_returns_6m`)
- Modify: `backend/app/services/ai/portfolio_manager/layers.py` (`layer_quality` computes `sector_benchmark`)
- Modify: `backend/tests/test_portfolio_manager_layers_rest.py`

**Interfaces:**
- `PortfolioInputs` gains `sector_returns_6m: dict[str, float]` (VN-Index sector → ~6-month return as a fraction; `{}` if unavailable).
- `layer_quality(inp)` returns `sector_benchmark: {sector, your_return, industry_return, gap} | None`. Populated only when the portfolio's largest sector weight ≥ `SECTOR_BENCH_THRESHOLD` AND that sector has an `industry_return`.

Method (both legs over ~6 months → comparable): `your_return` = MV-weighted `close[-1]/close[-126] - 1` of the holdings in the dominant sector (uses the OHLCV already loaded into `Holding.closes`); `industry_return` = that sector's 6-month change from `fetch_sector_information`.

- [ ] **Step 1: Failing test** — add to `tests/test_portfolio_manager_layers_rest.py`:

```python
def test_quality_sector_benchmark_when_sector_dominant():
    # Two Ngân hàng holdings dominate (>25%); both up ~10% over the window; sector ~14%.
    def closes(g):  # 130 bars, end/start-126 ≈ (1+g)
        base = [100.0] * 4 + [100.0 * (1 + g) ** (i / 125) for i in range(126)]
        return base
    h = [
        Holding("TCB", 1, 1, 1, "Ngân hàng", 120_000_000, 0, 109_000_000, closes=closes(0.10)),
        Holding("MBB", 1, 1, 1, "Ngân hàng", 100_000_000, 0, 91_000_000, closes=closes(0.10)),
        Holding("HPG", 1, 1, 1, "Thép", 30_000_000, 0, 28_000_000, closes=closes(0.05)),
    ]
    inp = PortfolioInputs(nav=300_000_000, cash=0, holdings=h, benchmark_closes=[],
                          sector_weights={}, inception_date=None, trades=[],
                          as_of=__import__("datetime").date(2026, 6, 23),
                          sector_returns_6m={"Ngân hàng": 0.14})
    out = L.layer_quality(inp)
    sb = out["sector_benchmark"]
    assert sb is not None
    assert sb["sector"] == "Ngân hàng"
    assert abs(sb["your_return"] - 0.10) < 0.02
    assert abs(sb["industry_return"] - 0.14) < 1e-9
    assert abs(sb["gap"] - (sb["your_return"] - sb["industry_return"])) < 1e-9


def test_quality_sector_benchmark_none_when_no_dominant_sector():
    h = [Holding("HPG", 1, 1, 1, "Thép", 10, 0, 10, closes=[1.0] * 130)]
    inp = PortfolioInputs(nav=1000, cash=990, holdings=h, benchmark_closes=[], sector_weights={},
                          inception_date=None, trades=[], as_of=__import__("datetime").date(2026, 6, 23),
                          sector_returns_6m={})
    assert L.layer_quality(inp)["sector_benchmark"] is None
```

Note: this test constructs `PortfolioInputs` with the NEW `sector_returns_6m` field — so the dataclass change (Step 3) is needed for it to even import-construct. Update the other existing tests that build `PortfolioInputs` to pass `sector_returns_6m={}` (grep `PortfolioInputs(` across tests).

- [ ] **Step 2: Run it (red)**

Run: `uv run pytest tests/test_portfolio_manager_layers_rest.py -k sector_benchmark -q`
Expected: FAIL (TypeError: unexpected `sector_returns_6m`, or sector_benchmark is None).

- [ ] **Step 3: Add the dataclass field + loader** — in `inputs.py`:

Add to `PortfolioInputs`:
```python
    sector_returns_6m: dict[str, float] = field(default_factory=dict)
```
(import `field` is already imported.)

Refactor `_load_sector_weights` → `_load_sector_info` returning both weights and 6m returns from the single `fetch_sector_information` call (keep a thin `_load_sector_weights` wrapper if other callers use it, else replace):
```python
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
```
In `load_inputs`, replace the `sector_weights = await _load_sector_weights()` call with:
```python
    sector_weights, sector_returns_6m = await _load_sector_info()
```
and pass `sector_returns_6m=sector_returns_6m` into the `PortfolioInputs(...)` constructor. (Confirm `percent_price_change_6m` is the real key on `fetch_sector_information` rows — verify in Task B4's live run; adjust the key name if VCI uses e.g. `percent_price_change_6_month`.)

- [ ] **Step 4: Compute `sector_benchmark` in `layer_quality`** — replace the hardcoded `None`:
```python
from .config import SECTOR_BENCH_THRESHOLD  # add to the existing config import line if not already there
# NOTE: `normalize_sector_name` and `_r3` are already imported/defined at module level
# in layers.py (from the allocation task) — reuse them; do not re-import.

_SECTOR_WINDOW = 126  # ~6 trading months, to match the sector 6m change


def _sector_benchmark(inp: PortfolioInputs) -> dict | None:
    # dominant sector by portfolio weight
    by_sector: dict[str, float] = {}
    for h in inp.holdings:
        by_sector[h.sector] = by_sector.get(h.sector, 0.0) + (h.market_value / inp.nav if inp.nav else 0.0)
    if not by_sector:
        return None
    sector, weight = max(by_sector.items(), key=lambda kv: kv[1])
    if weight < SECTOR_BENCH_THRESHOLD:
        return None
    industry = inp.sector_returns_6m.get(sector)
    if industry is None:
        # fall back to a normalized-name match (uses the module-level normalize_sector_name)
        norm = {normalize_sector_name(k): v for k, v in inp.sector_returns_6m.items()}
        industry = norm.get(normalize_sector_name(sector))
    if industry is None:
        return None
    # your_return: MV-weighted ~6m return of the dominant sector's holdings
    members = [h for h in inp.holdings if h.sector == sector and len(h.closes) >= 2]
    total_mv = sum(h.market_value for h in members)
    if total_mv <= 0:
        return None
    your = 0.0
    for h in members:
        w = h.closes[-_SECTOR_WINDOW:] if len(h.closes) >= _SECTOR_WINDOW else h.closes
        base = w[0] or 1.0
        your += (h.market_value / total_mv) * (w[-1] / base - 1.0)
    return {"sector": sector, "your_return": _r3(your), "industry_return": _r3(industry),
            "gap": _r3(your - industry)}


def layer_quality(inp: PortfolioInputs) -> dict:
    return {
        "pe": _r3(_weighted(inp, "pe")),
        "pb": _r3(_weighted(inp, "pb")),
        "roe": _r3(_weighted(inp, "roe")),
        "dividend": _r3(_weighted(inp, "dividend")),
        "sector_benchmark": _sector_benchmark(inp),
    }
```
(`normalize_sector_name` is exported from `inputs.py`. `_r3` already exists in `layers.py`.) Remove the now-stale "v1 left as None" comment in `analysis.py` (lines ~104-108) since `layer_quality` now returns it directly — no orchestrator merge needed.

- [ ] **Step 5: Run tests (green) + fix other PortfolioInputs constructions**

Run: `uv run pytest tests/ -k portfolio_manager -q`
Expected: PASS. If other tests fail constructing `PortfolioInputs` without `sector_returns_6m`, the field defaults to `{}` (it has `field(default_factory=dict)`), so existing constructions still work — only the new test passes the field explicitly. Confirm the whole pm suite is green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai/portfolio_manager/inputs.py backend/app/services/ai/portfolio_manager/layers.py backend/app/services/ai/portfolio_manager/analysis.py backend/tests/test_portfolio_manager_layers_rest.py
git commit -m "feat(portfolio-manager): Layer-07 conditional sector benchmark (your vs industry ~6m)"
```

---

### Task B6: Full verification + manual smoke

**Files:** none.

- [ ] **Step 1:** Backend: `cd backend && uv run pytest tests/ -k portfolio_manager -q` → all green. Frontend: `cd dashboard && npm test && npm run build` → all green, no build errors.
- [ ] **Step 2: Manual** (premium user, Danh mục → Nắm giữ → Phân tích danh mục): stress-test sentence names the real top holdings; no loss renders green anywhere; negative VND shows `−`; light mode shows warm chips; if the portfolio has a sector ≥25%, the `.sectorbench` block shows your-vs-industry. Toggle dark mode for legibility.
- [ ] **Step 3:** Deploy (backend changed → rebuild iqx-backend; frontend changed → rebuild iqx-web) via the Coolify flow (see memory [IQX Coolify deploy]); regenerate is automatic on next analyze (day-cache key unchanged — note: existing cached reports for today won't show the new sector_benchmark until the next trading day or a forced regenerate).

---

## Plan B — done. Stress sentence is data-driven, tone is sign-aware, light-mode warmth restored, fundamentals verified, and the Layer-07 sector benchmark is live.

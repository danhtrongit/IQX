# BCTC Phase 4 — Định giá (Valuation): Football Field rút gọn + Justified P/B + NIM×CoR

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` checkboxes.

**Goal:** Lớp định giá (premium). **Template A:** Football Field rút gọn = P/E band + RIM + Book floor (Ke mặc định, KHÔNG cần β). **Template B:** Justified P/B + ma trận nhạy cảm NIM×CoR. Dùng dữ liệu `ratio` (pe/eps/bvps/roe theo năm — đã có từ VCI), không fetch giá lịch sử/β. Frontend hiển thị bars bear/base/bull + vạch giá hiện tại (frontend đã có giá realtime).

**Architecture:** Service `get_bctc` fetch THÊM `ratio` (period="Y") → truyền `ratio_rows` vào assembler. `valuation.py` (hàm thuần) tính range/cp từ ratio history + defaults. Wire vào `payload["valuation"]`. Frontend render premium-gated; vạch giá hiện tại lấy từ `usePrice` (không cần backend fetch giá).

**Defaults (spec §Module 8/6B):** Ke = Rf 4% + β×ERP 8.5%; β mặc định 1.0 (phi-ngân hàng → Ke 12.5%), 1.2 (ngân hàng → Ke 14.2% ≈ 14%). g dài hạn 5% (phi-NH) / 7% (NH). Justified P/B = (ROE − g)/(Ke − g). Fair value/cp = P/B* × BVPS.

**Spec:** §12 Phase 4. ratio fields verified (FPT/VCB): pe, pb, eps, bvps, roe, market_cap, number_of_shares_mkt_cap per year (8y). EPS_fwd dùng EPS mới nhất (trailing) làm proxy. ROE bền vững = median ROE các kỳ.

**Branch:** `feat/bctc-phase4-valuation` từ `main`. Backend test `uv run --frozen pytest tests/<f> -q`; frontend `npm run build`.

---

### Task 4.1: Valuation compute (valuation.py)
**Files:** Create `backend/app/services/bctc/valuation.py`; Test `tests/test_bctc_valuation.py`.

- [ ] **Step 1 — test** `tests/test_bctc_valuation.py`:
```python
from __future__ import annotations

import math

from app.services.bctc.valuation import justified_pb, valuation_nonbank, valuation_bank


def test_justified_pb() -> None:
    # (0.20 - 0.05)/(0.125 - 0.05) = 2.0
    assert math.isclose(justified_pb(0.20, 0.125, 0.05), 2.0)
    assert justified_pb(None, 0.125, 0.05) is None
    assert justified_pb(0.20, 0.05, 0.05) is None  # ke == g -> None (avoid div0)


def test_valuation_nonbank_pe_band_and_rim() -> None:
    # ratio rows newest-first; pe history -> band; eps latest; bvps latest; roe median.
    ratio = [
        {"year_report": 2025, "pe": 14.0, "eps": 5000.0, "bvps": 20000.0, "roe": 0.25},
        {"year_report": 2024, "pe": 18.0, "eps": 4000.0, "bvps": 18000.0, "roe": 0.25},
        {"year_report": 2023, "pe": 22.0, "eps": 3500.0, "bvps": 16000.0, "roe": 0.25},
    ]
    v = valuation_nonbank(ratio)
    # pe band: min14 median18 max22 × eps 5000
    assert math.isclose(v["pe_band"]["bear"], 14.0 * 5000.0)
    assert math.isclose(v["pe_band"]["base"], 18.0 * 5000.0)
    assert math.isclose(v["pe_band"]["bull"], 22.0 * 5000.0)
    # rim: jpb(roe_med 0.25, ke .125, g .05) × bvps 20000 = ((0.25-0.05)/0.075)=2.6667 ×20000
    assert math.isclose(v["rim"], (0.20 / 0.075) * 20000.0, rel_tol=1e-6)
    assert math.isclose(v["book_floor"], 20000.0)
    assert v["summary"]["base"] is not None


def test_valuation_bank_justified_pb_and_matrix() -> None:
    ratio = [
        {"year_report": 2025, "bvps": 26000.0, "roe": 0.20},
        {"year_report": 2024, "bvps": 30000.0, "roe": 0.22},
    ]
    v = valuation_bank(ratio, nim=0.026, cost_of_risk=0.008, roa=0.018, equity_multiplier=10.0,
                       earning_assets_ratio=0.9, loans_ratio=0.6)
    assert v["justified_pb"] is not None and v["fair_value"] is not None
    assert len(v["nim_cor_matrix"]["rows"]) == 3       # 3 NIM scenarios
    assert len(v["nim_cor_matrix"]["rows"][0]["cells"]) == 3  # 3 CoR scenarios


def test_valuation_empty_ratio_graceful() -> None:
    assert valuation_nonbank([])["summary"]["base"] is None
```

- [ ] **Step 2** → FAIL.
- [ ] **Step 3 — implement** `valuation.py`:
```python
from __future__ import annotations

from statistics import median
from typing import Any

_KE_NONBANK = 0.125
_KE_BANK = 0.14
_G_NONBANK = 0.05
_G_BANK = 0.07


def justified_pb(roe: float | None, ke: float, g: float) -> float | None:
    if roe is None or ke <= g:
        return None
    return (roe - g) / (ke - g)


def _vals(rows: list[dict], key: str, *, positive: bool = False) -> list[float]:
    out: list[float] = []
    for r in rows:
        v = r.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            if positive and v <= 0:
                continue
            out.append(float(v))
    return out


def _latest(rows: list[dict], key: str) -> float | None:
    for r in rows:  # rows newest-first
        v = r.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None


def valuation_nonbank(ratio_rows: list[dict]) -> dict[str, Any]:
    rows = ratio_rows or []
    pe = _vals(rows, "pe", positive=True)[:5]
    eps = _latest(rows, "eps")
    bvps = _latest(rows, "bvps")
    roe_vals = _vals(rows, "roe")
    pe_band = None
    if pe and eps is not None:
        pe_band = {"bear": min(pe) * eps, "base": median(pe) * eps, "bull": max(pe) * eps}
    roe_med = median(roe_vals) if roe_vals else None
    jpb = justified_pb(roe_med, _KE_NONBANK, _G_NONBANK)
    rim = (jpb * bvps) if jpb is not None and bvps is not None else None
    book_floor = bvps
    cands = [x for x in [pe_band["base"] if pe_band else None, rim, book_floor] if x is not None]
    summary = {
        "bear": (min([pe_band["bear"]] + cands) if pe_band else (min(cands) if cands else None)),
        "base": (median(cands) if cands else None),
        "bull": (max([pe_band["bull"]] + cands) if pe_band else (max(cands) if cands else None)),
    }
    return {"pe_band": pe_band, "rim": rim, "book_floor": book_floor,
            "justified_pb": jpb, "roe_sustainable": roe_med, "summary": summary}


def valuation_bank(ratio_rows: list[dict], *, nim: float | None = None,
                   cost_of_risk: float | None = None, roa: float | None = None,
                   equity_multiplier: float | None = None,
                   earning_assets_ratio: float | None = None,
                   loans_ratio: float | None = None) -> dict[str, Any]:
    rows = ratio_rows or []
    bvps = _latest(rows, "bvps")
    roe_vals = _vals(rows, "roe")
    roe_med = median(roe_vals) if roe_vals else None
    jpb = justified_pb(roe_med, _KE_BANK, _G_BANK)
    fair_value = (jpb * bvps) if jpb is not None and bvps is not None else None
    matrix = _nim_cor_matrix(nim, cost_of_risk, roa, equity_multiplier,
                             earning_assets_ratio, loans_ratio)
    return {"justified_pb": jpb, "fair_value": fair_value, "roe_sustainable": roe_med,
            "bvps": bvps, "nim_cor_matrix": matrix}


def _nim_cor_matrix(nim, cor, roa, em, ea_ratio, loans_ratio) -> dict[str, Any]:
    # 3×3: NIM ±0.2pp, CoR ±0.2pp quanh hiện tại; mỗi cell -> justified P/B theo ROE kịch bản.
    base_ok = None not in (nim, cor, roa, em, ea_ratio, loans_ratio)
    nim_steps = [(nim + d) if nim is not None else None for d in (0.002, 0.0, -0.002)]
    cor_steps = [(cor + d) if cor is not None else None for d in (-0.002, 0.0, 0.002)]
    out_rows = []
    for nv in nim_steps:
        cells = []
        for cv in cor_steps:
            pb = None
            if base_ok and nv is not None and cv is not None:
                d_roa = (nv - nim) * ea_ratio - (cv - cor) * loans_ratio
                roe_s = (roa + d_roa) * em
                pb = justified_pb(roe_s, _KE_BANK, _G_BANK)
            cells.append({"cor": cv, "justified_pb": pb})
        out_rows.append({"nim": nv, "cells": cells})
    return {"rows": out_rows}
```

- [ ] **Step 4** → PASS (4). mypy/ruff clean (median import; annotate `_nim_cor_matrix` params or accept inferred — add `float | None` annotations to satisfy strict-ish mypy if flagged; this module is NOT under strict mypy but keep clean).
- [ ] **Step 5** — commit: `git add app/services/bctc/valuation.py tests/test_bctc_valuation.py && git commit -m "feat(bctc): valuation — P/E band + RIM + Book floor (A) + Justified P/B + NIM×CoR (B)"`

---

### Task 4.2: Fetch ratio in service + wire valuation into assembler
**Files:** Modify `backend/app/services/bctc/service.py`, `assemble.py`, `backend/app/services/market_data/sources/vietcap.py` (if needed); Test extend `tests/test_bctc_assemble.py`, `tests/test_bctc_service.py`.

- [ ] **Step 1 — extend assemble test:**
```python
def test_assemble_nonbank_has_valuation() -> None:
    is_rows = [_mk(2025, 5, isa3=600.0, isa20=80.0), _mk(2024, 5, isa3=500.0)]
    bs_rows = [_mk(2025, 5, bsa53=1000.0)]
    ratio = [{"year_report": 2025, "pe": 14.0, "eps": 5000.0, "bvps": 20000.0, "roe": 0.25},
             {"year_report": 2024, "pe": 18.0, "eps": 4000.0, "bvps": 18000.0, "roe": 0.25}]
    out = build_bctc_payload(bs_rows, is_rows, [], ratio_rows=ratio)
    assert "valuation" in out and out["valuation"]["pe_band"] is not None


def test_assemble_valuation_optional() -> None:
    out = build_bctc_payload([], [_mk(2025, 5, isa3=1.0)], [])
    assert "valuation" in out  # present even without ratio (degraded)
```

- [ ] **Step 2** → FAIL.
- [ ] **Step 3 — implement:**
  - `build_bctc_payload(bs_rows, is_rows, cf_rows, ratio_rows=None)` — add optional `ratio_rows: list[dict] | None = None` param. Import `from app.services.bctc.valuation import valuation_nonbank, valuation_bank`. In the main path: for non-bank → `valuation = valuation_nonbank(ratio_rows or [])`; for bank → pull the needed inputs from snap_values/modules (`nim` from snap, `cost_of_risk` from ppop_cor module data, `roa`/`equity_multiplier` from bank_dupont data, `earning_assets_ratio = earning_assets(cur0)/total_assets`, `loans_ratio = customer_loans/total_assets`) and call `valuation_bank(ratio_rows or [], nim=..., cost_of_risk=..., roa=..., equity_multiplier=..., earning_assets_ratio=..., loans_ratio=...)`. Add `"valuation": valuation` to the return dict + `"valuation": None` (or empty) to the empty shell.
  - `service.get_bctc`: also fetch ratio via `vietcap.fetch_financial_report(symbol, report_type="ratio", period="Y")` (returns a list); pass as `ratio_rows`. Wrap in try/except → `ratio_rows=[]` on failure (valuation degrades, не crash). Update its return to still be `(payload, url)`.
  - Update `tests/test_bctc_service.py` mock to also patch/return ratio if it now calls fetch_financial_report (mock `vietcap.fetch_financial_report` to return `([], "url")`, OR mock at a higher level). Keep the existing assertion working.

- [ ] **Step 4** → PASS. Full bctc suite + `test_bctc_service.py` + `test_bctc_endpoint.py` (mock get_bctc unaffected) pass. mypy/ruff clean.
- [ ] **Step 5** — commit: `git add app/services/bctc/service.py app/services/bctc/assemble.py tests/test_bctc_assemble.py tests/test_bctc_service.py && git commit -m "feat(bctc): fetch ratio history + wire valuation into payload"`

---

### Task 4.3: Frontend — valuation panel (premium-gated)
**Files:** Modify `dashboard/src/components/stock/bctc-analysis.tsx`; helper in `bctc-format.ts` if needed.

- [ ] **Step 1 — implement** (read file first):
  - Extend `BctcPayload`: `valuation?: { pe_band?: {bear,base,bull}|null; rim?: number|null; book_floor?: number|null; justified_pb?: number|null; fair_value?: number|null; roe_sustainable?: number|null; summary?: {bear,base,bull}|null; nim_cor_matrix?: { rows: {nim:number|null; cells:{cor:number|null; justified_pb:number|null}[]}[] } } | null`.
  - Add a **Lớp ⑤ Định giá** section (premium-gated via `PremiumGate`, `min-h-[120px]`):
    - **Non-bank**: a table of methods (P/E band bear/base/bull, RIM, Book floor) + a summary range (bear/base/bull in nghìn đ). Format prices via a helper `fmtPrice(v)` = `fmtNumber(v/1000, 1) + "k"` (or fmtNumber(v,0) đ). Optionally a simple horizontal bar (base/bear/bull) — keep it a styled bar div, no SVG needed. (Current-price marker: OPTIONAL — if the component has access to a price prop/context use it; else skip the marker for MVP and just show the fair-value range.)
    - **Bank**: show Justified P/B + fair value + a 3×3 NIM×CoR matrix table (rows = NIM scenarios, cols = CoR scenarios, cell = justified P/B `fmtNumber(pb,2)+"×"`).
  - Only render when `data.valuation` present and has content.
- [ ] **Step 2** — `npm run build` clean. Commit: `git add dashboard/src/components/stock/bctc-analysis.tsx && git commit -m "feat(bctc): valuation panel ⑤ (football-field range / justified P/B + NIM×CoR matrix), premium-gated"`

---

## Nghiệm thu Phase 4
- [ ] `uv run --frozen pytest tests/test_bctc_*.py -q` all pass; mypy/ruff clean.
- [ ] `npm run build` clean.
- [ ] **Live smoke (deploy):** `GET /market-data/bctc/FPT` → `valuation.pe_band`/`rim`/`book_floor`/`summary` non-null (giá hợp lý vs giá FPT ~hiện tại); `GET /market-data/bctc/VCB` → `valuation.justified_pb` + `fair_value` + `nim_cor_matrix` (3×3). Sanity: fair value trong khoảng hợp lý.

## Ngoài phạm vi (sau Phase 4)
- DCF (reinvestment) đầy đủ — cần WACC/β thật (β chưa có nguồn IQX).
- Football Field SVG đẹp + vạch giá hiện tại overlay chuẩn; tr` chart polish.
- Insurance/Securities sub-sector; AI tuning ngân hàng.
- TTM, export/print.

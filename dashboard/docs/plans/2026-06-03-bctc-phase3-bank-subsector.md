# BCTC Phase 3 — Bank depth (NIM unlock, Bank DuPont, Forensic + blind-spots) + Sub-sector Spotlight

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Hoàn thiện chiều sâu Template B (ngân hàng) + Sub-sector Spotlight (Template A). Cụ thể: (1) suy ra **earning_assets / interest_bearing_liabilities** (tổng nhiều dòng) → mở khóa **NIM + NIM Decomposition** (đang N/A); (2) **Bank DuPont** (ROA × EM, phân rã ROA); (3) enrich **TOI Mix** (trading/other) + **Bank Forensic Panel** + **blind-spots box**; (4) **Sub-sector Spotlight** (Template A, 5 ngành + default). Phase-1/2 giữ nguyên.

**Architecture:** Tất cả là hàm thuần trên `Period` (đã có). Bổ sung concept ngân hàng vào `bank.yaml`; earning_assets/IBL = TỔNG các concept thành phần (Period frozen → tính qua helper, không mutate). Wire vào `assemble.py`. Frontend: blind-spots box (premium) + nhãn sub-sector; module mới auto-render qua generic renderer.

**Tech Stack:** Python/FastAPI + pytest (concept-keyed fixtures). React (generic module renderer + 1 blind-spots component).

**Spec:** design doc §4.4 (sub-sector), §12 Phase 3. Bank FieldCodes verified across VCB/TCB/MBB/ACB (BS: bsb97 TG-NHNN, bsb98 TG/cho-vay TCTD, bsb99 CK-KD, bsb104 cho-vay-KH, bsb106 CK-đầu-tư, bsb111 nợ-CP&NHNN, bsb112 TG&vay-TCTD, bsb113 TG-KH, bsb116 GTCG; IS: isb27 NII, isb30 fee, isb31 FX, isb32 CK-KD, isb33 CK-ĐT, isb36 khác, isb38 TOI, isb39 OPEX, isb41 dự-phòng, isa19 thuế, isa20 LNST). Expenses (isb39/isb41/isa19) lưu ÂM → abs().

**Branch:** `feat/bctc-phase3-bank-subsector` từ `main`. Backend test: `export PATH="$HOME/.local/bin:$PATH" && cd backend && uv run --frozen pytest tests/<f> -q`. Frontend: `npx vitest run` / `npm run build`.

---

### Task 3.1: Bank mapping — add component concepts
**Files:** Modify `backend/app/services/bctc/mapping/bank.yaml`; Test: extend `tests/test_bctc_mapping.py`.

- [ ] **Step 1 — append to `bank.yaml`** (keep existing entries; add):
```yaml
# Earning-asset components (Phase 3: earning_assets = tổng các dòng này)
deposits_at_sbv: bsb97           # Tiền gửi tại NHNN
deposits_at_other_ci: bsb98      # Tiền gửi tại & cho vay các TCTD khác
trading_securities: bsb99        # Chứng khoán kinh doanh
investment_securities: bsb106    # Chứng khoán đầu tư (đã có thể trùng — giữ 1 dòng)
# Interest-bearing-liability components (IBL = tổng)
govt_sbv_borrowings: bsb111      # Các khoản nợ Chính phủ & NHNN
ci_deposits_borrowings: bsb112   # Tiền gửi & vay các TCTD khác
valuable_papers: bsb116          # Phát hành giấy tờ có giá
# TOI mix components
fx_income: isb31                 # Lãi/lỗ KD ngoại hối
trading_securities_income: isb32 # Lãi/lỗ mua bán CK kinh doanh
investment_securities_income: isb33  # Lãi/lỗ mua bán CK đầu tư
other_income_bank: isb36         # Lãi/lỗ hoạt động khác
# ROA-breakdown extra
tax_expense: isa19               # Chi phí thuế TNDN (âm)
```
(If `investment_securities` already exists from Phase 1, do NOT duplicate the key — YAML duplicate keys are invalid; keep one.)

- [ ] **Step 2 — extend `tests/test_bctc_mapping.py`:**
```python
def test_bank_mapping_phase3_components() -> None:
    m = load_mapping("bank")
    assert m["deposits_at_other_ci"] == "bsb98"
    assert m["valuable_papers"] == "bsb116"
    assert m["fx_income"] == "isb31"
    assert m["tax_expense"] == "isa19"
```
Run → PASS. Commit: `git add app/services/bctc/mapping/bank.yaml tests/test_bctc_mapping.py && git commit -m "feat(bctc): bank mapping — earning-asset/IBL/TOI-mix component concepts"`

---

### Task 3.2: Bank aggregates + NIM unlock
**Files:** Modify `backend/app/services/bctc/kpi_bank.py` and `kpi_bank_modules.py`; Test `tests/test_bctc_bank_aggregates.py`.

- [ ] **Step 1 — test** `tests/test_bctc_bank_aggregates.py`:
```python
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_bank as kb
from app.services.bctc import kpi_bank_modules as bm


def _p(year, **v):
    return Period(year=year, length=5, values=v)


def test_earning_assets_sum() -> None:
    p = _p(2025, deposits_at_sbv=10.0, deposits_at_other_ci=20.0, trading_securities=5.0,
           customer_loans=100.0, investment_securities=15.0)
    assert math.isclose(kb.earning_assets(p), 150.0)


def test_ibl_sum() -> None:
    p = _p(2025, govt_sbv_borrowings=5.0, ci_deposits_borrowings=15.0,
           customer_deposits=100.0, valuable_papers=10.0)
    assert math.isclose(kb.interest_bearing_liabilities(p), 130.0)


def test_nim_uses_derived_earning_assets() -> None:
    cur = _p(2025, net_interest_income=35.0, customer_loans=900.0, investment_securities=100.0,
             deposits_at_sbv=0.0, deposits_at_other_ci=0.0, trading_securities=0.0)
    prev = _p(2024, customer_loans=800.0, investment_securities=100.0)
    # avg EA = ((1000)+(900))/2 = 950 ; NIM = 35/950
    assert math.isclose(kb.nim(cur, prev), 35.0 / 950.0)


def test_nim_decomposition_uses_derived() -> None:
    cur = _p(2025, interest_income_gross=80.0, interest_expense=45.0,
             customer_loans=1000.0, customer_deposits=950.0)
    prev = _p(2024, customer_loans=1000.0, customer_deposits=950.0)
    d = bm.nim_decomposition(cur, prev)
    assert math.isclose(d["yield_ea"], 80.0 / 1000.0)
    assert math.isclose(d["cost_of_funds"], 45.0 / 950.0)
```

- [ ] **Step 2** → FAIL.
- [ ] **Step 3 — implement** in `kpi_bank.py`: add module-level concept tuples + derivation helpers + an `_avg_fn` that averages a derived value over cur/prev; rewrite `nim` to use the derived earning assets:
```python
_EARNING_ASSET_CONCEPTS = (
    "deposits_at_sbv", "deposits_at_other_ci", "trading_securities",
    "customer_loans", "investment_securities",
)
_IBL_CONCEPTS = (
    "govt_sbv_borrowings", "ci_deposits_borrowings", "customer_deposits", "valuable_papers",
)


def _sum_concepts(p: Period, concepts: tuple[str, ...]) -> float | None:
    present = [val(p, c) for c in concepts]
    vals = [v for v in present if v is not None]
    return sum(vals) if vals else None


def earning_assets(p: Period) -> float | None:
    return _sum_concepts(p, _EARNING_ASSET_CONCEPTS)


def interest_bearing_liabilities(p: Period) -> float | None:
    return _sum_concepts(p, _IBL_CONCEPTS)


def _avg_derived(cur: Period, prev: Period | None, fn: "Callable[[Period], float | None]") -> float | None:
    a = fn(cur)
    if a is None:
        return None
    b = fn(prev) if prev is not None else None
    return (a + b) / 2 if b is not None else a
```
(Add `from collections.abc import Callable` import.) Then change `nim`:
```python
def nim(cur: Period, prev: Period | None) -> float | None:
    nii = val(cur, "net_interest_income")
    ea = _avg_derived(cur, prev, earning_assets)
    if nii is None or not ea:
        return None
    return nii / ea
```
And in `kpi_bank_modules.py` `nim_decomposition`, replace the `_avg(cur, prev, "earning_assets")`/`"interest_bearing_liabilities"` lookups with the derived versions:
```python
from app.services.bctc.kpi_bank import earning_assets, interest_bearing_liabilities

def nim_decomposition(cur: Period, prev: Period | None) -> dict[str, float | None]:
    ea = _avg_fn(cur, prev, earning_assets)
    ibl = _avg_fn(cur, prev, interest_bearing_liabilities)
    y = _pct(val(cur, "interest_income_gross"), ea)
    cof = _pct(val(cur, "interest_expense"), ibl)
    spread = (y - cof) if y is not None and cof is not None else None
    return {"yield_ea": y, "cost_of_funds": cof, "spread": spread}
```
where `_avg_fn` is a local helper mirroring `_avg_derived` (or import `_avg_derived`). Keep it None-safe; `interest_expense` may be negative → use `abs()` for cof: `cof = _pct(abs(ie) if (ie:=val(cur,"interest_expense")) is not None else None, ibl)`.

- [ ] **Step 4** → PASS. Full bctc suite no regression. mypy/ruff clean (the `Callable` annotation needs the import; `_avg_derived` fn-param typed).
- [ ] **Step 5** — commit: `git add app/services/bctc/kpi_bank.py app/services/bctc/kpi_bank_modules.py tests/test_bctc_bank_aggregates.py && git commit -m "feat(bctc): derive earning-assets/IBL → unlock bank NIM + NIM decomposition"`

---

### Task 3.3: Bank DuPont (Module 5B)
**Files:** Create `backend/app/services/bctc/bank_dupont.py`; Test `tests/test_bctc_bank_dupont.py`.

- [ ] **Step 1 — test:**
```python
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc.bank_dupont import bank_dupont


def _p(year, **v):
    return Period(year=year, length=5, values=v)


def test_bank_dupont() -> None:
    cur = _p(2025, npat=20.0, total_assets=1000.0, equity=100.0,
             net_interest_income=35.0, total_operating_income=50.0,
             operating_expense=-20.0, provision_expense=-5.0, tax_expense=-4.0)
    prev = _p(2024, total_assets=900.0, equity=90.0)
    d = bank_dupont(cur, prev)
    assert math.isclose(d["roa"], 20.0 / 950.0)            # avg TA = 950
    assert math.isclose(d["equity_multiplier"], 950.0 / 95.0)
    assert math.isclose(d["roe"], (20.0/950.0) * (950.0/95.0))
    assert math.isclose(d["nii_to_ta"], 35.0 / 950.0)
    assert math.isclose(d["non_nii_to_ta"], (50.0 - 35.0) / 950.0)
    assert math.isclose(d["opex_to_ta"], 20.0 / 950.0)     # abs
    assert math.isclose(d["provision_to_ta"], 5.0 / 950.0)
    assert math.isclose(d["tax_to_ta"], 4.0 / 950.0)
```

- [ ] **Step 2** → FAIL.
- [ ] **Step 3 — implement** `bank_dupont.py`:
```python
from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val


def _avg(cur: Period, prev: Period | None, c: str) -> float | None:
    a = val(cur, c)
    if a is None:
        return None
    b = val(prev, c) if prev is not None else None
    return (a + b) / 2 if b is not None else a


def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def bank_dupont(cur: Period, prev: Period | None) -> dict[str, Any]:
    avg_ta = _avg(cur, prev, "total_assets")
    avg_eq = _avg(cur, prev, "equity")
    roa = _ratio(val(cur, "npat"), avg_ta)
    em = _ratio(avg_ta, avg_eq)
    roe = (roa * em) if roa is not None and em is not None else None
    nii = val(cur, "net_interest_income")
    toi = val(cur, "total_operating_income")
    non_nii = (toi - nii) if toi is not None and nii is not None else None
    opex = val(cur, "operating_expense")
    prov = val(cur, "provision_expense")
    tax = val(cur, "tax_expense")
    return {
        "roa": roa,
        "equity_multiplier": em,
        "roe": roe,
        "nii_to_ta": _ratio(nii, avg_ta),
        "non_nii_to_ta": _ratio(non_nii, avg_ta),
        "opex_to_ta": _ratio(abs(opex) if opex is not None else None, avg_ta),
        "provision_to_ta": _ratio(abs(prov) if prov is not None else None, avg_ta),
        "tax_to_ta": _ratio(abs(tax) if tax is not None else None, avg_ta),
    }
```

- [ ] **Step 4** → PASS. mypy/ruff clean.
- [ ] **Step 5** — commit: `git add app/services/bctc/bank_dupont.py tests/test_bctc_bank_dupont.py && git commit -m "feat(bctc): Bank DuPont (ROA × equity multiplier + ROA breakdown)"`

---

### Task 3.4: Enrich TOI Mix + Bank Forensic Panel + blind-spots
**Files:** Modify `kpi_bank_modules.py` (toi_mix), `forensic.py` (_bank rules + BANK_BLIND_SPOTS); Test extend `tests/test_bctc_kpi_bank_modules.py`, `tests/test_bctc_forensic.py`.

- [ ] **Step 1 — extend toi_mix test** (`tests/test_bctc_kpi_bank_modules.py`, add):
```python
def test_toi_mix_trading_and_other() -> None:
    p = _p(2025, total_operating_income=100.0, net_interest_income=70.0, net_fee_income=10.0,
           fx_income=5.0, trading_securities_income=3.0, investment_securities_income=2.0,
           other_income_bank=10.0)
    mix = bm.toi_mix(p)
    assert math.isclose(mix["trading_pct"], (5.0+3.0+2.0)/100.0)
    assert math.isclose(mix["other_pct"], 10.0/100.0)
```
Implement in `toi_mix`: add `trading_pct = (fx_income + trading_securities_income + investment_securities_income)/TOI` (sum present), `other_pct = other_income_bank/TOI`. Keep nii_pct/fee_pct.

- [ ] **Step 2 — Bank Forensic + blind-spots** in `forensic.py`: extend `_bank` with more rules from spec §Module 7B (NIM>3.5% 3y green already; add LLR/Loans>2.5% green, Non-NII/TOI>25% green; CoR-spike, NIM-compression reds — these need series/deltas passed in metrics; for MVP add the ones computable from single-period metrics: equity_ratio>0.08 green, ldr>0.85 red already, cir>0.45 red already). Add a module-level constant + helper:
```python
BANK_BLIND_SPOTS = [
    "Nợ nhóm 2-5 (phân loại nợ) — cần thuyết minh",
    "CASA (tỷ lệ tiền gửi không kỳ hạn) — cần thuyết minh",
    "CAR (hệ số an toàn vốn) — cần RWA, không có trong BCTC thuần số",
    "Nợ tái cơ cấu (TT02) — cần thuyết minh",
]
```
Add a test in `tests/test_bctc_forensic.py`:
```python
def test_bank_blind_spots_exported() -> None:
    from app.services.bctc.forensic import BANK_BLIND_SPOTS
    assert any("CASA" in s for s in BANK_BLIND_SPOTS)
    assert any("CAR" in s for s in BANK_BLIND_SPOTS)
```
- [ ] **Step 3** run both test files → PASS. mypy/ruff clean.
- [ ] **Step 4** — commit: `git add app/services/bctc/kpi_bank_modules.py app/services/bctc/forensic.py tests/test_bctc_kpi_bank_modules.py tests/test_bctc_forensic.py && git commit -m "feat(bctc): enrich TOI mix (trading/other) + bank forensic rules + blind-spots list"`

---

### Task 3.5: Sub-sector detection + Spotlight (Template A)
**Files:** Modify `sector.py` (detect_subsector); Create `backend/app/services/bctc/subsector.py` (spotlight); Test `tests/test_bctc_subsector.py`.

- [ ] **Step 1 — test:**
```python
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc.sector import detect_subsector
from app.services.bctc.subsector import subsector_spotlight


def _p(**v):
    return Period(year=2025, length=5, values=v)


def test_detect_it_services() -> None:
    # TSCĐ/TS < 20% và HTK/TS < 5% -> CNTT/Dịch vụ
    p = _p(net_fixed_assets=10.0, inventory_gross=2.0, total_assets=100.0)
    assert detect_subsector(p) == "cntt_dichvu"


def test_detect_retail() -> None:
    # HTK/TS > 20% và CCC < 0 -> Bán lẻ
    p = _p(net_fixed_assets=10.0, inventory_gross=30.0, total_assets=100.0)
    assert detect_subsector(p, ccc=-5.0) == "ban_le"


def test_detect_manufacturing_default() -> None:
    p = _p(net_fixed_assets=40.0, inventory_gross=10.0, total_assets=100.0)
    assert detect_subsector(p) == "san_xuat"


def test_spotlight_returns_label_and_metrics() -> None:
    p = _p(net_fixed_assets=10.0, inventory_gross=2.0, total_assets=100.0)
    sp = subsector_spotlight(p, "cntt_dichvu")
    assert sp["label"]
    assert "asset_intensity" in sp["metrics"]
```

- [ ] **Step 2** → FAIL.
- [ ] **Step 3 — implement** `detect_subsector` in `sector.py` (single-period heuristic; `ccc` optional from WCC):
```python
def detect_subsector(p: "Period", ccc: float | None = None) -> str:
    from app.services.bctc.statements import val
    ta = val(p, "total_assets")
    if not ta:
        return "san_xuat"
    nfa = (val(p, "net_fixed_assets") or 0.0) / ta
    inv = (val(p, "inventory_gross") or 0.0) / ta
    bp = (val(p, "buyer_prepayments") or 0.0) / ta
    if bp > 0.15 and inv > 0.30:
        return "bat_dong_san"
    if nfa > 0.60:
        return "tien_ich"
    if ccc is not None and ccc < 0 and inv > 0.20:
        return "ban_le"
    if nfa < 0.20 and inv < 0.05:
        return "cntt_dichvu"
    return "san_xuat"
```
And `subsector.py`:
```python
from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val

_LABELS = {
    "san_xuat": "Sản xuất / Công nghiệp", "cntt_dichvu": "CNTT / Dịch vụ",
    "ban_le": "Bán lẻ", "bat_dong_san": "Bất động sản", "tien_ich": "Tiện ích / Điện",
}


def _ratio(n: float | None, d: float | None) -> float | None:
    if n is None or not d:
        return None
    return n / d


def subsector_spotlight(p: Period, subsector: str) -> dict[str, Any]:
    ta = val(p, "total_assets")
    metrics: dict[str, float | None] = {
        "asset_intensity": _ratio(val(p, "net_fixed_assets"), ta),
        "inventory_ratio": _ratio(val(p, "inventory_gross"), ta),
    }
    return {"subsector": subsector, "label": _LABELS.get(subsector, "Hỗn hợp"), "metrics": metrics}
```

- [ ] **Step 4** → PASS. mypy/ruff clean.
- [ ] **Step 5** — commit: `git add app/services/bctc/sector.py app/services/bctc/subsector.py tests/test_bctc_subsector.py && git commit -m "feat(bctc): sub-sector detection (5 ngành + default) + spotlight"`

---

### Task 3.6: Wire Phase-3 compute into assembler
**Files:** Modify `assemble.py`; Test extend `tests/test_bctc_assemble.py`.

- [ ] **Step 1 — extend test:**
```python
def test_assemble_bank_has_nim_dupont_blindspots() -> None:
    is_rows = [_mk(2025, 5, isb38=100.0, isb27=70.0, isb39=-20.0, isb41=-5.0, isa19=-4.0, isa20=20.0),
               _mk(2024, 5, isb38=90.0, isb27=63.0)]
    bs_rows = [_mk(2025, 5, bsa53=1000.0, bsa78=100.0, bsb104=900.0, bsb106=100.0, bsb113=800.0),
               _mk(2024, 5, bsa53=900.0, bsa78=90.0, bsb104=800.0, bsb106=100.0, bsb113=750.0)]
    out = build_bctc_payload(bs_rows, is_rows, [])
    assert out["template"] == "B"
    snap = {c["key"]: c["value"] for c in out["snapshot"]}
    assert snap["nim"] is not None            # NIM now computes
    assert "bank_dupont" in [m["id"] for m in out["modules"]]
    assert "blind_spots" in out


def test_assemble_nonbank_has_subsector() -> None:
    is_rows = [_mk(2025, 5, isa3=600.0, isa20=80.0), _mk(2024, 5, isa3=500.0)]
    bs_rows = [_mk(2025, 5, bsa53=1000.0, bsa29=10.0, bsa16=2.0)]
    out = build_bctc_payload(bs_rows, is_rows, [])
    assert "subsector" in out and out["subsector"]["label"]
```

- [ ] **Step 2** → FAIL.
- [ ] **Step 3 — implement** in `assemble.py`:
  - imports: `from app.services.bctc.bank_dupont import bank_dupont`; `from app.services.bctc.sector import detect_subsector`; `from app.services.bctc.subsector import subsector_spotlight`; `from app.services.bctc.forensic import BANK_BLIND_SPOTS`.
  - In `_modules_b`, append `{"id": "bank_dupont", "title": "DuPont Ngân hàng", "type": "ratios", "data": bank_dupont(cur, prev)}`. (nim_decomp already present — now returns real values.)
  - In `build_bctc_payload`: for bank → add `"blind_spots": BANK_BLIND_SPOTS` to the return dict; for non-bank → compute `ccc = _modules_a`'s wcc ccc (or recompute via working_capital_cycle) and `sub = detect_subsector(cur0, ccc=ccc)`, add `"subsector": subsector_spotlight(cur0, sub)`. Add `"blind_spots": []` / `"subsector": None` to the empty shell. (Keep keys always present: bank → blind_spots list + subsector None; non-bank → subsector + blind_spots []. Simplest: always include both keys.)

- [ ] **Step 4** → PASS. Full bctc suite + `mypy app/services/bctc` + `ruff` clean. Run a **live smoke** locally is not possible (no live in test), but run `uv run --frozen pytest tests/test_bctc_*.py -q` (all pass).
- [ ] **Step 5** — commit: `git add app/services/bctc/assemble.py tests/test_bctc_assemble.py && git commit -m "feat(bctc): wire bank DuPont + NIM + blind-spots + sub-sector into payload"`

---

### Task 3.7: Frontend — blind-spots box + sub-sector label
**Files:** Modify `dashboard/src/components/stock/bctc-analysis.tsx`.

- [ ] **Step 1 — implement** (read file first):
  - Extend `BctcPayload` type: `subsector?: { label: string; metrics: Record<string, number|null> } | null`; `blind_spots?: string[]`.
  - Snapshot ① header: if `data.subsector?.label`, append it (e.g. `· {data.subsector.label}`) for non-bank.
  - The new `bank_dupont` module auto-renders via the generic module renderer (keys roa/equity_multiplier/roe/nii_to_ta/... — `roe` already in PCT_KEYS; add `roa`, `nii_to_ta`, `non_nii_to_ta`, `opex_to_ta`, `provision_to_ta`, `tax_to_ta` to PCT_KEYS so they show as %; `equity_multiplier` stays ratio). nim_decomp now shows real yield/cof/spread (already in PCT_KEYS).
  - Add a **blind-spots box** (bank only, premium-gated) after the forensic/trinity area:
```tsx
{data.blind_spots && data.blind_spots.length > 0 && (
  <section className="mt-4">
    <h3 className="font-serif text-base font-bold mb-2">Điểm mù dữ liệu (cần bản Pro)</h3>
    <div className="relative min-h-[80px]">
      <PremiumGate featureName="Điểm mù ngân hàng" description="Các chỉ tiêu cần thuyết minh chi tiết (NPL nhóm, CASA, CAR).">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          {data.blind_spots.map((s, i) => (
            <div key={i} className="text-xs text-muted-foreground mb-1">• {s}</div>
          ))}
        </div>
      </PremiumGate>
    </div>
  </section>
)}
```

- [ ] **Step 2** — `npm run build` clean. Commit: `git add dashboard/src/components/stock/bctc-analysis.tsx && git commit -m "feat(bctc): render bank DuPont/NIM %, sub-sector label, blind-spots box (premium)"`

---

## Nghiệm thu Phase 3
- [ ] `uv run --frozen pytest tests/test_bctc_*.py -q` all pass; `mypy app/services/bctc` + `ruff` clean.
- [ ] `npx vitest run tests/bctc-*.spec.ts` pass; `npm run build` clean.
- [ ] **Live smoke (deploy):** `GET /market-data/bctc/VCB` now returns `snapshot.nim` non-null (≈2-3.5%), `bank_dupont` module, `blind_spots` list; `GET /market-data/bctc/FPT` returns `subsector.label` (CNTT/Dịch vụ). Verify NIM ballpark vs reality (TCB~3.4%, MBB~3.3%).

## Ngoài phạm vi (Phase 4)
- Định giá: Football Field (Template A) + Justified P/B + ma trận NIM×CoR (Template B) — cần giá lịch sử + β.
- Insurance/Securities sub-sector detection (cần concept Dự phòng nghiệp vụ / FVTPL).
- Bank-specific AI prompt tuning; AI notes cho module ngân hàng.
- Polished viz: DuPont chain SVG, trinity gauges, sparklines, sub-sector spotlight cards.

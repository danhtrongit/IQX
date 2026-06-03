# BCTC Phase 2 — Lớp AI + DuPont + Forensic Trinity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Thêm (a) compute sâu — DuPont 5 bước + Bộ ba Forensic (Piotroski F, Beneish M; Altman tái dùng); (b) lớp AI — AI Memo tổng + ghi chú từng module (1 lần gọi LLM, output JSON), deterministic guard; (c) premium gating cho các lớp AI + Trinity. Phase 1 (snapshot/modules/forensic panel) giữ MIỄN PHÍ.

**Architecture:** Compute mới = hàm thuần (như Phase 1) → thêm vào assembler `build_bctc_payload` (public endpoint, free). AI = `build_bctc_ai_payload` (payloads.py, reuse `get_bctc`) → `analyze_bctc` (analysis_service.py: prompt → chat_completion → parse JSON → **post-flight guard** → cache) → premium endpoint `GET /api/v1/ai/bctc/{symbol}`. Frontend: AI Memo + per-module notes qua `api` ky client + react-markdown, bọc `PremiumGate`.

**Tech Stack:** Python/FastAPI, pytest (mock AI). React 19 + react-markdown + remark-gfm + ky `api` client + PremiumGate.

**Spec:** `dashboard/docs/specs/2026-06-03-bctc-analysis-dashboard-design.md` (§4.5, §7, §12 Phase 2, §13). Builds on Phase 0+1 (shipped).

**Determinism contract (spec §7):** AI nhận CHỈ số đã tính (payload = `get_bctc` output, không gửi statement thô). Post-flight guard loại: số không có trong payload (chống bịa), khuyến nghị "Mua/Bán/Giữ", từ mơ hồ. AI gọi 1 model env (`AI_PROXY_MODEL`), 1 lần/mã, cache tới cuối phiên giao dịch.

---

## Cấu trúc file

**Backend — tạo mới:**
- `backend/app/services/bctc/dupont.py` — `dupont(cur, prev)`.
- `backend/app/services/bctc/forensic_scores.py` — `piotroski_f(cur, prev)`, `beneish_m(cur, prev)`.
- `backend/app/services/bctc/ai_guard.py` — `sanitize_ai_output(text, allowed_numbers)`, `extract_allowed_numbers(kpi_payload)`.
- `backend/docs/ai/ai-bctc.md` — system prompt (Vietnamese).
- Tests: `tests/test_bctc_dupont.py`, `tests/test_bctc_forensic_scores.py`, `tests/test_bctc_ai_guard.py`, `tests/test_bctc_ai_payload.py`, `tests/test_bctc_ai_service.py`, `tests/test_bctc_ai_endpoint.py`.

**Backend — sửa:**
- `backend/app/services/bctc/assemble.py` — add DuPont module + `trinity` block (Template A; banks: DuPont bank deferred, trinity Altman/Piotroski only where applicable).
- `backend/app/services/ai/payloads.py` — add `build_bctc_ai_payload`.
- `backend/app/services/ai/prompt_loader.py` — add `"bctc": "ai-bctc.md"` to `PROMPT_FILES`.
- `backend/app/services/ai/analysis_service.py` — add `analyze_bctc` (+ JSON parse + guard).
- `backend/app/api/v1/endpoints/ai_analysis.py` — add `GET /bctc/{symbol}` (premium).

**Frontend — tạo mới:**
- `dashboard/src/components/stock/bctc-ai.ts` — pure parse/format helpers (testable) for AI payload.
- `dashboard/src/components/stock/bctc-ai-memo.tsx` — AI Memo + per-module note components (api client + react-markdown).
- `dashboard/tests/bctc-ai.spec.ts` — vitest.

**Frontend — sửa:**
- `dashboard/src/components/stock/bctc-analysis.tsx` — render DuPont + Trinity (from public payload); mount AI Memo (layer ②) + per-module notes, each in `PremiumGate`.

---

## Quy ước (giống Phase 1)
- Backend test: `export PATH="$HOME/.local/bin:$PATH" && cd /Users/danhtrongit/Projects/IQX/backend && uv run --frozen pytest tests/<file> -q`. Lint/type: `uv run --frozen ruff check <files>` + `uv run --frozen mypy app/services/bctc app/services/ai/<files>`.
- Frontend test: `cd /Users/danhtrongit/Projects/IQX/dashboard && npx vitest run tests/<file>`; build: `npm run build`.
- KPI = hàm thuần trên `Period` (concept-keyed); trả `float|None`/dict; None khi thiếu input/mẫu số 0. AI tests MOCK `chat_completion`/`analyze_bctc` (không gọi LLM thật).
- Commit mỗi task. Nhánh mới `feat/bctc-phase2-ai` từ `main`.

---

### Task 2.1: DuPont 5 bước (dupont.py)
**Files:** Create `app/services/bctc/dupont.py`; Test `tests/test_bctc_dupont.py`.

- [ ] **Step 1 — failing test** `tests/test_bctc_dupont.py`:
```python
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc.dupont import dupont


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_dupont_five_drivers_and_roe() -> None:
    cur = _p(2025, npat=87.0, profit_before_tax=100.0, operating_profit=120.0,
             net_revenue=600.0, total_assets=720.0, equity=400.0)
    prev = _p(2024, total_assets=680.0, equity=360.0)
    d = dupont(cur, prev)
    assert math.isclose(d["tax_burden"], 0.87)            # 87/100
    assert math.isclose(d["interest_burden"], 100/120)    # PBT/EBIT
    assert math.isclose(d["op_margin"], 0.20)             # 120/600
    assert math.isclose(d["asset_turnover"], 600/700)     # rev / avg TA (720+680)/2=700
    assert math.isclose(d["equity_multiplier"], 700/380)  # avg TA / avg equity (400+360)/2=380
    # ROE = product of the 5
    prod = 0.87 * (100/120) * 0.20 * (600/700) * (700/380)
    assert math.isclose(d["roe"], prod, rel_tol=1e-9)


def test_dupont_none_on_missing() -> None:
    d = dupont(_p(2025, npat=87.0), None)
    assert d["roe"] is None
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3 — implement** `app/services/bctc/dupont.py`:
```python
from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val


def _avg(cur: Period, prev: Period | None, c: str) -> float | None:
    a = val(cur, c)
    if a is None:
        return None
    b = val(prev, c)
    return (a + b) / 2 if b is not None else a


def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def dupont(cur: Period, prev: Period | None) -> dict[str, Any]:
    tax_burden = _ratio(val(cur, "npat"), val(cur, "profit_before_tax"))
    interest_burden = _ratio(val(cur, "profit_before_tax"), val(cur, "operating_profit"))
    op_margin = _ratio(val(cur, "operating_profit"), val(cur, "net_revenue"))
    asset_turnover = _ratio(val(cur, "net_revenue"), _avg(cur, prev, "total_assets"))
    equity_multiplier = _ratio(_avg(cur, prev, "total_assets"), _avg(cur, prev, "equity"))
    drivers = [tax_burden, interest_burden, op_margin, asset_turnover, equity_multiplier]
    roe: float | None
    if any(x is None for x in drivers):
        roe = None
    else:
        roe = 1.0
        for x in drivers:
            roe *= x  # type: ignore[operator]
    return {
        "tax_burden": tax_burden,
        "interest_burden": interest_burden,
        "op_margin": op_margin,
        "asset_turnover": asset_turnover,
        "equity_multiplier": equity_multiplier,
        "roe": roe,
    }
```

- [ ] **Step 4** — run → PASS (2 passed). `ruff check` + `mypy` clean.
- [ ] **Step 5** — commit: `git add app/services/bctc/dupont.py tests/test_bctc_dupont.py && git commit -m "feat(bctc): DuPont 5-step decomposition module"`

---

### Task 2.2: Forensic scores — Piotroski F + Beneish M (forensic_scores.py)
**Files:** Create `app/services/bctc/forensic_scores.py`; Test `tests/test_bctc_forensic_scores.py`.

- [ ] **Step 1 — failing test** `tests/test_bctc_forensic_scores.py`:
```python
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc.forensic_scores import piotroski_f, beneish_m


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_piotroski_full_score() -> None:
    # Mọi tiêu chí đều đạt -> F = 9.
    cur = _p(2025, npat=100.0, total_assets=1000.0, cfo=150.0, lt_debt=80.0,
             current_assets=500.0, current_liabilities=200.0, proceeds_from_shares=0.0,
             gross_profit=400.0, net_revenue=900.0)
    prev = _p(2024, npat=80.0, total_assets=1000.0, cfo=90.0, lt_debt=100.0,
              current_assets=400.0, current_liabilities=220.0,
              gross_profit=320.0, net_revenue=800.0)
    r = piotroski_f(cur, prev)
    assert r["score"] == 9
    assert r["criteria"]["roa_positive"] is True
    assert r["criteria"]["no_dilution"] is True


def test_piotroski_none_without_prev() -> None:
    r = piotroski_f(_p(2025, npat=1.0, total_assets=10.0), None)
    assert r["score"] is None


def test_beneish_m_computes() -> None:
    cur = _p(2025, trade_receivables=120.0, net_revenue=1100.0, gross_profit=400.0,
             current_assets=500.0, net_fixed_assets=200.0, total_assets=1000.0,
             depreciation=50.0, selling_expense=60.0, admin_expense=40.0,
             total_liabilities=600.0, npat=100.0, cfo=130.0)
    prev = _p(2024, trade_receivables=90.0, net_revenue=1000.0, gross_profit=380.0,
              current_assets=460.0, net_fixed_assets=190.0, total_assets=950.0,
              depreciation=48.0, selling_expense=55.0, admin_expense=38.0,
              total_liabilities=560.0)
    m = beneish_m(cur, prev)
    assert m is not None and isinstance(m, float)


def test_beneish_none_on_missing() -> None:
    assert beneish_m(_p(2025, net_revenue=100.0), None) is None
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3 — implement** `app/services/bctc/forensic_scores.py` (Altman dùng lại `kpi_nonbank.altman_z`; đây là Piotroski + Beneish):
```python
from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val


def _r(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def piotroski_f(cur: Period, prev: Period | None) -> dict[str, Any]:
    """Piotroski F-Score 0..9. Cần kỳ trước cho 5 tiêu chí thay đổi; thiếu -> score None."""
    if prev is None:
        return {"score": None, "criteria": {}}
    roa = _r(val(cur, "npat"), val(cur, "total_assets"))
    roa_prev = _r(val(prev, "npat"), val(prev, "total_assets"))
    cfo = val(cur, "cfo")
    npat = val(cur, "npat")
    cr = _r(val(cur, "current_assets"), val(cur, "current_liabilities"))
    cr_prev = _r(val(prev, "current_assets"), val(prev, "current_liabilities"))
    gm = _r(val(cur, "gross_profit"), val(cur, "net_revenue"))
    gm_prev = _r(val(prev, "gross_profit"), val(prev, "net_revenue"))
    at = _r(val(cur, "net_revenue"), val(cur, "total_assets"))
    at_prev = _r(val(prev, "net_revenue"), val(prev, "total_assets"))
    ltd, ltd_prev = val(cur, "lt_debt"), val(prev, "lt_debt")
    shares = val(cur, "proceeds_from_shares")

    c: dict[str, bool | None] = {
        "roa_positive": (roa > 0) if roa is not None else None,
        "cfo_positive": (cfo > 0) if cfo is not None else None,
        "roa_increasing": (roa > roa_prev) if roa is not None and roa_prev is not None else None,
        "accrual_quality": (cfo > npat) if cfo is not None and npat is not None else None,
        "lower_leverage": (ltd < ltd_prev) if ltd is not None and ltd_prev is not None else None,
        "current_ratio_up": (cr > cr_prev) if cr is not None and cr_prev is not None else None,
        "no_dilution": (shares == 0) if shares is not None else None,
        "gross_margin_up": (gm > gm_prev) if gm is not None and gm_prev is not None else None,
        "asset_turnover_up": (at > at_prev) if at is not None and at_prev is not None else None,
    }
    score = sum(1 for v in c.values() if v is True)
    return {"score": score, "criteria": c}


def _asset_quality(p: Period) -> float | None:
    ca, nfa, ta = val(p, "current_assets"), val(p, "net_fixed_assets"), val(p, "total_assets")
    if ca is None or nfa is None or not ta:
        return None
    return 1 - (ca + nfa) / ta


def beneish_m(cur: Period, prev: Period | None) -> float | None:
    """Beneish M-Score (8 cấu phần, 2 kỳ). Thiếu bất kỳ cấu phần -> None."""
    if prev is None:
        return None
    dsri = _ratio_index(_r(val(cur, "trade_receivables"), val(cur, "net_revenue")),
                        _r(val(prev, "trade_receivables"), val(prev, "net_revenue")))
    gm_c = _r(val(cur, "gross_profit"), val(cur, "net_revenue"))
    gm_p = _r(val(prev, "gross_profit"), val(prev, "net_revenue"))
    gmi = _ratio_index(gm_p, gm_c)  # GMI = prev/cur
    aqi = _ratio_index(_asset_quality(cur), _asset_quality(prev))
    sgi = _ratio_index(val(cur, "net_revenue"), val(prev, "net_revenue"))
    depi = _ratio_index(_dep_rate(prev), _dep_rate(cur))  # DEPI = prev/cur
    sga_c = _r(_sum2(val(cur, "selling_expense"), val(cur, "admin_expense")), val(cur, "net_revenue"))
    sga_p = _r(_sum2(val(prev, "selling_expense"), val(prev, "admin_expense")), val(prev, "net_revenue"))
    sgai = _ratio_index(sga_c, sga_p)
    lvgi = _ratio_index(_r(val(cur, "total_liabilities"), val(cur, "total_assets")),
                        _r(val(prev, "total_liabilities"), val(prev, "total_assets")))
    npat, cfo, ta = val(cur, "npat"), val(cur, "cfo"), val(cur, "total_assets")
    tata = ((npat - cfo) / ta) if npat is not None and cfo is not None and ta else None
    parts = [dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata]
    if any(x is None for x in parts):
        return None
    return (-4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi  # type: ignore[operator]
            + 0.115 * depi - 0.172 * sgai - 0.327 * lvgi + 4.679 * tata)


def _sum2(a: float | None, b: float | None) -> float | None:
    vals = [abs(x) for x in (a, b) if x is not None]
    return sum(vals) if vals else None


def _dep_rate(p: Period) -> float | None:
    dep, nfa = val(p, "depreciation"), val(p, "net_fixed_assets")
    if dep is None or nfa is None:
        return None
    denom = abs(dep) + nfa
    return abs(dep) / denom if denom else None


def _ratio_index(num: float | None, den: float | None) -> float | None:
    if num is None or den in (None, 0):
        return None
    return num / den
```

- [ ] **Step 4** — run → PASS (4 passed). `ruff`/`mypy` clean.
- [ ] **Step 5** — commit: `git add app/services/bctc/forensic_scores.py tests/test_bctc_forensic_scores.py && git commit -m "feat(bctc): Piotroski F-Score + Beneish M-Score (forensic trinity compute)"`

---

### Task 2.3: Wire DuPont + Trinity into assembler
**Files:** Modify `app/services/bctc/assemble.py`; Test `tests/test_bctc_assemble.py` (extend).

- [ ] **Step 1 — extend test** `tests/test_bctc_assemble.py` (append):
```python
def test_assemble_includes_dupont_and_trinity_nonbank() -> None:
    is_rows = [_mk(2025, 5, isa3=600.0, isa20=87.0, isa16=100.0, isa11=120.0),
               _mk(2024, 5, isa3=500.0, isa20=70.0, isa16=90.0, isa11=100.0)]
    bs_rows = [_mk(2025, 5, bsa53=720.0, bsa78=400.0), _mk(2024, 5, bsa53=680.0, bsa78=360.0)]
    out = build_bctc_payload(bs_rows, is_rows, [])
    mod_ids = [m["id"] for m in out["modules"]]
    assert "dupont" in mod_ids
    assert "trinity" in out
    assert set(out["trinity"]).issuperset({"altman_z", "piotroski_f", "beneish_m"})
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3 — implement:** in `assemble.py`:
  - import: `from app.services.bctc.dupont import dupont`; `from app.services.bctc.forensic_scores import piotroski_f, beneish_m`; (altman_z already importable via `kpi_nonbank`).
  - In `_modules_a`, append a DuPont module: `{"id": "dupont", "title": "DuPont 5 bước", "type": "ratios", "data": dupont(cur, prev)}`.
  - In `build_bctc_payload`, after computing snapshot, add a `trinity` dict (compute for both templates; Template A uses kpi_nonbank.altman_z, Template B leaves altman None):
```python
    cur0 = periods[0]
    prev0 = periods[1] if len(periods) > 1 else None
    trinity = {
        "altman_z": (kpi_nonbank.altman_z(cur0) if not is_bank else None),
        "piotroski_f": piotroski_f(cur0, prev0),
        "beneish_m": beneish_m(cur0, prev0),
    }
```
   and add `"trinity": trinity` to the returned dict (and `"trinity": {}` in the empty-periods shell).
   - For Template B, also append DuPont? Bank DuPont differs (Phase 3) — SKIP for banks (only add dupont module when `not is_bank`).

- [ ] **Step 4** — run → PASS. Full bctc suite no regression: `uv run --frozen pytest tests/test_bctc_*.py -q`. `mypy`/`ruff` clean.
- [ ] **Step 5** — commit: `git add app/services/bctc/assemble.py tests/test_bctc_assemble.py && git commit -m "feat(bctc): add DuPont module + forensic trinity block to payload"`

---

### Task 2.4: AI determinism guard (ai_guard.py)
**Files:** Create `app/services/bctc/ai_guard.py`; Test `tests/test_bctc_ai_guard.py`.

- [ ] **Step 1 — failing test** `tests/test_bctc_ai_guard.py`:
```python
from __future__ import annotations

from app.services.bctc.ai_guard import sanitize_ai_output, extract_allowed_numbers


def test_extract_allowed_numbers_from_payload() -> None:
    payload = {"snapshot": [{"value": 0.241}, {"value": None}],
               "modules": [{"data": {"dso": 89.0, "x": None}}], "trinity": {"altman_z": 4.21}}
    nums = extract_allowed_numbers(payload)
    assert 0.241 in nums and 89.0 in nums and 4.21 in nums


def test_guard_blocks_recommendation_words() -> None:
    out = sanitize_ai_output("Khuyến nghị MUA mạnh cổ phiếu này.", allowed_numbers=set())
    assert out["ok"] is False
    assert any("khuyến nghị" in v.lower() or "mua" in v.lower() for v in out["violations"])


def test_guard_flags_fabricated_number() -> None:
    # 99.9 không có trong allowed -> vi phạm bịa số.
    out = sanitize_ai_output("ROE đạt 99.9% theo ước tính.", allowed_numbers={0.241})
    assert out["ok"] is False
    assert any("99.9" in v for v in out["violations"])


def test_guard_passes_clean_text() -> None:
    out = sanitize_ai_output("Biên gộp 24.1% cải thiện so với năm trước.", allowed_numbers={24.1})
    assert out["ok"] is True
    assert out["violations"] == []
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3 — implement** `app/services/bctc/ai_guard.py`:
```python
from __future__ import annotations

import re
from typing import Any

# Từ khuyến nghị giao dịch bị cấm (case-insensitive, biên từ).
_BANNED = [
    r"khuy[ếe]n ngh[ịi]", r"\bmua\b", r"\bb[áa]n\b", r"\bgi[ữu] (?:m[ãa]|c[ổo])",
    r"\bbuy\b", r"\bsell\b", r"\bhold\b", r"target price", r"gi[áa] m[ụu]c ti[êe]u",
]
_BANNED_RE = re.compile("|".join(_BANNED), re.IGNORECASE)
# Tách số (cho phép %, dấu phẩy nghìn, thập phân).
_NUM_RE = re.compile(r"-?\d[\d,]*\.?\d*")


def extract_allowed_numbers(kpi_payload: dict[str, Any] | None) -> set[float]:
    """Gom mọi số đã pre-compute trong payload (snapshot/modules/trinity) để đối chiếu."""
    out: set[float] = set()
    if not kpi_payload:
        return out

    def add(v: Any) -> None:
        if isinstance(v, bool):
            return
        if isinstance(v, (int, float)):
            out.add(round(float(v), 4))
            # cũng cho phép dạng phần trăm (×100) vì AI thường viết %.
            out.add(round(float(v) * 100, 2))

    def walk(o: Any) -> None:
        if isinstance(o, dict):
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
        else:
            add(o)

    walk(kpi_payload)
    return out


def _close(n: float, allowed: set[float], tol: float = 0.15) -> bool:
    return any(abs(n - a) <= tol or (a != 0 and abs(n - a) / abs(a) <= 0.02) for a in allowed)


def sanitize_ai_output(text: str, allowed_numbers: set[float]) -> dict[str, Any]:
    """Post-flight guard: chặn khuyến nghị giao dịch + số bịa. Trả {ok, violations}."""
    violations: list[str] = []
    if not text or not text.strip():
        return {"ok": False, "violations": ["empty"]}
    if _BANNED_RE.search(text):
        m = _BANNED_RE.search(text)
        violations.append(f"banned_phrase: {m.group(0)!r}")
    for tok in _NUM_RE.findall(text):
        raw = tok.replace(",", "")
        try:
            n = float(raw)
        except ValueError:
            continue
        if not _close(n, allowed_numbers) and not _close(n / 100, allowed_numbers):
            violations.append(f"fabricated_number: {tok}")
    return {"ok": not violations, "violations": violations}
```
NOTE: `_close` tolerance is intentionally loose (AI rounds). The guard is a safety net; the service decides whether to drop or annotate violating text.

- [ ] **Step 4** — run → PASS (4 passed). `mypy`/`ruff` clean.
- [ ] **Step 5** — commit: `git add app/services/bctc/ai_guard.py tests/test_bctc_ai_guard.py && git commit -m "feat(bctc): AI determinism guard (banned recommendations + fabricated numbers)"`

---

### Task 2.5: AI payload builder (payloads.py)
**Files:** Modify `app/services/ai/payloads.py`; Test `tests/test_bctc_ai_payload.py`.

- [ ] **Step 1 — test** `tests/test_bctc_ai_payload.py`:
```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.ai.payloads import build_bctc_ai_payload


async def test_build_bctc_ai_payload_reuses_engine() -> None:
    kpi = {"template": "A", "sector": "nonbank", "snapshot": [], "modules": [],
           "forensic": {"green": [], "red": []}, "trinity": {}, "flags": []}
    with patch("app.services.ai.payloads.get_bctc", new_callable=AsyncMock,
               return_value=(kpi, "https://vci/...")):
        payload = await build_bctc_ai_payload(symbol="fpt", term_type=1)
    assert payload["symbol"] == "FPT"
    assert payload["bctc"]["template"] == "A"
    assert "as_of" in payload
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3 — implement** in `payloads.py`: add `from app.services.bctc.service import get_bctc` (top import) and:
```python
async def build_bctc_ai_payload(*, symbol: str, term_type: int = 1, language: str = "vi") -> dict[str, Any]:
    """Payload cho AI: CHỈ KPI đã pre-compute (không gửi statement thô)."""
    sym = symbol.upper()
    cache_key = f"iqx:ai:payload:bctc:{sym}:{term_type}:{language}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return cached
    kpi_payload, _url = await get_bctc(sym, term_type=term_type)
    payload: dict[str, Any] = {
        "as_of": datetime.now(UTC).isoformat(),
        "symbol": sym,
        "term_type": term_type,
        "language": language,
        "bctc": kpi_payload,
    }
    await _cache_set(cache_key, payload, 600)
    return payload
```
(Confirm `datetime`, `UTC`, `Any`, `_cache_get`, `_cache_set` already imported in payloads.py — they are, used by other builders.)

- [ ] **Step 4** — run → PASS. `mypy app/services/ai/payloads.py` (note: ai module may have laxer mypy; keep new fn annotated).
- [ ] **Step 5** — commit: `git add app/services/ai/payloads.py tests/test_bctc_ai_payload.py && git commit -m "feat(bctc): build_bctc_ai_payload (precomputed KPIs only, reuses engine)"`

---

### Task 2.6: Prompt + analyze_bctc service (with guard)
**Files:** Create `backend/docs/ai/ai-bctc.md`; Modify `prompt_loader.py`, `analysis_service.py`; Test `tests/test_bctc_ai_service.py`.

- [ ] **Step 1 — create prompt** `backend/docs/ai/ai-bctc.md` (Vietnamese, >100 chars). Content requirements: role = chuyên gia phân tích BCTC; INPUT = JSON các KPI đã tính; OUTPUT = **JSON** `{"memo": "<markdown 200-250 từ>", "modules": {"<moduleId>": "<markdown 60-150 từ>"}}`; RULES: chỉ bình luận trên số trong payload, KHÔNG bịa số, KHÔNG khuyến nghị Mua/Bán/Giữ, KHÔNG từ mơ hồ; tiếng Việt. List the module ids it may annotate: common_size, wcc, cf_bridge, dupont. (Write the full prompt text.)

- [ ] **Step 2** — register: in `prompt_loader.py` add `"bctc": "ai-bctc.md"` to `PROMPT_FILES`.

- [ ] **Step 3 — test** `tests/test_bctc_ai_service.py`:
```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.ai.analysis_service import analyze_bctc


async def test_analyze_bctc_parses_and_guards() -> None:
    payload = {"symbol": "FPT", "term_type": 1, "language": "vi",
               "bctc": {"snapshot": [{"value": 0.241}], "modules": [], "trinity": {}}}
    ai_json = '```json\n{"memo":"Biên gộp 24.1% ổn định.","modules":{"dupont":"ROE 24.1% bền vững."}}\n```'
    with patch("app.services.ai.analysis_service.build_bctc_ai_payload", new_callable=AsyncMock, return_value=payload), \
         patch("app.services.ai.analysis_service.load_prompt", return_value="SYS"), \
         patch("app.services.ai.analysis_service.chat_completion", new_callable=AsyncMock, return_value=("body", "test-model")) as cc:
        # chat_completion returns the fenced json
        cc.return_value = (ai_json, "test-model")
        result = await analyze_bctc(symbol="FPT", term_type=1)
    assert result["type"] == "bctc"
    assert result["analysis"]["memo"].startswith("Biên gộp")
    assert "dupont" in result["analysis"]["modules"]
    assert result["model"] == "test-model"
```

- [ ] **Step 4** — run → FAIL, then **implement** `analyze_bctc` in `analysis_service.py`:
  - imports: `from app.services.ai.payloads import build_bctc_ai_payload, payload_to_json`; `from app.services.bctc.ai_guard import sanitize_ai_output, extract_allowed_numbers`; (`load_prompt`, `chat_completion`, cache helpers, `json`, `re`, `datetime/UTC` already present).
```python
async def analyze_bctc(*, symbol: str, term_type: int = 1, language: str = "vi",
                       include_payload: bool = False) -> dict[str, Any]:
    sym = symbol.upper()
    cache_key = _analysis_cache_key("bctc", f"{sym}:{term_type}", language)
    cached = await _cache_get_analysis(cache_key)
    if cached and "analysis" in cached:
        return cached
    prompt = load_prompt("bctc")
    payload = await build_bctc_ai_payload(symbol=sym, term_type=term_type, language=language)
    text, model_used = await chat_completion(system_prompt=prompt, user_content=payload_to_json(payload))
    parsed = _parse_bctc_ai(text)  # {"memo": str, "modules": {id: str}}
    allowed = extract_allowed_numbers(payload.get("bctc"))
    # Guard: drop any field that violates determinism.
    memo_check = sanitize_ai_output(parsed.get("memo", ""), allowed)
    memo = parsed.get("memo", "") if memo_check["ok"] else ""
    notes: dict[str, str] = {}
    for mid, note in (parsed.get("modules") or {}).items():
        if sanitize_ai_output(note, allowed)["ok"]:
            notes[mid] = note
    result = {"type": "bctc", "input": {"symbol": sym, "term_type": term_type, "language": language},
              "analysis": {"memo": memo, "modules": notes}, "model": model_used,
              "as_of": datetime.now(UTC).isoformat()}
    await _cache_set_analysis(cache_key, result, analysis_type="bctc")
    if include_payload:
        result["payload"] = payload
    return result


def _parse_bctc_ai(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        obj = json.loads(cleaned)
        if isinstance(obj, dict):
            return {"memo": str(obj.get("memo", "")), "modules": obj.get("modules") or {}}
    except (json.JSONDecodeError, ValueError):
        pass
    return {"memo": text.strip(), "modules": {}}  # fallback: treat whole text as memo
```

- [ ] **Step 5** — run → PASS. `mypy`/`ruff` clean. Commit: `git add backend/docs/ai/ai-bctc.md app/services/ai/prompt_loader.py app/services/ai/analysis_service.py tests/test_bctc_ai_service.py && git commit -m "feat(bctc): ai-bctc prompt + analyze_bctc service (parse JSON + determinism guard)"`

---

### Task 2.7: Premium endpoint GET /ai/bctc/{symbol}
**Files:** Modify `app/api/v1/endpoints/ai_analysis.py`; Test `tests/test_bctc_ai_endpoint.py`.

- [ ] **Step 1 — test** `tests/test_bctc_ai_endpoint.py`:
```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.ai.proxy_client import AIProxyError


async def test_ai_bctc_success(client, premium_user) -> None:
    _user, headers = premium_user
    result = {"type": "bctc", "input": {"symbol": "FPT"},
              "analysis": {"memo": "memo", "modules": {"dupont": "note"}},
              "model": "test-model", "as_of": "2026-06-03T00:00:00+00:00"}
    with patch("app.api.v1.endpoints.ai_analysis.analyze_bctc", new_callable=AsyncMock, return_value=result):
        resp = await client.get("/api/v1/ai/bctc/FPT", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["analysis"]["memo"] == "memo"


async def test_ai_bctc_requires_auth(client) -> None:
    resp = await client.get("/api/v1/ai/bctc/FPT")
    assert resp.status_code == 401


async def test_ai_bctc_proxy_error_502(client, premium_user) -> None:
    _user, headers = premium_user
    with patch("app.api.v1.endpoints.ai_analysis.analyze_bctc", new_callable=AsyncMock,
               side_effect=AIProxyError("timeout")):
        resp = await client.get("/api/v1/ai/bctc/FPT", headers=headers)
    assert resp.status_code == 502
```

- [ ] **Step 2** — run → FAIL.
- [ ] **Step 3 — implement** in `ai_analysis.py`: add `analyze_bctc` to the existing `from app.services.ai.analysis_service import (...)` import, then add:
```python
@router.get("/bctc/{symbol}")
async def get_bctc_analyze(symbol: str, user: PremiumUser, term_type: int = 1,
                           language: str = "vi") -> dict[str, Any]:
    """AI Memo + ghi chú từng module cho BCTC (premium)."""
    try:
        result = await analyze_bctc(symbol=symbol.upper(), term_type=term_type, language=language)
        return {"data": result}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
```
(`PremiumUser`, `AIProxyError`, `HTTPException`, `Any` already imported in ai_analysis.py — verify.)

- [ ] **Step 4** — run → PASS (3 passed). Full AI + bctc suites no regression: `uv run --frozen pytest tests/test_ai_analysis.py tests/test_bctc_*.py -q`. `mypy`/`ruff` clean.
- [ ] **Step 5** — commit: `git add app/api/v1/endpoints/ai_analysis.py tests/test_bctc_ai_endpoint.py && git commit -m "feat(bctc): premium endpoint GET /ai/bctc/{symbol}"`

---

### Task 2.8: Frontend AI helpers + components
**Files:** Create `dashboard/src/components/stock/bctc-ai.ts`, `bctc-ai-memo.tsx`, `dashboard/tests/bctc-ai.spec.ts`.

- [ ] **Step 1 — pure helper test** `dashboard/tests/bctc-ai.spec.ts`:
```ts
import { describe, it, expect } from "vitest"
import { moduleNote, hasAnyAi } from "../src/components/stock/bctc-ai"

describe("bctc-ai", () => {
  it("moduleNote returns note for id or empty", () => {
    const ai = { memo: "m", modules: { dupont: "x" } }
    expect(moduleNote(ai, "dupont")).toBe("x")
    expect(moduleNote(ai, "wcc")).toBe("")
    expect(moduleNote(null, "dupont")).toBe("")
  })
  it("hasAnyAi", () => {
    expect(hasAnyAi({ memo: "m", modules: {} })).toBe(true)
    expect(hasAnyAi({ memo: "", modules: {} })).toBe(false)
    expect(hasAnyAi(null)).toBe(false)
  })
})
```

- [ ] **Step 2** — run `npx vitest run tests/bctc-ai.spec.ts` → FAIL.
- [ ] **Step 3 — implement** `src/components/stock/bctc-ai.ts`:
```ts
export type BctcAi = { memo: string; modules: Record<string, string> }

export function moduleNote(ai: BctcAi | null | undefined, id: string): string {
  return ai?.modules?.[id] ?? ""
}

export function hasAnyAi(ai: BctcAi | null | undefined): boolean {
  if (!ai) return false
  return Boolean(ai.memo?.trim()) || Object.values(ai.modules ?? {}).some((n) => n?.trim())
}
```
And `src/components/stock/bctc-ai-memo.tsx` — a component fetching the premium endpoint via the `api` ky client and rendering markdown (mirror `src/features/lessons/text-viewer.tsx` for markdown; mirror `bctc-analysis.tsx` for loading/error state):
```tsx
import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Loader2, AlertTriangle, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { usePremiumStatus } from "@/hooks/use-premium-status"
import { hasAnyAi, type BctcAi } from "./bctc-ai"

const MD_CLS = "[&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-2 [&_strong]:text-foreground [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-sm [&_table]:w-full [&_th]:text-left [&_th]:text-xs [&_td]:text-sm text-muted-foreground"

type AiResp = { data?: { analysis?: BctcAi } } | { analysis?: BctcAi }

export function useBctcAi(symbol: string) {
  const { isPremium } = usePremiumStatus()
  const [ai, setAi] = useState<BctcAi | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!isPremium) return
    let alive = true
    setIsLoading(true); setError("")
    api.get(`ai/bctc/${symbol.toUpperCase()}`, { searchParams: { term_type: 1 } })
      .json<AiResp>()
      .then((res) => { if (!alive) return; const a = (res as any)?.data?.analysis ?? (res as any)?.analysis; setAi(a ?? null) })
      .catch(() => alive && setError("Không tải được nhận định AI"))
      .finally(() => alive && setIsLoading(false))
    return () => { alive = false }
  }, [symbol, isPremium])
  return { ai, isLoading, error }
}

export function BctcAiMemo({ ai, isLoading, error }: { ai: BctcAi | null; isLoading: boolean; error: string }) {
  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground text-xs"><Loader2 className="size-4 animate-spin" /> Đang tạo nhận định AI…</div>
  if (error) return <div className="flex items-center gap-2 text-muted-foreground text-xs"><AlertTriangle className="size-4" /> {error}</div>
  if (!hasAnyAi(ai) || !ai?.memo?.trim()) return <div className="text-xs text-muted-foreground">Chưa có nhận định AI.</div>
  return (
    <div className="bg-card border border-border border-l-2 border-l-primary rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-primary mb-2"><Sparkles className="size-3" /> AI Memo</div>
      <article className={MD_CLS}><ReactMarkdown remarkPlugins={[remarkGfm]}>{ai.memo}</ReactMarkdown></article>
    </div>
  )
}

export function BctcModuleNote({ note }: { note: string }) {
  if (!note?.trim()) return null
  return (
    <div className="mt-2 bg-primary/5 border-l-2 border-primary/40 rounded p-2 text-xs text-muted-foreground [&_p]:mb-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{note}</ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 4** — `npx vitest run tests/bctc-ai.spec.ts` → PASS; `npm run build` clean.
- [ ] **Step 5** — commit: `git add dashboard/src/components/stock/bctc-ai.ts dashboard/src/components/stock/bctc-ai-memo.tsx dashboard/tests/bctc-ai.spec.ts && git commit -m "feat(bctc): frontend AI memo/note components + helpers (premium, markdown)"`

---

### Task 2.9: Wire AI + DuPont + Trinity into bctc-analysis.tsx
**Files:** Modify `dashboard/src/components/stock/bctc-analysis.tsx`.

- [ ] **Step 1 — implement** (read the file first):
  - Extend `BctcPayload` type: add `trinity?: Record<string, unknown>` (and DuPont arrives as a normal module in `modules`).
  - Imports: `import { PremiumGate } from "@/components/premium/premium-gate"`; `import { useBctcAi, BctcAiMemo, BctcModuleNote } from "./bctc-ai-memo"`; `import { moduleNote } from "./bctc-ai"`.
  - Call `const { ai, isLoading: aiLoading, error: aiError } = useBctcAi(symbol)` in `BctcAnalysis`.
  - **Layer ② AI Memo** — insert between Snapshot (①) and Modules (③), gated:
```tsx
<section>
  <h3 className="font-serif text-base font-bold mb-3">② AI Memo tổng</h3>
  <div className="relative min-h-[160px]">
    <PremiumGate featureName="Nhận định AI BCTC" description="AI Memo và ghi chú từng module phân tích báo cáo tài chính.">
      <BctcAiMemo ai={ai} isLoading={aiLoading} error={aiError} />
    </PremiumGate>
  </div>
</section>
```
  - **Per-module AI note** — inside the modules map, after each module's data grid, add (gated, only renders when a note exists): wrap `<BctcModuleNote note={moduleNote(ai, mod.id)} />` in a small `PremiumGate` with `min-h-[60px]` ONLY if you want non-premium to see a locked teaser; simpler: render the note (it's empty for non-premium since the fetch is skipped) — but to truly gate, wrap: 
```tsx
{moduleNote(ai, mod.id) && (
  <div className="relative min-h-[60px]"><PremiumGate featureName="Nhận định AI" description="Ghi chú AI cho từng module.">
    <BctcModuleNote note={moduleNote(ai, mod.id)} />
  </PremiumGate></div>
)}
```
  (Since non-premium never fetches `ai`, `moduleNote` is "" → nothing renders for them, which is acceptable; the ② Memo PremiumGate is the visible upsell.)
  - **Forensic Trinity card** (④ area, from `data.trinity`, premium-gated): render a small 3-cell card (Altman Z, Piotroski F `score`/9, Beneish M) wrapped in `PremiumGate`. Use `data.trinity.piotroski_f.score`, `data.trinity.altman_z`, `data.trinity.beneish_m`. Format with the Phase-1 `fmtNumber`.

- [ ] **Step 2** — `npm run build` clean (no TS errors). Manual: premium user sees AI Memo + notes + Trinity; free user sees locked overlay on those, Phase-1 content visible.
- [ ] **Step 3** — commit: `git add dashboard/src/components/stock/bctc-analysis.tsx && git commit -m "feat(bctc): mount AI Memo + module notes + Forensic Trinity (premium-gated) in analysis view"`

---

## Nghiệm thu Phase 2
- [ ] `uv run --frozen pytest tests/test_bctc_*.py tests/test_ai_analysis.py -q` — all pass; `mypy app/services/bctc app/services/ai/payloads.py app/services/ai/analysis_service.py` + `ruff` clean.
- [ ] `npx vitest run` (bctc-format + bctc-ai pass; pre-existing unrelated failures ignored); `npm run build` clean.
- [ ] **Live AI smoke (1-2 calls, costs tokens):** with a real premium token, `GET /api/v1/ai/bctc/FPT` returns `{data:{analysis:{memo, modules}}}`; verify memo is Vietnamese, references only payload numbers, no Mua/Bán/Giữ. Check `analyze_bctc` guard drops violations.
- [ ] Manual UI: premium account → stock page → Tài chính → Phân tích shows ② AI Memo + per-module notes + DuPont module + Forensic Trinity; non-premium sees locked overlay on AI/Trinity, free Phase-1 layers visible.

## Ngoài phạm vi (Phase 3-4)
- Bank-specific AI tuning + Bank DuPont + bank blind-spots box; NIM/earning-assets derivation.
- Sonnet/Haiku tiering (IQX dùng 1 model — không áp dụng).
- Polished viz (DuPont chain SVG, trinity gauges, sparklines) — Phase 2 dùng renderer số.
- Valuation (Football Field / Justified P/B) — Phase 4.
- Per-module AI notes for bank modules.

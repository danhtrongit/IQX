# Kế hoạch triển khai — Dashboard Phân tích BCTC (Phase 0 + Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng engine tính KPI BCTC ở backend (Python) + tích hợp sub-view "Phân tích" vào tab Tài chính, cho **MVP không-AI** chạy được cả Template A (phi-ngân hàng) lẫn Template B (ngân hàng): Snapshot 6 KPI + 3 module/template + Forensic Panel rule-based.

**Architecture:** Engine là **các hàm thuần** trong `backend/app/services/bctc/` nhận "concept dict" (đã ánh xạ từ FieldCode VCI) → trả KPI deterministic; được kiểm thử bằng fixture concept-keyed (đối chiếu công thức, KHÔNG khớp số mock của prototype). Một service mỏng gọi VCI (qua `vietcap`) → ánh xạ FieldCode → tính → trả JSON; endpoint công khai có cache. Frontend render JSON; chỉ **hàm format thuần** (`bctc-format.ts`) được unit-test bằng vitest (repo không có jsdom/RTL).

**Tech Stack:** Backend Python 3.12 / FastAPI / pytest (asyncio_mode=auto) / uv / Redis cache decorator. Frontend React 19 / Vite / TS / Tailwind v4 (OKLCH) / shadcn / recharts / vitest.

**Phạm vi:** Phase 0 (spike ánh xạ FieldCode + harness) và Phase 1 (MVP không-AI). Phase 2 (AI), Phase 3 (module sâu còn lại + DuPont/Forensic Trinity), Phase 4 (định giá + sub-sector) sẽ có plan riêng, phụ thuộc kết quả Phase 0.

**Spec nguồn:** [docs/specs/2026-06-03-bctc-analysis-dashboard-design.md](../specs/2026-06-03-bctc-analysis-dashboard-design.md). Công thức chi tiết (mã TT200/TT22 + ngưỡng) nằm trong spec mục 4–6 và trong guide gốc (copy vào repo ở Task 0.1).

---

## Cấu trúc file

**Backend — tạo mới (`backend/app/services/bctc/`):**
- `__init__.py` — package marker.
- `mapping/nonbank.yaml`, `mapping/bank.yaml` — `concept → FieldCode` VCI (điền dần từ Phase 0).
- `mapping_loader.py` — đọc YAML, `load_mapping(template)`.
- `statements.py` — `Period` dataclass + `build_periods(bs, is_, cf, mapping)` ghép 3 báo cáo theo kỳ thành concept dict.
- `sector.py` — `detect_template(is_rows)` (A/B theo isb*).
- `thresholds.py` — config ngưỡng + `classify(metric, value)`.
- `kpi_nonbank.py` — Snapshot A (6 KPI).
- `kpi_nonbank_modules.py` — Common-Size, Working Capital Cycle, Cash Flow Bridge.
- `kpi_bank.py` — Snapshot B (6 KPI).
- `kpi_bank_modules.py` — TOI Mix, NIM Decomp, PPOP/CoR.
- `forensic.py` — Forensic Panel rule-based (A & B).
- `validation.py` — identity + sanity flags.
- `assemble.py` — `build_bctc_payload(bs, is_, cf)` → response dict.
- `service.py` — `async get_bctc(symbol)`.
- `scripts/discover_fieldcodes.py` — script discovery Phase 0 (chạy live).

**Backend — sửa:**
- `backend/app/services/market_data/sources/vietcap.py` — thêm `fetch_bctc_statements`.
- `backend/app/api/v1/endpoints/market_data.py` — thêm endpoint `GET /market-data/bctc/{symbol}`.
- `backend/pyproject.toml` — thêm dep `pyyaml` nếu chưa có.

**Backend — test (`backend/tests/`):** `test_bctc_mapping.py`, `test_bctc_statements.py`, `test_bctc_sector.py`, `test_bctc_thresholds.py`, `test_bctc_kpi_nonbank.py`, `test_bctc_kpi_nonbank_modules.py`, `test_bctc_kpi_bank.py`, `test_bctc_kpi_bank_modules.py`, `test_bctc_forensic.py`, `test_bctc_validation.py`, `test_bctc_assemble.py`, `test_bctc_endpoint.py`.

**Frontend — tạo mới:**
- `dashboard/src/components/stock/bctc-format.ts` — hàm format thuần (testable).
- `dashboard/src/components/stock/bctc-analysis.tsx` — component sub-view "Phân tích" (Phase 1 gom Snapshot + module + Forensic trong 1 file; tách ra `bctc/` subfolder khi thêm sparkline/recharts ở Phase 2+).
- `dashboard/tests/bctc-format.spec.ts` — vitest.

**Frontend — sửa:**
- `dashboard/src/components/stock/stock-financials.tsx` — thêm toggle nhóm "Phân tích"/"Số liệu thô".
- `dashboard/src/index.css` — thêm token `--font-serif` (editorial-in-dark).
- `dashboard/package.json` — thêm script `"test": "vitest run"` + devDep `vitest`.

**Tài liệu:**
- `dashboard/docs/specs/bctc-guide/` — copy guide + 2 prototype (Task 0.1).
- `dashboard/docs/specs/bctc-guide/fieldcode-map.md` — kết quả discovery (Task 0.2) + feasibility (Task 0.5).

---

## Quy ước chung

- **Đơn vị:** mọi Value từ VCI là VND thô. Engine trả tỷ lệ ở dạng **phân số thập phân** (vd ROE 24.1% → `0.241`); frontend nhân 100 khi hiển thị. Giá trị tiền giữ VND thô.
- **Trung bình số dư (Avg):** với mọi KPI dùng "TB" (ROE, Asset Turnover, DSO/DIO/DPO, NIM...) dùng `(đầu kỳ + cuối kỳ)/2`; nếu thiếu kỳ trước thì dùng số cuối kỳ và gắn flag.
- **Thiếu dữ liệu:** hàm KPI trả `None` khi thiếu input hoặc mẫu số = 0; KHÔNG ném lỗi. Frontend hiện "N/A".
- **Lệnh test backend (chạy trong `backend/`):** `uv run pytest tests/<file>::<test> -q`. Nếu không có `uv`: `python -m pytest tests/<file>::<test> -q`.
- **Lệnh test frontend (chạy trong `dashboard/`):** `npx vitest run tests/<file>`.
- **Commit:** mỗi task kết thúc bằng một commit. Đang ở nhánh `main` (theo workflow người dùng).

---

## PHASE 0 — Spike & de-risk

### Task 0.1: Scaffold package + copy tài liệu nguồn

**Files:**
- Create: `backend/app/services/bctc/__init__.py`
- Create: `backend/app/services/bctc/mapping/` (thư mục)
- Create: `dashboard/docs/specs/bctc-guide/` (copy guide + prototypes)

- [ ] **Step 1: Tạo package + copy tài liệu**

```bash
cd /Users/danhtrongit/Projects/IQX
mkdir -p backend/app/services/bctc/mapping backend/app/services/bctc/scripts
touch backend/app/services/bctc/__init__.py backend/app/services/bctc/scripts/__init__.py
mkdir -p dashboard/docs/specs/bctc-guide
cp ~/Downloads/BCTC/"dashboard_bctc_fpt (1).html" dashboard/docs/specs/bctc-guide/prototype-template-a-fpt.html
cp ~/Downloads/BCTC/dashboard_bctc_vcb.html dashboard/docs/specs/bctc-guide/prototype-template-b-vcb.html
textutil -convert txt ~/Downloads/BCTC/huong_dan_dashboard_bctc_2_template.docx -output dashboard/docs/specs/bctc-guide/guide.txt
```

- [ ] **Step 2: Xác nhận `pyyaml` có trong deps**

Run: `cd backend && grep -i pyyaml pyproject.toml || echo "MISSING"`
Nếu in "MISSING": thêm `"pyyaml>=6.0",` vào mảng `dependencies` trong `backend/pyproject.toml` rồi `uv sync` (hoặc `pip install pyyaml`).

- [ ] **Step 3: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add backend/app/services/bctc dashboard/docs/specs/bctc-guide backend/pyproject.toml
git commit -m "chore(bctc): scaffold service package + copy reference guide/prototypes"
```

---

### Task 0.2: Script discovery FieldCode (chạy live)

**Mục đích:** Guide viết công thức theo mã TT200/TT22; VCI dùng FieldCode riêng (isa/bsa/cfa/isb). Chỉ vài mã được xác nhận trong source (isa1=Doanh thu thuần, bsa1=Tổng tài sản, isa22=LNST, isa23=EPS, isb38=TOI...). Script này dump `FieldCode → titleVi` cho một rổ mã để con người ánh xạ concept.

**Files:**
- Create: `backend/app/services/bctc/scripts/discover_fieldcodes.py`
- Create: `dashboard/docs/specs/bctc-guide/fieldcode-map.md`

- [ ] **Step 1: Viết script**

```python
# backend/app/services/bctc/scripts/discover_fieldcodes.py
"""Dump FieldCode -> titleVi cho một rổ mã, gom theo section, để ánh xạ concept thủ công.

Chạy LIVE (gọi VCI thật):
    cd backend && uv run python -m app.services.bctc.scripts.discover_fieldcodes FPT VCB HPG VNM MWG
"""
from __future__ import annotations

import asyncio
import sys
from collections import defaultdict
from typing import Any

from app.services.market_data.sources import vietcap


async def _metrics(symbol: str) -> dict[str, Any]:
    # _fetch_financial_metrics trả {BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW, NOTE}
    return await vietcap._fetch_financial_metrics(symbol.upper())  # noqa: SLF001


async def main(symbols: list[str]) -> None:
    seen: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for sym in symbols:
        try:
            metrics = await _metrics(sym)
        except Exception as exc:  # noqa: BLE001
            print(f"# {sym}: LỖI {exc}", file=sys.stderr)
            continue
        for section, rows in metrics.items():
            for row in rows or []:
                field = str(row.get("field") or "").lower()
                title = str(row.get("titleVi") or row.get("fullTitleVi") or "")
                if field:
                    seen[section][field].add(title)
    for section in sorted(seen):
        print(f"\n## {section}")
        for field in sorted(seen[section], key=lambda f: (f[:3], len(f), f)):
            titles = " | ".join(sorted(t for t in seen[section][field] if t))
            print(f"- `{field}` = {titles}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or ["FPT", "VCB", "HPG", "VNM", "MWG"]))
```

- [ ] **Step 2: Chạy script (live) và lưu kết quả**

Run: `cd backend && uv run python -m app.services.bctc.scripts.discover_fieldcodes FPT HPG VNM MWG GAS VCB TCB MBB ACB > ../dashboard/docs/specs/bctc-guide/fieldcode-dump.md`
Expected: file `fieldcode-dump.md` liệt kê FieldCode + titleVi theo section. (Nếu môi trường chặn mạng VCI, chạy ở môi trường có mạng; đây là bước discovery, không phải test CI.)

- [ ] **Step 3: Ánh xạ concept (thủ công) → ghi `fieldcode-map.md`**

Mở `fieldcode-dump.md`, đối chiếu titleVi với danh sách concept ở Task 0.3, ghi bảng `concept → FieldCode (non-bank | bank)` vào `dashboard/docs/specs/bctc-guide/fieldcode-map.md`. Đánh dấu concept nào KHÔNG tìm thấy field (→ KPI phụ thuộc sẽ trả N/A).

- [ ] **Step 4: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add backend/app/services/bctc/scripts/discover_fieldcodes.py dashboard/docs/specs/bctc-guide/fieldcode-dump.md dashboard/docs/specs/bctc-guide/fieldcode-map.md
git commit -m "feat(bctc): FieldCode discovery script + concept mapping reference"
```

---

### Task 0.3: Mapping files + loader

**Files:**
- Create: `backend/app/services/bctc/mapping/nonbank.yaml`
- Create: `backend/app/services/bctc/mapping/bank.yaml`
- Create: `backend/app/services/bctc/mapping_loader.py`
- Test: `backend/tests/test_bctc_mapping.py`

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_mapping.py
from __future__ import annotations

from app.services.bctc.mapping_loader import load_mapping


def test_load_nonbank_mapping_has_confirmed_concepts() -> None:
    m = load_mapping("nonbank")
    # Các FieldCode đã xác nhận chắc chắn từ source VCI.
    assert m["net_revenue"] == "isa1"
    assert m["total_assets"] == "bsa1"
    assert m["npat"] == "isa22"


def test_load_bank_mapping_has_toi() -> None:
    m = load_mapping("bank")
    assert m["total_operating_income"] == "isb38"


def test_unknown_template_raises() -> None:
    try:
        load_mapping("xxx")
        assert False, "phải raise"
    except ValueError:
        pass
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cd backend && uv run pytest tests/test_bctc_mapping.py -q`
Expected: FAIL (ModuleNotFoundError `mapping_loader`).

- [ ] **Step 3: Viết mapping YAML + loader**

```yaml
# backend/app/services/bctc/mapping/nonbank.yaml
# concept -> VCI FieldCode. Các code CONFIRMED từ source; còn lại điền từ Task 0.2.
# Nếu một concept chưa biết field, để trống (null) -> KPI phụ thuộc sẽ trả N/A.
net_revenue: isa1          # Doanh thu thuần (mã 10)
cogs: null                 # Giá vốn hàng bán (mã 11)  — điền từ discovery
gross_profit: null         # Lợi nhuận gộp (mã 20)
selling_expense: null      # Chi phí bán hàng (mã 25)
admin_expense: null        # Chi phí quản lý DN (mã 26)
operating_profit: null     # LN thuần HĐKD / EBIT proxy (mã 30)
profit_before_tax: null    # LNTT (mã 50)
npat: isa22                # LNST (mã 60)
npat_parent: null          # LNST cổ đông công ty mẹ
interest_expense: null     # Chi phí lãi vay (mã 23)
total_assets: bsa1         # Tổng tài sản (mã 270)
current_assets: null       # TS ngắn hạn (mã 100)
current_liabilities: null  # Nợ ngắn hạn (mã 310)
total_liabilities: null    # Tổng nợ phải trả (mã 300)
equity: null               # Vốn chủ sở hữu (mã 400)
equity_parent: null        # VCSH cổ đông công ty mẹ (mã 410)
minority_interest: null    # Lợi ích cổ đông thiểu số (mã 429)
retained_earnings: null    # LN sau thuế chưa phân phối (mã 421)
cash: null                 # Tiền & tương đương (mã 110)
st_investments: null       # Đầu tư TC ngắn hạn (mã 120)
st_debt: null              # Vay & nợ thuê TC ngắn hạn (mã 320)
lt_debt: null              # Vay & nợ thuê TC dài hạn (mã 338)
trade_receivables: null    # Phải thu KH ngắn hạn (mã 131)
inventory_gross: null      # Hàng tồn kho (mã 141)
inventory_provision: null  # Dự phòng giảm giá HTK (mã 149, âm)
trade_payables: null       # Phải trả người bán (mã 312 / theo schema)
net_fixed_assets: null     # TSCĐ ròng (mã 220)
depreciation: null         # Khấu hao (LCTT mã 02)
provisions_cf: null        # Dự phòng (LCTT mã 03)
cfo: null                  # Lưu chuyển tiền thuần từ HĐKD (LCTT mã 20)
capex: null                # Tiền chi mua sắm TSCĐ (LCTT mã 21, âm)
```

```yaml
# backend/app/services/bctc/mapping/bank.yaml
# Template B (TT22) — concept -> FieldCode (isb*/bs-bank). Điền từ discovery (Task 0.2).
total_operating_income: isb38   # Tổng thu nhập hoạt động (TOI) — cũng là cờ ngân hàng
net_interest_income: isb27      # Thu nhập lãi thuần (revenue fallback)
npat: isb43                     # LNST ngân hàng (fallback isa22)
interest_income_gross: null     # Thu nhập lãi (gross)
interest_expense: null          # Chi phí lãi
net_fee_income: null            # Lãi thuần từ dịch vụ
operating_expense: null         # Chi phí hoạt động (OPEX)
provision_expense: null         # Chi phí dự phòng rủi ro tín dụng (KQKD)
customer_loans: null            # Cho vay khách hàng (gross)
loan_loss_reserve: null         # Dự phòng rủi ro cho vay (âm)
customer_deposits: null         # Tiền gửi của khách hàng
earning_assets: null            # Tài sản sinh lãi (hoặc tính = tổng các khoản sinh lãi)
interest_bearing_liabilities: null  # Nợ chịu lãi
total_assets: null              # Tổng tài sản (bank BS code)
equity: null                    # Vốn chủ sở hữu
```

```python
# backend/app/services/bctc/mapping_loader.py
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

_DIR = Path(__file__).parent / "mapping"
_FILES = {"nonbank": "nonbank.yaml", "bank": "bank.yaml"}


@lru_cache(maxsize=4)
def load_mapping(template: str) -> dict[str, str | None]:
    """Trả dict concept -> FieldCode (hoặc None nếu chưa ánh xạ)."""
    if template not in _FILES:
        raise ValueError(f"Template không hợp lệ: {template!r} (cần 'nonbank'|'bank')")
    path = _DIR / _FILES[template]
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {str(k): (str(v).lower() if v else None) for k, v in data.items()}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd backend && uv run pytest tests/test_bctc_mapping.py -q`
Expected: PASS (3 passed). *(Nếu Task 0.2 đã điền field cho `cogs`/`gross_profit`... cập nhật YAML tương ứng; test trên chỉ khẳng định các code đã CONFIRMED.)*

- [ ] **Step 5: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add backend/app/services/bctc/mapping backend/app/services/bctc/mapping_loader.py backend/tests/test_bctc_mapping.py
git commit -m "feat(bctc): mapping files (nonbank/bank) + loader"
```

---

### Task 0.4: Period builder (ghép 3 báo cáo → concept dict)

**Files:**
- Create: `backend/app/services/bctc/statements.py`
- Test: `backend/tests/test_bctc_statements.py`

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_statements.py
from __future__ import annotations

from app.services.bctc.statements import Period, build_periods, val


def test_build_periods_merges_three_statements_by_period() -> None:
    mapping = {"net_revenue": "isa1", "total_assets": "bsa1", "cfo": "cfa20"}
    is_rows = [
        {"year_report": 2025, "length_report": 5, "isa1": 200.0},
        {"year_report": 2024, "length_report": 5, "isa1": 160.0},
    ]
    bs_rows = [
        {"year_report": 2025, "length_report": 5, "bsa1": 1000.0},
        {"year_report": 2024, "length_report": 5, "bsa1": 900.0},
    ]
    cf_rows = [
        {"year_report": 2025, "length_report": 5, "cfa20": 50.0},
    ]
    periods = build_periods(bs_rows, is_rows, cf_rows, mapping)
    # Mới nhất trước.
    assert [p.year for p in periods] == [2025, 2024]
    assert periods[0].values["net_revenue"] == 200.0
    assert periods[0].values["total_assets"] == 1000.0
    assert periods[0].values["cfo"] == 50.0
    # Kỳ 2024 không có cfo -> vắng mặt.
    assert "cfo" not in periods[1].values


def test_val_returns_none_for_missing() -> None:
    p = Period(year=2025, length=5, values={"net_revenue": 200.0})
    assert val(p, "net_revenue") == 200.0
    assert val(p, "khong_co") is None
    assert val(None, "net_revenue") is None
```

- [ ] **Step 2: Chạy test → fail**

Run: `cd backend && uv run pytest tests/test_bctc_statements.py -q`
Expected: FAIL (ModuleNotFoundError `statements`).

- [ ] **Step 3: Viết implementation**

```python
# backend/app/services/bctc/statements.py
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Period:
    year: int
    length: int  # 1..4 = quý, 5 = năm
    values: dict[str, float]  # concept -> giá trị VND thô


def _key(row: dict) -> tuple[int, int]:
    return int(row.get("year_report") or 0), int(row.get("length_report") or 0)


def _concepts(row: dict, mapping: dict[str, str | None]) -> dict[str, float]:
    out: dict[str, float] = {}
    for concept, field in mapping.items():
        if not field:
            continue
        raw = row.get(field)
        if raw is None:
            continue
        try:
            out[concept] = float(raw)
        except (TypeError, ValueError):
            continue
    return out


def build_periods(
    bs_rows: list[dict],
    is_rows: list[dict],
    cf_rows: list[dict],
    mapping: dict[str, str | None],
) -> list[Period]:
    """Ghép 3 báo cáo theo (year, length) thành Period với concept đã ánh xạ. Mới nhất trước."""
    merged: dict[tuple[int, int], dict[str, float]] = {}
    for rows in (bs_rows, is_rows, cf_rows):
        for row in rows or []:
            k = _key(row)
            if k == (0, 0):
                continue
            merged.setdefault(k, {}).update(_concepts(row, mapping))
    periods = [Period(year=y, length=l, values=v) for (y, l), v in merged.items()]
    periods.sort(key=lambda p: (p.year, p.length), reverse=True)
    return periods


def val(period: Period | None, concept: str) -> float | None:
    if period is None:
        return None
    return period.values.get(concept)
```

- [ ] **Step 4: Chạy test → pass**

Run: `cd backend && uv run pytest tests/test_bctc_statements.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add backend/app/services/bctc/statements.py backend/tests/test_bctc_statements.py
git commit -m "feat(bctc): period builder merges 3 statements into concept dicts"
```

---

### Task 0.5: Validation harness + feasibility note

**Files:**
- Create: `backend/app/services/bctc/validation.py`
- Test: `backend/tests/test_bctc_validation.py`
- Update: `dashboard/docs/specs/bctc-guide/fieldcode-map.md` (mục Feasibility)

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_validation.py
from __future__ import annotations

from app.services.bctc.statements import Period
from app.services.bctc.validation import balance_identity_flag, sanity_flags


def test_balance_identity_ok_within_tolerance() -> None:
    p = Period(2025, 5, {"total_assets": 1000.0, "total_liabilities": 600.0, "equity": 400.0})
    assert balance_identity_flag(p) is None  # 600+400 == 1000


def test_balance_identity_flags_mismatch() -> None:
    p = Period(2025, 5, {"total_assets": 1000.0, "total_liabilities": 600.0, "equity": 300.0})
    flag = balance_identity_flag(p)
    assert flag is not None and flag["level"] == "warn"


def test_sanity_flags_out_of_range_roe() -> None:
    flags = sanity_flags({"roe": 0.9, "gross_margin": 0.4})  # ROE 90% phi lý
    codes = {f["code"] for f in flags}
    assert "roe_out_of_range" in codes
```

- [ ] **Step 2: Chạy test → fail**

Run: `cd backend && uv run pytest tests/test_bctc_validation.py -q`
Expected: FAIL (ModuleNotFoundError `validation`).

- [ ] **Step 3: Viết implementation**

```python
# backend/app/services/bctc/validation.py
from __future__ import annotations

from typing import Any

from app.services.bctc.statements import Period, val

Flag = dict[str, Any]


def balance_identity_flag(p: Period) -> Flag | None:
    ta, tl, eq = val(p, "total_assets"), val(p, "total_liabilities"), val(p, "equity")
    if ta is None or tl is None or eq is None or ta == 0:
        return None
    if abs((tl + eq) - ta) / abs(ta) > 0.005:  # lệch > 0.5%
        return {"level": "warn", "code": "balance_identity",
                "message": f"BCĐKT lệch: Nợ+VCSH ≠ Tổng TS ({p.year})"}
    return None


def cashflow_identity_flag(p: Period, reported_cfo: float | None) -> Flag | None:
    cfo = val(p, "cfo")
    if cfo is None or reported_cfo is None or cfo == 0:
        return None
    if abs(reported_cfo - cfo) / abs(cfo) > 0.01:
        return {"level": "warn", "code": "cashflow_identity",
                "message": f"LCTT lệch CFO ({p.year})"}
    return None


_RANGES = {
    "gross_margin": (0.0, 1.0),
    "roe": (-0.5, 0.5),
    "nim": (0.01, 0.08),
}


def sanity_flags(snapshot: dict[str, float | None]) -> list[Flag]:
    flags: list[Flag] = []
    for key, (lo, hi) in _RANGES.items():
        v = snapshot.get(key)
        if v is None:
            continue
        if not (lo <= v <= hi):
            flags.append({"level": "warn", "code": f"{key}_out_of_range",
                          "message": f"{key}={v:.3f} ngoài khoảng hợp lý [{lo},{hi}]"})
    return flags


def yoy_outlier_flag(metric: str, cur: float | None, prev: float | None) -> Flag | None:
    if cur is None or prev is None or prev == 0:
        return None
    if abs((cur - prev) / prev) > 2.0:  # YoY > 200%
        return {"level": "info", "code": f"{metric}_yoy_outlier",
                "message": f"{metric} biến động > 200% YoY — cần review"}
    return None
```

- [ ] **Step 4: Chạy test → pass**

Run: `cd backend && uv run pytest tests/test_bctc_validation.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Ghi feasibility note (sau khi điền mapping ở Task 0.2/0.3)**

Thêm mục "Feasibility" vào `dashboard/docs/specs/bctc-guide/fieldcode-map.md`: liệt kê KPI nào tính sạch được (đủ concept), KPI nào thiếu field. Ghi rõ: **giá lịch sử 5 năm CÓ** (qua `/market-data/quotes/{symbol}/ohlcv` với `start` 5 năm trước, hoặc `/market-data/company/{symbol}/price-chart`); **β KHÔNG có sẵn** từ bất kỳ nguồn nào → định giá DCF/P/E-band (Phase 4) phải tự tính β từ chuỗi giá + index, hoặc dùng bản rút gọn RIM + P/E band.

- [ ] **Step 6: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add backend/app/services/bctc/validation.py backend/tests/test_bctc_validation.py dashboard/docs/specs/bctc-guide/fieldcode-map.md
git commit -m "feat(bctc): validation harness (identity, sanity, outlier) + feasibility note"
```

**🔎 Checkpoint Phase 0:** Nếu nhiều concept cốt lõi (gross_profit, cfo, capex, equity_parent, customer_loans, customer_deposits) KHÔNG ánh xạ được, dừng và xem lại phạm vi Phase 1 với người dùng trước khi tiếp tục.

---

## PHASE 1 — MVP không-AI

### Task 1.1: Sector Router (A/B)

**Files:**
- Create: `backend/app/services/bctc/sector.py`
- Test: `backend/tests/test_bctc_sector.py`

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_sector.py
from __future__ import annotations

from app.services.bctc.sector import detect_template


def test_detect_bank_by_isb_codes() -> None:
    is_rows = [{"year_report": 2025, "length_report": 5, "isb38": 1000.0}]
    assert detect_template(is_rows) == "B"


def test_detect_nonbank_default() -> None:
    is_rows = [{"year_report": 2025, "length_report": 5, "isa1": 200.0}]
    assert detect_template(is_rows) == "A"


def test_detect_empty_defaults_to_a() -> None:
    assert detect_template([]) == "A"
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_sector.py -q` → FAIL.

- [ ] **Step 3: Implementation**

```python
# backend/app/services/bctc/sector.py
from __future__ import annotations

_BANK_SIGNATURE = ("isb38", "isb27", "isb43")


def detect_template(income_rows: list[dict]) -> str:
    """'B' nếu xuất hiện FieldCode đặc trưng ngân hàng (TOI/NII/NPAT bank), ngược lại 'A'."""
    for row in income_rows or []:
        if any(row.get(code) is not None for code in _BANK_SIGNATURE):
            return "B"
    return "A"
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_sector.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/sector.py backend/tests/test_bctc_sector.py
git commit -m "feat(bctc): sector router (bank vs non-bank by isb signature)"
```

---

### Task 1.2: Threshold classifier

**Files:**
- Create: `backend/app/services/bctc/thresholds.py`
- Test: `backend/tests/test_bctc_thresholds.py`

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_thresholds.py
from __future__ import annotations

from app.services.bctc.thresholds import classify


def test_classify_roe() -> None:
    assert classify("roe", 0.20) == "green"   # >18%
    assert classify("roe", 0.15) == "amber"   # 12-18%
    assert classify("roe", 0.10) == "red"     # <12%


def test_classify_net_debt_ebitda_negative_is_green() -> None:
    assert classify("net_debt_ebitda", -0.2) == "green"  # net cash
    assert classify("net_debt_ebitda", 1.0) == "green"
    assert classify("net_debt_ebitda", 2.0) == "amber"
    assert classify("net_debt_ebitda", 4.0) == "red"


def test_classify_none_returns_na() -> None:
    assert classify("roe", None) == "na"


def test_unknown_metric_returns_na() -> None:
    assert classify("khong_biet", 1.0) == "na"
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_thresholds.py -q` → FAIL.

- [ ] **Step 3: Implementation** (ngưỡng theo spec mục 4–6; `bands` = danh sách `(ceiling, status)` xét từ thấp lên; `higher_better` đảo chiều)

```python
# backend/app/services/bctc/thresholds.py
from __future__ import annotations

# Mỗi metric: danh sách mốc (giới hạn trên, nhãn) theo thứ tự giá trị tăng dần.
# Giá trị <= mốc đầu tiên thỏa -> nhận nhãn đó.
_THRESHOLDS: dict[str, list[tuple[float, str]]] = {
    # higher = better
    "revenue_growth": [(0.05, "red"), (0.15, "amber"), (float("inf"), "green")],
    "gross_margin": [(0.15, "red"), (0.25, "amber"), (float("inf"), "green")],
    "roe": [(0.12, "red"), (0.18, "amber"), (float("inf"), "green")],
    "fcf_margin": [(0.0, "red"), (0.08, "amber"), (float("inf"), "green")],
    # lower = better
    "net_debt_ebitda": [(1.5, "green"), (3.0, "amber"), (float("inf"), "red")],
    "cir": [(0.35, "green"), (0.45, "amber"), (float("inf"), "red")],
    "ldr": [(0.80, "green"), (0.85, "amber"), (float("inf"), "red")],
    "cost_of_risk": [(0.01, "green"), (0.015, "amber"), (float("inf"), "red")],
    # bank, higher = better
    "nim": [(0.025, "red"), (0.035, "amber"), (float("inf"), "green")],
    "equity_ratio": [(0.06, "red"), (0.08, "amber"), (float("inf"), "green")],
    # altman special-cased below
}


def classify(metric: str, value: float | None) -> str:
    if value is None:
        return "na"
    if metric == "altman_z":
        if value > 2.99:
            return "green"
        if value > 1.81:
            return "amber"
        return "red"
    bands = _THRESHOLDS.get(metric)
    if not bands:
        return "na"
    for ceiling, label in bands:
        if value <= ceiling:
            return label
    return "na"
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_thresholds.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/thresholds.py backend/tests/test_bctc_thresholds.py
git commit -m "feat(bctc): threshold classifier (green/amber/red per spec)"
```

---

### Task 1.3: Snapshot KPIs — Template A

**Files:**
- Create: `backend/app/services/bctc/kpi_nonbank.py`
- Test: `backend/tests/test_bctc_kpi_nonbank.py`

- [ ] **Step 1: Viết test (fail trước)** — fixture concept-keyed, kiểm tra công thức.

```python
# backend/tests/test_bctc_kpi_nonbank.py
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_nonbank as k


def _p(year: int, **values: float) -> Period:
    return Period(year=year, length=5, values=values)


def test_revenue_growth() -> None:
    cur, prev = _p(2025, net_revenue=200.0), _p(2024, net_revenue=160.0)
    assert math.isclose(k.revenue_growth(cur, prev), 0.25)


def test_gross_margin() -> None:
    p = _p(2025, net_revenue=200.0, gross_profit=82.0)
    assert math.isclose(k.gross_margin(p), 0.41)


def test_roe_uses_average_equity() -> None:
    cur = _p(2025, npat_parent=24.0, equity_parent=110.0)
    prev = _p(2024, equity_parent=90.0)
    # avg equity = (110+90)/2 = 100 -> ROE = 24/100 = 0.24
    assert math.isclose(k.roe(cur, prev), 0.24)


def test_net_debt_ebitda_net_cash_is_negative() -> None:
    p = _p(2025, st_debt=10.0, lt_debt=20.0, cash=40.0, st_investments=10.0,
           operating_profit=80.0, depreciation=20.0)
    # net debt = (10+20) - (40+10) = -20 ; ebitda = 80+20 = 100 ; ratio = -0.2
    assert math.isclose(k.net_debt_ebitda(p), -0.2)


def test_fcf_margin() -> None:
    p = _p(2025, cfo=105.0, capex=-27.0, net_revenue=200.0)
    # (105 - 27)/200 = 0.39
    assert math.isclose(k.fcf_margin(p), 0.39)


def test_altman_z_components() -> None:
    p = _p(2025, current_assets=500.0, current_liabilities=300.0, total_assets=1000.0,
           retained_earnings=200.0, operating_profit=120.0, equity=400.0,
           total_liabilities=600.0, net_revenue=800.0)
    # A=(500-300)/1000=0.2 ; B=200/1000=0.2 ; C=120/1000=0.12 ; D=400/600=0.6667 ; E=800/1000=0.8
    expected = 1.2*0.2 + 1.4*0.2 + 3.3*0.12 + 0.6*(400/600) + 1.0*0.8
    assert math.isclose(k.altman_z(p), expected, rel_tol=1e-9)


def test_returns_none_on_missing() -> None:
    assert k.gross_margin(_p(2025, net_revenue=0.0)) is None
    assert k.revenue_growth(_p(2025, net_revenue=200.0), None) is None
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_nonbank.py -q` → FAIL.

- [ ] **Step 3: Implementation**

```python
# backend/app/services/bctc/kpi_nonbank.py
from __future__ import annotations

from app.services.bctc.statements import Period, val


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def revenue_growth(cur: Period, prev: Period | None) -> float | None:
    a, b = val(cur, "net_revenue"), val(prev, "net_revenue")
    if a is None or b in (None, 0):
        return None
    return a / b - 1


def gross_margin(p: Period) -> float | None:
    gp, rev = val(p, "gross_profit"), val(p, "net_revenue")
    if gp is None or not rev:
        return None
    return gp / rev


def roe(cur: Period, prev: Period | None) -> float | None:
    ni = val(cur, "npat_parent") or val(cur, "npat")
    eq = _avg(cur, prev, "equity_parent") or _avg(cur, prev, "equity")
    if ni is None or not eq:
        return None
    return ni / eq


def net_debt_ebitda(p: Period) -> float | None:
    parts = [val(p, c) for c in ("st_debt", "lt_debt", "cash", "st_investments")]
    if any(x is None for x in parts):
        return None
    st_debt, lt_debt, cash, sti = parts  # type: ignore[misc]
    ebit, dep = val(p, "operating_profit"), val(p, "depreciation")
    if ebit is None or dep is None:
        return None
    ebitda = ebit + dep
    if ebitda == 0:
        return None
    net_debt = (st_debt + lt_debt) - (cash + sti)
    return net_debt / ebitda


def fcf_margin(p: Period) -> float | None:
    cfo, capex, rev = val(p, "cfo"), val(p, "capex"), val(p, "net_revenue")
    if cfo is None or capex is None or not rev:
        return None
    # capex lưu dạng âm trong LCTT -> FCF = CFO + capex (cộng số âm)
    return (cfo + capex) / rev


def altman_z(p: Period) -> float | None:
    ca, cl, ta = val(p, "current_assets"), val(p, "current_liabilities"), val(p, "total_assets")
    re, ebit, eq, tl, rev = (val(p, "retained_earnings"), val(p, "operating_profit"),
                             val(p, "equity"), val(p, "total_liabilities"), val(p, "net_revenue"))
    if None in (ca, cl, ta, re, ebit, eq, tl, rev) or not ta or not tl:
        return None
    a = (ca - cl) / ta
    b = re / ta
    c = ebit / ta
    d = eq / tl
    e = rev / ta
    return 1.2 * a + 1.4 * b + 3.3 * c + 0.6 * d + 1.0 * e
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_nonbank.py -q` → PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/kpi_nonbank.py backend/tests/test_bctc_kpi_nonbank.py
git commit -m "feat(bctc): Template A snapshot KPIs (rev growth, GM, ROE, NetDebt/EBITDA, FCF, Altman Z')"
```

---

### Task 1.4: Snapshot KPIs — Template B (ngân hàng)

**Files:**
- Create: `backend/app/services/bctc/kpi_bank.py`
- Test: `backend/tests/test_bctc_kpi_bank.py`

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_kpi_bank.py
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_bank as kb


def _p(year: int, **values: float) -> Period:
    return Period(year=year, length=5, values=values)


def test_nim_uses_average_earning_assets() -> None:
    cur = _p(2025, net_interest_income=35.0, earning_assets=1100.0)
    prev = _p(2024, earning_assets=900.0)
    # avg EA = 1000 -> NIM = 35/1000 = 0.035
    assert math.isclose(kb.nim(cur, prev), 0.035)


def test_ldr() -> None:
    p = _p(2025, customer_loans=800.0, customer_deposits=1000.0)
    assert math.isclose(kb.ldr(p), 0.8)


def test_equity_ratio() -> None:
    p = _p(2025, equity=90.0, total_assets=1000.0)
    assert math.isclose(kb.equity_ratio(p), 0.09)


def test_llr_loans_uses_absolute_reserve() -> None:
    p = _p(2025, loan_loss_reserve=-20.0, customer_loans=800.0)
    assert math.isclose(kb.llr_loans(p), 0.025)


def test_cir() -> None:
    p = _p(2025, operating_expense=35.0, total_operating_income=100.0)
    assert math.isclose(kb.cir(p), 0.35)


def test_roe_bank_average_equity() -> None:
    cur, prev = _p(2025, npat=24.0, equity=110.0), _p(2024, equity=90.0)
    assert math.isclose(kb.roe(cur, prev), 0.24)
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_bank.py -q` → FAIL.

- [ ] **Step 3: Implementation**

```python
# backend/app/services/bctc/kpi_bank.py
from __future__ import annotations

from app.services.bctc.statements import Period, val


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def nim(cur: Period, prev: Period | None) -> float | None:
    nii = val(cur, "net_interest_income")
    ea = _avg(cur, prev, "earning_assets")
    if nii is None or not ea:
        return None
    return nii / ea


def roe(cur: Period, prev: Period | None) -> float | None:
    ni = val(cur, "npat")
    eq = _avg(cur, prev, "equity")
    if ni is None or not eq:
        return None
    return ni / eq


def ldr(p: Period) -> float | None:
    loans, dep = val(p, "customer_loans"), val(p, "customer_deposits")
    if loans is None or not dep:
        return None
    return loans / dep


def equity_ratio(p: Period) -> float | None:
    eq, ta = val(p, "equity"), val(p, "total_assets")
    if eq is None or not ta:
        return None
    return eq / ta


def llr_loans(p: Period) -> float | None:
    res, loans = val(p, "loan_loss_reserve"), val(p, "customer_loans")
    if res is None or not loans:
        return None
    return abs(res) / loans


def cir(p: Period) -> float | None:
    opex, toi = val(p, "operating_expense"), val(p, "total_operating_income")
    if opex is None or not toi:
        return None
    return abs(opex) / toi
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_bank.py -q` → PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/kpi_bank.py backend/tests/test_bctc_kpi_bank.py
git commit -m "feat(bctc): Template B snapshot KPIs (NIM, ROE, LDR, equity ratio, LLR, CIR)"
```

---

### Task 1.5: Module Template A — Common-Size, Working Capital Cycle, Cash Flow Bridge

**Files:**
- Create: `backend/app/services/bctc/kpi_nonbank_modules.py`
- Test: `backend/tests/test_bctc_kpi_nonbank_modules.py`

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_kpi_nonbank_modules.py
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_nonbank_modules as m


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_common_size_ratios() -> None:
    p = _p(2025, net_revenue=200.0, cogs=118.0, gross_profit=82.0,
           selling_expense=17.4, admin_expense=26.0, operating_profit=36.4, npat=28.8)
    cs = m.common_size(p)
    assert math.isclose(cs["cogs_pct"], 0.59)
    assert math.isclose(cs["gross_margin"], 0.41)
    assert math.isclose(cs["net_margin"], 0.144)


def test_working_capital_cycle() -> None:
    cur = _p(2025, trade_receivables=89.0, inventory_gross=42.0, inventory_provision=0.0,
             trade_payables=78.0, net_revenue=365.0, cogs=365.0)
    prev = _p(2024, trade_receivables=89.0, inventory_gross=42.0, inventory_provision=0.0,
              trade_payables=78.0)
    wcc = m.working_capital_cycle(cur, prev)
    # avg AR=89, rev=365 -> DSO = 89/365*365 = 89
    assert math.isclose(wcc["dso"], 89.0)
    assert math.isclose(wcc["dio"], 42.0)
    assert math.isclose(wcc["dpo"], 78.0)
    assert math.isclose(wcc["ccc"], 89.0 + 42.0 - 78.0)


def test_cash_flow_bridge() -> None:
    p = _p(2025, npat=89.0, depreciation=21.8, provisions_cf=0.0,
           cfo=105.9, capex=-27.2, net_revenue=300.0, total_assets=1000.0)
    br = m.cash_flow_bridge(p)
    assert math.isclose(br["fcf"], 105.9 - 27.2)
    assert math.isclose(br["cfo_ni"], 105.9 / 89.0)
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_nonbank_modules.py -q` → FAIL.

- [ ] **Step 3: Implementation**

```python
# backend/app/services/bctc/kpi_nonbank_modules.py
from __future__ import annotations

from app.services.bctc.statements import Period, val


def _pct(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def common_size(p: Period) -> dict[str, float | None]:
    rev = val(p, "net_revenue")
    return {
        "cogs_pct": _pct(val(p, "cogs"), rev),
        "gross_margin": _pct(val(p, "gross_profit"), rev),
        "selling_pct": _pct(val(p, "selling_expense"), rev),
        "admin_pct": _pct(val(p, "admin_expense"), rev),
        "ebit_margin": _pct(val(p, "operating_profit"), rev),
        "net_margin": _pct(val(p, "npat"), rev),
    }


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def working_capital_cycle(cur: Period, prev: Period | None) -> dict[str, float | None]:
    rev, cogs = val(cur, "net_revenue"), val(cur, "cogs")
    ar = _avg(cur, prev, "trade_receivables")
    inv_g = _avg(cur, prev, "inventory_gross")
    inv_p = _avg(cur, prev, "inventory_provision") or 0.0
    inv_net = (inv_g - abs(inv_p)) if inv_g is not None else None
    ap = _avg(cur, prev, "trade_payables")
    dso = (ar / rev * 365) if ar is not None and rev else None
    dio = (inv_net / cogs * 365) if inv_net is not None and cogs else None
    dpo = (ap / cogs * 365) if ap is not None and cogs else None
    ccc = (dso + dio - dpo) if None not in (dso, dio, dpo) else None
    return {"dso": dso, "dio": dio, "dpo": dpo, "ccc": ccc}


def cash_flow_bridge(p: Period) -> dict[str, float | None]:
    ni, dep, prov = val(p, "npat"), val(p, "depreciation"), val(p, "provisions_cf")
    cfo, capex, rev, ta = (val(p, "cfo"), val(p, "capex"), val(p, "net_revenue"),
                           val(p, "total_assets"))
    fcf = (cfo + capex) if cfo is not None and capex is not None else None
    return {
        "ni": ni, "depreciation": dep, "provisions": prov, "cfo": cfo,
        "capex": capex, "fcf": fcf,
        "cfo_ni": _pct(cfo, ni),
        "fcf_margin": _pct(fcf, rev),
        "sloan_accrual": (_pct((ni - cfo), ta) if ni is not None and cfo is not None else None),
    }
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_nonbank_modules.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/kpi_nonbank_modules.py backend/tests/test_bctc_kpi_nonbank_modules.py
git commit -m "feat(bctc): Template A modules (common-size, working-capital cycle, cash-flow bridge)"
```

---

### Task 1.6: Module Template B — TOI Mix, NIM Decomp, PPOP/CoR

**Files:**
- Create: `backend/app/services/bctc/kpi_bank_modules.py`
- Test: `backend/tests/test_bctc_kpi_bank_modules.py`

- [ ] **Step 1: Viết test (fail trước)**

```python
# backend/tests/test_bctc_kpi_bank_modules.py
from __future__ import annotations

import math

from app.services.bctc.statements import Period
from app.services.bctc import kpi_bank_modules as bm


def _p(year: int, **v: float) -> Period:
    return Period(year=year, length=5, values=v)


def test_toi_mix() -> None:
    p = _p(2025, total_operating_income=100.0, net_interest_income=75.0, net_fee_income=15.0)
    mix = bm.toi_mix(p)
    assert math.isclose(mix["nii_pct"], 0.75)
    assert math.isclose(mix["fee_pct"], 0.15)


def test_nim_decomposition() -> None:
    cur = _p(2025, interest_income_gross=80.0, interest_expense=45.0,
             earning_assets=1100.0, interest_bearing_liabilities=1050.0)
    prev = _p(2024, earning_assets=900.0, interest_bearing_liabilities=950.0)
    d = bm.nim_decomposition(cur, prev)
    # avg EA=1000 -> yield=80/1000=0.08 ; avg IBL=1000 -> cof=45/1000=0.045 ; spread=0.035
    assert math.isclose(d["yield_ea"], 0.08)
    assert math.isclose(d["cost_of_funds"], 0.045)
    assert math.isclose(d["spread"], 0.035)


def test_ppop_cor() -> None:
    cur = _p(2025, total_operating_income=100.0, operating_expense=35.0,
             provision_expense=10.0, customer_loans=1100.0)
    prev = _p(2024, customer_loans=900.0)
    r = bm.ppop_cor(cur, prev)
    assert math.isclose(r["ppop"], 65.0)         # 100 - 35
    assert math.isclose(r["cir"], 0.35)
    assert math.isclose(r["provision_ppop"], 10.0 / 65.0)
    assert math.isclose(r["cost_of_risk"], 10.0 / 1000.0)  # avg loans = 1000
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_bank_modules.py -q` → FAIL.

- [ ] **Step 3: Implementation**

```python
# backend/app/services/bctc/kpi_bank_modules.py
from __future__ import annotations

from app.services.bctc.statements import Period, val


def _pct(num: float | None, den: float | None) -> float | None:
    if num is None or not den:
        return None
    return num / den


def _avg(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept)
    return (a + b) / 2 if b is not None else a


def toi_mix(p: Period) -> dict[str, float | None]:
    toi = val(p, "total_operating_income")
    return {
        "nii_pct": _pct(val(p, "net_interest_income"), toi),
        "fee_pct": _pct(val(p, "net_fee_income"), toi),
    }


def nim_decomposition(cur: Period, prev: Period | None) -> dict[str, float | None]:
    ea = _avg(cur, prev, "earning_assets")
    ibl = _avg(cur, prev, "interest_bearing_liabilities")
    y = _pct(val(cur, "interest_income_gross"), ea)
    cof = _pct(val(cur, "interest_expense"), ibl)
    spread = (y - cof) if y is not None and cof is not None else None
    return {"yield_ea": y, "cost_of_funds": cof, "spread": spread}


def ppop_cor(cur: Period, prev: Period | None) -> dict[str, float | None]:
    toi, opex = val(cur, "total_operating_income"), val(cur, "operating_expense")
    prov = val(cur, "provision_expense")
    avg_loans = _avg(cur, prev, "customer_loans")
    ppop = (toi - abs(opex)) if toi is not None and opex is not None else None
    return {
        "ppop": ppop,
        "cir": _pct(abs(opex) if opex is not None else None, toi),
        "provision_ppop": _pct(prov, ppop),
        "cost_of_risk": _pct(prov, avg_loans),
    }
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_kpi_bank_modules.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/kpi_bank_modules.py backend/tests/test_bctc_kpi_bank_modules.py
git commit -m "feat(bctc): Template B modules (TOI mix, NIM decomposition, PPOP/CoR)"
```

---

### Task 1.7: Forensic Panel rule-based (A & B)

**Files:**
- Create: `backend/app/services/bctc/forensic.py`
- Test: `backend/tests/test_bctc_forensic.py`

- [ ] **Step 1: Viết test (fail trước)** — Panel nhận snapshot đã tính + chuỗi nhiều năm; trả `{green:[], red:[]}`.

```python
# backend/tests/test_bctc_forensic.py
from __future__ import annotations

from app.services.bctc.forensic import forensic_panel


def test_nonbank_green_signals() -> None:
    # roe_series 3 năm > 18%, net_debt_ebitda âm, altman > 3.5
    metrics = {
        "template": "A",
        "roe_series": [0.24, 0.21, 0.19],
        "net_debt_ebitda": -0.2,
        "altman_z": 4.21,
        "fcf_margin_series": [0.12, 0.11, 0.10],
        "gross_margin_delta": 0.027,
        "dso_change_2y": 0.10,
    }
    panel = forensic_panel(metrics)
    joined = " ".join(panel["green"])
    assert "ROE" in joined
    assert "Net cash" in joined or "net cash" in joined.lower()
    assert any("Altman" in s for s in panel["green"])


def test_nonbank_red_flags() -> None:
    metrics = {
        "template": "A",
        "roe_series": [0.10],
        "net_debt_ebitda": 3.5,
        "altman_z": 1.5,
        "dso_change_2y": 0.30,  # DSO tăng > 20%
    }
    panel = forensic_panel(metrics)
    joined = " ".join(panel["red"])
    assert "DSO" in joined
    assert any("đòn bẩy" in s.lower() or "net debt" in s.lower() for s in panel["red"])


def test_bank_signals() -> None:
    metrics = {
        "template": "B",
        "nim_series": [0.038, 0.037, 0.036],
        "roe_series": [0.20, 0.19, 0.185],
        "cir": 0.32,
        "ldr": 0.9,
    }
    panel = forensic_panel(metrics)
    assert any("NIM" in s for s in panel["green"])
    assert any("LDR" in s for s in panel["red"])
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_forensic.py -q` → FAIL.

- [ ] **Step 3: Implementation** (luật theo spec Module 9 / 7B)

```python
# backend/app/services/bctc/forensic.py
from __future__ import annotations

from typing import Any


def _all_above(series: list[float] | None, threshold: float, n: int = 3) -> bool:
    if not series or len(series) < n:
        return False
    return all(v > threshold for v in series[:n])


def _nonbank(m: dict[str, Any], green: list[str], red: list[str]) -> None:
    if _all_above(m.get("roe_series"), 0.18):
        green.append("ROE bền vững > 18% ba năm")
    if (nde := m.get("net_debt_ebitda")) is not None and nde < 0:
        green.append("Vị thế tiền mặt ròng (Net cash)")
    if (z := m.get("altman_z")) is not None and z > 3.5:
        green.append(f"Tài chính an toàn — Altman Z {z:.2f}")
    if _all_above(m.get("fcf_margin_series"), 0.08):
        green.append("FCF generation bền vững > 8%")
    if (gd := m.get("gross_margin_delta")) is not None and gd > 0.02:
        green.append(f"Biên gộp mở rộng +{gd * 10000:.0f}bp/5N")

    if (z := m.get("altman_z")) is not None and z <= 1.81:
        red.append(f"Altman Z {z:.2f} — vùng cảnh báo phá sản")
    if (nde := m.get("net_debt_ebitda")) is not None and nde > 3:
        red.append(f"Đòn bẩy cao — Net Debt/EBITDA {nde:.1f}x")
    if (dc := m.get("dso_change_2y")) is not None and dc > 0.20:
        red.append(f"DSO tăng {dc * 100:.0f}% trong 2 năm")


def _bank(m: dict[str, Any], green: list[str], red: list[str]) -> None:
    if _all_above(m.get("nim_series"), 0.035):
        green.append("NIM top quartile, bền vững > 3.5%")
    if _all_above(m.get("roe_series"), 0.18):
        green.append("ROE > 18% sustainable")
    if (cir := m.get("cir")) is not None and cir < 0.35:
        green.append("CIR best-in-class < 35%")

    if (ldr := m.get("ldr")) is not None and ldr > 0.85:
        red.append(f"LDR {ldr * 100:.0f}% vượt cap NHNN 85%")
    if (cir := m.get("cir")) is not None and cir > 0.45:
        red.append("CIR cao > 45%")


def forensic_panel(metrics: dict[str, Any]) -> dict[str, list[str]]:
    green: list[str] = []
    red: list[str] = []
    if metrics.get("template") == "B":
        _bank(metrics, green, red)
    else:
        _nonbank(metrics, green, red)
    if not red:
        red.append("Không có cờ đỏ trọng yếu")
    return {"green": green, "red": red}
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_forensic.py -q` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/forensic.py backend/tests/test_bctc_forensic.py
git commit -m "feat(bctc): rule-based forensic panel (green/red signals, A & B)"
```

---

### Task 1.8: Assembler `build_bctc_payload`

**Files:**
- Create: `backend/app/services/bctc/assemble.py`
- Test: `backend/tests/test_bctc_assemble.py`

- [ ] **Step 1: Viết test (fail trước)** — Đầu vào là raw VCI rows; assembler tự detect template, build periods, tính tất cả, trả response dict.

```python
# backend/tests/test_bctc_assemble.py
from __future__ import annotations

from app.services.bctc.assemble import build_bctc_payload


def _mk(year: int, length: int, **v: float) -> dict:
    return {"year_report": year, "length_report": length, **v}


def test_assemble_nonbank_shape() -> None:
    # Dùng FieldCode đã CONFIRMED; các concept khác có thể N/A nếu mapping trống.
    is_rows = [_mk(2025, 5, isa1=200.0, isa22=28.8), _mk(2024, 5, isa1=160.0, isa22=24.0)]
    bs_rows = [_mk(2025, 5, bsa1=1000.0), _mk(2024, 5, bsa1=900.0)]
    cf_rows = [_mk(2025, 5)]
    out = build_bctc_payload(bs_rows, is_rows, cf_rows)
    assert out["template"] == "A"
    assert out["sector"] == "nonbank"
    assert isinstance(out["snapshot"], list) and len(out["snapshot"]) == 6
    # revenue_growth tính được từ isa1.
    rg = next(s for s in out["snapshot"] if s["key"] == "revenue_growth")
    assert abs(rg["value"] - 0.25) < 1e-9
    assert {"green", "red"} <= set(out["forensic"])
    assert isinstance(out["flags"], list)
    assert isinstance(out["modules"], list)


def test_assemble_detects_bank() -> None:
    is_rows = [_mk(2025, 5, isb38=100.0), _mk(2024, 5, isb38=90.0)]
    out = build_bctc_payload([], is_rows, [])
    assert out["template"] == "B"
    assert out["sector"] == "bank"
    assert len(out["snapshot"]) == 6
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_assemble.py -q` → FAIL.

- [ ] **Step 3: Implementation**

```python
# backend/app/services/bctc/assemble.py
from __future__ import annotations

from typing import Any

from app.services.bctc import kpi_bank, kpi_bank_modules, kpi_nonbank, kpi_nonbank_modules
from app.services.bctc.forensic import forensic_panel
from app.services.bctc.mapping_loader import load_mapping
from app.services.bctc.sector import detect_template
from app.services.bctc.statements import Period, build_periods, val
from app.services.bctc.thresholds import classify
from app.services.bctc.validation import balance_identity_flag, sanity_flags, yoy_outlier_flag

# (key, nhãn, đơn vị) cho 6 ô snapshot mỗi template.
_SNAP_A = [
    ("revenue_growth", "Tăng trưởng Doanh thu", "%"),
    ("gross_margin", "Biên Lợi nhuận gộp", "%"),
    ("roe", "ROE", "%"),
    ("net_debt_ebitda", "Nợ ròng / EBITDA", "x"),
    ("fcf_margin", "Biên FCF", "%"),
    ("altman_z", "Điểm Z Altman", ""),
]
_SNAP_B = [
    ("nim", "NIM", "%"),
    ("roe", "ROE", "%"),
    ("ldr", "LDR", "%"),
    ("equity_ratio", "VCSH / Tổng TS", "%"),
    ("llr_loans", "Dự phòng / Cho vay", "%"),
    ("cir", "CIR", "%"),
]


def _snapshot_a(periods: list[Period]) -> dict[str, float | None]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return {
        "revenue_growth": kpi_nonbank.revenue_growth(cur, prev),
        "gross_margin": kpi_nonbank.gross_margin(cur),
        "roe": kpi_nonbank.roe(cur, prev),
        "net_debt_ebitda": kpi_nonbank.net_debt_ebitda(cur),
        "fcf_margin": kpi_nonbank.fcf_margin(cur),
        "altman_z": kpi_nonbank.altman_z(cur),
    }


def _snapshot_b(periods: list[Period]) -> dict[str, float | None]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return {
        "nim": kpi_bank.nim(cur, prev),
        "roe": kpi_bank.roe(cur, prev),
        "ldr": kpi_bank.ldr(cur),
        "equity_ratio": kpi_bank.equity_ratio(cur),
        "llr_loans": kpi_bank.llr_loans(cur),
        "cir": kpi_bank.cir(cur),
    }


def _snapshot_cells(values: dict[str, float | None], defs: list[tuple[str, str, str]]) -> list[dict]:
    cells = []
    for key, label, unit in defs:
        v = values.get(key)
        cells.append({"key": key, "label": label, "unit": unit, "value": v,
                      "status": classify(key, v)})
    return cells


def _modules_a(periods: list[Period]) -> list[dict]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return [
        {"id": "common_size", "title": "Common-Size KQKD", "type": "ratios",
         "data": kpi_nonbank_modules.common_size(cur)},
        {"id": "wcc", "title": "Chu kỳ Vốn lưu động", "type": "ratios",
         "data": kpi_nonbank_modules.working_capital_cycle(cur, prev)},
        {"id": "cf_bridge", "title": "Cầu nối Dòng tiền", "type": "bridge",
         "data": kpi_nonbank_modules.cash_flow_bridge(cur)},
    ]


def _modules_b(periods: list[Period]) -> list[dict]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return [
        {"id": "toi_mix", "title": "Cơ cấu Thu nhập (TOI)", "type": "ratios",
         "data": kpi_bank_modules.toi_mix(cur)},
        {"id": "nim_decomp", "title": "Phân rã NIM", "type": "ratios",
         "data": kpi_bank_modules.nim_decomposition(cur, prev)},
        {"id": "ppop_cor", "title": "PPOP & Chi phí Dự phòng", "type": "ratios",
         "data": kpi_bank_modules.ppop_cor(cur, prev)},
    ]


def build_bctc_payload(
    bs_rows: list[dict], is_rows: list[dict], cf_rows: list[dict]
) -> dict[str, Any]:
    template = detect_template(is_rows)
    is_bank = template == "B"
    mapping = load_mapping("bank" if is_bank else "nonbank")
    periods = build_periods(bs_rows, is_rows, cf_rows, mapping)
    if not periods:
        return {"template": template, "sector": "bank" if is_bank else "nonbank",
                "periods": [], "snapshot": [], "modules": [],
                "forensic": {"green": [], "red": ["Không đủ dữ liệu BCTC"]}, "flags": []}

    snap_values = _snapshot_b(periods) if is_bank else _snapshot_a(periods)
    defs = _SNAP_B if is_bank else _SNAP_A
    snapshot = _snapshot_cells(snap_values, defs)
    modules = _modules_b(periods) if is_bank else _modules_a(periods)

    # Forensic dùng chuỗi nhiều năm cho roe/nim/fcf.
    roe_fn = kpi_bank.roe if is_bank else kpi_nonbank.roe
    roe_series = [roe_fn(periods[i], periods[i + 1] if i + 1 < len(periods) else None)
                  for i in range(min(3, len(periods)))]
    fmetrics: dict[str, Any] = {
        "template": template,
        "roe_series": [r for r in roe_series if r is not None],
        "net_debt_ebitda": snap_values.get("net_debt_ebitda"),
        "altman_z": snap_values.get("altman_z"),
        "nim_series": [kpi_bank.nim(periods[i], periods[i + 1] if i + 1 < len(periods) else None)
                       for i in range(min(3, len(periods)))] if is_bank else None,
        "cir": snap_values.get("cir"),
        "ldr": snap_values.get("ldr"),
    }
    forensic = forensic_panel(fmetrics)

    flags = sanity_flags(snap_values)
    bf = balance_identity_flag(periods[0])
    if bf:
        flags.append(bf)

    return {
        "template": template,
        "sector": "bank" if is_bank else "nonbank",
        "periods": [f"{'Q' + str(p.length) + '/' if p.length < 5 else ''}{p.year}" for p in periods],
        "snapshot": snapshot,
        "modules": modules,
        "forensic": forensic,
        "flags": flags,
    }
```

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_assemble.py -q` → PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bctc/assemble.py backend/tests/test_bctc_assemble.py
git commit -m "feat(bctc): payload assembler (template detect → snapshot+modules+forensic+flags)"
```

---

### Task 1.9: VCI fetch + service `get_bctc`

**Files:**
- Modify: `backend/app/services/market_data/sources/vietcap.py`
- Create: `backend/app/services/bctc/service.py`
- Test: `backend/tests/test_bctc_statements.py` (thêm), hoặc đặt trong `test_bctc_endpoint.py` ở Task 1.10.

- [ ] **Step 1: Thêm `fetch_bctc_statements` vào vietcap.py**

Mở `backend/app/services/market_data/sources/vietcap.py`. Tìm hàm raw đang lấy 3 báo cáo (`_fetch_financial_raw`, trả `{"years": [...], "quarters": [...]}` các flat dict keyed isa*/bsa*/cfa*/isb*) và hàm `fetch_financial_report` (tham chiếu cách nó chọn section + term_type). Thêm hàm mới NGAY DƯỚI `fetch_financial_report`:

```python
async def fetch_bctc_statements(
    symbol: str, *, term_type: int = 1
) -> tuple[dict[str, list[dict]], str]:
    """Trả 3 báo cáo dạng flat-rows keyed by FieldCode (cho engine BCTC).

    term_type: 1 = năm (length_report==5), 2 = quý.
    """
    sym = symbol.upper()
    sections = {
        "balance_sheet": "BALANCE_SHEET",
        "income_statement": "INCOME_STATEMENT",
        "cash_flow": "CASH_FLOW",
    }
    out: dict[str, list[dict]] = {}
    url = ""
    for key, section in sections.items():
        raw, url = await _fetch_financial_raw(sym, section)  # {"years":[...],"quarters":[...]}
        rows = raw.get("years" if term_type == 1 else "quarters", []) if isinstance(raw, dict) else []
        out[key] = list(rows)
    return out, url
```

⚠️ Nếu chữ ký `_fetch_financial_raw` khác (vd không nhận `section`, hoặc trả tuple khác), điều chỉnh theo đúng signature thực tế trong file — mục tiêu: trả về `{balance_sheet, income_statement, cash_flow}` mỗi cái là list các flat dict có `year_report`, `length_report`, và các FieldCode.

- [ ] **Step 2: Viết service**

```python
# backend/app/services/bctc/service.py
from __future__ import annotations

from typing import Any

from app.services.bctc.assemble import build_bctc_payload
from app.services.market_data.sources import vietcap


async def get_bctc(symbol: str, *, term_type: int = 1) -> tuple[dict[str, Any], str]:
    """Lấy 3 BCTC từ VCI, tính KPI, trả (payload, raw_url)."""
    statements, url = await vietcap.fetch_bctc_statements(symbol, term_type=term_type)
    payload = build_bctc_payload(
        statements.get("balance_sheet", []),
        statements.get("income_statement", []),
        statements.get("cash_flow", []),
    )
    return payload, url
```

- [ ] **Step 3: Test service với fetch mock**

```python
# backend/tests/test_bctc_service.py
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.services.bctc.service import get_bctc


async def test_get_bctc_assembles_from_mocked_fetch() -> None:
    statements = {
        "balance_sheet": [{"year_report": 2025, "length_report": 5, "bsa1": 1000.0}],
        "income_statement": [
            {"year_report": 2025, "length_report": 5, "isa1": 200.0},
            {"year_report": 2024, "length_report": 5, "isa1": 160.0},
        ],
        "cash_flow": [],
    }
    with patch(
        "app.services.bctc.service.vietcap.fetch_bctc_statements",
        new_callable=AsyncMock,
        return_value=(statements, "https://vci/..."),
    ):
        payload, url = await get_bctc("FPT")
    assert payload["template"] == "A"
    rg = next(s for s in payload["snapshot"] if s["key"] == "revenue_growth")
    assert abs(rg["value"] - 0.25) < 1e-9
```

Run: `cd backend && uv run pytest tests/test_bctc_service.py -q`
Expected: PASS (1 passed).

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/market_data/sources/vietcap.py backend/app/services/bctc/service.py backend/tests/test_bctc_service.py
git commit -m "feat(bctc): vietcap.fetch_bctc_statements + get_bctc service"
```

---

### Task 1.10: Endpoint `GET /market-data/bctc/{symbol}` (công khai, cache)

**Files:**
- Modify: `backend/app/api/v1/endpoints/market_data.py`
- Test: `backend/tests/test_bctc_endpoint.py`

- [ ] **Step 1: Viết test (fail trước)** — mock service ở tầng endpoint module.

```python
# backend/tests/test_bctc_endpoint.py
from __future__ import annotations

from unittest.mock import AsyncMock, patch


async def test_bctc_endpoint_returns_envelope(client) -> None:
    payload = {"template": "A", "sector": "nonbank", "periods": ["2025", "2024"],
               "snapshot": [], "modules": [], "forensic": {"green": [], "red": []}, "flags": []}
    with patch("app.api.v1.endpoints.market_data.get_bctc", new_callable=AsyncMock,
               return_value=(payload, "https://vci/...")):
        resp = await client.get("/api/v1/market-data/bctc/FPT")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["template"] == "A"
    assert body["meta"]["source"] == "VCI"


async def test_bctc_endpoint_invalid_symbol(client) -> None:
    resp = await client.get("/api/v1/market-data/bctc/!!")
    assert resp.status_code == 422
```

- [ ] **Step 2: Chạy → fail.** Run: `cd backend && uv run pytest tests/test_bctc_endpoint.py -q` → FAIL (404, route chưa có).

- [ ] **Step 3: Thêm endpoint** vào `backend/app/api/v1/endpoints/market_data.py`. Thêm import ở đầu file cùng cụm import service:

```python
from app.services.bctc.service import get_bctc
```

Thêm vào nhóm fundamentals (gần `get_financial_report`):

```python
@router.get(
    "/bctc/{symbol}",
    tags=["Dữ liệu thị trường: Cơ bản"],
    response_model=MarketDataResponse,
)
@redis_cached(ttl_setting="REDIS_TTL_MACRO_SECONDS")
async def get_bctc_dashboard(
    request: Request,
    symbol: str,
    term_type: Annotated[int, Query(ge=1, le=2, description="1=Năm, 2=Quý")] = 1,
) -> MarketDataResponse:
    """Dashboard phân tích BCTC (Snapshot + module + forensic, KPI pre-computed)."""
    symbol = symbol.upper()
    if not _validate_symbol(symbol):
        raise HTTPException(status_code=422, detail=f"Mã chứng khoán không hợp lệ: {symbol}")

    async def _vci() -> tuple[Any, str]:
        return await get_bctc(symbol, term_type=term_type)

    try:
        return await fetch_with_fallback([("VCI", _vci)])
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
```

⚠️ Kiểm tra các import `Annotated`, `Query`, `Request`, `Any`, `HTTPException`, `MarketDataResponse`, `redis_cached`, `fetch_with_fallback`, `_validate_symbol` đã có sẵn trong file (chúng được dùng bởi các endpoint khác — xem `get_financial_report`). Nếu thiếu thì thêm.

- [ ] **Step 4: Chạy → pass.** Run: `cd backend && uv run pytest tests/test_bctc_endpoint.py -q` → PASS (2 passed).

- [ ] **Step 5: Chạy toàn bộ test BCTC + lint/type**

Run: `cd backend && uv run pytest tests/test_bctc_*.py -q && uv run ruff check app/services/bctc app/api/v1/endpoints/market_data.py && uv run mypy app/services/bctc`
Expected: tất cả PASS, không lỗi lint/type.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/endpoints/market_data.py backend/tests/test_bctc_endpoint.py
git commit -m "feat(bctc): public cached endpoint GET /market-data/bctc/{symbol}"
```

---

### Task 1.11: Frontend — `bctc-format.ts` (hàm format thuần) + vitest

**Files:**
- Create: `dashboard/src/components/stock/bctc-format.ts`
- Create: `dashboard/tests/bctc-format.spec.ts`
- Modify: `dashboard/package.json` (script `test` + devDep `vitest`)

- [ ] **Step 1: Thêm script test + vitest devDep**

Trong `dashboard/package.json`: thêm `"test": "vitest run"` vào `"scripts"`, và `"vitest": "^3.2.0"` vào `"devDependencies"`. Sau đó:
Run: `cd dashboard && npm install`
Expected: vitest được cài.

- [ ] **Step 2: Viết test (fail trước)**

```ts
// dashboard/tests/bctc-format.spec.ts
import { describe, it, expect } from "vitest"
import { fmtPercent, fmtMultiple, statusColorClass, fmtSignedPercent } from "../src/components/stock/bctc-format"

describe("bctc-format", () => {
  it("fmtPercent: phân số → phần trăm 1 chữ số", () => {
    expect(fmtPercent(0.241)).toBe("24.1%")
    expect(fmtPercent(null)).toBe("—")
  })
  it("fmtMultiple: hậu tố ×", () => {
    expect(fmtMultiple(-0.2)).toBe("−0.2×")
    expect(fmtMultiple(null)).toBe("—")
  })
  it("statusColorClass: map trạng thái → lớp Tailwind state", () => {
    expect(statusColorClass("green")).toContain("emerald")
    expect(statusColorClass("red")).toContain("red")
    expect(statusColorClass("amber")).toContain("amber")
    expect(statusColorClass("na")).toContain("muted")
  })
  it("fmtSignedPercent: có dấu", () => {
    expect(fmtSignedPercent(0.027)).toBe("+2.7%")
    expect(fmtSignedPercent(-0.05)).toBe("−5.0%")
  })
})
```

- [ ] **Step 3: Chạy → fail.** Run: `cd dashboard && npx vitest run tests/bctc-format.spec.ts` → FAIL (module chưa tồn tại).

- [ ] **Step 4: Implementation**

```ts
// dashboard/src/components/stock/bctc-format.ts
export type BctcStatus = "green" | "amber" | "red" | "na"

export function fmtPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—"
  return `${(v * 100).toFixed(digits)}%`
}

export function fmtSignedPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—"
  const pct = v * 100
  const sign = pct < 0 ? "−" : "+"
  return `${sign}${Math.abs(pct).toFixed(digits)}%`
}

export function fmtMultiple(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—"
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(v).toFixed(digits)}×`
}

export function fmtNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—"
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

// Trio màu trạng thái tài chính theo quy ước IQX (bg/text/border).
export function statusColorClass(status: BctcStatus): string {
  switch (status) {
    case "green": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    case "red": return "bg-red-500/15 text-red-400 border-red-500/30"
    case "amber": return "bg-amber-500/15 text-amber-400 border-amber-500/30"
    default: return "bg-muted/40 text-muted-foreground border-border/30"
  }
}

export function statusLabel(status: BctcStatus): string {
  return { green: "Xanh", amber: "Vàng", red: "Đỏ", na: "N/A" }[status]
}
```

- [ ] **Step 5: Chạy → pass.** Run: `cd dashboard && npx vitest run tests/bctc-format.spec.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/stock/bctc-format.ts dashboard/tests/bctc-format.spec.ts dashboard/package.json dashboard/package-lock.json
git commit -m "feat(bctc): pure format helpers + vitest setup"
```

---

### Task 1.12: Frontend — token serif (editorial-in-dark)

**Files:**
- Modify: `dashboard/src/index.css`

- [ ] **Step 1: Thêm token font-serif**

Trong `dashboard/src/index.css`, trong khối `@theme inline` (cạnh `--font-sans`/`--font-heading`, ~dòng 25-26), thêm:

```css
  --font-serif: 'Newsreader', Georgia, 'Times New Roman', serif;
```

Tailwind v4 tự sinh utility `font-serif` từ token `--font-*`. Dùng web-safe `Georgia` fallback nên KHÔNG cần thêm @font-face (tránh tải thêm font; nếu muốn Newsreader thực sự, thêm @font-face woff2 sau — ngoài phạm vi Phase 1).

- [ ] **Step 2: Verify build không lỗi**

Run: `cd dashboard && npm run build`
Expected: build thành công (tsc + vite).

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/index.css
git commit -m "feat(bctc): add --font-serif token for editorial-in-dark headings"
```

---

### Task 1.13: Frontend — component `bctc-analysis.tsx` (fetch + render)

**Files:**
- Create: `dashboard/src/components/stock/bctc-analysis.tsx`

- [ ] **Step 1: Viết component** (fetch endpoint công khai theo đúng convention inline-fetch của `stock-financials.tsx`; render Snapshot grid + module + forensic; dùng `bctc-format`)

```tsx
// dashboard/src/components/stock/bctc-analysis.tsx
import { useEffect, useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  fmtPercent, fmtMultiple, fmtNumber, fmtSignedPercent,
  statusColorClass, statusLabel, type BctcStatus,
} from "./bctc-format"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

type SnapshotCell = { key: string; label: string; unit: string; value: number | null; status: BctcStatus }
type ModuleBlock = { id: string; title: string; type: string; data: Record<string, number | null> }
type BctcPayload = {
  template: "A" | "B"
  sector: string
  periods: string[]
  snapshot: SnapshotCell[]
  modules: ModuleBlock[]
  forensic: { green: string[]; red: string[] }
  flags: { level: string; code: string; message: string }[]
}

function fmtCell(c: SnapshotCell): string {
  if (c.unit === "%") return fmtPercent(c.value)
  if (c.unit === "x") return fmtMultiple(c.value)
  return fmtNumber(c.value, 2)
}

export function BctcAnalysis({ symbol }: { symbol: string }) {
  const [data, setData] = useState<BctcPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError("")
    fetch(`${API_BASE}/market-data/bctc/${symbol.toUpperCase()}?term_type=1`)
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return
        setData((res?.data ?? res) as BctcPayload)
      })
      .catch(() => alive && setError("Không tải được dữ liệu phân tích BCTC"))
      .finally(() => alive && setIsLoading(false))
    return () => { alive = false }
  }, [symbol])

  if (isLoading)
    return <div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  if (error || !data)
    return <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><AlertTriangle className="size-6" /><span className="text-xs">{error || "Không có dữ liệu"}</span></div>

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-[1080px] px-4 py-4 space-y-6">
        {/* Lớp 1 — Snapshot */}
        <section>
          <h3 className="font-serif text-base font-bold mb-3">① Thẻ Snapshot · {data.template === "B" ? "Ngân hàng" : "Standard"}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-border/30 rounded-lg overflow-hidden">
            {data.snapshot.map((c) => (
              <div key={c.key} className="bg-card p-3">
                <div className="flex items-start justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${statusColorClass(c.status)}`}>{statusLabel(c.status)}</span>
                </div>
                <div className="font-sans text-2xl font-bold mt-2 tabular-nums">{fmtCell(c)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Lớp 3 — Modules */}
        <section className="space-y-4">
          <h3 className="font-serif text-base font-bold">③ Modules phân tích</h3>
          {data.modules.map((mod) => (
            <div key={mod.id} className="bg-card border border-border rounded-lg p-4">
              <div className="font-serif text-lg font-bold mb-2">{mod.title}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(mod.data).map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">{k}</span>
                    <span className="font-sans tabular-nums">
                      {k.includes("pct") || k.endsWith("margin") || k === "cir" || k === "cost_of_risk" || k === "cfo_ni"
                        ? (k === "cfo_ni" ? fmtMultiple(v) : fmtPercent(v))
                        : fmtNumber(v, k === "dso" || k === "dio" || k === "dpo" || k === "ccc" ? 0 : 2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Lớp 4 — Forensic Panel */}
        <section>
          <h3 className="font-serif text-base font-bold mb-3">④ Bảng Forensic</h3>
          <div className="grid md:grid-cols-2 gap-px bg-border/30 rounded-lg overflow-hidden">
            <div className="bg-emerald-500/5 p-4">
              <div className="text-xs font-bold text-emerald-400 mb-2 uppercase">▲ Tín hiệu Xanh</div>
              {data.forensic.green.length ? data.forensic.green.map((s, i) => (
                <div key={i} className="text-sm text-muted-foreground mb-1.5">✓ {s}</div>
              )) : <div className="text-xs text-muted-foreground">—</div>}
            </div>
            <div className="bg-red-500/5 p-4">
              <div className="text-xs font-bold text-red-400 mb-2 uppercase">▼ Cờ Vàng / Đỏ</div>
              {data.forensic.red.map((s, i) => (
                <div key={i} className="text-sm text-muted-foreground mb-1.5">! {s}</div>
              ))}
            </div>
          </div>
        </section>

        {data.flags.length > 0 && (
          <div className="text-[10px] text-amber-400/80">
            {data.flags.map((f) => f.message).join(" · ")}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
```

- [ ] **Step 2: Verify build.** Run: `cd dashboard && npm run build` → thành công (không lỗi TS).

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/stock/bctc-analysis.tsx
git commit -m "feat(bctc): BctcAnalysis component (snapshot + modules + forensic render)"
```

---

### Task 1.14: Frontend — gắn toggle "Phân tích"/"Số liệu thô" vào tab Tài chính

**Files:**
- Modify: `dashboard/src/components/stock/stock-financials.tsx`

- [ ] **Step 1: Thêm import + state nhóm view**

Trong `dashboard/src/components/stock/stock-financials.tsx`:
- Thêm import gần các import đầu file: `import { BctcAnalysis } from "./bctc-analysis"`.
- Trong `StockFinancials` (≈ dòng 519-525), thêm state: `const [viewGroup, setViewGroup] = useState<"analysis" | "raw">("analysis")` (mặc định "analysis" — sub-view Phân tích là mặc định theo spec).

- [ ] **Step 2: Thêm 2 nút toggle nhóm vào cụm trái toolbar** (mirror style segmented control của period toggle, ngay TRƯỚC hàng `SUB_TABS.map`):

```tsx
<div className="flex items-center bg-muted/40 rounded overflow-hidden border border-border/20 mr-2">
  <button
    onClick={() => setViewGroup("analysis")}
    className={`px-2 py-1 text-xs ${viewGroup === "analysis" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
  >Phân tích</button>
  <button
    onClick={() => setViewGroup("raw")}
    className={`px-2 py-1 text-xs ${viewGroup === "raw" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
  >Số liệu thô</button>
</div>
```

- [ ] **Step 3: Bọc điều kiện render**

- Cụm `SUB_TABS.map(...)` (các nút KQKD/CDKT/LCTT/Chỉ số) và các control kỳ (termType/periodCount) chỉ hiển thị khi `viewGroup === "raw"` — bọc chúng trong `{viewGroup === "raw" && ( ... )}`.
- Phần content switch ở cuối (`{isReport ? <FinancialReport .../> : <FinancialRatios .../>}`) đổi thành:

```tsx
{viewGroup === "analysis"
  ? <BctcAnalysis symbol={symbol} />
  : isReport
    ? <FinancialReport symbol={symbol} type={subTab as Exclude<FinSubTab, "ratios">} termType={termType} periodCount={periodCount} />
    : <FinancialRatios symbol={symbol} ratioPeriod={ratioPeriod} />}
```

(giữ nguyên props hiện có của `FinancialReport`/`FinancialRatios` — chỉ thêm nhánh `viewGroup === "analysis"`).

- [ ] **Step 4: Verify build.** Run: `cd dashboard && npm run build` → thành công.

- [ ] **Step 5: Verify thủ công bằng app thật**

Run: `cd dashboard && npm run dev` → mở `/co-phieu/FPT` → tab "Tài chính" → mặc định thấy "Phân tích" với Snapshot 6 ô + module + Forensic Panel; bấm "Số liệu thô" thấy lại bảng KQKD/CDKT/LCTT/Chỉ số như cũ. Thử `/co-phieu/VCB` → Snapshot ngân hàng (NIM/LDR/CIR...). (Backend phải đang chạy; nếu một KPI thiếu mapping thì hiện "—" — bình thường ở giai đoạn này.)

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/stock/stock-financials.tsx
git commit -m "feat(bctc): mount Phân tích/Số liệu thô toggle in Tài chính tab"
```

---

## Nghiệm thu Phase 1

- [ ] `cd backend && uv run pytest tests/test_bctc_*.py -q` — tất cả PASS.
- [ ] `cd backend && uv run ruff check app/services/bctc && uv run mypy app/services/bctc` — sạch.
- [ ] `cd dashboard && npx vitest run tests/bctc-format.spec.ts` — PASS.
- [ ] `cd dashboard && npm run build` — không lỗi TS.
- [ ] Thủ công: `/co-phieu/FPT` (Template A) và `/co-phieu/VCB` (Template B) hiển thị sub-view "Phân tích" với Snapshot + module + Forensic; toggle "Số liệu thô" giữ nguyên hành vi cũ; KPI thiếu mapping hiện "—" không vỡ layout.

## Ngoài phạm vi (Phase sau)
- AI Memo + AI per-module + post-flight guard (Phase 2).
- DuPont 5 bước, Forensic Trinity (Altman/Piotroski/Beneish đầy đủ), các module bank còn lại (Phase 2-3).
- Premium gating (Phase 2 — khi thêm lớp AI; Phase 1 toàn bộ miễn phí).
- Sparkline 5 năm trong Snapshot, biểu đồ recharts cho module (Phase sau — Phase 1 hiển thị bảng số).
- Định giá (Football Field / Justified P/B), Sub-sector Spotlight (Phase 4).
- Editorial-in-dark đầy đủ (font Newsreader thật, layout research-note tinh chỉnh).

# BCTC Storytelling Dashboard Implementation Plan (P3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Dashboard phân tích BCTC "kể chuyện 2 lớp" (dark, editorial), render inline trên tab "Phân tích BCTC" trang chủ.

**Architecture:** Backend compute layer mới (`bctc_dashboard/`) tái dùng statement-fetch + sector-router + kpi/valuation sẵn có, thêm 5-year grids + peer-median (bounded+cached) + threshold/radar; AI narrative layer riêng; frontend `features/stock/bctc-dashboard/` dark editorial 14 component, hook compute (public) + AI (premium), wire inline.

**Tech Stack:** FastAPI/SQLAlchemy/Alembic/pytest (backend), DeepSeek proxy, React 19 + Arco + Vitest/RTL, SVG nội tuyến.

## Global Constraints

- **Nguồn chân lý layout/màu/SVG:** `backend/docs/superpowers/specs/bctc-dashboard/template_A_phi_ngan_hang_FPT_dark.html` (phi NH) + `template_B_ngan_hang_VCB_dark.html` (NH). Mọi task frontend PHẢI đọc template tương ứng + `SPEC_dashboard_bctc.md` (đặc tả khối) trước khi code. Số liệu trong template là minh hoạ — chỉ lấy layout/spacing/màu/cấu trúc SVG.
- **AI:** prompt = `bctc-dashboard/SYSTEM_PROMPT_ai_generate.md`; output JSON đúng schema (§ĐẦU RA); KHÔNG tên mô hình học thuật (Altman/DuPont/Sloan/Piotroski/Beneish...) ở text người dùng; KHÔNG khuyến nghị mua/bán/giữ; KHÔNG bịa số (mọi số phải có trong input); key theo template A/B (B: business→earning, cashflow→efficiency, health→asset_quality với sub chỉ {a,b}).
- **Bất biến:** AI chỉ bình luận trên số đã tính (compute layer), KHÔNG tự tính/bịa (SPEC §6).
- **Dark tokens** (SPEC §5) scope trong `.bctc-dash`; SVG dùng CSS var, KHÔNG hardcode màu. Không đụng token app toàn cục.
- **Advisory lock** (peer-median compute): dùng `pg_advisory_xact_lock` (transaction-scoped, auto-release) — KHÔNG session-level (bài học lock-leak 2026-07-14).
- **KHÔNG đụng:** `build_bctc_payload` cũ, `BctcAnalysis` /co-phieu, các endpoint/hook `bctc` cũ.
- Peer sweep: ratio endpoint (`fetch_financial_report(report_type="ratio")`), Semaphore(5)+jitter+backoff, top_k=20, degrade khi <3 peer hoặc lỗi.

---

## PHẦN BACKEND

### Task B1: Compute layer + `BctcDashboardData` contract + endpoint

**Files:**
- Create: `backend/app/services/bctc_dashboard/__init__.py`, `backend/app/services/bctc_dashboard/compute.py`
- Modify: `backend/app/api/v1/endpoints/market_data.py` (thêm route `GET /market-data/bctc-dashboard/{symbol}`)
- Test: `backend/tests/test_bctc_dashboard_compute.py`

**Interfaces:**
- Consumes: `fetch_bctc_statements(symbol, *, term_type=1) -> ({"balance_sheet","income_statement","cash_flow"}, url)`; `statements.build_periods(bs,is,cf,mapping) -> list[Period]` (newest-first); `statements.val(period, concept) -> float|None`; `bctc.sector.detect_template(income_rows) -> "A"|"B"`; `bctc.subsector.detect_subsector(period, ccc=None)`; mapping loaders (đọc cách `service.get_bctc` load `mapping/nonbank.yaml`/`bank.yaml`); kpi modules (`kpi_nonbank`, `kpi_bank`), valuation (`valuation_nonbank`, `valuation_bank`). Peer-median (B2) + threshold/radar (B3) sẽ bơm vào — B1 để chỗ (peer=None, color=None) rồi B3 điền.
- Produces: `async def compute_dashboard(symbol: str, *, term_type: int = 1) -> dict` trả `BctcDashboardData` (shape dưới). Route trả `MarketDataResponse` qua `fetch_with_fallback`.

`BctcDashboardData` shape (khớp design doc §Contract):
```python
{
  "template": "A"|"B", "sub_sector": str|None,
  "hero": {"ticker","name","exchange","sector","price","fair_value","upside_pct"},
  "radar": {"dims": [{"key","label","score":int|None,"band":None,"value_label"}]},  # score/band do B3 điền
  "blocks": {
    "financial": {"stacked_abs":[{"year":int,"equity":float,"other_liab":float,"debt":float}],
                  "growth_sources":[{"label","amount","pct"}], "totals":[{"label","value","mult"}],
                  "asset_mix":[{"label","pct"}]},        # B variant: loans/deposits (đọc SPEC §3 Khối 3 B)
    "business": {"revenue_series":[{"year","revenue","gross_margin","net_margin"}],
                 "metrics":[{"key","label","value","unit","peer_median":None,"color":None}],
                 "earnings_quality":{"core_pct","oneoff_pct","peer_median":None}},  # B: nim_series + income_mix
    "cashflow": {"profit_vs_cash":[{"year","profit","cfo"}],
                 "metrics":[{"key","label","value","unit","peer_median":None,"color":None}],
                 "waterfall":[{"label","value","kind":"base"|"delta"}]},  # B: cir_series + ppop
    "valuation": {"methods":[{"name","bear","base","bull"}], "current_price","fair_median","upside_pct",
                  "metrics":[{"key","label","value","peer_median":None}]},  # B: pb/justified_pb/pe
    "health": {"sub_a":{"series":[{"year","value"}],"peer":[{"label","value"}]},
               "sub_b":{"series":[{"year","value"}],"peer":[{"label","value"}]},
               "sub_c":{"series":[{"year","company","peer"}],"checklist":[{"label","ok":bool}]}},  # B: sub_a,sub_b only
    "dividend": {"series":[{"year","value"}], "yield":float|None, "payout":float|None, "form":str|None}
  },
  "meta": {"periods":[str], "is_estimated_fields":[str], "peer_count":0, "peer_asof":None, "disclaimers":[str]}
}
```
> Dev đọc SPEC §3 (đặc tả từng khối, A vs B) để biết chỉ tiêu nào lấy từ đâu; tái dùng `val()` + kpi modules cho từng series. B1 tính TẤT CẢ series/metric deterministic; để `peer_median=None`/`color=None`/radar `score=None` cho B3.

- [ ] **Step 1: Failing test** — dùng fixture Period thật (tái dùng cách test_bctc dựng periods, hoặc build_periods từ raw rows fixture). Test tối thiểu:
```python
import pytest
from app.services.bctc_dashboard.compute import compute_dashboard

@pytest.mark.asyncio
async def test_compute_nonbank_shape(monkeypatch):
    # monkeypatch fetch_bctc_statements → raw rows của 1 mã phi NH (fixture 5 năm)
    # + fetch_financial_report(ratio) + fetch_company_data → icb/name
    data = await compute_dashboard("FPT", term_type=1)
    assert data["template"] == "A"
    assert len(data["blocks"]["financial"]["stacked_abs"]) >= 3   # 5 năm (ít nhất 3 nếu <5 năm niêm yết)
    assert {"revenue","gross_margin","net_margin"} <= set(data["blocks"]["business"]["revenue_series"][0])
    assert data["blocks"]["valuation"]["methods"]  # football field
    assert data["hero"]["ticker"] == "FPT"
    # peer/color chưa điền ở B1
    assert data["radar"]["dims"][0]["score"] is None
```
(Test bank variant tương tự với fixture mã NH → template "B", blocks.health.sub chỉ a,b.)
- [ ] **Step 2: red** — `uv run pytest tests/test_bctc_dashboard_compute.py -q`.
- [ ] **Step 3: implement** `compute.py` — mirror `service.get_bctc`/`assemble.build_bctc_payload` để load mapping + build periods + detect template/subsector, rồi assemble shape trên. Grid tuyệt đối 5 năm: đọc `val(p, concept)` cho từng năm. Football field: `valuation_nonbank(ratio_rows)`; bank: `valuation_bank(...)`. Route trong market_data.py mirror `get_bctc_dashboard` (public, `@redis_cached("REDIS_TTL_MACRO_SECONDS")`, `fetch_with_fallback([("VCI", _vci)])`).
- [ ] **Step 4: green** + `uv run pytest tests/ -k bctc_dashboard -q`.
- [ ] **Step 5: Commit** — `git commit -m "feat(bctc-dash): compute layer + BctcDashboardData contract + endpoint"`

---

### Task B2: Peer-median service + `sector_median_cache` migration

**Files:**
- Create: `backend/app/services/bctc_dashboard/peer_median.py`, `backend/app/models/sector_median_cache.py`, `backend/alembic/versions/<rev>_add_sector_median_cache.py`
- Modify: `backend/app/models/__init__.py` (export model)
- Test: `backend/tests/test_peer_median.py`, `backend/tests/test_sector_median_cache_model.py`

**Interfaces:**
- Consumes: `vietcap_screening.fetch_screening_paging(page,page_size,sort_fields,sort_orders,filters) -> ({content:[{ticker,market_cap,icb_code_lv2,...}],...}, url)`; `vietcap.fetch_financial_report(symbol, report_type="ratio", period="Y") -> (list[dict], url)` (row có pe,pb,roe + canonical keys); `vietcap.normalize_company_overview` cho icb; `SymbolRepository.get_by_symbol` cho `icb_lv2`.
- Produces: `async def get_sector_medians(db, icb_lv2: str, *, asof: date, top_k: int = 20) -> dict[str, float|None]` (keys: pe, pb, roe, gross_margin, revenue_growth, dividend_yield, net_debt_ebitda, dso... — union các metric B3 cần). Cache hit từ bảng; miss → compute + upsert dưới `pg_advisory_xact_lock`.
- Model `SectorMedianCache`: `id`, `icb_lv2:str(100)`, `asof_date:Date`, `medians:JSONB`, `peer_count:int`, `computed_at`. Unique `(icb_lv2, asof_date)`.

- [ ] **Step 1: Failing tests** (model + service):
```python
# test_peer_median.py
@pytest.mark.asyncio
async def test_get_sector_medians_cache_hit(db_session):
    from app.models.sector_median_cache import SectorMedianCache
    db_session.add(SectorMedianCache(icb_lv2="Công nghệ Thông tin", asof_date=date(2026,7,15),
        medians={"pe":15.2,"pb":2.1,"roe":22.0}, peer_count=18))
    await db_session.flush()
    from app.services.bctc_dashboard.peer_median import get_sector_medians
    m = await get_sector_medians(db_session, "Công nghệ Thông tin", asof=date(2026,7,15))
    assert m["pe"] == 15.2 and m["roe"] == 22.0   # đọc cache, KHÔNG fetch

@pytest.mark.asyncio
async def test_get_sector_medians_miss_computes(db_session, monkeypatch):
    # monkeypatch fetch_screening_paging → 5 peer; fetch_financial_report → ratio rows
    # assert median đúng (median của [pe...]) + upsert 1 row cache + peer_count=5
    ...

@pytest.mark.asyncio
async def test_degrade_few_peers(db_session, monkeypatch):
    # screening trả <3 peer → medians rỗng/None + peer_count<3, không raise
    ...
```
- [ ] **Step 2: red.** **Step 3: implement** — model + migration (`down_revision="f2b7b5c064a3"`, `op.f(...)` naming, JSONB via `postgresql.JSONB`); service: cache lookup → miss: `SELECT pg_advisory_xact_lock(:k)` (k = hash icb_lv2 trong 1 txn) → re-check cache → screening filter ICB (build filter dict cho `icbCodeLv2`; nếu khó, fallback: screening rộng rồi lọc `row["icb_code_lv2"]`), top_k theo market_cap → `asyncio.gather` (Semaphore 5, jitter, per-peer try/except bỏ lỗi) fetch ratio → gom pe/pb/roe/... → `statistics.median` bỏ None → upsert cache. `<3 peer` → medians None + cờ.
- [ ] **Step 4: green** + `uv run pytest tests/ -k "peer_median or sector_median" -q`.
- [ ] **Step 5: Commit** — `git commit -m "feat(bctc-dash): peer-median service (bounded top-K + daily cache + xact-lock) + migration"`

---

### Task B3: Threshold/color + radar scoring (điền vào contract)

**Files:**
- Create: `backend/app/services/bctc_dashboard/benchmark.py`
- Modify: `backend/app/services/bctc_dashboard/compute.py` (gọi benchmark sau compute + peer-median)
- Test: `backend/tests/test_bctc_benchmark.py`

**Interfaces:**
- Consumes: `BctcDashboardData` (B1) + `get_sector_medians` (B2).
- Produces: `def apply_benchmark(data: dict, medians: dict) -> dict` — điền `peer_median` cho mọi metric có key khớp; gán `color` (green/amber/red) theo ngưỡng ngành (`sub_sector`-aware, cấu hình `THRESHOLDS: dict[sub_sector, dict[metric, (green_min, red_max, direction)]]`); tính radar `score` 0–100 mỗi trục (map giá trị↔ngưỡng) + `band` (good/ok/warn). `compute_dashboard` gọi: compute → `get_sector_medians` → `apply_benchmark`, cập nhật `meta.peer_count`/`peer_asof`.

- [ ] **Step 1: Failing test**:
```python
def test_apply_benchmark_colors_and_radar():
    from app.services.bctc_dashboard.benchmark import apply_benchmark
    data = {"template":"A","sub_sector":"san_xuat",
            "radar":{"dims":[{"key":"profitability","label":"Sinh lời","score":None,"band":None,"value_label":""}]},
            "blocks":{"business":{"metrics":[{"key":"roe","label":"ROE","value":24.0,"unit":"%","peer_median":None,"color":None}],
                                  "revenue_series":[], "earnings_quality":{}}}}
    out = apply_benchmark(data, {"roe":12.0})
    m = out["blocks"]["business"]["metrics"][0]
    assert m["peer_median"] == 12.0 and m["color"] == "green"   # roe 24 >> peer 12, cao=tốt
    assert isinstance(out["radar"]["dims"][0]["score"], int)
```
- [ ] **Step 2: red.** **Step 3: implement** — THRESHOLDS theo SPEC §1.1 (ngành phụ điều chỉnh ngưỡng; BĐS nới dòng tiền, bán lẻ CCC âm=tốt...). color-by-direction (metric cao-tốt vs thấp-tốt). radar score = clamp(map giá trị về 0-100 quanh ngưỡng+peer). 
- [ ] **Step 4: green** + `-k benchmark`.
- [ ] **Step 5: Commit** — `git commit -m "feat(bctc-dash): threshold color + radar scoring (sub-sector aware)"`

---

### Task B4: AI narrative layer + endpoint

**Files:**
- Create: `backend/app/services/bctc_dashboard/narrative.py`, `backend/app/services/bctc_dashboard/narrative_prompt.py`, `backend/app/services/bctc_dashboard/narrative_validator.py`
- Modify: `backend/app/api/v1/endpoints/ai_analysis.py` (route `GET /ai/bctc-dashboard/{symbol}`)
- Test: `backend/tests/test_bctc_narrative.py`

**Interfaces:**
- Consumes: `compute_dashboard` (B1-B3, số đã tính) + `proxy_client.chat_completion(system_prompt, user_content, temperature)`.
- Produces: `async def generate_narrative(symbol, *, term_type=1) -> dict` → `{verdict_oneliner, story{lead,paragraphs[3],strengths[],watchlist[]}, blocks{...}}` (key theo template A/B). Route premium (`PremiumUser`), trả `{"data": narrative}`.
- `SYSTEM_PROMPT` = nội dung file `bctc-dashboard/SYSTEM_PROMPT_ai_generate.md` (đọc + nhúng làm hằng). `build_user_content(data)` = JSON metrics (ticker/company_name/template/sub_sector/price/fair_value/metrics{value,unit,history,peer_median,color,is_estimated}).
- `validate_narrative(out, template) -> list[str]`: JSON đúng schema + key theo A/B; cấm FORBIDDEN model-name tokens (altman,z-score,piotroski,f-score,beneish,m-score,dupont,sloan,accrual) ở text người dùng; cấm khuyến nghị (nên mua/bán/giữ/khuyến nghị); story.paragraphs đúng 3; blocks đủ key; retry pattern (như midday/premarket, tối đa 4 attempt).

- [ ] **Step 1: Failing tests** — validator (schema đúng pass; chèn "DuPont"/"nên mua" → error; sai key theo template → error) + generate (mock chat_completion trả JSON hợp lệ → parse + validate == []).
- [ ] **Step 2: red.** **Step 3: implement** — mirror `market_analysis` generator retry loop; narrative_validator theo self-check SPEC. Route mirror `get_bctc_analyze`.
- [ ] **Step 4: green** + `-k narrative` + FULL `uv run pytest -q` (chạm nhiều — full suite bắt buộc).
- [ ] **Step 5: Commit** — `git commit -m "feat(bctc-dash): AI narrative layer (storytelling prompt + validator) + endpoint"`

---

## PHẦN FRONTEND

> **MỌI task FE:** đọc `template_A_phi_ngan_hang_FPT_dark.html` (+ B) trong `backend/docs/superpowers/specs/bctc-dashboard/` làm nguồn layout/SVG/CSS chân lý. Copy cấu trúc SVG/spacing/màu-qua-var từ template; số bind từ `BctcDashboardData`. Tokens dark scope trong `.bctc-dash`.

### Task F1: Dark tokens + chart primitives

**Files:**
- Create: `dashboard/src/features/stock/bctc-dashboard/bctc-dashboard.css` (tokens SPEC §5 scope `.bctc-dash` + font import), `.../charts/{StackedBarAbsolute,ComboBarLine,LineChart,PeerBar,Waterfall,FootballField,RadarScorecard}.tsx`
- Test: `dashboard/src/features/stock/bctc-dashboard/charts/charts.test.tsx`

**Interfaces (props — later tasks bind these):**
- `StackedBarAbsolute({series: {year:number, parts:{label,value,cls}[]}[], yTicks?})` ; `ComboBarLine({bars:{year,value}[], lines:{label,points:number[],cls}[]})`; `LineChart({series:{label,points:{x,y}[],cls}[], threshold?:number})`; `PeerBar({rows:{label,value,marker?:"company"|"median"|"threshold"}[]})`; `Waterfall({steps:{label,value,kind}[]})`; `FootballField({methods:{name,bear,base,bull}[], currentPrice:number})`; `RadarScorecard({dims:{key,label,score,band,value_label}[], score?:number})`. SVG nội tuyến, `fill/stroke="var(--...)"`.
- Produces: các chart component tái dùng cho F2/F3.

- [ ] **Step 1: Failing tests** — mỗi chart render với data mẫu → có `<svg>`, số trục/nhãn đúng số phần tử, dùng `var(--` không hardcode hex (assert className/style tokens). VD:
```tsx
it("StackedBarAbsolute renders one group per year", () => {
  render(<StackedBarAbsolute series={[{year:2024,parts:[{label:"Vốn",value:10,cls:"fill-g"}]},{year:2025,parts:[{label:"Vốn",value:12,cls:"fill-g"}]}]} />)
  expect(screen.getAllByRole("img", { hidden: true }).length).toBeGreaterThan(0) // svg
})
```
- [ ] **Step 2: red → 3: implement** (transcribe SVG structure từ template, tham số hoá) → **4: green** `npx vitest run src/features/stock/bctc-dashboard` + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(bctc-dash-fe): dark tokens + 7 chart primitives (SVG, token-colored)"`

### Task F2: Block/layout components + BLOCK_ORDER config

**Files:**
- Create: `.../components/{HeroCard,AiMemo,QuestionBlock,SubQuestion,DuoPanel,MetricCard,Checklist,Drilldown}.tsx`, `.../blockOrder.ts`
- Test: `.../components/components.test.tsx`

**Interfaces:** theo SPEC §4 (props table). `blockOrder.ts`: `export const BLOCK_ORDER: BlockId[] = [0,1,2,3,4,5,6,7]` (đọc từ config, đổi được). `QuestionBlock({num,title,question,answer,children})` KHÔNG verdict pill; `AiMemo({lead,paragraphs,strengths,watchlist})` KHÔNG nhãn "AI viết"; `SubQuestion({code,question,answer,children})` không tag.
- [ ] Failing tests (render + KHÔNG có verdict badge / nhãn "AI viết") → red → implement (từ template) → green + tsc.
- [ ] Commit — `git commit -m "feat(bctc-dash-fe): block+layout components (no verdict badge, no 'AI viết' label) + BLOCK_ORDER"`

### Task F3: BctcDashboard assembly (A + B) + hooks

**Files:**
- Create: `dashboard/src/features/stock/bctc-dashboard/BctcDashboard.tsx`, `.../types.ts`, `.../hooks.ts` (`useBctcDashboard`, `useBctcDashboardAi`), `.../index.ts`
- Modify: `dashboard/src/features/stock/api.ts` (`getBctcDashboard`, `getBctcDashboardAi`), `dashboard/src/features/stock/keys.ts`
- Test: `.../BctcDashboard.test.tsx`

**Interfaces:**
- `useBctcDashboard(symbol)` → GET `market-data/bctc-dashboard/{sym}` (public, staleTime 5m); `useBctcDashboardAi(symbol)` → GET `ai/bctc-dashboard/{sym}` (premium-gated qua usePremiumStatus, như useBctcAi). Types mirror `BctcDashboardData` + narrative.
- `BctcDashboard({symbol})` — fetch compute; render theo `BLOCK_ORDER`; Khối 0 HeroCard+RadarScorecard, Khối 1 AiMemo (narrative, PremiumGate), Khối 2-7 QuestionBlock + charts (bind data + narrative.blocks answer). Template A vs B rẽ nhánh block 3/4/5/6 theo `data.template`. Loading → Spin; lỗi → thông báo. Footer disclaimer (SPEC §8). Wrap `.bctc-dash`.
- [ ] Failing test: mock `useBctcDashboard`/`useBctcDashboardAi` với fixture A → assert Hero ticker, 6 QuestionBlock tiêu đề, football field, KHÔNG badge verdict; fixture B → block 4 "kiếm tiền" (NIM), health 2 sub. → red → implement → green + tsc + `npm run build`.
- [ ] Commit — `git commit -m "feat(bctc-dash-fe): BctcDashboard assembly A/B + compute/AI hooks"`

### Task F4: Wire inline + verify

**Files:**
- Modify: `dashboard/src/features/home-workspace/FinancialAnalysisView.tsx` (navigate→inline, mirror StockAnalysisView + `key={symbol}`)
- Test: `dashboard/src/features/home-workspace/AnalysisViews.test.tsx` (đổi case Financial: submit → render BctcDashboard inline, KHÔNG navigate)

**Interfaces:** Consumes `BctcDashboard` (F3). `FinancialAnalysisView`: `useState<string|null>` + `onSubmit={setSymbol}` + `result={symbol ? <BctcDashboard key={symbol} symbol={symbol} /> : undefined}`.
- [ ] Failing test: submit "vcb" → `data-testid` BctcDashboard mount với symbol VCB, `navigate` KHÔNG gọi. Mock `@/features/stock` BctcDashboard. → red → implement → green.
- [ ] **Full gates:** `npx vitest run` + `npx tsc --noEmit` + `npm run build`; backend `uv run pytest -q`. Tất cả xanh.
- [ ] Commit — `git commit -m "feat(bctc-dash-fe): wire BCTC dashboard inline vào tab trang chủ"`

---

### Task T9: Verify toàn cục + smoke

- [ ] Full gates lại (BE + FE) xanh.
- [ ] Smoke (local be+fe, Playwright): tab BCTC nhập mã phi-NH (FPT) → dashboard dark hiện đủ khối (hero+radar, câu chuyện, định giá football field, bức tranh tài chính stacked-abs, kinh doanh combo, tiền waterfall, sức khỏe duopanel, cổ tức); nhập mã NH (VCB) → template B (NIM, CIR, nợ xấu). AI memo hiện (hoặc PremiumGate nếu chưa login). KHÔNG verdict badge, KHÔNG tên mô hình học thuật ở text. Peer bars có số (hoặc cờ "thiếu peer"). Dark đọc tốt.
- [ ] Ghi finding nếu peer-median chậm/429 thực tế.

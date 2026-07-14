# BCTC Storytelling Dashboard — Design Doc (P3)

**Ngày:** 2026-07-14 · **Nguồn chân lý:** `specs/bctc-dashboard/SPEC_dashboard_bctc.md` (PO) + `SYSTEM_PROMPT_ai_generate.md` + `template_A_phi_ngan_hang_FPT_dark.html` / `template_B_ngan_hang_VCB_dark.html`.
**Mục tiêu:** Dashboard phân tích BCTC "kể chuyện 2 lớp", dark theme, inline trên trang chủ tab "Phân tích BCTC".

## Quyết định đã chốt (user 2026-07-14)

1. **Inline trên trang chủ** tab BCTC (đồng bộ P2): nhập mã → render dashboard editorial mới ngay trong content-area 980px. `/co-phieu` tab Tài chính GIỮ `BctcAnalysis` forensic hiện có (KHÔNG đụng).
2. **Peer-median đầy đủ nhưng bounded+cached:** trung vị ngành THẬT, giới hạn top-K (~15–20 mã vốn hoá lớn nhất trong ICB-lv2) + cache 1 lần/ngày/ngành. Dùng ratio endpoint (~2 call/mã), KHÔNG get_bctc (5 call). Tránh 429.

## Build-vs-reuse (từ recon)

**TÁI DÙNG (không viết lại):**
- Fetch 3 báo cáo nhiều năm + merge: `vietcap.fetch_bctc_statements` → `statements.build_periods()` (Period newest-first).
- Sector router: `bctc/sector.detect_template` (A/B) + `bctc/subsector.detect_subsector` (7 ngành phụ).
- Concept mapping `mapping/{nonbank,bank}.yaml` + `val(period, concept)`; kpi modules (`kpi_nonbank*`, `kpi_bank*`), DuPont, forensic (Altman/Piotroski/Beneish), valuation (`valuation_nonbank`/`valuation_bank`: P/E band, RIM, book floor, justified P/B, NIM×CoR).
- Peer list: `vietcap_screening.fetch_screening_paging` filter theo ICB → ticker + market_cap.
- Frontend inline host: `AnalysisEntryView` `result` slot (đã có từ P2) — `FinancialAnalysisView` đổi từ navigate → render dashboard inline như StockAnalysisView.
- AI proxy: `proxy_client.chat_completion` (DeepSeek).

**XÂY MỚI:**
- **Compute layer mới** `bctc_dashboard/` — assemble payload block-oriented (5-year absolute BS/IS/CF grids + series mỗi khối + hero + radar dims). KHÔNG sửa `build_bctc_payload` cũ.
- **Peer-median service** `bctc_dashboard/peer_median.py` — bounded top-K + cache theo (ICB-lv2, ngày).
- **AI narrative layer** — prompt mới theo `SYSTEM_PROMPT` → `{verdict_oneliner, story, blocks{...}}` (khác memo forensic hiện có).
- **Frontend** `features/stock/bctc-dashboard/` — dark editorial, 14 component, block config, SVG chart nội tuyến.

## Kiến trúc backend

Pipeline (theo SPEC §6): fetch statements → router (template A/B + sub_sector) → **compute** (deterministic, 5 năm) → **benchmark** (peer median) → **threshold** (gán màu green/amber/red) → **AI** (narrative từ số đã tính) → payload.

### Contract: `GET /market-data/bctc-dashboard/{symbol}` (public, redis-cacheable)
Trả `BctcDashboardData` (deterministic, KHÔNG có chữ AI):
```
{
  template: "A"|"B", sub_sector: str,
  hero: { ticker, name, exchange, sector, price, fair_value, upside_pct },
  radar: { dims: [{key,label,score_0_100,band:"good"|"ok"|"warn",value_label}] },  // 5 trục theo template
  blocks: {
    valuation:  { methods:[{name,bear,base,bull}], current_price, fair_median, upside_pct, peer:{...} } // A: football field; B: pb/justified_pb/pe + peer bars
    financial:  { stacked_abs:[{year,equity,other_liab,debt}], growth_sources:[{label,amount,pct}], totals:[{label,value,mult}], asset_mix:[{label,pct}] }  // B: loans/deposits variant
    business:   { revenue_series:[{year,revenue,gross_margin,net_margin}], metrics:[{key,value,peer_median,color}], earnings_quality:{core_pct,oneoff_pct,peer} } // B: nim_series + income_mix
    cashflow:   { profit_vs_cash:[{year,profit,cfo}], metrics:[cfo_ni,fcf_rev,accruals], waterfall:[steps] } // B: cir_series + ppop
    health:     { sub_a:{netdebt_ebitda_series, debt_equity_peer}, sub_b:{interest_cover_series, liquidity_peer}, sub_c:{dso_series_vs_peer, checklist:[{label,ok}]} } // B: sub_a npl_series+3%, sub_b coverage metrics
    dividend:   { series:[{year,value}], yield_peer, payout, form? }
  },
  meta: { periods:[...], is_estimated_fields:[...], peer_count:int, peer_asof:date, disclaimers:[...] }
}
```
Mọi số từ compute layer; `color` do threshold layer gán theo ngưỡng ngành (`sub_sector`). `peer_median` từ peer-median service.

### Peer-median service (`bctc_dashboard/peer_median.py`)
```
get_sector_medians(icb_lv2: str, *, asof: date, top_k=20) -> dict[metric,float]
```
- Peer list: `fetch_screening_paging` filter ICB-lv2 = target's, sort market_cap desc, lấy top_k. (target's ICB từ `symbols` table hoặc `fetch_company_data`.)
- Sweep: mỗi peer `fetch_financial_report(report_type="ratio")` (~1-2 call), trích các ratio cần (pe, pb, roe, gross_margin, revenue_growth, dividend_yield, net_debt_ebitda, dso...). Semaphore(5) + jitter + backoff (bài học Yahoo 429).
- **Cache:** kết quả median theo key `(icb_lv2, asof_date)` — 1 lần/ngày/ngành. Bảng mới `sector_median_cache` (migration) HOẶC redis (nhưng REDIS_ENABLED=False mặc định → dùng bảng DB cache an toàn hơn). Chọn **bảng `sector_median_cache`**: `(icb_lv2, asof_date, medians_json, computed_at)` unique(icb_lv2,asof_date). Miss → compute + upsert; hit → trả ngay. Advisory lock khi compute để tránh N request đồng thời cùng quét 1 ngành (dùng **`pg_advisory_xact_lock`** — theo bài học [[iqx-advisory-lock-leak]], KHÔNG session-level).
- Bound + degrade: peer < 3 → trả median rỗng + cờ "thiếu peer"; sweep timeout/lỗi 1 peer → bỏ peer đó, không fail cả cụm.

### AI narrative: `GET /ai/bctc-dashboard/{symbol}` (premium, redis-cache 7d client)
- Input = `BctcDashboardData.blocks` + metrics (số đã tính) → prompt `SYSTEM_PROMPT_ai_generate.md` → output JSON `{verdict_oneliner, story{lead,paragraphs[3],strengths[],watchlist[]}, blocks{valuation,financial,business/earning,cashflow/efficiency,health/asset_quality{answer,sub},dividend}}`.
- Validator: JSON schema đúng (key theo template A/B), KHÔNG tên mô hình học thuật (Altman/DuPont/Sloan...) ở text người dùng, KHÔNG khuyến nghị mua/bán, mọi số phải có trong input (chống bịa). Retry pattern như midday/premarket.

## Kiến trúc frontend

`features/stock/bctc-dashboard/BctcDashboard.tsx` — nhận `{symbol}`, fetch compute (`useBctcDashboard`) + AI (`useBctcDashboardAi`, premium-gated). Render theo `BLOCK_ORDER` (config, mặc định `[0,1,2,3,4,5,6,7]`, dễ đổi sang `[0,1,3,4,5,6,2,7]`). Dark tokens riêng (SPEC §5) — scope trong `.bctc-dash` wrapper, KHÔNG đụng token app toàn cục (dashboard này cố định dark như modal AI Insight).

**14 component tái dùng** (SPEC §4): HeroCard, RadarScorecard, AiMemo, QuestionBlock, SubQuestion, DuoPanel, ComboBarLine, StackedBarAbsolute, LineChart, PeerBar, MetricCard, Waterfall, FootballField, Checklist, Drilldown. SVG nội tuyến, màu qua CSS var (SPEC §5 — cấm hardcode màu trong SVG).

**Inline host:** `FinancialAnalysisView` (home tab BCTC) đổi từ navigate → `AnalysisEntryView` `result={symbol ? <BctcDashboard symbol/> : undefined}` (mirror StockAnalysisView P2, `key={symbol}` remount). Không premium-gate toàn bộ (compute public); chỉ AI memo trong dashboard bọc PremiumGate.

Checklist khớp mẫu: dark, không verdict badge, khối 1 không nhãn "AI viết", khối 3A stacked-abs + nguồn tăng trưởng + asset mix hiện trực tiếp, khối 4A chất lượng LN trực tiếp, khối 6 câu văn không badge, không tên mô hình ở lớp người dùng, BLOCK_ORDER từ config.

## Phân rã (preview — plan sẽ chi tiết)

Backend: (B1) compute layer + `BctcDashboardData` contract + endpoint; (B2) peer-median service + `sector_median_cache` migration + xact-lock; (B3) threshold/color + radar scoring; (B4) AI narrative prompt + validator + endpoint.
Frontend: (F1) dark tokens + chart primitives (StackedBarAbsolute, ComboBarLine, LineChart, PeerBar, Waterfall, FootballField, RadarScorecard); (F2) block components (Hero, AiMemo, QuestionBlock, SubQuestion, DuoPanel, MetricCard, Checklist, Drilldown) + BLOCK_ORDER config; (F3) BctcDashboard assembly A/B + hooks; (F4) wire FinancialAnalysisView inline + verify.

## Không làm (v1)
- Không đụng `BctcAnalysis` forensic ở /co-phieu (song song tồn tại).
- Không light-theme cho dashboard này (cố định dark theo SPEC; token tách riêng, hỗ trợ light sau).
- Không thuyết minh (chỉ 3 BCTC) — chỉ tiêu cần thuyết minh gắn `is_estimated` + ghi chú (SPEC §7).
- Không khuyến nghị mua/bán (SPEC §8).

## Rủi ro
- Peer-median sweep: dù bounded+cached, lần miss đầu/ngày/ngành vẫn ~20×2 call. Nén bằng semaphore+backoff+xact-lock (1 worker quét/ngành). Nếu VCI 429 → degrade peer rỗng + cờ, dashboard vẫn hiện lịch sử 5 năm.
- AI narrative bịa số: validator chặn (mọi số phải khớp input) — bài học premarket.
- Frontend lớn (14 component + 2 template) — chia F1..F4, chart primitives trước.

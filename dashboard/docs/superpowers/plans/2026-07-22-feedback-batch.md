# Feedback batch 2026-07-22 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Session-tab own-old-brief fallback; nav gom "Demo Trading"→/dau-truong; AI-insight L3/L4 10-trading-session window + L5 relabel/one-per-line/window; number format app-wide en-US.

**Architecture:** Mostly targeted edits at recon-identified sites; one mechanical app-wide number-format sweep. Design: `docs/superpowers/specs/2026-07-22-feedback-batch-design.md`.

**Tech Stack:** React 19 + Arco + Vitest/RTL (FE); FastAPI + pytest (BE).

## Global Constraints
- Number format target: **comma thousands + period decimal** (en-US), e.g. `1,234,567.89`, `35,000`. Grep-gate: after T4, `grep -rn 'toLocaleString("vi-VN")' dashboard/src` (non-test) MUST be 0.
- Session-tab: brief cũ hiển thị KHÔNG có countdown live (`showCountdown/showAtoCountdown = isDataForToday` giữ nguyên). Chỉ `!data` (chưa từng có) → "đang xử lý".
- L5 labels VERBATIM: "Tin trọng yếu" (was material), "Tin phụ" (was filler/filler).
- Không đụng route `/bang-gia`,`/co-phieu`,`/chien-luoc` (giữ sống, chỉ bỏ khỏi NAV_ITEMS).
- Số narrative AI (`[num]…[/num]`) do LLM sinh — KHÔNG chạm formatter.

---

### Task T1: Nav "Demo Trading" + session-tab own-old-brief fallback
**Files:**
- Modify: `dashboard/src/features/navigation/Header.tsx` (`NAV_ITEMS`)
- Modify: `dashboard/src/features/market-overview/premarket/PreMarketView.tsx` (~262-308 stale gate), `dashboard/src/features/market-overview/midday/MidDayView.tsx` (~94-130 stale gate)
- Test: update `dashboard/src/features/navigation/*Header*.test.tsx` (nav items); premarket/midday view tests (stale → own brief, not EOD)

- [ ] **Step 1: failing tests** — Header: NAV_ITEMS has "Demo Trading"→"/dau-truong", NO "Biểu đồ"/"Bảng giá"/"Cổ phiếu"/"Chiến lược". PreMarketView: given a stale (session_date≠today, weekday) brief with data → renders the premarket brief content (e.g. its headline) + a "cũ"/stale banner, does NOT render MarketDailyPage; countdown hidden. Same for MidDayView.
- [ ] **Step 2: red.**
- [ ] **Step 3: implement**
  - Header `NAV_ITEMS`: replace the 4 entries (Biểu đồ/Bảng giá/Cổ phiếu/Chiến lược) with a single `{ label: "Demo Trading", href: "/dau-truong" }`. Final order: Trang chủ · Demo Trading · Kiến thức · Giới thiệu.
  - PreMarketView: change `if (!data || isStaleOnWeekday) → notice + <MarketDailyPage/>` to: `if (!data) → "đang xử lý" notice` (keep) ELSE render the premarket brief normally, and when `!isDataForToday` show a stale banner (reuse the "· cũ" visual language: e.g. a muted pill "Bản gần nhất {formatSessionDate(data.session_date)} · chưa cập nhật hôm nay"). Drop the `isStaleOnWeekday → MarketDailyPage` fallback entirely. Keep `showAtoCountdown = isDataForToday`.
  - MidDayView: same change (stale midday brief renders itself + banner, not EOD; `showCountdown = isDataForToday`).
- [ ] **Step 4: green** `npx vitest run src/features/navigation src/features/market-overview` + `npx tsc --noEmit`.
- [ ] **Step 5: verify data prod (read-only):** `curl` the 3 `/market-analysis/{daily,midday,premarket}/latest` on iqx.vn — record session_date each; note if any session stale (report, don't fix backend here).
- [ ] **Step 6: Commit** — `feat(fe): nav gom Demo Trading→/dau-truong + tab Trước/Giữa phiên hiện brief cũ của chính nó (không rơi cuối phiên)`

---

### Task T2: BE — L3/L4 10-trading-session window + L5 relabel + news window
**Files:**
- Modify: `backend/app/services/ai/analysis_service.py` (`_build_raw_input` windows), `backend/app/services/ai/insight_response.py` (`_layer_fields_l5` labels + `_build_l5_news`), `backend/app/services/ai/payloads.py` (`build_insight_payload` news window if needed), `backend/docs/ai/ai-insight.md` (prompt: "7 ngày"→"10 phiên"; label wording)
- Test: `backend/tests/` (insight window + L5 label tests — find existing insight test file)

- [ ] **Step 1: failing tests** — `_build_raw_input`: foreign/proprietary each return the **last 10 trading dates** (aligned to the trading-history date set), zero-filled for dates with no flow row (not just `items[:10]` which may skip no-activity dates); insider likewise 10. `_layer_fields_l5`: field labels are "Tin trọng yếu" and "Tin phụ" (not "Tin material"/"Tin filler").
- [ ] **Step 2: red.**
- [ ] **Step 3: implement**
  - `_build_raw_input`: build the reference trading-date list from `trading_history`/`supply_demand` (newest 10 dates). For foreign & proprietary, index their rows by date and emit exactly those 10 dates in order, zero-filling (value 0 / net 0) any date absent from the flow array. Change the `[:15]` slices → 10-date-aligned. (If the foreign/prop arrays already contain one row per trading date with no gaps, a plain `[:10]` after date-align is fine — but the align+zero-fill guarantees "last 10 calendar sessions".) Insider: `[:10]` by date too (insider deals are sparse — for insider keep "last 10 deals" is wrong per feedback; window to deals within the last-10-trading-session date range, else empty).
  - `_layer_fields_l5`: rename the two field labels → "Tin trọng yếu" / "Tin phụ".
  - News window: prompt `ai-insight.md` "7 ngày gần nhất" → "10 phiên gần nhất"; ensure `fetch_news_list(page_size=…)` covers ~10 sessions (bump page_size if 10 is too few to span 10 sessions).
- [ ] **Step 4: green** `uv run pytest tests/ -k insight -q` then FULL `uv run pytest -q`.
- [ ] **Step 5: Commit** — `feat(be): AI-insight L3/L4 cửa sổ 10 phiên gần nhất (zero-fill) + L5 nhãn "Tin trọng yếu"/"Tin phụ" + tin 10 phiên`

---

### Task T3: FE — NewsList headers + one-per-line + chart titles
**Files:**
- Modify: `dashboard/src/features/stock/ai-insight/NewsList.tsx` (headers "Tin trọng yếu"/"Tin phụ" + filler one-per-line), `dashboard/src/features/stock/ai-insight/LayerCharts.tsx` (titles "15 phiên"→"10 phiên")
- Test: `NewsList.test.tsx` (both sections one-per-line + headers)

- [ ] **Step 1: failing tests** — NewsList: renders a "Tin trọng yếu" section header + a "Tin phụ" section header; BOTH material and filler items each render on their own line (a per-item block, not inline chips). LayerCharts: chart titles read "Nước ngoài (10 phiên)" / "Tự doanh (10 phiên)".
- [ ] **Step 2: red → 3: implement** — NewsList: add section headers; change filler from inline `span.filler-item` chips to one-per-line blocks like material (`div.news-item`). LayerCharts: "15 phiên"→"10 phiên" in the two ChartBlock titles.
- [ ] **Step 4: green** `npx vitest run src/features/stock/ai-insight` + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(fe): NewsList header "Tin trọng yếu"/"Tin phụ" + mỗi tin một dòng + chart title 10 phiên`

---

### Task T4: FE — number format app-wide en-US sweep
**Files:**
- Modify: `dashboard/src/shared/lib/format.ts` (vi-VN→en-US in fmtNumber/fmtVnd/fmtPrice/fmtPercent/fmtCompact) + ALL inline `toLocaleString("vi-VN")` / `Intl.NumberFormat("vi-VN")` sites (~79) + local dupes (`ai-insight/HeaderStrip.tsx`, `features/stock/components/StockAiInsightCharts.tsx`, `premarket/PreMarketView.tsx` world cell)
- Test: `shared/lib/format.test.ts` (fmtNumber(1234567.89) → "1,234,567.89"; fmtNumber(35000)→"35,000")

- [ ] **Step 1: failing test** — `format.test.ts`: `fmtNumber(1234567) === "1,234,567"`, `fmtPrice(1234.5) === "1,234.50"`, `fmtNumber(35000) === "35,000"`. (comma thousands, period decimal.)
- [ ] **Step 2: red.**
- [ ] **Step 3: implement** — sweep: replace every `toLocaleString("vi-VN")` → `toLocaleString("en-US")` and `Intl.NumberFormat("vi-VN"…)` → `"en-US"` across `dashboard/src` (grep to enumerate; ~79 sites). Update `format.ts` helpers. Keep `fmtCompact` suffixes (Tỷ/Tr/N) but ensure the numeric part uses period decimal (en-US). Do NOT touch test files' fixtures unless they assert vi-VN formatting (update those assertions to en-US). Do NOT touch `[num]` narrative rendering (LLM strings).
- [ ] **Step 4: green** — grep-gate: `grep -rn 'toLocaleString("vi-VN")\|NumberFormat("vi-VN")\|NumberFormat(.vi-VN' dashboard/src --include=*.ts --include=*.tsx | grep -v '.test.' ` → 0. Then `npx vitest run` (FULL — sweep touches many features) + `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 5: Commit** — `feat(fe): format số toàn app en-US (nghìn dấu phẩy, thập phân dấu chấm)`

---

### Task T5: Verify + smoke
- [ ] Full gates: `uv run pytest -q` (BE) + `npx vitest run` + `npx tsc --noEmit` + `npm run build` (FE) — xanh.
- [ ] Grep-gate number sweep = 0 (per T4).
- [ ] Smoke (local be+fe, Playwright): (A) home Trước/Giữa phiên khi brief cũ → hiện brief đó + banner "cũ", KHÔNG cuối phiên, không countdown; (B) top-nav có "Demo Trading"→/dau-truong, không còn Biểu đồ/Bảng giá/Cổ phiếu/Chiến lược; (C) AI Insight 1 mã: L3/L4 "10 phiên", L5 "Tin trọng yếu"/"Tin phụ" mỗi tin 1 dòng; số hiển thị comma-nghìn/period-thập-phân (giá, chỉ số).
- [ ] Ghi finding (L3/L4 zero-fill có đúng 10 phiên lịch? số nào sót vi-VN?).

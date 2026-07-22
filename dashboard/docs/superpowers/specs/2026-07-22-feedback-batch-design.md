# Feedback batch 2026-07-22 — Design Doc

Punch-list 3 nhóm (ảnh feedback). Recon đã map hiện trạng; quyết định user đã chốt.

## Quyết định đã chốt (user 2026-07-22)
- **Nav "Demo Trading" → `/dau-truong`** (Cap0 demo). Gom 4 mục Biểu đồ/Bảng giá/Cổ phiếu/Chiến lược thành 1 mục "Demo Trading". Route `/bang-gia`,`/co-phieu`,`/chien-luoc` GIỮ (chỉ bỏ khỏi top-nav).
- **Format số TOÀN APP:** nghìn = dấu phẩy, thập phân = dấu chấm (`35,000` · `7.2M`) — tức en-US style thay cho vi-VN hiện tại (1.234,56 → 1,234.56).

## A. Session tabs — hiện brief cũ của chính tab (không rơi về EOD)
- Hiện tại (`PreMarketView.tsx` ~286, `MidDayView.tsx` ~107): `if (!data || isStaleOnWeekday) → render notice + <MarketDailyPage/>` → rơi về **cuối phiên**.
- Đổi: bỏ nhánh `isStaleOnWeekday → EOD`. Khi brief hôm nay CHƯA có nhưng có brief cũ → render **chính `data` cũ đó** + banner "· cũ / bản gần nhất {session_date}, chưa cập nhật hôm nay" (mẫu như path cuối tuần đã chạy). Giữ `showCountdown/showAtoCountdown = isDataForToday` (không đếm ngược cho brief cũ → không gây hiểu nhầm live). Chỉ khi `!data` (chưa từng có brief nào) mới hiện "đang xử lý".
- Kiểm dữ liệu prod: 3 endpoint `/market-analysis/{daily,midday,premarket}/latest` — ghi ngày có/không báo cáo (midday từng kẹt lock, đã fix 07-14).

## B. Nav consolidation
- `features/navigation/Header.tsx` `NAV_ITEMS`: gộp item 2-5 → `{ label:"Demo Trading", href:"/dau-truong" }`. Kết quả: Trang chủ · Demo Trading · Kiến thức · Giới thiệu. Active-state dùng `pathname.startsWith` sẵn có. Mobile+desktop tự cập nhật (cùng 1 array).

## C. AI Insight per-stock (L3/L4/L5 + số)
- **L3/L4 window (backend `analysis_service._build_raw_input`):** hiện `moneyFlow.foreign/proprietary = items[:15]` (nước ngoài + tự doanh); `insider = items[:15]`. Đổi → **10 phiên GẦN NHẤT theo lịch giao dịch** (không phải 10 dòng API trả — nếu API bỏ ngày không hoạt động thì phải align theo trading-date của `trading_history` + zero-fill ngày thiếu). Đổi số 15→10. FE chart title "Nước ngoài (15 phiên)"/"Tự doanh (15 phiên)" → "(10 phiên)".
- **L5 relabel (backend `insight_response._layer_fields_l5`):** field label "Tin material" → **"Tin trọng yếu"**, "Tin filler" → **"Tin phụ"**. NewsList (FE) thêm header "Tin trọng yếu"/"Tin phụ" tương ứng.
- **L5 window:** prompt `docs/ai/ai-insight.md` "7 ngày gần nhất" → "10 phiên gần nhất"; `payloads.build_insight_payload` `fetch_news_list(page_size=10)` — giữ/nới để phủ ~10 phiên.
- **L5 one-per-line (FE `NewsList.tsx`):** "Tin phụ" (filler) hiện là chip inline → đổi **mỗi tin xuống 1 dòng** (giống material).
- **Number format toàn app:** sweep `toLocaleString("vi-VN")` (~79 site) + `Intl.NumberFormat("vi-VN")` + `shared/lib/format.ts` + dupe cục bộ (HeaderStrip, StockAiInsightCharts, PreMarketView world cell) → `"en-US"` (comma-nghìn/period-thập-phân). Số narrative do AI viết đã comma sẵn (prompt) — không đụng. `fmtCompact` giữ hậu tố Tỷ/Tr (VN) nhưng số trước hậu tố dùng period-thập-phân.

## Phân rã (plan chi tiết)
- **T1 (FE):** Nav gom "Demo Trading"→/dau-truong (B) + session-tab own-old-brief fallback (A). + verify data prod.
- **T2 (BE):** L3/L4 10-trading-session window (zero-fill) + L5 relabel source ("Tin trọng yếu"/"Tin phụ") + L5 news 10-session window + prompt lookback.
- **T3 (FE):** NewsList headers + one-per-line + chart title "10 phiên".
- **T4 (FE):** number-format sweep vi-VN→en-US toàn app (format.ts + inline sites + dupes).
- **T5:** verify (BE+FE gates) + smoke (session tab cũ, nav, AI insight L3/L4/L5, số format).

## Rủi ro
- Number sweep ~79 site: dễ sót/format regression → grep-gate `toLocaleString("vi-VN")` = 0 sau sweep; test format helper. "7.2M" hậu tố: giữ Tỷ/Tr, chỉ đổi separator.
- L3/L4 trading-date align: cần nguồn lịch phiên (trading_history dates) để zero-fill — nếu API foreign/prop đã trả đủ ngày thì chỉ đổi 15→10; xác minh khi build.
- Nav bỏ Bảng giá/Cổ phiếu/Chiến lược khỏi top-nav: route còn sống, nhưng mất lối vào trực tiếp — user đã chấp nhận.

# IQX Demo Trading — Cấp 0 «Nhập môn» — Design Doc

**Ngày:** 2026-07-21 · **Nguồn chân lý:** `specs/cap0/IQX-Cap0-Spec.md` (PO v2.2) + `iqx-cap0-pc.html` / `iqx-cap0-mobile.html` (layout).
**Mục tiêu:** Lớp onboarding game-hoá "Cấp 0" chồng lên hệ giao dịch ảo (virtual-trading) hiện có — dạng DELTA.

## Quyết định đã chốt (user 2026-07-21)

1. **Cap 0 mở cho FREE** — bỏ premium-gate ở OrderEntry KHI đang trong Cap 0 / Sân tập (người mới tập đặt lệnh ảo miễn phí). Gate quay lại ở Thực chiến / Cap 1.
2. **Route Demo Trading MỚI** — tạo route riêng (đề xuất `/dau-truong`; chốt tên khi plan) gói CenterPanel(chart) + RightSidebar + RightToolbar hiện có làm khung Cap 0; journey bar + tab Hành trình + badge chế độ sống ở đó.
3. **250tr fresh cho Cap 0, T0 Sân tập; T+2.5 DEFER** — seed/dùng tài khoản ảo 250tr cho Cap 0 (không đổi default hệ thống 1 tỷ của Đấu trường ảo hiện có). Giữ engine T0/T2; T+2.5 là chuyện Thực chiến/Cap 1 (ngoài scope).
4. **Full spec scope**: Chặng 1 (①) + Chặng 3 (⑤⑥) + tốt nghiệp + huy hiệu + kiến trúc (tab Hành trình, journey bar, gbar, mode badge, ẩn-theo-cấp, câu hỏi xếp lớp, cap0_progress). **Chặng 2 (tour ②③④) = 3 slot `locked`, KHÔNG code nội dung.**

## Build-vs-reuse (từ recon 2026-07-21)

**✅ TÁI DÙNG (đã production — KHÔNG dựng lại, chỉ gắn/ẩn):**
- Engine giao dịch ảo: backend `app/services/virtual_trading/` (place_order khớp mua/bán, holdings, T0/T2, ledger, leaderboard), models `app/models/virtual_trading.py` (`VirtualTradingConfig` có `initial_cash_vnd`, `settlement_mode` T0/T2; `VirtualOrder/Position/Account/Trade`), endpoints `/api/v1/virtual-trading/*`, admin `/admin/config` (chỉnh balance/settlement).
- Panel đặt lệnh: `dashboard/src/features/trading/TradingPanel.tsx` — `OrderEntry` (MUA/BÁN, MP/LO, ô Giá, phí, quick-fill), `OrderBookView` (bid/ask), `AccountStrip` (số dư/kích hoạt), `StockHeader` (Trần/Sàn/TC + ★). Hooks `features/trading/hooks.ts` (`usePlaceOrder`, `useActivateAccount`, `usePortfolio`, `useOrders`), api `features/trading/api.ts`.
- Danh mục: `dashboard/src/features/watchlist/WatchlistPanel.tsx` — 3 tab Theo dõi/Nắm giữ (4 ô sức khỏe `SummaryCard`)/Lịch sử + `PortfolioAnalysisButton`. `useWatchlistToggle` (★).
- Shell: `RightSidebar.tsx` + `RightToolbar.tsx` (tabs: trading/watchlist/news/patterns; AI Phân tích = toolbar button). Chart `features/dashboard/chart/`, bảng giá `features/price-board/`.

**🟢 XÂY MỚI (0 dòng hiện có — toàn bộ lớp game-hoá):**
- `features/cap0/` (mới): câu hỏi xếp lớp (modal), badge chế độ `SÂN TẬP·T+0`, tab 🎯 Hành trình, journey bar sticky, khối "Kế hoạch" (chip lý do + preset SL/TP + ghi chú), thanh `.gbar` bền vững (state machine 3 bước/nhiệm vụ), màn Kết sổ, màn Tốt nghiệp, huy hiệu SVG (`badge()` §12 có sẵn code — port).
- Backend: bảng `cap0_progress` + `user_placement` (migration mới), cột `mode` (`san_tap`/`thuc_chien`) vào bảng lệnh ảo, seeding tài khoản Cap 0 250tr, endpoints progress/placement, sự kiện analytics (§10).

**🟡 ẨN THEO CẤP (bọc điều kiện, KHÔNG xoá):** OrderBookView, ô Giá, dropdown MP/LO (mở ở ⑤), tab Tin tức + AI Mẫu nến (mở ở Cap 1). §8.

**🔵 GẮN EVENT (không sửa logic):** `usePlaceOrder` success → gbar bước 2/3 + đánh dấu; `useWatchlistToggle` → nhiệm vụ ① done; bán khớp → mở Kết sổ (⑥); `keydown` ô cắt lỗ → cổng chất lượng ⑤.

## Kiến trúc

### Cap 0 state (frontend + backend)
- **`cap0_progress`** (backend, 1 dòng/user): entered_at, virtual_balance_init (250tr), task_1..6_done_at, task1_star_clicked, task5_sl_typed (cổng 1), task6_debrief_done (cổng 2), graduated_at, time_to_graduate_hours (§10).
- **`user_placement`**: câu trả lời "đã từng mua CP chưa" + cấp được xếp. Modal chỉ hiện 1 lần (§3).
- FE: `useCap0Progress()` hook (query + mutate mỗi khi task/gate xong) là nguồn state cho journey bar/tab/gbar. Placement/graduation là các mốc mutate.

### Route + shell (quyết định #2)
- Route mới (vd `/dau-truong`) → `Cap0TradingPage` gói `CenterPanel` + `RightSidebar` + `RightToolbar` hiện có + chrome Cap 0 (journey bar sticky trên, gbar dưới journey bar, mode badge góc màn hình). Tab 🎯 Hành trình = panel MỚI đứng ĐẦU trong RightSidebar/RightToolbar (thêm id `journey`), là view mặc định.
- Preselect mã **VNM** khi vào Cap 0 lần đầu (URL param / trạng thái mặc định của panel đặt lệnh).

### Ungate (quyết định #1)
- `OrderEntry` bọc `GatedOrderEntry` (premium). Trong ngữ cảnh Cap 0 Sân tập: bỏ gate — hoặc prop `bypassGate` khi mode=san_tap & đang Cap 0, hoặc điều kiện gate `isPremium || (isCap0 && sanTap)`. KHÔNG đụng gate ở /bieu-do & /co-phieu thường (giữ premium).

### Balance/settlement (quyết định #3)
- Cap 0 dùng tài khoản ảo Sân tập 250tr T0. Cơ chế: khi user vào Cap 0 lần đầu → activate/seed account với config Cap 0 (initial_cash 250tr, mode san_tap, settlement T0). KHÔNG đổi `VirtualTradingConfig.initial_cash_vnd` default (giữ 1 tỷ cho Đấu trường ảo hiện có). Cột `mode` phân biệt lệnh Cap 0 (san_tap) vs Thực chiến — `isCountedForProgress` chỉ tính thuc_chien.

### Huy hiệu SVG
- Port `badge()` §12 (SVG hexagon tiến hoá) + `LEVELS[]`. 3 vị trí: header pill, đầu tab Hành trình (ring progress), màn tốt nghiệp (glow 120px). **Font Space Grotesk** (badge số + Kết sổ P&L) — app KHÔNG load → THÊM `@font-face`/Google import (scope trong Cap 0) hoặc thay bằng font bold hiện có; chốt ở plan (đề xuất: thêm Space Grotesk, nó là chủ đích thiết kế).

### gbar state machine
- `.gbar` sticky, nội dung Ở LẠI đến khi xong bước, tự cập nhật, làm sai → đỏ+rung 0.3s+`⚠`, ~1.6s về vàng nhưng vẫn ở đó, xong nhiệm vụ → biến mất. Bước nhiệm vụ ① (3 bước) + ⑤ (2 bước) §6. Phân biệt 3 lớp: spotlight (tour, Chặng2 sau) / gbar (huấn luyện thao tác) / toast (xác nhận).

## Phân rã dự kiến (plan sẽ chi tiết)
- **BE1**: migration `cap0_progress` + `user_placement` + cột `mode`; endpoints progress/placement; seed 250tr Cap0 account.
- **FE1**: `features/cap0/` scaffolding — types, `useCap0Progress`/`usePlacement` hooks, badge() SVG + LEVELS, mode badge, Space Grotesk.
- **FE2**: câu hỏi xếp lớp (modal 1-lần) + route/shell `Cap0TradingPage` + preselect VNM.
- **FE3**: tab 🎯 Hành trình (thẻ cấp + checklist 3 chặng/6 nhiệm vụ + 3 slot locked Chặng2) + journey bar sticky.
- **FE4**: khối "Kế hoạch" trong panel đặt lệnh + ungate Sân tập + `.gbar` state machine + nhiệm vụ ① (gắn event mua/★).
- **FE5**: ẩn-theo-cấp (§8) + nhiệm vụ ⑤ (ô Giá/MP-LO mở, cổng keydown cắt lỗ) + nhiệm vụ ⑥ + màn Kết sổ (§5, 4 template coach).
- **FE6**: màn Tốt nghiệp (§9) + chuyển badge SÂN TẬP→THỰC CHIẾN + auto-chuyển tab + toast unlock.
- **V**: verify (BE pytest + FE vitest/tsc/build) + smoke đi trọn Cap 0.

## Không làm (chống scope-creep §14)
- Chặng 2 (3 tour) nội dung; đọc chart/nến (Cap 1); Kế hoạch bản đầy đủ (Cap 1); calibration/streak/telegram/position-sizing; reset hồ sơ hành vi. Chỉ 3 slot locked + cơ chế spotlight chung chuẩn §11 (chuẩn bị, chưa dùng).

## Rủi ro
- **Ungate**: phải chắc chỉ mở ở Cap0/Sân tập, không rò sang trading thường (giữ premium). Test kỹ.
- **Route mới gói shell hiện có**: RightSidebar/RightToolbar hiện gắn với /bieu-do & /co-phieu — cần đảm bảo dùng lại được ở route mới không vỡ (state, context). Thêm panel `journey` không phá 4 panel cũ.
- **gbar state machine** đồng bộ với event khớp lệnh thật (async) — listener đúng sự kiện success của `usePlaceOrder`.
- Space Grotesk load (CSP/offline) — fallback như bài học bctc-dashboard.
- Backend: seed 250tr Cap0 không đụng leaderboard/account Đấu trường ảo hiện có của user (tách mode).

# Home "Trung tâm phân tích" — Layout Redesign (Design Doc)

**Ngày:** 2026-07-04 · **Nguồn:** IQX-DASHBOARD-SPEC.md v1.0 (PO Huy Lê) + iqx-homepage-clean.html
**Phạm vi:** CHỈ cột trái trang chủ `/` + icon rail. KHÔNG đụng shell (Header/MarketBar), KHÔNG đụng các trang khác.

## Quyết định đã chốt (user 2026-07-04)

1. **Giữ side panel + icon rail** (lệch spec §3.1 — spec bỏ; user giữ). Cột trái nhận layout mới.
2. **Giữ shell hiện có** — Header + MarketBar đã cover HEADER + TICKER STRIP của spec.
3. **Tab Phân tích cổ phiếu / BCTC = search-view nhẹ → điều hướng** sang `/co-phieu/:symbol`.
4. **Dark + light** — token spec làm chuẩn dark, map tương đương light.
5. **3 tab phân tích gộp vào icon rail hiện có** — tab "Phân tích" (💡) đã cover cổ phiếu; THÊM tab "BCTC" mới cùng pattern launcher.

## Thay đổi cốt lõi: auto-switch → session tabs

Hiện tại `HomeMarketView` TỰ đổi bài theo giờ (`getDisplayMode`: premarket [480,540) / midday [705,990) / eod). Thay bằng **3 tab luôn hiển thị, active mặc định theo giờ** (spec §6.2.1):

| Khung giờ (ICT) | Tab active mặc định |
|---|---|
| 00:00–09:14 | ☀️ Trước phiên (premarket brief) |
| 09:15–15:29 | ☕ Giữa phiên (midday brief) |
| 15:30–23:59 | 🌙 Cuối phiên (daily EOD brief) |
| Cuối tuần/lễ | 🌙 Cuối phiên |

- Cả 3 tab luôn clickable, không disable. Lựa chọn KHÔNG lưu giữa các lần truy cập.
- Nội dung mỗi tab = **view đầy đủ hiện có** (PreMarketView / MidDayView / MarketDailyPage) — chỉnh layout, KHÔNG cắt tính năng. Fallback sẵn có của từng view (no-data → EOD + notice) thay cho placeholder trần của spec.
- Giờ trên tab dùng giờ publish THẬT: Trước · 07:15, Giữa · 11:30, Cuối · 16:30.
- Pill "MỚI" (vàng, spec §4.6): tab có brief publish gần nhất trong ngày (so `generated_at` của 3 query /latest — đều cached 30′, 3 GET nhẹ).

## Cấu trúc cột trái mới (thứ tự spec §4.6)

```
SessionMeta   — badge "PHÂN TÍCH THỊ TRƯỜNG" (brand-soft) + ngày của brief đang xem (uppercase)
SessionTabs   — ☀️/☕/🌙 + giờ + pill MỚI, border-bottom, active = trắng + gạch brand   ← TRÊN H1
<Brief view>  — PreMarketView | MidDayView | MarketDailyPage (nguyên trạng nội bộ)
```

Container: `max-width: 980px`, margin auto, padding 32px 48px 80px (mobile 16px) — trong phạm vi cột trái hiện có.

## Component mới

- `home-analysis/getDefaultActivePeriod.ts` — pure fn `(now, isTradingDay) → 'premarket'|'midday'|'eod'`; biên 09:15/15:30; non-trading → 'eod'. Nguồn isTradingDay: cùng nguồn `getDisplayMode` đang dùng. **Thay thế** `getDisplayMode` trên home (xoá usage, giữ/di trú test boundary).
- `home-analysis/SessionMeta.tsx` + `SessionTabs.tsx` + `home-analysis.css` — token spec: brand #3b82f6, tabs 13px/500, active border-bottom 2px brand, pill MỚI rgba(251,191,36,.15)/#fbbf24, mono cho giờ. Map light-theme tương đương (border/nền theo biến theme hiện có).
- `HomeSidePanel` + `HomeIconRail`: thêm tab `bctc` (icon ClipboardList/tương đương Arco) — launcher search mã (mirror `PhanTichLauncher`) → điều hướng `/co-phieu/:symbol` mở tab "Tài chính" (thêm query param deep-link nếu StockPage chưa hỗ trợ).

## Không làm (v1, ghi để khỏi tranh cãi)

- Không restyle nội bộ 3 brief view theo token spec (đã có style riêng, midday cam / premarket cyan).
- Không thêm MentionedTickers chips riêng (views đã có watchlist; side panel 💡 cover điều hướng phân tích sâu).
- Không System State Bar / Track record (spec §9.3 tương lai) — cấu trúc chừa chỗ trên SessionMeta.
- Không đổi backend — 3 endpoint /latest giữ nguyên.

## Test

- Boundary: 8 case spec §6.2.1 (08:30→Trước, 10:00/14:00→Giữa, 16:00/20:00→Cuối, T7→Cuối, luôn 3 tab clickable, click không auto-revert).
- SessionTabs: render 3 tab + pill MỚI + click đổi content.
- HomeMarketView: mock DIRECT children (bài học time-of-day flake), 3 tab → đúng view, fallback giữ nguyên.
- Icon rail: tab BCTC hiện + launcher điều hướng đúng.
- Full: vitest + tsc + build.

## Rủi ro

- Đổi default: 09:15–11:29 tab Giữa active nhưng midday chưa publish (11:30) → MidDayView fallback EOD + notice "đang xử lý" — chấp nhận (spec yêu cầu active theo giờ).
- Premarket default kéo dài tới 09:14 (hiện 08:59) — brief premarket vẫn relevant tới ATO xong, OK.

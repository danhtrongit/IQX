# Update 19-11: acceptance

QA run: 2026-11-20, branch `u1911-qa` (based on `main` 16221ef6). Only tests and docs were changed; no product code was changed.

**How each case was checked**

- **e2e**: Playwright against the Vite dev server, with the API mocked.
  - Spec: `frontend/e2e/update-1911-acceptance.spec.ts`.
  - Helpers: `frontend/e2e/u1911-support.ts`.
  - The Strategy and Bot calls go to the same in-memory fakes the unit tests use (`src/pages/strategy/test-support.ts`), run inside the browser.
- **unit**: Vitest. Files ending in `*.pg.test.ts` were run against a throwaway Docker `postgres:16`, which was removed afterwards.
- **api**: a real backend run locally on a throwaway Postgres and Redis. Transcript: `evidence/backend-api-smoke.txt`.
- **prod**: anonymous, read-only GET requests and a headless browser against https://iqx.vn on 2026-11-19. Log: `evidence/prod-smoke.txt`.
- **Screenshots**: in `evidence/`.
  - `e2e-*.png` come from the mocked e2e run.
  - `prod-*.png` come from production.
  - The folder is about 6.4 MB in total.

**Result values**

- **PASS**: the check was run and it passed.
- **FAIL**: the check was run and it failed.
- **NOT-TESTABLE-LOCALLY**: the reason is given in the row.
- **NOT TESTED**: this pass did not cover the case; the row says why.

## Summary

| Spec | PASS | FAIL | NOT-TESTABLE-LOCALLY | NOT TESTED |
| --- | --- | --- | --- | --- |
| Bố cục v1.3 §9 (N01–N22) | 20 | 1 (N22 at 900 px, see note) | 1 (N20) | 0 |
| Tab IQX §7 (items 1–29) | 25 | 0 | 0 | 4 (items 5, 7, 8 and 21 are only partly covered, see rows) |

There is also one product bug that is not one of the numbered cases. It sits beside N13 and v1.2 §5; see "Bug found" at the end.

## Test-suite counts

| Suite | Command | Result |
| --- | --- | --- |
| Frontend unit | `cd frontend && npx vitest run --maxWorkers=4 --testTimeout=60000` | 261 files passed. 4629 tests passed, plus 6 expected fails (4635 in all). |
| Backend unit | `cd backend && npx vitest run --testTimeout=60000` | 209 files passed and 7 skipped. 3484 tests passed and 56 skipped (3540 in all). The skipped files are the `*.pg` tests, which need a database URL. |
| Backend `*.pg` tests (throwaway Postgres) | the same, with the URL environment variables set | `iqx-templates.pg` 9/9, `demo-reset-100m.pg` 12/12, `u1911-iqx-templates-extra.pg` 5/5 |
| e2e (whole suite, `E2E_PORT=4291`, 3 workers) | `npx playwright test` | 148 passed and 11 skipped. The skipped tests are `real-backend.spec.ts` and `academy-v4` real-backend, which need `E2E_REAL_BACKEND=1`, and `flashback-call` getDisplayMedia, which this Chromium does not support. 0 failed. |
| of which `update-1911-acceptance.spec.ts` | | 30/30. This count includes 1 `test.fail`, which records the bug below. |

## Bố cục v1.3: §9 test cases

| ID | How verified | Result |
| --- | --- | --- |
| N01 | e2e `N01 thanh trên cùng…`; prod check (nav = GIỚI THIỆU · LUYỆN TẬP · FLASHBACK · CHIẾN LƯỢC · KHU GIAO DỊCH). Screenshots: `e2e-N01-header-1440.png`, `prod-N01-header-1440.png` | PASS. "Khu giao dịch", added on 2026-11-14 after the spec was written, sits after Chiến lược. There is no Demo Trading or Học viện in the nav. |
| N02 | e2e `N02 LUYỆN TẬP…`; prod rail = candle-dojo, hoc-vien, bot, giao-dich, phan-tich. Screenshots: `e2e-N02-luyen-tap-candle-dojo-1440.png`, `prod-N02-luyen-tap-1440.png` | PASS. Candle Dojo is on by default and has no panel. |
| N03 | e2e `N03 N04 N05 N06 Giao dịch…`; `e2e-N03-giao-dich-dat-lenh-1440.png` | PASS |
| N04 | same e2e. Exactly one tab panel is visible and the others are `hidden`; the URL shows `tab=`. Screenshots: `e2e-N04-giao-dich-danh-muc-1440.png`, `e2e-N04-giao-dich-tin-tuc-1440.png` | PASS. The rendered content was checked; "identical to the old panel" was judged from the screenshots only. |
| N05 | same e2e: the quantity `500` survives Danh mục → Tin tức → Đặt lệnh, and also a collapse and re-open | PASS |
| N06 | same e2e: on collapse the main area grows by more than 200 px, and on re-open it comes back on the same tab. Screenshot: `e2e-N06-giao-dich-thu-panel-1440.png` | PASS. "The chart redraws" was not checked separately. |
| N07 | e2e `N07 Danh mục → ⋯ Đặt lệnh…`: the watchlist row menu, then Đặt lệnh, switches to the Đặt lệnh tab with `symbol=HPG` | PASS |
| N08 | e2e `N08 Học viện, Bot, Dashboard phân tích…`. Screenshots: `e2e-N08-{hoc-vien,bot,phan-tich}-1440.png` | PASS. Each tool opens, collapses and re-opens, and switching tools keeps the panel open. Dashboard phân tích keeps its own layout without a rail panel. "Content identical to the old version" was judged from the screenshots only. |
| N09 | e2e `N09 Insight…`: no "Insight" text in the UI; `view=insight` and `content=ai-analysis&analysis=stock` redirect to Đặt lệnh and keep the symbol. Prod: the same redirect | PASS |
| N10 | e2e `N10 N11 FLASHBACK…`; prod rail = flashback, shop, `data-panel-hidden=true`. Screenshots: `e2e-N10-flashback-sanh-1440.png`, `prod-N10-flashback-1440.png` | PASS |
| N11 | same e2e, with the room mocked through `flashback-support`: create a room, Bắt đầu, then the match shows the "Đặt lệnh" panel. Screenshot: `e2e-N11-flashback-van-choi-1440.png` | PASS. A full game against the real backend was not played. |
| N12 | e2e `N12 Shop…`. The mocked server still sends `premium_price_xu` and the exchange fields, and the UI shows neither Premium nor đổi xu. Screenshot: `e2e-N12-shop-1440.png` | PASS |
| N13 | e2e `N13 nút xu…` from `/`, Bot, Chiến lược and the Flashback lobby, including when the Shop panel was collapsed. Also e2e `N13 (khách) và Candle Dojo › Mở Shop › Thẻ nến…` | PASS. See the bug below: after the chip has opened the Shop panel, clicking Shop does not collapse it. |
| N14 | unit `shop-module.test.ts`, `shop-economy.test.ts`; api: `POST shop/premium-purchases` returns 410 `SHOP_PREMIUM_REMOVED`, xu is 1000 before and after, and there are 0 premium ledger rows | PASS |
| N15 | UI: e2e `N15 (UI)…` finds no đổi xu, Nạp/Rút xu or Premium text on Đặt lệnh, Danh mục, Shop, Candle Dojo or Bot, and e2e N03 shows Tiền khả dụng 100.000.000. Backend: unit `demo-capital-consistency.test.ts` 6/6, `demo-reset-100m.pg.test.ts` 12/12; api: activating a new account gives `cash_available_vnd` 100000000 | PASS |
| N16 | unit `shop-module.test.ts`; api: `shop/demo-exchange` deposit and withdraw both return 410 `DEMO_EXCHANGE_REMOVED`, and xu and Demo cash are unchanged | PASS |
| N17 | unit `demo-capital-consistency.test.ts`; api: the admin PnL is based on 100,000,000 | PASS |
| N18 | e2e `N18 LUYỆN TẬP ↔ FLASHBACK nhiều lần…`: 3 round trips. Each section keeps its tool, the Giao dịch tab (Tin tức) and its collapsed or open state | PASS |
| N19 | e2e `N19 link cũ §6…` (16 old links plus `/hoc-vien/<lesson>`); e2e `demo-tabs` and `introduction` redirect tests; prod: 14 links match, status 200, no 404 text | PASS. The web has no room-invite URL (the room UI only has "Sao chép ID"). `view=flashback&room=123456` keeps `room=` on prod, so the "invite link goes straight into the room" part only covers keeping the parameter. |
| N20 | — | NOT-TESTABLE-LOCALLY. It needs before and after snapshots of production user data around the deploy. |
| N21 | e2e `N21 LUYỆN TẬP {360,390}px…` and `N21 FLASHBACK {360,390}px…`: no horizontal overflow, the rail works, tapping a tool opens its panel layer, closing works, and the Giao dịch tabs switch. Prod: no overflow at 360 and 390. Screenshots: `e2e-N21-*`, `prod-{360,390}-*` | PASS |
| N22 | e2e `N22 {900,1024,1440,1920}px` with the panel open and collapsed on Giao dịch, Bot, Shop and Flashback; prod at the same widths. Screenshots: `e2e-N22-*`, `prod-{900,1024,1440,1920}-*` | **FAIL at 900 px.** There is no overflow at any width, and the rail sits at the right edge at 1024, 1440 and 1920. At 900 px (≤ 900 is the overlay layout), Giao dịch keeps the right column, but **Bot, Học viện, Flashback and Shop show the rail as a top horizontal bar** (`data-rail="bar"`, x = 0), both locally and on prod. Code: `phoneRail = trading ? "column" : "bar"` in `frontend/src/pages/demo-trading/demo-trading-page.tsx`, with the overlay breakpoint at ≤ 900 px in `workspace-frame.tsx`. Either the spec or the 900 px breakpoint needs a decision. |

## Tab IQX §7

| # | How verified | Result |
| --- | --- | --- |
| 1 | e2e `§7.1 item 1, 2, 4, 6…`: the tabs are IQX · Cơ bản · Kỹ thuật with Cơ bản open, there are 6 cards in seed order with name, idea and counts (CANSLIM: Thị trường 1, Cơ bản 3, Kỹ thuật 2), the footer text is right, and the words mẫu, template and preset do not appear. Unit `filter/iqx-tab.test.tsx`. Screenshot: `e2e-IQX-1-bo-loc-tab-iqx-1440.png` | PASS |
| 2 | same e2e: Dùng on an empty form fills it without a dialog. With conditions present, the "Thay bộ lọc đang soạn?" dialog appears with the spec text, and Hủy keeps the form. Screenshot: `e2e-IQX-2-bo-loc-dung-1440.png` | PASS |
| 3 | unit `filter/iqx.test.ts` "Bộ lọc IQX filled by Dùng = built by hand (§7.1.3)" (definition except `origin`, and criteriaSignature); backend `iqx-templates.test.ts` "is part of definition_hash but not of criteriaHash" | PASS (unit). The "UI identical" part was not compared separately. |
| 4 | same e2e: after filling, add a Cơ bản metric (the ✓ appears), then remove it with "Bỏ điều kiện" (the + comes back); the IQX strip stays | PASS |
| 5 | unit `filter/iqx-tab.test.tsx` "…runs exactly the item's criteria" | NOT TESTED as a comparison of two run results. Only indirect evidence: the same criteria are sent, and criteriaHash is identical (item 3). |
| 6 | e2e: the Lưu bộ lọc dialog suggests "{tên} (từ Bộ lọc IQX)", and the POST body has `origin = {type:"iqx_filter", id, version:1}`; unit `filter/iqx-tab.test.tsx` "Lưu bộ lọc suggests…"; backend extra pg "7.4.20 … origin.version 1" (opening again keeps the values) | PASS |
| 7 | unit `backtest/iqx-tab.test.tsx` "?iqx= from a symbol of a Bộ lọc IQX fills its paired Chiến lược IQX" | NOT TESTED end to end: clicking a symbol in the results and the confirm dialog for a different draft were not run in e2e. The unit test covers the `?iqx=` fill. |
| 8 | — | NOT TESTED as a dedicated check. e2e item 1 asserts that the Bộ lọc page has no mẫu, template or preset text, but there is no lesson-lock text check. |
| 9 | e2e `§7.2 item 9, 10, 12, 14…`: the tabs are IQX and "Chỉ báo N" with Chỉ báo as the default and its search box; IQX hides the search and has 5 Dùng buttons; the footer text is right. Screenshot: `e2e-IQX-9-backtest-tab-iqx-1440.png` | PASS. In the mocked catalog N = 5; the real registry gives 16 (this was not checked against the live backend). |
| 10 | same e2e: Dùng "Hồi phục quá bán" gives Mua = Bollinger Bands + RSI, Bán = RSI, Giữ tối đa = 10, the badge "Bản nháp · chưa lưu cho Bot", and Chỉnh opens the form. Unit `backtest/draft.test.ts`. Screenshots: `e2e-IQX-10-*.png` | PASS. The values of each row in the Chỉnh form were checked by the unit test, not by e2e. |
| 11 | unit `backtest/draft.test.ts` "Chiến lược IQX filled by Dùng = configured by hand (§7.2.11)"; backend `strategy-backtests.test.ts` "a Chiến lược IQX draft and the same config set by hand give the same result and snapshot except the source (§7.2.11)" (new) | PASS |
| 12 | same e2e: the "Thông tin kiểm thử" text (symbol, dates, capital) is unchanged after Dùng and after a run, and there are 0 `PATCH /strategy/shared-config` calls | PASS |
| 13 | unit `backtest/iqx-tab.test.tsx` "Lưu cho Bot needs a run of this exact draft, then writes one revision with the run as source" | PASS (unit) |
| 14 | same e2e: "Về cấu hình đã lưu", then confirm, removes the draft badge and the IQX strip | PASS |
| 15 | same e2e: the KPI group "Sáu chỉ số kết quả" contains "Mua và giữ FPT", and the line legend appears. Unit `backtest/iqx-tab.test.tsx` "every run shows Mua và giữ…". Screenshot: `e2e-IQX-15-backtest-mua-va-giu-1440.png` | PASS |
| 16 | backend `u1911-buy-and-hold-handcalc.test.ts` (3 tests: next_open with lot 100 and fee 0.15 %; same_close on a split-adjusted series; capital not enough for one lot) and the existing "stores Mua và giữ computed by hand…" | PASS. Note: `buyAndHold` does not skip bars with a zero price. The spec does not cover this, so it is a spec gap, not a bug. |
| 17 | e2e `§7.3 item 17…`: a run returned without `buy_and_hold` shows "—" with "Lần chạy cũ chưa có số liệu này". Screenshot: `e2e-IQX-17-backtest-ket-qua-cu-1440.png` | PASS. "Không vẽ đường" and "không tính lại" are covered by the unit tests in `backtest/iqx-tab.test.tsx`. |
| 18 | backend `iqx-templates.test.ts` "the admin API is admin only through the roles guard (team_lead → 403)"; api: user and team_lead get 403 `INSUFFICIENT_ROLE`, admin gets 200 | PASS |
| 19 | backend pg "a draft of a shown item changes nothing for users and is flagged "Có bản nháp" (7.4.19)"; e2e admin list shows "Có bản nháp" | PASS |
| 20 | backend pg "publish validates on the server, then users see v2 at once; v1 stays as it was (7.4.20, 7.4.22)" and extra pg "7.4.20 a filter saved from v1 keeps its values and origin.version 1…" | PASS |
| 21 | unit `backtest/draft.test.ts` "a filled draft passes the publish checks and builds back the stored definition"; unit `admin/iqx-templates/iqx-templates.test.tsx` | NOT TESTED end to end (admin authoring, then user Dùng, then comparing screens). Only the round trip of the definition is covered by unit tests. |
| 22 | frontend unit `iqx-templates.test.tsx` "chặn Xuất bản và hiện lỗi khi thiếu trường…"; backend `iqx-templates.test.ts` validators; extra pg: no condition, no switched-on Bán row, an empty info field and a duplicate name are all refused through the service | PASS |
| 23 | e2e `§7.4 item 23 (UI quản trị)…`: the Ẩn button stays disabled without a reason, and the POST is sent with the reason; a published row has no Xóa button. e2e `§7.4 item 23/24 (UI người dùng)`: the hidden item is gone from the IQX tab after a reload. Backend pg 7.4.23 (hide/show, delete only while never published) and extra "hide / show body requires a non-blank reason"; api: hide with a blank reason returns 422. Screenshot: `e2e-IQX-23-admin-mau-iqx-1440.png` | PASS. The user side runs with a mocked list; the server side runs on pg. |
| 24 | backend pg "reorder changes the user order at once (7.4.24)"; e2e user tab shows the new order after a reload (mocked); frontend unit "↑ gửi thứ tự đã đổi chỗ" | PASS |
| 25 | backend pg "restore v1 makes a draft with v1 content; publishing it is v3 and v1 is untouched (7.4.25)" | PASS |
| 26 | backend pg (stale `expected_version` returns 409 and does not overwrite); frontend unit "báo xung đột 409 kèm nút Tải lại" | PASS |
| 27 | backend pg: exactly 1 audit row per action, and `publish` has both before and after | PASS |
| 28 | backend pg "hide / show … audited (7.4.23, 7.4.28)": the paired Chiến lược is hidden, so the Bộ lọc pairing is dropped | PASS (service level; the strip was not checked in e2e) |
| 29 | e2e `Tab IQX · 390px`: Bộ lọc in the "Thư viện" drawer and Backtest in the "Chỉ báo" drawer, both with the IQX tab; Dùng fills; no horizontal overflow. e2e `§7.5 item 29 (quản trị) 390px`. Screenshots: `e2e-IQX-29-*.png` | PASS |

## Bug found (not fixed; product code was not touched)

**After the Shop panel (or any panel) is opened through a link with `state.openPanel`, it cannot be collapsed.** Such links include the header coin chip and any link between sections.

- **Where:** `frontend/src/pages/demo-trading/demo-trading-page.tsx:151-155`.
  - `openRequested = location.state?.openPanel === true`.
  - The layout effect clears `collapsedTool` whenever `openRequested` is true, and it re-runs every time `collapsedTool` changes.
  - So the collapse click sets `collapsedTool` and the effect clears it again at once.
  - The state stays on that history entry, so a reload of that entry does the same.
- **Repro:**
  1. At 1440 px, open `/luyen-tap?tool=bot`.
  2. Click the xu chip; it goes to `/flashback?tool=shop` with the panel open.
  3. Click Shop on the rail.
- **Expected:** the panel collapses, as v1.2 §5 says.
- **Actual:** `data-panel-collapsed` stays `false`.
- **e2e record:** `BUG N13/v1.2 §5: sau khi mở Shop bằng nút xu, bấm Shop không thu được panel`, marked `test.fail`, so it will start failing, as a reminder, once the bug is fixed.
- **Fix idea:** consume the open request once per `location.key` (for example, keep a ref of the key that was already handled) instead of re-running on every `collapsedTool` change.

## Files added or changed by this QA pass

**e2e, updated to the new layout and URLs**

- `academy-v4`, `ban-tin`, `candle-dojo`, `demo-tabs`.
- `flashback-call`, `flashback-iqline-support`, `flashback-iqline`, `flashback-mobile-room`, `flashback-mobile`.
- `fundamental-charts-390`, which also gets the Dashboard v2 mock.
- `introduction`.
- `iqline-market`, `iqline-support`, `iqline-tools-advanced`, `iqline-tools-basic`.
- `price-board-layout`, `tabular-digits`.
- `fixtures.ts`, which gains `closePanelLayer`.

**e2e, new files**

- `update-1911-acceptance.spec.ts`.
- `u1911-support.ts`.

**Backend tests**

- New: `test/unit/u1911-buy-and-hold-handcalc.test.ts`.
- New: `test/unit/u1911-iqx-templates-extra.pg.test.ts`, which runs only when `IQX_TEMPLATES_EXTRA_PG_URL` is set.
- One new `it` in `test/unit/strategy-backtests.test.ts`. It may conflict with the concurrent change to Giữ tối đa.

**Evidence:** everything in `evidence/`.

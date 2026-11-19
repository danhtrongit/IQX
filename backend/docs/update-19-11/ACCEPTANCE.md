# Update 19-11: acceptance

QA run: 2026-11-20, branch `u1911-qa`. First pass on `main` 16221ef6. Second pass on `main` f79936e2, which adds Giữ tối đa and the coordinator's two layout fixes: the panel can be collapsed after an `openPanel` link, and the rail is a column at ≥ 768 px. Only tests and docs were changed by QA; no product code was changed.

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
  - The folder is about 8.3 MB in total.
  - The prod screenshots and `prod-smoke.txt` were taken on 2026-11-19, before f79936e2. Prod still showed the old 900 px rail bar then.

**Result values**

- **PASS**: the check was run and it passed.
- **FAIL**: the check was run and it failed.
- **NOT-TESTABLE-LOCALLY**: the reason is given in the row.
- **NOT TESTED**: this pass did not cover the case; the row says why.

## Summary

| Spec | PASS | FAIL | NOT-TESTABLE-LOCALLY | NOT TESTED |
| --- | --- | --- | --- | --- |
| Bố cục v1.3 §9 (N01–N22) | 22 | 0 | 0 | 0 |
| Tab IQX §7 (items 1–29) | 29 | 0 | 0 | 0 |

The first pass found one product bug, beside N13 and v1.2 §5. It is **fixed** in f79936e2; see "Bug found (fixed)" at the end. No new product bug was found in the second pass.

**Giữ tối đa is now applied** in Backtest and Bot (merge 16221ef6, policy iqx-bot-v1.1). Evidence: `backend/test/unit/quant-v2-max-holding.test.ts`, 7/7.
- P13/P14: with Sell off, the position exits after exactly N bars with reason `max_holding`, for both `next_open` and `same_close`.
- P13: an earlier Sell condition sells earlier.
- P15: when both are due on one bar there is one sell with both flags and one fee.
- P16: there is no forced sell at the last bar.
- With null or absent Giữ tối đa the behaviour is unchanged.
- Giữ tối đa is validated as an integer from 3 to 250.

## Test-suite counts

| Suite | Command | Result |
| --- | --- | --- |
| Frontend unit | `cd frontend && npx vitest run --maxWorkers=4 --testTimeout=60000` | 261 files passed. 4631 tests passed, plus 6 expected fails (4637 in all). Second pass, on f79936e2. |
| Backend unit | `cd backend && npx vitest run --testTimeout=60000` | 210 files passed and 7 skipped. 3507 tests passed and 56 skipped (3563 in all). Second pass, on f79936e2. The skipped files are the `*.pg` tests, which need a database URL. |
| Backend `*.pg` tests (throwaway Postgres) | the same, with the URL environment variables set | First pass only: `iqx-templates.pg` 9/9, `demo-reset-100m.pg` 12/12, `u1911-iqx-templates-extra.pg` 5/5 |
| e2e (whole suite, `E2E_PORT=4294`, 3 workers) | `npx playwright test` | 154 passed and 11 skipped, 0 failed. Second pass. The skipped tests are `real-backend.spec.ts` and `academy-v4` real-backend, which need `E2E_REAL_BACKEND=1`, and `flashback-call` getDisplayMedia, which this Chromium does not support. |
| of which `update-1911-acceptance.spec.ts` | `npx playwright test update-1911-acceptance` | 36/36. That is the 30 tests of the first pass, with the N13 bug test now a normal test, plus 6 new tests for §7 items 5 (×2), 7 (×2), 8 and 21. |

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
| N13 | e2e `N13 nút xu…` from `/`, Bot, Chiến lược and the Flashback lobby, including when the Shop panel was collapsed; e2e `N13/v1.2 §5: sau khi mở Shop bằng nút xu, bấm Shop thu được panel`; e2e `N13 (khách) và Candle Dojo › Mở Shop › Thẻ nến…` | PASS. The collapse bug of the first pass is fixed in f79936e2, and its test is now a normal passing test. |
| N14 | unit `shop-module.test.ts`, `shop-economy.test.ts`; api: `POST shop/premium-purchases` returns 410 `SHOP_PREMIUM_REMOVED`, xu is 1000 before and after, and there are 0 premium ledger rows | PASS |
| N15 | UI: e2e `N15 (UI)…` finds no đổi xu, Nạp/Rút xu or Premium text on Đặt lệnh, Danh mục, Shop, Candle Dojo or Bot, and e2e N03 shows Tiền khả dụng 100.000.000. Backend: unit `demo-capital-consistency.test.ts` 6/6, `demo-reset-100m.pg.test.ts` 12/12; api: activating a new account gives `cash_available_vnd` 100000000 | PASS |
| N16 | unit `shop-module.test.ts`; api: `shop/demo-exchange` deposit and withdraw both return 410 `DEMO_EXCHANGE_REMOVED`, and xu and Demo cash are unchanged | PASS |
| N17 | unit `demo-capital-consistency.test.ts`; api: the admin PnL is based on 100,000,000 | PASS |
| N18 | e2e `N18 LUYỆN TẬP ↔ FLASHBACK nhiều lần…`: 3 round trips. Each section keeps its tool, the Giao dịch tab (Tin tức) and its collapsed or open state | PASS |
| N19 | e2e `N19 link cũ §6…` (16 old links plus `/hoc-vien/<lesson>`); e2e `demo-tabs` and `introduction` redirect tests; prod: 14 links match, status 200, no 404 text | PASS. The web has no room-invite URL (the room UI only has "Sao chép ID"). `view=flashback&room=123456` keeps `room=` on prod, so the "invite link goes straight into the room" part only covers keeping the parameter. |
| N20 | Prod 2026-11-20: backup `pre-u1911-20261119T194728Z.dump` restored into a throwaway DB and compared with live after both deploys (row hashes) | PASS. Same rows and hashes: bot_accounts 50, bot_positions 29, bot_instances 50, bot_cash_ledger 80, practice_progress 20, cd_user_progress 6, cd_user_cards 35, mascot_ownerships 66, pet_levels 1, fb_rooms 184, fb_room_members 352, virtual_positions 21, virtual_orders 85, virtual_trades 82; shared_config_revisions 242 identical on its old columns (0057 only added `source_label`, all NULL). coin_wallets differ only for the 3 §8.2 refunds (+1000, +100, +1000 xu). virtual_trading_accounts changed only as §8.2 (logged in demo_reset_100m_log). |
| N21 | e2e `N21 LUYỆN TẬP {360,390}px…` and `N21 FLASHBACK {360,390}px…`: no horizontal overflow, the rail works, tapping a tool opens its panel layer, closing works, and the Giao dịch tabs switch. Prod: no overflow at 360 and 390. Screenshots: `e2e-N21-*`, `prod-{360,390}-*` | PASS |
| N22 | e2e `N22 {900,1024,1440,1920}px` with the panel open and collapsed on Giao dịch, Bot, Shop and Flashback. It asserts `data-rail="column"` at every width, no overflow, and the rail at the right edge. Prod check at the same widths was done on 2026-11-19, before the fix. Screenshots: `e2e-N22-*`, `prod-{900,1024,1440,1920}-*` | PASS (on f79936e2). The first pass failed at 900 px: Bot, Học viện, Flashback and Shop showed a top rail bar. Since f79936e2 the bar applies only below 768 px, so at 900 px the rail is a column at the right edge. Prod keeps the old 900 px behaviour until this is deployed. |

## Tab IQX §7

| # | How verified | Result |
| --- | --- | --- |
| 1 | e2e `§7.1 item 1, 2, 4, 6…`: the tabs are IQX · Cơ bản · Kỹ thuật with Cơ bản open, there are 6 cards in seed order with name, idea and counts (CANSLIM: Thị trường 1, Cơ bản 3, Kỹ thuật 2), the footer text is right, and the words mẫu, template and preset do not appear. Unit `filter/iqx-tab.test.tsx`. Screenshot: `e2e-IQX-1-bo-loc-tab-iqx-1440.png` | PASS |
| 2 | same e2e: Dùng on an empty form fills it without a dialog. With conditions present, the "Thay bộ lọc đang soạn?" dialog appears with the spec text, and Hủy keeps the form. Screenshot: `e2e-IQX-2-bo-loc-dung-1440.png` | PASS |
| 3 | unit `filter/iqx.test.ts` "Bộ lọc IQX filled by Dùng = built by hand (§7.1.3)" (definition except `origin`, and criteriaSignature); backend `iqx-templates.test.ts` "is part of definition_hash but not of criteriaHash" | PASS (unit). The "UI identical" part was not compared separately. |
| 4 | same e2e: after filling, add a Cơ bản metric (the ✓ appears), then remove it with "Bỏ điều kiện" (the + comes back); the IQX strip stays | PASS |
| 5 | e2e `§7.1 item 5: Hồi phục từ quá bán …` and `§7.1 item 5: Phá đỉnh có thanh khoản …`. Each one runs the Bộ lọc IQX after Dùng, then builds the same filter by hand in a fresh tab: Rổ VN100, the GTGD minimum, the indicator cards, each row's switch and values. It then compares the two `POST /strategy/screener/run` bodies. | PASS. The two bodies are deep-equal; the run body carries no `origin`, which travels with a save (item 6). Equal requests to the same server mean equal results. The filters with fundamental metrics were not built by hand, because the in-page fake catalog lacks P/E, P/B, PEG and other metrics. |
| 6 | e2e: the Lưu bộ lọc dialog suggests "{tên} (từ Bộ lọc IQX)", and the POST body has `origin = {type:"iqx_filter", id, version:1}`; unit `filter/iqx-tab.test.tsx` "Lưu bộ lọc suggests…"; backend extra pg "7.4.20 … origin.version 1" (opening again keeps the values) | PASS |
| 7 | e2e `§7.1 item 7: bấm mã trong kết quả có dải IQX…`: a Backtest draft from "Động lượng MACD", then Bộ lọc, Dùng "Hồi phục từ quá bán" (the strip shows "Đi cặp với" its pair), then Chạy, then click a result symbol (`?tab=backtest&symbol=X&iqx=<pair id>`). The "Thay bản nháp đang chỉnh?" dialog appears; Hủy keeps the MACD draft. Clicking again and confirming fills the pair (strip, Giữ tối đa); the symbol is X and `iqx=` leaves the URL. e2e `…không có bản nháp…`: with no draft it fills without a dialog. Unit `backtest/iqx-tab.test.tsx`. Screenshots: `e2e-IQX-7-*.png` | PASS |
| 8 | e2e `§7.1 item 8…`. It reads the visible text and the aria-label/title of the Bộ lọc IQX tab (cards expanded), the Bộ lọc strip before and after a run, the Backtest IQX tab (expanded) and the Backtest strip. No match for `bài học`, `học`, `khóa`/`khoá` or `Học viện`. The spec's own disclaimer "Tham khảo để học, không phải khuyến nghị (đầu tư)." (§0.4) is excluded. DEV-NOTES says §0.3 left no lock. Screenshot: `e2e-IQX-8-backtest-tab-iqx-mo-rong-1440.png` | PASS |
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
| 21 | e2e `§7.4 item 21…`. The admin opens `/admin/iqx-templates/filter/new` and fills Tên, Ý tưởng, Nguồn gốc and Khi nào dễ sai. In the embedded Bộ lọc form they pick Rổ VN30, add RSI (threshold 32, row 2 off) and Khối lượng (k = 1,5), then Xuất bản with a reason. The mocked admin API captures `content.definition`, with no `origin`, and the item is added to the user list as v1. A user in another tab clicks Dùng and Chạy, and the run body (minus `name`) deep-equals the published definition (minus `name`). Lưu bộ lọc suggests "… (từ Bộ lọc IQX)", and the saved definition equals it too, with `origin = {iqx_filter, id, version 1}`. Unit tests `backtest/draft.test.ts`, `admin/iqx-templates/iqx-templates.test.tsx`. Screenshots: `e2e-IQX-21-*.png` | PASS (frontend round trip with the admin API mocked; backend storage is covered by pg 7.4.20) |
| 22 | frontend unit `iqx-templates.test.tsx` "chặn Xuất bản và hiện lỗi khi thiếu trường…"; backend `iqx-templates.test.ts` validators; extra pg: no condition, no switched-on Bán row, an empty info field and a duplicate name are all refused through the service | PASS |
| 23 | e2e `§7.4 item 23 (UI quản trị)…`: the Ẩn button stays disabled without a reason, and the POST is sent with the reason; a published row has no Xóa button. e2e `§7.4 item 23/24 (UI người dùng)`: the hidden item is gone from the IQX tab after a reload. Backend pg 7.4.23 (hide/show, delete only while never published) and extra "hide / show body requires a non-blank reason"; api: hide with a blank reason returns 422. Screenshot: `e2e-IQX-23-admin-mau-iqx-1440.png` | PASS. The user side runs with a mocked list; the server side runs on pg. |
| 24 | backend pg "reorder changes the user order at once (7.4.24)"; e2e user tab shows the new order after a reload (mocked); frontend unit "↑ gửi thứ tự đã đổi chỗ" | PASS |
| 25 | backend pg "restore v1 makes a draft with v1 content; publishing it is v3 and v1 is untouched (7.4.25)" | PASS |
| 26 | backend pg (stale `expected_version` returns 409 and does not overwrite); frontend unit "báo xung đột 409 kèm nút Tải lại" | PASS |
| 27 | backend pg: exactly 1 audit row per action, and `publish` has both before and after | PASS |
| 28 | backend pg "hide / show … audited (7.4.23, 7.4.28)": the paired Chiến lược is hidden, so the Bộ lọc pairing is dropped | PASS (service level; the strip was not checked in e2e) |
| 29 | e2e `Tab IQX · 390px`: Bộ lọc in the "Thư viện" drawer and Backtest in the "Chỉ báo" drawer, both with the IQX tab; Dùng fills; no horizontal overflow. e2e `§7.5 item 29 (quản trị) 390px`. Screenshots: `e2e-IQX-29-*.png` | PASS |

## Bug found (fixed in f79936e2)

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
- **Status:** fixed by the coordinator in f79936e2. The e2e test is now `N13/v1.2 §5: sau khi mở Shop bằng nút xu, bấm Shop thu được panel` and passes.
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

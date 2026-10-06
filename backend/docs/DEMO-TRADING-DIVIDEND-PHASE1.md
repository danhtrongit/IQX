# Demo Trading — Cổ tức tiền mặt & cổ tức cổ phiếu (Phase 1)

Ngày hoàn thành: **05/10/2026**. Nhánh `main`, commit nền `4a904061`. Thay đổi **chưa commit, chưa deploy**.

Tài liệu này là báo cáo cuối Phase 1 theo spec "Bổ sung cổ tức – Demo Trading IQX", tiếp nối audit Phase 0 (`DEMO-TRADING-DIVIDEND-AUDIT.md`). Ba quyết định của product owner (05/10/2026) được áp dụng nguyên văn:

1. **Ngày cổ phiếu về:** `AIS.issue_date` của **cùng mã**, lớn hơn `ISS.record_date`, lấy bản sớm nhất. Không có AIS thì cổ phiếu chờ về vô thời hạn, không fallback.
2. **Trạng thái sự kiện:** suy ra từ ngày (`announced → ex_date_pending → ex_applied → paid/credited`). Sự kiện `ISS` được phân loại bằng `event_title_en`: "stock dividend"/"bonus shares" → cổ tức cổ phiếu; "rights issue"/"purchase right" → bỏ qua.
3. **Lưu trữ + job:** thêm bảng `virtual_corporate_actions` (kèm policy và entitlement) và job hằng ngày `trading.rights-sync`.

## 1. Data source

| Hạng mục       | Kết quả                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nguồn          | Vietcap IQ Insight `GET /api/iq-insight-service/v1/events` qua `MarketDataService.events()` (provider `vci.provider.ts`). Không thêm nguồn mới.        |
| Mã sự kiện     | `DIV` (cổ tức tiền), `ISS` (phát hành cổ phiếu, lọc bằng tiêu đề), `AIS` (niêm yết bổ sung — bằng chứng ngày cổ phiếu về).                             |
| Cửa sổ đồng bộ | `[hôm nay − 120 ngày, hôm nay + 90 ngày]` cho DIV/ISS; AIS kéo dài ngược tới `record_date` cũ nhất còn chưa khớp. Chặn nếu ≥ 20.000 bản ghi/lượt.      |
| Lọc mã         | Chỉ giữ mã có trong `symbols` đang active (universe của Demo Trading).                                                                                 |
| Chu kỳ         | Job `trading.rights-sync`, cron `0 0 7 * * *` (07:00 giờ VN, cả ngày không giao dịch), bật mặc định; tắt bằng `JOB_TRADING_RIGHTS_SYNC_ENABLED=false`. |
| Cổng dữ liệu   | `TradingRightsEventsPort` (abstract) → `VciTradingRightsEventsPort`. Test hệ thống thay bằng fake qua `startSystemStack(env, { overrideProviders })`.  |

## 2. Trường dữ liệu đã xác nhận (snake_case sau chuẩn hoá của `MarketDataService`)

| Trường VCI              | Dùng cho                                                                        |
| ----------------------- | ------------------------------------------------------------------------------- |
| `id`                    | `source_event_id` — khoá idempotent `(source='VCI', source_event_id)`           |
| `ticker`                | `symbol`                                                                        |
| `event_code`            | `DIV` / `ISS` / `AIS`                                                           |
| `event_title_en`        | Phân loại ISS (`parseStockTitle`)                                               |
| `public_date`           | `announced_date`                                                                |
| `exright_date`          | `exright_date` — ngày GDKHQ, mốc áp dụng                                        |
| `record_date`           | `record_date` — mốc khớp AIS cho cổ tức cổ phiếu                                |
| `payout_date` (DIV)     | `payout_date` — ngày tiền vào tài khoản                                         |
| `issue_date` (AIS)      | `issue_date` — ngày cổ phiếu về khi khớp với ISS cùng mã                        |
| `value_per_share` (DIV) | `cash_per_share_vnd` (bigint, làm tròn half-up)                                 |
| `exercise_ratio` (ISS)  | `stock_ratio` (numeric thập phân dương, ví dụ `0.2` = 20%; dạng khác bị bỏ qua) |

Chi tiết parse ở `rights.domain.ts` → `classifyVciEvent`, `parseRatio`, `parseStockTitle`. Sự kiện thiếu `exright_date`, tiền ≤ 0, hoặc tỷ lệ ≤ 0 bị bỏ qua và đếm vào `events_ignored`.

## 3. File backend

Mới:

| File                                            | Vai trò                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/0013_virtual_corporate_actions.sql` | Schema (mục 5).                                                                                                                                            |
| `src/modules/trading/rights.types.ts`           | Kiểu dữ liệu: action/entitlement row, terms, transition.                                                                                                   |
| `src/modules/trading/rights.domain.ts`          | Logic thuần (không I/O): phân loại sự kiện, ngày giao dịch trước GDKHQ, số lượng đủ điều kiện, công thức giá vốn/tiền/cổ phiếu, chuyển trạng thái đến hạn. |
| `src/modules/trading/rights.ports.ts`           | `TradingRightsEventsPort` (abstract).                                                                                                                      |
| `src/modules/trading/rights-vci.adapter.ts`     | Adapter VCI → `MarketDataService.events`.                                                                                                                  |
| `src/modules/trading/rights.repository.ts`      | SQL: upsert sự kiện, khớp AIS (`resolveCreditDates`), khoá action/entitlement/position theo thứ tự, ledger, tổng chờ nhận, huỷ khi reset.                  |
| `src/modules/trading/rights.service.ts`         | `syncAndApply()` (job), `applyDueForAccountSameTx()` (dùng chung cho job và refresh), `pendingTotals()`, `cancelPendingForResetSameTx()`.                  |
| `test/unit/trading-rights.domain.test.ts`       | 36 unit test cho domain.                                                                                                                                   |
| `test/system/trading-rights.system.spec.ts`     | 8 test chấp nhận chạy trên Postgres + Redis thật (Testcontainers).                                                                                         |

Sửa:

| File                                                                                                                                          | Thay đổi                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/trading/trading.service.ts`                                                                                                      | `refresh`: lấy config trước khi khoá tài khoản, gọi `applyDueForAccountSameTx`, trả thêm 3 bộ đếm `rights_*`; chặn T+2 không "trả" nhầm cổ phiếu chờ về từ cổ tức. `getPortfolio`: trường chờ nhận theo mã, `pending_rights`, NAV. |
| `src/modules/trading/trading.module.ts`                                                                                                       | Đăng ký repository/service/port mới; export `TradingRightsService`.                                                                                                                                                                |
| `src/modules/runtime/runtime.types.ts`                                                                                                        | Thêm tên job `trading.rights-sync`.                                                                                                                                                                                                |
| `src/modules/runtime/runtime.schedules.ts`                                                                                                    | Lịch job (07:00 VN hằng ngày).                                                                                                                                                                                                     |
| `src/platform/domain-runtime.module.ts`                                                                                                       | Handler job → `rights.syncAndApply(new Date())`, import `TradingModule`.                                                                                                                                                           |
| `src/modules/admin/admin-vt.service.ts`, `admin.module.ts`                                                                                    | Reset tài khoản (admin) huỷ entitlement đang chờ (`cancelled_reset`) trước khi xoá lệnh/vị thế.                                                                                                                                    |
| `src/platform/openapi/enrich-openapi.ts`                                                                                                      | Schema `TradingPendingRights`, trường mới trên `TradingPortfolioResponse` / `TradingRefreshResponse` (v1 + v2).                                                                                                                    |
| `contracts/openapi-v2.json`, `contracts/client/*`                                                                                             | Regenerate bằng `npm run contracts:generate` (không sửa tay).                                                                                                                                                                      |
| `test/system/system-stack.ts`                                                                                                                 | Thêm tuỳ chọn `overrideProviders` để test thay port VCI.                                                                                                                                                                           |
| `test/unit/trading-valuation.test.ts`, `runtime.calendar.test.ts`, `runtime.daily-retry.test.ts`, `test/system/domain-runtime.system.spec.ts` | Cập nhật số tham số constructor sau khi inject `TradingRightsService`.                                                                                                                                                             |

## 4. File frontend

| File                                                   | Thay đổi                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/demo-trading/portfolio/holdings-tab.tsx`    | Khối "Quyền chờ nhận" đặt **sau 4 ô thống kê, trước danh sách nắm giữ**, chỉ hiện khi có tiền hoặc cổ phiếu chờ. Badge trên dòng mã: "400.000 đ chờ nhận", "280 CP chờ về". Dòng info "SL 1.680 · Khả dụng 1.400 · Chờ về 280". |
| `src/pages/demo-trading/types.ts`                      | Trường tuỳ chọn `pending_cash_dividend_vnd`, `pending_stock_dividend_quantity` trên position; `pending_rights` trên portfolio.                                                                                                  |
| `src/pages/demo-trading/trading/use-engine-refresh.ts` | Cộng 3 bộ đếm `rights_*` vào `changed`; luôn invalidate query portfolio sau refresh.                                                                                                                                            |
| `src/lib/generated/backend-v2.ts`, `contracts/*`       | Regenerate bằng `npm run contracts:generate`.                                                                                                                                                                                   |
| `portfolio/holdings-tab.test.tsx` (mới)                | 7 test render: ẩn khi không có quyền, chỉ tiền, chỉ cổ phiếu, cả hai, vị trí khối, bộ lọc lãi/lỗ, vị thế 0 CP còn tiền chờ.                                                                                                     |
| `trading/use-engine-refresh.test.tsx` (mới)            | 2 test invalidate query.                                                                                                                                                                                                        |

Không thêm trang, modal, tab, biểu đồ, thông báo hay lịch sử cổ tức.

## 5. Migration `0013_virtual_corporate_actions.sql` (chỉ thêm, không sửa dữ liệu cũ)

- `virtual_rights_policy` (1 dòng): `deployment_date` = ngày VN lúc chạy migration. Sự kiện có GDKHQ **trước** ngày này được lưu với `disposition='skipped_pre_deploy'` và không bao giờ áp dụng (tránh truy hồi cho tài khoản cũ).
- `virtual_corporate_actions`: sự kiện chuẩn hoá, unique `(source, source_event_id)`, CHECK ràng buộc điều khoản theo `kind`, `credit_date`/`credit_action_id` chỉ hợp lệ khi `credit_date > record_date`, `financial_frozen_at` (đóng băng điều khoản sau khi đã áp dụng cho ít nhất một tài khoản; nếu VCI đổi điều khoản sau đó → `review_required`).
- `virtual_rights_entitlements`: snapshot quyền theo `(account_id, corporate_action_id)` unique; trạng thái `no_entitlement | pending_cash | pending_stock | paid | credited | cancelled_reset`; lưu `eligible_quantity`, `cash_amount_vnd`, `share_quantity`, `avg_before_ex_vnd`, `avg_after_ex_vnd`; trigger `protect_virtual_rights_entitlement` chặn sửa số liệu sau khi ghi.
- `virtual_cash_ledger`: CHECK cho `reference_type='rights_entitlement'` với 3 `kind` mới `rights_ex_applied`, `rights_cash_paid`, `rights_stock_credited`; unique partial index đảm bảo mỗi bước chỉ ghi một lần/tài khoản.
- Index phục vụ replay giao dịch (`virtual_trades`) và quét sự kiện đến hạn.

## 6. Logic điều chỉnh giá vốn

`rights.domain.ts` → `computeRightsAdjustment` (thuần, bigint, làm tròn half-up):

- Cổ tức tiền: `NewAvg = OldAvg − cashPerShare`.
- Cổ tức cổ phiếu: `NewAvg = OldAvg / (1 + ratio)`.
- Giá vốn mới được ghi vào `virtual_positions.avg_cost_vnd` ngay ngày GDKHQ bởi `TradingRightsService.applyEx` (`rights.service.ts`) và snapshot vào `avg_before_ex_vnd`/`avg_after_ex_vnd` của entitlement. Nếu kết quả âm → `RightsNegativeCostError`, sự kiện chuyển `review_required`, không ghi gì.

## 7. Logic tiền chờ nhận

- Số lượng đủ điều kiện = số CP nắm giữ **cuối ngày giao dịch liền trước GDKHQ**, tái dựng từ `virtual_trades` kể từ mốc kích hoạt/reset tài khoản (`computeEligibleQuantity`). Mua ngày GDKHQ không được tính; bán ngày GDKHQ vẫn được hưởng.
- `PendingCash = eligibleQty × cashPerShare` → entitlement `pending_cash`, ledger `rights_ex_applied` (số tiền 0, chỉ đánh dấu).
- Đến `payout_date`: `payCash` cộng vào `cash_available_vnd`, entitlement → `paid`, ledger `rights_cash_paid`. UPDATE có điều kiện `status='pending_cash'` nên chạy lại không cộng kép.
- Tổng chờ nhận lấy từ `pendingTotals` (SUM trên entitlement `pending_cash`), không lưu cột tổng riêng.

## 8. Logic cổ phiếu chờ về

- `PendingShares = eligibleQty × ratio` (làm tròn xuống số nguyên) → `virtual_positions.quantity_total += n`, `quantity_pending += n`, `quantity_sellable` không đổi; entitlement `pending_stock`.
- Ngày về = `credit_date` (khớp AIS, mục 1). Khi đến hạn: `creditPositionShares` chuyển `quantity_pending → quantity_sellable` với điều kiện `quantity_pending >= n`, entitlement → `credited`, ledger `rights_stock_credited`.
- Cổ phiếu chờ về từ cổ tức nằm chung cột `quantity_pending` với T+2; `refresh` trừ phần cổ tức ra trước khi "trả" T+2 nên không bị lẫn.
- Reset tài khoản (admin) đặt entitlement đang chờ thành `cancelled_reset`.

## 9. NAV

`trading.service.ts` → `getPortfolio`: `nav_vnd = cash_available + cash_reserved + cash_pending + pending_cash_dividend + Σ(giá hiện tại × quantity_total)`. Cổ phiếu chờ về đã nằm trong `quantity_total` nên được định giá tự động; tiền cổ tức chờ nhận được cộng thêm. Bảng xếp hạng (`leaderboard`) dùng cùng công thức. Vị thế đã bán hết nhưng còn tiền cổ tức chờ được liệt kê với `quantity_total = 0` cho tới khi trả xong.

## 10. Test đã chạy (05/10/2026, local)

| Bộ test                                                                               | Kết quả                                                               |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Backend `npm run typecheck`, `npm run lint`, `npm run contracts:check`                | Sạch                                                                  |
| Backend `npx vitest run test/unit`                                                    | 87 file / 843 test pass (gồm 36 test `trading-rights.domain.test.ts`) |
| Backend `npm run test:integration` (Testcontainers)                                   | 11/11 pass                                                            |
| Backend `npm run test:system` (Testcontainers, migration 0013 chạy thật)              | 19 file / 53 test pass                                                |
| `test/system/trading-rights.system.spec.ts`                                           | 8/8 pass — chi tiết bên dưới                                          |
| Frontend `npm run contracts:generate && npm run contracts:check`, `typecheck`, `lint` | Sạch                                                                  |
| Frontend `npx vitest run src/pages/demo-trading`                                      | 9 file / 33 test pass (gồm 7 + 2 test mới)                            |

Các ca bắt buộc của spec trong `trading-rights.system.spec.ts` (fake port VCI, đồng hồ giả từng mốc ngày, giá cố định):

- **TEST 1** BFC 100 CP giá vốn 49.900, cổ tức 4.000 đ/CP: sau GDKHQ giá vốn 45.900, chờ nhận 400.000; ngày thanh toán tiền vào khả dụng, chờ nhận về 0.
- **TEST 2** HTN 1.400 CP giá vốn 7.300, tỷ lệ 20%: 280 CP chờ về, giá vốn 6.083, tổng 1.680, khả dụng 1.400; ngày AIS `issue_date` 280 CP thành khả dụng.
- **TEST 3** Idempotency: chạy sync lặp và refresh đồng thời, mỗi bước chỉ áp dụng một lần (ledger/entitlement không trùng).
- **TEST 4** Không có quyền: giá vốn, tiền, NAV không đổi.
- Thêm: mua đúng ngày GDKHQ → `no_entitlement`; bán hết ngày GDKHQ vẫn nhận tiền; cổ tức cổ phiếu chưa có AIS giữ `pending_stock`; sự kiện quyền mua bị bỏ qua.

Ghi chú: `npm run format:check` (backend) báo 2 file **có sẵn trên HEAD** chưa đúng Prettier (`scripts/copy-assets.ts`, `test/unit/identity-classification.test.ts`); không sửa vì ngoài phạm vi. Chưa chạy UI acceptance thủ công và chưa chạy trên môi trường giống production.

## 11. Xác nhận phạm vi

- Chỉ màn "Danh mục → Nắm giữ" thay đổi giao diện. Không thêm trang/modal/tab/biểu đồ/thông báo/lịch sử.
- Không sửa dữ liệu, bảng hay luồng lệnh/khớp lệnh/T+2 hiện có ngoài hai điểm ghép nối trong `refresh` và `getPortfolio`.
- Không deploy, không bật job trên production; job mới bật mặc định khi runtime worker được deploy với mã này (tắt bằng `JOB_TRADING_RIGHTS_SYNC_ENABLED=false`). `deployment_date` của policy chỉ cho phép sự kiện có GDKHQ từ ngày migration trở đi.
- Việc còn lại thuộc vận hành: chạy migration, theo dõi `events_review` trong kết quả job (sự kiện VCI đổi điều khoản sau khi đã áp dụng hoặc giá vốn âm) và quyết định xử lý tay.

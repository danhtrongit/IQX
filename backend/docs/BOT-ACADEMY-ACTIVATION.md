# Kích hoạt Bot từ Học viện

Policy `iqx-bot-academy-activation-1` dùng cùng tài khoản Bot và 100.000.000 VND demo đã cấp một lần. Bot V1 chờ điều kiện; Bot V2 giao dịch theo revision cấu hình Học viện đã có hiệu lực.

## Ma trận giữ, đổi và loại bỏ

| Tập tin / luồng                                      | Xử lý                                                 | Học viện                                                | Cấu hình chung                | Bot                                               | Backtest                                          |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | ----------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `academy/**`                                         | Giữ việc cấp quyền tách khỏi kích hoạt                | Bài học chỉ mở năng lực                                 | Không tự bật Mua/Bán          | Không phát sinh lệnh khi học xong                 | Không đổi                                         |
| `strategy-config/**`                                 | Giữ revision, quyền và phiên hiệu lực làm nguồn chung | Lưu ON/OFF, tham số, toán tử theo từng phía             | Một record dùng chung         | Pin revision hiệu lực cho mỗi run                 | Chỉ đọc revision được chọn                        |
| `bots/**`                                            | Đổi policy quyết định                                 | Mua/Bán là AND các điều kiện được cấp quyền và đang bật | Không có cờ áp dụng Bot riêng | Chờ khi Mua rỗng; stop độc lập; không TP cố định  | Không dùng policy Bot                             |
| `market-integration/bot-market-snapshot.provider.ts` | Giữ 5 bộ lọc Săn mã; loại query và verdict 5 lớp AI   | Không ảnh hưởng nội dung                                | Không đọc AI làm cổng         | Thiếu close/L1 chặn riêng mã, không chặn cả phiên | Không đổi feed Backtest                           |
| `quant/v2/**`                                        | Thêm evidence cho rule, giữ kết quả evaluator cũ      | Hiển thị đúng cùng rule                                 | Cùng toán hạng và Kleene AND  | Ghi `condition_snapshot`                          | Profile no-stop/next-open/sweep không rò sang Bot |
| Cổng `candidateGate`, 3/5 lớp, veto Tin tức/Nội bộ   | Loại khỏi Bot                                         | Không xóa phân tích phục vụ tính năng khác              | Không ảnh hưởng rule kỹ thuật | Không query, chặn, veto hay xếp hạng bằng AI      | Không đổi                                         |
| Săn mã Khối ngoại/Tự doanh 3/5 **phiên**             | Giữ                                                   | Không đổi                                               | Không đổi                     | Vẫn là nguồn ứng viên                             | Không đổi                                         |

Nguồn Săn mã hiện tại giữ nguyên công thức: TB20 khối lượng dùng 20 phiên trước T; GTGD20 dùng 20 phiên gần nhất có T; L1 là trung bình true range 14 phiên từ OHLCV VCI. Migration policy không đổi các công thức này.

## Migration và cutover

Migration `0012_bot_academy_activation.sql` cho phép `take_profit_vnd` rỗng, giữ constraint cho giá trị legacy còn lại, thêm revision/evidence cho vị thế và quyết định, và thêm `policy_version` cho receipt. Không xóa cột, không cập nhật dữ liệu và không sinh giao dịch.

- Drain các run đang xử lý trước khi deploy migration và build mới.
- Policy mới chỉ áp dụng cho run được tạo sau deploy. Run đã pin hoặc đang chạy giữ nguyên snapshot.
- Receipt V1 cũ vẫn được xác minh bằng legacy adapter; không ghi lại hash, reason hay lịch sử.

## Bảo toàn dữ liệu

Giữ nguyên tài khoản, funding, tiền, `qty_open`, giá vốn, phí, amplitude, stop, execution, receipt và decision. `take_profit_vnd` cũ chỉ là giá trị audit và không còn kích hoạt bán. Vị thế có stop thiếu hoặc không hợp lệ phải ghi `missing_stop`; không tạo stop từ L1 hiện tại.

Schema hiện hành vẫn giữ constraint stop dương và nhỏ hơn giá vào. Nhánh `missing_stop` bảo vệ trường hợp dữ liệu import/legacy bị hỏng hoặc snapshot không đọc được; migration không nới constraint stop và không sửa dữ liệu.

## Đối chiếu trước và sau deploy

Vận hành phải lưu kết quả các truy vấn sau ở cùng một mốc nhất quán trước/sau:

| Nhóm          | Số liệu bắt buộc                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tài khoản Bot | Số `bot_accounts`; tổng `initial_cash_vnd`; tổng `cash_vnd`                                                                                    |
| Cấp vốn       | Số ledger có idempotency key `bot:v1:funding:%`; tổng `amount_vnd`                                                                             |
| Vị thế        | Tổng; số `open`/`closed`; tổng `qty_open`, `entry_value_vnd`, `entry_fee_vnd`                                                                  |
| Giao dịch     | Tổng `bot_executions`; tổng mua/bán, gross, phí, thuế, cash delta                                                                              |
| Lịch sử run   | Số `bot_run_receipts`; số `bot_decisions`                                                                                                      |
| Cột mới       | Ngay sau migration, `entry_config_revision`, `decision_config_revision`, `condition_snapshot`, `policy_version` đều có số row khác NULL bằng 0 |

Chênh lệch các số liệu bảo toàn hoặc cột mới đã được backfill là điều kiện dừng cutover.

## Rollback

Drain run và giữ migration additive. Chỉ redeploy build trước nếu build đó đã có guard chỉ-stop/policy mới; nếu không, phải giữ scheduler và worker Bot tạm dừng. Receipt cũ vẫn xác minh. Không drop cột mới, không xóa evidence và không sửa lịch sử. Rollback không được bật lại nhánh V1 tự mua hoặc dùng `take_profit_vnd` làm trigger.

## Tập tin WP1 đã thay đổi

| Tập tin                                                                  | Trạng thái và vai trò                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `backend/src/modules/bots/bot.domain.ts`                                 | Sửa: policy bất biến, hash, reason code, xếp hạng, stop và sizing số nguyên.                    |
| `backend/src/modules/bots/bot.legacy.ts`                                 | Thêm: adapter chỉ đọc để xác minh receipt V1 cũ.                                                |
| `backend/src/modules/bots/bot.service.ts`                                | Sửa: pin receipt, thoát stop/Học viện, mua theo revision, sổ sách, reason/evidence và read API. |
| `backend/src/modules/bots/bot.shared-config.ts`                          | Sửa: receipt policy/legacy, validate config/quyền/hash và evidence hai phía.                    |
| `backend/src/modules/bots/bot.types.ts`                                  | Sửa: kiểu receipt, position, condition snapshot và response mới.                                |
| `backend/src/modules/bots/bots.module.ts`                                | Sửa: shared-config reader trở thành dependency bắt buộc.                                        |
| `backend/src/modules/bots/index.ts`                                      | Sửa: export policy, legacy adapter và contract Bot.                                             |
| `backend/src/modules/market-integration/bot-market-snapshot.provider.ts` | Sửa: bỏ query/layer AI, giữ 5 bộ lọc, tách close/L1 theo từng mã.                               |
| `backend/src/modules/quant/v2/index.ts`                                  | Sửa: export evaluator có evidence.                                                              |
| `backend/src/modules/quant/v2/rules.ts`                                  | Sửa: thêm resolved operands mà không đổi kết quả rule cũ.                                       |
| `backend/src/modules/quant/v2/signals.ts`                                | Sửa: thêm Kleene AND có evidence theo phía.                                                     |
| `backend/src/modules/quant/v2/types.ts`                                  | Sửa: kiểu evidence và resolved operands.                                                        |
| `backend/src/platform/config/environment.ts`                             | Sửa: bỏ schema `BOT_SHARED_CONFIG_ENABLED`; giữ `STRATEGY_V2_ENABLED`.                          |
| `backend/src/platform/openapi/enrich-openapi.ts`                         | Sửa: schema overview/conditions, position legacy TP và journal evidence.                        |
| `backend/migrations/0012_bot_academy_activation.sql`                     | Thêm: migration additive cho TP nullable, revision/evidence và policy version.                  |
| `backend/docs/BOT-ACADEMY-ACTIVATION.md`                                 | Thêm: cutover, bảo toàn, rollback và audit WP1.                                                 |
| `backend/test/unit/bots-domain.test.ts`                                  | Sửa: policy/hash, ranking, stop và sizing.                                                      |
| `backend/test/unit/bots-shared-config.test.ts`                           | Sửa: receipt/config/evidence và các nhánh service-level.                                        |
| `backend/test/unit/bots-contract.test.ts`                                | Thêm: contract read API và metadata policy.                                                     |
| `backend/test/unit/bots-provider.test.ts`                                | Thêm: không query AI, L1/close theo mã và Săn mã C05/C06.                                       |
| `backend/test/unit/provider-integration.test.ts`                         | Sửa hẹp: thay assertion 4 layer AI đã lỗi thời bằng `layers = {}` và không query AI.            |
| `backend/contracts/openapi-v2.json`                                      | Sinh lại: OpenAPI Bot.                                                                          |
| `backend/contracts/client/index.ts`                                      | Sinh lại: export client contract.                                                               |
| `backend/contracts/client/types.gen.ts`                                  | Sinh lại: type client contract.                                                                 |
| `frontend/contracts/endpoint-inventory.json`                             | Sinh lại: inventory contract theo generator của repo.                                           |
| `frontend/contracts/openapi-v2.json`                                     | Sinh lại: bản OpenAPI frontend.                                                                 |
| `frontend/contracts/source-lock.json`                                    | Sinh lại: khóa nguồn contract.                                                                  |
| `frontend/src/lib/generated/backend-v2.ts`                               | Sinh lại: client frontend; không sửa tay.                                                       |

Phạm vi ngoại lệ gồm assertion cũ trong `provider-integration.test.ts` và artifact contract do generator sinh ra. `cd backend && npm run contracts:generate` sinh backend contract; repo còn cần `cd frontend && npm run contracts:generate` để đồng bộ client và manifest frontend. Các thay đổi Học viện, strategy-config, test quant và Backtest khác thuộc work package song song; WP1 không sửa chúng.

## Audit chuỗi legacy còn lại

Lệnh audit: `grep -rnE "take_profit|supporting_count|min_supporting_layers|candidateGate|BOT_SHARED_CONFIG_ENABLED" backend/src`.

| Nhóm tập tin / chuỗi                                                                                                                                                                              | Lý do còn lại                                                                                                                                             | Có tham gia quyết định Bot mới?                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `bots/bot.domain.ts`: `fixed_take_profit_enabled`                                                                                                                                                 | Thuộc frozen policy và cố định bằng `false`.                                                                                                              | Không; đây là cam kết tắt TP.                  |
| `bots/bot.legacy.ts`: `min_supporting_layers`, `take_profit_l1_multiplier`                                                                                                                        | Snapshot V1 chỉ đọc để xác minh hash `73df...`; module không export engine giao dịch cũ.                                                                  | Không.                                         |
| `bots/bot.service.ts`: `take_profit_vnd`                                                                                                                                                          | Tên cột DB được giữ; lệnh mua mới ghi `NULL`, API đọc lại dưới tên `legacy_take_profit_vnd`.                                                              | Không; không có nhánh thoát TP.                |
| `bots/bot.service.ts`: `supporting_count`                                                                                                                                                         | Cột execution legacy vẫn tồn tại; lệnh mới ghi `NULL`, journal giữ field nullable để đọc lịch sử.                                                         | Không; không xếp hạng hay gate theo field này. |
| `bots/bot.types.ts`: `take_profit_vnd`                                                                                                                                                            | Kiểu row nội bộ bám cột DB nullable để ánh xạ legacy audit.                                                                                               | Không.                                         |
| `platform/openapi/enrich-openapi.ts`: `legacy_take_profit_vnd`, `supporting_count`                                                                                                                | Contract Bot công khai giữ TP audit và journal legacy nullable.                                                                                           | Không.                                         |
| `platform/openapi/enrich-openapi.ts`: `original_take_profit_vnd`                                                                                                                                  | Contract Cap 8 của tài khoản người dùng, tách khỏi tài khoản Bot.                                                                                         | Không.                                         |
| `strategy-backtests/**`, `quant/backtest.engine.ts`, `quant/quant.service.ts`, `quant/templates.ts`, `quant/quant.schemas.ts`, `quant/v2/advanced/system.ts`, `quant/v2/types.ts`: `take_profit*` | Profile nghiên cứu/Backtest độc lập vẫn hỗ trợ sweep/target; Bot không đọc profile này.                                                                   | Không.                                         |
| `admin/admin-vt.service.ts`, `journey/core/**`, `journey/cap3/**`, `journey/cap8/**`, `trading/**`: `take_profit*`                                                                                | Kế hoạch thoát, chấm hành trình và tài khoản tự giao dịch; ngoài module/tài khoản Bot.                                                                    | Không.                                         |
| `strategy-config/strategy-config.ports.ts`: `BOT_SHARED_CONFIG_ENABLED`                                                                                                                           | Chỉ là tên cũ trong comment; không còn schema env, symbol, `ConfigService.get` hay runtime gate. Port `SHARED_CONFIG_READER` hiện là dependency bắt buộc. | Không.                                         |
| `candidateGate`                                                                                                                                                                                   | Không có hit trong `backend/src`; cổng AI đã bị loại.                                                                                                     | Không.                                         |

## Giới hạn kiểm chứng còn lại

Fixture system `backend/test/system/bot-mascot.system.spec.ts` đã được cập nhật theo policy Học viện trong follow-up: chờ khi chưa bật Mua, grant/lưu revision qua service thật, mua có stop và bán theo close. Kiểm chứng runtime vẫn bị chặn vì chưa có stack PostgreSQL/Redis; xem mục system spec bên dưới.

Unit test không chứng minh constraint/rollback PostgreSQL, lock/unique khi nhiều worker, hay phối hợp BullMQ. Nghiệm thu các phần này cần `TEST_DATABASE_URL` và `TEST_REDIS_URL`; khi hai biến chưa được cấp, không được kết luận đã hoàn tất production.

## Kiểm chứng sau tích hợp

Policy hash: `b7bab5780da2276447cd3dcc3890e267bab597a12bae5d3bd99f49fa859cc849`. Legacy V1 hash: `73df87d8fdf044b2bbab7d80dd1896ee8bda551ab9395dcee908d82bcdce871e`.

Receipt và market snapshot được INSERT trong cùng transaction sau khi lấy dữ liệu. Worker khóa tài khoản, kiểm tra lại tập vị thế, rồi kiểm tra run thắng theo account/phiên. Nếu run đã tồn tại, dùng receipt và dữ liệu của run đó. Không ghi lại policy/config/grants/data hash. Lỗi nguồn trước INSERT không tạo receipt dở dang; retry có thể lấy dữ liệu lại trước lần tạo run đầu tiên. Run legacy đang dở phải được drain trước deploy; build mới không thực thi policy mới trên receipt legacy.

Evidence giữ `lhs`/`rhs` là số hoặc NULL. Rule thuộc/không thuộc dải đặt `rhs: null` và ghi hai biên số trong `rhs_lower`/`rhs_upper`; rule giao cắt có thêm `previous_lhs` và `previous_rhs`. Các field evidence bổ sung không thay đổi kết quả evaluator hoặc profile Backtest.

| Mã cũ                                                   | Mã dùng cho quyết định mới                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Không có cấu hình hiệu lực / không có Mua bật           | `waiting_for_academy_conditions` / `no_active_buy_conditions`                         |
| `shared_config_buy_false` / `shared_config_buy_missing` | `academy_buy_not_met` / `academy_condition_missing`                                   |
| `bought` / `shared_config_sell`                         | `academy_buy` / `academy_sell`                                                        |
| `already_open`                                          | `already_holding`                                                                     |
| `blocked_at_start`, `already_traded_in_run`             | `already_holding` nếu còn giữ; nếu đã thoát thì `rebuy_same_session_blocked`          |
| `insufficient_cash`, `below_board_lot`                  | `insufficient_cash_or_lot`                                                            |
| `symbol_weight_limit` / `buy_limit_reached`             | `symbol_limit` / `session_buy_limit`                                                  |
| `hold_within_thresholds`                                | `no_active_sell_conditions`, `academy_sell_not_met`, hoặc `academy_condition_missing` |
| Giá đóng cửa thiếu/không hợp lệ                         | `invalid_close`                                                                       |
| NAV nền, phí/lô hoặc sổ tiền không dùng được            | `ledger_error`; không dựng tiền/NAV để mua                                            |
| Stop không hợp lệ                                       | `missing_stop`; chỉ cảnh báo, không tự dựng stop                                      |
| AI gate/veto và `take_profit`                           | Không phát sinh trong run policy mới; lịch sử giữ nguyên                              |

`FakeBotDatabase` chỉ kiểm chứng nhánh xử lý và dữ liệu SQL được gửi. Rollback mô phỏng trong test **không chứng minh** rollback PostgreSQL, constraint SQL, unique lock hoặc concurrency nhiều worker. Các phần đó cần stack DB/Redis tích hợp.

## Ma trận nghiệm thu theo case ID

Tên test dưới đây là tên có thể tìm trực tiếp trong `backend/test/unit/`. PASS chỉ nói về unit test đã chạy, không thay nghiệm thu DB, feed production hay UI. Các test A01/A03, B01–B05, F01/F03/F04/F08 thuộc phần đã có của worker khác và được chạy cùng toàn bộ suite; WP1 không sửa chúng.

| ID  | File / tên test                                                                                                               | Kết quả                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A01 | `academy.test.ts` — A01 grading a quiz only inserts grants and never creates a bot account or grants capital                  | PASS (unit)                        |
| A02 | `bots-shared-config.test.ts` — A02 initializes one 100m account and a no-config run waits without trading                     | PASS (unit)                        |
| A03 | `academy.test.ts` — A03 passing a lesson inserts a grant only and never writes shared config or auto-enables indicators       | PASS (unit)                        |
| A04 | `bots-shared-config.test.ts` — A04 repeated graduation initialization does not duplicate account or funding                   | PASS (unit)                        |
| A05 | `bots-shared-config.test.ts` — A05 Buy can open a position while Sell is inactive                                             | PASS (unit)                        |
| A06 | `bots-shared-config.test.ts` — A06 Sell-only config with no position neither buys nor short-sells                             | PASS (unit)                        |
| A07 | `bots-shared-config.test.ts` — A07 stop protection remains active after every Academy side is disabled                        | PASS (unit)                        |
| A08 | `bots-shared-config.test.ts` — A08 later Academy revisions reuse the same account and policy stage                            | PASS (unit)                        |
| B01 | `strategy-config.test.ts` — B01 master ON + Buy ON + Sell OFF is active only on E_buy and keeps Sell params stored            | PASS (unit)                        |
| B02 | `strategy-config.test.ts` — B02 master OFF keeps children; re-enabling restores the saved choices without enabling both sides | PASS (unit)                        |
| B03 | `strategy-config.test.ts` — B03 both children OFF saves master OFF; master ON with both OFF is 422 SIDE_REQUIRED              | PASS (unit)                        |
| B04 | `strategy-config.test.ts` — B04 locks ungranted indicators and rejects tampered ops / client actor fields with real codes     | PASS (unit)                        |
| B05 | `strategy-config.test.ts` — B05 changing Buy params leaves Sell params (period 10, level 75) untouched                        | PASS (unit)                        |
| B06 | `bots-shared-config.test.ts` — B06 two active Buy indicators use AND and one false blocks entry                               | PASS (unit)                        |
| B07 | `bots-shared-config.test.ts` — B07 empty Buy set never falls back to the legacy strategy                                      | PASS (unit)                        |
| B08 | `bots-shared-config.test.ts` — B08 empty Sell set holds regardless of legacy target and age                                   | PASS (unit)                        |
| B09 | `bots-shared-config.test.ts` — B09 missing Buy data does not block an independent Academy Sell                                | PASS (unit)                        |
| B10 | `bots-shared-config.test.ts` — B10 a condition true only before T is not carried into T                                       | PASS (unit)                        |
| B11 | `bots-shared-config.test.ts` — B11 a position opened at T is not evaluated for same-run sale                                  | PASS (unit)                        |
| B12 | `bots-shared-config.test.ts` — B12 a starting position sold at T cannot be bought back at T                                   | PASS (unit)                        |
| B13 | `bots-shared-config.test.ts` — B13 membership with missing operands remains missing, never true by negation                   | PASS (unit)                        |
| B14 | `bots-shared-config.test.ts` — B14 Bot respects a saved less-than operator on the Buy side                                    | PASS (unit)                        |
| C01 | `bots-shared-config.test.ts` — C01 missing AI layers do not block an otherwise valid Academy Buy                              | PASS (unit)                        |
| C02 | `bots-shared-config.test.ts` — C02 very-negative news or insider layers do not veto an Academy Buy                            | PASS (unit)                        |
| C03 | `bots-shared-config.test.ts` — C03 AI deterioration alone does not sell a position                                            | PASS (unit)                        |
| C04 | `bots-domain.test.ts` — C04 ranks only by filter count, trading value, then symbol                                            | PASS (unit)                        |
| C05 | `bots-provider.test.ts` — C05 %s keeps 3/5-session positive-flow semantics and requires a positive total                      | PASS (unit)                        |
| C06 | `bots-domain.test.ts` — C06 unions duplicate filter ids, ranks before the 50-candidate cap                                    | PASS (unit)                        |
| C07 | `bots-shared-config.test.ts` — C07 exits do not require the symbol to remain in the Hunt candidate set                        | PASS (unit)                        |
| C08 | `bots-shared-config.test.ts` — C08 missing L1 skips only that Buy candidate                                                   | PASS (unit)                        |
| D01 | `bots-shared-config.test.ts` — D01 entry 20,000 with L1 500 stores stop 19,000 and no take-profit                             | PASS (unit)                        |
| D02 | `bots-shared-config.test.ts` — D02 close equal to stop sells all at close                                                     | PASS (unit)                        |
| D03 | `bots-shared-config.test.ts` — D03 close below stop sells at actual close rather than the threshold                           | PASS (unit)                        |
| D04 | `bots-shared-config.test.ts` — D04 intraday low is irrelevant when official close remains above stop                          | PASS (unit)                        |
| D05 | `bots-shared-config.test.ts` — D05 current L1 never moves the stored protective stop                                          | PASS (unit)                        |
| D06 | `bots-shared-config.test.ts` — D06 missing current L1 does not disable a stored stop                                          | PASS (unit)                        |
| D07 | `bots-shared-config.test.ts` — D07 an Academy Sell signal executes even while the position is at a loss                       | PASS (unit)                        |
| D08 | `bots-shared-config.test.ts` — D08 legacy take-profit 22,000 is non-operative at close 22,500                                 | PASS (unit)                        |
| D09 | `bots-shared-config.test.ts` — D09 simultaneous stop and Sell signal creates one stop-loss execution                          | PASS (unit)                        |
| D10 | `bots-shared-config.test.ts` — D10 holding more than 60 sessions never creates an implicit exit                               | PASS (unit)                        |
| D11 | `bots-shared-config.test.ts` — D11 missing one close neither fakes its exit nor blocks another valid stop                     | PASS (unit)                        |
| D12 | `bots-shared-config.test.ts` — D12 Bot stop execution uses same-session close without user settlement mutation                | PASS (unit)                        |
| E01 | `bots-shared-config.test.ts` — E01 NAV 100m, price 20,000, lot 100 and 0.1% fee buys 500 shares                               | PASS (unit)                        |
| E02 | `bots-shared-config.test.ts` — E02 the second Buy uses locked NAV basis and reduced current cash                              | PASS (unit)                        |
| E03 | `bots-shared-config.test.ts` — E03 invalid candidates are skipped and the cap counts successful Buys only                     | PASS (unit)                        |
| E04 | `bots-shared-config.test.ts` — E04 Sell count is uncapped while new Buys remain capped at two                                 | PASS (unit)                        |
| E05 | `bots-shared-config.test.ts` — E05 a symbol held or sold in the run stays blocked across retry                                | PASS (unit)                        |
| E06 | `bots-shared-config.test.ts` — E06 a position above 30% is not automatically rebalanced                                       | PASS (unit)                        |
| E07 | `bots-shared-config.test.ts` — E07 failed sell ledger write rolls back sale and prevents buying with proceeds                 | PASS (unit)                        |
| E08 | `bots-shared-config.test.ts` — E08 reconciliation failure leaves no fake Buy committed                                        | PASS (unit)                        |
| F01 | `strategy-config.test.ts` — F01 saves at 08:00, 11:00 and 20:00 VN on trading day T schedule the next trading day             | PASS (unit)                        |
| F02 | `bots-shared-config.test.ts` — F02 retries reuse the pinned config and source snapshot                                        | PASS (unit)                        |
| F03 | `strategy-config.test.ts` — F03 unusable calendar stores calendar_unavailable, a null session and never reports effective     | PASS (unit)                        |
| F04 | `strategy-config.test.ts` — F04 stale revision is 409 REVISION_CONFLICT; replay and idempotency reuse use the real codes      | PASS (unit)                        |
| F05 | `bots-shared-config.test.ts` — F05 legacy position fields remain unchanged and legacy TP is non-operative                     | PASS (unit)                        |
| F06 | `bots-shared-config.test.ts` — F06 no verified Academy selection cannot auto-activate legacy V1 Buy                           | PASS (unit)                        |
| F07 | `bots-shared-config.test.ts` — F07 retry of a completed run writes no duplicate execution or extra Buy allowance              | PASS (unit)                        |
| F08 | `strategy-backtests.test.ts` — F08 reads only the pinned shared revision and writes no bot/shared-config rows                 | PASS (unit)                        |
| F09 | UI/content; ngoài WP1                                                                                                         | NOT-RUN (không chạy UI nghiệm thu) |
| F10 | `bots-shared-config.test.ts` — F10 preserves and verifies the frozen V1 receipt without rewriting history                     | PASS (unit)                        |

Phần tích hợp của A02/A04 (unique funding), D12 (hồi quy thanh toán), E05/E07/E08 (retry/rollback/sổ), F02/F05/F07/F10 (pin, migration, concurrency, bảo toàn lịch sử): **NOT-RUN**, thiếu `TEST_DATABASE_URL` và `TEST_REDIS_URL`. Fake có mô phỏng rollback nhưng không chứng minh transaction/constraint/row-lock PostgreSQL. F09 và kiểm tra UI/nhãn nội dung bằng trình duyệt không được nghiệm thu trong WP1.

## Lệnh kiểm chứng cuối

Môi trường: macOS sandbox, Node `v24.21.0`, ngày 2026-10-05. Không deploy, chạy migration trên DB thật hoặc commit.

| Thư mục    | Lệnh                                                                                                               | Kết quả                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend`  | `npm test`                                                                                                         | 817 PASS, 5 FAIL; 88/89 file PASS. Cả 5 lỗi thuộc `test/unit/realtime.websocket.test.ts`: `listen EPERM 127.0.0.1` do sandbox. Không có lỗi Bot/Academy/config/Backtest/quant. |
| `backend`  | `npx vitest run test/unit/bots-shared-config.test.ts --reporter=dot`                                               | 56/56 PASS sau guard retry/ordering cuối                                                                                                                                       |
| `backend`  | `npx vitest run test/unit/bots-provider.test.ts`                                                                   | 7/7 PASS                                                                                                                                                                       |
| `backend`  | `npx vitest run test/unit/bots-contract.test.ts`                                                                   | 4/4 PASS                                                                                                                                                                       |
| `backend`  | `npx vitest run test/unit/bots-domain.test.ts test/unit/quant-v2-engine.test.ts test/unit/quant-v2-config.test.ts` | 93/93 PASS                                                                                                                                                                     |
| `backend`  | `npm run typecheck`                                                                                                | PASS                                                                                                                                                                           |
| `backend`  | `npm run lint`                                                                                                     | PASS (0 warning)                                                                                                                                                               |
| `backend`  | `npm run contracts:generate`                                                                                       | PASS; OpenAPI + backend client sinh lại                                                                                                                                        |
| `backend`  | `npm run contracts:check`                                                                                          | PASS; build + OpenAPI + client khớp                                                                                                                                            |
| `frontend` | `npm run contracts:generate`                                                                                       | PASS; 352 operations, 234 calls được inventory, 15 unmapped được generator báo                                                                                                 |
| `frontend` | `npm run typecheck`                                                                                                | PASS                                                                                                                                                                           |
| `frontend` | `npm run contracts:check`                                                                                          | PASS                                                                                                                                                                           |
| `frontend` | `npm run lint`                                                                                                     | PASS                                                                                                                                                                           |
| `frontend` | `npm run build`                                                                                                    | PASS; cảnh báo bundle >500 kB, không phải lỗi build                                                                                                                            |
| Root       | `git diff --check --` các đường dẫn WP1 và generated contracts                                                     | PASS; không sửa whitespace của `AGENTS.md` có sẵn                                                                                                                              |

Toàn bộ test chạy lần đầu có lỗi do fake/contract đang tích hợp; các lỗi WP1 đã sửa và chạy lại theo kết quả cuối ở trên. Log full-run lưu trong `backend/node_modules/.cache/iqx-wp1-final-tests.log` (không version-control). Không coi 5 test bị sandbox chặn là PASS.

Sau sửa cuối về scalar evidence, `cd backend && npx vitest run test/unit/bots-shared-config.test.ts test/unit/bots-domain.test.ts --reporter=dot`: **71/71 PASS**; `npm run typecheck` và `npm run lint` chạy lại đều PASS.

## System spec Học viện — trạng thái sau tích hợp

> Cập nhật của orchestrator: phần dưới do WP1 viết khi chưa có PostgreSQL/Redis. Sau đó spec này **đã chạy thật** bằng Testcontainers (`TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock npx vitest run --config vitest.system.config.ts test/system/bot-mascot.system.spec.ts`): 5/5 PASS sau khi sửa fixture đăng nhập (chi tiết ở mục "Kiểm chứng độc lập"). Các ca A02 S, A04 S, D01, D12 S, E01, F07 S chuyển từ NOT-RUN sang PASS (system). Migration 0001→0012 cũng được áp lên DB mới trong `npm run test:integration` (11/11 PASS).

`backend/test/system/bot-mascot.system.spec.ts` dùng Nest app và service thật để cấp quyền qua bài kiểm tra Học viện, lưu revision cấu hình, tạo receipt và giao dịch. Dữ liệu thị trường dùng fixture; trạng thái tốt nghiệp giữ cách seed `cap6_progress` có sẵn trong spec. Không ghi trực tiếp vào bảng Bot. Các ca system vẫn **NOT-RUN**, chưa chứng minh transaction/constraint/concurrency trên PostgreSQL.

| Case ID | Nội dung system spec                                                  |
| ------- | --------------------------------------------------------------------- |
| A02 S   | Tốt nghiệp, chưa có điều kiện Mua: chờ, không giao dịch, pin policy.  |
| A04 S   | Cấp vốn 100 triệu đúng một lần, đọc API/retry không cấp lại.          |
| D01     | Giá vào 20.000, L1 500: stop 19.000, take-profit NULL, lưu revision.  |
| D12 S   | Close phiên sau chạm stop: bán toàn bộ cùng phiên, lý do `stop_loss`. |
| E01     | NAV 100 triệu, phí fixture 0,1%, lô 100: mua 500 cổ phiếu.            |
| F07 S   | Retry phiên mua/bán trả cùng run ID, không thêm execution hay vốn.    |

CI/infra chạy từ thư mục `backend` với DB/Redis **test riêng biệt** (stack migrate và reset dữ liệu fixture):

```sh
IQX_TEST_EXTERNAL_SERVICES=1 \
TEST_DATABASE_URL='postgresql://<user>:<password>@127.0.0.1:<port>/iqx_v2_system_bot' \
TEST_REDIS_URL='redis://127.0.0.1:<dedicated-port>/15' \
npm run test:system -- test/system/bot-mascot.system.spec.ts
```

Bỏ phần đường dẫn sau `--` để chạy toàn bộ `npm run test:system`. Harness bắt buộc `IQX_TEST_EXTERNAL_SERVICES=1`, DB có tên `iqx_v2_system_*` hoặc `iqx_v2_test_*`, Redis cổng riêng khác 6379 và database khác 0. Khi không truyền URL, harness dùng Testcontainers; môi trường hiện tại không chạy stack này.

`backend/tsconfig.json` include `test/**/*.ts` và chỉ exclude `node_modules`, `dist`, `coverage`, nên `cd backend && npm run typecheck` (`tsc --noEmit`) kiểm tra trực tiếp system spec. `vitest.system.config.ts` include `test/system/**/*.system.spec.ts`; spec không nằm trong `npm test` unit mặc định.

Kiểm chứng follow-up: `cd backend && npm run typecheck` và `npm run lint` đều **PASS**. Lệnh `npx tsc --noEmit --listFilesOnly -p tsconfig.json` liệt kê đúng `test/system/bot-mascot.system.spec.ts`. `npx vitest list --config vitest.system.config.ts test/system/bot-mascot.system.spec.ts` thu thập **5 test** thành công, không thực thi hook hay test. Prettier và `git diff --check` cho spec đều PASS. Các kết quả này không thay đổi trạng thái system **NOT-RUN**.

## Tích hợp các work package và kiểm chứng độc lập

Phần này do orchestrator ghi sau khi gộp ba work package (WP1 backend core, WP2 frontend/nội dung Học viện, WP3 test có sẵn) và tự chạy lại toàn bộ kiểm chứng ngoài sandbox của worker. Ngày 05/10/2026, nhánh `main`, chưa commit, chưa deploy.

### Thay đổi ngoài WP1

| Tập tin                                                                                                                                            | WP  | Nội dung                                                                                                                                                                          | Học viện               | Cấu hình chung          | Bot                         | Backtest |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------- | --------------------------- | -------- |
| `frontend/src/pages/demo-trading/insights/api.ts`                                                                                                  | WP2 | Kiểu `BotConditions`, `BotProductStage`, `policy_version`, `product_stage`, `legacy_take_profit_vnd`, `config_status`                                                             | Không                  | Không                   | Đọc DTO mới                 | Không    |
| `frontend/src/pages/demo-trading/insights/derive.ts`                                                                                               | WP2 | 18 nhãn reason code mục 13.2; nhãn cũ gắn "(policy cũ)"                                                                                                                           | Không                  | Không                   | Nhật ký hiển thị đúng lý do | Không    |
| `frontend/src/pages/demo-trading/insights/bot-panel.tsx`                                                                                           | WP2 | Trạng thái chờ/mua/bán theo `conditions.state`, hint "Bản #R có hiệu lực từ phiên", bỏ dòng "Chốt lời", mô tả "Bot hoạt động như thế nào" mới; không có toggle hay điều khiển tay | Không                  | Không                   | UI mục 13.3                 | Không    |
| `frontend/src/pages/academy/config-draft.test.ts`, `academy-page.test.tsx`                                                                         | WP2 | +6 test quy tắc 4.2 (master OFF giữ con, master ON khôi phục, Cancel không commit, cả hai OFF → master OFF, lưu một phía giữ phía kia)                                            | Kiểm chứng UI cấu hình | Kiểm chứng quy tắc 4.2  | Không                       | Không    |
| `backend/src/modules/academy/content/CURRICULUM.json`                                                                                              | WP2 | 18 chương đều gắn `"bot": "Bot V2"`                                                                                                                                               | Nhãn chương            | Không                   | Không                       | Không    |
| `academy/content/chapters/01/*.json`, `chapters/02/*.json`                                                                                         | WP2 | Bỏ câu chữ "bộ lọc V1 của Bot"/"nền V1" → "cấu hình Bot"; đáp án không đổi; `questions_version` đổi theo nội dung                                                                 | Nội dung bài 01/02     | Không                   | Không                       | Không    |
| `backend/test/unit/strategy-config.test.ts`, `academy.test.ts`, `strategy-backtests.test.ts`, `quant-v2-config.test.ts`, `quant-v2-engine.test.ts` | WP3 | +19 test cho A01, A03, B01–B05, B06, B09, B10, B13, B14, F01, F03, F04, F08; không đổi mã sản phẩm                                                                                | Kiểm chứng cấp quyền   | Kiểm chứng lưu/hiệu lực | Không                       | F08      |

### Kiểm chứng độc lập (ngoài sandbox worker)

Môi trường: macOS, Node 24, Docker qua colima. Lệnh chạy từ thư mục ghi ở cột đầu.

| Thư mục    | Lệnh                                                                                        | Kết quả                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `backend`  | `npm test`                                                                                  | 89/89 file, **822/822 PASS** (5 test websocket bị sandbox codex chặn trước đó chạy PASS ở đây)                       |
| `backend`  | `npm run typecheck`                                                                         | PASS (chạy lại sau khi cập nhật system spec)                                                                         |
| `backend`  | `npm run lint`                                                                              | PASS, 0 warning                                                                                                      |
| `backend`  | `npm run contracts:check`                                                                   | PASS (OpenAPI + client khớp)                                                                                         |
| `backend`  | `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock npm run test:integration`       | **11/11 PASS** trên PostgreSQL 17 + Redis 7 do Testcontainers tạo; migration 0001→0012 chạy sạch                     |
| `backend`  | `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock npm run test:system`            | 18 file: 16 PASS; `bot-mascot` 2 FAIL do time bomb token (đã sửa, xem dưới); `runtime-worker` 1 FAIL ngoài phạm vi   |
| `backend`  | `... npx vitest run --config vitest.system.config.ts test/system/bot-mascot.system.spec.ts` | **5/5 PASS** sau khi sửa fixture đăng nhập (A02 S, A04 S, D01, D12 S, E01, F07 S đã chạy thật trên PostgreSQL/Redis) |
| `frontend` | `npm run typecheck`                                                                         | PASS                                                                                                                 |
| `frontend` | `npm run lint`                                                                              | PASS                                                                                                                 |
| `frontend` | `npx vitest run`                                                                            | 60/60 file, **246/246 PASS**                                                                                         |
| `frontend` | `npm run contracts:check`                                                                   | PASS                                                                                                                 |

Định dạng mã nguồn: `cd backend && npx prettier --check .` (script `format:check`) sau khi format các file đợt này chỉ còn 2 file có sẵn ở HEAD (`scripts/copy-assets.ts`, `test/unit/identity-classification.test.ts`). Ở frontend, 5 file sửa tay đã được format; file `src/lib/generated/backend-v2.ts` **không** format vì là bản sao nguyên văn từ backend và có khóa SHA-256 trong `contracts/source-lock.json` (format sẽ làm `contracts:check` lỗi); đã tái sinh bằng `npm run contracts:generate`.

Kết quả system suite:

- `bot-mascot.system.spec.ts` lần chạy đầu lỗi 2 test với `401 SESSION_REVOKED` khi gọi `GET /api/v2/bot/mascot`. Nguyên nhân có sẵn từ trước, không do policy mới: spec fake `Date` về `2026-09-28`, nên `refresh_tokens.expires_at` = 28/09 + `REFRESH_TOKEN_EXPIRE_DAYS` (7) = 05/10/2026 19:00 (+07), trong khi guard so với `now()` của PostgreSQL (giờ thật). Spec ở HEAD cũng lỗi y hệt kể từ mốc đó. Sửa trong `graduatedUser`: đăng ký/đăng nhập trên đồng hồ thật rồi fake lại đúng mốc cũ (chỉ sửa test). Sau sửa: 5/5 PASS.
- `runtime-worker.system.spec.ts` lỗi `expected_count 1, nhận 0` ở job `billing.expiry-sweep` (bảng `premium_subscriptions`). Không liên quan module Bot, Học viện hay cấu hình chung; lặp lại khi chạy riêng. Đã kiểm tra trên worktree HEAD sạch để xác nhận có sẵn từ trước (xem phần kết luận cuối tài liệu).
- 16 file còn lại (route-matrix 683 route, trading-journey, journey-domain, admin, auth, billing, referrals, realtime, media, ownership, portfolio, trading-plan, domain-runtime, alerts…) PASS, không hồi quy do thay đổi Bot/DTO.

Lưu ý Testcontainers với colima: nếu không đặt `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`, Ryuk không mount được `~/.colima/default/docker.sock` (HTTP 500 "operation not supported") và cả suite bị bỏ qua. Đây là cấu hình môi trường, không phải lỗi mã.

### Ghi chú review độc lập

- Review theo 12 bất biến của spec (không V1 fallback, Kleene AND theo quyền, stop trước và độc lập cấu hình, không TP, xếp hạng trước cap, 12% kèm phí/30%/tối đa 2 lệnh mua, phiên hiệu lực, receipt pin, bỏ cổng AI, migration additive, idempotent, DTO khớp frontend): **12/12 đạt**.
- `and3([])` trong `quant/v2/rules.ts` vẫn trả `true` cho danh sách rỗng ở mức thư viện (giữ nguyên để không đổi Backtest). Đường Bot không thể gặp trường hợp này: `sideSignals`/`sideSignalsWithEvidence` và `bot.shared-config.ts` trả `false` khi không có chỉ báo active, và `validateConfig` bắt số rule bằng số template của registry (tối thiểu 1 rule mỗi phía).
- `LegacyBotPositionOut` trong `frontend/src/lib/generated/backend-v2.ts` có sẵn từ trước (HEAD), không thuộc thay đổi này.

## Kết luận kiểm chứng trên HEAD sạch (orchestrator)

Chạy lại hai spec system trên worktree tách từ commit `4a904061` (chưa có thay đổi của đợt này), cùng Testcontainers:

| Spec                                        | Trên HEAD sạch                                                   | Trên nhánh làm việc (sau sửa)                  |
| ------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| `test/system/bot-mascot.system.spec.ts`     | 2/3 FAIL `401 SESSION_REVOKED` (time bomb refresh token, có sẵn) | 5/5 PASS (fixture đăng nhập trên đồng hồ thật) |
| `test/system/runtime-worker.system.spec.ts` | 1/1 FAIL `expired_count` 0 ≠ 1 (billing expiry sweep)            | 1/1 FAIL, lỗi y hệt; ngoài phạm vi spec Bot    |

Lỗi `runtime-worker` không được sửa trong đợt này vì không thuộc module Bot/Học viện/cấu hình chung và tái hiện độc lập với thay đổi; cần xử lý riêng.

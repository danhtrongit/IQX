# Bộ lọc 4.0: ghi chú dev và bàn giao

Spec: `IQX-Bo-Loc-SPEC.md` v1.1 (bổ sung cho `BO-LOC-SPEC.md`), mẫu giao diện `IQX-Bo-Loc-MAU.html`.
Nhánh: `feat/screener-v4`. Migration: `0041_screener_v4.sql`. Mobile (`mobile/`) không đổi.

Tài liệu này trả lời các mục bàn giao của spec §11.4: bảng rà code (§0.3), câu trả lời §9 và §10, danh sách file, kết quả test (gồm bảng đối chiếu Bot ở §11.2.8).

---

## 1. Tóm tắt thiết kế

Một lần lọc chạy hai bước:

1. **Bước 1, toàn thị trường, không gọi nhà cung cấp.** Phạm vi Thị trường (Sàn, Rổ, Ngành, Vốn hóa, GTGD TB N, Giá) và các dòng Kỹ thuật được tính trên **nến ngày đã lưu** (`market_daily_bars`) của mọi cổ phiếu đang niêm yết, tại **một phiên T duy nhất**.
2. **Bước 2, VCI, chỉ cho mã còn lại.** Chỉ tiêu cơ bản chỉ tính cho các mã đạt mọi dòng kỹ thuật. Giới hạn `SCREENER_MAX_UNIVERSE = 500` chỉ áp cho bước này.

Hệ quả:

- Lọc chỉ Thị trường hoặc chỉ Kỹ thuật không cần bước 2 và **không bị cắt 500** (kết quả gồm mọi mã trong phạm vi).
- Giá và mọi chỉ số kỹ thuật lấy từ DNSE (nến ngày đã điều chỉnh), VCI chỉ còn cho báo cáo tài chính, nhóm báo cáo và số cổ phiếu lưu hành.
- `calculation_version` = `iqx-fund-2.0+tech-1.0`.

### Đối tượng API (không thêm endpoint mới)

| Endpoint | Thay đổi |
|---|---|
| `POST /strategy/screener/run` | Nhận định nghĩa 4.0 (`schema_version: "4.0"`: `market`, `technical`, `rules`, `columns`). Trả **toàn bộ** hàng ứng viên trong `results` (A→Z). Header thêm `session_date`, `price_source`, `fundamental_candidates`, `data_quality.market`, `data_quality.technical`. 503 `MARKET_DATA_UNAVAILABLE` khi chưa có phiên T. 422 `SECTOR_REVIEW_REQUIRED` khi định nghĩa còn cờ ngành ICB cũ |
| `GET /strategy/screener/results/{id}` | Thêm `sort` và `order`; sắp xếp **toàn bộ** kết quả rồi mới cắt trang (`limit` tối đa 500). Khóa sắp xếp: `symbol`, `name`, `exchange`, `group`, `price`, `change_pct`, `market_cap`, `avg_value`, `metric:<id>`, `tech:<row key>`. Ô trống luôn xếp cuối, hòa thì theo mã tăng dần |
| Bộ lọc đã lưu, kết quả đã lưu, danh mục | Lưu và đọc định nghĩa 4.0; kết quả đã lưu và danh mục đóng băng cột Thị trường, cột Kỹ thuật và `session_date`; `provenance.criteria` = `{market, technical, rules, columns, data_mode}` |
| Bộ lọc 3.0 đã lưu | Đọc được: sàn đơn → `market.exchanges`; ngành ICB → `needs_review: "sector"` kèm `legacy_sector` (giao diện bắt chọn lại ngành, máy chủ từ chối chạy) |
| Danh mục chỉ báo kỹ thuật (spec §7) | **Dùng lại** `GET /strategy/registry/technical` của Bot, không thêm API (16 mục, mở hết, không kiểm tra capability) |

---

## 2. Bảng rà code (spec §0.3)

| Hạng mục | Nơi có sẵn / nơi thêm | Dùng thế nào |
|---|---|---|
| Định nghĩa dòng điều kiện (`RULES`) | `src/modules/quant/v2/registry/technical-registry.json`, nạp bởi `loadTechnicalRegistry()` | Giao diện dựng thẻ từ đúng registry này (Bot cũng dùng). Bộ lọc không có bản sao |
| Hàm tính đúng/sai | `evaluateIndicatorSide`, `createSeriesCache` (`quant/v2`), cùng hàm mà `sessionSideSignalWithEvidence` của Bot (`bots/bot.shared-config.ts`) và Backtest gọi | `screener.technical.ts` chỉ là lớp bọc: dựng `SideConfig` từ mục của bộ lọc, gọi `evaluateIndicatorSide`, định dạng ô. **Không có hàm tính riêng** |
| Dữ liệu nến ngày toàn thị trường | **Chưa có** (Bot/Backtest đọc nến từng mã qua `QuantMarketDataAdapter`) | Thêm `market_daily_bars` + job `market.daily-bars` (mục 3) |
| Rổ chỉ số theo kỳ | Bảng `index_membership_snapshots`, `IndexMembershipService`/`IndexMembershipProvider` (Bot dùng VN30) | Mở rộng cho VN100, VNMidCap, VNSmallCap, HNX30 (mục 4, câu 3) |
| Nhóm báo cáo tài chính của từng mã | Trước đây chỉ nhận diện lúc chạy (`screener.statements.ts`, `financials.industry.ts: detectIndustry`) | Thêm cột `symbols.statement_template`, job `market.symbol-attributes` điền bằng **cùng hàm** `detectIndustry` |
| Số cổ phiếu lưu hành (Vốn hóa) | VCI `ratio` quý, trường `number_of_shares_mkt_cap` (đã dùng cho chỉ tiêu định giá) | Cột `symbols.shares_outstanding`, cùng job trên |
| Cửa sổ nến của Bot | `QuantMarketDataAdapter`: `400 × 1,6 + 30 = 670` ngày lịch (~479 phiên) | Bộ lọc đánh giá đúng cửa sổ này nên EMA/Wilder khởi tạo cùng nến đầu như Bot |

---

## 3. Dữ liệu và job mới

### Migration `0041_screener_v4.sql` (chạy được lệch thứ tự, không đụng bảng cũ)

- `market_daily_bars(symbol PK, bars jsonb, bar_count, first_date, last_date, source, price_unit, adjusted, fetched_at)`: một dòng mỗi mã; `bars` là các mảng cột `{d, o, h, l, c, v}` tăng dần theo ngày; giá nghìn đồng, đã điều chỉnh (DNSE).
- `symbols.statement_template` (`thuong|nh|ck|bh`), `statement_template_at`, `shares_outstanding`, `shares_at`.
- `screener_runs.session_date`, `result_snapshots.session_date`. Danh mục lưu `session_date` trong `scope`/`provenance` (jsonb).

### Job (biến môi trường theo quy ước `JOB_<TÊN>_ENABLED`; mặc định bật)

| Job | Chu kỳ | Việc làm |
|---|---|---|
| `market.daily-bars` | 10 phút, mọi ngày, tự rỗng khi đã đủ | Sau 15:15 ICT, khi VNINDEX có nến mới hơn kho thì làm mới các mã chưa lấy từ lúc đóng cửa phiên đó: 1 lệnh DNSE mỗi mã, song song 6, giữ 520 phiên gần nhất. Mã lỗi hoặc không có dữ liệu được hỏi lại sau 1 giờ. Kho rỗng thì tự khởi tạo |
| `market.symbol-attributes` | 10 phút | Điền `statement_template` (làm mới 7 ngày) và `shares_outstanding` (làm mới 1 ngày) từ VCI, tối đa 500 mã mỗi lượt |
| `market.index-membership` (có sẵn) | như cũ | Thêm lưu thành phần VN100, VNMidCap, VNSmallCap, HNX30 mỗi ngày giao dịch (lỗi một rổ không làm hỏng job, Bot chỉ phụ thuộc VN30) |

**Không có biến môi trường mới nào ngoài hai cờ job trên**; giới hạn 500 vẫn là hằng `SCREENER_MAX_UNIVERSE` (không đổi).

**Phiên T** = ngày gần nhất mà ít nhất 85% mã trong kho đã có nến và đã đóng cửa (mốc 15:15 ICT, cùng `isCompletedVietnamSession` của Bot). Làm mới dở dang không bao giờ lộ ra một phiên mà chỉ một phần mã có.

### Khởi tạo khi triển khai lần đầu

Kho rỗng nên lần lọc đầu trả 503 `MARKET_DATA_UNAVAILABLE` cho tới khi `market.daily-bars` chạy xong một vòng (khoảng 1.650 lệnh DNSE; đo được 0,06 đến 0,3 giây mỗi mã tùy thời điểm, song song 6 nên một vòng khoảng 1 đến 2 phút). Cột Ngành và Vốn hóa cần `market.symbol-attributes` (2 lệnh VCI mỗi mã, 500 mã mỗi lượt 10 phút: khoảng 40 phút cho cả thị trường). Có thể chạy tay hai job đó ngay sau khi triển khai. Mã chưa có thuộc tính chỉ bị loại khỏi phạm vi **khi** bộ lọc đang dùng đúng mục đó (đếm trong `data_quality.market.excluded_missing`).

---

## 4. Trả lời mục 9 và mục 10

### Mục 9: giới hạn 500 mã

- **Đã có kho OHLCV ngày toàn thị trường chưa? Đủ bao nhiêu phiên?** Chưa có; đã thêm `market_daily_bars`, giữ **520 phiên đóng cửa** mỗi mã (yêu cầu ≥ 250 cho SMA200; cửa sổ Bot ~479 phiên).
- **Thời gian chạy bước 1 toàn thị trường** (đo trên máy dev một lõi, 1.650 mã × 520 nến thật từ DNSE, không tính đọc DB từ máy chủ):

  | Trường hợp | Thời gian |
  |---|---|
  | Chỉ Thị trường (không kỹ thuật) | dưới 0,3 giây (đọc và parse kho 37,5 MB: 0,14 giây) |
  | 3 chỉ báo (RSI, MACD, Khối lượng) | 0,8 giây |
  | 16 chỉ báo, mặc định Mua của Bot | 11 giây |
  | 16 chỉ báo, **bật mọi dòng** (29 dòng, xấu nhất) | 13,6 giây (8,2 ms mỗi mã) |

  Vòng lặp nhường event loop mỗi 25 mã nên không chặn các request khác. Bộ nhớ đỉnh khoảng 260 MB cho cả phép đo (kho + kết quả); máy chủ đọc nến theo cụm 200 mã.
- **Có cần chạy nền hoặc hàng đợi không?** Chưa cần ở bản này: trường hợp thường gặp dưới 2 giây, xấu nhất khoảng 14 giây trên máy dev (nginx mặc định cho phép 60 giây mỗi request; kiểm tra lại `proxy_read_timeout` của template Hestia khi triển khai). Nếu sau này muốn nhanh hơn cho tổ hợp nhiều chỉ báo thì hướng là chuyển bước 1 sang worker thread, không cần hàng đợi.
- **Đề xuất cuối và mức giới hạn.** Giữ `SCREENER_MAX_UNIVERSE = 500` (không đổi), áp **chỉ cho bước 2** (VCI). Còn hơn 500 mã sau bước 1 thì cắt A→Z, đặt `universe_truncated = true`, `fundamental_candidates = n`, và giao diện hiện đúng câu của spec: `Sau lọc thị trường và kỹ thuật còn {n} doanh nghiệp, nhiều hơn giới hạn tính chỉ tiêu cơ bản của một lần lọc. Thu hẹp điều kiện để xét đủ.` Không có điều kiện cơ bản và không có cột tham khảo cơ bản thì bỏ qua bước 2, không áp giới hạn.

### Mục 10

| # | Câu trả lời |
|---|---|
| 1 | Như mục 9. Giới hạn 500 không đổi, chỉ áp cho bước 2 |
| 2 | **DNSE chart-api** (`services.entrade.com.vn/chart-api/v2/ohlcs/stock?resolution=1D`), cùng nguồn Bot dùng. Lưu 520 phiên đã điều chỉnh. Nến phải qua cùng bộ kiểm tra của Bot (`acceptBar`: giá > 0, high ≥ max(open, close), low ≤ min(open, close), khối lượng ≥ 0), không vá nến |
| 3 | `index_membership_snapshots` mỗi ngày giao dịch; nguồn VCI `groupSymbols` (VN30, VN100, VNMidCap, VNSmallCap, HNX30). Lịch sử cơ cấu chỉ có từ ngày triển khai: với phiên T, dùng snapshot đúng phiên hoặc gần nhất trước T trong **45 ngày**; quá hạn hoặc chưa có thì rổ đó coi là chưa có thành phần: không mã nào thuộc rổ, `data_quality.market.baskets_unavailable` ghi tên rổ và giao diện hiện ghi chú (`baskets-note`) thay vì kết quả rỗng khó hiểu |
| 4 | `symbols.statement_template`, điền bởi `detectIndustry` trên báo cáo kết quả kinh doanh VCI: **cùng hàm** dùng để trả `not_applicable` cho chỉ tiêu `non_financial`, nên hai cách nhận diện không thể lệch nhau. Làm mới 7 ngày |
| 5 | `number_of_shares_mkt_cap` của VCI (cùng nguồn chỉ tiêu định giá), `symbols.shares_outstanding`, làm mới 1 ngày. Vốn hóa = `giá đóng cửa T × số cổ phiếu` (tỷ đồng). Chưa có số cổ phiếu thì mã bị loại khi bộ lọc có điều kiện Vốn hóa |
| 6 | "TB N phiên" của **mục Khối lượng kỹ thuật** là hàm của Bot (`volume`: `lookback` N, `mult` k): khối lượng phiên T so với `k × trung bình N phiên TRƯỚC`; r1 là dòng lag-1, r2 không có giá trị T−1. "GTGD TB N" của **Thị trường** là trung bình `giá đóng cửa × khối lượng khớp` của N phiên gần nhất **tính cả T** (đúng spec §2.1), đơn vị tỷ đồng; chưa đủ N phiên thì mã không nằm trong phạm vi |
| 7 | Stochastic lấy nguyên hàm và tham số trong registry của Bot (không có biến thể riêng của bộ lọc) |
| 8 | Dùng chung mốc **15:15 ICT** của Bot (`isCompletedVietnamSession`) để biết phiên đã đóng. Job làm mới khi VNINDEX có nến mới hơn kho; phiên T là ngày mới nhất đã đóng mà ≥ 85% mã trong kho đã có nến |

---

## 5. Quyết định và chỗ khác spec

- **Cột tham khảo cơ bản chỉ gửi khi có điều kiện cơ bản.** Lọc chỉ Thị trường/Kỹ thuật không gửi `columns`, nên không cần bước 2 và không bị cắt 500 (đúng ý §9 mục 4).
- **Mã không qua bước 1 hiện "Chưa xét"** ở cột cơ bản (không phải "Thiếu dữ liệu"): chúng chưa được tính, không phải tính không ra.
- **Mã quá giới hạn 500 không được liệt kê** (chưa được xét thì không báo đạt hay không đạt); câu thông báo nói rõ số còn lại.
- **Ghi chú `baskets-note`** (thêm ngoài spec): rổ không có thành phần tại T được nói rõ thay vì trả danh sách rỗng.
- **Dấu thập phân**: `parseDisplayInput` coi cả `,` và `.` là dấu thập phân (quy ước có sẵn), nên `1.000` được đọc là 1; ô nhập số của Thị trường theo đúng quy ước đó.
- **Áp dụng cho Bot**: lấy mọi mã đạt bằng cách đọc hết các trang (`getAllPassedSymbols`, 500 mỗi trang) vì lọc toàn thị trường có thể vượt 500 mã đạt; quy tắc HOSE, bằng chứng kết quả, hiệu lực từ phiên kế tiếp giữ nguyên.
- **Khối lượng**: dòng 2 không có giá trị T−1 (`previous: null`); dòng 1 là dòng lag. Giao diện chi tiết hiển thị đúng theo đó.
- **Định giá cơ bản vs cột Giá** (spec §5, lưu ý): P/E, P/B và các chỉ tiêu định giá vẫn dùng giá price board VCI gần thời gian thực khi chạy; cột Giá và Vốn hóa dùng giá đóng cửa T từ DNSE. Trong giờ giao dịch hoặc sau khi có thông tin mới, hai giá có thể khác nhau. Không đổi, theo yêu cầu của spec.
- **Giá điều chỉnh**: nến lưu là giá điều chỉnh (như Bot), nên lịch sử chỉ báo khớp Bot; chuỗi của một mã được thay mới toàn bộ mỗi lần làm mới vì giá điều chỉnh đổi khi có quyền.
- **Sắp xếp** thực hiện ở máy chủ trên toàn bộ kết quả đã lưu; kết quả không đổi giữa các lần đổi thứ tự.
- **`HSX`** được đọc là `HOSE` ở cả bộ lọc lẫn dữ liệu mã.

---

## 6. File đã sửa

**Backend** (`backend/`)

- Migration: `migrations/0041_screener_v4.sql`.
- Dữ liệu và job: `src/modules/market-integration/{daily-bars.service,symbol-attributes.service,index-membership.provider,market-integration.module,index}.ts`, `src/modules/market-data/{providers/dnse.provider,providers/http.transport,market-data.module,index}.ts`, `src/modules/runtime/{runtime.schedules,runtime.types}.ts`, `src/platform/domain-runtime.module.ts`.
- Bộ lọc: `src/modules/screener/{screener.service,screener.definition,screener.schemas,screener.market,screener.technical,screener.sort,screener-market-data.service,screener.ports,screener.repository,screener.registry,screener.metrics,screener.statements,screener.controller,screener.module}.ts`, `registry/filter.schema.json` (4.0), `registry/filter.schema.v3.json` (đọc 3.0).
- Lưu trữ: `src/modules/saved-filters/{saved-filters.definition,saved-filters.schemas,saved-filters.service,saved-results.service}.ts`.
- Hợp đồng sinh tự động: `contracts/openapi-v2.json`, `contracts/client/types.gen.ts`.
- Test: `test/unit/{screener-market,screener-sort,screener-technical-parity,screener-v4-service,market-daily-bars,screener-service,screener-definition,saved-filters,saved-results,strategy-sql.pg}.test.ts`, `test/unit/helpers/screener-fixtures.ts`.

**Frontend** (`frontend/`)

- Bộ lọc `src/pages/strategy/filter/`: `filter-tab.tsx`, `conditions.tsx` (Thị trường, Cơ bản, Kỹ thuật), `metric-library.tsx` (2 tab), `metric-names.ts` (khối, nhóm, tên theo Dashboard), `market.ts`, `technical.ts`, `technical-cell.ts`, `sort.ts`, `definition.ts`, `types.ts`, `units.ts`, `hooks.ts`, `api.ts`, `reasons.ts`, `results-panel.tsx`, `detail-dialogs.tsx`, `catalog-dialog.tsx`, `snapshot-table.tsx`, `save-dialogs.tsx`, `saved-filters-dialog.tsx`, `saved-lists-dialog.tsx`, `saved-results-dialog.tsx`.
- Dùng lại của Bot: `src/pages/demo-trading/bot/config/condition-rows.tsx` (thêm `labels` tùy chọn).
- Hợp đồng sinh tự động: `contracts/*`, `src/lib/generated/backend-v2.ts`.
- Test: `filter-v4.test.tsx` (mới, 41 ca), `definition.test.ts`, `market.test.ts`, `sort.test.ts`, `technical-cell.test.ts`, `technical.test.ts`, `metric-names.test.ts`, `units.test.ts`, `filter-tab.test.tsx`, `strategy-page.test.tsx`, `test-support.ts`.

---

## 7. Kiểm thử

### 7.1 Đối chiếu bộ lọc với Bot (§11.2.8) và không nhìn trước (§11.2.9)

`test/unit/screener-technical-parity.test.ts`: 60 mã (đa số đủ lịch sử Bot, một số mã mới niêm yết để có `NO_SIGNAL`) × 5 cấu hình mỗi chỉ báo (mặc định, bật mọi dòng, 3 cấu hình ngẫu nhiên hợp lệ; Khối lượng 5 cặp N, k, dấu). Tham chiếu là chính tín hiệu phiên của Bot (`sessionSideSignalWithEvidence` trên một SharedConfig chỉ bật chỉ báo đó), đối tượng là `evaluateTechnical`. So từng dòng: kết quả đúng/sai, trạng thái, số dòng, tổng hợp đạt và có ngoại lệ.

| Chỉ báo | Mã | Cấu hình | Dòng so sánh | true | false | NO_SIGNAL | Lệch |
|---|---|---|---|---|---|---|---|
| rsi | 60 | 5 | 480 | 206 | 254 | 20 | 0 |
| macd | 60 | 5 | 660 | 199 | 415 | 46 | 0 |
| ma | 60 | 5 | 600 | 104 | 450 | 46 | 0 |
| bollinger | 60 | 5 | 720 | 253 | 463 | 4 | 0 |
| ema | 60 | 5 | 660 | 113 | 527 | 20 | 0 |
| ma_cross | 60 | 5 | 300 | 1 | 283 | 16 | 0 |
| dmi | 60 | 5 | 480 | 87 | 371 | 22 | 0 |
| stochastic | 60 | 5 | 540 | 136 | 396 | 8 | 0 |
| cci | 60 | 5 | 300 | 8 | 278 | 14 | 0 |
| obv | 60 | 5 | 480 | 96 | 366 | 18 | 0 |
| mfi | 60 | 5 | 300 | 2 | 284 | 14 | 0 |
| cmf | 60 | 5 | 300 | 4 | 282 | 14 | 0 |
| donchian | 60 | 5 | 300 | 118 | 170 | 12 | 0 |
| roc | 60 | 5 | 300 | 2 | 284 | 14 | 0 |
| williams_r | 60 | 5 | 300 | 27 | 269 | 4 | 0 |
| volume | 60 | 5 | 600 | 243 | 349 | 8 | 0 |
| **Tổng** | 60 | 80 | **7.320** | 1.599 | 5.441 | 280 | **0** |

In lại bảng: `PARITY_REPORT=1 npx vitest run test/unit/screener-technical-parity.test.ts --reporter=verbose`.

Cùng file kiểm tra: **không nhìn trước** (kết quả tại T bằng kết quả của Bot tại chỉ số T trên chuỗi đầy đủ, hơn 500 phép so sánh), và phiên T không phải nến cuối thì mọi dòng là `NO_SIGNAL` (`no_session_bar`), không bao giờ đọc nến cũ hơn như T.

### 7.2 Các nghiệm thu khác

- §11.2.10 thiếu lịch sử: `NO_SIGNAL`, `Chưa đủ lịch sử giá`, mã được đếm vào "có điều kiện không tính được" và không đạt (backend `screener-v4-service`, frontend `filter-v4`).
- §11.2.11 GTGD TB N tính tay, mã không đủ N phiên bị loại (`screener-market.test.ts`).
- §11.2.12 chọn nhiều: HOSE + HNX là hợp; HOSE + VN30 là giao (backend và frontend).
- §11.2.13 không điều kiện: mọi doanh nghiệp trong phạm vi đều đạt.
- §11.3 lưu: bộ lọc 4.0 lưu đủ mọi dòng kỹ thuật kể cả dòng tắt và mở lại đúng; kết quả đã lưu và danh mục giữ cột Thị trường, Kỹ thuật, `session_date`; Áp dụng cho Bot chạy được từ kết quả có điều kiện kỹ thuật.
- SQL thật: `strategy-sql.pg.test.ts` chạy trên PostgreSQL thật với migration đến 0041 (5 ca); thêm một lượt thử tay trên cùng DB cho `DailyBarsService` (khởi tạo kho, phiên T, tick thứ hai không gọi lại nhà cung cấp), `SymbolAttributesService` (một mã lỗi không làm hỏng các mã khác) và truy vấn `universe`/`loadBars` của `ScreenerMarketDataService`.

### 7.3 Kết quả chạy cổng

Xem phần cuối commit hợp nhất; số liệu cuối cùng được ghi trong báo cáo bàn giao.

---

## 8. Chưa làm hoặc để ngỏ

- Chưa chạy trên dữ liệu máy chủ thật (kho còn rỗng cho tới khi job chạy); thời gian bước 1 ở mục 4 là đo trên máy dev bằng nến DNSE thật nhân ra cỡ thị trường.
- Lịch sử cơ cấu rổ chỉ có từ ngày triển khai; phiên T cũ hơn 45 ngày so với snapshot sớm nhất sẽ báo rổ chưa có thành phần.
- VCI từng chặn IP máy chủ (23/10, mở lại 4/11): nếu bị chặn lại, `market.symbol-attributes` không điền được Ngành và Vốn hóa, các mục này sẽ loại mã chưa có thuộc tính khỏi phạm vi và hiện trong `excluded_missing`. Phần giá và kỹ thuật (DNSE) không bị ảnh hưởng.
- Mobile không theo thay đổi này (tạm ngừng theo AGENTS.md).

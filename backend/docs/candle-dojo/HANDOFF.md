# Candle Dojo: bàn giao

Spec: `IQX-Candle-Dojo-SPEC-v1.2.md` + `IQX-Candle-Dojo-SPEC-v1.3-BoSung-MauNenTinhSan.md` (Downloads/Candle Dojo).
Nhánh: `feat/candle-dojo` (chưa merge, chưa push, chưa deploy). Migration: `0045_candle_dojo.sql`, `0046_candle_dojo_flashback_patterns.sql` (0044 để dành cho agent khác).

## 1. Cái gì nằm ở đâu

| Khu | Đường dẫn |
|---|---|
| Bộ nhận diện 47 thẻ (Phụ lục A), danh mục thẻ, danh mục 27 bài, luật chấm | `backend/src/modules/candle-dojo/shared/{detector,cards,lessons,grading}.ts` (bản gốc) và bản sao **nguyên văn** ở `frontend/src/lib/candle-dojo/` |
| Nội dung bài tập, đề thi đai (từ bản mẫu) | `backend/src/modules/candle-dojo/content/{exercises,exams}.json` (`exercises.json` cũng có ở frontend; `exams.json` chỉ ở server) |
| API, service, repository | `backend/src/modules/candle-dojo/candle-dojo.*.ts` (`/api/v2/candle-dojo/**`) |
| Bảng | `cd_user_progress`, `cd_lesson_progress`, `cd_exam_attempts`, `cd_user_cards`, `cd_rewards` (0045); `fb_dataset_pattern_runs`, `fb_dataset_patterns`, `fb_dataset_raw`, `fb_match_cards` (0046) |
| Màn hình | `frontend/src/pages/demo-trading/candle-dojo/**` (Dojo, bài học, thi đai, luyện công), mục Thẻ nến trong `frontend/src/pages/demo-trading/shop/**`, thẻ trong ván ở `frontend/src/pages/demo-trading/flashback/**` |
| Kiểm thử | `backend/test/unit/candle-dojo-*.test.ts`, `backend/test/unit/helpers/candle-dojo-memory.ts`, `frontend/src/lib/candle-dojo/candle-dojo.test.ts` |

### Một bộ mã dùng chung, hai bản sao

Bộ nhận diện, danh mục thẻ/bài và luật chấm là **một** bộ mã chạy ở server (chấm lại bài, Flashback) và ở trình duyệt (màn học). Bản gốc ở backend; bản ở `frontend/src/lib/candle-dojo/` là bản sao giống từng byte. `backend/test/unit/candle-dojo-shared-parity.test.ts` sẽ đỏ nếu hai bản lệch. Sửa bản backend rồi chép sang:

```
for f in detector cards lessons grading; do cp backend/src/modules/candle-dojo/shared/$f.ts frontend/src/lib/candle-dojo/$f.ts; done
cp backend/src/modules/candle-dojo/content/exercises.json frontend/src/lib/candle-dojo/content/exercises.json
```

## 2. Quyết định cho các điểm ở §12 của spec

| # | Điểm | Quyết định |
|---|---|---|
| 1 | Thẻ trong phòng Flashback có cược xu | Mặc định **bật** cho mọi ván (đúng "mặc định bật" của đề xuất). **Công tắc bật/tắt theo phòng chưa làm**: cần thêm cột vào `fb_rooms`, lược đồ tạo phòng và hộp thoại tạo phòng; để đợt sau nếu chủ sản phẩm vẫn muốn |
| 2 | Bài học mở bằng Premium hay miễn phí | Miễn phí cho mọi tài khoản đã đăng nhập (không kiểm Premium) |
| 3 | Thưởng đai | +300 xu mỗi lần **lên** đai, một lần cho mỗi đai: thi lại không thưởng thêm, đai không bao giờ hạ |
| 4 | 27 bài cho 47 thẻ | Giữ như bản mẫu: hai thẻ đối xứng học chung một bài |
| 5 | Đai trên avatar Flashback | **Chưa làm** (Flashback giữ nguyên avatar) |

Các quyết định khác tôi tự chốt:

- **Chế độ xem trước** (khối bên phải màn Dojo): chạy hoàn toàn ở máy khách, mở khoá mọi Dojo/bài để xem, không gọi API ghi, không đổi xu hay tiến độ thật. Thi đai không có chế độ xem trước vì đề và đáp án nằm ở server.
- **Luyện công mỗi ngày:** +20 xu **một lần mỗi ngày** theo giờ Việt Nam (`Asia/Ho_Chi_Minh`); chuỗi ngày tăng khi làm liên ngày, đứt thì về 1. Nộp trống (không tìm được mẫu nào) không nhận xu và không giữ chuỗi. Mở từ khi có đai vàng.
- **Thưởng bài:** +100 xu lần đầu mỗi bài (không cần đủ sao), Nhập môn +100 xu một lần. Sao lưu theo lần cao nhất; làm lại tệ hơn không hạ sao.
- **Server là nguồn sự thật:** máy khách chỉ gửi điều người học làm (chỗ chạm, bên đã chọn, đáp án từng câu thi) và giá đã xác nhận. Server chấm lại Săn nến/Song sinh, ra đề thi đai và **giữ đáp án** (không gửi xuống khi mở đề; chỉ báo đúng/sai kèm đáp án sau khi trả lời câu đó), quyết định sao, đai, thưởng, mở khoá thẻ.
- **Thưởng một lần, không trùng:** mọi thưởng đi qua `cd_rewards` (khoá chính `(user, reward_key)`) cộng khoá duy nhất `coin_ledger.unique_key`; mua thẻ khoá hàng ví (`ShopRepository.lockWallet`) và khoá chính `cd_user_cards (user, card)`. Hai lệnh gửi đồng thời chỉ có một lệnh ghi sổ.
- **Mở khoá thẻ:** mua được thẻ khi đã học xong bài của thẻ (đi hết 6 bước, không cần đủ sao). `price` theo bậc: 300/600/1.000/2.000/3.000 xu; yêu cầu mua kèm `expected_price_xu` và `catalog_version` để phát hiện giá hay danh mục đổi.
- **Sổ cái:** thêm `kind` `dojo_reward` (cộng) và `card_purchase` (trừ). Migration 0045 dựng lại `ck_coin_ledger_kind` từ **các giá trị đang có** của ràng buộc rồi thêm hai giá trị mới, nên áp được dù migration 0044 (agent khác) cũng thêm `kind`, theo thứ tự nào cũng được. Nhãn sổ cái có thêm `card_id`, `card_name`, `reward_key`.
- **Nội dung bài tập chỉ có một bộ cho mỗi bài** (lấy từ bản mẫu). Spec §7 đề xuất ≥ 5 bộ đề mỗi bài dựng từ kho VN100: **việc đó để lại** (xem mục 6).
- **Mở rộng sàn:** thẻ Việt Nam đọc biên độ theo sàn: HOSE 7%, HNX 10%, UPCoM 15% (bước giá 10/50/100 đồng ở HOSE, 100 đồng ở sàn còn lại).

## 3. Kiểm thử bộ nhận diện (Phụ lục B)

`backend/test/unit/candle-dojo-detector.test.ts`:

- đối chiếu từng phiên với bản gốc nguyên văn Phụ lục A (`test/fixtures/candle-dojo/detector-reference.cjs`) trên chuỗi mô phỏng và trên các chuỗi có hình mẫu chuẩn chèn vào;
- 43 hình mẫu chuẩn + 4 thẻ Việt Nam nhận đúng tên;
- ván Flashback mẫu cho đúng 13 thẻ của `flashback.hits`;
- không nhìn trước: kết quả tại phiên `i` chỉ phụ thuộc các phiên ≤ `i`;
- không trùng: với 120.000 nến mô phỏng không có hai thẻ cùng số nến khớp một phiên. `CANDLE_DOJO_STRESS_BARS=3000000` chạy 3 triệu nến; ở mức đó thỉnh thoảng có một cặp `dao_day`/`thap_day` đồng thời (bản gốc Phụ lục A cũng vậy, không phải lỗi bản cổng, nên bài kiểm chỉ đòi 0 trùng ở ≤ 1 triệu nến và ≤ 3 ở mức cao hơn). `pick` luôn chọn đúng một thẻ (nhiều nến thắng).

### Giới hạn của nội dung bản mẫu (cần biết)

Bài tập và đề thi trong bản mẫu là **cửa sổ 13-52 nến cắt từ chuỗi dài hơn**. Bộ nhận diện chỉ xét bối cảnh khi có ≥ 25 nến đứng trước (`ctx`, `j >= 25`), nên các thẻ phụ thuộc bối cảnh (Hammer, Engulfing...) **không thể nhận lại từ riêng cửa sổ**. Việc kiểm của bản mẫu (680 kiểm tra, `build.js`) chạy trên chuỗi đầy đủ, và `build.js` không có trong bộ giao. Vì vậy `candle-dojo-content.test.ts` kiểm cấu trúc dữ liệu và chỉ kiểm bằng bộ nhận diện các thẻ **không** phụ thuộc bối cảnh. Khi dựng lại ngân hàng bài tập từ kho VN100 (mục 6), lưu kèm kết quả nhận diện trên chuỗi đầy đủ.

## 4. Tiến độ và API

`GET /api/v2/candle-dojo/state`, `POST intro/complete`, `POST lessons/{lessonId}/complete`, `POST drill/complete`, `POST exams`, `POST exams/{attemptId}/answers`, `GET cards`, `POST cards/{cardId}/purchase`. Mã lỗi thao tác: `LESSON_LOCKED`, `DRILL_LOCKED`, `EXAM_LOCKED`, `EXAM_CLOSED`, `EXAM_ALREADY_ANSWERED`, `CARD_OWNED`, `CARD_LOCKED`, `PRICE_CHANGED`, `CATALOG_CHANGED`, `INSUFFICIENT_XU` (kèm `details[0]`: `balance_xu`, `price_xu`, `shortfall_xu`).

Kiểm thử dịch vụ: `candle-dojo-service.test.ts` (bộ nhớ). Kiểm SQL thật (opt-in):

```
CANDLE_DOJO_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/iqx_v2_test_<tên> \
  npx vitest run test/unit/candle-dojo-pg.test.ts
```

(database cục bộ, đã áp migration tới 0046; tên phải khớp `iqx_v2_test_*`.)

## 5. Flashback: mẫu nến tính sẵn (v1.3)

### Bảng (migration 0046)

`fb_dataset_pattern_runs` (mỗi lần tính: phiên bản kho, `detector_version`, `status` running/done/failed, tiến độ, số mẫu, log), `fb_dataset_patterns` (mỗi hàng là một mẫu: kho, mã, phiên cuối của mẫu, thẻ, số nến, `detector_version`), `fb_dataset_raw` (giá gốc OHLC và giá tham chiếu cho 4 thẻ Việt Nam), `fb_match_cards` (thẻ người chơi đã gặp trong từng ván, kèm `seen_at` cho nhãn "Đã gặp" ở Shop).

### Khi nào tính

- **Khi dựng kho:** bước 2b nằm giữa kiểm `min_symbols` và kích hoạt. Kho mới chỉ được kích hoạt sau một lần tính `done`; lỗi thì kho mới bị đánh `failed`, dữ liệu của nó bị xoá và có cảnh báo `pattern_failed`.
- **Chạy tay cho kho đang active:** `flashback-patterns-compute` (xem dưới).
- **Từ trang quản trị:** nút "Tính lại mẫu nến" (chạy ngay trong tiến trình API, không qua job runtime; đang chạy thì trả 409 `PATTERN_RUN_RUNNING`).
- Đổi `CANDLE_DETECTOR_VERSION` trong `shared/detector.ts` rồi tính lại: trang quản trị báo `outdated`. Các hàng của `detector_version` cũ **không bị xoá** để ván đang chơi (đã ghim phiên bản) không đổi thẻ giữa chừng.

### Chạy trên kho đang active ở production

Làm một lần, sau khi áp migration 0046 (và 0045):

```
# 0. Kiểm tra VCI truy cập được từ máy chủ (VCI từng chặn IP máy chủ production)
curl -s -o /dev/null -w "%{http_code}\n" https://trading.vietcap.com.vn

# 1. Chạy thử, không ghi gì (DB_READ_ONLY)
cd <thư mục release đang chạy>   # có dist/ và .env của API (DATABASE_URL tới iqx_v2_*)
node dist/scripts/flashback-patterns-compute.js

# 2. Chạy thật trên kho đang active
node dist/scripts/flashback-patterns-compute.js --apply
#   tuỳ chọn: --version N  --json  --concurrency 1-8 (mặc định 4)
#   hoặc: npm run flashback:patterns:compute -- --apply
```

- Mã thoát 0/1/2/3 (xem đầu `scripts/flashback-patterns-compute.ts`).
- Chạy thật lại trên kho đã tính sẽ **tính lại toàn bộ** và tạo một lần chạy `done` mới (không có chế độ "chạy bù" riêng). Giá gốc đã lưu được dùng lại nếu VCI lỗi, không bao giờ bị xoá.
- Cả kho VN100 (kho v1 đang active có 97 mã; mỗi mã khoảng 5 lần gọi VCI để lấy giá gốc, 4 luồng song song): chưa đo thời gian chạy thật trên production, hãy chạy thử (bước 1) trước để biết; kiểm lại ở trang quản trị → Kho dữ liệu Flashback → khối "Mẫu nến".
- Dựng lại kho bằng `node dist/scripts/flashback-dataset-build.js --apply` đã tự gồm bước 2b.
- Chưa có lần tính `done` thì Flashback chạy bình thường nhưng không có thẻ nào (lỗi tra cứu chỉ có nghĩa là "không có thẻ", ván không bao giờ lỗi vì thẻ).

### Quyết định kỹ thuật

- **Giá gốc:** VCI `price-history` (chưa điều chỉnh, đơn vị đồng, có giá tham chiếu chính thức kể cả ngày không hưởng quyền). Sàn lấy từ `symbols.exchange` (HOSE/HSX→HOSE, HNX/HASTC→HNX, UPCOM→UPCOM), mặc định HOSE. Trung vị giá đóng cửa gốc phải nằm trong 1.000-1.000.000 đồng, nếu không `rawPrices` báo lỗi (phát hiện nhầm đơn vị).
- **Thiếu giá gốc:** 4 thẻ Việt Nam bị bỏ qua cho các phiên đó, không bao giờ dùng giá điều chỉnh thay thế; cảnh báo `pattern_raw_missing` (mức high nếu không có giá gốc nào).
- **Chỉ số phiên:** `idx = start_idx + số phiên khởi tạo + số phiên xem + k − 1` với `k` là phiên vừa mở (bắt đầu từ 1); phần nến lịch sử và phần xem không có thẻ.
- **Lúc chơi:** một lần tra theo khoá chính trên `fb_dataset_patterns` sau khi giao dịch `next` đã ghi (best-effort, lỗi trả `null`); không chạy bộ nhận diện. Mua thẻ giữa ván có hiệu lực từ lần bấm kế tiếp, không hiện bù. Một ván ghim một `detector_version` trong bộ nhớ (tối đa 5.000 ván); khởi động lại API thì ván đang chơi dùng bản `done` mới nhất.
- **API:** `POST /flashback/matches/{id}/next` trả `{bar, me, card}` (`card` là `{id, n}` hoặc `null`); ảnh chụp ván có `cards: [{play_idx, card_id, card_n}]` (chỉ thẻ của chính người chơi, chỉ phiên đã mở hoặc cả ván khi đã kết thúc). Quản trị: `GET /api/v2/admin/flashback/dataset/patterns/{status,lookup,overview}`, `POST .../recompute`.
- **Kiểm thử:** `npx vitest run test/unit/flashback` (lõi tính, bước 2b, tra thẻ, quản trị, CLI) và `test/integration/flashback-patterns.integration.spec.ts` (PostgreSQL thật, cần Docker/testcontainers hoặc đặt biến theo spec).

## 5b. Giao diện: những điểm cần chủ sản phẩm xem

- **Flashback, máy tính:** khay "Thẻ trong ván" cao cố định 100 px cùng hàng với nút Phiên tiếp (thẻ 52 px cao 73 px cộng dòng "Phiên N", bản mẫu cũng tối thiểu 76 px). Để vừa một màn hình, `CHART_BOTTOM_RESERVE` trong `frontend/src/pages/demo-trading/flashback/use-chart-fit.ts` đổi từ 80 lên 144, nên biểu đồ thấp hơn khoảng 64 px trên cửa sổ cao. Spec §9.3 viết "không làm biểu đồ thấp đi", mâu thuẫn với kích thước thẻ; muốn giữ chiều cao biểu đồ thì đặt lại 80 và để trang cuộn nhẹ.
- **Flashback, `IQLineFlashback`:** thêm prop tuỳ chọn `renderOverlay` (lớp phủ không bắt chuột, nằm trên canvas, dưới chú giải) vì thành phần này không để lộ toạ độ nến; khung mẫu nến và nhãn dùng nó. Biểu đồ cũ (`?iqline=0`) cũng có khung và nhãn.
- **Chưa xem bằng trình duyệt thật:** khay thẻ, thẻ bay, khung trên biểu đồ Flashback, mục Thẻ nến trong Shop và panel (chỉ kiểm bằng test jsdom). Màn Dojo có spec Playwright `frontend/e2e/candle-dojo.spec.ts` (route giả, 390 px và 1280 px, sáng/tối) và màn học được chạy tay ở chế độ xem trước.
- **Săn nến:** mẫu đã tìm tô **xanh** kèm tên thẻ, mẫu bỏ sót tô vàng khi hết giờ (như bản mẫu và spec §5.1), để hai trạng thái không giống nhau.
- **Luyện công khi hôm nay đã làm:** nút đổi thành "Luyện thêm" và vẫn dùng được (server nhận lại, không cộng xu). Spec ghi "khoá/đã xong": đổi nếu muốn khoá hẳn.
- **Dojo → Shop:** nút "Mở Shop › Thẻ nến" mở Shop, tab Cửa hàng của mục Thẻ nến và cuộn tới mục đó (`requestCandleCardsFromDojo` trong `shop/candle-cards-store.ts`).
- **Panel Shop:** 5 mặt sau thẻ nhỏ ở khối THẺ NẾN vẽ bằng ô chuyển màu bậc có số thẻ (không dùng `CandleCard` úp vì dấu "?" của nó không hiện được số).
- **Hợp đồng:** sinh bằng `npm run contracts:generate` (backend rồi frontend). Kiểu sinh của `twins` ở `POST lessons/{id}/complete` mất `null` (trình sinh bỏ `null` ở enum có `nullable`); giao diện luôn gửi `a`/`b` nên không ảnh hưởng.
- **Gói mã:** `exercises.json` (~435 KB) được nạp bằng `import()` động trong màn học, thành một chunk riêng.

## 6. Việc còn lại (chưa làm trong nhánh này)

- **Ngân hàng bài tập VN100 (spec §7):** tác vụ nền dựng ≥ 5 bộ đề/bài từ kho VN100, kèm kết quả nhận diện trên chuỗi đầy đủ (v1.3 §8 gợi ý lấy mẫu thật từ `fb_dataset_patterns`). Hiện mỗi bài có một bộ đề lấy từ bản mẫu.
- **Công tắc thẻ theo phòng** (§12 #1) và **đai trên avatar Flashback** (§12 #5).
- **Chạy tính mẫu trên production** (mục 5) và kiểm một ván thật có thẻ.
- Mobile (`mobile/`) tạm ngừng theo AGENTS.md: không cập nhật; ledger label API đã có thêm trường mới (`card_id`, `card_name`, `reward_key`).


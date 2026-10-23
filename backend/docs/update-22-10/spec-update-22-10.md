# Spec cập nhật 22-10 · Flashback v1.2, kinh tế xu, Học viện v3.3, Dashboard phân tích v1

> Ngày: 2026-10-23 · Nguồn: `~/Downloads/update-22-10` (bản sao trong `specs/`, thư mục này không commit):
> - `IQX-Flashback-SPEC.md` (v1.1) và `IQX-Flashback-SPEC-BoSung.md` (v1.2), bản mẫu `IQX-Flashback-MAU.html`
> - `IQX-Hoc-Vien-SPEC.md` (v3.3), bản mẫu `IQX-Hoc-Vien-v3-MAU.html`
> - `IQX-Dashboard-Phan-Tich-SPEC.md` (v1), bản mẫu `IQX-Dashboard-Phan-Tich-MAU.html`
>
> **Mốc code:** `main` tại `4fa64c26`. Ba commit `4062f32d`, `ceef9b5c`, `4fa64c26` đã triển khai phần lớn bốn spec trên, kèm migration 0027–0030. Bản này **chưa deploy**: VPS vẫn chạy `20261017-academy-682cbca3`.
>
> **Tài liệu này là gì:** đối chiếu từng yêu cầu của spec nguồn với code hiện có. Nó chỉ ghi **phần còn thiếu, phần sai và phần lệch**, kèm cách sửa và tiêu chí nghiệm thu. Yêu cầu nào không nhắc ở đây thì code đã làm đúng spec nguồn. Khi tài liệu này và spec nguồn khác nhau thì làm theo tài liệu này.
>
> **Quy ước:** mã việc `FB-xx` (Flashback và xu), `HV-xx` (Học viện), `DB-xx` (Dashboard), `QA-xx` (kiểm thử). Mức ưu tiên: **P0** chặn phát hành, **P1** phải có trước khi phát hành, **P2** làm ngay sau, **P3** dọn dẹp. **[DECISION]** là điểm chủ sản phẩm chốt; giá trị in đậm là giá trị mặc định, dev làm theo giá trị đó cho tới khi có quyết định khác.

---

## 0. Tóm tắt

### 0.1 Hiện trạng

| Mảng | Mức hoàn thành | Ghi chú |
|---|---|---|
| Kinh tế xu (Flashback v1.1 §1) | Gần đủ | Giá Shop, tiến hoá, Premium bằng xu, đổi xu với Demo, vốn Demo 0đ, lợi nhuận theo vốn nạp ròng đều đã có. Còn lỗi hiển thị ở màn Demo |
| Flashback game (v1.1 §2–3) | Gần đủ | Còn lỗi `finish` làm lộ giá tương lai, bảng xếp hạng lộ `user_id` |
| Flashback tự tạo đề (v1.2) | **Có lỗi chặn phát hành** | Đề dài khoảng 72 giờ thay vì 48 giờ. Rổ VN30 không tự cập nhật. Khoá tác vụ không tin cậy. Chưa xác minh đơn vị giá |
| Học viện v3.3 | Đủ | 13 chương, 87 bài, 1 Phòng tập, mở chỉ báo và chỉ tiêu đúng. Còn khoảng 9 câu hỏi phải tính toán |
| Dashboard phân tích | Đủ khung, thiếu dữ liệu | 33 biểu đồ có đủ khuôn. 6 biểu đồ chưa có số liệu. Bộ vẽ chưa dùng chung với biểu đồ đại diện của Học viện |

**Kiểm tra ngày 2026-10-23:**
- Typecheck backend và frontend đều qua.
- `backend` chạy `vitest run`: 1.851 test qua, 13 bỏ qua, 0 lỗi.
- Các test Flashback chạy trên repository giả trong bộ nhớ. Chưa có test nào chạm khoá Postgres, ràng buộc duy nhất, chạy đồng thời hay đồng hồ tua nhanh.

### 0.2 Việc phải làm theo ưu tiên

| Mã | Ưu tiên | Việc |
|---|---|---|
| FB-01 | P0 | Sửa giờ đóng đề: đề mở đúng giờ phải đóng sau 48 giờ, không phải 72 giờ |
| FB-02 | P0 | Khoá tác vụ Flashback chạy trên một kết nối riêng |
| FB-03 | P0 | `finish` chỉ cho phép ở phiên 60, không lộ giá đóng cửa phiên 60 |
| FB-04 | P0 | Xác minh đơn vị giá (đồng hay nghìn đồng) và giá đã điều chỉnh của nguồn nến |
| FB-05 | P0 | Rổ VN30 tự cập nhật theo nguồn, ghi `effective_from` và `effective_to` |
| FB-06 | P1 | Join, Phiên tiếp và Đặt lệnh kiểm tra đề còn `open` và chưa quá `closes_at` |
| FB-07 | P1 | Giữ thưởng của tài khoản bị đánh dấu nghi gian lận để quản trị viên duyệt |
| FB-08 | P1 | Vai trò quản trị cao nhất cho các thao tác xem mã và tạm dừng |
| FB-09 | P1 | Gửi cảnh báo Flashback ra kênh kỹ thuật |
| FB-10 | P1 | Bảng xếp hạng không trả `user_id` và phiên đang chơi của người khác |
| DB-01 | P1 | Có số liệu cho 6 biểu đồ đang trống: EPS (3), ROIC (2), PEG |
| DB-02 | P1 | Dashboard và biểu đồ đại diện Học viện dùng chung một bộ khuôn |
| DB-03 | P1 | Định giá theo ngày dùng số cổ phiếu theo từng thời điểm |
| HV-01 | P1 | Thay các câu hỏi phải tính toán |
| QA-01…06 | P1 | Kiểm thử tự vận hành, chạy đồng thời và hiển thị 390px (§4) |
| Còn lại | P2–P3 | §1–§3 |

---

## 1. Flashback và kinh tế xu

Đường dẫn gốc: `backend/src/modules/flashback/` (viết tắt `FB/`), `backend/src/modules/shop/` (`SH/`), `frontend/src/pages/demo-trading/` (`FE/`).

### FB-01 · P0 · Đề dài 72 giờ thay vì 48 giờ

**Hiện trạng:** `FB/flashback.job.ts:244-249` lấy `minClose = now + 48h` rồi gọi `nextChangeBoundary(minClose)`. Tác vụ chạy mỗi phút nên gần như không bao giờ chạy đúng 20:00:00.000. Mở lúc 20:00:30 thì `minClose` là 20:00:30 ngày N+2, đã qua mốc 20:00 nên hàm nhảy sang 20:00 ngày N+3. Đề kéo dài khoảng 72 giờ, mỗi tháng chỉ còn khoảng 10 đề, sai BoSung §2 và §10.1. Test hiện có chỉ thử thời điểm đúng 20:00:00.

**Sửa:**
1. Mở đúng giờ (trễ không quá 5 phút so với `scheduled_open_at`): `closes_at = nextChangeBoundary(scheduled_open_at + 48h)`. Đề đóng 20:00 ngày N+2, dài 48 giờ trừ vài giây trễ.
2. Mở muộn (trễ hơn 5 phút): `closes_at = now + 48h`. Giữ đủ 48 giờ tính từ lúc mở thật (BoSung §5.4).
3. Đề kế tiếp: `scheduled_open_at` bằng `closes_at` của đề trước. Khi mở, `closes_at = nextChangeBoundary(opens_at + 48h)`, tức làm tròn lên mốc 20:00 để lịch quay về nếp cũ.
4. Kéo dài 24 giờ ở phương án dự phòng (BoSung §6.3) giữ nguyên.

**Nghiệm thu:**
- Unit test với tác vụ chạy ở 20:00:00, 20:00:30, 20:04:59: `closes_at` đều là 20:00 ngày N+2.
- Chạy ở 20:06: `closes_at = now + 48h`. Đề sau đóng ở mốc 20:00 đầu tiên không sớm hơn `opens_at + 48h`.
- QA-01 (30 ngày tua nhanh) ra đủ 15 đề.

### FB-02 · P0 · Khoá tác vụ không tin cậy

**Hiện trạng:** `FB/flashback.repository.ts:999-1016` gọi `pg_try_advisory_lock` và `pg_advisory_unlock` qua `DatabaseService.query`, mà hàm này lấy kết nối bất kỳ từ pool (`backend/src/platform/database/database.service.ts:127`). Lấy khoá và nhả khoá có thể rơi vào hai kết nối khác nhau, nên khoá có thể kẹt trên một kết nối rảnh, và các lần chạy sau đều bỏ qua vì tưởng đang bị khoá.

**Sửa:** lấy một client riêng từ pool cho cả lần chạy, giữ khoá phiên (session lock) trên chính client đó, nhả khoá và trả client trong `finally`. Các bước bên trong vẫn chạy giao dịch riêng như hiện tại. Không dùng `pg_try_advisory_xact_lock` bọc cả tác vụ, vì sẽ giữ một giao dịch dài suốt lần chạy.

**Nghiệm thu:** QA-03, hai tiến trình chạy tác vụ đồng thời trên Postgres thật: mỗi phút chỉ một tiến trình chạy, không kẹt khoá sau 100 lần chạy.

### FB-03 · P0 · `finish` làm lộ giá phiên 60

**Hiện trạng:** `FB/flashback.service.ts:627-650` tính tổng tài sản theo giá đóng cửa phiên 60 ở **bất kỳ phiên nào** và trả về ngay. Người chơi bấm Kết thúc ở phiên 5 là biết lãi lỗ ở phiên 60. Một tài khoản phụ có thể dò giá tương lai, vi phạm v1.1 §2.10.1.

**Sửa:**
- Lượt còn ở phiên dưới 60 và đề còn `open`: `finish` trả 409 `FLASHBACK_NOT_AT_END`. Nút "Kết thúc và xem kết quả" chỉ hiện ở phiên 60, đúng v1.1 §2.5.
- Tự kết thúc khi đề đóng (`FB/flashback.job.ts:141-157`) giữ nguyên.

**Nghiệm thu:** gọi `finish` ở phiên 59 trả 409, phản hồi không có `final_nav` hay `pnl_pct`.

### FB-04 · P0 · Đơn vị giá và giá điều chỉnh chưa xác minh

**Hiện trạng:**
- `FB/flashback.market-data.ts:53-109` lấy nến từ `MarketDataService`. Nguồn thử trước là VND dchart (`market-data.service.ts:92`), có thể trả giá theo **nghìn đồng**. Code không đổi đơn vị.
- `FB/flashback.round-builder.ts:234-238` tính thanh khoản bằng `đóng cửa × khối lượng`. Nếu giá theo nghìn đồng thì không mã nào đạt 10 tỷ, và `Math.round(c)` ở `FB/flashback.service.ts:224` làm tròn giá về hàng nghìn.
- Không có chỗ nào yêu cầu nguồn trả giá đã điều chỉnh, hay kiểm tra giá trả về đã điều chỉnh.

**Sửa:**
1. Chạy thử trên dữ liệu thật: lấy nến một mã VN30 qua từng nguồn, so với giá tham chiếu đã biết, ghi kết quả vào test fixture.
2. Chuẩn hoá về **đồng** ngay trong `flashback.market-data.ts` theo từng nguồn, kèm assert phạm vi (giá cổ phiếu VN30 từ 1.000đ tới 1.000.000đ).
3. Gọi nguồn ở chế độ giá điều chỉnh. Nguồn không hỗ trợ thì tự điều chỉnh bằng sự kiện cổ tức và phát hành (VCI `/v1/events`, trường DIV/ISS), hoặc bỏ nguồn đó khỏi danh sách cho Flashback.
4. Lưu đơn vị và nguồn vào `flashback_rounds` (cột mới `price_source`, chỉ server) để đối soát.

**Nghiệm thu:** tạo một đề trên dữ liệu thật, giá trong `bars` cùng đơn vị đồng với bảng giá. Lọc thanh khoản 10 tỷ loại đúng các mã thanh khoản thấp.

### FB-05 · P0 · Rổ VN30 không tự cập nhật

**Hiện trạng:** `FB/flashback.round-builder.ts:375` trả rổ đã lưu khi đã có từ 25 mã trở lên và nguồn nến không có `vn30Symbols`. Bản chạy thật không có `vn30Symbols`, nên nhánh làm mới qua `IndexMembershipService.fetchCurrent` (`backend/src/modules/market-integration/`) không bao giờ chạy. Sau lần ghi đầu tiên, các kỳ review VN30 bị bỏ qua, sai BoSung §3.1.

**Sửa:**
1. Mỗi lần tạo đề `ready`, gọi nguồn thành phần chỉ số để lấy rổ hiện hành.
2. So với rổ đang lưu: mã rời rổ thì đặt `effective_to = hôm nay`, mã mới vào thì thêm dòng với `effective_from = hôm nay`.
3. Gọi nguồn lỗi thì dùng rổ đang lưu và bắn cảnh báo "Rổ VN30 không cập nhật được" (BoSung §6.1).
4. Rổ trả về ít hơn 25 mã thì không ghi đè, dùng rổ đang lưu, bắn cảnh báo.
5. Kiểm tra `flashback.module.ts` có inject provider thành phần chỉ số vào `RoundBuilder`.

**Nghiệm thu:** test với nguồn giả đổi 2 mã giữa hai lần tạo đề: rổ dùng cho đề thứ hai là rổ mới, `vn30_constituents` có `effective_to` cho 2 mã cũ.

### FB-06 · P1 · Thao tác người chơi khi đề đã tới giờ đóng

**Hiện trạng:** `join`, `next`, `orders` và `finish` không kiểm tra `round.status` và `closes_at`. Từ lúc tới giờ đóng tới lần chạy tác vụ kế tiếp (tối đa khoảng 1 phút), người chơi vẫn mua bán được.

**Sửa:** cả bốn endpoint kiểm tra `status = 'open'` và `now < closes_at`. Sai thì trả 409 `FLASHBACK_ROUND_CLOSED`. Trình duyệt nhận lỗi này thì tải lại `GET flashback/current`.

### FB-07 · P1 · Duyệt thưởng tài khoản nghi gian lận

**Hiện trạng:** `FB/flashback-admin.service.ts:114-203` đánh dấu các tài khoản trùng IP, user-agent hoặc số điện thoại. Nhưng chốt hạng và trả thưởng chạy liền trong cùng một lần chạy (`FB/flashback.job.ts:90-91`), nên quản trị viên không kịp xem trước khi trả. Spec v1.1 §2.10.5 yêu cầu xem trước, còn v1.2 yêu cầu trả tự động.

**[DECISION] Mặc định:**
- **Tài khoản không bị đánh dấu được trả tự động như hiện tại.**
- **Thưởng của tài khoản bị đánh dấu ở trạng thái "giữ"**, ghi vào bảng mới `flashback_reward_holds (round_id, user_id, amount, reason, status ∈ {held, released, voided}, decided_by, decided_at)`.
- Màn quản trị Flashback có danh sách thưởng đang giữ, nút "Trả thưởng" và "Huỷ thưởng". Trả thưởng thì ghi `coin_ledger` với cùng khoá `flashback_reward:{round}:{user}`.
- Đề vẫn chuyển sang `paid` khi đã trả xong phần không bị giữ.
- Bổ sung vào dấu hiệu nhận diện: mã thiết bị do trình duyệt sinh (cookie hoặc localStorage gửi kèm khi join). User-agent không đủ phân biệt thiết bị.

### FB-08 · P1 · Vai trò quản trị cao nhất

**Hiện trạng:** hệ thống chỉ có `admin`, `team_lead`, `user`, `premium` (`backend/src/modules/auth/auth.types.ts:2`). Mọi admin đều xem được mã của đề đã đóng và bấm được "Tạm dừng Flashback". BoSung §7 chỉ cho vai trò quản trị cao nhất.

**[DECISION] Mặc định:** **danh sách tài khoản quản trị cao nhất cấu hình bằng biến môi trường** `SUPER_ADMIN_USER_IDS`, không thêm vai trò mới vào bảng `users`. Hai thao tác trên kiểm tra danh sách này. Ghi nhật ký xem mã giữ nguyên như hiện tại.

### FB-09 · P1 · Kênh cảnh báo

**Hiện trạng:** `FB/flashback.job.ts:412-473` có đủ 6 tình huống cảnh báo của BoSung §6.1, chống lặp 30 phút. Nhưng cảnh báo chỉ ghi vào `flashback_job_log` (step `alert`) và log của Nest, không gửi đi đâu.

**[DECISION] Mặc định:** **gửi qua bot Telegram đang có** (`TELEGRAM_BOT_TOKEN`) tới một nhóm kỹ thuật, cấu hình bằng `OPS_ALERT_TELEGRAM_CHAT_ID`. Không cấu hình thì chỉ ghi log như hiện tại. Nội dung theo BoSung §6.1: số đề, trạng thái, mức, lỗi. Không có mã và giai đoạn.

### FB-10 · P1 · Bảng xếp hạng lộ thông tin

**Hiện trạng:** `FB/flashback.service.ts:726` trả `user_id` và `step` của mọi dòng.

**Sửa:** mỗi dòng chỉ có hạng, tên đăng nhập, `pnl_pct`, `is_me`. Riêng dòng `is_me` có thêm `step` và trạng thái đang chơi (v1.1 §2.9).

### FB-11 · P2 · Các lỗi nhỏ của Flashback

| # | Hiện trạng | Sửa |
|---|---|---|
| a | Thưởng tạm tính ở màn kết quả (`FB/flashback.service.ts:659-664`) không xét điều kiện số điện thoại và 7 ngày | Không đủ điều kiện thì ghi "Tài khoản chưa đủ điều kiện nhận thưởng (cần xác thực số điện thoại và tạo đủ 7 ngày)" thay cho số xu |
| b | Mọi lỗi join đều hiện "Chưa đủ xu…" (`FE/flashback/use-flashback-controller.ts:218`) | Chỉ 402 `XU_INSUFFICIENT` hiện câu này kèm nút sang Học viện. 409 thì tải lại đề. Lỗi khác hiện "Không tham gia được, thử lại" |
| c | Thanh nút ở đáy điện thoại: Mua và Bán bấm được khi chưa tham gia | Khoá khi chưa tham gia |
| d | "Mua tối đa" ở trình duyệt (số thực) và server (phí làm tròn) có thể lệch 1 cổ phiếu (`FB/flashback.service.ts:239`, `FE/flashback/flashback-model.ts:50-53`) | Dùng chung một công thức số nguyên: `floor(cash × 10000 / (price × 10015))`, phí làm tròn như server. Test cho cả hai phía cùng bộ số |
| e | Chỉ kiểm tra chồng giai đoạn với 50 đề gần nhất cùng mã (`FB/flashback.repository.ts:537`) | Kiểm tra mọi đề cùng mã. BoSung §6.3 cấm nới điều kiện này |
| f | Ngưỡng nhảy giá cố định 25% (`FB/flashback.round-builder.ts:258-287`) | Theo biên độ HOSE tại ngày đó cộng 0,5% sai số làm tròn. Dev xác minh mốc đổi biên độ HOSE trước khi dùng (±5% rồi ±7%). Phiên đầu tiên sau khi tạm ngừng giao dịch dài được miễn |
| g | `FETCH_FROM = '2010-06-01'` cố định (`FB/flashback.round-builder.ts:122`) | Tính từ `earliest_start_date` trừ 252 phiên khởi tạo và một khoảng dự phòng |
| h | Khi không lấy được lịch VNINDEX, kiểm tra khoảng trống phiên lặng lẽ chuyển sang đếm ngày thường (`FB/flashback.round-builder.ts:331-336`) | Bỏ lần tạo đề đó và thử lại theo BoSung §6.2, không dùng cách đếm xấp xỉ |
| i | `flashback_settings.config` chỉ sửa được bằng SQL | Màn quản trị hiện bảng tham số §9 ở dạng chỉ đọc. Sửa vẫn bằng SQL, ghi rõ trong `backend/docs` |
| j | Tạm dừng cũng dừng tạo đề `ready` (`FB/flashback.job.ts:264`) | Giữ nguyên. Khi bỏ tạm dừng thì bước 5 tạo đề trước, bước 4 mở ngay ở lần chạy sau |

### FB-12 · P2 · Màn Demo khi vốn bằng 0

**Hiện trạng:** `FE/trading/order-panel.tsx:263-267` hiện "Học bài để nhận vốn…" mỗi khi tiền mặt bằng 0, kể cả khi người dùng đã mua hết bằng tiền. Thông báo kích hoạt (dòng 245) vẫn ghi "bạn nhận … VND ảo".

**Sửa:**
- Chỉ hiện thông báo vốn 0 khi tiền mặt bằng 0, không giữ cổ phiếu và vốn nạp ròng bằng 0.
- Bỏ câu "bạn nhận … VND ảo" ở thông báo kích hoạt. Thay bằng "Tài khoản Demo bắt đầu với 0đ. Đổi xu sang tiền để có vốn."

### 1.13 Phần lệch được chấp nhận

Những điểm sau khác spec nguồn nhưng giữ nguyên. Spec nguồn coi như đã sửa theo bảng này.

| Spec nguồn | Code | Lý do giữ |
|---|---|---|
| Bảng `xu_ledger` | `coin_ledger` với cột `kind` (10 loại), khoá duy nhất `unique_key` | Bảng đã có từ migration 0015. Khoá `flashback_reward:{round}:{user}` tương đương `(round_id, user_id, reason)` |
| `POST shop/premium`, `shop/pets/:id`, `demo/deposit`, `demo/withdraw` | `shop/premium-purchases`, `shop/purchases`, `shop/pets/:id/evolve`, `shop/demo-exchange` (một endpoint có chiều đổi) | Hợp đồng OpenAPI và client đã sinh theo tên hiện tại |
| Lỗi thiếu xu ở Shop `XU_INSUFFICIENT` | `INSUFFICIENT_XU` | Flashback join đã trả đúng `XU_INSUFFICIENT`. Đổi tên ở Shop làm vỡ client cũ |
| `join` trả kèm 60 nến lịch sử | `join` trả lượt chơi, trình duyệt gọi lại `GET flashback/current` | Một nguồn dữ liệu nến duy nhất, không lộ thêm dữ liệu |
| Bảng chỉ báo ghi Chương 7, 8 | Chương 6, 7 | Học viện v3.3 đã đánh số lại |

### 1.14 Điểm đã chốt theo code hiện tại

| Điểm cần chốt trong spec nguồn | Code đang làm | Đề xuất |
|---|---|---|
| Bạch Hổ có tiến hoá không (v1.1 §1.2) | Có, cùng giá 10.000 / 30.000 xu | **Giữ** |
| Giới hạn đổi Premium bằng xu | 1 lần mỗi 30 ngày. Kiểm tra số điện thoại tắt, bật bằng cờ cấu hình | **Bật kiểm tra số điện thoại khi phát hành** |
| Giờ đổi đề, số đề trước khi lặp mã, mốc 2012 và 12 tháng (BoSung §11) | 20:00, 10 đề, 2012, 12 tháng | **Giữ** |
| Pháp lý phí tham gia và thưởng xu (v1.1 §2.9) | Có phí 100 xu từ lần hai | **Chờ luật sư.** Phương án dự phòng (miễn phí, giữ bảng thưởng) phải bật được bằng một tham số trong `flashback_settings` (`entry_fee_xu = 0`) |

---

## 2. Học viện v3.3

Đường dẫn gốc: `backend/src/modules/academy/content/v3/`.

Đã đúng spec: 13 chương, 87 bài bắt buộc, 1 Phòng tập (`ch03-practice`, tự chọn, +100 xu, không tính vào x/87). Mọi chương có `published: true`. Phiên bản catalog `iqx-academy-v3.3-13ch-87lessons`. Bài kiểm tra 3 hoặc 5 câu, bài thi 20 hoặc 30 câu, phải đúng hết. Có 403 `ACADEMY_SCENARIO_REQUIRED` và `ACADEMY_ITEM_LOCKED`. Chương 4, 6, 7 mở 16 chỉ báo cho Bot, Backtest, Cảnh báo và Flashback. Chương 8–13 mở 33 chỉ tiêu cho Bộ lọc. Màn kết quả hiện "Đã mở chỉ báo X" và "Đã mở chỉ tiêu X". Có 33 phần "Biểu đồ đại diện". Không còn phần "Áp dụng vào công cụ". Không cần migration mới: completion đi theo `lesson_key`, các chương 6–14 của v3.2 chưa từng phát hành nên không ai có tiến độ cần đổi.

### HV-01 · P1 · Câu hỏi phải tính toán

v3.3 §0.0 mục 4 yêu cầu câu hỏi kiểm tra khái niệm, không có câu phải tính. Các câu sau trong `questions/*.private.json` phải viết lại:

| Bài | Câu hiện tại | Hướng viết lại |
|---|---|---|
| ch01-l10 | "Lỗ 50% cần lãi bao nhiêu để hòa vốn?" | "Vì sao lỗ một nửa thì phải lãi nhiều hơn một nửa mới hòa vốn?" |
| ch02-l01 | "Muốn tiếp cận 100 người mỗi tháng với 20 ngày làm việc, mỗi ngày cần tiếp cận bao nhiêu người?" | Hỏi vì sao chia mục tiêu tháng thành mục tiêu ngày |
| ch08-l04 | "Tăng 50% rồi giảm 50% thì kết quả thế nào so với ban đầu?" | Hỏi vì sao CAGR khác trung bình cộng tăng trưởng |
| ch08-exam | "LNST tăng 20%, số cổ phiếu không đổi. EPS tăng bao nhiêu?" | "Số cổ phiếu không đổi thì EPS và LNST tăng trưởng thế nào so với nhau?" |
| ch08-exam | "LNST giảm 30% thì cần tăng bao nhiêu để về lại mức cũ?" | Thay bằng câu khái niệm về kỳ gốc thấp làm tăng trưởng phóng đại |
| ch11-exam | "Doanh nghiệp có tiền 800 tỷ và nợ vay 300 tỷ thì nợ ròng thế nào?" | "Tiền mặt lớn hơn nợ vay thì nợ ròng mang dấu gì và nghĩa là gì?" |

- Dev rà lại toàn bộ 101 ngân hàng câu hỏi bằng script tìm câu có từ hai số trở lên. Câu nào phải làm phép tính mới trả lời được thì viết lại.
- Tăng `question_version` của các ngân hàng có sửa. Lượt làm đang dở theo bản cũ vẫn chấm theo bản cũ, như cơ chế hiện có.

### HV-02 · P2 · Câu đọc biểu đồ chưa có biểu đồ

**Hiện trạng:** cả 33 bài Chương 8–13 có câu "Trên biểu đồ đại diện của…". Nhưng câu hỏi chỉ có chữ, nên người học phải nhớ hình trong bài.

**[DECISION] Mặc định:** **câu đọc biểu đồ hiện kèm biểu đồ đại diện của bài.**
- Thêm trường tuỳ chọn `chart_id` vào câu hỏi trong schema. Chỉ được trỏ tới biểu đồ của chính bài đó.
- Khung câu hỏi vẽ biểu đồ phía trên câu hỏi.
- Biểu đồ là nội dung bài giảng nên được gửi xuống trình duyệt. Đáp án vẫn không gửi.

### HV-03 · P2 · Chỉ tiêu Bộ lọc không có bài học

**Hiện trạng:** `backend/src/modules/screener/registry/fundamental-registry.json` có 42 chỉ tiêu. 9 chỉ tiêu có `lesson_id: null`: `fcf_yoy`, `accrual`, `working_cap_turnover`, `dividend_yield`, `payout_ratio`, `dividend_cagr3`, `share_count_yoy`, `buyback_yield`, `shareholder_yield`. Người mới không bao giờ mở được chúng, nhưng Bộ lọc vẫn hiện chúng ở trạng thái khoá.

**[DECISION] Mặc định:** **ẩn 9 chỉ tiêu này khỏi Bộ lọc** với người không có quyền cũ (`fundamental:*`). Người có quyền cũ vẫn thấy và dùng như hiện tại.

### HV-04 · P3 · Chỉnh nội dung

- `lessons/ch06-l02.vi.json` (MA Cross) chưa có phần tên "Đọc tín hiệu" (v3.3 §2.1 mục 3). Đổi tên phần "Giao cắt vàng và giao cắt tử thần" thành "Đọc tín hiệu", hoặc thêm phần mới.
- `ch05-l04` câu "Dùng bộ lọc: EPS quý…" là hướng dẫn thao tác công cụ. Viết lại thành tiêu chí: "Tiêu chí: EPS quý…".
- Tăng `content_version` của hai bài trên.

### HV-05 · P3 · Đổi tên theo v3.3

- `frontend/e2e/academy-v32.spec.ts` đổi thành `academy-v33.spec.ts`.
- Thêm mục v3.3 vào cuối `backend/docs/academy-v32/design.md`, hoặc trỏ sang tài liệu này.

### 2.6 Điểm đã chốt theo code hiện tại

| Điểm cần chốt trong spec nguồn | Code đang làm | Đề xuất |
|---|---|---|
| Ai xem Chương 2–3 (§1.3-5) | `audience: "all"` | **Giữ.** Cờ `audience` đã có sẵn để giới hạn sau |
| Nơi lưu bài tự làm (§2.3) | Theo tài khoản (`academy_practice_notes`) | **Giữ** |
| Phí 0,15% và tỉ lệ 70% (§2.3) | Giữ số của tài liệu đào tạo | **Chờ xác nhận DNSE** trước khi phát hành |
| Chuyển đổi tiến độ (§5.3) | Giữ quyền chỉ báo cũ và xu đã nhận. Không tự đánh dấu đạt bài Chương 4 | **Không làm thêm.** Production chỉ còn 3 tài khoản sau đợt dọn dẹp 2026-10-17 |

---

## 3. Dashboard phân tích

Đường dẫn gốc: `backend/src/modules/dashboard/` (`DB/`), `frontend/src/pages/demo-trading/analysis/` (`AN/`).

Đã đúng spec: nút mở ở cột công cụ, bật và tắt như Insight. Mã đi theo ô tìm kiếm chung. Bố cục 3 cột và lưới 2 cột. Khung "Biểu đồ" có tìm kiếm, 6 nhóm và đếm n/33. Thẻ biểu đồ có tay kéo, nút ×, không có số lớn, có nhãn "Theo năm, cố định". Quý/Năm áp dụng chung, số kỳ nhớ riêng theo từng chế độ. Khuôn F có trung vị giai đoạn và mốc trục tự giãn. Thiết lập lưu theo tài khoản (`dashboard_settings`, migration 0029), có trạng thái chưa lưu và nút Mặc định. Ngân hàng có đúng 11 chỉ tiêu áp dụng. Kỳ không tính được để trống. Số định dạng kiểu Việt Nam. Số liệu lấy từ VCI qua registry Bộ lọc.

### DB-01 · P1 · Sáu biểu đồ chưa có số liệu

**Hiện trạng:** `backend/src/modules/screener/screener.metrics.ts:107-113` đánh dấu `eps_yoy`, `eps_cagr3`, `eps_growth_stability`, `peg`, `roic`, `roic_stability` là chưa hỗ trợ. Dashboard hiện "không có dữ liệu" cho Tăng trưởng EPS, EPS CAGR 3Y, EPS Stability, PEG, ROIC, ROIC Stability. PEG bị gán cứng `null` (`DB/dashboard.series.ts:571-576`). Ba chỉ tiêu này cũng đang mở trong Bộ lọc qua Học viện mà không có dữ liệu.

**Sửa:**
1. **EPS điều chỉnh (§10):**
   - Dựng lịch sử số cổ phiếu lưu hành theo quý từ báo cáo tài chính VCI.
   - Điều chỉnh hồi tố theo sự kiện chia tách và thưởng cổ phiếu từ VCI `/v1/events` (trường ISS), cùng nguồn đang dùng cho cổ tức.
   - EPS quý = LNST quý của cổ đông công ty mẹ / số cổ phiếu bình quân đã điều chỉnh.
   - Từ đó tính `eps_yoy`, `eps_cagr3`, `eps_growth_stability`.
2. **ROIC:**
   - NOPAT = EBIT × (1 − thuế suất hiệu dụng).
   - Thuế suất hiệu dụng = chi phí thuế TNDN / lợi nhuận trước thuế, tính trên 4 quý, kẹp trong [0; 0,5]. Lợi nhuận trước thuế không dương thì dùng 20%.
   - Vốn đầu tư = VCSH + nợ vay − tiền, bình quân như spec §8.3.
3. **PEG (khuôn F2):** P/E tại phiên cuối mỗi quý (hoặc năm) chia tăng trưởng EPS 4 quý so với cùng kỳ. Để trống khi tăng trưởng EPS dưới 5% hoặc P/E âm (§10).
4. Bỏ 6 chỉ tiêu khỏi `UNSUPPORTED_METRICS`. Bộ lọc dùng được ngay.
5. Không làm kịp thì vẫn để trống, nhưng thẻ phải ghi "Đang cập nhật dữ liệu", không ghi "không có dữ liệu".

**Nghiệm thu:** với FPT, MWG, HPG, VNM, GAS, cả 6 biểu đồ có ít nhất 8 quý số liệu. EPS các kỳ trước và sau một đợt thưởng cổ phiếu so sánh được, không có bước nhảy giả. Với VCB (ngân hàng), Tăng trưởng EPS, EPS CAGR, EPS Stability và PEG có số. ROIC và ROIC Stability hiện "Không áp dụng".

### DB-02 · P1 · Chưa dùng chung khuôn với Học viện

**Hiện trạng:** spec §0 và §9 yêu cầu dashboard dùng **đúng khuôn biểu đồ đại diện** của Học viện. Hiện có hai bộ vẽ riêng:
- Học viện: biểu đồ đại diện dựng sẵn ở importer (`backend/scripts/academy-v3-import/charts/rep.ts`) thành block `compare` gồm các `series_panels`, vẽ bằng `frontend/src/pages/academy/charts/series-panels-chart.tsx`.
- Dashboard: bộ vẽ SVG mới ở `AN/charts/panel.tsx` và `AN/charts/figure.tsx`. Chỉ mượn `linePath` và `useChartWidth` của Học viện.

Hai bên trông gần giống nhau, nhưng sửa một bên thì bên kia không đổi theo.

**Sửa:**
1. Tách một bộ khuôn dùng chung `frontend/src/components/fundamental-charts/`. Đầu vào là mô hình dữ liệu của spec §11 (`kind` A, B, C, D, E1, E2, F, F2 và `main`, `sub`, `labels`, `hero`). Đầu ra là SVG, có hover và bảng số.
2. Dashboard dùng thẳng bộ khuôn này.
3. Importer Học viện xuất biểu đồ đại diện theo cùng mô hình (kind mới `fundamental` trong `schema.ts`, dữ liệu doanh nghiệp mẫu dựng sẵn). Renderer Học viện gọi bộ khuôn dùng chung cho kind này.
4. Các biểu đồ minh hoạ khác của Học viện giữ nguyên renderer hiện tại.
5. Học viện vẫn không gọi API số liệu. Số liệu doanh nghiệp mẫu vẫn dựng sẵn trong JSON.

**Nghiệm thu:**
- Ảnh chụp biểu đồ đại diện ROE ở Học viện và thẻ ROE ở Dashboard cùng chế độ, cùng số kỳ có cùng bố cục, màu, trục và chú giải. Chỉ số liệu khác nhau.
- Test `real-content.test.tsx` vẫn qua.

### DB-03 · P1 · Định giá dùng số cổ phiếu hiện tại cho mọi thời điểm

**Hiện trạng:** `DB/dashboard.service.ts:245-257, 320` dùng một số cổ phiếu hiện tại cho 10 năm. P/E, P/B, P/S, EV/EBITDA và FCF Yield bị lệch ở các giai đoạn trước đợt phát hành thêm.

**Sửa:** dùng lịch sử số cổ phiếu đã dựng ở DB-01.
- Vốn hoá tại ngày d = giá đóng cửa ngày d × số cổ phiếu lưu hành tại ngày d.
- P/E = giá ngày d / EPS 4 quý đã điều chỉnh của quý gần nhất đã công bố.
- Giá dùng giá đã điều chỉnh, cùng gốc điều chỉnh với EPS.

### DB-04 · P2 · Quý chưa có ngày công bố

**Hiện trạng:** `DB/dashboard.service.ts:294-316` coi quý có `public_date` rỗng là đã công bố ở mọi ngày trước đó. Định giá các ngày cũ dùng số liệu tương lai.

**Sửa:** `public_date` rỗng thì dùng ngày kết thúc quý cộng 45 ngày (hạn nộp báo cáo hợp nhất quý).

### DB-05 · P2 · Hiển thị và thao tác

| # | Hiện trạng | Sửa |
|---|---|---|
| a | Kéo thả dùng HTML5 drag and drop, không chạy trên màn cảm ứng | Dùng pointer events hoặc `@dnd-kit` (chưa có trong `frontend/package.json`, cần thêm). Có thêm nút lên/xuống trong menu thẻ cho trường hợp không kéo được |
| b | Enter trong ô tìm kiếm không chọn gì nếu bấm trước khi kết quả về (debounce 250ms, `frontend/src/components/layout/header-search.tsx:12`) | Enter khi đang chờ thì chọn dòng đầu ngay khi kết quả về. Gõ đúng một mã có trong danh sách mã thì chọn luôn |
| c | Màu chữ phụ `--academy-subtle` ở giao diện tối là `oklch(0.925 0.018 245)`, khoảng `#dbe5f2` | Thêm token `--text-secondary` bằng `#c9d6e4` theo spec §2.3, dùng cho chữ phụ của dashboard |
| d | Nhãn loại doanh nghiệp chỉ hiện sau khi tải xong số liệu | Lấy loại doanh nghiệp từ danh sách mã (đã có ở ô tìm kiếm), hiện ngay |
| e | Ô chọn số kỳ ẩn trong lúc thẻ đang tải | Luôn hiện |
| f | Nhãn "Không áp dụng" là chữ vàng thường | Dạng nhãn (pill) vàng như "Theo năm, cố định" |
| g | Bảng số khuôn F hiện mỗi tháng một dòng | **Giữ.** Ghi rõ "Giá trị cuối tháng" ở đầu bảng |

### DB-06 · P2 · Định nghĩa chỉ tiêu khác chữ của spec

| Chỉ tiêu | Spec | Code | Đề xuất |
|---|---|---|---|
| ROE | LNST / VCSH BQ | LNST cổ đông công ty mẹ / VCSH trừ lợi ích cổ đông thiểu số | **Giữ code.** Đổi tên đường chính thành "ROE (4 quý, cổ đông công ty mẹ)" |
| Net Debt / EBITDA | Nợ vay − tiền | Nợ vay − (tiền + đầu tư ngắn hạn) | **Giữ code.** Chú giải ghi "Tiền gồm đầu tư tài chính ngắn hạn" |
| PEG trống khi P/E | âm | `pe <= 0` | Đúng về ý nghĩa vì P/E bằng 0 không xảy ra. Giữ |

Học viện phải giải thích cùng định nghĩa ở bài ROE (ch10-l01) và D/E, Net Debt/EBITDA (ch11). Nếu lời giảng đang khác thì sửa lời giảng.

### 3.7 Điểm đã chốt theo code hiện tại

| Điểm cần chốt | Code đang làm | Đề xuất |
|---|---|---|
| Khoá chỉ tiêu theo tiến độ Học viện (§13) | Mở cả 33 | **[DECISION] Giữ mở cả 33**, như bản mẫu. Nếu chốt khoá thì dùng quyền `metric:<id>` đã có, chỉ tiêu chưa học có nhãn "Học bài để mở" và dẫn tới bài |
| Danh sách 11 chỉ tiêu ngân hàng (§13) | Khớp spec, lấy từ cờ `applicability` của registry | **Giữ** |
| Khách chưa đăng nhập (spec không nói) | Chỉ thấy lời mời đăng nhập | **[DECISION] Cho khách xem bộ mặc định.** Thay đổi áp dụng tạm trên màn hình, nút "Lưu thiết lập" mời đăng nhập |
| Đường dẫn API (§11) | `/api/v2/dashboard/settings`, `/api/v2/fundamental/{ma}`, `/api/v2/valuation/{ma}`, thêm `/api/v2/dashboard/catalog` | **Giữ** theo chuẩn `/api/v2` của hệ thống |

---

## 4. Kiểm thử bổ sung

| Mã | Ưu tiên | Kiểm thử | Ở đâu |
|---|---|---|---|
| QA-01 | P1 | Tự chạy 30 ngày với đồng hồ tua nhanh, tác vụ chạy ở giây ngẫu nhiên trong phút: đủ 15 đề, mỗi đề 48 giờ, đóng lúc 20:00, không lúc nào có 0 hoặc 2 đề `open` (BoSung §10.1) | `test:integration`, Postgres thật, nguồn nến giả |
| QA-02 | P1 | Tạo 1.000 đề: phân bố mã gần đều (kiểm định χ² p > 0,01), năm bắt đầu trải đều, không mã nào lặp trong 10 đề liên tiếp, không chồng giai đoạn cùng mã (§10.2–10.4) | unit, nguồn nến giả |
| QA-03 | P1 | Hai tiến trình chạy tác vụ đồng thời: không trùng đề, không trùng thưởng. Ngắt giữa bước trả thưởng rồi chạy lại: mỗi người nhận thưởng đúng một lần (§10.5) | `test:integration` |
| QA-04 | P1 | Máy chủ dừng 5 giờ qua giờ đổi đề: đề cũ đóng và trả thưởng, đề mới mở ngay, kéo dài đủ 48 giờ, đề sau quay về 20:00 (§10.6) | `test:integration` |
| QA-05 | P1 | Tạm dừng: đề đang mở vẫn đóng và trả thưởng, không mở đề mới. Bỏ tạm dừng thì đề mới mở trong 2 lần chạy (§10.9) | unit |
| QA-06 | P1 | Ở độ rộng 390px không tràn ngang, không có chữ xám: Flashback (cả thanh nút ở đáy), Dashboard, một bài Chương 8–13 có biểu đồ đại diện | Playwright `frontend/e2e/` |
| QA-07 | P2 | Học viện: đạt bài ch06-l01 thì EMA có trong hộp chỉ báo Flashback. Đạt ch10-l01 thì ROE dùng được trong Bộ lọc. Màn kết quả có "Đã mở chỉ báo EMA" và "Đã mở chỉ tiêu ROE" | Playwright |
| QA-08 | P2 | Học xong 87 bài được 8.700 xu, thêm Phòng tập được 8.800 xu. Bài thi không cộng xu | unit `academy.test.ts` |
| QA-09 | P2 | Không gửi dữ liệu tương lai: quét mọi phản hồi API người chơi trong một lượt (join, next ×60, orders, finish, leaderboard), không có nến nào sau phiên hiện tại, không có mã, ngày thật hay `user_id` người khác | unit |

---

## 5. Thứ tự làm và phát hành

1. **Đợt 1 (P0):** FB-01 → FB-05. Cùng một nhánh `fix/flashback-v12-scheduler`. Kèm QA-01, QA-03, QA-04.
2. **Đợt 2 (P1):**
   - Flashback: FB-06 → FB-10.
   - Học viện: HV-01.
   - Dashboard: DB-01 → DB-03, làm theo thứ tự vì DB-03 dùng lịch sử số cổ phiếu của DB-01.
   - Kiểm thử: QA-02, QA-05, QA-06.
3. **Phát hành:**
   - Migration mới `0031_flashback_hardening.sql`: bảng `flashback_reward_holds`, cột `flashback_rounds.price_source`, khoá `entry_fee_xu` mặc định 100 trong `flashback_settings.config`.
   - Chạy cùng 0027–0030 (chưa có trên VPS).
   - Sao lưu cơ sở dữ liệu trước khi chạy migration, theo quy trình deploy VPS hiện có.
   - Sau deploy: kiểm tra trong 2 lần chạy tác vụ có 1 đề `open` và 1 đề `ready`, `closes_at` của đề `open` là 20:00 sau 48 giờ.
   - Kiểm tra màn Demo của tài khoản mới hiện vốn 0đ.
4. **Đợt 3 (P2–P3):** phần còn lại. Có thể phát hành sau.

---

## 6. Các quyết định cần chủ sản phẩm chốt

Mỗi điểm đã có giá trị mặc định. Dev làm theo giá trị đó cho tới khi có quyết định khác.

| # | Điểm | Mặc định | Mục |
|---|---|---|---|
| 1 | Pháp lý phí tham gia và thưởng xu Flashback | Có phí, chờ luật sư. Phương án miễn phí bật được bằng tham số | §1.14 |
| 2 | Giữ thưởng tài khoản nghi gian lận để duyệt | Giữ riêng phần của tài khoản bị đánh dấu, phần còn lại trả tự động | FB-07 |
| 3 | Vai trò quản trị cao nhất | Danh sách tài khoản trong biến môi trường | FB-08 |
| 4 | Kênh cảnh báo kỹ thuật | Nhóm Telegram qua bot đang có | FB-09 |
| 5 | Kiểm tra số điện thoại khi đổi Premium bằng xu | Bật khi phát hành | §1.14 |
| 6 | Câu đọc biểu đồ hiện kèm biểu đồ | Có | HV-02 |
| 7 | 9 chỉ tiêu Bộ lọc không có bài học | Ẩn với người không có quyền cũ | HV-03 |
| 8 | Khoá chỉ tiêu Dashboard theo tiến độ Học viện | Không khoá, mở cả 33 | §3.7 |
| 9 | Khách chưa đăng nhập xem Dashboard | Cho xem bộ mặc định, lưu phải đăng nhập | §3.7 |
| 10 | Phí 0,15% và tỉ lệ 70% ở Chương 2 | Giữ, chờ DNSE xác nhận | §2.6 |

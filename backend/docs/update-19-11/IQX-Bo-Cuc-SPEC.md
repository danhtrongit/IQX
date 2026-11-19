# IQX — BỐ CỤC v1.3
## Gộp DEMO TRADING và HỌC VIỆN thành LUYỆN TẬP · Tách FLASHBACK · Bỏ Premium bằng xu · Demo về bản cũ

**Phiên bản:** 1.3
**Ngày:** 06/11/2026
**File spec:** `IQX-Bo-Cuc-SPEC-v1.3.md` (file này)
**HTML đi kèm:** `IQX-Menu-Luyen-Tap-MAU.html`
**Thay thế:** `IQX-Bo-Cuc-SPEC-v1.2.md`. Các quy tắc của v1.2 không nhắc lại ở đây vẫn giữ nguyên, trong đó có:
- panel đóng/mở (§5 v1.2);
- vùng chính giãn ra khi panel thu;
- ghi nhớ trạng thái;
- quy tắc cho điện thoại;
- truy cập bằng bàn phím.

**Trạng thái:** đặc tả để AI dev sửa trực tiếp website IQX đang chạy. Đây không phải báo cáo đã triển khai.

> **CHỈ THỊ CHO AI DEV:** Phần A (mục 1–6) **chỉ thay đổi bố cục**: vị trí, nơi bấm, ẩn/hiện, gộp panel. Nội dung bên trong từng màn giữ nguyên như đang chạy. Phần B (mục 7–8) là **thay đổi kinh tế xu và Demo**, có đổi dữ liệu và API. Chỗ nào spec không nhắc tới thì giữ nguyên. Ẩn là ẩn khỏi giao diện, **không xóa** code, route hay dữ liệu.

---

## 0. Tóm tắt

| Vùng | Hiện trạng (v1.2) | Bản đích (v1.3) |
|---|---|---|
| Thanh trên cùng | GIỚI THIỆU · DEMO TRADING · CHIẾN LƯỢC · HỌC VIỆN | **GIỚI THIỆU · LUYỆN TẬP · FLASHBACK · CHIẾN LƯỢC** |
| Thanh công cụ DEMO TRADING | Đặt lệnh · Danh mục · Tin tức · Insight | Gộp vào LUYỆN TẬP. Đặt lệnh, Danh mục và Tin tức gộp thành **Giao dịch**. **Insight ẩn.** |
| Thanh công cụ HỌC VIỆN | Học viện · (Candle Dojo) · Bot · Shop · Flashback | Gộp vào LUYỆN TẬP. Flashback và Shop chuyển sang mục FLASHBACK. |
| Thanh công cụ LUYỆN TẬP | — | **Candle Dojo · Học viện · Bot · Giao dịch · Dashboard phân tích** |
| Thanh công cụ FLASHBACK | — | **Flashback · Shop** |
| Shop | Có Premium mua bằng xu | **Bỏ Premium.** Còn Linh thú và Thẻ nến. |
| Tài khoản Demo | 0đ, đổi xu ↔ tiền | **Về bản cũ:** cấp 100.000.000đ, **không** đổi xu ↔ tiền. |

---

## PHẦN A — BỐ CỤC

## 1. Thanh trên cùng

Thứ tự từ trái sang: **GIỚI THIỆU · LUYỆN TẬP · FLASHBACK · CHIẾN LƯỢC**.

| Mục | Quy tắc |
|---|---|
| GIỚI THIỆU | Giữ nguyên. |
| **LUYỆN TẬP** | Mục mới, thay cho cả DEMO TRADING và HỌC VIỆN (mục 2). |
| **FLASHBACK** | Mục mới, ngang hàng LUYỆN TẬP (mục 4). |
| CHIẾN LƯỢC | Giữ nguyên nội dung (Cảnh báo · Backtest · Bộ lọc). Chỉ chuyển xuống vị trí cuối. |
| DEMO TRADING, HỌC VIỆN | Không còn trên thanh trên cùng. Route cũ chuyển hướng theo mục 6. |
| Nút xu (khu bên phải) | Mở **FLASHBACK → Shop**, panel mở. Trước đây mở HỌC VIỆN → Shop. |
| Tìm mã, giao diện, tài khoản | Giữ nguyên. |

Mục đang chọn được tô như hiện tại.

---

## 2. Mục LUYỆN TẬP

### 2.1. Khung

Khung giống DEMO TRADING và HỌC VIỆN hiện tại:
- vùng chính ở bên trái;
- panel ở bên phải;
- thanh **CÔNG CỤ** dọc ở mép phải.

Không có khối tiêu đề trang (giữ quy tắc v1.2 §4).

### 2.2. Thanh công cụ

Thứ tự từ trên xuống:

| # | Công cụ | Vùng chính | Panel phải | Ghi chú |
|---|---|---|---|---|
| 1 | **Candle Dojo** | Màn Dojo theo `IQX-Candle-Dojo-SPEC-v1.2.md` | **Không có panel**, vùng chính rộng hết cỡ | Làm sau. Xem 2.5. |
| 2 | **Học viện** | Vùng linh thú như hiện tại; nội dung bài khi đang đọc | Danh sách bài như hiện tại | Giữ nguyên nội dung. |
| 3 | **Bot** | Vùng linh thú / danh mục Bot như hiện tại | Panel Bot như hiện tại | Giữ nguyên nội dung. Luyện tập (mini) vẫn thuộc Bot. |
| 4 | **Giao dịch** | Biểu đồ · Bảng giá · Thị trường (tab ngang của DEMO TRADING cũ) | Panel **Giao dịch** gộp (mục 3) | Mới gộp. |
| 5 | **Dashboard phân tích** | Như hiện tại | Như hiện tại | Giữ nguyên nội dung, chỉ đổi vị trí. |

**Ẩn:** **Insight** (Phân tích cổ phiếu). Giữ code, route và dữ liệu. Có thể bật lại bằng cờ cấu hình (feature flag) hoặc cách tương đương sẵn có trong repo.

**Tab ngang của vùng chính:** tab Biểu đồ · Bảng giá · Thị trường hiện khi công cụ đang chọn là Giao dịch hoặc Dashboard phân tích. Đây là đúng màn DEMO TRADING cũ. Với Học viện, Bot và Candle Dojo, vùng chính hiện như HỌC VIỆN cũ, không có tab ngang.

### 2.3. Đóng/mở panel

Giữ đúng quy tắc v1.2 §5:

| Thao tác | Kết quả |
|---|---|
| Bấm công cụ đang mở | Panel thu vào, vùng chính giãn ra. |
| Bấm lại lần nữa | Panel mở ra. |
| Bấm công cụ khác | Panel chuyển sang công cụ đó, không thu vào. |

Công cụ **không có panel** (Candle Dojo; Flashback ở mục 4) luôn hiện vùng chính rộng hết cỡ. Bấm lại công cụ đó thì không đổi gì.

### 2.4. Mặc định và ghi nhớ

- **[DECISION]** Lần đầu vào LUYỆN TẬP mở công cụ nào. **Đề xuất:**
  - **Học viện** khi Candle Dojo chưa ra mắt;
  - **Candle Dojo** khi đã ra mắt.
  - Dev làm theo đề xuất cho tới khi có quyết định khác.
- LUYỆN TẬP và FLASHBACK mỗi mục **nhớ riêng** công cụ đang chọn và trạng thái đóng/mở trong phiên làm việc. Đây là v1.2 §5.3, thay DEMO TRADING/HỌC VIỆN bằng LUYỆN TẬP/FLASHBACK.
- Trên điện thoại: giữ v1.2 §5.4.

### 2.5. Candle Dojo

- Candle Dojo **chưa có** trên web; sẽ làm sau theo `IQX-Candle-Dojo-SPEC-v1.2.md` và `v1.3-BoSung`.
- Vị trí khi có: **LUYỆN TẬP → Candle Dojo, đứng đầu thanh công cụ**. Thay câu "Thanh công cụ bên phải của HỌC VIỆN: Học viện · Candle Dojo · Bot · Shop · Flashback" trong spec Candle Dojo.
- Trong đợt này: **chưa hiện** nút Candle Dojo, hoặc hiện với nhãn "Sắp có" nếu chủ sản phẩm muốn. **[DECISION]**; đề xuất **chưa hiện**.
- Mọi chỗ trong spec Candle Dojo dẫn tới "Shop › Thẻ nến" nay là **FLASHBACK → Shop → Thẻ nến**. Ví dụ: nút "Xem kho thẻ", khối "Thẻ nến của bạn: x / 47".

---

## 3. Công cụ Giao dịch (gộp Đặt lệnh · Danh mục · Tin tức)

### 3.1. Nguyên tắc

Đây **chỉ là gộp ba panel đang có vào một panel**, chuyển qua lại bằng tab. Nội dung, dữ liệu, form, API của Đặt lệnh, Danh mục và Tin tức **giữ nguyên**.

### 3.2. Panel

| Thành phần | Quy tắc |
|---|---|
| Tiêu đề | "Giao dịch" |
| Thanh tab | **Đặt lệnh · Danh mục · Tin tức**, nằm ngay dưới tiêu đề, chia đều bề ngang. |
| Bấm một tab | Thay toàn bộ nội dung panel bằng nội dung của tab đó. **Không phải cuộn xuống.** Mỗi lúc chỉ hiện một tab. |
| Nội dung tab Đặt lệnh | Đúng panel Đặt lệnh hiện tại. |
| Nội dung tab Danh mục | Đúng panel Danh mục hiện tại (Đang nắm giữ, Lệnh trong ngày, Lịch sử…). |
| Nội dung tab Tin tức | Đúng panel Tin tức hiện tại. |
| Tab mặc định | **Đặt lệnh**. |
| Ghi nhớ | Panel nhớ tab đang mở khi thu/mở panel hoặc chuyển công cụ trong phiên. Không mất dữ liệu đang nhập trong form đặt lệnh (v1.2 L12). |
| Truy cập | Thanh tab dùng `role="tablist"`/`role="tab"`, `aria-selected`; mũi tên trái/phải chuyển tab. |

### 3.3. Hành vi liên kết giữa các tab

Giữ đúng hành vi hiện có giữa ba panel cũ. Ví dụ: hiện nay bấm một mã trong Danh mục mở Đặt lệnh với mã đó, thì nay **chuyển sang tab Đặt lệnh** với mã đó. Không thêm liên kết mới nào chưa có.

### 3.4. Đổi tên trên giao diện

Mọi nút hoặc link hiện đang mở panel Đặt lệnh, Danh mục hoặc Tin tức nay mở **LUYỆN TẬP → Giao dịch**, đúng tab tương ứng, panel mở.

---

## 4. Mục FLASHBACK

### 4.1. Khung

Khung giống LUYỆN TẬP:
- vùng chính;
- panel phải;
- thanh **CÔNG CỤ** dọc ở mép phải.

Thanh công cụ có hai mục, theo thứ tự:

| # | Công cụ | Vùng chính | Panel phải |
|---|---|---|---|
| 1 | **Flashback** | Sảnh → Phòng chờ → Màn chơi → Kết quả, theo các spec Flashback v2 hiện hành | Ở sảnh và phòng chờ: không có panel, vùng chính rộng hết cỡ. Ở màn chơi: panel phải là khung đặt lệnh như hiện nay. Đúng Flashback v2 §1. |
| 2 | **Shop** | Vùng chính Shop hiện tại (Linh thú, Thẻ nến) | Panel Shop hiện tại (Xu của bạn, Đang sử dụng, Thẻ nến, Hoàn thành bài học…) |

- Đóng/mở panel của Shop: theo mục 2.3.
- Mặc định khi bấm FLASHBACK trên thanh trên cùng: **Flashback** (sảnh).
- Nút xu: **Shop** (mục 1).

### 4.2. Thay đổi so với spec Flashback và Candle Dojo

| Spec cũ ghi | Nay là |
|---|---|
| "Mục Flashback ở thanh công cụ bên phải của HỌC VIỆN" (Flashback v1.1 §2.1, v2 §1) | **FLASHBACK → Flashback** |
| Shop ở thanh công cụ HỌC VIỆN | **FLASHBACK → Shop** |
| Shop › Thẻ nến (Candle Dojo v1.2 §8) | **FLASHBACK → Shop → Thẻ nến** |
| "Chưa đủ xu… dẫn sang Học viện" | Dẫn sang **LUYỆN TẬP → Học viện** |

Nội dung màn chơi, sảnh, phòng, cược xu, thẻ trong ván: **giữ nguyên**.

### 4.3. Đang chơi dở

Đang ở màn chơi Flashback mà bấm Shop hoặc chuyển mục khác thì giữ hành vi rời màn chơi hiện có của Flashback. Dev kiểm tra hành vi rời màn và cảnh báo rời phòng hiện có. Không thêm cơ chế mới.

---

## 5. Những gì không đổi

- CHIẾN LƯỢC (Cảnh báo, Backtest, Bộ lọc, tab IQX).
- Nội dung bên trong mọi màn đã nêu là "giữ nguyên".
- Thiết kế (màu, chữ, khoảng cách), trừ những gì bố cục mới buộc phải đổi.
- Số dư Bot, cấu hình Bot, tiến độ học, xu, linh thú, thẻ nến, phòng Flashback.
- Không thêm câu giải thích hay chú thích mới lên giao diện. Các dòng chú thích trong HTML mẫu chỉ để người xem bản mẫu hiểu.

---

## 6. Đường dẫn cũ

Mọi link cũ phải tiếp tục mở được, không lỗi 404. Tên route mới dưới đây là đề xuất; dev đặt theo quy ước route hiện có của repo.

| Link cũ | Mở thành |
|---|---|
| `/demo-trading` (không tham số, hoặc mở Đặt lệnh) | `/luyen-tap?tool=giao-dich&tab=dat-lenh` |
| Link mở Danh mục | `/luyen-tap?tool=giao-dich&tab=danh-muc` |
| Link mở Tin tức | `/luyen-tap?tool=giao-dich&tab=tin-tuc` |
| Link Insight / `analysis=stock` (đang ẩn) | `/luyen-tap?tool=giao-dich&tab=dat-lenh`, giữ `symbol` nếu có |
| `content=ai-analysis&analysis=market` | LUYỆN TẬP → Giao dịch, vùng chính tab **Thị trường** |
| Link Dashboard phân tích | `/luyen-tap?tool=phan-tich` |
| `/demo-trading?view=academy` | `/luyen-tap?tool=hoc-vien` |
| `/demo-trading?view=bot` | `/luyen-tap?tool=bot` |
| Link Shop | `/flashback?tool=shop` |
| Link Flashback, ID phòng (link mời bạn bè) | `/flashback?tool=flashback`, giữ ID phòng; vào thẳng phòng như hiện nay |
| Link Candle Dojo (khi có) | `/luyen-tap?tool=candle-dojo` |

URL mới phản ánh mục, công cụ và tab đang mở, để tải lại trang vẫn đúng chỗ.

---

## PHẦN B — KINH TẾ XU VÀ DEMO

> Phần này **thay thế** §1.2 (dòng Premium, dòng đổi xu sang tiền Demo), §1.3, các API `shop/premium`, `demo/deposit`, `demo/withdraw` và tiêu chí nghiệm thu số 7, số 8 (phần Premium) của `IQX-Flashback-SPEC-v1.md`.

## 7. Shop: bỏ Premium mua bằng xu

| Hạng mục | Quy tắc |
|---|---|
| Giao diện | **Bỏ** ô/khối mua Premium bằng xu khỏi Shop, cả vùng chính lẫn panel. Shop còn: **Linh thú** (mua, tiến hóa) và **Thẻ nến**. |
| API | `POST shop/premium` trả **410** `SHOP_PREMIUM_REMOVED`, không trừ xu. |
| Ledger | Không còn tạo bút toán `shop_premium` mới. Giữ các bút toán cũ trong lịch sử xu. |
| Premium đã mua bằng xu | **Giữ nguyên** thời hạn còn lại. Không thu hồi, không hoàn xu. |
| Premium trả bằng tiền | Không thuộc phạm vi spec này; giữ nguyên. |

## 8. Demo: quay lại phiên bản cũ

### 8.1. Quy tắc

| Hạng mục | Quy tắc |
|---|---|
| Vốn ban đầu | Mỗi tài khoản Demo được **cấp 100.000.000đ tiền ảo**, một lần, như bản cũ. |
| Đổi xu ↔ tiền Demo | **Không còn**, cả hai chiều. Xu và tiền Demo hoàn toàn tách biệt. |
| Giao diện | Bỏ nút, hộp đổi xu/tiền và thông báo "Học bài để nhận vốn…" khi vốn bằng 0. |
| API | `POST demo/deposit` và `POST demo/withdraw` trả **410** `DEMO_EXCHANGE_REMOVED`. |
| Ledger | Không còn tạo bút toán `demo_deposit`, `demo_withdraw`. Giữ bút toán cũ. |
| % lợi nhuận Demo | Tính theo vốn **100.000.000đ**: `(tổng tài sản − 100.000.000) / 100.000.000`. Bỏ công thức "vốn nạp ròng". Cột "Lợi nhuận Demo Trading" ở trang quản trị dùng công thức này. |
| Nguồn xu | Còn: học bài, thi đai/Candle Dojo, phòng tập, thắng cược Flashback. **Không** có nguồn xu từ tiền Demo. |
| Tài khoản Bot | Giữ nguyên: 100.000.000đ, không liên quan xu. |

### 8.2. Chuyển đổi dữ liệu

Dev **kiểm tra trước** cơ chế đổi xu ↔ tiền Demo (Flashback v1.1 §1.3) đã chạy thật trên production chưa.

- **Chưa chạy:** không cần chuyển đổi. Tài khoản Demo vẫn đang theo bản cũ 100.000.000đ.
- **Đã chạy:** **[DECISION]** chủ sản phẩm chốt cách xử lý tài khoản đã đổi. **Đề xuất:**
  1. Với mỗi tài khoản, tính `vốn nạp ròng = tổng đã đổi vào − tổng đã đổi ra`.
  2. Cộng vào tiền mặt Demo: `100.000.000 − vốn nạp ròng`, để tài khoản tương đương vừa được cấp 100 triệu. Giữ nguyên vị thế và lịch sử lệnh.
  3. Nếu `vốn nạp ròng > 0`: hoàn lại `vốn nạp ròng / 10.000` xu vào ví, với lý do `demo_exchange_refund`.
  4. Nếu kết quả bước 2 làm tiền mặt âm: dev báo lại danh sách tài khoản, không tự xử lý.
  5. Chạy một lần, có log và có thể đối soát.

---

## 9. Ca nghiệm thu

| ID | Thao tác | Kết quả bắt buộc |
|---|---|---|
| N01 | Mở trang (máy tính). | Thanh trên cùng đúng: GIỚI THIỆU · LUYỆN TẬP · FLASHBACK · CHIẾN LƯỢC. Không còn DEMO TRADING, HỌC VIỆN. |
| N02 | Vào LUYỆN TẬP. | Thanh công cụ đúng thứ tự: (Candle Dojo nếu bật) · Học viện · Bot · Giao dịch · Dashboard phân tích. Không có Insight, Shop, Flashback. |
| N03 | Bấm Giao dịch. | Vùng chính có Biểu đồ · Bảng giá · Thị trường. Panel "Giao dịch" có ba tab Đặt lệnh · Danh mục · Tin tức, mặc định Đặt lệnh. |
| N04 | Bấm tab Danh mục, rồi Tin tức. | Nội dung panel **thay hẳn** bằng tab được chọn; không cuộn. Nội dung giống hệt panel cũ tương ứng. |
| N05 | Đang nhập dở lệnh, chuyển sang Danh mục rồi về Đặt lệnh. | Không mất dữ liệu đang nhập. |
| N06 | Bấm Giao dịch khi panel đang mở. | Panel thu vào, vùng chính giãn, biểu đồ vẽ lại. Bấm lại thì mở về đúng tab trước đó. |
| N07 | Bấm một mã trong Danh mục (nếu bản cũ có hành vi này). | Chuyển sang tab Đặt lệnh với mã đó. |
| N08 | Bấm Học viện, Bot, Dashboard phân tích. | Nội dung giống hệt bản cũ. Đóng/mở panel đúng v1.2 §5. |
| N09 | Tìm Insight trên giao diện. | Không thấy. Code và route còn. Link cũ chuyển hướng theo mục 6. |
| N10 | Vào FLASHBACK. | Thanh công cụ Flashback · Shop. Mặc định sảnh Flashback, rộng hết cỡ. |
| N11 | Tạo hoặc vào phòng, chơi một ván. | Mọi thứ như bản cũ; màn chơi có panel đặt lệnh. |
| N12 | Bấm Shop. | Shop có Linh thú và Thẻ nến; **không có Premium**. Panel Shop như cũ. |
| N13 | Bấm nút xu ở thanh trên cùng, từ bất kỳ mục nào. | Mở FLASHBACK → Shop, panel mở. |
| N14 | Gọi `POST shop/premium`. | 410 `SHOP_PREMIUM_REMOVED`, xu không đổi. |
| N15 | Tạo tài khoản mới, vào Giao dịch. | Tiền khả dụng 100.000.000đ. Không có nút hay hộp đổi xu/tiền ở bất kỳ đâu. |
| N16 | Gọi `POST demo/deposit`, `POST demo/withdraw`. | 410 `DEMO_EXCHANGE_REMOVED`; xu và tiền Demo không đổi. |
| N17 | Xem % lợi nhuận Demo (người dùng và trang quản trị). | Tính theo vốn 100.000.000đ. |
| N18 | Chuyển LUYỆN TẬP ↔ FLASHBACK nhiều lần. | Mỗi mục giữ công cụ, tab Giao dịch và trạng thái đóng/mở của nó. |
| N19 | Mở các link cũ ở mục 6. | Đúng nơi; không 404; link mời phòng Flashback vào thẳng phòng. |
| N20 | Số dư Bot, vị thế, cấu hình Bot, tiến độ học, xu, linh thú, thẻ nến trước và sau deploy. | Không đổi (trừ chuyển đổi Demo ở 8.2 nếu áp dụng). |
| N21 | Điện thoại 360/390px, cả hai mục. | Không tràn ngang; thanh công cụ dùng được; chạm công cụ mở/đóng panel đúng; tab Giao dịch chuyển đúng. |
| N22 | Màn 900/1024/1440/1920px, panel mở và thu. | Không tràn ngang; thanh công cụ luôn ở mép phải. |

---

## 10. HTML mẫu

File `IQX-Menu-Luyen-Tap-MAU.html`. Mở bằng trình duyệt, không cần cài gì.

| Trong HTML | Trên IQX thật |
|---|---|
| Biểu đồ, giá, danh mục, tin tức, phòng Flashback, Shop | Dữ liệu minh họa, dựng gần đúng. Dùng màn đang có. |
| Candle Dojo hiện với nhãn "Sắp có" | Để xem vị trí. Trên web thật theo mục 2.5. |
| Ô ghi chú và dòng chữ nhỏ "giữ nguyên…" | Chỉ cho người xem bản mẫu, **không đưa lên web**. |
| Thanh vàng trên cùng (đường dẫn) | Chỉ cho bản mẫu. |
| Bảng màu, cỡ chữ | Theo bản mẫu; trên IQX giữ thiết kế đang chạy. |

Đã kiểm tra trên Chromium ở 1440px và 390px, không lỗi JavaScript và không tràn ngang:
- thứ tự hai thanh menu;
- tab Giao dịch chuyển nội dung;
- thu/mở panel làm vùng chính giãn từ 816px lên 1336px;
- mỗi mục nhớ trạng thái riêng;
- nút xu mở Shop.

---

## 11. Định nghĩa hoàn thành

1. Thanh trên cùng và hai thanh công cụ đúng mục 1, 2 và 4.
2. Giao dịch là **một panel ba tab**, nội dung là ba panel cũ.
3. Insight ẩn nhưng code, route và dữ liệu còn.
4. Shop không còn Premium.
5. Demo cấp 100.000.000đ, không đổi xu ↔ tiền.
6. Link cũ chạy đúng mục 6.
7. 22 ca N01–N22 có bằng chứng.

**Chưa hoàn thành nếu:**
- chép HTML mẫu lên thay màn thật;
- dựng lại Đặt lệnh, Danh mục hoặc Tin tức từ đầu thay vì dùng panel cũ;
- panel Giao dịch cuộn dọc ba khối thay vì chuyển tab;
- còn đường mua Premium bằng xu hoặc đổi xu ↔ tiền Demo qua API.

## 12. Điểm cần chốt

1. Công cụ mặc định khi vào LUYỆN TẬP (mục 2.4). Đề xuất: Học viện, chuyển sang Candle Dojo khi ra mắt.
2. Có hiện nút Candle Dojo "Sắp có" trước khi ra mắt không (mục 2.5). Đề xuất: chưa hiện.
3. Xử lý tài khoản đã đổi xu ↔ tiền Demo, nếu cơ chế này đã chạy thật (mục 8.2).

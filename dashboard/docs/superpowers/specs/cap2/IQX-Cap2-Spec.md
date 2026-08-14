# IQX Demo Trading — Cấp 2 «Kỷ luật»
### Spec bàn giao đợt 3 · v2.0 (bản cuối) · 07/2026

Kèm mockup: `iqx-cap2-datlenh.html` (panel đặt lệnh) · `iqx-cap2-ketso.html` (Kết sổ) · `iqx-cap2-phantich-danhmuc.html` (Phân tích danh mục) · `iqx-cap2-hanhtrinh.html` (tab Hành trình).

---

## ⚠️ ĐỌC TRƯỚC — Nguyên tắc bàn giao (KHÔNG BỎ QUA)

Web IQX.vn đã có sẵn cơ chế **Cấp 0 (Nhập môn) + Cấp 1 (Học việc)**. Cấp 2 xây trên nền Cấp 1. Đọc kèm:
- `IQX-Cap0-Spec.md` — kiến trúc chung (hệ cấp mở, tab Hành trình, huy hiệu SVG, badge chế độ, bảng màu)
- `IQX-Cap1-Spec.md` — Form Kế hoạch 2 trường (Lý do + Vùng mua), Panel AI Thanh tra, màn Kết sổ, Phân tích danh mục. (Cấp 1 KHÔNG có cắt lỗ/chốt lời, KHÔNG có huy chương.)

Nguyên tắc Cấp 2:
- User vào Cấp 2 sau khi tốt nghiệp Cấp 1 (6/6 nhiệm vụ: đủ 5 lý do, 3 lệnh lý do ✅, xem lại danh mục 3 lần, 10 lệnh Thực chiến)
- Chỉ có 1 chế độ: **Thực chiến T+2,5**
- **Cửa sổ trượt: 20 lệnh** (MỚI — Cấp 1 không có cửa sổ trượt vì chưa có cắt lỗ/chốt lời để đo kỷ luật; Cấp 2 mới bắt đầu đo)
- Huy hiệu Cấp 2: viên lục giác **NGỌC LAM** `#7dd3c0`, fill=2

**Cơ chế cốt lõi khác Cấp 1:** Cấp 1 giải quyết bài "trước lệnh" bằng **cổng cứng** (không có kế hoạch = không đặt được). Cấp 2 giải quyết bài "sau khi đặt" bằng **quan sát + phản chiếu + đo lường** — không có cổng cứng vì không có nút chỉnh SL/TP. SL/TP là cam kết cá nhân, không phải lệnh conditional trên sàn thật. Hệ thống chỉ quan sát: giá đã chạm ngưỡng chưa · user có bán đúng ngưỡng cam kết không.

---

## 0. BẢNG TỔNG SCOPE — AI đọc bảng này trong 30 giây là biết code gì

| Nhóm | Nghĩa | Thành phần |
|---|---|---|
| 🟢 **THÊM MỚI** — code từ đầu | Chưa có trên web | · **Kiến thức cắt lỗ/chốt lời — 2 cách chọn hiện sẵn** (trong Form Kế hoạch) — §5<br>· **Chuỗi lệnh kỷ luật** (đếm lệnh liên tiếp không vi phạm) — §6<br>· **Điểm kỷ luật hằng ngày** (0-100) — §7<br>· **Cảnh báo giá chạm cắt lỗ cuối phiên** (banner sáng phiên sau) — §8<br>· **Cảnh báo tức thời nhồi lệnh** — §9<br>· **Giới hạn số cảnh báo** (chống quá tải) — §10<br>· **Ghi nhận nhỏ** (toast ghi nhận tiến bộ, KHÔNG phải huy chương) — §11<br>· **3 khối mới trong Phân tích danh mục** (Điểm kỷ luật 30 ngày + Phân loại vi phạm + Phát hiện từ ghi chú) — §12<br>· **4 mẫu tự phát hiện mới** — §12<br>· **Màn tốt nghiệp Cấp 2** — §13 |
| 🟡 **CẬP NHẬT từ Cấp 1** — sửa logic hiện có | Không thêm mới, chỉ mở rộng | · **Cửa sổ trượt 20 lệnh** (MỚI — Cấp 1 không có)<br>· **Tab Hành trình Cấp 2:** thêm 3 khối mới (Chuỗi lệnh kỷ luật, Điểm kỷ luật hôm nay, Cẩm nang cắt lỗ/chốt lời)<br>· **Form Kế hoạch:** GIỮ NGUYÊN toàn bộ Cấp 1 (loại lệnh, giá, khối lượng, lý do (5 lý do) + AI Thanh tra, vùng mua), THÊM phần Cắt lỗ/Chốt lời hiện sẵn với 2 cách để user chọn 1 (Hỗ trợ/Kháng cự · Biên độ dao động)<br>· **Bảng `order_kehoach` + `order_ketso`:** thêm các cột cắt lỗ/chốt lời + đo hành vi kỷ luật |
| 🔵 **GẮN THÊM EVENT** — logic có sẵn, chỉ nghe sự kiện | Không sửa logic, chỉ addEventListener | · **User bấm đặt lệnh mua** — kiểm nếu đã có vị thế mã này đang lỗ >−3% → cảnh báo nhồi lệnh<br>· **Cuối phiên (15:00)** — với mỗi mã user đang giữ, check giá đóng cửa ≤ SL cam kết → đánh dấu "chạm SL cuối phiên"<br>· **Đầu phiên (08:45) sáng hôm sau** — nếu có mã "chạm SL cuối phiên" chưa bán → banner cảnh báo |
| ⚪ **GIỮ NGUYÊN** — không đụng | Đọc-để-tham-chiếu | · Form Kế hoạch 2 trường Lý do + Vùng mua (đã có ở Cấp 1 — Cấp 2 thêm 2 trường cắt lỗ/chốt lời)<br>· Panel AI Thanh tra (đã có)<br>· Màn Kết sổ (đã có, Cấp 2 thêm đối chiếu cắt lỗ/chốt lời)<br>· Trang Phân tích danh mục 4 khối (giữ, thêm 3 khối)<br>· Toàn bộ web IQX gốc |

---

## 1. NGỮ CẢNH CẤP 2

**Bài học một câu:** *"Kế hoạch chỉ có giá trị khi được thực hiện."*

**Đặc điểm khác Cấp 1:**

| | Cấp 1 «Học việc» | Cấp 2 «Kỷ luật» |
|---|---|---|
| Bài học | Không vào lệnh khi chưa có kế hoạch | Kế hoạch chỉ có giá trị khi được thực hiện |
| Cơ chế | Cổng cứng khi đặt lệnh | Quan sát + phản chiếu **sau khi** đặt lệnh |
| Đo bằng | Counter tích lũy (5 lý do, 10 lệnh) | Cửa sổ trượt 20 lệnh + Chuỗi lệnh liên tiếp |
| Ghi lại | Kết sổ sau mỗi lệnh | Kết sổ + ghi chú nhìn lại khi có vi phạm |
| Focus | Kế hoạch có đủ trước lệnh | Thực hiện đúng cam kết cắt lỗ/chốt lời |
| Kiến thức mới | 5 lý do mua | **Cách đặt cắt lỗ/chốt lời có cơ sở** |

**4 hành vi vi phạm kỷ luật đo được ở Cấp 2:**

1. **Cắt lỗ chậm** — giá chạm cắt lỗ cam kết → user giữ >1 phiên mới cắt (hy vọng hồi)
2. **Chốt lời hụt** — giá chạm chốt lời cam kết → user giữ tiếp không bán → giá tụt xuống → cuối cùng bán thấp hơn kế hoạch
3. **Bán sớm khi lỗ nhẹ** — user bán khi giá CHƯA chạm cắt lỗ nhưng đang lỗ >−2% (hoảng loạn)
4. **Nhồi lệnh khi lỗ** — user mua thêm cùng mã khi vị thế đó đang lỗ >−3% (averaging down)

---

## 2. NĂM NHIỆM VỤ CẤP 2

### ① Chuỗi lệnh kỷ luật đầu tiên — 5 lệnh liên tiếp không vi phạm

- **Điều kiện mở:** ngay khi vào Cấp 2
- **Yêu cầu:** 5 lệnh Thực chiến liên tiếp không có bất kỳ vi phạm nào trong 4 loại ở §1
- **Reset:** về 0 khi có 1 lệnh vi phạm
- **Hiển thị:** số chuỗi lớn trong tab Hành trình, có động lực *"Còn 3 lệnh nữa đạt chuỗi 5 lệnh kỷ luật"*
- **Hoàn thành:** đạt 5 lệnh liên tiếp không vi phạm

### ② Cắt lỗ đúng phiên — 5 lần

- **Điều kiện mở:** sau ①
- **Yêu cầu:** trong cửa sổ 15 lệnh gần nhất, có **5 lần** giá chạm cắt lỗ cam kết và user bán **trong phiên đó**
- **Đo bằng:** so sánh timestamp giá chạm cắt lỗ với timestamp lệnh bán. Cùng phiên → tính. Qua phiên kế → "cắt lỗ chậm", không đạt
- **Chú ý:** không phải lệnh nào cũng chạm cắt lỗ — nhiệm vụ này cần thời gian. Không làm user hiểu nhầm phải "cố tình để chạm cắt lỗ"
- **Hoàn thành:** đủ 5 lần

### ③ Không nhồi lệnh khi lỗ — 0 lần trong 15 lệnh

- **Điều kiện mở:** sau ①
- **Yêu cầu:** 15 lệnh gần nhất, không có lần nào mua thêm cùng mã khi vị thế đó đang lỗ >−3%
- **Đo bằng:** khi user submit lệnh mua, kiểm có vị thế mở cùng mã không → nếu có, kiểm Lãi/lỗ có <−3% không → nếu có, cảnh báo (§9) + đếm là nhồi lệnh nếu user vẫn đặt
- **Hoàn thành:** 15 lệnh gần nhất, nhồi lệnh = 0

### ④ Chốt lời đúng — 3 lần chạm chốt lời không hụt

- **Điều kiện mở:** sau ①
- **Yêu cầu:** trong cửa sổ 15 lệnh gần nhất, có **3 lần** giá chạm chốt lời cam kết và user bán trong phiên đó (không giữ tiếp tham thêm)
- **Đo bằng:** giá cao nhất trong phiên chạm ngưỡng chốt lời → user bán trong phiên → tính. Giữ tiếp qua phiên sau → "chốt lời hụt"
- **Hoàn thành:** đủ 3 lần

### ⑤ Cửa sổ 20 lệnh — Vi phạm ≤2

- **Điều kiện mở:** khi đã có ≥20 lệnh Thực chiến sau khi vào Cấp 2
- **Yêu cầu:** 20 lệnh gần nhất, **≤2 lệnh có vi phạm** bất kỳ loại nào trong 4 loại
- **Vì sao 2:** cho phép sai ~10%. Kỷ luật hoàn hảo (0/20) là bất khả với user thật. 18/20 là chuẩn "kỷ luật cao"
- **Hoàn thành:** cửa sổ 20 lệnh có ≤2 vi phạm

---

## 3. TỐT NGHIỆP CẤP 2

Điều kiện: **5/5 nhiệm vụ hoàn thành**. Vì nhiệm vụ ⑤ bao hàm mọi hành vi cần đo, xong ⑤ = xong Cấp 2.

Màn tốt nghiệp — 3 khối:

**Header:** Tag `HOÀN THÀNH` · Tên `CẤP 2 · KỶ LUẬT` · Dòng phụ `5/5 nhiệm vụ · Cửa sổ 20 lệnh với ≤2 vi phạm` · Huy hiệu Cấp 2 cỡ 120px, phát sáng, ngọc lam

**Khối 1 — Ghi nhận:**
*"Bạn đã đi qua 20 lệnh Thực chiến với ≤2 vi phạm kỷ luật — điều rất khó với người mới. **Kế hoạch của bạn KHÔNG chỉ là kế hoạch — nó là hành động.** Trong 30 ngày qua trên IQX, chỉ 24% user Cấp 1 vượt được Cấp 2 trong 3 tháng đầu — bạn thuộc nhóm hiếm."*

**Khối 2 — Định vị:**
*"Nhưng có kỷ luật vẫn chưa đủ. Cấp 3 «Bản lĩnh» dạy điều nghịch lý: **kết quả tốt không đồng nghĩa quyết định tốt.** Có lệnh bạn làm đúng mọi thứ nhưng vẫn lỗ (thị trường không thuận). Có lệnh bạn làm sai nhưng vẫn lãi (may mắn). Cấp 3 tách được 2 chuyện này — và bạn sẽ học cách điều chỉnh khối lượng mua theo khẩu vị rủi ro riêng."*

**Khối 3 — Chuyển cấp** (viền xanh brand `#4f8ff7`):
*"**Từ giờ: Cấp 3 «Bản lĩnh».** Bạn sẽ có công cụ mới: **khẩu vị rủi ro** (điều chỉnh cách đặt cắt lỗ/chốt lời theo phong cách riêng) · **khối lượng mua hợp lý** (mua bao nhiêu là đúng) · **mức độ tự tin của lệnh** · **tách quyết định khỏi kết quả**."*

**Nút:** `Vào Cấp 3 «Bản lĩnh» →` (full width, xanh brand)

---

## 4. TAB HÀNH TRÌNH CẤP 2 (🟡 CẬP NHẬT từ Cấp 1)

Nội dung tab theo thứ tự trên xuống:

1. **Thẻ cấp** — Huy hiệu Cấp 2 ngọc lam có vòng progress · nhãn `CẤP 2 · KỶ LUẬT` · bài học · badge `THỰC CHIẾN`
3. **🟢 Chuỗi lệnh kỷ luật (MỚI)** — khối nổi bật (§6)
4. **🟢 Điểm kỷ luật hôm nay (MỚI)** — mini widget (§7)
5. **Checklist 5 nhiệm vụ Cấp 2** — header `TRƯỚC KHI LÊN CẤP 3 · x/5`
6. **🟢 Cẩm nang cắt lỗ / chốt lời (MỚI)** — link vào (§5)
8. **Cửa sổ 20 lệnh gần nhất** — mini widget 20 ô
8. **Nút "Phân tích danh mục"**
10. **Ô đích cuối tab:** *"Xong 5/5 nhiệm vụ + cửa sổ 20 lệnh có ≤2 vi phạm → tốt nghiệp Cấp 2, lên Cấp 3 «Bản lĩnh» (viên lục giác xanh brand)."*

---

## 5. KIẾN THỨC CẮT LỖ / CHỐT LỜI (🟢 THÊM MỚI) — 2 cách chọn hiện sẵn

**⚠️ NGUYÊN TẮC CHO DEV: Panel đặt lệnh Cấp 2 = panel Cấp 1 GIỮ NGUYÊN + CHÈN THÊM một khối Cắt lỗ/Chốt lời.** KHÔNG code lại panel từ đầu. AI code chỉ chèn thêm 1 khối HTML mới (khối cắt lỗ/chốt lời) vào Form Kế hoạch có sẵn của Cấp 1, ngay sau trường Vùng mua. Mọi thứ của Cấp 1 (loại lệnh, giá, khối lượng, lý do mua (5 lý do) + AI Thanh tra, vùng mua, cổng cứng) giữ nguyên 100%.

Xem mockup `iqx-cap2-datlenh.html` — đó chính là mockup Cấp 1 (`iqx-cap1-datlenh.html`) được chèn thêm đúng 1 khối cắt lỗ/chốt lời, không sửa gì khác.

### 5.1 Phần Cắt lỗ / Chốt lời trong Form Kế hoạch

- **Hiện ra LUÔN** ngay trong khối Kế hoạch (không phải bấm nút mới hiện) — nằm dưới trường Vùng mua
- Hiển thị **2 cách đặt cạnh nhau**, user **BẮT BUỘC chọn 1** — không nhập tay tự do
- Cách được chọn → 2 ô Cắt lỗ / Chốt lời điền số theo cách đó; user đổi qua lại giữa 2 cách được
- (Từ Cấp 3, khi có khẩu vị rủi ro, user được tự chỉnh nhiều hơn)

### 5.2 Cách 1 — Theo Hỗ trợ / Kháng cự

Lấy mốc kỹ thuật mà AI Phân tích cổ phiếu đã tính ở **lớp L1 Xu hướng**:
- **Cắt lỗ** = ngay dưới mốc **hỗ trợ** gần nhất 1%
- **Chốt lời** = ngay dưới mốc **kháng cự** gần nhất 1%

**Tooltip (icon ?):** *"Giá thường bật lại ở hỗ trợ, bị chặn ở kháng cự. Cắt lỗ dưới hỗ trợ = nếu thủng thì xu hướng đã hỏng, thoát. Chốt lời dưới kháng cự = bán trước khi bị chặn. Mốc lấy từ phân tích L1."*

**Ví dụ VNM** (giá vào 62.400): L1 cho hỗ trợ 61.000 · kháng cự 66.500 → Cắt lỗ 60.400 (−3,2%) · Chốt lời 65.800 (+5,4%)

**Hợp với:** user quen đọc chart, tin vào mốc kỹ thuật.

### 5.3 Cách 2 — Theo Biên độ dao động

Dùng biên độ dao động của mã với hệ số cố định:
- **Cắt lỗ** = Giá vào − (Biên độ dao động × 2)
- **Chốt lời** = Giá vào + (Biên độ dao động × 4)

Chốt lời đặt xa gấp đôi cắt lỗ.

**Tooltip (icon ?):** *"Con số đo mã dao động bao nhiêu đồng mỗi phiên (chỉ báo ATR). IQX tính tự động. Mã lắc mạnh → biên độ lớn → cắt lỗ rộng. Mã êm → biên độ nhỏ → cắt lỗ chặt. Cắt lỗ = 2× biên độ, chốt lời = 4× biên độ."*

- **Thuật ngữ:** dùng **"Biên độ dao động"** trong UI, lần đầu chú thích nhỏ *"(ATR)"*.
- **Hệ số cố định 2× / 4×** — khẩu vị rủi ro (điều chỉnh hệ số) để dành Cấp 3.

**Ví dụ VNM** (giá vào 62.400, biên độ 850đ) → Cắt lỗ 60.700 (−2,7%) · Chốt lời 65.800 (+5,4%)

**Hợp với:** user muốn cách tự động, không phải đọc chart.

### 5.4 Layout + hành vi khối cắt lỗ/chốt lời

Khối chèn thêm nằm ngay sau trường Vùng mua, gồm:
- Nhãn: `3. Cắt lỗ / Chốt lời` + ghi chú nhỏ bên phải `chọn 1 trong 2 cách`
- **2 thẻ cạnh nhau** (mỗi thẻ hiện sẵn số liệu):
  - Thẻ 📈 Theo Hỗ trợ/Kháng cự: Hỗ trợ · Kháng cự · 🛑 cắt lỗ · 🎯 chốt lời · nút "Chọn cách này"
  - Thẻ 📊 Theo Biên độ dao động: Biên độ · Hệ số 2×/4× · 🛑 cắt lỗ · 🎯 chốt lời · nút "Chọn cách này"
- Bấm "Chọn cách này" ở thẻ nào → thẻ đó sáng viền ngọc lam (được chọn), thẻ kia về thường
- Chưa chọn cách nào → nút ĐẶT LỆNH MUA khóa (cổng cứng, giống cách Cấp 1 khóa khi thiếu lý do/vùng mua)
- Ghi hồ sơ: `phuong_phap_sl_tp: 'ho_tro_khang_cu' | 'bien_do_dao_dong'` + giá trị cắt lỗ/chốt lời của cách đã chọn

Không có nút "Đề xuất" phải bấm mới hiện — 2 thẻ **hiện sẵn** ngay khi mở Form.

### 5.5 Cẩm nang cắt lỗ / chốt lời (trong tab Hành trình)

Trang gọn, user chủ động vào khi muốn:

```
📖 CẮT LỖ / CHỐT LỜI — 2 cách đặt

  📈 Cách 1 — Theo Hỗ trợ / Kháng cự
     Bám mốc kỹ thuật từ phân tích L1

  📊 Cách 2 — Theo Biên độ dao động
     Tự động theo tính chất riêng từng mã
```

Mỗi mục mở giải thích ngắn: định nghĩa 1 câu · công thức · ví dụ VN · khi nào hợp. Không phải bài giảng dài.

### 5.6 Nhắc trong Kết sổ (contextual)

Sau lệnh đóng, nếu phát hiện tình huống liên quan:
- Cắt lỗ theo cách bị "quét" (giá chạm rồi bật lên mạnh): *"Bạn cắt lỗ theo Hỗ trợ/Kháng cự tại 60.400, giá chạm rồi bật lên 65.000. Có thể mốc hỗ trợ này yếu — lần sau thử đối chiếu với Biên độ dao động. [ⓘ]"*
- Chọn Biên độ dao động và kết quả tốt: *"Lệnh này bạn đặt cắt lỗ theo Biên độ dao động (2× biên độ = 60.700), giá không chạm và đạt chốt lời. Cách này phù hợp với mã ít biến động như VNM. 👍"*

---

## 6. CHUỖI LỆNH KỶ LUẬT (🟢 THÊM MỚI)

Đếm **số lệnh Thực chiến liên tiếp không vi phạm**.

### Logic đếm

Sau mỗi lệnh đóng cửa:
- Không vi phạm (không nằm trong 4 loại §1) → chuỗi +1
- Có vi phạm → chuỗi về 0

### Hiển thị (kèm thước đo hoạt động — chống "đứng ngoài giữ chuỗi")

**Trong tab Hành trình:**
```
🔥 STREAK KỶ LUẬT · 7 lệnh liên tiếp không vi phạm
   Kỷ lục cá nhân: 12 · Median IQX Cấp 2: 5
   Trung bình: 3 lệnh/tuần
   Còn 3 lệnh nữa mở khóa nhiệm vụ ① (nếu chưa xong)
```

**Cảnh báo nếu <1 lệnh/tuần:** *"Bạn đang đứng ngoài nhiều — chuỗi không đo hoạt động. Đừng né giao dịch chỉ để giữ chuỗi."*

**Trong màn Kết sổ:**
- Không vi phạm → *"Chuỗi +1 → 8 lệnh liên tiếp không vi phạm"*
- Vi phạm → *"Chuỗi reset về 0 · trước đó bạn có 7 lệnh liên tiếp — có thể quay lại"*

---

## 7. ĐIỂM KỶ LUẬT HẰNG NGÀY (🟢 THÊM MỚI)

Chấm điểm 0-100 cho mỗi ngày có giao dịch. Tự thấy nhịp của mình, không so bì với người khác.

### Công thức (công bằng — không cộng điểm khống ngày "may mắn")

```
+ Kế hoạch đầy đủ mọi lệnh (lý do + vùng mua + cắt lỗ/chốt lời)   tối đa 40
+ Cắt lỗ đúng phiên khi giá chạm       mỗi lần +20 (tối đa +40)
+ Không nhồi lệnh khi đang lỗ          mỗi lần +10 (tối đa +30)
+ Chốt lời đúng, không tham thêm       mỗi lần +10 (tối đa +30)

Ngày không có tình huống thử thách kỷ luật → tính theo phần
kế hoạch (tối đa 40), ghi rõ: "Ngày không có tình huống kỷ luật"
```

**Trường hợp đặc biệt:**
- Ngày có lệnh, kế hoạch đầy đủ, không có tình huống test → tối đa 40 điểm
- Ngày không đặt lệnh nào → không chấm điểm ngày đó (không tính vào trung bình)

### Hiển thị

- Tab Hành trình: điểm hôm nay + vài dòng chi tiết vì sao được/mất điểm
- Trong màn Kết sổ (sau mỗi lệnh): cập nhật điểm nếu lệnh đó ảnh hưởng
- Phân tích danh mục (§12): biểu đồ điểm 30 ngày

### Ngưỡng

- **≥85:** xanh — "Ngày kỷ luật cao"
- **70-84:** vàng — "Ổn, còn 1-2 điểm chưa trọn"
- **<70:** đỏ — "Có vi phạm đáng chú ý"

---

## 8. CẢNH BÁO GIÁ CHẠM CẮT LỖ CUỐI PHIÊN (🟢 THÊM MỚI)

Công cụ can thiệp mềm quan trọng nhất. Chống hành vi "giữ chạm cắt lỗ không cắt" — hy vọng hồi.

### Trigger

**Cuối phiên (sau 15:00):** với mỗi mã user giữ, check giá đóng cửa ≤ cắt lỗ cam kết → đánh dấu `cham_SL_cuoi_phien: true`

**Đầu phiên sáng hôm sau (từ 08:45):** với mã có `cham_SL_cuoi_phien` chưa bán → banner cảnh báo (không modal chặn) ở đầu trang chủ + trong panel Nắm giữ. Tồn tại đến khi user bán hoặc bấm "Giữ tiếp".

### Nội dung banner

```
⚠ VNM ĐÃ CHẠM CẮT LỖ KẾ HOẠCH CỦA BẠN

  Cắt lỗ cam kết:      59.300 (−5,0%)
  Giá đóng cửa hôm qua: 59.100 (−5,3%)
  Kế hoạch ban đầu (từ 15/07): cắt lỗ tại 59.300
                               để bảo toàn vốn.

  Trong 30 ngày qua trên IQX, 74% lần user giữ chạm
  cắt lỗ kết thúc lỗ nặng hơn kế hoạch ban đầu.

  [ Bán ATO — theo kế hoạch ]  [ Giữ tiếp — ghi vi phạm ]
```

### Hành vi

- **Bán ATO:** chuẩn bị lệnh bán ATO (user vẫn xác nhận cuối), ghi `cham_SL_cat_dung_phien_ke = true`
- **Giữ tiếp:** đóng banner, ghi vi phạm `cham_SL_khong_cat`, tăng `giu_cham_SL_bao_nhieu_phien` mỗi phiên
- **Banner cập nhật theo số phiên giữ:**
  - Phiên 1: như trên
  - Phiên 2: "VNM đã chạm cắt lỗ 2 phiên. Càng giữ càng khó cắt."
  - Phiên 3+: "VNM đã chạm cắt lỗ {N} phiên. Cấp 3 có phần đặc biệt về hành vi 'ôm lệnh lỗ' — hãy suy nghĩ."

---

## 9. CẢNH BÁO TỨC THỜI NHỒI LỆNH (🟢 THÊM MỚI)

Khi user submit lệnh mua, kiểm trước khi cho xác nhận.

### Điều kiện trigger

- User đang có vị thế mở cùng mã
- Vị thế đó đang lỗ >−3%

### Popup

```
⚠ BẠN ĐANG NHỒI LỆNH VÀO MÃ ĐANG LỖ

  Mã: VNM
  Vị thế hiện tại: 100 CP · giá vốn 62.400 · đang lỗ −4,8%
  Bạn định mua thêm: 100 CP với giá 59.400

  Đây là hành vi averaging down. Trong 30 ngày qua, 68%
  lần user nhồi lệnh khi lỗ kết thúc mất tiền nặng hơn
  cắt lỗ ban đầu.

  Kế hoạch ban đầu cho VNM: cắt lỗ = 59.300 (bạn đã CHẠM).

  [ Hủy — không nhồi ]  [ Vẫn mua thêm — ghi vi phạm ]
```

Không chặn. Ghi `nhoi_lenh_khi_lo` nếu user vẫn mua.

---

## 10. GIỚI HẠN SỐ CẢNH BÁO (🟢 THÊM MỚI · chống quá tải)

**Vấn đề cần tránh — quá tải cảnh báo:** user Cấp 2 có thể gặp nhiều popup/ngày (chạm cắt lỗ, nhồi lệnh). Quá nhiều → user tắt não → bấm bừa "Vẫn đặt" → cảnh báo mất tác dụng.

Áp cho toàn bộ cảnh báo ở §9, §10 (và mọi popup can thiệp):

### Giới hạn số cảnh báo
- **Không hiển thị >2 alert quan trọng trong 1 phiên** (chạm SL + nhồi lệnh tính là "quan trọng"; sticky Nhật ký không tính)
- Nếu có >2 tình huống, ưu tiên: nhồi lệnh (tức thời, chặn được hậu quả ngay) > chạm SL cuối phiên

### Auto-mute có điều kiện
- Nếu user **không vi phạm 1 loại trong 10 lệnh gần nhất** → **tắt cảnh báo loại đó** (user đã học được, không cần nhắc nữa)
- Khi user tái vi phạm loại đó → bật lại cảnh báo

### Escalation ngược (chống bấm bừa)
Nếu user bỏ qua 1 loại alert (bấm "Vẫn đặt"/"Giữ tiếp") nhiều lần liên tiếp:
- **Lần 1-2:** popup thường, 1 click là qua
- **Lần 3-4:** nút "Vẫn đặt" bị greyed 5 giây (buộc đọc trước khi bấm được)
- **Lần 5+:** bắt buộc gõ chữ *"Tôi hiểu"* để qua

### Ghi hồ sơ
- `so_canh_bao_hien(loai, ngay)` · `so_lan_bo_qua_lien_tiep(loai)` — để tính mức tăng cảnh báo

---

## 11. GHI NHẬN NHỎ (🟢 THÊM MỚI)

**Cấp 2 KHÔNG có huy chương / Tủ huân chương** (không cấp nào có huy chương). Thay vào đó là **Ghi nhận nhỏ** — toast ghi nhận tiến bộ nhẹ nhàng, không phải phần thưởng vật phẩm.

### Ghi nhận nhỏ (toast ghi nhận — không phải huy chương)

Toast nhẹ 2 giây (animation nhẹ, KHÔNG confetti, KHÔNG âm thanh chói) cho các milestone:
- **Chuỗi lệnh kỷ luật 10 / 20 / 30 / 50 lệnh** — *"Chuỗi mới — {N} lệnh liên tiếp không vi phạm, kỷ lục cá nhân"*
- **Điểm kỷ luật ≥85 xanh 7 ngày liên tiếp** — dòng nhỏ **"Tuần xanh"** trong tab Hành trình

- **Hoàn thành 1 nhiệm vụ (①-⑤)** — toast *"✓ Hoàn thành: {tên nhiệm vụ}"* + cập nhật tiến trình tab Hành trình

Ghi nhận nhỏ chỉ là ghi nhận thoáng qua để user thấy mình đang tiến — không tích lũy thành bộ sưu tập, không có tủ, không so bì.

---

## 12. TRANG PHÂN TÍCH DANH MỤC CẤP 2 (🟡 CẬP NHẬT + 🟢 THÊM 3 KHỐI + 4 MẪU MỚI)

Giữ 4 khối Cấp 1, thêm 3 khối mới.

### Cập nhật 4 khối cũ
- **Khối 1:** hiển thị "Cấp 2 «Kỷ luật»"
- **Khối 3:** danh sách vi phạm dùng 4 loại của Cấp 2
- **Khối 4:** Cửa sổ 20 lệnh (mới ở Cấp 2), điều kiện lên Cấp 3

### 🟢 Khối 5 (MỚI) — Điểm kỷ luật 30 ngày
Biểu đồ đường 30 ngày + trung bình 30 ngày vs 7 ngày + phân bố số ngày Xanh/Vàng/Đỏ.

### 🟢 Khối 6 (MỚI) — Phân loại vi phạm theo tuần
Bảng cột 4 tuần × 4 loại vi phạm (cắt lỗ chậm · chốt lời hụt · bán sớm khi lỗ nhẹ · nhồi lệnh) + xu hướng.

### 🟢 Khối 7 (MỚI) — Phát hiện từ ghi chú (cho "Why", không chỉ "What")

Hàng tuần, hệ thống quét ghi chú nhìn lại user đã ghi (trong màn Kết sổ khi có vi phạm) + hành vi thực → tìm mẫu nội tâm:

```
🔍 REFLECTION INSIGHTS — 4 tuần gần nhất

  Bạn có 5 vi phạm và đã ghi lý do:

  • 3/5 lần liên quan cụm từ "VN-Index giảm mạnh"
    → Có phải bạn phản ứng với chỉ số hơn là với mã?
    → Cấp 3 «Bản lĩnh» sẽ dạy tách quyết định khỏi kết quả.

  • 2/5 lần liên quan "sợ mất lãi"
    → Đây là loss aversion điển hình.
    → Nghiên cứu: nỗi đau mất lãi ≈ 2× niềm vui giữ lãi.
```

**Cơ chế:** scan cụm từ trong ghi chú nhìn lại, gắn vào 6 pattern nội tâm có sẵn:
1. **Loss aversion** — "sợ mất", "tiếc", "không muốn thua", "chờ hồi"
2. **Chỉ số hóa** — "VN-Index", "thị trường", "toàn thị trường"
3. **FOMO** — "sợ bỏ lỡ", "mọi người mua", "hot", "sốt"
4. **Tin tức** — "tin", "báo", "công bố"
5. **Không tin phân tích** — "không chắc", "nghi ngờ", "không tin"
6. **Cảm xúc mạnh** — "hoảng", "sợ", "tức", "buồn"

Mỗi pattern có 1 câu diễn giải + 1 gợi ý cấp sau. Cần ≥3 ghi chú nhìn lại có nội dung mới hiển thị.

### 🟢 4 mẫu tự phát hiện MỚI (mẫu 9-12)

Thêm vào 8 mẫu Cấp 1 = 12 mẫu, tối đa 3 hiện cùng:

**Mẫu 9 — Loại vi phạm phổ biến nhất**
- ĐK: 1 loại chiếm ≥50% tổng vi phạm 30 ngày, tổng ≥5
- ND: *"Vi phạm phổ biến nhất: {tên loại} ({%} tổng). Đây là điểm yếu chính cần khắc phục."*

**Mẫu 10 — Cách chọn nào hay bẻ kế hoạch**
- ĐK: 1 lý do có tỷ lệ vi phạm ≥30%, ≥5 lệnh
- ND: *"Với lý do {icon}{tên}, bạn vi phạm {%} lệnh. Các lý do khác chỉ {%}. Có phải lệnh {tên} làm bạn nghi ngờ nhiều hơn?"*

**Mẫu 11 — Ngày trong tuần vi phạm**
- ĐK: ≥60% vi phạm rơi vào cùng 1 ngày, tổng ≥5
- ND: *"{X}/{Y} vi phạm gần nhất vào {ngày}. Có phải {gợi ý theo ngày}?"* (Thứ Sáu → "muốn chốt sổ cuối tuần nên bốc đồng?")

**Mẫu 12 — Điểm kỷ luật xu hướng**
- ĐK: ≥14 ngày dữ liệu
- ND: chênh ≥5 điểm giữa 7 ngày và 30 ngày → *"Điểm kỷ luật 7 ngày {N} — {cao/thấp} hơn 30 ngày trước ({M}). Kỷ luật đang {cải thiện/đi xuống}."*

### Thứ tự ưu tiên (12 mẫu)
1. Mẫu kỷ luật Cấp 1 (4,5,6)
2. Điểm kỷ luật xu hướng cải thiện (12)
3. Loại vi phạm phổ biến (9)
4. Ngược chiều (3,8)
5. Cách chọn hay bẻ kế hoạch (10)
6. Ngày trong tuần (11)
7. Vũ khí riêng (1) · điểm mù (2) · chọn lý do có cơ sở (7)

Xếp mẫu tích cực trước, cảnh báo sau.

---

## 13. DỮ LIỆU CẦN GHI

### Bảng `cap2_progress`
```
user_id · entered_at
task_1_done_at ... task_5_done_at        -- 5 nhiệm vụ
chuoi_current · chuoi_record · last_chuoi_reset_at
graduated_at · time_to_graduate_hours
```

### Cập nhật bảng `order_kehoach` (đã có từ Cấp 1) — thêm:
```
phuong_phap_sl_tp                        -- 'ho_tro_khang_cu' / 'bien_do_dao_dong'
```

### Cập nhật bảng `order_ketso` (đã có từ Cấp 1) — thêm:
```
cham_SL_cuoi_phien: bool
cham_SL_cat_dung_phien_ke: bool
cham_SL_khong_cat: bool                   -- vi phạm cắt lỗ chậm
giu_cham_SL_bao_nhieu_phien: int
cham_TP_giu_lam_hut: bool                 -- vi phạm chốt lời hụt
ban_som_khi_lo_nhe: bool                  -- vi phạm bán sớm
nhoi_lenh_khi_lo: bool                    -- vi phạm nhồi lệnh
```
(KHÔNG có cột `doi_SL`/`doi_TP` — đã bỏ từ Cấp 1. KHÔNG có `ma_ngoai_tieudiem` — không dùng Tiêu điểm.)

### Sự kiện analytics
```
cap2_task_complete(task_id)
cap2_chuoi_increment(v) · cap2_chuoi_reset(prev) · cap2_chuoi_new_record(v)
cap2_sl_tp_method_choose(method)          -- chọn cách cắt lỗ/chốt lời
cap2_diem_ky_luat_daily(score)
cap2_cham_SL_alert_shown(order_id, phien) · cap2_cham_SL_alert_action(order_id, action)
cap2_nhoi_lenh_alert_shown(ma, pnl) · cap2_nhoi_lenh_alert_action(ma, action)
cap2_alert_escalation(loai, level)        -- theo dõi escalation
cap2_ghinhanNho(type)                     -- chuỗi 10/20/... · tuần xanh
cap2_pattern_shown(pattern_id)            -- mẫu 9-12
cap2_ghi chú nhìn lại_insight_shown(pattern)
cap2_graduate
```

---

## 14. NGOÀI PHẠM VI CẤP 2 (chống scope-creep)

Cấp 2 **KHÔNG có** — dev không tự thêm:
- **Khẩu vị rủi ro** — Cấp 3 (sẽ điều chỉnh hệ số Cách 2)
- **Khối lượng mua hợp lý** (mua bao nhiêu cổ phiếu) — Cấp 3 (liên quan khẩu vị rủi ro)
- **Tiêu điểm 2 tuần** (chọn 3-5 mã) — đã bỏ hoàn toàn
- **Mức độ tự tin của lệnh / Tách quyết định khỏi kết quả** — Cấp 3
- **Nhập tay tự do cắt lỗ/chốt lời** — Cấp 2 bắt buộc chọn 1 trong 2 cách; tự do hơn từ Cấp 3
- **Trailing stop / Chandelier Exit** — cấp cao hơn, chưa bàn
- **Leaderboard, so bì user** — không bao giờ (chỉ so median IQX)
- **Confetti, âm thanh chói** — không
- **Reset chuỗi / Điểm kỷ luật / bỏ vi phạm** — KHÔNG BAO GIỜ

---

## 15. CHECKLIST BÀN GIAO CHO DEV (kiểm trước merge)

- [ ] Cửa sổ trượt 20 lệnh (mới ở Cấp 2 — Cấp 1 không có)
- [ ] Phần Cắt lỗ/Chốt lời hiện SẴN trong Form Kế hoạch (không phải bấm nút mới hiện), 2 cách chọn 1
- [ ] Cách 1 lấy đúng hỗ trợ/kháng cự từ L1; Cách 2 tính đúng biên độ dao động × 2/4
- [ ] Bắt buộc chọn 1 trong 2 cách — không có nhập tay tự do ở Cấp 2
- [ ] Icon ? mỗi cách hiện tooltip giải thích ngắn
- [ ] Chuỗi lệnh kỷ luật đếm đúng, reset đúng, hiện activity meter + cảnh báo <1 lệnh/tuần
- [ ] Điểm kỷ luật công thức 2 phần, ngày không tình huống test → tối đa 40, ghi rõ
- [ ] Cảnh báo chạm SL cuối phiên: banner sáng phiên sau, câu chữ tăng theo số phiên
- [ ] Cảnh báo tức thời nhồi lệnh: popup khi mua mã đang lỗ >−3%
- [ ] Giới hạn số cảnh báo: ≤2 alert quan trọng/phiên · Auto-mute loại đã học · Escalation 3/5 lần
- [ ] KHÔNG có huy chương / Tủ huân chương (không cấp nào có huy chương); chỉ có Ghi nhận nhỏ toast ghi nhận tiến bộ
- [ ] Ghi nhận nhỏ toast: Chuỗi 10/20/30/50 · Tuần xanh
- [ ] Phân tích danh mục: 3 khối mới (Điểm kỷ luật 30 ngày + Phân loại vi phạm + Phát hiện từ ghi chú)
- [ ] 4 mẫu mới (9-12) chạy đúng ngưỡng, thứ tự ưu tiên đúng
- [ ] Phát hiện từ ghi chú scan đúng 6 pattern nội tâm, cần ≥3 ghi chú nhìn lại
- [ ] Bảng `cap2_progress` đã có; cột mới trong `order_kehoach` + `order_ketso` đã thêm (cắt lỗ/chốt lời + đo kỷ luật); KHÔNG có bảng nhật ký
- [ ] Analytics ghi đủ (§13)
- [ ] Màn tốt nghiệp Cấp 2 đúng khi 5/5 nhiệm vụ, huy hiệu Cấp 3 (xanh brand) mở khóa

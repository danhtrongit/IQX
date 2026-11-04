# Spec Flashback · v2.3 · Biểu đồ: chú giải nổi, chiều cao ô, trục giá

> Ngày: 04/11/2026
>
> **Bổ sung cho:** `IQX-Flashback-SPEC-v2.md`, `IQX-Flashback-SPEC-v2.1-BoSung.md`.
> - **Thay** v2 §6.4 phần "Chiều cao khung" và "Chú giải không bị che".
> - **Thay** toàn bộ v2.1 §8 "Chiều cao biểu đồ".
> - Mọi phần khác của biểu đồ (nến, trục ngang, vùng "?", vạch Bắt đầu, điểm mua bán, công cụ vẽ, 16 chỉ báo, hộp "Các chỉ báo", hộp cài đặt, tham số theo registry Bot) **giữ nguyên**.
>
> **HTML mẫu:** `IQX-Flashback-Bieu-Do-MAU.html`. Nút **Hiện tại / Đề xuất** để so; spec này là bên **Đề xuất**.
>
> **Quy ước:** **[THAY ĐỔI]** là điểm khác spec cũ.

---

## 0. Lỗi cần sửa

Trên web hiện tại:
1. Thêm vài đường MA thì **nến và khối lượng bị ép xuống** còn một vệt mỏng.
2. Thêm ô chỉ báo bên dưới (RSI, MACD…) thì **nến và khối lượng bị ép lên**.

Nguyên nhân:

| # | Nguyên nhân | Nằm ở |
|---|---|---|
| 1 | Mỗi chỉ báo trên ô giá chiếm thêm một dòng chú giải ở đầu ô, phần vẽ nến hẹp dần | v2 §6.4 "Chú giải không bị che" |
| 2 | Tổng chiều cao biểu đồ cố định, các ô chia theo tỷ lệ; thêm ô thì ô giá nhỏ lại | v2.1 §8 |
| 3 | Trục giá tính theo cả các đường MA; MA dài (ví dụ SMA200) nằm xa giá kéo giãn trục | Cách tự co trục hiện tại |

---

## 1. Chú giải nổi trên biểu đồ (như TradingView) [THAY ĐỔI]

### 1.1 Vị trí
- Mỗi ô (giá, khối lượng, từng ô chỉ báo riêng) có chú giải ở **góc trên bên trái của chính ô đó**.
- Chú giải **nằm đè lên phần vẽ**, **không chiếm dòng nào** của ô. Nến và đường vẽ dùng hết chiều cao ô.
- Mỗi dòng có nền tối trong suốt nhẹ (đen 40%) bao sát chữ để đọc được khi đè lên nến. Không có khung lớn bao cả khối chú giải.

### 1.2 Nội dung
- **Ô giá:**
  - Dòng 1: tên phiên ("Phiên 0", "Phiên 15", "n phiên trước") · O · H · L · C · % thay đổi. Màu theo nến tăng/giảm.
  - Mỗi chỉ báo trên ô giá **một dòng riêng**: tên + tham số (ví dụ "MA 20", "BB 20 2", "EMA 50", "Donchian 20") và giá trị, chữ đúng màu đường vẽ.
- **Ô khối lượng:** "Khối lượng {giá trị}", thêm một dòng nếu bật chỉ báo Khối lượng.
- **Ô chỉ báo riêng:** một dòng: tên + tham số + các giá trị (ví dụ "MACD 12 26 9 · MACD · Signal · Histogram").
- **Không gộp, không thu gọn** các dòng chỉ báo. Mỗi chỉ báo luôn có dòng riêng để chỉnh được.
- Giá trị theo nến mới nhất. Rê chuột hoặc chạm vào nến nào thì mọi dòng hiện giá trị của nến đó (giữ nguyên v1 §2.5).

### 1.3 Nút trên từng dòng
- 3 nút giữ nguyên chức năng v1 §2.7: **Ẩn/Hiện** (con mắt) · **Cài đặt** · **Xóa**.
- **Máy tính:** nút hiện khi rê chuột vào dòng đó.
- **Điện thoại [THAY ĐỔI]:** chạm vào dòng thì hiện 3 nút của dòng đó; chạm dòng khác thì chuyển sang dòng khác; chạm ra ngoài thì ẩn. (Trước đây luôn hiện, làm chú giải rộng và che nhiều nến.)
- Chỉ báo đang ẩn: dòng chú giải mờ đi, nút con mắt đổi sang con mắt gạch.
- Bấm **Cài đặt** mở **hộp cài đặt đang có** (tab Đầu vào, Mặc định, Hủy, OK; tham số và miền theo registry Bot). Không đổi hộp cài đặt.

### 1.4 Tương tác với biểu đồ
- Chỉ các dòng chú giải nhận chuột/chạm; phần trống giữa các dòng vẫn thuộc biểu đồ (rê chuột, chạm xem nến, công cụ vẽ hoạt động bình thường).
- Đang ở chế độ vẽ (Xu hướng, Fibonacci) thì bấm vào dòng chú giải vẫn mở nút như thường, không tạo điểm vẽ.

---

## 2. Chiều cao các ô [THAY ĐỔI]

Thay bảng chiều cao ở v2 §6.4 và toàn bộ v2.1 §8:

| Ô | Máy tính | Điện thoại |
|---|---|---|
| Giá | **tối thiểu 320 px**, giãn thêm khi còn chỗ | **tối thiểu 240 px** |
| Khối lượng | **cố định 80 px** | **cố định 64 px** |
| Mỗi ô chỉ báo riêng | **cố định 100 px** | **cố định 84 px** |
| Trục thời gian | 22 px | 22 px |

**Cách tính (máy tính):**
1. Chiều cao còn lại = chiều cao cửa sổ trừ thanh người chơi, 3 ô số liệu, hàng nút chỉ báo/công cụ vẽ, nút Phiên tiếp (giữ mục tiêu v2.1 §8: vừa một màn khi ít chỉ báo).
2. Ô giá = **lớn hơn** của 320 px và (chiều cao còn lại − khối lượng − tổng các ô chỉ báo − trục thời gian).
3. Khi ô giá chạm 320 px mà vẫn thêm ô chỉ báo thì **biểu đồ dài thêm xuống dưới**, trang cuộn được. **Không bao giờ ép ô giá dưới 320 px và không ép ô khối lượng hay ô chỉ báo.**

**Điện thoại:** ô giá 240 px; thêm ô chỉ báo thì biểu đồ dài thêm, trang cuộn bình thường (bỏ quy tắc "cao cố định 380 px" của v2.1 §8).

Thêm, xoá, ẩn chỉ báo trên ô giá (MA, Bollinger, EMA…) **không làm đổi** chiều cao ô nào.

---

## 3. Trục giá [THAY ĐỔI]

- Trục giá tự co theo **giá cao nhất và thấp nhất của các nến đang hiện** (từ phiên lịch sử đầu tiên tới phiên đang mở), chừa 6% trên dưới.
- Các đường vẽ trên ô giá (MA, EMA, MA Cross, Bollinger, Donchian…) **không được kéo giãn trục**. Phần đường nằm ngoài khung bị cắt.
- Đường dạng MA (MA, EMA, hai đường MA Cross) mà **giá trị ở phiên đang mở nằm ngoài khung** thì ghi nhãn ở mép phải trong ô: "{tên} {giá trị} ↓" (dưới khung) hoặc "↑" (trên khung), đúng màu đường. Nhiều nhãn thì xếp chồng, không đè nhau.
- Dải Bollinger: phần tô nền bị cắt theo khung.
- Nhãn giá đóng cửa ở trục phải giữ như cũ; vạch lưới nào trùng chỗ nhãn này thì bỏ số của vạch.
- Công cụ vẽ (v2.1 §7) neo theo (phiên, giá) nên tự đi theo trục mới; phần ngoài khung bị cắt như hiện tại.
- Ô chỉ báo riêng giữ thang riêng như hiện tại (RSI, Stochastic 0–100; MACD, DMI tự co theo dữ liệu của ô).

---

## 4. Tiêu chí nghiệm thu
1. Thêm 3 MA (10, 20, 200) và 1 Bollinger: ô giá **không đổi chiều cao**, nến vẫn chiếm gần hết chiều cao ô.
2. Thêm RSI rồi MACD rồi Stochastic: ô giá và ô khối lượng **giữ nguyên chiều cao**; biểu đồ dài thêm 100 px mỗi ô (điện thoại 84 px).
3. SMA200 nằm xa giá: trục giá vẫn theo nến; có nhãn "MA 200 {giá trị} ↓" ở mép phải.
4. Chú giải: mỗi chỉ báo một dòng, nằm đè lên biểu đồ, có đủ Ẩn · Cài đặt · Xóa; bấm Cài đặt mở hộp cài đặt đang có; đổi tham số thì dòng chú giải và đường vẽ đổi theo.
5. Điện thoại 390 px: chạm dòng chú giải thì hiện nút của dòng đó; không tràn ngang.
6. Rê chuột/chạm vào nến: mọi dòng chú giải đổi sang giá trị của nến đó.
7. Công cụ vẽ, điểm mua bán, vùng "?", vạch Bắt đầu hoạt động như trước.

---

## 5. Điểm cần chốt

| # | Điểm | Đề xuất |
|---|---|---|
| 1 | Trục ngang chỉ chừa 20 ô "?" phía trước rồi trượt theo phiên chơi (thay vì luôn hiện đủ lịch sử + toàn bộ phiên chơi) | Chưa làm trong đợt này; có trong HTML mẫu (ô "Chỉ chừa 20 ô ? phía trước") để xem thử |

# IQX Demo Trading — Cấp 1 «Học việc»
### Spec bàn giao đợt 2 · v3.0 (bản cuối) · 07/2026

Kèm 3 mockup: `iqx-cap1-datlenh.html` (panel đặt lệnh 2 trường) · `iqx-cap1-form-kehoach.html` (form Kế hoạch + AI Thanh tra) · `iqx-cap1-phantich-danhmuc.html` (trang Phân tích danh mục) · `iqx-cap1-hanhtrinh.html` (tab Hành trình).

---

## ⚠️ ĐỌC TRƯỚC — Nguyên tắc bàn giao (KHÔNG BỎ QUA)

Web IQX.vn **đã có sẵn** panel đặt lệnh · tab Nắm giữ · trang AI Phân tích cổ phiếu (6 lớp L1-L6) · trang AI Phân tích BCTC (KHỐI 0-07). Tài liệu này mô tả **PHẦN CHÊNH LỆCH (DELTA)** cần thêm cho Cấp 1 — KHÔNG dựng lại cái đã có.

Cấp 1 xây trên nền Cấp 0. Đọc kèm `IQX-Cap0-Spec.md` (hệ cấp mở, tab Hành trình, thanh gbar, badge chế độ, bảng màu, hàm `badge()`).

**Cơ chế bán (áp dụng toàn hệ thống):** Hệ thống **KHÔNG tự động bán**. User luôn **tự tay bấm bán**. Cấp 1 chưa có cắt lỗ/chốt lời (thuộc Cấp 2).

**Ranh giới cấp (cố ý sạch):**
- **Cấp 0** = cơ học (mua/bán, Nắm giữ, Theo dõi) — chip lý do đời thường
- **Cấp 1** = đầu vào có cơ sở — lý do mua (5 lý do) + vùng mua
- **Cấp 2** = đầu ra + kỷ luật — thêm cắt lỗ/chốt lời + đo kỷ luật thực hiện

---

## 0. BẢNG TỔNG SCOPE — AI đọc bảng này trong 30 giây là biết code gì

| Nhóm | Nghĩa | Thành phần |
|---|---|---|
| 🟢 **THÊM MỚI** — code từ đầu | Chưa có trên web | · **Form Kế hoạch 2 trường** (Lý do mua 5 lý do + Vùng mua, cổng cứng) — §5<br>· **Panel AI Thanh tra** — §6<br>· **Trang Phân tích danh mục** (4 khối, 3 mẫu tự phát hiện) — §7<br>· **Màn Kết sổ Cấp 1** — §7<br>· **Màn tốt nghiệp Cấp 1** — §3 |
| 🟡 **ẨN THEO CẤP** — có sẵn, chỉ mở/ẩn | Bọc điều kiện, KHÔNG xoá code | · **Bỏ chế độ Sân tập** — Cấp 1 chỉ Thực chiến<br>· **Khối 5 chip lý do đời thường của Cấp 0** → ẨN, thay bằng Form Kế hoạch 2 trường (§5)<br>· **Mở lên hết ở Cấp 1:** Tin tức, AI Mẫu nến, ô Giá, dropdown loại lệnh<br>· **Sổ lệnh bid/ask vẫn ẨN** (chỉ mở ở Cấp 2) |
| 🔵 **GẮN THÊM EVENT** — logic có sẵn, chỉ nghe sự kiện | Không sửa logic | · **Đặt lệnh mua** — cổng cứng: chặn nếu thiếu Lý do mua hoặc Vùng mua<br>· **Bán lệnh** — mở màn Kết sổ Cấp 1<br>· **Chọn lý do trong Form** — fetch dữ liệu lớp, hiện panel AI Thanh tra<br>· **Bấm "Phân tích danh mục"** — mở trang Phân tích danh mục |
| ⚪ **GIỮ NGUYÊN** — không đụng | Đọc-để-tham-chiếu | · Panel đặt lệnh (nút MUA/BÁN, khớp lệnh, số dư, phí, Trần/Sàn/TC, ô Giá, loại lệnh)<br>· Chart TradingView + toolbar vẽ<br>· Bảng giá, ★ Danh mục, header, tab Nắm giữ/Theo dõi/Lịch sử<br>· Trang AI Phân tích cổ phiếu · AI Phân tích BCTC · 3 bản tin |

---

## 1. NGỮ CẢNH CẤP 1

**Bài học một câu:** *"Vào lệnh phải biết VÌ SAO mua và mua vùng nào."*

Cấp 1 lo **đầu vào của một lệnh**: lý do mua và vùng mua. Chuyện thoát lệnh (cắt lỗ/chốt lời) và kỷ luật thực hiện thuộc Cấp 2.

**Đặc điểm khác Cấp 0:**

| | Cấp 0 | Cấp 1 |
|---|---|---|
| Chế độ | Sân tập T+0 | **Thực chiến T+2,5** (luật thật) |
| Kế hoạch | 1 chip lý do đời thường | **Form 2 trường: Lý do mua (1 trong 5 lý do) + Vùng mua** |
| Kết sổ | 2 template rút gọn | **Đầy đủ, hỏi cảm xúc lệnh "có chuyện" + 3 dòng cá nhân hóa** |
| Số lệnh cần | 1 lệnh (+ 1 bán) | **10 lệnh** để tốt nghiệp |

**Huy hiệu Cấp 1:** viên lục giác ĐỒNG `#c97b4a`, `fill=1` (hàm `badge()` §12 Cấp 0). Badge góc: `THỰC CHIẾN`.

**Cấp 1 KHÔNG có huy chương con / Tủ huân chương** — thứ đó bắt đầu từ Cấp 2.

---

## 1.1 HAI NHÁNH USER VÀ TOUR SẢN PHẨM (quan trọng cho dev)

Tour sản phẩm (bảng điện · bản tin · 6 người chơi) gắn với việc **"chưa từng xem"**, KHÔNG gắn với cấp. Dùng cờ `user.da_xem_tour` (bool).

| | NHÁNH A — Đi từ Cấp 0 | NHÁNH B — Xếp lớp vào thẳng Cấp 1 |
|---|---|---|
| Nguồn | Tốt nghiệp Cấp 0 lên | Câu hỏi xếp lớp chọn "Có, chưa tự tin" |
| Đã xem tour? | ✅ Rồi (3 tour ở Chặng 2 Cấp 0) | ❌ Chưa bao giờ |
| Vào Cấp 1 | **KHÔNG lặp lại tour** — vào thẳng đặt lệnh | **BẮT BUỘC xem 3 tour** trước khi đặt lệnh đầu tiên |
| Cờ | `da_xem_tour = true` (set khi tốt nghiệp Cấp 0) | `da_xem_tour = false` → buộc xem → sau khi xong set `true` |

**Logic dev:**
- Khi user vào Cấp 1, kiểm `da_xem_tour`:
  - `true` (Nhánh A) → mở thẳng Form Kế hoạch, không hiện tour
  - `false` (Nhánh B) → **cổng cứng**: chưa xem xong 3 tour thì nút ĐẶT LỆNH MUA khóa, hiện dẫn: *"Xem nhanh 3 tour sản phẩm để bắt đầu (khoảng 3 phút)."*
- 3 tour dùng chung nội dung + cơ chế spotlight với Cấp 0 (chuẩn spotlight §11 Cấp 0). Bàn giao nội dung tour ở spec tour riêng.
- Sau khi Nhánh B xem xong 3 tour → set `da_xem_tour = true`, mở Form Kế hoạch.

---

## 2. SÁU NHIỆM VỤ CẤP 1

Cấp 1 đo **số lượng + độ phủ** (thực chiến đủ nhiều, làm quen cả 5 lý do) + bước đầu **chất lượng** (chọn lý do có dữ liệu ủng hộ).

### ① Lệnh Thực chiến đầu tiên có kế hoạch
- Điều kiện mở: vào Cấp 1 (Nhánh B: sau khi xem xong 3 tour)
- Yêu cầu: đặt xong 1 lệnh Thực chiến với Form Kế hoạch (Lý do mua + Vùng mua)
- Copy (khi active): *"Cấp 1 khác Cấp 0 — mọi lệnh phải có kế hoạch: chọn lý do mua (1 trong 5 lý do) + vùng mua. Thiếu 1 trong 2 không đặt được lệnh."* · Nút "Làm ngay →"
- Hoàn thành: lệnh đầu khớp với 2 trường đủ

### ② Bán lệnh đầu — Kết sổ đầu
- Điều kiện mở: xong ①, có ≥1 lệnh mở
- Yêu cầu: bán 1 lệnh → đóng màn Kết sổ Cấp 1 (§7)
- Hoàn thành: đóng màn Kết sổ

### ③ Làm quen 5 lý do — chọn đủ 5 lý do mua
- Điều kiện mở: xong ①
- Yêu cầu: đã **chọn đủ cả 5 lý do mua**, mỗi loại ≥1 lần (qua các lệnh)
- **KHÔNG cần khớp dữ liệu** — chỉ cần *chọn* lý do đó khi đặt lệnh, kể cả khi AI Thanh tra chấm ⚪/❌. Mục tiêu: làm quen cả 5 góc nhìn.
- Hiển thị: bảng 5 ô lý do, mỗi ô counter `đã dùng: X lần`. Đủ 5/5 ô có ≥1 lần là xong.

### ④ Chọn lý do có cơ sở — 3 lệnh có lý do được ✅ Ủng hộ
- Điều kiện mở: xong ①
- Yêu cầu: ≥ **3 lệnh** có lý do mua được **AI Thanh tra chấm ✅ Ủng hộ** tại thời điểm đặt lệnh
- Khác ③: ③ dạy *rộng* (thử đủ 5 lý do), ④ dạy *sâu* (chọn lý do đang được dữ liệu hậu thuẫn)
- Đo bằng: cột `trangThai_luc_dat = 'ung_ho'`
- Ghi chú roadmap: dạy "ưu tiên lệnh có dữ liệu ủng hộ" — đúng cho người mới ở Cấp 1. Tư duy phản biện ngược đám đông để dành Cấp 4-5.
- Hiển thị: counter `Lý do có cơ sở (✅): X/3`

### ⑤ Xem lại danh mục — mở trang Phân tích danh mục 3 lần
- Điều kiện mở: sau ①, khi đã có ≥3 lệnh đã đóng
- Yêu cầu: mở trang Phân tích danh mục (§7) và xem **3 lần khác ngày** — tạo thói quen nhìn lại tổng thể, không chỉ nhìn từng lệnh
- Vì sao: buộc user dùng công cụ phân tích để thấy mẫu hình của chính mình (lý do nào thắng nhiều, lý do nào thua)
- Hiển thị: counter `Đã xem lại danh mục: X/3 lần`

### ⑥ Tổng số lệnh Thực chiến — 10 lệnh
- Điều kiện mở: vào Cấp 1
- Yêu cầu: tổng **10 lệnh Thực chiến** (cả đang mở và đã đóng)
- Hiển thị: counter `Lệnh Thực chiến: X/10`

**Lưu ý logic:** ① ② tự động hoàn thành khi làm tới 10 lệnh — chúng là **cột mốc cảm xúc đầu tiên** (lệnh đầu, kết sổ đầu). Bốn ràng buộc thực chất: ③④⑤⑥.

---

## 3. TỐT NGHIỆP CẤP 1

Điều kiện: **6/6 nhiệm vụ**.

Màn tốt nghiệp — 3 khối:

**Header:** Tag `HOÀN THÀNH` · Tên `CẤP 1 · HỌC VIỆC` · Dòng phụ `6/6 nhiệm vụ · 10 lệnh Thực chiến` · Huy hiệu Cấp 1 cỡ 120px phát sáng.

**Khối 1 — Ghi nhận:**
*"Bạn đã đi qua 10 lệnh Thực chiến đầu tiên — mọi lệnh đều có kế hoạch: biết vì sao mua và mua vùng nào. Bạn đã thử cả 5 lý do, và có ít nhất 3 lần chọn được lý do đang được dữ liệu ủng hộ. **Bạn không còn vào lệnh cảm tính.**"*

**Khối 2 — Định vị:**
*"Nhưng biết mua thôi chưa đủ. Vào lệnh dễ, thoát lệnh mới khó. Cấp 2 «Kỷ luật» dạy điều khó hơn: **đặt cắt lỗ / chốt lời có cơ sở, và thực hiện đúng cam kết của chính mình** — không cắt lỗ chậm vì hy vọng, không tham thêm khi đã tới đích."*

**Khối 3 — Chuyển cấp** (viền ngọc lam `#7dd3c0`):
*"**Từ giờ: Cấp 2 «Kỷ luật».** Form Kế hoạch thêm 2 phần: Cắt lỗ và Chốt lời — với 2 cách đặt có cơ sở. Bạn sẽ có thêm: chuỗi lệnh kỷ luật · điểm kỷ luật hằng ngày · cảnh báo khi giá chạm cắt lỗ."*

**Nút:** `Vào Cấp 2 «Kỷ luật» →` (full width, ngọc lam). Sau khi bấm: huy hiệu góc đổi sang Cấp 2 (ngọc lam), route sang flow Cấp 2.

---

## 4. FORM KẾ HOẠCH KHI MUA (🟢 THÊM MỚI) — Trái tim Cấp 1

Panel đặt lệnh thêm khối **KẾ HOẠCH** trước nút ĐẶT LỆNH MUA. Ẩn khối 5 chip lý do đời thường của Cấp 0.

### 2 trường bắt buộc

**Trường 1 — Lý do mua (1 trong 5 lý do):**

| Icon | Tên hiển thị | Nguồn dữ liệu (dev lấy từ đây) |
|---|---|---|
| 🎯 | **Kỹ thuật** | AI Insight · L1 Xu hướng |
| 💰 | **Dòng tiền** | AI Insight · L3 Dòng tiền (khối ngoại + tự doanh) |
| 👤 | **Nội bộ** | AI Insight · L4 Nội bộ (lãnh đạo mua) |
| 📰 | **Tin tức** | AI Insight · L5 Tin tức |
| 💎 | **Định giá** | AI Phân tích BCTC · KHỐI 02 Giá đắt hay rẻ |

Chọn 1 lý do → panel AI Thanh tra hiện ngay bên dưới (§6).

**Trường 2 — Vùng mua:** số, mặc định = giá hiện tại; user chỉnh nếu muốn đợi giá tốt hơn.

**KHÔNG có Cắt lỗ / Chốt lời ở Cấp 1** (thêm ở Cấp 2).

### Cổng cứng
Nút `ĐẶT LỆNH MUA` **disabled** nếu thiếu Lý do mua hoặc Vùng mua. Tooltip: *"Chọn lý do mua và vùng mua mới đặt được lệnh."* Hợp lệ: Lý do đã chọn 1/5 · Vùng mua là số > 0.

### Ghi hồ sơ khi đặt lệnh
```
order_id · mode='thuc_chien'
lyDo: 1 in ('ky_thuat','dong_tien','noi_bo','tin_tuc','dinh_gia')
trangThai_luc_dat: 1 in ('ung_ho','trung_tinh','can_chu_y','nguoc_chieu')
vung_mua
co_bam_doc_chi_tiet: bool
snapshot_lop_du_lieu: JSON
```

---

## 5. PANEL AI THANH TRA 6 LỚP (🟢 THÊM MỚI)

Hiện ngay sau khi user chọn lý do. Trượt xuống mượt từ dưới dropdown lý do.

**Cấu trúc:**
```
🔍 AI ĐANG THẤY GÌ VỀ {MÃ} Ở LỚP "{TÊN LỚP}"?  (Dữ liệu từ {nguồn})
[Nội dung tóm tắt lớp — 3-5 dòng số liệu]
Trạng thái: {✅ ỦNG HỘ / ⚪ TRUNG TÍNH / ⚠ CẦN CHÚ Ý / ❌ NGƯỢC CHIỀU}
[ Đọc chi tiết lớp này → ]
```

**Nội dung + logic chấm trạng thái:**

AI Thanh tra map thẳng từ **thang 5 bậc** của AI Insight v2 (dùng đúng dữ liệu thật):

| Thang 5 bậc thật | AI Thanh tra |
|---|---|
| Rất mạnh · Hỗ trợ mạnh · Rất tích cực | ✅ Ủng hộ mạnh |
| Mạnh · Hỗ trợ nhẹ · Tích cực | ✅ Ủng hộ |
| Trung bình · Trung tính | ⚪ Trung tính |
| Yếu · Cảnh báo nhẹ · Tiêu cực | ⚠ Cần chú ý |
| Rất yếu · Cảnh báo mạnh · Rất tiêu cực | ❌ Ngược chiều |

- **🎯 Kỹ thuật** (L1 Xu hướng): đọc "Trạng thái" 5 bậc (Rất yếu→Rất mạnh) + Xu hướng (Tăng/Đi ngang/Giảm) + Hỗ trợ/Kháng cự + Đà giá.
- **💰 Dòng tiền** (L3): đọc "Tác động" 5 bậc (Cảnh báo mạnh→Hỗ trợ mạnh) — gộp khối ngoại + tự doanh. VD "Khối ngoại mua ròng đáng kể 3 phiên" → Hỗ trợ mạnh → ✅ Ủng hộ mạnh.
- **👤 Nội bộ** (L4): đọc "Tác động" 5 bậc — lãnh đạo/cổ đông lớn mua hay bán. VD "Chuỗi mua liên tiếp từ Hội đồng quản trị" → Hỗ trợ → ✅ Ủng hộ.
- **📰 Tin tức** (L5): đọc "Tổng quan" 5 bậc (Rất tiêu cực→Rất tích cực) — chỉ tính tin material.
- **💎 Định giá** (BCTC KHỐI 02): Vùng giá trị · Trung vị · Giá hiện tại vs vùng. Giá nửa dưới vùng → ✅ · quanh trung vị → ⚪ · nửa trên → ⚠ · vượt đỉnh → ❌.

**Trường hợp ❌ NGƯỢC CHIỀU:** thêm dưới trạng thái:
```
⚠ Lý do bạn chọn KHÔNG khớp với dữ liệu hiện tại của lớp này.
   [ Chọn lý do khác ]      [ Vẫn đặt lệnh với lý do này ]
```
KHÔNG chặn — chỉ soi gương. Lệnh lý do ❌ vẫn tính vào ③ (làm quen 5 lý do), KHÔNG tính vào ④ (lý do có cơ sở).

**Nút "Đọc chi tiết →":** mở trang phân tích gốc, auto-scroll tới lớp tương ứng. Ghi `co_bam_doc_chi_tiet=true`. Đây là hành vi tùy nguyện — KHÔNG phải nhiệm vụ.

---

## 6. MÀN KẾT SỔ CẤP 1 (🟢 THÊM MỚI · nâng cấp từ Cấp 0)

Mở khi user bán 1 lệnh Thực chiến. Đối chiếu **lý do + vùng mua + kết quả** (chưa có kỷ luật thoát lệnh — đó là Cấp 2).

**Header:** Tag `KẾT SỔ LỆNH · #{n} · THỰC CHIẾN` · Lãi/lỗ 42px đếm tăng · dòng phụ mono `+{VND}đ · MUA {số} {mã} → BÁN · Giữ {số} phiên`

**Bảng đối chiếu Kế hoạch / Thực tế:**

| | Kế hoạch | Thực tế |
|---|---|---|
| Lý do | (1 trong 5 lý do + icon) | — |
| Trạng thái lớp lúc đặt | (✅/⚪/⚠/❌) | — |
| Vùng mua | (số) | (giá vào thật) |
| Giá ra · thuế bán 0,1% | — | (giá) · (số thuế đỏ) |
| Thời gian giữ lệnh | — | (số phiên · số ngày lịch) |

**Khối cảm xúc (chỉ hiện cho lệnh "có chuyện"):**
Định nghĩa "có chuyện" ở Cấp 1: lỗ >−7% · giữ >10 phiên · bán trong vòng 1 phiên sau mua.
```
💭 TRƯỚC KHI BẤM BÁN, BẠN THẤY THẾ NÀO?
[ 😌 Bình tĩnh ]  [ 😰 Sợ ]  [ 😔 Hối tiếc ]  [ 🤔 Không rõ ]
```
1 câu, 4 lựa chọn, không bắt buộc. Ghi hồ sơ. Lệnh không "có chuyện": đi thẳng đến coach.

**Khối coach (rule-based):** Tag `NHÌN LẠI`. Chọn 1 template:

| # | Điều kiện | Template |
|---|---|---|
| A | Lãi, lý do lúc đặt ✅ | *"Lệnh lãi {%}. Bạn chọn lý do {lyDo} lúc lớp đó ✅ Ủng hộ — chọn lý do có cơ sở đã cho kết quả tốt. Ghi lại như mẫu chuẩn."* |
| B | Lãi, lý do lúc đặt ⚪/⚠ | *"Lệnh lãi {%}. Lý do {lyDo} lúc đặt chỉ {trạngThái} — kết quả tốt nhưng chưa chắc do phán đoán đúng. Thử ưu tiên lệnh có lý do ✅ Ủng hộ."* |
| C | Lỗ, lý do lúc đặt ✅ | *"Lệnh lỗ {%} dù lý do {lyDo} lúc đặt ✅ Ủng hộ. Có dữ liệu ủng hộ vẫn có thể lỗ — thị trường không chắc chắn. Đây không phải lỗi chọn lý do."* |
| D | Lỗ, lý do lúc đặt ❌ | *"Lệnh lỗ {%}. Lúc đặt, lớp {lyDo} đã ❌ Ngược chiều — bạn vẫn mua. Khi dữ liệu cảnh báo ngược, thị trường thường đúng."* |
| E | Giữ quá lâu (>10 phiên) | *"Bạn giữ lệnh {n} phiên. Ở Cấp 2 bạn sẽ học đặt chốt lời/cắt lỗ để biết khi nào nên thoát — không giữ mãi theo cảm tính."* |
| F | Bán vội (<1 phiên) | *"Bạn bán chỉ sau {n} phiên. Cảm xúc {emotion}. Ở Cấp 2 bạn sẽ học đặt vùng thoát trước, tránh bán theo phản ứng nhất thời."* |

Ưu tiên từ trên xuống.

**3 dòng cá nhân hóa — khối HỒ SƠ CỦA BẠN:**
```
📊 HỒ SƠ CỦA BẠN SAU LỆNH NÀY
• Đây là lệnh Thực chiến thứ 7/10 — còn 3 lệnh nữa để xét tốt nghiệp Cấp 1.
• Bạn đã dùng 3/5 lý do. Chưa thử: 👤 Nội bộ, 💎 Định giá.
• Với lý do 💰 Dòng tiền, bạn có 3/4 lệnh lãi.
```
Dòng 1: tiến trình nhiệm vụ · Dòng 2: nhiệm vụ còn thiếu · Dòng 3: thống kê cá nhân theo lý do (chưa đủ dữ liệu: *"Còn {n} lệnh nữa để hệ thống tìm mẫu riêng của bạn."*)

**Nút cuối:** `Đóng kết sổ ✓`

---

## 7. TRANG PHÂN TÍCH DANH MỤC (🟢 THÊM MỚI)

Mở từ nút "Phân tích danh mục" có sẵn trong tab Nắm giữ (trang riêng).

**Khối 1 — Hồ sơ tổng quan:**
```
HỒ SƠ NHÀ ĐẦU TƯ CỦA BẠN · Cấp 1 «Học việc»
10 lệnh Thực chiến · từ 15/03/2026
Tỷ lệ thắng: 62% · 6 lãi / 4 lỗ
Cách chọn ưa thích: 💰 Dòng tiền (4 lần dùng)
```
(Cấp 1 chưa có chỉ số Kỷ luật — đó là chỉ số đầu bảng Cấp 2.)

**Khối 2 — Bảng thắng/thua theo 5 lý do:** 5 hàng: Lý do · Số lệnh · Tỷ lệ thắng · Tổng lãi/lỗ. Nhãn ✅ nếu ≥65% và ≥5 lệnh · ❌ nếu ≤35% và ≥3 lệnh · ⚠ nếu 35-50% và ≥5 lệnh · <3 lệnh không nhãn. Sắp theo Tổng lãi/lỗ giảm dần.

**Khối 3 — Độ phủ 5 lý do + Chọn lý do có cơ sở:**
```
ĐỘ PHỦ 6 LÝ DO
🎯 ✓  💰 ✓  👤 ✗  📰 ✓  💎 ✗   → Đã dùng 3/5
CHỌN LÝ DO CÓ CƠ SỞ
Lệnh có lý do ✅ Ủng hộ lúc đặt: 3/10 · Nhiệm vụ ④: 3/3 ✓
```

**Khối 4 — Tiến trình lên Cấp 2:**
```
6 NHIỆM VỤ CẤP 1
✅ ① Lệnh đầu có kế hoạch   ✅ ② Kết sổ đầu tiên
🔲 ③ Đủ 5 lý do (3/5)       ✅ ④ 3 lệnh lý do ✅ (3/3)
🔲 ⑤ Xem lại danh mục (2/3)  🔲 ⑥ 10 lệnh (7/10)
Còn 2 lý do · 1 lần xem lại · 3 lệnh nữa để lên Cấp 2.
```
Khi đủ 6/6: *"🎉 Bạn ĐỦ điều kiện lên Cấp 2! [ Xem màn tốt nghiệp → ]"*

**Ngưỡng hiển thị:** <5 lệnh → chỉ Khối 1 + 4, ẩn Khối 2, ghi *"Cần ≥5 lệnh để có phân tích thắng/thua đáng tin. Hiện có {n}."* · ≥5 lệnh → đủ 4 khối.

**3 mẫu tự phát hiện (về lý do — Cấp 1 chưa có kỷ luật):** chạy sau mỗi lệnh đóng, tối đa 2 mẫu hiện cùng:
- **Mẫu 1 — Vũ khí riêng:** 1 lý do ≥5 lệnh VÀ tỷ lệ thắng ≥65% → *"Bạn thắng nhiều nhất khi mua vì {icon}{tên} — {n_win}/{n_total} lãi. Cách chọn phù hợp với bạn nhất."*
- **Mẫu 2 — Điểm mù:** 1 lý do ≥3 lệnh VÀ tỷ lệ thắng ≤35% → *"Bạn thua nhiều nhất khi mua vì {icon}{tên} — {n_lose}/{n_total} lỗ. Có thể hoãn cách chọn này đến khi thành thạo hơn."*
- **Mẫu 3 — Cơ sở đáng giá:** lệnh lý do ✅ có tỷ lệ thắng cao hơn lệnh ⚪/⚠/❌ ≥15% (mỗi nhóm ≥3 lệnh) → *"Lệnh chọn lý do ✅ Ủng hộ: tỷ lệ thắng {%}. Lệnh lý do khác: {%}. Chọn lý do có cơ sở đang cho kết quả tốt hơn."*

Chưa đủ dữ liệu: *"Còn {n} lệnh nữa để hệ thống tìm mẫu riêng của bạn."* (8 mẫu đầy đủ + mẫu kỷ luật thuộc Cấp 2.)

---

## 8. TAB HÀNH TRÌNH CẤP 1 (🟡 CẢI TIẾN từ Cấp 0)

Nội dung trên xuống:
1. **Thẻ cấp:** huy hiệu Cấp 1 (đồng, vòng progress = nhiệm vụ xong/6) · `CẤP 1 · HỌC VIỆC` · bài học in nghiêng · badge `THỰC CHIẾN`
2. **Checklist 6 nhiệm vụ:** header `TRƯỚC KHI LÊN CẤP 2 · x/6`. Nhiệm vụ ③ hiện bảng 5 ô lý do ✓/✗ · ④ `Lý do có cơ sở (✅): X/3` · ⑤ `Đã xem lại danh mục X/3 lần` · ⑥ `Lệnh Thực chiến X/10`
3. **Nút vào Phân tích danh mục**
5. **Ô đích cuối tab:** *"Xong 6/6 → tốt nghiệp Cấp 1, lên Cấp 2 «Kỷ luật» (viên lục giác ngọc lam). Cấp 2 thêm cắt lỗ/chốt lời + sổ lệnh."*

Journey bar sticky trên đầu như Cấp 0. (Cấp 1 KHÔNG có Tủ huân chương.)

---

## 9. DỮ LIỆU CẦN GHI

**Bảng `cap1_progress`:**
```
user_id · entered_at · da_xem_tour (bool)
task_1_done_at ... task_6_done_at
so_ly_do_da_dung          -- 0-6 (nhiệm vụ ③)
so_lenh_ly_do_ung_ho      -- đếm trangThai_luc_dat='ung_ho' (nhiệm vụ ④)
so_lan_xem_danh_muc       -- số lần khác ngày mở Phân tích danh mục (nhiệm vụ ⑤)
so_lenh_thuc_chien        -- (nhiệm vụ ⑥)
graduated_at · time_to_graduate_hours
```

**Bảng `order_kehoach`:**
```
order_id · lyDo · trangThai_luc_dat · vung_mua · co_bam_doc_chi_tiet · snapshot_lop_du_lieu
```
(KHÔNG có cột cat_lo, chot_loi — thuộc Cấp 2.)

**Bảng `order_ketso`:**
```
order_id · gia_ra · so_phien_giu · so_ngay_lich · pnl_pct · pnl_vnd
cam_xuc -- 'binh_tinh'/'so'/'hoi_tiec'/'khong_ro'/null · closed_at
```
(KHÔNG có cột kỷ luật thoát lệnh — thuộc Cấp 2.)

**Analytics:**
```
cap1_tour_start · cap1_tour_complete       -- cho Nhánh B
cap1_task_complete(task_id)
cap1_phantich_danhmuc_open   -- đếm cho nhiệm vụ ⑤
cap1_lop_check_open(ly_do) · cap1_lop_read_detail(ly_do)
cap1_ketso_view · cap1_ketso_emotion(emotion)
cap1_phantich_danhmuc_view · cap1_pattern_shown(pattern_id)
cap1_graduate
```

---

## 10. NGOÀI PHẠM VI CẤP 1 (chống scope-creep)

Cấp 1 **KHÔNG có** — dev không tự thêm:
- **Cắt lỗ / Chốt lời** — Cấp 2 (Form Cấp 1 chỉ 2 trường)
- **Kỷ luật thoát lệnh** (cắt lỗ đúng phiên, chốt lời đúng, nhồi lệnh...) — Cấp 2
- **Sổ lệnh bid/ask** — Cấp 2
- **Huy chương con / Tủ huân chương** — Cấp 2+ (Cấp 1 chỉ có huy hiệu cấp)
- **Cửa sổ trượt đánh giá chất lượng** — Cấp 1 dùng counter đơn giản; cửa sổ trượt thuộc Cấp 2
- **Chuỗi lệnh kỷ luật, Điểm kỷ luật** — Cấp 2+
- **Position sizing, khẩu vị rủi ro** — Cấp 3
- **Leaderboard, social, copy trade** — không có ở mọi cấp
- **Confetti, âm thanh chói** — không
- **Reset hồ sơ hành vi** — KHÔNG BAO GIỜ

---

## 11. CHECKLIST BÀN GIAO CHO DEV (kiểm trước merge)

- [ ] Badge góc đổi `SÂN TẬP · T+0` → `THỰC CHIẾN` khi vào Cấp 1
- [ ] Cờ `da_xem_tour`: Nhánh A (từ Cấp 0) = true, không lặp tour; Nhánh B (xếp lớp) = false, bắt buộc xem 3 tour trước khi đặt lệnh đầu
- [ ] Form Kế hoạch 2 trường (Lý do 5 lý do + Vùng mua) thay khối 5 chip lý do đời thường của Cấp 0
- [ ] Cổng cứng: thiếu Lý do hoặc Vùng mua = disabled nút MUA
- [ ] KHÔNG có trường Cắt lỗ / Chốt lời; sổ lệnh vẫn ẨN (chỉ mở Cấp 2)
- [ ] Panel AI Thanh tra hiện khi chọn lý do, chấm đúng ✅ Ủng hộ mạnh/✅/⚪/⚠/❌ theo thang 5 bậc thật
- [ ] Nút "Đọc chi tiết →" mở đúng trang/lớp (tùy nguyện, không phải nhiệm vụ)
- [ ] Lý do ❌: 2 nút "Chọn lý do khác" / "Vẫn đặt lệnh"
- [ ] Nhiệm vụ ③ đếm đủ 5 lý do (không cần khớp dữ liệu) · ④ đếm lệnh ✅, đủ 3 · ⑤ đếm số lần mở Phân tích danh mục khác ngày, đủ 3 · ⑥ đếm tổng lệnh, đủ 10
- [ ] KHÔNG có huy chương / Tủ huân chương ở Cấp 1
- [ ] Màn Kết sổ Cấp 1: đối chiếu lý do + vùng mua + kết quả (KHÔNG cắt lỗ/chốt lời), hỏi cảm xúc lệnh "có chuyện", coach 6 template, 3 dòng cá nhân hóa
- [ ] Phân tích danh mục: 4 khối, 3 mẫu tự phát hiện về lý do
- [ ] Cấp 2 chưa mở: mọi thứ liên quan Cấp 2 grayed / "sắp ra mắt"
- [ ] Bảng `cap1_progress` (có `da_xem_tour`), `order_kehoach`, `order_ketso` đúng schema (KHÔNG cột cắt lỗ/chốt lời, KHÔNG bảng nhật ký)
- [ ] Analytics đủ (§11)
- [ ] Màn tốt nghiệp Cấp 1 đúng khi 6/6, huy hiệu Cấp 2 (ngọc lam) mở khóa

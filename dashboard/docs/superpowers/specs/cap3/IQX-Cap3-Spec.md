# IQX Demo Trading — Cấp 3 «Bản lĩnh»
### Spec bàn giao đợt 4 · v1.0 · 07/2026

Kèm 3 mockup: `iqx-cap3-datlenh.html` (panel đặt lệnh) · `iqx-cap3-ketso.html` (Kết sổ) · `iqx-cap3-phantich-danhmuc.html` (Phân tích danh mục) · `iqx-cap3-hanhtrinh.html` (tab Hành trình). Đọc kèm `IQX-NguyenTac-Chung.md` (30 nguyên tắc chung).

---

## ⚠️ ĐỌC TRƯỚC — Nguyên tắc bàn giao (KHÔNG BỎ QUA)

Web IQX.vn đã production. Cấp 3 xây trên nền Cấp 0-2. Tài liệu này mô tả **PHẦN CHÊNH LỆCH (DELTA)** cần thêm cho Cấp 3 — KHÔNG dựng lại cái đã có.

Đọc kèm:
- `IQX-Cap0-Spec.md` — kiến trúc chung (hệ cấp mở, tab Hành trình, huy hiệu SVG, badge chế độ, bảng màu, hàm `badge()`)
- `IQX-Cap1-Spec.md` — Form Kế hoạch (5 lý do + vùng mua), AI Thanh tra, Kết sổ, Phân tích danh mục
- `IQX-Cap2-Spec.md` — cắt lỗ/chốt lời 2 cách, điểm kỷ luật, chuỗi lệnh kỷ luật, cảnh báo

**Cơ chế bán (áp dụng toàn hệ thống):** Hệ thống KHÔNG tự động bán. User luôn tự tay bấm bán.

**Nguyên tắc cộng dồn:** Panel đặt lệnh Cấp 3 = panel Cấp 2 GIỮ NGUYÊN + CHÈN THÊM (khẩu vị rủi ro + mức tự tin + khối lượng mua). Kết sổ và Phân tích danh mục cũng kế thừa + thêm khối. KHÔNG bỏ, KHÔNG code lại.

---

## 0. BẢNG TỔNG SCOPE — AI đọc bảng này trong 30 giây là biết code gì

| Nhóm | Nghĩa | Thành phần |
|---|---|---|
| 🟢 **THÊM MỚI** — code từ đầu | Chưa có trên web | · **Cài đặt Khẩu vị rủi ro** (trong hồ sơ, đặt 1 lần) — §5<br>· **Khối Quản lý vốn trong panel đặt lệnh** (Khẩu vị + Mức tự tin + Khối lượng mua 2 cách) — §6<br>· **Vốn ban đầu 100 triệu** cho tài khoản demo — §4<br>· **Khối Quản lý vốn trong Kết sổ** (đối chiếu tự tin/khẩu vị/khối lượng) — §7<br>· **2 khối mới trong Phân tích danh mục** (thắng/thua theo tự tin + khối lượng theo tự tin) — §8<br>· **Màn tốt nghiệp Cấp 3** — §3 |
| 🟡 **CẬP NHẬT theo cấp** | Có sẵn, chỉnh cho Cấp 3 | · **Ô Khối lượng** trong panel: Cấp 0-2 user tự gõ → Cấp 3 tự điền theo cách khối lượng đã chọn (vẫn sửa tay được)<br>· **Hiển thị điểm kỷ luật:** luôn kèm 1 câu giải thích + cho thấy điểm đến từ đâu (áp dụng cả Cấp 2) — §9 |
| 🔵 **GẮN THÊM EVENT** | Logic có sẵn, chỉ nghe sự kiện | · **Đặt lệnh mua** — cổng cứng: chặn nếu chưa chọn mức tự tin hoặc chưa chọn cách khối lượng<br>· **Bán lệnh** — mở Kết sổ Cấp 3<br>· **Đổi khẩu vị/tự tin** — tính lại khối lượng live |
| ⚪ **GIỮ NGUYÊN** | Không đụng | · Toàn bộ panel Cấp 2 (5 lý do + AI Thanh tra + vùng mua + cắt lỗ/chốt lời 2 cách)<br>· Điểm kỷ luật, chuỗi lệnh kỷ luật, cảnh báo (Cấp 2)<br>· Chart, bảng giá, các trang phân tích, 3 bản tin |

---

## 1. NGỮ CẢNH CẤP 3

**Bài học một câu:** *"Mua bao nhiêu quan trọng như mua gì."*

Cấp 0-2 dạy chọn mã (lý do), vào vùng nào, thoát ra sao (cắt lỗ/chốt lời) và kỷ luật thực hiện. Cấp 3 dạy **quản lý vốn**: mỗi lệnh nên bỏ bao nhiêu tiền — dựa trên khẩu vị rủi ro của bản thân và mức độ tự tin vào từng lệnh.

**Ba công cụ mới, gắn kết thành một hệ thống:**

| Công cụ | Là gì | Đặt khi nào |
|---|---|---|
| **Khẩu vị rủi ro** | % vốn tối đa cho 1 lệnh (mức trần) | 1 lần, trong hồ sơ, áp mọi lệnh |
| **Mức độ tự tin** | Bạn tin vào lệnh này cỡ nào (1-3 sao) | Mỗi lệnh, lúc đặt |
| **Khối lượng mua** | Số cổ phiếu nên mua, tính từ 2 cái trên | Tự động tính, chọn 1 trong 2 cách |

**Huy hiệu Cấp 3:** lục giác xanh brand `#4f8ff7`, fill=3. Badge chế độ vẫn `THỰC CHIẾN`.

**Cấp 3 KHÔNG có huy chương** (không cấp nào có). Chỉ Ghi nhận nhỏ (toast).

---

## 2. NHIỆM VỤ CẤP 3 — 3 nhiệm vụ

Cấp 3 đo **làm quen công cụ quản lý vốn** + **một thách thức bản lĩnh** (lãi có kỷ luật).

### ① Lệnh đầu tiên đủ khẩu vị + mức tự tin
- Điều kiện mở: vào Cấp 3
- Yêu cầu: đặt xong 1 lệnh có: đã đặt khẩu vị rủi ro (lần đầu) + chấm mức tự tin + chọn 1 cách khối lượng
- Copy (khi active): *"Cấp 3 thêm quản lý vốn: đặt khẩu vị rủi ro (áp mọi lệnh), chấm mức tự tin cho lệnh này, rồi chọn cách tính khối lượng. Thiếu tự tin hoặc cách khối lượng thì chưa đặt được lệnh."* · Nút "Làm ngay →"
- Hoàn thành: lệnh đầu khớp với đủ 3 thành phần

### ② Kết sổ lệnh đầu Cấp 3
- Điều kiện mở: xong ①, có ≥1 lệnh mở
- Yêu cầu: bán 1 lệnh → đóng màn Kết sổ Cấp 3 (§7)
- Hoàn thành: đóng màn Kết sổ

### ③ Thách thức Bản lĩnh — lãi có kỷ luật
- Điều kiện mở: vào Cấp 3
- Yêu cầu (đạt cả 3 cùng lúc):
  - **Lãi ≥ +5% trên vốn** (với vốn 100tr = +5 triệu, tính trên tổng lãi/lỗ đã chốt ở Cấp 3)
  - Qua **≥ 15 lệnh** Thực chiến ở Cấp 3
  - Giữ **điểm kỷ luật ≥ 80%** (trung bình giai đoạn Cấp 3)
- Vì sao khắt khe: đây là cấp "Bản lĩnh" — không chỉ lãi, mà lãi **có kỷ luật**. Lãi do đánh liều ăn may không tính, vì điểm kỷ luật sẽ thấp.
- Hiển thị (LUÔN kèm giải thích — xem §9):
  ```
  THÁCH THỨC BẢN LĨNH — để lên Cấp 4
  🔲 Lãi +5% trên vốn        — đang +3,2%
  🔲 Đủ 15 lệnh              — đang 11/15
  🔲 Điểm kỷ luật ≥80%       — đang 76%
  Điểm kỷ luật đo bạn có làm đúng cam kết không: cắt lỗ khi
  giá chạm, không gồng lỗ, không nhồi lệnh, không tham chốt lời hụt.
  ```

**Lưu ý logic:** ① ② tự hoàn thành trong quá trình làm ③. Ràng buộc thực chất là ③ — mục tiêu kép lãi + số lượng + kỷ luật.

**Nếu thị trường xấu:** user kỷ luật tốt nhưng chưa đạt +5% → vẫn kẹt, nhưng đây là "chưa đủ cơ hội" chứ không phải bị phạt. Trong lúc chờ, kỹ năng vẫn tích lũy. KHÔNG hạ chuẩn lãi để ép qua.

---

## 3. TỐT NGHIỆP CẤP 3

Điều kiện: **3/3 nhiệm vụ** (thực chất là hoàn thành ③).

Màn tốt nghiệp — 3 khối:

**Header:** Tag `HOÀN THÀNH` · Tên `CẤP 3 · BẢN LĨNH` · Dòng phụ `Lãi +X% · 15+ lệnh · kỷ luật XX%` · Huy hiệu Cấp 3 cỡ 120px phát sáng.

**Khối 1 — Ghi nhận:**
*"Bạn đã đạt +5% với kỷ luật vững — và quan trọng hơn con số: bạn biết **mua bao nhiêu cho mỗi lệnh**. Tự tin cao thì mua nhiều, tự tin thấp thì phòng thủ. Bạn không còn mua theo cảm hứng hay tất tay một mã."*

**Khối 2 — Định vị:**
*"Nhưng có một câu hỏi bạn chưa trả lời được: lệnh thắng của bạn là do **phán đoán đúng** hay do **may mắn**? Cấp 4 dạy điều khó nhất: tách quyết định khỏi kết quả. Một quyết định tốt vẫn có thể thua, một quyết định ẩu vẫn có thể thắng — và biết phân biệt hai điều đó mới là bản lĩnh thật."*

**Khối 3 — Chuyển cấp** (viền tím `#a78bfa`):
*"**Từ giờ: Cấp 4 «Thuần thục».** Bạn sẽ học nhìn lại mỗi lệnh qua 4 ô: quyết định đúng-thắng, đúng-thua, sai-thắng, sai-thua — và hiểu vũ khí lẫn điểm mù của chính mình."*

**Nút:** `Vào Cấp 4 «Thuần thục» →` (full width, tím). Sau khi bấm: huy hiệu góc đổi sang Cấp 4, route sang flow Cấp 4.

---

## 4. VỐN BAN ĐẦU DEMO — 100 TRIỆU

- Tài khoản demo khởi tạo **100.000.000đ**.
- Lý do chọn 100tr: sát thực tế nhà đầu tư mới Việt Nam (phần lớn bắt đầu 20-100tr), giữ cảm giác trân trọng từng lệnh (chống tâm lý "tiền ảo tiêu thoải mái"), vẫn đủ để chia mã và học quản lý vốn.
- Con số này áp dụng cho tài khoản demo từ đầu (Cấp 0), nhưng đến Cấp 3 mới thực sự có ý nghĩa vì đây là lúc học quản lý vốn.
- **Không cho nạp thêm / reset vốn** — nếu cháy tài khoản demo, đó cũng là bài học (nhưng với 100tr và kỷ luật đã rèn ở Cấp 0-2, khó cháy).

---

## 5. CÀI ĐẶT KHẨU VỊ RỦI RO (🟢 THÊM MỚI)

### 5.1 Khẩu vị rủi ro là gì

**Khẩu vị rủi ro = % vốn tối đa cho 1 lệnh (mức trần).** Đặt 1 lần, áp cho mọi lệnh. Đây là "phong cách đầu tư" của user, nên ổn định — không đổi mỗi lệnh.

| Khẩu vị | % vốn tối đa/lệnh | Số mã nắm được | Triết lý |
|---|---|---|---|
| **Thận trọng** | 10% | ~8-10 mã | Chia mỏng, an toàn |
| **Cân bằng** | 20% | ~5 mã | Vừa phải (mặc định) |
| **Tấn công** | 30% | ~3 mã | Đậm đặc, cược mạnh |

**Logic con số:** % vốn/lệnh quyết định số mã nắm được (đa dạng hóa) và thiệt hại tối đa khi 1 mã giảm sàn. Người thận trọng muốn nhiều mã (mỗi mã ít), người tấn công chấp nhận ít mã (mỗi mã nhiều).

**Tooltip giải thích cho user:** *"Khẩu vị rủi ro là mức tiền tối đa bạn bỏ vào 1 mã. Thận trọng (10%) = chia vốn cho ~10 mã, an toàn. Tấn công (30%) = dồn vào ~3 mã, ăn đậm nhưng rủi ro cao. Đây là phong cách chung, áp cho mọi lệnh."*

### 5.2 Đặt ở đâu

- **Lần đầu:** khi vào Cấp 3, hiện màn chọn khẩu vị (bắt buộc chọn 1 để làm nhiệm vụ ①).
- **Sau đó:** đổi trong trang hồ sơ / cài đặt, và có thể xem + đổi nhanh ngay trong panel đặt lệnh (§6).
- Mặc định gợi ý: **Cân bằng (20%)**.
- Đổi khẩu vị = đổi cho toàn tài khoản (mọi lệnh sau), không riêng lệnh nào.

### 5.3 Khẩu vị KHÔNG điều chỉnh cắt lỗ/chốt lời ở Cấp 3

Cắt lỗ/chốt lời giữ nguyên 2 cách của Cấp 2 (Hỗ trợ/Kháng cự · Biên độ dao động, hệ số 2×/4×). Khẩu vị Cấp 3 **chỉ dùng cho khối lượng mua**, không đụng cắt lỗ/chốt lời. (Giữ Cấp 3 gọn; nếu sau này muốn khẩu vị chi phối cả cắt lỗ/chốt lời thì để cấp cao hơn.)

---

## 6. KHỐI QUẢN LÝ VỐN TRONG PANEL ĐẶT LỆNH (🟢 THÊM MỚI)

**⚠️ Panel Cấp 3 = panel Cấp 2 GIỮ NGUYÊN + CHÈN THÊM khối này.** Vị trí: ngay dưới Loại lệnh / Giá / Khối lượng, trước dòng Phí. Xem `iqx-cap3-datlenh.html`.

Khối "Quản lý vốn" (viền xanh brand) gồm 3 phần trên xuống:

### 6.1 Khẩu vị rủi ro — 3 nút
- Thận trọng (trần 10%) · Cân bằng (trần 20%) · Tấn công (trần 30%)
- Ghi chú nhỏ: "áp cho mọi lệnh"
- Đây là hiển thị + đổi nhanh của cài đặt §5 (đổi ở đây = đổi cho hồ sơ)

### 6.2 Mức độ tự tin — 3 nút (chọn từng lệnh)
- ⭐ Thấp · ⭐⭐ Vừa · ⭐⭐⭐ Cao
- User **tự chấm** — không có AI gợi ý (để mức tự tin phản ánh niềm tin thật, không bị dẫn dắt; dữ liệu này dùng phân tích ở §8 và cấp sau)
- Hệ số dùng cho Cách 1 khối lượng: Thấp 50% · Vừa 75% · Cao 100% (của mức trần khẩu vị)

### 6.3 Khối lượng mua — 2 cách chọn 1 (mô hình giống cắt lỗ/chốt lời Cấp 2)

Hiện sẵn 2 thẻ, chọn 1. Mỗi thẻ tính sẵn số cổ phiếu.

**Cách 1 — Theo khẩu vị × tự tin (linh hoạt):**
```
Khối lượng = (% trần khẩu vị) × (hệ số tự tin) × vốn ÷ giá
```
Triết lý: tin nhiều mua nhiều, tin ít mua ít. Dùng cả 2 biến.

**Cách 2 — Chia đều theo khẩu vị (kỷ luật):**
```
Khối lượng = (% trần khẩu vị) × vốn ÷ giá
```
Triết lý: luôn mua đúng mức trần, không để cảm xúc tự tin chi phối. Chỉ dùng khẩu vị.

**Ví dụ (vốn 100tr, VNM 62.400, khẩu vị Cân bằng trần 20%):**

| Tự tin | Cách 1 (khẩu vị × tự tin) | Cách 2 (chia đều) |
|---|---|---|
| ⭐ Thấp | 20%×50% = 10% → 10tr → ~200 cp | 20% → 20tr → ~300 cp |
| ⭐⭐ Vừa | 20%×75% = 15% → 15tr → ~200 cp | 20% → 20tr → ~300 cp |
| ⭐⭐⭐ Cao | 20%×100% = 20% → 20tr → ~300 cp | 20% → 20tr → ~300 cp |

(Làm tròn 100 cp. Con số cụ thể tùy giá mã.)

**Điểm quan trọng — mức tự tin LUÔN được ghi lại dù chọn cách nào.** Cách 2 không dùng tự tin để tính khối lượng, nhưng user vẫn chấm mức tự tin (mục 6.2 là bắt buộc). Lý do: cấp sau (tách quyết định/kết quả) cần dữ liệu tự tin để phân tích.

### 6.4 Hành vi
- Ô "Khối lượng" ở đầu panel tự điền theo cách đã chọn (user vẫn sửa tay được).
- Đổi khẩu vị hoặc tự tin → 2 thẻ tính lại số live.
- **Cổng cứng:** chưa chấm mức tự tin HOẶC chưa chọn cách khối lượng → nút ĐẶT LỆNH MUA khóa.
- Ghi hồ sơ: `khau_vi` · `muc_tu_tin` · `cach_khoi_luong` · `khoi_luong` · `pct_von`.

---

## 7. MÀN KẾT SỔ CẤP 3 (🟡 kế thừa Cấp 2 + thêm khối Quản lý vốn)

**Kết sổ Cấp 3 = Kết sổ Cấp 2 GIỮ NGUYÊN + THÊM khối Quản lý vốn.** Xem `iqx-cap3-ketso.html`.

Kế thừa từ Cấp 2: header lãi/lỗ, đối chiếu lý do/vùng mua/cắt lỗ/chốt lời, hỏi cảm xúc (lệnh "có chuyện"), coach.

**THÊM khối "Quản lý vốn"** (đối chiếu, gắn nhãn "mới ở Cấp 3"):
- Khẩu vị rủi ro lúc đặt
- **Mức tự tin đã chấm** (dòng làm nổi)
- Cách tính khối lượng đã chọn
- Khối lượng + % vốn thực tế

**THÊM coach "tự tin vs kết quả":** đối chiếu mức tự tin với kết quả lệnh. Ví dụ template:
- Tự tin cao + thắng: *"Tự tin ⭐⭐⭐ Cao và thắng — phán đoán của bạn có cơ sở, khối lượng lớn nên lãi cũng lớn."*
- Tự tin cao + thua: *"Tự tin ⭐⭐⭐ Cao nhưng thua. Chưa vội kết luận — một quyết định tốt vẫn có thể thua vì thị trường. Cấp 4 sẽ dạy tách quyết định khỏi kết quả."*
- Tự tin thấp + thắng: *"Tự tin ⭐ Thấp mà thắng — bạn phòng thủ đúng (mua ít), nhưng lãi nhỏ vì khối lượng nhỏ. Nếu tin hơn đã lãi nhiều hơn."*
- Tự tin thấp + thua: *"Tự tin ⭐ Thấp và thua — mua ít nên thiệt hại nhỏ. Phòng thủ đã cứu bạn."*

**Nút cuối:** `Đóng kết sổ ✓`

---

## 8. TRANG PHÂN TÍCH DANH MỤC CẤP 3 (🟡 kế thừa + 🟢 thêm 2 khối)

**Phân tích danh mục Cấp 3 = các khối Cấp 1-2 GIỮ NGUYÊN + THÊM 2 khối về mức tự tin.** Xem `iqx-cap3-phantich-danhmuc.html`. (Các khối Cấp 1-2 có thể thu gọn thành danh sách bấm-để-mở cho đỡ dài.)

Khối ① Hồ sơ tổng quan: thêm hiển thị khẩu vị rủi ro đang dùng.

**THÊM khối ⑦ — Thắng/thua theo mức tự tin:**
Bảng 3 hàng (⭐⭐⭐ Cao / ⭐⭐ Vừa / ⭐ Thấp): số lệnh · tỷ lệ thắng · lãi/lỗ trung bình. Mẫu tự phát hiện:
- Nếu lệnh tự tin cao thắng nhiều hơn hẳn tự tin thấp → *"Tự tin của bạn đáng tin — lệnh ⭐⭐⭐ Cao thắng {X}%, cao hơn hẳn ⭐ Thấp ({Y}%). Trực giác đã qua rèn luyện của bạn có cơ sở."*
- Nếu ngược lại (tự tin cao thua nhiều) → *"Cẩn thận — lệnh bạn tự tin cao lại thắng ít hơn. Có thể bạn đang quá tự tin ở những mã không nên. Xem lại lý do các lệnh ⭐⭐⭐ Cao."*

**THÊM khối ⑧ — Khối lượng có đi theo tự tin không:**
Bảng 3 hàng: khối lượng trung bình · % vốn trung bình theo từng mức tự tin. Kiểm tra user có thực sự mua nhiều hơn khi tự tin cao. Mẫu:
- Nếu có tăng dần → *"Bạn đang quản lý vốn đúng hướng — tự tin càng cao, khối lượng càng lớn. Bạn thưởng cho lệnh chắc chắn, phòng thủ ở lệnh mơ hồ."*
- Nếu không rõ ràng → *"Khối lượng của bạn chưa đi theo tự tin. Cân nhắc dùng Cách 1 (khẩu vị × tự tin) để khối lượng phản ánh niềm tin."*

---

## 9. HIỂN THỊ ĐIỂM KỶ LUẬT RÕ RÀNG (🟡 CẬP NHẬT — áp dụng cả Cấp 2)

Điểm kỷ luật (công cụ Cấp 2) được dùng làm điều kiện lên Cấp 4, nên phải dễ hiểu. **Áp dụng cả Cấp 2 lẫn Cấp 3.**

**Quy tắc 1 — Luôn kèm 1 câu giải thích mỗi khi hiện "điểm kỷ luật":**
> *"Điểm kỷ luật đo bạn có làm đúng cam kết không: cắt lỗ khi giá chạm, không gồng lỗ, không nhồi lệnh, không tham chốt lời hụt. Làm đúng thì điểm cao."*

**Quy tắc 2 — Luôn cho thấy điểm đến từ đâu (không hiện con số trơ):**
```
Điểm kỷ luật tuần này: 76%
• Cắt lỗ đúng phiên: 4/4 lần ✅
• Không nhồi lệnh: ✅
• Có 1 lần chốt lời hụt (tham thêm rồi giá tụt) ⚠️ −10 điểm
```
User nhìn là hiểu ngay mất điểm ở đâu, không cần học khái niệm.

---

## 10. DỮ LIỆU CẦN GHI (🟢 THÊM MỚI)

**Bảng `cap3_progress`:**
```
user_id · entered_at
khau_vi_da_dat (bool) · khau_vi ('than_trong'/'can_bang'/'tan_cong')
task_1_done_at · task_2_done_at · task_3_done_at
so_lenh_cap3 · lai_pct_cap3 · diem_ky_luat_tb_cap3
graduated_at · time_to_graduate_hours
```

**Cài đặt hồ sơ — thêm cột:**
```
users.khau_vi_rui_ro ('than_trong'=10 / 'can_bang'=20 / 'tan_cong'=30)
users.von_ban_dau = 100000000
```

**Bảng `order_kehoach` — thêm cột (nối tiếp Cấp 1-2):**
```
khau_vi          -- khẩu vị lúc đặt lệnh
muc_tu_tin       -- 1/2/3 (Thấp/Vừa/Cao) — LUÔN ghi dù chọn cách nào
cach_khoi_luong  -- 'khau_vi_tu_tin' | 'chia_deu'
khoi_luong · pct_von
```

**Analytics:**
```
cap3_khau_vi_set(loai) · cap3_khau_vi_change(loai)
cap3_tu_tin_chon(muc) · cap3_khoi_luong_cach(cach)
cap3_task_complete(task_id)
cap3_ketso_view · cap3_phantich_danhmuc_view
cap3_graduate
```

---

## 11. NGOÀI PHẠM VI CẤP 3 (chống scope-creep)

Cấp 3 **KHÔNG có** — dev không tự thêm:
- **Tách quyết định khỏi kết quả** (4 ô đúng-thắng/đúng-thua/sai-thắng/sai-thua) — Cấp 4
- **Khẩu vị điều chỉnh cắt lỗ/chốt lời** — không ở Cấp 3 (cắt lỗ/chốt lời giữ nguyên Cấp 2)
- **AI gợi ý mức tự tin** — không (user tự chấm)
- **Nạp thêm vốn / reset** — KHÔNG BAO GIỜ
- **Huy chương / Tủ huân chương** — không cấp nào có
- **Đọc sổ lệnh phán đoán lực/lệnh giả** — Cấp 4-5
- Leaderboard, social, copy trade — không có ở mọi cấp

---

## 12. CHECKLIST BÀN GIAO CHO DEV (kiểm trước merge)

- [ ] Vốn demo khởi tạo 100 triệu
- [ ] Màn đặt khẩu vị lần đầu khi vào Cấp 3 (bắt buộc chọn 1)
- [ ] Cài đặt khẩu vị trong hồ sơ, đổi được, áp mọi lệnh
- [ ] Panel Cấp 3 = panel Cấp 2 giữ nguyên + chèn khối Quản lý vốn (khẩu vị + tự tin + khối lượng) ngay dưới Loại lệnh/Giá/KL
- [ ] Khẩu vị 3 mức (10/20/30%) · tự tin 3 mức (50/75/100%) · khối lượng 2 cách chọn 1
- [ ] Cách 1 = khẩu vị × tự tin · Cách 2 = chia đều theo khẩu vị; tính đúng, làm tròn 100 cp
- [ ] Mức tự tin LUÔN ghi lại dù chọn cách khối lượng nào
- [ ] Ô Khối lượng tự điền theo cách đã chọn, vẫn sửa tay được
- [ ] Cổng cứng: chưa chấm tự tin hoặc chưa chọn cách khối lượng = khóa nút MUA
- [ ] Cắt lỗ/chốt lời GIỮ NGUYÊN Cấp 2 (khẩu vị không đụng vào)
- [ ] Kết sổ Cấp 3: kế thừa Cấp 2 + khối Quản lý vốn + coach tự tin vs kết quả
- [ ] Phân tích danh mục: kế thừa Cấp 1-2 + khối ⑦ (thắng/thua theo tự tin) + khối ⑧ (khối lượng theo tự tin)
- [ ] Nhiệm vụ ③: lãi +5% + đủ 15 lệnh + điểm kỷ luật ≥80% (đạt cả 3 mới tốt nghiệp)
- [ ] Điểm kỷ luật hiển thị kèm giải thích + cho thấy điểm đến từ đâu (cả Cấp 2 lẫn Cấp 3)
- [ ] KHÔNG có huy chương; KHÔNG tách quyết định/kết quả (để Cấp 4)
- [ ] Bảng `cap3_progress` + cột hồ sơ (khẩu vị, vốn) + cột mới `order_kehoach` + analytics đủ
- [ ] Màn tốt nghiệp Cấp 3 đúng khi 3/3, huy hiệu Cấp 4 (tím) mở khóa

# IQX Demo Trading — Cấp 0 «Nhập môn»
### Spec bàn giao đợt 1 · v2.2 · 07/2026

Kèm 2 mockup: `iqx-cap0-pc.html` (bản PC) · `iqx-cap0-mobile.html` (bản mobile).

---

## ⚠️ ĐỌC TRƯỚC — Nguyên tắc bàn giao (KHÔNG BỎ QUA)

Web IQX.vn **đã tồn tại và đang chạy production**. Tài liệu này mô tả **PHẦN CHÊNH LỆCH (DELTA)** cần THÊM / ẨN / SỬA để có Cấp 0 — KHÔNG phải mô tả để dựng lại web từ đầu.

Hai mockup HTML kèm theo **mô phỏng giao diện IQX hiện có chỉ để minh họa vị trí các thành phần mới**. AI code **chỉ triển khai những phần được đánh dấu "THÊM MỚI" hoặc "ẨN THEO CẤP"** trong tài liệu này. Mọi thành phần khác của web (chart TradingView, panel đặt lệnh, bảng giá, danh mục Nắm giữ/Theo dõi/Lịch sử, header, dữ liệu VPS realtime, v.v.) — **giữ nguyên, KHÔNG đụng, KHÔNG "sáng tạo lại"**.

**Phạm vi đợt bàn giao này:** kiến trúc + Chặng 1 + Chặng 3 + tốt nghiệp + huy hiệu.
**KHÔNG bao gồm 3 tour sản phẩm (Chặng 2)** — spec riêng cho từng tour sẽ bàn giao sau khi có mô tả nội dung sản phẩm thật. Đợt này chỉ tạo 3 slot locked trong checklist tab Hành trình + chuẩn bị cơ chế spotlight chung (§11).

---

## 0. BẢNG TỔNG SCOPE — AI đọc bảng này trong 30 giây là biết code gì

Chia mọi thứ Cấp 0 thành 4 nhóm rõ ràng:

| Nhóm | Nghĩa | Thành phần |
|---|---|---|
| 🟢 **THÊM MỚI** — code từ đầu | Chưa có trên web, cần dựng | · Câu hỏi xếp lớp lần đầu (§3)<br>· Badge chế độ `SÂN TẬP · T+0` / `THỰC CHIẾN` góc màn hình (§2)<br>· **Tab 🎯 Hành trình** ở sidebar phải (PC) + bottom nav (mobile) (§7)<br>· **Journey bar** sticky trên đầu (§7)<br>· **Khối "Kế hoạch"** trong panel đặt lệnh: chip lý do + preset SL/TP + ghi chú (§4 nhiệm vụ ①)<br>· **Thanh nhắc `.gbar`** (§6)<br>· **Màn Kết sổ Cấp 0** (§5)<br>· **Màn tốt nghiệp Cấp 0** 3 khối (§9)<br>· Huy hiệu SVG — hàm `badge()` (§12) render ở 2 vị trí: thẻ cấp trong tab Hành trình + header pill cạnh tên user |
| 🟡 **ẨN THEO CẤP** — có sẵn, chỉ ẩn có điều kiện | Bọc điều kiện hiển thị, KHÔNG xoá code | · Sổ lệnh bid/ask trong panel đặt lệnh<br>· Ô Giá + dropdown loại lệnh (MP/LO/…)<br>· Tab "Tin tức" (sidebar phải)<br>· Tab "AI Mẫu nến" (sidebar phải)<br>Chi tiết điều kiện mở lại: §8 |
| 🔵 **GẮN THÊM EVENT** — logic có sẵn, chỉ nghe sự kiện | Không sửa logic, chỉ addEventListener để đếm tiến trình / cập nhật gbar | · **Đặt lệnh mua** — web đã có sẵn nút và luồng khớp lệnh, chỉ gắn listener để biết user đã mua → cập nhật gbar bước 2/3 → 3/3, unlock task tiếp<br>· **Bấm ★ gắn Theo dõi** — web đã có sẵn ngôi sao và logic thêm vào Theo dõi, chỉ gắn listener để đánh dấu hoàn thành nhiệm vụ ①<br>· **Bán lệnh** — web đã có sẵn nút Bán, chỉ gắn listener để mở màn Kết sổ (§5)<br>· **Gõ ô cắt lỗ** (nhiệm vụ ⑤) — gắn listener `keydown` để đạt cổng chất lượng 1 (§4 Chặng 3) |
| ⚪ **GIỮ NGUYÊN** — không đụng | Đọc-để-tham-chiếu, không sửa | · Chart TradingView + toolbar vẽ<br>· Panel đặt lệnh (khung + số dư + Trần/Sàn/TC + nút MUA/BÁN + phí)<br>· Bảng giá `/bang-gia` (4 card index, cột Trần/Sàn/TC, 3 bước mua/bán, tab ★ Danh mục)<br>· Trang cổ phiếu — 6 lớp dữ liệu + tab Tổng quan/Tài chính<br>· Trang chủ — 3 bản tin thị trường 07:15/11:30/16:30<br>· Panel Danh mục 3 tab Theo dõi/Nắm giữ/Lịch sử + 4 ô sức khỏe + nút "Phân tích danh mục"<br>· Ngôi sao ★ ở mọi vị trí có tên mã<br>· Header (logo, tìm mã, avatar), sidebar phải "AI Phân tích", toolbar vẽ |

**Nguyên tắc rà nhanh khi code:** với mọi tính năng bạn định code, tự hỏi "cái này thuộc nhóm nào ở §0?". Nếu không thuộc 🟢 hay 🟡 hay 🔵 → **KHÔNG code**, giữ nguyên web.

---

## 1. HỆ 6 CẤP ĐỘ (ngữ cảnh chung)

| Cấp | Tên hiển thị | Bài học |
|---|---|---|
| **0** | **Nhập môn** | Hiểu sân chơi, đi trọn vòng đời một lệnh |
| 1 | Học việc | Không vào lệnh khi chưa có kế hoạch |
| 2 | Kỷ luật | Kế hoạch chỉ có giá trị khi được thực hiện |
| 3 | Bản lĩnh | Kết quả tốt ≠ quyết định tốt |
| 4 | Thuần thục | Biết vũ khí riêng và điểm mù riêng |
| 5 | Lão luyện | Đứng ngoài cũng là một quyết định |

Quy ước: hiển thị bằng TÊN (không "Level N") · không tụt cấp · lên cấp bằng hành vi (cửa sổ trượt các lệnh Thực chiến gần nhất) · người có kinh nghiệm làm bài xếp lớp vào thẳng tối đa Cấp 2.

## 2. HAI CHẾ ĐỘ GIAO DỊCH (THÊM MỚI · logic chung)

- **Sân tập (T+0):** mua bán trong ngày, dùng cho Cấp 0. Badge góc màn hình `SÂN TẬP · T+0` màu vàng.
- **Thực chiến (T+2,5):** luật thật 100% — T+2,5, biên độ, phí, thuế. Từ Cấp 1 trở đi. Badge `THỰC CHIẾN` màu xanh brand. **Chỉ lệnh Thực chiến tính vào hồ sơ tiến trình cấp.**

Cấp 0 chạy hoàn toàn ở Sân tập. Chuyển sang Thực chiến ở màn tốt nghiệp.

**Cần code:** cột `mode` trong bảng lệnh (`san_tap` / `thuc_chien`), component badge góc màn hình, hàm điều kiện `isCountedForProgress(order)`.

## 3. CỬA VÀO — CÂU HỎI XẾP LỚP (THÊM MỚI)

Lần đầu user mở Demo Trading, hiện 1 modal chặn:

**Tiêu đề:** "Chào mừng đến Demo Trading của IQX."
**Câu hỏi:** "Bạn đã từng mua cổ phiếu chưa?"
**Hai nút:**
- `Chưa từng` · nhãn phụ nhỏ: *"Bắt đầu từ Cấp 0 «Nhập môn»"*
- `Đã từng` · nhãn phụ nhỏ: *"Làm bài xếp lớp 5 phút"*

Xử lý: **Chưa từng** → vào Cấp 0 (spec này). **Đã từng** → bài xếp lớp (spec riêng ở bàn giao khác) → vào thẳng Cấp 1 hoặc 2. Không làm checklist Cấp 0.

**Cần code:** bảng `user_placement` (câu trả lời + cấp được xếp), route sau xếp lớp, đảm bảo modal chỉ hiện lần đầu.

## 4. NHIỆM VỤ CẤP 0 — 3 CHẶNG · 6 NHIỆM VỤ

Không khóa theo ngày. Thứ tự tự do trừ phụ thuộc tự nhiên.

### Chặng 1 — VÀO SÂN

#### ① Lệnh đầu tiên + Nắm giữ + Theo dõi

- Điều kiện mở: mặc định (nhiệm vụ đầu tiên)
- User tự thao tác trên panel đặt lệnh (**KHÔNG spotlight** — dùng thanh nhắc bền vững §6)

**Ba bước cần user làm — phân rõ web có sẵn cái gì, dev thêm cái gì:**

| Bước | Web đã có sẵn (không sửa) | Dev cần thêm |
|---|---|---|
| **1. Chọn 1 chip lý do trong khối "Kế hoạch"** | (chưa có khối này) | 🟢 THÊM MỚI khối "Kế hoạch" trong panel đặt lệnh (chip lý do + preset SL/TP điền sẵn −5%/+10% + ghi chú) — chi tiết layout xem mockup, copy nguyên văn ở dưới |
| **2. Bấm ĐẶT LỆNH MUA → 100 CP VNM khớp → vào Nắm giữ** | ✅ Nút MUA, luồng khớp lệnh, cập nhật Nắm giữ đều đã chạy production | 🔵 Chỉ **gắn event listener** vào sự kiện "lệnh khớp thành công" để: (a) đánh dấu bước 2/3 hoàn thành, (b) cập nhật thanh gbar sang bước 3/3, (c) chặn nếu chưa chọn chip lý do → hiển thị gbar warn |
| **3. Bấm ★ cạnh tên VNM để gắn vào Theo dõi** | ✅ Ngôi sao ★ và logic gắn vào Theo dõi đã chạy production | 🔵 Chỉ **gắn event listener** vào click ★ để đánh dấu hoàn thành nhiệm vụ ① và auto quay về tab Hành trình |

- Điều kiện setup mã VNM: cần **preselect mã VNM** ở panel đặt lệnh khi user vào Cấp 0 lần đầu (nếu web chưa có cơ chế deep-link mã cụ thể → thêm URL param hoặc trạng thái mặc định)
- Cắt lỗ/chốt lời của lệnh đầu **điền sẵn ở khối Kế hoạch mới, KHÔNG ghi vào backend đặt lệnh của web hiện tại** — vì Cấp 0 lệnh đơn giản, backend hiện tại chưa hỗ trợ SL/TP thì cũng không sao; giá trị SL/TP chỉ để hiển thị + về sau đối chiếu ở màn Kết sổ
- Hoàn thành: lệnh khớp (event từ web) + ★ đã bấm (event từ web)

**Copy tab Hành trình:**
- Tên: **"Lệnh đầu tiên + Nắm giữ + Theo dõi"**
- Mô tả (khi active): *"Mua công ty bạn biết · chọn lý do trong Kế hoạch · xem tiền nằm đâu · gắn sao ★. Làm thiếu bước nào, hệ thống sẽ nhắc."*
- Nút: **"Làm ngay →"** (bấm → điều hướng đến panel đặt lệnh của web + kích hoạt gbar)

**Copy khối "Kế hoạch" MỚI trong phiếu lệnh (🟢 THÊM MỚI):**
- Nhãn khối: `KẾ HOẠCH` (mono nhỏ letter-spacing, màu brand)
- Câu hỏi: **"Vì sao bạn chọn VNM?"**
- 5 chip lý do (thứ tự cố định, không có "đáp án đúng"):
  1. Công ty tôi biết
  2. Người quen giới thiệu
  3. Thấy trên mạng
  4. Giá đang tăng
  5. Thử cho biết
- Preset SL/TP (với VNM giá 62.400): `Cắt lỗ (đề xuất): 59.300 · −5%` và `Chốt lời (đề xuất): 68.600 · +10%`
- Ghi chú dưới presets: *"Cắt lỗ: nếu giá giảm tới đây, bán để bảo toàn vốn. Lệnh đầu hệ thống đề xuất sẵn — chỉ cần đồng ý."*
- Vị trí trong panel: chèn giữa dòng phí GD và nút ĐẶT LỆNH MUA

**Copy toast xác nhận (dùng hệ thống toast có sẵn nếu web đã có, hoặc thêm mới component đơn giản):**
- Sau khớp lệnh: **"✓ Khớp lệnh MUA 100 VNM @ 61.800"**
- Sau gắn sao: **"★ Đã thêm VNM vào danh mục Theo dõi"**
- Sau hoàn thành nhiệm vụ (auto quay về tab Hành trình): **"🎉 Nhiệm vụ 1 hoàn thành! Nắm giữ = tiền đang nằm · Theo dõi = mắt đang canh"**

### Chặng 2 — HIỂU SÂN CHƠI · TOUR SẢN PHẨM IQX

**② Tour bảng điện** · **③ Tour bản tin thị trường** · **④ Tour "6 người chơi"**

**⚠️ KHÔNG bàn giao ở đợt này.** Chờ founder cung cấp mô tả nội dung sản phẩm thật.

Đợt này chỉ cần:
- Tạo 3 slot nhiệm vụ ②③④ trong checklist tab Hành trình, trạng thái `locked` cho đến khi bàn giao spec riêng
- Chuẩn bị cơ chế spotlight chung theo chuẩn §11 để tái sử dụng khi bàn giao

### Chặng 3 — KHÉP VÒNG

#### ⑤ Lệnh thứ hai — tự đặt ngưỡng cắt lỗ

- Điều kiện mở: xong ①
- Panel đặt lệnh lúc này **mở thêm ô Giá + dropdown loại lệnh** (LO/MP)
- Khối "Kế hoạch" KHÔNG điền sẵn cắt lỗ/chốt lời — user tự gõ
- **Cổng chất lượng 1:** event `keydown` vào ô cắt lỗ mới tính đạt (nếu user chỉ click nút auto −5%/−7% mà không gõ số → chưa đạt)
- Tooltip tại chỗ (dạy LO vs MP, dạy cắt lỗ là quyết định của mình):
  - **Trên ô cắt lỗ** (khi form mở, không điền sẵn):
    *"Lần này bạn tự quyết: nếu sai, bạn chấp nhận dừng ở giá nào? Gõ con số của bạn — nó là lời hứa với chính mình, không phải ô phải điền cho qua."*
  - **Trên ô Giá** (mới xuất hiện, lần đầu):
    *"Bạn vừa mở khóa ô Giá. Nãy giờ bạn dùng lệnh THỊ TRƯỜNG (MP) — mua ngay ở giá bên bán. Nhập giá cụ thể vào ô này là lệnh GIỚI HẠN (LO): 'tôi chỉ mua nếu giá về mức X' — máy chờ giúp bạn. Chủ động hơn, nhưng có thể không khớp."*

**Thanh gbar cho nhiệm vụ ⑤:**
- Khi chưa gõ ngưỡng: `Bước 1/2 — Tự gõ ngưỡng cắt lỗ vào ô (nhập bằng bàn phím, đây là lời hứa của bạn)`
- Khi đã gõ, chưa đặt lệnh: `Bước 2/2 — Bấm ĐẶT LỆNH MUA để hoàn tất lệnh thứ hai`

#### ⑥ Bán một lệnh — Kết sổ đầu tiên

- Điều kiện mở: có ≥1 lệnh đang mở
- **Web đã có sẵn:** nút "Bán" ở panel Danh mục · tab Nắm giữ, luồng khớp lệnh bán, cập nhật Nắm giữ. **KHÔNG sửa các thứ này.**
- 🔵 **Dev chỉ gắn event listener:** khi lệnh bán khớp thành công (event từ web), mở **màn Kết sổ Cấp 0** (bản rút gọn — spec chi tiết §5)
- **Cổng chất lượng 2:** user đóng màn kết sổ (bấm nút "Đóng kết sổ ✓") mới tính đạt

## 5. MÀN KẾT SỔ CẤP 0 (spec chi tiết cho nhiệm vụ ⑥)

**Header:**
- Tag mono: `KẾT SỔ LỆNH · #{n} · SÂN TẬP`
- P&L cỡ rất lớn (Space Grotesk 42px, count-up nhẹ ~1s): `+X,X%` xanh (lãi) / `−X,X%` đỏ (lỗ)
- Dòng phụ mono: `+{VND} ₫ · MUA {số} {mã} → BÁN`

**Bảng đối chiếu Kế hoạch / Thực tế:**

| | Kế hoạch | Thực tế |
|---|---|---|
| Giá vào | (số) | (số) |
| Cắt lỗ | (số + %) | "không chạm" hoặc "chạm ở phiên X" |
| Chốt lời | (số + %) | "chưa tới — bán tay" hoặc "chạm mục tiêu ✓" |
| Giá ra · thuế bán 0,1% | — | (giá) · (số thuế đỏ) |

**Khối coach — 1 đoạn (rule-based, chọn 1 trong 4 template theo tình huống):**

Tag khối: `NHÌN LẠI` (mono, letter-spacing, màu brand). Viền trái brand, nền brand-soft.

- **A. Lệnh lãi, không chạm SL, không chạm TP (bán tay khi đang lãi):**
*"Lệnh {số} khép trọn vòng đời: vào có kế hoạch — theo dõi — thoát — và giờ là nhìn lại. Lệnh lãi nhẹ. Điều đáng giá hơn: **bạn đã đi đủ quy trình mà phần lớn người mua cổ phiếu bỏ qua.** Chú ý dòng thuế bán 0,1% — bán luôn tốn thêm một khoản, mua bán liên tục là phí + thuế ăn dần tài khoản."*

- **B. Lệnh lãi, chạm TP:**
*"Kế hoạch chốt lời chạm đúng mục tiêu — đây là dạng lệnh sạch nhất: bạn đặt ra một đích, thị trường trả đúng đích đó. **Không phải lúc nào cũng vậy, nhưng khi vậy, hãy ghi lại như một mẫu chuẩn để nhớ.** Chú ý dòng thuế bán 0,1%."*

- **C. Lệnh lỗ, chạm SL:**
*"Cắt lỗ đúng kế hoạch — **đây không phải thất bại, đây là kỷ luật.** Người mới hay giữ lệnh lỗ chờ hòa vốn, để lỗ 5% thành lỗ 20%. Bạn đã làm ngược lại: bảo toàn vốn để đánh trận sau. Chú ý dòng thuế bán 0,1%."*

- **D. Lệnh lỗ, không chạm SL (bán tay khi đang lỗ):**
*"Bán khi chưa chạm cắt lỗ — có thể là quyết định đúng (thấy thông tin mới), có thể là hoảng loạn. **Cấp 2 «Kỷ luật» sẽ dạy bạn phân biệt hai điều này.** Hiện tại, ghi nhớ: mỗi lần bán trước kế hoạch nên có lý do rõ ràng."*

**Nút cuối:** `Đóng kết sổ ✓`

**KHÔNG hỏi cảm xúc ở Cấp 0.**

## 6. THANH NHẮC NHỞ BỀN VỮNG — `.gbar` (THÊM MỚI)

Cơ chế nhắc user thao tác đúng khi tự làm — **thay thế cho spotlight ở các nhiệm vụ dạng thao tác** (Chặng 1 và Chặng 3). Vị trí: sticky dưới thanh Journey trên đầu (mobile: sticky dưới journey bar).

**Nguyên tắc CỐT LÕI (khác toast):**
- Nội dung **Ở LẠI** trên màn cho đến khi bước hiện tại hoàn thành, **KHÔNG tự tắt** như toast
- Tự cập nhật nội dung khi user tiến bước
- Làm SAI (bấm nút khi chưa đủ điều kiện): thanh **chuyển đỏ + rung 0,3s + thêm `⚠ ` vào đầu message**, rồi sau ~1,6s tự về vàng nhưng **VẪN ở đó**
- Hoàn thành cả nhiệm vụ: thanh biến mất

**Nội dung 3 bước nhiệm vụ ①:** Tag đầu thanh `CẦN LÀM` (mono, letter-spacing, màu warn).
- **Bước 1/3** (chưa chọn lý do): `Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua`
- **Bước 2/3** (đã chọn, chưa đặt lệnh): `Bước 2/3 — Bấm ĐẶT LỆNH MUA để mua 100 VNM`
- **Bước 3/3** (đã mua, chưa gắn ★): `Bước 3/3 — Mở 👁 Danh mục xem tab Nắm giữ, rồi quay lại Đặt lệnh gắn ★ cạnh VNM`

**Nội dung nhiệm vụ ⑤:** xem §4 Chặng 3 ở trên.

**Ba lớp giao tiếp phân vai rõ:**

| Lớp | Vai | Thời lượng | Dùng khi |
|---|---|---|---|
| Spotlight | Giới thiệu sản phẩm IQX (một chiều) | Đến khi user Tiếp/Bỏ qua | Chặng 2 (tour) |
| **Thanh nhắc (gbar)** | **Huấn luyện thao tác (hai chiều)** | **Đến khi làm xong bước** | **Chặng 1, Chặng 3** |
| Toast | Xác nhận sự kiện đã xảy ra | ~3 giây | Sau khi hành động thành công |

## 7. TAB HÀNH TRÌNH 🎯 (THÊM MỚI — sidebar phải / bottom nav mobile)

**Vị trí:**
- **PC:** đứng ĐẦU sidebar phải (trước Đặt lệnh, Danh mục, AI Phân tích)
- **Mobile:** đứng ĐẦU bottom nav (trước Đặt lệnh, Danh mục, AI Phân tích)
- Là **view mặc định** khi user vào app lần đầu và mỗi lần vào lại giữa chừng

**Nội dung tab (thứ tự từ trên xuống):**

1. **Thẻ cấp:** huy hiệu «Nhập môn» + nhãn `CẤP 0` + tên `NHẬP MÔN` + bài học in nghiêng *"Hiểu sân chơi, và đi trọn vòng đời một lệnh."* + badge chế độ `SÂN TẬP · T+0`
2. **Header checklist:** `TRƯỚC KHI LÊN CẤP 1 · x/6` (x tự cập nhật)
3. **Checklist 3 chặng 6 nhiệm vụ:**
   - Nhãn chặng đã hoàn thành: chuyển sang xanh mờ `rgba(53,208,127,.75)`
   - `CHẶNG 1 — VÀO SÂN` → nhiệm vụ ①
   - `CHẶNG 2 — HIỂU SÂN CHƠI · TOUR SẢN PHẨM IQX` → ② ③ ④ (locked cho đến khi bàn giao)
   - `CHẶNG 3 — KHÉP VÒNG` → ⑤ ⑥
4. **Ô đích cuối tab:** *"Xong cả 6 → tốt nghiệp **Cấp 0 «Nhập môn»**, chuyển chế độ **Thực chiến** (T+2,5 · biên độ · hồ sơ bắt đầu tính)."*

**Trạng thái mỗi mục checklist:**
- **Đang active:** nền brand-soft, viền brand, có dòng mô tả + nút **"Làm ngay →"** (click nhảy thẳng vào việc)
- **Đã xong:** gạch ngang + check ✓ xanh, opacity 0.55
- **Chưa mở (khóa):** mờ (opacity 0.45), không nút

**Tên 6 nhiệm vụ (hiển thị trong checklist):**
1. Lệnh đầu tiên + Nắm giữ + Theo dõi
2. Tour bảng điện — 8 điểm
3. Tour bản tin thị trường
4. Tour "6 người chơi" trên mã của bạn
5. Lệnh thứ hai — tự đặt ngưỡng cắt lỗ
6. Bán một lệnh — kết sổ đầu tiên

**Journey bar sticky trên đầu (THÊM MỚI):**
- Nội dung: `CẤP 0 · x/6` (bên trái) + tên nhiệm vụ kế tiếp (giữa) + 6 chấm tiến trình (phải)
- **Toàn thanh bấm được → mở tab Hành trình** (cursor: pointer, tooltip "Bấm để mở Hành trình")
- Chấm tiến trình: xám (chưa làm) / brand phát sáng (đang làm) / xanh lá (đã xong)

**Copy journey bar theo tiến độ:**
- Khi 0/6: `CẤP 0 · 0/6` + "Chặng 1 «Vào sân» — **Lệnh đầu tiên của bạn**"
- Khi 1/6: `CẤP 0 · 1/6` + "✓ Chặng 1 hoàn thành! Tiếp: Chặng 2 — tour sản phẩm IQX"
- Khi 6/6: `CẤP 0 · 6/6` + "🎓 Hoàn thành Cấp 0!"

**Auto-chuyển tab khi hoàn thành nhiệm vụ:** panel phải / bottom sheet tự chuyển về Hành trình, dòng vừa xong tick ✓ trước mắt user (moment thưởng, KHÔNG confetti).

Từ Cấp 1 trở đi, tab này tiến hóa thành **trang hồ sơ tiến trình cấp** (spec riêng khi bàn giao Cấp 1).

## 8. ẨN THEO CẤP (progressive disclosure — quan trọng cho dev)

Web IQX hiện có đầy đủ các thành phần dưới đây. Ở Cấp 0 **chỉ ẨN CÓ ĐIỀU KIỆN, KHÔNG xóa code** — các thành phần này quay lại theo điều kiện mở.

| Thành phần hiện có trên web | Ở Cấp 0 | Điều kiện mở lại |
|---|---|---|
| Sổ lệnh bid/ask trong panel đặt lệnh | **ẨN** | Xong nhiệm vụ ② (tour bảng điện) — vì đã học bên mua/bán |
| Dropdown loại lệnh (MP/LO/…) | **ẨN** | Nhiệm vụ ⑤ |
| Ô Giá trong phiếu lệnh | **ẨN** | Nhiệm vụ ⑤ |
| Tab "Tin tức" (sidebar phải) | **ẨN** | Lên Cấp 1 |
| Tab "AI Mẫu nến" (sidebar phải) | **ẨN** | Lên Cấp 1 |
| Tab "AI Phân tích" (sidebar phải) | HIỂN THỊ | (giữ nguyên) |
| Toolbar vẽ chart (bên trái) | HIỂN THỊ | (giữ nguyên — bài chart thuộc Cấp 1) |
| Nút "Phân tích danh mục" trong tab Nắm giữ | HIỂN THỊ | (giữ nguyên) |

Khi mở khóa 1 thành phần, hiển thị 1 toast nhẹ: *"Bạn vừa mở khóa: **{tên thành phần}**."* — không popup to.

**Component MỚI cần thêm vào panel đặt lệnh Cấp 0:** khối "Kế hoạch" (chip lý do + preset cắt lỗ/chốt lời + ghi chú) — copy chi tiết ở §4 Chặng 1. Layout xem mockup `iqx-cap0-pc.html`.

## 9. TỐT NGHIỆP CẤP 0

Điều kiện: **6/6 nhiệm vụ** + **2 cổng hành vi** (⑤ keydown ô cắt lỗ, ⑥ đóng màn kết sổ).

**Màn tốt nghiệp — 3 khối:**

**Header:**
- Tag mono nhỏ: `HOÀN THÀNH`
- Tên cấp lớn (Space Grotesk 30px): `CẤP 0 · NHẬP MÔN`
- Dòng phụ nhỏ: `6/6 nhiệm vụ · 2/2 cổng hành vi`
- Huy hiệu Cấp 0 cỡ lớn (120px), phát sáng — hiển thị dạng "vừa đúc xong" (viền hoàn thành, không phải rỗng như thường)

**Khối 1 — Ghi nhận** (nền bg3, viền bd):
*"Bạn đã đi trọn Cấp 0 «Nhập môn»: hiểu bảng điện, đọc được bản tin, biết 6 người chơi trên thị trường — và quan trọng nhất: đi trọn 2 vòng lệnh có kế hoạch, tự tay đặt ngưỡng cắt lỗ của mình. **Phần lớn người mua cổ phiếu ngoài kia chưa từng làm điều cuối cùng.**"*

**Khối 2 — Định vị trung thực** (nền bg3, viền bd):
*"Nói thẳng: bạn đã biết **CÁCH CHƠI**, chưa biết **CHƠI GIỎI** — và đó là chủ đích. Cấp 1 «Học việc» dạy bạn lập kế hoạch thật sự cho từng lệnh. Câu hỏi 'chọn mã nào' sẽ được trả lời dần từ chính dữ liệu 6 lớp bạn vừa làm quen."*

**Khối 3 — Chuyển chế độ** (viền xanh `rgba(53,208,127,.4)`):
*"**Từ giờ: chế độ THỰC CHIẾN.** Luật thật 100% — mua xong chờ T+2,5 ngày cổ phiếu mới về, biên độ, phí, thuế đầy đủ. Vì hồ sơ nhà đầu tư của bạn bắt đầu được tính từ đây."*

**Nút:** `Vào Cấp 1 «Học việc» →` (full width, brand)

**Sau khi bấm:** badge góc màn hình đổi từ `SÂN TẬP · T+0` sang `THỰC CHIẾN`, route sang flow Cấp 1.

## 10. DỮ LIỆU CẦN GHI (THÊM MỚI)

**Bảng `cap0_progress`** (mỗi user 1 dòng):

```
user_id                      -- FK
entered_at                   -- timestamp vào Cấp 0 lần đầu
virtual_balance_init         -- mặc định 250.000.000 (theo web hiện tại)

task_1_done_at               -- timestamp mỗi nhiệm vụ hoàn thành
task_2_done_at
task_3_done_at
task_4_done_at
task_5_done_at
task_6_done_at

task1_star_clicked           -- bool: nhiệm vụ ① đã bấm ★
task5_sl_typed               -- bool: CỔNG 1 — keydown event vào ô cắt lỗ ở nhiệm vụ ⑤
task6_debrief_done           -- bool: CỔNG 2 — màn kết sổ đã đóng ở nhiệm vụ ⑥

graduated_at                 -- timestamp tốt nghiệp Cấp 0
time_to_graduate_hours       -- (graduated_at - entered_at) / 3600
```

**Cột `mode`** thêm vào bảng lệnh chung: `san_tap` / `thuc_chien`. Lệnh Cấp 0 luôn `san_tap`.

**Sự kiện analytics tối thiểu:**
- `cap0_task_start(task_id)` · `cap0_task_complete(task_id)` · `cap0_task_skip(task_id)`
- `cap0_gbar_shown(step_no)` · `cap0_gbar_warn(step_no)` — đo tần suất user làm sai
- `cap0_graduate`

**Thước đo sản phẩm (dashboard từ ngày đầu):** tỷ lệ user vào Cấp 0 hoàn thành 6/6. Ngưỡng cảnh báo: <40% → nút thắt.

## 11. CHUẨN GIAO DIỆN

Chi tiết CSS/màu ở mockup `iqx-cap0-pc.html`. Bảng màu:

```
--brand:      #4f8ff7                 (xanh chính)
--brand-soft: rgba(79,143,247,.16)
--brand-bd:   rgba(79,143,247,.4)

--bg1:  #171923    (nền chính)
--bg2:  #1f2230    (nền card)
--bg3:  #282c3d    (nền input)
--bd:   #39405a    (border)

--t1:   #f0f2f7    (text chính)
--t2:   #b8bdcc    (text phụ)
--t3:   #8a90a5    (text mờ)

--up:   #35d07f    (xanh lá)
--down: #ff6b6b    (đỏ)
--warn: #ffc53d    (vàng — gbar, tham chiếu TC)
--ceil: #d48aff    (tím — trần)
--floor:#4dc3ff    (xanh dương — sàn)
```

**Thanh nhắc `.gbar`:**
- Bình thường: nền `rgba(255,197,61,.10)`, viền dưới `rgba(255,197,61,.45)`, tag "CẦN LÀM" màu warn
- Trạng thái warn: nền `rgba(255,107,107,.12)`, viền dưới `rgba(255,107,107,.55)` + animation `gshake` 0,3s (dịch trái-phải ±4px)

**Chuẩn spotlight (dùng chung cho các tour Chặng 2 bàn giao sau):**
- Overlay phủ toàn màn: `rgba(10, 12, 20, 0.52)` — KHÔNG đậm hơn (đã chốt)
- Vùng sáng: viền brand 3px + outline trắng mờ 2px, bo góc 12-14px, transition 350ms ease-out
- Tooltip: **nền TRẮNG chữ đen** (`#fff` / `#1a2033`), radius 14px, mũi tên chỉ vào vùng sáng
- Spotlight cột trong bảng: vùng sáng kéo dọc từ header nhóm xuống hết tbody
- Tooltip tự tránh mép màn hình

## 12. HUY HIỆU CẤP ĐỘ — SVG SẴN CODE

Cùng viên lục giác tiến hóa qua 6 cấp: viền sáng dần, lõi đặc dần, tia sáng từ Cấp 4, phát sáng ở Cấp 5.

**3 vị trí xuất hiện:**
1. **Header pill cạnh tên user** (size ~34, showNum true)
2. **Đầu tab Hành trình** với vòng progress bọc ngoài (size ~66, ring = %tiến độ trong cấp 0..1, glow true)
3. **Màn tốt nghiệp** — size lớn phát sáng (size ~120, glow true, hiển thị dạng "vừa đúc xong")

**Bảng màu 6 cấp:**

```js
const LEVELS = [
  { n:0, name:'Nhập môn',   color:'#8a90a5', fill:0 },
  { n:1, name:'Học việc',   color:'#c97b4a', fill:1 },
  { n:2, name:'Kỷ luật',    color:'#7dd3c0', fill:2 },
  { n:3, name:'Bản lĩnh',   color:'#4f8ff7', fill:3 },
  { n:4, name:'Thuần thục', color:'#a78bfa', fill:4 },
  { n:5, name:'Lão luyện',  color:'#e0b64d', fill:5 },
];
```

**Hàm render huy hiệu — copy trực tiếp vào codebase:**

```js
/**
 * Vẽ 1 huy hiệu hexagon tiến hóa. Trả về chuỗi SVG.
 * @param {object} o - options
 * @param {number} o.n         - số cấp (0..5) hiển thị giữa
 * @param {string} o.color     - màu chính (lấy từ LEVELS[n].color)
 * @param {number} o.fill      - 0..5, độ đặc + số cạnh sáng (thường = n)
 * @param {number} [o.size=96] - kích thước px
 * @param {boolean}[o.glow]    - có filter phát sáng không (dùng cho cấp cao / đang học / tốt nghiệp)
 * @param {number} [o.ring]    - 0..1: vẽ vòng progress ngoài (chỉ khi != null)
 * @param {boolean}[o.showNum=true] - hiện số cấp ở giữa
 */
function badge(o){
  const s=o.size||96, c=s/2, R=s*0.34;
  const col=o.color, fill=o.fill, ring=o.ring, glow=o.glow;
  const pts=[];
  for(let i=0;i<6;i++){ const a=Math.PI/2 + i*Math.PI/3; pts.push([c+R*Math.cos(a), c-R*Math.sin(a)]); }
  const uid='g'+Math.random().toString(36).slice(2,7);

  let litEdges='';
  for(let i=0;i<6;i++){
    const p1=pts[i], p2=pts[(i+1)%6];
    const lit = i < Math.min(fill+1,6);
    litEdges += `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${lit?col:'#3a3f52'}" stroke-width="${lit?2.4:1.4}" stroke-linecap="round" opacity="${lit?1:.6}"/>`;
  }

  const coreOpacity = [0,0.10,0.20,0.34,0.52,0.9][fill];
  const innerR = R*0.56;
  const innerPts=[];
  for(let i=0;i<6;i++){ const a=Math.PI/2 + i*Math.PI/3; innerPts.push((c+innerR*Math.cos(a)).toFixed(1)+','+(c-innerR*Math.sin(a)).toFixed(1)); }
  const showNum = o.showNum!==false;

  let rays='';
  if(fill>=4){
    for(let i=0;i<6;i++){ const a=Math.PI/2 + i*Math.PI/3 + Math.PI/6;
      const x1=c+R*1.05*Math.cos(a), y1=c-R*1.05*Math.sin(a);
      const x2=c+R*1.3*Math.cos(a),  y2=c-R*1.3*Math.sin(a);
      rays+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="1.6" stroke-linecap="round" opacity="${fill===5?.9:.5}"/>`;
    }
  }

  let ringSvg='';
  if(ring!=null){
    const rr=R*1.5, cir=2*Math.PI*rr;
    ringSvg=`<circle cx="${c}" cy="${c}" r="${rr}" fill="none" stroke="#2c3244" stroke-width="3"/>
    <circle cx="${c}" cy="${c}" r="${rr}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"
      stroke-dasharray="${cir}" stroke-dashoffset="${(cir*(1-ring)).toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>`;
  }

  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs>
      <radialGradient id="${uid}c" cx="50%" cy="42%" r="60%">
        <stop offset="0%"   stop-color="${col}" stop-opacity="${Math.min(coreOpacity+0.15,1)}"/>
        <stop offset="100%" stop-color="${col}" stop-opacity="${coreOpacity*0.5}"/>
      </radialGradient>
      ${glow?`<filter id="${uid}g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`:''}
    </defs>
    ${ringSvg}
    <g ${glow?`filter="url(#${uid}g)"`:''}>
      ${rays}
      <polygon points="${innerPts.join(' ')}" fill="url(#${uid}c)"/>
      ${litEdges}
      ${showNum?`<text x="${c}" y="${c+1}" text-anchor="middle" dominant-baseline="central"
        font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="${s*0.26}"
        fill="${fill>=3?'#fff':col}" opacity="${fill===0?.6:1}">${o.n}</text>`:''}
    </g>
  </svg>`;
}
```

**Ví dụ dùng:**

```js
// Header pill (Cấp 2 - Kỷ luật)
element.innerHTML = badge({ n:2, color:LEVELS[2].color, fill:2, size:34 });

// Đầu tab Hành trình (Cấp 0, đang học, 40% tiến độ trong cấp)
element.innerHTML = badge({ n:0, color:LEVELS[0].color, fill:0, size:66, ring:0.40, glow:true });

// Màn tốt nghiệp Cấp 0 (hiển thị dạng "vừa đúc xong" - fill nâng lên như đã hoàn tất)
element.innerHTML = badge({ n:0, color:LEVELS[0].color, fill:1, size:120, glow:true });
```

## 13. TÍNH NĂNG WEB CHỈ THAM CHIẾU (KHÔNG SỬA)

Để rõ scope — các thứ dưới đây **đã có sẵn trên web, Cấp 0 chỉ đọc/gắn sự kiện lên chúng**, không đụng logic:

- 3 bản tin thị trường 07:15/11:30/16:30 (đã production)
- Phân tích cổ phiếu 6 lớp (đã production, có ô "Kết luận tổng hợp")
- Panel Danh mục 3 tab Theo dõi/Nắm giữ/Lịch sử với 4 ô sức khỏe + nút "Phân tích danh mục"
- Bảng giá thật với 4 card index, cột Trần/Sàn/TC, 3 bước mua/bán, tab ★ Danh mục
- Ngôi sao ★ cạnh tên mã để gắn vào Theo dõi
- Chart TradingView + toolbar vẽ

## 14. NGOÀI PHẠM VI CẤP 0 (chống scope-creep)

Cấp 0 **KHÔNG có** — dev không tự thêm cho dù có vẻ hợp lý:
- Đọc chart/nến (thuộc Cấp 1)
- Form Kế hoạch bản đầy đủ 5 nhóm × lý do con + thanh R:R (thuộc Cấp 1)
- Calibration / Confidence (Cấp 3-4)
- Streak kỷ luật (Cấp 2)
- Cảnh báo Telegram · position sizing · margin · ATO/ATC · cổ tức/quyền
- Tiêu điểm 2 tuần (Cấp 2)
- Reset tài khoản: cho reset tiền ảo, **KHÔNG BAO GIỜ** reset hồ sơ hành vi — áp từ Cấp 1

## 15. CHECKLIST BÀN GIAO CHO DEV (kiểm trước merge)

- [ ] Câu hỏi xếp lớp hiện đúng 1 lần cho user mới, không hiện lại
- [ ] Badge `SÂN TẬP · T+0` hiện góc màn hình xuyên suốt Cấp 0
- [ ] Sổ lệnh / ô Giá / dropdown loại lệnh / tab Tin tức / tab AI Mẫu nến ĐÃ ẨN đúng điều kiện §8
- [ ] Tab 🎯 Hành trình xuất hiện đầu sidebar phải PC + đầu bottom nav mobile, là view mặc định
- [ ] Journey bar sticky trên đầu, bấm bất kỳ đâu mở tab Hành trình
- [ ] Thanh gbar bền vững — vàng khi nhắc, đỏ+rung khi làm sai, tự cập nhật nội dung theo bước, biến mất khi hoàn thành nhiệm vụ
- [ ] Khối "Kế hoạch" mới trong panel đặt lệnh: 5 chip lý do + preset SL/TP + ghi chú
- [ ] Nhiệm vụ ① tự-thao-tác, KHÔNG có spotlight
- [ ] Cổng ⑤: chỉ `keydown` vào ô cắt lỗ mới tính đạt (click nút auto không đạt)
- [ ] Màn kết sổ ⑥: bảng đối chiếu Kế hoạch/Thực tế + dòng thuế 0,1% + khối coach chọn đúng template theo tình huống
- [ ] Màn tốt nghiệp 3 khối + nút chuyển sang Cấp 1 + badge góc màn hình đổi thành `THỰC CHIẾN`
- [ ] Bảng `cap0_progress` + cột `mode` trong bảng lệnh + sự kiện analytics đã có
- [ ] Huy hiệu SVG xuất hiện đúng 3 vị trí (header pill, đầu tab Hành trình có vòng progress, màn tốt nghiệp) — dùng hàm `badge()` ở §12
- [ ] Chặng 2 (3 tour): 3 slot locked trong checklist, chờ bàn giao spec riêng — KHÔNG code nội dung tour

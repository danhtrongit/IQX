# IQX Demo Trading — Cấp 0 «Nhập môn»
### Spec bàn giao đợt 1 · v3.0 (bản cuối) · 07/2026

Kèm mockup: `iqx-cap0-datlenh.html` (panel đặt lệnh Cấp 0) · `iqx-cap0-pc.html` · `iqx-cap0-mobile.html` (layout tổng) · `iqx-badges.html` (6 huy hiệu SVG).

---

## ⚠️ ĐỌC TRƯỚC — Nguyên tắc bàn giao (KHÔNG BỎ QUA)

Web IQX.vn **đã có sẵn** panel đặt lệnh (nút MUA/BÁN, khớp lệnh, số dư, Trần/Sàn/TC, sổ lệnh, ô Giá, loại lệnh), chart TradingView, bảng giá, tab Nắm giữ/Theo dõi/Lịch sử, trang AI Phân tích cổ phiếu, trang AI Phân tích BCTC, 3 bản tin. Tài liệu này mô tả **PHẦN CHÊNH LỆCH (DELTA)** cần thêm cho Cấp 0 — KHÔNG dựng lại cái đã có.

**AI code chỉ làm 3 việc:** (1) THÊM MỚI thành phần chưa có · (2) ẨN/HIỆN thành phần có sẵn theo cấp · (3) GẮN EVENT vào luồng có sẵn để đếm tiến trình. Với mọi tính năng định code, tự hỏi "thuộc nhóm nào ở §0?" — không thuộc 🟢/🟡/🔵 thì KHÔNG code.

**Cơ chế bán (áp dụng toàn hệ thống, mọi cấp):** Hệ thống **KHÔNG tự động bán**. User luôn **tự tay bấm bán**. Cấp 0 chưa có cắt lỗ/chốt lời (xuất hiện lần đầu ở Cấp 2).

---

## 0. BẢNG TỔNG SCOPE — AI đọc bảng này trong 30 giây là biết code gì

| Nhóm | Nghĩa | Thành phần |
|---|---|---|
| 🟢 **THÊM MỚI** — code từ đầu | Chưa có trên web | · Câu hỏi xếp lớp lần đầu (§3)<br>· Badge chế độ `SÂN TẬP · T+0` / `THỰC CHIẾN` góc màn hình (§2)<br>· **Tab 🎯 Hành trình** ở sidebar phải (PC) + bottom nav (mobile) (§7)<br>· **Journey bar** sticky trên đầu (§7)<br>· **Khối "Kế hoạch"** trong panel đặt lệnh: chỉ 5 chip lý do đời thường (§4 nhiệm vụ ①)<br>· **Thanh nhắc `.gbar`** (§6)<br>· **Màn Kết sổ Cấp 0** (§5)<br>· **Màn tốt nghiệp Cấp 0** 3 khối (§9)<br>· Huy hiệu SVG — hàm `badge()` (§12) |
| 🟡 **ẨN THEO CẤP** — có sẵn, chỉ mở/ẩn có điều kiện | Bọc điều kiện, KHÔNG xoá code | · **Sổ lệnh bid/ask** → ẨN suốt Cấp 0 (mở lên Cấp 2)<br>· **Ô Giá + dropdown loại lệnh** → ẨN ở nhiệm vụ ①, mở ở nhiệm vụ ⑤<br>· **Tab Tin tức + AI Mẫu nến** → ẨN (mở lên Cấp 1)<br>· **Chế độ giao dịch:** Cấp 0 = Sân tập T+0 |
| 🔵 **GẮN THÊM EVENT** — logic có sẵn, chỉ nghe sự kiện | Không sửa logic, chỉ addEventListener | · **Đặt lệnh mua** — gắn listener để đếm tiến trình, cập nhật gbar, chặn nếu chưa chọn chip lý do<br>· **Bấm ★ gắn Theo dõi** — gắn listener đánh dấu hoàn thành nhiệm vụ ①<br>· **Bán lệnh** — gắn listener mở màn Kết sổ (§5) |
| ⚪ **GIỮ NGUYÊN** — không đụng | Đọc-để-tham-chiếu | · Panel đặt lệnh (nút MUA/BÁN, khớp lệnh, số dư, phí, Trần/Sàn/TC)<br>· Chart TradingView + toolbar vẽ<br>· Bảng giá, ★ Danh mục, header, tab Nắm giữ/Theo dõi/Lịch sử<br>· Trang AI Phân tích cổ phiếu · AI Phân tích BCTC · 3 bản tin |

---

## 1. HỆ CẤP ĐỘ (ngữ cảnh chung)

Demo Trading là hành trình nhiều cấp, lên cấp bằng **hành vi** (không phải điểm số, không tụt cấp). Mỗi cấp có huy hiệu lục giác tiến hóa.

**Hệ cấp là hệ MỞ — cứ có nội dung/kỹ năng mới đáng dạy thì thêm cấp.** Tổng số cấp chưa cố định. Các cấp nền tảng (0-5) có tên ẩn dụ theo mạch trưởng thành; từ cấp 6 trở đi đặt tên theo chủ đề kỹ năng (VD "Cấp 6 · Quản trị rủi ro danh mục"). Bảng dưới là **các cấp hiện có**, không phải toàn bộ hệ.

| Cấp | Tên | Màu huy hiệu | Bài học một câu |
|---|---|---|---|
| **0** | Nhập môn | xám `#8a90a5` | Hiểu sân chơi, đi trọn vòng đời một lệnh |
| **1** | Học việc | đồng `#c97b4a` | Vào lệnh phải biết vì sao mua và mua vùng nào |
| **2** | Kỷ luật | ngọc lam `#7dd3c0` | Kế hoạch chỉ có giá trị khi được thực hiện |
| **3** | Bản lĩnh | xanh brand `#4f8ff7` | Kết quả tốt ≠ quyết định tốt |
| **4** | Thuần thục | tím `#a78bfa` | Biết vũ khí và điểm mù của chính mình |
| **5** | Lão luyện | vàng kim `#e0b64d` | Đứng ngoài cũng là một quyết định |
| **6+** | (theo chủ đề) | (sinh thêm — xem §12) | (định khi xây cấp đó) |

- Hiển thị **tên cấp** (không chỉ số).
- Người có kinh nghiệm được xếp lớp tối đa Cấp 2 (không nhảy cao hơn) — đây là trần lúc xếp lớp, không liên quan tổng số cấp.
- Huy hiệu render bằng hàm `badge()` (§12) — hàm nhận `n` bất kỳ nên hệ mở rộng không giới hạn.
- **Nguyên tắc cộng dồn:** mỗi cấp GIỮ NGUYÊN mọi thứ cấp trước + THÊM tầng mới. Không bỏ, không code lại. Vì hệ mở, mỗi cấp phải tự ghi rõ "kế thừa gì + thêm gì" để cấp sau nối tiếp sạch.

---

## 2. HAI CHẾ ĐỘ GIAO DỊCH (THÊM MỚI · logic chung)

| Chế độ | Dùng ở | Đặc điểm |
|---|---|---|
| **Sân tập · T+0** | Cấp 0 | Cổ phiếu về ngay, bán lại được liền — để tập thao tác không chờ đợi. Tiền ảo. |
| **Thực chiến · T+2,5** | Cấp 1 trở đi | Luật thật 100%: T+2,5, biên độ, phí, thuế. Hồ sơ nhà đầu tư bắt đầu tính. |

**Badge chế độ** hiển thị góc màn hình (cạnh tên user): `SÂN TẬP · T+0` (xám) hoặc `THỰC CHIẾN` (đổi khi tốt nghiệp Cấp 0). Thêm cột `mode` (`san_tap`/`thuc_chien`) vào bảng lệnh chung.

> ⚠️ **ĐÍNH CHÍNH (08/2026) — bản trước ghi "Lệnh Cấp 0 luôn `san_tap`". Câu đó SAI.**
> `mode` do **gói thuê bao** quyết định, không phải do cấp: backend đặt
> `mode = "thuc_chien" if is_premium else "san_tap"`. Cấp 0 miễn phí và mở cho
> **mọi** user, kể cả người đang có Premium — nên lệnh Cấp 0 của một subscriber
> mang `thuc_chien`. Tin vào câu cũ mà đi lọc `mode` sẽ **giết tính năng với
> đúng nhóm khách trả tiền** (đã xảy ra một lần: chip lý do không ghi được và
> Kết sổ hiện `Lý do mua —` vĩnh viễn). **KHÔNG lọc theo `mode` ở bất kỳ đâu
> trong luồng Cấp 0.**

---

## 3. CỬA VÀO — CÂU HỎI XẾP LỚP (THÊM MỚI)

Lần đầu vào Demo Trading, hỏi 1 câu để xếp lớp:

> **Bạn đã từng mua bán cổ phiếu thật bao giờ chưa?**
> - ○ Chưa bao giờ → **Cấp 0 «Nhập môn»**
> - ○ Có, nhưng chưa tự tin → **Cấp 1 «Học việc»** (phải xem 3 tour sản phẩm trước khi đặt lệnh đầu)
> - ○ Có, giao dịch thường xuyên → **Cấp 2 «Kỷ luật»** (tối đa — không xếp cao hơn)

- Người mới hoàn toàn → Cấp 0 (tài liệu này)
- 2 nhóm còn lại xếp lớp thẳng — chi tiết tour-theo-nhánh ở spec Cấp 1
- Không hiển thị điểm số, chỉ hiển thị tên cấp và một dòng mô tả ngắn

---

## 4. NHIỆM VỤ CẤP 0 — 3 CHẶNG · 5 NHIỆM VỤ

Cấp 0 dạy **cơ học thuần**: mua/bán, vào danh mục Nắm giữ, cho mã vào Theo dõi, đi trọn vòng đời một lệnh. KHÔNG có lý do phân tích, KHÔNG cắt lỗ/chốt lời, KHÔNG sổ lệnh.

### Chặng 1 — VÀO SÂN

#### ① Lệnh đầu tiên + Nắm giữ + Theo dõi

**Ba bước cần user làm — phân rõ web có sẵn cái gì, dev thêm cái gì:**

| Bước | Web đã có sẵn (không sửa) | Dev cần thêm |
|---|---|---|
| **1. Chọn 1 chip lý do trong khối "Kế hoạch"** | (chưa có khối này) | 🟢 THÊM MỚI khối "Kế hoạch" trong panel đặt lệnh (chỉ chip lý do đời thường + câu hỏi — KHÔNG cắt lỗ/chốt lời) |
| **2. Bấm ĐẶT LỆNH MUA → 100 CP VNM khớp → vào Nắm giữ** | ✅ Nút MUA, luồng khớp lệnh, cập nhật Nắm giữ đã chạy production | 🔵 Chỉ **gắn event listener** vào "lệnh khớp thành công" để: (a) đánh dấu bước 2/3, (b) cập nhật gbar sang bước 3/3, (c) chặn nếu chưa chọn chip lý do → hiện gbar warn |
| **3. Bấm ★ cạnh tên VNM để gắn vào Theo dõi** | ✅ Ngôi sao ★ và logic Theo dõi đã chạy production | 🔵 Chỉ **gắn event listener** vào click ★ để đánh dấu hoàn thành nhiệm vụ ① và auto quay về tab Hành trình |

- Điều kiện cài đặt: **chọn sẵn mã VNM** ở panel đặt lệnh khi user vào Cấp 0 lần đầu (URL param hoặc trạng thái mặc định)
- **Cấp 0 KHÔNG có cắt lỗ/chốt lời** — khối Kế hoạch chỉ có chip lý do đời thường
- Hoàn thành: lệnh khớp (event từ web) + ★ đã bấm (event từ web)

**Copy tab Hành trình:**
- Tên: **"Lệnh đầu tiên + Nắm giữ + Theo dõi"**
- Mô tả (khi active): *"Mua công ty bạn biết · chọn lý do trong Kế hoạch · xem tiền nằm đâu · gắn sao ★. Làm thiếu bước nào, hệ thống sẽ nhắc."*
- Nút: **"Làm ngay →"**

**Copy khối "Kế hoạch" MỚI trong phiếu lệnh (🟢 THÊM MỚI):**
- Nhãn khối: `KẾ HOẠCH` (mono nhỏ letter-spacing, màu brand)
- Câu hỏi: **"Vì sao bạn chọn VNM?"**
- 5 chip lý do đời thường (thứ tự cố định, không có "đáp án đúng"):
  1. Công ty tôi biết
  2. Người quen giới thiệu
  3. Thấy trên mạng
  4. Giá đang tăng
  5. Thử cho biết
- **KHÔNG có cắt lỗ/chốt lời.** Vị trí: chèn giữa dòng phí GD và nút ĐẶT LỆNH MUA.

**Copy toast xác nhận:**
- Sau khớp lệnh: **"✓ Khớp lệnh MUA 100 VNM @ 61.800"**
- Sau gắn sao: **"★ Đã thêm VNM vào danh mục Theo dõi"**
- Sau hoàn thành nhiệm vụ: **"🎉 Nhiệm vụ 1 hoàn thành! Nắm giữ = tiền đang nằm · Theo dõi = mắt đang canh"**

### Chặng 2 — HIỂU SÂN CHƠI · TOUR SẢN PHẨM IQX

**② Tour bảng điện** · **③ Tour bản tin thị trường** · **④ Tour "6 người chơi"**

**⚠️ KHÔNG bàn giao ở đợt này.** Chờ founder cung cấp mô tả nội dung sản phẩm thật.

Đợt này chỉ cần:
- Tạo 3 slot nhiệm vụ ②③④ trong checklist tab Hành trình, trạng thái `locked` cho đến khi bàn giao spec riêng
- Chuẩn bị cơ chế spotlight chung theo chuẩn §11 để tái sử dụng

### Chặng 3 — KHÉP VÒNG

#### ⑤ Bán một lệnh — Kết sổ đầu tiên

- Điều kiện mở: có ≥1 lệnh đang mở (sau khi xong ①)
- Panel đặt lệnh lúc này **mở thêm ô Giá + dropdown loại lệnh** (LO/MP) — user làm quen lệnh giới hạn (LO) vs thị trường (MP)
  - Tooltip trên ô Giá (lần đầu xuất hiện): *"Bạn vừa mở khóa ô Giá. Nãy giờ bạn dùng lệnh THỊ TRƯỜNG (MP) — mua ngay ở giá bên bán. Nhập giá cụ thể vào ô này là lệnh GIỚI HẠN (LO): 'tôi chỉ mua nếu giá về mức X' — máy chờ giúp bạn. Chủ động hơn, nhưng có thể không khớp."*
- **Web đã có sẵn:** nút "Bán", luồng khớp lệnh bán, cập nhật Nắm giữ. **KHÔNG sửa.**
- 🔵 **Dev chỉ gắn event listener:** khi lệnh bán khớp thành công, mở **màn Kết sổ Cấp 0** (§5)
- **Cổng hành vi (duy nhất của Cấp 0):** user đóng màn kết sổ (bấm "Đóng kết sổ ✓") mới tính đạt

---

## 5. MÀN KẾT SỔ CẤP 0 (spec chi tiết cho nhiệm vụ ⑤)

Mở khi user bán 1 lệnh. Vì Cấp 0 chưa có cắt lỗ/chốt lời, kết sổ đối chiếu **lý do + giá vào + giá ra + thời gian giữ**.

**Header:**
- Tag mono: `KẾT SỔ LỆNH · #{n} · SÂN TẬP`
- Lãi/lỗ cỡ rất lớn (Space Grotesk 42px, đếm tăng ~1s): `+X,X%` xanh / `−X,X%` đỏ
- Dòng phụ mono: `+{VND}đ · MUA {số} {mã} → BÁN`

**Bảng đối chiếu Kế hoạch / Thực tế:**

| | Kế hoạch | Thực tế |
|---|---|---|
| Lý do mua | (1 trong 5 chip đời thường) | — |
| Giá vào | (số) | (số) |
| Giá ra · thuế bán 0,1% | — | (giá) · (số thuế đỏ) |
| Thời gian giữ | — | (số phiên) |

**Khối coach — 1 đoạn (rule-based, chọn 1 trong 2 template theo lãi/lỗ):**

Tag khối: `NHÌN LẠI` (mono, letter-spacing, màu brand). Viền trái brand, nền brand-soft.

- **A. Lệnh lãi:**
*"Lệnh {số} khép trọn vòng đời: mua — nắm giữ — theo dõi — bán — và giờ là nhìn lại. Lệnh lãi. Điều đáng giá hơn con số: **bạn đã đi đủ một vòng giao dịch hoàn chỉnh** — nhiều người mua cổ phiếu còn không biết mình đang nắm gì. Chú ý dòng thuế bán 0,1% — bán luôn tốn thêm một khoản, mua bán liên tục là phí + thuế ăn dần tài khoản."*

- **B. Lệnh lỗ:**
*"Lệnh {số} lỗ nhẹ — nhưng đây là Sân tập, tiền không thật, và bạn vừa đi trọn một vòng giao dịch. **Cái bạn thu được là kinh nghiệm, không phải con số.** Ở Cấp 1 bạn sẽ học chọn lý do mua có cơ sở; Cấp 2 học đặt cắt lỗ/chốt lời để biết khi nào nên thoát. Chú ý dòng thuế bán 0,1%."*

**Nút cuối:** `Đóng kết sổ ✓`

**KHÔNG hỏi cảm xúc ở Cấp 0.**

---

## 6. THANH NHẮC NHỞ BỀN VỮNG — `.gbar` (THÊM MỚI)

Cơ chế nhắc user thao tác đúng khi tự làm — thay cho spotlight ở các nhiệm vụ thao tác (Chặng 1 và Chặng 3). Vị trí: sticky dưới thanh Journey trên đầu.

**Nguyên tắc CỐT LÕI (khác toast):**
- Nội dung **Ở LẠI** trên màn đến khi bước hiện tại hoàn thành, **KHÔNG tự tắt** như toast
- Tự cập nhật nội dung khi user tiến bước
- Làm SAI (bấm nút khi chưa đủ điều kiện): thanh **chuyển đỏ + rung 0,3s + thêm `⚠ ` đầu message**, sau ~1,6s về vàng nhưng **VẪN ở đó**
- Hoàn thành cả nhiệm vụ: thanh biến mất

**Nội dung 3 bước nhiệm vụ ①:** Tag đầu thanh `CẦN LÀM` (mono, màu warn).
- **Bước 1/3** (chưa chọn lý do): `Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua`
- **Bước 2/3** (đã chọn, chưa đặt lệnh): `Bước 2/3 — Bấm ĐẶT LỆNH MUA để mua 100 VNM`
- **Bước 3/3** (đã mua, chưa gắn ★): `Bước 3/3 — Mở 👁 Danh mục xem tab Nắm giữ, rồi quay lại Đặt lệnh gắn ★ cạnh VNM`

**Nội dung nhiệm vụ ⑤ (Bán — Kết sổ):** khi có lệnh mở nhưng chưa bán → `Chọn lệnh trong Nắm giữ và bấm Bán để khép vòng đời lệnh đầu tiên`.

**Ba lớp giao tiếp phân vai rõ:**

| Lớp | Vai | Thời lượng | Dùng khi |
|---|---|---|---|
| Spotlight | Giới thiệu sản phẩm IQX (một chiều) | Đến khi user Tiếp/Bỏ qua | Chặng 2 (tour) |
| **Thanh nhắc (gbar)** | **Huấn luyện thao tác (hai chiều)** | **Đến khi làm xong bước** | **Chặng 1, Chặng 3** |
| Toast | Xác nhận sự kiện đã xảy ra | ~3 giây | Sau khi hành động thành công |

---

## 7. TAB HÀNH TRÌNH 🎯 (THÊM MỚI — sidebar phải / bottom nav mobile)

**Vị trí:**
- **PC:** đầu sidebar phải (trước Đặt lệnh, Danh mục, AI Phân tích)
- **Mobile:** đầu bottom nav
- Là **view mặc định** khi user vào app lần đầu và mỗi lần vào lại giữa chừng

**Nội dung tab (thứ tự trên xuống):**

1. **Thẻ cấp:** huy hiệu «Nhập môn» + nhãn `CẤP 0` + tên `NHẬP MÔN` + bài học in nghiêng *"Hiểu sân chơi, và đi trọn vòng đời một lệnh."* + badge chế độ `SÂN TẬP · T+0`
2. **Header checklist:** `TRƯỚC KHI LÊN CẤP 1 · x/5` (x tự cập nhật)
3. **Checklist 3 chặng 5 nhiệm vụ:**
   - Nhãn chặng đã hoàn thành: xanh mờ `rgba(53,208,127,.75)`
   - `CHẶNG 1 — VÀO SÂN` → nhiệm vụ ①
   - `CHẶNG 2 — HIỂU SÂN CHƠI · TOUR SẢN PHẨM IQX` → ② ③ ④ (locked cho đến khi bàn giao)
   - `CHẶNG 3 — KHÉP VÒNG` → ⑤
4. **Ô đích cuối tab:** *"Xong cả 5 → tốt nghiệp **Cấp 0 «Nhập môn»**, chuyển chế độ **Thực chiến** (T+2,5 · biên độ · hồ sơ bắt đầu tính)."*

**Trạng thái mỗi mục checklist:**
- **Đang active:** nền brand-soft, viền brand, có mô tả + nút **"Làm ngay →"**
- **Đã xong:** gạch ngang + check ✓ xanh, opacity 0.55
- **Chưa mở (khóa):** mờ (opacity 0.45), không nút

**Tên 5 nhiệm vụ (hiển thị trong checklist):**
1. Lệnh đầu tiên + Nắm giữ + Theo dõi
2. Tour bảng điện — 8 điểm
3. Tour bản tin thị trường
4. Tour "6 người chơi" trên mã của bạn
5. Bán một lệnh — kết sổ đầu tiên

**Journey bar sticky trên đầu (THÊM MỚI):**
- Nội dung: `CẤP 0 · x/5` (trái) + tên nhiệm vụ kế tiếp (giữa) + 5 chấm tiến trình (phải)
- **Toàn thanh bấm được → mở tab Hành trình** (cursor: pointer)
- Chấm: xám (chưa làm) / brand phát sáng (đang làm) / xanh lá (đã xong)

**Copy journey bar theo tiến độ:**
- Khi 0/5: `CẤP 0 · 0/5` + "Chặng 1 «Vào sân» — **Lệnh đầu tiên của bạn**"
- Khi 1/5: `CẤP 0 · 1/5` + "✓ Chặng 1 hoàn thành! Tiếp: Chặng 2 — tour sản phẩm IQX"
- Khi 5/5: `CẤP 0 · 5/5` + "🎓 Hoàn thành Cấp 0!"

**Auto-chuyển tab khi hoàn thành nhiệm vụ:** panel phải / bottom sheet tự về Hành trình, dòng vừa xong tick ✓ trước mắt user (moment thưởng, KHÔNG confetti).

Từ Cấp 1 trở đi, tab này tiến hóa thành **trang hồ sơ tiến trình cấp** (spec riêng).

---

## 8. ẨN THEO CẤP (progressive disclosure — quan trọng cho dev)

Web IQX hiện có đầy đủ thành phần dưới. Ở Cấp 0 **chỉ ẨN CÓ ĐIỀU KIỆN, KHÔNG xóa code** — chúng quay lại theo điều kiện mở.

| Thành phần hiện có trên web | Ở Cấp 0 | Điều kiện mở lại |
|---|---|---|
| Sổ lệnh bid/ask trong panel đặt lệnh | **ẨN** | Lên Cấp 2 (không hiện ở Cấp 0 và Cấp 1) |
| Dropdown loại lệnh (MP/LO/…) | **ẨN** | Nhiệm vụ ⑤ (chặng 3) |
| Ô Giá trong phiếu lệnh | **ẨN** | Nhiệm vụ ⑤ (chặng 3) |
| Tab "Tin tức" (sidebar phải) | **ẨN** | Lên Cấp 1 |
| Tab "AI Mẫu nến" (sidebar phải) | **ẨN** | Lên Cấp 1 |
| Tab "AI Phân tích" (sidebar phải) | HIỂN THỊ | (giữ nguyên) |
| Toolbar vẽ chart (bên trái) | HIỂN THỊ | (giữ nguyên) |
| Nút "Phân tích danh mục" trong tab Nắm giữ | HIỂN THỊ | (giữ nguyên) |

Khi mở khóa 1 thành phần, hiển thị 1 toast nhẹ: *"Bạn vừa mở khóa: **{tên thành phần}**."* — không popup to.

**Component MỚI cần thêm vào panel đặt lệnh Cấp 0:** khối "Kế hoạch" (chỉ chip lý do đời thường, KHÔNG cắt lỗ/chốt lời) — copy chi tiết §4. Layout xem `iqx-cap0-datlenh.html`.

---

## 9. TỐT NGHIỆP CẤP 0

Điều kiện: **5/5 nhiệm vụ** + **1 cổng hành vi** (⑤ đóng màn kết sổ).

**Màn tốt nghiệp — 3 khối:**

**Header:**
- Tag mono nhỏ: `HOÀN THÀNH`
- Tên cấp lớn (Space Grotesk 30px): `CẤP 0 · NHẬP MÔN`
- Dòng phụ nhỏ: `5/5 nhiệm vụ`
- Huy hiệu Cấp 0 cỡ 120px, phát sáng, dạng "vừa đúc xong"

**Khối 1 — Ghi nhận** (nền bg3, viền bd):
*"Bạn đã đi trọn Cấp 0 «Nhập môn»: hiểu bảng điện, đọc được bản tin, biết 6 người chơi trên thị trường — và quan trọng nhất: **đi trọn một vòng đời lệnh hoàn chỉnh** (mua → nắm giữ → theo dõi → bán → kết sổ). Phần lớn người mua cổ phiếu ngoài kia còn không biết mình đang nắm gì."*

**Khối 2 — Định vị trung thực** (nền bg3, viền bd):
*"Nói thẳng: bạn đã biết **CÁCH CHƠI**, chưa biết **CHƠI GIỎI** — và đó là chủ đích. Cấp 1 «Học việc» dạy bạn chọn lý do mua có cơ sở cho từng lệnh, từ chính dữ liệu 6 lớp phân tích. Cấp 2 dạy đặt cắt lỗ/chốt lời và kỷ luật thực hiện."*

**Khối 3 — Chuyển chế độ** (viền xanh `rgba(53,208,127,.4)`):
*"**Từ giờ: chế độ THỰC CHIẾN.** Luật thật 100% — mua xong chờ T+2,5 ngày cổ phiếu mới về, biên độ, phí, thuế đầy đủ. Vì hồ sơ nhà đầu tư của bạn bắt đầu được tính từ đây."*

**Nút:** `Vào Cấp 1 «Học việc» →` (full width, brand)

**Sau khi bấm:** badge góc đổi từ `SÂN TẬP · T+0` sang `THỰC CHIẾN`, route sang flow Cấp 1.

---

## 10. DỮ LIỆU CẦN GHI (THÊM MỚI)

**Bảng `cap0_progress`** (mỗi user 1 dòng):
```
user_id                      -- FK
entered_at                   -- timestamp vào Cấp 0 lần đầu
virtual_balance_init         -- mặc định 250.000.000

task_1_done_at               -- lệnh đầu + Nắm giữ + Theo dõi
task_2_done_at               -- tour bảng điện
task_3_done_at               -- tour bản tin
task_4_done_at               -- tour 6 người chơi
task_5_done_at               -- bán + kết sổ

task1_star_clicked           -- bool: nhiệm vụ ① đã bấm ★
task5_debrief_done           -- bool: CỔNG (duy nhất) — màn kết sổ đã đóng ở nhiệm vụ ⑤

graduated_at
time_to_graduate_hours       -- (graduated_at - entered_at) / 3600
```

**Cột `mode`** thêm vào bảng lệnh chung: `san_tap` / `thuc_chien`. **KHÔNG phải lệnh Cấp 0 nào cũng `san_tap`** — xem đính chính ở §2: `mode` do gói thuê bao quyết định, nên user Premium ở Cấp 0 sinh lệnh `thuc_chien`. Ghi lại `mode` để tham chiếu, nhưng **không được lọc theo nó**.

**Bảng riêng của Cấp 0** (mỗi lệnh Cấp 0, tối giản) — **tách khỏi `order_kehoach` của Cấp 1**, vì bảng đó có `lyDo`/`trangThai_luc_dat`/`vung_mua` NOT NULL theo từ vựng phân tích của Cấp 1, `order_id` UNIQUE (một dòng Cấp 0 sẽ khoá vĩnh viễn kế hoạch Cấp 1 của chính lệnh đó), và nhiệm vụ ③ Cấp 1 đếm DISTINCT `lyDo`:
```
order_id · mode (ghi lại, KHÔNG lọc)
ly_do_doi_thuong             -- 1 in 5 chip đời thường
```
(KHÔNG có cột cắt lỗ/chốt lời/lý do phân tích — thuộc Cấp 1-2.)

**Sự kiện analytics tối thiểu:**
- `cap0_task_start(task_id)` · `cap0_task_complete(task_id)` · `cap0_task_skip(task_id)`
- `cap0_gbar_shown(step_no)` · `cap0_gbar_warn(step_no)` — đo tần suất user làm sai
- `cap0_ketso_view` · `cap0_graduate`

**Thước đo sản phẩm:** tỷ lệ user vào Cấp 0 hoàn thành 5/5. Ngưỡng cảnh báo: <40% → nút thắt.

---

## 11. CHUẨN GIAO DIỆN

Chi tiết CSS ở mockup `iqx-cap0-datlenh.html`. Bảng màu:

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
- Overlay phủ toàn màn: `rgba(10, 12, 20, 0.52)`
- Vùng sáng: viền brand 3px + outline trắng mờ 2px, bo góc 12-14px, transition 350ms ease-out
- Tooltip: **nền TRẮNG chữ đen** (`#fff` / `#1a2033`), radius 14px, mũi tên chỉ vào vùng sáng
- Tooltip tự tránh mép màn hình

---

## 12. HUY HIỆU CẤP ĐỘ — SVG SẴN CODE

Cùng viên lục giác tiến hóa qua các cấp: viền sáng dần, lõi đặc dần, tia sáng từ Cấp 4, phát sáng ở Cấp 5.

**3 vị trí xuất hiện:**
1. **Header pill cạnh tên user** (size ~34, showNum true)
2. **Đầu tab Hành trình** với vòng progress bọc ngoài (size ~66, ring = %tiến độ 0..1, glow true)
3. **Màn tốt nghiệp** — size lớn phát sáng (size ~120, glow true)

**Bảng màu các cấp hiện có (mở rộng được):**
```js
const LEVELS = [
  { n:0, name:'Nhập môn',   color:'#8a90a5', fill:0 },
  { n:1, name:'Học việc',   color:'#c97b4a', fill:1 },
  { n:2, name:'Kỷ luật',    color:'#7dd3c0', fill:2 },
  { n:3, name:'Bản lĩnh',   color:'#4f8ff7', fill:3 },
  { n:4, name:'Thuần thục', color:'#a78bfa', fill:4 },
  { n:5, name:'Lão luyện',  color:'#e0b64d', fill:5 },
  // Cấp 6+ thêm dòng mới khi xây cấp đó. Quy tắc màu: chọn màu
  // tương phản rõ với cấp liền trước, độ sáng tăng dần. fill dùng min(n,5)
  // để hiệu ứng lõi/tia không vỡ khi n>5 (giữ mức "đầy" của Cấp 5).
];
// Helper an toàn cho hệ mở:
function levelStyle(n){
  return LEVELS[n] || { n, name:'Cấp '+n, color:'#e0b64d', fill:5 };
}
```
**Lưu ý hệ mở:** hàm `badge()` nhận `n` bất kỳ. Với cấp >5, truyền `fill: Math.min(n,5)` để hiệu ứng không vỡ, và bổ sung màu mới vào `LEVELS`.

**Hàm render huy hiệu — copy trực tiếp vào codebase:**
```js
/**
 * Vẽ 1 huy hiệu hexagon tiến hóa. Trả về chuỗi SVG.
 * @param {object} o - options
 * @param {number} o.n         - số cấp (0..5) hiển thị giữa
 * @param {string} o.color     - màu chính (lấy từ LEVELS[n].color)
 * @param {number} o.fill      - 0..5, độ đặc + số cạnh sáng (thường = n)
 * @param {number} [o.size=96] - kích thước px
 * @param {boolean}[o.glow]    - có filter phát sáng không
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
// Header pill (Cấp 2)
element.innerHTML = badge({ n:2, color:LEVELS[2].color, fill:2, size:34 });
// Đầu tab Hành trình (Cấp 0, 40% tiến độ)
element.innerHTML = badge({ n:0, color:LEVELS[0].color, fill:0, size:66, ring:0.40, glow:true });
// Màn tốt nghiệp Cấp 0
element.innerHTML = badge({ n:0, color:LEVELS[0].color, fill:1, size:120, glow:true });
```

---

## 13. NGOÀI PHẠM VI CẤP 0 (chống scope-creep)

Cấp 0 **KHÔNG có** — dev không tự thêm:
- **Cắt lỗ / Chốt lời** — thuộc Cấp 2
- **Lý do phân tích 6 lớp** — thuộc Cấp 1 (Cấp 0 chỉ có chip lý do đời thường)
- **Sổ lệnh bid/ask** — mở lên Cấp 2
- **Phân tích danh mục** — Cấp 1+ (Cấp 0 chỉ có màn Kết sổ sau mỗi lệnh)
- **Huy chương con / Tủ huân chương** — Cấp 2+ (Cấp 0 chỉ có huy hiệu cấp)
- **Leaderboard, social, copy trade** — không có ở mọi cấp
- **Confetti, âm thanh chói** — không
- **Reset hồ sơ hành vi** — KHÔNG BAO GIỜ

---

## 14. CHECKLIST BÀN GIAO CHO DEV (kiểm trước merge)

- [ ] Câu hỏi xếp lớp lần đầu, route đúng Cấp 0/1/2
- [ ] Badge chế độ `SÂN TẬP · T+0` góc màn hình
- [ ] Sổ lệnh / ô Giá / dropdown loại lệnh / tab Tin tức / tab AI Mẫu nến ĐÃ ẨN đúng §8
- [ ] Tab 🎯 Hành trình đầu sidebar phải PC + đầu bottom nav mobile, là view mặc định
- [ ] Journey bar sticky trên đầu, bấm bất kỳ đâu mở tab Hành trình
- [ ] Thanh gbar bền vững — vàng khi nhắc, đỏ+rung khi làm sai, tự cập nhật theo bước, biến mất khi xong nhiệm vụ
- [ ] Khối "Kế hoạch": 5 chip lý do đời thường + câu hỏi (KHÔNG cắt lỗ/chốt lời)
- [ ] Nhiệm vụ ① tự-thao-tác, KHÔNG spotlight; cổng chặn nếu chưa chọn chip lý do
- [ ] Nhiệm vụ ⑤: ô Giá + LO/MP mở ra; cổng = đóng màn kết sổ
- [ ] Màn kết sổ ⑤: bảng đối chiếu Lý do/Giá vào/Giá ra/Thời gian + thuế 0,1% + coach 2 template (lãi/lỗ), KHÔNG cắt lỗ/chốt lời, KHÔNG hỏi cảm xúc
- [ ] Màn tốt nghiệp 3 khối + nút sang Cấp 1 + badge góc đổi thành `THỰC CHIẾN`
- [ ] Bảng `cap0_progress` + cột `mode` + analytics đủ
- [ ] Huy hiệu SVG đúng 3 vị trí (header pill, đầu tab Hành trình có ring, màn tốt nghiệp) — hàm `badge()` §12
- [ ] Chặng 2 (3 tour): 3 slot locked, chờ bàn giao spec riêng — KHÔNG code nội dung tour

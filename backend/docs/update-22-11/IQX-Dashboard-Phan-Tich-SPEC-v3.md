# Spec Dashboard phân tích · v3

> Ngày: 07/11/2026
>
> **Thay thế:** toàn bộ `IQX-Dashboard-Phan-Tich-SPEC-v2.md`.
>
> **Bản mẫu:** `IQX-Dashboard-Phan-Tich-v3-MAU.html`.
> - Số liệu là số tự sinh. 21 mã để thử:
>
>   | Ngành | Mã thử |
>   |---|---|
>   | Doanh nghiệp sản xuất | FPT, CTD |
>   | Ngân hàng | VCB, MBB |
>   | Chứng khoán | SSI, VND |
>   | Bảo hiểm | BVH, PVI |
>   | Bất động sản | VHM, NLG, KBC |
>   | Dầu khí | GAS, PVS, PLX |
>   | Bán lẻ và tiêu dùng | MWG, PNJ, VNM |
>   | Điện và tiện ích | POW, REE |
>   | Vật liệu cơ bản | HPG, DPM |
>
>   Việc xếp mã thử vào ngành chỉ để minh họa. Bản thật xếp theo phân ngành của nguồn dữ liệu (§1.3).
> - Mã REE trong bản mẫu giả định báo cáo lưu chuyển tiền tệ lập theo phương pháp trực tiếp ở 4 quý năm 2025, để thử quy tắc để trống khấu hao (§10).
> - Thiết lập lưu trên trình duyệt (khoá `iqx_dash5`). Bản thật lưu theo tài khoản (§6).
> - Nút **Học** mở `IQX-Hoc-Vien-v5-MAU.html#bai=<tên>&nganh=<mã ngành>`. Để hai file cùng thư mục thì nút này chạy được.
> - Các tab Biểu đồ, Bảng giá, Thị trường và các nút Đặt lệnh, Danh mục, Tin tức, Insight trong bản mẫu chỉ giữ chỗ.
>
> **Đi cùng:** `IQX-Hoc-Vien-SPEC-v5.md`.
>
> **Quy ước:** **[THAY ĐỔI]** là điểm khác v2. **[DECISION]** là điểm chủ sản phẩm cần chốt.

---

## 0. Tóm tắt thay đổi so với v2

| # | v2 | v3 |
|---|---|---|
| 1 | 4 ngành | **9 ngành**: thêm bất động sản, dầu khí, bán lẻ và tiêu dùng, điện và tiện ích, vật liệu cơ bản |
| 2 | Ngành theo mẫu báo cáo | Mẫu báo cáo tài chính chia ngân hàng, chứng khoán, bảo hiểm. **Mẫu doanh nghiệp chia tiếp theo phân ngành của nguồn dữ liệu** |
| 3 | Mỗi mã: chương chung và chương ngành | Giữ nguyên. Mã thuộc 5 ngành mới **không** dùng nhóm doanh nghiệp sản xuất |
| 4 | Một chỉ tiêu chỉ có một bài | **Chỉ tiêu dạy lại**: chỉ tiêu chung hoặc chỉ tiêu doanh nghiệp sản xuất được dạy lại trong chương ngành. Trên Dashboard, chỉ tiêu đó **chỉ hiện một lần, trong nhóm của ngành** |
| 5 | 62 chỉ tiêu | **90 chỉ tiêu khác tên**. Mỗi ngành 25 đến 33 biểu đồ (§3.2) |
| 6 | Tên nhóm cấp 1 theo tên chương | Theo spec Học viện v4.1 §6.2: "Chỉ tiêu chung", "Chỉ tiêu <ngành>" |
| 7 | Nút Học: `#bai=<tên>` | **`#bai=<tên>&nganh=<mã ngành>`** |
| 8 | Biểu đồ ROE như nhau ở mọi ngành | ROE ở ngân hàng, chứng khoán, bảo hiểm có **2 đường ROE và ROA**, cột bên dưới là đòn bẩy |
| 9 | Biên gộp luôn tính 4 quý | Dầu khí và vật liệu cơ bản: **biên gộp tính từng quý** |
| 10 | Đơn vị "năm" không có số lẻ | Đơn vị "năm" có **1 chữ số thập phân** (dùng cho Số năm bán hết tồn kho) |

Những gì không nhắc lại ở đây (vị trí, bố cục, Quý/Năm, số kỳ, khuôn biểu đồ, quy tắc số liệu) giữ như v2, đã chép lại đầy đủ ở các mục dưới.

---

## 1. Vị trí và mã đang xem

### 1.1 Vị trí

- Dashboard nằm trong tab **DEMO TRADING**.
- Mở bằng nút **"Dashboard phân tích"** ở cột công cụ bên phải, cùng cột với Đặt lệnh, Danh mục, Tin tức, Insight. Cách bật/tắt giống nút Insight.
- Dashboard đang mở thì nút được tô sáng. Bấm lại nút, hoặc bấm tab Biểu đồ / Bảng giá / Thị trường, thì quay về màn hình đó.

### 1.2 Mã đang xem

- Mã do **ô tìm kiếm ở góc trên bên phải** quyết định, dùng chung cho cả trang.
- Trên dashboard chỉ hiển thị mã, không có tên công ty.
- Cạnh mã có **nhãn ngành** [THAY ĐỔI]: một trong 9 tên ở §1.3.

### 1.3 Ngành của mã [THAY ĐỔI]

**Bước 1.** Theo mẫu báo cáo tài chính, lấy từ nguồn dữ liệu, không nhập tay:

| Mẫu báo cáo | Ngành | Mã ngành |
|---|---|---|
| Tổ chức tín dụng (gồm cả công ty tài chính) | Ngân hàng | `nh` |
| Công ty chứng khoán | Chứng khoán | `ck` |
| Doanh nghiệp bảo hiểm | Bảo hiểm | `bh` |
| Doanh nghiệp | Xem bước 2 | (none) |

**Bước 2.** Với mẫu doanh nghiệp, dùng **phân ngành ICB** của nguồn dữ liệu. Không có bảng ngoại lệ do quản trị viên sửa.

| Phân ngành ICB (nguồn dữ liệu) | Ngành | Mã ngành |
|---|---|---|
| Bất động sản (gồm phát triển bất động sản, khu công nghiệp, dịch vụ bất động sản) | Bất động sản | `bds` |
| Dầu khí: sản xuất dầu khí, thiết bị và dịch vụ dầu khí, lọc và phân phối xăng dầu | Dầu khí | `dk` |
| Bán lẻ; thực phẩm, đồ uống; hàng cá nhân và gia dụng | Bán lẻ và tiêu dùng | `bl` |
| Điện, nước và khí đốt (tiện ích) | Điện và tiện ích | `dien` |
| Tài nguyên cơ bản (thép, kim loại); hoá chất (gồm phân bón); vật liệu xây dựng (xi măng) | Vật liệu cơ bản | `vl` |
| Các phân ngành còn lại, kể cả xây dựng, công nghệ, vận tải, dịch vụ | Doanh nghiệp sản xuất | `thuong` |

- Dev lập bảng ánh xạ từ mã phân ngành cụ thể của nguồn dữ liệu sang 6 mã ngành trên. Bảng này là cấu hình hệ thống, không phải ngoại lệ cho từng mã.
- **Đổi sang mã cùng ngành:** số liệu đổi theo, thiết lập giữ nguyên.
- **Đổi sang mã khác ngành:** dashboard chuyển sang thiết lập của ngành đó (§6).
- **[DECISION]** Mã không xác định được mẫu báo cáo hoặc phân ngành: đề xuất coi là "Doanh nghiệp sản xuất".

---

## 2. Bố cục

Giữ nguyên v2.

### 2.1 Máy tính

Ba cột: vùng dashboard · khung "Biểu đồ" rộng khoảng 300px · cột công cụ.

Thanh trên: tiêu đề "Dashboard phân tích", ô mã, nhãn ngành, nhãn "Dữ liệu minh họa" (chỉ bản mẫu), nút **Quý / Năm**, nút **Mặc định** và **Lưu thiết lập**.

Lưới biểu đồ 2 cột, màn hình hẹp hơn khoảng 1250px thì 1 cột.

### 2.2 Điện thoại (≤ 760px)

Xếp dọc: cột công cụ (cuộn ngang) · khung "Biểu đồ" (cao tối đa khoảng 320px) · tab · dashboard một cột. Không tràn ngang ở 390px.

### 2.3 Màu và chữ

Giao diện tối hiện tại. **Không dùng chữ xám**; chữ phụ dùng `#c9d6e4`. Số kiểu Việt Nam.

---

## 3. Khung "Biểu đồ" bên phải [THAY ĐỔI]

### 3.1 Bố cục khung

- Đầu khung: **"Biểu đồ"** và **"Đã chọn n/N"**, N là số chỉ tiêu của ngành (§3.2).
- Ô **"Tìm chỉ tiêu"** lọc theo tên.

### 3.2 Danh sách chỉ tiêu

Hai nhóm cấp 1:
- **"Chỉ tiêu chung"**: 17 chỉ tiêu chung, **bỏ các chỉ tiêu mà ngành có bài dạy lại**.
- **"Chỉ tiêu <ngành>"**: chỉ tiêu của ngành, gồm cả chỉ tiêu dạy lại, theo nhóm cấp 2 ở §8.

Mỗi chỉ tiêu chỉ hiện một lần. Ví dụ với mã ngân hàng, ROE nằm ở "Chỉ tiêu ngân hàng › Thu nhập và hiệu quả", không còn ở "Chỉ tiêu chung".

| Ngành | Tên nhóm cấp 1 của ngành | Chỉ tiêu chung còn lại | Chỉ tiêu ngành | N |
|---|---|---|---|---|
| Doanh nghiệp sản xuất | Chỉ tiêu doanh nghiệp sản xuất | 17 | 16 | **33** |
| Ngân hàng | Chỉ tiêu ngân hàng | 13 | 15 | **28** |
| Chứng khoán | Chỉ tiêu chứng khoán | 13 | 14 | **27** |
| Bảo hiểm | Chỉ tiêu bảo hiểm | 14 | 11 | **25** |
| Bất động sản | Chỉ tiêu bất động sản | 13 | 19 | **32** |
| Dầu khí | Chỉ tiêu dầu khí | 14 | 15 | **29** |
| Bán lẻ và tiêu dùng | Chỉ tiêu bán lẻ và tiêu dùng | 15 | 13 | **28** |
| Điện và tiện ích | Chỉ tiêu điện và tiện ích | 15 | 15 | **30** |
| Vật liệu cơ bản | Chỉ tiêu vật liệu cơ bản | 14 | 14 | **28** |

### 3.3 Mỗi dòng chỉ tiêu

- Ô tick và tên chỉ tiêu. Tick: thêm biểu đồ vào cuối dashboard rồi cuộn tới. Bỏ tick: xoá biểu đồ.
- Nút **"Học"** ở cuối dòng (§4.3). Bấm nút Học không làm tick hay bỏ tick.

### 3.4 Đồng bộ

- Xoá bằng nút × trên thẻ hoặc bấm "Mặc định" thì ô tick cập nhật ngay.
- Lọc không ra kết quả: hiện "Không có chỉ tiêu phù hợp".

---

## 4. Thẻ biểu đồ

### 4.1 Đầu thẻ

Tay kéo ⋮⋮ · tên chỉ tiêu · nút **Học** · nhãn vàng "Theo năm, cố định" (khuôn D, E1, E2) · nút ×. Không hiển thị con số lớn ở đầu thẻ.

### 4.2 Thân thẻ

- Ô số kỳ ngay dưới tên với khuôn có kỳ thay đổi được.
- Biểu đồ theo khuôn (§9), cùng khuôn với biểu đồ đại diện trong Học viện.
- Rê chuột hoặc chạm: đường dọc và hộp số liệu của kỳ đó.
- Chú giải và nút **"Bảng số"** (bấm lại là "Ẩn bảng").
- Bỏ hết biểu đồ: "Chưa có biểu đồ nào. Tick chọn chỉ tiêu ở khung bên phải để thêm biểu đồ."

### 4.3 Nút "Học" [THAY ĐỔI]

- Có ở mỗi dòng của khung "Biểu đồ" và đầu mỗi thẻ biểu đồ.
- Bấm thì mở bài học của chỉ tiêu **theo ngành của mã đang xem**.
  - Bản thật: mở trang Học viện, gửi `metric_key` và `nganh`.
  - Bản mẫu: tab mới `IQX-Hoc-Vien-v5-MAU.html#bai=<tên chỉ tiêu>&nganh=<mã ngành>`.
- Học viện tìm bài trong chương của ngành trước, không có thì ở Chương 8 (spec Học viện v5 §6.2).
  - Ví dụ: mã VCB, chỉ tiêu ROE → "ROE · ở ngân hàng". Mã FPT, chỉ tiêu ROE → "ROE" ở Chương 8.
- Cả 260 cặp (chỉ tiêu, ngành) trên Dashboard đều có bài.

---

## 5. Kỳ: Quý/Năm và số kỳ

Giữ nguyên v2.

- Nút Quý / Năm chung cho cả dashboard, mặc định **Quý**. Áp dụng cho khuôn A, B, C, F2, F. Không áp dụng cho D, E1, E2.
- Mỗi biểu đồ có ô số kỳ riêng, **mặc định 5 kỳ**. Quý: 4, 5, 8, 12, 20. Năm: 3, 5, 10. Mỗi biểu đồ nhớ riêng số kỳ cho Quý và Năm.
- Định giá theo ngày (khuôn F): số kỳ chọn khoảng thời gian; trung vị và dải ± độ lệch chuẩn tính trên khoảng đang hiện; mốc trục ngang tự giãn như v2 §5.3.
- Nhãn trục ngang: `Q2/26`, `2025`; ghi cách quãng khi nhãn đè nhau, luôn giữ kỳ gần nhất.

---

## 6. Thiết lập và lưu [THAY ĐỔI]

### 6.1 Mỗi ngành một thiết lập

```json
{
  "thuong": { "charts": ["Tăng trưởng doanh thu", "..."], "per": "q", "nks": { "ROE": { "q": 20, "y": 5 } } },
  "nh": { "...": "..." }, "ck": { "...": "..." }, "bh": { "...": "..." },
  "bds": { "...": "..." }, "dk": { "...": "..." }, "bl": { "...": "..." }, "dien": { "...": "..." }, "vl": { "...": "..." }
}
```

Mỗi ngành lưu riêng danh sách biểu đồ và thứ tự, Quý/Năm, số kỳ từng biểu đồ (chỉ lưu chỗ khác mặc định 5). Mã đang xem không nằm trong thiết lập.

### 6.2 Lưu

Giữ v2: lưu theo tài khoản trên server; thay đổi áp dụng ngay nhưng chưa lưu; "Lưu thiết lập" lưu ngành đang xem; bản nháp ngành cũ giữ trong phiên khi đổi sang mã khác ngành; "Mặc định" đưa ngành đang xem về bộ mặc định, chưa tự lưu.

### 6.3 Bộ mặc định từng ngành

Mặc định chung: Quý, mỗi biểu đồ 5 kỳ.

| Ngành | 6 biểu đồ mặc định |
|---|---|
| Doanh nghiệp sản xuất | Tăng trưởng doanh thu · Tăng trưởng LNST · Biên lợi nhuận ròng · ROE · D/E · P/E |
| Ngân hàng | Tăng trưởng LNST · NIM · CIR · Chi phí tín dụng · ROE · P/B |
| Chứng khoán | Cơ cấu doanh thu hoạt động · Tăng trưởng LNST · Dư nợ cho vay / VCSH · Biên lợi nhuận hoạt động · ROE · P/B |
| Bảo hiểm | Tăng trưởng doanh thu phí bảo hiểm gốc · Combined ratio · Lợi suất đầu tư · Tăng trưởng LNST · ROE · P/B |
| Bất động sản | Người mua trả tiền trước / Doanh thu · Tăng trưởng LNST · Số năm bán hết tồn kho · D/E · Lãi vay đã trả / Chi phí lãi vay · P/B |
| Dầu khí | Tăng trưởng doanh thu · Biên lợi nhuận gộp · Tăng trưởng LNST · Tiền ròng / VCSH · ROE · EV / EBITDA |
| Bán lẻ và tiêu dùng | Tăng trưởng doanh thu · Biên lợi nhuận gộp · Chi phí bán hàng và quản lý / Doanh thu · Số ngày tồn kho · ROIC · P/E |
| Điện và tiện ích | Tăng trưởng doanh thu · Biên EBITDA · Capex / Khấu hao · D/E · Interest Coverage · EV / EBITDA |
| Vật liệu cơ bản | Tăng trưởng doanh thu · Biên lợi nhuận gộp · Số ngày tồn kho · Net Debt / EBITDA · Capex / Khấu hao · P/B |

---

## 7. Nguồn số liệu [THAY ĐỔI]

- **Chỉ dùng số trên 3 báo cáo tài chính.** Không dùng thuyết minh.
- Báo cáo hợp nhất nếu có, nếu không thì báo cáo riêng.
- **Dev lập bảng ánh xạ khoản mục** cho từng mẫu báo cáo. Với mẫu doanh nghiệp (Thông tư 200), 5 ngành mới dùng thêm các dòng sau:

| Báo cáo | Dòng | Mã | Dùng cho |
|---|---|---|---|
| B01 | Tiền và các khoản tương đương tiền | 110 | Tiền / Nợ vay ngắn hạn, Tiền ròng / VCSH, Net Debt |
| B01 | Đầu tư tài chính ngắn hạn | 120 | Như trên |
| B01 | Phải thu ngắn hạn của khách hàng | 131 | Số ngày thu tiền, CCC |
| B01 | Trả trước cho người bán ngắn hạn / dài hạn | 132 / 212 | Phải thu và trả trước / VCSH |
| B01 | Phải thu ngắn hạn khác / dài hạn khác | 136 / 216 | Phải thu và trả trước / VCSH |
| B01 | Hàng tồn kho (giá gốc) | 141 | Dự phòng giảm giá tồn kho / Tồn kho |
| B01 | Dự phòng giảm giá hàng tồn kho (số âm, lấy trị tuyệt đối) | 149 | Như trên |
| B01 | Hàng tồn kho (thuần) | 140 | Các chỉ tiêu tồn kho khác |
| B01 | Tài sản cố định | 220 | TSCĐ / Tổng tài sản, Doanh thu / TSCĐ, XDCB dở dang / TSCĐ |
| B01 | Bất động sản đầu tư | 230 | Tỷ trọng bất động sản đầu tư |
| B01 | Chi phí xây dựng cơ bản dở dang | 242 | Tỷ trọng bất động sản đầu tư, XDCB dở dang / TSCĐ |
| B01 | Tổng tài sản | 270 | Nhiều chỉ tiêu |
| B01 | Phải trả người bán ngắn hạn | 311 | Phải trả người bán / Tồn kho, CCC |
| B01 | Người mua trả tiền trước ngắn hạn / dài hạn | 312 / 332 | Người mua trả tiền trước / Doanh thu, Tăng trưởng người mua trả tiền trước |
| B01 | Doanh thu chưa thực hiện ngắn hạn / dài hạn | 318 / 336 | Doanh thu chưa thực hiện / VCSH |
| B01 | Vay và nợ thuê tài chính ngắn hạn / dài hạn | 320 / 338 | Nợ vay, Vay ngắn hạn |
| B01 | Trái phiếu chuyển đổi | 339 | Cộng vào nợ vay |
| B01 | Vốn chủ sở hữu | 410 | Nhiều chỉ tiêu |
| B02 | Doanh thu thuần | 10 | Nhiều chỉ tiêu |
| B02 | Giá vốn hàng bán / Lợi nhuận gộp | 11 / 20 | Biên gộp, tồn kho |
| B02 | Doanh thu hoạt động tài chính | 21 | Thu nhập tài chính / LNTT, LN ngoài kinh doanh |
| B02 | Chi phí tài chính / trong đó chi phí lãi vay | 22 / 23 | Interest Coverage, CP tài chính ngoài lãi vay, Lãi vay đã trả / CP lãi vay |
| B02 | Lãi lỗ trong công ty liên doanh, liên kết | 24 | LN ngoài kinh doanh bất động sản |
| B02 | Chi phí bán hàng / Chi phí quản lý doanh nghiệp | 25 / 26 | Chi phí bán hàng và quản lý, LN kinh doanh chính |
| B02 | Lợi nhuận khác | 40 | LN ngoài kinh doanh bất động sản |
| B02 | Tổng lợi nhuận kế toán trước thuế | 50 | Nhiều chỉ tiêu |
| B03 | Khấu hao TSCĐ và BĐS đầu tư (phương pháp gián tiếp) | 02 | Khấu hao / Doanh thu, Capex / Khấu hao, Biên EBITDA, EBITDA |
| B03 | Tiền lãi vay đã trả (phương pháp gián tiếp) | 14 | Lãi vay đã trả / Chi phí lãi vay |
| B03 | Tiền chi mua sắm, xây dựng TSCĐ và tài sản dài hạn khác | 21 | Capex |
| B03 | Cổ tức, lợi nhuận đã trả cho chủ sở hữu | 36 | Tỷ lệ chi trả cổ tức |

- Với báo cáo lưu chuyển tiền tệ lập theo **phương pháp trực tiếp**: tiền lãi vay đã trả lấy ở dòng tương ứng của phương pháp trực tiếp (mã 04). Khấu hao **không có**, nên các chỉ tiêu cần khấu hao để trống kỳ đó (§10).
- Mã dòng trên là theo mẫu Thông tư 200. Dev kiểm lại theo mẫu báo cáo thực tế của nguồn dữ liệu.

---

## 8. Danh mục chỉ tiêu theo ngành

### 8.0 Quy ước

Giữ v2 §8.0:
- "4 quý" là tổng 4 quý gần nhất. "BQ" là bình quân của cuối quý này và cuối cùng quý năm trước.
- Chế độ Năm: tỷ lệ 4 quý lấy giá trị tại quý 4; chỉ tiêu bảng cân đối lấy số cuối năm; khoản dòng chảy cộng cả năm; tăng trưởng năm so với năm trước; chỉ dùng năm đủ 4 quý.

Cột "Loại": **Chung** (Chương 8), **SX** (Chương 9), **Dạy lại** (chỉ tiêu Chương 8 hoặc 9 có bài riêng ở ngành), **Mới**.

### 8.1 Chỉ tiêu chung: 17 chỉ tiêu (Học viện Chương 8)

Giữ nguyên v2 §8.1, gồm cả quy ước "doanh thu" theo ngành. Năm ngành mới dùng **doanh thu thuần** như doanh nghiệp sản xuất.

### 8.2 Doanh nghiệp sản xuất: 16 chỉ tiêu (Học viện Chương 9)

Giữ nguyên v2 §8.2.

### 8.3 Ngân hàng: 15 chỉ tiêu (Học viện Chương 10)

11 chỉ tiêu giữ nguyên v2 §8.3. Thêm 4 chỉ tiêu dạy lại, đưa vào nhóm của ngành:

| Nhóm | Chỉ tiêu | Loại | Khuôn | Đường chính | Cột bên dưới |
|---|---|---|---|---|---|
| Thu nhập và hiệu quả | Tăng trưởng doanh thu | Dạy lại | A | TOI so với cùng kỳ (như v2) | TOI quý này + Cùng kỳ |
| | NIM · Lợi suất tài sản sinh lãi và chi phí vốn · CIR · Tỷ trọng thu nhập ngoài lãi · Tăng trưởng lợi nhuận trước dự phòng | Như v2 | | | |
| | ROE | Dạy lại | B, **2 đường** | Đường 1: ROE 4 quý. Đường 2: ROA 4 quý | **Tổng tài sản BQ / VCSH BQ**, đơn vị lần |
| | ROA | Dạy lại | B | ROA 4 quý (như v2) | Tổng tài sản bình quân |
| Rủi ro tín dụng | Chi phí tín dụng · Tỷ lệ dự phòng / Dư nợ · Lãi dự thu / Dư nợ | Như v2 | | | |
| Quy mô và vốn | Tăng trưởng tín dụng và huy động · LDR · VCSH / Tổng tài sản | Như v2 | | | |
| Định giá | P/B | Dạy lại | F | Như v2 | — |

### 8.4 Chứng khoán: 14 chỉ tiêu (Học viện Chương 11)

| Nhóm | Chỉ tiêu | Loại | Khuôn | Ghi chú |
|---|---|---|---|---|
| Doanh thu và chi phí | Tăng trưởng doanh thu | Dạy lại | A | Doanh thu hoạt động so với cùng kỳ (như v2) |
| | Cơ cấu doanh thu hoạt động · Biên lợi nhuận hoạt động | Như v2 | | |
| | Margin Stability | Dạy lại | E1 | LNST / Doanh thu hoạt động năm, 5 năm (như v2) |
| Cho vay margin | Tăng trưởng dư nợ cho vay · Dư nợ cho vay / VCSH · Lợi suất cho vay | Như v2 | | |
| Môi giới và tự doanh | Biên lợi nhuận môi giới · Tỷ trọng tài sản tự doanh · Hiệu suất tự doanh | Như v2 | | |
| Chi phí, đòn bẩy và hiệu quả | Chi phí hoạt động / Doanh thu hoạt động · Nợ vay / VCSH | Như v2 | | |
| | ROE | Dạy lại | B, 2 đường | Như ROE ngân hàng: ROE + ROA, cột đòn bẩy |
| Định giá | P/B | Dạy lại | F | Như v2 |

### 8.5 Bảo hiểm: 11 chỉ tiêu (Học viện Chương 12)

| Nhóm | Chỉ tiêu | Loại | Khuôn | Ghi chú |
|---|---|---|---|---|
| Doanh thu phí | Tăng trưởng doanh thu phí bảo hiểm gốc · Tỷ lệ giữ lại | Như v2 | | |
| Hiệu quả nghiệp vụ | Tỷ lệ bồi thường · Tỷ lệ chi phí · Combined ratio | Như v2 | | |
| Đầu tư và lợi nhuận | Lợi suất đầu tư · Cơ cấu lợi nhuận | Như v2 | | |
| | Biên lợi nhuận ròng | Dạy lại | B | Đường: LNST / Phí bảo hiểm thuần 4 quý. **Cột: Lợi nhuận bảo hiểm + Lợi nhuận đầu tư 4 quý** (như cột của Cơ cấu lợi nhuận) |
| | ROE | Dạy lại | B, 2 đường | Như ROE ngân hàng |
| Dự phòng | Dự phòng nghiệp vụ / VCSH | Như v2 | | |
| Định giá | P/B | Dạy lại | F | Như v2 |

### 8.6 Bất động sản: 19 chỉ tiêu (Học viện Chương 13) [MỚI]

| Nhóm | Chỉ tiêu | Loại | Khuôn | Đường chính | Cột bên dưới |
|---|---|---|---|---|---|
| Doanh thu và lợi nhuận | Tăng trưởng doanh thu | Dạy lại | A | Như Chung | Như Chung |
| | Revenue Growth Stability | Dạy lại | E1 | Như Chung | — |
| | Biên lợi nhuận gộp | Dạy lại | B | Như SX (4 quý) | Cột chồng giá vốn + LN gộp |
| | Lợi nhuận ngoài kinh doanh bất động sản / LNTT | Mới | B | (B02-21 + B02-24 + B02-40) 4 quý / LNTT 4 quý, % | Thu nhập ngoài kinh doanh 4 quý + LNTT 4 quý |
| Doanh thu chờ ghi nhận | Người mua trả tiền trước / Doanh thu | Mới | B | (B01-312 + 332) / Doanh thu 4 quý, lần | Người mua trả tiền trước + Doanh thu 4 quý |
| | Tăng trưởng người mua trả tiền trước | Mới | A | Số dư (312 + 332) cuối kỳ so với cùng kỳ. Năm: cuối năm so với cuối năm trước | Cuối quý này + Cùng kỳ năm trước |
| | Doanh thu chưa thực hiện / VCSH | Mới | B | (B01-318 + 336) / VCSH, % | Doanh thu chưa thực hiện + VCSH |
| Tồn kho và tài sản | Tồn kho / Tổng tài sản | Mới | B | B01-140 / B01-270, % | Hàng tồn kho + Tổng tài sản |
| | Số năm bán hết tồn kho | Mới | B | Tồn kho cuối kỳ / Giá vốn 4 quý, **đơn vị năm** | Hàng tồn kho + Giá vốn 4 quý |
| | Tỷ trọng bất động sản đầu tư | Mới | B | (B01-230 + 242) / Tổng tài sản, % | Cột chồng BĐS đầu tư + XDCB dở dang |
| | Phải thu và trả trước / VCSH | Mới | B | (B01-132 + 136 + 212 + 216) / VCSH, % | Cột chồng Trả trước cho người bán + Phải thu khác |
| Nợ và dòng tiền | D/E | Dạy lại | B | Nợ vay (320 + 338 + **339**) / VCSH | Nợ vay + VCSH |
| | Tỷ trọng nợ vay ngắn hạn | Mới | B | B01-320 / Tổng nợ vay, % | Cột chồng Vay ngắn hạn + Vay dài hạn |
| | Tiền / Nợ vay ngắn hạn | Mới | B, **mốc 1** | (B01-110 + 120) / B01-320, lần | Tiền và đầu tư ngắn hạn + Vay ngắn hạn |
| | Lãi vay đã trả / Chi phí lãi vay | Mới | B, **mốc 1** | B03-14 4 quý / B02-23 4 quý, lần | Lãi vay đã trả 4 quý + Chi phí lãi vay 4 quý |
| | Interest Coverage | Dạy lại | B | Như SX | Như SX |
| | CFO / LNST | Dạy lại | B | Như SX | Như SX |
| Định giá | P/E · P/B | Dạy lại | F | Như Chung | — |


### 8.7 Dầu khí: 15 chỉ tiêu (Học viện Chương 14) [MỚI]

| Nhóm | Chỉ tiêu | Loại | Khuôn | Đường chính | Cột bên dưới |
|---|---|---|---|---|---|
| Doanh thu và biên lợi nhuận | Tăng trưởng doanh thu | Dạy lại | A | Như Chung | Như Chung |
| | Biên lợi nhuận gộp | Dạy lại | B | **Biên gộp quý**: LN gộp quý / Doanh thu quý (không cộng 4 quý). Năm: như SX | Cột chồng Giá vốn quý + LN gộp quý |
| | Margin Stability | Dạy lại | E1 | Như Chung | — |
| | Số ngày tồn kho | Mới | B | Tồn kho BQ / Giá vốn 4 quý × 365, ngày | Tồn kho bình quân + Giá vốn 4 quý |
| Tài sản và đầu tư | Khấu hao / Doanh thu | Mới | B | B03-02 4 quý / Doanh thu 4 quý, % | Khấu hao 4 quý |
| | Capex / Khấu hao | Mới | B, **mốc 1** | B03-21 4 quý / B03-02 4 quý, lần | Capex 4 quý + Khấu hao 4 quý |
| | ROIC · FCF Margin | Dạy lại | B | Như SX | Như SX |
| Tiền và nợ | Tiền ròng / VCSH | Mới | B, có mốc 0 | (Tiền + Đầu tư ngắn hạn − Nợ vay) / VCSH, % | Tiền và đầu tư ngắn hạn + Nợ vay |
| | Net Debt / EBITDA | Dạy lại | B | Như SX | Như SX |
| | Thu nhập tài chính / LNTT | Mới | B | B02-21 4 quý / LNTT 4 quý, % | Doanh thu tài chính 4 quý + LNTT 4 quý |
| Đơn hàng và cổ tức | Người mua trả tiền trước / Doanh thu | Mới | B | Như bất động sản | Như bất động sản |
| | Tỷ lệ chi trả cổ tức | Mới | B | Quý: B03-36 4 quý / LNST của 4 quý trước đó. Năm: cổ tức đã trả trong năm / LNST năm trước. % | Cổ tức đã trả + LNST kỳ trước |
| Định giá | P/E | Dạy lại | F | Như Chung | — |
| | EV / EBITDA | Dạy lại | F | Như SX | — |

### 8.8 Bán lẻ và tiêu dùng: 13 chỉ tiêu (Học viện Chương 15) [MỚI]

| Nhóm | Chỉ tiêu | Loại | Khuôn | Đường chính | Cột bên dưới |
|---|---|---|---|---|---|
| Doanh thu và biên lợi nhuận | Tăng trưởng doanh thu | Dạy lại | A | Như Chung | Như Chung |
| | Biên lợi nhuận gộp | Dạy lại | B | Như SX (4 quý) | Như SX |
| | Chi phí bán hàng và quản lý / Doanh thu | Mới | B | (B02-25 + 26) 4 quý / Doanh thu 4 quý, % | Cột chồng CPBH 4 quý + CPQL 4 quý |
| | Biên lợi nhuận kinh doanh chính | Mới | B | (LN gộp − CPBH − CPQL) 4 quý / Doanh thu 4 quý, % | LN kinh doanh chính 4 quý |
| Vốn lưu động | Số ngày tồn kho | Mới | B | Như dầu khí | Như dầu khí |
| | Dự phòng giảm giá tồn kho / Tồn kho | Mới | B | \|B01-149\| / B01-141, % | Dự phòng giảm giá tồn kho |
| | Phải trả người bán / Tồn kho | Mới | B, **mốc 1** | B01-311 / B01-140, lần | Phải trả người bán + Hàng tồn kho |
| | Cash Conversion Cycle | Dạy lại | C | Như SX | Như SX |
| | Vay ngắn hạn / Tồn kho | Mới | B | B01-320 / B01-140, lần | Vay ngắn hạn + Hàng tồn kho |
| Hiệu quả và cổ tức | Doanh thu / Tài sản cố định | Mới | B | Doanh thu 4 quý / TSCĐ (B01-220) BQ, lần | Doanh thu 4 quý + TSCĐ bình quân |
| | ROIC | Dạy lại | B | Như SX | Như SX |
| | Tỷ lệ chi trả cổ tức | Mới | B | Như dầu khí | Như dầu khí |
| Định giá | P/E | Dạy lại | F | Như Chung | — |

### 8.9 Điện và tiện ích: 15 chỉ tiêu (Học viện Chương 16) [MỚI]

| Nhóm | Chỉ tiêu | Loại | Khuôn | Đường chính | Cột bên dưới |
|---|---|---|---|---|---|
| Doanh thu và biên lợi nhuận | Tăng trưởng doanh thu | Dạy lại | A | Như Chung | Như Chung |
| | Biên lợi nhuận gộp | Dạy lại | B | Như SX (4 quý) | Như SX |
| | Margin Stability | Dạy lại | E1 | Như Chung | — |
| | Biên EBITDA | Mới | B | (LN kinh doanh chính + B03-02) 4 quý / Doanh thu 4 quý, %. **Không cộng doanh thu tài chính** | Cột chồng LN kinh doanh chính 4 quý + Khấu hao 4 quý |
| Tài sản và đầu tư | Khấu hao / Doanh thu | Mới | B | Như dầu khí | Như dầu khí |
| | Tài sản cố định / Tổng tài sản | Mới | B | B01-220 / B01-270, % | TSCĐ + Tổng tài sản |
| | Xây dựng dở dang / Tài sản cố định | Mới | B | B01-242 / B01-220, % | XDCB dở dang + TSCĐ |
| | Capex / Khấu hao | Mới | B, mốc 1 | Như dầu khí | Như dầu khí |
| | Số ngày thu tiền | Mới | B | Phải thu khách hàng (B01-131) BQ / Doanh thu 4 quý × 365, ngày | Phải thu khách hàng bình quân + Doanh thu 4 quý |
| Nợ và chi phí tài chính | D/E · Net Debt / EBITDA · Interest Coverage | Dạy lại | B | Như SX | Như SX |
| | Chi phí tài chính ngoài lãi vay / LNTT | Mới | B | (B02-22 − B02-23) 4 quý / LNTT 4 quý, % | CP tài chính ngoài lãi vay 4 quý + LNTT 4 quý |
| Cổ tức và định giá | Tỷ lệ chi trả cổ tức | Mới | B | Như dầu khí | Như dầu khí |
| | EV / EBITDA | Dạy lại | F | Như SX | — |

### 8.10 Vật liệu cơ bản: 14 chỉ tiêu (Học viện Chương 17) [MỚI]

| Nhóm | Chỉ tiêu | Loại | Khuôn | Đường chính | Cột bên dưới |
|---|---|---|---|---|---|
| Doanh thu và biên lợi nhuận | Tăng trưởng doanh thu | Dạy lại | A | Như Chung | Như Chung |
| | Biên lợi nhuận gộp | Dạy lại | B | **Biên gộp quý**, như dầu khí | Như dầu khí |
| | Margin Stability | Dạy lại | E1 | Như Chung | — |
| Tồn kho | Số ngày tồn kho · Dự phòng giảm giá tồn kho / Tồn kho · Vay ngắn hạn / Tồn kho | Mới | B | Như bán lẻ | Như bán lẻ |
| Tài sản và đầu tư | Biên EBITDA | Mới | B | Như điện | Như điện |
| | Capex / Khấu hao | Mới | B, mốc 1 | Như dầu khí | Như dầu khí |
| | Xây dựng dở dang / Tài sản cố định | Mới | B | Như điện | Như điện |
| | ROIC | Dạy lại | B | Như SX | Như SX |
| Nợ và chi phí tài chính | Net Debt / EBITDA | Dạy lại | B | Như SX | Như SX |
| | Chi phí tài chính ngoài lãi vay / LNTT | Mới | B | Như điện | Như điện |
| Định giá | EV / EBITDA | Dạy lại | F | Như SX | — |
| | P/B | Dạy lại | F | Như Chung | — |

### 8.11 Định nghĩa dùng chung

| Khái niệm | Cách tính |
|---|---|
| Nợ vay (mẫu doanh nghiệp) | B01-320 + 338 + 339 |
| Tiền và đầu tư ngắn hạn | B01-110 + 120 |
| Nợ ròng | Nợ vay − Tiền và đầu tư ngắn hạn |
| EBIT | LNTT (B02-50) + Chi phí lãi vay (B02-23) |
| EBITDA (Net Debt / EBITDA, EV / EBITDA) | EBIT + Khấu hao (B03-02) |
| LN kinh doanh chính | LN gộp (B02-20) − CPBH (25) − CPQL (26) |
| EBITDA trong Biên EBITDA | LN kinh doanh chính + Khấu hao. Khác EBITDA ở trên vì không gồm thu nhập tài chính |
| Capex | B03-21 |

**[DECISION]** Có thể thống nhất một định nghĩa EBITDA duy nhất. Bản mẫu giữ hai định nghĩa như bảng trên để Biên EBITDA chỉ đo phần vận hành.

### 8.12 Định giá theo ngày

Giữ v2 §8.6: dùng báo cáo của quý gần nhất **đã công bố** tại ngày đó; bản mẫu giả định công bố 30 ngày sau khi kết thúc quý.

---

## 9. Khuôn biểu đồ

Giữ v2 §9: khuôn A, B, C, D, E1, E2, F, F2; mã vẽ tham khảo `build()`, `panel()`, `hover()` trong bản mẫu. Học viện v5 dùng cùng mã này để vẽ biểu đồ đại diện.

Bổ sung [THAY ĐỔI]:
- **Mốc tham chiếu 1 lần** ở khuôn B cho: Tiền / Nợ vay ngắn hạn, Lãi vay đã trả / Chi phí lãi vay, Capex / Khấu hao, Phải trả người bán / Tồn kho. Đường nét đứt sáng, chú giải "Mốc 1,00". Trục luôn chứa mốc.
- **Mốc 0** khi có giá trị âm, ví dụ Tiền ròng / VCSH, Net Debt / EBITDA của doanh nghiệp dư tiền.
- **Hai đường** ở ROE của ngân hàng, chứng khoán, bảo hiểm: đường 1 `--s1`, đường 2 `#f5d76e`.
- Đơn vị **"năm"**: 1 chữ số thập phân.

---

## 10. Quy tắc số liệu

Giữ v2 §10:
- Kỳ không tính được thì để trống, đường đứt đoạn, bảng số ghi "—". Không vẽ 0 thay cho kỳ trống.
- PEG để trống khi tăng trưởng EPS dưới 5% hoặc P/E âm.
- Số lẻ: % và điểm % 1 chữ số; "lần" 2 chữ số; **"năm" 1 chữ số** [THAY ĐỔI]; tỷ đồng, đồng/CP, ngày 0 chữ số.

Bổ sung cho chỉ tiêu mới [THAY ĐỔI]:
- **Mẫu số bằng 0 hoặc âm thì để trống.** Ví dụ LNTT âm ở Thu nhập tài chính / LNTT, EBITDA âm ở Net Debt / EBITDA, LNST năm trước âm ở Tỷ lệ chi trả cổ tức.
- **Không có dòng khấu hao** (lưu chuyển tiền tệ phương pháp trực tiếp): để trống kỳ đó ở Khấu hao / Doanh thu, Capex / Khấu hao, Biên EBITDA. Không lấy số từ thuyết minh.
  - Net Debt / EBITDA và EV / EBITDA cũng để trống ở kỳ thiếu khấu hao, vì EBITDA không tính được.
- Tiền ròng / VCSH và Net Debt / EBITDA được phép âm.
- Tăng trưởng người mua trả tiền trước để trống khi số dư cùng kỳ bằng 0.

---

## 11. Gợi ý API

| Endpoint | Mô tả |
|---|---|
| `GET /api/dashboard/settings` | Trả thiết lập theo 9 ngành `{thuong, nh, ck, bh, bds, dk, bl, dien, vl}`. Ngành chưa lưu thì trả bộ mặc định |
| `PUT /api/dashboard/settings/{nganh}` | Lưu thiết lập của một ngành |
| `GET /api/fundamental/{ma}?charts=...` | Trả `nganh` của mã và dữ liệu 20 quý, 10 năm. Chỉ tiêu không thuộc ngành của mã trả 400 |
| `GET /api/valuation/{ma}?from=...` | Chuỗi định giá theo ngày, tối đa 10 năm |
| `GET /api/academy/lesson-link?metric=...&nganh=...` | Trả đường dẫn bài học cho nút Học (Học viện v5 §6) |

Cấu trúc một biểu đồ giữ v2 §11 (`name`, `kind`, `unit`, `q`, `y`, `ref`; `main` có thể 2 phần tử). `DATA.nganh[ma]` ∈ {`thuong`, `nh`, `ck`, `bh`, `bds`, `dk`, `bl`, `dien`, `vl`}.

---

## 12. Kiểm thử chấp nhận

1. Mỗi ngành có đúng số chỉ tiêu ở §3.2. Ví dụ mã bất động sản: "Đã chọn n/32", nhóm "Chỉ tiêu chung" còn 13, "Chỉ tiêu bất động sản" 19.
2. Chỉ tiêu dạy lại chỉ hiện một lần. Ví dụ mã ngân hàng không có ROE trong "Chỉ tiêu chung".
3. Mã bất động sản, dầu khí, bán lẻ, điện, vật liệu không có các chỉ tiêu doanh nghiệp sản xuất không được dạy lại, ví dụ mã bất động sản không có Asset Turnover, CCC.
4. Đổi VHM → NLG: thiết lập giữ nguyên. Đổi VHM → GAS: chuyển sang thiết lập dầu khí.
5. Nút Học: VCB · ROE mở "ROE · ở ngân hàng"; FPT · ROE mở "ROE" Chương 8; VHM · Tăng trưởng doanh thu mở "Tăng trưởng doanh thu · ở bất động sản"; HPG · Revenue CAGR 3Y mở bài Chương 8.
6. Biên lợi nhuận gộp của mã dầu khí và vật liệu tính từng quý; chú giải "Biên gộp quý". Mã bán lẻ, điện, bất động sản tính 4 quý.
7. ROE của mã ngân hàng, chứng khoán, bảo hiểm có 2 đường và cột đòn bẩy.
8. Mốc 1 hiện ở 4 chỉ tiêu §9.
9. Mã REE (thiếu khấu hao ở 4 quý năm 2025): Khấu hao / Doanh thu, Capex / Khấu hao, Biên EBITDA, Net Debt / EBITDA để trống ở mọi kỳ 4 quý có chứa quý thiếu khấu hao (Q1/25 đến Q2/26) và ở năm 2025. EV / EBITDA để trống ở các ngày dùng các kỳ đó.
10. Mọi biểu đồ của 9 ngành vẽ được ở Quý và Năm.
11. Không tràn ngang ở 390px, không chữ xám.

---

## 13. Điểm cần chốt

1. Mã không xác định được mẫu báo cáo hoặc phân ngành: coi là doanh nghiệp sản xuất (§1.3).
2. Công ty tài chính dùng mẫu tổ chức tín dụng: xếp vào ngân hàng (giữ v2).
3. Một hay hai định nghĩa EBITDA (§8.11).

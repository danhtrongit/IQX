# Spec Học viện IQX · v5

> Ngày: 07/11/2026
>
> **Thay thế:** spec Học viện v4 (`IQX-Hoc-Vien-SPEC-v4.md`).
>
> **Vẫn áp dụng:** spec bổ sung v4.1 (cấu hình Học viện theo trưởng nhóm), với các điểm cập nhật ở §9 của spec này.
>
> **Bản mẫu:** `IQX-Hoc-Vien-v5-MAU.html`.
> - Đủ 17 chương: 203 bài, 1 bài tự chọn, 17 bài thi.
> - Học tự do như bản mẫu v4. Tiến độ lưu trên trình duyệt với khoá mới `iqx_hv9`, `iqx_hv9t`, vì thứ tự bài đã đổi.
> - Mở thẳng một bài bằng link `#bai=<tên chỉ tiêu>&nganh=<mã ngành>`, ví dụ `IQX-Hoc-Vien-v5-MAU.html#bai=ROE&nganh=nh`. Nút "Học" ở Dashboard phân tích v3 dùng link này.
> - **Bản mẫu là nguồn nội dung.** Chữ, hình minh họa, biểu đồ đại diện, câu hỏi kiểm tra và bài thi của 87 bài mới lấy từ bản mẫu.
>
> **Đi cùng:** `IQX-Dashboard-Phan-Tich-SPEC-v3.md` và `IQX-Dashboard-Phan-Tich-v3-MAU.html`.
>
> **Quy ước:** **[MỚI v5]** là điểm mới so với v4. **[DECISION]** là điểm chủ sản phẩm cần chốt.

---

## 0. Tóm tắt thay đổi so với v4

| # | Hạng mục | v4 | v5 |
|---|---|---|---|
| 1 | Cấu trúc | 12 chương · 116 bài | **17 chương · 203 bài**, cộng Phòng tập thực chiến |
| 2 | Chương ngành | 4 chương ngành: sản xuất, ngân hàng, chứng khoán, bảo hiểm | **9 chương ngành**, thêm bất động sản, dầu khí, bán lẻ và hàng tiêu dùng, điện và tiện ích, vật liệu cơ bản |
| 3 | Cách dạy chỉ tiêu theo ngành | Ba thẻ "Với ngân hàng, chứng khoán, bảo hiểm" trong bài chung | **Bài dạy lại**: chỉ tiêu nào đọc khác hẳn ở một ngành thì có bài riêng trong chương ngành đó |
| 4 | Bài mới | 29 | **87 bài mới**: 46 bài dạy lại, 41 bài chỉ tiêu mới |
| 5 | Link vào bài | `#bai=<tên>` | **`#bai=<tên>&nganh=<mã ngành>`**, vì một tên chỉ tiêu có thể có nhiều bài |
| 6 | Chương 8 | Phần "Với ngân hàng, chứng khoán, bảo hiểm" | Đổi thành **"Ở các ngành"**, thêm dòng **"Có bài riêng"** dẫn tới các bài dạy lại |
| 7 | Chương 9 | (none) | Bài có bài dạy lại ở ngành khác được thêm phần **"Ở các ngành"** |
| 8 | Chương 10–12 | 11, 10, 8 bài | **15, 14, 11 bài**, thêm 11 bài dạy lại. Bài thi thay 22 câu |
| 9 | Biểu đồ đại diện | Ảnh chụp tĩnh của Dashboard | Bài mới **vẽ trực tiếp** bằng cùng mã `build()`, `panel()`, `hover()` của Dashboard. Bài cũ giữ nguyên |
| 10 | Xu tối đa | 11.700 | **20.400** |

---

## 1. Danh mục

### 1.1 Tổng quan

| Chương | Tên | Số bài | Ngành dùng chương này | Ghi chú |
|---|---|---|---|---|
| 1–7 | Giữ nguyên | 54 | (none) | Giữ nguyên v4 |
| 8 | Phân tích cơ bản chung | 17 | Mọi ngành | Đổi phần theo ngành (§1.3) |
| 9 | Phân tích doanh nghiệp sản xuất | 16 | `thuong` | Thêm phần "Ở các ngành" ở 9 bài (§1.4) |
| 10 | Phân tích ngân hàng | 15 | `nh` | [MỚI v5] Thêm 4 bài dạy lại |
| 11 | Phân tích công ty chứng khoán | 14 | `ck` | [MỚI v5] Thêm 4 bài dạy lại |
| 12 | Phân tích công ty bảo hiểm | 11 | `bh` | [MỚI v5] Thêm 3 bài dạy lại |
| 13 | **Phân tích công ty bất động sản** | 19 | `bds` | [MỚI v5] Chương mới |
| 14 | **Phân tích doanh nghiệp dầu khí** | 15 | `dk` | [MỚI v5] Chương mới |
| 15 | **Phân tích bán lẻ và hàng tiêu dùng** | 13 | `bl` | [MỚI v5] Chương mới |
| 16 | **Phân tích điện và tiện ích** | 15 | `dien` | [MỚI v5] Chương mới |
| 17 | **Phân tích vật liệu cơ bản** | 14 | `vl` | [MỚI v5] Chương mới |
| | **Tổng** | **203**, cộng 1 bài tự chọn | | 149 bài chỉ tiêu ở Chương 8–17 |

**Nguyên tắc chia bài:**
- Chương 8 dạy định nghĩa và cách đọc chung của 17 chỉ tiêu, dùng được cho mọi ngành.
- Mỗi ngành có một chương. Một mã chỉ dùng **Chương 8 và chương ngành của nó**. Mã bất động sản, dầu khí, bán lẻ, điện, vật liệu **không** dùng Chương 9.
- Một chỉ tiêu được **dạy lại** trong chương ngành khi cách đọc ở ngành đó khác hẳn: công thức lấy dòng khác, mức tham khảo khác, hoặc có sai lầm riêng của ngành. Không dạy lại khi cách đọc giống bài chung.
- Mỗi bài từ Chương 8 trở đi ứng với **đúng một biểu đồ** trên Dashboard phân tích.

### 1.2 Chương 1–7

Giữ nguyên nội dung và thứ tự bài như v4. Áp dụng các chỉnh sửa câu nhắc số chương ở spec v4.1 §5 (bản mẫu v5 đã sửa).

### 1.3 Chương 8 · Phân tích cơ bản chung (17 bài, giữ nguyên) [MỚI v5]

Giữ 17 bài và thứ tự như v4. Chỉ đổi một phần trong bài:

- Tiêu đề phần **"Với ngân hàng, chứng khoán, bảo hiểm"** đổi thành **"Ở các ngành"**. Giữ ba thẻ nói cách tính ở ngân hàng, chứng khoán, bảo hiểm, vì các ngành không có bài dạy lại vẫn dùng bài chung trên Dashboard.
- Với 8 bài có bài dạy lại, thêm ngay dưới ba thẻ một dòng **"Có bài riêng:"** liệt kê tên các bài dạy lại, mỗi tên là liên kết mở bài đó.

  | Bài Chương 8 | Có bài riêng ở |
  |---|---|
  | Tăng trưởng doanh thu | Ngân hàng, chứng khoán, bất động sản, dầu khí, bán lẻ và tiêu dùng, điện, vật liệu cơ bản |
  | Revenue Growth Stability | Bất động sản |
  | Margin Stability | Chứng khoán, dầu khí, điện, vật liệu cơ bản |
  | ROE | Ngân hàng, chứng khoán, bảo hiểm |
  | ROA | Ngân hàng |
  | Biên lợi nhuận ròng | Bảo hiểm |
  | P/E | Bất động sản, dầu khí, bán lẻ và tiêu dùng |
  | P/B | Ngân hàng, chứng khoán, bảo hiểm, bất động sản, vật liệu cơ bản |

- Quy ước "doanh thu" theo ngành: ngân hàng là tổng thu nhập hoạt động, chứng khoán là doanh thu hoạt động, bảo hiểm là doanh thu phí bảo hiểm thuần. **Năm ngành mới dùng doanh thu thuần**, như doanh nghiệp sản xuất.

### 1.4 Chương 9 · Phân tích doanh nghiệp sản xuất (16 bài, giữ nguyên) [MỚI v5]

Giữ 16 bài và thứ tự như v4. Chương này dùng cho mọi mã lập báo cáo theo mẫu doanh nghiệp mà không thuộc năm ngành mới.

Với 9 bài có bài dạy lại ở ngành khác, thêm phần **"Ở các ngành"** ngay trước Tóm tắt: một đoạn ngắn và liên kết tới các bài dạy lại. Các bài đó là: Biên lợi nhuận gộp, ROIC, Cash Conversion Cycle, D/E, Interest Coverage, Net Debt / EBITDA, CFO / LNST, FCF Margin, EV / EBITDA.

### 1.5 Chương 10 · Phân tích ngân hàng (15 bài)

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu · ở ngân hàng | Dạy lại |
| 2 | NIM · biên lãi thuần | Giữ |
| 3 | Lợi suất tài sản sinh lãi và chi phí vốn · hai vế của NIM | Giữ |
| 4 | CIR · tỷ lệ chi phí trên thu nhập | Giữ |
| 5 | Tỷ trọng thu nhập ngoài lãi · độ đa dạng nguồn thu | Giữ |
| 6 | Tăng trưởng lợi nhuận trước dự phòng · sức kiếm tiền cốt lõi | Giữ |
| 7 | ROE · ở ngân hàng | Dạy lại |
| 8 | ROA · ở ngân hàng | Dạy lại |
| 9 | Chi phí tín dụng · giá phải trả cho rủi ro cho vay | Giữ |
| 10 | Tỷ lệ dự phòng / Dư nợ · bộ đệm chống rủi ro | Giữ |
| 11 | Tăng trưởng tín dụng và huy động · tốc độ mở rộng của ngân hàng | Giữ |
| 12 | LDR · tỷ lệ cho vay trên tiền gửi | Giữ |
| 13 | Lãi dự thu / Dư nợ · chất lượng thu nhập lãi | Giữ |
| 14 | VCSH / Tổng tài sản · mức đệm vốn của ngân hàng | Giữ |
| 15 | P/B · ở ngân hàng | Dạy lại |

### 1.6 Chương 11 · Phân tích công ty chứng khoán (14 bài)

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu · ở công ty chứng khoán | Dạy lại |
| 2 | Cơ cấu doanh thu hoạt động · nguồn thu của công ty chứng khoán | Giữ |
| 3 | Biên lợi nhuận hoạt động · biên gộp của công ty chứng khoán | Giữ |
| 4 | Margin Stability · ở công ty chứng khoán | Dạy lại |
| 5 | Tăng trưởng dư nợ cho vay · quy mô cho vay margin | Giữ |
| 6 | Dư nợ cho vay / VCSH · mức dùng vốn cho margin | Giữ |
| 7 | Lợi suất cho vay · lãi thu được trên dư nợ | Giữ |
| 8 | Biên lợi nhuận môi giới · lãi từ phí giao dịch | Giữ |
| 9 | Tỷ trọng tài sản tự doanh · mức vốn dành cho đầu tư | Giữ |
| 10 | Hiệu suất tự doanh · lãi trên danh mục đầu tư | Giữ |
| 11 | Chi phí hoạt động / Doanh thu hoạt động · mức tiêu hao doanh thu | Giữ |
| 12 | Nợ vay / VCSH · đòn bẩy của công ty chứng khoán | Giữ |
| 13 | ROE · ở công ty chứng khoán | Dạy lại |
| 14 | P/B · ở công ty chứng khoán | Dạy lại |

### 1.7 Chương 12 · Phân tích công ty bảo hiểm (11 bài)

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu phí bảo hiểm gốc · tốc độ bán bảo hiểm | Giữ |
| 2 | Tỷ lệ giữ lại · phần rủi ro công ty tự gánh | Giữ |
| 3 | Tỷ lệ bồi thường · phần phí dùng để trả tổn thất | Giữ |
| 4 | Tỷ lệ chi phí · chi phí để bán và vận hành | Giữ |
| 5 | Combined ratio · tỷ lệ kết hợp | Giữ |
| 6 | Lợi suất đầu tư · hiệu quả của danh mục đầu tư | Giữ |
| 7 | Cơ cấu lợi nhuận · bảo hiểm và đầu tư đóng góp bao nhiêu | Giữ |
| 8 | Biên lợi nhuận ròng · ở công ty bảo hiểm | Dạy lại |
| 9 | ROE · ở công ty bảo hiểm | Dạy lại |
| 10 | Dự phòng nghiệp vụ / VCSH · quy mô nghĩa vụ so với vốn | Giữ |
| 11 | P/B · ở công ty bảo hiểm | Dạy lại |

### 1.8 Chương 13 · Phân tích công ty bất động sản (19 bài) [MỚI v5]

Gồm cả công ty khu công nghiệp. Doanh nghiệp mẫu: "công ty bất động sản mẫu"; riêng bài Doanh thu chưa thực hiện / VCSH dùng "công ty khu công nghiệp mẫu".

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu · ở bất động sản | Dạy lại |
| 2 | Revenue Growth Stability · ở bất động sản | Dạy lại |
| 3 | Biên lợi nhuận gộp · ở bất động sản | Dạy lại |
| 4 | Lợi nhuận ngoài kinh doanh bất động sản / LNTT · lợi nhuận đến từ đâu | Mới |
| 5 | Người mua trả tiền trước / Doanh thu · doanh thu đang chờ ghi nhận | Mới |
| 6 | Tăng trưởng người mua trả tiền trước · tín hiệu sớm của bán hàng | Mới |
| 7 | Doanh thu chưa thực hiện / VCSH · tiền thuê trả trước | Mới |
| 8 | Tồn kho / Tổng tài sản · vốn nằm trong dự án | Mới |
| 9 | Số năm bán hết tồn kho · tồn kho bằng bao nhiêu năm giá vốn | Mới |
| 10 | Tỷ trọng bất động sản đầu tư · phần tài sản để cho thuê | Mới |
| 11 | Phải thu và trả trước / VCSH · tiền đang nằm ở bên khác | Mới |
| 12 | D/E · ở bất động sản | Dạy lại |
| 13 | Tỷ trọng nợ vay ngắn hạn · áp lực đáo hạn | Mới |
| 14 | Tiền / Nợ vay ngắn hạn · có đủ tiền trả nợ sắp đến hạn | Mới |
| 15 | Lãi vay đã trả / Chi phí lãi vay · lãi vay đang được vốn hoá | Mới |
| 16 | Interest Coverage · ở bất động sản | Dạy lại |
| 17 | CFO / LNST · ở bất động sản | Dạy lại |
| 18 | P/E · ở bất động sản | Dạy lại |
| 19 | P/B · ở bất động sản | Dạy lại |

### 1.9 Chương 14 · Phân tích doanh nghiệp dầu khí (15 bài) [MỚI v5]

Doanh nghiệp mẫu: "doanh nghiệp dầu khí mẫu". Biên lợi nhuận gộp ở chương này tính **theo từng quý** (§2.4).

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu · ở dầu khí | Dạy lại |
| 2 | Biên lợi nhuận gộp · ở dầu khí | Dạy lại |
| 3 | Margin Stability · ở dầu khí | Dạy lại |
| 4 | Số ngày tồn kho · thời gian hàng nằm trong kho | Mới |
| 5 | Khấu hao / Doanh thu · mức nặng tài sản | Mới |
| 6 | Capex / Khấu hao · đầu tư mới hay chỉ dùng tài sản cũ | Mới |
| 7 | ROIC · ở dầu khí | Dạy lại |
| 8 | FCF Margin · ở dầu khí | Dạy lại |
| 9 | Tiền ròng / VCSH · lượng tiền dư sau khi trừ nợ vay | Mới |
| 10 | Net Debt / EBITDA · ở dầu khí | Dạy lại |
| 11 | Thu nhập tài chính / LNTT · lợi nhuận từ tiền gửi | Mới |
| 12 | Người mua trả tiền trước / Doanh thu · việc đã ký chưa làm | Mới |
| 13 | Tỷ lệ chi trả cổ tức · phần lợi nhuận trả lại cổ đông | Mới |
| 14 | P/E · ở dầu khí | Dạy lại |
| 15 | EV / EBITDA · ở dầu khí | Dạy lại |

### 1.10 Chương 15 · Phân tích bán lẻ và hàng tiêu dùng (13 bài) [MỚI v5]

Doanh nghiệp mẫu: "công ty bán lẻ mẫu".

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu · ở bán lẻ và tiêu dùng | Dạy lại |
| 2 | Biên lợi nhuận gộp · ở bán lẻ và tiêu dùng | Dạy lại |
| 3 | Chi phí bán hàng và quản lý / Doanh thu · chi phí vận hành chuỗi | Mới |
| 4 | Biên lợi nhuận kinh doanh chính · lãi từ việc bán hàng | Mới |
| 5 | Số ngày tồn kho · tốc độ quay vòng hàng hoá | Mới |
| 6 | Dự phòng giảm giá tồn kho / Tồn kho · hàng đang mất giá | Mới |
| 7 | Phải trả người bán / Tồn kho · nhà cung cấp tài trợ hàng hoá | Mới |
| 8 | Cash Conversion Cycle · ở bán lẻ và tiêu dùng | Dạy lại |
| 9 | Vay ngắn hạn / Tồn kho · hàng hoá được tài trợ bằng nợ | Mới |
| 10 | Doanh thu / Tài sản cố định · mỗi đồng cửa hàng bán được bao nhiêu | Mới |
| 11 | ROIC · ở bán lẻ và tiêu dùng | Dạy lại |
| 12 | Tỷ lệ chi trả cổ tức · ở bán lẻ và tiêu dùng | Mới |
| 13 | P/E · ở bán lẻ và tiêu dùng | Dạy lại |

### 1.11 Chương 16 · Phân tích điện và tiện ích (15 bài) [MỚI v5]

Doanh nghiệp mẫu: "công ty điện mẫu".

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu · ở điện | Dạy lại |
| 2 | Biên lợi nhuận gộp · ở điện | Dạy lại |
| 3 | Margin Stability · ở điện | Dạy lại |
| 4 | Biên EBITDA · biên lợi nhuận trước khấu hao | Mới |
| 5 | Khấu hao / Doanh thu · ở điện | Mới |
| 6 | Tài sản cố định / Tổng tài sản · mức nặng tài sản | Mới |
| 7 | Xây dựng dở dang / Tài sản cố định · nhà máy đang xây | Mới |
| 8 | Capex / Khấu hao · ở điện | Mới |
| 9 | Số ngày thu tiền · bên mua điện trả tiền nhanh hay chậm | Mới |
| 10 | D/E · ở điện | Dạy lại |
| 11 | Net Debt / EBITDA · ở điện | Dạy lại |
| 12 | Interest Coverage · ở điện | Dạy lại |
| 13 | Chi phí tài chính ngoài lãi vay / LNTT · ảnh hưởng của tỷ giá | Mới |
| 14 | Tỷ lệ chi trả cổ tức · ở điện | Mới |
| 15 | EV / EBITDA · ở điện | Dạy lại |

### 1.12 Chương 17 · Phân tích vật liệu cơ bản (14 bài) [MỚI v5]

Thép, xi măng, phân bón, hoá chất. Doanh nghiệp mẫu: "công ty thép mẫu". Biên lợi nhuận gộp tính **theo từng quý** (§2.4).

| # | Bài | Loại |
|---|---|---|
| 1 | Tăng trưởng doanh thu · ở vật liệu cơ bản | Dạy lại |
| 2 | Biên lợi nhuận gộp · ở vật liệu cơ bản | Dạy lại |
| 3 | Margin Stability · ở vật liệu cơ bản | Dạy lại |
| 4 | Số ngày tồn kho · ở vật liệu cơ bản | Mới |
| 5 | Dự phòng giảm giá tồn kho / Tồn kho · ở vật liệu cơ bản | Mới |
| 6 | Vay ngắn hạn / Tồn kho · ở vật liệu cơ bản | Mới |
| 7 | Biên EBITDA · ở vật liệu cơ bản | Mới |
| 8 | Capex / Khấu hao · ở vật liệu cơ bản | Mới |
| 9 | Xây dựng dở dang / Tài sản cố định · ở vật liệu cơ bản | Mới |
| 10 | ROIC · ở vật liệu cơ bản | Dạy lại |
| 11 | Net Debt / EBITDA · ở vật liệu cơ bản | Dạy lại |
| 12 | Chi phí tài chính ngoài lãi vay / LNTT · ở vật liệu cơ bản | Mới |
| 13 | EV / EBITDA · ở vật liệu cơ bản | Dạy lại |
| 14 | P/B · ở vật liệu cơ bản | Dạy lại |

Công thức từng chỉ tiêu nằm trong bài học và trong `IQX-Dashboard-Phan-Tich-SPEC-v3.md` §8.

### 1.13 Nguyên tắc phát hành

- Một chương chỉ phát hành khi đủ bài và có bài thi.
- Thanh bên chỉ hiện chương đã phát hành. Tổng số bài và tiến độ chỉ tính bài bắt buộc (hiện là **203**).
- **[DECISION]** Có thể phát hành Chương 13–17 cùng lúc hoặc lần lượt. Nếu lần lượt, Dashboard vẫn hiện đủ chỉ tiêu của ngành, còn nút "Học" của chỉ tiêu chưa có bài thì theo quy tắc §6.3.

---

## 2. Bài học

### 2.1 Cấu trúc một bài chỉ tiêu (Chương 8–17)

Giữ v4 §2.1. Bài mới ở Chương 10–17 theo đúng thứ tự sau:

| # | Phần | Nội dung |
|---|---|---|
| 1 | Tiêu đề và đoạn mở đầu | Tiêu đề "Tên chỉ tiêu · mô tả ngắn". Đoạn mở 2–3 câu |
| 2 | "X là gì" | Hình công thức (tử số ÷ mẫu số = kết quả), mỗi ô ghi báo cáo và kỳ. Định nghĩa nói rõ **dòng nào trên báo cáo nào**, có mã dòng khi cần |
| 3 | Phần giải thích | Một hình và 3 ô, ví dụ "Lấy ở dòng nào", "Ở bất động sản khác gì" |
| 4 | **Biểu đồ đại diện** | Đúng khuôn và đúng biểu đồ trên Dashboard, số liệu doanh nghiệp mẫu, 8 quý gần nhất (khuôn F: 2 năm theo ngày). 3 ô: Đường phía trên · Cột phía dưới · Đọc cùng nhau |
| 5 | Đọc chỉ tiêu | Hai ô Tốt / Yếu có mức tham khảo, **ghi rõ là tham khảo**. Một đoạn bổ sung. Có thể thêm hình so sánh ghi "số minh họa" |
| 6 | Cách sử dụng | 3 ô |
| 7 | Ví dụ cụ thể | Số liệu doanh nghiệp mẫu, tính từng bước, dạng bảng hoặc danh sách. **Số khớp biểu đồ đại diện** |
| 8 | Sai lầm thường gặp | 3 ô |
| 9 | Phần theo ngành | Chương 13–17: "Theo từng mảng" (§2.3) |
| 10 | Tóm tắt | 4 ý, ý đầu là công thức |
| 11 | Nút "Làm bài kiểm tra" | (none) |

### 2.2 Bài dạy lại [MỚI v5]

- **Tiêu đề** bắt đầu bằng đúng tên chỉ tiêu trên Dashboard, sau đó là "· ở <ngành>". Ví dụ "ROE · ở ngân hàng". Cách đặt tên này để link nút Học tìm được bài.
- **Phần 2** là "Nhắc lại công thức": một đoạn ngắn, gợi ý bài gốc bằng **tên bài**, không nhắc số chương.
- **Phần 3** là "Ở <ngành> khác gì": dòng nào trên báo cáo của ngành, vì sao số khác doanh nghiệp thường.
- **Từ phần 4 trở đi viết mới cho ngành**: biểu đồ đại diện có thể khác khuôn bài chung, mức tham khảo riêng của ngành, sai lầm riêng của ngành.
- **Không chép lại quá một đoạn** từ bài chung. Bài kiểm tra không trùng câu với bài chung.

### 2.3 Phần "Theo từng mảng" ở Chương 13–17 [MỚI v5]

Đặt ngay trước Tóm tắt, gồm 2 hoặc 3 thẻ:

| Chương | Tiêu đề phần | Các thẻ |
|---|---|---|
| 13 · Bất động sản | Nhà ở và khu công nghiệp | Nhà ở · Khu công nghiệp |
| 14 · Dầu khí | Theo từng mảng | Thượng nguồn và dịch vụ · Trung nguồn · Hạ nguồn |
| 15 · Bán lẻ và tiêu dùng | Bán lẻ và hàng tiêu dùng | Chuỗi bán lẻ · Sản xuất hàng tiêu dùng |
| 16 · Điện và tiện ích | Theo loại nguồn điện | Thủy điện · Nhiệt điện · Tái tạo và nước |
| 17 · Vật liệu cơ bản | Theo từng mảng | Thép · Xi măng · Phân bón và hoá chất |

Phần có 2 thẻ dùng lưới 2 cột (class `three two` trong bản mẫu). Ở màn hình hẹp, các thẻ xếp một cột.

### 2.4 Biểu đồ đại diện [MỚI v5]

- Bài mới vẽ biểu đồ đại diện **trực tiếp** bằng cùng mã vẽ của Dashboard, không dùng ảnh chụp tĩnh. Bản mẫu chép `build()`, `panel()`, `hover()` của Dashboard vào Học viện, chỉ bỏ nút "Bảng số".
  - Biểu đồ vẽ khi bài được mở, vẽ lại khi đổi kích thước cửa sổ. Rê chuột hiện hộp số liệu như Dashboard.
  - Dữ liệu biểu đồ của từng bài nằm trong `REPD` của bản mẫu. Bản thật có thể lưu cùng nội dung bài.
- 62 bài cũ giữ ảnh chụp tĩnh như v4. **[DECISION]** Có thể chuyển dần sang vẽ trực tiếp để đồng nhất.
- Khuôn của các bài dạy lại theo Dashboard v3 §8:
  - ROE ở ngân hàng, chứng khoán, bảo hiểm: 2 đường ROE và ROA, cột bên dưới là đòn bẩy (tổng tài sản bình quân ÷ vốn chủ bình quân).
  - Biên lợi nhuận ròng ở bảo hiểm: cột bên dưới là lợi nhuận bảo hiểm và lợi nhuận đầu tư.
  - Biên lợi nhuận gộp ở dầu khí và vật liệu cơ bản: **tính từng quý**, cột chồng giá vốn và lợi nhuận gộp của quý.

### 2.5 Hình minh họa [MỚI v5]

- Bài mới dùng 5 loại hình vẽ bằng SVG, chung một thư viện (`FIG` trong bản mẫu):
  - `formula`: các ô công thức nối bằng dấu.
  - `hbar`: thanh ngang so sánh, có thể có ghi chú cuối hình.
  - `stack`: thanh chồng 100% và chú giải.
  - `wf`: thác nước, đi từ một số tổng qua các bước cộng trừ.
  - `lines`: danh sách dòng báo cáo kèm mã dòng.
- Khung rộng 760, chiều cao tự tính. Hiển thị đúng ở 390px.
- Hình so sánh ghi "số minh họa" trong tiêu đề hình.

### 2.6 Nguyên tắc trình bày

Giữ v4 §2.2. Bổ sung cho Chương 10–17 [MỚI v5]:
- **Chỉ dùng số trên 3 báo cáo tài chính**, ghi tên dòng và mã dòng khi cần. Không dùng số thuyết minh.
  - Những khái niệm cần thuyết minh hoặc tài liệu công ty (quỹ đất, doanh số bán hàng, sản lượng, giá dầu, số cửa hàng, giá trị hợp đồng đã ký) chỉ nhắc để giải thích bối cảnh, **không dùng làm chỉ tiêu để tính**.
- **Ghi rõ giới hạn** của chỉ tiêu khi cần. Ví dụ:
  - Người mua trả tiền trước chỉ ước lượng doanh thu tương lai, không phải doanh số bán hàng.
  - Kỳ báo cáo lưu chuyển tiền tệ lập theo phương pháp trực tiếp không có dòng khấu hao, nên biểu đồ để trống kỳ đó.
- Doanh nghiệp mẫu gọi bằng tên chung, không nêu mã thật (§1.8–§1.12).
- **Không nhắc số chương** trong nội dung bài và câu hỏi. Khi cần nhắc bài khác thì dùng tên bài.
- Kỳ dữ liệu ví dụ: Q3/24 đến Q2/26, năm 2021 đến 2025.

---

## 3. Bài kiểm tra và bài thi

Giữ v4 §3 và v4.1. Bổ sung [MỚI v5]:

| | Bài kiểm tra | Bài thi |
|---|---|---|
| Bài mới | 5 câu, 3 phương án, 1 đáp án đúng | (none) |
| Câu bắt buộc | 1 câu về cách đọc biểu đồ đại diện. Bài dạy lại có ít nhất 2 câu về điểm riêng của ngành | (none) |
| Chương 10 | (none) | Giữ 22 câu cũ, **thay 8 câu** bằng câu về 4 bài dạy lại |
| Chương 11 | (none) | Giữ 22 câu cũ, **thay 8 câu** |
| Chương 12 | (none) | Giữ 24 câu cũ, **thay 6 câu** |
| Chương 13–17 | (none) | **30 câu soạn mới** mỗi chương, mỗi bài khoảng 2 câu |

- Phương án sai phải hợp lý và có độ dài tương đương phương án đúng.
- Không cần tính toán.
- Câu thi không lặp nguyên văn câu kiểm tra.
- Danh sách câu đầy đủ (đáp án đúng là phương án đầu tiên, thứ tự được xáo khi hiển thị) nằm trong mảng `IT` của bản mẫu.

---

## 4. Tiến độ, công cụ và xu

- Tiến độ "x / 203". Phòng tập không tính.
- Xu: +100 mỗi bài đạt lần đầu, Phòng tập +100, bài thi 0.

  | Mục | Giá trị |
  |---|---|
  | Toàn bộ 203 bài | 20.300 xu |
  | Toàn bộ 203 bài và Phòng tập | 20.400 xu |

- Thanh bên: "Học viện", "203 bài học". Tên chương "Chương c · Tên chương" theo số đã đánh lại của v4.1.
- Công cụ vẫn không gắn với Học viện (v4 §4.2).

---

## 5. Dữ liệu và chuyển đổi

### 5.1 Nội dung

- **Catalog:** 17 chương · 203 bài + 1 bài tự chọn + 17 bài thi.
- **Khoá chỉ tiêu của bài** [MỚI v5]: đổi từ `metric_key` sang cặp **(`metric_key`, `nganh`)**.
  - Bài Chương 8: `nganh = chung`.
  - Bài Chương 9–17: `nganh` là mã ngành của chương (§7).
  - Một `metric_key` có thể có nhiều bài, ví dụ `ROE` có 4 bài: `chung`, `nh`, `ck`, `bh`.
- **Giữ nguyên `lesson_id` của 116 bài v4.** Chỉ đổi `order` ở Chương 10–12 vì có bài chen vào.
- 87 bài mới có `lesson_id` mới.
- Tăng `content_version`:
  - 17 bài Chương 8: đổi tiêu đề phần và thêm dòng "Có bài riêng".
  - 9 bài Chương 9: thêm phần "Ở các ngành".
  - Bài thi Chương 10, 11, 12: đổi câu hỏi.
- Dữ liệu biểu đồ đại diện của bài mới: đối tượng biểu đồ cùng cấu trúc Dashboard (`kind`, `unit`, `labels`, `main`, `sub`, `ref`), lưu cùng bài.

### 5.2 Chuyển đổi từ v4

1. Bài đã đạt giữ nguyên, kể cả bài Chương 10–12 bị đổi số thứ tự.
2. Bài thi Chương 10–12 đã đạt: **[DECISION]** đề xuất giữ trạng thái đạt, vì 73% câu hỏi không đổi. Phương án khác: yêu cầu thi lại.
3. Xu đã nhận giữ nguyên.
4. Người dùng thấy 87 bài mới ở trạng thái chưa học.

---

## 6. Link vào thẳng một bài [MỚI v5]

### 6.1 Định dạng

- Bản mẫu: `#bai=<tên chỉ tiêu>&nganh=<mã ngành>`. Tham số `nganh` có thể bỏ.
- Bản thật: tuỳ router, ví dụ `/hoc-vien/bai/<metric_key>?nganh=<mã ngành>`.
- API gợi ý: `GET academy/link?metric=<metric_key>&nganh=<mã ngành>` trả `lesson_id` và `locked` (v4.1).

### 6.2 Cách tìm bài

Tiêu đề bài khớp khi bằng đúng tên, hoặc bắt đầu bằng `tên + " ·"`. Tìm lần lượt:
1. Trong chương của ngành (`nganh`).
2. Trong Chương 8.
3. Trong mọi chương.

Không tìm thấy: mở bài đang học gần nhất, không báo lỗi.

| Link | Mở bài |
|---|---|
| `#bai=ROE&nganh=nh` | ROE · ở ngân hàng (Chương 10) |
| `#bai=ROE&nganh=thuong` | ROE (Chương 8), vì Chương 9 không dạy lại ROE |
| `#bai=Tăng trưởng doanh thu&nganh=bds` | Tăng trưởng doanh thu · ở bất động sản (Chương 13) |
| `#bai=Revenue CAGR 3Y&nganh=dien` | Revenue CAGR 3Y (Chương 8) |
| `#bai=NIM` | NIM (Chương 10) |

### 6.3 Dùng bởi

- Nút "Học" của Dashboard phân tích v3 luôn gửi kèm ngành của mã đang xem.
- **Đảm bảo:** cả 260 cặp (chỉ tiêu, ngành) trên Dashboard v3 đều tìm được bài trong Chương 8 hoặc chương của ngành. Bản mẫu đã kiểm tra đủ 260 cặp.
- Liên kết "Có bài riêng" ở Chương 8 và "Ở các ngành" ở Chương 9 cũng dùng định dạng này.

---

## 7. Mã ngành

| Mã | Ngành | Chương |
|---|---|---|
| `chung` | Mọi ngành | 8 |
| `thuong` | Doanh nghiệp sản xuất | 9 |
| `nh` | Ngân hàng | 10 |
| `ck` | Chứng khoán | 11 |
| `bh` | Bảo hiểm | 12 |
| `bds` | Bất động sản | 13 |
| `dk` | Dầu khí | 14 |
| `bl` | Bán lẻ và tiêu dùng | 15 |
| `dien` | Điện và tiện ích | 16 |
| `vl` | Vật liệu cơ bản | 17 |

Cách xác định ngành của một mã nằm ở spec Dashboard v3 §1.3.

---

## 8. Liên kết với các phần khác

| Phần | Nội dung |
|---|---|
| Dashboard phân tích v3 | 9 ngành, cùng tên chỉ tiêu, cùng khuôn biểu đồ đại diện. Nút "Học" dùng §6 |
| Spec bổ sung v4.1 | Cấu hình theo trưởng nhóm, áp dụng cho 17 chương (§9) |
| Spec quản trị | Tab Học viện: tiến độ x / N theo cấu hình, N tối đa 203 |
| Tổng quan sản phẩm | Cập nhật "17 chương · 203 bài", tối đa 20.400 xu từ Học viện |

---

## 9. Cập nhật cho spec bổ sung v4.1

- Danh sách chương trong màn cấu hình: **17 chương**.
- Cảnh báo khi bỏ chương chỉ tiêu (v4.1 §4): áp dụng cho Chương 8–17.
- **Cấu hình mặc định:** đề xuất Học tự do, đủ 17 chương.
- **Cấu hình riêng đang có của các nhóm** [DECISION]: đề xuất **không tự thêm** Chương 13–17. Quản trị viên tự bật cho từng nhóm. Lý do: nhóm Học lần lượt sẽ không bị chèn chương mới vào giữa chuỗi đang học.
- **Nút Học khi nhóm không có chương ngành** [DECISION]: đề xuất mở bài cùng tên ở Chương 8 nếu nhóm có Chương 8. Nếu không có cả hai, giữ quy tắc v4.1: quản trị viên chịu trách nhiệm cấu hình đủ bài.
- Ví dụ đánh số lại: nhóm bỏ Chương 2 có "Chương 12 · Phân tích công ty bất động sản" và tổng N = 203 − 10 = 193.

---

## 10. Tiêu chí nghiệm thu

1. **Thanh bên:** Chương 1–17 với tên ở §1.1, "203 bài học", tiến độ "x / 203".
2. **Chương 8:** 17 bài như v4. Không còn tiêu đề "Với ngân hàng, chứng khoán, bảo hiểm". 8 bài có dòng "Có bài riêng" với liên kết mở đúng bài.
3. **Chương 9:** 16 bài như v4. 9 bài có phần "Ở các ngành" trước Tóm tắt.
4. **Chương 10–12:** đúng 15, 14, 11 bài theo thứ tự §1.5–§1.7. Bài thi mỗi chương 30 câu.
5. **Chương 13–17:** đúng 19, 15, 13, 15, 14 bài theo thứ tự §1.8–§1.12. Mỗi bài có đủ các phần §2.1, biểu đồ đại diện vẽ được, bài kiểm tra 5 câu. Mỗi chương có bài thi 30 câu.
6. **Bài dạy lại:** tiêu đề dạng "Tên chỉ tiêu · ở <ngành>".
7. **Link bài:** các ví dụ ở §6.2 mở đúng bài. Mọi chỉ tiêu trên Dashboard v3 của cả 9 ngành mở được bài.
8. **Biểu đồ đại diện:** khớp khuôn Dashboard. Biên gộp ở dầu khí và vật liệu cơ bản tính từng quý. ROE ở ngân hàng, chứng khoán, bảo hiểm có 2 đường.
9. **Tiến độ cũ:** người đã đạt "NIM" ở v4 thấy NIM đã hoàn thành ở vị trí Chương 10 Bài 2.
10. **Nội dung:** không câu nào nhắc "Chương <số>". Không dùng số thuyết minh.
11. **Hiển thị:** không chữ xám, không hình trống, không tràn ngang ở 390px.

---

## 11. Điểm cần chốt

1. Phát hành Chương 13–17 cùng lúc hay lần lượt (§1.13).
2. Chuyển 62 biểu đồ đại diện cũ sang vẽ trực tiếp (§2.4).
3. Giữ trạng thái đạt bài thi Chương 10–12 cũ hay yêu cầu thi lại (§5.2).
4. Thêm Chương 13–17 vào cấu hình riêng đang có (§9).
5. Nút Học khi nhóm không có chương ngành (§9).
6. **Rà nội dung 87 bài mới trước khi phát hành.** Nên có người làm tài chính duyệt, nhất là:
   - Các mức tham khảo trong phần "Đọc chỉ tiêu".
   - Mã dòng báo cáo (theo mẫu B01, B02, B03-DN, Thông tư 200).
   - Số liệu doanh nghiệp mẫu là số tự sinh, khớp với biểu đồ đại diện nhưng không phải số của doanh nghiệp thật.

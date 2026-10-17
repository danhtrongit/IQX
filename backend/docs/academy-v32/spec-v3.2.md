# Spec Học viện IQX · v3.2

> Phiên bản: 3.2 · Ngày: 2026-10-16
>
> **Thay thế:**
> - Spec Học viện v3.0 và v3.1.
> - Cấu trúc chương và bài của Đề cương v2 (22 chương · 84 bài).
> - Danh mục cũ đang chạy trên web (13 chương · 71 bài).
>
> **Danh mục chi tiết:** `Hoc-vien/IQX-Hoc-Vien-Danh-Muc-v3.md`.
>
> **Bản mẫu:**
> - `IQX-Hoc-Vien-v3-MAU.html`: Học viện với 5 chương đã phát hành, chạy đúng quy tắc mở khoá. Khi mới mở chỉ vào được Chương 1 Bài 1. Muốn xem lại từ đầu thì xoá khoá `iqx_hv7` và `iqx_hv7t` trong localStorage.
> - `IQX-Hoc-Vien-v3-XEM.html`: cùng nội dung nhưng mở sẵn mọi bài, chỉ để duyệt nội dung. Không dùng làm chuẩn cho quy tắc mở khoá.
>
> **Quy ước:** **[THAY ĐỔI]** là điểm khác với hệ thống đang chạy. **[MỚI v3.2]** là điểm mới so với spec v3.1. **[DECISION]** là điểm chủ sản phẩm cần chốt.

---

## 0. Tóm tắt thay đổi

### 0.1 So với hệ thống đang chạy

| # | Hạng mục | Hiện tại | v3.2 |
|---|---|---|---|
| 1 | Cấu trúc | 13 chương · 71 bài | **14 chương · 94 bài**, cộng 1 bài tự chọn (Phòng tập thực chiến) |
| 2 | Phát hành | Hiện toàn bộ danh mục | **Chỉ hiện các chương đã phát hành.** Hiện có Chương 1–5 (43 bài và 1 bài tự chọn). Chương sau làm xong thì bổ sung |
| 3 | Kỹ năng bán hàng | Không có | **Chương 2 · Kỹ năng Sale SACO** (10 bài) và **Chương 3 · Thương hiệu cá nhân** (9 bài). Tạm thời mở cho mọi người |
| 4 | Bài kiểm tra sau mỗi bài | 8 câu, đúng 8/8 | **Chương 1–3: 3 câu. Chương 4 trở đi: 5 câu.** Phải đúng hết |
| 5 | Bài thi cuối chương | Không có | **Mới.** Chương 1–3: 20 câu. Chương 4 trở đi: 30 câu. **Phải đúng hết mới đạt** |
| 6 | Màn hình kết quả | Có giải thích từng phương án | **Chỉ hiện điểm** và Đạt / Chưa đạt. Không hiện đáp án |
| 7 | Thứ tự học | Học tự do, không khoá | **Học theo thứ tự**: xong bài trước mới mở bài sau, đạt bài thi chương trước mới mở chương sau |
| 8 | Bài hướng dẫn | Đọc xong bấm "Hoàn thành bài học" | Có bài kiểm tra như bài thường |
| 9 | Backtest và Bộ lọc | 12 bài hướng dẫn rải ở 2 chương | Gộp thành **7 bài ở Chương 6** |

### 0.2 So với spec v3.1 [MỚI v3.2]

| # | Hạng mục | v3.1 | v3.2 |
|---|---|---|---|
| 1 | Chương mới | (none) | **Chương 3 · Thương hiệu cá nhân** (9 bài và bài thi 20 câu). Các chương sau lùi một số: Kỹ thuật thành 4, Cơ bản thành 5, Backtest và Bộ lọc thành 6… |
| 2 | Phòng tập thực chiến | Bài 11 của Chương 2, bắt buộc | **Bài tự chọn, nằm sau Bài thi Chương 3.** Mở khi đạt bài thi Chương 3. Không chặn Chương 4 (§4.1) |
| 3 | Mức đạt bài thi | 16/20, 24/30 | **Đúng hết: 20/20, 30/30** |
| 4 | Tình huống ở Chương 2–3 | Không ảnh hưởng tiến độ | **Phải chọn tình huống mới mở được bài kiểm tra** (§2.3) |
| 5 | Bài thi Chương 2 | Có 4 câu lấy từ các case của Phòng tập | Thay bằng 4 câu theo nội dung Bài 2, 7, 9, 10, vì Phòng tập giờ mở sau Chương 3 |
| 6 | Màu chữ | Chữ mô tả trong thẻ dùng màu trắng | **Không dùng chữ xám ở bất kỳ đâu trong nội dung bài**, kể cả chữ trên biểu đồ và nút đang khoá |

---

## 1. Cấu trúc khoá học

### 1.1 Danh mục

| Chương | Tên | Số bài | Mở công cụ | Trạng thái |
|---|---|---|---|---|
| 1 | Nền tảng | 10 | (none) | **Đã phát hành** |
| 2 | Kỹ năng Sale SACO | 10 | (none) | **Đã phát hành** |
| 3 | Thương hiệu cá nhân | 9, cộng Phòng tập thực chiến (tự chọn) | (none) | **Đã phát hành** |
| 4 | Phương pháp kỹ thuật | 10 | Bài 4–8 mở 5 chỉ báo | **Đã phát hành** |
| 5 | Phương pháp cơ bản | 4 | (none) | **Đã phát hành** |
| 6 | Backtest và Bộ lọc | 7 | (none, bài hướng dẫn) | Đang soạn |
| 7 | Chỉ báo xu hướng | 4 | Backtest | Chưa soạn |
| 8 | Chỉ báo động lượng và dòng tiền | 7 | Backtest | Chưa soạn |
| 9 | Tốc độ tăng trưởng | 6 | Bộ lọc | Chưa soạn |
| 10 | Độ ổn định | 5 | Bộ lọc | Chưa soạn |
| 11 | Hiệu quả và biên lợi nhuận | 7 | Bộ lọc | Chưa soạn |
| 12 | Nợ và khả năng thanh toán | 4 | Bộ lọc | Chưa soạn |
| 13 | Dòng tiền | 5 | Bộ lọc | Chưa soạn |
| 14 | Định giá | 6 | Bộ lọc | Chưa soạn |
| | **Tổng** | **94**, cộng 1 bài tự chọn | 16 chỉ báo kỹ thuật, 33 chỉ tiêu cơ bản | |

### 1.2 Năm chương đã phát hành

**Chương 1 · Nền tảng (10 bài)**
1. Đầu tư chứng khoán
2. Thị trường và các sàn
3. Cơ chế giao dịch
4. T+2, phí, thuế và margin
5. Cổ phiếu và trái phiếu
6. Quỹ, ETF, chứng quyền và phái sinh
7. Quyền cổ đông và sự kiện doanh nghiệp
8. Chu kỳ kinh tế và lãi suất
9. Bốn pha của thị trường
10. Quản trị rủi ro và tâm lý đầu tư

**Chương 2 · Kỹ năng Sale SACO (10 bài)**
1. SACO là ai và làm gì
2. Hiểu khách hàng
3. Tìm khách hàng
4. Mở lời tiếp cận
5. Tư vấn: hỏi đúng, nghe nhiều
6. Bán giá trị bạn đồng hành
7. Xử lý từ chối
8. Chốt và kích hoạt khách
9. Chăm sóc và giới thiệu
10. Nguyên tắc nghề và lịch làm việc mỗi ngày

**Chương 3 · Thương hiệu cá nhân (9 bài và 1 bài tự chọn)** [MỚI v3.2]
1. Vì sao SACO cần thương hiệu cá nhân
2. Định vị và hình ảnh
3. Thương hiệu offline
4. Hệ sinh thái online
5. Thương hiệu trên Facebook cá nhân
6. Thương hiệu trên Zalo
7. Thương hiệu trên TikTok và Reels
8. Livestream và hội nhóm
9. Tám sai lầm và kế hoạch 100 ngày
- Bài thi Chương 3
- **Phòng tập thực chiến** (tự chọn, sau bài thi)

**Chương 4 · Phương pháp kỹ thuật (10 bài)**
1. Biểu đồ nến
2. Xu hướng
3. Hỗ trợ và kháng cự
4. **Khối lượng**
5. **MA · đường trung bình**
6. **RSI**
7. **MACD**
8. **Bollinger Bands**
9. Fibonacci
10. Sóng Elliott

Các bài in đậm mở chỉ báo tương ứng trong Bot, Backtest và Cảnh báo khi đạt bài kiểm tra.

**Chương 5 · Phương pháp cơ bản (4 bài)**
1. Đầu tư định kỳ (DCA)
2. Đầu tư giá trị
3. Phương pháp 4M
4. CANSLIM

### 1.3 Nguyên tắc phát hành

1. **Theo chương:** một chương chỉ phát hành khi đủ mọi bài và có bài thi cuối chương.
2. **Thanh bên** liệt kê mọi chương đã phát hành. Không hiện chương chưa phát hành.
3. **Tổng số bài** ở đầu thanh bên và thanh tiến độ chỉ tính bài bắt buộc đã phát hành. Hiện tại là "43 bài học" và "x / 43". Phòng tập thực chiến không tính vào tổng.
4. **Khi phát hành chương mới:**
   - Tổng số bài tăng lên.
   - Người đã đạt bài thi của chương cuối hiện có thấy Bài 1 của chương mới ở trạng thái "Học bài".
5. **[DECISION] Người được xem Chương 2 và Chương 3.**
   - Tạm thời: mở cho mọi người trải nghiệm.
   - Sau này: có thể gắn theo trưởng nhóm, ví dụ chỉ hiện với người dùng thuộc nhóm. Khi đó cần chốt lại thứ tự học của người không thấy hai chương này.

---

## 2. Bài học

### 2.1 Cấu trúc một bài

1. **Tiêu đề và đoạn mở đầu.**
2. **Các phần nội dung.** Mỗi phần có tiêu đề và hình minh họa: biểu đồ, sơ đồ, thẻ so sánh, bảng.
3. **Bắt buộc từ Chương 6:**
   - Phần **Cách sử dụng**.
   - **Ví dụ cụ thể** có số liệu.
   - **Sai lầm thường gặp**.
4. **Bắt buộc từ Chương 7:** phần **Áp dụng vào công cụ**.
   - Chỉ báo kỹ thuật: đặt điều kiện trong Backtest.
   - Chỉ tiêu cơ bản: đặt ngưỡng trong Bộ lọc.
   - Dùng đúng tên nút và quy tắc của spec Bot v1.1: bản nháp, Chạy, Lưu cho Bot, Giữ tối đa 30 phiên (3–250), T+2, không có cắt lỗ hay chốt lời tự động.
5. **Tóm tắt** dạng danh sách ngắn.
6. **Nút "Làm bài kiểm tra"** ở cuối bài. Đạt rồi thì nút đổi thành "✓ Đã hoàn thành" và không bấm được.

### 2.2 Nguyên tắc trình bày

| Nguyên tắc | Chi tiết |
|---|---|
| Hình trước, chữ sau | Mỗi ý chính có hình minh họa. Biểu đồ kỹ thuật dùng dữ liệu giả định, tính bằng công thức thật (RSI Wilder 14, MACD 12/26/9, Bollinger 20 ± 2σ…) |
| Không tương tác trong bài | Không có thanh kéo, ô nhập hay câu hỏi chen giữa bài. Tương tác chỉ ở bài kiểm tra. **Ngoại lệ: Chương 2 và 3** (§2.3) |
| Không đặt câu hỏi trong nội dung | Kể cả nhãn trên hình. Ngoại lệ: Chương 2 và 3 |
| Không linh vật, không đánh số khung hình, không chú thích nhỏ dưới hình | Riêng Chương 2 giữ nguyên các nhãn của tài liệu gốc: "Số liệu giả định để minh họa", "Tỷ lệ giả định để minh họa", chú thích chính sách DNSE (Bài 1, 6), "Mục tiêu tham khảo, điều chỉnh theo trưởng nhóm" (Bài 10) |
| Màu chữ [MỚI v3.2] | **Không dùng chữ xám.** Chữ thân bài dùng trắng (`--text`). Chữ phụ, nhãn trên biểu đồ, chữ trong ô tự làm, chữ trên nút đang khoá dùng trắng nhạt `#dbe7f3` / `#c9d6e4`. Màu xám chỉ được dùng cho nền, viền, cột biểu đồ, không dùng cho chữ |
| Giọng văn | Chuyên nghiệp, câu ngắn. Thuật ngữ tiếng Anh kèm nghĩa tiếng Việt. Không hứa lợi nhuận, không gợi ý mã cụ thể |
| Đúng quy định Việt Nam | Cổ phiếu mua về tài khoản chiều T+2 (T+2.5), tiền bán về T+2. Biên độ ±7% HOSE, ±10% HNX, ±15% UPCoM |

### 2.3 Riêng Chương 2 và Chương 3: phần tương tác

Chương 2 và 3 là giáo án thực hành, nên **giữ các phần tương tác**:

| Thành phần | Có ở | Cách hoạt động | Bắt buộc? |
|---|---|---|---|
| **Tình huống** | Mọi bài của Chương 2 và 3 (19 bài) | Một tình huống thực tế, câu "Bạn sẽ chọn cách nào?" và 3 phương án. Chọn xong thì hiện ngay phương án đúng, phương án đã chọn nếu sai, và lời giải thích. Chỉ chọn được một lần | **Có** [MỚI v3.2] |
| **Bài tự làm** | Chương 2: Bài 2–7. Chương 3: Bài 1–9 | Ô viết câu trả lời, tự lưu | Không |
| **Việc làm ngay** | Chương 2: Bài 1, 3, 4, 8, 9, 10. Chương 3: Bài 3, 5, 6, 7, 8 | Danh sách việc làm ngoài đời, có ô đánh dấu, tự lưu | Không |
| **Tự kiểm tra / Tự chấm** | Chương 3: Bài 2 (hồ sơ), Bài 9 (thương hiệu) | Danh sách ô đánh dấu, hiện số đã đạt "x/N" | Không |
| **Máy tính thu nhập** | Chương 2 Bài 1 | Nhập số khách còn giao dịch và giá trị giao dịch mỗi khách mỗi tháng, ra thu nhập ước tính theo phí 0,15% và tỉ lệ chia 70% | Không |

**Quy tắc Tình huống [MỚI v3.2]:**
1. Nút "Làm bài kiểm tra" của bài **bị khoá cho tới khi người học chọn một phương án** ở phần Tình huống.
   - Khi đang khoá, nút ghi: "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra".
   - Chọn đúng hay sai đều mở nút. Không cần chọn lại cho đúng, vì lời giải thích đã hiện ngay sau khi chọn.
2. **Lưu lựa chọn theo tài khoản.** Học lại trên máy khác hoặc tải lại trang vẫn thấy phương án đã chọn và lời giải thích. Nút kiểm tra vẫn mở.
3. **Server kiểm tra:** gọi làm bài kiểm tra của bài Chương 2–3 khi chưa có lựa chọn tình huống thì trả 403 `ACADEMY_SCENARIO_REQUIRED`.
4. Tình huống **không tính điểm**, không ảnh hưởng điểm bài kiểm tra.
5. Đáp án tình huống được phép gửi xuống trình duyệt vì là nội dung bài giảng. Quy tắc không lộ đáp án (§3.2) chỉ áp dụng cho bài kiểm tra và bài thi.

**Các phần khác:**
- Bài tự làm, việc làm ngay, tự kiểm tra **không ảnh hưởng tiến độ**.
- **[DECISION] Nơi lưu bài tự làm và việc làm ngay.** Bản mẫu lưu trên trình duyệt (`iqx_hv7t`, chung khoá với lựa chọn tình huống). Bản thật nên lưu theo tài khoản, để học trên máy khác không mất và để trưởng nhóm có thể xem sau này.
- **[DECISION] Số liệu chính sách:** phí 0,15% và SACO nhận 70% ghi "theo ví dụ trong tài liệu đào tạo, chính sách thực tế theo công bố của DNSE". Cần xác nhận lại trước khi phát hành.

### 2.4 Phòng tập thực chiến [MỚI v3.2]

**Vị trí:** cuối Chương 3, ngay sau Bài thi Chương 3.

**Nội dung:**
| Thành phần | Cách hoạt động |
|---|---|
| **4 hồ sơ khách** | Khách mới sợ rủi ro, khách thua lỗ nặng, khách giàu nhưng không có thời gian, khách thích lướt sóng. Mỗi hồ sơ có thông tin, tâm lý, câu khách hay nói |
| **Bạn tự phân tích trước** | Mỗi hồ sơ có 4 câu gợi ý, **mỗi câu một dòng, chữ cỡ 15px, màu trắng**, và một ô viết câu trả lời |
| **Xem gợi ý phân tích** | Nút mở và ẩn phần mấu chốt, câu trả lời mẫu, hướng gợi ý, câu chốt, điều cần tránh |
| **Chấm điểm đóng vai** | 6 tiêu chí, mỗi tiêu chí 0–10 điểm, tổng 60. Từ 48 là "Sẵn sàng gặp khách thật", 36–47 là "Cần luyện thêm", dưới 36 là "Cần học lại" |
| **Bài kiểm tra** | 3 câu, phải đúng 3/3 |

**Quy tắc:**
1. **Mở khi đạt Bài thi Chương 3**, cùng lúc với Chương 4 Bài 1.
2. **Tự chọn:** không học Phòng tập vẫn học tiếp Chương 4 bình thường. Chương 4 Bài 1 chỉ cần Bài thi Chương 3, không cần Phòng tập.
3. Không có phần Tình huống chọn phương án, nên không có điều kiện ở §2.3.
4. **Đạt bài kiểm tra:** đánh dấu đã hoàn thành và **+100 xu** ở lần đầu.
5. **Không tính vào tiến độ** "x / 43" và không tính vào tổng số bài. Người không học Phòng tập vẫn đạt 43/43.
6. Thanh bên: hiện như một mục của Chương 3, sau "Bài thi Chương 3". Dòng định vị ghi "Chương 3 · Phòng tập thực chiến".

---

## 3. Bài kiểm tra và bài thi

### 3.1 Quy tắc

| | Bài kiểm tra sau mỗi bài | Bài thi cuối chương |
|---|---|---|
| Chương 1–3 | 3 câu, phải đúng **3/3** | 20 câu, phải đúng **20/20** |
| Chương 4 trở đi | 5 câu, phải đúng **5/5** | 30 câu, phải đúng **30/30** |
| Mở khi | Đạt mục trước (§4.1). Chương 2–3: có thêm điều kiện chọn tình huống (§2.3) | Đạt hết các bài bắt buộc của chương |
| Phần thưởng | +100 xu ở lần đạt đầu tiên | **Không cộng xu** |
| Làm lại | Không giới hạn | Không giới hạn |

### 3.2 Cách làm bài [THAY ĐỔI]

1. **Một câu mỗi màn hình.** Đầu màn hình có nhãn ("Bài kiểm tra" / "Bài thi Chương c"), số câu "Câu i/N" và dãy chấm tiến độ.
2. **Xáo trộn** thứ tự câu và thứ tự phương án mỗi lượt làm.
3. **Chọn phương án:** chọn xong mới bật nút "Câu tiếp theo". Câu cuối thì nút là "Nộp bài".
4. **Màn hình kết quả** chỉ hiện điểm "n/N" và nhãn **Đạt** / **Chưa đạt**. **Không hiện đáp án đúng, không hiện câu sai**, áp dụng cho cả bài kiểm tra và bài thi của mọi chương.
   - **Đạt:** nút "✓ Đã hoàn thành" và "Xem lại bài".
     - Bài mở chỉ báo hiện thêm nhãn "Đã mở chỉ báo X".
     - Bài thi hiện "Đã hoàn thành Chương c".
   - **Chưa đạt:** nút "Làm lại" và "Xem lại bài". Với bài thi là "Xem lại Chương c", đưa về Bài 1 của chương.
5. **Chấm điểm trên máy chủ** như hiện tại. Đáp án không gửi xuống trình duyệt trước khi nộp.
6. **Bỏ phần giải thích từng phương án** ở màn hình kết quả. Ngân hàng câu hỏi vẫn có thể giữ trường giải thích để dùng sau.

### 3.3 Màn hình giới thiệu bài thi

- Tiêu đề "Bài thi Chương c".
- Mô tả: "Bài thi gồm N câu hỏi về toàn bộ kiến thức Chương c. **Cần trả lời đúng tất cả câu hỏi để hoàn thành.**"
  - Chương 2: "…về toàn bộ kỹ năng sale của SACO trong Chương 2…".
  - Chương 3: "…về toàn bộ kiến thức thương hiệu cá nhân trong Chương 3…".
- Nút "Bắt đầu làm bài".

### 3.4 Ngân hàng câu hỏi đã có

| Chương | Kiểm tra sau bài | Bài thi |
|---|---|---|
| 1 | 10 × 3 câu | 20 câu |
| 2 | 10 × 3 câu | 20 câu. [MỚI v3.2] 4 câu về các case của Phòng tập được thay bằng 4 câu về: khoản tiết kiệm sắp đáo hạn (Bài 2), khách "về bàn với vợ" (Bài 7), tài khoản margin sắp bị gọi ký quỹ (Bài 9), tin đồn chưa xác thực (Bài 10) |
| 3 | 9 × 3 câu, Phòng tập 3 câu | 20 câu: 8 câu từ tài liệu gốc, 12 câu soạn mới theo nội dung từng bài |
| 4 | 10 × 5 câu | 30 câu |
| 5 | 4 × 5 câu | 30 câu |

Toàn bộ câu hỏi và đáp án nằm trong biến `IT` của bản mẫu (trường `q`: `[câu hỏi, [phương án], chỉ số đáp án đúng]`).

---

## 4. Tiến độ, mở khoá và xu

### 4.1 Thứ tự học [THAY ĐỔI]

1. **Một chuỗi liên tục:** các bài và bài thi xếp thành chuỗi qua mọi chương đã phát hành.
   - Chương 1 Bài 1 → … → Bài thi Chương 1 → Chương 2 Bài 1 → … → Bài thi Chương 3 → (Phòng tập thực chiến, tự chọn) → Chương 4 Bài 1 → … → Bài thi Chương 5.
2. **Quy tắc mở:**
   - Mục đầu tiên (Chương 1 Bài 1) luôn mở.
   - Mỗi mục mở khi **mục bắt buộc ngay trước nó** đã đạt. Mục tự chọn (Phòng tập) bị bỏ qua khi xét mục trước.
   - Hệ quả:
     - Trong một chương, xong bài trước mới mở bài sau.
     - Bài thi mở khi đạt hết các bài của chương.
     - **Đạt bài thi chương trước mới mở chương sau.**
     - Đạt Bài thi Chương 3 thì mở **cùng lúc** Phòng tập thực chiến và Chương 4 Bài 1.
3. **Trong một bài Chương 2–3:** bài đã mở nhưng nút kiểm tra chỉ bật khi đã chọn tình huống (§2.3).
4. **Thanh bên** hiện đủ các chương đã phát hành, kể cả chương chưa tới lượt.

| Trạng thái | Nút |
|---|---|
| Đã đạt | "Xem lại" |
| Đã mở, chưa đạt | "Học bài" (bài) / "Làm bài" (bài thi) |
| Chưa tới | Biểu tượng khoá và chữ "Chưa mở" |

5. Mục đang xem được tô sáng. Bấm mục đã đạt hoặc mục đã mở để vào. Mục khoá không bấm được.

### 4.2 Mở công cụ

| Bài | Mở chỉ báo |
|---|---|
| Chương 4 · Bài 4 Khối lượng | Khối lượng |
| Chương 4 · Bài 5 MA | MA |
| Chương 4 · Bài 6 RSI | RSI |
| Chương 4 · Bài 7 MACD | MACD |
| Chương 4 · Bài 8 Bollinger Bands | Bollinger Bands |

- **Học xong mới mở:** chỉ báo hoặc chỉ tiêu chỉ dùng được trong công cụ sau khi đạt bài kiểm tra của bài tương ứng.
- **Từ Chương 7**, mỗi bài mở 1 chỉ báo (Backtest) hoặc 1 chỉ tiêu (Bộ lọc).
- **Chương 6** là bài hướng dẫn, không mở công cụ. Các bài Bộ lọc vẫn được dạy dù lúc đó người học chưa mở chỉ tiêu cơ bản nào.
- **Mở xong không tự bật** chỉ báo trong Bot.

### 4.3 Xu

| Mục | Giá trị |
|---|---|
| Hoàn thành một bài lần đầu | +100 xu |
| Phòng tập thực chiến lần đầu | +100 xu |
| Bài thi cuối chương | 0 xu |
| Năm chương đã phát hành | 4.300 xu (43 bài), 4.400 xu nếu học cả Phòng tập |
| Toàn bộ 94 bài và Phòng tập | 9.500 xu |

- Ô xu trên thanh trên cập nhật ngay sau khi đạt.
- Bản mẫu bắt đầu ở 500 xu, coi như số dư sẵn có. Số này không thuộc quy tắc Học viện.

### 4.4 Giao diện chung

- **Thanh bên:**
  - Tiêu đề "Học viện", dòng "N bài học" (N = số bài bắt buộc đã phát hành, hiện là 43).
  - Ô "Tiến độ học tập x / N" kèm thanh tiến độ.
  - Tên chương in đậm, chữ trắng, dạng "Chương c · Tên chương".
- **Dòng định vị** ở góc phải trên bài: "Chương c · Bài n / Số bài của chương", "Bài thi Chương c", hoặc "Chương 3 · Phòng tập thực chiến".
- **Khi đang làm bài kiểm tra,** nội dung bài ẩn đi và chỉ hiện khung câu hỏi.

---

## 5. Dữ liệu và chuyển đổi

### 5.1 Nội dung

- **Gói nội dung:** giữ pipeline file JSON hiện có (spec quản trị v1.0 §4.3). Catalog đổi sang 14 chương · 94 bài và 1 bài tự chọn.
- **Cờ phát hành:** mỗi chương có cờ `published`. API chỉ trả các chương đã phát hành. Cờ `audience` để dành cho việc giới hạn người xem Chương 2–3 sau này.
- **Thông tin mỗi bài:**
  - `chapter`, `order`, `title`.
  - `optional` (true cho Phòng tập thực chiến) [MỚI v3.2].
  - `unlock`: khoá chỉ báo hoặc chỉ tiêu, hoặc null.
  - `scenario`: null, hoặc `{options, answer, explanation}` cho bài Chương 2–3 [MỚI v3.2].
  - `quiz`: danh sách câu, `pass` = số câu.
- **Thông tin mỗi bài thi:** `chapter`, `questions`, `pass_score` = số câu.
- **Phiên bản:** tăng `content_version` khi sửa lời giảng, tăng `question_version` khi sửa câu hỏi.

### 5.2 Tiến độ người học

| Bảng | Dùng cho v3.2 |
|---|---|
| `academy_attempts`, `academy_answers` | Mỗi lượt làm bài kiểm tra hoặc bài thi. Thêm `kind` ∈ {lesson, chapter_exam} |
| `academy_completions` | Bài hoặc bài thi đã đạt, thời điểm đạt |
| `lesson_rewards` | +100 xu lần đầu, chỉ cho `kind = lesson` (gồm cả Phòng tập) |
| `academy_grants` | Chỉ báo đã mở |
| **Mới:** `academy_scenario_choices` [MỚI v3.2] | `user_id`, `lesson_id`, `choice`, `created_at`. Một dòng mỗi bài, không sửa sau khi chọn |
| **Mới:** `academy_practice_notes` | Bài tự làm và việc làm ngay của Chương 2–3, theo tài khoản (nếu chốt lưu ở server, §2.3) |

**Mục được mở:**
- Server tự tính, không tin client: mục đầu tiên, hoặc mục bắt buộc ngay trước đã có trong `academy_completions`. Mục `optional` bị bỏ qua khi tìm mục trước.
- Gọi làm bài kiểm tra hoặc bài thi của mục chưa mở trả 403 `ACADEMY_ITEM_LOCKED`.
- Gọi làm bài kiểm tra của bài có `scenario` mà chưa có dòng trong `academy_scenario_choices` trả 403 `ACADEMY_SCENARIO_REQUIRED`.

**Tiến độ cấp cho tab Học viện** của trang quản trị (spec quản trị v1.1 §5.1.4):
- Mỗi bài: trạng thái, số lượt làm, kết quả gần nhất, thời điểm đạt. Phòng tập ghi rõ "Tự chọn".
- Bài đang học.
- Số bài bắt buộc đã hoàn thành trên tổng bài bắt buộc đã phát hành (hiện là x / 43).

### 5.3 Chuyển đổi từ danh mục cũ [DECISION]

**Đề xuất:**
1. **Chỉ báo đã mở** ở danh mục cũ giữ nguyên, không thu hồi.
2. **Tiến độ tính lại** theo danh mục mới. Bài cũ và bài mới trùng chỉ báo (RSI, MACD, MA, Bollinger, Khối lượng) được tính là đã đạt ở bài mới tương ứng. Các bài khác học lại.
   - Vì học theo thứ tự, người dùng cũ vẫn phải đi qua Chương 1–3 trước khi tới Chương 4.
3. **Xu đã nhận** giữ nguyên. Bài được tính đạt nhờ chuyển đổi không cộng thêm xu.
4. **Bài thi cuối chương** luôn phải làm mới.

---

## 6. Liên kết với các phần khác

| Phần | Nội dung liên quan |
|---|---|
| Spec Bot v1.1 | Lời giảng về Backtest, Bot ở Chương 6–8 phải khớp: bản nháp, Chạy, Lưu cho Bot, Giữ tối đa, T+2 |
| Spec quản trị v1.1 | Tab Học viện trong chi tiết người dùng của trưởng nhóm và quản trị viên. Cột "Học viện" ở danh sách người dùng: bài đang học và x / 43. Việc gắn Chương 2–3 theo trưởng nhóm sẽ bổ sung sau |
| Tổng quan sản phẩm | Cập nhật "13 chương · 71 bài", "bài thi 8 câu, 8/8" và "tối đa 6.200 xu" theo spec này |

---

## 7. Tiêu chí nghiệm thu

1. **Thanh bên và tiến độ:** hiện Chương 1–5, dòng "43 bài học". Tiến độ x / 43 và số xu khớp với số bài đã đạt.
2. **Thứ tự học:**
   - Người mới chỉ mở được Chương 1 Bài 1. Đạt bài kiểm tra thì mở bài kế tiếp.
   - Bài thi Chương 1 chỉ mở khi đạt đủ 10 bài.
   - Chương 2 Bài 1 chỉ mở khi đạt bài thi Chương 1. Tương tự cho các chương sau.
   - Gọi API làm bài của mục chưa mở trả 403.
3. **Phòng tập thực chiến:**
   - Trước khi đạt Bài thi Chương 3: Phòng tập và Chương 4 Bài 1 đều khoá.
   - Đạt Bài thi Chương 3: cả hai cùng mở.
   - Không học Phòng tập vẫn học được Chương 4 Bài 1 và các bài sau.
   - Đạt bài kiểm tra Phòng tập: +100 xu, tiến độ x / 43 không đổi.
   - Phần "Bạn tự phân tích trước": 4 câu, mỗi câu một dòng, chữ trắng 15px.
4. **Tình huống Chương 2–3:**
   - Mở bài, chưa chọn tình huống: nút ghi "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra" và không bấm được. Gọi API làm bài trả 403 `ACADEMY_SCENARIO_REQUIRED`.
   - Chọn một phương án, đúng hay sai: hiện giải thích, nút chuyển thành "Làm bài kiểm tra" và bấm được.
   - Tải lại trang hoặc đăng nhập máy khác: vẫn thấy phương án đã chọn, nút vẫn mở.
5. **Bài kiểm tra:**
   - Chương 1–3: đúng 2/3 là Chưa đạt, đúng 3/3 là Đạt.
   - Chương 4–5: đúng 4/5 là Chưa đạt.
   - Thứ tự câu và phương án khác nhau giữa hai lượt.
6. **Bài thi:**
   - Chương 1–3: 19/20 là Chưa đạt, 20/20 là Đạt.
   - Chương 4–5: 29/30 là Chưa đạt, 30/30 là Đạt.
   - Màn hình giới thiệu ghi "Cần trả lời đúng tất cả câu hỏi để hoàn thành."
   - Đạt bài thi không cộng xu.
7. **Không lộ đáp án:**
   - Màn hình kết quả của mọi bài kiểm tra và bài thi chỉ có điểm và Đạt / Chưa đạt.
   - Không có đáp án nào của bài kiểm tra hay bài thi gửi xuống trình duyệt trước khi nộp.
8. **Mở chỉ báo:** đạt bài 4–8 Chương 4 thì chỉ báo tương ứng dùng được ngay trong Backtest, Bot, Cảnh báo, và kết quả hiện "Đã mở chỉ báo X".
9. **Chương 2–3, các phần khác:**
   - Bài tự làm và việc làm ngay giữ nguyên sau khi tải lại trang.
   - Máy tính thu nhập, bộ đếm tự kiểm tra và thanh chấm điểm tính đúng.
10. **Hiển thị:**
    - Không có chữ xám trong nội dung bài, kể cả nhãn trên biểu đồ và nút đang khoá.
    - Đúng trên màn hình 390px, không tràn ngang. Biểu đồ hiện đủ, không đè chữ.

---

## 8. Các quyết định cần chủ sản phẩm chốt

1. Ai được xem Chương 2–3 sau giai đoạn trải nghiệm, và thứ tự học của người không thấy hai chương này (§1.3-5).
2. Lưu bài tự làm và việc làm ngay trên trình duyệt hay theo tài khoản (§2.3). Lựa chọn tình huống thì bắt buộc lưu theo tài khoản.
3. Xác nhận số liệu phí 0,15% và tỉ lệ chia 70% trong Chương 2 (§2.3).
4. Cách chuyển đổi tiến độ từ danh mục cũ (§5.3).

# IQX — ĐẶC TẢ TÍCH HỢP NỘI DUNG HỌC VIỆN CHƯƠNG 3
## v2.0 · Phân tích cơ bản nền tảng · Sáu bài · Bộ lọc · Xu học tập

**Phiên bản bàn giao:** 2.0.  
**Ngày biên soạn:** 08/10/2026.  
**Bộ đầu vào:** đúng hai file — `IQX-Hoc-Vien-Chuong-3-SPEC-v2.0.md` và `IQX-Hoc-Vien-Chuong-3-MAU-v2.0.html`.  
**Thay thế:** cặp Chương 3 v1.0 cho những lần tích hợp mới; không xóa lịch sử học của bản cũ.  
**Phạm vi:** ghép toàn văn sáu bài, công thức, biểu đồ và đề vào Học viện mới đang có; nối chấm bài, tiến độ, quyền sáu chỉ tiêu Bộ lọc và thưởng 100 xu hoàn thành lần đầu.  
**Không phải:** một đợt xây lại Bot, Học viện, Shop, mini luyện tập hoặc trang Chiến lược.  
**Trạng thái:** tài liệu giao việc và HTML xem thử; không chứng nhận repository, backend hay dữ liệu IQX đã được triển khai/kiểm thử.

> **ĐỌC TRƯỚC KHI CODE:** Nâng cấp trực tiếp Học viện hiện có. Đọc hết spec và đủ sáu bài/đề trong HTML. Giữ phần kiến thức và số liệu được bàn giao, không rút thành đề cương hoặc bỏ hình. Chương 3 dùng **8 câu/bài, đạt 8/8**, không dùng nút hoàn thành thủ công của Chương 2. Mỗi bài hoàn thành hợp lệ lần đầu mở đúng một chỉ tiêu Bộ lọc và nhận **100 xu**, không tự thêm tiêu chí, áp dụng danh mục hoặc bật giao dịch Bot. Giao diện Học viện chỉ có **Xem bài / ✓ Đã học**, catalog **13 chương/71 bài**. Tái sử dụng mô hình/hoạt ảnh linh thú đã có trên IQX; ảnh trong HTML chỉ là ví dụ, tuyệt đối không phải yêu cầu tạo lại linh thú.

---

## 0. Cách sử dụng, căn cứ và đánh giá thay đổi

### 0.1. Vai trò của hai file

| File | Vai trò |
|---|---|
| Spec Markdown này | Quy tắc tích hợp, định danh, chấm/tiến độ/quyền/xu, ranh giới dữ liệu thật, bảo toàn lịch sử, ca nghiệm thu. |
| HTML v2.0 đi kèm | Toàn văn **6 bài/24 phần**, **13 vị trí biểu đồ** với **14 định nghĩa hình**, **48 câu** và giải thích; giao diện/xử lý cục bộ để duyệt. |

Chủ sản phẩm chỉ cần gửi hai file này. Không yêu cầu thêm README, prompt, ZIP, ảnh, đáp án, dataset hoặc spec cũ như đầu vào bắt buộc. Các module được tạo khi dev tách code/content/test trong repository là đầu ra nội bộ, không phải file chủ sản phẩm phải chuẩn bị. Quyền truy cập repository, môi trường và dịch vụ thật vẫn cần có; không được giả đã tích hợp bằng cách mở HTML.

### 0.2. Đánh giá bộ cũ và quyết định của bản cập nhật

Bản Chương 3 v1.0 có nền nội dung phù hợp với sáu chỉ tiêu đã chốt: ý nghĩa, ví dụ tính, kỳ tính và vận dụng. Các ví dụ liên thông về doanh nghiệp A, tình huống thiếu dữ liệu, nền không dương, EPS và vốn bình quân vẫn giữ. Không thêm chỉ tiêu thứ bảy, không đưa mini luyện nến vào nhóm cơ bản.

| Điểm rà soát | Bản v1.0 | Xử lý v2.0 |
|---|---|---|
| Sáu bài/công thức/số liệu | Đã có toàn văn và hình riêng | Giữ kiến thức; **22/24 phần nguyên nội dung**, hai phần được bổ sung cầu nối như mục 0.3. |
| Ngân hàng đề | 48 câu, 10 câu chart, 8 câu bảng | **Giữ nguyên 48/48 object câu**, gồm câu, options, correct, explanation, chart/table/hint. |
| Hình và dataset | 13 vị trí trong bài, 14 định nghĩa | Giữ toàn bộ model, số liệu, loại hình và các đầu vào; chỉ tích hợp renderer vào khung mới. |
| Catalog | 18 chương/113 bài, một số công tắc cũ trong Học viện | **13 chương/71 bài** dùng chung; mọi dòng Học viện chỉ Xem bài/Đã học. |
| Khởi đầu | Workspace sau nở, V1/V2 | Không cổng trứng/cấp/tốt nghiệp. Dùng tên Bot thống nhất. |
| Quyền cơ bản | Hoàn thành → mở chỉ tiêu | Giữ; chỉ mở đúng chỉ tiêu, không mở chỉ báo kỹ thuật. |
| Thưởng học | Chưa có xu | Nối dịch vụ thưởng chung: +100 xu lần đầu, chống trùng qua các phiên bản bài. |
| Quan hệ với Bot | Tài liệu cũ giữ Săn mã nguồn Bot và stop L1 | Thay bằng VN30 mặc định hoặc danh mục Bộ lọc được áp dụng; Bot không còn stop/target/max holding ngầm. |
| Linh thú | Hình mẫu trong shell cũ | Dùng mô hình và lựa chọn người dùng đang có; Bạch Hổ chỉ là mặc định của tài khoản mới. |

Những tài liệu cũ về sau nở/V1/V2/stop L1/Săn mã nguồn Bot không còn là yêu cầu hiệu lực của bản đích. Không giữ luật cũ trong phần tích hợp hoặc ca nghiệm thu rồi chỉ thêm một dòng ưu tiên bản mới ở đầu.

### 0.3. Nhật ký chỉnh nội dung — không viết lại giáo trình

| Vị trí | Thay đổi có chủ đích |
|---|---|
| `ch03-l01` — phần 4 | Thêm một đoạn: đạt bài mở chỉ tiêu tại **Chiến lược → Bộ lọc**; học xong không tự thêm điều kiện hoặc đổi danh mục Bot. Các ví dụ >15%, dấu bằng, kỳ và nguồn dữ liệu giữ nguyên. |
| `ch03-l06` — phần 4 | Cập nhật câu dẫn sang Chương 4; thêm phân biệt Bộ lọc chọn tập mã mua mới, kỹ thuật quyết định giao dịch. Mô tả xác nhận áp dụng/phiên hiệu lực, VN30, quay lại VN30, vẫn xét Bán vị thế cũ và không tự chạy lại bộ lọc để sửa danh mục. |
| 22 phần còn lại | Giữ nguyên object phần nội dung. |
| 48 câu và tài nguyên của đề | Giữ nguyên; không thêm câu về Shop/xu/Bot để thay kiến thức tài chính. |
| Reader/kết quả | Ghép vào khung mới, thông báo xu và nút **Mở Bộ lọc**; không thêm form hoặc công tắc trong bài. |

HTML v2.0 **không phải bản sao nguyên byte** của HTML v1.0. Có `ch3-change-manifest` mô tả phạm vi bảo toàn, cùng hash ở cuối spec. Chỉnh DOM/lifecycle không có quyền đổi số học hoặc dữ liệu đã duyệt.

### 0.4. Cách gọi LNST và nguồn dữ liệu

**Tăng trưởng LNST YoY dùng “Lợi nhuận sau thuế (LNST)” trong bài, bảng, đề và giải thích. Không thêm lại phần phân biệt hợp nhất với phần thuộc cổ đông công ty mẹ.** Các ví dụ doanh nghiệp giả định dùng cùng cơ sở như nguồn.

Đơn giản cách gọi không phải lệnh thay field dữ liệu thật. Backend giữ mapping/phiên bản đã được duyệt cho từng chỉ tiêu LNST/EPS/ROE/biên ròng. Phần đối chiếu kỹ thuật ở mục 6 không đưa trở lại vào bài giảng.

### 0.5. Căn cứ và thứ tự xử lý

1. Quyết định mới của chủ sản phẩm được ghi lại trong spec này: khung mới, Bộ lọc → nguồn mua mới Bot, xu và tài nguyên linh thú hiện có.
2. Nội dung Chương 3 v1.0 được duyệt, với đúng hai thay đổi nội dung tại mục 0.3; HTML v2.0 là nguồn đầy đủ để nhập.
3. Các hợp đồng cần thiết từ bộ Bot, Học viện, Chiến lược, Shop và Chương 1–2 v2.0 đã được nhắc đủ tại đây; tên file trong metadata chỉ ghi xuất xứ, không yêu cầu đọc chéo để giải mã nghiệp vụ.
4. Repository/source thực để xác minh route, component, dữ liệu, quyền, giao dịch, lịch và phiên bản. Không coi một tên bảng/API minh họa là đã tồn tại.

Nếu phát hiện xung đột chưa được quyết định (công thức, dữ liệu, chính sách gói...), ghi rõ bài/phần/câu/component, expected/actual và ảnh hưởng. Không âm thầm hòa giải bằng kiến thức bên ngoài, thay đáp án, bỏ hình hoặc đổi công thức toàn hệ thống. Tiếp tục các phần độc lập đủ đầu vào. Không tự deploy, cấp bù xu hoặc ghi dữ liệu production khi chưa được cho phép.

---

## 1. Phạm vi triển khai

| Thực hiện | Không thực hiện |
|---|---|
| Ghép 6 bài/24 phần với hình, công thức, bảng theo nguồn | Xây một Học viện mới hoặc thay toàn workspace bằng HTML mẫu. |
| Chấm 48 câu ở server, resume/review/làm lại | Chấm AI cảm tính, dùng điểm client làm chứng cứ, đổi cách thi sang manual. |
| Nối hoàn thành → đúng capability cơ bản → xu 100 lần đầu | Cấp cả chương, mở 16 chỉ báo kỹ thuật, bật Mua/Bán hoặc áp dụng danh mục từ sự kiện học. |
| Mở điểm điều hướng vào Bộ lọc hiện có | Dựng một bộ lọc con trong bài, thêm ngưỡng mẫu hoặc tạo danh mục tự động. |
| Dùng khung 13 chương/71 bài, giữ nội dung Chương 1–2 | Xóa bài/chương khác hoặc đưa 19 chỉ báo đã bỏ trở lại. |
| Tái sử dụng ví xu và mô hình linh thú | Tạo lại 5 linh thú, ví mới, hệ điểm thứ hai hoặc thêm ưu thế giao dịch theo loài. |
| Đối chiếu tên, kỳ, đơn vị, field/basis | Thay thuật toán tài chính production bằng fixture hoặc mở thêm 36 chỉ tiêu chưa đủ định nghĩa. |
| Bảo toàn tài khoản, tiến độ, quyền, ví, sở hữu, lịch sử | Reset vốn 100 triệu, bán vị thế, sửa stop lịch sử hoặc cấp lại xu do nâng bản. |

**Không tạo mini 30 mã cho sáu bài cơ bản.** Phần vận dụng là đọc/đặt điều kiện trong Bộ lọc. Không bắt phải lọc, mua linh thú, áp dụng danh mục hay thực hiện giao dịch mới cho thi/hoàn thành.

---

## 2. Catalog, định danh và tiến độ

Tên chương: **Chương 3 — Phân tích cơ bản nền tảng**. Nội dung mới `iqx-ch3-fundamental-six-v2.0`; ngân hàng 48 câu và dataset giữ cùng nội dung v1, có version riêng để pin và đối chiếu.

| Thứ tự | ID vị trí | Khóa bài ổn định tham chiếu | Chỉ tiêu | Tên bài | Phần | Chart bài | Câu | Xu lần đầu |
|---:|---|---|---|---|---:|---:|---:|---:|
| 1 | ch03-l01 | fundamental.rev | rev | Tăng trưởng doanh thu YoY | 4 | 3 | 8 | 100 |
| 2 | ch03-l02 | fundamental.profit | profit | Tăng trưởng LNST YoY | 4 | 2 | 8 | 100 |
| 3 | ch03-l03 | fundamental.eps | eps | Tăng trưởng EPS YoY | 4 | 2 | 8 | 100 |
| 4 | ch03-l04 | fundamental.gm | gm | Biên lợi nhuận gộp | 4 | 2 | 8 | 100 |
| 5 | ch03-l05 | fundamental.nm | nm | Biên lợi nhuận ròng | 4 | 2 | 8 | 100 |
| 6 | ch03-l06 | fundamental.roe | roe | ROE | 4 | 2 | 8 | 100 |

Các khóa ổn định trên là **hợp đồng mapping minh họa**, không buộc đổi primary key đã có. Ánh xạ sang bài và capability thật bằng bằng chứng tương đương. Không chỉ so số thứ tự, chuỗi tên hoặc `ch03-l01` khi trùng ID của một giáo trình khác.

Dùng catalog chung **13 chương/71 bài** từ bộ Học viện mới. Chương 3 tối đa 6/6, đóng góp sáu bài vào tử số/71. Mẫu số không lấy 113/125 từ shell cũ. Không triển khai lại catalog toàn hệ thống trong đợt nhập sáu bài nếu catalog đúng đã có; tham chiếu một nguồn để không sinh hai Chương 3.

Chương 1 v2.0 vẫn quiz 8/8; Chương 2 v2.0 vẫn sáu bài hoàn thành bằng nút; Chương 4 cũng là nhóm hướng dẫn manual; các bài kiến thức theo policy riêng đã chốt. Đừng đếm chỉ trường `passed` rồi bỏ mất các bài manual. Không tự thêm bài kiểm tra cuối chương, điều kiện học tuần tự, số phút đọc, số lần thi giới hạn hoặc yêu cầu học hết 6/6 mới mở chỉ tiêu đầu tiên.

---


## 3. Nội dung và cách trình bày phải giữ

Bốn nhãn điều hướng nhanh của reader: **Khái niệm · Công thức · Kỳ tính · Vận dụng**. Tiêu đề phần chi tiết vẫn đúng từng bài, không thay bằng một đoạn chung.

### 3.1. Tăng trưởng doanh thu YoY

1. **Khái niệm và cách đọc**.
2. **Công thức và ví dụ tính**.
3. **Kỳ tính và cách diễn giải**.
4. **Vận dụng trong Bộ lọc**.

### 3.2. Tăng trưởng LNST YoY

1. **Khái niệm và cách đọc**.
2. **Công thức và ví dụ tính**.
3. **Kỳ tính và nền so sánh**.
4. **Vận dụng trong Bộ lọc**.

### 3.3. Tăng trưởng EPS YoY

1. **Khái niệm và cách đọc**.
2. **Công thức và ví dụ tính**.
3. **Kỳ tính và thay đổi số cổ phiếu**.
4. **Vận dụng trong Bộ lọc**.

### 3.4. Biên lợi nhuận gộp

1. **Khái niệm và cách đọc**.
2. **Công thức và ví dụ tính**.
3. **Kỳ tính và cách diễn giải**.
4. **Vận dụng trong Bộ lọc**.

### 3.5. Biên lợi nhuận ròng

1. **Khái niệm và cách đọc**.
2. **Công thức và ví dụ tính**.
3. **Kỳ tính và cách diễn giải**.
4. **Vận dụng trong Bộ lọc**.

### 3.6. ROE

1. **Khái niệm và cách đọc**.
2. **Công thức và ví dụ tính**.
3. **Kỳ tính và thay đổi vốn**.
4. **Vận dụng trong Bộ lọc**.

### 3.7. Các bất biến của nội dung

- Giữ văn phong tiếng Việt, đoạn mở, giải thích thành phần, công thức dạng phân số, ví dụ nhiều bước và kết luận theo số liệu.
- Giữ doanh thu thuần, LNST, EPS cơ bản, giá vốn, vốn bình quân theo đúng phạm vi đã trình bày; không tự nâng thành bài kế toán hoặc thêm phần đã yêu cầu bỏ.
- Giữ các tình huống nền nhỏ, nền không dương, lũy kế khác quý riêng, đơn vị EPS, cổ phiếu bình quân/điều chỉnh, phần trăm khác điểm phần trăm, tỷ lệ âm hợp lệ và dữ liệu thiếu.
- Giữ ví dụ doanh nghiệp A nhất quán: LNST quý II là **80 → 88 tỷ**, biên ròng là **8% → 7,04%**. Không đưa lại phương án cũ **100 → 110 tỷ / 10% → 8,8%** từ bản đề xuất trước HTML đã duyệt.
- Không gắn nhãn “cao luôn tốt”, “thấp luôn xấu”, khuyến nghị mua hoặc tự tạo một điểm tổng hợp doanh nghiệp từ sáu tỷ lệ.
- Không thêm đoạn về “HTML đã duyệt”, “ảnh không phải ô nhập”, chú thích dành cho dev hoặc lời nhắc về bản mẫu lặp ở từng hình. Các đơn vị, kỳ và chú giải cần đọc trong hình/bảng vẫn phải giữ.
- Không đưa lại lab 4.2/4.3, khung “Nhớ điều này”, “Tài liệu tham khảo và phạm vi ví dụ” đã bỏ. Không ép mỗi bài thành một lab có input ghi thật.
- Nội dung thao tác đầy đủ của Chương 4 chưa giao ở đây. Chỉ dùng cầu nối đã cập nhật tại hai phần trong mục 0.3; không viết lại sáu bài hướng dẫn Bộ lọc hoặc đưa form lưu thật vào giáo trình này.

### 3.8. Bố cục reader

Tái sử dụng workspace Học viện mới, không có điều kiện nở: main trái, panel Học viện bên phải và thanh công cụ ngoài cùng. Bấm Xem bài mở tại vùng nội dung trái; panel, chương đang mở và trạng thái cuộn sidebar được giữ. Nút **Về linh thú** đóng reader, không reset học tập, vốn, xu hoặc linh thú đang dùng. Dùng mô hình/renderer thật đã có; không tạo lại từ ảnh mẫu.

Trong bài có số thứ tự 01/06…06/06, tiêu đề, đoạn giới thiệu, bốn nút nhảy phần, bốn khối đọc, nút làm/tiếp tục bài kiểm tra, xem kết quả khi có và điều hướng bài trước/sau. Không thêm popup buộc học tuần tự, timer đọc, điều kiện đã cuộn hết hoặc bắt mở hết chart để được thi.

Mẫu mở ngay bài 1 Chương 3 để duyệt; production không tự giành màn hình đang mở của người dùng mỗi khi deploy/nạp dữ liệu.


### 3.9. Màn học, kết quả và điểm mở Bộ lọc

Panel bên phải giữ 13 chương/71 tên bài; chỉ Xem bài và ✓ Đã học. Nội dung trái giữ tên, bốn phần, hình, bảng, đề; thanh công cụ Học viện/Bot/Shop/Săn mã... tiếp tục có mặt. Không chuyển panel Học viện thành nơi chỉnh kỳ/ngưỡng.

Bài đã hoàn thành có trạng thái Đã học. Phần thưởng đã xác nhận có thể hiện “Đã nhận 100 xu”; không suy đã trả thưởng chỉ từ completed. Màn kết quả vẫn có điểm đúng/sai, đáp án/giải thích/hình như nguồn. Nút **Mở Bộ lọc** chỉ điều hướng vào **Chiến lược → Bộ lọc** đã có, không mở modal Cấu hình kỹ thuật, không gọi query có ngưỡng mẫu hoặc lệnh áp dụng danh mục.

Trong HTML độc lập, nút này mở bảng **điểm nối quyền** của sáu chỉ tiêu để xem Đã mở/Chưa học và kỳ mặc định; có nhãn giải thích đó là điểm nối mẫu, không phải Bộ lọc đầy đủ. Khi tích hợp phải thay bằng router thật tới tab Bộ lọc, giữ trạng thái Bộ lọc người dùng đang chỉnh. Không sao chép bảng điểm nối này thành một sản phẩm Bộ lọc thứ hai.

Hoàn thành không tự chuyển bài; người dùng có thể đọc lại, làm lại hoặc chủ động chuyển sang Bộ lọc/Shop. Luyện tập RSI và các chỉ báo kỹ thuật tiếp tục thuộc Bot, không thuộc các dòng cơ bản.


## 4. Cách trích nội dung từ HTML — không làm mất biểu đồ

### 4.1. Điểm lấy dữ liệu

Trong HTML có:

```html
<script type="application/json" id="ch3-content-data">…</script>
```

Đọc JSON bên trong bằng parser HTML/JSON, không dùng regex để chỉnh sửa toàn văn có escape rồi làm hỏng dấu `<`, `>`, công thức hoặc dấu tiếng Việt.

| Trường trong dữ liệu | Cách sử dụng |
|---|---|
| `version`, `chapter`, `chapter_title` | Nhận diện bản nội dung và chapter |
| `catalog_total` | Bối cảnh tổng bài trong mẫu; đối chiếu catalog thực, không reset tiến độ |
| `lessons[]` | ID, khóa chỉ tiêu, tên, đoạn mở và bốn `sections[]` |
| `sections[].html` | Toàn văn kèm công thức, bảng, hình/vị trí dựng chart |
| `charts` | 14 định nghĩa chart, gồm 13 dùng trong bài và một định nghĩa bổ sung cho đề |
| `datasets.companyA` | Chuỗi số liệu doanh nghiệp A và các kết quả phụ trợ của ví dụ |
| `questions[]` | 48 câu, lựa chọn, đáp án, giải thích, phần liên quan, tham chiếu chart hoặc bảng |
| `reference_periods` | Kỳ mặc định và kỳ hợp lệ của sáu chỉ tiêu |
| `basis` | Xuất xứ/phạm vi fixture, không đưa nguyên metadata vào bài giảng |

Có thể dùng `IQX_CH3_PREVIEW.content()` để đối chiếu thủ công trong mẫu. Đây không phải API production. Server không thực thi toàn bộ JavaScript mẫu để nhận nội dung; chỉ import dữ liệu đã kiểm tra.

### 4.2. Dữ liệu học khác dữ liệu tài chính thật

Bài học, hình và đề sử dụng fixture đã duyệt, cần **bất biến theo content version**. Không thay số doanh nghiệp A bằng số thị trường mới mỗi lần mở bài; điều đó sẽ làm ví dụ, chart và đáp án mất nhất quán.

`basis.fixture_scope` đã mô tả doanh nghiệp giả định chỉ có cổ phiếu phổ thông và không có chênh lệch phân bổ trong mô hình ví dụ. Không suy từ fixture rằng mọi doanh nghiệp thật có cùng phạm vi LNST hoặc số cổ phiếu không đổi.

Những URL nền trong `basis.sources` không phải feed, không phải yêu cầu bổ sung một trang nguồn cho người học và không chứng minh đã xác minh dữ liệu production.

### 4.3. Thành phần renderer

`CH3Charts.render`, `plot`, `flatTable`, `table` trong HTML là tham chiếu cho cách dựng hình. Module `CH3` điều khiển bài, đề, kết quả và nhảy phần. Khi chuyển sang framework:

1. Giữ các marker `data-chart` hoặc ánh xạ tương đương có đối chiếu đủ từng ID.
2. Dựng hình sau khi vùng chứa đã có kích thước; không bỏ chart chỉ vì component đang ẩn hoặc lần đầu width bằng 0.
3. Render lại khi đổi bài, câu, mở lời giải hoặc đổi kích thước, không để listener/tooltip của hình cũ bám sang bài khác.
4. Giữ công thức, dấu, `sub/sup`, phân số, xuống dòng, bảng và số liệu có định dạng.
5. Không dùng nguồn giá/biểu đồ Backtest thay cho chart doanh nghiệp của Chương 3.
6. Không xóa toàn bộ `.chart-mount`/`[data-chart]`, chỉ lấy `textContent` hoặc bỏ thẻ công thức khi sanitize.


### 4.4. Metadata và bảo toàn dữ liệu mới

HTML còn có `script#ch3-change-manifest` cho kiểm kê; `script#ch3-learning-module` chứa renderer và adapter bài học. `capability_mapping` nối sáu bài sang sáu factor; `completion` xác định quiz 8/8/+100 xu. Những trường này là hợp đồng dữ liệu xuất bản, không cho client tự sửa mode/amount/owner để cấp quyền.

Không import nguyên script shell, catalog/registry hoặc dữ liệu Shop/Bot của HTML vào ứng dụng. Các module nền chỉ tạo bối cảnh xem thử. Không copy ảnh linh thú hoặc bộ số giả thành tài nguyên/model/dữ liệu tài khoản thật.

Phân biệt ba ID phiên bản: `content_version` của bài, `question_version` của đề, `dataset_version` của hình. Giá trị tính/basis của Bộ lọc thật có version riêng; số phiên bản bài không đồng nghĩa thuật toán tài chính được thay.


## 5. Công thức và dữ liệu ví dụ cần đối chiếu

Mục này tóm tắt đúng các phép tính trong HTML để AI dev/QA có điểm kiểm tra. Không được dùng nó rút ngắn bài học và không biến nó thành hợp đồng thay mọi công thức tài chính đang chạy.

### 5.1. Các công thức trong bài

```text
Tăng trưởng YoY (%) = (giá trị kỳ này / giá trị cùng kỳ năm trước − 1) × 100

EPS cơ bản = lợi nhuận dành cho cổ phiếu phổ thông / cổ phiếu phổ thông bình quân
Cổ phiếu bình quân = tổng (số cổ phiếu của giai đoạn × tỷ trọng thời gian)
Tăng trưởng EPS YoY (%) = (EPS kỳ này / EPS cùng kỳ − 1) × 100

Lợi nhuận gộp = doanh thu − giá vốn
Biên lợi nhuận gộp (%) = lợi nhuận gộp / doanh thu cùng kỳ × 100
Biên lợi nhuận ròng (%) = LNST / doanh thu cùng kỳ × 100

Vốn chủ sở hữu = tổng tài sản − nợ phải trả
Vốn chủ bình quân của ví dụ = (vốn đầu kỳ + vốn cuối kỳ) / 2
ROE của ví dụ (%) = LNST trong kỳ / vốn chủ bình quân cùng kỳ × 100
```

### 5.2. Bảng giá trị đối chiếu từ nguồn đã duyệt

| Nội dung / đầu vào ví dụ | Kết quả phải giữ |
|---|---|
| Doanh thu trước giảm trừ 1.300 tỷ; giảm trừ 50 tỷ | Doanh thu dùng trong ví dụ 1.250 tỷ |
| Doanh thu 1.000 → 1.250 tỷ, cùng quý hai năm | Tăng thêm 250 tỷ; tăng trưởng 25% |
| Bốn quý đang tính 1.200 + 1.500 + 960 + 1.250; cùng cửa sổ lùi năm 1.000 + 1.250 + 800 + 1.000 | Tổng 4.910 và 4.050 tỷ; YoY xấp xỉ 21,23% |
| Lũy kế sáu tháng 2.210; quý I 960, cùng cơ sở | Quý II riêng 1.250 tỷ |
| LNST 80 → 88 tỷ | +8 tỷ; YoY 10% |
| LNST +20 → −5 tỷ, kỳ gốc dương | YoY −125%; không chặn ở −100% |
| LNST 0 → 5; −20 → 10; −20 → −10 | Không dùng tỷ lệ YoY thông thường trong cách lọc của bài; đọc trạng thái và số tiền |
| Doanh nghiệp B LNST 10 → 20; C 100 → 130 | B +100%/+10 tỷ; C +30%/+30 tỷ |
| 100 triệu CP nửa đầu, 120 triệu CP nửa sau, hai khoảng bằng nhau | Bình quân 110 triệu CP |
| LNST 80 tỷ/100 triệu CP → 88 tỷ/110 triệu CP | EPS 800 → 800 đồng/CP; tăng trưởng 0% |
| Lợi nhuận 100 → 120 tỷ; CP bình quân 100 → 150 triệu | EPS 1.000 → 800 đồng; tăng trưởng −20% |
| Chia tách 1 thành 2, EPS trước điều chỉnh 1.600; EPS trước sau điều chỉnh 800; kỳ này 800 | So cùng cơ sở: tăng trưởng 0%, không −50% |
| Doanh thu/giá vốn 1.000/700 → 1.250/850 tỷ | Lãi gộp 300 → 400; biên 30% → 32% |
| Biên 30% → 32% | +2 điểm phần trăm; tăng tương đối xấp xỉ 6,67% |
| Doanh thu bốn quý 100,200,300,400; lãi gộp 10,40,90,160 | Biên cả khoảng 300/1.000 = 30%, không bình quân đơn giản 25% |
| Doanh thu 1.250; giá vốn 850; bán hàng/quản lý 220; chi phí khác thuần 70; thuế 22 | LNST 88; biên ròng 7,04% |
| Doanh nghiệp A biên ròng 80/1.000 → 88/1.250 | 8% → 7,04%, giảm 0,96 điểm phần trăm dù LNST tăng |
| Doanh thu 1.000; LNST báo cáo 200, trong đó 120 từ khoản không lặp lại đã xác định | Biên báo cáo 20%; không tự đổi số Bộ lọc thành 8% |
| Doanh thu 500; LNST −25 | Biên ròng −5%, là giá trị âm hợp lệ khi mẫu số dương |
| Tài sản/nợ 3.200/1.400 đầu kỳ; 3.800/1.600 cuối kỳ | Vốn chủ 1.800 và 2.200 tỷ |
| LNST bốn quý 66+88+99+107; vốn đầu/cuối 1.800/2.200 | LNST 360, vốn bình quân 2.000, ROE 18% |
| LNST 180 giữ nguyên; vốn bình quân 1.200 → 900 | ROE 15% → 20% do vốn giảm, không do tăng lợi nhuận |

Các trường hợp “độc lập” trong HTML không mặc định cùng là doanh nghiệp A. Ví dụ bốn quý biên gộp 10/20/30/40% là một bài tính riêng, không thay dữ liệu A.

### 5.3. Số liệu, làm tròn và trạng thái không xác định

- Đơn vị tiền trong nhiều bảng là **tỷ đồng**, cổ phiếu là **triệu CP**, EPS là **đồng/CP**. Tỷ đồng chia triệu CP cần hệ số 1.000 như bài đã dạy.
- YoY của bài dùng kỳ gốc dương. Không thay kỳ gốc âm bằng trị tuyệt đối; không biến mẫu số 0 thành vô cực hoặc 0%.
- Giá trị âm hợp lệ không đồng nghĩa missing: LNST hiện tại âm trên kỳ gốc dương có thể cho YoY dưới −100%; biên ròng âm trên doanh thu dương vẫn là số hợp lệ.
- ROE của ví dụ dùng bình quân hai đầu kỳ; thiếu vốn đầu thì không dùng vốn cuối thay thế. Vốn không dương không được thay bằng số nhỏ để tạo tỷ lệ đẹp.
- Không cộng bốn số dư vốn như cộng dòng lợi nhuận. Không cộng/trung bình đơn giản bốn biên khi phải tính tỷ số từ tổng số gốc.
- Không cộng bốn EPS quý hoặc lấy EPS quý mới nhất nhân bốn thay cho cách tính cùng cơ sở khi số cổ phiếu thay đổi.
- Dấu `>` và `<` là so sánh chặt; bằng ngưỡng không đạt. Không đổi thành `≥` hoặc `≤`.
- Giữ precision đủ tính và chỉ làm tròn ở hiển thị. Các mảng JSON có sai số floating-point như `14.999999999999991` cho 15% về toán học; đó không phải ý định tạo một ngưỡng đặc biệt. Khi đối chiếu phép tính, dùng số đầu vào chính xác và chính sách số của hệ thống; không dùng làm tròn hiển thị để thay giá trị lọc hoặc sửa đáp án đã duyệt.
- Bài/đề dùng số và cơ sở đã cho. Nếu giá trị thật hoặc renderer không khớp, phải báo chỗ mâu thuẫn, không âm thầm sửa cả các câu liên quan.

---

## 6. Kỳ tính và ranh giới với dữ liệu Bộ lọc

### 6.1. Ma trận kỳ theo dữ liệu bài học

| Chỉ tiêu | Khóa | Mặc định | Các kỳ hợp lệ |
|---|---|---|---|
| Tăng trưởng doanh thu YoY | `rev` | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| Tăng trưởng LNST YoY | `profit` | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| Tăng trưởng EPS YoY | `eps` | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| Biên lợi nhuận gộp | `gm` | Bốn quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| Biên lợi nhuận ròng | `nm` | Bốn quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| ROE | `roe` | Bốn quý gần nhất | Bốn quý gần nhất; Năm tài chính gần nhất |

Khi render danh sách lựa chọn ở Bộ lọc thực, giữ policy kỳ của catalog hiện hành đã duyệt; thứ tự mảng `allowed` trong JSON bài không là lệnh thiết kế lại dropdown. Không có một kỳ chung ép lên tất cả chỉ tiêu. **ROE không có kỳ quý riêng** trong phạm vi này.

- Quý: quý riêng hợp lệ mới nhất, so cùng quý năm trước khi là YoY; không dùng quý liền trước.
- Bốn quý: bốn quý liên tiếp cùng cửa sổ; YoY so cửa sổ tương ứng lùi một năm, không cửa sổ lùi một quý.
- Năm: năm tài chính đầy đủ hợp lệ, không tự mặc định trùng năm dương.
- Số lũy kế sáu/chín tháng không được coi là quý riêng. Khi bài minh họa phép tách, các báo cáo đã có cùng cơ sở như câu nêu.
- “Gần nhất” không có nghĩa báo cáo đã biết ngay ngày kết thúc quý. Hiển thị kỳ báo cáo thực tế theo contract Bộ lọc.

### 6.2. Bài học đơn giản nhưng cơ sở dữ liệu không được đổi ngầm

Các ví dụ LNST trong HTML dùng một doanh nghiệp giả định không có chênh lệch phân bổ giữa các cơ sở. Nguồn dữ liệu thật phải theo catalog/provider và phép tính đang được duyệt của từng chỉ tiêu.

Đối chiếu kỹ thuật đã được xác định ở đợt Bộ lọc: tăng trưởng LNST dùng basis đã map cho chỉ tiêu tăng trưởng; biên ròng dùng basis lợi nhuận/doanh thu của nó; ROE dùng lợi nhuận và vốn cùng phạm vi; EPS dùng lợi nhuận cho cổ phiếu phổ thông và số bình quân/điều chỉnh phù hợp. **Không tạo một trường LNST chung rồi ghi đè cả sáu phép tính chỉ vì bài giảng dùng tên ngắn.**

Nếu hệ thống đang có LNST tăng trưởng theo phần thuộc cổ đông công ty mẹ và biên ròng theo LNST hợp nhất như contract trước, giữ nguồn đó khi cấp quyền; không sửa thành một nguồn khác trong đợt nhập giáo trình. Những chi tiết này chỉ nằm trong spec và mapping của dev, không đưa thành phần giảng phân biệt hợp nhất/công ty mẹ mà chủ sản phẩm đã bỏ.

Các mảng cổ phiếu bình quân hoặc công thức ROE của ví dụ không tự thay cho xử lý corporate action, chuẩn EPS hay biến thể ROE của mọi nguồn thật. Nếu mapping tính thật có khác biệt chưa được giải quyết, ghi rõ trước khi xác nhận công cụ vận hành tương đương; nội dung độc lập đã đủ đầu vào vẫn phải được ghép đúng.

### 6.3. Phần Vận dụng không phải bộ lọc chạy riêng

Các dòng “chỉ tiêu · kỳ · dấu · ngưỡng” và bảng kết quả trong bài là ví dụ giảng dạy. Không tạo form lưu bộ lọc tự động, không thêm preset có ngưỡng 15%/25% vào tài khoản, không gọi API lọc thật khi người dùng mở bài hoặc xem chart.

Sau khi đạt bài, người dùng được quyền chọn **đúng chỉ tiêu tương ứng** trong tab **Chiến lược → Bộ lọc** đang có. Cấp quyền không đồng nghĩa chỉ tiêu đã được thêm vào điều kiện lọc, càng không đồng nghĩa phát sinh lệnh.


### 6.4. Bộ lọc → danh mục mua mới Bot: ranh giới hiện hành

```text
Học chỉ tiêu / đạt 8/8
→ mở quyền đúng chỉ tiêu (không tạo điều kiện)
→ người dùng vào Chiến lược → Bộ lọc
→ tự chọn kỳ, dấu, ngưỡng; lọc và chọn mã
→ chủ động “Áp dụng cho Bot”, xác nhận tập mã
→ thay nguồn mua mới khi tới phiên hiệu lực
```

| Trạng thái | Xét mua mới | Xét Bán |
|---|---|---|
| Chưa áp dụng danh mục riêng | VN30 của phiên hiệu lực | Mọi vị thế Bot đang giữ theo điều kiện Bán. |
| Áp dụng danh mục riêng | Chỉ tập mã snapshot đã xác nhận, không cộng/giao mặc định với VN30 | Mọi vị thế, cả mã ngoài tập mua mới. |
| Ngừng dùng danh mục riêng | Quay về VN30 khi thay đổi có hiệu lực | Không bán cưỡng bức vì đổi nguồn; vẫn theo điều kiện Bán. |

Lưu bộ lọc lưu tiêu chí để chạy lại. Lưu danh mục giữ tập mã/bằng chứng tại lúc lưu. **Áp dụng cho Bot** là hành động khác, chỉ thay nguồn mua mới. Mở bài, đạt quiz, nhận xu, bấm Mở Bộ lọc, lọc hoặc Lưu danh mục không tự thực hiện hành động đó.

Danh mục đã áp dụng là tập mã cố định theo phiên bản; báo cáo mới hoặc chạy lại bộ lọc không tự thay nó. Muốn cập nhật phải xác nhận áp dụng lại. Lỗi nguồn/danh mục rỗng không tự đổi về VN30. Không kiểm tra tiêu chí cơ bản mỗi ngày rồi bán mã không còn đạt. Nguồn mua cũ của vị thế chỉ lưu cho lịch sử, không chặn xét Bán.

Sáu chỉ tiêu không phải sáu điều kiện kỹ thuật Mua/Bán và không có công tắc trong Bot. Săn mã/Theo dõi giữ độc lập, không bị khóa bởi bài cơ bản. Bộ nội dung này không thay worker, lịch, vốn hoặc thứ tự xét mã của Bot; chỉ bảo đảm bài và điểm nối không mâu thuẫn nghiệp vụ.

### 6.5. Ví dụ không là dữ liệu lọc hay lịch sử thị trường

Chart doanh nghiệp A/B/C là dữ liệu dạy học bất biến, không feed VN30, không trường hợp thị trường thật. Không dùng ví dụ trong bài làm danh mục người dùng hoặc làm dữ liệu mini. Mini kỹ thuật giữ bộ thời gian của Bot (quan sát01/01/2024–30/06/2024, chạy01/07/2024–30/06/2026); không áp khoảng này, rổ30 mã, giới hạn60 phiên hoặc logic lệnh vào Chương 3.


## 7. Biểu đồ và bảng — kiểm kê bắt buộc

### 7.1. Đủ 13 vị trí biểu đồ trong bài

| ID biểu đồ trong JSON | Vị trí | Loại | Nội dung theo nguồn |
|---|---|---|---|
| `rev-quarters` | ch03-l01 · phần 1 | `grouped` | Doanh thu cùng quý của hai năm |
| `rev-periods` | ch03-l01 · phần 3 | `timeline` | Hai cửa sổ bốn quý cách nhau một năm |
| `rev-growth` | ch03-l01 · phần 3 | `line` | Doanh thu vẫn tăng, tốc độ tăng có thể chậm lại |
| `profit-growth` | ch03-l02 · phần 1 | `grouped` | Tăng trưởng doanh thu và lợi nhuận |
| `profit-base` | ch03-l02 · phần 3 | `panels` | Phần trăm lớn khác với số tiền tăng thêm lớn |
| `eps-components` | ch03-l03 · phần 1 | `panels` | LNST tăng 10%, EPS vẫn không đổi |
| `eps-shares` | ch03-l03 · phần 2 | `timeline` | Cổ phiếu bình quân theo thời gian |
| `gross-composition` | ch03-l04 · phần 1 | `stacked` | Doanh thu gồm giá vốn và lợi nhuận gộp |
| `gross-four-quarters` | ch03-l04 · phần 3 | `line` | Biên bốn quý được tính từ tổng số tiền |
| `net-bridge` | ch03-l05 · phần 1 | `waterfall` | Từ doanh thu đến lợi nhuận sau thuế |
| `net-margins` | ch03-l05 · phần 3 | `line` | Biên gộp tăng nhưng biên ròng giảm |
| `roe-window` | ch03-l06 · phần 1 | `panels` | Lợi nhuận cả kỳ và vốn tại các thời điểm |
| `roe-compare` | ch03-l06 · phần 3 | `panels` | Cùng lợi nhuận, khác quy mô vốn |

`D.charts` có **14** mục, không phải 14 hình trong bài. Mục bổ sung `rev-quiz-trend` là hình `panels` cho câu `ch03-rev-q04`; phải giữ dù nó không xuất hiện trong bốn phần đọc. Nhiều chart khác được dùng lại trong đề và phần giải thích.

### 7.2. Cách dựng đúng loại

- `grouped`: cột nhóm theo kỳ/trường hợp, giữ series, màu, đơn vị, mốc 0 và dấu âm khi có.
- `line`: đường theo kỳ, giữ toàn bộ series; không dùng smoothing làm đổi các điểm dữ liệu hoặc thứ tự thời gian.
- `stacked`: giá vốn + lợi nhuận gộp cộng thành doanh thu; label tổng và các thành phần phải khớp, không vẽ hai cột độc lập thay cột chồng.
- `timeline`: hiển thị đúng khoảng đầu/cuối của từng cửa sổ, nhãn quý/thời lượng; không biến thành đồ thị giá.
- `waterfall`: dòng tổng là mức tổng, dòng thay đổi là cộng/trừ. Trong `net-bridge`, 1.250 − 850 = 400; dòng “Lợi nhuận gộp 400” không cộng thêm 400 lần nữa. Các bước cuối ra LNST 88.
- `panels`: giữ các hình con và đơn vị riêng. EPS gồm ba phần tiền / cổ phiếu / đồng trên cổ phiếu; không ép chúng vào một trục chung. ROE tách lợi nhuận, vốn hoặc tỷ lệ theo từng hình đã có.

Không vẽ mọi mục bằng một đường, một ảnh screenshot chung hoặc chỉ bảng văn bản. Không gọi các biểu đồ tài chính trong bài là đường lợi nhuận Backtest.

### 7.3. Tương tác và vị trí

- Biểu đồ nằm đúng phần đang giải thích. Mở bài phải có đủ chart, không chỉ hiện khi người dùng tìm một nút phụ.
- Các hình có vùng chọn như cột/đường giữ đọc tooltip theo trỏ/tap hoặc bàn phím; dòng thời gian và waterfall giữ nhãn/bảng, không bắt thêm tương tác ngoài mẫu.
- Trong phần bài học có **Xem bảng số liệu** cho biểu đồ theo renderer đã duyệt. Các bảng phải đúng cùng dữ liệu và đơn vị của hình.
- Trong câu hỏi và lời giải, dùng `exam=true` như mẫu để không tự thêm bảng số phụ vốn không có. Những câu có `q.table` vẫn hiển thị bảng chính của câu.
- Resize 360/390 px và desktop không làm mất chart, tràn toàn trang hay chồng công thức. Bảng rộng cuộn ngang trong chính khung bảng; không thu cả màn hình thành ảnh chữ nhỏ.
- Giữ màu, kiểu nét, legend, title và bố cục trong mẫu; có thể dùng thư viện hiện có nếu tái hiện đúng kết quả. Không yêu cầu tải font hoặc dịch vụ biểu đồ ngoài chỉ để mở được bài.

---

## 8. Bài kiểm tra, đáp án và trải nghiệm

### 8.1. Quy tắc Chương 3

**8 câu cho mỗi bài, một đáp án trong bốn lựa chọn cho mỗi câu, đạt 8/8.** Tổng sáu bài là 48 câu. Không có nút Hoàn thành thủ công để thay thi.

Giữ shuffle thứ tự câu và lựa chọn như HTML, nhưng phải giữ **ID ổn định** và thứ tự của chính lượt làm khi quay lại/tiếp tục. Chấm bằng `question_id`/`option_id`, không theo ký tự A/B/C/D đang hiển thị. Các lựa chọn trong nguồn thường có đáp án ở một vị trí cố định; shuffle không được làm mất mapping đáp án. Khi cấp ID lựa chọn cho client, không mã hóa hoặc đặt tên làm lộ đáp án; server có thể dùng token theo lượt và giữ mapping tới ID nguồn, không thay nội dung lựa chọn.

Không đặt thêm giới hạn thời gian, số lần làm, bắt mở hết hình, bắt lọc doanh nghiệp hoặc bắt có kết quả đầu tư để được chấm.

### 8.2. Luồng người học

1. **Làm bài kiểm tra:** tạo hoặc tiếp tục lượt đang làm đúng bài và content version.
2. Chuyển câu bằng dải 1–8 hoặc nút trước/tiếp, giữ lựa chọn.
3. Xem lại bài học không mất câu trả lời trong lượt; trở lại có thể tiếp tục.
4. Chưa trả lời đủ tám câu thì chưa nộp được; server cũng kiểm tra, không chỉ disable nút.
5. Sau nộp: hiển thị số đúng/sai, điểm /8, trạng thái hoàn thành/quyền.
6. Mục **Đáp án và giải thích** có câu, đáp án đã chọn/đúng, giải thích từng lựa chọn, hình/bảng và link đúng phần kiến thức.
7. Câu sai mở phần giải thích theo mẫu, câu đúng vẫn mở xem được. Hình trong details phải dựng khi được mở.
8. **Làm lại:** xác nhận tạo lượt mới; không xóa lịch sử, không thu hồi quyền cũ, không reset cấu hình.

### 8.3. Giữ đề có hình/bảng

Có **10 câu dùng chart** và **8 câu dùng bảng**, theo phụ lục B. Không biến mọi câu thành câu chữ. Những bảng trong `q.table` là đầu vào chính của câu, không được bỏ khi renderer dùng chế độ đề.

Đáp án và giải thích nằm trong `questions[].correct` và `questions[].options[].explanation`. Không tự soạn lại hoặc suy đáp án từ màu của chart; dữ liệu gốc là căn cứ kiểm tra tính nhất quán, không một API AI chấm bằng cảm tính.

### 8.4. Chấm ở server

JavaScript `grade()` trong HTML chỉ dành cho mẫu độc lập. Khi tích hợp:

- Client nhận câu, lựa chọn, hình/bảng và phần gợi ý đã có nếu có; **không nhận khóa đáp án hoặc giải thích đúng/sai trước khi nộp**.
- `questions[].correct`, toàn bộ giải thích dùng khi chấm/review và dữ liệu chấm phải được lưu/phục vụ ở server theo phiên bản.
- Không nhúng nguyên JSON bao gồm đáp án vào bundle public rồi coi việc ẩn bằng CSS là bảo mật.
- Client gửi lựa chọn theo ID; server xác minh owner, lesson, content version, tập tám câu, bốn lựa chọn hợp lệ, không ID lạ/trùng, đủ đáp án và trạng thái lượt.
- Server tính điểm theo đúng bộ câu đã cấp. Không tin `score`, `passed`, `granted`, `best`, `completed_at` do client tự khai.
- Retry nộp cùng attempt trả lại một kết quả đã xác nhận; không tạo hai lượt hoàn thành hoặc hai grant. Hai thiết bị không được sửa kết quả đã nộp.
- Nội dung câu hỏi/chart có thể đủ dữ liệu để người học tự tính đáp án; không được xóa dữ liệu hữu ích của đề dưới danh nghĩa bảo mật khóa đáp án.


### 8.5. Pin, review và làm lại khi nâng bản

Khi bắt đầu attempt, lưu version bài/đề/dataset, tập8 câu, order câu và order/token lựa chọn. Các đáp án trong HTML được giữ nguyên48/48, nhưng vẫn không lấy việc chữ đáp án giống nhau để chấm lại lịch sử hoặc đổi nhãn bản đã thi. Review cũ cần dùng đúng snapshot trước; sửa hai đoạn cầu nối không làm cũ mất quyền hoặc cần thi lại.

Một lần nộp có thể đồng thời ghi result/completion/grant và phát sự kiện thưởng; không cộng xu từ callback UI. Nếu phần thưởng đang chờ, kết quả8/8 vẫn phải được giữ, không bắt thi lại. Khóa đề và số xu không đưa vào request như dữ liệu được tin cậy.


## 9. Tiến độ, quyền chỉ tiêu và tính bất biến

### 9.1. Tách các trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| Bài có trong mục lục | Có metadata; không chứng minh nội dung đã xuất bản |
| Bản nội dung khả dụng | Có bài và tài nguyên hợp lệ để đọc/thi |
| Lượt đang làm | Có lựa chọn chưa nộp; chưa chứng minh hoàn thành |
| Lượt đã nộp | Có kết quả server theo đúng bản nội dung |
| Bài đã hoàn thành | Đã có ít nhất một lượt đạt 8/8 được ghi nhận |
| Chỉ tiêu đã mở quyền | Grant riêng theo bài và capability, không phải cấu hình bật |
| Công cụ khả dụng | Có quyền và implementation/nguồn hợp lệ để sử dụng trong Bộ lọc |

Lần đầu đạt: ghi kết quả, tiến độ và grant theo transaction hoặc luồng có đối soát đáng tin cậy. Nếu cấp quyền chưa xác nhận do lỗi, giữ trạng thái thực và cho retry; không báo “đã mở” giả. Nếu Bộ lọc chưa có implementation hợp lệ, báo đúng phụ thuộc, không cấp số liệu giả để nút hoạt động.

### 9.2. Không mất quyền khi làm lại

- Một bài đếm tối đa một lần trong tiến độ, dù thi nhiều lần.
- `best` chỉ tăng hoặc giữ, không giảm vì lượt sau thấp hơn.
- Đã đạt trước đó thì lượt sau dưới 8/8 vẫn giữ hoàn thành/quyền, nhưng điểm của lượt mới phải hiển thị đúng.
- Thời điểm đạt đầu và lịch sử mỗi lượt không bị viết lại khi mở bài, thay kiểu xem hoặc refresh.
- Tiến độ server của Chương 3 phải ghép với Chương 1 kiểm tra và Chương 2 hoàn thành thủ công, không dùng một phép đếm `passed` chung làm mất Chương 2.
- Gỡ checkbox/chọn mẫu trong HTML không phải thao tác thu hồi quyền thật.

### 9.3. Cấp quyền theo từng bài

Đạt Tăng trưởng LNST YoY chỉ mở `profit` tương ứng; không mở cả sáu chỉ tiêu, không yêu cầu đủ 6/6 mới cho dùng chỉ tiêu đầu tiên. Không thêm gate phải học Chương 4 trước để cấp quyền nếu backend chưa có quyết định như vậy.

Trong Bộ lọc, tên chỉ tiêu khớp tên bài; các kỳ lấy policy tương ứng. Không tự thêm điều kiện, chọn ngưỡng, chạy truy vấn hoặc lưu danh mục cho người dùng khi grant được tạo.

Quyền gói/tài khoản hiện hành vẫn được giữ cùng grant học; không bypass guard gói từ số điểm. Các API ngoài UI cũng phải kiểm tra quyền chỉ tiêu.


### 9.4. Thưởng 100 xu — tái sử dụng dịch vụ chung

| Tình huống | Completion/quyền | Xu |
|---|---|---:|
| Chưa đạt, nộp 7/8 | Ghi result, chưa hoàn thành/chưa mở chỉ tiêu | 0 |
| Lần đầu 8/8, chưa có thưởng của bài | Ghi completion duy nhất, mở đúng factor | +100 |
| Làm lại 8/8 hoặc retry sau timeout | Giữ/đọc kết quả theo request và attempt | Không thưởng thêm |
| Đã đạt rồi làm lại 0/8 | Lưu điểm lượt mới, giữ best/completion/quyền | Không trừ hoặc cộng lại |
| Mở bài/cuộn/chart/Mở Bộ lọc/lọc/chạy mini | Không tạo completion | 0 |
| Hoàn thành đủ sáu bài lần đầu | 6/6, sáu chỉ tiêu riêng | Tổng 600 xu, không thưởng chương thêm |

Khóa thưởng duy nhất ở backend: **user + họ thưởng hoàn thành lần đầu + bài học ổn định**. Không đưa attempt/content version/ngày triển khai vào khóa theo cách mỗi bản lại nhận 100 xu. Giữ cùng identity qua đổi tên/số chương/sửa nội dung.

```text
Server Học viện xác minh attempt và chấm đúng bộ đề
→ result + completion/grant theo giao dịch/idempotency hiện có
→ sự kiện tin cậy/outbox gắn cùng giao dịch
→ dịch vụ xu xác minh completion và mapping
→ một bút toán +100 nếu chưa từng thưởng
→ cập nhật UI sau xác nhận
```

Có thể commit cùng transaction nếu cùng backend; nếu tách dịch vụ dùng outbox, retry và đối soát. Không làm ví Shop thành nguồn hoàn thành/điểm/grant. Shop và Học viện giữ đúng chủ sở hữu dữ liệu.

Nếu học đã ghi mà xu chưa xong: giữ **✓ Đã học**, đúng quyền thực tế, báo **Đang cập nhật xu** khi cần. Không báo “đã nhận 100 xu” trước bút toán; không bắt thi lại. Mạng lỗi/đọc ví lỗi không được reset số dư về 0 hoặc dùng 0 làm cơ sở ghi mới.

Thông báo xác nhận: **Hoàn thành bài học · +100 xu**. Không nút Nhận thưởng riêng. Phần thưởng không thay màn kết quả, không che lời giải và không tự mở Shop/mua linh thú. Đổi/mua linh thú không làm mất quyền bài học; xu không là tiền VND và không cộng vào vốn Demo Trading/Bot.

### 9.5. Người đã học trước khi có xu

Giữ completion/quyền/timestamp hợp lệ. Đối soát nguồn học, ánh xạ identity và ledger trước khi đề xuất cộng bù. Tác vụ cộng bù phải có dry-run, danh sách đối chiếu và phê duyệt ghi dữ liệu theo bộ Shop; **không tự chạy cộng bù khi nhập Chương 3 hoặc mỗi lần mở bài**. Không dùng scenario/localStorage làm bằng chứng và không tạo lại thưởng vì bản 2.0 được xuất bản.


## 10. Dữ liệu và API tích hợp

Tên dưới đây là hình dạng logic tối thiểu, **không bắt tạo đúng endpoint/bảng mới**. Tái sử dụng service học tập, quiz và capability của repository khi phù hợp.

### 10.1. Nội dung và bài

```json
{
  "lesson_id": "ch03-l02",
  "chapter_id": "ch03",
  "content_version": "iqx-ch3-fundamental-six-v2.0",
  "title": "Tăng trưởng LNST YoY",
  "kind": "fundamental_metric",
  "capability_id": "profit",
  "completion_mode": "quiz",
  "stable_lesson_key": "fundamental.profit",
  "question_version": "iqx-ch3-questions-48-v1-preserved",
  "dataset_version": "iqx-ch3-fixtures-v1-preserved",
  "first_completion_reward_policy": "academy_lesson_once",
  "question_count": 8,
  "required_correct": 8
}
```

`capability_id` phải map vào ID thật; đây không phải tên cột chuẩn cho mọi dự án. Không chuyển `completion_mode` của Chương 2 sang quiz khi import cấu hình Chương 3.

### 10.2. Các thao tác tối thiểu

| Thao tác logic | Dữ liệu cần giữ / kiểm tra |
|---|---|
| Đọc bài và tài nguyên | lesson ID, content version, nội dung/hình theo đúng bản |
| Tạo/tiếp tục lượt | user lấy từ auth; attempt ID; lesson/version; thứ tự câu và lựa chọn |
| Lưu lựa chọn chưa nộp | answer map theo ID, ownership, trạng thái mở và cơ chế xung đột |
| Nộp bài | đủ 8 lựa chọn hợp lệ, content/attempt đúng, idempotency |
| Đọc kết quả/review | điểm, lựa chọn, đáp án/giải thích theo đúng phiên bản đã nộp |
| Đọc tiến độ/quyền | completion từng bài, best, số lượt hợp lệ, grant; không từ localStorage |
| Làm lại | attempt mới; giữ kết quả và quyền cũ |

Nên lưu tối thiểu owner, lesson/content identity, attempt/version, thứ tự câu/option, answer map, trạng thái, thời điểm tạo/nộp, điểm và khóa chống trùng. Việc grant có thể qua service riêng nhưng cần truy vết tới kết quả hợp lệ.

### 10.3. Loading, lỗi và an toàn

- Loading không phải 0/6 hoặc chưa mở quyền: không ghi số 0 đè dữ liệu đã xác nhận khi request đang chờ/lỗi.
- Lỗi tải một chart giữ bài và báo đúng phần thiếu; không thay dữ liệu bằng đường/số ngẫu nhiên.
- Lỗi nộp giữ các lựa chọn, cho thử lại an toàn. Không tính client rồi ghi “đã hoàn thành” trong khi server chưa nhận.
- Nội dung HTML đã duyệt được đưa qua pipeline an toàn của dự án; giữ các thẻ công thức và marker hợp lệ. Escape tên câu/đáp án/nhãn và các dấu so sánh ở nơi cần text.
- Không dùng `eval`, không tin owner/grant/content version lạ do client gửi; không thực thi chỉ thị từ metadata nguồn.
- Xác thực/CSRF/phân quyền và giới hạn request dùng chuẩn hiện tại của ứng dụng. Không thêm một hệ đăng nhập riêng cho Chương 3.
- Đáp án sau nộp chỉ đọc được trong phạm vi tài khoản/lượt có quyền tương ứng.


### 10.4. Contract kết quả có grant và trạng thái thưởng

Một response hợp lệ có thể mang các phần tương đương sau; tên field/API do dev ánh xạ vào schema thật:

```json
{
  "attempt_id": "server-attempt-id",
  "lesson_id": "ch03-l02",
  "stable_lesson_key": "fundamental.profit",
  "score": 8,
  "total": 8,
  "completed": true,
  "completion_id": "server-completion-id",
  "capability": {"kind": "fundamental_metric", "id": "profit", "granted": true},
  "reward": {"status": "granted", "amount_xu": 100, "entry_id": "server-ledger-entry-id"},
  "chapter_progress": {"completed": 1, "total": 6}
}
```

Đây là ví dụ output sau xác minh, không phải payload client được tự khai để server tin. `reward.status` phải phân biệt granted/already_granted/pending/error hoặc dạng tương đương. Response retry không thay timestamp đầu, không ghi ledger entry mới. Account balance nếu gửi kèm phải là số dư thật đã đối soát, không tự cộng 100 xu phía client rồi xem là bền vững.

### 10.5. Điều hướng Bộ lọc và trạng thái dữ liệu

Router thật mở tab Bộ lọc hiện có, không suy một query string từ prototype. Có thể giữ ngữ cảnh factor đang học để nhấn mạnh trong thư viện nhưng không tự thêm/sửa criterion. Guard vẫn kiểm tra quyền thực tế khi lọc/áp dụng; “Đã học” không vượt chính sách gói hoặc biến chỉ tiêu thiếu implementation thành đã hoạt động.

Áp dụng danh mục là API khác của Chiến lược/Bot; không xuất hiện trong transaction submit quiz hoặc thưởng xu. Không gọi API này khi render reader/kết quả hoặc khi bấm nút mở tab.


## 11. Vai trò HTML và những phần tuyệt đối không sao chép lên production

HTML tái sử dụng **khung Học viện/Shop/Bot mới** và ghép duy nhất nội dung Chương 3. Mở độc lập để duyệt; CSS, JavaScript, tài nguyên tĩnh và JSON đã nhúng. Không cần file ảnh/font/CDN đi kèm.

| Thành phần mẫu | Xử lý production |
|---|---|
| `script#ch3-content-data` | Tách lessons/charts/datasets/periods và ngân hàng đề; không gửi correct/explanations trước submit. |
| `CH3Charts` | Tái sử dụng/port đúng từng kiểu hình, dữ liệu và tương tác; không chép nguyên whole-document. |
| `window.CH3` và adapter `renderMain/openLesson` | Đăng ký renderer chỉ cho 6 identity Chương 3; không ghi đè reader Chương 1–2. |
| `SHOP.chapter3` và `SHOP.completions` | Là store mẫu gộp để thử. Production dùng service Học viện làm nguồn học và service ví làm nguồn xu, không đảo quyền sở hữu dữ liệu. |
| `shopTransaction` + `navigator.locks` + localStorage | Chỉ hỗ trợ minh họa. Không thay transaction/constraint/idempotency server. |
| `completedIds()` suy từ mẫu | Thay bằng completion/quyền đúng theo tài khoản, không coi localStorage hoặc dữ liệu browser là bằng chứng. |
| `Mở Bộ lọc` | Mẫu chỉ mở điểm nối quyền. Production chuyển tới Bộ lọc thật, không dựng lại popup này thành editor/nguồn quyền riêng. |
| 16 chỉ báo và engine mẫu của Bot trong shell | Chỉ giữ bối cảnh giao diện; không cần triển khai lại hoặc dùng nến giả từ file làm engine thật. |
| Catalog 13/71 có tên chương khác | Giữ metadata chung, không xuất bản nội dung giả hoặc ghi đè bài đã có. |
| Mô hình linh thú thật | Tìm và tái dùng mô hình/hoạt ảnh/renderer hiện tại. Không tạo, thay hoặc tải lại hình từ mẫu để đổi thiết kế. |
| Bạch Hổ, 0 xu ban đầu của mẫu | Trạng thái tài khoản mẫu mới. Không reset người đã có xu/linh thú đang dùng. |
| Nút Thông tin mẫu/Đặt lại mẫu/diagnostics | Chỉ chủ sản phẩm/QA dùng cục bộ; không đưa nút cấp/reset dữ liệu lên người dùng thật. |
| Thông báo mẫu cho công cụ ngoài phạm vi | Không thay tính năng thật đang hoạt động bằng toast hoặc màn chờ. |

Ba khóa localStorage của file bắt đầu bằng `iqx.preview.ch3-v2`, tách khỏi các file chương khác. Chúng chỉ dùng để xem thử. Chế độ localStorage bị chặn phải báo chỉ lưu trong lượt xem; không báo đã đồng bộ server.

Không cần tái sử dụng toàn bộ code Shop hoặc cấp quyền kiểu `isPassed || scenario` của HTML cũ. Không đưa form/công tắc Chương 1 cũ trở lại danh sách Học viện. Không khôi phục khung 18 chương/113 bài/35 chỉ báo vì thấy dữ liệu đó trong các nguồn lịch sử.

---

## 12. Bảo toàn dữ liệu, các chương khác và nguyên tắc Bot

### 12.1. Ghép thêm nội dung, không reset

Giữ Chương 1 v2.0 có toàn văn/chart/quiz 8/8 và Chương 2 v2.0 manual hoàn thành; giữ xu/grants/results đã xác nhận. File Chương 3 chỉ có nội dung của nó; các màn chờ của chương khác không phải lệnh xóa nội dung đã xuất bản.

Import có stable identity/version; chạy lại không tạo sáu bài/câu/shape/grant lần hai. Không dùng toàn bộ store của một file mẫu để overwrite dữ liệu học của tài khoản. Catalog vẫn 13/71; không tự thay mẫu số để tránh dữ liệu lịch sử chưa map.

| Nguồn cũ | Cách chuyển |
|---|---|
| Chưa có Chương 3 | Tạo/import sáu nội dung; không tự completed hoặc grant. |
| Đúng sáu bài v1.0 và kết quả server hợp lệ | Map cùng bài ổn định; giữ best, hoàn thành, quyền, timestamp, history; không bắt thi lại vì hai đoạn cầu nối được sửa. |
| Attempt đang làm trên v1.0 | Giữ pin cũ hoặc xử lý chuyển theo policy có bằng chứng; không lén dùng câu/hình/version mới để chấm. |
| Giáo trình cũ dùng cùng ordinal/ID nhưng nội dung khác | Giữ lịch sử và báo mapping chưa rõ, không tự cấp quyền/tiến độ bản mới. |
| Completion đã có nhưng chưa có xu | Đối soát/cộng bù theo tác vụ được phê duyệt của Shop, không tự thưởng khi import. |
| Ledger đã thưởng theo ID cũ | Map về cùng identity; không tạo thêm 100 xu bằng khóa mới. |
| localStorage, screenshot hoặc scenario mẫu | Không nhập làm bằng chứng. |

Giữ nguyên lịch sử bài đã thi theo đúng version. Chuyển đổi cần dry-run/backup, số lượng trước/sau và khả năng rollback không mất ledger/result. Bản nội dung 2.0 không tự tăng quyền gói, cấp vốn hoặc tạo Bot khác.

### 12.2. Ranh giới Bot mới, không còn V1/sau nở/stop L1

| Quy tắc hiện hành | Hệ quả cho Chương 3 |
|---|---|
| Vào Học viện ngay, có linh thú | Không check trứng/cấp/tốt nghiệp để xem bài hoặc thi. |
| Bạch Hổ mặc định tài khoản mới; năm linh thú có sẵn trong hệ thống | Reader dùng con đang được chọn, không tạo lại asset hoặc ép mọi user về Bạch Hổ. |
| Hoàn thành chỉ mở capability | Bài cơ bản mở factor, không thành điều kiện Mua/Bán. |
| VN30 hoặc danh mục riêng được áp dụng là nguồn mua mới | Chỉ lời giảng/cầu nối cần cập nhật; quiz/grant/xu không đổi nguồn. |
| Bán xét mọi vị thế theo điều kiện đang hiệu lực | Đổi nguồn mua không bán, không bỏ quên mã ngoài nguồn; không lọc tài chính hằng ngày để tự thoát. |
| Không cắt lỗ, target, trailing, thời gian giữ ngầm của Bot | Không khôi phục stop L1 theo spec cũ; lịch sử lệnh cũ chỉ được đọc nguyên trạng. |
| 60 phiên chỉ ở mini kỹ thuật | Không áp vào bài/đề/công thức cơ bản hoặc Bot. |
| Săn mã/Theo dõi độc lập; Demo Trading 100 triệu cấp một lần | Học/thi/xu không chặn đặt lệnh thủ công và không cấp thêm vốn. |
| Bot/Backtest dùng cấu hình kỹ thuật chung, mini/cảnh báo có snapshot riêng | Reader không ghi cấu hình; thưởng/factor không bật kỹ thuật. |

Đợt này không giao sửa lại worker/account/Shop. Nếu module nền chưa áp policy mới, ghi rõ phụ thuộc, hoàn thành phần nội dung độc lập và không nối sai để auto-enable Bot cũ. Không biến phát hiện mismatch thành cớ bỏ hình hoặc ngân hàng đề đã có đủ đầu vào.

---


## 13. Responsive và khả năng sử dụng

Tái sử dụng style/reader của Học viện đã duyệt. Yêu cầu kiểm tra tối thiểu desktop 1600/1440 px, tablet 1024 px, mobile 390 px và 360 px:

- Tiêu đề tiếng Việt dài, bốn tab, công thức phân số và bảng không tràn toàn trang; cỡ chữ không bị thu nhỏ để ép vừa.
- Chữ số, dấu âm, `%`, dấu `<`/`>` và đơn vị luôn đọc được; không mất dấu `<` do parse thành HTML.
- Sidebar Học viện, trạng thái bài, nút Xem bài và Về linh thú hoạt động như workspace đã có.
- Biểu đồ tự dựng khi có kích thước, legend/nhãn/đơn vị không chồng; bảng mở được bằng keyboard.
- Câu hỏi có radio và điều hướng 1–8 dùng được bằng bàn phím; không mất câu trả lời khi focus/resize.
- Chế độ giảm chuyển động không bị ép cuộn mượt. Sau đóng reader/modal, focus về thao tác phù hợp, không mắc kẹt ở vùng `inert`.
- Mọi dòng Học viện chỉ Xem bài/Đã học, kể cả Chương 1. Cấu hình/Luyện tập/công tắc kỹ thuật thuộc Bot; không bị thay đổi khi nhập bài cơ bản.

---

Mở danh sách trên điện thoại bằng điều khiển Học viện hiện có, đóng panel để đọc; rail công cụ vẫn có thể truy cập. Công thức dài được xuống dòng trong khung, không giảm chữ toàn bài thành ảnh nhỏ. Biểu đồ khác đơn vị giữ các panel riêng; nhãn phải được kiểm tra ngoài việc đếm có SVG.

Thông báo 100 xu, nút Mở Bộ lọc và huy hiệu Đã học phải có chữ đọc được, không chỉ dùng màu. Điểm nối mẫu nằm ngoài prose học; metadata/hash/định danh không hiện thành một phần giảng.


## 14. Ca kiểm thử nghiệm thu — 90 ca

**Đây là yêu cầu AI dev triển khai/chạy trên repository IQX, không phải báo cáo production đã đạt.** 67 ca kế thừa đã cập nhật ranh giới hiện hành và 23 ca bổ sung cho xu/điều hướng/tích hợp. Nội dung input/expected trong các ca số học là fixture đã cho, không dữ liệu tài chính thật.

Mỗi ca cần file/hàm test, điều kiện đầu, thao tác, expected/actual, lệnh và môi trường. Ca quyền/xu/grant/đồng thời/chuyển đổi phải có bằng chứng backend, không chỉ chụp HTML. Chủ sản phẩm không cần gửi file testcase riêng.

| ID | Điều kiện / đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| A01 | Chương 1–2 đã có nội dung/tiến độ, Chương 3 chưa nhập. | Tích hợp reader Chương 3. | Sáu bài đúng trong Học viện hiện có; không trang độc lập; Chương 1–2 giữ nguyên. |
| A02 | HTML v2.0 đi kèm và manifest. | Trích JSON/kiểm hash. | Đúng 6 bài/24 phần/48 câu; 22 phần không đổi, 2 phần nối nghiệp vụ mới; không yêu cầu nguyên byte bản v1.0. |
| A03 | Catalog mới 13 chương/71 bài. | Render tiến độ và mục lục. | Giữ đúng 71; Chương 3 sáu bài quiz; không dùng 113/125, không thêm chỉ báo/chương đã bỏ. |
| A04 | Mở từng bài Chương 3. | Đọc lead, 4 phần, điều hướng trước/sau. | Tên/thứ tự đúng; chỉ Xem bài ở dòng sidebar, không công tắc kỹ thuật. |
| A05 | Bài Tăng trưởng LNST YoY. | Đọc bài, ví dụ, quiz, review. | Chỉ cách gọi LNST như nguồn; không thêm phân biệt hợp nhất/công ty mẹ vào lời giảng. |
| A06 | Các bài đã hoàn thành ngoài Chương 3. | Import hoặc làm mới Chương 3. | Không reset progress/attempts/results toàn app; không khóa quyền kỹ thuật đã có. |
| A07 | Chỉ chương 3 có nội dung trong HTML mẫu. | Ghép vào ứng dụng có nhiều chương. | Không ghi placeholder đè nội dung đã xuất bản của chương khác. |
| A08 | Một lượt import Chương 3 đã thành công. | Chạy lại import cùng version. | Không nhân đôi bài, câu, chart, tiến độ hoặc quyền. |
| N01 | Doanh thu 1.300 trước giảm trừ, giảm trừ 50; cùng kỳ 1.000. | Render và đối chiếu phép tính. | Doanh thu thuần 1.250; tăng 250 tỷ/25%, không doanh thu 1.300 hoặc lãi 25%. |
| N02 | Cửa sổ bốn quý 4.910 và cửa sổ lùi năm 4.050. | Tính ví dụ và q05 doanh thu. | Khoảng 21,23%; đúng tám quý trên timeline, không QoQ/25% quý II. |
| N03 | Lũy kế 6 tháng 2.210, quý I 960. | Đọc bài/câu hỏi. | Quý II 1.250 trên cùng cơ sở; không chia lũy kế cho hai. |
| N04 | LNST 80 → 88; 20→−5. | Tính và hiển thị. | +10% và −125%; giữ dấu, không clamp −100%. |
| N05 | LNST 0→5 và −20→10. | Đọc/lọc theo ví dụ. | Không gán 0%, vô cực hay % tính bằng trị tuyệt đối; giữ trạng thái như bài. |
| N06 | Hai nửa kỳ bằng nhau có 100/120 triệu CP; lợi nhuận 88 tỷ. | Tính EPS trong bài và đề. | Bình quân 110 triệu; EPS 800 đồng/CP; không 0,8 hay lấy 120 triệu cuối kỳ. |
| N07 | Lợi nhuận 80 → 88, bình quân 100 → 110 triệu. | Đối chiếu ba panel EPS. | LNST +10%, CP +10%, EPS 800→800 và tăng 0%; panel đúng đơn vị riêng. |
| N08 | EPS 1.600 trước chia tách 1:2, cơ sở điều chỉnh 800; kỳ này 800. | Giải câu/bảng. | Tăng 0% trên cùng cơ sở; không suy lỗ −50%. |
| N09 | Doanh thu/giá vốn 1.000/700→1.250/850. | Tính biên, cột chồng. | Lãi gộp 300→400; biên 30→32%; chênh 2 điểm phần trăm, không 2% tương đối. |
| N10 | Doanh thu [100,200,300,400]; lãi gộp [10,40,90,160]. | Tính biên bốn quý. | 300/1.000=30%, không 25% hoặc 100%. |
| N11 | Waterfall 1.250,−850, tổng 400,−220,−70,−22, tổng 88. | Render và cộng bước. | LNST 88, biên 7,04%; không cộng lại dòng tổng 400. |
| N12 | LNST 80/1.000→88/1.250; biên gộp 30→32. | Đọc hai đường và bảng. | Biên ròng 8 → 7,04 giảm 0,96 điểm phần trăm; không dữ liệu 100 → 110 của đề xuất cũ. |
| N13 | Doanh thu 500, LNST −25; trường hợp khác thiếu doanh thu. | So điều kiện biên ròng <0. | −5% hợp lệ đạt <0; missing không đạt và không gán 0. |
| N14 | LNST 66 + 88 + 99 + 107; vốn 1.800/2.200. | Tính ROE và xem timeline. | 360, bình quân 2.000, ROE 18%; không chia lợi nhuận quý 88 cho vốn cả khoảng. |
| N15 | LNST 180 giữ nguyên; vốn bình quân 1.200→900; thiếu đầu kỳ ở tình huống khác. | Đọc ví dụ ROE. | 15→20% do mẫu số; thiếu vốn đầu không dùng vốn cuối thay bình quân. |
| N16 | Giá trị tính đúng bằng 15%, điều kiện >15%; dữ liệu chưa làm tròn khác 15%. | Đánh giá ví dụ/ngưỡng. | Bằng 15 không đạt; dùng số đủ precision và đơn vị nhất quán, không so chuỗi nhãn hoặc nhân 100 hai lần. |
| C01 | Sáu bài đã nạp. | Kiểm kê marker/hình. | 13 vị trí chart đều render; 14 định nghĩa gồm hình dành riêng cho đề. |
| C02 | rev-quarters/rev-growth/profit-growth. | Xem chuỗi kỳ và giá trị. | Đúng series/nhãn; % không thành tỷ đồng; quý IV LNST giảm có cột âm. |
| C03 | rev-periods và eps-shares. | Xem timeline trên desktop/mobile. | Đúng cửa sổ 4 quý và 50% thời gian; không chồng nhãn/cắt mất kỳ. |
| C04 | gross-composition. | Xem cột và bảng dữ liệu. | Giá vốn + lãi gộp bằng doanh thu từng kỳ, giữ số tổng; không biến thành line chung. |
| C05 | eps-components, profit-base, roe-window, roe-compare. | Render panels. | Đủ hình con và đơn vị riêng, không dùng một trục khác đơn vị. |
| C06 | net-bridge. | Render waterfall, mở bảng. | Dòng total và delta đúng; bảng và hình cùng số, không đếm tổng hai lần. |
| C07 | Một hình cột/đường trong bài. | Trỏ/tap, phím mũi tên và mở bảng. | Tooltip cùng điểm, bảng số đúng, không ghi cấu hình/đáp án hoặc thay dữ liệu. |
| C08 | Reader chiều rộng 360/390/1440 px. | Đổi bài và resize. | Không chart rỗng, không NaN, không tràn ngang toàn trang; công thức đọc được. |
| C09 | Câu hỏi chart và bảng; review details đang đóng. | Mở câu, nộp rồi mở review. | Giữ 10 câu chart/8 câu bảng; chart trong details dựng khi mở, không mất hình. |
| C10 | Câu ch03-rev-q04. | Mở đề/review. | Có rev-quiz-trend dù hình không ở phần bài; không tìm thấy rồi bỏ hình. |
| C11 | Đoạn biên ròng <0%, dấu so sánh và phân số. | Render/sanitize trên mobile. | Không mất chữ sau dấu <; tử/mẫu, ×100 và đơn vị không đè/cắt nhau. |
| Q01 | Chưa có lượt của bài. | Bấm Làm bài kiểm tra. | 8 câu riêng bài, 4 lựa chọn/câu, attempt/version có owner; chưa có grant. |
| Q02 | Lượt đang làm với thứ tự đã shuffle. | Chọn, chuyển câu, xem lại bài và tiếp tục. | Giữ lựa chọn và thứ tự của lượt; không phát sinh lượt thứ hai. |
| Q03 | Chưa trả lời đủ 8 câu. | Thử nút và request nộp trực tiếp. | UI/server không chấm hoàn thành; chỉ ra còn thiếu, không tự điền đáp án. |
| Q04 | Lượt valid của từng bài. | Chọn đúng 8 câu và nộp. | Điểm 8/8, hoàn thành và grant đúng một chỉ tiêu; 6 bài có thể được nghiệm thu độc lập. |
| Q05 | Bài chưa đạt, trả lời 7 đúng, 1 sai. | Nộp. | 7/8, không mở quyền; có review giải thích và link đúng phần. |
| Q06 | Các đáp án đã đảo vị trí A/B/C/D. | Nộp đúng theo option ID. | Chấm bằng ID, không nhầm đáp án theo vị trí o1/A trên màn. |
| Q07 | Client gửi score=8 / passed=true / granted=true nhưng answers sai hoặc thiếu. | Gọi API nộp. | Server bỏ/từ chối trường trái hợp đồng; không cấp quyền từ score client. |
| Q08 | QuestionID thuộc bài khác, option lạ, câu trùng hoặc content version không đúng. | Gửi nộp. | Từ chối rõ; không bỏ câu lỗi rồi tính phần còn lại là đủ. |
| Q09 | Request nộp cùng attempt bị retry/double-click. | Gửi lặp hoặc đồng thời. | Một kết quả, một lần tăng số lượt, một grant; trả kết quả đã xác nhận. |
| Q10 | User A có attempt/result. | User B đoán ID để xem/sửa/nộp. | Bị chặn ownership; không lộ đáp án/review hoặc tiến độ của A. |
| Q11 | Lượt đang làm, chưa nộp. | Kiểm tra payload/bundle/DOM. | Không có correct/explanation khóa đáp án public; vẫn đủ dữ liệu câu để học viên tự giải. |
| Q12 | Lượt nộp xong. | Xem kết quả và mở từng lời giải. | Có số đúng/sai, điểm, lựa chọn, đáp án, giải thích từng option, đúng chart/bảng và section link. |
| Q13 | Một bài đã đạt 8/8. | Làm lại rồi nộp 0/8. | Điểm mới 0, điểm tốt nhất 8, trạng thái hoàn thành/quyền cũ giữ; không reset cấu hình. |
| Q14 | Lượt đang làm hoặc vừa nộp; lỗi mạng/server. | Retry/làm mới nguồn đọc. | Giữ lựa chọn/trạng thái đã xác nhận; không báo đã mở quyền giả hoặc ghi trùng. |
| Q15 | Mở trang/đọc bài/cuộn hết/mở tất cả hình nhưng chưa đạt quiz. | Xem tiến độ. | Không tự hoàn thành; không có nút bypass hoặc yêu cầu thời gian mới. |
| G01 | Chưa đạt bài LNST; các bài khác đã có quyền riêng. | Đạt bài LNST 8/8. | Mở đúng profit trong Bộ lọc; tên khớp; không cấp cả sáu hay chỉ báo kỹ thuật. |
| G02 | Bài doanh thu đã đạt nhưng chưa xong cả chương. | Mở Bộ lọc. | Được dùng chỉ tiêu đã cấp quyền theo guard hiện hành, không đợi 6/6. |
| G03 | Bài tăng trưởng doanh thu/LNST/EPS được mở. | Xem kỳ mặc định. | quarter; cho quarter/ttm/year đúng từng chỉ tiêu; đổi một kỳ không đổi chỉ tiêu khác. |
| G04 | Biên gộp/ròng/ROE đã mở. | Đọc kỳ; thử ROE với kỳ quarter qua API. | ttm mặc định; biên có quarter/ttm/year; ROE chỉ ttm/year, không fallback lén. |
| G05 | Vừa có grant một chỉ tiêu. | Đối chiếu tài khoản/quy tắc. | Không tự tạo condition, ngưỡng, bộ lọc, danh mục, cấu hình Mua/Bán hoặc giao dịch. |
| G06 | Nguồn tính thật dùng các basis LNST/EPS/ROE đã map. | Import nội dung đơn giản cách gọi LNST. | Không đổi field nguồn/công thức thật; mapping nhất quán, khác biệt có báo cáo. |
| G07 | Grant hợp lệ nhưng service chỉ tiêu chưa có dữ liệu/implementation. | Mở công cụ. | Báo khả dụng/dữ liệu đúng; không bịa số hoặc tuyên bố công cụ đã tính tương đương. |
| G08 | Client chưa có quyền bài hoặc gói theo guard hiện hữu. | Gửi yêu cầu dùng chỉ tiêu trực tiếp. | Server kiểm tra quyền thật; localStorage/scenario không bypass. |
| R01 | User có tiến độ Chương 1 (quiz), Chương 2 (hoàn thành thủ công), Chương 3 (quiz). | Tính tiến độ chương/toàn khóa. | Đếm bài riêng biệt theo completion policy tương ứng; không bỏ mất manual ở Chương 2. |
| R02 | Store và bootstrap của HTML độc lập. | Port vào ứng dụng. | Chỉ đăng ký nội dung Chương 3; không dùng SHOP/localStorage làm nguồn học/quyền/điểm production, không reset store chung. |
| R03 | Bài ngoài Chương 3 đã có nội dung hợp lệ. | Mở qua sidebar sau tích hợp. | Không mất nội dung, chart hay quiz; giữ Backtest/Bộ lọc/Cảnh báo hiện có. |
| R04 | Bot có vị thế, nguồn mua và cấu hình kỹ thuật hiệu lực. | Đọc/thi/làm lại/nhận grant/xu. | Tiền, vị thế, cấu hình, nguồn mua không đổi; không tạo lệnh hoặc khôi phục stop L1 từ tài liệu cũ. |
| R05 | Dữ liệu cũ có ID ch03 trùng nhưng content khác. | Lập và chạy migration. | Mapping dựa version/bằng chứng; không auto-pass bản mới hoặc xóa lịch sử chưa đối chiếu. |
| R06 | Có kết quả phiên bản nội dung cũ. | Import bản mới hoặc chạy lại import. | Review cũ đúng bộ câu cũ; không viết lại điểm; import không trùng. |
| R07 | Browser mở reader rồi Về linh thú/chuyển bài/Escape. | Điều hướng. | Giữ sidebar/scroll đúng, focus không kẹt, inert được xử lý; không reset lifecycle hoặc bật Bot. |
| R08 | Bản HTML có footer/diagnostics/reset. | Build production. | Bỏ điều khiển mẫu, không cho người dùng tự cấp pass/grant/xu hoặc reset vốn/tài khoản từ scenario. |
| R09 | Nội dung/đáp án đã duyệt, data/công thức thực có mâu thuẫn. | Đối chiếu và báo cáo. | Nêu vị trí/bằng chứng; không âm thầm sửa nguồn, đổi thuật toán hoặc bỏ hình/câu để che lỗi. |
| X01 | Chưa hoàn thành bài Doanh thu; ví có 0 xu. | Nộp đúng 8/8 lần đầu và được server xác nhận. | Một bản hoàn thành, quyền rev và một bút toán +100 xu; số dư là 100 xu. Không mở profit hoặc chỉ báo kỹ thuật. |
| X02 | Chưa hoàn thành bài LNST; ví đã có số dư. | Nộp 7/8. | Lưu điểm 7; không tạo hoàn thành, quyền hoặc thưởng mới; số dư trước đó được giữ. |
| X03 | Đã nhận thưởng cho bài Doanh thu. | Làm lại và đạt 8/8. | Không thưởng lại; giữ thời điểm hoàn thành đầu tiên và mọi điều kiện người dùng đã lưu. |
| X04 | Đã đạt 8/8 và nhận 100 xu. | Làm lại và nộp 0/8. | Hiển thị điểm lượt mới là 0, điểm tốt nhất vẫn 8; giữ hoàn thành, quyền và xu. |
| X05 | Hai tab hoặc hai worker cùng xử lý một lần hoàn thành của cùng bài. | Gửi đồng thời hoặc thử lại yêu cầu. | Tối đa một bút toán thưởng. Ràng buộc duy nhất được bảo đảm ở backend, không chỉ bằng việc khóa nút. |
| X06 | Hai bài khác nhau hoàn thành gần như đồng thời. | Xử lý cả hai sự kiện. | Giữ đủ hai bản hoàn thành, hai quyền và hai phần thưởng; không mất cập nhật ví hoặc tiến độ. |
| X07 | Hoàn thành đã lưu nhưng tác vụ thưởng tạm lỗi. | Xem kết quả và cho tác vụ thử lại. | Vẫn hiện Đã học; thưởng có trạng thái chờ. Không báo đã nhận xu hoặc bắt thi lại. Sau xử lý thành công chỉ có một bút toán. |
| X08 | Server đã ghi kết quả nhưng client mất phản hồi. | Thử lại cùng attempt hoặc khóa yêu cầu. | Trả kết quả và trạng thái thưởng đã có; không cộng xu lần thứ hai. |
| X09 | Đã hoàn thành nội dung v1.0 và đã được thưởng. | Nhập hoặc đổi tên nội dung sang v2.0. | Ánh xạ về cùng bài ổn định; không dùng phiên bản nội dung hoặc số thứ tự làm khóa thưởng mới. |
| X10 | Có hoàn thành cũ hợp lệ nhưng chưa từng được thưởng. | Nhập nội dung v2.0. | Không tự chạy cộng bù. Lập đối soát, chạy thử không ghi dữ liệu và xin phê duyệt tác vụ theo bộ Shop. |
| X11 | Cả sáu bài chưa hoàn thành. | Lần lượt đạt 8/8 ở từng bài. | Chương đạt 6/6 và mở đúng sáu chỉ tiêu; tổng thưởng là 600 xu. Không thêm thưởng hoàn thành chương ngoài chính sách. |
| X12 | Một bài ở chương khác chỉ có tên, chưa xuất bản nội dung. | Thử gửi hoàn thành hoặc kết quả kiểm tra giả. | Không cấp quyền hoặc thưởng. Không thay nội dung đã xuất bản ở các chương khác bằng màn chờ của mẫu. |
| X13 | Một chỉ tiêu vừa được mở. | Bấm Mở Bộ lọc. | Trong production, router mở tab Bộ lọc thật. Không tự thêm điều kiện, mẫu thiết lập, ngưỡng, truy vấn ngầm hoặc áp dụng danh mục. |
| X14 | Bộ lọc đang có bản nháp hoặc kết quả được người dùng chọn. | Mở Bộ lọc từ bài ROE. | Giữ bản nháp và lựa chọn theo luồng hiện có; không ghi ngưỡng 15% hoặc đặt lại kỳ của các chỉ tiêu. |
| X15 | Nguồn mua của Bot là VN30; người dùng vừa hoàn thành bài LNST. | Lọc hoặc Lưu danh mục. | Nguồn mua không đổi cho tới khi người dùng xác nhận Áp dụng cho Bot và tới phiên hiệu lực. Sự kiện hoàn thành không gọi API áp dụng. |
| X16 | Danh mục riêng đang hiệu lực; Bot giữ một mã ngoài VN30. | Người dùng chọn Về VN30 qua module Bot hiện có. | Chỉ nguồn mua mới đổi theo phiên hiệu lực. Vị thế cũ vẫn được xét Bán, không bị bán chỉ vì thao tác đổi nguồn. |
| X17 | Danh mục snapshot A đang được Bot sử dụng. | Có báo cáo mới, đổi tiêu chí hoặc chạy Bộ lọc lại. | Danh sách mã Bot sử dụng không tự đổi; phải có thao tác áp dụng lại được xác nhận. |
| X18 | Có 600 xu và đang sử dụng Bạch Hổ. | Mua một linh thú giá 500 xu rồi bấm Sử dụng. | Còn 100 xu; giữ quyền, tiến độ, cấu hình và vị thế. Reader dùng mô hình linh thú đang được chọn của IQX. |
| X19 | Repository đã có mô hình và bộ hiển thị của năm linh thú. | Tích hợp bài học và các điểm nối Shop. | Tái sử dụng tài nguyên và vòng đời hiển thị. Không tạo lại hoặc thay mô hình bằng ảnh HTML; không khởi tạo lại tài khoản hoặc cấp vốn từ thao tác hiển thị. |
| X20 | Chương 1 v2.0 dùng kiểm tra; Chương 2 v2.0 hoàn thành bằng nút; đã có tiến độ và xu. | Nhập hoặc hoàn thành bài Chương 3. | Giữ đúng cơ chế, kết quả và xu của mọi chương. Không thu hồi quyền hoặc ghi màn chờ đè lên nội dung hiện có. |
| X21 | Client tự khai thưởng 10.000 xu, chủ sở hữu khác hoặc mode manual cho Chương 3. | Gửi yêu cầu API. | Server từ chối trường trái hợp đồng; không tin điểm, quyền, số xu hoặc phương thức hoàn thành do client tự khai. |
| X22 | Nội dung Chương 3 đầy đủ; nguồn tài chính thật chưa được xác minh. | Ghép bài và thử điểm mở quyền Bộ lọc. | Giữ dữ liệu giảng dạy cố định; phân biệt quyền với tính khả dụng của công cụ. Không bịa dữ liệu thật hoặc đổi cơ sở LNST. |
| X23 | Toàn bộ phạm vi đang được nghiệm thu. | Báo cáo kết quả. | Có bằng chứng riêng cho UI và server. Không lấy 110 kiểm tra nhanh cục bộ của HTML để tuyên bố 90 ca tích hợp đã đạt. |
Không biến bảng này thành checklist đã tick khi chưa chạy. Import đủ số lượng chưa chứng minh nội dung/hình/đáp án đúng; mỗi chart và câu có hình/bảng phải kiểm tra riêng theo phụ lục B. Phần bị chặn do thiếu nguồn phải chỉ rõ, không ghi chung “hoàn thành”.


## 15. Trình tự triển khai và báo cáo cho chủ sản phẩm

### 15.1. Audit có phạm vi

Tìm đúng build và nhánh đang dùng; màn đọc chung; catalog 13 chương/71 bài; module Chương 1 v2.0 và Chương 2 v2.0; dịch vụ kiểm tra, tiến độ, quyền, ví xu, outbox và sổ xu; route Bộ lọc và mapping sáu chỉ tiêu; mô hình linh thú đang sử dụng. Ghi rõ component, hàm, bảng và API thật. Không bắt chủ sản phẩm tự chỉ đường dẫn mà AI dev có thể tìm trong repository.

| Phụ thuộc cần xác minh | Bằng chứng | Không được thay bằng |
|---|---|---|
| Màn đọc, catalog và ánh xạ bài | Component, ID ổn định, phiên bản catalog và nội dung đã xuất bản | Khung v1.0 cũ hoặc số thứ tự trùng nhưng khác nội dung. |
| Lượt kiểm tra, chấm và xem kết quả | Service, xác thực, schema, phiên bản đã ghim và cơ chế bảo vệ đáp án | Hàm chấm client, AI chấm cảm tính hoặc dữ liệu trình duyệt. |
| Quyền sáu chỉ tiêu | Mapping, kiểm tra quyền năng lực và registry thật | Suy quyền từ số xu hoặc nhãn Đã học trong mẫu. |
| Ví xu và thưởng | Sổ xu, ràng buộc duy nhất, transaction/outbox và chính sách thử lại | Cộng 100 ở frontend rồi thông báo thành công. |
| Báo cáo và phép tính tài chính | Nguồn, cơ sở tính, kỳ, đơn vị, thời điểm khả dụng và phiên bản tính toán | Dữ liệu doanh nghiệp A/B/C trong bài hoặc một nguồn mới tự chọn. |
| Bộ lọc, router và nguồn mua Bot | Route hiện có, bản nháp/snapshot và API áp dụng riêng | Hộp điểm nối của HTML hoặc thao tác tự áp dụng danh mục khi đọc bài. |
| Mô hình linh thú | ID tài nguyên, bộ hiển thị, vòng đời và lựa chọn đang sử dụng | Sinh ảnh/mô hình mới hoặc cố định Bạch Hổ cho mọi người. |
| Quyền tài khoản và gói | Kiểm tra quyền thật của dự án | Tiến độ mẫu hoặc bỏ qua quyền gói chỉ vì đạt điểm 8. |

Hai file không chứng minh repository/service/API production, nguồn báo cáo cụ thể, khả năng lưu bền vững của backend hoặc tác vụ cộng bù đã sẵn sàng. Xác minh đúng các phần đó. Không mở lại các quyết định đã chốt về 13 chương/71 bài, ngưỡng 8/8, thưởng 100 xu, Bot không có cắt lỗ ngầm hoặc vị trí Bộ lọc.

### 15.2. Thứ tự thực hiện

1. Nhận diện hai file và hash; đọc nội dung/manifest; kiểm kê 6 bài, 24 phần, 13 vị trí hình, 14 định nghĩa hình và 48 câu được bảo toàn.
2. Ánh xạ sáu bài, sáu chỉ tiêu và định danh ổn định. Lập kế hoạch giữ tiến độ, quyền, lịch sử và xu; chạy thử không ghi dữ liệu trước khi chuyển đổi dữ liệu thật.
3. Nhập toàn văn, từng loại biểu đồ, bảng và công thức vào màn đọc mới. Không sao chép toàn bộ tài liệu HTML thành một ứng dụng khác.
4. Nối tạo/tiếp tục lượt, lưu lựa chọn, nộp và xem kết quả với server theo phiên bản; bảo vệ đáp án trước khi nộp.
5. Nối hoàn thành, quyền và sự kiện thưởng 100 xu vào các dịch vụ chung. Kiểm tra chống ghi trùng và phục hồi sau lỗi.
6. Nối Mở Bộ lọc bằng router thật, giữ bản nháp và ngữ cảnh. Không áp dụng nguồn mua Bot từ bài học.
7. Kiểm tra hồi quy Chương 1–2, Shop, Bot, Demo Trading và Săn mã. Đối chiếu việc sử dụng lại linh thú và giao diện trên màn hình nhỏ.
8. Thực hiện 90 ca nghiệm thu và đối chiếu từng hình/câu. Báo đúng phần đã chạy, chưa chạy hoặc bị chặn. Chỉ triển khai production khi đã được cấp quyền.

### 15.3. Kết quả dev phải trả

Trả code, tài nguyên nhập, migration cần thiết và test trong repository; kèm báo cáo nêu rõ file/component đã sửa, phần giữ nguyên, mapping/version, thống kê dữ liệu trước/sau, kết quả từng nhóm ca với giá trị mong đợi/thực tế, lệnh và môi trường đã chạy, nguồn còn thiếu. Đây là đầu ra của dev, không phải file đầu vào mới chủ sản phẩm phải chuẩn bị.

**Định nghĩa hoàn thành:** toàn văn, hình, công thức và đề xuất hiện đúng trong Học viện thật; server xác nhận 8/8 và mở đúng chỉ tiêu; thưởng 100 xu đúng một lần; tiếp tục lượt, xem kết quả và làm lại không làm mất dữ liệu; điểm mở Bộ lọc không tự thêm điều kiện hoặc áp dụng danh mục; nội dung Chương 1–2, tài khoản, ví xu và linh thú được bảo toàn.

Không nghiệm thu bằng việc chỉ có tên bài, chart trống, HTML chạy cục bộ, số lượng câu hoặc thông báo thành công. Không tuyên bố lợi nhuận đầu tư từ dữ liệu minh họa.

---

# Phụ lục A — Nhận diện và kiểm kê bàn giao

| Thuộc tính | Giá trị |
|---|---|
| HTML mới | `IQX-Hoc-Vien-Chuong-3-MAU-v2.0.html` |
| Kích thước | 636,852 byte |
| SHA-256 toàn HTML v2.0 | `61ad365c039425c06a6f86ff74f230821ff9d1f8370b259e233d25a9093dbbc9` |
| HTML nguồn nội dung v1.0 | `IQX-Hoc-Vien-Chuong-3-MAU-v1.0.html` |
| Hash nguồn v1.0 | `ad5aac426fdd3ae2498dfc675110a938d6e6e7e079d09751f1b634da8633cb07` |
| Content version mới | `iqx-ch3-fundamental-six-v2.0` |
| Question version | `iqx-ch3-questions-48-v1-preserved` |
| Dataset version | `iqx-ch3-fixtures-v1-preserved` |
| Catalog | 13 chương / 71 bài |
| Chương 3 | 6 bài / 24 phần / 48 câu |
| Hình bài | 13 vị trí; 14 định nghĩa, gồm một hình riêng cho đề |
| Câu có chart / bảng | 10 / 8 |
| Hoàn thành | Kiểm tra 8/8; không hoàn thành thủ công |
| Quyền | rev, profit, eps, gm, nm, roe; không mở chỉ báo kỹ thuật |
| Thưởng | 100 xu/bài lần đầu; tổng 600 xu |
| Bảo toàn phần nội dung | 22/24 object phần nội dung giữ nguyên |
| Bảo toàn đề | 48/48 object câu hỏi giữ nguyên |
| Hash 48 câu | `a0f8195025f2a86a3ba7e662daab82847f67ac0436add0ad3303dcb49afab153` |
| Hash 14 định nghĩa hình | `2744e12a1124145d75b3bb1e65dc92f31189a5be7f5d2dfa186ca7bff63f1f47` |
| Hash dataset | `c362747759ae4c56eae2a9d6cf3bdbcfbbea256a768a9b6a4996605860bc39e5` |
| Hash reference_periods | `faa28597c58da2002dee1b061b6ee73aca04af0dd285375384df2946466433bc` |

Hash object dùng JSON chuẩn hóa UTF-8 với `ensure_ascii=False, sort_keys=True, separators=(',', ':')`. Hash file chỉ nhận diện file đầu vào; component production không cần cùng byte toàn HTML nhưng phải bảo toàn content/fixtures theo manifest. Hai đoạn sửa không cho phép tính lại số liệu hoặc chấm lại lịch sử.

| Bài | Tên | SHA-256 object bài v2.0 |
|---|---|---|
| ch03-l01 | Tăng trưởng doanh thu YoY | `c2f08b8a23fa3361fe1c0e892e92b6b4da295effe53ff3d362e77f49d31592c1` |
| ch03-l02 | Tăng trưởng LNST YoY | `c9b90dde69f2cdb2cbca30549615a9b21a537f0fa25376d70c2c7782a829759c` |
| ch03-l03 | Tăng trưởng EPS YoY | `41b96cdf4e2523540a790dc6b0dffc2ec646116ec3029b27a5901afbb5a6cac8` |
| ch03-l04 | Biên lợi nhuận gộp | `55e3581918c446535cce8765e6a3e1f2e606dc345201cb5d108509c9cae1c84a` |
| ch03-l05 | Biên lợi nhuận ròng | `73a37be54cf8683ffb45583dbf4a7d8d5ce7a32e33c711afcac97331e96517aa` |
| ch03-l06 | ROE | `1b343f0b1b2c9b2a3ea92cb4cf2b81d06576309db8884e7b6b83b5485d739166` |

# Phụ lục B — Kiểm kê 48 câu và vị trí hình/bảng

Toàn văn câu, bốn lựa chọn, đáp án và giải thích nằm trong `questions[]` của HTML; bảng sau giúp bảo đảm không bỏ câu/hình khi import. Không tạo ngân hàng câu mới từ tên chủ đề.

| ID câu | Bài | Phần liên quan | Chủ đề | Tài nguyên của câu |
|---|---|---:|---|---|
| `ch03-rev-q01` | `ch03-l01` | 1 | Nhận diện số liệu | Văn bản / số liệu trong câu |
| `ch03-rev-q02` | `ch03-l01` | 2 | Tính tăng trưởng | Văn bản / số liệu trong câu |
| `ch03-rev-q03` | `ch03-l01` | 3 | Chọn đúng kỳ | Văn bản / số liệu trong câu |
| `ch03-rev-q04` | `ch03-l01` | 3 | Đọc biểu đồ | Biểu đồ `rev-quiz-trend` |
| `ch03-rev-q05` | `ch03-l01` | 3 | Bốn quý gần nhất | Biểu đồ `rev-periods` |
| `ch03-rev-q06` | `ch03-l01` | 3 | Quý riêng và lũy kế | Văn bản / số liệu trong câu |
| `ch03-rev-q07` | `ch03-l01` | 4 | Dấu và ngưỡng | Bảng `table.head/rows` |
| `ch03-rev-q08` | `ch03-l01` | 4 | Kỳ mới nhất | Văn bản / số liệu trong câu |
| `ch03-profit-q01` | `ch03-l02` | 1 | Ý nghĩa LNST | Văn bản / số liệu trong câu |
| `ch03-profit-q02` | `ch03-l02` | 2 | Tính tăng trưởng | Văn bản / số liệu trong câu |
| `ch03-profit-q03` | `ch03-l02` | 1 | Đọc hai tỷ lệ | Biểu đồ `profit-growth` |
| `ch03-profit-q04` | `ch03-l02` | 3 | Nền so sánh | Biểu đồ `profit-base` |
| `ch03-profit-q05` | `ch03-l02` | 3 | Kỳ gốc bằng 0 | Văn bản / số liệu trong câu |
| `ch03-profit-q06` | `ch03-l02` | 3 | Từ lỗ sang lãi | Văn bản / số liệu trong câu |
| `ch03-profit-q07` | `ch03-l02` | 2 | Từ lãi sang lỗ | Văn bản / số liệu trong câu |
| `ch03-profit-q08` | `ch03-l02` | 4 | Lọc tăng trưởng | Bảng `table.head/rows` |
| `ch03-eps-q01` | `ch03-l03` | 2 | Đơn vị EPS | Văn bản / số liệu trong câu |
| `ch03-eps-q02` | `ch03-l03` | 2 | Cổ phiếu bình quân | Biểu đồ `eps-shares` |
| `ch03-eps-q03` | `ch03-l03` | 1 | Đọc ba thành phần | Biểu đồ `eps-components` |
| `ch03-eps-q04` | `ch03-l03` | 3 | Tính tăng trưởng EPS | Văn bản / số liệu trong câu |
| `ch03-eps-q05` | `ch03-l03` | 3 | Điều chỉnh cổ phiếu | Bảng `table.head/rows` |
| `ch03-eps-q06` | `ch03-l03` | 1 | Ý nghĩa EPS | Văn bản / số liệu trong câu |
| `ch03-eps-q07` | `ch03-l03` | 3 | Kỳ tính EPS | Văn bản / số liệu trong câu |
| `ch03-eps-q08` | `ch03-l03` | 4 | Dấu và ngưỡng | Bảng `table.head/rows` |
| `ch03-gm-q01` | `ch03-l04` | 1 | Ý nghĩa biên gộp | Văn bản / số liệu trong câu |
| `ch03-gm-q02` | `ch03-l04` | 2 | Tính từ báo cáo | Văn bản / số liệu trong câu |
| `ch03-gm-q03` | `ch03-l04` | 2 | Điểm phần trăm | Văn bản / số liệu trong câu |
| `ch03-gm-q04` | `ch03-l04` | 1 | Đọc thành phần | Biểu đồ `gross-composition` |
| `ch03-gm-q05` | `ch03-l04` | 3 | Biên bốn quý | Bảng `table.head/rows` |
| `ch03-gm-q06` | `ch03-l04` | 3 | Quy mô và tỷ lệ | Văn bản / số liệu trong câu |
| `ch03-gm-q07` | `ch03-l04` | 4 | Không áp dụng | Văn bản / số liệu trong câu |
| `ch03-gm-q08` | `ch03-l04` | 4 | Lọc tỷ lệ | Văn bản / số liệu trong câu |
| `ch03-nm-q01` | `ch03-l05` | 1 | Biên ròng và biên gộp | Văn bản / số liệu trong câu |
| `ch03-nm-q02` | `ch03-l05` | 2 | Từ doanh thu đến LNST | Biểu đồ `net-bridge` |
| `ch03-nm-q03` | `ch03-l05` | 3 | Đọc hai loại biên | Biểu đồ `net-margins` |
| `ch03-nm-q04` | `ch03-l05` | 3 | Khoản không lặp lại | Văn bản / số liệu trong câu |
| `ch03-nm-q05` | `ch03-l05` | 3 | Dữ liệu đầu vào | Văn bản / số liệu trong câu |
| `ch03-nm-q06` | `ch03-l05` | 3 | Biên âm | Văn bản / số liệu trong câu |
| `ch03-nm-q07` | `ch03-l05` | 4 | So sánh doanh nghiệp | Bảng `table.head/rows` |
| `ch03-nm-q08` | `ch03-l05` | 4 | Dấu âm và điều kiện | Văn bản / số liệu trong câu |
| `ch03-roe-q01` | `ch03-l06` | 1 | Vốn chủ sở hữu | Văn bản / số liệu trong câu |
| `ch03-roe-q02` | `ch03-l06` | 2 | Tính ROE | Văn bản / số liệu trong câu |
| `ch03-roe-q03` | `ch03-l06` | 3 | Đọc biểu đồ vốn | Biểu đồ `roe-compare` |
| `ch03-roe-q04` | `ch03-l06` | 3 | Tử số và mẫu số | Bảng `table.head/rows` |
| `ch03-roe-q05` | `ch03-l06` | 3 | Thiếu dữ liệu | Văn bản / số liệu trong câu |
| `ch03-roe-q06` | `ch03-l06` | 2 | Diễn giải ROE | Văn bản / số liệu trong câu |
| `ch03-roe-q07` | `ch03-l06` | 3 | Kỳ tính của Bộ lọc | Văn bản / số liệu trong câu |
| `ch03-roe-q08` | `ch03-l06` | 4 | Kiểm tra ngưỡng | Bảng `table.head/rows` |

# Phụ lục C — Kiểm tra cục bộ đã thực hiện và giới hạn

Đã phân tích hai bản HTML và đối chiếu: đủ 6 bài/24 phần; 22 phần giữ nguyên và 2 phần có thay đổi được ghi nhận; 48/48 câu cùng đáp án/giải thích giữ nguyên object; 14 định nghĩa hình, dataset và `reference_periods` không đổi; 13 vị trí hình trong bài, 10 câu có chart và 8 câu có bảng đều có tham chiếu hợp lệ.

Đã thực hiện **110 kiểm tra nhanh cục bộ** bằng Chromium/Playwright với HTML nạp trực tiếp qua `set_content`, không kết nối IQX. Các nhóm kiểm tra gồm:

- Khởi đầu chưa học, 0 xu và catalog 13 chương/71 bài; nội dung và hình ở độ rộng 1600, 1024, 390 và 360 px.
- Điều hướng đủ 48 câu, hiển thị câu có hình/bảng, xem lại 8 câu và 32 lựa chọn/giải thích của mỗi bài.
- Nộp 7/8 không được thưởng; đạt 8/8 mở đúng chỉ tiêu; hoàn thành sáu bài nhận 600 xu; nộp trùng hoặc làm lại đạt 8/8 rồi 0/8 không thưởng lại.
- Các thao tác học không đổi dữ liệu Bot và tài khoản thủ công. Điểm mở Bộ lọc không áp dụng nguồn mua. Mua linh thú giá 500 xu rồi đổi linh thú không sửa dữ liệu Bot.

Kết quả báo cáo cục bộ: **110/110 đạt, không ghi nhận lỗi JavaScript trong lượt thử**. Có ảnh đối chiếu màn đọc desktop/mobile, biểu đồ EPS/waterfall, kết quả và điểm nối Bộ lọc. Đây là bằng chứng của mẫu, không phải báo cáo sản phẩm đã triển khai.

**Giới hạn:** môi trường chặn điều hướng URL file trực tiếp, nên chưa kiểm chứng mở file, tải lại và lưu localStorage trên mọi trình duyệt. Lượt thử dùng cơ chế dự phòng trong bộ nhớ và hiển thị “Chỉ lưu trong lượt xem”. Chưa kiểm chứng server, xác thực, cấp quyền, sổ xu, outbox, ghi đồng thời từ nhiều thiết bị, cộng bù, nguồn báo cáo tài chính hoặc worker IQX. **110 kiểm tra nhanh không thay cho 90 ca tích hợp tại mục 14**; dev phải thực hiện chúng với dịch vụ thật.

Không cần gửi ảnh chụp, script test hoặc một báo cáo riêng như file đầu vào thứ ba. Thông tin kiểm kê và giới hạn đã nằm trong spec; toàn văn và tài nguyên xem thử nằm trong HTML đi kèm.

---

**HẾT SPEC CHƯƠNG 3 — v2.0.** Ghép nội dung vào khung mới, giữ công thức, đề và số liệu; nối quyền Bộ lọc và xu. Không viết lại Bot, Học viện, Shop hoặc Chiến lược và không tạo lại mô hình linh thú.

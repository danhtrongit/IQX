# IQX — ĐẶC TẢ TÍCH HỢP NỘI DUNG HỌC VIỆN CHƯƠNG 4
## Sử dụng Bộ lọc · Sáu bài hướng dẫn · 27 ảnh · Hoàn thành bằng nút · Xu học tập

**Phiên bản bộ bàn giao:** 1.0.  
**Ngày lập SPEC:** 08/10/2026.  
**Hai file đầu vào:** `IQX-Hoc-Vien-Chuong-4-SPEC-v1.0.md` và `IQX-Hoc-Vien-Chuong-4-MAU-v1.0.html`.  
**Trạng thái:** chủ sản phẩm đã đồng ý bản HTML Chương 4 trong cuộc trao đổi. Đây là yêu cầu tích hợp vào IQX hiện có, không phải xác nhận đã sửa repository, kết nối backend hoặc triển khai production.  
**Bảo toàn bản duyệt:** HTML bàn giao giữ nguyên từng byte của bản xem thử đã được đồng ý; SPEC không viết lại lời giảng, hình hoặc hành vi xem thử.

> **ĐỌC TRƯỚC KHI CODE:** Ghép đầy đủ sáu bài, 24 phần, 17 bảng HTML trong lời giảng và 27 ảnh WebP nhúng vào màn đọc Học viện hiện hữu. Giữ tên, thứ tự, toàn văn, phép tính, bảng, ảnh, chú thích và phóng to. **Chương 4 không có bài kiểm tra; cuối mỗi bài bấm Hoàn thành bài học, lần đầu hợp lệ nhận 100 xu. Không cấp chỉ báo/chỉ tiêu mới.** Không dựng một Học viện khác, không biến ảnh hướng dẫn thành Bộ lọc đang chạy, không ghi tiêu chí ví dụ vào tài khoản hoặc áp danh mục từ sự kiện học.

> **LINH THÚ ĐÃ CÓ TRÊN IQX:** Tìm và tái sử dụng đúng mô hình, tài nguyên, bộ hiển thị và hoạt ảnh đang có. Không dựng/vẽ lại linh thú, không cắt hoặc sao chép ảnh tĩnh/base64 của shell mẫu làm tài nguyên production, không ép người dùng cũ về Bạch Hổ và không khởi tạo lại Bot khi chuyển bài.

---

## 0. Cách dùng, nguồn chuẩn và phạm vi phê duyệt

### 0.1. Đúng hai file, không thêm đầu vào bắt buộc

HTML chứa toàn văn, dữ liệu ảnh và tương tác xem thử. SPEC chứa hợp đồng tích hợp, bản đồ nội dung/tài nguyên, nguồn hoàn thành/xu, ranh giới sản phẩm, bảo toàn dữ liệu và ca nghiệm thu. Không yêu cầu chủ sản phẩm gửi thêm README, prompt, ZIP, JSON, ảnh rời, câu hỏi hoặc các spec cũ để hiểu gói Chương 4.

Dev được tách bài, WebP, component, migration và test thành các file nội bộ trong repository. Đó là đầu ra triển khai, không phải bộ đầu vào thứ ba. Quyền truy cập repository/môi trường và các dịch vụ thật vẫn phải có; mở HTML độc lập không thay thế quyền truy cập này.

### 0.2. Thứ tự dùng nguồn

| Nội dung | Nguồn chuẩn / cách dùng |
|---|---|
| Toàn văn sáu bài, tên, đoạn dẫn, 24 phần, bảng và vị trí ảnh | `script#ch4-content-data` trong HTML đi kèm. Không dùng bản tóm tắt của SPEC thay bài. |
| Giao diện đọc, ảnh/phóng to, trạng thái và điều hướng | HTML đã duyệt, đặc biệt `#ch4-learning-module`; ánh xạ vào component/token hiện hữu. |
| Hoàn thành, xu, quyền, dữ liệu và giới hạn tác động | Các yêu cầu của SPEC này, kế thừa đúng hợp đồng Học viện/Shop mới. |
| Bộ lọc, lưu tiêu chí/danh mục, áp nguồn mua Bot | Hợp đồng tại mục 6–7 dưới đây; tìm service thật đang triển khai, không dùng engine giả trong shell. |
| Nội dung và kết quả Chương 1–3/chương khác | Giữ những gói đã duyệt/đã được nhập. Chương 1/3 dùng kiểm tra 8/8; Chương 2 dùng hoàn thành bằng nút. |
| Mô hình linh thú, dữ liệu tài chính, lịch, tài khoản và quyền gói | Repository và nguồn thật đã được xác minh. Không suy từ ảnh hoặc dữ liệu trình duyệt. |

Căn cứ nghiệp vụ đã dùng: Bộ Học viện mới §5–6; Bộ Shop/Xu/Linh thú §2 và §5; Bộ Chiến lược mới §7–9; Bộ Bot mới §6–7; các gói Chương 1–3 v2.0. Những ranh giới cần cho đợt này được ghi lại trong SPEC để không phải đọc chéo các bản legacy. Tên file nguồn ở metadata chỉ là xuất xứ, không phải URL hoặc tài nguyên còn thiếu.

### 0.3. Các nhãn preview vẫn còn trong HTML

Để giữ nguyên bản duyệt, HTML vẫn chứa `version = iqx-ch4-six-filter-guides-v1.0-preview`, `content_status = published-preview`, manifest `status = preview_for_review` và câu “bản dựng thử để duyệt” trong Thông tin mẫu. Đây là metadata của file độc lập, **không phủ nhận việc chủ sản phẩm đã đồng ý**, cũng không tự cấp trạng thái xuất bản trên server. Dev ánh xạ bản nguồn này vào quy trình xuất bản của IQX; không đổi khóa bài hoặc tạo bài mới để thưởng lại chỉ vì tên phiên bản chứa `preview`.

Chú thích đầu file về Shop/linh thú là phần kế thừa shell, không phải yêu cầu triển khai lại Shop thay Chương 4. Các chuỗi/hàm cũ trong shell không có quyền ghi đè module Chương 4 ở cuối file hoặc nghiệp vụ đã chốt.

### 0.4. Khi phát hiện khác biệt

Ghi chính xác bài/phần/ảnh hoặc component/service, nội dung được yêu cầu, hành vi thực và ảnh hưởng. Không âm thầm sửa lời giảng, vẽ ảnh giao diện tưởng tượng, thay công thức hoặc dùng mock để che điểm thiếu. Tiếp tục phần ghép nội dung độc lập đã đủ đầu vào; phần nối chưa sẵn sàng phải có trạng thái chặn nghiệm thu riêng.

---

## 1. Phạm vi triển khai của gói Chương 4

| Thực hiện | Không thực hiện |
|---|---|
| Nhập sáu bài hướng dẫn vào Học viện hiện có. | Tạo ứng dụng Học viện/Bộ lọc độc lập hoặc dán nguyên shell vào website. |
| Giữ 24 phần, 17 bảng trong lời giảng và 27 ảnh nhúng. | Rút bài thành đề cương, đổi số ví dụ hoặc bỏ ảnh để giảm dung lượng. |
| Phóng to đúng ảnh, Vừa khung/100%, đóng và trở lại bài. | Biến nút bên trong ảnh thành thao tác lọc/lưu/áp nguồn thật. |
| Hoàn thành thủ công, tiến độ theo tài khoản, thưởng lần đầu. | Thêm quiz/điểm 8/8, timer, yêu cầu cuộn hết hoặc thực hành bắt buộc. |
| Dùng lại catalog 13 chương/71 bài và service xu chung. | Thêm sáu bài lần nữa thành 77 bài, tạo ví riêng cho Chương 4. |
| Đối chiếu tên, thao tác và điểm điều hướng với Bộ lọc thật. | Phát triển lại engine lọc, 42 công thức, worker Bot hoặc trang Chiến lược trong gói giáo trình. |
| Bảo toàn nội dung, kết quả, quyền, xu, tài khoản và linh thú. | Reset vốn, tự mở chỉ tiêu, bật Bot, áp danh mục, cộng bù xu hoặc ghi dữ liệu production ngoài quyền được cấp. |

Đây là **giáo trình hướng dẫn Bộ lọc đặt trong Học viện**, không phải gói giao việc xây mới Bộ lọc. Những chức năng được mô tả ở bài 1–6 phải khớp hợp đồng sản phẩm; khi công cụ thật còn thiếu, báo phụ thuộc đúng phạm vi thay vì nhập các ảnh thành editor giả.

## 2. Catalog, định danh và cấu trúc nội dung

### 2.1. Danh mục sáu bài

Tên chương giữ nguyên: **Chương 4 — Sử dụng Bộ lọc**. Nhóm bài: `guide`. Hoàn thành: `manual`. `capability_id = null` cho cả sáu bài.

| Thứ tự | ID tham chiếu | Tên bài | Phần | Ảnh | Bảng HTML | Thưởng lần đầu |
|---|---|---|---|---|---|---|
| 1 | `ch04-l01` | Bắt đầu với Bộ lọc | 4 | 3 | 4 | 100 xu |
| 2 | `ch04-l02` | Thiết lập điều kiện lọc | 4 | 5 | 3 | 100 xu |
| 3 | `ch04-l03` | Chọn kỳ tính cho từng chỉ tiêu | 4 | 2 | 3 | 100 xu |
| 4 | `ch04-l04` | Đọc và kiểm tra kết quả | 4 | 4 | 2 | 100 xu |
| 5 | `ch04-l05` | Điều chỉnh và lưu bộ lọc | 4 | 5 | 1 | 100 xu |
| 6 | `ch04-l06` | Lưu và áp dụng danh mục cho Bot | 4 | 8 | 4 | 100 xu |

Tổng: **6 bài / 24 phần / 27 ảnh / 17 bảng HTML trong lời giảng / 0 câu hỏi**. Các bảng nhìn thấy bên trong ảnh là một phần pixel của ảnh, không cộng vào 17 bảng HTML. Không biến 17 bảng này thành 17 bài tập hoặc thêm một bài kiểm tra cuối chương.

### 2.2. Khóa và phiên bản

| Thuộc tính | Giá trị nguồn |
|---|---|
| Catalog chung | `iqx-academy-outline-13ch-71lessons-v1` |
| Tổng khóa | 13 chương / 71 bài |
| Họ nội dung Chương 4 | `iqx-ch4-six-filter-guides` |
| Content version trong HTML | `iqx-ch4-six-filter-guides-v1.0-preview` |
| Version cặp bàn giao | 1.0 |
| Khóa ổn định bài | `iqx-ch4-six-filter-guides/ch04-l01` … `iqx-ch4-six-filter-guides/ch04-l06` |
| Hoàn thành/quyền | `manual`; không có capability mới |

Các khóa trên là hợp đồng tham chiếu, không bắt đổi primary key đã ổn định trong repository. Lập mapping một-một có bằng chứng. Không chỉ dựa vào số thứ tự, tên gần giống hoặc ID `ch04-lXX` có thể trùng với Chương 4 mười bài legacy. Hoàn thành bài 6 mới không được suy từ bài 6 cũ nếu khác nội dung.

Sáu bài đã nằm trong catalog 71 bài. Chương 4 đếm tối đa 6/6, đóng góp tối đa sáu completion vào tử số/71. Chương 2 và 4 thuộc 12 bài hướng dẫn; không dùng phép đếm chỉ `quiz_passed` khiến bài manual mất khỏi tiến độ.

### 2.3. Bốn phần và vị trí hình — đúng nguồn HTML

Bốn nút nhảy phần giữ **Bắt đầu · Thao tác · Đối chiếu · Lưu ý**. Đây là điều hướng, không phải bốn nhiệm vụ phải thực hiện hoặc điều kiện hoàn thành. Tiêu đề chi tiết của từng phần vẫn lấy đúng các bảng dưới.

#### 1. Bắt đầu với Bộ lọc — `ch04-l01`

**Đoạn dẫn:** Nhận diện các khu vực trên màn hình, chọn phạm vi doanh nghiệp và chuẩn bị những chỉ tiêu cần dùng.

| Phần | Tiêu đề giữ nguyên | Ảnh trong phần | Bảng HTML |
|---|---|---|---|
| 1 | Nhận diện các khu vực trên màn hình | `01-overview`; `02-mobile-entry` | 1 |
| 2 | Chọn thị trường và ngành trước khi thêm điều kiện | `03-scope` | 1 |
| 3 | Kiểm tra những chỉ tiêu đã mở | Không có ảnh; giữ toàn văn/bảng | 1 |
| 4 | Bộ tiêu chí minh họa đi qua sáu bài | Không có ảnh; giữ toàn văn/bảng | 1 |

#### 2. Thiết lập điều kiện lọc — `ch04-l02`

**Đoạn dẫn:** Thêm chỉ tiêu, chọn kỳ, dấu và ngưỡng; kiểm tra vì sao một doanh nghiệp được giữ lại hoặc bị loại.

| Phần | Tiêu đề giữ nguyên | Ảnh trong phần | Bảng HTML |
|---|---|---|---|
| 1 | Thêm điều kiện đầu tiên | `04-library-add`; `05-profit-rule` | 1 |
| 2 | Thêm ROE và đọc quan hệ giữa hai điều kiện | `06-and-rules` | 1 |
| 3 | Chỉnh dấu, ngưỡng và bỏ điều kiện | `07-edit-rule` | 1 |
| 4 | Kiểm tra trạng thái sau khi chỉnh | `08-empty-value` | 0 |

#### 3. Chọn kỳ tính cho từng chỉ tiêu — `ch04-l03`

**Đoạn dẫn:** Chọn đúng khoảng dữ liệu, đọc đúng kỳ báo cáo thực tế và phân biệt thay kỳ với thay ngưỡng.

| Phần | Tiêu đề giữ nguyên | Ảnh trong phần | Bảng HTML |
|---|---|---|---|
| 1 | Đọc kỳ ngay trên từng điều kiện | Không có ảnh; giữ toàn văn/bảng | 1 |
| 2 | Đổi kỳ của LNST và giữ nguyên ROE | `09-period-quarter`; `10-period-ttm` | 1 |
| 3 | Phân biệt các khoảng đang được tính | Không có ảnh; giữ toàn văn/bảng | 1 |
| 4 | “Gần nhất” khác với quý vừa kết thúc trên lịch | Không có ảnh; giữ toàn văn/bảng | 0 |

#### 4. Đọc và kiểm tra kết quả — `ch04-l04`

**Đoạn dẫn:** Kiểm tra số liệu, kỳ báo cáo và lý do loại trừ trước khi chọn doanh nghiệp vào danh mục.

| Phần | Tiêu đề giữ nguyên | Ảnh trong phần | Bảng HTML |
|---|---|---|---|
| 1 | Xác nhận đang đọc đúng bộ điều kiện | `11-results-A` | 0 |
| 2 | Bấm số liệu để kiểm tra cách hình thành kết quả | `12-metric-detail` | 1 |
| 3 | Phân biệt không đạt với không đủ dữ liệu | `13-quality` | 1 |
| 4 | Sắp xếp và chọn mã để nghiên cứu tiếp | `14-selection` | 0 |

#### 5. Điều chỉnh và lưu bộ lọc — `ch04-l05`

**Đoạn dẫn:** Giữ một bộ tiêu chí làm mốc, thay một yếu tố và lưu lại để sử dụng ở những lần nghiên cứu sau.

| Phần | Tiêu đề giữ nguyên | Ảnh trong phần | Bảng HTML |
|---|---|---|---|
| 1 | Lưu bộ tiêu chí ban đầu | `15-save-A`; `16-saved-A` | 0 |
| 2 | Thay một yếu tố để tạo phiên bản B | `17-filter-B` | 1 |
| 3 | Đối chiếu sự khác biệt giữa A và B | `18-results-B` | 0 |
| 4 | Mở lại bộ lọc và đọc dữ liệu mới | `19-saved-AB` | 0 |

#### 6. Lưu và áp dụng danh mục cho Bot — `ch04-l06`

**Đoạn dẫn:** Giữ tập mã đã chọn, phân biệt danh mục nghiên cứu với nguồn mua đang hiệu lực và chủ động kiểm soát việc thay nguồn.

| Phần | Tiêu đề giữ nguyên | Ảnh trong phần | Bảng HTML |
|---|---|---|---|
| 1 | Lưu danh mục từ kết quả đã kiểm tra | `20-save-list`; `21-list-detail` | 1 |
| 2 | Áp dụng từ kết quả hiện tại hoặc danh mục đã lưu | `22-apply-direct`; `23-apply-saved` | 1 |
| 3 | Phân biệt đang chờ với đang sử dụng | `24-source-pending`; `25-source-effective` | 1 |
| 4 | Cập nhật danh mục, quay về VN30 và xử lý vị thế cũ | `26-return-vn30`; `27-bot-old-positions` | 1 |

## 3. Nội dung phải bảo toàn

### 3.1. Những điểm trọng tâm theo bài

| Bài | Điểm phải giữ khi nhập và rà soát |
|---|---|
| 1 | Mở Chiến lược → Bộ lọc; nhận diện thư viện trái, thị trường/ngành, điều kiện, kết quả và nguồn mua Bot; phân biệt đã mở chỉ tiêu với đã thêm điều kiện; ví dụ hai chỉ tiêu LNST/ROE. |
| 2 | Thêm đúng LNST, nhập 15 ở ô có %, không 0,15; thêm ROE; AND; dấu >/< chặt; bằng ngưỡng không đạt; thiếu dữ liệu không được cho qua; bỏ/chỉnh đúng dòng; ô trống không là 0. |
| 3 | Kỳ riêng từng chỉ tiêu; đổi LNST quarter→ttm không đổi ROE; đưa LNST về quarter sau đối chiếu; YoY đúng cùng kỳ; quý riêng khác lũy kế; gần nhất khác quý vừa kết thúc; ROE không có quý riêng. |
| 4 | Đọc phạm vi và điều kiện trước kết quả; cột tham khảo không tự thành điều kiện; mở số liệu xem kỳ/thành phần/công bố/tiếp nhận/mốc dữ liệu; ví dụ riêng 80→88; thiếu/không áp dụng/không đạt phân biệt; chọn mã; Backtest vẫn một mã. |
| 5 | Lưu bộ A trước khi sửa; B chỉ nâng ngưỡng LNST 15→25, giữ kỳ và ROE; so trên cùng dữ liệu; kết quả B có thể ít hơn hoặc bằng; ít mã không tự tốt hơn; mở lại bộ lọc lấy kỳ gần nhất tại lần dùng, không khóa về quý lúc lưu. |
| 6 | Lưu danh mục khác Lưu bộ lọc và khác vị thế; chọn subset/toàn bộ; áp trực tiếp hoặc từ danh mục đã lưu; xác nhận; pending/effective; thay VN30 chứ không cộng/giao; snapshot cố định; Về VN30; xét Bán mọi vị thế cũ; không bán cưỡng bức hoặc stop ngầm. |

### 3.2. Văn phong và giới hạn

Giữ tiếng Việt, đoạn dẫn, nhấn mạnh, đơn vị, dấu, ví dụ và kết luận có phạm vi. Không viết lại bằng kiến thức ngoài bộ nguồn; không chèn các phần kế toán hợp nhất/công ty mẹ đã bỏ vào lời giảng. Tên **Tăng trưởng LNST YoY** phải khớp Học viện và Bộ lọc.

Không thêm lab, câu hỏi nhỏ, bảng xếp hạng, bài tập giao dịch, bài thi, thời gian đọc, khẩu hiệu, khối “Nhớ điều này” hoặc phần tổng kết trùng. Không lặp lời chú thích dành cho dev kiểu “ảnh từ HTML đã duyệt”, “không phải ô nhập” dưới mọi hình. Giữ đúng caption thao tác, số đánh dấu, thông tin kỳ/đơn vị và lưu ý nghiệp vụ đã có. Thông tin nguồn giả lập được giữ trong metadata/Thông tin mẫu; không xóa nhãn minh họa rồi quảng bá số liệu như kết quả doanh nghiệp thật.

### 3.3. Nội dung là bất biến theo phiên bản

Bài và ảnh không đọc cấu hình, danh mục hoặc số liệu tài chính mới nhất của tài khoản để tự thay ví dụ. Đổi ngưỡng trong công cụ thật không được đổi bảng A/B hoặc hình trong bài. Cập nhật số liệu thị trường không viết lại giáo trình.

`sections[].html` chứa cấu trúc cần giữ; không chuyển toàn bộ thành `textContent` hoặc thay bằng bảng tóm tắt của SPEC. Giữ các thẻ phân số, phép nhân/phần trăm, bảng, `figure`, `figcaption`, `strong`, `em` và các điểm gắn ảnh.

## 4. Màn đọc, điều hướng và khả năng sử dụng

### 4.1. Khung ba vùng

Dùng khung hiện có: **nội dung bài bên trái → panel Học viện bên phải → thanh công cụ ngoài cùng bên phải**. Header và route website thật giữ nguyên. Không chuyển thư viện Bộ lọc vào panel Học viện hoặc chuyển Học viện thành sidebar trái theo ảnh công cụ.

Panel Học viện có Tiến độ học tập x/71, chương thu/mở và x/6 cho Chương 4. Mỗi dòng chỉ **Xem bài / ✓ Đã học**, không có Cấu hình, Luyện tập hoặc công tắc giao dịch. Giữ bài đang chọn, chương đang mở và vị trí cuộn khi cập nhật completion.

Reader theo thứ tự: Về linh thú / tiến độ chương → tên chương, số bài 01/06…06/06, tên bài, lead, trạng thái → bốn nút nhảy phần → bốn phần toàn văn → Hoàn thành → bài trước/sau. Cuộn nội dung độc lập panel. Bấm Hoàn thành không tự chuyển bài hoặc mở Shop.

Mẫu mở bài 1 Chương 4 với 0/71, 0 xu để duyệt. Production khôi phục ngữ cảnh và trạng thái người dùng đã có; không reset hoặc giành màn hình mỗi lần nhập nội dung/deploy. Bài ở các chương khác chưa có trong file này chỉ là placeholder của mẫu, không phải lệnh xóa bản đã có trong repository.

### 4.2. Điện thoại, bảng và công thức

Tái sử dụng breakpoint của khung đã duyệt; ở màn hình nhỏ panel trượt bên phải cạnh rail, chọn bài thì thu panel để đọc. Có điều khiển Danh sách bài để mở lại; không đưa Học viện xuống dưới bài hoặc biến rail thành hàng ngang.

Kiểm tra 1440, 1024, 390 và 360 px. Không tràn ngang toàn trang, không giảm chữ toàn bài để ép vừa. Bảng rộng cuộn trong vùng `.table-scroll`, giữ tiêu đề và đơn vị. Công thức 80→88 có tử/mẫu đọc được, dấu `<`/`>` không bị parser nuốt. Tiêu đề dài, nút Hoàn thành và footer không che nhau.

### 4.3. Điều hướng và tương tác không tạo nghiệp vụ

Về linh thú trả về đúng loài đang sử dụng qua renderer hiện có, không luôn Bạch Hổ. Bài trước/sau và nhảy phần không hoàn thành bài đang rời. Nút/đường dẫn Chiến lược thật mở đúng tab theo router đã xác minh, không dùng popup danh mục mô phỏng của shell để thay `/chien-luoc`.

Bài hiện tại không yêu cầu thêm một nút “Mở Bộ lọc” hoặc editor mới. Khi hệ thống có điểm điều hướng sẵn, chỉ giữ ngữ cảnh/chỉ tiêu theo router nếu phù hợp, không nạp ngưỡng 15/25, không xóa bản đang chỉnh, không chọn hoặc áp danh mục thay người dùng.

Focus rõ cho nút, bảng cuộn và hộp ảnh. Escape đóng ảnh trước; không đồng thời đóng bài. Trả focus về nút mở ảnh. Reduced Motion không cưỡng bức cuộn mượt. Không khóa hoàn thành vì ảnh chưa được phóng to hoặc chưa tải thành công.

## 5. Ảnh hướng dẫn và dữ liệu nhúng

### 5.1. Nguồn và cách bảo toàn

27 WebP nằm trong `images[id].src` dạng `data:image/webp;base64,...`, đã có kích thước, caption, SHA-256, nguồn và danh sách số đánh dấu. Chúng được chụp từ `IQX-Bo-Chien-Luoc-MAU.html` theo metadata của bản duyệt; chỉ thêm khung/số chú thích và ẩn thanh xem thử/toast khi chụp. Ảnh đã nhúng đủ để triển khai nội dung mà không phải chụp lại từ nguồn cũ.

`images.source`, `source_sha256` và các selector trong `marks` là metadata nguồn, không là URL tải tài nguyên hoặc tên component bắt buộc. Đặc biệt ID danh mục ngẫu nhiên trong selector của ảnh `23-apply-saved` không phải ID phải hardcode vào production.

Dev có thể trích các WebP thành asset nội bộ có version. Giữ nguyên pixel, tỷ lệ, nội dung nút, biểu thức, số liệu, caption và số đánh dấu; không thay ảnh bằng thiết kế mới hoặc sửa số trên ảnh để khớp một dữ liệu khác. Không dùng ảnh linh thú nền theo cách trích ảnh hướng dẫn: tài nguyên linh thú thật phải được tái sử dụng từ IQX.

### 5.2. Hiển thị và phóng to

Mỗi `img[data-image-src]` được nối đúng `images[id].src`. Nút `[data-image]` ở tiêu đề hình và nút bọc ảnh cùng mở đúng ID. `figure` có thể có tiêu đề ngắn khác `images[id].caption`; giữ cả hai theo nguồn, không tự chuẩn hóa thành một câu khác.

Hộp ảnh có **Vừa khung / 100% / Đóng ×**. Vừa khung không vượt vùng xem; 100% dùng kích thước pixel ảnh, cuộn nội bộ. Click nút Lưu/Áp dụng nhìn thấy trong ảnh chỉ là click ảnh để xem lớn, tuyệt đối không gọi API tương ứng. Ảnh không phải một bộ lọc có khả năng thực thi.

Giữ alt, kích thước width/height, tải lười và lỗi tại ảnh với nút Thử lại. Lỗi một ảnh không xóa toàn bài hoặc dữ liệu học/xu. Trên app có renderer riêng, tái tạo cùng trải nghiệm và bảo toàn ảnh, không bắt phải dùng tên hàm của prototype.

### 5.3. Kiểm kê 27 ảnh

SHA-256 dưới đây tính trên byte WebP đã giải mã, không phải chuỗi base64 hoặc toàn HTML.

| ID | Nội dung ảnh trong metadata | Kích thước px | SHA-256 WebP |
|---|---|---|---|
| `01-overview` | Các khu vực của Bộ lọc | 2160 × 1842 | `d144985101c97fc4a40b02915026d384ffb2dea73ef136b675efc5c98cb15123` |
| `02-mobile-entry` | Mở thư viện Chỉ tiêu trên màn hình nhỏ | 585 × 198 | `6f4c2457192172c51d433dadf536e0fc0fcd7b9bba78ece65651d8938e22d7f3` |
| `03-scope` | Thị trường và ngành | 1742 × 192 | `a190aeb4bbff04585f90535a15f10452d3497576a9239207c8e1447f334b0310` |
| `04-library-add` | Tìm và thêm chỉ tiêu từ thư viện | 428 × 869 | `a81ef5300711f6954a427fc7aa44830a696045b65b19f10b06a2a3313ffdcd52` |
| `05-profit-rule` | Thiết lập Tăng trưởng LNST YoY | 870 × 228 | `60b0075a5b1063e5dc9a94605daf622aec81dbb2da5692d195ce031771d6cf52` |
| `06-and-rules` | Hai điều kiện kết hợp AND | 1742 × 347 | `61642f17b4d300c899401e67d10fde8edd7df7593c8b0f29d56af5d960245da3` |
| `07-edit-rule` | Sửa dấu, ngưỡng hoặc bỏ điều kiện | 870 × 228 | `4cc19809982f3f36ce66adb971198fc2949361349b2b1ade64eb732c01d5fddf` |
| `08-empty-value` | Nhận biết điều kiện chưa hợp lệ | 1742 × 912 | `b6e57a49fd8df20c85bbbd27ae939c43e7e0bbed5ea3e182b3a708730967a46a` |
| `09-period-quarter` | Trước khi đổi kỳ: LNST theo quý | 1742 × 347 | `41f3817c416d1dce7807d5445bb4ff7f95f70a281007fdf16cda080d0184f837` |
| `10-period-ttm` | Sau khi đổi riêng kỳ LNST | 1742 × 1121 | `90af5a76727687fd779e87995b75029160a4fbdd8b9bb24ee93cf3a84336d1c2` |
| `11-results-A` | Kết quả của bộ tiêu chí A | 1742 × 908 | `1980cc31e1f8dab60ed16c7066ee2b1c715341ab5e16e2c8cfb4c9a20847e5a6` |
| `12-metric-detail` | Đọc kỳ và thành phần của một số liệu | 1029 × 1062 | `056bd7e53319067a8e9a78e5e44b4c0508298db06e7b2cf5972600449593f73d` |
| `13-quality` | Kiểm tra nguyên nhân thiếu dữ liệu | 1029 × 539 | `f6213889ddb9ce5d22f06897111734bcee1c910f6da21add5aa45523d33f2a2c` |
| `14-selection` | Chọn hai mã trong kết quả | 1742 × 912 | `0fb67a96291f6f428c303b81a05bc7c5ce323a36eb5f917f2d95c1c0617a96d9` |
| `15-save-A` | Đặt tên và lưu bộ tiêu chí A | 1029 × 477 | `3a9bb66a972f96db4dc01e9aaad4645fc81d3410722348663df50f794d6db530` |
| `16-saved-A` | Mở bộ tiêu chí đã lưu | 1029 × 468 | `6ee52d97cab46419070a97f7f2fa5fc73e1c51e7959350946cb2765b6b0e86c8` |
| `17-filter-B` | Chỉ nâng ngưỡng LNST từ 15 lên 25 | 1742 × 347 | `b720e1a54f98a90dd261229ec065183372a720036c8bf136b960e14a84a291a2` |
| `18-results-B` | Kết quả của bộ tiêu chí B | 1742 × 717 | `4bc9656926efb1e8f364b47fdeffa257ebfe2c12759af383d1ef2aa903274c98` |
| `19-saved-AB` | Hai bộ tiêu chí A và B được lưu riêng | 1029 × 575 | `7b8438393317feddd5c040cc2e9fb31aa9c5492665dc267743398638a880018b` |
| `20-save-list` | Lưu danh mục của hai mã đã chọn | 1029 × 477 | `c6dcf18bf5aa16978308ed121c400cb2d6e6cefb81e321a6dc828766eed8c504` |
| `21-list-detail` | Xem tập mã và số liệu đã lưu | 1029 × 848 | `1e91bcb7367005c1e2962ca8ecdc0fe17d05a849da9624b07f16561ce5331056` |
| `22-apply-direct` | Áp dụng trực tiếp từ kết quả đang chọn | 1029 × 846 | `01e22123128e8d16682ce1e0ea52343d976d456f845e37475ffc1660055a1294` |
| `23-apply-saved` | Áp dụng từ danh mục đã lưu | 1029 × 468 | `8e4b668f82625a071a0a5f4859534f2cc12d94b901ae27fb112d1b05144eabdd` |
| `24-source-pending` | Nguồn hiện tại và thay đổi đang chờ | 1742 × 252 | `a479e42f456d1a7e5ee879dea5db6dd0a451f69218bcaead49fb047793131bc5` |
| `25-source-effective` | Danh mục mới đã có hiệu lực | 1742 × 164 | `3fa21871b4ad4fa7d9fac5d5e1c9ed1476ae8e3f86fb24db92a360111468eea4` |
| `26-return-vn30` | Đọc thông tin trước khi xác nhận về VN30 | 1029 × 507 | `71c93c4e407d76cbf3a12ad7321cd0d17aff719daf4a923ad10a2f610946c70a` |
| `27-bot-old-positions` | Vị thế cũ tiếp tục được xét Bán | 1029 × 1098 | `996ec057f0ceb27459ba840aa6f576bdb278ad63a3a73c2aaf35fc884e393b48` |

## 6. Ví dụ xuyên suốt và hợp đồng Bộ lọc cần đối chiếu

**Mục này là hàng rào để ghép bài đúng sản phẩm, không giao xây lại Bộ lọc trong đợt giáo trình.** Tìm nguồn thật; tái sử dụng phần đúng. Nếu còn thiếu, báo đúng điểm nối/test bị chặn. Không đổi lời giảng để che thiếu chức năng hoặc biến ảnh chụp thành chứng cứ backend đã chạy.

### 6.1. Hai phiên bản A/B của dữ liệu minh họa

| Đầu vào | A | B |
|---|---|---|
| Thị trường | Tất cả (`all`) | Giữ nguyên |
| Ngành | Tất cả ngành (`all`) | Giữ nguyên |
| LNST YoY | Quý gần nhất; > 15% | Quý gần nhất; > 25% |
| ROE | Bốn quý gần nhất; > 15% | Giữ nguyên |
| Quan hệ | AND | AND |
| Mốc dữ liệu mẫu | 31/12/2025 | Cùng mốc |
| Kết quả mẫu | CMG, FPT, HPG, MBB, MWG — 5 mã | FPT, HPG, MWG — 3 mã |
| Tập chọn để minh họa lưu/áp | CMG, FPT | Không lấy B để thay tập chọn này khi giải thích ảnh A |

Nguồn đối chiếu là `reference_filter` trong HTML. Những kết quả trên chỉ thuộc bộ giả lập dùng chụp hình, **không phải báo cáo, xếp hạng hoặc khuyến nghị đối với các doanh nghiệp có mã đó**. Không lấy mốc 31/12/2025 làm mặc định cố định của Bộ lọc thật.

A/B chỉ đổi ngưỡng LNST. Trên cùng dữ liệu/phạm vi, tập B là tập con của A; số kết quả có thể ít hơn hoặc bằng, không bắt buộc giảm trong mọi tình huống. Ít mã hơn không tự tốt hơn. Nếu đồng thời cập nhật báo cáo thì không quy toàn bộ khác biệt cho thay ngưỡng.

Bài 4 phần 2 có **ví dụ riêng từ Chương 3: LNST 80→88 tỷ, tăng 10%, không đạt >15%**. Không đồng nhất nó với số liệu của mã đang được mở ở ảnh `12-metric-detail`; không thay số trên ảnh hoặc trong bài để ép hai ví dụ bằng nhau.

### 6.2. Quy tắc điều kiện và bảng

Tên chỉ tiêu khớp Học viện; không thêm badge viết tắt, tab Mua/Bán hoặc chỉ tiêu kỹ thuật vào Bộ lọc. Mỗi điều kiện có chỉ tiêu, kỳ, dấu và ngưỡng theo đúng đơn vị. Trong phạm vi đang dạy, mỗi chỉ tiêu thêm một lần, các điều kiện AND, dấu `>`/`<` nghiêm ngặt; bằng ngưỡng không đạt.

Ô có đơn vị % nhận 15 để chỉ 15%, không 0,15. Nếu API thật dùng tỷ lệ 0,15, ánh xạ đơn vị đúng một lần ở adapter, không đổi nội dung bài hoặc nhân/chia thêm lần nữa. Dùng độ chính xác tính toán của hệ thống; làm tròn chỉ hiển thị. Không thêm arbitrary expression, OR, toán tử khoảng hoặc bản sao cùng chỉ tiêu khác kỳ.

Phạm vi Thị trường/Ngành khác nguồn mua Bot. Ô ngưỡng trống là không hợp lệ, không phải 0; điều kiện hỏng không được âm thầm bỏ để phần còn lại chạy. Không có điều kiện thì chỉ xem doanh nghiệp trong phạm vi chưa được lọc theo tiêu chí tài chính, không thành tín hiệu Mua.

Cột tham khảo không tự là điều kiện. Thiếu dữ liệu ở cột không dùng không được tự loại mã; thiếu ở điều kiện bắt buộc thì không được coi đạt. Sắp xếp bảng chỉ đổi thứ tự, không đổi tiêu chí hoặc thứ tự ưu tiên mua của Bot. Kết quả nhiều trang phải có cùng mốc dữ liệu, lựa chọn toàn bộ không chỉ là trang đầu.

### 6.3. Kỳ tính đúng từng chỉ tiêu

| Chỉ tiêu / alias mẫu | Mặc định | Các kỳ hợp lệ |
|---|---|---|
| Tăng trưởng doanh thu YoY / `rev` | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| Tăng trưởng LNST YoY / `profit` | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| Tăng trưởng EPS YoY / `eps` | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| Biên lợi nhuận gộp / `gm` | Bốn quý gần nhất | Bốn quý gần nhất; Quý gần nhất; Năm tài chính gần nhất |
| Biên lợi nhuận ròng / `nm` | Bốn quý gần nhất | Bốn quý gần nhất; Quý gần nhất; Năm tài chính gần nhất |
| ROE / `roe` | Bốn quý gần nhất | Bốn quý gần nhất; Năm tài chính gần nhất |

Alias mẫu phải map vào factor thật, không tạo sáu factor mới nếu đã có. ROE không có quý riêng. Đổi kỳ LNST không đổi ROE; số liệu, header và chi tiết của LNST phải cùng kỳ mới. Kỳ mặc định chỉ dùng khi khởi tạo điều kiện mới, không ghi đè lựa chọn đã lưu.

Quý gần nhất là quý riêng mới nhất đã có dữ liệu hợp lệ, không phải lũy kế 6/9 tháng. YoY quý so cùng quý năm trước; bốn quý so bốn quý tương ứng lùi một năm; năm dùng năm tài chính đầy đủ. Không lấy quý liền trước dưới nhãn YoY; không mặc định năm tài chính của mọi doanh nghiệp trùng năm dương.

Bốn quý phải liên tiếp và đúng cơ sở; không lấy ba quý hoặc nhân quý mới nhất bốn lần. Biên dùng tỷ số từ tổng số gốc, không cộng/trung bình đơn giản các biên; vốn không cộng như dòng lợi nhuận, EPS không tự cộng bốn quý khi basis không cho phép. Những công thức này thuộc registry/provider được duyệt; đợt Chương 4 không thay engine tài chính.

### 6.4. Mới nhất, nguồn và dữ liệu thiếu

Mỗi kết quả có mốc dữ liệu; resolver “gần nhất” theo từng doanh nghiệp. Kỳ vừa kết thúc chưa chắc có báo cáo đã công bố và được tiếp nhận. Doanh nghiệp có thể khác kỳ mới nhất; hiển thị đúng kỳ dưới từng số. Sang năm mới không tự tạo báo cáo năm chưa có. Không quay lui một khoảng cũ để tránh thiếu dữ liệu mà không thể hiện đúng trạng thái.

Bấm số liệu mở giá trị/đơn vị, kỳ thực tế, khoảng tính, kỳ so sánh nếu có, thành phần, công bố, tiếp nhận và mốc dữ liệu theo nguồn thật. Không giả ngày công bố hoặc mức kiểm toán. Cách gọi LNST ngắn trong bài không đổi basis/field của từng chỉ tiêu ở backend; giữ định nghĩa thật đã được duyệt, không thêm bài giảng phân biệt kế toán.

| Trạng thái | Hành vi cần giữ |
|---|---|
| Có số hợp lệ | So ngưỡng trên giá trị gốc; số âm hợp lệ không phải missing. |
| Chưa đủ dữ liệu | Hiện —/lý do; không cho đạt điều kiện bắt buộc. |
| Không áp dụng | Hiện trạng thái và lý do riêng, không giả 0. |
| Không tính được | Theo quy tắc kỳ gốc/mẫu số của chỉ tiêu, không thay bằng trị tuyệt đối hoặc vô cực. |
| Điều kiện không hợp lệ / nguồn lỗi | Báo lỗi đúng; không chỉ báo 0 doanh nghiệp như một kết quả lọc thành công. |

Không mở 36 chỉ tiêu còn lại chỉ vì catalog có tên; định nghĩa, kỳ, nguồn và quyền của chúng phải được xác minh trong các gói tương ứng. Không gán policy quarter/ttm/year của sáu chỉ tiêu này lên mọi bài cơ bản tương lai.

## 7. Lưu và áp dụng danh mục — hàng rào tích hợp bài 5–6

### 7.1. Bốn đối tượng không được trộn

| Đối tượng | Bản chất | Không tự gây ra |
|---|---|---|
| Bộ lọc đã lưu | Giữ phạm vi và tiêu chí/kỳ/dấu/ngưỡng; lần dùng lại lấy dữ liệu gần nhất trong mốc được phép. | Không giữ danh sách kết quả cố định, không đổi nguồn Bot. |
| Danh mục nghiên cứu đã lưu | Tập mã được xác nhận, số liệu/kỳ/tiêu chí/mốc dữ liệu lúc lưu, hoặc tham chiếu bất biến tương đương. | Không mua, không trở thành vị thế, không tự cập nhật theo báo cáo mới. |
| Nguồn mua mới của Bot | VN30 hoặc snapshot tập mã được người dùng xác nhận áp dụng và đã hiệu lực. | Không tự bật kỹ thuật hoặc mua ngay mọi mã. |
| Vị thế đang nắm giữ | Cổ phiếu đã mua và chưa bán hết trong tài khoản theo sổ thật của dịch vụ. | Không mất chỉ vì đổi/xóa tiêu chí nghiên cứu. |

Danh mục theo dõi từ Săn mã là đối tượng độc lập khác; không lấy checkbox Theo dõi để thay nguồn mua mới Bot. Lưu bộ lọc khác Lưu danh mục khác Áp dụng cho Bot. Thao tác tên trùng/hạn mức theo service được duyệt; không áp hạn mức 20 mục của bản mẫu thành chính sách production, không ghi đè ngầm chỉ vì trùng tên.

### 7.2. Xác nhận nguồn từ hai đường đi

Kết quả hiện tại → chọn mã → Áp dụng cho Bot → đọc và xác nhận tên/tập mã/phiên. Hoặc Danh mục đã lưu → Áp dụng cho Bot → xác nhận. **Không bắt Lưu danh mục trước** đường đi trực tiếp. Bằng chứng nguồn được giữ nội bộ không tự tạo thêm một mục trong Danh mục đã lưu khi người dùng chưa chọn lưu.

Có chọn riêng thì áp đúng subset; chưa chọn riêng thì form nêu rõ toàn bộ kết quả. Toàn bộ gồm mọi trang của cùng kết quả/mốc dữ liệu. Form cho bỏ bớt; bỏ hết thì không xác nhận. Hủy form không tạo yêu cầu. Server xác minh owner, quyền yếu tố nguồn, phiên bản kết quả/danh mục và từng mã; có mã không hợp lệ thì báo để xác nhận lại, không âm thầm loại rồi áp phần khác.

Danh mục riêng **thay VN30**, không hợp/cộng hoặc lấy giao với VN30. Có thể có mã ngoài VN30 trong phạm vi giao dịch hỗ trợ. Nhiều danh mục đã lưu không tạo nhiều Bot hoặc nhiều nguồn mua chạy đồng thời.

### 7.3. Chờ hiệu lực, nguồn hiệu lực và lịch thật

Ngày D là ngày server nhận lưu theo Asia/Ho_Chi_Minh. Hiệu lực ở phiên hợp lệ đầu tiên có ngày lớn hơn D theo lịch IQX đã xác minh, kể cả lưu trước mở cửa ngày D. Không dùng D+24 giờ, không lấy ngày trong screenshot hoặc hàm bỏ cuối tuần của mẫu làm lịch thật.

Khối Danh mục mua mới của Bot hiển thị nguồn đang dùng, tên/số mã và Xem danh sách/Xem Bot/Về VN30 khi phù hợp; bên dưới là thay đổi đang chờ, phiên hiệu lực và Hủy thay đổi. Pending không được gắn nhãn đang dùng. Trước phiên hiệu lực vẫn xét theo nguồn cũ; hủy pending không đổi nguồn hiệu lực. Tranh chấp hủy/áp dùng revision/transaction thật, không báo đã hủy nếu đã có hiệu lực.

### 7.4. Snapshot cố định và phạm vi Bán

Báo cáo mới, đổi kỳ/ngưỡng, sắp xếp hoặc dùng lại bộ lọc không tự sửa tập mã đã áp. Muốn cập nhật phải lọc/chọn/xác nhận lại. Về VN30 cũng là yêu cầu có xác nhận và chờ phiên hiệu lực, không xóa danh mục đã lưu hoặc ép bán.

Bot xét Bán mọi vị thế theo điều kiện Bán đang hiệu lực, kể cả mã rời nguồn mua. Không khóa vị thế cũ vào điều kiện lúc mua; nguồn lúc mua chỉ là bằng chứng lịch sử. Không tự bán vì chỉ tiêu cơ bản không còn đạt. Chưa có điều kiện Bán thì không có stop/chốt lời/trailing hoặc giới hạn 60 phiên ngầm.

Nguồn rỗng/lỗi không fallback sang VN30/Săn mã/tất cả mã. Không mua mới trên nguồn chưa xác minh; vẫn xét Bán những vị thế đủ dữ liệu. Xóa danh mục đang dùng/chờ cần xử lý nguồn/pending phù hợp trước, giữ snapshot và lịch sử; không bán hoặc reset tài khoản để xóa.

### 7.5. Quan hệ với Backtest/Cảnh báo

Mở Backtest từ một mã của danh mục vẫn chỉ kiểm thử một mã; không biến thành backtest danh mục nhiều mã dùng chung vốn hay chứng minh bộ lọc tài chính đã chọn đúng các mã đó trong quá khứ. Cảnh báo ghim phạm vi/điều kiện của chính nó; đổi nguồn mua Bot không tự đổi cảnh báo.

Bot và Backtest dùng chung cấu hình kỹ thuật **đã lưu**; chỉ đọc bài, hoàn thành, xem ảnh hoặc mở kết quả không lưu cấu hình. Mini có bản thử riêng, giới hạn giữ mặc định 60 phiên chỉ ở mini. Không đưa hạn mức mini, vốn hoặc lệnh Bot vào cơ chế hoàn thành Chương 4.

## 8. Hoàn thành bài hướng dẫn — nguồn xác nhận ở server

### 8.1. Điều kiện hoàn thành

Người dùng có quyền đọc nội dung đã xuất bản, chủ động bấm **Hoàn thành bài học** trên đúng bài là đủ. Không yêu cầu học đủ Chương 3, mở sáu chỉ tiêu, dùng Bộ lọc, lưu A/B, chọn mã, áp Bot, giao dịch, có lợi nhuận, sở hữu linh thú, xem hết ảnh, cuộn hết hoặc chờ đủ phút.

Nút nằm cuối bài là vị trí giao diện, không phải chứng cứ đã đọc từng chữ. Không tạo `score=8`, `passed=true` hoặc `quiz_passed` giả để dùng lại schema bài kiểm tra. Dùng completion method `manual` hoặc ánh xạ tương đương của hệ thống.

### 8.2. Luồng và trạng thái

| Trạng thái | Giao diện / xử lý |
|---|---|
| Chưa hoàn thành | Có nút Hoàn thành bài học; xem bài/ảnh không tạo completion. |
| Đang gửi | Giữ bài, hiển thị Đang ghi nhận…, chống bấm trùng; chưa cộng tiến độ/xu như đã thành công. |
| Server đã ghi | Hiện ✓ Đã học / ✓ Đã hoàn thành; giữ thời điểm đầu; giữ bài, vị trí và chương đang mở. |
| Đã ghi nhưng response bị mất | Retry cùng ý định hoặc đọc lại trả bản đã có, không ghi hai completion. |
| Lỗi quyền/phiên bản/ghi | Báo đúng lỗi, giữ trạng thái xác nhận trước đó; không completion hoặc xu giả. |
| Đã hoàn thành | Cho đọc lại; không cần hoàn thành lần nữa, không mất do đổi hình hoặc nội dung tạm lỗi. |
| Nội dung chưa xuất bản | Không nhận hoàn thành từ tên bài/placeholder, dù client gửi yêu cầu trực tiếp. |

Hoàn thành một bài chỉ tăng đúng một bài. Bài 6 hoàn thành trước là 1/6, không tự hoàn thành toàn chương. Không có nút hoàn thành cả chương. Tiến độ toàn khóa đếm tập bài ổn định đã hoàn thành theo đúng catalog, không cộng số request, số lần xem, số xu hoặc số ảnh đã mở.

### 8.3. Không cấp capability hoặc tác động tài khoản

Chương 4 không cấp `profit`, `roe` hay bất kỳ chỉ tiêu/kỹ thuật nào. Quyền đã có phải giữ nguyên; `capability_id = null` không phải yêu cầu xóa quyền trước đó. Quyền sử dụng công cụ vẫn theo bài kiến thức và guard/gói hiện hành. Không bắt hoàn thành Chương 4 như một cổng mới để dùng chỉ tiêu đã mở.

Completion không ghi master/buy/sell, params/rules, shared-config revision, nguồn mua/pending, cảnh báo, danh mục, job Backtest/Bot hoặc giao dịch. Không gọi onboarding hoặc cấp lại 100 triệu. Hoàn thành và xu không sửa tiền VND, cổ tức chờ, vị thế, giá vốn, lệnh, lịch sử hoặc loài đang dùng.

## 9. Thưởng 100 xu lần đầu — dùng dịch vụ chung

### 9.1. Chính sách cố định

Mỗi bài có completion hợp lệ lần đầu nhận 100 xu; sáu bài tổng 600 xu. Không thưởng riêng hoàn thành chương. Không bắt đủ sáu bài mới thưởng từng bài. Học lại, retry, đổi tên/ID vị trí hoặc content version cùng bài không tạo quyền thưởng mới; tiêu hết xu cũng không làm phần thưởng được nhận lại.

Khóa nghiệp vụ duy nhất: **owner + họ thưởng hoàn thành lần đầu + định danh bài ổn định**. Không dùng request ID, attempt, version nội dung, ngày deploy hay số chương làm khóa cho phép trả thêm. ID request dùng chống lặp thao tác, không thay khóa thưởng vĩnh viễn theo bài.

### 9.2. Ghi và đối soát

```text
Ý định Hoàn thành từ tài khoản xác thực
→ Học viện xác minh bài/phiên bản đã xuất bản, quyền và mode manual
→ ghi completion duy nhất + bằng chứng
→ ghi thưởng cùng transaction hoặc phát outbox tin cậy
→ dịch vụ xu đối chiếu completion và khóa thưởng
→ commit +100 một lần
→ trả tiến độ và trạng thái thưởng/số dư đã xác nhận
```

Học viện là nguồn completion; ví là nguồn bút toán/số dư, không suy ngược Đã học từ số xu. Không tạo ví riêng Chương 4, không nhập `SHOP.completions` của HTML làm bằng chứng thật. Client không gửi amount/owner/score như sự thật; không có endpoint công khai “tặng 100 xu”.

Nếu completion đã ghi nhưng reward chậm/lỗi: giữ Đã học, báo **Đang cập nhật xu** khi cần và sửa từ sự kiện/bằng chứng cũ. Không bắt bấm hoàn thành lại, không phát một completion mới để sửa lỗi, không thông báo đã nhận trước commit.

### 9.3. Giao diện và các trường hợp lặp

| Tình huống | Tiến độ / xu |
|---|---|
| Đọc, chuyển bài, phóng to, mở công cụ | Không hoàn thành, không thưởng. |
| Lần đầu hoàn thành đúng bài | +1 bài; +100 khi bút toán xác nhận. |
| Hai tab cùng bài / retry sau timeout | Tối đa một completion và một khoản +100. |
| Hai tab hoàn thành hai bài khác nhau | Giữ cả hai completion; +200 nếu đều chưa thưởng. |
| Đọc lại hoặc cập nhật bản nội dung cùng bài | Không thưởng lại, không reset completion. |
| Đã dùng xu mua linh thú rồi học lại | Không cộng bù số đã chi. |
| Hoàn thành đủ sáu bài lần đầu | 6/6, tổng +600; không mở capability, không thưởng chương thêm. |

Thông báo sau commit: **Hoàn thành bài học · +100 xu**. Trong bài đã thưởng có thể hiện Đã nhận 100 xu. Không thêm nút Nhận thưởng hoặc bắt mở Shop; thông báo không che nội dung hay làm mất vị trí đọc. Số dư trên header/panel/modal cùng một nguồn đã xác nhận, không tính bằng số bài ×100 trừ số linh thú ×500.

Shop hiện hành: Bạch Hổ miễn phí mặc định tài khoản mới, bốn linh thú khác 500 xu/con; Mua chỉ cấp sở hữu, Sử dụng mới đổi loài, đổi miễn phí. Gói này không triển khai lại Shop. Nhận/tiêu xu hoặc đổi loài không thay quyền học, vốn, cấu hình hay giao dịch.

### 9.4. Người đã hoàn thành trước khi có xu

Giữ completion hợp lệ và mọi bút toán đã có. Trường hợp chưa thưởng cần đối soát mapping/ledger, dry-run và phê duyệt tác vụ theo Bộ Shop. **Không tự chạy cộng bù khi nhập Chương 4, khi GET bài hoặc khi người dùng mở lại.** Không làm bài cũ thành bài mới để trả thêm xu.

## 10. Dữ liệu và API tích hợp

### 10.1. Ánh xạ vào hạ tầng đã có

Tên bên dưới là hợp đồng logic, không khẳng định repository đã có đúng bảng/endpoint đó; không bắt đổi framework/database hoặc tạo microservice mới. AI dev tự tìm và ghi bằng chứng source đang dùng cho catalog, reader, completion manual, progress, ví/ledger/outbox, auth/guard và profile linh thú.

| Đối tượng | Thông tin cần giữ |
|---|---|
| Bản bài | Stable lesson key, ID/catalog mapping, content version/status, tên/lead/order, bốn phần, mode manual, capability null. |
| Phần | Định danh/ordinal trong bản nội dung, title, HTML/typed blocks, ảnh và bảng có thứ tự. |
| Ảnh | ID, byte WebP hoặc asset ref bất biến, caption/alt, width/height, hash, version; provenance/marks lưu cho QA. |
| Completion | Owner từ auth, bài ổn định, content version tại lúc hoàn thành, method manual, completed_at đầu tiên, ID và bằng chứng yêu cầu. |
| Tiến độ | Tập completion đã map vào catalog; x/6 Chương 4, x/71 toàn khóa; không tính từ ledger hoặc client. |
| Reward | Completion nguồn, họ thưởng, stable lesson key, ledger reference, trạng thái và khóa duy nhất theo người/bài. |
| View state | Bài/phần/cuộn/nhóm chương đang mở, tách hoàn toàn khỏi quyền và completion. |

Ví dụ metadata logic một bài:

```json
{
  "chapter_id": "ch04",
  "lesson_id": "ch04-l01",
  "stable_lesson_key": "iqx-ch4-six-filter-guides/ch04-l01",
  "content_version": "iqx-ch4-six-filter-guides-v1.0-preview",
  "kind": "guide",
  "completion_mode": "manual",
  "capability_id": null,
  "first_completion_reward_policy": "academy_lesson_once"
}
```

Tên policy ở ví dụ là alias để ánh xạ dịch vụ chung, không yêu cầu tạo họ thưởng mới cho Chương 4. Mức thưởng 100 và mode được quản lý tại server, không lấy từ client.

### 10.2. Hợp đồng thao tác

| Thao tác | Kiểm tra / kết quả |
|---|---|
| Đọc bài và tài nguyên | Xác minh quyền, đúng bản đã xuất bản; giữ nội dung/ảnh cùng version; GET không tự hoàn thành hoặc thưởng. |
| Đọc tiến độ | Nguồn tài khoản đã xác nhận; lỗi không ghi 0/71 hoặc mảng rỗng đè dữ liệu. |
| Gửi Hoàn thành | Bài đúng/chapter mapping đúng, nội dung published, mode manual, owner auth và request key; không đòi quiz hoặc filter run. |
| Retry / đọc kết quả hoàn thành | Trả completion có sẵn, giữ completed_at đầu; reward có sẵn/pending đúng; không ghi lại. |
| Đọc xu | Balance/revision/ledger đã xác nhận; tải lỗi không xem 0 là số dư mới thật. |
| Điều hướng công cụ | Router thật, giữ draft/context đã có; không save/run/apply từ callback học. |

Ví dụ payload của ý định hoàn thành, không phải tên endpoint bắt buộc:

```json
{
  "lesson_id": "ch04-l01",
  "content_version": "iqx-ch4-six-filter-guides-v1.0-preview",
  "request_id": "khoa-duy-nhat-giu-nguyen-khi-thu-lai"
}
```

Server lấy owner từ xác thực; từ chối hoặc bỏ các giá trị trái hợp đồng như amount, score, grant, user_id khác, mode tự chọn. Request cùng key nhưng khác nội dung không được trả nhầm bài. Response tương đương gồm completion ID, stable lesson identity, method manual, completed_at, tiến độ chương/toàn khóa, reward status và ledger/balance revision nếu có.

Reward phân biệt đã thưởng, đã thưởng từ trước, đang đồng bộ và lỗi. Không để response cũ ghi đè số dư hoặc view state mới hơn. Một phần của luồng lỗi phải được nêu đúng, không báo tất cả thành công giả.

### 10.3. Đồng thời, an toàn và lỗi

Cập nhật completion từng bài, không gửi toàn bộ mảng progress từ client để overwrite hồ sơ. Ràng buộc duy nhất/transaction ở server bảo vệ cùng bài và thưởng; hai bài khác nhau hoàn thành đồng thời không làm mất một bài. Auth, ownership, CSRF và giới hạn request theo hạ tầng hiện có, không xây đăng nhập riêng.

Nội dung đi qua sanitizer hoặc typed-block renderer tin cậy. Chỉ cho phần tử/thuộc tính cần dùng, giữ dấu so sánh đã escape, phân số và `data-image`/`data-image-src` với mapping an toàn. Không chạy `eval`, không thực thi script/event handler tùy ý từ văn bản nhập. Không công bố các diagnostics/reset/cấp quyền của mẫu cho người dùng thật.

Lỗi nội dung khác chưa xuất bản, lỗi ảnh khác thiếu quyền, loading khác 0 tiến độ. Lỗi API không sửa cấu hình, ví hoặc lựa chọn linh thú. Lỗi ảnh không chặn manual completion khi bài đã xuất bản và người dùng có quyền hợp lệ.

## 11. Bảo toàn nội dung và dữ liệu hiện hữu

### 11.1. Giữ các chương và tính năng khác

Chương 1 v2.0 giữ đủ kiến thức/hình/48 câu, 8/8; Chương 2 v2.0 giữ sáu bài manual và ảnh; Chương 3 v2.0 giữ công thức/chart/48 câu, 8/8. Các chương khác đã có nội dung phải giữ. Không lấy placeholder trong HTML Chương 4 ghi đè toàn catalog content hoặc đổi mọi bài thành manual.

Giữ grants, quiz attempts/results, completed_at, lịch sử thưởng/chi xu, quyền sở hữu/active linh thú. Giữ Bot/Demo Trading: tài khoản, tiền, giá vốn, vị thế, phí, lệnh chờ, cổ tức/quyền chờ nhận, nguồn hiệu lực/pending, cấu hình và lịch sử. Săn mã/Theo dõi độc lập, không thêm cổng học/xu/trứng.

### 11.2. Mapping các trạng thái cũ

| Hiện trạng | Xử lý |
|---|---|
| Chưa nhập Chương 4 | Nhập đúng sáu nội dung, không tự completed/grant hoặc tạo xu. |
| Đã có đúng sáu bài manual với completion hợp lệ | Map cùng identity; giữ tiến độ và thời điểm, không bắt hoàn thành lại. |
| Đúng sáu bài nhưng có completion quiz legacy hợp lệ | Giữ bằng chứng nguồn cũ nếu tương đương nội dung được xác minh; không chấm lại hoặc tạo điểm mới. |
| Bài quiz cũ chưa đạt và chưa completion | Không tự pass; dùng manual sau khi người dùng chủ động hoàn thành bản mới. |
| Chương 4 mười bài cũ trùng số/ID | Map theo nội dung/căn cứ; không map máy móc ordinal, giữ lịch sử chưa xác định và báo ngoại lệ. |
| Đã thưởng cùng bài theo ID trước | Map về cùng khóa ổn định; không trả thêm theo ID mới/version mới. |
| Completion hợp lệ chưa có reward | Đối soát/dry-run/cộng bù khi được phê duyệt, không tự ghi từ import hoặc GET. |
| Trạng thái của HTML/localStorage/screenshot | Không nhập như bằng chứng người dùng đã học, đã có xu hoặc đã sở hữu. |

Nhập lại cùng gói phải idempotent: không tạo bài/ảnh/ledger/completion trùng. Trước migration ghi thật cần backup, dry-run, danh sách mapping và số lượng trước/sau. Rollback không xóa completion/ledger đã commit hợp lệ để đưa hệ thống về trạng thái thưởng trùng.

Bộ này không cho phép tự deploy production, bật worker hoặc cộng xu hàng loạt. Các khác biệt nội dung/công thức/nguồn thật chưa được quyết định phải được báo, không giải quyết ngầm bằng cách sửa lịch sử.

## 12. Cách trích HTML và phần không được sao chép

### 12.1. Các điểm lấy nội dung

| Điểm trong HTML | Cách dùng |
|---|---|
| `script#ch4-content-data[type="application/json"]` | Dữ liệu source đầy đủ: lessons, images, completion, reference_filter, basis và versions. |
| `lessons[].sections[].html` | Toàn văn 24 phần, bảng, công thức, figure/caption và các nút/marker ảnh. |
| `images[id]` | Byte WebP nhúng, kích thước, caption, hash và marks; trích đúng 27 ảnh, không cần nguồn bên ngoài. |
| `script#ch4-learning-module`, `window.CH4` | Tham chiếu renderer, hydrate, manual completion UI, điều hướng và hộp ảnh; port vào component/service hiện có. |
| `#ch4-change-manifest` | Kiểm kê/xuất xứ của bản duyệt; không phải policy hay API cấp quyền. |
| `#catalogData`, `#registryData`, `#academyContractData` | Metadata khung kế thừa; chỉ đối chiếu, không overwrite nguồn catalog/grants production. |

`CH4.mount/hydrate/openImage/setZoom/closeImage/updateCompletion` chỉ là tên tìm trong mẫu. Production không bắt có cùng hàm; phải bảo toàn trải nghiệm và dữ liệu. Không chỉ trích `sections.html` rồi để `img[data-image-src]` thiếu `src`.

Ví dụ kiểm kê bằng thư viện chuẩn Python, không thực thi JavaScript của HTML:

```python
from pathlib import Path
from html.parser import HTMLParser
import base64
import hashlib
import json

class JsonPayload(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.active = False
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.active = dict(attrs).get("id") == "ch4-content-data"
    def handle_data(self, data):
        if self.active:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == "script":
            self.active = False

source = Path("IQX-Hoc-Vien-Chuong-4-MAU-v1.0.html")
parser = JsonPayload()
parser.feed(source.read_text(encoding="utf-8"))
data = json.loads("".join(parser.parts))
if len(data["lessons"]) != 6 or len(data["images"]) != 27:
    raise ValueError("Sai kiểm kê bài hoặc ảnh")
if "questions" in data or any(len(l["sections"]) != 4 for l in data["lessons"]):
    raise ValueError("Sai cấu trúc hướng dẫn Chương 4")
for lesson in data["lessons"]:
    if lesson["completion"]["type"] != "manual" or lesson["capability_id"] is not None:
        raise ValueError("Sai completion hoặc capability")
for image_id, image in data["images"].items():
    prefix, encoded = image["src"].split(",", 1)
    if prefix != "data:image/webp;base64":
        raise ValueError(f"Sai định dạng ảnh: {image_id}")
    raw = base64.b64decode(encoded, validate=True)
    if hashlib.sha256(raw).hexdigest() != image["sha256"]:
        raise ValueError(f"Sai hash ảnh: {image_id}")
# Tiếp tục đưa nội dung/ảnh qua pipeline an toàn của repository.
# Không nhập trạng thái mẫu hoặc dùng hàm complete client làm backend.
```

### 12.2. Không sao chép nguyên ứng dụng mẫu

| Thành phần mẫu | Cách xử lý production |
|---|---|
| `SHOP.chapter4`, `SHOP.completions`, `completedIds()` dựa store cục bộ | Nguồn completion của Học viện có xác thực; Shop chỉ giữ bút toán, không làm nguồn học. |
| `shopTransaction`, `navigator.locks`, localStorage | Thay bằng transaction/constraint/outbox/retry và lưu trữ của server; mẫu không chứng minh an toàn nhiều thiết bị. |
| `CH4.complete()` ghi trực tiếp 100 vào store | Chỉ tham chiếu UI; backend xác minh manual completion rồi reward service xử lý một lần. |
| `newShopState(0)`, `freshState()`, scenario | Không reset hoặc khởi tạo lại tài khoản người dùng để giống màn đầu. |
| `IQX_CH4_PREVIEW`, reset/info/footer và hàm bypass xem thử | Không đưa diagnostics/reset/cấp quyền lên production; giữ công cụ QA nội bộ tách biệt nếu dự án cần. |
| `renderMain/openLesson` override toàn cục trong mẫu | Đăng ký renderer đúng sáu lesson identity; không ghi đè reader mọi chương. |
| `reference_filter`, fixture Bot, VN30, nến, lịch và ví mẫu | Chỉ bằng chứng giảng dạy/QA; không làm nguồn thị trường, scheduler, grants hoặc dữ liệu tài khoản. |
| Ảnh linh thú/`mascotAsset`/base64 shell | Dùng registry/model/renderer thực của IQX; không coi là asset pack bàn giao. |
| Nút header CHIẾN LƯỢC hoặc toast công cụ ngoài phạm vi | Giữ router/module thật; không thay chức năng đang hoạt động bằng popup minh họa. |
| Placeholder chương khác | Giữ nội dung đã có; không publish placeholder hoặc giả completion từ tên. |

Các khóa lưu mẫu hiện tại: `iqx.preview.chapter4.guides.v1.bot-context.v1`, `iqx.preview.chapter4.guides.v1.academy-view.v1`, `iqx.preview.chapter4.guides.v1.v1`. Tên cuối có `.v1.v1` là giá trị thật của bản duyệt, không phải lỗi đánh máy trong SPEC. Không nhập hoặc dùng các khóa đó cho backend.

Không cần nhúng toàn bộ HTML qua iframe trong app để được coi là đã tích hợp. Công thức/bảng/ảnh phải nằm trong reader hiện có, completion/xu nối server thật. Tài nguyên ảnh hướng dẫn có thể được nhập bất biến; các nhãn xem thử không phải một trang sản phẩm mới.

## 13. Ca nghiệm thu tích hợp cần thực hiện

**Các ca dưới đây là yêu cầu dev chạy trên repository/môi trường được cấp quyền, không phải danh sách production đã đạt.** Mỗi ca cần đầu vào, hành động, expected/actual, file/hàm test, câu lệnh và môi trường. Ca đối chiếu Bộ lọc/Bot là hồi quy điểm nối với công cụ hiện có; phần chưa sẵn sàng báo bị chặn, không mở rộng gói thành xây lại toàn bộ công cụ.

### N. Nội dung và tài nguyên

| ID | Điều kiện / đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C4-001 | Nhận cặp v1.0 | Đối chiếu hash HTML, JSON, tên/version và kiểm kê. | Đúng bản đã duyệt; không đổi thành nguồn Chương 2/3 hoặc yêu cầu thêm ảnh rời. |
| C4-002 | Catalog đã có 13/71 | Nhập sáu bài. | Đúng sáu ID/tên/thứ tự, không nhân Chương 4 hoặc thành 77 bài. |
| C4-003 | Sáu bài nguồn | Đọc từng bài. | Đủ lead, 4 phần đúng tiêu đề/thứ tự, tổng 24; không thay bằng tóm tắt. |
| C4-004 | Nội dung đã nhập | Đối chiếu 17 bảng và phép tính 80→88. | Giữ cấu trúc/phân số/đơn vị, kết quả 10%; phân biệt ví dụ riêng với ảnh số liệu. |
| C4-005 | 27 metadata ảnh | Giải mã/trích ảnh. | Đủ WebP, hash/kích thước theo mục 5; không đổi pixel hoặc mất dấu đánh số. |
| C4-006 | Reader sáu bài | Mở mọi phần có ảnh. | 27 vị trí hiện đúng ID; số ảnh từng bài 3/5/2/4/5/8; không img thiếu src. |
| C4-007 | Bảng nguồn dùng >/< | Sanitize/render. | Không nuốt dấu, không đổi > thành >= hoặc mất vế sau dấu <. |
| C4-008 | A/B và ảnh danh mục | Đối chiếu lời giảng, reference_filter và ảnh. | A 5 mã, B 3 mã của fixture, subset CMG/FPT; không sửa mã/số thành kết quả thật. |
| C4-009 | Metadata preview và chú thích shell cũ | Tách nội dung để xuất bản. | Manual/null theo Chương 4; không lấy comment Shop/preview làm lệnh dựng lại shell hoặc tự completed. |
| C4-010 | Chương 1–3 đã có nội dung | Nhập Chương 4. | Giữ nguyên bài/hình/đề 8/8 của C1/C3 và manual của C2; không overwrite bằng placeholder. |

### U. Reader, ảnh và điều hướng

| ID | Điều kiện / đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C4-011 | Workspace desktop | Mở Chương 4. | Bài trái/panel Học viện phải/rail; sidebar chỉ Xem bài/Đã học. |
| C4-012 | Đang đọc và đã cuộn panel | Hoàn thành một bài. | Giữ bài/cuộn/chương mở; không tự chuyển bài hoặc Shop. |
| C4-013 | Bốn mục lục và bài trước/sau | Bấm các nút. | Tới đúng phần/bài, không completion từ navigation. |
| C4-014 | Ảnh bất kỳ và mọi ID | Bấm ảnh hoặc Phóng to. | Đúng ảnh/tiêu đề theo ID; không mở editor hoặc chạy lọc. |
| C4-015 | Hộp ảnh đang mở | Chuyển Vừa khung/100%. | Fit đúng vùng; 100% đúng pixel, cuộn trong hộp, không tràn trang. |
| C4-016 | Hộp ảnh đang mở | Bấm Escape/Đóng. | Chỉ đóng ảnh, giữ bài/cuộn và trả focus về nút mở. |
| C4-017 | Nút Lưu/Áp dụng được chụp trong ảnh | Click vị trí đó. | Chỉ phóng to/đọc ảnh; không gọi nghiệp vụ thật. |
| C4-018 | Một ảnh lỗi | Thử tải lại. | Lỗi đúng ảnh, giữ bài và cho Thử lại; không mất progress/xu hoặc khóa manual. |
| C4-019 | 1440/1024 px | Đọc đủ sáu bài và hộp ảnh. | Tên/đơn vị/bảng/công thức/nút rõ; không thiếu ảnh hoặc tràn ngang trang. |
| C4-020 | 390/360 px | Mở/đóng Danh sách bài, chọn bài và đọc. | Panel trượt cạnh rail; chữ đủ lớn, bảng cuộn nội bộ, không rail ngang. |
| C4-021 | Bàn phím/Reduced Motion | Tab/Enter/Escape và nhảy phần. | Focus/nhãn rõ, không tương tác nền bị che, không cưỡng bức animation. |
| C4-022 | Đang dùng linh thú không phải Bạch Hổ | Về linh thú rồi mở lại bài. | Giữ đúng model/active qua renderer hiện có, không cấp vốn/nở lại. |
| C4-023 | Có draft Bộ lọc thật | Dùng điều hướng Chiến lược hiện có. | Mở đúng tab/route, giữ draft; không nạp A/B hay gọi apply từ reader. |
| C4-024 | Người dùng đã đọc bài khác | Reload/deploy bản nội dung. | Khôi phục view state hợp lệ, không ép về bài 1 Chương 4 hoặc reset tiến độ. |

### M. Hoàn thành và quyền

| ID | Điều kiện / đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C4-025 | Bài published, có quyền đọc | Chỉ bấm Hoàn thành, chưa dùng Bộ lọc. | Ghi đúng manual completion; không cần quiz/scroll/time/run/list/apply. |
| C4-026 | Chưa mở chỉ tiêu Chương 3 | Đọc và hoàn thành bài hướng dẫn theo quyền đọc. | Được manual đúng policy; không cấp profit/roe hoặc thêm cổng học C3. |
| C4-027 | Bài chưa completed | Chỉ xem ảnh/đổi bài/cuộn cuối. | Không tạo completion/reward. |
| C4-028 | Chưa học cả chương | Hoàn thành bài 6 trước. | Đúng 1/6 và +1 toàn khóa, không cả chương hoàn thành. |
| C4-029 | Completion đang gửi | Bấm nhiều lần. | Không success sớm, tối đa một completion; backend chống trùng. |
| C4-030 | Server commit nhưng mất response | Retry cùng request. | Trả cùng completion/thời điểm đầu; không ghi thêm. |
| C4-031 | Hai tab cùng bài | Hoàn thành đồng thời. | Một completion duy nhất theo owner/bài, không chỉ khóa nút. |
| C4-032 | Hai tab khác bài | Hoàn thành gần nhau. | Giữ cả hai cập nhật, không overwrite toàn bộ progress. |
| C4-033 | Đã completed | Đọc/hoàn thành lại hoặc sửa hình/bản nội dung cùng bài. | Giữ completed_at và trạng thái, không cộng lại tiến độ. |
| C4-034 | Bài placeholder/chưa published | Gửi API hoàn thành. | Từ chối; không tạo completion từ tên hoặc status client. |
| C4-035 | Request manual cho bài kiến thức C1/C3 | Gửi trực tiếp vào API. | Không bypass 8/8; mode do server quyết định. |
| C4-036 | Client gửi user khác/score/grant/mode/amount | Nộp. | Không tin dữ liệu tự khai; xác thực owner/bài/quyền thật. |
| C4-037 | User B biết ID completion của A | Đọc/ghi. | Chặn ownership; không lộ hoặc sửa dữ liệu người khác. |
| C4-038 | Có completion quiz và manual nhiều chương | Đếm progress sau hoàn thành C4. | Tập unique trong catalog /71; không bỏ bài manual hoặc tính số request. |
| C4-039 | Có grants kỹ thuật/cơ bản trước đó | Hoàn thành toàn bộ C4. | Không thêm/thu hồi grants; null capability không xóa quyền cũ. |
| C4-040 | API progress hoặc content tạm lỗi | Tải lại. | Giữ trạng thái đã xác nhận; không ghi 0/71 hoặc false đè dữ liệu. |

### X. Xu và linh thú

| ID | Điều kiện / đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C4-041 | Bài chưa thưởng, completion hợp lệ | Xử lý lần đầu. | Một bút toán +100 qua dịch vụ chung, số dư sau commit. |
| C4-042 | Sáu bài chưa thưởng | Lần lượt hoàn thành. | Tổng +600, không bonus chương hoặc capability. |
| C4-043 | Cùng bài nhiều request/event ID | Retry/đồng thời. | Một thưởng theo owner+reward family+stable lesson, không +200. |
| C4-044 | Hai bài khác nhau | Hoàn thành đồng thời. | Đúng +200 khi đều lần đầu, không mất cập nhật ví. |
| C4-045 | Completion ghi, reward tạm lỗi | Xem trạng thái và cho retry. | Đã học được giữ, Đang cập nhật xu; sửa từ bằng chứng, không bắt học lại. |
| C4-046 | Reward chưa commit | Render header/kết quả. | Không thông báo +100 đã nhận hoặc cộng balance client giả. |
| C4-047 | Đã thưởng và đã dùng xu | Đọc/làm lại bài. | Không hoàn khoản đã chi hoặc nhận thưởng lần hai. |
| C4-048 | Đổi content version/ID vị trí cùng bài | Nhập/chuyển đổi. | Giữ identity thưởng, không tạo thưởng mới theo version. |
| C4-049 | Chỉ chạy lọc/lưu danh mục/áp Bot/Backtest | Đọc ví. | Không tự hoàn thành hoặc nhận xu Chương 4. |
| C4-050 | Hoàn thành mới, đang đọc bài | Nhận thông báo +100. | Không che bài/bắt Shop/nhận thưởng riêng; các vùng số dư thống nhất. |
| C4-051 | Mua/đổi linh thú từ xu đã có | Dùng Shop hiện hành rồi quay bài. | Giữ completion/grants/account; mua không tự sử dụng, đổi dùng renderer thật. |
| C4-052 | Completion cũ chưa reward | Nhập gói. | Chỉ đề xuất đối soát/dry-run, không tự backfill từ import/GET. |

### F. Đối chiếu Bộ lọc và nguồn Bot

| ID | Điều kiện / đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C4-053 | LNST quarter >15, ROE ttm >15 | Đọc bài/ảnh và kiểm công cụ hiện có. | Kỳ riêng, AND, không tab Mua/Bán cơ bản. |
| C4-054 | Ô có đơn vị %, nhập 15 | Đọc/so giá trị theo service. | Nghĩa 15%, không 0,15% hoặc 1500%; chuyển scale đúng một lần. |
| C4-055 | LNST đúng bằng 15 / ngưỡng trống | Xét >15 hoặc nhập trống. | Bằng ngưỡng không đạt; trống là lỗi, không số 0. |
| C4-056 | LNST quarter, ROE ttm | Đổi riêng LNST sang ttm. | LNST/header/chi tiết đổi thật; ROE giữ; không fallback quarter ROE. |
| C4-057 | Nguồn báo cáo mới nhất khác kỳ giữa mã | Đọc kết quả. | Kỳ dưới từng số đúng; không dùng kỳ đã kết thúc nhưng chưa có báo cáo. |
| C4-058 | Thiếu đầu vào của điều kiện bắt buộc / cột tham khảo | Lọc và đọc chất lượng dữ liệu. | Bắt buộc thiếu không cho qua; cột không dùng thiếu không tự loại; khác nguồn lỗi. |
| C4-059 | Cùng mốc dữ liệu A/B | Chỉ đổi ngưỡng LNST 15→25. | B là subset A trên cùng dữ liệu; không đổi kỳ/ROE để ép số mã. |
| C4-060 | Bộ lọc đã lưu có quarter/ttm riêng | Dùng sau báo cáo mới. | Giữ lựa chọn động, resolve kỳ mới; không khóa quý cũ hoặc reset default. |
| C4-061 | Danh mục đã lưu và form vừa sửa | Xem danh mục. | Giữ snapshot cũ, không ghép số liệu mới; chưa mua/áp Bot. |
| C4-062 | Kết quả nhiều trang, có subset hoặc chưa chọn riêng | Lưu/áp. | Đúng tập xác nhận/toàn bộ mọi trang cùng mốc; không chỉ trang đầu hoặc mã ẩn. |
| C4-063 | Kết quả chưa Lưu danh mục | Áp trực tiếp và xác nhận. | Nguồn đáng tin cậy, không bắt lưu trước hoặc tự thêm mục đã lưu ngoài ý định. |
| C4-064 | Danh mục riêng có mã ngoài VN30 | Xác nhận áp. | Thay VN30, không cộng/giao; vẫn xác minh phạm vi giao dịch hỗ trợ. |
| C4-065 | Yêu cầu nhận ngày D trước hoặc sau mở cửa | Xem hiệu lực. | Pending đến phiên hợp lệ ngày>D; lịch thật, không +24h/lịch ảnh. |
| C4-066 | Nguồn A đang dùng, B đang chờ | Xem/trước mốc và hủy pending. | Nguồn vẫn A; chỉ hủy B chưa hiệu lực, xử lý tranh chấp đúng. |
| C4-067 | Mã cũ ngoài nguồn mới vẫn nắm giữ | Đổi nguồn/Về VN30. | Không bán/reset; Bán theo config hiệu lực trên mọi vị thế. |
| C4-068 | Chưa có Bán hoặc chỉ tiêu cơ bản không còn đạt | Xét vị thế cũ. | Không cắt lỗ/target/trailing/60 phiên ngầm hoặc bán chỉ do không đạt lọc. |
| C4-069 | Có báo cáo mới hoặc dùng lại bộ lọc | Xem nguồn Bot/cảnh báo. | Snapshot Bot/cảnh báo không tự cập nhật, muốn đổi nguồn phải xác nhận lại. |
| C4-070 | Nguồn rỗng/lỗi hoặc xóa danh mục đang dùng | Xử lý. | Không fallback VN30/Săn mã, không xóa snapshot đang tham chiếu hoặc bán cưỡng bức. |
| C4-071 | Danh mục nghiên cứu có nhiều mã | Mở một mã vào Backtest. | Một mã, không backtest danh mục/cơ bản lịch sử; không giao dịch Bot từ reader. |
| C4-072 | Tích Theo dõi Săn mã hoặc sắp xếp Bộ lọc | Đọc nguồn/thứ tự giao dịch. | Không biến watchlist/sort thành nguồn hoặc ưu tiên mua Bot. |

### P. Bảo toàn, an toàn và bàn giao

| ID | Điều kiện / đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C4-073 | Tiền/vị thế/orders/cổ tức/config/source đã có | Đọc, hoàn thành, nhận xu, chuyển loài. | Sổ VND và dữ liệu giao dịch không đổi; không tái cấp vốn hoặc Bot mới. |
| C4-074 | Các gói Chương 1–3 đã triển khai | Import lại Chương 4. | Giữ nội dung, đề, kết quả/quyền/xu và kiểu hoàn thành đúng từng chương. |
| C4-075 | Chương 4 legacy mười bài trùng ID | Chuyển dữ liệu. | Semantic mapping có bằng chứng; không copy completion theo ordinal. |
| C4-076 | Cùng gói import nhiều lần | Nhập lại. | Không nhân bài/ảnh/completion/reward/catalog; giữ timestamps. |
| C4-077 | Ảnh linh thú hoặc service profile lỗi | Mở bài/Về linh thú. | Fallback đúng; không tạo model mới, đổi active sang Bạch Hổ hoặc mất sở hữu. |
| C4-078 | Dữ liệu localStorage/screenshot giả hoàn thành | Đưa vào request/app. | Không nhận làm nguồn quyền, xu, completion hoặc tài khoản thật. |
| C4-079 | Production build sau tích hợp | Kiểm script và điều khiển. | Không diagnostics/reset/whole-shell override; GET không thưởng/áp nguồn. |
| C4-080 | Hàm/API chưa sẵn sàng hoặc xung đột lời giảng | Báo triển khai. | Nêu cụ thể nguồn/test bị chặn; không sửa ngầm nội dung hoặc success giả. |
| C4-081 | Migration/deploy/backfill | Thực hiện trong môi trường được cấp quyền. | Dry-run/backup/mapping/rollback và phê duyệt cần thiết; không ghi hàng loạt ngoài quyền. |
| C4-082 | Kết thúc bàn giao dev | Gửi báo cáo. | Có file/hàm/commit, mapping, test input/expected/actual/lệnh/môi trường; tách mock/production và phần chưa chạy. |

**Tổng: 82 ca nghiệm thu tích hợp.** Ngoài các ca tổng quát, đối chiếu riêng từng ảnh và từng bảng theo bản đồ mục 2/5. Đếm đủ ID chưa chứng minh ảnh đúng nội dung hoặc người dùng nhận được dữ liệu thật. Không tick “đạt” nếu chưa chạy trên môi trường tương ứng.

## 14. Quy trình thực hiện và đầu ra dev

### 14.1. Trình tự

1. Xác minh repository/nhánh/build đang dùng, reader, catalog 13/71, completion manual, progress, reward/ledger, auth và renderer linh thú; ghi đường dẫn thật.
2. Kiểm hash bản duyệt; lập mapping sáu bài và khóa ổn định, đối chiếu dữ liệu legacy trước mọi tác vụ ghi.
3. Trích toàn văn, 17 bảng và 27 ảnh; đăng ký renderer riêng Chương 4 vào khung hiện có, giữ các chương khác.
4. Nối completion manual và tiến độ theo tài khoản; không grant; nối thưởng +100 bằng dịch vụ chung có chống trùng/đối soát.
5. Hoàn thiện ảnh/phóng to, điều hướng, loading/lỗi, desktop/mobile; đối chiếu điểm vào Bộ lọc thật mà không nạp preset hoặc gọi apply từ bài.
6. Chạy unit/integration/hồi quy và từng nhóm ca ở mục 13. Những ca công cụ nền chưa có nguồn phải báo bị chặn rõ, không dùng mock để thay.
7. Dry-run/backup/migration đúng quyền nếu cần, kiểm số lượng trước/sau và rollback. Cộng bù xu/deploy production cần phê duyệt riêng theo quyền được cấp.
8. Báo file/hàm đã sửa, phiên bản, mapping, kiểm kê, evidence test và nguồn/phần còn thiếu.

### 14.2. Các phụ thuộc cần tự tìm

| Phụ thuộc | Không tự thay bằng |
|---|---|
| Reader, route và catalog thật | Shell độc lập hoặc reset toàn ứng dụng. |
| Completion manual và progress | Điểm 8 giả hoặc array client tự khai. |
| Ví xu/ledger/outbox/unique key | Callback +100 trong JavaScript hoặc ví thứ hai. |
| Identity bài legacy | ID vị trí trùng số nhưng khác nội dung. |
| Bộ lọc/kỳ/nguồn dữ liệu/lưu và áp nguồn mua | Ảnh WebP, các ngày/ticker fixture hoặc một form con chưa có nguồn. |
| Model/renderer/active linh thú | Ảnh base64, loài tự sinh hoặc ép mặc định người dùng cũ. |
| Quyền môi trường và tác vụ dữ liệu | Việc có SPEC/HTML hoặc kiểm thử cục bộ. |

### 14.3. Báo cáo dev phải trả

Trả code, asset/content import, migration cần thiết và tests trong repository. Báo cáo gồm: commit/build/môi trường; component/service/bảng thật đã xác minh; file/hàm thay đổi và phần giữ nguyên; mapping/versions; kiểm kê nội dung và tài nguyên; bảo toàn tiền/vị thế/progress/grants/xu/loài; từng nhóm test đã chạy với expected/actual và câu lệnh; phần chưa chạy/bị chặn hoặc chưa kết nối thật.

Đây là đầu ra dev tạo trong quá trình làm, không phải yêu cầu chủ sản phẩm chuẩn bị thêm tệp đầu vào. Không báo “đã hoàn thành” chỉ vì đã đọc spec, có sáu tên bài, tải đủ ảnh hoặc nút có toast.

### 14.4. Định nghĩa hoàn thành

Sáu bài/24 phần/17 bảng/27 ảnh xuất hiện đúng trong Học viện thật, phóng to và đọc trên desktop/mobile sử dụng được; server ghi manual completion đúng một lần, progress x/6 và x/71 đúng, thưởng 100 xu một lần qua dịch vụ chung; không cấp capability hoặc ghi cấu hình/nguồn Bot từ bài; nội dung các chương khác, dữ liệu tài khoản/xu và mô hình linh thú được giữ. Điểm nối công cụ được xác minh hoặc báo trạng thái chặn cụ thể, không có nguồn/thành công giả.

---

# Phụ lục A — Nhận diện bản bàn giao và bằng chứng bảo toàn

HTML được giữ nguyên byte. Không thay lời giảng/ảnh/CSS/script, không đổi metadata preview để tạo cảm giác đã triển khai. Hash toàn file dùng nhận diện đầu vào; mã component production không cần có cùng byte HTML, nhưng nội dung/tài nguyên nhập phải đối chiếu được.

| Thuộc tính | Giá trị |
|---|---|
| HTML | IQX-Hoc-Vien-Chuong-4-MAU-v1.0.html |
| Kích thước UTF-8 | 2,016,001 byte |
| SHA-256 toàn HTML | `65f30d146bd77f8b22a3ee2b0b6b0a216e9b0fdd3d524fc64722ec34ce32b722` |
| SHA-256 text JSON nhúng | `aa086c10d35c5240104413b563459a31015a2cb448d68f5f4936b30b453dc35a` |
| SHA-256 object toàn payload chuẩn hóa | `d7f13eab65aceffe1f54fcb88ac32279cfbc13d7d185ff3a7c7f835fa7afd61f` |
| SHA-256 sáu lessons chuẩn hóa | `7cded5fbc5d95a73e01ff74f52e5be74d82433edc70fcc0b2b33338236f1963f` |
| SHA-256 reference_filter chuẩn hóa | `c4f4b67da47f30fffdcf7df40c7393aa84437b03eb77a367673f34fe93b09fc8` |
| Nguồn reader trong manifest | IQX-Hoc-Vien-Chuong-2-MAU-v2.0(1).html |
| Hash nguồn reader | `81e155f0eb06542c9de984c1ac9a288d0fe62415345535edb6a31c05972a24e1` |
| Nguồn ảnh trong manifest | IQX-Bo-Chien-Luoc-MAU.html |
| Hash nguồn ảnh | `53e0d805afe62cce40674b655aa28c4cab2aefb5cfa51782cabb9a1df6b7970f` |
| Kiểm kê | 6 bài / 24 phần / 17 bảng HTML / 27 ảnh / 0 câu hỏi |
| Completion/thưởng | Manual; capability null; 100 xu/bài lần đầu; tổng 600 |

Hash object chuẩn hóa theo UTF-8 của `json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))`. Hash file nguồn reader/ảnh là xuất xứ lấy từ manifest, không là yêu cầu tải thêm tệp đó; hash WebP của mọi ảnh được kiểm tra trực tiếp từ byte nhúng.

| Bài | Stable key | SHA-256 object bài |
|---|---|---|
| `ch04-l01` | `iqx-ch4-six-filter-guides/ch04-l01` | `5758feb18f39c6892d4c9aaa120bbaf858ef1af53185a590b3111c3c10cc3679` |
| `ch04-l02` | `iqx-ch4-six-filter-guides/ch04-l02` | `c3df73241ce8eedba907c13c31ffe0895a7259cdbaf532da129686df3b6930fb` |
| `ch04-l03` | `iqx-ch4-six-filter-guides/ch04-l03` | `1695ba5ab523a0afd5e88d0b91834876c6101f69c0fa5b8f7e34d1ce0c91105b` |
| `ch04-l04` | `iqx-ch4-six-filter-guides/ch04-l04` | `3aff94c893b01ff170f805ee11af85b313a55305a844ef248866560777c7fb85` |
| `ch04-l05` | `iqx-ch4-six-filter-guides/ch04-l05` | `6949242d2538013d4dcf0470b111e6861a5024c8139f4a1afa4916d2286e7a2d` |
| `ch04-l06` | `iqx-ch4-six-filter-guides/ch04-l06` | `a7696afda2de859b11b22678f0c7d91371f4e55a1781a1f696238b417549ffd9` |

# Phụ lục B — Kiểm tra cục bộ trong lần lập SPEC và giới hạn

Đã kiểm kê trực tiếp HTML được bàn giao: đúng sáu bài/24 phần/17 bảng/27 ảnh, không `questions`, mọi bài manual và capability null; giải mã đủ 27 WebP, kích thước và SHA-256 khớp metadata. Không thay đổi file HTML trong quá trình kiểm tra.

Đã thực hiện **207/207 kiểm tra nhanh cục bộ đạt** bằng Chromium **144.0.7559.96** và Playwright, nạp HTML qua `set_content` trong bộ nhớ. Các nhóm thực sự đã kiểm tra:

- Đọc cả sáu bài ở 1440, 1024, 390, 360 px; tên, bốn phần, ảnh tải/giải mã, bốn nút điều hướng; không có quiz/editor trong bài, không tràn ngang toàn trang.
- Mở đủ 27 ảnh, kiểm đúng chiều rộng pixel, chuyển 100%, Escape đóng hộp mà giữ reader. Đã xem ảnh chụp đối chiếu desktop và mobile.
- Đọc/ảnh không đổi state tài khoản/Bot hoặc loài; hoàn thành bằng nút thật theo thứ tự bài 6 trước rồi các bài còn lại; đúng từng completion, +100, tổng 600; gọi lại không thêm reward.
- Bài trước/sau, nhảy phần, Về linh thú và trạng thái không có điều khiển giao dịch trong sidebar Học viện.
- Không ghi nhận lỗi JavaScript của trang hoặc yêu cầu mạng ra ngoài trong lượt chạy cục bộ.

**Giới hạn quan trọng:** môi trường chặn điều hướng URL với `ERR_BLOCKED_BY_ADMINISTRATOR`, nên dùng `set_content` và nhánh lưu tạm trong bộ nhớ. Chưa kiểm chứng mở trực tiếp `file://`, tải lại/lưu localStorage bền vững trên mọi trình duyệt, hai tab hoặc đồng bộ nhiều thiết bị. Các phép thử chống lặp trên mẫu chỉ xác nhận hành vi trong một phiên bộ nhớ, không chứng minh transaction server.

Chưa truy cập repository IQX, xác thực, API, database, completion/reward/outbox thật, migration/backfill, nguồn báo cáo, lịch giao dịch hoặc worker. **207 kiểm tra nhanh không thay 82 ca nghiệm thu tích hợp tại mục 13 và không là chứng nhận production.** Không lấy số kiểm tra nhanh này làm tỷ lệ đạt của server hoặc của Bộ lọc/Bot thật.

Không bắt chủ sản phẩm gửi ảnh chụp, script test hoặc báo cáo riêng làm đầu vào thứ ba. Thông tin kiểm kê/giới hạn đã có trong SPEC; nội dung và tài nguyên nằm đủ trong HTML.

---

**HẾT SPEC CHƯƠNG 4 — v1.0.** Gửi đúng Markdown này cùng `IQX-Hoc-Vien-Chuong-4-MAU-v1.0.html`. Ghép giáo trình vào nền hiện có; bảo toàn bản HTML đã duyệt, các chương trước, dữ liệu người dùng và mô hình linh thú. Không xây lại Bot/Học viện/Shop/Chiến lược hoặc tự thêm nội dung ngoài phạm vi.

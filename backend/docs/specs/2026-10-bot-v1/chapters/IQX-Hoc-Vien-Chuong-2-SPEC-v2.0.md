# IQX — ĐẶC TẢ NỘI DUNG HỌC VIỆN CHƯƠNG 2
## Sử dụng Backtest · Sáu bài hướng dẫn · Khung 13 chương / 71 bài · Thưởng xu

**Phiên bản bộ bàn giao:** 2.0.  
**Ngày cập nhật:** 08/10/2026.  
**Hai file đầu vào:** `IQX-Hoc-Vien-Chuong-2-SPEC-v2.0.md` và `IQX-Hoc-Vien-Chuong-2-MAU-v2.0.html`.  
**Thay thế:** cặp Chương 2 SPEC/MAU v1.0 cho những lần tích hợp nội dung mới. Giữ nguồn và lịch sử cũ để đối chiếu, không xóa hồ sơ người dùng.  
**Phạm vi:** ghép sáu bài vào Học viện IQX hiện có; cập nhật hướng dẫn/ảnh theo bộ Chiến lược mới và nối hoàn thành lần đầu với ví xu. Không xây lại Backtest, Bot, Học viện hoặc Shop.

> **ĐỌC TRƯỚC KHI CODE:** Đọc hết spec và đối chiếu đủ sáu bài trong HTML. Tích hợp toàn văn, 24 phần, 22 ảnh, bảng và phóng to vào reader hiện hữu. **Chương 2 không có bài kiểm tra; cuối mỗi bài bấm Hoàn thành bài học, lần đầu hợp lệ nhận 100 xu.** Không cấp chỉ báo, không bật Mua/Bán, không chạy giao dịch hoặc đặt cấu hình ví dụ vào Bot. Website đã có mô hình linh thú: **dùng lại đúng tài nguyên, bộ hiển thị và hoạt ảnh hiện có**, không tạo lại hoặc thay bằng ảnh tĩnh nhúng trong HTML.

Các tên object/service/field bên dưới là hợp đồng logic để AI dev ánh xạ vào repository thật, không khẳng định chúng đã tồn tại. Mẫu mở cục bộ không chứng nhận hệ thống production đã được tích hợp.

---

## 0. Căn cứ, đánh giá và thứ tự ưu tiên

### 0.1. Đánh giá bộ trước

Bộ Chương 2 trước đã có đúng sáu bài theo luồng: chọn đầu vào → Mua → Bán → giả định/chạy → đọc kết quả → so sánh/lưu. Nội dung đáp ứng mục tiêu hướng dẫn sử dụng, không cần thêm bài lý thuyết chuyên sâu hoặc quay lại 18 bài cũ. Giữ tên, thứ tự, bốn phần mỗi bài và các ví dụ tính toán.

Các điểm cần cập nhật đã được sửa trong cặp này:

| Điểm cũ | Bản đích |
|---|---|
| Shell 18 chương/113 bài sau khi giảm Chương 2 | Dùng catalog chung 13 chương/71 bài đã bàn giao; Chương 2 vẫn 6 bài |
| Hướng dẫn cấu hình dùng chung có Học viện là nơi ghi; công tắc tổng ở Học viện | Chỉ Bot/Backtest chỉnh cấu hình; Học viện chỉ học và mở quyền; công tắc tổng ở Bot |
| Bài Bán và spec nói Bot giữ cắt lỗ L1 | Bot/Backtest hiện tại không có stop/target/trailing/max holding ngầm; 60 phiên là giới hạn mặc định riêng của mini |
| Ảnh từ bộ Chiến lược cũ | 22 ảnh mới từ `IQX-Bo-Chien-Luoc-MAU-v1.0.html`, có thông báo tác động Lưu vào Bot/Backtest |
| Chỉ ghi tiến độ, chưa nối xu | Completion manual lần đầu → +100 xu qua dịch vụ chung; không cộng lại khi retry/học lại |
| Chưa phân biệt mini với Backtest đầy đủ | Làm rõ công cụ, khoảng chọn, chạy lại và cách đếm giao dịch; không đổi phạm vi Backtest |

**Kiểm kê thay đổi nội dung:** 16/24 phần giữ nguyên hoàn toàn về HTML lời giảng; 8 phần có cập nhật mục tiêu hoặc câu hướng dẫn, được ghi trong `change_log`. Giữ 6 tên bài, toàn bộ ví dụ số độc lập và số liệu A/B. Không có câu hỏi Chương 2 trong payload cũ được dùng làm nền hoặc payload mới.

### 0.2. Thứ tự dùng nguồn

1. Quyết định mới của chủ sản phẩm và cặp bàn giao v2.0 này: nội dung/ảnh Chương 2 đã được cập nhật cho hệ thống mới.
2. Các bộ mới `IQX-Bo-Bot-SPEC-v1.0.md`, `IQX-Bo-Hoc-Vien-SPEC-v1.0.md`, `IQX-Bo-Chien-Luoc-SPEC-v1.0.md`, `IQX-Bo-Shop-Xu-Linh-Thu-SPEC-v1.0.md` là nguồn nghiệp vụ tích hợp; những ranh giới cần thiết đã tóm đủ trong spec này.
3. Nội dung Chương 1 v2.0 và các chương khác đang được triển khai phải được bảo toàn. Đợt này không chấm lại hoặc sửa chúng.
4. Repository thực xác định component, service, schema, quyền, asset, lịch, dữ liệu và những chỗ còn thiếu.

Các tài liệu cũ `IQX-Hoc-Vien.md`, `IQX-Chien-Luoc.md`, spec “Đợt 01/02” trước đổi mô hình, Bot update V1/V2/stop L1 và shell 18 chương chỉ là lịch sử. Không lấy chúng khôi phục trứng, stop, quyền Cấu hình tại Học viện hoặc nguồn Săn mã của Bot. Số “v1.0” của bộ Chiến lược mới không đồng nghĩa nội dung giống bộ Đợt 02 cũ.

### 0.3. Đúng hai file, không phát sinh đầu vào thứ ba

Toàn văn và 22 WebP đã nhúng trong HTML; spec có contract, kiểm kê và ca nghiệm thu. Không yêu cầu chủ sản phẩm cung cấp ảnh rời, README, prompt, ZIP, JSON completion hoặc spec cũ để bắt đầu. Các tên nguồn/hash chỉ để đối chiếu xuất xứ, không là URL tài nguyên cần tải.

Dev được trích component, JSON, WebP và test thành các file nội bộ trong repository. Đó là cách tổ chức code, không thay yêu cầu bộ đầu vào hai file. Nếu có xung đột thực chưa được nguồn này giải quyết, báo đúng đoạn/ảnh/chức năng và tiếp tục phần độc lập đã rõ; không tự sáng tác công thức hoặc sửa luật giao dịch.

---

## 1. Phạm vi của đợt nội dung

| Thực hiện | Không thực hiện |
|---|---|
| Ghép 6 bài, 24 phần, 22 ảnh và bảng vào Học viện mới | Dựng thêm một ứng dụng Học viện hoặc dán cả shell mẫu vào production |
| Phóng to đúng ảnh, Vừa khung / 100%, đóng và trở lại bài | Chạy lệnh/Backtest khi bấm nút nằm trong ảnh |
| Completion bằng nút và lưu tiến độ theo tài khoản | Quiz, 8/8, đề, điểm, kiểm tra cuối chương hoặc bài tập bắt buộc |
| Nối thưởng 100 xu lần đầu vào dịch vụ Xu chung | Tạo ví thứ hai, tạo quyền học từ ví, nhập tiến độ mẫu |
| Đồng bộ 13 chương/71 bài theo catalog chung | Giảm số bài bằng phép trừ 125−12 hoặc sửa lại chương khác |
| Sửa hướng dẫn theo Bot/Backtest và ảnh mới | Thay policy/engine, biểu phí, lịch hoặc cách thanh toán |
| Giữ mô hình linh thú đang có và lựa chọn người dùng | Tạo mẫu linh thú mới hoặc luôn gán lại Bạch Hổ khi mở bài |
| Kiểm thử nội dung, UI, completion, reward, hồi quy | Tuyên bố production đã đạt chỉ từ HTML cục bộ |

Bộ này là **giáo trình thao tác Backtest đặt trong Học viện**, không phải bản thiết kế Backtest mới. Những tính năng Backtest/Shop/Bot trong shell chỉ tạo ngữ cảnh xem thử. Production nối vào hệ thống đã triển khai hoặc các điểm tích hợp thật đang được bàn giao.

---

## 2. Catalog và định danh

Tên chương: **Chương 2 — Sử dụng Backtest**. Nhóm: hướng dẫn công cụ. Tổng số bài: 6.

| Thứ tự | ID tham chiếu | Tên bài | Phần | Ảnh | Hoàn thành | Xu lần đầu |
|---:|---|---|---:|---:|---|---:|
| 1 | `ch02-l01` | Bắt đầu với Backtest | 4 | 3 | Nút cuối bài | 100 |
| 2 | `ch02-l02` | Thiết lập điều kiện Mua | 4 | 5 | Nút cuối bài | 100 |
| 3 | `ch02-l03` | Thiết lập điều kiện Bán | 4 | 3 | Nút cuối bài | 100 |
| 4 | `ch02-l04` | Chọn giả định và chạy kiểm thử | 4 | 1 | Nút cuối bài | 100 |
| 5 | `ch02-l05` | Đọc kết quả và lịch sử giao dịch | 4 | 6 | Nút cuối bài | 100 |
| 6 | `ch02-l06` | Điều chỉnh, so sánh và lưu kết quả | 4 | 4 | Nút cuối bài | 100 |

**Họ nội dung ổn định:** `iqx-ch2-six-user-guides`.  
**Version nội dung cập nhật:** `iqx-ch2-six-user-guides-v3.0-academy71-shop`.  
**Version cặp bàn giao:** 2.0. Nội dung dùng v3.0 để không trùng version v2.0-manual-completion đã nằm trong cặp bàn giao v1.0 trước.

`ch02-l01`…`ch02-l06` là khóa hiển thị tham chiếu, phải ánh xạ với ID thật. Ví dụ semantic key của bài 1 là `iqx-ch2-six-user-guides/ch02-l01`. Không dùng số thứ tự làm khóa quyền lợi xuyên mọi catalog: Chương 2 mười tám bài cũ có những ID trùng nhưng nội dung khác.

Trong catalog 13/71 hiện tại: 16 bài kỹ thuật, 42 bài cơ bản, 1 bài Hợp lưu và 12 hướng dẫn. Sáu bài Chương 2 là một phần của 12 hướng dẫn, không thêm chúng lần nữa để thành 77 bài. Thông tin tên chương/bài khác lấy từ catalog đã phê duyệt; đợt này không sửa cấu trúc các chương đó.

---

## 3. Toàn văn, cấu trúc và bản đồ ảnh

HTML là nguồn toàn văn. Không dùng những bảng tóm tắt dưới đây thay giáo trình. Giữ `name`, `lead`, bốn `sections` và vị trí bảng/ảnh trong từng phần. Bộ nút cuộn giữ **Bắt đầu · Thao tác · Đối chiếu · Lưu ý**; không dùng chúng làm bốn nhiệm vụ bắt buộc.


### 3.1. Bắt đầu với Backtest — `ch02-l01`

**Đoạn dẫn:** Mở đúng màn hình, chọn mã, khoảng thời gian và vốn trước khi thiết lập điều kiện.

| Phần | Tiêu đề giữ trong bài | Ảnh |
|---:|---|---|
| 1 | Nhận diện các khu vực trên màn hình | `01-overview`; `21-mobile` |
| 2 | Chọn mã, thời gian và vốn | `02-inputs` |
| 3 | Kiểm tra dữ liệu và quyền sử dụng | Giữ văn bản/bảng trong HTML |
| 4 | Cấu hình minh họa đi qua sáu bài | Giữ văn bản/bảng trong HTML |


### 3.2. Thiết lập điều kiện Mua — `ch02-l02`

**Đoạn dẫn:** Thêm chỉ báo, chỉnh chu kỳ và dấu so sánh, rồi kiểm tra đúng điều kiện vừa lưu.

| Phần | Tiêu đề giữ trong bài | Ảnh |
|---:|---|---|
| 1 | Thêm chỉ báo vào đúng phía | `03-add-buy` |
| 2 | Chỉnh chu kỳ, dấu và lưu | `04-buy-config`; `22-bollinger-config` |
| 3 | Kết hợp, chỉnh và bỏ một điều kiện | `05-buy-card`; `06-buy-and` |
| 4 | Phân biệt Hủy, Đặt lại và Lưu | Giữ văn bản/bảng trong HTML |


### 3.3. Thiết lập điều kiện Bán — `ch02-l03`

**Đoạn dẫn:** Tự chọn cách thoát vị thế; dùng một chỉ báo cho một hoặc cả hai phía mà không ghi đè lẫn nhau.

| Phần | Tiêu đề giữ trong bài | Ảnh |
|---:|---|---|
| 1 | Thêm Bán mà không làm lại Mua | `07-sell-config` |
| 2 | Đổi tham số riêng cho Bán | `08-independent` |
| 3 | Chỉ dùng một phía hoặc bỏ cả hai | `09-sell-off` |
| 4 | Khi không có Bán hoặc hai phía cùng đúng | Giữ văn bản/bảng trong HTML |


### 3.4. Chọn giả định và chạy kiểm thử — `ch02-l04`

**Đoạn dẫn:** Biết giá nào dùng khớp, chi phí nào được tính và khi nào cần chạy lại.

| Phần | Tiêu đề giữ trong bài | Ảnh |
|---:|---|---|
| 1 | Chọn cách khớp lệnh | `10-assumptions` |
| 2 | Đọc mức phí đang sử dụng | Giữ văn bản/bảng trong HTML |
| 3 | Chạy và nhận biết trạng thái | Giữ văn bản/bảng trong HTML |
| 4 | Một lần kiểm thử không phải tài khoản Bot | Giữ văn bản/bảng trong HTML |


### 3.5. Đọc kết quả và lịch sử giao dịch — `ch02-l05`

**Đoạn dẫn:** Đọc cả lợi nhuận, mức giảm và từng giao dịch để giải thích kết quả, không chỉ nhìn một con số màu xanh.

| Phần | Tiêu đề giữ trong bài | Ảnh |
|---:|---|---|
| 1 | Xác nhận đang đọc đúng lần chạy | `11-results` |
| 2 | Đọc sáu chỉ số theo đúng câu hỏi | `12-kpis` |
| 3 | Đọc biểu đồ Lợi nhuận danh mục (%) | `13-chart` |
| 4 | Mở một giao dịch để giải thích kết quả | `14-history`; `15-trade-detail`; `20-open-position` |


### 3.6. Điều chỉnh, so sánh và lưu kết quả — `ch02-l06`

**Đoạn dẫn:** Giữ một mốc ban đầu, thay một yếu tố và xem lại bằng chứng của từng phiên bản.

| Phần | Tiêu đề giữ trong bài | Ảnh |
|---:|---|---|
| 1 | Lưu phiên bản A trước khi thay đổi | `16-save` |
| 2 | Thay một thành phần rồi chạy lại | `17-dirty` |
| 3 | Đối chiếu A và B trên cùng dữ liệu | `18-results-b` |
| 4 | Mở lại kết quả và kết thúc lần nghiên cứu | `19-saved` |


### 3.7. Những nội dung phải đọc đúng

| Bài | Yêu cầu khi ghép và kiểm thử |
|---|---|
| Bài 1 | Mở Chiến lược → Backtest; một mã/một vị thế; chọn ngày/vốn; quyền theo chỉ báo đã học. Bảng phân biệt mini chỉ giải thích phạm vi, không mở một mini mới trong Học viện. |
| Bài 2 | Thêm đúng phía; tab/công tắc/chu kỳ/dấu/Lưu; AND; Chỉnh/×; thao tác Bỏ là tắt đúng phía trong cấu hình chung có xác nhận, không chỉ ẩn card. |
| Bài 3 | Mua 20 và Bán 50 độc lập; master nằm tại Bot. Bot/Backtest không có cắt lỗ hoặc thoát ngầm. Bán rỗng có thể còn vị thế; giới hạn 60 phiên chỉ là mini. |
| Bài 4 | Phân biệt tín hiệu close T với khớp open phiên kế tiếp; phí giả định; lỗi/đang chạy/kết quả cũ; Lưu cấu hình khác Chạy. |
| Bài 5 | Sáu KPI; Số giao dịch là vòng đã đóng; mini đếm lần mua. Chart lợi nhuận danh mục %, mua–giữ đầu đến cuối, toàn bộ lịch sử và vị thế mở riêng. |
| Bài 6 | Lưu A, đổi riêng chu kỳ Mua 20→30, giữ Bán 20 và các đầu vào khác; chạy B; mở A không ghi đè cấu hình. Cảnh báo từ kết quả ghim đúng điều kiện của lần đó, không đặt lệnh. |

### 3.8. Giữ giới hạn trình bày đã duyệt

Không chèn lại các đoạn “Các ảnh trong bài là ảnh hướng dẫn, không phải ô nhập đang chạy”, “Ảnh chụp từ HTML đã duyệt”, diễn giải nguồn file hoặc “toàn bộ giá và kết quả đều giả lập” lặp dưới từng hình. Không thêm lab, câu hỏi nhỏ, đồng hồ đọc, bảng xếp hạng hay bài tập để đủ số lượng.

Vẫn giữ **Phóng to ↗**, alt, số đánh dấu, lời giải thích thao tác và các lưu ý có giá trị nghiệp vụ về phí/khớp/cấu hình chung. Không xóa hàng loạt từ “giả định”, “ảnh” hoặc “Lưu ý” làm mất ý nghĩa hướng dẫn. Thông tin nguồn thật/giả của ví dụ nằm ở spec, metadata và Thông tin mẫu; số giả không được quảng bá thành số thị trường.

---

## 4. Giao diện đọc trong Học viện mới

### 4.1. Khung

Dùng lại khung ba vùng của Bot/Học viện: **nội dung bên trái → panel Học viện bên phải → thanh công cụ ngoài cùng**. Học viện sử dụng ngay, không kiểm tra nở trứng/cấp 0–6. Header/routing thật của website được giữ.

Panel có Tiến độ học tập x/71, chương thu/mở và bộ đếm đúng số bài. Mọi dòng chỉ có **Xem bài**, thêm **✓ Đã học** sau completion. Không có Cấu hình/Luyện tập/công tắc ở dòng bài Học viện. Không thêm một công tắc cho bài “Thiết lập điều kiện Mua”.

Bấm Xem bài mở nội dung trái. Giữ linh thú và runtime nền theo lifecycle hiện hữu, không tái tạo tài khoản hoặc phát hoạt ảnh nở. Nút **Về linh thú** trở lại con đang sử dụng; không đặt lại về Bạch Hổ. Bạch Hổ mặc định chỉ thuộc khởi tạo tài khoản mới theo bộ Shop.

### 4.2. Cấu trúc reader

Theo thứ tự: Về linh thú / tiến độ chương → header chương/tên bài/lead/số bài → bốn nút cuộn → bốn phần toàn văn → khối Hoàn thành → bài trước/sau. Bài hiện tại, chương mở và cuộn panel được giữ khi hoàn thành. Không tự chuyển bài kế tiếp sau khi nhấn Hoàn thành.

Trong mẫu mở lần đầu vào bài 1 Chương 2, 0 xu, 0/71, Chương 2 mở. Đây là cách xem file, không bắt website production reset tiến độ hoặc luôn mở bài 1. Khi có trạng thái đọc đã lưu thì khôi phục đúng bài/điểm đọc hợp lệ.

Trên mobile, dùng panel trượt bên phải theo shell mới. Thanh công cụ tiếp tục truy cập được; không quay về layout cũ xếp Học viện dưới linh thú và thanh công cụ ngang. Bảng rộng cuộn nội bộ; phần văn bản và nút cuối bài không bị cắt theo chiều ngang.

### 4.3. Trạng thái hoàn thành trong bài

Nút chưa xong: **Hoàn thành bài học**. Dòng phụ gọn: **Lần đầu · +100 xu**. Sau xác nhận: **✓ Đã hoàn thành**, đọc lại không làm mất trạng thái. Trong header/sidebar hiện Đã học. Chỉ hiện **Đã nhận 100 xu** khi ví xác nhận bút toán, không suy từ việc bài đã hoàn thành.

Thưởng xu không thay toàn bộ nội dung đang xem bằng Shop hoặc popup bắt mua. Không có nút Nhận thưởng riêng. Lời xác nhận học không là chứng nhận lợi nhuận hoặc đã chạy Backtest thành công.

### 4.4. Nội dung chương khác

Đăng ký renderer của Chương 2 theo ID/loại, không ghi đè renderer toàn khóa. Chương 1 v2.0 vẫn có bài/biểu đồ/48 câu và ngưỡng 8/8; không thay bằng nút manual. Chương khác đã có nội dung giữ nguyên. Placeholder tên bài trong file Chương 2 chỉ là bối cảnh, không được nhập đè nội dung đã xuất bản.

---

## 5. Ảnh hướng dẫn và chức năng phóng to

### 5.1. Nguồn, phiên bản và cách sử dụng

Bản này có đúng 22 ảnh WebP được chụp lại từ **HTML bộ Chiến lược mới**. Các ảnh có số đánh dấu mới khớp selector/vùng thực; không vẽ một màn Backtest tưởng tượng. Các ví dụ số được chạy lại trên cùng bộ giả lập và đối chiếu với bản A/B đã duyệt; kết quả giữ nguyên.

Chỉ ẩn thanh điều khiển mẫu/toast khi chụp. Không sửa số, chữ nút, biểu thức hoặc dữ liệu đầu ra để làm ảnh phù hợp bài. Có số khoanh/khung chú thích là lớp hướng dẫn có metadata. Trình bày ô `input[type=date]` có thể phụ thuộc locale trình duyệt; giá trị logic của A/B luôn `2024-01-02` → `2025-12-31`, không suy một ngày khác từ định dạng native trong ảnh.

`images.source` là tên nguồn, không là đường dẫn tải. Ảnh thật nằm tại `images[id].src` dạng data URI. Được trích WebP vào asset pipeline nội bộ có version. Giữ tỷ lệ, độ rõ, nội dung và số đánh dấu theo bản v2.0 này. Không áp hash ảnh v1.0 cho ảnh mới, không đổi sang ảnh production khác nếu chưa rà lời hướng dẫn và số liên quan.

### 5.2. Hành vi

Bấm ảnh hoặc Phóng to mở đúng ảnh/tiêu đề; giữ **Vừa khung**, **100%**, **Đóng ×**. 100% là kích thước pixel ảnh, có cuộn bên trong. Không làm tràn toàn trang. Escape đóng ảnh trước, không đồng thời đóng bài; trả focus về nút đã mở. Click các vị trí “Lưu”, “Chạy” trong ảnh không gọi nghiệp vụ.

Tải lười được phép; đặt width/height để giảm nhảy bố cục. Ảnh lỗi báo đúng vùng, có Thử lại, không lẳng lặng bỏ ảnh. Không yêu cầu đã mở/tải hết ảnh mới được hoàn thành. Alt/title mô tả chức năng và màn, không chứa thông tin quyền tài khoản.

### 5.3. Kiểm kê ảnh bản mới

| ID | Nội dung | Kích thước px | SHA-256 WebP |
|---|---|---|---|
| `01-overview` | Các khu vực của Backtest. | 2160 × 1175 | `a6e2ba505d5cec700672a3355429f4519577e1184d3c6f76bda500e5f0922588` |
| `02-inputs` | Chọn mã, khoảng kiểm thử và vốn ban đầu. | 1705 × 154 | `c86ba3ad6c2a98dd381231aff0fa45bed396596455188969985878ebd83130a2` |
| `03-add-buy` | Thêm MA / SMA vào phía Mua từ thư viện. | 378 × 140 | `0fdc64435affedba1a149589c4748117e290a9781b7128968e525d5e405a428b` |
| `04-buy-config` | Cấu hình Mua của MA / SMA: chu kỳ 20, Giá đóng cửa > SMA 20. | 992 × 824 | `81555fd3593db36b6e3662201a50d121c7051387997212560052441fa5cba4e9` |
| `05-buy-card` | MA xuất hiện ở Mua; Chỉnh sửa tham số, dấu × bỏ khỏi đúng phía. | 1705 × 394 | `80d0d9d7f6ee058f139db7a000ebc6d245251a77e30012f87565b44d3ee9c845` |
| `06-buy-and` | MA và Khối lượng cùng ở Mua: hai chỉ báo kết hợp AND. | 1705 × 469 | `ce200117b3e0c05eaf25ed182470a804644b28fd4c674f8d02bb0ed586e8738f` |
| `07-sell-config` | Cấu hình Bán của MA / SMA: chu kỳ 20, Giá đóng cửa < SMA 20. | 992 × 824 | `805e8fddc68ccb4e3cd32f2f5e3acbcdd25ad6551a44ebb1a77d2dfff525d322` |
| `08-independent` | Mua SMA 20 và Bán SMA 50: thay chu kỳ Bán không đổi Mua. | 1705 × 391 | `997b2ba6bd16e8094224bae945aec9d9a0c6b06401d6ac2b82b4e95c22e44d0b` |
| `09-sell-off` | Bỏ MA khỏi Bán: phía Mua vẫn còn; Bán đang rỗng. | 1705 × 394 | `3ddbb91a06366952203e371ce5c3ed194af2453db10c0fc6556d370de682cd0d` |
| `10-assumptions` | Chọn Khớp lệnh và Phí trước khi chạy kiểm thử. | 1705 × 189 | `7e05eb23b71693547235bc954160f2320b9ba12462a6a9f27afc062af2b0a645` |
| `11-results` | Kết quả lần A: MA Mua 20, MA Bán 20. | 1705 × 901 | `a6f779afce99259b3c2aaf63b1732d18ef1bf80a8f593d041b646ffc58608cda` |
| `12-kpis` | Sáu chỉ số của cùng một lần chạy, không phải sáu kết quả riêng. | 1703 × 193 | `271d3ed0f991b0464ef58faadb67eff8a102a05aa9ad089068f467839d3b4eeb` |
| `13-chart` | Trỏ vào chart để đọc ba đường tại cùng một phiên; trục dọc là lợi nhuận %. | 1703 × 518 | `4adce5912ffcde22a265050b68f669c25195aec12dd872a2fe927c5ec829513e` |
| `14-history` | Lịch sử giao dịch: có số lượng, điều kiện, ngày khớp và nút chi tiết từng vòng đã đóng. | 1705 × 623 | `0e700eba6d420cafc155b8c91c40f502ccac86d8ba9ca069ee0f84eb5292d122` |
| `15-trade-detail` | Chi tiết giao dịch của cùng lần kiểm thử: ngày tín hiệu, ngày khớp, phí và giá trị điều kiện. | 992 × 1034 | `e48344cc5653d9efcee1193b6a047320b8e3cf5ebcb2cff9a9a7aa37a14d3f70` |
| `16-save` | Lưu phiên bản kết quả với tên mô tả cấu hình đã chạy. | 992 × 438 | `31f9b642cb438a104d4a99b97065e144bb61ff4c580aae6e7983cd9169012bd0` |
| `17-dirty` | Sau khi đổi SMA Mua 20 thành 30, kết quả cũ chưa đổi; cần chạy lại. | 1703 × 158 | `d41a2e863ce6846bd5a100df6842d40ea05e5e16fa7abc197ed31b1771a1bcd7` |
| `18-results-b` | Lần B dùng SMA Mua 30; phía Bán và các giả định vẫn như lần A. | 1705 × 901 | `ead26e2a92065953404c55902e0eea15ce4e036b0106e5d6515d6c79ec8406e9` |
| `19-saved` | Danh sách các phiên bản: bấm Xem để đọc lại; không tự áp vào cấu hình chung. | 992 × 536 | `7c7739743531a30c0dcdfdf29934cb65f9f981a20f2b1f1c1f6a055a5e90264d` |
| `20-open-position` | Ví dụ riêng: không có Bán, vị thế còn mở được thể hiện ngoài các giao dịch đã đóng. | 1705 × 371 | `d8f0616fefc4ce4851ffcb64185f1af1eb5816be4ce98a451b95b72194f87d98` |
| `21-mobile` | Trên màn hình nhỏ, bấm Chỉ báo để mở thư viện. | 567 × 214 | `9aa0a64b6f4bf1dbeeaeaafc78a21120902129ec70a4b1442c74e6d230cbfd11` |
| `22-bollinger-config` | Với Bollinger, ô ở dòng vị trí trong dải cho chọn ∈ hoặc ∉; các dòng so sánh còn lại dùng > hoặc <. | 992 × 984 | `89f80425aa73a25ba4a16eac14c9d02705d15d762d894c17c99284ac5b855fad` |


---

## 6. Hoàn thành bài hướng dẫn

### 6.1. Điều kiện duy nhất ở tầng học

Một thao tác chủ động **Hoàn thành bài học** trên đúng nội dung đã xuất bản, từ tài khoản có quyền đọc, là đủ. Không quiz/điểm/8/8 cho Chương 2, không yêu cầu học trước, đọc đủ phút, cuộn đủ tỷ lệ, xem 22 ảnh, chạy Backtest, lưu cấu hình, có giao dịch, có lãi hoặc mua linh thú.

Nút đặt cuối bài là vị trí giao diện, không là bằng chứng đã đọc mọi chữ. Server xác nhận ý định hợp lệ chứ không tự tuyên bố đã kiểm tra kiến thức. Không tạo `quiz_passed=true` hoặc điểm 8 giả để dùng lại schema của bài kiểm tra.

### 6.2. Trạng thái và lỗi

| Trạng thái | Giao diện và nghiệp vụ |
|---|---|
| Chưa hoàn thành | Cho bấm nút; đọc/chuyển/phóng to không tự hoàn thành |
| Đang gửi | Giữ nội dung, thông báo Đang ghi nhận, chống bấm trùng |
| Server đã commit | Hiện Đã học/Đã hoàn thành; giữ completed_at đầu tiên |
| Server đã commit, response mất | Retry cùng ý định hoặc đọc lại; nhận trạng thái đã có, không tạo lần hai |
| Lỗi quyền/validation/ghi | Giữ trạng thái đã xác nhận trước đó; báo lỗi/Thử lại; không cộng tiến độ giả |
| Đã hoàn thành từ trước | Nội dung đọc được; không cần bấm lại/thi lại |
| Nội dung chưa xuất bản | Không thể hoàn thành từ placeholder; mode/quyền do server xác định |

Một thao tác chỉ ghi đúng một bài. Hoàn thành bài 6 trước các bài còn lại là 1/6, không phải hoàn thành chương. Không có nút hoàn thành toàn chương. Chương 2 x/6; toàn khóa lấy tập completion riêng biệt theo catalog mới x/71.

### 6.3. Không có tác dụng giao dịch

Completion Chương 2 không cấp capability RSI/MA hoặc bất kỳ chỉ báo/chỉ tiêu nào; không chỉnh master/buy/sell/params/rules; không lưu revision; không tạo cảnh báo, danh mục hay job Backtest/Bot. Học đủ sáu bài vẫn cần học bài chỉ báo tương ứng để dùng chỉ báo đó.

Một completion có thể vừa cập nhật tiến độ vừa phát thưởng hợp lệ, nhưng không gọi lại onboarding hoặc cấp 100 triệu. Xu không phải tiền VND, không cộng vào tiền mặt/NAV hoặc số vốn mini.

---

## 7. Thưởng 100 xu lần đầu — nối dịch vụ chung

### 7.1. Quy tắc

Mỗi bài trong sáu bài nhận **100 xu** đúng một lần khi completion hợp lệ được ghi nhận. Sáu bài nhận tổng **600 xu**; không thêm thưởng toàn chương. Hoàn thành bài dù chưa mở chỉ báo kỹ thuật vẫn được thưởng nếu có quyền đọc bài. Bài đã hoàn thành và đã nhận thưởng, đổi tên/phiên bản/nội dung trình bày/ID vị trí không mở lại phần thưởng.

Khóa chống trùng theo **owner + họ thưởng hoàn thành lần đầu + định danh bài học ổn định**. Không dùng attempt, request, version nội dung hay ngày deploy làm khóa cho phép thưởng thêm. Version vẫn được lưu phục vụ kiểm toán.

### 7.2. Luồng tin cậy

```text
Ý định Hoàn thành từ tài khoản đã xác thực
→ Học viện kiểm tra bài xuất bản / quyền / mode manual
→ ghi completion duy nhất và bằng chứng
→ ghi thưởng +100 cùng transaction hoặc outbox tin cậy
→ nghiệp vụ ví kiểm tra khóa thưởng và commit bút toán
→ UI nhận tiến độ và trạng thái thưởng đã xác nhận
```

Tái sử dụng hệ thống Xu của bộ Shop. Không tạo bảng số dư Chương 2 riêng, không để client gửi amount=100/owner/score như bằng chứng. Completion là dữ liệu của Học viện; Shop không ghi ngược “đã học” từ số xu.

Nếu reward service lỗi sau khi completion đã commit: giữ Đã học, hiện **Đang cập nhật xu** khi cần, retry/repair từ bằng chứng. Không bắt học/bấm lại để lấy xu; không thông báo +100 đã nhận khi bút toán chưa commit. Thất bại trước commit thì không có completion hoặc thưởng giả.

### 7.3. Retry, học lại và sử dụng xu

| Tình huống | Kết quả |
|---|---|
| Lần đầu completion hợp lệ | +100 xu |
| Bấm lại / request lại / hai tab cùng bài | Tối đa 1 completion và 1 thưởng |
| Hai tab hoàn thành hai bài khác nhau | Giữ cả hai bài và +200 nếu đều lần đầu |
| Đọc lại, đóng/mở ảnh, đổi bài | Không thưởng |
| Chạy Backtest/mini, lưu kết quả, đạt lợi nhuận | Không là completion hoặc nguồn thưởng |
| Đã dùng xu mua linh thú rồi học lại | Không cộng bù khoản đã chi |
| Học xong chương | Tổng thưởng bài là 600, không thêm bonus |

Shop có Bạch Hổ miễn phí mặc định cho tài khoản mới; bốn linh thú khác 500 xu/con; Mua không tự Sử dụng, đổi con đã sở hữu miễn phí. Bộ này chỉ nối số dư và thao tác về Shop đã có. Không tạo mô hình/loài mới, không đặt lại con đang sử dụng. Vốn/cấu hình/vị thế/lịch sử Bot không đổi khi nhận hoặc tiêu xu.

### 7.4. Người học cũ

Không tự trả lại thưởng đã có. Nếu có completion hợp lệ từ bản sáu bài cũ nhưng chưa có bút toán thưởng: liệt kê đối soát/dry-run theo semantic mapping. Cộng bù chỉ qua tác vụ được phê duyệt theo bộ Shop, một lần; không dùng sự kiện GET mở bài để chạy cộng bù ngầm. Không reset học rồi yêu cầu người dùng hoàn thành lại.

---

## 8. Phân biệt Học viện, Backtest, Bot và mini

| Nơi / thao tác | Nội dung đúng |
|---|---|
| Học viện | Xem bài, hoàn thành, tiến độ; bài kỹ thuật khác mở quyền, hướng dẫn này không cấp chỉ báo |
| Bot / Backtest — Lưu cấu hình | Cùng nguồn chỉ báo đã lưu; Mua/Bán độc lập, saved khác effective |
| Backtest — Chạy | Snapshot đầu vào của lần kiểm thử; không đặt lệnh vào tài khoản Bot |
| Lưu phiên bản kết quả | Lưu cấu hình/giả định/kết quả của lần đã chạy; không lấy form mới ghép số cũ |
| Xem kết quả đã lưu | Không tự ghi đè cấu hình dùng chung |
| Cảnh báo từ kết quả | Ghim đúng điều kiện/mã/phía được chọn và quyền hợp lệ; không tự đặt lệnh |
| Bộ lọc — Áp dụng danh mục | Nghiệp vụ riêng thay nguồn mua mới của Bot; không phát sinh từ đọc bài Chương 2 |
| Luyện tập trong Bot | Cấu hình riêng theo lượt, một chỉ báo, giấu mã/ngày, 30 mã không lặp, 24 tháng và giữ tối đa mặc định 60 phiên |

**Cấu hình đã Lưu tại Bot/Backtest** có hiệu lực cho Bot từ phiên hợp lệ đầu tiên có ngày lớn hơn ngày nhận lưu theo Asia/Ho_Chi_Minh và lịch IQX, không đơn giản +24 giờ. Không có lịch đủ tin cậy thì trạng thái pending/lỗi phải trung thực. Đọc ảnh/hoàn thành Chương 2 không là thao tác Lưu và không tạo ngày hiệu lực.

Bot mặc định xét mua mới trong VN30; áp danh mục Bộ lọc thì dùng đúng danh mục đó, ngừng sử dụng thì về VN30. Mọi vị thế đang giữ vẫn xét Bán theo điều kiện dù rời nguồn mua. Săn mã và Danh mục theo dõi độc lập. Những nguyên tắc này chỉ là hàng rào tích hợp; không yêu cầu xây lại worker trong bộ giáo trình.

Backtest đầy đủ cho chọn một mã và ngày, kết hợp chỉ báo đã mở, được chạy lại; giữ sáu KPI và toàn bộ lịch sử. Không tự giới hạn vào VN30 hoặc giai đoạn mini. Không copy 60 phiên, 30 lượt, cách giấu mã, cách đếm lần Mua của mini, hoặc ngân sách 12% của Bot vào Backtest.

---

## 9. Ví dụ số và cách đối chiếu ảnh

### 9.1. A/B giữ nguyên dữ liệu và ý nghĩa

Ví dụ xuyên suốt A: FPT, 02/01/2024–31/12/2025, vốn 100.000.000 đồng, Mua Close > SMA20, Bán Close < SMA20, khớp mở cửa phiên kế tiếp, phí minh họa mua 0,15%, bán gộp 0,25%. B chỉ đổi chu kỳ SMA **Mua** thành 30; Bán 20 và các đầu vào khác giữ nguyên. Các tình huống thêm Khối lượng, đổi Bán 50 hoặc Bán rỗng là ví dụ thao tác riêng.

| Chỉ số | A | B |
|---|---:|---:|
| Tổng lợi nhuận | +115,6% | +67,7% |
| Lợi nhuận năm hóa | +44,9% | +28,4% |
| Sụt giảm lớn nhất | −11,1% | −17,6% |
| Số vòng Mua–Bán đã đóng | 18 | 24 |
| Tỷ lệ thắng | 9/18 = 50,0% | 8/24 = 33,3% |
| Lợi nhuận mua và giữ | +15,3% | +15,3% |

Đây là kết quả giả lập của cùng ví dụ, không phải lịch sử thực FPT, không phải cam kết MA20 tốt hơn MA30. Mua–giữ và VN-Index trong ảnh dùng tỷ số giá trước phí/cổ tức. Lịch mẫu có 522 quan sát và năm hóa 252 phiên; **không dùng các con số lịch/biểu phí mẫu làm hợp đồng thị trường thật**.

Module A/B mới đã cho cùng kết quả chưa làm tròn như bản nền. Dữ liệu `reference_runs` trong HTML ghi params, KPI và profile cho dev/QA, không hiển thị thành một máy Backtest trong bài.

### 9.2. Các phép tính độc lập giữ đúng

| Ví dụ | Kết quả |
|---|---|
| 100 CP mua 10.000 đ, phí 0,15%; bán 11.000 đ, phí/thuế gộp 0,25% | Mua 1.001.500; bán thuần 1.097.250; lãi 95.750 đồng |
| Vốn 100 triệu; cuối kỳ 30 triệu tiền + 80 triệu cổ phiếu | Tổng lợi nhuận +10% |
| Danh mục 100 → 120 → 90 → 110 | Cuối +10%; sụt giảm lớn nhất −25% |
| 7 lệnh lãi 1 triệu; 3 lệnh lỗ 3 triệu | Thắng 70% nhưng lỗ ròng 2 triệu |
| Giá đầu 100, giữa lên 200, cuối 130 | Mua–giữ +30%, không +100% |
| Giao dịch #18 của A | Tín hiệu Mua 09/10/2025, khớp 10/10/2025; 3.900 CP; tổng mua 175.450.782; bán thuần 184.358.947,5; lãi 8.908.165,5 đồng |

Giữ đơn vị, dấu và mức làm tròn trong bài. Ảnh chi tiết có thể làm tròn tiền để hiển thị theo mẫu; phép tính giải thích giữ số gốc nêu trên. Không sửa số thật của người dùng để chúng khớp ví dụ.

### 9.3. Những định nghĩa không được làm sai

Tổng lợi nhuận dùng tiền mặt + cổ phiếu còn giữ so với vốn đầu, không cộng phần trăm lệnh. Số giao dịch Backtest là vòng đã đóng; tỷ lệ thắng không xác định nếu chưa có vòng đóng, không đổi thành 0%. Chart là **Lợi nhuận danh mục (%)**, có trục % và ngày; điểm cuối khớp KPI. Mua–giữ tính đầu–cuối khoảng chọn, không lấy đỉnh/hôm nay. Vị thế mở/lệnh cuối kỳ chưa khớp thể hiện riêng, không ép bán để hoàn tất bảng.

Tín hiệu close T không được khớp open T đã qua. Chế độ same-close là giả định mô phỏng, không là bằng chứng thực thi lệnh môi giới đúng giá cuối ngày. Giữ cảnh báo nghiệp vụ này trong bài, không nhầm với các đoạn meta hình ảnh đã bị yêu cầu bỏ.

---

## 10. Dữ liệu và API tích hợp

### 10.1. Tái sử dụng nguồn đang có

AI dev tìm đúng service Học viện, catalog, completion, reward/ledger, profile linh thú, guard và reader; ghi đường dẫn/hàm/schema thực trước khi sửa. Không bắt chủ sản phẩm tự chỉ endpoint có thể tìm từ repository. Không tạo công nghệ hoặc store song song chỉ vì HTML dùng các biến JavaScript.

Metadata logic của một bài:

```json
{
  "chapter_id": "ch02",
  "lesson_id": "ch02-l01",
  "stable_lesson_key": "iqx-ch2-six-user-guides/ch02-l01",
  "content_version": "iqx-ch2-six-user-guides-v3.0-academy71-shop",
  "kind": "guide",
  "completion_mode": "manual",
  "capability_id": null,
  "first_completion_reward": {"currency": "xu", "amount": 100}
}
```

Số thưởng và mode là metadata của server. Client không được tự sửa mode/manual, giá trị thưởng, owner hoặc tổng tiến độ.

### 10.2. Ý định hoàn thành

```json
{
  "lesson_id": "ch02-l01",
  "content_version": "iqx-ch2-six-user-guides-v3.0-academy71-shop",
  "request_id": "khóa-của-thao-tác-được-giữ-khi-retry"
}
```

Server xác thực owner qua phiên đăng nhập, quyền đọc, nội dung đã xuất bản, mapping ổn định và mode manual. Không cần quiz token hoặc run Backtest. Request giả `score`, `grant`, `passed`, `amount`, `user_id` không có thẩm quyền.

Response tương đương cần có: ID/stable identity, completion_method=manual, completed/completed_at đầu tiên, content version được ghi, chapter progress x/6, course progress từ catalog, reward status/ledger entry hoặc pending có thể đối soát, balance/revision nếu đã xác nhận. Không tính số dư bằng +100 ở client để giả success. API chỉ đọc không cấp thưởng.

### 10.3. Đồng thời và lỗi

Cập nhật từng bài, không gửi cả `progress` để overwrite hồ sơ. Ràng buộc duy nhất ở backend cho completion và reward. Hai tab cùng bài chỉ một; hai bài khác nhau không mất một update. Tài khoản khác không được đọc/ghi ID của nhau. Xung đột content version trả yêu cầu làm mới phù hợp, không ghi nhầm bài; không tự thu hồi completion chỉ vì sửa hình/chữ.

Nếu ảnh lỗi, completion vẫn theo ý định/nguồn đã xuất bản. Nếu nguồn nội dung/permission lỗi khiến chưa xác minh được quyền hoàn thành, không cấp từ placeholder. Tải tiến độ lỗi không ghi 0/71 hoặc false đè dữ liệu chuẩn. Tải ví lỗi không hiển thị 0 xu như một số dư đã xác nhận.

---

## 11. Chuyển đổi và bảo toàn dữ liệu

| Hiện trạng | Xử lý đích |
|---|---|
| Chưa có Chương 2 | Ghép sáu bài vào đúng catalog 13/71, ban đầu chưa hoàn thành |
| Đã có đúng sáu bài manual bản trước | Giữ completion/timestamp/nguồn; cùng semantic key dù đổi content version |
| Đúng sáu bài, quiz lịch sử đã đạt có bằng chứng | Giữ hoàn thành và nguồn legacy_quiz; không chấm lại, không tạo điểm mới |
| Đúng sáu bài, quiz cũ chưa đạt | Chưa hoàn thành; dùng nút manual khi người dùng chọn, không auto-pass |
| Chương 2 18 bài cũ có ID trùng | Dùng bảng mapping của bộ Học viện mới theo nội dung, không theo ordinal; trường hợp không đủ căn cứ giữ lịch sử và báo |
| Đã có xu thưởng bài | Không thưởng lại theo phiên bản hoặc migrate |
| Completion cũ chưa có thưởng | Đối soát/cộng bù theo mục 7.4, không chạy bù ngầm từ GET |
| Dữ liệu HTML localStorage | Không nhập thành quyền, completion, ví hoặc cấu hình production |

Không reset vốn 100 triệu, không thêm tài khoản Bot, không đổi danh mục nguồn mua, không xóa vị thế/giao dịch/cảnh báo. Không mở lại stop L1 hay cổng năm lớp vì một đoạn tài liệu cũ. Lựa chọn linh thú và sở hữu đang có được giữ.

Catalog mẫu mới đã có 13/71; migration không trừ 12 từ 71, không dựng hai Chương 2. Bài cũ bị loại giữ bằng chứng trong lịch sử riêng, không cộng thành một bài khác. Nếu chưa có nền mới trong repository thì báo điểm cần nối, không dùng bộ giáo trình xây lại tất cả công cụ.

Dry-run, backup, mapping và thống kê trước/sau bắt buộc trước tác vụ đổi dữ liệu. Rollback không xóa completion/ledger đã commit hoặc quay hệ thống về thưởng trùng/cấp vốn lại. Không deploy production/tác vụ cộng xu hàng loạt khi chưa được cấp quyền.

---

## 12. Cách trích nội dung HTML

Nguồn toàn văn trong `script#ch2-content-data[type="application/json"]`. Không cần chạy toàn bộ JS mẫu để trích. Parser chuẩn giữ UTF-8, bảng, dấu, `strong`, `details`, `figure`, các hook ảnh và cấu trúc phần.

| Khóa | Cách dùng |
|---|---|
| `catalog_key`, `version`, `package_version` | Phân biệt semantic identity, phiên bản nội dung và cặp bàn giao |
| `chapter`, `chapter_title`, `catalog_total`, `catalog_chapters` | Chương 2, tên, 71 bài/13 chương; không ghi đè catalog thật từ preview |
| `lessons[]` | Sáu bài; ID, stable_key, tên, lead, bốn sections và completion manual |
| `sections[].html` | Toàn văn chứa ảnh/bảng/thao tác; không chỉ import plain text |
| `images{}` | 22 WebP nhúng; ID, caption, width/height, hash, marks, source |
| `completion` | Manual, +100 lần đầu, không grant và không đổi cấu hình |
| `reference_runs` | Input/KPI A/B và giao dịch #18 để kiểm kê minh họa |
| `change_log`, `review`, `basis` | Ghi nhận cập nhật/xuất xứ; không hiện thành lời giảng |

Không có `questions` hay answer key Chương 2. Không khôi phục đề từ bản sáu bài có quiz cũ. Những hàm toán/nến của shell Bot chỉ tạo ngữ cảnh xem thử, không là giáo trình hoặc engine để phát triển lại trong phạm vi này.

```javascript
const doc = new DOMParser().parseFromString(sourceHtml, 'text/html');
const node = doc.querySelector('#ch2-content-data');
if (!node) throw new Error('Thiếu dữ liệu Chương 2');
const data = JSON.parse(node.textContent);
if (data.lessons.length !== 6 || Object.keys(data.images).length !== 22)
  throw new Error('Trích thiếu bài hoặc ảnh');
if (data.lessons.some(x => x.sections.length !== 4) || 'questions' in data)
  throw new Error('Sai cấu trúc hướng dẫn Chương 2');
```

`published-preview` chỉ mô tả nội dung hoàn chỉnh trong file độc lập; khi import, publication status thật do quy trình xuất bản của IQX xác nhận. Không lấy string preview để bypass quyền.

Sanitize hoặc chuyển block theo component tin cậy. Không cho chạy script/event handler tùy ý từ prose. Giữ `<`/`>` dưới dạng escape đúng, không mất ∈/∉; giữ hook `data-image-src`/`data-image`. Các ảnh được render từ mapping an toàn, không eval hoặc mở URL tùy ý từ input người dùng.

Không import `SHOP.completions`, `newShopState`, `freshState`, bootstrap, ghi đè `renderMain` toàn cục, `IQX_CH2_PREVIEW` hay localStorage làm service thật. Mẫu gom completion và reward trong một bản ghi cục bộ để mô phỏng thao tác; **production vẫn để Học viện là nguồn completion, ví là sổ thưởng/chi**.

---

## 13. Ca nghiệm thu phải chạy trong repository

Các ca dưới đây là yêu cầu triển khai/kiểm thử IQX. Không phải chứng nhận đã đạt trên production. Mỗi ca cần input, expected/actual, lệnh, môi trường và đường dẫn test/hàm. Toàn bộ nằm trong spec, không yêu cầu JSON test hoặc file QA đầu vào riêng.

| ID | Điều kiện / thao tác | Kết quả bắt buộc |
|---|---|---|
| C2-001 | Trích bộ hai file v2.0 | Đúng 6 bài, 24 phần, 22 ảnh, 0 câu hỏi; nhận đúng version nội dung. |
| C2-002 | Hiển thị catalog Học viện mới | 13 chương/71 bài; Chương 2 sáu bài đúng tên/thứ tự, không tạo lại 113/125. |
| C2-003 | Render lần lượt sáu bài | Toàn văn, lead, bốn tiêu đề, bảng, hình và số đánh dấu khớp payload; không thay bằng tóm tắt. |
| C2-004 | Đối chiếu các phần không chỉnh của bản trước | 16/24 phần giữ nguyên; 8 phần đúng change_log, không thêm kiến thức ngoài phạm vi. |
| C2-005 | Tìm các đoạn cấu hình/công tắc tại Học viện | Không còn chỉ dẫn ghi cấu hình tại Học viện; master ở Bot. |
| C2-006 | Đọc bài 3 và spec ranh giới Bot | Không dạy Bot còn stop L1; không khôi phục trứng/V1 hoặc nguồn Săn mã cho Bot. |
| C2-007 | Mở bài 1, phân biệt hai công cụ | Full Backtest chọn mã/ngày/re-run; mini 24 tháng/30 mã không lặp là riêng. |
| C2-008 | Mở bài 5 | Sáu KPI; số giao dịch vòng đã đóng, không đếm lần Mua như mini. |
| C2-009 | Mở bài 6 | Lưu kết quả khác Lưu cấu hình; xem kết quả cũ không ghi chung, cảnh báo ghim đúng snapshot. |
| C2-010 | Sidebar Chương 2 và các chương khác | Chỉ Xem bài/Đã học, không Cấu hình/Luyện tập/công tắc ở dòng bài. |
| C2-011 | Bốn nút phần và bài trước/sau | Mở/cuộn đúng phần/bài, không tự hoàn thành. |
| C2-012 | Về linh thú khi đã chọn một loài khác | Giữ đúng con đang sử dụng, không tái tạo/render trứng hoặc cấp vốn. |
| C2-013 | Nội dung Chương 1 đã triển khai | Giữ toàn văn/biểu đồ/quiz 8/8, không placeholder hoặc manual override. |
| C2-014 | Mở Chương 2 khi Chương 1 chưa hoàn thành | Đọc theo guard hiện có; không thêm cổng hoàn thành Chương 1/toàn chương. |
| C2-015 | Tìm các chú thích ảnh bị yêu cầu bỏ | Không có meta file/ảnh/giả lập lặp trong prose; giữ lưu ý khớp/phí thật sự cần. |
| C2-016 | Chữ Việt và các dấu > < ∈ ∉ qua sanitizer | Hiện đúng, không XSS, không mất vế biểu thức. |
| C2-017 | Giải mã images trong HTML | Đủ 22 WebP, kích thước/hash đúng mục 5.3; không phụ thuộc file bên ngoài. |
| C2-018 | Số ảnh của từng bài | Lần lượt 3/5/3/1/6/4, đúng vùng của mục 3. |
| C2-019 | Đọc số đánh dấu trên các form và bảng bước | Mỗi số chỉ đúng control; không chỉ sang vị trí cũ hoặc che mất toán tử/số liệu. |
| C2-020 | Click ảnh/Phóng to | Đúng ảnh và tiêu đề; không gọi config, Backtest hoặc giao dịch. |
| C2-021 | Vừa khung rồi 100% | Fit không vượt viewport; 100% theo pixel ảnh, cuộn nội bộ. |
| C2-022 | Escape khi ảnh đang mở | Chỉ đóng ảnh, giữ bài/cuộn, trả focus đúng nút. |
| C2-023 | Dùng Tab/Enter mở và đóng ảnh | Nhãn rõ, focus có thể thấy, không thao tác nền khi dialog mở. |
| C2-024 | Ảnh dưới màn hình và ảnh trong details | Tải đúng khi cần; không bị bỏ khi reader rerender. |
| C2-025 | Một ảnh lỗi, thử lại | Lỗi tại ảnh/Thử lại đúng; không khóa hoàn thành vì chưa tải ảnh. |
| C2-026 | Đối chiếu input ngày và metadata A/B | Logic 2024-01-02 tới 2025-12-31; không nhầm định dạng locale hoặc chạy tới hiện tại. |
| C2-027 | Bài chưa xong, chỉ mở/đọc/cuộn/phóng to | Chưa completion, chưa thưởng. |
| C2-028 | Bấm Hoàn thành trên bài xuất bản có quyền | Ghi đúng bài manual; sau server commit hiển thị Đã học/Đã hoàn thành. |
| C2-029 | Bấm nút ngay không làm thao tác Backtest | Được hoàn thành; không timer/scroll gate/quiz/run/lợi nhuận. |
| C2-030 | Đang gửi completion | Disable chống bấm trùng; không success trước response. |
| C2-031 | Lỗi ghi hoặc validation | Giữ trạng thái cũ, hiện lỗi, không tăng tiến độ/xu. |
| C2-032 | Completion đã commit nhưng response mất | Retry/đọc lại đúng completed_at; không ghi lần hai. |
| C2-033 | Hai tab cùng bài | Một completion duy nhất. |
| C2-034 | Hai tab hai bài khác nhau | Cả hai được giữ; không overwrite cả progress từ client. |
| C2-035 | Làm lại/đọc lại bài xong | Không tăng progress, không đổi timestamp lần đầu. |
| C2-036 | Chỉ hoàn thành bài 6 trong tài khoản chưa học | Chương 1/6, không coi cả chương xong. |
| C2-037 | Hoàn thành đủ sáu | Chương 6/6, tổng khóa tăng đúng sáu bài, không grant chỉ báo. |
| C2-038 | Hoàn thành khi đang cuộn bài/panel | Giữ bài và vị trí, không tự chuyển bài sau hoặc Shop. |
| C2-039 | Completion mới với chưa có thưởng | Một bút toán +100 qua dịch vụ chung. |
| C2-040 | Retry cùng request hoặc event | Không +200; giữ khóa thưởng theo stable lesson. |
| C2-041 | Hai thiết bị cùng hoàn thành bài | Một completion và một thưởng, không chỉ chống ở nút client. |
| C2-042 | Hoàn thành hai bài khác nhau | +200 nếu chưa thưởng, ghi đủ hai nguồn bài. |
| C2-043 | Hoàn thành cả sáu bài | Tổng +600, không thêm thưởng chương. |
| C2-044 | Completion commit nhưng reward service lỗi | Giữ Đã học, pending xu; repair/retry từ bằng chứng, không bắt bấm học lại. |
| C2-045 | Reward chưa commit | Không hiện Đã nhận 100 hoặc tăng số dư đã xác nhận giả. |
| C2-046 | Chi hết/chi bớt xu rồi đọc hoặc hoàn thành lại | Không cấp lại khoản xu đã dùng. |
| C2-047 | Thay content version, đổi thứ tự/tên bài | Map cùng identity, không tạo quyền thưởng mới. |
| C2-048 | Client gửi amount/owner/passed/score giả | Server không tin; không cộng xu hoặc grant từ dữ liệu client. |
| C2-049 | Mua linh thú từ số xu nhận được | Nghiệp vụ Shop nguyên tử; không tự Sử dụng; không đổi tài khoản Bot. |
| C2-050 | Chạy mini/Backtest, lưu phiên bản hoặc áp danh mục | Không được coi là completion Chương 2 hoặc tạo thưởng. |
| C2-051 | Gửi manual cho bài Chương 1 | Từ chối vượt quiz; mode do server quản lý. |
| C2-052 | Bài placeholder/chưa xuất bản | Không completion/thưởng từ tên bài. |
| C2-053 | Gửi completion với ID/content version không hợp lệ | Lỗi rõ, không map theo ordinal sang bài khác. |
| C2-054 | Người dùng B dùng ID completion/ví của A | Bị từ chối; owner từ phiên đăng nhập. |
| C2-055 | Xem bài/ảnh, Hoàn thành, về linh thú | Không config revision/job/khớp lệnh/cấp vốn/danh mục nguồn. |
| C2-056 | Lưu cấu hình trên công cụ thật khi được quyền | Nguồn Bot/Backtest dùng chung, Mua/Bán độc lập và phiên hiệu lực đúng; reader không tạo bản config riêng. |
| C2-057 | Chạy đầy đủ Backtest từ công cụ | Không áp default 60 phiên/30 lượt/giấu mã hoặc V1/stop từ tài liệu cũ. |
| C2-058 | Lưu/mở A khi form đã đổi B | Kết quả A và lịch sử bất biến; xem không ghi đè config B. |
| C2-059 | Tắt Bán trong Full Backtest | Có Mua hợp lệ vẫn chạy; không thoát ngầm/ép bán cuối kỳ. |
| C2-060 | Nguồn mua Bot khác mã đang giữ | Reader không bán/đổi nguồn; Bot giữ luật mua theo nguồn, bán toàn vị thế ngoài scope này. |
| C2-061 | Nguồn ví/progress lỗi | Không ghi 0/71 hoặc 0 xu đè trạng thái thật, không mất bài. |
| C2-062 | Publication cần service còn thiếu | Báo đúng tích hợp thiếu, không biến mock thành dữ liệu production. |
| C2-063 | Sáu bài manual cũ đã hoàn thành có bằng chứng | Giữ completion/thời điểm, không yêu cầu học lại. |
| C2-064 | Đúng sáu bài quiz cũ đã đạt | Giữ nguồn legacy_quiz, không chấm lại hoặc tạo điểm mới. |
| C2-065 | 18 bài cũ có ID trùng | Mapping theo catalog/content, không cấp nhầm tiến độ hoặc xu. |
| C2-066 | Completion cũ chưa thưởng | Dry-run/đối soát và phê duyệt cộng bù; GET không trả thưởng ngầm. |
| C2-067 | Lặp migration/deploy | Không nhân chương/bài/ví/ownership, không reset hoặc cấp lại vốn. |
| C2-068 | LocalStorage HTML chứa hoàn thành/tiền | Không nhập làm bằng chứng trên website. |
| C2-069 | Ảnh/model linh thú production đã có | Dùng lại asset/renderer; ảnh tĩnh HTML chỉ tham chiếu. |
| C2-070 | 1440 và 1024 px | Nội dung trái/panel phải/rail, scroll độc lập; không ảnh/nút bị cắt. |
| C2-071 | 390 và 360 px | Không tràn ngang toàn trang; panel trượt, bảng cuộn nội bộ, Hoàn thành truy cập được. |
| C2-072 | Bàn phím/Reduced Motion | Focus và dialog hoạt động, không animation ép buộc. |
| C2-073 | Production bundle sau tích hợp | Không có nút reset/giả hoàn thành/đổi quyền mẫu hoặc whole-shell override. |
| C2-074 | Báo nghiệm thu | Có test/câu lệnh/môi trường và các phần chưa chạy; không đánh đồng HTML smoke với backend thật. |


**Tổng: 74 ca nghiệm thu tích hợp.** Ngoài ra, từng ảnh và từng bảng số của bài phải đối chiếu với nguồn, không chỉ đếm đủ số lượng.


---

## 14. Trình tự triển khai và phụ thuộc

1. Tìm đúng branch/build, reader, catalog, completion, ledger/reward, profile linh thú và các điểm route. Chỉ sửa nền đang được sử dụng.
2. Lập mapping sáu bài theo identity; đối chiếu catalog 13/71. Tách trường hợp sáu bài cũ và 18 bài cũ trước khi ghi dữ liệu.
3. Trích nội dung/ảnh từ HTML, đối chiếu hash, đưa vào pipeline nội dung/asset versioned. Không làm mất bảng hoặc ảnh trong details.
4. Đăng ký renderer và manual completion của Chương 2 vào Học viện. Giữ Chương 1/những bài đã xuất bản.
5. Nối sự kiện completion tin cậy với nghiệp vụ xu chung, chống trùng, retry và pending; UI không có quyền tự cấp.
6. Cập nhật trạng thái bài, tiến độ, số dư, phóng to và mobile. Các routing công cụ thật giữ nguyên; nút trong ảnh không có tác dụng nghiệp vụ.
7. Chạy unit/integration/hồi quy trong repository; ghi evidence cho từng ca. Dry-run/backup trước migration hoặc bù xu.
8. Báo file/hàm/service đã sửa, mapping, nội dung đã ghép, test đạt/chưa chạy, nguồn còn thiếu; chỉ deploy trong quyền được cấp.

| Phụ thuộc cần xác minh | Không tự làm |
|---|---|
| Catalog/lesson stable ID/metadata của nền đang có | Đổi số thứ tự thành quyền học khác hoặc tạo 71 bản completion |
| Completion manual và grant bài kiểm tra | Chuyển toàn bộ quiz sang manual |
| Ledger/reward/outbox/khóa duy nhất | Cộng xu bằng callback trình duyệt hoặc tạo ví chương riêng |
| Asset/renderer linh thú hiện hữu | Dựng lại loài từ ảnh nhúng hoặc reset active mascot |
| Backtest thật có next-open, Lưu phiên bản, trạng thái cấu hình chung | Báo tính năng có thật chỉ vì screenshot có; tự sửa engine ngoài scope |
| Phí/lô/lịch/thanh toán/đơn vị/điều chỉnh của công cụ thật | Dùng con số ví dụ hoặc lịch giả để định nghĩa production |
| Nguồn completion cũ cần bù xu | Bù hàng loạt khi chưa đối soát/phê duyệt |

Những điểm chưa có bằng chứng phải báo đúng phần thiếu, không yêu cầu thêm một bộ spec cũ như điều kiện mặc định. Triển khai phần độc lập đã đủ đầu vào, không dùng thiếu service làm lý do bỏ toàn văn hoặc ảnh.

---

## 15. Nhận dạng file, trích xuất và kiểm tra cục bộ


| Thuộc tính | Giá trị |
|---|---|
| HTML bàn giao | `IQX-Hoc-Vien-Chuong-2-MAU-v2.0.html` |
| Dung lượng | 1,550,487 byte |
| SHA-256 HTML | `81e155f0eb06542c9de984c1ac9a288d0fe62415345535edb6a31c05972a24e1` |
| SHA-256 text của ch2-content-data, UTF-8 | `e81f539f45c0969def93835800a980c9e0a64e6cf9fd269e7a4b94bc4dd1d745` |
| Nội dung / version | `iqx-ch2-six-user-guides-v3.0-academy71-shop` |
| Sáu bài / phần / ảnh / câu hỏi | 6 / 24 / 22 / 0 |
| Giữ nguyên HTML lời giảng so bản trước | 16/24 phần |
| Ảnh cập nhật từ bộ Chiến lược mới | 22/22 |
| Cơ chế kết thúc | Manual + thưởng 100 xu lần đầu, không grant chỉ báo |
| Nguồn ảnh | `IQX-Bo-Chien-Luoc-MAU-v1.0.html` |
| SHA-256 nguồn ảnh | `53e0d805afe62cce40674b655aa28c4cab2aefb5cfa51782cabb9a1df6b7970f` |
| HTML Chương 2 v1.0 làm nền | `2af0e537754281883e80b95db4ac57c37f169ef56e82a48a7f1fc91cb8b3907c` |

Hash toàn file dùng nhận diện đầu vào; code production được tách component nên không buộc giống byte toàn HTML. Nhưng nội dung, ảnh, số liệu và mapping phải đối chiếu theo bản này.


### 15.1. Những phần chỉ có trong mẫu

HTML khởi đầu chưa học/0 xu, mở bài 1. CSS, JavaScript và 22 ảnh đều nhúng, không cần tải thư viện/ảnh qua mạng. Reader có đầy đủ sáu bài; các chương khác chỉ giữ tên để xem bố cục. Không có đường xác nhận completion thật hoặc API ví IQX.

Các ảnh minh họa Backtest là hình tĩnh có phóng to; biểu thức và số liệu trong ảnh không thay đổi theo cấu hình Bot trong shell. Kết quả hoàn thành/xu lưu cục bộ trong khóa riêng của file khi trình duyệt hỗ trợ. Thiếu storage thì chỉ còn trạng thái trong lượt xem và phải báo đúng, không coi là dữ liệu đã đồng bộ.

`window.CH2`, `window.IQX_CH2_PREVIEW` dùng kiểm kê/kiểm tra cục bộ; không là API được gọi để cấp quyền production. Các màn Bot/Shop kế thừa không phải code engine, wallet hoặc mô hình linh thú được yêu cầu thay mới trong đợt này.

### 15.2. Phạm vi kiểm tra đã thực hiện khi bàn giao

Đã đọc payload, kiểm tra số phần/ảnh, giải mã ảnh; dựng lại 22 ảnh từ HTML Chiến lược mới bằng Chromium và đối chiếu A/B, giao dịch #18. Đã thử đọc sáu bài, mở ảnh, Vừa khung/100%, Escape, Hoàn thành/+100, chống hoàn thành lại, đủ sáu/600, bài 6 một mình là 1/6, liên kết Shop mua/đổi linh thú, trạng thái không grant kỹ thuật và không thay cấu hình/vốn/vị thế.

Đã kiểm tra nội dung và modal ở 1440/1024/390/360 px bằng Chromium nạp `set_content`. Môi trường chặn điều hướng file URL; **chưa chứng nhận persistence thực qua file URL/reload, nhiều thiết bị, auth, cơ sở dữ liệu, API hoặc worker production**. Phép thử local không thay các ca mục 13.

Không tuyên bố source lịch sử, công thức production hoặc hiệu quả đầu tư được xác minh chỉ vì A/B giả lập trùng số.

---

## 16. Đầu ra của AI dev và định nghĩa hoàn thành

Trả code/tài nguyên/test trong repository và báo cáo gồm: nền đang sửa, mapping, nội dung/ảnh đã nhập, completion/reward đã nối, hồi quy, ca đã chạy/chưa chạy/bị chặn, phần thiếu bằng chứng. Các file báo cáo/test do dev tạo là đầu ra công việc, không phải bộ thứ ba chủ sản phẩm phải gửi.

**Hoàn thành khi:** sáu bài thật hiển thị đầy đủ trong Học viện mới; 22 ảnh/phóng to đúng; hoàn thành bằng nút theo tài khoản; nhận 100 xu lần đầu đúng một lần, trạng thái pending/lỗi trung thực; tiến độ đúng; không quiz Chương 2, không tự cấp chỉ báo hoặc bật Bot; giữ Chương 1, vốn, lịch sử, cấu hình và mô hình linh thú đang có.

**Không hoàn thành nếu:** chỉ import tên bài, thay toàn văn bằng ảnh cả trang, bỏ ảnh hoặc tải từ path máy dựng, giấu quiz nhưng backend còn đòi điểm, dùng localStorage/client làm completion/ví chuẩn, tự sinh câu hỏi/linh thú hoặc sửa engine để làm ảnh trông khớp.

---

**HẾT SPEC CHƯƠNG 2 — v2.0.** Đúng hai file: spec này và HTML mẫu đi kèm. Nội dung hướng dẫn được ghép vào hệ thống mới, không tạo lại hệ thống giao dịch.

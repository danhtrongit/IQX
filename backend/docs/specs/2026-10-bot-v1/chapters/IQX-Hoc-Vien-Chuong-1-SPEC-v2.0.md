# IQX — NỘI DUNG HỌC VIỆN CHƯƠNG 1
## Chỉ báo kỹ thuật nền tảng · Bản cập nhật theo Bot, Học viện và Shop mới

**Phiên bản:** 2.0  
**Ngày biên soạn:** 07/10/2026  
**Bộ bàn giao:** đúng hai file — `IQX-Hoc-Vien-Chuong-1-SPEC-v2.0.md` và `IQX-Hoc-Vien-Chuong-1-MAU-v2.0.html`.  
**Đối tượng:** AI dev/frontend/backend/QA có quyền truy cập repository IQX.  
**Trạng thái:** bản nội dung và yêu cầu tích hợp theo các thay đổi được chủ sản phẩm đồng ý. Chưa xác nhận đã triển khai trên IQX production.

> **ĐỌC TRƯỚC KHI CODE:** Tích hợp toàn bộ sáu bài Chương 1 từ HTML này vào khung Học viện mới đang được phát triển/triển khai. Giữ đủ văn bản, công thức, ví dụ, bảng, 16 biểu đồ và 48 câu hỏi. Học viện chỉ học/xem kết quả/mở quyền; cấu hình và luyện tập nằm trong Bot. Hoàn thành hợp lệ lần đầu nhận 100 xu qua dịch vụ thưởng chung. Không dựng lại Bot, Shop, mini hoặc toàn bộ Học viện bằng cách copy nguyên ứng dụng HTML.

> **LINH THÚ ĐÃ CÓ TRÊN WEBSITE:** Tái sử dụng đúng mô hình, tài nguyên, bộ hiển thị và hoạt ảnh hiện hữu của IQX. Ảnh tĩnh nhúng trong HTML chỉ tạo bối cảnh để duyệt bố cục; không được tạo lại linh thú, cắt ảnh mẫu làm tài nguyên production, ép mọi tài khoản về Bạch Hổ hoặc thay mô hình đang có bằng ảnh này.

---

## 0. Cách dùng hai file và thứ tự ưu tiên

### 0.1. Bản này thay thế điều gì?

Bản 2.0 **thay cặp Chương 1 v1.0 cho lần tích hợp nội dung mới**. Không làm v1.0 trước rồi sửa tiếp. Không dùng các tài liệu legacy còn ấp trứng, Bot V1/V2 hoặc stop L1 để ghi đè yêu cầu hiện hành trong bản này.

| Thành phần | Nguồn chuẩn |
|---|---|
| Toàn văn sáu bài; câu hỏi, đáp án, giải thích; các ví dụ/hình/bảng | `script#ch1-content-data` và module `CH1` trong HTML v2.0 đi kèm |
| Bố cục đọc bài, mục lục, đề/kết quả và điểm nối Bot/Shop | HTML v2.0; dùng component và token của khung mới, không tạo trang độc lập |
| Quy tắc tích hợp, nguồn hoàn thành/quyền, thưởng một lần, lịch sử | Spec này |
| Nội dung các chương khác, toàn bộ nghiệp vụ Bot/Chiến lược/Shop | Các bộ mới đã bàn giao và implementation tương ứng; bản này chỉ nối những hợp đồng liên quan đã ghi đủ bên dưới |
| Model/hoạt ảnh linh thú production | Tài nguyên/bộ hiển thị thực đã có trong repository |
| Nguồn dữ liệu thị trường, lịch giao dịch, phí và engine | Repository/service đã được xác minh; không lấy dữ liệu giả của mẫu làm chuẩn |

HTML là nguồn đầy đủ của nội dung, không dùng bảng tóm tắt trong Markdown thay bài giảng. Các file cũ trong metadata `basis` chỉ là xuất xứ, không phải yêu cầu chủ sản phẩm gửi thêm file. Khi trích thành component/backend/test, dev được tổ chức lại mã nhưng phải bảo toàn ý nghĩa và dữ liệu theo các kiểm kê ở cuối tài liệu.

Bản cập nhật **không còn là bản sao nguyên byte của v1.0**. Phạm vi sửa nội dung đã được khóa tại mục 2.3; mọi phép tính/dataset và các câu không bị ảnh hưởng được giữ. Không âm thầm sửa thêm giáo trình, đáp án hay thuật toán để làm một kiểm thử đi qua.

### 0.2. Những việc không được suy từ HTML

- Trạng thái đã học/xu trong file chỉ phục vụ xem thử; production nhận kết quả, grant và bút toán từ server.
- Mở file lần đầu vào RSI là để duyệt Chương 1, không buộc production bỏ qua trạng thái đọc gần nhất của người dùng.
- Có đủ tên 13 chương/71 bài trong sidebar không đồng nghĩa đã có nội dung hoặc công cụ cho tất cả.
- Các màn Bot, mini, Shop, đặt lệnh và Săn mã quanh bài được kế thừa để thử liên kết. Không triển khai lại các engine đó trong gói nội dung này.
- Không bật điều kiện khi người dùng đạt 8/8, không khởi tạo/cấp lại vốn 100 triệu, không gọi worker giao dịch từ sự kiện học.

### 0.3. Thực hiện trên repository thật

AI dev phải tìm đúng viewer, route, catalog, dịch vụ đề/attempt/result, grant, ví xu và renderer linh thú. Ghi đường dẫn/hàm/bảng đã xác minh. Nếu hệ thống đã có hợp đồng tương đương thì tái sử dụng; không tạo dịch vụ song song chỉ vì tên minh họa khác.

Chỉ cần hai file của đợt này làm đầu vào nội dung. Không yêu cầu README, answer key, dataset hay JSON rời. Thiếu quyền repository hoặc một phụ thuộc thật thì báo đúng phần đó; tiếp tục phần độc lập đã đủ dữ liệu. Không báo đã tích hợp IQX chỉ vì HTML mở được.

---

## 1. Phạm vi triển khai Chương 1

| Làm trong đợt này | Không làm trong đợt này |
|---|---|
| Ghép toàn văn 6 bài/24 phần đúng điểm mở Học viện | Soạn hoặc xuất bản nội dung Chương 2–13 |
| Đưa đủ 16 hình bài giảng, bảng động, tooltip và bảng số liệu | Thay hình bằng một đường chung hoặc bỏ chart slot |
| Import đủ 48 câu, 10 hình đề, 2 bảng matrix; chấm và lưu server | Tự tạo thêm câu hoặc hạ ngưỡng đạt từ 8/8 |
| Ghi tiến độ, mở đúng 5 chỉ báo, Hợp lưu không mở chỉ báo | Tạo chỉ báo/công tắc/bộ 30 lượt Hợp lưu |
| Nối thưởng hoàn thành lần đầu 100 xu bằng dịch vụ chung | Gọi API cộng xu từ client tự khai pass; phát triển lại Shop |
| Thay phần văn bản product cũ bằng nội dung v2.0 đi kèm | Khôi phục trứng, V1, stop L1, cổng AI hoặc nguồn Săn mã cho Bot |
| Nối điều hướng về Bot, luyện tập tùy chọn và kiểm thử không tự ON | Nhúng editor vận hành vào sidebar hoặc màn kết quả Học viện |
| Bảo toàn kết quả cũ, grant, config, ví/xu, linh thú và vị thế | Reset tài khoản, thu hồi quyền hoặc thưởng lại vì đổi phiên bản |

Catalog hiện hành là **13 chương, 71 bài**, gồm 16 kỹ thuật, 42 cơ bản, 12 hướng dẫn và Hợp lưu. Chương 1 vẫn 6 bài. Các chương khác trong HTML chỉ là ngữ cảnh và placeholder; nội dung hợp lệ đã có trong repository phải được giữ, không ghi đè bằng placeholder.

## 2. Danh mục bài và định danh

Tên chương: **Chương 1 — Chỉ báo kỹ thuật nền tảng**. Không đổi nhãn chương thành phiên bản Bot mới. Tên sản phẩm là Bot; số chương không phải phiên bản Bot và không tạo tài khoản mới.

| Thứ tự | ID bài trong catalog | ID nội dung HTML | Tên trong sidebar | Tiêu đề bài | Năng lực mở |
|---:|---|---|---|---|---|
| 1 | `ch01-l01` | `rsi` | RSI | Chỉ báo RSI | rsi |
| 2 | `ch01-l02` | `macd` | MACD | Chỉ báo MACD | macd |
| 3 | `ch01-l03` | `ma` | MA / SMA | MA / SMA | ma |
| 4 | `ch01-l04` | `bollinger` | Bollinger Bands | Bollinger Bands | bollinger |
| 5 | `ch01-l05` | `volume` | Khối lượng | Khối lượng giao dịch | volume |
| 6 | `ch01-l06` | `hopluu` | Hợp lưu | Hợp lưu các chỉ báo | Không có indicator/công tắc riêng |

Nếu repository đã có ID riêng, dùng bảng mapping rõ ràng và duy nhất. Không match mơ hồ bằng tên, không dùng chỉ số mảng làm khóa lưu lâu dài. Đặc biệt, thứ tự các câu trong mảng không phải thứ tự các bài: luôn nhóm bằng `question.lesson`.

### 2.1. Bốn phần trong từng bài — giữ tên và thứ tự

| Bài | Phần 1 | Phần 2 | Phần 3 | Phần 4 |
|---|---|---|---|---|
| RSI | Khái niệm và cách đọc | Công thức và ví dụ tính | Chu kỳ và hai ngưỡng | Tín hiệu và cách vận dụng |
| MACD | Khái niệm và cách đọc | Công thức và ví dụ tính | Ý nghĩa của ba chu kỳ | Tín hiệu và cách vận dụng |
| MA / SMA | Khái niệm và cách đọc | Công thức và ví dụ tính | Chu kỳ và mức tham chiếu | Tín hiệu và cách vận dụng |
| Bollinger Bands | Khái niệm và cách đọc | Công thức và ví dụ tính | Chu kỳ và hệ số dải | Tín hiệu và cách vận dụng |
| Khối lượng | Khái niệm và cách đọc | Công thức và ví dụ tính | Số phiên tham chiếu và hệ số | Tín hiệu và cách vận dụng |
| Hợp lưu | Nguyên tắc kết hợp | Công thức và ví dụ tính | Chọn điều kiện và chỉnh tham số | Vận dụng trên một bộ điều kiện |

### 2.2. Nội dung phải được giữ đầy đủ

| Bài | Các thành phần đặc thù để đối chiếu, không phải tóm tắt thay bài |
|---|---|
| RSI | Đà giá và thang 0–100; vị trí khác chiều thay đổi; từ sáu giá đến RSI đầu tiên; cập nhật Wilder; chu kỳ khác ngưỡng; Mua/Bán có tham số riêng; hai tình huống tăng dưới ngưỡng và vượt ngưỡng; dấu bằng và kiểm tra lại cặp phiên |
| MACD | Hai EMA giá, MACD, tín hiệu, cột; phân biệt mốc 0 với tín hiệu; phép cập nhật và chuỗi khởi tạo từ phiên 1–34; ba chu kỳ tác động khác nhau; trạng thái trên/dưới không bắt buộc giao cắt mới; Mua/Bán độc lập |
| MA / SMA | MA là nhóm đường; công tắc bài này dùng SMA; cửa sổ trượt; ví dụ giá giảm nhưng SMA tăng; EMA dùng để giải thích; so SMA 20/50; giá so SMA khác độ dốc; ví dụ cả hai phía cùng đạt |
| Bollinger Bands | Giá và ba đường dải; độ lệch chuẩn chia N; bảng bình phương độ lệch; độ rộng chuẩn hóa là kiến thức trong bài, không mở thêm indicator; ảnh hưởng N/k; hai ví dụ quay vào dải; biên mở ∈ và ∉ trên dữ liệu hợp lệ |
| Khối lượng | Khối lượng khác giá trị giao dịch/số người/mua ròng; trung bình N phiên trước không gồm T; tỷ số và hệ số ngưỡng; hình cửa sổ; so 10/20 phiên; đổi dấu tác động khác; mốc đóng cửa trước không phải mở cửa hiện tại |
| Hợp lưu | Hai tập Mua/Bán độc lập và không nhất thiết có cùng số chỉ báo; AND trong cùng phiên; tập rỗng; dữ liệu thiếu; thêm/bỏ riêng một phía; bảng tín hiệu độc lập; ranh giới tín hiệu và thực thi Bot hiện hành |

Giữ phần EMA trong MA/MACD và độ rộng chuẩn hóa trong Bollinger vì chúng thuộc nội dung đã duyệt. Chỉ hoàn thành Chương 1 không mở EMA ở Chương 5; không tạo năng lực BandWidth riêng đã bị loại khỏi phạm vi. Kiến thức thành phần trong bài không đồng nghĩa cấp thêm chỉ báo.

---

### 2.3. Thay đổi nội dung đã được duyệt cho v2.0

| Vị trí | Thay đổi chính xác về phạm vi | Giữ lại |
|---|---|---|
| RSI phần 3 | Làm rõ đổi chu kỳ phía nào chỉ tính lại RSI phía đó; không nói một thao tác sửa chu kỳ Mua tự đổi Bán | Phần giải thích chu kỳ/ngưỡng, bảng, ví dụ và đồ thị |
| Phần 4 của năm bài chỉ báo | Thêm đoạn ngắn chỉ đường Bot → tên chỉ báo → Luyện tập hoặc Cấu hình; luyện tùy chọn, bản thử không ghi Bot | Tất cả nội dung chuyên môn phần 4 có trước |
| RSI phần 4 — đoạn nối luyện tập | Giới thiệu Bắt đầu, giữ tối đa 60 phiên, lý do Bán, Tổng lợi nhuận và số lần Mua, sang mã khác không chạy lại | Không thay các ví dụ/dữ liệu RSI của bài bằng nến mini |
| Hợp lưu phần 4 — từ “Có tín hiệu chưa phải đã có giao dịch” | Cập nhật Bot không stop/chốt lời/giới hạn giữ; VN30 hoặc danh mục riêng cho Mua, toàn bộ vị thế cho Bán; phân biệt mini 60 phiên | Ví dụ số và bảng hợp lưu ở đầu phần 4 |
| `hopluu-q6` | Cập nhật câu hỏi, phương án `o3` và giải thích; bỏ diễn đạt chốt lời legacy trong `o4` | ID câu, 4 lựa chọn, `correct = o3`, chủ đề tập rỗng |
| `hopluu-q8` | Chỉ sửa giải thích `o2`: không còn cắt lỗ độc lập, nêu điều kiện nguồn mua/trạng thái vị thế | Nội dung câu hỏi, bốn phương án và `correct = o2` |

Đối chiếu dữ liệu: **17/24 phần giữ nguyên toàn bộ HTML nội dung; 46/48 câu giữ nguyên toàn bộ object**. Bảy phần còn lại sửa/thêm đúng phạm vi bảng trên. ID và `correct` của cả 48 câu không đổi. Các mảng giá/khối lượng/dataset và cửa sổ điểm A/B giữ nguyên.

Nội dung sửa đã có sẵn trong HTML v2.0. Dev **không tự viết lại** từ mô tả trong bảng này và không cần tìm v1.0 để ghép thủ công.

## 3. Bố cục và điều hướng theo Học viện mới

### 3.1. Khung ba cột

Vùng nội dung chính bên trái hiển thị bài; panel Học viện bên phải giữ danh sách chương/bài; thanh công cụ ngoài cùng vẫn tồn tại. Học viện và Bot là công cụ bên phải, không dựng một ứng dụng Học viện riêng. Không có điều kiện tốt nghiệp, trứng, cấp 0–6 hoặc callback nở để đọc bài.

Panel dùng catalog 13/71, **Tiến độ học tập**, x/71 toàn khóa và x/6 Chương 1. Mỗi dòng chỉ có **Xem bài**, thêm **✓ Đã học** nếu hoàn thành. Không có Cấu hình, Luyện tập hoặc công tắc Mua/Bán/master ở dòng Học viện.

Giữ trạng thái thu/mở chương, vị trí cuộn panel, bài đang xem và ngữ cảnh sau tải lại theo account/view state. Không liên tục mở lại Chương 1 khi người dùng đã thu nó. Không xóa quyền hoặc hiển thị/ghi 0 thật chỉ vì API đang tải/lỗi.

### 3.2. Vùng đọc và bốn phần

Giữ header chương/tên bài/đoạn dẫn, điều hướng bốn phần, toàn văn, nút kiểm tra, kết quả và liên kết trước/sau. Thứ tự RSI → MACD → MA / SMA → Bollinger Bands → Khối lượng → Hợp lưu.

Nút **Về linh thú** đưa về linh thú đang sử dụng của tài khoản, không cố định Bạch Hổ khi người dùng đã đổi. Không remount/phát lại hoạt ảnh để cấp vốn, không tạo thêm renderer. Nút **Về Bot** ở cuối bài đã học hoặc màn kết quả chỉ điều hướng sang công cụ Bot; không mở editor vận hành bên trong Học viện và không tự ON.

Bài đọc dài cuộn trong vùng trái. Giữ kích thước và nhịp đọc/công thức/biểu đồ của mẫu; không thu toàn bài để vừa một màn. Điện thoại dùng panel đóng/mở ở bên phải và thanh công cụ giữ theo khung mới; không quay về bố cục cũ đặt toàn sidebar dưới bài.

Không đưa thuật ngữ triển khai, JSON, hash, ID dataset hay nội dung đọc-spec vào bài giảng. Không thêm lab 4.2/4.3, khối “Nhớ điều này”, khẩu hiệu hoặc đoạn tổng kết trùng đã bị bỏ.

### 3.3. Nội dung cố định và cấu hình cá nhân

Ví dụ, chart, bảng và đáp án của bài là dữ liệu giảng dạy cố định. Tham số ví dụ không đọc từ cấu hình cá nhân, và đọc bài không ghi tham số ví dụ vào cấu hình cá nhân.

Cấu hình giao dịch nằm ở Bot/Backtest. Điểm nối về Bot giữ tên chỉ báo/ngữ cảnh khi router có hỗ trợ; không cần tạo bảng cấu hình thứ hai để bài “có tương tác”. Phần hình/bảng trong bài vẫn có tooltip và tra cứu dữ liệu riêng như mục 5.

### 3.4. Khả năng tiếp cận và responsive

Kiểm tra ít nhất 1440, 1024, 390 và 360 px. Không tràn ngang cả trang; bảng lớn chỉ cuộn nội bộ. Dấu <, >, ∈, ∉, phân số và chỉ số dưới đọc được. Chart giá/chỉ báo chia sẻ đúng trục phiên nhưng không dùng sai thang giá trị.

Nút trước/sau/nộp/kết quả nằm trong vùng thao tác; không che rail. Focus có tên/role đúng, radio chọn bằng bàn phím, tooltip hỗ trợ trái/phải/Home/End theo mẫu; Reduced Motion không phát chuyển động cưỡng bức. Đóng panel/modal trả focus hợp lý. Lỗi một asset không xóa bài, grant hay ví.

## 4. Nguồn nội dung bên trong HTML và quy tắc bảo toàn

### 4.1. Các nguồn phải đọc

| Vị trí trong HTML | Dữ liệu/chức năng | Yêu cầu khi chuyển sang repository |
|---|---|---|
| `script#ch1-content-data[type="application/json"]` | `schema`, `version`, 6 `lessons`, 48 `questions`, các chuỗi giá/khối lượng và dataset riêng | Trích đủ, giữ UTF-8, không cắt nội dung hoặc làm mất cấu trúc |
| `lessons[].sections[].html` | Toàn văn, công thức dạng HTML, bảng tĩnh và các vị trí gắn chart/bảng động | Render an toàn, giữ hình dạng phân số, sub/sup, figure/caption, table và data hooks |
| `window.CH1` / `script#ch1-learning-module` | Các hàm toán, tạo model chart, renderer, bảng số động, đọc bài và trải nghiệm đề | Chuyển thành component/service phù hợp; không chỉ trích JSON rồi bỏ phần dựng hình |
| `drawLessonCharts()` | Danh sách hình từng bài, dữ liệu/điểm đánh dấu và bảng vận dụng | Phải chuyển đầy đủ; mục 5 liệt kê từng hình |
| `drawQuestion()` | Phân biệt biểu đồ với bảng `matrix` trong đề và khi xem lại | Không xử lý mọi `q.chart` thành một đường hoặc bỏ bảng |
| `script#registryData` và `REGISTRY` của khung mới | 16 chỉ báo đã chốt; nội dung Chương 1 gắn đúng rsi/macd/ma/bollinger/volume | Không viết lại registry/engine của 16 chỉ báo trong đợt ghép nội dung |
| `script#catalogData` / `CATALOG` | Mục lục mới 13 chương/71 bài | Tái sử dụng catalog đã có; chỉ sáu bài Chương 1 có nội dung trong file này |

### 4.2. Hai lớp metadata tham số có tên khác nhau

`lessons[].defaults` và `lessons[].fields` còn giữ metadata xuất xứ của giáo trình. Form thực tế của HTML dùng `REGISTRY` với hai phía độc lập. **Không dùng metadata giáo trình để khôi phục một form chung Mua/Bán.**

| Chỗ cần chú ý | Metadata bài học | Form/registry hai phía |
|---|---|---|
| RSI | `period`, `low`, `high` | `buy.params.period/level`; `sell.params.period/level` |
| Bollinger | `period`, `std` | Mỗi phía có `period`, `k` |

`std` trong metadata bài là tên cũ của hệ số dải, không phải giá trị σ để người dùng nhập. Ánh xạ về `k` hoặc mã thật của repo có kiểm thử; không suy `std` là một biến mới. Toàn văn và công thức trong bài vẫn giữ nguyên.

### 4.3. Các nút gắn dữ liệu động không được bỏ

Có sáu vị trí đặc biệt ngoài 16 chart:

- `[data-macd-seed]`: bảng tính từ phiên 26 đến 34 và kết luận số ở phiên 34 trong MACD phần 2.
- `[data-application="rsi"]`, `[data-application="macd"]`, `[data-application="ma"]`, `[data-application="bollinger"]`, `[data-application="volume"]`: các bảng đối chiếu từng yêu cầu ở phần 4.

Các vị trí này trống trong HTML nội dung tĩnh cho tới khi module tính và render. **Chỉ import `sections.html` sẽ làm bài thiếu bảng và số liệu.** Phải đưa cả model/tính toán phụ thuộc vào renderer mới.

### 4.4. Render an toàn nhưng không làm hỏng nội dung

Dùng nguồn nội dung đã được duyệt và có quyền xuất bản. Whitelist phần tử/thuộc tính cần thiết, hoặc chuyển sang cấu trúc block có kiểu; không cho script tùy ý từ nội dung chạy. Không dùng `eval` biểu thức người học gửi.

Việc làm sạch HTML phải giữ cấu trúc công thức (`.frac`, `.math-eq`, `sub`, `sup`), bảng, chart slot, dấu `<`/`>` đã escape và các data hooks hợp lệ. Test bản đã render chứ không chỉ đếm chuỗi trong JSON. Không loại `.chart-mount` để né lỗi thư viện.

---

### 4.5. Các hợp đồng nhúng bổ sung

`script#ch1-change-manifest` ghi nguồn, phiên bản, danh sách phần/câu sửa và kiểm kê. Chỉ phục vụ import/QA, không đưa vào UI người học. `#academyContractData`, `#catalogData` và `#registryData` là metadata khung được kế thừa, không thay thế source catalog/grants production.

Nguồn chuẩn nội dung là JSON đã sửa cùng renderer tính hình. Không chỉ trích JSON rồi bỏ các hàm tạo bảng/biểu đồ. Không thực thi toàn script của file này như backend; dùng parser để lấy dữ liệu, tách answer key và chấm ở server.

## 5. Hợp đồng biểu đồ và bảng số liệu

### 5.1. Kiểm kê bắt buộc

**16 biểu đồ trong bài giảng**: RSI 3, MACD 3, MA 3, Bollinger 3, Khối lượng 4. Bài Hợp lưu dùng các bảng đã có, không có chart đường riêng.

Trong đề có **10 câu dùng biểu đồ** (hai câu cho mỗi chỉ báo) và **2 câu dùng bảng matrix** (Hợp lưu). Cả hình trong đề và hình khi xem lại kết quả đều phải render.

| Bài/phần | ID vị trí trong nguồn | Thành phần bắt buộc | Dữ liệu và so sánh |
|---|---|---|---|
| RSI 1 | `concept-chart` | Giá phía trên; RSI 14 phía dưới, thang 0–100, mốc 30/50/70 | Cùng `D.prices` và trục phiên |
| RSI 3 | `period-chart` | RSI 14 và RSI 7; hai kiểu nét/màu, ngưỡng rõ | Cùng `D.prices` |
| RSI 4 | `rsi-application` | Giá, RSI 14 và A/B ở hai phiên liền nhau; bảng hai yêu cầu | `D.examPrices`, vị trí do `rsiApplyIndex` xác định |
| MACD 1 | `macd-concept` | Giá; MACD 12/26, tín hiệu9 và cột chênh lệch có mốc 0 | `D.prices` |
| MACD 3 | `macd-compare` | MACD giữ nguyên; tín hiệu9 và tín hiệu5 | Cùng chuỗi MACD 12/26 |
| MACD 4 | `macd-application` | Giá, MACD, tín hiệu9, cột; đánh dấu A; bảng so mốc 0/tín hiệu | `D.examPrices`, index 114 |
| MA 1 | `ma-concept` | Giá và SMA 20 trên cùng đơn vị | `D.prices` |
| MA 3 | `ma-compare` | Giá, SMA 20, SMA 50 | Cùng `D.prices` |
| MA 4 | `ma-application` | Giá và hai SMA; đánh dấu A; bảng kết quả Mua theo 20/50 | `D.examPrices`, index 110 |
| Bollinger 1 | `boll-concept` | Giá, đường giữa SMA 20, dải trên/dưới k2, vùng dải | `D.prices` |
| Bollinger 3 | `boll-compare` | Giá, đường giữa chung, dải k2 và k3 | Không tính/hiện thành độ rộng một đường |
| Bollinger 4 | `boll-application` | Giá và hai dải tại A/B; bảng ba yêu cầu | 19 giá 50, rồi 45 và 48; index19=A, index20=B |
| Khối lượng 1 | `volume-concept` | Giá; cột khối lượng và TB20 phiên trước | `D.prices` + `D.volumes`; đơn vị triệu CP |
| Khối lượng 2 | `volume-window` | Sáu cột; mức tham chiếu 4, ngưỡng 6 | `[2,3,4,5,6,7]`; cột cuối là hiện tại |
| Khối lượng 3 | `volume-compare` | Giá; cột khối lượng, TB20 và TB10 phiên trước | Cùng chuỗi giá/khối lượng |
| Khối lượng 4 | `volume-application` | Giá; cột, ngưỡng 1,5 × TB20; A và bảng hai yêu cầu | `D.examPrices` + `D.examVolumes`, index103 |

Index ở bảng này là **0-based trong dữ liệu nguồn**, không phải nhãn “Phiên” được đánh lại từ cửa sổ nhìn thấy. Không nhầm index114 thành dòng thứ114 theo cách đếm một-based.

### 5.2. Cửa sổ và điểm đánh dấu phải giống nguồn

- Chart khái niệm/tham số: `makeChart()` mặc định lấy `D.prices`, `end = length - 1`, `start = max(50, end - 59)`. Với nguồn hiện tại đó là index117–176. Không dùng riêng `D.visibleStart` để thay cửa sổ mà hàm hiện hành thực sự đang sử dụng.
- RSI phần 4 tìm index đầu tiên >80 thỏa: RSI trước <30, RSI hiện tại tăng và vẫn <30; nếu không thấy mới dùng nhánh dự phòng có trong nguồn. Với fixture hiện tại cần đối chiếu đúng điểm nguồn, không chọn thủ công một điểm đẹp khác.
- MACD phần 4: cửa sổ103–118; MA phần 4:101–114; Bollinger phần 4:15–20; Khối lượng phần 4:97–108.
- Các cửa sổ đề nằm trong `questions[].chart`. Bản đề Bollinger dùng riêng `D.datasets.bbBuy/bbSell`, không tự chuyển về chuỗi khái niệm.
- Các giá trị dưới điểm đánh dấu và bảng đối chiếu được lấy từ cùng model với hình. Không hardcode số theo một dataset khác.

### 5.3. Chú giải, trục và tương tác

Giữ tên series, đơn vị, chú giải, đường nét phân biệt, cột/đường mốc 0, mốc A/B và caption của từng hình. Biểu đồ nhiều phần phải chia sẻ trục thời gian; không dùng cùng thang y cho giá và RSI.

Trong phần bài giảng: có tooltip giá trị, điều khiển bàn phím theo mẫu và nút mở **“Xem bảng số liệu của biểu đồ”**. Bảng và tooltip dùng số từ cùng phép tính, giữ vị trí thiếu là `—`; các đường không nối liền qua một đoạn thiếu số liệu.

Trong đề: giữ nội dung chart/matrix và tooltip theo mẫu; `table:false` hiện không mở bảng số toàn chuỗi như phần bài giảng. Không tự thêm gợi ý đáp án. Khi xem lại kết quả, mở chi tiết câu phải dựng đúng hình của chính câu đó và bản đề đã làm.

Đồ thị không lấy giá thật ngẫu nhiên mỗi lần mở, không thay bằng ảnh minh họa rời hoặc path SVG không gắn dữ liệu. Hình biểu diễn từ fixture gốc đã duyệt, công bố là dữ liệu minh họa. Không tạo nhận định thị trường hoặc xác suất thắng từ các hình.

---

## 6. Công thức của Chương 1 — đúng biến thể trong nguồn

**Phạm vi của mục này:** ghi lại cách tính đã xuất hiện trong bài và module `CH1.math`, để tái lập số liệu và kiểm tra tương thích. Đây không phải tuyên bố mọi thư viện bên ngoài hay production IQX đang dùng cùng biến thể. Không lấy mã mẫu chạy frontend thay trực tiếp engine thật.

### 6.1. Giá và thời gian

Giá minh họa của bài dùng đơn vị giả định; một số tình huống chữ ghi rõ đồng/cổ phiếu. Khối lượng chuỗi minh họa dùng triệu cổ phiếu. Giữ đúng đơn vị của từng ví dụ, không mặc định toàn bộ chuỗi là giá VND của mã thật.

“Phiên” là quan sát giao dịch của ví dụ, không phải ngày lịch. Không sinh thêm timestamp hoặc ticker thị trường để các fixture trông như dữ liệu thật.

### 6.2. RSI Wilder

Với giá đóng cửa P, biến động Δ ở mỗi phiên là giá hiện tại trừ giá trước. Mức tăng U = max(Δ,0); mức giảm D = max(-Δ,0).

```text
G đầu = tổng U của đủ N biến động / N
L đầu = tổng D của đủ N biến động / N
G mới = ((N − 1) × G trước + U mới) / N
L mới = ((N − 1) × L trước + D mới) / N
RSI = 100 − 100 / (1 + G/L)
```

Bài dùng chữ D cho mức giảm trung bình; ở mô tả logic trên dùng L để không nhầm với mảng mức giảm. Không đổi ký hiệu hiển thị của toàn văn.

Hàm mẫu tính biểu thức tương đương `100 × G / (G+L)`. G>0/L=0 →100; G=0/L>0 →0; cả hai 0 →không xác định/null, không tự đặt50. Cần N+1 giá để có RSI đầu tiên; so RSI hiện tại với trước đó cần cả hai điểm hợp lệ.

Không thay cập nhật Wilder bằng rolling SMA hoặc chia tổng tăng cho số phiên tăng. Chuỗi Mua/Bán có N khác nhau phải tính riêng; đổi N một phía không lấy giá trị T−1 đã lưu từ N cũ.

### 6.3. SMA và EMA

```text
SMA_N(T) = trung bình N giá đóng cửa từ T−N+1 đến T, gồm T
alpha = 2 / (N+1)
EMA đầu = trung bình đủ N đầu vào hợp lệ đầu tiên
EMA mới = alpha × đầu vào mới + (1-alpha) × EMA trước
```

SMA đầu có ở indexN−1. Hàm EMA mẫu thu N đầu vào liên tiếp để seed; khi gặp giá trị không hữu hạn, hàm mẫu bỏ seed/trạng thái và khởi tạo lại từ chuỗi hợp lệ tiếp theo. Không tính EMA bằng cách nhân/chia SMA có chu kỳ khác.

Mục **MA / SMA** trong Chương 1 thực thi so giá với SMA. EMA xuất hiện để giảng và làm thành phần MACD; không tự cấp thêm công tắc EMA của chương sau.

### 6.4. MACD

```text
MACD = EMA_fast(close) − EMA_slow(close)
Signal = EMA_signal(MACD hợp lệ)
Histogram = MACD − Signal
```

`fast < slow`; mặc định12/26/9. Không điền0 cho giai đoạn chưa đủ dữ liệu để khởi tạo Signal. Theo seed của nguồn, với12/26/9: MACD đầu ở phiên 26; Signal đầu ở phiên 34. Mốc0 là mốc riêng, không thay Signal.

Thay chu kỳ Signal chỉ tính lại Signal/Histogram của phía đó; fast/slow và MACD của cùng phía không đổi khi chúng giữ nguyên.

### 6.5. Bollinger Bands

```text
Middle = SMA_N(close), gồm T
sigma = sqrt(sum((P_i − Middle)^2) / N)
Upper = Middle + k × sigma
Lower = Middle − k × sigma
Độ rộng chuẩn hóa = (Upper − Lower) / Middle, khi Middle > 0
```

Mẫu số độ lệch chuẩn là **N**, không tự thay N−1. Form mặc định N20/k2; ví dụ tính tay N5 vẫn giữ nguyên như minh họa, không đổi min của form chỉ để chứa N5.

Ở Chương 1 đã duyệt, `∈` dùng biên mở: `Lower < Price < Upper`; `∉` là phủ định của mệnh đề đó **khi Price và cả hai biên đều hợp lệ**. Bằng một biên: ∈ sai, ∉ đúng. Dữ liệu thiếu không tạo ∉ đúng.

Code/registry cũ chưa có định nghĩa biên hoặc đang dùng biên khác phải được báo, ánh xạ/version có kiểm thử; không sửa mọi chiến lược đã lưu để đồng nhất ngầm. Việc xác định biên cho Chương 1 ở đây dựa trên chính nội dung mới được duyệt, không phải một suy đoán bổ sung.

### 6.6. Khối lượng

```text
A_N(T) = trung bình Volume[T−N] … Volume[T−1], KHÔNG gồm T
R(T) = Volume(T)/A_N(T), khi A_N(T) > 0
Ngưỡng(T) = k × A_N(T)
```

Phiên hiện tại chỉ là đầu vào đem so sánh, không tham gia A. Thay N thay cả tập dữ liệu dùng tính trung bình; không đổi đơn thuần mẫu số. Các nhận xét “k tăng làm khó hơn” trong bài phải đọc cùng toán tử đang dùng; `<` và `>` có tác động khác.

Bài không cho phép kết luận dữ liệu thiếu/A=0 là tỷ số hợp lệ. Khi nối evaluator thật, không để mẫu `Volume > k × 0` tạo tín hiệu trái trạng thái dữ liệu được giảng; đối chiếu quy tắc validity đang có và nêu rõ khác biệt nếu phát hiện.

### 6.7. Hai tập AND

```text
E_buy  = chỉ báo có grant, master ON, buy ON
E_sell = chỉ báo có grant, master ON, sell ON
signal(side) chỉ có thể đúng khi E_side không rỗng,
             mọi rule bắt buộc hợp lệ và cùng đúng tại T
```

Mỗi chỉ báo có thể có nhiều dòng AND bên trong. Hai phía được đánh giá độc lập; không ép thành một giá trị loại trừ `buy/sell/none`. Với boolean đầy đủ, phép nhân các kết quả 0/1 trong bài là minh họa AND; không dùng tích rỗng bằng1 để tạo tín hiệu.

Dữ liệu thiếu/biểu thức lỗi là trạng thái riêng. Không bỏ một điều kiện bắt buộc đang dùng để nhóm còn lại được coi là đạt. Khi một điều kiện đã chứng minh sai thì nhóm không đạt; dù phân loại cuối là false hay thiếu theo evaluator hiện hành, tuyệt đối không được trả true nếu còn đầu vào bắt buộc thiếu. Phía không sử dụng dữ liệu đó được đánh giá độc lập.

### 6.8. Độ chính xác và phiên bản

Giữ số đủ chính xác trong tính toán và so sánh; chỉ làm tròn hiển thị như nguồn. Không so trên chuỗi đã định dạng `64,86` hoặc số đã làm tròn. Hệ quả của dấu bằng phải được kiểm tra trên giá trị gốc.

Module mẫu phục vụ các fixture được nhúng, không mô tả đầy đủ cách hồi phục mọi khoảng trống của dữ liệu thị trường, sự kiện doanh nghiệp hay khởi tạo từ mọi nguồn. Những chính sách ngoài fixture phải tìm trong registry/provider hiện hành. Không tự chọn giá forward-fill, đổi seed, đổi giá điều chỉnh hoặc sửa dữ liệu để khớp chart.

Nếu hàm chỉ báo hiện có khác Wilder/SMA seed/biên/cửa sổ đã dạy: lập mapping `calculation_version`/`rule_version`, tái sử dụng phần đúng, dùng adapter/version mới khi được tích hợp; không biến đổi lịch sử và cấu hình legacy không thông báo. Nội dung được duyệt **không chứng nhận parity** với engine sản xuất.

---

## 7. Liên kết năm chỉ báo — không đặt editor trong Học viện

### 7.1. Quyền và nguồn cấu hình

Học xong bài nào mở đúng chỉ báo đó trong Bot, Backtest và Cảnh báo; không cần đủ chương hoặc đủ lượt luyện. Hợp lưu không cấp indicator, công tắc hoặc mini riêng. Tất cả điều kiện Bot vẫn giữ ON/OFF và tham số mà người dùng chủ động lưu.

Bot và Backtest đầy đủ dùng nguồn cấu hình đã lưu chung; mini có snapshot riêng theo lượt; Cảnh báo ghim bản chọn lúc lưu. Học viện không ghi cấu hình. Nhấn Về Bot là điều hướng, không Apply, không tự bật và không copy defaults của bài vào account.

Bảng tham số/điều kiện bên dưới dùng đối chiếu ý nghĩa bài với công cụ đã triển khai. Không giao dựng lại form/calc của Bot trong đợt nội dung. Nếu công cụ chưa có hoặc khác định nghĩa, báo điểm nối cụ thể và giữ trạng thái đúng; không lấy công thức frontend mẫu làm bằng chứng parity production.

### 7.2. Tham số trong REGISTRY Chương 1 của HTML

| Chỉ báo | Trường | Mặc định Mua / Bán | Miền | Bước / kiểu |
|---|---|---|---|---|
| RSI | `period` | 14 / 14 | 5–50 | 1; số nguyên |
| RSI | `level` Mua | 30 | 10–49 | 1; số hợp lệ theo bước |
| RSI | `level` Bán | 70 | 51–90 | 1; số hợp lệ theo bước |
| MACD | `fast` | 12 / 12 | 2–50 | 1; số nguyên |
| MACD | `slow` | 26 / 26 | 5–100 | 1; số nguyên |
| MACD | `signal` | 9 / 9 | 2–30 | 1; số nguyên |
| MA / SMA | `period` | 20 / 20 | 5–200 | 1; số nguyên |
| Bollinger Bands | `period` | 20 / 20 | 10–100 | 1; số nguyên |
| Bollinger Bands | `k` | 2 / 2 | 1–3,5 | 0,1 |
| Khối lượng | `lookback` | 20 / 20 | 5–100 | 1; số nguyên |
| Khối lượng | `mult` | 1 / 1 | 0,5–3 | 0,1 |

MACD kiểm tra fast<slow trong từng phía. Mọi trường kiểm tra hữu hạn, đúng kiểu/miền/bước ở server. Không nhận NaN/Infinity, boolean thay số, unknown key hoặc payload tự cấp quyền. Không ép RSI `level` Mua thành ngưỡng Bán chỉ vì người dùng đổi dấu.

Các mặc định là **mẫu đang OFF**, không phải khuyến nghị tối ưu và không là trigger tự kích hoạt. Một ví dụ giảng dùng RSI Bán10/75 hoặc Volume k1,5 không đổi mẫu lưu mặc định của tài khoản.

### 7.3. Bộ điều kiện mẫu phải giữ

Ký hiệu T/T−1 ở bảng sau dành cho dev; form vẫn dùng tên “hiện tại/phiên trước” như HTML, không xuất chuỗi kỹ thuật dài.

| Chỉ báo | Mua mặc định | Bán mặc định | Dấu cho phép |
|---|---|---|---|
| RSI | RSI(T−1)<level_Mua AND RSI(T)>RSI(T−1) | RSI(T−1)>level_Bán AND RSI(T)<RSI(T−1) | Mỗi dòng `>` hoặc `<` |
| MACD | MACD(T)>Signal(T) | MACD(T)<Signal(T) | `>` hoặc `<` |
| MA / SMA | Close(T)>SMA(T) | Close(T)<SMA(T) | `>` hoặc `<` |
| Bollinger | Close(T−1)<Lower(T−1) AND Close(T)∈band(T) AND Close(T)>Close(T−1) | Close(T−1)>Upper(T−1) AND Close(T)∈band(T) AND Close(T)<Close(T−1) | Dòng1/3: `>` hoặc `<`; dòng2: `∈` hoặc `∉` |
| Khối lượng | Close(T)>Close(T−1) AND Volume(T)>mult×A(T) | Close(T)<Close(T−1) AND Volume(T)>mult×A(T) | Mỗi dòng `>` hoặc `<` |

T và T−1 của **một phía** phải được tính theo cùng bộ tham số phía đó. Nếu Mua/Bán khác tham số thì không chia sẻ nhầm series chỉ vì cùng tên RSI/MACD.

Không thêm slope, cross event, lọc theo mốc0, yêu cầu RSI hiện tại vượt ngưỡng, khối lượng hôm nay lớn hơn hôm qua hoặc cổng AI vào những dòng này. Các điều kiện do người dùng đổi dấu phải được giữ đúng. Không áp ràng buộc Bollinger `k² < N−1` cho mọi biểu thức; registry mẫu là `warn_diagnostics_not_blanket_reject`, không phải blanket reject.

### 7.4. Các thao tác không được phát sinh từ bài học

Đọc bài, đổi phần, bắt đầu/tiếp tục đề, nộp đề, mở kết quả và xem đáp án không tạo revision cấu hình. Hoàn thành chỉ ghi completion/grant và thưởng xu đúng mục 9.

Nếu người dùng chuyển sang Bot rồi chủ động sửa, dùng form có sẵn: Mua/Bán độc lập; Hủy không lưu; Đặt lại chỉ reset params/rules của tab đó, không tự ON; Lưu theo expected revision và phiên hiệu lực của Bot. Màn học không tự gọi Save và không thêm một nút “Áp dụng cấu hình cho Bot”.

Nguồn mua VN30/danh mục từ Bộ lọc là nghiệp vụ khác với cấu hình chỉ báo. Một bài đạt không thay nguồn mua hoặc áp dụng một danh mục.

## 8. Bài kiểm tra — giữ đủ 48 câu và trải nghiệm đã duyệt

### 8.1. Nội dung đề

Mỗi bài có đúng8 câu, mỗi câu4 lựa chọn, đúng1 đáp án. Không tự sinh câu khác, không viết lại phương án sai, không rút gọn giải thích. Dùng dữ liệu v2.0 đã sửa `hopluu-q6/q8`; không lấy answer key/giải thích của v1.0 ghi đè hai câu này. Mỗi câu có ID, bài, topic, phần liên quan, nội dung, options, correct ID, chart hoặc null và hint nếu có.

`correct` trỏ tới ID lựa chọn (`o1`…`o4`), **không phải chữ A/B/C/D cố định**. `section` nối về đúng phần 1–4 của chính bài. Chart có `kind`, cửa sổ, điểm và dataset riêng; matrix có head/rows.

### 8.2. Bắt đầu và làm bài

- Bắt đầu một lượt mới: xáo8 câu và xáo4 phương án của mỗi câu, giữ order cố định cho cả lượt.
- Chỉ hiển thị một câu tại một thời điểm, có thanh chuyển1–8, câu trước/tiếp, số câu đã trả lời; dùng máy tính được.
- Chọn đáp án chưa cho biết đúng/sai trước khi nộp. Có thể sửa lựa chọn.
- Quay về bài học, đổi câu hoặc reload phải tiếp tục đúng lượt và lựa chọn hợp lệ đã được lưu.
- Nút Nộp bài ở câu cuối chỉ cho nộp khi đủ8 câu; server vẫn xác minh đầy đủ, không chỉ dựa trạng thái nút client.
- Không thêm đồng hồ, số lần thi giới hạn, bắt buộc đọc theo số phút hoặc bài tập ngoài nguồn như một cổng mới.

### 8.3. Chấm và kết quả

- Chấm server sau submit. Score0–8; đạt khi8/8. Không nhận `score`, `passed`, `correct` từ client làm kết quả.
- Giữ tổng số đúng/sai và danh sách đáp án/giải thích như HTML đã duyệt. Các câu sai mở chi tiết mặc định; câu đúng có thể mở xem.
- Hiển thị đúng chữ cái theo thứ tự lựa chọn của **lượt đã làm**, không theo thứ tự mảng gốc.
- Có hình/bảng tương ứng khi mở lại câu và liên kết “Xem lại phần…” về đúng nội dung.
- Làm lại dùng cùng8 câu đã duyệt, xáo lại, cần xác nhận theo mẫu. Không xóa kết quả cũ hoặc mất quyền chỉ vì lần mới điểm thấp hơn.

### 8.4. Cấp quyền và tiến độ

Lần đầu đạt8/8: ghi hoàn thành duy nhất của bài, cấp grant tương ứng nếu là một trong năm chỉ báo và nối thưởng 100 xu theo mục 9. Hợp lưu ghi tiến độ, không tạo indicator/switch “Hợp lưu”. Không cấp cả chương hoặc chỉ báo chưa đạt.

`best_score` là lớn nhất đã đạt; `passed` có tính tích lũy. Số lượt thi là số submit thực, retry cùng attempt không tính hai lượt. Chương 1 hoàn thành tối đa6/6; tổng khóa thêm đúng số bài duy nhất, không reset tiến độ các chương khác hoặc tăng tổng mỗi lần thi lại.

**Pass không tự bật master/buy/sell.** Quyền và dữ liệu cấu hình đã có vẫn giữ. Bắt đầu, chấm hay xem kết quả không chạy worker Bot, không cấp vốn giao dịch và không đặt lệnh. Thưởng 100 xu là bút toán học tập riêng, không là tiền VND của Bot/Demo Trading.

### 8.5. Đáp án phải nằm ở server trong production

HTML độc lập chứa đáp án/giải thích và chấm cục bộ để chủ sản phẩm duyệt; nó cũng mô phỏng xu/tiến độ trong namespace riêng. Đây **không phải** cơ chế bảo vệ đề hoặc grant thật.

Khi đưa lên production:
- Tách đáp án và giải thích kết quả khỏi bundle/API tải đề trước submit; không gửi key bí mật trong JSON ẩn.
- API đọc đề chỉ trả nội dung, options, hint, hình/bảng và dữ liệu cần đọc câu; chart dữ liệu công khai không có nghĩa phải gửi answer key.
- API submit xác minh attempt thuộc user, đang ở phiên bản đề đã pin, ID câu/options hợp lệ, một lựa chọn mỗi câu và đủ8 câu.
- Cấp progress/grant và ghi kết quả trong transaction/idempotency của hệ thống. Không cho hai lần submit song song nhân đôi grant/tiến độ.
- Sau submit, server trả phần review được phép xem của đúng lần làm; cùng dữ liệu và thứ tự đã pin.

### 8.6. Danh mục 48 câu để đối chiếu import

Cột đáp án dưới đây là **ID trong dữ liệu gốc cho dev/QA**, không phải đáp án chữ cái sẽ luôn hiển thị như vậy. Toàn văn và toàn bộ giải thích vẫn phải lấy từ HTML, không chỉ dùng bảng này.

| ID câu | Bài | Phần | Chủ đề | Hình/bảng | Đáp án ID |
|---|---|---:|---|---|---|
| `rsi-q1` | RSI | 2 | Tính RSI đầu tiên | Không | `o1` |
| `rsi-q2` | RSI | 2 | Cập nhật sau một phiên tăng | Không | `o3` |
| `rsi-q3` | RSI | 1 | Đọc vị trí và chiều thay đổi | Chart `reading` | `o2` |
| `rsi-q4` | RSI | 3 | So sánh hai chu kỳ trên biểu đồ | Chart `compare` | `o4` |
| `rsi-q5` | RSI | 3 | Đổi ngưỡng quá bán | Không | `o1` |
| `rsi-q6` | RSI | 3 | Tham số và toán tử độc lập | Không | `o1` |
| `rsi-q7` | RSI | 4 | Tín hiệu mua không yêu cầu ở lại dưới ngưỡng | Không | `o2` |
| `rsi-q8` | RSI | 4 | Xét tín hiệu bán qua từng phiên | Không | `o4` |
| `macd-q1` | MACD | 2 | Công thức MACD và cột chênh lệch | Không | `o3` |
| `macd-q2` | MACD | 2 | Cập nhật đường tín hiệu | Không | `o1` |
| `macd-q3` | MACD | 4 | Đọc mốc 0 và đường tín hiệu | Chart `macd` | `o4` |
| `macd-q4` | MACD | 1 | Đọc sự thay đổi quan hệ hai đường | Chart `macd` | `o2` |
| `macd-q5` | MACD | 3 | Chỉ thay một tham số | Không | `o3` |
| `macd-q6` | MACD | 3 | Quan hệ chu kỳ nhanh và chậm | Không | `o4` |
| `macd-q7` | MACD | 4 | Tín hiệu mua với MACD âm | Không | `o1` |
| `macd-q8` | MACD | 3 | Đổi riêng chu kỳ tín hiệu Mua | Không | `o2` |
| `ma-q1` | MA / SMA | 2 | Tính và cập nhật SMA | Không | `o1` |
| `ma-q2` | MA / SMA | 2 | Tỷ trọng của giá mới trong EMA | Không | `o3` |
| `ma-q3` | MA / SMA | 4 | Đọc giá so với SMA | Chart `ma` | `o2` |
| `ma-q4` | MA / SMA | 3 | Đổi chu kỳ trên cùng giá | Chart `ma-compare` | `o4` |
| `ma-q5` | MA / SMA | 3 | Chu kỳ và giá trị của đường | Không | `o1` |
| `ma-q6` | MA / SMA | 4 | Hai phía cùng đúng | Không | `o3` |
| `ma-q7` | MA / SMA | 4 | Trạng thái không phải sự kiện một phiên | Không | `o2` |
| `ma-q8` | MA / SMA | 4 | Dấu bằng và tín hiệu bán | Không | `o4` |
| `bollinger-q1` | Bollinger Bands | 2 | Tính độ lệch chuẩn và hai dải | Không | `o2` |
| `bollinger-q2` | Bollinger Bands | 2 | Độ rộng tương đối | Không | `o3` |
| `bollinger-q3` | Bollinger Bands | 4 | Đọc giá quay trở lại dải dưới | Chart `bollinger` | `o1` |
| `bollinger-q4` | Bollinger Bands | 4 | Đọc giá quay trở lại dải trên | Chart `bollinger` | `o4` |
| `bollinger-q5` | Bollinger Bands | 3 | Chỉ thay hệ số dải | Không | `o2` |
| `bollinger-q6` | Bollinger Bands | 3 | Chu kỳ và điều kiện ở hai phiên | Không | `o3` |
| `bollinger-q7` | Bollinger Bands | 4 | Giá hồi nhưng vẫn ngoài dải | Không | `o4` |
| `bollinger-q8` | Bollinger Bands | 4 | Toán tử trong hoặc ngoài dải | Không | `o4` |
| `volume-q1` | Khối lượng | 2 | Tính mức tham chiếu | Không | `o3` |
| `volume-q2` | Khối lượng | 2 | Tỷ lệ và phần trăm | Không | `o2` |
| `volume-q3` | Khối lượng | 4 | Đọc phiên tăng có khối lượng | Chart `volume` | `o4` |
| `volume-q4` | Khối lượng | 4 | Đọc phiên giảm chưa đủ khối lượng | Chart `volume` | `o1` |
| `volume-q5` | Khối lượng | 3 | Ảnh hưởng hệ số gắn với dấu | Không | `o1` |
| `volume-q6` | Khối lượng | 3 | Thay số phiên tham chiếu | Không | `o4` |
| `volume-q7` | Khối lượng | 4 | Mốc giá đóng cửa trước | Không | `o1` |
| `volume-q8` | Khối lượng | 4 | Khối lượng bằng đúng ngưỡng | Không | `o2` |
| `hopluu-q1` | Hợp lưu | 2 | Hai tập điều kiện | Không | `o1` |
| `hopluu-q2` | Hợp lưu | 2 | Thiếu dữ liệu không phải bỏ điều kiện | Không | `o3` |
| `hopluu-q3` | Hợp lưu | 4 | Đọc hai phía trong một bảng | Bảng matrix | `o2` |
| `hopluu-q4` | Hợp lưu | 3 | Tắt riêng một phía | Bảng matrix | `o4` |
| `hopluu-q5` | Hợp lưu | 3 | Tăng ngưỡng Mua và giữ Bán | Không | `o1` |
| `hopluu-q6` | Hợp lưu | 2 | Tập rỗng không phát tín hiệu | Không | `o3` |
| `hopluu-q7` | Hợp lưu | 3 | Tín hiệu phải cùng phiên | Không | `o4` |
| `hopluu-q8` | Hợp lưu | 4 | Tín hiệu và thực thi | Không | `o2` |

Không bỏ hai câu matrix vì field có tên `chart`. Bộ render phải phân nhánh theo `kind`. Kiểm tra lại **10 chart + 2 matrix**, không chỉ tổng `q.chart != null`.

---

## 9. Hoàn thành, quyền và thưởng 100 xu

### 9.1. Một kết quả, ba nghĩa vụ độc lập

```text
Nộp đủ 8 câu đúng attempt → server chấm theo phiên bản đã chụp
→ lưu result/snapshot
→ nếu lần đầu đạt 8/8: completion duy nhất của bài
→ cấp/bảo đảm đúng grant nếu là bài chỉ báo
→ phát sự kiện tin cậy để dịch vụ Xu thưởng 100 đúng một lần
→ trả tiến độ, quyền và trạng thái xu đã xác nhận
```

Grant chỉ báo không phải công tắc ON; số xu không quyết định quyền học hoặc quyền giao dịch. Làm lại điểm thấp giữ completion/grant và xu đã có. Hoàn thành Hợp lưu vẫn nhận 100 xu nhưng không có năng lực giao dịch mới.

| Trạng thái | Tiến độ/quyền | Xu |
|---|---|---|
| Mở/đọc/tra bảng/chọn đáp án chưa nộp | Không hoàn thành | 0 |
| Chưa đạt trước đây, nộp 7/8 | Ghi result chưa đạt, không grant | 0 |
| Lần đầu đạt 8/8 chỉ báo | +1 bài, mở đúng chỉ báo | +100 một lần |
| Lần đầu đạt 8/8 Hợp lưu | +1 bài, không indicator | +100 một lần |
| Gửi lại cùng attempt/event sau timeout | Trả đúng kết quả đã có | Không tăng thêm |
| Làm lại bài đã đạt | Giữ best/pass/grant, ghi lượt mới | Không tăng/giảm |
| Chạy mini/Backtest hoặc có lợi nhuận | Không tăng bài Học viện | 0 |

Sáu bài hoàn thành lần đầu có tổng thưởng **600 xu**, không có thưởng hoàn thành chương riêng. Không bắt phải học đủ sáu mới thưởng từng bài.

### 9.2. Nối dịch vụ Xu, không tạo ví riêng cho Chương 1

Dùng ví xu và sổ thưởng chung của Shop. Khóa phần thưởng dựa **owner + họ thưởng hoàn thành lần đầu + định danh bài ổn định**; không lấy attempt ID, event ID, số chương, ngày deploy hoặc content version làm cơ sở thưởng lại.

Completion/result cần server xác minh. Client không gửi `score`, `passed`, số thưởng hoặc user ID như nguồn thật. Không có endpoint công khai “tặng 100 xu” được gọi từ nút học. Không dùng `SHOP.completions` hoặc localStorage trong mẫu làm nguồn completion/grant thật.

Cùng backend có thể commit result/completion/grant/reward trong một giao dịch phù hợp. Nếu tách dịch vụ, ghi completion + outbox tin cậy, rồi reward xử lý idempotent có retry/đối soát. Không có tình huống người dùng được báo nhận xu trước khi bút toán xác nhận.

Nếu completion đã ghi nhưng grant/xu chậm, giữ **✓ Đã học**, báo trạng thái đồng bộ đúng khi cần; không bắt thi lại hoặc tự xóa completion. Hoàn tất bút toán từ bằng chứng cũ, không phát completion mới để sửa sự cố.

### 9.3. Màn kết quả và thông báo

Giữ tổng đúng/sai, đáp án, giải thích, chart/matrix và liên kết ôn lại theo HTML. Lần đầu thưởng xác nhận thì hiện **“Hoàn thành bài học · +100 xu”**. Có thể hiện trạng thái Đã nhận 100 xu khi đọc lại. Không có nút Nhận thưởng riêng, không mở Shop bắt buộc, không che mất màn kết quả bằng một hành trình nhận thưởng.

Các nút chính: Xem bài học, Làm lại; bài chỉ báo đã mở có Về Bot. Hợp lưu không có nút cấu hình/luyện riêng. Shop luôn truy cập bằng thanh công cụ chung.

### 9.4. Người đã học và phần thưởng cũ

Giữ toàn bộ completion/grants/result có bằng chứng. Cập nhật v2.0 không làm bài thành bài mới để thưởng thêm. Cộng bù cho người đã hoàn thành nhưng chưa có bút toán là tác vụ của bộ Shop: dry-run, đối soát mapping, báo số tài khoản/số xu và chỉ thực hiện khi được phê duyệt. Không chạy backfill chỉ vì import nội dung Chương 1.

Một kết quả cũ 8/8 đã hợp lệ vẫn giữ hoàn thành, không bắt làm lại do sửa câu Hợp lưu. Không chấm lại attempt cũ bằng giải thích/đáp án v2.0. Không tự suy sở hữu linh thú từ xu đã chi hoặc set tất cả Bạch Hổ khi bài học cập nhật.

## 10. Ranh giới Bot, luyện tập, Chiến lược và linh thú

### 10.1. Mô hình hiện hành cần phản ánh trong bài

| Nội dung | Quy tắc hiện hành — không thay bằng luật legacy |
|---|---|
| Khởi đầu | Không trứng/cấp 0–6; người mới có Bạch Hổ, không có Bot V1 tự giao dịch |
| Sử dụng chỉ báo | Đạt bài mở quyền; người dùng chủ động bật/lưu phía Mua/Bán |
| Mua Bot | AND không rỗng, trong nguồn mua mới hiệu lực; còn kiểm tra tiền, vị thế và profile |
| Bán Bot | AND Bán trên mọi vị thế Bot đang giữ, không phụ thuộc lãi/lỗ hoặc mã còn trong nguồn Mua |
| Nguồn mua | VN30 mặc định; danh mục được áp dụng từ Bộ lọc thay VN30; ngừng dùng thì về VN30 |
| Đổi danh mục | Chỉ thay phạm vi mua mới; không bán cưỡng bức vị thế cũ |
| Các cơ chế thoát Bot | Không stop L1/%stop/chốt lời/trailing/max holding chạy ngầm |
| Mua/Bán rỗng | Phía rỗng không phát tín hiệu; tắt Mua không tắt xét Bán đang dùng; tắt Bán không tạo stop thay thế |
| Săn mã | Độc lập; tích Theo dõi vào Danh mục theo dõi, không tự thành nguồn Bot |
| Đặt lệnh thủ công | Độc lập Học viện; tài khoản và vốn giữ nguyên, không bị quiz tác động |
| Cấu hình | Bot/Backtest đầy đủ chung bản lưu; mini riêng theo lượt; Cảnh báo ghim snapshot |
| Linh thú | Chỉ cá nhân hóa hiển thị; đổi loài không đổi quyền, tham số, vị thế hoặc tài khoản |

Không triển khai lại worker, nguồn VN30, hồ sơ vốn, Shop hoặc các màn Chiến lược trong gói này. Nếu các bộ nền chưa được nối đúng, báo chính xác phụ thuộc; không khôi phục cắt lỗ cũ để “bảo vệ” và không cấp quyền giả cho một công cụ chưa hợp lệ.

### 10.2. Điểm nối luyện tập

Năm bài chỉ báo có đoạn dẫn sang **Bot → tên chỉ báo → Luyện tập/Cấu hình**. Không bắt luyện để mở chỉ báo; không đặt nút Luyện tập ở mỗi dòng Học viện. Hợp lưu không có mini. Khác biệt profile chỉ cần giải thích ngắn đúng bài, không thêm một chương hướng dẫn mới hoặc nhân bản toàn bộ mini.

Các mốc của bộ luyện đang được sử dụng:

| Phần | Quy tắc |
|---|---|
| Dữ liệu xem trước | 01/01/2024–30/06/2024 |
| Khoảng chạy | 01/07/2024–30/06/2026, 24 tháng lịch |
| Cửa sổ nhìn chart | Khoảng sáu tháng đã được mở |
| Mã | 30 cổ phiếu VN30; ngẫu nhiên riêng theo người/chỉ báo/bộ dữ liệu, không lặp trong cùng bộ chỉ báo |
| Ẩn | Mã, ngày tháng và thông tin nhận diện mã trong mini; dùng số phiên |
| Mua | 100% tiền khả dụng gồm phí theo profile mini |
| Bán | Điều kiện chỉ báo hoặc hết thời gian giữ; mặc định 60 phiên, chỉnh trước Bắt đầu |
| KPI mini | Tổng lợi nhuận; Số giao dịch = số lần Mua đã khớp |
| Lượt cũ | Xem lại được, không đổi điều kiện để chạy lại cùng mã |
| Xu/quyền | Mini không thưởng xu và không cấp thêm bài Học viện |

Những mốc trên chỉ xác định contract điều hướng và văn bản bài học; gói Chương 1 **không giao thay engine/lịch sử mini**. Không tự chọn đoạn thời gian khác. Dữ liệu thật và rổ theo phiên bản của bộ luyện do backend Bot cung cấp; không dùng các chuỗi minh họa trong bài cho mini production.

### 10.3. Ba loại dữ liệu không được trộn

Biểu đồ bài giảng/đề: fixture cố định, có nhãn minh họa, đọc đi đọc lại với cùng đáp án. Mini: dữ liệu lịch sử thật đã khóa, người dùng chọn điều kiện theo lượt. Bot vận hành/Backtest/Cảnh báo: dữ liệu và profile theo dịch vụ tương ứng. Không thay một loại bằng loại khác để chart “có dữ liệu”.

Đặc biệt: 60 phiên của mini không tự áp vào Bot/Backtest đầy đủ; số lần Mua của mini không thay định nghĩa số vòng đã đóng trong Backtest đầy đủ. Tín hiệu “thỏa Mua” không bằng giao dịch đã khớp.

## 11. Dữ liệu tích hợp, phiên bản và chuyển đổi

### 11.1. Hợp đồng tối thiểu — ánh xạ vào service hiện có

| Đối tượng | Dữ liệu cần giữ |
|---|---|
| Lesson/content | ID ổn định, catalog binding, thứ tự, full/lead/toc/sections, status, version, loại kiến thức, capability |
| Chart model | ID, dataset/version, tham số/cách tính, cửa sổ, điểm A/B, panels/series/đơn vị và hook bảng |
| Question private | ID, lesson, version, câu, options, correct ID, toàn bộ giải thích, section/hint, hình/bảng |
| Attempt | Owner, ID, bản nội dung/đề/dataset đã pin, thứ tự câu/phương án, câu hiện tại, lựa chọn, trạng thái |
| Result/review | Attempt ID, score, lựa chọn/thứ tự, snapshot câu/hình hoặc tham chiếu bất biến, thời điểm server |
| Completion/grant | Bài ổn định, lần đạt đầu, best score, quyền đúng chỉ báo; không là ON/OFF |
| Reward | Bài ổn định, completion nguồn, họ thưởng, bút toán ví, số xu, trạng thái/idempotency |
| Navigation | Panel/chương/bài/section/scroll đang xem; không thay nguồn quyền |

Không lấy index mảng làm định danh lâu dài. Mapping Chương 1 `ch01-l01`…`ch01-l06` vẫn đúng như cũ; chỉ chuẩn hóa sang ID thật nếu repo có mapping xác minh. Không vì các chương khác được đánh lại số mà ghép một bài khác vào kết quả Chương 1.

### 11.2. Pin version và bảo toàn kết quả

Nội dung v2.0 có phiên bản mới; các result/attempt đang dùng v1.0 phải tiếp tục đọc đúng bản đã pin. Hai câu Hợp lưu đã sửa không được dùng để chấm lại lịch sử. Nếu kho dữ liệu cũ không giữ snapshot, ghi rõ giới hạn lịch sử; không giả đã lưu bằng cách gắn nội dung mới vào ngày cũ.

Giữ completion, grant, best score, tất cả lượt nộp và cấu hình đã lưu. Làm lại không xóa kết quả trước. Reward dùng ID bài ổn định xuyên phiên bản; không chạy backfill tự động. Không thay công thức của mọi chiến lược legacy để khớp fixture giáo trình.

### 11.3. Import nội dung

1. Xác minh đúng viewer/catalog/quiz/grant/xu đang được dùng và nhánh repository.
2. Trích JSON nội dung, 48 câu, fixture và cả module tạo 16 hình/6 bảng động/12 visuals đề.
3. Sanitize hoặc chuyển typed blocks giữ công thức, thẻ sub/sup, phân số, table, chart slot và các data hooks cần thiết. Không eval.
4. Gắn vào viewer mới với panel học chỉ Xem bài/Đã học, routes Bot/Shop hiện có.
5. Nối server attempt/result/completion/grant; đáp án không có trong bundle tải đề trước submit.
6. Nối reward chung có chống trùng; giữ trạng thái chậm/lỗi trung thực và repair từ bằng chứng.
7. Chạy đủ nhóm nghiệm thu, đối chiếu source và chụp desktop/mobile; báo phần bị chặn riêng.

### 11.4. Những phần HTML không đưa vào production

| Có trong mẫu | Production phải làm |
|---|---|
| `CH1.grade`, answer key trong JSON, diagnostics `IQX_CH1_PREVIEW` | Chấm/xác minh server, tách đáp án trước submit, không public diagnostic grant |
| `SHOP.chapter1`, `SHOP.completions`, `completedIds` dựa trạng thái cục bộ | Progress/grant từ Học viện; ví chỉ giữ thưởng, không làm authority tiến độ |
| localStorage namespace `iqx.preview.ch1-v2.*` | Nguồn xác thực server; không import hoặc đồng bộ dữ liệu tùy ý từ file mẫu |
| Bot/mini/calendars/quotes dữ liệu giả kế thừa | Giữ engine/service thực đã bàn giao, không đưa thuật toán mock vào giao dịch |
| Ảnh base64 và `petAsset` | Model/asset/renderer IQX thật đã có, theo loài đang sử dụng |
| Footer Thông tin mẫu/Đặt lại mẫu | Chỉ cho duyệt/QA; không cấp quyền hoặc reset account production |
| Các bài Chương 2–13 placeholder | Không publish đề/nội dung giả, không ghi đè nội dung hợp lệ trong repo |
| Shell standalone HTML | Tách phần nội dung/hình/quiz vào khung hiện tại; không nhân đôi navigation/application |

Không bỏ cảnh báo dữ liệu minh họa ở hình rồi gọi là lịch sử thị trường. Đổi tên file hoặc mở HTML được không chứng minh đã tích hợp/backend đã an toàn.

## 12. Ca nghiệm thu — yêu cầu dev thực hiện

Các ca dưới đây phải chạy trên repository/môi trường được cấp quyền. **Không phải danh sách production đã đạt.** Những ca “Hồi quy Bot” chỉ kiểm tra điểm nối với component có sẵn; không có nghĩa tạo editor ngay trong Học viện.

| ID | Nhóm | Đầu vào / thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C1-001 | Nguồn | Đọc hai file v2.0 và đối chiếu manifest. | Đúng 6 bài và các hash ở mục 13; không lấy cặp v1.0/khung legacy làm bản đích. |
| C1-002 | Nội dung | Import sáu bài. | Đúng 6 ID, thứ tự, tên/lead/toc và 4 sections mỗi bài; đủ 24 phần, không thay bằng tóm tắt. |
| C1-003 | Nội dung | So DOM đã render với toàn văn HTML v2.0 của sáu bài. | Không mất công thức/bảng/caption; 17 phần nguyên bản, 7 phần sửa đúng manifest; không thêm khối đã bỏ. |
| C1-004 | Nội dung | Chọn bài ở chương khác. | Không xuất bản/cấp quyền nội dung mới ngoài Chương 1; không xóa nội dung hợp lệ đang có. |
| C1-005 | Nội dung | Đọc MA, MACD và Bollinger. | Giữ kiến thức EMA/độ rộng trong bài; không tự cấp EMA và không tạo BandWidth riêng. |
| C1-006 | Bố cục | Tài khoản mới mở Chương 1 không có trạng thái trứng/tốt nghiệp. | Đọc được ở vùng trái, panel Học viện/rail đúng khung mới; không phát nở hoặc cấp vốn. |
| C1-007 | Bố cục | Cuộn sidebar, mở nhiều chương, đổi bài rồi trở về linh thú. | Giữ trạng thái chương/cuộn phù hợp; không tự đổi tiến độ; renderer nền không nhân bản. |
| C1-008 | Bố cục | Bấm bốn mục lục và bài trước/sau. | Tới đúng section/bài; Hợp lưu là bài cuối Chương 1. |
| C1-009 | Responsive | Xem 1440/1024/390/360 px, bài dài, đề và review. | Không tràn ngang trang; panel mobile đúng khung mới, công thức đầy đủ, bảng nội bộ, nút sử dụng được. |
| C1-010 | Accessibility | Dùng bàn phím cho chart, tab, nút, đóng; bật Reduced Motion. | Focus rõ; trái/phải/Home/End đọc giá trị; không focus nền bị che hoặc chuyển động cưỡng bức. |
| C1-011 | Chart | Mở cả năm bài kỹ thuật và bốn phần từng bài. | Đúng 16 chart IDs của mục 5: 3+3+3+3+4; không chỉ tồn tại div trống. |
| C1-012 | Chart | RSI khái niệm/tham số. | Giá và RSI cùng phiên, thang 0–100; RSI 14/7 cùng dữ liệu; không ghi là phần trăm lợi nhuận. |
| C1-013 | Chart | MACD khái niệm/tham số. | Đủ MACD, Signal 9, Histogram, mốc0, giá; so Signal 5 không đổi MACD 12/26. |
| C1-014 | Chart | MA khái niệm/tham số. | Giá, SMA 20, SMA 50 đúng hình; không chỉ còn một SMA thiếu giá. |
| C1-015 | Chart | Bollinger khái niệm/tham số. | Đủ giá, đường giữa, trên, dưới; k2/k3 đúng; không thay bằng một đường BandWidth. |
| C1-016 | Chart | Khối lượng khái niệm/tham số. | Giá, cột, TB20/TB10; dữ liệu tham chiếu không chứa phiên hiện tại. |
| C1-017 | Chart | Mở volume-window. | Cột 2,3,4,5,6,7; trung bình4 và ngưỡng6; cột cuối là hiện tại. |
| C1-018 | Chart | Trỏ A/B, mở bảng dữ liệu và bảng vận dụng. | Tooltip/bảng/hình dùng cùng index, cùng giá trị; làm tròn hiển thị không đổi logic. |
| C1-019 | Chart | Mở MACD phần 2. | Có bảng seed phiên 26–34 và kết quả Signal đầu; không để [data-macd-seed] trống. |
| C1-020 | Chart | Mở phần 4 của năm bài. | Cả năm data-application có bảng đối chiếu đúng yêu cầu từ model. |
| C1-021 | Chart | Mở 10 câu có chart, 2 câu matrix và xem lại sau submit. | Đúng 12 visuals ở câu tương ứng; matrix không bị bỏ; review dùng hình của đúng lượt. |
| C1-022 | Chart | Series chưa đủ dữ liệu, resize và quay lại câu/section. | Không nối qua null hoặc đổi null thành0; không duplicate SVG/listener, không bỏ hình do vùng vừa hiện. |
| C1-023 | Toán RSI | Giá [100,101,100,102,101,104], N5; thêm103. | G1,2; D0,4; RSI 75. Sau103: G0,96; D0,52; RSI≈64,8648648649. |
| C1-024 | Toán RSI | Cả G/D=0; chỉ G>0; chỉ D>0; thiếu N+1 giá. | Theo nguồn: cả0/thiếu là không hợp lệ; chỉ G là100; chỉ D là0; không tự fill50. |
| C1-025 | Toán RSI | RSI 24→27; 28→32; 30→34; 26→25, ngưỡng Mua 30. | Mua mẫu lần lượt đúng, đúng, sai, sai; không bắt RSI vượt30. |
| C1-026 | Toán RSI | RSI 28→32→35, ngưỡng30. | Lần lên32 đạt; lần lên35 không đạt; không giữ tín hiệu cũ. |
| C1-027 | Toán MACD | EMA nhanh52,4; chậm51,9; Signal0,3. | MACD0,5; Histogram0,2. |
| C1-028 | Toán MACD | Signal 9 trước0,2; MACD mới0,8. | Signal mới0,32; Histogram0,48 theo câu đã duyệt. |
| C1-029 | Toán MACD | 26 giá100 rồi 8 giá110; 12/26/9. | MACD đầu ở phiên 26, Signal 9 đầu ở phiên 34; khớp CH1.math, không dùng0 lấp warmup. |
| C1-030 | Toán MACD | MACD−0,2; Signal−0,5. | Mua mẫu đúng dù MACD âm; không thêm MACD>0 hoặc yêu cầu cross mới. |
| C1-031 | Toán SMA | Giá [10,11,12,11,13], thêm12; N5. | SMA11,4 rồi11,8. Giá13→12 giảm không đồng nghĩa SMA giảm. |
| C1-032 | Toán EMA | EMA trước100; giá mới110; N9 và19. | EMA9 mới102; EMA19 mới101, đúng alpha2/(N+1). |
| C1-033 | Toán MA | Giá100; SMA10=99; SMA30=101; Mua>10, Bán<30. | Hai phía cùng đúng; không ép chỉ một tín hiệu. |
| C1-034 | Toán Bollinger | Giá [10,12,14,12,12], N5,k2. | Middle12; sigma=sqrt(1,6); Upper≈14,5298221281; Lower≈9,4701778719; không chia N−1. |
| C1-035 | Toán Bollinger | 19 giá50 rồi45,48; N20,k2. | Tại48 đủ ba yêu cầu Mua; dải mỗi phiên được tính riêng; không lấy dải cuối so giá45. |
| C1-036 | Toán Bollinger | Lower46, Upper54, Close46. | Dòng ∈ sai; ∉ đúng khi đủ dữ liệu. Không suy cả tín hiệu Bollinger chỉ từ dòng2. |
| C1-037 | Toán Bollinger | Thiếu Close hoặc một biên ở dòng ∉. | Thiếu dữ liệu, không true; không dùng dải cũ thay thế. |
| C1-038 | Toán Volume | Năm phiên2,3,4,5,6; hiện tại7; k1,5. | A4; R1,75; ngưỡng6; không dùng cửa sổ3,4,5,6,7. |
| C1-039 | Toán Volume | Close trước20.000; Open21.000; Close20.500; Volume vượt ngưỡng. | Mua mẫu đạt vì Close>Close trước; không dùng màu nến để đổi thành Bán. |
| C1-040 | Toán Volume | A8 triệu; k1,5; Volume12 triệu. | Dấu > không đạt do bằng ngưỡng; không dùng >=. |
| C1-041 | Toán AND | Mua [1,1,0]; Bán [1,1]. | Mua0; Bán1; số điều kiện hai phía độc lập; không đa số. |
| C1-042 | Toán AND | Mua có đầu vào thiếu; Bán không dùng đầu vào đó; hoặc tập phía rỗng. | Không bỏ điều kiện thiếu để kết luận Mua đạt; Bán đánh giá riêng; tập rỗng không phát tín hiệu. |
| C1-043 | Đề | Bắt đầu từng bài. | 8 câu, 4 lựa chọn/câu, 1 đúng; ID bài/câu/option đúng mục 8.6. |
| C1-044 | Đề | Tạo hai attempt mới cùng bài. | Thứ tự có thể khác; trong một attempt thứ tự cố định; chấm theo optionID, không theo chữ cái. |
| C1-045 | Đề | Chọn đáp án, chuyển câu, quay về bài học rồi tiếp tục. | Giữ lựa chọn và thứ tự của attempt; không tự nộp/chấm. |
| C1-046 | Đề | Reload attempt đang làm. | Khôi phục trạng thái hợp lệ đã xác nhận; lỗi đọc không xóa câu trả lời cũ. |
| C1-047 | Đề | Thiếu một câu; gọi submit bằng UI hoặc API. | Client disable; server từ chối nộp thiếu; không grant. |
| C1-048 | Đề | Gửi option không thuộc câu hoặc câu không thuộc bài/attempt. | Server từ chối; không chấm bằng đáp án tự khai. |
| C1-049 | Đề | Xem network/bundle public trước submit. | Không có correctID/explanations riêng tư; chart data/hint được phép vẫn đủ để làm bài. |
| C1-050 | Kết quả | Nộp7/8, chưa đạt trước. | Ghi score7 và review đúng; chưa completion/grant, không xu và không auto-ON. |
| C1-051 | Kết quả | Nộp8/8 RSI lần đầu. | Một completion, grant RSI, +100 xu đúng một lần; master/buy/sell không tự bật; không cấp MACD. |
| C1-052 | Kết quả | Nộp8/8 Hợp lưu lần đầu. | Một completion và +100 xu; không indicator/công tắc/mini Hợp lưu. |
| C1-053 | Kết quả | Đã đạt và có cấu hình riêng; làm lại điểm thấp. | Giữ pass/grant/best, cấu hình và xu; giữ cả kết quả cũ và mới, không thưởng thêm. |
| C1-054 | Kết quả | Retry/double-submit cùng attempt. | Một result; tiến độ/grant/reward idempotent, không tăng hai lượt hay +200 xu. |
| C1-055 | Kết quả | Đổi phiên bản nội dung khi attempt đã mở. | Chấm/review theo bản pin; không trộn chart/câu/đáp án mới. |
| C1-056 | Quyền | Chưa đạt; client giả grant/masterON/score hoặc gọi reward. | Server không chấp nhận quyền hoặc điểm tự khai; Học viện không có editor ON/OFF. |
| C1-057 | Hồi quy Bot | RSI Mua14; Bán10/75; sửa Mua12. | Bán giữ10/75; series tách theo tham số, không dùng low/high chung để ghi đè. |
| C1-058 | Hồi quy Bot | Bollinger registry dùng k; metadata bài dùng std. | Mapping đúng hệ số; không tạo ô nhập sigma; không mất tham số riêng hai phía. |
| C1-059 | Hồi quy Bot | Đổi Mua > thành < hoặc ∈ thành ∉. | Lưu/đánh giá đúng toán tử; không ép về dấu mẫu vì tên phía. |
| C1-060 | Hồi quy Bot | Đặt lại ở tab Mua đã chỉnh. | Chỉ params/rules Mua về mặc định; giữ enabled; Bán/quyền/vốn không đổi; chưa Lưu chưa áp dụng. |
| C1-061 | Hồi quy Bot | MasterOFF, hai sideOFF; bật tổng. | Mở form chọn phía; Hủy không bật; chọn MuaON rồi Lưu chỉ bật tổng/Mua theo ý định. |
| C1-062 | Hồi quy Bot | MasterOFF, có childON; chỉ vào Cấu hình sửa tham số. | Không tự bật tổng; lưu đúng tham số nhưng không tạo ý định kích hoạt mới. |
| C1-063 | Hồi quy Bot | MasterON; tắt tổng rồi bật lại. | Giữ tham số/toán tử/side state; không reset hoặc tự bật Bán. |
| C1-064 | Hồi quy Bot | Tắt cả hai side rồi Lưu. | MasterOFF; không masterON rỗng hoặc all([])=true. |
| C1-065 | Hồi quy Bot | Chu kỳ thập phân, NaN/Infinity, boolean, ngoài miền hoặc fast>=slow. | Server từ chối và hiển thị lỗi; không âm thầm sửa số lúc Lưu. |
| C1-066 | Hồi quy Bot | Hai thiết bị cùng expected_revision; retry hoặc đóng form dirty. | Xử lý xung đột/idempotency; Hủy không ghi; save lỗi giữ draft; không báo thành công giả. |
| C1-067 | Tích hợp | Đọc, pass bài hoặc Về Bot; sau đó người dùng chủ động lưu cấu hình trong Bot. | Read/pass/navigation không tạo revisionON; chỉ Save ở Bot có phiên hiệu lực theo contract chung. |
| C1-068 | Tích hợp | Bot còn vị thế, không điều kiện Bán; đọc Hợp lưu và làm q6/q8. | Nội dung/đáp án không nói còn stop nền; thao tác học không bán, không khôi phục stop hoặc fallback. |
| C1-069 | Tích hợp | Deploy nội dung v2.0. | Giữ account/vốn/vị thế/history/grants/attempts/xu/loài đang dùng; không tạo Bot mới hoặc cấp lại vốn. |
| C1-070 | Tích hợp | Sửa localStorage hoặc gọi diagnostics trong HTML mẫu. | Không thể ghi vào IQX thật; production không có diagnostics cấp quyền/reset/đề đáp án từ client. |
| C1-071 | Tích hợp | Engine RSI/BB/Volume đang khác công thức/hình nguồn. | Có ma trận version/mapping/test; không sửa nội dung để che khác biệt hoặc ghi đè lịch sử. |
| C1-072 | Tích hợp | API chưa đăng nhập/hết quyền hoặc owner khác. | Không đọc/ghi attempt/result/grant/config riêng của người khác; không tin score client. |
| C1-073 | Tích hợp | Render tên tiếng Việt và dấu <,>,∈,∉ sau sanitize. | Không mất chữ/toán tử, không XSS; giữ công thức/bảng/chart slot hợp lệ. |
| C1-074 | Catalog | Mở panel Học viện mới. | 13 chương/71 bài; Chương1 sáu bài; không xuất hiện chương/chỉ báo đã bỏ. |
| C1-075 | Panel | Đọc từng dòng và kết quả của sáu bài. | Không nút Cấu hình/switch/Luyện tập trong dòng Học viện; kết quả chỉ Về Bot điều hướng. |
| C1-076 | RSI | Đọc phần3 chu kỳ; sửa chu kỳ Mua ở Bot. | Bài nói rõ phía Mua được tính lại, phía Bán giữ tham số/chuỗi riêng; số ví dụ không bị đổi. |
| C1-077 | Hợp lưu | Đọc phần4, vị thế đang lỗ, nguồn mua mới đổi. | Bán vẫn xét toàn bộ vị thế theo điều kiện; không stop/chốt lời/giới hạn thời gian ngầm. |
| C1-078 | Đề sửa | Đối chiếu q6/q8 với bản v2.0. | q6 đúngo3, q8 đúngo2; không còn giải thích stop đang hoạt động; 46 câu khác giữ nguyên. |
| C1-079 | Xu | Hoàn thành lần đầu cả6 bài. | 6 completion, 5 grant kỹ thuật, tổng +600 xu; không thưởng cuối chương thêm. |
| C1-080 | Xu | Một bài đã đạt, mở lại/đổi version/làm lại8/8. | Một reward ổn định cho bài; không cộng thêm và không cấp lại quyền khác. |
| C1-081 | Xu | Hai thiết bị đạt cùng bài hoặc cùng event có ID khác. | Khóa theo owner+reward family+stable lesson; tối đa một khoản+100. |
| C1-082 | Xu | Completion ghi rồi reward chậm/lỗi. | Giữ Đã học; không báo đã nhận xu sớm; retry từ bằng chứng, không bắt thi lại. |
| C1-083 | Xu | Nộp7/8, đọc chart, chạy mini, lãi Backtest. | Không có thưởng hoàn thành bài; không cấp grant. |
| C1-084 | Xu | Import v2.0 vào tài khoản có completion legacy nhưng chưa reward. | Không tự backfill; tác vụ Shop đối soát/được phê duyệt riêng, không dùng IDversion để tặng lần2. |
| C1-085 | Xu | Bài Hợp lưu đạt rồi chi hết xu. | Hợp lưu vẫn Đã học; quyền không phụ thuộc số dư; không bị nhận lại thưởng. |
| C1-086 | Bot | RSI vừa mở, người dùng Về Bot. | Luyện tập và Cấu hình đều sử dụng được theo quyền, không bắt luyện trước, chưa tựON. |
| C1-087 | Mini | Mở Luyện tập sau bài RSI. | Đúng chỉ báo, dữ liệu/lượt/profile của bộ Bot; không tạo mini riêng dùng fixture giáo trình. |
| C1-088 | Mini | Đặt giữ60 trong mini rồi quay về bài/Bot. | Không ghi60 vào Bot hoặc Backtest đầy đủ, không cộng bài/xu từ lượt luyện. |
| C1-089 | Dữ liệu | Đổi cấu hình RSI cá nhân sau khi đọc ví dụ. | Hình, bảng, câu/đáp án cố định không đổi; thay đổi chỉ ở công cụ được người dùng lưu. |
| C1-090 | Linh thú | Tài khoản đang dùng Thanh Long, Về linh thú từ bài. | Hiện Thanh Long từ renderer hiện có; không đổi về Bạch Hổ/cấp vốn/remount tùy ý. |
| C1-091 | Linh thú | Model/asset hiện hữu tải lỗi. | Fallback/lỗi hiển thị đúng; vẫn giữ quyền/tiến độ/xu/loài; không tạo linh thú mới từ ảnh mẫu. |
| C1-092 | Lịch sử | Đang làm attemptv1 khi xuất bản v2.0. | Pin câu/hình/đáp án cũ; không chấm trộn hoặc sửa lịch sử; v2 dùng attempt mới. |
| C1-093 | Lịch sử | Làm lại bài nhiều lượt và tải review cũ. | Truy cập đúng từng lượt/thứ tự/câu/hình; không chỉ giữ lượt cuối của account production. |
| C1-094 | Phạm vi | Click chương ngoài1 trong mẫu/import. | Không có giáo trình/đề giả hoặc nút hoàn thành placeholder; giữ nội dung hợp lệ đang có thật. |
| C1-095 | Scope | Dev triển khai nội dung trong repo đã có Bot/Shop. | Chỉ chỉnh viewer/content/integration cần thiết; không thay nguồn dữ liệu/engine/luật vốn bằng mock. |
| C1-096 | An toàn | Client gửi rewardAmount=999 hoặc owner khác. | Server bỏ/từ chối giá trị không được phép; không ghi ví/tiến độ tài khoản khác. |
| C1-097 | UI | Nhận+100 lần đầu khi xem kết quả. | Thông báo không làm mất 8 đáp án, hình, giải thích hoặc bắt Vào Shop. |
| C1-098 | API | Mở GET catalog/bài/kết quả nhiều lần. | Không tạo attempt submit, không thưởng, không tạo config revision/lệnh Bot. |
| C1-099 | Hồi quy | Đọc Chương1 rồi dùng đặt lệnh/Săn mã/Theo dõi. | Không thêm cổng học/trứng; danh mục theo dõi và tài khoản giữ đúng bộ mới. |
| C1-100 | Khác biệt | Dev phát hiện engine/fee/calendar khác mẫu. | Ghi đúng phụ thuộc; không dùng fixture để xác nhận production hoặc tự đổi công thức/đề. |

**Tổng: 100 ca nghiệm thu.** Mỗi biểu đồ, mỗi câu có hình/bảng và các bảng động cũng phải đối chiếu với nguồn, không dùng một ảnh RSI để thay kiểm tra toàn chương.

Dùng precision đủ trong tính toán; chỉ làm tròn hiển thị. Sai số so số fixture (ví dụ absolute 1e-8 trên các ví dụ nhỏ) không trở thành tolerance cho toán tử >/<. Bằng ngưỡng vẫn theo rule nghiêm ngặt.

Bằng chứng: câu lệnh, test/hàm, input, expected/actual, môi trường, ảnh/DOM khi cần. Tách kiểm thử HTML cục bộ khỏi database/API/worker/grant/reward thật.

## 13. Nhận diện file, kiểm kê và bằng chứng bảo toàn

### 13.1. Bản bàn giao

| Thuộc tính | Giá trị |
|---|---|
| File HTML | `IQX-Hoc-Vien-Chuong-1-MAU-v2.0.html` |
| Kích thước UTF-8 | 695,316 byte |
| SHA-256 toàn HTML | `af4da733c6065cad6f381916395a3a2fe3cf737fa0d9bf6f8596a6f7ef5eaff0` |
| Nguồn nội dung | `script#ch1-content-data[type="application/json"]` |
| Content schema | `2` |
| Content version | `iqx-ch1-lessons-2026-10-07-v2.0` |
| SHA-256 text JSON nhúng | `377bd65337dfbbad2e73ae5183b8dddf0a22e32c4cc6b3b1fde7e3e8fb387354` |
| Manifest | `script#ch1-change-manifest` |
| Nguồn v1.0 (chỉ xuất xứ) | SHA-256 `114fc720f10d1dcd3c033e5c2966238e73340d5cf0f9cbdd9da6f67fd23bb4a9` |

Hash nhận diện file/nguồn để kiểm tra import, không bắt component production có cùng byte toàn HTML. Không nói v2.0 là bản sao nguyên byte v1.0. Bản bài/đề đổi tên không phải đổi policy Bot hay chính sách thưởng.

### 13.2. Dataset và visuals

| Nguồn | Số quan sát / kiểm kê |
|---|---:|
| `prices` | 177 |
| `volumes` | 177 |
| `examPrices` | 126 |
| `examVolumes` | 126 |
| `datasets.bbBuy`, `datasets.bbSell` | 22 / 22 |
| Chuỗi seed MACD inline | 26 giá100 + 8 giá110 =34 |
| Chuỗi vận dụng Bollinger inline | 19 giá50 +45 +48 =21 |
| Chuỗi Khối lượng inline | 2,3,4,5,6,7 triệu CP =6 |
| Chart trong bài | 3+3+3+3+4 =16 |
| Hình/bảng đề | 10 chart +2 matrix |
| Bảng/hook động ngoài chart | 1 MACD seed +5 data-application =6 |

Các chuỗi inline nằm trong `drawLessonCharts`, không được chỉ trích `datasets` rồi bỏ chúng. Đối chiếu source xác nhận toàn bộ dữ liệu số, point/window của biểu đồ giữ nguyên so với nguồn Chương 1 đã duyệt.

### 13.3. Hash object chuẩn hóa

Quy ước UTF-8 từ `json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))`.

| Bài | Số phần | Số hình bài | SHA-256 object nội dung |
|---|---:|---:|---|
| rsi | 4 | 3 | `150544b0588586e30781273fdade40ca2aea873b234034fcb9dd336a259dfade` |
| macd | 4 | 3 | `deeab26d7d200f344243b77672b84c895c5138184867108c642c7800b75fb1f4` |
| ma | 4 | 3 | `b8f7ce7916dc6fad4ce65ac1c7c7a8d4fef9c86526924849e91675312c51c7c5` |
| bollinger | 4 | 3 | `3e01340cc13a75fc5076f9935efa7699c3a1a302ddff38f45c1541d5becfce5b` |
| volume | 4 | 4 | `05a62df48cd15face41db502dd242c9c174ef0fc0d6d9aad356e4c777759e066` |
| hopluu | 4 | 0 | `fd80eb57dafac167516496cece2e729f8e50cddf3b6758b6a62372e8aab14308` |

Mảng 48 câu theo thứ tự nguồn: `54a2a8105d42c4aedbacfcbf62a00d115a5b17a45e9955e7231a7e7cd8eb0fd0`.  
Năm registry kỹ thuật Chương 1 trong khung mới: `18d7fe05811939a242c6fe22ead65a936d84ceed1bbd4b1f9bfdc2596d267ead`.

Correct ID cả 48 câu giữ nguyên; 46 object câu hỏi không đổi. Các phần sửa đã được liệt kê ở manifest, không dựa vào hash cũ để từ chối chính thay đổi đã được đồng ý.

### 13.4. Ví dụ trích dữ liệu, không thực thi script

```python
from pathlib import Path
from html.parser import HTMLParser
import json

class ExtractPayload(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.reading = False
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.reading = dict(attrs).get("id") == "ch1-content-data"
    def handle_data(self, data):
        if self.reading:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == "script":
            self.reading = False

parser = ExtractPayload()
parser.feed(Path("IQX-Hoc-Vien-Chuong-1-MAU-v2.0.html").read_text(encoding="utf-8"))
data = json.loads("".join(parser.parts))
assert len(data["lessons"]) == 6
assert all(len(x["sections"]) == 4 for x in data["lessons"])
assert len(data["questions"]) == 48
for lesson in data["lessons"]:
    qs = [q for q in data["questions"] if q["lesson"] == lesson["id"]]
    assert len(qs) == 8
    for q in qs:
        options = [x["id"] for x in q["options"]]
        assert len(options) == 4 and len(set(options)) == 4
        assert q["correct"] in options
# Vẫn phải chuyển renderer, chart model và sáu hook bảng động.
# Đáp án được import vào kho riêng của backend, không public trước submit.
```

### 13.5. Kiểm tra mẫu cục bộ và giới hạn bằng chứng

Trong lần bàn giao đã kiểm tra bằng Chromium ở desktop/mobile: sáu bài, 16 chart, 48 câu và 12 visuals đề/review, đạt/chưa đạt, reward lần đầu/chống nhận lại, mở quyền không ON, vào Bot/luyện tập/Shop và đổi linh thú không thay cấu hình.

Môi trường trình duyệt kiểm tra chặn điều hướng `file://`; kiểm tra dùng `set_content`, dữ liệu mô phỏng và fallback trong bộ nhớ. Không dùng kết quả này để khẳng định persistence file trên mọi trình duyệt, đồng bộ server, nguồn giá VN30, transaction backend, chống gian lận hoặc production đã đạt. Các ca mục 12 vẫn là nghĩa vụ dev chạy khi tích hợp thật.

## 14. Các phụ thuộc và báo cáo bàn giao của AI dev

### 14.1. Tự xác minh trong repository

| Phụ thuộc | Cần tìm/xác minh | Không được thay bằng |
|---|---|---|
| Workspace/viewer Học viện mới | Route thật, nội dung trái/panel phải/rail, mobile, nguồn catalog | Shell cũ 18/125 hoặc app standalone |
| Nội dung/đề/progress/grants | Kho bài/quiz, phiên bản, attempts, guard/readiness | Correct/pass được gửi từ client |
| Các công cụ năm chỉ báo | Registry/schema/evaluator, rule version, formulas/warmup/data basis | Template frontend chép thẳng vào production |
| Ví xu | Completion event/outbox, reward family, idempotency, balance/ledger | Tạo ví Chương1 riêng, client gọi cộng100 |
| Catalog mapping cũ/mới | Cùng bài ổn định và quyền đã có, result pin version | Map theo số thứ tự hoặc reset bài |
| Linh thú | Model/renderer/ownership/equipped ID thật | Ảnh base64 hoặc renderer mới được AI dựng lại |
| Quyền đọc/gói và deploy | Guard và môi trường được cấp quyền | Bypass vì HTML cho xem toàn bộ |

Một điểm thiếu không phải lý do bỏ toàn văn/biểu đồ đã đủ đầu vào. Tích hợp phần rõ và báo phần chưa nghiệm thu, không tạo trạng thái thành công giả. Nếu engine thật khác nội dung đã duyệt, báo chính xác khác biệt và phương án version/mapping; không tự sửa công thức/câu hỏi.

### 14.2. Đầu ra dev phải trả

Code/import/migration và test trong repository, kèm báo cáo: nền/commit đã sửa, mapping và versions, kiểm kê nội dung/chart/đề, điểm nối progress/grant/xu, kết quả test có bằng chứng, phần chưa xác minh. Không buộc người dùng chuẩn bị các file đó trước — đây là đầu ra dev phải làm.

Không tự deploy production, bật worker, chạy cộng bù xu hay sửa số dư khi chưa được cấp quyền. Chỉ dẫn nội dung không thay quyền thực thi trên dữ liệu người dùng.

### 14.3. Định nghĩa hoàn thành

Người dùng xem đủ sáu bài/24 phần và tất cả chart/bảng theo HTML v2.0 trong khung mới; làm và xem lại đúng 48 câu, chấm/pin server; đạt8/8 ghi completion, cấp đúng grant và thưởng100 một lần; Học viện không cấu hình/bật Bot; Về Bot và Shop dùng dịch vụ có sẵn; dữ liệu/lịch sử/linh thú giữ nguyên. Những phụ thuộc thật chưa hoạt động được báo rõ, không nghiệm thu bằng một màn RSI hoặc chỉ đếm tên bài.

---

**HẾT SPEC CHƯƠNG 1 — v2.0.** Gửi Markdown này cùng HTML v2.0. Bộ này chỉ ghép nội dung Chương 1 đã cập nhật vào các khung mới; không tạo lại linh thú, Bot, Shop, Chiến lược hoặc giáo trình các chương khác.

# IQX — BỘ HỌC VIỆN
## Khung 13 chương · 71 bài · Màn đọc · Hoàn thành · Tiến độ · Mở quyền

**Phiên bản bàn giao:** 1.0  
**Ngày:** 07/10/2026  
**File spec:** `IQX-Bo-Hoc-Vien-SPEC-v1.0.md`  
**HTML đi kèm:** `IQX-Bo-Hoc-Vien-MAU-v1.0.html`  
**Bộ đầu vào:** đúng hai file này. Không yêu cầu thêm README, prompt, ZIP, ảnh rời, dữ liệu câu hỏi hoặc các spec cũ để bắt đầu làm khung.  
**Trạng thái:** yêu cầu AI dev triển khai trên IQX hiện có; chưa phải xác nhận đã tích hợp hoặc nghiệm thu production.  
**Giáo trình:** chưa bàn giao trong bộ này. Toàn văn, công thức giảng dạy, biểu đồ/ảnh và câu hỏi của từng bài được ghép bằng các đợt nội dung riêng.

> **CHỈ THỊ CHO AI DEV:** Đọc toàn bộ spec và mở HTML. Tìm đúng workspace Demo Trading, panel Học viện, catalog, renderer bài, nguồn tiến độ, dịch vụ kiểm tra/cấp quyền và các điểm dùng quyền ở Bot/Chiến lược trong repository được cấp quyền. Nâng cấp trên nền đó; không dựng một Học viện độc lập hoặc thay Bot bằng mã mô phỏng. Học viện chỉ xem bài, ghi nhận hoàn thành và mở đúng năng lực. Không có Cấu hình, ON/OFF hay Luyện tập trong dòng bài Học viện. Không tự viết giáo trình, tạo đề giả hoặc đánh dấu bài đã học để mở các nút. Bảo toàn các bài đã duyệt/đã tích hợp, tiến độ hợp lệ, tiền, vị thế, cấu hình và lịch sử.

---

## 0. Nguồn chuẩn, phạm vi và cách đọc

### 0.1. Bản đích hiện tại

Bộ này tiếp nối **Bộ Bot và nền giao dịch mới v1.0** đã được chủ sản phẩm đồng ý. Catalog được lấy nguyên từ `catalogData` trong `IQX-Bo-Bot-MAU-v1.0.html`: **13 chương, 71 bài, 16 chỉ báo kỹ thuật**. Hình thức kế thừa cùng khung ba cột của bộ Bot: nội dung chính, panel ngữ cảnh bên phải và thanh công cụ ngoài cùng.

Đây là bản **thay thế các yêu cầu Học viện cũ bị mâu thuẫn**, không phải yêu cầu thực hiện bản 18 chương trước rồi sửa tiếp. Các file cũ `IQX-Hoc-Vien.md`, `IQX-Hoc-Vien.html`, các biến thể `IQX-Hoc-Vien-Bo-Cuc-Cau-Truc-*` chỉ là căn cứ đối chiếu lịch sử. Những yêu cầu chờ nở, 18 chương/125 bài, 35 chỉ báo và cấu hình tại Học viện không còn áp dụng.

Tài liệu Chiến lược cũ vẫn có liên kết cấu hình Học viện, stop L1 và nguồn Săn mã cho Bot. **Không dùng những phần đó để ghi đè mô hình mới.** Phần còn phù hợp như tên chỉ tiêu Chương 3, kỳ tính riêng, quyền theo bài và lưu dữ liệu được tái sử dụng đúng phạm vi. Bộ Chiến lược mới sẽ được bàn giao riêng.

### 0.2. Thứ tự xử lý khi có khác biệt

| Nguồn | Cách sử dụng |
|---|---|
| Quyết định mới của chủ sản phẩm và nghiệp vụ trong spec này | Bản đích cho phạm vi Học viện. Không tự đổi số chương, kiểu hoàn thành hoặc vị trí cấu hình. |
| Bộ Bot mới đã chốt | Chuẩn ranh giới tài khoản, cấu hình, nguồn mua, giao dịch và luyện tập; bộ Học viện không viết lại luật Bot. Những ranh giới cần thiết được nhắc đầy đủ tại mục 7. |
| HTML Học viện đi kèm | Chuẩn bố cục và trạng thái giao diện của khung. Các điều khiển xem thử và ô nội dung trống không phải chức năng cấp quyền production. |
| Gói nội dung từng chương đã được duyệt, khi có trong hệ thống | Chuẩn toàn văn, ảnh, chart, câu hỏi và trải nghiệm kết quả của bài tương ứng. Không thay bằng nội dung tự sinh. |
| Mã nguồn, dữ liệu và service thật | Nơi xác minh route, quyền, lưu trữ và adapter. Không coi một tên API minh họa là đã tồn tại. |

Không cần chủ sản phẩm gửi lại các spec cũ để đọc những ranh giới đã ghi trong hai file này. Tuy nhiên, hai file khung **không chứa toàn văn những bài đã được bàn giao riêng**. Nếu repository chưa có bộ nội dung đó, chỉ để trạng thái chờ ghép; không tự tái dựng bài từ tên.

### 0.3. Làm và không làm

| Làm trong bộ Học viện | Không làm trong bộ Học viện |
|---|---|
| Nối Học viện vào workspace mới, không phụ thuộc trứng | Tạo cấp độ, nhiệm vụ nở, tiến hóa hoặc Bot mới |
| Catalog 13 chương/71 bài, trạng thái, danh sách thu/mở | Tự thêm/gộp/đổi tên bài hoặc dịch lại danh mục chưa được yêu cầu |
| Màn đọc có điểm ghép văn bản/công thức/bảng/chart/ảnh/kiểm tra | Viết 71 bài, tạo câu hỏi/đáp án hoặc biểu đồ số liệu bài học |
| Hai cơ chế hoàn thành, lưu tiến độ và cấp quyền đúng tài khoản | Đổi bài kiến thức thành nút hoàn thành trực tiếp hoặc ép bài hướng dẫn thi 8/8 |
| Ánh xạ tiến độ/quyền cũ và đồng bộ sang công cụ | Reset tiền, đổi tham số, bật Bot, áp danh mục hoặc tạo giao dịch |
| Loading/lỗi, điều hướng, khả năng truy cập và nghiệm thu | Sao chép control trạng thái mẫu, mock hoặc localStorage thành cơ chế quyền thật |

**Không có nội dung bài trong đợt khung không có nghĩa chỉ làm 71 dòng chữ.** Các nguồn, trạng thái, thao tác đọc và cơ chế hoàn thành cần được nối/tạo đúng hợp đồng để tiếp nhận nội dung thật mà không phải thiết kế lại.

---

## 1. Nguyên tắc sản phẩm phải giữ

1. Người dùng vào Học viện từ đầu, có linh thú; không phải học qua cấp 0–6 hoặc chờ nở. Không dùng `graduated_at`, animation callback hoặc một nhãn cấp để chặn Học viện.
2. Học viện ở **panel bên phải**, cùng thanh công cụ của Demo Trading. Không dựng sidebar bên trái hoặc trang Học viện mới để thay luồng đã duyệt.
3. Mọi dòng bài chỉ có **Xem bài**. Bài hoàn thành có **✓ Đã học**. Không có nút Cấu hình, Luyện tập, công tắc tổng, Mua hay Bán tại dòng bài.
4. Hoàn thành bài chỉ mở đúng năng lực: kỹ thuật mở chỉ báo; cơ bản mở chỉ tiêu Bộ lọc. Hoàn thành không tự kích hoạt bất kỳ nghiệp vụ giao dịch nào.
5. 16 bài kỹ thuật, 42 bài cơ bản và Hợp lưu giữ **8 câu, đạt 8/8**; 12 bài hướng dẫn thuộc Chương 2 và 4 dùng **Hoàn thành bài học**, không kiểm tra.
6. Luyện tập nằm ở Bot, tùy chọn. Không cần luyện trước khi cấu hình; 30 lượt luyện không tính thành bài và không làm tăng tiến độ Học viện.
7. Không yêu cầu học hết chương mới mở chỉ báo vừa đạt. Không tự thêm thứ tự học bắt buộc, tiền đề chương, giờ đọc, yêu cầu có lãi, số lệnh hoặc bài thi cuối chương.
8. Có tên bài, có nội dung, đã hoàn thành, đã cấp quyền và đã bật Bot là **các trạng thái khác nhau**.
9. Danh mục mới có đúng 71 bài. Không để lại các chỉ báo/chương đã bỏ thành mục khóa “sắp có” sẽ mở về sau.
10. Học viện không khóa đặt lệnh thủ công, Săn mã hoặc Danh mục theo dõi. Đăng nhập/quyền gói vẫn theo guard thật; không dùng yêu cầu này để bypass quyền tài khoản.

---

## 2. Bố cục, điều hướng và giao diện

### 2.1. Khung kế thừa bộ Bot

```text
Header và điều hướng IQX đang có
┌────────────────────────────────┬─────────────────────────────┬───────────┐
│ NỘI DUNG CHÍNH                  │ HỌC VIỆN                    │ CÔNG CỤ   │
│ Linh thú / nội dung bài         │ Tiến độ học tập x/71        │ Học viện  │
│ / kiểm tra của bài              │ Chương thu/mở               │ Đặt lệnh  │
│                                │ Tên bài + ✓ Đã học nếu có   │ Danh mục  │
│ [Về linh thú] khi đang đọc      │ [Xem bài]                   │ Bot       │
│                                │                             │ Săn mã…   │
└────────────────────────────────┴─────────────────────────────┴───────────┘
```

Học viện và Bot là công cụ bên phải. Header có mục Bài học/Học viện sẵn thì giữ định tuyến phù hợp, không nhân đôi sản phẩm. Nút CHIẾN LƯỢC trong HTML Bot kế thừa chỉ mở danh mục minh họa: khi tích hợp vẫn giữ route Chiến lược thật, không thay route bằng modal đó.

Tái sử dụng linh thú và renderer của tài khoản. Hình Bạch Hổ nhúng trong mẫu là tài nguyên tham chiếu; không gán loài Bạch Hổ cho mọi người, không tạo asset/animation hoặc cấp lại tài khoản khi chuyển bài.

### 2.2. Panel Học viện

Theo đúng thứ tự:

| Vị trí | Nội dung |
|---|---|
| Đầu panel | Học viện; dòng 13 chương · 71 bài học; làm mới; nút đóng panel ở mobile |
| Khối tiến độ | **Tiến độ học tập**, `x / 71`, thanh tiến độ |
| Nhóm chương | `CHƯƠNG n`, tên chương, `x / số bài của chương`, thu/mở |
| Dòng bài | Tên bài; ✓ Đã học nếu đã hoàn thành; nút Xem bài |

Mặc định lần đầu mở Chương 1; các chương khác đóng. Cho mở nhiều chương hoặc thu hết. Không tự mở lại Chương 1 mỗi lần cập nhật dữ liệu. Khi vào từ một chỉ báo Bot bị khóa, mở chương chứa đúng bài đó và nhận diện bài đang xem.

Cuộn panel độc lập với nội dung bên trái. Giữ chương đang mở, vị trí cuộn và bài hiện tại khi làm mới tiến độ. Bài dài xuống dòng trong vùng tên, không che nút Xem bài. Không thêm mô tả công thức, tham số, badge loại bài/viết tắt hoặc thẻ marketing vào sidebar.

### 2.3. Vùng nội dung chính

| Thao tác/trạng thái | Hành vi |
|---|---|
| Chưa chọn bài | Giữ linh thú và ngữ cảnh Bot đã duyệt; không chạy lại onboarding |
| Xem bài | Hiển thị bài tại vùng trái; panel Học viện và rail giữ nguyên |
| Chọn bài khác | Mở đúng bài; không ghi hoàn thành bài trước chỉ vì rời màn |
| Về linh thú | Đóng màn đọc, giữ tiến độ, chương mở và vị trí panel |
| Bot từ rail | Chuyển đúng công cụ Bot; không tạo tài khoản/config khác |
| Từ Bot → Xem bài của chỉ báo | Mở đúng bài và chương theo mapping, không suy grant từ việc điều hướng |
| Reload hoặc link trực tiếp | Khôi phục ngữ cảnh đọc hợp lệ theo router/view state; luôn đọc tiến độ từ nguồn tài khoản |

Link Hành trình cũ phải tiếp tục điều hướng phù hợp với workspace mới theo bộ Bot; không phát nở lại, không làm `GET` cấp vốn. Không tìm/thay toàn cục chuỗi `journey` trong database.

### 2.4. Hình thức desktop và mobile

Giữ token, nền tối, viền, kiểu nút, thứ tự ba cột của **mẫu Bot mới**, không áp lại breakpoint cũ làm rail chuyển thành hàng ngang. HTML hiện dùng panel 410 px và rail 78 px; trên 1750 px panel khoảng 25,2vw, rail 86 px; ở 1260/1030 px giảm theo CSS kế thừa. Đây là số đo tham chiếu, không ép thay layout toàn web nếu dự án đã có token tương đương.

Ở màn hình không quá 900 px, panel mở thành lớp bên cạnh rail phải; rail vẫn tồn tại. Mở Học viện có thể mở panel, chọn Xem bài thì thu panel để đọc vùng trái; có nút mở lại Danh sách bài. Không tràn ngang toàn trang ở 360/390 px; bảng hoặc công thức dài được cuộn nội bộ. Không để lớp panel đóng vẫn nhận focus hoặc chặn nền.

Giữ focus bàn phím, tên truy cập, trạng thái chương mở và bài đang chọn. Nút quay lại/đóng modal trả focus phù hợp. Tôn trọng Reduced Motion. Màu không là tín hiệu duy nhất cho Đã học/lỗi. Rail, footer mẫu và hộp thoại không được che nút thao tác.

---

## 3. Catalog 13 chương / 71 bài

### 3.1. Cấu trúc cố định của lần bàn giao

| Chương | Tên | Bài | Loại hoàn thành |
|---:|---|---:|---|
| 1 | Chỉ báo kỹ thuật nền tảng | 6 | Kiểm tra; 5 chỉ báo + Hợp lưu |
| 2 | Sử dụng Backtest | 6 | Hoàn thành bằng nút |
| 3 | Phân tích cơ bản nền tảng | 6 | Kiểm tra |
| 4 | Sử dụng Bộ lọc | 6 | Hoàn thành bằng nút |
| 5 | Xu hướng và động lượng nâng cao | 5 | Kiểm tra |
| 6 | Sức khỏe tài chính doanh nghiệp | 6 | Kiểm tra |
| 7 | Khối lượng và dòng tiền | 3 | Kiểm tra |
| 8 | Chất lượng dòng tiền doanh nghiệp | 6 | Kiểm tra |
| 9 | Định giá doanh nghiệp | 6 | Kiểm tra |
| 10 | Kênh giá và động lượng | 3 | Kiểm tra |
| 11 | Tăng trưởng dài hạn và hiệu quả vận hành | 6 | Kiểm tra |
| 12 | Độ ổn định doanh nghiệp | 6 | Kiểm tra |
| 13 | Cổ đông và phân bổ vốn | 6 | Kiểm tra |
| **Tổng** | | **71** | **59 bài kiểm tra, 12 bài hoàn thành bằng nút** |

Danh sách **từng bài, ID và loại quyền** nằm trong Phụ lục A và `script#catalogData` của HTML. Hai nơi phải khớp. Tên tiếng Anh/viết tắt trong danh mục được giữ từ bản đã chốt, không tự đặt lại tên; bài cơ bản Tăng trưởng LNST vẫn dùng nhãn **LNST**, không thêm phân biệt kế toán vào sidebar.

### 3.2. ID, phiên bản và capability

Mã `chXX-lYY` là vị trí trong một phiên bản catalog, không tự chứng minh cùng nội dung giữa các bản. Dùng khóa bài bền vững hoặc cặp `(catalog_version, lesson_id)` có mapping. Tên hiển thị không là khóa.

Tham chiếu phiên bản trong mẫu mới: `iqx-academy-outline-13ch-71lessons-v1`. Đây là nhãn logic để ánh xạ vào registry thật, không bắt đổi ID đang ổn định chỉ để trùng ví dụ.

16 `capability_id` kỹ thuật kế thừa bộ Bot. Với cơ bản, dùng factor ID thật và định nghĩa được duyệt. Không tự gán 42 ID/công thức/ngưỡng hoặc mặc định mọi chỉ tiêu có ba kỳ giống nhau. Chương 3 đã có sáu alias mẫu ở tài liệu Chiến lược; chúng được đối chiếu tại Phụ lục B, không phải bằng chứng các alias là ID production.

---

## 4. Trạng thái bài, nội dung và tiến độ

### 4.1. Không nhập các trạng thái thành một biến

| Trạng thái | Nguồn chuẩn | Tác dụng |
|---|---|---|
| Có tên bài | Catalog đã version | Hiện mục lục |
| Nội dung đã xuất bản | Manifest nội dung thật và bản được duyệt | Đọc nội dung tương ứng |
| Bài đang được xem | Router/view state | Nhấn mạnh dòng, khôi phục vị trí đọc |
| Đang làm kiểm tra | Attempt từ service kiểm tra | Phục hồi đúng đề/lựa chọn đã lưu |
| Bài đã hoàn thành | Bản ghi hoàn thành hợp lệ trên server | ✓ Đã học; tính tiến độ |
| Năng lực đã mở | Grant đúng bài/capability | Cho dùng công cụ trong phạm vi quyền |
| Chức năng đã triển khai | Registry/service sẵn sàng | Thao tác thực sự chạy được |
| Điều kiện Bot đang bật | Config đã lưu/hiệu lực của Bot | Thuộc bộ Bot, không thuộc tiến độ Học viện |

Đã hoàn thành không đồng nghĩa mọi bài khác đã mở hoặc tài khoản đã mua/bán. Trường `viewed_at`/scroll không được chuyển thành `completed_at`.

### 4.2. Nội dung thiếu và lỗi tải

- **Chưa xuất bản/chưa được ghép:** hiện đúng tên/chương và thông báo ngắn. Không có hành động thi hoặc Hoàn thành có thể chạy. Không giả xuất bản bằng đoạn “Nội dung đang cập nhật”.
- **Đang tải:** loading ở đúng vùng; không ghi 0 hoặc thiếu quyền vào server.
- **Lỗi tải:** báo lỗi và Thử lại; không biến lỗi mạng thành “bài chưa có nội dung” hoặc “người dùng chưa học”.
- **Đã học nhưng nội dung tạm lỗi/chưa gắn trong môi trường hiện tại:** giữ ✓ Đã học và bằng chứng hoàn thành; không mất grant vì mất phần đọc.
- **Chưa đủ quyền gói/đăng nhập:** dùng guard thật; phân biệt với khóa năng lực do chưa hoàn thành bài.
- **Đã có gói nội dung được duyệt trong repository:** mở bằng renderer đúng; màn trống trong HTML không được ghi đè hoặc xóa.

Không cần thêm tất cả trạng thái làm badge dưới mọi tên bài. Sidebar chủ yếu có Xem bài/Đã học; loading/lỗi đặt đúng vùng đang có vấn đề.

---

## 5. Màn đọc và hợp đồng ghép nội dung

### 5.1. Cấu trúc nhìn thấy

Đầu bài gồm Về linh thú, số bài trong chương, chương/tên chương, tên bài và ✓ Đã học nếu có. Toàn văn được render trong vùng trái. Nội dung, mục lục phần và thứ tự của từng bài lấy từ gói đã duyệt, không hardcode một bài RSI cho 71 ID.

Bốn phần là cấu trúc tham chiếu đã trao đổi: khái niệm/cách đọc, công thức/ví dụ, tham số hoặc kỳ tính/cách diễn giải, vận dụng. **Không dùng bốn ô trống trong mẫu mới để đổi tên phần hoặc rút gọn các bài thật.** Chương hướng dẫn dùng mạch và ảnh đã duyệt, không bắt tuân theo một bài công thức.

### 5.2. Những loại nội dung renderer phải tiếp nhận

| Loại | Yêu cầu tích hợp |
|---|---|
| Văn bản | Giữ đoạn, tiêu đề, nhấn mạnh và thứ tự; không tự tóm tắt hoặc thêm lời khuyến cáo bị chủ sản phẩm yêu cầu bỏ |
| Công thức | Hiển thị đủ ký hiệu, chỉ số và vế; xử lý `<`, `>`, `∈`, `∉`, phần trăm an toàn; không chuyển thành HTML lỗi |
| Bảng | Giữ header, đơn vị, dữ liệu và chú thích thuộc gói; mobile cuộn nội bộ |
| Biểu đồ bài giảng | Gắn đúng chart_id, dữ liệu và định nghĩa; không bỏ chart-mount hoặc dùng một đường chung cho mọi chỉ báo |
| Ảnh hướng dẫn | Hiện đúng ảnh/tỷ lệ; có thể xem lớn; không thêm lại chú thích về nguồn HTML/bản mẫu đã bị bỏ |
| Câu hỏi có hình/bảng | Liên kết đúng câu và tài nguyên; không loại hình khi đưa đề lên server |
| Mục lục phần | Anchor theo section_id; chỉ cuộn nội dung trái, không kéo panel khỏi vị trí |
| Phần kết thúc | Kiểm tra hoặc xác nhận hoàn thành theo đúng loại bài và readiness |

Mẫu khung không vẽ một chart số liệu thật vì không có bài học trong phạm vi. Các hình khung chỉ là vị trí nội dung. Khi ghép bài thật phải lấy số liệu/ảnh đã được bàn giao, không tạo dữ liệu mới cho vừa giao diện.

### 5.3. Manifest logic để ghép từng bài

Ví dụ dưới chỉ định nghĩa dữ liệu, **không phải một bài được xuất bản**:

```json
{
  "catalog_version": "iqx-academy-outline-13ch-71lessons-v1",
  "lesson_id": "ch01-l01",
  "content_status": "not_published",
  "content_version": null,
  "sections": [],
  "assets": [],
  "completion": {
    "mode": "quiz",
    "question_count": 8,
    "required_correct": 8,
    "assessment_version": null,
    "assessment_ready": false
  },
  "capability_binding": {"kind": "technical", "id": "rsi"}
}
```

Khi có nội dung: mỗi phần có ID, thứ tự, tiêu đề và các block có kiểu; ảnh/chart có tham chiếu tài nguyên. Dùng schema hiện hữu tương đương nếu đã có. Với HTML bài học được bàn giao, làm adapter có kiểm soát để giữ nội dung, không nhúng toàn bộ document có navigation/quiz tự cấp quyền từ client thành một app thứ hai.

Ảnh/biểu đồ/công thức và đề được version theo gói bài. Một tài nguyên tải lỗi có thể thử lại riêng; không xóa block hoặc báo bài hoàn chỉnh trong khi mất biểu đồ bắt buộc. Không `eval` code từ nội dung hoặc chạy script không được kiểm soát. Tái sử dụng renderer đáng tin cậy của dự án; HTML/rich-text phải theo chính sách an toàn có sẵn.

### 5.4. Không tự biên soạn hoặc sửa ngầm

Tên bài chưa phải toàn văn. Không tự sinh 8 câu từ tên bài, không copy đề RSI cho MACD, không lấy nội dung legacy chưa được duyệt lại thay bản cuối. Giữ bài Chương 1–3 đã xác nhận; nếu chỉ có artifact riêng chưa ghép repo, ghi rõ phụ thuộc nội dung đó và để điểm ghép.

Khi nội dung cũ có câu dẫn thao tác tại Học viện, Bot V1/sau nở hoặc stop nền trái mô hình mới: rà và báo đúng đoạn cần cập nhật theo gói nội dung. Không đổi công thức chuyên môn hoặc kết quả ví dụ chỉ để khớp giao diện. Trong đợt khung không tự viết lại giáo trình.

---

## 6. Hoàn thành bài và lưu tiến độ

### 6.1. Ma trận hoàn thành

| Loại | Số bài | Quy tắc | Grant mới |
|---|---:|---|---|
| technical | 16 | 8 câu, đạt 8/8 | Chỉ báo tương ứng |
| fundamental | 42 | 8 câu, đạt 8/8 | Chỉ tiêu Bộ lọc tương ứng |
| concept: Hợp lưu | 1 | 8 câu, đạt 8/8 | Không có capability giao dịch mới |
| guide: Chương 2/4 | 12 | Hoàn thành bài học | Không có capability chỉ báo/chỉ tiêu mới |

59 bài cần kiểm tra không có nút xác nhận để bỏ qua kiểm tra. 12 bài hướng dẫn không có 8 câu, điểm đạt hoặc điều kiện dùng công cụ trước. Không biến bài Hợp lưu thành một chỉ báo thứ 17.

### 6.2. Bài kiểm tra — cơ chế, không tạo đề

Bộ khung phải nối service bắt đầu attempt, lấy đề đã được xuất bản, giữ lựa chọn trong attempt, nộp/chấm và nhận kết quả. Nếu service phù hợp đã có thì dùng lại; nếu thiếu thì triển khai phần tổng quát với fixture kiểm thử nội bộ. **Không phát hành fixture thành câu hỏi cho người dùng.**

Attempt gắn owner, lesson/content/assessment version, tập question ID và thứ tự/lựa chọn tương ứng. Server là nơi xác nhận đáp án và 8/8; client không được gửi điểm/pass/grant như nguồn chuẩn. Không để đáp án bí mật hoặc dữ liệu chấm trước nộp trong public catalog.

Trải nghiệm đề/kết quả (cách hiển thị câu đúng/sai, giải thích, đáp án sau nộp, thứ tự câu và phương án) **giữ theo gói nội dung của bài đã duyệt**. Khung không tự chuẩn hóa lại tất cả chương bằng một chính sách lộ/ẩn đáp án mới. Chưa có gói đề thì không có thao tác bắt đầu kiểm tra thật.

Rời bài rồi quay lại không tạo attempt giả đã đạt. Tái sử dụng quy tắc đang làm/khôi phục của hệ thống. Phiên bản đề thay đổi không được dùng đáp án mới để chấm attempt đã chụp bản cũ; giữ bản cố định hoặc thông báo cần bắt đầu lại theo contract thật, không chấm trộn.

7/8 chưa hoàn thành; 8/8 hoàn thành. Không thêm ngưỡng 80%, thời gian tối thiểu, yêu cầu giao dịch hoặc bài thi cuối chương. Retry nộp sau timeout trả lại đúng kết quả đã commit, không nhân điểm, tiến độ hoặc quyền.

### 6.3. Bài hướng dẫn — nút Hoàn thành

Nút **Hoàn thành bài học** nằm cuối bài khi nội dung hướng dẫn đã được ghép/xuất bản và người dùng có quyền đọc. Bấm là gửi xác nhận hoàn thành; không yêu cầu đọc đủ phút, cuộn tỷ lệ, mở ảnh, chạy Backtest, lưu filter/list, áp Bot hoặc làm giao dịch.

Sau server xác nhận, hiện **✓ Đã học** trong bài và sidebar, cập nhật đúng chương/toàn khóa. Bấm lại không tăng tiến độ. Nếu có ghi đang chờ thì dùng trạng thái đang lưu; lỗi giữ nguyên bản đã xác nhận, cho retry, không báo đã hoàn thành trước commit.

Nếu bài chưa có nội dung: không cho gọi hoàn thành. Nút disabled ở chế độ **Khung bài · Mẫu** chỉ để xem vị trí thiết kế; production không dùng control đó để cấp quyền cho placeholder.

### 6.4. Bảo toàn kết quả đã đạt

Hoàn thành là trạng thái bền vững của bài hợp lệ, không bị mất vì người dùng đọc lại, tắt chỉ báo, luyện lỗ, làm lại chưa đạt hoặc tải nội dung bị lỗi. Lượt làm lại giữ lịch sử riêng; tiến độ chỉ tính bài đó một lần.

Đổi bản nội dung do sửa hình/chữ không tự reset bài đã đạt hoặc thu hồi grant. Nếu nội dung thực sự thay đổi tới mức cần chính sách hoàn thành lại, đó là quyết định riêng chưa được đưa vào bản này; không để dev tự áp dụng.

### 6.5. Công thức tiến độ

```text
completed_in_catalog = tập bài riêng biệt có completion hợp lệ
                       và mapping đúng vào catalog hiện tại
chapter_done = số phần tử completed_in_catalog thuộc chương
course_done = số phần tử completed_in_catalog
course_total = 71
```

`course_done` không là tổng số attempt, số công tắc ON, số lượt luyện hoặc số trang đã xem. Hợp lưu/hướng dẫn vẫn tính một bài khi hoàn thành dù không grant chỉ báo. Bài legacy bị loại không tăng tử số mới; các lịch sử đó vẫn được giữ riêng.

Nếu catalog chưa tải đủ thì hiển thị loading, không lấy một trang API làm tổng toàn khóa. Khi server lỗi, không lưu `0/71` hoặc mảng rỗng đè lên dữ liệu cũ. Mỗi chương dùng số bài thực của nó, không mặc định sáu.

### 6.6. Hoàn thành và grant trong một luồng tin cậy

Xác minh attempt/acknowledgment → ghi completion duy nhất → tạo hoặc bảo đảm grant đúng binding → công bố progress/grant revision. Dùng transaction hoặc outbox có retry/đối soát trong backend, không ghép hai lần ghi client dễ bị lệch.

Nếu completion đã commit nhưng grant còn chờ sửa lỗi kỹ thuật: giữ Đã học, không bắt thi lại; báo đồng bộ năng lực khi mở công cụ và repair từ bằng chứng đã lưu. Không giả grant thành công hoặc nới điều kiện giao dịch. Học lại không là cách sửa lỗi cấp quyền.

Nội dung, grant và readiness công cụ cần được kiểm tra khi xuất bản bài mới. Có 42 tên chỉ tiêu không tự làm 42 công thức production sẵn sàng. Nếu binding/công cụ thiếu, nêu đúng phần tích hợp chờ; không tạo factor giả. Không đổi chính sách mở bài đã học thành cần học cả chương để né phần thiếu.

---

## 7. Liên kết với Bot, Chiến lược và phần phải giữ nguyên

### 7.1. Chỉ báo kỹ thuật

Hoàn thành RSI mở capability `rsi` trên cùng nguồn quyền cho Bot, Backtest và Cảnh báo. Người dùng chuyển sang Bot để chọn Luyện tập hoặc Cấu hình; **không có cổng bắt luyện**. Không copy params ví dụ trong bài hoặc bật master/buy/sell từ sự kiện đạt bài.

Bộ Bot đã sở hữu cấu hình Mua/Bán độc lập, lưu/hiệu lực và mini. Học viện không tạo config RSI thứ hai. Backtest đầy đủ và Bot tiếp tục nguyên tắc cấu hình chung của bộ đã chốt; mini có draft/snapshot riêng. Callback hoàn thành không được gọi lưu cấu hình, apply danh mục, tạo cảnh báo hoặc worker.

### 7.2. Chỉ tiêu cơ bản

Hoàn thành ROE mở chỉ tiêu tương ứng ở **Chiến lược → Bộ lọc**. Học viện không có ô chọn kỳ, dấu/ngưỡng lọc hay Mua/Bán cơ bản. Tên bài và tên chỉ tiêu khớp catalog; đơn vị/kỳ/công thức thuộc registry và bài nội dung tương ứng, không định nghĩa lại ở đợt khung.

Người dùng tự lọc, chọn mã và **Áp dụng cho Bot** ở luồng Bộ lọc/danh mục hợp lệ. Học xong không tự áp danh mục. Bot chưa dùng danh mục riêng vẫn xét mua trong VN30. Danh mục riêng thay thế nguồn mua mới; ngừng sử dụng quay về VN30. Vị thế ngoài nguồn mua mới vẫn xét Bán theo điều kiện, không bị bán vì đổi danh mục.

### 7.3. Những bất biến bộ Học viện không được sửa

| Thành phần | Ranh giới giữ từ bộ Bot mới |
|---|---|
| Demo Trading | Đặt lệnh thủ công thông thường; tài khoản mới vốn 100 triệu một lần; không chờ học, không reset số dư hiện hữu |
| Tài khoản Bot | Tách tiền khỏi tự giao dịch và mini; không tạo Bot/tài khoản theo chương |
| Săn mã | Đứng độc lập; giữ năm nhóm hiện có; không thành nguồn Bot bắt buộc |
| Theo dõi | Tích Săn mã đưa vào Danh mục theo dõi, không tạo lệnh hoặc thay danh mục mua Bot |
| Bot | Mua/Bán theo điều kiện hiệu lực; không cắt lỗ/chốt lời/thời gian giữ chạy ngầm |
| Nguồn mua Bot | VN30 hoặc snapshot danh mục được áp; toàn bộ vị thế vẫn xét Bán |
| Mini | Một chỉ báo, 30 lượt không lặp trong từng bộ, tùy chọn; kết quả 24 tháng; giữ tối đa mẫu 60 phiên chỉ ở mini |
| Vốn mini | 100% tiền khả dụng mỗi lần mua; vốn và kết quả không nhập tài khoản thật/mô phỏng vận hành |
| Cảnh báo | Tín hiệu theo bản cấu hình ghim, không giao dịch Bot |
| Backtest đầy đủ | Giữ phạm vi/mô hình của bộ Chiến lược; không áp trần 30 lượt, thời gian 24 tháng/60 phiên của mini |

Các bài/chương về stop, trailing, tương quan… đã loại khỏi danh mục không xuất hiện như năng lực sẽ tự bật. Không triển khai lại các luật tài chính trong bảng bằng bộ Học viện; chỉ kiểm tra không hồi quy.

---

## 8. Hợp đồng dữ liệu và API logic

### 8.1. Các dữ liệu cần phân biệt

| Đối tượng | Trường logic tối thiểu |
|---|---|
| Catalog | version, chapter ID/order/title, lesson ID/order/title/type, completion mode, binding capability |
| Content manifest | lesson key, status, content version, section/block/asset references, assessment reference nếu có |
| Reading state | lesson key, section/scroll, chương mở, vị trí panel; không là bằng chứng hoàn thành |
| Attempt | owner, attempt ID, lesson key, content/assessment version, question/option identities, câu trả lời, trạng thái và kết quả server |
| Completion | owner, lesson key, method, evidence/attempt ID hoặc acknowledgment, completed_at, revision |
| Grant | owner, capability ID/type, source lesson/evidence, grant revision/status; không có tham số giao dịch |
| Progress response | catalog version, completed lesson keys, số bài/chương, revision, trạng thái tải/đồng bộ |

ID/route dưới đây là minh họa logic; không bắt tạo API mới nếu service đang có đáp ứng. Dùng namespace catalog nhất quán giữa các bộ, không tạo hai nguồn progress theo trang.

### 8.2. Các thao tác cần nối

| Thao tác | Điều kiểm tra và đầu ra |
|---|---|
| Đọc catalog | Đúng version và toàn bộ 13/71; không viết config/grant/tiền |
| Đọc nội dung bài | Quyền đọc, lesson/content version; published/not_published/loading/error tách biệt |
| Đọc progress/grants | Owner từ session; không nhận user khác từ client; nhất quán revision |
| Lưu view state | Chỉ vị trí đọc; không ghi completed/pass |
| Bắt đầu/tiếp tục attempt | Bài loại quiz, đề thật sẵn sàng, owner; pin version và câu/phương án đúng |
| Ghi/nộp câu trả lời | Kiểm tra question/option của attempt; chấm server, chống nộp trùng; không tin client score |
| Hoàn thành hướng dẫn | Bài loại guide và nội dung đã ghép; owner; ghi duy nhất, không grant chỉ báo |
| Đồng bộ năng lực | Từ completion hợp lệ, bảo đảm grant đúng ID; không kích hoạt config |

Ví dụ acknowledgment (không gửi `passed: true`):

```json
{
  "catalog_version": "iqx-academy-outline-13ch-71lessons-v1",
  "lesson_id": "ch02-l01",
  "content_version": "<bản được server cấp khi đọc>",
  "request_id": "<khóa chống gửi lặp>"
}
```

Bài RSI gửi qua thao tác này phải bị từ chối, không được tự đổi mode thành guide. Với quiz, gửi `attempt_id` và lựa chọn theo ID do server cấp; không gửi đáp án hoặc các capability muốn nhận.

Response thành công phải phản ánh trạng thái đã commit, ví dụ `completed`, `completion_method`, `completed_at`, `progress_revision`, `grants_revision`. Nếu grant còn xử lý, trả trạng thái thật; không hiển thị đã sẵn sàng ở Bot khi chưa nhận quyền.

### 8.3. Bảo mật, đồng thời và lỗi

Owner được xác định từ đăng nhập. Mọi endpoint kiểm tra quyền và version; client localStorage, biến `scenario`, tên file hay DOM không là quyền thật. Không cho người A đọc/chấm attempt hoặc completion của B. Không trả đáp án chưa được phép qua source map/API đề.

Chống trùng theo khóa bài/owner với completion và theo attempt/request đối với nộp. Hai thiết bị hoàn thành cùng một bài chỉ tăng tiến độ một. Attempt cũ có score thấp không ghi đè completion đã đạt. View state có thể đồng bộ nhẹ; không để bản cache cũ xóa progress mới.

Loại response tải chậm của bài A sau khi đã mở bài B. Cache tách owner/catalog/content/assessment version; không dùng dữ liệu tiến độ tài khoản trước sau đăng xuất. Không cache public payload có thông tin riêng/đáp án.

Lỗi mạng/timeout/expired attempt/invalid answer/version conflict/forbidden/not_published phải tách biệt. Retry khôi phục kết quả đã commit; không tạo thêm grant/attempt vô hạn. Thông báo chỉ báo đúng phần cần xử lý, không đổi dữ liệu để tránh hiển thị lỗi.

### 8.4. Danh mục 42 chỉ tiêu không là đặc tả công thức

Bộ Học viện chỉ ghi tên, loại và điểm mở. Công thức/tử số/mẫu số/kỳ/chính sách dữ liệu phải khớp nguồn đã duyệt trong đợt nội dung/Bộ lọc. Không tự suy ra công thức cho các mục Stability/Yield hoặc tạo kỳ mặc định từ tên tiếng Anh. Một binding chưa rõ cần xác minh ở repository/gói tương ứng; không ngầm map theo thứ tự.

---

## 9. Chuyển đổi dữ liệu và bảo toàn nội dung

### 9.1. Trước khi ghi dữ liệu

Xác định commit/build đang chạy; nguồn catalog/progress/quiz/grants, phiên bản bài đã có, router và nguồn config. Kiểm tra bộ Bot mới đã được tích hợp tới đâu. Không nhân đôi lifecycle/grants service vì repository mới chỉ làm một phần.

Lập bảng mapping theo capability/nội dung thật và catalog version. Bảng 16 chỉ báo và các nhóm đổi chương có tại Phụ lục B. Giữ ID thật ổn định nếu có, thêm mapping thay vì rename mù.

### 9.2. Những trường hợp bắt buộc

- `ch07-l01` cũ là ATR, mới là OBV: **không cấp OBV từ kết quả ATR**.
- Stochastic/CCI đổi số bài trong Chương 5: giữ đúng nội dung/grant cũ, không lấy ADX cấp Stochastic.
- Chương 9 mới là Định giá, không kế thừa các completion Cấu trúc giá cũ cùng số.
- Chương 10 mới là Donchian/ROC/Williams, không lấy bài P/E/P/B/P/S cũ cùng ID.
- Chương 2 cũ 18 bài sang 6 bài đã duyệt và Chương 4 cũ 10 sang 6: không tự coi một vị trí tương đương; giữ bằng chứng đúng bộ nội dung.
- Chương 12/14/15 cơ bản cũ đổi thành 11/12/13: map từng bài tương ứng, không reset khi đổi số.
- Bài bị loại: giữ lịch sử legacy có version; không hiện trong 71 và không cấp quyền thay thế.

### 9.3. Không phá trạng thái tài khoản

Không reset tiền, cấp vốn lần nữa, đổi linh thú, xóa vị thế/lệnh/cổ tức chờ/nhật ký, tắt toàn bộ cấu hình hợp lệ hoặc bật toàn bộ do scenario mẫu. Grant mâu thuẫn hoặc không đủ bằng chứng phải được báo và đối soát; không tiện tay bỏ một phần cấu hình đang dùng rồi tự cho Bot chạy.

Bỏ ràng buộc trứng là yêu cầu của nền mới. Nếu repo còn cổng `graduated_at`, cập nhật đúng chỗ truy cập Học viện và phối hợp bộ Bot; không giả đánh dấu mọi tài khoản đã nở để vượt guard. Không chạy worker cũ, stop L1 hoặc nguồn Săn mã của Bot trong lúc sửa màn học.

Dùng backup/dry-run và đối chiếu số completion/attempt/grant trước-sau, cùng các bảng không được thay. Rollback giữ bằng chứng và không tự phục hồi gate trứng/cấu hình Học viện/luật Bot cũ như tác dụng phụ.

---

## 10. Phối hợp với các gói bài học ghép sau

| Gói | Yêu cầu giữ/chuẩn bị |
|---|---|
| Chương 1 | 6 bài gồm 5 chỉ báo + Hợp lưu; giữ toàn văn/chart/quiz đã duyệt; không biến Hợp lưu thành chỉ báo mới |
| Chương 2 | 6 bài hướng dẫn Backtest; nút Hoàn thành, không thi; ảnh được rà theo giao diện Backtest cuối cùng |
| Chương 3 | 6 chỉ tiêu nền tảng; 8/8 mở từng chỉ tiêu; giữ nhãn Tăng trưởng LNST YoY đơn giản |
| Chương 4 | 6 bài; bài cuối Lưu và áp dụng danh mục cho Bot, có quay về VN30; nội dung chi tiết ghép riêng |
| Chương còn lại | Đúng metadata/binding/loại hoàn thành; chỉ xuất bản khi gói và service tương ứng hợp lệ |

Không lấy `sections: []` trong bộ này ghi đè một bài published. Import khung chỉ upsert metadata thuộc quyền quản lý của catalog; không đặt lại `content_version`, `assessment`, completion, grant hoặc blob nội dung về null nếu đã có bản đúng. Không giữ hai bản chương khác nhau cạnh nhau chỉ để tránh mapping.

Khi nhận bộ nội dung sau: đối chiếu lesson key → version → section/asset/assessment → kiểm tra resource → nối completion mode → kiểm thử quyền và hình thức. Không tự dịch/đổi công thức, làm mất bảng hoặc gán bài vào ID mới trùng vị trí nhưng khác nội dung.

---

## 11. HTML bàn giao và giới hạn sử dụng

### 11.1. Nguồn hình thức và nhận diện

HTML được dựng từ **bản Bot v4 đã duyệt, bản bàn giao tên `IQX-Bo-Bot-MAU-v1.0.html`**. Giữ shell, màu, rail, linh thú, danh mục 13/71 và ngữ cảnh Bot; bổ sung lớp Học viện và mở Học viện trước. Không khẳng định là bản sao nguyên byte: phần Học viện, trạng thái và footer xem thử đã được bổ sung.

- SHA-256 nguồn Bot: `ca3fb11834939db45eb3cdf2b679fbf775ae298d7d540943a8d82669b4703b47`.
- `catalogData` và `mascotAsset` được đối chiếu giữ nguyên so với nguồn Bot.
- Nhận diện HTML bàn giao và kiểm tra thực tế ở mục 13, được điền sau khi tạo file.

### 11.2. Các thao tác xem thử Học viện

| Control trong thanh dưới | Công dụng trong HTML | Không đưa vào production |
|---|---|---|
| Chưa học / Đã học RSI / Đã học Chương 1 & 3 / Đã học toàn bộ | Xem 0/71, 1/71, 12/71, 71/71 và trạng thái đã học/mở quyền giả | Không có quyền đổi progress bằng selector |
| Tên bài · Mẫu | Mở tên/chương, trạng thái nội dung chưa ghép | Không biến placeholder thành nội dung được xuất bản |
| Khung bài · Mẫu | Xem vị trí phần, công thức, bảng, chart/ảnh và cuối bài | Ô xám không phải chart/văn bản thật; nút cuối bị khóa |
| Đang tải bài / Lỗi tải bài / Lỗi tiến độ · Mẫu | Xem loading/lỗi/Thử lại không làm mất tiến độ đã xác nhận | Không dùng timer làm nguồn thành công API |
| Làm mới panel | Minh họa tải lại vùng Học viện | Không gọi Bot worker hoặc cấp vốn |
| Thông tin mẫu / Đặt lại mẫu Học viện | Xem phạm vi hoặc đặt lại view/tiến độ giả của file | Không là chức năng reset tài khoản hoặc reset bài học production |

Không có đề, đáp án hoặc toàn văn trong HTML. **Ở chế độ Tên bài, bài chưa ghép không có nút hoàn thành. Ở chế độ Khung bài, nút hoàn thành/kiểm tra chỉ được vẽ disabled để duyệt vị trí.** Không có đường bấm giả để pass từng bài. Tiến độ đã học trong các scenario là fixture, không phải kết quả của bài không có nội dung.

Học viện mẫu mặc định Chưa học và Chương 1 mở; dùng cùng shell Bot. Không nhận dữ liệu local của file Bot trước làm tiến độ mới.

### 11.3. Các phần Bot giữ để kiểm tra điều hướng

Trong HTML vẫn có các luồng Bot/cấu hình/luyện tập, Đặt lệnh, Danh mục, Săn mã và danh mục Bộ lọc mẫu kế thừa để người duyệt thử điểm nối. Chúng **không mở rộng phạm vi triển khai Học viện** và không thay giao phẩm Bot đã bàn giao. Không lấy engine/giao dịch/báo giá/scheduler mẫu hoặc các phép tính đó làm backend production.

Khi chuyển khỏi Học viện, footer Bot mẫu có thể xuất hiện cùng các control vốn có. Toàn bộ control xem thử đều phải bỏ khỏi giao diện thật. Giữ route/component thật của các công cụ; không thay chức năng đang hoạt động bằng modal “ngoài phạm vi”.

### 11.4. Các điểm tìm trong mã HTML

| Phần | Điểm tìm |
|---|---|
| Catalog chuẩn | `script#catalogData`, `CATALOG`, `LESSONS` |
| Contract khung | `script#academyContractData`, `completionMode`, `ACADEMY_EMPTY_CONTENT` |
| Hình và shell | `script#mascotAsset`, `.shell`, `.panel`, `.rail`, các media query |
| Sidebar | `academyPanel`, lớp Học viện của `renderPanel` |
| Màn đọc/trạng thái | `readerHeader`, `renderLessonPlaceholder`, `renderReaderSlots` |
| Ô nội dung tham chiếu | `slotBlock`, `.slot-section`; không chứa dữ liệu bài |
| Ngữ cảnh/scroll | `rememberAcademyView`, `saveAcademyView`, `openLesson`, lớp Học viện của `go` |
| Loading/Thử lại | `refreshAcademy`; timer là mock |
| Ngăn giả hoàn thành | `ACADEMY_EMPTY_CONTENT`, các nút cuối bài disabled, không handler pass |
| Mock tiến độ | `completedIds`, `academyDone`, hai selector scenario |
| Kho local riêng | `iqx.preview.academy.13ch71.bot-context.v1`, `iqx.preview.academy.13ch71.shell.v1.view` |
| Hook kiểm tra local | `IQX_ACADEMY_PREVIEW`, `IQX_BOT_PREVIEW` |

HTML là file độc lập tự chứa CSS, JS, JSON metadata và asset. Không yêu cầu tải font hoặc thư viện từ ngoài để xem. LocalStorage có try/catch, bị chặn thì báo chưa lưu được; không được gọi bộ nhớ của tab là lưu server hoặc đồng bộ tài khoản.

---

## 12. Ca nghiệm thu yêu cầu AI dev thực hiện

Các ca bên dưới là **yêu cầu nghiệm thu repository/môi trường thật**, không phải tuyên bố đã đạt production. Có thể dùng fixture kỹ thuật trong thư mục test để kiểm tra grader/renderer; không xuất bản chúng thành giáo trình hoặc cấp quyền giả cho người dùng. Mỗi ca cần input, expected/actual, câu lệnh, file/hàm và môi trường đã chạy.

### Giao diện và điều hướng

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| N01 | Tài khoản mới chưa có dữ liệu Hành trình | Mở Học viện | Mở ngay panel và linh thú theo khung mới; không yêu cầu nở, không tự grant. |
| N02 | Workspace đang dùng bộ Bot mới | Bấm Học viện trên rail | Đúng panel phải và 13/71; không dựng trang hoặc sidebar trái mới. |
| N03 | Lần đầu mở, chưa có view state | Quan sát chương | Chỉ Chương 1 mở mặc định; không có trạng thái hoàn thành giả. |
| N04 | Đã mở nhiều chương | Thu hết, làm mới progress | Giữ trạng thái thu hết; không ép mở lại Chương 1. |
| N05 | Đang cuộn panel và nội dung trái | Đổi bài/làm mới tiến độ | Giữ đúng scroll độc lập; đổi bài không kéo mất panel hoặc ghi completion. |
| N06 | Đang xem bài bất kỳ | Về linh thú rồi mở lại bài | Trở về đúng vùng, giữ chương/tiến độ; không phát animation nở. |
| N07 | Bot chỉ báo OBV chưa có quyền | Bấm Xem bài | Mở ch07-l01 của catalog mới, không ATR legacy. |
| N08 | Điện thoại 360/390 px và tablet | Mở Học viện, chọn bài, mở lại panel | Panel trượt cạnh rail phải, đọc/thao tác được, không tràn ngang toàn trang. |
| N09 | Người dùng bàn phím/Reduced Motion | Tab, mở chương, đọc/quay lại | Focus có nghĩa, chương/bài có trạng thái truy cập; panel ẩn không nhận focus. |
| N10 | URL Hành trình/Bài học cũ có tham số | Mở link/reload | Router tương thích khung mới, không cấp vốn/phát nở hoặc mất bài do redirect sai. |

### Catalog, tiến độ và trạng thái

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C01 | Catalog đầy đủ | Đọc UI/API | Đúng 13 chương và 71 bài như Phụ lục A; tên/thứ tự/ID cùng version. |
| C02 | Tất cả loại bài | Đếm theo catalog | 16 kỹ thuật +42 cơ bản +12 hướng dẫn +1 Hợp lưu; 59 quiz và12 acknowledge. |
| C03 | Chương 5/7/10 | Tính progress | Mẫu số lần lượt5/3/3, không tự thêm bài hoặc dùng6. |
| C04 | Sidebar mọi loại bài | Kiểm tra controls | Chỉ Xem bài và Đã học; không Cấu hình, Luyện tập hoặc switch. |
| C05 | Catalog chứa các mục legacy đã bỏ | Chuyển sang bản13/71 | Không hiện ATR/ADX/chương hệ thống cũ như bài khóa sẽ mở; lịch sử không xóa. |
| C06 | Một bài xem nhiều lần, quiz chưa đạt | Tính tiến độ | Không tăng; viewed không là completed. |
| C07 | Bài đã đạt, làm lại hoặc luyện nhiều lượt | Tính lại progress | Mỗi bài một lần; 30 lượt mini không cộng vào71. |
| C08 | Progress API đang tải | Render rồi trả dữ liệu thật | Hiện loading/—, không ghi0/71 đè dữ liệu. |
| C09 | Đã có progress, request refresh lỗi | Thử lại | Giữ bản xác nhận, báo lỗi đúng; không reset quyền hoặc các công tắc. |
| C10 | Bài đã học nhưng content service lỗi | Mở bài | Đã học vẫn còn; không mất grant hoặc yêu cầu học lại để sửa lỗi tải. |

### Renderer và nội dung

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| R01 | Bài catalog chưa xuất bản | Xem bài | Đúng tên/chương và trạng thái chờ; không có hoàn thành/thi hoạt động. |
| R02 | Chương1–3 đã có gói được duyệt | Tích hợp khung | Giữ toàn văn/chart/ảnh/quiz, không placeholder ghi đè. |
| R03 | Gói có nhiều section/block khác nhau | Render | Thứ tự/tiêu đề theo gói, không ép bốn ô mẫu thay toàn bộ bài. |
| R04 | Công thức có < > ∈ ∉ và chỉ số | Render desktop/mobile | Ký hiệu đúng, không bị HTML cắt hoặc thực thi script. |
| R05 | Câu hỏi có bảng/hình | Mở attempt hợp lệ | Tài nguyên đúng câu và version; không bỏ ảnh khi chuyển backend. |
| R06 | Ảnh hướng dẫn bài công cụ | Phóng to và đóng | Giữ tỷ lệ, nhìn rõ, trả focus; không chèn lời chú thích nguồn HTML bị bỏ. |
| R07 | Bài MACD/Bollinger có nhiều series | Ghép chart của bài | Đúng chart/data/series; không thay đường RSI hoặc hình chung. |
| R08 | Request bài A chậm hơn bài B | Chọn A rồi B nhanh | Response A không ghi đè title/body/assessment B. |
| R09 | Một asset bắt buộc lỗi tải | Mở bài/Thử lại | Báo lỗi tài nguyên, không xóa block hoặc giả đầy đủ; không đổi progress. |
| R10 | Khung HTML chế độ Tên bài/Khung bài | Quan sát cuối bài | Không giáo trình/đáp án giả; nút trong khung chỉ disabled và không handler pass. |

### Kiểm tra 8/8

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| Q01 | RSI có nội dung/đề đã xuất bản | Bắt đầu kiểm tra | Đúng8 câu, đúng lesson/content/assessment version, owner và đề thật. |
| Q02 | Attempt hợp lệ đạt7/8, chưa từng hoàn thành | Nộp | Chưa hoàn thành và không grant; không dùng ngưỡng80%. |
| Q03 | Attempt hợp lệ đạt8/8 | Nộp | Một completion và grant rsi; UI Đã học, không config ON/giao dịch. |
| Q04 | ROE đạt8/8 | Nộp | Chỉ grant chỉ tiêu ROE, không thêm Mua/Bán cơ bản hoặc áp danh mục. |
| Q05 | Hợp lưu đạt8/8 | Nộp | Tăng một bài, không capability mới hoặc mini Hợp lưu. |
| Q06 | Client gửi score/pass hoặc grant tự khai | Gọi endpoint nộp | Server bỏ/từ chối trường trái contract, tự chấm theo attempt; không cấp theo payload. |
| Q07 | Bài chưa có đề | Bắt đầu hoặc gọi API trực tiếp | Không thi giả, không fallback đề khác và không grant. |
| Q08 | Cùng request nộp đã commit nhưng timeout | Retry hoặc double click | Trả cùng kết quả, không completion/grant/điểm trùng. |
| Q09 | Hai thiết bị nộp cùng bài có attempt hợp lệ | Nộp đồng thời | Lịch sử từng attempt giữ, completion và progress chỉ một bài. |
| Q10 | Đã đạt bài, lượt làm lại thấp điểm | Nộp rồi reload | Giữ completion/grant đã xác nhận; không reset cấu hình. |
| Q11 | Assessment cập nhật khi attempt cũ đang làm | Tiếp tục/nộp | Chấm đúng version đã pin hoặc xử lý restart minh bạch; không dùng key mới chấm đề cũ. |
| Q12 | Gói bài có contract kết quả/đáp án riêng | Hiển thị sau nộp | Giữ đúng gói đã duyệt; khung không tự đổi quy tắc hiển thị giải thích/đáp án. |

### Hoàn thành bài hướng dẫn

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| A01 | Bài Chương2 đã ghép, chưa hoàn thành | Bấm Hoàn thành bài học | Ghi completion acknowledge, tăng một bài, không quiz/grant chỉ báo. |
| A02 | Bài Chương4 đã ghép | Hoàn thành khi chưa lọc/lưu/apply | Vẫn hoàn thành; không bắt thao tác công cụ, không tự áp danh mục. |
| A03 | Bài hướng dẫn chưa có nội dung | Gọi acknowledgment trực tiếp | Từ chối chưa sẵn sàng; không pass placeholder. |
| A04 | Bài kỹ thuật/cơ bản loại quiz | Gửi acknowledgment | Từ chối sai mode, không cho bỏ qua8/8. |
| A05 | Đã hoàn thành hướng dẫn | Bấm lại, reload hoặc thiết bị khác | Vẫn một completion, số bài không tăng lại. |
| A06 | Request hoàn thành thất bại/chưa commit | Quan sát UI rồi retry | Chưa hiển thị đã học giả; không mất dữ liệu cũ; retry idempotent. |

### Grant và ranh giới công cụ

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| G01 | Một bài kỹ thuật vừa đạt | Mở Bot/Backtest/Cảnh báo | Cùng capability được mở; không ba nguồn tiến độ riêng. |
| G02 | Học xong nhưng chưa luyện | Mở cấu hình Bot | Được cấu hình ngay theo quyền; không kiểm tra số mini. |
| G03 | Tham số ví dụ có sẵn, master OFF | Hoàn thành bài | Giữ toàn bộ config và revision; không auto-enable. |
| G04 | ROE vừa đạt, Bot nguồnVN30 | Mở Bộ lọc | ROE mở; Bot vẫnVN30 tới thao tác apply chủ động. |
| G05 | Bài hướng dẫn Apply Bot hoàn thành | Quan sát account/universe | Không tự lọc, apply, mua hoặc bán vì hoàn thành. |
| G06 | User chưa học bài nào | Đặt lệnh/Săn mã/Theo dõi | Vẫn dùng theo guard thật; không thêm yêu cầu học. |
| G07 | Mini 30 lượt/giữ60 phiên | Chuyển qua Học viện hoặc Bot | Mini không tăng tiến độ học;60 phiên không thành luật thoát Bot. |
| G08 | Completion đã commit, grant queue lỗi | Mở công cụ/repair | Giữ Đã học; báo grant đang chờ, repair theo evidence, không bắt thi lại hoặc giả quyền. |
| G09 | Một binding cơ bản chưa có engine/định nghĩa | Chuẩn bị bài/công cụ | Báo đúng phần chưa sẵn sàng; không tạo công thức/ID suy đoán hoặc cấp toàn bộ42. |
| G10 | Bot có custom universe và vị thế ngoài rổ mua | Đọc/hoàn thành bài, chuyển rail | Không đổi nguồn/vị thế; các vị thế vẫn theo luật Bán hiện hành, không stop cũ. |

### Migration và bảo toàn

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| M01 | Legacy ch07-l01=ATR | Map sang catalog mới | Không grant OBV ch07-l01; giữ lịch sử ATR legacy. |
| M02 | Legacy Stochastic/CCI đổi số bài | Map progress | Đúng capability, không ADX→Stochastic hoặc reset bài hợp lệ. |
| M03 | Các chương định giá/dài hạn/ổn định/cổ đông đổi số | Map và tính71 | Tên/nội dung tương ứng đúng, không cấp nhầm cùng index. |
| M04 | Chương2 cũ18/Chương4 cũ10 bài | Chuyển6 bài mới | Chỉ map có bằng chứng nội dung, không copy pass theo vị trí. |
| M05 | Catalog seed chỉ metadata, nội dung1–3 có sẵn | Chạy migration | Không ghi null/empty vào content/assessment/asset đã xuất bản. |
| M06 | Tài khoản có tiền/lệnh/vị thế/cổ tức/quyền | Triển khai Học viện | Số dư và lịch sử giữ; không cấp thêm100 triệu hoặc tạo Bot thứ hai. |
| M07 | Grant/config cũ không map an toàn | Đối soát | Giữ bằng chứng, báo ngoại lệ; không bỏ condition rồi Bot tự chạy phần còn lại. |
| M08 | Rollback/migration retry | Chạy lại | Không nhân completion/grant, không khôi phục trứng/stop/cấu hình tại Học viện ngầm. |

### Bảo mật, lưu trữ và bàn giao

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| S01 | UserB có ID attempt/completion củaA | Gọi API | Bị từ chối, không lộ câu trả lời/tiến độ riêng. |
| S02 | Client sửa localStorage/scenario/DOM | Gửi hoàn thành hoặc mở tool | Server không tin, không cấp quyền/vốn/giao dịch. |
| S03 | Khác owner/content/assessment version | Cache và tải đề/tiến độ | Key đúng, không rò dữ liệu user trước/đáp án. |
| S04 | Nội dung/tên chứa script hoặc ký tự đặc biệt | Import/render | Sanitize/escape đúng, không script ngoài whitelist, ký hiệu được giữ. |
| S05 | Storage trình duyệt không dùng được | Mở mẫu hoặc app | Fallback xem được, báo lưu lỗi; không coi memory là server persistence. |
| S06 | Đăng xuất/đăng nhập tài khoản khác | Mở lại Học viện | Nguồn quyền đúng tài khoản mới, không dùng cache cũ cấp quyền. |
| S07 | Hai bộ Bot/Học viện cùng tích hợp | Kiểm tra service/router | Một catalog/progress/grants source, không seed lặp hoặc thêm engine giao dịch mới. |
| S08 | Chỉ smoke test HTML đã chạy | Báo cáo nghiệm thu | Tách mock/UI/unit/integration/production; không gọi giáo trình71 bài hoặc backend đã hoàn tất. |

**Tổng: 74 ca nghiệm thu tích hợp.** Không dùng kết quả kiểm tra mock để tự đánh dấu các ca production là đã đạt.

---

## 13. Kiểm tra file mẫu của lần bàn giao này

- HTML: `IQX-Bo-Hoc-Vien-MAU-v1.0.html`.
- Kích thước: **283,293 byte**.
- SHA-256: `fac092943f80b7e774e0d945a87e6d6db96c5e85596b60275c2c4872ca245a31`.
- Catalog đối chiếu nguyên cấu trúc với HTML Bot: **13 chương / 71 bài; 16 kỹ thuật, 42 cơ bản, 12 hướng dẫn, 1 Hợp lưu**. Asset linh thú được giữ nguyên.
- JavaScript kiểm tra cú pháp bằng `node --check`.
- Đã chạy **151/151 kiểm tra cục bộ** bằng Chromium/Playwright: catalog, mở đúng từng bài trong 71 ID, không có control cấu hình tại sidebar Học viện, bốn trạng thái tiến độ mẫu, khung nội dung/hoàn thành bị khóa, loading/lỗi/Thử lại, giữ progress khi đọc, chuyển Học viện–Bot, Săn mã/Theo dõi và một lượt RSI kế thừa không làm tăng tiến độ học.
- Kiểm tra kích thước **1752, 1440, 1024, 870, 600, 390, 360 px**: không tràn ngang toàn trang, rail giữ, mobile đóng panel khi chọn bài. Đã xem ảnh render desktop và mobile; ảnh chụp sau khi kết thúc transition của panel.
- Các file nguồn Bot và gói bài Chương 1–3 không bị chỉnh trong lần tạo bộ này.

**Giới hạn bằng chứng:** môi trường Chromium chặn điều hướng `file://` bằng chính sách quản trị, nên test dùng `page.set_content` nạp HTML trực tiếp. Trong chế độ đó trình duyệt không cấp localStorage; đã kiểm tra đường fallback và cảnh báo chưa lưu. **Chưa xác nhận persistence qua reload file ở một origin thật, đồng bộ thiết bị, server progress/grants, grader, database hoặc integration IQX.** 151 check cục bộ chủ yếu kiểm tra giao diện/điều hướng và fixture; không thay 74 ca nghiệm thu tích hợp ở mục12 và không chứng nhận thuật toán 16 chỉ báo production.


Các kiểm tra cục bộ không thay test xác thực, database, grader, outbox, migration, worker hoặc nguồn dữ liệu IQX. File không truy cập tài khoản thật hoặc repository production.

---

## 14. Trình tự triển khai và định nghĩa hoàn thành

### 14.1. Trình tự

1. Tìm đúng repo/build và service đang chạy. Lập ma trận giữ/sửa/bổ sung theo mục0, xác định dữ liệu học đã có và trạng thái bộ Bot mới.
2. Nâng cấp catalog 13/71 bằng mapping an toàn; loại cổng trứng trên truy cập Học viện, không tạo nguồn progress thứ hai.
3. Tích hợp panel chỉ Xem bài/Đã học và renderer vùng trái; giữ rail/linh thú, loading/error, mobile, scroll và route.
4. Nối nội dung đã có đúng phiên bản; chuẩn bị manifest cho phần chờ ghép; bảo toàn chart/ảnh/đề đã được duyệt.
5. Nối/tạo cơ chế tổng quát quiz 8/8 và acknowledgment hướng dẫn; completion/grant server, kiểm soát đồng thời và retry. Không tạo đề cho đủ nút.
6. Đồng bộ capability tới Bot/Backtest/Cảnh báo/Bộ lọc mà không kích hoạt config hoặc giao dịch.
7. Dry-run migration, backup/đối chiếu, kiểm thử theo mục12 và UI nhiều viewport; tách mock với tích hợp thật.
8. Bàn giao code/migration/test và báo cáo kết quả. Chỉ deploy trong môi trường và phạm vi đã được cấp quyền.

### 14.2. Phụ thuộc cần xác minh, không tự điền

Catalog/grants/quiz/read service thật; chính sách tài khoản/gói; phiên bản nội dung đã duyệt; cách giữ attempt và trả kết quả; các factor binding chưa có định nghĩa; quy trình xuất bản nội dung và renderer asset thật. Nếu repo hỗ trợ thì tự tìm và triển khai, không yêu cầu chủ sản phẩm chỉ file/hàm mà AI dev có thể truy xuất. Nếu thật sự thiếu, báo đúng bài/capability/service/phiên bản, không đổi nghiệp vụ để né phần thiếu.

### 14.3. Định nghĩa hoàn thành khung

Đủ khi panel và màn đọc chạy trên workspace IQX, có đúng catalog và nguồn tiến độ, phân biệt nội dung/chấm/hoàn thành/grant, giữ các bài có thật, không giả pass bài trống, không điều khiển Bot trong Học viện, hai loại hoàn thành đúng và các thay đổi không làm sai luật/tài khoản công cụ. Các nội dung chưa được bàn giao được nhận diện là chờ ghép — đó không phải lỗi cần AI tự điền, cũng không được báo đã hoàn tất giáo trình.

Báo cáo cần nêu commit, component/service/bảng đã sửa, mapping và số liệu bảo toàn, kết quả từng nhóm test, phần chưa chạy/bị chặn và nguồn cần bổ sung. Không báo hoàn thành chỉ bằng screenshot, một selector 71/71 hoặc số lượng dòng catalog.

---

# Phụ lục A — Toàn bộ danh mục 13 chương / 71 bài

Dữ liệu được lấy đúng từ `catalogData` của bản Bot đã duyệt. Cột Loại/Quyền trong spec dành cho dev, **không thêm chúng làm badge mới lên sidebar**. Mọi dòng trên UI chỉ Xem bài và ✓ Đã học nếu có. Tất cả kiểu guide là Hoàn thành bằng nút; các kiểu còn lại là kiểm tra 8/8.

## A01. Chương 1 — Chỉ báo kỹ thuật nền tảng (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch01-l01` | RSI | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `rsi` |
| `ch01-l02` | MACD | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `macd` |
| `ch01-l03` | MA / SMA | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `ma` |
| `ch01-l04` | Bollinger Bands | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `bollinger` |
| `ch01-l05` | Khối lượng | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `volume` |
| `ch01-l06` | Hợp lưu | Hợp lưu · kiểm tra8/8 | Không cấp chỉ báo/chỉ tiêu mới |

## A02. Chương 2 — Sử dụng Backtest (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch02-l01` | Bắt đầu với Backtest | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch02-l02` | Thiết lập điều kiện Mua | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch02-l03` | Thiết lập điều kiện Bán | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch02-l04` | Chọn giả định và chạy kiểm thử | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch02-l05` | Đọc kết quả và lịch sử giao dịch | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch02-l06` | Điều chỉnh, so sánh và lưu kết quả | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |

## A03. Chương 3 — Phân tích cơ bản nền tảng (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch03-l01` | Tăng trưởng doanh thu YoY | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch03-l02` | Tăng trưởng LNST YoY | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch03-l03` | Tăng trưởng EPS YoY | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch03-l04` | Biên lợi nhuận gộp | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch03-l05` | Biên lợi nhuận ròng | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch03-l06` | ROE | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |

## A04. Chương 4 — Sử dụng Bộ lọc (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch04-l01` | Bắt đầu với Bộ lọc | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch04-l02` | Thiết lập điều kiện lọc | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch04-l03` | Chọn kỳ tính cho từng chỉ tiêu | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch04-l04` | Đọc và kiểm tra kết quả | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch04-l05` | Điều chỉnh và lưu bộ lọc | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |
| `ch04-l06` | Lưu và áp dụng danh mục cho Bot | Hướng dẫn · xác nhận | Không cấp chỉ báo/chỉ tiêu mới |

## A05. Chương 5 — Xu hướng và động lượng nâng cao (5 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch05-l01` | EMA | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `ema` |
| `ch05-l02` | MA Cross | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `ma_cross` |
| `ch05-l03` | DMI | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `dmi` |
| `ch05-l04` | Stochastic | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `stochastic` |
| `ch05-l05` | CCI | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `cci` |

## A06. Chương 6 — Sức khỏe tài chính doanh nghiệp (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch06-l01` | ROA | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch06-l02` | ROIC | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch06-l03` | D/E — Nợ vay / Vốn chủ sở hữu | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch06-l04` | Net Debt / EBITDA | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch06-l05` | Current Ratio | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch06-l06` | Interest Coverage | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |

## A07. Chương 7 — Khối lượng và dòng tiền (3 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch07-l01` | OBV | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `obv` |
| `ch07-l02` | MFI | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `mfi` |
| `ch07-l03` | Chaikin Money Flow — CMF | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `cmf` |

## A08. Chương 8 — Chất lượng dòng tiền doanh nghiệp (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch08-l01` | CFO Margin | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch08-l02` | CFO / LNST | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch08-l03` | FCF Margin | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch08-l04` | FCF Growth YoY | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch08-l05` | Capex / Revenue | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch08-l06` | Accrual Ratio | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |

## A09. Chương 9 — Định giá doanh nghiệp (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch09-l01` | P/E | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch09-l02` | P/B | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch09-l03` | P/S | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch09-l04` | EV / EBITDA | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch09-l05` | PEG | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch09-l06` | FCF Yield | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |

## A10. Chương 10 — Kênh giá và động lượng (3 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch10-l01` | Donchian Channel | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `donchian` |
| `ch10-l02` | ROC | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `roc` |
| `ch10-l03` | Williams %R | Kỹ thuật · kiểm tra8/8 | Kỹ thuật `williams_r` |

## A11. Chương 11 — Tăng trưởng dài hạn và hiệu quả vận hành (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch11-l01` | Revenue CAGR 3Y | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch11-l02` | Net Profit CAGR 3Y | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch11-l03` | EPS CAGR 3Y | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch11-l04` | Asset Turnover | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch11-l05` | Cash Conversion Cycle | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch11-l06` | Working Capital Turnover | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |

## A12. Chương 12 — Độ ổn định doanh nghiệp (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch12-l01` | Revenue Growth Stability | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch12-l02` | EPS Stability | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch12-l03` | Margin Stability | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch12-l04` | ROIC Stability | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch12-l05` | FCF Positive Streak | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch12-l06` | Profit Positive Streak | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |

## A13. Chương 13 — Cổ đông và phân bổ vốn (6 bài)

| ID bài | Tên giữ nguyên | Loại / hoàn thành | Năng lực mở |
|---|---|---|---|
| `ch13-l01` | Dividend Yield | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch13-l02` | Payout Ratio | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch13-l03` | Dividend Growth | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch13-l04` | Share Count Growth | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch13-l05` | Buyback Yield | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |
| `ch13-l06` | Shareholder Yield | Cơ bản · kiểm tra8/8 | Chỉ tiêu Bộ lọc cùng tên; map factor registry |

**Tổng đối chiếu: 13 chương, 71 bài; 16 kỹ thuật, 42 cơ bản, 12 hướng dẫn và 1 Hợp lưu.**

---

# Phụ lục B — Ánh xạ và điểm mở quyền

## B.1. 16 chỉ báo kỹ thuật

| Capability | Tên | ID legacy | ID mới | Chương mới |
|---|---|---|---|---:|
| `rsi` | RSI | `ch01-l01` | `ch01-l01` | 1 |
| `macd` | MACD | `ch01-l02` | `ch01-l02` | 1 |
| `ma` | MA / SMA | `ch01-l03` | `ch01-l03` | 1 |
| `bollinger` | Bollinger Bands | `ch01-l04` | `ch01-l04` | 1 |
| `volume` | Khối lượng | `ch01-l05` | `ch01-l05` | 1 |
| `ema` | EMA | `ch05-l01` | `ch05-l01` | 5 |
| `ma_cross` | MA Cross | `ch05-l02` | `ch05-l02` | 5 |
| `dmi` | DMI | `ch05-l03` | `ch05-l03` | 5 |
| `stochastic` | Stochastic | `ch05-l05` | `ch05-l04` | 5 |
| `cci` | CCI | `ch05-l06` | `ch05-l05` | 5 |
| `obv` | OBV | `ch07-l04` | `ch07-l01` | 7 |
| `mfi` | MFI | `ch07-l05` | `ch07-l02` | 7 |
| `cmf` | Chaikin Money Flow — CMF | `ch07-l06` | `ch07-l03` | 7 |
| `donchian` | Donchian Channel | `ch11-l01` | `ch10-l01` | 10 |
| `roc` | ROC | `ch11-l04` | `ch10-l02` | 10 |
| `williams_r` | Williams %R | `ch11-l05` | `ch10-l03` | 10 |

Bảng dùng ID legacy trong registry đã gửi; nếu database có ID khác, giữ ID đó với mapping có bằng chứng. Không map theo tên hoặc vị trí đơn thuần. Học xong mở capability, không tạo/bật bản cấu hình.

## B.2. Các nhóm chương còn giữ và đổi số

| Nhóm cũ | Nhóm mới | Nguyên tắc |
|---|---|---|
| Chương1 | Chương1 | Giữ 6 bài; Hợp lưu không capability mới |
| Chương2 bản18 bài | Chương2 bản6 bài đã duyệt | Không map theo index; đối chiếu nội dung 6 bài |
| Chương3 | Chương3 | Giữ 6 bài cơ bản nền tảng |
| Chương4 bản10 bài | Chương4 bản6 bài | Không tự copy completion theo vị trí; bài6 mới có áp danh mục Bot |
| Chương5/7 kỹ thuật | Chương5/7 | Từng capability theo B.1; mục bị loại giữ lịch sử |
| Chương6/8 cơ bản | Chương6/8 | Giữ đúng tên/nội dung 6 bài mỗi chương |
| Chương10 Định giá | Chương9 | Từng bài tên tương ứng |
| Chương11 kỹ thuật | Chương10 | Chỉ Donchian, ROC, Williams %R |
| Chương12 dài hạn | Chương11 | Từng bài tên tương ứng |
| Chương14 ổn định | Chương12 | Từng bài tên tương ứng |
| Chương15 cổ đông | Chương13 | Từng bài tên tương ứng |
| Chương9/13 kỹ thuật và16–18 hệ thống cũ đã bỏ | Không có bài thay thế mặc định | Không gán sang chương mới cùng số; không tính vào 71 |

## B.3. Sáu alias cơ bản của mẫu Chiến lược đã có

| Bài | Chỉ tiêu | Alias trong mẫu cũ |
|---|---|---|
| ch03-l01 | Tăng trưởng doanh thu YoY | rev |
| ch03-l02 | Tăng trưởng LNST YoY | profit |
| ch03-l03 | Tăng trưởng EPS YoY | eps |
| ch03-l04 | Biên lợi nhuận gộp | gm |
| ch03-l05 | Biên lợi nhuận ròng | nm |
| ch03-l06 | ROE | roe |

Đây chỉ là alias để tìm adapter, không là chỉ thị đổi factor ID thật. Các chỉ tiêu cơ bản còn lại giữ tên và lesson binding trong catalog; ID/định nghĩa thật được nối theo registry/gói nội dung được duyệt, không tạo 36 thuật toán mới từ bảng mục lục. Bộ lọc vẫn có kỳ riêng từng chỉ tiêu, không có Mua/Bán cơ bản ở Học viện.

---

# Phụ lục C — Ma trận thay thế tài liệu cũ

| Nội dung trong nguồn cũ | Bản đích của bộ Học viện mới |
|---|---|
| Chờ trứng nở/tốt nghiệp mới vào Học viện | Vào ngay theo workspace mới; không phụ thuộc lifecycle trứng |
| Hành trình 18 chương/125 bài, 35 chỉ báo | 13 chương/71 bài, 16 chỉ báo kỹ thuật |
| Học viện đọc/ghi config, Cấu hình/ON-OFF ngay dòng bài | Học viện chỉ đọc bài/hoàn thành/cấp quyền; config nằm tại Bot/Backtest |
| Tiến độ chỉ tên “Hoàn thành bài kiểm tra” | Tiến độ học tập, tính cả bài hướng dẫn và Hợp lưu |
| Mọi bài đều thi | Chương2/4 hoàn thành bằng nút; kiến thức kiểm tra8/8 |
| Callback học/nở tự bật Bot hoặc tạo nguồn cấu hình | Chỉ grant đúng năng lực; không side effect giao dịch |
| Stop L1, nguồn Săn mã cho Bot, danh mục lọc không được apply | Theo bộ Bot mới: không stop; nguồn mua VN30/custom; Săn mã độc lập |
| Mobile rail ngang theo mẫu Học viện v2 cũ | Kế thừa panel trượt và rail phải của mẫu Bot đã duyệt |
| Placeholder mẫu thay phần đã xuất bản | Chỉ upsert khung/metadata, bảo toàn nội dung đã duyệt |

Nguồn đối chiếu: `IQX-Bo-Bot-SPEC-v1.0.md` mục2/12/Phụ lục A–C; `IQX-Bo-Bot-MAU-v1.0.html` catalog và shell; `IQX-Hoc-Vien.md` mục3–8 và catalog legacy; các điểm liên kết ở `IQX-Chien-Luoc.md`. Các bản cũ không là đầu vào bắt buộc và không có quyền ghi đè bản đích trong phạm vi Học viện.

**HẾT SPEC BỘ HỌC VIỆN — v1.0.** Gửi Markdown này cùng HTML đi kèm cho AI dev. Bộ này xây nguyên tắc và khung tiếp nhận nội dung; giáo trình từng chương và giao diện Chiến lược được bàn giao bằng các đợt riêng.

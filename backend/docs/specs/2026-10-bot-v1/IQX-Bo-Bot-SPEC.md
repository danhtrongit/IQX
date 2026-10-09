# IQX — BỘ BOT VÀ NỀN GIAO DỊCH MỚI
## Đặc tả triển khai · Khung giao diện · Cấu hình · Luyện tập · Tích hợp

**Phiên bản bàn giao:** 1.0  
**Ngày:** 07/10/2026  
**File spec:** `IQX-Bo-Bot-SPEC-v1.0.md`  
**HTML đi kèm:** `IQX-Bo-Bot-MAU-v1.0.html` — bản sao nguyên byte của `IQX-Bo-Bot-Khung-Va-Luyen-Tap-MAU-v4.0.html` đã được chủ sản phẩm đồng ý. Tiêu đề nội bộ vẫn là Mẫu v4.  
**Bộ đầu vào:** đúng hai file trên. Không yêu cầu README, prompt, ZIP, JSON, ảnh rời hoặc các spec cũ làm đầu vào bắt buộc.  
**Trạng thái:** đặc tả để AI dev sửa trực tiếp IQX hiện có; không phải báo cáo hệ thống production đã được triển khai hoặc nghiệm thu.

> **Chỉ thị cho AI dev:** Đọc toàn bộ spec và mở các luồng trong HTML. Tìm đúng repository, nhánh/build, workspace Demo Trading, tài khoản, scheduler, nguồn quyền Học viện, nguồn cấu hình và dữ liệu thật trước khi sửa. Triển khai trực tiếp bản đích dưới đây, không dựng quy trình trứng/Bot V1 cũ rồi mới gỡ. Bảo toàn tiền, vị thế, lệnh, lịch sử và kết quả học hợp lệ. HTML là chuẩn bố cục/tương tác, không phải backend hoặc dữ liệu thị trường. Nội dung từng bài Học viện sẽ được ghép sau; không tự biên soạn bài học, đề thi hoặc cấp quyền giả để hoàn tất đợt này.

---

## 0. Cách sử dụng và thứ tự ưu tiên

### 0.1. Đây là bản thay thế, không phải miếng vá trên quy tắc cũ

Bản này hợp nhất các quyết định mới về Bot, bỏ ấp trứng, Demo Trading, Săn mã độc lập, nguồn mua VN30/danh mục Bộ lọc, 16 chỉ báo và mini luyện tập. Các phần mâu thuẫn trong những tài liệu trước như `IQX-Bot-update.md`, `IQX-Hoc-Vien.md`, `IQX-Chien-Luoc.md` **không còn hiệu lực đối với phạm vi này**.

Cụ thể không kế thừa lại: điều kiện tốt nghiệp/nở; nhãn Bot V1/V2 theo giai đoạn; stop L1; bắt buộc có L1 để mua; Săn mã làm nguồn Bot; nút cấu hình ở Học viện; 35 chỉ báo; 18 chương/125 bài; yêu cầu mini bắt buộc; mini 6 tháng; đếm số giao dịch mini theo vòng đã đóng.

Các phần không thay đổi, như công thức và dữ liệu Săn mã đang chạy, sổ sách, quyền gói, thanh toán thủ công và lịch sử, phải được kiểm tra và tái sử dụng. Không dùng “ưu tiên spec mới” làm lý do xóa cả tính năng ngoài phạm vi.

### 0.2. Ba lớp thông tin

| Lớp | Cách sử dụng |
|---|---|
| Quyết định sản phẩm | Các bảng nghiệp vụ của spec này là bản đích. Không tự đổi để khớp code cũ. |
| Tham chiếu HTML được duyệt | Giữ bố cục, thứ tự, điều khiển, tên, mẫu cấu hình và tương tác. Các giả lập được nhận diện riêng tại mục 14. |
| Chi tiết chưa xác minh/chưa được chốt production | Nêu cụ thể tại mục 18: dữ liệu, biến thể tính toán, phí/lô/thanh toán, thứ tự ưu tiên mã và cấp linh thú. Không tự biến giả định mẫu thành quy định thật. |

Các biện pháp xác thực, kiểm soát phiên bản, giao dịch nguyên tử, chống ghi trùng và bảo vệ dữ liệu chưa mở là yêu cầu kỹ thuật để giữ đúng nghiệp vụ; không mở thêm tính năng đầu tư.

### 0.3. Đọc nhanh theo nhiệm vụ

| Cần tìm | Mục |
|---|---|
| Thay đổi, phạm vi, giao diện và khởi tạo | 1–3 |
| Đặt lệnh thủ công, Săn mã, Theo dõi | 4–5 |
| Bot: nguồn mua, cấu hình và phiên giao dịch | 6–8 |
| 16 chỉ báo: hợp đồng tính toán, điều kiện, tham số | 9 và Phụ lục B |
| Mini: dữ liệu, lượt, thời gian giữ, chart, kết quả | 10–11 |
| Học viện và Chiến lược: điểm ghép | 12 và Phụ lục A/C |
| API, dữ liệu, mock, migration | 13–15 |
| Ca nghiệm thu và kiểm tra HTML của đợt này | 16–17 |
| Phụ thuộc, trình tự triển khai và định nghĩa hoàn thành | 18 |

---

## 1. Phạm vi bản đích

### 1.1. Ma trận thay đổi

| Thành phần | Bản đích |
|---|---|
| Ấp trứng/cấp 0–6 | Bỏ khỏi luồng người dùng mới và các cổng cho phép dùng sản phẩm. Không còn nhiệm vụ nở hoặc chờ cấp để đặt lệnh/học/dùng Bot. |
| Linh thú | Có từ đầu; tái sử dụng tài nguyên và renderer IQX, không tạo hệ tiến hóa/chăm sóc mới. |
| Bot | Một Bot trên trải nghiệm, một tài khoản Bot bền vững; không có giai đoạn tự trade V1 và không tạo Bot mới theo chương. |
| Demo Trading | Tự Mua/Bán kiểu tài khoản mô phỏng thông thường; 100.000.000 đồng vốn khởi tạo một lần. Không phụ thuộc Học viện/Bot. |
| Săn mã | Độc lập với trứng/Học viện/Bot; giữ năm bộ lọc có sẵn. Tích Theo dõi vào Danh mục theo dõi. |
| Học viện | Khung 13 chương, 71 tên bài. Chỉ Xem bài/Đã học; không có Cấu hình hoặc ON/OFF giao dịch tại dòng bài. |
| Chỉ báo kỹ thuật | Đúng 16 chỉ báo tại Phụ lục B; bài học mở chỉ báo tương ứng, không tự bật. |
| Nguồn Bot mua mới | VN30 mặc định hoặc danh mục do người dùng lọc và áp dụng. Không dùng đồng thời hai nguồn. |
| Phạm vi Bot bán | Mọi vị thế Bot đang giữ, không phụ thuộc danh mục mua mới hiện tại. |
| Thoát vị thế Bot | Chỉ theo điều kiện Bán đang có hiệu lực; không stop/chốt lời/trailing/thời gian giữ ngầm. |
| Mini luyện tập | Tùy chọn; một chỉ báo/một mã; 30 mã không lặp trong từng bộ; giấu mã/ngày; quan sát khoảng 6 tháng, tính kết quả 24 tháng. |
| Mini sử dụng vốn | 100% tiền khả dụng mỗi lần mua, gồm phí; không nạp lại vốn trong lượt. |
| Mini thời gian giữ | Mặc định 60 phiên, được chỉnh trước khi chạy. Bán theo chỉ báo hoặc đến hạn; chỉ mini có quy tắc này. |
| Mini kết quả | Hai chỉ số: Tổng lợi nhuận và Số giao dịch, đếm số lần Mua đã khớp; toàn bộ lịch sử, thời gian giữ và nhận xét viết sẵn. |

### 1.2. Làm trong bộ Bot

Dựng/nâng cấp khung workspace theo HTML; bỏ các cổng trứng ở frontend và backend; khởi tạo an toàn; tách tài khoản thủ công/Bot; nối đặt lệnh và Theo dõi; xây panel Bot, cấu hình 16 chỉ báo, nguồn mua mới, worker và nhật ký; triển khai mini cùng cơ chế lưu lượt; chuẩn bị catalog/điểm mở bài và nguồn quyền; chuyển đổi, kiểm thử và hồi quy.

Việc triển khai 16 bộ điều kiện, chuỗi chỉ báo và mini thuộc phạm vi chức năng này. Phần **giáo trình** giải thích chỉ báo không thuộc phạm vi. Không dùng việc giáo trình sẽ ghép sau để thay 15 thuật toán bằng RSI hoặc báo rằng chỉ cần dựng 16 nút.

### 1.3. Không làm trong bộ Bot

Không viết toàn văn 71 bài, câu hỏi, đáp án hay biểu đồ giảng dạy. Không xây lại toàn trang Chiến lược (Cảnh báo/Backtest/Bộ lọc). Chỉ nối hợp đồng danh mục và cấu hình cần thiết. Không thêm chỉ báo ngoài 16, AI tự sinh chiến lược, tối ưu tham số, đa khung thời gian, bán khống, margin, quản trị danh mục nâng cao hoặc một game mới thay trứng.

Không kết nối tài khoản giao dịch tiền thật, không gửi lệnh ra công ty chứng khoán. Không tự deploy/bật worker production ngoài quyền được cấp.

---

## 2. Bố cục và điều hướng

### 2.1. Giữ khung thực tế

```text
Header IQX / điều hướng đang có
┌────────────────────────────────┬──────────────────────────┬─────────┐
│ NỘI DUNG CHÍNH                  │ PANEL NGỮ CẢNH BÊN PHẢI │ CÔNG CỤ │
│ Linh thú / bài đang xem /       │ Học viện hoặc Bot hoặc  │ Học viện│
│ chart luyện tập / đặt lệnh /    │ điều kiện luyện tập /   │ Đặt lệnh│
│ danh mục, lịch sử               │ đặt lệnh / Săn mã        │ Danh mục│
│                                │                          │ Bot     │
│                                │                          │ Săn mã… │
└────────────────────────────────┴──────────────────────────┴─────────┘
```

Học viện và Bot là công cụ bên phải. Không tạo thêm hai tab điều hướng cấp cao để thay bố cục này. Giữ Tin tức, Mẫu nến, Biểu đồ, Bảng giá, AI Phân Tích và các chức năng đang hoạt động ngoài phạm vi. Header trong HTML có những điểm mở minh họa; ví dụ nút CHIẾN LƯỢC mở danh mục mẫu, **không thay route thật `/chien-luoc` bằng modal danh mục** khi tích hợp.

| Thao tác | Nội dung trái | Panel phải | Thanh công cụ |
|---|---|---|---|
| Học viện | Linh thú hoặc bài được chọn | 13 chương/71 tên bài, tiến độ | Giữ |
| Xem bài | Renderer bài thật nếu đã được ghép; nếu chưa thì đúng tên/trạng thái | Danh sách Học viện | Giữ |
| Bot | Linh thú, tài khoản Bot, điều kiện hiệu lực, vị thế/lịch sử/nhật ký | Nguồn mua mới + 16 chỉ báo | Giữ |
| Luyện tập RSI/chỉ báo khác | Chart, kết quả, giao dịch của lượt | Điều kiện Mua/Bán, thời gian giữ, Bắt đầu | Giữ; Bot được chọn |
| Cấu hình Bot | Không chuyển thành trang mới | Modal hai phía theo HTML | Giữ |
| Đặt lệnh | Mã/chart, tiền và sổ lệnh/danh mục tự giao dịch | Form đặt lệnh | Giữ |
| Săn mã | Kết quả bộ lọc, Theo dõi | Năm nhóm và điểm mở danh sách theo dõi | Giữ |

Tài khoản mới vào Học viện với linh thú, không qua trứng. HTML mở Bot để thuận tiện duyệt mẫu; không dùng điều đó đổi luồng onboarding đã chốt. Link/route đang có phải tiếp tục hoạt động; ánh xạ URL Hành trình cũ sang workspace mới phù hợp, không phát lại nở hoặc reset tài khoản. Không tìm/thay toàn bộ từ `journey` trong code/database.

### 2.2. Trạng thái cần nhìn thấy

Bot phân biệt **Chờ thiết lập điều kiện**, **Đã bật điều kiện Mua**, **Chỉ xét điều kiện Bán**, **Đã bật Mua và Bán**, và lỗi quyền/cấu hình/dữ liệu. Không lấy công tắc đã lưu làm bằng chứng worker đang chạy thành công. Thể hiện bản đã lưu, bản hiệu lực, thay đổi đang chờ ở mức gọn, có nơi xem chi tiết.

Khối Danh mục Bot có Đang giữ / Lịch sử / Nhật ký. Chỉ mini giấu mã và ngày; Bot vận hành, Demo Trading và Săn mã vẫn hiện mã/ngày thật của dữ liệu mô phỏng tương ứng.

### 2.3. Quy cách hiển thị

Bám màu, cỡ chữ, viền, khoảng cách, thứ tự, trạng thái khóa và cấu trúc modal của HTML v4. Cột phải 410px, rail 78px là mốc mẫu, thay đổi theo breakpoint của mẫu; từ 1750px dùng panel 25,2vw/rail 86px. Tích hợp token/layout hiện có để đạt hình thức tương đương, không áp những số này lên toàn website.

Từ 900px trở xuống, panel mở cạnh rail dạng lớp trượt theo mẫu, rail vẫn ở bên phải, có nút đóng/mở; chart/bảng trong nội dung trái. Không lấy layout mobile xếp Học viện phía dưới của HTML cũ thay cho v4. Kiểm tra 360/390/900/1024/1440px: không tràn ngang toàn trang; bảng cuộn ngang nội bộ; form và nút Lưu/Hủy/Bắt đầu đều truy cập được.

Giữ vị trí cuộn/danh sách/chương mở hợp lý khi chuyển ngữ cảnh, không remount linh thú để phát nở. Modal có focus/return focus, Escape với xác nhận bỏ draft, switch có trạng thái truy cập, chart/bảng có đường đọc bằng bàn phím. Không dùng màu làm dấu hiệu duy nhất; tôn trọng Reduced Motion. Không thêm lời giải thích lập trình hoặc badge tên viết tắt không được duyệt.

---

## 3. Khởi tạo, linh thú và ba nguồn vốn

### 3.1. Khởi tạo không phụ thuộc trứng

Luồng backend onboarding/ensure-account có xác thực tạo hoặc tìm lại tài khoản hợp lệ. Không chờ `graduated_at`, cấp 6, sự kiện animation hoặc callback nở để cho phép Học viện, đặt lệnh, Săn mã hoặc truy cập Bot. Không giả đánh dấu mọi người đã tốt nghiệp để né việc gỡ cổng.

Tài khoản Bot mới chờ cấu hình: có thể có tham số mẫu nhưng master/Mua/Bán đều OFF. Không lấy trạng thái `core/all` của HTML đưa vào người dùng thật. Không tự chạy phiên Bot khi GET, tải lại, nhận linh thú, đạt bài hoặc mở công cụ.

| Kho sổ sách | Khởi đầu | Quy tắc |
|---|---|---|
| Tự giao dịch | 100.000.000 đồng nếu tài khoản mới chưa có bút toán cấp vốn | Người dùng tự đặt lệnh; độc lập Bot. |
| Bot | 100.000.000 đồng, tài khoản riêng, cấp một lần | Tiếp tục tài khoản Bot hiện hữu nếu có; không tạo lại theo chương. |
| Mini | 100.000.000 đồng cho một lượt tính toán theo mẫu | Không phải tài khoản nhận tiền; không cộng tiền/lỗ vào hai tài khoản trên. |

Cấp vốn theo một nghiệp vụ idempotent có khóa bền vững `owner + account_type + initial_funding`. Retry onboarding, hai thiết bị, mở lại trang không tạo tài khoản/bút toán thứ hai. GET chỉ đọc không tự ghi giao dịch hoặc cấp tiền; route khởi tạo có thể gọi nghiệp vụ riêng được kiểm soát.

### 3.2. Người dùng hiện hữu

Không đặt lại số dư về 100 triệu, không bù tiền đã thua và không thay vốn gốc của tài khoản đang có bút toán. Audit nguồn vốn trước chuyển đổi. Nếu dữ liệu cũ thiếu chứng từ cấp vốn, đối soát sổ cái, không mặc định “không thấy field = chưa được cấp” để cộng tiền lần nữa.

Giữ quyền, tiến độ có bằng chứng, vị thế, giá vốn, phí, lệnh đang chờ, cổ tức/quyền chờ nhận và lịch sử. Không lấy việc bỏ trứng làm reset các nghiệp vụ này.

### 3.3. Linh thú

Giữ linh thú đã có và renderer/asset hiện có. Lỗi asset dùng fallback, không khóa tài khoản hoặc tạo lại vốn. Linh thú không quyết định tham số/điều kiện hay quyền giao dịch.

HTML dùng Bạch Hổ làm hình tham chiếu, không xác nhận mọi tài khoản mới đều phải nhận Bạch Hổ. Việc gán linh thú ban đầu dùng cơ chế/mặc định đã được hệ thống phê duyệt; nếu cơ chế thật chỉ lấy từ kết quả cấp 0–6 và không có lựa chọn thay thế, báo đúng chỗ cần quyết định tại mục 18. Không tự thêm màn chọn/random/năng lực theo loài chưa được yêu cầu.

---

## 4. Demo Trading — đặt lệnh thông thường

### 4.1. Phạm vi nghiệp vụ

Chọn mã, phía Mua/Bán, loại lệnh hỗ trợ, giá, khối lượng; xem tiền và chứng khoán khả dụng; xác nhận; theo dõi Chờ khớp/Đã khớp/Đã hủy/Từ chối cùng các trạng thái thật đã hỗ trợ; xem danh mục và đầy đủ lịch sử. Giữ sửa/hủy/phần khớp còn lại nếu engine hiện có hỗ trợ, không xóa chỉ vì HTML chỉ minh họa LO và khớp toàn bộ.

Không đòi học bài, bật Bot, nở trứng, hoàn thành nhiệm vụ, nhập luận điểm, chọn phương pháp hoặc checklist ấp trứng trước khi đặt lệnh. Không bắt câu hỏi kiểm tra để bán. Người dùng chọn khối lượng; nút tỷ lệ 25/50/75/100% là trợ giúp nhập, không là nghĩa vụ mua toàn vốn.

Giữ kiểm tra thuộc tính lệnh, giới hạn tiền, chứng khoán khả dụng, bước giá/lô, biên độ, giờ/phiên, phí/thuế và thanh toán theo service/profile **tự giao dịch** đang có. Không tháo khóa chứng khoán/tiền chờ về vì Bot hay mini không có khóa tương tự. Không áp 12%/hai mua của Bot cho lệnh thủ công, không giới hạn mã theo danh mục Bot hoặc VN30.

### 4.2. Kiểm tra và ghi sổ

Server xác thực owner/tài khoản và dữ liệu trước xác nhận, rồi kiểm tra lại tại lúc nhận/khớp lệnh. Giữ chỗ tiền Mua gồm phí, hoặc khối lượng Bán, để hai lệnh chờ không sử dụng cùng một số dư. Hủy chỉ giải phóng phần chưa khớp; không hoàn tác giao dịch đã khớp. Tranh chấp hủy/khớp dùng trạng thái giao dịch nguyên tử, không cộng/trừ hai lần.

Lệnh Mua LO không khớp trên giá giới hạn; lệnh Bán LO không khớp dưới giá giới hạn trong profile đó. Không dùng quote cũ như giá thị trường hiện tại. Nếu thiếu nguồn/mô hình khớp đúng, hiển thị lỗi/chờ dữ liệu, không giả thành công.

Sổ lệnh khác lịch sử giao dịch; một lệnh được nhận không có nghĩa đã khớp. Có lệnh khớp từng phần phải phản ánh tổng khớp, giá bình quân, phần còn lại, phí theo hệ thống thật. Không tự mở mới hỗ trợ margin/bán khống ngoài phạm vi.

### 4.3. Giới hạn của mẫu

`orderEditor`, `orderCheck`, `matchManual` chỉ minh họa LO, bước giá 100 đồng, lô 100 cổ phiếu, khớp toàn bộ tại quote mẫu, không thanh khoản/sổ lệnh/T+. Những giá trị này **không phải hợp đồng thị trường hoặc yêu cầu thay engine tự giao dịch**. Xác minh implementation trong repository; nếu chưa có contract, nêu thiếu. Không gộp ba profile thực thi vì HTML dùng một biến `PROFILE`.

---

## 5. Săn mã và Danh mục theo dõi độc lập

### 5.1. Những gì giữ

Giữ năm nhóm: **Khối ngoại gom; Tự doanh gom; Khối lượng đột biến; Vượt đỉnh 20 phiên; Tăng mạnh kèm khối lượng**. Giữ nguồn dữ liệu, phạm vi, điều kiện và xếp thứ tự có thật đang được dùng. Gỡ sự phụ thuộc trứng hoặc bật Bot, không tự viết lại các bộ lọc.

Tham chiếu nghiệp vụ cũ để audit, không phải công thức thay source hiện hữu:

| Nhóm | Điều kiện tham chiếu đã có |
|---|---|
| Khối ngoại gom | Mua ròng ít nhất 3/5 phiên, tổng ròng 5 phiên dương; ưu tiên tổng ròng giảm dần. |
| Tự doanh gom | Tương tự, dùng dữ liệu tự doanh. |
| Khối lượng đột biến | Khối lượng phiên ≥ 2 × TB20; ưu tiên tỷ số khối lượng. |
| Vượt đỉnh 20 phiên | Đóng cửa > đỉnh 20 phiên trước phiên xét; ưu tiên phần trăm vượt. |
| Tăng mạnh kèm khối lượng | Giá tăng ≥ 3% và khối lượng ≥ 1,5 × TB20; ưu tiên mức tăng. |

Bộ cũ mô tả HOSE, giá từ 3.000 đồng, GTGD20 từ 1 tỷ/phiên, kiểm tra trạng thái hạn chế, top tối đa 10 mỗi nhóm và tie theo mã. Cần đối chiếu service đang chạy, cách tính TB20 và dữ liệu khối ngoại/tự doanh; không biến các danh sách fixture trong `huntRows` thành nguồn thật hoặc tự chọn lại cửa sổ có/không gồm phiên T.

**Bỏ 3/5 lớp AI của Bot không phải bỏ 3/5 phiên mua ròng của Săn mã.** Việc loại Gap/N-day High… khỏi Học viện không xóa các công thức đang có trong Săn mã.

### 5.2. Theo dõi

Tích Theo dõi ở Săn mã hoặc điểm tương ứng → thêm mã vào **Danh mục theo dõi** của tài khoản. Một mã xuất hiện ở nhiều nhóm chỉ có một dòng theo dõi. Bỏ theo dõi không bán; thêm theo dõi không mua và không thay nguồn Bot.

Giữ mã trong danh sách qua ngày sau dù nó không còn đạt bộ lọc Săn mã. Chỉ người dùng chủ động bỏ mới thay lựa chọn; mã ngừng hỗ trợ hiển thị trạng thái phù hợp, không xóa dấu vết tùy tiện. Đồng bộ checkbox giữa các nhóm theo nguồn lưu bền vững, có ownership và chống trùng. Lỗi API hoàn nguyên trạng thái lạc quan hoặc hiển thị chưa lưu, không toast thành công giả.

Danh mục theo dõi, danh mục nghiên cứu từ Bộ lọc, danh mục mua mới Bot và cổ phiếu thực nắm giữ là bốn khái niệm khác nhau. Không tái sử dụng một bảng UI hoặc ID mà đánh tráo vai trò. Bấm Đặt lệnh từ Săn mã/Theo dõi chỉ điền mã vào form thủ công; vẫn cần xác nhận.

---

## 6. Nguồn mua mới của Bot

### 6.1. Hai chế độ

| Nguồn hiệu lực | Mua mới | Bán |
|---|---|---|
| VN30 mặc định | Chỉ xét mã trong VN30 có hiệu lực phiên xét | Mọi vị thế Bot đang giữ |
| Danh mục riêng được áp dụng từ Bộ lọc | Chỉ tập mã người dùng xác nhận | Mọi vị thế Bot đang giữ |
| Trở về VN30 | Chỉ VN30 từ phiên thay đổi có hiệu lực | Không bán cưỡng bức vị thế ngoài VN30 |

Danh mục riêng **thay thế**, không hợp/không lấy giao với VN30. Mã không thuộc VN30 vẫn được dùng khi trong danh mục đã áp dụng và thuộc phạm vi giao dịch hỗ trợ. Không áp ngầm các ngưỡng lọc Săn mã vào danh mục riêng. Các kiểm tra mã hợp lệ/có thể giao dịch, dữ liệu, tiền/lô và trạng thái vị thế vẫn giữ.

VN30 phải được cấp từ nguồn thành phần theo phiên hiệu lực được xác minh, không lấy 30 phần tử đầu của `COMPANY_ROWS`. Mã rời VN30 ngừng được mua mới từ thời điểm thành phần đổi, nhưng vị thế cũ vẫn xét Bán. Không dùng danh sách hôm nay để viết lại nguồn đã dùng trong lịch sử.

### 6.2. Danh mục riêng là ảnh chụp tập mã lúc xác nhận

Người dùng học bài cơ bản → mở chỉ tiêu trong Bộ lọc → lọc → chọn mã → **Áp dụng cho Bot**. Lưu bộ lọc/Lưu danh mục chưa tự đổi Bot. Cả UI và backend xác minh nguồn kết quả/danh mục, chủ sở hữu và quyền chỉ tiêu đã dùng; không nhận tập mã tự khai từ client thay cho kết quả nguồn.

Lưu `saved_list_id`, phiên bản nguồn, tập mã thực tế đã chọn, tên, dấu vết kết quả/tiêu chí/cutoff khi có, thời điểm yêu cầu và phiên hiệu lực. Không cần nhân toàn bộ báo cáo tài chính vào Bot nếu có tham chiếu bất biến. Danh mục cố định cho đến lần người dùng áp dụng mới; báo cáo hoặc kết quả Bộ lọc ngày sau thay đổi không tự đổi nguồn Bot.

Có thể chọn một phần danh mục trước áp dụng theo mẫu. Không cho tập rỗng; không lưu chỉ trang API đầu tiên nếu người dùng chọn toàn bộ. Khử mã trùng, validate toàn bộ lựa chọn. Có mã không hợp lệ thì hiển thị danh sách lỗi để người dùng xác nhận lại, không âm thầm loại rồi áp dụng số mã khác.

Một Bot chỉ có một nguồn hiệu lực. Có thể lưu nhiều danh mục nhưng áp danh mục mới là thay nguồn cũ, không phân bổ vốn thành nhiều chiến lược.

### 6.3. Saved / pending / effective

Áp dụng danh mục, chuyển về VN30 hoặc thay cấu hình chỉ báo là ghi bản có phiên hiệu lực, không tạo lệnh ngay. Nguyên tắc chung: phiên hợp lệ đầu tiên có **ngày lớn hơn ngày server nhận lưu**, theo `Asia/Ho_Chi_Minh` và lịch IQX, kể cả lưu trước mở cửa của ngày đó.

UI hiển thị nguồn **đang hiệu lực**, bên dưới nguồn **chờ hiệu lực**. Hủy thay đổi chờ theo mẫu chỉ hủy yêu cầu chưa có hiệu lực; không xóa nguồn đang dùng hoặc lịch sử. Server kiểm tra revision/tranh chấp với job áp dụng; không báo đã hủy nếu nó đã được dùng.

Nhiều bản lưu trước cùng phiên hiệu lực được giải quyết theo revision hợp lệ, ghi dấu vết bản thay thế; không làm một phiên dùng danh mục khác nhau giữa các mã. Cấu hình và nguồn có revision riêng nhưng được chụp đồng thời trong snapshot một lượt.

### 6.4. Vị thế ngoài nguồn mua mới

Khi đổi nguồn, giữ nguyên tiền, số lượng, giá vốn, phí, nguồn lúc mở, quyền lợi và vị thế. Không tái cân bằng, không ép bán để mua danh mục mới. Nếu mã A nằm ngoài nguồn mua hiện tại: không mua thêm hoặc mua lại sau khi đã bán; vẫn xét điều kiện Bán theo **cấu hình hiệu lực hiện tại**, không bị khóa theo danh mục hoặc cấu hình lúc mua.

Lưu `entry_source_snapshot` để tra cứu, không dùng nó như nguồn mua mới. UI hiển thị “Trong nguồn mua” hoặc “Chỉ theo dõi Bán” theo mẫu. “Chỉ theo dõi Bán” không có nghĩa Bán chắc chắn đang bật; phần trạng thái cấu hình phải đọc được độc lập.

### 6.5. Lỗi và những thao tác không tự tác động Bot

| Tình huống | Kết quả bắt buộc |
|---|---|
| Lọc không ra mã / bỏ chọn tất cả | Không áp dụng; giữ nguồn hiện có. |
| Thay tiêu chí hoặc số liệu Bộ lọc | Không đổi danh mục Bot cho tới xác nhận mới. |
| Chỉnh/xóa danh mục nguồn | Không tự đổi snapshot đang dùng. Trường hợp xóa khi đang áp dụng phải yêu cầu chọn nguồn khác/về VN30 theo luồng xác nhận. |
| Nguồn mua tải lỗi hoặc không xác định | Không tự về VN30/Săn mã/tất cả mã. Không mua mới trên nguồn không xác minh được; vẫn xét Bán vị thế đủ dữ liệu. |
| Một mã thiếu dữ liệu Mua | Không bịa dữ liệu; ghi lý do, không bỏ điều kiện rồi mua. |
| Tích Theo dõi trong Săn mã | Không đổi nguồn Bot. |
| Bấm “Về VN30” rồi Hủy | Không thay nguồn. |

Nút “Áp dụng cho Bot” ở đây chỉ áp **tập mã**, không khôi phục một nút Apply cấu hình kỹ thuật thứ hai. Bộ Bot cung cấp nhận/lưu nguồn và modal danh mục; màn lọc đầy đủ thuộc bộ Chiến lược sau, dùng cùng hợp đồng này.

---

## 7. Cấu hình kỹ thuật vận hành

### 7.1. Quyền học khác kích hoạt

Đúng 16 capability kỹ thuật tại Phụ lục B. Chưa có grant thật → Xem bài; không được chỉnh/bật/chạy mini bằng request trực tiếp. Đạt bài → mở capability tương ứng, **không tự master ON hoặc bật Mua/Bán**. Hoàn thành mini không cấp thêm quyền; không cần đủ 30 lượt hoặc lợi nhuận dương để mở Bot.

Học viện chỉ đọc nội dung/tiến độ; Bot là nơi cấu hình. Một bản cấu hình đã lưu dùng chung với Backtest đầy đủ theo contract còn giữ. Cảnh báo ghim snapshot riêng. Mini có draft/snapshot riêng hoàn toàn. Không tạo ba bản cấu hình vận hành độc lập chỉ để ba màn dễ code.

### 7.2. Form và công tắc

Mỗi chỉ báo: master + phía Mua + phía Bán. Hai phía độc lập cả ON/OFF, tham số và dấu. Modal có hai tab, công tắc phía hiện tại, số nhập, dòng vế trái — ký hiệu — vế phải, Đặt lại / Hủy / Lưu. Không đặt form/công tắc giao dịch vào Học viện.

| Hành động | Hành vi |
|---|---|
| Master OFF | Chỉ báo không tham gia cả hai phía; giữ nguyên cấu hình con. |
| Master OFF → ON, đã có phía ON | Lưu ý định bật, giữ lựa chọn con, không bật phía còn lại. |
| Bật master khi hai phía OFF | Mở Cấu hình chọn phía; Hủy không kích hoạt. |
| Lưu khi cả hai phía OFF | Master OFF. Không có điều kiện rỗng đúng. |
| Vào Cấu hình sửa số trong khi master OFF | Không tự bật master. |
| Chỉnh Mua | Không sửa Bán; nếu sửa cả hai tab thì Lưu đúng cả hai thay đổi. |
| Đặt lại | Chỉ params và toán tử tab đang mở về mẫu; giữ ON/OFF, tab kia và master; cần Lưu để commit. |
| Hủy/Escape/rời modal có draft | Xác nhận bỏ; không commit; từ chối rời thì giữ draft. |
| Lưu thất bại / xung đột | Giữ draft; hiện lỗi; không ghi đè dữ liệu mới bằng tab cũ. |

Mới tạo tài khoản: master/Mua/Bán đều OFF. Mini mới có hai phía ON theo mẫu để thử, không sao trạng thái đó vào Bot. Các giá trị mẫu là điểm khởi đầu chỉnh sửa, không khuyến nghị chiến lược hoặc số liệu chứng minh sinh lời.

### 7.3. Hợp lưu và biểu thức

```text
E_buy  = chỉ báo có cấu hình hợp lệ, master ON, buy.enabled ON và quyền hợp lệ
E_sell = chỉ báo có cấu hình hợp lệ, master ON, sell.enabled ON và quyền hợp lệ
buy_signal  = E_buy không rỗng  AND toàn bộ rule của E_buy đúng ở T
sell_signal = E_sell không rỗng AND toàn bộ rule của E_sell đúng ở T
```

Cấu hình bật nhưng hỏng/trái quyền phải báo lỗi và chặn phía liên quan, **không loại bỏ âm thầm khỏi E rồi AND các điều kiện còn lại**. Thiếu dữ liệu khác sai; không thay null/NaN bằng 0. Hai phía có thể cùng đúng. Không tự nắn dấu theo tên Mua/Bán, không đổi trạng thái thành giao cắt, không đa số/điểm AI/OR ngầm, không lấy tín hiệu hôm qua để đủ AND hôm nay.

`>`/`<` nghiêm ngặt; bằng ngưỡng không đạt. Khoảng Bollinger trong mẫu là khoảng mở `(lower, upper)`; `∉` chỉ phủ định khi giá và hai biên đều hợp lệ và lower < upper. Với MA Cross: dấu `>` là giao cắt từ nhanh ≤ chậm ở T−1 sang nhanh > chậm ở T; dấu `<` đối xứng. Xem đầy đủ tại Phụ lục B.

Mỗi phía tính T/T−1 theo chính params của snapshot đó. Không ghép RSI14 phiên trước với RSI10 hôm nay khi đổi cấu hình. Cache phải phân biệt mã, kỳ, params, loại giá và phiên bản thuật toán/dữ liệu.

### 7.4. Bản lưu và phiên hiệu lực

Server cấp revision, xác minh `expected_revision`, owner, grant, registry/rule version và idempotency. Không tin trường `passed`, danh sách allowed_ops, user ID hoặc ngày hiệu lực do client tự khai. Chỉ cho cấu trúc/toán tử trong schema, không `eval` biểu thức từ input.

Thay đổi tại ngày D có hiệu lực ở phiên hợp lệ có ngày > D; trước đó Bot dùng bản cũ. Không giả +24h/thứ Hai nếu thiếu lịch; báo đúng pending/lỗi. Cùng phiên đã chụp snapshot thì retry dùng lại snapshot; không trộn hai revision Mua/Bán hoặc cập nhật giữa các mã. Xem lịch sử, mở cấu hình, chạy/lưu mini, lưu Backtest hoặc tạo Cảnh báo không ghi lại config vận hành.

---

## 8. Bot — chính sách giao dịch và sổ sách

### 8.1. Những luật bị bỏ hoàn toàn khỏi quyết định mới

Không tốt nghiệp/trứng/cấp; không V1 fallback; không đủ năm lớp AI, 3/5 lớp Ủng hộ, phủ quyết Tin tức/Nội bộ; không stop L1 hoặc bắt L1 chỉ để mở stop; không target L1 ×4; không % stop, trailing, chốt lời hoặc max holding tự sinh. Những trường đó có thể tồn tại chỉ để đọc lịch sử cũ.

Không xóa module AI phân tích/nội bộ/tin hoặc nguồn L1 ở sản phẩm khác. Không lấy danh mục học căn bản làm điều kiện Bán. Bot không tự bán vì mã rời danh mục, vì giữ lâu, vì lãi/lỗ một mức, hoặc vì mất một điều kiện Mua.

### 8.2. Bảng hành vi

| Có Mua hiệu lực | Có Bán hiệu lực | Hành vi |
|---|---|---|
| Không | Không | Không mua mới; vị thế còn giữ không có bán tự động theo chỉ báo. |
| Có | Không | Mua khi điều kiện và kiểm tra thực thi đạt; tiếp tục giữ nếu chưa có Bán. |
| Không | Có | Không mua mới; xét Bán mọi vị thế đang giữ. |
| Có | Có | Xét Bán/Mua theo trạng thái và từng tập điều kiện. |

Mua/Bán cùng đúng: mã trống đầu bước chỉ xét mở Mua; mã đã có vị thế đầu bước xét Bán, không mua thêm. Đã bán trong phiên không mua lại cùng phiên. Không bán khống; Bot bán toàn bộ vị thế, không bán từng phần trong policy này. Không yêu cầu vị thế có lãi. Số bán không bị giới hạn bởi hạn mức hai mua.

### 8.3. Quy tắc vốn Bot giữ từ nền cũ

| Thuộc tính | Quy tắc |
|---|---|
| Vốn ban đầu | 100 triệu, tài khoản riêng, cấp một lần |
| Ngân sách mỗi mua | Tối đa 12% NAV tham chiếu đầu lượt, gồm phí |
| Số mua mới/phiên | Tối đa 2 giao dịch Mua thành công |
| Tỷ trọng/mã lúc xét mua | Tối đa 30% NAV sau giao dịch dự kiến |
| Mã đang giữ/nghiệp vụ chưa kết thúc | Không mua thêm |
| Mã bán trong phiên | Không mua lại phiên đó |
| Mô hình khớp Bot | Dữ liệu ngày hoàn tất, mô phỏng tại giá đóng cửa cùng phiên |
| Stop/target/trailing/max holding | Tắt tường minh, không kế thừa default engine khác |

12% và 100% của mini không được dùng lẫn. Không bù lệnh cho đủ hai; ứng viên bị bỏ qua không sử dụng một suất mua. Tỷ trọng vượt 30% do tăng giá sau mua không tạo bán tái cân bằng. Không tự thêm trần ngành hoặc số mã tối thiểu.

```text
NAV_basis_T = cash_before_trades + Σ(qty_start × close_T)
budget_per_buy = 0.12 × NAV_basis_T
buy_total(q) = q × close_T + fee_buy(q, close_T)
q là khối lượng hợp lệ lớn nhất sao cho:
  buy_total(q) ≤ budget_per_buy
  buy_total(q) ≤ tiền khả dụng hiện tại
  giá trị mã sau mua / NAV sau giao dịch dự kiến ≤ 0.30
```

Khóa NAV một lần sau đối soát/bút toán sự kiện doanh nghiệp hợp lệ, trước giao dịch trong lượt. Hai lệnh Mua dùng cùng NAV_basis, dù đã bán; tiền khả dụng cập nhật sau mỗi commit. Thiếu giá định giá một vị thế khiến NAV_basis không đủ thì không mua bằng NAV giả; vẫn xử lý Bán những vị thế đủ dữ liệu. Không tiền âm, không làm tròn lên lô. Phí/lô/thuế dùng service profile Bot đã xác minh, không lấy số mẫu làm quy định.

### 8.4. Nhiều mã cùng đạt Mua

Nguồn là VN30 hoặc tập mã riêng, không còn filter_count hoặc điểm AI. Mẫu v4 minh họa xếp GTGD bình quân 20 phiên giảm dần, bằng nhau thì mã tăng dần. **HTML tự ghi đây là phương án mẫu chưa thay quyết định production.** Giữ nhận diện này: audit nguồn GTGD/cách tính và quy tắc xếp mới được duyệt; nếu chưa có thì cần xác nhận trước bật worker mua thật trong môi trường sản phẩm.

Không thay bằng thứ tự người dùng đang sort bảng Bộ lọc, thứ tự random của mini, 30 phần tử đầu hoặc đếm số chỉ báo đúng. Không dùng lại Săn mã để né chỗ thiếu. Phần UI/config/sell và các phần đã đủ hợp đồng vẫn triển khai; chặn nghiệm thu riêng phần thứ tự mua chưa được xác nhận.

### 8.5. Một phiên Bot

```text
1. Xác thực tài khoản, trạng thái sổ sách, lịch và readiness nến ngày.
2. Tạo/khôi phục lượt duy nhất account + trading_session.
3. Chụp policy + cấu hình hiệu lực + quyền + nguồn mua hiệu lực + data versions.
4. Chụp vị thế đầu lượt, tập chặn mua lại; đối soát; khóa NAV_basis nếu đủ.
5. Xét Bán TỪNG vị thế đầu lượt theo cấu hình Bán hiệu lực.
   Không yêu cầu mã nằm trong nguồn mua mới; không có stop/target/time exit.
6. Commit bán hợp lệ nguyên tử; cập nhật tiền khả dụng theo profile Bot.
7. Nếu tập Mua rỗng/không hợp lệ hoặc nguồn mua chưa xác minh: không mua mới.
8. Nếu đủ, duyệt tập mua theo thứ tự được chốt; điều kiện AND + giá/lô/vốn/giới hạn.
9. Tối đa 2 mua thành công; lưu vị thế và bằng chứng, không ghi stop mới.
10. Đối soát tiền/phí/vị thế; giá trị cuối phiên; nhật ký đúng mã và trạng thái lỗi.
```

Không `if no_buy: return` trước bước xét Bán. Một lỗi mã không hủy giao dịch mã khác đã commit; không ghi số tổng đầy đủ nếu định giá thiếu. Mô phỏng cùng close là giả định sản phẩm, không chứng minh lệnh thật có thể khớp giá đó sau khi biết close/volume. Không áp `next_open` của mini vào Bot.

Giữ policy Bot mô phỏng đóng cửa không chờ chứng khoán về như nền đã mô tả; không suy ra có thể bỏ T+ của tài khoản thủ công. Nếu implementation/profile thực có khác biệt, ghi ra trước tích hợp, không chuyển quy tắc giữa các tài khoản một cách ngầm định.

### 8.6. Sổ sách, lịch sử và idempotency

Giao dịch, phí, tiền, vị thế và execution ID ghi nguyên tử hoặc qua cơ chế có đối soát tương đương. Khóa bền vững `(bot_account_id, trading_session)` không thêm config revision để vô tình cấp lại hai suất mua mỗi lần đổi bản. Lưu NAV_basis, tập chặn, snapshot, số mua thành công và bước đã commit để worker retry tiếp đúng.

```text
cash_after_buy  = cash_before − qty × price − buy_fee
sell_net        = qty × price − sell_fee − sell_tax
cash_after_sell = cash_before + sell_net
realized_pnl    = sell_net − entry_buy_value − entry_buy_fee
NAV_end         = cash_end + Σ(qty_end × valuation_price)
```

Không trừ thuế hai lần nếu service trả phí/thuế bán gộp. Giá và tiền dùng đơn vị đồng/độ chính xác chuẩn hệ thống; không nhầm nghìn đồng. Cổ tức/quyền/điều chỉnh giá vốn, khối lượng và bút toán dùng cơ chế đã duyệt đang có; đợt này không sửa công thức cổ tức hoặc cộng hai lần quyền lợi với giá adjusted.

Danh mục và lịch sử dùng snapshot lúc quyết định, không form hiện tại. Có đầy đủ thời gian, mã, giá, qty, phí, tiền thuần, lãi/lỗ đã chốt/tạm tính, thời gian giữ, config revision quyết định, source lúc mua và lý do. Được phân trang/ảo hóa nhưng phải truy xuất toàn bộ. Nhật ký đọc được các lý do tập rỗng, không đạt, thiếu dữ liệu, vốn/lô, ngoài nguồn, đã giữ, giới hạn phiên; không phát sinh lý do stop/3-of-5/target mới.

---

## 9. 16 chỉ báo: hợp đồng cho form, chart và engine

Danh sách, IDs, mẫu điều kiện, miền tham số được trích từ `#registryData` và `#catalogData` của HTML đính kèm tại Phụ lục B. Không tự thay ngưỡng, đổi giao cắt/trạng thái hoặc thêm một chỉ báo vào lượt luyện.

Dùng cùng định nghĩa chỉ báo cho Bot, mini và Backtest; chỉ profile thực thi khác. Đối chiếu code/provider và bài học đã có bằng fixture trước khi chốt `calculation_version`. Mục này ghi lại biến thể **mà HTML đang dùng**, không khẳng định nó đã trùng provider IQX. Nếu repo khác, lập bảng chênh lệch/case, không âm thầm sửa mẫu, giáo trình hoặc lịch sử.

### 9.1. Quy ước tham chiếu tính chuỗi trong mẫu

C = close, H/L = high/low, V = volume, TP = (H+L+C)/3; N là chu kỳ; cửa sổ có/không T phải đúng từng dòng.

| Chỉ báo | Biến thể được dùng trong HTML, cần đối chiếu trước production |
|---|---|
| SMA | Trung bình N close, gồm T; đủ N số hợp lệ mới có giá trị. |
| EMA | Hạt giống là SMA của N quan sát đầu liên tục; sau đó alpha=2/(N+1). Mẫu reset seed khi thiếu dữ liệu. |
| RSI | Wilder: trung bình N mức tăng/giảm đầu, rồi smoothing 1/N; `100 × avg_gain/(avg_gain+avg_loss)`. Tổng hai trung bình bằng 0 → null. |
| MACD | EMA nhanh − EMA chậm; Signal là EMA của MACD; Histogram=MACD−Signal. |
| Bollinger | SMA_N(close) ± k × độ lệch chuẩn; mẫu chia phương sai cho N, gồm T. |
| Khối lượng | Ngưỡng `mult × trung bình V của N phiên trước T`, không gồm V_T; thêm rule chiều giá đã ghi. |
| MA Cross | Hai SMA riêng; đánh giá sự kiện giữa T−1/T, không chỉ vị trí hiện tại. |
| DMI | +DM/−DM theo thay đổi high/low, chọn phần dương lớn hơn, bằng nhau cho 0; True Range dùng close trước; làm mượt Wilder 1/N; +DI/−DI = 100 × DM đã mượt/TR đã mượt. Không thêm ADX. |
| Stochastic | Raw %K=100×(C−Low_N)/(High_N−Low_N), gồm T; SMA theo smooth tạo %K; SMA theo d tạo %D. Biên bằng nhau → null. |
| CCI | `(TP−SMA_N(TP))/(0.015×mean absolute deviation trong N TP)`, gồm T; độ lệch bằng 0 → null. |
| OBV | Bắt đầu 0; cộng V khi close tăng, trừ khi giảm, giữ khi bằng; baseline SMA của chuỗi OBV, gồm T. |
| MFI | Phân positive/negative TP×V theo TP tăng/giảm; tổng N dòng hợp lệ; `100×positive/(positive+negative)`; tổng bằng 0 → null. |
| CMF | Tổng `[(2C−H−L)/(H−L)]×V` trong N phiên / tổng V trong N phiên; mẫu H=L → null và cửa sổ có null không được cho qua. |
| Donchian | Upper=max high, Lower=min low của N phiên **trước T**, không gồm T; tính riêng cửa sổ Mua/Bán. |
| ROC | `(C_T/C_(T−N)−1)×100`, mẫu yêu cầu close gốc dương; unit giá trị là %. |
| Williams %R | `−100×(High_N−C)/(High_N−Low_N)`, cửa sổ gồm T; High_N=Low_N → null. |

Chuỗi có missing phải được xử lý theo contract đã được xác minh. Đặc biệt không sao `undefined` hoặc 0 của mock thành giá trị hợp lệ. Không dùng sáu tháng chart làm giới hạn dữ liệu khởi tạo; N tối đa 252 hoặc chuỗi EMA nhiều tầng có thể cần thêm dữ liệu. Cách lấy dữ liệu warmup phải được ghi version và đủ cho tham số mà form cho phép.

### 9.2. Chart riêng theo chỉ báo

| Nhóm | Hình bắt buộc |
|---|---|
| SMA, EMA | Giá nến + đường tương ứng |
| MA Cross | Giá nến + SMA nhanh/chậm |
| Bollinger | Giá + dải trên, đường giữa, dải dưới |
| Donchian | Giá + biên trên/dưới |
| MACD | Giá nến; vùng MACD gồm MACD, Signal, Histogram |
| RSI, MFI, Stochastic | Giá nến; vùng chỉ báo thang 0–100; Stochastic có %K/%D |
| DMI | Giá nến; vùng +DI/−DI |
| Khối lượng | Giá nến; cột V và đường ngưỡng khối lượng |
| OBV | Giá nến; OBV và SMA của OBV |
| CCI, ROC, CMF | Vùng chỉ báo có mốc 0 và ngưỡng đang xét |
| Williams %R | Vùng chỉ báo thang −100–0 |

Chart đang xem Mua hay Bán phải ghi rõ ở chú giải, dùng đúng params phía đó. Chuyển tab/đổi chu kỳ cập nhật chuỗi đúng; không để RSI14 hiển thị cho điều kiện RSI10. Mẫu chuyển xem từng phía thay vì vẽ đè hai bộ khó phân biệt. Dữ liệu dùng để vẽ, đánh giá và giải thích giao dịch phải cùng snapshot.

Lưu ý đối chiếu: `plotSpecs` v4 vẽ hai đường tham chiếu Stochastic 20/80 cố định dù ngưỡng trong form có thể đổi. Đây không phải ngưỡng thực thi cố định. Khi tích hợp phải phân biệt mốc tham khảo 20/80 với ngưỡng người dùng đã chọn; không ghi “đang lọc theo 20” khi rule là 25. HTML được giữ nguyên để bảo toàn bản duyệt, sai khác hiển thị/production được ghi công khai thay vì âm thầm sửa bản gốc.

---

## 10. Mini luyện tập — dữ liệu và luồng lượt

### 10.1. Mục đích và cổng truy cập

Mini để thấy giao dịch/lời lỗ khi dùng riêng chỉ báo đã học; không là bài thi hoặc cổng Bot. Có quyền chỉ báo thì luyện hoặc cấu hình Bot ngay. Không bắt đủ lượt, có lãi, trả lời câu hỏi hoặc thắng mua và giữ. Không tạo điểm thưởng/vốn từ lợi nhuận.

Một mini chỉ chứa **một chỉ báo**. Những thành phần thuộc chỉ báo đó (Signal MACD, SMA của OBV, kênh Donchian…) được giữ; không thêm chỉ báo khác hoặc lớp luyện hợp lưu. Bộ triển khai hỗ trợ đủ 16 chỉ báo bằng thuật toán riêng, không chỉ đổi tiêu đề RSI.

### 10.2. Một bộ dữ liệu và 30 mã

Một bộ luyện có mã phiên bản, khoảng quan sát, khoảng kiểm thử 24 tháng, lịch phiên, data/calculation/execution versions và 30 mã phân biệt. Danh sách thật cần được cung cấp/xác minh; `caseId` 1–30 trong mẫu là chuỗi tổng hợp, không mã VN30 thật. Nguồn 30 mã VN30 phục vụ luyện độc lập với VN30 Bot đang trade và danh mục riêng của người dùng.

Mỗi `(owner, indicator_id, practice_set_version)` lưu một permutation 30 mã tại server. Không xáo lại khi reload, đổi thiết bị, rời/đến màn, đổi params hoặc grant. RSI lượt 1 có thể là A; MACD lượt 25 có thể vẫn là A. Không cấm dùng cùng mã giữa hai chỉ báo. Không tự coi những lượt gặp lại giữa chỉ báo là kiểm định ngoài mẫu chưa biết dữ liệu.

Một mã một lượt có cấu hình bị khóa sau Bắt đầu. Có thể xem lại kết quả, không sửa rồi chạy lại mã đó. Hết 30 thì không tự quay đầu, không thêm mã bù. Việc phát hành bộ thời gian mới cần version riêng và quyết định rõ, không tự đổi bộ hàng ngày để reset số lượt.

### 10.3. Khoảng dữ liệu và phần hiển thị

Mẫu v4 đang dùng:

| Phần | Khoảng gốc bên trong mẫu |
|---|---|
| Quan sát | 01/01/2024–30/06/2024 |
| Chạy | 01/07/2024–30/06/2026, 24 tháng |
| Cửa sổ đang nhìn | Khoảng sáu tháng, mẫu 130 nến |

24 tháng là khoảng lịch cố định của bộ, không hardcode 504 hoặc số nến từ lịch giả để thay cho lịch nguồn. Phiên không giao dịch không tạo nến bù. Tính RSI/cửa sổ từ lịch sử trước quan sát khi cần, nhưng không mở thêm quá khứ warmup ngoài phạm vi được xem. Không dùng phần tương lai để tính seed hoặc vẽ quá khứ.

UI không hiện mã, tên công ty, logo/ngành nhận diện hoặc ngày/tháng/năm của cổ phiếu trong mini. Bỏ cả chữ “Cổ phiếu ẩn danh” và hai dải Quan sát/Kiểm thử ngày tháng. Nhãn **Kết quả 24 tháng**, số lượt và số phiên vẫn giữ. Mẫu định danh phiên kiểm thử đầu là Phiên 1, phiên quan sát ngay trước là Phiên 0 rồi các số âm; một convention phải dùng nhất quán ở chart, tooltip và giao dịch.

Không giấu mã/ngày của tài khoản thủ công/Bot/Săn mã vì điều này chỉ dành cho mini. Không lấy đồng hồ mẫu phía footer thành ngày lịch sử của bài luyện.

### 10.4. Kiểm soát dữ liệu chưa mở

Trước Bắt đầu, API chỉ trả phần quá khứ được xem và chuỗi chỉ báo tính từ dữ liệu hợp lệ. Không gửi toàn chuỗi 24 tháng rồi che bằng CSS. Không lộ mã thật/ngày lịch sử trong URL, query, filename, DOM/data attributes, payload, lỗi, tải xuống hoặc tooltip. Dùng ID lượt/tình huống mờ cho client; mapping mã và lịch thực lưu phía server.

Sau khi đã khóa cấu hình, có thể lấy kết quả đầy đủ từ server và phát lại bằng UI; đây không còn là dữ liệu dùng để chọn lại cấu hình của lượt. Muốn đảm bảo tiết lộ từng bước nghiêm ngặt thì API cấp từng phần theo contract đã chọn, không giả đã bảo mật bằng việc chặn slider. Không có khả năng bảo vệ danh tính trước người đọc mã nguồn trong HTML offline; production phải thay data access.

### 10.5. Trạng thái, retry và tiếp tục

| Trạng thái logic | Quy tắc |
|---|---|
| Chưa chạy / draft | Được chỉnh hai phía, tham số, dấu, thời gian giữ; chưa tiêu thụ thêm mã. |
| Bắt đầu | Server xác thực quyền/input/lượt, khóa config + dữ liệu/profile version trước trả tương lai; một run ID. |
| Đang tính | Dùng job thật nếu cần; lỗi/timeouts không cấp mã khác. |
| Sẵn kết quả, đang phát lại / tạm dừng | Khóa form; được chỉnh tốc độ, xem kết quả ngay; dừng phát lại không sửa job/kết quả. |
| Đã hoàn thành | Xem lịch sử và nhận xét; cho Tập luyện tiếp nếu chưa hết 30. |
| Đang xem lượt cũ | Chỉ đọc; có Về lượt hiện tại, không tạo lượt chạy mới. |
| Lỗi dữ liệu/tính toán | Giữ reservation/snapshot để retry khi phù hợp; không dùng kết quả giả hoặc tự đánh dấu xong. |

Một start đồng thời ở hai tab chỉ tạo một run; dùng khóa duy nhất theo owner+indicator+set+case/ordinal. Khóa config trước khi lộ kết quả, không để lỗi ghi sau trả response cho phép đổi lại params. Retry cùng idempotency key trả run đó. Lỗi trước khi giao dịch/lượt hợp lệ được tạo không làm mất một mã; lỗi sau khóa không cho đổi config khi đã nhận dữ liệu tương lai.

Tạm dừng/rời màn/reload giữ lượt; không tự chuyển mã. **Tập luyện tiếp** chỉ sau hoàn thành, tăng đúng một ordinal; bấm đôi không nhảy hai mã. Draft hiện tại có thể được giữ sang mã kế tiếp như HTML, không tự chọn cấu hình có lãi. Nút Mặc định chỉ đặt params/toán tử phía đang chỉnh; không reset thời gian giữ, Bot, tiền hoặc số lượt.

---

## 11. Mini — thực thi, kết quả và nhận xét

### 11.1. Profile riêng

| Thuộc tính | Mini |
|---|---|
| Vốn lượt | 100.000.000 đồng |
| Mua | 100% tiền khả dụng gồm phí, q hợp lệ lớn nhất, tiền lẻ giữ lại |
| Vị thế | Một mã, tối đa một vị thế; không mua thêm; bán toàn bộ |
| Tín hiệu | Cuối phiên ngày, tính đúng params và dấu của lượt |
| Khớp minh họa đã duyệt | Mở cửa phiên hợp lệ kế tiếp; không khớp ngược vào open của phiên vừa tạo tín hiệu |
| Stop/target/trailing | Không áp dụng |
| Giữ tối đa | 60 phiên mặc định, input số nguyên 1–1.000 trong mẫu, khóa cùng config |
| Cuối khoảng | Không ép bán; giữ vị thế chưa đóng và lệnh chưa khớp |
| Phí/lô/thanh toán | Có profile version tách Bot/thủ công; số mẫu nhận diện tại mục 14, xác minh tại mục 18 |

Đã có Mua nhưng chưa bật Bán vẫn chạy được. Hết thời gian giữ vẫn bán. Không có phía Mua thì không bắt đầu mini mua–bán; có Bán không tự mở bán khống.

Mẫu không dùng tín hiệu tại phiên quan sát cuối để khớp ngay mở cửa phiên kiểm thử đầu: khởi đầu kiểm thử trống vị thế/lệnh chờ, phiên kiểm thử đầu đánh giá close, sớm nhất mua ở open phiên sau. Giữ rõ quy ước này khi đối chiếu, không lặng lẽ đưa giao dịch vào trước khoảng.

### 11.2. Trình tự nến và thời gian giữ

Tại open phiên i, xử lý lệnh đã được tạo ở close trước đó theo giá/khối lượng/phí hợp lệ. Tại close i, định giá và xét điều kiện cho phiên tiếp theo. Mua ở open rồi xuất hiện Bán tại close chỉ tạo lệnh cho open phiên sau. Bán ở open rồi đủ điều kiện Mua tại close cũng chờ open sau, không mua/bán vòng lại ở open đã trôi qua.

Phiên khớp Mua là mốc giữ 0. Bán khớp ở chỉ số k thì `holding_sessions = k − entry_index`. Với max N, để khớp ở open `entry_index+N`, mô hình mẫu lập lệnh thời gian tại close `entry_index+N−1`.

```text
while_position_at_close_i:
  time_due = (i − entry_index + 1 >= N)
  if sell_indicator_met OR time_due:
     schedule SELL_ALL for next valid open within the test window
```

Ví dụ Mua tại Phiên 10 và N=60 → lịch thoát thời gian tại open Phiên 70, thời gian giữ 60; quyết định được lập ở close Phiên 69. Đây là nghiệp vụ lịch sử theo phiên, không 60 ngày lịch. Nếu chỉ báo Bán đạt sớm hơn thì bán sớm. Nếu cả hai cùng đạt, một Bán; mẫu chọn lý do chính **Điều kiện chỉ báo**, đồng thời lưu cờ đến hạn. Không ghi hai giao dịch.

Thiếu dữ liệu chỉ báo Bán không vô hiệu hóa thời hạn, nhưng vẫn cần giá khớp/sổ sách/profile hợp lệ. Trần thời gian là lịch cố gắng thoát trong mô hình, không bảo đảm mọi cổ phiếu thực sự khớp đúng hạn khi ngừng giao dịch/thiếu open. Không bịa giá hoặc chuyển sang close để khớp cho đủ 60; trạng thái này phải được xử lý trong hợp đồng feed/profile trước nghiệm thu.

Tín hiệu hoặc hạn giữ ở cuối khoảng nhưng không còn open trong 24 tháng → lệnh chờ/chưa khớp. Không mở dữ liệu ngoài khoảng để hoàn tất, không thanh lý tự động. Người dùng chọn N lớn hơn số phiên còn lại thì vị thế có thể còn mở, đúng điều kiện họ chọn.

### 11.3. Kết quả tối giản

Chỉ hai ô:

| Nhãn | Định nghĩa |
|---|---|
| Tổng lợi nhuận | `(cash_end + giá trị vị thế cuối kỳ) / capital_initial − 1`; giao diện %. Bao gồm phí giao dịch đã phát sinh. |
| Số giao dịch | **Số lần Mua đã khớp**, không số tín hiệu, không cộng lần Bán, không chỉ vòng đã đóng. |

Không thêm CAGR, Sharpe, tỷ lệ thắng, max drawdown, mua và giữ hoặc điểm chiến lược vào vùng tổng hợp mini. Điều này không xóa sáu chỉ số của Backtest đầy đủ.

```text
entry_total = qty × entry_price + buy_fee
exit_net = qty × exit_price − sell_costs
pnl_closed = exit_net − entry_total
pnl_open = qty × last_valid_close − entry_total
return_trade = pnl / entry_total
return_portfolio = NAV_end / initial_capital − 1
```

Không cộng phần trăm từng lệnh. Không trừ phí bán chưa phát sinh rồi gọi là lời/lỗ đã chốt. Ở profile cơ bản một vị thế, số Mua phải bằng số vòng đã đóng + số vị thế mở; lệnh chờ Mua chưa khớp không được đếm. Khi thiếu dữ liệu định giá cuối kỳ không giả hiện Tổng lợi nhuận 0%.

### 11.4. Chart và toàn bộ lịch sử

Chart nến thật của tình huống, giá không chuẩn hóa tùy tiện; hiển thị vùng khoảng sáu tháng, cuốn trong phần đã mở. Tất cả giao dịch/kết quả tính trên đủ 24 tháng. Có mũi tên M/B gắn số giao dịch, slider, pause/tốc độ/đi tới kết quả. Hình dùng đúng chuỗi chỉ báo của tab hiện tại; không vẽ tương lai trước start hoặc autoscale theo tương lai làm lộ giá.

Bảng giữ: số thứ tự; Phiên mua; Giá mua; Phiên bán/Đang giữ; Giá bán; **Thời gian giữ**; **Lãi/lỗ % và số tiền**; điểm xem chi tiết. Khối lượng nằm trong dòng/phần chi tiết như HTML. Lý do Bán phân biệt Điều kiện {chỉ báo} và Hết thời gian giữ. Vị thế mở hiện Tạm tính, không tự đặt ngày Bán.

Bấm dòng/điểm giao dịch mở điều kiện ở phiên quyết định: chu kỳ/params, vế trái/phải, dấu, giá trị T−1/T khi dùng, trạng thái mỗi rule, thời gian giữ, phí và phiên khớp. Có Xem điểm Mua/Bán để chuyển chart. Không tính lại bằng form đang xem hoặc giá hiện tại. Toàn bộ lịch sử phải truy cập được, không chỉ vài lệnh có lãi.

### 11.5. Nhận xét viết sẵn

Dùng các đoạn mẫu và quy tắc xác định từ kết quả, không gọi AI để tạo nhận xét theo lượt, không thêm điểm đỗ/trượt. Chủ sản phẩm có thể thay văn bản mà không đổi phép tính. Giữ `comment_rule_id`/version và các số được nội suy để xem lại đúng.

Logic `commentFor` trong HTML hiện gồm:

| Ưu tiên | Trường hợp | Nội dung/chỉ tiêu dùng |
|---|---|---|
| 1 | Không có Mua, có lần thiếu tiền một lô | Điều kiện xuất hiện nhưng không đủ tiền sau phí; chưa mở vị thế. |
| 2 | Không có Mua khác | Điều kiện đã chọn chưa tạo lần Mua trong giai đoạn. |
| 3 | Có Mua, chưa đóng vòng nào, còn vị thế | Đã có Mua chưa có Bán; kết quả gồm lãi/lỗ tạm tính. |
| 4 | Các trường hợp còn lại | Giá trị cuối >, < hoặc bằng vốn đầu; số lần Mua, số đã bán. |
| Phụ | Có vòng đóng vì hết thời gian | Nêu số vòng và phân biệt không phải tín hiệu chỉ báo. |
| Phụ | Vị thế còn mở | Nêu kết quả có phần chưa chốt. |

Đây là bộ nhận xét **tham chiếu trong HTML**, chưa phải cam kết đã có thư viện biên tập đầy đủ. Nếu feed/engine lỗi hoặc thiếu dữ liệu, trả lỗi/chưa đủ dữ liệu; không dùng câu “điều kiện không tạo Mua” để che lỗi. Không chọn đoạn “có lãi” theo số đã làm tròn hoặc đánh giá rằng chỉ báo tốt chỉ vì một lượt có lãi.

---

## 12. Khung Học viện và liên kết Chiến lược

### 12.1. Catalog khung

Dùng 13 chương/71 bài tại Phụ lục A: 16 chỉ báo kỹ thuật, 42 chỉ tiêu cơ bản, 12 bài hướng dẫn (Chương 2/4), 1 Hợp lưu. 30 lượt của mỗi chỉ báo không tính thành bài; không tạo thêm chương cho mini hoặc một Bot theo chương.

Bài kỹ thuật đã hoàn thành mở capability ở Bot/Backtest/Cảnh báo theo quyền; bài cơ bản mở chỉ tiêu Bộ lọc. Học xong không bật điều kiện, không tự chạy Bot, không áp danh mục. Mini không là bài thi và không thay tiến độ.

Cách hoàn thành để chuẩn bị schema: kiến thức kỹ thuật/cơ bản và Hợp lưu giữ kiểm tra 8 câu đạt 8/8 theo nội dung được duyệt; Chương 2/4 là hướng dẫn, dùng Hoàn thành bài học không kiểm tra. **Bộ Bot không tạo đề/đáp án hoặc engine cấp quyền giả.** Nhận tiến độ/grant từ service có thật; chỗ nội dung chưa xuất bản chỉ có tên/trạng thái, không bấm pass để lấp khoảng thiếu.

Học viện chỉ Xem bài và ✓ Đã học. Có thể đọc lại bài hoàn thành. Renderer phải có điểm ghép văn bản/công thức/bảng/chart/quiz sau, không lấy phần placeholder của HTML ghi đè các bài Chương 1–3 đang có.

### 12.2. Tên và ánh xạ phiên bản

Capability ID ổn định; ID bài theo version catalog. **Không map đơn thuần bằng vị trí `ch07-l01`**, vì ở bản cũ là ATR nhưng mới là OBV. `registryData` v4 giữ `lesson_id/chapter` gốc và thêm `new_lesson_id/new_chapter`; UI dùng trường new. Khi tích hợp phải lập bảng mapping theo capability và catalog_version, không dùng field cũ để cấp nhầm quyền.

Phụ lục C chỉ rõ mapping 16 bài và các chương thay số. Những bài cắt khỏi lộ trình mới vẫn giữ lịch sử legacy, không hiện thành mục khóa “sắp có” và không tự cấp quyền thay thế. Nguyên tắc giữ tiến độ không có nghĩa gán bài cũ khác nội dung vào bài mới trùng ID.

### 12.3. Điểm nối ba bộ giao phẩm

| Phần khác | Hợp đồng của bộ Bot | Không làm ở đợt Bot |
|---|---|---|
| Học viện | Nhận catalog/progress/grants; điểm mở bài, quay lại; không giao dịch ở sidebar | Viết toàn văn bài, quiz và chart giảng dạy |
| Bộ lọc | Nhận danh mục/result snapshot hợp lệ, ownership/quyền chỉ tiêu; apply nguồn mua/Về VN30 | Viết lại 42 công thức tài chính và toàn UI Bộ lọc |
| Backtest đầy đủ | Cùng registry và cấu hình đã lưu, snapshot độc lập; không chuyển tiền/lệnh | Dựng lại Backtest, tối ưu tham số, áp trần 30 lượt/24 tháng/60 phiên vào Backtest |
| Cảnh báo | Snapshot điều kiện, không tạo lệnh Bot/stop; cùng capability | Làm thêm kênh gửi thông báo/worker Cảnh báo mới |
| Săn mã/Theo dõi | Giữ nguồn hiện có, hoạt động độc lập | Dùng làm nguồn Bot hoặc ép học chỉ báo trước dùng |

Backtest đầy đủ giữ nghĩa Số giao dịch là vòng đã đóng theo spec hiện có; mini đếm lần Mua. Payload cần đặt tên trường rõ (buy_count, closed_trade_count), không dùng một field mơ hồ để làm sai tỷ lệ thắng. Bộ Chiến lược sau phải sửa các câu cũ “Học viện chỉnh config”, “stop L1” và “Săn mã là nguồn Bot” cho khớp bản này, nhưng không xây lại sản phẩm trong đợt Bot.

---

## 13. Dữ liệu, API và an toàn tích hợp

### 13.1. Không áp tên endpoint/bảng giả

Tái sử dụng cấu trúc thật phù hợp; các tên dưới là hợp đồng logic, không chứng minh endpoint/table đã tồn tại. AI dev tự tìm trong repository, không bắt chủ sản phẩm đoán đường dẫn.

| Đối tượng | Nội dung tối thiểu |
|---|---|
| Tài khoản | owner, account_type (manual/bot), initial funding ID duy nhất, tiền, số dư chờ/khả dụng theo profile |
| Bot | bot/account ID, mascot ref, trạng thái cấu hình và worker, policy version |
| Catalog/grant | catalog version, lesson ID, capability ID, content status, completed, grant thật và registry version |
| Cấu hình | indicator ID, master, Mua/Bán params/rule IDs/operators, saved/effective revision, actor và phiên hiệu lực |
| Nguồn mua | kind vn30/custom, source ID/version, tập mã hiệu lực/snapshot, requested/effective session, owner và source provenance |
| Vị thế/giao dịch | qty, cost/fees, mã, entry và decision revision, entry source, dữ liệu quyết định/khớp, reason, execution ID |
| Lượt Bot | khóa account+phiên, policy/config/universe/data snapshot, NAV_basis, blocked symbols, số mua, bước đã commit, lỗi |
| Lệnh thủ công | order ID, phía, mã, type, limit, qty, reserve, filled/remaining, trạng thái và các thời gian thật |
| Theo dõi | owner+symbol duy nhất, thời điểm thêm/bỏ; không vị thế/tiền |
| Bộ luyện | set_version, indicator support, 30 case IDs mapping server, observation/test period, data/profile/calculation versions |
| Tiến trình luyện | owner+indicator+set, thứ tự server, cursor, drafts, run IDs/trạng thái |
| Run mini | run ID, owner, ordinal/case opaque, config+hold đã khóa, request key, data/profile versions, outcome immutable |
| Kết quả mini | buy_count, closed_trade_count, NAV/return, events/trades, open/pending, condition evidence, comment version |

Mẫu `ops` là mảng theo vị trí; production nên map thành các `rule_id` ổn định trong version, không để reorder registry làm dấu Mua áp sang dòng khác. Không nhận schema/tên bản tính do client tự tạo để bypass validation.

### 13.2. Hợp đồng ghi quan trọng

| Nghiệp vụ | Đầu vào có ý định | Server trả/giữ |
|---|---|---|
| Lưu config | patch chỉ báo/hai phía, expected_revision, request key | bản xác nhận, phiên hiệu lực, phiên bản schema/rule/calculation |
| Apply danh mục | ID/version nguồn hợp lệ, selection/tập chọn có thể kiểm chứng, expected universe revision | snapshot nguồn pending, ID bản, phiên hiệu lực; không lệnh |
| Về VN30 | ý định source kind vn30, revision, request key | nguồn pending; giữ vị thế |
| Start mini | indicator, set, reserved case/ordinal opaque, config/hold, request key | run ID đã khóa; trạng thái tính hoặc kết quả đúng snapshot |
| Next mini | run đã xong, expected cursor, request key | đúng case kế tiếp không lặp |
| Theo dõi | symbol hợp lệ, trạng thái thêm/bỏ có chủ đích | trạng thái theo dõi đã lưu |
| Đặt/hủy lệnh | tài khoản từ auth, order input hoặc order ID, request key | trạng thái thật; không tin số dư client |

Dùng server time/lịch thật; timestamp ghi nhận khác ngày dữ liệu/phiên tín hiệu/phiên khớp. Không sửa thời gian ghi để giả đã biết tín hiệu trước. Không công khai mapping lịch sử của mini qua payload dùng chung với Bot.

### 13.3. An toàn và đồng thời

Phân quyền từng read/write theo owner và loại tài khoản; kiểm tra grant phía server. XSS: escape tên danh mục, mã, nhãn và lỗi, đặc biệt `< > ∈ ∉`; không chạy HTML/script từ nguồn. Không log token/password/cookie hay mapping tình huống ẩn cho người dùng. Không dùng localStorage làm nguồn quyền/vốn/lệnh production.

Ghi có concurrency control/idempotency; tab cũ không đè bản mới. Cache có key đủ owner ở dữ liệu riêng, symbol/period/params/price basis/calculation/data versions; API response cũ không ghi đè tab/phiên cấu hình mới. Retry giữ snapshot đã commit, không xáo 30 mã lại.

Hiệu năng: dùng chung indicator service có version, cache chuỗi theo params; không tính lại 24 tháng mỗi frame phát nến. Kết quả/giao dịch tính từ dữ liệu đầy đủ; nếu giảm mẫu chart không được giảm mẫu điều kiện/KPI. Bảng có phân trang vẫn truy xuất toàn bộ.

---

## 14. HTML tham chiếu và phần không đưa nguyên vào production

### 14.1. Nhận diện file

- Nguồn đã duyệt: `IQX-Bo-Bot-Khung-Va-Luyen-Tap-MAU-v4.0.html`.
- File gửi dev: `IQX-Bo-Bot-MAU-v1.0.html`, sao chép nguyên byte.
- Kích thước: **258.367 byte**.
- SHA-256: **`ca3fb11834939db45eb3cdf2b679fbf775ae298d7d540943a8d82669b4703b47`**.
- CSS/JS/registry/catalog/ảnh tham chiếu đều nhúng. Không cần thư mục asset riêng để xem.
- `#registryData`: 16 bộ rule/params; `#catalogData`: 13 chương/71 tên bài; `#mascotAsset`: hình Bạch Hổ mẫu.
- Các hook `window.IQX_BOT_PREVIEW`, footer scenario, nút phiên và tình huống chỉ dùng kiểm tra local.

### 14.2. Bảng chuyển từ minh họa sang dữ liệu thật

| Trong HTML | Việc production phải làm |
|---|---|
| `freshState`, `scenario=core/all`, `completedIds` | Tạo/tìm tài khoản đúng một lần; nguồn học/grant thật; không mặc định đã học. |
| `syntheticBars`, `makeDates`, random case | Nến/lịch có provenance; không coi bỏ cuối tuần và một ngày lễ là calendar thị trường. |
| `VN30_FIXTURE` và 35 công ty hardcode | Nguồn thành phần VN30 và catalog cổ phiếu có phiên hiệu lực; không coi danh sách mẫu là VN30 hiện tại. |
| `SAVED_LISTS`, tên/tiêu chí/số liệu mẫu | API danh mục/kết quả người dùng, quyền và snapshot; không seed cho mọi tài khoản. |
| Một `PROFILE` fee/lot dùng nhiều nơi | Profile thực thi thủ công/Bot/mini riêng; không trộn quy tắc. |
| Phí mua 0,15%, bán gộp 0,25%; lô 100, bước giá 100 | Chỉ là tham số minh họa; xác minh cấu hình thực, không xác nhận quy định môi giới. |
| LO khớp toàn bộ tại quote, chưa T+/thanh khoản | Tái sử dụng engine thủ công, reserve/cancel/settlement đúng. Không thay bằng `matchManual`. |
| `processBot` tính local, `lastRun` và nút Phiên tiếp theo | Worker+lock+ledger+readiness thật. Không cho client tiến lịch hoặc gọi tạo giao dịch tùy ý. |
| `resultFor` tái tính mock từ run config | Giữ kết quả/bằng chứng bất biến, có data/version; không tái tính lịch sử theo latest. |
| Mảng 30 mã/nến nằm trong JS | Server giữ mapping, lịch thật và dữ liệu trước start chưa mở. |
| `huntRows` có danh sách fixture | Service Săn mã hiện hữu; không thay bằng random hoặc kết quả giả. |
| Một Bạch Hổ, một tên tài khoản, ngày mẫu | Dữ liệu/mascot người dùng, không hardcode đại trà. |
| Placeholder bài và trạng thái all | Ghép bài đã duyệt nếu có; không viết 71 bài hoặc grant giả trong đợt Bot. |
| Nút CHIẾN LƯỢC chỉ mở modal danh mục mẫu | Giữ route thật và ba tab; modal là điểm chọn nguồn ở Bot. |
| Footer mẫu, Tình huống danh mục, Đặt lại mẫu | Không có trong bản người dùng thật; không cấp tiền/xóa lịch sử để demo. |
| `commentFor` | Bộ nhận xét có phiên bản, dữ liệu lỗi không bị diễn giải thành hiệu quả chiến lược. |

### 14.3. Sai khác/giới hạn nhận diện, không sửa ngầm HTML đã duyệt

Giữ byte nguồn không có nghĩa mọi shortcut JS trở thành quy tắc chuẩn. Các lựa chọn chưa được xác minh phải được ghi và giải quyết trong quá trình tích hợp: thuật toán/seed provider; mốc Stochastic 20/80; ngày/30 mã; phí/lô/thanh toán; thứ tự ứng viên Bot; quy tắc linh thú khởi đầu; quyền scenario; lịch sử run tính lại cục bộ.

Đặc biệt bản mẫu ghi rõ thứ tự GTGD20/mã là phương án mẫu; không nâng thành quyết định production chỉ vì nút Phiên tiếp theo chạy được. Mẫu giới hạn thời gian giữ 1–1.000 là miền input tham chiếu; backend phải có miền công bố tương ứng, không tự coi 1.000 là quy định thị trường hoặc phải kéo dài bài vượt 24 tháng.

---

## 15. Chuyển đổi và bảo toàn dữ liệu

### 15.1. Audit trước ghi

Xác minh commit/build và routes dùng thật; tìm toàn bộ cổng trứng/cấp/graduate, triggers cấp vốn, worker V1/V2, stop/target/trailing defaults, source Săn mã, nguồn config/grant, lệnh và bút toán đang chờ. Lập ma trận giữ/sửa/loại bỏ với file/hàm/bảng thực. Không bắt chủ sản phẩm tự tìm endpoint có thể đọc trong repo.

Chuyển thẳng bản mới; không yêu cầu triển khai các spec cũ trước. Ngắt những triggers cũ có thể chạy song song trước cutover. Cấu hình/policy/danh mục mới dùng mốc phiên rõ; một run đã pin không đổi giữa chừng.

### 15.2. Nhóm dữ liệu

| Hiện trạng | Chuyển đích |
|---|---|
| Chưa trứng/đang ấp/chưa tốt nghiệp | Bỏ cổng; có Học viện/linh thú theo nghiệp vụ mới; tạo tài khoản chưa có bút toán đúng một lần, không giả hoàn thành học. |
| Có Bot/tài khoản/vốn | Tái sử dụng, không tạo Bot thứ hai hoặc cấp thêm 100 triệu. |
| Vị thế từ Bot cũ | Giữ qty/cost/fees/quyền lợi/lịch sử. Từ policy mới chỉ xét Bán theo cấu hình hợp lệ; stop cũ không tiếp tục chạy. |
| Người dùng đã lưu chỉ báo còn trong 16 | Bảo toàn lựa chọn có bằng chứng, map rule/ID/version; không tự bật từ số bài học. |
| Chỉ báo đã bị loại/không map an toàn | Giữ snapshot/bằng chứng legacy, báo cấu hình cần điều chỉnh; không bỏ rule rồi chạy phần còn lại. |
| Học/quiz cũ có dữ liệu xác minh | Map theo đúng bài/capability và catalog_version tại Phụ lục C, không theo số thứ tự đơn thuần. |
| Lệnh tự giao dịch/cổ tức đang chờ | Giữ theo đúng engine tài khoản thủ công; không hủy vì bỏ trứng hoặc đổi Bot. |
| Theo dõi và danh mục đã lưu | Giữ owner và danh sách; chưa áp thì không tự chuyển thành nguồn Bot. |

Không phục hồi stop còn thiếu, không yêu cầu thêm L1 để bán/mua theo bản mới. Ngược lại giữ dấu vết stop/target của giao dịch cũ cho lịch sử, không drop cột mà run cũ còn tham chiếu. Không backfill quyết định mới vào thời điểm giá từng chạm stop/target trong quá khứ.

Tài khoản chưa có cấu hình Mua được xác minh → không mua mới; không chuyển chiến lược V1 chuẩn thành một indicator ON. Danh mục mua mặc định chuyển VN30 từ phiên policy mới; danh mục custom chỉ khi có ý định áp dụng hợp lệ, không lấy watchlist làm ý định đó.

### 15.3. Cutover, backup và rollback

Backup/dry-run, số lượng tài khoản/bút toán/positions/orders/grants trước-sau, mapping và ngoại lệ. Run đã commit không xóa/đảo ngầm. Khóa account+phiên giữ qua thay policy/revision để không cấp hai lần hạn mức. Rollback cần kế hoạch/phê duyệt, không tự khôi phục tự mua V1, stop L1 hoặc Săn mã nguồn Bot như cách xử lý lỗi frontend.

Không để hai scheduler cũ/mới cùng ra lệnh. Không seed tình huống CMG/DGC, dữ liệu `confirmExample`, hoặc permission “all” vào production. Nếu không đủ quyền triển khai, bàn giao code/test và nói rõ chưa bật hệ thống thật.

---

## 16. Ca kiểm thử nghiệm thu

**Các ca dưới đây là yêu cầu dev thực hiện trên repository/môi trường được cấp quyền, không phải kết quả đã đạt trên IQX.** Dữ liệu số là fixture; không thay phí/lô/lịch thật. Mỗi ca cần input, expected/actual, file/hàm test, câu lệnh và môi trường. Không cần file JSON/README kiểm thử do chủ sản phẩm gửi thêm.

### G. Khởi tạo, giao diện và phạm vi

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| G01 | Tài khoản mới chưa có trứng/cấp/graduate. | Mở onboarding/Học viện/Bot/Đặt lệnh/Săn mã. | Không có cổng trứng; linh thú/khung hiện ngay theo nguồn đã chốt, không tự mở grant hoặc giao dịch. |
| G02 | Hai request khởi tạo đồng thời; chưa funding. | Ensure cả tài khoản thủ công và Bot. | Mỗi loại đúng một tài khoản và một bút toán 100 triệu; không chia sẻ số dư. |
| G03 | Tài khoản có giao dịch, số dư khác 100 triệu. | Reload/onboarding lại/học thêm chương. | Không reset/bù/cấp lại vốn hoặc tạo Bot mới. |
| G04 | Asset linh thú tải lỗi. | Vào Học viện và đặt lệnh. | Fallback; quyền/tài khoản/lệnh không phụ thuộc hoạt ảnh. |
| G05 | Cả 16 chỉ báo chưa mở. | Đọc Bot, giả payload unlocked từ client. | Khóa đúng grant thật; không mua dự phòng hoặc mở quyền từ localStorage. |
| G06 | Đã có quyền RSI, master/side OFF. | Mở Bot và bấm Xem bài. | Chỉ hiển thị, không kích hoạt giao dịch. |
| G07 | Đang luyện, mở Học viện/Đặt lệnh rồi quay lại. | Điều hướng, pause và tiếp tục. | Rail còn; ngữ cảnh và lượt không đổi; form/điều kiện không tự ghi vào Bot. |
| G08 | Viewport 360/390/900/1024/1440px. | Mở Bot, mini, modal, bảng và panel. | Không tràn ngang toàn trang; rail và nút dùng được; bảng cuộn nội bộ. |
| G09 | Dùng bàn phím, Escape, tab Mua/Bán, modal. | Thao tác cả mở/đóng/chỉnh. | Có focus và label, trạng thái đúng, không mất draft hoặc thao tác nền bị che. |
| G10 | Header/route và chức năng ngoài phạm vi đã chạy. | Mở Chiến lược/Bảng giá/Tin tức/link journey cũ. | Giữ route/tham số/chức năng thực, không thay bằng modal/toast mẫu hoặc phát lại nở. |

### D. Đặt lệnh tự giao dịch

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| D01 | Chưa học và Bot chưa có Mua. | Đặt lệnh thủ công hợp lệ. | Được nhận; không đòi bài học/trứng hoặc checklist cũ. |
| D02 | Tiền/khối lượng khả dụng đủ, lệnh có xác nhận. | Nhấn Đặt rồi Hủy xác nhận. | Không tạo lệnh, không giữ chỗ tiền/CP. |
| D03 | Lệnh Mua đã xác nhận nhưng chưa khớp. | Đọc sổ lệnh/tiền. | Chờ khớp, giữ chỗ gồm phí; không gọi đã mua hoặc đưa vào vị thế trước fill. |
| D04 | Hai lệnh chờ cần cùng một số tiền. | Gửi đồng thời vượt tiền thực. | Không nhận tổng reserve vượt khả dụng; không tiền âm. |
| D05 | Hai lệnh Bán cùng CP khả dụng. | Gửi đồng thời. | Không reserve/bán vượt CP có thể bán, không bán khống. |
| D06 | LO Mua thấp hơn giá có thể khớp / LO Bán cao hơn. | Nhận dữ liệu giá. | Không khớp bất lợi hơn limit; không dùng giá cũ để giả fill. |
| D07 | Hủy lệnh và fill xảy ra đồng thời. | Xử lý retry cả hai. | Trạng thái nguyên tử; phần đã fill giữ, phần chưa fill chỉ giải phóng reserve một lần. |
| D08 | Repo có lệnh khớp từng phần/sửa lệnh. | Chuyển UI mới. | Giữ khả năng hiện có và khối lượng còn lại; không xóa do mock thiếu trạng thái. |
| D09 | CP/tiền chờ thanh toán trong tài khoản thủ công. | Thử bán hoặc dùng tiền chưa khả dụng. | Theo profile thủ công; không áp giả định Bot/mini không khóa. |
| D10 | Bot mới có tiền riêng 100 triệu, tài khoản thủ công gần hết tiền. | Gửi lệnh thủ công. | Không dùng tiền Bot; không áp 12%/hai mua của Bot lên lệnh này. |
| D11 | Lệnh đã fill với fee/qty được xác minh. | Retry sự kiện fill. | Không ghi trùng trade/cash/qty; giá vốn và phần lời/lỗ đúng hệ thống. |
| D12 | Nguồn quote lỗi/stale hoặc giá/lô sai. | Đặt lệnh qua UI và API trực tiếp. | Lỗi đúng nguyên nhân; không mock/zero phí/step100 thay contract; giữ draft hợp lệ. |

### H. Săn mã và Theo dõi

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| H01 | Chưa học/chưa bật Bot. | Mở năm nhóm Săn mã. | Hoạt động độc lập, dùng nguồn hiện có. |
| H02 | Khối ngoại mua ròng đúng 3/5 phiên, tổng dương. | Đối chiếu service cũ sau bỏ trứng. | Giữ tiêu chí 3/5 PHIÊN; không nhầm với cổng 3/5 lớp AI đã bỏ. |
| H03 | Một mã ở nhiều nhóm. | Tích Theo dõi ở hai nơi/retry. | Một mục theo dõi theo owner; checkbox đồng bộ. |
| H04 | Đã Theo dõi và đang nắm giữ mã đó. | Bỏ theo dõi. | Không bán vị thế hoặc đổi nguồn Bot. |
| H05 | Mã hôm qua được Theo dõi, hôm nay không còn đạt Săn mã. | Refresh dữ liệu. | Mã vẫn nằm trong danh sách quan sát. |
| H06 | Danh mục theo dõi có A/B, Bot dùng VN30. | Thêm/bỏ A/B rồi xử lý Bot. | Không tự đổi danh mục mua mới. |
| H07 | Lỗi lưu hoặc người B gửi ID theo dõi của A. | Tích Theo dõi/giả request. | Không báo lưu thành công; không đọc/sửa dữ liệu người khác. |

### U. Danh mục mua mới

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| U01 | Bot mới không có danh mục riêng. | Đọc nguồn hiệu lực. | VN30 từ service có hiệu lực; không lấy fixture làm thành phần thật. |
| U02 | Danh mục nguồn hợp lệ thuộc owner, gồm A ngoài VN30. | Áp dụng có xác nhận. | A được giữ trong tập, không giao với VN30; không tạo lệnh ngay. |
| U03 | Apply chỉ chọn một phần các mã hợp lệ. | Lưu và đọc pending. | Đúng tập được chọn, không cộng các mã bỏ chọn. |
| U04 | Nguồn nhiều trang, chọn toàn bộ. | Áp dụng từ result/list ID. | Đủ mọi trang cùng cutoff; không chỉ trang đầu. |
| U05 | Tập chọn rỗng. | Gửi Apply. | Từ chối, giữ nguồn cũ; không tự về VN30. |
| U06 | Apply danh mục riêng đang pending. | Xử lý phiên ngày lưu rồi phiên hiệu lực. | Phiên ngày lưu dùng nguồn cũ, phiên hợp lệ ngày sau dùng bản mới. |
| U07 | Pending chưa tới hiệu lực. | Hủy thay đổi rồi retry. | Giữ nguồn hiệu lực và vị thế, hủy đúng revision một lần. |
| U08 | Bộ lọc/ngày báo cáo mới cho danh sách khác. | Chưa áp dụng lại, chạy Bot. | Tập custom hiệu lực không tự đổi. |
| U09 | Bot đang giữ A từ custom, A ngoài VN30. | Về VN30, Bán chưa đạt. | Tiếp tục giữ A, không tự bán/tái cân bằng/reset cost. |
| U10 | Như trên, cấu hình Bán hiệu lực đạt ở A. | Chạy lượt. | Bán A dù ngoài nguồn mua; không cần dữ liệu của VN30 A không thuộc. |
| U11 | A đã bán và ngoài nguồn mua hiện tại, lại thỏa Mua. | Chạy phiên tiếp theo. | Không mua lại A cho tới khi A thuộc nguồn hiệu lực. |
| U12 | Danh mục A đang dùng, áp danh mục B. | Qua phiên hiệu lực. | B thay A cho mua mới; không hợp hai danh mục, không ảnh hưởng vị thế cũ. |
| U13 | Nguồn VN30/custom unavailable nhưng giá/chỉ báo Bán đủ. | Worker chạy. | Không mua/fallback nguồn; vẫn xét Bán mọi vị thế đủ dữ liệu. |
| U14 | Một mã rời/thêm VN30 theo phiên dữ liệu. | Chạy trước/sau hiệu lực. | Tập mua đúng từng phiên; vị thế mã rời chỉ tiếp tục xét Bán; lịch sử không bị viết lại. |
| U15 | Hai tab đổi nguồn cùng revision hoặc xóa danh mục đang áp. | Lưu/cancel/delete. | Conflict/xác nhận nguồn khác rõ; không âm thầm mở về VN30 hay mất snapshot. |
| U16 | Nguồn danh mục người khác hoặc chỉ tiêu chưa có grant. | Giả Apply API. | Server từ chối; không lấy facts hoặc quyền client làm bằng chứng. |

### C. Cấu hình và quyền chỉ báo

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C01 | RSI Mua14/ngưỡng30, Bán10/ngưỡng75. | Đổi Mua12 và lưu. | Bán10/75 giữ nguyên, giá trị/cache hai phía độc lập. |
| C02 | Master OFF, hai phía OFF. | Bấm bật master rồi Hủy form. | Không lưu master ON hoặc side ON. |
| C03 | Master OFF, Mua ON được lưu trước. | Bật master. | Giữ Mua ON, Bán theo lựa chọn cũ; không bật cả hai hoặc reset số. |
| C04 | Master OFF, vào Cấu hình sửa tham số. | Lưu. | Master vẫn OFF; chỉ tạo revision params có chủ đích. |
| C05 | Master ON; tắt cả hai side. | Lưu. | Master OFF, tập rỗng false; không mua/bán ngầm. |
| C06 | Đã sửa Mua và Bán trong draft. | Đặt lại tab Mua rồi Lưu. | Chỉ params/ops Mua về mẫu; giữ enable Mua và toàn bộ Bán. |
| C07 | Draft chưa lưu. | Chuyển tab Mua/Bán rồi Escape, từ chối bỏ. | Giữ đủ draft; không tự commit hoặc mất phía kia. |
| C08 | Một phía ON nhưng rule rỗng, NaN, Infinity, sai bước, unknown key hoặc toán tử. | Gửi API bỏ qua UI. | Từ chối theo registry server; không clamp/đảo dấu tự động. |
| C09 | Một điều kiện Mua đổi > thành <. | Tính với dữ liệu chỉ thỏa <. | Dùng dấu đã lưu, không ép theo tên phía. |
| C10 | AND hai rule/chỉ báo: một đúng một sai. | Đánh giá. | Không đạt; không đa số hoặc tự bỏ rule sai. |
| C11 | AND có dữ liệu thiếu; phía còn lại không cần dữ liệu đó. | Đánh giá Mua và Bán. | Phía thiếu null/không tạo lệnh; phía đủ vẫn đánh giá được. |
| C12 | Bollinger lower=10,upper=20,C=10. | Tính ∈ và ∉. | ∈ false, ∉ true với khoảng mở hợp lệ; đổi lower=null → cả hai chưa đánh giá được. |
| C13 | Thay chu kỳ có hiệu lực. | Đọc T−1 và T. | Cùng params mới cho cả cặp; không ghép T−1 tính theo params cũ. |
| C14 | Lưu config trước/trong/sau phiên ngày D. | Đọc saved/effective và xử lý D. | Có hiệu lực từ phiên hợp lệ ngày >D; không lệnh ngay khi Lưu. |
| C15 | Hai thiết bị cùng expected_revision. | Lưu đồng thời/retry. | Một bản hợp lệ, request stale conflict; retry không nhân revision. |
| C16 | Đạt bài/mini xong nhưng chưa bật Bot. | Xử lý sự kiện và refresh. | Grant không kích hoạt, mini không thêm grant/tiền; tài khoản vẫn chờ. |
| C17 | Cấu hình Bán đang dùng chỉ báo lỗi quyền hoặc thuộc danh sách bị bỏ. | Chạy worker. | Không xóa rule rồi AND phần còn lại; lỗi có nghĩa và dữ liệu lịch sử được giữ. |

### B. Bot vận hành và vốn

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| B01 | Có vị thế, Mua rỗng, Bán hợp lệ đạt. | Chạy phiên. | Bán vẫn được xử lý; không return sớm vì Mua rỗng. |
| B02 | Mua hợp lệ, chưa có Bán, đủ vốn/nguồn. | Chạy phiên có tín hiệu. | Được mua, không bắt bật Bán; giữ sau đó nếu không có Bán. |
| B03 | Không Bán; giá giảm sâu vượt stop legacy, giữ hơn60 phiên. | Chạy policy mới. | Không bán vì stop/time legacy; không phục hồi stop hoặc target. |
| B04 | Đủ rule/nguồn/vốn nhưng thiếu toàn bộ L1/verdict AI. | Xét Mua. | Không chặn vì L1/năm lớp, không gọi AI để bù cổng đã bỏ. |
| B05 | Tin tức/nội bộ rất xấu nhưng chưa có Bán. | Chạy. | Không phủ quyết Mua/bán vì đánh giá AI trong policy này. |
| B06 | Mua và Bán cùng đúng, mã trống đầu lượt. | Xử lý. | Chỉ xét Mua; không bán ngay vị thế mới/bán khống. |
| B07 | Mua và Bán cùng đúng, mã có vị thế đầu lượt. | Xử lý. | Xét Bán, không mua thêm, không mua lại cùng phiên. |
| B08 | NAV_basis=100 triệu; price20.000; lô100; phí fixture0,15%. | Tính ngân sách12% gồm phí. | q500, tổng10.015.000; q600 tốn12.018.000 vượt12 triệu, không mua. |
| B09 | Có bán rồi hai lần Mua. | Tính mỗi ngân sách và tiền sau commit. | Cùng NAV_basis đầu lượt; cập nhật tiền thực, không dùng khoản bán chưa commit. |
| B10 | Nhiều ứng viên, hai mã đầu bị lỗi/lô không đủ. | Duyệt theo thứ tự được chốt. | Duyệt tiếp; tối đa2 mua thành công, không2 lần xét; không ép đủ2. |
| B11 | Hai Mua đã commit rồi job retry/đổi revision. | Khôi phục cùng account+phiên. | Không thêm2 suất hoặc nhân execution; snapshot/NAV/tập chặn giữ. |
| B12 | Nhiều vị thế Bán đạt, đã có2 Mua. | Xử lý Bán. | Không giới hạn số Bán theo trần mua. |
| B13 | Giá tăng làm mã đang giữ vượt30%, chưa có Bán. | Chạy. | Không tự tái cân bằng; giới hạn chỉ tại mở Mua. |
| B14 | Thiếu close một vị thế làm NAV_basis chưa đủ; vị thế khác Bán đạt. | Xử lý. | Không NAV giả/mua mới; vẫn bán phần có đủ dữ liệu và sổ sách. |
| B15 | Mô hình Bot cùng-close, mini next-open. | Dùng chung config qua hai profile. | Mỗi profile dùng giá/thời điểm riêng, không thay policy Bot hoặc T+ thủ công. |

### P. Mini và kết quả

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| P01 | Đã học RSI, chưa luyện lần nào. | Mở cấu hình Bot và mini. | Cả hai dùng được độc lập; không có cổng số lượt/lợi nhuận. |
| P02 | Một owner/indicator/set lần đầu. | Nhận permutation. | 30 mã phân biệt, lưu server; không gửi tên/dates mapping hoặc phần test trước start. |
| P03 | RSI đã gặp A, MACD chưa luyện. | Nhận bộ MACD. | Được có A ở vị trí khác; không trộn progress/params hai chỉ báo. |
| P04 | Lượt draft chưa start. | Đổi params/dấu, reload/đổi thiết bị. | Cùng mã, chưa lộ tương lai; không shuffle lại hoặc ghi config Bot. |
| P05 | Hai tab Start cùng case. | Gửi đồng thời, một request timeout. | Một run và config khóa trước khi trả tương lai; retry trả run đó. |
| P06 | Input Mua OFF/hold0/thập phân/>1000 trong profile mẫu. | Start. | Chặn dữ liệu không hợp lệ; không mất mã hoặc clamp âm thầm. |
| P07 | Đã start. | Đổi params/hold bằng API hoặc form. | Từ chối sửa snapshot; không rerun cùng mã với cấu hình mới. |
| P08 | Đang phát lại rồi rời/reload. | Mở lại/tiếp tục. | Cùng run; pause chỉ là tiến độ hiển thị, không đổi giá khớp hoặc reset vốn. |
| P09 | Run hoàn tất. | Next hai lần đồng thời. | Chuyển đúng một mã kế; không nhảy2; mã cũ chỉ xem lại. |
| P10 | Lượt30 đã xong. | Next/reload/đổi thiết bị. | Không reset hoặc cấp mã thứ31; lịch sử vẫn truy cập được. |
| P11 | Test range24 tháng, quan sát6 tháng; warmup dài hơn vùng xem. | Vẽ trước/sau start và pan. | Không lộ tương lai trước start, không dùng tương lai seed; dữ liệu warmup đủ không bị giới hạn130 nến. |
| P12 | Nến chart/thực thi, giá/hàm chỉ báo hai phía khác params. | Đổi tab Mua/Bán. | Chart/legend thể hiện đúng phía/params, không đường RSI chung cho16 chỉ báo. |
| P13 | Mua khớp Phiên10,N=60,Bán chỉ báo chưa đạt. | Tạo lệnh tại close69 rồi khớp open70. | Giữ60 phiên; lý do max_holding. Không chờ close70 rồi mới xếp bán71. |
| P14 | Bán chỉ báo OFF hoặc thiếu giá trị; đủ open, đến hạn. | Thực thi mini. | Thoát theo thời gian nếu profile/giá/sổ sách đủ; không cần bán chỉ báo đạt. |
| P15 | Bán chỉ báo và time cùng đạt. | Tính. | Một Bán, lý do chính indicator như mẫu, lưu cả cờ; không2 phí. |
| P16 | Nến cuối có tín hiệu/hết hạn nhưng không có open trong khoảng. | Kết thúc run. | Không kéo phiên ngoài test/ép bán; giữ open/pending, không cộng giao dịch chưa khớp. |
| P17 | Vốn100 triệu, price20.000, lô100, phí0,15% fixture. | Mini mua100% tiền khả dụng. | q4.900; tổng98.147.000; cash1.853.000; không dùng12% hoặc cấp lại vốn sau Bán. |
| P18 | Một Mua chưa Bán / hai vòng đóng và một vị thế mở. | Render KPI và bảng. | Số giao dịch lần lượt1/3; hai KPI đúng; giao dịch mở có thời gian giữ/lãi lỗ tạm tính. |
| P19 | Mua100CP10.000,fee0,15%; bán11.000,chi phí gộp0,25% fixture. | Tính và đối chiếu. | Entry1.001.500; thu1.097.250; lãi95.750; không trừ thuế hai lần. Tổng portfolio theo NAV không cộng % lệnh. |
| P20 | Feed lỗi/không giao dịch/không đủ lô/vị thế còn mở là các kết quả khác nhau. | Hiện nhận xét/lịch sử cũ. | Không dùng câu chiến lược cho lỗi feed; đúng template/version và giữ kết quả bất biến, không tái tính bằng latest. |

### I. Đối chiếu 16 bộ tính tham chiếu và rule

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| I01 | RSI,N=5,C=[100,102,101,103,102,104]. | Tính Wilder theo mục9 và rule hai phía. | Giá trị đầu sau5 thay đổi=75; lịch sử trước đủN=null; dữ liệu phẳng mẫu trả null, không tín hiệu. |
| I02 | MACD fast2,slow5,signal2; C=[1,2,3,4,5,6,7] là fixture toán học. | Tính EMA SMA-seed. | MACD index4=1,5; Signal index5=1,5; Histogram index5=0. Không gọi trạng thái > là giao cắt. |
| I03 | SMA5,C=[1,2,3,4,5,6,7]. | Tính và so giá với SMA phía riêng. | index4/5/6=3/4/5; index0..3=null. |
| I04 | Bollinger N10,k2,C=1..10. | Tính cuối cửa sổ và membership. | middle5,5; variance8,25; upper/lower=5,5±2×sqrt(8,25); biên mở và missing đúng contract. |
| I05 | Khối lượng lookback5,mult1; V=[100,200,300,400,500,1000],C=10..15. | Tính ngưỡng phiên cuối/rule. | Ngưỡng300, không416,666…; V1000>300 và giá tăng thỏa bộ Mua mẫu. |
| I06 | EMA5,C=[1,2,3,4,5,6,7]. | Tính SMA-seed. | index4/5/6=3/4/5; không seed bằng close đầu nếu đang nghiệm thu biến thể mẫu. |
| I07 | MA Cross: fast[2,2,3,4],slow[2,2,2,2]. | Evaluate giao cắt > ở index1,2,3. | false,true,false; phía cắt xuống dùng >= rồi <; thiếu prior→null. |
| I08 | DMI5,H=11..16,L=9..14,C=10..15. | Tính Wilder +DM/−DM/TR. | Tại index5:+DI50,−DI0; không thêm ADX hoặc ngưỡng25 ngoài rule. |
| I09 | Stochastic k5,smooth3,d3;9 nến H110,L90,C100. | Tính raw,%K,%D. | %K đầu index6=50, %D đầu index8=50; High=Low không tạo giá trị0; legend không đánh tráo mốc20/80 với ngưỡng đã chỉnh. |
| I10 | CCI5,TP=[10,11,12,13,14]. | Tính trung bình và độ lệch tuyệt đối. | mean12,mad1,2,CCI cuối111,111111…; không dùng standard deviation thay MAD. |
| I11 | OBV,C=[10,11,11,9,12],V=[100,200,300,400,500],baseline5. | Tính OBV seed0. | OBV=[0,200,200,−200,300],SMA cuối100; giá bằng không cộng/trừ V. |
| I12 | MFI5,TP=[10,11,12,11,10,12],V100 từng phiên. | Tính tại index5. | Positive3500,negative2100,MFI62,5; không áp RSI close thay TP×V. |
| I13 | CMF5,5 nến H12,L8,C11,V100. | Tính. | CMF0,5; unit ratio, không50. H=L hoặc V tổng0 theo policy missing mẫu phải được báo. |
| I14 | Donchian5;5 H trước[10,11,12,13,14],5 L trước[6,7,8,9,10];T H16,L11,C15. | Tính kênh và buy rule. | Upper14,lower6,15>14 đạt; không gồm H16 khiến điều kiện bất khả thi. |
| I15 | ROC2,C=[100,110,120]. | Tính tại index2. | ROC20 (đơn vị %), không0,2 hoặc2000; close gốc0 → thiếu/không hợp lệ. |
| I16 | Williams%R5,H110,L90,C105 đủ5 phiên. | Tính. | Giá trị−25, thang−100..0; không dùng50/75 thang RSI; denominator0→null. |

### M. Migration, liên kết và an toàn

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| M01 | Tài khoản legacy đã cấp vốn, trứng còn/chưa nở. | Dry-run và migration. | Không giả grade/pass; không vốn mới; gỡ cổng nghiệp vụ và giữ chứng từ. |
| M02 | Cấu hình cũ chứa ch07-l01=ATR, catalog mới ch07-l01=OBV. | Map grants/config. | Không cấp OBV từ ATR; dùng capability/catalog version/Phụ lục C. |
| M03 | Rule legacy bị loại hoặc không thể map. | Migration và worker. | Giữ dữ liệu, báo cần điều chỉnh; không bỏ một phần rồi tự trade. |
| M04 | Giao dịch cũ stop/target đã chốt, vị thế còn mở mang stop. | Cutover policy. | Lịch sử giữ nguyên; không stop/target mới từ phiên cutover, không backfill bán. |
| M05 | Worker cũ/mới và retry sau deploy. | Xử lý cùng account+phiên. | Một snapshot/idempotent executions, không hai nguồn Săn mã+VN30 hoặc hai lượt. |
| M06 | Chương1–3 đã có nội dung/quiz/chart hợp lệ. | Cài khung13/71. | Không placeholder ghi đè; chưa ghép bài khác không có nút pass giả. |
| M07 | Có cảnh báo ghim/Backtest run/mini. | Sửa config Bot, chạy mini, mở lịch sử. | Chỉ shared config chủ động đổi có hiệu lực; snapshots khác không bị viết lại, không sinh lệnh do xem. |
| M08 | Tên danh mục có `<script>`, quote hoặc ký hiệu rule. | Render/lưu rồi đọc. | Escape an toàn; không script, không mất dấu < > ∈ ∉ hoặc lộ dữ liệu người khác. |
| M09 | Client gửi owner/clock/grant/case mapping giả, localStorage all. | Gọi API trái phép. | Server không tin; không cấp quyền/vốn/phiên hoặc lộ tương lai. |
| M10 | Có thực thi local HTML và chưa nối repo/provider. | Báo cáo nghiệm thu. | Tách mock/unit/integration/production; không gọi 16 mô phỏng mẫu là chứng nhận engine IQX. |

**Tổng: 123 ca nghiệm thu.** Các ca I là đối chiếu với biến thể tham chiếu ghi tại mục 9; sai khác provider phải được giải quyết và version trước khi coi là đạt. Một test chỉ có công thức không thay integration với nguồn giá, quyền và sổ sách.

---

## 17. Kiểm tra cục bộ của bộ bàn giao

HTML được sao chép nguyên byte, không đổi giao diện hoặc sửa lại điều kiện sau khi đã duyệt. Đã kiểm tra cấu trúc JSON: 13 chương, 71 bài, 16 registry và ánh xạ `new_lesson_id` đúng catalog. SHA-256 của nguồn và bản bàn giao giống nhau.

Đã chạy **16 kiểm tra khói cục bộ** bằng Chromium: cấu trúc catalog; trạng thái mới OFF; hai tài khoản 100 triệu độc lập; đủ 16 form; chỉnh RSI một phía tạo pending không bật master; mini tách config; giữ mặc định60; chạy/khóa form/hai KPI; đếm Mua đúng vòng đóng+vị thế mở; nhãn mini không dùng ngày; Next không lặp; Theo dõi độc lập; apply danh mục pending không lệnh; hiệu lực sau nút phiên mẫu; chạy 16 bộ tính trên một chuỗi fixture kiểm tra tiền không âm/thời gian giữ; kiểm tra không tràn ngang trang tại 1440/1024/900/390/360px. Không có lỗi JavaScript trong các đường thử đó.

**Giới hạn kiểm chứng:** môi trường trình duyệt chặn điều hướng `file://`. HTML được nạp bằng `set_content` và bộ nhớ thay localStorage cho kiểm tra giao diện. Chưa kiểm thử lưu qua reload thực, liên thiết bị, auth, scheduler, provider, database hoặc IQX production. 16 phép kiểm tra khói không thay các ca mục16. Kết quả nến tổng hợp không chứng minh lợi nhuận thị trường hoặc parity chỉ báo với provider.

Các ảnh kiểm tra và script QA chỉ là vật liệu làm việc nội bộ, không phải file đầu vào bổ sung phải gửi dev. Toàn bộ yêu cầu nghiệm thu cần thiết nằm trong spec.

---

## 18. Phụ thuộc, trình tự triển khai và bàn giao dev

### 18.1. Những điểm phải xác minh, không tự điền bằng mẫu

| Điểm | Điều đã rõ | Phần chưa được nguồn hiện có xác nhận đầy đủ |
|---|---|---|
| Repository và deploy | Nâng cấp trực tiếp IQX, giữ dữ liệu | Nhánh/build, đường dẫn, schema, quyền môi trường thật |
| Cấp linh thú đầu vào | Có từ đầu, không trứng; giữ mascot cũ | Mặc định/gán loài nếu nguồn hiện hữu chỉ dựa cấp0–6; không tự sáng tác màn chọn |
| Nguồn VN30 | Mua mới mặc định theo VN30 hiệu lực | Provider, lịch sử thành phần và độ đầy đủ dữ liệu hiện tại |
| 30 tình huống thật | 30 mã riêng, một bộ24 tháng, random từng chỉ báo | Danh sách được duyệt, mapping lịch sử, price basis, ngày source sẵn; không phải case1..30 giả |
| Thứ tự nhiều mã Mua đạt | Không AI/filter_count/Săn mã | GTGD20↓ rồi mã↑ là phương án HTML; cần contract được chốt trước mua production nếu chưa có |
| Phí/lô/bước giá/thanh toán | Tách profile thủ công/Bot/mini; vốn và policy rõ | Giá trị/service cụ thể, fees gộp hay tách, khả dụng tiền, profile mini có/không khóa và trường hợp thiếu phiên |
| Chỉ báo | 16 rules/params và biến thể mẫu có ở Phụ lục B/mục9 | Parity với provider/bài đã có, seed/warmup/giá adjusted và missing ở từng thuật toán |
| Lịch phiên/hiệu lực | Ngày hiệu lực>D; Bot same-close, mini next-open | Calendar/readiness thật; không lịch chỉ bỏ cuối tuần hoặc +24h |
| Sự kiện doanh nghiệp | Bảo toàn cơ chế/quyền lợi đang được duyệt | Cơ sở giá/quyền/khối lượng/cost/provider tương thích; không tính quyền hai lần |
| Quyền/grants | Học mở quyền, không auto-ON; mini tự nguyện | Auth/gói, nguồn progress thật và migration bằng chứng; không scenarioall |
| Nhận xét | Dùng văn bản viết sẵn, không AI runtime | Thư viện biên tập cuối nếu muốn thay đoạn mẫu; không tuyên bố đã có nội dung chưa cung cấp |
| Lệnh thủ công | Giao dịch mô phỏng thông thường100 triệu, không gate học | Các order type, partial fill, hủy/sửa và settlement engine thực; giữ cái đã hoạt động |

Chỉ hỏi điểm thực sự không có nguồn/contract hoặc thiếu quyền. Không yêu cầu chủ sản phẩm tự chỉ tên file/hàm/API mà dev có thể đọc; không đòi ZIP/spec cũ để làm phần đã được viết đủ ở đây. Những điểm chưa chốt **không được tự sửa thành một quy tắc mới** để báo đã hoàn thành. Triển khai những phần đủ đầu vào, báo rõ phạm vi chặn nghiệm thu; không mở lại quyết định đã chốt như bỏ trứng/stop,16 chỉ báo, nguồn mua và mini tự nguyện.

### 18.2. Trình tự

1. Audit code/data/build; ma trận giữ/sửa/bỏ; chụp UI thật; xác định các phụ thuộc tại18.1.
2. Viết test các bất biến: cấp vốn một lần, tách tài khoản, nguồn mua khác phạm vi Bán, no-stop, AND rỗng, pending, mini không ảnh hưởng Bot.
3. Gỡ cổng trứng, tạo/tìm account/mascot đúng; nối thủ công và Săn mã/Theo dõi không phá luồng đang có.
4. Map catalog13/71 và grants; cấu hình16 theo rule version; editor và backend cùng nguồn; giải quyết parity chỉ báo.
5. Triển khai nguồn VN30/custom, áp/hủy/chuyển nguồn và worker Bot theo snapshot; xác nhận thứ tự ứng viên trước kích hoạt nhánh mua mới.
6. Tạo bộ tình huống thật, permutation server, start/lock/retry, engine mini profile riêng, chart/result/comment/history.
7. Nối UI theo v4, rút mock/footer/testhooks, chuẩn bị điểm ghép giáo trình và Chiến lược. Không chép các stub lên chức năng thật.
8. Migration dry-run, backup/mapping/cutover; đối soát; test unit/integration/responsive/regression, rollback có kiểm soát.
9. Bàn giao code/test/báo cáo; chỉ deploy và bật worker ở môi trường được cấp quyền sau khi các cổng cần thiết đã đạt.

### 18.3. Kết quả AI dev cần trả

Code, migration và test trong repository, kèm báo cáo có: commit/build và service đã xác minh; ma trận yêu cầu/file sửa; các bản policy/config/catalog; bảo toàn tiền/positions/orders/grants và ngoại lệ mapping; test ID expected/actual/câu lệnh/môi trường; nguồn thật đã nối, mock còn lại, điểm chưa kiểm tra/chưa chốt. Đây là kết quả dev tạo ra, không phải thêm file đầu vào mà chủ sản phẩm phải chuẩn bị.

Hoàn thành khi: luồng mới không trứng; tài khoản thủ công và Bot riêng, cấp100 triệu một lần; Săn mã/Theo dõi độc lập; Bot mua đúng nguồn và bán mọi vị thế theo điều kiện, không stop ngầm; 16 chỉ báo có form/series/evidence đúng đã đối chiếu; mini24 tháng/30 mã/không lặp/giữ60 mặc định/hai KPI/lịch sử và nhận xét đúng; dữ liệu/quyền/hiệu lực do server; UI đúng v4 và đủ điểm ghép13/71; lịch sử cũ không mất.

**Không hoàn thành nếu chỉ dựng lại HTML, xóa nhãn giả lập, có tên16 chỉ báo/71 bài, dùng localStorage làm backend, hoặc cho một case RSI chạy rồi báo đủ16. Không coi việc bàn giao bộ Bot là đã bàn giao giáo trình 13 chương hoặc toàn trang Chiến lược.**

---

# Phụ lục A — Catalog khung 13 chương / 71 bài

Danh sách lấy đúng `#catalogData` của HTML được duyệt. Chỉ metadata tên/thứ tự/loại/capability, chưa có nội dung bài. Ký hiệu loại trong bảng chỉ dành cho dev: kỹ thuật, cơ bản, hướng dẫn, Hợp lưu. Không bổ sung chúng thành badge mới trên UI.

## A01. Chương 1 — Chỉ báo kỹ thuật nền tảng (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch01-l01` | RSI | Capability kỹ thuật `rsi`; luyện tập và cấu hình theo grant |
| `ch01-l02` | MACD | Capability kỹ thuật `macd`; luyện tập và cấu hình theo grant |
| `ch01-l03` | MA / SMA | Capability kỹ thuật `ma`; luyện tập và cấu hình theo grant |
| `ch01-l04` | Bollinger Bands | Capability kỹ thuật `bollinger`; luyện tập và cấu hình theo grant |
| `ch01-l05` | Khối lượng | Capability kỹ thuật `volume`; luyện tập và cấu hình theo grant |
| `ch01-l06` | Hợp lưu | Bài kiến thức; không indicator/công tắc/mini riêng |

## A02. Chương 2 — Sử dụng Backtest (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch02-l01` | Bắt đầu với Backtest | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch02-l02` | Thiết lập điều kiện Mua | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch02-l03` | Thiết lập điều kiện Bán | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch02-l04` | Chọn giả định và chạy kiểm thử | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch02-l05` | Đọc kết quả và lịch sử giao dịch | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch02-l06` | Điều chỉnh, so sánh và lưu kết quả | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |

## A03. Chương 3 — Phân tích cơ bản nền tảng (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch03-l01` | Tăng trưởng doanh thu YoY | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch03-l02` | Tăng trưởng LNST YoY | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch03-l03` | Tăng trưởng EPS YoY | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch03-l04` | Biên lợi nhuận gộp | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch03-l05` | Biên lợi nhuận ròng | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch03-l06` | ROE | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |

## A04. Chương 4 — Sử dụng Bộ lọc (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch04-l01` | Bắt đầu với Bộ lọc | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch04-l02` | Thiết lập điều kiện lọc | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch04-l03` | Chọn kỳ tính cho từng chỉ tiêu | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch04-l04` | Đọc và kiểm tra kết quả | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch04-l05` | Điều chỉnh và lưu bộ lọc | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |
| `ch04-l06` | Lưu và áp dụng danh mục cho Bot | Hướng dẫn; nút Hoàn thành khi nội dung được ghép, không grant chỉ báo |

## A05. Chương 5 — Xu hướng và động lượng nâng cao (5 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch05-l01` | EMA | Capability kỹ thuật `ema`; luyện tập và cấu hình theo grant |
| `ch05-l02` | MA Cross | Capability kỹ thuật `ma_cross`; luyện tập và cấu hình theo grant |
| `ch05-l03` | DMI | Capability kỹ thuật `dmi`; luyện tập và cấu hình theo grant |
| `ch05-l04` | Stochastic | Capability kỹ thuật `stochastic`; luyện tập và cấu hình theo grant |
| `ch05-l05` | CCI | Capability kỹ thuật `cci`; luyện tập và cấu hình theo grant |

## A06. Chương 6 — Sức khỏe tài chính doanh nghiệp (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch06-l01` | ROA | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch06-l02` | ROIC | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch06-l03` | D/E — Nợ vay / Vốn chủ sở hữu | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch06-l04` | Net Debt / EBITDA | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch06-l05` | Current Ratio | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch06-l06` | Interest Coverage | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |

## A07. Chương 7 — Khối lượng và dòng tiền (3 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch07-l01` | OBV | Capability kỹ thuật `obv`; luyện tập và cấu hình theo grant |
| `ch07-l02` | MFI | Capability kỹ thuật `mfi`; luyện tập và cấu hình theo grant |
| `ch07-l03` | Chaikin Money Flow — CMF | Capability kỹ thuật `cmf`; luyện tập và cấu hình theo grant |

## A08. Chương 8 — Chất lượng dòng tiền doanh nghiệp (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch08-l01` | CFO Margin | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch08-l02` | CFO / LNST | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch08-l03` | FCF Margin | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch08-l04` | FCF Growth YoY | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch08-l05` | Capex / Revenue | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch08-l06` | Accrual Ratio | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |

## A09. Chương 9 — Định giá doanh nghiệp (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch09-l01` | P/E | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch09-l02` | P/B | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch09-l03` | P/S | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch09-l04` | EV / EBITDA | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch09-l05` | PEG | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch09-l06` | FCF Yield | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |

## A10. Chương 10 — Kênh giá và động lượng (3 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch10-l01` | Donchian Channel | Capability kỹ thuật `donchian`; luyện tập và cấu hình theo grant |
| `ch10-l02` | ROC | Capability kỹ thuật `roc`; luyện tập và cấu hình theo grant |
| `ch10-l03` | Williams %R | Capability kỹ thuật `williams_r`; luyện tập và cấu hình theo grant |

## A11. Chương 11 — Tăng trưởng dài hạn và hiệu quả vận hành (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch11-l01` | Revenue CAGR 3Y | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch11-l02` | Net Profit CAGR 3Y | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch11-l03` | EPS CAGR 3Y | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch11-l04` | Asset Turnover | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch11-l05` | Cash Conversion Cycle | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch11-l06` | Working Capital Turnover | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |

## A12. Chương 12 — Độ ổn định doanh nghiệp (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch12-l01` | Revenue Growth Stability | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch12-l02` | EPS Stability | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch12-l03` | Margin Stability | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch12-l04` | ROIC Stability | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch12-l05` | FCF Positive Streak | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch12-l06` | Profit Positive Streak | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |

## A13. Chương 13 — Cổ đông và phân bổ vốn (6 bài)

| ID trong catalog mới | Tên bài | Điểm mở/quyền |
|---|---|---|
| `ch13-l01` | Dividend Yield | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch13-l02` | Payout Ratio | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch13-l03` | Dividend Growth | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch13-l04` | Share Count Growth | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch13-l05` | Buyback Yield | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |
| `ch13-l06` | Shareholder Yield | Chỉ tiêu Bộ lọc tương ứng; định nghĩa/capability chi tiết thuộc đợt cơ bản |

**Đối chiếu:** 16 bài kỹ thuật + 42 bài cơ bản + 12 bài hướng dẫn + 1 Hợp lưu = 71. Lượt luyện theo dõi riêng. Không giữ các chương hệ thống/19 mục kỹ thuật đã bỏ như chức năng khóa sẽ tự mở về sau. Không mở 42 chỉ tiêu chỉ vì đã có tên trong catalog; phải có nội dung, công thức nguồn và grant hợp lệ.

---

# Phụ lục B — 16 bộ điều kiện và miền tham số

**Trích cấu trúc từ `#registryData` của HTML v4, không phải giáo trình.** Mua/Bán dùng tham số riêng; mọi dòng của một phía kết hợp AND. Các dấu dưới là mẫu khởi đầu, đều thay được trong tập cho phép của dòng. Bật và chọn dấu là ý định người dùng, không tự bật từ mẫu.

Ký hiệu: `T` là phiên đang xét, `T−1` là phiên liền trước trong chuỗi hợp lệ. Nguồn series và seeding tại mục9. Một giá trị thiếu không đạt phép so sánh hoặc phủ định. Tham số có kiểm tra miền/bước và ràng buộc liên trường từ registry; server tự giữ whitelist. Kiểu và field dưới đúng mẫu, không mở arbitrary expression editor.

## B01. RSI — `rsi`

Bài mới: `ch01-l01`, Chương 1. ID bài gốc trong registry: `ch01-l01` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ RSI | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |
| `level` | Ngưỡng RSI | 30 | 70 | Số; Mua 10–49; Bán 51–90; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | RSI_T−1 < level (= 30) | `>` / `<` |
| Mua / `r2` | RSI_T > RSI_T−1 | `>` / `<` |
| Bán / `r1` | RSI_T−1 > level (= 70) | `>` / `<` |
| Bán / `r2` | RSI_T < RSI_T−1 | `>` / `<` |

Ngưỡng của Mua/Bán trong mẫu có miền khác nhau. Giữ đúng form tham chiếu; việc đổi dấu không tự nới miền thành 0–100. Hai rule AND, không tự đổi thành RSI cắt qua ngưỡng.

## B02. MACD — `macd`

Bài mới: `ch01-l02`, Chương 1. ID bài gốc trong registry: `ch01-l02` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `fast` | Chu kỳ EMA nhanh | 12 | 12 | Số nguyên; 2–50; bước 1; đơn vị phiên |
| `slow` | Chu kỳ EMA chậm | 26 | 26 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `signal` | Chu kỳ đường tín hiệu | 9 | 9 | Số nguyên; 2–30; bước 1; đơn vị phiên |

Ràng buộc: `fast < slow`.

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | MACD_T > Signal_T | `>` / `<` |
| Bán / `r1` | MACD_T < Signal_T | `>` / `<` |

Điều kiện mặc định là MACD đang >/< Signal. Không đổi thành sự kiện cắt chỉ để giảm lặp tín hiệu; trạng thái vị thế xử lý tần suất lệnh.

## B03. MA / SMA — `ma`

Bài mới: `ch01-l03`, Chương 1. ID bài gốc trong registry: `ch01-l03` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ SMA | 20 | 20 | Số nguyên; 5–200; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > SMA_T | `>` / `<` |
| Bán / `r1` | Close_T < SMA_T | `>` / `<` |

## B04. Bollinger Bands — `bollinger`

Bài mới: `ch01-l04`, Chương 1. ID bài gốc trong registry: `ch01-l04` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ Bollinger | 20 | 20 | Số nguyên; 10–100; bước 1; đơn vị phiên |
| `k` | Hệ số dải | 2 | 2 | Số; 1–3.5; bước 0.1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T−1 < Lower_T−1 | `>` / `<` |
| Mua / `r2` | Close_T ∈ (Lower_T, Upper_T) — khoảng mở | `∈` / `∉` |
| Mua / `r3` | Close_T > Close_T−1 | `>` / `<` |
| Bán / `r1` | Close_T−1 > Upper_T−1 | `>` / `<` |
| Bán / `r2` | Close_T ∈ (Lower_T, Upper_T) — khoảng mở | `∈` / `∉` |
| Bán / `r3` | Close_T < Close_T−1 | `>` / `<` |

Mua so close trước với dải dưới trước; Bán với dải trên trước; close hiện tại ∈/∉ khoảng mở của cùng phía. Giữ đủ ba dòng, không rút còn chạm dải. Cấu hình dấu ít/không sinh lệnh không được engine tự sửa.

## B05. Khối lượng — `volume`

Bài mới: `ch01-l05`, Chương 1. ID bài gốc trong registry: `ch01-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `lookback` | Số phiên tham chiếu | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `mult` | Hệ số khối lượng | 1 | 1 | Số; 0.5–3; bước 0.1; đơn vị lần |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > Close_T−1 | `>` / `<` |
| Mua / `r2` | Volume_T > Ngưỡng_khối_lượng_T | `>` / `<` |
| Bán / `r1` | Close_T < Close_T−1 | `>` / `<` |
| Bán / `r2` | Volume_T > Ngưỡng_khối_lượng_T | `>` / `<` |

Ngưỡng mẫu = mult × trung bình lookback volume trước T; cả hai phía cùng dùng volume lớn hơn mẫu nhưng rule chiều giá khác nhau. Không chỉ dùng khối lượng để phân biệt hướng.

## B06. EMA — `ema`

Bài mới: `ch05-l01`, Chương 5. ID bài gốc trong registry: `ch05-l01` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ EMA | 20 | 20 | Số nguyên; 5–200; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > EMA_T | `>` / `<` |
| Bán / `r1` | Close_T < EMA_T | `>` / `<` |

## B07. MA Cross — `ma_cross`

Bài mới: `ch05-l02`, Chương 5. ID bài gốc trong registry: `ch05-l02` (chỉ dùng mapping legacy). Loại điều kiện: **sự kiện giao cắt**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `fast` | Chu kỳ SMA nhanh | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `slow` | Chu kỳ SMA chậm | 50 | 50 | Số nguyên; 10–250; bước 1; đơn vị phiên |

Ràng buộc: `fast < slow`.

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | SMA_fast_T > SMA_slow_T — giao cắt giữa T−1/T, không chỉ so sánh hiện tại | `>` / `<` |
| Bán / `r1` | SMA_fast_T < SMA_slow_T — giao cắt giữa T−1/T, không chỉ so sánh hiện tại | `>` / `<` |

`>`: fast_(T−1)≤slow_(T−1) và fast_T>slow_T; `<`: fast_(T−1)≥slow_(T−1) và fast_T<slow_T. Dùng cùng tham số phía đang xét; cả bốn giá trị phải hợp lệ.

## B08. DMI — `dmi`

Bài mới: `ch05-l03`, Chương 5. ID bài gốc trong registry: `ch05-l03` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ DMI | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | +DI_T > −DI_T | `>` / `<` |
| Bán / `r1` | +DI_T < −DI_T | `>` / `<` |

Chỉ +DI/−DI; công thức nội bộ dùng True Range không có nghĩa mở capability ATR/ADX hoặc tạo cắt lỗ.

## B09. Stochastic — `stochastic`

Bài mới: `ch05-l04`, Chương 5. ID bài gốc trong registry: `ch05-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `k` | Chu kỳ %K | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |
| `d` | Chu kỳ %D | 3 | 3 | Số nguyên; 2–20; bước 1; đơn vị phiên |
| `smooth` | Chu kỳ trung bình %K | 3 | 3 | Số nguyên; 1–10; bước 1; đơn vị phiên |
| `level` | Ngưỡng %K | 20 | 80 | Số; 0–100; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | %K_T < level (= 20) | `>` / `<` |
| Mua / `r2` | %K_T > %D_T | `>` / `<` |
| Bán / `r1` | %K_T > level (= 80) | `>` / `<` |
| Bán / `r2` | %K_T < %D_T | `>` / `<` |

%K sau smoothing, %D là trung bình của %K; hai dòng là trạng thái tại T. Ngưỡng người dùng khác mốc tham chiếu20/80 phải được nhận diện đúng.

## B10. CCI — `cci`

Bài mới: `ch05-l05`, Chương 5. ID bài gốc trong registry: `ch05-l06` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ CCI | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `level` | Ngưỡng CCI | -100 | 100 | Số; -300–300; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | CCI_T−1 < level (= -100) | `>` / `<` |
| Mua / `r2` | CCI_T > CCI_T−1 | `>` / `<` |
| Bán / `r1` | CCI_T−1 > level (= 100) | `>` / `<` |
| Bán / `r2` | CCI_T < CCI_T−1 | `>` / `<` |

## B11. OBV — `obv`

Bài mới: `ch07-l01`, Chương 7. ID bài gốc trong registry: `ch07-l04` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `baseline` | Chu kỳ SMA của OBV | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | OBV_T > SMA_OBV_T | `>` / `<` |
| Bán / `r1` | OBV_T < SMA_OBV_T | `>` / `<` |

Đường SMA là tham chiếu của chính OBV, không thêm một chiến lược SMA giá vào bài.

## B12. MFI — `mfi`

Bài mới: `ch07-l02`, Chương 7. ID bài gốc trong registry: `ch07-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ MFI | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |
| `level` | Ngưỡng MFI | 20 | 80 | Số; 0–100; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | MFI_T−1 < level (= 20) | `>` / `<` |
| Mua / `r2` | MFI_T > MFI_T−1 | `>` / `<` |
| Bán / `r1` | MFI_T−1 > level (= 80) | `>` / `<` |
| Bán / `r2` | MFI_T < MFI_T−1 | `>` / `<` |

## B13. Chaikin Money Flow — `cmf`

Bài mới: `ch07-l03`, Chương 7. ID bài gốc trong registry: `ch07-l06` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ CMF | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `level` | Ngưỡng CMF | 0 | 0 | Số; -1–1; bước 0.01 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | CMF_T > level (= 0) | `>` / `<` |
| Bán / `r1` | CMF_T < level (= 0) | `>` / `<` |

Giá trị/level là tỷ số −1..1 trong form, không nhân100 khi so rule; step0,01.

## B14. Donchian Channel — `donchian`

Bài mới: `ch10-l01`, Chương 10. ID bài gốc trong registry: `ch11-l01` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ Donchian | 20 | 20 | Số nguyên; 5–252; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > Upper_T | `>` / `<` |
| Bán / `r1` | Close_T < Lower_T | `>` / `<` |

Mỗi phía dùng kênh N phiên trước T, không gồm T; không vô tình lấy max(high_T) rồi yêu cầu close_T>max đó.

## B15. ROC — `roc`

Bài mới: `ch10-l02`, Chương 10. ID bài gốc trong registry: `ch11-l04` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ ROC | 20 | 20 | Số nguyên; 2–252; bước 1; đơn vị phiên |
| `level` | Ngưỡng ROC | 5 | -5 | Số; -100–100; bước 0.1; đơn vị % |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | ROC_T > level (= 5) | `>` / `<` |
| Bán / `r1` | ROC_T < level (= -5) | `>` / `<` |

ROC và level đều dùng đơn vị phần trăm: level5 nghĩa5%, không0,05. Chu kỳ2 là miền thấp nhất của mẫu.

## B16. Williams %R — `williams_r`

Bài mới: `ch10-l03`, Chương 10. ID bài gốc trong registry: `ch11-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ Williams %R | 14 | 14 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `level` | Ngưỡng Williams %R | -80 | -20 | Số; -100–0; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Williams%R_T−1 < level (= -80) | `>` / `<` |
| Mua / `r2` | Williams%R_T > Williams%R_T−1 | `>` / `<` |
| Bán / `r1` | Williams%R_T−1 > level (= -20) | `>` / `<` |
| Bán / `r2` | Williams%R_T < Williams%R_T−1 | `>` / `<` |

Thang giá trị/level −100..0; không dùng ngưỡng30/70 của RSI.

Không thêm Hợp lưu thành capability thứ17. Các năng lực kỹ thuật đã bỏ khỏi phạm vi mới: ADX; ATR; ATR Percent; Relative Volume; Bollinger BandWidth; N-day High; N-day Low; Khoảng cách tới đỉnh52 tuần; Gap; Keltner Channel; Parabolic SAR; Khoảng cách tới hỗ trợ; Khoảng cách tới kháng cự; Relative Strength vs VN-Index; Relative Strength vs ngành; Advance/Decline Line; % cổ phiếu trên MA50; New High–New Low; VN-Index vs MA200. Dữ liệu legacy chỉ để đọc/mapping, không dựng lại các nút khóa tương ứng trong catalog mới.

---

# Phụ lục C — Mapping catalog và điểm tích hợp HTML

## C.1. Không dùng lại ID cũ mù quáng

Đề nghị định danh bài bằng `(catalog_version, lesson_id)` hoặc khóa bài bền vững tương đương. Các ID hình thức `chXX-lYY` là tham chiếu vị trí trong version, không tự chứng nhận hai nội dung là một bài. Bảng kỹ thuật sau lấy đúng registry đi kèm.

| Capability | Bài legacy trong registry | Bài mới | Chương mới |
|---|---|---|---:|
| `rsi` | `ch01-l01` | `ch01-l01` | 1 |
| `macd` | `ch01-l02` | `ch01-l02` | 1 |
| `ma` | `ch01-l03` | `ch01-l03` | 1 |
| `bollinger` | `ch01-l04` | `ch01-l04` | 1 |
| `volume` | `ch01-l05` | `ch01-l05` | 1 |
| `ema` | `ch05-l01` | `ch05-l01` | 5 |
| `ma_cross` | `ch05-l02` | `ch05-l02` | 5 |
| `dmi` | `ch05-l03` | `ch05-l03` | 5 |
| `stochastic` | `ch05-l05` | `ch05-l04` | 5 |
| `cci` | `ch05-l06` | `ch05-l05` | 5 |
| `obv` | `ch07-l04` | `ch07-l01` | 7 |
| `mfi` | `ch07-l05` | `ch07-l02` | 7 |
| `cmf` | `ch07-l06` | `ch07-l03` | 7 |
| `donchian` | `ch11-l01` | `ch10-l01` | 10 |
| `roc` | `ch11-l04` | `ch10-l02` | 10 |
| `williams_r` | `ch11-l05` | `ch10-l03` | 10 |

| Nhóm nội dung còn giữ | Ánh xạ |
|---|---|
| Chương1 cũ | Chương1 mới, giữ tên6 bài; kiểm tra nguồn bài đã được duyệt trước khi chuyển grant. |
| Chương2 cũ18 bài | Không map máy móc sang6 bài; dùng bộ6 bài Sử dụng Backtest đã được duyệt và progress có bằng chứng. |
| Chương3 cũ | Chương3 mới,6 bài nền tảng. |
| Chương4 cũ10 bài | Bộ6 bài hướng dẫn mới, bài6 bổ sung áp danh mục Bot; không tự copy completion từ chỉ số vị trí cũ. |
| Chương5/7 kỹ thuật | Theo mapping từng capability phía trên; ADX/ATR… đã bỏ không cấp quyền thay thế. |
| Chương6/8 cơ bản | Chương6/8 mới; nội dung tên6 bài của mỗi chương còn giữ. |
| Chương10 Định giá cũ | Chương9 mới,6 bài cùng tên/thứ tự. |
| Chương11 kỹ thuật cũ | Chỉ Donchian/ROC/Williams theo bảng chuyển Chương10 mới. |
| Chương12 tăng trưởng dài hạn cũ | Chương11 mới. |
| Chương14 ổn định cũ | Chương12 mới. |
| Chương15 cổ đông cũ | Chương13 mới. |
| Chương9,13 kỹ thuật và16–18 hệ thống cũ bị loại khỏi bản mới | Lưu lịch sử có version, không tự gán sang chương mới trùng số; không tự mở tính năng ngoài phạm vi. |

## C.2. Vị trí tham chiếu trong HTML

| Tác vụ | Điểm tìm trong file |
|---|---|
| Metadata/rule/params | `script#registryData`, `script#catalogData` |
| Khung/rail/modal/responsive | `.shell`, `.main`, `.panel`, `.rail`, `#dialog`, các media query |
| Panel Bot/Học viện | `renderPanel`, `botIndicators`, `academyPanel`, `renderMain` |
| Form và draft | `editorHtml`, `openConfig`, `saveConfig`, `commitConfig`, `toggleMaster` |
| Nguồn danh mục | `universeCard`, `openSavedLists`, `selectList`, `applyList`, `requestVN30` |
| Mini tạo/chạy/xem lại | `practiceState`, `startPractice`, `nextPractice`, `practiceHistory`, `resultFor` |
| Chuỗi/rule | `rsi`, `sma`, `ema`, `calcSeries`, `resolve`, `evaluate` |
| Sổ mô phỏng mini | `simulate`, `maxQty` |
| Chart/tooltip/giao dịch | `plotSpecs`, `drawPracticeChart`, `renderPracticeResults`, `openPracticeTrade` |
| Nhận xét/giả định | `commentFor`, `practiceProfile` |
| Thủ công/Săn mã | `orderEditor`, `confirmOrder`, `matchManual`, `huntRows`, `toggleWatch` |
| Worker minh họa, không production | `processBot`, `advanceSession` |
| Các phần phải loại khỏi production | `scenario`, `VN30_FIXTURE`, `SAVED_LISTS`, `syntheticBars`, `makeDates`, footer, `confirmExample`, localStorage, `IQX_BOT_PREVIEW` |

Các tên trên chỉ để tìm trong HTML, không bắt đặt API/component thật giống chúng. Cần dùng implementation có xác thực/lưu trữ/profile như spec thay shortcut mock, đồng thời bảo toàn hình thức đã duyệt.

---

**HẾT SPEC BỘ BOT — v1.0.** Gửi file Markdown này cùng `IQX-Bo-Bot-MAU-v1.0.html` cho AI dev. Không cần các spec Bot/Học viện/Chiến lược cũ để hiểu bản đích. Nội dung từng bài và giao diện Chiến lược đầy đủ sẽ được ghép bằng các đợt tiếp theo; bộ hiện tại chỉ chuẩn bị đúng hợp đồng và điểm tích hợp của chúng.

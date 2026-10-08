# IQX — SHOP, XU HỌC TẬP VÀ LINH THÚ
## Đặc tả bổ sung · Dùng lại mô hình có sẵn · Thưởng học tập · Mua và đổi linh thú

**Phiên bản bàn giao:** 1.0  
**Ngày:** 07/10/2026  
**File spec:** `IQX-Bo-Shop-Xu-Linh-Thu-SPEC-v1.0.md`  
**HTML đi kèm:** `IQX-Bo-Shop-Xu-Linh-Thu-MAU-v1.0.html`  
**Bộ đầu vào:** đúng hai file trên. Không yêu cầu README, prompt, ZIP, ảnh rời hoặc mô hình linh thú mới để giải thích phạm vi này.  
**Trạng thái:** yêu cầu triển khai vào IQX hiện có; không phải xác nhận đã sửa mã nguồn, triển khai máy chủ hoặc nghiệm thu production.

> **ĐỌC TRƯỚC KHI CODE — KHÔNG TẠO LINH THÚ MỚI.** Chủ sản phẩm xác nhận website IQX đã có mô hình của các linh thú. Đợt này chỉ bổ sung Shop, ví xu học tập, thưởng hoàn thành bài, quyền sở hữu và thao tác chọn linh thú đang sử dụng. **Bắt buộc tìm và tái sử dụng đúng mô hình, tài nguyên, ảnh đại diện và bộ hiển thị/hoạt ảnh đang có trong dự án.** Ảnh trong HTML chỉ minh họa bố cục và trạng thái, không là thiết kế phải dựng lại. Không vẽ lại, dựng 3D, tạo rig, texture, animation hoặc thay mô hình hiện tại bằng ảnh tĩnh/base64 từ HTML.

> Đọc spec và mở các luồng trong HTML, sau đó tìm đúng repository, phiên bản đang chạy, tài khoản, hồ sơ linh thú và dịch vụ hoàn thành bài. Sửa trực tiếp trên nền phù hợp. Không thay toàn bộ Bot/Học viện bằng mã JavaScript mô phỏng. Không tự tạo câu hỏi hoặc giả tiến độ để cấp xu. Không đổi tiền, vị thế, cấu hình, nguồn mua, lịch sử giao dịch hoặc quyền chỉ báo khi mua/đổi linh thú.

---

## 0. Nguồn chuẩn và phạm vi

### 0.1. Thứ tự ưu tiên

| Nội dung | Nguồn áp dụng |
|---|---|
| Thưởng 100 xu, giá 500 xu, sở hữu và sử dụng | Quyết định chủ sản phẩm và các quy tắc trong spec này |
| Ngoại hình, mô hình, hoạt ảnh, cách render linh thú thật | Tài nguyên và bộ hiển thị hiện hữu của IQX đã được chủ sản phẩm xác nhận |
| Bố cục Shop, vị trí nút, trạng thái, xác nhận mua | HTML được duyệt, dùng làm mẫu giao diện/tương tác; tích hợp theo component/token hiện có |
| Xác nhận hoàn thành bài, catalog và quyền | Dịch vụ Học viện mới: 13 chương/71 bài; không lấy trạng thái mẫu làm nguồn |
| Bot, Demo Trading, Săn mã, Chiến lược | Giữ các bộ mới đã bàn giao; chỉ nối xu và lựa chọn hiển thị liên quan |

Spec này bổ sung có giới hạn, không thay toàn bộ các bộ Bot, Học viện và Chiến lược. Những ranh giới cần dùng được ghi đủ bên dưới. Các tài liệu cũ về loài linh thú được quyết định bằng trọng số năm lớp, chờ trứng nở hoặc không cho đổi loài không được ghi đè lựa chọn sở hữu/sử dụng của bản này.

HTML không phải code production, không là nguồn giá trị tài khoản, không là asset pack. Các tên hàm/bảng/API trong spec là hợp đồng logic để ánh xạ; không khẳng định chúng đã tồn tại trong repository.

### 0.2. Ma trận thực hiện

| Làm trong đợt này | Không làm trong đợt này |
|---|---|
| Shop trong thanh công cụ bên phải, ngay dưới Bot | Tạo một ứng dụng mua bán độc lập hoặc đổi toàn bộ navigation |
| Bạch Hổ miễn phí mặc định cho tài khoản mới | Khôi phục trứng/cấp độ, chọn loài theo thành tích hay chỉ báo |
| Ví xu, lịch sử xu, thưởng hoàn thành lần đầu | Nạp/rút/chuyển xu, quy đổi tiền thật, blockchain, hộp ngẫu nhiên |
| Bán bốn linh thú với giá 500 xu/con | Tạo vật phẩm, loài, bậc hiếm hoặc sức mạnh giao dịch mới |
| Mua một lần, sở hữu lâu dài; đổi sử dụng miễn phí | Tạo thêm Bot hoặc tài khoản giao dịch khi mua một linh thú |
| Nối ID linh thú với mô hình/renderer hiện có | Vẽ, dựng, cắt, tái tạo mô hình theo ảnh trong HTML |
| Lưu trữ, chống trùng, xử lý đồng thời và hồi quy | Dùng localStorage, navigator.locks hoặc nút thử thưởng làm cơ chế thật |

Không gọi model AI ở luồng cộng xu, mua hoặc đổi linh thú. Không thêm dịch vụ AI chỉ để ra quyết định thưởng/mua. Đây là nghiệp vụ xác định bằng dữ liệu tài khoản và các giá trị cấu hình cố định.

---

## 1. Những quyết định sản phẩm đã khóa

| Thuộc tính | Quy tắc |
|---|---|
| Đơn vị thưởng | Xu học tập, số nguyên |
| Xu của tài khoản mới chưa hoàn thành bài | **0 xu**; không cấp sẵn 500 xu như tình huống mẫu |
| Linh thú mặc định | **Bạch Hổ**, miễn phí, sở hữu sẵn và đang sử dụng |
| Linh thú bán | Thanh Long, Lộc Hươu, Phụng Hoàng, Kim Quy |
| Giá | **500 xu/con**, mua đúng loài người dùng chọn |
| Phần thưởng | **100 xu cho mỗi bài hoàn thành hợp lệ lần đầu** |
| Mua | Chỉ cấp quyền sở hữu; không tự chuyển con đang sử dụng |
| Sử dụng | Chủ động chọn trong số đã sở hữu; chỉ một con đang sử dụng |
| Đổi qua lại/đổi về Bạch Hổ | Miễn phí, không mua lại |
| Bản chất linh thú | Cá nhân hóa hình đại diện, không có ưu thế giao dịch |
| Tác động tới ví giao dịch | Không; xu không là vốn VND của Bot/Demo Trading/mini |
| Thời điểm đổi hình | Sau khi server xác nhận lưu, không chờ phiên giao dịch tiếp theo |

Không dùng xu để mở chỉ báo, bỏ qua bài kiểm tra, sửa điểm, tăng vốn hoặc thay nguồn mua Bot. Không bán lại linh thú hoặc hoàn xu qua một nút sản phẩm mới trong phạm vi này. Không tự thêm hết hạn xu, phí đổi loài, thuế xu hoặc reset theo tháng.

---

## 2. Tái sử dụng linh thú thật — yêu cầu bắt buộc

### 2.1. Danh mục và ánh xạ

| ID tham chiếu của mẫu | Tên giữ nguyên | Giá | Tài khoản mới |
|---|---|---:|---|
| `bach_ho` | Bạch Hổ | 0 xu | Đã sở hữu, đang sử dụng |
| `thanh_long` | Thanh Long | 500 xu | Chưa sở hữu |
| `loc_huou` | Lộc Hươu | 500 xu | Chưa sở hữu |
| `phung_hoang` | Phụng Hoàng | 500 xu | Chưa sở hữu |
| `kim_quy` | Kim Quy | 500 xu | Chưa sở hữu |

Nếu repository dùng ID khác, lập ánh xạ một-một sang ID hiện hữu, không tạo một loài thứ hai vì khác tên khóa. Giữ tên **Phụng Hoàng**, không tự sửa thành tên khác. Không dùng tên hiển thị hoặc vị trí thẻ làm khóa quyền sở hữu.

AI dev tự tìm và ghi bằng chứng cho mỗi loài: registry/ID hiện tại, tham chiếu mô hình, ảnh xem trước nếu có, component/renderer, cách nhận trạng thái đang sử dụng. Đây là bảng đối chiếu trong báo cáo triển khai, không phải yêu cầu chủ sản phẩm cung cấp thêm bộ ảnh trong khi dự án đã có.

### 2.2. Cách dùng tài nguyên

- Shop dùng ảnh xem trước hoặc cách hiển thị nhẹ đã có của từng loài. Vùng Bot/Học viện tiếp tục dùng mô hình và bộ hiển thị hiện tại. Không bắt tất cả thẻ Shop phải chạy thêm một renderer nặng độc lập.
- Không thay renderer đang chạy bằng `<img>` chỉ vì HTML mẫu dùng ảnh tĩnh. Không đổi tỷ lệ mô hình, màu, trang phục, chất liệu, rig, hoạt ảnh hoặc hiệu ứng nhận diện để giống screenshot mẫu.
- Không sao chép `SHOP_ASSETS`, `mascotAsset`, chuỗi ảnh base64/data URI hoặc đường dẫn ảnh cục bộ của HTML vào gói production. Chúng chỉ giúp mở file mẫu độc lập. Khi đọc mã, bỏ qua nội dung blob base64; không in toàn bộ ảnh nhúng vào ngữ cảnh AI để cố tái tạo linh thú.
- Chỉ ánh xạ `active_mascot_id` đã xác nhận vào renderer chuẩn. Không tính lại DNA/trọng số/loài theo bài vừa học; không sửa hồ sơ chiến lược cũ chỉ để đổi hình.
- Khi đổi loài, giải phóng hoặc tái sử dụng tài nguyên theo lifecycle hiện hữu để không nhân bộ render. Không phát hoạt ảnh nở trứng hay khởi tạo Bot lại.

Không giả định loại file của mô hình là GLB/FBX, sprite, video hay ảnh nếu chưa xem code. Nếu thiếu đúng một tham chiếu/tài nguyên trong môi trường được cấp quyền, báo ID và phần thiếu; không tự tạo linh thú thay thế. Mapping chưa xác minh thì không mở mua/sử dụng sai loài. Các loài đã có mapping hợp lệ không bị chặn vì loài khác thiếu.

Lỗi tải hình sau một giao dịch mua thành công không làm mất sở hữu, không buộc mua lại và không tự hoàn/trừ xu. Hiển thị trạng thái tải/thử lại hoặc fallback hiện hữu. Lỗi hiển thị không được sửa ID loài trong hồ sơ thành Bạch Hổ mà không có lựa chọn của người dùng.

---

## 3. Bố cục Shop theo mẫu được duyệt

### 3.1. Điểm vào và khung

Shop là công cụ trong workspace Demo Trading, nằm **ngay dưới Bot** trên thanh công cụ dọc bên phải. Khi mở Shop, giữ thanh công cụ, header và các tính năng đang có. Không thay Săn mã hoặc Học viện bằng Shop.

```text
Header IQX                         [Số dư xu → Shop]
┌─────────────────────────────────┬──────────────────────┬─────────┐
│ SHOP / LINH THÚ                 │ SHOP                 │ CÔNG CỤ │
│ Cửa hàng | Đã sở hữu            │ Xu của bạn           │ Học viện│
│                                 │ Lịch sử xu           │ Đặt lệnh│
│ Các thẻ linh thú               │ Đang sử dụng         │ Danh mục│
│ Ảnh xem trước từ IQX hiện có    │ Danh sách đã sở hữu  │ Bot     │
│ Tên / giá / Mua hoặc Sử dụng    │ Vào Học viện         │ Shop    │
│                                 │                      │ Săn mã… │
└─────────────────────────────────┴──────────────────────┴─────────┘
```

Mẫu mở Shop đầu tiên để duyệt. **Không đổi onboarding của sản phẩm:** người dùng mới vào Học viện với Bạch Hổ; Shop được mở khi người dùng chọn. Route/query dùng router thật, không lấy tên biến `route` hoặc file HTML làm route production mới.

### 3.2. Vùng chính

| Thành phần | Hành vi |
|---|---|
| Tiêu đề Linh thú và `x / 5 đã sở hữu` | Đếm quyền sở hữu, gồm Bạch Hổ, không đếm số lần mua |
| Tab **Cửa hàng** | Hiển thị bốn linh thú có giá 500 xu; con đã mua vẫn có trạng thái sử dụng phù hợp |
| Tab **Đã sở hữu** | Hiển thị Bạch Hổ và các con đã sở hữu, có nút đổi sử dụng |
| Thẻ linh thú | Tên, vùng ảnh từ tài nguyên thật, giá khi chưa sở hữu, trạng thái và một nút chính |

| Trạng thái thẻ | Nội dung/nút |
|---|---|
| Chưa sở hữu, đủ 500 xu | Giá 500 xu; **Mua** |
| Chưa sở hữu, thiếu xu | Giá 500 xu; **Chưa đủ xu** bị khóa |
| Đã sở hữu, chưa chọn | Đã sở hữu; **Sử dụng** |
| Đang sử dụng | Đã sở hữu; **Đang sử dụng**, không tạo một thao tác mua |
| Bạch Hổ trong bộ sưu tập | Linh thú mặc định; Sử dụng hoặc Đang sử dụng; không có giá bán |

Không thêm thuộc tính công/thủ, tỷ lệ thắng, độ hiếm, điểm lợi nhuận hoặc ưu thế chỉ báo vào thẻ. Linh thú chưa mua vẫn xem được tên/ảnh/giá khi người dùng có quyền truy cập workspace.

### 3.3. Panel phải, header và lịch sử

Panel gồm: **Xu của bạn → số dư → số bài hoàn thành → Lịch sử xu → Đang sử dụng → Đã sở hữu → Vào Học viện**. Nút Xem trong Bot mở đúng công cụ Bot hiện có, không tạo tài khoản/linh thú mới. Nút Vào Học viện chỉ điều hướng, không hoàn thành bài hoặc nhận xu.

Số dư trên header, panel và modal lấy cùng nguồn. Trên màn nhỏ, giữ rail bên phải; panel đóng/mở cạnh rail theo mẫu Bot mới. Shop có chỗ xem xu/lịch sử ngay trong vùng chính khi panel đóng. Không quay lại bố cục rail ngang của các mẫu Học viện cũ.

Dùng token/component hiện có để đạt hình thức tương đương. Giữ bố cục, thứ tự và thao tác; không ép toàn bộ website theo pixel của file mẫu. Tên dài không che nút; không tràn ngang toàn trang ở 360/390 px; modal cuộn được, xác nhận/Hủy dùng được. Có focus, label, trạng thái khóa; màu không là thông tin duy nhất. Tôn trọng giảm chuyển động bằng cơ chế hiện hữu.

---

## 4. Ví xu và lịch sử

Một ví xu theo **người dùng**, không theo loài, chương, Bot, tab hay thiết bị. Ví tách khỏi sổ VND giao dịch. Có thể tái sử dụng hạ tầng ví/ledger phù hợp nhưng phải phân loại đơn vị và nghiệp vụ rõ, không ghi xu vào `cash_vnd`.

| Giá trị | Cách tính |
|---|---|
| Số dư xu | Tổng các bút toán xu đã ghi nhận hợp lệ |
| Xu đã nhận | Tổng bút toán tăng trong phạm vi lịch sử được hiển thị |
| Xu đã sử dụng | Giá trị tuyệt đối tổng bút toán chi tương ứng |
| Số bài đã hoàn thành | Nguồn completion Học viện, không suy ngược từ số xu |

Số dư là số nguyên không âm. Không dùng float, không để `NaN` hoặc thiếu response thành 0 rồi ghi đè. Không tính ví bằng `số bài × 100 − số linh thú sở hữu × 500`: Bạch Hổ và quyền kế thừa có thể miễn phí, phần thưởng có thể đang đồng bộ.

**Lịch sử xu** có Thời gian, Nội dung, Xu tăng/giảm, Số dư sau bút toán. Ví dụ: Hoàn thành bài RSI +100; Mua Thanh Long −500. Thứ tự dựa trên trình tự commit của ví, không chỉ thời gian có thể bằng nhau. Dùng thời gian ghi thật và múi giờ hiển thị IQX; không lấy ngày thị trường hoặc đồng hồ mẫu. Được phân trang nhưng truy cập đủ lịch sử, không chỉ giữ 20 dòng đầu.

Bút toán đã ghi là bất biến. Không xóa lịch sử để làm lại số dư. Nếu có nghiệp vụ sửa sai nội bộ đã được phê duyệt, dùng bút toán đối ứng có tham chiếu và audit theo hệ thống; đợt này không tạo thêm một màn quản trị ví tùy ý.

---

## 5. Thưởng hoàn thành bài lần đầu

### 5.1. Điều kiện thưởng

| Loại bài trong catalog mới | Số bài | Xác nhận hoàn thành | Xu lần đầu |
|---|---:|---|---:|
| Chỉ báo kỹ thuật | 16 | Server xác nhận bài kiểm tra 8 câu, đạt 8/8 | +100 |
| Chỉ tiêu cơ bản | 42 | Server xác nhận bài kiểm tra 8 câu, đạt 8/8 | +100 |
| Hợp lưu | 1 | Server xác nhận 8/8 | +100 |
| Hướng dẫn Backtest/Bộ lọc, Chương 2/4 | 12 | Nút Hoàn thành bài học trên nội dung đã xuất bản, server xác nhận | +100 |

Mỗi bài hợp lệ trong 71 bài đều cùng mức 100 xu. Giữ nguyên cách hoàn thành từng loại: không bỏ kiểm tra kiến thức, không thêm kiểm tra/giờ đọc/số lệnh/lợi nhuận cho bài hướng dẫn. Không yêu cầu hoàn thành cả chương mới thưởng.

Chỉ mở bài, kéo cuối trang, xem ảnh, làm 7/8, chạy mini, chạy Backtest, lọc, áp dụng danh mục hoặc giao dịch lãi không nhận xu. Một lượt luyện không là bài học. Bài chỉ có tên/placeholder chưa xuất bản không thể được hoàn thành để nhận thưởng.

### 5.2. Một bài chỉ có một phần thưởng

Khóa duy nhất logic: **người dùng + họ phần thưởng hoàn thành lần đầu + định danh bài học ổn định**. Không dùng mỗi attempt, mỗi event, số thứ tự chương hoặc phiên bản nội dung làm khóa cấp thêm xu.

| Tình huống | Kết quả |
|---|---|
| Hoàn thành lần đầu, thưởng chưa tồn tại | Một bút toán +100 |
| Nộp lại cùng attempt hoặc gửi lại sau timeout | Trả kết quả đã có, không cộng thêm |
| Làm lại bài đã đạt và lại 8/8 | Không thưởng lần hai |
| Sau khi đạt, làm lại chưa đạt | Không trừ xu cũ, không mất completion/quyền |
| Đổi tên, số chương, ID vị trí hoặc sửa bản nội dung cùng bài | Map về cùng bài ổn định; không thưởng thêm |
| Hai thiết bị hoàn thành cùng bài | Một completion hợp lệ và tối đa một thưởng |
| Tắt chỉ báo, đổi linh thú hoặc chi hết xu | Không làm bài quay về trạng thái chưa nhận thưởng |

Khóa thưởng không bao gồm phiên bản chính sách theo cách cho phép deploy bản mới thưởng lại mọi bài. Version vẫn lưu để audit, còn việc thưởng lần đầu giữ một khóa xuyên nâng cấp.

### 5.3. Nối vào sự kiện thật

```text
Dịch vụ Học viện xác minh attempt/hoàn thành hướng dẫn
→ lưu completion hợp lệ (một lần)
→ ghi sự kiện tin cậy hoặc outbox cùng transaction
→ nghiệp vụ thưởng xác minh completion + mapping bài
→ kiểm tra thưởng chưa có
→ ghi +100 vào ví (nguyên tử, chống trùng)
→ thông báo trạng thái mới cho giao diện
```

Nếu cùng backend có thể commit completion, quyền và thưởng an toàn trong một giao dịch thì tái sử dụng cách đó. Nếu tách dịch vụ, dùng outbox/retry/đối soát; không gọi cộng xu từ callback trình duyệt tự khai `passed=true`. Client không được gửi số thưởng, điểm hoặc owner như sự thật.

Hoàn thành bài vẫn là dữ liệu của Học viện. Shop **không trở thành nguồn completion** và không ghi đè progress/grants từ ví. Việc mẫu gán `completedIds` từ biến `SHOP.completions` chỉ phục vụ xem thử.

Nếu completion đã lưu nhưng thưởng chưa xong, giữ **✓ Đã học**, thể hiện “Đang cập nhật xu” khi cần và tự xử lý lại từ bằng chứng. Không bắt người học thi lại và không báo +100 đã nhận trước khi bút toán được xác nhận. Grant chỉ báo, xu và trạng thái giao dịch là ba việc độc lập.

Thông báo thành công: **Hoàn thành bài học · +100 xu**; có thể hiện số dư và nút Vào Shop theo mẫu. Không có nút Nhận thưởng riêng. Các nút Thử lại sự kiện/Mô phỏng hoàn thành chỉ dùng ở HTML, phải loại khỏi production. Thông báo thưởng không thay màn kết quả bài kiểm tra hoặc làm mất phần giải thích đã được duyệt.

---

## 6. Mua linh thú bằng xu

### 6.1. Luồng giao diện

```text
Mua tại một thẻ chưa sở hữu
→ modal đúng tên/hình từ tài nguyên hiện có
→ số dư hiện tại / giá 500 / số dư dự kiến sau mua
→ Hủy hoặc Mua · 500 xu
→ xử lý trên server
→ đã sở hữu, số dư mới
→ Để sau hoặc Sử dụng
```

Mở modal chưa tiêu xu. Hủy không ghi mua hoặc sở hữu. Nút xác nhận bị khóa trong lúc chờ. Đã commit nhưng response bị mất phải truy lại cùng giao dịch; không tạo lần mua mới để “thử lại”.

### 6.2. Nghiệp vụ server

Trong một giao dịch có khóa ví/kiểm soát đồng thời tương đương:

1. Xác thực owner theo phiên đăng nhập, loại nghiệp vụ và khóa chống trùng. Request đã xử lý thì trả kết quả tương ứng trước khi kiểm tra revision cũ làm retry thất bại sai.
2. Resolve đúng linh thú/catalog từ server, kiểm tra được bán và mapping tài nguyên hợp lệ. Giá lấy từ server; số người dùng thấy chỉ dùng để kiểm tra không thay giá ngoài xác nhận.
3. Kiểm tra quyền sở hữu `(owner, mascot_id)`. Đã sở hữu thì không trừ xu, kể cả client dùng request ID mới.
4. Đọc/khóa số dư hiện tại; yêu cầu ít nhất 500 xu. Không tin số dư lúc mở modal.
5. Ghi giao dịch mua, bút toán −500 và quyền sở hữu trong cùng transaction. Sau commit, số dư không âm.
6. Trả giao dịch, số dư, revision và sở hữu đã xác nhận. **Không ghi `active_mascot_id` trong bước mua.**

Nếu một trong các bước ghi thất bại, rollback toàn bộ giao dịch mua: không có trừ xu mà thiếu sở hữu hoặc cấp sở hữu miễn phí. Ràng buộc duy nhất cho ownership và request phải nằm trong cơ sở dữ liệu/backend, không chỉ disable nút.

Ví dụ đồng thời: có 600 xu, hai tab mua hai con khác nhau giá 500; chỉ một giao dịch được commit, còn 100 xu. Có 1.000 xu thì hai lần mua hợp lệ có thể thành công lần lượt, còn 0. Hai tab mua cùng một con chỉ trừ một lần.

### 6.3. Lỗi và tranh chấp

| Tình huống | Hành vi |
|---|---|
| Số dư hiện tại thiếu | Không trừ/cấp; báo số dư mới và Chưa đủ xu |
| Đã sở hữu do mua trên thiết bị khác | Hiện đã sở hữu; không trừ tiếp |
| Thay giá/catalog sau khi mở modal | Không tự thu giá khác; cập nhật và yêu cầu xác nhận lại |
| Cùng request ID nhưng payload khác | Từ chối, không tái dùng để mua loài khác |
| Timeout không rõ đã commit | Kiểm tra trạng thái request; giữ trạng thái đang xác minh, không báo thất bại chắc chắn rồi cho chi lần hai |
| Mua thành công nhưng ảnh chưa tải | Sở hữu và bút toán giữ đúng; cho tải lại tài nguyên, không mua lại |

Không phát sinh giao dịch Bot, đổi nguồn mua, bật chỉ báo hoặc cấp VND từ thao tác mua linh thú. Mua không mở quyền chỉ báo hay quyền gói ngoài chính sách truy cập thật.

---

## 7. Sử dụng linh thú đã sở hữu

Server kiểm tra ID hợp lệ và quyền sở hữu. Chỉ cập nhật **linh thú đang sử dụng trong hồ sơ hiển thị**, dùng revision riêng hoặc cơ chế phù hợp của profile; không tăng shared-config revision, policy version hoặc tạo pending theo phiên giao dịch.

| Thao tác | Kết quả |
|---|---|
| Sử dụng con đã mua | Lưu lựa chọn, cập nhật đúng hình/tên qua renderer hiện có |
| Chọn lại con đang sử dụng | Không phát sinh chi phí hoặc ghi trùng không cần thiết |
| Đổi sang con khác đã sở hữu | Miễn phí, giữ tất cả quyền sở hữu |
| Đổi về Bạch Hổ | Miễn phí, không mất con đã mua |
| Gọi trực tiếp để dùng con chưa sở hữu | Từ chối, giữ lựa chọn cũ |
| Lưu thất bại/xung đột phiên bản | Không giả thành công; refetch trạng thái xác nhận, không ghi đè lựa chọn mới bằng tab cũ |

Sau commit, cập nhật các vị trí hiện đang thể hiện linh thú của người dùng ở Bot/Học viện/workspace; không thêm linh thú vào những màn trước đây không có chỉ để khoe. Phân biệt con đang **xem trước** trong Shop với con đang **sử dụng** thực sự.

Không đổi tên người dùng hoặc tên chiến lược khi đổi loài. Nếu các sự kiện Bot hiện có điều khiển animation của loài đang dùng, giữ bộ ánh xạ sự kiện phù hợp; không đổi thuật toán để phù hợp “tính cách” linh thú. Không tự đổi lại về loài tính từ DNA khi worker chạy hoặc người dùng học bài tiếp.

---

## 8. Dữ liệu và API logic

### 8.1. Các đối tượng cần có

| Đối tượng | Dữ liệu tối thiểu và ràng buộc |
|---|---|
| Danh mục linh thú | ID ổn định, tên, giá xu, được bán, thứ tự, catalog version, tham chiếu **tài nguyên IQX hiện có** |
| Ví xu | Owner, đơn vị xu, số dư, wallet revision hoặc trình tự sổ, thời điểm cập nhật |
| Bút toán xu | ID, owner/wallet, loại, delta nguyên, số dư sau, số thứ tự commit, nguồn completion/purchase, timestamps, khóa duy nhất |
| Bằng chứng thưởng | Stable lesson key, completion reference, thời điểm hoàn thành, ledger reference, reward policy version; một lần/người/bài |
| Giao dịch mua | Owner, mascot ID, giá đã xác nhận, request ID/hash, catalog version, ledger ID, trạng thái commit |
| Sở hữu | Owner + mascot ID duy nhất; thời điểm, nguồn `default/purchase/legacy_grant` hoặc chuẩn tương đương, tham chiếu nguồn |
| Lựa chọn hiển thị | Active mascot ID thuộc tập đã sở hữu, cosmetic revision, thời điểm cập nhật |

Tách sở hữu khỏi bút toán mua để bảo toàn linh thú người dùng đã có trước Shop. Không suy rằng “không có purchase row = không sở hữu”. Bạch Hổ/loài được giữ lại từ hồ sơ cũ không cần tạo bút toán −500 giả.

### 8.2. Hợp đồng thao tác, không bắt endpoint mới

| Nghiệp vụ | Input đáng tin/kiểm tra | Output |
|---|---|---|
| Đọc Shop | Owner từ auth | Catalog thật, ví, sở hữu, active, revisions/readiness |
| Đọc lịch sử xu | Owner từ auth, cursor hợp lệ | Toàn bộ ledger qua phân trang; số dư/tổng theo phạm vi đúng |
| Thưởng hoàn thành | Completion/outbox nội bộ có thể xác minh | Reward có sẵn hoặc commit mới, không public “cộng bao nhiêu xu” |
| Mua | Mascot ID, idempotency key, thông tin xác nhận catalog/giá; mọi giá trị resolve lại ở server | Giao dịch duy nhất, ví và sở hữu sau commit |
| Sử dụng | Mascot ID, phiên bản profile được đọc, request ID nếu hệ thống dùng | Active/revision mới hoặc không thay nếu đã chọn |
| Khởi tạo hồ sơ mới | Nghiệp vụ onboarding/ensure có auth | Ví 0, sở hữu/active Bạch Hổ một lần; không cấp lại vốn |

Ví dụ request mua, chỉ là hình dạng để ánh xạ:

```json
{
  "mascot_id": "thanh_long",
  "expected_price_xu": 500,
  "catalog_version": "<phiên bản đọc từ server>",
  "idempotency_key": "<khóa duy nhất của lần xác nhận>"
}
```

Server không lấy `expected_price_xu` làm giá được thu; dùng nó để phát hiện giá đã đổi so với lúc xác nhận. Không nhận `owner_id`, `balance`, `owned=true`, `grant=true` hoặc số thưởng từ client làm nguồn chuẩn. Không cho người dùng dùng ID completion của người khác.

### 8.3. Đồng thời, đồng bộ và tính độc lập

Đồng thời thưởng và mua cùng ví cũng phải dùng cùng khóa/trình tự sổ. Không chỉ khóa riêng các lần mua. Cùng request khi retry trả cùng kết quả nghiệp vụ; response cũ không được ghi đè trạng thái ví/active có revision mới hơn. Giao diện có thể đọc lại trạng thái mới nhất sau khi phục hồi.

Đổi tab/thiết bị/refetch không tạo xu. GET chỉ đọc; không cấp tiền trong renderer hoặc callback ảnh. Khi đăng xuất/đổi tài khoản, xóa cache cá nhân hiển thị để không rò ví/sở hữu của người khác; dữ liệu bền vững vẫn ở server.

Validation, transactions, authorization và idempotency áp theo hạ tầng dự án. Không yêu cầu đổi database/framework, dựng microservice, thanh toán hay blockchain chỉ vì có xu. Không log token/mật khẩu hoặc đưa dữ liệu riêng của tài khoản khác vào lỗi.

---

## 9. Tích hợp Học viện, Bot và Chiến lược

| Thành phần | Thêm trong đợt này | Bất biến phải giữ |
|---|---|---|
| Học viện | Nối thưởng 100 xu sau completion lần đầu; trạng thái nhận thưởng, đồng bộ ví | 13 chương/71 bài, 8/8 hoặc nút đúng loại; Xem bài/Đã học; không Cấu hình/ON/OFF tại dòng bài |
| Bot | Đọc active mascot từ profile đã xác nhận; điểm vào Shop; hình/tên qua renderer hiện có | Cấu hình 16 chỉ báo, tài khoản, tiền, danh mục, source và worker không đổi |
| Demo Trading | Điểm truy cập Shop trong workspace; xu ở header nếu dùng chung component | Đặt lệnh bình thường; vốn ban đầu 100 triệu cấp một lần; không khóa bởi xu/học |
| Săn mã/Theo dõi | Giữ navigation và dữ liệu | Độc lập Shop, không thu xu khi tích theo dõi |
| Mini luyện tập | Giữ renderer liên quan nếu có, còn lại không đổi | 30 mã, giấu mã/ngày, xem 6 tháng/chạy 24 tháng, 100% vốn, max giữ 60 phiên chỉ mini; không thưởng xu từ lượt |
| Chiến lược | Chỉ đọc xu/loài nếu header/profile chung đang hiển thị | Cảnh báo, Backtest, Bộ lọc, snapshots và quyền không đổi |

Bot tiếp tục mua mới trong VN30 hoặc danh mục Bộ lọc đã áp dụng; bán mọi vị thế theo điều kiện Bán, không có stop/chốt lời/thời gian giữ ngầm. Mua linh thú không có nghĩa mua danh mục, bật Bot hoặc thay chỉ báo. Không sửa bất kỳ policy tài chính nào trong bảng trên bằng code Shop.

Nếu bộ Bot/Học viện mới chưa được tích hợp, dev làm trên đúng kiến trúc đích và nối phần đã đủ đầu vào. Không sửa các cổng cấp độ cũ bằng cách giả hoàn thành 71 bài để Shop có tiền. Không dựng lại toàn bộ sản phẩm trong file này.

---

## 10. Người dùng hiện hữu, cộng bù và chuyển đổi

### 10.1. Giữ dữ liệu đang có

| Nhóm | Xử lý |
|---|---|
| Tài khoản mới thực sự chưa có lựa chọn | Bạch Hổ owned/active, ví 0; có thể thưởng khi hoàn thành bài hợp lệ |
| Người dùng cũ đang dùng một trong năm linh thú | Giữ con đang dùng và ghi nhận sở hữu kế thừa; Bạch Hổ có sẵn; không ép về Bạch Hổ, không yêu cầu mua lại |
| Người dùng cũ có dữ liệu sở hữu hợp lệ | Bảo toàn toàn bộ quyền, không suy về chỉ một con dựa vào active |
| Có ví xu/bút toán hệ thống trước đó | Đối soát phạm vi/đơn vị/nguồn; không reset hoặc gộp điểm không cùng hệ một cách ngầm định |
| Có ID loài cũ không ánh xạ chắc chắn | Giữ bằng chứng, báo ngoại lệ cụ thể; không tự chọn loài khác hoặc xóa trạng thái |
| Có trạng thái/tiền trong HTML prototype | Không nhập vào tài khoản thật hoặc dùng làm bằng chứng |

Bạch Hổ là mặc định mới, không phải lệnh tìm/thay mọi `mascot_id` trên toàn hệ thống. Lựa chọn này thay phần “chưa chốt mặc định loài” trong spec Bot trước; từ bản Shop không cần hỏi lại loài mặc định.

### 10.2. Đối soát phần thưởng của bài đã học trước Shop

Chuẩn bị phương án cộng bù **100 xu/bài đã hoàn thành hợp lệ còn được ánh xạ vào catalog hiện tại và chưa từng nhận thưởng**. Không bắt học/thi lại. Chạy dry-run danh sách tài khoản, completion nguồn, reward key, số xu trước/sau; chỉ chạy tác vụ ghi cộng bù khi được phê duyệt trong quá trình triển khai. HTML không chứng minh đã có dữ liệu cũ đủ điều kiện hay tác vụ cộng bù đã chạy.

Phần đề xuất cộng bù cho toàn bộ tài khoản cũ phải được ghi riêng trong báo cáo migration; không tự xem việc có con số progress là đã có bằng chứng cho từng bài. Nếu chưa được phê duyệt tác vụ hồi tố, giữ danh sách ứng viên và báo phần chờ, không tự cộng một khoản “bù 500 xu”. Thưởng các completion mới vẫn đi qua luồng realtime đã khóa.

Backfill và thưởng realtime dùng **cùng khóa duy nhất theo người/bài**, không có hai namespace khiến một completion được cộng hai lần. Bút toán cộng bù lưu thời gian ghi hiện tại, kèm thời gian hoàn thành cũ; không giả đã cộng xu từ ngày học trước đây.

Khi đổi catalog: `ch07-l01` cũ là ATR không được biến thành OBV của catalog mới. Các chương định giá/tăng trưởng/ổn định/cổ đông đổi số cần map theo nội dung ổn định; các bài đã loại không được thưởng như một bài mới trùng vị trí. Nếu thiếu mapping/bằng chứng, báo đúng ngoại lệ, không suy từ tổng điểm hay file mẫu.

### 10.3. Chuyển đổi an toàn

Backup, dry-run, kiểm tra tổng ví/ledger/ownership/completions và active thuộc sở hữu trước/sau. Khởi tạo, seed catalog, reward và backfill chạy lại không nhân dữ liệu. Không chạy hai đường cộng thưởng cũ/mới cùng tạo bút toán khác khóa.

Không xóa/sửa giao dịch cổ phiếu, vị thế, vốn, cổ tức chờ nhận, danh mục theo dõi hoặc quyền học. Khi rollback code, không drop ledger/ownership đã phát sinh hợp lệ, không phục hồi việc loài tự đổi theo DNA và không cấp vốn lần nữa. Chỉ deploy/chạy migration ghi khi có quyền môi trường.

---

## 11. Quy ước thông báo và trạng thái lỗi

| Tình huống | Nội dung/thao tác |
|---|---|
| Hoàn thành và thưởng thành công | Hoàn thành bài học · +100 xu; cập nhật ví từ kết quả server |
| Bài đã nhận thưởng | Không cộng thêm; không hiển thị như vừa thưởng mới |
| Hoàn thành thành công, thưởng đang xử lý | Đã học; đang cập nhật xu, tự đối soát không bắt học lại |
| Thiếu xu trước mua | Chưa đủ xu; có đường vào Học viện, không mở màn nạp tiền |
| Mua thành công | Đã sở hữu {tên}; số dư mới; Để sau / Sử dụng |
| Mua trùng | Đã sở hữu; không trừ thêm xu |
| Đổi thành công | Đang sử dụng {tên}; giữ tài khoản/cấu hình |
| Lỗi ví hoặc đọc quyền | Loading/lỗi ở đúng vùng; không thay bằng 0/không sở hữu rồi lưu đè |
| Tài nguyên lỗi | Tải lại/fallback hiện hữu; không làm mất giao dịch mua hoặc chọn loài khác |
| Request bị từ chối | Không cập nhật thành công giả; giữ trạng thái đã xác nhận |

Không thêm giải thích kỹ thuật dài vào thẻ Shop. Metadata, số revision, ledger và mapping chi tiết thuộc spec/báo cáo kỹ thuật hoặc trạng thái cần tra cứu; không hiển thị raw JSON cho người dùng. Không đưa các nút thử thưởng/đặt lại mẫu lên production.

---

## 12. HTML bàn giao: dùng đúng vai trò

### 12.1. Nhận diện và thay đổi so với mẫu đã duyệt

- Nguồn đã duyệt: `IQX-Shop-Xu-Linh-Thu-MAU-v1.0.html`.
- File bàn giao: `IQX-Bo-Shop-Xu-Linh-Thu-MAU-v1.0.html`.
- Nguồn: 473,353 byte; SHA-256 `61a728c731bf246e7ec99d9342a0cc0940b6af9e5150473d2b87c987279cc4bd`.
- Bản bàn giao: 475,061 byte; SHA-256 `8ad52324ff6e2e6233d78c5d240c401e9d031f28bce538f2af0f35179d9ca5e3`.
- Hai file **không nguyên byte** vì bổ sung chỉ dẫn tái sử dụng tài nguyên; không thay hình thức Shop hoặc logic tương tác. Mã phiên bản 1.0 là phiên bản cặp bàn giao, không khẳng định code đã production-ready.

HTML giữ nguyên CSS, tài nguyên ảnh minh họa và các luồng Mua/Sử dụng/thưởng xem thử của bản đã được đồng ý. Chỉ bổ sung ghi chú đầu file, chú thích tại `SHOP_ASSETS` và nội dung trong **Thông tin mẫu** để nhấn mạnh phải dùng lại mô hình IQX hiện có. Không có linh thú được tạo mới trong lần bàn giao này.

File tự chứa để mở xem; không cần cài thư viện hoặc tải ảnh ngoài. Có các phần Bot/Học viện/đặt lệnh/Săn mã được kế thừa nhằm xem ngữ cảnh. **Chúng không là yêu cầu thay toàn bộ những module đó bằng code mẫu.**

### 12.2. Những phần bắt buộc thay/bỏ khi triển khai thật

| Trong HTML | Production |
|---|---|
| `SHOP_ASSETS`, `mascotAsset`, ảnh base64 | Chỉ minh họa; không dùng làm asset pack. Resolve mô hình/ảnh/renderer thật theo loài |
| `petAsset`, thay `.mascot-image.src` | Nối lựa chọn cosmetic vào component/renderer hiện có, không thay bằng img tĩnh |
| `SHOP_MASCOTS` và các trường `glow` | Tham chiếu tên/giá/thứ tự; không đổi artwork/chất liệu loài theo màu CSS |
| `newShopState(5)` và dữ liệu có 500 xu ban đầu | Tài khoản mới 0 xu; không seed 5 bài đã học |
| `SHOP.completions`, gán lại `completedIds` | Đọc completion/grants từ Học viện; Shop không sở hữu tiến độ |
| `completeLessonPreview`, reward modal, nút Thử lại sự kiện | Nghiệp vụ nội bộ từ completion xác minh; không endpoint public cấp xu |
| `ownedMascots()` suy từ purchase trong mảng | Ownership bền vững gồm default/purchase/legacy; không làm mất linh thú cũ |
| `shopTransaction`, `navigator.locks`, JS validation | Transaction/ràng buộc duy nhất/auth backend thật |
| `localStorage`, `SHOP_KEY`, state toàn bộ file | Chỉ xem thử cục bộ; không nhập dữ liệu này vào production |
| Bộ chọn 0/5/20/71 bài, Đặt lại mẫu, `resetShopSample` | Loại khỏi production; không reset Bot/vốn/Học viện |
| `IQX_SHOP_PREVIEW`, `IQX_BOT_PREVIEW`, dữ liệu nến/quyền giả | Không là API/auth thực; không expose lệnh thử trên tài khoản thật |

### 12.3. Điểm tìm trong HTML

| Luồng | Tên tham chiếu để tìm |
|---|---|
| Catalog chương/bài | `script#catalogData` |
| Catalog và tài nguyên mẫu | `SHOP_MASCOTS`, `SHOP_ASSETS` |
| Vùng Shop và panel | `renderShopMain`, `renderShopPanel`, `shopCard`, `ownedAction` |
| Ví và lịch sử mẫu | `coinBalance`, `openShopHistory` |
| Xác nhận và mua | `askShopPurchase`, `purchaseMascot` |
| Sử dụng | `equipMascot` |
| Sự kiện thưởng xem thử | `openRewardPreview`, `completeLessonPreview`, `renderRewardDetail` |
| Nối vùng linh thú/header/rail | Các wrapper `renderMain`, `renderWorkspace`; nút `data-route="shop"` |
| Thông tin giới hạn mẫu | `shopInfo` |

Các tên này chỉ giúp đọc file, không bắt đặt component/API thật y hệt. Không dùng monkey-patch các hàm toàn cục như mẫu để thay kiến trúc dự án khi đã có store/service phù hợp.

### 12.4. Kiểm tra HTML trong lần bàn giao

Đã kiểm tra cú pháp JavaScript và 33 điểm tương tác cục bộ bằng Chromium: 500 xu của tình huống mẫu, mua/xác nhận/không tự equip, đổi loài và trở về Bạch Hổ, trùng mua/trùng thưởng, thiếu xu, không sử dụng loài chưa sở hữu, lịch sử, không đổi state Bot/tiền thủ công, không có công tắc giao dịch trong Học viện, thông báo dùng lại model hiện có và bố cục 1440/1024/900/390/360 px. Trong các lượt đó không có lỗi JavaScript hoặc request mạng bên ngoài.

**Giới hạn kiểm tra:** môi trường trình duyệt chặn điều hướng file bằng chính sách quản trị, nên nạp HTML bằng `set_content` và kiểm tra trong bộ nhớ. Chưa xác nhận persistence qua đóng/mở trình duyệt, native localStorage reload, đồng bộ hai thiết bị hoặc giao dịch đồng thời thực. Bản mẫu hỗ trợ lưu cục bộ khi trình duyệt cho phép; điều đó không thay yêu cầu lưu server.

Các kết quả trên chỉ xác nhận mẫu tương tác. Không chứng minh giao dịch database nguyên tử, quyền người dùng, nhiều thiết bị, backfill hoặc parity mô hình/animation hiện hữu. Không có truy cập repository IQX hoặc kết nối account thật trong lần soạn hai file này.

---

## 13. Ca nghiệm thu dành cho AI dev

**Các ca dưới đây phải thực hiện trên mã nguồn/môi trường được cấp quyền; chưa phải kết quả production.** Dùng tài khoản/dữ liệu kiểm thử, không cộng xu hoặc mua thay người dùng thật. Báo input, expected/actual, file test, lệnh và môi trường. Những phép thử đồng thời phải chạy ở backend, không lấy disable nút hoặc mẫu localStorage làm bằng chứng.

### A. Tài nguyên linh thú và giới hạn phạm vi

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| A01 | Website đã có năm loài trong registry. | Audit và lập mapping trước tích hợp. | Mỗi ID Shop trỏ đúng ID/model/thumbnail/renderer hiện hữu; báo đường dẫn tìm được, không tạo loài mới. |
| A02 | Ảnh mẫu khác mô hình đang có trong IQX. | Tích hợp thẻ Shop và vùng Bot. | Giữ mô hình IQX. Không dựng lại ngoại hình/rig/texture/animation để giống HTML. |
| A03 | HTML có SHOP_ASSETS, mascotAsset, base64. | Kiểm tra bundle/assets production. | Không nhập ảnh mẫu thành asset của sản phẩm; không thay renderer có sẵn bằng img tĩnh. |
| A04 | Một loài thiếu mapping rõ ràng trong môi trường dev. | Mở Shop/chọn loài đó. | Báo đúng ID và tham chiếu thiếu, không giả ghép loài khác/thu xu cho mapping sai; không tự gọi AI tạo ảnh. |
| A05 | Người dùng chọn qua lại nhiều loài đã sở hữu. | Đổi 20 lần trong workspace kiểm thử. | Renderer cập nhật đúng loài; không tạo nhiều vòng render rò tài nguyên, không phát lại nở. |
| A06 | Đã mua/sử dụng hợp lệ, tài nguyên tải lỗi. | Mở Bot/Học viện và thử lại. | Giữ ownership/active/ledger; dùng lỗi hoặc fallback hiện có, không mua lại/hoàn xu/reset hồ sơ tự động. |
| A07 | Tài khoản đang dùng Thanh Long. | Học thêm bài hoặc chạy worker Bot. | Không tự đổi về Bạch Hổ hay loài tính từ trọng số cũ; không thay tham số chiến lược theo loài. |
| A08 | Shop, ví và bộ hiển thị đã tích hợp. | Theo dõi đường gọi khi thưởng/mua/đổi. | Không gọi LLM, dịch vụ sinh ảnh, dựng model hoặc hệ thống thanh toán tiền thật trong các nghiệp vụ này. |

### N. Khởi tạo và giao diện

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| N01 | Tài khoản mới chưa học, chưa có cosmetic profile. | Khởi tạo theo luồng có auth. | 0 xu; sở hữu và sử dụng Bạch Hổ; không cấp 500 xu hoặc giả đã học năm bài. |
| N02 | Tài khoản mới đã được khởi tạo. | Retry onboarding, đăng nhập hai thiết bị. | Một ví và một quyền mặc định; không cộng lại xu hoặc vốn Bot/Demo Trading. |
| N03 | Người dùng chưa học chỉ báo nào. | Mở Shop qua rail. | Đọc được bốn con bán/giá và Bạch Hổ đã sở hữu; không yêu cầu học đủ chương hoặc bật Bot. |
| N04 | Khung Bot/Học viện mới đang hoạt động. | Mở Shop rồi quay lại các công cụ. | Shop ngay dưới Bot; rail giữ, Săn mã không mất, không có tab Shop cấp cao mới thay khung đã duyệt. |
| N05 | Tài khoản chỉ sở hữu Bạch Hổ. | Chuyển Cửa hàng/Đã sở hữu. | Cửa hàng bốn con 500 xu; Đã sở hữu có Bạch Hổ miễn phí; bộ đếm 1/5. |
| N06 | Có 499, 500 và 501 xu ở ba tài khoản thử. | Xem một con chưa mua. | 499: Chưa đủ xu; 500/501: Mua được về nghiệp vụ. Trạng thái đọc từ nguồn xác nhận, không rounded sai. |
| N07 | Viewport 1440/1024/900/390/360 px. | Mở Shop, panel, mua, lịch sử. | Không tràn ngang toàn trang; rail phải, modal/nút dùng được, panel đóng không chặn focus nền. |
| N08 | Dùng bàn phím/giảm chuyển động. | Chuyển tab, mở/đóng modal, chọn loài. | Label/focus/trạng thái đọc được; đóng trả focus; nút khóa không thực thi; không bắt animation nặng để đổi. |

### R. Thưởng hoàn thành bài

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| R01 | Bài RSI đã xuất bản, chưa hoàn thành/chưa thưởng. | Nộp 7/8 rồi một attempt hợp lệ 8/8. | 7/8 không thưởng; lần 8/8 đầu một completion và +100, không tự bật RSI/Bot. |
| R02 | Bài ROE và Hợp lưu đều có đề thật, chưa thưởng. | Hoàn thành 8/8 từng bài. | Mỗi bài +100; ROE mở quyền theo Học viện, Hợp lưu không tạo chỉ báo; Shop không thay grant. |
| R03 | Một bài hướng dẫn Chương 2 hoặc 4 đã xuất bản. | Bấm Hoàn thành lần đầu. | +100 sau xác nhận; không bắt thi/đọc đủ phút/lưu filter/chạy Backtest hoặc có lãi. |
| R04 | Chỉ có tên/khung bài, không nội dung hay đề được xuất bản. | Gọi hoàn thành hoặc claim thưởng trực tiếp. | Không completion/grant/xu giả; báo đúng điều kiện chưa đáp ứng. |
| R05 | Bài đã nhận +100. | Đọc lại, làm lại đạt hoặc không đạt, lặp click/nộp. | Không cộng/trừ thêm; completion và quyền cũ giữ; tổng thưởng bài vẫn 100. |
| R06 | Cùng bài hoàn thành được hai tab/worker xử lý; request ID có thể khác. | Chạy đồng thời/retry. | Ràng buộc stable lesson key giữ một thưởng; không chỉ dựa event ID hoặc khóa frontend. |
| R07 | Completion đã commit, tác vụ thưởng gặp lỗi/timeout. | Retry từ outbox và phục hồi. | Bài vẫn Đã học, không bắt thi lại; thưởng được xử lý tối đa một lần; UI không báo đã nhận trước commit. |
| R08 | Thay tên/chương/phiên bản nội dung của cùng bài; mini có kết quả. | Đồng bộ và thử thao tác học/luyện. | Bản nội dung mới không tự thêm thưởng; mini/Backtest/lợi nhuận không sinh xu. Không thay kiểu hoàn thành. |

### P. Mua và transaction

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| P01 | Có đúng 500 xu, chưa sở hữu Thanh Long. | Xác nhận Mua. | 0 xu, một purchase, một bút toán −500, owned Thanh Long; active vẫn con cũ. |
| P02 | Có đủ xu, mới mở modal mua. | Hủy/Escape chưa xác nhận. | Không trừ/cấp sở hữu; không có purchase thành công giả. |
| P03 | Modal mở khi đủ xu, thiết bị khác đã chi làm thiếu. | Xác nhận ở tab cũ. | Kiểm tra số dư hiện tại tại commit; từ chối và hiển thị số dư đúng, không tiền âm. |
| P04 | Có 600 xu, hai request đồng thời mua hai con khác nhau. | Thực thi ở backend với tranh chấp khóa thật. | Một giao dịch thành công, còn 100; request kia không cấp miễn phí hoặc tạo số dư âm. |
| P05 | Hai request đồng thời mua cùng một con, đủ xu. | Thực thi và retry với request ID mới. | Một quyền sở hữu và một khoản chi 500; mới ID không vượt được unique ownership. |
| P06 | Lỗi được chèn giữa ghi ledger và ownership. | Thực hiện mua rồi đối soát. | Toàn bộ mua rollback hoặc cùng commit an toàn; không có sở hữu thiếu bút toán/chi phí thiếu sở hữu. |
| P07 | Mua đã commit nhưng client không nhận response. | Retry cùng idempotency key; sau đó cùng key khác loài. | Retry đúng trả giao dịch cũ; payload khác bị từ chối; không chi hai lần. |
| P08 | Client gửi giá 1 xu, số dư giả, owner khác hoặc catalog stale. | Gửi request mua trực tiếp. | Giá/auth resolve server; từ chối sai quyền/giá xác nhận khác; không tự thu giá mới khi chưa xác nhận. |

### E. Sử dụng và độc lập Bot

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| E01 | Đã mua Lộc Hươu, active Bạch Hổ. | Chọn Để sau. | Lộc Hươu đã sở hữu nhưng chưa dùng; active vẫn Bạch Hổ, không phí bổ sung. |
| E02 | Đã sở hữu Thanh Long. | Bấm Sử dụng. | Active đổi sau commit, đúng tên/model qua renderer; ví giữ nguyên. |
| E03 | Active Thanh Long, sở hữu Bạch Hổ. | Đổi về Bạch Hổ rồi Thanh Long. | Đổi miễn phí, giữ toàn bộ sở hữu, không tạo thêm Bot/tài khoản. |
| E04 | Chưa sở hữu Kim Quy. | Gọi API equip trực tiếp. | Từ chối; active trước đó không bị đổi và không tự mua hộ. |
| E05 | Một loài đã active. | Bấm/gửi lại Sử dụng cùng loài. | No-op hoặc kết quả idempotent; không trừ xu/ghi purchase/reset cấu hình. |
| E06 | Hai thiết bị đọc cosmetic revision cũ. | Chọn hai loài lần lượt rồi cho response cũ đến muộn. | Không âm thầm ghi đè lựa chọn mới; xử lý revision/refetch, hiển thị active xác nhận mới nhất. |
| E07 | Mua/đổi khi Bot có tiền, vị thế, pending config/universe và lịch sử. | So sánh các trạng thái trước/sau. | Chỉ ví xu/ownership/cosmetic thay theo thao tác; config/tiền/position/nguồn/worker/mini không bị reset. |
| E08 | Đổi linh thú vào ngày không giao dịch. | Sử dụng rồi mở Bot/Học viện. | Hình đổi sau server xác nhận, không chờ phiên > ngày D và không tăng config revision của Bot. |

### L. Ví, lịch sử và nguồn dữ liệu

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| L01 | 5 phần thưởng hợp lệ rồi một lần mua. | Đối soát ví và lịch sử. | Tổng nhận 500, chi 500, số dư 0; có đủ 5 dòng thưởng và 1 dòng mua, balance_after chính xác. |
| L02 | Người dùng cũ được giữ một linh thú miễn phí. | Hiển thị sở hữu/ví. | Không dựng khoản chi 500 giả; sở hữu không chỉ suy từ purchase ledger. |
| L03 | Thưởng và mua đồng thời trên một ví. | Thực thi ở backend. | Dùng cùng cơ chế tuần tự/transaction; không mất cập nhật, không chi vượt tiền thực tại commit. |
| L04 | Ledger nhiều trang, nhiều bút toán cùng timestamp. | Xem toàn bộ lịch sử và đối chiếu tổng. | Không mất/trùng dòng; thứ tự theo trình tự ghi; không dùng tổng trang đầu làm toàn lịch sử. |
| L05 | Nguồn ví hoặc ownership tải lỗi. | Mở/refresh Shop. | Loading/lỗi rõ; không 0 xu/không sở hữu giả rồi ghi đè; không báo mua thành công. |
| L06 | Cùng người dùng đổi tab/thiết bị; đăng xuất đổi tài khoản. | Refetch hoặc đăng nhập lại. | Đọc state bền vững đúng owner; không nhân xu hoặc rò số dư/người dùng cũ. |
| L07 | Response ví/reward cũ trả muộn sau một lần mua mới. | Cập nhật UI. | Không ghi balance/revision cũ đè số mới; refetch khi cần, không dùng old response như số dư hiện tại. |
| L08 | Có 71 completion khác nhau đã xác minh, chưa thưởng. | Thưởng đủ và mua bốn con. | Tổng thưởng 7.100; tổng chi 2.000; số dư 5.100; owned 5/5, active chỉ một; không coi 7.100 là vốn giao dịch. |

### M. Migration và dữ liệu hiện hữu

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| M01 | Người dùng cũ active Kim Quy có bằng chứng. | Chuyển sang Shop. | Giữ Kim Quy active/owned, thêm quyền mặc định Bạch Hổ khi thiếu; không ép về Bạch Hổ hoặc bắt mua lại. |
| M02 | Người dùng có ví/sở hữu thật; job khởi tạo chạy lại. | Retry deploy/onboarding. | Không reset hoặc nhân ví/sở hữu; không cấp thêm 100 triệu tài khoản giao dịch. |
| M03 | Cộng bù đã được phê duyệt, completion cũ chưa có thưởng. | Chạy dry-run rồi job ghi. | Một +100/bài có mapping hợp lệ; ledger ghi thời điểm cộng thực, lưu nguồn/thời điểm completion cũ. |
| M04 | Backfill và thưởng realtime cùng gặp một completion. | Chạy đồng thời/rerun backfill. | Cùng unique reward key: một khoản +100; không hai namespace hoặc cộng lại khi đổi policy version. |
| M05 | Legacy ch07-l01=ATR, mới ch07-l01=OBV. | Mapping reward/completion. | Không gán ATR thành OBV; không cấp xu/grant bài mới do trùng vị trí. |
| M06 | Dữ liệu chỉ có count đã học hoặc ID loài không xác minh được. | Chuẩn bị migration. | Báo ngoại lệ, không bịa completion/asset mapping; không cộng một khoản mẫu thay bằng chứng. |
| M07 | Đã có ledger/ownership/giao dịch mới hợp lệ. | Rollback code theo quyền. | Không drop bút toán/sở hữu hoặc khôi phục đổi loài tự động theo DNA; không nhập mock để phục hồi. |
| M08 | Chưa phê duyệt ghi cộng bù hoặc thiếu quyền deploy. | Bàn giao đợt dev. | Trả dry-run/phụ thuộc và phạm vi chưa chạy; không tự ghi hồi tố, không báo đã cộng bù production. |

### S. Bảo mật, hồi quy và bàn giao

| ID | Đầu vào | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| S01 | Tài khoản B biết ID ví/purchase/completion của A. | Gọi API đọc/ghi của A. | Từ chối đúng ownership/auth; không lộ số dư/lịch sử hoặc dùng completion A cho B. |
| S02 | Client sửa localStorage/scenario, gửi passed/amount/owned/active giả. | Mở UI và gọi backend. | Không cấp xu/sở hữu/quyền thật; mọi kiểm tra nguồn ở server. |
| S03 | Tên/nhãn chứa markup, số coin NaN/Infinity/số âm. | Gửi request hoặc render dữ liệu test. | Không thực thi script; input trái schema bị từ chối; không dùng float/giá client để chi. |
| S04 | Mã production build. | Tìm controls/hook mô phỏng. | Không có Thử hoàn thành bài, Thử lại sự kiện, resetShopSample, IQX_*_PREVIEW hoặc seed 5/20/71 bài cho user. |
| S05 | Khung Học viện/đề thật và mở quyền hiện có. | Hoàn thành bài nhận thưởng rồi xem Bot/Bộ lọc. | Giữ quiz/acknowledgment, progress và grant; nhận xu không tự master ON, áp danh mục hoặc tạo cảnh báo. |
| S06 | Đặt lệnh, Săn mã, Theo dõi, Backtest/Cảnh báo/Bộ lọc đang hoạt động. | Sử dụng cùng lúc với Shop. | Không bị khóa bởi xu, không thu phí xu, không đổi giao dịch/profile/cấu hình/danh mục ngoài thao tác riêng. |
| S07 | Ảnh tĩnh mẫu đẹp nhưng model thật chưa được nối. | Nghiệm thu UI. | Không đánh dấu hoàn thành chỉ vì giống HTML; phải chứng minh sử dụng model/renderer thực đang có của cả năm loài. |
| S08 | Có test cục bộ và các ca chưa chạy backend. | Trả báo cáo bàn giao. | Tách mock/UI/unit/integration/production; nêu asset đã dùng lại, bằng chứng transaction, phụ thuộc và ca chưa chạy; không tự deploy ngoài quyền. |

**Tổng: 64 ca nghiệm thu.** Những ca này là yêu cầu AI dev triển khai/chạy; không được đánh dấu đạt chỉ vì 33 kiểm tra tương tác HTML cục bộ đã chạy.

---

## 14. Trình tự triển khai và điều kiện bàn giao

1. Xác minh repository/build thật; tìm ví/ledger nếu đã có, completion/grants, mascot registry và renderer của cả năm loài. Ghi bảng đường dẫn và ID đối chiếu; không bắt chủ sản phẩm tự tìm thứ dev có quyền đọc.
2. Bổ sung schema/ràng buộc tối thiểu và các nghiệp vụ idempotent cho khởi tạo, thưởng, mua, sử dụng. Viết test server cho trùng/đồng thời/rollback trước khi nối UI.
3. Nối completion xác minh và quyền Học viện, tách thưởng khỏi kích hoạt giao dịch. Không nhập mock hoặc tạo bài kiểm tra để lấy xu.
4. Tích hợp Shop, số dư, bộ sưu tập, xác nhận mua và lịch sử vào workspace hiện tại; gắn active vào mô hình/renderer có sẵn. Không dựng lại artwork hoặc mô hình.
5. Audit người dùng cũ, quyền sở hữu và mapping bài; dry-run cộng bù nếu chuẩn bị triển khai. Thao tác ghi hồi tố/deploy chỉ thực hiện khi có phê duyệt/quyền.
6. Chạy unit, integration, transaction/concurrency, responsive, asset smoke test và hồi quy Bot/Học viện/Chiến lược/Săn mã/đặt lệnh. Trả đúng ca đạt/chưa chạy/bị chặn.

**AI dev phải trả:** code/migration/tests trong repository và một báo cáo ngắn: hiện trạng được xác minh; file đã sửa; mô hình/renderer được dùng lại; nghiệp vụ đã chạy; đối soát tiền xu và sở hữu; ca kiểm thử; các phụ thuộc cụ thể còn thiếu. Không chỉ trả kế hoạch hoặc ảnh Shop khi quyền sửa/môi trường đã đủ.

Chưa xác minh đường dẫn asset không có nghĩa phải tạo asset mới. Chưa có service completion không có nghĩa được tin nút mô phỏng. Chưa có ví riêng không có nghĩa được lấy vốn VND làm xu. Không tự mở lại quyết định đã khóa như Bạch Hổ mặc định, 100 xu/bài và giá 500 xu.

**Hoàn thành khi:** Shop dùng được với dữ liệu tài khoản thật trong môi trường được phép; mỗi bài thưởng một lần; mua trừ xu/cấp sở hữu nguyên tử; đổi miễn phí chỉ tác động hiển thị; cả năm loài dùng lại đúng tài nguyên/renderer hiện có; lịch sử và ví đối soát; không mất dữ liệu hay thay luật giao dịch.

**Không hoàn thành nếu:** chỉ copy HTML, tạo linh thú giống ảnh mẫu, chỉ đổi src ảnh tĩnh thay mô hình, nhập tiến độ giả/500 xu sẵn, dùng client cấp thưởng, hoặc thông báo mua thành công khi chưa ghi dữ liệu bền vững.

---

## Phụ lục A — Mục lục tham chiếu cho thưởng học tập

Danh sách dưới trích `catalogData` của HTML được duyệt: **13 chương/71 bài**. Đây là tên/ID tham chiếu để nối đúng completion, không là giáo trình, không là lệnh xuất bản bài và không cấp quyền vì có tên. Các ID `chXX-lYY` chỉ có nghĩa trong catalog mới `iqx-academy-outline-13ch-71lessons-v1`; không dùng làm khóa thưởng xuyên các catalog khác nếu chưa mapping về bài ổn định.

| Chương | Tên chương | Số bài | Xác nhận hoàn thành |
|---:|---|---:|---|
| 1 | Chỉ báo kỹ thuật nền tảng | 6 | Kiểm tra 8/8 |
| 2 | Sử dụng Backtest | 6 | Nút Hoàn thành |
| 3 | Phân tích cơ bản nền tảng | 6 | Kiểm tra 8/8 |
| 4 | Sử dụng Bộ lọc | 6 | Nút Hoàn thành |
| 5 | Xu hướng và động lượng nâng cao | 5 | Kiểm tra 8/8 |
| 6 | Sức khỏe tài chính doanh nghiệp | 6 | Kiểm tra 8/8 |
| 7 | Khối lượng và dòng tiền | 3 | Kiểm tra 8/8 |
| 8 | Chất lượng dòng tiền doanh nghiệp | 6 | Kiểm tra 8/8 |
| 9 | Định giá doanh nghiệp | 6 | Kiểm tra 8/8 |
| 10 | Kênh giá và động lượng | 3 | Kiểm tra 8/8 |
| 11 | Tăng trưởng dài hạn và hiệu quả vận hành | 6 | Kiểm tra 8/8 |
| 12 | Độ ổn định doanh nghiệp | 6 | Kiểm tra 8/8 |
| 13 | Cổ đông và phân bổ vốn | 6 | Kiểm tra 8/8 |

| ID tham chiếu | Tên bài | Xu sau hoàn thành hợp lệ lần đầu |
|---|---|---:|
| `ch01-l01` | RSI | 100 |
| `ch01-l02` | MACD | 100 |
| `ch01-l03` | MA / SMA | 100 |
| `ch01-l04` | Bollinger Bands | 100 |
| `ch01-l05` | Khối lượng | 100 |
| `ch01-l06` | Hợp lưu | 100 |
| `ch02-l01` | Bắt đầu với Backtest | 100 |
| `ch02-l02` | Thiết lập điều kiện Mua | 100 |
| `ch02-l03` | Thiết lập điều kiện Bán | 100 |
| `ch02-l04` | Chọn giả định và chạy kiểm thử | 100 |
| `ch02-l05` | Đọc kết quả và lịch sử giao dịch | 100 |
| `ch02-l06` | Điều chỉnh, so sánh và lưu kết quả | 100 |
| `ch03-l01` | Tăng trưởng doanh thu YoY | 100 |
| `ch03-l02` | Tăng trưởng LNST YoY | 100 |
| `ch03-l03` | Tăng trưởng EPS YoY | 100 |
| `ch03-l04` | Biên lợi nhuận gộp | 100 |
| `ch03-l05` | Biên lợi nhuận ròng | 100 |
| `ch03-l06` | ROE | 100 |
| `ch04-l01` | Bắt đầu với Bộ lọc | 100 |
| `ch04-l02` | Thiết lập điều kiện lọc | 100 |
| `ch04-l03` | Chọn kỳ tính cho từng chỉ tiêu | 100 |
| `ch04-l04` | Đọc và kiểm tra kết quả | 100 |
| `ch04-l05` | Điều chỉnh và lưu bộ lọc | 100 |
| `ch04-l06` | Lưu và áp dụng danh mục cho Bot | 100 |
| `ch05-l01` | EMA | 100 |
| `ch05-l02` | MA Cross | 100 |
| `ch05-l03` | DMI | 100 |
| `ch05-l04` | Stochastic | 100 |
| `ch05-l05` | CCI | 100 |
| `ch06-l01` | ROA | 100 |
| `ch06-l02` | ROIC | 100 |
| `ch06-l03` | D/E — Nợ vay / Vốn chủ sở hữu | 100 |
| `ch06-l04` | Net Debt / EBITDA | 100 |
| `ch06-l05` | Current Ratio | 100 |
| `ch06-l06` | Interest Coverage | 100 |
| `ch07-l01` | OBV | 100 |
| `ch07-l02` | MFI | 100 |
| `ch07-l03` | Chaikin Money Flow — CMF | 100 |
| `ch08-l01` | CFO Margin | 100 |
| `ch08-l02` | CFO / LNST | 100 |
| `ch08-l03` | FCF Margin | 100 |
| `ch08-l04` | FCF Growth YoY | 100 |
| `ch08-l05` | Capex / Revenue | 100 |
| `ch08-l06` | Accrual Ratio | 100 |
| `ch09-l01` | P/E | 100 |
| `ch09-l02` | P/B | 100 |
| `ch09-l03` | P/S | 100 |
| `ch09-l04` | EV / EBITDA | 100 |
| `ch09-l05` | PEG | 100 |
| `ch09-l06` | FCF Yield | 100 |
| `ch10-l01` | Donchian Channel | 100 |
| `ch10-l02` | ROC | 100 |
| `ch10-l03` | Williams %R | 100 |
| `ch11-l01` | Revenue CAGR 3Y | 100 |
| `ch11-l02` | Net Profit CAGR 3Y | 100 |
| `ch11-l03` | EPS CAGR 3Y | 100 |
| `ch11-l04` | Asset Turnover | 100 |
| `ch11-l05` | Cash Conversion Cycle | 100 |
| `ch11-l06` | Working Capital Turnover | 100 |
| `ch12-l01` | Revenue Growth Stability | 100 |
| `ch12-l02` | EPS Stability | 100 |
| `ch12-l03` | Margin Stability | 100 |
| `ch12-l04` | ROIC Stability | 100 |
| `ch12-l05` | FCF Positive Streak | 100 |
| `ch12-l06` | Profit Positive Streak | 100 |
| `ch13-l01` | Dividend Yield | 100 |
| `ch13-l02` | Payout Ratio | 100 |
| `ch13-l03` | Dividend Growth | 100 |
| `ch13-l04` | Share Count Growth | 100 |
| `ch13-l05` | Buyback Yield | 100 |
| `ch13-l06` | Shareholder Yield | 100 |

Tổng khi hoàn thành hợp lệ đủ 71 bài và chưa từng nhận thưởng: **7.100 xu**. Bốn linh thú mua đủ tốn **2.000 xu**. Đây là phép tính kiểm tra cấu hình của lần bàn giao, **không là khoản cấp sẵn, không là số dư mặc định và không là trần ví vĩnh viễn**.

---

**HẾT SPEC SHOP — v1.0.** Gửi Markdown này cùng HTML mẫu cho AI dev. Hai file đủ mô tả phần bổ sung; AI dev vẫn cần quyền đọc/sửa repository và nguồn dữ liệu hiện hữu. **Không yêu cầu tạo mô hình linh thú mới: toàn bộ linh thú production phải được tái sử dụng từ IQX.**

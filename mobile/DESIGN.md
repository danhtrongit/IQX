# IQX mobile design system

Tài liệu này là **phần chênh lệch** so với hợp đồng thiết kế web tại [`frontend/DESIGN.md`](../frontend/DESIGN.md). Mọi điều không nhắc tới ở đây giữ nguyên như bản web. Token màu lấy từ `frontend/src/index.css` qua `npm run tokens:sync` (sinh ra `src/theme/tokens.generated.ts`, không sửa tay).

## 0. Giữ nguyên từ bản web

| Mục web | Áp dụng trên mobile |
|---|---|
| §1 Tính cách sản phẩm | Giữ nguyên. Ngoại lệ duy nhất: liquid glass trên chrome hệ thống (§6). |
| §2 Token | Cùng vai trò ngữ nghĩa, cùng giá trị (sinh tự động), đủ sáng/tối, tối là mặc định cho giao dịch, cùng bảng màu biểu đồ `chart-1..5`. |
| §3 Typography | Space Grotesk cho tiêu đề, Be Vietnam Pro cho UI và nội dung, weight 400/500/600/700, `tabular-nums` cho giá và khối lượng, số căn phải trong bảng. Cỡ chữ điều chỉnh ở §3 dưới đây. |
| §4 Hình khối | Bo góc control 4, card 8, viền mảnh, không chồng bóng đậm. |
| §6 Ngữ nghĩa component | Một hành động chính trên mỗi vùng; hành động huỷ/xoá có xác nhận; control thật (Switch, Checkbox, Radio), không dựng control giả; icon chỉ dùng Lucide; không dùng emoji hay ký tự làm icon. |
| §8 Trình bày dữ liệu | Toàn bộ. Hiển thị kết quả từ server, giữ đơn vị (VND, cổ phiếu, %), giá trị không rõ là "—" (không bao giờ là 0), hướng giá = dấu + màu ngữ nghĩa, phiên hết hạn phải hiện trạng thái đăng nhập lại. |
| §9 Chuyển động | Chuyển động có chức năng 150–250ms, không trang trí, tôn trọng giảm chuyển động. |

Các phần riêng của web (layout workspace, rail, sidebar 25rem, Radix/shadcn, ScrollArea, kiểm tra viewport desktop) được thay bằng các quy tắc native dưới đây. Mobile có **một** thư viện primitive duy nhất ở `src/components/ui`; không tạo hệ component song song.

## 1. Điều hướng

Bốn tab cố định, có nhãn, mỗi tab một stack riêng:

| Tab | Nội dung |
|---|---|
| Giao dịch | Báo giá theo mã, phiếu lệnh, danh sách theo dõi, Săn mã, Tin tức AI, Mẫu hình nến |
| Danh mục | Tài sản ảo (NAV, tiền), cổ phiếu nắm giữ, lịch sử lệnh, chi tiết và huỷ lệnh, báo cáo AI danh mục |
| Chiến lược | Cảnh báo (CRUD, lịch sử tín hiệu), Backtest (form, kết quả), thư viện chỉ báo dùng chung, Bot |
| Thêm | Shop linh vật, tài khoản, giao diện, đăng xuất |

- Phiếu lệnh mở từ báo giá, danh sách theo dõi hoặc dòng nắm giữ, mang theo mã.
- Mỗi tab giữ mã đang chọn, bộ lọc, vị trí cuộn và stack khi chuyển tab. Hỗ trợ deep link `iqx://` tới màn chi tiết.
- Khu giao dịch luôn ghi rõ "Giao dịch giả lập".
- iOS giữ vuốt mép để quay lại. Trên Android, nút Back lần lượt đóng bàn phím, đóng overlay, rồi mới lùi stack.

## 2. Layout và mật độ

- Padding trang và card: **12** (giống web). Thang khoảng cách 4/8/12/16/24/32; khoảng giữa các section 24.
- Safe area chỉ áp dụng một lần ở cấp màn hình. Header và tab bar native tự quản chiều cao.
- Mỗi màn hình chỉ có **một** vùng cuộn dọc. Thanh nổi ở đáy phải chừa khoảng trống cho nội dung bằng chiều cao thanh + inset đáy + 12.
- Dòng danh sách tối thiểu cao 48 (một dòng) và 64 (hai dòng), giãn theo chữ.
- Từ chiều rộng 768 trở lên (iPad) được dùng hai cột; form rộng tối đa 600.

## 3. Control, vùng chạm và chữ

**Control**
- Ô nhập liệu và nút hành động chính cao **44**.
- Control gọn (chip lọc, segmented, nút trong dòng, tab dạng line) giữ cao 32 như web, nhưng vùng chạm phải đạt 44×44 (iOS) / 48×48 (Android) và các vùng chạm không chồng lên nhau.
- Icon cỡ 20; icon tab cỡ 22.

**Cỡ chữ** (cỡ/line-height)

| Vai trò | Cỡ |
|---|---|
| Tiêu đề trang | 24/30 |
| Tiêu đề panel | 18/24 |
| Tiêu đề section | 16/22 |
| Nội dung, ô nhập | 15/22 (input 16) |
| Dữ liệu dày (bảng, giá) | 13/18 |
| Metadata, trục biểu đồ | 12/16 |

**Phóng chữ theo hệ thống:** cho phép. Văn bản thường không giới hạn. Ô số trong bảng và trục biểu đồ giới hạn `maxFontSizeMultiplier` 1.4, với điều kiện có màn chi tiết dạng nhãn–giá trị đọc được ở mọi cỡ chữ. Khi chữ phóng quá 1.3 lần, lưới KPI 2 cột chuyển thành 1 cột.

## 4. Bảng, biểu đồ, danh sách

**Bảng**
- Không bỏ cột tài chính. Bảng rộng cuộn ngang, ghim cột mã và hàng tiêu đề.
- Cột số rộng tối thiểu 88, không cắt cụt giá trị tiền.
- Trên điện thoại, danh sách ưu tiên dạng dòng/card tóm tắt; bấm vào để mở chi tiết nhãn–giá trị đầy đủ.

**Biểu đồ**
- Cao tối thiểu 240.
- Nhấn giữ để hiện crosshair, kéo để dò; tooltip nền đặc (không dùng glass).
- Thao tác trên biểu đồ không được chặn cuộn dọc của màn hình.
- Có tóm tắt cho trình đọc màn hình.
- Màu series theo `chart-*`, nét liền/gạch/chấm giống web.

**Danh sách**
- Dùng list ảo hoá. Kéo để làm mới nhưng giữ nguyên các dòng đang hiện.
- Phân trang theo kích thước server hỗ trợ; footer có trạng thái đang tải, nút thử lại và nút "Tải thêm".
- Vuốt chỉ để *hiện* hành động. Huỷ lệnh hoặc xoá vẫn phải xác nhận, và luôn có nút tương đương hiển thị sẵn.

## 5. Phiếu lệnh, form, overlay

**Phiếu lệnh:** màn hình modal cao toàn phần.
- Hai lựa chọn tách bạch: Mua/Bán và Thị trường/Giới hạn.
- Hiển thị: khối lượng, giá giới hạn (nếu có), sức mua hoặc số cổ phiếu được bán, tổng ước tính (lệnh thị trường ghi rõ "ước tính"), thời điểm báo giá.
- Bàn phím số có nút "Xong". Màn hình né bàn phím và nút hành động luôn nằm trên bàn phím.
- Bước "Xem lại lệnh" trước, sau đó "Xác nhận mua/bán" gửi đúng một lần.
- Kết quả hiển thị theo phản hồi của server. Nếu request timeout không rõ kết quả, phải đối soát trước khi cho gửi lại.

**Form và overlay**
- Form dài (tạo/sửa cảnh báo, cấu hình backtest) mở dạng màn hình trong stack hoặc modal toàn phần.
- Sheet ngắn chỉ dùng cho bộ chọn và bộ lọc: mở ở 50%, kéo được lên 90%; khi chữ phóng to thì mở sẵn ở mức lớn. Không lồng sheet trong sheet.
- Lỗi trường hiển thị ngay dưới trường. Lỗi server giữ nguyên thông điệp khi an toàn.

## 6. Liquid glass

- **Chỉ** dùng cho chrome hệ thống: tab bar, header điều hướng, thanh công cụ nổi (ví dụ thanh đặt lệnh), vỏ sheet native.
- Dùng material chuẩn của hệ thống, không tự thêm glow. Khi cần tô màu, dùng `primary`.
- Nội dung (card, bảng, form, biểu đồ, giá, tooltip) luôn đặc và phẳng.
- Fallback sang bề mặt `card` đặc khi chạy trên Android, iOS cũ, khi không có API, hoặc khi người dùng bật Giảm độ trong suốt. Cài đặt trợ năng phải được đánh giá lại ngay khi thay đổi.

## 7. Phản hồi, trợ năng, nền tảng

**Phản hồi**
- Snackbar nằm trên chrome đáy: thông báo thành công tự ẩn sau 4 giây; lỗi hoặc thông báo có nút hành động giữ đến khi người dùng đóng.
- Haptic là tuỳ chọn, chỉ dùng khi chọn và khi có kết quả đã xác nhận (đặt lệnh thành công/thất bại). Không rung theo từng nhịp giá.

**Trợ năng**
- VoiceOver/TalkBack nhận nhãn tiếng Việt, role, trạng thái, đơn vị và biến động có dấu.
- Thông báo kết quả cho trình đọc màn hình, nhưng không đọc từng lần giá nhảy.
- Trả focus về chỗ cũ sau khi đóng overlay.

**Giảm chuyển động:** bỏ transform, shimmer và chuyển động linh vật; chuyển màn hình dùng crossfade.

## 8. Làm mới dữ liệu và vòng đời app

- Giữ đúng nhịp của web: báo giá 15 giây, heartbeat lệnh (`/virtual-trading/refresh`) 30 giây với khoảng cách tối thiểu 3 giây.
- Danh mục và tín hiệu làm mới khi focus màn hình hoặc khi kéo để làm mới.
- Dừng mọi polling khi app vào nền hoặc mất mạng. Khi quay lại thì làm mới ngay.
- Không bao giờ xếp hàng lệnh lúc offline.
- Hiện thời điểm cập nhật hoặc dấu hiệu dữ liệu cũ khi độ mới quan trọng.
- Các trạng thái loading/trống/lỗi/thành công giống web §8. Lỗi trên màn hình đang có dữ liệu thì hiện banner thử lại và giữ dữ liệu cũ.

## 9. Lưu ý độ tương phản (token dùng chung với web)

Đo trên token sinh ra. Các token này được sửa **ở `index.css`**, không ghi đè riêng trên mobile:

- **Chữ dưới 4.5:1:**
  - `primary` trên `card` ở theme tối ≈ 3.6. Chữ `primary` chỉ dùng từ cỡ 18 hoặc đậm 16 trở lên; chữ thường dùng `foreground`.
  - `destructive` trên `card` (tối) ≈ 4.47; chữ gần trắng trên nền `destructive` (tối) ≈ 3.75.
  - `price-up`/`price-ref` trên `secondary` (sáng) ≈ 4.35; `price-ceiling` trên `secondary` (tối) ≈ 4.43.
  - Với các cặp này, đặt giá lên `card`/`background` thay vì `secondary`, và luôn kèm dấu +/−.
- **Biểu đồ dưới 3:1:** `chart-5` trên `card` (tối) ≈ 2.4 và `chart-2` trên `card` (sáng) ≈ 2.4. Chỉ dùng chúng cho series có chú thích và có kiểu nét phân biệt.
- **Viền:** `border`/`input` < 1.6:1 nên không được là dấu hiệu duy nhất nhận ra control; ô nhập luôn có nhãn.

## 10. Checklist hoàn thành UI mobile

- Gọi API thật; đã kiểm tra đủ trạng thái loading, trống, lỗi, chưa có quyền, phiên hết hạn.
- Đã kiểm tra iOS + Android, sáng + tối, chiều rộng 320/390/768, cỡ chữ lớn nhất.
- VoiceOver/TalkBack, vùng chạm, giảm chuyển động, giảm độ trong suốt.
- Phiếu lệnh: không gửi trùng; huỷ lệnh có xác nhận; chuyển nền rồi quay lại vẫn đúng.
- Không có emoji hay ký tự giả icon; không hardcode màu; glass chỉ ở chrome.
- `npm run tokens:sync` không tạo khác biệt; typecheck, lint, unit test và flow Maestro liên quan đều qua.

# Giao dịch ảo — Quy tắc nghiệp vụ & API

## Tổng quan

Giao dịch ảo cho phép người dùng Premium luyện giao dịch chứng khoán bằng tiền VND mô phỏng trên dữ liệu thị trường thật. Mỗi người dùng nhận một khoản tiền ảo có thể cấu hình (mặc định 1 tỷ VND) và có thể đặt lệnh thị trường/limit theo giá thực tế của TTCK Việt Nam.

## Kiến trúc

```
/api/v1/virtual-trading/
├── account/activate   POST   Premium → Tạo tài khoản
├── account            GET    Auth    → Tóm tắt tài khoản
├── portfolio          GET    Auth    → Danh mục + NAV
├── orders             POST   Premium → Đặt lệnh
├── orders             GET    Auth    → Danh sách lệnh
├── orders/{id}/cancel POST   Premium → Hủy lệnh chờ
├── refresh            POST   Premium → Xử lý lệnh chờ/thanh toán
├── trades             GET    Auth    → Lịch sử khớp lệnh
├── leaderboard        GET    Public  → Bảng xếp hạng
├── admin/config       GET    Admin   → Lấy cấu hình
├── admin/config       PATCH  Admin   → Cập nhật cấu hình
├── admin/users/{id}/reset POST Admin → Đặt lại tài khoản người dùng
├── admin/reset-all    POST   Admin   → Đặt lại tất cả
└── admin/accounts     GET    Admin   → Danh sách tài khoản
```

## Tính phí và thuế

Tất cả số tiền là **số nguyên VND** (không dùng số thực).
Tỷ lệ phí/thuế tính bằng **basis points** (1 bps = 0.01%).

### Lệnh mua
```
gross       = price_vnd × quantity
fee         = round_half_up(gross × buy_fee_rate_bps / 10000)
total_cost  = gross + fee
```

### Lệnh bán
```
gross    = price_vnd × quantity
fee      = round_half_up(gross × sell_fee_rate_bps / 10000)
tax      = round_half_up(gross × sell_tax_rate_bps / 10000)
proceeds = gross - fee - tax
```

### Cấu hình mặc định
| Tham số | Mặc định | Mô tả |
|---|---|---|
| initial_cash_vnd | 1,000,000,000 | Số dư khởi điểm mỗi tài khoản |
| buy_fee_rate_bps | 15 | Phí mua 0.15% |
| sell_fee_rate_bps | 15 | Phí bán 0.15% |
| sell_tax_rate_bps | 10 | Thuế bán 0.1% |
| board_lot_size | 100 | Đơn vị giao dịch tối thiểu |
| settlement_mode | T0 | T0 (tức thời) hoặc T2 |

## Chế độ thanh toán

### T0 (mặc định)
- Mua: cổ phiếu khả dụng để bán ngay
- Bán: tiền có sẵn ngay

### T2
- Mua: cổ phiếu vào `quantity_pending`, chuyển sang `quantity_sellable` sau T+2 ngày giao dịch
- Bán: tiền vào `cash_pending_vnd`, chuyển sang `cash_available_vnd` sau T+2 ngày giao dịch
- Ngày giao dịch = các ngày trong tuần trừ ngày nghỉ đã cấu hình

## Vòng đời lệnh

### Lệnh thị trường (market)
1. Kiểm tra mã thuộc HOSE/HNX/UPCOM (fail-closed: 422 nếu không hợp lệ, 503 nếu nguồn không khả dụng)
2. Lấy giá hiện tại từ market data (theo phiên)
3. Nếu không có giá → trạng thái `rejected`
4. Khớp ngay → trạng thái `filled`

### Lệnh limit
1. Đặt cọc tiền (mua) hoặc cổ phiếu (bán) → trạng thái `pending`
2. Khi gọi `refresh`: nếu giá thị trường ≤ limit (mua) hoặc ≥ limit (bán) → khớp
3. GFD: lệnh chưa khớp sẽ hết hạn khi trading_date < ngày giao dịch hiện tại
4. Hủy: người dùng có thể hủy lệnh chờ, phần đặt cọc được giải phóng

## Theo dõi tiền

| Trường | Mô tả |
|---|---|
| cash_available_vnd | Tiền dùng được |
| cash_reserved_vnd | Tiền bị khóa do lệnh mua đang chờ |
| cash_pending_vnd | Tiền bán T2 đang chờ thanh toán |
| total_cash | available + reserved + pending |

## Theo dõi vị thế

| Trường | Mô tả |
|---|---|
| quantity_total | Tổng cổ phiếu sở hữu |
| quantity_sellable | Có thể bán |
| quantity_pending | Cổ phiếu mua T2 đang chờ thanh toán |
| quantity_reserved | Cổ phiếu bị khóa do lệnh bán đang chờ |

## Snapshot cấu hình (giá trị chính thức)

Mỗi lệnh chụp lại cấu hình đang hoạt động dưới dạng JSON `config_snapshot`. Khi khớp lệnh limit đang chờ, các tỷ lệ phí/thuế và chế độ thanh toán được đọc **từ snapshot**, không phải cấu hình hiện tại. Điều này đảm bảo:
- Quản trị thay đổi cấu hình không ảnh hưởng ngược tới lệnh đang chờ
- Phí/thuế khi khớp khớp với những gì hiển thị lúc đặt lệnh
- Phòng vệ: nếu snapshot thiếu trường nào, sẽ dùng cấu hình hiện tại

## Nguồn giá

Bộ phân giải giá **nhận biết phiên giao dịch** (múi giờ Asia/Ho_Chi_Minh):

### Phiên giao dịch
- Buổi sáng: 09:00–11:30
- Buổi chiều: 13:00–14:45
- Chỉ trong các ngày trong tuần, trừ ngày nghỉ đã cấu hình

### Thứ tự ưu tiên nguồn
- **Trong phiên**: VCI intraday (giá khớp realtime) → fallback OHLCV close
- **Ngoài phiên / cuối tuần / ngày nghỉ**: chỉ dùng OHLCV close (VND → VCI)

## Kiểm tra mã chứng khoán

Mọi lệnh (market + limit) đều được kiểm tra với danh sách HOSE/HNX/UPCOM:
- **Mã không hợp lệ**: 422 Unprocessable Entity
- **Nguồn không khả dụng**: 503 Service Unavailable (fail-closed, không tạo lệnh)
- Danh sách mã được cache 5 phút

## Bảng xếp hạng

Endpoint công khai, không cần xác thực. Xếp hạng các tài khoản đang hoạt động theo:
- `nav` (mặc định): Net Asset Value = tổng tiền + giá trị thị trường của vị thế
- `profit`: NAV - tiền khởi điểm
- `return_pct`: profit / tiền khởi điểm × 100

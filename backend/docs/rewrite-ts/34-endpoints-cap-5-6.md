# Endpoint — Đấu trường Cấp 5, 6

## Nguồn hợp đồng

Giao diện hành trình lấy **`iqx-capN-hanhtrinh.html` cộng với phần nhiệm vụ/tốt nghiệp tường minh của `IQX-CapN-Spec.md`** làm chuẩn. Các bảng tóm tắt, checklist, hoặc đoạn dữ liệu mâu thuẫn cũ không phải nguồn thực thi. Bằng chứng hoàn thành luôn do server suy từ dữ liệu đã lưu; client chỉ được yêu cầu tính lại.

## Hợp đồng hành trình

- **Cấp 5 — 2 nhiệm vụ song song:** săn 10 mã qua màn Săn mã và mua 5 mã từ Watchlist Cấp 5.
- **Cấp 6 — 1 nhiệm vụ:** xử lý nhất quán ít nhất 3 sự kiện mâu thuẫn, bất kể mức độ. `so_lan_xu_ly_veto_nhat_quan` chỉ là thống kê mô tả; không phải điều kiện tốt nghiệp.

Mọi endpoint trong chương dùng Bearer `CurrentUser`; không endpoint nào yêu cầu Premium.

## Cấp 5

### POST /api/v1/cap5/enter

Vào Cấp 5 idempotent sau Cấp 4.

### POST /api/v1/cap5/graduate

Chỉ tốt nghiệp khi cả hai nhiệm vụ server-derived hoàn tất.

### GET /api/v1/cap5/nguon-san/{symbol}

Đọc provenance săn của một mã/lệnh.

### GET /api/v1/cap5/phan-tich

Trả phân tích bộ lọc và phễu kỷ luật; không phải cổng.

### GET /api/v1/cap5/progress

Trả tiến trình 2 nhiệm vụ hoặc `null` và các bộ đếm nguồn săn/watchlist.

### GET /api/v1/cap5/san-ma

Trả các bộ lọc và trạng thái Săn mã.

### GET /api/v1/cap5/san-ma/{bo_loc}

Trả kết quả của một bộ lọc Săn mã.

### PATCH /api/v1/cap5/task

Yêu cầu server tính lại nhiệm vụ 1 hoặc 2.

### POST /api/v1/cap5/tour-sanma

Ghi tour học; tour không là điều kiện tốt nghiệp.

### GET /api/v1/cap5/watchlist

Trả Watchlist Cấp 5 cùng nguồn săn.

### POST /api/v1/cap5/watchlist

Thêm mã vào Watchlist Cấp 5; server giữ provenance săn mã.

### DELETE /api/v1/cap5/watchlist/{symbol}

Bỏ mã khỏi Watchlist; lịch sử săn không bị xoá.

## Cấp 6

### POST /api/v1/cap6/enter

Vào Cấp 6 idempotent sau Cấp 5.

### POST /api/v1/cap6/graduate

Chỉ tốt nghiệp khi `so_lan_xu_ly_nhat_quan >= 3`; không đọc veto, P&L, hay win rate.

### POST /api/v1/cap6/kehoach

Ghi mức nhận định mâu thuẫn cho kế hoạch BUY đã có; server suy các cờ hành vi.

### GET /api/v1/cap6/kehoach/{order_id}

Đọc dữ liệu nhận định Cấp 6 đã lưu của một lệnh.

### GET /api/v1/cap6/mau-thuan/{symbol}

Đọc bảng mâu thuẫn 5 lớp cho một mã.

### GET /api/v1/cap6/phan-tich

Trả các phân tích ⑭/⑮; thống kê không thay thế bằng chứng cổng.

### GET /api/v1/cap6/progress

Trả `Cap6ProgressOut` hoặc `null`, gồm mục tiêu duy nhất `muc_tieu_nhat_quan = 3` và `dat_nhiem_vu` do server suy ra.

### POST /api/v1/cap6/skip

Ghi quyết định Không mua; dedupe server không cho cùng mã/phiên thổi phồng bộ đếm.

### POST /api/v1/cap6/tour-mauthuan

Ghi tour học; không tác động cổng.

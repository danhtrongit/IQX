# Tham số vận hành Flashback

Spec 22-10 FB-11i. Màn quản trị Flashback (`/admin/flashback`, mục "Tham số vận hành") hiện bảng
tham số của spec v1.2 §9 ở dạng **chỉ đọc**. Muốn sửa thì chạy SQL trên cơ sở dữ liệu. Tác vụ
đọc lại tham số ở mỗi lần chạy, nên không cần khởi động lại máy chủ.

Tham số nằm trong một dòng JSON: `flashback_settings` với `key = 'config'`. Khoá nào thiếu thì
code dùng giá trị mặc định (`FLASHBACK_DEFAULT_SETTINGS` trong
`src/modules/flashback/flashback.constants.ts`).

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `round_duration_hours` | 48 | Thời lượng một đề (giờ) |
| `change_hour_utc7` | 20 | Giờ đổi đề, giờ Việt Nam |
| `rounds_before_symbol_repeat` | 10 | Số đề trước khi được lặp lại mã |
| `earliest_start_date` | `2012-01-01` | Phiên lịch sử đầu tiên không sớm hơn ngày này |
| `min_months_ago` | 12 | Phiên chơi cuối cách hiện tại ít nhất (tháng) |
| `warmup_sessions` | 252 | Số phiên khởi tạo chỉ báo |
| `history_sessions` | 60 | Số phiên lịch sử hiển thị |
| `play_sessions` | 60 | Số phiên chơi |
| `min_liquidity_vnd` | 10000000000 | Thanh khoản bình quân tối thiểu (đồng/phiên) |
| `min_daily_volatility` | 0.01 | Độ lệch chuẩn lợi suất ngày tối thiểu |
| `min_max_profit` | 0.2 | Lợi nhuận tối đa của đề (chơi hoàn hảo theo đúng luật: giá đóng cửa, phí 0,15%, thuế 0,1%, T+2, từ Phiên 0 tới Phiên 60), cận dưới. Không nới ở mức dự phòng nào |
| `max_max_profit` | 0.4 | Như trên, cận trên |
| `max_start_attempts` | 200 | Số lần thử ngày bắt đầu cho mỗi mã |
| `entry_fee_xu` | 100 | Phí tham gia từ lần thứ hai (xu). `0` = miễn phí (phương án dự phòng pháp lý §1.14) |

## Sửa một tham số

Sao lưu trước khi sửa, theo quy trình deploy VPS hiện có.

```sql
-- Ví dụ: chuyển sang miễn phí tham gia, giữ nguyên bảng thưởng.
UPDATE flashback_settings
   SET value = value || '{"entry_fee_xu": 0}'::jsonb,
       updated_at = now()
 WHERE key = 'config';

-- Kiểm tra lại.
SELECT value FROM flashback_settings WHERE key = 'config';
```

- Dùng `value || '{...}'::jsonb` để chỉ đổi khoá cần sửa, không ghi đè cả dòng.
- `entry_fee_xu` phải là số nguyên từ 0 tới 100.000. Giá trị hỏng thì code quay về 100.
- Đổi `change_hour_utc7` hay `round_duration_hours` chỉ có tác dụng với đề mở sau lúc sửa.

## Các khoá khác trong `flashback_settings`

| `key` | Ai ghi | Ghi chú |
|---|---|---|
| `paused` | Nút "Tạm dừng Flashback" (chỉ tài khoản trong `SUPER_ADMIN_USER_IDS`) | Không sửa tay |
| `backoff` | Tác vụ | Lịch thử lại khi tạo đề lỗi; không sửa tay |

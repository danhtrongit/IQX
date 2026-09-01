# CSDL — Tiến trình Đấu trường và bằng chứng giao dịch

## Nguồn hợp đồng

Giao diện hành trình lấy **`iqx-capN-hanhtrinh.html` cộng với phần nhiệm vụ/tốt nghiệp tường minh của `IQX-CapN-Spec.md`** làm chuẩn. Các bảng tóm tắt, checklist, hoặc đoạn dữ liệu mâu thuẫn cũ không phải nguồn thực thi. Bằng chứng hoàn thành luôn do server suy từ dữ liệu đã lưu; client chỉ được yêu cầu tính lại.

## Quy ước

Các bảng tiến trình có một hàng mỗi user (`user_id` UNIQUE), giữ `graduated_at` và `time_to_graduate_hours` qua các lần realign. Các migration đổi nghĩa nhiệm vụ không suy diễn credit từ timestamp cũ.

## `order_kehoach` — dữ liệu dùng chung

Cấp 3 ghi snapshot `khau_vi`, `muc_tu_tin`, `cach_khoi_luong`, `khoi_luong`, `pct_von`. Cấp 4 ghi `doc_5_lop` và `ai_5_lop`. Cấp 6 ghi dữ liệu nhận định mâu thuẫn. Cấp 7 không còn ghi dữ liệu đọc sổ lệnh. Cấp 8 không còn ghi kiểm tra rủi ro trước mua; kế hoạch BUY đủ điều kiện được dùng để gắn kế hoạch đang hiệu lực cho vị thế.

## `cap3_progress`

`id`, `user_id`, `entered_at`, `khau_vi`, `von_ban_dau`, `task_1_done_at`, `task_2_done_at`, analytics không cổng (`so_lenh_cap3`, `lai_pct_cap3`, `diem_ky_luat_tb_cap3`), `graduated_at`, `time_to_graduate_hours`. Hai timestamp chỉ lần lượt biểu diễn 10 kế hoạch quản lý vốn và đủ 3 mức tự tin. `task_3_done_at` không tồn tại.

## `cap6_progress`

`id`, `user_id`, `entered_at`, `so_lan_xu_ly_nhat_quan`, `so_lan_xu_ly_veto_nhat_quan`, `tong_lai_lenh_cap6_pct`, `da_xem_tour_mauthuan`, `graduated_at`, `time_to_graduate_hours`. Mục tiêu 3 và `dat_nhiem_vu` là hằng số/giá trị response do service tính, không là cột. Veto và P&L là mô tả, không là cổng.

## `cap7_progress`

`id`, `user_id`, `entered_at`, `can_doi_ok`, `graduated_at`, `time_to_graduate_hours`. Không còn timestamp nhiệm vụ, chỉ số đọc lực, hay streak. `can_doi_ok` là snapshot persist của điều kiện danh mục sống; các trọng số và cảnh báo chi tiết được tạo lại từ portfolio.

## `cap8_progress`

`id`, `user_id`, `entered_at`, `so_lenh_thoat_dung_ke_hoach`, `graduated_at`, `time_to_graduate_hours`. Bộ đếm được tính lại từ `cap8_exits` tạo sau `entered_at`; timestamp nhiệm vụ và cột rủi ro danh mục cũ không tồn tại.

## `cap8_exits`

Bằng chứng immutable, một hàng cho mỗi `sell_order_id` (`uq_cap8_exits_sell_order_id`): `user_id`, `account_id`, `symbol`, `matched_buy_order_id`, `sell_order_id`, `exited_at`, `quantity`, `filled_price_vnd`, `remaining_position_pct`, `exit_method`, `original_stop_vnd`, `original_take_profit_vnd`, `effective_stop_vnd`, `dung_ke_hoach`, `ban_cam_xuc`, `classification_reason`. Server tạo idempotent từ SELL đã FILLED; client không gửi cờ compliance.

## Vị thế ảo — kế hoạch active

Mỗi `virtual_positions` aggregate row có kế hoạch BUY active nullable: source buy-order id, original stop, original take-profit, dynamic stop và thời điểm đặt dynamic stop. BUY kế hoạch đủ điều kiện mới nhất thay thế kế hoạch active và xoá dynamic stop cũ.

## `cap0_progress`

Một hàng mỗi user: `id`, `user_id`, `entered_at`, `virtual_balance_init`,
`task_1_done_at` đến `task_4_done_at`, `task4_debrief_done`, `graduated_at`,
`time_to_graduate_hours`, cùng `created_at`/`updated_at`. `user_id` UNIQUE và
FK CASCADE tới `users`; các timestamp nhiệm vụ chỉ được server đóng dấu.

## `cap1_progress`

Một hàng mỗi user: `id`, `user_id`, `entered_at`, `da_xem_tour`,
`task_1_done_at` đến `task_5_done_at`, các bộ đếm server tính lại
`so_ly_do_da_dung`, `so_lenh_ly_do_ung_ho`, `so_lenh_thuc_chien`,
`graduated_at`, `time_to_graduate_hours`, `created_at`, `updated_at`.
`user_id` UNIQUE và FK CASCADE tới `users`.

## `cap2_progress`

Một hàng mỗi user: `id`, `user_id`, `entered_at`, `task_1_done_at`,
`so_lenh_co_cl_tp`, các analytics `so_lan_cat_lo_dung`,
`so_lan_chot_loi_dung`, `so_lan_thuc_hien_dung`, `graduated_at`,
`time_to_graduate_hours`, `created_at`, `updated_at`. `user_id` UNIQUE và FK
CASCADE tới `users`.

## `cap4_progress`

Một hàng mỗi user: `id`, `user_id`, `entered_at`, `task_1_done_at`,
`so_lenh_doc_du_5lop`, `vu_khi_lop`, `diem_mu_lop`, `graduated_at`,
`time_to_graduate_hours`, `created_at`, `updated_at`. `user_id` UNIQUE và FK
CASCADE tới `users`; các trường lớp tốt/ yếu là NULL khi chưa đủ dữ liệu.

## `cap5_progress`

Một hàng mỗi user: `id`, `user_id`, `entered_at`, `task_1_done_at`,
`task_2_done_at`, bộ đếm server tính lại `so_ma_da_san`,
`so_ma_mua_tu_watchlist`, `da_xem_tour_sanma`, `best_filter`,
`graduated_at`, `time_to_graduate_hours`, `created_at`, `updated_at`.
`user_id` UNIQUE và FK CASCADE tới `users`.

## `cap5_hunt_log`

Sổ append/update theo `(user_id, symbol)` UNIQUE: `id`, `user_id`, `symbol`,
`hunt_filter`, `hunt_signal`, `first_hunted_at`, `last_hunted_at`,
`created_at`, `updated_at`. `user_id` FK CASCADE tới `users`; một mã săn lại
chỉ cập nhật dấu vết, không tạo thêm mã cho bộ đếm độ rộng.

## `cap6_skip`

Nhật ký quyết định đứng ngoài: `id`, `user_id`, `symbol`, `at`,
`conflict_level`, `had_conflict`, `had_veto`, `created_at`, `updated_at`.
`user_id` là FK CASCADE tới `users`; không có unique constraint, nhưng service
gộp cùng `(symbol, phiên)` khi tính hành vi nhất quán.

## `user_placement`

Một hàng kết quả phân luồng mỗi user: `id`, `user_id`, `has_traded_before`,
`placed_level`, `created_at`, `updated_at`. `user_id` UNIQUE và FK CASCADE tới
`users`; `placed_level` hiện được ghi 0, 1 hoặc 2.

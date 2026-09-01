# Endpoint — Đấu trường Cấp 3, 4

## Nguồn hợp đồng

Giao diện hành trình lấy **`iqx-capN-hanhtrinh.html` cộng với phần nhiệm vụ/tốt nghiệp tường minh của `IQX-CapN-Spec.md`** làm chuẩn. Các bảng tóm tắt, checklist, hoặc đoạn dữ liệu mâu thuẫn cũ không phải nguồn thực thi. Bằng chứng hoàn thành luôn do server suy từ dữ liệu đã lưu; client chỉ được yêu cầu tính lại.

## Hợp đồng hành trình

- **Cấp 3 — 2 nhiệm vụ song song:** có ít nhất 10 `order_kehoach` hợp lệ (đủ `khau_vi`, `muc_tu_tin`, `cach_khoi_luong`) và đã dùng đủ mức tự tin `{1,2,3}`. Không dùng P&L, số lệnh đóng, hoặc điểm kỷ luật để tốt nghiệp.
- **Cấp 4 — 1 nhiệm vụ:** đọc và chấm đủ 5 lớp trên 20 lệnh.

Mọi endpoint trong chương dùng Bearer `CurrentUser`; không endpoint nào yêu cầu Premium.

## Cấp 3

### POST /api/v1/cap3/enter

Vào Cấp 3 idempotent sau khi tốt nghiệp Cấp 2.

### POST /api/v1/cap3/graduate

Chỉ tốt nghiệp khi hai timestamp nhiệm vụ đã được server đóng.

### POST /api/v1/cap3/kehoach

Ghi dữ liệu quản lý vốn của một kế hoạch BUY đã có. Đây là nguồn cho hai nhiệm vụ Cấp 3.

### POST /api/v1/cap3/khau-vi

Lưu khẩu vị rủi ro cho các kế hoạch sau; snapshot từng lệnh vẫn nằm trên `order_kehoach`.

### GET /api/v1/cap3/progress

Trả `Cap3ProgressOut` hoặc `null`; số lệnh quản lý vốn và tập mức tự tin được server tính lại.

### PATCH /api/v1/cap3/task

Chỉ yêu cầu server tính lại nhiệm vụ 1 hoặc 2; không nhận bằng chứng hoàn thành từ client.

## Cấp 4

### POST /api/v1/cap4/enter

Vào Cấp 4 idempotent sau Cấp 3.

### POST /api/v1/cap4/graduate

Chỉ tốt nghiệp khi đủ 20 lệnh đọc đủ 5 lớp.

### POST /api/v1/cap4/kehoach

Lưu bản chấm 5 lớp và đối chiếu AI của một kế hoạch BUY.

### GET /api/v1/cap4/progress

Trả tiến trình hoặc `null`; nhiệm vụ duy nhất dùng `so_lenh_doc_du_5lop` và `task_1_done_at`.

### PATCH /api/v1/cap4/task

Tính lại nhiệm vụ 1 từ `order_kehoach`; chỉ nhận `task_no = 1`.

### GET /api/v1/cap4/vu-khi-diem-mu

Phân tích kết quả theo lớp, không phải điều kiện hành trình.

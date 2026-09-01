# Endpoint — Đấu trường Cấp 7, 8

## Nguồn hợp đồng

Giao diện hành trình lấy **`iqx-capN-hanhtrinh.html` cộng với phần nhiệm vụ/tốt nghiệp tường minh của `IQX-CapN-Spec.md`** làm chuẩn. Các bảng tóm tắt, checklist, hoặc đoạn dữ liệu mâu thuẫn cũ không phải nguồn thực thi. Bằng chứng hoàn thành luôn do server suy từ dữ liệu đã lưu; client chỉ được yêu cầu tính lại.

## Hợp đồng hành trình

- **Cấp 7 — 1 nhiệm vụ danh mục sống:** mọi mã `<= 30%` NAV, mọi ngành biết được `<= 40%` NAV, ít nhất 4 mã và 3 ngành. NAV gồm cả tiền mặt. Giá thiếu hoặc ngành chưa biết là dữ liệu không đủ, không được coi là an toàn.
- **Cấp 8 — 1 nhiệm vụ kết sổ:** 5 lệnh SELL đã khớp, có bằng chứng server-derived là thoát đúng kế hoạch. Cấp 8 tốt nghiệp toàn bộ chương trình; không có endpoint vào cấp sau.

Mọi endpoint trong chương dùng Bearer `CurrentUser`; không endpoint nào yêu cầu Premium.

## Cấp 7

### POST /api/v1/cap7/enter

Vào Cấp 7 idempotent sau Cấp 6.

### POST /api/v1/cap7/graduate

Trong transaction, tính lại điều kiện sống và chỉ tốt nghiệp khi cả ba vế đều đúng.

### GET /api/v1/cap7/portfolio

Trả `PortfolioBalanceSnapshot` đầy đủ cho Holdings: tỷ trọng tiền mặt, mã/ngành, cảnh báo giá/ngành thiếu.

### GET /api/v1/cap7/progress

Tính lại snapshot phân bổ hiện tại, persist `can_doi_ok`, rồi trả điều kiện hành trình hoặc `null` nếu chưa vào cấp.

## Cấp 8

### POST /api/v1/cap8/enter

Vào Cấp 8 idempotent sau Cấp 7.

### POST /api/v1/cap8/exits

Idempotent theo `sell_order_id`; server phân loại SELL đã khớp là full, partial, trailing-hit hoặc unknown và quyết định credit.

### POST /api/v1/cap8/graduate

Tốt nghiệp terminal sau khi server đếm đủ 5 exit evidence hợp lệ.

### PATCH /api/v1/cap8/positions/{symbol}/dynamic-stop

Chỉ tăng dynamic stop của vị thế có lãi, trên cost/stop cũ và không vượt giá hiện tại.

### GET /api/v1/cap8/positions/{symbol}/exit-context

Trả vị thế, kế hoạch BUY đang hiệu lực, giá hiện tại, lượng bán được và ảnh hưởng ngành; `proposed_sale_quantity` là query optional.

### POST /api/v1/cap8/positions/{symbol}/sync-plan

Gắn kế hoạch BUY đủ điều kiện đã khớp; ngưỡng không nhận từ client.

### GET /api/v1/cap8/progress

Trả số bằng chứng thoát đúng kế hoạch sau `entered_at`, mục tiêu 5, hoặc `null` nếu chưa vào cấp.

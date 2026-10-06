# Demo Trading — Audit dữ liệu cổ tức (Phase 0)

Ngày audit: **05/10/2026**. Nhánh `main`, commit nền `4a904061`.

Tài liệu này là **đầu ra bắt buộc của Phase 0** trong spec "Bổ sung cổ tức – Demo Trading IQX". Chỉ mô tả dữ liệu đang có; không suy đoán, không hardcode, không thêm nguồn mới.

## A. Data source hiện tại

| Hạng mục                   | Kết quả                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tên source                 | Vietcap IQ Insight `GET https://iq.vietcap.com.vn/api/iq-insight-service/v1/events`                                                                                                                 |
| Service/file               | `backend/src/modules/market-data/providers/vci.provider.ts` → `fetchEvents(start, end, eventType)`; `market-data.service.ts` → `events()`; route `GET /api/v1                                       | v2/market-data/events/calendar` (`market-data.controller.ts`) |
| Mã sự kiện dùng cho cổ tức | `eventCode=DIV` (cổ tức tiền mặt), `eventCode=ISS` (phát hành cổ phiếu: cổ tức CP / thưởng CP / quyền mua). Backend gộp `dividend → 'ISS,DIV'`                                                      |
| Lưu ở đâu                  | **Không lưu DB.** Chỉ cache bộ nhớ 300 giây trong `MarketHttpTransport`. Không có bảng/migration nào chứa dividend, corporate action, ex_date, payout (đã grep `backend/migrations`, `backend/src`) |
| Job cập nhật               | **Không có.** Không có job nào trong `runtime.schedules.ts` gọi events. Dữ liệu chỉ fetch khi client gọi route calendar (màn premarket)                                                             |
| Tần suất                   | On-demand, cache 5 phút; không realtime, không cron, không manual sync                                                                                                                              |
| Lịch sử                    | Có. Query `fromDate=20240101` trả 59 bản ghi DIV tháng 1/2024 đầy đủ ngày; sự kiện đã hoàn tất không bị ghi đè/xoá                                                                                  |
| Lọc theo mã                | Có, tham số `ticker=`. Ví dụ `ticker=BFC&eventCode=ISS,DIV&fromDate=20250101&toDate=20261231` → 2 sự kiện DIV (3.500 đ/CP GDKHQ 11/08/2026, thanh toán 28/08/2026; 2.500 đ/CP GDKHQ 11/06/2025)     |
| Uniqueness                 | Có `id` (ObjectId 24 hex) duy nhất theo sự kiện                                                                                                                                                     |
| Lưu ý kỹ thuật             | Upstream trả HTTP 400 với User-Agent `curl/*`; User-Agent của Node fetch (`undici`/`node`) và trình duyệt trả 200. Backend hiện không gửi UA tuỳ chỉnh và vẫn hoạt động                             |

### Sample record thực tế (05/10/2026)

Cổ tức tiền mặt (`DIV`):

```json
{
  "id": "6abda762c5919c63307d573a",
  "ticker": "SHS",
  "eventCode": "DIV",
  "category": "DIVIDEND",
  "eventTitleEn": "Cash Dividend - Year 2025 - 500 VND",
  "publicDate": "2026-10-02T00:00:00",
  "exrightDate": "2026-10-08T00:00:00",
  "recordDate": "2026-10-09T00:00:00",
  "payoutDate": "2026-10-16T00:00:00",
  "valuePerShare": 500.0,
  "exerciseRatio": 0.05
}
```

Cổ tức/thưởng cổ phiếu (`ISS`):

```json
{
  "id": "6a83a63e7f344694df372141",
  "ticker": "HDB",
  "eventCode": "ISS",
  "category": "DIVIDEND",
  "eventTitleEn": "Share Issue - Stock dividend ratio 25.0%",
  "publicDate": "2026-10-02T00:00:00",
  "exrightDate": "2026-10-09T00:00:00",
  "recordDate": "2026-10-12T00:00:00",
  "exerciseRatio": 0.25
}
```

Sự kiện mới công bố, chưa chốt ngày (chỉ có `publicDate`, không có `exrightDate/recordDate/payoutDate`):

```json
{
  "id": "6abef8d5c5919c63307fb395",
  "ticker": "SSC",
  "eventCode": "DIV",
  "eventTitleEn": "Cash Dividend - Year 2025 - 1,000 VND",
  "publicDate": "2026-10-02T00:00:00",
  "valuePerShare": 1000.0,
  "exerciseRatio": 0.1
}
```

Niêm yết bổ sung (`AIS`, có `issueDate` nhưng **không tham chiếu** tới sự kiện ISS nào):

```json
{
  "id": "6ac19bd67b7b734fdb518dbb",
  "ticker": "ANT",
  "eventCode": "AIS",
  "category": "OTHER",
  "eventTitleEn": "ANT- Lists additional 604,000 shares",
  "issueDate": "2026-09-29T00:00:00"
}
```

## B. Matrix dữ liệu

| Field                      | Status    | Bằng chứng                                                                                                                                                                 |
| -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| symbol                     | AVAILABLE | `ticker`                                                                                                                                                                   |
| event type (cash vs stock) | PARTIAL   | `eventCode=DIV` = tiền mặt. `eventCode=ISS` gộp 3 loại; phân biệt "Stock dividend" / "Bonus Issue" / "Rights issue" **chỉ qua chuỗi `eventTitleEn`**, không có field riêng |
| exDate (GDKHQ)             | AVAILABLE | `exrightDate` (null khi mới công bố)                                                                                                                                       |
| recordDate                 | AVAILABLE | `recordDate`                                                                                                                                                               |
| cash dividend/share        | AVAILABLE | `valuePerShare` (đồng/CP), kèm `exerciseRatio` (tỷ lệ trên mệnh giá 10.000)                                                                                                |
| stock dividend rate        | AVAILABLE | `exerciseRatio` (0.25 = 25%)                                                                                                                                               |
| payment date               | AVAILABLE | `payoutDate` cho DIV (null khi chưa chốt)                                                                                                                                  |
| stock credit date          | MISSING   | ISS không có `payoutDate`/ngày về tài khoản. `AIS.issueDate` tồn tại nhưng không có khoá nối với ISS; nối theo `ticker` + ngày là suy đoán                                 |
| event unique ID            | AVAILABLE | `id`                                                                                                                                                                       |
| source                     | AVAILABLE | VCI (duy nhất)                                                                                                                                                             |
| announcedDate              | AVAILABLE | `publicDate`                                                                                                                                                               |
| lastUpdated                | MISSING   | không có field                                                                                                                                                             |
| eventStatus                | MISSING   | không có field. Chỉ có thể **suy diễn** từ sự có mặt/đã qua của `exrightDate`, `payoutDate`                                                                                |
| historical events          | AVAILABLE | có từ 01/2024, không bị overwrite                                                                                                                                          |

### Schema Demo Trading hiện có (liên quan)

Bảng `virtual_trading_accounts` (`cash_available_vnd`, `cash_reserved_vnd`, `cash_pending_vnd`), `virtual_positions` (`quantity_total`, `quantity_sellable`, `quantity_pending`, `quantity_reserved`, `avg_cost_vnd`), `virtual_settlements` (`kind` enum `buy_qty_release|sell_cash_release`, `due_date`, `status`), `virtual_cash_ledger` — tất cả tạo bằng SQL thô trong `backend/migrations/0001_initial_schema.sql`, ràng buộc `quantity_total = sellable + pending + reserved` tại `0004_integrity_and_defaults.sql`. Settlement T+2 chỉ chạy trong `POST /virtual-trading/refresh` (client gọi mỗi 30 giây), **không có cron**. NAV tính tại `trading.service.ts#getPortfolio`: `nav = cash_available + cash_reserved + cash_pending + Σ(price × quantity_total)`.

Không có cột/bảng nào cho pending dividend, pending shares, rights, corporate action → **MISSING** (phải thêm migration `0012_*.sql` nếu triển khai).

## C. Kết luận

**PARTIALLY READY.**

Có dữ liệu cho cả cổ tức tiền mặt và cổ tức cổ phiếu (mã, GDKHQ, ngày ĐKCC, mức tiền/tỷ lệ, ngày thanh toán tiền mặt, ID, lịch sử). Thiếu các field sau:

| Field thiếu            | Ảnh hưởng                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **stock credit date**  | Không có mốc để chuyển `PendingShares → AvailableQuantity` ("Khi cổ phiếu về", TEST 2). Nếu triển khai, CP chờ về sẽ **treo vô hạn** trừ khi có quyết định về cơ chế về tài khoản           |
| **eventStatus**        | Spec yêu cầu bắt buộc. Không có field; chỉ suy diễn được từ ngày (`exrightDate` đã qua → đã GDKHQ; `payoutDate` đã qua → đã trả). Sự kiện chưa chốt ngày (chỉ `publicDate`) không thể xử lý |
| **event type cho ISS** | Phải parse `eventTitleEn` để loại "Rights issue" (quyền mua, phải nộp tiền, không phải cổ tức) và gộp "Stock dividend" + "Bonus Issue". Parse chuỗi là điểm yếu nếu VCI đổi wording         |
| lastUpdated            | Không phát hiện được sự kiện bị sửa ngày/mức sau khi đã xử lý; chỉ dựa vào `id`                                                                                                             |
| Lưu trữ + job          | Dữ liệu không được persist; Demo Trading cần job hằng ngày + bảng corporate action riêng để snapshot `eligibleQuantity` và đảm bảo idempotency                                              |

Theo spec Phase 0: **DỪNG LẠI, chưa code Phase 1.** Cần chủ sản phẩm quyết định:

1. Cổ tức cổ phiếu khi không có ngày về: (a) chỉ triển khai cổ tức tiền mặt trước; (b) dùng `AIS.issueDate` của cùng mã sau `recordDate` làm ngày về (suy đoán, cần chấp thuận rõ); (c) đặt tham số cấu hình số phiên mặc định (ví dụ admin cấu hình, không hardcode); (d) chờ nguồn khác.
2. Chấp nhận suy diễn `eventStatus` từ ngày và parse `eventTitleEn` để phân loại ISS.
3. Chấp nhận thêm bảng `virtual_corporate_actions` + job daily (`trading.rights-sync`) trong `runtime.schedules.ts` để persist sự kiện và snapshot quyền.

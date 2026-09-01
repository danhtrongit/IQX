# Đặc tả viết lại IQX Backend bằng TypeScript

Bộ tài liệu này là **đặc tả đầy đủ** của backend IQX hiện tại (Python/FastAPI), viết để một
người — hoặc một AI — có thể **viết lại toàn bộ backend bằng TypeScript mà không cần đọc
source Python**.

Mọi con số, tên field, mã lỗi, giá trị mặc định trong đây được đọc trực tiếp từ source hoặc
sinh tự động từ OpenAPI schema của app đang chạy. Chỗ nào chưa xác định được đều ghi rõ
"CHƯA XÁC ĐỊNH" kèm file cần đọc — không đoán.

---

## Phạm vi

| Hạng mục | Số lượng |
|---|---|
| REST operation phải phục vụ | **289** (287 trong OpenAPI + **2 route ẩn**) |
| WebSocket endpoint | 1 |
| Bảng Postgres | 45 |
| Schema request/response | 219 |
| Nhà cung cấp dữ liệu ngoài | 19 |
| Job nền theo lịch | 7+ |

---

## Trạng thái & mức độ tin cậy

Đọc mục này trước khi coi tài liệu là chân lý.

| Hạng mục | Mức tin cậy | Cơ sở |
|---|---|---|
| Danh sách 289 endpoint, method, path, params, quyền | **Cao** — sinh tự động + đã kiểm | Dump từ `app.openapi()` **cộng** 2 route `include_in_schema=False` lấy từ `app.routes`; verifier đối chiếu lại với router thật |
| `types/openapi-schemas.d.ts` (219 schema) | **Cao** — sinh tự động, đã kiểm | Đã qua `tsc --noEmit --strict` (exit 0) |
| Lược đồ CSDL (45 bảng) | **Khá cao** | Đọc `app/models/` + đối chiếu 45 migration Alembic |
| Hợp đồng lỗi + quy ước (ch02/03/04) | **Cao** — 28 assert chạy thật | `_verify/verify_behaviour.py` gọi TestClient vào app thật |
| Hành vi endpoint, fallback, side-effect, công thức | **Trung bình** | Đọc source + test; **chưa qua vòng đối chiếu độc lập** |
| 194 điểm trong [chương 98](98-diem-chua-xac-dinh.md) | **Thấp** | Tự đánh dấu là chưa xác định / mới là suy luận |

**Điều quan trọng nhất phải biết:** bộ tài liệu này **chưa có vòng kiểm tra đối kháng độc lập**.
Kế hoạch ban đầu có một vòng verify riêng cho từng chương, nhưng toàn bộ agent verify bị ngắt
bởi giới hạn chi tiêu. Nghĩa là:

- Phần **sinh tự động** (endpoint list, type) đáng tin.
- Phần **viết tay** (hành vi, công thức, đơn vị, message lỗi) được viết cẩn thận từ source
  nhưng **chưa ai kiểm chứng lại**. Hãy đối xử với nó như bản nháp chất lượng cao, không phải
  đặc tả đã nghiệm thu.
- Cách bù rẻ nhất: khi implement từng module, chạy **đối chiếu song song** với backend Python
  (xem [99 §7](99-checklist-nghiem-thu.md)). Việc đó vừa kiểm code mới, vừa kiểm tài liệu.

### Bộ verifier tự động

Hai script **tất định** (không dùng LLM) giữ cho tài liệu không trôi khỏi source:

```bash
uv run python docs/rewrite-ts/_verify/generate_openapi_artifacts.py
uv run python docs/rewrite-ts/_verify/generate_openapi_artifacts.py --check
uv run python docs/rewrite-ts/_verify/verify_docs.py
uv run python docs/rewrite-ts/_verify/verify_behaviour.py
```

`verify_docs.py` đối chiếu: độ phủ 289 endpoint · curl trỏ đúng route · 93 biến env ·
7 mã lỗi · 45 bảng · link nội bộ · code fence · **route thật trong `app.routes` vs manifest**
(chính kiểm tra cuối này đã phát hiện 2 route ẩn khỏi OpenAPI).
`verify_behaviour.py` biến các khẳng định của ch02/03/04/20 thành assert gọi vào app thật.

**Chạy lại cả hai sau mỗi lần sửa backend Python** — nếu tài liệu lệch, chúng sẽ báo.

---

## Đọc theo thứ tự nào

### Bắt buộc đọc trước (nền tảng)

| # | Chương | Nội dung |
|---|---|---|
| 01 | [Kiến trúc & lựa chọn framework](01-kien-truc-va-framework.md) | **Đọc đầu tiên.** Vì sao NestJS, stack thư viện cụ thể, bản đồ module, 5 cái bẫy phải xử lý ngay, thứ tự thực hiện |
| 02 | [Quy ước API chung](02-quy-uoc-api.md) | Base URL, middleware stack, CORS, `X-Request-ID`, rate limit, phân trang, định dạng dữ liệu |
| 03 | [Xác thực & phân quyền](03-xac-thuc-phan-quyen.md) | JWT access/refresh, token family & rotation, guard, role, cổng Premium, token email |
| 04 | [Lỗi & mã lỗi](04-loi-va-ma-loi.md) | Envelope lỗi, bảng mã lỗi, hình dạng 422 của Pydantic, 429, lỗi theo domain |
| 05 | [Cấu hình & biến môi trường](05-cau-hinh-env.md) | Bảng đầy đủ mọi biến env, default, feature flag, `.env.example` cho bản TS |

### Lược đồ cơ sở dữ liệu

| # | Chương | Bảng |
|---|---|---|
| 06a | [CSDL — người dùng, thanh toán, bài học, audit](06a-csdl-nguoi-dung-thanh-toan.md) | `users`, `refresh_tokens`, `user_login_history`, `premium_*`, `sepay_ipn_logs`, `courses`, `episodes`, `episode_progress`, `admin_audit_log`, `symbols` |
| 06b | [CSDL — giao dịch ảo, cảnh báo, watchlist](06b-csdl-giao-dich-canh-bao.md) | `virtual_*`, `alert_*`, `user_alert_rules`, `watchlist_items`, `chart_drawings`, `backtest_strategies` |
| 06c | [CSDL — Cấp 0-8 & phân tích AI](06c-csdl-cap-va-phan-tich.md) | `cap0_progress`…`cap8_progress`, `order_kehoach`, `order_ketso`, `standby_decision`, `user_placement`, `analysis_history`, `analysis_claims`, `ai_insight_history`, `portfolio_reports`, `market_data_snapshot`, `sector_median_cache` |

### Hạ tầng & tích hợp

| # | Chương | Nội dung |
|---|---|---|
| 07 | [Tích hợp nhà cung cấp ngoài](07-tich-hop-ngoai.md) | 19 upstream: VCI/Vietcap, DNSE, SePay, Telegram, Resend, AI proxy, Google Sheets, Binance, Yahoo, SJC, VCB, Fmarket… kèm **cách normalize và fallback** |
| 08 | [Tầng cache](08-cache.md) | Redis + in-memory, mẫu key, bảng TTL, hành vi khi Redis tắt |
| 09 | [Job nền & lịch chạy](09-cron-jobs.md) | 7 job, cron ICT, feature flag, **lỗi advisory-lock đã gặp ở production** |
| 10 | [Realtime WebSocket](10-realtime-websocket.md) | Giao thức WS, cầu nối DNSE (MQTT/OpenAPI), demand ref-count, leader election |
| 11 | [Media & upload file](11-media-upload.md) | Mount `/media`, upload multipart, giới hạn dung lượng, xử lý ảnh |

### Đặc tả endpoint (mỗi endpoint: quyền · params · body · response · lỗi · fallback · curl · TS type)

| # | Chương | Số endpoint |
|---|---|---|
| 20 | [Xác thực, Người dùng, Health](20-endpoints-auth-users.md) | 17 (gồm 2 route ẩn) |
| 21 | [Premium & thanh toán SePay](21-endpoints-premium-thanh-toan.md) | 10 |
| 21b | [Quản trị thanh toán, subscription & IPN log](21b-endpoints-quan-tri-thanh-toan.md) | 13 |
| 22 | [Market: tham chiếu, báo giá, bộ lọc](22-endpoints-market-tham-chieu-bao-gia.md) | 14 |
| 23 | [Market: công ty & giao dịch](23-endpoints-market-cong-ty-giao-dich.md) | 17 |
| 24 | [Market: tổng quan & ngành](24-endpoints-market-tong-quan-nganh.md) | 20 |
| 25 | [Market: vĩ mô, quốc tế, quỹ, sự kiện, Sheets](25-endpoints-market-vi-mo-quoc-te-quy.md) | 18 |
| 26 | [Market: tin tức & tin AI](26-endpoints-market-tin-tuc.md) | 7 |
| 27 | [Báo cáo tài chính (BCTC) & dashboard BCTC](27-endpoints-market-bctc.md) | 3 |
| 28 | [Nhận định thị trường (EOD / giữa phiên / trước phiên)](28-endpoints-nhan-dinh-thi-truong.md) | 10 |
| 29 | [AI: phân tích, mẫu hình, mô hình dự báo](29-endpoints-ai.md) | 12 |
| 30 | [Người quản lý danh mục](30-endpoints-quan-ly-danh-muc.md) | 2 |
| 31 | [Giao dịch ảo (người dùng + quản trị)](31-endpoints-giao-dich-ao.md) | 24 |
| 32 | [Đấu trường Cấp 0, 1, 2](32-endpoints-cap-0-2.md) | 20 |
| 33 | [Đấu trường Cấp 3, 4](33-endpoints-cap-3-4.md) | 12 |
| 34 | [Đấu trường Cấp 5, 6](34-endpoints-cap-5-6.md) | 21 |
| 35 | [Đấu trường Cấp 7, 8](35-endpoints-cap-7-8.md) | 11 |
| 36 | [Watchlist, bản vẽ biểu đồ, Backtest](36-endpoints-watchlist-ban-ve-backtest.md) | 14 |
| 37 | [Cảnh báo, quản trị cảnh báo, Telegram](37-endpoints-canh-bao-telegram.md) | 16 |
| 38 | [Bài học (công khai + quản trị)](38-endpoints-bai-hoc.md) | 16 |
| 39 | [Quản trị: người dùng, số liệu, hệ thống, audit](39-endpoints-quan-tri.md) | 12 |
| | **Tổng** | **289** |

### Tra cứu & nghiệm thu

| # | File | Nội dung |
|---|---|---|
| 90 | [Danh mục đầy đủ 289 endpoint](90-danh-muc-endpoint.md) | Bảng tra sinh tự động — checklist độ phủ |
| 98 | [Điểm chưa xác định](98-diem-chua-xac-dinh.md) | **194 điểm** nơi đặc tả còn mềm — đọc trước khi implement |
| 99 | [Checklist nghiệm thu](99-checklist-nghiem-thu.md) | Điều kiện coi là "đã viết lại xong" |
| — | [`types/openapi-schemas.d.ts`](types/openapi-schemas.d.ts) | **219 schema** dịch tự động sang TypeScript, đã qua `tsc --strict` |
| — | [`types/endpoint-manifest.json`](types/endpoint-manifest.json) | 289 operation dạng máy đọc được (method, path, params, quyền, chương, cờ `hiddenFromOpenApi`) |

---

## Cách dùng bộ tài liệu này

**Nếu bạn là AI được giao viết lại backend:**

1. Đọc [01](01-kien-truc-va-framework.md) → [05](05-cau-hinh-env.md) trước khi viết dòng code
   nào. Đặc biệt là §5 của chương 01 (5 cái bẫy).
2. Dựng tầng `common/` (config, database, auth, errors, interceptors, cache, http) trước
   mọi module nghiệp vụ.
3. Sinh schema Drizzle bằng `drizzle-kit pull` từ DB thật, rồi **đối chiếu** với chương
   06a/06b/06c. Nếu lệch, DB là đúng — báo lại chỗ lệch.
4. Với mỗi module: đọc chương endpoint tương ứng, dùng `types/openapi-schemas.d.ts` làm
   nguồn kiểu, dùng `90-danh-muc-endpoint.md` để chắc không bỏ endpoint nào.
5. Sau mỗi module, chạy đối chiếu response với backend Python (xem
   [99](99-checklist-nghiem-thu.md), mục "Đối chiếu song song").

**Nếu bạn là người review:** dùng [90](90-danh-muc-endpoint.md) làm checklist độ phủ và
[99](99-checklist-nghiem-thu.md) làm điều kiện nghiệm thu.

---

## Quy ước trong tài liệu

- **Ngôn ngữ**: tiếng Việt, giữ nguyên thuật ngữ kỹ thuật tiếng Anh (endpoint, header,
  payload, guard, cache…).
- **Type**: TypeScript. `string | null` = nullable (Python `X | None`);
  `field?:` = optional (không nằm trong `required` của Pydantic).
- **`—`** trong bảng = không áp dụng.
- **"CHƯA XÁC ĐỊNH"** = tài liệu không chốt được, kèm file cần đọc. Đừng đoán, hãy đọc file đó.
- Ví dụ JSON dùng dữ liệu thị trường Việt Nam thật (FPT, VCB, HPG…), tiền VND, ngày
  `YYYY-MM-DD`.
- Mọi `curl` chạy được sau khi thay `$TOKEN` và base URL.

---

## Nguồn sự thật & cách tài liệu được sinh

| Loại thông tin | Nguồn |
|---|---|
| Danh sách endpoint, params, hình dạng request/response | `app.openapi()` của app đang chạy → `types/endpoint-manifest.json`, `types/openapi-schemas.d.ts` |
| Hành vi (điều kiện lỗi, thứ tự kiểm tra, fallback, side-effect) | Đọc source `app/api/`, `app/services/`, `app/repositories/` |
| Lược đồ DB | `app/models/*.py` đối chiếu `alembic/versions/*.py` |
| Hành vi đã chốt | 159 file test trong `tests/` |

> **Cảnh báo về giới hạn của OpenAPI**: nhiều handler dữ liệu thị trường trả `dict` thô từ
> provider, nên OpenAPI chỉ ghi `Record<string, unknown>`. Hình dạng thật của những response
> đó được đặc tả bằng tay trong các chương 22–27 và chương 07 — đó là lý do bộ tài liệu này
> tồn tại chứ không chỉ đưa bạn file `openapi.json`.

---

## Điều KHÔNG được đổi trong lần viết lại này

Chi tiết ở [01 §7](01-kien-truc-va-framework.md). Tóm lại: giữ nguyên **hình dạng response**,
**message lỗi tiếng Việt**, **lược đồ DB**, **cấu trúc JWT payload**, và **tên biến môi
trường** — kể cả những chỗ chưa đẹp. Ghi lại thành nợ kỹ thuật và sửa ở `/api/v2` sau.

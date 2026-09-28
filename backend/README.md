# IQX backend-v2

Backend NestJS độc lập cho IQX, dùng PostgreSQL schema v2 riêng. Codebase là modular monolith với ba tiến trình: HTTP/WebSocket API, BullMQ worker và market ingest.

## Trạng thái hiện tại

- Node.js `24.21.0` LTS, npm `11.12.1`, TypeScript `6.0.3`, ESM.
- NestJS `12.0.4`, Fastify `5.12.5`, Zod `4.6.5`.
- Drizzle ORM `0.45.3` + `pg` `8.23.0`; truy vấn và migration dùng SQL tường minh, không dùng Prisma.
- Redis `ioredis 5.11.1`, BullMQ `6.3.8`, WebSocket `ws 8.21.0`, MQTT `5.16.0`.
- Các module chính: auth/users, billing/entitlements, admin, market data, financials, analysis/AI, forecasts/patterns, reports, portfolio, quant/backtest, trading, journey Cap0–8, watchlists, alerts/Telegram, learning/media, bots, notifications và realtime.

Baseline legacy gồm `315` HTTP operations và `1` WebSocket route. Báo cáo [contracts/api-coverage.json](contracts/api-coverage.json) ánh xạ toàn bộ baseline sang runtime v2; OpenAPI hiện có khoảng `655` operations do cùng tồn tại v2 canonical routes, v1 aliases và các route bổ sung. Contract check yêu cầu mọi HTTP operation có response schema typed. Đây là coverage cấu trúc, không phải tuyên bố mọi response đều byte-for-byte giống FastAPI hoặc mọi hành vi đã được kiểm chứng trên production.

V1 aliases được giữ để chuyển consumer dần, nhưng v2 chủ động chuẩn hóa validation, error envelope, số nguyên lớn, auth và các lỗi bảo mật. Vì vậy một số sửa lỗi là breaking change có chủ đích; hãy đọc OpenAPI thay vì giả định parity tuyệt đối.

Các khác biệt hành vi cần chú ý khi chuyển consumer:

- Portfolio có vị thế nhưng thiếu giá đủ tin cậy trả HTTP 503 (`PORTFOLIO_VALUATION_UNAVAILABLE`), không tự định giá bằng giá giả hay giá vốn.
- Điểm portfolio phụ thuộc dữ liệu lịch sử hoặc giao dịch có thể là `null` khi chưa đủ dữ liệu; `null` không tương đương điểm 0.
- Reset password kiểm tra token và cập nhật mật khẩu trong cùng transaction có khóa hàng; token đã dùng không thể reset lần hai, và các refresh token của user bị thu hồi khi reset thành công.
- Alert scan chỉ xét rule đang bật của user active có quyền entitlement grant còn hiệu lực (hoặc admin); rule của user hết quyền không được scan.

## Cài đặt và chạy API

```bash
cd backend-v2
nvm use
npm install --global npm@11.12.1
npm ci
cp .env.example .env
# Điền DATABASE_URL, JWT secrets và các integration cần dùng.
npm run build
node --env-file=.env dist/src/bootstrap/api.js
```

Ứng dụng không tự đọc `.env`, kể cả `.env` của backend cũ. Luôn truyền môi trường từ process manager/container hoặc dùng `node --env-file` rõ ràng. `npm run start:api` chỉ phù hợp khi biến môi trường đã được export từ bên ngoài.

Khi `API_DOCS_ENABLED=true`:

- Swagger UI: `/docs`
- OpenAPI JSON: `/openapi.json`
- Liveness: `/health/live`
- Readiness: `/health/ready`

CORS mặc định tắt nếu `CORS_ORIGINS` rỗng. Khi bật, server chỉ cho các origin khai báo chính xác, không gửi credential và cho phép `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH`, `DELETE` với các header đã allowlist trong bootstrap.

## API và contract

Các nhóm route lớn gồm:

- Identity: auth, users, admin users, sessions và email verification/reset.
- Billing: plans, checkout, SePay IPN, subscriptions, grants, refunds và audit.
- Market/research: instruments, quotes, company, trading data, global/macro, screening, news, BCTC, reports, analysis, forecasts và patterns.
- Investor workflow: virtual trading, portfolio manager, watchlists, chart drawings, alerts và journey Cap0–8.
- Content/operations: lessons, private media, bots, notifications, admin metrics/system/audit.
- Realtime: WebSocket gateway trong API và DNSE market ingest riêng.

Các artifact contract:

- `contracts/legacy-v1-endpoints.json`: inventory AST của FastAPI, không import app cũ và không đọc secret.
- `contracts/legacy-v1-dispositions.json`: mapping/deprecation có chủ đích.
- `contracts/openapi-v2.json`: snapshot OpenAPI của NestJS.
- `contracts/client/`: TypeScript request/response types sinh từ OpenAPI.
- `contracts/api-coverage.json`: đối chiếu route legacy, runtime và OpenAPI.

Kiểm tra drift:

```bash
npm run contracts:check
npm run api:coverage:check
```

`COMPATIBILITY_V1_ENABLED=false` chặn toàn bộ `/api/v1/*` ở HTTP boundary bằng 404 và loại v1 khỏi OpenAPI. Các route v2 vẫn hoạt động. Mặc định giữ v1 aliases để consumer chuyển đổi có kiểm soát.

## Database v2 và migration

Backend-v2 dùng database riêng và không đồng bộ/import dữ liệu từ backend v1. Sau khi chạy toàn bộ migration, schema v2 có `69` bảng nghiệp vụ. Migration `0001` có 65 bảng nền; `0002` thêm 4 bảng. Migration `0003` lặp lại khai báo 3 bảng cảnh báo bằng `IF NOT EXISTS` để hỗ trợ nâng cấp/idempotency, đồng thời thêm trường Telegram và index, nên không làm tăng số bảng cuối cùng:

- `0001_initial_schema.sql`: baseline 65 bảng nghiệp vụ.
- `0002_api_extensions.sql`: 4 bảng bổ sung cho billing entitlement/refund/history và report input snapshot, cùng các cột mở rộng.
- `0003_alerts_telegram.sql`: bổ sung Telegram fields và các alert indexes/objects theo cách idempotent; các bảng cảnh báo đã có trong baseline được giữ nguyên.
- `0004_integrity_and_defaults.sql`: constraint tiền/khối lượng, index giao dịch và refresh family; seed gói dùng thử cùng cấu hình giao dịch mặc định. Không seed tài khoản admin hoặc dữ liệu thị trường giả.

API không tự migrate khi khởi động. Runner chỉ chấp nhận khi bật gate rõ ràng và tên database khớp `iqx_v2_*`:

```bash
npm run build
V2_MIGRATIONS_ALLOWED=true \
  node --env-file=.env dist/scripts/migrate.js
```

Runner dùng advisory lock, checksum và transaction cho từng migration. Không trỏ lệnh này vào database v1, không đổi tên database để lách guard và không chạy đồng thời bằng công cụ migration khác. Chưa có migration nào được chạy trên production bởi công việc trong repository này.

`DB_READ_ONLY=true` là safety gate cho deployment chỉ đọc. Full API, worker và migration cần role/quyền phù hợp với hành vi ghi của module; không bật read-only cho tiến trình thực hiện billing, trading, journey, admin mutation hoặc jobs.

## Worker và market ingest

Ba entrypoint sau dùng chung codebase nhưng có ownership riêng:

```bash
node --env-file=.env dist/src/bootstrap/api.js
node --env-file=.env dist/src/bootstrap/worker.js
node --env-file=.env dist/src/bootstrap/market-ingest.js
```

- API phục vụ HTTP/WebSocket và có thể enqueue khi `QUEUE_ENABLED=true`; API process không consume BullMQ jobs.
- Worker chỉ khởi động khi `QUEUE_ENABLED=true`; cần Redis và chạy durable handlers cho reports, billing reconciliation/expiry, alerts, journey, bot và market snapshot jobs.
- Market ingest chỉ khởi động khi `MARKET_INGEST_ENABLED=true`; cần Redis cùng credential DNSE phù hợp transport. Nó sử dụng leader election và phát dữ liệu cho realtime gateway.
- `REALTIME_ENABLED=true` bật gateway/pubsub trong API và cũng yêu cầu Redis. Flag này không tự khởi động ingest process.

Không bật worker/ingest chỉ để vượt readiness. Cấu hình credential thật qua secret manager của môi trường, không lưu trong Git hay image.

## Cấu hình tích hợp

`.env.example` liệt kê đầy đủ biến được parser chấp nhận. Các nhóm credential đều để trống:

- JWT access/refresh: production bắt buộc hai secret, mỗi secret tối thiểu 32 ký tự; vận hành nên dùng hai giá trị khác nhau.
- SePay: merchant, secret, checkout URL và public callback URL.
- Email: HTTP provider URL, API key, sender và API public URL.
- AI: OpenAI-compatible base URL, API key, model, timeout và retry.
- DNSE/realtime: OpenAPI hoặc MQTT credentials, URLs, lease và symbol limits.
- Google Sheets, Telegram và private media signing/storage.

Credential dịch vụ ngoài không có trong workspace. Test dùng mock/fake nội bộ; chưa có live upstream E2E với AI, DNSE, SePay, Telegram, email hay Google Sheets được xác minh.

## Kiểm thử và chất lượng

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run contracts:check
npm run api:coverage:check
npm run test:integration
npm run test:system
npm audit --audit-level=high
```

Số test thay đổi trong quá trình hoàn thiện; xem kết quả của lệnh kiểm thử và CI cho lần chạy hiện tại. Không dùng số lượng test như bằng chứng production readiness.

- Integration harness dùng Testcontainers PostgreSQL 17 + Redis 7.
- System harness đã được chạy cục bộ với PostgreSQL 16 + Redis 8 trên database tạm.
- `compose.test.yml` cung cấp PostgreSQL 17 + Redis 7 trên `127.0.0.1:15432/16379` để debug; dữ liệu nằm trên `tmpfs`.
- CI chạy cả integration (PG17/Redis7) và system acceptance (PG16/Redis8). Thiếu Docker/resource là failure, không skip.

Chạy integration mặc định bằng Testcontainers. Nếu cần debug với Compose:

```bash
docker compose -f compose.test.yml up -d --wait
IQX_TEST_EXTERNAL_SERVICES=1 \
TEST_DATABASE_URL=postgresql://iqx_v2_test:iqx_v2_test@127.0.0.1:15432/iqx_v2_test_compose \
TEST_REDIS_URL=redis://127.0.0.1:16379/15 \
npm run test:integration
docker compose -f compose.test.yml down
```

Harness chỉ chấp nhận localhost, database có prefix `iqx_v2_test_`, Redis port không phải `6379` và Redis DB khác `0` để giảm nguy cơ chạm dữ liệu thật.

Lockfile là nguồn phiên bản dependency. CI chạy `npm audit --audit-level=high`; override hiện tại ghim transitive `js-yaml 4.3.2` cho generator. Không chạy `npm audit fix --force` một cách tự động vì có thể đổi major hoặc phá contract; cập nhật dependency phải qua lockfile, test và review.

## Docker

```bash
docker build -t iqx/backend-v2:local backend-v2
docker volume create iqx-backend-v2-media
docker run --rm --env-file backend-v2/.env \
  -e APP_ENV=production -e MEDIA_ROOT=/app/media \
  -v iqx-backend-v2-media:/app/media \
  -p 3000:3000 iqx/backend-v2:local
```

`.env.example` đặt `APP_ENV=development` và để trống `MEDIA_ROOT`; `--env-file` sẽ ghi đè giá trị trong image, nên ví dụ Docker đặt lại cả hai biến sau `--env-file`. Cấu hình database v2 và JWT secrets trước khi chạy. Named volume giữ media qua lần thay container; khi dùng bind mount, thư mục host phải cho UID/GID của user `node` (1000:1000) quyền ghi. Nếu chạy nhiều replica, dùng storage chung bền vững.

Dockerfile đa tầng, runtime chạy user `node`, chỉ chứa production dependencies, `dist`, migrations và package metadata. `npm run build` sao chép prompt/contract assets cần thiết vào `dist`. Dùng cùng image cho worker hoặc ingest bằng cách override command.

Docker build chưa được xác minh trong lượt triển khai này vì daemon local không khả dụng; không có image nào được push và không có deploy hay production migration nào được thực hiện.

## Nguyên tắc vận hành

- Mỗi job/mutation có một owner; không chạy worker trùng ngoài cơ chế queue/idempotency.
- Không log secret, DSN, token hoặc raw authorization headers.
- Telegram link là bearer authorization ngắn hạn, dùng một lần; không chia sẻ deep-link này. Chỉ chấp nhận `/start` từ cuộc trò chuyện riêng của người gửi, qua webhook đã xác minh secret.
- Access token gắn với refresh-token family đang hoạt động trong DB. Logout, reset password và phát hiện refresh replay vô hiệu access token của family tương ứng ngay, không phải chờ hết TTL.
- `TRUST_PROXY_CIDRS` mặc định rỗng. Khi đặt sau reverse proxy, chỉ cấu hình IP/CIDR cụ thể do bạn kiểm soát; không chấp nhận wildcard/global CIDR. Audit và throttling lấy `request.ip` sau bước xác minh proxy này.
- Dùng `/health/live` cho process health và `/health/ready` cho dependency readiness.
- Media hiện là private local filesystem có signed URL; production nhiều replica cần shared durable volume hoặc thay storage adapter trước khi scale ngang.
- Route coverage, unit/system test và mocked providers là điều kiện cần, chưa thay thế staging verification, load test, security review, observability và rollback rehearsal.

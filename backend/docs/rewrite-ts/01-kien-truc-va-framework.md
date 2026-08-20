# Kiến trúc & lựa chọn framework

Chương này trả lời câu hỏi "dùng framework nào" và đưa ra bản đồ kiến trúc để chuyển
backend IQX từ **Python/FastAPI** sang **TypeScript**. Đọc chương này trước tất cả các
chương khác: nó quyết định thư viện, cách chia module, và những cái bẫy kỹ thuật phải
xử lý ngay từ ngày đầu.

---

## 1. Quy mô cần bao phủ

Bản viết lại phải đạt được **tương đương hành vi** (behavioural parity) với hệ thống hiện tại.
Quy mô đo được từ source:

| Hạng mục | Số lượng |
|---|---|
| REST operation (method + path) | **293** (291 hiện trong OpenAPI + 2 route HTML ẩn) |
| Đường dẫn (path) khác nhau | 267 |
| WebSocket endpoint | 1 (`/api/v1/market-data/ws`) |
| Nhóm chức năng (OpenAPI tag) | 52 |
| Schema OpenAPI (request/response model) | 229 |
| Bảng Postgres | 45 |
| Migration Alembic | 45 |
| File service (logic nghiệp vụ) | 173 |
| Nhà cung cấp dữ liệu bên ngoài | 19 |
| Job nền theo lịch | 7+ |
| File test hiện có | 159 |

Đặc điểm quan trọng hơn con số:

1. **Phần lớn endpoint là proxy + normalize dữ liệu thị trường**, không phải CRUD.
   Hơn 130 endpoint gọi ra nhà cung cấp ngoài (VCI/Vietcap, DNSE, Yahoo, Binance, SJC,
   VCB, Fmarket…), chuẩn hoá field, cache lại. Rủi ro lớn nhất khi viết lại là
   **normalize sai** — không phải viết sai route.
2. **Có khối tính toán số học thuần** rất lớn: 38 chỉ báo TA (numpy), engine backtest,
   phân tích pháp lý BCTC (forensic + DuPont + KPI ngân hàng/phi ngân hàng),
   chấm điểm danh mục. Đây là phần **khó port nhất** vì phụ thuộc numpy.
3. **Có tiền thật trong DB** (giao dịch ảo, thanh toán Premium, sổ cái T+N) → không được
   phép sai số dấu phẩy động.
4. **Có realtime** (WebSocket + Redis pub/sub + leader election + cầu nối MQTT/WS tới DNSE).
5. **Có nghiệp vụ trạng thái phức tạp**: Đấu trường Cấp 0→8 (68 endpoint, 20 bảng),
   mỗi cấp có điều kiện tốt nghiệp riêng và khoá chống gian lận.

---

## 2. Khuyến nghị: **NestJS** — đúng lựa chọn

**Câu trả lời ngắn: giữ nguyên dự định NestJS.** Đây là lựa chọn phù hợp nhất, không phải
vì NestJS "tốt hơn" nói chung, mà vì nó là framework TypeScript **duy nhất map 1:1 với
kiến trúc FastAPI hiện tại**, nên phần lớn công việc trở thành dịch máy móc chứ không phải
thiết kế lại.

### 2.1 Vì sao map 1:1

| FastAPI (hiện tại) | NestJS (đích) | Ghi chú |
|---|---|---|
| `Depends(...)` | Provider + constructor injection | Cùng mô hình DI |
| `app/api/v1/endpoints/*.py` (40 file) | `*.controller.ts` (40 controller) | 1 file → 1 controller |
| `app/services/**` (173 file) | `*.service.ts` (provider) | Giữ nguyên cây thư mục |
| `app/repositories/*.py` | `*.repository.ts` | Giữ nguyên |
| `app/schemas/*.py` (Pydantic) | `*.dto.ts` (Zod schema) | Xem §3.3 |
| `CurrentUser = Annotated[User, Depends(get_current_active_user)]` | `@UseGuards(JwtAuthGuard)` + `@CurrentUser()` | Guard + param decorator |
| `AdminUser` | `@Roles('admin')` + `RolesGuard` | |
| `PremiumUser` | `@UseGuards(PremiumGuard)` | |
| `AuditCtx` | `@AuditContext()` param decorator | Đọc từ request |
| `@app.exception_handler(AppException)` | `ExceptionFilter` | 1:1 |
| `RequestIDMiddleware` | `Interceptor` hoặc middleware | 1:1 |
| `SlowAPIMiddleware` | `@nestjs/throttler` | |
| APScheduler | `@nestjs/schedule` (`@Cron`) | |
| `FastAPI(...)` sinh `/openapi.json` | `@nestjs/swagger` | **Quan trọng** — xem §2.2 |
| `lifespan` (startup/shutdown) | `OnModuleInit` / `OnApplicationShutdown` | 1:1 |

### 2.2 Lý do quyết định nhất: giữ được OpenAPI

Hệ thống hiện tại **tự sinh** 267 path + 229 schema vào `/openapi.json`. Frontend (`dashboard/`)
và bộ tài liệu này đều dựa vào đó. Nếu chọn framework không có tầng sinh OpenAPI tích hợp
(Express thuần, Koa), bạn sẽ phải bảo trì thủ công đặc tả cho 293 endpoint — việc này
**sẽ hỏng** trong vòng vài tuần. `@nestjs/swagger` (kết hợp `nestjs-zod`) giữ được tính chất
"đặc tả sinh từ code".

### 2.3 Đánh giá thẳng các phương án khác

| Phương án | Nhận xét |
|---|---|
| **Hono + `@hono/zod-openapi` + Drizzle** | Nhẹ, nhanh, type-safety xuất sắc, chạy được cả edge. **Nhưng**: không có DI container → 173 service phải tự wire bằng tay hoặc factory; guard/interceptor/filter phải tự dựng; cron phải tự quản. Với 293 endpoint và nhiều tầng phụ thuộc chéo (service gọi service gọi repository), thiếu DI sẽ trả giá. **Chọn Hono nếu** bạn đang viết một service nhỏ 30–50 endpoint — không phải trường hợp này. |
| **Fastify thuần + plugin** | Nhanh nhất, nhưng cùng vấn đề như Hono: phải tự dựng lại DI/guard/lifecycle. Ngoài ra tổ chức 40 nhóm route bằng plugin sẽ rối hơn module NestJS. |
| **Express + TypeScript** | Không khuyến nghị. Không type-safety, không OpenAPI, không DI. Đi ngược lại chất lượng hiện có. |
| **tRPC** | Không phù hợp. API này **công khai** (có endpoint không auth, có webhook từ SePay/Telegram gọi vào, có WebSocket). tRPC giả định client là TypeScript và cùng repo — webhook bên thứ ba không nói được tRPC. |
| **AdonisJS** | Đầy đủ tính năng, nhưng ecosystem nhỏ hơn nhiều, và Lucid ORM yếu hơn Drizzle ở truy vấn phân tích phức tạp. |
| **Encore.ts / Effect-TS** | Thú vị nhưng rủi ro. Không nên dùng cho lần viết lại một hệ thống production 293 endpoint. |

> **Kết luận**: NestJS. Không phải vì nó "hiện đại nhất", mà vì nó là con đường **ít rủi ro
> nhất** để đạt tương đương hành vi. Toàn bộ ceremony của NestJS (module, decorator, DI)
> chính là thứ FastAPI đang làm — chỉ khác cú pháp.

---

## 3. Bộ thư viện khuyến nghị (stack cụ thể)

```
Node.js 22 LTS  ·  pnpm  ·  TypeScript 5.x (strict: true)
```

| Lớp | Chọn | Thay cho | Lý do |
|---|---|---|---|
| Framework | **NestJS 11** | FastAPI | §2 |
| HTTP adapter | **Fastify** (`@nestjs/platform-fastify`) | uvicorn | API này chủ yếu serialize JSON lớn; Fastify nhanh hơn Express rõ rệt. Xem §3.1 để biết 4 điểm cần xử lý riêng. |
| ORM | **Drizzle ORM** + `drizzle-kit` | SQLAlchemy 2.0 async | §3.2 |
| Driver DB | `postgres` (postgres.js) hoặc `pg` | asyncpg | Drizzle hỗ trợ cả hai. |
| Migration | **drizzle-kit** (baseline từ Alembic) | Alembic | §3.2.3 |
| Validation | **Zod 4** + `nestjs-zod` | Pydantic 2 | §3.3 |
| OpenAPI | `@nestjs/swagger` + `nestjs-zod` | FastAPI tự sinh | §2.2 |
| Auth | `jsonwebtoken` (hoặc `jose`) + guard tự viết | PyJWT + Depends | Không cần Passport; luồng token đã rõ ràng. |
| Hash mật khẩu | **`bcrypt`** (native) | passlib + bcrypt | **Bắt buộc bcrypt** — xem §5.1 |
| Redis | **`ioredis`** | redis-py | Cần 2 connection: 1 cho cache, 1 riêng cho pub/sub. |
| Cache | `@nestjs/cache-manager` + `cache-manager-ioredis-yet`, hoặc service tự viết | decorator tự viết | Xem chương 08. |
| Cron | **`@nestjs/schedule`** (1 instance) → **BullMQ** (nhiều instance) | APScheduler | §5.3 |
| HTTP client ra ngoài | **`undici`** (fetch + `Agent` pool) + `p-retry` | httpx AsyncClient | Giữ pattern "shared client, startup/shutdown". |
| WebSocket | **`ws`** qua custom `WebSocketAdapter` | FastAPI WebSocket | **Không dùng socket.io** — client hiện tại nói JSON frame thuần. |
| Số học tiền | **`BigInt` gốc của JS** cho phép nhân/chia nguyên | Python `int` + `//` | §5.2 — tiền là số nguyên VND, **không** cần `decimal.js` |
| Thời gian / múi giờ | **`luxon`** | datetime + zoneinfo | Logic phiên giao dịch dùng ICT (UTC+7). |
| Ảnh | **`sharp`** | Pillow | Nhanh hơn nhiều. |
| Upload | `@fastify/multipart` | python-multipart | |
| Static file | `@nestjs/serve-static` (`/media`) | StaticFiles | |
| Email | **`resend`** (SDK chính thức) | httpx gọi tay | Thắng trực tiếp. |
| Rate limit | `@nestjs/throttler` (+ storage Redis) | slowapi | |
| Logger | **`pino`** (`nestjs-pino`) | logging stdlib | JSON log + gắn `X-Request-ID`. |
| Test | **Vitest** + `@testcontainers/postgresql` | pytest + aiosqlite | §5.4 |
| Lint/format | **Biome** (hoặc ESLint + Prettier) | ruff | Biome nhanh, một tool cho cả hai. |
| Tính toán số | **Float64Array** tự viết + golden test | numpy | §5.5 — rủi ro cao nhất |

### 3.1 Bốn điểm cần xử lý riêng khi dùng Fastify adapter

Fastify nhanh hơn nhưng khác Express ở đúng bốn chỗ mà dự án này chạm tới:

1. **Multipart upload** (upload bài học): cần đăng ký `@fastify/multipart`, và
   `FileInterceptor` của `@nestjs/platform-express` **không dùng được**. Dùng
   `@fastify/multipart` trực tiếp hoặc `@nest-lab/fastify-multer`.
2. **Raw body cho webhook SePay**: xác thực signature IPN cần **body thô chưa parse**.
   Với Fastify phải bật `rawBody: true` khi tạo app và thêm content-type parser riêng cho
   route IPN. Nếu bỏ qua, signature sẽ luôn sai. *(Chi tiết thuật toán: chương 07.)*
3. **Static `/media`**: `ServeStaticModule` cần cấu hình `serveRoot` + `@fastify/static`;
   lưu ý Fastify không cho phép hai plugin static cùng prefix.
4. **Throttler**: `@nestjs/throttler` hoạt động, nhưng cách lấy IP khác (`request.ip` với
   `trustProxy` bật). Vì `slowapi` hiện dùng `get_remote_address` (tức IP peer), phải
   cấu hình `trustProxy` đúng theo số lớp proxy trước app (Coolify → 1 lớp).

> Nếu muốn giảm rủi ro tối đa cho sprint đầu: khởi động bằng **Express adapter**, đổi sang
> Fastify sau khi đã có test bao phủ. Đổi adapter là thay đổi cục bộ ở `main.ts`.

### 3.2 Vì sao Drizzle, không phải Prisma

**Chọn Drizzle** vì ba lý do gắn trực tiếp với codebase này:

1. **Có sẵn 45 bảng do Alembic tạo.** `drizzle-kit pull` introspect DB đang chạy và sinh ra
   file schema TypeScript khớp *đúng* với thực tế — kể cả enum Postgres, CHECK constraint,
   index. Đây là cách duy nhất đảm bảo không lệch schema. Prisma cũng có `db pull` nhưng
   biểu diễn CHECK constraint và enum kém hơn.
2. **Truy vấn phân tích phức tạp.** Các repository hiện tại dùng `select()` với join nhiều
   bảng, `group by`, window function, aggregate (admin metrics, leaderboard giao dịch ảo,
   peer median theo ngành, sổ cái T+N). Drizzle là query builder SQL-first: dịch từ
   SQLAlchemy `select()` sang Drizzle gần như 1:1. Prisma bắt bạn rơi xuống `$queryRaw`
   (mất type-safety) cho đúng những truy vấn khó này.
3. **Kiểm soát kiểu `numeric`.** Xem §5.2 — Drizzle cho bạn quyết định `numeric` map sang
   `string` (an toàn) thay vì bị ép sang `number`.

Đánh đổi phải biết: Drizzle không có Prisma Studio, và quan hệ phải khai báo tay
(`relations()`). Với 45 bảng đó là khoảng một ngày làm việc, đổi lại quyền kiểm soát SQL.

#### 3.2.3 Chiến lược migration — KHÔNG chạy lại Alembic

Đây là quyết định vận hành quan trọng:

- DB production **đã ở trạng thái cuối** của 45 migration Alembic (Alembic head hiện tại:
  `7b3c1e5a9d24`). **Không** viết lại 45 migration đó bằng drizzle-kit.
- Cách làm: `drizzle-kit pull` từ DB production (hoặc từ staging đã migrate đủ) →
  được `schema.ts` + một snapshot baseline → commit snapshot đó như "migration 0000"
  đã-áp-dụng. Từ đó mọi thay đổi mới đi bằng `drizzle-kit generate`.
- Giữ lại bảng `alembic_version` trong DB (đừng xoá) cho tới khi chắc chắn không cần
  rollback về bản Python.
- Trong giai đoạn chạy song song hai backend trên cùng một DB, **chỉ một bên được quyền
  migrate**.

### 3.3 Zod + nestjs-zod, không phải class-validator

Nest mặc định dùng `class-validator`. Ở đây nên chọn **Zod** vì:

- Cần **tái tạo đúng hình dạng lỗi 422 của Pydantic** (`{"detail":[{"type","loc","msg","input"}]}`)
  để frontend không phải sửa. Zod cho toàn quyền định dạng lại lỗi trong một `ZodValidationPipe`
  tự viết; class-validator trả cấu trúc khác và khó uốn.
- Pydantic model dịch sang Zod schema rất sát (`Field(ge=0, le=100)` → `z.number().min(0).max(100)`,
  `Literal[...]` → `z.enum([...])`, `str | None` → `z.string().nullable()`).
- Cùng một schema Zod dùng lại được để validate biến môi trường (chương 05) **và** chia sẻ
  type sang frontend.
- `nestjs-zod` vẫn cung cấp metadata cho `@nestjs/swagger` → giữ được `/openapi.json`.

---

## 4. Bản đồ module NestJS

Mỗi file trong `app/api/v1/endpoints/` trở thành một module. Nhóm lại theo miền nghiệp vụ:

```
src/
├─ main.ts                      # bootstrap: adapter, CORS, filter, pipe, swagger, static
├─ app.module.ts
├─ common/                      # tầng dùng chung — dựng TRƯỚC mọi module nghiệp vụ
│  ├─ config/                   # Zod env schema  → chương 05
│  ├─ database/                 # Drizzle module, schema/*.ts (45 bảng) → chương 06a/b/c
│  ├─ auth/                     # JwtAuthGuard, RolesGuard, PremiumGuard, @CurrentUser  → chương 03
│  ├─ errors/                   # AppException + AllExceptionsFilter  → chương 04
│  ├─ interceptors/             # RequestIdInterceptor, LoggingInterceptor  → chương 02
│  ├─ cache/                    # RedisModule + @Cacheable  → chương 08
│  ├─ http/                     # UpstreamHttpService (undici pool, retry)  → chương 07
│  └─ decimal/                  # helper tiền/giá  → §5.2
│
├─ modules/
│  ├─ health/                   # 1 endpoint
│  ├─ auth/                     # 7   → chương 20
│  ├─ users/                    # 7   → chương 20
│  ├─ premium/                  # 10 (gồm webhook SePay IPN) → chương 21
│  ├─ admin-payments/           # 5   → chương 21
│  ├─ admin-subscriptions/      # 5   → chương 21
│  ├─ admin-ipn/                # 3   → chương 21
│  ├─ market-data/              # ~110 endpoint — CHIA THÀNH SUBMODULE:
│  │   ├─ reference/            # 8   → chương 22
│  │   ├─ quotes/               # 3   → chương 22
│  │   ├─ screening/            # 3   → chương 22
│  │   ├─ company/              # 7   → chương 23
│  │   ├─ trading/              # 10  → chương 23
│  │   ├─ overview/             # 16  → chương 24
│  │   ├─ sectors/              # 3+1 → chương 24
│  │   ├─ macro/                # 5   → chương 25
│  │   ├─ global/               # 6   → chương 25
│  │   ├─ funds/                # 3   → chương 25
│  │   ├─ events/               # 1   → chương 25
│  │   ├─ sheets/               # 3   → chương 25
│  │   ├─ news/                 # 7   → chương 26
│  │   └─ fundamentals/         # 3 (BCTC — payload rất lớn) → chương 27
│  ├─ sources/                  # 19 provider adapter (KHÔNG phải controller) → chương 07
│  ├─ market-analysis/          # 10  → chương 28
│  ├─ ai/                       # 12  → chương 29
│  ├─ portfolio-manager/        # 2   → chương 30
│  ├─ virtual-trading/          # 9 + 5 admin + 10 admin-vt = 24 → chương 31
│  ├─ arena/                    # Cấp 0-8: 68 endpoint → chương 32, 33, 34, 35
│  │   ├─ cap0/ … cap8/         # mỗi cấp 1 submodule
│  │   └─ shared/               # gate/graduation/kehoach/ketso dùng chung
│  ├─ watchlist/                # 5   → chương 36
│  ├─ chart-drawings/           # 3   → chương 36
│  ├─ backtest/                 # 6   → chương 36
│  ├─ alerts/                   # 9 + 6 admin → chương 37
│  ├─ telegram/                 # 1 webhook → chương 37
│  ├─ lessons/                  # 5 + 11 admin → chương 38
│  ├─ admin-users/              # 6   → chương 39
│  ├─ admin-metrics/            # 3   → chương 39
│  ├─ admin-audit/              # 1   → chương 39
│  ├─ admin-system/             # 2   → chương 39
│  └─ realtime/                 # 1 WebSocket + cầu nối DNSE → chương 10
│
├─ jobs/                        # 7 cron job  → chương 09
└─ compute/                     # THUẦN HÀM SỐ — không phụ thuộc Nest
   ├─ ta/                       # 38 chỉ báo   → §5.5
   ├─ backtest/                 # engine
   ├─ bctc/                     # forensic, DuPont, KPI bank/non-bank
   └─ scoring/                  # chấm điểm danh mục & insight
```

Tách `compute/` ra khỏi cây Nest là có chủ đích: đó là hàm thuần, cần test bằng golden
fixture, và không nên phụ thuộc DI.

---

## 5. Năm cái bẫy phải xử lý ngay từ đầu

Đây là những chỗ mà "dịch đúng cú pháp" vẫn cho ra **hành vi sai**.

### 5.1 Hash mật khẩu — bắt buộc dùng bcrypt

DB production đang chứa hash bcrypt do `passlib` sinh (`$2b$...`). Bản TS **phải verify được
những hash cũ đó**, nếu không toàn bộ người dùng hiện hữu không đăng nhập được.

- Dùng package `bcrypt` (native) hoặc `bcryptjs`. **Không** đổi sang argon2/scrypt.
- Giữ nguyên cost factor mà passlib đã dùng khi tạo hash cũ (verify không cần biết cost —
  cost nằm trong chuỗi hash — nhưng hash **mới** nên dùng cùng cost để đồng nhất).
- `bcrypt` giới hạn 72 byte đầu của mật khẩu. passlib cũng vậy → hành vi trùng khớp,
  nhưng phải giữ nguyên: **không** tự pre-hash bằng SHA-256 trước khi bcrypt.
- Viết một test cố định: lấy 3 hash thật từ DB dev + mật khẩu tương ứng, assert verify = true.

### 5.2 Tiền — phép chia nguyên, KHÔNG phải sai số dấu phẩy động

Đây là chỗ dễ hiểu sai nhất, nên nói chính xác ngay từ đầu:

**Hệ thống KHÔNG dùng `Decimal` cho tiền.** Toàn bộ tiền là **số nguyên đồng VND**:

| Nhóm cột | Kiểu Postgres | Ví dụ |
|---|---|---|
| Tiền tài khoản, giá trị lệnh, phí, thuế (`*_vnd`) | `BIGINT` | `initial_cash_vnd` default `1_000_000_000` |
| Giá gói Premium, số tiền đơn (`price_vnd`, `amount_vnd`) | `INTEGER` | |
| Tỷ lệ phí & thuế | `INTEGER` **theo basis point (bps)** | `buy_fee_rate_bps=15` (0,15%), `sell_tax_rate_bps=10` (0,1%) |
| Khối lượng, lô | `INTEGER` | `board_lot_size=100` |
| Giá/chỉ số trong bảng phân tích (`cap1`, `cap5`, `cap7`, `cap8`) | `NUMERIC(p,s)` **với `asdecimal=False`** → Python `float` | `Numeric(18,4, asdecimal=False)` |
| `market_data_snapshot.*`, `alert_events.price` | `NUMERIC(p,s)` (mặc định `Decimal`) nhưng schema Pydantic khai `float` → JSON ra **number** | |

Hệ quả cho bản TS:

- **`decimal.js` KHÔNG cần cho tiền.** JS `number` biểu diễn chính xác mọi số nguyên tới
  2^53 ≈ 9,007 × 10¹⁵ đồng (9 triệu tỷ) — vượt xa mọi giá trị thực tế. Dùng `number`.
- Với các cột `NUMERIC`, driver `pg`/postgres.js trả về **`string`**. Vì bản Python trả
  `float` ra JSON, bản TS **phải parse sang `number`** ở tầng repository để response khớp.
  Đây là hành vi khác mặc định của driver → phải làm tường minh.

**Cái bẫy thật sự: Python `//` là phép chia LẤY SÀN trên số nguyên; JS `/` là chia thực.**

Ba công thức dưới đây phải port **nguyên xi**, sai một đồng là lệch sổ cái:

```ts
// Phí/thuế từ basis point — làm tròn nửa lên bằng số học nguyên.
// Python: (amount * rate_bps + 5000) // 10000
function roundBps(amount: number, rateBps: number): number {
  // Dùng BigInt cho phép nhân trung gian: gross tối đa
  // (10_000_000 đ/cp × 1_000_000 cp = 10^13) × rate có thể tiến gần 2^53.
  return Number((BigInt(amount) * BigInt(rateBps) + 5000n) / 10000n);
}

// Giá vốn bình quân — Python: ((old_cost * old_total) + (price * qty)) // new_total
function avgCost(oldCost: number, oldTotal: number, price: number, qty: number): number {
  const newTotal = oldTotal + qty;
  return Number(
    (BigInt(oldCost) * BigInt(oldTotal) + BigInt(price) * BigInt(qty)) / BigInt(newTotal)
  );
}
```

- `BigInt / BigInt` trong JS **cắt về 0** (truncate). Với mọi giá trị ở đây đều **không âm**,
  truncate ≡ floor ≡ `//` của Python. Nếu về sau có giá trị âm (điều chỉnh tiền âm qua
  `cash-adjust`), phải xử lý riêng vì Python `//` làm tròn **xuống** (`-7 // 2 == -4`)
  còn BigInt cắt về 0 (`-7n / 2n === -3n`). **Kiểm tra kỹ mọi chỗ có số âm.**
- Tuyệt đối **không** viết `Math.round(amount * rateBps / 10000)` — khác kết quả ở các
  điểm đúng nửa đơn vị.

Hai điểm quan trọng khác:

- **Snapshot cấu hình tại thời điểm khớp lệnh**: lệnh lưu lại `buy_fee_rate_bps` /
  `sell_fee_rate_bps` / `sell_tax_rate_bps` đang hiệu lực khi khớp, và dùng bản snapshot đó
  chứ không đọc lại config hiện tại. Đổi phí trong admin **không** được làm thay đổi lệnh cũ.
  Bản TS phải giữ đúng cơ chế này.
- **Golden test bắt buộc** cho: `roundBps`, giá vốn bình quân, engine khớp lệnh mua/bán,
  T+N settlement, và `return_pct` (`round(x, 2)` của Python là làm tròn **nửa về số chẵn** —
  `round(0.125, 2) == 0.12` — khác `toFixed(2)` của JS; nếu con số này hiện ra UI thì phải khớp).

### 5.3 Advisory lock của job — lỗi đã xảy ra ở production

Hệ thống hiện dùng **session-level** `pg_advisory_lock`. Với connection pool async, lock bị
"rò" — connection trả về pool mà lock vẫn giữ → các lần chạy sau **im lặng bỏ qua vĩnh viễn**
(brief giữa phiên / quốc tế không được sinh ra). Đã phải recreate backend để giải toả.

**Bản TS không được lặp lại.** Chọn một trong hai:

- `pg_advisory_xact_lock(...)` — lock cấp **transaction**, tự nhả khi commit/rollback.
  Đơn giản nhất, đúng nhất.
- Hoặc Redis lock có TTL (`SET key val NX PX ttl`) + renew, nếu muốn lock độc lập DB.

Và: **luôn log** khi job bỏ qua vì không lấy được lock. Bug trên sống lâu vì nó im lặng.

### 5.4 Bộ test — port fixture trước, port code sau

Có 159 file test đang bảo vệ hành vi. Đừng viết lại test từ đầu theo cảm nhận.

Cách làm hiệu quả nhất:

1. Chạy bộ test Python hiện tại, **dump input/output của các hàm tính toán** ra JSON
   (`tests/fixtures/golden/*.json`): chỉ báo TA, engine backtest, KPI BCTC, chấm điểm
   danh mục, normalize từng provider.
2. Bên TS, viết test đọc chính những file JSON đó và assert khớp (với sai số cho phép
   rõ ràng, ví dụ `1e-9` cho số thực).
3. Chỉ sau khi golden test xanh mới tin phần `compute/`.

Với test tích hợp: dùng `@testcontainers/postgresql` (Postgres thật) thay vì SQLite —
codebase hiện tại dùng `aiosqlite` cho test, nhưng có nhiều đặc tính riêng của Postgres
(enum, `numeric`, CHECK, advisory lock) mà SQLite không mô phỏng được.

### 5.5 Thay thế numpy — phần rủi ro cao nhất

`app/services/ta/indicators.py`, `app/services/backtest/engine.py`, và các module BCTC dùng
numpy cho mảng, rolling window, thống kê. TypeScript không có tương đương trực tiếp.

Khuyến nghị: **tự viết trên `Float64Array`**, không kéo thư viện nặng.

- Cần đúng vài chục primitive: `rollingMean`, `rollingStd`, `ewm` (EMA), `diff`, `cumsum`,
  `shift`, `where`, `argmax`, `percentile`, `linreg`. Viết một lần trong `compute/array/`,
  test kỹ.
- **Không** dùng `technicalindicators` npm để "tiết kiệm thời gian": công thức của nó
  khác ở khởi tạo (seed period, cách tính EMA đầu chuỗi) → kết quả lệch so với bản hiện tại,
  và mọi cảnh báo/backtest sẽ lệch theo.
- Cẩn thận hai điểm numpy khác JS: xử lý `NaN` (numpy lan truyền NaN; phải mô phỏng đúng)
  và chia cho 0 (numpy ra `inf`/`nan` + warning, JS ra `Infinity`/`NaN` im lặng).
- `danfojs` là lựa chọn cuối nếu cần DataFrame thật, nhưng nó nặng và bảo trì chậm.

---

## 6. Thứ tự thực hiện đề xuất

Thứ tự này tối ưu cho "sớm có thứ chạy được và kiểm chứng được", không phải theo số chương.

| Giai đoạn | Nội dung | Chương tham chiếu |
|---|---|---|
| **0. Nền** | Dự án Nest, config Zod, Drizzle pull 45 bảng, logger, filter lỗi, interceptor request-id, CORS, throttler | 02, 04, 05, 06a-c |
| **1. Auth** | JWT + refresh rotation + guard + premium gate. **Mốc kiểm chứng: user production đăng nhập được.** | 03, 20 |
| **2. Đọc thuần** | Health, users, watchlist, chart-drawings, lessons (đọc) | 20, 36, 38 |
| **3. Cache + upstream** | `UpstreamHttpService`, Redis cache, 19 provider adapter + normalize | 07, 08 |
| **4. Market data** | ~110 endpoint proxy. **Chạy song song, so response byte-với-byte với backend Python.** | 22–27 |
| **5. Tính toán** | `compute/`: TA, backtest, BCTC, scoring — dựa trên golden fixture | §5.5 |
| **6. Tiền** | Giao dịch ảo + T+N + Premium/SePay IPN. Cẩn trọng nhất. | 21, 31 |
| **7. AI** | AI proxy, insight, market-analysis, portfolio-manager | 28, 29, 30 |
| **8. Nghiệp vụ trạng thái** | Cấp 0→8 (68 endpoint) | 32, 33, 34, 35 |
| **9. Cảnh báo & job** | Alerts, Telegram, 7 cron job (dùng lock cấp transaction) | 09, 37 |
| **10. Realtime** | WebSocket + cầu nối DNSE + leader election | 10 |
| **11. Admin** | admin-users/metrics/audit/system, admin-vt, admin-lessons | 39, 21, 31, 38 |

**Chiến lược chuyển đổi**: chạy hai backend song song sau một reverse proxy, route theo
prefix path từng nhóm sang bản TS khi nhóm đó đã đạt parity. Vì mọi endpoint đều dưới
`/api/v1/...` và stateless (JWT), việc chia route theo prefix là khả thi — miễn là hai bên
dùng **cùng `JWT_SECRET_KEY`** và cùng DB.

---

## 7. Điều KHÔNG nên thay đổi trong lần viết lại này

Viết lại ngôn ngữ đã đủ rủi ro. Giữ nguyên những thứ sau, để nếu có lỗi thì biết chắc lỗi
do việc dịch:

- **Hình dạng response** của mọi endpoint — kể cả chỗ bạn thấy chưa đẹp (tên field
  `snake_case`, phân trang không nhất quán giữa các domain, `/api/v1/users/` có dấu `/` cuối).
  Ghi lại "nợ kỹ thuật" và sửa ở phiên bản `/api/v2` sau.
- **Message lỗi tiếng Việt** — frontend đang hiển thị trực tiếp một số message.
- **Lược đồ DB** — không đổi tên cột, không đổi enum, không "chuẩn hoá lại" bảng.
- **Cấu trúc JWT payload** — để hai backend dùng chung token trong giai đoạn song song.
- **Tên biến môi trường** — để tái dùng cấu hình production hiện tại.

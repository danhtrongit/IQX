# IQX Backend

Backend FastAPI sẵn sàng cho môi trường sản xuất của nền tảng IQX.

## Công nghệ sử dụng

| Công nghệ | Phiên bản | Mục đích |
|---|---|---|
| Python | 3.13.x | Runtime |
| FastAPI | 0.136.x | Web framework |
| SQLAlchemy | 2.0.x (async) | ORM |
| asyncpg | 0.31.x | Driver PostgreSQL async |
| Alembic | 1.18.x | Quản lý migration |
| Pydantic | 2.x | Validate dữ liệu |
| pydantic-settings | 2.x | Cấu hình |
| PyJWT | 2.x | Xác thực JWT |
| passlib + bcrypt | — | Hash mật khẩu |
| uv | 0.9.x | Quản lý package & môi trường |
| pytest | 8.x | Kiểm thử |
| ruff | 0.15.x | Lint & format |
| Redis | 7.x | Cache layer (tùy chọn) |

## Cấu trúc thư mục

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py                 # Dependency cho auth & DB
│   │   └── v1/
│   │       ├── router.py           # Tổng hợp router v1
│   │       └── endpoints/
│   │           ├── health.py       # GET /api/v1/health
│   │           ├── auth.py         # Đăng ký, đăng nhập, refresh, me
│   │           ├── users.py        # CRUD người dùng (admin + self)
│   │           ├── premium.py      # Gói Premium, checkout, IPN
│   │           ├── market_data.py  # Dữ liệu thị trường
│   │           └── virtual_trading.py  # Giao dịch ảo
│   ├── core/
│   │   ├── config.py               # Cấu hình pydantic-settings
│   │   ├── database.py             # Engine & session async
│   │   ├── exceptions.py           # Lớp ngoại lệ chuẩn hóa
│   │   ├── logging.py              # Cấu hình logging
│   │   └── security.py             # JWT & hash mật khẩu
│   ├── models/                     # SQLAlchemy models
│   ├── schemas/                    # Pydantic schemas
│   ├── services/                   # Logic nghiệp vụ
│   ├── repositories/               # Truy cập dữ liệu
│   └── main.py                     # Điểm khởi chạy FastAPI
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
├── tests/
├── docs/                            # Tài liệu chuyên đề
├── alembic.ini
├── pyproject.toml
├── .env.example
└── .gitignore
```

## Bắt đầu nhanh

### Yêu cầu

- Python 3.12+ (khuyến nghị 3.13)
- PostgreSQL 15+
- Redis 7+ *(tùy chọn — bật qua `REDIS_ENABLED=true`)*
- Đã cài [uv](https://docs.astral.sh/uv/)

### 1. Cài đặt môi trường

```bash
cd backend

# Tạo virtual env
uv venv --python 3.13

# Cài tất cả dependency (kể cả dev)
uv sync --all-extras
```

### 2. Cấu hình biến môi trường

```bash
# Sao chép file mẫu và chỉnh sửa
cp .env.example .env

# Chỉnh sửa .env với thông tin database và JWT secret
# Sinh JWT secret bằng:
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

**Biến môi trường bắt buộc cho tích hợp SePay:**

| Biến | Mô tả |
|---|---|
| `SEPAY_MERCHANT_ID` | Merchant ID trên SePay |
| `SEPAY_SECRET_KEY` | Secret key SePay (cho ký + verify IPN) |
| `SEPAY_CHECKOUT_URL` | `https://pay-sandbox.sepay.vn/v1/checkout/init` (sandbox) hoặc URL production |
| `APP_PUBLIC_URL` | URL frontend (cho redirect success/error/cancel) |

### 3. Khởi tạo database

Đảm bảo PostgreSQL đang chạy, sau đó tạo database:

```sql
CREATE USER "IQX" WITH PASSWORD 'mat_khau_cua_ban';
CREATE DATABASE "IQX" OWNER "IQX";
```

### 4. Chạy migration

```bash
# Database mới hoàn toàn:
uv run alembic upgrade head

# Database kế thừa (đã có bảng từ Prisma):
uv run alembic stamp 000000000001
uv run alembic upgrade head
```

### 5. Chạy server dev

```bash
uv run fastapi dev app/main.py
```

API sẽ có ở:
- **API**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Endpoint API (cấp cao)

### Sức khỏe hệ thống
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/health` | Kiểm tra ứng dụng + database + Redis |

### Xác thực
| Method | Path | Mô tả | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Đăng ký người dùng mới | — |
| POST | `/api/v1/auth/login` | Đăng nhập (trả về token) | — |
| POST | `/api/v1/auth/refresh` | Làm mới cặp token | — |
| POST | `/api/v1/auth/logout` | Thu hồi tất cả refresh token | Bearer |
| GET | `/api/v1/auth/me` | Lấy người dùng hiện tại | Bearer |

### Người dùng
| Method | Path | Mô tả | Auth |
|---|---|---|---|
| GET | `/api/v1/users/me` | Lấy hồ sơ chính mình | Bearer |
| PATCH | `/api/v1/users/me` | Cập nhật hồ sơ chính mình | Bearer |
| GET | `/api/v1/users/` | Danh sách người dùng (phân trang) | Admin |
| POST | `/api/v1/users/` | Tạo người dùng | Admin |
| GET | `/api/v1/users/{id}` | Lấy người dùng theo ID | Admin |
| PATCH | `/api/v1/users/{id}` | Cập nhật người dùng | Admin |
| DELETE | `/api/v1/users/{id}` | Xóa mềm người dùng | Admin |

### Premium & Thanh toán
| Method | Path | Mô tả | Auth |
|---|---|---|---|
| GET | `/api/v1/premium/plans` | Danh sách gói Premium đang hoạt động | — |
| GET | `/api/v1/premium/me` | Trạng thái gói của bản thân | Bearer |
| POST | `/api/v1/premium/checkout` | Tạo form thanh toán SePay | Bearer |
| POST | `/api/v1/premium/sepay/ipn` | Webhook IPN từ SePay | X-Secret-Key |
| GET | `/api/v1/premium/admin/plans` | Liệt kê tất cả gói (cả không hoạt động) | Admin |
| POST | `/api/v1/premium/admin/plans` | Tạo gói Premium | Admin |
| PATCH | `/api/v1/premium/admin/plans/{id}` | Cập nhật gói | Admin |
| POST | `/api/v1/premium/admin/users/{id}/grant` | Cấp Premium thủ công | Admin |

### Giao dịch ảo

Chi tiết quy tắc nghiệp vụ và lifecycle: [`docs/virtual-trading.md`](docs/virtual-trading.md).

### Dữ liệu thị trường

Bảng endpoint cấp cao và bản đồ nguồn upstream: [`docs/market-data-source-map.md`](docs/market-data-source-map.md).

Chi tiết theo chủ đề:

- [`docs/company-statistics-api-map.md`](docs/company-statistics-api-map.md) — Thống kê công ty (nước ngoài, tự doanh, nội bộ, cung cầu)
- [`docs/vietcap-market-overview-api.md`](docs/vietcap-market-overview-api.md) — Tổng quan thị trường (thanh khoản, index impact, foreign, allocation, valuation, breadth, heatmap)
- [`docs/vietcap-market-overview-api-supplement.md`](docs/vietcap-market-overview-api-supplement.md) — Bổ sung Market Overview
- [`docs/vietcap-sector-api.md`](docs/vietcap-sector-api.md) — Trang ngành
- [`docs/vietcap-screening-api.md`](docs/vietcap-screening-api.md) — Bộ lọc cổ phiếu
- [`docs/vietcap-ai-news-api-discovery.md`](docs/vietcap-ai-news-api-discovery.md) — API tin AI Vietcap

### Tham số query (Danh sách người dùng)

| Param | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `page` | int | 1 | Số trang |
| `page_size` | int | 20 | Số bản ghi mỗi trang (tối đa 100) |
| `search` | string | — | Tìm theo email, họ tên, số điện thoại |
| `role` | enum | — | Lọc theo vai trò |
| `status` | enum | — | Lọc theo trạng thái |
| `sort_by` | string | created_at | Trường sắp xếp |
| `sort_order` | asc/desc | desc | Hướng sắp xếp |

## Tích hợp SePay

### Cách hoạt động

1. **Checkout**: Frontend gọi `POST /api/v1/premium/checkout` với `plan_id`. Backend trả về danh sách trường form (gồm chữ ký HMAC-SHA256) để frontend POST lên SePay qua HTML form.
2. **Thanh toán**: Người dùng hoàn tất thanh toán trên trang checkout của SePay.
3. **IPN**: SePay gửi POST đến `/api/v1/premium/sepay/ipn` khi trạng thái thanh toán đổi. Backend:
   - Kiểm tra header `X-Secret-Key` (so sánh constant-time)
   - Yêu cầu `notification_type=ORDER_PAID`, `order_status=CAPTURED`, `transaction_status=APPROVED`
   - Kiểm tra cả tiền tệ order/transaction (VND) và số tiền
   - Parse số tiền bằng `Decimal` (loại bỏ phần thập phân)
   - Atomic claim đơn (chống race condition khi SePay retry)
   - Mở rộng thời hạn Premium cho người dùng
4. **Redirect thành công**: SePay redirect về frontend. **Lưu ý**: redirect không kích hoạt Premium, chỉ IPN mới làm điều đó. Frontend nên poll `GET /api/v1/premium/me` để kiểm tra.

### Stack thời gian Premium

Khi người dùng mua Premium trong khi đang còn Premium hoạt động, thời gian mới được **cộng thêm vào `current_period_end`** (không phải tính từ `now`). Áp dụng cho cả IPN và admin grant.

### Cấu hình IPN trên SePay

Cấu hình SePay gửi IPN tới:
```
POST https://your-domain.com/api/v1/premium/sepay/ipn
```

Đặt header `X-Secret-Key` trong dashboard SePay khớp với biến môi trường `SEPAY_SECRET_KEY`.

## Lệnh phát triển

```bash
# Cài dependency
uv sync --all-extras

# Chạy server dev
uv run fastapi dev app/main.py

# Chạy test
uv run pytest -v

# Chạy test kèm coverage
uv run pytest --cov=app --cov-report=term-missing

# Lint
uv run ruff check app/ tests/

# Format
uv run ruff format app/ tests/

# Kiểm tra kiểu
uv run mypy app/ tests/

# Sinh migration
uv run alembic revision --autogenerate -m "mô tả"

# Áp dụng migration
uv run alembic upgrade head

# Seed danh sách mã chứng khoán
uv run python -m app.scripts.seed_symbols --validate-logos --deactivate-missing

# Lùi migration
uv run alembic downgrade -1
```

## Kiến trúc

Dự án theo **kiến trúc phân lớp**:

1. **Endpoints** (`api/`) — Xử lý HTTP request, validate, serialize
2. **Services** (`services/`) — Logic nghiệp vụ, điều phối
3. **Repositories** (`repositories/`) — Truy cập dữ liệu, query
4. **Models** (`models/`) — SQLAlchemy ORM
5. **Schemas** (`schemas/`) — Pydantic request/response
6. **Core** (`core/`) — Config, security, database, exceptions

### Quyết định thiết kế chính

- **Khóa chính UUID** — An toàn cho hệ phân tán, không lộ ID tuần tự
- **Soft delete** — Người dùng được đánh dấu `deleted` thay vì xóa thật
- **Phân quyền theo vai trò** — `admin` và `user`, kiểm soát qua dependency
- **Validate số điện thoại** — Dùng `phonenumbers` cho định dạng E.164
- **JWT cặp token** — Access ngắn hạn + refresh dài hạn có rotation
- **Khởi tạo engine lazy** — Engine database chỉ tạo khi cần
- **Yêu cầu mật khẩu** — Tối thiểu 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt
- **IPN nguyên tử** — Conditional UPDATE chống cấp Premium 2 lần khi SePay retry
- **Số tiền Decimal** — VND parse bằng `Decimal`, loại bỏ phần thập phân
- **Redis cache tùy chọn** — Mặc định tắt, bật qua env; Redis lỗi = chạy uncached

## Redis Cache

### Khởi chạy Redis

Cách đơn giản nhất là dùng Docker:

```bash
docker run -d --name iqx-redis -p 6379:6379 redis:7-alpine
```

Hoặc thêm vào `docker-compose.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
```

### Bật cache

Cập nhật `.env`:

```ini
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379/0
```

### TTL theo nhóm endpoint

| Nhóm | TTL mặc định | Biến ENV |
|---|---|---|
| Reference (symbols, industries) | 3600s (1h) | `REDIS_TTL_REFERENCE_SECONDS` |
| Overview (heatmap, breadth) | 30s | `REDIS_TTL_OVERVIEW_SECONDS` |
| Macro, Funds, Company | 900s (15m) | `REDIS_TTL_MACRO_SECONDS` |
| News, AI News | 300s (5m) | `REDIS_TTL_NEWS_SECONDS` |
| Intraday, Price-depth | 15s | `REDIS_TTL_REALTIME_SECONDS` |
| Khác (OHLCV, trading...) | 300s (5m) | `REDIS_DEFAULT_TTL_SECONDS` |

### Endpoint không cache

- `POST /trading/price-board` — POST endpoint
- `POST /screening/search` — POST endpoint
- Auth endpoints — user-sensitive
- Users endpoints — user-sensitive
- Premium endpoints — subscription-specific
- Virtual trading — user-specific write
- AI analysis — user-specific prompt
- Health — monitoring

## Chiến lược migration

Chuỗi migration hỗ trợ cả database mới và kế thừa:

```
000000000001  →  488c85bb0b6a  →  fb7a64f07299
(initial)        (legacy→new)     (premium tables)
```

- **DB mới**: `000000000001` tạo `users` + `refresh_tokens`; `488c85bb0b6a` phát hiện schema mới và bỏ qua.
- **DB cũ**: `000000000001` phát hiện bảng `users` đã có và bỏ qua; `488c85bb0b6a` thực hiện chuyển đổi Prisma → SQLAlchemy.

## Ghi chú

- Phiên bản Python: **3.13.x** (cài bằng Homebrew là tiện nhất)
- `.env` đã được gitignore và không được commit
- Test dùng SQLite in-memory cho isolation
- Triển khai production nên dùng biến môi trường (không phải `.env`)

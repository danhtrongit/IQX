# IQX Backend

Production-ready FastAPI backend for the IQX platform.

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.13.x | Runtime |
| FastAPI | 0.136.x | Web framework |
| SQLAlchemy | 2.0.x (async) | ORM |
| asyncpg | 0.31.x | PostgreSQL async driver |
| Alembic | 1.18.x | Database migrations |
| Pydantic | 2.x | Data validation |
| pydantic-settings | 2.x | Configuration |
| PyJWT | 2.x | JWT authentication |
| passlib + bcrypt | — | Password hashing |
| uv | 0.9.x | Package & environment management |
| pytest | 8.x | Testing |
| ruff | 0.15.x | Linting & formatting |

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py                 # Auth & DB dependencies
│   │   └── v1/
│   │       ├── router.py           # v1 router aggregator
│   │       └── endpoints/
│   │           ├── health.py       # GET /api/v1/health
│   │           ├── auth.py         # Register, Login, Refresh, Me
│   │           ├── users.py        # User CRUD (admin + self)
│   │           └── premium.py      # Premium plans, checkout, IPN
│   ├── core/
│   │   ├── config.py               # Pydantic-settings config
│   │   ├── database.py             # Async engine & session
│   │   ├── exceptions.py           # Standardized exceptions
│   │   ├── logging.py              # Logging setup
│   │   └── security.py             # JWT & password hashing
│   ├── models/
│   │   ├── user.py                 # User SQLAlchemy model
│   │   ├── refresh_token.py        # Refresh token model
│   │   └── premium.py              # PremiumPlan, Subscription, PaymentOrder
│   ├── schemas/
│   │   ├── common.py               # Shared schemas
│   │   ├── auth.py                 # Auth request/response
│   │   ├── user.py                 # User request/response
│   │   └── premium.py              # Premium schemas
│   ├── services/
│   │   ├── auth.py                 # Auth business logic
│   │   ├── user.py                 # User business logic
│   │   └── premium.py              # Premium & SePay logic
│   ├── repositories/
│   │   ├── user.py                 # User data access layer
│   │   └── premium.py              # Premium data access layer
│   └── main.py                     # FastAPI app entry point
├── alembic/
│   ├── env.py                      # Async Alembic config
│   ├── script.py.mako              # Migration template
│   └── versions/                   # Migration files
├── tests/
│   ├── conftest.py                 # Test fixtures
│   ├── test_health.py
│   ├── test_auth.py
│   ├── test_users.py
│   └── test_premium.py
├── alembic.ini
├── pyproject.toml
├── .env.example
└── .gitignore
```

## Quick Start

### Prerequisites

- Python 3.12+ (3.13 recommended)
- PostgreSQL 15+
- [uv](https://docs.astral.sh/uv/) installed

### 1. Setup Environment

```bash
cd backend

# Create virtual environment
uv venv --python 3.13

# Install all dependencies (including dev)
uv sync --all-extras
```

### 2. Configure Environment Variables

```bash
# Copy the example and edit with your values
cp .env.example .env

# Edit .env with your database credentials and JWT secrets
# Generate JWT secrets with:
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

**Required environment variables for SePay integration:**

| Variable | Description |
|---|---|
| `SEPAY_MERCHANT_ID` | Your SePay merchant ID (from SePay dashboard) |
| `SEPAY_SECRET_KEY` | Your SePay secret key (for signature + IPN verification) |
| `SEPAY_CHECKOUT_URL` | `https://pay-sandbox.sepay.vn/v1/checkout/init` (sandbox) or production URL |
| `APP_PUBLIC_URL` | Your frontend URL (for success/error/cancel redirects) |

### 3. Database Setup

Make sure PostgreSQL is running, then create the database:

```sql
CREATE USER "IQX" WITH PASSWORD 'your_password';
CREATE DATABASE "IQX" OWNER "IQX";
```

### 4. Run Migrations

```bash
# For a FRESH database (no existing data):
uv run alembic upgrade head

# For a LEGACY database (existing Prisma tables):
# First stamp the initial schema (it already exists), then run remaining migrations:
uv run alembic stamp 000000000001
uv run alembic upgrade head
```

### 5. Run Development Server

```bash
uv run fastapi dev app/main.py
```

The API will be available at:
- **API**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## API Endpoints

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | App + DB health check |

### Authentication
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Register new user | — |
| POST | `/api/v1/auth/login` | Login (returns tokens) | — |
| POST | `/api/v1/auth/refresh` | Refresh token pair | — |
| GET | `/api/v1/auth/me` | Get current user | Bearer |

### Users
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/users/me` | Get own profile | Bearer |
| PATCH | `/api/v1/users/me` | Update own profile | Bearer |
| GET | `/api/v1/users/` | List users (paginated) | Admin |
| POST | `/api/v1/users/` | Create user | Admin |
| GET | `/api/v1/users/{id}` | Get user by ID | Admin |
| PATCH | `/api/v1/users/{id}` | Update user | Admin |
| DELETE | `/api/v1/users/{id}` | Soft-delete user | Admin |

### Premium & Payments
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/premium/plans` | List active premium plans | — |
| GET | `/api/v1/premium/me` | Get my subscription status | Bearer |
| POST | `/api/v1/premium/checkout` | Create SePay checkout form | Bearer |
| POST | `/api/v1/premium/sepay/ipn` | SePay IPN webhook | X-Secret-Key |
| GET | `/api/v1/premium/admin/plans` | List all plans (incl. inactive) | Admin |
| POST | `/api/v1/premium/admin/plans` | Create premium plan | Admin |
| PATCH | `/api/v1/premium/admin/plans/{id}` | Update premium plan | Admin |
| POST | `/api/v1/premium/admin/users/{id}/grant` | Manually grant premium | Admin |

### Query Parameters (List Users)

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page (max 100) |
| `search` | string | — | Search email, name, phone |
| `role` | enum | — | Filter by role |
| `status` | enum | — | Filter by status |
| `sort_by` | string | created_at | Sort field |
| `sort_order` | asc/desc | desc | Sort direction |

## SePay Integration

### How it Works

1. **Checkout**: Frontend calls `POST /api/v1/premium/checkout` with a `plan_id`. The backend returns form fields (including HMAC-SHA256 signature) that the frontend submits directly to SePay via an HTML form POST.

2. **Payment**: User completes payment on SePay's hosted checkout page.

3. **IPN**: SePay sends a POST to `POST /api/v1/premium/sepay/ipn` with payment status. The backend:
   - Validates `X-Secret-Key` header (constant-time comparison)
   - Verifies `notification_type=ORDER_PAID`, `order_status=CAPTURED`, `transaction_status=APPROVED`
   - Validates both order AND transaction currency (VND) and amounts
   - Uses Decimal parsing for amounts (rejects fractional VND)
   - Atomically claims the order (prevents race conditions on concurrent retries)
   - Extends user's premium subscription

4. **Success redirect**: The SePay success URL redirects the user back to the frontend. **Important**: The redirect does NOT activate premium — only the IPN webhook does. The frontend should poll `GET /api/v1/premium/me` to check activation status.

### Subscription Stacking

When a user purchases premium while already having active premium, the new duration is **added to the existing `current_period_end`** (not from `now`). This applies to both IPN-triggered and admin-granted premium.

### SePay IPN Setup

Configure your SePay dashboard to send IPN notifications to:
```
POST https://your-domain.com/api/v1/premium/sepay/ipn
```

Set the `X-Secret-Key` header in SePay's webhook configuration to match your `SEPAY_SECRET_KEY` environment variable.

## Development Commands

```bash
# Install dependencies
uv sync --all-extras

# Run dev server
uv run fastapi dev app/main.py

# Run tests
uv run pytest -v

# Run tests with coverage
uv run pytest --cov=app --cov-report=term-missing

# Lint
uv run ruff check app/ tests/

# Format
uv run ruff format app/ tests/

# Type check
uv run mypy app/ tests/

# Generate migration
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Downgrade migration
uv run alembic downgrade -1
```

## Architecture

The project follows a **layered architecture**:

1. **Endpoints** (`api/`) — HTTP request handling, validation, response serialization
2. **Services** (`services/`) — Business logic, orchestration
3. **Repositories** (`repositories/`) — Data access, queries
4. **Models** (`models/`) — SQLAlchemy ORM models
5. **Schemas** (`schemas/`) — Pydantic request/response models
6. **Core** (`core/`) — Configuration, security, database, exceptions

### Key Design Decisions

- **UUID primary keys** — Safer for distributed systems, no sequential ID enumeration
- **Soft delete** — Users are marked as `deleted` rather than physically removed
- **Role-based access** — `admin` and `user` roles with dependency-based guards
- **Phone validation** — Uses `phonenumbers` library for E.164 format
- **JWT dual-token** — Short-lived access token + long-lived refresh token with rotation
- **Lazy engine init** — Database engine created on first use, not at import time
- **Password requirements** — Minimum 8 chars, uppercase, lowercase, digit, special char
- **Atomic IPN** — Conditional UPDATE prevents double-granting on concurrent SePay retries
- **Decimal amounts** — VND amounts parsed with `Decimal`, fractional amounts rejected

## Migration Strategy

The migration chain supports both fresh and legacy databases:

```
000000000001  →  488c85bb0b6a  →  fb7a64f07299
(initial)        (legacy→new)     (premium tables)
```

- **Fresh DB**: `000000000001` creates `users` + `refresh_tokens`; `488c85bb0b6a` detects fresh schema and skips.
- **Legacy DB**: `000000000001` detects existing `users` table and skips; `488c85bb0b6a` performs the full Prisma→SQLAlchemy transition.

## Notes

- Python version: **3.13.x** (available locally via Homebrew)
- `.env` is git-ignored and must not be committed
- Tests use an in-memory SQLite database for isolation
- Production deployments should use environment variables (not `.env` files)

## Market Data API

Vendor-independent market data API. No runtime dependency on `vnstock`/`vnstock_data`/`vnstock_news` — all data is fetched directly from upstream sources (VCI, VND, MBK, Fmarket, SPL, RSS).

### Endpoints

| Group | Path | Source | Status |
|---|---|---|---|
| Reference | `GET /api/v1/market-data/reference/symbols` | VCI / VND | ✅ |
| Reference | `GET /api/v1/market-data/reference/industries` | VCI | ✅ |
| Reference | `GET /api/v1/market-data/reference/indices` | Static | ✅ |
| Reference | `GET /api/v1/market-data/reference/groups/{group}/symbols` | VCI | ✅ |
| Quotes | `GET /api/v1/market-data/quotes/{symbol}/ohlcv` | VND / VCI | ✅ |
| Quotes | `GET /api/v1/market-data/quotes/{symbol}/intraday` | VCI | ✅ |
| Quotes | `GET /api/v1/market-data/quotes/{symbol}/price-depth` | VCI | ✅ |
| Trading | `POST /api/v1/market-data/trading/price-board` | VCI | ✅ |
| Trading | `GET /api/v1/market-data/trading/{symbol}/foreign-trade` | VCI | ✅ |
| Trading | `GET /api/v1/market-data/trading/{symbol}/insider-deals` | VCI | ✅ |
| Company | `GET /api/v1/market-data/company/{symbol}/overview` | KBS | ✅ |
| Company | `GET /api/v1/market-data/company/{symbol}/shareholders` | KBS | ✅ |
| Company | `GET /api/v1/market-data/company/{symbol}/officers` | KBS | ✅ |
| Company | `GET /api/v1/market-data/company/{symbol}/subsidiaries` | KBS | ✅ |
| Company | `GET /api/v1/market-data/company/{symbol}/news` | KBS | ✅ |
| Fundamentals | `GET /api/v1/market-data/fundamentals/{symbol}/{report}` | VCI | ✅ |
| Insights | `GET /api/v1/market-data/insights/ranking/{kind}` | VND | ✅ |
| Events | `GET /api/v1/market-data/events/calendar` | VCI | ✅ |
| Macro | `GET /api/v1/market-data/macro/economy/{indicator}` | MBK | ✅ |
| Commodities | `GET /api/v1/market-data/macro/commodities` | SPL | ✅ |
| Funds | `GET /api/v1/market-data/funds` | Fmarket | ✅ |
| News | `GET /api/v1/market-data/news/latest` | RSS | ✅ |
| AI News | `GET /api/v1/market-data/news/ai` | AI.VCI | ✅ |
| AI News | `GET /api/v1/market-data/news/ai/detail/{slug}` | AI.VCI | ✅ |
| AI News | `GET /api/v1/market-data/news/ai/catalogs` | AI.VCI | ✅ partial |
| AI News | `GET /api/v1/market-data/news/ai/tickers/{symbol}` | AI.VCI | ✅ partial |
| Overview | `GET /api/v1/market-data/overview/liquidity` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/index-impact` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/foreign` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/foreign/top` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/proprietary` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/proprietary/top` | IQ.VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/allocation` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/sectors/allocation` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/valuation` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/breadth` | IQ.VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/heatmap` | VCI | ✅ |
| Overview | `GET /api/v1/market-data/overview/heatmap/index` | VCI | ✅ |

> **Company data** is sourced from KBS (KB Securities). The `/company/{symbol}/events` endpoint has been removed because neither KBS nor VCI can reliably provide company events data.

### Running Live Tests

```bash
# Unit tests (mocked, no network)
uv run pytest tests/test_market_data.py tests/test_ai_news.py tests/test_market_overview.py -q

# Live smoke tests (hits real upstream APIs)
RUN_MARKET_DATA_LIVE_TESTS=1 uv run pytest tests/test_market_data_live.py tests/test_ai_news.py tests/test_market_overview.py -v
```

### Source Map

See [`docs/market-data-source-map.md`](docs/market-data-source-map.md) for the full endpoint-to-upstream-URL mapping.

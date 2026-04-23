# IQX Backend

FastAPI backend service for the IQX stock market platform.

## Tech Stack

- **Runtime**: Python 3.12
- **Framework**: FastAPI
- **Database**: PostgreSQL + SQLAlchemy 2.x (async)
- **Migrations**: Alembic
- **Auth**: JWT (PyJWT) + bcrypt
- **Payments**: SePay (checkout + IPN)
- **HTTP Client**: httpx (for SePay REST API)
- **Package Manager**: [uv](https://docs.astral.sh/uv/)
- **Linter / Formatter**: Ruff
- **Testing**: pytest + httpx (async)

## Quick Start

### 1. Install dependencies

```bash
uv venv --python 3.12
uv pip install -e ".[dev]"
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET_KEY, and SePay credentials
```

Required environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL async connection string | `postgresql+asyncpg://user:pass@localhost:5432/iqx` |
| `JWT_SECRET_KEY` | Secret key for signing JWT tokens | Random string, ≥32 chars |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | `30` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL | `7` |
| `SEPAY_MERCHANT_ID` | SePay merchant ID from dashboard | |
| `SEPAY_SECRET_KEY` | SePay merchant secret key | |
| `SEPAY_IPN_SECRET` | SePay IPN verification secret | |
| `SEPAY_ENV` | `sandbox` or `production` | `sandbox` |
| `SEPAY_CHECKOUT_URL` | SePay checkout form URL (see note below) | `https://pay-sandbox.sepay.vn/v1/checkout/init` |
| `SEPAY_API_BASE_URL` | SePay REST API base URL | `https://pgapi-sandbox.sepay.vn` |
| `PAYMENT_RETURN_BASE_URL` | Frontend base URL for payment redirects | `http://localhost:3000` |

> **⚠️ SePay Checkout URL Inconsistency**
>
> SePay's official documentation has inconsistencies regarding the sandbox checkout URL:
> - Some pages reference `https://pgapi-sandbox.sepay.vn/v1/checkout/init`
> - The quick start guide and form examples use `https://pay-sandbox.sepay.vn/v1/checkout/init`
>
> This project does **not hardcode** the checkout URL. It is always configured via the
> `SEPAY_CHECKOUT_URL` environment variable. For sandbox, use the `pay-sandbox` variant.
> For production, use `https://pay.sepay.vn/v1/checkout/init`.

### 3. Run migrations

```bash
source .venv/bin/activate
alembic upgrade head
```

### 4. Seed subscription plans

```bash
python -m app.scripts.seed_plans
```

Idempotent — safe to run multiple times. Creates 3 plans: `premium_basic` (99K), `premium_pro` (299K), `premium_elite` (599K).

### 5. Run dev server

```bash
uvicorn app.main:app --reload
```

Server: `http://localhost:8000`
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### 6. Run tests

```bash
pytest -v
```

### 7. Lint & Format

```bash
ruff check app/ tests/        # Check
ruff check --fix app/ tests/   # Auto-fix
ruff format app/ tests/        # Format
```

### 8. Run reconciliation

Syncs pending payment orders with SePay REST API to catch missed IPNs:

```bash
python -m app.scripts.reconcile_orders
```

Safe to run repeatedly (idempotent). Recommended as a cron job (e.g., every 5 minutes):

```bash
# crontab -e
*/5 * * * * cd /path/to/backend && .venv/bin/python -m app.scripts.reconcile_orders >> /var/log/iqx_reconcile.log 2>&1
```

## Payment Flow (SePay One-Time)

```
1. User selects plan → Frontend calls POST /billing/checkout
2. Backend creates PaymentOrder (pending) + billing snapshot
3. Backend generates HMAC-SHA256 signature, returns ordered form_fields
4. Frontend renders hidden HTML form and auto-submits to SePay
5. User pays on SePay's hosted page
6. SePay redirects to callback URL (success/error/cancel) — UX only
7. SePay sends IPN to POST /billing/sepay/ipn — SOURCE OF TRUTH
8. Backend verifies X-Secret-Key, updates order to paid
9. Backend activates/renews user subscription
10. Frontend polls /billing/me/subscription or /auth/me
```

**Important:**
- Callback URLs (`success_url`, `error_url`, `cancel_url`) are for **UX redirect only** — they do NOT confirm payment.
- The IPN endpoint is the **sole source of truth** for payment confirmation.
- Reconciliation script (`reconcile_orders`) serves as a backup to catch missed IPNs.

## Subscription Rules

| Scenario | Behavior |
|----------|----------|
| No active subscription | Create new, period = now → now + 30 days |
| Active sub, **same plan** | Extend `period_end` by 30 days from `max(period_end, now)` |
| Active sub, **different plan** | Expire old sub, create new from now |
| Cancel | Marks order as cancelled; SePay cancel for BANK_TRANSFER/NAPAS |
| Void | For CARD payments only, before settlement cutoff (16:00 daily) |
| Auto-renew | Not implemented — SePay recurring is not production-ready |
| Proration | Not implemented |

## Cancel / Void Logic

Per SePay docs:
- **Cancel order** (`/billing/orders/{id}/cancel`): For `BANK_TRANSFER` and `NAPAS_BANK_TRANSFER` orders. Only when status is `pending` (not yet captured/cancelled).
- **Void transaction**: For `CARD` payments only. Only when `order_status = CAPTURED` and before settlement cutoff. Called via SePay REST API.

## API Endpoints (29 total)

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/health` | Health check (versioned) |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new account |
| POST | `/api/v1/auth/login` | Login (returns JWT pair) |
| GET | `/api/v1/auth/me` | Profile + premium entitlements |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/change-password` | Change password |

### Plans (public)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/plans` | List active, public plans |
| GET | `/api/v1/plans/{plan_id}` | Get plan details |

### Billing (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/billing/checkout` | Create checkout → SePay form data |
| GET | `/api/v1/billing/me/subscription` | Current subscription |
| GET | `/api/v1/billing/me/entitlements` | Premium status + features |
| GET | `/api/v1/billing/me/orders` | Payment order history |
| GET | `/api/v1/billing/me/orders/{id}` | Single order detail |
| POST | `/api/v1/billing/orders/{id}/cancel` | Cancel pending order |
| POST | `/api/v1/billing/orders/{id}/refresh-status` | Sync with SePay |

### SePay Integration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/billing/sepay/callback/success` | UX redirect |
| GET | `/api/v1/billing/sepay/callback/error` | UX redirect |
| GET | `/api/v1/billing/sepay/callback/cancel` | UX redirect |
| POST | `/api/v1/billing/sepay/ipn` | IPN webhook (source of truth) |

### Admin Plans

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/plans` | List all plans |
| POST | `/api/v1/admin/plans` | Create plan |
| GET | `/api/v1/admin/plans/{id}` | Get any plan |
| PATCH | `/api/v1/admin/plans/{id}` | Update plan |

### Admin Billing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/subscriptions` | List all subscriptions |
| GET | `/api/v1/admin/subscriptions/{id}` | Get subscription |
| GET | `/api/v1/admin/payment-orders` | List all payment orders |
| GET | `/api/v1/admin/payment-orders/{id}` | Get payment order |

### Users (admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/users` | List all users |
| GET | `/api/v1/users/{id}` | Get user by ID |
| PATCH | `/api/v1/users/me` | Update own profile (any user) |

## Key Design Decisions

1. **SePay recurring not used** — docs confirm "đang trong giai đoạn hoàn thiện". Monthly subscription is managed at the application layer via one-time payment orders.

2. **Checkout URL is env-configured** — SePay docs have inconsistencies between `pgapi-sandbox` and `pay-sandbox`. Never hardcoded.

3. **`form_fields` is an ordered array** — `[{name, value}, ...]` not a dict, because SePay requires fields in exact order for both signing and form submission.

4. **Billing snapshot on payment order** — `plan_snapshot_code`, `plan_snapshot_name`, `plan_snapshot_price`, `plan_snapshot_duration`, `plan_snapshot_features` are frozen at purchase time. Editing plans later cannot corrupt payment history.

5. **IPN audit log** — `payment_ipn_logs` table stores every incoming IPN raw payload. Immutable, never updated or deleted.

6. **SELECT FOR UPDATE on IPN** — prevents race conditions when concurrent/replayed IPNs hit the same order.

7. **Reconciliation as backup** — `reconcile_orders` script queries SePay REST API for pending orders, catching missed IPNs.

8. **`auth/me` returns premium fields** — `is_premium`, `current_plan`, `subscription_status`, `subscription_expires_at`, `entitlements` are derived from the active subscription at query time (not stored on user record).

9. **Signature field order** — Locked to SePay's PHP `$allowedFields` array order. Changing the order would break signatures. Verified by golden test.

10. **Cancel vs Void separation** — Cancel is for unpaid bank transfer orders. Void is for paid CARD transactions before settlement. Different SePay API endpoints.

## Project Structure

```
backend/
├── alembic/                    # Database migrations
│   └── versions/
├── app/
│   ├── api/v1/
│   │   ├── endpoints/
│   │   │   ├── admin_billing.py    # Admin subscription/order views
│   │   │   ├── admin_plans.py      # Admin plan CRUD
│   │   │   ├── auth.py             # Auth + premium profile
│   │   │   ├── billing.py          # Checkout, IPN, cancel, refresh
│   │   │   ├── health.py           # Health check
│   │   │   ├── plans.py            # Public plan catalog
│   │   │   └── users.py            # User management
│   │   └── router.py
│   ├── core/
│   │   ├── config.py               # Settings (incl. SePay)
│   │   ├── database.py             # Async engine & session
│   │   └── security.py             # JWT + bcrypt
│   ├── dependencies/
│   │   ├── auth.py                 # get_current_user, get_current_admin
│   │   └── premium.py              # require_premium dependency
│   ├── models/
│   │   ├── base.py                 # Base, UUID/Timestamp mixins
│   │   ├── payment_ipn_log.py      # IPN audit log (immutable)
│   │   ├── payment_order.py        # Payment order + billing snapshot
│   │   ├── plan.py                 # Subscription plans
│   │   ├── subscription.py         # User subscriptions
│   │   └── user.py                 # User + subscription relationship
│   ├── schemas/
│   │   ├── auth.py                 # Auth request/response
│   │   ├── billing.py              # Checkout, IPN, entitlements
│   │   ├── error.py                # Error response
│   │   ├── health.py               # Health response
│   │   ├── plan.py                 # Plan CRUD schemas
│   │   └── user.py                 # User + UserMeResponse
│   ├── services/
│   │   ├── auth.py                 # Auth business logic
│   │   ├── billing.py              # Checkout, IPN, reconciliation
│   │   ├── plan.py                 # Plan CRUD
│   │   ├── sepay.py                # Signature, checkout, REST client
│   │   ├── subscription.py         # Subscription lifecycle
│   │   └── user.py                 # User CRUD
│   ├── scripts/
│   │   ├── seed_plans.py           # Idempotent plan seeder
│   │   └── reconcile_orders.py     # SePay reconciliation job
│   └── main.py
├── tests/
│   ├── conftest.py                 # Fixtures & helpers
│   ├── test_auth.py                # 12 auth tests
│   ├── test_billing.py             # 15 billing tests
│   ├── test_health.py              # 2 health tests
│   ├── test_signature.py           # 5 signature tests
│   └── test_users.py               # 6 user tests
├── .env.example
├── pyproject.toml
└── README.md
```

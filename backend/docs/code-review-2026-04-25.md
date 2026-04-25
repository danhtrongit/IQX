# IQX Backend — Code Review Report

**Date:** 2026-04-25
**Project:** IQX Backend (FastAPI + SQLAlchemy + PostgreSQL)
**Reviewed by:** Superpowers Code Reviewer

---

## Summary

| Item | Result |
|------|--------|
| **Ruff Linter** | All checks passed |
| **Mypy Type Check** | 0 issues (59 source files) |
| **Tests** | 250 passed, 47 skipped (37s) |
| **Architecture** | Clean — Router > Service > Repository |

**Total issues found:** CRITICAL: 4 | HIGH: 8 | MEDIUM: 11 | LOW: 8

---

## CRITICAL (Fix immediately)

### C-1: JWT Secret Key uses default dev value

**File:** `.env`

```
JWT_SECRET_KEY=dev-secret-key-change-in-production-abc123xyz789
JWT_REFRESH_SECRET_KEY=dev-refresh-secret-key-change-in-production-xyz789abc123
```

**Problem:** If deployed to production without changing these, any attacker can forge JWT tokens.

**Fix:** Add a startup validator in `config.py`:

```python
@field_validator("JWT_SECRET_KEY")
@classmethod
def reject_default_jwt_secret(cls, v: str) -> str:
    if "change-in-production" in v and os.getenv("APP_ENV") == "production":
        raise ValueError("Must set a secure JWT_SECRET_KEY in production")
    return v
```

---

### C-2: Market Data — 40+ endpoints with no authentication & no rate limiting

**File:** `app/api/v1/endpoints/market_data.py`

```python
# Every endpoint is completely open, no auth:
@router.get("/reference/symbols", ...)
async def list_symbols(exchange: ..., source: ...) -> MarketDataResponse:
```

**Problem:** The server becomes a free open proxy to Vietnamese stock market APIs. Attackers can:

- Scrape market data without limits
- Exhaust upstream rate limits, getting the server IP blocked
- DDoS the server through heavy market data requests

**Fix:** Add rate limiting at minimum:

```python
@router.get("/reference/symbols", ...)
@limiter.limit(get_settings().RATE_LIMIT_MARKET_DATA)
async def list_symbols(request: Request, ...):
```

---

### C-3: `get_price_board` accepts `dict[str, Any]` — bypasses Pydantic validation entirely

**File:** `app/api/v1/endpoints/market_data.py` (line ~242)

```python
@router.post("/trading/price-board", ...)
async def get_price_board(body: dict[str, Any]) -> MarketDataResponse:  # NO VALIDATION
```

**Problem:** Accepts arbitrary JSON payloads. Attackers can send arbitrarily large payloads, nested structures, or inject unexpected keys. Manual `isinstance` check is incomplete.

**Fix:** Create a Pydantic schema:

```python
class PriceBoardRequest(BaseModel):
    symbols: list[str] = Field(..., min_length=1, max_length=50)
    source: str | None = Field(None, pattern=r"^(auto|VCI|VND)$")

    @field_validator("symbols")
    @classmethod
    def validate_symbols(cls, v):
        for s in v:
            if not re.match(r"^[A-Z0-9]{1,10}$", s):
                raise ValueError(f"Invalid symbol: {s}")
        return v
```

---

### C-4: Admin endpoint directly accesses `_repo` private attribute + N+1 query in endpoint layer

**File:** `app/api/v1/endpoints/virtual_trading.py` (line ~270)

```python
async def admin_list_accounts(...):
    svc = VirtualTradingService(db)
    accounts = await svc._repo.list_all_accounts()  # Accessing private member!
    for acct in accounts:
        user_result = await db.execute(select(User).where(User.id == acct.user_id))  # N+1!
```

**Problem:** Bypasses the service layer entirely, accesses private `_repo` attribute, and executes raw SQLAlchemy queries directly in the endpoint handler. Creates an N+1 query problem (one query per account).

**Fix:** Move logic to the service layer with batch user loading:

```python
# In VirtualTradingService:
async def list_all_accounts_with_users(self) -> list[dict]:
    accounts = await self._repo.list_all_accounts()
    user_ids = [a.user_id for a in accounts]
    users_result = await self._session.execute(
        sa_select(User).where(User.id.in_(user_ids))
    )
    users_map = {u.id: u for u in users_result.scalars().all()}
    ...
```

---

## HIGH (Fix soon)

### H-1: Refresh tokens accumulate indefinitely — no cleanup mechanism

**File:** `app/repositories/refresh_token.py`, `app/models/refresh_token.py`

**Problem:** The `RefreshToken` model has `expires_at` and `revoked` fields, but there is no mechanism to clean up expired or revoked tokens. The `refresh_tokens` table will grow unboundedly.

**Fix:**

1. Add a periodic cleanup method:

```python
async def purge_expired_tokens(self) -> int:
    result = await self._session.execute(
        delete(RefreshToken).where(RefreshToken.expires_at < datetime.now(UTC))
    )
    return result.rowcount
```

2. Add a composite index on `(revoked, expires_at)`.

---

### H-2: `get_db` auto-commits on every request — unexpected transaction behavior

**File:** `app/core/database.py` (lines 93-102)

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()    # Auto-commits after EVERY request
        except Exception:
            await session.rollback()
            raise
```

**Problem:**

1. Read-only GET endpoints trigger unnecessary COMMIT commands
2. If any endpoint inadvertently mutates state, it will be silently committed
3. Multiple service calls within a single request are not in an explicit transaction — partial data can be committed if the second call fails
4. **Especially dangerous in `premium.py` IPN handler**: if `_extend_subscription` fails after `claim_pending_order` succeeds, the order is PAID but subscription is never extended

**Fix:** Use explicit transaction management for write operations.

---

### H-3: Account status compared with raw string instead of Enum

**File:** `app/services/virtual_trading/service.py` (line 163)

```python
if account.status != "active":   # String comparison instead of enum
    raise ForbiddenError("Account is suspended")
```

**Fix:**

```python
from app.models.virtual_trading import AccountStatus

if account.status != AccountStatus.ACTIVE:
    raise ForbiddenError("Account is suspended")
```

---

### H-4: Leaderboard N+1 query problem — 200+ DB queries per request

**File:** `app/services/virtual_trading/service.py` (lines 674-677)

```python
for acct in accounts:
    user_result = await self._session.execute(sa_select(User).where(User.id == acct.user_id))
    user = user_result.scalar_one_or_none()
    name = user.full_name if user else "Unknown"
```

**Fix:** Batch query all users in one query:

```python
user_ids = [acct.user_id for acct in accounts]
users_result = await self._session.execute(
    sa_select(User).where(User.id.in_(user_ids))
)
users_map = {u.id: u for u in users_result.scalars().all()}

for acct in accounts:
    user = users_map.get(acct.user_id)
    name = user.full_name if user else "Unknown"
```

---

### H-5: Symbol validation uses global mutable cache — not async-safe

**File:** `app/services/virtual_trading/price_resolver.py` (lines 223-263)

```python
_symbol_cache: set[str] | None = None
_symbol_cache_ts: float = 0.0

async def validate_symbol(symbol: str) -> bool:
    global _symbol_cache, _symbol_cache_ts
    now = time.monotonic()
    if _symbol_cache is not None and (now - _symbol_cache_ts) < _SYMBOL_CACHE_TTL:
        return symbol.upper() in _symbol_cache
    # ... refresh cache ...
```

**Problem:** Two concurrent requests can both see the cache as expired and trigger duplicate upstream calls. Race condition on `_symbol_cache` assignment.

**Fix:** Use `asyncio.Lock`:

```python
_symbol_lock = asyncio.Lock()

async def validate_symbol(symbol: str) -> bool:
    async with _symbol_lock:
        # ... cache check and refresh ...
```

---

### H-6: Inconsistent trading hour boundary check

**File:** `app/services/virtual_trading/price_resolver.py` (lines 103-106)

```python
hm = (now.hour, now.minute)
in_morning = _MORNING_OPEN <= hm < _MORNING_CLOSE      # 09:00 <= t < 11:30
in_afternoon = _AFTERNOON_OPEN <= hm < _AFTERNOON_CLOSE  # 13:00 <= t < 14:45
```

**Problem:** The Vietnam stock exchange ATC session runs 14:30-14:45, and put-through continues to 15:00. Current code excludes 14:45 and everything after. This may result in using stale close prices during the last 15 minutes of actual trading.

**Fix:** Document exact trading sessions and consider extending to `(15, 0)`.

---

### H-7: `_fill_order_at_price` has confusing refund logic

**File:** `app/services/virtual_trading/service.py` (lines 300-307)

```python
if existing_order:
    account.cash_reserved_vnd -= existing_order.reserved_cash_vnd
    diff = total_cost - existing_order.reserved_cash_vnd
    if diff > 0 and account.cash_available_vnd < diff:
        raise BadRequestError("Insufficient cash after price change")
    account.cash_available_vnd -= max(diff, 0)
    if diff < 0:
        account.cash_available_vnd -= diff  # refund (subtracts negative = adds)
```

**Problem:** Logic is technically correct but extremely confusing and error-prone for future maintenance.

**Fix:** Simplify:

```python
if existing_order:
    account.cash_reserved_vnd -= existing_order.reserved_cash_vnd
    diff = total_cost - existing_order.reserved_cash_vnd
    if diff > 0:
        if account.cash_available_vnd < diff:
            raise BadRequestError("Insufficient cash after price change")
        account.cash_available_vnd -= diff
    elif diff < 0:
        account.cash_available_vnd += abs(diff)  # Refund excess
```

---

### H-8: IPN endpoint silently swallows parse errors with 200 OK

**File:** `app/api/v1/endpoints/premium.py` (lines 87-93)

```python
try:
    raw_body = await request.json()
    payload = IPNPayload.model_validate(raw_body)
except Exception:               # Catches ALL exceptions including OOM, SystemExit
    logger.warning("IPN: failed to parse request body")
    return JSONResponse(status_code=200, content={"success": "true", "message": "parse_error"})
```

**Problem:** Returning 200 for parse errors means SePay considers the delivery successful and will NOT retry — potentially causing missed payment activations. The bare `except Exception` also catches `MemoryError`, `SystemExit`, etc.

**Fix:**

```python
except (json.JSONDecodeError, ValidationError) as exc:
    logger.warning("IPN: failed to parse request body: %s", exc)
    return JSONResponse(status_code=400, content={"success": "false", "message": "parse_error"})
```

---

## MEDIUM (Should fix)

### M-1: Duplicate `/me` endpoint across Auth and Users routers

**Files:** `app/api/v1/endpoints/auth.py` (line 71), `app/api/v1/endpoints/users.py` (line 27)

Both files define `GET /me` with identical logic. Remove one — keep `GET /api/v1/auth/me` (standard convention).

---

### M-2: Rate limiting only applied to auth endpoints

**Problem:** Only `register`, `login`, and `refresh` have explicit rate limits. The configured `RATE_LIMIT_DEFAULT` ("60/minute") and `RATE_LIMIT_MARKET_DATA` ("120/minute") in settings are never actually used.

**Fix:** Add rate limiting decorators to market data and user endpoints.

---

### M-3: TTLCache is not thread-safe for async workers

**File:** `app/services/market_data/cache.py` (lines 21-74)

**Problem:** The docstring says "Thread-safe cleanup" but the implementation has no locking. For production with multi-worker setups, consider Redis as the cache backend.

---

### M-4: `date.today()` used without timezone awareness — wrong trading date possible

**File:** `app/services/virtual_trading/service.py` (lines 157, 474)

```python
today = date.today()  # Uses server local time, NOT Vietnam time
```

**Fix:**

```python
from datetime import timezone, timedelta
_VN_TZ = timezone(timedelta(hours=7))

today = datetime.now(_VN_TZ).date()
```

---

### M-5: User search ILIKE with unescaped wildcards

**File:** `app/repositories/user.py` (lines 43-52)

```python
search_term = f"%{params.search}%"
```

**Problem:** Searching for `%` returns ALL users.

**Fix:**

```python
import re
def escape_like(s: str) -> str:
    return re.sub(r"([%_\\])", r"\\\1", s)

search_term = f"%{escape_like(params.search)}%"
```

---

### M-6: `admin_grant_premium` creates PENDING order then immediately marks PAID

**File:** `app/services/premium.py` (lines 372-393)

**Problem:** Two-step process that could leave orphaned PENDING orders if the second step fails. An IPN could theoretically try to claim a grant order with `amount=0`.

**Fix:** Create the order directly as PAID.

---

### M-7: `update_plan` silently skips `None` values — cannot clear optional fields

**File:** `app/services/premium.py` (lines 97-105)

```python
update_data = {k: v for k, v in data.items() if v is not None}  # Filters out None
```

**Fix:** Use `exclude_unset=True` pattern from Pydantic instead of filtering None.

---

### M-8: Sell position quantity can go negative without guard

**File:** `app/services/virtual_trading/service.py` (lines 360-361)

```python
if position:
    position.quantity_total -= quantity  # No check for negative!
```

**Fix:**

```python
new_total = position.quantity_total - quantity
if new_total < 0:
    raise BadRequestError(f"Position integrity error: would go to {new_total} shares")
position.quantity_total = new_total
```

---

### M-9: No input sanitization on `slug` and `news_id` path parameters

**File:** `app/api/v1/endpoints/market_data.py` (lines 1092-1133)

**Fix:**

```python
slug: str = Path(..., pattern=r"^[a-zA-Z0-9_-]{1,200}$")
news_id: str = Path(..., pattern=r"^[a-zA-Z0-9_-]{1,100}$")
```

---

### M-10: `VirtualTrade` model missing `TimestampMixin`

**File:** `app/models/virtual_trading.py` (line 209)

**Fix:**

```python
class VirtualTrade(UUIDMixin, TimestampMixin, Base):
```

---

### M-11: Overview endpoints return raw `dict` instead of `MarketDataResponse`

**File:** `app/api/v1/endpoints/market_data.py` (lines 693-1004)

**Problem:** All `overview/*` endpoints return `dict[str, Any]` instead of structured `MarketDataResponse`. No response validation, inconsistent API shape, no OpenAPI docs.

**Fix:** Use `MarketDataResponse` consistently.

---

## LOW (Can improve)

### L-1: Standard library imports inside function bodies

**Files:** `app/api/v1/endpoints/market_data.py` (lines 1019, 1222)

Move `import re` and `import json` to top of file.

---

### L-2: Dead code — `sort_column` fallback never reached

**File:** `app/repositories/user.py` (lines 62-65)

`params.sort_by` is typed as `Literal[...]` so the fallback to `User.created_at` is dead code. Remove or add a comment explaining it's a safety net.

---

### L-3: `get_settings()` called at module import time

**Files:** `app/api/v1/endpoints/auth.py` (line 18), `app/core/rate_limit.py` (line 14)

Cannot be overridden in tests without clearing `@lru_cache`. Document this behavior.

---

### L-4: `phone_number` empty string vs `None` inconsistent behavior

**File:** `app/schemas/user.py` (lines 55-83)

Sending `""` vs `None` produces different behavior. Standardize.

---

### L-5: `json` import in `virtual_trading.py` — used in endpoint instead of service layer

**File:** `app/api/v1/endpoints/virtual_trading.py` (line 10)

`json.loads` called in endpoint handlers instead of service/schema layer.

---

### L-6: `TTLCache.size` includes expired entries

**File:** `app/services/market_data/cache.py` (lines 66-68)

Cache can appear full when most entries are expired.

---

### L-7: Health check returns 200 when database is down

**File:** `app/api/v1/endpoints/health.py` (lines 23-40)

**Fix:** Return 503 when database is unhealthy for load balancer compatibility.

---

### L-8: Missing security middleware

Missing request body size limits, security headers (HSTS, X-Content-Type-Options), and CSRF protection documentation.

---

## Strengths

1. **Clean layered architecture** — Router > Service > Repository separation is consistent
2. **Full async throughout** — From endpoints to database with `asyncpg`
3. **Refresh token rotation** — Proper replay detection via token family
4. **Multi-source fallback** — Market data sources auto-fallback when primary fails
5. **Config snapshot for orders** — Virtual trading orders snapshot fee/tax config at creation time
6. **Financial precision** — Monetary values stored as integer VND (no float), rates as basis points
7. **Idempotent IPN** — Atomic `claim_pending_order` prevents race conditions
8. **Good type safety** — Pydantic v2, `Annotated`, `StrEnum`, `Literal` types

---

## Recommendations — Priority Order

| Priority | Action |
|----------|--------|
| **P0** | Add rate limiting + auth for market data endpoints |
| **P0** | Validate JWT secret is not the default value in production |
| **P0** | Create Pydantic schema for `price-board` endpoint |
| **P1** | Fix N+1 queries (leaderboard, admin accounts) |
| **P1** | Add expired token cleanup job |
| **P1** | Fix IPN error handling — return 400 instead of 200 for parse errors |
| **P2** | Use Vietnam timezone for trading date |
| **P2** | Escape ILIKE wildcards in user search |
| **P2** | Health check should return 503 when DB unhealthy |
| **P3** | Add Dockerfile + CI pipeline |
| **P3** | Switch to Redis for cache + rate limiting (multi-worker) |
| **P3** | Structured JSON logging for production |

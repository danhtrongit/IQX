# Claude Opus issue draft: Backend hardening follow-up

Date verified: 2026-04-25
Repo area: `backend/`
Verification run:

- `uv run ruff check .` -> passed
- `uv run mypy app` -> passed, 59 source files
- `uv run pytest` -> 250 passed, 47 skipped

## Context

The backend is healthy at the current test/lint/type level, but several production hardening findings from the code review are still present in the current code. This issue consolidates the remaining work into scoped acceptance criteria.

GitHub issue creation was not possible from the local environment because `gh auth status` reports no logged-in GitHub host. Use this file as the issue body if creating the remote issue manually.

## P0: production security and public upstream protection

### 1. Reject unsafe JWT secrets in production

Current state:

- `backend/.env` still uses development-looking JWT secrets containing `change-in-production`.
- `backend/app/core/config.py` has no validator for `JWT_SECRET_KEY` or `JWT_REFRESH_SECRET_KEY`.

Acceptance criteria:

- Add Pydantic validators in `Settings` that reject placeholder/default JWT access and refresh secrets when `APP_ENV=production`.
- Validate both access and refresh secrets, not only `JWT_SECRET_KEY`.
- Add tests that set `APP_ENV=production` and assert startup/settings load fails for placeholder secrets.
- Keep development/test fixtures working.

### 2. Protect market-data routes from open proxy abuse

Current state:

- `backend/app/api/v1/endpoints/market_data.py` imports no auth dependency and no limiter.
- Market-data routes call upstream VCI/VND/KBS/MBK/Fmarket/SPL/AI endpoints directly.
- `RATE_LIMIT_MARKET_DATA` exists, but only auth routes currently use explicit `@limiter.limit(...)` decorators.
- `SlowAPIMiddleware` is not installed, so undecorated routes are not protected by the configured default limit.

Acceptance criteria:

- Apply explicit market-data rate limiting with `RATE_LIMIT_MARKET_DATA` to all market-data endpoints, or install and test global SlowAPI middleware if the project chooses global limits.
- Add `request: Request` to limited endpoints as required by SlowAPI.
- Decide the auth policy for market data. At minimum, protect expensive/upstream-heavy endpoints with authentication or API-key style access. If some endpoints must stay public, document that decision and keep them explicitly rate-limited.
- Add tests proving repeated market-data requests are limited when not in `APP_ENV=testing`.

### 3. Replace raw `dict[str, Any]` body for price-board

Current state:

- `get_price_board()` in `backend/app/api/v1/endpoints/market_data.py` accepts `body: dict[str, Any]`.
- Only `symbols` presence and length are manually checked; symbol contents and `source` are not schema-validated.

Acceptance criteria:

- Add a Pydantic request model for `POST /api/v1/market-data/trading/price-board`.
- Enforce `symbols` min length 1, max length 50.
- Enforce each symbol matches `^[A-Z0-9]{1,10}$`, normalize to uppercase, and reject non-string/nested payloads.
- If `source` is retained, validate it as `auto`, `VCI`, or `VND` and wire it deliberately.
- Add 422 tests for invalid symbol, too many symbols, nested/non-string symbols, and invalid source.

### 4. Fix IPN parse error handling

Current state:

- `backend/app/api/v1/endpoints/premium.py` catches `Exception` around `request.json()` and `IPNPayload.model_validate(...)`.
- It returns HTTP 200 with `parse_error`, which tells SePay the delivery succeeded.

Acceptance criteria:

- Catch narrow parse/validation exceptions only.
- Return HTTP 400 for malformed JSON or invalid payload shape.
- Log the parse/validation error without leaking sensitive payload details.
- Add tests for invalid JSON and invalid IPN payload shape.

## P1: database correctness, transaction boundaries, and query hot paths

### 5. Remove endpoint-layer repository access and N+1 in admin account listing

Current state:

- `backend/app/api/v1/endpoints/virtual_trading.py` accesses `svc._repo.list_all_accounts()`.
- It performs one `select(User)` per account in the endpoint handler.

Acceptance criteria:

- Move account-with-user listing into `VirtualTradingService` and/or repository methods.
- Batch-load users by `user_id`.
- Endpoint should call a public service method only.
- Add a test that covers multiple accounts and verifies response user fields.

### 6. Reduce leaderboard N+1 queries

Current state:

- `VirtualTradingService.get_leaderboard()` lists positions once per account and loads users once per account.
- Price resolution is already batched by unique symbol, but DB reads are still account-by-account.

Acceptance criteria:

- Batch-load users for all evaluated accounts.
- Batch-load positions for all evaluated accounts or add a repository method that returns positions grouped by account.
- Keep the existing hard cap and unique-symbol price resolution behavior.
- Add regression tests for multiple accounts. Prefer a query-count assertion if practical.

### 7. Make DB transaction ownership explicit

Current state:

- `backend/app/core/database.py:get_db()` commits after every request, including read-only requests.
- This makes writes implicit and makes endpoint/service transaction boundaries hard to reason about.

Acceptance criteria:

- Adopt an explicit transaction pattern for write operations.
- Avoid committing read-only requests.
- Ensure multi-step writes such as premium IPN claim + subscription extension are atomic.
- Add tests for rollback behavior when the second step of a multi-step write fails.

Note: the original review's exact claim that an exception after `claim_pending_order()` leaves the order paid is not accurate under the current `get_db()` dependency, because an unhandled exception rolls the session back. The broader transaction-ownership issue remains valid.

### 8. Add refresh-token cleanup

Current state:

- `RefreshToken` has `expires_at` and `revoked`.
- There is no purge method, job, command, or index for cleanup.

Acceptance criteria:

- Add a repository/service method to delete expired tokens and optionally old revoked tokens.
- Add a composite index useful for cleanup, e.g. `(revoked, expires_at)` or the exact query shape chosen.
- Wire cleanup into an operational path: scheduled job, admin maintenance endpoint, or documented management command.
- Add tests for deletion count and retained active tokens.

## P2: virtual-trading correctness and market-calendar handling

### 9. Use enum comparison for account status

Current state:

- `VirtualTradingService.place_order()` compares `account.status != "active"`.

Acceptance criteria:

- Compare against `AccountStatus.ACTIVE`.
- Add or update a test for suspended accounts.

### 10. Make trading date timezone-aware

Current state:

- `VirtualTradingService.place_order()` and `refresh()` use `date.today()`.
- This depends on server-local timezone instead of Vietnam market time.

Acceptance criteria:

- Use Vietnam timezone date, e.g. `datetime.now(_VN_TZ).date()`.
- Keep settlement/trading-date tests deterministic.
- Add tests that would fail when server local date differs from Vietnam date.

### 11. Revisit trading session boundary

Current state:

- `price_resolver.is_trading_session()` models 09:00-11:30 and 13:00-14:45 with the 14:45 endpoint excluded.

Acceptance criteria:

- Document the exact market sessions this app supports.
- Use an official source when updating the session table. HOSE's trading-hours document lists opening auction 09:00-09:15, continuous matching 09:15-11:30 and 13:00-14:30, closing auction 14:30-14:45, and put-through until 15:00: https://staticfile.hsx.vn/Uploads/UploadDocuments/2372209/2.Trading%20hours.pdf
- Decide whether virtual trading should use only order-matching sessions or also put-through windows.
- Add boundary tests for 09:00, 09:15, 14:30, 14:45, and 15:00.

### 12. Add sell position integrity guard

Current state:

- `_fill_order_at_price()` subtracts sell quantity from `position.quantity_total` without a negative guard.

Acceptance criteria:

- Guard against `quantity_total` becoming negative.
- Return a clear application error if the invariant is violated.
- Add a test using corrupted/prepared data to prove the guard works.

### 13. Simplify pending buy refund logic

Current state:

- `_fill_order_at_price()` refunds excess reserved cash by subtracting a negative diff.

Acceptance criteria:

- Rewrite the branch to explicit debit/refund cases.
- Preserve current behavior with tests for both price-up and price-down fills.

## P2: API validation and response consistency

### 14. Escape wildcards in user search

Current state:

- `backend/app/repositories/user.py` builds `search_term = f"%{params.search}%"`.
- `%` and `_` in user input are treated as SQL LIKE wildcards.

Acceptance criteria:

- Escape `%`, `_`, and backslash in user search input.
- Use SQLAlchemy `ilike(..., escape="\\")` or an equivalent safe pattern.
- Add tests for searching literal `%` and `_`.

### 15. Validate AI news path parameters

Current state:

- `slug` and `news_id` path parameters in `backend/app/api/v1/endpoints/market_data.py` are unconstrained strings.

Acceptance criteria:

- Add `Path(..., pattern=...)` validation for `slug` and `news_id`.
- Include length bounds.
- Add 422 tests for invalid characters and excessive length.

### 16. Normalize market-data response models

Current state:

- Overview routes return raw `dict[str, Any]` and do not declare `response_model=MarketDataResponse`.
- AI news routes also return raw dictionaries.

Acceptance criteria:

- Either return `MarketDataResponse` consistently or introduce explicit response schemas for overview/AI-news routes.
- Keep OpenAPI docs accurate.
- Add response validation tests for at least one overview route and one AI-news route.

### 17. Health check should be load-balancer friendly

Current state:

- `/health` returns response status 200 even when DB connectivity fails and the body reports `status="degraded"`.

Acceptance criteria:

- Return HTTP 503 when database connectivity is unhealthy.
- Keep a body that includes app/version/environment/timestamp.
- Add a test that forces `db.execute()` failure and expects 503.

### 18. Allow clearing nullable premium plan fields

Current state:

- `PremiumService.update_plan()` filters out `None` values after the endpoint already used `exclude_unset=True`.
- This prevents clearing nullable fields such as `description`.

Acceptance criteria:

- Preserve `None` when the client explicitly sends it for nullable fields.
- Add tests for clearing `description` while leaving omitted fields unchanged.

## P3: model/cache/security hygiene

### 19. Add timestamps to `VirtualTrade`

Current state:

- `VirtualTrade` does not use `TimestampMixin`.
- The migration for `virtual_trades` also lacks `created_at` and `updated_at`.

Acceptance criteria:

- Add `TimestampMixin` to `VirtualTrade`.
- Add an Alembic migration for existing databases.
- Decide whether `traded_at` remains the business event timestamp distinct from row timestamps.

### 20. Make symbol and TTL caches concurrency-safe

Current state:

- `price_resolver.validate_symbol()` uses a module-level mutable cache without an async lock.
- `TTLCache` mutates an `OrderedDict` without locking and `size` includes expired entries.

Acceptance criteria:

- Add an `asyncio.Lock` or equivalent guard around symbol-cache refresh.
- Make `TTLCache` locking/thread-safety claims accurate: either add locking or remove the claim and document single-process semantics.
- Make `TTLCache.size` account for expired entries or rename/document it explicitly.
- Add concurrency/expiry tests.

### 21. Add app-level security middleware or deployment documentation

Current state:

- No request body size limit middleware is present.
- No security headers middleware is present.
- CSRF posture is not documented.

Acceptance criteria:

- Add security headers appropriate for an API deployment, or document that a reverse proxy owns them.
- Add request body size limits in app or proxy documentation.
- Document CSRF posture for bearer-token API usage.

### 22. Clean generated Playwright MCP artifacts from tracked files

Current state:

- `backend/.playwright-mcp/` files are tracked in git.
- These are generated inspection logs/responses and should not normally live in source control.

Acceptance criteria:

- Remove generated `.playwright-mcp` artifacts from git if they are not intentionally documented fixtures.
- Add `backend/.playwright-mcp/` to `.gitignore`.
- If any file is an intentional fixture, move it to a named test fixture directory with a short README explaining its use.

## Items reviewed but not elevated as blocking

- Duplicate `GET /auth/me` and `GET /users/me`: this is redundant, but both routes are authenticated and currently harmless. Fix only if the API contract should be simplified.
- `admin_grant_premium()` creates a pending order and immediately marks it paid. This can be simplified, but the specific concern that an IPN can claim a zero-amount grant was not reproduced from the current code path: zero/invalid amounts are rejected before the atomic claim, and unhandled exceptions roll back before the dependency commit.
- `get_settings()` at module import time is a testability caveat. Existing tests already clear the settings cache where needed.
- Standard-library imports inside function bodies and dead fallback sort code are cleanup tasks, not production blockers.

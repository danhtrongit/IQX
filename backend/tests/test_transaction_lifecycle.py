"""Tests for transaction lifecycle, atomic token rotation, and atomic subscription extend.

These tests verify that:
- P0: Data written via flush() in repositories is committed by get_db.
- P1: Refresh token rotation is atomic (concurrent replay is detected).
- P1: Subscription extension is atomic (no lost time from concurrency).
- P2: production_client fixture exercises real commit/rollback lifecycle.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole, UserStatus
from app.repositories.premium import PremiumSubscriptionRepository
from app.repositories.refresh_token import RefreshTokenRepository
from tests.conftest import get_auth_headers

# ── Helpers ──────────────────────────────────────────


async def _seed_user(session: AsyncSession) -> User:
    """Create a test user directly in the database."""
    user = User(
        email=f"txn_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("Test@1234"),
        first_name="Txn",
        last_name="User",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def _seed_plan(session: AsyncSession, duration_days: int = 30) -> PremiumPlan:
    plan = PremiumPlan(
        code=f"plan_{uuid.uuid4().hex[:8]}",
        name="Test Plan",
        price_vnd=99000,
        duration_days=duration_days,
        is_active=True,
    )
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


def _user_token(user: User) -> str:
    return create_access_token(subject=user.id, extra_claims={"role": user.role.value})


# ══════════════════════════════════════════════════════
# P0 — get_db commits after flush()
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_production_register_persists_data(
    production_client: AsyncClient,
    fresh_session: AsyncSession,
):
    """P0: User created via endpoint (which uses flush()) must survive
    the full commit cycle and be readable from a fresh session.
    """
    resp = await production_client.post(
        "/api/v1/auth/register",
        json={
            "email": "persist_test@example.com",
            "password": "Str0ng@Pass",
            "first_name": "Persist",
            "last_name": "Test",
        },
    )
    assert resp.status_code == 201
    user_id = resp.json()["id"]

    # Read back from a completely independent session
    result = await fresh_session.execute(
        select(User).where(User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    assert user is not None, "Data written via flush() was NOT committed — P0 bug"
    assert user.email == "persist_test@example.com"


@pytest.mark.asyncio
async def test_production_login_persists_refresh_token(
    production_client: AsyncClient,
    fresh_session: AsyncSession,
    db_session: AsyncSession,
):
    """P0: Login creates a refresh token via flush(). It must be persisted."""
    # Seed user
    user = await _seed_user(db_session)

    resp = await production_client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Test@1234"},
    )
    assert resp.status_code == 200

    # Verify refresh token was persisted
    result = await fresh_session.execute(
        select(RefreshToken).where(RefreshToken.user_id == user.id)
    )
    tokens = result.scalars().all()
    assert len(tokens) >= 1, "Refresh token was NOT committed after flush() — P0 bug"


# ══════════════════════════════════════════════════════
# P1 — Atomic refresh token claim
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_atomic_claim_for_rotation_unit(db_session: AsyncSession):
    """P1 unit test: claim_for_rotation returns 1 on first call, 0 on second."""
    user = await _seed_user(db_session)
    repo = RefreshTokenRepository(db_session)

    token_family = str(uuid.uuid4())
    jti = str(uuid.uuid4())

    rt = RefreshToken(
        user_id=user.id,
        jti=jti,
        token_family=token_family,
        expires_at=datetime.now(UTC) + timedelta(days=7),
        revoked=False,
        created_at=datetime.now(UTC),
    )
    await repo.create(rt)
    await db_session.commit()

    # First claim succeeds
    rows = await repo.claim_for_rotation(jti)
    assert rows == 1

    # Second claim fails (already revoked)
    rows = await repo.claim_for_rotation(jti)
    assert rows == 0


@pytest.mark.asyncio
async def test_refresh_token_replay_detected_via_endpoint(
    production_client: AsyncClient,
    db_session: AsyncSession,
):
    """P1 integration: Using the same refresh token twice must fail on the second attempt."""
    user = await _seed_user(db_session)

    # Login
    login_resp = await production_client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Test@1234"},
    )
    assert login_resp.status_code == 200
    old_refresh = login_resp.json()["refresh_token"]

    # First refresh succeeds
    resp1 = await production_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
    )
    assert resp1.status_code == 200

    # Replay of old token must fail
    resp2 = await production_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
    )
    assert resp2.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_family_mismatch_revokes_family(
    db_session: AsyncSession,
):
    """P1 unit: If JWT family doesn't match DB family, the DB family is revoked."""
    from app.services.auth import AuthService

    user = await _seed_user(db_session)
    service = AuthService(db_session)
    repo = RefreshTokenRepository(db_session)

    # Create a token with family_B in JWT payload
    db_family = "family_A"
    refresh_token_str, _ = create_refresh_token(
        subject=user.id,
        token_family="family_B",  # JWT payload has different family
    )

    # But store it in DB with family_A
    from app.core.security import decode_refresh_token

    payload = decode_refresh_token(refresh_token_str)
    jti = payload["jti"]

    rt = RefreshToken(
        user_id=user.id,
        jti=jti,
        token_family=db_family,
        expires_at=datetime.now(UTC) + timedelta(days=7),
        revoked=False,
        created_at=datetime.now(UTC),
    )
    await repo.create(rt)
    await db_session.commit()

    # Attempt refresh — should fail because family doesn't match
    from app.core.exceptions import UnauthorizedError

    with pytest.raises(UnauthorizedError, match="family không khớp"):
        await service.refresh_tokens(refresh_token_str)


# ══════════════════════════════════════════════════════
# P1 — Atomic subscription extension
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_atomic_extend_period_unit(db_session: AsyncSession):
    """P1 unit: atomic_extend_period updates at SQL level without read-then-write."""
    user = await _seed_user(db_session)
    plan = await _seed_plan(db_session, duration_days=30)
    repo = PremiumSubscriptionRepository(db_session)

    # Create initial subscription
    now = datetime.now(UTC)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )
    await repo.create(sub)
    await db_session.commit()

    original_end = sub.current_period_end
    if original_end.tzinfo is None:
        original_end = original_end.replace(tzinfo=UTC)

    # Atomic extend
    rows = await repo.atomic_extend_period(
        user_id=user.id,
        plan_id=plan.id,
        duration_days=30,
        now=now,
    )
    assert rows == 1

    # Read back
    await db_session.commit()
    updated = await repo.get_by_user_id(user.id)
    assert updated is not None
    updated_end = updated.current_period_end
    if updated_end.tzinfo is None:
        updated_end = updated_end.replace(tzinfo=UTC)

    expected_end = original_end + timedelta(days=30)
    assert abs((updated_end - expected_end).total_seconds()) < 5


@pytest.mark.asyncio
async def test_atomic_extend_period_expired_resets_from_now(db_session: AsyncSession):
    """P1 unit: If subscription is expired, atomic extend starts from now."""
    user = await _seed_user(db_session)
    plan = await _seed_plan(db_session, duration_days=30)
    repo = PremiumSubscriptionRepository(db_session)

    # Create an expired subscription
    past = datetime.now(UTC) - timedelta(days=60)
    sub = PremiumSubscription(
        user_id=user.id,
        current_plan_id=plan.id,
        current_period_start=past,
        current_period_end=past + timedelta(days=30),  # expired 30 days ago
        status=SubscriptionStatus.EXPIRED,
    )
    await repo.create(sub)
    await db_session.commit()

    now = datetime.now(UTC)
    rows = await repo.atomic_extend_period(
        user_id=user.id,
        plan_id=plan.id,
        duration_days=30,
        now=now,
    )
    assert rows == 1

    await db_session.commit()
    updated = await repo.get_by_user_id(user.id)
    assert updated is not None
    updated_end = updated.current_period_end
    if updated_end.tzinfo is None:
        updated_end = updated_end.replace(tzinfo=UTC)

    expected_end = now + timedelta(days=30)
    assert abs((updated_end - expected_end).total_seconds()) < 5


@pytest.mark.asyncio
async def test_atomic_extend_no_subscription_returns_zero(db_session: AsyncSession):
    """P1 unit: atomic_extend_period returns 0 when no subscription exists."""
    user = await _seed_user(db_session)
    plan = await _seed_plan(db_session)
    repo = PremiumSubscriptionRepository(db_session)

    rows = await repo.atomic_extend_period(
        user_id=user.id,
        plan_id=plan.id,
        duration_days=30,
        now=datetime.now(UTC),
    )
    assert rows == 0


@pytest.mark.asyncio
async def test_extend_subscription_creates_new_via_endpoint(
    production_client: AsyncClient,
    db_session: AsyncSession,
    fresh_session: AsyncSession,
):
    """P1 integration: _extend_subscription creates new subscription for first-time user."""
    user = await _seed_user(db_session)
    plan = await _seed_plan(db_session, duration_days=30)

    # Create a pending order
    order = PremiumPaymentOrder(
        invoice_number=f"IQX_{uuid.uuid4().hex[:12].upper()}",
        user_id=user.id,
        plan_id=plan.id,
        amount_vnd=99000,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db_session.add(order)
    await db_session.commit()

    # Send valid IPN
    ipn_body = {
        "notification_type": "ORDER_PAID",
        "order": {
            "order_status": "CAPTURED",
            "order_currency": "VND",
            "order_amount": "99000",
            "order_invoice_number": order.invoice_number,
        },
        "transaction": {
            "transaction_id": f"txn_{uuid.uuid4().hex[:8]}",
            "transaction_status": "APPROVED",
            "transaction_currency": "VND",
            "transaction_amount": "99000",
        },
    }

    resp = await production_client.post(
        "/api/v1/premium/sepay/ipn",
        json=ipn_body,
        headers={"X-Secret-Key": "test-sepay-secret-key"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "processed"

    # Verify subscription from fresh session
    result = await fresh_session.execute(
        select(PremiumSubscription).where(PremiumSubscription.user_id == user.id)
    )
    sub = result.scalar_one_or_none()
    assert sub is not None, "Subscription was NOT persisted after IPN — P1/P0 bug"
    assert sub.status == SubscriptionStatus.ACTIVE


# ══════════════════════════════════════════════════════
# P2 — Production fixture proves commit lifecycle
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_production_client_rollback_on_error(
    production_client: AsyncClient,
    fresh_session: AsyncSession,
):
    """P2: An endpoint that raises should rollback — no partial data committed."""
    # Register a user
    resp1 = await production_client.post(
        "/api/v1/auth/register",
        json={
            "email": "rollback_test@example.com",
            "password": "Str0ng@Pass",
            "first_name": "R",
            "last_name": "T",
        },
    )
    assert resp1.status_code == 201

    # Duplicate registration should fail with 409
    resp2 = await production_client.post(
        "/api/v1/auth/register",
        json={
            "email": "rollback_test@example.com",
            "password": "Str0ng@Pass",
            "first_name": "R",
            "last_name": "T",
        },
    )
    assert resp2.status_code == 409

    # Only one user should exist with this email
    result = await fresh_session.execute(
        select(User).where(User.email == "rollback_test@example.com")
    )
    users = result.scalars().all()
    assert len(users) == 1


@pytest.mark.asyncio
async def test_production_client_login_refresh_full_lifecycle(
    production_client: AsyncClient,
    db_session: AsyncSession,
    fresh_session: AsyncSession,
):
    """P0+P2: Full login -> refresh -> logout lifecycle with production commit."""
    user = await _seed_user(db_session)

    # Login
    login_resp = await production_client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "Test@1234"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    refresh_token = tokens["refresh_token"]

    # Refresh
    refresh_resp = await production_client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200
    new_access = refresh_resp.json()["access_token"]

    # Access /auth/me with the new access token
    me_resp = await production_client.get(
        "/api/v1/auth/me",
        headers=get_auth_headers(new_access),
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == user.email

    # Verify tokens in DB from fresh session
    result = await fresh_session.execute(
        select(RefreshToken).where(RefreshToken.user_id == user.id)
    )
    all_tokens = result.scalars().all()
    assert len(all_tokens) >= 2  # original + rotated
    revoked_count = sum(1 for t in all_tokens if t.revoked)
    assert revoked_count >= 1  # original should be revoked


# ══════════════════════════════════════════════════════
# SQLite concurrency limitation note
# ══════════════════════════════════════════════════════
#
# SQLite uses database-level locking (not row-level), so true concurrent
# write tests (e.g. two tasks racing on the same row) are not reliably
# reproducible. The atomic primitives (claim_for_rotation, atomic_extend_period)
# are tested above via sequential calls that prove the conditional UPDATE
# semantics. On PostgreSQL in production, row-level locks (FOR UPDATE) and
# MVCC provide real concurrent safety.

"""Tests for admin IPN log endpoints (T23)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.ipn_log import SePayIPNLog
from app.models.premium import PaymentOrderStatus, PremiumPaymentOrder, PremiumPlan
from app.models.user import User, UserRole, UserStatus

pytestmark = pytest.mark.asyncio


# ── helpers ──────────────────────────────────────────────────────────────────


async def _admin_headers(db: AsyncSession) -> dict[str, str]:
    user = User(
        email=f"adm-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Adm@1234"),
        first_name="Adm",
        last_name="In",
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(subject=user.id, extra_claims={"role": user.role.value})
    return {"Authorization": f"Bearer {token}"}


async def _seed_ipn_log(
    db: AsyncSession,
    *,
    secret_key_valid: bool = True,
    result_status: str | None = "processed",
    sepay_transaction_id: str | None = None,
    raw_body: dict | None = None,
) -> SePayIPNLog:
    log = SePayIPNLog(
        received_at=datetime.now(UTC),
        secret_key_valid=secret_key_valid,
        result_status=result_status,
        sepay_transaction_id=sepay_transaction_id or f"TXN-{uuid.uuid4().hex[:8]}",
        raw_body=raw_body,
        raw_headers={"x-secret-key": "***"},
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


# ── tests ─────────────────────────────────────────────────────────────────────


async def test_list_ipn_logs_empty(client: AsyncClient, db_session: AsyncSession):
    """GET /admin/ipn returns empty list when no logs."""
    headers = await _admin_headers(db_session)
    resp = await client.get("/api/v1/admin/ipn", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0


async def test_list_ipn_logs_returns_data(client: AsyncClient, db_session: AsyncSession):
    """GET /admin/ipn returns logs with basic fields (no raw_body in list)."""
    headers = await _admin_headers(db_session)
    log = await _seed_ipn_log(db_session, result_status="processed", raw_body={"key": "value"})

    resp = await client.get("/api/v1/admin/ipn", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert str(log.id) == item["id"]
    assert item["secret_key_valid"] is True
    assert item["result_status"] == "processed"
    # raw_body should NOT appear in list response
    assert "raw_body" not in item or item["raw_body"] is None


async def test_list_ipn_filter_secret_valid(client: AsyncClient, db_session: AsyncSession):
    """Filter by secret_key_valid works correctly."""
    headers = await _admin_headers(db_session)
    await _seed_ipn_log(db_session, secret_key_valid=True, result_status="processed")
    await _seed_ipn_log(db_session, secret_key_valid=False, result_status="secret_invalid")

    resp = await client.get("/api/v1/admin/ipn?secret_key_valid=true", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1

    resp = await client.get("/api/v1/admin/ipn?secret_key_valid=false", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


async def test_get_ipn_log_detail_includes_raw(client: AsyncClient, db_session: AsyncSession):
    """GET /admin/ipn/{id} includes raw_body and raw_headers."""
    headers = await _admin_headers(db_session)
    raw = {"notification_type": "ORDER_PAID", "order": {"order_invoice_number": "IQX-001"}}
    log = await _seed_ipn_log(db_session, result_status="order_not_found", raw_body=raw)

    resp = await client.get(f"/api/v1/admin/ipn/{log.id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(log.id)
    assert body["raw_body"] == raw
    assert body["raw_headers"] == {"x-secret-key": "***"}


async def test_retry_ipn_rejects_invalid_secret(client: AsyncClient, db_session: AsyncSession):
    """POST /admin/ipn/{id}/retry returns 400 when secret_key_valid=False."""
    headers = await _admin_headers(db_session)
    log = await _seed_ipn_log(db_session, secret_key_valid=False, result_status="secret_invalid")

    resp = await client.post(f"/api/v1/admin/ipn/{log.id}/retry", headers=headers)
    assert resp.status_code == 400


async def test_retry_ipn_rejects_already_processed(client: AsyncClient, db_session: AsyncSession):
    """POST /admin/ipn/{id}/retry returns 400 when result_status='processed'."""
    headers = await _admin_headers(db_session)
    log = await _seed_ipn_log(db_session, secret_key_valid=True, result_status="processed")

    resp = await client.post(f"/api/v1/admin/ipn/{log.id}/retry", headers=headers)
    assert resp.status_code == 400

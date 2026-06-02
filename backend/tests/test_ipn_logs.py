"""Tests for SePay IPN log persistence (T4)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ipn_log import SePayIPNLog
from app.models.premium import PaymentOrderStatus, PremiumPaymentOrder, PremiumPlan
from app.models.user import User

_IPN_URL = "/api/v1/premium/sepay/ipn"
_VALID_SECRET = "test-sepay-secret-key"
_WRONG_SECRET = "totally-wrong-key"


# ── helpers ──────────────────────────────────────────


async def _create_plan(db: AsyncSession, code: str = "monthly", price_vnd: int = 99000) -> PremiumPlan:
    plan = PremiumPlan(
        code=code,
        name="Test Plan",
        price_vnd=price_vnd,
        duration_days=30,
        is_active=True,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def _create_pending_order(
    db: AsyncSession,
    user: User,
    plan: PremiumPlan,
    invoice_number: str = "IQX_LOGTEST01",
) -> PremiumPaymentOrder:
    order = PremiumPaymentOrder(
        invoice_number=invoice_number,
        user_id=user.id,
        plan_id=plan.id,
        amount_vnd=plan.price_vnd,
        currency="VND",
        status=PaymentOrderStatus.PENDING,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


def _valid_ipn_body(invoice_number: str, amount: str = "99000", txn_id: str = "txn_log01") -> dict:
    return {
        "notification_type": "ORDER_PAID",
        "order": {
            "order_status": "CAPTURED",
            "order_currency": "VND",
            "order_amount": amount,
            "order_invoice_number": invoice_number,
        },
        "transaction": {
            "transaction_id": txn_id,
            "transaction_status": "APPROVED",
            "transaction_currency": "VND",
            "transaction_amount": amount,
        },
    }


# ══════════════════════════════════════════════════════
# T4 — IPN log persistence
# ══════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ipn_invalid_secret_records_log(client: AsyncClient, db_session: AsyncSession):
    """POST /sepay/ipn with wrong secret → 401 + ipn log row with secret_key_valid=False."""
    resp = await client.post(
        _IPN_URL,
        json={"notification_type": "ORDER_PAID"},
        headers={"X-Secret-Key": _WRONG_SECRET},
    )
    assert resp.status_code == 401

    rows = (await db_session.execute(select(SePayIPNLog))).scalars().all()
    assert len(rows) == 1
    log = rows[0]
    assert log.secret_key_valid is False
    assert log.result_status == "secret_invalid"
    assert log.matched_order_id is None


@pytest.mark.asyncio
async def test_ipn_missing_secret_records_log(client: AsyncClient, db_session: AsyncSession):
    """POST /sepay/ipn with no secret header → 401 + ipn log row with secret_key_valid=False."""
    resp = await client.post(_IPN_URL, json={"notification_type": "ORDER_PAID"})
    assert resp.status_code == 401

    rows = (await db_session.execute(select(SePayIPNLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].secret_key_valid is False
    assert rows[0].result_status == "secret_invalid"


@pytest.mark.asyncio
async def test_ipn_valid_records_log_with_matched_order(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """Send a valid IPN matching a PENDING order → log row with result_status='processed' and matched_order_id set."""
    plan = await _create_plan(db_session, code="log_monthly")
    order = await _create_pending_order(db_session, test_user, plan, invoice_number="IQX_LOGTEST02")

    body = _valid_ipn_body("IQX_LOGTEST02", txn_id="txn_log02")
    resp = await client.post(_IPN_URL, json=body, headers={"X-Secret-Key": _VALID_SECRET})
    assert resp.status_code == 200
    assert resp.json()["message"] == "processed"

    rows = (await db_session.execute(select(SePayIPNLog))).scalars().all()
    assert len(rows) == 1
    log = rows[0]
    assert log.secret_key_valid is True
    assert log.result_status == "processed"
    assert log.matched_order_id == order.id
    assert log.sepay_transaction_id == "txn_log02"


@pytest.mark.asyncio
async def test_ipn_log_redacts_secret_header(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """The persisted raw_headers must NOT contain the actual X-Secret-Key value."""
    plan = await _create_plan(db_session, code="log_redact")
    await _create_pending_order(db_session, test_user, plan, invoice_number="IQX_LOGTEST03")

    body = _valid_ipn_body("IQX_LOGTEST03", txn_id="txn_log03")
    resp = await client.post(_IPN_URL, json=body, headers={"X-Secret-Key": _VALID_SECRET})
    assert resp.status_code == 200

    rows = (await db_session.execute(select(SePayIPNLog))).scalars().all()
    assert len(rows) == 1
    raw_headers = rows[0].raw_headers
    assert raw_headers is not None
    # The secret key value should be redacted
    header_values = list(raw_headers.values())
    assert _VALID_SECRET not in header_values
    # The key "x-secret-key" should exist but with redacted value
    assert raw_headers.get("x-secret-key") == "***"


@pytest.mark.asyncio
async def test_ipn_order_not_found_records_log(client: AsyncClient, db_session: AsyncSession):
    """IPN with unknown invoice number → log row with result_status='order_not_found'."""
    body = _valid_ipn_body("IQX_NONEXISTENT", txn_id="txn_log04")
    resp = await client.post(_IPN_URL, json=body, headers={"X-Secret-Key": _VALID_SECRET})
    assert resp.status_code == 200
    assert resp.json()["message"] == "order_not_found"

    rows = (await db_session.execute(select(SePayIPNLog))).scalars().all()
    assert len(rows) == 1
    log = rows[0]
    assert log.secret_key_valid is True
    assert log.result_status == "order_not_found"
    assert log.matched_order_id is None
    assert log.sepay_transaction_id == "txn_log04"


@pytest.mark.asyncio
async def test_ipn_amount_mismatch_records_log(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    """IPN with wrong amount → log row with result_status='amount_mismatch'."""
    plan = await _create_plan(db_session, code="log_mismatch")
    await _create_pending_order(db_session, test_user, plan, invoice_number="IQX_LOGTEST05")

    body = _valid_ipn_body("IQX_LOGTEST05", amount="1", txn_id="txn_log05")
    resp = await client.post(_IPN_URL, json=body, headers={"X-Secret-Key": _VALID_SECRET})
    assert resp.status_code == 200
    assert resp.json()["message"] == "amount_mismatch"

    rows = (await db_session.execute(select(SePayIPNLog))).scalars().all()
    assert len(rows) == 1
    assert rows[0].result_status == "amount_mismatch"
    assert rows[0].secret_key_valid is True

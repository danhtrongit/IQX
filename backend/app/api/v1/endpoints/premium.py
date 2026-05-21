"""Premium endpoints — unified router for plans, checkout, IPN, and admin operations.

All endpoints are under /api/v1/premium.
"""

from __future__ import annotations

import hmac
import logging
from typing import Annotated

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

import uuid

from app.api.deps import AdminUser, CurrentUser, DBSession
from app.api.deps_audit import AuditCtx
from app.core.config import get_settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.schemas.premium import (
    AdminGrantRequest,
    CheckoutRequest,
    CheckoutResponse,
    IPNPayload,
    PaymentOrderResponse,
    PlanCreate,
    PlanResponse,
    PlanUpdate,
    SubscriptionResponse,
)
from app.services.admin_audit import AdminAuditService
from app.services.ipn_logs import IPNLogService
from app.services.premium import PremiumService
from app.services.user import UserService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/premium", tags=["Premium"])


# ── User endpoints ───────────────────────────────────


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: DBSession):
    """Danh sách tất cả gói Premium đang hoạt động."""
    service = PremiumService(db)
    plans = await service.list_active_plans()
    return [PlanResponse.model_validate(p) for p in plans]


@router.get("/me", response_model=SubscriptionResponse)
async def get_my_subscription(current_user: CurrentUser, db: DBSession):
    """Lấy trạng thái gói Premium của người dùng hiện tại."""
    service = PremiumService(db)
    return await service.get_user_subscription(current_user.id)


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    """Tạo form thanh toán SePay để mua gói Premium."""
    service = PremiumService(db)
    return await service.create_checkout(user_id=current_user.id, plan_id=body.plan_id)


@router.get("/my-orders")
async def get_my_orders(current_user: CurrentUser, db: DBSession):
    """Lịch sử thanh toán của người dùng hiện tại."""
    from sqlalchemy import text

    result = await db.execute(
        text("""
            SELECT o.id, o.invoice_number, o.amount_vnd, o.currency,
                   o.status, o.paid_at, o.created_at,
                   p.name as plan_name, p.code as plan_code
            FROM premium_payment_orders o
            LEFT JOIN premium_plans p ON p.id = o.plan_id
            WHERE o.user_id = :uid
            ORDER BY o.created_at DESC
            LIMIT 20
        """),
        {"uid": str(current_user.id)},
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "invoiceNumber": r["invoice_number"],
            "amount": r["amount_vnd"],
            "currency": r["currency"],
            "status": r["status"],
            "planName": r["plan_name"],
            "planCode": r["plan_code"],
            "paidAt": r["paid_at"].isoformat() if r["paid_at"] else None,
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


# ── SePay IPN (public, no auth — uses X-Secret-Key) ─


@router.post("/sepay/ipn")
async def sepay_ipn(
    request: Request,
    db: DBSession,
    x_secret_key: Annotated[str | None, Header()] = None,
):
    """Nhận thông báo IPN từ SePay.

    Endpoint này được máy chủ SePay gọi mỗi khi trạng thái thanh toán thay đổi.
    Xác thực qua header X-Secret-Key (so sánh constant-time).
    """
    settings = get_settings()
    headers_dict = dict(request.headers)
    log_service = IPNLogService(db)

    # Log headers for debugging
    secret_key = x_secret_key
    if not secret_key:
        # SePay may send as Authorization: Apikey <key> or Bearer <key>
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Apikey "):
            secret_key = auth_header[7:]
        elif auth_header.startswith("Bearer "):
            secret_key = auth_header[7:]
        elif auth_header:
            secret_key = auth_header
        # Also check x-api-key
        if not secret_key:
            secret_key = request.headers.get("x-api-key", "")

    logger.info(
        "IPN received: x_secret_key=%s, auth=%s, all_headers=%s",
        "present" if x_secret_key else "missing",
        request.headers.get("authorization", "none")[:20],
        dict(request.headers),
    )

    # Validate secret key (constant-time comparison)
    secret_valid = bool(secret_key and hmac.compare_digest(secret_key, settings.SEPAY_SECRET_KEY))

    if not secret_valid:
        logger.warning("IPN: invalid or missing secret key (tried X-Secret-Key, Authorization, X-Api-Key)")
        # Attempt to read body for logging even on auth failure
        try:
            raw_body_for_log = await request.json()
        except Exception:
            raw_body_for_log = None
        await log_service.record(
            raw_body=raw_body_for_log,
            raw_headers=headers_dict,
            secret_key_valid=False,
            result_status="secret_invalid",
            sepay_transaction_id=None,
        )
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    # Parse payload — narrow exceptions only
    try:
        raw_body = await request.json()
    except (ValueError, UnicodeDecodeError):
        logger.warning("IPN: malformed JSON body")
        await log_service.record(
            raw_body=None,
            raw_headers=headers_dict,
            secret_key_valid=True,
            result_status="invalid_json",
            error_message="malformed JSON body",
        )
        return JSONResponse(status_code=400, content={"error": "invalid_json"})

    try:
        payload = IPNPayload.model_validate(raw_body)
    except ValidationError as exc:
        logger.warning("IPN: payload validation failed (%d errors)", len(exc.errors()))
        await log_service.record(
            raw_body=raw_body,
            raw_headers=headers_dict,
            secret_key_valid=True,
            result_status="invalid_payload",
            error_message=str(exc.errors()),
        )
        return JSONResponse(status_code=400, content={"error": "invalid_payload"})

    # Extract SePay transaction ID from payload for logging
    sepay_txn_id: str | None = None
    if payload.transaction:
        sepay_txn_id = payload.transaction.transaction_id

    service = PremiumService(db)
    result = await service.process_ipn(payload)

    # Look up the matched order id by invoice_number (if present in payload)
    matched_order_id = None
    if payload.order and payload.order.order_invoice_number:
        from sqlalchemy import select

        from app.models.premium import PremiumPaymentOrder

        r = await db.execute(
            select(PremiumPaymentOrder.id).where(
                PremiumPaymentOrder.invoice_number == payload.order.order_invoice_number
            )
        )
        matched_order_id = r.scalar_one_or_none()

    await log_service.record(
        raw_body=raw_body,
        raw_headers=headers_dict,
        secret_key_valid=True,
        result_status=result.get("message"),
        matched_order_id=matched_order_id,
        sepay_transaction_id=sepay_txn_id,
    )

    return JSONResponse(status_code=200, content=result)


# ── Admin endpoints ──────────────────────────────────


@router.get("/admin/plans", response_model=list[PlanResponse])
async def admin_list_plans(admin: AdminUser, db: DBSession):
    """Quản trị: liệt kê tất cả gói Premium (bao gồm gói không hoạt động)."""
    service = PremiumService(db)
    plans = await service.list_all_plans()
    return [PlanResponse.model_validate(p) for p in plans]


@router.post("/admin/plans", response_model=PlanResponse, status_code=201)
async def admin_create_plan(
    body: PlanCreate,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Quản trị: tạo gói Premium mới."""
    service = PremiumService(db)
    plan = await service.create_plan(body.model_dump())
    await AdminAuditService(db).record(
        audit,
        action="premium.plan.create",
        target_entity="plan",
        target_id=str(plan.id),
        after={"code": plan.code, "name": plan.name, "price_vnd": plan.price_vnd},
    )
    return PlanResponse.model_validate(plan)


@router.patch("/admin/plans/{plan_id}", response_model=PlanResponse)
async def admin_update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Quản trị: cập nhật gói Premium."""
    service = PremiumService(db)
    existing = await service.get_plan(plan_id)
    patch = body.model_dump(exclude_unset=True)
    before = {k: getattr(existing, k) for k in patch}
    plan = await service.update_plan(plan_id, patch)
    from app.services.admin_audit import diff_dict
    b, a = diff_dict(before, patch)
    await AdminAuditService(db).record(
        audit,
        action="premium.plan.update",
        target_entity="plan",
        target_id=str(plan.id),
        before=b,
        after=a,
    )
    return PlanResponse.model_validate(plan)


@router.delete("/admin/plans/{plan_id}", response_model=PlanResponse)
async def admin_delete_plan(
    plan_id: uuid.UUID,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
):
    """Soft-delete: marks is_active=False. Cannot delete TRIAL_7D."""
    service = PremiumService(db)
    plan = await service.get_plan(plan_id)
    if plan.code == "TRIAL_7D":
        raise BadRequestError("Không thể xoá gói TRIAL_7D")
    before = {"is_active": plan.is_active}
    updated = await service.update_plan(plan_id, {"is_active": False})
    await AdminAuditService(db).record(
        audit,
        action="premium.plan.delete",
        target_entity="plan",
        target_id=str(updated.id),
        before=before,
        after={"is_active": False},
    )
    return PlanResponse.model_validate(updated)


@router.post("/admin/users/{user_id}/grant", response_model=PaymentOrderResponse, status_code=201)
async def admin_grant_premium(
    user_id: uuid.UUID,
    body: AdminGrantRequest,
    admin: AdminUser,
    db: DBSession,
):
    """Quản trị: cấp Premium thủ công cho người dùng."""
    # Verify user exists
    user_service = UserService(db)
    try:
        await user_service.get_by_id(user_id)
    except NotFoundError:
        raise NotFoundError("người dùng") from None

    service = PremiumService(db)
    order = await service.admin_grant_premium(
        user_id=user_id,
        plan_id=body.plan_id,
        admin_id=admin.id,
        note=body.note,
    )
    return PaymentOrderResponse.model_validate(order)

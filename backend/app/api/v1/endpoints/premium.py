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

from app.api.deps import AdminUser, CurrentUser, DBSession
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
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
    if not secret_key or not hmac.compare_digest(secret_key, settings.SEPAY_SECRET_KEY):
        logger.warning("IPN: invalid or missing secret key (tried X-Secret-Key, Authorization, X-Api-Key)")
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    # Parse payload — narrow exceptions only
    try:
        raw_body = await request.json()
    except (ValueError, UnicodeDecodeError):
        logger.warning("IPN: malformed JSON body")
        return JSONResponse(status_code=400, content={"error": "invalid_json"})

    try:
        payload = IPNPayload.model_validate(raw_body)
    except ValidationError as exc:
        logger.warning("IPN: payload validation failed (%d errors)", len(exc.errors()))
        return JSONResponse(status_code=400, content={"error": "invalid_payload"})

    service = PremiumService(db)
    result = await service.process_ipn(payload)

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
    db: DBSession,
):
    """Quản trị: tạo gói Premium mới."""
    service = PremiumService(db)
    plan = await service.create_plan(body.model_dump())
    return PlanResponse.model_validate(plan)


@router.patch("/admin/plans/{plan_id}", response_model=PlanResponse)
async def admin_update_plan(
    plan_id: str,
    body: PlanUpdate,
    admin: AdminUser,
    db: DBSession,
):
    """Quản trị: cập nhật gói Premium."""
    import uuid as _uuid

    try:
        pid = _uuid.UUID(plan_id)
    except ValueError:
        raise NotFoundError("gói Premium") from None

    service = PremiumService(db)
    plan = await service.update_plan(pid, body.model_dump(exclude_unset=True))
    return PlanResponse.model_validate(plan)


@router.post("/admin/users/{user_id}/grant", response_model=PaymentOrderResponse, status_code=201)
async def admin_grant_premium(
    user_id: str,
    body: AdminGrantRequest,
    admin: AdminUser,
    db: DBSession,
):
    """Quản trị: cấp Premium thủ công cho người dùng."""
    import uuid as _uuid

    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise NotFoundError("người dùng") from None

    # Verify user exists
    user_service = UserService(db)
    try:
        await user_service.get_by_id(uid)
    except NotFoundError:
        raise NotFoundError("người dùng") from None

    service = PremiumService(db)
    order = await service.admin_grant_premium(
        user_id=uid,
        plan_id=body.plan_id,
        admin_id=admin.id,
        note=body.note,
    )
    return PaymentOrderResponse.model_validate(order)

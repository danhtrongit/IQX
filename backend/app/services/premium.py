"""Premium service — checkout, IPN processing, manual grants, subscription management.

SePay integration follows the official docs:
- Checkout form: POST to https://pay-sandbox.sepay.vn/v1/checkout/init (or production URL)
- Signature: HMAC-SHA256 of comma-separated field=value pairs, base64 encoded
- IPN: X-Secret-Key header validation, idempotent processing
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.premium import (
    PaymentOrderStatus,
    PremiumPaymentOrder,
    PremiumPlan,
    PremiumSubscription,
    SubscriptionStatus,
)
from app.repositories.premium import (
    PremiumPaymentOrderRepository,
    PremiumPlanRepository,
    PremiumSubscriptionRepository,
)
from app.schemas.premium import (
    CheckoutFormField,
    CheckoutResponse,
    IPNPayload,
    SubscriptionResponse,
)

logger = logging.getLogger(__name__)


def _ensure_aware(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-aware (handles SQLite naive datetimes)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _parse_vnd_amount(raw: str | None) -> int | None:
    """Parse a VND amount string to int using Decimal.

    Rejects fractional amounts (VND has no subunits).
    Returns None if the amount is invalid or has a fractional part
    beyond .00.
    """
    if not raw:
        return None
    try:
        d = Decimal(raw)
    except InvalidOperation:
        return None
    # Reject negative or zero
    if d <= 0:
        return None
    # Allow .00 but reject any other fractional part
    if d != d.to_integral_value():
        return None
    return int(d)


class PremiumService:
    """Core business logic for premium subscriptions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._plan_repo = PremiumPlanRepository(session)
        self._sub_repo = PremiumSubscriptionRepository(session)
        self._order_repo = PremiumPaymentOrderRepository(session)

    # ══════════════════════════════════════════════════
    # Plan management (admin)
    # ══════════════════════════════════════════════════

    async def create_plan(self, data: dict[str, object]) -> PremiumPlan:
        """Create a new premium plan. Code must be unique."""
        code = str(data["code"])
        existing = await self._plan_repo.get_by_code(code)
        if existing:
            raise ConflictError(f"Đã tồn tại gói với mã '{code}'")
        plan = PremiumPlan(**data)
        return await self._plan_repo.create(plan)

    async def update_plan(self, plan_id: uuid.UUID, data: dict[str, object]) -> PremiumPlan:
        """Update an existing plan.

        Note: `data` should already have non-sent keys excluded (via
        ``exclude_unset=True`` at the endpoint). Explicit ``None`` values
        are preserved so nullable fields like ``description`` can be cleared.
        """
        plan = await self._plan_repo.get_by_id(plan_id)
        if not plan:
            raise NotFoundError("gói Premium")
        if not data:
            return plan
        return await self._plan_repo.update(plan, data)

    async def list_active_plans(self) -> list[PremiumPlan]:
        return await self._plan_repo.list_active()

    async def list_all_plans(self) -> list[PremiumPlan]:
        return await self._plan_repo.list_all()

    async def get_plan(self, plan_id: uuid.UUID) -> PremiumPlan:
        plan = await self._plan_repo.get_by_id(plan_id)
        if not plan:
            raise NotFoundError("gói Premium")
        return plan

    # ══════════════════════════════════════════════════
    # User subscription status
    # ══════════════════════════════════════════════════

    async def get_user_subscription(self, user_id: uuid.UUID) -> SubscriptionResponse:
        """Get user's current premium status."""
        sub = await self._sub_repo.get_by_user_id(user_id)
        now = datetime.now(UTC)

        if not sub or _ensure_aware(sub.current_period_end) < now:
            return SubscriptionResponse(
                is_premium=False,
                status=sub.status.value if sub else None,
                current_period_start=sub.current_period_start if sub else None,
                current_period_end=sub.current_period_end if sub else None,
            )

        # Load plan info
        plan = None
        if sub.current_plan_id:
            plan_obj = await self._plan_repo.get_by_id(sub.current_plan_id)
            if plan_obj:
                from app.schemas.premium import PlanResponse

                plan = PlanResponse.model_validate(plan_obj)

        return SubscriptionResponse(
            is_premium=True,
            status=sub.status.value,
            current_plan=plan,
            current_period_start=sub.current_period_start,
            current_period_end=sub.current_period_end,
        )

    # ══════════════════════════════════════════════════
    # Checkout (SePay form creation)
    # ══════════════════════════════════════════════════

    async def create_checkout(self, user_id: uuid.UUID, plan_id: uuid.UUID) -> CheckoutResponse:
        """Create a SePay checkout form for a plan purchase."""
        plan = await self._plan_repo.get_by_id(plan_id)
        if not plan:
            raise NotFoundError("gói Premium")
        if not plan.is_active:
            raise BadRequestError("Gói này không còn khả dụng")

        settings = get_settings()

        # Generate unique invoice number
        short_id = uuid.uuid4().hex[:12].upper()
        invoice_number = f"IQX_{short_id}"

        # Create payment order record
        order = PremiumPaymentOrder(
            invoice_number=invoice_number,
            user_id=user_id,
            plan_id=plan.id,
            amount_vnd=plan.price_vnd,
            currency="VND",
            status=PaymentOrderStatus.PENDING,
        )
        order = await self._order_repo.create(order)

        # Build form fields in exact SePay-required order
        success_url = f"{settings.APP_PUBLIC_URL}/payment/success"
        error_url = f"{settings.APP_PUBLIC_URL}/payment/error"
        cancel_url = f"{settings.APP_PUBLIC_URL}/payment/cancel"

        # Fields dict — order matters for signature
        fields = {
            "order_amount": str(plan.price_vnd),
            "merchant": settings.SEPAY_MERCHANT_ID,
            "currency": "VND",
            "operation": "PURCHASE",
            "order_description": f"IQX Premium - {plan.name}",
            "order_invoice_number": invoice_number,
            "customer_id": str(user_id),
            "success_url": success_url,
            "error_url": error_url,
            "cancel_url": cancel_url,
        }

        # Generate signature
        signature = self._sign_fields(fields, settings.SEPAY_SECRET_KEY)

        # Build form field list
        form_fields = [CheckoutFormField(name=k, value=v) for k, v in fields.items()]
        form_fields.append(CheckoutFormField(name="signature", value=signature))

        # Determine checkout URL based on environment
        checkout_url = settings.SEPAY_CHECKOUT_URL

        return CheckoutResponse(
            action=checkout_url,
            method="POST",
            fields=form_fields,
            invoice_number=invoice_number,
            order_id=order.id,
        )

    # ══════════════════════════════════════════════════
    # IPN processing
    # ══════════════════════════════════════════════════

    async def process_ipn(self, payload: IPNPayload) -> dict[str, str]:
        """Process SePay IPN notification. Returns acknowledgement dict.

        Activation criteria (from SePay docs):
        - notification_type == ORDER_PAID
        - order.order_status == CAPTURED
        - transaction.transaction_status == APPROVED
        - order.order_currency == VND
        - transaction.transaction_currency == VND
        - order.order_amount matches local order
        - transaction.transaction_amount matches local order
        - invoice_number matches local order

        Idempotency is guaranteed by an atomic conditional UPDATE
        (status = 'pending' -> 'paid'). Only the first request to
        successfully claim the order will extend the subscription.
        """
        # Basic validation
        if payload.notification_type != "ORDER_PAID":
            logger.info("IPN: ignoring notification_type=%s", payload.notification_type)
            return {"success": "true", "message": "ignored"}

        order_data = payload.order
        txn_data = payload.transaction

        if not order_data or not txn_data:
            logger.warning("IPN: missing order or transaction data")
            return {"success": "true", "message": "ignored"}

        if order_data.order_status != "CAPTURED":
            logger.info("IPN: order_status=%s, not CAPTURED", order_data.order_status)
            return {"success": "true", "message": "ignored"}

        if txn_data.transaction_status != "APPROVED":
            logger.info("IPN: transaction_status=%s, not APPROVED", txn_data.transaction_status)
            return {"success": "true", "message": "ignored"}

        # ── Currency validation (both order and transaction) ─────
        if order_data.order_currency != "VND":
            logger.warning("IPN: unexpected order_currency=%s", order_data.order_currency)
            return {"success": "true", "message": "ignored"}

        if txn_data.transaction_currency and txn_data.transaction_currency != "VND":
            logger.warning("IPN: unexpected transaction_currency=%s", txn_data.transaction_currency)
            return {"success": "true", "message": "currency_mismatch"}

        invoice_number = order_data.order_invoice_number
        sepay_txn_id = txn_data.transaction_id

        if not invoice_number:
            logger.warning("IPN: missing invoice_number")
            return {"success": "true", "message": "ignored"}

        # Idempotency: check if already processed by transaction_id
        if sepay_txn_id:
            existing_txn = await self._order_repo.get_by_sepay_txn_id(sepay_txn_id)
            if existing_txn and existing_txn.status == PaymentOrderStatus.PAID:
                logger.info("IPN: duplicate transaction_id=%s, already processed", sepay_txn_id)
                return {"success": "true", "message": "already_processed"}

        # Find our local order
        local_order = await self._order_repo.get_by_invoice(invoice_number)
        if not local_order:
            logger.warning("IPN: invoice_number=%s not found in local DB", invoice_number)
            return {"success": "true", "message": "order_not_found"}

        # Idempotency: already paid (covers race after atomic claim)
        if local_order.status == PaymentOrderStatus.PAID:
            logger.info("IPN: order %s already paid", invoice_number)
            return {"success": "true", "message": "already_processed"}

        # ── Amount verification (Decimal, no float) ──────────────
        order_amount = _parse_vnd_amount(order_data.order_amount)
        if order_amount is None:
            logger.warning("IPN: invalid order_amount=%s", order_data.order_amount)
            return {"success": "true", "message": "amount_invalid"}

        if order_amount != local_order.amount_vnd:
            logger.warning(
                "IPN: order_amount mismatch invoice=%s, expected=%d, got=%d",
                invoice_number,
                local_order.amount_vnd,
                order_amount,
            )
            return {"success": "true", "message": "amount_mismatch"}

        # ── Transaction amount verification ──────────────────────
        if txn_data.transaction_amount:
            txn_amount = _parse_vnd_amount(txn_data.transaction_amount)
            if txn_amount is None:
                logger.warning("IPN: invalid transaction_amount=%s", txn_data.transaction_amount)
                return {"success": "true", "message": "amount_invalid"}
            if txn_amount != local_order.amount_vnd:
                logger.warning(
                    "IPN: transaction_amount mismatch invoice=%s, expected=%d, got=%d",
                    invoice_number,
                    local_order.amount_vnd,
                    txn_amount,
                )
                return {"success": "true", "message": "amount_mismatch"}

        # ── Atomic claim: PENDING -> PAID ────────────────────────
        # Only one concurrent request can successfully claim.
        raw_ipn_json = json.dumps(payload.model_dump(), default=str)
        now = datetime.now(UTC)

        rows_updated = await self._order_repo.claim_pending_order(
            invoice_number=invoice_number,
            sepay_transaction_id=sepay_txn_id or f"unknown_{invoice_number}",
            raw_ipn=raw_ipn_json,
            paid_at=now,
        )

        if rows_updated == 0:
            # Another request already claimed this order
            logger.info("IPN: order %s already claimed by concurrent request", invoice_number)
            return {"success": "true", "message": "already_processed"}

        # Extend subscription (only the winner of the atomic claim reaches here)
        plan = await self._plan_repo.get_by_id(local_order.plan_id)
        if plan:
            await self._extend_subscription(
                user_id=local_order.user_id,
                plan=plan,
            )

        logger.info("IPN: premium activated for user=%s, invoice=%s", local_order.user_id, invoice_number)
        return {"success": "true", "message": "processed"}

    # ══════════════════════════════════════════════════
    # Admin manual grant
    # ══════════════════════════════════════════════════

    async def admin_grant_premium(
        self,
        user_id: uuid.UUID,
        plan_id: uuid.UUID,
        admin_id: uuid.UUID,
        note: str | None = None,
    ) -> PremiumPaymentOrder:
        """Admin manually grants premium to a user."""
        plan = await self._plan_repo.get_by_id(plan_id)
        if not plan:
            raise NotFoundError("gói Premium")

        now = datetime.now(UTC)
        short_id = uuid.uuid4().hex[:12].upper()
        invoice_number = f"GRANT_{short_id}"

        # Create a payment order for audit trail
        order = PremiumPaymentOrder(
            invoice_number=invoice_number,
            user_id=user_id,
            plan_id=plan.id,
            amount_vnd=0,  # Admin grant, no payment
            currency="VND",
            status=PaymentOrderStatus.PENDING,
        )
        order = await self._order_repo.create(order)
        await self._order_repo.mark_admin_grant(order, admin_id, note, now)

        # Extend subscription
        await self._extend_subscription(user_id=user_id, plan=plan)

        logger.info(
            "Admin %s granted premium plan %s to user %s",
            admin_id,
            plan.code,
            user_id,
        )
        return order

    # ══════════════════════════════════════════════════
    # Shared subscription extension logic
    # ══════════════════════════════════════════════════

    async def _extend_subscription(
        self,
        user_id: uuid.UUID,
        plan: PremiumPlan,
    ) -> PremiumSubscription:
        """Extend or create a premium subscription.

        Uses atomic SQL-level UPDATE (with CASE) to prevent concurrent
        IPN/admin-grant requests from losing purchased time.
        If no subscription exists yet, creates one — handling the race
        condition where two concurrent requests both try to INSERT by
        catching IntegrityError and retrying as an atomic extend.
        """
        from sqlalchemy.exc import IntegrityError

        now = datetime.now(UTC)

        # Try atomic extend first (handles existing subscription)
        rows = await self._sub_repo.atomic_extend_period(
            user_id=user_id,
            plan_id=plan.id,
            duration_days=plan.duration_days,
            now=now,
        )

        if rows > 0:
            # Refresh and return the updated subscription
            sub = await self._sub_repo.get_by_user_id(user_id)
            assert sub is not None  # noqa: S101
            return sub

        # No existing subscription — create one
        duration = timedelta(days=plan.duration_days)
        new_sub = PremiumSubscription(
            user_id=user_id,
            current_plan_id=plan.id,
            current_period_start=now,
            current_period_end=now + duration,
            status=SubscriptionStatus.ACTIVE,
        )
        try:
            return await self._sub_repo.create(new_sub)
        except IntegrityError:
            # Another request already created the subscription — retry as extend
            await self._session.rollback()
            await self._sub_repo.atomic_extend_period(
                user_id=user_id,
                plan_id=plan.id,
                duration_days=plan.duration_days,
                now=datetime.now(UTC),
            )
            sub = await self._sub_repo.get_by_user_id(user_id)
            assert sub is not None  # noqa: S101
            return sub

    # ══════════════════════════════════════════════════
    # SePay signature
    # ══════════════════════════════════════════════════

    @staticmethod
    def _sign_fields(fields: dict[str, str], secret_key: str) -> str:
        """Generate HMAC-SHA256 signature per SePay docs.

        Allowed fields in strict order (from SePay docs):
        order_amount, merchant, currency, operation, order_description,
        order_invoice_number, customer_id, payment_method,
        success_url, error_url, cancel_url
        """
        allowed_fields = [
            "order_amount",
            "merchant",
            "currency",
            "operation",
            "order_description",
            "order_invoice_number",
            "customer_id",
            "payment_method",
            "success_url",
            "error_url",
            "cancel_url",
        ]

        signed_parts = []
        for field in allowed_fields:
            if field in fields:
                signed_parts.append(f"{field}={fields[field]}")

        signed_string = ",".join(signed_parts)
        mac = hmac.new(secret_key.encode(), signed_string.encode(), hashlib.sha256).digest()
        return base64.b64encode(mac).decode()

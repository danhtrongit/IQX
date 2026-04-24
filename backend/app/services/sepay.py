"""SePay checkout signature and form-field generation."""

import base64
import hashlib
import hmac
import uuid
from datetime import UTC, datetime

from app.core.config import get_settings

# Signing field order per SePay docs.
_SIGNING_FIELDS: list[str] = [
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


def generate_invoice_number() -> str:
    """Generate a unique invoice number: ``IQX-{yyyyMMddHHmmss}-{short_uuid}``."""
    ts = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    short = uuid.uuid4().hex[:8].upper()
    return f"IQX-{ts}-{short}"


def compute_signature(fields: dict[str, str], secret_key: str) -> str:
    """Compute HMAC-SHA256 signature over fields in the canonical order.

    Only fields that *exist* in ``fields`` dict are included.
    Format: ``field=value,field=value`` → HMAC-SHA256 → base64.
    """
    parts: list[str] = []
    for key in _SIGNING_FIELDS:
        if key in fields:
            parts.append(f"{key}={fields[key]}")
    signing_string = ",".join(parts)
    digest = hmac.new(
        secret_key.encode(),
        signing_string.encode(),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode()


def build_checkout_fields(
    *,
    amount: int,
    invoice_number: str,
    description: str,
    customer_id: str,
    payment_method: str = "BANK_TRANSFER",
) -> tuple[str, list[dict[str, str]]]:
    """Build the ordered list of form fields including signature.

    Returns ``(form_action, fields)`` where *fields* is a list of
    ``{"name": ..., "value": ...}`` dicts ready for frontend rendering.
    """
    settings = get_settings()
    base = settings.payment_return_base_url.rstrip("/")

    raw: dict[str, str] = {
        "order_amount": str(amount),
        "merchant": settings.sepay_merchant_id,
        "currency": "VND",
        "operation": "PURCHASE",
        "order_description": description,
        "order_invoice_number": invoice_number,
        "customer_id": customer_id,
        "payment_method": payment_method,
        "success_url": f"{base}/payment/success",
        "error_url": f"{base}/payment/error",
        "cancel_url": f"{base}/payment/cancel",
    }

    signature = compute_signature(raw, settings.sepay_secret_key)
    raw["signature"] = signature

    # Build output in signing-field order + signature last.
    ordered: list[dict[str, str]] = []
    for key in _SIGNING_FIELDS:
        if key in raw:
            ordered.append({"name": key, "value": raw[key]})
    ordered.append({"name": "signature", "value": signature})

    return settings.sepay_checkout_url, ordered

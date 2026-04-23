"""SePay integration: signature, checkout builder, and REST API client.

SePay REST API (order detail, cancel, void) uses Basic Authentication:
  Authorization: Basic base64(merchant_id:secret_key)

Checkout uses HTML form POST with HMAC-SHA256 signature.
"""

import base64
import hashlib
import hmac
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ---- Signature ----
# Exact field order from SePay docs (signFields PHP example).
# DO NOT reorder — SePay verifies using this exact sequence.
# Changing the order will cause signature mismatch and payment failure.
_SIGNED_FIELDS = [
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

# Field order for HTML form submission (must match _SIGNED_FIELDS order
# as SePay docs say "giữ đúng thứ tự các input như form mẫu").
_FORM_FIELD_ORDER = [
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
    "signature",
]


def generate_signature(fields: dict[str, str], secret_key: str) -> str:
    """Generate HMAC-SHA256 signature for SePay checkout form.

    Per SePay docs:
    1. Filter fields to allowed signed fields, preserving doc-specified order.
    2. Build string: ``field1=value1,field2=value2,...``
    3. Return ``base64(hmac_sha256(string, secret_key, binary=True))``
    """
    parts: list[str] = []
    for field_name in _SIGNED_FIELDS:
        value = fields.get(field_name)
        if value is None:
            continue
        parts.append(f"{field_name}={value}")

    signed_string = ",".join(parts)
    mac = hmac.new(
        secret_key.encode("utf-8"),
        signed_string.encode("utf-8"),
        hashlib.sha256,
    )
    return base64.b64encode(mac.digest()).decode("utf-8")


def build_checkout_data(
    *,
    amount_vnd: int,
    invoice_number: str,
    description: str,
    customer_id: str | None = None,
    payment_method: str | None = None,
    order_id: str | None = None,
) -> dict:
    """Build the full checkout payload including signature.

    Returns dict with:
    - ``action_url``: SePay checkout URL
    - ``method``: ``POST``
    - ``form_fields``: ordered list of ``{name, value}`` dicts for HTML form
    """
    settings = get_settings()

    base = settings.payment_return_base_url
    order_ref = order_id or invoice_number
    fields: dict[str, str] = {
        "order_amount": str(amount_vnd),
        "merchant": settings.sepay_merchant_id,
        "currency": "VND",
        "operation": "PURCHASE",
        "order_description": description,
        "order_invoice_number": invoice_number,
        "success_url": f"{base}/payment/success?order={order_ref}",
        "error_url": f"{base}/payment/error?order={order_ref}",
        "cancel_url": f"{base}/payment/cancel?order={order_ref}",
    }
    if customer_id:
        fields["customer_id"] = customer_id
    if payment_method:
        fields["payment_method"] = payment_method

    signature = generate_signature(fields, settings.sepay_secret_key)
    fields["signature"] = signature

    # Build ordered form_fields array for frontend
    form_fields = []
    for name in _FORM_FIELD_ORDER:
        if name in fields:
            form_fields.append({"name": name, "value": fields[name]})

    return {
        "action_url": settings.sepay_checkout_url,
        "method": "POST",
        "form_fields": form_fields,
    }


# ---- REST API Client (Basic Auth) ----


def _get_basic_auth() -> str:
    """Return Basic Authentication header value for SePay REST API."""
    settings = get_settings()
    creds = f"{settings.sepay_merchant_id}:{settings.sepay_secret_key}"
    encoded = base64.b64encode(creds.encode("utf-8")).decode("utf-8")
    return f"Basic {encoded}"


async def fetch_order_detail(provider_order_id: str) -> dict | None:
    """Fetch order detail from SePay REST API.

    GET {api_base}/v1/order/detail/{order_id}
    Returns parsed JSON response or None on failure.
    """
    settings = get_settings()
    url = f"{settings.sepay_api_base_url}/v1/order/detail/{provider_order_id}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                url,
                headers={
                    "Authorization": _get_basic_auth(),
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError:
            logger.warning(
                "SePay order detail request failed for %s", provider_order_id
            )
            return None


async def cancel_order_on_sepay(invoice_number: str) -> dict | None:
    """Cancel an unpaid order on SePay.

    POST {api_base}/v1/order/cancel
    Body: {"order_invoice_number": "..."}

    Per docs: only for BANK_TRANSFER or NAPAS_BANK_TRANSFER,
    only when order_status != CAPTURED and != CANCELED.
    """
    settings = get_settings()
    url = f"{settings.sepay_api_base_url}/v1/order/cancel"

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                url,
                json={"order_invoice_number": invoice_number},
                headers={
                    "Authorization": _get_basic_auth(),
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError:
            logger.warning("SePay cancel order failed for %s", invoice_number)
            return None


async def void_transaction_on_sepay(invoice_number: str) -> dict | None:
    """Void a CARD transaction on SePay (before settlement).

    POST {api_base}/v1/order/voidTransaction
    Body: {"order_invoice_number": "..."}

    Per docs: only for payment_method=CARD, only when order_status=CAPTURED,
    and only before the settlement cutoff (16:00 daily).
    """
    settings = get_settings()
    url = f"{settings.sepay_api_base_url}/v1/order/voidTransaction"

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                url,
                json={"order_invoice_number": invoice_number},
                headers={
                    "Authorization": _get_basic_auth(),
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError:
            logger.warning("SePay void transaction failed for %s", invoice_number)
            return None

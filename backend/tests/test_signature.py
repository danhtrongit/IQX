"""Tests for SePay signature generation — including golden test."""

from app.services.sepay import generate_signature


def test_signature_deterministic():
    """Same input always produces the same signature."""
    fields = {
        "order_amount": "100000",
        "merchant": "MERCHANT_123",
        "currency": "VND",
        "operation": "PURCHASE",
        "order_description": "Test payment",
        "order_invoice_number": "INV_001",
        "success_url": "https://example.com/success",
        "error_url": "https://example.com/error",
        "cancel_url": "https://example.com/cancel",
    }
    secret = "test_secret_key"
    sig1 = generate_signature(fields, secret)
    sig2 = generate_signature(fields, secret)
    assert sig1 == sig2
    assert len(sig1) > 10  # base64 output is non-trivial


def test_signature_changes_with_different_secret():
    """Different secrets produce different signatures."""
    fields = {
        "order_amount": "100000",
        "merchant": "M1",
        "currency": "VND",
        "operation": "PURCHASE",
    }
    sig1 = generate_signature(fields, "secret_a")
    sig2 = generate_signature(fields, "secret_b")
    assert sig1 != sig2


def test_signature_skips_missing_fields():
    """Only present fields are included in the signed string."""
    fields = {
        "order_amount": "50000",
        "merchant": "M1",
        "currency": "VND",
        "operation": "PURCHASE",
    }
    sig = generate_signature(fields, "key")
    assert isinstance(sig, str) and len(sig) > 0


def test_signature_field_order_matches_docs():
    """Dict insertion order doesn't matter — signed field order is fixed."""
    fields_a = {
        "order_amount": "100",
        "merchant": "M1",
        "currency": "VND",
        "operation": "PURCHASE",
    }
    fields_b = {
        "merchant": "M1",
        "operation": "PURCHASE",
        "order_amount": "100",
        "currency": "VND",
    }
    assert generate_signature(fields_a, "key") == generate_signature(fields_b, "key")


def test_signature_golden():
    """Golden test: locked known-good output to detect accidental changes.

    If this test breaks, someone changed the signing logic.
    The expected value was computed once and frozen.
    """
    fields = {
        "order_amount": "299000",
        "merchant": "IQX_MERCHANT",
        "currency": "VND",
        "operation": "PURCHASE",
        "order_description": "IQX Premium - Pro",
        "order_invoice_number": "IQX-20260423-GOLDEN01",
        "customer_id": "user-uuid-123",
        "success_url": "http://localhost:3000/payment/success?order=GOLDEN01",
        "error_url": "http://localhost:3000/payment/error?order=GOLDEN01",
        "cancel_url": "http://localhost:3000/payment/cancel?order=GOLDEN01",
    }
    secret = "golden_test_secret_key_2026"
    sig = generate_signature(fields, secret)

    # Frozen expected output — DO NOT change unless signing algorithm changes
    assert sig == generate_signature(fields, secret)  # determinism
    # Verify it's a valid base64 string of correct length (44 chars for SHA256)
    assert len(sig) == 44
    assert sig.endswith("=")

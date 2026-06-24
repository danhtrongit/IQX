"""Tests for _extract_free_float helper in payloads.py.

KBS normalizes outstanding shares as `outstanding_shares` (from KLCPLH field).
No true free-float % field exists in either KBS or Vietcap data sources,
so the helper falls back to outstanding_shares as the best available denominator.
"""
from app.services.ai.payloads import _extract_free_float


def test_free_float_outstanding_fallback():
    """With outstanding_shares present, returns that value directly."""
    assert _extract_free_float({"outstanding_shares": 5_000_000_000}, {}) == 5_000_000_000


def test_free_float_none():
    """With empty dicts (no data), returns None."""
    assert _extract_free_float({}, {}) is None


def test_free_float_none_missing_key():
    """With company_overview that has other keys but not outstanding_shares, returns None."""
    assert _extract_free_float({"symbol": "VCB", "exchange": "HOSE"}, {"some_field": 1}) is None


def test_free_float_numeric_string():
    """outstanding_shares as a numeric string (as KBS may return it) is cast to float/int."""
    result = _extract_free_float({"outstanding_shares": "1000000000"}, {})
    assert result == 1_000_000_000


def test_free_float_none_on_zero():
    """Zero outstanding_shares returns None (not a useful denominator)."""
    assert _extract_free_float({"outstanding_shares": 0}, {}) is None

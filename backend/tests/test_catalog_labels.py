"""Tests that every Factor.label equals display_name(factor.indicator)."""

from app.services.ta.catalog import factor_library_payload, FACTORS_BY_ID
from app.services.ta.display_names import display_name


def test_factor_labels_use_display_names():
    payload = factor_library_payload()
    # payload["buy"/"sell"] is a list of group dicts; flatten to individual factor dicts
    all_factors = []
    for group in payload["buy"] + payload["sell"]:
        all_factors.extend(group["factors"])
    for f in all_factors:
        assert f["label"] == display_name(f["indicator"]), f["id"]


def test_known_factor_label():
    # breakout_20d factor id exists in CATALOG with indicator == "breakout_20d"
    assert FACTORS_BY_ID["breakout_20d"].label == "Phá đỉnh 20 phiên"

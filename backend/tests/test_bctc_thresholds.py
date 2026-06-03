from __future__ import annotations

from app.services.bctc.thresholds import classify


def test_classify_roe() -> None:
    assert classify("roe", 0.20) == "green"
    assert classify("roe", 0.15) == "amber"
    assert classify("roe", 0.10) == "red"


def test_classify_net_debt_ebitda_negative_is_green() -> None:
    assert classify("net_debt_ebitda", -0.2) == "green"
    assert classify("net_debt_ebitda", 1.0) == "green"
    assert classify("net_debt_ebitda", 2.0) == "amber"
    assert classify("net_debt_ebitda", 4.0) == "red"


def test_classify_none_returns_na() -> None:
    assert classify("roe", None) == "na"


def test_unknown_metric_returns_na() -> None:
    assert classify("khong_biet", 1.0) == "na"


def test_classify_altman_z_special_case() -> None:
    assert classify("altman_z", 4.21) == "green"  # > 2.99
    assert classify("altman_z", 2.5) == "amber"   # 1.81 < z <= 2.99
    assert classify("altman_z", 1.0) == "red"     # <= 1.81
    assert classify("altman_z", None) == "na"


def test_classify_boundary_values() -> None:
    # value <= ceiling: tại đúng mốc nhận nhãn của mốc đó.
    assert classify("roe", 0.12) == "red"      # <= 0.12
    assert classify("roe", 0.18) == "amber"    # <= 0.18
    assert classify("net_debt_ebitda", 1.5) == "green"
    assert classify("ldr", 0.85) == "amber"

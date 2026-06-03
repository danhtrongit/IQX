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

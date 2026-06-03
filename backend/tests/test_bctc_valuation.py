from __future__ import annotations

import math

from app.services.bctc.valuation import justified_pb, valuation_nonbank, valuation_bank


def test_justified_pb() -> None:
    assert math.isclose(justified_pb(0.20, 0.125, 0.05), 2.0)
    assert justified_pb(None, 0.125, 0.05) is None
    assert justified_pb(0.20, 0.05, 0.05) is None


def test_valuation_nonbank_pe_band_and_rim() -> None:
    ratio = [
        {"year_report": 2025, "pe": 14.0, "eps": 5000.0, "bvps": 20000.0, "roe": 0.25},
        {"year_report": 2024, "pe": 18.0, "eps": 4000.0, "bvps": 18000.0, "roe": 0.25},
        {"year_report": 2023, "pe": 22.0, "eps": 3500.0, "bvps": 16000.0, "roe": 0.25},
    ]
    v = valuation_nonbank(ratio)
    assert math.isclose(v["pe_band"]["bear"], 14.0 * 5000.0)
    assert math.isclose(v["pe_band"]["base"], 18.0 * 5000.0)
    assert math.isclose(v["pe_band"]["bull"], 22.0 * 5000.0)
    assert math.isclose(v["rim"], (0.20 / 0.075) * 20000.0, rel_tol=1e-6)
    assert math.isclose(v["book_floor"], 20000.0)
    assert v["summary"]["base"] is not None


def test_valuation_bank_justified_pb_and_matrix() -> None:
    ratio = [
        {"year_report": 2025, "bvps": 26000.0, "roe": 0.20},
        {"year_report": 2024, "bvps": 30000.0, "roe": 0.22},
    ]
    v = valuation_bank(ratio, nim=0.026, cost_of_risk=0.008, roa=0.018, equity_multiplier=10.0,
                       earning_assets_ratio=0.9, loans_ratio=0.6)
    assert v["justified_pb"] is not None and v["fair_value"] is not None
    assert len(v["nim_cor_matrix"]["rows"]) == 3
    assert len(v["nim_cor_matrix"]["rows"][0]["cells"]) == 3


def test_valuation_empty_ratio_graceful() -> None:
    assert valuation_nonbank([])["summary"]["base"] is None

from __future__ import annotations

from app.services.bctc.statements import Period
from app.services.bctc.sector import detect_subsector
from app.services.bctc.subsector import subsector_spotlight


def _p(**v):
    return Period(year=2025, length=5, values=v)


def test_detect_it_services() -> None:
    p = _p(net_fixed_assets=10.0, inventory_gross=2.0, total_assets=100.0)
    assert detect_subsector(p) == "cntt_dichvu"


def test_detect_retail() -> None:
    p = _p(net_fixed_assets=10.0, inventory_gross=30.0, total_assets=100.0)
    assert detect_subsector(p, ccc=-5.0) == "ban_le"


def test_detect_real_estate() -> None:
    p = _p(net_fixed_assets=10.0, inventory_gross=40.0, buyer_prepayments=20.0, total_assets=100.0)
    assert detect_subsector(p) == "bat_dong_san"


def test_detect_utilities() -> None:
    p = _p(net_fixed_assets=70.0, inventory_gross=5.0, total_assets=100.0)
    assert detect_subsector(p) == "tien_ich"


def test_detect_manufacturing_default() -> None:
    p = _p(net_fixed_assets=40.0, inventory_gross=10.0, total_assets=100.0)
    assert detect_subsector(p) == "san_xuat"


def test_detect_no_total_assets_defaults() -> None:
    assert detect_subsector(_p()) == "san_xuat"


def test_spotlight_returns_label_and_metrics() -> None:
    p = _p(net_fixed_assets=10.0, inventory_gross=2.0, total_assets=100.0)
    sp = subsector_spotlight(p, "cntt_dichvu")
    assert sp["label"] == "CNTT / Dịch vụ"
    assert "asset_intensity" in sp["metrics"]
    assert sp["subsector"] == "cntt_dichvu"

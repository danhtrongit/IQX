from __future__ import annotations

from app.services.bctc.assemble import build_bctc_payload


def _mk(year: int, length: int, **v: float) -> dict:
    return {"year_report": year, "length_report": length, **v}


def test_assemble_nonbank_shape() -> None:
    is_rows = [_mk(2025, 5, isa3=200.0, isa20=28.8), _mk(2024, 5, isa3=160.0, isa20=24.0)]
    bs_rows = [_mk(2025, 5, bsa53=1000.0), _mk(2024, 5, bsa53=900.0)]
    cf_rows = [_mk(2025, 5)]
    out = build_bctc_payload(bs_rows, is_rows, cf_rows)
    assert out["template"] == "A"
    assert out["sector"] == "nonbank"
    assert isinstance(out["snapshot"], list) and len(out["snapshot"]) == 6
    rg = next(s for s in out["snapshot"] if s["key"] == "revenue_growth")
    assert abs(rg["value"] - 0.25) < 1e-9
    assert {"green", "red"} <= set(out["forensic"])
    assert isinstance(out["flags"], list)
    assert isinstance(out["modules"], list)


def test_assemble_detects_bank() -> None:
    is_rows = [_mk(2025, 5, isb38=100.0), _mk(2024, 5, isb38=90.0)]
    out = build_bctc_payload([], is_rows, [])
    assert out["template"] == "B"
    assert out["sector"] == "bank"
    assert len(out["snapshot"]) == 6

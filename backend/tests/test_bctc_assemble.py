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


def test_assemble_bank_three_periods_no_nim_does_not_crash() -> None:
    # NIM = None mọi kỳ (earning_assets chưa map ở Phase 1). Với >=3 kỳ, nim_series
    # phải lọc None trước khi vào forensic — nếu không sẽ TypeError.
    is_rows = [_mk(y, 5, isb38=100.0, isb27=70.0) for y in (2025, 2024, 2023)]
    out = build_bctc_payload([], is_rows, [])
    assert out["template"] == "B"
    nim_cell = next(s for s in out["snapshot"] if s["key"] == "nim")
    assert nim_cell["value"] is None and nim_cell["status"] == "na"
    assert {"green", "red"} <= set(out["forensic"])


def test_assemble_includes_dupont_and_trinity_nonbank() -> None:
    is_rows = [_mk(2025, 5, isa3=600.0, isa20=87.0, isa16=100.0, isa11=120.0),
               _mk(2024, 5, isa3=500.0, isa20=70.0, isa16=90.0, isa11=100.0)]
    bs_rows = [_mk(2025, 5, bsa53=720.0, bsa78=400.0), _mk(2024, 5, bsa53=680.0, bsa78=360.0)]
    out = build_bctc_payload(bs_rows, is_rows, [])
    mod_ids = [m["id"] for m in out["modules"]]
    assert "dupont" in mod_ids
    assert "trinity" in out
    assert set(out["trinity"]).issuperset({"altman_z", "piotroski_f", "beneish_m"})


def test_assemble_bank_has_trinity_no_dupont() -> None:
    is_rows = [_mk(2025, 5, isb38=100.0), _mk(2024, 5, isb38=90.0)]
    out = build_bctc_payload([], is_rows, [])
    assert out["template"] == "B"
    assert "dupont" not in [m["id"] for m in out["modules"]]   # bank DuPont deferred
    assert "trinity" in out                                     # trinity present (altman None for bank)
    assert out["trinity"]["altman_z"] is None

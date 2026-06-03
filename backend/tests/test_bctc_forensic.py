from __future__ import annotations

from app.services.bctc.forensic import forensic_panel


def test_nonbank_green_signals() -> None:
    metrics = {
        "template": "A",
        "roe_series": [0.24, 0.21, 0.19],
        "net_debt_ebitda": -0.2,
        "altman_z": 4.21,
        "fcf_margin_series": [0.12, 0.11, 0.10],
        "gross_margin_delta": 0.027,
        "dso_change_2y": 0.10,
    }
    panel = forensic_panel(metrics)
    joined = " ".join(panel["green"])
    assert "ROE" in joined
    assert "Net cash" in joined or "net cash" in joined.lower()
    assert any("Altman" in s for s in panel["green"])


def test_nonbank_red_flags() -> None:
    metrics = {
        "template": "A",
        "roe_series": [0.10],
        "net_debt_ebitda": 3.5,
        "altman_z": 1.5,
        "dso_change_2y": 0.30,
    }
    panel = forensic_panel(metrics)
    joined = " ".join(panel["red"])
    assert "DSO" in joined
    assert any("đòn bẩy" in s.lower() or "net debt" in s.lower() for s in panel["red"])
    assert any("Altman" in s for s in panel["red"])  # z=1.5 <= 1.81


def test_short_series_does_not_fire_3y_green() -> None:
    # roe_series chỉ 2 phần tử -> KHÔNG kích hoạt luật ROE 3 năm.
    panel = forensic_panel({"template": "A", "roe_series": [0.30, 0.25]})
    assert not any("ROE bền vững" in s for s in panel["green"])


def test_no_red_flags_fallback() -> None:
    panel = forensic_panel({"template": "A", "altman_z": 4.0, "net_debt_ebitda": -0.5})
    assert panel["red"] == ["Không có cờ đỏ trọng yếu"]


def test_bank_signals() -> None:
    metrics = {
        "template": "B",
        "nim_series": [0.038, 0.037, 0.036],
        "roe_series": [0.20, 0.19, 0.185],
        "cir": 0.32,
        "ldr": 0.9,
    }
    panel = forensic_panel(metrics)
    assert any("NIM" in s for s in panel["green"])
    assert any("LDR" in s for s in panel["red"])


def test_bank_blind_spots_exported() -> None:
    from app.services.bctc.forensic import BANK_BLIND_SPOTS
    assert any("CASA" in s for s in BANK_BLIND_SPOTS)
    assert any("CAR" in s for s in BANK_BLIND_SPOTS)


def test_bank_forensic_capital_and_llr_green() -> None:
    from app.services.bctc.forensic import forensic_panel
    panel = forensic_panel({"template": "B", "equity_ratio": 0.10, "llr_loans": 0.03,
                            "nim_series": [], "roe_series": []})
    joined = " ".join(panel["green"])
    assert "VCSH" in joined or "Capital" in joined

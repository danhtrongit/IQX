"""B3 benchmark layer — threshold color + radar scoring (sub-sector aware).

``apply_benchmark`` is a PURE function (no network/db): it fills ``peer_median``
for every metric whose key has a sector median, assigns a direction-aware
green/amber/red ``color`` from thresholds, and maps each radar dim to a 0–100
``score`` + ``band``. Sub-sector thresholds override the default set.
"""

from __future__ import annotations

import pytest

from app.services.bctc_dashboard.benchmark import apply_benchmark


# ── tiny builders ────────────────────────────────────────────────────────────
def _one_metric(block: str, key: str, value: float, *, sub_sector: str = "Sản xuất / Công nghiệp") -> dict:
    """Minimal dashboard dict carrying a single block metric (no radar dims)."""
    metric = {"key": key, "label": key, "value": value, "unit": "%", "peer_median": None, "color": None}
    return {
        "template": "A",
        "sub_sector": sub_sector,
        "radar": {"dims": []},
        "blocks": {block: {"metrics": [metric]}},
    }


def _one_dim(key: str, value: float | None, *, sub_sector: str = "Sản xuất / Công nghiệp") -> dict:
    return {
        "template": "A",
        "sub_sector": sub_sector,
        "radar": {"dims": [{"key": key, "label": key, "score": None, "band": None, "value_label": "", "value": value}]},
        "blocks": {},
    }


# ── the brief's canonical test ─────────────────────────────────────────────────
def test_apply_benchmark_colors_and_radar() -> None:
    dim = {"key": "profitability", "label": "Sinh lời", "score": None, "band": None, "value_label": ""}
    roe = {"key": "roe", "label": "ROE", "value": 24.0, "unit": "%", "peer_median": None, "color": None}
    data = {
        "template": "A",
        "sub_sector": "san_xuat",
        "radar": {"dims": [dim]},
        "blocks": {
            "business": {"metrics": [roe], "revenue_series": [], "earnings_quality": {}}
        },
    }
    out = apply_benchmark(data, {"roe": 12.0})
    m = out["blocks"]["business"]["metrics"][0]
    assert m["peer_median"] == 12.0 and m["color"] == "green"  # roe 24 >> peer 12, higher=better
    # radar dim scored from underlying roe metric (fallback lookup) → int
    assert isinstance(out["radar"]["dims"][0]["score"], int)
    assert out["radar"]["dims"][0]["band"] in {"good", "ok", "warn"}


# ── color direction, both ways ─────────────────────────────────────────────────
def test_color_direction_higher_is_better() -> None:
    hi = _one_metric("business", "roe", 0.30)  # >> green 0.18
    assert apply_benchmark(hi, {})["blocks"]["business"]["metrics"][0]["color"] == "green"
    lo = _one_metric("business", "roe", 0.05)  # <= red 0.12
    assert apply_benchmark(lo, {})["blocks"]["business"]["metrics"][0]["color"] == "red"


def test_color_direction_lower_is_better() -> None:
    good = _one_metric("cashflow", "cir", 0.30)  # <= green 0.35 (lower=better)
    assert apply_benchmark(good, {})["blocks"]["cashflow"]["metrics"][0]["color"] == "green"
    bad = _one_metric("cashflow", "cir", 0.60)  # >= red 0.45
    assert apply_benchmark(bad, {})["blocks"]["cashflow"]["metrics"][0]["color"] == "red"


def test_peer_worse_downgrades_green_to_amber() -> None:
    # value clears the absolute green bar but underperforms peers → amber, not green.
    d = _one_metric("business", "roe", 0.19)  # green_min 0.18
    out = apply_benchmark(d, {"roe": 0.40})   # peer far above
    m = out["blocks"]["business"]["metrics"][0]
    assert m["peer_median"] == 0.40 and m["color"] == "amber"


# ── peer_median only when key has a median; absolute color still applies ────────
def test_peer_median_absent_key_leaves_none_but_still_colors() -> None:
    d = _one_metric("business", "gross_margin", 0.30)  # no median for gross_margin
    out = apply_benchmark(d, {"roe": 0.10})
    m = out["blocks"]["business"]["metrics"][0]
    assert m["peer_median"] is None
    assert m["color"] == "green"  # 0.30 >= green 0.25 by absolute threshold


# ── radar score is an int, banded, and clamps to 0..100 ─────────────────────────
def test_radar_score_int_banded_and_clamped() -> None:
    strong = _one_dim("profitability", 5.0)  # absurdly high roe → clamps to 100
    out = apply_benchmark(strong, {})
    dim = out["radar"]["dims"][0]
    assert isinstance(dim["score"], int) and 0 <= dim["score"] <= 100
    assert dim["score"] == 100 and dim["band"] == "good"

    weak = _one_dim("profitability", -1.0)  # deeply negative → clamps to 0
    dim2 = apply_benchmark(weak, {})["radar"]["dims"][0]
    assert dim2["score"] == 0 and dim2["band"] == "warn"


def test_radar_dim_none_value_stays_none() -> None:
    d = _one_dim("profitability", None)
    d["blocks"] = {}  # no fallback metric available either
    out = apply_benchmark(d, {})
    assert out["radar"]["dims"][0]["score"] is None
    assert out["radar"]["dims"][0]["band"] is None


# ── sub-sector adjustment flips a flag ──────────────────────────────────────────
def test_subsector_realestate_relaxes_cashflow_flag() -> None:
    val = -0.2  # negative operating cash coverage
    default = _one_metric("cashflow", "cfo_ni", val, sub_sector="Sản xuất / Công nghiệp")
    assert apply_benchmark(default, {})["blocks"]["cashflow"]["metrics"][0]["color"] == "red"

    realestate = _one_metric("cashflow", "cfo_ni", val, sub_sector="Bất động sản")
    # BĐS: negative cash flow is normal (building projects) → not a red flag
    assert apply_benchmark(realestate, {})["blocks"]["cashflow"]["metrics"][0]["color"] != "red"


# ── valuation block metrics (raw dicts) gain peer_median + color ────────────────
def test_valuation_metric_gets_peer_and_color() -> None:
    data = {
        "template": "A",
        "sub_sector": "san_xuat",
        "radar": {"dims": []},
        "blocks": {
            "valuation": {"metrics": [{"key": "pe", "label": "P/E", "value": 8.0, "peer_median": None}]}
        },
    }
    out = apply_benchmark(data, {"pe": 20.0})
    m = out["blocks"]["valuation"]["metrics"][0]
    assert m["peer_median"] == 20.0
    assert m["color"] == "green"  # pe 8 cheap (lower=better) and below peer 20


# ── compute_dashboard(db=None) leaves B1 behavior unchanged (no benchmarking) ───
@pytest.mark.asyncio
async def test_compute_dashboard_db_none_leaves_peer_and_radar_none() -> None:
    from app.services.bctc_dashboard.compute import compute_dashboard
    from tests.test_bctc_dashboard_compute import _nonbank_ratio, _nonbank_statements, _patched

    p1, p2, p3 = _patched(_nonbank_statements(), _nonbank_ratio(), "Công nghệ thông tin")
    with p1, p2, p3:
        data = await compute_dashboard("FPT", term_type=1, db=None)

    assert data["blocks"]["business"]["metrics"][0]["peer_median"] is None
    assert data["blocks"]["business"]["metrics"][0]["color"] is None
    assert data["radar"]["dims"][0]["score"] is None
    assert data["radar"]["dims"][0]["band"] is None
    assert data["meta"]["peer_count"] == 0
    assert data["meta"]["peer_asof"] is None

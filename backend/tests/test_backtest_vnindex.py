# backend/tests/test_backtest_vnindex.py
from app.services.backtest.service import _attach_vnindex


def test_attach_vnindex_base_100_and_aligned():
    curve = [{"date": "2024-01-02", "strategy": 100.0, "buy_hold": 100.0},
             {"date": "2024-01-03", "strategy": 101.0, "buy_hold": 100.5}]
    vn_dates = ["2024-01-02", "2024-01-03"]
    vn_closes = [1200.0, 1212.0]
    out = _attach_vnindex(curve, vn_dates, vn_closes)
    assert out[0]["vnindex"] == 100.0
    assert round(out[1]["vnindex"], 2) == 101.0   # 1212/1200*100


def test_attach_vnindex_forward_fill_missing_date():
    """When a curve date has no VN-Index bar, forward-fill the previous close."""
    curve = [{"date": "2024-01-02", "strategy": 100.0, "buy_hold": 100.0},
             {"date": "2024-01-03", "strategy": 101.0, "buy_hold": 100.5},
             {"date": "2024-01-04", "strategy": 102.0, "buy_hold": 101.0}]
    # 2024-01-03 is missing from VN-Index (e.g. holiday)
    vn_dates = ["2024-01-02", "2024-01-04"]
    vn_closes = [1200.0, 1224.0]
    out = _attach_vnindex(curve, vn_dates, vn_closes)
    assert out[0]["vnindex"] == 100.0
    # 2024-01-03 → forward-fill from 2024-01-02 close = 1200.0 → still 100.0
    assert out[1]["vnindex"] == 100.0
    # 2024-01-04 → 1224/1200*100 = 102.0
    assert out[2]["vnindex"] == 102.0


def test_attach_vnindex_first_curve_date_missing_uses_first_vn_close():
    """If the first curve date is not in VN dates, use the first vn close as base."""
    curve = [{"date": "2024-01-02", "strategy": 100.0, "buy_hold": 100.0},
             {"date": "2024-01-03", "strategy": 101.0, "buy_hold": 100.5}]
    # VN starts from 2024-01-03
    vn_dates = ["2024-01-03"]
    vn_closes = [1200.0]
    out = _attach_vnindex(curve, vn_dates, vn_closes)
    # 2024-01-02 → no date in map, forward-fill → last_seen=base=1200, vnindex=100.0
    assert out[0]["vnindex"] == 100.0
    assert out[1]["vnindex"] == 100.0


def test_attach_vnindex_empty_vn_returns_curve_unchanged():
    """When there are no VN-Index bars, return curve without adding vnindex key."""
    curve = [{"date": "2024-01-02", "strategy": 100.0, "buy_hold": 100.0}]
    out = _attach_vnindex(curve, [], [])
    assert "vnindex" not in out[0]

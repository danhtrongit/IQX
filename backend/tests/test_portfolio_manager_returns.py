import math
from app.services.ai.portfolio_manager import returns as R


def test_daily_returns_simple():
    result = R.daily_returns([100, 110, 99])
    assert len(result) == 2
    assert math.isclose(result[0], 0.1, rel_tol=1e-9)
    assert math.isclose(result[1], -0.1, rel_tol=1e-9)


def test_beta_perfectly_tracks_market_is_one():
    mkt = [0.01, -0.02, 0.03, -0.01, 0.02]
    asset = [2 * x for x in mkt]          # asset moves 2x market exactly
    assert math.isclose(R.beta(asset, mkt), 2.0, rel_tol=1e-9)


def test_correlation_identical_series_is_one():
    a = [0.01, -0.02, 0.03, -0.01, 0.02]
    assert math.isclose(R.correlation(a, a), 1.0, rel_tol=1e-9)


def test_correlation_anticorrelated_is_minus_one():
    a = [0.01, -0.02, 0.03, -0.01]
    b = [-x for x in a]
    assert math.isclose(R.correlation(a, b), -1.0, rel_tol=1e-9)


def test_max_drawdown_simple():
    # peak 120 then trough 90 → -0.25
    assert math.isclose(R.max_drawdown([100, 120, 90, 110]), -0.25, rel_tol=1e-9)


def test_degenerate_inputs_return_zero():
    assert R.beta([0.0], [0.0]) == 0.0
    assert R.correlation([], []) == 0.0
    assert R.annualized_vol([0.0, 0.0, 0.0]) == 0.0

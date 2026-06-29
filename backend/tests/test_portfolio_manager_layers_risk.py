import math
import datetime as dt
from app.services.ai.portfolio_manager import layers as L
from app.services.ai.portfolio_manager.inputs import Holding, PortfolioInputs


def _series_from_returns(rets, start=100.0):
    closes = [start]
    for r in rets:
        closes.append(closes[-1] * (1 + r))
    return closes


def _confident(closes):
    # pad to ≥120 bars with liquid volume so the confidence gate passes
    pad = 130 - len(closes)
    closes = [closes[0]] * max(pad, 0) + closes
    return closes


def test_risk_excludes_low_confidence_and_computes_beta():
    bench_r = [0.01, -0.02, 0.03, -0.01, 0.02] * 26  # 130 returns
    bench = _series_from_returns(bench_r)
    a_r = [2 * x for x in bench_r]                     # beta 2 asset
    a_closes = _series_from_returns(a_r)
    # volumes must exceed DATA_CONF_MIN_AVG_VALUE_VND / close ≈ 2e9 / 384 = 5.2M; use 6M
    big = Holding("AAA", 100, 1000, 1000, "X", 100_000_000, 0, 100_000_000,
                  closes=a_closes, volumes=[6_000_000.0] * len(a_closes))
    thin = Holding("APG", 100, 1000, 1000, "CK", 8_000_000, 0, 8_000_000,
                   closes=[1000.0] * 30, volumes=[10.0] * 30)  # short history → excluded
    inp = PortfolioInputs(nav=108_000_000, cash=0, holdings=[big, thin],
                          benchmark_closes=bench, sector_weights={}, inception_date=None,
                          trades=[], as_of=dt.date(2026, 6, 23))
    risk, low_conf = L.layer_risk(inp)
    assert low_conf["APG"] is True
    assert low_conf["AAA"] is False
    assert any(e["ticker"] == "APG" for e in risk["excluded"])
    assert math.isclose(risk["beta"], 2.0, abs_tol=0.05)


def test_risk_single_confident_holding_computes_beta():
    bench_r = [0.01, -0.02, 0.03, -0.01, 0.02] * 26   # 130 returns
    bench = _series_from_returns(bench_r)
    a_closes = _series_from_returns([2 * x for x in bench_r])   # beta≈2 asset
    big = Holding("AAA", 100, 1000, 1000, "X", 100_000_000, 0, 100_000_000,
                  closes=a_closes, volumes=[6_000_000.0] * len(a_closes))
    thin = Holding("APG", 100, 1000, 1000, "CK", 8_000_000, 0, 8_000_000,
                   closes=[1000.0] * 30, volumes=[10.0] * 30)   # short history → excluded
    inp = PortfolioInputs(nav=108_000_000, cash=0, holdings=[big, thin],
                          benchmark_closes=bench, sector_weights={}, inception_date=None,
                          trades=[], as_of=dt.date(2026, 6, 23))
    risk, low_conf = L.layer_risk(inp)
    assert low_conf["AAA"] is False and low_conf["APG"] is True
    assert risk["beta"] != 0.0                  # single-asset beta IS computed (≈2), not zeroed
    assert risk["correlation"] == []            # only one confident holding → no pairs

from app.services.ai.portfolio_manager.data_confidence import evaluate_confidence


def _bars(n, close, volume):
    return [{"close": close, "volume": volume} for _ in range(n)]


def test_confident_when_enough_history_and_liquid():
    bars = _bars(130, close=26000.0, volume=1_000_000.0)  # 26e9 traded value
    assert evaluate_confidence(bars) == (True, None)


def test_excluded_when_short_history():
    bars = _bars(40, close=26000.0, volume=1_000_000.0)
    ok, reason = evaluate_confidence(bars)
    assert ok is False
    assert reason == "low_liquidity_short_history"


def test_excluded_when_illiquid():
    bars = _bars(130, close=5000.0, volume=100.0)  # 0.5e6 traded value << 2e9
    ok, reason = evaluate_confidence(bars)
    assert ok is False
    assert reason == "low_liquidity_short_history"


def test_empty_bars_excluded():
    assert evaluate_confidence([]) == (False, "low_liquidity_short_history")

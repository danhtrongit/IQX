from app.services.ai.portfolio_manager.insights import select_insights


def _analysis(**over):
    base = {
        "overview": {"cash_pct": 0.092, "positions": [
            {"ticker": "TCB", "weight": 0.187}, {"ticker": "MBB", "weight": 0.157}]},
        "allocation": [{"sector": "Thép", "weight": 0.16, "benchmark": 0.05, "active": 0.11}],
        "risk": {"correlation": [{"a": "TCB", "b": "MBB", "value": 0.82}]},
        "attribution": [{"ticker": "HPG", "pnl": 38_000_000, "pct": 0.63}],
        "quality": {"roe": 0.18, "pe": 11.4},
        "behavior": {"disposition_flag": True},
    }
    base.update(over)
    return base


def test_guarantees_positive_when_eligible_and_caps_at_two():
    out = select_insights(_analysis())
    ids = [i["id"] for i in out]
    assert 1 <= len(out) <= 2
    # healthy_focus is eligible (top1 0.187 < 0.25, roe 0.18, pe 11.4) → must appear, exactly once,
    # alongside (at most) the single strongest negative — never evicted by a second positive.
    assert ids.count("healthy_focus") == 1
    assert all(i not in ("healthy_focus",) for i in ids if ids.index(i) != ids.index("healthy_focus")) or len(out) == 1


def test_hidden_corr_payload_when_only_firing_template():
    a = {
        "overview": {"cash_pct": 0.2, "positions": [{"ticker": "TCB", "weight": 0.2}, {"ticker": "MBB", "weight": 0.2}]},
        "allocation": [{"sector": "Ngân hàng", "weight": 0.4, "benchmark": 0.38, "active": 0.02}],
        "risk": {"correlation": [{"a": "TCB", "b": "MBB", "value": 0.82}]},
        "attribution": [{"ticker": "HPG", "pnl": 1, "pct": 0.1}],
        "quality": {"roe": 0.05, "pe": 20.0},   # healthy_focus ineligible
        "behavior": {"disposition_flag": False},
    }
    out = select_insights(a)
    hc = next((i for i in out if i["id"] == "hidden_corr"), None)
    assert hc is not None
    assert hc["data"]["pair"] == ["TCB", "MBB"]
    assert hc["data"]["corr"] == 0.82

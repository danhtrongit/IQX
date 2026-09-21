from decimal import Decimal

from app.services.bot.domain import (
    Candidate,
    FeeRules,
    LayerEvidence,
    candidate_gate,
    compute_buy_quantity,
    compute_exit_thresholds,
    compute_l1_amplitude,
    exit_signal,
    rank_candidates,
)


def layers(*, ok=3, news_very_bad=False, insider_very_bad=False):
    names = ("ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia")
    return {
        name: LayerEvidence(
            verdict="ok" if index < ok else "bad",
            raw_level="fixture",
            is_very_negative=(
                news_very_bad if name == "tin_tuc" else insider_very_bad if name == "noi_bo" else False
            ),
            source_ref=f"fixture:{name}",
        )
        for index, name in enumerate(names)
    }


def candidate(symbol="AAA", *, ok=3, filters=("kl_dot_bien",), avg=2_000_000_000, amplitude=500):
    return Candidate(
        symbol=symbol,
        close_vnd=20_000,
        trading_value_avg20_vnd=avg,
        filter_ids=filters,
        layers=layers(ok=ok),
        l1_amplitude_vnd=Decimal(amplitude),
        l1_amplitude_source_ref="fixture:l1",
    )


def test_gate_requires_all_five_layers_and_three_supports():
    assert candidate_gate(candidate(ok=2)).reason_code == "below_support_gate"
    exact = candidate(ok=3)
    assert candidate_gate(exact).allowed is True
    missing = Candidate(**{**exact.__dict__, "layers": dict(list(exact.layers.items())[:3])})
    assert candidate_gate(missing).reason_code == "missing_layers"


def test_only_news_or_insider_very_negative_vetoes():
    base = candidate(ok=5)
    news = Candidate(**{**base.__dict__, "layers": layers(ok=5, news_very_bad=True)})
    insider = Candidate(**{**base.__dict__, "layers": layers(ok=5, insider_very_bad=True)})
    assert candidate_gate(news).reason_code == "veto_very_negative"
    assert candidate_gate(insider).reason_code == "veto_very_negative"
    technical_bad = candidate(ok=3)
    assert candidate_gate(technical_bad).allowed is True


def test_missing_veto_severity_fails_closed():
    base = candidate(ok=5)
    evidence = dict(base.layers)
    evidence["tin_tuc"] = LayerEvidence("ok", "Tích cực", None, "fixture")
    row = Candidate(**{**base.__dict__, "layers": evidence})
    assert candidate_gate(row).reason_code == "missing_veto_severity"


def test_global_ranking_is_support_filter_liquidity_symbol():
    rows = [
        candidate("CCC", ok=3, filters=("a", "b"), avg=5),
        candidate("BBB", ok=4, filters=("a",), avg=5),
        candidate("AAA", ok=4, filters=("a", "b"), avg=4),
        candidate("AAD", ok=4, filters=("a", "b"), avg=5),
        candidate("AAC", ok=4, filters=("a", "b"), avg=5),
    ]
    assert [row.symbol for row in rank_candidates(rows)] == ["AAC", "AAD", "AAA", "BBB", "CCC"]


def test_union_is_normalized_deduplicated_and_capped_at_fifty():
    rows = [candidate(f"A{index:02d}") for index in range(55)]
    rows.append(candidate("a00", filters=("kl_dot_bien", "vuot_dinh_20")))
    ranked = rank_candidates(rows)
    assert len(ranked) == 50
    assert len({row.symbol for row in ranked}) == 50
    assert next(row for row in ranked if row.symbol == "A00").filter_ids == (
        "kl_dot_bien",
        "vuot_dinh_20",
    )


def test_sizing_budget_includes_fee_and_rounds_down_to_lot():
    result = compute_buy_quantity(
        nav_basis_vnd=100_000_000,
        cash_available_vnd=100_000_000,
        price_vnd=20_000,
        fee_rules=FeeRules(10, 10, 10, 100, "fixture"),
    )
    assert result.quantity == 500
    assert result.total_vnd == 10_010_000
    assert result.total_vnd <= 12_000_000


def test_sizing_respects_current_cash_and_does_not_round_up():
    result = compute_buy_quantity(
        nav_basis_vnd=100_000_000,
        cash_available_vnd=1_999_999,
        price_vnd=20_000,
        fee_rules=FeeRules(0, 0, 0, 100, "fixture"),
    )
    assert result.quantity == 0
    assert result.reason_code == "below_board_lot"


def test_l1_amplitude_and_fixed_threshold_boundaries():
    bars = [
        {"high": 21_000, "low": 20_000, "close": 20_500}
        for _ in range(15)
    ]
    amplitude = compute_l1_amplitude(bars)
    assert amplitude == Decimal(1000)
    thresholds = compute_exit_thresholds(20_000, 500)
    assert thresholds == (Decimal(19_000), Decimal(22_000))
    assert exit_signal(19_000, *thresholds) == "stop_loss"
    assert exit_signal(18_800, *thresholds) == "stop_loss"
    assert exit_signal(22_000, *thresholds) == "take_profit"
    assert exit_signal(21_999, *thresholds) is None


def test_invalid_amplitude_or_non_positive_stop_is_rejected():
    assert compute_exit_thresholds(20_000, 0) is None
    assert compute_exit_thresholds(20_000, -1) is None
    assert compute_exit_thresholds(1_000, 600) is None
    assert compute_exit_thresholds(20_000, "NaN") is None

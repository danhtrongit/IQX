from app.services.ai.portfolio_manager import scoring as S


def test_pillars_match_sample():
    pillars = S.score_pillars(
        performance={"excess_return": 0.035},
        risk={"beta": 1.25},
        concentration={"effective_n": 5.8},
        quality={"roe": 0.18, "pe": 11.4},
        behavior={"disposition_flag": True, "losing_count": 3},
        max_corr=0.82,
    )
    assert pillars == {"performance": 4, "risk": 3, "diversification": 3, "quality": 4, "discipline": 2}


def test_overall_is_mean_rounded_1dp():
    assert S.overall_score({"performance": 4, "risk": 3, "diversification": 3, "quality": 4, "discipline": 2}) == 3.2
    assert S.overall_score({"performance": 4, "risk": 4, "diversification": 3, "quality": 4, "discipline": 2}) == 3.4

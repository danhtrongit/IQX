from app.services.ai.portfolio_manager import config


def test_config_constants_match_spec():
    assert config.RISK_LOOKBACK_DAYS == 120
    assert config.DATA_CONF_MIN_HISTORY == 120
    assert config.DATA_CONF_MIN_AVG_VALUE_VND == 2_000_000_000
    assert config.SECTOR_BENCH_THRESHOLD == 0.25
    assert config.CHANGED_WEIGHT_THRESHOLD == 0.03
    assert config.HIDDEN_CORR_MIN == 0.75
    assert config.PROFIT_CONCENTRATION_MIN == 0.60
    assert config.SECTOR_TILT_RATIO_MIN == 3.0
    assert config.CASH_DRY_MAX == 0.05
    assert config.LLM_TEMPERATURE == 0.5
    assert config.ANNUALIZE_FACTOR == 252
    assert config.MIN_POSITIONS_FOR_ANALYSIS == 2

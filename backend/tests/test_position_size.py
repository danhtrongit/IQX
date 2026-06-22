from app.services.backtest.engine import _position_fraction


def test_position_fractions():
    assert _position_fraction("all") == 1.0
    assert _position_fraction("half") == 0.5
    assert _position_fraction("quarter") == 0.25
    assert _position_fraction("tenth") == 0.10

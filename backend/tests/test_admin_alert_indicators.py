from app.services.ta.display_names import INDICATOR_DISPLAY, INDICATOR_KIND


def test_indicator_payload_builder():
    from app.api.v1.endpoints.admin_alerts import _indicator_options
    opts = _indicator_options()
    assert len(opts) == 38
    assert {"id": "rsi_14", "label": "RSI 14", "kind": "num"} in opts

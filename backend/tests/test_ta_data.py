"""Tests for the adjusted-OHLCV normalization + start_index (spec §3 data.py).

Regression: VCI returns ``time`` as a **string epoch** ("1415145600"); these must
be converted to ISO dates, else start_index lexicographically mis-compares and the
backtest reports 0 sessions.
"""

from __future__ import annotations

import app.services.ta.data as data_mod
from app.services.ta.data import _normalize, get_adjusted_ohlcv


def test_normalize_handles_string_epoch():
    out = _normalize([{"time": "1415145600", "open": 1, "high": 1, "low": 1, "close": 7541.83, "volume": 100}])
    assert out[0]["time"] == "2014-11-05"


def test_normalize_handles_int_epoch():
    out = _normalize([{"time": 1415145600, "open": 1, "high": 1, "low": 1, "close": 10.0, "volume": 0}])
    assert out[0]["time"] == "2014-11-05"


def test_normalize_keeps_iso_string():
    out = _normalize([{"time": "2020-03-15", "open": 1, "high": 1, "low": 1, "close": 10.0, "volume": 0}])
    assert out[0]["time"] == "2020-03-15"


def test_normalize_drops_nonpositive_and_sorts_dedups():
    recs = [
        {"time": "2021-01-02", "close": 12.0},
        {"time": "2021-01-01", "close": 10.0},
        {"time": "2021-01-03", "close": 0.0},  # dropped (close<=0)
        {"time": "2021-01-01", "close": 11.0},  # dup → last wins
    ]
    out = _normalize(recs)
    assert [r["time"] for r in out] == ["2021-01-01", "2021-01-02"]
    assert out[0]["close"] == 11.0


async def test_start_index_with_string_epochs(monkeypatch):
    # Full path: raw VCI-shape STRING epochs → _fetch_records → _normalize → ISO.
    # 2019-06-01, 2020-06-01, 2021-06-01.
    epochs = ["1559347200", "1590969600", "1622505600"]

    class FakeResp:
        def __init__(self, data):
            self.data = data

    async def fake_fwf(sources, **kw):  # noqa: ANN001
        return FakeResp(
            [
                {"time": e, "open": 10, "high": 11, "low": 9, "close": 10.0 + i, "volume": 1000}
                for i, e in enumerate(epochs)
            ]
        )

    monkeypatch.setattr(data_mod, "fetch_with_fallback", fake_fwf)
    data, start_index = await get_adjusted_ohlcv("FPT", "2020-01-01", "2026-06-17", use_cache=False)
    assert len(data) == 3
    # first bar >= 2020-01-01 is the 2020-06-01 bar (index 1)
    assert start_index == 1
    assert len(data) - start_index == 2
    assert data.time[0].startswith("2019-")

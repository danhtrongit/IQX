from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.services.ai.analysis_service import _analysis_cache_key, _build_raw_input
from app.services.journey_identity.datasets import snapshot

VN_TZ = timezone(timedelta(hours=7))
NOW = datetime(2026, 9, 21, 12, tzinfo=VN_TZ)


def _snapshot_for(*bars: object, updated_at: str = "2099-01-01T00:00:00Z") -> dict:
    return snapshot(
        {
            "symbol": "VNM",
            "updatedAt": updated_at,
            "rawInput": {"trend": {"ohlcv": list(bars)}},
        },
        None,
        NOW,
        symbol="VNM",
    )


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("date", "2026-09-18", "2026-09-18"),
        ("tradingDate", "2026-09-19", "2026-09-19"),
        ("t", int(datetime(2026, 9, 20, 8, tzinfo=UTC).timestamp()), "2026-09-20"),
        ("time", str(int(datetime(2026, 9, 20, 8, tzinfo=UTC).timestamp()) * 1000), "2026-09-20"),
    ],
)
def test_snapshot_accepts_canonical_ohlcv_session_fields(field: str, value: object, expected: str) -> None:
    assert _snapshot_for({field: value})["trading_date"] == expected


@pytest.mark.parametrize("milliseconds", [False, True])
def test_snapshot_converts_unix_seconds_and_milliseconds_to_vietnam_session(milliseconds: bool) -> None:
    # 18:00 UTC is already the next exchange-calendar day in Vietnam.
    timestamp = int(datetime(2026, 9, 20, 18, tzinfo=UTC).timestamp())
    value = timestamp * 1000 if milliseconds else timestamp

    assert _snapshot_for({"time": value})["trading_date"] == "2026-09-21"


def test_snapshot_uses_latest_non_future_source_session() -> None:
    payload = _snapshot_for(
        {"date": "2026-09-18"},
        {"tradingDate": "2026-09-20"},
        {"time": int(datetime(2026, 9, 22, tzinfo=UTC).timestamp())},
    )

    assert payload["trading_date"] == "2026-09-20"


@pytest.mark.parametrize(
    "bars",
    [
        (),
        (None, "bad", {}),
        ({"date": "not-a-session", "time": float("nan")},),
        ({"time": 10**10_000},),
        ({"date": "2026-09-22"},),
        ({"time": int(datetime(2026, 9, 22, tzinfo=UTC).timestamp())},),
    ],
)
def test_snapshot_does_not_invent_session_when_source_is_missing_or_future(bars: tuple[object, ...]) -> None:
    # updatedAt is intentionally present and usable-looking: it is mutable
    # analysis metadata, not immutable market-session evidence.
    assert _snapshot_for(*bars, updated_at="2026-09-21T05:00:00Z")["trading_date"] is None


def test_canonical_ai_payload_time_reaches_snapshot_session() -> None:
    timestamp = int(datetime(2026, 9, 20, 18, tzinfo=UTC).timestamp())
    raw_input = _build_raw_input(
        {
            "ohlcv_30": [
                {
                    "time": timestamp,
                    "open": 100,
                    "high": 110,
                    "low": 90,
                    "close": 105,
                    "volume": 1_000,
                }
            ]
        }
    )

    payload = snapshot(
        {"symbol": "VNM", "rawInput": raw_input},
        None,
        NOW,
        symbol="VNM",
    )

    assert raw_input["trend"]["ohlcv"][0]["date"] == timestamp
    assert payload["trading_date"] == "2026-09-21"


def test_only_insight_cache_key_is_bumped_for_source_time_schema() -> None:
    assert _analysis_cache_key("insight", "VNM", "vi") == ("iqx:ai:analysis:insight:VNM:vi:source-time-v2")
    assert _analysis_cache_key("dashboard", "all", "vi") == "iqx:ai:analysis:dashboard:all:vi"
    assert _analysis_cache_key("industry", "10", "vi") == "iqx:ai:analysis:industry:10:vi"
    assert _analysis_cache_key("bctc", "VNM:year", "vi") == "iqx:ai:analysis:bctc:VNM:year:vi"

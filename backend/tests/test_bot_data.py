from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.bot import data
from app.services.cap5.hunt import FILTER_SPECS, HuntBar, HuntResult


def test_insight_sessions_accepts_vietcap_time_and_milliseconds() -> None:
    session = date(2026, 9, 15)
    timestamp = int(datetime(2026, 9, 15, tzinfo=UTC).timestamp())
    payload = {
        "rawInput": {
            "trend": {
                "ohlcv": [
                    {"time": timestamp},
                    {"t": str(timestamp * 1000)},
                    {"date": "not-a-date"},
                ]
            }
        }
    }

    assert data._insight_sessions(payload) == {session}


def test_canonical_l1_requires_explicit_value_source_and_exact_session() -> None:
    session = date(2026, 9, 15)
    ohlcv_only = {
        "rawInput": {"trend": {"ohlcv": [{"high": 21_000, "low": 20_000, "close": 20_500} for _ in range(20)]}}
    }
    assert data._canonical_l1(ohlcv_only, session) == (None, None)
    assert data._canonical_l1(
        {
            "l1_amplitude_vnd": "850",
            "l1_amplitude_source_ref": "iqx-l1:AAA:2026-09-15:v1",
            "l1_as_of_session": "2026-09-14",
        },
        session,
    ) == (None, None)
    assert data._canonical_l1(
        {
            "l1_amplitude_vnd": "850",
            "l1_amplitude_source_ref": "iqx-l1:AAA:2026-09-15:v1",
            "l1_as_of_session": "2026-09-15",
        },
        session,
    ) == ("850", "iqx-l1:AAA:2026-09-15:v1")


@pytest.mark.asyncio
async def test_analysis_serializes_shared_session_and_does_not_recompute_l1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = date(2026, 9, 15)
    running_insight = False

    async def analyze_insight(*, symbol: str) -> dict:
        nonlocal running_insight
        assert symbol == "AAA"
        running_insight = True
        await asyncio.sleep(0)
        running_insight = False
        return {
            "updatedAt": "2026-09-15T12:00:00Z",
            "rawInput": {
                "trend": {
                    "ohlcv": [
                        {
                            "time": int(datetime(2026, 9, 15, tzinfo=UTC).timestamp()),
                            "high": 21_000,
                            "low": 20_000,
                            "close": 20_500,
                        }
                    ]
                }
            },
            "layers": {
                "L1": {"statusLabel": "Mạnh"},
                "L3": {"statusLabel": "Hỗ trợ mạnh"},
                "L4": {"statusLabel": "Trung tính"},
                "L5": {"statusLabel": "Tích cực"},
            },
        }

    async def compute_dashboard(symbol: str, *, db: object) -> dict:
        assert symbol == "AAA"
        assert db is db_sentinel
        assert running_insight is False
        return {"blocks": {"valuation": {}}, "meta": {"source": "fixture"}}

    db_sentinel = object()
    monkeypatch.setattr("app.services.ai.analysis_service.analyze_insight", analyze_insight)
    monkeypatch.setattr("app.services.bctc_dashboard.compute.compute_dashboard", compute_dashboard)
    provider = data.LiveBotSnapshotProvider(db_sentinel)  # type: ignore[arg-type]

    result = await provider._analysis("AAA", session)

    assert result.get("error") is None
    assert result["l1_amplitude_vnd"] is None
    assert result["l1_amplitude_source_ref"] is None
    assert result["source_refs"]["l1_amplitude"]["available"] is False
    assert result["source_refs"]["insight"]["hash"]


@pytest.mark.asyncio
async def test_historical_default_security_status_fails_closed_without_live_lookup() -> None:
    source = SimpleNamespace(restricted_symbols=AsyncMock(return_value=set()))
    provider = data.LiveBotSnapshotProvider(object())  # type: ignore[arg-type]

    statuses, restricted, source_ref = await provider._security_statuses(
        source,
        ["AAA"],
        date(2020, 1, 2),  # type: ignore[arg-type]
    )

    assert statuses == {}
    assert restricted is None
    assert source_ref["error"] == "historical_status_not_supported"
    source.restricted_symbols.assert_not_awaited()


@pytest.mark.asyncio
async def test_injected_status_resolver_is_preserved_for_historical_fixture() -> None:
    resolver = AsyncMock(return_value={"AAA": "normal", "BAD": "warning"})
    provider = data.LiveBotSnapshotProvider(  # type: ignore[arg-type]
        object(), security_status_resolver=resolver
    )
    session = date(2020, 1, 2)

    statuses, restricted, source_ref = await provider._security_statuses(
        SimpleNamespace(),
        ["AAA", "BAD"],
        session,  # type: ignore[arg-type]
    )

    resolver.assert_awaited_once_with(["AAA", "BAD"], session)
    assert statuses == {"AAA": "normal", "BAD": "warning"}
    assert restricted == {"BAD"}
    assert source_ref["provider"] == "injected"
    assert source_ref["hash"]


@pytest.mark.asyncio
async def test_snapshot_reuses_hose_status_before_filters_and_never_promotes_adjusted_close(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    session = datetime.now(data._VN_TZ).date()

    class FakeSource:
        def __init__(self, *, use_cache: bool, today: date) -> None:
            assert use_cache is False
            assert today == session

        async def restricted_symbols(self) -> set[str]:
            events.append("status")
            return {"BAD"}

        async def daily_bars(self, symbols, *, so_nen):  # noqa: ANN001, ANN201
            assert so_nen > 20
            return {
                symbol: [
                    HuntBar(
                        ngay=session.isoformat(),
                        close=20_000,
                        volume=1_000,
                        gtgd_vnd=2_000_000_000,
                    )
                    for _ in range(20)
                ]
                for symbol in symbols
            }

        async def net_flow(self, symbols, *, ben, so_phien):  # noqa: ANN001, ANN201
            raise AssertionError((symbols, ben, so_phien))

    class FakeEngine:
        def __init__(self, source) -> None:  # noqa: ANN001
            self.source = source

        async def run(self, source_id: str, universe: list[str]) -> HuntResult:
            events.append(f"filter:{source_id}")
            assert await self.source.restricted_symbols() == {"BAD"}
            assert universe == ["AAA", "BAD"]
            spec = FILTER_SPECS[source_id]
            return HuntResult(
                bo_loc=spec,
                trang_thai="ok",
                ly_do_thieu_du_lieu=None,
                so_ma_thoa=1,
                so_ma_trong_ro=2,
                so_ma_xet=1,
                so_ma_truot_loc_san=1,
                so_ma_bo_qua_thieu_du_lieu=0,
                ket_qua_day_du=True,
                canh_bao_thieu_du_lieu=None,
                items=[{"symbol": "AAA"}],
            )

    monkeypatch.setattr(data, "LiveHuntDataSource", FakeSource)
    monkeypatch.setattr(data, "HuntEngine", FakeEngine)
    provider = data.LiveBotSnapshotProvider(object(), use_cache=False)  # type: ignore[arg-type]
    provider._universe = AsyncMock(return_value=["AAA", "BAD"])  # type: ignore[method-assign]
    provider._fee_rules = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "buy_fee_rate_bps": 10,
            "sell_fee_rate_bps": 10,
            "sell_tax_rate_bps": 10,
            "board_lot_size": 100,
            "source_ref": "fixture:fees",
        }
    )
    provider._analysis = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "layers": {
                key: {
                    "verdict": "ok",
                    "raw_level": "fixture",
                    "is_very_negative": False,
                    "source_ref": "fixture:layer",
                }
                for key in ("ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia")
            },
            "l1_amplitude_vnd": "850",
            "l1_amplitude_source_ref": "fixture:l1",
            "source_refs": {"insight": {"hash": "abc"}},
        }
    )

    snapshot = await provider.build_snapshot(session, open_symbols=["AAA"])

    assert events[0] == "status"
    assert events.count("status") == 1
    assert snapshot["symbols"]["AAA"]["security_status"] == "normal"
    assert snapshot["symbols"]["BAD"]["security_status"] == "restricted"
    assert snapshot["symbols"]["AAA"]["close_vnd"] is None
    assert snapshot["symbols"]["AAA"]["close_is_official"] is False
    adjusted_ref = snapshot["symbols"]["AAA"]["source_refs"]["hunt_adjusted_close"]
    assert adjusted_ref["value_vnd"] == 20_000
    assert adjusted_ref["research_only"] is True
    assert snapshot["close_is_official"] is False
    assert snapshot["buy_inputs_complete"] is False
    assert any(issue["code"] == "missing_official_close" for issue in snapshot["issues"])
    assert snapshot["source_refs"]["security_status"]["hash"]
    assert snapshot["source_refs"]["hunt_filters"]["hash"]
    assert snapshot["snapshot_hash"]

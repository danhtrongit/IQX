"""Focused tests for the server-owned Cấp 4 analysis blocks ⑩/⑪."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.cap4.analysis import Cap4AnalysisService, _khoi_10, _khoi_11


def _pair(*, consensus: int | None, different: int | None, pnl: float):
    plan = SimpleNamespace(
        so_lop_dong_thuan=consensus,
        so_lop_khac_ai=different,
    )
    result = SimpleNamespace(pnl_pct=pnl)
    return plan, result


def test_khoi_10_groups_real_outcomes_and_excludes_missing_ai() -> None:
    pairs = [
        *[_pair(consensus=5, different=0, pnl=8) for _ in range(3)],
        *[_pair(consensus=1, different=1, pnl=-4) for _ in range(3)],
        _pair(consensus=3, different=1, pnl=2),
        _pair(consensus=None, different=None, pnl=6),
    ]

    out = _khoi_10(pairs)
    rows = {row["band"]: row for row in out["rows"]}
    assert rows["cao"] == {
        "band": "cao",
        "label": "4-5 lớp ủng hộ",
        "count": 3,
        "wins": 3,
        "win_rate": 100,
        "insufficient": False,
    }
    assert rows["thap"]["win_rate"] == 0
    assert rows["vua"]["insufficient"] is True
    assert out["total_trades"] == 7
    assert out["excluded_no_ai"] == 1
    assert out["hieu_qua"] is True
    assert "3/3" in out["phat_hien"]


def test_khoi_10_does_not_conclude_from_thin_groups() -> None:
    out = _khoi_10([_pair(consensus=5, different=1, pnl=5)])
    assert out["hieu_qua"] is None
    assert out["phat_hien"] is None
    assert "ít nhất 3 lệnh" in out["insufficient_note"]


def test_khoi_11_counts_per_order_and_waits_for_five_examples() -> None:
    thin = _khoi_11(
        [
            _pair(consensus=4, different=3, pnl=2),
            _pair(consensus=4, different=1, pnl=-1),
            _pair(consensus=4, different=0, pnl=9),
        ]
    )
    assert thin["so_lan_khac_ai"] == 2
    assert thin["so_lan_ban_dung"] == 1
    assert thin["so_lan_ai_dung"] == 1
    assert thin["phat_hien"] is None

    enough = _khoi_11(
        [
            *[_pair(consensus=4, different=2, pnl=3) for _ in range(3)],
            *[_pair(consensus=2, different=1, pnl=-2) for _ in range(2)],
        ]
    )
    assert enough["so_lan_khac_ai"] == 5
    assert enough["so_lan_ban_dung"] == 3
    assert enough["so_lan_ai_dung"] == 2
    assert "đang có cơ sở" in enough["phat_hien"]


def test_khoi_11_does_not_call_break_even_ai_right() -> None:
    out = _khoi_11(
        [
            _pair(consensus=2, different=1, pnl=0),
            _pair(consensus=2, different=1, pnl=-0.1),
        ]
    )
    assert out["so_lan_khac_ai"] == 1
    assert out["so_lan_ban_dung"] == 0
    assert out["so_lan_ai_dung"] == 1


@pytest.mark.asyncio
async def test_get_records_phantich_view_with_stable_dedup_key(monkeypatch) -> None:
    session = AsyncMock()
    service = Cap4AnalysisService(session)
    progress = SimpleNamespace(id=uuid.uuid4())
    service._cap4.get_progress = AsyncMock(return_value=progress)
    service._cap4._closed_pairs = AsyncMock(return_value=[])

    recorder = AsyncMock()
    monkeypatch.setattr("app.services.cap4.analysis.record_journey_event", recorder)
    user_id = uuid.uuid4()

    await service.get(user_id)
    await service.get(user_id)

    assert recorder.await_count == 2
    first, retry = recorder.await_args_list
    assert first.args[2] == "cap4_phantich_view"
    assert first.kwargs["dedup_key"] == f"progress:{progress.id}"
    assert retry.kwargs["dedup_key"] == first.kwargs["dedup_key"]

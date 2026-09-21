"""The fifth layer comes from frozen BCTC evidence, never AI Insight L2."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.models.ai_insight_history import AIInsightHistory
from app.models.journey_identity import JourneyReadingDataset
from app.services.cap5.consensus import InsightConsensusSource, cham_tu_payload
from app.services.cap6.mau_thuan import MauThuanSource, doc_tu_payload
from app.services.journey_identity.classification import digest
from app.services.valuation_reading import JourneyValuationSource, read_valuation


def _valuation(*, price: float, median: float = 100.0) -> dict:
    return {
        "current_price": price,
        "fair_median": median,
        "methods": [
            {"name": "A", "bear": 80.0, "base": median, "bull": 120.0},
            {"name": "B", "bear": 85.0, "base": median, "bull": 115.0},
        ],
    }


def _dataset_payload(symbol: str, valuation: dict, *, verdict: str) -> dict:
    return {
        "symbol": symbol,
        "source_symbol": symbol,
        "valuation_source_symbol": symbol,
        "trading_date": date.today().isoformat(),
        "price": valuation["current_price"],
        "ai_answers": {"dinh_gia": verdict},
        "source_snapshot": {"insight": {}, "valuation": valuation},
    }


def test_bctc_valuation_mapping_preserves_bounds_and_never_guesses_missing_data():
    assert read_valuation(_valuation(price=79)).rank == 5
    assert read_valuation(_valuation(price=94)).rank == 4
    assert read_valuation(_valuation(price=100)).rank == 3
    assert read_valuation(_valuation(price=106)).rank == 2
    assert read_valuation(_valuation(price=121)).rank == 1
    assert read_valuation({"fair_median": 100, "current_price": None}) is None
    assert read_valuation({"fair_median": 0, "current_price": 90}) is None


def test_cap5_counts_bctc_as_real_fifth_layer_without_mapping_l2():
    valuation = read_valuation(_valuation(price=79))
    result = cham_tu_payload(
        {
            "L1": {"statusLabel": "Rất mạnh"},
            "L2": {"statusLabel": "Rất mạnh"},
            "L3": {"statusLabel": "Hỗ trợ mạnh"},
            "L4": {"statusLabel": "Hỗ trợ nhẹ"},
            "L5": {"statusLabel": "Tích cực"},
        },
        valuation=valuation,
    )
    assert (result.diem, result.so_lop_da_cham, result.status) == (5, 5, "notable")
    detail = {row["lop"]: row for row in result.lop}
    assert detail["dinh_gia"]["muc"] == "ok"
    assert detail["dinh_gia"]["nhan"] == "Thấp hơn vùng giá trị"
    assert detail["dinh_gia"]["giai_thich"].startswith("BCTC Khối 02:")


def test_cap6_places_expensive_valuation_in_opposing_side_without_veto_power():
    result = doc_tu_payload(
        {"L1": {"statusLabel": "Mạnh"}, "L2": {"statusLabel": "Rất mạnh"}},
        valuation=read_valuation(_valuation(price=121)),
    )
    assert result.co_mau_thuan is True
    assert result.so_lop_da_cham == 2
    assert [row["lop"] for row in result.ung_ho] == ["ky_thuat"]
    assert result.nguoc == [
        {
            "lop": "dinh_gia",
            "ten": "Định giá",
            "nhan": "Vượt vùng giá trị",
            "bac": 1,
            "la_phu_quyet": False,
        }
    ]
    assert result.phu_quyet_kich_hoat is False


@pytest.mark.asyncio
async def test_consensus_reads_frozen_valuation_in_one_batch_and_rejects_corruption(db_session, test_user):
    valuation = _valuation(price=79)
    good = _dataset_payload("GOOD", valuation, verdict="ok")
    corrupt = _dataset_payload("BAD", valuation, verdict="ok")
    db_session.add_all(
        [
            JourneyReadingDataset(
                user_id=test_user.id,
                symbol="GOOD",
                trading_date=date.today(),
                created_at=datetime.now(UTC),
                payload=good,
                dataset_hash=digest(good),
            ),
            JourneyReadingDataset(
                user_id=test_user.id,
                symbol="BAD",
                trading_date=date.today(),
                created_at=datetime.now(UTC),
                payload=corrupt,
                dataset_hash="corrupt",
            ),
            AIInsightHistory(
                symbol="GOOD",
                session_date=date.today(),
                payload={
                    "L1": {"statusLabel": "Rất mạnh"},
                    "L3": {"statusLabel": "Hỗ trợ mạnh"},
                    "L4": {"statusLabel": "Hỗ trợ mạnh"},
                    "L5": {"statusLabel": "Rất tích cực"},
                },
            ),
        ]
    )
    await db_session.flush()

    source = JourneyValuationSource(db_session)
    readings = await source.latest_many(["GOOD", "BAD"], earliest=date.today())
    assert set(readings) == {"GOOD"}
    assert readings["GOOD"].source_ref.startswith("journey_reading_dataset:")

    result = (await InsightConsensusSource(db_session).cham_nhieu(["GOOD"]))["GOOD"]
    assert (result.diem, result.so_lop_da_cham) == (5, 5)
    detail = {row["lop"]: row for row in result.lop}["dinh_gia"]
    assert detail["source_date"] == date.today()
    assert detail["nguon"].startswith("journey_reading_dataset:")

    conflict = await MauThuanSource(db_session).doc("GOOD")
    assert conflict.so_lop_da_cham == 5
    assert [row["lop"] for row in conflict.ung_ho] == [
        "ky_thuat",
        "dong_tien",
        "noi_bo",
        "tin_tuc",
        "dinh_gia",
    ]

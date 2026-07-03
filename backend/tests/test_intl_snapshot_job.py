# backend/tests/test_intl_snapshot_job.py
from unittest.mock import AsyncMock, patch
import pytest
from app.services.jobs import intl_snapshot_job as J

@pytest.mark.asyncio
async def test_skips_non_trading_day():
    with patch.object(J, "is_trading_day", return_value=False):
        res = await J.run_intl_snapshot_job(wave=1, session=object())
    assert res["skipped"] == "not_trading_day"

@pytest.mark.asyncio
async def test_wave2_fetches_wave2_symbols_and_persists(db_session):
    with patch.object(J, "is_trading_day", return_value=True), \
         patch.object(J, "fetch_many", new=AsyncMock(return_value={})) as fm, \
         patch.object(J, "persist_snapshot_rows", new=AsyncMock(return_value={"upserted": 0, "stale_copied": 0, "missing": []})) as pr:
        await J.run_intl_snapshot_job(wave=2, session=db_session)
    from app.services.market_data.intl_symbols import WAVE2_SYMBOLS
    requested = fm.call_args.args[0]
    assert set(requested) == set(s for s in WAVE2_SYMBOLS if s not in ("BTC-USD", "ETH-USD"))
    assert pr.await_count == 1

@pytest.mark.asyncio
async def test_alert_logged_when_critical_missing(db_session, caplog):
    with patch.object(J, "is_trading_day", return_value=True), \
         patch.object(J, "fetch_many", new=AsyncMock(return_value={})), \
         patch.object(J, "persist_snapshot_rows", new=AsyncMock(return_value={"upserted": 0, "stale_copied": 0, "missing": ["^GSPC"]})):
        with caplog.at_level("ERROR"):
            await J.run_intl_snapshot_job(wave=1, session=db_session)
    assert any("critical" in r.message.lower() or "^GSPC" in r.message for r in caplog.records)

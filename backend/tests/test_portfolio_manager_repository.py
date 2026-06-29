import datetime as dt
import uuid
import pytest
from app.models.portfolio_report import PortfolioReport
from app.repositories.portfolio_manager import PortfolioReportRepository


@pytest.mark.asyncio
async def test_get_for_date_and_latest(db_session):
    repo = PortfolioReportRepository(db_session)
    acct = uuid.uuid4()
    await repo.insert(PortfolioReport(account_id=acct, session_date=dt.date(2026, 6, 20),
                                      period_number=1, mode="first", analysis_json={}, valid=True))
    await repo.insert(PortfolioReport(account_id=acct, session_date=dt.date(2026, 6, 23),
                                      period_number=2, mode="full_changed", analysis_json={}, valid=True))
    assert (await repo.get_for_date(acct, dt.date(2026, 6, 23))).period_number == 2
    assert (await repo.get_latest(acct)).session_date == dt.date(2026, 6, 23)
    assert await repo.count_for_account(acct) == 2

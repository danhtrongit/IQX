import datetime as dt
import uuid
import pytest
from sqlalchemy import select
from app.models.portfolio_report import PortfolioReport


@pytest.mark.asyncio
async def test_portfolio_report_persists(db_session):
    row = PortfolioReport(
        account_id=uuid.uuid4(), session_date=dt.date(2026, 6, 23),
        period_number=1, mode="first", analysis_json={"overview": {}},
        narrative_json=None, scores={"overall": 3.5}, valid=True,
    )
    db_session.add(row)
    await db_session.flush()
    found = (await db_session.execute(select(PortfolioReport))).scalar_one()
    assert found.mode == "first"
    assert found.analysis_json == {"overview": {}}

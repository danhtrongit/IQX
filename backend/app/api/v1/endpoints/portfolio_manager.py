"""Portfolio Manager API — premium-gated analyze + latest-report read."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import DBSession, PremiumUser
from app.core.exceptions import NotFoundError
from app.repositories.portfolio_manager import PortfolioReportRepository
from app.schemas.portfolio_manager import AnalyzeResponse
from app.services.ai.portfolio_manager import generate_report
from app.services.ai.portfolio_manager.analysis import _resolve_account_id

router = APIRouter(prefix="/portfolio-manager", tags=["Quản lý danh mục"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(user: PremiumUser, db: DBSession) -> AnalyzeResponse:
    """Sinh (hoặc trả về cache trong ngày) báo cáo phân tích danh mục cho người dùng hiện tại."""
    result = await generate_report(db, user.id)
    return AnalyzeResponse(**result)


@router.get("/report", response_model=AnalyzeResponse)
async def latest_report(user: PremiumUser, db: DBSession) -> AnalyzeResponse:
    """Trả về báo cáo gần nhất đã lưu (không sinh mới)."""
    account_id = await _resolve_account_id(db, user.id)
    repo = PortfolioReportRepository(db)
    row = await repo.get_latest(account_id)
    if row is None:
        raise NotFoundError("báo cáo phân tích danh mục")
    return AnalyzeResponse(
        analysis=row.analysis_json, narrative=row.narrative_json,
        meta={"valid": row.valid, "cached": True, "model": row.model_used,
              "session_date": row.session_date.isoformat(), "period_number": row.period_number},
    )

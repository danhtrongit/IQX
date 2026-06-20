"""Daily VN-Index AI market-analysis: public read + admin manual trigger.

Public:  GET /market-analysis/daily/latest, /daily/{session_date}, /daily
Admin:   POST /market-analysis/daily/run  (manual generation, audited)
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Path, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.core.exceptions import NotFoundError
from app.models.market_analysis import AnalysisHistory
from app.services.admin_audit import AdminAuditService

router = APIRouter(prefix="/market-analysis", tags=["Nhận định thị trường"])


class AnalysisOut(BaseModel):
    id: str
    session_date: date
    session_type: str
    session_type_display: str | None = None
    generated_at: datetime
    headline: str
    tagline: dict
    paragraphs: dict
    scenarios: list
    watchlist: list | None = None
    unexplained: str | None = None
    meta: dict | None = None
    charts: dict | None = None


class AnalysisListItem(BaseModel):
    id: str
    session_date: date
    session_type: str
    headline: str
    tagline: dict


def _to_out(a: AnalysisHistory) -> AnalysisOut:
    return AnalysisOut(
        id=a.public_id,
        session_date=a.session_date,
        session_type=a.session_type,
        session_type_display=(a.meta or {}).get("session_type_display"),
        generated_at=a.generated_at,
        headline=a.headline,
        tagline=a.tagline or {},
        paragraphs=a.paragraphs or {},
        scenarios=a.scenarios or [],
        watchlist=a.watchlist,
        unexplained=a.unexplained,
        meta=a.meta,
        charts=(a.meta or {}).get("charts"),
    )


@router.get("/daily/latest", response_model=AnalysisOut)
async def get_latest(db: DBSession) -> AnalysisOut:
    """Bài nhận định mới nhất đã publish."""
    a = (await db.execute(
        select(AnalysisHistory)
        .where(AnalysisHistory.is_published.is_(True))
        .order_by(AnalysisHistory.session_date.desc())
        .limit(1)
    )).scalar_one_or_none()
    if a is None:
        raise NotFoundError("Chưa có bài nhận định nào")
    return _to_out(a)


@router.get("/daily", response_model=list[AnalysisListItem])
async def list_recent(
    db: DBSession,
    limit: int = Query(20, ge=1, le=100),
) -> list[AnalysisListItem]:
    """Danh sách bài gần nhất (headline + tagline) để hiển thị mục lục."""
    rows = (await db.execute(
        select(AnalysisHistory)
        .where(AnalysisHistory.is_published.is_(True))
        .order_by(AnalysisHistory.session_date.desc())
        .limit(limit)
    )).scalars().all()
    return [
        AnalysisListItem(
            id=r.public_id, session_date=r.session_date, session_type=r.session_type,
            headline=r.headline, tagline=r.tagline or {},
        )
        for r in rows
    ]


@router.get("/daily/{session_date}", response_model=AnalysisOut)
async def get_by_date(
    db: DBSession,
    session_date: date = Path(..., description="Ngày phiên YYYY-MM-DD"),
) -> AnalysisOut:
    """Bài nhận định của một phiên cụ thể."""
    a = (await db.execute(
        select(AnalysisHistory).where(
            AnalysisHistory.session_date == session_date,
            AnalysisHistory.is_published.is_(True),
        )
    )).scalar_one_or_none()
    if a is None:
        raise NotFoundError(f"Không có bài nhận định cho ngày {session_date.isoformat()}")
    return _to_out(a)


class GenerateResult(BaseModel):
    session_date: str
    session_type: str
    valid: bool
    persisted: bool
    memory_loaded: bool
    attempts: int
    errors: list
    model: str
    generation_time_ms: int


@router.post("/daily/run", response_model=GenerateResult)
async def run_now(admin: AdminUser, audit: AuditCtx, db: DBSession) -> GenerateResult:
    """Kích hoạt sinh bài thủ công (admin). Dùng session riêng để tránh
    đụng transaction của request; ghi audit log."""
    from app.services.ai.market_analysis import run_daily_analysis

    # own session inside the generator (internal commit/rollback for memory + persist)
    result = await run_daily_analysis()

    await AdminAuditService(db).record(
        audit,
        action="market_analysis.run",
        target_entity="market_analysis",
        target_id=str(result.get("session_date")),
        after=result,
        note="Manual market-analysis generation",
    )
    return GenerateResult(**result)

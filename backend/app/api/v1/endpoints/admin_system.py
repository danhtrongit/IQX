"""Admin system status + jobs control."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.models.admin_audit import AdminAuditLog
from app.models.ipn_log import SePayIPNLog
from app.models.premium import PremiumPaymentOrder, PremiumSubscription
from app.models.user import User
from app.services.admin_audit import AdminAuditService
from app.services.jobs import is_running as scheduler_is_running
from app.services.jobs import list_jobs, run_job_now  # noqa: F401 — re-exported for symmetry

router = APIRouter(prefix="/admin/system", tags=["Quản trị: Hệ thống"])


class JobInfo(BaseModel):
    id: str
    name: str
    next_run_at: str | None
    trigger: str


class SystemStatus(BaseModel):
    version: str
    environment: str
    scheduler_running: bool
    jobs: list[JobInfo]
    db_stats: dict[str, int]
    last_ipn_received_at: datetime | None
    last_ipn_processed_count_24h: int
    generated_at: datetime


@router.get("/status", response_model=SystemStatus)
async def get_status(admin: AdminUser, db: DBSession) -> SystemStatus:
    """Trạng thái hệ thống — scheduler, jobs, DB stats, IPN metrics."""
    settings = get_settings()

    # Cheap table counts
    db_stats: dict[str, int] = {}
    for label, model in [
        ("users", User),
        ("subscriptions", PremiumSubscription),
        ("payment_orders", PremiumPaymentOrder),
        ("ipn_logs", SePayIPNLog),
        ("audit_log", AdminAuditLog),
    ]:
        db_stats[label] = int(
            (await db.execute(select(func.count()).select_from(model))).scalar_one()
        )

    last_ipn = (
        await db.execute(
            select(SePayIPNLog.received_at)
            .order_by(SePayIPNLog.received_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    twenty_four_hours_ago = datetime.now(UTC) - timedelta(hours=24)
    last_24h_processed = int(
        (
            await db.execute(
                select(func.count())
                .select_from(SePayIPNLog)
                .where(SePayIPNLog.received_at >= twenty_four_hours_ago)
                .where(SePayIPNLog.result_status == "processed")
            )
        ).scalar_one()
    )

    return SystemStatus(
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        scheduler_running=scheduler_is_running(),
        jobs=[JobInfo(**j) for j in list_jobs()],
        db_stats=db_stats,
        last_ipn_received_at=last_ipn,
        last_ipn_processed_count_24h=last_24h_processed,
        generated_at=datetime.now(UTC),
    )


class RunJobResponse(BaseModel):
    job_id: str
    result: dict
    ran_at: datetime


@router.post("/jobs/{job_id}/run", response_model=RunJobResponse)
async def run_job(
    job_id: str,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> RunJobResponse:
    """Kích hoạt thủ công một scheduled job. Ghi audit log."""
    from app.services.jobs.expiry_sweep import run_expiry_sweep
    from app.services.jobs.ipn_reconcile import run_ipn_reconcile_scan

    job_map = {
        "expiry_sweep": run_expiry_sweep,
        "ipn_reconcile_scan": run_ipn_reconcile_scan,
    }
    if job_id not in job_map:
        raise NotFoundError(f"Job '{job_id}' not found")

    # Pass the request-scoped session so the job reuses the existing transaction
    # context (and test overrides work correctly).
    result = await job_map[job_id](session=db)

    await AdminAuditService(db).record(
        audit,
        action="system.job_run",
        target_entity="job",
        target_id=job_id,
        after=result,
        note=f"Manual trigger of {job_id}",
    )
    return RunJobResponse(job_id=job_id, result=result, ran_at=datetime.now(UTC))

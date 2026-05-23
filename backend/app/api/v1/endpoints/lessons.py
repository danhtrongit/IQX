"""Public + authenticated user lesson endpoints."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession
from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.user import User
from app.repositories.lesson import EpisodeRepository, ProgressRepository
from app.schemas.common import PaginatedResponse
from app.schemas.lesson import (
    CourseDetailResponse,
    CourseListParams,
    CourseProgressSummary,
    CourseResponse,
    EpisodeBrief,
    EpisodeContent,
    ProgressRow,
    ProgressUpdate,
)
from app.services.auth import AuthService
from app.services.lesson.service import CourseService, EpisodeService, ProgressService

router = APIRouter(prefix="/lessons", tags=["Bài học"])

_bearer = HTTPBearer(auto_error=False)


async def _optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Resolve the current user if a bearer token is present, else None."""
    if credentials is None:
        return None
    try:
        return await AuthService(db).get_current_user_from_token(credentials.credentials)
    except Exception:
        return None


# ── Public endpoints ────────────────────────────────────────────────────────


@router.get("/courses", response_model=PaginatedResponse[CourseResponse])
async def list_courses(
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: str | None = Query(None),
    level: str | None = Query(None),
    is_premium: bool | None = Query(None),
    search: str | None = Query(None),
) -> PaginatedResponse[CourseResponse]:
    """List published courses. Anonymous OK."""
    params = CourseListParams(
        page=page,
        page_size=page_size,
        category=category,
        level=level,
        is_premium=is_premium,
        search=search,
    )
    svc = CourseService(db)
    page_result = await svc.list_public(params)
    return PaginatedResponse(
        items=[CourseResponse.model_validate(c) for c in page_result.items],
        total=page_result.total,
        page=page_result.page,
        page_size=page_result.page_size,
        total_pages=page_result.total_pages,
    )


@router.get("/courses/{slug}", response_model=CourseDetailResponse)
async def get_course_detail(
    slug: str,
    db: DBSession,
    maybe_user: User | None = Depends(_optional_user),
) -> CourseDetailResponse:
    """Get course detail with episode list (no content payload). Anonymous OK.

    If authenticated, includes progress_summary.
    """
    svc = CourseService(db)
    course = await svc.get_public_by_slug(slug)

    episodes = [EpisodeBrief.model_validate(ep) for ep in course.episodes if ep.is_published]

    progress_summary: CourseProgressSummary | None = None
    if maybe_user is not None:
        prog_svc = ProgressService(db)
        progress_summary = await prog_svc.compute_course_summary(
            maybe_user.id, course.id, course.total_episodes
        )

    return CourseDetailResponse(
        **CourseResponse.model_validate(course).model_dump(),
        episodes=episodes,
        progress_summary=progress_summary,
    )


# ── Authenticated user endpoints ────────────────────────────────────────────


@router.get("/episodes/{episode_id}/content", response_model=EpisodeContent)
async def get_episode_content(
    episode_id: uuid.UUID,
    db: DBSession,
    current_user: CurrentUser,
) -> EpisodeContent:
    """Get episode full content. Premium gating if course is premium."""
    ep_repo = EpisodeRepository(db)
    episode = await ep_repo.get_by_id_with_course(episode_id)

    if episode is None or not episode.course.is_published or not episode.is_published:
        raise NotFoundError("Tập học")

    if episode.course.is_premium:
        from app.services.premium import PremiumService

        sub = await PremiumService(db).get_user_subscription(current_user.id)
        if not sub.is_premium:
            raise ForbiddenError("Yêu cầu gói Premium đang hoạt động")

    return EpisodeContent.model_validate(episode)


@router.post("/episodes/{episode_id}/progress", response_model=ProgressRow)
async def update_episode_progress(
    episode_id: uuid.UUID,
    body: ProgressUpdate,
    db: DBSession,
    current_user: CurrentUser,
) -> ProgressRow:
    """Upsert episode progress for the current user."""
    ep_repo = EpisodeRepository(db)
    episode = await ep_repo.get_by_id(episode_id)
    if episode is None:
        raise NotFoundError("Tập học")

    svc = ProgressService(db)
    row = await svc.upsert(
        user_id=current_user.id,
        episode_id=episode_id,
        course_id=episode.course_id,
        data=body,
    )
    return ProgressRow.model_validate(row)


@router.get("/me/progress", response_model=list[ProgressRow])
async def get_my_progress(
    db: DBSession,
    current_user: CurrentUser,
    course_id: uuid.UUID = Query(...),
) -> list[ProgressRow]:
    """Get current user's progress for a specific course."""
    svc = ProgressService(db)
    rows = await svc.list_for_user_course(current_user.id, course_id)
    return [ProgressRow.model_validate(r) for r in rows]

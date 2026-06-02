"""Admin lesson endpoints — CRUD for courses + episodes."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, UploadFile

from app.api.deps import AdminUser, DBSession
from app.api.deps_audit import AuditCtx
from app.core.exceptions import NotFoundError
from app.repositories.lesson import CourseRepository, EpisodeRepository
from app.schemas.common import PaginatedResponse
from app.schemas.lesson import (
    CourseAdminDetailResponse,
    CourseCreate,
    CourseListParams,
    CourseResponse,
    CourseUpdate,
    EpisodeAdminBrief,
    EpisodeContent,
    EpisodeCreate,
    EpisodeUpdate,
    ReorderRequest,
)
from app.services.admin_audit import AdminAuditService
from app.services.lesson.service import CourseService, EpisodeService
from app.services.lesson.storage import MediaStorage

router = APIRouter(prefix="/admin/lessons", tags=["Quản trị: Bài học"])


def _course_snapshot(course) -> dict:  # type: ignore[type-arg]
    return {
        "slug": course.slug,
        "title": course.title,
        "level": course.level,
        "category": course.category,
        "is_premium": course.is_premium,
        "is_published": course.is_published,
    }


def _episode_snapshot(episode) -> dict:  # type: ignore[type-arg]
    return {
        "title": episode.title,
        "content_type": episode.content_type,
        "sort_order": episode.sort_order,
        "is_published": episode.is_published,
        "file_url": episode.file_url,
    }


# ── Course endpoints ─────────────────────────────────────────────────────────


@router.get("/courses", response_model=PaginatedResponse[CourseResponse])
async def admin_list_courses(
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: str | None = Query(None),
    level: str | None = Query(None),
    is_premium: bool | None = Query(None),
    is_published: bool | None = Query(None),
    search: str | None = Query(None),
) -> PaginatedResponse[CourseResponse]:
    """List all courses (admin view — includes unpublished)."""
    params = CourseListParams(
        page=page,
        page_size=page_size,
        category=category,
        level=level,
        is_premium=is_premium,
        is_published=is_published,
        search=search,
    )
    svc = CourseService(db)
    result = await svc.list_admin(params)
    return PaginatedResponse(
        items=[CourseResponse.model_validate(c) for c in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        total_pages=result.total_pages,
    )


@router.post("/courses", response_model=CourseResponse, status_code=201)
async def admin_create_course(
    body: CourseCreate,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> CourseResponse:
    """Create a new course. Audited."""
    svc = CourseService(db)
    course = await svc.create(body, created_by=admin.id)
    await AdminAuditService(db).record(
        audit,
        action="lesson.course.create",
        target_entity="course",
        target_id=str(course.id),
        after=_course_snapshot(course),
    )
    return CourseResponse.model_validate(course)


@router.get("/courses/{course_id}", response_model=CourseAdminDetailResponse)
async def admin_get_course(
    course_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> CourseAdminDetailResponse:
    """Get course detail (admin — includes file_url on episodes)."""
    svc = CourseService(db)
    course = await svc.get_admin_by_id(course_id)
    episodes = [EpisodeAdminBrief.model_validate(ep) for ep in course.episodes]
    return CourseAdminDetailResponse(
        **CourseResponse.model_validate(course).model_dump(),
        episodes=episodes,
    )


@router.patch("/courses/{course_id}", response_model=CourseResponse)
async def admin_update_course(
    course_id: uuid.UUID,
    body: CourseUpdate,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> CourseResponse:
    """Update course fields. Audited."""
    course_repo = CourseRepository(db)
    course = await course_repo.get_by_id(course_id)
    if not course:
        raise NotFoundError("Khoá học")
    before = _course_snapshot(course)

    svc = CourseService(db)
    updated = await svc.update(course_id, body)
    after = _course_snapshot(updated)

    await AdminAuditService(db).record(
        audit,
        action="lesson.course.update",
        target_entity="course",
        target_id=str(course_id),
        before=before,
        after=after,
    )
    return CourseResponse.model_validate(updated)


@router.delete("/courses/{course_id}", response_model=CourseResponse)
async def admin_delete_course(
    course_id: uuid.UUID,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> CourseResponse:
    """Soft-delete course (sets is_published=False). Audited."""
    course_repo = CourseRepository(db)
    course = await course_repo.get_by_id(course_id)
    if not course:
        raise NotFoundError("Khoá học")
    before = _course_snapshot(course)

    svc = CourseService(db)
    deleted = await svc.soft_delete(course_id)
    after = _course_snapshot(deleted)

    await AdminAuditService(db).record(
        audit,
        action="lesson.course.delete",
        target_entity="course",
        target_id=str(course_id),
        before=before,
        after=after,
    )
    return CourseResponse.model_validate(deleted)


@router.post("/courses/{course_id}/thumbnail", response_model=CourseResponse)
async def admin_upload_thumbnail(
    course_id: uuid.UUID,
    file: UploadFile,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> CourseResponse:
    """Upload/replace course thumbnail. Audited."""
    svc = CourseService(db)
    updated = await svc.save_thumbnail(course_id, file)
    await AdminAuditService(db).record(
        audit,
        action="lesson.course.thumbnail",
        target_entity="course",
        target_id=str(course_id),
        after={"thumbnail_url": updated.thumbnail_url},
    )
    return CourseResponse.model_validate(updated)


# ── Episode endpoints ─────────────────────────────────────────────────────────


@router.post("/courses/{course_id}/episodes", response_model=EpisodeAdminBrief, status_code=201)
async def admin_create_episode(
    course_id: uuid.UUID,
    body: EpisodeCreate,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> EpisodeAdminBrief:
    """Create a new episode for a course. Audited."""
    svc = EpisodeService(db)
    episode = await svc.create(course_id, body)
    await AdminAuditService(db).record(
        audit,
        action="lesson.episode.create",
        target_entity="episode",
        target_id=str(episode.id),
        after=_episode_snapshot(episode),
    )
    return EpisodeAdminBrief.model_validate(episode)


@router.patch("/episodes/{episode_id}", response_model=EpisodeAdminBrief)
async def admin_update_episode(
    episode_id: uuid.UUID,
    body: EpisodeUpdate,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> EpisodeAdminBrief:
    """Update episode metadata. Audited."""
    ep_repo = EpisodeRepository(db)
    episode = await ep_repo.get_by_id(episode_id)
    if not episode:
        raise NotFoundError("Tập học")
    before = _episode_snapshot(episode)

    svc = EpisodeService(db)
    updated = await svc.update(episode_id, body)
    after = _episode_snapshot(updated)

    await AdminAuditService(db).record(
        audit,
        action="lesson.episode.update",
        target_entity="episode",
        target_id=str(episode_id),
        before=before,
        after=after,
    )
    return EpisodeAdminBrief.model_validate(updated)


@router.delete("/episodes/{episode_id}", status_code=204)
async def admin_delete_episode(
    episode_id: uuid.UUID,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> None:
    """Hard delete episode + delete file from disk. Audited."""
    ep_repo = EpisodeRepository(db)
    episode = await ep_repo.get_by_id(episode_id)
    if not episode:
        raise NotFoundError("Tập học")
    before = _episode_snapshot(episode)

    svc = EpisodeService(db)
    await svc.delete(episode_id)

    await AdminAuditService(db).record(
        audit,
        action="lesson.episode.delete",
        target_entity="episode",
        target_id=str(episode_id),
        before=before,
    )


@router.post("/episodes/{episode_id}/file", response_model=EpisodeAdminBrief)
async def admin_upload_episode_file(
    episode_id: uuid.UUID,
    file: UploadFile,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> EpisodeAdminBrief:
    """Upload PDF or video file for an episode. Audited."""
    svc = EpisodeService(db)
    updated = await svc.save_file(episode_id, file)
    await AdminAuditService(db).record(
        audit,
        action="lesson.episode.upload",
        target_entity="episode",
        target_id=str(episode_id),
        after={
            "file_url": updated.file_url,
            "file_size_bytes": updated.file_size_bytes,
            "duration_seconds": updated.duration_seconds,
        },
    )
    return EpisodeAdminBrief.model_validate(updated)


@router.post("/courses/{course_id}/reorder", status_code=200)
async def admin_reorder_episodes(
    course_id: uuid.UUID,
    body: ReorderRequest,
    admin: AdminUser,
    audit: AuditCtx,
    db: DBSession,
) -> dict:
    """Atomically reorder episodes. Audited."""
    svc = EpisodeService(db)
    await svc.reorder(course_id, body)
    await AdminAuditService(db).record(
        audit,
        action="lesson.episode.reorder",
        target_entity="course",
        target_id=str(course_id),
        after={"reorder": [{"episode_id": str(i.episode_id), "sort_order": i.sort_order} for i in body.items]},
    )
    return {"message": "Đã cập nhật thứ tự tập học"}

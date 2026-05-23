"""Lesson services — CourseService, EpisodeService, ProgressService."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.lesson import Course, Episode, EpisodeContentType, EpisodeProgress
from app.repositories.lesson import CourseRepository, EpisodeRepository, ProgressRepository
from app.schemas.common import PaginatedResponse
from app.schemas.lesson import (
    CourseCreate,
    CourseListParams,
    CourseProgressSummary,
    CourseUpdate,
    EpisodeCreate,
    EpisodeUpdate,
    ProgressUpdate,
    ReorderRequest,
)
from app.services.lesson.storage import MediaStorage

logger = logging.getLogger(__name__)

# Allowed MIME types
_PDF_MIMES = {"application/pdf"}
_VIDEO_MIMES = {"video/mp4", "video/webm"}
_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}

CHUNK_SIZE = 1024 * 1024  # 1MB


class CourseService:
    def __init__(self, db: AsyncSession, storage: MediaStorage | None = None) -> None:
        self._db = db
        self._repo = CourseRepository(db)
        self._storage = storage or MediaStorage()

    async def list_public(self, params: CourseListParams) -> PaginatedResponse[Course]:
        return await self._repo.list_public(params)

    async def list_admin(self, params: CourseListParams) -> PaginatedResponse[Course]:
        return await self._repo.list_admin(params)

    async def get_public_by_slug(self, slug: str) -> Course:
        course = await self._repo.get_by_slug(slug, published_only=True)
        if not course:
            raise NotFoundError("Khoá học")
        return course

    async def get_admin_by_id(self, course_id: uuid.UUID) -> Course:
        course = await self._repo.get_by_id(course_id, with_episodes=True)
        if not course:
            raise NotFoundError("Khoá học")
        return course

    async def create(self, data: CourseCreate, created_by: uuid.UUID) -> Course:
        if await self._repo.slug_exists(data.slug):
            raise ConflictError(f"Slug '{data.slug}' đã được sử dụng")
        course = Course(
            slug=data.slug,
            title=data.title,
            description=data.description,
            level=data.level.value,
            category=data.category,
            is_premium=data.is_premium,
            is_published=data.is_published,
            created_by_user_id=created_by,
        )
        return await self._repo.create(course)

    async def update(self, course_id: uuid.UUID, data: CourseUpdate) -> Course:
        course = await self._repo.get_by_id(course_id)
        if not course:
            raise NotFoundError("Khoá học")
        updates: dict[str, Any] = data.model_dump(exclude_unset=True)
        if "slug" in updates and updates["slug"] is not None:
            if await self._repo.slug_exists(updates["slug"], exclude_id=course_id):
                raise ConflictError(f"Slug '{updates['slug']}' đã được sử dụng")
        # Convert enum value to string for storage
        if "level" in updates and updates["level"] is not None:
            lv = updates["level"]
            updates["level"] = lv.value if hasattr(lv, "value") else lv
        return await self._repo.update(course, updates)

    async def soft_delete(self, course_id: uuid.UUID) -> Course:
        course = await self._repo.get_by_id(course_id)
        if not course:
            raise NotFoundError("Khoá học")
        return await self._repo.soft_delete(course)

    async def save_thumbnail(
        self,
        course_id: uuid.UUID,
        file: UploadFile,
    ) -> Course:
        from app.services.lesson.image import save_thumbnail_jpeg

        settings = get_settings()
        max_bytes = settings.LESSON_MAX_THUMBNAIL_MB * 1024 * 1024

        # Validate MIME
        content_type = (file.content_type or "").split(";")[0].strip().lower()
        if content_type not in _IMAGE_MIMES:
            raise HTTPException(
                status_code=415,
                detail=f"Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp",
            )

        course = await self._repo.get_by_id(course_id)
        if not course:
            raise NotFoundError("Khoá học")

        # Read all bytes (thumbnail is small, max 5MB)
        raw = await file.read()
        if len(raw) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Ảnh quá lớn (tối đa {settings.LESSON_MAX_THUMBNAIL_MB} MB)",
            )

        course_dir = self._storage.course_dir(course_id)
        target = course_dir / "thumbnail.jpg"
        save_thumbnail_jpeg(raw, target)

        url = self._storage.public_url(target)
        return await self._repo.update(course, {"thumbnail_url": url})


class EpisodeService:
    def __init__(self, db: AsyncSession, storage: MediaStorage | None = None) -> None:
        self._db = db
        self._course_repo = CourseRepository(db)
        self._ep_repo = EpisodeRepository(db)
        self._storage = storage or MediaStorage()

    async def create(self, course_id: uuid.UUID, data: EpisodeCreate) -> Episode:
        course = await self._course_repo.get_by_id(course_id)
        if not course:
            raise NotFoundError("Khoá học")

        # Auto-assign sort_order
        sort_order = data.sort_order
        if sort_order is None:
            sort_order = (await self._ep_repo.max_sort_order(course_id)) + 1

        episode = Episode(
            course_id=course_id,
            title=data.title,
            description=data.description,
            content_type=data.content_type.value,
            markdown_body=data.markdown_body,
            sort_order=sort_order,
            # New pdf/video episodes start unpublished until file uploaded.
            # Text episodes can be published immediately because markdown_body is
            # required at creation.
            is_published=(data.content_type.value == "text"),
        )
        ep = await self._ep_repo.create(episode)
        await self._ep_repo.refresh_course_denorms(course_id)
        return ep

    async def update(self, episode_id: uuid.UUID, data: EpisodeUpdate) -> Episode:
        episode = await self._ep_repo.get_by_id(episode_id)
        if not episode:
            raise NotFoundError("Tập học")
        updates = data.model_dump(exclude_unset=True)
        # Guard: cannot publish a pdf/video episode without an uploaded file.
        wants_publish = updates.get("is_published") is True
        if wants_publish and episode.content_type in ("pdf", "video") and not episode.file_url:
            raise BadRequestError(
                "Phải upload file trước khi xuất bản tập học dạng PDF/Video"
            )
        return await self._ep_repo.update(episode, updates)

    async def delete(self, episode_id: uuid.UUID) -> None:
        episode = await self._ep_repo.get_by_id_with_course(episode_id)
        if not episode:
            raise NotFoundError("Tập học")
        course_id = episode.course_id

        # Best-effort delete file
        if episode.file_url:
            path = self._storage.from_url(episode.file_url)
            if path:
                self._storage.delete(path)

        await self._ep_repo.delete(episode)
        await self._ep_repo.refresh_course_denorms(course_id)

    async def save_file(
        self,
        episode_id: uuid.UUID,
        file: UploadFile,
    ) -> Episode:
        from app.services.lesson.video_probe import probe_duration_seconds

        settings = get_settings()
        episode = await self._ep_repo.get_by_id_with_course(episode_id)
        if not episode:
            raise NotFoundError("Tập học")

        content_type_str = episode.content_type
        content_mime = (file.content_type or "").split(";")[0].strip().lower()

        # Validate MIME and size limits
        if content_type_str == EpisodeContentType.PDF.value:
            if content_mime not in _PDF_MIMES:
                raise HTTPException(status_code=415, detail="Chỉ chấp nhận file PDF")
            max_bytes = settings.LESSON_MAX_PDF_MB * 1024 * 1024
            ext = "pdf"
        elif content_type_str == EpisodeContentType.VIDEO.value:
            if content_mime not in _VIDEO_MIMES:
                raise HTTPException(
                    status_code=415, detail="Chỉ chấp nhận video MP4 hoặc WebM"
                )
            max_bytes = settings.LESSON_MAX_VIDEO_MB * 1024 * 1024
            ext = "mp4" if "mp4" in content_mime else "webm"
        else:
            raise BadRequestError("Tập học dạng text không cần upload file")

        # Delete existing file if any
        if episode.file_url:
            old_path = self._storage.from_url(episode.file_url)
            if old_path:
                self._storage.delete(old_path)

        course_id = episode.course_id
        course_dir = self._storage.course_dir(course_id)
        target = course_dir / f"ep-{episode_id}.{ext}"

        # Read with size limit
        chunks: list[bytes] = []
        total_bytes = 0
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File quá lớn (tối đa {max_bytes // (1024 * 1024)} MB)",
                )
            chunks.append(chunk)

        actual_bytes = self._storage.write_atomic(target, iter(chunks))

        duration_seconds: int | None = None
        if content_type_str == EpisodeContentType.VIDEO.value:
            try:
                duration_seconds = await probe_duration_seconds(target)
            except Exception:
                logger.warning(
                    "ffprobe failed for episode %s, duration will be NULL", episode_id
                )

        url = self._storage.public_url(target)
        updated = await self._ep_repo.update(
            episode,
            {
                "file_url": url,
                "file_size_bytes": actual_bytes,
                "duration_seconds": duration_seconds,
            },
        )
        await self._ep_repo.refresh_course_denorms(course_id)
        return updated

    async def reorder(self, course_id: uuid.UUID, request: ReorderRequest) -> None:
        course = await self._course_repo.get_by_id(course_id)
        if not course:
            raise NotFoundError("Khoá học")
        items = [
            {"episode_id": item.episode_id, "sort_order": item.sort_order}
            for item in request.items
        ]
        await self._ep_repo.reorder_atomic(course_id, items)


class ProgressService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = ProgressRepository(db)

    async def upsert(
        self,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        course_id: uuid.UUID,
        data: ProgressUpdate,
    ) -> EpisodeProgress:
        return await self._repo.upsert(
            user_id=user_id,
            episode_id=episode_id,
            course_id=course_id,
            completed=data.completed,
            last_position_seconds=data.last_position_seconds,
        )

    async def list_for_user_course(
        self, user_id: uuid.UUID, course_id: uuid.UUID
    ) -> list[EpisodeProgress]:
        return await self._repo.list_for_user_course(user_id, course_id)

    async def compute_course_summary(
        self, user_id: uuid.UUID, course_id: uuid.UUID, total_episodes: int
    ) -> CourseProgressSummary:
        rows = await self._repo.list_for_user_course(user_id, course_id)
        completed = sum(1 for r in rows if r.completed_at is not None)
        total = total_episodes
        percent = round((completed / total * 100.0) if total > 0 else 0.0, 1)
        return CourseProgressSummary(completed=completed, total=total, percent=percent)

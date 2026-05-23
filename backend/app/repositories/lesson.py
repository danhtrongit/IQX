"""Lesson repository — data access for Course, Episode, EpisodeProgress."""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lesson import Course, Episode, EpisodeProgress
from app.schemas.common import PaginatedResponse
from app.schemas.lesson import CourseListParams


class CourseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_public(self, params: CourseListParams) -> PaginatedResponse[Course]:
        """List published courses (public catalog)."""
        conditions = [Course.is_published.is_(True)]
        if params.category:
            conditions.append(Course.category == params.category)
        if params.level:
            conditions.append(Course.level == params.level)
        if params.is_premium is not None:
            conditions.append(Course.is_premium.is_(params.is_premium))
        if params.search:
            pattern = f"%{params.search}%"
            conditions.append(
                or_(
                    Course.title.ilike(pattern),
                    Course.description.ilike(pattern),
                )
            )
        where = and_(*conditions)
        return await self._paginate(where, params.page, params.page_size)

    async def list_admin(self, params: CourseListParams) -> PaginatedResponse[Course]:
        """List all courses (admin, includes unpublished)."""
        conditions: list[Any] = []
        if params.category:
            conditions.append(Course.category == params.category)
        if params.level:
            conditions.append(Course.level == params.level)
        if params.is_premium is not None:
            conditions.append(Course.is_premium.is_(params.is_premium))
        if params.is_published is not None:
            conditions.append(Course.is_published.is_(params.is_published))
        if params.search:
            pattern = f"%{params.search}%"
            conditions.append(
                or_(
                    Course.title.ilike(pattern),
                    Course.description.ilike(pattern),
                )
            )
        where = and_(*conditions) if conditions else None
        return await self._paginate(where, params.page, params.page_size)

    async def _paginate(
        self,
        where: Any,
        page: int,
        page_size: int,
    ) -> PaginatedResponse[Course]:
        count_stmt = select(func.count()).select_from(Course)
        items_stmt = select(Course).order_by(Course.created_at.desc())
        if where is not None:
            count_stmt = count_stmt.where(where)
            items_stmt = items_stmt.where(where)
        total = (await self._s.execute(count_stmt)).scalar_one()
        items = list(
            (
                await self._s.execute(
                    items_stmt.limit(page_size).offset((page - 1) * page_size)
                )
            )
            .scalars()
            .all()
        )
        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size) if total > 0 else 0,
        )

    async def get_by_slug(self, slug: str, published_only: bool = True) -> Course | None:
        stmt = select(Course).options(selectinload(Course.episodes)).where(Course.slug == slug)
        if published_only:
            stmt = stmt.where(Course.is_published.is_(True))
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def get_by_id(self, course_id: uuid.UUID, with_episodes: bool = False) -> Course | None:
        stmt = select(Course).where(Course.id == course_id)
        if with_episodes:
            stmt = stmt.options(selectinload(Course.episodes))
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def slug_exists(self, slug: str, exclude_id: uuid.UUID | None = None) -> bool:
        stmt = select(Course.id).where(Course.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(Course.id != exclude_id)
        return (await self._s.execute(stmt)).scalar_one_or_none() is not None

    async def create(self, course: Course) -> Course:
        self._s.add(course)
        await self._s.flush()
        await self._s.refresh(course)
        return course

    async def update(self, course: Course, data: dict[str, Any]) -> Course:
        for k, v in data.items():
            setattr(course, k, v)
        await self._s.flush()
        await self._s.refresh(course)
        return course

    async def soft_delete(self, course: Course) -> Course:
        course.is_published = False
        await self._s.flush()
        await self._s.refresh(course)
        return course


class EpisodeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_by_id(self, episode_id: uuid.UUID) -> Episode | None:
        return (
            await self._s.execute(select(Episode).where(Episode.id == episode_id))
        ).scalar_one_or_none()

    async def get_by_id_with_course(self, episode_id: uuid.UUID) -> Episode | None:
        stmt = (
            select(Episode)
            .options(selectinload(Episode.course))
            .where(Episode.id == episode_id)
        )
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def list_for_course(self, course_id: uuid.UUID) -> list[Episode]:
        result = await self._s.execute(
            select(Episode)
            .where(Episode.course_id == course_id)
            .order_by(Episode.sort_order)
        )
        return list(result.scalars().all())

    async def max_sort_order(self, course_id: uuid.UUID) -> int:
        result = await self._s.execute(
            select(func.max(Episode.sort_order)).where(Episode.course_id == course_id)
        )
        return result.scalar_one_or_none() or 0

    async def create(self, episode: Episode) -> Episode:
        self._s.add(episode)
        await self._s.flush()
        await self._s.refresh(episode)
        return episode

    async def update(self, episode: Episode, data: dict[str, Any]) -> Episode:
        for k, v in data.items():
            setattr(episode, k, v)
        await self._s.flush()
        await self._s.refresh(episode)
        return episode

    async def delete(self, episode: Episode) -> None:
        await self._s.delete(episode)
        await self._s.flush()

    async def reorder_atomic(
        self,
        course_id: uuid.UUID,
        items: list[dict[str, Any]],
    ) -> None:
        """Atomically update sort_order for a list of episodes.

        Uses negative-then-positive trick to avoid unique constraint violations.
        """
        episode_ids = [item["episode_id"] for item in items]

        # Step 1: Set all to negative (temporary)
        await self._s.execute(
            update(Episode)
            .where(Episode.course_id == course_id)
            .where(Episode.id.in_(episode_ids))
            .values(sort_order=(-1 * Episode.sort_order))
        )
        await self._s.flush()

        # Step 2: Apply final sort_orders one by one
        for item in items:
            await self._s.execute(
                update(Episode)
                .where(Episode.id == item["episode_id"])
                .values(sort_order=item["sort_order"])
            )
        await self._s.flush()

    async def refresh_course_denorms(self, course_id: uuid.UUID) -> None:
        """Recompute total_episodes + total_duration_seconds on the course row."""
        result = await self._s.execute(
            select(
                func.count(Episode.id).label("cnt"),
                func.coalesce(func.sum(Episode.duration_seconds), 0).label("dur"),
            ).where(Episode.course_id == course_id)
        )
        row = result.one()
        await self._s.execute(
            update(Course)
            .where(Course.id == course_id)
            .values(total_episodes=row.cnt, total_duration_seconds=row.dur)
        )
        await self._s.flush()


class ProgressRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get(self, user_id: uuid.UUID, episode_id: uuid.UUID) -> EpisodeProgress | None:
        return (
            await self._s.execute(
                select(EpisodeProgress).where(
                    EpisodeProgress.user_id == user_id,
                    EpisodeProgress.episode_id == episode_id,
                )
            )
        ).scalar_one_or_none()

    async def upsert(
        self,
        user_id: uuid.UUID,
        episode_id: uuid.UUID,
        course_id: uuid.UUID,
        completed: bool | None,
        last_position_seconds: int | None,
    ) -> EpisodeProgress:
        row = await self.get(user_id, episode_id)
        if row is None:
            row = EpisodeProgress(
                user_id=user_id,
                episode_id=episode_id,
                course_id=course_id,
            )
            self._s.add(row)

        if completed is True and row.completed_at is None:
            row.completed_at = datetime.now(UTC)
        if last_position_seconds is not None:
            row.last_position_seconds = last_position_seconds

        await self._s.flush()
        await self._s.refresh(row)
        return row

    async def list_for_user_course(
        self, user_id: uuid.UUID, course_id: uuid.UUID
    ) -> list[EpisodeProgress]:
        result = await self._s.execute(
            select(EpisodeProgress).where(
                EpisodeProgress.user_id == user_id,
                EpisodeProgress.course_id == course_id,
            )
        )
        return list(result.scalars().all())

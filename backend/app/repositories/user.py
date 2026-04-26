"""User repository — data access layer for the User model."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserStatus
from app.schemas.user import UserListParams


class UserRepository:
    """Pure data-access class — no business logic, no password hashing."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Single record ────────────────────────────────
    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()

    async def get_by_phone(self, phone_e164: str) -> User | None:
        result = await self._session.execute(select(User).where(User.phone_e164 == phone_e164))
        return result.scalar_one_or_none()

    # ── List with filtering, pagination, sorting ─────
    async def list_users(
        self,
        params: UserListParams,
    ) -> tuple[list[User], int]:
        """Return (users, total_count) tuple."""
        query = select(User).where(User.status != UserStatus.DELETED)

        # Filtering
        if params.search:
            # Escape SQL LIKE wildcards to prevent wildcard injection
            escaped = (
                params.search
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            search_term = f"%{escaped}%"
            query = query.where(
                or_(
                    User.email.ilike(search_term, escape="\\"),
                    User.first_name.ilike(search_term, escape="\\"),
                    User.last_name.ilike(search_term, escape="\\"),
                    User.phone_number.ilike(search_term, escape="\\"),
                )
            )
        if params.role:
            query = query.where(User.role == params.role)
        if params.status:
            query = query.where(User.status == params.status)

        # Total count
        count_query = select(func.count()).select_from(query.subquery())
        total = (await self._session.execute(count_query)).scalar_one()

        # Sorting — sort_by is already validated by Literal type in schema
        sort_column = getattr(User, params.sort_by, None)
        if sort_column is None or not hasattr(sort_column, "key"):
            sort_column = User.created_at
        order_func = desc if params.sort_order == "desc" else asc
        query = query.order_by(order_func(sort_column))

        # Pagination
        offset = (params.page - 1) * params.page_size
        query = query.offset(offset).limit(params.page_size)

        result = await self._session.execute(query)
        users = list(result.scalars().all())
        return users, total

    # ── Create ───────────────────────────────────────
    async def create(self, user: User) -> User:
        self._session.add(user)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    # ── Update ───────────────────────────────────────
    async def update(self, user: User, data: dict[str, Any]) -> User:
        for key, value in data.items():
            setattr(user, key, value)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    # ── Soft delete ──────────────────────────────────
    async def soft_delete(self, user: User) -> User:
        from datetime import UTC, datetime

        user.status = UserStatus.DELETED
        user.deleted_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(user)
        return user

    # ── Check existence ──────────────────────────────
    async def email_exists(self, email: str) -> bool:
        result = await self._session.execute(select(func.count()).where(User.email == email.lower()))
        return result.scalar_one() > 0

    async def phone_exists(self, phone_e164: str) -> bool:
        result = await self._session.execute(select(func.count()).where(User.phone_e164 == phone_e164))
        return result.scalar_one() > 0

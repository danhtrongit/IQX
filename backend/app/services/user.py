"""User service — business logic layer."""

from __future__ import annotations

import logging
import math
import uuid
from datetime import UTC, datetime

import phonenumbers
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.user import User, UserRole, UserStatus
from app.repositories.user import UserRepository
from app.schemas.common import PaginatedResponse
from app.schemas.user import (
    AdminUserCreate,
    AdminUserUpdate,
    UserBriefResponse,
    UserCreate,
    UserListParams,
    UserUpdate,
)

logger = logging.getLogger(__name__)


class UserService:
    """Orchestrates user-related business logic."""

    def __init__(self, session: AsyncSession) -> None:
        self._repo = UserRepository(session)

    # ── Helpers ──────────────────────────────────────
    @staticmethod
    def _parse_phone(phone_number: str | None) -> dict:
        """Parse a phone string into structured phone fields.

        When phone_number is None, returns explicit None values for all
        phone fields so that clearing a phone number works correctly.
        """
        if phone_number is None:
            return {
                "phone_number": None,
                "phone_country_code": None,
                "phone_national_number": None,
                "phone_e164": None,
            }
        if not phone_number:
            return {}
        try:
            # Default to VN region so both "0912345678" and "+84912345678" work
            parsed = phonenumbers.parse(phone_number, "VN")
            if not phonenumbers.is_valid_number(parsed):
                return {"phone_number": phone_number}
            return {
                "phone_number": phone_number,
                "phone_country_code": f"+{parsed.country_code}",
                "phone_national_number": str(parsed.national_number),
                "phone_e164": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164),
            }
        except phonenumbers.NumberParseException:
            return {"phone_number": phone_number}

    # ── Register ─────────────────────────────────────
    async def register(self, data: UserCreate) -> User:
        """Register a new user account."""
        if await self._repo.email_exists(data.email):
            raise ConflictError("Đã tồn tại người dùng với email này")

        phone_fields = self._parse_phone(data.phone_number)
        if phone_fields.get("phone_e164") and await self._repo.phone_exists(phone_fields["phone_e164"]):
            raise ConflictError("Đã tồn tại người dùng với số điện thoại này")

        user = User(
            email=data.email.lower(),
            hashed_password=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            role=UserRole.USER,
            status=UserStatus.ACTIVE,
            **phone_fields,
        )
        created = await self._repo.create(user)
        logger.info("User registered: %s", created.email)
        return created

    # ── Admin create ──────────────────────────────────
    async def admin_create(self, data: AdminUserCreate) -> User:
        """Admin creates a user with custom role/status."""
        if await self._repo.email_exists(data.email):
            raise ConflictError("Đã tồn tại người dùng với email này")

        phone_fields = self._parse_phone(data.phone_number)
        if phone_fields.get("phone_e164") and await self._repo.phone_exists(phone_fields["phone_e164"]):
            raise ConflictError("Đã tồn tại người dùng với số điện thoại này")

        user = User(
            email=data.email.lower(),
            hashed_password=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            role=data.role,
            status=data.status,
            **phone_fields,
        )
        created = await self._repo.create(user)
        logger.info("Admin created user: %s (role=%s)", created.email, created.role.value)
        return created

    # ── Get ──────────────────────────────────────────
    async def get_by_id(self, user_id: uuid.UUID) -> User:
        user = await self._repo.get_by_id(user_id)
        if not user or user.status == UserStatus.DELETED:
            raise NotFoundError("người dùng")
        return user

    async def get_by_email(self, email: str) -> User | None:
        return await self._repo.get_by_email(email.lower())

    # ── List ─────────────────────────────────────────
    async def list_users(self, params: UserListParams) -> PaginatedResponse[UserBriefResponse]:
        users, total = await self._repo.list_users(params)
        total_pages = math.ceil(total / params.page_size) if total > 0 else 0
        return PaginatedResponse(
            items=[UserBriefResponse.model_validate(u) for u in users],
            total=total,
            page=params.page,
            page_size=params.page_size,
            total_pages=total_pages,
        )

    # ── Update (self) ────────────────────────────────
    async def update_profile(self, user_id: uuid.UUID, data: UserUpdate) -> User:
        user = await self.get_by_id(user_id)
        update_data = data.model_dump(exclude_unset=True)

        # Handle phone update
        if "phone_number" in update_data:
            phone_fields = self._parse_phone(update_data.pop("phone_number"))
            if phone_fields.get("phone_e164"):
                existing = await self._repo.get_by_phone(phone_fields["phone_e164"])
                if existing and existing.id != user_id:
                    raise ConflictError("Đã tồn tại người dùng với số điện thoại này")
            update_data.update(phone_fields)

        return await self._repo.update(user, update_data)

    # ── Admin update ────────────────────────────────
    async def admin_update(self, user_id: uuid.UUID, data: AdminUserUpdate) -> User:
        user = await self.get_by_id(user_id)
        update_data = data.model_dump(exclude_unset=True)

        if "phone_number" in update_data:
            phone_fields = self._parse_phone(update_data.pop("phone_number"))
            if phone_fields.get("phone_e164"):
                existing = await self._repo.get_by_phone(phone_fields["phone_e164"])
                if existing and existing.id != user_id:
                    raise ConflictError("Đã tồn tại người dùng với số điện thoại này")
            update_data.update(phone_fields)

        return await self._repo.update(user, update_data)

    # ── Soft delete ──────────────────────────────────
    async def soft_delete(self, user_id: uuid.UUID) -> User:
        user = await self.get_by_id(user_id)
        return await self._repo.soft_delete(user)

    # ── Update last login ────────────────────────────
    async def update_last_login(self, user: User) -> None:
        await self._repo.update(user, {"last_login_at": datetime.now(UTC)})

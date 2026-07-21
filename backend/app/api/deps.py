"""FastAPI dependencies — authentication, authorization, and DB session."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.models.user import User, UserRole
from app.services.auth import AuthService

# Bearer token scheme for OpenAPI docs
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Resolve the currently authenticated user from the Bearer token."""
    if credentials is None:
        raise UnauthorizedError("Yêu cầu xác thực")

    auth_service = AuthService(db)
    return await auth_service.get_current_user_from_token(credentials.credentials)


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Ensure the current user is active."""
    if not current_user.is_active:
        raise ForbiddenError("Tài khoản chưa được kích hoạt")
    return current_user


async def get_current_admin(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Ensure the current user is an admin."""
    if current_user.role != UserRole.ADMIN:
        raise ForbiddenError("Yêu cầu quyền quản trị viên")
    return current_user


async def is_premium_active(user: User, db: AsyncSession) -> bool:
    """Centralized premium check — the single source of truth for "is this user premium".

    Admins implicitly count as premium (full access, no subscription needed).
    Used both as the hard-403 gate (``get_premium_active_user``) and inline by
    endpoints/services that need to branch behavior instead of rejecting outright
    (e.g. Cấp 0 san_tap-only enforcement for non-premium virtual-trading users).
    """
    if user.role == UserRole.ADMIN:
        return True

    from app.services.premium import PremiumService

    service = PremiumService(db)
    sub = await service.get_user_subscription(user.id)
    return sub.is_premium


async def get_premium_active_user(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Ensure the current user has premium access.

    Admins implicitly have full access and bypass the subscription check.
    """
    if not await is_premium_active(current_user, db):
        raise ForbiddenError("Yêu cầu gói Premium đang hoạt động")
    return current_user


# Type aliases for cleaner endpoint signatures
CurrentUser = Annotated[User, Depends(get_current_active_user)]
AdminUser = Annotated[User, Depends(get_current_admin)]
PremiumUser = Annotated[User, Depends(get_premium_active_user)]
DBSession = Annotated[AsyncSession, Depends(get_db)]

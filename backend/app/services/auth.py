"""Authentication service — login, token refresh, current-user resolution, logout.

Implements proper refresh token rotation with database-backed jti tracking.
If a revoked token is replayed, the entire token family is invalidated
to protect against stolen refresh tokens.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    verify_password,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserStatus
from app.repositories.refresh_token import RefreshTokenRepository
from app.schemas.auth import TokenResponse
from app.services.user import UserService

logger = logging.getLogger(__name__)


class AuthService:
    """Handles authentication flows with proper token rotation."""

    def __init__(self, session: AsyncSession) -> None:
        self._user_service = UserService(session)
        self._token_repo = RefreshTokenRepository(session)

    # ── Login ────────────────────────────────────────
    async def login(self, email: str, password: str) -> TokenResponse:
        """Authenticate user and return token pair."""
        user = await self._user_service.get_by_email(email)

        if not user or not verify_password(password, user.hashed_password):
            raise UnauthorizedError("Email hoặc mật khẩu không đúng")

        if user.status != UserStatus.ACTIVE:
            raise UnauthorizedError(f"Trạng thái tài khoản: {user.status.value}")

        # Update last login
        await self._user_service.update_last_login(user)

        # Create a new token family for this login session
        token_family = str(uuid.uuid4())

        access_token = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role.value},
        )
        refresh_token, jti = create_refresh_token(
            subject=user.id,
            token_family=token_family,
        )

        # Persist refresh token metadata
        settings = get_settings()
        await self._token_repo.create(
            RefreshToken(
                user_id=user.id,
                jti=jti,
                token_family=token_family,
                expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
                revoked=False,
                created_at=datetime.now(UTC),
            )
        )

        logger.info("User logged in: %s", user.email)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        )

    # ── Refresh tokens ───────────────────────────────
    async def refresh_tokens(self, refresh_token_str: str) -> TokenResponse:
        """Issue a new token pair from a valid refresh token.

        Implements token rotation:
        - The old refresh token is revoked.
        - A new refresh token is issued in the same family.
        - If a revoked token is replayed, the entire family is invalidated.
        """
        try:
            payload = decode_refresh_token(refresh_token_str)
        except jwt.ExpiredSignatureError:
            raise UnauthorizedError("Refresh token đã hết hạn") from None
        except jwt.InvalidTokenError:
            raise UnauthorizedError("Refresh token không hợp lệ") from None

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Sai loại token")

        jti = payload.get("jti")
        token_family = payload.get("family")
        if not jti or not token_family:
            raise UnauthorizedError("Refresh token bị thiếu thuộc tính")

        # Look up the token in the database
        stored_token = await self._token_repo.get_by_jti(jti)

        if stored_token is None:
            raise UnauthorizedError("Refresh token không được công nhận")

        if stored_token.revoked:
            # Replay attack detected! Revoke the entire family.
            logger.warning(
                "Refresh token replay detected for family %s (user %s). Revoking all tokens.",
                token_family,
                stored_token.user_id,
            )
            await self._token_repo.revoke_family(token_family)
            raise UnauthorizedError("Refresh token đã bị thu hồi (có thể bị tấn công replay)")

        # Resolve user — map NotFoundError to UnauthorizedError
        try:
            user = await self._user_service.get_by_id(stored_token.user_id)
        except NotFoundError:
            raise UnauthorizedError("Tài khoản người dùng không còn khả dụng") from None

        if user.status != UserStatus.ACTIVE:
            raise UnauthorizedError(f"Trạng thái tài khoản: {user.status.value}")

        # Revoke the old token
        await self._token_repo.revoke_by_jti(jti)

        # Issue new pair in the same family
        new_access = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role.value},
        )
        new_refresh, new_jti = create_refresh_token(
            subject=user.id,
            token_family=token_family,
        )

        settings = get_settings()
        await self._token_repo.create(
            RefreshToken(
                user_id=user.id,
                jti=new_jti,
                token_family=token_family,
                expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
                revoked=False,
                created_at=datetime.now(UTC),
            )
        )

        return TokenResponse(
            access_token=new_access,
            refresh_token=new_refresh,
        )

    # ── Current user resolution ──────────────────────
    async def get_current_user_from_token(self, token: str) -> User:
        """Resolve user from access token.

        All claim/user resolution errors are mapped to UnauthorizedError
        or ForbiddenError — never leaks 404 for auth-gated operations.
        """
        try:
            payload = decode_access_token(token)
        except jwt.ExpiredSignatureError:
            raise UnauthorizedError("Access token đã hết hạn") from None
        except jwt.InvalidTokenError:
            raise UnauthorizedError("Access token không hợp lệ") from None

        if payload.get("type") != "access":
            raise UnauthorizedError("Sai loại token")

        try:
            user_id = uuid.UUID(payload["sub"])
        except (KeyError, ValueError):
            raise UnauthorizedError("Access token bị thiếu thuộc tính") from None

        try:
            user = await self._user_service.get_by_id(user_id)
        except NotFoundError:
            raise UnauthorizedError("Tài khoản người dùng không còn khả dụng") from None

        if user.status != UserStatus.ACTIVE:
            raise ForbiddenError(f"Trạng thái tài khoản: {user.status.value}")

        return user

    # ── Logout ───────────────────────────────────────
    async def logout(self, user_id: uuid.UUID) -> None:
        """Revoke all refresh tokens for the user."""
        await self._token_repo.revoke_all_for_user(user_id)
        logger.info("User logged out (all refresh tokens revoked): %s", user_id)

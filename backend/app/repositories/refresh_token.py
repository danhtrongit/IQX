"""Refresh token repository — data access for token rotation and revocation."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken


class RefreshTokenRepository:
    """Data access layer for refresh tokens."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, token: RefreshToken) -> RefreshToken:
        self._session.add(token)
        await self._session.flush()
        return token

    async def get_by_jti(self, jti: str) -> RefreshToken | None:
        result = await self._session.execute(select(RefreshToken).where(RefreshToken.jti == jti))
        return result.scalar_one_or_none()

    async def revoke_by_jti(self, jti: str) -> None:
        """Mark a single token as revoked."""
        await self._session.execute(update(RefreshToken).where(RefreshToken.jti == jti).values(revoked=True))

    async def revoke_family(self, token_family: str) -> None:
        """Revoke all tokens in a family (replay attack detected)."""
        await self._session.execute(
            update(RefreshToken).where(RefreshToken.token_family == token_family).values(revoked=True)
        )

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        """Revoke all refresh tokens for a user (e.g. on logout)."""
        await self._session.execute(update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True))

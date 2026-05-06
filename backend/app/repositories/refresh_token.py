"""Refresh token repository — data access for token rotation and revocation."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
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

    async def claim_for_rotation(self, jti: str) -> int:
        """Atomically claim a non-revoked token for rotation.

        Uses conditional UPDATE ``WHERE jti = ? AND revoked = false``
        so exactly one concurrent caller can succeed.

        Returns:
            Number of rows updated (0 or 1).
        """
        result = await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.jti == jti, RefreshToken.revoked.is_(False))
            .values(revoked=True)
        )
        return int(result.rowcount)  # type: ignore[attr-defined]

    async def revoke_family(self, token_family: str) -> None:
        """Revoke all tokens in a family (replay attack detected)."""
        await self._session.execute(
            update(RefreshToken).where(RefreshToken.token_family == token_family).values(revoked=True)
        )

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        """Revoke all refresh tokens for a user (e.g. on logout)."""
        await self._session.execute(update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True))

    async def purge_expired(
        self,
        *,
        include_revoked_before: datetime | None = None,
    ) -> int:
        """Delete expired tokens and optionally old revoked tokens.

        Args:
            include_revoked_before: If set, also delete revoked tokens
                created before this datetime.

        Returns:
            Number of deleted rows.
        """
        from sqlalchemy import or_

        now = datetime.now(UTC)
        conditions = [RefreshToken.expires_at < now]
        if include_revoked_before is not None:
            conditions.append(
                (RefreshToken.revoked.is_(True)) & (RefreshToken.created_at < include_revoked_before)
            )
        stmt = delete(RefreshToken).where(or_(*conditions))
        result = await self._session.execute(stmt)
        return getattr(result, "rowcount", 0)

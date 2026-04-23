"""Authentication business logic."""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import TokenResponse
from app.services import user as user_service


async def authenticate(session: AsyncSession, email: str, password: str) -> User | None:
    """Validate credentials and return user or None."""
    user = await user_service.get_user_by_email(session, email)
    if user is None or not verify_password(password, user.hashed_password):
        return None
    return user


async def login(session: AsyncSession, user: User) -> TokenResponse:
    """Generate token pair and update last_login_at."""
    user.last_login_at = datetime.now(UTC)
    await session.flush()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )

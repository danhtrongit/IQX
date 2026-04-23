"""Premium access dependency for route protection."""

from fastapi import Depends, HTTPException, status

from app.dependencies.auth import get_current_user
from app.models.user import User


async def require_premium(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to have an active premium subscription.

    Use as a FastAPI dependency on endpoints that serve premium content.
    """
    if not user.subscription:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required",
        )
    return user

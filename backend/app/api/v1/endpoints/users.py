"""User management endpoints (admin + self-service)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.dependencies.auth import get_current_admin, get_current_user
from app.models.user import User
from app.schemas.error import ErrorResponse
from app.schemas.user import (
    UserCreate,
    UserListResponse,
    UserProfileUpdate,
    UserResponse,
    UserUpdate,
)
from app.services import user as user_service

router = APIRouter(prefix="/users", tags=["Users"])


# ---------------------------------------------------------------------------
# Self-service
# ---------------------------------------------------------------------------


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update own profile",
    responses={
        200: {"description": "Profile updated successfully."},
        401: {"description": "Missing or invalid token.", "model": ErrorResponse},
    },
)
async def update_my_profile(
    body: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Update the current user's own profile."""
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    await session.flush()
    await session.refresh(current_user)
    return current_user


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=UserListResponse,
    summary="List all users (admin)",
    responses={
        200: {"description": "Paginated user list."},
        401: {"description": "Missing or invalid token.", "model": ErrorResponse},
        403: {"description": "Not an admin.", "model": ErrorResponse},
    },
)
async def list_users(
    skip: int = Query(0, ge=0, description="Number of records to skip."),
    limit: int = Query(50, ge=1, le=100, description="Max records to return."),
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """List all users (admin only)."""
    users, total = await user_service.list_users(session, skip=skip, limit=limit)
    return {"items": users, "total": total}


@router.post(
    "",
    response_model=UserResponse,
    status_code=201,
    summary="Create a user (admin)",
    responses={
        201: {"description": "User created successfully."},
        401: {"description": "Missing or invalid token.", "model": ErrorResponse},
        403: {"description": "Not an admin.", "model": ErrorResponse},
        409: {"description": "Email or username already exists.", "model": ErrorResponse},
    },
)
async def create_user(
    body: UserCreate,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Create a user (admin only)."""
    if await user_service.get_user_by_email(session, body.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    if await user_service.get_user_by_username(session, body.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )
    return await user_service.create_user(session, body)


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID (admin)",
    responses={
        200: {"description": "User profile."},
        401: {"description": "Missing or invalid token.", "model": ErrorResponse},
        403: {"description": "Not an admin.", "model": ErrorResponse},
        404: {"description": "User not found.", "model": ErrorResponse},
    },
)
async def get_user(
    user_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Get user details by ID (admin only)."""
    user = await user_service.get_user_by_id(session, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update user (admin)",
    responses={
        200: {"description": "User updated successfully."},
        401: {"description": "Missing or invalid token.", "model": ErrorResponse},
        403: {"description": "Not an admin.", "model": ErrorResponse},
        404: {"description": "User not found.", "model": ErrorResponse},
        409: {"description": "Email or username already exists.", "model": ErrorResponse},
    },
)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    _admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Update a user (admin only)."""
    user = await user_service.get_user_by_id(session, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Check uniqueness if email/username is changing
    if (
        body.email
        and body.email != user.email
        and await user_service.get_user_by_email(session, body.email)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    if (
        body.username
        and body.username != user.username
        and await user_service.get_user_by_username(session, body.username)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    return await user_service.update_user(session, user, body)

"""User management endpoints — CRUD for admin, self-profile for users."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, CurrentUser, DBSession
from app.models.user import UserRole, UserStatus
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.user import (
    SORTABLE_FIELDS,
    AdminUserCreate,
    AdminUserUpdate,
    UserBriefResponse,
    UserListParams,
    UserResponse,
    UserUpdate,
)
from app.services.user import UserService

router = APIRouter(prefix="/users", tags=["Users"])


# ── Self-profile ────────────────────────────────────
@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get own profile",
    description="Returns the full profile of the currently authenticated user.",
)
async def get_own_profile(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update own profile",
    description="Users can update their own personal information.",
)
async def update_own_profile(
    data: UserUpdate,
    current_user: CurrentUser,
    db: DBSession,
) -> UserResponse:
    service = UserService(db)
    user = await service.update_profile(current_user.id, data)
    return UserResponse.model_validate(user)


# ── Admin: List users ───────────────────────────────
@router.get(
    "/",
    response_model=PaginatedResponse[UserBriefResponse],
    summary="List users (admin)",
    description="Admin-only endpoint. Returns a paginated, filterable list of users.",
)
async def list_users(
    admin: AdminUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    role: UserRole | None = Query(None),
    status: UserStatus | None = Query(None),
    sort_by: SORTABLE_FIELDS = Query("created_at"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
) -> PaginatedResponse[UserBriefResponse]:
    params = UserListParams(
        page=page,
        page_size=page_size,
        search=search,
        role=role,
        status=status,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    service = UserService(db)
    return await service.list_users(params)


# ── Admin: Get user by ID ───────────────────────────
@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID (admin)",
    description="Admin-only. Retrieve full details of a specific user.",
)
async def get_user(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> UserResponse:
    service = UserService(db)
    user = await service.get_by_id(user_id)
    return UserResponse.model_validate(user)


# ── Admin: Create user ──────────────────────────────
@router.post(
    "/",
    response_model=UserResponse,
    status_code=201,
    summary="Create user (admin)",
    description="Admin-only. Create a new user with custom role and status.",
)
async def admin_create_user(
    data: AdminUserCreate,
    admin: AdminUser,
    db: DBSession,
) -> UserResponse:
    service = UserService(db)
    user = await service.admin_create(data)
    return UserResponse.model_validate(user)


# ── Admin: Update user ──────────────────────────────
@router.patch(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update user (admin)",
    description="Admin-only. Update any user's profile, role, or status.",
)
async def admin_update_user(
    user_id: uuid.UUID,
    data: AdminUserUpdate,
    admin: AdminUser,
    db: DBSession,
) -> UserResponse:
    service = UserService(db)
    user = await service.admin_update(user_id, data)
    return UserResponse.model_validate(user)


# ── Admin: Soft-delete user ─────────────────────────
@router.delete(
    "/{user_id}",
    response_model=MessageResponse,
    summary="Delete user (admin)",
    description="Admin-only. Soft-delete a user (sets status to 'deleted').",
)
async def admin_delete_user(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> MessageResponse:
    service = UserService(db)
    await service.soft_delete(user_id)
    return MessageResponse(message="User deleted successfully")

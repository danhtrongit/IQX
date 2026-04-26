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

router = APIRouter(prefix="/users", tags=["Người dùng"])


# ── Self-profile ────────────────────────────────────
@router.get(
    "/me",
    response_model=UserResponse,
    summary="Lấy hồ sơ của chính mình",
    description="Trả về đầy đủ hồ sơ của người dùng đang đăng nhập.",
)
async def get_own_profile(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Cập nhật hồ sơ của chính mình",
    description="Người dùng có thể cập nhật thông tin cá nhân của mình.",
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
    summary="Danh sách người dùng (quản trị)",
    description="Endpoint dành riêng cho quản trị viên. Trả về danh sách người dùng có phân trang và bộ lọc.",
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
    summary="Lấy thông tin người dùng theo ID (quản trị)",
    description="Dành riêng cho quản trị viên. Lấy đầy đủ chi tiết của một người dùng cụ thể.",
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
    summary="Tạo người dùng (quản trị)",
    description="Dành riêng cho quản trị viên. Tạo người dùng mới với vai trò và trạng thái tùy chỉnh.",
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
    summary="Cập nhật người dùng (quản trị)",
    description="Dành riêng cho quản trị viên. Cập nhật hồ sơ, vai trò hoặc trạng thái của bất kỳ người dùng nào.",
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
    summary="Xóa người dùng (quản trị)",
    description="Dành riêng cho quản trị viên. Xóa mềm người dùng (đặt trạng thái về 'deleted').",
)
async def admin_delete_user(
    user_id: uuid.UUID,
    admin: AdminUser,
    db: DBSession,
) -> MessageResponse:
    service = UserService(db)
    await service.soft_delete(user_id)
    return MessageResponse(message="Xóa người dùng thành công")

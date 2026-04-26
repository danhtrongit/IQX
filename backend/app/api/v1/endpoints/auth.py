"""Authentication endpoints — register, login, refresh, logout, me."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.deps import CurrentUser, DBSession
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.schemas.auth import LoginRequest, RefreshTokenRequest, TokenResponse
from app.schemas.common import MessageResponse
from app.schemas.user import UserCreate, UserResponse
from app.services.auth import AuthService
from app.services.user import UserService

router = APIRouter(prefix="/auth", tags=["Xác thực"])

_AUTH_LIMIT = get_settings().RATE_LIMIT_AUTH


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    summary="Đăng ký người dùng mới",
    description="Tạo tài khoản người dùng mới. Email phải duy nhất. Mật khẩu phải đủ mạnh.",
)
@limiter.limit(_AUTH_LIMIT)
async def register(request: Request, data: UserCreate, db: DBSession) -> UserResponse:
    service = UserService(db)
    user = await service.register(data)
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập",
    description="Xác thực bằng email và mật khẩu. Trả về access token và refresh token.",
)
@limiter.limit(_AUTH_LIMIT)
async def login(request: Request, data: LoginRequest, db: DBSession) -> TokenResponse:
    service = AuthService(db)
    return await service.login(data.email, data.password)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Làm mới token",
    description="Đổi refresh token hợp lệ để lấy cặp token mới. Refresh token cũ sẽ bị thu hồi (xoay vòng).",
)
@limiter.limit(_AUTH_LIMIT)
async def refresh_tokens(request: Request, data: RefreshTokenRequest, db: DBSession) -> TokenResponse:
    service = AuthService(db)
    return await service.refresh_tokens(data.refresh_token)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Đăng xuất",
    description="Thu hồi tất cả refresh token của người dùng hiện tại.",
)
async def logout(current_user: CurrentUser, db: DBSession) -> MessageResponse:
    service = AuthService(db)
    await service.logout(current_user.id)
    return MessageResponse(message="Đăng xuất thành công")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Lấy thông tin người dùng hiện tại",
    description="Trả về hồ sơ của người dùng đang đăng nhập.",
)
async def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)

"""Authentication endpoints — register, login, refresh, logout, me, email
verification and password reset."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import HTMLResponse

from app.api.deps import CurrentUser, DBSession
from app.core.config import get_settings
from app.core.email_tokens import EmailTokenError
from app.core.exceptions import NotFoundError
from app.core.rate_limit import limiter
from app.models.user import UserStatus
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.common import MessageResponse
from app.schemas.user import UserCreate, UserResponse
from app.services.auth import AuthService
from app.services.email import EmailService
from app.services.email_templates import reset_form_page, verify_result_page
from app.services.user import UserService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Xác thực"])

_AUTH_LIMIT = get_settings().RATE_LIMIT_AUTH


async def _send_verification_email(user_id: uuid.UUID, email: str, full_name: str | None) -> None:
    """Background task — never raise into the request lifecycle."""
    try:
        await EmailService().send_verification_email(user_id=user_id, email=email, full_name=full_name)
    except Exception:  # noqa: BLE001 — best-effort background send
        logger.exception("Verification email task failed for %s", email)


async def _send_reset_email(
    user_id: uuid.UUID, email: str, full_name: str | None, hashed_password: str
) -> None:
    """Background task — never raise into the request lifecycle."""
    try:
        await EmailService().send_password_reset_email(
            user_id=user_id, email=email, full_name=full_name, hashed_password=hashed_password
        )
    except Exception:  # noqa: BLE001 — best-effort background send
        logger.exception("Password reset email task failed for %s", email)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    summary="Đăng ký người dùng mới",
    description="Tạo tài khoản người dùng mới. Email phải duy nhất. Mật khẩu phải đủ mạnh.",
)
@limiter.limit(_AUTH_LIMIT)
async def register(
    request: Request, data: UserCreate, db: DBSession, background: BackgroundTasks
) -> UserResponse:
    service = UserService(db)
    user = await service.register(data)
    # Best-effort verification email — must not block or fail registration.
    background.add_task(_send_verification_email, user.id, user.email, user.full_name)
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập",
    description="Xác thực bằng email và mật khẩu. Trả về access token và refresh token.",
)
@limiter.limit(_AUTH_LIMIT)
# NOTE: Admin dashboard login uses this same endpoint, so rate limiting applies
# equally to admin login attempts (T35 hardening).
async def login(request: Request, data: LoginRequest, db: DBSession) -> TokenResponse:
    service = AuthService(db)
    return await service.login(
        data.email,
        data.password,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


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


# ── Email verification ───────────────────────────────────────────────────


@router.get(
    "/verify-email",
    response_class=HTMLResponse,
    include_in_schema=False,
    summary="Xác thực email",
)
async def verify_email(token: str, db: DBSession) -> HTMLResponse:
    """Consume a verification link and mark the user's email verified."""
    service = UserService(db)
    try:
        await service.verify_email_with_token(token)
    except (EmailTokenError, NotFoundError):
        return HTMLResponse(
            verify_result_page(False, "Liên kết xác thực không hợp lệ hoặc đã hết hạn."),
            status_code=400,
        )
    return HTMLResponse(
        verify_result_page(True, "Email của bạn đã được xác thực thành công. Bạn có thể đóng trang này.")
    )


# ── Password reset ───────────────────────────────────────────────────────


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Quên mật khẩu",
    description="Gửi email chứa liên kết đặt lại mật khẩu. Luôn trả về 200 dù email có tồn tại hay không.",
)
@limiter.limit(_AUTH_LIMIT)
async def forgot_password(
    request: Request, data: ForgotPasswordRequest, db: DBSession, background: BackgroundTasks
) -> MessageResponse:
    user = await UserService(db).get_by_email(data.email)
    # Only active accounts get a link; response is identical either way (no enumeration).
    if user and user.status == UserStatus.ACTIVE:
        background.add_task(
            _send_reset_email, user.id, user.email, user.full_name, user.hashed_password
        )
    return MessageResponse(
        message="Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu."
    )


@router.get(
    "/reset-password",
    response_class=HTMLResponse,
    include_in_schema=False,
    summary="Trang đặt lại mật khẩu",
)
async def reset_password_form(token: str) -> HTMLResponse:
    """Serve the minimal 'set new password' form the reset email links to."""
    return HTMLResponse(reset_form_page(token))


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu",
    description="Đổi mật khẩu bằng token từ email. Thu hồi mọi phiên đăng nhập hiện có.",
)
@limiter.limit(_AUTH_LIMIT)
async def reset_password(
    request: Request, data: ResetPasswordRequest, db: DBSession
) -> MessageResponse:
    await AuthService(db).reset_password_with_token(data.token, data.new_password)
    return MessageResponse(message="Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.")

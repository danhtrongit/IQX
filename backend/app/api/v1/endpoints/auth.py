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

router = APIRouter(prefix="/auth", tags=["Authentication"])

_AUTH_LIMIT = get_settings().RATE_LIMIT_AUTH


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    summary="Register a new user",
    description="Create a new user account. Email must be unique. Password must be strong.",
)
@limiter.limit(_AUTH_LIMIT)
async def register(request: Request, data: UserCreate, db: DBSession) -> UserResponse:
    service = UserService(db)
    user = await service.register(data)
    return UserResponse.model_validate(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login",
    description="Authenticate with email and password. Returns access and refresh tokens.",
)
@limiter.limit(_AUTH_LIMIT)
async def login(request: Request, data: LoginRequest, db: DBSession) -> TokenResponse:
    service = AuthService(db)
    return await service.login(data.email, data.password)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh tokens",
    description="Exchange a valid refresh token for a new token pair. The old refresh token is revoked (rotation).",
)
@limiter.limit(_AUTH_LIMIT)
async def refresh_tokens(request: Request, data: RefreshTokenRequest, db: DBSession) -> TokenResponse:
    service = AuthService(db)
    return await service.refresh_tokens(data.refresh_token)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout",
    description="Revoke all refresh tokens for the current user.",
)
async def logout(current_user: CurrentUser, db: DBSession) -> MessageResponse:
    service = AuthService(db)
    await service.logout(current_user.id)
    return MessageResponse(message="Successfully logged out")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
    description="Returns the profile of the currently authenticated user.",
)
async def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)

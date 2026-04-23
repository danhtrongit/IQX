"""Authentication endpoints."""

import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import (
    decode_token,
    hash_password,
    verify_password,
)
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.error import ErrorResponse
from app.schemas.user import UserCreate, UserMeResponse, UserResponse
from app.services import user as user_service
from app.services.auth import authenticate, login
from app.services.subscription import get_active_subscription

router = APIRouter(prefix="/auth", tags=["Auth"])


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    summary="Register a new account",
    description=(
        "Create a new user account with `member` role.\n\n"
        "- Email and username must be unique.\n"
        "- Password is hashed with bcrypt before storage.\n"
        "- No authentication required."
    ),
    operation_id="register",
    responses={
        201: {"description": "Account created successfully."},
        409: {
            "description": "Email or username already exists.",
            "model": ErrorResponse,
            "content": {
                "application/json": {
                    "examples": {
                        "email_exists": {
                            "summary": "Duplicate email",
                            "value": {"detail": "Email already registered"},
                        },
                        "username_exists": {
                            "summary": "Duplicate username",
                            "value": {"detail": "Username already taken"},
                        },
                    }
                }
            },
        },
        422: {"description": "Validation error (invalid email, short password, etc.)."},
    },
)
async def register(
    body: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> User:
    """Register a new user account."""
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

    user = await user_service.create_user(
        session,
        UserCreate(
            email=body.email,
            username=body.username,
            password=body.password,
            full_name=body.full_name,
        ),
    )
    return user


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and obtain tokens",
    description=(
        "Authenticate with email and password.\n\n"
        "Returns a JWT token pair:\n"
        "- **access_token** (30 min TTL) -- use in `Authorization: Bearer <token>` header.\n"
        "- **refresh_token** (7 day TTL) -- use with `POST /api/v1/auth/refresh`.\n\n"
        "No authentication required."
    ),
    operation_id="login",
    responses={
        200: {"description": "Login successful. Token pair returned."},
        401: {
            "description": "Invalid credentials.",
            "model": ErrorResponse,
            "content": {
                "application/json": {
                    "example": {"detail": "Incorrect email or password"}
                }
            },
        },
        403: {
            "description": "Account is deactivated.",
            "model": ErrorResponse,
            "content": {
                "application/json": {
                    "example": {"detail": "User account is deactivated"}
                }
            },
        },
    },
)
async def login_endpoint(
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Authenticate user and return JWT token pair."""
    user = await authenticate(session, body.email, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    return await login(session, user)


# ---------------------------------------------------------------------------
# Me
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=UserMeResponse,
    summary="Get current user profile",
    description=(
        "Returns the full profile of the currently authenticated user, "
        "including premium subscription status and entitlements.\n\n"
        "Premium fields (`is_premium`, `current_plan`, `subscription_status`, "
        "`subscription_expires_at`, `entitlements`) are derived from the active "
        "subscription at query time — they are NOT stored on the user record.\n\n"
        "Requires a valid **access token** in the `Authorization` header."
    ),
    operation_id="getCurrentUser",
    responses={
        200: {"description": "Current user profile with entitlements."},
        401: {
            "description": "Missing or invalid token.",
            "model": ErrorResponse,
        },
        403: {
            "description": "Account deactivated.",
            "model": ErrorResponse,
        },
    },
)
async def get_me(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the authenticated user's profile with premium entitlements."""
    sub = await get_active_subscription(session, current_user.id)
    user_data = UserMeResponse.model_validate(current_user)
    if sub and sub.plan:
        user_data.is_premium = True
        user_data.current_plan = sub.plan.code
        user_data.subscription_status = sub.status
        user_data.subscription_expires_at = sub.current_period_end
        user_data.entitlements = sub.plan.features
    return user_data


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    description=(
        "Exchange a valid **refresh token** for a new token pair.\n\n"
        "- The old tokens remain valid until they expire naturally.\n"
        "- An **access token** cannot be used here -- only refresh tokens are accepted.\n"
        "- No Bearer header needed; send the refresh_token in the request body."
    ),
    operation_id="refreshToken",
    responses={
        200: {"description": "New token pair issued."},
        401: {
            "description": "Invalid, expired, or wrong token type.",
            "model": ErrorResponse,
            "content": {
                "application/json": {
                    "examples": {
                        "expired": {
                            "summary": "Token expired",
                            "value": {"detail": "Invalid or expired refresh token"},
                        },
                        "wrong_type": {
                            "summary": "Access token used instead of refresh",
                            "value": {"detail": "Invalid token type"},
                        },
                    }
                }
            },
        },
    },
)
async def refresh_token(
    body: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Exchange a valid refresh token for a new token pair."""
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user = await user_service.get_user_by_id(session, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )
    return await login(session, user)


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------


@router.post(
    "/change-password",
    status_code=204,
    summary="Change password",
    description=(
        "Change the current user's password.\n\n"
        "- Requires the **current password** for verification.\n"
        "- Existing tokens remain valid after password change.\n"
        "- Requires a valid **access token**."
    ),
    operation_id="changePassword",
    responses={
        204: {"description": "Password changed successfully. No content returned."},
        400: {
            "description": "Current password is incorrect.",
            "model": ErrorResponse,
            "content": {
                "application/json": {
                    "example": {"detail": "Current password is incorrect"}
                }
            },
        },
        401: {
            "description": "Missing or invalid token.",
            "model": ErrorResponse,
        },
    },
)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Change the current user's password."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = hash_password(body.new_password)
    await session.flush()

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

router = APIRouter(prefix="/auth", tags=["Auth"])


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    summary="Register a new account",
    responses={
        201: {"description": "Account created successfully."},
        409: {"description": "Email or username already exists.", "model": ErrorResponse},
        422: {"description": "Validation error."},
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
    responses={
        200: {"description": "Login successful."},
        401: {"description": "Invalid credentials.", "model": ErrorResponse},
        403: {"description": "Account deactivated.", "model": ErrorResponse},
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
    responses={
        200: {"description": "Current user profile with premium status."},
        401: {"description": "Missing or invalid token.", "model": ErrorResponse},
        403: {"description": "Account deactivated.", "model": ErrorResponse},
    },
)
async def get_me(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Return the authenticated user's profile with premium status."""
    from app.services.premium import get_premium_status

    premium = await get_premium_status(session, current_user.id)

    # Build response dict from user attributes + premium fields
    user_data = UserMeResponse.model_validate(current_user, from_attributes=True).model_dump()
    # Serialize current_plan from ORM model to dict if present
    plan = premium.get("current_plan")
    plan_dict = None
    if plan is not None:
        from app.schemas.premium import PlanResponse
        plan_dict = PlanResponse.model_validate(plan, from_attributes=True).model_dump()

    user_data["is_premium"] = premium["is_premium"]
    user_data["current_plan"] = plan_dict
    user_data["subscription_status"] = premium["subscription_status"]
    user_data["subscription_expires_at"] = premium["subscription_expires_at"]
    user_data["entitlements"] = premium["entitlements"]
    return user_data


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    responses={
        200: {"description": "New token pair issued."},
        401: {"description": "Invalid or expired refresh token.", "model": ErrorResponse},
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
    responses={
        204: {"description": "Password changed successfully."},
        400: {"description": "Current password is incorrect.", "model": ErrorResponse},
        401: {"description": "Missing or invalid token.", "model": ErrorResponse},
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

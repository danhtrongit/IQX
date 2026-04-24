"""User request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

_ROLE_DESC = (
    "User role on the platform. "
    "Valid values: `member` (default), `analyst` (market analyst), `admin` (full access)."
)

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    """Public user profile returned by the API."""

    id: uuid.UUID = Field(..., description="Unique user identifier (UUID v4).")
    email: str = Field(..., description="User's email address.")
    username: str = Field(..., description="Unique display name.")
    full_name: str | None = Field(default=None, description="Full display name.")
    is_active: bool = Field(..., description="Whether the account can log in.")
    is_verified: bool = Field(
        ..., description="Whether the user has verified their email."
    )
    role: str = Field(..., description=_ROLE_DESC)
    created_at: datetime = Field(
        ..., description="Account creation timestamp (ISO 8601, UTC)."
    )
    updated_at: datetime = Field(
        ..., description="Last profile update timestamp (ISO 8601, UTC)."
    )
    last_login_at: datetime | None = Field(
        default=None, description="Last successful login timestamp."
    )

    model_config = {"from_attributes": True}


class UserMeResponse(UserResponse):
    """Extended profile for GET /auth/me."""

    is_superuser: bool = Field(False, description="Whether the user is a superuser.")

    # Premium status (populated by the endpoint, not from_attributes)
    is_premium: bool = Field(False, description="Whether the user has an active premium subscription.")
    current_plan: dict | None = Field(None, description="Current premium plan details.")
    subscription_status: str | None = Field(None, description="Subscription status: active/expired/cancelled.")
    subscription_expires_at: datetime | None = Field(None, description="When the current subscription period ends.")
    entitlements: dict | None = Field(None, description="Feature entitlements from the plan.")



class UserListResponse(BaseModel):
    """Paginated list of users (admin endpoint)."""

    items: list[UserResponse] = Field(
        ..., description="List of user objects for the current page."
    )
    total: int = Field(
        ..., description="Total number of users in the database (for pagination)."
    )


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    """Admin-only payload to create a new user account."""

    email: EmailStr = Field(
        ..., description="Valid email address. Must be unique."
    )
    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Unique display name (3-50 characters).",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Initial password (8-128 characters).",
    )
    full_name: str | None = Field(default=None, description="Full display name.")
    role: str = Field(default="member", description=_ROLE_DESC)
    is_active: bool = Field(
        default=True,
        description="Set to false to create a pre-deactivated account.",
    )


class UserUpdate(BaseModel):
    """Admin-only payload to update any user's profile (PATCH semantics)."""

    email: EmailStr | None = Field(default=None, description="New email address.")
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
        description="New username.",
    )
    full_name: str | None = Field(default=None, description="Updated display name.")
    role: str | None = Field(default=None, description=_ROLE_DESC)
    is_active: bool | None = Field(
        default=None, description="Set to false to deactivate."
    )
    is_verified: bool | None = Field(
        default=None, description="Manually verify or unverify a user's email."
    )


class UserProfileUpdate(BaseModel):
    """Self-service payload for users to update their own profile."""

    full_name: str | None = Field(default=None, description="New display name.")

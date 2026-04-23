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
    """Public user profile returned by the API.

    Sensitive fields like `hashed_password` are never exposed.
    """

    id: uuid.UUID = Field(
        ...,
        description="Unique user identifier (UUID v4).",
        examples=["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    )
    email: str = Field(
        ...,
        description="User's email address.",
        examples=["nguyen.van.a@gmail.com"],
    )
    username: str = Field(
        ...,
        description="Unique display name.",
        examples=["nguyenvana"],
    )
    full_name: str | None = Field(
        default=None,
        description="Full display name.",
        examples=["Nguyen Van A"],
    )
    is_active: bool = Field(
        ...,
        description="Whether the account can log in. Deactivated users are locked out.",
        examples=[True],
    )
    is_verified: bool = Field(
        ...,
        description="Whether the user has verified their email.",
        examples=[False],
    )
    role: str = Field(
        ...,
        description=_ROLE_DESC,
        examples=["member"],
    )
    created_at: datetime = Field(
        ...,
        description="Account creation timestamp (ISO 8601, UTC).",
        examples=["2026-04-22T14:30:00+00:00"],
    )
    updated_at: datetime = Field(
        ...,
        description="Last profile update timestamp (ISO 8601, UTC).",
        examples=["2026-04-22T14:30:00+00:00"],
    )
    last_login_at: datetime | None = Field(
        default=None,
        description="Last successful login timestamp, or null if never logged in.",
        examples=["2026-04-22T15:00:00+00:00"],
    )

    model_config = {"from_attributes": True}


class UserMeResponse(UserResponse):
    """Extended profile for GET /auth/me — includes premium entitlements.

    Premium fields are derived from the active subscription at query time.
    They are NOT stored on the user record.
    """

    is_premium: bool = Field(
        False,
        description="Whether the user has an active premium subscription.",
    )
    current_plan: str | None = Field(
        None,
        description="Active plan code.",
        examples=["premium_pro"],
    )
    subscription_status: str | None = Field(
        None,
        description="Subscription status: `active`, `expired`, `cancelled`.",
    )
    subscription_expires_at: datetime | None = Field(
        None,
        description="End of current billing period (UTC).",
    )
    entitlements: dict | None = Field(
        None,
        description="Feature flags from the active plan.",
    )


class UserListResponse(BaseModel):
    """Paginated list of users (admin endpoint)."""

    items: list[UserResponse] = Field(
        ...,
        description="List of user objects for the current page.",
    )
    total: int = Field(
        ...,
        description="Total number of users in the database (for pagination).",
        examples=[42],
    )


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    """Admin-only payload to create a new user account.

    Unlike self-registration, admins can set the role and active status.
    """

    email: EmailStr = Field(
        ...,
        description="Valid email address. Must be unique.",
        examples=["analyst@iqx.vn"],
    )
    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Unique display name (3-50 characters).",
        examples=["market_analyst"],
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Initial password (8-128 characters).",
        examples=["S3cur3P@ss!"],
    )
    full_name: str | None = Field(
        default=None,
        description="Full display name.",
        examples=["Tran Thi B"],
    )
    role: str = Field(
        default="member",
        description=_ROLE_DESC,
        examples=["analyst"],
    )
    is_active: bool = Field(
        default=True,
        description="Set to false to create a pre-deactivated account.",
        examples=[True],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "analyst@iqx.vn",
                    "username": "market_analyst",
                    "password": "S3cur3P@ss!",
                    "full_name": "Tran Thi B",
                    "role": "analyst",
                    "is_active": True,
                }
            ]
        }
    }


class UserUpdate(BaseModel):
    """Admin-only payload to update any user's profile.

    All fields are optional -- only provided fields are updated (PATCH semantics).
    Can be used to change role, deactivate/reactivate accounts, etc.
    """

    email: EmailStr | None = Field(
        default=None,
        description="New email address (must be unique if provided).",
        examples=["new.email@iqx.vn"],
    )
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
        description="New username (must be unique if provided).",
        examples=["new_username"],
    )
    full_name: str | None = Field(
        default=None,
        description="Updated display name.",
        examples=["Updated Name"],
    )
    role: str | None = Field(
        default=None,
        description=_ROLE_DESC,
        examples=["analyst"],
    )
    is_active: bool | None = Field(
        default=None,
        description="Set to false to deactivate, true to reactivate.",
        examples=[False],
    )
    is_verified: bool | None = Field(
        default=None,
        description="Manually verify or unverify a user's email.",
        examples=[True],
    )


class UserProfileUpdate(BaseModel):
    """Self-service payload for users to update their own profile.

    Regular users can only change their display name.
    To change email, role, or other fields, contact an admin.
    """

    full_name: str | None = Field(
        default=None,
        description="New display name.",
        examples=["Nguyen Van A Updated"],
    )

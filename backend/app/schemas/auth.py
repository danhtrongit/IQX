"""Auth request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """New user registration payload."""

    email: EmailStr = Field(
        ...,
        description="Valid email address. Must be unique.",
        examples=["nguyen.van.a@gmail.com"],
    )
    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Unique display name (3-50 characters).",
        examples=["nguyenvana"],
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Account password (8-128 characters).",
        examples=["MyStr0ngP@ss!"],
    )
    full_name: str | None = Field(
        default=None,
        description="User's full display name.",
        examples=["Nguyen Van A"],
    )


class LoginRequest(BaseModel):
    """User login credentials."""

    email: EmailStr = Field(
        ...,
        description="Registered email address.",
        examples=["nguyen.van.a@gmail.com"],
    )
    password: str = Field(
        ...,
        description="Account password.",
        examples=["MyStr0ngP@ss!"],
    )


class TokenResponse(BaseModel):
    """JWT token pair returned on successful authentication."""

    access_token: str = Field(
        ...,
        description="Short-lived JWT for API authorization.",
    )
    refresh_token: str = Field(
        ...,
        description="Long-lived JWT for obtaining new token pairs.",
    )
    token_type: str = Field(
        default="bearer",
        description="Token type. Always `bearer`.",
    )


class RefreshRequest(BaseModel):
    """Payload to exchange a refresh token for a new token pair."""

    refresh_token: str = Field(
        ...,
        description="A valid, non-expired refresh token.",
    )


class ChangePasswordRequest(BaseModel):
    """Payload to change the current user's password."""

    current_password: str = Field(
        ...,
        description="The user's current password for verification.",
    )
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password (8-128 characters).",
    )

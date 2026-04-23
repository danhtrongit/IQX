"""Auth request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """New user registration payload.

    Creates a new account with `member` role by default.
    Email and username must be unique across the platform.
    """

    email: EmailStr = Field(
        ...,
        description="Valid email address. Must be unique.",
        examples=["nguyen.van.a@gmail.com"],
    )
    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Unique display name (3-50 characters, no spaces recommended).",
        examples=["nguyenvana"],
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Account password (8-128 characters). Stored as bcrypt hash.",
        examples=["MyStr0ngP@ss!"],
    )
    full_name: str | None = Field(
        default=None,
        description="User's full display name.",
        examples=["Nguyen Van A"],
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "nguyen.van.a@gmail.com",
                    "username": "nguyenvana",
                    "password": "MyStr0ngP@ss!",
                    "full_name": "Nguyen Van A",
                }
            ]
        }
    }


class LoginRequest(BaseModel):
    """User login credentials.

    Authenticates via email + password and returns a JWT token pair.
    """

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
    """JWT token pair returned on successful authentication.

    - **access_token**: Short-lived token (default 30 min) for API calls.
      Include in `Authorization: Bearer <token>` header.
    - **refresh_token**: Long-lived token (default 7 days) used only to
      obtain a new token pair via `POST /api/v1/auth/refresh`.
    """

    access_token: str = Field(
        ...,
        description="Short-lived JWT for API authorization.",
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )
    refresh_token: str = Field(
        ...,
        description="Long-lived JWT for obtaining new token pairs.",
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )
    token_type: str = Field(
        default="bearer",
        description="Token type. Always `bearer`.",
        examples=["bearer"],
    )


class RefreshRequest(BaseModel):
    """Payload to exchange a refresh token for a new token pair.

    Send the refresh_token received from login or a previous refresh.
    The old tokens remain valid until they expire naturally.
    """

    refresh_token: str = Field(
        ...,
        description="A valid, non-expired refresh token.",
        examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."],
    )


class ChangePasswordRequest(BaseModel):
    """Payload to change the current user's password.

    Requires the current password for verification before setting
    the new one. The user's existing sessions remain valid.
    """

    current_password: str = Field(
        ...,
        description="The user's current password for verification.",
        examples=["MyStr0ngP@ss!"],
    )
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password (8-128 characters).",
        examples=["NewS3cur3P@ss!"],
    )

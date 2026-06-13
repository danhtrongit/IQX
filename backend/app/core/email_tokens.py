"""Stateless signed tokens for email verification and password reset.

Both are short-lived JWTs that reuse the app's existing JWT machinery — no
database table or migration required.

- **Verification** tokens are signed with ``JWT_SECRET_KEY``.
- **Password-reset** tokens are signed with ``JWT_SECRET_KEY + hashed_password``
  so they are naturally single-use: once the user's password changes (including
  by completing the reset itself), every outstanding reset link for that user
  stops verifying.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import get_settings

EMAIL_VERIFY_TYPE = "email_verify"
PASSWORD_RESET_TYPE = "password_reset"


class EmailTokenError(Exception):
    """Raised when a verification / reset token is missing, malformed, or expired."""


def create_email_verify_token(user_id: uuid.UUID | str, email: str) -> str:
    """Create a verification token bound to ``user_id`` and ``email``."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "email": email,
        "type": EMAIL_VERIFY_TYPE,
        "iat": now,
        "exp": now + timedelta(hours=settings.EMAIL_VERIFY_TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_email_verify_token(token: str) -> dict[str, Any]:
    """Verify a verification token; raise :class:`EmailTokenError` if invalid."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise EmailTokenError("Liên kết xác thực không hợp lệ hoặc đã hết hạn") from exc
    if payload.get("type") != EMAIL_VERIFY_TYPE:
        raise EmailTokenError("Sai loại token")
    return payload


def create_password_reset_token(user_id: uuid.UUID | str, hashed_password: str) -> str:
    """Create a single-use password-reset token bound to the current password hash."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": PASSWORD_RESET_TYPE,
        "iat": now,
        "exp": now + timedelta(hours=settings.PASSWORD_RESET_TOKEN_TTL_HOURS),
    }
    key = settings.JWT_SECRET_KEY + hashed_password
    return jwt.encode(payload, key, algorithm=settings.JWT_ALGORITHM)


def read_unverified_subject(token: str) -> uuid.UUID:
    """Extract ``sub`` (user id) WITHOUT verifying the signature.

    Used only to locate the user so the reset token can then be re-verified
    against their *current* password hash. Never trust any other claim read
    this way.
    """
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise EmailTokenError("Liên kết đặt lại mật khẩu không hợp lệ") from exc


def decode_password_reset_token(token: str, hashed_password: str) -> dict[str, Any]:
    """Verify a reset token against ``hashed_password``; raise on any problem."""
    settings = get_settings()
    key = settings.JWT_SECRET_KEY + hashed_password
    try:
        payload = jwt.decode(token, key, algorithms=[settings.JWT_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise EmailTokenError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn") from exc
    if payload.get("type") != PASSWORD_RESET_TYPE:
        raise EmailTokenError("Sai loại token")
    return payload

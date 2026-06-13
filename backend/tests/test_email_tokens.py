"""Unit tests for stateless email/reset tokens."""

from __future__ import annotations

import uuid

import pytest

from app.core.email_tokens import (
    EmailTokenError,
    create_email_verify_token,
    create_password_reset_token,
    decode_email_verify_token,
    decode_password_reset_token,
    read_unverified_subject,
)


def test_verify_token_roundtrip():
    uid = uuid.uuid4()
    token = create_email_verify_token(uid, "a@b.com")
    payload = decode_email_verify_token(token)
    assert payload["sub"] == str(uid)
    assert payload["email"] == "a@b.com"
    assert payload["type"] == "email_verify"


def test_verify_token_rejects_garbage():
    with pytest.raises(EmailTokenError):
        decode_email_verify_token("not-a-real-token")


def test_verify_token_rejects_reset_token():
    """A reset token (different signing key) must not pass as a verify token."""
    token = create_password_reset_token(uuid.uuid4(), "some-hash")
    with pytest.raises(EmailTokenError):
        decode_email_verify_token(token)


def test_reset_token_roundtrip():
    uid = uuid.uuid4()
    hashed = "hashed-password-value"
    token = create_password_reset_token(uid, hashed)
    assert read_unverified_subject(token) == uid
    payload = decode_password_reset_token(token, hashed)
    assert payload["sub"] == str(uid)
    assert payload["type"] == "password_reset"


def test_reset_token_invalid_after_password_change():
    """Reset tokens are single-use: bound to the hash they were signed against."""
    uid = uuid.uuid4()
    token = create_password_reset_token(uid, "old-hash")
    with pytest.raises(EmailTokenError):
        decode_password_reset_token(token, "new-hash")


def test_reset_token_rejects_verify_token():
    """A verify token must not pass as a reset token even with a matching key part."""
    uid = uuid.uuid4()
    token = create_email_verify_token(uid, "a@b.com")
    with pytest.raises(EmailTokenError):
        # Wrong signing key anyway → invalid signature.
        decode_password_reset_token(token, "whatever")


def test_read_unverified_subject_rejects_garbage():
    with pytest.raises(EmailTokenError):
        read_unverified_subject("garbage")

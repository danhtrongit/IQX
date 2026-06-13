"""Tests for the email-backed auth flows: forgot/reset password, verify email,
and the EmailService transport gating."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email_tokens import create_email_verify_token, create_password_reset_token
from app.models.user import User

# ── forgot-password (no enumeration) ──────────────────────────────────────


@pytest.mark.asyncio
async def test_forgot_password_unknown_email_returns_200(client: AsyncClient):
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.com"})
    assert resp.status_code == 200
    assert "đặt lại mật khẩu" in resp.json()["message"].lower()


@pytest.mark.asyncio
async def test_forgot_password_existing_user_returns_200(client: AsyncClient, test_user: User):
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
    assert resp.status_code == 200
    # Identical response shape to the unknown-email case (no enumeration).
    assert "message" in resp.json()


@pytest.mark.asyncio
async def test_forgot_password_invalid_email_422(client: AsyncClient):
    resp = await client.post("/api/v1/auth/forgot-password", json={"email": "not-an-email"})
    assert resp.status_code == 422


# ── reset-password ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reset_password_happy_path(client: AsyncClient, test_user: User):
    token = create_password_reset_token(test_user.id, test_user.hashed_password)
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewStr0ng@Pass"},
    )
    assert resp.status_code == 200, resp.text

    # New password works; old one no longer does.
    ok = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "NewStr0ng@Pass"},
    )
    assert ok.status_code == 200
    old = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "Test@1234"},
    )
    assert old.status_code == 401


@pytest.mark.asyncio
async def test_reset_password_invalid_token_400(client: AsyncClient, test_user: User):
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "totally-invalid", "new_password": "NewStr0ng@Pass"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_is_single_use(client: AsyncClient, test_user: User):
    token = create_password_reset_token(test_user.id, test_user.hashed_password)
    first = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewStr0ng@Pass"},
    )
    assert first.status_code == 200
    # Re-using the same token must fail — the hash it was signed against changed.
    second = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "Another0ng@Pass"},
    )
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_reset_password_weak_password_422(client: AsyncClient, test_user: User):
    token = create_password_reset_token(test_user.id, test_user.hashed_password)
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "weak"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_reset_form_page_served(client: AsyncClient):
    resp = await client.get("/api/v1/auth/reset-password", params={"token": "abc"})
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "Đặt lại mật khẩu" in resp.text


# ── verify-email ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_email_happy_path(
    client: AsyncClient, test_user: User, db_session: AsyncSession
):
    assert test_user.is_email_verified is False
    token = create_email_verify_token(test_user.id, test_user.email)
    resp = await client.get("/api/v1/auth/verify-email", params={"token": token})
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]

    refreshed = (
        await db_session.execute(select(User).where(User.id == test_user.id))
    ).scalar_one()
    assert refreshed.is_email_verified is True
    assert refreshed.email_verified_at is not None


@pytest.mark.asyncio
async def test_verify_email_invalid_token_returns_400_page(client: AsyncClient):
    resp = await client.get("/api/v1/auth/verify-email", params={"token": "bogus"})
    assert resp.status_code == 400
    assert "text/html" in resp.headers["content-type"]
    assert "không hợp lệ" in resp.text


# ── EmailService transport gating ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_email_disabled_makes_no_http_call(monkeypatch):
    """With EMAIL_ENABLED off, send() returns False and never touches httpx."""
    from app.services import email as email_module

    def _boom(*args, **kwargs):
        raise AssertionError("httpx.AsyncClient must not be constructed when email is disabled")

    monkeypatch.setattr(email_module.httpx, "AsyncClient", _boom)
    sent = await email_module.EmailService().send(to="x@y.com", subject="s", html="<b>h</b>")
    assert sent is False


@pytest.mark.asyncio
async def test_email_enabled_posts_to_resend(monkeypatch):
    """With EMAIL_ENABLED on, send() POSTs the expected payload to Resend."""
    from app.services import email as email_module

    captured: dict = {}

    class _FakeResp:
        status_code = 200
        text = "{}"

    class _FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, headers=None):
            captured.update(url=url, json=json, headers=headers)
            return _FakeResp()

    settings = get_settings()
    monkeypatch.setattr(settings, "EMAIL_ENABLED", True)
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(settings, "EMAIL_FROM", "IQX <no-reply@iqx.vn>")
    monkeypatch.setattr(email_module.httpx, "AsyncClient", _FakeClient)

    sent = await email_module.EmailService().send(
        to="user@example.com", subject="Hello", html="<b>hi</b>", text="hi"
    )
    assert sent is True
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["headers"]["Authorization"] == "Bearer re_test_key"
    assert captured["json"]["from"] == "IQX <no-reply@iqx.vn>"
    assert captured["json"]["to"] == ["user@example.com"]
    assert captured["json"]["subject"] == "Hello"
    assert captured["json"]["html"] == "<b>hi</b>"
    assert captured["json"]["text"] == "hi"

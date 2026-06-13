"""Transactional email delivery via the Resend HTTP API.

Stateless and request-independent: instantiate freely (cheap) — it reads the
cached settings singleton and opens a short-lived ``httpx`` client per send.

When ``EMAIL_ENABLED`` is false (or no API key is set) sends are skipped and
logged instead, so local/dev and tests never hit the network. Send failures are
swallowed (logged, return ``False``) and must never break the calling flow.
"""

from __future__ import annotations

import logging
import uuid

import httpx

from app.core.config import get_settings
from app.core.email_tokens import create_email_verify_token, create_password_reset_token
from app.services.email_templates import render_password_reset_email, render_verification_email

logger = logging.getLogger(__name__)

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_TIMEOUT_SECONDS = 15.0


class EmailService:
    """Thin Resend client plus high-level helpers for each transactional email."""

    def __init__(self) -> None:
        self._settings = get_settings()

    # ── Link building ────────────────────────────────
    @property
    def _link_base(self) -> str:
        s = self._settings
        return (s.EMAIL_LINK_BASE_URL or s.APP_PUBLIC_URL).rstrip("/")

    def verify_link(self, token: str) -> str:
        return f"{self._link_base}/api/v1/auth/verify-email?token={token}"

    def reset_link(self, token: str) -> str:
        return f"{self._link_base}/api/v1/auth/reset-password?token={token}"

    # ── Transport ────────────────────────────────────
    async def send(self, *, to: str, subject: str, html: str, text: str | None = None) -> bool:
        """Send one email. Returns True on a 2xx from Resend, else False."""
        s = self._settings
        if not s.EMAIL_ENABLED or not s.RESEND_API_KEY:
            logger.info("[email-disabled] skip send to=%s subject=%r (EMAIL_ENABLED off)", to, subject)
            return False

        payload: dict[str, object] = {
            "from": s.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    _RESEND_ENDPOINT,
                    json=payload,
                    headers={"Authorization": f"Bearer {s.RESEND_API_KEY}"},
                )
        except Exception as exc:  # noqa: BLE001 — network/transport errors must not propagate
            logger.error("Resend transport error to=%s: %s", to, exc)
            return False

        if resp.status_code >= 400:
            logger.error("Resend send failed (%s) to=%s: %s", resp.status_code, to, resp.text[:300])
            return False
        logger.info("Email sent to=%s subject=%r", to, subject)
        return True

    # ── High-level helpers ───────────────────────────
    async def send_verification_email(
        self, *, user_id: uuid.UUID | str, email: str, full_name: str | None
    ) -> bool:
        token = create_email_verify_token(user_id, email)
        html_body, text_body = render_verification_email(
            full_name=full_name, verify_url=self.verify_link(token)
        )
        return await self.send(
            to=email,
            subject="Xác thực địa chỉ email của bạn",
            html=html_body,
            text=text_body,
        )

    async def send_password_reset_email(
        self, *, user_id: uuid.UUID | str, email: str, full_name: str | None, hashed_password: str
    ) -> bool:
        token = create_password_reset_token(user_id, hashed_password)
        html_body, text_body = render_password_reset_email(
            full_name=full_name, reset_url=self.reset_link(token)
        )
        return await self.send(
            to=email,
            subject="Đặt lại mật khẩu IQX",
            html=html_body,
            text=text_body,
        )

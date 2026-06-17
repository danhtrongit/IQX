"""Tests for Telegram account linking (webhook handler) + webhook endpoint."""

from __future__ import annotations

from httpx import AsyncClient

from app.services.telegram.linking import handle_update


async def test_handle_update_links_account(db_session, test_user, monkeypatch):
    sent: list = []

    async def fake_send(chat_id, text, **kw):  # noqa: ANN001
        sent.append((chat_id, text))

    async def fake_resolve(token):  # noqa: ANN001
        return test_user.id

    monkeypatch.setattr("app.services.telegram.linking.tg.send_message", fake_send)
    monkeypatch.setattr("app.services.telegram.linking.resolve_link_token", fake_resolve)

    await handle_update({"message": {"chat": {"id": 987654}, "text": "/start abc123"}}, db_session)

    await db_session.refresh(test_user)
    assert test_user.telegram_chat_id == "987654"
    assert test_user.telegram_linked_at is not None
    assert sent and "kết nối" in sent[0][1].lower()


async def test_handle_update_invalid_token(db_session, monkeypatch):
    sent: list = []

    async def fake_send(chat_id, text, **kw):  # noqa: ANN001
        sent.append(text)

    async def fake_resolve(token):  # noqa: ANN001
        return None

    monkeypatch.setattr("app.services.telegram.linking.tg.send_message", fake_send)
    monkeypatch.setattr("app.services.telegram.linking.resolve_link_token", fake_resolve)

    await handle_update({"message": {"chat": {"id": 1}, "text": "/start bad"}}, db_session)
    assert sent and ("không hợp lệ" in sent[0].lower() or "hết hạn" in sent[0].lower())


async def test_webhook_bad_secret_is_noop(client: AsyncClient):
    # secret unconfigured in tests → endpoint accepts but does nothing
    r = await client.post(
        "/api/v1/telegram/webhook/whatever",
        json={"message": {"chat": {"id": 1}, "text": "/start x"}},
    )
    assert r.status_code == 200 and r.json() == {"ok": True}

"""User alert API — subscribe/manage rules, Telegram linking, fired history.

Premium-gated (consistent with the backtester). Rules are scoped to the user's
watchlist; admins curate the 10 global presets via ``/admin/alerts``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from app.api.deps import DBSession, PremiumUser
from app.core.config import get_settings
from app.models.alert import AlertSide
from app.repositories.alert import (
    AlertEventRepository,
    AlertSignalRepository,
    UserAlertRuleRepository,
)
from app.schemas.alert import (
    AlertEventResponse,
    AlertSignalResponse,
    TelegramLinkResponse,
    TelegramStatusResponse,
    UserAlertRuleCreate,
    UserAlertRuleResponse,
    UserAlertRuleUpdate,
)
from app.services.ta.conditions import Combination, CombinationError, validate_combination
from app.services.telegram.linking import mint_link_token

router = APIRouter(prefix="/alerts", tags=["Cảnh báo"])


def _validate(combination: dict) -> None:
    try:
        validate_combination(Combination.from_dict(combination))
    except CombinationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Signal presets ───────────────────────────────────────────────────────────


@router.get("/signals", response_model=list[AlertSignalResponse])
async def list_signals(user: PremiumUser, db: DBSession) -> list[AlertSignalResponse]:
    """The 10 enabled presets users can subscribe to."""
    signals = await AlertSignalRepository(db).list_all(enabled_only=True)
    return [AlertSignalResponse.model_validate(s) for s in signals]


# ── User rules ───────────────────────────────────────────────────────────────


@router.get("/rules", response_model=list[UserAlertRuleResponse])
async def list_rules(user: PremiumUser, db: DBSession) -> list[UserAlertRuleResponse]:
    rules = await UserAlertRuleRepository(db).list_for_user(user.id)
    return [UserAlertRuleResponse.model_validate(r) for r in rules]


@router.post("/rules", response_model=UserAlertRuleResponse, status_code=201)
async def create_rule(body: UserAlertRuleCreate, user: PremiumUser, db: DBSession) -> UserAlertRuleResponse:
    repo = UserAlertRuleRepository(db)
    if body.signal_key:  # subscribe to a preset → copy-on-subscribe
        preset = await AlertSignalRepository(db).get(body.signal_key)
        if preset is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy tín hiệu")
        name = body.name or preset.message_title
        item = await repo.create(
            user_id=user.id,
            name=name,
            side=preset.side,
            combination=preset.combination,
            base_signal_key=preset.key,
            is_enabled=body.is_enabled,
        )
        return UserAlertRuleResponse.model_validate(item)

    # custom rule
    if not body.name or not body.side or body.combination is None:
        raise HTTPException(status_code=400, detail="Cần name, side và combination cho tín hiệu tùy chỉnh")
    combo = body.combination.to_dict()
    _validate(combo)
    item = await repo.create(
        user_id=user.id,
        name=body.name,
        side=AlertSide(body.side),
        combination=combo,
        base_signal_key=None,
        is_enabled=body.is_enabled,
    )
    return UserAlertRuleResponse.model_validate(item)


@router.put("/rules/{rule_id}", response_model=UserAlertRuleResponse)
async def update_rule(
    rule_id: uuid.UUID, body: UserAlertRuleUpdate, user: PremiumUser, db: DBSession
) -> UserAlertRuleResponse:
    repo = UserAlertRuleRepository(db)
    item = await repo.get(user.id, rule_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy cảnh báo")
    combo = None
    if body.combination is not None:
        combo = body.combination.to_dict()
        _validate(combo)
    item = await repo.update(item, name=body.name, combination=combo, is_enabled=body.is_enabled)
    return UserAlertRuleResponse.model_validate(item)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: uuid.UUID, user: PremiumUser, db: DBSession) -> None:
    await UserAlertRuleRepository(db).delete(user.id, rule_id)


# ── Fired history ────────────────────────────────────────────────────────────


@router.get("/events", response_model=list[AlertEventResponse])
async def list_events(user: PremiumUser, db: DBSession) -> list[AlertEventResponse]:
    events = await AlertEventRepository(db).list_for_user(user.id, limit=50)
    return [AlertEventResponse.model_validate(e) for e in events]


# ── Telegram linking ─────────────────────────────────────────────────────────


@router.get("/telegram", response_model=TelegramStatusResponse)
async def telegram_status(user: PremiumUser) -> TelegramStatusResponse:
    return TelegramStatusResponse(
        linked=bool(user.telegram_chat_id),
        linked_at=user.telegram_linked_at,
        bot_username=get_settings().TELEGRAM_BOT_USERNAME or None,
    )


@router.post("/telegram/link", response_model=TelegramLinkResponse)
async def telegram_link(user: PremiumUser) -> TelegramLinkResponse:
    if not get_settings().TELEGRAM_BOT_USERNAME:
        raise HTTPException(status_code=503, detail="Telegram chưa được cấu hình")
    minted = await mint_link_token(user.id)
    return TelegramLinkResponse(deep_link=minted["deep_link"], token=minted["token"])


@router.delete("/telegram", status_code=204)
async def telegram_unlink(user: PremiumUser, db: DBSession) -> None:
    user.telegram_chat_id = None
    user.telegram_linked_at = None
    db.add(user)
    await db.commit()

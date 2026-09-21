"""Authenticated, read-only IQX Bot v1 API.

GET handlers never initialize/fund a Bot and never start a market-data batch.
All ownership predicates are derived from the authenticated user.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Query
from sqlalchemy import and_, or_, select

from app.api.deps import CurrentUser, DBSession
from app.core.exceptions import BadRequestError
from app.models.bot_run import (
    BotAccount,
    BotDecision,
    BotExecution,
    BotInstance,
    BotMarketSnapshot,
    BotNavDaily,
    BotPosition,
    BotRunReceipt,
)
from app.models.journey_identity import JourneyIdentityUI
from app.models.symbol import Symbol
from app.schemas.bot import (
    BotJournalOut,
    BotOverviewOut,
    BotPerformanceOut,
    BotPositionsOut,
)
from app.services.bot.config import STANDARD_RULES
from app.services.journey_identity.service import JourneyIdentityService

router = APIRouter(prefix="/bot", tags=["Bot"])

DISCLOSURE = (
    "Bot demo IQX mô phỏng mua và bán theo giá đóng cửa của chính phiên tạo tín hiệu. "
    "Kết quả không tái hiện đầy đủ khả năng khớp lệnh, thanh khoản và thời gian thanh "
    "toán của giao dịch thực tế. Đây không phải cam kết lợi nhuận hoặc khuyến nghị "
    "giao dịch tiền thật."
)


def _decimal(value: Decimal | int | None) -> str | None:
    if value is None:
        return None
    return format(Decimal(value), "f")


async def _instance_account(db: DBSession, user_id: uuid.UUID):
    row = (
        await db.execute(
            select(BotInstance, BotAccount)
            .join(BotAccount, BotAccount.id == BotInstance.bot_account_id)
            .where(BotInstance.user_id == user_id, BotAccount.user_id == user_id)
        )
    ).one_or_none()
    return row if row is not None else (None, None)


async def _run_status(db: DBSession, user_id: uuid.UUID) -> dict:
    runs = (
        await db.execute(
            select(BotRunReceipt)
            .where(BotRunReceipt.user_id == user_id)
            .order_by(BotRunReceipt.trading_date.desc(), BotRunReceipt.started_at.desc())
        )
    ).scalars().all()
    latest = runs[0] if runs else None
    ui = await db.get(JourneyIdentityUI, user_id)
    cursor = next(
        (row for row in runs if ui and row.id == ui.last_animated_bot_run_id), None
    )
    unseen = sum(
        row.status == "succeeded"
        and (cursor is None or row.trading_date > cursor.trading_date)
        for row in runs
    )
    return {
        "status": latest.status if latest else "idle",
        "latest_run_id": latest.id if latest else None,
        "last_updated_at": (latest.completed_at or latest.started_at) if latest else None,
        "processed_unseen_sessions": unseen,
        "issues": latest.issues if latest else [],
    }


@router.get("", response_model=BotOverviewOut)
async def overview(user: CurrentUser, db: DBSession) -> BotOverviewOut:
    current_level, graduated_at = await JourneyIdentityService(db).progress(user.id)
    instance, account = await _instance_account(db, user.id)
    run_status = await _run_status(db, user.id)
    if graduated_at is not None and instance is None:
        run_status["issues"] = [
            *run_status["issues"],
            {
                "code": "not_initialized",
                "symbol": None,
                "detail": "Bot chưa được service tốt nghiệp khởi tạo; GET không tự cấp vốn.",
            },
        ]
    latest_nav = None
    if account is not None:
        latest_nav = (
            await db.execute(
                select(BotNavDaily)
                .where(BotNavDaily.bot_account_id == account.id)
                .order_by(BotNavDaily.trading_date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    valuation_complete = latest_nav.valuation_complete if latest_nav else True
    nav_vnd = (
        latest_nav.nav_vnd
        if latest_nav is not None and latest_nav.valuation_complete
        else account.cash_vnd if account is not None and latest_nav is None else None
    )
    return BotOverviewOut.model_validate(
        {
            "eligible": graduated_at is not None,
            "current_level": current_level,
            "cap6_graduated_at": graduated_at,
            "disclosure": DISCLOSURE,
            "bot": (
                {
                    "strategy_id": instance.strategy_id,
                    "strategy_version": instance.strategy_version,
                    "execution_model": instance.execution_model,
                    "initial_cash_vnd": str(account.initial_cash_vnd),
                    "activated_at": instance.activated_at,
                }
                if instance is not None and account is not None
                else None
            ),
            "account": (
                {
                    "cash_vnd": str(latest_nav.cash_vnd if latest_nav else account.cash_vnd),
                    "market_value_vnd": (
                        str(latest_nav.market_value_vnd)
                        if latest_nav and latest_nav.market_value_vnd is not None
                        else "0" if latest_nav is None else None
                    ),
                    "nav_vnd": str(nav_vnd) if nav_vnd is not None else None,
                    "pnl_total_net_vnd": (
                        str(nav_vnd - STANDARD_RULES.initial_cash_vnd)
                        if nav_vnd is not None else None
                    ),
                    "return_total": (
                        _decimal(Decimal(nav_vnd) / Decimal(STANDARD_RULES.initial_cash_vnd) - Decimal(1))
                        if nav_vnd is not None else None
                    ),
                    "valuation_complete": valuation_complete,
                    "as_of_session": latest_nav.trading_date if latest_nav else None,
                }
                if account is not None
                else None
            ),
            "bot_run": run_status,
        }
    )


async def _latest_snapshot(db: DBSession, account_id: uuid.UUID):
    return (
        await db.execute(
            select(BotMarketSnapshot)
            .join(BotRunReceipt, BotRunReceipt.id == BotMarketSnapshot.bot_run_id)
            .where(BotRunReceipt.bot_account_id == account_id)
            .order_by(BotRunReceipt.trading_date.desc(), BotRunReceipt.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


@router.get("/positions", response_model=BotPositionsOut)
async def positions(user: CurrentUser, db: DBSession) -> BotPositionsOut:
    _instance, account = await _instance_account(db, user.id)
    if account is None:
        return BotPositionsOut(items=[], valuation_complete=False, as_of_session=None)
    rows = (
        await db.execute(
            select(BotPosition)
            .where(BotPosition.bot_account_id == account.id, BotPosition.status == "open")
            .order_by(BotPosition.symbol)
        )
    ).scalars().all()
    sectors: dict[str, str | None] = dict(
        (
            await db.execute(
                select(Symbol.symbol, Symbol.icb_lv2).where(
                    Symbol.symbol.in_([row.symbol for row in rows] or [""])
                )
            )
        ).all()
    )
    snapshot = await _latest_snapshot(db, account.id)
    symbols = (snapshot.payload.get("symbols") or {}) if snapshot is not None else {}
    latest_nav = (
        await db.execute(
            select(BotNavDaily)
            .where(BotNavDaily.bot_account_id == account.id)
            .order_by(BotNavDaily.trading_date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    items = []
    complete = snapshot is not None
    for row in rows:
        symbol_row = symbols.get(row.symbol) or {}
        close = symbol_row.get("close_vnd")
        if (
            not isinstance(close, int)
            or close <= 0
            or symbol_row.get("close_is_official") is not True
        ):
            close = None
            complete = False
        market_value = row.qty_open * close if close is not None else None
        nav = (
            latest_nav.nav_vnd
            if snapshot is not None
            and latest_nav
            and latest_nav.valuation_complete
            and latest_nav.trading_date == snapshot.trading_date
            else None
        )
        weight = (
            Decimal(market_value) * Decimal(100) / Decimal(nav)
            if market_value is not None and nav
            else None
        )
        pnl = (
            market_value - row.entry_value_vnd - row.entry_fee_vnd
            if market_value is not None
            else None
        )
        items.append(
            {
                "id": row.id,
                "symbol": row.symbol,
                "qty": row.qty_open,
                "entry_price_vnd": str(row.entry_price_vnd),
                "current_close_vnd": str(close) if close is not None else None,
                "market_value_vnd": str(market_value) if market_value is not None else None,
                "weight_pct": _decimal(weight),
                "amplitude_at_entry_vnd": _decimal(row.amplitude_at_entry_vnd),
                "amplitude_source_ref": row.amplitude_source_ref,
                "stop_loss_vnd": _decimal(row.stop_loss_vnd),
                "take_profit_vnd": _decimal(row.take_profit_vnd),
                "unrealized_pnl_net_vnd": str(pnl) if pnl is not None else None,
                "filter_ids": row.filter_ids,
                "opened_session": row.opened_session,
                "opened_at": row.opened_at,
                "sector": sectors.get(row.symbol),
                "source_refs": row.source_refs,
            }
        )
    return BotPositionsOut.model_validate(
        {
            "items": items,
            "valuation_complete": complete and bool(
                latest_nav
                and snapshot is not None
                and latest_nav.valuation_complete
                and latest_nav.trading_date == snapshot.trading_date
            ),
            "as_of_session": snapshot.trading_date if snapshot else None,
        }
    )


@router.get("/journal", response_model=BotJournalOut)
async def journal(
    user: CurrentUser,
    db: DBSession,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=30, ge=1, le=100),
) -> BotJournalOut:
    _instance, account = await _instance_account(db, user.id)
    if account is None:
        return BotJournalOut(items=[], next_cursor=None, issues=[])
    conditions = [
        BotRunReceipt.user_id == user.id,
        BotRunReceipt.bot_account_id == account.id,
    ]
    if cursor is not None:
        cursor_row = (
            await db.execute(
                select(BotDecision)
                .join(BotRunReceipt, BotRunReceipt.id == BotDecision.bot_run_id)
                .where(BotDecision.id == cursor, BotRunReceipt.user_id == user.id)
            )
        ).scalar_one_or_none()
        if cursor_row is None:
            raise BadRequestError("Cursor nhật ký không hợp lệ")
        conditions.append(
            or_(
                BotDecision.created_at < cursor_row.created_at,
                and_(BotDecision.created_at == cursor_row.created_at, BotDecision.id < cursor_row.id),
            )
        )
    rows = (
        await db.execute(
            select(BotDecision, BotRunReceipt)
            .join(BotRunReceipt, BotRunReceipt.id == BotDecision.bot_run_id)
            .where(*conditions)
            .order_by(BotDecision.created_at.desc(), BotDecision.id.desc())
            .limit(limit + 1)
        )
    ).all()
    page, has_more = rows[:limit], len(rows) > limit
    execution_ids = [decision.execution_id for decision, _run in page if decision.execution_id]
    executions = {
        row.id: row
        for row in (
            await db.execute(
                select(BotExecution).where(BotExecution.id.in_(execution_ids or [uuid.uuid4()]))
            )
        ).scalars().all()
    }
    items = []
    for decision, run in page:
        execution = executions.get(decision.execution_id)
        items.append(
            {
                "id": decision.id,
                "run_id": run.id,
                "trading_date": run.trading_date,
                "action": decision.action,
                "reason_code": decision.reason_code,
                "reason": decision.reason,
                "execution": (
                    {
                        "id": execution.id,
                        "side": execution.side,
                        "qty": execution.qty,
                        "price_vnd": str(execution.price_vnd),
                        "gross_value_vnd": str(execution.gross_value_vnd),
                        "fee_vnd": str(execution.fee_vnd),
                        "tax_vnd": str(execution.tax_vnd),
                        "net_cash_delta_vnd": str(execution.net_cash_delta_vnd),
                    }
                    if execution is not None
                    else None
                ),
                "symbol": decision.symbol,
                "filter_ids": decision.filter_ids,
                "supporting_count": execution.supporting_count if execution else None,
                "threshold_vnd": _decimal(decision.threshold_vnd),
                "source_refs": decision.data_refs,
                "created_at": decision.created_at,
            }
        )
    latest = (
        await db.execute(
            select(BotRunReceipt)
            .where(BotRunReceipt.bot_account_id == account.id)
            .order_by(BotRunReceipt.trading_date.desc(), BotRunReceipt.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return BotJournalOut.model_validate(
        {
            "items": items,
            "next_cursor": page[-1][0].id if has_more and page else None,
            "issues": latest.issues if latest else [],
        }
    )


@router.get("/performance", response_model=BotPerformanceOut)
async def performance(
    user: CurrentUser,
    db: DBSession,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
) -> BotPerformanceOut:
    if from_date and to_date and from_date > to_date:
        raise BadRequestError("Khoảng ngày hiệu suất không hợp lệ")
    _instance, account = await _instance_account(db, user.id)
    if account is None:
        return BotPerformanceOut(base=None, series=[], comparison_available=False)
    query = select(BotNavDaily).where(BotNavDaily.bot_account_id == account.id)
    if from_date:
        query = query.where(BotNavDaily.trading_date >= from_date)
    if to_date:
        query = query.where(BotNavDaily.trading_date <= to_date)
    rows = (await db.execute(query.order_by(BotNavDaily.trading_date))).scalars().all()
    complete = [
        row for row in rows
        if row.valuation_complete and row.nav_vnd is not None and row.nav_vnd > 0
    ]
    common = [row for row in complete if row.vnindex is not None and row.vnindex > 0]
    base = common[0] if common else (complete[0] if complete else None)
    comparison_available = bool(common)
    points = []
    for row in rows:
        bot_return = None
        index_return = None
        if (
            base is not None
            and base.nav_vnd is not None
            and row.valuation_complete
            and row.nav_vnd is not None
        ):
            bot_return = Decimal(row.nav_vnd) / Decimal(base.nav_vnd) - Decimal(1)
        if base is not None and base.vnindex and row.vnindex is not None:
            index_return = Decimal(row.vnindex) / Decimal(base.vnindex) - Decimal(1)
        points.append(
            {
                "trading_date": row.trading_date,
                "cash_vnd": str(row.cash_vnd),
                "market_value_vnd": (
                    str(row.market_value_vnd) if row.market_value_vnd is not None else None
                ),
                "nav_vnd": str(row.nav_vnd) if row.nav_vnd is not None else None,
                "valuation_complete": row.valuation_complete,
                "bot_return_since_base": _decimal(bot_return),
                "vnindex_value": _decimal(row.vnindex),
                "vnindex_return_since_base": _decimal(index_return),
            }
        )
    return BotPerformanceOut.model_validate(
        {
            "base": (
                {
                    "trading_date": base.trading_date,
                    "bot_nav_vnd": str(base.nav_vnd),
                    "vnindex_value": _decimal(base.vnindex),
                }
                if base is not None
                else None
            ),
            "series": points,
            "comparison_available": comparison_available,
        }
    )

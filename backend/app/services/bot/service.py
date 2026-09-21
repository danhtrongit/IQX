"""Transactional lifecycle and same-session-close execution for Bot v1."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.bot_run import (
    BotAccount,
    BotCashLedger,
    BotDecision,
    BotExecution,
    BotInstance,
    BotMarketSnapshot,
    BotNavDaily,
    BotPosition,
    BotRunReceipt,
)
from app.models.cap6 import Cap6Progress
from app.services.bot.config import STANDARD_RULES
from app.services.bot.data import BotSnapshotProvider, LiveBotSnapshotProvider, live_session_ready
from app.services.bot.domain import (
    Candidate,
    FeeRules,
    LayerEvidence,
    candidate_gate,
    canonical_hash,
    compute_buy_quantity,
    compute_exit_thresholds,
    decimal_value,
    exit_signal,
    rank_candidates,
    round_bps,
)

logger = logging.getLogger(__name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

CRITICAL_ISSUES = {
    "filter_data_incomplete",
    "missing_security_status",
    "missing_official_close",
    "source_error",
    "valuation_incomplete",
    "reconciliation_failed",
    "snapshot_hash_mismatch",
    "unsupported_rule_version",
}


def _user_id(user: Any) -> uuid.UUID:
    value = getattr(user, "id", user)
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _issue(code: str, detail: str, symbol: str | None = None) -> dict[str, Any]:
    return {"code": code, "symbol": symbol, "detail": detail}


def _dedupe_issues(issues: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str | None, str | None]] = set()
    out: list[dict[str, Any]] = []
    for issue in issues:
        code = str(issue.get("code") or "source_error")
        row: dict[str, str | None] = {
            "code": code,
            "symbol": str(issue["symbol"]) if issue.get("symbol") else None,
            "detail": str(issue["detail"]) if issue.get("detail") else None,
        }
        key = (code, row["symbol"], row["detail"])
        if key not in seen:
            seen.add(key)
            out.append(row)
    return out


class BotService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def initialize(self, user_id: uuid.UUID) -> BotInstance | None:
        """Create/fund exactly once, only after the backend Cap-6 timestamp exists."""
        progress = (
            await self.db.execute(
                select(Cap6Progress)
                .where(Cap6Progress.user_id == user_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if progress is None or progress.graduated_at is None:
            return None
        instance = (
            await self.db.execute(select(BotInstance).where(BotInstance.user_id == user_id))
        ).scalar_one_or_none()
        if instance is not None:
            return instance

        account = (
            await self.db.execute(select(BotAccount).where(BotAccount.user_id == user_id))
        ).scalar_one_or_none()
        now = datetime.now(UTC)
        if account is None:
            account = BotAccount(
                user_id=user_id,
                initial_cash_vnd=STANDARD_RULES.initial_cash_vnd,
                cash_vnd=STANDARD_RULES.initial_cash_vnd,
                status="active",
                activated_at=now,
            )
            self.db.add(account)
            await self.db.flush()
        funding_key = f"bot:v1:funding:{user_id}"
        funding = (
            await self.db.execute(
                select(BotCashLedger).where(BotCashLedger.idempotency_key == funding_key)
            )
        ).scalar_one_or_none()
        if funding is None:
            other_entries = (
                await self.db.execute(
                    select(func.count(BotCashLedger.id)).where(
                        BotCashLedger.bot_account_id == account.id
                    )
                )
            ).scalar_one()
            if other_entries or account.cash_vnd != STANDARD_RULES.initial_cash_vnd:
                raise RuntimeError("Không thể phục hồi bút toán vốn Bot mà không đổi số dư")
            self.db.add(
                BotCashLedger(
                    bot_account_id=account.id,
                    execution_id=None,
                    kind="initial_funding",
                    amount_vnd=STANDARD_RULES.initial_cash_vnd,
                    balance_after_vnd=STANDARD_RULES.initial_cash_vnd,
                    idempotency_key=funding_key,
                    note="Vốn demo Bot IQX standard v1, cấp đúng một lần",
                    created_at=now,
                )
            )
        instance = BotInstance(
            user_id=user_id,
            bot_account_id=account.id,
            strategy_id=STANDARD_RULES.strategy_id,
            strategy_version=STANDARD_RULES.strategy_version,
            execution_model=STANDARD_RULES.execution_model,
            cap6_graduated_at=progress.graduated_at,
            activated_at=now,
        )
        self.db.add(instance)
        await self.db.flush()
        return instance

    async def _instance_for_update(self, user_id: uuid.UUID) -> tuple[BotInstance, BotAccount]:
        instance = (
            await self.db.execute(
                select(BotInstance).where(BotInstance.user_id == user_id).with_for_update()
            )
        ).scalar_one_or_none()
        if instance is None:
            initialized = await self.initialize(user_id)
            if initialized is None:
                raise ValueError("Người dùng chưa tốt nghiệp Cấp 6")
            instance = initialized
        account = (
            await self.db.execute(
                select(BotAccount).where(BotAccount.id == instance.bot_account_id).with_for_update()
            )
        ).scalar_one()
        if account.status != "active":
            raise RuntimeError("Tài khoản Bot đang tạm dừng")
        return instance, account

    async def _decision(
        self,
        *,
        run: BotRunReceipt,
        key: str,
        symbol: str | None,
        action: str,
        reason_code: str,
        reason: str,
        filter_ids: Sequence[str] = (),
        rank_tuple: Sequence[Any] | None = None,
        data_refs: dict[str, Any] | None = None,
        budget_vnd: int | None = None,
        proposed_qty: int | None = None,
        threshold_vnd: Decimal | None = None,
        execution_id: uuid.UUID | None = None,
    ) -> BotDecision:
        existing = (
            await self.db.execute(select(BotDecision).where(BotDecision.idempotency_key == key))
        ).scalar_one_or_none()
        if existing is not None:
            return existing
        row = BotDecision(
            bot_run_id=run.id,
            idempotency_key=key,
            symbol=symbol,
            action=action,
            reason_code=reason_code,
            reason=reason,
            filter_ids=list(filter_ids),
            rank_tuple=list(rank_tuple) if rank_tuple is not None else None,
            data_refs=data_refs or {},
            budget_vnd=budget_vnd,
            proposed_qty=proposed_qty,
            threshold_vnd=threshold_vnd,
            execution_id=execution_id,
            created_at=datetime.now(UTC),
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def _sell(
        self,
        run: BotRunReceipt,
        account: BotAccount,
        position: BotPosition,
        close_vnd: int,
        reason_code: str,
        fee_rules: FeeRules,
        snapshot_hash: str,
    ) -> BotExecution:
        key = f"bot:v1:{account.id}:{run.trading_date}:{position.symbol}:sell"
        existing = (
            await self.db.execute(select(BotExecution).where(BotExecution.idempotency_key == key))
        ).scalar_one_or_none()
        if existing is not None:
            return existing
        qty = position.qty_open
        gross = qty * close_vnd
        fee = round_bps(gross, fee_rules.sell_fee_rate_bps)
        tax = round_bps(gross, fee_rules.sell_tax_rate_bps)
        net = gross - fee - tax
        execution = BotExecution(
            bot_run_id=run.id,
            bot_account_id=account.id,
            position_id=position.id,
            symbol=position.symbol,
            side="sell",
            qty=qty,
            price_vnd=close_vnd,
            signal_session=run.trading_date,
            price_session=run.trading_date,
            trading_date=run.trading_date,
            executed_at=datetime.now(UTC),
            gross_value_vnd=gross,
            fee_vnd=fee,
            tax_vnd=tax,
            net_cash_delta_vnd=net,
            execution_model=STANDARD_RULES.execution_model,
            idempotency_key=key,
            filter_ids=position.filter_ids,
            supporting_count=None,
            layer_snapshot={},
            reason=reason_code,
            source_snapshot_id=snapshot_hash,
        )
        self.db.add(execution)
        await self.db.flush()
        account.cash_vnd += net
        position.qty_open = 0
        position.status = "closed"
        position.closed_session = run.trading_date
        position.closed_at = execution.executed_at
        position.sell_execution_id = execution.id
        self.db.add(
            BotCashLedger(
                bot_account_id=account.id,
                execution_id=execution.id,
                kind="sell",
                amount_vnd=net,
                balance_after_vnd=account.cash_vnd,
                idempotency_key=f"{key}:cash",
                note=f"Bán mô phỏng {qty} {position.symbol} tại đóng cửa {run.trading_date}",
                created_at=execution.executed_at,
            )
        )
        await self._decision(
            run=run,
            key=f"{key}:decision",
            symbol=position.symbol,
            action="sell",
            reason_code=reason_code,
            reason=(
                f"Giá đóng cửa {close_vnd} đã chạm mốc {reason_code}; Bot bán mô phỏng "
                f"toàn bộ {qty} cổ phiếu tại đóng cửa phiên này."
            ),
            filter_ids=position.filter_ids,
            data_refs=position.source_refs,
            threshold_vnd=(position.stop_loss_vnd if reason_code == "stop_loss" else position.take_profit_vnd),
            execution_id=execution.id,
        )
        await self.db.flush()
        return execution

    async def _buy(
        self,
        run: BotRunReceipt,
        account: BotAccount,
        candidate: Candidate,
        sizing: Any,
        thresholds: tuple[Decimal, Decimal],
        snapshot_hash: str,
    ) -> BotExecution:
        key = f"bot:v1:{account.id}:{run.trading_date}:{candidate.symbol}:buy"
        existing = (
            await self.db.execute(select(BotExecution).where(BotExecution.idempotency_key == key))
        ).scalar_one_or_none()
        if existing is not None:
            return existing
        now = datetime.now(UTC)
        stop, take = thresholds
        position = BotPosition(
            bot_account_id=account.id,
            symbol=candidate.symbol,
            qty_open=sizing.quantity,
            entry_price_vnd=candidate.close_vnd,
            entry_value_vnd=sizing.gross_vnd,
            entry_fee_vnd=sizing.fee_vnd,
            amplitude_at_entry_vnd=candidate.l1_amplitude_vnd,
            amplitude_source_ref=candidate.l1_amplitude_source_ref,
            stop_loss_vnd=stop,
            take_profit_vnd=take,
            opened_session=run.trading_date,
            opened_at=now,
            status="open",
            filter_ids=list(candidate.filter_ids),
            source_refs=dict(candidate.source_refs),
        )
        self.db.add(position)
        await self.db.flush()
        execution = BotExecution(
            bot_run_id=run.id,
            bot_account_id=account.id,
            position_id=position.id,
            symbol=candidate.symbol,
            side="buy",
            qty=sizing.quantity,
            price_vnd=candidate.close_vnd,
            signal_session=run.trading_date,
            price_session=run.trading_date,
            trading_date=run.trading_date,
            executed_at=now,
            gross_value_vnd=sizing.gross_vnd,
            fee_vnd=sizing.fee_vnd,
            tax_vnd=0,
            net_cash_delta_vnd=-sizing.total_vnd,
            execution_model=STANDARD_RULES.execution_model,
            idempotency_key=key,
            filter_ids=list(candidate.filter_ids),
            supporting_count=candidate.supporting_count,
            layer_snapshot={
                name: {
                    "verdict": value.verdict,
                    "raw_level": value.raw_level,
                    "is_very_negative": value.is_very_negative,
                    "source_ref": value.source_ref,
                }
                for name, value in candidate.layers.items()
            },
            reason="bought",
            source_snapshot_id=snapshot_hash,
        )
        self.db.add(execution)
        await self.db.flush()
        position.buy_execution_id = execution.id
        account.cash_vnd -= sizing.total_vnd
        self.db.add(
            BotCashLedger(
                bot_account_id=account.id,
                execution_id=execution.id,
                kind="buy",
                amount_vnd=-sizing.total_vnd,
                balance_after_vnd=account.cash_vnd,
                idempotency_key=f"{key}:cash",
                note=f"Mua mô phỏng {sizing.quantity} {candidate.symbol} tại đóng cửa {run.trading_date}",
                created_at=now,
            )
        )
        await self._decision(
            run=run,
            key=f"{key}:decision",
            symbol=candidate.symbol,
            action="buy",
            reason_code="bought",
            reason=(
                f"Bot mua mô phỏng {sizing.quantity} {candidate.symbol} tại đóng cửa "
                f"{run.trading_date}: {candidate.supporting_count}/5 lớp Ủng hộ, xuất hiện "
                f"trong {len(candidate.filter_ids)} bộ lọc và vượt qua các kiểm tra vốn."
            ),
            filter_ids=candidate.filter_ids,
            rank_tuple=candidate.rank_tuple,
            data_refs=dict(candidate.source_refs),
            budget_vnd=(
                run.nav_basis_vnd * STANDARD_RULES.buy_budget_nav_pct // 100
                if run.nav_basis_vnd is not None
                else None
            ),
            proposed_qty=sizing.quantity,
            execution_id=execution.id,
        )
        await self.db.flush()
        return execution

    @staticmethod
    def _candidate(symbol: str, payload: dict[str, Any]) -> Candidate | None:
        close = payload.get("close_vnd")
        avg20 = payload.get("trading_value_avg20_vnd")
        if not isinstance(close, int) or close <= 0 or not isinstance(avg20, int):
            return None
        layers: dict[str, LayerEvidence] = {}
        for name, row in (payload.get("layers") or {}).items():
            if not isinstance(row, dict) or row.get("verdict") not in ("ok", "neu", "bad"):
                continue
            layers[name] = LayerEvidence(
                verdict=row["verdict"],
                raw_level=str(row.get("raw_level") or ""),
                is_very_negative=row.get("is_very_negative") if isinstance(row.get("is_very_negative"), bool) else None,
                source_ref=str(row.get("source_ref") or ""),
            )
        amplitude = payload.get("l1_amplitude_vnd")
        return Candidate(
            symbol=symbol,
            close_vnd=close,
            trading_value_avg20_vnd=avg20,
            filter_ids=tuple(payload.get("filter_ids") or ()),
            layers=layers,
            l1_amplitude_vnd=decimal_value(amplitude),
            l1_amplitude_source_ref=payload.get("l1_amplitude_source_ref"),
            source_refs=payload.get("source_refs") or {},
        )

    async def _reconcile(self, account: BotAccount) -> bool:
        ledgers = (
            await self.db.execute(
                select(BotCashLedger)
                .where(BotCashLedger.bot_account_id == account.id)
                .order_by(BotCashLedger.created_at, BotCashLedger.id)
            )
        ).scalars().all()
        executions = (
            await self.db.execute(
                select(BotExecution).where(BotExecution.bot_account_id == account.id)
            )
        ).scalars().all()
        execution_by_id = {row.id: row for row in executions}
        ledger_by_execution: dict[uuid.UUID, list[BotCashLedger]] = {}
        running_balance = 0
        ledger_ok = True
        funding_count = 0
        for ledger in ledgers:
            running_balance += ledger.amount_vnd
            ledger_ok = ledger_ok and ledger.balance_after_vnd == running_balance
            if ledger.execution_id is None:
                funding_count += int(
                    ledger.kind == "initial_funding"
                    and ledger.amount_vnd == STANDARD_RULES.initial_cash_vnd
                )
                ledger_ok = ledger_ok and ledger.kind == "initial_funding"
                continue
            execution = execution_by_id.get(ledger.execution_id)
            if execution is None:
                ledger_ok = False
                continue
            ledger_by_execution.setdefault(ledger.execution_id, []).append(ledger)
            ledger_ok = ledger_ok and ledger.kind == execution.side
            ledger_ok = ledger_ok and ledger.amount_vnd == execution.net_cash_delta_vnd

        for execution in executions:
            expected_gross = execution.qty * execution.price_vnd
            expected_delta = (
                -(execution.gross_value_vnd + execution.fee_vnd)
                if execution.side == "buy"
                else execution.gross_value_vnd - execution.fee_vnd - execution.tax_vnd
            )
            ledger_ok = ledger_ok and execution.gross_value_vnd == expected_gross
            ledger_ok = ledger_ok and execution.net_cash_delta_vnd == expected_delta
            ledger_ok = ledger_ok and len(ledger_by_execution.get(execution.id, [])) == 1

        rows = (
            await self.db.execute(select(BotPosition).where(BotPosition.bot_account_id == account.id))
        ).scalars().all()
        positions_ok = all(
            (row.status == "open" and row.qty_open > 0)
            or (row.status == "closed" and row.qty_open == 0)
            for row in rows
        )
        positions_ok = positions_ok and all(
            row.buy_execution_id in execution_by_id
            and execution_by_id[row.buy_execution_id].side == "buy"
            and execution_by_id[row.buy_execution_id].position_id == row.id
            and (
                row.sell_execution_id is None
                or (
                    row.sell_execution_id in execution_by_id
                    and execution_by_id[row.sell_execution_id].side == "sell"
                    and execution_by_id[row.sell_execution_id].position_id == row.id
                )
            )
            for row in rows
        )
        return (
            ledger_ok
            and funding_count == 1
            and running_balance == account.cash_vnd
            and positions_ok
        )

    async def prepare(
        self,
        user_id: uuid.UUID,
        trading_date: date,
        *,
        provider: BotSnapshotProvider | None = None,
    ) -> BotRunReceipt:
        """Persist the immutable session boundary before accounting effects.

        The scheduled worker commits this checkpoint in its own transaction,
        then reacquires the account lock for execution. A crash during sells or
        buys can therefore roll back all accounting effects without losing the
        original snapshot, NAV basis, or blocked-symbol set.
        """
        _instance, account = await self._instance_for_update(user_id)
        if _instance.activated_at.astimezone(VN_TZ).date() > trading_date:
            raise ValueError("Không chạy Bot cho phiên trước khi kích hoạt")
        run = (
            await self.db.execute(
                select(BotRunReceipt)
                .where(
                    BotRunReceipt.user_id == user_id,
                    BotRunReceipt.trading_date == trading_date,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if run is not None and run.bot_account_id == account.id and run.status == "succeeded":
            return run

        positions = (
            await self.db.execute(
                select(BotPosition)
                .where(BotPosition.bot_account_id == account.id, BotPosition.status == "open")
                .order_by(BotPosition.symbol)
                .with_for_update()
            )
        ).scalars().all()
        now = datetime.now(UTC)
        if run is None:
            run = BotRunReceipt(
                user_id=user_id,
                bot_account_id=account.id,
                trading_date=trading_date,
                status="running",
                started_at=now,
                completed_at=None,
                issues=[],
                strategy_id=STANDARD_RULES.strategy_id,
                strategy_version=STANDARD_RULES.strategy_version,
                execution_model=STANDARD_RULES.execution_model,
                rule_snapshot=STANDARD_RULES.snapshot(),
                rule_hash=STANDARD_RULES.digest(),
                blocked_symbols_at_start=sorted(row.symbol for row in positions),
                buy_count=0,
                sell_count=0,
            )
            self.db.add(run)
            await self.db.flush()
        else:
            if run.bot_account_id not in (None, account.id):
                raise RuntimeError("Receipt phiên đã thuộc tài khoản Bot khác")
            is_legacy = run.bot_account_id is None
            if is_legacy:
                run.bot_account_id = account.id
                run.strategy_id = STANDARD_RULES.strategy_id
                run.strategy_version = STANDARD_RULES.strategy_version
                run.execution_model = STANDARD_RULES.execution_model
                run.rule_snapshot = STANDARD_RULES.snapshot()
                run.rule_hash = STANDARD_RULES.digest()
                run.blocked_symbols_at_start = sorted(row.symbol for row in positions)
            run.status = "running"
            run.completed_at = None

        if run.rule_hash != STANDARD_RULES.digest() or run.rule_snapshot != STANDARD_RULES.snapshot():
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = [_issue("unsupported_rule_version", "Worker không hỗ trợ rule snapshot")]
            await self.db.flush()
            return run
        if not await self._reconcile(account):
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = [_issue("reconciliation_failed", "Sổ Bot không hợp lệ trước checkpoint")]
            await self.db.flush()
            return run

        snapshot = (
            await self.db.execute(
                select(BotMarketSnapshot).where(BotMarketSnapshot.bot_run_id == run.id)
            )
        ).scalar_one_or_none()
        if snapshot is None:
            provider = provider or LiveBotSnapshotProvider(self.db)
            try:
                payload = await provider.build_snapshot(
                    trading_date, open_symbols=run.blocked_symbols_at_start
                )
            except Exception as exc:  # noqa: BLE001
                run.status = "failed"
                run.completed_at = datetime.now(UTC)
                run.issues = [
                    _issue("source_error", f"Không chụp được snapshot: {type(exc).__name__}")
                ]
                await self.db.flush()
                return run
            digest = canonical_hash({k: v for k, v in payload.items() if k != "snapshot_hash"})
            payload = {**payload, "snapshot_hash": digest}
            snapshot = BotMarketSnapshot(
                bot_run_id=run.id,
                trading_date=trading_date,
                data_version=str(payload.get("data_version") or f"bot-v1:{trading_date}"),
                observed_at=now,
                close_is_official=bool(payload.get("close_is_official")),
                buy_inputs_complete=bool(payload.get("buy_inputs_complete")),
                snapshot_hash=digest,
                payload=payload,
                source_refs=payload.get("source_refs") or {},
            )
            self.db.add(snapshot)
            run.source_snapshot_hash = digest
            await self.db.flush()

        payload = snapshot.payload
        actual_hash = canonical_hash({k: v for k, v in payload.items() if k != "snapshot_hash"})
        if (
            actual_hash != snapshot.snapshot_hash
            or run.source_snapshot_hash != snapshot.snapshot_hash
            or payload.get("trading_date") != trading_date.isoformat()
        ):
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = [_issue("snapshot_hash_mismatch", "Snapshot checkpoint không hợp lệ")]
            await self.db.flush()
            return run

        if run.nav_basis_vnd is None:
            symbols = payload.get("symbols") or {}
            market_value = 0
            issues = list(payload.get("issues") or [])
            complete = True
            for position in positions:
                symbol_row = symbols.get(position.symbol) or {}
                close = symbol_row.get("close_vnd")
                if (
                    not isinstance(close, int)
                    or close <= 0
                    or symbol_row.get("close_is_official") is not True
                ):
                    complete = False
                    issues.append(
                        _issue(
                            "missing_official_close",
                            "Thiếu đóng cửa để khóa NAV nền",
                            position.symbol,
                        )
                    )
                else:
                    market_value += position.qty_open * close
            if complete:
                run.nav_basis_vnd = account.cash_vnd + market_value
            run.issues = _dedupe_issues(issues)
        await self.db.flush()
        return run

    async def run(
        self,
        user_id: uuid.UUID,
        trading_date: date,
        *,
        provider: BotSnapshotProvider | None = None,
    ) -> BotRunReceipt:
        instance, account = await self._instance_for_update(user_id)
        if instance.activated_at.astimezone(VN_TZ).date() > trading_date:
            raise ValueError("Không chạy Bot cho phiên trước khi kích hoạt")
        run = (
            await self.db.execute(
                select(BotRunReceipt)
                .where(
                    BotRunReceipt.user_id == user_id,
                    BotRunReceipt.trading_date == trading_date,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if (
            run is not None
            and run.bot_account_id == account.id
            and run.status == "succeeded"
        ):
            if run.rule_hash != STANDARD_RULES.digest() or run.rule_snapshot != STANDARD_RULES.snapshot():
                run.status = "failed"
                run.completed_at = datetime.now(UTC)
                run.issues = [
                    _issue(
                        "unsupported_rule_version",
                        "Worker hiện tại không hỗ trợ rule snapshot đã lưu",
                    )
                ]
                await self.db.flush()
                return run
            completed_snapshot = (
                await self.db.execute(
                    select(BotMarketSnapshot).where(BotMarketSnapshot.bot_run_id == run.id)
                )
            ).scalar_one_or_none()
            if completed_snapshot is None:
                run.status = "failed"
                run.completed_at = datetime.now(UTC)
                run.issues = [_issue("snapshot_hash_mismatch", "Run thành công thiếu snapshot")]
                await self.db.flush()
                return run
            completed_payload = completed_snapshot.payload
            completed_hash = canonical_hash(
                {k: v for k, v in completed_payload.items() if k != "snapshot_hash"}
            )
            if (
                completed_hash != completed_snapshot.snapshot_hash
                or run.source_snapshot_hash != completed_snapshot.snapshot_hash
                or completed_payload.get("trading_date") != trading_date.isoformat()
            ):
                run.status = "failed"
                run.completed_at = datetime.now(UTC)
                run.issues = [
                    _issue("snapshot_hash_mismatch", "Snapshot của run thành công không còn hợp lệ")
                ]
                await self.db.flush()
                return run
            if not await self._reconcile(account):
                run.status = "failed"
                run.completed_at = datetime.now(UTC)
                run.issues = [_issue("reconciliation_failed", "Sổ Bot không còn đối soát được")]
                await self.db.flush()
            return run
        now = datetime.now(UTC)
        positions_at_start = (
            await self.db.execute(
                select(BotPosition)
                .where(BotPosition.bot_account_id == account.id, BotPosition.status == "open")
                .order_by(BotPosition.symbol)
                .with_for_update()
            )
        ).scalars().all()
        if run is None:
            run = BotRunReceipt(
                user_id=user_id,
                bot_account_id=account.id,
                trading_date=trading_date,
                status="running",
                started_at=now,
                completed_at=None,
                issues=[],
                strategy_id=STANDARD_RULES.strategy_id,
                strategy_version=STANDARD_RULES.strategy_version,
                execution_model=STANDARD_RULES.execution_model,
                rule_snapshot=STANDARD_RULES.snapshot(),
                rule_hash=STANDARD_RULES.digest(),
                blocked_symbols_at_start=sorted(row.symbol for row in positions_at_start),
                buy_count=0,
                sell_count=0,
            )
            self.db.add(run)
            await self.db.flush()
        else:
            if run.bot_account_id not in (None, account.id):
                raise RuntimeError("Receipt phiên đã thuộc tài khoản Bot khác")
            # Claim a legacy identity-only receipt as the canonical account run.
            # This avoids the old (user, date) uniqueness row suppressing Bot
            # execution while retaining its ID for the mascot cursor contract.
            is_legacy = run.bot_account_id is None
            if is_legacy:
                run.bot_account_id = account.id
                run.strategy_id = STANDARD_RULES.strategy_id
                run.strategy_version = STANDARD_RULES.strategy_version
                run.execution_model = STANDARD_RULES.execution_model
                run.rule_snapshot = STANDARD_RULES.snapshot()
                run.rule_hash = STANDARD_RULES.digest()
                run.blocked_symbols_at_start = sorted(row.symbol for row in positions_at_start)
            run.status = "running"
            run.completed_at = None
            run.issues = []

        if run.rule_hash != STANDARD_RULES.digest() or run.rule_snapshot != STANDARD_RULES.snapshot():
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = [_issue("unsupported_rule_version", "Worker hiện tại không hỗ trợ rule snapshot đã lưu")]
            await self.db.flush()
            return run
        if not await self._reconcile(account):
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = [_issue("reconciliation_failed", "Sổ Bot không hợp lệ trước khi xử lý phiên")]
            await self.db.flush()
            return run

        snapshot = (
            await self.db.execute(
                select(BotMarketSnapshot).where(BotMarketSnapshot.bot_run_id == run.id)
            )
        ).scalar_one_or_none()
        if snapshot is None:
            provider = provider or LiveBotSnapshotProvider(self.db)
            try:
                payload = await provider.build_snapshot(
                    trading_date, open_symbols=run.blocked_symbols_at_start
                )
            except Exception as exc:  # noqa: BLE001
                run.status = "failed"
                run.completed_at = datetime.now(UTC)
                run.issues = [_issue("source_error", f"Không chụp được snapshot: {type(exc).__name__}")]
                await self.db.flush()
                return run
            # Provider hashes are useful source metadata, but the service owns
            # the canonical immutable envelope hash. Exclude the hash field so
            # the digest is reproducible and cannot claim to validate itself.
            digest = canonical_hash({k: v for k, v in payload.items() if k != "snapshot_hash"})
            payload = {**payload, "snapshot_hash": digest}
            snapshot = BotMarketSnapshot(
                bot_run_id=run.id,
                trading_date=trading_date,
                data_version=str(payload.get("data_version") or f"bot-v1:{trading_date}"),
                observed_at=now,
                close_is_official=bool(payload.get("close_is_official")),
                buy_inputs_complete=bool(payload.get("buy_inputs_complete")),
                snapshot_hash=digest,
                payload=payload,
                source_refs=payload.get("source_refs") or {},
            )
            self.db.add(snapshot)
            run.source_snapshot_hash = digest
            await self.db.flush()
        payload = snapshot.payload
        actual_snapshot_hash = canonical_hash(
            {k: v for k, v in payload.items() if k != "snapshot_hash"}
        )
        if actual_snapshot_hash != snapshot.snapshot_hash or run.source_snapshot_hash != snapshot.snapshot_hash:
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = [_issue("snapshot_hash_mismatch", "Snapshot Bot đã thay đổi sau khi được đóng băng")]
            await self.db.flush()
            return run
        if payload.get("trading_date") != trading_date.isoformat():
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = [_issue("missing_official_close", "Snapshot không thuộc đúng phiên Bot")]
            await self.db.flush()
            return run
        symbols: dict[str, dict[str, Any]] = payload.get("symbols") or {}
        issues: list[dict[str, Any]] = list(payload.get("issues") or [])
        fee_row = payload.get("fee_rules")
        if not isinstance(fee_row, dict):
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = _dedupe_issues([*issues, _issue("source_error", "Thiếu snapshot phí/thuế/lô")])
            await self.db.flush()
            return run
        fee_rules = FeeRules(**fee_row)
        try:
            fee_rules.validate()
        except ValueError as exc:
            run.status = "failed"
            run.completed_at = datetime.now(UTC)
            run.issues = _dedupe_issues([*issues, _issue("source_error", str(exc))])
            await self.db.flush()
            return run

        # Resume includes rows sold earlier in the same run.
        all_start_positions = (
            await self.db.execute(
                select(BotPosition)
                .where(
                    BotPosition.bot_account_id == account.id,
                    BotPosition.symbol.in_(run.blocked_symbols_at_start or [""]),
                    or_(BotPosition.status == "open", BotPosition.closed_session == trading_date),
                )
                .order_by(BotPosition.symbol)
                .with_for_update()
            )
        ).scalars().all()
        valuation_complete = True
        if run.nav_basis_vnd is None:
            market_value = 0
            for position in all_start_positions:
                symbol_row = symbols.get(position.symbol) or {}
                close = symbol_row.get("close_vnd")
                if (
                    not isinstance(close, int)
                    or close <= 0
                    or symbol_row.get("close_is_official") is not True
                ):
                    valuation_complete = False
                    issues.append(_issue("missing_official_close", "Thiếu đóng cửa để khóa NAV nền", position.symbol))
                    continue
                # On first attempt these rows are open; closed rows only occur on retry
                # after nav_basis has already been stored.
                market_value += position.qty_open * close
            if valuation_complete:
                run.nav_basis_vnd = account.cash_vnd + market_value

        # Sell positions that existed at the batch boundary before considering buys.
        for position in all_start_positions:
            if position.status != "open":
                continue
            symbol_row = symbols.get(position.symbol) or {}
            close = symbol_row.get("close_vnd")
            if (
                not isinstance(close, int)
                or close <= 0
                or symbol_row.get("close_is_official") is not True
            ):
                continue
            signal = exit_signal(close, position.stop_loss_vnd, position.take_profit_vnd)
            if signal is None:
                await self._decision(
                    run=run,
                    key=f"bot:v1:{run.id}:{position.symbol}:hold",
                    symbol=position.symbol,
                    action="hold",
                    reason_code="hold_within_thresholds",
                    reason="Giá đóng cửa chưa chạm cắt lỗ hoặc chốt lời đã lưu.",
                    filter_ids=position.filter_ids,
                    data_refs=position.source_refs,
                )
                continue
            await self._sell(run, account, position, close, signal, fee_rules, snapshot.snapshot_hash)
        run.sell_count = (
            await self.db.execute(
                select(func.count(BotExecution.id)).where(
                    BotExecution.bot_run_id == run.id, BotExecution.side == "sell"
                )
            )
        ).scalar_one()

        raw_candidates: list[Candidate] = []
        for symbol, row in symbols.items():
            if not row.get("filter_ids"):
                continue
            if row.get("close_is_official") is not True:
                issues.append(_issue("missing_official_close", "Ứng viên thiếu giá đóng cửa đúng phiên", symbol))
                continue
            if (
                row.get("security_status_verified") is not True
                or row.get("tradable_security_status") is not True
            ):
                reason = (
                    "missing_security_status"
                    if row.get("security_status_verified") is not True
                    else "security_status_blocked"
                )
                await self._decision(
                    run=run,
                    key=f"bot:v1:{run.id}:{symbol}:security",
                    symbol=symbol,
                    action="skip",
                    reason_code=reason,
                    reason=(
                        "Không xác minh được trạng thái giao dịch an toàn của mã."
                        if reason == "missing_security_status"
                        else "Mã thuộc trạng thái không được phép mua."
                    ),
                    filter_ids=row.get("filter_ids") or (),
                    data_refs=row.get("source_refs") or {},
                )
                continue
            candidate = self._candidate(symbol, row)
            if candidate is None:
                issues.append(_issue("missing_layers", "Thiếu dữ liệu ứng viên bắt buộc", symbol))
                continue
            gate = candidate_gate(candidate)
            if not gate.allowed:
                await self._decision(
                    run=run,
                    key=f"bot:v1:{run.id}:{symbol}:gate",
                    symbol=symbol,
                    action="skip",
                    reason_code=gate.reason_code,
                    reason=f"Ứng viên không qua cổng Bot v1: {gate.reason_code}.",
                    filter_ids=candidate.filter_ids,
                    rank_tuple=candidate.rank_tuple,
                    data_refs=dict(candidate.source_refs),
                )
                if gate.reason_code in {"missing_layers", "missing_veto_severity"}:
                    issues.append(_issue(gate.reason_code, "Không đủ năm lớp hoặc mức phủ quyết", symbol))
                continue
            raw_candidates.append(candidate)

        ranked = rank_candidates(raw_candidates)
        executions_in_run = (
            await self.db.execute(select(BotExecution).where(BotExecution.bot_run_id == run.id))
        ).scalars().all()
        traded_symbols = {row.symbol for row in executions_in_run}
        fees_paid = sum(row.fee_vnd + row.tax_vnd for row in executions_in_run)
        run.buy_count = sum(row.side == "buy" for row in executions_in_run)
        if run.nav_basis_vnd is not None and snapshot.buy_inputs_complete:
            for candidate in ranked:
                if run.buy_count >= STANDARD_RULES.max_new_buys_per_session:
                    break
                reason_code: str | None = None
                if candidate.symbol in set(run.blocked_symbols_at_start):
                    reason_code = "blocked_at_start"
                elif candidate.symbol in traded_symbols:
                    reason_code = "already_traded_in_run"
                elif (
                    await self.db.execute(
                        select(BotPosition.id).where(
                            BotPosition.bot_account_id == account.id,
                            BotPosition.symbol == candidate.symbol,
                            BotPosition.status == "open",
                        )
                    )
                ).scalar_one_or_none() is not None:
                    reason_code = "already_open"
                thresholds = compute_exit_thresholds(candidate.close_vnd, candidate.l1_amplitude_vnd)
                if reason_code is None and (
                    thresholds is None or not candidate.l1_amplitude_source_ref
                ):
                    reason_code = "invalid_or_missing_l1_amplitude"
                sizing = None
                if reason_code is None:
                    sizing = compute_buy_quantity(
                        nav_basis_vnd=run.nav_basis_vnd,
                        cash_available_vnd=account.cash_vnd,
                        price_vnd=candidate.close_vnd,
                        existing_symbol_value_vnd=0,
                        fees_paid_in_batch_vnd=fees_paid,
                        fee_rules=fee_rules,
                    )
                    reason_code = sizing.reason_code
                if reason_code is not None:
                    await self._decision(
                        run=run,
                        key=f"bot:v1:{run.id}:{candidate.symbol}:capital",
                        symbol=candidate.symbol,
                        action="skip",
                        reason_code=reason_code,
                        reason=f"Không mua {candidate.symbol}: {reason_code}.",
                        filter_ids=candidate.filter_ids,
                        rank_tuple=candidate.rank_tuple,
                        data_refs=dict(candidate.source_refs),
                        budget_vnd=run.nav_basis_vnd * STANDARD_RULES.buy_budget_nav_pct // 100,
                    )
                    continue
                assert sizing is not None
                assert thresholds is not None
                execution = await self._buy(
                    run, account, candidate, sizing, thresholds, snapshot.snapshot_hash
                )
                traded_symbols.add(candidate.symbol)
                fees_paid += execution.fee_vnd
                run.buy_count += 1

        # End-of-session valuation. Unknown closes stay unknown; never fill with zero.
        open_positions = (
            await self.db.execute(
                select(BotPosition).where(
                    BotPosition.bot_account_id == account.id, BotPosition.status == "open"
                )
            )
        ).scalars().all()
        market_value = 0
        end_complete = True
        for position in open_positions:
            symbol_row = symbols.get(position.symbol) or {}
            close = symbol_row.get("close_vnd")
            if (
                not isinstance(close, int)
                or close <= 0
                or symbol_row.get("close_is_official") is not True
            ):
                end_complete = False
                issues.append(_issue("valuation_incomplete", "Thiếu giá đóng cửa để tính NAV", position.symbol))
            else:
                market_value += position.qty_open * close
        nav = account.cash_vnd + market_value if end_complete else None
        nav_row = (
            await self.db.execute(
                select(BotNavDaily).where(
                    BotNavDaily.bot_account_id == account.id,
                    BotNavDaily.trading_date == trading_date,
                )
            )
        ).scalar_one_or_none()
        if nav_row is None:
            nav_row = BotNavDaily(
                bot_account_id=account.id,
                trading_date=trading_date,
                cash_vnd=account.cash_vnd,
                market_value_vnd=market_value if end_complete else None,
                nav_vnd=nav,
                valuation_complete=end_complete,
                vnindex=Decimal(str(payload["vnindex"])) if payload.get("vnindex") is not None else None,
                source_refs={"snapshot_hash": snapshot.snapshot_hash},
                created_at=datetime.now(UTC),
            )
            self.db.add(nav_row)
        else:
            nav_row.cash_vnd = account.cash_vnd
            nav_row.market_value_vnd = market_value if end_complete else None
            nav_row.nav_vnd = nav
            nav_row.valuation_complete = end_complete
        await self.db.flush()
        if not await self._reconcile(account):
            issues.append(_issue("reconciliation_failed", "Sổ tiền và số dư Bot không khớp"))
        if not ranked and snapshot.buy_inputs_complete:
            await self._decision(
                run=run,
                key=f"bot:v1:{run.id}:no-eligible-candidates",
                symbol=None,
                action="skip",
                reason_code="no_eligible_candidates",
                reason="Đã xử lý đủ nguồn nhưng không có mã vượt qua toàn bộ quy tắc Bot v1.",
            )
        elif not snapshot.buy_inputs_complete:
            await self._decision(
                run=run,
                key=f"bot:v1:{run.id}:buy-inputs-incomplete",
                symbol=None,
                action="skip",
                reason_code="buy_inputs_incomplete",
                reason="Chưa đủ nguồn bắt buộc để đánh giá mua; đây không phải kết luận thị trường không có cơ hội.",
            )
        issues = _dedupe_issues(issues)
        failed = not end_complete or not snapshot.buy_inputs_complete or any(
            row["code"] in CRITICAL_ISSUES for row in issues
        )
        run.status = "failed" if failed else "succeeded"
        run.completed_at = datetime.now(UTC)
        run.reconciled_at = (
            run.completed_at
            if not any(row["code"] == "reconciliation_failed" for row in issues)
            else None
        )
        run.issues = issues
        await self.db.flush()
        return run


async def initialize(session: AsyncSession, user: Any) -> BotInstance | None:
    """Cap-6 graduation hook. Caller owns commit/rollback."""
    return await BotService(session).initialize(_user_id(user))


async def run_account_session(
    session: AsyncSession,
    user: Any,
    trading_date: date,
    *,
    provider: BotSnapshotProvider | None = None,
) -> BotRunReceipt:
    """Internal worker entry for one authenticated-by-scheduler Bot owner."""
    return await BotService(session).run(_user_id(user), trading_date, provider=provider)


async def run_scheduled_session(
    trading_date: date,
    *,
    session_factory: Callable[[], Any] | None = None,
    provider_factory: Callable[[AsyncSession], BotSnapshotProvider] | None = None,
) -> dict[str, int]:
    """Recover missing graduated Bots, then run one real current EOD session.

    A Bot activated by the 19:00 job is eligible for T because activation
    precedes this batch. Graduation after this job is first eligible at the
    next scheduler invocation. No historical session is synthesized.
    """
    factory = session_factory or get_session_factory()
    result = {"initialized": 0, "processed": 0, "succeeded": 0, "failed": 0, "skipped_not_session": 0}

    # Recovery is independent of mascot state and does not backdate activation.
    async with factory() as discovery:
        missing = (
            await discovery.execute(
                select(Cap6Progress.user_id)
                .outerjoin(BotInstance, BotInstance.user_id == Cap6Progress.user_id)
                .where(Cap6Progress.graduated_at.is_not(None), BotInstance.id.is_(None))
                .order_by(Cap6Progress.user_id)
            )
        ).scalars().all()
    for user_id in missing:
        async with factory() as recovery:
            try:
                row = await BotService(recovery).initialize(user_id)
                await recovery.commit()
                result["initialized"] += int(row is not None)
            except IntegrityError:
                # Another worker recovered the same user. The unique constraints
                # are the durable arbiter; discovery below reads the winner.
                await recovery.rollback()
            except Exception:  # noqa: BLE001
                await recovery.rollback()
                logger.exception("bot_v1_initialization_recovery_failed", extra={"user_id": str(user_id)})

    if provider_factory is None:
        ready = await live_session_ready(trading_date)
        if ready is False:
            result["skipped_not_session"] = 1
            return result

    async with factory() as discovery:
        user_ids = (
            await discovery.execute(
                select(BotInstance.user_id)
                .join(BotAccount, BotAccount.id == BotInstance.bot_account_id)
                .where(BotAccount.status == "active")
                .order_by(BotInstance.user_id)
            )
        ).scalars().all()
    for user_id in user_ids:
        # Commit immutable input/NAV/blocked-set before any cash or position
        # effect. Execution happens in a fresh transaction below.
        async with factory() as checkpoint_session:
            try:
                checkpoint_provider = (
                    provider_factory(checkpoint_session)
                    if provider_factory
                    else LiveBotSnapshotProvider(checkpoint_session)
                )
                prepared = await BotService(checkpoint_session).prepare(
                    user_id,
                    trading_date,
                    provider=checkpoint_provider,
                )
                await checkpoint_session.commit()
                if prepared.status == "failed":
                    result["processed"] += 1
                    result["failed"] += 1
                    continue
            except Exception:  # noqa: BLE001
                await checkpoint_session.rollback()
                result["processed"] += 1
                result["failed"] += 1
                logger.exception(
                    "bot_v1_checkpoint_failed",
                    extra={"user_id": str(user_id), "trading_date": str(trading_date)},
                )
                continue
        async with factory() as session:
            try:
                # The committed snapshot is canonical; no provider call is
                # needed or allowed during the accounting transaction.
                run = await BotService(session).run(user_id, trading_date)
                await session.commit()
                result["processed"] += 1
                result[run.status] += 1
            except Exception:  # noqa: BLE001 - isolate one account from the batch
                await session.rollback()
                result["processed"] += 1
                result["failed"] += 1
                logger.exception(
                    "bot_v1_account_run_failed",
                    extra={"user_id": str(user_id), "trading_date": str(trading_date)},
                )
    return result

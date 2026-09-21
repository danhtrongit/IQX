"""IQX standard Bot v1 accounts, executions, snapshots and read models.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""

from alembic import op
import sqlalchemy as sa


revision = "d9e0f1a2b3c4"
down_revision = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "bot_accounts",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("initial_cash_vnd", sa.BigInteger(), nullable=False),
        sa.Column("cash_vnd", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("initial_cash_vnd = 100000000", name=op.f("ck_bot_accounts_bot_initial_cash_v1")),
        sa.CheckConstraint("cash_vnd >= 0", name=op.f("ck_bot_accounts_bot_cash_non_negative")),
        sa.CheckConstraint("status IN ('active', 'suspended')", name=op.f("ck_bot_accounts_bot_account_status")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name=op.f("uq_bot_accounts_user_id")),
    )
    op.create_index(op.f("ix_bot_accounts_user_id"), "bot_accounts", ["user_id"])

    op.create_table(
        "bot_instances",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("bot_account_id", sa.Uuid(), nullable=False),
        sa.Column("strategy_id", sa.String(length=64), nullable=False),
        sa.Column("strategy_version", sa.Integer(), nullable=False),
        sa.Column("execution_model", sa.String(length=32), nullable=False),
        sa.Column("cap6_graduated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("strategy_version > 0", name=op.f("ck_bot_instances_bot_strategy_version_positive")),
        sa.CheckConstraint("execution_model = 'same_session_close'", name=op.f("ck_bot_instances_bot_execution_model_v1")),
        sa.ForeignKeyConstraint(["bot_account_id"], ["bot_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bot_account_id", name=op.f("uq_bot_instances_account_id")),
        sa.UniqueConstraint("user_id", name=op.f("uq_bot_instances_user_id")),
    )
    op.create_index(op.f("ix_bot_instances_user_id"), "bot_instances", ["user_id"])

    op.add_column("bot_run_receipts", sa.Column("bot_account_id", sa.Uuid(), nullable=True))
    op.add_column("bot_run_receipts", sa.Column("strategy_id", sa.String(length=64), nullable=True))
    op.add_column("bot_run_receipts", sa.Column("strategy_version", sa.Integer(), nullable=True))
    op.add_column("bot_run_receipts", sa.Column("execution_model", sa.String(length=32), nullable=True))
    op.add_column("bot_run_receipts", sa.Column("source_snapshot_hash", sa.String(length=64), nullable=True))
    op.add_column("bot_run_receipts", sa.Column("rule_snapshot", sa.JSON(), nullable=True))
    op.add_column("bot_run_receipts", sa.Column("rule_hash", sa.String(length=64), nullable=True))
    op.add_column("bot_run_receipts", sa.Column("nav_basis_vnd", sa.BigInteger(), nullable=True))
    op.add_column(
        "bot_run_receipts",
        sa.Column("blocked_symbols_at_start", sa.JSON(), server_default="[]", nullable=False),
    )
    op.add_column(
        "bot_run_receipts", sa.Column("buy_count", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "bot_run_receipts", sa.Column("sell_count", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column("bot_run_receipts", sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_bot_run_receipts_bot_account_id_bot_accounts"),
        "bot_run_receipts", "bot_accounts", ["bot_account_id"], ["id"], ondelete="CASCADE",
    )
    op.create_unique_constraint(
        op.f("uq_bot_run_account_date"), "bot_run_receipts", ["bot_account_id", "trading_date"]
    )
    op.create_check_constraint(
        op.f("ck_bot_run_receipts_bot_run_counts"), "bot_run_receipts", "buy_count >= 0 AND sell_count >= 0"
    )
    op.create_index(op.f("ix_bot_run_receipts_bot_account_id"), "bot_run_receipts", ["bot_account_id"])

    op.create_table(
        "bot_cash_ledger",
        sa.Column("bot_account_id", sa.Uuid(), nullable=False),
        sa.Column("execution_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("amount_vnd", sa.BigInteger(), nullable=False),
        sa.Column("balance_after_vnd", sa.BigInteger(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("balance_after_vnd >= 0", name=op.f("ck_bot_cash_ledger_bot_ledger_balance_non_negative")),
        sa.ForeignKeyConstraint(["bot_account_id"], ["bot_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("execution_id", name=op.f("uq_bot_cash_ledger_execution_id")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_bot_cash_ledger_idempotency")),
    )
    op.create_index(op.f("ix_bot_cash_ledger_bot_account_id"), "bot_cash_ledger", ["bot_account_id"])
    op.create_index(op.f("ix_bot_cash_ledger_execution_id"), "bot_cash_ledger", ["execution_id"])

    op.create_table(
        "bot_market_snapshots",
        sa.Column("bot_run_id", sa.Uuid(), nullable=False),
        sa.Column("trading_date", sa.Date(), nullable=False),
        sa.Column("data_version", sa.String(length=128), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("close_is_official", sa.Boolean(), nullable=False),
        sa.Column("buy_inputs_complete", sa.Boolean(), nullable=False),
        sa.Column("snapshot_hash", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("source_refs", sa.JSON(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["bot_run_id"], ["bot_run_receipts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bot_run_id", name=op.f("uq_bot_snapshot_run")),
    )
    op.create_index(op.f("ix_bot_market_snapshots_trading_date"), "bot_market_snapshots", ["trading_date"])

    op.create_table(
        "bot_positions",
        sa.Column("bot_account_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=False),
        sa.Column("qty_open", sa.Integer(), nullable=False),
        sa.Column("entry_price_vnd", sa.BigInteger(), nullable=False),
        sa.Column("entry_value_vnd", sa.BigInteger(), nullable=False),
        sa.Column("entry_fee_vnd", sa.BigInteger(), nullable=False),
        sa.Column("amplitude_at_entry_vnd", sa.Numeric(20, 4), nullable=False),
        sa.Column("amplitude_source_ref", sa.String(length=500), nullable=False),
        sa.Column("stop_loss_vnd", sa.Numeric(20, 4), nullable=False),
        sa.Column("take_profit_vnd", sa.Numeric(20, 4), nullable=False),
        sa.Column("opened_session", sa.Date(), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_session", sa.Date(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("buy_execution_id", sa.Uuid(), nullable=True),
        sa.Column("sell_execution_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("filter_ids", sa.JSON(), nullable=False),
        sa.Column("source_refs", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("qty_open >= 0", name=op.f("ck_bot_positions_bot_position_qty_non_negative")),
        sa.CheckConstraint("entry_price_vnd > 0", name=op.f("ck_bot_positions_bot_position_entry_price")),
        sa.CheckConstraint("amplitude_at_entry_vnd > 0", name=op.f("ck_bot_positions_bot_position_amplitude")),
        sa.CheckConstraint("stop_loss_vnd > 0 AND stop_loss_vnd < entry_price_vnd", name=op.f("ck_bot_positions_bot_position_stop")),
        sa.CheckConstraint("take_profit_vnd > entry_price_vnd", name=op.f("ck_bot_positions_bot_position_take_profit")),
        sa.CheckConstraint("status IN ('open', 'closed')", name=op.f("ck_bot_positions_bot_position_status")),
        sa.ForeignKeyConstraint(["bot_account_id"], ["bot_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("buy_execution_id"),
        sa.UniqueConstraint("sell_execution_id"),
    )
    op.create_index(op.f("ix_bot_positions_bot_account_id"), "bot_positions", ["bot_account_id"])
    op.create_index(op.f("ix_bot_positions_symbol"), "bot_positions", ["symbol"])
    op.create_index(
        "uq_bot_positions_open_symbol", "bot_positions", ["bot_account_id", "symbol"],
        unique=True, postgresql_where=sa.text("status = 'open'"),
    )

    op.create_table(
        "bot_executions",
        sa.Column("bot_run_id", sa.Uuid(), nullable=False),
        sa.Column("bot_account_id", sa.Uuid(), nullable=False),
        sa.Column("position_id", sa.Uuid(), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=False),
        sa.Column("side", sa.String(length=8), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("price_vnd", sa.BigInteger(), nullable=False),
        sa.Column("signal_session", sa.Date(), nullable=False),
        sa.Column("price_session", sa.Date(), nullable=False),
        sa.Column("trading_date", sa.Date(), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("gross_value_vnd", sa.BigInteger(), nullable=False),
        sa.Column("fee_vnd", sa.BigInteger(), nullable=False),
        sa.Column("tax_vnd", sa.BigInteger(), nullable=False),
        sa.Column("net_cash_delta_vnd", sa.BigInteger(), nullable=False),
        sa.Column("execution_model", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("filter_ids", sa.JSON(), nullable=False),
        sa.Column("supporting_count", sa.Integer(), nullable=True),
        sa.Column("layer_snapshot", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=False),
        sa.Column("source_snapshot_id", sa.String(length=64), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("side IN ('buy', 'sell')", name=op.f("ck_bot_executions_bot_execution_side")),
        sa.CheckConstraint("qty > 0", name=op.f("ck_bot_executions_bot_execution_qty")),
        sa.CheckConstraint("price_vnd > 0", name=op.f("ck_bot_executions_bot_execution_price")),
        sa.CheckConstraint("signal_session = price_session AND price_session = trading_date", name=op.f("ck_bot_executions_bot_execution_same_session")),
        sa.CheckConstraint("execution_model = 'same_session_close'", name=op.f("ck_bot_executions_bot_execution_model")),
        sa.ForeignKeyConstraint(["bot_account_id"], ["bot_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bot_run_id"], ["bot_run_receipts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["position_id"], ["bot_positions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_bot_execution_idempotency")),
    )
    op.create_index(op.f("ix_bot_executions_bot_account_id"), "bot_executions", ["bot_account_id"])
    op.create_index(op.f("ix_bot_executions_bot_run_id"), "bot_executions", ["bot_run_id"])
    op.create_index(op.f("ix_bot_executions_position_id"), "bot_executions", ["position_id"])
    op.create_index(op.f("ix_bot_executions_symbol"), "bot_executions", ["symbol"])
    op.create_foreign_key(
        op.f("fk_bot_cash_ledger_execution_id_bot_executions"),
        "bot_cash_ledger",
        "bot_executions",
        ["execution_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "bot_decisions",
        sa.Column("bot_run_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=180), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=True),
        sa.Column("action", sa.String(length=8), nullable=False),
        sa.Column("reason_code", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=False),
        sa.Column("filter_ids", sa.JSON(), nullable=False),
        sa.Column("rank_tuple", sa.JSON(), nullable=True),
        sa.Column("data_refs", sa.JSON(), nullable=False),
        sa.Column("budget_vnd", sa.BigInteger(), nullable=True),
        sa.Column("proposed_qty", sa.Integer(), nullable=True),
        sa.Column("threshold_vnd", sa.Numeric(20, 4), nullable=True),
        sa.Column("execution_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("action IN ('buy', 'sell', 'hold', 'skip')", name=op.f("ck_bot_decisions_bot_decision_action")),
        sa.ForeignKeyConstraint(["bot_run_id"], ["bot_run_receipts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["execution_id"], ["bot_executions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_bot_decision_idempotency")),
    )
    op.create_index(op.f("ix_bot_decisions_bot_run_id"), "bot_decisions", ["bot_run_id"])
    op.create_index(op.f("ix_bot_decisions_symbol"), "bot_decisions", ["symbol"])

    op.create_table(
        "bot_nav_daily",
        sa.Column("bot_account_id", sa.Uuid(), nullable=False),
        sa.Column("trading_date", sa.Date(), nullable=False),
        sa.Column("cash_vnd", sa.BigInteger(), nullable=False),
        sa.Column("market_value_vnd", sa.BigInteger(), nullable=True),
        sa.Column("nav_vnd", sa.BigInteger(), nullable=True),
        sa.Column("valuation_complete", sa.Boolean(), nullable=False),
        sa.Column("vnindex", sa.Numeric(20, 6), nullable=True),
        sa.Column("source_refs", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "cash_vnd >= 0 AND (market_value_vnd IS NULL OR market_value_vnd >= 0) "
            "AND (nav_vnd IS NULL OR nav_vnd >= 0)",
            name=op.f("ck_bot_nav_daily_bot_nav_non_negative"),
        ),
        sa.ForeignKeyConstraint(["bot_account_id"], ["bot_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bot_account_id", "trading_date", name=op.f("uq_bot_nav_account_date")),
    )
    op.create_index(op.f("ix_bot_nav_daily_bot_account_id"), "bot_nav_daily", ["bot_account_id"])


def downgrade():
    op.drop_index(op.f("ix_bot_nav_daily_bot_account_id"), table_name="bot_nav_daily")
    op.drop_table("bot_nav_daily")
    op.drop_index(op.f("ix_bot_decisions_symbol"), table_name="bot_decisions")
    op.drop_index(op.f("ix_bot_decisions_bot_run_id"), table_name="bot_decisions")
    op.drop_table("bot_decisions")
    op.drop_constraint(
        op.f("fk_bot_cash_ledger_execution_id_bot_executions"),
        "bot_cash_ledger",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_bot_executions_symbol"), table_name="bot_executions")
    op.drop_index(op.f("ix_bot_executions_position_id"), table_name="bot_executions")
    op.drop_index(op.f("ix_bot_executions_bot_run_id"), table_name="bot_executions")
    op.drop_index(op.f("ix_bot_executions_bot_account_id"), table_name="bot_executions")
    op.drop_table("bot_executions")
    op.drop_index("uq_bot_positions_open_symbol", table_name="bot_positions")
    op.drop_index(op.f("ix_bot_positions_symbol"), table_name="bot_positions")
    op.drop_index(op.f("ix_bot_positions_bot_account_id"), table_name="bot_positions")
    op.drop_table("bot_positions")
    op.drop_index(op.f("ix_bot_market_snapshots_trading_date"), table_name="bot_market_snapshots")
    op.drop_table("bot_market_snapshots")
    op.drop_index(op.f("ix_bot_cash_ledger_execution_id"), table_name="bot_cash_ledger")
    op.drop_index(op.f("ix_bot_cash_ledger_bot_account_id"), table_name="bot_cash_ledger")
    op.drop_table("bot_cash_ledger")
    op.drop_index(op.f("ix_bot_run_receipts_bot_account_id"), table_name="bot_run_receipts")
    op.drop_constraint(op.f("ck_bot_run_receipts_bot_run_counts"), "bot_run_receipts", type_="check")
    op.drop_constraint(op.f("uq_bot_run_account_date"), "bot_run_receipts", type_="unique")
    op.drop_constraint(op.f("fk_bot_run_receipts_bot_account_id_bot_accounts"), "bot_run_receipts", type_="foreignkey")
    for column in (
        "reconciled_at", "sell_count", "buy_count", "blocked_symbols_at_start",
        "nav_basis_vnd", "rule_hash", "rule_snapshot", "source_snapshot_hash",
        "execution_model", "strategy_version", "strategy_id", "bot_account_id",
    ):
        op.drop_column("bot_run_receipts", column)
    op.drop_index(op.f("ix_bot_instances_user_id"), table_name="bot_instances")
    op.drop_table("bot_instances")
    op.drop_index(op.f("ix_bot_accounts_user_id"), table_name="bot_accounts")
    op.drop_table("bot_accounts")

"""add_virtual_trading_tables

Revision ID: 218cd5d6ac36
Revises: fb7a64f07299
Create Date: 2026-04-25 09:54:54.079998

Hand-written migration for fresh database support.
Creates all 7 virtual trading tables from scratch with correct FK ordering.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '218cd5d6ac36'
down_revision: Union[str, None] = 'fb7a64f07299'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. virtual_trading_configs (no FK to other VT tables) ──
    op.create_table(
        'virtual_trading_configs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('initial_cash_vnd', sa.BigInteger(), nullable=False),
        sa.Column('buy_fee_rate_bps', sa.Integer(), nullable=False),
        sa.Column('sell_fee_rate_bps', sa.Integer(), nullable=False),
        sa.Column('sell_tax_rate_bps', sa.Integer(), nullable=False),
        sa.Column('settlement_mode', sa.Enum('T0', 'T2', name='settlement_mode'), server_default='T0', nullable=False),
        sa.Column('board_lot_size', sa.Integer(), nullable=False),
        sa.Column('trading_enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('holidays', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('updated_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── 2. virtual_trading_accounts (FK → users) ──
    op.create_table(
        'virtual_trading_accounts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('status', sa.Enum('active', 'suspended', name='vt_account_status'), server_default='active', nullable=False),
        sa.Column('initial_cash_vnd', sa.BigInteger(), nullable=False),
        sa.Column('cash_available_vnd', sa.BigInteger(), nullable=False),
        sa.Column('cash_reserved_vnd', sa.BigInteger(), nullable=False),
        sa.Column('cash_pending_vnd', sa.BigInteger(), nullable=False),
        sa.Column('scope_type', sa.String(length=50), nullable=True),
        sa.Column('scope_id', sa.Uuid(), nullable=True),
        sa.Column('activated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reset_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_vt_accounts_user_id'),
    )
    op.create_index('ix_virtual_trading_accounts_user_id', 'virtual_trading_accounts', ['user_id'])

    # ── 3. virtual_orders (FK → accounts, users) ──
    op.create_table(
        'virtual_orders',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('account_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('side', sa.Enum('buy', 'sell', name='vt_order_side'), nullable=False),
        sa.Column('order_type', sa.Enum('market', 'limit', name='vt_order_type'), nullable=False),
        sa.Column('status', sa.Enum('pending', 'filled', 'cancelled', 'expired', 'rejected', name='vt_order_status'), server_default='pending', nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('limit_price_vnd', sa.BigInteger(), nullable=True),
        sa.Column('reserved_cash_vnd', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('reserved_quantity', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('filled_price_vnd', sa.BigInteger(), nullable=True),
        sa.Column('gross_amount_vnd', sa.BigInteger(), nullable=True),
        sa.Column('fee_vnd', sa.BigInteger(), nullable=True),
        sa.Column('tax_vnd', sa.BigInteger(), nullable=True),
        sa.Column('net_amount_vnd', sa.BigInteger(), nullable=True),
        sa.Column('trading_date', sa.Date(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejection_reason', sa.String(length=500), nullable=True),
        sa.Column('cancel_reason', sa.String(length=500), nullable=True),
        sa.Column('config_snapshot', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['virtual_trading_accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_virtual_orders_account_id', 'virtual_orders', ['account_id'])
    op.create_index('ix_virtual_orders_user_id', 'virtual_orders', ['user_id'])
    op.create_index('ix_virtual_orders_symbol', 'virtual_orders', ['symbol'])

    # ── 4. virtual_positions (FK → accounts) ──
    op.create_table(
        'virtual_positions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('account_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('quantity_total', sa.Integer(), nullable=False),
        sa.Column('quantity_sellable', sa.Integer(), nullable=False),
        sa.Column('quantity_pending', sa.Integer(), nullable=False),
        sa.Column('quantity_reserved', sa.Integer(), nullable=False),
        sa.Column('avg_cost_vnd', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['virtual_trading_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', 'symbol', name='uq_vt_positions_account_symbol'),
    )
    op.create_index('ix_virtual_positions_account_id', 'virtual_positions', ['account_id'])

    # ── 5. virtual_trades (FK → orders, accounts) ──
    op.create_table(
        'virtual_trades',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('order_id', sa.Uuid(), nullable=False),
        sa.Column('account_id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('side', sa.Enum('buy', 'sell', name='vt_order_side', create_type=False), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('price_vnd', sa.BigInteger(), nullable=False),
        sa.Column('gross_amount_vnd', sa.BigInteger(), nullable=False),
        sa.Column('fee_vnd', sa.BigInteger(), nullable=False),
        sa.Column('tax_vnd', sa.BigInteger(), nullable=False),
        sa.Column('net_amount_vnd', sa.BigInteger(), nullable=False),
        sa.Column('price_source', sa.String(length=50), nullable=False),
        sa.Column('price_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('traded_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['order_id'], ['virtual_orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['account_id'], ['virtual_trading_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_virtual_trades_order_id', 'virtual_trades', ['order_id'])
    op.create_index('ix_virtual_trades_account_id', 'virtual_trades', ['account_id'])

    # ── 6. virtual_settlements (FK → accounts, trades) ──
    op.create_table(
        'virtual_settlements',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('account_id', sa.Uuid(), nullable=False),
        sa.Column('trade_id', sa.Uuid(), nullable=False),
        sa.Column('kind', sa.Enum('buy_qty_release', 'sell_cash_release', name='vt_settlement_kind'), nullable=False),
        sa.Column('amount', sa.BigInteger(), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'settled', name='vt_settlement_status'), server_default='pending', nullable=False),
        sa.Column('settled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['virtual_trading_accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trade_id'], ['virtual_trades.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_virtual_settlements_account_id', 'virtual_settlements', ['account_id'])
    op.create_index('ix_virtual_settlements_due_date', 'virtual_settlements', ['due_date'])

    # ── 7. virtual_cash_ledger (FK → accounts) ──
    op.create_table(
        'virtual_cash_ledger',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('account_id', sa.Uuid(), nullable=False),
        sa.Column('amount_vnd', sa.BigInteger(), nullable=False),
        sa.Column('balance_after_vnd', sa.BigInteger(), nullable=False),
        sa.Column('kind', sa.String(length=50), nullable=False),
        sa.Column('reference_type', sa.String(length=50), nullable=True),
        sa.Column('reference_id', sa.Uuid(), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['account_id'], ['virtual_trading_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_virtual_cash_ledger_account_id', 'virtual_cash_ledger', ['account_id'])


def downgrade() -> None:
    op.drop_index('ix_virtual_cash_ledger_account_id', table_name='virtual_cash_ledger')
    op.drop_table('virtual_cash_ledger')
    op.drop_index('ix_virtual_settlements_due_date', table_name='virtual_settlements')
    op.drop_index('ix_virtual_settlements_account_id', table_name='virtual_settlements')
    op.drop_table('virtual_settlements')
    op.drop_index('ix_virtual_trades_account_id', table_name='virtual_trades')
    op.drop_index('ix_virtual_trades_order_id', table_name='virtual_trades')
    op.drop_table('virtual_trades')
    op.drop_index('ix_virtual_positions_account_id', table_name='virtual_positions')
    op.drop_table('virtual_positions')
    op.drop_index('ix_virtual_orders_symbol', table_name='virtual_orders')
    op.drop_index('ix_virtual_orders_user_id', table_name='virtual_orders')
    op.drop_index('ix_virtual_orders_account_id', table_name='virtual_orders')
    op.drop_table('virtual_orders')
    op.drop_index('ix_virtual_trading_accounts_user_id', table_name='virtual_trading_accounts')
    op.drop_table('virtual_trading_accounts')
    op.drop_table('virtual_trading_configs')
    # Drop custom enum types
    sa.Enum(name='settlement_mode').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='vt_account_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='vt_order_side').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='vt_order_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='vt_order_status').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='vt_settlement_kind').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='vt_settlement_status').drop(op.get_bind(), checkfirst=True)

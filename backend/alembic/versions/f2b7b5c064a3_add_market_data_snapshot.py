"""add market_data_snapshot

Revision ID: f2b7b5c064a3
Revises: 1e3983d571ab
Create Date: 2026-07-03 13:45:01.002295

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f2b7b5c064a3'
down_revision: Union[str, None] = '1e3983d571ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'market_data_snapshot',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('asset_category', sa.String(32), nullable=False),
        sa.Column('symbol', sa.String(32), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('last_price', sa.Numeric(18, 6), nullable=False),
        sa.Column('previous_close', sa.Numeric(18, 6), nullable=False),
        sa.Column('change_value', sa.Numeric(18, 6), nullable=False),
        sa.Column('change_percent', sa.Numeric(10, 4), nullable=False),
        sa.Column('day_high', sa.Numeric(18, 6), nullable=True),
        sa.Column('day_low', sa.Numeric(18, 6), nullable=True),
        sa.Column('volume', sa.BigInteger(), nullable=True),
        sa.Column('currency', sa.String(8), nullable=True),
        sa.Column('market_state', sa.String(16), nullable=True),
        sa.Column('market_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source', sa.String(32), nullable=False, server_default='yahoo'),
        sa.Column('stale', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_market_data_snapshot')),
        sa.UniqueConstraint('snapshot_date', 'symbol', name='uq_snapshot_date_symbol'),
    )
    op.create_index('ix_market_data_snapshot_snapshot_date', 'market_data_snapshot', ['snapshot_date'])
    op.create_index('ix_market_data_snapshot_asset_category', 'market_data_snapshot', ['asset_category'])


def downgrade() -> None:
    op.drop_index('ix_market_data_snapshot_asset_category', table_name='market_data_snapshot')
    op.drop_index('ix_market_data_snapshot_snapshot_date', table_name='market_data_snapshot')
    op.drop_table('market_data_snapshot')

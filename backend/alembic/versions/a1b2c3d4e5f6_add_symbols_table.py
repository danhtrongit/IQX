"""add_symbols_table

Revision ID: a1b2c3d4e5f6
Revises: 218cd5d6ac36
Create Date: 2026-04-26 12:57:00.000000

Creates the internal `symbols` table for DB-backed symbol search.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '218cd5d6ac36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'symbols',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('name', sa.String(length=500), nullable=True),
        sa.Column('short_name', sa.String(length=255), nullable=True),
        sa.Column('exchange', sa.String(length=20), nullable=True),
        sa.Column('asset_type', sa.String(length=50), server_default='stock', nullable=True),
        sa.Column('is_index', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('current_price_vnd', sa.BigInteger(), nullable=True),
        sa.Column('target_price_vnd', sa.BigInteger(), nullable=True),
        sa.Column('upside_pct', sa.Float(), nullable=True),
        sa.Column('logo_url', sa.String(length=2048), nullable=True),
        sa.Column('logo_source', sa.String(length=30), nullable=True),
        sa.Column('icb_lv1', sa.String(length=100), nullable=True),
        sa.Column('icb_lv2', sa.String(length=100), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=True),
        sa.Column('source_url', sa.String(length=2048), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_symbols')),
        sa.UniqueConstraint('symbol', name=op.f('uq_symbols_symbol')),
    )
    op.create_index(op.f('ix_symbols_symbol'), 'symbols', ['symbol'], unique=True)
    op.create_index(op.f('ix_symbols_exchange'), 'symbols', ['exchange'])
    op.create_index(op.f('ix_symbols_asset_type'), 'symbols', ['asset_type'])
    op.create_index(op.f('ix_symbols_is_index'), 'symbols', ['is_index'])


def downgrade() -> None:
    op.drop_index(op.f('ix_symbols_is_index'), table_name='symbols')
    op.drop_index(op.f('ix_symbols_asset_type'), table_name='symbols')
    op.drop_index(op.f('ix_symbols_exchange'), table_name='symbols')
    op.drop_index(op.f('ix_symbols_symbol'), table_name='symbols')
    op.drop_table('symbols')

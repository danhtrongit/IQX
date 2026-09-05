"""Số dư Sân tập — 100 triệu VND cho mọi cấp.

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-09-05 00:00:00.000000

Two things change, both about the balance a NEW account starts with:

1. ``cap0_progress.virtual_balance_init`` column DEFAULT 250.000.000 →
   100.000.000 (the app always writes the value explicitly; no row rewritten).
2. The ACTIVE ``virtual_trading_configs`` row's ``initial_cash_vnd`` → 100.000.000.
   ``POST /virtual-trading/account/activate`` and the admin reset read this row,
   so without this step a database that already had the old 1-tỷ config would
   keep seeding/resetting accounts to 1 tỷ regardless of the new code default.

Existing ``virtual_trading_accounts`` rows (people mid-journey) are NOT touched:
their ``initial_cash_vnd``/cash stay whatever they were opened with. Downgrade
restores the column default and puts the active config back to the old 1-tỷ
figure only if it still holds the value this migration wrote.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW = 100_000_000
_OLD_CAP0_DEFAULT = 250_000_000
_OLD_CONFIG_DEFAULT = 1_000_000_000


def upgrade() -> None:
    # batch mode: plain ALTER on PostgreSQL, table-rebuild on SQLite (tests).
    with op.batch_alter_table("cap0_progress") as batch:
        batch.alter_column(
            "virtual_balance_init",
            existing_type=sa.BigInteger(),
            existing_nullable=False,
            server_default=str(_NEW),
        )
    op.execute(
        sa.text(
            "UPDATE virtual_trading_configs SET initial_cash_vnd = :new WHERE is_active = :active"
        ).bindparams(new=_NEW, active=True)
    )


def downgrade() -> None:
    with op.batch_alter_table("cap0_progress") as batch:
        batch.alter_column(
            "virtual_balance_init",
            existing_type=sa.BigInteger(),
            existing_nullable=False,
            server_default=str(_OLD_CAP0_DEFAULT),
        )
    op.execute(
        sa.text(
            "UPDATE virtual_trading_configs SET initial_cash_vnd = :old "
            "WHERE is_active = :active AND initial_cash_vnd = :new"
        ).bindparams(old=_OLD_CONFIG_DEFAULT, active=True, new=_NEW)
    )

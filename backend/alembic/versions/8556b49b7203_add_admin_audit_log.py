"""add_admin_audit_log

Revision ID: 8556b49b7203
Revises: 83fe4c37a788
Create Date: 2026-05-21 14:57:00.871183

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '8556b49b7203'
down_revision: Union[str, None] = '83fe4c37a788'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_log",
        sa.Column(
            "id",
            sa.Uuid(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("admin_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_entity", sa.String(length=60), nullable=True),
        sa.Column("target_id", sa.String(length=100), nullable=True),
        sa.Column("payload_before", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("payload_after", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("request_id", sa.String(length=40), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["admin_user_id"],
            ["users.id"],
            name=op.f("fk_admin_audit_log_admin_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_admin_audit_log")),
    )
    op.create_index(op.f("ix_admin_audit_log_admin_user_id"), "admin_audit_log", ["admin_user_id"])
    op.create_index(op.f("ix_admin_audit_log_action"), "admin_audit_log", ["action"])
    op.create_index(op.f("ix_admin_audit_log_created_at"), "admin_audit_log", ["created_at"])
    op.create_index("ix_admin_audit_log_admin_created", "admin_audit_log", ["admin_user_id", "created_at"])
    op.create_index("ix_admin_audit_log_entity_target", "admin_audit_log", ["target_entity", "target_id"])
    op.create_index("ix_admin_audit_log_action_created", "admin_audit_log", ["action", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_admin_audit_log_action_created", table_name="admin_audit_log")
    op.drop_index("ix_admin_audit_log_entity_target", table_name="admin_audit_log")
    op.drop_index("ix_admin_audit_log_admin_created", table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_created_at"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_action"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_admin_user_id"), table_name="admin_audit_log")
    op.drop_table("admin_audit_log")

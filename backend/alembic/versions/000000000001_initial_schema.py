"""initial_schema — creates the base schema for fresh databases.

Revision ID: 000000000001
Revises:
Create Date: 2026-04-24 21:00:00.000000

This is the initial schema migration. It creates the users and refresh_tokens
tables from scratch for fresh databases.

For legacy (Prisma) databases, run ``alembic stamp 000000000001`` to skip this
revision, then let subsequent migrations handle the schema transition.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "000000000001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Check if users table already exists (legacy DB) ──────────
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "users" in existing_tables:
        # Legacy DB: tables already exist, skip creation.
        # The next migration (488c85bb0b6a) handles schema transition.
        return

    # ── Fresh DB: create tables from scratch ─────────────────────

    # Enum types
    op.execute("CREATE TYPE user_role AS ENUM ('admin', 'user')")
    op.execute("CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted')")

    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column("phone_number", sa.String(length=30), nullable=True),
        sa.Column("phone_country_code", sa.String(length=5), nullable=True),
        sa.Column("phone_national_number", sa.String(length=20), nullable=True),
        sa.Column("phone_e164", sa.String(length=20), nullable=True),
        sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("avatar_url", sa.String(length=2048), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("gender", sa.String(length=20), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("province_state", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("district", sa.String(length=100), nullable=True),
        sa.Column("ward", sa.String(length=100), nullable=True),
        sa.Column("street_address", sa.String(length=500), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column(
            "role",
            sa.Enum("admin", "user", name="user_role", create_type=False),
            server_default="user",
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "inactive", "suspended", "deleted", name="user_status", create_type=False),
            server_default="active",
            nullable=False,
        ),
        sa.Column("is_email_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_phone_number", "users", ["phone_number"], unique=True)
    op.create_unique_constraint("uq_users_phone_e164", "users", ["phone_e164"])

    # Refresh tokens table
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("token_family", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_refresh_tokens_user_id_users",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)
    op.create_index("ix_refresh_tokens_token_family", "refresh_tokens", ["token_family"], unique=False)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS user_status")
    op.execute("DROP TYPE IF EXISTS user_role")

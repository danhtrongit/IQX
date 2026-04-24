"""add_refresh_tokens_table

Revision ID: 488c85bb0b6a
Revises: 
Create Date: 2026-04-24 20:58:46.565045

This migration handles the transition from the legacy Prisma schema to the new
SQLAlchemy models. It must deal with:
- Legacy FKs from other tables pointing to users.id (TEXT -> UUID)
- Old enum types (Role -> user_role)  
- Backfilling new required columns from existing data
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '488c85bb0b6a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# All legacy FKs that reference users.id — must be dropped before changing its type
# Format: (table, constraint_name, column_name)
LEGACY_USER_FKS = [
    ("refresh_tokens", "refresh_tokens_user_id_fkey", "user_id"),
    ("chat_messages", "chat_messages_sender_id_fkey", "sender_id"),
    ("chat_room_members", "chat_room_members_user_id_fkey", "user_id"),
    ("chat_rooms", "chat_rooms_created_by_id_fkey", "created_by_id"),
    ("payments", "payments_user_id_fkey", "user_id"),
    ("subscriptions", "subscriptions_user_id_fkey", "user_id"),
    ("virtual_accounts", "virtual_accounts_user_id_fkey", "user_id"),
    ("watchlists", "watchlists_user_id_fkey", "user_id"),
    ("message_reactions", "message_reactions_user_id_fkey", "user_id"),
]


def _drop_fk_if_exists(table: str, constraint: str) -> None:
    op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")


def _recreate_legacy_fk(table: str, constraint: str, column: str = "user_id") -> None:
    """Recreate a legacy FK. The referencing column is still TEXT, users.id is now UUID."""
    # We don't change legacy table column types — just point them back
    op.execute(
        f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
        f"FOREIGN KEY ({column}) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE"
    )


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════════════
    # Step 1: REFRESH_TOKENS — clear legacy data and rebuild schema
    # ══════════════════════════════════════════════════════════════════════
    op.execute("TRUNCATE TABLE refresh_tokens")
    _drop_fk_if_exists("refresh_tokens", "refresh_tokens_user_id_fkey")
    op.execute("DROP INDEX IF EXISTS refresh_tokens_token_key")
    op.execute("DROP INDEX IF EXISTS refresh_tokens_user_id_idx")

    # Add new columns
    op.add_column('refresh_tokens', sa.Column('jti', sa.String(length=64), nullable=False))
    op.add_column('refresh_tokens', sa.Column('token_family', sa.String(length=64), nullable=False))
    op.add_column('refresh_tokens', sa.Column('revoked', sa.Boolean(), server_default='false', nullable=False))

    # Type changes (table is empty, FK is dropped)
    op.execute("ALTER TABLE refresh_tokens ALTER COLUMN id TYPE UUID USING id::uuid")
    op.execute("ALTER TABLE refresh_tokens ALTER COLUMN user_id TYPE UUID USING user_id::uuid")
    op.execute("ALTER TABLE refresh_tokens ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at")
    op.execute("ALTER TABLE refresh_tokens ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at")

    # Drop old column, create new indexes
    op.drop_column('refresh_tokens', 'token')
    op.create_index('ix_refresh_tokens_jti', 'refresh_tokens', ['jti'], unique=True)
    op.create_index('ix_refresh_tokens_token_family', 'refresh_tokens', ['token_family'], unique=False)
    op.create_index('ix_refresh_tokens_user_id', 'refresh_tokens', ['user_id'], unique=False)

    # ══════════════════════════════════════════════════════════════════════
    # Step 2: DROP ALL FKs referencing users.id before changing its type
    # ══════════════════════════════════════════════════════════════════════
    for table, constraint, _col in LEGACY_USER_FKS:
        _drop_fk_if_exists(table, constraint)

    # ══════════════════════════════════════════════════════════════════════
    # Step 3: Modify USERS schema
    # ══════════════════════════════════════════════════════════════════════
    # Add columns as NULLABLE first
    op.add_column('users', sa.Column('hashed_password', sa.String(length=1024), nullable=True))
    op.add_column('users', sa.Column('first_name', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('phone_number', sa.String(length=30), nullable=True))
    op.add_column('users', sa.Column('phone_country_code', sa.String(length=5), nullable=True))
    op.add_column('users', sa.Column('phone_national_number', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('phone_e164', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('phone_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('avatar_url', sa.String(length=2048), nullable=True))
    op.add_column('users', sa.Column('date_of_birth', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('gender', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('country', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('province_state', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('city', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('district', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('ward', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('street_address', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('postal_code', sa.String(length=20), nullable=True))

    # Status enum (create type first)
    op.execute("CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted')")
    op.execute("ALTER TABLE users ADD COLUMN status user_status NOT NULL DEFAULT 'active'")

    op.add_column('users', sa.Column('is_email_verified', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

    # Backfill required columns from legacy data
    op.execute("UPDATE users SET hashed_password = password WHERE hashed_password IS NULL")
    op.execute("""
        UPDATE users SET
            first_name = COALESCE(
                NULLIF(SPLIT_PART(COALESCE(full_name, email), ' ', 1), ''),
                SPLIT_PART(email, '@', 1)
            ),
            last_name = COALESCE(
                NULLIF(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1), ''),
                'User'
            )
        WHERE first_name IS NULL
    """)

    # Set NOT NULL after backfill
    op.alter_column('users', 'hashed_password', nullable=False)
    op.alter_column('users', 'first_name', nullable=False)
    op.alter_column('users', 'last_name', nullable=False)

    # Email type change
    op.execute("ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(320)")

    # Role enum migration: old ENUM('USER','PREMIUM','ADMIN') -> new ENUM('admin','user')
    op.execute("CREATE TYPE user_role AS ENUM ('admin', 'user')")
    op.execute("ALTER TABLE users ALTER COLUMN role DROP DEFAULT")
    op.execute("""
        ALTER TABLE users
        ALTER COLUMN role TYPE user_role
        USING CASE
            WHEN role::text = 'ADMIN' THEN 'admin'::user_role
            ELSE 'user'::user_role
        END
    """)
    op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'::user_role")
    op.execute('DROP TYPE IF EXISTS "Role"')

    # ID type change TEXT -> UUID (all FKs already dropped)
    op.execute("ALTER TABLE users ALTER COLUMN id TYPE UUID USING id::uuid")

    # Index changes
    op.execute("DROP INDEX IF EXISTS users_email_key")
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_phone_number', 'users', ['phone_number'], unique=True)
    op.create_unique_constraint('uq_users_phone_e164', 'users', ['phone_e164'])

    # Drop legacy columns
    op.drop_column('users', 'premium_expires_at')
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'phone')
    op.drop_column('users', 'password')
    op.drop_column('users', 'full_name')

    # ══════════════════════════════════════════════════════════════════════
    # Step 4: Recreate FKs (users.id is now UUID, but legacy columns are TEXT)
    # ══════════════════════════════════════════════════════════════════════
    # New FK for refresh_tokens (now UUID -> UUID)
    op.create_foreign_key('fk_refresh_tokens_user_id_users', 'refresh_tokens', 'users',
                          ['user_id'], ['id'], ondelete='CASCADE')

    # Legacy table FKs — convert their columns to UUID too, then recreate FK
    for table, constraint, col in LEGACY_USER_FKS:
        if table == "refresh_tokens":
            continue  # already handled above
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE UUID USING {col}::uuid")
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
            f"FOREIGN KEY ({col}) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE"
        )


def downgrade() -> None:
    # Note: downgrade is intentionally simplified. A full downgrade from UUID back
    # to TEXT with all legacy tables is complex and not expected in practice.
    raise NotImplementedError(
        "Downgrade from this migration is not supported. "
        "Restore from a database backup instead."
    )

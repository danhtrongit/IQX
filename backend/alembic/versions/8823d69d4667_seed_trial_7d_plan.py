"""seed_trial_7d_plan

Revision ID: 8823d69d4667
Revises: a1b2c3d4e5f6
Create Date: 2026-05-21 09:30:07.899342

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8823d69d4667'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TRIAL_PLAN_CODE = 'TRIAL_7D'


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO premium_plans (id, code, name, description, price_vnd, duration_days, is_active, sort_order, created_at, updated_at)
        VALUES (gen_random_uuid(), :code, :name, :description, 0, 7, true, -1, NOW(), NOW())
        ON CONFLICT (code) DO NOTHING
    """).bindparams(
        code=TRIAL_PLAN_CODE,
        name='Dùng thử 7 ngày',
        description='Gói dùng thử Premium 7 ngày miễn phí, tự cấp khi đăng ký tài khoản mới.',
    ))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM premium_plans WHERE code = :code").bindparams(code=TRIAL_PLAN_CODE))

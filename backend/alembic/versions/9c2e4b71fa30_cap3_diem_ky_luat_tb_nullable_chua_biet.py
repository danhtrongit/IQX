"""cap3 — điểm kỷ luật trung bình: NULL = "chưa biết", không phải 0

Revision ID: 9c2e4b71fa30
Revises: 8f1a5c7d2e64
Create Date: 2026-08-17 09:00:00.000000

``cap3_progress.diem_ky_luat_tb_cap3`` was ``NOT NULL DEFAULT 0``, which forced
the service to answer "0%" to a question it could not answer yet. Two states
were collapsed into one number:

  · **chưa biết** — the user just entered Cấp 3 and has no trading day yet, or
    has days but no day carrying a scorable tình huống kỷ luật;
  · **0%** — a real, measured, worst-possible discipline score.

The consequence was visible on one screen at once: the «Điểm kỷ luật» card at
the top of tab Hành trình said, correctly, "chưa có dữ liệu", while the Thách
thức Bản lĩnh widget directly under it printed "🔲 Điểm kỷ luật ≥ 80% — 0% /
80%" with an empty bar and "Trung bình giai đoạn Cấp 3: 0.0%". A user on their
first day in the level read that as "I am as undisciplined as it is possible to
be". Cấp 2's own daily score already models this correctly (``diem`` is
``float | None``); its mean must keep the same property.

★ NO DATA BACK-FILL. Existing 0.0 values are left as they are rather than
rewritten to NULL: a genuine 0 is indistinguishable from a sentinel 0 at this
point, and ``Cap3Service._recompute_progress`` recomputes the column from
``order_ketso`` history on EVERY read of the progress row — so the first
``GET /cap3/progress`` after deploy replaces whatever is stored with the honest
value (a real mean, or NULL). Writing SQL to guess here would be a second,
drifting implementation of a rule the service already owns.

DOWNGRADE IS LOSSY, plainly: NULL ("chưa biết") has no representation in a NOT
NULL column, so the downgrade maps every unknown back to 0.0 — re-introducing
exactly the confusion above. Nothing else about the row changes, so
upgrade → downgrade → upgrade is stable apart from that one collapse.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9c2e4b71fa30"
down_revision: Union[str, None] = "8f1a5c7d2e64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("cap3_progress") as batch:
        batch.alter_column(
            "diem_ky_luat_tb_cap3",
            existing_type=sa.Float(),
            nullable=True,
            server_default=None,
        )


def downgrade() -> None:
    # "chưa biết" cannot survive a NOT NULL column — collapse it back to 0.0.
    op.execute(
        "UPDATE cap3_progress SET diem_ky_luat_tb_cap3 = 0 "
        "WHERE diem_ky_luat_tb_cap3 IS NULL"
    )
    with op.batch_alter_table("cap3_progress") as batch:
        batch.alter_column(
            "diem_ky_luat_tb_cap3",
            existing_type=sa.Float(),
            nullable=False,
            server_default="0",
        )

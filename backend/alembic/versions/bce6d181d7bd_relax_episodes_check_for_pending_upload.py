"""relax_episodes_check_for_pending_upload

Revision ID: bce6d181d7bd
Revises: 3a7f2b1c4d9e
Create Date: 2026-05-23 12:33:22.720272

The previous CHECK constraint required ``file_url IS NOT NULL`` for
pdf/video episodes. That blocks the designed 2-step upload flow where the
admin first creates episode metadata, then uploads the file. Relax the
constraint to allow ``file_url`` to be NULL temporarily (pending upload),
while still enforcing the mutual exclusivity with ``markdown_body``.

Publish-time validation is enforced at the service layer instead.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "bce6d181d7bd"
down_revision: Union[str, None] = "3a7f2b1c4d9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD = "ck_episodes_ck_episodes_content_type_payload"
_NEW_NAME = "ck_episodes_payload_shape"


def upgrade() -> None:
    op.drop_constraint(_OLD, "episodes", type_="check")
    op.create_check_constraint(
        _NEW_NAME,
        "episodes",
        # text     → markdown_body required, file_url forbidden
        # pdf/video → markdown_body forbidden, file_url optional (set after upload)
        "(content_type = 'text' AND markdown_body IS NOT NULL AND file_url IS NULL) "
        "OR (content_type IN ('pdf','video') AND markdown_body IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(_NEW_NAME, "episodes", type_="check")
    op.create_check_constraint(
        _OLD,
        "episodes",
        "(content_type = 'text' AND markdown_body IS NOT NULL AND file_url IS NULL) "
        "OR (content_type IN ('pdf','video') AND file_url IS NOT NULL AND markdown_body IS NULL)",
    )

"""Enforce frozen mascot assignment invariants.

Revision ID: f3b4c5d6e7f8
Revises: f2a3b4c5d6e7
"""

import sqlalchemy as sa

from alembic import op

revision = "f3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


_VALID_PROFILE = """
    mascot_rules_version > 0
    AND valid_pair_count >= 0
    AND assignment_status IN ('assigned', 'pending_data_repair')
    AND (mascot_id IS NULL OR mascot_id IN
        ('bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy'))
    AND (dominant_layer IS NULL OR dominant_layer IN
        ('ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia'))
    AND (assignment_basis IS NULL OR assignment_basis IN
        ('ai_match_count', 'stable_tie_break', 'zero_match_tie_break'))
    AND (window_start IS NULL OR window_start <= window_end)
    AND (assigned_at IS NULL OR assigned_at >= window_end)
    AND (
        (
            assignment_status = 'assigned'
            AND valid_pair_count > 0
            AND mascot_id IS NOT NULL
            AND dominant_layer IS NOT NULL
            AND assignment_basis IS NOT NULL
            AND window_start IS NOT NULL
            AND assigned_at IS NOT NULL
        )
        OR (
            assignment_status = 'pending_data_repair'
            AND valid_pair_count = 0
            AND mascot_id IS NULL
            AND dominant_layer IS NULL
            AND assignment_basis IS NULL
            AND assigned_at IS NULL
        )
    )
"""


def upgrade():
    # An invalid published assignment needs an explicit, audited correction.
    # Refuse to hide it by rewriting or deleting historical profile data here.
    invalid_id = op.get_bind().scalar(
        sa.text(f"SELECT id FROM bot_mascot_profiles WHERE NOT ({_VALID_PROFILE}) LIMIT 1")
    )
    if invalid_id is not None:
        raise RuntimeError(
            "bot_mascot_profiles contains an invalid frozen profile; "
            f"audit profile {invalid_id} before applying f3b4c5d6e7f8"
        )

    op.create_check_constraint(
        op.f("ck_bot_mascot_profiles_mascot_id"),
        "bot_mascot_profiles",
        "mascot_id IS NULL OR mascot_id IN "
        "('bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy')",
    )
    op.create_check_constraint(
        op.f("ck_bot_mascot_profiles_dominant_layer"),
        "bot_mascot_profiles",
        "dominant_layer IS NULL OR dominant_layer IN "
        "('ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia')",
    )
    op.create_check_constraint(
        op.f("ck_bot_mascot_profiles_assignment_basis"),
        "bot_mascot_profiles",
        "assignment_basis IS NULL OR assignment_basis IN "
        "('ai_match_count', 'stable_tie_break', 'zero_match_tie_break')",
    )
    op.create_check_constraint(
        op.f("ck_bot_mascot_profiles_window_order"),
        "bot_mascot_profiles",
        "window_start IS NULL OR window_start <= window_end",
    )
    op.create_check_constraint(
        op.f("ck_bot_mascot_profiles_assignment_shape"),
        "bot_mascot_profiles",
        "(assignment_status = 'assigned' AND valid_pair_count > 0 "
        "AND mascot_id IS NOT NULL AND dominant_layer IS NOT NULL "
        "AND assignment_basis IS NOT NULL AND window_start IS NOT NULL AND assigned_at IS NOT NULL) "
        "OR (assignment_status = 'pending_data_repair' AND valid_pair_count = 0 "
        "AND mascot_id IS NULL AND dominant_layer IS NULL "
        "AND assignment_basis IS NULL AND assigned_at IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_bot_mascot_profiles_assigned_after_window"),
        "bot_mascot_profiles",
        "assigned_at IS NULL OR assigned_at >= window_end",
    )


def downgrade():
    for name in (
        "assigned_after_window",
        "assignment_shape",
        "window_order",
        "assignment_basis",
        "dominant_layer",
        "mascot_id",
    ):
        op.drop_constraint(op.f(f"ck_bot_mascot_profiles_{name}"), "bot_mascot_profiles", type_="check")

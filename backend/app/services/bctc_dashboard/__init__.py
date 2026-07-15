"""BCTC storytelling dashboard — deterministic compute layer (Task B1).

Produces the ``BctcDashboardData`` contract consumed by the investor-facing
"kể chuyện 2 lớp" dashboard. All series/metrics are computed deterministically
from the 3 financial statements + ratio rows + company overview.

Peer-median (B2) and threshold/radar scoring (B3) are left as ``None``
placeholders for the follow-up tasks to fill.
"""

from app.services.bctc_dashboard.compute import (
    assemble_dashboard,
    compute_dashboard,
    compute_dashboard_with_url,
)
from app.services.bctc_dashboard.narrative import generate_narrative
from app.services.bctc_dashboard.narrative_validator import validate_narrative

__all__ = [
    "assemble_dashboard",
    "compute_dashboard",
    "compute_dashboard_with_url",
    "generate_narrative",
    "validate_narrative",
]

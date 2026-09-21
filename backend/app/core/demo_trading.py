"""Scope of the current Demo Trading journey; historical levels remain stored."""

from app.core.exceptions import ConflictError

CAP_MAX_ENABLED = 6


def require_open_level(level: int) -> None:
    """Prevent new entry beyond the current journey without migrating old users."""
    if level > CAP_MAX_ENABLED:
        raise ConflictError("Lộ trình IQX Demo Trading kết thúc tại Cấp 6 «Bậc thầy».")

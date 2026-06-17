"""Alert system: 10 admin-curated signals → intraday watchlist scan → Telegram."""

from __future__ import annotations

from app.services.alerts.signals import SIGNAL_DEFS

__all__ = ["SIGNAL_DEFS"]

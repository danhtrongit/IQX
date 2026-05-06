# Database models
# Import all models here so SQLAlchemy metadata is fully populated
# before any FK resolution is attempted at runtime.

from app.models.user import User  # noqa: F401
from app.models.virtual_trading import (  # noqa: F401
    VirtualCashLedger,
    VirtualOrder,
    VirtualPosition,
    VirtualSettlement,
    VirtualTrade,
    VirtualTradingAccount,
    VirtualTradingConfig,
)

try:
    from app.models.watchlist import WatchlistItem  # noqa: F401
except ImportError:
    pass

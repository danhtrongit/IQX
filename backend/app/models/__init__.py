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

from app.models.admin_audit import AdminAuditLog  # noqa: F401
from app.models.backtest_strategy import BacktestStrategy  # noqa: F401
from app.models.chart_drawing import ChartDrawing  # noqa: F401
from app.models.ipn_log import SePayIPNLog  # noqa: F401
from app.models.lesson import Course, Episode, EpisodeProgress  # noqa: F401
from app.models.login_history import UserLoginHistory  # noqa: F401

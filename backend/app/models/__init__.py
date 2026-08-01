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
from app.models.alert import AlertEvent, AlertSignal, UserAlertRule  # noqa: F401
from app.models.cap0 import Cap0Progress, UserPlacement  # noqa: F401
from app.models.cap1 import Cap1Progress, OrderKehoach, OrderKetso  # noqa: F401
from app.models.cap2 import Cap2Progress  # noqa: F401
from app.models.cap3 import Cap3Progress  # noqa: F401
from app.models.cap4 import Cap4Progress  # noqa: F401
from app.models.cap5 import Cap5Progress, StandbyDecision  # noqa: F401
from app.models.cap6 import Cap6Progress  # noqa: F401
from app.models.cap7 import Cap7Progress  # noqa: F401
from app.models.backtest_strategy import BacktestStrategy  # noqa: F401
from app.models.chart_drawing import ChartDrawing  # noqa: F401
from app.models.ipn_log import SePayIPNLog  # noqa: F401
from app.models.lesson import Course, Episode, EpisodeProgress  # noqa: F401
from app.models.login_history import UserLoginHistory  # noqa: F401
from app.models.market_analysis import AnalysisClaim, AnalysisHistory  # noqa: F401
from app.models.ai_insight_history import AIInsightHistory  # noqa: F401
from app.models.portfolio_report import PortfolioReport  # noqa: F401
from app.models.market_data_snapshot import MarketDataSnapshot  # noqa: F401
from app.models.sector_median_cache import SectorMedianCache  # noqa: F401

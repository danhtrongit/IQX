"""Virtual Trading API schemas — request/response models.

Split into sub-modules by domain concern; re-exported here
so existing ``from app.schemas.virtual_trading import …`` keeps working.
"""

from app.schemas.virtual_trading.account import AccountResponse
from app.schemas.virtual_trading.admin import AdminAccountResponse, ResetResponse
from app.schemas.virtual_trading.config import ConfigResponse, ConfigUpdate
from app.schemas.virtual_trading.leaderboard import LeaderboardEntry, LeaderboardResponse
from app.schemas.virtual_trading.order import (
    OrderCreateRequest,
    OrderListResponse,
    OrderResponse,
)
from app.schemas.virtual_trading.position import PortfolioResponse, PositionResponse
from app.schemas.virtual_trading.trade import RefreshResponse, TradeListResponse, TradeResponse

__all__ = [
    # config
    "ConfigResponse",
    "ConfigUpdate",
    # account
    "AccountResponse",
    # position
    "PositionResponse",
    "PortfolioResponse",
    # order
    "OrderCreateRequest",
    "OrderResponse",
    "OrderListResponse",
    # trade
    "TradeResponse",
    "TradeListResponse",
    "RefreshResponse",
    # leaderboard
    "LeaderboardEntry",
    "LeaderboardResponse",
    # admin
    "AdminAccountResponse",
    "ResetResponse",
]

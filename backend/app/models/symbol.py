"""Symbol database model — internal stock/company reference data."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDMixin


class Symbol(UUIDMixin, TimestampMixin, Base):
    """Internal symbol/company reference table.

    Populated via the seed script from upstream sources (Vietcap, VNDirect).
    Used for DB-backed search instead of hitting upstream on every request.
    """

    __tablename__ = "symbols"

    # ── Core identifiers ────────────────────────────
    symbol: Mapped[str] = mapped_column(
        String(10), unique=True, index=True, nullable=False,
    )
    name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    short_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ── Classification ──────────────────────────────
    exchange: Mapped[str | None] = mapped_column(String(20), nullable=True)
    asset_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="stock", server_default="stock",
    )
    is_index: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False,
    )

    # ── Pricing ─────────────────────────────────────
    current_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    target_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    upside_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    # ── Logo ────────────────────────────────────────
    logo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    logo_source: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # ── Industry classification ─────────────────────
    icb_lv1: Mapped[str | None] = mapped_column(String(100), nullable=True)
    icb_lv2: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ── Provenance ──────────────────────────────────
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Status ──────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False,
    )

    __table_args__ = (
        Index("ix_symbols_exchange", "exchange"),
        Index("ix_symbols_asset_type", "asset_type"),
        Index("ix_symbols_is_index", "is_index"),
    )

    def __repr__(self) -> str:
        return f"<Symbol {self.symbol} ({self.exchange})>"


#: Giá trị ``asset_type`` của một cổ phiếu thường.
ASSET_TYPE_CO_PHIEU = "stock"


def la_co_phieu(row: Symbol) -> bool:
    """Mã này có phải cổ phiếu giao dịch được không (kiểm trên MỘT hàng đã đọc).

    ★★ **NGUỒN DUY NHẤT của luật "là cổ phiếu"** — dùng cả ở ``POST /watchlist``
    và ở Cấp 5 (``_validate_symbol`` + rổ săn mã). Trước đây luật này bị chép
    tay ba chỗ với hai hành vi khác nhau cho ``asset_type IS NULL``: rổ săn mã
    ``coalesce(asset_type,'stock')`` NHẬN mã NULL, còn hai chỗ kiểm lại TỪ CHỐI
    nó ⇒ mã hiện trong kết quả săn, bấm "+ Watchlist" thì 400.

    Chốt theo phía TỪ CHỐI: cột ``asset_type`` nullable, NULL nghĩa là "chưa
    biết là loại gì" — coi nó là cổ phiếu là một phỏng đoán, và ``POST
    /watchlist`` (đường thêm mã dùng chung, có trước Cấp 5) đã từ chối từ lâu.
    Nới hai chỗ kia ra để khớp với rổ sẽ đổi hành vi của một endpoint dùng chung
    vì tiện cho Cấp 5.
    """
    return (
        row.is_active
        and not row.is_index
        and (row.asset_type or "").lower() == ASSET_TYPE_CO_PHIEU
    )


def dieu_kien_co_phieu() -> list:
    """Cùng luật với ``la_co_phieu`` nhưng ở dạng mệnh đề SQL (cho truy vấn rổ).

    ★ ``asset_type IS NULL`` KHÔNG khớp ``lower(asset_type) = 'stock'`` trong
    SQL — đúng cái ta muốn: mã chưa biết loại thì không vào rổ.
    """
    from sqlalchemy import func

    return [
        Symbol.is_active.is_(True),
        Symbol.is_index.is_(False),
        func.lower(Symbol.asset_type) == ASSET_TYPE_CO_PHIEU,
    ]

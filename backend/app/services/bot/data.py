"""Market-data adapter for a frozen Bot v1 session snapshot.

The adapter deliberately keeps research data separate from execution data.
An adjusted close can power the existing Hunt filters, but it is not promoted
to an official execution close. Missing authoritative contracts fail closed.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any, Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.symbol import Symbol, dieu_kien_co_phieu
from app.models.virtual_trading import VirtualTradingConfig
from app.services.bot.domain import SOURCE_FILTER_IDS, canonical_hash, decimal_value, finite_positive_int
from app.services.cap5.hunt import FILTER_SPECS, SO_NEN_CAN, HuntEngine
from app.services.cap5.hunt_data import LiveHuntDataSource
from app.services.cap6.mau_thuan import bac_cua_nhan
from app.services.journey_identity.datasets import valuation_verdict

logger = logging.getLogger(__name__)

_VN_TZ = timezone(timedelta(hours=7))
_NORMAL_SECURITY_STATUS = "normal"

SecurityStatusResolver = Callable[[Sequence[str], date], Awaitable[dict[str, str]]]


class BotSnapshotProvider(Protocol):
    async def build_snapshot(self, trading_date: date, *, open_symbols: Sequence[str]) -> dict[str, Any]: ...


class _PinnedSecurityStatusSource:
    """Delegate Hunt data while reusing one exact security-status response."""

    def __init__(self, source: LiveHuntDataSource, restricted: set[str] | None) -> None:
        self._source = source
        self._restricted = restricted

    async def daily_bars(self, symbols: Sequence[str], *, so_nen: int):  # noqa: ANN201
        return await self._source.daily_bars(symbols, so_nen=so_nen)

    async def net_flow(self, symbols: Sequence[str], *, ben: str, so_phien: int):  # noqa: ANN201
        return await self._source.net_flow(symbols, ben=ben, so_phien=so_phien)

    async def restricted_symbols(self) -> set[str] | None:
        return None if self._restricted is None else set(self._restricted)


async def live_session_ready(trading_date: date) -> bool | None:
    """Whether the project's daily-price source identifies ``trading_date``.

    This is only a session-calendar check. It does not certify VNDIRECT's
    adjusted research row as an official execution close.
    """
    source = LiveHuntDataSource(use_cache=True, today=trading_date)
    sessions = await source._lich_phien(1, toi_thieu=1)  # noqa: SLF001 - adapter boundary
    if sessions is None:
        return None
    return str(sessions[-1]) == trading_date.isoformat()


def _issue(code: str, detail: str, symbol: str | None = None) -> dict[str, Any]:
    return {"code": code, "symbol": symbol, "detail": detail}


def _session_date(value: object) -> date | None:
    """Normalize provider ISO dates or Unix timestamps without guessing."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.isdigit()):
        try:
            timestamp = float(value)
            if timestamp > 10_000_000_000:  # milliseconds
                timestamp /= 1000
            return datetime.fromtimestamp(timestamp, tz=UTC).astimezone(_VN_TZ).date()
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _insight_sessions(payload: dict[str, Any]) -> set[date]:
    raw_input = payload.get("rawInput")
    trend = raw_input.get("trend") if isinstance(raw_input, dict) else None
    bars = trend.get("ohlcv") if isinstance(trend, dict) else None
    sessions: set[date] = set()
    for bar in bars if isinstance(bars, list) else []:
        if not isinstance(bar, dict):
            continue
        for key in ("date", "tradingDate", "t", "time"):
            parsed = _session_date(bar.get(key))
            if parsed is not None:
                sessions.add(parsed)
                break
    explicit = _session_date(payload.get("trading_date") or payload.get("as_of_session"))
    if explicit is not None:
        sessions.add(explicit)
    return sessions


def _canonical_l1(payload: dict[str, Any], trading_date: date) -> tuple[str | None, str | None]:
    """Read only the explicit canonical L1 contract required by Bot v1.

    OHLCV is intentionally not accepted here. The Bot must never create a new
    ATR/lookback that merely resembles the value displayed by IQX L1.
    """
    as_of = _session_date(payload.get("l1_as_of_session"))
    source_ref = payload.get("l1_amplitude_source_ref")
    amplitude = decimal_value(payload.get("l1_amplitude_vnd"))
    if (
        as_of != trading_date
        or amplitude is None
        or amplitude <= 0
        or not isinstance(source_ref, str)
        or not source_ref.strip()
    ):
        return None, None
    return str(amplitude), source_ref.strip()


def _layer(source: str, payload: dict[str, Any], *, insight_ref: str) -> dict[str, Any] | None:
    card = (payload.get("layers") or {}).get(source) or {}
    label = card.get("statusLabel")
    rank = bac_cua_nhan(source, label)
    if rank is None:
        return None
    return {
        "verdict": "ok" if rank >= 4 else "bad" if rank <= 2 else "neu",
        "raw_level": str(label),
        "is_very_negative": rank == 1,
        "source_ref": f"{insight_ref}:{source}",
    }


class LiveBotSnapshotProvider:
    """Build a real, auditable EOD snapshot for the requested session."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        security_status_resolver: SecurityStatusResolver | None = None,
        use_cache: bool = True,
        max_layer_concurrency: int = 4,
    ) -> None:
        self.db = db
        self.security_status_resolver = security_status_resolver
        self.use_cache = use_cache
        # Retained for constructor compatibility. A single AsyncSession cannot
        # safely be used concurrently, so live analysis is intentionally serial.
        self.max_layer_concurrency = max(1, max_layer_concurrency)

    async def _universe(self) -> list[str]:
        rows = (
            await self.db.execute(
                select(Symbol.symbol)
                .where(
                    func.upper(Symbol.exchange) == "HOSE",
                    *dieu_kien_co_phieu(),
                )
                .order_by(Symbol.symbol)
            )
        ).scalars()
        return [str(symbol).upper() for symbol in rows]

    async def _fee_rules(self) -> dict[str, Any] | None:
        row = (
            await self.db.execute(
                select(VirtualTradingConfig)
                .where(VirtualTradingConfig.is_active.is_(True))
                .order_by(VirtualTradingConfig.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if row is None:
            return None
        return {
            "buy_fee_rate_bps": row.buy_fee_rate_bps,
            "sell_fee_rate_bps": row.sell_fee_rate_bps,
            "sell_tax_rate_bps": row.sell_tax_rate_bps,
            "board_lot_size": row.board_lot_size,
            "source_ref": f"virtual_trading_configs:{row.id}",
        }

    async def _analysis(self, symbol: str, trading_date: date) -> dict[str, Any]:
        """Fetch IQX Insight+BCTC serially and require exact-session evidence."""
        from app.services.ai.analysis_service import analyze_insight
        from app.services.bctc_dashboard.compute import compute_dashboard

        try:
            insight = await analyze_insight(symbol=symbol)
        except Exception as exc:  # noqa: BLE001 - explicit per-symbol issue
            return {"error": type(exc).__name__}
        if not isinstance(insight, dict) or trading_date not in _insight_sessions(insight):
            return {"error": "analysis_session_mismatch"}

        try:
            # Do not gather calls that share ``self.db``. SQLAlchemy documents
            # AsyncSession as stateful and unsafe for concurrent task use.
            bctc = await compute_dashboard(symbol, db=self.db)
        except Exception as exc:  # noqa: BLE001 - explicit per-symbol issue
            return {"error": type(exc).__name__}

        insight_hash = canonical_hash(insight)
        insight_ref = f"ai_insight:{trading_date.isoformat()}:{insight_hash}"
        layers: dict[str, Any] = {}
        for key, source in {
            "ky_thuat": "L1",
            "dong_tien": "L3",
            "noi_bo": "L4",
            "tin_tuc": "L5",
        }.items():
            normalized = _layer(source, insight, insight_ref=insight_ref)
            if normalized is not None:
                layers[key] = normalized
        valuation = ((bctc or {}).get("blocks") or {}).get("valuation") or {}
        price = ((insight or {}).get("header") or {}).get("price") or valuation.get("current_price")
        value_verdict = valuation_verdict(valuation, price)
        valuation_hash = canonical_hash(valuation)
        if value_verdict is not None:
            layers["dinh_gia"] = {
                "verdict": value_verdict,
                "raw_level": value_verdict,
                "is_very_negative": False,
                "source_ref": f"bctc_valuation:{valuation_hash}",
            }
        amplitude, amplitude_ref = _canonical_l1(insight, trading_date)
        return {
            "layers": layers,
            "l1_amplitude_vnd": amplitude,
            "l1_amplitude_source_ref": amplitude_ref,
            "source_refs": {
                "insight": {
                    "as_of_session": trading_date.isoformat(),
                    "observed_at": insight.get("updatedAt"),
                    "hash": insight_hash,
                },
                "valuation": {"meta": bctc.get("meta"), "hash": valuation_hash},
                "l1_amplitude": {
                    "source_ref": amplitude_ref,
                    "as_of_session": trading_date.isoformat() if amplitude is not None else None,
                    "available": amplitude is not None,
                },
            },
        }

    async def _security_statuses(
        self,
        source: LiveHuntDataSource,
        universe: Sequence[str],
        trading_date: date,
    ) -> tuple[dict[str, str], set[str] | None, dict[str, Any]]:
        """Resolve statuses before top-10 ranking and pin them for all filters."""
        if self.security_status_resolver is not None:
            try:
                resolved = await self.security_status_resolver(universe, trading_date)
                if not isinstance(resolved, dict):
                    raise TypeError("security resolver must return a dict")
                statuses = {
                    str(symbol).upper(): str(status).strip().lower()
                    for symbol, status in resolved.items()
                    if isinstance(symbol, str) and isinstance(status, str) and status.strip()
                }
            except Exception as exc:  # noqa: BLE001
                return {}, None, {"provider": "injected", "error": type(exc).__name__}
            restricted = {symbol for symbol, status in statuses.items() if status != _NORMAL_SECURITY_STATUS}
            return (
                statuses,
                restricted,
                {
                    "provider": "injected",
                    "as_of_session": trading_date.isoformat(),
                    "hash": canonical_hash(statuses),
                },
            )

        if trading_date != datetime.now(_VN_TZ).date():
            return (
                {},
                None,
                {
                    "provider": "HOSE securities/status-list + stock-status",
                    "as_of_session": None,
                    "error": "historical_status_not_supported",
                },
            )
        current_restricted = await source.restricted_symbols()
        if current_restricted is None:
            return (
                {},
                None,
                {
                    "provider": "HOSE securities/status-list + stock-status",
                    "as_of_session": trading_date.isoformat(),
                    "error": "provider_unavailable",
                },
            )
        statuses = {
            symbol: (
                "restricted" if symbol in current_restricted else _NORMAL_SECURITY_STATUS
            )
            for symbol in universe
        }
        return (
            statuses,
            current_restricted,
            {
                "provider": "HOSE securities/status-list + stock-status",
                "as_of_session": trading_date.isoformat(),
                "hash": canonical_hash({"restricted": sorted(current_restricted)}),
            },
        )

    async def build_snapshot(self, trading_date: date, *, open_symbols: Sequence[str]) -> dict[str, Any]:
        observed_at = datetime.now(UTC)
        issues: list[dict[str, Any]] = []
        universe = await self._universe()
        if not universe:
            issues.append(_issue("filter_data_incomplete", "Rổ cổ phiếu HOSE nội bộ đang rỗng"))
        source = LiveHuntDataSource(use_cache=self.use_cache, today=trading_date)

        # Resolve once before top-10, then reuse the exact set in every filter.
        statuses, restricted, security_ref = await self._security_statuses(source, universe, trading_date)
        status_complete = restricted is not None and all(symbol in statuses for symbol in universe)
        if not status_complete and universe:
            issues.append(
                _issue(
                    "missing_security_status",
                    "Không có trạng thái HOSE đúng phiên cho toàn bộ rổ mã; Bot dừng mua",
                )
            )

        engine = HuntEngine(_PinnedSecurityStatusSource(source, restricted))
        filter_payload: dict[str, Any] = {}
        filter_symbols: dict[str, set[str]] = {}
        filters_complete = bool(universe) and status_complete
        for source_id in FILTER_SPECS:
            result = await engine.run(source_id, universe)
            canonical_id = SOURCE_FILTER_IDS[source_id]
            filter_payload[canonical_id] = {
                "status": result.trang_thai,
                "complete": result.ket_qua_day_du,
                "missing_reason": result.ly_do_thieu_du_lieu or result.canh_bao_thieu_du_lieu,
                "items": result.items,
            }
            filter_symbols[canonical_id] = {str(row["symbol"]).upper() for row in result.items}
            if result.trang_thai != "ok" or result.ket_qua_day_du is not True:
                filters_complete = False
                issues.append(
                    _issue(
                        "filter_data_incomplete",
                        result.ly_do_thieu_du_lieu
                        or result.canh_bao_thieu_du_lieu
                        or f"Bộ lọc {canonical_id} chưa phủ đủ rổ mã",
                    )
                )

        all_symbols = sorted(set(universe) | {s.upper() for s in open_symbols})
        bars_map = await source.daily_bars(all_symbols, so_nen=SO_NEN_CAN)
        closes: dict[str, dict[str, Any]] = {}
        adjusted_close_evidence: dict[str, Any] = {}
        for symbol in all_symbols:
            bars = bars_map.get(symbol) or []
            current = bars[-1] if bars and bars[-1].ngay == trading_date.isoformat() else None
            adjusted_close = finite_positive_int(current.close) if current else None
            gtgd = [bar.gtgd_vnd for bar in bars[-20:]]
            valid_gtgd = [float(value) for value in gtgd if value is not None]
            avg20 = (
                int(round(sum(valid_gtgd) / 20))
                if len(gtgd) == 20 and len(valid_gtgd) == 20
                else None
            )
            adjusted_close_evidence[symbol] = adjusted_close
            closes[symbol] = {
                # HuntBar.close is VNDIRECT adClose: research input, not execution/NAV.
                "close_vnd": None,
                "close_is_official": False,
                "trading_value_avg20_vnd": avg20,
                "source_refs": {
                    "hunt_adjusted_close": {
                        "provider": "VNDIRECT finfo stock_prices.adClose",
                        "as_of_session": trading_date.isoformat() if current else None,
                        "value_vnd": adjusted_close,
                        "research_only": True,
                        "hash": canonical_hash(
                            {
                                "symbol": symbol,
                                "session": trading_date.isoformat(),
                                "adjusted_close_vnd": adjusted_close,
                            }
                        ),
                    }
                },
            }

        candidate_symbols = sorted(set().union(*filter_symbols.values()) if filter_symbols else set())
        # The current AI endpoints generate mutable, request-time output and do
        # not expose a stored exact-T model/input version. Do not fan out paid
        # AI calls from the scheduler and mislabel them as frozen EOD evidence.
        analyses: dict[str, dict[str, Any]] = {
            symbol: {"error": "canonical_layer_snapshot_unavailable"}
            for symbol in candidate_symbols
        }

        symbols_payload: dict[str, Any] = {}
        analysis_complete = True
        for symbol in sorted(set(all_symbols) | set(candidate_symbols)):
            filter_ids = tuple(sorted(key for key, values in filter_symbols.items() if symbol in values))
            analysis = analyses.get(symbol, {})
            security = statuses.get(symbol)
            close_payload = closes.get(symbol, {})
            source_refs = dict(close_payload.get("source_refs") or {})
            source_refs.update(analysis.get("source_refs") or {})
            symbols_payload[symbol] = {
                **close_payload,
                "exchange": "HOSE",
                "security_status": security,
                "security_status_verified": security is not None,
                "tradable_security_status": security == _NORMAL_SECURITY_STATUS,
                "filter_ids": list(filter_ids),
                "layers": analysis.get("layers", {}),
                "l1_amplitude_vnd": analysis.get("l1_amplitude_vnd"),
                "l1_amplitude_source_ref": analysis.get("l1_amplitude_source_ref"),
                "source_refs": source_refs,
                "analysis_error": analysis.get("error"),
            }
            if filter_ids:
                layers = analysis.get("layers") or {}
                if analysis.get("error") or len(layers) != 5:
                    analysis_complete = False
                    detail = str(analysis.get("error") or "five_layer_snapshot_incomplete")
                    issues.append(_issue("missing_layers", detail, symbol))
                if (
                    analysis.get("l1_amplitude_vnd") is None
                    or not analysis.get("l1_amplitude_source_ref")
                ):
                    analysis_complete = False
                    issues.append(
                        _issue(
                            "invalid_or_missing_l1_amplitude",
                            "Chưa có giá trị L1 canonical đúng phiên kèm source/version",
                            symbol,
                        )
                    )

        fee_rules = await self._fee_rules()
        if fee_rules is None:
            issues.append(_issue("source_error", "Chưa có cấu hình phí/thuế/lô đang hoạt động"))

        # No current repository source supplies finality/version. This remains
        # false even for an empty candidate set: a dated research row alone
        # cannot prove the batch evaluated a finalized market session.
        official = False
        issues.append(
            _issue(
                "missing_official_close",
                "VNDIRECT chỉ cấp adClose cho Săn mã; chưa có giá đóng cửa chính thức để giao dịch/NAV",
            )
        )

        fee_ref = {
            "source_ref": fee_rules.get("source_ref") if fee_rules else None,
            "hash": canonical_hash(fee_rules) if fee_rules else None,
        }
        source_refs = {
            "security_status": security_ref,
            "hunt_filters": {
                "provider": "IQX Cap5 HuntEngine",
                "as_of_session": trading_date.isoformat(),
                "hash": canonical_hash(filter_payload),
            },
            "adjusted_research_prices": {
                "provider": "VNDIRECT finfo stock_prices.adClose",
                "official_execution_close": False,
                "hash": canonical_hash(adjusted_close_evidence),
            },
            "fee_rules": fee_ref,
            "analyses": {symbol: analysis.get("source_refs", {}) for symbol, analysis in analyses.items()},
        }
        buy_inputs_complete = (
            filters_complete and status_complete and analysis_complete and official and fee_rules is not None
        )
        payload = {
            "trading_date": trading_date.isoformat(),
            "observed_at": observed_at.isoformat(),
            "close_is_official": official,
            "buy_inputs_complete": buy_inputs_complete,
            "fee_rules": fee_rules,
            "filters": filter_payload,
            "symbols": symbols_payload,
            "vnindex": None,
            "issues": issues,
            "source_refs": source_refs,
        }
        payload["data_version"] = f"bot-v1:{trading_date.isoformat()}:{canonical_hash(payload)[:16]}"
        payload["snapshot_hash"] = canonical_hash(payload)
        return payload

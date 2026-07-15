"""Compute layer for the BCTC storytelling dashboard.

``compute_dashboard(symbol)`` fetches the 3 financial statements + ratio rows +
company overview from VCI and assembles the ``BctcDashboardData`` contract.

The heavy lifting lives in :func:`assemble_dashboard`, a pure function over
``list[Period]`` + ratio rows + overview dict — unit-testable without network.

B1 fills every deterministic series/metric. It intentionally leaves
``peer_median=None`` / ``color=None`` (B2 benchmark layer) and radar
``score=None`` / ``band=None`` (B3 threshold layer).
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sector_median_cache import SectorMedianCache
from app.repositories.symbol import SymbolRepository
from app.services.bctc import kpi_bank, kpi_bank_modules, kpi_nonbank, kpi_nonbank_modules
from app.services.bctc.kpi_bank import earning_assets
from app.services.bctc.mapping_loader import load_mapping
from app.services.bctc.sector import detect_subsector, detect_template
from app.services.bctc.statements import Period, build_periods, period_label, val
from app.services.bctc.subsector import subsector_spotlight
from app.services.bctc.valuation import valuation_bank, valuation_nonbank
from app.services.bctc_dashboard.benchmark import apply_benchmark
from app.services.bctc_dashboard.peer_median import get_sector_medians
from app.services.market_data.sources import vietcap

logger = logging.getLogger(__name__)

_MAX_YEARS = 5

_DISCLAIMER_BASE = (
    "Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT); "
    "so ngành và ngưỡng mang tính tham chiếu. Không phải khuyến nghị mua/bán/giữ."
)
_DISCLAIMER_NONBANK_DCF = (
    "Football field dùng P/E lịch sử, thu nhập thặng dư (RIM) và sàn sổ sách; "
    "DCF chưa được ước lượng ở lớp tính toán deterministic."
)
_DISCLAIMER_BANK_NOTES = (
    "Thiếu thuyết minh: nợ xấu theo nhóm, CAR và CASA không có sẵn — "
    "chất lượng tài sản dùng số đại diện từ 3 báo cáo (ước tính)."
)


# ══════════════════════════════════════════════════════
# small helpers
# ══════════════════════════════════════════════════════


def _sum_present(*vals: float | None) -> float | None:
    present = [v for v in vals if v is not None]
    return sum(present) if present else None


def _debt(p: Period) -> float | None:
    """Interest-bearing debt (non-bank): short + long-term borrowings."""
    return _sum_present(val(p, "st_debt"), val(p, "lt_debt"))


def _bank_borrowings(p: Period) -> float | None:
    return _sum_present(
        val(p, "govt_sbv_borrowings"),
        val(p, "ci_deposits_borrowings"),
        val(p, "valuable_papers"),
    )


def _div(n: float | None, d: float | None) -> float | None:
    if n is None or not d:
        return None
    return n / d


def _mult(new: float | None, old: float | None) -> float | None:
    if new is None or not old:
        return None
    return new / old


def _fmt_pct(v: float | None) -> str | None:
    return None if v is None else f"{v * 100:.1f}%"


def _fmt_x(v: float | None) -> str | None:
    return None if v is None else f"{v:.2f}×"


def _oldest_to_newest(periods: list[Period]) -> list[Period]:
    """Newest-first ``periods`` → chronological slice (oldest → newest, ≤5)."""
    return list(reversed(periods[:_MAX_YEARS]))


def _ratio_val(rows: list[dict], key: str) -> float | None:
    """Latest (newest-first) numeric ratio value for ``key``."""
    for r in rows:
        v = r.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None


def _price_from_ratio(rows: list[dict]) -> float | None:
    """Derive current price/share (VND) from the newest ratio row.

    Priority: market_cap / shares → P/E × EPS → P/B × BVPS.
    """
    mc = _ratio_val(rows, "market_cap")
    shares = _ratio_val(rows, "number_of_shares_mkt_cap")
    if mc is not None and shares:
        return mc / shares
    pe, eps = _ratio_val(rows, "pe"), _ratio_val(rows, "eps")
    if pe is not None and eps is not None:
        return pe * eps
    pb, bvps = _ratio_val(rows, "pb"), _ratio_val(rows, "bvps")
    if pb is not None and bvps is not None:
        return pb * bvps
    return None


def _dividend_by_year(rows: list[dict]) -> dict[int, float]:
    out: dict[int, float] = {}
    for r in rows:
        try:
            year = int(r.get("year_report") or r.get("year") or 0)
        except (TypeError, ValueError):
            continue
        d = r.get("dividend")
        if year and isinstance(d, (int, float)) and not isinstance(d, bool):
            out.setdefault(year, float(d))
    return out


def _avg2(cur: Period, prev: Period | None, concept: str) -> float | None:
    a = val(cur, concept)
    if a is None:
        return None
    b = val(prev, concept) if prev is not None else None
    return (a + b) / 2 if b is not None else a


def _metric(
    key: str, label: str, value: float | None, unit: str
) -> dict[str, Any]:
    # B2 fills peer_median; B3 fills color.
    return {
        "key": key,
        "label": label,
        "value": value,
        "unit": unit,
        "peer_median": None,
        "color": None,
    }


# ══════════════════════════════════════════════════════
# KHỐI 0 — hero + radar
# ══════════════════════════════════════════════════════


def _hero(
    symbol: str, overview: dict, price: float | None, fair_value: float | None
) -> dict[str, Any]:
    return {
        "ticker": symbol.upper(),
        "name": overview.get("name"),
        "exchange": overview.get("exchange"),
        "sector": overview.get("icb_name_2"),
        "price": price,
        "fair_value": fair_value,
        "upside_pct": _div((fair_value - price), price)
        if fair_value is not None and price
        else None,
    }


def _radar(
    dims_spec: list[tuple[str, str, str | None, float | None]],
) -> dict[str, Any]:
    # score/band left None for B3 to fill; value_label carries the display
    # string, ``value`` the raw number B3 scores against sub-sector thresholds.
    return {
        "dims": [
            {
                "key": key,
                "label": label,
                "score": None,
                "band": None,
                "value_label": value_label,
                "value": value,
            }
            for key, label, value_label, value in dims_spec
        ]
    }


# ══════════════════════════════════════════════════════
# KHỐI 3 — bức tranh tài chính
# ══════════════════════════════════════════════════════


def _financial_block(periods: list[Period], is_bank: bool) -> dict[str, Any]:
    chrono = _oldest_to_newest(periods)
    newest, oldest = periods[0], chrono[0]

    def retained(p: Period) -> float | None:
        return val(p, "retained_earnings")

    if is_bank:
        def other_liab(p: Period) -> float | None:
            return val(p, "customer_deposits")

        debt_fn = _bank_borrowings
        # 3 nguồn tăng: LN giữ lại / tiền gửi huy động / vay & phát hành
        growth_defs = [
            ("Lợi nhuận giữ lại", retained),
            ("Tiền gửi huy động", other_liab),
            ("Vay & phát hành khác", debt_fn),
        ]
        asset_mix_defs = [
            ("Cho vay khách hàng", lambda p: val(p, "customer_loans")),
            (
                "Chứng khoán đầu tư",
                lambda p: _sum_present(
                    val(p, "investment_securities"), val(p, "trading_securities")
                ),
            ),
            (
                "Tiền & gửi NHNN/TCTD",
                lambda p: _sum_present(
                    val(p, "cash"),
                    val(p, "deposits_at_sbv"),
                    val(p, "deposits_at_other_ci"),
                ),
            ),
        ]
        totals_defs = [
            ("Tổng tài sản", "total_assets"),
            ("Cho vay khách hàng", "customer_loans"),
            ("Vốn chủ sở hữu", "equity"),
        ]
    else:
        def other_liab(p: Period) -> float | None:
            tl, d = val(p, "total_liabilities"), _debt(p)
            if tl is None:
                return None
            return tl - (d or 0.0)

        debt_fn = _debt
        # 3 nguồn tăng: LN giữ lại / nợ vận hành / vay nợ
        growth_defs = [
            ("Lợi nhuận giữ lại", retained),
            ("Nợ vận hành", other_liab),
            ("Vay nợ", debt_fn),
        ]
        asset_mix_defs = [
            (
                "Tiền & ĐT ngắn hạn",
                lambda p: _sum_present(val(p, "cash"), val(p, "st_investments")),
            ),
            ("Phải thu khách hàng", lambda p: val(p, "trade_receivables")),
            ("Tài sản cố định", lambda p: val(p, "net_fixed_assets")),
        ]
        totals_defs = [
            ("Tổng tài sản", "total_assets"),
            ("Vốn chủ sở hữu", "equity"),
            ("Nợ phải trả", "total_liabilities"),
        ]

    stacked_abs = [
        {
            "year": p.year,
            "equity": val(p, "equity"),
            "other_liab": other_liab(p),
            "debt": debt_fn(p),
        }
        for p in chrono
    ]

    # nguồn tăng thêm đến từ đâu (5 năm)
    ta_delta = None
    ta_new, ta_old = val(newest, "total_assets"), val(oldest, "total_assets")
    if ta_new is not None and ta_old is not None:
        ta_delta = ta_new - ta_old
    growth_sources: list[dict[str, Any]] = []
    for label, fn in growth_defs:
        a, b = fn(newest), fn(oldest)
        amount = (a - b) if a is not None and b is not None else None
        growth_sources.append(
            {"label": label, "amount": amount, "pct": _div(amount, ta_delta)}
        )

    totals = [
        {
            "label": label,
            "value": val(newest, concept),
            "mult": _mult(val(newest, concept), val(oldest, concept)),
        }
        for label, concept in totals_defs
    ]

    # tài sản nằm ở đâu (hiện tại, % tổng TS)
    ta = val(newest, "total_assets")
    asset_mix: list[dict[str, Any]] = []
    accounted = 0.0
    for label, fn in asset_mix_defs:
        pct = _div(fn(newest), ta)
        if pct is not None:
            accounted += pct
        asset_mix.append({"label": label, "pct": pct})
    asset_mix.append(
        {"label": "Khác", "pct": (1.0 - accounted) if ta else None}
    )

    return {
        "stacked_abs": stacked_abs,
        "growth_sources": growth_sources,
        "totals": totals,
        "asset_mix": asset_mix,
    }


# ══════════════════════════════════════════════════════
# KHỐI 4 — kinh doanh (A) / kiếm tiền thế nào (B)
# ══════════════════════════════════════════════════════


def _business_block_a(periods: list[Period]) -> dict[str, Any]:
    chrono = _oldest_to_newest(periods)
    revenue_series = []
    for p in chrono:
        rev = val(p, "net_revenue")
        revenue_series.append(
            {
                "year": p.year,
                "revenue": rev,
                "gross_margin": _div(val(p, "gross_profit"), rev),
                "net_margin": _div(val(p, "npat"), rev),
            }
        )

    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    metrics = [
        _metric("revenue_growth", "Tăng trưởng doanh thu", kpi_nonbank.revenue_growth(cur, prev), "%"),
        _metric("gross_margin", "Biên lợi nhuận gộp", kpi_nonbank.gross_margin(cur), "%"),
        _metric("roe", "ROE", kpi_nonbank.roe(cur, prev), "%"),
    ]

    # chất lượng lợi nhuận (ước tính — thiếu thuyết minh): lõi = LN HĐKD, còn lại = một lần
    pbt, op = val(cur, "profit_before_tax"), val(cur, "operating_profit")
    core_pct = _div(op, pbt)
    oneoff_pct = (1.0 - core_pct) if core_pct is not None else None
    earnings_quality = {
        "core_pct": core_pct,
        "oneoff_pct": oneoff_pct,
        "peer_median": None,
    }

    return {
        "revenue_series": revenue_series,
        "metrics": metrics,
        "earnings_quality": earnings_quality,
    }


def _business_block_b(periods: list[Period]) -> dict[str, Any]:
    chrono = _oldest_to_newest(periods)
    revenue_series = []
    nim_series = []
    for i, p in enumerate(chrono):
        toi = val(p, "total_operating_income")
        revenue_series.append(
            {
                "year": p.year,
                "revenue": toi,
                "gross_margin": None,  # không áp dụng cho ngân hàng
                "net_margin": _div(val(p, "npat"), toi),
            }
        )
        # prev in chronological order is the element just before (older)
        prev = chrono[i - 1] if i > 0 else None
        nim_series.append({"year": p.year, "nim": kpi_bank.nim(p, prev)})

    cur = periods[0]
    prev0 = periods[1] if len(periods) > 1 else None
    roa = _div(val(cur, "npat"), _avg2(cur, prev0, "total_assets"))
    metrics = [
        _metric("nim", "NIM", kpi_bank.nim(cur, prev0), "%"),
        _metric("roa", "ROA", roa, "%"),
        _metric("roe", "ROE", kpi_bank.roe(cur, prev0), "%"),
    ]

    mix = kpi_bank_modules.toi_mix(cur)
    income_mix = [
        {"label": "Lãi thuần", "pct": mix.get("nii_pct")},
        {"label": "Phí dịch vụ", "pct": mix.get("fee_pct")},
        {"label": "Ngoại hối & KD chứng khoán", "pct": mix.get("trading_pct")},
        {"label": "Khác", "pct": mix.get("other_pct")},
    ]

    return {
        "revenue_series": revenue_series,
        "metrics": metrics,
        "nim_series": nim_series,
        "income_mix": income_mix,
    }


# ══════════════════════════════════════════════════════
# KHỐI 5 — tiền có thật không (A) / vận hành hiệu quả (B)
# ══════════════════════════════════════════════════════


def _cashflow_block_a(periods: list[Period]) -> dict[str, Any]:
    chrono = _oldest_to_newest(periods)
    profit_vs_cash = [
        {"year": p.year, "profit": val(p, "npat"), "cfo": val(p, "cfo")}
        for p in chrono
    ]

    cur = periods[0]
    bridge = kpi_nonbank_modules.cash_flow_bridge(cur)
    metrics = [
        _metric("cfo_ni", "Tiền từ KD / Lợi nhuận", bridge.get("cfo_ni"), "x"),
        _metric("fcf_margin", "Dòng tiền tự do / Doanh thu", bridge.get("fcf_margin"), "%"),
        _metric("accrual", "Phần lãi chưa thành tiền", bridge.get("sloan_accrual"), "%"),
    ]

    # waterfall: kind "base" cho các mốc neo (NI, CFO, FCF), "delta" cho các bước cộng/trừ
    base_keys = {"ni", "cfo", "fcf"}
    waterfall = [
        {
            "label": line["label"],
            "value": line["value"],
            "kind": "base" if line["key"] in base_keys else "delta",
        }
        for line in bridge["lines"]
    ]

    return {
        "profit_vs_cash": profit_vs_cash,
        "metrics": metrics,
        "waterfall": waterfall,
    }


def _cashflow_block_b(periods: list[Period]) -> dict[str, Any]:
    chrono = _oldest_to_newest(periods)
    cir_series = [{"year": p.year, "cir": kpi_bank.cir(p)} for p in chrono]

    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    pc = kpi_bank_modules.ppop_cor(cur, prev)
    metrics = [
        _metric("cir", "CIR (chi phí / thu nhập)", pc.get("cir"), "%"),
        _metric("cost_of_risk", "Chi phí tín dụng / Cho vay", pc.get("cost_of_risk"), "%"),
        _metric("provision_ppop", "Chi phí dự phòng / PPOP", pc.get("provision_ppop"), "%"),
    ]

    return {
        "cir_series": cir_series,
        "metrics": metrics,
        "ppop": pc.get("ppop"),
    }


# ══════════════════════════════════════════════════════
# KHỐI 2 — định giá
# ══════════════════════════════════════════════════════


def _valuation_block_a(
    ratio_rows: list[dict], price: float | None
) -> dict[str, Any]:
    v = valuation_nonbank(ratio_rows)
    summary = v.get("summary") or {}
    pe_band = v.get("pe_band")

    methods: list[dict[str, Any]] = []
    if pe_band:
        methods.append(
            {"name": "P/E lịch sử", "bear": pe_band["bear"], "base": pe_band["base"], "bull": pe_band["bull"]}
        )
    if v.get("rim") is not None:
        methods.append({"name": "Thu nhập thặng dư (RIM)", "bear": None, "base": v["rim"], "bull": None})
    if v.get("book_floor") is not None:
        methods.append({"name": "Sàn sổ sách", "bear": None, "base": v["book_floor"], "bull": None})
    if any(summary.get(k) is not None for k in ("bear", "base", "bull")):
        methods.append(
            {
                "name": "Trung vị tổng hợp",
                "bear": summary.get("bear"),
                "base": summary.get("base"),
                "bull": summary.get("bull"),
            }
        )

    fair_median = summary.get("base")
    metrics = [
        {"key": "pe", "label": "P/E", "value": _ratio_val(ratio_rows, "pe"), "peer_median": None},
        {"key": "pb", "label": "P/B", "value": _ratio_val(ratio_rows, "pb"), "peer_median": None},
        {"key": "roe", "label": "ROE", "value": _ratio_val(ratio_rows, "roe"), "peer_median": None},
    ]
    return {
        "methods": methods,
        "current_price": price,
        "fair_median": fair_median,
        "upside_pct": _div((fair_median - price), price) if fair_median is not None and price else None,
        "metrics": metrics,
    }


def _valuation_block_b(
    ratio_rows: list[dict], price: float | None, periods: list[Period]
) -> dict[str, Any]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    nim = kpi_bank.nim(cur, prev)
    pc = kpi_bank_modules.ppop_cor(cur, prev)
    roa = _div(val(cur, "npat"), _avg2(cur, prev, "total_assets"))
    em = _div(_avg2(cur, prev, "total_assets"), _avg2(cur, prev, "equity"))
    ta = val(cur, "total_assets")
    ea = earning_assets(cur)
    loans = val(cur, "customer_loans")
    v = valuation_bank(
        ratio_rows,
        nim=nim,
        cost_of_risk=pc.get("cost_of_risk"),
        roa=roa,
        equity_multiplier=em,
        earning_assets_ratio=_div(ea, ta),
        loans_ratio=_div(loans, ta),
    )

    fair_value = v.get("fair_value")
    metrics = [
        {"key": "pb", "label": "P/B hiện tại", "value": _ratio_val(ratio_rows, "pb"), "peer_median": None},
        {"key": "justified_pb", "label": "P/B hợp lý", "value": v.get("justified_pb"), "peer_median": None},
        {"key": "pe", "label": "P/E hiện tại", "value": _ratio_val(ratio_rows, "pe"), "peer_median": None},
        {"key": "roe", "label": "ROE", "value": _ratio_val(ratio_rows, "roe"), "peer_median": None},
    ]
    return {
        "methods": [],  # football field áp dụng cho phi-ngân hàng; NH dùng P/B
        "current_price": price,
        "fair_median": fair_value,
        "upside_pct": _div((fair_value - price), price) if fair_value is not None and price else None,
        "metrics": metrics,
    }


# ══════════════════════════════════════════════════════
# KHỐI 6 — sức khỏe (A) / chất lượng tài sản (B)
# ══════════════════════════════════════════════════════


def _health_block_a(periods: list[Period]) -> dict[str, Any]:
    chrono = _oldest_to_newest(periods)
    cur = periods[0]

    # 6A — nợ nhiều không? nợ ròng/EBITDA (5 năm) + nợ/vốn chủ (so ngành)
    sub_a = {
        "series": [{"year": p.year, "value": kpi_nonbank.net_debt_ebitda(p)} for p in chrono],
        "peer": [
            {"label": "Nợ vay / Vốn chủ (công ty)", "value": _div(_debt(cur), val(cur, "equity"))},
            {"label": "Trung vị ngành", "value": None},
        ],
    }

    # 6B — trụ được không? khả năng trả lãi vay (5 năm) + thanh khoản hiện hành
    def coverage(p: Period) -> float | None:
        ie = val(p, "interest_expense")
        return _div(val(p, "operating_profit"), abs(ie) if ie is not None else None)

    sub_b = {
        "series": [{"year": p.year, "value": coverage(p)} for p in chrono],
        "peer": [
            {
                "label": "Thanh khoản hiện hành (công ty)",
                "value": _div(val(cur, "current_assets"), val(cur, "current_liabilities")),
            },
            {"label": "Trung vị ngành", "value": None},
        ],
    }

    # 6C — chất lượng sổ sách: số ngày thu tiền (5 năm) + checklist ✓/⚠
    def dso(p: Period) -> float | None:
        ar, rev = val(p, "trade_receivables"), val(p, "net_revenue")
        return (ar / rev * 365) if ar is not None and rev else None

    newest, oldest = periods[0], chrono[0]
    bridge = kpi_nonbank_modules.cash_flow_bridge(newest)
    cfo_ni = bridge.get("cfo_ni")
    cc_new, cc_old = val(newest, "charter_capital"), val(oldest, "charter_capital")
    dso_new, dso_old = dso(newest), dso(oldest)
    checklist = [
        {
            "label": "Lợi nhuận có khớp với tiền mặt thu về?",
            "ok": (cfo_ni is not None and cfo_ni >= 1.0),
        },
        {
            "label": "Không pha loãng cổ phiếu của cổ đông?",
            "ok": (cc_new is not None and cc_old is not None and cc_new <= cc_old * 1.05),
        },
        {
            "label": "Khách hàng không trả tiền chậm dần?",
            "ok": (dso_new is not None and dso_old is not None and dso_new <= dso_old * 1.10),
        },
    ]
    sub_c = {
        "series": [{"year": p.year, "company": dso(p), "peer": None} for p in chrono],
        "checklist": checklist,
    }

    return {"sub_a": sub_a, "sub_b": sub_b, "sub_c": sub_c}


def _health_block_b(periods: list[Period]) -> dict[str, Any]:
    chrono = _oldest_to_newest(periods)
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None

    # 6A — nợ cho vay có xấu nhiều không? (dự phòng/cho vay = đại diện NPL, ước tính)
    sub_a = {
        "series": [{"year": p.year, "value": kpi_bank.llr_loans(p)} for p in chrono],
        "peer": [
            {"label": "Dự phòng / Cho vay (công ty)", "value": kpi_bank.llr_loans(cur)},
            {"label": "Ngưỡng cảnh báo", "value": 0.03},
            {"label": "Trung vị ngành", "value": None},
        ],
    }

    # 6B — có dự phòng đủ không? chi phí dự phòng/PPOP (5 năm) + đòn bẩy
    pc = kpi_bank_modules.ppop_cor(cur, prev)
    sub_b = {
        "series": [
            {
                "year": p.year,
                "value": _div(val(p, "provision_expense"), val(p, "ppop_reported")),
            }
            for p in chrono
        ],
        "peer": [
            {"label": "Chi phí dự phòng / PPOP (công ty)", "value": pc.get("provision_ppop")},
            {"label": "Đòn bẩy (Tổng TS / VCSH)", "value": _div(val(cur, "total_assets"), val(cur, "equity"))},
            {"label": "Trung vị ngành", "value": None},
        ],
    }

    return {"sub_a": sub_a, "sub_b": sub_b}


# ══════════════════════════════════════════════════════
# KHỐI 7 — cổ tức
# ══════════════════════════════════════════════════════


def _dividend_block(
    periods: list[Period], ratio_rows: list[dict], price: float | None, is_bank: bool
) -> dict[str, Any]:
    by_year = _dividend_by_year(ratio_rows)
    chrono = _oldest_to_newest(periods)
    series = [{"year": p.year, "value": by_year.get(p.year)} for p in chrono]

    latest_div = None
    for p in periods[:_MAX_YEARS]:
        if by_year.get(p.year) is not None:
            latest_div = by_year[p.year]
            break

    eps = _ratio_val(ratio_rows, "eps")
    return {
        "series": series,
        "yield": _div(latest_div, price) if latest_div is not None and price else None,
        "payout": _div(latest_div, eps) if latest_div is not None and eps else None,
        "form": "cổ phiếu" if is_bank else "tiền mặt",
    }


# ══════════════════════════════════════════════════════
# assembly
# ══════════════════════════════════════════════════════


def _empty_dashboard(symbol: str, template: str, overview: dict) -> dict[str, Any]:
    is_bank = template == "B"
    return {
        "template": template,
        "sub_sector": None,
        "hero": _hero(symbol, overview, None, None),
        "radar": _radar([]),
        "blocks": {},
        "meta": {
            "periods": [],
            "is_estimated_fields": [],
            "peer_count": 0,
            "peer_asof": None,
            "disclaimers": [
                _DISCLAIMER_BASE,
                "Không đủ dữ liệu BCTC để dựng dashboard.",
                _DISCLAIMER_BANK_NOTES if is_bank else _DISCLAIMER_NONBANK_DCF,
            ],
        },
    }


def assemble_dashboard(
    bs_rows: list[dict],
    is_rows: list[dict],
    cf_rows: list[dict],
    ratio_rows: list[dict] | None,
    overview: dict | None,
    *,
    symbol: str,
) -> dict[str, Any]:
    """Pure assembler → ``BctcDashboardData``. No network access."""
    overview = overview or {}
    ratio_rows = ratio_rows or []
    template = detect_template(is_rows)
    is_bank = template == "B"
    mapping = load_mapping("bank" if is_bank else "nonbank")
    periods = build_periods(bs_rows, is_rows, cf_rows, mapping)

    if not periods:
        return _empty_dashboard(symbol, template, overview)

    periods = periods[:_MAX_YEARS]
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    price = _price_from_ratio(ratio_rows)

    # sub_sector (Template A only — chỉ đổi ngưỡng/diễn giải, không đổi khối)
    if is_bank:
        sub_sector: str | None = None
    else:
        wcc = kpi_nonbank_modules.working_capital_cycle(cur, prev)
        sub = detect_subsector(cur, ccc=wcc.get("ccc"))
        sub_sector = subsector_spotlight(cur, sub).get("label")

    # blocks
    financial = _financial_block(periods, is_bank)
    if is_bank:
        business = _business_block_b(periods)
        cashflow = _cashflow_block_b(periods)
        valuation = _valuation_block_b(ratio_rows, price, periods)
        health = _health_block_b(periods)
    else:
        business = _business_block_a(periods)
        cashflow = _cashflow_block_a(periods)
        valuation = _valuation_block_a(ratio_rows, price)
        health = _health_block_a(periods)
    dividend = _dividend_block(periods, ratio_rows, price, is_bank)

    fair_value = valuation.get("fair_median")
    hero = _hero(symbol, overview, price, fair_value)

    # radar dims (score/band → B3; value_label deterministic)
    upside = valuation.get("upside_pct")
    if is_bank:
        toi_now, toi_prev = val(cur, "total_operating_income"), val(prev, "total_operating_income")
        toi_growth = _div((toi_now - toi_prev), toi_prev) if toi_now is not None and toi_prev else None
        roe_v = kpi_bank.roe(cur, prev)
        npl_v = kpi_bank.llr_loans(cur)
        cap_v = kpi_bank.equity_ratio(cur)
        radar = _radar(
            [
                ("growth", "Tăng trưởng", _fmt_pct(toi_growth), toi_growth),
                ("profitability", "Sinh lời", _fmt_pct(roe_v), roe_v),
                ("asset_quality", "Chất lượng tài sản", _fmt_pct(npl_v), npl_v),
                ("capital", "An toàn vốn", _fmt_pct(cap_v), cap_v),
                ("valuation", "Định giá", _fmt_pct(upside), upside),
            ]
        )
    else:
        rev_g = kpi_nonbank.revenue_growth(cur, prev)
        roe_v = kpi_nonbank.roe(cur, prev)
        cfo_ni_v = kpi_nonbank_modules.cash_flow_bridge(cur).get("cfo_ni")
        nde_v = kpi_nonbank.net_debt_ebitda(cur)
        radar = _radar(
            [
                ("business", "Kinh doanh", _fmt_pct(rev_g), rev_g),
                ("profitability", "Sinh lời", _fmt_pct(roe_v), roe_v),
                ("cashflow", "Dòng tiền", _fmt_x(cfo_ni_v), cfo_ni_v),
                ("safety", "An toàn tài chính", _fmt_x(nde_v), nde_v),
                ("valuation", "Định giá", _fmt_pct(upside), upside),
            ]
        )

    # meta — flag estimated blocks (không có thuyết minh)
    is_estimated: list[str] = []
    disclaimers = [_DISCLAIMER_BASE]
    if is_bank:
        is_estimated.append("blocks.health.sub_a.series")  # NPL đại diện = dự phòng/cho vay
        is_estimated.append("blocks.health.sub_b.series")
        disclaimers.append(_DISCLAIMER_BANK_NOTES)
    else:
        is_estimated.append("blocks.business.earnings_quality")  # lõi/một lần từ LN HĐKD vs LNTT
        disclaimers.append(_DISCLAIMER_NONBANK_DCF)

    return {
        "template": template,
        "sub_sector": sub_sector,
        "hero": hero,
        "radar": radar,
        "blocks": {
            "financial": financial,
            "business": business,
            "cashflow": cashflow,
            "valuation": valuation,
            "health": health,
            "dividend": dividend,
        },
        "meta": {
            "periods": [period_label(p) for p in periods],
            "is_estimated_fields": is_estimated,
            "peer_count": 0,
            "peer_asof": None,
            "disclaimers": disclaimers,
        },
    }


# ══════════════════════════════════════════════════════
# network entrypoints
# ══════════════════════════════════════════════════════


async def _apply_peer_benchmark(
    data: dict[str, Any],
    db: AsyncSession,
    symbol: str,
    overview: dict[str, Any],
) -> None:
    """Fill peer_median/color + radar score/band from sector medians (B3).

    Best-effort: any failure degrades to the un-benchmarked B1 shape (peers /
    colors stay ``None``) rather than breaking the dashboard.
    """
    try:
        icb_lv2: str | None = None
        try:
            row = await SymbolRepository(db).get_by_symbol(symbol)
            icb_lv2 = getattr(row, "icb_lv2", None) if row is not None else None
        except Exception:  # noqa: BLE001
            icb_lv2 = None
        if not icb_lv2:
            icb_lv2 = overview.get("icb_name_2")
        if not icb_lv2:
            return

        asof = date.today()
        medians = await get_sector_medians(db, icb_lv2, asof=asof)
        apply_benchmark(data, medians)
        data["meta"]["peer_asof"] = asof.isoformat()

        # Real peer count from the cache row written by get_sector_medians.
        try:
            count = (
                await db.execute(
                    select(SectorMedianCache.peer_count).where(
                        SectorMedianCache.icb_lv2 == icb_lv2,
                        SectorMedianCache.asof_date == asof,
                    )
                )
            ).scalar_one_or_none()
            if count is not None:
                data["meta"]["peer_count"] = int(count)
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001
        logger.warning(
            "bctc_dashboard: peer benchmark failed for %s", symbol, exc_info=True
        )


async def compute_dashboard_with_url(
    symbol: str, *, term_type: int = 1, db: AsyncSession | None = None
) -> tuple[dict[str, Any], str]:
    """Fetch VCI inputs + assemble the dashboard. Returns (data, raw_url).

    When ``db`` is provided, the B3 benchmark layer is applied (peer medians,
    threshold colors, radar scores). With ``db=None`` the dashboard is left in
    its deterministic B1 shape (peer/color/radar-score all ``None``).
    """
    sym = symbol.upper()
    statements, url = await vietcap.fetch_bctc_statements(sym, term_type=term_type)

    try:
        ratio_data, _ = await vietcap.fetch_financial_report(
            sym, report_type="ratio", period="Y"
        )
        ratio_rows = ratio_data if isinstance(ratio_data, list) else []
    except Exception:  # noqa: BLE001
        ratio_rows = []

    overview: dict[str, Any] = {}
    try:
        raw, _ = await vietcap.fetch_company_data(sym)
        overview = vietcap.normalize_company_overview(raw)
    except Exception:  # noqa: BLE001
        overview = {}

    data = assemble_dashboard(
        statements.get("balance_sheet", []),
        statements.get("income_statement", []),
        statements.get("cash_flow", []),
        ratio_rows,
        overview,
        symbol=sym,
    )

    if db is not None:
        await _apply_peer_benchmark(data, db, sym, overview)

    return data, url


async def compute_dashboard(
    symbol: str, *, term_type: int = 1, db: AsyncSession | None = None
) -> dict[str, Any]:
    """Public compute entrypoint → ``BctcDashboardData`` dict."""
    data, _url = await compute_dashboard_with_url(symbol, term_type=term_type, db=db)
    return data

"""Normalize VCI raw financial reports into UI-friendly Head/Content shape.

VCI exposes per-ticker metadata at:
  /v1/company/{symbol}/financial-statement/metrics

It returns three sections (BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW)
where each row has: ``level``, ``parent``, ``field`` (e.g. ``isa1``),
``titleVi`` (Vietnamese label).

VCI raw report data at /v1/company/{symbol}/financial-statement?section=…
returns ``{years: [...], quarters: [...]}`` where each item is a flat dict
keyed by ``isa1..isi125``, ``bsa1..bsb215``, ``cfa1..cfi100``.

This module merges metadata + data into the legacy KBS-like shape that the
frontend already renders:

    {
      "Head": [{"TermCode": "Q1", "YearPeriod": 2026, "TermName": "Q1/2026"}, ...],
      "Content": {"section_id": [{"Name", "Levels", "CssStyle", "ChildTotal",
                                  "ReportNormID", "ParentReportNormID",
                                  "Value1", "Value2", ...}, ...]}
    }
"""

from __future__ import annotations

import contextlib
from typing import Any

# Section codes returned by VCI metadata endpoint.
SECTION_BALANCE_SHEET = "BALANCE_SHEET"
SECTION_INCOME_STATEMENT = "INCOME_STATEMENT"
SECTION_CASH_FLOW = "CASH_FLOW"


def _term_label(year: int, length: int | None, term_type: int) -> tuple[str, str, str]:
    """Return ``(TermCode, TermName, sort_key)``.

    term_type=1: yearly. We expect ``length_report == 5``. TermCode = "Y".
    term_type=2: quarterly. ``length_report ∈ {1,2,3,4}``. TermCode = "Q{n}".
    """
    if term_type == 1 or length in (None, 5):
        return ("Y", str(year), f"{year:04d}-5")
    return (f"Q{length}", f"Q{length}/{year}", f"{year:04d}-{length}")


def _filter_periods(
    items: list[dict[str, Any]],
    *,
    term_type: int,
    page_size: int,
) -> list[dict[str, Any]]:
    """Filter, sort, and limit raw period rows.

    term_type=1 keeps only year-end (length_report=5).
    term_type=2 keeps quarterly rows (length_report 1..4).
    Sort newest first by (year_report, length_report).
    """
    if not items:
        return []

    if term_type == 1:
        filtered = [it for it in items if int(it.get("length_report", 0) or 0) == 5]
    else:
        filtered = [
            it
            for it in items
            if int(it.get("length_report", 0) or 0) in (1, 2, 3, 4)
        ]

    filtered.sort(
        key=lambda it: (
            int(it.get("year_report", 0) or 0),
            int(it.get("length_report", 0) or 0),
        ),
        reverse=True,
    )

    return filtered[:page_size]


def _build_head(
    periods: list[dict[str, Any]],
    *,
    term_type: int,
) -> list[dict[str, Any]]:
    """Build the Head array used by the frontend table header."""
    head: list[dict[str, Any]] = []
    for it in periods:
        year = int(it.get("year_report", 0) or 0)
        length = it.get("length_report")
        try:
            length_int: int | None = int(length) if length is not None else None
        except (TypeError, ValueError):
            length_int = None
        code, name, _ = _term_label(year, length_int, term_type)
        head.append({"TermCode": code, "YearPeriod": year, "TermName": name})
    return head


def _normalize_metadata(
    metrics: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Filter and order VCI metric rows for one section.

    Returns a list of rows with keys:
      ``field`` (lowercase, e.g. ``isa1``), ``name`` (Vietnamese),
      ``level`` (int), ``parent`` (lowercase or None).
    Rows are kept in the order returned by VCI (top→bottom of report).
    """
    out: list[dict[str, Any]] = []
    for raw in metrics or []:
        field = raw.get("field")
        if not field:
            continue
        title = (raw.get("titleVi") or raw.get("fullTitleVi") or "").strip()
        parent_raw = raw.get("parent")
        parent_norm = parent_raw.lower() if isinstance(parent_raw, str) else None
        try:
            level = int(raw.get("level", 1) or 1)
        except (TypeError, ValueError):
            level = 1
        out.append({
            "field": str(field).lower(),
            "name": title,
            "level": max(level - 1, 0),
            "parent": parent_norm,
        })
    return out


def to_kbs_shape(
    *,
    items: list[dict[str, Any]],
    metrics_section: list[dict[str, Any]],
    section_key: str,
    term_type: int,
    page_size: int,
) -> dict[str, Any]:
    """Convert VCI raw report into ``{Head, Content}`` shape.

    Args:
        items: snake_case rows for one section (e.g. ``years`` or ``quarters``).
        metrics_section: VCI metadata rows for the same section.
        section_key: short label used as the single key inside ``Content``
                     (the frontend simply flattens all sections).
        term_type: 1=Year, 2=Quarter.
        page_size: number of periods to return.
    """
    periods = _filter_periods(items, term_type=term_type, page_size=page_size)
    head = _build_head(periods, term_type=term_type)
    meta_rows = _normalize_metadata(metrics_section)

    # Pre-compute child counts so the UI can render expand/collapse arrows.
    child_count: dict[str, int] = {}
    for m in meta_rows:
        if m["parent"]:
            child_count[m["parent"]] = child_count.get(m["parent"], 0) + 1

    rows: list[dict[str, Any]] = []
    for idx, m in enumerate(meta_rows, start=1):
        field = m["field"]
        is_section_head = m["level"] == 0
        row: dict[str, Any] = {
            "Name": m["name"],
            "Levels": m["level"],
            "CssStyle": "B" if is_section_head else "",
            "ChildTotal": child_count.get(field, 0),
            "ReportNormID": idx,
            "ParentReportNormID": _index_of(meta_rows, m["parent"]) if m["parent"] else None,
            "FieldCode": field,
        }
        for col, period in enumerate(periods, start=1):
            row[f"Value{col}"] = period.get(field)
        rows.append(row)

    return {
        "Head": head,
        "Content": {section_key: rows},
    }


def _index_of(meta_rows: list[dict[str, Any]], field: str | None) -> int | None:
    """Return 1-based position of ``field`` in ``meta_rows`` or None."""
    if not field:
        return None
    for idx, row in enumerate(meta_rows, start=1):
        if row["field"] == field:
            return idx
    return None


# ══════════════════════════════════════════════════════
# Ratio helpers
# ══════════════════════════════════════════════════════


# Field name candidates per concept. Backend ratio output is unioned across
# bank and non-bank schemas, so we look up each value through a list of
# fallbacks. Frontend uses snake_case names exclusively.
RATIO_FIELD_FALLBACKS: dict[str, list[str]] = {
    "revenue": ["revenue", "net_revenue", "total_operating_income"],
    "net_profit": ["net_profit", "profit_after_tax", "net_profit_after_tax"],
    "revenue_growth": ["revenue_growth", "revenue_yoy"],
    "net_profit_growth": ["net_profit_growth", "profit_after_tax_growth"],
    "eps": ["eps", "earnings_per_share", "basic_eps"],
    "bvps": ["bvps", "book_value_per_share"],
    "dividend": ["dividend", "cash_dividend"],
}


def _bank_metrics(
    income_quarters: list[dict[str, Any]],
    income_years: list[dict[str, Any]] | None = None,
) -> dict[tuple[int, int], dict[str, float]]:
    """Synthesize revenue/net_profit/eps from income_statement rows.

    Detects bank vs non-bank per record by presence of ``isb38`` (banks have
    Total Operating Income there). For banks: revenue=isb38, net_profit=isb43
    or isa22, eps=isa23. For non-banks: revenue=isa3, net_profit=isa22,
    eps=isa23.
    """
    out: dict[tuple[int, int], dict[str, float]] = {}
    sources = list(income_quarters or []) + list(income_years or [])
    for it in sources:
        try:
            year = int(it.get("year_report") or 0)
            length = int(it.get("length_report") or 0)
        except (TypeError, ValueError):
            continue
        if not year:
            continue
        is_bank = bool(it.get("isb38") or it.get("isb27") or it.get("isb43"))
        if is_bank:
            revenue = it.get("isb38") or it.get("isb27") or 0
            npat = it.get("isb43") or it.get("isa22") or 0
        else:
            revenue = it.get("isa3") or 0
            npat = it.get("isa22") or 0
        eps = it.get("isa23") or it.get("isa24") or 0
        out[(year, length)] = {
            "revenue": float(revenue or 0),
            "net_profit": float(npat or 0),
            "eps": float(eps or 0),
        }
    return out


def enrich_ratio_records(
    ratio_rows: list[dict[str, Any]],
    *,
    income_quarters: list[dict[str, Any]] | None = None,
    income_years: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Add canonical fields (revenue, net_profit, eps, bvps, …).

    1. Fill canonical names from fallbacks already present in the ratio row.
    2. If still missing, synthesize from KQKD (income statement) by
       (year_report, length_report).
    3. Compute year-over-year growth where missing.
    4. Compute BVPS from market_cap / pb / number_of_shares_mkt_cap when
       not supplied.
    """
    if not ratio_rows:
        return []

    synth = _bank_metrics(income_quarters or [], income_years or [])

    enriched: list[dict[str, Any]] = []
    for row in ratio_rows:
        new_row = dict(row)
        # Some VCI ratio rows store year as string and quarter under ``quarter``.
        try:
            year = int(new_row.get("year_report") or new_row.get("year") or 0)
            quarter = int(new_row.get("length_report") or new_row.get("quarter") or 0)
        except (TypeError, ValueError):
            year, quarter = 0, 0
        new_row["year_report"] = year
        new_row["length_report"] = quarter

        for canonical, candidates in RATIO_FIELD_FALLBACKS.items():
            if new_row.get(canonical) not in (None, 0, 0.0):
                continue
            for cand in candidates:
                v = new_row.get(cand)
                if v not in (None, 0, 0.0):
                    new_row[canonical] = v
                    break

        if year and quarter and synth:
            syn = synth.get((year, quarter))
            if syn:
                if not new_row.get("revenue"):
                    new_row["revenue"] = syn["revenue"]
                if not new_row.get("net_profit"):
                    new_row["net_profit"] = syn["net_profit"]
                if not new_row.get("eps"):
                    new_row["eps"] = syn["eps"]

        # Derive BVPS from book value when missing.
        # BVPS = market_cap / pb / shares_outstanding.
        if not new_row.get("bvps"):
            shares = new_row.get("number_of_shares_mkt_cap") or 0
            mc = new_row.get("market_cap") or 0
            pb = new_row.get("pb") or 0
            if shares and mc and pb:
                with contextlib.suppress(TypeError, ZeroDivisionError):
                    new_row["bvps"] = float(mc) / float(pb) / float(shares)

        enriched.append(new_row)

    # Sort newest → oldest.
    enriched.sort(
        key=lambda r: (
            int(r.get("year_report") or 0),
            int(r.get("length_report") or 0),
        ),
        reverse=True,
    )

    # Compute YoY growth where missing using the now-populated revenue/profit.
    by_period = {(r["year_report"], r["length_report"]): r for r in enriched}
    for r in enriched:
        prev_key = (r["year_report"] - 1, r["length_report"])
        prev = by_period.get(prev_key)
        if not prev:
            continue
        if not r.get("revenue_growth") and r.get("revenue") and prev.get("revenue"):
            with contextlib.suppress(TypeError, ZeroDivisionError):
                r["revenue_growth"] = (r["revenue"] - prev["revenue"]) / prev["revenue"]
        if (
            not r.get("net_profit_growth")
            and r.get("net_profit")
            and prev.get("net_profit")
        ):
            with contextlib.suppress(TypeError, ZeroDivisionError):
                r["net_profit_growth"] = (
                    r["net_profit"] - prev["net_profit"]
                ) / prev["net_profit"]

    return enriched


def filter_ratio_period(
    rows: list[dict[str, Any]],
    *,
    period: str,
) -> list[dict[str, Any]]:
    """Filter ratio rows by reporting period.

    period='Q' → keep only quarterly rows (length_report 1..4).
    period='Y' → keep only yearly rows. Prefer length_report=5 (year-end);
                 fall back to length_report=4 (Q4) when 5 is unavailable
                 for that year.
    """
    if period == "Y":
        years_with_year_end = {
            int(r.get("year_report") or 0)
            for r in rows
            if int(r.get("length_report") or 0) == 5
        }
        kept: list[dict[str, Any]] = []
        for r in rows:
            yr = int(r.get("year_report") or 0)
            length = int(r.get("length_report") or 0)
            if length == 5 or (length == 4 and yr not in years_with_year_end):
                kept.append(r)
        return kept
    return [
        r
        for r in rows
        if int(r.get("length_report") or 0) in (1, 2, 3, 4)
    ]

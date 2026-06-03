from __future__ import annotations

from typing import Any

from app.services.bctc import kpi_bank, kpi_bank_modules, kpi_nonbank, kpi_nonbank_modules
from app.services.bctc.bank_dupont import bank_dupont
from app.services.bctc.dupont import dupont
from app.services.bctc.forensic import BANK_BLIND_SPOTS, forensic_panel
from app.services.bctc.forensic_scores import beneish_m, piotroski_f
from app.services.bctc.kpi_bank import earning_assets
from app.services.bctc.mapping_loader import load_mapping
from app.services.bctc.sector import detect_subsector, detect_template
from app.services.bctc.statements import Period, build_periods, val
from app.services.bctc.subsector import subsector_spotlight
from app.services.bctc.thresholds import classify
from app.services.bctc.validation import balance_identity_flag, sanity_flags
from app.services.bctc.valuation import valuation_bank, valuation_nonbank

_SNAP_A = [
    ("revenue_growth", "Tăng trưởng Doanh thu", "%"),
    ("gross_margin", "Biên Lợi nhuận gộp", "%"),
    ("roe", "ROE", "%"),
    ("net_debt_ebitda", "Nợ ròng / EBITDA", "x"),
    ("fcf_margin", "Biên FCF", "%"),
    ("altman_z", "Điểm Z Altman", ""),
]
_SNAP_B = [
    ("nim", "NIM", "%"),
    ("roe", "ROE", "%"),
    ("ldr", "LDR", "%"),
    ("equity_ratio", "VCSH / Tổng TS", "%"),
    ("llr_loans", "Dự phòng / Cho vay", "%"),
    ("cir", "CIR", "%"),
]


def _snapshot_a(periods: list[Period]) -> dict[str, float | None]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return {
        "revenue_growth": kpi_nonbank.revenue_growth(cur, prev),
        "gross_margin": kpi_nonbank.gross_margin(cur),
        "roe": kpi_nonbank.roe(cur, prev),
        "net_debt_ebitda": kpi_nonbank.net_debt_ebitda(cur),
        "fcf_margin": kpi_nonbank.fcf_margin(cur),
        "altman_z": kpi_nonbank.altman_z(cur),
    }


def _snapshot_b(periods: list[Period]) -> dict[str, float | None]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return {
        "nim": kpi_bank.nim(cur, prev),
        "roe": kpi_bank.roe(cur, prev),
        "ldr": kpi_bank.ldr(cur),
        "equity_ratio": kpi_bank.equity_ratio(cur),
        "llr_loans": kpi_bank.llr_loans(cur),
        "cir": kpi_bank.cir(cur),
    }


def _snapshot_cells(
    values: dict[str, float | None], defs: list[tuple[str, str, str]]
) -> list[dict[str, Any]]:
    cells: list[dict[str, Any]] = []
    for key, label, unit in defs:
        v = values.get(key)
        cells.append(
            {"key": key, "label": label, "unit": unit, "value": v, "status": classify(key, v)}
        )
    return cells


def _modules_a(periods: list[Period]) -> list[dict[str, Any]]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return [
        {
            "id": "common_size",
            "title": "Common-Size KQKD",
            "type": "ratios",
            "data": kpi_nonbank_modules.common_size(cur),
        },
        {
            "id": "wcc",
            "title": "Chu kỳ Vốn lưu động",
            "type": "ratios",
            "data": kpi_nonbank_modules.working_capital_cycle(cur, prev),
        },
        {
            "id": "cf_bridge",
            "title": "Cầu nối Dòng tiền",
            "type": "bridge",
            "data": kpi_nonbank_modules.cash_flow_bridge(cur),
        },
        {"id": "dupont", "title": "DuPont 5 bước", "type": "ratios", "data": dupont(cur, prev)},
    ]


def _modules_b(periods: list[Period]) -> list[dict[str, Any]]:
    cur = periods[0]
    prev = periods[1] if len(periods) > 1 else None
    return [
        {
            "id": "toi_mix",
            "title": "Cơ cấu Thu nhập (TOI)",
            "type": "ratios",
            "data": kpi_bank_modules.toi_mix(cur),
        },
        {
            "id": "nim_decomp",
            "title": "Phân rã NIM",
            "type": "ratios",
            "data": kpi_bank_modules.nim_decomposition(cur, prev),
        },
        {
            "id": "ppop_cor",
            "title": "PPOP & Chi phí Dự phòng",
            "type": "ratios",
            "data": kpi_bank_modules.ppop_cor(cur, prev),
        },
        {
            "id": "bank_dupont",
            "title": "DuPont Ngân hàng",
            "type": "ratios",
            "data": bank_dupont(cur, prev),
        },
    ]


def build_bctc_payload(
    bs_rows: list[dict[str, Any]],
    is_rows: list[dict[str, Any]],
    cf_rows: list[dict[str, Any]],
    ratio_rows: list[dict] | None = None,
) -> dict[str, Any]:
    template = detect_template(is_rows)
    is_bank = template == "B"
    mapping = load_mapping("bank" if is_bank else "nonbank")
    periods = build_periods(bs_rows, is_rows, cf_rows, mapping)
    if not periods:
        return {
            "template": template,
            "sector": "bank" if is_bank else "nonbank",
            "periods": [],
            "snapshot": [],
            "modules": [],
            "forensic": {"green": [], "red": ["Không đủ dữ liệu BCTC"]},
            "flags": [],
            "trinity": {},
            "blind_spots": [],
            "subsector": None,
            "valuation": None,
        }

    snap_values = _snapshot_b(periods) if is_bank else _snapshot_a(periods)
    defs = _SNAP_B if is_bank else _SNAP_A
    snapshot = _snapshot_cells(snap_values, defs)
    modules = _modules_b(periods) if is_bank else _modules_a(periods)

    roe_fn = kpi_bank.roe if is_bank else kpi_nonbank.roe
    roe_series = [
        roe_fn(periods[i], periods[i + 1] if i + 1 < len(periods) else None)
        for i in range(min(3, len(periods)))
    ]
    fmetrics: dict[str, Any] = {
        "template": template,
        "roe_series": [r for r in roe_series if r is not None],
        "net_debt_ebitda": snap_values.get("net_debt_ebitda"),
        "altman_z": snap_values.get("altman_z"),
        "nim_series": (
            [
                v
                for v in (
                    kpi_bank.nim(periods[i], periods[i + 1] if i + 1 < len(periods) else None)
                    for i in range(min(3, len(periods)))
                )
                if v is not None
            ]
            if is_bank
            else None
        ),
        "cir": snap_values.get("cir"),
        "ldr": snap_values.get("ldr"),
        "equity_ratio": snap_values.get("equity_ratio"),
        "llr_loans": snap_values.get("llr_loans"),
    }
    forensic = forensic_panel(fmetrics)

    flags = sanity_flags(snap_values)
    bf = balance_identity_flag(periods[0])
    if bf:
        flags.append(bf)

    cur0 = periods[0]
    prev0 = periods[1] if len(periods) > 1 else None
    trinity = {
        "altman_z": (kpi_nonbank.altman_z(cur0) if not is_bank else None),
        "piotroski_f": piotroski_f(cur0, prev0),
        "beneish_m": beneish_m(cur0, prev0),
    }

    if is_bank:
        blind_spots: list[str] = BANK_BLIND_SPOTS
        subsector: dict[str, Any] | None = None
    else:
        blind_spots = []
        wcc = kpi_nonbank_modules.working_capital_cycle(cur0, prev0)
        sub = detect_subsector(cur0, ccc=wcc.get("ccc"))
        subsector = subsector_spotlight(cur0, sub)

    rr = ratio_rows or []
    if is_bank:
        cor = next((m["data"].get("cost_of_risk") for m in modules if m["id"] == "ppop_cor"), None)
        bd: dict[str, Any] = next((m["data"] for m in modules if m["id"] == "bank_dupont"), {})
        ta0 = val(cur0, "total_assets")
        ea0 = earning_assets(cur0)
        loans0 = val(cur0, "customer_loans")
        valuation: dict[str, Any] = valuation_bank(
            rr,
            nim=snap_values.get("nim"),
            cost_of_risk=cor,
            roa=bd.get("roa"),
            equity_multiplier=bd.get("equity_multiplier"),
            earning_assets_ratio=(ea0 / ta0) if ea0 is not None and ta0 else None,
            loans_ratio=(loans0 / ta0) if loans0 is not None and ta0 else None,
        )
    else:
        valuation = valuation_nonbank(rr)

    return {
        "template": template,
        "sector": "bank" if is_bank else "nonbank",
        "periods": [
            f"{'Q' + str(p.length) + '/' if p.length < 5 else ''}{p.year}" for p in periods
        ],
        "snapshot": snapshot,
        "modules": modules,
        "forensic": forensic,
        "flags": flags,
        "trinity": trinity,
        "blind_spots": blind_spots,
        "subsector": subsector,
        "valuation": valuation,
    }

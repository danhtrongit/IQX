from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services.bctc_dashboard.compute import compute_dashboard


def _row(year: int, length: int, **v: float) -> dict:
    return {"year_report": year, "length_report": length, **v}


# ── Non-bank (Template A) fixture: 5 growing years ───────────────────────────
def _nonbank_statements() -> dict[str, list[dict]]:
    bs, is_, cf = [], [], []
    for i, year in enumerate((2025, 2024, 2023, 2022, 2021)):
        s = 1.0 - i * 0.12  # newest largest
        is_.append(
            _row(
                year, 5,
                isa3=200.0 * s,      # net_revenue
                isa4=-117.0 * s,     # cogs (negative)
                isa5=83.0 * s,       # gross_profit
                isa8=-2.0 * s,       # interest_expense (negative)
                isa11=34.0 * s,      # operating_profit
                isa16=36.0 * s,      # profit_before_tax
                isa20=28.8 * s,      # npat
                isa22=28.0 * s,      # npat_parent
                isa23=5000.0,        # eps
            )
        )
        bs.append(
            _row(
                year, 5,
                bsa1=500.0 * s,      # current_assets
                bsa2=120.0 * s,      # cash
                bsa5=80.0 * s,       # st_investments
                bsa9=60.0 * s,       # trade_receivables
                bsa16=40.0 * s,      # inventory_gross
                bsa29=150.0 * s,     # net_fixed_assets
                bsa53=1000.0 * s,    # total_assets
                bsa54=600.0 * s,     # total_liabilities
                bsa55=300.0 * s,     # current_liabilities
                bsa56=100.0 * s,     # st_debt
                bsa71=50.0 * s,      # lt_debt
                bsa78=400.0 * s,     # equity
                bsa80=100.0,         # charter_capital (flat -> no dilution)
                bsa90=180.0 * s,     # retained_earnings
            )
        )
        cf.append(
            _row(
                year, 5,
                cfa2=8.0 * s,        # depreciation
                cfa18=34.0 * s,      # cfo
                cfa19=-12.0 * s,     # capex (negative)
            )
        )
    return {"balance_sheet": bs, "income_statement": is_, "cash_flow": cf}


def _nonbank_ratio() -> list[dict]:
    rows = []
    for i, year in enumerate((2025, 2024, 2023, 2022, 2021)):
        rows.append(
            _row(
                year, 5,
                pe=14.0 + i,
                pb=1.5,
                roe=0.25,
                eps=5000.0,
                bvps=20000.0,
                dividend=2000.0,
                market_cap=135000.0 * 1_000_000_000,
                number_of_shares_mkt_cap=1_000_000_000.0,
            )
        )
    return rows


# ── Bank (Template B) fixture ────────────────────────────────────────────────
def _bank_statements() -> dict[str, list[dict]]:
    bs, is_, cf = [], [], []
    for i, year in enumerate((2025, 2024, 2023, 2022, 2021)):
        s = 1.0 - i * 0.1
        is_.append(
            _row(
                year, 5,
                isb25=90.0 * s,      # interest_income_gross
                isb26=-40.0 * s,     # interest_expense
                isb27=70.0 * s,      # net_interest_income
                isb30=15.0 * s,      # net_fee_income
                isb31=5.0 * s,       # fx_income
                isb38=100.0 * s,     # total_operating_income (bank flag)
                isb39=-40.0 * s,     # operating_expense (negative)
                isb40=60.0 * s,      # ppop_reported
                isb41=-10.0 * s,     # provision_expense (negative)
                isa16=45.0 * s,      # profit_before_tax
                isa19=-9.0 * s,      # tax_expense
                isa20=36.0 * s,      # npat
                isa22=36.0 * s,      # npat_parent
                isa23=4000.0,        # eps
            )
        )
        bs.append(
            _row(
                year, 5,
                bsa2=50.0 * s,       # cash
                bsa53=2000.0 * s,    # total_assets
                bsa54=1800.0 * s,    # total_liabilities
                bsa78=200.0 * s,     # equity
                bsa80=100.0,         # charter_capital
                bsa90=90.0 * s,      # retained_earnings
                bsb97=100.0 * s,     # deposits_at_sbv
                bsb98=150.0 * s,     # deposits_at_other_ci
                bsb99=80.0 * s,      # trading_securities
                bsb104=1400.0 * s,   # customer_loans
                bsb105=-20.0 * s,    # loan_loss_reserve (negative)
                bsb106=200.0 * s,    # investment_securities
                bsb111=50.0 * s,     # govt_sbv_borrowings
                bsb112=100.0 * s,    # ci_deposits_borrowings
                bsb113=1500.0 * s,   # customer_deposits
                bsb116=50.0 * s,     # valuable_papers
            )
        )
        cf.append(_row(year, 5))
    return {"balance_sheet": bs, "income_statement": is_, "cash_flow": cf}


def _bank_ratio() -> list[dict]:
    rows = []
    for i, year in enumerate((2025, 2024, 2023, 2022, 2021)):
        rows.append(
            _row(
                year, 5,
                pe=8.0 + i,
                pb=1.2,
                roe=0.20,
                eps=4000.0,
                bvps=26000.0,
                dividend=1.0,  # bank pays stock dividend ratio
                market_cap=31200.0 * 1_000_000_000,
                number_of_shares_mkt_cap=1_000_000_000.0,
            )
        )
    return rows


def _patched(statements: dict, ratio: list[dict], icb: str):
    overview_raw = {"CompanyListingInfo": {"icbName2": icb}}
    return (
        patch(
            "app.services.bctc_dashboard.compute.vietcap.fetch_bctc_statements",
            new_callable=AsyncMock,
            return_value=(statements, "https://vci/bctc"),
        ),
        patch(
            "app.services.bctc_dashboard.compute.vietcap.fetch_financial_report",
            new_callable=AsyncMock,
            return_value=(ratio, "https://vci/ratio"),
        ),
        patch(
            "app.services.bctc_dashboard.compute.vietcap.fetch_company_data",
            new_callable=AsyncMock,
            return_value=(overview_raw, "https://vci/company"),
        ),
    )


@pytest.mark.asyncio
async def test_compute_nonbank_shape() -> None:
    p1, p2, p3 = _patched(_nonbank_statements(), _nonbank_ratio(), "Công nghệ thông tin")
    with p1, p2, p3:
        data = await compute_dashboard("FPT", term_type=1)

    assert data["template"] == "A"
    assert data["sub_sector"]  # detected non-bank subsector label present
    assert data["hero"]["ticker"] == "FPT"
    assert data["hero"]["sector"] == "Công nghệ thông tin"
    assert data["hero"]["price"] == pytest.approx(135000.0, rel=1e-6)
    assert data["hero"]["fair_value"] is not None

    fin = data["blocks"]["financial"]
    assert len(fin["stacked_abs"]) >= 3
    assert {"year", "equity", "other_liab", "debt"} <= set(fin["stacked_abs"][0])
    assert fin["growth_sources"] and fin["totals"] and fin["asset_mix"]

    biz = data["blocks"]["business"]
    assert {"revenue", "gross_margin", "net_margin"} <= set(biz["revenue_series"][0])
    assert biz["earnings_quality"]["core_pct"] is not None

    cf = data["blocks"]["cashflow"]
    assert cf["profit_vs_cash"] and cf["waterfall"]

    val_block = data["blocks"]["valuation"]
    assert val_block["methods"]  # football field
    assert val_block["current_price"] is not None

    health = data["blocks"]["health"]
    assert set(health) == {"sub_a", "sub_b", "sub_c"}
    assert health["sub_c"]["checklist"]

    # peer/color/radar-score not filled at B1
    assert data["radar"]["dims"][0]["score"] is None
    assert data["radar"]["dims"][0]["band"] is None
    assert biz["metrics"][0]["peer_median"] is None
    assert biz["metrics"][0]["color"] is None

    # meta
    assert data["meta"]["periods"]
    assert data["meta"]["peer_count"] == 0
    assert "blocks.business.earnings_quality" in data["meta"]["is_estimated_fields"]


@pytest.mark.asyncio
async def test_compute_bank_shape() -> None:
    p1, p2, p3 = _patched(_bank_statements(), _bank_ratio(), "Ngân hàng")
    with p1, p2, p3:
        data = await compute_dashboard("VCB", term_type=1)

    assert data["template"] == "B"
    assert data["hero"]["ticker"] == "VCB"

    # bank business block uses nim_series + income_mix
    biz = data["blocks"]["business"]
    assert biz["nim_series"] and biz["income_mix"]
    assert biz["nim_series"][-1]["nim"] is not None

    # bank cashflow uses cir_series + ppop
    cf = data["blocks"]["cashflow"]
    assert cf["cir_series"] and cf["ppop"] is not None

    # bank health has only sub_a, sub_b
    health = data["blocks"]["health"]
    assert set(health) == {"sub_a", "sub_b"}

    # bank valuation uses pb / justified_pb / pe metrics
    metric_keys = {m["key"] for m in data["blocks"]["valuation"]["metrics"]}
    assert {"pb", "justified_pb", "pe"} <= metric_keys

    # radar dims for bank template
    labels = [d["label"] for d in data["radar"]["dims"]]
    assert "Chất lượng tài sản" in labels

    # bank asset-quality proxy flagged as estimated (no notes)
    assert any("health.sub_a" in f for f in data["meta"]["is_estimated_fields"])

"""Memory continuity (spec section 6).

- extract_claims(): parse scenario conditions from a generated article → DB rows
- verify_claim(): check a past claim against today's data
- build_memory_context(): load recent articles + verify pending claims for the prompt
- persist_analysis(): save the article + its claims (upsert by session_date)
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_analysis import AnalysisClaim, AnalysisHistory

logger = logging.getLogger(__name__)

CLAIM_EXPIRY_DAYS = 5
LOAD_LAST_N = 5


# ── claim parsing / extraction ──────────────────────────


def _parse_number(s: str) -> float:
    """'1.825' / '1.825,4' (VN format) → 1825.4."""
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_scenario_condition(text: str) -> dict[str, Any]:
    """Parse a VN scenario condition string → machine-readable JSON (spec §6.5)."""
    text = re.sub(r"<[^>]+>", "", text)
    result: dict[str, Any] = {}
    low = text.lower()

    m = re.search(r"(?:giữ trên|vượt|trên)\s*([\d.,]+)", low)
    if m:
        result["vnindex_above"] = _parse_number(m.group(1))
    m = re.search(r"(?:mất|dưới|về)\s*([\d.,]+)", low)
    if m:
        result["vnindex_below"] = _parse_number(m.group(1))
    m = re.search(r"(?:kn|khối ngoại|ngoại)\s*bán\s*(?:dưới|<)\s*([\d.,]+)\s*tỷ", low)
    if m:
        result["foreign_sell_lt_vnd_billion"] = _parse_number(m.group(1))
    m = re.search(r"(?:kn|khối ngoại|ngoại)\s*bán\s*(?:trên|>)\s*([\d.,]+)\s*tỷ", low)
    if m:
        result["foreign_sell_gt_vnd_billion"] = _parse_number(m.group(1))
    return result


def extract_claims(output: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract verifiable claims from the generated scenarios."""
    claims = []
    for i, scenario in enumerate(output.get("scenarios", [])):
        cond = scenario.get("condition_html") or scenario.get("condition", "")
        parsed = parse_scenario_condition(cond)
        if not parsed:
            continue  # nothing verifiable in this scenario
        outcome = scenario.get("outcome_html") or scenario.get("outcome", "")
        claims.append({
            "claim_text": f"{cond} → {outcome}",
            "claim_type": "scenario_up" if i == 0 else "scenario_down",
            "conditions": parsed,
            "predicted_outcome": outcome,
        })
    return claims


# ── claim verification ──────────────────────────────────


def verify_claim(conditions: dict[str, Any], today_payload: dict[str, Any]) -> dict[str, str]:
    """Verify a past claim against today's data → confirmed/refuted/partial/still_pending."""
    vnindex = today_payload.get("vnindex") or {}
    foreign = today_payload.get("foreign_flow") or {}
    today_index = vnindex.get("close")
    net_b = foreign.get("net_value_vnd_billion")
    today_foreign_sell = abs(net_b) if (net_b is not None and net_b < 0) else 0.0

    if today_index is None:
        return {"status": "still_pending", "note": "Thiếu dữ liệu index hôm nay"}

    results: list[bool] = []
    if "vnindex_above" in conditions:
        results.append(today_index > conditions["vnindex_above"])
    if "vnindex_below" in conditions:
        results.append(today_index < conditions["vnindex_below"])
    if "foreign_sell_lt_vnd_billion" in conditions:
        results.append(today_foreign_sell < conditions["foreign_sell_lt_vnd_billion"])
    if "foreign_sell_gt_vnd_billion" in conditions:
        results.append(today_foreign_sell > conditions["foreign_sell_gt_vnd_billion"])

    if not results:
        return {"status": "still_pending", "note": "Không có điều kiện verify được"}

    note = f"Index {today_index:.2f}, KN net {net_b:.1f} tỷ" if net_b is not None else f"Index {today_index:.2f}"
    if all(results):
        return {"status": "confirmed", "note": f"Tất cả điều kiện đúng: {note}"}
    if not any(results):
        return {"status": "refuted", "note": f"Điều kiện không thỏa: {note}"}
    return {"status": "partial", "note": f"Một phần điều kiện đúng: {note}"}


# ── memory context loading ──────────────────────────────


async def build_memory_context(db: AsyncSession, today: date) -> dict[str, Any]:
    """Load last article + recent overview + verified pending claims for the prompt.

    Also persists status updates on verified claims (spec §6.3/§6.6).
    Verification uses each pending claim's OWN session payload is not stored, so we
    verify against TODAY's payload — passed in separately by the generator.
    """
    # Filter to report_type=="daily" so mid-day rows (same date) never surface as
    # the daily's last_analysis or recent overview — once midday records exist,
    # they must NOT pollute EOD memory continuity.
    last = (await db.execute(
        select(AnalysisHistory)
        .where(
            AnalysisHistory.session_date < today,
            AnalysisHistory.is_published.is_(True),
            AnalysisHistory.report_type == "daily",
        )
        .order_by(AnalysisHistory.session_date.desc())
        .limit(1)
    )).scalar_one_or_none()

    recent = (await db.execute(
        select(AnalysisHistory)
        .where(
            AnalysisHistory.session_date < today,
            AnalysisHistory.is_published.is_(True),
            AnalysisHistory.report_type == "daily",
        )
        .order_by(AnalysisHistory.session_date.desc())
        .limit(LOAD_LAST_N)
    )).scalars().all()

    last_block = None
    if last:
        last_block = {
            "date": last.session_date.isoformat(),
            "days_ago": (today - last.session_date).days,
            "headline": last.headline,
            "tagline": (last.tagline or {}).get("text", ""),
            "key_paragraphs": {
                "structure": (last.paragraphs or {}).get("structure", ""),
                "smart_money": (last.paragraphs or {}).get("smart_money", ""),
            },
        }

    overview = [{
        "date": r.session_date.isoformat(),
        "type": r.session_type,
        "headline": r.headline,
        "tagline": (r.tagline or {}).get("text", ""),
    } for r in recent]

    return {
        "last_analysis": last_block,
        "recent_5_sessions_overview": overview,
        "verifiable_claims_from_recent_analyses": [],  # filled by verify_pending_claims
    }


async def verify_pending_claims(
    db: AsyncSession, today: date, today_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    """Verify all pending, non-expired claims from prior sessions against today's data."""
    pending = (await db.execute(
        select(AnalysisClaim)
        .where(
            AnalysisClaim.status == "pending",
            AnalysisClaim.expires_at >= today,
            AnalysisClaim.session_date < today,
        )
        .order_by(AnalysisClaim.session_date.desc())
    )).scalars().all()

    verified = []
    for claim in pending:
        v = verify_claim(claim.conditions or {}, today_payload)
        verified.append({
            "from_date": claim.session_date.isoformat(),
            "text": claim.claim_text,
            "type": claim.claim_type,
            "predicted": claim.predicted_outcome,
            "today_status": v["status"],
            "today_note": v["note"],
        })
        if v["status"] != "still_pending":
            claim.status = v["status"]
            claim.verified_at = datetime.now(UTC)
            claim.verification_note = v["note"]
    return verified


# ── persistence ─────────────────────────────────────────


async def persist_analysis(
    db: AsyncSession,
    output: dict[str, Any],
    session_date: date,
    session_type: str,
    *,
    report_type: str = "daily",
    persist_claims: bool = True,
) -> AnalysisHistory:
    """Upsert the article by (session_date, report_type) and (re)create its extracted claims.

    ``report_type`` disambiguates daily vs midday vs premarket rows for the same date.
    When ``persist_claims=False`` the claim extraction/insertion is skipped entirely
    (e.g. midday reports have no scenario claims to track).
    """
    existing = (await db.execute(
        select(AnalysisHistory).where(
            AnalysisHistory.session_date == session_date,
            AnalysisHistory.report_type == report_type,
        )
    )).scalar_one_or_none()

    # unexplained is a Text column; midday reports emit it as a dict — serialize
    # to a JSON string so both daily (str|None) and midday (dict) are accepted.
    _unexplained = output.get("unexplained")
    if isinstance(_unexplained, dict):
        import json as _json
        _unexplained = _json.dumps(_unexplained, ensure_ascii=False)

    fields = dict(
        public_id=output.get("id") or f"vnindex-{session_date.isoformat()}",
        session_date=session_date,
        generated_at=datetime.now(UTC),
        session_type=session_type,
        report_type=report_type,
        headline=output.get("headline", ""),
        tagline=output.get("tagline") or {},
        paragraphs=output.get("paragraphs") or {},
        scenarios=output.get("scenarios") or [],
        watchlist=output.get("watchlist"),
        unexplained=_unexplained,
        meta={**(output.get("meta") or {}),
              "session_type_display": output.get("session_type_display"),
              "charts": output.get("charts"),
              "pulse": output.get("pulse")},
        is_published=True,
    )

    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        if persist_claims:
            await db.execute(delete(AnalysisClaim).where(AnalysisClaim.analysis_id == existing.id))
        analysis = existing
    else:
        analysis = AnalysisHistory(id=uuid.uuid4(), **fields)
        db.add(analysis)

    await db.flush()  # ensure analysis.id is available

    if persist_claims:
        expires = session_date + timedelta(days=CLAIM_EXPIRY_DAYS)
        for c in extract_claims(output):
            db.add(AnalysisClaim(
                id=uuid.uuid4(),
                analysis_id=analysis.id,
                session_date=session_date,
                expires_at=expires,
                status="pending",
                **c,
            ))

    await db.commit()
    return analysis

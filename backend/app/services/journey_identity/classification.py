"""Pure, versioned mascot classification. No prices, trades or AI calls."""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from datetime import UTC, datetime

from app.models.cap4 import LOP_KEYS

RULES_VERSION = 1
MASCOTS = {
    "ky_thuat": ("bach_ho", "Bạch Hổ"),
    "dong_tien": ("thanh_long", "Thanh Long"),
    "noi_bo": ("loc_huou", "Lộc Hươu"),
    "tin_tuc": ("phung_hoang", "Phụng Hoàng"),
    "dinh_gia": ("kim_quy", "Kim Quy"),
}


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def complete_map(value: object) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == set(LOP_KEYS)
        and all(v in ("ok", "neu", "bad") for v in value.values())
    )


def choose_mascot(counts: dict, n: int) -> dict:
    if type(n) is not int or n < 0 or set(counts) != set(LOP_KEYS):
        raise ValueError("Invalid mascot evidence counts")
    if any(type(v) is not int or v < 0 or v > n for v in counts.values()):
        raise ValueError("Invalid mascot evidence counts")
    if n == 0:
        return {
            "assignment_status": "pending_data_repair",
            "mascot_id": None,
            "dominant_layer": None,
            "assignment_basis": None,
            "tied_layers": [],
        }
    maximum = max(counts.values())
    tied = [key for key in LOP_KEYS if counts[key] == maximum]
    layer = tied[0]
    basis = "zero_match_tie_break" if maximum == 0 else "stable_tie_break" if len(tied) > 1 else "ai_match_count"
    return {
        "assignment_status": "assigned",
        "mascot_id": MASCOTS[layer][0],
        "dominant_layer": layer,
        "assignment_basis": basis,
        "tied_layers": tied,
    }


def assessment_digest(row: dict) -> str:
    """Fingerprint the committed answer, excluding the later reveal milestone."""
    return digest(
        {
            **{
                key: row[key]
                for key in (
                    "id",
                    "user_id",
                    "symbol",
                    "trading_date",
                    "dataset_id",
                    "answers",
                    "source",
                    "mode",
                    "record_status",
                    "proof_version",
                )
            },
            "completed_at": utc(row["completed_at"]).isoformat(),
        }
    )


def classify(records: list[dict], user_id: str, start: datetime | None, end: datetime) -> dict:
    counts = dict.fromkeys(LOP_KEYS, 0)
    excluded: Counter = Counter()
    refs = []
    candidates = defaultdict(list)
    for row in records:
        reason = None
        if (
            row["user_id"] != user_id
            or row["source"] != "learning"
            or row["mode"] != "thuc_chien"
            or row["record_status"] != "valid"
        ):
            reason = "not_learning_evidence"
        elif start is None or not utc(start) <= utc(row["completed_at"]) <= utc(end):
            reason = "outside_frozen_window"
        elif not complete_map(row["answers"]):
            reason = "incomplete_user_answers"
        elif row.get("proof_version") != "commit_then_reveal_v1":
            reason = "missing_commit_proof"
        elif row.get("revealed_at") is not None and utc(row["revealed_at"]) < utc(row["completed_at"]):
            reason = "reveal_precedes_submission"
        if reason:
            excluded[reason] += 1
            continue
        candidates[(row["symbol"], row["trading_date"])].append(row)
    selected = []
    for rows in candidates.values():
        earliest = min(utc(row["completed_at"]) for row in rows)
        first = [row for row in rows if utc(row["completed_at"]) == earliest]
        if len(first) > 1:
            # A UUID is not evidence of commit order. The live table prevents
            # duplicate user/symbol/session rows; historical imports with an
            # ambiguous first commit require actual source repair instead.
            excluded["ambiguous_first_submission_order"] += len(first)
            excluded["duplicate_later_submission"] += len(rows) - len(first)
            continue
        selected.append(first[0])
        excluded["duplicate_later_submission"] += len(rows) - 1
    # These are independent user/symbol/session pairs, so their presentation
    # order has no bearing on which evidence wins or on the match counts.
    for row in sorted(selected, key=lambda r: (utc(r["completed_at"]), r["symbol"], r["trading_date"])):
        # Select BEFORE validating AI: later answers cannot repair the first pair.
        if not row.get("snapshot_matches") or not complete_map(row.get("ai_answers")):
            excluded["missing_or_invalid_ai_snapshot"] += 1
            continue
        contribution = {key: int(row["answers"][key] == row["ai_answers"][key]) for key in LOP_KEYS}
        for key, value in contribution.items():
            counts[key] += value
        refs.append(
            {
                "assessment_id": row["id"],
                "dataset_id": row["dataset_id"],
                "dataset_hash": row["dataset_hash"],
                "assessment_hash": assessment_digest(row),
                "contribution": contribution,
            }
        )
    n = len(refs)
    return {
        **choose_mascot(counts, n),
        "valid_pair_count": n,
        "match_counts": counts,
        "selected_assessment_refs": refs,
        "dataset_hash": digest(refs),
        "excluded_records_summary": {key: value for key, value in excluded.items() if value},
    }

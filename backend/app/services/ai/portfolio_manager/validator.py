"""QA validation of the Narrative JSON (spec §10). Returns a list of error codes; empty = valid."""

from __future__ import annotations

import re

_REQUIRED = ("title", "verdict", "lede", "layers", "actions", "watch", "closing")
_LAYER_KEYS = ("overview", "performance", "allocation", "stress", "risk", "attribution", "quality", "behavior")
_FORBIDDEN_RECO = ("khuyến nghị mua", "khuyến nghị bán")
_FORBIDDEN_CERTAINTY = ("chắc chắn tăng", "chắc chắn giảm")
_DOT_DECIMAL = re.compile(r"\d+\.\d{1,2}(?!\d)")  # Flags decimal dots (1-2 fractional digits), not thousands separators (always 3 digits)
_DIGIT = re.compile(r"\d")


def _all_strings(obj) -> list[str]:
    out: list[str] = []
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            out.extend(_all_strings(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(_all_strings(v))
    return out


def validate_narrative(narrative: dict, analysis: dict) -> list[str]:
    e: list[str] = []
    mode = (analysis.get("meta") or {}).get("mode", "full_changed")

    for key in _REQUIRED:
        if not narrative.get(key):
            e.append(f"STRUCT: thiếu trường '{key}'")
    if mode != "first" and not narrative.get("progress_text"):
        e.append("STRUCT: thiếu 'progress_text' (mode != first)")
    if mode == "first" and narrative.get("progress_text"):
        e.append("PROGRESS_FIRST: 'progress_text' phải rỗng khi mode=first")

    # All 8 layer prose blocks must be present + non-empty — the frontend reads each by key.
    layers = narrative.get("layers") or {}
    for k in _LAYER_KEYS:
        v = layers.get(k)
        if not (isinstance(v, str) and v.strip()):
            e.append(f"LAYERS: thiếu hoặc rỗng layers.{k}")

    # NOTE: the §10 "ghi nhận tốt → nói thẳng" mirror pair and the positive-direction closing are
    # enforced primarily by the SYSTEM PROMPT (Task 15) — they are tone/structure rules a regex
    # can't reliably detect. The validator enforces closing PRESENCE (via _REQUIRED) + the
    # FORBIDDEN_CERTAINTY rule (no doom-certainty). Deep mirror-pair detection is deferred to the prompt.

    actions = narrative.get("actions") or []
    if len(actions) > 3:
        e.append(f"ACTIONS_COUNT: {len(actions)} hành động (tối đa 3)")
    for i, a in enumerate(actions):
        if not _DIGIT.search(a.get("detail", "")):
            e.append(f"ACTIONS_NUMBER: action[{i}].detail thiếu con số")

    text = " ".join(_all_strings(narrative)).lower()
    for term in _FORBIDDEN_RECO:
        if term in text:
            e.append(f"FORBIDDEN_RECO: chứa '{term}'")
    for term in _FORBIDDEN_CERTAINTY:
        if term in text:
            e.append(f"FORBIDDEN_CERTAINTY: chứa '{term}'")

    for s in _all_strings(narrative):
        if _DOT_DECIMAL.search(s):
            e.append("DECIMAL_COMMA: dùng dấu chấm thập phân — phải dùng dấu phẩy")
            break

    if analysis.get("selected_insights"):
        if not (narrative.get("insight") or {}).get("text"):
            e.append("INSIGHT: thiếu nội dung insight dù có selected_insights")

    excluded = (analysis.get("risk") or {}).get("excluded") or []
    has_note = bool((narrative.get("low_data_note") or "").strip())
    if excluded and not has_note:
        e.append("LOW_DATA: có mã excluded nhưng thiếu low_data_note")
    if not excluded and has_note:
        e.append("LOW_DATA: không có mã excluded nhưng vẫn có low_data_note")

    return e

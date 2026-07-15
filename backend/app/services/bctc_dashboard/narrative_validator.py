"""Validator for the BCTC dashboard AI narrative output.

``validate_narrative(out, template) -> list[str]`` returns a list of error
strings (empty ⇒ valid). All errors are blocking for this on-demand premium
flow — the generator retries with the error list fed back to the model.

Rules
-----
1. JSON structure: exact top-level / story / blocks key sets for the template
   (Template A vs B differ — see ``_BLOCKS_A`` / ``_BLOCKS_B``). No extra keys
   beyond the schema (best-effort anti-fabrication).
2. ``story.paragraphs`` length == 3.
3. Every block carries a non-empty ``answer``; ``health`` (A) /
   ``asset_quality`` (B) carries a ``sub`` with exactly the right sub-keys.
4. FORBIDDEN academic model names in ANY user-facing text (case-insensitive).
5. FORBIDDEN buy/sell/hold recommendation phrasing.
"""

from __future__ import annotations

from typing import Any

# ── schema key sets ───────────────────────────────────────────────────────────

_TOP_KEYS = {"verdict_oneliner", "story", "blocks"}
_STORY_KEYS = {"lead", "paragraphs", "strengths", "watchlist"}

# block name → required sub-keys (None ⇒ simple block, only "answer")
_BLOCKS_A: dict[str, set[str] | None] = {
    "valuation": None,
    "financial": None,
    "business": None,
    "cashflow": None,
    "health": {"a", "b", "c"},
    "dividend": None,
}
_BLOCKS_B: dict[str, set[str] | None] = {
    "valuation": None,
    "financial": None,
    "earning": None,
    "efficiency": None,
    "asset_quality": {"a", "b"},
    "dividend": None,
}

# ── forbidden tokens ──────────────────────────────────────────────────────────

# Academic model names must never leak into user-facing text (spec §2).
FORBIDDEN_MODELS = (
    "altman",
    "z-score",
    "piotroski",
    "f-score",
    "beneish",
    "m-score",
    "dupont",
    "sloan",
    "accrual",
)

# Buy/sell/hold recommendation phrasing is banned (spec §3).
FORBIDDEN_RECS = (
    "nên mua",
    "nên bán",
    "nên giữ",
    "khuyến nghị",
)


# ── text collection ───────────────────────────────────────────────────────────


def _collect_strings(node: Any, out: list[str]) -> None:
    """Recursively gather every string value in the output tree."""
    if isinstance(node, str):
        out.append(node)
    elif isinstance(node, dict):
        for v in node.values():
            _collect_strings(v, out)
    elif isinstance(node, (list, tuple)):
        for v in node:
            _collect_strings(v, out)


def _has_answer(block: Any) -> bool:
    return isinstance(block, dict) and isinstance(block.get("answer"), str) and bool(
        block["answer"].strip()
    )


# ── main validator ────────────────────────────────────────────────────────────


def validate_narrative(out: Any, template: str) -> list[str]:
    """Validate a narrative output dict against the template schema + guards."""
    e: list[str] = []

    if not isinstance(out, dict):
        return ["Output không phải object JSON hợp lệ"]

    block_spec = _BLOCKS_B if template == "B" else _BLOCKS_A

    # ── top-level keys (exact set — no extras, no "verdict" tag) ──────────────
    extra_top = set(out.keys()) - _TOP_KEYS
    if extra_top:
        e.append(f"Có key thừa ở cấp cao nhất: {sorted(extra_top)}")
    for k in _TOP_KEYS:
        if k not in out:
            e.append(f"Thiếu key bắt buộc: '{k}'")

    if not isinstance(out.get("verdict_oneliner"), str) or not out.get(
        "verdict_oneliner", ""
    ).strip():
        e.append("verdict_oneliner: thiếu hoặc rỗng")

    # ── story ─────────────────────────────────────────────────────────────────
    story = out.get("story")
    if not isinstance(story, dict):
        e.append("story: thiếu hoặc không phải object")
    else:
        extra_story = set(story.keys()) - _STORY_KEYS
        if extra_story:
            e.append(f"story có key thừa: {sorted(extra_story)}")
        for k in _STORY_KEYS:
            if k not in story:
                e.append(f"story thiếu key: '{k}'")
        if not isinstance(story.get("lead"), str) or not story.get("lead", "").strip():
            e.append("story.lead: thiếu hoặc rỗng")
        paragraphs = story.get("paragraphs")
        if not isinstance(paragraphs, list) or len(paragraphs) != 3:
            n = len(paragraphs) if isinstance(paragraphs, list) else "không phải list"
            e.append(f"story.paragraphs phải có đúng 3 đoạn (hiện tại: {n})")
        for name in ("strengths", "watchlist"):
            if not isinstance(story.get(name), list) or not story.get(name):
                e.append(f"story.{name} phải là list không rỗng")

    # ── blocks ──────────────────────────────────────────────────────────────
    blocks = out.get("blocks")
    if not isinstance(blocks, dict):
        e.append("blocks: thiếu hoặc không phải object")
    else:
        extra_blocks = set(blocks.keys()) - set(block_spec.keys())
        if extra_blocks:
            e.append(
                f"blocks có key không đúng template {template}: {sorted(extra_blocks)}"
            )
        for name, sub_keys in block_spec.items():
            block = blocks.get(name)
            if block is None:
                e.append(f"blocks thiếu khối '{name}' (template {template})")
                continue
            if not _has_answer(block):
                e.append(f"blocks.{name}.answer: thiếu hoặc rỗng")
            if sub_keys is None:
                # simple block: only "answer" allowed
                extra = set(block.keys()) - {"answer"} if isinstance(block, dict) else set()
                if extra:
                    e.append(f"blocks.{name} có key thừa: {sorted(extra)}")
            else:
                # block with sub-answers (health / asset_quality)
                extra = set(block.keys()) - {"answer", "sub"} if isinstance(block, dict) else set()
                if extra:
                    e.append(f"blocks.{name} có key thừa: {sorted(extra)}")
                sub = block.get("sub") if isinstance(block, dict) else None
                if not isinstance(sub, dict):
                    e.append(f"blocks.{name}.sub: thiếu hoặc không phải object")
                else:
                    got = set(sub.keys())
                    if got != sub_keys:
                        missing = sub_keys - got
                        extra_sub = got - sub_keys
                        if missing:
                            e.append(
                                f"blocks.{name}.sub thiếu key: {sorted(missing)}"
                            )
                        if extra_sub:
                            e.append(
                                f"blocks.{name}.sub có key thừa: {sorted(extra_sub)}"
                            )
                    for sk in sub_keys & got:
                        if not isinstance(sub.get(sk), str) or not sub[sk].strip():
                            e.append(f"blocks.{name}.sub.{sk}: thiếu hoặc rỗng")

    # ── forbidden-token scan over all user-facing text ────────────────────────
    texts: list[str] = []
    _collect_strings(out, texts)
    low = " ".join(texts).lower()

    for token in FORBIDDEN_MODELS:
        if token in low:
            e.append(f"Cấm tên mô hình học thuật ở nội dung người dùng: '{token}'")
    for token in FORBIDDEN_RECS:
        if token in low:
            e.append(f"Cấm khuyến nghị mua/bán/giữ: '{token}'")

    return e

from __future__ import annotations

import re
from typing import Any

_BANNED = [
    r"khuy[ếe]n ngh[ịi]", r"\bmua\b", r"\bb[áa]n\b", r"\bgi[ữu] (?:m[ãa]|c[ổo])",
    r"\bbuy\b", r"\bsell\b", r"\bhold\b", r"target price", r"gi[áa] m[ụu]c ti[êe]u",
]
_BANNED_RE = re.compile("|".join(_BANNED), re.IGNORECASE)
_NUM_RE = re.compile(r"-?\d[\d,]*\.?\d*")


def extract_allowed_numbers(kpi_payload: dict[str, Any] | None) -> set[float]:
    """Gom mọi số đã pre-compute trong payload (snapshot/modules/trinity) để đối chiếu."""
    out: set[float] = set()
    if not kpi_payload:
        return out

    def add(v: Any) -> None:
        if isinstance(v, bool):
            return
        if isinstance(v, (int, float)):
            out.add(round(float(v), 4))
            out.add(round(float(v) * 100, 2))

    def walk(o: Any) -> None:
        if isinstance(o, dict):
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
        else:
            add(o)

    walk(kpi_payload)
    return out


def _close(n: float, allowed: set[float], tol: float = 0.05) -> bool:
    return any(abs(n - a) <= tol or (a != 0 and abs(n - a) / abs(a) <= 0.02) for a in allowed)


def _token_values(tok: str) -> list[float]:
    """Diễn giải 1 token số theo cả hai locale (EN: ',' nghìn / VI: ',' thập phân)."""
    cands: list[float] = []
    for raw in (tok.replace(",", ""), tok.replace(".", "").replace(",", ".")):
        try:
            cands.append(float(raw))
        except ValueError:
            continue
    return cands


# AI diễn đạt số theo nhiều thang: tỷ lệ thô, %, tỷ VND... -> chấp nhận mọi thang.
_SCALES = (1.0, 0.01, 100.0, 1e9, 1e-9, 1e6)


def _number_ok(tok: str, allowed: set[float]) -> bool:
    for c in _token_values(tok):
        # Số nguyên 1990–2100: coi là năm (không phải số tài chính bịa).
        if c.is_integer() and 1990 <= c <= 2100:
            return True
        if any(_close(c * s, allowed) for s in _SCALES):
            return True
    return False


def sanitize_ai_output(text: str, allowed_numbers: set[float]) -> dict[str, Any]:
    """Post-flight guard: chặn khuyến nghị giao dịch + số bịa. Trả {ok, violations}.

    Khớp số theo cả hai locale (dấu ',' nghìn EN / thập phân VI) và mọi thang
    (tỷ lệ thô, %, tỷ VND), whitelist năm — để không loại nhầm số hợp lệ AI diễn đạt lại.
    """
    violations: list[str] = []
    if not text or not text.strip():
        return {"ok": False, "violations": ["empty"]}
    m = _BANNED_RE.search(text)
    if m:
        violations.append(f"banned_phrase: {m.group(0)!r}")
    for tok in _NUM_RE.findall(text):
        if not _number_ok(tok, allowed_numbers):
            violations.append(f"fabricated_number: {tok}")
    return {"ok": not violations, "violations": violations}

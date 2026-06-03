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


def _close(n: float, allowed: set[float], tol: float = 0.15) -> bool:
    return any(abs(n - a) <= tol or (a != 0 and abs(n - a) / abs(a) <= 0.02) for a in allowed)


def sanitize_ai_output(text: str, allowed_numbers: set[float]) -> dict[str, Any]:
    """Post-flight guard: chặn khuyến nghị giao dịch + số bịa. Trả {ok, violations}."""
    violations: list[str] = []
    if not text or not text.strip():
        return {"ok": False, "violations": ["empty"]}
    m = _BANNED_RE.search(text)
    if m:
        violations.append(f"banned_phrase: {m.group(0)!r}")
    for tok in _NUM_RE.findall(text):
        raw = tok.replace(",", "")
        try:
            n = float(raw)
        except ValueError:
            continue
        if not _close(n, allowed_numbers) and not _close(n / 100, allowed_numbers):
            violations.append(f"fabricated_number: {tok}")
    return {"ok": not violations, "violations": violations}

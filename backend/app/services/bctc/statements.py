from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Period:
    year: int
    length: int  # 1..4 = quý, 5 = năm
    values: dict[str, float]  # concept -> giá trị VND thô


def _key(row: dict) -> tuple[int, int]:
    return int(row.get("year_report") or 0), int(row.get("length_report") or 0)


def _concepts(row: dict, mapping: dict[str, str | None]) -> dict[str, float]:
    out: dict[str, float] = {}
    for concept, field in mapping.items():
        if not field:
            continue
        raw = row.get(field)
        if raw is None:
            continue
        try:
            out[concept] = float(raw)
        except (TypeError, ValueError):
            continue
    return out


def build_periods(
    bs_rows: list[dict],
    is_rows: list[dict],
    cf_rows: list[dict],
    mapping: dict[str, str | None],
) -> list[Period]:
    """Ghép 3 báo cáo theo (year, length) thành Period với concept đã ánh xạ. Mới nhất trước."""
    merged: dict[tuple[int, int], dict[str, float]] = {}
    for rows in (bs_rows, is_rows, cf_rows):
        for row in rows or []:
            k = _key(row)
            if k == (0, 0):
                continue
            merged.setdefault(k, {}).update(_concepts(row, mapping))
    periods = [Period(year=y, length=l, values=v) for (y, l), v in merged.items()]
    periods.sort(key=lambda p: (p.year, p.length), reverse=True)
    return periods


def val(period: Period | None, concept: str) -> float | None:
    if period is None:
        return None
    return period.values.get(concept)

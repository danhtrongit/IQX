from __future__ import annotations

# Mỗi metric: danh sách mốc (giới hạn trên, nhãn) theo thứ tự giá trị tăng dần.
# Giá trị <= mốc đầu tiên thỏa -> nhận nhãn đó.
_THRESHOLDS: dict[str, list[tuple[float, str]]] = {
    "revenue_growth": [(0.05, "red"), (0.15, "amber"), (float("inf"), "green")],
    "gross_margin": [(0.15, "red"), (0.25, "amber"), (float("inf"), "green")],
    "roe": [(0.12, "red"), (0.18, "amber"), (float("inf"), "green")],
    "fcf_margin": [(0.0, "red"), (0.08, "amber"), (float("inf"), "green")],
    "net_debt_ebitda": [(1.5, "green"), (3.0, "amber"), (float("inf"), "red")],
    "cir": [(0.35, "green"), (0.45, "amber"), (float("inf"), "red")],
    "ldr": [(0.80, "green"), (0.85, "amber"), (float("inf"), "red")],
    "cost_of_risk": [(0.01, "green"), (0.015, "amber"), (float("inf"), "red")],
    "nim": [(0.025, "red"), (0.035, "amber"), (float("inf"), "green")],
    "equity_ratio": [(0.06, "red"), (0.08, "amber"), (float("inf"), "green")],
}


def classify(metric: str, value: float | None) -> str:
    if value is None:
        return "na"
    if metric == "altman_z":
        if value > 2.99:
            return "green"
        if value > 1.81:
            return "amber"
        return "red"
    bands = _THRESHOLDS.get(metric)
    if not bands:
        return "na"
    for ceiling, label in bands:
        if value <= ceiling:
            return label
    return "na"

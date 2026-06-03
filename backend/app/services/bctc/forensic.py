from __future__ import annotations

from typing import Any


def _all_above(series: list[float] | None, threshold: float, n: int = 3) -> bool:
    if not series or len(series) < n:
        return False
    return all(v > threshold for v in series[:n])


def _nonbank(m: dict[str, Any], green: list[str], red: list[str]) -> None:
    if _all_above(m.get("roe_series"), 0.18):
        green.append("ROE bền vững > 18% ba năm")
    if (nde := m.get("net_debt_ebitda")) is not None and nde < 0:
        green.append("Vị thế tiền mặt ròng (Net cash)")
    if (z := m.get("altman_z")) is not None and z > 3.5:
        green.append(f"Tài chính an toàn — Altman Z {z:.2f}")
    if _all_above(m.get("fcf_margin_series"), 0.08):
        green.append("FCF generation bền vững > 8%")
    if (gd := m.get("gross_margin_delta")) is not None and gd > 0.02:
        green.append(f"Biên gộp mở rộng +{gd * 10000:.0f}bp/5N")

    if (z := m.get("altman_z")) is not None and z <= 1.81:
        red.append(f"Altman Z {z:.2f} — vùng cảnh báo phá sản")
    if (nde := m.get("net_debt_ebitda")) is not None and nde > 3:
        red.append(f"Đòn bẩy cao — Net Debt/EBITDA {nde:.1f}x")
    if (dc := m.get("dso_change_2y")) is not None and dc > 0.20:
        red.append(f"DSO tăng {dc * 100:.0f}% trong 2 năm")


def _bank(m: dict[str, Any], green: list[str], red: list[str]) -> None:
    if _all_above(m.get("nim_series"), 0.035):
        green.append("NIM top quartile, bền vững > 3.5%")
    if _all_above(m.get("roe_series"), 0.18):
        green.append("ROE > 18% sustainable")
    if (cir := m.get("cir")) is not None and cir < 0.35:
        green.append("CIR best-in-class < 35%")

    if (ldr := m.get("ldr")) is not None and ldr > 0.85:
        red.append(f"LDR {ldr * 100:.0f}% vượt cap NHNN 85%")
    if (cir := m.get("cir")) is not None and cir > 0.45:
        red.append("CIR cao > 45%")


def forensic_panel(metrics: dict[str, Any]) -> dict[str, list[str]]:
    green: list[str] = []
    red: list[str] = []
    if metrics.get("template") == "B":
        _bank(metrics, green, red)
    else:
        _nonbank(metrics, green, red)
    if not red:
        red.append("Không có cờ đỏ trọng yếu")
    return {"green": green, "red": red}

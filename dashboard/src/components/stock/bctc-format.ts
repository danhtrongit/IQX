export type BctcStatus = "green" | "amber" | "red" | "na"

export function fmtPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—"
  return `${(v * 100).toFixed(digits)}%`
}

export function fmtSignedPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—"
  const pct = v * 100
  const sign = pct < 0 ? "−" : "+"
  return `${sign}${Math.abs(pct).toFixed(digits)}%`
}

export function fmtMultiple(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—"
  const sign = v < 0 ? "−" : ""
  return `${sign}${Math.abs(v).toFixed(digits)}×`
}

export function fmtNumber(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—"
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

// Trio màu trạng thái tài chính theo quy ước IQX (bg/text/border).
export function statusColorClass(status: BctcStatus): string {
  switch (status) {
    case "green": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    case "red": return "bg-red-500/15 text-red-400 border-red-500/30"
    case "amber": return "bg-amber-500/15 text-amber-400 border-amber-500/30"
    default: return "bg-muted/40 text-muted-foreground border-border/30"
  }
}

export function statusLabel(status: BctcStatus): string {
  return { green: "Xanh", amber: "Vàng", red: "Đỏ", na: "N/A" }[status]
}

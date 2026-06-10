import type { BctcStatus } from "./types"

/* ── Generic number formatters (ported from the bak stock components) ─────── */

/** Round + Vietnamese locale separators. */
export function fmtVnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN")
}

/** MSN live price is x1000 (128.8 → 128,800 VND). */
export function fmtPrice(n: number): string {
  if (!n || n <= 0) return "—"
  return (n * 1000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
}

/** Large VND amount → "X nghìn tỷ / X tỷ / X triệu". */
export function fmtBillion(n: number | null | undefined): string {
  if (!n) return "—"
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(0) + " nghìn tỷ"
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + " tỷ"
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + " triệu"
  return fmtVnd(n)
}

/** Ratio value already in fraction units → "X.XX%". */
export function fmtPctFraction(v: number | null | undefined, multiplied = true): string {
  if (v == null) return "—"
  const pct = multiplied ? v * 100 : v
  return pct.toFixed(2) + "%"
}

/** Compact (M/K) for axis ticks. */
export function fmtCompactShort(n: number): string {
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(0) + "M"
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "K"
  return String(n)
}

/** Ratio revenue/profit value (raw VND) → "X tỷ / X tr / X K". */
export function fmtRatioVal(n: number | null | undefined): string {
  if (n == null) return "—"
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " tỷ"
  if (abs >= 1e9) return (n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " tỷ"
  if (abs >= 1e6) return (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " tr"
  if (abs >= 1e3) return (n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 0 }) + "K"
  return fmtVnd(n)
}

/** KBS report cell (raw VND) → tỷ VND with 2 decimals. */
export function fmtReport(v: number | null | undefined): string {
  if (v == null) return "—"
  if (v === 0) return "0"
  const abs = Math.abs(v)
  if (abs >= 1e9) {
    return (v / 1e9).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (abs >= 1e6) {
    return (v / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ── BCTC forensic formatters (ported from bctc-format.ts) ────────────────── */

export function fmtPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—"
  return `${(v * 100).toFixed(digits)}%`
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

/** Trio of Arco-aware status colors for forensic snapshot badges. */
export function statusColors(status: BctcStatus): { bg: string; color: string; border: string } {
  switch (status) {
    case "green":
      return { bg: "rgba(16,185,129,0.15)", color: "#34d399", border: "rgba(16,185,129,0.3)" }
    case "red":
      return { bg: "rgba(239,68,68,0.15)", color: "#f87171", border: "rgba(239,68,68,0.3)" }
    case "amber":
      return { bg: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "rgba(245,158,11,0.3)" }
    default:
      return {
        bg: "var(--color-fill-2)",
        color: "var(--color-text-3)",
        border: "var(--color-border-2)",
      }
  }
}

export function statusLabel(status: BctcStatus): string {
  return { green: "Xanh", amber: "Vàng", red: "Đỏ", na: "N/A" }[status]
}

/* ── AI insight summary-card formatters (ported from -utils.ts) ───────────── */

export interface LayerSummaryItem {
  label: string
  value: string
  color?: string
}

// AI prompt's response keys per layer. Keep in sync with backend ai-insight docs.
const SUMMARY_KEYS: Record<string, string[]> = {
  trend: ["Xu hướng", "Trạng thái", "Hỗ trợ", "Kháng cự"],
  liquidity: ["Cung - Cầu"],
  moneyFlow: ["Khối ngoại", "Tự doanh", "Tác động"],
  insider: ["Nội bộ", "Mức cảnh báo"],
  news: ["Tổng quan", "Tác động"],
}

export function formatSupportResistance(value: unknown): string {
  const raw = String(value ?? "").replace(/\([^)]*\)/g, "").trim()
  const match = raw.match(/[+-]?\d+(?:[.,]\d+)?/)
  if (!match) return raw

  const token = match[0]
  const normalized = token.includes(",")
    ? token.replace(/,/g, "")
    : /\.\d{3}$/.test(token)
      ? token.replace(/\./g, "")
      : token
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) return raw

  return Math.round(numeric).toLocaleString("en-US")
}

export function cleanLayerSummaryValue(layerKey: string, value: unknown, label?: string): string {
  if (value == null) return ""

  if (layerKey === "trend" && (label === "Hỗ trợ" || label === "Kháng cự")) {
    return formatSupportResistance(value)
  }

  let text = String(value).trim()
  if (!text) return ""

  if (layerKey === "moneyFlow") {
    const lower = text.toLowerCase()
    const QUALITATIVE: Array<[RegExp, string]> = [
      [/\bmua\s*ròng\b/, "Mua ròng"],
      [/\bbán\s*ròng\b/, "Bán ròng"],
      [/\bcân\s*bằng\b/, "Cân bằng"],
      [/\btrung\s*lập\b/, "Trung lập"],
      [/\btích\s*cực\b/, "Tích cực"],
      [/\btiêu\s*cực\b/, "Tiêu cực"],
      [/\bhỗ\s*trợ\b/, "Hỗ trợ"],
      [/\báp\s*lực\b/, "Áp lực"],
    ]
    for (const [re, normalized] of QUALITATIVE) {
      if (re.test(lower)) return normalized
    }

    text = text
      .replace(
        /[\s,;:()\-–—]*\(?\s*[+\-−–—]?\d[\d.,\s]*\)?\s*(?:tỷ|tr|triệu|[kK]|%|đ|đồng|VND|phiên|ngày)?\s*\.?\s*/giu,
        " ",
      )
      .replace(/\s{2,}/g, " ")
      .replace(/[\s,;:()\-–—.]+$/u, "")
      .trim()
  }

  return text
}

export function getLayerSummary(
  layerKey: string,
  output: Record<string, unknown> | null | undefined,
): LayerSummaryItem[] {
  if (!output || typeof output !== "object") return []

  const keys = SUMMARY_KEYS[layerKey] ?? Object.keys(output).slice(0, 3)
  return keys
    .filter((key) => output[key] != null && output[key] !== "")
    .map((key) => ({
      label: key,
      value: cleanLayerSummaryValue(layerKey, output[key], key),
      color:
        layerKey === "trend" && key === "Hỗ trợ"
          ? "text-up"
          : layerKey === "trend" && key === "Kháng cự"
            ? "text-down"
            : undefined,
    }))
    .filter((item) => item.value.length > 0)
}

/** moduleNote / hasAnyAi helpers for the BCTC AI overlay. */
export function moduleNote(
  ai: { modules?: Record<string, string> } | null | undefined,
  id: string,
): string {
  return ai?.modules?.[id] ?? ""
}

export function hasAnyAi(
  ai: { memo?: string; modules?: Record<string, string> } | null | undefined,
): boolean {
  if (!ai) return false
  return Boolean(ai.memo?.trim()) || Object.values(ai.modules ?? {}).some((n) => n?.trim())
}

export interface LayerSummaryItem {
  label: string
  value: string
  color?: string
}

const SUMMARY_KEYS: Record<string, string[]> = {
  trend: ["Xu hướng", "Trạng thái", "Hỗ trợ", "Kháng cự"],
  liquidity: ["Cung - Cầu"],
  moneyFlow: ["Khối ngoại", "Tự doanh", "Tác động"],
  insider: ["Giao dịch", "Tác động"],
  news: ["Tin tức", "Tác động"],
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
    // Strip trailing numeric token (handles: " -10", " +432", " (-10)", " -10 tỷ",
    // " 2,5 triệu", ", 10", ": -10", Unicode minus, etc.) — keep only descriptor text
    text = text
      .replace(
        /[\s,;:()\-–—]*\(?\s*[+\-−–—]?\d[\d.,\s]*\)?\s*(?:tỷ|tr|triệu|[kK]|%|đ|đồng|VND)?\s*\.?\s*$/u,
        "",
      )
      // Clean up any dangling punctuation left at end
      .replace(/[\s,;:()\-–—.]+$/u, "")
      .trim()
  }

  return text
}

export function getLayerSummary(layerKey: string, output: Record<string, unknown> | null | undefined): LayerSummaryItem[] {
  if (!output || typeof output !== "object") return []

  const keys = SUMMARY_KEYS[layerKey] ?? Object.keys(output).slice(0, 3)
  return keys
    .filter((key) => output[key] != null && output[key] !== "")
    .map((key) => ({
      label: key,
      value: cleanLayerSummaryValue(layerKey, output[key], key),
      color:
        layerKey === "trend" && key === "Hỗ trợ"
          ? "text-emerald-400"
          : layerKey === "trend" && key === "Kháng cự"
            ? "text-red-400"
            : undefined,
    }))
    .filter((item) => item.value.length > 0)
}

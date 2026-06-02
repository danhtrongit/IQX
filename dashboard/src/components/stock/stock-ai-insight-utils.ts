export interface LayerSummaryItem {
  label: string
  value: string
  color?: string
}

// AI prompt's response keys per layer. Keep in sync with backend/docs/ai/ai-insight.md.
// L4 insider returns "Nội bộ" + "Mức cảnh báo" (not "Giao dịch"/"Tác động").
// L5 news returns "Tổng quan" + "Tác động" (not "Tin tức").
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
    // Lớp 3 ở thẻ tóm tắt chỉ cần hiển thị mô tả định tính (Mua ròng / Bán ròng /
    // Cân bằng / Tích cực / Tiêu cực ...) — bỏ hết số/đơn vị/khoảng thời gian.
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

    // Fallback: strip trailing numeric token (handles: " -10", " +432", " (-10)",
    // " -10 tỷ", " 2,5 triệu", ", 10", ": -10", Unicode minus, etc.) and any
    // numeric token anywhere in the string when no qualitative descriptor found.
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

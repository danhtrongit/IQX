import type { LayerCard } from "@/features/stock/types"

function formatPriceText(text: string): string {
  return text.replace(/\d[\d,.]*/g, (token) => {
    const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(token)
      ? token.replace(/[.,]/g, "")
      : token.replace(/,/g, "")
    const value = Number(normalized)
    return Number.isFinite(value) ? value.toLocaleString("vi-VN") : token
  })
}

/** Keep evidence visible; repeated verdicts and source/diff copy are omitted. */
export function layerReadings(layer: LayerCard): string[] {
  if (layer.layerNum === "L5" && layer.news) {
    return [
      ...layer.news.material.map((item) =>
        `Tin trọng yếu: ${item.title}${item.tag ? ` [${item.tag}]` : ""}${item.subtitle ? ` — ${item.subtitle}` : ""}`,
      ),
      ...layer.news.filler.map((item) =>
        `Tin phụ: ${item.title}${item.tag ? ` [${item.tag}]` : ""}`,
      ),
    ]
  }

  return layer.fields
    .filter((field) => !["Tác động", "Tổng quan"].includes(field.label))
    .flatMap((field) => {
      const value = field.value.map((fragment) => fragment.content).join("")
      if (layer.layerNum === "L5") {
        return value.split(/;\s*|\n+/).filter(Boolean).map((item) => `${field.label}: ${item}`)
      }
      return [`${field.label}: ${["Hỗ trợ", "Kháng cự"].includes(field.label) ? formatPriceText(value) : value}`]
    })
}

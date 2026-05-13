import { describe, expect, it } from "vitest"
import {
  cleanLayerSummaryValue,
  formatSupportResistance,
  getLayerSummary,
} from "../src/components/stock/stock-ai-insight-utils"

describe("stock AI insight summary helpers", () => {
  it("removes strength notes and formats support/resistance with comma thousands", () => {
    expect(formatSupportResistance("22500 (mạnh)")).toBe("22,500")
    expect(formatSupportResistance("23150 (yếu)")).toBe("23,150")
  })

  it("keeps only text for money-flow summary values that end with a number", () => {
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh 40")).toBe("Bán ròng mạnh")
    expect(cleanLayerSummaryValue("moneyFlow", "Mua ròng nhẹ -23")).toBe("Mua ròng nhẹ")
    // Signed ASCII
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh -10")).toBe("Bán ròng mạnh")
    expect(cleanLayerSummaryValue("moneyFlow", "Mua ròng nhẹ +432")).toBe("Mua ròng nhẹ")
    // Unicode minus / dashes
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh −10")).toBe("Bán ròng mạnh")
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh – 10")).toBe("Bán ròng mạnh")
    // With Vietnamese currency units
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh -10 tỷ")).toBe("Bán ròng mạnh")
    expect(cleanLayerSummaryValue("moneyFlow", "Mua ròng 2,5 triệu")).toBe("Mua ròng")
    expect(cleanLayerSummaryValue("moneyFlow", "Mua ròng nhẹ +432K")).toBe("Mua ròng nhẹ")
    // Parenthesised & alternate separators
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh (-10)")).toBe("Bán ròng mạnh")
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh: -10")).toBe("Bán ròng mạnh")
    expect(cleanLayerSummaryValue("moneyFlow", "Bán ròng mạnh, -10")).toBe("Bán ròng mạnh")
    // No number → unchanged
    expect(cleanLayerSummaryValue("moneyFlow", "cảnh báo nhiễu")).toBe("cảnh báo nhiễu")
  })

  it("removes liquidity impact from the layer card summary", () => {
    const items = getLayerSummary("liquidity", {
      "Thanh khoản": "suy yếu",
      "Cung - Cầu": "thanh khoản yếu",
      "Tác động": "khó lượng giao dịch",
    })

    expect(items.map((item) => item.label)).toEqual(["Cung - Cầu"])
  })

  it("colors support green and resistance red in the trend summary", () => {
    const items = getLayerSummary("trend", {
      "Xu hướng": "Giảm",
      "Trạng thái": "Yếu",
      "Hỗ trợ": "22500 (mạnh)",
      "Kháng cự": "23150 (yếu)",
    })

    expect(items).toContainEqual({ label: "Hỗ trợ", value: "22,500", color: "text-emerald-400" })
    expect(items).toContainEqual({ label: "Kháng cự", value: "23,150", color: "text-red-400" })
  })
})

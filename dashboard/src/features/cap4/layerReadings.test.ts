import { describe, expect, it } from "vitest"
import type { LayerCard } from "@/features/stock/types"
import { layerReadings } from "./layerReadings"

function layer(layerNum: LayerCard["layerNum"], fields: [string, string][]): LayerCard {
  return {
    layerNum, layerName: "", statusLabel: "Trung tính", statusLevel: 3,
    fields: fields.map(([label, content]) => ({ label, value: [{ type: "text", content }] })),
    diff: { text: [], hasChange: false },
  }
}

describe("five-layer reading evidence", () => {
  it("keeps resistance and momentum after the third field and formats price levels", () => {
    expect(layerReadings(layer("L1", [
      ["Xu hướng", "Giảm"], ["Trạng thái", "Yếu"], ["Hỗ trợ", "60600 – 60,800"],
      ["Kháng cự", "61.900"], ["Đà giá", "Đang hồi phục"],
    ]))).toEqual([
      "Xu hướng: Giảm", "Trạng thái: Yếu", "Hỗ trợ: 60.600 – 60.800",
      "Kháng cự: 61.900", "Đà giá: Đang hồi phục",
    ])
  })

  it("keeps facts and omits repeated impact verdicts", () => {
    expect(layerReadings(layer("L3", [
      ["Khối ngoại", "Bán ròng"], ["Tự doanh", "Mua ròng"], ["Tác động", "Trung tính"],
    ]))).toEqual(["Khối ngoại: Bán ròng", "Tự doanh: Mua ròng"])
  })

  it("renders every structured news item separately without splitting punctuation in a title", () => {
    const news = layer("L5", [["Tổng quan", "Tích cực"], ["Tin trọng yếu", "old text"]])
    news.news = {
      material: [
        { title: "Kết quả quý; kế hoạch năm", subtitle: "Biên lợi nhuận cải thiện", tag: "KQKD" },
        { title: "Cổ tức", tag: "" },
      ],
      filler: [{ title: "Tin doanh nghiệp", tag: "Khác" }],
    }
    expect(layerReadings(news)).toEqual([
      "Tin trọng yếu: Kết quả quý; kế hoạch năm [KQKD] — Biên lợi nhuận cải thiện",
      "Tin trọng yếu: Cổ tức", "Tin phụ: Tin doanh nghiệp [Khác]",
    ])
  })

  it("splits older cached news fields into separate items", () => {
    expect(layerReadings(layer("L5", [["Tổng quan", "Tích cực"], ["Tin trọng yếu", "Tin A; Tin B"]])))
      .toEqual(["Tin trọng yếu: Tin A", "Tin trọng yếu: Tin B"])
  })
})

import { describe, expect, it } from "vitest"
import { cleanLayerSummaryValue } from "./format"

/**
 * Bảng chuẩn hoá giá trị ĐỊNH TÍNH của lớp dòng tiền.
 *
 * ★★ Hai dòng cuối bảng (`hỗ trợ`, `áp lực`) từng dùng ranh giới ASCII `\b` đứng
 * cạnh chữ có dấu ⇒ KHÔNG BAO GIỜ khớp ⇒ hai giá trị đó chưa từng được chuẩn
 * hoá, im lặng suốt. Không có bài nào canh file này trước đó.
 */
describe("cleanLayerSummaryValue — moneyFlow, giá trị định tính", () => {
  it.each([
    ["mua ròng", "Mua ròng"],
    ["Bán ròng nhẹ", "Bán ròng"],
    ["cân bằng", "Cân bằng"],
    ["trung lập", "Trung lập"],
    ["tích cực", "Tích cực"],
    ["tiêu cực", "Tiêu cực"],
    // ★ hai ca từng chết
    ["hỗ trợ", "Hỗ trợ"],
    ["áp lực", "Áp lực"],
    ["Áp lực bán mạnh", "Áp lực"],
    ["dòng tiền hỗ trợ giá", "Hỗ trợ"],
  ])("«%s» → «%s»", (input, expected) => {
    expect(cleanLayerSummaryValue("moneyFlow", input)).toBe(expected)
  })

  it("★ không bắt oan khi cụm từ nằm TRONG một từ khác", () => {
    // "áp" trong "sáp nhập" / "trợ" trong "hỗ trợn" (giả định) không được nuốt
    // cả câu thành một nhãn định tính.
    expect(cleanLayerSummaryValue("moneyFlow", "sáp lực")).not.toBe("Áp lực")
  })

  it("giá trị KHÔNG định tính vẫn được giữ (chỉ gỡ phần số)", () => {
    expect(cleanLayerSummaryValue("moneyFlow", "khối ngoại rút ròng 12,5 tỷ")).toContain(
      "khối ngoại rút ròng",
    )
  })

  it("null/rỗng → chuỗi rỗng, không bịa nhãn", () => {
    expect(cleanLayerSummaryValue("moneyFlow", null)).toBe("")
    expect(cleanLayerSummaryValue("moneyFlow", "   ")).toBe("")
  })
})

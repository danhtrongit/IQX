import { describe, expect, it } from "vitest"
import { groupSymbolsByIndustry } from "../src/pages/stock-directory-utils"

describe("groupSymbolsByIndustry", () => {
  it("groups active stocks by level-2 industry and excludes indices", () => {
    const groups = groupSymbolsByIndustry([
      { symbol: "VCB", name: "Vietcombank", asset_type: "stock", is_index: false, icb_lv1: "Tài chính", icb_lv2: "Ngân hàng" },
      { symbol: "SSI", name: "SSI", asset_type: "stock", is_index: false, icb_lv1: "Tài chính", icb_lv2: "Chứng khoán" },
      { symbol: "VNINDEX", name: "VN-Index", asset_type: "index", is_index: true, icb_lv1: "", icb_lv2: "" },
    ])

    expect(groups.map((group) => group.name)).toEqual(["Chứng khoán", "Ngân hàng"])
    expect(groups.flatMap((group) => group.items.map((item) => item.symbol))).toEqual(["SSI", "VCB"])
  })
})

import { describe, expect, it } from "vitest"
import {
  netFlowLabel,
  fmtRatioPlain,
  fmtProjectedPrice,
  fmtPct,
} from "../src/components/forecast/forecast-format"

describe("netFlowLabel", () => {
  it("rút gọn về 'Mua ròng' khi giá trị chứa 'mua'", () => {
    expect(netFlowLabel("Khối ngoại mua ròng 1.2 tỷ")).toBe("Mua ròng")
    expect(netFlowLabel("Mua ròng")).toBe("Mua ròng")
  })
  it("rút gọn về 'Bán ròng' khi giá trị chứa 'bán'", () => {
    expect(netFlowLabel("Tự doanh bán ròng 500 triệu")).toBe("Bán ròng")
  })
  it("trả 'Cân bằng' cho trường hợp trung tính", () => {
    expect(netFlowLabel("Cân bằng")).toBe("Cân bằng")
    expect(netFlowLabel("trung lập")).toBe("Cân bằng")
  })
  it("trả '—' cho giá trị rỗng", () => {
    expect(netFlowLabel("")).toBe("—")
    expect(netFlowLabel(null)).toBe("—")
  })
})

describe("fmtRatioPlain", () => {
  it("không thêm hậu tố 'x'", () => {
    expect(fmtRatioPlain(15.2)).toBe("15.20")
    expect(fmtRatioPlain(0)).toBe("0.00")
  })
  it("trả '—' cho giá trị không hợp lệ", () => {
    expect(fmtRatioPlain(null)).toBe("—")
    expect(fmtRatioPlain(undefined)).toBe("—")
  })
})

describe("fmtProjectedPrice", () => {
  it("chia 1000 và để 2 chữ số thập phân", () => {
    expect(fmtProjectedPrice(45200)).toBe("45.20")
  })
  it("trả '—' cho <=0 hoặc null", () => {
    expect(fmtProjectedPrice(0)).toBe("—")
    expect(fmtProjectedPrice(null)).toBe("—")
  })
})

describe("fmtPct", () => {
  it("định dạng phần trăm có dấu", () => {
    expect(fmtPct(0.042, true)).toBe("+4.2%")
    expect(fmtPct(-0.031, true)).toBe("-3.1%")
  })
  it("trả '—' cho null", () => {
    expect(fmtPct(null)).toBe("—")
  })
})

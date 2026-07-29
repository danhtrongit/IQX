import { describe, expect, it } from "vitest"
import { coachTemplateCap1, pickCoachLetterCap1 } from "./coachTemplateCap1"

describe("pickCoachLetterCap1 (spec §6 table — priority)", () => {
  it("A — lãi, trạng thái lúc đặt ✅ Ủng hộ, holding period bình thường", () => {
    expect(
      pickCoachLetterCap1({ pnlPositive: true, trangThaiLucDat: "ung_ho", soPhienGiu: 5 }),
    ).toBe("A")
  })

  it("B — lãi, trạng thái ⚪ Trung tính", () => {
    expect(
      pickCoachLetterCap1({ pnlPositive: true, trangThaiLucDat: "trung_tinh", soPhienGiu: 5 }),
    ).toBe("B")
  })

  it("B — lãi, trạng thái ⚠ Cần chú ý", () => {
    expect(
      pickCoachLetterCap1({ pnlPositive: true, trangThaiLucDat: "can_chu_y", soPhienGiu: 5 }),
    ).toBe("B")
  })

  it("C — lỗ, trạng thái ✅ Ủng hộ", () => {
    expect(
      pickCoachLetterCap1({ pnlPositive: false, trangThaiLucDat: "ung_ho", soPhienGiu: 5 }),
    ).toBe("C")
  })

  it("D — lỗ, trạng thái ❌ Ngược chiều", () => {
    expect(
      pickCoachLetterCap1({ pnlPositive: false, trangThaiLucDat: "nguoc_chieu", soPhienGiu: 5 }),
    ).toBe("D")
  })

  it("E — giữ quá lâu (>10 phiên) takes priority over the lãi/lỗ×trạng-thái grid", () => {
    expect(
      pickCoachLetterCap1({ pnlPositive: true, trangThaiLucDat: "ung_ho", soPhienGiu: 11 }),
    ).toBe("E")
  })

  it("F — bán vội (<1 phiên) takes priority over the lãi/lỗ×trạng-thái grid", () => {
    expect(
      pickCoachLetterCap1({ pnlPositive: false, trangThaiLucDat: "nguoc_chieu", soPhienGiu: 0 }),
    ).toBe("F")
  })
})

describe("coachTemplateCap1 (verbatim spec §6 templates, placeholders filled)", () => {
  const base = { pnlPct: 8.2, lyDo: "dong_tien" as const, soPhienGiu: 5, emotion: null }

  it("A", () => {
    const text = coachTemplateCap1(
      { pnlPositive: true, trangThaiLucDat: "ung_ho", soPhienGiu: 5 },
      base,
    )
    expect(text).toContain("Lệnh lãi +8.2%")
    expect(text).toContain("💰 Dòng tiền")
    expect(text).toContain("✅ Ủng hộ")
    expect(text).toContain("Ghi lại như mẫu chuẩn")
  })

  it("B", () => {
    const text = coachTemplateCap1(
      { pnlPositive: true, trangThaiLucDat: "trung_tinh", soPhienGiu: 5 },
      base,
    )
    expect(text).toContain("Lệnh lãi +8.2%")
    expect(text).toContain("chỉ ⚪ Trung tính")
    expect(text).toContain("Thử ưu tiên lệnh có lý do ✅ Ủng hộ")
  })

  it("C", () => {
    const text = coachTemplateCap1(
      { pnlPositive: false, trangThaiLucDat: "ung_ho", soPhienGiu: 5 },
      { ...base, pnlPct: -4.1 },
    )
    expect(text).toContain("Lệnh lỗ −4.1%")
    expect(text).toContain("✅ Ủng hộ")
    expect(text).toContain("Đây không phải lỗi chọn lý do")
  })

  it("D", () => {
    const text = coachTemplateCap1(
      { pnlPositive: false, trangThaiLucDat: "nguoc_chieu", soPhienGiu: 5 },
      { ...base, pnlPct: -9.5 },
    )
    expect(text).toContain("Lệnh lỗ −9.5%")
    expect(text).toContain("❌ Ngược chiều")
    expect(text).toContain("thị trường thường đúng")
  })

  it("E includes the holding-session count", () => {
    const text = coachTemplateCap1(
      { pnlPositive: true, trangThaiLucDat: "ung_ho", soPhienGiu: 14 },
      { ...base, soPhienGiu: 14 },
    )
    expect(text).toContain("Bạn giữ lệnh 14 phiên")
    expect(text).toContain("Cấp 2")
  })

  it("F includes the session count and the chosen emotion", () => {
    const text = coachTemplateCap1(
      { pnlPositive: false, trangThaiLucDat: "nguoc_chieu", soPhienGiu: 0 },
      { ...base, soPhienGiu: 0, emotion: "so" },
    )
    expect(text).toContain("Bạn bán chỉ sau 0 phiên")
    expect(text).toContain("😰 Sợ")
  })
})

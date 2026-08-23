import { describe, expect, it } from "vitest"
import {
  CAP5_LOP_CHIN,
  pickCoachCap5,
  splitEmphasis,
  type CoachSituationCap5,
} from "./coachTemplateCap5"

function sit(overrides: Partial<CoachSituationCap5> = {}): CoachSituationCap5 {
  return {
    huntFilter: "ngoai",
    huntSoPhienCho: 2,
    huntSoLopLucVao: 4,
    pnlPct: 5.3,
    ...overrides,
  }
}

describe("pickCoachCap5 — coach săn mã", () => {
  it("★★ mã KHÔNG đến từ săn ⇒ nói thẳng, TUYỆT ĐỐI không bịa tên bộ lọc", () => {
    const r = pickCoachCap5(sit({ huntFilter: null }))
    expect(r.id).toBe("khong_san")
    expect(r.text).toContain("KHÔNG đến từ săn mã")
    for (const ten of ["Khối ngoại gom", "Tự doanh gom", "Khối lượng đột biến", "Vượt đỉnh"]) {
      expect(r.text).not.toContain(ten)
    }
    expect(r.canhBao).toBe(false)
  })

  it("chờ đủ lớp mới vào ⇒ mẫu chuẩn mực theo mockup", () => {
    const r = pickCoachCap5(sit())
    expect(r.id).toBe("san_cho_chin")
    expect(r.text).toContain("«Khối ngoại gom»")
    expect(r.text).toContain("4/5 lớp ủng hộ")
    expect(r.text).toContain("2 phiên chờ trong Watchlist")
    expect(r.text).toContain("săn rồi sàng, không mua vội")
    expect(r.canhBao).toBe(false)
  })

  it("★★ chưa chấm được 5 lớp ⇒ CHƯA BIẾT, không được đọc thành 0 lớp / vào sớm", () => {
    const r = pickCoachCap5(sit({ huntSoLopLucVao: null }))
    expect(r.id).toBe("san_chua_ro_lop")
    expect(r.text).toContain("chưa chấm được")
    expect(r.text).not.toContain("0/5")
    expect(r.canhBao).toBe(false)
  })

  it("vào lệnh khi mã chưa chín ⇒ CẢNH BÁO, nói đúng số lớp thật", () => {
    const r = pickCoachCap5(sit({ huntSoLopLucVao: 2 }))
    expect(r.id).toBe("san_vao_som")
    expect(r.canhBao).toBe(true)
    expect(r.text).toContain("2/5 lớp ủng hộ")
    expect(r.text).toContain(`${CAP5_LOP_CHIN}/5`)
  })

  it("không đo được số phiên chờ ⇒ bỏ hẳn vế đó, không in «0 phiên»", () => {
    const r = pickCoachCap5(sit({ huntSoPhienCho: null }))
    expect(r.text).not.toContain("phiên chờ")
    expect(r.text).not.toContain("0 phiên")
  })

  it("chờ 0 phiên là một sự thật khác hẳn «không đo được»", () => {
    const r = pickCoachCap5(sit({ huntSoPhienCho: 0 }))
    expect(r.text).toContain("ngay trong phiên đưa mã vào Watchlist")
  })

  it("mọi cụm nhấn mạnh đều có mặt nguyên văn trong câu", () => {
    for (const s of [
      sit(),
      sit({ huntFilter: null }),
      sit({ huntSoLopLucVao: null }),
      sit({ huntSoLopLucVao: 1 }),
    ]) {
      const r = pickCoachCap5(s)
      for (const cum of r.nhanManh) expect(r.text).toContain(cum)
    }
  })

  it("số en-US: lãi/lỗ dùng dấu chấm thập phân + dấu trừ typographic", () => {
    expect(pickCoachCap5(sit({ pnlPct: 5.34 })).text).toContain("+5.3%")
    expect(pickCoachCap5(sit({ pnlPct: -4.21 })).text).toContain("−4.2%")
    expect(pickCoachCap5(sit({ pnlPct: 0 })).text).toContain("0.0%")
  })
})

describe("splitEmphasis", () => {
  it("ghép lại đúng câu gốc và in đậm đúng cụm", () => {
    const parts = splitEmphasis("a bold c", ["bold"])
    expect(parts.map((p) => p.text).join("")).toBe("a bold c")
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual(["bold"])
  })

  it("cụm không xuất hiện thì không làm mất chữ", () => {
    const parts = splitEmphasis("abc", ["zzz"])
    expect(parts).toEqual([{ text: "abc", strong: false }])
  })
})

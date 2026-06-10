import { describe, expect, it } from "vitest"
import { fmtCompact, fmtDate, fmtDateTime, fmtRelative, fmtVnd, slugify } from "./format"

describe("format helpers", () => {
  it("formats Vietnamese currency without decimals", () => {
    expect(fmtVnd(1250000)).toBe("1.250.000 ₫")
  })

  it("formats compact numbers for dense admin tables", () => {
    expect(fmtCompact(15320)).toBe("15,3 N")
  })

  it("formats dates and date times in vi locale", () => {
    expect(fmtDate("2026-06-10T08:30:00Z")).toMatch(/^10\/06\/2026$/)
    expect(fmtDateTime("2026-06-10T08:30:00Z")).toContain("10/06/2026")
  })

  it("returns relative labels for recent timestamps", () => {
    expect(fmtRelative(new Date().toISOString())).toBe("vừa xong")
  })

  it("slugifies Vietnamese course titles", () => {
    expect(slugify("Đầu tư Cổ Phiếu: Cơ bản!")).toBe("dau-tu-co-phieu-co-ban")
  })
})

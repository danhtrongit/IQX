import { describe, expect, it } from "vitest"
import { formatFilter, formatPercent, formatReason, formatVnd, toFiniteNumber } from "./format"

describe("Bot format", () => {
  it("không biến dữ liệu thiếu thành 0", () => {
    expect(toFiniteNumber(null)).toBeNull()
    expect(formatVnd(null)).toBe("—")
    expect(formatPercent(null)).toBe("—")
  })

  it("hiển thị đúng alias bộ lọc và reason canonical", () => {
    expect(formatFilter("ngoai")).toBe("Khối ngoại gom")
    expect(formatReason("missing_veto_severity", null)).toContain("Tin tức/Nội bộ")
    expect(formatReason("new_backend_reason", "Chi tiết từ backend")).toBe("Chi tiết từ backend")
  })
})
